'use strict';
const assert=require('assert');
const core=require('./features/neural-voice/fiezel-neural-voice.js');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function makeEnv(){
  const data={};
  return{
    FIEZEL_VERSION:'5.19.0',
    localStorage:{getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=String(v)}},
    _data:data
  };
}
function diagnostics(env){return JSON.parse(env._data['fiezel-neural-voice-diagnostics-v1']||'[]')}
function config(){return{voices:{fiezelPrimary:'af_heart'},limits:{maxInputChars:3600,targetChunkWords:140,hardChunkWords:190},fallback:{browserSpeechSynthesis:false}}}

(async()=>{
  {
    const env=makeEnv();
    const adapter={kind:'neural-test',generate:async()=>{await sleep(5);return{data:new Float32Array([0,.1]),sampling_rate:24000}}};
    const service=core.createVoiceService({config:config(),adapter,env,generationTimeoutMs:20,playAudio:async()=>({done:sleep(80),stop(){}})});
    const started=Date.now();
    const result=await service.speak('hello',{allowFallback:false});
    const elapsed=Date.now()-started;
    assert.equal(result.provider,'neural-test');
    assert.ok(elapsed>=65,'playback must be allowed to finish after the generation timeout window; elapsed='+elapsed);
    const log=diagnostics(env);
    const phases=log.map(x=>x.phase);
    assert.ok(phases.includes('generate_ready')&&phases.includes('playback_start')&&phases.includes('playback_done'));
    const ids=new Set(log.filter(x=>['generate_start','generate_ready','playback_start','playback_done'].includes(x.phase)).map(x=>x.requestId));
    assert.equal(ids.size,1,'one requestId must correlate generation and playback');
  }

  {
    const env=makeEnv();
    const adapter={kind:'neural-test',generate:async()=>new Promise(()=>{})};
    const service=core.createVoiceService({config:config(),adapter,env,generationTimeoutMs:20});
    const outcome=await Promise.race([
      service.speak('hello',{allowFallback:false}).then(()=>({kind:'resolved'})).catch(error=>({kind:'rejected',error})),
      sleep(120).then(()=>({kind:'hung'}))
    ]);
    assert.equal(outcome.kind,'rejected','generation must time out instead of hanging');
    assert.match(String(outcome.error&&outcome.error.message||outcome.error),/neural_generation_timeout/);
    assert.ok(diagnostics(env).some(x=>x.phase==='generate_timeout'));
  }

  {
    const env=makeEnv();
    let playCalls=0;
    const adapter={kind:'neural-test',generate:async()=>{await sleep(55);return{data:new Float32Array([0,.1]),sampling_rate:24000}}};
    const service=core.createVoiceService({
      config:config(),adapter,env,generationTimeoutMs:20,
      playAudio:async()=>{playCalls++;return{done:Promise.resolve(),stop(){}}}
    });
    const outcome=await service.speak('late generation',{allowFallback:false})
      .then(()=>({kind:'resolved'}))
      .catch(error=>({kind:'rejected',error}));
    assert.equal(outcome.kind,'rejected','late generation must still reject at the timeout boundary');
    assert.match(String(outcome.error&&outcome.error.message||outcome.error),/neural_generation_timeout/);
    await sleep(70);
    const log=diagnostics(env);
    assert.equal(playCalls,0,'late adapter resolution must never start playback');
    assert.ok(log.some(x=>x.phase==='generate_timeout'),'late request must record generate_timeout');
    assert.ok(!log.some(x=>x.phase==='generate_ready'),'late adapter resolution must not emit generate_ready after timeout');
    assert.ok(!log.some(x=>x.phase==='playback_start'),'late adapter resolution must not emit playback_start after timeout');
  }

  {
    const env=makeEnv();
    const adapter={kind:'neural-test',generate:async()=>({data:new Float32Array([0]),sampling_rate:24000})};
    const service=core.createVoiceService({config:config(),adapter,env,generationTimeoutMs:20,playAudio:async()=>{throw new Error('playback_failed')}});
    await assert.rejects(()=>service.speak('hello',{allowFallback:false}),/playback_failed/);
    const log=diagnostics(env);
    assert.ok(!log.some(x=>x.phase==='generate_timeout'),'playback failure must not be mislabeled as generation timeout');
  }

  console.log('FIEZEL neural generation timeout regression: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
