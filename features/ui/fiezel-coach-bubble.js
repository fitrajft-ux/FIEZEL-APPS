/**
 * FIEZEL m025-115 - pembimbing yang hadir di segala arah, bukan panel laporan.
 *
 * Brief redesign OWNER, bagian 7 (prioritas tinggi):
 *
 *   "FIEZEL harus terasa seperti guru pembimbing yang hadir di segala arah navigasi user -
 *    bukan satu panel yang hanya muncul di Home dan harus dibaca sebagai teks laporan.
 *    Wujud yang disarankan: elemen mengambang (floating bubble/avatar) yang persisten dan
 *    bisa diakses dari halaman mana pun. Interaksinya harus terasa adaptif & percakapan
 *    (menyapa sesuai konteks halaman yang sedang dibuka, memberi dorongan singkat, bukan
 *    paragraf analisis panjang). Kontennya (evidence, estimated level, diagnosis) boleh
 *    tetap ada sebagai data di baliknya - tapi cara penyampaiannya yang diubah."
 *
 * Tiga keputusan yang menentukan berkas ini:
 *
 * 1. Gelembungnya HIDUP TERPISAH dari layar. Ia dipasang sekali ke <body> dan tidak pernah
 *    ikut dicat ulang saat halaman berganti - itulah bedanya "hadir di segala arah" dengan
 *    "ada di setiap halaman". Yang berubah saat navigasi hanya konteksnya.
 *
 * 2. Ia tetap berguna saat AI tidak bisa dihubungi. Sapaan dan dorongan singkat disusun
 *    LOKAL dari data yang sudah ada di perangkat (level, streak, ritme hari ini, halaman
 *    yang sedang dibuka). AI dipakai hanya ketika murid benar-benar bertanya. Pembimbing
 *    yang diam begitu sinyal hilang bukan pembimbing.
 *
 * 3. Yang disapa selalu SATU kalimat. Panjangnya dibatasi di sini, bukan diserahkan pada
 *    kemurahan hati model - karena persis paragraf panjang itulah yang dikeluhkan owner.
 */
