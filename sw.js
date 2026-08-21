importScripts('./version.js');
// CACHE is the stable runtime/data cache used by neural preparation. Do not bind
// mutable application-shell generations to it: prepared neural assets must survive
// a shell release without being rewritten underneath a live document.
const CACHE=`fiezel-v${self.FIEZEL_VERSION}`;
const SW_REV='m025-84-splash-sfx-autoplay-and-ios-copy-20260821-1';
const SHELL_CACHE=`fiezel-shell-${SW_REV}`;
// m025-61: health check menanyakan revisi shell langsung ke worker yang sedang aktif.
// Menebaknya dari nama cache tidak cukup: cache lama bisa tertinggal, sedangkan jawaban ini
// datang dari worker yang benar-benar melayani halaman.
self.addEventListener('message',event=>{
  if(event?.data?.type!=='FIEZEL_HEALTH_PING')return;
  const reply={type:'FIEZEL_HEALTH_PONG',swRev:SW_REV};
  // Balas lewat port yang dikirim halaman bila ada; kalau tidak, lewat klien pengirimnya.
  if(event.ports&&event.ports[0])event.ports[0].postMessage(reply);
  else event.source?.postMessage?.(reply);
});
const ASSETS=['./','./index.html','./style.css','./version.js','./report-config.js','./core-config.js','./content-canary.js','./content-promotion.js','./content-canary-config.js','./lucide.min.js','./app.js','./validator.js','./manifest.json','./vocabulary-master.json','./reading-bank.json','./grammar-templates.json','./favicon-64.png','./apple-touch-icon.png','./instagram.svg','./creator-report-setup.html','./creator-report-dashboard.html','./fiezel-report-worker.js','./features/neural-voice/fiezel-voice-diagnostics.js','./features/neural-voice/fiezel-neural-voice-config.js','./features/neural-voice/fiezel-kokoro-adapter.js','./features/neural-voice/fiezel-sherpa-vits-adapter.js','./features/neural-voice/fiezel-neural-voice.js','./features/neural-voice/fiezel-web-audio-player.js','./features/neural-voice/fiezel-pcm-renderer-worklet.js','./features/neural-voice/fiezel-m0281-prebootstrap-hotfix.js','./features/neural-voice/fiezel-neural-voice-bootstrap.js','./features/neural-voice/fiezel-indonesian-voice.js','./features/neural-voice/fiezel-neural-voice-ios-cache-fix.js','./features/neural-voice/fiezel-neural-voice-cache-integrity-repair.js','./features/neural-voice/fiezel-neural-voice-audibility-fix.js','./features/neural-voice/fiezel-m0281-runtime-guard.js','./features/neural-voice/fiezel-diag-panel.js','./features/neural-voice/fiezel-pipeline-device-probe.js','./features/diagnostics/fiezel-diagnostic-targets.js','./features/diagnostics/fiezel-diagnostic-bus.js','./features/diagnostics/fiezel-module-selftests.js','./features/diagnostics/fiezel-diagnostic-register.js','./features/classroom/fiezel-classroom.js','./features/classroom/classroom-lessons-v1.json','./features/tutor-classroom/fiezel-tutor-v3.js','./features/tutor-classroom/fiezel-tutor-indonesian-voice-fix.js','./features/tutor-classroom/tutor-v3.css','./features/speaking-listening/speaking-listening-config.js','./features/speaking-listening/fiezel-speaking-listening-addon.js','./features/speaking-listening/speaking-listening-addon.css','./features/speaking-listening/listening-bank-v1.json','./features/speaking-listening/speaking-bank-v1.json','./features/neural-voice/fiezel-prosody.js','./features/neural-voice/fiezel-voice-persona.js','./features/neural-voice/fiezel-genz-script.js','./features/neural-voice/fiezel-supertonic-voice.js','./features/ui/fiezel-zoom-lock.js','./features/ui/fiezel-dark-mode.js','./features/ui/fiezel-ab-testing.js','./features/ui/skeleton-helpers.js','./features/audio/fiezel-ui-sfx.js','./features/neural-voice/fiezel-voice-bundle-gate.js','./features/daily-target/fiezel-daily-target.js','./features/personal-journey/fiezel-personal-journey.js','./features/skills-evidence/fiezel-skills-evidence.js','./features/academic-readiness/fiezel-academic-readiness.js','./features/continuity/fiezel-continuity.js','./features/health/fiezel-install-health.js','./features/brand/fiezel-splash.js','./features/onboarding/fiezel-onboarding.js','./assets/brand/fiezel-icon-512.png','./assets/brand/fiezel-icon-192.png','./assets/brand/fiezel-icon.svg','./assets/fonts/Fredoka-500.woff2','./assets/fonts/Fredoka-600.woff2','./assets/fonts/Fredoka-700.woff2','./assets/fonts/PlusJakartaSans-400.woff2','./assets/fonts/PlusJakartaSans-500.woff2','./assets/fonts/PlusJakartaSans-600.woff2','./assets/fonts/PlusJakartaSans-700.woff2','./features/tutor-classroom/fiezel-tutor-dialog.js','./features/tutor-classroom/fiezel-tutor-voice-chat.js','./features/library/fiezel-library.js','./features/library/fiezel-library-ui.js','./features/library/library-books-v1.json'];
// m025-26: the sherpa VITS runtime is a neural asset too. Without this it would fall
// through to the shell cache and be re-downloaded on every release, which is exactly
// the repeated-download behaviour the stable neural cache exists to prevent.
const isNeuralAsset=request=>{const p=new URL(request.url).pathname;return p.includes('/vendor/kokoro-')||p.includes('/vendor/sherpa-vits/')||p.includes('/vendor/sherpa-vits-id/')||p.includes('/vendor/supertonic-3/')};
const shellScope=String(self.registration?.scope||`${self.location.origin}/`);
const shellUrls=new Set(ASSETS.map(asset=>new URL(asset,shellScope).href));
const isShellRequest=request=>request?.mode==='navigate'||shellUrls.has(new URL(request.url).href);

