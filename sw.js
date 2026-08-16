importScripts('./version.js');
const CACHE=`fiezel-v${self.FIEZEL_VERSION}`;
// SW_REV tidak dibaca kode mana pun. Fungsinya hanya mengubah byte sw.js supaya
// browser mendeteksi service worker baru dan menjalankan install ulang. Itu perlu
// karena fetch handler di bawah cache-first untuk semua same-origin, jadi file baru
// TIDAK akan pernah dilayani sampai install memanggil addAll dengan cache:'reload'.
// JANGAN naikkan version.js bersamaan: nama CACHE terikat ke FIEZEL_VERSION, dan
// activate menghapus semua cache fiezel-* yang bukan CACHE -- termasuk 113 MB aset
// neural voice yang menumpang di cache yang sama.
const SW_REV='m025-10-home-redesign-20260816-1';
const ASSETS=['./','./index.html','./style.css','./version.js','./report-config.js','./core-config.js','./content-canary.js','./content-promotion.js','./content-canary-config.js','./lucide.min.js','./app.js','./validator.js','./manifest.json','./vocabulary-master.json','./reading-bank.json','./grammar-templates.json','./favicon-64.png','./apple-touch-icon.png','./instagram.svg','./creator-report-setup.html','./creator-report-dashboard.html','./fiezel-report-worker.js','./vendor/kokoro-js/kokoro.web.js?nv=m025-5','./features/neural-voice/fiezel-neural-voice-config.js','./features/neural-voice/fiezel-kokoro-adapter.js','./features/neural-voice/fiezel-neural-voice.js','./features/neural-voice/fiezel-web-audio-player.js','./features/neural-voice/fiezel-neural-voice-bootstrap.js','./features/neural-voice/fiezel-neural-voice-ios-cache-fix.js','./features/neural-voice/fiezel-neural-voice-audibility-fix.js','./features/neural-voice/fiezel-diag-panel.js','./features/neural-voice/fiezel-pipeline-device-probe.js','./features/speaking-listening/speaking-listening-config.js','./features/speaking-listening/fiezel-speaking-listening-addon.js','./features/speaking-listening/speaking-listening-addon.css','./features/speaking-listening/listening-bank-v1.json','./features/speaking-listening/speaking-bank-v1.json','./features/home-redesign/home-redesign.js','./features/home-redesign/home-redesign.css'];
const isNeuralAsset=request=>new URL(request.url).pathname.includes('/vendor/kokoro-');

// Cross-origin policy is intentionally engine-aware. Chromium-family browsers can
// keep COOP:same-origin and use the isolation-capable Puter auth path. WebKit uses
// Puter's popup/postMessage auth path on the affected PWA, so navigation responses
// use same-origin-allow-popups to preserve the opener relationship. COEP remains
// credentialless, and third-party Puter traffic is never reconstructed by this SW.
const workerUa=String(self.navigator?.userAgent||'');
const WEBKIT_POPUP_COMPAT=/AppleWebKit/i.test(workerUa)&&!/(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\//i.test(workerUa);
const COEP_POLICY='credentialless';
function openerPolicyFor(request){return request?.mode==='navigate'&&WEBKIT_POPUP_COMPAT?'same-origin-allow-popups':'same-origin'}
function withCoopCoep(response,request){
  if(!response)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy',openerPolicyFor(request));
  headers.set('Cross-Origin-Embedder-Policy',COEP_POLICY);
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
    // Third-party SDK/API traffic is deliberately left to the browser. The
    // document uses COEP: credentialless, so no-cors resources such as Puter.js
    // can load without the service worker reconstructing or proxying opaque bodies.
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok&&!isNeuralAsset(e.request)){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy))}return r}).catch(error=>{if(e.request.mode==='navigate')return caches.match('./index.html');throw error})).then(r=>r&&(e.request.mode==='navigate'||/\.(?:m?js)$/i.test(requestUrl.pathname))?withCoopCoep(r,e.request):r));
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