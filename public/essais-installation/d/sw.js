// Service worker minimal de test d'installation.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',(e)=>{if(e.request.method!=='GET'){e.respondWith(Response.redirect('./',303));return;}e.respondWith(fetch(e.request));});
