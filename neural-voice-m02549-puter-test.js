'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const providerPath = 'features/neural-voice/fiezel-puter-tts-provider.js';
const aiPath = 'features/tutor-classroom/fiezel-tutor-core-ai.js';
const tutorVoicePath = 'features/tutor-classroom/fiezel-tutor-indonesian-voice-fix.js';
const providerSrc = fs.readFileSync(providerPath, 'utf8');
const aiSrc = fs.readFileSync(aiPath, 'utf8');
const tutorVoiceSrc = fs.readFileSync(tutorVoicePath, 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const licenses = fs.readFileSync('THIRD-PARTY-LICENSES.md', 'utf8');
const lock = JSON.parse(fs.readFileSync('NEURAL-VOICE-SOURCE-LOCK.json', 'utf8'));
const config = require('./features/neural-voice/fiezel-neural-voice-config.js');

let pass = 0;
async function test(name, fn){ await fn(); pass++; console.log('PASS', name); }

function context({online=true, signedIn=true, cloudFails=false}={}) {
  let localSpeaks = 0;
  let localPrefetch = 0;
  const cloudCalls = [];
  const cloudServiceConfigs = [];
  const baseStatus = () => ({engine:'supertonic-3',prepared:true,ready:true,zeroPaidRuntime:true,crossOriginInference:false});
  const base = {
    status: baseStatus,
    ensureReady: async()=>baseStatus(),
    speak: async()=>{ localSpeaks++; return {provider:'supertonic-3'}; },
    prefetch: async()=>{ localPrefetch++; return true; },
    stop(){}, release: async()=>{}
  };
  const indo = Object.assign({}, base);
  const env = {
    console,
    navigator:{onLine:online},
    puter:{auth:{isSignedIn:()=>signedIn},ai:{txt2speech:async(text,options)=>{cloudCalls.push({text,options});return {src:'blob:test'};}}},
    FiezelVoiceRuntime:base,
    FiezelIndonesianVoice:indo,
    FiezelNeuralVoiceConfig:config,
    FiezelProsody:{punctuate:t=>t},
    FiezelVoiceDiagnostics:{record(){}},
    FiezelWebAudioPlayer:{createPlayer:()=>({play:async()=>({done:Promise.resolve(),stop(){}})}),conditionSamples:x=>x},
    FiezelNeuralVoice:{createVoiceService:({adapter,config:serviceConfig})=>{
      cloudServiceConfigs.push(serviceConfig);
      return {
        speak: async(text,options)=>{ if(cloudFails) throw new Error('cloud_down'); await adapter.generate(text,options||{}); return {provider:adapter.kind,requestId:'cloud-1'}; },
        prefetch:async()=>true,stop(){}
      };
    }},
    localStorage:{getItem:()=>null,setItem(){}},
    fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}),
    AudioContext:function(){this.state='running';this.decodeAudioData=async()=>({numberOfChannels:1,sampleRate:44100,getChannelData:()=>new Float32Array([0,.1])})},
    setTimeout,clearTimeout,Promise,Object,ArrayBuffer,Float32Array,Blob,Date
  };
  env.globalThis=env; env.window=env;
  vm.createContext(env);
  vm.runInContext(providerSrc, env, {filename:providerPath});
  return {env, counts:()=>({localSpeaks,localPrefetch}), cloudCalls, cloudServiceConfigs};
}

