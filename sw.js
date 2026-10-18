// 2026 finale: keep homepage navigation fresh after the domain is restored.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{await self.clients.claim();const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));})());
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'||event.request.destination==='script'||event.request.destination==='style'){
   event.respondWith(fetch(event.request,{cache:'no-store'}));
 }
});
