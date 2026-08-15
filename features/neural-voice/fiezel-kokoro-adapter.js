(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FiezelKokoroAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assertLocalPath(value, name) {
    const text = String(value || '').trim();
    if (!text) throw new Error(name + ' is required');
    if (/^(?:https?:)?\/\//i.test(text) || /^[a-z][a-z0-9+.-]*:/i.test(text)) {
      throw new Error(name + ' must be same-origin/local');
    }
    return text;
  }

  function normalizeWasmPath(value, runtimeOrigin) {
    const text = String(value || '').trim();
    if (!text) throw new Error('wasmBasePath is required');
    if (/^https?:\/\//i.test(text)) {
      const expectedOrigin = String(runtimeOrigin || '').trim();
      if (!expectedOrigin) throw new Error('runtimeOrigin is required for an absolute wasmBasePath');
      const parsed = new URL(text);
      if (parsed.origin !== expectedOrigin) throw new Error('wasmBasePath must be same-origin/local');
      return parsed.href;
    }
    return assertLocalPath(text, 'wasmBasePath');
  }

  function createKokoroAdapter(options) {
    options = options || {};
    const KokoroTTS = options.KokoroTTS;
    const kokoroEnv = options.kokoroEnv;
    const setVoiceDataUrl = options.setVoiceDataUrl;
    const onStage = typeof options.onStage === 'function' ? options.onStage : null;
    if (!KokoroTTS || typeof KokoroTTS.from_pretrained !== 'function') throw new Error('KokoroTTS implementation is required');
    if (!kokoroEnv || typeof kokoroEnv !== 'object') throw new Error('Patched kokoro env export is required');
    if (typeof setVoiceDataUrl !== 'function') throw new Error('setVoiceDataUrl export is required');
    if (!('allowRemoteModels' in kokoroEnv) || !('localModelPath' in kokoroEnv)) throw new Error('Patched local model routing controls are required');
    if (!('wasmPaths' in kokoroEnv)) throw new Error('Local WASM routing control is required');

    const modelId = assertLocalPath(options.modelId || 'kokoro-model', 'modelId');
    const localModelPath = assertLocalPath(options.localModelPath || './vendor/', 'localModelPath');
    const voiceBaseUrl = assertLocalPath(options.voiceBaseUrl || './vendor/kokoro-model/voices', 'voiceBaseUrl');
    const wasmBasePath = normalizeWasmPath(options.wasmBasePath || './vendor/kokoro-js/wasm/', options.runtimeOrigin);
    const dtype = String(options.dtype || 'q8');
    const device = String(options.device || 'wasm');
    let instancePromise = null;

    function stage(phase, detail) {
      if (!onStage) return;
      try { onStage(Object.freeze({ phase, ...(detail || {}) })); } catch (_) {}
    }

    function errorKind(error) {
      return String(error && (error.code || error.name) || 'error').slice(0, 80);
    }

    function effectiveWasmPolicy() {
      const runtime = typeof globalThis !== 'undefined' ? globalThis : {};
      const standalone = runtime.navigator?.standalone === true || !!runtime.matchMedia?.('(display-mode: standalone)')?.matches;
      const isolated = runtime.crossOriginIsolated === true;
      if (standalone && !isolated && device === 'wasm') {
        return Object.freeze({
          policy: 'apple-standalone-single-thread-direct-default',
          numThreads: 1,
          proxy: false,
          source: 'onnxruntime-web-1.22-runtime-default',
          readBack: false
        });
      }
      return Object.freeze({
        policy: isolated ? 'onnxruntime-default-isolated' : 'onnxruntime-default-single-thread',
        numThreads: isolated ? null : 1,
        proxy: false,
        source: 'onnxruntime-web-1.22-runtime-default',
        readBack: false
      });
    }

    function tokenCount(value) {
      const dims = value && value.input_ids && value.input_ids.dims;
      if (!dims || typeof dims.length !== 'number' || dims.length < 1) return null;
      const last = Number(dims[dims.length - 1]);
      return Number.isFinite(last) ? last : null;
    }

    function instrumentInstance(tts) {
      if (!tts || tts.__fiezelStageProbeV2) return tts;
      let tokenizer = false;
      let model = false;
      let voice = false;
      let generateFromIds = false;

      if (typeof Proxy === 'function' && typeof tts.tokenizer === 'function') {
        const originalTokenizer = tts.tokenizer;
        tts.tokenizer = new Proxy(originalTokenizer, {
          apply(target, thisArg, args) {
            const startedAt = Date.now();
            stage('adapter_tokenizer_enter');
            try {
              const value = Reflect.apply(target, thisArg, args);
              stage('adapter_tokenizer_resolved', { elapsedMs: Date.now() - startedAt, tokenCount: tokenCount(value) });
              return value;
            } catch (error) {
              stage('adapter_tokenizer_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
              throw error;
            }
          }
        });
        tokenizer = true;
      }

      if (typeof Proxy === 'function' && typeof tts.model === 'function') {
        const originalModel = tts.model;
        tts.model = new Proxy(originalModel, {
          apply(target, thisArg, args) {
            const startedAt = Date.now();
            stage('adapter_model_enter');
            let result;
            try {
              result = Reflect.apply(target, thisArg, args);
              stage('adapter_model_dispatched', { elapsedMs: Date.now() - startedAt });
            } catch (error) {
              stage('adapter_model_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
              throw error;
            }
            return Promise.resolve(result).then((value) => {
              stage('adapter_model_resolved', { elapsedMs: Date.now() - startedAt });
              return value;
            }, (error) => {
              stage('adapter_model_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
              throw error;
            });
          }
        });
        model = true;
      }

      // m025-4 pre-tokenizer boundary: _validate_voice is the only pre-tokenizer
      // callable reachable on the instance besides the tokenizer. The phonemizer
      // step between voice selection and the tokenizer is a vendored module-level
      // call that is NOT callable on the instance, so it is deliberately left
      // unobserved instead of emitting an unobservable stage.
      if (typeof Proxy === 'function' && typeof tts._validate_voice === 'function') {
        const originalVoice = tts._validate_voice;
        tts._validate_voice = new Proxy(originalVoice, {
          apply(target, thisArg, args) {
            const startedAt = Date.now();
            stage('adapter_pretoken_voice_enter');
            try {
              const value = Reflect.apply(target, thisArg, args);
              stage('adapter_pretoken_voice_resolved', { elapsedMs: Date.now() - startedAt });
              return value;
            } catch (error) {
              stage('adapter_pretoken_voice_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
              throw error;
            }
          }
        });
        voice = true;
      }

      // m025-4 voice-cache boundary: generate_from_ids is the post-tokenizer
      // callable that performs the voice-embedding/voice-cache load before the
      // model call. Its pre-model window (enter -> model_enter via the probe
      // below) isolates that I/O while the model probe keeps model execution
      // separate; the same callable is not a phoneme/text boundary, so no
      // prompt or phoneme content can be observed here.
      if (typeof Proxy === 'function' && typeof tts.generate_from_ids === 'function') {
        const originalFromIds = tts.generate_from_ids;
        tts.generate_from_ids = new Proxy(originalFromIds, {
          apply(target, thisArg, args) {
            const startedAt = Date.now();
            stage('adapter_generate_from_ids_enter');
            let result;
            try {
              result = Reflect.apply(target, thisArg, args);
              stage('adapter_generate_from_ids_dispatched', { elapsedMs: Date.now() - startedAt });
            } catch (error) {
              stage('adapter_generate_from_ids_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
              throw error;
            }
            return Promise.resolve(result).then((value) => {
              stage('adapter_generate_from_ids_resolved', { elapsedMs: Date.now() - startedAt });
              return value;
            }, (error) => {
              stage('adapter_generate_from_ids_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
              throw error;
            });
          }
        });
        generateFromIds = true;
      }

      try { Object.defineProperty(tts, '__fiezelStageProbeV2', { value: true, configurable: false }); } catch (_) {}
      stage('adapter_stage_probe_ready', { tokenizer, model, voice, generateFromIds });
      return tts;
    }

    async function getInstance() {
      if (!instancePromise) {
        kokoroEnv.allowRemoteModels = false;
        if ('allowLocalModels' in kokoroEnv) kokoroEnv.allowLocalModels = true;
        kokoroEnv.localModelPath = localModelPath;
        kokoroEnv.wasmPaths = wasmBasePath;
        setVoiceDataUrl(voiceBaseUrl);
        stage('wasm_policy', effectiveWasmPolicy());
        const startedAt = Date.now();
        stage('adapter_instance_start', { dtype, device });
        instancePromise = Promise.resolve()
          .then(() => KokoroTTS.from_pretrained(modelId, { dtype, device }))
          .then((value) => {
            instrumentInstance(value);
            stage('adapter_instance_ready', { elapsedMs: Date.now() - startedAt });
            return value;
          })
          .catch((error) => {
            instancePromise = null;
            stage('adapter_instance_error', { elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
            throw error;
          });
      }
      return instancePromise;
    }

    async function generate(text, generationOptions) {
      const opts = generationOptions || {};
      const voice = String(opts.voice || '');
      const speed = typeof opts.speed === 'number' ? opts.speed : 1;
      const startedAt = Date.now();
      stage('adapter_generate_enter', { voice });
      const tts = await getInstance();
      stage('adapter_generate_invoke', { voice, elapsedMs: Date.now() - startedAt });
      try {
        const generated = Promise.resolve(tts.generate(text, { voice: opts.voice, speed }));
        stage('adapter_generate_dispatched', { voice, elapsedMs: Date.now() - startedAt });
        const value = await generated;
        const samples = value && (value.audio || value.data);
        stage('adapter_generate_resolved', {
          voice,
          elapsedMs: Date.now() - startedAt,
          samples: samples && typeof samples.length === 'number' ? samples.length : null
        });
        return value;
      } catch (error) {
        stage('adapter_generate_error', { voice, elapsedMs: Date.now() - startedAt, errorKind: errorKind(error) });
        throw error;
      }
    }

    async function listVoices() {
      const tts = await getInstance();
      if (tts.voices && typeof tts.voices === 'object') return Object.keys(tts.voices);
      if (typeof tts.list_voices === 'function') return tts.list_voices() || [];
      return [];
    }

    return Object.freeze({
      kind: 'kokoro-local', modelId, localModelPath, voiceBaseUrl, wasmBasePath, dtype, device,
      initialize: getInstance, generate, listVoices
    });
  }

  return Object.freeze({ createKokoroAdapter, assertLocalPath, normalizeWasmPath });
});