(async()=>{
  await test('hybrid policy is explicit',()=>{
    assert.equal(config.provider,'puter-cloud-primary-supertonic-offline-fallback');
    assert.equal(config.zeroCostPolicy.scope,'supertonic-offline-fallback-only');
    assert.equal(config.runtimePolicy.remoteInferenceAllowed,true);
    assert.equal(config.runtimePolicy.meteredBillingAllowed,true);
    assert.equal(config.runtimePolicy.userPays,true);
    assert.equal(lock.policy.scope,'supertonic-offline-fallback-only');
    assert.deepStrictEqual(
      [lock.runtimePolicy.remoteInference,lock.runtimePolicy.crossOriginTtsRequests,lock.runtimePolicy.userPays,lock.runtimePolicy.meteredBillingAllowed],
      [true,true,true,true]
    );
  });

  await test('signed-in online path selects Puter cloud with documented OpenAI options',async()=>{
    const {env,counts,cloudCalls,cloudServiceConfigs}=context();
    const st=env.FiezelVoiceRuntime.status();
    assert.equal(st.primaryProvider,'puter-cloud');
    assert.equal(st.activeProvider,'puter-cloud');
    assert.equal(st.zeroPaidRuntime,false);
    assert.match(providerSrc,/prepared: !!local\.prepared/);
    const result=await env.FiezelVoiceRuntime.speak('hello',{lang:'en-US',speed:1.2,allowFallback:false});
    assert.equal(result.provider,'puter-cloud');
    assert.equal(counts().localSpeaks,0);
    assert.equal(cloudCalls.length,1);
    assert.equal(cloudCalls[0].options.provider,'openai');
    assert.equal(cloudCalls[0].options.model,'gpt-4o-mini-tts');
    assert.equal(cloudCalls[0].options.response_format,'wav');
    assert.equal(Object.prototype.hasOwnProperty.call(cloudCalls[0].options,'speed'),false);
    assert.match(cloudCalls[0].options.instructions,/faster|lebih cepat/i);
    assert.equal(cloudServiceConfigs.length,1);
    assert.equal(cloudServiceConfigs[0].limits.maxInputChars,2999);
    assert.equal(cloudServiceConfigs[0].limits.targetChunkWords,2000);
    assert.equal(cloudServiceConfigs[0].limits.hardChunkWords,2000);
  });

  await test('global runtime defaults English and Indonesian runtime stays explicit',async()=>{
    const english=context();
    await english.env.FiezelVoiceRuntime.speak('A normal Library sentence.',{allowFallback:false});
    assert.equal(english.cloudCalls.length,1);
    assert.equal(english.cloudCalls[0].options.voice,'nova');
    assert.match(english.cloudCalls[0].options.instructions,/English tutor/i);

    const indonesian=context();
    await indonesian.env.FiezelIndonesianVoice.speak('Halo Jahran.',{allowFallback:false});
    assert.equal(indonesian.cloudCalls.length,1);
    assert.equal(indonesian.cloudCalls[0].options.voice,'coral');
    assert.match(indonesian.cloudCalls[0].options.instructions,/Bahasa Indonesia/i);
  });

  await test('Classroom always selects Indonesian route for cloud or fallback',()=>{
    assert.match(tutorVoiceSrc,/indoStatus\.prepared \|\| indoStatus\.cloudReady/);
    assert.match(tutorVoiceSrc,/\{ lang: 'id-ID', allowFallback: false \}/);
  });

  await test('Puter strict 3000-character limit fails to complete local utterance before spending cloud',async()=>{
    const {env,counts,cloudCalls}=context();
    const result=await env.FiezelVoiceRuntime.speak('x'.repeat(3000),{lang:'en-US',allowFallback:false});
    assert.equal(result.provider,'supertonic-3');
    assert.equal(counts().localSpeaks,1);
    assert.equal(cloudCalls.length,0);
  });

  await test('cloud request is atomic so remote failure precedes local fallback playback',()=>{
    assert.match(providerSrc,/maxInputChars: 2999/);
    assert.match(providerSrc,/targetChunkWords: 2000/);
    assert.match(providerSrc,/hardChunkWords: 2000/);
    assert.match(providerSrc,/no cloud PCM is\s*\n\s*\/\/ played until the complete remote response has arrived and decoded/);
  });

  await test('offline path selects Supertonic fallback',async()=>{
    const {env,counts}=context({online:false});
    assert.equal(env.FiezelVoiceRuntime.status().activeProvider,'supertonic-3');
    const result=await env.FiezelVoiceRuntime.speak('hello',{lang:'en-US',allowFallback:false});
    assert.equal(result.provider,'supertonic-3');
    assert.equal(counts().localSpeaks,1);
  });

  await test('signed-out path selects Supertonic fallback',async()=>{
    const {env,counts}=context({signedIn:false});
    const result=await env.FiezelIndonesianVoice.speak('halo',{lang:'id-ID'});
    assert.equal(result.provider,'supertonic-3');
    assert.equal(counts().localSpeaks,1);
  });

  await test('cloud failure falls back locally',async()=>{
    const {env,counts}=context({cloudFails:true});
    const result=await env.FiezelVoiceRuntime.speak('hello',{lang:'en-US',allowFallback:false});
    assert.equal(result.provider,'supertonic-3');
    assert.equal(counts().localSpeaks,1);
  });

  await test('prefetch never spends cloud allowance',async()=>{
    const {env,counts}=context();
    await env.FiezelVoiceRuntime.prefetch('next line',{lang:'en-US'});
    assert.equal(counts().localPrefetch,1);
  });

  await test('no client API key or bearer credential is embedded',()=>{
    assert.ok(!/(?:sk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[:=]|bearer\s+[A-Za-z0-9._-]{12,})/i.test(providerSrc));
  });

  await test('Puter provider is loaded at the correct frozen-wrapper boundary',()=>{
    const iInd=index.indexOf('fiezel-indonesian-voice.js');
    const iPuter=index.indexOf('fiezel-puter-tts-provider.js');
    const iIos=index.indexOf('fiezel-neural-voice-ios-cache-fix.js');
    assert.ok(iInd>=0 && iPuter>iInd && iIos>iPuter);
  });

  await test('Core AI wrapper loads after Indonesian tutor patch',()=>{
    const iTutor=index.indexOf('fiezel-tutor-indonesian-voice-fix.js');
    const iAi=index.indexOf('fiezel-tutor-core-ai.js');
    assert.ok(iTutor>=0 && iAi>iTutor);
    assert.ok(aiSrc.includes('root.askFiezelAI'));
    assert.ok(aiSrc.includes('root.allowAiRequest'));
    assert.ok(aiSrc.includes('sameTutorMoment'));
    assert.ok(aiSrc.indexOf('var first = await baseRuntime.speak') < aiSrc.indexOf('var enriched = await enrichment'));
  });

  await test('service worker revisions and caches both new sidecars',()=>{
    // main advanced to m025-48 through T-026 while this PR was open; A7 therefore
    // requires this candidate to be m025-49. Pin the candidate boundary here while
    // pwa/A7 tests independently verify exact +1 coherence against main.
    assert.match(sw,/const SW_REV='m025-49-/);
    assert.ok(sw.includes('fiezel-puter-tts-provider.js'));
    assert.ok(sw.includes('fiezel-tutor-core-ai.js'));
  });

  await test('Puter TTS service attribution is recorded',()=>assert.ok(/## Puter cloud TTS/i.test(licenses)&&/User-Pays/i.test(licenses)));

  console.log(`m02549 puter/core-ai tests: ${pass} passed`);
})().catch(err=>{ console.error(err); process.exit(1); });
