'use strict';
/**
 * m025-48 regression: the crackle, the delay, and the flat Indonesian delivery.
 *
 * Each block below pins a mechanism rather than a wording, so a later refactor is free to
 * move the code and is not free to bring the defect back:
 *
 *   1. conditioning      - DC offset, one-sample impulses and missing headroom are the
 *                          three artefacts an int8 vocoder ships, and each one is a click.
 *   2. context + sink    - a deep render buffer and no synchronous storage write while a
 *                          buffer is on the wire, which is what starves the audio callback.
 *   3. gapless streaming - sentence one plays while sentence two renders, and the two are
 *                          scheduled contiguously instead of restarted.
 *   4. intonation        - a question rises, praise lifts, a softener gets its own beat.
 *   5. spoken numbers    - Indonesian digits are read as Indonesian words.
 *   6. lifecycle         - hiding the tab no longer throws away the engine immediately.
 */
const assert = require('assert');
const fs = require('fs');

const Player = require('./features/neural-voice/fiezel-web-audio-player.js');
const Voice = require('./features/neural-voice/fiezel-neural-voice.js');
const Prosody = require('./features/neural-voice/fiezel-prosody.js');
const Script = require('./features/neural-voice/fiezel-genz-script.js');
const Sink = require('./features/neural-voice/fiezel-voice-diagnostics.js');
const Adapter = require('./features/neural-voice/fiezel-sherpa-vits-adapter.js');
const Config = require('./features/neural-voice/fiezel-neural-voice-config.js');

let pass = 0;
async function test(name, fn) {
  await fn();
  pass += 1;
  console.log('PASS', name);
}

/** A context that advances its own clock, so scheduled start times can be asserted. */
function fakeAudioEnv(startTime) {
  const events = [];
  const ctx = {
    currentTime: typeof startTime === 'number' ? startTime : 5,
    state: 'running',
    destination: { id: 'destination' },
    createBuffer(channels, length, sampleRate) {
      return { length, sampleRate, copyToChannel(data) { this.data = data; } };
    },
    createBufferSource() {
      const node = {
        buffer: null,
        onended: null,
        connect() {},
        start(at) { events.push({ type: 'start', at }); node.__started = at; },
        stop() { events.push({ type: 'stop' }); }
      };
      return node;
    },
    createGain() {
      return {
        gain: {
          value: 1,
          cancelScheduledValues() {},
          setValueAtTime(value, at) { events.push({ type: 'set', value, at }); },
          linearRampToValueAtTime(value, at) { events.push({ type: 'ramp', value, at }); }
        },
        connect() {}
      };
    },
    resume() { return Promise.resolve(); }
  };
  const constructed = [];
  function AudioContext(options) { constructed.push(options || null); return ctx; }
  return { env: { AudioContext }, ctx, events, constructed };
}

function sine(length, amplitude, sampleRate, hz) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = amplitude * Math.sin(2 * Math.PI * hz * i / sampleRate);
  return out;
}

