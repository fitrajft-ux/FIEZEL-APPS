'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const playerSource = read('features/neural-voice/fiezel-web-audio-player.js');
const voiceSource = read('features/neural-voice/fiezel-neural-voice.js');
const workletSource = read('features/neural-voice/fiezel-pcm-renderer-worklet.js');
const swSource = read('sw.js');
const diagSource = read('features/neural-voice/fiezel-diag-panel.js');
const qualitySource = read('.github/workflows/quality.yml');

// 1. Worklet registration, queueing, sample-rate defense, and epoch cancellation.
let Processor = null;
const workletMessages = [];
class FakeAudioWorkletProcessor {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage(message) { workletMessages.push(message); }
    };
  }
}
vm.runInNewContext(workletSource, {
  AudioWorkletProcessor: FakeAudioWorkletProcessor,
  sampleRate: 44100,
  registerProcessor(name, klass) {
    assert.equal(name, 'fiezel-pcm-renderer');
    Processor = klass;
  },
  Float32Array,
  Number,
  Math,
  String
});
assert.equal(typeof Processor, 'function', 'PCM renderer worklet must register');
const processor = new Processor();
processor.handleMessage({
  type: 'enqueue', id: 'a', epoch: 1, sampleRate: 44100,
  samples: new Float32Array([1, 1, 1, 1]), gapFrames: 1, fadeInFrames: 2, fadeOutFrames: 2
});
const out = new Float32Array(8);
assert.equal(processor.process([], [[out]]), true);
assert.equal(out[0], 0, 'requested gap must render silence');
assert.ok(out[1] > 0 && out[1] < 1, 'worklet applies fade-in on render thread');
assert.ok(workletMessages.some(m => m.type === 'done' && m.id === 'a'), 'worklet resolves completed chunk');

processor.handleMessage({
  type: 'enqueue', id: 'wrong-rate', epoch: 1, sampleRate: 48000,
  samples: new Float32Array([0.1, 0.2])
});
assert.ok(workletMessages.some(m => m.type === 'error' && m.id === 'wrong-rate' && m.reason === 'sample_rate_mismatch'),
  'worklet must reject wrong-rate PCM instead of pitch/speed shifting it');

processor.handleMessage({
  type: 'enqueue', id: 'b', epoch: 1, sampleRate: 44100,
  samples: new Float32Array([0.1, 0.2])
});
processor.handleMessage({ type: 'clear', epoch: 2, fadeOutFrames: 8 });
assert.ok(workletMessages.some(m => m.type === 'done' && m.id === 'b' && m.cancelled === true),
  'clear cancels queued work');
processor.handleMessage({
  type: 'enqueue', id: 'stale', epoch: 1, sampleRate: 44100,
  samples: new Float32Array([0.1, 0.2])
});
assert.ok(workletMessages.some(m => m.type === 'done' && m.id === 'stale' && m.cancelled === true && m.reason === 'stale_epoch'),
  'a late enqueue from an older epoch must never become audible after clear/stop');

processor.handleMessage({ type: 'enqueue', id: 'invalid', epoch: 2, sampleRate: 44100, samples: new Float32Array(0) });
assert.ok(workletMessages.some(m => m.type === 'error' && m.id === 'invalid' && m.reason === 'invalid_pcm'),
  'invalid PCM must be terminally reported to the player settlement map');
assert.match(workletSource, /finishEntry\(entry, entry\.cancelled\)/,
  'a cancellation that reaches natural sample end must still report cancelled');

