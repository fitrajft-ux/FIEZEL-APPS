/**
 * m025-26 sherpa-onnx VITS-Piper adapter.
 *
 * Replaces the Kokoro ORT/WASM adapter on Apple standalone, where Kokoro q8 was proven
 * unviable: OWNER capture 2026-08-17T16:40:43Z recorded three consecutive WebKit
 * content-process kills during inference, zero successes, and >30s for a 49-char chunk.
 *
 * This runtime is the exact substrate benchmarked in m025-37 on Safari 26.5.2 arm64:
 * ready 4099ms, first 855ms, warm median 786ms, worst realtime factor 0.347, six
 * distinct finite voices, crossOriginIsolated=false. Sub-realtime without COOP/COEP,
 * which is what GitHub Pages can actually serve.
 *
 * The decisive structural difference from Kokoro: all model work happens inside a
 * dedicated Worker, so the main thread never owns a long WASM call. That is why the
 * event loop stays responsive and the content process is not killed.
 *
 * Satisfies the same adapter contract as fiezel-kokoro-adapter.js:
 *   kind, initialize(), generate(text,{voice,speed}), listVoices(), getBackendState()
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FiezelSherpaVitsAdapter = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RUNTIME_BASE = 'vendor/sherpa-vits/';
  var WORKER_FILE = 'sherpa-onnx-tts.worker.js';
  var EXPECTED_SPEAKERS = 904;
  var MODEL_ID = 'vits-piper-en_US-libritts_r-medium';
  var ARCHITECTURE = 'sherpa-onnx-v1.13.5-vits-piper-wasm-worker';

  // FIEZEL voice id -> Piper speaker id. The six speaker ids are the ones proven
  // distinct in m025-37 (min envelope distance 0.158 across all 15 pairs).
  // Existing FIEZEL ids are retained so stored user preferences keep resolving, but
  // every slot is genuinely en-US: this model has no en-GB speakers, and labelling
  // one as en-GB would be a lie the audio does not support.
  var VOICE_SIDS = Object.freeze({
    af_bella: 0,
    af_heart: 180
  });
  var DEFAULT_VOICE = 'af_bella';

  // Natural speaking-rate calibration, set from OWNER physical listening across three
  // builds rather than from a formula:
  //   1.00 (m025-26) -> ~215 wpm, too fast to follow, but preferred over the next try
  //   0.70 (m025-27) -> ~150 wpm, rejected as "slow motion"
  //   0.85 (m025-28) -> ~183 wpm, between the two, leaning toward the faster one
  // OWNER asked for a rate below the first and above the second, closer to the first.
  // 183 wpm is brisk-but-natural: above conversational average, below the original.
  // This scales playback duration only; generation cost tracks token count, so the
  // responsiveness OWNER asked me to preserve is unaffected.
  var NATURAL_SPEED = 0.85;
  // Guard rails so a caller cannot request an unintelligible or absurd rate.
  var MIN_ENGINE_SPEED = 0.4;
  var MAX_ENGINE_SPEED = 1.6;
  // A breath group, not a paragraph. Longer units are split again at clause punctuation
  // by the prosody module, so no phrase is ever cut mid-thought.
  var PHRASE_MAX_CHARS = 160;

  function createSherpaVitsAdapter(options) {
    var opts = options || {};
    var env = opts.env || (typeof globalThis !== 'undefined' ? globalThis : {});
    var onStage = typeof opts.onStage === 'function' ? opts.onStage : null;
    var basePath = String(opts.basePath || RUNTIME_BASE);
    // m025-32: the adapter is language-agnostic. A second bundle (Indonesian) reuses
    // this exact worker protocol with a different base path, model and speaker map.
    var expectedSpeakers = Number.isFinite(Number(opts.expectedSpeakers)) ? Number(opts.expectedSpeakers) : EXPECTED_SPEAKERS;
    var modelId = String(opts.modelId || MODEL_ID);
    var voiceSids = opts.voiceSids || VOICE_SIDS;
    var defaultVoice = String(opts.defaultVoice || DEFAULT_VOICE);
    var kind = String(opts.kind || 'sherpa-vits-local');
    // m025-45: pitch contour is a REPAIR for an engine with no intonation of its own.
    // Supertonic has one, so resampling its output only adds interpolation noise - the
    // "cracking" OWNER reported. Engines declare whether they need it.
    var usePitchContour = opts.usePitchContour !== false;
    // m025-37: prosody shaping. Optional so the adapter still works standalone in tests.
    //
    // m025-48 defect: the fallback below used to read `root`, and `root` does not exist
    // in this scope. The UMD wrapper takes it as a parameter, but this factory is written
    // as an ARGUMENT to that wrapper, so its scope chain skips the wrapper's parameters
    // entirely and `root` was a free global that nothing ever defines. `typeof` then hid
    // it: the expression evaluated to null in every browser, in every release. Every
    // caller in the tree relied on that fallback, so punctuate() - the whole reason the
    // Indonesian line gets clause commas and a terminal mark - had never once run on a
    // device. The tests passed because each one injects prosody explicitly.
    // `env` is the real global here (the engines pass env: root), so the fallback now
    // resolves through it, and both engines pass prosody outright as well.
    var prosody = opts.prosody || (env && env.FiezelProsody) || null;
    // m025-42 Supertonic. Three differences from the Piper bundles, all optional so the
    // Piper path is byte-for-byte unchanged:
    //   generationLang - Supertonic is one multilingual model, so every request must
    //                    name its language; Piper bakes the language into the model.
    //   persona        - the speaker/speed/pitch triple OWNER chose per line type.
    //   padSilence     - Supertonic already emits 0.5-0.7s at a sentence boundary
    //                    (measured), so the synthetic gap would be a DOUBLE pause.
    var generationLang = opts.generationLang ? String(opts.generationLang) : '';
    // Flow-matching denoising steps. Measured on the vendored model, one line, 1 thread:
    //   steps 1-3 -> 2.4-4x faster but the words break down (ASR word error 1.00/0.55/0.27)
    //   steps 4   -> word error 0.000, RTF 0.250, pitch range 18.3 semitones
    //   steps 5   -> word error 0.000, RTF 0.331, pitch range 14.1 semitones  (engine default)
    //   steps 6-8 -> slower AND progressively flatter (12.6 -> 8.7 semitones)
    // So 4 is not a quality/speed trade at all: it is faster and more expressive than
    // the default. Below 4 is a cliff, not a dial - never lower this to buy speed.
    var generationSteps = Number(opts.generationSteps) > 0 ? Math.floor(Number(opts.generationSteps)) : 0;
    // m025-48. The generation config has carried a silence_scale field all along and this
    // adapter never set one, so every render used the vendored glue's fallback of 0.2 -
    // silence tokens shortened to a fifth of what the duration predictor asked for. That
    // is the mechanism behind "kata-katanya nyambung terus": the commas prosody works so
    // hard to insert were reaching the model and then being spent at 20% value.
    //
    // It only governs silence INSIDE a rendered line. Sentence boundaries are the
    // player's business now - it trims each render's own lead-in and tail-out and
    // schedules the next line after a measured gap - so raising this lengthens breaths
    // within a sentence without touching the space between two of them.
    var silenceScale = Number(opts.silenceScale) > 0 ? Number(opts.silenceScale) : 0;
    // Same broken-scope fallback as prosody above; personas happened to survive only
    // because every caller passes them explicitly.
    var personas = opts.personas || (env && env.FiezelVoicePersona) || null;
    var usePersona = opts.usePersona === true && !!personas;
    var padBetweenPhrases = opts.padBetweenPhrases !== false;
    // m025-47: Supertonic already models punctuation and breath pauses itself. Splitting
    // one sentence into several independent worker renders adds repeated inference cost
    // and creates a waveform seam when those renders are joined. Unless an engine opts
    // in explicitly, the Supertonic capability combination below therefore stays as one
    // continuous render. Piper keeps the legacy phrase shaping path unchanged.
    var segmentPhrases = Object.prototype.hasOwnProperty.call(opts, 'segmentPhrases')
      ? opts.segmentPhrases !== false
      : !(generationLang && padBetweenPhrases === false && usePitchContour === false);
    // Supertonic is calibrated at 1.0 = natural; Piper needed 0.85 (see NATURAL_SPEED).
    var naturalSpeed = Number(opts.naturalSpeed) > 0 ? Number(opts.naturalSpeed) : NATURAL_SPEED;
    // m025-48. Turning the pitch resampler off in m025-45 removed the interpolation
    // noise, but it also removed the only thing that made one sentence sound different
    // from the next: with usePitchContour false the persona's `pitch` is never read, so
    // the two registers differed by speaker id and nothing else, and inside a register
    // every sentence was delivered identically. Rate is the cue that survives - it is the
    // engine's own timing rather than an effect applied to its output - so delivery is
    // shaped there instead, per sentence, from what the sentence is doing.
    var useEmotion = opts.useEmotion !== false;

    var worker = null;
    var readyPromise = null;
    var pending = null;
    // True for the whole multi-phrase sequence of one generate() call.
    var generating = false;
    // m028-5: the worker is a single WASM thread with no cancellation primitive, so
    // stop() can silence the CALLER's promise but it cannot make the worker stop
    // computing. Without this flag, stop() clears `pending`/`generating` and a new
    // generate() can post a second message while the first is still in flight; the
    // worker's late reply for the FIRST request then resolves whichever request
    // currently owns `pending` - the second one - with the first request's audio. This
    // flag tracks the underlying computation independently of whether anyone is still
    // waiting for it, so a new request cannot start until the worker actually replies.
    var workerBusy = false;
    var backendState = Object.freeze({ id: 'uninitialized', device: '', dtype: '' });
    var numSpeakers = 0;
    var modelType = null;
    var sampleRate = 0;

    function stage(phase, detail) {
      if (!onStage) return;
      try { onStage(Object.assign({ phase: phase }, detail || {})); } catch (_) {}
    }

    function backendDetail(extra) {
      return Object.assign({
        backendId: backendState.id,
        backendDevice: backendState.device,
        backendDtype: backendState.dtype
      }, extra || {});
    }

    function resolveSid(voice) {
      var key = String(voice || defaultVoice);
      if (Object.prototype.hasOwnProperty.call(voiceSids, key)) return voiceSids[key];
      return voiceSids[defaultVoice];
    }

    // Reject a late/duplicate settle instead of silently dropping it, so a stale worker
    // reply can never be mistaken for the current request's audio.
    function settlePending(handler, value) {
      if (!pending) return;
      var current = pending;
      pending = null;
      current[handler](value);
    }

    function handleMessage(event) {
      var data = (event && event.data) || {};
      if (data.type === 'sherpa-onnx-tts-ready') {
        numSpeakers = Number(data.numSpeakers) || 0;
        modelType = Number(data.modelType);
        backendState = Object.freeze({ id: 'sherpa-vits-wasm-worker', device: 'wasm-simd-worker', dtype: 'fp32' });
        stage('adapter_backend_ready', backendDetail({ numSpeakers: numSpeakers, modelType: modelType, model: modelId }));
        return;
      }
      if (data.type === 'sherpa-onnx-tts-result') {
        sampleRate = Number(data.sampleRate) || sampleRate;
        // The reply that just arrived is, by construction, the reply to the most
        // recent postMessage - the guard below never lets a second one be sent while
        // this flag is true. Clearing it here, unconditionally, is what lets a
        // request that arrives after stop() actually start the worker again instead
        // of being told the adapter is still busy forever.
        workerBusy = false;
        settlePending('resolve', { samples: data.samples, sampleRate: sampleRate });
        return;
      }
      if (data.type === 'error') {
        workerBusy = false;
        var error = new Error(String(data.message || 'sherpa_worker_error'));
        if (pending) settlePending('reject', error);
        else stage('adapter_worker_error', backendDetail({ error: error.message }));
      }
    }

    function initialize() {
      if (readyPromise) return readyPromise;
      readyPromise = new Promise(function (resolve, reject) {
        var Ctor = env.Worker;
        if (typeof Ctor !== 'function') { reject(new Error('sherpa_worker_unavailable')); return; }
        var startedAt = Date.now();
        stage('adapter_instance_start', { architecture: ARCHITECTURE, model: modelId, device: 'wasm-simd-worker' });
        try {
          worker = new Ctor(basePath + WORKER_FILE);
        } catch (error) { reject(error); return; }

        var settled = false;
        worker.onmessage = function (event) {
          var data = (event && event.data) || {};
          handleMessage(event);
          if (!settled && data.type === 'sherpa-onnx-tts-ready') {
            settled = true;
            if (numSpeakers !== expectedSpeakers) {
              reject(new Error('sherpa_speaker_count_mismatch:' + numSpeakers));
              return;
            }
            stage('adapter_instance_ready', backendDetail({ elapsedMs: Date.now() - startedAt, numSpeakers: numSpeakers }));
            resolve(api);
          } else if (!settled && data.type === 'error') {
            settled = true;
            reject(new Error(String(data.message || 'sherpa_worker_error')));
          }
        };
        worker.onerror = function (event) {
          var error = new Error('sherpa_worker_failed:' + String((event && event.message) || 'error'));
          if (pending) settlePending('reject', error);
          if (!settled) { settled = true; reject(error); }
        };
      }).catch(function (error) {
        // Allow a later explicit retry rather than latching the failure for the page life.
        readyPromise = null;
        try { if (worker) worker.terminate(); } catch (_) {}
        worker = null;
        stage('adapter_instance_error', { error: String((error && error.message) || error) });
        throw error;
      });
      return readyPromise;
    }

    // One worker round trip. The single-flight guard above this stays authoritative;
    // this helper only owns the request/response pair.
    function synthesize(unit, sid, speed) {
      return new Promise(function (resolve, reject) {
        pending = { resolve: resolve, reject: reject };
        workerBusy = true;
        try {
          // generateWithConfig is the only path that carries `extra`, and `extra.lang`
          // is how a multilingual model is told which language this line is. The
          // vendored worker has handled both message types since m025-26, so this is
          // a message-shape choice, not a worker change.
          var genConfig = { sid: sid, speed: speed, extra: { lang: generationLang } };
          if (generationSteps) genConfig.numSteps = generationSteps;
          if (silenceScale) genConfig.silenceScale = silenceScale;
          worker.postMessage(generationLang
            ? { type: 'generateWithConfig', text: unit, genConfig: genConfig }
            : { type: 'generate', text: unit, sid: sid, speed: speed });
        } catch (error) { pending = null; workerBusy = false; reject(error); }
      });
    }

    // Joining independently rendered waveforms at a raw sample boundary can create a
    // step discontinuity. Engines with synthetic silence already meet at zero; engines
    // without that padding get a tiny 6ms equal-power-like linear overlap instead.
    function concatSamples(parts, Ctor, rate, smoothBoundary) {
      if (parts.length === 1) return parts[0];
      var overlapTarget = smoothBoundary ? Math.max(1, Math.round((Number(rate) || 24000) * 0.006)) : 0;
      var total = parts[0].length;
      for (var i = 1; i < parts.length; i++) {
        var overlap = Math.min(overlapTarget, parts[i - 1].length, parts[i].length);
        total += parts[i].length - overlap;
      }
      var out = new Ctor(total);
      out.set(parts[0], 0);
      var at = parts[0].length;
      for (var partIndex = 1; partIndex < parts.length; partIndex++) {
        var part = parts[partIndex];
        var blend = Math.min(overlapTarget, at, part.length);
        if (blend > 0) {
          for (var j = 0; j < blend; j++) {
            var mix = (j + 1) / (blend + 1);
            var outIndex = at - blend + j;
            out[outIndex] = out[outIndex] * (1 - mix) + part[j] * mix;
          }
          out.set(part.subarray(blend), at);
          at += part.length - blend;
        } else {
          out.set(part, at);
          at += part.length;
        }
      }
      return out;
    }

    /**
     * Delivery for one line when the engine owns its own intonation: the persona's
     * baseline register, moved by what this particular sentence is doing.
     */
    function deliveryFor(unit, base, generationOptions, lang) {
      var baseSpeed = base && Number(base.speed) > 0 ? Number(base.speed) : 1;
      var basePitch = base && Number(base.pitch) > 0 ? Number(base.pitch) : 1;
      if (!useEmotion || !prosody || typeof prosody.emotion !== 'function') {
        return { speed: baseSpeed, pitch: basePitch };
      }
      var options = generationOptions || {};
      var mood = prosody.emotion(unit, options.intent, lang || generationLang, options.position);
      var moved = baseSpeed * (mood && Number(mood.speed) > 0 ? Number(mood.speed) : 1);
      // The persona ceiling exists because the measured pitch range COLLAPSES past it;
      // a sentence shape must never be the thing that pushes a register through it.
      var ceiling = prosody.PERSONA_SPEED_MAX || 1.24;
      return {
        speed: Math.min(ceiling, Math.max(0.6, moved)),
        pitch: basePitch,
        emotion: mood ? mood.id : null
      };
    }

    function generate(text, generationOptions) {
      var options = generationOptions || {};
      var voice = String(options.voice || defaultVoice);
      var lang = String(options.lang || '');
      var requested = typeof options.speed === 'number' && options.speed > 0 ? options.speed : 1;
      // The product's speed 1 means "natural", not "engine default". Callers keep
      // relative control: 1.1 is still 10% faster than natural.
      var speed = Math.min(MAX_ENGINE_SPEED, Math.max(MIN_ENGINE_SPEED, naturalSpeed * requested));
      // m025-42: the persona decides WHO speaks this line and in which register.
      // A praise line and an explanation are different speakers on purpose - that
      // alternation is what stops a long lesson from flattening into one voice.
      var persona = usePersona ? personas.resolve(text, options.intent) : null;
      var sid = persona ? persona.sid : resolveSid(voice);
      var personaBase = persona ? { speed: persona.speed, pitch: persona.pitch } : null;
      var startedAt = Date.now();
      stage('adapter_generate_enter', backendDetail({
        voice: voice, sid: sid, requestedSpeed: requested, engineSpeed: speed,
        lang: lang || generationLang || null, persona: persona ? persona.id : null
      }));
      return initialize().then(function () {
        // The worker protocol carries exactly one in-flight generation. Fail closed on a
        // second request rather than interleaving and returning another request's audio.
        // m025-41: a request now spans several worker calls, so the guard covers the whole
        // phrase sequence, not just one postMessage.
        if (pending || generating || workerBusy) {
          var busy = new Error('neural_generation_busy');
          stage('adapter_generate_busy', backendDetail({ voice: voice, sid: sid, workerBusy: workerBusy }));
          throw busy;
        }
        // Punctuation is the only lever this model exposes for pausing: its duration
        // predictor places silence at punctuation, never at a bare word boundary. The
        // language decides which markers apply, so an Indonesian line is shaped by
        // Indonesian rules instead of being left unpunctuated and level.
        var spoken = prosody && prosody.punctuate ? prosody.punctuate(text, lang) : String(text || '');
        // Piper still benefits from explicit phrase shaping. Supertonic does not: it owns
        // its punctuation/prosody natively, and a single render is both faster and free of
        // artificial waveform joins.
        var units = segmentPhrases && prosody && prosody.phrases ? prosody.phrases(spoken, PHRASE_MAX_CHARS, lang) : [];
        if (!units.length) units = [spoken];
        generating = true;
        var parts = [];
        var rate = 0;

        function step(index) {
          if (index >= units.length) return null;
          var unit = units[index];
          var shape = (usePitchContour && prosody && prosody.contour)
            ? prosody.contour(unit, index, units.length, personaBase)
            : deliveryFor(unit, personaBase, options, lang);
          var unitSpeed = Math.min(MAX_ENGINE_SPEED, Math.max(MIN_ENGINE_SPEED, speed * shape.speed));
          stage('adapter_generate_invoke', backendDetail({
            voice: voice, sid: sid, elapsedMs: Date.now() - startedAt,
            phraseIndex: index, phraseCount: units.length, phraseSpeed: unitSpeed, phrasePitch: shape.pitch,
            emotion: shape.emotion || null, silenceScale: silenceScale || null
          }));
          return synthesize(unit, sid, unitSpeed).then(function (result) {
            var samples = result.samples;
            if (!samples || !samples.length) throw new Error('sherpa_empty_audio');
            rate = result.sampleRate || rate;
            // Pitch movement between breath groups, for engines that produce none.
            if (usePitchContour && prosody && prosody.resample) samples = prosody.resample(samples, shape.pitch);
            // Real trailing silence, so consecutive phrases land as separate breath groups
            // instead of being butted together into one continuous stream.
            if (prosody && prosody.padSilence && options.pad !== false && padBetweenPhrases) {
              var gap = prosody.pauseAfter ? prosody.pauseAfter(unit, lang) : 0;
              samples = prosody.padSilence(samples, rate, gap);
            }
            parts.push(samples);
            return step(index + 1);
          });
        }

        return Promise.resolve()
          .then(function () { return step(0); })
          .then(function () {
            generating = false;
            if (!parts.length) throw new Error('sherpa_empty_audio');
            var Ctor = parts[0].constructor;
            var audio = concatSamples(parts, Ctor, rate, !padBetweenPhrases);
            stage('adapter_generate_ready', backendDetail({
              voice: voice, sid: sid, elapsedMs: Date.now() - startedAt,
              samples: audio.length, sampleRate: rate, phrases: units.length,
              segmented: units.length > 1
            }));
            return {
              audio: audio, sampling_rate: rate, voice: voice, sid: sid,
              persona: persona ? persona.id : null
            };
          })
          .catch(function (error) { generating = false; throw error; });
      });
    }

    function listVoices() { return Promise.resolve(Object.keys(voiceSids)); }

    function stop() {
      generating = false;
      if (pending) settlePending('reject', new Error('neural_generation_stopped'));
    }

    function release() {
      stop();
      try { if (worker) worker.terminate(); } catch (_) {}
      worker = null;
      readyPromise = null;
      backendState = Object.freeze({ id: 'uninitialized', device: '', dtype: '' });
    }

    var api = Object.freeze({
      kind: kind,
      architecture: ARCHITECTURE,
      modelId: modelId,
      voiceSids: voiceSids,
      defaultVoice: defaultVoice,
      initialize: initialize,
      generate: generate,
      listVoices: listVoices,
      stop: stop,
      release: release,
      getBackendState: function () { return backendState; }
    });
    return api;
  }

  return Object.freeze({ createSherpaVitsAdapter: createSherpaVitsAdapter, VOICE_SIDS: VOICE_SIDS, DEFAULT_VOICE: DEFAULT_VOICE, MODEL_ID: MODEL_ID, NATURAL_SPEED: NATURAL_SPEED, MIN_ENGINE_SPEED: MIN_ENGINE_SPEED, MAX_ENGINE_SPEED: MAX_ENGINE_SPEED });
}));