(async () => {

  // ---- 1. conditioning ----------------------------------------------------------

  await test('a clean render is passed through untouched, never copied or dulled', () => {
    const clean = sine(2048, 0.6, 44100, 220);
    assert.strictEqual(Player.conditionSamples(clean), clean,
      'conditioning must cost nothing when there is nothing to repair');
  });

  await test('a DC offset is removed, because an offset waveform clicks at every edge', () => {
    // A real line, not a fragment: the detector deliberately refuses to call the average
    // of a couple of cycles an offset, because that average is a property of the window.
    const offset = sine(44100, 0.4, 44100, 220);
    for (let i = 0; i < offset.length; i += 1) offset[i] += 0.05;
    const out = Player.conditionSamples(offset);
    assert.notStrictEqual(out, offset, 'an offset buffer must be repaired');
    let mean = 0;
    for (const value of out) mean += value;
    mean /= out.length;
    assert.ok(Math.abs(mean) < 0.002, `offset must be gone, got ${mean}`);
  });

  // m025-67 REVERSAL, on device evidence. This case previously asserted that an isolated
  // spike is interpolated away, on the assumption that one sample IS a click. OWNER's
  // physical A/B at m025-66 refuted it: with conditioning off (RAW) the audio was "pecah
  // sedang", with conditioning on (CONDITIONED) it was "pecah berat" - the repair was making
  // things worse. The mechanism is in neural-voice-conditioning-repair-test.js: ordinary
  // plosive attacks match the impulse signature, so the "repair" was deleting consonants and
  // inserting a fresh discontinuity of its own. The assertion is inverted deliberately, not
  // weakened: the waveform must now be preserved exactly.
  await test('an isolated spike is preserved - a consonant attack is not a click', () => {
    const samples = sine(2048, 0.3, 44100, 180);
    const at = 1000;
    samples[at] = 0.95;
    const out = Player.conditionSamples(samples);
    assert.strictEqual(out, samples, 'a healthy waveform must come back untouched');
    assert.strictEqual(out[at], samples[at], 'the spike must survive, it may be a consonant');
    assert.ok(Math.abs(out[at - 40] - samples[at - 40]) < 1e-6, 'the rest of the waveform is untouched');
  });

  await test('real high-frequency speech is not mistaken for an impulse', () => {
    // 6 kHz at full amplitude moves further between samples than the impulse threshold;
    // only the neighbour-agreement test separates it from an artefact.
    const bright = sine(4096, 0.9, 44100, 6000);
    const copy = Float32Array.from(bright);
    const out = Player.conditionSamples(bright);
    for (let i = 0; i < out.length; i += 1) {
      assert.ok(Math.abs(out[i] - copy[i]) < 1e-6, `sample ${i} must survive conditioning`);
    }
  });

  await test('headroom is restored below unity, by scaling and never by reshaping', () => {
    const hot = sine(2048, 0.999, 44100, 220);
    const out = Player.conditionSamples(hot);
    let peak = 0;
    for (const value of out) peak = Math.max(peak, Math.abs(value));
    assert.ok(peak <= Player.PEAK_CEILING + 1e-6, `peak must sit under the ceiling, got ${peak}`);
    const ratioA = out[10] / hot[10];
    const ratioB = out[900] / hot[900];
    assert.ok(Math.abs(ratioA - ratioB) < 1e-6, 'one constant scale, so the waveform keeps its shape');
  });

  await test('trimming removes the model silence either side and keeps the speech', () => {
    const rate = 44100;
    const speech = sine(rate, 0.5, rate, 200);
    const padded = new Float32Array(rate * 2);
    padded.set(speech, Math.round(rate * 0.5));
    const out = Player.trimSilence(padded, rate);
    assert.ok(out.length < padded.length, 'padding must be gone');
    assert.ok(out.length >= speech.length, 'no speech may be lost');
    assert.ok(out.length < speech.length + rate * 0.1, 'only a little air is kept either side');
  });

  // ---- 2. context and diagnostics sink -------------------------------------------

  await test('the shared context asks for a deep buffer at the engine sample rate', async () => {
    const { env, constructed } = fakeAudioEnv(0);
    const player = Player.createPlayer(env);
    await player.play({ audio: sine(441, 0.3, 44100, 200), sampling_rate: 44100 });
    assert.ok(constructed.length >= 1, 'a context is constructed');
    assert.strictEqual(constructed[0].latencyHint, 'playback',
      'an interactive-latency buffer is what a main-thread hiccup turns into a dropout');
    assert.strictEqual(constructed[0].sampleRate, Player.PREFERRED_SAMPLE_RATE,
      'playing 44.1k PCM in a 48k context adds a rate conversion nothing else asked for');
  });

  await test('a context that refuses the options still opens rather than losing all audio', async () => {
    let attempts = 0;
    function PickyAudioContext(options) {
      attempts += 1;
      if (options) throw new Error('unsupported');
      return {
        currentTime: 0, state: 'running', destination: {},
        createBuffer: (c, length, sampleRate) => ({ length, sampleRate, copyToChannel() {} }),
        createBufferSource: () => ({ connect() {}, start() {}, stop() {} }),
        createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} }),
        resume: () => Promise.resolve()
      };
    }
    const env = { AudioContext: PickyAudioContext };
    const player = Player.createPlayer(env);
    const playback = await player.play({ audio: sine(441, 0.3, 44100, 200), sampling_rate: 44100 });
    assert.ok(playback && playback.done, 'audio still plays');
    assert.ok(attempts >= 2, 'the constructor is retried without options before giving up');
  });

  await test('the diagnostics sink holds its writes while audio is scheduled', () => {
    Sink.reset();
    const store = {};
    const env = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
    Sink.record({ phase: 'before' }, env);
    assert.deepStrictEqual(JSON.parse(store[Sink.KEY]).map(x => x.phase), ['before'],
      'outside a critical window the trace persists immediately, exactly as before');
    Sink.begin();
    Sink.record({ phase: 'during_one' }, env);
    Sink.record({ phase: 'during_two' }, env);
    assert.deepStrictEqual(JSON.parse(store[Sink.KEY]).map(x => x.phase), ['before'],
      'no synchronous storage write may happen while a buffer is rendering');
    Sink.end(env);
    assert.deepStrictEqual(JSON.parse(store[Sink.KEY]).map(x => x.phase),
      ['before', 'during_one', 'during_two'], 'nothing is lost, only deferred');
    Sink.reset();
  });

  await test('a flush merges onto what other modules stored meanwhile', () => {
    Sink.reset();
    const store = { [Sink.KEY]: JSON.stringify([{ phase: 'seed' }]) };
    const env = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
    Sink.begin();
    Sink.record({ phase: 'held' }, env);
    // The audibility patch and the diagnostics panel still write directly.
    store[Sink.KEY] = JSON.stringify([{ phase: 'seed' }, { phase: 'other_module' }]);
    Sink.end(env);
    assert.deepStrictEqual(JSON.parse(store[Sink.KEY]).map(x => x.phase),
      ['seed', 'other_module', 'held'], 'an in-memory snapshot must never clobber another writer');
    Sink.reset();
  });

  await test('the player brackets every line it schedules with a critical window', async () => {
    Sink.reset();
    const store = {};
    const { env } = fakeAudioEnv(0);
    env.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    env.FiezelVoiceDiagnostics = Sink;
    const player = Player.createPlayer(env);
    const playback = await player.play({ audio: sine(441, 0.3, 44100, 200), sampling_rate: 44100 });
    assert.strictEqual(Sink.state().critical, 1, 'the window opens when the line is scheduled');
    playback.stop();
    assert.strictEqual(Sink.state().critical, 0, 'and closes when it is done');
    Sink.reset();
  });

  // ---- 3. streaming and gapless scheduling ---------------------------------------

  function streamingService(options) {
    const calls = [];
    const played = [];
    const settings = options || {};
    const rate = 44100;
    const adapter = {
      kind: 'm02548-fake',
      generate(text, generateOptions) {
        calls.push({ text, options: Object.assign({}, generateOptions) });
        return new Promise(resolve => setTimeout(() => resolve({
          // One second of speech per sentence, with the model's own silence at both edges.
          audio: (() => {
            const out = new Float32Array(rate * 1.4);
            out.set(sine(rate, 0.4, rate, 200), Math.round(rate * 0.2));
            return out;
          })(),
          sampling_rate: rate
        }), settings.generateMs || 4));
      }
    };
    const service = Voice.createVoiceService({
      config: {
        voices: { fiezelPrimary: 'test_voice' },
        limits: { maxInputChars: 2000, targetChunkWords: 140, hardChunkWords: 190 },
        fallback: { browserSpeechSynthesis: false }
      },
      adapter,
      env: { localStorage: { getItem: () => null, setItem: () => {} } },
      streamSentences: true,
      prosody: Prosody,
      playAudio: (audio, playOptions) => {
        played.push(Object.assign({}, playOptions));
        return { done: new Promise(resolve => setTimeout(resolve, settings.playMs || 6)), stop() {} };
      }
    });
    return { service, calls, played };
  }

  await test('a paragraph is rendered one sentence at a time, not in one block', async () => {
    const probe = streamingService();
    const text = 'Halo Jahran. Hari ini kita belajar bentuk lampau. Gampang banget kok.';
    await probe.service.speak(text, { voice: 'test_voice', lang: 'id-ID', allowFallback: false });
    assert.strictEqual(probe.calls.length, 3,
      'three sentences must be three renders, so the first one can start while the rest are made');
    assert.ok(/^Halo Jahran/.test(probe.calls[0].text), 'the first render is the first sentence alone');
  });

  await test('every sentence knows where it sits, so delivery can have an arc', async () => {
    const probe = streamingService();
    await probe.service.speak('Satu kalimat. Dua kalimat. Tiga kalimat.',
      { voice: 'test_voice', lang: 'id-ID', allowFallback: false });
    assert.deepStrictEqual(probe.calls.map(c => c.options.position),
      [{ index: 0, total: 3 }, { index: 1, total: 3 }, { index: 2, total: 3 }]);
  });

  await test('sentences after the first are joined onto the schedule, with a real pause', async () => {
    const probe = streamingService();
    await probe.service.speak('Kita mulai sekarang. Terus kita coba lagi.',
      { voice: 'test_voice', lang: 'id-ID', allowFallback: false });
    assert.strictEqual(probe.played[0].continuous, false, 'the first line starts now');
    assert.strictEqual(probe.played[1].continuous, true, 'the second is scheduled onto the first');
    assert.ok(probe.played[1].gapMs >= 300, `a sentence boundary is a breath, got ${probe.played[1].gapMs}ms`);
    assert.ok(probe.played.every(p => p.trim === true), 'joined lines are trimmed so the gap is the only silence');
  });

  await test('a line spoken on its own is trimmed too, so the book joins up', async () => {
    // m028-4 reverses the m025-48 rule above, on measurement rather than taste.
    //
    // That rule kept a standalone line's tail because the Library reads one sentence per
    // speak() call and the tail was believed to be the pause between them. Measured on the
    // shipped engine, the tail is 636ms of model-decided silence and the head another
    // 401ms - dead air that happens to sit where a pause belongs, on top of the
    // main-thread round trip the Library already pays. OWNER reports the result as a book
    // that never joins up. Trimming makes the gap the round trip alone and leaves the
    // pause something the product can set deliberately instead of inherit.
    const probe = streamingService();
    await probe.service.speak('Cuma satu kalimat saja.', { voice: 'test_voice', lang: 'id-ID', allowFallback: false });
    assert.strictEqual(probe.played.length, 1);
    assert.strictEqual(probe.played[0].trim, true,
      'a standalone line must not carry the engine dead air into the gap between sentences');
    assert.strictEqual(probe.played[0].continuous, false);
  });

  await test('the schedule never runs further than one line ahead', async () => {
    // Generation far faster than playback: without a bound the whole passage would be
    // rendered and queued at once, which is a chapter of PCM held in memory.
    const rate = 44100;
    const calls = [];
    let live = 0;
    let peak = 0;
    const adapter = {
      kind: 'm02548-depth',
      generate(text) {
        calls.push(text);
        return Promise.resolve({ audio: new Float32Array(rate).fill(0.3), sampling_rate: rate });
      }
    };
    const service = Voice.createVoiceService({
      config: {
        voices: { fiezelPrimary: 'test_voice' },
        limits: { maxInputChars: 2000, targetChunkWords: 140, hardChunkWords: 190 },
        fallback: { browserSpeechSynthesis: false }
      },
      adapter,
      env: { localStorage: { getItem: () => null, setItem: () => {} } },
      streamSentences: true,
      prosody: Prosody,
      playAudio: () => {
        live += 1;
        peak = Math.max(peak, live);
        return { done: new Promise(resolve => setTimeout(() => { live -= 1; resolve(); }, 20)), stop() {} };
      }
    });
    const sentences = Array.from({ length: 6 }, (_, i) => `Kalimat nomor ${i + 1} di sini.`).join(' ');
    await service.speak(sentences, { voice: 'test_voice', lang: 'id-ID', allowFallback: false });
    assert.strictEqual(calls.length, 6, 'every sentence is still rendered exactly once');
    assert.ok(peak <= 2, `at most two lines may be scheduled at once, saw ${peak}`);
    assert.ok(peak >= 2, 'and the next line must be queued before the current one ends, or the seam reopens');
  });

  await test('the player schedules a joined line at the end of the previous one plus the gap', async () => {
    const { env, ctx, events } = fakeAudioEnv(10);
    const player = Player.createPlayer(env);
    const rate = 44100;
    const first = new Float32Array(rate); // exactly one second
    first.fill(0.3);
    await player.play({ audio: first, sampling_rate: rate });
    events.length = 0;
    const second = await player.play({ audio: first, sampling_rate: rate }, { continuous: true, gapMs: 400 });
    assert.ok(Math.abs(second.startsAt - (ctx.currentTime + 1 + 0.4)) < 1e-6,
      `the joined line must start at previous end + gap, got ${second.startsAt}`);
    const start = events.find(e => e.type === 'start');
    assert.ok(start && Math.abs(start.at - second.startsAt) < 1e-6, 'and be started at exactly that time');
    assert.ok(!events.some(e => e.type === 'stop'), 'joining must never cut the line already playing');
  });

  await test('a non-continuous line still supersedes whatever is playing', async () => {
    const { env, events } = fakeAudioEnv(3);
    const player = Player.createPlayer(env);
    const samples = new Float32Array(4410).fill(0.3);
    await player.play({ audio: samples, sampling_rate: 44100 });
    events.length = 0;
    await player.play({ audio: samples, sampling_rate: 44100 });
    assert.ok(events.some(e => e.type === 'ramp' && e.value === 0), 'the superseded line is faded, not cut');
  });

  await test('stop() reaches a queued line the learner has not heard yet', async () => {
    const { env, events } = fakeAudioEnv(2);
    const player = Player.createPlayer(env);
    const samples = new Float32Array(44100).fill(0.3);
    await player.play({ audio: samples, sampling_rate: 44100 });
    await player.play({ audio: samples, sampling_rate: 44100 }, { continuous: true, gapMs: 300 });
    events.length = 0;
    player.stop();
    const ramps = events.filter(e => e.type === 'ramp' && e.value === 0);
    assert.strictEqual(ramps.length, 2, 'both the audible line and the queued one must be cancelled');
  });

  // ---- 4. intonation, rhythm and delivery ----------------------------------------

  await test('an Indonesian question rises instead of being announced', () => {
    assert.strictEqual(Prosody.punctuate('Gimana kabarmu', 'id-ID'), 'Gimana kabarmu?');
    assert.strictEqual(Prosody.punctuate('Apa kamu udah siap', 'id-ID'), 'Apa kamu udah siap?');
    assert.ok(/\?$/.test(Prosody.punctuate('Gampang kan', 'id-ID')), 'a tag question is still a question');
    assert.strictEqual(Prosody.punctuate('Kita belajar bentuk lampau sekarang', 'id-ID'),
      'Kita belajar bentuk lampau sekarang.', 'a statement still falls');
  });

  await test('praise lifts, and a greeting gets its vocative comma', () => {
    assert.strictEqual(Prosody.punctuate('Wih keren banget', 'id-ID'), 'Wih, keren banget!');
    assert.ok(/^Halo, Jahran/.test(Prosody.punctuate('Halo Jahran ini pelajaran hari ini', 'id-ID')),
      'a name after a greeting is a separate breath group');
  });

  await test('a sentence-final softener is its own beat', () => {
    assert.strictEqual(Prosody.punctuate('Kita mulai sekarang ya', 'id-ID'), 'Kita mulai sekarang, ya.');
    assert.strictEqual(Prosody.punctuate('Coba lagi deh', 'id-ID'), 'Coba lagi, deh.');
    assert.strictEqual(Prosody.punctuate('Gampang kan', 'id-ID'), 'Gampang kan?',
      'one word before the tag is too short to break, but it is still a question');
  });

  await test('the shaping pass stays idempotent and never edits a word', () => {
    const lines = ['Gimana kabarmu', 'Wih keren banget', 'Halo Jahran ini pelajaranmu',
      'Kita mulai sekarang ya', 'Gampang kan', 'Kita pakai pola ini karena hasilnya penting'];
    lines.forEach(line => {
      const once = Prosody.punctuate(line, 'id-ID');
      assert.strictEqual(Prosody.punctuate(once, 'id-ID'), once, `re-running must be a no-op: ${line}`);
      const words = s => s.replace(/[.,;:!?…]/g, '').split(/\s+/).filter(Boolean);
      assert.deepStrictEqual(words(once), words(line), `no word may change: ${line}`);
    });
  });

  await test('English lines keep the exact shaping they had before', () => {
    assert.strictEqual(Prosody.punctuate('Gimana kabarmu', 'en-US'), 'Gimana kabarmu.');
    assert.strictEqual(Prosody.punctuate('Kita mulai sekarang ya', 'en-US'), 'Kita mulai sekarang ya.');
  });

  await test('the gap between sentences is decided by how the last one ended', () => {
    assert.ok(Prosody.gapAfter('Kita mulai.', 'id') >= 350, 'a full stop is a breath');
    assert.ok(Prosody.gapAfter('Gimana kabarmu?', 'id') > Prosody.gapAfter('Kita mulai.', 'id'),
      'a question leaves the listener a beat');
    assert.ok(Prosody.gapAfter('lalu bentuk ketiga,', 'id') < Prosody.gapAfter('Kita mulai.', 'id'),
      'a comma is a lift, not a stop');
    assert.strictEqual(Prosody.gapAfter('', 'id'), 0);
  });

  await test('delivery moves across an utterance and settles at the end', () => {
    const opening = Prosody.emotion('Hari ini kita mulai.', '', 'id', { index: 0, total: 3 });
    const middle = Prosody.emotion('Polanya seperti ini.', '', 'id', { index: 1, total: 3 });
    const closing = Prosody.emotion('Segitu dulu ya.', '', 'id', { index: 2, total: 3 });
    assert.ok(closing.speed < middle.speed, 'the closing sentence slows');
    assert.ok(new Set([opening.speed, middle.speed, closing.speed]).size > 1, 'the rate must not be constant');
    assert.ok(Prosody.emotion('Mantap!', '', 'id', { index: 0, total: 3 }).speed > 1, 'praise quickens');
    assert.strictEqual(Prosody.emotion('One sentence alone.', '', 'en', { index: 0, total: 1 }).id, 'neutral',
      'a line spoken on its own is left exactly as the engine and persona deliver it');
  });

  await test('delivery reaches the engine as rate, and stays under the persona ceiling', async () => {
    const posted = [];
    class FakeWorker {
      constructor() {
        this.onmessage = null;
        setTimeout(() => this.onmessage && this.onmessage({ data: { type: 'sherpa-onnx-tts-ready', numSpeakers: 10, modelType: 7 } }), 0);
      }
      postMessage(message) {
        posted.push(message);
        setTimeout(() => this.onmessage && this.onmessage({
          data: { type: 'sherpa-onnx-tts-result', samples: new Float32Array(1000).fill(0.2), sampleRate: 44100 }
        }), 0);
      }
      terminate() {}
    }
    const adapter = Adapter.createSherpaVitsAdapter({
      env: { Worker: FakeWorker },
      basePath: 'vendor/test/',
      expectedSpeakers: 10,
      modelId: 'test-model',
      voiceSids: { id_natural: 2, tutor_ajar: 2, tutor_hype: 2 },
      defaultVoice: 'id_natural',
      generationLang: 'id',
      personas: null,
      usePersona: false,
      padBetweenPhrases: false,
      usePitchContour: false,
      naturalSpeed: 1,
      generationSteps: 4,
      silenceScale: 0.4,
      prosody: Prosody
    });
    const praise = await adapter.generate('Mantap banget!', { voice: 'id_natural', lang: 'id-ID', position: { index: 0, total: 3 } });
    const closing = await adapter.generate('Segitu dulu.', { voice: 'id_natural', lang: 'id-ID', position: { index: 2, total: 3 } });
    assert.ok(praise.audio.length > 0 && closing.audio.length > 0);
    assert.ok(posted[0].genConfig.speed > posted[1].genConfig.speed,
      'praise must reach the engine faster than the sentence that closes the thought');
    assert.ok(posted.every(m => m.genConfig.speed <= Prosody.PERSONA_SPEED_MAX + 1e-9),
      'a sentence shape may never push a register past the ceiling where its pitch range collapses');
    assert.ok(posted.every(m => m.genConfig.silenceScale === 0.4),
      'the silence scale must reach the engine; unset means the glue default of 0.2');
    assert.ok(posted.every(m => m.genConfig.numSteps === 4), 'denoising steps are unchanged');
    assert.ok(posted.every(m => m.genConfig.extra && m.genConfig.extra.lang === 'id'), 'language is still declared');
  });

  await test('the shaping module actually reaches the engine on a device', () => {
    // The adapter's fallback used to read a variable that is not in its scope, so prosody
    // was null in every browser and punctuate() never ran outside the test suite.
    const src = fs.readFileSync('features/neural-voice/fiezel-sherpa-vits-adapter.js', 'utf8');
    assert.ok(!/typeof root !== 'undefined'/.test(src),
      'nothing here may depend on a `root` that this scope does not have');
    assert.match(src, /var prosody = opts\.prosody \|\| \(env && env\.FiezelProsody\)/);
    const bootstrap = fs.readFileSync('features/neural-voice/fiezel-neural-voice-bootstrap.js', 'utf8');
    const supertonic = fs.readFileSync('features/neural-voice/fiezel-supertonic-voice.js', 'utf8');
    assert.match(bootstrap, /prosody:root\.FiezelProsody/, 'the English engine passes prosody outright');
    assert.match(supertonic, /prosody: root\.FiezelProsody/, 'the Indonesian engine passes prosody outright');

    // And the resolved module must be the one that shapes the text, end to end.
    const posted = [];
    class FakeWorker {
      constructor() {
        this.onmessage = null;
        setTimeout(() => this.onmessage && this.onmessage({ data: { type: 'sherpa-onnx-tts-ready', numSpeakers: 1, modelType: 7 } }), 0);
      }
      postMessage(message) {
        posted.push(message);
        setTimeout(() => this.onmessage && this.onmessage({
          data: { type: 'sherpa-onnx-tts-result', samples: new Float32Array(500).fill(0.2), sampleRate: 44100 }
        }), 0);
      }
      terminate() {}
    }
    const adapter = Adapter.createSherpaVitsAdapter({
      env: { Worker: FakeWorker, FiezelProsody: Prosody },
      basePath: 'vendor/test/', expectedSpeakers: 1, modelId: 'test-model',
      voiceSids: { id_natural: 0 }, defaultVoice: 'id_natural', generationLang: 'id',
      padBetweenPhrases: false, usePitchContour: false, naturalSpeed: 1
    });
    return adapter.generate('Gimana kabarmu', { voice: 'id_natural', lang: 'id-ID' }).then(() => {
      assert.strictEqual(posted[0].genConfig.text || posted[0].text, 'Gimana kabarmu?',
        'the text reaching the engine must carry the mark that makes the line rise');
    });
  });

  await test('both engines take their delivery settings from one config', () => {
    assert.strictEqual(Config.speech.streamSentences, true);
    assert.ok(Config.speech.silenceScale > 0.2 && Config.speech.silenceScale <= 1,
      'above the glue default, below a full stop at every comma');
    const bootstrap = fs.readFileSync('features/neural-voice/fiezel-neural-voice-bootstrap.js', 'utf8');
    const supertonic = fs.readFileSync('features/neural-voice/fiezel-supertonic-voice.js', 'utf8');
    [bootstrap, supertonic].forEach(src => {
      assert.match(src, /silenceScale/, 'each engine passes the silence scale');
      assert.match(src, /streamSentences/, 'each engine streams sentence by sentence');
    });
  });

  // ---- 5. spoken numbers ---------------------------------------------------------

  await test('Indonesian numbers are spoken as Indonesian words', () => {
    assert.strictEqual(Script.speakable('Harganya 50.000 rupiah', 'id'), 'Harganya lima puluh ribu rupiah');
    assert.strictEqual(Script.speakable('Nilainya 3,5 dari 4', 'id'), 'Nilainya tiga koma lima dari empat');
    assert.strictEqual(Script.speakable('Bab ke-3 sekarang', 'id'), 'Bab ketiga sekarang');
    assert.strictEqual(Script.numberWords(1500000), 'satu juta lima ratus ribu');
    assert.strictEqual(Script.numberWords(11), 'sebelas');
    assert.strictEqual(Script.numberWords(17), 'tujuh belas');
    assert.strictEqual(Script.numberWords(100), 'seratus');
  });

  await test('a clock time is read as a time, not as two numbers', () => {
    assert.ok(/tujuh lewat lima belas/.test(Script.speakable('Kereta jalan 07:15 pagi', 'id')));
    assert.ok(/sembilan tepat/.test(Script.speakable('Sampai 09:00 nanti', 'id')));
  });

  await test('a code keeps its digits, because nobody reads a phone number as a quantity', () => {
    assert.ok(/nol delapan satu dua/.test(Script.verbalize('Nomor 0812 itu')));
  });

  await test('English lines are never touched by the Indonesian reading rules', () => {
    const english = 'The train departs at 07:15 and costs 50,000.';
    assert.strictEqual(Script.speakable(english, 'en'), english);
  });

  // ---- 6. lifecycle --------------------------------------------------------------

  await test('hiding the tab silences the voice but no longer throws the engine away', () => {
    const app = fs.readFileSync('app.js', 'utf8');
    assert.match(app, /function scheduleNeuralRelease\(\)/, 'the teardown is deferred');
    assert.match(app, /NEURAL_RELEASE_DELAY_MS/, 'and has a stated delay');
    assert.match(app, /visibilityState==='hidden'[\s\S]{0,400}silenceNeuralVoice\(\)/,
      'a hidden tab must stop talking immediately');
    assert.match(app, /cancelNeuralRelease\(\)/, 'coming back cancels the pending teardown');
    assert.match(app, /function warmNeuralVoice\(\)/, 'a prepared engine is built while idle');
    assert.match(app, /runtime\.prewarm/, 'through the entry point that cannot degrade the next tap');
    const bootstrap = fs.readFileSync('features/neural-voice/fiezel-neural-voice-bootstrap.js', 'utf8');
    assert.match(bootstrap, /async function prewarm\(\)/);
    assert.match(bootstrap, /initFailedThisSession=prior\.initFailed/,
      'a failed speculative warm-up must restore the state the learner had, or their own tap falls back');
    assert.match(bootstrap, /prefetch,prewarm,release/, 'and be reachable on the public runtime');
    const delay = Number((app.match(/FIEZEL_NEURAL_RELEASE_DELAY_MS\)\|\|(\d+)/) || [])[1]);
    assert.ok(delay >= 30000, `a glance at another app must not cost the cold start, got ${delay}ms`);
  });

  await test('the diagnostics sink ships in the shell and in the offline cache', () => {
    const index = fs.readFileSync('index.html', 'utf8');
    const sw = fs.readFileSync('sw.js', 'utf8');
    assert.ok(index.includes('./features/neural-voice/fiezel-voice-diagnostics.js'));
    assert.ok(index.indexOf('fiezel-voice-diagnostics.js') < index.indexOf('fiezel-neural-voice.js'),
      'the sink must exist before anything records into it');
    assert.ok(sw.includes('./features/neural-voice/fiezel-voice-diagnostics.js'),
      'and be available offline like every other neural module');
  });

  console.log(`\nFIEZEL m025-48 voice clarity + latency: PASS ${pass}/${pass}`);
})().catch(error => {
  console.error('FAIL m025-48 voice clarity + latency');
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
