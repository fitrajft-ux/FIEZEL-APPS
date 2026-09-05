/**
 * FIEZEL — fiezel-class-hub.js · KELAS = pusat hubungan Guru ↔ Murid ↔ Braincore.
 * Satu modul, dua wajah: mountStudent (tab Kelas di bottom nav) dan mountTeacher (view
 * "Kelas" di Ruang Guru). Keduanya membaca kontrak data yang sama (payload tugas v1 +
 * laporan v1) lewat FiezelTeacherStore, FiezelLearnerFlow, FiezelReviewBank, dan
 * FiezelBraincoreReview. Tidak ada penyimpanan baru selain riwayat kiriman murid.
 */
(function (root) {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah modul ini dulu literal Indonesia, jadi murid
     yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft: kalau copy-map
     belum termuat, fallback id yang tampil — bukan kunci mentah. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }
  if (!root) return;
  var SUB_KEY = 'fiezel-class-submissions-v1', UI_KEY = 'fiezel-class-hub-v1';
  function R() { return root.FiezelBraincoreReview; }
  function T() { return root.FiezelTeacherStore; }
  function B() { return root.FiezelReviewBank; }
  function LF() { return root.FiezelLearnerFlow; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]; }); }
  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function icon(n) { return '<i data-lucide="' + n + '" aria-hidden="true"></i>'; }
  function fmtDate(v) { try { var d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v); return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (_) { return String(v || ''); } }
  function skillLabel(k) { var TS = T(), RV = R(); return (TS && TS.SKILL_LABEL[k]) || (RV && RV.SKILL_LABEL[k]) || k; }
  function readJson(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (_) { return fb; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function statusOf(a, rec) { return R().assignmentStatus(a, rec, today()); }
  function statusChip(s) { return '<span class="ch-status is-' + s.id + (s.late && s.id === 'selesai' ? ' is-late-done' : '') + '">' + esc(s.label) + (s.id === 'selesai' && s.late ? ' (terlambat)' : '') + '</span>'; }
  function deadlineText(a) { if (!a.deadline) return 'Tanpa tenggat'; var d = R().daysLeft(a.deadline, today()); return d < 0 ? 'Lewat ' + (-d) + ' hari' : d === 0 ? 'Tenggat hari ini' : d === 1 ? 'Tenggat besok' : 'Tenggat ' + d + ' hari lagi · ' + fmtDate(a.deadline); }
  function resolveItem(a, id) { var q = (a.items || []).filter(function (x) { return x.id === id; })[0]; if (q) return q; var bank = B(); return bank ? bank.byId(id) : null; }
  function shuffle(arr, seed) { var a = arr.slice(), s = seed || 1; for (var i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ===================================================================================== */
  /* MURID                                                                                  */
  /* ===================================================================================== */
  var sEl = null, sEnv = {}, sUi = null, pendingOpen = null, timerTick = null;
  function ui() { if (!sUi) { sUi = readJson(UI_KEY, {}); sUi.tab = sUi.tab || 'tugas'; sUi.runner = sUi.runner || null; } return sUi; }
  function saveUi() { writeJson(UI_KEY, sUi); }
  function assignments() { var TS = T(); return readJson(TS ? TS.ASSIGN_KEY : 'fiezel-learner-assignments-v1', []); }
  function subs() { return readJson(SUB_KEY, []); }
  function classCode() { return String((readJson('fiezel-onboarding-v1', {}) || {}).classCode || ''); }
  function setClassCode(code) { var TS = T(), c = TS ? TS.normalizeClassCode(code) : String(code || '').toUpperCase(); if (!c) return false; var ob = readJson('fiezel-onboarding-v1', {}) || {}; ob.classCode = c; writeJson('fiezel-onboarding-v1', ob); try { root.FiezelInbox && root.FiezelInbox.poll(true).then(function () { renderStudent(); }); } catch (_) {} return true; }
  function latestMeta() { var all = assignments().concat(subs()).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); return all[0] || null; }
  function teacherName() { var m = latestMeta(); return m && m.teacher ? m.teacher : ''; }
  function className() { var m = latestMeta(); return m && m.from ? m.from : ''; }

  function mountStudent(el, env) {
    sEl = el; sEnv = env || {}; ui();
    el.addEventListener('click', onStudentClick); el.addEventListener('submit', onStudentSubmit);
    if (pendingOpen) { var id = pendingOpen; pendingOpen = null; if (openAssignment(id)) return; }
    renderStudent();
  }
  function unmountStudent() { if (timerTick) clearInterval(timerTick); timerTick = null; sEl = null; }
  /** Dibuka dari notifikasi: satu ketuk = sesi tugas terbuka di dalam Kelas. */
  function openAssignment(id) {
    if (!id) return false;
    if (!sEl) { pendingOpen = id; return true; }
    var a = assignments().filter(function (x) { return x.id === id; })[0];
    if (!a) { var done = subs().filter(function (x) { return x.id === id; })[0]; if (done) { ui().tab = 'tugas'; ui().review = id; saveUi(); renderStudent(); return true; } if (sEnv.toast) sEnv.toast(t('kelas.tugas-tidak-ditemukan', 'Tugas ini tidak ditemukan atau sudah selesai.')); return false; }
    startRunner(a); return true;
  }
  function startRunner(a) {
    var u = ui(), order = a.itemIds.map(function (_, i) { return i; });
    if (a.shuffle || a.mode === 'ujian') order = shuffle(order, a.id.length * 7 + Date.now() % 1000);
    u.runner = { aid: a.id, idx: 0, order: order, answers: [], chosen: null, revealed: false, startedAt: Date.now(), timerEnd: a.mode === 'ujian' && a.timer ? Date.now() + a.timer * 60000 : 0, finished: false, result: null };
    u.tab = 'tugas'; u.review = null; saveUi();
    try { LF() && LF().markAssignmentStarted(a.id); } catch (_) {}
    if (u.runner.timerEnd) { if (timerTick) clearInterval(timerTick); timerTick = setInterval(function () { var rr = ui().runner; if (!rr || rr.finished || !sEl) { clearInterval(timerTick); timerTick = null; return; } if (Date.now() >= rr.timerEnd) { finishRunner(); return; } var t = sEl.querySelector('[data-ch-timer]'); if (t) t.textContent = timerText(rr); }, 1000); }
    renderStudent();
  }
  function timerText(r) { var ms = Math.max(0, r.timerEnd - Date.now()), m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); return m + ':' + String(s).padStart(2, '0'); }
  function currentAssignment() { var r = ui().runner; return r ? assignments().filter(function (x) { return x.id === r.aid; })[0] || null : null; }
  function answerRunner(i) {
    var r = ui().runner, a = currentAssignment(); if (!r || !a || r.revealed) return;
    var id = a.itemIds[r.order[r.idx]], item = resolveItem(a, id); if (!item) { nextRunner(); return; }
    var correct = Number(i) === Number(item.answer);
    r.answers.push({ itemId: id, skill: item.skill || a.skills[0], correct: correct, chosen: Number(i) });
    r.chosen = Number(i);
    if (a.mode === 'ujian') { saveUi(); nextRunner(); return; }
    r.revealed = true; saveUi(); renderStudent();
  }
  function nextRunner() { var r = ui().runner; if (!r) return; r.idx += 1; r.chosen = null; r.revealed = false; var a = currentAssignment(); if (!a || r.idx >= r.order.length) { finishRunner(); return; } saveUi(); renderStudent(); }
  function finishRunner() {
    var r = ui().runner, a = currentAssignment(); if (!r || r.finished) return;
    if (timerTick) { clearInterval(timerTick); timerTick = null; }
    if (!a) { ui().runner = null; saveUi(); renderStudent(); return; }
    var res = null; try { res = LF() ? LF().recordAssignmentResult({ id: a.id, title: a.title, skill: a.skills[0], mode: a.mode, minutes: Math.round((Date.now() - r.startedAt) / 60000), results: r.answers }) : null; } catch (_) {}
    var correct = r.answers.filter(function (x) { return x.correct; }).length;
    var sub = { id: a.id, title: a.title, from: a.from, teacher: a.teacher || '', cls: a.cls || classCode(), skills: a.skills, mode: a.mode, deadline: a.deadline || null, at: Date.now(), c: correct, t: r.answers.length, results: r.answers, itemIds: a.itemIds, items: a.items || undefined, sent: !!res };
    var list = subs().filter(function (x) { return x.id !== a.id; }); list.push(sub); writeJson(SUB_KEY, list.slice(-30));
    if (!res) { try { var TS = T(); writeJson(TS.ASSIGN_KEY, assignments().filter(function (x) { return x.id !== a.id; })); } catch (_) {} }
    r.finished = true; r.result = { c: correct, t: r.answers.length, title: a.title, teacher: a.teacher || a.from }; saveUi();
    try { root.refreshNotifBadge && root.refreshNotifBadge(); } catch (_) {}
    renderStudent();
  }
  function closeRunner() { var u = ui(); if (u.runner && !u.runner.finished && sEnv.toast) sEnv.toast(t('kelas.toast-disimpan-sedang', 'Tugas disimpan sebagai "sedang mengerjakan". Lanjutkan kapan saja.')); if (u.runner && u.runner.finished) u.runner = null; u.paused = !!u.runner; saveUi(); renderStudent(); }

  function renderStudent() {
    if (!sEl) return; var u = ui(), pend = assignments(), done = subs();
    var body = u.runner && !u.paused ? runnerView() : u.review ? reviewView(u.review) : u.tab === 'kelas' ? kelasView() : u.tab === 'progres' ? progresView() : tugasView(pend, done);
    sEl.innerHTML = '<section class="ch ch-student" data-testid="class-hub-student">' +
      '<header class="ch-head"><div><p class="ch-kicker">' + t('umum.kelas', 'Kelas') + '</p><h1 data-testid="class-hub-title">' + esc(className() || (classCode() ? 'Kelas ' + classCode() : 'Belum terhubung ke kelas')) + '</h1><p class="ch-sub">' + (teacherName() ? 'Guru: <b>' + esc(teacherName()) + '</b> · ' : '') + (classCode() ? 'Kode ' + esc(classCode()) : 'Masukkan kode kelas dari gurumu di tab Kelas Saya') + '</p></div></header>' +
      (u.runner && !u.paused ? '' : '<nav class="ch-tabs" role="tablist">' + [['tugas', t('umum.tugas', 'Tugas'), pend.length], ['kelas', t('kelas.kelas-saya', 'Kelas Saya'), 0], ['progres', 'Progres', 0]].map(function (t) { return '<button type="button" role="tab" class="ch-tab' + (u.tab === t[0] && !u.review ? ' is-active' : '') + '" data-ch="tab" data-tab="' + t[0] + '" data-testid="class-tab-' + t[0] + '">' + t[1] + (t[2] ? '<span class="ch-badge">' + t[2] + '</span>' : '') + '</button>'; }).join('') + '</nav>') +
      body + '</section>';
    if (sEnv.afterRender) try { sEnv.afterRender(); } catch (_) {}
  }
  function assignCard(a, pending) {
    var u = ui(), inProgress = pending && u.runner && u.runner.aid === a.id && !u.runner.finished;
    var st = pending ? statusOf(a, { startedAt: inProgress ? u.runner.startedAt : 0 }) : statusOf(a, { done: { at: a.at } });
    var n = pending ? a.itemIds.length : a.t;
    return '<article class="ch-card ch-assign' + (a.mode === 'ujian' ? ' is-exam' : '') + '" data-testid="class-assign-' + esc(a.id) + '"><div class="ch-card-top"><span class="ch-from">' + icon('graduation-cap') + ' Dari <b>' + esc(a.teacher || 'guru') + '</b>' + (a.from ? ' · ' + esc(a.from) : '') + '</span>' + statusChip(st) + '</div>' +
      '<h3>' + esc(a.title) + '</h3><p class="ch-muted">' + (a.mode === 'ujian' ? 'Ujian mini · ' : 'Latihan · ') + n + ' soal · ' + (a.skills || []).map(skillLabel).join(' + ') + '</p>' +
      '<div class="ch-card-foot"><span class="ch-deadline' + (st.late ? ' is-late' : '') + '">' + icon('calendar') + ' ' + (pending ? esc(deadlineText(a)) : 'Selesai ' + esc(fmtDate(a.at))) + '</span>' +
      (pending ? '<button type="button" class="ch-btn is-primary" data-ch="open" data-id="' + esc(a.id) + '" data-testid="class-open-' + esc(a.id) + '">' + (inProgress ? 'Lanjutkan' : 'Kerjakan') + ' ' + icon('arrow-right') + '</button>' : '<button type="button" class="ch-btn is-ghost" data-ch="review" data-id="' + esc(a.id) + '" data-testid="class-review-' + esc(a.id) + '"><b>' + pct(a.t ? a.c / a.t : null) + '</b> · Lihat hasil</button>') + '</div></article>';
  }
  function tugasView(pend, done) {
    pend = pend.slice().sort(function (a, b) { return String(a.deadline || '9').localeCompare(String(b.deadline || '9')); });
    done = done.slice().sort(function (a, b) { return b.at - a.at; });
    return '<div class="ch-body"><section><h2 class="ch-h2">Perlu dikerjakan <small>' + pend.length + '</small></h2>' + (pend.length ? pend.map(function (a) { return assignCard(a, true); }).join('') : '<div class="ch-empty" data-testid="class-empty-pending">' + icon('inbox') + '<p>' + (classCode() ? 'Belum ada tugas baru dari guru. Tugas yang dikirim guru muncul di sini dan di lonceng notifikasi.' : 'Gabung kelas dulu dengan kode dari gurumu, lalu tugas akan muncul di sini.') + '</p>' + (classCode() ? '' : '<button type="button" class="ch-btn is-primary" data-ch="tab" data-tab="kelas">Masukkan kode kelas</button>') + '</div>') + '</section>' +
      '<section><h2 class="ch-h2">Selesai <small>' + done.length + '</small></h2>' + (done.length ? done.map(function (a) { return assignCard(a, false); }).join('') : '<p class="ch-muted">Hasil tugas yang sudah kamu kerjakan tersimpan di sini dan dikirim ke guru.</p>') + '</section></div>';
  }
  function kelasView() {
    var lf = null; try { lf = LF() ? LF().load() : null; } catch (_) {}
    var rep = lf && lf.classReport;
    return '<div class="ch-body"><section class="ch-card ch-class-card" data-testid="class-my-class">' + (classCode() ? '<p class="ch-kicker">' + t('kelas.kelas-terhubung', 'Kelas terhubung') + '</p><h3>' + esc(className() || 'Kelas ' + classCode()) + '</h3><p class="ch-muted">Kode kelas <b class="ch-mono">' + esc(classCode()) + '</b>' + (teacherName() ? ' · Guru <b>' + esc(teacherName()) + '</b>' : '') + '</p><p class="ch-muted ch-small">' + (rep ? (rep.ok ? icon('check') + ' Laporan terakhir terkirim ke guru ' + esc(fmtDate(rep.at)) : icon('clock') + ' Laporan terakhir belum terkirim (' + esc(rep.error || 'offline') + ') — dikirim ulang otomatis saat online.') : 'Setiap tugas yang selesai dikirim ke guru sebagai ringkasan: nama depan, akurasi per skill, dan soal yang keliru. Tanpa transkrip.') + '</p><div class="ch-actions"><button type="button" class="ch-btn is-ghost" data-ch="resend">' + icon('refresh-cw') + ' ' + t('kelas.kirim-ulang-laporan', 'Kirim ulang laporan') + '</button><button type="button" class="ch-btn is-ghost" data-ch="change-code">Ganti kode</button></div>' : '<p class="ch-kicker">Gabung kelas</p><h3>Masukkan kode dari gurumu</h3><p class="ch-muted">Kode berbentuk FZ-XXXXXX. Setelah tergabung, tugas guru masuk otomatis dan hasilmu kembali ke guru.</p>') +
      (!classCode() || ui().editCode ? '<form class="ch-form" data-ch-form="join"><input name="code" placeholder="FZ-ABC234" maxlength="9" autocomplete="off" required data-testid="class-code-input"><button type="submit" class="ch-btn is-primary" data-testid="class-code-submit">Gabung</button></form>' : '') + '</section>' +
      '<section class="ch-grid2"><button type="button" class="ch-card ch-link-card" data-ch="tutor" data-testid="class-open-tutor"><span class="ch-link-icon">' + icon('mic') + '</span><div><b>Tutor FIEZEL</b><small>Pelajaran bersuara Inggris + subtitle Indonesia, sesuai levelmu.</small></div>' + icon('arrow-up-right') + '</button>' +
      '<button type="button" class="ch-card ch-link-card" data-ch="learn" data-testid="class-open-learn"><span class="ch-link-icon">' + icon('route') + '</span><div><b>' + t('kelas.belajar-mandiri', 'Belajar mandiri hari ini') + '</b><small>Rencana harian dari peta kemampuanmu — tugas guru ikut masuk ke sana.</small></div>' + icon('arrow-up-right') + '</button></section></div>';
  }
  function progresView() {
    var lf = null; try { lf = LF() ? LF().load() : null; } catch (_) {}
    var skills = (lf && lf.skills) || {}, keys = Object.keys(skills), done = subs();
    var avg = done.length ? done.reduce(function (m, s) { return m + (s.t ? s.c / s.t : 0); }, 0) / done.length : null;
    return '<div class="ch-body"><section class="ch-kpis"><div class="ch-kpi" data-testid="class-kpi-done"><b>' + done.length + '</b><span>tugas selesai</span></div><div class="ch-kpi"><b>' + pct(avg) + '</b><span>rata-rata akurasi</span></div><div class="ch-kpi"><b>' + assignments().length + '</b><span>menunggu</span></div></section>' +
      '<section class="ch-card"><p class="ch-kicker">Peta skill</p>' + (keys.length ? '<ul class="ch-skill-list">' + keys.map(function (k) { var s = skills[k], acc = s.total ? s.correct / s.total : null; return '<li><span>' + esc(skillLabel(k)) + '</span><span class="ch-bar"><i style="width:' + Math.round((acc || 0) * 100) + '%"></i></span><b>' + pct(acc) + '</b><small>' + s.total + ' soal</small></li>'; }).join('') + '</ul>' : '<p class="ch-muted">Kerjakan tugas atau sesi belajar untuk mengisi peta skill.</p>') + '</section>' +
      '<section class="ch-card"><p class="ch-kicker">Yang dilihat guru</p><p class="ch-muted">Nama depan, akurasi per skill, tugas yang selesai + soal yang keliru (untuk membantu menjelaskan ulang). Jawaban mentah dan transkrip tidak dikirim.</p></section></div>';
  }
  function optionButtons(item, chosen, revealed) {
    return '<div class="ch-options">' + item.options.map(function (o, i) { var cls = 'ch-option'; if (revealed) { if (i === item.answer) cls += ' is-correct'; else if (i === chosen) cls += ' is-wrong'; } else if (i === chosen) cls += ' is-chosen'; return '<button type="button" class="' + cls + '" data-ch="answer" data-i="' + i + '"' + (revealed ? ' disabled' : '') + ' data-testid="class-option-' + i + '"><span class="ch-opt-key">' + String.fromCharCode(65 + i) + '</span>' + esc(o) + '</button>'; }).join('') + '</div>';
  }
  function runnerView() {
    var r = ui().runner;
    if (r.finished) { var res = r.result; return '<div class="ch-body"><section class="ch-card ch-result" data-testid="class-result"><p class="ch-kicker">' + t('umum.selesai', 'Selesai') + '</p><h2>' + esc(res.title) + '</h2><p class="ch-score">' + res.c + '<small>/' + res.t + '</small></p><p class="ch-muted">' + icon('send') + ' Hasil ini dikirim ke <b>' + esc(res.teacher || 'guru') + '</b> — termasuk soal yang perlu diulang.</p><div class="ch-actions"><button type="button" class="ch-btn is-primary" data-ch="review" data-id="' + esc(r.aid) + '">Lihat pembahasan</button><button type="button" class="ch-btn is-ghost" data-ch="close-runner">' + t('kelas.kembali-ke-tugas', 'Kembali ke Tugas') + '</button></div></section></div>'; }
    var a = currentAssignment();
    if (!a) { ui().runner = null; saveUi(); return tugasView(assignments(), subs()); }
    while (r.idx < r.order.length && !resolveItem(a, a.itemIds[r.order[r.idx]])) r.idx += 1;
    if (r.idx >= r.order.length) { setTimeout(finishRunner, 0); return '<div class="ch-body"><p class="ch-muted">Menyimpan hasil…</p></div>'; }
    var id = a.itemIds[r.order[r.idx]], item = resolveItem(a, id);
    var fb = '';
    if (r.revealed) { var ok = r.chosen === item.answer, why = item.why && item.why[r.chosen]; fb = '<div class="ch-feedback ' + (ok ? 'is-ok' : 'is-no') + '" data-testid="class-feedback"><b>' + (ok ? 'Benar!' : t('kelas.belum-tepat', 'Belum tepat.')) + '</b> ' + (ok ? esc(item.note || '') : esc(why || ('Jawaban yang benar: ' + item.options[item.answer] + '.' + (item.note ? ' ' + item.note : '')))) + '</div>'; }
    return '<div class="ch-body ch-runner" data-testid="class-runner"><div class="ch-runner-top"><button type="button" class="ch-btn is-ghost is-small" data-ch="close-runner">' + icon('chevron-left') + ' ' + t('kelas.simpan-keluar', 'Simpan & keluar') + '</button><span class="ch-muted">' + esc(a.teacher ? 'Dari ' + a.teacher : a.from || '') + '</span>' + (r.timerEnd ? '<span class="ch-timer" data-ch-timer>' + timerText(r) + '</span>' : '') + '</div>' +
      '<p class="ch-progress-text">' + t('flow.soal-progress', 'Soal {n} dari {total}').replace('{n}', r.idx + 1).replace('{total}', r.order.length) + '</p><span class="ch-bar is-thin"><i style="width:' + Math.round(r.idx / r.order.length * 100) + '%"></i></span>' +
      '<article class="ch-card ch-question">' + (item.context ? '<p class="ch-context">' + esc(item.context) + '</p>' : '') + '<h2>' + esc(item.prompt) + '</h2>' + optionButtons(item, r.chosen, r.revealed) + fb +
      (r.revealed ? '<div class="ch-actions"><button type="button" class="ch-btn is-primary" data-ch="next" data-testid="class-next">' + (r.idx + 1 >= r.order.length ? t('umum.selesai', 'Selesai') : t('umum.lanjut', 'Lanjut')) + ' ' + icon('arrow-right') + '</button></div>' : '') + '</article></div>';
  }
  function reviewView(id) {
    var s = subs().filter(function (x) { return x.id === id; })[0]; if (!s) { ui().review = null; return tugasView(assignments(), subs()); }
    return '<div class="ch-body"><button type="button" class="ch-btn is-ghost is-small" data-ch="back">' + icon('chevron-left') + ' ' + t('umum.kembali', 'Kembali') + '</button><section class="ch-card"><p class="ch-kicker">Pembahasan · dari ' + esc(s.teacher || s.from || 'guru') + '</p><h2>' + esc(s.title) + '</h2><p class="ch-score">' + s.c + '<small>/' + s.t + '</small></p></section>' +
      '<ol class="ch-review-list">' + s.results.map(function (r, i) { var item = resolveItem(s, r.itemId); if (!item) return ''; var why = item.why && item.why[r.chosen]; return '<li class="ch-card ' + (r.correct ? 'is-ok' : 'is-no') + '"><p class="ch-muted">' + t('umum.soal', 'Soal') + ' ' + (i + 1) + ' · ' + esc(skillLabel(item.skill || s.skills[0])) + '</p><b>' + esc(item.prompt) + '</b><p>Jawabanmu: <span class="' + (r.correct ? 'ch-ok' : 'ch-no') + '">' + esc(item.options[r.chosen] || '—') + '</span>' + (r.correct ? '' : ' · Benar: <b>' + esc(item.options[item.answer]) + '</b>') + '</p>' + (!r.correct && (why || item.note) ? '<p class="ch-muted">' + esc(why || item.note) + '</p>' : '') + '</li>'; }).join('') + '</ol></div>';
  }
  function onStudentClick(e) {
    var b = e.target.closest ? e.target.closest('[data-ch]') : null; if (!b) return;
    var act = b.getAttribute('data-ch'), id = b.getAttribute('data-id'), u = ui();
    switch (act) {
      case 'tab': u.tab = b.getAttribute('data-tab'); u.review = null; u.editCode = false; break;
      case 'open': { var a = assignments().filter(function (x) { return x.id === id; })[0]; if (!a) return; if (u.runner && u.runner.aid === id && !u.runner.finished) { u.paused = false; saveUi(); renderStudent(); return; } startRunner(a); return; }
      case 'answer': answerRunner(b.getAttribute('data-i')); return;
      case 'next': nextRunner(); return;
      case 'close-runner': closeRunner(); return;
      case 'review': u.review = id; if (u.runner && u.runner.finished) u.runner = null; u.paused = false; break;
      case 'back': u.review = null; break;
      case 'resend': try { LF() && LF().pushToClass(); } catch (_) {} if (sEnv.toast) sEnv.toast('Laporan dikirim ulang ke guru.'); return;
      case 'change-code': u.editCode = true; break;
      case 'tutor': if (sEnv.openTutor) { sEnv.openTutor(); } return;
      case 'learn': if (sEnv.go) sEnv.go('learn'); return;
      default: return;
    }
    saveUi(); renderStudent();
  }
  function onStudentSubmit(e) {
    var f = e.target.closest ? e.target.closest('[data-ch-form]') : null; if (!f) return; e.preventDefault();
    if (f.getAttribute('data-ch-form') === 'join') { var ok = setClassCode(new FormData(f).get('code')); if (sEnv.toast) sEnv.toast(ok ? 'Kode kelas tersimpan. Tugas guru akan muncul otomatis.' : 'Kode tidak valid — bentuknya FZ-XXXXXX.'); ui().editCode = false; saveUi(); renderStudent(); }
  }

  /* ===================================================================================== */
  /* GURU (dipasang di dalam Ruang Guru)                                                    */
  /* ===================================================================================== */
  var tUi = { tab: 'kelas', expand: null, resultId: null, draft: null };
  var TABS = [['kelas', t('kelas.kelas-saya', 'Kelas Saya'), 'users'], ['tugas', t('umum.tugas', 'Tugas'), 'clipboard-list'], ['buat', t('kelas.buat-tugas-judul', 'Buat Tugas'), 'plus-circle'], ['hasil', 'Hasil', 'bar-chart-3'], ['braincore', 'Braincore', 'brain']];
  function mountTeacher(el, env) {
    el.innerHTML = teacherMarkup(env);
    if (!el.__chBound) { el.__chBound = true; el.addEventListener('click', function (e) { onTeacherClick(e, env); }); el.addEventListener('submit', function (e) { onTeacherSubmit(e, env); }); el.addEventListener('input', function (e) { onTeacherInput(e, env); }); el.addEventListener('change', function (e) { onTeacherInput(e, env); }); }
  }
  function teacherMarkup(env) {
    var c = env.cls();
    var body = !c ? '<section class="ch-card ch-empty">' + icon('school') + '<p>' + t('kelas.buat-kelas-dulu', 'Buat kelas dulu, lalu Kelas menjadi pusat tugas, hasil, dan insight.') + '</p><button type="button" class="tg-btn is-primary" data-tg="modal" data-kind="new-class">' + t('kelas.buat-kelas', 'Buat kelas') + '</button></section>' : tUi.tab === 'tugas' ? tTugas(c, env) : tUi.tab === 'buat' ? tBuat(c, env) : tUi.tab === 'hasil' ? tHasil(c, env) : tUi.tab === 'braincore' ? tBraincore(c, env) : tKelas(c, env);
    return '<div class="ch ch-teacher" data-testid="class-hub-teacher"><p class="ch-principle">' + icon('brain') + ' ' + t('kelas.braincore-alur-dot', 'Braincore menyarankan · Guru memutuskan · Murid belajar') + '</p><nav class="ch-tabs is-teacher" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" class="ch-tab' + (tUi.tab === t[0] ? ' is-active' : '') + '" data-ch="ttab" data-tab="' + t[0] + '" data-testid="tclass-tab-' + t[0] + '">' + icon(t[2]) + '<span>' + t[1] + '</span></button>'; }).join('') + '</nav>' + body + '</div>';
  }
  function studentRec(a, s) { return { done: a.done && a.done[s.id], startedAt: a.progress && a.progress[s.id] }; }
  function statusCounts(c, a) { var TS = T(), out = { belum: 0, sedang: 0, selesai: 0, terlambat: 0, total: 0 }; c.students.filter(function (s) { return TS.targeted(a, s); }).forEach(function (s) { out.total++; out[statusOf(a, studentRec(a, s)).id]++; }); return out; }
  function tKelas(c, env) {
    var TS = T(), stt = TS.classStats(c), sync = TS.syncLabel(c);
    return '<div class="ch-body"><section class="ch-card ch-class-card"><div class="ch-card-top"><div><p class="ch-kicker">' + esc(c.level) + ' · ' + esc(c.subject || 'English') + '</p><h2>' + esc(c.name) + '</h2></div><span class="ch-sync is-' + sync.state + '">' + esc(sync.text) + '</span></div><p class="ch-muted">Kode kelas <b class="ch-mono">' + esc(c.code) + '</b> — murid memasukkannya di tab Kelas ▸ Kelas Saya. Setelah itu tugasmu masuk ke lonceng mereka dan hasilnya kembali ke sini.</p>' +
      '<div class="ch-kpis"><div class="ch-kpi"><b>' + stt.total + '</b><span>murid</span></div><div class="ch-kpi"><b>' + stt.active7 + '</b><span>aktif 7 hari</span></div><div class="ch-kpi"><b>' + pct(stt.avgAcc) + '</b><span>akurasi</span></div><div class="ch-kpi"><b>' + stt.openAssignments + '</b><span>tugas terbuka</span></div></div>' +
      '<div class="ch-actions"><button type="button" class="tg-btn is-primary" data-tg="modal" data-kind="add-students" data-testid="tclass-add-students">' + icon('user-plus') + ' ' + t('kelas.tambah-murid', 'Tambah murid') + '</button><button type="button" class="tg-btn is-ghost" data-tg="sync" data-testid="tclass-sync">' + icon('refresh-cw') + ' Sinkron</button><button type="button" class="tg-btn is-ghost" data-tg="copy" data-text="' + esc(c.code) + '">' + icon('copy') + ' Salin kode</button><button type="button" class="tg-btn is-ghost" data-ch="ttab" data-tab="buat">' + icon('plus') + ' ' + t('kelas.buat-tugas', 'Buat tugas') + '</button></div></section>' +
      '<section><h3 class="ch-h2">' + t('umum.murid', 'Murid') + ' <small>' + c.students.length + '</small></h3>' + (c.students.length ? '<div class="ch-students">' + c.students.map(function (s) { var r = TS.risk(c, s), pend = TS.pendingAssignments(c, s), d = TS.daysSince(s.lastActiveAt); return '<button type="button" class="ch-card ch-student" data-tg="drawer" data-id="' + esc(s.id) + '" data-testid="tclass-student-' + esc(s.id) + '"><b>' + esc(s.name) + '</b><small>' + (d == null ? 'belum pernah aktif' : d === 0 ? 'aktif hari ini' : 'aktif ' + d + ' hari lalu') + '</small><span class="ch-row"><span class="ch-status is-' + (r.level === 'aman' ? 'selesai' : r.level === 'risiko' ? 'terlambat' : 'sedang') + '">' + esc(r.level === 'aman' ? 'Aman' : r.level === 'risiko' ? 'Berisiko' : 'Pantau') + '</span>' + (pend.length ? '<small>' + pend.length + ' tugas tertunda</small>' : '') + '</span></button>'; }).join('') + '</div>' : '<p class="ch-muted">' + t('kelas.belum-ada-murid', 'Belum ada murid. Tambahkan nama, atau biarkan murid bergabung sendiri lewat kode kelas.') + '</p>') + '</section></div>';
  }
  function itemList(a) { return a.itemIds.map(function (id, i) { var q = resolveItem(a, id); if (!q) return '<li class="ch-muted">Soal ' + (i + 1) + ' (' + esc(id) + ') tidak dapat ditampilkan.</li>'; var custom = (a.items || []).some(function (x) { return x.id === id; }); return '<li><p class="ch-muted">Soal ' + (i + 1) + ' · ' + esc(skillLabel(q.skill)) + ' · ' + (custom ? 'soal guru' : 'bank FIEZEL') + '</p>' + (q.context ? '<p class="ch-context">' + esc(q.context) + '</p>' : '') + '<b>' + esc(q.prompt) + '</b><ol class="ch-opts-inline">' + q.options.map(function (o, j) { return '<li class="' + (j === q.answer ? 'is-key' : '') + '">' + esc(o) + '</li>'; }).join('') + '</ol></li>'; }).join(''); }
  function tTugas(c, env) {
    var TS = T(), list = (c.assignments || []).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    return '<div class="ch-body"><div class="ch-row ch-between"><h3 class="ch-h2">' + t('kelas.tugas-ujian', 'Tugas & ujian') + ' <small>' + list.length + '</small></h3><button type="button" class="tg-btn is-primary" data-ch="ttab" data-tab="buat" data-testid="tclass-new">' + icon('plus') + ' ' + t('kelas.buat-tugas', 'Buat tugas') + '</button></div>' +
      (list.length ? list.map(function (a) {
        var sc = statusCounts(c, a), open = tUi.expand === a.id, sentAll = a.sent && a.sent.all;
        return '<article class="ch-card ch-assign' + (a.mode === 'ujian' ? ' is-exam' : '') + '" data-testid="tclass-assign-' + esc(a.id) + '"><div class="ch-card-top"><div><p class="ch-kicker">' + (a.mode === 'ujian' ? 'Ujian mini · ' + a.timer + ' mnt' : 'Latihan · ±' + a.minutes + ' mnt') + ' · ' + (a.source === 'tulis' ? 'soal guru' : a.source === 'impor' ? 'soal impor' : a.items && a.items.length ? 'campuran' : 'bank FIEZEL') + (a.review ? ' · Braincore ' + a.review.ready + '/' + a.review.count + ' siap' : '') + '</p><h3>' + esc(a.title) + '</h3></div><span class="ch-deadline' + (a.deadline && a.deadline < today() && sc.selesai < sc.total ? ' is-late' : '') + '">' + icon('calendar') + ' ' + esc(a.deadline ? 'Tenggat ' + fmtDate(a.deadline) : 'Tanpa tenggat') + '</span></div>' +
          '<p class="ch-muted">' + a.skills.map(skillLabel).join(' + ') + ' · ' + a.itemIds.length + ' soal · ' + (a.targets ? sc.total + ' murid terpilih' : 'seluruh kelas') + (sentAll ? ' · terkirim ' + esc(fmtDate(sentAll)) : ' · <b>belum dikirim</b>') + '</p>' +
          '<div class="ch-status-row" data-testid="tclass-status-' + esc(a.id) + '"><span class="ch-status is-belum">' + sc.belum + ' belum mulai</span><span class="ch-status is-sedang">' + sc.sedang + ' mengerjakan</span><span class="ch-status is-selesai">' + sc.selesai + ' selesai</span><span class="ch-status is-terlambat">' + sc.terlambat + ' terlambat</span></div>' +
          '<div class="ch-actions"><button type="button" class="tg-btn is-small is-primary" data-tg="send-assign" data-id="' + esc(a.id) + '" data-testid="tclass-send-' + esc(a.id) + '">' + icon('send') + (sentAll ? ' Kirim ulang' : ' ' + t('kelas.kirim-ke-murid', 'Kirim ke murid')) + '</button><button type="button" class="tg-btn is-small is-ghost" data-ch="expand" data-id="' + esc(a.id) + '" data-testid="tclass-expand-' + esc(a.id) + '">' + icon(open ? 'chevron-up' : 'list-checks') + (open ? ' ' + t('umum.tutup', 'Tutup') : ' ' + t('kelas.status-murid-soal', 'Status murid & soal')) + '</button><button type="button" class="tg-btn is-small is-ghost" data-ch="result" data-id="' + esc(a.id) + '">' + icon('bar-chart-3') + ' Hasil</button><button type="button" class="tg-btn is-small is-ghost" data-tg="modal" data-kind="share-assign" data-id="' + esc(a.id) + '">' + icon('qr-code') + ' Kode</button></div>' +
          (open ? '<div class="ch-expand"><h4>' + t('kelas.status-per-murid', 'Status per murid') + '</h4><ul class="ch-mini-list">' + c.students.filter(function (s) { return TS.targeted(a, s); }).map(function (s) { var st = statusOf(a, studentRec(a, s)), d = a.done && a.done[s.id]; return '<li><span class="ch-grow">' + esc(s.name) + '</span>' + statusChip(st) + (d ? '<b>' + pct(d.acc) + '</b>' : '<button type="button" class="tg-btn is-small is-ghost" data-tg="send-assign" data-id="' + esc(a.id) + '" data-sid="' + esc(s.id) + '">' + icon('send') + '</button>') + '</li>'; }).join('') + '</ul><h4>' + t('kelas.soal-persis', 'Soal persis yang diterima murid') + '</h4><ol class="ch-item-list" data-testid="tclass-items-' + esc(a.id) + '">' + itemList(a) + '</ol></div>' : '') + '</article>';
      }).join('') : '<section class="ch-card ch-empty">' + icon('clipboard-list') + '<p>' + t('kelas.belum-ada-tugas', 'Belum ada tugas. Susun dari bank FIEZEL, tulis sendiri, atau impor — Braincore meninjau sebelum dikirim.') + '</p></section>') + '</div>';
  }
  // ---- Buat tugas: 3 langkah (Sumber → Tinjauan Braincore → Kirim) ----------------------------
  function draft(c) { if (!tUi.draft) tUi.draft = { step: 1, source: 'bank', title: '', skills: ['past_tense'], count: 10, deadline: T().today(Date.now() + 2 * T().DAY), mode: 'latihan', targets: [], raw: '', items: [], bankIds: [], review: null, finals: [], approved: {}, useSuggest: {} }; return tUi.draft; }
  function bankSkills() { var TS = T(); return TS.SKILL_ORDER.filter(function (k) { return k !== 'speaking' && B() && B().SKILLS[k]; }); }
  function tBuat(c, env) {
    var d = draft(c), TS = T();
    var steps = '<ol class="ch-steps">' + ['Sumber soal', 'Tinjauan Braincore', t('umum.kirim', 'Kirim')].map(function (s, i) { return '<li class="' + (d.step === i + 1 ? 'is-current' : d.step > i + 1 ? 'is-done' : '') + '"><span>' + (i + 1) + '</span>' + s + '</li>'; }).join('') + '</ol>';
    if (d.step === 1) {
      return '<div class="ch-body">' + steps + '<form class="ch-card ch-form-grid" data-ch-form="draft-source" data-testid="tclass-draft-form">' +
        '<div class="ch-seg" role="tablist">' + [['bank', 'Bank FIEZEL', 'library'], ['tulis', 'Tulis sendiri', 'pencil'], ['impor', 'Impor teks', 'file-up']].map(function (s) { return '<button type="button" class="' + (d.source === s[0] ? 'is-on' : '') + '" data-ch="source" data-source="' + s[0] + '" data-testid="tclass-source-' + s[0] + '">' + icon(s[2]) + ' ' + s[1] + '</button>'; }).join('') + '</div>' +
        '<label class="tg-label">Judul<input name="title" maxlength="80" value="' + esc(d.title) + '" placeholder="Kosongkan untuk judul otomatis" data-testid="tclass-title"></label>' +
        '<label class="tg-label">Skill' + (d.source === 'bank' ? ' (1–3)' : ' utama') + '</label><div class="tg-chips tg-chips-select">' + bankSkills().concat(d.source === 'bank' ? [] : ['grammar', 'vocabulary', 'reading']).map(function (k) { return '<label class="tg-chip is-check"><input type="' + (d.source === 'bank' ? 'checkbox' : 'radio') + '" name="skills" value="' + k + '"' + (d.skills.indexOf(k) !== -1 ? ' checked' : '') + '><span>' + esc(skillLabel(k)) + '</span></label>'; }).join('') + '</div>' +
        (d.source === 'bank' ? '<label class="tg-label">Jumlah soal<select name="count">' + [5, 8, 10, 12, 15, 20].map(function (n) { return '<option' + (n === Number(d.count) ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' : '') +
        (d.source === 'tulis' ? '<div class="ch-write" data-testid="tclass-write">' + (d.items.length ? '<ol class="ch-item-list">' + d.items.map(function (q, i) { return '<li><b>' + esc(q.prompt) + '</b><ol class="ch-opts-inline">' + q.options.map(function (o, j) { return '<li class="' + (j === q.answer ? 'is-key' : '') + '">' + esc(o) + '</li>'; }).join('') + '</ol><button type="button" class="tg-link" data-ch="drop-item" data-i="' + i + '">hapus</button></li>'; }).join('') + '</ol>' : '') +
          '<fieldset class="ch-fieldset"><legend>' + t('kelas.soal-baru', 'Soal baru') + '</legend><label class="tg-label">Pertanyaan (gunakan ___ untuk rumpang)<input name="q_prompt" maxlength="400" placeholder="She ___ to school yesterday." data-testid="tclass-q-prompt"></label><div class="ch-form-row">' + [0, 1, 2, 3].map(function (i) { return '<label class="tg-label">' + String.fromCharCode(65 + i) + '<input name="q_opt' + i + '" maxlength="120"' + (i < 2 ? ' placeholder="wajib"' : '') + ' data-testid="tclass-q-opt' + i + '"></label>'; }).join('') + '</div><label class="tg-label">Kunci<select name="q_answer" data-testid="tclass-q-answer">' + [0, 1, 2, 3].map(function (i) { return '<option value="' + i + '">' + String.fromCharCode(65 + i) + '</option>'; }).join('') + '</select></label><button type="button" class="tg-btn is-ghost" data-ch="add-item" data-testid="tclass-add-item">' + icon('plus') + ' ' + t('kelas.tambah-soal', 'Tambah soal') + '</button></fieldset></div>' : '') +
        (d.source === 'impor' ? '<label class="tg-label">Tempel soal — satu baris per soal: <code>pertanyaan | A | B | C | D | kunci</code> (kunci: huruf, nomor, atau teks). Blok bernomor dengan A./B./C./D. dan “Answer: B” juga dikenali.<textarea name="raw" rows="8" placeholder="She ___ to school yesterday. | go | went | goes | going | B" data-testid="tclass-import-raw">' + esc(d.raw) + '</textarea></label>' + (d.importErrors && d.importErrors.length ? '<p class="tg-error">' + d.importErrors.length + ' baris tidak terbaca: ' + esc(d.importErrors.slice(0, 3).map(function (e) { return 'baris ' + e.line; }).join(', ')) + '</p>' : '') : '') +
        '<div class="ch-form-row"><label class="tg-label">Tenggat<input type="date" name="deadline" value="' + esc(d.deadline) + '" data-testid="tclass-deadline"></label><label class="tg-label">Mode<select name="mode" data-testid="tclass-mode"><option value="latihan"' + (d.mode === 'latihan' ? ' selected' : '') + '>Latihan — umpan balik tiap soal</option><option value="ujian"' + (d.mode === 'ujian' ? ' selected' : '') + '>Ujian mini — acak + timer</option></select></label></div>' +
        '<label class="tg-label">Untuk siapa</label><div class="tg-chips tg-chips-select tg-chips-scroll"><label class="tg-chip is-check"><input type="radio" name="scope" value="all"' + (d.targets.length ? '' : ' checked') + '><span>Seluruh kelas</span></label>' + c.students.map(function (s) { return '<label class="tg-chip is-check"><input type="checkbox" name="targets" value="' + esc(s.id) + '"' + (d.targets.indexOf(s.id) !== -1 ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>'; }).join('') + '</div>' +
        '<div class="ch-actions"><button type="submit" class="tg-btn is-primary" data-testid="tclass-to-review">' + icon('brain') + ' Tinjau dengan Braincore</button></div></form></div>';
    }
    if (d.step === 2) {
      var rv = d.review, allApproved = rv.items.length && rv.items.every(function (_, i) { return d.approved[i]; });
      return '<div class="ch-body">' + steps + '<section class="ch-card ch-review-summary" data-testid="tclass-review-summary"><div class="ch-card-top"><div><p class="ch-kicker">Tinjauan Braincore · ' + rv.summary.count + ' soal</p><h3>' + rv.summary.ready + ' siap · ' + (rv.summary.count - rv.summary.ready) + ' perlu keputusan guru</h3></div><span class="ch-status is-sedang">kesulitan rata-rata ' + rv.summary.avgDifficulty + '</span></div><p class="ch-muted">Estimasi CEFR: ' + Object.keys(rv.summary.levels).map(function (l) { return l + ' ×' + rv.summary.levels[l]; }).join(', ') + ' · Skill: ' + Object.keys(rv.summary.skills).map(function (k) { return skillLabel(k) + ' ×' + rv.summary.skills[k]; }).join(', ') + (rv.summary.misconceptions.length ? ' · Miskonsepsi yang diuji: ' + rv.summary.misconceptions.slice(0, 3).map(function (m) { return m.label; }).join('; ') : '') + '</p>' + rv.setIssues.map(function (i) { return '<p class="tg-error">' + esc(i.text) + '</p>'; }).join('') + '<div class="ch-actions"><button type="button" class="tg-btn is-ghost is-small" data-ch="approve-all" data-testid="tclass-approve-all">' + icon('check-check') + ' Setujui semua</button><button type="button" class="tg-btn is-ghost is-small" data-ch="step" data-step="1">' + icon('chevron-left') + ' ' + t('kelas.ubah-sumber', 'Ubah sumber') + '</button></div></section>' +
        rv.items.map(function (r, i) { return reviewCard(r, i, d); }).join('') +
        '<div class="ch-actions ch-sticky"><button type="button" class="tg-btn is-primary" data-ch="step" data-step="3"' + (allApproved ? '' : ' disabled') + ' data-testid="tclass-to-send">' + icon('arrow-right') + ' ' + t('kelas.lanjut-kirim', 'Lanjut ke kirim') + (allApproved ? '' : ' (setujui semua soal dulu)') + '</button></div></div>';
    }
    var finals = d.finals, custom = finals.filter(function (q) { return !q.fromBank; }), ids = finals.map(function (q) { return q.id; });
    return '<div class="ch-body">' + steps + '<section class="ch-card" data-testid="tclass-confirm"><p class="ch-kicker">Siap dikirim</p><h3>' + esc(d.title || ('Latihan ' + d.skills.map(skillLabel).join(' + '))) + '</h3><p class="ch-muted">' + ids.length + ' soal (' + (ids.length - custom.length) + ' bank FIEZEL, ' + custom.length + ' soal guru) · ' + (d.mode === 'ujian' ? 'ujian mini' : 'latihan') + ' · ' + (d.deadline ? 'tenggat ' + fmtDate(d.deadline) : 'tanpa tenggat') + ' · ' + (d.targets.length ? d.targets.length + ' murid terpilih' : 'seluruh kelas') + '</p><ol class="ch-item-list">' + itemList({ itemIds: ids, items: custom }) + '</ol>' +
      '<div class="ch-actions"><button type="button" class="tg-btn is-primary" data-ch="commit" data-send="1" data-testid="tclass-commit-send">' + icon('send') + ' ' + t('kelas.simpan-kirim', 'Simpan & kirim ke murid') + '</button><button type="button" class="tg-btn is-ghost" data-ch="commit" data-testid="tclass-commit-draft">' + t('kelas.simpan-saja', 'Simpan saja') + '</button><button type="button" class="tg-btn is-ghost" data-ch="step" data-step="2">' + icon('chevron-left') + ' ' + t('umum.kembali', 'Kembali') + '</button></div></section></div>';
  }
  function reviewCard(r, i, d) {
    var a = r.analysis, o = r.original, f = d.finals[i] || o, sug = r.suggested, approved = !!d.approved[i], usingSuggest = !!d.useSuggest[i];
    var chips = '<span class="ch-tag">' + esc(a.skillLabel) + '</span><span class="ch-tag">CEFR ≈ ' + a.cefr + '</span><span class="ch-tag">kesulitan ' + a.difficulty + ' · ' + a.difficultyBand + '</span><span class="ch-tag is-' + (a.verdict === 'siap' ? 'ok' : a.verdict === 'perlu-tinjau' ? 'warn' : 'err') + '">' + esc(a.verdict.replace('-', ' ')) + '</span>';
    var issues = a.quality.issues.length ? '<ul class="ch-issues">' + a.quality.issues.map(function (x) { return '<li class="is-' + x.severity + '">' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '<p class="ch-ok">' + icon('check') + ' Tidak ada masalah kualitas terdeteksi.</p>';
    var dist = '<ul class="ch-distractors">' + a.distractors.filter(function (x) { return !x.isAnswer; }).map(function (x) { return '<li><b>' + esc(x.text) + '</b> — distraktor ' + x.plausibility + (x.misconception ? ' · menguji: <i>' + esc(x.misconception.label) + '</i>' : ' · tidak memetakan miskonsepsi tertentu') + '</li>'; }).join('') + '</ul>';
    var finalForm = o.fromBank ? '<p class="ch-muted">' + t('kelas.bank-terkurasi', 'Soal bank FIEZEL sudah terkurasi — pakai apa adanya atau hapus dari set.') + '</p>' : '<div class="ch-final-form" data-ch-final="' + i + '"><label class="tg-label">Pertanyaan<textarea rows="2" name="prompt" data-ch-field="prompt" data-i="' + i + '">' + esc(f.prompt) + '</textarea></label><div class="ch-form-row">' + f.options.map(function (op, j) { return '<label class="tg-label ch-opt-edit"><input type="radio" name="ans' + i + '" value="' + j + '"' + (j === f.answer ? ' checked' : '') + ' data-ch-field="answer" data-i="' + i + '" title="kunci"><input name="opt' + j + '" value="' + esc(op) + '" maxlength="120" data-ch-field="opt" data-j="' + j + '" data-i="' + i + '"></label>'; }).join('') + '</div></div>';
    return '<article class="ch-card ch-review-card' + (approved ? ' is-approved' : '') + '" data-testid="tclass-review-' + i + '"><div class="ch-card-top"><p class="ch-kicker">Soal ' + (i + 1) + (o.fromBank ? ' · bank FIEZEL' : ' · soal guru') + '</p><label class="ch-approve"><input type="checkbox" data-ch="approve" data-i="' + i + '"' + (approved ? ' checked' : '') + ' data-testid="tclass-approve-' + i + '"> Setujui</label></div>' +
      '<div class="ch-pipeline"><section><h5>' + t('kelas.langkah-soal-asli', '1 · Soal asli') + '</h5><b>' + esc(o.prompt) + '</b><ol class="ch-opts-inline">' + o.options.map(function (op, j) { return '<li class="' + (j === o.answer ? 'is-key' : '') + '">' + esc(op) + '</li>'; }).join('') + '</ol></section>' +
      '<section><h5>2 · Analisis Braincore</h5><div class="ch-tags">' + chips + '</div><p class="ch-muted ch-small">' + esc(a.cefrRationale) + '</p>' + issues + dist + (a.remediation.needed ? '<p class="ch-muted ch-small">' + icon('life-buoy') + ' Bila banyak murid keliru: ' + esc(a.remediation.lesson) + '</p>' : '') + '</section>' +
      '<section><h5>3 · Saran perbaikan</h5>' + (sug.changes.length && !o.fromBank ? '<ul class="ch-changes">' + sug.changes.map(function (ch) { return '<li>' + esc(ch) + '</li>'; }).join('') + '</ul><b>' + esc(sug.question.prompt) + '</b><ol class="ch-opts-inline">' + sug.question.options.map(function (op, j) { return '<li class="' + (j === sug.question.answer ? 'is-key' : '') + '">' + esc(op) + '</li>'; }).join('') + '</ol><div class="ch-actions"><button type="button" class="tg-btn is-small ' + (usingSuggest ? 'is-ghost' : 'is-primary') + '" data-ch="use-suggest" data-i="' + i + '" data-testid="tclass-use-suggest-' + i + '">' + (usingSuggest ? icon('undo-2') + ' Kembalikan asli' : icon('sparkles') + ' Pakai saran') + '</button></div>' : '<p class="ch-muted">Tidak ada perubahan yang disarankan.</p>') + '</section>' +
      '<section><h5>' + t('kelas.langkah-soal-final', '4 · Soal final') + '</h5>' + finalForm + '<button type="button" class="tg-link" data-ch="drop-review" data-i="' + i + '">hapus soal ini dari set</button></section></div></article>';
  }
  function buildReview(c, d) {
    var TS = T(), RV = R(), items = [];
    if (d.source === 'bank') { var per = Math.max(1, Math.round((Number(d.count) || 10) / d.skills.length)), seed = Date.now() % 997; d.skills.forEach(function (k, i) { B().pickFresh(k, per, { avoid: c.sentItemIds || [], seed: seed + i }).forEach(function (it) { items.push(Object.assign({}, it, { fromBank: true })); }); }); }
    else if (d.source === 'impor') { var p = RV.parseQuestions(d.raw); d.importErrors = p.errors; items = p.items.map(function (q) { q.skill = d.skills[0]; return q; }); }
    else items = d.items.map(function (q) { return Object.assign({}, q, { skill: q.skill || d.skills[0] }); });
    if (!items.length) return null;
    d.review = RV.analyzeSet(items, { level: c.level, skill: d.skills[0] });
    d.finals = d.review.items.map(function (r) { return Object.assign({}, r.original, { skill: r.analysis.skill }); });
    d.approved = {}; d.useSuggest = {};
    d.review.items.forEach(function (r, i) { if (r.original.fromBank || r.analysis.verdict === 'siap') d.approved[i] = true; });
    return d.review;
  }
  function commitDraft(c, env, send) {
    var TS = T(), d = draft(c), finals = d.finals, custom = finals.filter(function (q) { return !q.fromBank; }).map(function (q) { return { id: q.id, prompt: q.prompt, options: q.options, answer: q.answer, skill: q.skill || d.skills[0], context: q.context, why: q.why }; });
    var a = TS.buildAssignment({ title: d.title, skills: d.skills, itemIds: finals.map(function (q) { return q.id; }), items: custom, deadline: d.deadline, mode: d.mode, targets: d.targets, teacher: env.st().teacher.name || '', source: d.source, review: { count: d.review.summary.count, ready: d.review.summary.ready, avgDifficulty: d.review.summary.avgDifficulty, levels: d.review.summary.levels, misconceptions: d.review.summary.misconceptions.slice(0, 5), approvedAt: Date.now() } });
    c.assignments.push(a); c.sentItemIds = (c.sentItemIds || []).concat(a.itemIds).slice(-120);
    tUi.draft = null; tUi.tab = 'tugas'; tUi.expand = a.id; env.persist();
    if (send) { if (TS.syncAvailable() !== 'ok') { env.toast(TS.syncLabel(c).text + ' — tugas tersimpan, kirim lewat kode.'); env.rerender(); return; } var nTarget = a.targets ? a.targets.length : c.students.length; TS.sendAssignment(c, a, a.targets).then(function (r) { env.toast(r.ok ? t('kelas.tugas-dikirim-ke', 'Tugas dikirim ke') + ' ' + nTarget + ' ' + t('kelas.murid-muncul-tab', 'murid — muncul di tab Kelas mereka.') : t('kelas.tugas-gagal-kirim', 'Tugas tersimpan, tapi gagal dikirim (') + (r.error || 'unknown') + '). Coba "Kirim ke murid" lagi.'); env.persist(); env.rerender(); }); return; }
    env.toast(t('kelas.tugas-tersimpan', 'Tugas tersimpan. Kirim kapan saja dari tab Tugas.')); env.rerender();
  }
  // ---- Hasil & Braincore -----------------------------------------------------------------------
  function itemMisses(c, a) {
    var TS = T(), RV = R(), byItem = {}, mis = {};
    Object.keys(a.done || {}).forEach(function (sid) { var d = a.done[sid]; (d.w || []).forEach(function (w) { var rec = byItem[w.i] || (byItem[w.i] = { id: w.i, n: 0, choices: {} }); rec.n++; rec.choices[w.o] = (rec.choices[w.o] || 0) + 1; }); });
    var rows = Object.keys(byItem).map(function (id) { var rec = byItem[id], q = resolveItem(a, id), tags = []; if (q) { var an = RV.analyzeQuestion(q, { level: c.level, skill: q.skill }); Object.keys(rec.choices).forEach(function (o) { var dd = an.distractors[Number(o)]; var label = dd && dd.misconception ? dd.misconception.label : (q.why && q.why[o] ? String(q.why[o]).slice(0, 90) : null); if (label) { tags.push({ label: label, n: rec.choices[o] }); mis[label] = (mis[label] || 0) + rec.choices[o]; } }); } return { id: id, q: q, n: rec.n, tags: tags, index: a.itemIds.indexOf(id) }; }).sort(function (x, y) { return y.n - x.n; });
    return { rows: rows, misconceptions: Object.keys(mis).map(function (k) { return { label: k, n: mis[k] }; }).sort(function (x, y) { return y.n - x.n; }) };
  }
  function tHasil(c, env) {
    var TS = T(), list = (c.assignments || []).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (!list.length) return '<div class="ch-body"><section class="ch-card ch-empty">' + icon('bar-chart-3') + '<p>' + t('kelas.hasil-muncul', 'Hasil muncul setelah murid mengerjakan tugas. Buat tugas dulu.') + '</p></section></div>';
    var a = list.filter(function (x) { return x.id === tUi.resultId; })[0] || list[0], tgt = c.students.filter(function (s) { return TS.targeted(a, s); }), sc = statusCounts(c, a);
    var accs = tgt.map(function (s) { return a.done && a.done[s.id] ? a.done[s.id].acc : null; }).filter(function (v) { return v != null; }), avg = accs.length ? accs.reduce(function (x, y) { return x + y; }, 0) / accs.length : null, im = itemMisses(c, a);
    return '<div class="ch-body"><label class="tg-label">' + t('umum.tugas', 'Tugas') + '<select data-ch-select="result" data-testid="tclass-result-select">' + list.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === a.id ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('') + '</select></label>' +
      '<section class="ch-kpis"><div class="ch-kpi"><b>' + sc.selesai + '<small>/' + sc.total + '</small></b><span>selesai</span></div><div class="ch-kpi"><b>' + pct(avg) + '</b><span>rata-rata</span></div><div class="ch-kpi"><b>' + accs.filter(function (v) { return v < 0.5; }).length + '</b><span>murid &lt;50%</span></div><div class="ch-kpi"><b>' + sc.terlambat + '</b><span>terlambat</span></div></section>' +
      '<section class="ch-card"><p class="ch-kicker">Per murid</p><ul class="ch-mini-list" data-testid="tclass-result-students">' + tgt.map(function (s) { var st = statusOf(a, studentRec(a, s)), d = a.done && a.done[s.id]; return '<li><span class="ch-grow">' + esc(s.name) + '</span>' + statusChip(st) + (d ? '<span class="ch-bar"><i style="width:' + Math.round((d.acc || 0) * 100) + '%"></i></span><b>' + pct(d.acc) + '</b>' + (d.w && d.w.length ? '<small>' + d.w.length + ' keliru</small>' : '') : '<small class="ch-muted">—</small>') + '</li>'; }).join('') + '</ul></section>' +
      '<section class="ch-card"><p class="ch-kicker">' + t('kelas.soal-sering-keliru', 'Soal yang paling sering keliru') + '</p>' + (im.rows.length ? '<ol class="ch-item-list" data-testid="tclass-result-items">' + im.rows.slice(0, 8).map(function (r) { return '<li><p class="ch-muted">Soal ' + (r.index + 1) + ' · <b>' + r.n + ' murid keliru</b></p>' + (r.q ? '<b>' + esc(r.q.prompt) + '</b><p class="ch-muted ch-small">Kunci: ' + esc(r.q.options[r.q.answer]) + '</p>' : '<p class="ch-muted">' + esc(r.id) + '</p>') + (r.tags.length ? '<div class="ch-tags">' + r.tags.map(function (t) { return '<span class="ch-tag is-warn">' + esc(t.label) + ' ×' + t.n + '</span>'; }).join('') + '</div>' : '') + '</li>'; }).join('') + '</ol>' : '<p class="ch-muted">' + t('kelas.belum-ada-bukti-soal', 'Belum ada bukti per-soal. Muncul otomatis setelah murid menyelesaikan tugas di aplikasi.') + '</p>') + '</section>' +
      (im.misconceptions.length ? '<section class="ch-card ch-card-ink"><p class="ch-kicker">Miskonsepsi dari tugas ini</p><ol class="ch-mis">' + im.misconceptions.slice(0, 4).map(function (m) { return '<li><b>' + esc(m.label) + '</b><small>' + m.n + ' jawaban</small></li>'; }).join('') + '</ol><div class="ch-actions"><button type="button" class="tg-btn is-primary is-small" data-ch="remedial" data-skill="' + esc(a.skills[0]) + '" data-title="' + esc('Remedial: ' + a.title) + '" data-testid="tclass-remedial">' + icon('life-buoy') + ' ' + t('kelas.buat-remedial', 'Buat tugas remedial') + '</button></div></section>' : '') + '</div>';
  }
  function tBraincore(c, env) {
    var TS = T(), map = TS.classSkillMap(c), mis = TS.misconceptions(c), agg = {}, n = 0;
    (c.assignments || []).forEach(function (a) { itemMisses(c, a).misconceptions.forEach(function (m) { agg[m.label] = (agg[m.label] || 0) + m.n; n += m.n; }); });
    var fromEvidence = Object.keys(agg).map(function (k) { return { label: k, n: agg[k] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 5);
    var weakest = map.filter(function (m) { return m.acc != null; }).sort(function (x, y) { return x.acc - y.acc; })[0];
    return '<div class="ch-body"><section class="ch-card ch-card-ink"><p class="ch-kicker">Prinsip</p><h3>' + t('kelas.braincore-alur', 'Braincore menyarankan. Guru memutuskan. Murid belajar.') + '</h3><p class="ch-muted">Semua angka di bawah berasal dari bukti murid di kelas ini: laporan sinkron dan soal yang keliru pada tugasmu. Tidak ada AI cloud, tidak ada tebakan tanpa data.</p></section>' +
      '<section class="ch-card"><p class="ch-kicker">Peta skill kelas</p><ul class="ch-skill-list">' + map.map(function (m) { return '<li><span>' + esc(m.label) + '</span><span class="ch-bar"><i style="width:' + Math.round((m.acc || 0) * 100) + '%"></i></span><b>' + pct(m.acc) + '</b><small>' + (m.low ? m.low + ' murid &lt;50%' : m.n ? m.n + ' soal' : 'belum ada data') + '</small></li>'; }).join('') + '</ul></section>' +
      '<section class="ch-card"><p class="ch-kicker">Miskonsepsi terdeteksi</p>' + (fromEvidence.length ? '<p class="ch-muted ch-small">Dari ' + n + ' jawaban keliru pada tugas yang kamu kirim.</p><ol class="ch-mis">' + fromEvidence.map(function (m) { return '<li><b>' + esc(m.label) + '</b><small>' + m.n + '×</small></li>'; }).join('') + '</ol>' : '') + (mis.length ? '<p class="ch-muted ch-small">Dari pola skill kelas:</p><ol class="ch-mis">' + mis.map(function (m) { return '<li><b>' + esc(m.label) + '</b> — ' + esc(m.pattern) + '<small>' + esc(m.lesson) + '</small></li>'; }).join('') + '</ol>' : '') + (!fromEvidence.length && !mis.length ? '<p class="ch-muted">' + t('kelas.belum-cukup-bukti', 'Belum ada bukti cukup. Kirim satu tugas dan tunggu murid mengerjakannya.') + '</p>' : '') + '</section>' +
      '<section class="ch-card"><p class="ch-kicker">Saran Braincore untuk langkah berikutnya</p>' + (weakest ? '<p>Skill terlemah kelas: <b>' + esc(weakest.label) + '</b> (' + pct(weakest.acc) + '). Saran: tugas remedial 8 soal, mode latihan, tenggat 3 hari.</p><div class="ch-actions"><button type="button" class="tg-btn is-primary" data-ch="remedial" data-skill="' + esc(weakest.skill) + '" data-title="' + esc('Remedial ' + weakest.label) + '" data-testid="tclass-braincore-remedial">' + icon('life-buoy') + ' Susun tugas remedial</button><button type="button" class="tg-btn is-ghost" data-tg="view" data-view="insights">' + icon('activity') + ' Analitik lengkap</button></div>' : '<p class="ch-muted">Saran muncul setelah ada akurasi per skill.</p>') + '</section></div>';
  }
  // ---- events guru -----------------------------------------------------------------------------
  function onTeacherClick(e, env) {
    var b = e.target.closest ? e.target.closest('[data-ch]') : null; if (!b) return;
    var act = b.getAttribute('data-ch'), id = b.getAttribute('data-id'), i = Number(b.getAttribute('data-i')), c = env.cls(), d;
    switch (act) {
      case 'ttab': tUi.tab = b.getAttribute('data-tab'); break;
      case 'expand': tUi.expand = tUi.expand === id ? null : id; break;
      case 'result': tUi.resultId = id; tUi.tab = 'hasil'; break;
      case 'source': d = draft(c); syncDraftForm(b.closest('form'), d); d.source = b.getAttribute('data-source'); if (d.source !== 'bank') d.skills = d.skills.slice(0, 1); break;
      case 'add-item': { d = draft(c); var f = b.closest('form'); syncDraftForm(f, d); var fd = new FormData(f), opts = [0, 1, 2, 3].map(function (k) { return String(fd.get('q_opt' + k) || '').trim(); }).filter(Boolean), prompt = String(fd.get('q_prompt') || '').trim(); if (!prompt || opts.length < 2) { env.toast('Isi pertanyaan dan minimal 2 pilihan.'); return; } var ans = Number(fd.get('q_answer')); d.items.push({ id: R().uid('tq'), prompt: prompt, options: opts, answer: ans < opts.length ? ans : 0, skill: d.skills[0] }); break; }
      case 'drop-item': d = draft(c); syncDraftForm(b.closest('form'), d); d.items.splice(i, 1); break;
      case 'step': d = draft(c); d.step = Number(b.getAttribute('data-step')); break;
      case 'approve': d = draft(c); d.approved[i] = b.checked; break;
      case 'approve-all': d = draft(c); d.review.items.forEach(function (_, k) { d.approved[k] = true; }); break;
      case 'use-suggest': d = draft(c); d.useSuggest[i] = !d.useSuggest[i]; d.finals[i] = Object.assign({}, d.useSuggest[i] ? d.review.items[i].suggested.question : d.review.items[i].original, { skill: d.review.items[i].analysis.skill }); break;
      case 'drop-review': d = draft(c); d.review.items.splice(i, 1); d.finals.splice(i, 1); var ap = {}, us = {}; Object.keys(d.approved).forEach(function (k) { var n = Number(k); if (n < i) ap[n] = d.approved[k]; else if (n > i) ap[n - 1] = d.approved[k]; }); Object.keys(d.useSuggest).forEach(function (k) { var n = Number(k); if (n < i) us[n] = d.useSuggest[k]; else if (n > i) us[n - 1] = d.useSuggest[k]; }); d.approved = ap; d.useSuggest = us; d.review.summary.count = d.review.items.length; d.review.summary.ready = d.review.items.filter(function (r) { return r.analysis.verdict === 'siap'; }).length; if (!d.review.items.length) { d.step = 1; d.review = null; } break;
      case 'commit': commitDraft(c, env, !!b.getAttribute('data-send')); return;
      case 'remedial': tUi.draft = null; d = draft(c); d.source = 'bank'; d.skills = [b.getAttribute('data-skill')].filter(function (k) { return B() && B().SKILLS[k]; }); if (!d.skills.length) d.skills = ['past_tense']; d.count = 8; d.title = b.getAttribute('data-title') || ''; d.deadline = T().today(Date.now() + 3 * T().DAY); tUi.tab = 'buat'; break;
      default: return;
    }
    env.persist(); env.rerender();
  }
  function syncDraftForm(f, d) {
    if (!f) return; var fd = new FormData(f);
    d.title = String(fd.get('title') || '').slice(0, 80); d.count = Number(fd.get('count')) || d.count; d.deadline = String(fd.get('deadline') || ''); d.mode = fd.get('mode') === 'ujian' ? 'ujian' : 'latihan';
    var sk = fd.getAll('skills').slice(0, 3); if (sk.length) d.skills = sk; d.targets = fd.getAll('targets'); d.raw = String(fd.get('raw') || '');
  }
  function onTeacherSubmit(e, env) {
    var f = e.target.closest ? e.target.closest('[data-ch-form]') : null; if (!f) return; e.preventDefault();
    var c = env.cls(), d = draft(c); syncDraftForm(f, d);
    if (f.getAttribute('data-ch-form') === 'draft-source') {
      if (!d.skills.length) { env.toast(t('kelas.pilih-satu-skill', 'Pilih minimal satu skill.')); return; }
      if (d.source === 'tulis' && !d.items.length) { env.toast('Tambahkan minimal satu soal.'); return; }
      if (!buildReview(c, d)) { env.toast(d.source === 'impor' ? 'Tidak ada soal yang terbaca. Cek format: pertanyaan | A | B | C | D | kunci' : 'Tidak ada soal untuk ditinjau.'); env.rerender(); return; }
      d.step = 2; env.persist(); env.rerender();
    }
  }
  function onTeacherInput(e, env) {
    var t = e.target, c = env.cls(); if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-ch-select') === 'result') { tUi.resultId = t.value; env.rerender(); return; }
    var field = t.getAttribute('data-ch-field'); if (!field) return;
    var d = draft(c), i = Number(t.getAttribute('data-i')), q = d.finals[i]; if (!q) return;
    if (field === 'prompt') q.prompt = t.value; else if (field === 'answer') q.answer = Number(t.value); else if (field === 'opt') q.options[Number(t.getAttribute('data-j'))] = t.value;
  }

  root.FiezelClassHub = { mountStudent: mountStudent, unmountStudent: unmountStudent, renderStudent: renderStudent, openAssignment: openAssignment, mountTeacher: mountTeacher, SUB_KEY: SUB_KEY, _teacherUi: function () { return tUi; }, _studentUi: ui };
})(typeof window !== 'undefined' ? window : null);
