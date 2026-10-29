// Portable local development server. The API uses the same production handlers;
// SQLite adapts the D1 interface. This bypass is restricted to loopback origins.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { onRequest } from '../functions/api/[[path]].js';
import { readInitialProfile,initializeLocalProfile } from './profile.mjs';
await mkdir('.private',{recursive:true});
const testMode=process.env.GYM_BUDDY_TEST_MODE==='1';
const sqlite=new DatabaseSync(testMode?'.private/browser-tests.sqlite':'.private/gym-buddy.sqlite');
sqlite.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()){
  if(sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
  sqlite.exec('BEGIN');try{sqlite.exec(await readFile(`migrations/${name}`,'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
}
const DB={
  prepare(sql){return {bind(...args){return {sql,args,all:async()=>({results:sqlite.prepare(sql).all(...args)})};}};},
  async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>({results:sqlite.prepare(s.sql).all(...s.args)}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}},
  withSession(){return this;}
};
let email='local@example.test';
if(!testMode){
  try{email=JSON.parse(await readFile('.private/deployment.json','utf8')).allowedEmail||email;}catch{}
}
const initialProfile=await readInitialProfile(testMode?'tests/fixtures/profile.json':'.private/dexa-baseline.json');
await initializeLocalProfile(DB,email.toLowerCase(),initialProfile);
const root=resolve('dist'), port=Number(process.env.PORT||8788);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  try{
    const origin=`http://127.0.0.1:${port}`,url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){res.writeHead(413);res.end();return;}}
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}: {})});
      const response=await onRequest({request,env:{DB,DEV_USER_EMAIL:email}});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),path=resolve(root,`.${pathname}`);
    if(!path.startsWith(root+sep))throw new Error('Invalid path');
    const content=await readFile(path),ext=path.slice(path.lastIndexOf('.'));
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Gym Buddy local preview: http://127.0.0.1:${port}\nLocal SQLite database only. This is not a cloud deployment.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{sqlite.close();process.exit(0);}));
