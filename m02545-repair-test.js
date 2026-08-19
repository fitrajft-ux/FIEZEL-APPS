'use strict';
// m025-45 OWNER review of the m025-44 build:
//   "versi paling jelek ... suaranya cracking, tidak full HD"
//   "terjemahan harus melayang di tengah, bukan di bawah dekat play button"
//   "dari kalimat 1 ke kalimat selanjutnya sangat lama"
//   plus the false failures the V10 scan reported on a healthy install.
const assert = require('assert');
const fs = require('fs');

const Voice = require('./features/neural-voice/fiezel-neural-voice.js');
const targets = require('./features/diagnostics/fiezel-diagnostic-targets.js');
const adapterSrc = fs.readFileSync('features/neural-voice/fiezel-sherpa-vits-adapter.js', 'utf8');
const bootSrc = fs.readFileSync('features/neural-voice/fiezel-neural-voice-bootstrap.js', 'utf8');
const idSrc = fs.readFileSync('features/neural-voice/fiezel-supertonic-voice.js', 'utf8');
const libSrc = fs.readFileSync('features/library/fiezel-library-ui.js', 'utf8');
const registerSrc = fs.readFileSync('features/diagnostics/fiezel-diagnostic-register.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

let pass = 0;
const test = async (name, fn) => { await fn(); pass++; console.log('PASS', name); };

/** A stand-in engine: records what it was asked to generate, answers with flat audio. */
function fakeService(options) {
  const calls = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const adapter = {
    kind: 'fake-engine',
    generate(text) {
      calls.push(text);
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      return new Promise(resolve => setTimeout(() => {
        inFlight--;
        resolve({ audio: new Float32Array(64).fill(0.2), sampling_rate: 22050 });
      }, (options && options.generateMs) || 5));
    }
  };
  const played = [];
  const service = Voice.createVoiceService({
    config: { voices: { fiezelPrimary: 'test_voice' }, limits: { maxInputChars: 2000, targetChunkWords: 140, hardChunkWords: 190 }, fallback: { browserSpeechSynthesis: false } },
    adapter,
    env: { localStorage: { getItem: () => null, setItem: () => {} } },
    playAudio: audio => { played.push(audio); return { done: Promise.resolve(), stop() {} }; }
  });
  return { service, calls, played, concurrency: () => maxConcurrent };
}

(async () => {
  // ---- 1. the voice stopped being damaged -------------------------------------------

  await test('the pitch contour is off for an engine that has its own intonation', () => {
    assert.match(adapterSrc, /var usePitchContour = opts\.usePitchContour !== false;/,
      'the contour is a declared engine capability');
    assert.match(adapterSrc, /if \(usePitchContour && prosody && prosody\.resample\)/,
      'resampling only happens for engines that need it');
    assert.match(bootSrc, /usePitchContour:false/, 'English Supertonic path opts out');
    assert.match(idSrc, /usePitchContour: false/, 'Indonesian Supertonic path opts out');
    // Resampling a 44.1kHz signal with linear interpolation is what OWNER heard as
    // cracking; the reason has to stay written down next to the switch.
    assert.match(adapterSrc, /interpolation noise/, 'the reason is documented at the switch');
  });

  await test('both engines are back to four denoising steps', () => {
    const en = Number((bootSrc.match(/generationSteps:\s*(\d+)/) || [])[1]);
    const id = Number((idSrc.match(/generationSteps:\s*(\d+)/) || [])[1]);
    assert.strictEqual(en, 4, 'English path back to the quality setting');
    assert.strictEqual(id, 4, 'Indonesian path matches it');
  });

  // ---- 2. the gap between sentences --------------------------------------------------

  await test('a warmed utterance plays without generating twice', async () => {
    const { service, calls } = fakeService();
    assert.strictEqual(await service.prefetch('Hello there.', { voice: 'test_voice' }), true);
    assert.strictEqual(calls.length, 1, 'warming generates once');
    await service.speak('Hello there.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(calls.length, 1, 'speaking consumes the warm entry instead of regenerating');
    // m025-49: saying the same line again is now free as well. The warm SLOT is still
    // consumed exactly once - that part of the single-flight contract is unchanged - but
    // the rendered PCM is kept in a bounded cache behind it, because the engine measured
    // on OWNER's device needs about two seconds of CPU for every second of speech and a
    // tutor repeats its greetings, its praise and any beat the learner steps back to.
    // The key carries text, voice, speed, language, intent and sentence position, so a
    // replay can only ever be the audio that exact request would have produced.
    await service.speak('Hello there.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(calls.length, 1, 'a repeated line is served from the render cache');
    await service.speak('A different line.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(calls.length, 2, 'different text still reaches the engine');
  });

  await test('warming never breaks single-flight, and a mismatch is simply ignored', async () => {
    const probe = fakeService({ generateMs: 20 });
    const speaking = probe.service.speak('First line.', { voice: 'test_voice', allowFallback: false });
    // A warm issued while a sentence is playing is exactly the case that matters, so it
    // must be accepted - and it must queue behind the live generation, never race it.
    const warming = probe.service.prefetch('Second line.', { voice: 'test_voice' });
    await speaking;
    assert.strictEqual(await warming, true, 'the warm still completes');
    assert.strictEqual(probe.concurrency(), 1, 'never two generations at once');
    // And the warmed line then plays without generating again.
    const before = probe.calls.length;
    await probe.service.speak('Second line.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(probe.calls.length, before, 'the queued warm was reused');

    const other = fakeService();
    await other.service.prefetch('Warmed line.', { voice: 'test_voice' });
    await other.service.speak('A different line.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(other.calls.length, 2, 'a warm entry for other text is not played');
    assert.strictEqual(other.played.length, 1, 'and only the requested line is heard');
  });

  await test('stopping drops the warm reservation, and never plays it as another line', async () => {
    const { service, calls, played } = fakeService();
    await service.prefetch('Cancelled line.', { voice: 'test_voice' });
    service.stop();
    // The warm SLOT is gone: a different line must reach the engine on its own merits and
    // must never be served the audio that was warmed for something else. That is the
    // property this test exists for.
    await service.speak('A different line.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(calls.length, 2, 'the new line is generated, not substituted');
    assert.strictEqual(played.length, 1, 'only the requested line is heard');
    // m025-49: the cancelled line's finished PCM is kept. Cache identity includes text,
    // voice, speed, language, intent and sentence position, so it can only ever be
    // replayed for the exact request that produced it - and stop() is called on every
    // Classroom navigation, so clearing renders there would throw away the pre-rendering
    // that makes an engine slower than realtime usable at all.
    await service.speak('Cancelled line.', { voice: 'test_voice', allowFallback: false });
    assert.strictEqual(calls.length, 2, 'the same line replays from the render cache');
  });

  await test('the library warms the next sentence after the live line has first claim on the engine', () => {
    assert.match(libSrc, /function warmNext\(token\)/, 'the reader warms ahead with cancellation identity');
    assert.match(libSrc, /runtime\.prefetch\(upcoming\.en/, 'it warms the NEXT sentence');
    const warm = libSrc.slice(libSrc.indexOf('function warmNext(token)'), libSrc.indexOf('\n  function stopNarration'));
    assert.match(warm, /setTimeout\(function \(\)/,
      'warming crosses a task boundary so public async wrappers cannot invert the engine queue');
    // Order still matters inside the loop: the requested line is dispatched first, then
    // speculative work is scheduled, and playback remains the window that hides warming.
    const loop = libSrc.slice(libSrc.indexOf('async function narrate'));
    assert.ok(loop.indexOf('var speaking = speak(sentence.en)') < loop.indexOf('warmNext(token)'),
      'the requested sentence dispatches before speculative warming');
    assert.ok(loop.indexOf('warmNext(token)') < loop.indexOf('await speaking'),
      'warming is scheduled before waiting for playback to complete');
    assert.match(bootSrc, /prefetch,/, 'the runtime exposes it');
  });

  // ---- 3. the translation floats in the middle ---------------------------------------

  await test('the translation is a floating card, not a strip above the controls', () => {
    assert.match(libSrc, /library-translation-layer/, 'it is an overlay');
    assert.match(css, /\.library-translation-layer\{position:fixed;inset:0;[^}]*place-items:center/,
      'centred on the screen');
    assert.ok(!/position:sticky;bottom:150px/.test(css), 'the old bottom strip is gone');
    assert.match(libSrc, /if \(event\.target === layer\) closeTranslation\(\)/, 'tapping outside dismisses it');
    assert.match(libSrc, /libraryCloseOne/, 'and there is an explicit close control');
    // Playing or leaving must not leave a card floating over the book.
    const toggle = libSrc.slice(libSrc.indexOf('function togglePlay'));
    assert.ok(toggle.indexOf('closeTranslation()') < toggle.indexOf('if (narrating)'));
    assert.match(libSrc, /function renderShelf\(\) \{\s*stopNarration\(\);\s*closeTranslation\(\);/);
  });

  // ---- 4. the V10 scan stops crying wolf ---------------------------------------------

  await test('the scan no longer reports a healthy install as broken', () => {
    // Supertonic ships 11 files; the old target of 5 belonged to the retired engine and
    // failed every install.
    assert.strictEqual(targets.neuralVoice.expectedAssetCount, 11);
    assert.strictEqual(targets.indonesianVoice.expectedAssetCount, 11);
    // "test" has no permanent button once the learner is assessed, so a DOM hunt reported
    // it missing forever. The router's own list is the truth.
    assert.match(registerSrc, /__fiezelValidViews/, 'destinations come from the router');
    assert.ok(!/onclick\*=/.test(registerSrc), 'no DOM hunt for a destination button');
    assert.match(app, /window\.__fiezelValidViews=\(\)=>\[\.\.\.VALID_VIEWS\]/, 'app exposes them');
    // Home carries .nav as well, so "+ 1" counted it twice.
    assert.match(registerSrc, /querySelectorAll\('\.bottomnav \.nav'\)\.length;/);
    assert.ok(!/querySelectorAll\('\.nav'\)\.length \+ 1/.test(registerSrc));
  });

  console.log(`FIEZEL m025-45 repair batch: PASS ${pass}/${pass}`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
