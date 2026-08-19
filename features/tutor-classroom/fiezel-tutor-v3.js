/**
 * FIEZEL Tutor v3 — Adaptive Human Tutor vertical slice.
 * Source contract: English neural teaching voice + Indonesian semantic subtitle,
 * deterministic core, interruptible Ask Fiezel, alternate remediation strategies,
 * bounded learner evidence, category/topic routing, smart board and resume.
 *
 * This sidecar deliberately does not rewrite app.js learning state. It replaces the
 * Classroom renderer at runtime and exposes one shared Learning Bundle contract that
 * includes the existing Indonesian neural bundle used by the wider language stack.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.FiezelTutorV3 = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SCHEMA = 'fiezel-tutor-v3';
  var SESSION_KEY = 'fiezel-tutor-v3-session';
  var EVIDENCE_KEY = 'fiezel-tutor-v3-evidence';
  var STRATEGIES = ['intuition', 'timeline', 'form-map'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function safeParse(raw, fallback) {
    try { var out = JSON.parse(raw); return out && typeof out === 'object' ? out : fallback; }
    catch (_) { return fallback; }
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function evidenceDefault() {
    return {
      schema: 'fiezel-tutor-evidence-v1',
      completed: {},
      misconceptions: {},
      strategyWins: { intuition: 0, timeline: 0, 'form-map': 0 },
      askCount: 0,
      updatedAt: 0
    };
  }

  function normalizeEvidence(input) {
    var base = evidenceDefault();
    var e = input && input.schema === base.schema ? input : {};
    base.completed = e.completed && typeof e.completed === 'object' ? e.completed : {};
    base.misconceptions = e.misconceptions && typeof e.misconceptions === 'object' ? e.misconceptions : {};
    base.strategyWins = Object.assign(base.strategyWins, e.strategyWins || {});
    base.askCount = Number(e.askCount || 0);
    base.updatedAt = Number(e.updatedAt || 0);
    return base;
  }

  function richerBeats(lesson) {
    if (!lesson) return [];
    if (lesson.id !== 'grammar_present_perfect') {
      return (lesson.segments || []).map(function (seg, i) {
        return {
          id: 'beat-' + (i + 1),
          en: seg.en,
          idText: seg.id,
          board: {
            kicker: lesson.topic,
            title: lesson.board && lesson.board.title || lesson.topic,
            formula: lesson.board && lesson.board.formula || '',
            examples: lesson.board && lesson.board.examples || []
          }
        };
      });
    }
    return [
      {
        id: 'intuition',
        en: "Okay, Jahran. Forget the grammar name for a second. Compare these: I lost my key yesterday, and I've lost my key.",
        idText: "Oke, Jahran. Lupakan dulu nama grammarnya. Bandingkan: I lost my key yesterday, dan I've lost my key.",
        board: {
          kicker: 'LOOK FIRST',
          title: 'Past event vs result now',
          formula: "I lost my key yesterday.  ↔  I've lost my key.",
          examples: ['finished past story', 'past action with a result connected to now']
        }
      },
      {
        id: 'micro-check',
        en: "If I say I've lost my key, what problem probably matters right now?",
        idText: "Kalau aku bilang I've lost my key, masalah apa yang kemungkinan penting sekarang?",
        board: {
          kicker: 'MICRO CHECK',
          title: 'What is connected to now?',
          formula: "I've lost my key → result matters now",
          examples: ['The key was lost before.', 'The consequence still matters now.']
        },
        check: {
          prompt: 'What is the likely problem now?',
          options: ['He cannot open the door.', 'He bought a new key yesterday.', 'The story is only about yesterday.'],
          answerIndex: 0,
          correct: {
            en: "Exactly. The loss happened before, but the result is still connected to now.",
            id: 'Tepat. Kehilangannya terjadi sebelumnya, tetapi akibatnya masih terhubung dengan sekarang.'
          },
          wrong: {
            en: "Look at the result, not just the past time. The missing key creates a problem now.",
            id: 'Lihat akibatnya, bukan hanya waktu lampau. Kunci yang hilang membuat masalah sekarang.'
          }
        }
      },
      {
        id: 'rule',
        en: "Now the form makes more sense: subject, have or has, then the third form of the verb.",
        idText: 'Sekarang polanya lebih masuk akal: subjek, have atau has, lalu bentuk ketiga kata kerja.',
        board: {
          kicker: 'FORM',
          title: 'Present Perfect',
          formula: 'Subject + have / has + V3',
          examples: ['I have finished my homework.', 'She has visited Singapore.']
        }
      },
      {
        id: 'contrast',
        en: "One trap is went versus gone. Went is the simple past form. After have, English needs the third form: gone.",
        idText: 'Satu jebakannya adalah went dan gone. Went adalah simple past. Setelah have, bahasa Inggris membutuhkan bentuk ketiga: gone.',
        board: {
          kicker: 'V1 · V2 · V3',
          title: 'Same verb, different job',
          formula: 'go → went → gone',
          examples: ['I went to school.', 'I have gone to school.']
        }
      }
    ];
  }

  function strategyAnswer(kind, lesson, reason) {
    var topic = lesson ? lesson.topic : 'this idea';
    if (kind === 'timeline') {
      return {
        strategy: kind,
        en: "Let's put it on a timeline. The action starts before now, but the result reaches the present. That connection is the point.",
        id: 'Kita taruh di garis waktu. Tindakannya dimulai sebelum sekarang, tetapi hasilnya sampai ke masa kini. Hubungan itulah poinnya.',
        board: { title: 'Timeline', formula: 'PAST ─────●────→ NOW', examples: ['action before now', 'result relevant now'] }
      };
    }
    if (kind === 'form-map') {
      return {
        strategy: kind,
        en: "Let's shrink it into a form map. Have or has opens the pattern, and the verb must take its third form. Go, went, gone: after have, choose gone.",
        id: 'Kita sederhanakan jadi peta bentuk. Have atau has membuka pola, lalu kata kerja harus bentuk ketiga. Go, went, gone: setelah have, pilih gone.',
        board: { title: 'Form map', formula: 'have / has + V3', examples: ['go → went → gone', 'have + gone ✓', 'have + went ✕'] }
      };
    }
    return {
      strategy: 'intuition',
      en: "Let's make it concrete. Imagine the key is still missing in your hand right now. Present perfect helps connect an earlier action to the situation you have now.",
      id: 'Kita buat konkret. Bayangkan kuncinya masih hilang sampai sekarang. Present perfect membantu menghubungkan kejadian sebelumnya dengan situasi yang masih berlaku sekarang.',
      board: { title: topic, formula: 'earlier action → result now', examples: [reason || 'connect the result to now'] }
    };
  }

  function answerSideQuestion(text, lesson) {
    var q = String(text || '').trim();
    var low = q.toLowerCase();
    if (/went|gone|v2|v3|verb 3|verb three/.test(low)) {
      return {
        en: "You are separating two jobs of the same verb. Went is the normal past form. After have or has, English needs the third form, so we say I have gone, not I have went.",
        id: 'Kamu sedang memisahkan dua fungsi dari kata kerja yang sama. Went adalah bentuk lampau biasa. Setelah have atau has, bahasa Inggris membutuhkan bentuk ketiga, jadi kita mengatakan I have gone, bukan I have went.',
        board: { title: 'go · went · gone', formula: 'I went.  |  I have gone.', examples: ['V2 after a past-time statement', 'V3 after have / has'] }
      };
    }
    if (/have|has/.test(low)) {
      return {
        en: "Use has with he, she and it. Use have with I, you, we and they. The meaning stays the same; only the subject controls that helper word.",
        id: 'Gunakan has untuk he, she, dan it. Gunakan have untuk I, you, we, dan they. Maknanya tetap sama; subjek yang menentukan kata bantu itu.',
        board: { title: 'Have or has?', formula: 'he/she/it → has', examples: ['I/you/we/they → have'] }
      };
    }
    if (/why|kenapa|mengapa|beda|difference/.test(low)) {
      return {
        en: "The useful question is not only when the action happened. Ask whether the result is still connected to now. If yes, present perfect often becomes the better choice.",
        id: 'Pertanyaan yang berguna bukan hanya kapan kejadiannya. Tanyakan apakah hasilnya masih terhubung dengan sekarang. Jika iya, present perfect sering menjadi pilihan yang lebih tepat.',
        board: { title: 'Meaning first', formula: 'past action + present relevance', examples: ['result still matters now'] }
      };
    }
    return {
      en: "Let's connect your question to the lesson checkpoint. The core idea here is the link between an earlier action and the situation now. We can use that idea to test your example.",
      id: 'Kita hubungkan pertanyaanmu dengan checkpoint pelajaran. Intinya adalah hubungan antara tindakan sebelumnya dan situasi sekarang. Kita bisa memakai ide itu untuk menguji contohmu.',
      board: { title: lesson ? lesson.topic : 'Lesson checkpoint', formula: 'earlier action → present meaning', examples: [q.slice(0, 80)] }
    };
  }

  function createSession(pack, saved, evidenceInput) {
    if (!pack || pack.schema !== 'fiezel-classroom-lessons-v1') throw new Error('tutor_pack_invalid');
    var evidence = normalizeEvidence(evidenceInput);
    var state = {
      schema: SCHEMA,
      phase: 'category',
      categoryId: null,
      lessonId: null,
      beatIndex: 0,
      questionIndex: 0,
      correct: 0,
      attempts: 0,
      remediating: false,
      finished: false,
      strategyIndex: 0,
      microAnswers: {},
      feedback: null,
      sideQuestion: '',
      sideAnswer: null,
      returnPhase: null,
      returnBeatIndex: null,
      returnQuestionIndex: null
    };

    function lesson() {
      return pack.lessons.filter(function (l) { return l.id === state.lessonId; })[0] || null;
    }
    function categories() { return clone(pack.categories || []); }
    function lessonsIn(id) { return clone((pack.lessons || []).filter(function (l) { return l.category === id; })); }

    function restore(raw) {
      if (!raw || raw.schema !== SCHEMA) return snapshot();
      var validLesson = raw.lessonId && (pack.lessons || []).some(function (l) { return l.id === raw.lessonId; });
      state.phase = validLesson ? String(raw.phase || 'teach') : 'category';
      state.categoryId = validLesson ? raw.categoryId : null;
      state.lessonId = validLesson ? raw.lessonId : null;
      state.beatIndex = Math.max(0, Number(raw.beatIndex || 0));
      state.questionIndex = Math.max(0, Number(raw.questionIndex || 0));
      state.correct = Math.max(0, Number(raw.correct || 0));
      state.attempts = Math.max(0, Number(raw.attempts || 0));
      state.remediating = !!raw.remediating;
      state.finished = !!raw.finished;
      state.strategyIndex = Math.max(0, Number(raw.strategyIndex || 0)) % STRATEGIES.length;
      state.microAnswers = raw.microAnswers && typeof raw.microAnswers === 'object' ? raw.microAnswers : {};
      return snapshot();
    }

    function chooseCategory(id) {
      if (!(pack.categories || []).some(function (c) { return c.id === id; })) throw new Error('unknown_category');
      state.categoryId = id;
      state.phase = lessonsIn(id).length ? 'topic' : 'route';
      return snapshot();
    }

    function chooseLesson(id) {
      var found = (pack.lessons || []).filter(function (l) { return l.id === id; })[0];
      if (!found) throw new Error('unknown_lesson');
      state.lessonId = id;
      state.categoryId = found.category;
      state.phase = 'teach';
      state.beatIndex = 0;
      state.questionIndex = 0;
      state.correct = 0;
      state.attempts = 0;
      state.remediating = false;
      state.finished = false;
      state.feedback = null;
      state.microAnswers = {};
      return snapshot();
    }

    function beats() { return richerBeats(lesson()); }
    function currentBeat() { return state.phase === 'teach' ? beats()[state.beatIndex] || null : null; }

    function answerMicro(index) {
      var beat = currentBeat();
      if (!beat || !beat.check) throw new Error('no_micro_check');
      var ok = Number(index) === Number(beat.check.answerIndex);
      state.microAnswers[beat.id] = ok;
      state.feedback = ok ? beat.check.correct : beat.check.wrong;
      if (ok) evidence.strategyWins[STRATEGIES[state.strategyIndex]] = Number(evidence.strategyWins[STRATEGIES[state.strategyIndex]] || 0) + 1;
      evidence.updatedAt = Date.now();
      return { correct: ok, feedback: clone(state.feedback), snapshot: snapshot() };
    }

    function nextBeat() {
      var beat = currentBeat();
      if (!beat) return snapshot();
      if (beat.check && !(beat.id in state.microAnswers)) throw new Error('micro_check_required');
      if (state.beatIndex < beats().length - 1) state.beatIndex++;
      else state.phase = 'quiz';
      state.feedback = null;
      return snapshot();
    }

    function currentQuestion() {
      var l = lesson();
      return state.phase === 'quiz' && l ? l.questions[state.questionIndex] || null : null;
    }

    function tagMisconception(question) {
      var key = (state.lessonId || 'lesson') + ':' + state.questionIndex;
      evidence.misconceptions[key] = Number(evidence.misconceptions[key] || 0) + 1;
      evidence.updatedAt = Date.now();
    }

    function advanceQuestion() {
      var l = lesson();
      if (state.questionIndex < l.questions.length - 1) state.questionIndex++;
      else {
        state.phase = 'summary';
        state.finished = true;
        evidence.completed[state.lessonId] = {
          scorePercent: Math.round((state.correct / Math.max(1, l.questions.length)) * 100),
          completedAt: Date.now()
        };
        evidence.updatedAt = Date.now();
      }
    }

    function answerQuiz(index) {
      var q = currentQuestion();
      if (!q) throw new Error('no_active_question');
      state.attempts++;
      var right = Number(index) === Number(q.answerIndex);
      var retrying = state.remediating;
      var result = { correct: right, retry: false, advanced: false, scored: !retrying, feedback: null };
      if (right) {
        if (!retrying) state.correct++;
        result.feedback = clone(q.explain);
        state.remediating = false;
        advanceQuestion();
        result.advanced = true;
        evidence.strategyWins[STRATEGIES[state.strategyIndex]] = Number(evidence.strategyWins[STRATEGIES[state.strategyIndex]] || 0) + 1;
      } else if (!retrying) {
        tagMisconception(q);
        state.remediating = true;
        result.retry = true;
        var alt = strategyAnswer(STRATEGIES[state.strategyIndex], lesson(), q.remediate && q.remediate.en);
        result.feedback = { en: alt.en, id: alt.id, board: alt.board, strategy: alt.strategy };
      } else {
        tagMisconception(q);
        state.remediating = false;
        result.feedback = clone(q.explain);
        advanceQuestion();
        result.advanced = true;
      }
      state.feedback = clone(result.feedback);
      evidence.updatedAt = Date.now();
      return { result: result, snapshot: snapshot(), evidence: clone(evidence) };
    }

    function confused() {
      state.strategyIndex = (state.strategyIndex + 1) % STRATEGIES.length;
      var alt = strategyAnswer(STRATEGIES[state.strategyIndex], lesson(), 'make the same idea easier to see');
      state.feedback = { en: alt.en, id: alt.id, board: alt.board, strategy: alt.strategy };
      return clone(state.feedback);
    }

    function ask(text) {
      var q = String(text || '').trim();
      if (!q) throw new Error('question_required');
      if (state.phase === 'sideq') throw new Error('side_question_already_open');
      state.returnPhase = state.phase;
      state.returnBeatIndex = state.beatIndex;
      state.returnQuestionIndex = state.questionIndex;
      state.sideQuestion = q.slice(0, 240);
      state.sideAnswer = answerSideQuestion(q, lesson());
      state.phase = 'sideq';
      evidence.askCount++;
      evidence.updatedAt = Date.now();
      return { answer: clone(state.sideAnswer), snapshot: snapshot() };
    }

    function resume() {
      if (state.phase !== 'sideq') return snapshot();
      state.phase = state.returnPhase || 'teach';
      state.beatIndex = Number(state.returnBeatIndex || state.beatIndex || 0);
      state.questionIndex = Number(state.returnQuestionIndex || state.questionIndex || 0);
      state.returnPhase = null;
      state.sideQuestion = '';
      state.sideAnswer = null;
      return snapshot();
    }

    function reset() {
      state.phase = 'category'; state.categoryId = null; state.lessonId = null;
      state.beatIndex = 0; state.questionIndex = 0; state.correct = 0; state.attempts = 0;
      state.remediating = false; state.finished = false; state.feedback = null; state.microAnswers = {};
      state.sideQuestion = ''; state.sideAnswer = null; state.returnPhase = null;
      return snapshot();
    }

    function snapshot() {
      var l = lesson();
      return {
        schema: SCHEMA,
        phase: state.phase,
        categoryId: state.categoryId,
        lessonId: state.lessonId,
        topic: l ? l.topic : null,
        level: l ? l.level : null,
        beatIndex: state.beatIndex,
        beatCount: beats().length,
        questionIndex: state.questionIndex,
        questionCount: l ? (l.questions || []).length : 0,
        correct: state.correct,
        attempts: state.attempts,
        remediating: state.remediating,
        finished: state.finished,
        strategy: STRATEGIES[state.strategyIndex],
        microAnswers: clone(state.microAnswers),
        feedback: clone(state.feedback),
        sideQuestion: state.sideQuestion,
        sideAnswer: clone(state.sideAnswer),
        scorePercent: l && l.questions && l.questions.length ? Math.round((state.correct / l.questions.length) * 100) : 0
      };
    }

    function exportState() { return clone(state); }
    function getEvidence() { return clone(evidence); }
    function resetEvidence() { evidence = evidenceDefault(); return clone(evidence); }

    if (saved) restore(saved);

    return Object.freeze({
      schema: SCHEMA,
      strategies: STRATEGIES.slice(),
      categories: categories,
      lessonsIn: lessonsIn,
      lesson: function () { return clone(lesson()); },
      chooseCategory: chooseCategory,
      chooseLesson: chooseLesson,
      beats: function () { return clone(beats()); },
      currentBeat: function () { return clone(currentBeat()); },
      answerMicro: answerMicro,
      nextBeat: nextBeat,
      currentQuestion: function () { return clone(currentQuestion()); },
      answerQuiz: answerQuiz,
      confused: confused,
      ask: ask,
      resume: resume,
      snapshot: snapshot,
      exportState: exportState,
      evidence: getEvidence,
      resetEvidence: resetEvidence,
      reset: reset
    });
  }

  function installBrowser() {
    if (!root.document || root.__fiezelTutorV3Installed) return false;
    root.__fiezelTutorV3Installed = true;
    root.document.documentElement.classList.add('fiezel-ui-v6');

    var pack = null;
    var session = null;
    var voiceBusy = false;
    var mount = function () { return root.document.getElementById('app'); };

    function readLocal(key, fallback) {
      try { return safeParse(root.localStorage.getItem(key), fallback); } catch (_) { return fallback; }
    }
    function writeLocal(key, value) {
      try { root.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
    function save() {
      if (!session) return;
      writeLocal(SESSION_KEY, session.exportState());
      writeLocal(EVIDENCE_KEY, session.evidence());
    }

    async function ensurePack() {
      if (pack) return pack;
      var response = await root.fetch('./features/classroom/classroom-lessons-v1.json', { credentials: 'same-origin' });
      if (!response || !response.ok) throw new Error('tutor_pack_unavailable');
      pack = await response.json();
      var saved = readLocal(SESSION_KEY, null);
      var evidence = readLocal(EVIDENCE_KEY, evidenceDefault());
      session = createSession(pack, saved, evidence);
      return pack;
    }

    function englishVoice() {
      try { return typeof root.neuralVoiceFor === 'function' ? root.neuralVoiceFor({}) : undefined; }
      catch (_) { return undefined; }
    }
    function baseSpeed() {
      try { return typeof root.selectedNeuralRate === 'function' ? Number(root.selectedNeuralRate()) || 1 : 1; }
      catch (_) { return 1; }
    }
    function stopVoice() {
      try { if (root.FiezelVoiceRuntime && typeof root.FiezelVoiceRuntime.stop === 'function') root.FiezelVoiceRuntime.stop(); } catch (_) {}
      voiceBusy = false;
    }
    async function speak(pair, speedFactor) {
      if (!pair || !pair.en || voiceBusy) return;
      var subtitle = root.document.getElementById('tutorSubtitle');
      if (subtitle) subtitle.textContent = pair.id || pair.idText || '';
      var note = root.document.getElementById('tutorVoiceState');
      if (!root.FiezelVoiceRuntime || typeof root.FiezelVoiceRuntime.speak !== 'function') {
        if (note) note.textContent = 'Neural voice belum siap. Teks pelajaran tetap dapat digunakan.';
        return;
      }
      voiceBusy = true;
      if (note) note.textContent = 'Fiezel sedang menjelaskan…';
      try {
        await root.FiezelVoiceRuntime.speak(pair.en, {
          voice: englishVoice(),
          lang: 'en-US',
          speed: Math.max(.55, Math.min(1.25, baseSpeed() * (speedFactor || 1))),
          allowFallback: false
        });
        if (note) note.textContent = 'Siap untuk pertanyaan berikutnya.';
      } catch (error) {
        if (note) note.textContent = 'Suara neural belum tersedia. Subtitle dan lesson state tetap aman.';
      } finally {
        voiceBusy = false;
      }
    }

    /**
     * m025-49 subject welcome, per OWNER: "setiap memulai subject baru, harus ada kata
     * welcomenya ... tapi kata welcomenya berubah-ubah, tidak repetitive".
     *
     * Three deliberate choices:
     *   - the line is spoken through the Indonesian engine DIRECTLY, with an explicit
     *     `sapaan` intent, so the greeting register is chosen by what the line IS rather
     *     than by matching words in it;
     *   - the rotation index is persisted, so re-opening the app does not restart the
     *     bank and greet him the same way twice in a row;
     *   - it never blocks the lesson: if the voice is not ready the subtitle still shows
     *     the greeting and teaching continues.
     */
    /**
     * m025-49. The engine measured on OWNER's device spends about two seconds of CPU per
     * second of speech, so nothing said at the moment it is requested can ever feel
     * instant. Beats, though, are known in advance: while Jahran is reading the board and
     * answering the micro-check, the NEXT beat's narration can already be rendered into
     * the voice cache. By the time he presses Continue the audio exists and playback is
     * immediate.
     *
     * Idle-scheduled and entirely best-effort: it never blocks a render, never
     * initialises the engine, and yields to any real request at a chunk boundary.
     */
    function warmNextBeat() {
      var indo = root.FiezelIndonesianVoice;
      if (!indo || typeof indo.prefetch !== 'function') return;
      var upcoming;
      try {
        var snap = session.snapshot();
        upcoming = session.beats()[snap.beatIndex + 1];
      } catch (_) { return; }
      var line = upcoming && (upcoming.idText || upcoming.id);
      if (!line) return;
      var run = function () {
        try { indo.prefetch(line, { lang: 'id-ID', speed: baseSpeed() }); } catch (_) {}
      };
      if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(run, { timeout: 2500 });
      else root.setTimeout(run, 600);
    }

    var WELCOME_INDEX_KEY = 'fiezel-tutor-welcome-index-v1';
    function nextWelcomeIndex() {
      var index = 0;
      try { index = Number(root.localStorage.getItem(WELCOME_INDEX_KEY)) || 0; } catch (_) { index = 0; }
      try { root.localStorage.setItem(WELCOME_INDEX_KEY, String((index + 1) % 1000)); } catch (_) {}
      return index;
    }
    function welcomeLine() {
      var script = root.FiezelGenZScript;
      var topic = '';
      try { topic = String((lesson() && lesson().topic) || ''); } catch (_) { topic = ''; }
      if (!script || typeof script.welcome !== 'function') {
        return topic ? 'Halooo Jahran, balik lagi nih! Yuk kita bedah ' + topic + ' bareng aku.' : '';
      }
      return script.welcome(topic, nextWelcomeIndex());
    }
    async function speakWelcome() {
      var line = welcomeLine();
      if (!line) return;
      var subtitle = root.document.getElementById('tutorSubtitle');
      if (subtitle) subtitle.textContent = line;
      var indo = root.FiezelIndonesianVoice;
      var ready = false;
      try { ready = !!(indo && typeof indo.speak === 'function' && indo.status && indo.status().prepared); } catch (_) { ready = false; }
      if (!ready) return;
      voiceBusy = true;
      try {
        await indo.speak(line, { lang: 'id-ID', speed: baseSpeed(), intent: 'sapaan', allowFallback: false });
      } catch (_) {
        // A greeting that fails is not a lesson that fails.
      } finally {
        voiceBusy = false;
      }
    }

    function bundleStatus() {
      var id = root.FiezelIndonesianVoice && typeof root.FiezelIndonesianVoice.status === 'function'
        ? root.FiezelIndonesianVoice.status() : { prepared: false, ready: false, error: 'module_missing' };
      return Object.freeze({
        schema: 'fiezel-learning-bundle-v1',
        classroom: true,
        classroomSpeech: 'en-US neural',
        classroomSubtitle: 'id-ID semantic',
        indonesianVoicePrepared: !!id.prepared,
        indonesianVoiceReady: !!id.ready,
        indonesianModel: id.model || '',
        error: id.error || ''
      });
    }

    async function prepareLearningBundle(onProgress) {
      if (!root.FiezelIndonesianVoice || typeof root.FiezelIndonesianVoice.prepare !== 'function') {
        throw new Error('indonesian_bundle_module_missing');
      }
      return root.FiezelIndonesianVoice.prepare({ onProgress: onProgress });
    }

    root.FiezelLearningBundle = Object.freeze({
      schema: 'fiezel-learning-bundle-v1',
      status: bundleStatus,
      prepare: prepareLearningBundle
    });

    function bundleCard() {
      var st = bundleStatus();
      return '<section class="tutor-bundle">' +
        '<div><span class="tutor-kicker">ONE LEARNING BUNDLE</span><h3>Classroom + Bahasa Indonesia</h3>' +
        '<p>Classroom mengajar dengan English neural voice dan subtitle Indonesia. Paket Bahasa Indonesia yang sama tetap tersedia untuk capability Speaking/Listening dan latihan bahasa lokal.</p></div>' +
        '<button type="button" data-tutor-bundle class="' + (st.indonesianVoicePrepared ? 'bundle-ready' : '') + '">' +
        (st.indonesianVoicePrepared ? 'Paket Indonesia siap' : 'Siapkan paket Indonesia') + '</button></section>';
    }

    function boardMarkup(board) {
      board = board || {};
      var examples = (board.examples || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      return '<section class="tutor-board"><span class="tutor-kicker">' + esc(board.kicker || 'SMART BOARD') + '</span>' +
        '<h2>' + esc(board.title || '') + '</h2>' +
        (board.formula ? '<div class="tutor-formula">' + esc(board.formula) + '</div>' : '') +
        (examples ? '<ul>' + examples + '</ul>' : '') + '</section>';
    }

    function shell(inner, snap) {
      var pct = snap && snap.beatCount ? Math.round(((snap.beatIndex + 1) / snap.beatCount) * 100) : 0;
      return '<section class="classroom-v3">' +
        '<header class="tutor-head"><div><span class="tutor-kicker">FIEZEL · ADAPTIVE HUMAN TUTOR</span><h1>Classroom</h1><p>Choose a subject, learn in short human teaching beats, interrupt anytime.</p></div>' +
        '<div class="tutor-head-actions"><button type="button" data-tutor-home>Subjects</button><button type="button" data-tutor-reset-evidence title="Reset tutor evidence">Reset evidence</button></div></header>' +
        (snap && snap.lessonId ? '<div class="tutor-progress"><span style="width:' + pct + '%"></span></div>' : '') +
        inner + '</section>';
    }

    // m025-41 OWNER correction: opening the Classroom tab must land ON the subjects, not
    // on a bundle-download interstitial. The subject grid is therefore the first thing in
    // the markup, and the optional Indonesian bundle card is demoted below it.
    function renderCategory() {
      var cats = session.categories();
      var cards = cats.map(function (c) {
        var lessons = session.lessonsIn(c.id);
        var a1 = lessons.filter(function (l) { return String(l.level || '').toUpperCase() === 'A1'; }).length;
        var detail = lessons.length
          ? lessons.length + ' lesson' + (lessons.length === 1 ? '' : 's') + (a1 ? ' · ' + a1 + ' × A1' : '')
          : (c.id === 'listening' || c.id === 'speaking' ? 'route to Skills Lab' : 'roadmap');
        return '<button type="button" class="tutor-subject" data-category="' + esc(c.id) + '">' +
          '<span class="tutor-subject-icon"><i data-lucide="' + esc(c.icon || 'book-open') + '"></i></span>' +
          '<span><b>' + esc(c.label) + '</b><small>' + esc(c.hint || '') + '</small><em>' + detail +
          '</em></span><i data-lucide="arrow-up-right"></i></button>';
      }).join('');
      mount().innerHTML = shell(
        '<div class="tutor-hub"><section><span class="tutor-kicker">CHOOSE A SUBJECT</span><h2>What do you want to learn, Jahran?</h2>' +
        '<p>Kurikulum A1 lengkap dulu, lalu naik ke jalur TOEFL / IELTS. Fiezel mengingat checkpoint, bukan audio mentah.</p></section>' +
        '<div class="tutor-subject-grid">' + cards + '</div></div>' +
        bundleCard(), session.snapshot());
      wire();
    }

    var LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    function levelRank(level) {
      var at = LEVEL_ORDER.indexOf(String(level || '').toUpperCase());
      return at === -1 ? LEVEL_ORDER.length : at;
    }

    function renderTopics() {
      var snap = session.snapshot();
      // The A1 track is the foundation the learner is meant to finish first, so the
      // ladder is presented in CEFR order rather than in authoring order.
      var lessons = session.lessonsIn(snap.categoryId).slice().sort(function (a, b) {
        return levelRank(a.level) - levelRank(b.level) || String(a.topic).localeCompare(String(b.topic));
      });
      var items = lessons.map(function (l) {
        return '<button type="button" class="tutor-topic" data-lesson="' + esc(l.id) + '"><span>' +
          '<small>' + esc(l.level || '') + '</small><b>' + esc(l.topic) + '</b><em>Open micro-lesson</em></span><i data-lucide="arrow-right"></i></button>';
      }).join('');
      mount().innerHTML = shell('<div class="tutor-topic-shell"><button class="tutor-back" data-tutor-home>← Subjects</button>' +
        '<span class="tutor-kicker">' + esc(snap.categoryId || '') + '</span><h2>Choose a topic</h2>' +
        '<div class="tutor-topic-grid">' + items + '</div></div>', snap);
      wire();
    }

    function renderRoute() {
      var snap = session.snapshot();
      var skillRoute = snap.categoryId === 'listening' || snap.categoryId === 'speaking';
      mount().innerHTML = shell('<div class="tutor-route-card"><span class="tutor-kicker">SUBJECT ROUTER</span><h2>' +
        esc((snap.categoryId || 'subject').replace(/^./, function (m) { return m.toUpperCase(); })) + '</h2><p>' +
        (skillRoute ? 'This subject already has a dedicated Speaking + Listening capability. Fiezel keeps one teacher system and routes you there instead of duplicating the exercise.' : 'This Classroom-native category is on the roadmap. The router is ready without inventing lesson content.') +
        '</p>' + (skillRoute ? '<button type="button" class="primary" data-route-skills>Open Speaking + Listening</button>' : '') +
        '<button type="button" data-tutor-home>Back to subjects</button></div>', snap);
      wire();
    }

    function teacherPanel(snap, pair) {
      return '<aside class="tutor-teacher"><div class="tutor-avatar">F</div><div><span class="tutor-kicker">FIEZEL · TEACHER</span><h3>' +
        esc(snap.topic || 'Classroom') + '</h3><p id="tutorVoiceState">Ready. Ask whenever something feels unclear.</p></div>' +
        '<div class="tutor-teacher-actions"><button type="button" data-tutor-ask><i data-lucide="message-circle-question"></i> Ask Fiezel</button>' +
        '<button type="button" data-tutor-confused><i data-lucide="shuffle"></i> I don’t get it</button>' +
        '<button type="button" data-tutor-slower><i data-lucide="snail"></i> Slower</button>' +
        '<button type="button" data-tutor-replay><i data-lucide="rotate-ccw"></i> Replay</button></div>' +
        '<div class="tutor-caption"><span>INDONESIAN RUNNING SUBTITLE</span><p id="tutorSubtitle">' + esc(pair && (pair.id || pair.idText) || '') + '</p></div></aside>';
    }

    function renderTeach(autoSpeak) {
      var snap = session.snapshot();
      var beat = session.currentBeat();
      var check = '';
      if (beat && beat.check) {
        var answered = Object.prototype.hasOwnProperty.call(snap.microAnswers || {}, beat.id);
        check = '<section class="tutor-check"><span class="tutor-kicker">MICRO CHECK</span><h3>' + esc(beat.check.prompt) + '</h3><div class="tutor-options">' +
          beat.check.options.map(function (o, i) {
            return '<button type="button" data-micro="' + i + '"' + (answered ? ' disabled' : '') + '>' + esc(o) + '</button>';
          }).join('') + '</div></section>';
      }
      var feedback = snap.feedback ? '<section class="tutor-inline-feedback"><b>' + esc(snap.feedback.en || '') + '</b><p>' + esc(snap.feedback.id || '') + '</p></section>' : '';
      var nextDisabled = beat && beat.check && !Object.prototype.hasOwnProperty.call(snap.microAnswers || {}, beat.id);
      var main = '<div class="tutor-classroom-grid"><main>' + boardMarkup(beat && beat.board) +
        '<section class="tutor-voice-copy"><span class="tutor-kicker">TEACHING BEAT ' + (snap.beatIndex + 1) + ' / ' + snap.beatCount + '</span><p>' +
        esc(beat && beat.en || '') + '</p></section>' + check + feedback +
        '<div class="tutor-next-row"><button type="button" class="primary" data-next-beat ' + (nextDisabled ? 'disabled' : '') + '>' +
        (snap.beatIndex >= snap.beatCount - 1 ? 'Start practice' : 'Continue') + ' <i data-lucide="arrow-right"></i></button></div></main>' +
        teacherPanel(snap, beat) + '</div>';
      mount().innerHTML = shell(main, snap);
      wire();
      if (autoSpeak && beat) speak({ en: beat.en, id: beat.idText }, 1);
      warmNextBeat();
    }

    function renderQuiz() {
      var snap = session.snapshot();
      var q = session.currentQuestion();
      if (!q) return renderSummary();
      var feedback = snap.feedback ? '<section class="tutor-inline-feedback"><span class="tutor-kicker">ADAPTIVE FEEDBACK · ' + esc(snap.feedback.strategy || snap.strategy) + '</span><b>' +
        esc(snap.feedback.en || '') + '</b><p>' + esc(snap.feedback.id || '') + '</p></section>' : '';
      var board = snap.feedback && snap.feedback.board ? snap.feedback.board : {
        kicker: 'ACTIVE RECALL',
        title: snap.topic,
        formula: 'Question ' + (snap.questionIndex + 1) + ' / ' + snap.questionCount,
        examples: []
      };
      var options = q.options.map(function (o, i) { return '<button type="button" data-quiz="' + i + '">' + esc(o) + '</button>'; }).join('');
      var main = '<div class="tutor-classroom-grid"><main>' + boardMarkup(board) +
        '<section class="tutor-check tutor-quiz"><span class="tutor-kicker">CHECK UNDERSTANDING</span><h2>' + esc(q.prompt) + '</h2>' +
        '<div class="tutor-options">' + options + '</div></section>' + feedback + '</main>' +
        teacherPanel(snap, snap.feedback || q.explain) + '</div>';
      mount().innerHTML = shell(main, snap);
      wire();
    }

    function renderSideQuestion() {
      var snap = session.snapshot();
      var ans = snap.sideAnswer || {};
      var main = '<div class="tutor-sideq"><div><span class="tutor-kicker">ASK FIEZEL · CHECKPOINT PRESERVED</span><h2>' +
        esc(snap.sideQuestion) + '</h2><p class="tutor-side-answer">' + esc(ans.en || '') + '</p><div class="tutor-caption"><span>INDONESIAN</span><p id="tutorSubtitle">' + esc(ans.id || '') + '</p></div>' +
        boardMarkup(ans.board) + '<div class="tutor-next-row"><button type="button" class="primary" data-resume>Back to the exact lesson checkpoint</button></div></div></div>';
      mount().innerHTML = shell(main, snap);
      wire();
      speak(ans, 1);
    }

    function renderSummary() {
      var snap = session.snapshot();
      var ev = session.evidence();
      var misconceptions = Object.keys(ev.misconceptions || {}).length;
      mount().innerHTML = shell('<div class="tutor-summary"><span class="tutor-kicker">LESSON COMPLETE</span><h2>' +
        esc(snap.topic || 'Classroom') + '</h2><div class="tutor-score">' + snap.scorePercent + '%</div><p>' +
        snap.correct + ' first-pass correct · ' + snap.attempts + ' attempts · ' + misconceptions + ' misconception signal(s) retained locally.</p>' +
        '<div class="tutor-summary-grid"><div><b>What Fiezel remembers</b><span>bounded concept evidence + strategy response</span></div>' +
        '<div><b>What Fiezel does not store</b><span>raw microphone audio by default</span></div></div>' +
        '<button type="button" class="primary" data-tutor-home>Choose another subject</button></div>', snap);
      wire();
    }

    function render() {
      if (!session) return;
      var phase = session.snapshot().phase;
      if (phase === 'category') return renderCategory();
      if (phase === 'topic') return renderTopics();
      if (phase === 'route') return renderRoute();
      if (phase === 'teach') return renderTeach(false);
      if (phase === 'quiz') return renderQuiz();
      if (phase === 'sideq') return renderSideQuestion();
      return renderSummary();
    }

    function askDialog() {
      stopVoice();
      var existing = root.document.getElementById('tutorAskSheet');
      if (existing) existing.remove();
      var sheet = root.document.createElement('div');
      sheet.id = 'tutorAskSheet';
      sheet.className = 'tutor-ask-sheet';
      sheet.innerHTML = '<form class="tutor-ask-panel"><span class="tutor-kicker">ASK FIEZEL</span><h2>What is confusing?</h2>' +
        '<p>Your lesson checkpoint stays exactly where it is.</p><textarea name="question" maxlength="240" rows="3" placeholder="Example: Why can’t I say I have went?" required></textarea>' +
        '<div><button type="button" data-cancel-ask>Cancel</button><button type="submit" class="primary">Ask</button></div></form>';
      root.document.body.appendChild(sheet);
      sheet.querySelector('[data-cancel-ask]').addEventListener('click', function () { sheet.remove(); });
      sheet.querySelector('form').addEventListener('submit', function (event) {
        event.preventDefault();
        var text = String(new FormData(event.currentTarget).get('question') || '').trim();
        if (!text) return;
        session.ask(text); save(); sheet.remove(); renderSideQuestion();
      });
      sheet.querySelector('textarea').focus();
    }

    function wire() {
      try { if (root.lucide && root.lucide.createIcons) root.lucide.createIcons(); } catch (_) {}
      root.document.querySelectorAll('[data-category]').forEach(function (b) {
        b.addEventListener('click', function () { stopVoice(); session.chooseCategory(b.dataset.category); save(); render(); });
      });
      root.document.querySelectorAll('[data-lesson]').forEach(function (b) {
        b.addEventListener('click', function () {
          stopVoice();
          session.chooseLesson(b.dataset.lesson);
          save();
          // Greet first, then teach: the beat narration would otherwise supersede the
          // greeting the moment it started.
          renderTeach(false);
          speakWelcome().then(function () { renderTeach(true); });
        });
      });
      root.document.querySelectorAll('[data-micro]').forEach(function (b) {
        b.addEventListener('click', function () {
          var out = session.answerMicro(Number(b.dataset.micro)); save();
          try { if (typeof root.answerFeedbackSignal === 'function') root.answerFeedbackSignal(!!out.correct); } catch (_) {}
          renderTeach(false); speak(out.feedback, 1);
        });
      });
      root.document.querySelectorAll('[data-quiz]').forEach(function (b) {
        b.addEventListener('click', function () {
          var out = session.answerQuiz(Number(b.dataset.quiz)); save();
          // m025-43: Classroom answers were silent - no buzz, no tone. They now go through
          // the same feedback path as every other question in the app.
          try { if (typeof root.answerFeedbackSignal === 'function') root.answerFeedbackSignal(!!(out.result && out.result.correct)); } catch (_) {}
          if (out.snapshot.phase === 'summary') renderSummary(); else renderQuiz();
          speak(out.result.feedback, 1);
        });
      });
      root.document.querySelectorAll('[data-next-beat]').forEach(function (b) {
        b.addEventListener('click', function () {
          stopVoice();
          try { session.nextBeat(); } catch (_) { return; }
          save();
          if (session.snapshot().phase === 'teach') renderTeach(true); else renderQuiz();
        });
      });
      root.document.querySelectorAll('[data-tutor-home]').forEach(function (b) {
        b.addEventListener('click', function () { stopVoice(); session.reset(); save(); renderCategory(); });
      });
      root.document.querySelectorAll('[data-tutor-ask]').forEach(function (b) { b.addEventListener('click', askDialog); });
      root.document.querySelectorAll('[data-tutor-confused]').forEach(function (b) {
        b.addEventListener('click', function () {
          stopVoice(); var out = session.confused(); save();
          if (session.snapshot().phase === 'quiz') renderQuiz(); else renderTeach(false);
          speak(out, 1);
        });
      });
      root.document.querySelectorAll('[data-tutor-replay]').forEach(function (b) {
        b.addEventListener('click', function () {
          var snap = session.snapshot(); var pair = snap.phase === 'teach' ? session.currentBeat() : (snap.feedback || session.currentQuestion()?.explain);
          if (pair) speak({ en: pair.en, id: pair.id || pair.idText }, 1);
        });
      });
      root.document.querySelectorAll('[data-tutor-slower]').forEach(function (b) {
        b.addEventListener('click', function () {
          var snap = session.snapshot(); var pair = snap.phase === 'teach' ? session.currentBeat() : (snap.feedback || session.currentQuestion()?.explain);
          if (pair) speak({ en: pair.en, id: pair.id || pair.idText }, .78);
        });
      });
      root.document.querySelectorAll('[data-resume]').forEach(function (b) {
        b.addEventListener('click', function () { stopVoice(); session.resume(); save(); render(); });
      });
      root.document.querySelectorAll('[data-route-skills]').forEach(function (b) {
        b.addEventListener('click', function () { stopVoice(); if (typeof root.go === 'function') root.go('skills'); });
      });
      root.document.querySelectorAll('[data-tutor-reset-evidence]').forEach(function (b) {
        b.addEventListener('click', function () {
          session.resetEvidence(); save();
          try { root.showToast && root.showToast('Tutor evidence direset.'); } catch (_) {}
        });
      });
      root.document.querySelectorAll('[data-tutor-bundle]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (bundleStatus().indonesianVoicePrepared) return;
          b.disabled = true; b.textContent = 'Menyiapkan paket…';
          try {
            await prepareLearningBundle(function (p) {
              b.textContent = 'Paket ' + Number(p.completed || 0) + '/' + Number(p.total || 0);
            });
            b.textContent = 'Paket Indonesia siap'; b.classList.add('bundle-ready');
          } catch (_) {
            b.disabled = false; b.textContent = 'Coba siapkan lagi';
          }
        });
      });
    }

    async function classroomV3() {
      var app = mount();
      if (!app) return;
      app.innerHTML = '<section class="classroom-v3 tutor-loading"><div class="tutor-skeleton"></div><p>Preparing Fiezel Classroom…</p></section>';
      try { await ensurePack(); render(); }
      catch (error) {
        app.innerHTML = '<section class="classroom-v3"><div class="tutor-error"><b>Classroom could not load.</b><p>' + esc(error && error.message || error) + '</p></div></section>';
      }
    }

    root.classroom = classroomV3;

    // m025-42: the press-to-talk layer answers about the lesson actually on screen, so
    // the live checkpoint is exposed rather than duplicated there.
    root.__fiezelTutorContext = function () {
      if (!session) return {};
      try { return { lesson: session.lesson(), beat: session.currentBeat(), snapshot: session.snapshot() }; }
      catch (_) { return {}; }
    };

    var observer = new MutationObserver(function () {
      var app = mount();
      if (!app) return;
      root.document.body.classList.toggle('is-classroom-v3', !!app.querySelector('.classroom-v3'));
    });
    var appNode = mount();
    if (appNode) observer.observe(appNode, { childList: true, subtree: true });

    return true;
  }

  var api = Object.freeze({
    schema: SCHEMA,
    storageKeys: Object.freeze({ session: SESSION_KEY, evidence: EVIDENCE_KEY }),
    strategies: STRATEGIES.slice(),
    createSession: createSession,
    strategyAnswer: strategyAnswer,
    answerSideQuestion: answerSideQuestion,
    evidenceDefault: evidenceDefault,
    installBrowser: installBrowser
  });

  if (root && root.document) {
    try { installBrowser(); } catch (_) {}
  }
  return api;
}));