// m025-83 OWNER: "puter jangan dialihkan ke web lagi, itu sangat mengganggu". This USED to
// be engine-aware: Chromium got strict COOP:same-origin (crossOriginIsolated=true, so the
// neural voice WASM runtime could run multi-threaded), WebKit got same-origin-allow-popups
// (preserving the Puter sign-in popup's window.opener channel). The theory was that Chromium
// had an "isolation-capable" Puter auth path that didn't need the opener - it doesn't. Strict
// COOP:same-origin severs window.opener for ANY cross-origin popup regardless of engine, so
// on Chromium (the majority of installs) the Puter sign-in popup could never message its
// result back to the app and fell through to a full top-level navigation instead - exactly
// the "redirected to the web" escape the owner is reporting. Login now wins over the
// multi-thread optimization: every engine gets same-origin-allow-popups on navigation, so
// the popup's opener channel survives and sign-in can complete without leaving the app.
// This is a safe trade, not a regression risk: fiezel-neural-voice-bootstrap.js already
// treats crossOriginIsolated as optional (`numThreads=1`/`wasmPolicy='single-thread'` when
// it's false) because WebKit has run without it since m025-79 - Chromium now takes the same
// already-proven fallback path instead of a new, untested one. COEP stays credentialless,
// and third-party Puter traffic is never reconstructed by this SW.
const COEP_POLICY='credentialless';
function openerPolicyFor(request){return request?.mode==='navigate'?'same-origin-allow-popups':'same-origin'}
function withCoopCoep(response,request){
  if(!response)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy',openerPolicyFor(request));
  headers.set('Cross-Origin-Embedder-Policy',COEP_POLICY);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

const shellRequests=()=>ASSETS.map(asset=>new Request(asset,{cache:'reload'}));
// Do not skipWaiting here. A new release is allowed to activate only after clients
// using the previous worker are gone, preventing a controller-generation swap in
// the middle of a live installed-PWA document.
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL_CACHE).then(c=>c.addAll(shellRequests()))));
// Because activation is no longer forced over live old clients, stale dedicated
// shell caches can be removed here. The stable neural/runtime CACHE is preserved.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fiezel-shell-')&&k!==SHELL_CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const requestUrl=new URL(e.request.url);
  if(requestUrl.pathname.toLowerCase().endsWith('/version.json')){e.respondWith(fetch(e.request).then(r=>r&&r.ok?r:caches.match(e.request,{cacheName:SHELL_CACHE})).catch(()=>caches.match(e.request,{cacheName:SHELL_CACHE})));return}
  if(requestUrl.origin!==self.location.origin){
    // Third-party SDK/API traffic is deliberately left to the browser. The
    // document uses COEP: credentialless, so no-cors resources such as Puter.js
    // can load without the service worker reconstructing or proxying opaque bodies.
    return;
  }
  let responsePromise;
  if(e.request.mode==='navigate'){
    // Installed-PWA startup is recovery-first: validate a fresh network document
    // before trusting the revisioned shell entry. A blank/stale cached navigation
    // can therefore self-heal online; offline launch still falls back to the exact
    // current generation's index.html and never borrows legacy runtime-shell bytes.
    const freshRequest=new Request(e.request,{cache:'reload'});
    responsePromise=fetch(freshRequest).then(r=>{
      if(r&&r.ok){
        const copy=r.clone();
        caches.open(SHELL_CACHE).then(cache=>cache.put(e.request,copy));
        return r;
      }
      return caches.match('./index.html',{cacheName:SHELL_CACHE}).then(c=>c||r);
    }).catch(()=>caches.match('./index.html',{cacheName:SHELL_CACHE}));
  }else if(isNeuralAsset(e.request)){
    // Neural runtime/model/voice assets are owned by the neural prepare layer and
    // stay in the stable runtime cache. A shell release never precaches/rewrites them.
    responsePromise=caches.match(e.request,{cacheName:CACHE}).then(c=>c||fetch(e.request));
  }else if(isShellRequest(e.request)){
    // Non-navigation shell assets remain cache-first within this exact generation.
    // Missing shell bytes are refetched into this generation, never borrowed from
    // legacy shell entries that still happen to exist in the stable runtime cache.
    responsePromise=caches.match(e.request,{cacheName:SHELL_CACHE}).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(e.request,copy))}return r}));
  }else{
    responsePromise=caches.match(e.request,{cacheName:CACHE}).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok&&!isNeuralAsset(e.request)){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy))}return r}));
  }
  e.respondWith(responsePromise.then(r=>r&&(e.request.mode==='navigate'||/\.(?:m?js)$/i.test(requestUrl.pathname))?withCoopCoep(r,e.request):r));
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
