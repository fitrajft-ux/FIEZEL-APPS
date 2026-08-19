(function(root){
  'use strict';

  if (!root || !root.document || root.__fiezelTutorCoreAiInstalled) return;
  var baseRuntime = root.FiezelVoiceRuntime;
  if (!baseRuntime || typeof baseRuntime.speak !== 'function') return;
  root.__fiezelTutorCoreAiInstalled = true;

  var CACHE_KEY = 'fiezel-tutor-core-ai-cache-v1';
  var CACHE_LIMIT = 40;
  var MAX_TEXT = 900;
  var MAX_AI_TEXT = 2400;
  var recent = [];

  function classroomActive() {
    try {
      var app = root.document.getElementById('app');
      return !!(app && app.querySelector('.classroom-v3'));
    } catch (_) { return false; }
  }

  function readCache() {
    try {
      var value = JSON.parse(root.localStorage.getItem(CACHE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) { return {}; }
  }

  function writeCache(cache) {
    try {
      var rows = Object.entries(cache).sort(function(a,b){ return Number(b[1] && b[1].t || 0) - Number(a[1] && a[1].t || 0); }).slice(0, CACHE_LIMIT);
      root.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(rows)));
    } catch (_) {}
  }

  function allowed() {
    var now = Date.now();
    recent = recent.filter(function(t){ return now - t < 60000; });
    if (recent.length >= 6) return false;
    try {
      if (typeof root.allowAiRequest === 'function' && root.allowAiRequest() === false) return false;
    } catch (_) { return false; }
    recent.push(now);
    return true;
  }

  function clean(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  }

  function cleanAi(text) {
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    if (value.length <= MAX_AI_TEXT) return value;
    var head = value.slice(0, MAX_AI_TEXT);
    var boundary = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    // Never re-introduce the OWNER-reported "tanggung menggantung" by cutting an
    // explanation mid-sentence. If no safe sentence boundary exists, use authored fallback.
    return boundary >= 600 ? head.slice(0, boundary + 1).trim() : '';
  }

  function context() {
    try { return typeof root.__fiezelTutorContext === 'function' ? root.__fiezelTutorContext() || {} : {}; }
    catch (_) { return {}; }
  }

  function beatKey(ctx) {
    var snap = ctx && ctx.snapshot || {};
    var beat = ctx && ctx.beat || {};
    return [String(snap.lessonId || ''), String(beat.id || snap.beatIndex || '')].join(':');
  }

  async function ask(prompt) {
    if (typeof root.askFiezelAI !== 'function' || !allowed()) return '';
    try { return cleanAi(await root.askFiezelAI(prompt)); }
    catch (_) { return ''; }
  }

  async function explainBeat(ctx) {
    var beat = ctx && ctx.beat;
    var lesson = ctx && ctx.lesson;
    if (!beat || !lesson) return '';
    var key = beatKey(ctx);
    var cache = readCache();
    if (cache[key] && cache[key].text) return cleanAi(cache[key].text);
    var board = beat.board || {};
    var prompt =
      'Kamu adalah Core FIEZEL yang menjelaskan langsung kepada Jahran, siswa kelas 1 SMA. ' +
      'Berikan kelanjutan penjelasan untuk beat Classroom berikut dalam Bahasa Indonesia yang natural. Jangan mengganti tujuan materi dan jangan mengulang teks authored fallback. ' +
      'Buat 3 sampai 5 kalimat pendek tambahan, jelaskan alasan atau intuisi yang belum tertulis, lalu beri satu contoh dekat kehidupan sehari-hari. ' +
      'Istilah atau contoh English boleh dipertahankan. Jangan pakai markdown atau daftar. Akhiri dengan satu kalimat yang membuat transisi ke langkah berikutnya terasa tuntas. ' +
      'Topik: ' + clean(lesson.topic) + '. ' +
      'Teks authored fallback: ' + clean(beat.idText || beat.id || '') + '. ' +
      'Papan: ' + clean([board.title, board.formula].filter(Boolean).join(' — ')) + '.';
    var text = await ask(prompt);
    if (text) {
      cache[key] = { text: text, t: Date.now() };
      writeCache(cache);
    }
    return text;
  }

  async function answerSideQuestion(ctx) {
    var snap = ctx && ctx.snapshot || {};
    var question = clean(snap.sideQuestion || '');
    if (!question) return '';
    var lesson = ctx && ctx.lesson || {};
    return ask(
      'Jawab pertanyaan Jahran tentang lesson Classroom secara langsung dalam Bahasa Indonesia. ' +
      'Gunakan 3 sampai 6 kalimat pendek, jelaskan sebabnya, beri satu contoh English jika relevan, dan jangan gunakan markdown. ' +
      'Kalau pertanyaannya di luar konteks lesson, hubungkan kembali dengan sopan. ' +
      'Topik lesson: ' + clean(lesson.topic || '') + '. Pertanyaan: ' + question
    );
  }

  function setSubtitle(text) {
    if (!text) return;
    try {
      var node = root.document.getElementById('tutorSubtitle');
      if (node) node.textContent = text;
    } catch (_) {}
  }

  function sameTutorMoment(original) {
    if (!classroomActive()) return false;
    var now = context();
    var before = original && original.snapshot || {};
    var after = now && now.snapshot || {};
    if (String(after.phase || '') !== String(before.phase || '')) return false;
    if (beatKey(now) !== beatKey(original)) return false;
    if (before.phase === 'sideq' && clean(after.sideQuestion || '') !== clean(before.sideQuestion || '')) return false;
    return true;
  }

  async function enrichedSpeak(text, options) {
    if (!classroomActive()) return baseRuntime.speak(text, options || {});
    var opts = options || {};
    var ctx = context();
    var snap = ctx.snapshot || {};
    var enrichment = Promise.resolve('');
    if (snap.phase === 'teach' && ctx.beat) enrichment = explainBeat(ctx);
    else if (snap.phase === 'sideq' && snap.sideQuestion) enrichment = answerSideQuestion(ctx);

    // Never put Core network latency in front of the first spoken word. The authored
    // line is the deterministic offline fallback and starts immediately, while Core AI
    // works in parallel. If Core succeeds, its non-redundant explanation follows only
    // if the learner is still on the same beat/question.
    var first = await baseRuntime.speak(text, opts);
    var enriched = await enrichment;
    if (enriched && sameTutorMoment(ctx)) {
      setSubtitle(enriched);
      await baseRuntime.speak(enriched, opts);
    }
    return first;
  }

  root.FiezelVoiceRuntime = Object.freeze(Object.assign({}, baseRuntime, {
    speak: enrichedSpeak,
    __tutorCoreAiPatched: true
  }));

  root.FiezelTutorCoreAI = Object.freeze({
    schema: 'fiezel-tutor-core-ai-v1',
    explainBeat: explainBeat,
    answerSideQuestion: answerSideQuestion,
    cacheKey: CACHE_KEY
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
