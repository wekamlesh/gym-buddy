import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { readInitialProfile,initializeLocalProfile,profileSeedSQL } from '../scripts/profile.mjs';

function database(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_records.sql',import.meta.url),'utf8'));
  return {sqlite,prepare(sql){return {bind(...args){return {sql,args,all:async()=>({results:sqlite.prepare(sql).all(...args)})};}};},async batch(statements){sqlite.exec('BEGIN');try{const rows=statements.map(s=>({results:sqlite.prepare(s.sql).all(...s.args)}));sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
test('initial baseline is validated and loaded without a registration form',async()=>{
  const record=await readInitialProfile(new URL('fixtures/profile.json',import.meta.url));
  assert.equal(record.type,'profile');assert.equal(record.data.initialWeight,80);assert.equal(record.data.name,'Tenzo');
  const db=database();assert.equal(await initializeLocalProfile(db,'owner@example.test',record),true);
  const row=db.sqlite.prepare("SELECT payload FROM records WHERE user_id=? AND id='profile'").get('owner@example.test');
  assert.equal(JSON.parse(row.payload).height,180);assert.equal(JSON.parse(row.payload).workoutTime,'11:00');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM operations').get().count,1);
});
test('restarting does not reset edited goals, measurements or record versions',async()=>{
  const record=await readInitialProfile(new URL('fixtures/profile.json',import.meta.url)),db=database();
  await initializeLocalProfile(db,'owner@example.test',record);
  const changed={...record,data:{...record.data,goalWeight:75,proteinTarget:130}};
  assert.equal(await initializeLocalProfile(db,'owner@example.test',changed),false);
  const row=db.sqlite.prepare("SELECT payload,version FROM records WHERE id='profile'").get();
  assert.equal(JSON.parse(row.payload).goalWeight,76);assert.equal(row.version,1);
});
test('production seed SQL safely quotes data and is idempotent',async()=>{
  const record=await readInitialProfile(new URL('fixtures/profile.json',import.meta.url)),db=database();
  record.data.name="Test O'Walker";
  const sql=profileSeedSQL('owner@example.test',record);
  db.sqlite.exec(sql);db.sqlite.exec(sql);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM records').get().count,1);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM operations').get().count,1);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT payload FROM records').get().payload).name,"Test O'Walker");
  record.data.initialWeight=78;db.sqlite.exec(profileSeedSQL('owner@example.test',record));
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT payload FROM records').get().payload).initialWeight,80);
});
test('missing private report and invalid owner fail clearly without asking for statistics',async()=>{
  await assert.rejects(()=>readInitialProfile('.private/nonexistent-report.json'),/Private DEXA baseline is unavailable/);
  const record=await readInitialProfile(new URL('fixtures/profile.json',import.meta.url));
  assert.throws(()=>profileSeedSQL('not-an-email',record),/owner email/);
});
