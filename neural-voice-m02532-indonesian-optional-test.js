'use strict';
// m025-42 regression, superseding the m025-32 contract this file used to protect.
//
// m025-32 shipped Indonesian as a SECOND, optional 94 MB bundle next to the English one.
// m025-42 retires that split: one Supertonic model speaks both languages, so the two
// bundles collapse into one that is ~46 MB smaller than the pair. The properties worth
// protecting are therefore restated rather than deleted:
//
//   was: "Indonesian is optional and English must not depend on it"
//   now: "Indonesian and English share ONE prepared bundle, and neither can be half-ready"
//
// Everything else this file guarded - never substituting browser TTS, declared bytes
// matching the vendored files, one stable cache, the service worker knowing the path,
// coherent release markers - is unchanged and still asserted below.
const assert = require('assert');
const fs = require('fs');

const SHIM = 'features/neural-voice/fiezel-indonesian-voice.js';
const ENGINE = 'features/neural-voice/fiezel-supertonic-voice.js';
const shim = fs.readFileSync(SHIM, 'utf8');
const src = fs.readFileSync(ENGINE, 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const boot = fs.readFileSync('features/neural-voice/fiezel-neural-voice-bootstrap.js', 'utf8');

(async () => {
  // --- 1. one bundle, both languages ----------------------------------------------
  assert.ok(!/sherpa-vits-id/.test(boot),
    'the retired Indonesian bundle must not be referenced by the bootstrap');
  const englishAssets = boot.slice(boot.indexOf('const assets=Object.freeze(['),
                                   boot.indexOf('const totalBytes='));
  assert.ok(/vendor\/supertonic-3\//.test(englishAssets),
    'the mandatory manifest must be the shared bilingual bundle');
  assert.ok(!/sherpa-vits-id|vendor\/sherpa-vits\//.test(englishAssets),
    'no retired engine may remain in the download manifest');
  assert.match(src, /languages: Object\.freeze\(\['id', 'en'\]\)/,
    'the engine must declare both languages it serves');

  // The UI helpers still fail soft when the module is absent - that behaviour outlived
  // the bundle split and is what keeps a broken build from blanking the page.
  assert.match(app, /function indonesianPrepared\(\)/, 'app must expose an Indonesian readiness helper');
  assert.ok(/try\{return self\.FiezelIndonesianVoice\?\.status\?\.\(\)\.prepared===true\}catch\{return false\}/.test(app),
    'readiness check must fail soft when the module is absent');
  assert.match(app, /if\(!rt\)return 'Modul suara Indonesia tidak tersedia pada build ini\.'/,
    'UI must degrade gracefully when the module is missing');
  assert.ok(!/Unduhan terpisah/.test(app),
    'the UI must not still promise a separate Indonesian download that no longer exists');

  // --- 2. neural-only: no browser TTS substitution, ever --------------------------
  assert.match(src, /allowFallback: false/, 'Indonesian speech must never fall back to browser TTS');
  assert.ok(!/SpeechSynthesis/.test(src), 'the voice engine must not touch SpeechSynthesis');
  assert.ok(!/SpeechSynthesis/.test(shim), 'the Indonesian shim must not touch SpeechSynthesis');

  // --- 3. declared bytes must match the vendored files ----------------------------
  const declared = [...src.matchAll(/BASE \+ '([^']+)', bytes: (\d+)/g)]
    .map(m => ({ path: 'vendor/supertonic-3/' + m[1], bytes: Number(m[2]) }));
  // Eleven: the WASM runtime (4 files) plus the seven model files the worker writes
  // into MEMFS. Shipped separately on purpose - see fiezel-supertonic-voice.js.
  assert.strictEqual(declared.length, 11, 'the runtime is exactly eleven files');
  for (const item of declared) {
    assert.ok(item.bytes < 100 * 1024 * 1024,
      `${item.path} is ${item.bytes} bytes; every asset must stay under the 100 MB remote limit`);
  }
  for (const item of declared) {
    const actual = fs.statSync(item.path).size;
    assert.strictEqual(actual, item.bytes,
      `${item.path} declared ${item.bytes} but is ${actual} on disk`);
  }
  const total = declared.reduce((sum, a) => sum + a.bytes, 0);
  const bootDeclared = [...englishAssets.matchAll(/bytes:(\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  assert.strictEqual(bootDeclared, total,
    'bootstrap and engine must agree on the size of the one shared bundle');

  // The whole point of the swap: the learner downloads LESS than the two bundles it
  // replaces (110,142,279 English + 94,558,999 Indonesian).
  assert.ok(total < 110142279 + 94558999,
    'the merged bundle must be smaller than the two it replaces, got ' + total);

  // --- 4. download-once: same stable cache, and the SW must know the path ----------
  assert.match(src, /caches\.open\(cacheName\)/, 'must reuse the stable neural cache');
  assert.match(src, /var cacheName = 'fiezel-v' \+ version/,
    'the neural cache must be keyed to app version, not to SW_REV');
  assert.match(sw, /vendor\/supertonic-3\//,
    'service worker must classify the bundle as a neural asset');
  const matcher = sw.slice(sw.indexOf('const isNeuralAsset='), sw.indexOf('const shellScope='));
  assert.match(matcher, /supertonic-3/,
    'isNeuralAsset must match the bundle path or it is refetched on every release');

  // --- 5. the shared adapter stayed language-agnostic ------------------------------
  const adapter = require('./features/neural-voice/fiezel-sherpa-vits-adapter.js');

  const english = adapter.createSherpaVitsAdapter({
    env: {}, expectedSpeakers: 10, modelId: 'supertonic-3-int8-2026-05-11',
    voiceSids: { id_natural: 2, tutor_ajar: 2, tutor_hype: 2 }, defaultVoice: 'id_natural',
    kind: 'supertonic-3', generationLang: 'en'
  });
  const indo = adapter.createSherpaVitsAdapter({
    env: {}, expectedSpeakers: 10, modelId: 'supertonic-3-int8-2026-05-11',
    voiceSids: { id_natural: 2, tutor_ajar: 2, tutor_hype: 2 }, defaultVoice: 'id_natural',
    kind: 'supertonic-3', generationLang: 'id'
  });
  assert.strictEqual(english.kind, 'supertonic-3');
  assert.strictEqual(indo.kind, 'supertonic-3');
  assert.strictEqual(english.modelId, indo.modelId, 'both languages run the same model');
  // Separate instances, or one language's in-flight generation would clobber the other.
  assert.notStrictEqual(english, indo);

  // m028-3: OWNER removed the second voice and the persona module with it. The three
  // product voice ids survive as stored-preference keys, but they all resolve to the one
  // remaining speaker - a learner whose saved preference is tutor_hype must still work.
  const idEngineSrc = fs.readFileSync('features/neural-voice/fiezel-supertonic-voice.js', 'utf8');
  const idVoiceMap = /voiceSids\s*:\s*\{([^}]*)\}/.exec(idEngineSrc);
  assert.ok(idVoiceMap, 'the Indonesian engine must state its voice map literally');
  assert.deepStrictEqual((idVoiceMap[1].match(/[a-z_]+(?=\s*:)/g) || []).sort(),
    ['id_natural', 'tutor_ajar', 'tutor_hype']);
  assert.strictEqual(new Set((idVoiceMap[1].match(/:\s*(\d+)/g) || [])).size, 1,
    'every id must resolve to the single remaining voice');

  // --- 6. release markers ---------------------------------------------------------
  const diag = fs.readFileSync('features/neural-voice/fiezel-diag-panel.js', 'utf8');
  const diagBuild = diag.match(/DIAG_BUILD\s*=\s*'m025-(\d+)'/);
  const swBuild = sw.match(/SW_REV='m025-(\d+)-/);
  assert.ok(diagBuild, 'Diagnostics deployment marker must exist');
  assert.ok(swBuild, 'Service-worker deployment marker must exist');
  assert.strictEqual(swBuild[1], diagBuild[1], 'DIAG_BUILD and SW_REV must identify the same product build');
  assert.ok(Number(diagBuild[1]) >= 32, 'later releases must not regress behind the Indonesian boundary');

  console.log('FIEZEL m025-42 bilingual bundle regression: PASS');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
