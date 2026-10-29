import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPair,exportJWK,createLocalJWKSet,SignJWT } from 'jose';
import { applyMutation } from '../functions/lib/records.js';
import { authenticate,verifyIdentity } from '../functions/lib/auth.js';
import { onRequest } from '../functions/api/[[path]].js';
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_records.sql',import.meta.url),'utf8'));const prepare=sql=>({bind(...args){return {sql,args,all:async()=>({results:sqlite.prepare(sql).all(...args)})};}});return {sqlite,prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>({results:sqlite.prepare(s.sql).all(...s.args)}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
const mutation=(id='operation-0001',version=0,ml=250)=>({operationId:id,expectedVersion:version,record:{id:'water-1',type:'water',date:'2026-10-29',data:{ml},deleted:false}});
test('writes are idempotent and stale edits return the cloud version',async()=>{
  const db=database();const a=await applyMutation(db,'a@example.test',mutation());assert.equal(a.version,1);
  const retry=await applyMutation(db,'a@example.test',mutation());assert.equal(retry.version,1);
  const b=await applyMutation(db,'a@example.test',mutation('operation-0002',1,500));assert.equal(b.version,2);
  const conflict=await applyMutation(db,'a@example.test',mutation('operation-0003',1,750));assert.equal(conflict.conflict,true);assert.equal(conflict.current.data.ml,500);
  const oldRetry=await applyMutation(db,'a@example.test',mutation());assert.equal(oldRetry.version,1);assert.equal(oldRetry.current.version,2);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n,2);
});
test('same operation cannot be reused with different values',async()=>{
  const db=database();await applyMutation(db,'a',mutation());
  await assert.rejects(()=>applyMutation(db,'a',mutation('operation-0001',0,800)),e=>e.status===409);
});
test('users are isolated and deletions retain a versioned tombstone',async()=>{
  const db=database();await applyMutation(db,'a',mutation());
  const b=await applyMutation(db,'b',mutation('operation-0001',0,1000));assert.equal(b.current.data.ml,1000);
  const del=mutation('operation-0002',1);del.record.deleted=true;
  assert.equal((await applyMutation(db,'a',del)).current.deleted,true);
  assert.equal((await applyMutation(db,'b',mutation('operation-0002',0))).conflict,true);
});
test('stale edit of missing record does not create a new record',async()=>{
  const result=await applyMutation(database(),'a',mutation('operation-0001',3));assert.equal(result.conflict,true);assert.equal(result.current,null);
});
test('production auth fails closed; local bypass never applies to hosted origins',async()=>{
  await assert.rejects(()=>authenticate(new Request('https://app.pages.dev/api/session'),{}),e=>e.status===503);
  await assert.rejects(()=>authenticate(new Request('https://app.pages.dev/api/session'),{DEV_USER_EMAIL:'test@example.test'}),e=>e.status===503);
  assert.equal((await authenticate(new Request('http://127.0.0.1/api/session'),{DEV_USER_EMAIL:'test@example.test'})).local,true);
});
test('Access verification checks signature, issuer, audience, expiration and owner',async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test';
  const jwks=createLocalJWKSet({keys:[jwk]});const env={ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',ACCESS_AUD:'app-aud',ALLOWED_EMAIL:'owner@example.test'};
  const sign=(props={})=>new SignJWT({email:'owner@example.test',...props}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('subject').setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(env.ACCESS_AUD).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  assert.equal((await verifyIdentity(await sign(),jwks,env)).email,env.ALLOWED_EMAIL);
  await assert.rejects(()=>verifyIdentity(sign(),jwks,env));
  await assert.rejects(async()=>verifyIdentity(await sign({email:'other@example.test'}),jwks,env));
  await assert.rejects(async()=>verifyIdentity(await sign(),jwks,{...env,ACCESS_AUD:'wrong-app'}));
  await assert.rejects(async()=>verifyIdentity(await sign(),jwks,{...env,ACCESS_TEAM_DOMAIN:'https://other.cloudflareaccess.com'}));
  const expired=await new SignJWT({email:env.ALLOWED_EMAIL}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('s').setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(env.ACCESS_AUD).setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  await assert.rejects(()=>verifyIdentity(expired,jwks,env));
  const parts=(await sign()).split('.');parts[1]=Buffer.from(JSON.stringify({email:'other@example.test'})).toString('base64url');
  await assert.rejects(()=>verifyIdentity(parts.join('.'),jwks,env));
});
test('API rejects cross-origin writes, malformed data and unauthorized access',async()=>{
  const env={DB:database(),DEV_USER_EMAIL:'owner@example.test'},base='http://localhost';
  const post=body=>new Request(`${base}/api/mutations`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body});
  const badOrigin=new Request(`${base}/api/mutations`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:JSON.stringify(mutation())});
  assert.equal((await onRequest({request:badOrigin,env})).status,403);
  assert.equal((await onRequest({request:post('{'),env})).status,400);
  assert.equal((await onRequest({request:post(JSON.stringify(mutation())),env})).status,200);
  const response=await onRequest({request:new Request(`${base}/api/records`),env});
  assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal((await response.json()).records.length,1);
  const prod=await onRequest({request:new Request('https://private.pages.dev/api/records'),env});assert.equal(prod.status,503);
});
