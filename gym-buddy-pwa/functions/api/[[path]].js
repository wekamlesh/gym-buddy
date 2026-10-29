import { authenticate, HttpError } from '../lib/auth.js';
import { applyMutation, decodeRow } from '../lib/records.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Vary':'Cookie, Cf-Access-Jwt-Assertion'}});
export async function onRequest({request,env}) {
  try {
    const user=await authenticate(request,env), url=new URL(request.url);
    if(url.pathname==='/api/session' && request.method==='GET') return json({email:user.email,local:user.local,database:!!env.DB});
    if(!env.DB) throw new HttpError(503,'Cloud storage is not connected. Bind the D1 database as DB.');
    // Read from primary to avoid stale reads after a write on another device.
    const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
    if(url.pathname==='/api/records' && request.method==='GET') {
      const cursor=url.searchParams.get('cursor')||'';
      if(cursor.length>80) throw new HttpError(400,'Invalid cursor.');
      const result=await db.prepare('SELECT * FROM records WHERE user_id=? AND id>? ORDER BY id LIMIT 501').bind(user.email,cursor).all();
      const rows=result.results.slice(0,500);
      return json({records:rows.map(decodeRow),nextCursor:result.results.length>500?rows.at(-1).id:null});
    }
    if(url.pathname==='/api/mutations' && request.method==='POST') {
      if(request.headers.get('Origin')!==url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(403,'Only same-origin JSON requests are accepted.');
      const raw=await request.text();
      if(raw.length>18000) throw new HttpError(413,'Entry is too large.');
      let body; try{body=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON.');}
      const result=await applyMutation(db,user.email,body);
      return json(result,result.conflict?409:200);
    }
    throw new HttpError(404,'Endpoint not found.');
  } catch(e) {
    // Do not return SQL, request data, tokens or internal exceptions.
    return json({error:e instanceof HttpError?e.message:'Cloud storage could not complete the request. Please retry.'},e instanceof HttpError?e.status:500);
  }
}
