import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateRecord,OWNER_NAME } from '../public/domain.js';
import { applyMutation } from '../functions/lib/records.js';

// Report values are read only by server/deployment tooling, never the public build.
export async function readInitialProfile(path='.private/dexa-baseline.json') {
  let backup;
  try { backup=JSON.parse(await readFile(path,'utf8')); }
  catch { throw new Error('Private DEXA baseline is unavailable. Restore .private/dexa-baseline.json before initializing this personal app.'); }
  const source=backup.records?.find(record=>record.type==='profile'&&record.id==='profile'&&!record.deleted);
  if(!source)throw new Error('The private baseline must contain a profile.');
  const record={id:'profile',type:'profile',date:source.date,data:{...source.data,name:OWNER_NAME},deleted:false};
  validateRecord(record);
  return record;
}

export async function initializeLocalProfile(db,email,record) {
  const existing=await db.prepare('SELECT * FROM records WHERE user_id=? AND id=?').bind(email,'profile').all();
  if(existing.results.length){
    const row=existing.results[0],data=JSON.parse(row.payload);
    if(data.name!==OWNER_NAME)await applyMutation(db,email,{operationId:`owner-name-tenzo-${row.version}`,expectedVersion:row.version,record:{id:'profile',type:'profile',date:row.date,data:{...data,name:OWNER_NAME},deleted:false}});
    return false;
  }
  const result=await applyMutation(db,email,{operationId:'bootstrap-profile-v1',expectedVersion:0,record});
  return !result.conflict;
}

export function profileSeedSQL(email,record) {
  validateRecord(record);
  if(record.id!=='profile'||record.type!=='profile'||record.deleted)throw new Error('Only a live profile can initialize an account.');
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Configure the owner email before initializing the profile.');
  const quote=value=>`'${String(value).replace(/'/g,"''")}'`;
  const canonical=JSON.stringify({expectedVersion:0,record:{id:record.id,type:record.type,date:record.date,data:record.data,deleted:false}});
  const hash=createHash('sha256').update(canonical).digest('hex');
  // Conditional insertion preserves existing profiles. The migration's receipt
  // trigger runs in the same statement; retries never reset measurements/goals.
  return `INSERT INTO records (user_id,id,type,date,payload,version,deleted,updated_at,operation_id,operation_hash)
SELECT ${quote(email)},'profile','profile',${quote(record.date)},${quote(JSON.stringify(record.data))},1,0,${quote(new Date().toISOString())},'bootstrap-profile-v1',${quote(hash)}
WHERE NOT EXISTS (SELECT 1 FROM records WHERE user_id=${quote(email)} AND id='profile');\n`;
}
