/**
 * m025-42: the Indonesian bundle is now a thin shim over the bilingual engine.
 *
 * Before this milestone Indonesian was its own 94 MB sherpa bundle built around
 * vits-piper-id_ID-news_tts-medium - a single-speaker NEWS READER model, which is why
 * OWNER heard it as flat no matter how much prosody shaping was layered on top.
 * m025-42 replaced it with Supertonic 3, one multilingual model that serves Indonesian
 * AND English (see fiezel-supertonic-voice.js and issues #74/#75).
 *
 * The public surface is kept EXACTLY as it was, because three call sites depend on it
 * (fiezel-tutor-indonesian-voice-fix.js, the diagnostics panel, and the voice tests)
 * and because `id_natural` is a stored learner preference. Nothing about this file's
 * contract changed; only what it delegates to.
 *
 * It is no longer an optional download: the same bundle is the mandatory English
 * engine, so by the time Classroom runs, the assets are already there. `prepared`
 * therefore tracks the shared bundle, not a second one.
 */
(function (root) {
  'use strict';

  var SCHEMA = 'fiezel-indonesian-voice-status-v1';
  var VOICE_ID = 'id_natural';

  function engine() { return root.FiezelSupertonicVoice || null; }

  function status() {
    var live = engine();
    var base = live ? live.status() : null;
    return Object.freeze({
      schema: SCHEMA,
      version: base ? base.version : String(root.FIEZEL_VERSION || '5.19.0'),
      engine: 'supertonic-3',
      model: base ? base.model : '',
      voice: VOICE_ID,
      // Kept in the payload for compatibility with the diagnostics panel, but the
      // Indonesian voice is no longer a separate opt-in download.
      optional: false,
      prepared: base ? base.prepared : false,
      ready: base ? base.ready : false,
      error: base ? base.error : 'supertonic_engine_missing',
      assetCount: base ? base.assetCount : 0,
      totalBytes: base ? base.totalBytes : 0
    });
  }

  function prepare(options) {
    var live = engine();
    if (!live) return Promise.reject(new Error('supertonic_engine_missing'));
    return live.prepare(Object.assign({ lang: 'id' }, options || {})).then(status);
  }

  function speak(text, options) {
    var live = engine();
    if (!live) return Promise.reject(new Error('supertonic_engine_missing'));
    var opts = options || {};
    return live.speak(text, {
      lang: 'id',
      voice: opts.voice || VOICE_ID,
      speed: typeof opts.speed === 'number' ? opts.speed : 1,
      intent: opts.intent || ''
    });
  }

  /** Warms an upcoming line. Never initialises the engine; see the Supertonic module. */
  function prefetch(text, options) {
    var live = engine();
    if (!live || typeof live.prefetch !== 'function') return Promise.resolve(false);
    var opts = options || {};
    return live.prefetch(text, {
      lang: 'id',
      voice: opts.voice || VOICE_ID,
      speed: typeof opts.speed === 'number' ? opts.speed : 1,
      intent: opts.intent || ''
    });
  }

  function stop() { var live = engine(); if (live) live.stop(); }
  function release() { var live = engine(); return live ? live.release() : Promise.resolve(); }
  function verifyCached() { var live = engine(); return live ? live.verifyCached() : Promise.resolve(false); }
  function assets() { var live = engine(); return live ? live.assets() : []; }

  root.FiezelIndonesianVoice = Object.freeze({
    schema: SCHEMA,
    voiceId: VOICE_ID,
    get modelId() { var live = engine(); return live ? live.modelId : ''; },
    status: status,
    prepare: prepare,
    speak: speak,
    prefetch: prefetch,
    stop: stop,
    release: release,
    verifyCached: verifyCached,
    assets: assets
  });
}(typeof globalThis !== 'undefined' ? globalThis : this));
