/**
 * FIEZEL Learner Flow — satu alur sederhana:
 * pilih tujuan → 5 soal diagnostic → skill yang perlu diperkuat → rencana hari ini →
 * kerjakan satu lesson → alasan rekomendasi berikutnya. Progres tersimpan lokal dan
 * bisa diexport/import lewat FiezelProgressBackup.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelLearnerFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah modul ini dulu literal Indonesia, jadi murid
     yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft — kalau copy-map
     belum termuat (murid th memuat copy-th secara dinamis), fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  var root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  var KEY = 'fiezel-learner-flow-v1';
  var ASSIGN_KEY = 'fiezel-learner-assignments-v1';
  var DAY = 86400000;

  var GOALS = [
    { id: 'school', label: 'English for school', desc: t('flow.tab-desc', 'Tugas, ulangan, dan teks pelajaran.') },
    { id: 'campus', label: 'English for campus', desc: 'Kuliah, jurnal, dan presentasi.' },
    { id: 'it', label: 'English for IT', desc: 'Dokumentasi teknis dan komunikasi tim.' },
    { id: 'scholarship', label: 'English for scholarship', desc: 'Esai motivasi, email resmi, wawancara.' },
    { id: 'exam_foundation', label: 'Foundation for IELTS/TOEFL', desc: 'Fondasi skill — bukan prediksi skor resmi.' },
    { id: 'everyday', label: 'Everyday English', desc: 'Percakapan harian dan pesan singkat.' }
  ];

  function bank() { return root.FiezelReviewBank; }
  function backup() { return root.FiezelProgressBackup; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]; }); }
  function today(now) { return new Date(now || Date.now()).toISOString().slice(0, 10); }

  function defaults() {
    return { schema: KEY, goal: null, step: 'goal', tab: 'flow', diagnostic: null, diagRun: null, skills: {}, seen: {}, diagRuns: 0, plan: null, activeLesson: null, lessons: [], lastNext: null };
  }
  function load() {
    try { var raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.schema === KEY) return Object.assign(defaults(), raw); } catch (_) {}
    return defaults();
  }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} }
  function loadAssignments() { try { var a = JSON.parse(localStorage.getItem(ASSIGN_KEY)); return Array.isArray(a) ? a : []; } catch (_) { return []; } }

  // ---- model -----------------------------------------------------------------------------
  // Ledger anti-pengulangan: id soal yang sudah diuji per skill (dibatasi agar akhirnya
  // berputar kembali setelah semua variasi habis, bukan tumbuh tanpa batas).
  var SEEN_CAP = 40;
  function seenFor(sk) { return (st.seen && st.seen[sk]) || []; }
  function markSeen(sk, id) {
    if (!st.seen) st.seen = {};
    var list = (st.seen[sk] || []).filter(function (x) { return x !== id; });
    list.push(id); st.seen[sk] = list.slice(-SEEN_CAP);
  }
  function allSeen() { var out = []; Object.keys(st.seen || {}).forEach(function (k) { out = out.concat(st.seen[k]); }); return out; }
  function record(st, skill, correct) {
    var s = st.skills[skill] || { correct: 0, total: 0, lastAt: 0 };
    s.total += 1; if (correct) s.correct += 1; s.lastAt = Date.now();
    st.skills[skill] = s;
  }
  function accuracy(s) { return s && s.total ? s.correct / s.total : null; }
  function statusOf(s) {
    var a = accuracy(s);
    if (a == null) return { id: 'unmeasured', label: 'belum diukur' };
    if (a >= 0.8) return { id: 'strong', label: s.total >= 3 ? 'cukup kuat' : 'cukup kuat (bukti awal)' };
    if (a >= 0.5) return { id: 'growing', label: 'sedang berkembang' };
    return { id: 'review', label: 'perlu review' };
  }
  function rankedSkills(st) {
    var B = bank();
    return B.SKILL_ORDER.map(function (id) {
      var s = st.skills[id], a = accuracy(s);
      return { id: id, meta: B.SKILLS[id], acc: a, status: statusOf(s), total: s ? s.total : 0 };
    }).sort(function (x, y) { return (x.acc == null ? 0.49 : x.acc) - (y.acc == null ? 0.49 : y.acc); });
  }
  function skillSummary(st) {
    var ranked = rankedSkills(st), B = bank();
    var strong = ranked.filter(function (r) { return r.status.id === 'strong'; }).map(function (r) { return B.SKILLS[r.id].short.toLowerCase(); });
    var weak = ranked.filter(function (r) { return r.status.id === 'review' || r.status.id === 'growing'; }).map(function (r) { return B.SKILLS[r.id].short.toLowerCase(); });
    var reviewCount = Math.max(5, Math.min(10, weak.length * 5));
    var head = strong.length ? 'Kamu cukup kuat di ' + strong.slice(0, 2).join(' dan ') : 'Bukti awalmu masih tipis';
    var tail = weak.length ? ', tetapi beberapa pola ' + weak.slice(0, 2).join(' dan ') + ' masih sering tertukar.' : ' — dan lima soal awal semuanya tepat.';
    return head + tail + ' Hari ini kita mulai dari ' + reviewCount + ' soal review singkat.';
  }

  function buildPlan(st, now) {
    var B = bank(), ranked = rankedSkills(st), blocks = [], used = {};
    loadAssignments().slice(-3).reverse().forEach(function (a) {
      blocks.push({ id: 'assign-' + a.id, kind: a.mode === 'ujian' ? 'Ujian dari guru' : t('flow.tugas-guru', 'Tugas dari guru'), skill: a.skills[0], title: a.title, minutes: a.minutes, itemIds: a.itemIds, from: a.teacher ? a.teacher + ' · ' + a.from : a.from });
      a.skills.forEach(function (s) { used[s] = true; });
    });
    var first = ranked[0], second = ranked[1];
    blocks.push({ id: 'b1', kind: 'Review', skill: first.id, title: B.SKILLS[first.id].short, minutes: 4, count: 5 });
    blocks.push({ id: 'b2', kind: B.AREAS[B.SKILLS[second.id].area], skill: second.id, title: B.SKILLS[second.id].label, minutes: 5, count: 5 });
    var third = ranked.filter(function (r) { return r.id !== first.id && r.id !== second.id && !used[r.id]; });
    var listen = third.filter(function (r) { return r.id === 'listening_detail'; })[0] || third[0];
    if (listen) blocks.push({ id: 'b3', kind: B.AREAS[B.SKILLS[listen.id].area], skill: listen.id, title: listen.id === 'listening_detail' ? 'Short dialogue' : B.SKILLS[listen.id].label, minutes: 3, count: 3 });
    var weakNames = [first, second].filter(function (r) { return r.status.id !== 'strong'; }).map(function (r) { return B.SKILLS[r.id].short.toLowerCase(); });
    var reason = weakNames.length >= 2 ? 'Dipilih karena dua pola ini masih sering tertukar di latihan terakhir: ' + weakNames.join(' dan ') + '.'
      : weakNames.length === 1 ? 'Dipilih karena ' + weakNames[0] + ' masih sering tertukar di latihan terakhir; sisanya menjaga skill yang sudah cukup kuat.'
      : 'Dipilih untuk menjaga ritme: semua skill awal sudah cukup kuat, jadi hari ini porsi review dibuat ringan.';
    return { date: today(now), blocks: blocks, reason: reason, done: [], minutes: blocks.reduce(function (m, b) { return m + b.minutes; }, 0) };
  }
  function ensurePlan(st) {
    if (!st.plan || st.plan.date !== today()) { st.plan = buildPlan(st); }
    return st.plan;
  }

  function startLesson(st, block) {
    var B = bank();
    // Tugas guru dikerjakan DI DALAM Kelas (class-hub): satu tempat, mendukung soal kustom guru + bukti per-soal.
    if (block.id.indexOf('assign-') === 0 && root.FiezelClassHub && typeof root.go === 'function') { root.FiezelClassHub.openAssignment(block.id.slice(7)); root.go('classroom'); return; }
    var ids = block.itemIds || B.pickFresh(block.skill, block.count, { avoid: seenFor(block.skill), seed: (Date.now() % 9000) + 3 }).map(function (it) { return it.id; });
    ids.forEach(function (id) { markSeen(block.skill, id); });
    st.activeLesson = { blockId: block.id, skill: block.skill, title: block.title, kind: block.kind, minutes: block.minutes, itemIds: ids, index: 0, attempt: 0, results: [], feedback: null, revealed: false, startedAt: Date.now() };
    st.step = 'lesson';
  }

  function answerLesson(st, chosen) {
    var B = bank(), L = st.activeLesson, item = B.byId(L.itemIds[L.index]);
    var fb = B.explain(item, chosen);
    L.attempt += 1;
    if (fb.correct || L.attempt >= 2) {
      var firstTry = fb.correct && L.attempt === 1;
      L.results.push({ itemId: item.id, skill: item.skill, correct: firstTry, attempts: L.attempt });
      record(st, item.skill, firstTry);
      L.revealed = true;
    }
    L.feedback = fb;
  }
  function nextItem(st) {
    var L = st.activeLesson;
    L.index += 1; L.attempt = 0; L.feedback = null; L.revealed = false;
    if (L.index >= L.itemIds.length) finishLesson(st);
  }
  function finishLesson(st) {
    var L = st.activeLesson, B = bank(), correct = L.results.filter(function (r) { return r.correct; }).length;
    st.lessons.push({ at: Date.now(), skill: L.skill, area: B.SKILLS[L.skill].area, kind: L.kind, title: L.title, correct: correct, total: L.results.length, minutes: L.minutes });
    if (st.plan && st.plan.done.indexOf(L.blockId) === -1) st.plan.done.push(L.blockId);
    if (L.blockId.indexOf('assign-') === 0) { st.doneAssign = (st.doneAssign || []).concat([{ id: L.blockId.slice(7), at: Date.now(), c: correct, t: L.results.length }]).slice(-6); try { localStorage.setItem(ASSIGN_KEY, JSON.stringify(loadAssignments().filter(function (a) { return 'assign-' + a.id !== L.blockId; }))); } catch (_) {} }
    st.lastNext = buildNext(st, L, correct);
    st.activeLesson = null;
    pushToClass();
    st.step = 'next';
  }
  function buildNext(st, L, correct) {
    var B = bank(), plan = st.plan, remaining = plan.blocks.filter(function (b) { return plan.done.indexOf(b.id) === -1; });
    var wrong = L.results.length - correct, skillName = B.SKILLS[L.skill].short.toLowerCase();
    var reason;
    if (remaining.length) {
      var nb = remaining[0];
      reason = wrong > 1
        ? 'Kamu masih tertukar pada ' + wrong + ' dari ' + L.results.length + ' soal ' + skillName + ', jadi pola ini akan diulang lagi besok. Sekarang kita lanjut ke ' + nb.title + ' agar sesi hari ini tetap seimbang.'
        : wrong === 1
          ? 'Hanya satu soal ' + skillName + ' yang tertukar — confidence-nya belum cukup untuk disebut stabil, tapi cukup untuk lanjut ke ' + nb.title + '.'
          : 'Semua soal ' + skillName + ' tepat di percobaan pertama, jadi tidak perlu diulang hari ini. Berikutnya: ' + nb.title + ', bagian rencana yang belum tersentuh.';
      return { block: nb, reason: reason, done: false };
    }
    var ranked = rankedSkills(st), weakest = ranked[0];
    reason = weakest.status.id === 'strong'
      ? 'Rencana hari ini selesai dan semua skill yang diukur cukup kuat. Besok porsi review dibuat ringan dan ditambah satu skill baru.'
      : 'Rencana hari ini selesai. Besok dimulai dari ' + B.SKILLS[weakest.id].short.toLowerCase() + ' karena akurasinya masih ' + Math.round((weakest.acc || 0) * 100) + '% — review needed sebelum naik ke pola berikutnya.';
    return { block: null, reason: reason, done: true };
  }

  function weeklySummary(st, now) {
    var since = (now || Date.now()) - 7 * DAY, B = bank();
    var rows = st.lessons.filter(function (l) { return l.at >= since; });
    var count = function (area) { return rows.filter(function (l) { return l.area === area; }).length; };
    var items = rows.reduce(function (m, l) { return m + l.total; }, 0);
    var vocabItems = rows.filter(function (l) { return l.area === 'vocabulary'; }).reduce(function (m, l) { return m + l.total; }, 0);
    var ranked = rankedSkills(st);
    var reviewNeeded = ranked.filter(function (r) { return r.status.id === 'review'; }).map(function (r) { return B.SKILLS[r.id].short; });
    var lowConf = ranked.filter(function (r) { return r.status.id === 'unmeasured' || r.status.id === 'growing'; }).map(function (r) { return B.SKILLS[r.id].short; });
    var measured = ranked.filter(function (r) { return r.acc != null; }).length;
    var lines = [
      'Saya menyelesaikan: ' + count('grammar') + ' lesson grammar · ' + vocabItems + ' vocabulary · ' + count('listening') + ' sesi listening · ' + count('reading') + ' sesi reading',
      'Periode: 7 hari',
      'Practice completed: ' + items + ' soal · Session completed: ' + rows.length,
      'Target coverage: ' + Math.round(measured / B.SKILL_ORDER.length * 100) + '% skill map terukur',
      'Review needed: ' + (reviewNeeded.length ? reviewNeeded.join(', ') : '—'),
      'Confidence belum cukup: ' + (lowConf.length ? lowConf.join(', ') : '—')
    ];
    return { lines: lines, text: lines.join('\n'), rows: rows };
  }

  /** Kode hasil untuk tutor: hanya nama depan + akurasi per skill, tanpa jawaban mentah. */
  function classCode() { try { var r = JSON.parse(localStorage.getItem('fiezel-onboarding-v1') || '{}'); return String(r.classCode || ''); } catch (_) { return ''; } }
  // Di perangkat yang sama (kelas demo/uji), hasil diagnostic langsung masuk ke kelas berkode.
  function pushToClass() {
    if (!classCode()) return false;
    var payload = null;
    try { payload = JSON.parse(decodeURIComponent(escape(atob(tutorCode(st, env.learnerName ? env.learnerName() : ''))))); } catch (_) { return false; }
    // Sinkron server: laporan agregat ke kelas yang kodenya diklaim guru (tanpa tempel kode). Gagal diam-diam bila offline.
    var TS = root.FiezelTeacherStore;
    if (TS && TS.reportToClass) { try { TS.reportToClass(payload).then(function (r) { st.classReport = { at: Date.now(), ok: !!r.ok, error: r.error || '' }; save(st); }); } catch (_) {} }
    var T = root.FiezelTutorActionCenter; if (!T) return true;
    try { return T.ingestLearnerResult(payload) || true; } catch (_) { return true; }
  }
  function tutorCode(st, name) {
    var B = bank(), skills = {};
    B.SKILL_ORDER.forEach(function (id) { var s = st.skills[id]; if (s) skills[id] = { c: s.correct, t: s.total }; });
    Object.keys(st.skills || {}).forEach(function (id) { var s = st.skills[id]; if (s && !skills[id] && /^[a-z0-9_]{1,32}$/.test(id) && Object.keys(skills).length < 12) skills[id] = { c: s.correct, t: s.total }; });
    var nm = String(name || '').trim();
    if (!nm || /^(sobat|murid|teman)$/i.test(nm)) { try { nm = String(JSON.parse(localStorage.getItem('fiezel-onboarding-v1') || '{}').name || nm || t('umum.murid', 'Murid')); } catch (_) { nm = nm || t('umum.murid', 'Murid'); } }
    var payload = { v: 1, name: nm.split(' ')[0], at: Date.now(), goal: st.goal, skills: skills, lessons: st.lessons.length, cls: classCode() || undefined, assign: (st.doneAssign || []).length ? st.doneAssign.slice(-8) : undefined };
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); } catch (_) { return ''; }
  }
  function ensureState() { if (!st) st = load(); return st; }
  /** Sisi Kelas (class-hub): murid membuka tugas — dilaporkan sebagai "sedang mengerjakan" (assign.s). */
  function markAssignmentStarted(id) {
    if (!id) return false; var s = ensureState();
    s.doneAssign = (s.doneAssign || []).filter(function (x) { return x.id !== id; }).concat([{ id: id, at: Date.now(), s: 1 }]).slice(-8);
    save(s); pushToClass(); return true;
  }
  /**
   * Sisi Kelas (class-hub): hasil tugas guru masuk ke mesin skill & laporan yang SAMA dengan
   * Rencana hari ini — satu jalur bukti, bukan dua. res = { id, title, skill, mode, minutes,
   * results:[{itemId, skill, correct, chosen}] }. Bukti per-soal yang salah ikut ke guru (assign.w).
   */
  function recordAssignmentResult(res) {
    if (!res || !res.id || !Array.isArray(res.results)) return null; var s = ensureState(), B = bank();
    var correct = res.results.filter(function (r) { return r.correct; }).length;
    res.results.forEach(function (r) { record(s, r.skill || res.skill || 'grammar', !!r.correct); });
    var meta = B && B.SKILLS[res.skill]; s.lessons.push({ at: Date.now(), skill: res.skill, area: meta ? meta.area : (res.skill || 'grammar'), kind: res.mode === 'ujian' ? 'Ujian dari guru' : t('flow.tugas-guru', 'Tugas dari guru'), title: res.title, correct: correct, total: res.results.length, minutes: res.minutes || 0 });
    var wrong = res.results.filter(function (r) { return !r.correct; }).slice(0, 40).map(function (r) { return { i: String(r.itemId).slice(0, 40), o: Number(r.chosen) >= 0 ? Number(r.chosen) : 0 }; });
    var entry = { id: res.id, at: Date.now(), c: correct, t: res.results.length }; if (wrong.length) entry.w = wrong;
    s.doneAssign = (s.doneAssign || []).filter(function (x) { return x.id !== res.id; }).concat([entry]).slice(-8);
    if (s.plan && s.plan.done.indexOf('assign-' + res.id) === -1) s.plan.done.push('assign-' + res.id);
    try { localStorage.setItem(ASSIGN_KEY, JSON.stringify(loadAssignments().filter(function (a) { return a.id !== res.id; }))); } catch (_) {}
    save(s); pushToClass();
    return { correct: correct, total: res.results.length, entry: entry };
  }

  // ---- render ----------------------------------------------------------------------------
  var mountEl = null, env = {}, st = null, pendingRestore = null, pendingAssignment = null;

  /**
   * Buka tugas guru langsung dari notifikasi: sisipkan ke rencana hari ini bila belum ada,
   * lalu mulai sesinya. Bila modul belum terpasang (navigasi masih berjalan), ditunda ke mount().
   */
  function openAssignment(id) {
    if (!id) return false;
    if (!mountEl || !st) { pendingAssignment = id; return true; }
    var a = loadAssignments().filter(function (x) { return x.id === id; })[0];
    if (!a) { if (env.toast) env.toast(t('flow.tugas-hilang', 'Tugas ini sudah selesai atau tidak ditemukan.')); return false; }
    if (!st.goal) st.goal = GOALS[0].id;
    if (!st.diagnostic) st.diagnostic = { at: Date.now(), answers: [], skipped: true };
    var plan = ensurePlan(st), bid = 'assign-' + a.id;
    var block = plan.blocks.filter(function (b) { return b.id === bid; })[0];
    if (!block) { block = { id: bid, kind: a.mode === 'ujian' ? 'Ujian dari guru' : t('flow.tugas-guru', 'Tugas dari guru'), skill: a.skills[0], title: a.title, minutes: a.minutes, itemIds: a.itemIds, from: a.from }; plan.blocks.unshift(block); plan.minutes += block.minutes; }
    if (plan.done.indexOf(bid) !== -1) { if (env.toast) env.toast(t('flow.tugas-selesai', 'Tugas ini sudah kamu selesaikan.')); st.tab = 'flow'; st.step = 'plan'; save(st); render(); return true; }
    st.tab = 'flow';
    startLesson(st, block);
    save(st); render();
    return true;
  }

  function mount(el, options) {
    mountEl = el; env = options || {}; st = load();
    if (st.goal && st.step === 'goal') st.step = st.diagnostic ? 'plan' : 'diagnostic';
    try { if (new URL(location.href).searchParams.get('duel')) st.tab = 'duel'; } catch (_) {}
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    if (pendingAssignment) { var pid = pendingAssignment; pendingAssignment = null; if (openAssignment(pid)) return; }
    render();
  }

  function render() {
    if (!mountEl) return;
    var tabs = [['flow', 'Alur belajar'], ['duel', 'Duel'], ['summary', 'Ringkasan'], ['backup', 'Progres & backup']];
    var html = '<section class="lf" data-testid="learner-flow">' +
      '<header class="lf-head"><div><p class="lf-kicker">Practice pathway</p><h1>' + t('flow.belajar-hari-ini', 'Belajar hari ini') + '</h1></div>' +
      '<nav class="lf-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" class="lf-tab' + (st.tab === t[0] ? ' is-active' : '') + '" data-lf="tab" data-tab="' + t[0] + '" data-testid="lf-tab-' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav></header>' +
      (st.tab === 'summary' ? summaryView() : st.tab === 'backup' ? backupView() : st.tab === 'duel' ? '<div id="lfDuelHost" data-testid="lf-duel-host"></div>' : flowView()) + '</section>';
    mountEl.innerHTML = html;
    if (st.tab === 'duel') { var D = root.FiezelDuel, host = mountEl.querySelector('#lfDuelHost'); if (D && host) D.mount(host, env); else if (host) host.innerHTML = '<p class="lf-muted">Modul Duel belum termuat.</p>'; }
    else if (root.FiezelDuel && root.FiezelDuel.unmount) root.FiezelDuel.unmount();
    if (env.afterRender) try { env.afterRender(); } catch (_) {}
  }

  function stepper() {
    var steps = [['goal', 'Tujuan'], ['diagnostic', 'Tes singkat'], ['skillmap', 'Peta kemampuan'], ['plan', 'Rencana hari ini'], ['lesson', t('umum.materi', 'Materi')], ['next', 'Berikutnya']];
    var idx = steps.findIndex(function (s) { return s[0] === st.step; });
    return '<ol class="lf-stepper">' + steps.map(function (s, i) { return '<li class="' + (i < idx ? 'is-done' : i === idx ? 'is-current' : '') + '"><span>' + (i + 1) + '</span>' + s[1] + '</li>'; }).join('') + '</ol>';
  }

  function flowView() {
    var body;
    switch (st.step) {
      case 'goal': body = goalView(); break;
      case 'diagnostic': body = diagnosticView(); break;
      case 'skillmap': body = skillMapView(); break;
      case 'plan': body = planView(); break;
      case 'lesson': body = lessonView(); break;
      default: body = nextView();
    }
    return stepper() + body;
  }

  function goalView() {
    return '<div class="lf-card"><h2>Apa tujuan belajarmu?</h2><p class="lf-muted">Tujuan menentukan contoh dan urutan skill. FIEZEL memberi fondasi dan skill map — bukan skor IELTS/TOEFL resmi atau sertifikat.</p>' +
      '<div class="lf-goal-grid">' + GOALS.map(function (g) {
        return '<button type="button" class="lf-goal' + (st.goal === g.id ? ' is-selected' : '') + '" data-lf="goal" data-goal="' + g.id + '" data-testid="lf-goal-' + g.id + '"><b>' + esc(g.label) + '</b><small>' + esc(g.desc) + '</small></button>';
      }).join('') + '</div>' +
      '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="start-diagnostic" data-testid="lf-start-diagnostic"' + (st.goal ? '' : ' disabled') + '>Jawab 5 soal singkat</button></div></div>';
  }

  function ensureDiagRun() {
    if (!st.diagRun) {
      var ids = bank().diagnosticSet({ avoid: allSeen(), seed: 11 + (st.diagRuns || 0) * 29 }).map(function (it) { return it.id; });
      st.diagRun = { itemIds: ids, index: 0, answers: [], feedback: null };
    }
    return st.diagRun;
  }

  function contextBlock(item, showTranscript) {
    if (item.contextKind === 'picture' && item.picture) {
      return '<div class="lf-picture" role="img" aria-label="Gambar: ' + esc(item.pictureAlt || '') + '" data-testid="lf-picture"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + item.picture + '</svg></div>';
    }
    if (!item.context) return '';
    if (item.contextKind === 'dialogue') {
      return '<div class="lf-context lf-dialogue"><div class="lf-context-head"><span>Dialog pendek</span>' +
        '<button type="button" class="lf-mini" data-lf="listen" data-testid="lf-listen">Dengarkan</button>' +
        (showTranscript ? '' : '<button type="button" class="lf-mini" data-lf="transcript" data-testid="lf-transcript">Tampilkan transkrip</button>') + '</div>' +
        (showTranscript ? '<pre class="lf-transcript" data-testid="lf-transcript-text">' + esc(item.context) + '</pre>' : '<p class="lf-muted">Transkrip terbuka setelah percobaan pertama — dengarkan dulu.</p>') + '</div>';
    }
    return '<div class="lf-context"><div class="lf-context-head"><span>Teks pendek</span></div><p>' + esc(item.context) + '</p></div>';
  }

  function questionCard(item, opts) {
    var o = opts || {}, fb = o.feedback;
    return '<div class="lf-card lf-question" data-testid="lf-question">' +
      '<div class="lf-q-meta"><span class="lf-chip">' + esc(bank().AREAS[bank().SKILLS[item.skill].area]) + '</span><span class="lf-muted">' + esc(o.progress || '') + '</span></div>' +
      contextBlock(item, o.showTranscript) +
      '<p class="lf-prompt">' + esc(item.prompt) + '</p>' +
      '<div class="lf-options">' + item.options.map(function (op, i) {
        var cls = 'lf-option';
        if (fb && o.revealed && i === item.answer) cls += ' is-correct';
        if (fb && !fb.correct && i === o.chosen) cls += ' is-wrong';
        return '<button type="button" class="' + cls + '" data-lf="' + o.action + '" data-choice="' + i + '" data-testid="lf-option-' + i + '"' + (o.locked ? ' disabled' : '') + '>' + esc(op) + '</button>';
      }).join('') + '</div>' +
      (fb ? '<div class="lf-feedback ' + (fb.correct ? 'is-correct' : 'is-wrong') + '" role="status" data-testid="lf-feedback">' + esc(fb.text) + '</div>' : '') +
      (o.footer || '') + '</div>';
  }

  function diagnosticView() {
    var run = ensureDiagRun(), B = bank(), item = B.byId(run.itemIds[run.index]);
    var fb = run.feedback, last = run.answers[run.answers.length - 1];
    var footer = fb ? '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="diag-next" data-testid="lf-diag-next">' + (run.index + 1 >= run.itemIds.length ? 'Lihat peta kemampuan' : t('flow.soal-berikutnya', 'Soal berikutnya')) + '</button></div>' : '';
    return '<div class="lf-intro"><h2>Tes singkat</h2><p class="lf-muted">Lima soal, satu untuk tiap kemampuan. Ini bukan nilai — cuma peta awal untuk menyusun rencana hari ini.</p></div>' +
      questionCard(item, { action: 'diag-answer', progress: t('flow.soal-progress', 'Soal {n} dari {total}').replace('{n}', run.index + 1).replace('{total}', run.itemIds.length), feedback: fb, revealed: !!fb, chosen: last && last.itemId === item.id ? last.chosen : null, locked: !!fb, showTranscript: !!fb || !!run.transcript, footer: footer });
  }

  function skillMapView() {
    var ranked = rankedSkills(st), B = bank();
    var order = B.SKILL_ORDER.map(function (id) { return ranked.filter(function (r) { return r.id === id; })[0]; });
    return '<div class="lf-card"><p class="lf-kicker">Peta kemampuan</p><h2>Kemampuan yang perlu dilatih</h2>' +
      '<p class="lf-lead" data-testid="lf-skill-summary">' + esc(skillSummary(st)) + '</p>' +
      '<ul class="lf-skill-list">' + order.map(function (r) {
        var pct = r.acc == null ? '—' : Math.round(r.acc * 100) + '%';
        return '<li class="lf-skill is-' + r.status.id + '" data-testid="lf-skill-' + r.id + '"><div><b>' + esc(r.meta.label) + '</b><small>' + esc(B.AREAS[r.meta.area]) + ' · ' + esc(r.status.label) + '</small></div><span class="lf-bar" style="--v:' + (r.acc == null ? 0 : Math.round(r.acc * 100)) + '%"><i></i></span><em>' + pct + '</em></li>';
      }).join('') + '</ul>' +
      '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="to-plan" data-testid="lf-to-plan">Susun rencana hari ini</button><button type="button" class="lf-ghost" data-lf="redo-diagnostic" data-testid="lf-redo-diagnostic">Ulangi diagnostic</button></div></div>';
  }

  function planView() {
    var plan = ensurePlan(st), B = bank(), doneCount = plan.done.length;
    var mainSkill = B.SKILLS[plan.blocks.filter(function (b) { return b.id === 'b1'; })[0].skill];
    return '<div class="lf-card lf-plan" data-testid="lf-today-plan"><p class="lf-kicker">Rencana hari ini</p><h2>Rencana hari ini — ' + plan.minutes + ' menit</h2>' +
      '<div class="lf-plan-meta"><div><small>Target hari ini</small><b>' + plan.blocks.length + ' sesi · ' + plan.blocks.reduce(function (m, b) { return m + (b.count || (b.itemIds || []).length); }, 0) + ' soal</b></div>' +
      '<div><small>Durasi</small><b>' + plan.minutes + ' menit</b></div>' +
      '<div><small>Skill utama</small><b>' + esc(mainSkill.short) + '</b></div>' +
      '<div><small>Review yang harus diulang</small><b>' + esc(plan.blocks.filter(function (b) { return b.kind === 'Review'; }).map(function (b) { return b.title; }).join(', ') || '—') + '</b></div></div>' +
      '<ol class="lf-plan-list">' + plan.blocks.map(function (b, i) {
        var done = plan.done.indexOf(b.id) !== -1;
        return '<li class="' + (done ? 'is-done' : '') + '" data-testid="lf-plan-block-' + b.id + '"><span class="lf-num">' + (i + 1) + '</span><div><b>' + esc(b.kind) + ': ' + esc(b.title) + '</b><small>' + b.minutes + ' menit · ' + (b.count || (b.itemIds || []).length) + ' soal' + (b.from ? ' · dari ' + esc(b.from) : '') + '</small></div>' +
          (done ? '<span class="lf-done">' + t('umum.selesai', 'Selesai') + '</span>' : '<button type="button" class="lf-mini lf-start" data-lf="start-lesson" data-block="' + b.id + '" data-testid="lf-start-' + b.id + '">Mulai</button>') + '</li>';
      }).join('') + '</ol>' +
      '<p class="lf-reason" data-testid="lf-plan-reason"><b>Alasan sesi ini:</b> ' + esc(plan.reason) + '</p>' +
      '<div class="lf-assign-code" data-testid="lf-assign-code"><label class="lf-muted" for="lfAssignCode">Punya kode tugas dari guru?</label><div class="lf-actions"><input id="lfAssignCode" class="lf-code lf-code-input" placeholder="Tempel kode tugas di sini" autocomplete="off" data-testid="lf-assign-code-input"><button type="button" class="lf-mini" data-lf="accept-assign" data-testid="lf-accept-assign">Tambahkan ke rencana</button></div></div>' +
      '<div class="lf-actions">' + (doneCount < plan.blocks.length ? '<button type="button" class="lf-primary" data-lf="start-first" data-testid="lf-start-first">Mulai sesi berikutnya</button>' : '<span class="lf-done">Rencana hari ini selesai</span>') +
      '<button type="button" class="lf-ghost" data-lf="to-skillmap" data-testid="lf-back-skillmap">Lihat peta kemampuan</button></div></div>';
  }

  function lessonView() {
    var L = st.activeLesson, B = bank(), item = B.byId(L.itemIds[L.index]), fb = L.feedback;
    var footer = '';
    if (fb && !L.revealed) footer = '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="retry" data-testid="lf-retry">' + t('umum.coba-lagi', 'Coba lagi') + '</button></div>';
    else if (fb && L.revealed) footer = '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="lesson-next" data-testid="lf-lesson-next">' + (L.index + 1 >= L.itemIds.length ? 'Selesaikan lesson' : t('flow.soal-berikutnya', 'Soal berikutnya')) + '</button></div>';
    return '<div class="lf-intro"><p class="lf-kicker">' + esc(L.kind) + '</p><h2>' + esc(L.title) + '</h2><p class="lf-muted">Tujuan: ' + esc(B.SKILLS[L.skill].objective) + '</p></div>' +
      questionCard(item, { action: 'lesson-answer', progress: t('flow.soal-progress', 'Soal {n} dari {total}').replace('{n}', L.index + 1).replace('{total}', L.itemIds.length), feedback: fb, revealed: L.revealed, chosen: L.lastChoice, locked: !!fb && (L.revealed || !fb.correct) && !!fb, showTranscript: L.attempt > 0 || !!L.transcript, footer: footer }) +
      '<div class="lf-actions lf-actions-end"><button type="button" class="lf-ghost" data-lf="abandon" data-testid="lf-abandon">' + t('flow.kembali-rencana', 'Kembali ke rencana') + '</button></div>';
  }

  function nextView() {
    var n = st.lastNext || { reason: t('flow.belum-ada-lesson', 'Belum ada lesson yang selesai.'), done: false }, last = st.lessons[st.lessons.length - 1];
    return '<div class="lf-card" data-testid="lf-next">' + (last ? '<p class="lf-kicker">Session completed</p><h2>' + esc(last.title) + ': ' + last.correct + ' dari ' + last.total + ' tepat di percobaan pertama</h2>' : '<h2>Rekomendasi berikutnya</h2>') +
      '<div class="lf-reason" data-testid="lf-next-reason"><b>Kenapa rekomendasi ini:</b> ' + esc(n.reason) + '</div>' +
      (n.block ? '<div class="lf-next-block"><small>Berikutnya</small><b>' + esc(n.block.kind) + ': ' + esc(n.block.title) + '</b><span>' + n.block.minutes + ' menit</span></div>' : '') +
      '<div class="lf-actions">' + (n.block ? '<button type="button" class="lf-primary" data-lf="start-lesson" data-block="' + n.block.id + '" data-testid="lf-start-next">Mulai ' + esc(n.block.title) + '</button>' : '') +
      '<button type="button" class="lf-ghost" data-lf="to-plan" data-testid="lf-back-plan">Lihat rencana hari ini</button><button type="button" class="lf-ghost" data-lf="tab" data-tab="summary">Lihat ringkasan</button></div></div>';
  }

  function summaryView() {
    var s = weeklySummary(st), name = env.learnerName ? env.learnerName() : '';
    return '<div class="lf-card" data-testid="lf-summary"><p class="lf-kicker">Ringkasan 7 hari</p><h2>Hasil yang bisa dibagikan</h2>' +
      '<pre class="lf-share" data-testid="lf-summary-text">' + esc(s.text) + '</pre>' +
      '<p class="lf-muted">Istilah yang dipakai: practice completed, target coverage, review needed, confidence belum cukup, session completed. Menyelesaikan soal bukan berarti "menguasai" skill.</p>' +
      '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="copy-summary" data-testid="lf-copy-summary">Salin ringkasan</button>' +
      (typeof navigator !== 'undefined' && navigator.share ? '<button type="button" class="lf-ghost" data-lf="share-summary" data-testid="lf-share-summary">Bagikan</button>' : '') + '</div></div>' +
      '<div class="lf-card"><h3>Kode hasil untuk tutor</h3>' + (classCode() ? '<p class="lf-chip" data-testid="lf-class-code">' + t('flow.kode-kelas-chip', 'Kelas {kode}').replace('{kode}', esc(classCode())) + (st.classReport && st.classReport.ok ? ' · terkirim otomatis' : '') + '</p>' : '') + '<p class="lf-muted">Berisi nama depan dan akurasi per skill saja — tanpa jawaban mentah atau audio. ' + (classCode() ? (st.classReport && st.classReport.ok ? 'Hasilmu sudah dikirim ke guru lewat kode kelas; kode di bawah hanya cadangan.' : 'Saat online, hasil dikirim otomatis ke guru lewat kode kelas. Kode di bawah untuk cadangan bila offline.') : t('flow.tempel-ruang-guru', 'Tempel di Ruang Guru → Tempel kode hasil murid.')) + '</p>' +
      '<textarea class="lf-code" readonly rows="3" data-testid="lf-tutor-code">' + esc(tutorCode(st, name)) + '</textarea>' +
      '<div class="lf-actions"><button type="button" class="lf-ghost" data-lf="copy-code" data-testid="lf-copy-code">Salin kode</button></div></div>';
  }

  function backupView() {
    var P = backup(), payload = P.collect(localStorage, { appVersion: env.appVersion });
    var groups = P.describe(payload);
    return '<div class="lf-card" data-testid="lf-backup"><p class="lf-kicker">Backup manual</p><h2>Export & import progres</h2>' +
      '<p class="lf-muted">Progres tersimpan di perangkat ini (baik untuk privasi), tetapi hilang jika kamu berganti HP atau menghapus data browser. Simpan berkas backup secara berkala.</p>' +
      '<h3>Data yang tersimpan (' + payload.keyCount + ' kunci)</h3><ul class="lf-data-list">' + groups.map(function (g) { return '<li><b>' + esc(g.label) + '</b><small>' + esc(g.desc) + '</small><em>' + g.keys + ' kunci · ' + P.fmtBytes(g.bytes) + '</em></li>'; }).join('') + '</ul>' +
      '<p class="lf-muted">Tidak ada raw audio, transcript mentah, atau jawaban speaking yang disimpan.</p>' +
      '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="export" data-testid="lf-export">Export progres (.json)</button>' +
      '<label class="lf-ghost lf-file"><input type="file" accept="application/json,.json" data-lf-file="import" data-testid="lf-import-file">' + t('flow.pilih-berkas', 'Pilih berkas untuk import') + '</label></div>' +
      '<div id="lfRestorePreview" data-testid="lf-restore-preview">' + (pendingRestore ? restorePreviewMarkup() : '') + '</div></div>' +
      '<div class="lf-card lf-danger"><h3>' + t('flow.hapus-semua', 'Hapus semua data') + '</h3><p class="lf-muted">Menghapus seluruh progres, rencana, kelas tutor, dan pengaturan FIEZEL di perangkat ini. Tidak bisa dibatalkan — export dulu bila ragu.</p>' +
      '<div class="lf-actions"><input type="text" class="lf-input" id="lfWipeConfirm" placeholder="Ketik HAPUS untuk konfirmasi" data-testid="lf-wipe-confirm" autocomplete="off"><button type="button" class="lf-danger-btn" data-lf="wipe" data-testid="lf-wipe">' + t('flow.hapus-semua', 'Hapus semua data') + '</button></div></div>';
  }

  function restorePreviewMarkup() {
    var p = pendingRestore.preview;
    if (!p.ok) return '<div class="lf-feedback is-wrong">' + esc(p.reason) + '</div>';
    return '<div class="lf-preview"><h3>Pratinjau restore</h3><p class="lf-muted">' + t('flow.restore-belum-berubah', 'Belum ada yang berubah. Berkas dibuat {tanggal}').replace('{tanggal}', esc(String(p.createdAt).slice(0, 10))) + (p.appVersion ? ' (FIEZEL ' + esc(p.appVersion) + ')' : '') + '.</p>' +
      '<ul class="lf-preview-list"><li><b>' + p.added.length + '</b> kunci baru ditambahkan</li><li><b>' + p.replaced.length + '</b> kunci akan ditimpa dengan isi berkas</li><li><b>' + p.same.length + '</b> kunci sudah identik</li><li><b>' + p.keptLocal.length + '</b> kunci lokal tidak tersentuh</li></ul>' +
      '<ul class="lf-data-list">' + p.groups.map(function (g) { return '<li><b>' + esc(g.label) + '</b><em>' + g.keys + ' kunci</em></li>'; }).join('') + '</ul>' +
      '<div class="lf-actions"><button type="button" class="lf-primary" data-lf="restore" data-testid="lf-restore-confirm">Terapkan restore</button><button type="button" class="lf-ghost" data-lf="cancel-restore" data-testid="lf-restore-cancel">' + t('umum.batal', 'Batal') + '</button></div></div>';
  }

  // ---- events ----------------------------------------------------------------------------
  function toast(msg) { if (env.toast) try { env.toast(msg); return; } catch (_) {} }
  function copy(text, okMsg) {
    var done = function () { toast(okMsg || 'Tersalin.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) { try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (_) {} }
  function browserSpeak(text) {
    try { if (root.speechSynthesis && root.SpeechSynthesisUtterance) { var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.92; root.speechSynthesis.cancel(); root.speechSynthesis.speak(u); return true; } } catch (_) {}
    return false;
  }
  // Prefer suara FIEZEL (FiezelVoiceSay.say → aset/Puter/neural lokal) bila pintu bicara sudah
  // hidup; jatuh ke SpeechSynthesis browser supaya soal listening tetap bisa didengar offline
  // sebelum suara neural diunduh.
  function speak(text) {
    var clean = String(text || '').replace(/^[AB]:\s*/gm, '');
    var vs = root.FiezelVoiceSay;
    if (vs && typeof vs.say === 'function') {
      try { var p = vs.say(clean, { contentType: 'sentence' }); if (p && typeof p.catch === 'function') p.catch(function () { browserSpeak(clean); }); return true; } catch (_) {}
    }
    return browserSpeak(clean);
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function onClick(e) {
    var btn = e.target.closest('[data-lf]'); if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-lf'), B = bank();
    switch (act) {
      case 'tab': st.tab = btn.getAttribute('data-tab'); break;
      case 'goal': st.goal = btn.getAttribute('data-goal'); break;
      case 'start-diagnostic': st.diagRun = null; st.step = 'diagnostic'; break;
      case 'diag-answer': {
        var run = ensureDiagRun(), item = B.byId(run.itemIds[run.index]), chosen = Number(btn.getAttribute('data-choice'));
        var fb = B.explain(item, chosen); run.feedback = fb;
        run.answers.push({ itemId: item.id, skill: item.skill, chosen: chosen, correct: fb.correct });
        markSeen(item.skill, item.id);
        record(st, item.skill, fb.correct);
        break;
      }
      case 'diag-next': {
        var r2 = ensureDiagRun(); r2.index += 1; r2.feedback = null; r2.transcript = false;
        if (r2.index >= r2.itemIds.length) { st.diagnostic = { at: Date.now(), answers: r2.answers }; st.diagRuns = (st.diagRuns || 0) + 1; st.diagRun = null; st.plan = null; st.step = 'skillmap'; if (pushToClass()) toast('Hasil diagnostic terkirim ke kelas ' + classCode() + '.'); }
        break;
      }
      case 'redo-diagnostic': st.skills = {}; st.diagnostic = null; st.diagRun = null; st.plan = null; st.lastNext = null; st.step = 'diagnostic'; break;
      case 'to-plan': ensurePlan(st); st.step = 'plan'; break;
      case 'to-skillmap': st.step = 'skillmap'; break;
      case 'start-first': {
        var plan = ensurePlan(st), nb = plan.blocks.filter(function (b) { return plan.done.indexOf(b.id) === -1; })[0];
        if (nb) startLesson(st, nb);
        break;
      }
      case 'start-lesson': {
        var p2 = ensurePlan(st), blk = p2.blocks.filter(function (b) { return b.id === btn.getAttribute('data-block'); })[0];
        if (blk) startLesson(st, blk);
        break;
      }
      case 'lesson-answer': {
        var ch = Number(btn.getAttribute('data-choice'));
        st.activeLesson.lastChoice = ch; answerLesson(st, ch);
        break;
      }
      case 'retry': st.activeLesson.feedback = null; st.activeLesson.lastChoice = null; break;
      case 'lesson-next': nextItem(st); break;
      case 'abandon': st.activeLesson = null; st.step = 'plan'; break;
      case 'transcript': if (st.activeLesson) st.activeLesson.transcript = true; else if (st.diagRun) st.diagRun.transcript = true; break;
      case 'listen': {
        var cur = st.activeLesson ? B.byId(st.activeLesson.itemIds[st.activeLesson.index]) : st.diagRun ? B.byId(st.diagRun.itemIds[st.diagRun.index]) : null;
        if (cur && !speak(cur.context)) { toast(t('flow.suara-tidak-ada', 'Suara tidak tersedia di perangkat ini — buka transkrip.')); if (st.activeLesson) st.activeLesson.transcript = true; else if (st.diagRun) st.diagRun.transcript = true; }
        else return;
        break;
      }
      case 'copy-summary': copy(weeklySummary(st).text, 'Ringkasan tersalin.'); return;
      case 'share-summary': try { navigator.share({ title: 'Ringkasan belajar FIEZEL', text: weeklySummary(st).text }); } catch (_) {} return;
      case 'copy-code': copy(tutorCode(st, env.learnerName ? env.learnerName() : ''), 'Kode hasil tersalin.'); return;
      case 'accept-assign': {
        var inp = mountEl.querySelector('#lfAssignCode'), T2 = root.FiezelTeacherStore, acc = inp && T2 ? T2.acceptAssignmentCode(inp.value) : null;
        if (!acc) { toast('Kode tugas tidak dikenali. Minta guru menyalin ulang kodenya.'); return; }
        st.plan = null; toast(t('flow.toast-tugas-masuk', 'Tugas “{judul}” dari {dari} masuk ke rencana hari ini.').replace('{judul}', acc.title).replace('{dari}', acc.from)); break;
      }
      case 'export': {
        var P = backup(), payload = P.collect(localStorage, { appVersion: env.appVersion });
        download(P.filename(), JSON.stringify(payload, null, 2)); toast('Backup diunduh: ' + P.filename()); return;
      }
      case 'restore': {
        if (!pendingRestore) return;
        var res = backup().restore(pendingRestore.payload, localStorage);
        pendingRestore = null;
        if (res.ok) { toast(t('flow.toast-restore-selesai', 'Restore selesai ({jumlah} kunci). Memuat ulang…').replace('{jumlah}', res.written)); setTimeout(function () { location.reload(); }, 700); return; }
        toast(res.reason || 'Restore gagal.'); break;
      }
      case 'cancel-restore': pendingRestore = null; break;
      case 'wipe': {
        var inp = mountEl.querySelector('#lfWipeConfirm');
        if (!inp || inp.value.trim().toUpperCase() !== 'HAPUS') { toast('Ketik HAPUS untuk mengonfirmasi.'); return; }
        var w = backup().wipeAll(localStorage);
        toast(t('flow.hapus-semua-selesai', 'Semua data FIEZEL dihapus ({jumlah} kunci). Memuat ulang…').replace('{jumlah}', w.removed));
        setTimeout(function () { location.reload(); }, 700); return;
      }
      default: return;
    }
    save(st); render();
  }

  function onChange(e) {
    var input = e.target.closest('[data-lf-file="import"]'); if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];
    file.text().then(function (text) {
      var payload = null; try { payload = JSON.parse(text); } catch (_) {}
      pendingRestore = { payload: payload, preview: payload ? backup().preview(payload, localStorage) : { ok: false, reason: 'Berkas tidak bisa dibaca sebagai JSON.' } };
      render();
    });
  }

  return { KEY: KEY, ASSIGN_KEY: ASSIGN_KEY, GOALS: GOALS, mount: mount, render: render, load: load, buildPlan: buildPlan, skillSummary: skillSummary, weeklySummary: weeklySummary, tutorCode: tutorCode, rankedSkills: rankedSkills, statusOf: statusOf, openAssignment: openAssignment, markAssignmentStarted: markAssignmentStarted, recordAssignmentResult: recordAssignmentResult, pushToClass: function () { ensureState(); return pushToClass(); }, _state: function () { return st; } };
});
