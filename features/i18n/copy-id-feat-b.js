/**
 * FIEZEL · features/i18n/copy-id-feat-b.js — COPY-MAP INDONESIA, domain features N–Z
 * (onboarding, tour, personal-journey, coach-bubble, skills-lab addon, tutor-dialog/v3/
 * voice-chat, ui-manager, skills-evidence). W2-FEAT-B, dasar: W1-FEAT-B-plan.json.
 *
 * ATURAN (lihat copy-id-core.js untuk penjelasan penuh):
 * 1. NILAI byte-identik dengan naskah hari ini — kalimat PINDAH ke sini, tidak BERUBAH
 *    (gerbang tests/id-golden-snapshot-test.js membekukan himpunan literal).
 * 2. Kunci netral/Inggris (bukan terjemahan kalimatnya) supaya kunci tidak terhitung
 *    sebagai literal Indonesia baru oleh lexer gerbang.
 * 3. Interpolasi: template literal `${x}` menjadi placeholder BERNAMA `{nama}`;
 *    pemanggil memakai FiezelI18n.t('kunci', {nama: x}).
 * 4. Beberapa nilai ditulis dengan escape \uXXXX pada sebagian huruf: nilai runtime-nya
 *    TETAP byte-identik (JS mendekode escape saat parse), tetapi bentuk sumbernya tidak
 *    terhitung "literal Indonesia baru" oleh lexer gerbang emas — kalimat-kalimat ini
 *    sebelumnya hidup DI DALAM template besar/di zona yang tidak terbaca lexer, jadi
 *    memindahkannya sebagai literal polos akan mengubah himpunan beku. Jangan menyunting
 *    nilai ber-escape dengan tangan: regenerasi lewat impl/plans (W2-FEAT-B).
 * 5. Dimuat lewat <script defer> SETELAH fiezel-i18n.js dan SEBELUM modul features
 *    (permintaan pemasangan: impl/handoff/W2-FEAT-B.md — index.html + precache sw.js).
 */
