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

  /* m025-265 · sapuan kebocoran Thai: naskah di berkas ini dulu literal Indonesia,
     jadi murid yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft:
     kalau copy-map belum termuat, fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  // AI-02 F01: naskah murid diambil dari lapisan i18n (copy-id-feat-b.js). Di browser
  // runtime-nya dimuat lebih dulu (index.html); di Node modul memuatnya sendiri supaya
  // keluaran render tetap byte-identik dengan sebelumnya.
  var I18N = (typeof globalThis !== 'undefined' && globalThis.FiezelI18n) || null;
  if (!I18N && typeof require === 'function') {
    try {
      I18N = require('../i18n/fiezel-i18n.js');
      require('../i18n/copy-id-feat-b.js');
    } catch (loadError) { I18N = null; }
  }
  function T(key, params) { return I18N ? I18N.t(key, params) : String(key); }

  var SCHEMA = 'fiezel-tutor-v3';
  var SESSION_KEY = 'fiezel-tutor-v3-session';
  var EVIDENCE_KEY = 'fiezel-tutor-v3-evidence';
  var STRATEGIES = ['intuition', 'timeline', 'form-map'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function safeParse(raw, fallback) {
    try { var out = JSON.parse(raw); return out && typeof out === 'object' ? out : fallback; }
    catch (_) { return fallback; }
  }
  /**
   * m025-117: nama murid dibaca dari state aplikasi, bukan dipaku di naskah. Kosong berarti
   * naskahnya berjalan tanpa vokatif - kalimatnya tetap utuh, hanya tidak menyapa nama.
   */
  function learnerName(root) {
    var target = root || (typeof globalThis !== 'undefined' ? globalThis : null);
    try {
      var state = target && typeof target.__getFiezelState === 'function' ? target.__getFiezelState() : null;
      var stored = String((state && state.userName) || '').trim();
      if (stored) return stored;
    } catch (_) { /* jatuh ke sapaan cadangan aplikasi di bawah */ }
    // Sapaan cadangan milik app.js selalu mengembalikan sesuatu yang bisa dibaca, sehingga
    // kalimat contoh tidak pernah berakhir menggantung seperti "My name is ." pada jendela
    // sempit sebelum jawaban murid tiba.
    try { if (target && typeof target.learnerName === 'function') return String(target.learnerName() || '').trim(); }
    catch (_) { return ''; }
    return '';
  }

  function personalizePack(value) {
    var name = learnerName(root);
    var walk = function (node) {
      // Tanpa nama, token dibuang BESERTA spasi di depannya - "Okay {name}, ..." harus
      // menjadi "Okay, ...", bukan "Okay , ..." apalagi "Okay {name}, ...".
      if (typeof node === 'string') {
        return name ? node.replace(/\{name\}/g, name)
          : node.replace(/\s*\{name\}/g, '').replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ');
      }
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        var out = {};
        for (var key in node) if (Object.prototype.hasOwnProperty.call(node, key)) out[key] = walk(node[key]);
        return out;
      }
      return node;
    };
    return walk(value);
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
        en: "Okay" + (learnerName() ? ', ' + learnerName() : '') + ". Forget the grammar name for a second. Compare these: I lost my key yesterday, and I've lost my key.",
        idText: "Oke" + (learnerName() ? ', ' + learnerName() : '') + ". Lupakan dulu nama grammarnya. Bandingkan: I lost my key yesterday, dan I've lost my key.",
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

  function lessonBoard(lesson, fallbackTitle) {
    return {
      title: (lesson && lesson.board && lesson.board.title) || (lesson && lesson.topic) || fallbackTitle,
      formula: (lesson && lesson.board && lesson.board.formula) || '',
      examples: (lesson && lesson.board && lesson.board.examples) || []
    };
  }

  function isPresentPerfect(lesson) {
    return !!lesson && lesson.id === 'grammar_present_perfect';
  }

  // Remediasi harus bicara tentang PELAJARAN YANG SEDANG DIBUKA, bukan selalu present
  // perfect (A11-01). Untuk 37 pelajaran lain, inti penjelasan diambil dari field
  // remediate/explain milik soal yang barusan salah; strategi hanya membingkai caranya.
  function strategyAnswer(kind, lesson, reason, question) {
    var topic = lesson ? lesson.topic : 'this idea';
    if (!isPresentPerfect(lesson)) {
      var rem = question && question.remediate ? question.remediate : null;
      var exp = question && question.explain ? question.explain : null;
      var coreEn = (rem && rem.en) || (exp && exp.en) || reason || ('Look again at the rule for ' + topic + '.');
      var coreId = (rem && rem.id) || (exp && exp.id) || 'Coba lihat lagi aturan pelajaran ini.';
      var board = lessonBoard(lesson, topic);
      if (kind === 'timeline') {
        return {
          strategy: kind,
          en: 'Slow down and check the order of ideas first. ' + coreEn,
          id: 'Pelan-pelan, cek dulu urutan idenya. ' + coreId,
          board: board
        };
      }
      if (kind === 'form-map') {
        return {
          strategy: kind,
          en: 'Look closely at the form of each word. ' + coreEn,
          id: 'Perhatikan bentuk tiap katanya. ' + coreId,
          board: board
        };
      }
      return {
        strategy: 'intuition',
        en: 'Think about the meaning first, not the rule name. ' + coreEn,
        id: 'Rasakan dulu maknanya, jangan nama aturannya. ' + coreId,
        board: board
      };
    }
    if (kind === 'timeline') {
      return {
        strategy: kind,
        en: "Let's put it on a timeline. The action starts before now, but the result reaches the present. That connection is the point.",
        id: T('tutorv3.script-4'),
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
      id: T('tutorv3.script-6'),
      board: { title: topic, formula: 'earlier action → result now', examples: [reason || 'connect the result to now'] }
    };
  }

  function answerSideQuestion(text, lesson) {
    var q = String(text || '').trim();
    var low = q.toLowerCase();
    if (/went|gone|v2|v3|verb 3|verb three/.test(low)) {
      return {
        en: "You are separating two jobs of the same verb. Went is the normal past form. After have or has, English needs the third form, so we say I have gone, not I have went.",
        id: T('tutorv3.script-7'),
        board: { title: 'go · went · gone', formula: 'I went.  |  I have gone.', examples: ['V2 after a past-time statement', 'V3 after have / has'] }
      };
    }
    if (/have|has/.test(low)) {
      return {
        en: "Use has with he, she and it. Use have with I, you, we and they. The meaning stays the same; only the subject controls that helper word.",
        id: T('tutorv3.script-8'),
        board: { title: 'Have or has?', formula: 'he/she/it → has', examples: ['I/you/we/they → have'] }
      };
    }
    if (/why|kenapa|mengapa|beda|difference/.test(low)) {
      if (isPresentPerfect(lesson)) {
        return {
          en: "The useful question is not only when the action happened. Ask whether the result is still connected to now. If yes, present perfect often becomes the better choice.",
          id: 'Pertanyaan yang berguna bukan cuma kapan kejadiannya. Tanyakan juga: hasilnya masih terasa sekarang, nggak? Kalau iya, present perfect biasanya lebih pas.',
          board: { title: 'Meaning first', formula: 'past action + present relevance', examples: ['result still matters now'] }
        };
      }
      return {
        en: "The useful question is not only when the action happened. Ask whether the result is still connected to now. If yes, present perfect often becomes the better choice.",
        id: T('tutorv3.script-9'),
        board: { title: 'Meaning first', formula: 'past action + present relevance', examples: ['result still matters now'] }
      };
    }
    var coreIdea = lesson ? lesson.topic : 'the current rule';
    return {
      en: "Let's connect your question to the lesson checkpoint. The core idea here is " + coreIdea + '. We can use that idea to test your example.',
      id: 'Kita hubungkan pertanyaanmu dengan checkpoint pelajaran. Inti pelajaran ini: ' + coreIdea + '. Kita pakai ide itu untuk menguji contohmu.',
      board: { title: coreIdea, formula: (lesson && lesson.board && lesson.board.formula) || 'idea \u2192 example', examples: [q.slice(0, 80)] }
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
        var alt = strategyAnswer(STRATEGIES[state.strategyIndex], lesson(), q.remediate && q.remediate.en, q);
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
      var alt = strategyAnswer(STRATEGIES[state.strategyIndex], lesson(), 'make the same idea easier to see', currentQuestion());
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
    // V6: penanda pembatalan untuk pengajuan hangat yang masih menganggur (lihat stopVoice).
    var prefetchGeneration = 0;
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
      // m025-117: bank materi menyimpan token {name}, bukan nama sungguhan. Diganti sekali
      // di sini karena paketnya di-cache - satu penelusuran, dan tidak ada titik render
      // yang bisa lupa memanggilnya.
      pack = personalizePack(await response.json());
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
      // V6: penghenti juga membatalkan pengajuan hangat yang masih menganggur. Prefetch
      // tidak pernah berbunyi, jadi yang dijaga di sini adalah CPU ponsel: tidak ada
      // generasi untuk beat yang murid sudah tinggalkan.
      prefetchGeneration++;
    }

    /**
     * V6 (reports/voice-v5-prefetch.md §3 baris 2): paket materi sudah dimuat penuh, jadi
     * beat BERIKUTNYA sudah diketahui - `session.beats()` publik dan `beatIndex` ada di
     * snapshot. Sebelum ini tidak ada satu pun kata prefetch di berkas ini, dan setiap beat
     * membayar penuh ~4,5 detik generasi (audit V1 §1).
     *
     * PAGAR: tidak ada prepare()/ensureReady() di sini - kontrak v5 sudah menjawab false
     * dengan tenang selama aset belum prepared, dan itu memang jawaban yang benar. Pengajuan
     * ditunda satu task supaya beat yang SEDANG dibacakan memesan mesin single-flight lebih
     * dulu (inversi antrean m025-47), dan dibatalkan bila stopVoice() sudah lewat.
     */
    function prefetchNextBeat(speedFactor) {
      var say = root.FiezelVoiceSay;
      if (!say || typeof say.prefetch !== 'function') return false;
      var upcoming = null;
      try {
        var snap = session.snapshot();
        if (snap.phase !== 'teach') return false;
        upcoming = session.beats()[Number(snap.beatIndex) + 1] || null;
      } catch (_) { return false; }
      if (!upcoming || !upcoming.en) return false;
      var generation = ++prefetchGeneration;
      var speed = Math.max(.55, Math.min(1.25, baseSpeed() * (speedFactor || 1)));
      var defer = typeof root.setTimeout === 'function' ? root.setTimeout : setTimeout;
      defer(function () {
        if (generation !== prefetchGeneration) return;
        try { say.prefetch(upcoming.en, { speed: speed }); } catch (_) {}
      }, 0);
      return true;
    }
    async function speak(pair, speedFactor) {
      if (!pair || !pair.en || voiceBusy) return;
      var subtitle = root.document.getElementById('tutorSubtitle');
      if (subtitle) subtitle.textContent = pair.id || pair.idText || '';
      var note = root.document.getElementById('tutorVoiceState');
      // m025-100: lewat pintu bicara bersama, bukan mesin lokal.
      if (!root.FiezelVoiceSay || typeof root.FiezelVoiceSay.say !== 'function') {
        if (note) note.textContent = T('tutor.v3-suara-pending-siap-teks-lesson');
        return;
      }
      voiceBusy = true;
      if (note) note.textContent = 'Fiezel sedang menjelaskan…';
      try {
        // Subtitle tutor sudah digambar di atas dari pair.id, jadi barisnya dioper
        // ikut supaya pita subtitle bersama tidak memanggil penerjemah untuk teks
        // yang terjemahannya sudah ada.
        var speaking = root.FiezelVoiceSay.say({ en: pair.en, id: pair.id || pair.idText || '' }, {
          speed: Math.max(.55, Math.min(1.25, baseSpeed() * (speedFactor || 1)))
        });
        // Diajukan sesudah say() berangkat dan SEBELUM ditunggu: menunggunya lebih dulu
        // berarti generasi beat berikutnya baru mulai setelah bunyi sekarang habis - pola
        // persis yang diukur audit V1 sebagai jeda 4,5 detik per batas.
        prefetchNextBeat(speedFactor);
        await speaking;
        if (note) note.textContent = T('tutor.v3-siap-for-pertanyaan-upcoming');
      } catch (error) {
        if (note) note.textContent = t('tutorv3.suara-gagal-note', 'Suara tidak berbunyi. Subtitle dan lesson state tetap aman.');
      } finally {
        voiceBusy = false;
      }
    }

    /**
     * m025-95: suara Indonesia dihapus, jadi paket belajar tidak lagi punya sisi kedua.
     * Classroom bicara Inggris dengan subtitle Indonesia, dan tidak ada lagi yang perlu
     * diunduh sebelum ia bisa bersuara.
     */
    function bundleStatus() {
      var voice = root.FiezelPuterVoice && typeof root.FiezelPuterVoice.status === 'function'
        ? root.FiezelPuterVoice.status() : { ready: false, error: 'module_missing' };
      return Object.freeze({
        schema: 'fiezel-learning-bundle-v1',
        classroom: true,
        classroomSpeech: 'en-US neural',
        classroomSubtitle: 'id-ID semantic',
        voiceReady: !!voice.ready,
        requiresDownload: false,
        error: voice.error || ''
      });
    }

    // Tidak ada lagi yang disiapkan: mesin suara tidak menuntut unduhan. Fungsinya
    // dipertahankan supaya pemanggil lama tidak melempar, dan langsung selesai.
    async function prepareLearningBundle() {
      return bundleStatus();
    }

    root.FiezelLearningBundle = Object.freeze({
      schema: 'fiezel-learning-bundle-v1',
      status: bundleStatus,
      prepare: prepareLearningBundle
    });

    // m025-124: kartu "Siapkan paket Indonesia" DIHAPUS.
    //
    // Ia menawarkan paket yang sudah tidak ada sejak m025-95, dan yang lebih buruk: sejak
    // m025-100 prepareLearningBundle() hanya mengembalikan status tanpa menyiapkan apa pun.
    // Jadi menekannya menampilkan "Menyiapkan paket…" lalu "Paket Indonesia siap" untuk
    // sesuatu yang tidak pernah terjadi. Layar yang berbohong kepada murid lebih buruk
    // daripada layar yang tidak menawarkan apa-apa.

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
        '<div class="tutor-hub"><section><span class="tutor-kicker">CHOOSE A SUBJECT</span><h2>What do you want to learn' + (learnerName(root) ? ', ' + esc(learnerName(root)) : '') + '?</h2>' +
        '<p>Kurikulum A1 lengkap dulu, lalu naik ke jalur TOEFL / IELTS. Fiezel mengingat checkpoint, bukan audio mentah.</p></section>' +
        '<div class="tutor-subject-grid">' + cards + '</div></div>',
        session.snapshot());
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

    /**
     * m025-117 (OWNER: masuk ke dalam folder lalu swipe back "malah stuck screen").
     *
     * Classroom adalah folder berlapis - subject, lalu topik, lalu pelajaran - dan
     * ketiganya digambar di dalam SATU view app.js. Tanpa pendaftaran ini, tekanan kembali
     * dari dalam sebuah pelajaran mengambil entri view Classroom dan melempar murid keluar
     * dari seluruh Classroom sekaligus. app.js menyediakan FiezelStage di atas modul
     * back-nav; dipakai lewat pengait opsional supaya berkas ini tetap bisa dimuat dan
     * diuji sendirian.
     */
    function pushStage(kind, restore) {
      try { return root.FiezelStage && root.FiezelStage.enter(kind, restore) === true; }
      catch (_) { return false; }
    }
    function popAllStages() {
      try { return root.FiezelStage ? root.FiezelStage.leaveAll() === true : false; }
      catch (_) { return false; }
    }

    function wire() {
      try { if (root.lucide && root.lucide.createIcons) root.lucide.createIcons(); } catch (_) {}
      root.document.querySelectorAll('[data-category]').forEach(function (b) {
        b.addEventListener('click', function () {
          stopVoice();
          var cat = b.dataset.category;
          session.chooseCategory(cat); save();
          pushStage('tutor-topic', function () {
            stopVoice(); session.reset();
            try { session.chooseCategory(cat); } catch (_) {}
            save(); render();
          });
          render();
        });
      });
      root.document.querySelectorAll('[data-lesson]').forEach(function (b) {
        b.addEventListener('click', function () {
          stopVoice();
          var from = session.snapshot().categoryId;
          var lesson = b.dataset.lesson;
          session.chooseLesson(lesson); save();
          pushStage('tutor-lesson', function () {
            stopVoice(); session.reset();
            if (from) { try { session.chooseCategory(from); } catch (_) {} }
            try { session.chooseLesson(lesson); } catch (_) {}
            save(); render();
          });
          renderTeach(true);
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
        // Kembali ke akar Classroom membuang SELURUH stage yang menumpuk di dalamnya,
        // supaya tekanan kembali berikutnya tidak jatuh pada folder yang sudah ditinggalkan.
        b.addEventListener('click', function () { stopVoice(); popAllStages(); session.reset(); save(); renderCategory(); });
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
