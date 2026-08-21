(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FiezelNeuralVoice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeText(input, maxChars) {
    const text = String(input == null ? '' : input)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) throw new Error('TTS text is empty');
    if (text.length > maxChars) throw new Error('TTS text exceeds bounded input limit');
    return text;
  }

  function splitByHardChars(chunks, hardChars) {
    const limit = Number(hardChars) > 0 ? Math.floor(Number(hardChars)) : 0;
    if (!limit) return chunks;
    const bounded = [];
    for (const rawChunk of chunks) {
      const chunk = String(rawChunk || '').trim();
      if (!chunk) continue;
      if (chunk.length <= limit) {
        bounded.push(chunk);
        continue;
      }
      const words = chunk.split(/\s+/);
      // m025-73: potongannya DISEIMBANGKAN, tidak sekadar diisi sampai penuh lalu menyisakan
      // ekor pendek.
      //
      // Bukti perangkat OWNER pada m025-72: teks berisi tanda petik membuat suara terjeda
      // sekitar 10 detik, dan pada 8 langkah menjadi hampir 20 detik — tepat dua kali lipat,
      // yaitu waktu generate. Penyebabnya bukan tanda petiknya, melainkan ekor pendek yang
      // dihasilkan pemotongan serakah: satu potongan seperti "serempak." hanya berbunyi
      // setengah detik tetapi tetap menuntut satu putaran generate penuh, dan prefetch tidak
      // mungkin menyembunyikan enam detik di balik setengah detik pemutaran.
      //
      // Membagi rata menghilangkan ekor itu: setiap potongan berdurasi mirip, sehingga
      // pemutaran satu potongan punya cukup waktu untuk menutupi pembuatan potongan berikutnya.
      const pieces = Math.max(1, Math.ceil(chunk.length / limit));
      const target = Math.ceil(chunk.length / pieces);
      let current = [];
      let currentLength = 0;
      function flush() {
        if (current.length) bounded.push(current.join(' '));
        current = [];
        currentLength = 0;
      }
      for (const word of words) {
        if (word.length > limit) {
          flush();
          for (let i = 0; i < word.length; i += limit) bounded.push(word.slice(i, i + limit));
          continue;
        }
        const added = current.length ? 1 + word.length : word.length;
        // Batas keras tetap dihormati; target hanya menentukan kapan sebaiknya berpindah,
        // sehingga sisa terakhir tidak pernah tertinggal sebagai serpihan.
        if (current.length && (currentLength + added > limit || currentLength >= target)) flush();
        current.push(word);
        currentLength += currentLength ? 1 + word.length : word.length;
      }
      flush();
    }
    return bounded;
  }

  /**
   * m025-74: potongan PERTAMA dibuat pendek, sisanya tetap seperti biasa.
   *
   * Bukti perangkat OWNER pada m025-73: jeda saat tanda petik sudah jauh membaik, tetapi jeda
   * SAAT MULAI MEMBACA masih sangat lama. Itu bukan cacat tersembunyi, melainkan aritmetika
   * yang tersisa: setiap jeda lain bisa disembunyikan di balik pemutaran potongan sebelumnya,
   * sedangkan potongan pertama tidak punya apa pun untuk bersembunyi. Waktu sampai kata
   * pertama SAMA DENGAN waktu membuat potongan pertama.
   *
   * Karena waktu generate tumbuh mengikuti panjang teks, memendekkan potongan pembuka
   * memendekkan penantian itu secara langsung. Potongan berikutnya kembali berukuran penuh,
   * dan selama pembuka masih berbunyi, potongan kedua sudah selesai dibuat.
   */
  function withFastLeadIn(chunks, leadInChars, hardCap) {
    const limit = Number(leadInChars) > 0 ? Math.floor(Number(leadInChars)) : 0;
    if (!limit || !chunks || !chunks.length) return chunks;
    const first = String(chunks[0] || '');
    if (first.length <= limit) return chunks;
    const words = first.split(/\s+/);
    let head = '';
    let index = 0;
    while (index < words.length) {
      const candidate = head ? head + ' ' + words[index] : words[index];
      // Berhenti begitu melewati batas, tetapi jangan pernah menghasilkan pembuka kosong.
      if (head && candidate.length > limit) break;
      head = candidate;
      index += 1;
    }
    const tail = words.slice(index).join(' ').trim();
    if (!head || !tail) return chunks;
    const rest = Array.prototype.slice.call(chunks, 1);
    // Sisa potongan pembuka jangan sampai menjadi serpihan baru - itu justru cacat yang
    // dibereskan m025-73. Kalau muat, ia disatukan dengan potongan berikutnya; batas keras
    // tetap dihormati, dan kalau tidak muat ia berdiri sendiri seperti apa adanya.
    const capacity = Number(hardCap) > 0 ? Math.floor(Number(hardCap)) : 0;
    if (rest.length && capacity) {
      const merged = tail + ' ' + rest[0];
      if (merged.length <= capacity) return [head, merged].concat(rest.slice(1));
    }
    return [head, tail].concat(rest);
  }

  function splitIntoChunks(text, targetWords, hardWords, hardChars) {
    // m025-73: tanda kutip dan kurung penutup ikut bersama kalimatnya. Tanpa ini, `dunia."`
    // terbelah menjadi `dunia.` lalu `"`, dan tanda petik yatim itu diserahkan ke mesin
    // sebagai token tersendiri - persis pada teks bertanda petik yang OWNER laporkan.
    const sentences = text.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g) || [text];
    const chunks = [];
    let current = [];
    let count = 0;

    function flush() {
      if (current.length) chunks.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [];
      count = 0;
    }

    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;
      const words = sentence.split(/\s+/);
      if (words.length > hardWords) {
        flush();
        for (let i = 0; i < words.length; i += hardWords) {
          chunks.push(words.slice(i, i + hardWords).join(' '));
        }
        continue;
      }
      if (count > 0 && count + words.length > targetWords) flush();
      current.push(sentence);
      count += words.length;
      if (count >= hardWords) flush();
    }
    flush();
    return splitByHardChars(chunks, hardChars);
  }

  /**
   * m025-48 streaming plan — the reason a long line used to start late.
   *
   * splitIntoChunks above packs up to targetChunkWords (140) into ONE chunk, and a chunk
   * is generated in full before a single sample of it is played. At the measured
   * realtime factor of 0.25 a 140-word chunk is roughly fifty seconds of speech and
   * therefore twelve seconds of silence before the first word. Nothing downstream can
   * recover that: the wait is structural, not slow inference.
   *
   * The plan below emits one SENTENCE per chunk instead. Time-to-first-word becomes the
   * cost of sentence one (typically under a second), every later sentence is rendered
   * while its predecessor plays, and - because the player schedules them contiguously -
   * the learner hears one continuous line rather than a sequence of restarts.
   *
   * It is opt-in. splitIntoChunks keeps its exact behaviour, because the Apple slice
   * policy and the fixed device-probe evidence are both defined in terms of it.
   */
  function planStream(text, options) {
    const opts = options || {};
    const maxWords = Number(opts.maxWords) > 0 ? Math.floor(Number(opts.maxWords)) : 26;
    const hardChars = Number(opts.hardChars) > 0 ? Math.floor(Number(opts.hardChars)) : 0;
    const sentences = String(text || '').match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [String(text || '')];
    const planned = [];
    for (const raw of sentences) {
      const sentence = raw.trim().replace(/\s+/g, ' ');
      if (!sentence) continue;
      if (sentence.split(/\s+/).length <= maxWords) { planned.push(sentence); continue; }
      // Too long to keep as one breath. Break at clause punctuation, which is where a
      // speaker would breathe anyway, so the seam lands on a pause instead of mid-phrase.
      const parts = sentence.split(/(?<=[,;:])\s+/);
      let buffer = '';
      for (const part of parts) {
        const merged = buffer ? buffer + ' ' + part : part;
        if (buffer && merged.split(/\s+/).length > maxWords) { planned.push(buffer); buffer = part; }
        else buffer = merged;
      }
      if (buffer.trim()) planned.push(buffer.trim());
    }
    // A run-on with no clause punctuation at all has no natural seam to use. Rather than
    // pay the original latency for it, cut it on words once it is more than twice a
    // breath group long - a rare, already-unnatural input, handled rather than ignored.
    const shaped = [];
    for (const unit of planned) {
      const words = unit.split(/\s+/);
      if (words.length <= maxWords * 2) { shaped.push(unit); continue; }
      for (let i = 0; i < words.length; i += maxWords) shaped.push(words.slice(i, i + maxWords).join(' '));
    }
    const bounded = splitByHardChars(shaped, hardChars);
    return bounded.length ? bounded : [String(text || '').trim()].filter(Boolean);
  }

  function canUseSpeechSynthesis(env) {
    return Boolean(env && env.speechSynthesis && env.SpeechSynthesisUtterance);
  }

  function createBrowserFallback(env) {
    const BROWSER_FALLBACK_TIMEOUT_MS=12000;
    return {
      async speak(text, options) {
        if (!canUseSpeechSynthesis(env)) throw new Error('Browser TTS unavailable');
        return new Promise((resolve, reject) => {
          let done = false;
          let started = false;
          const settle = (fn, value) => { if (done) return; done = true; fn(value); };
          const u = new env.SpeechSynthesisUtterance(text);
          u.lang = options && options.lang ? options.lang : 'en-US';
          u.rate = options && typeof options.rate === 'number' ? options.rate : 1;
          u.onstart = () => { started = true; };
          u.onend = () => settle(resolve, { provider: 'browser-speech-synthesis', started: true });
          u.onerror = (event) => settle(reject, new Error('browser_tts_' + String(event && event.error ? event.error : 'error')));
          setTimeout(() => settle(reject, new Error(started ? 'browser_tts_timeout' : 'browser_tts_not_started')), BROWSER_FALLBACK_TIMEOUT_MS);
          setTimeout(() => { if (done) return; try { env.speechSynthesis.speak(u); } catch (error) { settle(reject, error); } }, 60);
        });
      },
      stop() {
        if (canUseSpeechSynthesis(env)) env.speechSynthesis.cancel();
      }
    };
  }

  function createVoiceService(options) {
    options = options || {};
    const config = options.config || {};
    const adapter = options.adapter || null;
    const env = options.env || (typeof globalThis !== 'undefined' ? globalThis : {});
    const playAudio = options.playAudio;
    const fallback = createBrowserFallback(env);
    const maxChars = config.limits && config.limits.maxInputChars || 3600;
    const targetWords = config.limits && config.limits.targetChunkWords || 140;
    const hardWords = config.limits && config.limits.hardChunkWords || 190;
    const appleStandalone = env && env.navigator && env.navigator.standalone === true;
    const appleHardChunkChars = appleStandalone ? Math.max(16, Math.min(128, Number(options.appleHardChunkChars) || 32)) : 0;
    const generationTimeoutMs = Number(options.generationTimeoutMs) > 0 ? Number(options.generationTimeoutMs) : 0;
    const eventLoopWatchdogMs = Number(options.eventLoopWatchdogMs) > 0 ? Number(options.eventLoopWatchdogMs) : 250;
    const proxyWorkerBudgetOnly = appleStandalone && String(env && env.__fiezelNeuralWasmPolicy || '') === 'apple-standalone-single-thread-proxy-worker';
    // m025-48. Opt-in, because splitIntoChunks is the definition of the Apple slice
    // policy and of the fixed device-probe evidence; an engine asks for streaming, it is
    // never imposed on one.
    const streamSentences = options.streamSentences === true;
    const streamMaxWords = Number(options.streamMaxWords) > 0 ? Math.floor(Number(options.streamMaxWords)) : 26;
    // How many rendered lines may sit in the schedule at once. Two is what makes the
    // seam gapless (the next line is queued while the current one plays) without letting
    // a fast engine buffer a whole chapter of PCM into memory.
    const SCHEDULE_DEPTH = 2;
    const prosody = options.prosody || (env && env.FiezelProsody) || null;
    // Panjang potongan pembuka: cukup untuk satu frasa wajar, cukup pendek supaya kata pertama
    // terdengar dalam sekitar sepertiga waktu potongan penuh.
    const leadInChars = appleHardChunkChars ? Math.max(24, Math.round(appleHardChunkChars / 3)) : 0;
    function planChunks(text) {
      const planned = streamSentences
        ? planStream(text, { maxWords: streamMaxWords, hardChars: appleHardChunkChars })
        : splitIntoChunks(text, targetWords, hardWords, appleHardChunkChars);
      // Hanya potongan pembuka yang dipendekkan; sisanya dibiarkan apa adanya.
      return withFastLeadIn(planned, leadInChars, appleHardChunkChars);
    }
    /**
     * Silence to leave before a line, decided by how the previous one ended.
     *
     * Measured on the SHAPED text, because that is what was spoken: the engine receives
     * the punctuated form, so a line the shaping pass turned into a question has to be
     * given the pause a question earns, not the one its unmarked source text would.
     */
    function gapBefore(previousChunk, lang) {
      if (!streamSentences || !previousChunk) return 0;
      if (prosody && typeof prosody.gapAfter === 'function') {
        const spoken = typeof prosody.punctuate === 'function' ? prosody.punctuate(previousChunk, lang) : previousChunk;
        return prosody.gapAfter(spoken, lang);
      }
      return /[.!?…]\s*$/.test(previousChunk) ? 300 : 170;
    }
    let generation = 0;
    let stopEpoch = 0;
    let requestSequence = 0;
    let activeStop = null;
    let activeInference = null;
    // m025-45: every adapter.generate goes through this queue. The engine is
    // single-flight, so a warm request issued while a sentence is playing must WAIT
    // for the live generation rather than race it into a busy error - and waiting is
    // free, because playback is what fills that time.
    let engineQueue = Promise.resolve();
    function runOnEngine(task) {
      const started = engineQueue.then(task, task);
      engineQueue = started.then(() => {}, () => {});
      return started;
    }
    let activeInferenceMeta = null;
    // m025-48: the sink buffers while audio is scheduled, so this trace no longer
    // stalls the main thread inside a render quantum. Absent the module (tests, older
    // shells) the original synchronous write is used unchanged.
    function diag(entry) {
      try {
        const record = { t: Date.now(), v: String(env.FIEZEL_VERSION || '5.19.0'), ...entry };
        const sink = env.FiezelVoiceDiagnostics;
        if (sink && typeof sink.record === 'function') { sink.record(record, env); return; }
        const key = 'fiezel-neural-voice-diagnostics-v1';
        const list = JSON.parse(env.localStorage && env.localStorage.getItem(key) || '[]');
        list.push(record);
        env.localStorage && env.localStorage.setItem(key, JSON.stringify(list.slice(-200)));
      } catch (_) {}
    }
    diag({ phase: 'single_flight_ready', patch: 'm026-single-flight-v1' });
    diag({ phase: 'chunk_policy_ready', policy: appleStandalone ? 'apple-standalone-inference-slice-v3' : 'default', hardChunkChars: appleHardChunkChars || null });
    diag({ phase: 'prefetch_policy_ready', policy: appleStandalone ? 'apple-standalone-macrotask-yield-v1' : 'default', reservationPolicy: 'm02547-deferred-reservation-v1' });
    diag({ phase: 'generation_timeout_policy_ready', policy: proxyWorkerBudgetOnly ? 'proxy-worker-soft-budget-v1' : 'hard-timeout-v1', timeoutMs: generationTimeoutMs || null });

    if (appleStandalone && !env.__fiezelNeuralLifecycleDiagInstalled) {
      try {
        env.__fiezelNeuralLifecycleDiagInstalled = true;
        const doc = env.document;
        if (doc && typeof doc.addEventListener === 'function') {
          doc.addEventListener('visibilitychange', () => {
            diag({ phase: 'lifecycle_visibilitychange', visibilityState: String(doc.visibilityState || 'unknown') });
          });
        }
        if (typeof env.addEventListener === 'function') {
          env.addEventListener('pagehide', event => {
            diag({ phase: 'lifecycle_pagehide', persisted: Boolean(event && event.persisted) });
          });
          env.addEventListener('pageshow', event => {
            diag({ phase: 'lifecycle_pageshow', persisted: Boolean(event && event.persisted) });
          });
          env.addEventListener('beforeunload', () => {
            diag({ phase: 'lifecycle_beforeunload' });
          });
        }
        diag({ phase: 'lifecycle_watch_ready' });
      } catch (_) {}
    }

    function stop() {
      // m025-52 investigation: a superseded request that already finished generating
      // (audio thrown away, per voice_service_error/"TTS request superseded") had no
      // trace of WHAT called stop() - generation just changed between two log lines
      // with nothing in between. This line is the only cost of closing that gap.
      const previousGeneration = generation;
      generation += 1;
      stopEpoch += 1;
      diag({ phase: 'runtime_stop', previousGeneration, generation, hadActiveStop: typeof activeStop === 'function' });
      // Anything warmed for the request being cancelled is now stale.
      dropWarm();
      if (typeof activeStop === 'function') {
        try { activeStop(); } catch (_) {}
      }
      activeStop = null;
      fallback.stop();
    }

    // m025-45 cross-call warm cache. One entry is enough: the Library warms exactly the
    // next sentence, and holding more would pin megabytes of PCM for no benefit.
    let warmed = null;

    function warmKey(text, options) {
      const o = options || {};
      return [text, o.voice || '', o.speed || 1, o.lang || '', o.intent || ''].join('\u0000');
    }

    function dropWarm() { warmed = null; }

    /**
     * Generates one utterance ahead of time. m025-47 deliberately yields one macrotask
     * before reserving the engine. The product wraps speak() in two async readiness
     * layers; without this yield Library prefetch(N+1) could enter the engine queue before
     * speak(N) had reached the already-ready service. That inverted the queue, destroyed
     * the N+1 warm entry on the next loop, and made a sentence transition pay for two
     * generations (the observed 10-15 second gap).
     */
    async function prefetch(input, speakOptions) {
      const options = speakOptions || {};
      if (!adapter) return false;
      const text = normalizeText(input, maxChars);
      if (!text) return false;
      const chunks = planChunks(text);
      // Multi-chunk text already prefetches internally once it starts playing.
      if (chunks.length !== 1) return false;
      const voice = options.voice || (config.voices && config.voices.fiezelPrimary) || 'af_heart';
      const resolvedOptions = { ...options, voice };
      const key = warmKey(text, resolvedOptions);
      if (warmed && warmed.key === key) return true;
      const epoch = stopEpoch;
      await new Promise(resolve => setTimeout(resolve, 0));
      if (epoch !== stopEpoch) {
        diag({ phase: 'prefetch_cancelled_before_reserve', voice, chars: text.length });
        return false;
      }
      if (warmed) {
        if (warmed.key === key) return true;
        // Never evict an unconsumed next-line warm entry. A caller asking for another
        // line can retry after the current speak() consumes or drops this reservation.
        diag({ phase: 'prefetch_skip_occupied', voice, chars: text.length });
        return false;
      }
      const startedAt = Date.now();
      diag({ phase: 'prefetch_start', chars: text.length, voice });
      const pending = runOnEngine(() => adapter.generate(text, {
        voice,
        speed: options.speed || 1,
        lang: options.lang || '',
        intent: options.intent || '',
        position: { index: 0, total: chunks.length }
      })).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
      warmed = { key, pending };
      const outcome = await pending;
      if (!outcome.ok) {
        // A failed warm must leave no trace: the next speak() regenerates normally.
        if (warmed && warmed.key === key) warmed = null;
        diag({ phase: 'prefetch_failed', elapsedMs: Date.now() - startedAt, error: String(outcome.error && outcome.error.message || outcome.error) });
        return false;
      }
      diag({ phase: 'prefetch_ready', elapsedMs: Date.now() - startedAt });
      return true;
    }

    /** Consumes a warm entry if it matches; a mismatch is stale and is discarded. */
    async function takeWarm(text, options) {
      if (!warmed) return null;
      const key = warmKey(text, options);
      if (warmed.key !== key) {
        diag({ phase: 'prefetch_miss_drop_stale' });
        warmed = null;
        return null;
      }
      const entry = warmed;
      warmed = null;
      const outcome = await entry.pending;
      return outcome.ok ? outcome.value : null;
    }

    async function speak(input, speakOptions) {
      // speak('halo') with no options is a supported call - the fallback path and several
      // callers rely on it, so the default must be restored before anything reads it.
      speakOptions = speakOptions || {};
      const text = normalizeText(input, maxChars);
      const callGeneration = ++generation;
      const requestId = 'nv-' + Date.now().toString(36) + '-' + (++requestSequence).toString(36);
      const voice = speakOptions.voice || (config.voices && config.voices.fiezelPrimary) || 'af_heart';
      const chunks = planChunks(text);
      diag({ phase: 'chunk_plan', requestId, chunkCount: chunks.length, hardChunkChars: appleHardChunkChars || null, maxChunkChars: chunks.reduce((max, chunk) => Math.max(max, chunk.length), 0) });

      if (!adapter) {
        if (config.fallback && config.fallback.browserSpeechSynthesis) {
          const fallbackResult = await fallback.speak(text, { lang: speakOptions.lang || 'en-US', rate: speakOptions.speed || 1 });
          return { ...fallbackResult, provider: 'browser-speech-synthesis', voice, chunks: 1, outputs: [] };
        }
        throw new Error('Neural voice adapter unavailable');
      }

      async function generateChunk(chunkIndex) {
        const chunk = chunks[chunkIndex];
        if (callGeneration !== generation) throw new Error('TTS request superseded');
        const generateStartedAt = Date.now();
        if (activeInference) {
          diag({
            phase: 'generate_busy', requestId, chunkIndex, voice,
            activeRequestId: activeInferenceMeta && activeInferenceMeta.requestId || '',
            activeChunkIndex: activeInferenceMeta && activeInferenceMeta.chunkIndex,
            activeElapsedMs: activeInferenceMeta && activeInferenceMeta.startedAt ? Date.now() - activeInferenceMeta.startedAt : null
          });
          const error = new Error('neural_generation_busy');
          error.code = 'neural_generation_busy';
          throw error;
        }
        diag({ phase: 'generate_start', requestId, chunkIndex, voice, chars: chunk.length, timeoutMs: generationTimeoutMs || null, timeoutPolicy: proxyWorkerBudgetOnly ? 'soft-budget' : 'hard' });
        const watchdogScheduledAt = Date.now();
        setTimeout(() => {
          const callbackAt = Date.now();
          diag({
            phase: 'generate_event_loop_watchdog', requestId, chunkIndex,
            scheduledAt: watchdogScheduledAt,
            expectedDelayMs: eventLoopWatchdogMs,
            observedDelayMs: callbackAt - watchdogScheduledAt
          });
        }, eventLoopWatchdogMs);
        let timer = null;
        let didTimeOut = false;
        let audio;
        const generated = runOnEngine(() => adapter.generate(chunk, {
          voice,
          speed: speakOptions.speed || 1,
          lang: speakOptions.lang || '',
          intent: speakOptions.intent || '',
          // Where this sentence sits in the utterance. Delivery is not a property of a
          // sentence alone: the same words open a thought differently than they close one.
          position: { index: chunkIndex, total: chunks.length }
        }));
        activeInference = generated;
        activeInferenceMeta = { requestId, chunkIndex, voice, startedAt: generateStartedAt };
        generated.then(
          value => {
            const samples = value && (value.audio || value.data);
            if (didTimeOut) {
              diag({ phase: 'generate_late_ready', requestId, chunkIndex, voice, elapsedMs: Date.now() - generateStartedAt, samples: samples && typeof samples.length === 'number' ? samples.length : null });
            }
            if (activeInference === generated) {
              activeInference = null;
              activeInferenceMeta = null;
            }
          },
          error => {
            if (didTimeOut) {
              diag({ phase: 'generate_late_error', requestId, chunkIndex, voice, elapsedMs: Date.now() - generateStartedAt, error: String(error && (error.message || error.name) || error) });
            }
            if (activeInference === generated) {
              activeInference = null;
              activeInferenceMeta = null;
            }
          }
        );
        if (generationTimeoutMs > 0 && proxyWorkerBudgetOnly) {
          let budgetExceeded = false;
          timer = setTimeout(() => {
            budgetExceeded = true;
            diag({ phase: 'generate_budget_exceeded', requestId, chunkIndex, voice, elapsedMs: Date.now() - generateStartedAt, budgetMs: generationTimeoutMs, action: 'await_worker_result' });
          }, generationTimeoutMs);
          try {
            audio = await generated;
          } finally {
            if (timer) clearTimeout(timer);
          }
          if (budgetExceeded) {
            diag({ phase: 'generate_budget_recovered', requestId, chunkIndex, voice, elapsedMs: Date.now() - generateStartedAt, budgetMs: generationTimeoutMs });
          }
        } else if (generationTimeoutMs > 0) {
          const timedOut = Symbol('neural-generation-timeout');
          const result = await Promise.race([
            generated,
            new Promise(resolve => { timer = setTimeout(() => resolve(timedOut), generationTimeoutMs); })
          ]).finally(() => { if (timer) clearTimeout(timer); });
          if (result === timedOut) {
            didTimeOut = true;
            diag({ phase: 'generate_timeout', requestId, chunkIndex, voice, elapsedMs: Date.now() - generateStartedAt, timeoutMs: generationTimeoutMs });
            const error = new Error('neural_generation_timeout');
            error.code = 'neural_generation_timeout';
            throw error;
          }
          audio = result;
        } else {
          audio = await generated;
        }
        const samples = audio && (audio.audio || audio.data);
        const generateElapsedMs = Date.now() - generateStartedAt;
        if (generationTimeoutMs > 0 && generateElapsedMs > generationTimeoutMs) {
          diag({ phase: 'generate_completed_over_budget', requestId, chunkIndex, elapsedMs: generateElapsedMs, timeoutMs: generationTimeoutMs });
        }
        diag({ phase: 'generate_ready', requestId, chunkIndex, voice, elapsedMs: generateElapsedMs, samples: samples && typeof samples.length === 'number' ? samples.length : null });
        if (callGeneration !== generation) throw new Error('TTS request superseded');
        return audio;
      }

      const outputs = [];
      let prefetched = null;
      // Lines handed to the player and not yet finished. Streaming keeps up to
      // SCHEDULE_DEPTH of them, so stopping has to reach the queued ones too - they are
      // audio the learner has not heard yet.
      const scheduled = [];
      function stopScheduled() {
        const pending = scheduled.splice(0, scheduled.length);
        pending.forEach(entry => {
          try { if (entry.playback && typeof entry.playback.stop === 'function') entry.playback.stop(); } catch (_) {}
        });
      }
      async function drainScheduled(keep, id, activeVoice) {
        while (scheduled.length > keep) {
          const entry = scheduled.shift();
          const playback = entry.playback;
          if (playback && playback.done && typeof playback.done.then === 'function') await playback.done;
          diag({ phase: 'playback_done', requestId: id, chunkIndex: entry.chunkIndex, voice: activeVoice, elapsedMs: Date.now() - entry.startedAt });
        }
      }
      try {
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          let audio;
          if (prefetched) {
            const outcome = await prefetched;
            prefetched = null;
            if (!outcome.ok) throw outcome.error;
            audio = outcome.value;
          } else {
            const warmAudio = chunkIndex === 0 ? await takeWarm(chunks[0], {
              voice,
              speed: speakOptions.speed || 1,
              lang: speakOptions.lang || '',
              intent: speakOptions.intent || ''
            }) : null;
            if (warmAudio) {
              diag({ phase: 'prefetch_hit', requestId, chunkIndex, voice });
              audio = warmAudio;
            } else {
              audio = await generateChunk(chunkIndex);
            }
          }
          if (callGeneration !== generation) throw new Error('TTS request superseded');
          outputs.push(audio);
          if (typeof playAudio === 'function') {
            const playbackStartedAt = Date.now();
            diag({ phase: 'playback_start', requestId, chunkIndex, voice });
            // Streaming hands the player the seam it needs: join this line onto the one
            // already scheduled, after exactly the pause the previous sentence earned,
            // with the engine's own lead-in and tail-out trimmed so that pause is the
            // only silence between them.
            const gapMs = gapBefore(chunks[chunkIndex - 1], speakOptions.lang || '');
            // Trimming exists to control a SEAM. A line rendered on its own has none, so
            // it is played exactly as the model delivered it - the Library reads one
            // sentence per call, and cutting its tail there would take away the pause
            // between two sentences instead of governing it.
            const joined = chunks.length > 1;
            const playback = await playAudio(audio, streamSentences
              // m028-4: both edges, always.
              //
              // m025-47 tied trimming to `joined` and kept a standalone line's tail on the
              // reasoning that it spaces one Library sentence from the next. Measured on
              // the shipped engine that "spacing" is 636ms of model-decided silence, on
              // top of a lead-in of 401ms and the main-thread round trip the Library pays
              // between sentences - which is what OWNER reports as a book that never joins
              // up. The tail is not a governed pause; it is dead air that happens to sit
              // where a pause belongs. Removing it makes the gap the round trip alone, and
              // leaves the pause something we can set deliberately rather than inherit.
              ? { signalGeneration: callGeneration, continuous: joined && chunkIndex > 0, gapMs, trim: true }
              : { signalGeneration: callGeneration });
            scheduled.push({ playback, chunkIndex, startedAt: playbackStartedAt });
            activeStop = stopScheduled;
            if (chunkIndex + 1 < chunks.length) {
              if (appleStandalone) {
                const yieldStartedAt = Date.now();
                await new Promise(resolve => setTimeout(resolve, 0));
                diag({ phase: 'prefetch_event_loop_yield', requestId, fromChunkIndex: chunkIndex, nextChunkIndex: chunkIndex + 1, elapsedMs: Date.now() - yieldStartedAt });
                if (callGeneration !== generation) throw new Error('TTS request superseded');
              }
              prefetched = generateChunk(chunkIndex + 1).then(
                value => ({ ok: true, value }),
                error => ({ ok: false, error })
              );
            }
            // Non-streaming keeps its original shape: one line at a time, the next one
            // generated during it. Streaming instead lets the NEXT line be scheduled
            // while this one is still audible - waiting for it to finish first is the
            // round trip that puts a hole between two sentences - and only blocks once
            // the schedule is SCHEDULE_DEPTH lines deep.
            if (!streamSentences) await drainScheduled(0, requestId, voice);
            else if (scheduled.length >= SCHEDULE_DEPTH) await drainScheduled(SCHEDULE_DEPTH - 1, requestId, voice);
            if (callGeneration !== generation) throw new Error('TTS request superseded');
          }
        }
        if (typeof playAudio === 'function') await drainScheduled(0, requestId, voice);
        activeStop = null;
        return { provider: adapter.kind || 'neural-local', voice, chunks: chunks.length, outputs, requestId };
      } catch (error) {
        diag({ phase: 'voice_service_error', requestId, voice, error: String(error && (error.message || error.name) || error) });
        if (callGeneration !== generation) throw error;
        if (speakOptions.allowFallback !== false && config.fallback && config.fallback.browserSpeechSynthesis) {
          const fallbackResult = await fallback.speak(text, { lang: speakOptions.lang || 'en-US', rate: speakOptions.speed || 1 });
          return { ...fallbackResult, provider: 'browser-speech-synthesis', voice, chunks: chunks.length, outputs, requestId };
        }
        throw error;
      }
    }

    return Object.freeze({ speak, stop, prefetch, splitIntoChunks: (text) => planChunks(text) });
  }

  return Object.freeze({ normalizeText, splitIntoChunks, withFastLeadIn, createVoiceService });
});