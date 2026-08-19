(function(root){
  'use strict';

  if (!root || root.__fiezelPuterTtsProviderInstalled) return;
  root.__fiezelPuterTtsProviderInstalled = true;

  var PROVIDER = 'puter-cloud';
  var MODEL = 'gpt-4o-mini-tts';
  var CLOUD_TIMEOUT_MS = 12000;
  var baseRuntime = root.FiezelVoiceRuntime || null;
  var baseIndonesian = root.FiezelIndonesianVoice || null;
  var cloudServices = Object.create(null);
  var decodeContext = null;

  function diag(entry) {
    try {
      var record = Object.assign({ t: Date.now(), engine: PROVIDER }, entry || {});
      var sink = root.FiezelVoiceDiagnostics;
      if (sink && typeof sink.record === 'function') { sink.record(record, root); return; }
      var key = 'fiezel-neural-voice-diagnostics-v1';
      var rows = JSON.parse(root.localStorage.getItem(key) || '[]');
      rows.push(record);
      root.localStorage.setItem(key, JSON.stringify(rows.slice(-200)));
    } catch (_) {}
  }

  function online() {
    try { return !root.navigator || root.navigator.onLine !== false; } catch (_) { return true; }
  }

  function signedIn() {
    try {
      return !!(root.puter && root.puter.ai && typeof root.puter.ai.txt2speech === 'function' &&
        root.puter.auth && typeof root.puter.auth.isSignedIn === 'function' &&
        root.puter.auth.isSignedIn() === true);
    } catch (_) { return false; }
  }

  function eligible() { return online() && signedIn(); }

  function language(options) {
    var value = String(options && options.lang || '');
    // The global FiezelVoiceRuntime has always been the English/default runtime.
    // Only an explicit Indonesian lang switches it; FiezelIndonesianVoice passes that
    // explicitly. Treating a missing lang as Indonesian would silently change Library,
    // Listening, and any legacy caller that relied on the historical English default.
    return /^id/i.test(value) ? 'id' : 'en';
  }

  function cloudVoice(lang) {
    return lang === 'en' ? 'nova' : 'coral';
  }

  function instructionFor(lang, options) {
    var opts = options || {};
    var intent = String(opts.intent || '');
    var rate = Math.max(0.75, Math.min(1.25, Number(opts.speed) || 1));
    var base = lang === 'en'
      ? 'Speak as a clear, warm English tutor. Keep the rhythm conversational, articulate examples distinctly, and let questions rise naturally at the end.'
      : 'Bacakan dalam Bahasa Indonesia yang natural, jernih, hangat, dan seperti tutor manusia. Pertahankan pengucapan istilah Inggris apa adanya. Naikkan intonasi secara natural pada kalimat tanya.';
    if (rate < 0.95) base += lang === 'en' ? ' Speak a little slower than normal.' : ' Bicara sedikit lebih pelan dari tempo normal.';
    else if (rate > 1.05) base += lang === 'en' ? ' Speak a little faster than normal without rushing.' : ' Bicara sedikit lebih cepat dari tempo normal tanpa terburu-buru.';
    if (/sapaan/i.test(intent)) base += ' Untuk sapaan, terdengar ringan dan ramah, bukan seperti pembaca berita.';
    if (/puji|praise|correct/i.test(intent)) base += ' Untuk pujian, terdengar positif tetapi tidak berlebihan.';
    return base;
  }

  function getDecodeContext() {
    if (decodeContext && decodeContext.state !== 'closed') return decodeContext;
    var Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) throw new Error('puter_tts_audio_context_unavailable');
    try { decodeContext = new Ctor({ sampleRate: 44100, latencyHint: 'playback' }); }
    catch (_) { decodeContext = new Ctor(); }
    return decodeContext;
  }

  function withTimeout(promise, ms, label) {
    var timer;
    return Promise.race([
      promise,
      new Promise(function(_, reject) {
        timer = root.setTimeout(function() {
          var error = new Error(label || 'puter_tts_timeout');
          error.code = 'puter_tts_timeout';
          reject(error);
        }, ms);
      })
    ]).finally(function(){ if (timer) root.clearTimeout(timer); });
  }

  async function responseBytes(value) {
    if (!value) throw new Error('puter_tts_empty_response');
    if (value instanceof ArrayBuffer) return value;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return value.arrayBuffer();
    var src = '';
    try { src = String(value.currentSrc || value.src || ''); } catch (_) { src = ''; }
    if (!src) throw new Error('puter_tts_audio_src_missing');
    var response = await root.fetch(src, { cache: 'no-store' });
    if (!response || !response.ok) throw new Error('puter_tts_audio_fetch_failed');
    return response.arrayBuffer();
  }

  async function decodeToPcm(value) {
    var bytes = await responseBytes(value);
    var ctx = getDecodeContext();
    var decoded = await ctx.decodeAudioData(bytes.slice(0));
    if (!decoded || !decoded.numberOfChannels) throw new Error('puter_tts_decode_empty');
    var samples = Float32Array.from(decoded.getChannelData(0));
    var conditioner = root.FiezelWebAudioPlayer && root.FiezelWebAudioPlayer.conditionSamples;
    if (typeof conditioner === 'function') samples = conditioner(samples);
    return { audio: samples, sampling_rate: Number(decoded.sampleRate) || 44100 };
  }

  function createAdapter(lang) {
    return Object.freeze({
      kind: PROVIDER,
      architecture: 'puter-user-pays-cloud-tts',
      modelId: MODEL,
      initialize: function(){ return Promise.resolve(true); },
      listVoices: function(){ return Promise.resolve([cloudVoice(lang)]); },
      stop: function(){},
      release: function(){},
      generate: async function(text, options) {
        if (!eligible()) {
          var unavailable = new Error('puter_tts_unavailable');
          unavailable.code = 'puter_tts_unavailable';
          throw unavailable;
        }
        var opts = options || {};
        var activeLang = language(Object.assign({ lang: lang === 'en' ? 'en-US' : 'id-ID' }, opts));
        var prosody = root.FiezelProsody;
        var spoken = prosody && typeof prosody.punctuate === 'function'
          ? prosody.punctuate(String(text || ''), activeLang === 'en' ? 'en-US' : 'id-ID')
          : String(text || '');
        // Puter documents a strict <3000-character TTS input limit. The core normally
        // chunks well below this, but fail to the complete local utterance rather than
        // truncating or sending an invalid paid request if punctuation pushes it over.
        if (spoken.length >= 3000) {
          var tooLong = new Error('puter_tts_input_too_long');
          tooLong.code = 'puter_tts_input_too_long';
          throw tooLong;
        }
        var request = {
          provider: 'openai',
          model: MODEL,
          voice: cloudVoice(activeLang),
          response_format: 'wav',
          // Puter's OpenAI surface documents tempo as part of natural-language
          // instructions, not as a separate speed field.
          instructions: instructionFor(activeLang, opts)
        };
        var started = Date.now();
        diag({ phase: 'puter_tts_start', lang: activeLang, chars: spoken.length, model: MODEL, voice: request.voice });
        var audio = await withTimeout(
          Promise.resolve(root.puter.ai.txt2speech(spoken, request)).then(decodeToPcm),
          CLOUD_TIMEOUT_MS,
          'puter_tts_timeout'
        );
        diag({ phase: 'puter_tts_ready', lang: activeLang, elapsedMs: Date.now() - started,
          samples: audio.audio.length, sampleRate: audio.sampling_rate });
        return audio;
      }
    });
  }

  function cloudConfig() {
    var base = root.FiezelNeuralVoiceConfig || {};
    var limits = Object.freeze(Object.assign({}, base.limits || {}, {
      // Keep a cloud utterance atomic. Puter accepts <3000 chars, so 2999 is the
      // service boundary. The huge word limits ensure anything inside that boundary is
      // one adapter.generate() call. This matters for network failure: no cloud PCM is
      // played until the complete remote response has arrived and decoded, so a failure
      // can fall back locally without repeating an already-spoken first cloud chunk.
      maxInputChars: 2999,
      targetChunkWords: 2000,
      hardChunkWords: 2000
    }));
    return Object.freeze(Object.assign({}, base, { limits: limits }));
  }

  function createCloudService(lang) {
    if (cloudServices[lang]) return cloudServices[lang];
    if (!root.FiezelNeuralVoice || !root.FiezelWebAudioPlayer) throw new Error('puter_tts_runtime_modules_missing');
    var player = root.FiezelWebAudioPlayer.createPlayer(root);
    cloudServices[lang] = root.FiezelNeuralVoice.createVoiceService({
      config: cloudConfig(),
      adapter: createAdapter(lang),
      env: root,
      playAudio: player.play,
      generationTimeoutMs: CLOUD_TIMEOUT_MS,
      // Atomic cloud utterance, not sentence streaming. Local Supertonic keeps its
      // sentence-streaming path because it has a fundamentally different latency model.
      streamSentences: false,
      workerInference: true,
      prosody: root.FiezelProsody || null
    });
    return cloudServices[lang];
  }

  function localStatus(base) {
    try { return base && typeof base.status === 'function' ? base.status() : {}; }
    catch (_) { return {}; }
  }

  function hybridStatus(base, lang) {
    var local = localStatus(base);
    var cloud = eligible();
    return Object.freeze(Object.assign({}, local, {
      primaryProvider: PROVIDER,
      activeProvider: cloud ? PROVIDER : String(local.engine || local.provider || 'supertonic-3'),
      cloudReady: cloud,
      userPays: true,
      paidRuntime: true,
      zeroPaidRuntime: false,
      remoteInference: true,
      crossOriginInference: true,
      activeCrossOriginInference: cloud,
      offlineFallback: 'supertonic-3',
      offlinePrepared: !!local.prepared,
      // `prepared` remains the local bundle contract. Cloud availability belongs
      // in cloudReady/ready; otherwise setup UI and offline gates would falsely
      // report the 153 MB fallback as installed merely because Puter is signed in.
      prepared: !!local.prepared,
      ready: cloud || !!local.ready,
      language: lang
    }));
  }

  async function cloudFirstSpeak(base, text, options, lang) {
    var opts = options || {};
    if (eligible()) {
      try {
        var result = await createCloudService(lang).speak(text, Object.assign({}, opts, {
          lang: lang === 'en' ? 'en-US' : 'id-ID',
          allowFallback: false
        }));
        return Object.assign({}, result, { provider: PROVIDER, fallbackProvider: 'supertonic-3' });
      } catch (error) {
        diag({ phase: 'puter_tts_fallback_local', lang: lang,
          error: String(error && (error.message || error.name) || error) });
      }
    } else {
      diag({ phase: 'puter_tts_local_selected', lang: lang,
        reason: online() ? 'signed_out' : 'offline' });
    }
    if (!base || typeof base.speak !== 'function') throw new Error('supertonic_fallback_unavailable');
    return base.speak(text, opts);
  }

  function stopCloud() {
    Object.keys(cloudServices).forEach(function(key) {
      try { cloudServices[key] && cloudServices[key].stop && cloudServices[key].stop(); } catch (_) {}
    });
  }

  if (baseRuntime) {
    root.FiezelVoiceRuntime = Object.freeze(Object.assign({}, baseRuntime, {
      status: function(){ return hybridStatus(baseRuntime, 'en'); },
      ensureReady: function(){ return eligible() ? Promise.resolve(hybridStatus(baseRuntime, 'en')) : baseRuntime.ensureReady(); },
      speak: function(text, options){ return cloudFirstSpeak(baseRuntime, text, options, language(options)); },
      // Never spend User-Pays allowance speculatively. Local prefetch instead makes the
      // offline fallback ready while the learner is reading the current beat.
      prefetch: function(text, options){
        return typeof baseRuntime.prefetch === 'function' ? baseRuntime.prefetch(text, options || {}) : Promise.resolve(false);
      },
      stop: function(){ stopCloud(); return baseRuntime.stop && baseRuntime.stop(); },
      release: function(){
        stopCloud();
        cloudServices = Object.create(null);
        return baseRuntime.release ? baseRuntime.release() : Promise.resolve();
      },
      __puterCloudPrimary: true
    }));
  }

  if (baseIndonesian) {
    root.FiezelIndonesianVoice = Object.freeze(Object.assign({}, baseIndonesian, {
      status: function(){ return hybridStatus(baseIndonesian, 'id'); },
      speak: function(text, options){ return cloudFirstSpeak(baseIndonesian, text, Object.assign({}, options || {}, { lang: 'id-ID' }), 'id'); },
      prefetch: function(text, options){
        return typeof baseIndonesian.prefetch === 'function' ? baseIndonesian.prefetch(text, options || {}) : Promise.resolve(false);
      },
      stop: function(){ stopCloud(); return baseIndonesian.stop && baseIndonesian.stop(); },
      release: function(){
        stopCloud();
        cloudServices = Object.create(null);
        return baseIndonesian.release ? baseIndonesian.release() : Promise.resolve();
      },
      __puterCloudPrimary: true
    }));
  }

  root.FiezelPuterTtsProvider = Object.freeze({
    schema: 'fiezel-puter-tts-provider-v1',
    provider: PROVIDER,
    model: MODEL,
    eligible: eligible,
    userPays: true,
    offlineFallback: 'supertonic-3'
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
