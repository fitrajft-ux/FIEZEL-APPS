const fs=require('fs');
const path=require('path');
const assert=require('assert');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const boot=read('features/neural-voice/fiezel-neural-voice-bootstrap.js');
const adapter=read('features/neural-voice/fiezel-kokoro-adapter.js');
const aud=read('features/neural-voice/fiezel-neural-voice-audibility-fix.js');
const app=read('app.js');
const sw=read('sw.js');
const diag=read('features/neural-voice/fiezel-diag-panel.js');
assert.ok(boot.includes("diag({phase:'prepared_idle'})"),'prepared startup must remain idle');
assert.ok(!boot.includes("if(prepared)initialize().then(()=>diag({phase:'prewarm_ready'}))"),'startup must not prewarm Kokoro');
assert.ok(boot.includes("wasmEnv.numThreads=1"),'Apple policy must disable WASM multithreading when the env is directly exposed');
assert.ok(boot.includes("wasmEnv.proxy=false"),'Apple policy must avoid the proxy-worker roundtrip when the env is directly exposed');
assert.ok(boot.includes("apple-standalone-single-thread-direct"));
assert.ok(boot.includes('onStage:entry=>diag(entry)'),'adapter stages must feed bounded runtime diagnostics');
for(const phase of ['wasm_policy','adapter_instance_start','adapter_stage_probe_ready','adapter_instance_ready','adapter_generate_enter','adapter_generate_invoke','adapter_generate_dispatched','adapter_tokenizer_enter','adapter_tokenizer_resolved','adapter_tokenizer_error','adapter_model_enter','adapter_model_dispatched','adapter_model_resolved','adapter_model_error','adapter_pretoken_voice_enter','adapter_pretoken_voice_resolved','adapter_pretoken_voice_error','adapter_generate_from_ids_enter','adapter_generate_from_ids_dispatched','adapter_generate_from_ids_resolved','adapter_generate_from_ids_error','adapter_generate_resolved','adapter_generate_error']){
  assert.ok(adapter.includes(`stage('${phase}'`),`missing adapter diagnostic stage ${phase}`);
}
assert.ok(adapter.includes("apple-standalone-single-thread-direct-default"),'m025-3 must label the pinned ORT default policy without pretending read-back verification');
assert.ok(adapter.includes("source: 'onnxruntime-web-1.22-runtime-default'"),'effective policy must identify its pinned runtime basis');
assert.ok(adapter.includes('readBack: false'),'effective default diagnostics must not claim a setter/read-back verification that the Kokoro wrapper cannot expose');
assert.ok(adapter.includes("typeof tts.tokenizer === 'function'")&&adapter.includes("typeof tts.model === 'function'"),'m025-3 must instrument tokenizer and model call boundaries');
assert.ok(adapter.includes("typeof tts._validate_voice === 'function'"),'m025-4 must instrument the pre-tokenizer voice-selection callable when present');
assert.ok(adapter.includes("typeof tts.generate_from_ids === 'function'"),'m025-4 must instrument the voice-cache (generate_from_ids) callable when present');
assert.ok(adapter.includes('__fiezelStageProbeV2')&&!adapter.includes('__fiezelStageProbeV1'),'m025-4 probe set must advance its one-shot guard to V2');
assert.ok(adapter.includes("stage('adapter_stage_probe_ready', { tokenizer, model, voice, generateFromIds })"),'probe-ready must report every instrumented boundary');
assert.ok(adapter.includes("stage('adapter_pretoken_voice_resolved', { elapsedMs: Date.now() - startedAt })"),'pre-tokenizer resolved payload must be bounded (elapsed only)');
assert.ok(adapter.includes("stage('adapter_generate_from_ids_resolved', { elapsedMs: Date.now() - startedAt })"),'voice-cache resolved payload must be bounded (elapsed only)');
assert.ok(adapter.includes("stage('adapter_pretoken_voice_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) })"),'pre-tokenizer error payload must reduce to bounded kind');
assert.ok(!adapter.includes("stage('adapter_pretoken_voice_enter', { text"),'pre-tokenizer diagnostics must never include prompt text');
assert.ok(!adapter.includes("stage('adapter_generate_enter', { text"),'adapter diagnostics must never include prompt text');
assert.ok(!adapter.includes('phonemes'),'adapter diagnostics must not persist phoneme content');
assert.ok(adapter.includes('tokenCount'),'tokenizer diagnostics may report count only, never token content');
assert.ok(adapter.includes('function errorKind(error)'),'adapter diagnostics must reduce errors to non-message kind');
assert.ok(!adapter.includes('error.message'),'adapter stage diagnostics must not persist external error messages that could echo prompt text');
assert.ok(boot.includes("root.navigator?.standalone===true?30000:20000"),'standalone neural generation timeout must remain unchanged');
assert.ok(boot.includes("phase:'speak_init_ready'")&&boot.includes("phase:'speak_neural_start'"),'init and neural speech timing must be diagnosed separately');
assert.ok(boot.includes('generationTimeoutMs:NEURAL_GENERATION_TIMEOUT_MS'),'generation timeout must live in the voice service');
assert.ok(!boot.includes("const timeout=Symbol('fiezel-tts-timeout')"),'playback must not be subject to the generation timeout');
assert.ok(boot.includes('initialized:!!service'));
assert.ok(boot.includes('audibleVerified'));
assert.ok(boot.includes('circuitOpen'));
assert.ok(boot.includes("allowFallback:false"),'inner neural service must never own browser fallback');
assert.ok(boot.includes("const shouldOpenCircuit=!!service")&&boot.includes("circuitOpen=shouldOpenCircuit;audibleVerified=false"),'speech failure with initialized service must open circuit without blocking late init adoption');
assert.ok(aud.includes("runtime.speak(text,{...options,allowFallback:false})"),'audibility layer must call base runtime neural-only');
assert.ok(aud.includes("if(neuralOnly)throw error"),'neural-only UI test must never be masked by browser TTS');
assert.ok(aud.includes('DIAG_LIMIT=200')&&aud.includes('slice(-DIAG_LIMIT)'),'audibility writes must preserve the shared trace');
assert.ok(app.includes("speed:.92,allowFallback:false"),'Tes suara must be neural-only');
assert.ok(sw.includes("COEP_POLICY='credentialless'"));
assert.ok(sw.includes("'same-origin-allow-popups'"));
assert.ok(sw.includes('Third-party SDK/API traffic is deliberately left to the browser'));
assert.ok(sw.includes("const SW_REV='m025-4-"),'m025-4 product deploy must force a matching shell refresh');
// m025-4 deploy-scope promotion (T-026-B1): DIAG_BUILD and SW_REV advance in
// lockstep with the pre-tokenizer probe set so the exact-head A7 boundary
// (base=3 head=4 expected=4) is satisfied.
assert.ok(diag.includes("var DIAG_BUILD = 'm025-4';"),'diagnostics build must advance exactly to m025-4');
assert.ok(diag.includes('puterWorkersLoaded')&&diag.includes('puterAuth'));
assert.ok(read('version.js').includes("'5.19.0'"));
assert.equal(JSON.parse(read('VERSION.json')).version,'5.19.0');

