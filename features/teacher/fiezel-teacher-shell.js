/**
 * FIEZEL Ruang Guru — cangkang UI khusus guru (terpisah total dari cangkang murid).
 * Dipasang oleh app.js lewat tutorCenterView() untuk akun guru terverifikasi.
 * Semua data via FiezelTeacherStore (lokal di perangkat guru).
 */
(function (root) {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah modul ini dulu literal Indonesia, jadi murid
     yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft: kalau copy-map
     belum termuat, fallback id yang tampil — bukan kunci mentah. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }
  if (!root) return;
  var S = function () { return root.FiezelTeacherStore; };
  var el = null, env = {}, st = null, ui = { modal: null, drawer: null, filter: '', insightSkill: 'past_tense', attDate: null, pick: {}, syncing: false }, syncTimer = null, chipTimer = null, visListener = null;
  /*
   * DUA detak, bukan satu. m025-261 menyatukan keduanya pada 3 detik dan itu merusak dua hal
   * sekaligus; m025-262 memisahkannya lagi.
   *
   * 1. CHIP_TICK_MS - hanya mengecat ulang label chipnya. Yang owner minta adalah chip yang
   *    selalu berbunyi "Tersinkron baru saja"; label itu dihitung dari selisih MENIT terhadap
   *    lastPullAt (lihat syncLabel di store), jadi menjaganya tetap segar TIDAK butuh jaringan
   *    sama sekali. Menyeret permintaan jaringan ke 3 detik demi label yang berubah tiap menit
   *    adalah harga yang dibayar untuk sesuatu yang bisa gratis.
   *
   * 2. SYNC_EVERY_MS - ronde jaringan yang sesungguhnya. Server memasang lantainya sendiri di
   *    LIMITS.TEACHER_MIN_INTERVAL_MS = 3000 ms (workers/api/teacher/class-sync-core.js) dan
   *    menolak dengan 429 apa pun yang lebih rapat. Klien m025-261 memakai persis 3000 ms -
   *    tepat DI lantai itu, jadi jitter sekecil apa pun membuat sebagian ronde ditolak, chip
   *    berkedip merah, dan syncFailStreak menanjak tanpa sebab nyata. Jarak amannya bukan
   *    selera: ia harus berada di atas lantai server, dengan marjin.
   */
  var CHIP_TICK_MS = 1000;
  var SYNC_EVERY_MS = 10000;
  var syncFailStreak = 0;
  var pendingRender = false;
  var NAV = [['hub', t('umum.kelas', 'Kelas'), 'school'], ['briefing', 'Briefing', 'sunrise'], ['classes', t('guru.tab-kelas-siswa', 'Kelas & Siswa'), 'users'], ['assignments', t('guru.tab-tugas-ujian', 'Tugas & Ujian'), 'clipboard-list'], ['insights', 'Analitik', 'activity'], ['comms', 'Komunikasi', 'megaphone'], ['journal', t('guru.tab-jurnal', 'Jurnal Guru'), 'notebook-pen']];
  var TITLE = { hub: t('guru.judul-kelas', 'Kelas — Guru · Murid · Braincore'), briefing: 'Briefing hari ini', classes: t('guru.tab-kelas-siswa', 'Kelas & Siswa'), assignments: t('guru.tab-tugas-ujian', 'Tugas & Ujian'), insights: 'Analitik & Deteksi Dini', comms: 'Komunikasi', journal: t('guru.tab-jurnal', 'Jurnal Guru'), settings: t('guru.tab-profil', 'Profil Guru') };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]; }); }
  function pct(v) { return S().pct(v); }
  function icon(n) { var I = root.FiezelTeacherIcons; return I && I.has(n) ? I.svg(n) : '<i data-lucide="' + n + '" aria-hidden="true"></i>'; }
  function toast(t) { if (env.toast) env.toast(t); }
  function copy(text, msg) { try { navigator.clipboard.writeText(text).then(function () { toast(msg || 'Tersalin.'); }, function () { toast('Tidak bisa menyalin otomatis.'); }); } catch (_) { toast('Tidak bisa menyalin otomatis.'); } }
  function saveMinutes(n) { st.savedMinutes = (st.savedMinutes || 0) + n; }
  function persist() { S().save(st); }
  /* Lembar akun hidup di app.js dan sudah dipasang di window. Ruang Guru memanggilnya
     lewat satu pintu ini supaya tidak ada dua salinan alur masuk. */
  function openAccount(mode) {
    try { if (typeof root.openAccountSheet === 'function') { root.openAccountSheet(mode || 'login'); return true; } } catch (_) {}
    toast('Lembar akun belum siap — muat ulang aplikasi lalu coba lagi.');
    return false;
  }
  function accountRole() { try { return (root.FiezelAccount && root.FiezelAccount.role && root.FiezelAccount.role()) || ''; } catch (_) { return ''; } }
  function accountHandle() { try { var a = root.FiezelAccount && root.FiezelAccount.state && root.FiezelAccount.state(); return a && a.handle ? a.handle : ''; } catch (_) { return ''; } }
  function cls() { return st.classes.filter(function (c) { return c.id === st.activeClassId; })[0] || null; }
  function student(id) { var c = cls(); return c ? c.students.filter(function (s) { return s.id === id; })[0] : null; }
  function initials(n) { return String(n || '?').trim().slice(0, 2).toUpperCase(); }
  function hue(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360; return h; }
  function avatar(s, size) { return '<span class="tg-avatar' + (size ? ' is-' + size : '') + '" style="--h:' + hue(s.name) + '">' + esc(initials(s.name)) + '</span>'; }
  function riskPill(r) { return '<span class="tg-pill is-' + r.level + '" title="' + esc(r.reasons.join(', ')) + '">' + (r.level === 'risiko' ? 'Berisiko' : r.level === 'pantau' ? 'Pantau' : 'Aman') + '</span>'; }
  function bar(v, cls) { return '<span class="tg-bar' + (cls ? ' ' + cls : '') + '"><i style="width:' + (v == null ? 0 : Math.round(v * 100)) + '%"></i></span>'; }
  function cell(v) { var t = v == null ? 'none' : v >= 0.75 ? 'hi' : v >= 0.5 ? 'mid' : 'lo'; return '<td class="tg-heat is-' + t + '">' + pct(v) + '</td>'; }

  /** Pratinjau lokal (bukan produksi): hanya di host pengembangan, dinyalakan ?teacher=preview. */
  function previewAllowed() {
    try {
      var h = location.hostname; if (/fiezel\.my\.id$|github\.io$/.test(h)) return false;
      if (new URL(location.href).searchParams.get('teacher') === 'preview') sessionStorage.setItem('fz-teacher-preview', '1');
      return sessionStorage.getItem('fz-teacher-preview') === '1';
    } catch (_) { return false; }
  }

  // ---- sinkron server ---------------------------------------------------------------------
  function pageHidden() { try { return root.document && root.document.visibilityState === 'hidden'; } catch (_) { return false; } }
  function startAutoSync() {
    stopAutoSync();
    if (S().syncAvailable() !== 'ok') return;
    syncFailStreak = 0;
    syncAll(true);
    syncTimer = setInterval(function () {
      if (!el || ui.syncing) return;
      if (pageHidden()) return;                      // tab tak dilihat: tidak ada yang perlu disegarkan
      /* Jeda menanjak sesudah gagal beruntun: 1 ronde dilewati per kegagalan, sampai 10.
         Server yang sakit tidak dihujani sampai ia pulih. */
      if (syncFailStreak > 0 && (Date.now() / SYNC_EVERY_MS | 0) % (Math.min(syncFailStreak, 10) + 1) !== 0) return;
      syncAll(true);
    }, SYNC_EVERY_MS);
    /* Detak chip: murni lokal, tanpa jaringan. Ia juga yang menyusulkan render yang tertunda
       karena guru sedang mengetik - begitu kolomnya dilepas, cat ulangnya menyusul sendiri. */
    chipTimer = setInterval(function () {
      if (!el || pageHidden()) return;
      if (pendingRender && !busy()) { render(); return; }
      paintSyncChip();
    }, CHIP_TICK_MS);
    /* Kembali terlihat = satu ronde SEGERA, tidak menunggu tick berikutnya. */
    try {
      if (!visListener) {
        visListener = function () { if (!pageHidden() && el && !ui.syncing) syncAll(true); };
        root.document.addEventListener('visibilitychange', visListener);
      }
    } catch (_) {}
  }
  function stopAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    if (chipTimer) clearInterval(chipTimer);
    syncTimer = null; chipTimer = null; pendingRender = false;
    try { if (visListener) { root.document.removeEventListener('visibilitychange', visListener); visListener = null; } } catch (_) {}
  }
  /** Sinkron semua kelas: klaim kode yang belum diklaim, tarik laporan murid, ingest. */
  function syncAll(quiet) {
    var T = S(), avail = T.syncAvailable();
    if (avail !== 'ok') {
      /* Dulu di sini hanya ada toast yang MENGULANG kalimat yang sudah tertulis di tombolnya
         sendiri ("Masuk akun guru untuk sinkron"), lalu berhenti. Tombol yang menyebut obatnya
         tetapi tidak menyediakan jalannya terbaca sebagai tombol mati. Sekarang ia membuka
         lembar akunnya: 'login' kalau belum ada akun, 'teacher' kalau akunnya ada tetapi
         perannya belum guru - yang memang butuh kode aktivasi, bukan sekadar masuk. */
      if (!quiet) {
        if (avail === 'no_account') openAccount('login');
        else if (avail === 'not_teacher') openAccount('teacher');
        else toast(T.syncLabel(cls()).text);
      }
      return Promise.resolve();
    }
    if (ui.syncing || !st.classes.length) return Promise.resolve();
    ui.syncing = true;
    if (quiet) paintSyncChip(); else render();   // sinkron manual = ketukan guru, jangan ditunda
    var total = { ingested: 0, graded: 0, names: [], failed: 0, events: [] };
    return st.classes.reduce(function (p, c) { return p.then(function () { return T.syncClass(c).then(function (r) { if (r.ok) { total.ingested += r.ingested; total.graded += r.graded; total.names = total.names.concat(r.names || []); total.events = total.events.concat(r.events || []); } else total.failed++; }); }); }, Promise.resolve())
      .then(function () {
        ui.syncing = false; st.lastSyncAt = Date.now();
        syncFailStreak = total.failed ? syncFailStreak + 1 : 0;
        if (total.ingested) saveMinutes(total.ingested * 4 + total.graded * 5);
        total.events.forEach(function (e) { T.notify(st, e); });
        persist();
        /* Render penuh hanya bila ronde ini benar-benar membawa sesuatu. Ronde kosong -
           yang mayoritas pada jeda 3 detik - cukup menyegarkan chipnya. */
        var berubah = total.ingested || total.graded || total.events.length;
        if (!quiet) render(); else if (berubah) syncRender(); else paintSyncChip();
        if (total.events.length) { var top = total.events.filter(function (e) { return e.kind === 'assignment_done'; })[0] || total.events[0]; toast(T.inboxText(top) + (total.events.length > 1 ? ' · +' + (total.events.length - 1) + ' kabar lain' : '')); }
        else if (total.ingested) toast(total.ingested + ' laporan murid masuk' + (total.graded ? ' · ' + total.graded + ' tugas dinilai otomatis' : '') + '.');
        else if (!quiet) toast(total.failed ? 'Sinkron gagal untuk ' + total.failed + ' kelas.' : 'Tersinkron — belum ada laporan baru.');
      });
  }
  /*
   * Apakah guru sedang MEMEGANG cangkang ini?
   *
   * Cat ulang penuh mengganti el.innerHTML, jadi ia membuang simpul yang sedang dipegang guru:
   * teks yang sedang diketik hilang di tengah kalimat, dropdown yang terbuka tertutup, pilihan
   * murid pada tugas baru ter-reset. Itulah kenapa "tugas baru tidak pernah sampai": bukan
   * kiriman yang gagal, melainkan formulirnya yang dikosongkan sebelum guru sempat menekan
   * kirim. Selama salah satu dari ini benar, cat ulang yang dipicu SINKRON harus menunggu.
   */
  function busy() {
    try {
      if (ui.modal || ui.drawer || ui.inbox) return true;
      var a = root.document.activeElement;
      if (!a || !el || !el.contains(a)) return false;
      if (a.isContentEditable) return true;
      return /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || '');
    } catch (_) { return false; }
  }
  /*
   * Cat ulang yang dipicu sinkron - satu-satunya yang boleh ditunda. Cat ulang yang dipicu
   * KETUKAN guru tetap memanggil render() langsung: di sana penundaan justru terbaca sebagai
   * tombol yang tidak bereaksi. Yang tertunda disusulkan oleh detak chip begitu busy() reda.
   */
  function syncRender() {
    if (busy()) { pendingRender = true; paintSyncChip(); return false; }
    render();
    return true;
  }
  /*
   * Mengecat ulang HANYA chip sinkron, bukan seluruh cangkang.
   *
   * Ini pagar yang membuat ronde 3 detik aman. syncAll() dulu memanggil render() dua kali
   * per ronde - sekali saat mulai, sekali saat selesai. Pada 45 detik itu tidak terasa; pada
   * 3 detik ia mencabut fokus dari kolom yang sedang diketik guru, menutup dropdown yang
   * sedang dibuka, dan melompatkan posisi gulir - setiap tiga detik. Ronde yang TIDAK membawa
   * data baru karena itu hanya menyegarkan label chip di tempat.
   */
  function paintSyncChip() {
    try {
      if (!el) return false;
      var node = el.querySelector('[data-tg="sync"]');
      var c = cls();
      if (!node || !c) return false;
      var tmp = root.document.createElement('div');
      tmp.innerHTML = syncChip(c);
      var fresh = tmp.firstElementChild;
      if (!fresh) return false;
      node.replaceWith(fresh);
      return true;
    } catch (_) { return false; }
  }
  function syncChip(c) {
    var L = S().syncLabel(c);
    return '<button type="button" class="tg-chip tg-sync is-' + (ui.syncing ? 'busy' : L.state) + '" data-tg="sync" title="Sinkron laporan murid dari server" data-testid="tg-sync">' + icon(ui.syncing ? 'refresh-cw' : L.state === 'ok' ? 'cloud-check' : L.state === 'err' ? 'cloud-alert' : 'cloud') + '<span>' + esc(ui.syncing ? 'Menyinkron…' : L.text) + '</span></button>';
  }

  // ---- mount ------------------------------------------------------------------------------
  function mount(target, options) {
    el = target; env = options || {}; st = S().load();
    st.classes = st.classes.map(S().normalizeClass);
    if (!cls() && st.classes.length) st.activeClassId = st.classes[0].id;
    if (!st.classes.length && !st.onboarded) { st.view = 'briefing'; }
    // Kelas (class-hub) = landing default Ruang Guru: guru, murid, tugas, hasil, Braincore satu tempat.
    if (st.classes.length && (!st.view || st.view === 'briefing') && !st.hubSeen && root.FiezelClassHub) { st.view = 'hub'; st.hubSeen = true; }
    if (st.view === 'hub' && !root.FiezelClassHub) st.view = 'briefing';
    document.body.classList.add('fz-teacher-mode');
    el.addEventListener('click', onClick); el.addEventListener('submit', onSubmit); el.addEventListener('change', onChange); el.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    render();
    startAutoSync();
  }
  function unmount() { stopAutoSync(); document.body.classList.remove('fz-teacher-mode'); document.removeEventListener('keydown', onKey); if (el) { el.removeEventListener('click', onClick); el.removeEventListener('submit', onSubmit); el.removeEventListener('change', onChange); el.removeEventListener('input', onInput); } el = null; ui.modal = null; ui.drawer = null; lastPaintKey = null; }
  function onKey(e) { if (e.key === 'Escape' && (ui.modal || ui.drawer || ui.inbox)) { ui.modal = null; ui.drawer = null; ui.inbox = false; render(); } }
  function isTeacherRole() {
    try {
      return (root.FiezelAccount && root.FiezelAccount.isTeacher && root.FiezelAccount.isTeacher()) ||
             (root.FiezelAccount && root.FiezelAccount.state && root.FiezelAccount.state() && root.FiezelAccount.state().role === 'teacher');
    } catch (_) { return false; }
  }
  function exit() {
    if (isTeacherRole()) {
      if (confirm('Keluar dari akun guru?')) {
        if (root.FiezelAccount && root.FiezelAccount.logout) {
          root.FiezelAccount.logout().then(function () {
            location.reload();
          });
        }
      }
      return;
    }
    unmount();
    if (env.exit) env.exit();
  }

  /*
   * Kunci "layar mana yang sedang dicat". Animasi masuk (.tg-rise) hanya boleh berjalan saat
   * layarnya BERGANTI. m025-261 memutarnya ulang pada setiap cat ulang sinkron: kartu jatuh
   * kembali ke posisi awalnya - turun dan bergeser - lalu merangkak ke tempatnya, berulang
   * setiap ronde. Yang guru lihat sebagai "kartu glitch berpindah-pindah" adalah animasi masuk
   * yang di-restart, bukan tata letak yang bergerak.
   */
  var lastPaintKey = null;
  function render() {
    if (!el) return;
    pendingRender = false;
    var c = cls();
    var key = (st.view || 'briefing') + '|' + (st.activeClassId || '') + '|' + (ui.modal ? ui.modal.kind : '') + '|' + (ui.drawer || '');
    var repaint = key === lastPaintKey;
    lastPaintKey = key;
    el.innerHTML = '<div class="tg' + (repaint ? ' is-repaint' : '') + (ui.modal && ui.modal.kind === 'board' ? ' tg-board-open' : '') + '" data-testid="teacher-shell">' + sidebar(c) + '<div class="tg-main">' + topbar(c) + '<div class="tg-content">' + (st.classes.length ? views[st.view || 'briefing'](c) : welcome()) + '</div></div>' + mobileNav() + drawer(c) + modal(c) + '</div>';
    var hubEl = el.querySelector('#tgClassHub');
    if (hubEl && root.FiezelClassHub) root.FiezelClassHub.mountTeacher(hubEl, { st: function () { return st; }, cls: cls, persist: persist, toast: toast, rerender: render });
    if (env.afterRender) try { env.afterRender(); } catch (_) {}
    /* Autofokus hanya saat layarnya benar-benar berganti. Pada cat ulang ia akan merebut kursor
       dari tempat guru meletakkannya. */
    if (!repaint) { var f = el.querySelector('[data-autofocus]'); if (f) try { f.focus(); } catch (_) {} }
  }

  // ---- kerangka ---------------------------------------------------------------------------
  function sidebar(c) {
    var teacherVerified = isTeacherRole();
    var exitLabel = teacherVerified ? 'Keluar akun guru' : 'Ke mode murid';
    var exitAction = teacherVerified ? 'logout' : 'exit';
    return '<aside class="tg-side"><div class="tg-brand"><span class="tg-brand-mark">F</span><div><b>FIEZEL</b><small>' + t('guru.ruang-judul', 'Ruang Guru') + '</small></div></div>' +
      '<button type="button" class="tg-teacher" data-tg="view" data-view="settings" data-testid="tg-profile">' + icon('user-round') + '<div><b>' + esc(st.teacher.name || accountHandle() || 'Guru FIEZEL') + '</b><small>' + esc(st.teacher.school || 'Atur profil →') + '</small></div></button>' +
      (st.classes.length ? '<label class="tg-class-switch">' + t('guru.kelas-aktif', 'Kelas aktif') + '<select data-tg-select="class" data-testid="tg-class-select">' + st.classes.map(function (k) { return '<option value="' + k.id + '"' + (c && k.id === c.id ? ' selected' : '') + '>' + esc(k.name) + '</option>'; }).join('') + '</select></label>' : '') +
      '<nav class="tg-nav">' + NAV.map(function (n) { return '<button type="button" class="tg-nav-item' + (st.view === n[0] ? ' is-active' : '') + '" data-tg="view" data-view="' + n[0] + '" data-testid="tg-nav-' + n[0] + '">' + icon(n[2]) + '<span>' + n[1] + '</span></button>'; }).join('') + '</nav>' +
      '<div class="tg-side-foot"><div class="tg-saved" title="Perkiraan waktu administrasi yang FIEZEL kerjakan untukmu">' + icon('hourglass') + '<div><small>Waktu terhemat</small><b>' + Math.round(st.savedMinutes || 0) + ' menit</b></div></div>' +
      '<button type="button" class="tg-exit" data-tg="' + exitAction + '" data-testid="tg-exit">' + icon('log-out') + ' ' + exitLabel + '</button></div></aside>';
  }
  function topbar(c) {
    var d = new Date();
    return '<header class="tg-top"><div><p class="tg-kicker">' + esc(d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })) + '</p><h1>' + esc(st.classes.length ? (TITLE[st.view] || 'Ruang Guru') : 'Ruang Guru') + '</h1></div>' +
      '<div class="tg-top-actions">' + (c ? syncChip(c) + '<button type="button" class="tg-chip tg-code" data-tg="copy" data-text="' + esc(c.code) + '" title="Salin kode kelas" data-testid="tg-class-code">' + icon('hash') + '<span>' + esc(c.code) + '</span></button>' : '') + bell() + (c ? '<button type="button" class="tg-btn is-ghost" data-tg="modal" data-kind="board" data-testid="tg-open-board">' + icon('presentation') + '<span>Mode papan</span></button><button type="button" class="tg-btn is-primary" data-tg="modal" data-kind="assign" data-testid="tg-quick-assign">' + icon('plus') + '<span>' + t('guru.tugas-baru', 'Tugas baru') + '</span></button>' : '') + '</div></header>' + inboxPanel();
  }
  function bell() {
    var n = S().inboxUnread(st);
    return '<button type="button" class="tg-icon-btn tg-bell' + (n ? ' has-new' : '') + (ui.inbox ? ' is-open' : '') + '" data-tg="inbox" aria-label="Notifikasi guru" title="Notifikasi" data-testid="tg-bell">' + icon('bell') + (n ? '<span class="tg-bell-badge" data-testid="tg-bell-badge">' + (n > 9 ? '9+' : n) + '</span>' : '') + '</button>';
  }
  function inboxPanel() {
    if (!ui.inbox) return '';
    var T = S(), list = (st.inbox || []).slice(0, 30);
    return '<div class="tg-inbox-scrim" data-tg="close"></div><section class="tg-inbox" role="dialog" aria-label="Notifikasi" data-testid="tg-inbox"><div class="tg-inbox-head"><h3>' + t('umum.notifikasi', 'Notifikasi') + '</h3>' + (list.length ? '<button type="button" class="tg-link" data-tg="inbox-clear">Bersihkan</button>' : '') + '</div>' +
      (list.length ? '<ul class="tg-inbox-list">' + list.map(function (e) {
        var ic = e.kind === 'assignment_done' ? 'clipboard-check' : e.kind === 'student_joined' ? 'user-plus' : 'inbox';
        return '<li><button type="button" class="tg-inbox-item' + (e.read ? '' : ' is-unread') + '" data-tg="inbox-open" data-id="' + esc(e.id) + '" data-testid="tg-inbox-' + esc(e.id) + '">' + icon(ic) + '<div><b>' + esc(T.inboxText(e)) + '</b><small>' + esc(T.fmtDate(e.at)) + ' · ' + esc(new Date(e.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })) + '</small></div></button></li>';
      }).join('') + '</ul>' : '<p class="tg-empty">' + t('guru.belum-ada-kabar', 'Belum ada kabar. Saat murid selesai mengerjakan tugas yang kamu kirim, hasilnya muncul di sini otomatis.') + '</p>') + '</section>';
  }
  function mobileNav() { return '<nav class="tg-mnav">' + NAV.map(function (n) { return '<button type="button" class="' + (st.view === n[0] ? 'is-active' : '') + '" data-tg="view" data-view="' + n[0] + '">' + icon(n[2]) + '<span>' + n[1].split(' ')[0] + '</span></button>'; }).join('') + '</nav>'; }

  function welcome() {
    return '<section class="tg-welcome" data-testid="tg-welcome"><p class="tg-kicker">Selamat datang</p><h2>' + t('guru.ruang-kerja-desc', 'Ruang kerja yang membaca kelasmu, lalu memberi tahu') + ' <em>siapa yang perlu disapa hari ini</em>.</h2>' +
      '<p class="tg-lead">FIEZEL Ruang Guru mengubah data latihan murid menjadi tindakan: deteksi dini siswa tertinggal, kartu sapa personal 1 ketuk, laporan orang tua otomatis, kelompok belajar yang dipasangkan sendiri, dan tugas yang menilai dirinya sendiri.</p>' +
      '<div class="tg-welcome-actions"><button type="button" class="tg-btn is-primary is-lg" data-tg="modal" data-kind="new-class" data-testid="tg-welcome-new-class">' + icon('plus') + ' ' + t('guru.buat-kelas-pertama', 'Buat kelas pertama') + '</button><button type="button" class="tg-btn is-ghost is-lg" data-tg="seed-demo" data-testid="tg-welcome-demo">' + icon('sparkles') + ' Coba dengan kelas contoh (18 siswa)</button></div>' +
      '<ul class="tg-welcome-list"><li>' + icon('shield-check') + ' Data tetap di perangkatmu — tanpa jawaban mentah murid.</li><li>' + icon('timer') + ' Rata-rata guru menghemat 40+ menit/minggu untuk laporan & pesan.</li><li>' + icon('wifi-off') + ' Bekerja offline, cocok untuk sekolah dengan sinyal terbatas.</li></ul></section>';
  }

  // ---- BRIEFING -----------------------------------------------------------------------------
  function briefing(c) {
    var T = S(), stt = T.classStats(c), greet = T.needsGreeting(c), ag = T.agenda(c), mis = T.misconceptions(c);
    var kpi = [['Siswa aktif 7 hari', stt.active7 + '<small>/' + stt.total + '</small>', 'users', stt.total ? stt.active7 / stt.total : 0], ['Rata-rata akurasi', pct(stt.avgAcc), 'target', stt.avgAcc || 0], ['Perlu perhatian', (stt.atRisk + stt.watch) + '<small> siswa</small>', 'alert-triangle', stt.total ? (stt.atRisk + stt.watch) / stt.total : 0], [t('guru.tugas-berjalan', 'Tugas berjalan'), stt.openAssignments + '<small> tugas</small>', 'clipboard-list', null]];
    return '<div class="tg-grid tg-grid-kpi">' + kpi.map(function (k, i) { return '<div class="tg-kpi tg-rise" style="--d:' + i * 60 + 'ms" data-testid="tg-kpi-' + i + '">' + icon(k[2]) + '<small>' + k[0] + '</small><b>' + k[1] + '</b>' + (k[3] != null ? bar(k[3], i === 2 ? 'is-warn' : '') : '') + '</div>'; }).join('') + '</div>' +
      '<div class="tg-grid tg-grid-2">' +
      '<section class="tg-card tg-rise" style="--d:200ms" data-testid="tg-greet-list"><div class="tg-card-head"><div><p class="tg-kicker">Deteksi dini</p><h3>Siapa yang perlu disapa hari ini</h3></div><span class="tg-count">' + greet.length + '</span></div>' +
      (greet.length ? '<ul class="tg-list">' + greet.slice(0, 6).map(function (x) { return '<li class="tg-row" data-testid="tg-greet-' + x.s.id + '">' + avatar(x.s) + '<div class="tg-row-body"><b>' + esc(x.s.name) + ' ' + riskPill(x.r) + '</b><small>' + esc(x.r.reasons.join(' · ') || 'perlu dipantau') + '</small><em>' + esc(x.r.action) + '</em></div><div class="tg-row-actions"><button type="button" class="tg-btn is-small is-primary" data-tg="modal" data-kind="greet" data-id="' + x.s.id + '" data-testid="tg-greet-btn-' + x.s.id + '">' + icon('message-circle-heart') + ' Kartu sapa</button><button type="button" class="tg-btn is-small is-ghost" data-tg="drawer" data-id="' + x.s.id + '">Detail</button></div></li>'; }).join('') + '</ul>' : '<p class="tg-empty">Semua siswa dalam kondisi aman. Nikmati kopimu ☕</p>') + '</section>' +
      '<div class="tg-stack">' +
      '<section class="tg-card tg-rise" style="--d:260ms"><div class="tg-card-head"><div><p class="tg-kicker">Agenda</p><h3>Tenggat & tugas</h3></div></div>' + (ag.length ? '<ul class="tg-agenda">' + ag.slice(0, 5).map(function (a) { return '<li class="is-' + a.kind + '"><span class="tg-dot"></span><div><b>' + esc(a.a.title) + '</b><small>' + (a.a.deadline ? 'Tenggat ' + esc(a.a.deadline) : 'Tanpa tenggat') + ' · ' + a.pending + ' belum selesai' + (a.kind === 'lewat' ? ' · <strong>lewat</strong>' : '') + '</small></div></li>'; }).join('') + '</ul>' : '<p class="tg-empty">Tidak ada tenggat aktif.</p>') + '</section>' +
      '<section class="tg-card tg-card-ink tg-rise" style="--d:320ms" data-testid="tg-misconception"><p class="tg-kicker">Miskonsepsi kelas</p>' + (mis.length ? '<h3>' + esc(mis[0].label) + ' <span>' + pct(mis[0].acc) + '</span></h3><p>' + esc(mis[0].pattern) + '. ' + mis[0].low + ' siswa di bawah 50%.</p><p class="tg-plan">' + icon('lightbulb') + ' ' + esc(mis[0].lesson) + '</p><div class="tg-actions"><button type="button" class="tg-btn is-light is-small" data-tg="modal" data-kind="assign" data-skill="' + mis[0].skill + '">' + t('guru.buat-latihan', 'Buat latihan') + ' ' + esc(mis[0].label) + '</button><button type="button" class="tg-btn is-ghost-light is-small" data-tg="view" data-view="insights" data-skill="' + mis[0].skill + '">Lihat kelompok belajar</button></div>' : '<p>' + t('guru.belum-data-latihan', 'Belum ada data latihan murid.') + '</p>') + '</section>' +
      '</div></div>' +
      '<section class="tg-quick tg-rise" style="--d:380ms"><p class="tg-kicker">Aksi cepat</p><div class="tg-quick-row">' + [['attendance', 'check-square', 'Absensi hari ini'], ['add-students', 'user-plus', t('guru.tambah-siswa', 'Tambah siswa')], ['announce', 'megaphone', 'Pengumuman'], ['weekly-report', 'file-text', 'Laporan mingguan'], ['import-code', 'clipboard-paste', 'Tempel kode hasil murid']].map(function (q) { return '<button type="button" class="tg-quick-btn" data-tg="modal" data-kind="' + q[0] + '" data-testid="tg-quick-' + q[0] + '">' + icon(q[1]) + '<span>' + q[2] + '</span></button>'; }).join('') + '</div></section>';
  }

  // ---- KELAS & SISWA -------------------------------------------------------------------------
  function classes(c) {
    var T = S(), q = ui.filter.toLowerCase(), list = c.students.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1; }).map(function (s) { return { s: s, r: T.risk(c, s) }; }).sort(function (a, b) { return b.r.score - a.r.score; });
    return '<div class="tg-toolbar"><div class="tg-tabs">' + st.classes.map(function (k) { return '<button type="button" class="tg-tab' + (k.id === c.id ? ' is-active' : '') + '" data-tg="pick-class" data-id="' + k.id + '">' + esc(k.name) + '<small>' + k.students.length + '</small></button>'; }).join('') + '<button type="button" class="tg-tab is-add" data-tg="modal" data-kind="new-class" data-testid="tg-new-class">' + t('guru.kelas-tambah-btn', '+ Kelas') + '</button></div>' +
      '<div class="tg-toolbar-actions"><label class="tg-search">' + icon('search') + '<input type="search" placeholder="' + t('guru.cari-siswa', 'Cari siswa…') + '" value="' + esc(ui.filter) + '" data-tg-input="filter" data-testid="tg-student-search"></label><button type="button" class="tg-btn is-ghost" data-tg="modal" data-kind="attendance" data-testid="tg-attendance">' + icon('check-square') + '<span>Absensi</span></button><button type="button" class="tg-btn is-ghost" data-tg="export-csv" data-testid="tg-export-csv">' + icon('download') + '<span>CSV</span></button><button type="button" class="tg-btn is-primary" data-tg="modal" data-kind="add-students" data-testid="tg-add-students">' + icon('user-plus') + '<span>' + t('guru.tambah-siswa', 'Tambah siswa') + '</span></button></div></div>' +
      '<section class="tg-card tg-class-meta"><div><p class="tg-kicker">' + esc(c.subject || 'English') + ' · Level ' + esc(c.level) + (c.demo ? ' · <span class="tg-demo">data contoh</span>' : '') + '</p><h3>' + esc(c.name) + '</h3><small>Kode kelas <b class="tg-mono">' + esc(c.code) + '</b> — murid mengetiknya saat onboarding; setiap selesai sesi, hasilnya dikirim ke server dan masuk ke sini otomatis. ' + (c.sync && c.sync.claimed ? '<span class="tg-ok">Kode terdaftar di server.</span>' : S().syncAvailable() === 'ok' ? '<span class="tg-muted">Kode belum terdaftar — tekan Sinkron.</span>' : '<span class="tg-muted">Tanpa akun guru, tempel kode hasil murid secara manual.</span>') + '</small></div><div class="tg-actions"><button type="button" class="tg-btn is-ghost is-small" data-tg="modal" data-kind="edit-class">' + icon('pencil') + ' ' + t('umum.ubah', 'Ubah') + '</button><button type="button" class="tg-btn is-danger is-small" data-tg="delete-class" data-testid="tg-delete-class">' + icon('trash-2') + ' ' + t('guru.hapus-kelas', 'Hapus kelas') + '</button></div></section>' +
      (list.length ? '<div class="tg-table-wrap"><table class="tg-table" data-testid="tg-student-table"><thead><tr><th>Siswa</th><th>' + t('umum.status', 'Status') + '</th><th>Akurasi</th><th>Terakhir aktif</th><th>Kehadiran</th><th>' + t('umum.tugas', 'Tugas') + '</th><th></th></tr></thead><tbody>' +
        list.map(function (x) { var s = x.s, d = T.daysSince(s.lastActiveAt), att = T.attendanceRate(s, 10); return '<tr data-tg="drawer" data-id="' + s.id + '" data-testid="tg-student-row-' + s.id + '"><td><div class="tg-who">' + avatar(s) + '<div><b>' + esc(s.name) + '</b><small>' + (s.parentPhone ? icon('phone') + ' ortu tersimpan' : '<span class="tg-muted">belum ada kontak ortu</span>') + '</small></div></div></td><td>' + riskPill(x.r) + '</td><td><div class="tg-acc">' + bar(T.overallAcc(s)) + '<span>' + pct(T.overallAcc(s)) + '</span></div></td><td>' + (d == null ? '<span class="tg-muted">—</span>' : d === 0 ? 'Hari ini' : d + ' hari lalu') + '</td><td>' + (att == null ? '—' : Math.round(att * 100) + '%') + '</td><td>' + (x.r.pending ? x.r.pending + ' belum' + (x.r.late ? ' <strong class="tg-late">' + x.r.late + ' lewat</strong>' : '') : '<span class="tg-ok">beres</span>') + '</td><td class="tg-row-end">' + icon('chevron-right') + '</td></tr>'; }).join('') + '</tbody></table></div>' :
        '<section class="tg-card tg-center"><h3>' + t('guru.belum-ada-siswa', 'Belum ada siswa di kelas ini') + '</h3><p class="tg-muted">' + t('guru.tambah-nama-siswa', 'Tambah nama siswa (bisa tempel dari daftar absen), atau bagikan kode kelas') + ' <b>' + esc(c.code) + '</b> supaya hasil latihan murid masuk sendiri.</p><button type="button" class="tg-btn is-primary" data-tg="modal" data-kind="add-students">' + icon('user-plus') + ' ' + t('guru.tambah-siswa', 'Tambah siswa') + '</button></section>');
  }

  // ---- TUGAS & UJIAN -------------------------------------------------------------------------
  function assignments(c) {
    var T = S(), td = T.today(), list = (c.assignments || []).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    return '<div class="tg-toolbar"><p class="tg-lead-sm">' + t('guru.tugas-menilai-diri', 'Tugas yang menilai dirinya sendiri: kirim ke murid, tugasnya') + ' <b>langsung masuk notifikasi</b> di aplikasi mereka; setelah selesai, hasilnya kembali ke sini otomatis — tidak ada koreksi manual.</p><div class="tg-toolbar-actions"><button type="button" class="tg-btn is-ghost" data-tg="modal" data-kind="import-code" data-testid="tg-grade-code">' + icon('clipboard-paste') + '<span>Tempel kode hasil</span></button><button type="button" class="tg-btn is-primary" data-tg="modal" data-kind="assign" data-testid="tg-new-assign">' + icon('plus') + '<span>' + t('guru.buat-tugas-ujian', 'Buat tugas / ujian') + '</span></button></div></div>' +
      (list.length ? '<div class="tg-grid tg-grid-cards">' + list.map(function (a) {
        var tgt = c.students.filter(function (s) { return T.targeted(a, s); }), done = tgt.filter(function (s) { return a.done && a.done[s.id]; }), accs = done.map(function (s) { return a.done[s.id].acc; }).filter(function (v) { return v != null; }), avg = accs.length ? accs.reduce(function (x, y) { return x + y; }, 0) / accs.length : null;
        var late = a.deadline && a.deadline < td && done.length < tgt.length;
        return '<article class="tg-card tg-assign' + (a.mode === 'ujian' ? ' is-exam' : '') + '" data-testid="tg-assign-' + a.id + '"><div class="tg-card-head"><div><p class="tg-kicker">' + (a.mode === 'ujian' ? icon('shield') + ' Ujian · ' + a.timer + ' mnt · acak' : icon('pencil-ruler') + ' Latihan · ' + a.minutes + ' mnt') + '</p><h3>' + esc(a.title) + '</h3></div><button type="button" class="tg-icon-btn" data-tg="delete-assign" data-id="' + a.id + '" aria-label="Hapus tugas">' + icon('trash-2') + '</button></div>' +
          '<p class="tg-muted">' + a.skills.map(function (k) { return T.SKILL_LABEL[k]; }).join(' + ') + ' · ' + a.itemIds.length + ' soal · ' + (a.targets ? tgt.length + ' siswa terpilih' : 'seluruh kelas') + '</p>' +
          '<div class="tg-progress"><div class="tg-progress-head"><span>' + done.length + '/' + tgt.length + ' selesai' + (avg != null ? ' · rata-rata ' + pct(avg) : '') + '</span><span class="' + (late ? 'tg-late' : '') + '">' + (a.deadline ? 'Tenggat ' + esc(a.deadline) + (late ? ' (lewat)' : '') : 'Tanpa tenggat') + '</span></div>' + bar(tgt.length ? done.length / tgt.length : 0, avg != null && avg < 0.5 ? 'is-warn' : '') + '</div>' +
          '<div class="tg-actions"><button type="button" class="tg-btn is-small is-primary" data-tg="send-assign" data-id="' + a.id + '" data-testid="tg-send-all-' + a.id + '"' + (ui.sending === a.id ? ' disabled' : '') + '>' + icon('send') + (a.targets ? (a.sent && a.sent.all ? ' ' + t('guru.kirim-ulang-ke', 'Kirim ulang ke') + ' ' : ' ' + t('guru.kirim-ke', 'Kirim ke') + ' ') + tgt.length + ' murid terpilih' : (a.sent && a.sent.all ? ' ' + t('guru.kirim-ulang-semua', 'Kirim ulang ke semua') : ' ' + t('guru.kirim-semua-murid', 'Kirim ke semua murid'))) + '</button><button type="button" class="tg-btn is-small is-ghost" data-tg="modal" data-kind="share-assign" data-id="' + a.id + '" data-testid="tg-share-assign-' + a.id + '">' + icon('users') + ' ' + t('guru.pilih-murid-kode', 'Pilih murid / kode') + '</button><button type="button" class="tg-btn is-small is-ghost" data-tg="modal" data-kind="assign-detail" data-id="' + a.id + '">' + icon('list-checks') + ' Siapa yang belum</button></div>' + (a.sent && a.sent.all ? '<p class="tg-muted tg-sent-note">' + icon('check') + ' Terkirim ke semua murid ' + esc(T.fmtDate(a.sent.all)) + '</p>' : '') + '</article>';
      }).join('') + '</div>' : '<section class="tg-card tg-center"><h3>' + t('guru.belum-ada-tugas', 'Belum ada tugas') + '</h3><p class="tg-muted">Buat tugas dari bank soal FIEZEL: pilih skill, jumlah soal, tenggat. Mode ujian mengacak urutan dan memberi timer.</p></section>');
  }

  // ---- ANALITIK -------------------------------------------------------------------------------
  function insights(c) {
    var T = S(), heat = T.heatmap(c), map = T.classSkillMap(c), groups = T.studyGroups(c, ui.insightSkill), mis = T.misconceptions(c);
    if (!c.students.length) return '<section class="tg-card tg-center"><h3>' + t('guru.belum-data-analisis', 'Belum ada data untuk dianalisis') + '</h3><p class="tg-muted">' + t('guru.tambah-siswa-dulu', 'Tambah siswa atau tempel kode hasil latihan murid dulu.') + '</p></section>';
    return '<div class="tg-grid tg-grid-skill">' + map.map(function (m, i) { return '<button type="button" class="tg-skill' + (ui.insightSkill === m.skill ? ' is-active' : '') + ' tg-rise" style="--d:' + i * 40 + 'ms" data-tg="insight-skill" data-skill="' + m.skill + '" data-testid="tg-skill-' + m.skill + '"><small>' + esc(m.label) + '</small><b>' + pct(m.acc) + '</b>' + bar(m.acc, m.acc != null && m.acc < 0.5 ? 'is-warn' : '') + '<em>' + (m.low ? m.low + ' siswa <50%' : m.acc == null ? 'belum ada data' : 'merata') + '</em></button>'; }).join('') + '</div>' +
      '<section class="tg-card" data-testid="tg-heatmap"><div class="tg-card-head"><div><p class="tg-kicker">Peta panas</p><h3>Siswa × skill — sekali lihat, tahu siapa butuh apa</h3></div><small class="tg-legend"><span class="is-hi">≥75%</span><span class="is-mid">50–74%</span><span class="is-lo">&lt;50%</span></small></div>' +
      '<div class="tg-table-wrap"><table class="tg-table tg-heat-table"><thead><tr><th>Siswa</th>' + T.SKILL_ORDER.map(function (k) { return '<th>' + esc(T.SKILL_LABEL[k]) + '</th>'; }).join('') + '<th>Risiko</th></tr></thead><tbody>' + heat.map(function (h) { return '<tr data-tg="drawer" data-id="' + h.s.id + '"><td><div class="tg-who">' + avatar(h.s) + '<b>' + esc(h.s.name) + '</b></div></td>' + h.cells.map(function (x) { return cell(x.acc); }).join('') + '<td>' + riskPill(h.risk) + '</td></tr>'; }).join('') + '</tbody></table></div></section>' +
      '<div class="tg-grid tg-grid-2">' +
      '<section class="tg-card" data-testid="tg-groups"><div class="tg-card-head"><div><p class="tg-kicker">Kelompok belajar otomatis</p><h3>' + esc(T.SKILL_LABEL[ui.insightSkill]) + ' — tiap kelompok punya mentor</h3></div><button type="button" class="tg-btn is-small is-ghost" data-tg="copy-groups">' + icon('copy') + ' Salin</button></div><p class="tg-muted">Siswa yang kuat dipasangkan dengan yang lemah (peer tutoring). Menjelaskan ke teman adalah latihan terbaik untuk si mentor sendiri.</p>' +
      (groups.length ? '<div class="tg-groups">' + groups.map(function (g) { return '<div class="tg-group"><b>Kelompok ' + g.no + '</b>' + g.members.map(function (m, i) { return '<div class="tg-group-row' + (i === 0 ? ' is-mentor' : '') + '">' + avatar(m.s, 'sm') + '<span>' + esc(m.s.name) + '</span><small>' + pct(m.acc) + (i === 0 ? ' · mentor' : '') + '</small></div>'; }).join('') + '</div>'; }).join('') + '</div>' : '<p class="tg-empty">' + t('guru.belum-data-skill', 'Belum ada data skill ini.') + '</p>') + '</section>' +
      '<section class="tg-card tg-card-ink"><p class="tg-kicker">Tiga miskonsepsi teratas</p>' + (mis.length ? '<ol class="tg-mis">' + mis.map(function (m) { return '<li><b>' + esc(m.label) + ' <span>' + pct(m.acc) + '</span></b><small>' + esc(m.pattern) + '</small><em>' + esc(m.objective) + '</em></li>'; }).join('') + '</ol><button type="button" class="tg-btn is-light is-small" data-tg="modal" data-kind="assign" data-skill="' + mis[0].skill + '">' + icon('plus') + ' ' + t('guru.buat-remedial', 'Buat sesi remedial') + ' ' + esc(mis[0].label) + '</button>' : '<p>' + t('umum.belum-ada-data', 'Belum ada data.') + '</p>') + '</section></div>';
  }

  // ---- KOMUNIKASI ---------------------------------------------------------------------------------
  function comms(c) {
    var T = S(), ann = (c.announcements || []).slice().reverse(), greet = T.needsGreeting(c), withPhone = c.students.filter(function (s) { return s.parentPhone; });
    return '<div class="tg-grid tg-grid-2">' +
      '<div class="tg-stack"><section class="tg-card" data-testid="tg-announce"><div class="tg-card-head"><div><p class="tg-kicker">Pengumuman kelas</p><h3>Satu pesan, semua kanal</h3></div></div><form data-tg-form="announce" class="tg-form"><textarea name="text" rows="3" required placeholder="Contoh: Besok kuis Past Tense 10 soal, 15 menit. Bawa catatan penanda waktu!" data-testid="tg-announce-text"></textarea><div class="tg-actions"><button type="submit" class="tg-btn is-primary is-small" data-testid="tg-announce-submit">' + icon('megaphone') + ' ' + t('guru.simpan-salin', 'Simpan & salin') + '</button><button type="submit" class="tg-btn is-ghost is-small" name="wa" value="1">' + icon('message-circle') + ' ' + t('guru.kirim-whatsapp', 'Kirim via WhatsApp') + '</button></div></form>' +
      (ann.length ? '<ul class="tg-feed">' + ann.slice(0, 5).map(function (a) { return '<li><small>' + esc(T.fmtDate(a.at)) + '</small><p>' + esc(a.text) + '</p><button type="button" class="tg-link" data-tg="copy" data-text="' + esc(a.text) + '">Salin ulang</button></li>'; }).join('') + '</ul>' : '') + '</section>' +
      '<section class="tg-card" data-testid="tg-parent-section"><div class="tg-card-head"><div><p class="tg-kicker">Laporan orang tua</p><h3>Rapor naratif otomatis</h3></div><span class="tg-count">' + c.students.length + '</span></div><p class="tg-muted">Bahasa hangat, berisi angka nyata, plus satu saran 5 menit yang bisa orang tua lakukan di rumah. ' + withPhone.length + ' siswa punya nomor ortu (kirim langsung via WhatsApp).</p>' +
      '<div class="tg-chips">' + c.students.map(function (s) { return '<button type="button" class="tg-chip' + (s.parentPhone ? ' has-phone' : '') + '" data-tg="modal" data-kind="parent" data-id="' + s.id + '" data-testid="tg-parent-' + s.id + '">' + esc(s.name) + (s.parentPhone ? ' ' + icon('phone') : '') + '</button>'; }).join('') + '</div>' +
      '<div class="tg-actions"><button type="button" class="tg-btn is-ghost is-small" data-tg="modal" data-kind="weekly-report">' + icon('file-text') + ' Laporan kelas mingguan</button><button type="button" class="tg-btn is-ghost is-small" data-tg="copy-all-parents">' + icon('copy') + ' Salin semua laporan</button></div></section></div>' +
      '<section class="tg-card" data-testid="tg-greet-cards"><div class="tg-card-head"><div><p class="tg-kicker">Kartu sapa</p><h3>Pesan personal 1 ketuk</h3></div><span class="tg-count">' + greet.length + '</span></div><p class="tg-muted">Masalah klasik: guru tahu siapa yang mulai menjauh, tapi tak sempat menulis 30 pesan berbeda. FIEZEL menyusun pesan dari data tiap anak — kamu tinggal baca sekali dan kirim.</p>' +
      (greet.length ? '<ul class="tg-list">' + greet.map(function (x) { return '<li class="tg-row">' + avatar(x.s) + '<div class="tg-row-body"><b>' + esc(x.s.name) + ' ' + riskPill(x.r) + '</b><small>' + esc(T.greetingCard(c, x.s, st.teacher)) + '</small></div><div class="tg-row-actions"><button type="button" class="tg-btn is-small is-primary" data-tg="modal" data-kind="greet" data-id="' + x.s.id + '">' + icon('send') + ' ' + t('umum.kirim', 'Kirim') + '</button></div></li>'; }).join('') + '</ul>' : '<p class="tg-empty">Semua siswa aman — kirimkan apresiasi lewat pengumuman.</p>') + '</section></div>';
  }

  // ---- JURNAL ------------------------------------------------------------------------------------
  function journal(c) {
    var T = S(), list = (c.journal || []).slice().reverse();
    return '<div class="tg-grid tg-grid-2"><section class="tg-card" data-testid="tg-journal-form"><div class="tg-card-head"><div><p class="tg-kicker">Refleksi 60 detik</p><h3>Apa yang berhasil hari ini?</h3></div></div><p class="tg-muted">Guru hebat mencatat metode yang ampuh — tapi jarang ada tempatnya. Catatan di sini menempel ke siswa yang kamu tandai, dan muncul lagi saat kamu membuka profil mereka.</p>' +
      '<form data-tg-form="journal" class="tg-form"><textarea name="text" rows="4" required placeholder="Contoh: Metode timeline di papan ampuh untuk yesterday/ago. Fikri masih tertukar verb 1/2." data-testid="tg-journal-text"></textarea><label class="tg-label">Tandai siswa (opsional)</label><div class="tg-chips tg-chips-select">' + c.students.map(function (s) { return '<label class="tg-chip is-check"><input type="checkbox" name="tags" value="' + s.id + '"><span>' + esc(s.name) + '</span></label>'; }).join('') + '</div><div class="tg-actions"><button type="submit" class="tg-btn is-primary is-small" data-testid="tg-journal-submit">' + icon('notebook-pen') + ' ' + t('guru.simpan-refleksi', 'Simpan refleksi') + '</button></div></form></section>' +
      '<section class="tg-card"><div class="tg-card-head"><div><p class="tg-kicker">' + t('umum.riwayat', 'Riwayat') + '</p><h3>Jurnal ' + esc(c.name) + '</h3></div><span class="tg-count">' + list.length + '</span></div>' + (list.length ? '<ul class="tg-feed">' + list.map(function (j) { return '<li><small>' + esc(T.fmtDate(j.at)) + (j.tags && j.tags.length ? ' · ' + j.tags.map(function (id) { var s = student(id); return s ? esc(s.name) : ''; }).filter(Boolean).join(', ') : '') + '</small><p>' + esc(j.text) + '</p></li>'; }).join('') + '</ul>' : '<p class="tg-empty">' + t('guru.belum-ada-catatan', 'Belum ada catatan.') + '</p>') + '</section></div>';
  }
  /* Kartu AKUN. Sebelum ini halaman ini hanya memuat profil LOKAL (nama & sekolah untuk
     tanda tangan laporan), jadi guru tidak punya satu pun tempat untuk melihat ia masuk
     sebagai siapa, apakah perannya sudah guru, atau untuk masuk/keluar akun - padahal
     tepat tiga hal itu yang menentukan tombol Sinkron hidup atau mati. */
  function accountCard() {
    var role = accountRole(), handle = accountHandle();
    var masuk = !!role, guru = role === 'teacher';
    var status = !masuk
      ? '<p class="tg-muted">' + t('guru.belum-masuk-akun', 'Belum masuk akun. Sinkron laporan murid dan pengiriman tugas butuh akun guru.') + '</p>'
      : '<p class="tg-muted">' + t('guru.masuk-sebagai', 'Masuk sebagai') + ' <b>' + esc(handle || '—') + '</b> · peran <b>' + esc(guru ? 'guru' : role) + '</b>.'
        + (guru ? ' Sinkron aktif.' : ' Peran ini belum guru, jadi Sinkron masih mati — aktivasi dengan kode undangan guru.') + '</p>';
    var actions = !masuk
      ? '<button type="button" class="tg-btn is-primary is-small" data-tg="account" data-mode="login" data-testid="tg-account-login">' + icon('log-out') + ' ' + t('guru.masuk-akun', 'Masuk akun') + '</button>'
        + '<button type="button" class="tg-btn is-ghost is-small" data-tg="account" data-mode="teacher" data-testid="tg-account-teacher">' + icon('user-round') + ' Punya kode guru</button>'
      : (guru
        ? '<button type="button" class="tg-btn is-danger is-small" data-tg="logout" data-testid="tg-account-logout">' + icon('log-out') + ' Keluar akun</button>'
        : '<button type="button" class="tg-btn is-primary is-small" data-tg="account" data-mode="teacher" data-testid="tg-account-teacher">' + icon('user-round') + ' ' + t('guru.aktivasi-guru', 'Aktivasi guru') + '</button>'
          + '<button type="button" class="tg-btn is-danger is-small" data-tg="logout" data-testid="tg-account-logout">' + icon('log-out') + ' Keluar akun</button>');
    return '<section class="tg-card tg-narrow" data-testid="tg-account"><p class="tg-kicker">Akun</p><h3>' + (guru ? 'Akun guru aktif' : 'Akun') + '</h3>'
      + status + '<div class="tg-actions">' + actions + '</div></section>';
  }
  function settings() {
    return accountCard() +
      '<section class="tg-card tg-narrow" data-testid="tg-settings"><p class="tg-kicker">Profil guru</p><h3>' + t('guru.nama-sekolah-ttd', 'Nama & sekolah dipakai di tanda tangan laporan') + '</h3><form data-tg-form="teacher" class="tg-form"><label class="tg-label">' + t('guru.nama-panggilan', 'Nama panggilan') + '<input name="name" value="' + esc(st.teacher.name) + '" placeholder="Bu Rina / Pak Dimas" maxlength="40" data-testid="tg-teacher-name"></label><label class="tg-label">Sekolah / lembaga<input name="school" value="' + esc(st.teacher.school) + '" placeholder="SMA Negeri 3 Bandung" maxlength="60" data-testid="tg-teacher-school"></label><div class="tg-actions"><button type="submit" class="tg-btn is-primary is-small" data-testid="tg-teacher-save">' + t('umum.simpan', 'Simpan') + '</button></div></form>' +
      '<hr class="tg-hr"><p class="tg-kicker">Data</p><p class="tg-muted">' + t('guru.data-lokal-warn', 'Semua data Ruang Guru tersimpan di perangkat ini. Ekspor cadangan sebelum ganti perangkat.') + '</p><div class="tg-actions"><button type="button" class="tg-btn is-ghost is-small" data-tg="export-json">' + icon('download') + ' Ekspor cadangan</button><label class="tg-btn is-ghost is-small">' + icon('upload') + ' Pulihkan cadangan<input type="file" accept="application/json" hidden data-tg-file="import-json"></label><button type="button" class="tg-btn is-danger is-small" data-tg="reset-all" data-testid="tg-reset">' + icon('trash-2') + ' ' + t('guru.hapus-semua-data', 'Hapus semua data guru') + '</button></div></section>';
  }
  var views = { hub: function () { return '<div id="tgClassHub" class="tg-hub-host"></div>'; }, briefing: briefing, classes: classes, assignments: assignments, insights: insights, comms: comms, journal: journal, settings: settings };

  // ---- DRAWER siswa -------------------------------------------------------------------------------
  function drawer(c) {
    if (!ui.drawer || !c) return '';
    var T = S(), s = student(ui.drawer); if (!s) return '';
    var r = T.risk(c, s), pend = T.pendingAssignments(c, s), att = T.recentAttendance(s, 7).reverse(), notes = (s.notes || []).slice().reverse(), jr = (c.journal || []).filter(function (j) { return (j.tags || []).indexOf(s.id) !== -1; }).reverse();
    return '<div class="tg-scrim" data-tg="close"></div><aside class="tg-drawer" role="dialog" aria-label="Detail siswa" data-testid="tg-drawer">' +
      '<div class="tg-drawer-head">' + avatar(s, 'lg') + '<div><h3>' + esc(s.name) + '</h3><p class="tg-muted">' + riskPill(r) + ' · ' + (r.inactiveDays == null ? 'belum aktif' : r.inactiveDays === 0 ? 'aktif hari ini' : r.inactiveDays + ' hari tidak belajar') + '</p></div><button type="button" class="tg-icon-btn" data-tg="close" aria-label="' + t('umum.tutup', 'Tutup') + '">' + icon('x') + '</button></div>' +
      '<div class="tg-drawer-body">' +
      '<div class="tg-action-box"><p class="tg-kicker">Tindakan yang disarankan</p><p>' + esc(r.action) + '</p><div class="tg-actions"><button type="button" class="tg-btn is-primary is-small" data-tg="modal" data-kind="greet" data-id="' + s.id + '">' + icon('message-circle-heart') + ' Kartu sapa</button><button type="button" class="tg-btn is-ghost is-small" data-tg="modal" data-kind="parent" data-id="' + s.id + '">' + icon('file-text') + ' Laporan ortu</button><button type="button" class="tg-btn is-ghost is-small" data-tg="modal" data-kind="assign" data-target="' + s.id + '"' + (r.weak ? ' data-skill="' + r.weak.skill + '"' : '') + '>' + icon('plus') + ' ' + t('guru.tugas-khusus', 'Tugas khusus') + '</button></div></div>' +
      '<h4>Skill</h4><div class="tg-skill-rows">' + T.SKILL_ORDER.map(function (k) { var v = T.skillAcc(s, k); return '<div class="tg-skill-row"><span>' + esc(T.SKILL_LABEL[k]) + '</span>' + bar(v, v != null && v < 0.5 ? 'is-warn' : '') + '<b>' + pct(v) + '</b></div>'; }).join('') + '</div>' +
      '<h4>Kehadiran 7 hari</h4><div class="tg-att-strip">' + att.map(function (a) { return '<span class="is-' + (a.v || 'none') + '" title="' + a.date + '">' + (a.v || '·') + '</span>'; }).join('') + '</div>' +
      '<h4>' + t('umum.tugas', 'Tugas') + '</h4>' + (pend.length ? '<ul class="tg-mini-list">' + pend.map(function (p) { return '<li>' + esc(p.a.title) + (p.late ? ' <strong class="tg-late">lewat</strong>' : '') + ' <button type="button" class="tg-link" data-tg="mark-done" data-id="' + p.a.id + '" data-sid="' + s.id + '">tandai selesai</button></li>'; }).join('') + '</ul>' : '<p class="tg-muted">Semua tugas selesai.</p>') +
      '<h4>Kontak orang tua</h4><form data-tg-form="phone" data-id="' + s.id + '" class="tg-inline"><input name="phone" inputmode="tel" value="' + esc(s.parentPhone) + '" placeholder="08xx / 62xx" data-testid="tg-phone-input"><button type="submit" class="tg-btn is-small is-ghost" data-testid="tg-phone-save">' + t('umum.simpan', 'Simpan') + '</button></form>' +
      '<h4>Catatan guru</h4><form data-tg-form="note" data-id="' + s.id + '" class="tg-inline"><input name="text" required placeholder="Catatan singkat…" data-testid="tg-note-input"><button type="submit" class="tg-btn is-small is-ghost" data-testid="tg-note-save">' + t('umum.tambah', 'Tambah') + '</button></form>' +
      (notes.length || jr.length ? '<ul class="tg-feed is-compact">' + notes.map(function (n) { return '<li><small>' + esc(T.fmtDate(n.at)) + '</small><p>' + esc(n.text) + '</p></li>'; }).join('') + jr.map(function (j) { return '<li class="is-journal"><small>' + esc(T.fmtDate(j.at)) + ' · jurnal</small><p>' + esc(j.text) + '</p></li>'; }).join('') + '</ul>' : '') +
      '<div class="tg-actions tg-drawer-foot"><button type="button" class="tg-btn is-danger is-small" data-tg="delete-student" data-id="' + s.id + '">' + icon('user-minus') + ' ' + t('guru.hapus-dari-kelas', 'Hapus dari kelas') + '</button></div></div></aside>';
  }

  // ---- MODAL --------------------------------------------------------------------------------------
  function modal(c) {
    if (!ui.modal) return '';
    var m = ui.modal, T = S(), body = '', title = '', wide = false;
    if (m.kind === 'new-class' || m.kind === 'edit-class') {
      var e = m.kind === 'edit-class' ? c : null; title = e ? t('guru.ubah-kelas', 'Ubah kelas') : t('guru.kelas-baru', 'Kelas baru');
      body = '<form data-tg-form="' + m.kind + '" class="tg-form"><label class="tg-label">' + t('guru.nama-kelas', 'Nama kelas') + '<input name="name" required maxlength="60" value="' + esc(e ? e.name : '') + '" placeholder="English A2 — Kelas 10A" data-autofocus data-testid="tg-class-name"></label><div class="tg-form-row"><label class="tg-label">Level<select name="level" data-testid="tg-class-level">' + ['A1', 'A2', 'B1', 'B2', 'C1'].map(function (l) { return '<option' + ((e ? e.level : 'A2') === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></label><label class="tg-label">Mata pelajaran<input name="subject" value="' + esc(e ? e.subject : 'English') + '" maxlength="40"></label></div><div class="tg-actions"><button type="submit" class="tg-btn is-primary" data-testid="tg-class-submit">' + (e ? t('umum.simpan', 'Simpan') : t('guru.buat-kelas', 'Buat kelas')) + '</button>' + (e ? '' : '<button type="button" class="tg-btn is-ghost" data-tg="seed-demo">Atau muat kelas contoh</button>') + '</div></form>';
    } else if (m.kind === 'add-students') {
      title = t('guru.tambah-siswa', 'Tambah siswa');
      body = '<form data-tg-form="add-students" class="tg-form"><label class="tg-label">' + t('guru.nama-siswa-baris', 'Nama siswa — satu per baris, atau tempel daftar absen') + '<textarea name="names" rows="6" required placeholder="1. Rina Kartika\n2. Dimas Prasetyo\nSari, Bagas, Nadia" data-autofocus data-testid="tg-add-names"></textarea></label><p class="tg-muted">Nomor urut dan nama belakang dibuang otomatis — FIEZEL hanya menyimpan nama depan.</p><div class="tg-actions"><button type="submit" class="tg-btn is-primary" data-testid="tg-add-submit">Tambahkan</button><button type="button" class="tg-btn is-ghost" data-tg="modal" data-kind="import-code">Punya kode hasil murid?</button></div></form>';
    } else if (m.kind === 'import-code') {
      title = 'Tempel kode hasil murid';
      body = '<form data-tg-form="import-code" class="tg-form"><p class="tg-muted">' + t('guru.murid-menyalin', 'Murid menyalin') + ' <b>Kode hasil untuk tutor</b> dari Today Plan-nya (Peta → ringkasan). Kode hanya berisi nama depan + akurasi per skill. Tugas yang cocok otomatis dinilai selesai.</p><textarea name="code" rows="4" required placeholder="Tempel kode di sini…" data-autofocus data-testid="tg-import-code"></textarea>' + (m.error ? '<p class="tg-error">' + esc(m.error) + '</p>' : '') + '<div class="tg-actions"><button type="submit" class="tg-btn is-primary" data-testid="tg-import-submit">Masukkan ke ' + esc(c.name) + '</button></div></form>';
    } else if (m.kind === 'assign') {
      title = t('guru.buat-tugas-ujian', 'Buat tugas / ujian'); wide = true;
      var skills = T.SKILL_ORDER.filter(function (k) { return k !== 'speaking'; }), pre = m.skill || 'past_tense', tgt = m.target ? [m.target] : [];
      body = '<form data-tg-form="assign" class="tg-form"><label class="tg-label">Judul<input name="title" maxlength="80" placeholder="Kosongkan untuk judul otomatis" data-autofocus data-testid="tg-assign-title"></label>' +
        '<label class="tg-label">Skill (pilih 1–3)</label><div class="tg-chips tg-chips-select">' + skills.map(function (k) { return '<label class="tg-chip is-check"><input type="checkbox" name="skills" value="' + k + '"' + (k === pre ? ' checked' : '') + ' data-testid="tg-assign-skill-' + k + '"><span>' + esc(T.SKILL_LABEL[k]) + '</span></label>'; }).join('') + '</div>' +
        '<div class="tg-form-row"><label class="tg-label">Jumlah soal<select name="count">' + [5, 8, 10, 12, 15].map(function (n) { return '<option' + (n === 10 ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label><label class="tg-label">Tenggat<input type="date" name="deadline" value="' + T.today(Date.now() + 2 * T.DAY) + '" data-testid="tg-assign-deadline"></label></div>' +
        '<label class="tg-label">Mode</label><div class="tg-mode"><label class="tg-mode-opt"><input type="radio" name="mode" value="latihan" checked><div><b>Latihan</b><small>Feedback langsung tiap soal, boleh diulang</small></div></label><label class="tg-mode-opt"><input type="radio" name="mode" value="ujian" data-testid="tg-assign-mode-exam"><div><b>Ujian mini</b><small>Urutan diacak per murid + timer — anti saling contek</small></div></label></div>' +
        '<label class="tg-label">Untuk siapa</label><div class="tg-chips tg-chips-select tg-chips-scroll"><label class="tg-chip is-check"><input type="radio" name="scope" value="all"' + (tgt.length ? '' : ' checked') + '><span>Seluruh kelas</span></label>' + c.students.map(function (s) { return '<label class="tg-chip is-check"><input type="checkbox" name="targets" value="' + s.id + '"' + (tgt.indexOf(s.id) !== -1 ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>'; }).join('') + '</div>' +
        '<div class="tg-actions"><button type="submit" class="tg-btn is-primary" data-testid="tg-assign-submit">' + icon('sparkles') + ' Susun dari bank soal</button></div></form>';
    } else if (m.kind === 'share-assign' || m.kind === 'assign-detail') {
      var a = (c.assignments || []).filter(function (x) { return x.id === m.id; })[0]; if (!a) return '';
      var tg = c.students.filter(function (s) { return T.targeted(a, s); }), notDone = tg.filter(function (s) { return !(a.done && a.done[s.id]); }), code = T.assignmentCode(c, a);
      var msg = t('guru.wa-halo', 'Halo! Tugas FIEZEL dari') + ' ' + (st.teacher.name || 'gurumu') + ': *' + a.title + '* (' + a.itemIds.length + ' soal, ±' + a.minutes + ' menit' + (a.deadline ? ', tenggat ' + a.deadline : '') + ').\nBuka FIEZEL → Today Plan → "Punya kode tugas dari guru?" → tempel kode ini:\n\n' + code + '\n\nSetelah selesai, kirim balik "Kode hasil untuk tutor" ya.';
      title = m.kind === 'share-assign' ? t('guru.kirim-tugas-murid', 'Kirim tugas ke murid') : t('guru.status-titik', 'Status:') + ' ' + a.title;
      var canSend = T.syncAvailable() === 'ok', busy = ui.sending === a.id;
      body = (m.kind === 'share-assign' ? '<div class="tg-send-box" data-testid="tg-send-box"><p class="tg-kicker">' + t('guru.kirim-langsung', 'Kirim langsung (notifikasi di aplikasi murid)') + '</p><p class="tg-muted">' + (canSend ? 'Murid yang memakai kode kelas <b class="tg-mono">' + esc(c.code) + '</b> menerima tugas ini di lonceng notifikasi mereka. Sekali ketuk, sesinya langsung terbuka; hasilnya kembali ke sini otomatis.' : t('guru.masuk-untuk-kirim', 'Masuk dengan akun guru dan online untuk mengirim langsung. Sementara itu pakai kode di bawah.')) + '</p><div class="tg-actions"><button type="button" class="tg-btn is-primary" data-tg="send-assign" data-id="' + a.id + '" data-testid="tg-send-all"' + (!canSend || busy ? ' disabled' : '') + '>' + icon('send') + (busy ? ' Mengirim…' : a.targets ? ' Kirim ke ' + tg.length + ' murid terpilih' : ' ' + t('guru.kirim-semua-murid', 'Kirim ke semua murid')) + '</button>' + (a.sent && a.sent.all ? '<span class="tg-ok">' + icon('check') + ' terkirim ' + esc(T.fmtDate(a.sent.all)) + '</span>' : '') + '</div></div>' +
          '<details class="tg-fold"><summary>Kode tugas (cadangan bila murid offline)</summary><p class="tg-muted">' + t('guru.murid-tempel-kode', 'Murid menempel kode ini di Today Plan → “Punya kode tugas dari guru?”.') + '</p><textarea class="tg-code" readonly rows="3" data-testid="tg-assign-code">' + esc(code) + '</textarea><div class="tg-actions"><button type="button" class="tg-btn is-ghost is-small" data-tg="copy" data-text="' + esc(code) + '" data-testid="tg-copy-assign-code">' + icon('copy') + ' Salin kode</button><button type="button" class="tg-btn is-ghost is-small" data-tg="copy" data-text="' + esc(msg) + '">' + icon('message-square') + ' Salin pesan lengkap</button><a class="tg-btn is-ghost is-small" target="_blank" rel="noopener" href="' + T.waLink('', msg) + '">' + icon('message-circle') + ' WhatsApp</a></div></details><hr class="tg-hr">' : '') +
        '<div class="tg-card-head"><h4>' + notDone.length + ' belum selesai · ' + (tg.length - notDone.length) + ' selesai</h4></div><ul class="tg-mini-list tg-send-list">' + tg.map(function (s) { var d = a.done && a.done[s.id], sent = T.sentTo(a, s); return '<li class="' + (d ? 'is-done' : '') + '">' + avatar(s, 'sm') + ' <span class="tg-grow">' + esc(s.name) + (sent && !d ? ' <small class="tg-muted">· terkirim</small>' : '') + '</span>' + (d ? ' <span class="tg-ok">' + pct(d.acc) + '</span>' : (canSend ? '<button type="button" class="tg-btn is-small ' + (sent ? 'is-ghost' : 'is-primary') + '" data-tg="send-assign" data-id="' + a.id + '" data-sid="' + s.id + '" data-testid="tg-send-one-' + s.id + '"' + (busy ? ' disabled' : '') + '>' + icon('send') + (sent ? ' Kirim ulang' : ' Kirim') + '</button>' : '') + ' <button type="button" class="tg-link" data-tg="mark-done" data-id="' + a.id + '" data-sid="' + s.id + '">tandai selesai</button>') + '</li>'; }).join('') + '</ul>' + (notDone.length ? '<div class="tg-actions"><button type="button" class="tg-btn is-ghost is-small" data-tg="copy" data-text="' + esc('Pengingat: tugas *' + a.title + '* belum selesai untuk: ' + notDone.map(function (s) { return s.name; }).join(', ') + (a.deadline ? '. Tenggat ' + a.deadline : '') + '. Semangat! 💪') + '">' + icon('bell') + ' Salin pengingat untuk yang belum</button></div>' : '');
    } else if (m.kind === 'greet' || m.kind === 'parent') {
      var s2 = student(m.id); if (!s2) return '';
      var text = m.kind === 'greet' ? T.greetingCard(c, s2, st.teacher) : T.parentReport(c, s2, st.teacher);
      title = m.kind === 'greet' ? 'Kartu sapa untuk ' + s2.name : 'Laporan untuk orang tua ' + s2.name;
      body = '<p class="tg-muted">' + (m.kind === 'greet' ? 'Disusun dari data ' + s2.name + t('guru.ubah-seperlunya', '. Ubah seperlunya agar terdengar seperti kamu.') : 'Angka diambil langsung dari data. Tanda tangan memakai profil gurumu.') + '</p><textarea class="tg-code is-text" rows="' + (m.kind === 'greet' ? 5 : 12) + '" data-tg-input="draft" data-testid="tg-draft">' + esc(m.draft != null ? m.draft : text) + '</textarea>' +
        '<div class="tg-actions"><button type="button" class="tg-btn is-primary" data-tg="copy-draft" data-testid="tg-copy-draft">' + icon('copy') + ' Salin</button><a class="tg-btn is-ghost" target="_blank" rel="noopener" data-tg="wa-draft" href="' + T.waLink(m.kind === 'parent' ? s2.parentPhone : '', m.draft != null ? m.draft : text) + '" data-testid="tg-wa-draft">' + icon('message-circle') + ' WhatsApp' + (m.kind === 'parent' && s2.parentPhone ? ' ortu' : '') + '</a><button type="button" class="tg-btn is-ghost" data-tg="mark-sent" data-id="' + s2.id + '" data-kind="' + m.kind + '">' + icon('check') + ' Tandai terkirim</button></div>';
    } else if (m.kind === 'weekly-report') {
      title = 'Laporan kelas mingguan';
      body = '<textarea class="tg-code is-text" rows="14" readonly data-testid="tg-weekly-text">' + esc(T.weeklyClassReport(c, st.teacher)) + '</textarea><div class="tg-actions"><button type="button" class="tg-btn is-primary" data-tg="copy" data-text="' + esc(T.weeklyClassReport(c, st.teacher)) + '" data-testid="tg-copy-weekly">' + icon('copy') + ' Salin</button><button type="button" class="tg-btn is-ghost" data-tg="print-weekly">' + icon('printer') + ' Cetak / PDF</button></div>';
    } else if (m.kind === 'announce') {
      title = 'Pengumuman kelas';
      body = '<form data-tg-form="announce" class="tg-form"><textarea name="text" rows="4" required placeholder="Tulis pengumuman…" data-autofocus data-testid="tg-announce-modal-text"></textarea><div class="tg-actions"><button type="submit" class="tg-btn is-primary">' + icon('megaphone') + ' ' + t('guru.simpan-salin', 'Simpan & salin') + '</button><button type="submit" class="tg-btn is-ghost" name="wa" value="1">' + icon('message-circle') + ' WhatsApp</button></div></form>';
    } else if (m.kind === 'attendance') {
      title = 'Absensi cepat'; wide = true; var date = ui.attDate || T.today();
      body = '<div class="tg-att-head"><label class="tg-label">Tanggal<input type="date" value="' + date + '" data-tg-input="att-date" data-testid="tg-att-date"></label><div class="tg-actions"><button type="button" class="tg-btn is-ghost is-small" data-tg="att-all" data-v="H" data-testid="tg-att-all">' + icon('check-check') + ' Semua hadir</button></div></div>' +
        '<ul class="tg-att-list" data-testid="tg-att-list">' + c.students.map(function (s) { var v = (s.attendance || {})[date] || ''; return '<li>' + avatar(s, 'sm') + '<span>' + esc(s.name) + '</span><div class="tg-seg">' + ['H', 'I', 'S', 'A'].map(function (k) { return '<button type="button" class="tg-seg-btn is-' + k + (v === k ? ' is-on' : '') + '" data-tg="att" data-id="' + s.id + '" data-v="' + k + '" title="' + T.ATT[k] + '" data-testid="tg-att-' + s.id + '-' + k + '">' + k + '</button>'; }).join('') + '</div></li>'; }).join('') + '</ul><p class="tg-muted">H hadir · I izin · S sakit · A alpa. Dua alpa dalam seminggu menaikkan skor risiko siswa.</p>';
    } else if (m.kind === 'board') {
      return board(c);
    }
    return '<div class="tg-scrim" data-tg="close"></div><div class="tg-modal' + (wide ? ' is-wide' : '') + '" role="dialog" aria-modal="true" data-testid="tg-modal"><div class="tg-modal-head"><h3>' + esc(title) + '</h3><button type="button" class="tg-icon-btn" data-tg="close" aria-label="Tutup" data-testid="tg-modal-close">' + icon('x') + '</button></div><div class="tg-modal-body">' + body + '</div></div>';
  }
  /** Mode papan: tampilan proyektor tanpa nama — kelas melihat kemajuan bersama, bukan peringkat individu. */
  function board(c) {
    var T = S(), stt = T.classStats(c), map = T.classSkillMap(c), mis = T.misconceptions(c), ag = T.agenda(c);
    return '<div class="tg-board" data-testid="tg-board"><button type="button" class="tg-board-close" data-tg="close" aria-label="' + t('guru.tutup-mode-papan', 'Tutup mode papan') + '">' + icon('x') + ' Tutup</button><p class="tg-board-kicker">' + esc(c.name) + ' · ' + esc(new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })) + '</p><h2>Kemajuan kita minggu ini</h2>' +
      '<div class="tg-board-kpi"><div><b>' + stt.active7 + '<small>/' + stt.total + '</small></b><span>teman yang belajar minggu ini</span></div><div><b>' + pct(stt.avgAcc) + '</b><span>akurasi kelas</span></div><div><b>' + (ag.length ? ag[0].a.deadline || '—' : '—') + '</b><span>' + (ag.length ? 'tenggat: ' + esc(ag[0].a.title) : 'tidak ada tenggat') + '</span></div></div>' +
      '<div class="tg-board-skills">' + map.filter(function (m) { return m.acc != null; }).map(function (m) { return '<div><span>' + esc(m.label) + '</span>' + bar(m.acc, m.acc < 0.5 ? 'is-warn' : '') + '<b>' + pct(m.acc) + '</b></div>'; }).join('') + '</div>' +
      (mis.length ? '<p class="tg-board-focus">' + icon('target') + ' Fokus hari ini: <b>' + esc(mis[0].label) + '</b> — ' + esc(mis[0].pattern) + '</p>' : '') + '</div>';
  }

  // ---- events -----------------------------------------------------------------------------------------
  function closest(e) { return e.target.closest ? e.target.closest('[data-tg]') : null; }
  function onClick(e) {
    var btn = closest(e); if (!btn) return;
    var act = btn.getAttribute('data-tg'), id = btn.getAttribute('data-id'), c = cls(), T = S();
    if (btn.tagName === 'A' && act === 'wa-draft') { return; }
    switch (act) {
      case 'view': st.view = btn.getAttribute('data-view'); if (btn.getAttribute('data-skill')) ui.insightSkill = btn.getAttribute('data-skill'); ui.modal = null; ui.drawer = null; ui.filter = ''; break;
      case 'account': openAccount(btn.getAttribute('data-mode') || 'login'); return;
      case 'exit': persist(); exit(); return;
      case 'logout':
        persist();
        if (confirm('Keluar dari akun guru?')) {
          try { localStorage.removeItem('fz_teacher_mode'); } catch(_) {}
          if (root.state && root.state.preferences) {
            root.state.preferences.role = 'murid';
            root.state.view = 'home';
            try { root.save?.(); } catch(_) {}
          }
          if (root.FiezelAccount && root.FiezelAccount.logout) {
            root.FiezelAccount.logout().then(function () {
              location.reload();
            });
          } else {
            exit();
          }
        }
        return;
      case 'sync': syncAll(false); return;
      case 'inbox': ui.inbox = !ui.inbox; if (ui.inbox) { T.inboxMarkAllRead(st); } break;
      case 'inbox-clear': st.inbox = []; ui.inbox = false; break;
      case 'inbox-open': {
        var ev = (st.inbox || []).filter(function (x) { return x.id === id; })[0]; ui.inbox = false;
        if (ev) { ev.read = true; if (ev.clsId && st.classes.some(function (k) { return k.id === ev.clsId; })) st.activeClassId = ev.clsId; if (ev.kind === 'assignment_done' && ev.aid) { st.view = 'assignments'; ui.modal = { kind: 'assign-detail', id: ev.aid }; ui.drawer = null; } else if (ev.sid) { st.view = 'classes'; ui.drawer = ev.sid; ui.modal = null; } }
        break;
      }
      case 'send-assign': {
        if (!c) return;
        var asg = (c.assignments || []).filter(function (x) { return x.id === id; })[0]; if (!asg) return;
        var sid = btn.getAttribute('data-sid'), targets = sid ? [sid] : (asg.targets && asg.targets.length ? asg.targets : null);
        if (T.syncAvailable() !== 'ok') { toast(T.syncLabel(c).text); return; }
        ui.sending = asg.id; render();
        T.sendAssignment(c, asg, targets).then(function (r) {
          ui.sending = null;
          if (r.ok) { saveMinutes(sid ? 1 : 5); toast(sid ? t('guru.toast-kirim-satu', 'Tugas dikirim ke {nama} — muncul di notifikasinya.').replace('{nama}', (student(sid) || {}).name) : t('guru.toast-kirim-banyak', 'Tugas dikirim ke {jumlah} murid — muncul di notifikasi mereka.').replace('{jumlah}', r.count)); }
          else toast(r.error === 'class_code_taken' ? 'Kode kelas dipakai guru lain — ubah kode kelas dulu.' : r.error === 'not_found' ? t('guru.kelas-belum-sinkron', 'Kelas belum terdaftar di server — tekan Sinkron lalu coba lagi.') : t('guru.toast-gagal-kirim', 'Gagal mengirim ({sebab}). Coba lagi.').replace('{sebab}', r.error || 'unknown'));
          persist(); render();
        });
        return;
      }
      case 'modal': ui.modal = { kind: btn.getAttribute('data-kind'), id: id, skill: btn.getAttribute('data-skill'), target: btn.getAttribute('data-target') }; break;
      case 'drawer': ui.drawer = id; ui.modal = null; break;
      case 'close': ui.modal = null; ui.drawer = null; ui.inbox = false; break;
      case 'pick-class': st.activeClassId = id; break;
      case 'insight-skill': ui.insightSkill = btn.getAttribute('data-skill'); break;
      case 'copy': copy(btn.getAttribute('data-text'), 'Tersalin.'); return;
      case 'copy-draft': { var ta = el.querySelector('[data-tg-input="draft"]'); copy(ta ? ta.value : '', 'Pesan tersalin.'); saveMinutes(ui.modal && ui.modal.kind === 'parent' ? 8 : 3); persist(); return; }
      case 'mark-sent': { var s = student(id); if (s) { s.notes.push({ at: Date.now(), text: (btn.getAttribute('data-kind') === 'parent' ? 'Laporan orang tua dikirim.' : 'Kartu sapa dikirim.') }); saveMinutes(btn.getAttribute('data-kind') === 'parent' ? 8 : 3); } ui.modal = null; toast('Dicatat di riwayat ' + (s ? s.name : '') + '.'); break; }
      case 'seed-demo': { var d = T.seedDemo(); st.classes.push(d); st.activeClassId = d.id; st.onboarded = true; ui.modal = null; st.view = 'briefing'; toast(t('guru.kelas-contoh', 'Kelas contoh dimuat — 18 siswa, 2 tugas, data 14 hari.')); break; }
      case 'delete-class': if (!c || !confirm('Hapus kelas "' + c.name + '" beserta ' + c.students.length + ' siswa? Tidak bisa dibatalkan.')) return; st.classes = st.classes.filter(function (k) { return k.id !== c.id; }); st.activeClassId = st.classes.length ? st.classes[0].id : null; break;
      case 'delete-student': if (!c) return; c.students = c.students.filter(function (s) { return s.id !== id; }); ui.drawer = null; toast('Siswa dihapus dari kelas.'); break;
      case 'delete-assign': if (!c || !confirm(t('guru.konfirm-hapus-tugas', 'Hapus tugas ini?'))) return; c.assignments = c.assignments.filter(function (a) { return a.id !== id; }); break;
      case 'mark-done': { var a = c.assignments.filter(function (x) { return x.id === id; })[0], sid = btn.getAttribute('data-sid'); if (a) { a.done = a.done || {}; a.done[sid] = { at: Date.now(), acc: T.skillAcc(student(sid) || {}, a.skills[0]) }; } saveMinutes(1); break; }
      case 'att': { var s3 = student(id), date = ui.attDate || T.today(); if (s3) { var v = btn.getAttribute('data-v'); s3.attendance[date] = s3.attendance[date] === v ? undefined : v; if (!s3.attendance[date]) delete s3.attendance[date]; if (v === 'H' && (!s3.lastActiveAt || T.today(s3.lastActiveAt) < date)) { /* kehadiran ≠ belajar mandiri; jangan ubah lastActiveAt */ } } saveMinutes(0.2); break; }
      case 'att-all': { var dt = ui.attDate || T.today(); c.students.forEach(function (s) { s.attendance[dt] = 'H'; }); saveMinutes(3); toast('Semua ditandai hadir. Ubah yang tidak hadir saja.'); break; }
      case 'export-csv': download(c.name.replace(/\W+/g, '-') + '-siswa.csv', T.csvStudents(c), 'text/csv'); saveMinutes(10); toast('CSV diunduh.'); break;
      case 'export-json': download('fiezel-ruang-guru-cadangan.json', JSON.stringify(st), 'application/json'); return;
      case 'reset-all': if (!confirm(t('guru.konfirm-hapus-semua', 'Hapus SEMUA data Ruang Guru di perangkat ini?'))) return; st = T.defaults(); break;
      case 'copy-groups': { var g = T.studyGroups(c, ui.insightSkill); copy('Kelompok belajar ' + T.SKILL_LABEL[ui.insightSkill] + ' — ' + c.name + '\n' + g.map(function (x) { return 'Kelompok ' + x.no + ' (mentor: ' + x.mentor.s.name + '): ' + x.members.map(function (m) { return m.s.name; }).join(', '); }).join('\n'), t('guru.kelompok-tersalin', 'Daftar kelompok tersalin.')); saveMinutes(15); persist(); return; }
      case 'copy-all-parents': copy(c.students.map(function (s) { return '=== ' + s.name + ' ===\n' + T.parentReport(c, s, st.teacher); }).join('\n\n'), c.students.length + ' laporan tersalin.'); saveMinutes(c.students.length * 6); persist(); return;
      case 'print-weekly': { var w = window.open('', '_blank'); if (w) { w.document.write('<pre style="font:15px/1.5 Georgia,serif;white-space:pre-wrap;max-width:720px;margin:40px auto">' + esc(T.weeklyClassReport(c, st.teacher)) + '</pre>'); w.document.close(); w.print(); } saveMinutes(20); persist(); return; }
      default: return;
    }
    persist(); render();
  }
  function onSubmit(e) {
    var form = e.target.closest ? e.target.closest('[data-tg-form]') : null; if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute('data-tg-form'), fd = new FormData(form), c = cls(), T = S(), viaWa = e.submitter && e.submitter.name === 'wa';
    if (kind === 'new-class') { var k = T.newClass(fd.get('name'), fd.get('level'), fd.get('subject')); st.classes.push(k); st.activeClassId = k.id; st.onboarded = true; ui.modal = null; st.view = 'classes'; toast('Kelas ' + k.name + ' dibuat. Kode: ' + k.code); if (S().syncAvailable() === 'ok') setTimeout(function () { syncAll(true); }, 400); }
    else if (kind === 'edit-class' && c) { c.name = String(fd.get('name')).slice(0, 60); c.level = fd.get('level'); c.subject = fd.get('subject'); if (c.sync) c.sync.claimed = false; ui.modal = null; }
    else if (kind === 'add-students' && c) { var names = T.parseNames(fd.get('names')), added = 0; names.forEach(function (n) { var fn = T.firstName(n); if (!c.students.some(function (s) { return s.name.toLowerCase() === fn.toLowerCase(); })) { c.students.push(T.newStudent(fn)); added++; } }); ui.modal = null; st.view = 'classes'; saveMinutes(added * 0.5); toast(added + ' siswa ditambahkan.'); }
    else if (kind === 'import-code' && c) { var p = T.parseLearnerCode(fd.get('code')); if (!p) { ui.modal = { kind: 'import-code', error: 'Kode tidak dikenali. Pastikan menyalin utuh "Kode hasil untuk tutor" dari murid.' }; render(); return; } var res = T.ingest(c, p); ui.modal = null; ui.drawer = res.student.id; saveMinutes(4 + res.graded.length * 5); toast('Hasil ' + res.student.name + ' masuk' + (res.graded.length ? ' · ' + res.graded.length + ' tugas dinilai otomatis' : '') + '.'); }
    else if (kind === 'assign' && c) { var skills = fd.getAll('skills').slice(0, 3), targets = fd.getAll('targets'); if (!skills.length) { toast(t('guru.pilih-satu-skill', 'Pilih minimal satu skill.')); return; } var a = T.buildAssignment({ title: fd.get('title'), skills: skills, count: fd.get('count'), deadline: fd.get('deadline'), mode: fd.get('mode'), targets: targets, avoid: c.sentItemIds }); c.assignments.push(a); c.sentItemIds = (c.sentItemIds || []).concat(a.itemIds).slice(-120); st.view = 'assignments'; ui.modal = { kind: 'share-assign', id: a.id }; ui.drawer = null; saveMinutes(25); toast(t('guru.tugas-tersusun', 'Tugas tersusun:') + ' ' + a.itemIds.length + ' soal dari bank FIEZEL.'); }
    else if (kind === 'announce' && c) { var text = String(fd.get('text')).trim(); c.announcements.push({ id: T.uid('an'), at: Date.now(), text: text }); form.reset(); ui.modal = null; saveMinutes(2); if (viaWa) window.open(T.waLink('', '📣 ' + c.name + '\n' + text), '_blank'); else copy(text, 'Pengumuman disimpan & tersalin.'); }
    else if (kind === 'journal' && c) { c.journal.push({ id: T.uid('jr'), at: Date.now(), text: String(fd.get('text')).trim(), tags: fd.getAll('tags') }); form.reset(); toast('Refleksi tersimpan.'); }
    else if (kind === 'teacher') { st.teacher = { name: String(fd.get('name')).trim().slice(0, 40), school: String(fd.get('school')).trim().slice(0, 60) }; toast('Profil tersimpan.'); }
    else if (kind === 'phone') { var s = student(form.getAttribute('data-id')); if (s) { s.parentPhone = String(fd.get('phone')).replace(/[^\d+]/g, ''); toast('Kontak tersimpan.'); } }
    else if (kind === 'note') { var s2 = student(form.getAttribute('data-id')); if (s2) s2.notes.push({ at: Date.now(), text: String(fd.get('text')).trim() }); }
    persist(); render();
  }
  function onChange(e) {
    var sel = e.target;
    if (sel.getAttribute('data-tg-select') === 'class') { st.activeClassId = sel.value; ui.drawer = null; persist(); render(); }
    if (sel.getAttribute('data-tg-input') === 'att-date') { ui.attDate = sel.value; render(); }
    if (sel.getAttribute('data-tg-file') === 'import-json') { var f = sel.files && sel.files[0]; if (!f) return; f.text().then(function (txt) { try { var raw = JSON.parse(txt); if (raw.schema !== S().KEY) throw 0; st = Object.assign(S().defaults(), raw); st.classes = st.classes.map(S().normalizeClass); persist(); toast('Cadangan dipulihkan.'); render(); } catch (_) { toast('Berkas cadangan tidak valid.'); } }); }
  }
  function onInput(e) {
    var t = e.target, k = t.getAttribute('data-tg-input');
    if (k === 'filter') { ui.filter = t.value; var tb = el.querySelector('.tg-table-wrap, .tg-center'); if (tb) { var tmp = document.createElement('div'); tmp.innerHTML = classes(cls()); var nt = tmp.querySelector('.tg-table-wrap, .tg-center'); if (nt) tb.replaceWith(nt); if (env.afterRender) env.afterRender(); } }
    if (k === 'draft' && ui.modal) { ui.modal.draft = t.value; var wa = el.querySelector('[data-tg="wa-draft"]'); if (wa) { var s = student(ui.modal.id); wa.href = S().waLink(ui.modal.kind === 'parent' && s ? s.parentPhone : '', t.value); } }
  }
  function download(name, text, type) { try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); } catch (_) { copy(text, 'Unduhan tidak didukung — isi tersalin.'); } }

  root.FiezelTeacherShell = { mount: mount, unmount: unmount, render: render, previewAllowed: previewAllowed, _state: function () { return st; } };
})(typeof window !== 'undefined' ? window : null);
