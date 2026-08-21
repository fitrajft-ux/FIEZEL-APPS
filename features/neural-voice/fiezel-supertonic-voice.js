/**
 * m025-42 Supertonic 3 — one bilingual engine for the whole tutor.
 *
 * Replaces two separate bundles with one:
 *   vendor/sherpa-vits/     Piper libritts_r  (English, 106 MB)   -> retired
 *   vendor/sherpa-vits-id/  Piper news_tts    (Indonesian, 91 MB) -> retired
 *   vendor/supertonic-3/    Supertonic 3 int8 (31 languages, ~153 MB)
 *
 * Why the swap, in one line each - the full measurement set is in issues #74 and #75:
 *   - the old Indonesian voice was a NEWS READER model (dataset "news_tts"), which is
 *     structurally flat; no amount of prosody patching fixes a register;
 *   - measured pitch range roughly doubled (4.9-8.8 -> 10.0-12.6 semitones);
 *   - the model produces REAL breath pauses (0.5-0.7s vs never above 0.27s), so the
 *     synthetic silence the Piper path needed is switched off here;
 *   - 44.1 kHz instead of 22.05 kHz;
 *   - one model covers id AND en, so the two bundles collapse into one smaller total.
 *
 * Policy unchanged and re-verified: 100% on-device, no API key, no paid runtime, no
 * cross-origin inference. Licence: sample code MIT, model weights OpenRAIL-M (free;
 * use-restrictions only), recorded in THIRD-PARTY-LICENSES.md.
 */