// 2. Player integration must be Apple-standalone-only, persistent, and rollback-safe.
assert.match(playerSource, /fiezel-pcm-renderer-worklet\.js/, 'player must load the PCM worklet module');
assert.match(playerSource, /navigator[^\n]*standalone|standalone[^\n]*navigator/, 'worklet routing must be scoped to Apple standalone');
assert.match(playerSource, /audioWorklet[^\n]*addModule|addModule[^\n]*audioWorklet/, 'player must prepare AudioWorklet module');
assert.match(playerSource, /AudioWorkletNode/, 'player must instantiate AudioWorkletNode');
assert.match(playerSource, /contextRate\s*===\s*sampleRate/, 'player must require exact source/context rate before worklet routing');
assert.match(playerSource, /sampleRate,\s*\n\s*samples:/, 'source sample rate must ride with every worklet enqueue');
assert.match(playerSource, /__fiezelPcmPlaybackEpoch/, 'player must keep a shared playback epoch across Apple player instances');
assert.match(playerSource, /function playbackEpoch\(\) \{\s*if \(!appleStandalone\) return 0;/,
  'epoch arbitration must be inert outside Apple standalone so legacy non-Apple playback stays unchanged');
assert.match(playerSource, /let activePlaybackEpoch = 0;/, 'each Apple player must bind continuous chunks to its own active utterance epoch');
assert.match(playerSource, /if \(continuous && activePlaybackEpoch > 0\) return activePlaybackEpoch;/,
  'continuous chunks must retain their original utterance epoch instead of adopting a newer global epoch');
assert.match(playerSource, /epoch < playbackEpoch\(\)/,
  'a continuation whose utterance epoch was superseded by another player must fail before playback');
assert.match(playerSource, /const sharedRuntime = env\.__fiezelPcmWorkletRuntime;[\s\S]{0,220}workletRuntimes\.add\(sharedRuntime\)/,
  'a new non-continuous player must clear the shared worklet, not only its closure-local queue');
assert.match(playerSource, /message\.type === 'error'[^\n]*entry\.finish\(true\)/,
  'worklet error and done messages must both settle exactly once through the pending map');
assert.match(playerSource, /const pending = Array\.from\(runtime\.pending\.values\(\)\);[\s\S]{0,180}entry\.finish\(true\)/,
  'close/failure must settle pending work before disconnecting the shared worklet');
assert.match(playerSource, /createBufferSource\(/, 'legacy AudioBufferSourceNode rollback path must remain');
assert.match(playerSource, /Object\.freeze\(\{\s*play,\s*stop,\s*warm,\s*close\s*\}\)/,
  'public player API must remain exactly play/stop/warm/close');

// 3. Apple standalone inference slice default becomes 32 chars; non-Apple has no hard cap.
const voice = require('./features/neural-voice/fiezel-neural-voice.js');
const config = {
  limits: { maxInputChars: 3600, targetChunkWords: 140, hardChunkWords: 190 },
  fallback: { browserSpeechSynthesis: false },
  voices: { fiezelPrimary: 'test' }
};
const appleEnv = {
  navigator: { standalone: true },
  localStorage: { getItem: () => null, setItem: () => {} }
};
const appleService = voice.createVoiceService({ config, env: appleEnv });
const appleChunks = appleService.splitIntoChunks('Satu kalimat yang sengaja dibuat cukup panjang untuk membuktikan bahwa batas karakter Apple standalone benar benar turun menjadi tiga puluh dua karakter.');
assert.ok(appleChunks.length > 1, 'Apple long input should be sliced');
assert.ok(Math.max(...appleChunks.map(x => x.length)) <= 32, 'Apple default hard cap must be <=32 chars');
const normalService = voice.createVoiceService({ config, env: { navigator: { standalone: false } } });
const normalChunks = normalService.splitIntoChunks('This ordinary non Apple sentence is intentionally longer than thirty two characters but should keep the normal chunk policy unchanged.');
assert.ok(normalChunks.some(x => x.length > 32), 'non-Apple policy must not inherit the 32-char cap');
assert.match(voiceSource, /Math\.max\(16,\s*Math\.min\(128,\s*Number\(options\.appleHardChunkChars\)\s*\|\|\s*32\)\)/,
  'source must carry the effective 32-char Apple default with a floor low enough to allow it');
assert.match(voiceSource, /apple-standalone-inference-slice-v3/, 'Apple policy identifier must advance with the new effective cap');

// 4. Release and shell coherence. M028 runtime invariants remain; release identity advances with M028.2.
assert.match(swSource, /fiezel-pcm-renderer-worklet\.js/, 'worklet must be in service-worker shell assets');
// The M028.2 requirement is a FLOOR, not a fixed value: diagnostics must have advanced to
// m025-51 or beyond, and the shell must carry the same build. Pinning it to exactly m025-51
// made every later release fail this gate for a reason that has nothing to do with audio
// integrity. Regressing below the floor, or letting the two markers drift apart, still fails.
const diagBuildMatch = diagSource.match(/DIAG_BUILD\s*=\s*['"]m025-(\d+)['"]/);
assert.ok(diagBuildMatch, 'DIAG_BUILD must stay parseable as m025-N');
assert.ok(Number(diagBuildMatch[1]) >= 51,
  `M028.2 candidate must keep diagnostics at m025-51 or later (found m025-${diagBuildMatch[1]})`);
assert.match(swSource, new RegExp(`SW_REV\\s*=\\s*['"]m025-${diagBuildMatch[1]}-`),
  'SW revision must carry the same build as DIAG_BUILD');
assert.match(qualitySource, /permissions:\s*\n\s*contents:\s*read/, 'Quality must remain read-only and never implement/push source');
assert.doesNotMatch(qualitySource, /git\s+push|contents:\s*write|Apply M028 in-scope implementation/,
  'Quality Gate must not mutate or push the candidate branch');
assert.match(qualitySource, /node neural-voice-m028-audio-integrity-test\.js/, 'focused M028 test must run in Quality');

// 5. Scope-lock / architecture invariants visible in implementation source.
assert.match(voiceSource, /SCHEDULE_DEPTH\s*=\s*2/, 'bounded schedule depth must remain 2');
assert.doesNotMatch(playerSource, /FiezelVoiceRuntime\s*=/, 'player must not mutate FiezelVoiceRuntime contract');
assert.doesNotMatch(playerSource, /createScriptProcessor|ScriptProcessorNode/, 'M028 must use AudioWorklet or existing legacy playback, never deprecated ScriptProcessor');

// 6. m028-2 lead-in silence.
//
// Measured on the shipped Supertonic engine, every render begins with 215-557ms below the
// silence floor before its first speech sample. The service only asked for trimming when a
// line was JOINED to another, so a single-chunk reply played that dead air in full.
const Player = require('./features/neural-voice/fiezel-web-audio-player.js');

const LEAD = 4410;   // 100ms at 44.1kHz
const TAIL = 8820;   // 200ms
const SPEECH = 4410;
const KEEP = Math.round(44100 * 0.012);   // TRIM_KEEP_S of air is deliberately left
const shaped = new Float32Array(LEAD + SPEECH + TAIL);
for (let i = 0; i < SPEECH; i += 1) shaped[LEAD + i] = (i % 2 === 0 ? 0.4 : -0.4);

const headOnly = Player.trimSilence(shaped, 44100, { head: true, tail: false });
assert.ok(headOnly.length < shaped.length, 'head trim must remove the engine lead-in');
assert.ok(headOnly.length >= SPEECH + TAIL, 'head trim must not touch the tail');
assert.ok(Math.abs(headOnly.length - (shaped.length - LEAD + KEEP)) <= 2,
  'head trim removes the dead air and leaves TRIM_KEEP_S of it');

const bothEdges = Player.trimSilence(shaped, 44100, { head: true, tail: true });
assert.ok(bothEdges.length < headOnly.length, 'seam trimming both edges must still be available');
assert.equal(Player.trimSilence(shaped, 44100).length, bothEdges.length,
  'the no-options default must stay exactly what m025-47 shipped');
assert.equal(Player.trimSilence(shaped, 44100, { head: false, tail: false }), shaped,
  'asking for no trim returns the buffer by identity');

// m028-4: both edges on every line. A standalone sentence used to keep its 636ms tail on
// the m025-47 reasoning that it spaced the next Library sentence; measured, that is dead
// air rather than a governed pause, and it is what OWNER hears as a book that never joins.
assert.match(voiceSource, /gapMs, trim: true \}/,
  'the streaming path must trim both edges, joined or not');
assert.doesNotMatch(voiceSource, /trim: joined/,
  'trimming must no longer be conditional on the line being joined');

console.log('M028 audio integrity focused acceptance PASS');
