import { validateRecord } from '../../public/domain.js';
import { HttpError } from './auth.js';
export function decodeRow(row) {
  return row?{id:row.id,type:row.type,date:row.date,data:JSON.parse(row.payload),version:row.version,deleted:!!row.deleted,updatedAt:row.updated_at}:null;
}
export async function applyMutation(db,user,mutation) {
  const {operationId,expectedVersion,record}=mutation||{};
  if(typeof operationId!=='string' || !/^[A-Za-z0-9_-]{10,80}$/.test(operationId) || !Number.isInteger(expectedVersion) || expectedVersion<0 || expectedVersion>10000000) throw new HttpError(400,'Invalid mutation.');
  try { validateRecord(record); } catch(e) { throw new HttpError(400,e.message); }
  if(record.deleted!==undefined && typeof record.deleted!=='boolean') throw new HttpError(400,'Invalid deletion flag.');
  if(record.type==='profile' && record.deleted) throw new HttpError(400,'The profile cannot be deleted.');
  const encoded=JSON.stringify({expectedVersion,record:{id:record.id,type:record.type,date:record.date,data:record.data,deleted:!!record.deleted}});
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encoded));
  const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const now=new Date().toISOString();
  // Conditional writes + receipts run in one D1 transaction. The triggers issue
  // a receipt only for a successful write. Replaying a request is a no-op.
  const results=await db.batch([
    db.prepare(`INSERT INTO records(user_id,id,type,date,payload,version,deleted,updated_at,operation_id,operation_hash)
      SELECT ?,?,?,?,?,1,?,?,?,? WHERE ?=0 AND NOT EXISTS (SELECT 1 FROM operations WHERE user_id=? AND operation_id=?)
      ON CONFLICT(user_id,id) DO UPDATE SET date=excluded.date,payload=excluded.payload,version=records.version+1,
      deleted=excluded.deleted,updated_at=excluded.updated_at,operation_id=excluded.operation_id,operation_hash=excluded.operation_hash
      WHERE records.version=? AND records.type=excluded.type AND NOT EXISTS(SELECT 1 FROM operations WHERE user_id=? AND operation_id=?)`)
      .bind(user,record.id,record.type,record.date,JSON.stringify(record.data),record.deleted?1:0,now,operationId,hash,expectedVersion,user,operationId,expectedVersion,user,operationId),
    // Existing records need an UPDATE when expectedVersion > 0, since the
    // INSERT SELECT guard intentionally excludes creation from a stale edit.
    db.prepare(`UPDATE records SET date=?,payload=?,version=version+1,deleted=?,updated_at=?,operation_id=?,operation_hash=?
      WHERE user_id=? AND id=? AND type=? AND version=? AND ?>0
      AND NOT EXISTS(SELECT 1 FROM operations WHERE user_id=? AND operation_id=?)`)
      .bind(record.date,JSON.stringify(record.data),record.deleted?1:0,now,operationId,hash,user,record.id,record.type,expectedVersion,expectedVersion,user,operationId),
    db.prepare('SELECT * FROM operations WHERE user_id=? AND operation_id=?').bind(user,operationId),
    db.prepare('SELECT * FROM records WHERE user_id=? AND id=?').bind(user,record.id)
  ]);
  const receipt=results[2].results[0], current=decodeRow(results[3].results[0]);
  if(receipt && (receipt.operation_hash!==hash || receipt.record_id!==record.id)) throw new HttpError(409,'This operation ID belongs to a different request.');
  if(!receipt) return {conflict:true,current};
  return {conflict:false,version:receipt.version,current};
}
