(function(root){
  'use strict';

  const STATUS_SCHEMA='fiezel-neural-voice-status-v1';
  const STATUS_KEY='fiezel-neural-voice-v1';
  const rootUrl=new URL('../../',document.currentScript?.src||location.href);
  const absolute=path=>new URL(String(path).replace(/^\.\//,''),rootUrl).href;
  const version=String(root.FIEZEL_VERSION||'5.19.0');
  const cacheName=`fiezel-v${version}`;
  const LARGE_ASSET_STREAM_THRESHOLD=8*1024*1024;
  const STORAGE_RESERVE_BYTES=24*1024*1024;
  const DOWNLOAD_ATTEMPTS=2;
  const NEURAL_GENERATION_TIMEOUT_BASE_MS=Number(root.FIEZEL_GENERATION_TIMEOUT_MS)||Number(root.FIEZEL_TTS_TIMEOUT_MS)||(root.navigator?.standalone===true?30000:20000);
  // m025-72: anggaran waktu generate mengikuti langkah denoising. Bukti perangkat OWNER pada
  // m025-71: pada 16 langkah suaranya GAGAL dimuat, dan sebabnya aritmetika - anggaran 30 detik
  // sementara empat kali lipat langkah menembusnya, lalu permintaannya dibatalkan. Tanpa
  // override diagnostik, nilainya sama persis seperti sebelumnya.
  const neuralGenerationTimeoutMs=()=>{try{const p=root.FiezelWebAudioPlayer;return p&&typeof p.denoiseTimeoutMs==='function'?p.denoiseTimeoutMs(NEURAL_GENERATION_TIMEOUT_BASE_MS,root):NEURAL_GENERATION_TIMEOUT_BASE_MS}catch(_){return NEURAL_GENERATION_TIMEOUT_BASE_MS}};
  const BROWSER_TTS_TIMEOUT_MS=Number(root.FIEZEL_BROWSER_TTS_TIMEOUT_MS)||12000;
  const INITIALIZE_TIMEOUT_MS=Number(root.FIEZEL_INIT_TIMEOUT_MS)||20000;
  // m025-26 replaces the m025-25 Apple dispatch block. m025-25 refused Kokoro inference on
  // Apple standalone because it killed the WebKit content process (OWNER capture
  // 2026-08-17T16:40:43Z: three consecutive process deaths, zero successes, >30s for a
  // 49-char chunk). The sherpa VITS worker engine removes that failure mode at the source,
  // so neural dispatch is live again everywhere and no browser-TTS substitution remains.
  const NEURAL_ENGINE_ID='supertonic-3';
  const PREPARED_MARKER_KEY='fiezel-neural-voice-prepared-v1';
  // m025-42 Supertonic 3 asset set. One press of the download button fetches exactly
  // these, they land in the stable neural cache, and nothing re-downloads them on
  // reload or on a later shell release. Every speaker lives inside the single .data
  // payload, so switching voice never triggers another download.
  //
  // 158,889,523 bytes total. That is BIGGER than the 110,142,279-byte English Piper set
  // it replaces, but this one model also replaces the separate 94,558,999-byte
  // Indonesian bundle, so the learner downloads ~46 MB LESS in total and both languages
  // now speak with the same voice family.
  const assets=Object.freeze([
    {path:'vendor/supertonic-3/sherpa-onnx-wasm-main-tts.js',bytes:79421},
    {path:'vendor/supertonic-3/sherpa-onnx-tts.js',bytes:33227},
    {path:'vendor/supertonic-3/sherpa-onnx-tts.worker.js',bytes:4709},
    {path:'vendor/supertonic-3/sherpa-onnx-wasm-main-tts.wasm',bytes:13476398},
    {path:'vendor/supertonic-3/duration_predictor.int8.onnx',bytes:3700147},
    {path:'vendor/supertonic-3/text_encoder.int8.onnx',bytes:36416150},
    {path:'vendor/supertonic-3/vector_estimator.int8.onnx',bytes:78400833},
    {path:'vendor/supertonic-3/vocoder.int8.onnx',bytes:25991073},
    {path:'vendor/supertonic-3/tts.json',bytes:8253},
    {path:'vendor/supertonic-3/unicode_indexer.bin',bytes:262144},
    {path:'vendor/supertonic-3/voice.bin',bytes:517168}
  ]);
  const totalBytes=assets.reduce((sum,item)=>sum+item.bytes,0);
  let phase='idle',lastError='',lastFallbackReason='',storage='',service=null,adapter=null,preparePromise=null,initializePromise=null,backendInitPromise=null,verifiedForSession=false,lastStorageEstimate=null,preparedFlag=readStatus().prepared,assetsCached=false,playerRef=null,speechActive=false,initFailedThisSession=false,initTimedOutThisSession=false,circuitOpen=false,audibleVerified=false,wasmPolicy='default';
  function diag(entry){try{const record={t:Date.now(),v:version,...entry};const sink=root.FiezelVoiceDiagnostics;if(sink&&typeof sink.record==='function'){sink.record(record,root);return}const key='fiezel-neural-voice-diagnostics-v1';const list=JSON.parse(root.localStorage?.getItem(key)||'[]');list.push(record);root.localStorage?.setItem(key,JSON.stringify(list.slice(-200)))}catch{}}
  // m025-48 delivery settings, read from the one config both engines share so the
  // English and Indonesian voices can never drift apart.
  const SPEECH_DEFAULTS={streamSentences:true,streamMaxWords:26,silenceScale:0.4};
  function speechSettings(){
    const speech=root.FiezelNeuralVoiceConfig&&root.FiezelNeuralVoiceConfig.speech;
    return {
      streamSentences:speech&&typeof speech.streamSentences==='boolean'?speech.streamSentences:SPEECH_DEFAULTS.streamSentences,
      streamMaxWords:speech&&Number(speech.streamMaxWords)>0?Number(speech.streamMaxWords):SPEECH_DEFAULTS.streamMaxWords,
      silenceScale:speech&&Number(speech.silenceScale)>0?Number(speech.silenceScale):SPEECH_DEFAULTS.silenceScale
    };
  }
  function installBootstrapLifecycleDiagnostics(){
    if(root.navigator?.standalone!==true||root.__fiezelNeuralBootstrapLifecycleDiagInstalled)return;
    root.__fiezelNeuralBootstrapLifecycleDiagInstalled=true;
    try{
      const doc=root.document;
      if(doc&&typeof doc.addEventListener==='function'){
        doc.addEventListener('visibilitychange',()=>diag({phase:'bootstrap_lifecycle_visibilitychange',visibilityState:String(doc.visibilityState||'unknown')}));
      }
      if(typeof root.addEventListener==='function'){
        root.addEventListener('pagehide',event=>diag({phase:'bootstrap_lifecycle_pagehide',persisted:Boolean(event&&event.persisted)}));
        root.addEventListener('pageshow',event=>diag({phase:'bootstrap_lifecycle_pageshow',persisted:Boolean(event&&event.persisted)}));
        root.addEventListener('beforeunload',()=>diag({phase:'bootstrap_lifecycle_beforeunload'}));
      }
      diag({phase:'bootstrap_lifecycle_watch_ready'});
    }catch{}
  }
  installBootstrapLifecycleDiagnostics();
  const VENDOR_STAGE_PHASES=new Set(['espeak_module_loaded','espeak_worker_promise_create','espeak_runtime_already_ready','espeak_runtime_wait','espeak_runtime_ready','espeak_worker_construct_enter','espeak_worker_construct_ready','espeak_initcache_enter','espeak_list_voices_enter','espeak_list_voices_return','espeak_initcache_ready','espeak_phonemize_enter','espeak_worker_await_ready','espeak_initcache_await_ready','espeak_set_voice_enter','espeak_set_voice_return','espeak_synthesize_enter','espeak_synthesize_return','espeak_synthesize_error']);
  root.__fiezelNeuralVendorStage=entry=>{try{const vendorPhase=String(entry?.phase||'');if(VENDOR_STAGE_PHASES.has(vendorPhase))diag({phase:vendorPhase})}catch{}};
  function warmAudioGesture(){
    try{
      if(!playerRef&&root.FiezelWebAudioPlayer)playerRef=root.FiezelWebAudioPlayer.createPlayer(root);
      playerRef?.warm?.();
    }catch{}
    try{
      if(root.speechSynthesis&&root.SpeechSynthesisUtterance&&!root.__fiezelTtsUnlocked){
        const warm=new root.SpeechSynthesisUtterance(' ');
        warm.volume=0;warm.rate=1;
        root.speechSynthesis.speak(warm);
        root.__fiezelTtsUnlocked=true;
      }
    }catch{}
  }

  function readStatus(){
    try{
      const value=JSON.parse(root.localStorage?.getItem(STATUS_KEY)||'null');
      if(value?.schema===STATUS_SCHEMA&&value.version===version&&value.prepared===true&&value.storage==='cache')return value;
    }catch{}
    return{schema:STATUS_SCHEMA,version,prepared:false,storage:'',preparedAt:0};
  }
  function writeStatus(prepared,storageMode){
    const value={schema:STATUS_SCHEMA,version,prepared:prepared===true,storage:prepared?String(storageMode||storage||'cache'):'',preparedAt:prepared?Date.now():0};
    try{root.localStorage?.setItem(STATUS_KEY,JSON.stringify(value))}catch{}
    return value;
  }
  function preparedStorage(){const stored=readStatus();return (stored.prepared||preparedFlag)?(storage||stored.storage||'cache'):''}
  async function refreshPreparedFlag(){
    if(readStatus().prepared){preparedFlag=true;return true}
    if(!('caches'in root)){preparedFlag=false;return false}
    try{
      const cache=await caches.open(cacheName);
      if(await cache.match(absolute(PREPARED_MARKER_KEY))){preparedFlag=true;return true}
    }catch{}
    preparedFlag=false;return false;
  }
  function status(){
    const stored=readStatus();
    return Object.freeze({schema:STATUS_SCHEMA,version,phase,prepared:stored.prepared||preparedFlag,assetsCached:stored.prepared||preparedFlag,initialized:!!service,ready:!!service&&!circuitOpen,audibleVerified,circuitOpen,error:lastError,storage:preparedStorage(),totalBytes,assetCount:assets.length,zeroPaidRuntime:true,crossOriginInference:false,crossOriginIsolated:!!root.crossOriginIsolated,speechSynthesis:!!(root.speechSynthesis&&root.SpeechSynthesisUtterance),storageEstimate:lastStorageEstimate,timeoutMs:neuralGenerationTimeoutMs(),generationTimeoutMs:neuralGenerationTimeoutMs(),initializeTimeoutMs:INITIALIZE_TIMEOUT_MS,lastFallbackReason,wasmPolicy,engine:NEURAL_ENGINE_ID,engineModel:root.FiezelSherpaVitsAdapter?.MODEL_ID||''});
  }
  function emit(progress,callback){
    const payload=Object.freeze({...progress,totalBytes,assetCount:assets.length,phase});
    if(typeof callback==='function')callback(payload);
    root.dispatchEvent?.(new CustomEvent('fiezel-neural-voice-progress',{detail:payload}));
  }
  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function errorText(error){return String(error?.message||error?.name||error||'unknown error')}
  function requiredContentType(item){
    if(/\.(?:mjs|js)$/i.test(item.path))return'text/javascript; charset=utf-8';
    if(/\.wasm$/i.test(item.path))return'application/wasm';
    return'';
  }
  function cachedContentTypeIsValid(item,value){
    const mime=String(value||'').split(';',1)[0].trim().toLowerCase();
    if(!mime)return true;
    if(/\.(?:mjs|js)$/i.test(item.path))return['text/javascript','application/javascript','text/ecmascript','application/ecmascript'].includes(mime);
    if(/\.wasm$/i.test(item.path))return mime==='application/wasm';
    return true;
  }

  async function storageEstimate(requestPersistence=false){
    const manager=root.navigator?.storage;
    let persisted=null,usage=null,quota=null,available=null;
    if(manager){
      if(requestPersistence&&typeof manager.persist==='function'){
        try{await manager.persist()}catch{}
      }
      if(typeof manager.persisted==='function'){
        try{persisted=!!(await manager.persisted())}catch{}
      }
      if(typeof manager.estimate==='function'){
        try{
          const estimate=await manager.estimate();
          usage=Number.isFinite(Number(estimate?.usage))?Number(estimate.usage):null;
          quota=Number.isFinite(Number(estimate?.quota))?Number(estimate.quota):null;
          if(usage!==null&&quota!==null)available=Math.max(0,quota-usage);
        }catch{}
      }
    }
    lastStorageEstimate=Object.freeze({persisted,usage,quota,available});
    return lastStorageEstimate;
  }
  async function cachedAssetState(cache,item){
    const url=absolute(item.path);
    try{
      const response=await cache.match(url);
      if(!response)return{url,valid:false,length:0,contentType:''};
      const length=Number(response.headers?.get?.('content-length')||0);
      const contentType=String(response.headers?.get?.('content-type')||'');
      const isLarge=item.bytes>=LARGE_ASSET_STREAM_THRESHOLD;
      if(!cachedContentTypeIsValid(item,contentType))return{url,valid:false,length,contentType,reason:'mime'};
      if(!isLarge&&length&&length!==item.bytes)return{url,valid:false,length,contentType,reason:'size'};
      return{url,valid:true,length,contentType};
    }catch{return{url,valid:false,length:0,contentType:''}}
  }
  async function storagePreflight(cache){
    const states=[];
    for(const item of assets)states.push(await cachedAssetState(cache,item));
    const missingBytes=assets.reduce((sum,item,index)=>sum+(states[index].valid?0:item.bytes),0);
    const estimate=await storageEstimate(true);
    const reserve=Math.min(STORAGE_RESERVE_BYTES,Math.ceil(missingBytes*.20));
    if(estimate.available!==null&&estimate.available<missingBytes+reserve){
      const needMb=Math.ceil((missingBytes+reserve)/1000000),availableMb=Math.floor(estimate.available/1000000);
      const error=new Error(`Penyimpanan tidak cukup untuk suara offline. Butuh sekitar ${needMb} MB ruang origin, tersedia sekitar ${availableMb} MB.`);
      error.code='storage_insufficient';throw error;
    }
    return{states,missingBytes,estimate};
  }
  async function verifyCachedAssets(){
    if(!('caches'in root))return false;
    let cache;
    try{cache=await caches.open(cacheName)}catch{return false}
    for(const item of assets){
      const state=await cachedAssetState(cache,item);
      if(!state.valid)return false;
    }
    return true;
  }
  async function putFetchedAsset(cache,item,url,fetched){
    const contentType=requiredContentType(item)||fetched.headers?.get?.('content-type')||'application/octet-stream';
    if(item.bytes>=LARGE_ASSET_STREAM_THRESHOLD){
      await cache.put(url,new Response(fetched.body,{status:fetched.status||200,statusText:fetched.statusText||'',headers:{'Content-Type':contentType}}));
    }else{
      const buffer=await fetched.arrayBuffer();
      if(buffer.byteLength!==item.bytes)throw new Error(`Voice asset size mismatch: ${item.path}`);
      await cache.put(url,new Response(buffer,{headers:{'Content-Type':contentType,'Content-Length':String(buffer.byteLength)}}));
    }
    const stored=await cachedAssetState(cache,item);
    if(!stored.valid)throw new Error(`Offline voice cache verification failed: ${item.path}${stored.reason==='mime'?' (MIME)':''}`);
  }
  async function downloadAsset(cache,item){
    const url=absolute(item.path);
    let last=null;
    for(let attempt=1;attempt<=DOWNLOAD_ATTEMPTS;attempt++){
      try{
        const fetched=await fetch(url,{cache:'no-store',credentials:'same-origin'});
        if(!fetched.ok)throw new Error(`Voice asset failed: ${item.path} (${fetched.status})`);
        await putFetchedAsset(cache,item,url,fetched);
        return;
      }catch(error){
        last=error;
        try{await cache.delete(url)}catch{}
        if(attempt<DOWNLOAD_ATTEMPTS)await delay(250*attempt);
      }
    }
    const detail=errorText(last);
    const error=new Error(`Offline voice storage failed: ${item.path} · ${detail}`);
    error.code=last?.name==='QuotaExceededError'?'storage_quota':'asset_store_failed';
    throw error;
  }
  async function warmAssets(onProgress){
    if(!root.isSecureContext&&!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(location.href))throw new Error('Secure context required for offline voice assets');
    if(!('caches'in root))throw new Error('Cache Storage is unavailable');
    const cache=await caches.open(cacheName);
    const preflight=await storagePreflight(cache);
    let completedBytes=0,completed=0;
    phase='downloading';lastError='';storage='';emit({completed,completedBytes,current:'',storageEstimate:preflight.estimate},onProgress);
    for(const item of assets){
      let state=await cachedAssetState(cache,item);
      if(!state.valid){
        try{await cache.delete(state.url)}catch{}
        await downloadAsset(cache,item);
        state=await cachedAssetState(cache,item);
      }
      if(!state.valid)throw new Error(`Offline voice cache verification failed: ${item.path}`);
      completed++;completedBytes+=item.bytes;emit({completed,completedBytes,current:item.path,storageEstimate:lastStorageEstimate},onProgress);
    }
    storage='cache';
    if(!(await verifyCachedAssets()))throw new Error('Offline voice cache verification failed');
    writeStatus(true,'cache');preparedFlag=true;assetsCached=true;verifiedForSession=true;phase='cached';
    try{await cache.put(absolute(PREPARED_MARKER_KEY),new Response('1',{headers:{'Content-Type':'text/plain'}}))}catch{}
    emit({completed,completedBytes,current:'',storageEstimate:lastStorageEstimate},onProgress);return status();
  }
  function startBackendInitialize(){
    if(service)return Promise.resolve(service);
    if(backendInitPromise)return backendInitPromise;
    backendInitPromise=(async()=>{
      if(!root.FiezelNeuralVoiceConfig||!root.FiezelNeuralVoice||!root.FiezelWebAudioPlayer)throw new Error('Neural voice runtime modules are missing');
      phase='initializing';lastError='';
      const initStartedAt=Date.now();
      diag({phase:'init_start'});
      // m025-26: sherpa VITS runs the whole model inside a dedicated Worker, so the main
      // thread never owns a long WASM call. That is the structural reason it does not
      // starve the event loop or get the content process killed the way Kokoro did.
      // No dynamic import, no ORT env negotiation, no proxy/readBack handshake.
      if(root.FiezelSherpaVitsAdapter){
        adapter=root.FiezelSherpaVitsAdapter.createSherpaVitsAdapter({
          env:root,
          basePath:absolute('vendor/supertonic-3/'),
          // m025-42: one multilingual model serves both languages. English lines run
          // through this bootstrap, Indonesian ones through fiezel-supertonic-voice.js;
          // both share the vendored bundle, so the second language costs no download.
          expectedSpeakers:10,
          modelId:'supertonic-3-int8-2026-05-11',
          // m028-3: see fiezel-supertonic-voice.js. An omitted map falls back to the
          // adapter's {af_bella:0, af_heart:180}, where 'id_natural' resolves to undefined.
          voiceSids:{id_natural:2,tutor_ajar:2,tutor_hype:2},
          defaultVoice:'id_natural',
          kind:'supertonic-3',
          generationLang:'en',
          personas:null,
          usePersona:false,
          // Supertonic emits real breath pauses (0.5-0.7s measured); the synthetic
          // silence the Piper path needed would double them.
          padBetweenPhrases:false,
          // 1.0 is already a natural rate for this model; 0.85 was a Piper calibration.
          naturalSpeed:1,
          // m025-45: back to 4 denoising steps. 3 bought about 11% of the time back and
          // cost more than that in audio quality - OWNER heard the result immediately.
          // The gap between sentences is solved by prefetching the next one instead.
          // m025-71: satu sumber kebenaran dengan jalur Indonesia. Override diagnostik dibaca
          // dari player supaya kedua bahasa selalu memakai jumlah langkah yang sama; selisih
          // di antara keduanya langsung terdengar sebagai dua suara berbeda.
          generationSteps:(function(){try{var p=self.FiezelWebAudioPlayer;return p&&typeof p.effectiveDenoiseSteps==='function'?p.effectiveDenoiseSteps(self):4}catch(_){return 4}})(), // generationSteps:4 default
          // Supertonic has its own intonation; resampling it only adds interpolation
          // noise, which is the "cracking" OWNER reported in m025-44.
          usePitchContour:false,
          // m025-48: with the contour off, delivery moves through the engine's own rate,
          // per sentence, instead of through a resampler.
          useEmotion:true,
          // m025-48: the vendored glue's 0.2 fallback spent every inserted comma at a
          // fifth of its length. Both languages share this value or they drift apart.
          silenceScale:speechSettings().silenceScale,
          // m025-48: passed explicitly - the adapter's fallback for this resolved a
          // variable that is not in its scope, so shaping never ran on a device.
          prosody:root.FiezelProsody||null,
          onStage:entry=>diag(entry)
        });
        await adapter.initialize();
        const sherpaPlayer=root.FiezelWebAudioPlayer.createPlayer(root);
        const speech=speechSettings();
        service=root.FiezelNeuralVoice.createVoiceService({config:root.FiezelNeuralVoiceConfig,adapter,env:root,playAudio:sherpaPlayer.play,generationTimeoutMs:neuralGenerationTimeoutMs(),streamSentences:speech.streamSentences,streamMaxWords:speech.streamMaxWords,prosody:root.FiezelProsody||null});
        playerRef=sherpaPlayer;
        wasmPolicy='supertonic-3-wasm-worker';
        phase='ready';lastError='';initFailedThisSession=false;initTimedOutThisSession=false;
        diag({phase:'init_ready',engine:'supertonic-3',elapsedMs:Date.now()-initStartedAt});
        return service;
      }
      if(!root.FiezelKokoroAdapter)throw new Error('Neural voice runtime modules are missing');
      const dynamicImport=typeof root.__fiezelDynamicImport==='function'?root.__fiezelDynamicImport:(url)=>import(url);
      const kokoro=await dynamicImport(absolute('vendor/kokoro-js/kokoro.web.js?nv=m025-22'));
      const appleStandalone=root.navigator?.standalone===true||!!root.matchMedia?.('(display-mode: standalone)')?.matches;
      let wasmEnv=null;
      try{wasmEnv=kokoro.env?.wasmEnv||null}catch(error){
        diag({phase:'wasm_policy_error',policy:'m025-22-real-wasm-proxy',errorKind:String(error?.name||'error').slice(0,80)});
        if(appleStandalone)throw new Error('Apple neural WASM proxy environment is unavailable');
      }
      if(wasmEnv&&typeof wasmEnv==='object'){
        if(appleStandalone||root.crossOriginIsolated!==true)wasmEnv.numThreads=1;
        if(appleStandalone)wasmEnv.proxy=true;
        const proxyReadBack=wasmEnv.proxy===true;
        const threadsReadBack=Number(wasmEnv.numThreads||0);
        if(appleStandalone&&(!proxyReadBack||threadsReadBack!==1)){
          diag({phase:'wasm_policy_error',policy:'apple-standalone-single-thread-proxy-worker',numThreads:threadsReadBack,proxy:proxyReadBack,errorKind:'proxy_readback_failed'});
          throw new Error('Apple neural WASM proxy policy did not apply');
        }
        wasmPolicy=appleStandalone?'apple-standalone-single-thread-proxy-worker':(root.crossOriginIsolated===true?'auto-threaded':'single-thread');
        try{root.__fiezelNeuralWasmPolicy=wasmPolicy}catch{}
        diag({phase:'wasm_policy',policy:wasmPolicy,numThreads:threadsReadBack,proxy:proxyReadBack,readBack:true});
      }else if(appleStandalone){
        diag({phase:'wasm_policy_error',policy:'apple-standalone-single-thread-proxy-worker',errorKind:'wasm_env_missing'});
        throw new Error('Apple neural WASM proxy environment is unavailable');
      }
      adapter=root.FiezelKokoroAdapter.createKokoroAdapter({
        KokoroTTS:kokoro.KokoroTTS,
        kokoroEnv:kokoro.env,
        setVoiceDataUrl:kokoro.setVoiceDataUrl,
        modelId:root.FiezelNeuralVoiceConfig.modelId,
        localModelPath:'./vendor/',
        voiceBaseUrl:'./vendor/kokoro-model/voices',
        wasmBasePath:absolute('vendor/kokoro-js/wasm/'),
        runtimeOrigin:new URL(rootUrl).origin,
        dtype:root.FiezelNeuralVoiceConfig.dtype,
        device:root.FiezelNeuralVoiceConfig.device,
        onStage:entry=>diag(entry)
      });
      await adapter.initialize();
      const player=root.FiezelWebAudioPlayer.createPlayer(root);
      service=root.FiezelNeuralVoice.createVoiceService({config:root.FiezelNeuralVoiceConfig,adapter,env:root,playAudio:player.play,generationTimeoutMs:neuralGenerationTimeoutMs()});
      phase='ready';lastError='';initFailedThisSession=false;initTimedOutThisSession=false;diag({phase:'init_ready',elapsedMs:Date.now()-initStartedAt});return service;
    })().catch(error=>{phase='error';lastError=errorText(error);service=null;adapter=null;initFailedThisSession=true;initTimedOutThisSession=false;diag({phase:'init_error',error:lastError});throw error}).finally(()=>{backendInitPromise=null});
    return backendInitPromise;
  }
  async function initialize(){
    if(service)return service;
    if(initializePromise)return initializePromise;
    initializePromise=(async()=>{
      const timedOut=Symbol('fiezel-init-timeout');
      let backendError=null;
      const observed=startBackendInitialize().catch(error=>{backendError=error;return null});
      const result=await Promise.race([observed,delay(INITIALIZE_TIMEOUT_MS).then(()=>timedOut)]);
      if(result===timedOut){
        initTimedOutThisSession=true;
        lastError=`Neural voice init timed out after ${Math.max(1,Math.round(INITIALIZE_TIMEOUT_MS/1000))}s`;
        diag({phase:'init_timeout',error:lastError});
        throw new Error(lastError);
      }
      if(result===null)throw backendError;
      return result;
    })().finally(()=>{initializePromise=null});
    return initializePromise;
  }
  async function prepare(options={}){
    if(preparePromise)return preparePromise;
    initFailedThisSession=false;initTimedOutThisSession=false;circuitOpen=false;lastFallbackReason='';lastError='';warmAudioGesture();
    preparePromise=(async()=>{await warmAssets(options.onProgress);await initialize();diag({phase:'prepared'});return status()})().catch(error=>{if(!(backendInitPromise&&initTimedOutThisSession))phase='error';lastError=errorText(error);diag({phase:'prepare_error',error:lastError});if(!assetsCached){storage='';preparedFlag=false;writeStatus(false)}throw error}).finally(()=>{preparePromise=null});
    return preparePromise;
  }
  function browserSpeak(text,options={}){
    if(!root.speechSynthesis||!root.SpeechSynthesisUtterance){diag({phase:'tts_unavailable'});return Promise.reject(new Error('Browser TTS unavailable'))}
    return new Promise((resolve,reject)=>{
      let done=false,started=false,timer=null;
      const settle=(ok,value)=>{if(done)return;done=true;if(timer)clearTimeout(timer);speechActive=false;ok?resolve(value):reject(value)};
      const utterance=new root.SpeechSynthesisUtterance(String(text||''));
      utterance.lang=options.lang||'en-US';utterance.rate=Number(options.speed||options.rate||.88);
      utterance.onstart=()=>{started=true};
      utterance.onend=()=>settle(true,{provider:'browser-speech-synthesis',started:true});
      utterance.onerror=event=>settle(false,new Error(`browser_tts_${String(event?.error||'error')}`));
      if(speechActive){try{root.speechSynthesis.cancel()}catch{}}
      speechActive=true;
      timer=setTimeout(()=>settle(false,new Error(started?'browser_tts_timeout':'browser_tts_not_started')),BROWSER_TTS_TIMEOUT_MS);
      try{root.speechSynthesis.speak(utterance)}catch(error){settle(false,error)}
    });
  }
  async function ensureReady(){
    warmAudioGesture();
    if(circuitOpen)throw new Error(`neural_circuit_open:${lastFallbackReason||lastError||'previous_failure'}`);
    if(service)return status();
    if(initTimedOutThisSession&&backendInitPromise)throw new Error('Neural voice initialization is still running');
    initFailedThisSession=false;
    if(!readStatus().prepared&&!preparedFlag)throw new Error('Neural voice assets are not prepared');
    if(!verifiedForSession){
      if(!(await verifyCachedAssets())){writeStatus(false);preparedFlag=false;phase='idle';throw new Error('Offline voice cache verification failed')}
      verifiedForSession=true;
    }
    await initialize();
    return status();
  }
  async function speak(text,options={}){
    warmAudioGesture();
    const allowFallback=options.allowFallback!==false;
    const fallbackOrThrow=async(error)=>{
      if(!allowFallback)throw error;
      return browserSpeak(text,options);
    };
    if(!readStatus().prepared&&!preparedFlag&&allowFallback)return browserSpeak(text,options);
    if(!readStatus().prepared&&!preparedFlag)throw new Error('Neural voice assets are not prepared');
    if(circuitOpen)return fallbackOrThrow(new Error(`neural_circuit_open:${lastFallbackReason||lastError||'previous_failure'}`));
    if(initFailedThisSession||(initTimedOutThisSession&&backendInitPromise))return fallbackOrThrow(new Error(lastError||'Neural voice initialization is still running'));
    // m025-26 removes the m025-25 Apple dispatch block. That block existed only because
    // Kokoro q8 killed the WebKit content process; the sherpa VITS worker engine that
    // replaces it is proven sub-realtime on the same Safari, so neural runs again here.
    if(!verifiedForSession){
      if(!(await verifyCachedAssets())){writeStatus(false);preparedFlag=false;phase='idle';return fallbackOrThrow(new Error('Offline voice cache verification failed'))}
      verifiedForSession=true;
    }
    let local;
    const speakInitStartedAt=Date.now();
    try{
      local=await initialize();
      diag({phase:'speak_init_ready',elapsedMs:Date.now()-speakInitStartedAt});
    }catch(error){
      lastError=errorText(error);lastFallbackReason=lastError;audibleVerified=false;
      diag({phase:'speak_init_error',error:lastError,elapsedMs:Date.now()-speakInitStartedAt});
      return fallbackOrThrow(error);
    }
    const voice=options.voice||root.FiezelNeuralVoiceConfig.voices.fiezelPrimary;
    const neuralStartedAt=Date.now();
    diag({phase:'speak_neural_start',voice:String(voice),generationTimeoutMs:neuralGenerationTimeoutMs()});
    let result;
    try{
      result=await local.speak(text,{voice,speed:options.speed||options.rate||1,lang:options.lang||'en-US',allowFallback:false});
    }catch(error){
      lastError=errorText(error);lastFallbackReason=lastError;
      const generationBusy=lastError==='neural_generation_busy';
      const generationTimeout=lastError==='neural_generation_timeout';
      // m025-29: supersession and explicit stop are NORMAL control flow, not engine
      // faults. OWNER cache-0 capture recorded circuitOpen=true with reason
      // "TTS request superseded" -- switching listening item A1 to A2 cancels the
      // in-flight request, which was being classified as a hard failure and latched the
      // circuit for the page lifetime. Every later request then failed closed and the
      // app degraded to browser TTS until a reload, which is exactly the "A1 works, A2
      // goes back to browser TTS, fixed only after several reloads" report.
      const generationSuperseded=/superseded/i.test(lastError);
      const generationStopped=lastError==='neural_generation_stopped';
      const transientFailure=generationBusy||generationTimeout||generationSuperseded||generationStopped;
      const shouldOpenCircuit=!!service&&!transientFailure;
      diag({phase:'speak_fallback',reason:lastError,circuitOpen:shouldOpenCircuit,transient:transientFailure,elapsedMs:Date.now()-neuralStartedAt,voice:String(voice)});
      circuitOpen=shouldOpenCircuit;audibleVerified=false;if(circuitOpen)phase='error';else if(service)phase='ready';
      try{service?.stop?.()}catch{}
      return fallbackOrThrow(error);
    }
    circuitOpen=false;audibleVerified=true;lastError='';lastFallbackReason='';phase='ready';
    diag({phase:'speak_neural_success',provider:String(result?.provider||'neural'),voice:String(result?.voice||voice||''),requestId:String(result?.requestId||''),elapsedMs:Date.now()-neuralStartedAt});
    return result;
  }
  // m025-48 speculative warm-up. Building the engine while the launcher is idle is what
  // takes the worker start-up off the learner's first tap - but a speculative attempt must
  // never be able to make that tap WORSE. initialize() latches failure state that speak()
  // reads (initFailedThisSession, circuitOpen, phase), so on failure the exact prior state
  // is restored and the learner's own request starts from a clean engine. No audio gesture
  // is warmed here either: this runs outside a user gesture and has no business creating
  // an AudioContext.
  async function prewarm(){
    if(service)return true;
    if(!readStatus().prepared&&!preparedFlag)return false;
    const prior={initFailed:initFailedThisSession,initTimedOut:initTimedOutThisSession,circuit:circuitOpen,phase,error:lastError,fallbackReason:lastFallbackReason};
    try{
      await initialize();
      diag({phase:'prewarm_ready'});
      return true;
    }catch(error){
      initFailedThisSession=prior.initFailed;initTimedOutThisSession=prior.initTimedOut;circuitOpen=prior.circuit;
      phase=prior.phase;lastError=prior.error;lastFallbackReason=prior.fallbackReason;
      diag({phase:'prewarm_failed',error:errorText(error)});
      return false;
    }
  }
  function stop(){try{service?.stop?.()}catch{}try{root.speechSynthesis?.cancel?.()}catch{}}
  // T-023 lifecycle: bebaskan sesi neural + WebAudio saat tab tidak terlihat agar
  // tab tidak dipaksa mati oleh browser (WASM 92MB+21MB + AudioContext tetap hidup
  // saat hidden). ADDITIVE — kontrak publik tidak berubah; init ulang on-demand
  // terjadi otomatis lewat speak()/ensureReady() berikutnya.
  function release(){
    try{service?.stop?.()}catch{}
    try{root.speechSynthesis?.cancel?.()}catch{}
    speechActive=false;
    try{root.FiezelWebAudioPlayer?.createPlayer?.(root)?.close?.()}catch{}
    playerRef=null;service=null;adapter=null;
    phase='idle';lastError='';lastFallbackReason='';circuitOpen=false;audibleVerified=false;
    diag({phase:'released'});
    diag({phase:'release_circuit_reset'});
    return status();
  }

  diag({phase:'bootstrap_loaded',crossOriginIsolated:!!root.crossOriginIsolated,speechSynthesis:!!(root.speechSynthesis&&root.SpeechSynthesisUtterance),cacheAvailable:('caches'in root)});
  if(typeof Promise!=='undefined'&&root.caches)refreshPreparedFlag().then(prepared=>{
    if(prepared){phase='cached';diag({phase:'prepared_idle'});}
  }).catch(()=>{});
  // m025-45: best-effort warm-up for the next utterance. Never throws and never blocks
  // playback - a caller that ignores it behaves exactly as before.
  async function prefetch(text,options={}){
    try{
      // m025-52 investigation: this early return was silent, so a device capture could
      // not tell "caller never prefetches" (Classroom) apart from "caller prefetches but
      // service was not ready yet" (Library, service null). Diagnostics-only, no behavior
      // change - the return value and control flow below are unchanged.
      if(!service||typeof service.prefetch!=='function'){diag({phase:'prefetch_unavailable',hasService:!!service});return false}
      return await service.prefetch(text,options);
    }catch{return false}
  }
  root.FiezelVoiceRuntime=Object.freeze({schema:STATUS_SCHEMA,status,prepare,ensureReady,speak,stop,prefetch,prewarm,release,verifyCachedAssets,refreshPreparedFlag,storageEstimate:()=>storageEstimate(false),diagnostics:()=>{try{return JSON.parse(root.localStorage?.getItem('fiezel-neural-voice-diagnostics-v1')||'[]')}catch{return[]}},assets:()=>assets.map(item=>({...item})),totalBytes,assetCount:assets.length});
})(typeof globalThis!=='undefined'?globalThis:this);