(function (global) {
  'use strict';

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

  var doc = global.document;
  if (!doc) return;

  var MAX_PEEK = 96;      /* satu kalimat; sisanya dipotong pada batas kata */
  var PEEK_MS = 7000;     /* sapaan mengambang menghilang sendiri */
  var LOG_LIMIT = 40;
  var ASK_TIMEOUT = 12000; /* lewat ini, jawaban lokal yang menjawab */

  /* impl-04 (kontrak emitHandoff): kelahiran gelembung dijahit ke event serah terima
   * onboarding. Pendengarnya dipasang di LINGKUP MODUL, bukan di install() - pada boot
   * pertama install() bisa baru berjalan setelah "Mulai Belajar" ditekan, dan event
   * yang sudah lewat tidak bisa didengar ulang. Yang datang sebelum install() direkam
   * dan dikonsumsi sekali saat gelembungnya benar-benar dipasang. */
  var HANDOFF_EVENT = 'fiezel-onboarding-paw-handoff';
  var HANDOFF_FRESH_MS = 6000;  /* rekaman lebih tua dari ini dianggap basi */
  var lastHandoff = null;
  var handoffReceiver = null;
  try {
    doc.addEventListener(HANDOFF_EVENT, function (e) {
      var detail = (e && e.detail) || {};
      lastHandoff = { detail: detail, at: Date.now() };
      if (typeof handoffReceiver === 'function') handoffReceiver(detail);
    });
  } catch (_) { /* tanpa addEventListener kelahiran biasa (born saat pasang) tetap jalan */ }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function oneLine(text) {
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= MAX_PEEK) return clean;
    var cut = clean.slice(0, MAX_PEEK);
    var space = cut.lastIndexOf(' ');
    return (space > 40 ? cut.slice(0, space) : cut).replace(/[.,;:]$/, '') + '…';
  }

  function icon(name) {
    var lib = global.FiezelIcons;
    return lib && lib.markup ? lib.markup(name) : '';
  }

  /**
   * Wajah PAW. Mengembalikan <fiezel-mascot> kalau motion system-nya benar-benar
   * terdaftar, kalau tidak jatuh ke ikon paw yang sama seperti sebelum m026-01.
   *
   * Cadangannya bukan hiasan: fiezel-mascot.js bisa gagal (cache lama, berkas
   * belum sampai, browser tanpa custom element). Kalau itu terjadi, gelembung
   * harus tetap punya wajah paw - bukan lingkaran kosong. Bentuk paw-nya tetap
   * satu sumber, yaitu icon('paw') dari features/ui/fiezel-icons.js; berkas ini
   * tidak pernah menggambar path paw sendiri.
   */
  function pawReady() {
    try { var api = global.FiezelPaw; return !!(api && api.ready && api.ready()); }
    catch (_) { return false; }
  }

  /** Wajah PAW. Maskot memakai kelasnya SENDIRI (fz-coach-mascot), bukan
   *  fz-coach-face - style.css memaku fz-coach-face ke 30px/22px untuk ikon
   *  paw, dan ukuran itu salah untuk maskot yang perlu dipotong ke kepalanya. */
  /** I11 (O3 §6, P0-2): maskot DIJEPIT ke wadahnya lewat style inline. Tanpa ini
   *  <fiezel-mascot> memakai ukuran alaminya dari fiezel-motion.css (.fz-mascot
   *  width:200px, terukur 96x90 di FAB 58x58) dan meluber menutupi CTA Speaking
   *  serta tab Peta. Inline dipilih karena style.css milik agen lain; 100%/100%
   *  mengikuti wadah mana pun (FAB 58/46px, avatar panel 38px), dan SVG di dalamnya
   *  menskalakan lewat viewBox tanpa distorsi. */
  function pawFace(fallbackClass) {
    if (pawReady()) return '<fiezel-mascot class="fz-coach-mascot" style="width:100%;height:100%" aria-hidden="true"></fiezel-mascot>';
    return '<span class="fz-i ' + String(fallbackClass || '') + '" aria-hidden="true">' + icon('paw') + '</span>';
  }

  /** Wadah bulat aplikasi berlatar KUNING, dan badan maskot juga kuning. Kelas
   *  has-mascot yang mengubah latarnya jadi krem + memotong bidangnya ke kepala.
   *  Dipasang dari JS, bukan lewat :has() di CSS, supaya peranti lama yang tidak
   *  mengenal :has() tidak kebagian kuning-di-atas-kuning. */
  function pawHost(baseClass) {
    return baseClass + (pawReady() ? ' has-mascot' : '');
  }

  /** I11: mode pelajaran aktif (layar tanpa gangguan, O1-004). style.css sudah
   *  menyembunyikan gelembung+peek di bawah body.fz-lesson-mode; modulnya sendiri
   *  tidak boleh diam-diam membuka panel atau menyapa di baliknya - termasuk di
   *  layar hasil, yang tetap ber-lesson-mode sampai go(). Sumber kebenarannya
   *  ekspor FiezelStage.lessonMode() (app.js), kelas body sebagai cadangan. */
  function lessonActive() {
    try {
      var stage = global.FiezelStage;
      if (stage && typeof stage.lessonMode === 'function') return stage.lessonMode() === true;
    } catch (_) {}
    try {
      return !!(doc.body && doc.body.classList && typeof doc.body.classList.contains === 'function'
        && doc.body.classList.contains('fz-lesson-mode'));
    } catch (_) { return false; }
  }

  /** Memanggil corong maskot tanpa pernah melempar. Reaksi gerak tidak boleh
   *  menjatuhkan percakapan pembimbing. */
  function paw(method, a, b) {
    try {
      var api = global.FiezelPaw;
      if (api && typeof api[method] === 'function') api[method](a, b);
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ *
   * Sapaan lokal. Satu kalimat, gaya bahasa FIEZEL dipertahankan apa adanya
   * (brief bagian 2: "Tone of voice TIDAK berubah").
   * ------------------------------------------------------------------ */
  /**
   * m025-128 - peta halaman ke KARAKTER GERAK PAW.
   *
   * Empat belas halaman tidak berarti empat belas animasi. Yang dipetakan di sini adalah
   * PEKERJAAN halaman itu, dan beberapa halaman memang pekerjaannya sama: membaca cerita
   * di Library dan mengikuti materi di Classroom keduanya "mengikuti satu baris", jadi
   * keduanya memakai gerak yang sama. Memaksakan gerak berbeda untuk pekerjaan yang sama
   * akan membuat sistemnya terasa acak, bukan kaya.
   *
   * Yang TIDAK ada di peta ini jatuh ke 'home' - itu default yang benar untuk halaman
   * yang belum punya pendapat sendiri, dan lebih baik daripada maskot yang diam total
   * karena namanya belum terdaftar.
   */
  var PAGE_SCENES = {
    home: 'home', ask: 'home', search: 'home',
    vocab: 'vocab',
    grammar: 'grammar',
    reading: 'reading', library: 'reading', classroom: 'reading',
    listening: 'listening',
    speaking: 'speaking',
    writing: 'writing',
    progress: 'progress',
    test: 'test', skills: 'test'
  };

  var PAGE_LINES = {
    home: [T('coach.mau-start-from-mana-day'), T('coach.gue-udah-siapin-rencana-hari')],
    vocab: [T('coach.kata-new-that-kayak-koin'), T('coach.review-dulu-yang-hampir-lupa')],
    grammar: [T('coach.wrong-at-grammar-that-wajar'), 'Satu pola dulu, jangan borong semua.'],
    reading: ['Baca pelan-pelan, ga usah kejar cepet.', T('coach.tap-kalimat-yg-bikin-bingung')],
    listening: ['Dengerin dua kali sebelum lihat teksnya, ya.', 'Ga nangkep? Wajar. Ulang sekali lagi.'],
    speaking: [T('coach.ngomong-aja-dulu-wrong-that'), T('coach.ga-ada-yang-dengerin-selain')],
    writing: ['Tulis dulu apa adanya, rapihnya belakangan.', 'Dikit tapi jadi, lebih baik daripada panjang tapi ga selesai.'],
    skills: ['Speaking sama Listening paling cepat naik kalau rutin.', 'Lima menit di sini udah kehitung, kok.'],
    library: ['Cerita pendek dulu aja, biar ga kebanyakan mikir.', T('coach.tap-kalimatnya-if-mau-lihat')],
    classroom: [T('coach.classroom-subtitle-id'), T('coach.choose-topik-yg-paling-bikin')],
    progress: ['Ini peta kemampuanmu — bukan rapor.', T('coach.yg-merah-bukan-aib-that')],
    test: ['Jawab apa adanya, ini buat ngukur, bukan buat nilai.', 'Ga usah tegang, ga ada yang lihat.']
  };

  function localGreeting(ctx) {
    var c = ctx || {};
    if (c.streak && c.streak >= 3) return 'Runtun ' + c.streak + T('coach.day-jangan-putus-day-this');
    if (c.dueReviews) return c.dueReviews + T('coach.materi-nunggu-review-that-yg');
    var lines = PAGE_LINES[c.view] || PAGE_LINES.home;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function localAnswer(ctx, question) {
    var c = ctx || {};
    var q = String(question || '').toLowerCase();
    if (/level|kemampuan|skor|nilai/.test(q)) {
      return T('coach.level-estimasi-you-sekarang') + (c.level || 'A1') + '. Itu dari bukti latihan yang udah masuk, bukan tebakan — makin sering latihan, makin akurat.';
    }
    if (/mulai|belajar apa|hari ini|rencana/.test(q)) {
      return T('coach.day-this-paling-enak-start') + (c.focusLabel || T('coach.practice-singkat')) + '. Sepuluh soal aja, ga usah lama.';
    }
    if (/streak|runtun/.test(q)) {
      return T('coach.streak-you') + (c.streak || 0) + T('coach.day-lima-answer-bermakna-udah');
    }
    return T('coach.gue-again-ga-can-nyambung');
  }

  /* ------------------------------------------------------------------ *
   * Pemasangan
   * ------------------------------------------------------------------ */
  function install(options) {
    var opts = options || {};
    if (global.__fiezelCoachBubble) return global.__fiezelCoachBubble;

    var context = {};
    var log = [];
    var peekTimer = null;
    var busy = false;

    var bubble = doc.createElement('button');
    bubble.type = 'button';
    bubble.className = pawHost('fz-coach-bubble');
    bubble.setAttribute('aria-label', 'Buka pembimbing FIEZEL');
    bubble.innerHTML = '<span class="fz-coach-pulse" aria-hidden="true"></span>' +
      pawFace('fz-coach-face');

    bubble.setAttribute('data-fz-scene', 'home');

    /**
     * Mengganti karakter gerak PAW.
     *
     * Kelasnya dilepas dan dipasang ulang lewat reflow paksa (offsetWidth) karena tanpa
     * itu browser menganggap animasi masuknya "sudah berjalan" dan tidak memulainya lagi
     * ketika murid berpindah dua kali ke halaman yang sama karakternya. Gerak masuk yang
     * kadang muncul kadang tidak lebih buruk daripada tidak ada sama sekali.
     */
    /**
     * m025-129 kelahiran PAW. Dijalankan saat marka BENAR-BENAR baru terlihat: sekali
     * saat gelembungnya dipasang, dan sekali tiap kali panel dibuka (wajah di kepala
     * panel itu marka kedua, dan ia memang baru muncul saat itu).
     *
     * TIDAK dijalankan saat pindah halaman. Di sana yang benar adalah gerak masuk
     * sekali-jalan yang jauh lebih pendek - marka-nya tidak ke mana-mana, hanya ganti
     * karakter. Meledakkan ulang tiap pindah menu akan mengubah kelahiran menjadi tik
     * yang berisik, dan itu persis kebalikan dari "eksklusif".
     */
    var bornTimer = null;
    function born(host) {
      if (!host) return;
      host.classList.remove('is-paw-born');
      void host.offsetWidth;
      host.classList.add('is-paw-born');
      // [ADAPTASI] OA-7 §4: paw_appear menemani kelahiran maskot. Penjatahannya (≥8 dtk
      // antar-bunyi, 14 §3.2) dijaga manifest SFX, bukan di sini - born() cukup jujur
      // memanggil, mesinlah yang memutuskan pantas-tidaknya berbunyi.
      // [ADAPTASI-SFX] 14 §3.1 aturan 3: saat kurangi-gerak (OS atau preferensi aplikasi)
      // animasi kelahirannya ditekan CSS - pop tanpa ledakan adalah bunyi yatim, jadi
      // bunyinya ikut diam. reduceMotionNow() hoisted dari bawah, satu ambang yang sama.
      try { if (!reduceMotionNow(null) && typeof self !== 'undefined' && self.FiezelUiSfx) self.FiezelUiSfx.play('paw_appear', typeof window !== 'undefined' ? window : self); } catch (_) {}
      if (bornTimer) clearTimeout(bornTimer);
      bornTimer = setTimeout(function () { host.classList.remove('is-paw-born'); }, 960);
    }

    /**
     * impl-04 - KELAHIRAN POP pasca-onboarding (penerima 'fiezel-onboarding-paw-handoff').
     * Kontrak detail: {via:'finish', animated, reduceMotion, durationMs, bubbleDelayMs}.
     * PAW menyusut ke sudut (320ms) dan gelembung lahir dengan pop kecil bubbleDelayMs
     * setelah penyusutan dimulai - disembunyikan DULU (is-prebirth) supaya yang dilihat
     * murid adalah kelahiran, bukan gelembung yang ternyata sudah menunggu dari tadi.
     * Kurangi-gerak: kelahirannya fade (10 §2 - kemunculan minimal fade, tanpa pop).
     */
    var birthTimer = null;
    function reduceMotionNow(detail) {
      if (detail && detail.reduceMotion === true) return true;
      try { if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (_) {}
      try { return doc.body.classList.contains('reduce-motion'); } catch (_) { return false; }
    }
    function birthPop(detail) {
      var delay = Number(detail && detail.bubbleDelayMs);
      if (!isFinite(delay) || delay < 0) delay = 120; /* nilai kontrak impl-04 sebagai cadangan */
      peek.hidden = true;                 /* sapaan tidak boleh mendahului kelahiran */
      bubble.classList.add('is-prebirth');
      if (birthTimer) clearTimeout(birthTimer);
      birthTimer = setTimeout(function () {
        bubble.classList.remove('is-prebirth', 'is-paw-birth', 'is-paw-birth-fade');
        void bubble.offsetWidth;          /* pola restart animasi yang sama dengan born() */
        if (reduceMotionNow(detail)) {
          bubble.classList.add('is-paw-birth-fade');  /* fade saja - nol gerak */
        } else {
          bubble.classList.add('is-paw-birth');
          /* pop + bunyi paw_appear lewat jalur kelahiran yang SUDAH ada - satu sumber */
          born(bubble);
        }
        setTimeout(function () { bubble.classList.remove('is-paw-birth', 'is-paw-birth-fade'); }, 760);
      }, delay);
    }
    /* Penyambungan penerimanya ada DI BAWAH pembuatan peek - birthPop memegang peek
     * lewat closure dan jalur konsumsi-langsung berjalan sinkron saat install(). */

    var shiftTimer = null;
    function setScene(view) {
      var scene = PAGE_SCENES[view] || 'home';
      if (bubble.getAttribute('data-fz-scene') === scene) return;
      bubble.setAttribute('data-fz-scene', scene);
      bubble.classList.remove('is-paw-shift');
      void bubble.offsetWidth;
      bubble.classList.add('is-paw-shift');
      if (shiftTimer) clearTimeout(shiftTimer);
      shiftTimer = setTimeout(function () { bubble.classList.remove('is-paw-shift'); }, 660);
    }

    var peek = doc.createElement('div');
    peek.className = 'fz-coach-peek';
    peek.hidden = true;
    peek.setAttribute('role', 'status');

    /* impl-04: penerima kelahiran aktif begitu gelembung + peek siap. Boot pertama:
     * event bisa sudah terpancar SEBELUM install() - rekaman segar dikonsumsi sekali. */
    handoffReceiver = birthPop;
    if (lastHandoff && Date.now() - lastHandoff.at < HANDOFF_FRESH_MS) birthPop(lastHandoff.detail);

    var sheet = doc.createElement('div');
    sheet.className = 'fz-coach-sheet';
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="fz-coach-panel" role="dialog" aria-modal="true" aria-label="' + T('coach.panel-aria') + '">' +
        '<div class="fz-coach-head">' +
          /* I11 (O3 §6): kepala panel lahir dengan IKON statis, bukan <fiezel-mascot>.
           * Instance maskot kedua yang dulu dipasang di sini hidup permanen 0x0 di balik
           * sheet[hidden] - timer blink/idle-nya tetap berjalan (bocor). Maskotnya kini
           * dipasang saat panel DIBUKA dan dibongkar saat ditutup (lihat mount/unmount
           * di bawah); disconnectedCallback maskot membersihkan semua timernya. */
          '<span class="fz-coach-avatar"><span class="fz-i fz-coach-face" aria-hidden="true">' + icon('paw') + '</span></span>' +
          T('coach.fiezel-pembimbing-you') +
          '<button type="button" class="fz-coach-close" aria-label="' + T('coach.close-aria') + '">✕</button>' +
        '</div>' +
        '<div class="fz-coach-log" aria-live="polite"></div>' +
        '<div class="fz-coach-chips"></div>' +
        '<form class="fz-coach-form">' +
          '<textarea rows="1" placeholder="' + T('coach.input-placeholder') + '" aria-label="' + T('coach.input-aria') + '"></textarea>' +
          '<button type="submit" class="fz-coach-send" aria-label="' + T('coach.send-aria') + '">→</button>' +
        '</form>' +
      '</div>';

    doc.body.appendChild(peek);
    doc.body.appendChild(bubble);
    doc.body.appendChild(sheet);

    // Kelahiran pertama. Ditunda satu putaran supaya ia berjalan setelah gelembungnya
    // benar-benar tergambar - animasi yang dimulai pada elemen yang belum di-layout akan
    // melompati bingkai pertamanya, dan yang paling sering hilang justru ledakannya.
    setTimeout(function () { born(bubble); }, 40);

    var logHost = sheet.querySelector('.fz-coach-log');
    var chipHost = sheet.querySelector('.fz-coach-chips');
    var form = sheet.querySelector('.fz-coach-form');
    var input = sheet.querySelector('textarea');
    var statusEl = sheet.querySelector('.fz-coach-status');

    function paintLog() {
      logHost.innerHTML = log.map(function (entry) {
        return '<div class="fz-coach-msg is-' + (entry.who === 'user' ? 'user' : 'coach') + '">' +
          entry.html + '</div>';
      }).join('');
      logHost.scrollTop = logHost.scrollHeight;
    }

    function push(who, text, isHtml) {
      log.push({ who: who, html: isHtml ? text : '<p>' + esc(text) + '</p>' });
      if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT);
      paintLog();
    }

    function chips() {
      var view = context.view || 'home';
      var list = [
        { label: T('coach.me-harus-start-from-mana'), q: T('coach.me-harus-start-study-from') },
        { label: T('coach.level-me-sekarang'), q: T('coach.level-kemampuan-me-sekarang-at') }
      ];
      if (view === 'grammar') list.unshift({ label: T('coach.kenapa-me-wrong-terus-at'), q: T('coach.kenapa-me-sering-wrong-at') });
      if (view === 'vocab') list.unshift({ label: 'Cara inget kata baru?', q: T('coach.gimana-cara-cepat-inget-vocab') });
      if (view === 'writing') list.unshift({ label: 'Cek tulisanku dong', q: T('coach.tolong-cek-tulisan-lang-inggrisku') });
      if (view === 'speaking' || view === 'listening' || view === 'skills') {
        list.unshift({ label: 'Tips biar cepat lancar?', q: 'Kasih satu tips singkat biar speaking dan listening cepat lancar.' });
      }
      chipHost.innerHTML = list.slice(0, 3).map(function (c) {
        return '<button type="button" class="fz-coach-chip" data-q="' + esc(c.q) + '">' + esc(c.label) + '</button>';
      }).join('');
    }

    function showPeek(text) {
      if (lessonActive()) return; /* I11: tidak menyapa di atas pelajaran atau layar hasil */
      if (sheet.hidden === false) return;
      peek.textContent = oneLine(text);
      peek.hidden = false;
      clearTimeout(peekTimer);
      peekTimer = setTimeout(function () { peek.hidden = true; }, PEEK_MS);
    }

    /* I11: pasang/bongkar wajah maskot kepala panel mengikuti buka/tutupnya sheet,
     * supaya tidak ada instance 0x0 yang hidup diam-diam di balik panel tertutup. */
    function mountAvatarFace() {
      var avatar = sheet.querySelector('.fz-coach-avatar');
      if (!avatar) return;
      if (pawReady() && !avatar.querySelector('.fz-coach-mascot')) {
        avatar.className = pawHost('fz-coach-avatar');
        avatar.innerHTML = pawFace('fz-coach-face');
      }
    }
    function unmountAvatarFace() {
      var avatar = sheet.querySelector('.fz-coach-avatar');
      if (!avatar || !avatar.querySelector('.fz-coach-mascot')) return;
      avatar.className = 'fz-coach-avatar';
      avatar.innerHTML = '<span class="fz-i fz-coach-face" aria-hidden="true">' + icon('paw') + '</span>';
    }

    function open() {
      if (lessonActive()) return; /* I11: panel tidak pernah membuka di atas pelajaran/hasil */
      peek.hidden = true;
      sheet.hidden = false;
      doc.body.classList.add('fz-coach-open');
      mountAvatarFace();
      // Wajah di kepala panel adalah marka KEDUA, dan ia memang baru muncul detik ini.
      born(sheet.querySelector('.fz-coach-avatar'));
      // Panel baru dibuka: maskot menyapa sekali. 'onboard' dipilih, bukan setState
      // langsung, supaya komponen yang memutuskan levelnya - sapaan kedua dan
      // seterusnya lebih tenang daripada yang pertama.
      paw('react', 'onboard');
      if (!log.length) push('coach', localGreeting(context));
      chips();
      setTimeout(function () { input.focus(); }, 60);
    }

    function close() {
      sheet.hidden = true;
      doc.body.classList.remove('fz-coach-open');
      unmountAvatarFace(); /* I11: instance maskot panel dibongkar, tidak bocor 0x0 */
    }

    async function ask(question) {
      var text = String(question || '').trim();
      if (!text || busy) return;
      busy = true;
      push('user', text);
      input.value = '';
      statusEl.textContent = 'lagi mikir…';
      // Status teks dan wajah maskot harus sepakat: kalau tulisannya "lagi mikir",
      // maskotnya jangan diam. hold:0 = tahan sampai diganti, karena lama menunggu
      // jawaban AI tidak bisa ditebak.
      paw('setState', 'thinking', { hold: 0 });
      try {
        // Pembimbing tidak boleh membuat murid menunggu lama. Jalur AI aplikasi punya
        // batas waktunya sendiri yang panjang (wajar untuk penjelasan panjang di modal);
        // di percakapan, menunggu setengah menit sama saja dengan tidak dijawab. Lewat
        // 12 detik, jawaban lokal yang diberikan - dan itu tetap jawaban.
        var answer = typeof opts.ask === 'function'
          ? await Promise.race([
              opts.ask(text, context),
              new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ASK_TIMEOUT); })
            ])
          : null;
        push('coach', answer && String(answer).trim() ? String(answer) : localAnswer(context, text));
      } catch (error) {
        push('coach', localAnswer(context, text));
      } finally {
        statusEl.textContent = T('coach.pembimbing-you');
        busy = false;
        // Baik jawabannya dari AI atau dari jalur lokal, murid tetap dapat jawaban.
        // Sengaja transient supaya maskot kembali idle sendiri.
        paw('setState', 'encouraging', { hold: 1600 });
      }
    }

    bubble.addEventListener('click', function () { sheet.hidden ? open() : close(); });
    peek.addEventListener('click', open);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    sheet.querySelector('.fz-coach-close').addEventListener('click', close);
    chipHost.addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.fz-coach-chip');
      if (chip) ask(chip.getAttribute('data-q'));
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
    });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) close(); });

    /* I11 (O1-004): saat mode pelajaran MENYALA - stage kuis/sesi dimulai - panel yang
     * sedang terbuka ditutup dan sapaan yang sedang tampil dibungkam, supaya tidak ada
     * lapisan pembimbing yang tersisa/berpindah di atas soal maupun layar hasil. Pengamatnya
     * opsional: tanpa MutationObserver, penjaga lessonActive() di open/showPeek tetap ada. */
    try {
      if (typeof global.MutationObserver === 'function' && doc.body) {
        var lessonWatch = new global.MutationObserver(function () {
          if (!lessonActive()) return;
          if (!sheet.hidden) close();
          peek.hidden = true;
          clearTimeout(peekTimer);
        });
        lessonWatch.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (_) {}

    var api = {
      open: open,
      close: close,
      ask: ask,
      element: bubble,
      /** Dipanggil app.js tiap kali layar berganti. Sapaannya hanya muncul kalau
       *  halamannya memang berganti - menyapa ulang di halaman yang sama itu berisik. */
      update: function (next) {
        var previousView = context.view;
        context = Object.assign({}, context, next || {});
        if (context.view && context.view !== previousView) {
          setScene(context.view);
          chips();
          if (!sheet.hidden) return;
          showPeek(localGreeting(context));
        }
      },
      say: function (text) { showPeek(text); },
      /** Jalur uji kelahiran pop (QA impl-04); produksi memakai event handoff. */
      birth: function (detail) { birthPop(detail); },
      context: function () { return Object.assign({}, context); },
      /** Karakter gerak yang sedang dipakai. Dipakai gerbang dan Diagnostics. */
      scene: function () { return bubble.getAttribute('data-fz-scene') || 'home'; }
    };

    global.__fiezelCoachBubble = api;
    return api;
  }

  global.FiezelCoachBubble = { install: install, oneLine: oneLine, localGreeting: localGreeting, localAnswer: localAnswer };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FiezelCoachBubble;
})(typeof self !== 'undefined' ? self : this);
