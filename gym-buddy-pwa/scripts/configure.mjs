import { readFile,writeFile } from 'node:fs/promises';
const args=Object.fromEntries(Array.from({length:Math.floor((process.argv.length-2)/2)},(_,i)=>[process.argv[2+i*2].replace(/^--/,''),process.argv[3+i*2]]));
let saved={};try{saved=JSON.parse(await readFile('.private/deployment.json','utf8'));}catch{}
const id=args['database-id'],team=args['team-domain']?.replace(/\/$/,''),aud=args.aud,email=args.email||saved.allowedEmail;
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||id==='00000000-0000-0000-0000-000000000000'||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team||'')||!aud||aud.length>256||!/^\S+@\S+\.\S+$/.test(email||'')){
  console.error('Usage: npm run configure -- --database-id REAL_D1_UUID --team-domain https://YOUR-TEAM.cloudflareaccess.com --aud YOUR_ACCESS_AUD --email YOUR_EMAIL\nEmail may be omitted when .private/deployment.json already contains allowedEmail.');process.exit(1);
}
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
config.d1_databases[0].database_id=id;
config.vars={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud,ALLOWED_EMAIL:email.toLowerCase()};
await writeFile('wrangler.production.json',JSON.stringify(config,null,2)+'\n');
console.log('Prepared wrangler.production.json with your database and private sign-in settings. This file is ignored by Git.');
