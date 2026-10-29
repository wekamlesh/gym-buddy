import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { readInitialProfile,profileSeedSQL } from './profile.mjs';
if(!process.argv.includes('--remote')){
  console.error('Use --remote to initialize the configured D1 database. Local development initializes its profile automatically.');process.exit(1);
}
let config;
try{config=JSON.parse(await readFile('wrangler.production.json','utf8'));}
catch{console.error('Configure production before initializing its profile. See DEPLOY.md.');process.exit(1);}
try{
  const record=await readInitialProfile(),email=config.vars?.ALLOWED_EMAIL?.trim().toLowerCase();
  const database=config.d1_databases?.find(binding=>binding.binding==='DB');
  if(!database||database.database_id==='00000000-0000-0000-0000-000000000000')throw new Error('A real D1 database must be configured.');
  const sql=profileSeedSQL(email,record);
  await mkdir('.private',{recursive:true});await writeFile('.private/profile-seed.sql',sql,{mode:0o600});
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute',database.database_name,'--remote','--config','wrangler.production.json','--file','.private/profile-seed.sql'],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
  console.log('Private baseline initialization complete. Existing profiles were preserved.');
}catch(error){console.error(error.message);process.exit(1);}
