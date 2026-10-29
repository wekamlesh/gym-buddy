import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
let config;
try{config=JSON.parse(await readFile('wrangler.production.json','utf8'));}catch{console.error('Configure production first: see DEPLOY.md and npm run configure.');process.exit(1);}
if(!config.vars?.ACCESS_TEAM_DOMAIN||!config.vars?.ACCESS_AUD||!config.vars?.ALLOWED_EMAIL||config.vars.DEV_USER_EMAIL||config.d1_databases?.[0]?.database_id==='00000000-0000-0000-0000-000000000000'){
  console.error('Production database and private sign-in must be configured. Local authentication cannot be deployed.');process.exit(1);
}
// Initialize the private profile before publishing. A repeat deployment never
// overwrites an existing profile, and no scan values enter the static bundle.
const seed=spawnSync(process.execPath,['scripts/seed-profile.mjs','--remote'],{stdio:'inherit'});
if(seed.status!==0)process.exit(seed.status??1);
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','pages','deploy','dist','--config','wrangler.production.json','--project-name',config.name],{stdio:'inherit'});
process.exit(result.status??1);
