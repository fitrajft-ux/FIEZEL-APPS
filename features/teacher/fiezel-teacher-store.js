/**
 * FIEZEL Ruang Guru — lapisan data & analitik (inti murni, tanpa DOM).
 * Semua data hidup di perangkat guru (localStorage). Tidak ada jawaban mentah murid,
 * hanya agregat per skill + nama depan + kontak yang guru masukkan sendiri.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelTeacherStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah modul ini dulu literal Indonesia. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }
  var root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  var KEY = 'fiezel-teacher-v1';
  var ASSIGN_KEY = 'fiezel-learner-assignments-v1';
  var DAY = 86400000;
  var SKILL_LABEL = { past_tense: 'Past tense', past_questions: 'Past questions', vocab_a2: 'Vocabulary A2', listening_detail: 'Listening detail', reading_inference: 'Reading inference', speaking: 'Speaking' };
  var SKILL_ORDER = ['past_tense', 'past_questions', 'vocab_a2', 'listening_detail', 'reading_inference', 'speaking'];
  var ATT = { H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpa' };

  function bank() { return root.FiezelReviewBank; }
  function uid(p) { return p + '-' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7); }
  function today(ts) { var d = new Date(ts || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function b64e(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function b64d(str) { return JSON.parse(decodeURIComponent(escape(atob(String(str || '').trim())))); }
  function makeClassCode() { var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = ''; for (var i = 0; i < 6; i++) out += A[Math.floor(Math.random() * A.length)]; return 'FZ-' + out; }
  function normalizeClassCode(v) { v = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v.indexOf('FZ') === 0) v = v.slice(2); return v.length === 6 ? 'FZ-' + v : ''; }
  function firstName(n) { return String(n || t('umum.murid', 'Murid')).trim().split(/\s+/)[0].slice(0, 24); }

  // ---- persist -------------------------------------------------------------------------
  function defaults() { return { schema: KEY, teacher: { name: '', school: '' }, classes: [], activeClassId: null, view: 'briefing', savedMinutes: 0, inbox: [], createdAt: Date.now() }; }
  function load() { try { var raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.schema === KEY) { var st = Object.assign(defaults(), raw); st.inbox = Array.isArray(st.inbox) ? st.inbox : []; return st; } } catch (_) {} return defaults(); }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} return st; }
  function normalizeStudent(s) {
    s.results = Array.isArray(s.results) ? s.results : [];
    s.notes = Array.isArray(s.notes) ? s.notes : [];
    s.attendance = s.attendance || {};
    s.parentPhone = s.parentPhone || '';
    s.listening = s.listening || { opened: 0, completed: 0 };
    return s;
  }
  function normalizeClass(c) {
    c.code = c.code || makeClassCode();
    c.students = (c.students || []).map(normalizeStudent);
    c.assignments = c.assignments || [];
    c.announcements = c.announcements || [];
    c.journal = c.journal || [];
    c.sentItemIds = c.sentItemIds || [];
    return c;
  }

  function newClass(name, level, subject) {
    return normalizeClass({ id: uid('cls'), code: makeClassCode(), name: String(name || 'Kelas baru').slice(0, 60), level: level || 'A2', subject: subject || 'English', createdAt: Date.now(), students: [], assignments: [], announcements: [], journal: [] });
  }
  function newStudent(name, extra) {
    return normalizeStudent(Object.assign({ id: uid('s'), name: firstName(name), joinedAt: Date.now(), lastActiveAt: null, targetDone: false, results: [], notes: [], attendance: {}, parentPhone: '' }, extra || {}));
  }

  // ---- demo -----------------------------------------------------------------------------
  function seedDemo(now) {
    var t = now || Date.now(), T = root.FiezelTutorActionCenter;
    var base = T && T.seedClass ? T.seedClass(t) : { id: uid('cls'), name: 'English A2', level: 'A2', students: [], createdAt: t - 14 * DAY };
    var c = normalizeClass(Object.assign(base, { id: uid('cls'), name: 'English A2 — Kelas 10A', subject: 'English', demo: true }));
    c.students.forEach(function (s, i) {
      s.parentPhone = i % 3 === 0 ? '62812' + String(3400000 + i * 7311).slice(0, 7) : '';
      for (var d = 0; d < 6; d++) { var key = today(t - d * DAY); var away = (t - s.lastActiveAt) / DAY > 6 && d < 2; s.attendance[key] = away ? (d === 0 ? 'A' : 'I') : (i % 11 === 0 && d === 3 ? 'S' : 'H'); }
      if (i === 0) s.notes.push({ at: t - 3 * DAY, text: 'Sering bingung penanda waktu "ago". Perlu contoh konkret dari kesehariannya.' });
      if (i === 9) s.notes.push({ at: t - 5 * DAY, text: 'Ibu bilang HP dipakai bergantian dengan kakak, jadwal belajar malam.' });
    });
    var B = bank();
    var ids1 = B ? B.pick('past_tense', 5, 11).map(function (x) { return x.id; }) : [], ids2 = B ? B.pick('listening_detail', 5, 13).map(function (x) { return x.id; }) : [];
    c.assignments.push({ id: uid('as'), title: 'Review Past Tense — penanda waktu', skills: ['past_tense'], itemIds: ids1, minutes: 6, mode: 'latihan', deadline: today(t - DAY), createdAt: t - 4 * DAY, targets: null, done: {} });
    c.assignments.push({ id: uid('as'), title: 'Ujian mini Listening detail', skills: ['listening_detail'], itemIds: ids2, minutes: 8, mode: 'ujian', timer: 8, shuffle: true, deadline: today(t + 2 * DAY), createdAt: t - DAY, targets: null, done: {} });
    c.students.forEach(function (s, i) { if (i % 3 !== 2) c.assignments[0].done[s.id] = { at: t - 2 * DAY, acc: skillAcc(s, 'past_tense') }; if (i % 2 === 0 && (t - s.lastActiveAt) / DAY < 3) c.assignments[1].done[s.id] = { at: t - 6e5, acc: skillAcc(s, 'listening_detail') }; });
    c.announcements.push({ id: uid('an'), at: t - 2 * DAY, text: 'Besok kita bahas Past Tense lewat cerita liburan kalian. Siapkan 3 kalimat tentang kegiatan minggu lalu ya!' });
    c.journal.push({ id: uid('jr'), at: t - 3 * DAY, text: 'Metode “timeline di papan” ampuh untuk yesterday/ago. Fikri dan Rizky masih tertukar verb 1/verb 2 saat pertanyaan.', tags: [c.students[5].id, c.students[7].id] });
    return c;
  }

  // ---- analitik ---------------------------------------------------------------------------
  function skillAcc(s, skill) { var c = 0, n = 0; (s.results || []).forEach(function (r) { if (r.skill === skill) { c += r.correct; n += r.total; } }); return n ? c / n : null; }
  function overallAcc(s) { var c = 0, n = 0; (s.results || []).forEach(function (r) { c += r.correct; n += r.total; }); return n ? c / n : null; }
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / DAY) : null; }
  function pendingAssignments(c, s) {
    var td = today();
    return (c.assignments || []).filter(function (a) { return targeted(a, s) && !(a.done && a.done[s.id]); }).map(function (a) { return { a: a, late: !!(a.deadline && a.deadline < td) }; });
  }
  function targeted(a, s) { return !a.targets || a.targets.indexOf(s.id) !== -1; }
  function weakestSkill(s) {
    var best = null; SKILL_ORDER.forEach(function (k) { var v = skillAcc(s, k); if (v != null && (!best || v < best.acc)) best = { skill: k, acc: v }; }); return best;
  }
  /** Skor risiko 0–100 + alasan yang bisa dibaca guru + satu tindakan konkret. */
  function risk(c, s) {
    var score = 0, reasons = [], d = daysSince(s.lastActiveAt), acc = overallAcc(s), pend = pendingAssignments(c, s), late = pend.filter(function (p) { return p.late; });
    if (d == null) { score += 35; reasons.push('belum pernah tercatat belajar'); }
    else if (d >= 7) { score += 40; reasons.push(d + ' hari tidak belajar'); }
    else if (d >= 3) { score += 20; reasons.push(d + ' hari tidak belajar'); }
    if (acc != null && acc < 0.5) { score += 30; reasons.push('akurasi ' + Math.round(acc * 100) + '% (di bawah 50%)'); }
    else if (acc != null && acc < 0.65) { score += 15; reasons.push('akurasi ' + Math.round(acc * 100) + '%'); }
    if (late.length) { score += 20; reasons.push(late.length + ' tugas lewat tenggat'); }
    else if (pend.length) { score += 5; }
    if (!s.targetDone) { score += 10; }
    var att = recentAttendance(s, 5), absent = att.filter(function (x) { return x.v === 'A'; }).length;
    if (absent >= 2) { score += 15; reasons.push(absent + 'x alpa minggu ini'); }
    score = Math.min(100, score);
    var level = score >= 50 ? 'risiko' : score >= 25 ? 'pantau' : 'aman';
    var weak = weakestSkill(s), action;
    if (d != null && d >= 7) action = 'Kirim Kartu Sapa hari ini — sapaan personal, bukan tagihan tugas.';
    else if (late.length) action = 'Ingatkan tugas “' + late[0].a.title + '” lewat pesan singkat + tawarkan waktu tambahan.';
    else if (weak && weak.acc < 0.5) action = 'Beri 5 soal ' + SKILL_LABEL[weak.skill] + ' ' + t('guru.pendamping-teman', 'dengan pendamping teman (lihat Kelompok Belajar).');
    else if (level === 'pantau') action = 'Sapa 1 kalimat apresiasi supaya momentumnya tidak putus.';
    else action = 'Pertahankan — beri tantangan kecil satu level di atas.';
    return { score: score, level: level, reasons: reasons, action: action, weak: weak, pending: pend.length, late: late.length, inactiveDays: d };
  }
  function recentAttendance(s, n) { var out = []; for (var i = 0; i < n; i++) { var k = today(Date.now() - i * DAY); out.push({ date: k, v: (s.attendance || {})[k] || null }); } return out; }
  function attendanceRate(s, n) { var a = recentAttendance(s, n || 10).filter(function (x) { return x.v; }); if (!a.length) return null; return a.filter(function (x) { return x.v === 'H'; }).length / a.length; }
  function classStats(c) {
    var st = c.students, active7 = st.filter(function (s) { var d = daysSince(s.lastActiveAt); return d != null && d <= 7; }).length;
    var accs = st.map(overallAcc).filter(function (v) { return v != null; }), avg = accs.length ? accs.reduce(function (a, b) { return a + b; }, 0) / accs.length : null;
    var risks = st.map(function (s) { return risk(c, s); }), atRisk = risks.filter(function (r) { return r.level === 'risiko'; }).length, watch = risks.filter(function (r) { return r.level === 'pantau'; }).length;
    var open = (c.assignments || []).filter(function (a) { return st.some(function (s) { return targeted(a, s) && !(a.done && a.done[s.id]); }); }).length;
    return { total: st.length, active7: active7, avgAcc: avg, atRisk: atRisk, watch: watch, openAssignments: open };
  }
  function classSkillMap(c) {
    return SKILL_ORDER.map(function (k) {
      var cc = 0, nn = 0, low = 0; c.students.forEach(function (s) { (s.results || []).forEach(function (r) { if (r.skill === k) { cc += r.correct; nn += r.total; } }); var v = skillAcc(s, k); if (v != null && v < 0.5) low++; });
      return { skill: k, label: SKILL_LABEL[k], acc: nn ? cc / nn : null, low: low, n: nn };
    });
  }
  function heatmap(c) { return c.students.map(function (s) { return { s: s, cells: SKILL_ORDER.map(function (k) { return { skill: k, acc: skillAcc(s, k) }; }), risk: risk(c, s) }; }); }
  /** Kelompok belajar otomatis: pasangkan yang kuat dengan yang lemah pada satu skill (peer tutoring). */
  function studyGroups(c, skill, size) {
    size = size || 4;
    var ranked = c.students.map(function (s) { return { s: s, acc: skillAcc(s, skill) }; }).filter(function (x) { return x.acc != null; }).sort(function (a, b) { return b.acc - a.acc; });
    var groups = [], n = Math.ceil(ranked.length / size);
    for (var g = 0; g < n; g++) groups.push([]);
    // serpentine: kuat-lemah bergantian supaya tiap kelompok punya mentor
    ranked.forEach(function (x, i) { var round = Math.floor(i / n), idx = round % 2 === 0 ? i % n : n - 1 - (i % n); groups[idx].push(x); });
    return groups.filter(function (g) { return g.length; }).map(function (g, i) { g.sort(function (a, b) { return b.acc - a.acc; }); return { no: i + 1, mentor: g[0], members: g }; });
  }
  function misconceptions(c) {
    var B = bank(), map = classSkillMap(c).filter(function (m) { return m.acc != null; }).sort(function (a, b) { return a.acc - b.acc; });
    return map.slice(0, 3).map(function (m) { var sk = B && B.SKILLS[m.skill]; return { skill: m.skill, label: m.label, acc: m.acc, low: m.low, pattern: sk ? sk.pattern : '', objective: sk ? sk.objective : '', lesson: sk ? sk.lesson : 'Sesi review ' + m.label }; });
  }
  function needsGreeting(c) {
    return c.students.map(function (s) { return { s: s, r: risk(c, s) }; }).filter(function (x) { return x.r.level !== 'aman'; }).sort(function (a, b) { return b.r.score - a.r.score; });
  }
  function agenda(c) {
    var td = today(), out = [];
    (c.assignments || []).forEach(function (a) { var pend = c.students.filter(function (s) { return targeted(a, s) && !(a.done && a.done[s.id]); }).length; if (pend) out.push({ kind: a.deadline && a.deadline < td ? 'lewat' : a.deadline === td ? 'hari-ini' : 'akan', a: a, pending: pend }); });
    return out.sort(function (x, y) { return String(x.a.deadline || '9').localeCompare(String(y.a.deadline || '9')); });
  }

  // ---- kode tukar (murid <-> guru) -----------------------------------------------------------
  function parseLearnerCode(code) {
    try { return parseLearnerPayload(b64d(code)); } catch (_) { return null; }
  }
  /** Bentuk payload v1 yang sama dipakai kode tempel DAN laporan server (report_json). */
  function parseLearnerPayload(p) {
    try {
      if (!p || p.v !== 1 || !p.skills) return null;
      var results = Object.keys(p.skills).map(function (k) { return { skill: k, correct: Number(p.skills[k].c) || 0, total: Number(p.skills[k].t) || 0 }; });
      return { name: firstName(p.name), lastActiveAt: Number(p.at) || Date.now(), targetDone: (p.lessons || 0) >= 3, results: results, goal: p.goal || null, cls: normalizeClassCode(p.cls) || null, assignments: Array.isArray(p.assign) ? p.assign : (p.assign ? [{ id: p.assign }] : []) };
    } catch (_) { return null; }
  }
  /** Masukkan hasil murid ke kelas: perbarui murid yang ada (nama depan sama) atau tambah baru. Skill digabung per-skill. */
  function ingest(c, parsed) {
    var s = c.students.filter(function (x) { return x.name.toLowerCase() === parsed.name.toLowerCase(); })[0], isNew = false;
    if (!s) { s = newStudent(parsed.name); c.students.push(s); isNew = true; }
    var incoming = {}; parsed.results.forEach(function (r) { incoming[r.skill] = r; });
    s.results = s.results.filter(function (r) { return !incoming[r.skill]; }).concat(parsed.results);
    s.lastActiveAt = parsed.lastActiveAt; s.targetDone = parsed.targetDone || s.targetDone; s.goal = parsed.goal || s.goal;
    s.attendance[today(parsed.lastActiveAt)] = s.attendance[today(parsed.lastActiveAt)] || 'H';
    var graded = [], explicit = parsed.assignments || [];
    (c.assignments || []).forEach(function (a) {
      var hit = explicit.filter(function (x) { return x.id === a.id; })[0];
      if (hit && hit.s && !(hit.t > 0) && !(a.done && a.done[s.id])) { a.progress = a.progress || {}; a.progress[s.id] = Number(hit.at) || parsed.lastActiveAt; return; }
      if (a.done && a.done[s.id]) return;
      var implicit = !explicit.length && targeted(a, s) && parsed.lastActiveAt >= a.createdAt && a.skills.some(function (k) { return incoming[k]; });
      if (hit || implicit) { a.done = a.done || {}; a.done[s.id] = { at: Number(hit && hit.at) || parsed.lastActiveAt, acc: hit && hit.t ? hit.c / hit.t : skillAcc(s, a.skills[0]), c: hit ? hit.c : undefined, t: hit ? hit.t : undefined, w: hit && Array.isArray(hit.w) ? hit.w : undefined }; if (a.progress) delete a.progress[s.id]; graded.push(a); }
    });
    return { student: s, graded: graded, isNew: isNew };
  }
  /** Bentuk payload tugas yang dikirim ke server = isi kode tugas (tanpa base64). */
  function assignmentPayload(c, a) { var p = { v: 1, t: 'assign', id: a.id, title: a.title, skills: a.skills, itemIds: a.itemIds, minutes: a.minutes, from: c.name, cls: c.code, deadline: a.deadline || null, mode: a.mode || 'latihan', timer: a.timer || 0, shuffle: !!a.shuffle }; if (a.teacher) p.teacher = String(a.teacher).slice(0, 60); if (Array.isArray(a.items) && a.items.length) p.items = a.items.map(function (q) { var o = { id: q.id, prompt: q.prompt, options: q.options, answer: q.answer, skill: q.skill }; if (q.context) o.context = q.context; if (q.why && Object.keys(q.why).length) o.why = q.why; return o; }); return p; }
  function assignmentCode(c, a) { return b64e(assignmentPayload(c, a)); }
  function parseAssignmentCode(code) { try { var p = b64d(code); if (!p || p.t !== 'assign' || !Array.isArray(p.itemIds)) return null; return p; } catch (_) { return null; } }
  /** Sisi murid: simpan tugas dari kode guru ke antrean Today Plan (dipakai learner-flow). */
  function acceptAssignmentCode(code) {
    var p = parseAssignmentCode(code); if (!p) return null;
    return acceptAssignmentPayload(p);
  }
  /** Sisi murid: simpan payload tugas (dari kode ATAU notifikasi server) ke antrean Today Plan. */
  function acceptAssignmentPayload(p) {
    if (!p || p.t !== 'assign' || !Array.isArray(p.itemIds)) return null;
    try {
      var a = JSON.parse(localStorage.getItem(ASSIGN_KEY)) || [];
      if (!a.some(function (x) { return x.id === p.id; })) a.push({ id: p.id, title: p.title, skills: p.skills, itemIds: p.itemIds, minutes: p.minutes, from: p.from, teacher: p.teacher || '', cls: p.cls || '', items: Array.isArray(p.items) ? p.items : undefined, timer: p.timer || 0, shuffle: !!p.shuffle, at: Date.now(), deadline: p.deadline, mode: p.mode });
      localStorage.setItem(ASSIGN_KEY, JSON.stringify(a.slice(-12)));
      if (p.cls) { var ob = JSON.parse(localStorage.getItem('fiezel-onboarding-v1') || '{}'); if (!ob.classCode) { ob.classCode = p.cls; localStorage.setItem('fiezel-onboarding-v1', JSON.stringify(ob)); } }
    } catch (_) {}
    return p;
  }
  function buildAssignment(opts) {
    var B = bank(), custom = Array.isArray(opts.items) ? opts.items.filter(function (q) { return q && q.prompt && Array.isArray(q.options) && q.options.length >= 2; }).slice(0, 40) : [];
    var skills = (opts.skills || []).filter(function (k) { return (B && B.SKILLS[k]) || custom.some(function (q) { return q.skill === k; }); });
    custom.forEach(function (q) { if (q.skill && skills.indexOf(q.skill) === -1 && skills.length < 3) skills.push(q.skill); });
    if (!skills.length) skills = ['past_tense'];
    var ids = [], seed = Date.now() % 997;
    if (Array.isArray(opts.itemIds) && opts.itemIds.length) ids = opts.itemIds.slice(0, 40);
    else if (!custom.length || opts.count) { var per = Math.max(1, Math.round((Number(opts.count) || 10) / skills.length)); skills.forEach(function (k, i) { if (B && B.SKILLS[k]) B.pickFresh(k, per, { avoid: opts.avoid || [], seed: seed + i }).forEach(function (it) { ids.push(it.id); }); }); }
    custom.forEach(function (q) { if (ids.indexOf(q.id) === -1) ids.push(q.id); });
    ids = ids.slice(0, 40);
    var minutes = Math.max(3, Math.round(ids.length * 0.9));
    var a = { id: uid('as'), title: String(opts.title || ('Latihan ' + skills.map(function (k) { return SKILL_LABEL[k] || k; }).join(' + '))).slice(0, 80), skills: skills, itemIds: ids, minutes: minutes, mode: opts.mode || 'latihan', timer: opts.mode === 'ujian' ? (Number(opts.timer) || minutes) : 0, shuffle: opts.mode === 'ujian', deadline: opts.deadline || null, createdAt: Date.now(), targets: opts.targets && opts.targets.length ? opts.targets : null, done: {}, progress: {} };
    if (custom.length) a.items = custom;
    if (opts.teacher) a.teacher = String(opts.teacher).slice(0, 60);
    if (opts.source) a.source = opts.source;
    if (opts.review) a.review = opts.review;
    return a;
  }

  // ---- naskah komunikasi (tanpa AI, template berisi data) ----------------------------------
  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function greetingCard(c, s, teacher) {
    var r = risk(c, s), w = r.weak, strong = null;
    SKILL_ORDER.forEach(function (k) { var v = skillAcc(s, k); if (v != null && (!strong || v > strong.acc)) strong = { skill: k, acc: v }; });
    var who = teacher && teacher.name ? teacher.name : 'gurumu';
    if (r.inactiveDays != null && r.inactiveDays >= 7) return 'Hai ' + s.name + ' 👋 Ini ' + who + '. Sudah ' + r.inactiveDays + ' hari FIEZEL-mu sepi, aku kangen lihat progresmu. Nggak perlu lama — 5 soal ' + (w ? SKILL_LABEL[w.skill] : 'review') + ' saja hari ini (±4 menit). Kalau ada yang bikin berat, cerita ke aku ya.';
    if (r.late) return 'Hai ' + s.name + ', ini ' + who + '. Tugas “' + pendingAssignments(c, s).filter(function (p) { return p.late; })[0].a.title + '” sudah lewat tenggat. Aku kasih waktu tambahan sampai besok — kerjakan santai, yang penting selesai. Kalau bingung di soal mana, screenshot dan kirim ke aku.';
    if (w && w.acc < 0.5) return 'Hai ' + s.name + '! ' + (strong ? 'Aku lihat ' + SKILL_LABEL[strong.skill] + '-mu sudah ' + pct(strong.acc) + ' — mantap. ' : '') + 'Yang masih sering tertukar tinggal ' + SKILL_LABEL[w.skill] + ' (' + pct(w.acc) + '). Besok kita bereskan bareng, aku sudah siapkan 5 soal khusus buatmu.';
    return 'Hai ' + s.name + ', ini ' + who + '. Minggu ini kamu konsisten' + (strong ? ' dan ' + SKILL_LABEL[strong.skill] + '-mu ' + pct(strong.acc) : '') + '. Aku bangga. Lanjutkan ritmenya — 1 sesi kecil tiap hari lebih ampuh daripada 1 sesi panjang seminggu.';
  }
  function parentReport(c, s, teacher) {
    var acc = overallAcc(s), r = risk(c, s), w = r.weak, att = attendanceRate(s, 10), pend = pendingAssignments(c, s);
    var strong = null; SKILL_ORDER.forEach(function (k) { var v = skillAcc(s, k); if (v != null && (!strong || v > strong.acc)) strong = { skill: k, acc: v }; });
    var lines = ['Assalamu’alaikum / Selamat ' + timeGreeting() + ' Bapak/Ibu orang tua ' + s.name + ',', 'Berikut laporan singkat belajar Bahasa Inggris ' + s.name + ' di kelas ' + c.name + ' (' + fmtDate(Date.now()) + '):', ''];
    lines.push('• Akurasi keseluruhan: ' + pct(acc) + (acc != null ? (acc >= 0.75 ? ' — baik' : acc >= 0.55 ? ' — berkembang' : ' — perlu pendampingan') : ''));
    if (strong) lines.push('• Kekuatan: ' + SKILL_LABEL[strong.skill] + ' (' + pct(strong.acc) + ')');
    if (w) lines.push('• Perlu latihan: ' + SKILL_LABEL[w.skill] + ' (' + pct(w.acc) + ')');
    if (att != null) lines.push('• Kehadiran 10 pertemuan terakhir: ' + Math.round(att * 100) + '%');
    lines.push('• Terakhir belajar mandiri: ' + (s.lastActiveAt ? fmtDate(s.lastActiveAt) : 'belum tercatat'));
    if (pend.length) lines.push(t('guru.tugas-belum-selesai', '• Tugas belum selesai:') + ' ' + pend.map(function (p) { return p.a.title; }).join(', '));
    lines.push('', 'Yang bisa dibantu di rumah: tanyakan 1 kalimat Bahasa Inggris tentang kegiatan ' + s.name + ' kemarin (melatih ' + (w ? SKILL_LABEL[w.skill] : 'ingatan') + '). Cukup 5 menit.', '', 'Terima kasih atas kerja samanya 🙏', (teacher && teacher.name) || t('guru.tanda-tangan', 'Guru Bahasa Inggris'), (teacher && teacher.school) || '');
    return lines.join('\n').trim();
  }
  function weeklyClassReport(c, teacher) {
    var st = classStats(c), map = classSkillMap(c), mis = misconceptions(c), greet = needsGreeting(c);
    var lines = ['LAPORAN MINGGUAN — ' + c.name + ' (' + fmtDate(Date.now()) + ')', '', 'Ringkasan: ' + st.total + ' siswa · ' + st.active7 + ' aktif 7 hari terakhir · rata-rata akurasi ' + pct(st.avgAcc) + ' · ' + st.atRisk + ' siswa berisiko, ' + st.watch + ' perlu dipantau.', '', 'Peta skill kelas:'];
    map.forEach(function (m) { if (m.acc != null) lines.push('  - ' + m.label + ': ' + pct(m.acc) + (m.low ? ' (' + m.low + ' siswa <50%)' : '')); });
    if (mis.length) { lines.push('', 'Miskonsepsi utama: ' + mis[0].label + ' — ' + mis[0].pattern + '. Rencana: ' + mis[0].lesson + '.'); }
    if (greet.length) { lines.push('', 'Siswa yang perlu disapa: ' + greet.slice(0, 6).map(function (x) { return x.s.name + ' (' + x.r.reasons[0] + ')'; }).join('; ')); }
    lines.push('', (teacher && teacher.name) || 'Guru', (teacher && teacher.school) || '');
    return lines.join('\n').trim();
  }
  function csvStudents(c) {
    var head = ['Nama', 'Terakhir aktif', 'Akurasi', 'Risiko'].concat(SKILL_ORDER.map(function (k) { return SKILL_LABEL[k]; })).concat(['Kehadiran 10x', 'HP Ortu']);
    var rows = c.students.map(function (s) { var r = risk(c, s); return [s.name, s.lastActiveAt ? today(s.lastActiveAt) : '', pct(overallAcc(s)), r.level].concat(SKILL_ORDER.map(function (k) { return pct(skillAcc(s, k)); })).concat([pct(attendanceRate(s, 10)), s.parentPhone]); });
    return [head].concat(rows).map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  }
  function parseNames(text) { return String(text || '').split(/[\n,;]+/).map(function (x) { return x.replace(/^\d+[.)\s-]*/, '').trim(); }).filter(Boolean).slice(0, 60); }
  function waLink(phone, text) { var p = String(phone || '').replace(/\D/g, ''); if (p.indexOf('0') === 0) p = '62' + p.slice(1); return 'https://wa.me/' + (p || '') + '?text=' + encodeURIComponent(text); }
  function timeGreeting() { var h = new Date().getHours(); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'; }
  function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (_) { return today(ts); } }

  // ---- sinkron server (kode kelas diklaim guru; murid melapor otomatis) -----------------------
  var SYNC_PATHS = { claim: '/api/teacher/class/claim', list: '/api/teacher/class/list', reports: '/api/teacher/class/reports', report: '/api/learner/class-report', assign: '/api/teacher/class/assign', learnerAssignments: '/api/learner/class-assignments' };
  function account() { return root.FiezelAccount || null; }
  /**
   * Kirim tugas ke murid lewat server (masuk ke notifikasi murid). studentIds: null = seluruh
   * kelas; selain itu daftar id murid di kelas ini (dikirim sebagai nama depan).
   */
  function sendAssignment(c, a, studentIds) {
    var avail = syncAvailable();
    if (avail !== 'ok') return Promise.resolve({ ok: false, error: avail });
    var A = account(), names = null;
    if (Array.isArray(studentIds) && studentIds.length) {
      names = c.students.filter(function (s) { return studentIds.indexOf(s.id) !== -1; }).map(function (s) { return s.name; });
      if (!names.length) return Promise.resolve({ ok: false, error: 'no_targets' });
    }
    var step = (c.sync && c.sync.claimed) ? Promise.resolve({ ok: true }) : claimClass(c);
    return step.then(function (r) {
      if (!r.ok) return { ok: false, error: r.error };
      return A.api(SYNC_PATHS.assign, { code: c.code, assignment: assignmentPayload(c, a), targets: names }).then(function (res) {
        if (!res.ok) return { ok: false, error: res.error || 'unknown' };
        a.sent = a.sent || { all: null, to: {} };
        if (!names) a.sent.all = Date.now(); else (studentIds || []).forEach(function (id) { a.sent.to[id] = Date.now(); });
        return { ok: true, count: names ? names.length : c.students.length };
      });
    }).catch(function () { return { ok: false, error: 'unavailable' }; });
  }
  function sentTo(a, s) { return !!(a.sent && (a.sent.all || (a.sent.to && a.sent.to[s.id]))); }
  // ---- kotak masuk guru (lokal; diisi dari hasil sinkron) --------------------------------------
  var INBOX_MAX = 60;
  function notify(st, entry) {
    st.inbox = Array.isArray(st.inbox) ? st.inbox : [];
    var e = Object.assign({ id: uid('nt'), at: Date.now(), read: false }, entry);
    st.inbox.unshift(e); st.inbox = st.inbox.slice(0, INBOX_MAX);
    return e;
  }
  function inboxUnread(st) { return (st.inbox || []).filter(function (e) { return !e.read; }).length; }
  function inboxMarkAllRead(st) { (st.inbox || []).forEach(function (e) { e.read = true; }); }
  function inboxText(e) {
    if (!e) return '';
    if (e.kind === 'assignment_done') return e.student + ' selesai mengerjakan “' + e.title + '”' + (e.acc != null ? ' · ' + pct(e.acc) : '');
    if (e.kind === 'student_joined') return e.student + ' bergabung ke kelas ' + (e.cls || '');
    if (e.kind === 'report_in') return 'Laporan latihan baru dari ' + e.student;
    return e.text || '';
  }
  /** syncAvailable() -> 'ok' | 'offline' | 'no_account' | 'not_teacher' | 'disabled' */
  function syncAvailable() {
    var A = account(); if (!A || typeof A.api !== 'function') return 'disabled';
    try { if (root.navigator && root.navigator.onLine === false) return 'offline'; } catch (_) {}
    var role = A.role ? A.role() : null;
    if (!role) return 'no_account';
    if (role !== 'teacher') return 'not_teacher';
    return 'ok';
  }
  /** Klaim kode kelas di server (idempoten untuk pemilik yang sama). */
  function claimClass(c) {
    var A = account();
    return A.api(SYNC_PATHS.claim, { code: c.code, title: c.name, level: c.level }).then(function (r) {
      if (r.ok) { c.sync = Object.assign(c.sync || {}, { claimed: true, claimedAt: Date.now(), error: '' }); return { ok: true }; }
      c.sync = Object.assign(c.sync || {}, { claimed: false, error: r.error || 'unknown' });
      return { ok: false, error: r.error || 'unknown' };
    });
  }
  /** Tarik laporan murid yang berubah sejak kursor terakhir, lalu ingest. */
  function pullReports(c) {
    var A = account(), since = (c.sync && c.sync.cursor) || 0;
    return A.api(SYNC_PATHS.reports + '?code=' + encodeURIComponent(c.code) + '&since=' + since).then(function (r) {
      if (!r.ok) {
        if (r.status === 404 && c.sync && c.sync.claimed) c.sync.claimed = false;
        c.sync = Object.assign(c.sync || {}, { error: r.error || 'unknown' });
        return { ok: false, error: r.error || 'unknown', ingested: 0, graded: 0 };
      }
      var d = r.data || {}, ingested = 0, graded = 0, names = [], events = [];
      (d.reports || []).forEach(function (rep) {
        var p = parseLearnerPayload(rep.report); if (!p) return;
        var res = ingest(c, p); ingested++; graded += res.graded.length; names.push(res.student.name);
        if (res.isNew) events.push({ kind: 'student_joined', student: res.student.name, sid: res.student.id, cls: c.name, clsId: c.id });
        res.graded.forEach(function (a) { var dn = a.done && a.done[res.student.id]; events.push({ kind: 'assignment_done', student: res.student.name, sid: res.student.id, title: a.title, aid: a.id, acc: dn ? dn.acc : null, clsId: c.id }); });
        if (!res.isNew && !res.graded.length) events.push({ kind: 'report_in', student: res.student.name, sid: res.student.id, clsId: c.id });
      });
      c.sync = Object.assign(c.sync || {}, { claimed: true, cursor: Number(d.cursor) || since, lastPullAt: Date.now(), error: '' });
      return { ok: true, ingested: ingested, graded: graded, names: names, events: events, more: !!d.more };
    });
  }
  /** Satu putaran sinkron untuk satu kelas: klaim bila perlu, lalu tarik. */
  function syncClass(c) {
    var avail = syncAvailable();
    if (avail !== 'ok') return Promise.resolve({ ok: false, error: avail, ingested: 0, graded: 0 });
    var step = (c.sync && c.sync.claimed) ? Promise.resolve({ ok: true }) : claimClass(c);
    return step.then(function (r) { return r.ok ? pullReports(c) : { ok: false, error: r.error, ingested: 0, graded: 0 }; })
      .catch(function () { return { ok: false, error: 'unavailable', ingested: 0, graded: 0 }; });
  }
  /** Sisi murid: kirim laporan agregat ke kelas (tanpa tempel kode). Diam-diam gagal bila offline/tanpa kode. */
  function reportToClass(payload) {
    var A = account(); if (!A || typeof A.api !== 'function' || !payload || !payload.cls) return Promise.resolve({ ok: false, error: 'disabled' });
    return A.api(SYNC_PATHS.report, payload).then(function (r) { return { ok: !!r.ok, status: r.status, error: r.error || '' }; }).catch(function () { return { ok: false, error: 'unavailable' }; });
  }
  function syncLabel(c) {
    var avail = syncAvailable(), s = c && c.sync;
    if (avail === 'disabled') return { state: 'off', text: 'Sinkron nonaktif' };
    if (avail === 'offline') return { state: 'off', text: 'Offline — data lokal' };
    if (avail === 'no_account' || avail === 'not_teacher') return { state: 'need', text: 'Masuk akun guru untuk sinkron' };
    if (s && s.error) return { state: 'err', text: s.error === 'class_code_taken' ? 'Kode kelas dipakai guru lain' : 'Sinkron gagal — coba lagi' };
    if (s && s.lastPullAt) { var m = Math.round((Date.now() - s.lastPullAt) / 60000); return { state: 'ok', text: m < 1 ? 'Tersinkron baru saja' : 'Tersinkron ' + m + ' mnt lalu' }; }
    return { state: 'idle', text: 'Belum tersinkron' };
  }

  return { KEY: KEY, ASSIGN_KEY: ASSIGN_KEY, SKILL_LABEL: SKILL_LABEL, SKILL_ORDER: SKILL_ORDER, ATT: ATT, DAY: DAY,
    load: load, save: save, defaults: defaults, uid: uid, today: today, firstName: firstName, newClass: newClass, newStudent: newStudent, normalizeClass: normalizeClass, seedDemo: seedDemo, makeClassCode: makeClassCode, normalizeClassCode: normalizeClassCode,
    skillAcc: skillAcc, overallAcc: overallAcc, daysSince: daysSince, risk: risk, classStats: classStats, classSkillMap: classSkillMap, heatmap: heatmap, studyGroups: studyGroups, misconceptions: misconceptions, needsGreeting: needsGreeting, agenda: agenda, pendingAssignments: pendingAssignments, targeted: targeted, recentAttendance: recentAttendance, attendanceRate: attendanceRate, weakestSkill: weakestSkill,
    parseLearnerCode: parseLearnerCode, parseLearnerPayload: parseLearnerPayload, ingest: ingest, assignmentCode: assignmentCode, assignmentPayload: assignmentPayload, parseAssignmentCode: parseAssignmentCode, acceptAssignmentCode: acceptAssignmentCode, acceptAssignmentPayload: acceptAssignmentPayload, buildAssignment: buildAssignment,
    SYNC_PATHS: SYNC_PATHS, syncAvailable: syncAvailable, claimClass: claimClass, pullReports: pullReports, syncClass: syncClass, reportToClass: reportToClass, syncLabel: syncLabel, sendAssignment: sendAssignment, sentTo: sentTo,
    notify: notify, inboxUnread: inboxUnread, inboxMarkAllRead: inboxMarkAllRead, inboxText: inboxText,
    greetingCard: greetingCard, parentReport: parentReport, weeklyClassReport: weeklyClassReport, csvStudents: csvStudents, parseNames: parseNames, waLink: waLink, fmtDate: fmtDate, pct: pct };
});
