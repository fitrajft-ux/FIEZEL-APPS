importScripts('./version.js');
const CACHE=`fiezel-v${self.FIEZEL_VERSION}`;
const SW_REV='neural-voice-coi-opaque-fix-20260815-1';
const ASSETS=['./','./index.html','./style.css','./version.js','./report-config.js','./core-config.js','./content-canary.js','./content-promotion.js','./content-canary-config.js','./lucide.min.js','./app.js','./validator.js','./manifest.json','./vocabulary-master.json','./reading-bank.json','./grammar-templates.json','./favicon-64.png','./apple-touch-icon.png','./instagram.svg','./creator-report-setup.html','./creator-report-dashboard.html','./fiezel-report-worker.js','./features/neural-voice/fiezel-neural-voice-config.js','./features/neural-voice/fiezel-kokoro-adapter.js','./features/neural-voice/fiezel-neural-voice.js','./features/neural-voice/fiezel-web-audio-player.js','./features/neural-voice/fiezel-neural-voice-bootstrap.js','./features/neural-voice/fiezel-neural-voice-ios-cache-fix.js','./features/neural-voice/fiezel-neural-voice-audibility-fix.js','./features/speaking-listening/speaking-listening-config.js','./features/speaking-listening/fiezel-speaking-listening-addon.js','./features/speaking-listening/speaking-listening-addon.css','./features/speaking-listening/listening-bank-v1.json','./features/speaking-listening/speaking-bank-v1.json'];
const isNeuralAsset=request=>new URL(request.url).pathname.includes('/vendor/kokoro-');

// --- Cross-origin isolation (COOP/COEP) injection ---
// FIEZEL's neural voice WASM runtime is compiled with thread/shared-memory
// support and can only be instantiated when the page is "cross-origin
// isolated" (self.crossOriginIsolated === true). That requires the top
// document response to carry COOP + COEP headers. FIEZEL is hosted as
// static files with no control over server response headers, so this
// service worker adds them itself for same-origin document/script
// responses. require-corp is used instead of credentialless because
// credentialless is not supported on Safari, which FIEZEL specifically
// targets (see fiezel-neural-voice-ios-cache-fix.js).
//
// Cross-origin no-cors responses are intentionally left to the network.
// A service worker sees those as opaque responses, so their body and headers
// cannot be reconstructed to synthesize Cross-Origin-Resource-Policy safely.
// COEP therefore relies on the upstream resource opting in through CORP or
// CORS, which is the browser-enforced contract for require-corp.
const COOP_COEP_HEADERS={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'};
function withCoopCoep(response){
  if(!response)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy',COOP_COEP_HEADERS['Cross-Origin-Opener-Policy']);
  headers.set('Cross-Origin-Embedder-Policy',COOP_COEP_HEADERS['Cross-Origin-Embedder-Policy']);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

const shellRequests=()=>ASSETS.map(asset=>new Request(asset,{cache:'reload'}));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(shellRequests())).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fiezel-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const requestUrl=new URL(e.request.url);
  if(requestUrl.pathname.toLowerCase().endsWith('/version.json')){e.respondWith(fetch(e.request).then(r=>r&&r.ok?r:caches.match(e.request)).catch(()=>caches.match(e.request)));return}
  if(requestUrl.origin!==self.location.origin){
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok&&!isNeuralAsset(e.request)){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy))}return r}).catch(error=>{if(e.request.mode==='navigate')return caches.match('./index.html');throw error})).then(r=>r&&(e.request.mode==='navigate'||/\.(?:m?js)$/i.test(requestUrl.pathname))?withCoopCoep(r):r));
});

self.addEventListener('periodicsync',e=>{if(e.tag==='fiezel-update-check')e.waitUntil(self.registration.update().catch(()=>{}))});

self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if('focus'in client)return client.focus()}return clients.openWindow?clients.openWindow(url):undefined}))});

self.addEventListener('push',event=>{
  let payload={title:'FIEZEL · Reminder belajar',body:'Jahran, waktunya kembali ke sesi belajar.',url:'./',tag:'fiezel-remote'};
  try{
    if(event.data){
      const parsed=event.data.json();
      if(parsed&&typeof parsed==='object')payload={...payload,...parsed};
    }
  }catch{
    try{payload.body=event.data?.text?.()||payload.body}catch{}
  }
  const options={body:String(payload.body||'').slice(0,280),tag:String(payload.tag||'fiezel-remote').slice(0,64),renotify:false,icon:'./apple-touch-icon.png',badge:'./favicon-64.png',data:{url:payload.url||'./'}};
  event.waitUntil(self.registration.showNotification(String(payload.title||'FIEZEL').slice(0,80),options));
});
