'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=__dirname;
const lock=JSON.parse(fs.readFileSync(path.join(root,'NEURAL-VOICE-SOURCE-LOCK.json'),'utf8'));
const config=require(path.join(root,'features','neural-voice','fiezel-neural-voice-config.js'));
const core=require(path.join(root,'features','neural-voice','fiezel-neural-voice.js'));
const adapterApi=require(path.join(root,'features','neural-voice','fiezel-kokoro-adapter.js'));
const player=require(path.join(root,'features','neural-voice','fiezel-web-audio-player.js'));
const bootstrap=fs.readFileSync(path.join(root,'features','neural-voice','fiezel-neural-voice-bootstrap.js'),'utf8');
// m025-26: the download manifest is engine-agnostic now. Derive it from the bootstrap
// rather than pinning one engine's filenames, so this test follows the active engine
// while still enforcing the invariant that matters: every declared asset is a local
// same-origin vendor path, never a CDN.
const declaredAssets=[...bootstrap.matchAll(/\{path:'([^']+)',bytes:(\d+)\}/g)].map(m=>[m[1],Number(m[2])]);
assert.ok(declaredAssets.length>0,'bootstrap must declare local vendor assets');
for(const [assetPath] of declaredAssets){
  assert.ok(assetPath.startsWith('vendor/'),`asset must be a local vendor path: ${assetPath}`);
  assert.ok(!/^[a-z]+:\/\//i.test(assetPath),`asset must not be a remote URL: ${assetPath}`);
}
const runtimeVendorPath=declaredAssets[0][0];
const runtimeVendorBytes=declaredAssets[0][1];
let pass=0;
async function test(name,fn){await fn();pass++;console.log('PASS',name)}
function file(rel){return path.join(root,rel)}
function sha(rel){return crypto.createHash('sha256').update(fs.readFileSync(file(rel))).digest('hex')}
function verifyAsset(asset){assert.ok(fs.existsSync(file(asset.path)),asset.path);assert.equal(fs.statSync(file(asset.path)).size,asset.sizeBytes,asset.path);assert.equal(sha(asset.path),asset.sha256,asset.path)}

(async()=>{
  await test('source lock schema',()=>assert.equal(lock.schema,'fiezel-neural-voice-source-lock-v1'));
  await test('Kokoro source commit is full and pinned',()=>assert.match(lock.provider.commit,/^[a-f0-9]{40}$/));
  await test('provider version remains 1.2.1',()=>assert.equal(lock.provider.version,'1.2.1'));
  await test('runtime bundle integrity',()=>verifyAsset(lock.runtime.bundle));
  await test('WASM module integrity',()=>verifyAsset(lock.runtime.wasmModule));
  await test('WASM binary integrity',()=>verifyAsset(lock.runtime.wasmBinary));
  await test('model integrity',()=>verifyAsset(lock.model));
  await test('model stays below GitHub single-file limit',()=>assert.ok(lock.model.sizeBytes<100*1024*1024));
  await test('all six voice hashes match',()=>{for(const voice of lock.voices){const rel=`vendor/kokoro-model/voices/${voice.id}.bin`;assert.equal(sha(rel),voice.sha256)}});
  await test('support JSON parses',()=>{for(const rel of ['vendor/kokoro-model/config.json','vendor/kokoro-model/tokenizer.json','vendor/kokoro-model/tokenizer_config.json'])JSON.parse(fs.readFileSync(file(rel),'utf8'))});
  await test('required licenses are present',()=>{for(const rel of ['vendor/kokoro-js/LICENSE','vendor/kokoro-model/LICENSE','vendor/kokoro-js/licenses/HUGGINGFACE-TRANSFORMERS-APACHE-2.0.txt','vendor/kokoro-js/licenses/PHONEMIZER-APACHE-2.0.txt','vendor/kokoro-js/licenses/ONNXRUNTIME-MIT.txt'])assert.ok(fs.statSync(file(rel)).size>500,rel)});
  await test('Supertonic fallback remains zero-paid and local',()=>{assert.equal(lock.policy.scope,'supertonic-offline-fallback-only');assert.deepStrictEqual([lock.policy.paidRuntime,lock.policy.vendorApiKey,lock.policy.remoteInference,lock.policy.crossOriginTtsRequests],[false,false,false,false])});
  await test('system runtime truthfully allows Puter remote User-Pays TTS',()=>assert.deepStrictEqual([lock.runtimePolicy.paidRuntime,lock.runtimePolicy.vendorApiKey,lock.runtimePolicy.remoteInference,lock.runtimePolicy.crossOriginTtsRequests,lock.runtimePolicy.userPays,lock.runtimePolicy.meteredBillingAllowed],[true,false,true,true,true,true]));
  await test('explicit same-origin warmup policy',()=>assert.deepStrictEqual([lock.policy.sameOriginExplicitWarmup,lock.policy.offlineAfterWarmRequired],[true,true]));
  await test('config pins source and runtime dependencies',()=>assert.deepStrictEqual([config.schema,config.providerVersion,config.providerSourceCommit,config.transformersVersion,config.onnxRuntimeWebVersion],['fiezel-neural-voice-v2','1.2.1',lock.provider.commit,'3.5.1','1.22.0-dev.20250409-89f8206ba4']));
  await test('adapter rejects cross-origin paths',()=>assert.throws(()=>adapterApi.assertLocalPath('https://example.com/model'),'must be same-origin/local'));
  await test('adapter forces local routing before model load',async()=>{const env={allowRemoteModels:true,allowLocalModels:false,localModelPath:'',wasmPaths:''};let voiceBase='',captured=null;const KokoroTTS={from_pretrained:async(id,options)=>{captured={id,options,remote:env.allowRemoteModels,local:env.allowLocalModels,path:env.localModelPath,wasm:env.wasmPaths,voiceBase};return{generate:async()=>({data:new Float32Array([0]),sampling_rate:24000})}}};const adapter=adapterApi.createKokoroAdapter({KokoroTTS,kokoroEnv:env,setVoiceDataUrl:value=>{voiceBase=value},modelId:'kokoro-model',localModelPath:'./vendor/',voiceBaseUrl:'./vendor/kokoro-model/voices',wasmBasePath:'./vendor/kokoro-js/wasm/'});await adapter.initialize();assert.deepStrictEqual(captured,{id:'kokoro-model',options:{dtype:'q8',device:'wasm'},remote:false,local:true,path:'./vendor/',wasm:'./vendor/kokoro-js/wasm/',voiceBase:'./vendor/kokoro-model/voices'})});
  await test('voice service rejects empty input',()=>assert.throws(()=>core.normalizeText('',100),'empty'));
  await test('voice service bounds input',()=>assert.throws(()=>core.normalizeText('x'.repeat(101),100),'bounded'));
  await test('web audio accepts Kokoro Float32 payload',()=>assert.ok(player.pickSamples({data:new Float32Array([0,.1])}) instanceof Float32Array));
  await test('player warm is safe without Web Audio API',()=>assert.equal(player.createPlayer({}).warm(),false));
  await test('player warm creates and resumes a suspended context',()=>{let resumed=0;const env={AudioContext:function(){this.state='suspended';this.resume=()=>{resumed++;return Promise.resolve()}}};assert.equal(player.createPlayer(env).warm(),true);assert.equal(resumed,1)});
  await test('bootstrap loads the engine runtime same-origin',()=>assert.ok(bootstrap.includes("absolute('vendor/supertonic-3/')")&&bootstrap.includes("credentials:'same-origin'")&&bootstrap.includes("cache:'no-store'")));
  // Declared bytes must equal the vendored files. A mismatch makes the prepare layer
  // report a bad download and refetch, which is exactly the repeated-download failure.
  await test('declared asset sizes match the vendored files',()=>{for(const [rel,bytes] of declaredAssets)assert.equal(fs.statSync(file(rel)).size,bytes,rel)});
  await test('bootstrap does not silently download before opt-in',()=>assert.ok(bootstrap.includes("if(!readStatus().prepared&&!preparedFlag&&allowFallback)return browserSpeak")&&bootstrap.includes("if(!readStatus().prepared&&!preparedFlag)throw new Error('Neural voice assets are not prepared')")));
  await test('bootstrap verifies complete cache before ready flag',()=>assert.ok(bootstrap.indexOf('verifyCachedAssets()')<bootstrap.indexOf("writeStatus(true,'cache')")));
  await test('stale prepared state fails closed to browser TTS',()=>assert.ok(bootstrap.includes('if(!(await verifyCachedAssets())){writeStatus(false)')));
  await test('bootstrap contains no vendor endpoint or credential',()=>assert.ok(!/https?:\/\//i.test(bootstrap)&&!/(?:api[_-]?key|bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9_-]{12,})/i.test(bootstrap)));
  await test('physical Apple production gate cannot be claimed without evidence',()=>{
    assert.equal(lock.promotion.sourceAndAssetClosure,'PASS');
    if(lock.promotion.productionClaim===true){
      assert.equal(lock.promotion.realDeviceGate,'PASS');
      const evidence=lock.promotion.physicalEvidence;
      assert.ok(evidence&&typeof evidence==='object','physical evidence required for production claim');
      assert.equal(evidence.environment,'Apple standalone PWA');
      assert.equal(evidence.terminalPhase,'speak_neural_success');
      for(const key of ['modelElapsedMs','generationElapsedMs','playbackElapsedMs','totalElapsedMs'])assert.ok(Number.isInteger(evidence[key])&&evidence[key]>0,key);
      assert.ok(evidence.totalElapsedMs>=evidence.generationElapsedMs);
      assert.ok(!('prompt' in evidence)&&!('phonemes' in evidence)&&!('tokens' in evidence)&&!('errorMessage' in evidence),'physical evidence must remain bounded and private');
    }else{
      assert.equal(lock.promotion.productionClaim,false,'production claim must be explicit boolean false while physical acceptance is pending');
      assert.equal(lock.promotion.realDeviceGate,'PENDING','machine closure must not fabricate a physical PASS');
      assert.ok(!lock.promotion.physicalEvidence,'pending candidate must not carry release-acceptance evidence');
    }
  });
  const bundle=await import('./vendor/kokoro-js/kokoro.web.js');
  await test('browser bundle exports patched controls',()=>assert.ok(bundle.KokoroTTS&&bundle.env&&bundle.setVoiceDataUrl&&'allowRemoteModels'in bundle.env&&'allowLocalModels'in bundle.env&&'localModelPath'in bundle.env&&'wasmPaths'in bundle.env));
  await test('bootstrap streams large assets instead of buffering the model',()=>assert.ok(bootstrap.includes('LARGE_ASSET_STREAM_THRESHOLD')&&bootstrap.includes('new Response(fetched.body')&&bootstrap.includes('await fetched.arrayBuffer()')));
  await test('bootstrap does not claim a memory-only offline install',()=>assert.ok(!bootstrap.includes('memoryAssets')&&!bootstrap.includes("storage=usedMemory?'memory':'cache'")));
  await test('bootstrap uses Storage API preflight when available',()=>assert.ok(bootstrap.includes("manager.estimate")&&bootstrap.includes("manager.persist")&&bootstrap.includes('storage_insufficient')));

  const fakeAssets=declaredAssets.map(([p,b])=>[p,b]);
  const sizes=Object.fromEntries(fakeAssets);
  const localStorageData={};
  const localStorage={getItem:k=>localStorageData[k]??null,setItem:(k,v)=>localStorageData[k]=String(v),removeItem:k=>delete localStorageData[k]};
  function keyForUrl(url){const text=String(url);return fakeAssets.find(([p])=>text.endsWith(p))?.[0]||''}
  function makeFetch(options={}){
    const calls=[];
    const fn=async url=>{const key=keyForUrl(url),len=sizes[key];calls.push(key);if(!len)throw new Error('unexpected asset '+String(url));return{ok:true,status:200,headers:{get:n=>{n=String(n).toLowerCase();if(n==='content-length')return String(len);if(n==='content-type')return 'application/octet-stream';return null}},arrayBuffer:async()=>{if(options.rejectLargeBuffer&&len>=8*1024*1024)throw new Error('large asset was buffered');return new ArrayBuffer(len)}}};
    fn.calls=calls;return fn;
  }
  function makeCaches(options={}){
    const store=new Map();
    const cache={
      match:async url=>store.get(String(url))||null,
      put:async(url,response)=>{if(options.putThrows){const e=new Error('quota');e.name='QuotaExceededError';throw e}const key=keyForUrl(url),len=sizes[key];store.set(String(url),{headers:{get:n=>String(n).toLowerCase()==='content-length'?String(len):null},response})},
      delete:async url=>store.delete(String(url))
    };
    return{open:async()=>cache,_store:store};
  }
  const moduleStub={KokoroTTS:{from_pretrained:async()=>({generate:async()=>({data:new Float32Array([0]),sampling_rate:24000}),voices:{}})},env:{allowRemoteModels:false,allowLocalModels:true,localModelPath:'./vendor/',wasmPaths:'./vendor/kokoro-js/wasm/'},setVoiceDataUrl:()=>{}};
  function makeContext(caches,fetchFn,navigatorStorage){
    const ctx={console,FIEZEL_VERSION:'5.19.0',location:{href:'http://localhost/'},document:{currentScript:{src:'http://localhost/features/neural-voice/fiezel-neural-voice-bootstrap.js'}},isSecureContext:true,localStorage,caches,fetch:fetchFn,Response:function(buffer,options){this.buffer=buffer;this.headers={get:n=>{const h=options?.headers||{};return h[n]||h[String(n).toLowerCase()]||h['Content-Length']||null}}},CustomEvent:function(type){this.type=type},dispatchEvent(){},navigator:{storage:navigatorStorage},__fiezelDynamicImport:async()=>moduleStub,FiezelNeuralVoiceConfig:config,FiezelKokoroAdapter:adapterApi,FiezelNeuralVoice:core,FiezelWebAudioPlayer:player,URL,Promise,setTimeout,clearTimeout};
    return ctx;
  }

  await test('large ONNX and WASM assets are not copied into ArrayBuffer during warmup',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch({rejectLargeBuffer:true});
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    const ctx=makeContext(caches,fetchFn,storage);vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-stream.js'});
    const result=await ctx.FiezelVoiceRuntime.prepare();
    assert.equal(result.prepared,true);assert.equal(result.storage,'cache');assert.equal(await ctx.FiezelVoiceRuntime.verifyCachedAssets(),true);
  });

  await test('cache quota failure is fail-closed and never marked prepared',async()=>{
    const vm=require('vm');
    const caches=makeCaches({putThrows:true});const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    const ctx=makeContext(caches,fetchFn,storage);vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-quota.js'});
    let rejected=false;try{await ctx.FiezelVoiceRuntime.prepare()}catch(error){rejected=true;assert.match(String(error?.message||error),/Offline voice storage failed/)}
    assert.equal(rejected,true);const result=ctx.FiezelVoiceRuntime.status();assert.equal(result.prepared,false);assert.equal(result.storage,'');
  });

  await test('insufficient origin quota fails before downloading neural assets',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:50*1000*1000}),persisted:async()=>false,persist:async()=>false};
    const ctx=makeContext(caches,fetchFn,storage);vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-preflight.js'});
    let rejected=false;try{await ctx.FiezelVoiceRuntime.prepare()}catch(error){rejected=true;assert.match(String(error?.message||error),/Penyimpanan tidak cukup/)}
    assert.equal(rejected,true);assert.equal(fetchFn.calls.length,0,'preflight should fail before network download');
  });

  await test('speak falls back to browser TTS when the neural backend times out',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    localStorageData['fiezel-neural-voice-v1']=JSON.stringify({schema:'fiezel-neural-voice-status-v1',version:'5.19.0',prepared:true,storage:'cache',preparedAt:0});
    for(const [path,size] of fakeAssets)caches._store.set('http://localhost/'+path,{headers:{get:n=>String(n).toLowerCase()==='content-length'?String(size):null}});
    const hangStub={KokoroTTS:{from_pretrained:async()=>new Promise(()=>{})},env:{allowRemoteModels:false,allowLocalModels:true,localModelPath:'./vendor/',wasmPaths:'./vendor/kokoro-js/wasm/'},setVoiceDataUrl:()=>{}};
    const ctx=makeContext(caches,fetchFn,storage);
    ctx.__fiezelDynamicImport=async()=>hangStub;
    ctx.speechSynthesis={speak(utterance){setTimeout(()=>{utterance.onstart?.();utterance.onend?.()},0)}};ctx.SpeechSynthesisUtterance=function(){};
    ctx.FIEZEL_TTS_TIMEOUT_MS=60;ctx.FIEZEL_BROWSER_TTS_TIMEOUT_MS=120;ctx.FIEZEL_INIT_TIMEOUT_MS=50;
    vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-speak-timeout.js'});
    const result=await ctx.FiezelVoiceRuntime.speak('hello world');
    assert.equal(result.provider,'browser-speech-synthesis');
    assert.match(ctx.FiezelVoiceRuntime.status().error,/timed out|timeout/);
  });

  await test('prepare rejects on init timeout, keeps prepared state, and retry skips re-download',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    const hangStub={KokoroTTS:{from_pretrained:async()=>new Promise(()=>{})},env:{allowRemoteModels:false,allowLocalModels:true,localModelPath:'./vendor/',wasmPaths:'./vendor/kokoro-js/wasm/'},setVoiceDataUrl:()=>{}};
    const ctx=makeContext(caches,fetchFn,storage);
    ctx.__fiezelDynamicImport=async()=>hangStub;
    ctx.FIEZEL_INIT_TIMEOUT_MS=80;ctx.FIEZEL_TTS_TIMEOUT_MS=60;ctx.FIEZEL_BROWSER_TTS_TIMEOUT_MS=120;
    vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-init-timeout.js'});
    let firstRejected=false;
    try{await ctx.FiezelVoiceRuntime.prepare()}catch(error){firstRejected=true;assert.match(String(error?.message||error),/timed out|timeout/)}
    assert.equal(firstRejected,true);
    const afterFirst=ctx.FiezelVoiceRuntime.status();
    assert.equal(afterFirst.prepared,true,'prepared must survive init failure when assets are cached');
    assert.equal(afterFirst.assetsCached,true);assert.equal(afterFirst.storage,'cache');
    const callsAfterFirst=fetchFn.calls.length;
    let secondRejected=false;
    try{await ctx.FiezelVoiceRuntime.prepare()}catch{secondRejected=true}
    assert.equal(secondRejected,true);
    assert.equal(fetchFn.calls.length,callsAfterFirst,'retry must not re-download valid cached assets');
  });

  await test('speak falls back fast after a failed init without re-attempting per item',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    localStorageData['fiezel-neural-voice-v1']=JSON.stringify({schema:'fiezel-neural-voice-status-v1',version:'5.19.0',prepared:true,storage:'cache',preparedAt:0});
    for(const [path,size] of fakeAssets)caches._store.set('http://localhost/'+path,{headers:{get:n=>String(n).toLowerCase()==='content-length'?String(size):null}});
    const hangStub={KokoroTTS:{from_pretrained:async()=>new Promise(()=>{})},env:{allowRemoteModels:false,allowLocalModels:true,localModelPath:'./vendor/',wasmPaths:'./vendor/kokoro-js/wasm/'},setVoiceDataUrl:()=>{}};
    const ctx=makeContext(caches,fetchFn,storage);
    let imports=0;ctx.__fiezelDynamicImport=async()=>{imports++;return hangStub};
    ctx.speechSynthesis={speak(utterance){setTimeout(()=>{utterance.onstart?.();utterance.onend?.()},0)}};ctx.SpeechSynthesisUtterance=function(){};
    ctx.FIEZEL_TTS_TIMEOUT_MS=60;ctx.FIEZEL_BROWSER_TTS_TIMEOUT_MS=120;ctx.FIEZEL_INIT_TIMEOUT_MS=50;
    vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-fast-fallback.js'});
    const first=await ctx.FiezelVoiceRuntime.speak('hello world');
    assert.equal(first.provider,'browser-speech-synthesis');assert.equal(imports,1);
    const second=await ctx.FiezelVoiceRuntime.speak('second item');
    assert.equal(second.provider,'browser-speech-synthesis');
    assert.equal(imports,1,'failed init must not be re-attempted on every speak');
  });

  await test('late ONNX init is adopted without duplicate model initialization',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    localStorageData['fiezel-neural-voice-v1']=JSON.stringify({schema:'fiezel-neural-voice-status-v1',version:'5.19.0',prepared:true,storage:'cache',preparedAt:0});
    for(const [assetPath,size] of fakeAssets)caches._store.set('http://localhost/'+assetPath,{headers:{get:n=>String(n).toLowerCase()==='content-length'?String(size):null}});
    let resolveInit,imports=0,fromPretrainedCalls=0;
    const delayedStub={
      KokoroTTS:{from_pretrained:()=>{fromPretrainedCalls++;return new Promise(resolve=>{resolveInit=()=>resolve({generate:async()=>({data:new Float32Array([0,.1]),sampling_rate:24000}),voices:{af_heart:{}}})})}},
      env:{allowRemoteModels:false,allowLocalModels:true,localModelPath:'./vendor/',wasmPaths:'./vendor/kokoro-js/wasm/'},setVoiceDataUrl:()=>{}
    };
    const ctx=makeContext(caches,fetchFn,storage);
    ctx.__fiezelDynamicImport=async()=>{imports++;return delayedStub};
    ctx.FiezelWebAudioPlayer={createPlayer:()=>({warm:()=>true,play:async()=>({done:Promise.resolve(),stop(){}})})};
    ctx.speechSynthesis={speak(utterance){setTimeout(()=>{utterance.onstart?.();utterance.onend?.()},0)},cancel(){}};ctx.SpeechSynthesisUtterance=function(){};
    ctx.FIEZEL_INIT_TIMEOUT_MS=30;ctx.FIEZEL_TTS_TIMEOUT_MS=45;ctx.FIEZEL_BROWSER_TTS_TIMEOUT_MS=120;
    vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-late-init.js'});
    const first=await ctx.FiezelVoiceRuntime.speak('first');
    assert.equal(first.provider,'browser-speech-synthesis');
    assert.equal(imports,1);assert.equal(fromPretrainedCalls,1);assert.equal(ctx.FiezelVoiceRuntime.status().ready,false);
    const second=await ctx.FiezelVoiceRuntime.speak('second');
    assert.equal(second.provider,'browser-speech-synthesis','timed-out backend may continue while speech falls back quickly');
    assert.equal(imports,1,'second speech must not import/start another runtime');assert.equal(fromPretrainedCalls,1,'second speech must not create another model session');
    resolveInit();await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(ctx.FiezelVoiceRuntime.status().ready,true,'late backend completion must be adopted into ready state');
    const third=await ctx.FiezelVoiceRuntime.speak('third');
    assert.equal(third.provider,'kokoro-local','subsequent speech must use the adopted neural backend');
    assert.equal(imports,1);assert.equal(fromPretrainedCalls,1);
  });

  await test('cache marker keeps prepared state when localStorage is cleared',async()=>{
    const vm=require('vm');
    const caches=makeCaches();const fetchFn=makeFetch();
    const storage={estimate:async()=>({usage:0,quota:1024*1024*1024}),persisted:async()=>true,persist:async()=>true};
    const ctx=makeContext(caches,fetchFn,storage);vm.createContext(ctx);vm.runInContext(bootstrap,ctx,{filename:'bootstrap-marker.js'});
    const prepared=await ctx.FiezelVoiceRuntime.prepare();
    assert.equal(prepared.prepared,true);
    delete localStorageData['fiezel-neural-voice-v1'];
    await ctx.FiezelVoiceRuntime.refreshPreparedFlag();
    assert.equal(ctx.FiezelVoiceRuntime.status().prepared,true);
  });

  console.log(`FIEZEL Neural Voice: PASS ${pass}/0`);
})().catch(error=>{console.error('FIEZEL Neural Voice: FAIL',error.stack||error);process.exit(1)});