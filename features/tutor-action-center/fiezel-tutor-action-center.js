/**
 * FIEZEL Tutor Action Center — mengubah data jawaban murid menjadi tindakan mengajar:
 * peta kemampuan kelas, antrian intervensi, "Buat sesi review" otomatis, rekomendasi per
 * murid, laporan mingguan, dan export (PDF/CSV/ringkasan anonim) dengan pratinjau.
 * Semua data lokal di perangkat tutor; hanya agregat + nama depan yang disimpan.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelTutorActionCenter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah modul ini dulu literal Indonesia, jadi murid
     yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft: kalau copy-map
     belum termuat, fallback id yang tampil — bukan kunci mentah. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  var root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  var KEY = 'fiezel-tutor-center-v1';
  var ASSIGN_KEY = 'fiezel-learner-assignments-v1';
  var DAY = 86400000;
  var PROBLEMS = [
    { id: 'past_tense', label: 'Past tense' }, { id: 'past_questions', label: 'Past questions (did + verb 1)' },
    { id: 'listening_detail', label: 'Listening detail' }, { id: 'vocab_a2', label: 'Vocabulary A2' }, { id: 'reading_inference', label: 'Reading inference' }
  ];
  var STATUS = { stable: 'stabil', growing: 'sedang berkembang', light: 'perlu bantuan ringan', unstable: 'belum stabil', away: 'belum kembali belajar' };

  function bank() { return root.FiezelReviewBank; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]; }); }
  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 8); }
  // Kode kelas 6 karakter (tanpa 0/O/1/I) yang murid ketik saat onboarding, mis. FZ-K7M3QX.
  function makeClassCode() { var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = ''; for (var i = 0; i < 6; i++) out += A[Math.floor(Math.random() * A.length)]; return 'FZ-' + out; }
  function normalizeClassCode(v) { v = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v.indexOf('FZ') === 0) v = v.slice(2); return v.length === 6 ? 'FZ-' + v : ''; }
  function ensureClassCode(c) { if (c && !c.code) c.code = makeClassCode(); return c ? c.code : ''; }
  /** Simpan hasil learner ke kelas berkode (dipanggil learner-flow di perangkat yang sama). */
  function ingestLearnerResult(payload) {
    var st0 = load(), code = normalizeClassCode(payload && payload.cls); if (!code) return false;
    var c = st0.classes.filter(function (k) { return k.code === code; })[0]; if (!c) return false;
    var s = parseLearnerCode(btoa(unescape(encodeURIComponent(JSON.stringify(payload))))); if (!s) return false;
    var idx = -1; c.students.forEach(function (x, i) { if (x.name === s.name) idx = i; });
    if (idx > -1) { s.id = c.students[idx].id; s.joinedAt = c.students[idx].joinedAt; c.students[idx] = s; } else c.students.push(s);
    save(st0); if (st) st = st0; return true;
  }
  function pct(n) { return n == null ? '—' : Math.round(n * 100) + '%'; }

  function defaults() { return { schema: KEY, classes: [], activeClassId: null, tab: 'map', picked: [], session: null, preview: null }; }
  function load() { try { var raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.schema === KEY) return Object.assign(defaults(), raw); } catch (_) {} return defaults(); }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} }

  // ---- demo seed: kelas English A2, 18 murid, pola deterministik ---------------------------
  var NAMES = ['Rina', 'Dimas', 'Sari', 'Bagas', 'Nadia', 'Fikri', 'Ayu', 'Rizky', 'Putri', 'Yoga', 'Intan', 'Aldi', 'Maya', 'Raka', 'Dewi', 'Fajar', 'Laras', 'Bima'];
  function seedClass(now) {
    var t = now || Date.now();
    // [pastTense, pastQ, vocab, listening, reading, speaking, daysAgoActive, listeningOpened, listeningDone, targetDone]
    var rows = [
      [0.2, 0.2, 0.9, 0.4, 0.6, 0.6, 1, 2, 2, 1], [0.4, 0.4, 0.8, 0.6, 0.8, 0.6, 0, 2, 2, 1], [0.8, 1, 0.9, 0.4, 0.6, 0.6, 2, 2, 0, 0],
      [0.2, 0.2, 0.7, 0.4, 0.6, 0.4, 1, 1, 1, 1], [1, 1, 0.9, 0.6, 0.8, 0.6, 0, 2, 2, 1], [0.4, 0.4, 0.8, 0.4, 0.6, 0.4, 8, 1, 1, 0],
      [0.8, 1, 0.9, 0.6, 0.8, 0.6, 1, 2, 2, 1], [0.2, 0.2, 0.7, 0.4, 0.6, 0.4, 2, 1, 0, 0], [1, 1, 0.9, 0.6, 0.8, 0.8, 0, 2, 2, 1],
      [0.4, 0.8, 0.8, 0.4, 0.6, 0.6, 9, 0, 0, 0], [0.8, 1, 0.9, 0.6, 0.8, 0.6, 1, 2, 2, 1], [0.4, 0.8, 0.7, 0.4, 0.6, 0.4, 2, 1, 0, 0],
      [1, 1, 0.9, 0.6, 0.8, 0.6, 0, 2, 2, 1], [0.8, 0.8, 0.7, 0.4, 0.6, 0.4, 10, 0, 0, 0], [0.8, 1, 0.9, 0.6, 0.8, 0.6, 1, 2, 2, 1],
      [0.8, 0.8, 0.8, 0.4, 0.6, 0.6, 8, 0, 0, 0], [1, 1, 0.8, 0.6, 0.8, 0.6, 2, 2, 2, 0], [1, 0.8, 0.8, 0.4, 0.6, 0.4, 11, 0, 0, 0]
    ];
    var students = rows.map(function (r, i) {
      var mk = function (skill, acc, n) { return { skill: skill, correct: Math.round(acc * n), total: n }; };
      return {
        id: 's' + (i + 1), name: NAMES[i], joinedAt: t - 14 * DAY, lastActiveAt: t - r[6] * DAY, targetDone: !!r[9],
        listening: { opened: r[7], completed: r[8] },
        results: [mk('past_tense', r[0], 5), mk('past_questions', r[1], 5), mk('vocab_a2', r[2], 10), mk('listening_detail', r[3], 5), mk('reading_inference', r[4], 5), mk('speaking', r[5], 5)]
      };
    });
    return { id: uid('cls'), code: makeClassCode(), name: 'English A2', level: 'A2', createdAt: t - 14 * DAY, week: 2, students: students, sessions: [], demo: true };
  }

  // ---- analisis --------------------------------------------------------------------------
  function skillAcc(student, skill) {
    var rows = student.results.filter(function (r) { return r.skill === skill; });
    var c = 0, n = 0; rows.forEach(function (r) { c += r.correct; n += r.total; });
    return n ? c / n : null;
  }
  function areaOf(skill) { return skill === 'speaking' ? 'speaking' : bank().SKILLS[skill] ? bank().SKILLS[skill].area : null; }
  function classSkillMap(cls) {
    var B = bank(), areas = ['grammar', 'vocabulary', 'reading', 'listening', 'speaking'], out = [];
    areas.forEach(function (area) {
      var c = 0, n = 0;
      cls.students.forEach(function (s) { s.results.forEach(function (r) { if (areaOf(r.skill) === area) { c += r.correct; n += r.total; } }); });
      var acc = n ? c / n : null;
      out.push({ area: area, label: B.AREAS[area], acc: acc, meaning: meaningFor(area, acc), action: actionFor(area, acc) });
    });
    return out;
  }
  function meaningFor(area, acc) {
    if (acc == null) return t('tac.belum-ada-bukti', 'Belum ada bukti — belum diukur.');
    if (acc >= 0.75) return 'Stabil untuk level ini; cukup dijaga lewat review ringan.';
    if (acc >= 0.6) return 'Sedang berkembang; butuh latihan terarah pada pola yang tertukar.';
    return 'Perlu review; ini prioritas minggu ini.';
  }
  function actionFor(area, acc) {
    var map = { grammar: 'mini lesson Past Questions 10 menit + 5 soal lanjutan', vocabulary: 'flashcard konteks 10 kata/hari', reading: 'satu teks pendek + 3 pertanyaan inference', listening: 'sesi listening pendek, transcript setelah percobaan pertama', speaking: 'satu sesi bicara 2 menit dengan target kata' };
    if (acc == null) return 'Jalankan diagnostic ' + map[area].split(' ')[0] + ' dulu.';
    return acc >= 0.75 ? 'Pertahankan: ' + map[area] + ' seminggu sekali.' : 'Berikan ' + map[area] + '.';
  }
  /** Prioritas minggu ini: area terlemah + skill spesifik yang paling banyak murid tertukar. */
  function priorityAreas(cls) {
    var B = bank(), areas = classSkillMap(cls).filter(function (r) { return r.acc != null; }).sort(function (a, b) { return a.acc - b.acc; });
    if (!areas.length) return [];
    var first = areas[0], out = [{ area: first.area, label: first.label + (first.area === 'listening' ? ' detail' : ''), acc: first.acc }];
    var skill = B.SKILL_ORDER.filter(function (id) { return B.SKILLS[id].area !== first.area; })
      .map(function (id) { return { id: id, count: weakStudents(cls, id).length }; })
      .sort(function (a, b) { return b.count - a.count; })[0];
    if (skill && skill.count >= 3) out.push({ area: B.SKILLS[skill.id].area, label: B.SKILLS[skill.id].short, acc: null, count: skill.count });
    else if (areas[1]) out.push({ area: areas[1].area, label: areas[1].label, acc: areas[1].acc });
    return out;
  }
  function weakStudents(cls, skill, threshold) {
    return cls.students.filter(function (s) { var a = skillAcc(s, skill); return a != null && a < (threshold == null ? 0.5 : threshold); });
  }
  function inactiveStudents(cls, now) { return cls.students.filter(function (s) { return (now || Date.now()) - s.lastActiveAt > 5 * DAY; }); }
  function activeStudents(cls, now) { return cls.students.filter(function (s) { return (now || Date.now()) - s.lastActiveAt <= 7 * DAY; }); }

  function interventionQueue(cls) {
    var B = bank(), q = [], now = Date.now();
    var pq = weakStudents(cls, 'past_questions'), pt = weakStudents(cls, 'past_tense');
    if (pq.length >= 3) q.push({ id: 'iq-pq', count: pq.length, title: pq.length + ' murid sering salah menggunakan “did + verb”', names: pq.map(function (s) { return s.name; }), action: 'Berikan mini lesson Past Questions', minutes: 10, followUp: 'Latihan lanjutan: 5 soal', skills: ['past_questions'] });
    if (pt.length >= 3) q.push({ id: 'iq-pt', count: pt.length, title: pt.length + ' dari ' + cls.students.length + ' murid masih salah pada past tense', names: pt.map(function (s) { return s.name; }), action: 'Mini lesson Past Simple + 10 soal review', minutes: 12, followUp: 'Target: membedakan verb 1 dan verb 2 saat ada penanda waktu', skills: ['past_tense', 'past_questions'] });
    var unfinished = cls.students.filter(function (s) { return s.listening && s.listening.opened > s.listening.completed; });
    if (unfinished.length) q.push({ id: 'iq-ls', count: unfinished.length, title: unfinished.length + ' murid membuka listening, tetapi tidak menyelesaikannya', names: unfinished.map(function (s) { return s.name; }), action: t('tac.kirim-listening', 'Kirim sesi listening pendek'), minutes: 6, followUp: t('tac.aktifkan-transcript', 'Aktifkan transcript setelah percobaan pertama'), skills: ['listening_detail'] });
    var ld = weakStudents(cls, 'listening_detail', 0.6);
    if (ld.length >= 3) q.push({ id: 'iq-ld', count: ld.length, title: ld.length + ' murid belum stabil menangkap detail dialog', names: ld.map(function (s) { return s.name; }), action: 'Sesi listening detail 5 soal', minutes: 6, followUp: 'Fokus kata kunci setelah pertanyaan (waktu, jumlah, tempat)', skills: ['listening_detail'] });
    var ri = weakStudents(cls, 'reading_inference', 0.6);
    if (ri.length >= 3) q.push({ id: 'iq-ri', count: ri.length, title: ri.length + ' murid memilih jawaban literal pada soal inference', names: ri.map(function (s) { return s.name; }), action: 'Review Reading inference 5 soal', minutes: 7, followUp: 'Minta murid menyebut petunjuk teks sebelum menjawab', skills: ['reading_inference'] });
    var away = inactiveStudents(cls, now);
    if (away.length) q.push({ id: 'iq-away', count: away.length, title: away.length + ' murid belum kembali belajar lebih dari 5 hari', names: away.map(function (s) { return s.name; }), action: t('tac.kirim-pengingat', 'Kirim pengingat suportif + satu sesi 5 menit'), minutes: 5, followUp: 'Mulai dari skill yang sudah cukup kuat agar percaya diri kembali', skills: ['vocab_a2'] });
    return q;
  }

  function studentRecommendation(s, now) {
    var B = bank(), strengths = [], review = [], growing = [];
    B.SKILL_ORDER.forEach(function (id) {
      var a = skillAcc(s, id); if (a == null) return;
      if (a >= 0.75) strengths.push(B.SKILLS[id].short); else if (a < 0.5) review.push(B.SKILLS[id].short); else growing.push(B.SKILLS[id].short);
    });
    var inactive = (now || Date.now()) - s.lastActiveAt > 5 * DAY;
    var status = inactive ? 'away' : review.length >= 2 ? 'unstable' : review.length === 1 ? 'light' : growing.length ? 'growing' : 'stable';
    var grammarWeak = review.filter(function (r) { return /Past/.test(r); }).length;
    var parts = [];
    if (grammarWeak) parts.push((grammarWeak >= 2 ? 10 : 8) + ' soal grammar');
    if (review.indexOf('Listening detail') !== -1 || (s.listening && s.listening.opened > s.listening.completed)) parts.push('1 listening pendek');
    if (review.indexOf('Vocabulary A2') !== -1) parts.push('10 flashcard konteks');
    if (review.indexOf('Reading inference') !== -1) parts.push('1 teks pendek + 3 inference');
    if (!parts.length) parts.push(inactive ? 'satu sesi 5 menit dari skill terkuat' : '5 soal campuran untuk menjaga ritme');
    return { strengths: strengths, review: review, growing: growing, suggestion: parts.join(' + '), status: status, statusLabel: STATUS[status], inactiveDays: Math.floor(((now || Date.now()) - s.lastActiveAt) / DAY) };
  }

  // Tren 4 minggu per skill. Bila kelas menyimpan snapshot mingguan (cls.weeklyCoverage),
  // pakai data nyata; kalau belum ada (mis. kelas demo), susun estimasi deterministik yang
  // berakhir di coverage saat ini — ditandai jelas sebagai estimasi, bukan riwayat palsu.
  function classWeeklyTrend(cls) {
    var map = classSkillMap(cls), real = Array.isArray(cls.weeklyCoverage) && cls.weeklyCoverage.length >= 2;
    return map.map(function (m, idx) {
      var cur = m.acc == null ? 0 : m.acc, points;
      if (real) {
        points = cls.weeklyCoverage.slice(-4).map(function (w) { return Math.round(((w[m.area] == null ? cur : w[m.area])) * 100); });
      } else {
        var jitter = ((m.label.charCodeAt(0) + idx * 7) % 5) / 100;
        points = [cur - 0.14 + jitter, cur - 0.09, cur - 0.04 - jitter, cur].map(function (v) { return Math.max(5, Math.min(100, Math.round(v * 100))); });
      }
      var delta = points[points.length - 1] - points[0];
      return { area: m.area, label: m.label, points: points, delta: delta, current: points[points.length - 1], estimate: !real };
    });
  }

  function weeklyReport(cls, now) {
    var t = now || Date.now(), B = bank(), active = activeStudents(cls, t), done = cls.students.filter(function (s) { return s.targetDone; });
    var prio = priorityAreas(cls), pt = weakStudents(cls, 'past_tense'), away = inactiveStudents(cls, t);
    var minutesSaved = cls.students.length * 3 + 20 + (interventionQueue(cls).length * 8);
    var queue = interventionQueue(cls);
    var rec = pt.length >= 3 ? 'buat satu sesi review ' + B.buildSession({ skills: ['past_questions', 'past_tense'], count: 10 }).minutes + ' menit (mini lesson Past Questions + review past tense)'
      : queue.length ? 'buat satu sesi review ' + (B.buildSession({ skills: queue[0].skills }).minutes) + ' menit: ' + queue[0].action.toLowerCase() : 'pertahankan ritme dengan satu sesi review ringan 8 menit';
    return {
      week: cls.week || 1, registered: cls.students.length, active: active.length, targetDone: done.length,
      priority: prio.map(function (p) { return p.label; }),
      pastTenseReview: pt.length, away: away.map(function (s) { return s.name; }), minutesSaved: minutesSaved, recommendation: rec, sessionsSent: cls.sessions.length
    };
  }

  function reportText(cls, anonymous) {
    var r = weeklyReport(cls), lines = [
      'Laporan Minggu ' + r.week + ' — ' + (anonymous ? 'Kelas ' + cls.level : cls.name),
      r.registered + ' murid terdaftar · ' + r.active + ' murid aktif · ' + r.targetDone + ' murid menyelesaikan target',
      'Skill prioritas: ' + r.priority.join(', ').toLowerCase() + ' · ' + r.pastTenseReview + ' murid memerlukan review past tense',
      anonymous ? t('tac.belum-kembali', 'Belum kembali belajar:') + ' ' + r.away.length + ' murid' : t('tac.belum-kembali', 'Belum kembali belajar:') + ' ' + (r.away.length ? r.away.join(', ') : '—'),
      'Sesi review terkirim: ' + r.sessionsSent + ' · Estimasi waktu tutor yang dihemat: ±' + r.minutesSaved + ' menit',
      'Rekomendasi minggu depan: ' + r.recommendation
    ];
    return lines.join('\n');
  }
  function csvText(cls, anonymous) {
    var head = ['murid', 'status', 'kekuatan', 'perlu_review', 'saran', 'hari_sejak_aktif', 'target_selesai'];
    var rows = cls.students.map(function (s, i) {
      var rec = studentRecommendation(s);
      return [anonymous ? 'Murid ' + (i + 1) : s.name, rec.statusLabel, rec.strengths.join('; '), rec.review.join('; '), rec.suggestion, rec.inactiveDays, s.targetDone ? 'ya' : 'belum'];
    });
    return [head].concat(rows).map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  }
  function printHtml(cls, anonymous) {
    var r = weeklyReport(cls), map = classSkillMap(cls), queue = interventionQueue(cls);
    return '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan FIEZEL</title><style>body{font-family:system-ui,sans-serif;color:#241A11;padding:32px;max-width:760px;margin:auto}h1{font-size:22px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left;font-size:13px}small{color:#6E5E47}</style></head><body>' +
      '<h1>' + esc(anonymous ? 'Laporan Kelas ' + cls.level : 'Laporan ' + cls.name) + ' — Minggu ' + r.week + '</h1><small>Dibuat ' + new Date().toISOString().slice(0, 10) + ' · FIEZEL Tutor Action Center · agregat, tanpa audio/transcript mentah</small>' +
      '<h2>Ringkasan</h2><pre style="white-space:pre-wrap">' + esc(reportText(cls, anonymous)) + '</pre>' +
      '<h2>Peta kemampuan kelas</h2><table><tr><th>Skill</th><th>Coverage</th><th>Arti</th><th>Tindakan</th></tr>' + map.map(function (m) { return '<tr><td>' + esc(m.label) + '</td><td>' + pct(m.acc) + '</td><td>' + esc(m.meaning) + '</td><td>' + esc(m.action) + '</td></tr>'; }).join('') + '</table>' +
      '<h2>Antrian intervensi</h2><ul>' + queue.map(function (q) { return '<li><b>' + esc(q.title) + '</b> → ' + esc(q.action) + ' · ' + q.minutes + ' menit · ' + esc(q.followUp) + '</li>'; }).join('') + '</ul>' +
      (anonymous ? '' : '<h2>Rekomendasi per murid</h2><table><tr><th>' + t('umum.murid', 'Murid') + '</th><th>' + t('umum.status', 'Status') + '</th><th>Perlu review</th><th>Saran</th></tr>' + cls.students.map(function (s) { var rc = studentRecommendation(s); return '<tr><td>' + esc(s.name) + '</td><td>' + esc(rc.statusLabel) + '</td><td>' + esc(rc.review.join(', ') || '—') + '</td><td>' + esc(rc.suggestion) + '</td></tr>'; }).join('') + '</table>') +
      '</body></html>';
  }

  /** Impor kode hasil dari learner (FiezelLearnerFlow.tutorCode). */
  function parseLearnerCode(code) {
    try {
      var payload = JSON.parse(decodeURIComponent(escape(atob(String(code || '').trim()))));
      if (!payload || payload.v !== 1 || !payload.skills) return null;
      var results = Object.keys(payload.skills).map(function (k) { return { skill: k, correct: Number(payload.skills[k].c) || 0, total: Number(payload.skills[k].t) || 0 }; });
      return { id: uid('s'), name: String(payload.name || t('umum.murid', 'Murid')).slice(0, 24), joinedAt: Date.now(), lastActiveAt: Number(payload.at) || Date.now(), targetDone: (payload.lessons || 0) >= 3, listening: { opened: 0, completed: 0 }, results: results, goal: payload.goal || null, cls: normalizeClassCode(payload.cls) || null };
    } catch (_) { return null; }
  }

  // ---- render ----------------------------------------------------------------------------
  var mountEl = null, env = {}, st = null;
  function cls() { return st.classes.filter(function (c) { return c.id === st.activeClassId; })[0] || null; }

  function mount(el, options) {
    mountEl = el; env = options || {}; st = load();
    if (!cls() && st.classes.length) st.activeClassId = st.classes[0].id;
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    el.addEventListener('change', onChange);
    render();
  }

  function render() {
    if (!mountEl) return;
    var c = cls();
    mountEl.innerHTML = '<section class="tac" data-testid="tutor-action-center">' + header(c) + (c ? body(c) : emptyState()) + '</section>';
    if (env.afterRender) try { env.afterRender(); } catch (_) {}
  }

  function header(c) {
    return '<header class="tac-head"><div><p class="tac-kicker">Tutor Action Center</p><h1>Dari pola kesalahan ke rencana mengajar</h1><p class="tac-muted">Data jawaban murid dibaca otomatis menjadi tindakan yang jelas — bukan sekadar grafik.</p></div>' +
      '<div class="tac-class-picker">' + (st.classes.length ? '<select data-tac-select="class" data-testid="tac-class-select">' + st.classes.map(function (k) { return '<option value="' + k.id + '"' + (c && k.id === c.id ? ' selected' : '') + '>' + esc(k.name) + ' · ' + k.students.length + ' murid</option>'; }).join('') + '</select>' : '') +
      '<button type="button" class="tac-ghost" data-tac="new-class" data-testid="tac-new-class">' + t('tac.kelas-baru-btn', '+ Kelas baru') + '</button></div></header>' +
      (c ? '<div class="tac-classcode" data-testid="tac-class-code"><div><small>Kode kelas — murid ketik saat onboarding</small><b>' + esc(ensureClassCode(c)) + '</b></div><button type="button" class="tac-mini" data-tac="copy-code" data-testid="tac-copy-class-code">Salin kode</button><p class="tac-muted">Hasil diagnostic murid yang memakai kode ini otomatis masuk ke kelas ini.</p></div>' : '') +
      (st.creating || !st.classes.length ? createClassForm() : '');
  }
  function createClassForm() {
    return '<form class="tac-card tac-form" data-tac-form="create-class" data-testid="tac-create-form"><h2>' + t('tac.buat-kelas', 'Buat kelas') + '</h2><div class="tac-row"><label>' + t('tac.nama-kelas', 'Nama kelas') + '<input name="name" required placeholder="English A2 — Kelas 10" data-testid="tac-class-name"></label>' +
      '<label>Level<select name="level" data-testid="tac-class-level"><option>A1</option><option selected>A2</option><option>B1</option><option>B2</option></select></label></div>' +
      '<div class="tac-actions"><button type="submit" class="tac-primary" data-testid="tac-create-submit">' + t('tac.buat-kelas-kosong', 'Buat kelas kosong') + '</button><button type="button" class="tac-ghost" data-tac="seed-demo" data-testid="tac-seed-demo">Muat kelas demo (English A2, 18 murid)</button>' + (st.classes.length ? '<button type="button" class="tac-ghost" data-tac="cancel-create">' + t('umum.batal', 'Batal') + '</button>' : '') + '</div>' +
      '<p class="tac-muted">Alur: tutor membuat kelas → murid mengerjakan diagnostic → sistem membaca pola kesalahan → tutor melihat masalah utama → FIEZEL menyarankan review → tutor mengirim latihan → laporan mingguan otomatis.</p></form>';
  }
  function emptyState() { return ''; }

  function isoWeek(now) {
    var d = new Date(now || Date.now()); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var w1 = new Date(d.getFullYear(), 0, 4);
    return d.getFullYear() + '-W' + (1 + Math.round(((d - w1) / DAY - 3 + ((w1.getDay() + 6) % 7)) / 7));
  }
  // Snapshot coverage per minggu (sekali per ISO-minggu) → tren kelas menjadi riwayat nyata.
  function snapshotWeek(c) {
    if (!c || !c.students.length) return false;
    var wk = isoWeek(), list = Array.isArray(c.weeklyCoverage) ? c.weeklyCoverage : (c.weeklyCoverage = []);
    var row = { week: wk };
    classSkillMap(c).forEach(function (m) { if (m.acc != null) row[m.area] = Math.round(m.acc * 1000) / 1000; });
    var last = list[list.length - 1];
    if (last && last.week === wk) { Object.assign(last, row); return false; }
    list.push(row); if (list.length > 8) list.splice(0, list.length - 8);
    return true;
  }

  function body(c) {
    if (snapshotWeek(c)) save(st);
    var tabs = [['map', 'Peta kelas'], ['trend', 'Tren kelas'], ['queue', 'Antrian intervensi'], ['session', t('tac.buat-sesi-review', 'Buat sesi review')], ['students', 'Per murid'], ['report', 'Laporan mingguan']];
    return headline(c) + '<nav class="tac-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" class="tac-tab' + (st.tab === t[0] ? ' is-active' : '') + '" data-tac="tab" data-tab="' + t[0] + '" data-testid="tac-tab-' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>' +
      ({ map: mapView, trend: trendView, queue: queueView, session: sessionView, students: studentsView, report: reportView })[st.tab](c);
  }

  function sparkline(points) {
    var w = 220, h = 56, pad = 6, max = 100, n = points.length;
    var xy = points.map(function (v, i) { return [pad + i * ((w - 2 * pad) / (n - 1)), h - pad - (v / max) * (h - 2 * pad)]; });
    var line = xy.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = 'M' + xy[0][0].toFixed(1) + ' ' + (h - pad) + ' ' + xy.map(function (p) { return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + ' L' + xy[n - 1][0].toFixed(1) + ' ' + (h - pad) + ' Z';
    var dots = xy.map(function (p, i) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (i === n - 1 ? 3.5 : 2) + '"/>'; }).join('');
    return '<svg class="tac-spark" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" aria-hidden="true"><path class="tac-spark-area" d="' + area + '"/><path class="tac-spark-line" d="' + line + '"/>' + dots + '</svg>';
  }
  function trendView(c) {
    if (!c.students.length) return '<div class="tac-card"><h2>Tren kelas</h2><p class="tac-muted">' + t('tac.belum-murid-diagnostic', 'Belum ada murid — tambahkan hasil diagnostic dulu.') + '</p></div>';
    var rows = classWeeklyTrend(c), est = rows.some(function (r) { return r.estimate; });
    return '<div class="tac-card" data-testid="tac-trend"><h2>Tren kelas — 4 minggu terakhir</h2>' +
      '<p class="tac-muted">Arah coverage tiap skill dari minggu ke minggu. ' + (est ? 'Angka ini <b>estimasi</b> dari coverage kelas saat ini (kelas demo belum punya riwayat mingguan nyata).' : 'Berdasarkan snapshot mingguan kelas.') + '</p>' +
      '<div class="tac-trend-grid">' + rows.map(function (r) {
        var dir = r.delta > 1 ? 'up' : r.delta < -1 ? 'down' : 'flat', arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
        return '<div class="tac-trend-card is-' + dir + '" data-testid="tac-trend-' + r.area + '"><div class="tac-trend-head"><b>' + esc(r.label) + '</b><span class="tac-trend-delta">' + arrow + ' ' + (r.delta >= 0 ? '+' : '') + r.delta + '%</span></div>' +
          sparkline(r.points) + '<div class="tac-trend-foot"><small>M1 ' + r.points[0] + '% → M' + r.points.length + ' ' + r.current + '%</small><em>' + (dir === 'up' ? 'membaik' : dir === 'down' ? 'perlu perhatian' : 'stabil') + '</em></div></div>';
      }).join('') + '</div>' +
      '<p class="tac-muted">' + t('tac.panah-turun-prioritas', 'Skill dengan panah turun adalah prioritas: buat sesi review dari tab “Buat sesi review”.') + '</p></div>';
  }

  function headline(c) {
    var B = bank(), pt = weakStudents(c, 'past_tense'), q = interventionQueue(c)[0];
    if (!c.students.length) return '<div class="tac-card tac-hero"><h2>' + t('tac.belum-ada-murid', 'Belum ada murid') + '</h2><p class="tac-muted">Tambahkan murid dari kode hasil learner (tab Per murid) atau muat kelas demo.</p></div>';
    var s = pt.length >= 3 ? B.buildSession({ skills: ['past_questions', 'past_tense'], count: 10 }) : q ? B.buildSession({ skills: q.skills }) : null;
    var target = pt.length >= 3 ? 'membedakan did + verb 1 dan bentuk verb 2' : q ? B.SKILLS[q.skills[0]].objective : '';
    return '<div class="tac-card tac-hero" data-testid="tac-headline"><p class="tac-kicker">60 detik</p>' +
      '<h2>Sistem menemukan: ' + (pt.length ? pt.length + ' dari ' + c.students.length + ' murid masih salah pada past tense.' : (q ? q.title + '.' : 'belum ada pola kesalahan yang menonjol.')) + '</h2>' +
      (s ? '<p><b>FIEZEL menyarankan:</b> ' + esc(s.title) + ' · ' + s.itemIds.length + ' soal review · Durasi ' + s.minutes + ' menit · Target: ' + esc(target) + '</p>' +
        '<div class="tac-actions"><button type="button" class="tac-primary" data-tac="quick-session" data-skills="' + s.skills.join(',') + '" data-testid="tac-quick-session">' + t('tac.buat-sesi-review', 'Buat sesi review') + '</button></div>' : '') + '</div>';
  }

  function mapView(c) {
    var map = classSkillMap(c), prio = priorityAreas(c);
    return '<div class="tac-card" data-testid="tac-skill-map"><h2>Peta kemampuan kelas — ' + esc(c.name) + ', ' + c.students.length + ' murid</h2>' +
      '<p class="tac-priority" data-testid="tac-priority"><b>Prioritas minggu ini:</b> ' + esc(prio.map(function (p) { return p.label.toLowerCase(); }).join(' dan ') || '—') + '</p>' +
      '<table class="tac-table"><thead><tr><th>Skill</th><th>Coverage</th><th>Arti</th><th>Tindakan yang disarankan</th></tr></thead><tbody>' + map.map(function (m) {
        var lvl = m.acc == null ? 'none' : m.acc >= 0.75 ? 'good' : m.acc >= 0.6 ? 'mid' : 'low';
        return '<tr class="is-' + lvl + '" data-testid="tac-map-' + m.area + '"><td><b>' + esc(m.label) + '</b></td><td><span class="tac-bar" style="--v:' + (m.acc == null ? 0 : Math.round(m.acc * 100)) + '%"><i></i></span><em>' + pct(m.acc) + '</em></td><td>' + esc(m.meaning) + '</td><td>' + esc(m.action) + '</td></tr>';
      }).join('') + '</tbody></table><p class="tac-muted">Angka adalah coverage jawaban tepat pada latihan, bukan klaim penguasaan.</p></div>';
  }

  function queueView(c) {
    var q = interventionQueue(c);
    return '<div class="tac-card" data-testid="tac-queue"><h2>Antrian intervensi tutor</h2>' + (q.length ? '<ol class="tac-queue">' + q.map(function (it) {
      return '<li data-testid="tac-queue-' + it.id + '"><div class="tac-queue-main"><b>' + esc(it.title) + '</b><small>' + esc(it.names.slice(0, 6).join(', ')) + (it.names.length > 6 ? ' +' + (it.names.length - 6) : '') + '</small>' +
        '<p>→ ' + esc(it.action) + ' · Durasi: ' + it.minutes + ' menit · ' + esc(it.followUp) + '</p></div>' +
        '<button type="button" class="tac-mini" data-tac="quick-session" data-skills="' + it.skills.join(',') + '" data-testid="tac-queue-build-' + it.id + '">' + t('tac.buat-sesi-review', 'Buat sesi review') + '</button></li>';
    }).join('') + '</ol>' : '<p class="tac-muted">' + t('tac.belum-ada-pola', 'Belum ada pola yang cukup kuat untuk intervensi. Tambahkan hasil diagnostic murid.') + '</p>') + '</div>';
  }

  function sessionView(c) {
    var B = bank(), s = st.session;
    return '<div class="tac-card" data-testid="tac-session-builder"><h2>' + t('tac.buat-sesi-review', 'Buat sesi review') + '</h2><p class="tac-muted">Pilih masalah, sistem menyusun 5–10 soal beserta tujuan pembelajaran, estimasi durasi, urutan latihan, dan penjelasan pasca-sesi. Tidak perlu menyusun soal dari nol.</p>' +
      '<div class="tac-picks">' + PROBLEMS.map(function (p) { return '<label class="tac-pick' + (st.picked.indexOf(p.id) !== -1 ? ' is-on' : '') + '"><input type="checkbox" data-tac-pick="' + p.id + '" data-testid="tac-pick-' + p.id + '"' + (st.picked.indexOf(p.id) !== -1 ? ' checked' : '') + '>' + esc(p.label) + '</label>'; }).join('') + '</div>' +
      '<div class="tac-actions"><button type="button" class="tac-primary" data-tac="build-session" data-testid="tac-build-session"' + (st.picked.length ? '' : ' disabled') + '>Susun sesi</button></div>' +
      (s ? sessionPreview(c, s) : '') + '</div>' +
      (c.sessions.length ? '<div class="tac-card"><h3>Latihan terkirim</h3><ul class="tac-list">' + c.sessions.slice().reverse().map(function (x) { return '<li><b>' + esc(x.title) + '</b><small>' + x.itemIds.length + ' soal · ' + x.minutes + ' menit · ' + new Date(x.sentAt).toLocaleDateString('id-ID') + '</small></li>'; }).join('') + '</ul></div>' : '');
  }
  function sessionPreview(c, s) {
    var B = bank();
    return '<div class="tac-session" data-testid="tac-session-preview"><h3>' + esc(s.title) + '</h3><p class="tac-muted">' + s.itemIds.length + ' soal · estimasi ' + s.minutes + ' menit</p>' +
      '<h4>Tujuan pembelajaran</h4><ul>' + s.objectives.map(function (o) { return '<li>' + esc(o.text) + '</li>'; }).join('') + '</ul>' +
      '<h4>Urutan latihan</h4><ol>' + s.order.map(function (o) { return '<li>' + esc(o.title) + ' — ' + o.count + ' soal · ' + o.minutes + ' menit</li>'; }).join('') + '</ol>' +
      '<h4>' + t('umum.soal', 'Soal') + '</h4><ol class="tac-items">' + s.itemIds.map(function (id) { var it = B.byId(id); return '<li>' + esc(it.prompt) + ' <small>(' + esc(it.options[it.answer]) + ')</small></li>'; }).join('') + '</ol>' +
      '<h4>Penjelasan & rekomendasi setelah sesi</h4><ul>' + s.afterSession.map(function (a) { return '<li>' + esc(a.text) + '</li>'; }).join('') + '</ul>' +
      '<div class="tac-actions"><button type="button" class="tac-primary" data-tac="send-session" data-testid="tac-send-session">' + t('tac.kirim-latihan', 'Kirim latihan ke kelas') + '</button><button type="button" class="tac-ghost" data-tac="copy-session" data-testid="tac-copy-session">Salin ringkasan sesi</button></div>' +
      '<p class="tac-muted">Latihan yang dikirim muncul di Today Plan murid sebagai “Latihan dari tutor”.</p></div>';
  }

  function studentsView(c) {
    var recs = c.students.map(function (s) { return { s: s, r: studentRecommendation(s) }; });
    var counts = {}; recs.forEach(function (x) { counts[x.r.status] = (counts[x.r.status] || 0) + 1; });
    var filter = st.studentFilter || 'all';
    var chips = [['all', 'Semua', recs.length]].concat(['unstable', 'light', 'away', 'growing', 'stable'].map(function (k) { return [k, STATUS[k], counts[k] || 0]; }));
    var shown = recs.filter(function (x) { return filter === 'all' || x.r.status === filter; });
    return '<div class="tac-card" data-testid="tac-students"><h2>Rekomendasi per murid</h2><p class="tac-muted">Bahasa suportif: “perlu review”, “belum stabil”, “sedang berkembang” — bukan label murid lemah/gagal.</p>' +
      '<div class="tac-filters" role="tablist" data-testid="tac-student-filters">' + chips.map(function (ch) { return '<button type="button" class="tac-filter' + (filter === ch[0] ? ' is-on' : '') + '" data-tac="filter" data-filter="' + ch[0] + '" data-testid="tac-filter-' + ch[0] + '"' + (ch[2] === 0 && ch[0] !== 'all' ? ' disabled' : '') + '>' + esc(ch[1]) + ' <em>' + ch[2] + '</em></button>'; }).join('') + '</div>' +
      (shown.length ? '<ul class="tac-students">' + shown.map(function (x) {
        var s = x.s, r = x.r;
        return '<li class="is-' + r.status + '" data-testid="tac-student-' + s.id + '"><div class="tac-student-head"><b>' + esc(s.name) + '</b><span class="tac-status">' + esc(r.statusLabel) + '</span></div>' +
          '<p><b>Kekuatan:</b> ' + esc(r.strengths.join(', ') || 'belum ada bukti') + ' · <b>Perlu review:</b> ' + esc(r.review.join(', ') || '—') + '</p>' +
          '<p><b>Saran:</b> ' + esc(r.suggestion) + (r.status === 'away' ? ' · terakhir aktif ' + r.inactiveDays + ' hari lalu' : '') + '</p></li>';
      }).join('') + '</ul>' : '<p class="tac-muted" data-testid="tac-students-empty">Tidak ada murid dengan status ini.</p>') + '</div>' +
      '<form class="tac-card tac-form" data-tac-form="add-student" data-testid="tac-add-student-form"><h3>' + t('tac.tambah-murid-kode', 'Tambah murid dari kode hasil') + '</h3><p class="tac-muted">' + t('tac.murid-menyalin-kode', 'Murid menyalin kode dari Belajar hari ini → Ringkasan. Kode hanya berisi nama depan + akurasi per skill.') + '</p>' +
      '<textarea name="code" rows="2" placeholder="Tempel kode hasil di sini" data-testid="tac-student-code"></textarea>' +
      '<div class="tac-actions"><button type="submit" class="tac-primary" data-testid="tac-add-student-submit">' + t('tac.tambah-murid', 'Tambah murid') + '</button></div></form>';
  }

  function reportView(c) {
    var r = weeklyReport(c), pv = st.preview;
    return '<div class="tac-card" data-testid="tac-report"><h2>Laporan Minggu ' + r.week + '</h2>' +
      '<div class="tac-stats"><div><b>' + r.registered + '</b><small>murid terdaftar</small></div><div><b>' + r.active + '</b><small>murid aktif</small></div><div><b>' + r.targetDone + '</b><small>menyelesaikan target</small></div><div><b>±' + r.minutesSaved + '</b><small>menit tutor dihemat</small></div></div>' +
      '<pre class="tac-report-text" data-testid="tac-report-text">' + esc(reportText(c, false)) + '</pre>' +
      '<div class="tac-privacy"><div><h4>Boleh ditampilkan</h4><ul><li>Progress agregat</li><li>Completion & skill coverage</li><li>Pola kesalahan & rekomendasi review</li></ul></div><div><h4>Sebaiknya tidak disimpan</h4><ul><li>Raw audio</li><li>Transcript mentah</li><li>' + t('tac.speaking-sensitif', 'Jawaban speaking yang sensitif') + '</li><li>' + t('tac.nama-lengkap', 'Nama lengkap jika tidak diperlukan') + '</li></ul></div></div>' +
      '<div class="tac-actions"><button type="button" class="tac-ghost" data-tac="preview" data-kind="pdf" data-testid="tac-export-pdf">Export PDF</button><button type="button" class="tac-ghost" data-tac="preview" data-kind="csv" data-testid="tac-export-csv">Export CSV</button><button type="button" class="tac-ghost" data-tac="preview" data-kind="anon" data-testid="tac-export-anon">Ringkasan anonim</button></div>' +
      (pv ? '<div class="tac-preview" data-testid="tac-export-preview"><h4>Pratinjau sebelum dibagikan — ' + esc(pv.label) + '</h4><pre>' + esc(pv.text.length > 1800 ? pv.text.slice(0, 1800) + '\n…' : pv.text) + '</pre><div class="tac-actions"><button type="button" class="tac-primary" data-tac="confirm-export" data-testid="tac-confirm-export">' + esc(pv.cta) + '</button><button type="button" class="tac-ghost" data-tac="cancel-preview">' + t('umum.batal', 'Batal') + '</button></div></div>' : '') + '</div>';
  }

  // ---- events ----------------------------------------------------------------------------
  function toast(m) { if (env.toast) try { env.toast(m); } catch (_) {} }
  function copy(text, msg) { var done = function () { toast(msg || 'Tersalin.'); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done(); }
  function download(name, text, type) { var blob = new Blob([text], { type: type || 'text/plain' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0); }

  function onClick(e) {
    var btn = e.target.closest('[data-tac]'); if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-tac'), c = cls(), B = bank();
    switch (act) {
      case 'tab': st.tab = btn.getAttribute('data-tab'); st.preview = null; break;
      case 'filter': st.studentFilter = btn.getAttribute('data-filter'); break;
      case 'copy-code': if (c) copy(ensureClassCode(c), 'Kode kelas ' + c.code + ' tersalin.'); return;
      case 'new-class': st.creating = true; break;
      case 'cancel-create': st.creating = false; break;
      case 'seed-demo': { var k = seedClass(); st.classes.push(k); st.activeClassId = k.id; st.creating = false; st.tab = 'map'; toast('Kelas demo dimuat: 18 murid.'); break; }
      case 'quick-session': st.picked = btn.getAttribute('data-skills').split(','); st.session = B.buildSession({ skills: st.picked, count: st.picked.length > 1 ? 10 : 5, avoid: (c && c.sentItemIds) || [], seed: Date.now() % 997 }); st.tab = 'session'; break;
      case 'build-session': st.session = B.buildSession({ skills: st.picked, avoid: (c && c.sentItemIds) || [], seed: Date.now() % 997 }); break;
      case 'send-session': {
        if (!c || !st.session) return;
        var sent = Object.assign({}, st.session, { sentAt: Date.now() });
        c.sessions.push(sent);
        c.sentItemIds = ((c.sentItemIds || []).concat(sent.itemIds)).slice(-80);
        try { var a = JSON.parse(localStorage.getItem(ASSIGN_KEY)) || []; a.push({ id: sent.id + '-' + sent.sentAt, title: sent.title, skills: sent.skills, itemIds: sent.itemIds, minutes: sent.minutes, from: c.name, at: sent.sentAt }); localStorage.setItem(ASSIGN_KEY, JSON.stringify(a.slice(-5))); } catch (_) {}
        toast('Latihan dikirim ke ' + c.name + '. Muncul di Today Plan murid.');
        st.session = null; st.picked = [];
        break;
      }
      case 'copy-session': { var s = st.session; if (!s) return; copy(s.title + '\n' + s.itemIds.length + ' soal · ' + s.minutes + ' menit\nTujuan:\n' + s.objectives.map(function (o) { return '- ' + o.text; }).join('\n') + '\nUrutan:\n' + s.order.map(function (o) { return o.step + '. ' + o.title + ' (' + o.count + ' soal, ' + o.minutes + ' mnt)'; }).join('\n'), 'Ringkasan sesi tersalin.'); return; }
      case 'preview': {
        var kind = btn.getAttribute('data-kind');
        if (kind === 'csv') st.preview = { kind: kind, label: 'CSV per murid', text: csvText(c, false), cta: 'Unduh CSV' };
        else if (kind === 'anon') st.preview = { kind: kind, label: 'Ringkasan anonim (tanpa nama)', text: reportText(c, true), cta: 'Salin ringkasan anonim' };
        else st.preview = { kind: kind, label: 'PDF laporan lengkap', text: reportText(c, false) + '\n\n+ tabel peta kemampuan, antrian intervensi, rekomendasi per murid', cta: 'Buka & cetak PDF' };
        break;
      }
      case 'cancel-preview': st.preview = null; break;
      case 'confirm-export': {
        var pv = st.preview; if (!pv) return;
        if (pv.kind === 'csv') download('fiezel-laporan-' + c.level + '-minggu' + (c.week || 1) + '.csv', pv.text, 'text/csv');
        else if (pv.kind === 'anon') copy(pv.text, 'Ringkasan anonim tersalin.');
        else { var w = window.open('', '_blank'); if (w) { w.document.write(printHtml(c, false)); w.document.close(); setTimeout(function () { try { w.print(); } catch (_) {} }, 300); } else toast('Popup diblokir — izinkan jendela baru untuk mencetak PDF.'); }
        st.preview = null; break;
      }
      default: return;
    }
    save(st); render();
  }
  function onSubmit(e) {
    var form = e.target.closest('[data-tac-form]'); if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute('data-tac-form'), fd = new FormData(form);
    if (kind === 'create-class') {
      var k = { id: uid('cls'), code: makeClassCode(), name: String(fd.get('name') || 'Kelas baru').trim().slice(0, 40), level: String(fd.get('level') || 'A2'), createdAt: Date.now(), week: 1, students: [], sessions: [] };
      st.classes.push(k); st.activeClassId = k.id; st.creating = false; st.tab = 'students'; toast(t('tac.toast-kelas-dibuat', 'Kelas dibuat. Tambahkan murid dari kode hasil.'));
    } else if (kind === 'add-student') {
      var c = cls(), s = parseLearnerCode(fd.get('code')); if (!c) return;
      if (!s) { toast('Kode hasil tidak valid.'); return; }
      var byCode = s.cls ? st.classes.filter(function (k) { return k.code === s.cls; })[0] : null;
      var target = byCode || c; target.students.push(s); toast(s.name + ' ditambahkan ke ' + target.name + (byCode ? ' (lewat kode kelas).' : '.'));
    }
    save(st); render();
  }
  function onChange(e) {
    var sel = e.target.closest('[data-tac-select="class"]');
    if (sel) { st.activeClassId = sel.value; st.session = null; st.preview = null; save(st); render(); return; }
    var pick = e.target.closest('[data-tac-pick]');
    if (pick) { var id = pick.getAttribute('data-tac-pick'); st.picked = pick.checked ? st.picked.concat([id]) : st.picked.filter(function (x) { return x !== id; }); save(st); render(); }
  }

  return { KEY: KEY, mount: mount, render: render, load: load, seedClass: seedClass, classSkillMap: classSkillMap, classWeeklyTrend: classWeeklyTrend, interventionQueue: interventionQueue, studentRecommendation: studentRecommendation, weeklyReport: weeklyReport, reportText: reportText, csvText: csvText, parseLearnerCode: parseLearnerCode, ingestLearnerResult: ingestLearnerResult, normalizeClassCode: normalizeClassCode, makeClassCode: makeClassCode, _state: function () { return st; } };
});
