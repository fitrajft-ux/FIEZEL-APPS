/* m025-37 OWNER correction: Tutor v3 speaks Indonesian neural, English stays target content. */
(function(root){
  'use strict';
  if(!root || !root.document || root.__fiezelTutorIndonesianVoiceFix) return;
  root.__fiezelTutorIndonesianVoiceFix = true;

  var baseRuntime = root.FiezelVoiceRuntime;
  var baseBundle = root.FiezelLearningBundle;

  function classroomActive(){
    try {
      var app = root.document.getElementById('app');
      return !!(app && app.querySelector('.classroom-v3'));
    } catch (_) { return false; }
  }
  function tutorText(fallback){
    try {
      var node = root.document.getElementById('tutorSubtitle');
      var text = node && String(node.textContent || '').trim();
      return text || String(fallback || '').trim();
    } catch (_) { return String(fallback || '').trim(); }
  }
  // m025-49. A line that is merely WAITING for the engine is not a failure.
  //
  // OWNER device capture 2026-08-19T06:48Z: the Indonesian engine answered
  // `neural_generation_busy` because the previous line was still rendering, and this
  // layer immediately handed the Indonesian text to the base runtime instead. The base
  // runtime is the same Supertonic model built with `generationLang: 'en'`, so the tutor
  // read Indonesian words under English reading rules. That is the "suara pecah seperti
  // radio rusak" in the report - not a codec artefact at all, but the wrong language
  // model applied to the right text.
  //
  // Contention is transient by definition, so it is now waited out on the correct engine.
  var TRANSIENT = /neural_generation_busy|superseded|neural_generation_stopped/i;
  var RETRY_DELAYS_MS = [180, 420, 900];
  function wait(ms){ return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  async function classroomSpeak(text, options){
    var opts = options || {};
    if (!classroomActive()) {
      if (!baseRuntime || typeof baseRuntime.speak !== 'function') throw new Error('neural_runtime_missing');
      return baseRuntime.speak(text, opts);
    }
    var spoken = tutorText(text);
    if (!spoken) return { provider: 'indonesian-neural-local', skipped: true };
    var indo = root.FiezelIndonesianVoice;
    var indoReady = false;
    try {
      var indoStatus = indo && indo.status ? indo.status() : {};
      // Local `prepared` still means the shared Supertonic bundle is installed. m025-49
      // adds Puter cloud, whose readiness is deliberately separate so cloud availability
      // never lies about offline assets. Either state is sufficient to choose the
      // Indonesian runtime; that runtime itself owns cloud -> local fallback.
      indoReady = !!(indo && typeof indo.speak === 'function' && (indoStatus.prepared || indoStatus.cloudReady));
    } catch (_) { indoReady = false; }
    if (indoReady) {
      for (var attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          return await indo.speak(spoken, {
            speed: typeof opts.speed === 'number' ? opts.speed : 1,
            lang: 'id-ID',
            allowFallback: false
          });
        } catch (error) {
          var message = String((error && (error.message || error.name)) || error);
          if (!TRANSIENT.test(message)) {
            try { root.console && root.console.warn && root.console.warn('indonesian tutor voice failed', error); } catch (_) {}
            break;
          }
          // Superseded means a NEWER line is already speaking; this one is stale and
          // must not be forced back onto the learner behind it.
          if (/superseded|stopped/i.test(message)) {
            return { provider: 'indonesian-neural-local', skipped: true, reason: 'superseded' };
          }
          if (attempt === RETRY_DELAYS_MS.length) {
            // Still contended. Silence for one line is recoverable; a line delivered in
            // the wrong language is what the learner hears as a broken voice.
            return { provider: 'indonesian-neural-local', skipped: true, reason: 'engine_busy' };
          }
          await wait(RETRY_DELAYS_MS[attempt]);
        }
      }
    }
    // m025-42: Indonesian and English are now ONE bundle, so this branch is reached only
    // before the shared voice pack is prepared (or if its worker failed to start). m025-49
    // may also reach it while Puter is unavailable before the local bundle is ready.
    // The base runtime is still allowed as the last neural route, but the language is
    // explicit: never let Indonesian tutor text inherit the global English default.
    //
    // m025-39 (historical): the Indonesian bundle was an OPTIONAL 94MB download, and
    // requiring it here made Classroom speech fail outright for anyone who had not
    // fetched it - what OWNER hit as "reload Classroom selalu gagal".
    if (!baseRuntime || typeof baseRuntime.speak !== 'function') throw new Error('neural_runtime_missing');
    return baseRuntime.speak(spoken, Object.assign({}, opts, { lang: 'id-ID', allowFallback: false }));
  }

  function classroomStop(){
    if (classroomActive()) {
      try { root.FiezelIndonesianVoice && root.FiezelIndonesianVoice.stop && root.FiezelIndonesianVoice.stop(); } catch (_) {}
    }
    try { if (baseRuntime && typeof baseRuntime.stop === 'function') return baseRuntime.stop(); } catch (_) {}
  }

  // m025-40: this was a Proxy over baseRuntime. FiezelVoiceRuntime is Object.freeze'd, so
  // every property is non-writable and non-configurable, and a Proxy `get` trap MUST then
  // return the target's own value. Returning a replacement for `speak` violated that
  // invariant, so EVERY speak call threw a TypeError: English voice, Classroom audio and
  // Listening all died at once. Diagnostic 39 recorded nine fatal
  // UNHANDLED_PROMISE_REJECTION entries carrying exactly that message.
  //
  // A frozen object cannot be proxied with substituted members, so copy its surface into
  // a new object and override there. No invariant to violate.
  if (baseRuntime) {
    try {
      // Same idiom every other neural patch layer uses (ios-cache-fix,
      // cache-integrity-repair, audibility-fix): spread the current runtime and freeze
      // the override. Consistent, and immune to the frozen-target invariant.
      root.FiezelVoiceRuntime = Object.freeze(Object.assign({}, baseRuntime, {
        speak: classroomSpeak,
        stop: classroomStop,
        __tutorIndonesianPatched: true
      }));
    } catch (_) {}
  }

  function bundleStatus(){
    var original = {};
    try { original = baseBundle && typeof baseBundle.status === 'function' ? baseBundle.status() : {}; } catch (_) {}
    var id = {};
    try { id = root.FiezelIndonesianVoice && root.FiezelIndonesianVoice.status ? root.FiezelIndonesianVoice.status() : {}; } catch (_) {}
    return Object.freeze(Object.assign({}, original, {
      schema: 'fiezel-learning-bundle-v1',
      classroom: true,
      classroomSpeech: 'id-ID neural tutor',
      targetLanguage: 'en-US',
      classroomTranscript: 'id-ID authored tutor line',
      indonesianVoicePrepared: !!(id.offlinePrepared != null ? id.offlinePrepared : id.prepared),
      indonesianVoiceReady: !!id.ready,
      indonesianModel: id.model || original.indonesianModel || '',
      error: id.error || original.error || ''
    }));
  }
  if (baseBundle) {
    root.FiezelLearningBundle = Object.freeze({
      schema: 'fiezel-learning-bundle-v1',
      status: bundleStatus,
      prepare: function(options){
        if (typeof baseBundle.prepare === 'function') return baseBundle.prepare(options);
        if (root.FiezelIndonesianVoice && root.FiezelIndonesianVoice.prepare) return root.FiezelIndonesianVoice.prepare(options || {});
        return Promise.reject(new Error('indonesian_bundle_module_missing'));
      }
    });
  }

  // Writes must be idempotent. This callback runs from a MutationObserver watching #app
  // with subtree:true, so an unconditional textContent assignment re-enters the observer
  // and the pair loops without end. That loop is what made every session render slow.
  function setTextIfChanged(node, value){
    if (!node) return false;
    if (String(node.textContent || '') === value) return false;
    node.textContent = value;
    return true;
  }

  var observer = null;
  var scheduled = false;

  function correctVisibleContract(){
    if (!classroomActive()) return;
    // Detach while writing, so our own edits cannot feed back into the observer even if
    // a future edit here becomes non-idempotent.
    var wasObserving = !!observer;
    if (wasObserving) { try { observer.disconnect(); } catch (_) {} }
    try {
      setTextIfChanged(root.document.querySelector('.tutor-bundle p'),
        'Classroom memakai suara tutor neural Indonesia. English tetap menjadi materi target, contoh, prompt, dan latihan.');
      root.document.querySelectorAll('.tutor-caption span').forEach(function(label){
        setTextIfChanged(label, 'PENJELASAN TUTOR · INDONESIA');
      });
      var state = root.document.getElementById('tutorVoiceState');
      if (state && /ready/i.test(state.textContent || '')) {
        setTextIfChanged(state, 'Tutor neural Indonesia siap. Tanyakan kapan pun ada yang belum jelas.');
      }
    } catch (_) {}
    if (wasObserving) observe();
  }

  // Coalesce bursts: a single render replaces the whole subtree and emits many records,
  // and running the pass per record was pure waste.
  function scheduleCorrection(){
    if (scheduled) return;
    scheduled = true;
    var run = function(){ scheduled = false; correctVisibleContract(); };
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function observe(){
    var app = root.document.getElementById('app');
    if (!app || !root.MutationObserver) return;
    if (!observer) observer = new root.MutationObserver(scheduleCorrection);
    try { observer.observe(app, { childList: true, subtree: true }); } catch (_) {}
  }

  observe();
  correctVisibleContract();
})(typeof globalThis !== 'undefined' ? globalThis : window);