// ---- m025-4 runtime verification of the pre-tokenizer diagnostic boundary ----
(async()=>{
  const adapterApi=require('./features/neural-voice/fiezel-kokoro-adapter.js');
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const env=()=>({allowRemoteModels:true,allowLocalModels:false,localModelPath:'./vendor/',wasmPaths:'./vendor/kokoro-js/wasm/'});
  const makeAdapter=(tts,onStage)=>adapterApi.createKokoroAdapter({KokoroTTS:{from_pretrained:async()=>tts},kokoroEnv:env(),setVoiceDataUrl:()=>{},onStage});

  {
    // Happy path: voice selection must precede the tokenizer, the voice-cache
    // (generate_from_ids) boundary must precede the model, and the resolved
    // stage must be last, with the probe-ready report covering all four probes.
    const stages=[];
    const tts={
      _validate_voice(voice){return String(voice||'').charAt(0)},
      tokenizer(phon){return{input_ids:{dims:[1,phon.length]}}},
      model:async()=>({waveform:{data:new Float32Array([0,0.5]),sampling_rate:24000}}),
      generate_from_ids:async function(ids,opts){const{waveform}=await this.model({input_ids:ids});return{audio:waveform.data,sampling_rate:24000}},
      generate:async function(text,opts){const r=this._validate_voice(opts.voice);const phon=await Promise.resolve(text+'_'+r);const{input_ids}=this.tokenizer(phon,{truncation:true});return this.generate_from_ids(input_ids,opts)}
    };
    const adapter=makeAdapter(tts,e=>stages.push(e));
    const out=await adapter.generate('hello',{voice:'af_heart',speed:1});
    assert.ok(out&&out.audio&&out.audio.length===2,'m025-4 must return audio unchanged');
    const phases=stages.map(s=>s.phase);
    const idx=p=>phases.indexOf(p);
    assert.ok(idx('adapter_pretoken_voice_enter')>=0,'pre-tokenizer voice boundary must fire');
    assert.ok(idx('adapter_pretoken_voice_resolved')<idx('adapter_tokenizer_enter'),'voice selection must precede tokenizer');
    assert.ok(idx('adapter_tokenizer_enter')<idx('adapter_generate_from_ids_enter'),'tokenizer must precede voice-cache boundary');
    assert.ok(idx('adapter_generate_from_ids_enter')<idx('adapter_model_enter'),'voice-cache boundary must precede model execution');
    assert.ok(idx('adapter_model_resolved')<idx('adapter_generate_from_ids_resolved'),'model must resolve before voice-cache boundary resolves');
    assert.ok(idx('adapter_generate_resolved')===phases.length-1,'generate must resolve last');
    const probeReady=stages.find(s=>s.phase==='adapter_stage_probe_ready');
    assert.deepStrictEqual(probeReady,{phase:'adapter_stage_probe_ready',tokenizer:true,model:true,voice:true,generateFromIds:true},'probe-ready must report all four instrumented boundaries');
    for(const s of stages){
      if(!/^adapter_pretoken_voice|^adapter_generate_from_ids/.test(s.phase))continue;
      const keys=Object.keys(s).filter(k=>k!=='phase').sort();
      const allowed=s.phase.endsWith('_enter')?[]:(s.phase.endsWith('_error')?['elapsedMs','errorKind']:['elapsedMs']);
      assert.deepStrictEqual(keys,allowed,'m025-4 payload must be bounded (no prompt/phoneme/token content) in '+s.phase);
    }
  }

  {
    // Stalled phonemizer (the m025-3 physical stall): the trace must stop after
    // voice selection + generate dispatch, with tokenizer/model unobserved, so
    // the next device trace can distinguish the phonemizer window.
    const stages=[];
    const tts={
      _validate_voice(){return'a'},
      tokenizer:()=>({input_ids:{dims:[1,1]}}),
      model:async()=>({waveform:{data:new Float32Array([0])}}),
      generate:async function(text,opts){this._validate_voice(opts.voice);await new Promise(()=>{});return{audio:new Float32Array([0]),sampling_rate:24000}}
    };
    const adapter=makeAdapter(tts,e=>stages.push(e));
    const pending=adapter.generate('hello',{voice:'af_heart',speed:1});
    await sleep(30);
    const phases=stages.map(s=>s.phase);
    assert.ok(phases.includes('adapter_pretoken_voice_enter')&&phases.includes('adapter_pretoken_voice_resolved'),'voice selection must complete before the stall');
    assert.ok(phases.includes('adapter_generate_dispatched'),'generate must dispatch before the stall');
    assert.ok(!phases.includes('adapter_tokenizer_enter')&&!phases.includes('adapter_model_enter'),'stall must leave tokenizer/model unobserved');
    assert.ok(!phases.includes('adapter_generate_resolved'),'stall must not resolve');
    pending.catch(()=>{});
  }

  {
    // Unknown voice must surface a bounded pre-tokenizer voice error and still
    // reach the generate-level error without leaking the message text.
    const stages=[];
    const tts={
      _validate_voice(){throw new Error('Voice "nope" not found. Should be one of: af_heart')},
      tokenizer:()=>({}),
      model:async()=>({waveform:{data:new Float32Array([0])}}),
      generate:async function(text,opts){this._validate_voice(opts.voice);return{audio:new Float32Array([0]),sampling_rate:24000}}
    };
    const adapter=makeAdapter(tts,e=>stages.push(e));
    await assert.rejects(()=>adapter.generate('hello',{voice:'nope',speed:1}),/Voice "nope"/);
    const errStage=stages.find(s=>s.phase==='adapter_pretoken_voice_error');
    assert.ok(errStage,'pre-tokenizer voice error must be emitted');
    assert.equal(errStage.errorKind,'Error','error must reduce to name/code kind only');
    assert.ok(!errStage.errorKind.includes('nope'),'error message must not leak into diagnostics');
    assert.ok(stages.some(s=>s.phase==='adapter_generate_error'),'voice error must still reach generate level');
  }

  {
    // Instances without the callable boundaries (plain mock) must keep working
    // unchanged with all probes reported absent.
    const stages=[];
    const tts={generate:async()=>({data:new Float32Array([0]),sampling_rate:24000})};
    const adapter=makeAdapter(tts,e=>stages.push(e));
    const out=await adapter.generate('hello',{voice:'af_heart',speed:1});
    assert.ok(out&&out.data,'plain mock instance must still generate');
    const probeReady=stages.find(s=>s.phase==='adapter_stage_probe_ready');
    assert.deepStrictEqual(probeReady,{phase:'adapter_stage_probe_ready',tokenizer:false,model:false,voice:false,generateFromIds:false},'absent callables must report false');
  }
})().then(()=>{console.log('FIEZEL neural device hotfix m025-4: PASS')}).catch(error=>{console.error('FIEZEL neural device hotfix m025-4: FAIL',error.stack||error);process.exit(1)});