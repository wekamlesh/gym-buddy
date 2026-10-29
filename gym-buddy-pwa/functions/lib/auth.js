import { createRemoteJWKSet, jwtVerify } from 'jose';
const keysets = new Map();
export class HttpError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
export async function verifyIdentity(token,keyset,env) {
  const {payload}=await jwtVerify(token,keyset,{issuer:env.ACCESS_TEAM_DOMAIN.replace(/\/$/,''),audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
  if(typeof payload.email!=='string'||payload.email.toLowerCase()!==env.ALLOWED_EMAIL.trim().toLowerCase())throw new Error('Not allowed');
  return {email:payload.email.toLowerCase(),local:false};
}
export async function authenticate(request, env) {
  const url = new URL(request.url);
  if(['localhost','127.0.0.1','[::1]'].includes(url.hostname) && env.DEV_USER_EMAIL) {
    return {email:env.DEV_USER_EMAIL.toLowerCase(),local:true};
  }
  const domain=env.ACCESS_TEAM_DOMAIN?.replace(/\/$/,'');
  if(!domain || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) throw new HttpError(503,'Private sign-in is not configured. Complete the Cloudflare Access setup.');
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token) throw new HttpError(401,'Sign in to your private tracker.');
  try {
    if(!keysets.has(domain)) keysets.set(domain,createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`)));
    return await verifyIdentity(token,keysets.get(domain),env);
  } catch { throw new HttpError(401,'Your sign-in expired or is not authorized. Sign in again.'); }
}
