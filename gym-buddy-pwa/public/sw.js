const CACHE='gym-buddy-__BUILD__';
const SHELL=['/','/index.html','/app.js','/store.js','/domain.js','/styles.css','/manifest.webmanifest','/icons/icon.svg','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gym-buddy-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache health API responses, sign-in redirects, or third-party content.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/signin'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/cdn-cgi/'))return;
  if(event.request.mode==='navigate') {
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok&&!response.redirected&&new URL(response.url).origin===url.origin){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('/',copy)));}
      return response;
    }).catch(()=>caches.match('/')));return;
  }
  if(SHELL.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