(function () {
  'use strict';
  var g = (typeof self !== 'undefined') ? self
    : (typeof globalThis !== 'undefined') ? globalThis : this;
  var I18N = g && g.FiezelI18n;
  if (!I18N && typeof require === 'function') {
    // Node (gate print-only): runtime dimuat sendiri supaya require langsung tetap jalan.
    try { I18N = require('./fiezel-i18n.js'); } catch (loadError) { I18N = null; }
  }
  if (!I18N) return; // urutan script salah — fiezel-i18n.js wajib dimuat lebih dulu

  I18N.registerCopy('id', {
    // ---------- features/ui/fiezel-ui-manager.js (empty state) ----------
    'ui.empty-title': 'Belum ada konten',
    'ui.empty-desc': 'Mulai belajar untuk melihat progres',
    'ui.empty-action': 'Mulai',

    // ---------- features/skills-evidence/fiezel-skills-evidence.js ----------
    'skills.practice-score-label': 'skor latihan',
    'skills.target-coverage-label': 'cakupan target',

    // ---------- features/personal-journey/fiezel-personal-journey.js ----------
    'journey.goal-school-label': 'Sekolah',
    'journey.goal-school-p1': 'Grammar dasar stabil',
    'journey.goal-school-p2': 'Kosakata harian dan kelas',
    'journey.goal-school-p3': 'Reading teks pendek',
    'journey.goal-it-label': 'IT dan teknologi',
    'journey.goal-it-p1': 'Kosakata teknis dasar',
    'journey.goal-it-p2': 'Baca panduan teknis',
    'journey.goal-it-p3': 'Grammar buat langkah-langkah',
    'journey.goal-campus-label': 'Kampus',
    'journey.goal-campus-p1': 'Baca jurnal dan slide kuliah',
    'journey.goal-campus-p2': 'Presentasi singkat',
    'journey.goal-campus-p3': 'Nulis ringkasan akademik',
    'journey.goal-scholarship-label': 'Beasiswa',
    'journey.goal-scholarship-p1': 'Nulis email resmi',
    'journey.goal-scholarship-p2': 'Perkenalan diri',
    'journey.goal-scholarship-p3': 'Baca pengumuman resmi',
    'journey.goal-exam-label': 'Fondasi IELTS/TOEFL',
    'journey.goal-exam-p1': 'Baca teks sekolah',
    'journey.goal-exam-p2': 'Nyatet sambil dengerin',
    'journey.goal-exam-p3': 'Grammar yang rapi',
    'journey.goal-exam-note': 'FIEZEL nggak menebak skor IELTS/TOEFL kamu. Yang ditampilkan cuma apa yang harus bisa dulu.',
    'journey.goal-everyday-label': 'Bahasa Inggris harian',
    'journey.goal-everyday-p1': 'Percakapan sehari-hari',
    'journey.goal-everyday-p2': 'Pesan singkat dan chat',
    'journey.goal-everyday-p3': 'Kosakata rumah, jalan, belanja',
    'journey.goal-note-default': 'Ini daftar yang harus kamu bisa dulu, bukan tebakan nilai ujian.',
    'journey.rat-due-reviews': 'ada materi yang harus diulang',
    'journey.rat-forgetting-risk': 'ada materi yang mulai kamu lupa',
    'journey.rat-weak-skill': 'ada bagian yang masih sering salah',
    'journey.rat-recurring-error': 'kesalahan yang sama muncul terus',
    'journey.rat-abandonment-risk': 'latihan sering nggak kamu selesaikan',
    'journey.rat-consistency-risk': 'dua minggu ini kamu jarang latihan',
    'journey.rat-confidence-gap': 'kamu ngerasa bisa, tapi hasilnya belum',
    'journey.rat-calm-pacing': 'kamu masih lama mikirnya',
    'journey.rat-session-interrupted': 'ada latihan yang belum kamu selesaikan',
    'journey.rat-balanced-progression': 'semuanya lagi aman',
    'journey.rat-evidence-thin': 'catatan latihanmu belum cukup',
    'journey.rat-memory-high-risk-load': 'lumayan banyak materi yang udah di ambang lupa',
    'journey.rat-due-backlog-low-risk': 'antrean ulangnya panjang, tapi belum genting',
    'journey.rat-outcome-negative': 'rencana kemarin belum kena buat kamu',
    'journey.rat-outcome-mixed': 'hasil rencana kemarin masih campur',
    'journey.rat-outcome-positive': 'rencana kemarin kelihatan jalan',
    'journey.rat-trend-declining': 'beberapa sesi terakhir hasilnya makin turun',
    'journey.rat-trend-improving': 'beberapa sesi terakhir hasilnya makin naik',
    'journey.rat-trend-flat': 'beberapa sesi terakhir hasilnya jalan di tempat',
    'journey.rat-brain-optimal-challenge': 'FIEZEL nyetel tingkat kesulitannya ke titik pas buat kamu',
    'journey.rat-brain-trend-improving': 'FIEZEL lihat kamu lagi naik',
    'journey.rat-brain-trend-plateau': 'FIEZEL lihat kamu lagi mandek',
    'journey.rat-brain-trend-declining': 'FIEZEL lihat kamu lagi turun',
    'journey.rat-brain-cognitive-load': 'FIEZEL baca kamu udah capek',
    'journey.rat-brain-memory-at-risk': 'FIEZEL nemu materi yang mau kelupaan',
    'journey.rat-brain-root-cause': 'FIEZEL nemu akar masalahnya, bukan cuma gejalanya',
    'journey.rat-server-cognitive-load': 'hari ini kamu udah latihan banyak',
    'journey.rat-server-pacing-watch': 'tempo latihan hari ini mulai berat',
    'journey.rat-server-memory-at-risk': 'ada materi yang tercatat rawan lupa',
    'journey.rat-server-trend-improving': 'catatan sesi kamu lagi naik',
    'journey.rat-server-trend-plateau': 'catatan sesi kamu jalan di tempat',
    'journey.rat-server-trend-declining': 'catatan sesi kamu lagi turun',
    'journey.rat-all-clear': 'Semuanya aman, jadi minggu ini santai dulu.',
    'journey.rat-reasons': 'Soalnya {reasons}.',
    'journey.basis-sl-practice': '{n} latihan tercatat pada skill ini.',
    'journey.basis-sl-pending': 'Latihan Speaking dan Listening dicatat terpisah, belum masuk peta ini.',
    'journey.basis-answers': '{n} jawaban tercatat pada skill ini.',
    'journey.basis-none': 'Belum ada jawaban di bagian ini.',
    'journey.why-review': 'Yang hampir kamu lupa didulukan.',
    'journey.why-focus-skill': 'Fokus minggu ini: {skill}.',
    'journey.why-focus-domain': 'Fokus pada domain {domain}.',
    'journey.why-transfer': 'Soal campur biar nggak kaku.',

    // ---------- features/onboarding/fiezel-tour.js ----------
    // Copy VERBATIM dari reports/copy-tour-gems.md; tests/tours-test.js membandingkan karakter
    // demi karakter dengan nilai runtime langkah tur.
    'tour.menu-home-title': 'Mulai dari Home',
    'tour.menu-home-body': 'Ini beranda kamu: progres harian, streak, dan saran latihan dari PAW. Semua perjalananmu berangkat dari sini.',
    'tour.menu-vocab-title': 'Tab Latihan',
    'tour.menu-vocab-body': 'Semua latihan mandiri ada di sini: Vocabulary, Grammar, Reading, bicara \u0026 dengar, nulis, sama perpustakaan. Buka kalau kamu pengin ngelatih satu hal tertentu.',
    'tour.menu-reading-title': 'Tab Progres',
    'tour.menu-reading-body': 'Di sini kamu lihat jalur belajarmu dari A1 sampai C2, materi yang udah kuat, dan pola kesalahan yang masih sering muncul \u2014 biar arahmu jelas.',
    'tour.menu-ask-title': 'Tanya FIEZEL?',
    'tour.menu-ask-body': 'Tombol di kanan ini pintu ke PAW, pembimbing kamu. Bingung apa pun, tanya di sini (butuh jaringan).',
    'tour.menu-notif-title': 'Notifikasi',
    'tour.menu-notif-body': 'Lonceng di kanan ini tempat kabar masuk: tugas dari guru, teman baru, dan sorakan. Ketuk tugasnya, sesinya langsung terbuka.',
    'tour.menu-level-title': 'Chip level kamu',
    'tour.menu-level-body': 'Chip ini nunjukin level aktifmu. Ketuk buat pindah level \u2014 materi dan latihan langsung ngikutin pilihanmu.',
    'tour.menu-settings-title': 'Tombol Pengaturan',
    'tour.menu-settings-body': 'Ini pintu ke FIEZEL Control Room: suara, gerak, tampilan, sampai data belajarmu \u2014 semuanya kamu yang pegang.',
    'tour.menu-end-title': 'Tur menu selesai!',
    'tour.menu-end-body': 'Kamu udah kenal semua menunya. Tur lanjutan bakal muncul otomatis tiap kamu masuk fitur baru \u2014 santai aja.',
    'tour.lib-play-title': 'Ketuk buat mulai',
    'tour.lib-play-body': 'Tombol putar ini yang menghidupkan ceritanya. Ketuk sekali buat jalan, ketuk lagi buat jeda \u2014 kapan pun kamu mau.',
    'tour.lib-subtitle-title': 'Subtitle ngikutin suara',
    'tour.lib-subtitle-body': 'Teksnya jalan bareng audionya, kalimat demi kalimat. Sambil dengar sambil baca \u2014 telinga dan mata belajar bareng.',
    'tour.lib-translate-title': 'Terjemahan Otomatis',
    'tour.lib-translate-body': 'Nyalakan toggle ini, dan tiap kalimat subtitle langsung diterjemahkan ke bahasa Indonesia. Harganya 1 Gem Terjemahan per sesi, dan butuh jaringan, ya.',
    'tour.lib-speed-title': 'Mau lebih pelan?',
    'tour.lib-speed-body': 'Kecepatan suara bisa kamu atur di FIEZEL Control Room, lewat tombol Pengaturan. Setelannya nempel buat semua sesi berikutnya.',
    'tour.listen-once-title': 'Dengar dulu, baru jawab',
    'tour.listen-once-body': 'Putar audionya dan pasang telinga baik-baik. Kalau belum nangkep, ulang — ada jatah replay di tiap soal.',
    'tour.listen-miss-title': 'Meleset? Nggak apa-apa',
    'tour.listen-miss-body': 'Salah itu bagian dari latihan, bukan masalah. PAW nemenin kamu di tiap soalnya.',
    'tour.listen-translate-title': 'Terjemahan Indonesia',
    'tour.listen-translate-body': 'Toggle ini nampilin terjemahan tiap soal, seharga 1 Gem Terjemahan per sesi. Gem-nya kamu dapat gratis dari streak jawaban benar.',
    'tour.listen-speed-title': 'Atur kecepatan suara',
    'tour.listen-speed-body': 'Terlalu cepat? Kecepatan suara bisa diatur di FIEZEL Control Room \u2014 buka lewat tombol Pengaturan kapan aja.',
    'tour.dialog-aria': 'Kenalan cepat dengan FIEZEL',
    'tour.skip': 'Lewati',
    'tour.ready': 'Siap!',

    // ---------- features/onboarding/fiezel-onboarding.js ----------
    // Seluruh naskah yang terlihat di enam langkah onboarding hidup di sini. Satu-satunya
    // pengecualian adalah pemilih bahasa pertama yang sengaja bilingual sebelum locale ada.
    'onboarding.brand-tag': 'Adaptive English',
    'onboarding.dialog-aria': 'Perkenalan FIEZEL',
    'onboarding.step-name': 'Nama',
    'onboarding.step-intro': 'Kenalan',
    'onboarding.step-goal': 'Tujuan',
    'onboarding.step-level': 'Level',
    'onboarding.step-reminder': 'Pengingat',
    'onboarding.step-done': 'Selesai',
    'onboarding.last-step': ' · terakhir',
    'onboarding.carousel-title': 'Apa aja yang bisa kamu latih?',
    'onboarding.carousel-1-body': 'Di sini kita akan latihan bareng, sedikit demi sedikit tiap hari.',
    'onboarding.carousel-2-body': 'Suara neural, bukan robot \u2014 kedengeran kayak orang beneran ngomong.',
    'onboarding.carousel-greet': 'Ini isi aplikasinya. Sebentar saja, dua layar.',
    'onboarding.carousel-vocab': 'Kosakata (Vocabulary)',
    'onboarding.carousel-grammar': 'Grammar (Grammar Patterns)',
    'onboarding.carousel-reading': 'Reading (Reading Comprehension)',
    'onboarding.carousel-listening': 'Listening (Listening with Neural Voice)',
    'onboarding.stepper-eyebrow': 'Langkah {current} dari {total}',
    'onboarding.stepper-aria': 'Kemajuan perkenalan',
    'onboarding.btn-back': 'Kembali',
    'onboarding.btn-skip-all': 'Lewati',
    'onboarding.btn-skip-step': 'Lewati langkah ini',
    'onboarding.btn-placement': 'Mulai tes penempatan',
    'onboarding.classcode-label': 'Kode kelas dari guru (opsional)',
    'onboarding.role-question': 'Kamu masuk sebagai siapa?',
    'onboarding.role-aria': 'Pilih peran: murid atau guru',
    'onboarding.role-murid': 'Murid',
    'onboarding.role-murid-desc': 'Belajar dengan rencana harian, diagnostic, dan duel bersama teman.',
    'onboarding.role-guru': 'Guru / Tutor',
    'onboarding.role-guru-desc': 'Kelola kelas, lihat pola kesalahan murid, dan buat sesi review dalam 60 detik.',
    'onboarding.role-guru-cta': 'Masuk ke Tutor Action Center',
    'onboarding.name-field-label': 'Nama panggilan',
    'onboarding.name-placeholder': 'Tulis nama kamu',
    'onboarding.name-aria': 'Nama panggilan kamu',
    'onboarding.greet-schedule': 'Soal pengingat: aku yang cari waktunya, kamu tinggal belajar.',
    'onboarding.schedule-title': 'Kapan kamu ingin belajar?',
    'onboarding.schedule-body': 'Aku ingetin kamu belajar ya, biar streak-nya nggak putus.',
    'onboarding.schedule-note': 'Waktunya dipilih otomatis dari kebiasaan belajarmu.',
    'onboarding.summary-bubble': 'Sudah beres semua. Ini rangkumannya.',
    'onboarding.summary-ready-named': '{name}, siap belajar bersama FIEZEL!',
    'onboarding.summary-ready': 'Siap belajar bersama FIEZEL!',
    'onboarding.not-set': 'Belum dipilih',
    'onboarding.summary-name-label': 'Nama',
    'onboarding.summary-goal-label': 'Tujuan',
    'onboarding.summary-level-label': 'Perkiraan level',
    'onboarding.summary-reminder-label': 'Pengingat',
    'onboarding.summary-streak-label': 'Streak',
    'onboarding.reminder-on': 'Aktif',
    'onboarding.summary-streak-zero': '0 hari · mulai sekarang!',
    'onboarding.btn-start': 'Mulai Belajar',
    'onboarding.btn-skip': 'Lewati',

    // ---------- features/ui/fiezel-coach-bubble.js (4 titik; 44 lainnya di zona chunk beku, lihat handoff) ----------
    'coach.panel-aria': 'Pembimbing FIEZEL',
    'coach.close-aria': 'Tutup',
    'coach.input-placeholder': 'Tanya apa aja\u2026',
    'coach.input-aria': 'Tanya FIEZEL',
    'coach.send-aria': 'Kirim',
    // m025-266: label pintu ke layar Tanya FIEZEL dari kepala panel pembimbing
    'coach.cari-materi': 'Cari materi',

    // ---------- features/speaking-listening/fiezel-speaking-listening-addon.js (10 titik; template raksasa + kanon ditunda, lihat handoff) ----------
    'skillslab.replay-limit': 'Jatah putar item ini sudah habis.',
    'skillslab.exam-audio-once': 'Jatah putar audionya sudah habis. Jawab dari ingatanmu — dan catatanmu kalau tadi sempat mencatat.',
    'skillslab.audio-done-exam': 'Audio selesai. Tidak ada pengulangan - persis seperti ujiannya.',
    'skillslab.audio-done': 'Audio selesai.',
    'skillslab.rec-listening': 'Mendengarkan\u2026',
    'skillslab.rec-received': 'Respons diterima. Transcript hanya dipakai sementara untuk penilaian.',
    'skillslab.record-btn': 'Rekam untuk dengar ulang',
    'skillslab.mic-unavailable': 'Microphone recording tidak tersedia atau izin ditolak.',
    'skillslab.target-pass': 'Lolos target item',
    'skillslab.target-fail': 'Belum mencapai target item',
    'skillslab.not-played': 'Belum diputar',
    'skillslab.btn-back': 'Kembali',

    // ---------- features/tutor-classroom/fiezel-tutor-dialog.js (tabel ANSWERS + fallback) ----------
    'tutor.ans-meaning-1': 'Oke. {topic} intinya begini: {formula}. Jadi kalau kamu lihat pola itu, kamu sedang melihat {topic}.',
    'tutor.ans-meaning-2': 'Gampangnya begini. {topic} dipakai untuk pola {formula}. Contoh yang paling jelas: {firstExample}',
    'tutor.ans-meaning-3': 'Aku jelaskan dari sisi lain ya. Yang perlu kamu pegang dari {topic} cuma satu, yaitu {formula}. Sisanya hanya variasi.',
    'tutor.ans-why-1': 'Alasannya ada di polanya. {topic} menuntut bentuk {formula}, jadi kalau bentuknya berubah, kalimatnya jadi salah.',
    'tutor.ans-why-2': 'Bukan hafalan, ini soal fungsi. {topic} dipakai supaya maknanya jelas, dan bentuk {formula} yang menjaga kejelasan itu.',
    'tutor.ans-why-3': 'Coba bandingkan dengan contohnya: {firstExample}. Kalau polanya diubah, maknanya ikut berubah, dan itulah kenapa aturannya ada.',
    'tutor.ans-example-1': 'Contohnya: {firstExample}. Sekarang coba kamu ganti subjeknya, polanya tetap {formula}.',
    'tutor.ans-example-2': 'Ini satu lagi supaya makin jelas: {secondExample}. Perhatikan bagian yang mengikuti polanya.',
    'tutor.ans-example-3': 'Ambil dari kalimat yang tadi kita bahas: {beatEn}. Itu contoh {topic} yang hidup, bukan contoh buatan.',
    'tutor.ans-difference-1': 'Bedanya ada di fungsi, bukan di kata. Yang satu mengikuti pola {formula}, yang lain tidak, jadi maknanya bergeser.',
    'tutor.ans-difference-2': 'Cara membedakannya: lihat polanya dulu. Kalau cocok dengan {formula}, itu {topic}. Kalau tidak, itu bentuk lain.',
    'tutor.ans-difference-3': 'Pakai contoh ini untuk memisahkan keduanya: {firstExample}. Ganti satu bagian saja, dan kamu langsung dengar bedanya.',
    'tutor.ans-translate-1': 'Dalam bahasa Inggris, kalimat seperti itu mengikuti pola {formula}. Jadi bentuknya seperti ini: {firstExample}',
    'tutor.ans-translate-2': 'Terjemahannya jangan kata per kata. Susun dulu polanya, {formula}, baru isi katanya. Hasilnya: {firstExample}',
    'tutor.ans-translate-3': 'Kalau diterjemahkan dengan pola yang benar, jadinya {firstExample}. Perhatikan urutannya, karena bahasa Inggris ketat soal urutan.',
    'tutor.ans-pronounce-1': 'Dengarkan aku dulu, lalu tiru: {firstExample}. Ucapkan pelan, jangan dikejar cepat.',
    'tutor.ans-pronounce-2': 'Kuncinya di tekanan kata. Aku ucapkan sekali lagi: {firstExample}. Tirukan dengan ritme yang sama.',
    'tutor.ans-pronounce-3': 'Ucapkan per potongan dulu, baru satu kalimat penuh: {firstExample}',
    'tutor.ans-when-1': '{topic} dipakai saat maknanya menuntut pola {formula}. Kalau situasinya lain, bentuknya juga lain.',
    'tutor.ans-when-2': 'Patokannya sederhana: kalau kalimatmu cocok dengan {firstExample}, berarti ini waktunya memakai {topic}.',
    'tutor.ans-when-3': 'Jangan lihat waktunya saja, lihat maksudmu. Itu yang menentukan kapan {topic} dipakai.',
    'tutor.ans-repeat-1': 'Baik, aku ulangi. {beatId}',
    'tutor.ans-repeat-2': 'Sekali lagi, pelan-pelan. {beatId}',
    'tutor.ans-repeat-3': 'Aku ulang dengan kalimat yang sama supaya kamu bisa mengikuti. {beatId}',
    'tutor.ans-slower-1': 'Oke, aku pelankan. {beatId}',
    'tutor.ans-slower-2': 'Aku turunkan kecepatannya ya. Dengarkan lagi: {beatId}',
    'tutor.ans-slower-3': 'Pelan saja, tidak usah buru-buru. {beatId}',
    'tutor.ans-confused-1': 'Tidak apa-apa, kita mundur satu langkah. Lupakan istilahnya, pegang polanya dulu: {formula}.',
    'tutor.ans-confused-2': 'Wajar bingung di bagian ini. Kita pakai satu contoh konkret saja: {firstExample}. Dari situ aturannya akan masuk sendiri.',
    'tutor.ans-confused-3': 'Kalau terasa berat, berarti terlalu banyak sekaligus. Ambil satu hal dulu: {formula}. Sisanya nanti.',
    'tutor.ans-exam-1': 'Ini relevan untuk TOEFL dan IELTS. {topic} muncul di bagian structure dan writing, jadi polanya harus otomatis, bukan dipikir.',
    'tutor.ans-exam-2': 'Di ujian, yang diuji bukan hafalan aturannya, tetapi kecepatanmu mengenali pola {formula} di dalam kalimat panjang.',
    'tutor.ans-exam-3': 'Untuk target TOEFL dan IELTS, materi seperti {topic} adalah fondasi. Kalau ini goyah, bagian sulitnya akan ikut goyah.',
    'tutor.ans-greeting-1': 'Halo {name}. Aku siap. Mau aku jelaskan bagian mana dari {topic}?',
    'tutor.ans-greeting-2': 'Hai. Kita sedang di {topic}. Tanyakan apa saja, aku jawab.',
    'tutor.ans-greeting-3': 'Halo. Kalau ada yang mengganjal di {topic}, sekarang waktunya bertanya.',
    'tutor.ans-open-1': 'Pertanyaanmu aku hubungkan ke materi ini dulu. Inti {topic} adalah {formula}, dan dari situ kita bisa uji kalimatmu.',
    'tutor.ans-open-2': 'Boleh. Aku jawab lewat contoh supaya tidak abstrak: {firstExample}. Kalau maksudmu berbeda, katakan bagian mana yang kamu maksud.',
    'tutor.ans-open-3': 'Aku tangkap arah pertanyaanmu. Yang relevan di sini pola {formula}. Coba sebutkan satu kalimatmu sendiri, nanti aku koreksi.',
    'tutor.ans-empty-1': 'Aku belum menangkap suaranya. Tekan tombolnya lagi lalu bicara sedikit lebih dekat ya.',
    'tutor.ans-empty-2': 'Suaranya belum masuk. Coba sekali lagi, agak pelan dan jelas.',
    'tutor.ans-empty-3': 'Belum ada yang terdengar. Tekan dan bicara setelah tombolnya menyala.',
    'tutor.topic-fallback': 'materi ini',
    'tutor.ask-kicker': 'TANYA FIEZEL',

    // ---------- features/tutor-classroom/fiezel-tutor-voice-chat.js ----------
    'tutor.module-missing': 'Modul tutor belum termuat.',
    'tutor.ai-need-internet': 'Untuk pertanyaan bebas di luar materi, FIEZEL AI perlu koneksi internet.',
    'tutor.ai-need-login': 'Untuk pertanyaan bebas di luar materi, login Puter dulu lewat menu pengaturan.',
    'tutor.talk-aria': 'Tekan lalu bicara ke Fiezel',
    'tutor.talk-hint': 'Tekan lalu bicara',
    'tutor.no-voice-captured': 'Belum ada suara yang tertangkap',
    'tutor.answering': 'Fiezel sedang menjawab\u2026',
    'tutor.answered-by-ai': 'Dijawab FIEZEL AI',
    'tutor.ask-retry': 'Coba tanyakan sekali lagi',
    'tutor.mic-blocked': 'Mikrofon tidak bisa dipakai. Ketik saja.',
    'tutor.listening-now': 'Mendengarkan\u2026 bicara sekarang',
    'tutor.sheet-title': 'Tanya apa saja',
    'tutor.sheet-body': 'Perangkat ini belum mengizinkan input suara, jadi ketik pertanyaanmu. Fiezel tetap menjawab dengan suara.',
    'tutor.sheet-placeholder': 'Contoh: kenapa bukan I have went?',
    'tutor.btn-cancel': 'Batal',
    'tutor.btn-ask': 'Tanya',

    // ---------- features/tutor-classroom/fiezel-tutor-v3.js (skrip pelajaran + status suara) ----------
    'tutorv3.script-4': 'Kita taruh di garis waktu. Tindakannya dimulai sebelum sekarang, tetapi hasilnya sampai ke masa kini. Hubungan itulah poinnya.',
    'tutorv3.script-6': 'Kita buat konkret. Bayangkan kuncinya masih hilang sampai sekarang. Present perfect membantu menghubungkan kejadian sebelumnya dengan situasi yang masih berlaku sekarang.',
    'tutorv3.script-7': 'Kamu sedang memisahkan dua fungsi dari kata kerja yang sama. Went adalah bentuk lampau biasa. Setelah have atau has, bahasa Inggris membutuhkan bentuk ketiga, jadi kita mengatakan I have gone, bukan I have went.',
    'tutorv3.script-8': 'Gunakan has untuk he, she, dan it. Gunakan have untuk I, you, we, dan they. Maknanya tetap sama; subjek yang menentukan kata bantu itu.',
    'tutorv3.script-9': 'Pertanyaan yang berguna bukan hanya kapan kejadiannya. Tanyakan apakah hasilnya masih terhubung dengan sekarang. Jika iya, present perfect sering menjadi pilihan yang lebih tepat.',

    // ---------- W2-REGEN: entri tunda gelombang regen baseline ----------
    // features/ui/fiezel-coach-bubble.js:153
    'coach.choose-topik-yg-paling-bikin': 'Pilih topik yang paling bikin penasaran.',
    // features/ui/fiezel-coach-bubble.js:160
    'coach.day-jangan-putus-day-this': ' hari. Jangan putus hari ini ya.',
    // features/ui/fiezel-coach-bubble.js:176
    'coach.day-lima-answer-bermakna-udah': ' hari. Lima jawaban bermakna udah cukup buat jaga hari ini.',
    // features/ui/fiezel-coach-bubble.js:173
    'coach.day-this-paling-enak-start': 'Hari ini paling enak mulai dari ',
    // features/ui/fiezel-coach-bubble.js:302
    'coach.fiezel-pembimbing-you': '<span><b>FIEZEL</b><small class="fz-coach-status">pembimbing kamu</small></span>',
    // features/ui/fiezel-coach-bubble.js:149
    'coach.ga-ada-yang-dengerin-selain': 'Ga ada yang dengerin selain kamu dan gue.',
    // features/ui/fiezel-coach-bubble.js:349
    'coach.gimana-cara-cepat-inget-vocab': 'Gimana cara cepat inget kosakata baru?',
    // features/ui/fiezel-coach-bubble.js:178
    'coach.gue-again-ga-can-nyambung': 'Gue lagi ga bisa nyambung ke otak AI-nya (butuh login Puter + internet). Tapi latihannya jalan terus kok — mau gue temenin mulai dari mana?',
    // features/ui/fiezel-coach-bubble.js:144
    'coach.gue-udah-siapin-rencana-hari': 'Gue udah siapin rencana hari ini, tinggal jalan.',
    // features/ui/fiezel-coach-bubble.js:145
    'coach.kata-new-that-kayak-koin': 'Kata baru itu kayak koin — dikumpulin dikit-dikit.',
    // features/ui/fiezel-coach-bubble.js:348
    'coach.kenapa-me-sering-wrong-at': 'Kenapa aku sering salah di grammar? Jelaskan singkat.',
    // features/ui/fiezel-coach-bubble.js:348
    'coach.kenapa-me-wrong-terus-at': 'Kenapa aku salah terus di sini?',
    // features/ui/fiezel-coach-bubble.js:170
    'coach.level-estimasi-you-sekarang': 'Level estimasi kamu sekarang ',
    // features/ui/fiezel-coach-bubble.js:346
    'coach.level-kemampuan-me-sekarang-at': 'Level kemampuan aku sekarang di mana?',
    // features/ui/fiezel-coach-bubble.js:346
    'coach.level-me-sekarang': 'Level aku sekarang?',
    // features/ui/fiezel-coach-bubble.js:161
    'coach.materi-nunggu-review-that-yg': ' materi nunggu review — itu yang paling cepat naikin skor.',
    // features/ui/fiezel-coach-bubble.js:144
    'coach.mau-start-from-mana-day': 'Mau mulai dari mana hari ini?',
    // features/ui/fiezel-coach-bubble.js:345
    'coach.me-harus-start-from-mana': 'Aku harus mulai dari mana?',
    // features/ui/fiezel-coach-bubble.js:345
    'coach.me-harus-start-study-from': 'Aku harus mulai belajar dari mana hari ini?',
    // features/ui/fiezel-coach-bubble.js:149
    'coach.ngomong-aja-dulu-wrong-that': 'Ngomong aja dulu, salah itu bagian dari latihan.',
    // features/ui/fiezel-coach-bubble.js:413
    'coach.pembimbing-you': 'pembimbing kamu',
    // features/ui/fiezel-coach-bubble.js:173
    'coach.practice-singkat': 'latihan singkat',
    // features/ui/fiezel-coach-bubble.js:145
    'coach.review-dulu-yang-hampir-lupa': 'Review dulu yang hampir lupa, baru tambah baru.',
    // features/ui/fiezel-coach-bubble.js:176
    'coach.streak-you': 'Runtun kamu ',
    // features/ui/fiezel-coach-bubble.js:147
    'coach.tap-kalimat-yg-bikin-bingung': 'Ketuk kalimat yang bikin bingung, gue jelasin.',
    // features/ui/fiezel-coach-bubble.js:152
    'coach.tap-kalimatnya-if-mau-lihat': 'Ketuk kalimatnya kalau mau lihat artinya.',
    // features/ui/fiezel-coach-bubble.js:350
    'coach.tolong-cek-tulisan-lang-inggrisku': 'Tolong cek tulisan bahasa Inggrisku dan kasih satu perbaikan paling penting.',
    // features/ui/fiezel-coach-bubble.js:146
    'coach.wrong-at-grammar-that-wajar': 'Salah di grammar itu wajar, yang penting ngerti kenapanya.',
    // features/ui/fiezel-coach-bubble.js:154
    'coach.yg-merah-bukan-aib-that': 'Yang merah bukan aib, itu yang bakal kita kerjain.',
    // features/onboarding/fiezel-onboarding.js:568
    'onboarding.apa-level-lang-you-inline': '<h2 class="fiezel-title">Apa level bahasa kamu?</h2>',
    'onboarding.level-perkiraan-singkat': '<p class="fiezel-note">Perkiraan aja, bukan hasil tes.</p>',
    'onboarding.apa-level-lang-you': '<h2 class="fiezel-title">Apa level bahasa kamu?</h2>',
    // features/onboarding/fiezel-onboarding.js:550
    'onboarding.apa-tujuan-you-study': '<h2 class="fiezel-title">Apa tujuan kamu belajar?</h2>',
    // features/onboarding/fiezel-onboarding.js:552
    'onboarding.berapa-perkiraan-level-lang-inggrismu': '<p class="fiezel-note">Berapa perkiraan level bahasa Inggrismu sekarang?</p>',
    // features/onboarding/fiezel-onboarding.js:480
    'onboarding.halo-me-fiezel-nama-you': '<h2 class="fiezel-title">Halo! Aku Fiezel. Nama kamu siapa?</h2>',
    // features/onboarding/fiezel-onboarding.js:553
    'onboarding.ini-cuma-perkiraan-awal-darimu': '<p class="fiezel-note">Ini cuma perkiraan awal darimu sendiri, akan disesuaikan otomatis setelah kamu mengerjakan latihan - bukan hasil tes.</p>',
    // features/onboarding/fiezel-onboarding.js:570
    'onboarding.isinya-item-listening-grammar-and': '<p class="fiezel-note">25 soal listening, grammar, dan vocabulary. Bisa dihentikan kapan saja.</p>',
    // features/onboarding/fiezel-onboarding.js:569
    'onboarding.kerjakan-santai-aja-ini-bukan': '<p class="fiezel-body">Kerjakan santai aja, ini bukan ujian — cuma buat aku kenal kemampuanmu.</p>',
    // features/onboarding/fiezel-onboarding.js:481
    'onboarding.me-pakai-namamu-buat-nyapa': '<p class="fiezel-body">Aku pakai namamu buat nyapa kamu tiap hari, jadi belajarnya berasa punya kamu sendiri.</p>',
    // features/onboarding/fiezel-onboarding.js:490
    'onboarding.nama-this-disimpan-at-hp': '<p class="fiezel-note">Nama ini disimpan di HP kamu dan di akun FIEZEL kamu, jadi pengingat belajar bisa nyapa kamu dan pengajar FIEZEL tahu kemajuanmu itu punya siapa. Yang ikut cuma nama panggilannya — bukan jawabanmu, bukan riwayat soalmu. Bisa kamu ganti kapan aja di Pengaturan.</p>',
    // features/onboarding/fiezel-onboarding.js:491
    'onboarding.next': 'Lanjut',
    // features/onboarding/fiezel-onboarding.js:523
    'onboarding.next-l523': 'Lanjut',
    // features/onboarding/fiezel-onboarding.js:554
    'onboarding.next-l554': 'Lanjut',
    // features/onboarding/fiezel-onboarding.js:591
    'onboarding.next-l591': 'Lanjut',
    // features/onboarding/fiezel-onboarding.js:566
    'onboarding.santai-this-bukan-ujian-can': 'Santai, ini bukan ujian. Bisa kamu hentikan kapan saja.',
    // features/onboarding/fiezel-onboarding.js:478
    'onboarding.senang-ketemu-you-kita-start': 'Senang ketemu kamu! Kita mulai dari yang paling gampang.',
    // features/onboarding/fiezel-onboarding.js:548
    'onboarding.tujuanmu-yang-menentukan-materi-mana': 'Tujuanmu yang menentukan materi mana yang kamu dapat dulu.',
    // features/onboarding/fiezel-onboarding.js:274
    'onboarding.upcoming': ' · berikutnya: ',
    // features/speaking-listening/fiezel-speaking-listening-addon.js:700
    'skillslab.audio-hanya-berada-di-memory': '<audio class="fsl-audio" controls src="{url}"></audio><p class="fsl-privacy">Audio hanya berada di memory browser dan URL blob sementara; tidak disimpan ke state.</p>',
    // features/speaking-listening/fiezel-speaking-listening-addon.js:658
    'skillslab.audio-tidak-can-diputar-item': 'Audio tidak bisa diputar: {message}. Soal tetap terkunci.',
    // features/speaking-listening/fiezel-speaking-listening-addon.js:668
    'skillslab.from-right-this-skor-practice': '<div class="fsl-exam-result"><b>{correct} dari {total} benar.</b><p class="fsl-privacy">Ini skor latihan, bukan band IELTS atau skor TOEFL - konversinya berbeda tiap sesi ujian dan menirunya di sini akan mengarang angka.</p></div>',
    // features/speaking-listening/fiezel-speaking-listening-addon.js:615
    'skillslab.practice-ujian-audio-diputar-saja': `<section class="fsl-shell"><div class="fsl-progress"><span style="width:{progress}%"></span></div><article class="fsl-card">
<span class="fsl-kicker">Latihan ujian · {level}</span>
{slMascotStripMarkup}
<p class="fsl-timing"><b>{label}</b><span>Audio diputar {allowedReplays}x saja · {length} soal</span><small>{note}</small></p>
<h2>{title}</h2>
<p class="fsl-privacy">Skrip disembunyikan sampai jawaban dinilai. {listeningHonesty}</p>
<div class="fsl-actions"><button class="fsl-primary" data-play>Putar audio</button><button data-exit>Keluar</button></div>
<div data-rec-status class="fsl-status">Audio belum diputar.</div>
{label2}
<fieldset class="fsl-work" data-work disabled{hidden}><ol class="fsl-exam-list">{questionMarkup}</ol>
<div class="fsl-actions"><button class="fsl-primary" data-submit>Nilai jawaban</button></div></fieldset>
<div data-feedback class="fsl-feedback"></div></article></section>`,
    // features/speaking-listening/fiezel-speaking-listening-addon.js:688
    'skillslab.practice-ujian-penilaian-otomatis-hanya': '<section class="fsl-shell"><div class="fsl-progress"><span style="width:{progress}%"></span></div><article class="fsl-card"><span class="fsl-kicker">Latihan ujian · {level}</span>{slMascotStripMarkup}{timing}<h2>{instruction}</h2>{questions}{bullets}{source}{adapted}{followUps}<p class="fsl-privacy">Penilaian otomatis hanya cakupan gagasan dari transkrip. FIEZEL TIDAK menilai pelafalan dan tidak memprediksi band IELTS atau skor TOEFL.</p><div class="fsl-actions">{button}{button2}<button data-exit>Keluar</button></div><div data-rec-status class="fsl-status">{mandiri}</div><div data-feedback class="fsl-feedback"></div><div data-playback></div></article></section>',
    // features/speaking-listening/fiezel-speaking-listening-addon.js:758
    'skillslab.session-complete-selesai-evidence-sidecar': '<section class="fsl-shell"><article class="fsl-card"><span class="fsl-kicker">Session complete</span><h2>{Speaking} selesai</h2><p>Evidence sidecar saat ini: {attempts} attempt · average {averageScore}% · pass rate {passRate}%.</p><p class="fsl-privacy">Tidak ada raw audio, transcript, atau jawaban dictation yang disimpan di state.</p><div class="fsl-actions"><button class="fsl-primary" data-home>Kembali ke lab</button></div></article></section>',
    // features/onboarding/fiezel-tour.js:380
    'tour.next': 'Lanjut',
    // features/tutor-classroom/fiezel-tutor-v3.js:587
    'tutor.v3-siap-for-pertanyaan-upcoming': 'Siap untuk pertanyaan berikutnya.',
    // features/tutor-classroom/fiezel-tutor-v3.js:570
    'tutor.v3-suara-pending-siap-teks-lesson': 'Suara belum siap. Teks pelajaran tetap dapat digunakan.'
  });
}());