(function (root) {
  'use strict';

  var STATUS_KEY = 'fiezel-supertonic-voice-v1';
  var SCHEMA = 'fiezel-supertonic-voice-status-v1';
  var version = String(root.FIEZEL_VERSION || '5.19.0');
  var cacheName = 'fiezel-v' + version;
  var rootUrl = new URL('../../', (document.currentScript && document.currentScript.src) || location.href);
  var absolute = function (path) { return new URL(String(path).replace(/^\.\//, ''), rootUrl).href; };

  var MODEL_ID = 'supertonic-3-int8-2026-05-11';
  var BASE = 'vendor/supertonic-3/';
  var EXPECTED_SPEAKERS = 10;

  // Declared byte counts are asserted against the vendored files in CI. A mismatch is
  // what makes a prepare layer re-download forever, so it must never drift.
  //
  // The model is shipped as separate files rather than one packaged .data: the package
  // would be 145 MB, over the 100 MB per-file limit of the git remote we deploy from,
  // and one 145 MB allocation is exactly the kind of memory spike that got the WebKit
  // content process killed in m025-22. The worker writes them into MEMFS one at a time.
  var assets = Object.freeze([
    { path: BASE + 'sherpa-onnx-wasm-main-tts.js', bytes: 79421 },
    { path: BASE + 'sherpa-onnx-tts.js', bytes: 33227 },
    { path: BASE + 'sherpa-onnx-tts.worker.js', bytes: 4709 },
    { path: BASE + 'sherpa-onnx-wasm-main-tts.wasm', bytes: 13476398 },
    { path: BASE + 'duration_predictor.int8.onnx', bytes: 3700147 },
    { path: BASE + 'text_encoder.int8.onnx', bytes: 36416150 },
    { path: BASE + 'vector_estimator.int8.onnx', bytes: 78400833 },
    { path: BASE + 'vocoder.int8.onnx', bytes: 25991073 },
    { path: BASE + 'tts.json', bytes: 8253 },
    { path: BASE + 'unicode_indexer.bin', bytes: 262144 },
    { path: BASE + 'voice.bin', bytes: 517168 }
  ]);

  var adapters = Object.create(null);   // lang -> adapter
  var services = Object.create(null);   // lang -> voice service
  var readyPromises = Object.create(null);
  var preparePromise = null;
  var lastError = '';

  function diag(entry) {
    try {
      var record = Object.assign({ t: Date.now(), v: version, engine: 'supertonic-3' }, entry);
      var sink = root.FiezelVoiceDiagnostics;
      if (sink && typeof sink.record === 'function') { sink.record(record, root); return; }
      var key = 'fiezel-neural-voice-diagnostics-v1';
      var list = JSON.parse(root.localStorage.getItem(key) || '[]');
      list.push(record);
      root.localStorage.setItem(key, JSON.stringify(list.slice(-200)));
    } catch (_) {}
  }

  var SPEECH_DEFAULTS = Object.freeze({ streamSentences: true, streamMaxWords: 26, silenceScale: 0.4 });
  function speechSettings() {
    var config = root.FiezelNeuralVoiceConfig;
    var speech = config && config.speech ? config.speech : null;
    return {
      streamSentences: speech && typeof speech.streamSentences === 'boolean'
        ? speech.streamSentences : SPEECH_DEFAULTS.streamSentences,
      streamMaxWords: speech && Number(speech.streamMaxWords) > 0
        ? Number(speech.streamMaxWords) : SPEECH_DEFAULTS.streamMaxWords,
      silenceScale: speech && Number(speech.silenceScale) > 0
        ? Number(speech.silenceScale) : SPEECH_DEFAULTS.silenceScale
    };
  }

  function normalizeLang(lang) {
    return /^en/i.test(String(lang || '')) ? 'en' : 'id';
  }

  function readPrepared() {
    try {
      var value = JSON.parse(root.localStorage.getItem(STATUS_KEY) || 'null');
      return !!(value && value.schema === SCHEMA && value.version === version && value.prepared === true);
    } catch (_) { return false; }
  }
  function writePrepared(prepared) {
    try {
      root.localStorage.setItem(STATUS_KEY, JSON.stringify({
        schema: SCHEMA, version: version, prepared: prepared === true, preparedAt: prepared ? Date.now() : 0
      }));
    } catch (_) {}
  }

  function totalBytes() {
    return assets.reduce(function (sum, asset) { return sum + (Number(asset.bytes) || 0); }, 0);
  }

  function status() {
    return Object.freeze({
      schema: SCHEMA,
      version: version,
      engine: 'supertonic-3',
      model: MODEL_ID,
      bilingual: true,
      languages: Object.freeze(['id', 'en']),
      prepared: readPrepared(),
      ready: !!(services.id || services.en),
      error: lastError,
      assetCount: assets.length,
      totalBytes: totalBytes(),
      zeroPaidRuntime: true,
      crossOriginInference: false
    });
  }

  // Downloads into the same stable neural cache the shell never evicts, so a release
  // does not cost the learner a second 153 MB.
  async function warmAssets(onProgress) {
    if (!('caches' in root)) throw new Error('cache_storage_unavailable');
    var cache = await caches.open(cacheName);
    var done = 0;
    for (var i = 0; i < assets.length; i++) {
      var url = absolute(assets[i].path);
      var hit = await cache.match(url);
      if (!hit) {
        var response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (!response || !response.ok) throw new Error('supertonic_asset_failed:' + assets[i].path);
        await cache.put(url, response.clone());
      }
      done++;
      if (typeof onProgress === 'function') {
        try { onProgress({ completed: done, total: assets.length, path: assets[i].path }); } catch (_) {}
      }
    }
    return true;
  }

  async function verifyCached() {
    if (!('caches' in root)) return false;
    try {
      var cache = await caches.open(cacheName);
      for (var i = 0; i < assets.length; i++) {
        if (!(await cache.match(absolute(assets[i].path)))) return false;
      }
      return true;
    } catch (_) { return false; }
  }

  /**
   * One worker per language. They share the same vendored bundle, so the second one
   * costs no extra download - only a second WASM instance, which is what keeps the
   * single-flight guard per language instead of serialising the whole app.
   */
  function initialize(lang) {
    var key = normalizeLang(lang);
    if (readyPromises[key]) return readyPromises[key];
    readyPromises[key] = (async function () {
      if (!root.FiezelSherpaVitsAdapter || !root.FiezelNeuralVoice || !root.FiezelWebAudioPlayer) {
        throw new Error('supertonic_runtime_modules_missing');
      }
      var adapter = root.FiezelSherpaVitsAdapter.createSherpaVitsAdapter({
        env: root,
        basePath: absolute(BASE),
        expectedSpeakers: EXPECTED_SPEAKERS,
        modelId: MODEL_ID,
      // m028-3: OWNER removed the second Indonesian voice (sid 5) and the persona module
      // with it. The surviving voice is stated literally HERE because the adapter's own
      // fallback map is {af_bella:0, af_heart:180} - 'id_natural' is not a key in it, so
      // an omitted map resolves to undefined and the learner gets the wrong speaker or
      // none. All three ids point at the one voice so stored preferences keep resolving.
        voiceSids: { id_natural: 2, tutor_ajar: 2, tutor_hype: 2 },
        defaultVoice: 'id_natural',
        kind: 'supertonic-3',
        generationLang: key,
        personas: null,
        usePersona: false,
        // Supertonic emits its own breath pauses; adding ours would double them.
        padBetweenPhrases: false,
        // 1.0 is already natural for this model - the 0.85 calibration belonged to Piper.
        naturalSpeed: 1,
        // m025-45: 4 denoising steps, matching the English path. Both languages share one
        // model, so they must share the step count or the two voices drift apart in both
        // timing and texture.
        // m025-71: 4 tetap default produksi. Override diagnostik dibaca dari player supaya
        // OWNER bisa mendengar 8 atau 16 langkah di perangkat tanpa build baru; nilainya
        // hangus sendiri dalam 24 jam.
        generationSteps: (function () {
          try {
            var player = root.FiezelWebAudioPlayer;
            return player && typeof player.effectiveDenoiseSteps === 'function'
              ? player.effectiveDenoiseSteps(root) : 4;
          } catch (_) { return 4; }
        })(), // generationSteps: 4 default produksi, dijaga sama untuk kedua bahasa
        // Same reason as the English path: this engine needs no synthetic pitch contour.
        usePitchContour: false,
        // m025-48: the contour is off, so per-sentence delivery is shaped through the
        // engine's own rate instead of by resampling its output.
        useEmotion: true,
        // m025-48: restore audible breaths at the punctuation prosody inserts.
        silenceScale: speechSettings().silenceScale,
        // m025-48: passed explicitly. The adapter's own fallback for this was reading a
        // variable that does not exist in its scope, so prosody has been null on every
        // device since it was introduced - which is why the Indonesian line reached the
        // duration predictor with no clause commas and no terminal mark.
        prosody: root.FiezelProsody || null,
        onStage: function (entry) { diag(Object.assign({ lang: key }, entry)); }
      });
      await adapter.initialize();
      var player = root.FiezelWebAudioPlayer.createPlayer(root);
      var settings = speechSettings();
      var service = root.FiezelNeuralVoice.createVoiceService({
        config: root.FiezelNeuralVoiceConfig,
        adapter: adapter,
        env: root,
        playAudio: player.play,
        generationTimeoutMs: 30000,
        // m025-48: sentence-at-a-time rendering and playback. This is what removes the
        // wait before the first word and what puts the pause between two sentences under
        // prosody's control instead of leaving it to whatever each render happens to
        // carry at its edges.
        streamSentences: settings.streamSentences,
        streamMaxWords: settings.streamMaxWords,
        prosody: root.FiezelProsody || null
      });
      adapters[key] = adapter;
      services[key] = service;
      diag({ phase: 'supertonic_ready', model: MODEL_ID, lang: key });
      return service;
    })().catch(function (error) {
      readyPromises[key] = null; services[key] = null; adapters[key] = null;
      lastError = String((error && error.message) || error);
      diag({ phase: 'supertonic_init_error', lang: key, error: lastError });
      throw error;
    });
    return readyPromises[key];
  }

  function prepare(options) {
    if (preparePromise) return preparePromise;
    var opts = options || {};
    lastError = '';
    preparePromise = (async function () {
      diag({ phase: 'supertonic_prepare_start' });
      await warmAssets(opts.onProgress);
      writePrepared(true);
      await initialize(opts.lang || 'id');
      diag({ phase: 'supertonic_prepared' });
      return status();
    })().catch(function (error) {
      lastError = String((error && error.message) || error);
      writePrepared(false);
      diag({ phase: 'supertonic_prepare_error', error: lastError });
      throw error;
    }).finally(function () { preparePromise = null; });
    return preparePromise;
  }

  /**
   * Neural or nothing: allowFallback stays false, so a failure can never become a
   * browser-TTS substitution the learner would hear as a different, worse voice.
   */
  async function speak(text, options) {
    var opts = options || {};
    var lang = normalizeLang(opts.lang);
    var script = root.FiezelGenZScript;
    var spoken = script && script.speakable ? script.speakable(text, lang) : String(text || '');
    if (!spoken) return { provider: 'supertonic-3', skipped: true };
    var live = await initialize(lang);
    return live.speak(spoken, {
      voice: opts.voice || 'id_natural',
      speed: typeof opts.speed === 'number' ? opts.speed : 1,
      intent: opts.intent || '',
      lang: lang === 'en' ? 'en-US' : 'id-ID',
      allowFallback: false
    });
  }

  function stop() {
    Object.keys(services).forEach(function (key) {
      try { if (services[key] && services[key].stop) services[key].stop(); } catch (_) {}
    });
  }

  async function release() {
    stop();
    Object.keys(adapters).forEach(function (key) {
      try { if (adapters[key] && adapters[key].release) adapters[key].release(); } catch (_) {}
      adapters[key] = null; services[key] = null; readyPromises[key] = null;
    });
  }

  root.FiezelSupertonicVoice = Object.freeze({
    schema: SCHEMA,
    modelId: MODEL_ID,
    basePath: BASE,
    expectedSpeakers: EXPECTED_SPEAKERS,
    status: status,
    prepare: prepare,
    initialize: initialize,
    speak: speak,
    stop: stop,
    release: release,
    verifyCached: verifyCached,
    assets: function () { return assets.map(function (a) { return Object.assign({}, a); }); }
  });
}(typeof globalThis !== 'undefined' ? globalThis : this));
