importScripts('./version.js');
// CACHE is the stable runtime/data cache used by neural preparation. Do not bind
// mutable application-shell generations to it: prepared neural assets must survive
// a shell release without being rewritten underneath a live document.
const CACHE=`fiezel-v${self.FIEZEL_VERSION}`;
/* m025-201: anggaran tunggu jaringan untuk NAVIGASI saja (bukan aset). 2,5 detik dipilih
 * karena index.html hanya 47 KB - jaringan yang sehat menjawabnya jauh di bawah itu, jadi
 * jalur pemulihan-otomatis praktis tidak pernah menyentuh batas ini. Yang menyentuhnya justru
 * jaringan yang menggantung, dan di sana setiap detik tambahan adalah detik murid menatap
 * layar kosong padahal cangkangnya sudah ada di perangkat. */
// m025-162: rebase di atas m026-01 (maskot PAW). DIAG_BUILD + FIEZEL_PAGE_BUILD naik ke
// m025-159 di commit ini, jadi awalan SW_REV ikut naik; deskriptor menggabungkan kedua
// gelombang (reading-register + maskot) supaya jejak rilisnya jujur.
// m028: rebrand "Warm Paper, Bright Mind" fase 1 (token) + splash + onboarding. Yang
// berubah adalah style.css, index.html (blok kritis), dan fiezel-onboarding.js - ketiganya
// ada di shell, jadi revisi HARUS naik atau murid lama akan melihat cangkang berwarna lama
// di atas kode baru. Naik SEKALI untuk seluruh gelombang ini: tiap kenaikan memaksa unduh
// ulang cangkang, dan tiga kenaikan untuk satu rilis berarti tiga kali beban itu.
// m028 fase2: enam belas kelompok komponen (state, tombol, pilihan jawaban, chip,
// progress, tab, nav, kartu, hint, audio, modal, form, toggle, empty/skeleton,
// tipografi, cleanup token pastel) + berkas font baru Fredoka-var.woff2. style.css
// dan assets/fonts ada di shell, jadi revisi HARUS naik. Naik SEKALI untuk seluruh
// fase, bukan per kelompok: tiap kenaikan memaksa unduh ulang cangkang.
// Fase 2 (B3): revisi dinaikkan karena daftar precache berubah (listening adaptif + cloze
// bank) - tanpa menaikkan SW_REV, shell cache lama tetap dipakai dan berkas baru tidak
// pernah masuk precache pengguna lama.
// m025-173: lapisan game & UX overhaul ikut fase ini - ASSETS bertambah (prasasti) dan
// isi app.js/style.css/addon berubah, jadi revisi naik lagi di atas fase 2 braincore.
// MERGE 28 Agu 2026 (kedua): hulu mendarat lagi dengan braincore fase 3 dan sudah memakai
// m025-174, angka yang juga dipakai jalur rollout Cloudflare. Tabrakan versi berarti satu
// revisi memayungi dua daftar precache berbeda, jadi revisi dinaikkan ke m025-175. Daftar
// ASSETS tetap UNION nyata kedua sisi; nol entri dibuang.
// m025-177: identitas rupa-bunyi FIEZEL - splash v4 (partikel + equalizer + cap PAW, OA-9)
// menambah tiga modul brand ke shell, pustaka SFX terproduksi menambah 27 sampel OGG ke
// shell (fiezel-ui-sfx.js kini pemutar sampel, bukan sintesis), dan fallback MP3 (OI-1,
// Safari/iOS tidak bisa mendekode Ogg Vorbis) menambah 27 kembaran .mp3 di direktori yang
// sama TANPA precache (lihat catatan di bawah ASSETS). Semua berkas shell berubah dalam
// satu gelombang rilis, jadi revisi naik SEKALI - DIAG_BUILD + FIEZEL_PAGE_BUILD ikut ke
// m025-177 (kontrak install-health/classroom-test: awalan SW_REV = build halaman).
// m025-186 (Wave 1 i18n, AI-13 F02/F06, direbase di atas m025-185 splash-sfx): daftar ASSETS
// bertambah - runtime i18n (features/i18n/fiezel-i18n.js) dan copy-map Indonesia (copy-id-*.js)
// masuk shell supaya murid Indonesia offline tetap membaca kalimat byte-identik begitu literal
// pindah ke copy-map. Konsekuensi yang disadari dan diterima: kenaikan revisi ini memaksa SEMUA
// perangkat terpasang mengunduh ulang cangkang ±9,7 MB (AI-13 F03). Aset Thai SENGAJA
// TIDAK ikut ASSETS - ia hidup di cache locale terpisah (LOCALE_TH_CACHE di bawah) yang
// diisi halaman on-demand, meniru pola neural-prepare, sehingga murid Indonesia tidak
// pernah membayar byte Thai.
// m025-246: gelombang penyederhanaan pengalaman. Yang berubah dan ADA DI SHELL:
// index.html (tab bar 4 tujuan, <html> tanpa data-theme, preload font), style.css (Tema
// Malam, kartu Hari ini, ringkasan sesi, Fredoka dicabut), app.js, dan berkas BARU
// fiezel-ux-flags.js + features/i18n/copy-id-redesign.js yang keduanya masuk ASSETS.
// Daftar precache berubah, jadi revisi WAJIB naik: tanpa itu, shell cache lama tetap
// dilayani dan kedua berkas baru tidak pernah sampai ke pengguna lama - aplikasi mereka
// akan menjalankan app.js baru tanpa berkas benderanya, dan seluruh bendera jatuh ke
// salinan bawaan di app.js. Naik SEKALI untuk seluruh gelombang.
const SW_REV='m025-266-bottomnav-redesign-20260906';
const SHELL_CACHE=`fiezel-shell-${SW_REV}`;
// m025-61: health check menanyakan revisi shell langsung ke worker yang sedang aktif.
// Menebaknya dari nama cache tidak cukup: cache lama bisa tertinggal, sedangkan jawaban ini
// datang dari worker yang benar-benar melayani halaman.
self.addEventListener('message',event=>{
  // m025-212: satu-satunya pintu skipWaiting. Halaman TIDAK boleh berpindah generasi
  // controller diam-diam di tengah sesi (lihat catatan di install di bawah) - tetapi kalau
  // murid sendiri menekan "Perbarui sekarang" di kartu pembaruan, perpindahan itu justru
  // yang ia minta, dan halaman sudah siap memuat ulang di controllerchange.
  if(event?.data?.type==='FIEZEL_SKIP_WAITING'){self.skipWaiting();return}
  if(event?.data?.type!=='FIEZEL_HEALTH_PING')return;
  const reply={type:'FIEZEL_HEALTH_PONG',swRev:SW_REV};
  // Balas lewat port yang dikirim halaman bila ada; kalau tidak, lewat klien pengirimnya.
  if(event.ports&&event.ports[0])event.ports[0].postMessage(reply);
  else event.source?.postMessage?.(reply);
});
// m025-121: lapisan mesin suara cadangan ikut di-precache sebagai KODE. Berkas model
// (vendor/supertonic-3, 152 MB) sengaja TIDAK ada di daftar ini - ia punya cache sendiri
// yang diisi pengunduh latar dan bertahan lintas rilis; memasukkannya ke shell berarti
// setiap kenaikan SW_REV mengunduh ulang seluruh 152 MB itu.
const ASSETS=['./','./index.html','./style.css','./features/mascot/fiezel-motion.css','./features/mascot/fiezel-mascot.js','./features/mascot/fiezel-paw-slot.js','./version.js','./report-config.js','./core-config.js','./fiezel-ux-flags.js','./fiezel-puter-ready.js','./fiezel-lazy-loader.js','./content-canary.js','./content-promotion.js','./content-canary-config.js','./lucide.min.js','./app.js','./validator.js','./manifest.json','./vocabulary-master.json','./reading-bank.json','./grammar-templates.json','./grammar-labels-id.js','./grammar-curriculum-v1.json','./writing-prompts-v1.json','./reading-exam-v1.json','./grammar-misconception-id.json','./favicon-64.png','./apple-touch-icon.png','./instagram.svg','./creator-report-setup.html','./creator-report-dashboard.html','./fiezel-report-worker.js','./audio/manifest.json','./features/audio-assets/fiezel-audio-key.js','./features/audio-assets/fiezel-audio-manifest.js','./features/audio-assets/fiezel-audio-resolver.js','./features/neural-voice/fiezel-neural-voice-config.js','./features/neural-voice/fiezel-diag-panel.js','./features/diagnostics/fiezel-diagnostic-targets.js','./features/diagnostics/fiezel-diagnostic-bus.js','./features/diagnostics/fiezel-module-selftests.js','./features/diagnostics/fiezel-diagnostic-register.js','./features/classroom/fiezel-classroom.js','./features/classroom/classroom-lessons-v1.json','./features/tutor-classroom/fiezel-tutor-v3.js','./features/tutor-classroom/tutor-v3.css','./features/speaking-listening/speaking-listening-config.js','./features/speaking-listening/gems-core.js','./features/prasasti/fiezel-prasasti-core.js','./features/social/fiezel-social.js','./features/social/fiezel-invite-link.js','./features/social/fiezel-social-notify.js','./features/notify/fiezel-inbox.js','./features/auth/fiezel-account.js','./features/speaking-listening/fiezel-speaking-listening-addon.js','./features/speaking-listening/speaking-listening-addon.css','./features/speaking-listening/listening-bank-v1.json','./features/speaking-listening/speaking-bank-v1.json','./features/speaking-listening/speaking-exam-v1.json','./features/speaking-listening/listening-exam-v1.json','./features/neural-voice/fiezel-prosody.js','./features/neural-voice/fiezel-puter-voice.js','./features/neural-voice/fiezel-subtitle.js','./features/neural-voice/fiezel-subtitle-translate.js','./features/neural-voice/fiezel-voice-say.js','./features/neural-voice/fiezel-voice-diagnostics.js','./features/neural-voice/fiezel-voice-persona.js','./features/neural-voice/fiezel-sherpa-vits-adapter.js','./features/neural-voice/fiezel-neural-voice.js','./features/neural-voice/fiezel-web-audio-player.js','./features/neural-voice/fiezel-m0281-prebootstrap-hotfix.js','./features/neural-voice/fiezel-neural-voice-bootstrap.js','./features/neural-voice/fiezel-neural-voice-ios-cache-fix.js','./features/neural-voice/fiezel-neural-voice-cache-integrity-repair.js','./features/neural-voice/fiezel-neural-voice-audibility-fix.js','./features/neural-voice/fiezel-voice-offline-autoload.js','./features/ui/fiezel-zoom-lock.js','./features/search/fiezel-search.js','./features/ui/fiezel-back-nav.js','./features/brain/fiezel-core-brain.js','./features/ui/fiezel-icons.js','./features/ui/fiezel-coach-bubble.js','./features/ui/fiezel-report-gesture-isolation.js','./features/ui/fiezel-boot-tail.js','./features/ui/fiezel-update-prompt.js','./features/ui/fiezel-ui-manager.js','./features/ui/fiezel-ab-testing.js','./features/ui/skeleton-helpers.js','./features/brand/fiezel-choreography.js','./features/audio/fiezel-ui-sfx.js','./features/personal-journey/fiezel-personal-journey.js','./features/skills-evidence/fiezel-skills-evidence.js','./features/academic-readiness/fiezel-academic-readiness.js','./features/continuity/fiezel-continuity.js','./features/learner-flow/learner-flow.css','./features/learner-flow/home-polish.css','./features/ui/fiezel-lux.css','./fiezel-2.css','./features/ui/fiezel-student-mode.js','./features/learner-flow/fiezel-review-bank.js','./features/learner-flow/fiezel-progress-backup.js','./features/learner-flow/fiezel-duel.js','./features/learner-flow/fiezel-learner-flow.js','./features/tutor-action-center/fiezel-tutor-action-center.js','./features/teacher/fiezel-teacher-icons.js','./features/teacher/fiezel-teacher-store.js','./features/teacher/fiezel-teacher-shell.js','./features/class-hub/fiezel-braincore-review.js','./features/class-hub/fiezel-class-hub.js','./features/class-hub/class-hub.css','./features/teacher/teacher-shell.css','./features/health/fiezel-install-health.js',
  // Splash v4 (m025-177 / OA-9): tiga modul lapisan splash baru - partikel canvas,
  // equalizer emas, dan cap PAW - dimuat <script defer> oleh index.html SEBELUM
  // orkestrator fiezel-splash.js, jadi ketiganya berkas shell dan wajib precache
  // (splash offline tanpa salah satu lapisan = boot pincang tanpa suara kesalahan apa pun).
  './features/brand/fiezel-splash-particles.js','./features/brand/fiezel-splash-equalizer.js','./features/brand/fiezel-splash-pawstamp.js',
  './features/brand/fiezel-splash.js','./features/onboarding/fiezel-onboarding.js','./features/onboarding/fiezel-tour.js','./assets/brand/fiezel-wordmark.svg','./assets/brand/fiezel-paw.svg','./assets/brand/fiezel-wordmark-mono.svg','./assets/brand/fiezel-icon-512.png','./assets/brand/fiezel-icon-192.png','./assets/brand/fiezel-icon.svg','./assets/fonts/InstrumentSerif-400.woff2','./assets/fonts/PlusJakartaSans-400.woff2','./assets/fonts/PlusJakartaSans-500.woff2','./assets/fonts/PlusJakartaSans-600.woff2','./assets/fonts/PlusJakartaSans-700.woff2',
  './features/tutor-classroom/fiezel-tutor-dialog.js','./features/tutor-classroom/fiezel-tutor-voice-chat.js','./features/library/fiezel-library.js','./features/library/fiezel-library-ui.js','./features/library/library-books-v1.json','./features/brain/fiezel-tutor-brain.js',
  // Braincore v3: sembilan modul penalaran baru ikut precache shell - PWA ini offline-first,
  // dan modul brain yang tidak ter-cache berarti murid offline kehilangan lapisan adaptifnya
  // secara diam-diam padahal berkasnya kecil dan murni fungsi.
  './features/brain/fiezel-misconception-ledger.js','./features/brain/fiezel-item-prior.js','./features/brain/fiezel-evidence-credibility.js','./features/brain/fiezel-mastery-bkt.js','./features/brain/fiezel-olm.js','./features/brain/fiezel-affect.js','./features/brain/fiezel-confusion-matrix.js','./features/brain/fiezel-step-tutor.js','./features/brain/fiezel-production-grader.js',
  // Fase 2 (B3 butir 8): modul listening adaptif + bank cloze (B6/B7). Ikut precache karena
  // dipakai kebijakan sesi offline. Ingat: cache.addAll gagal total bila salah satu 404,
  // jadi entri ini baru boleh mendarat ketika berkasnya ada di repo - dan keduanya sudah ada.
  // (Catatan alat: pwa-cache-test membaca array ini dengan regex yang berhenti di titik koma
  // pertama - jangan menaruh titik koma di dalam komentar array ini.)
  './features/brain/fiezel-listening-adaptive.js','./cloze-bank-v1.json',
  // Fase 3 (Wiring C5): tiga modul gelombang C - kalibrasi item (C1), speaking adaptif (C2),
  // SRL coach (C4). Aturan yang sama dengan modul brain lain: masuk precache HANYA setelah
  // berkasnya ada di repo, karena cache.addAll gagal total bila satu saja 404. Berkas-berkas
  // ini dijanjikan kontrak Fase 3 dan wajib mendarat bersama rilis ini.
  './features/brain/fiezel-item-calibration.js','./features/brain/fiezel-speaking-adaptive.js','./features/brain/fiezel-srl-coach.js',
  // Wave 1 i18n (AI-02 / AI-13 F02): runtime i18n + copy-map Indonesia ikut shell - PWA ini
  // offline-first dan copy-map yang tidak ter-precache berarti murid id offline kehilangan
  // seluruh naskah antarmukanya. Daftar domain copy-id di bawah adalah daftar FINAL Wave 2
  // (W2-INT merekonsiliasi nama provisional lama copy-id-login/home/dst yang tidak pernah
  // dibuat — handoff W2-APP-B §2 / W2-FEAT-B §1, koordinasi impl/handoff/W1-SW.md) dan
  // setiap path sudah diverifikasi ada di disk oleh skrip W2-INT. Aturan lama tetap
  // berlaku keras di sini: cache.addAll gagal total bila satu saja 404, jadi gelombang ini
  // baru boleh dirilis setelah SEMUA berkas ini benar-benar ada di repo. Aset Thai
  // (copy-th-*, grammar-explanations-th, font Thai) SENGAJA tidak di sini - lihat
  // LOCALE_TH_CACHE di bawah. (Catatan alat yang sama dengan blok lain: jangan menaruh
  // titik koma di dalam komentar array ini - pwa-cache-test memotong daftar di situ.)
  './features/i18n/fiezel-i18n.js','./features/i18n/copy-id-core.js','./features/i18n/copy-id-app-a.js','./features/i18n/copy-id-app-b.js','./features/i18n/copy-id-app-c.js','./features/i18n/copy-id-app-d.js','./features/i18n/copy-id-feat-a.js','./features/i18n/copy-id-feat-b.js','./features/i18n/copy-id-gems.js','./features/i18n/copy-id-quota.js','./features/i18n/copy-id-settings-locale.js','./features/i18n/copy-id-redesign.js','./features/i18n/copy-id-student.js',
  // W4-QA (handoff W4-MERGE butir 3): loader th dimuat SEMUA locale dari index.html (guard
  // locale ada DI DALAM berkasnya, ia baru bertindak saat getLocale()==='th') — jadi ia
  // bagian shell dan wajib precache, BUKAN anggota isLocaleThAsset. Tanpa entri ini murid
  // offline yang beralih ke th kehilangan satu-satunya pemuat aset th-nya.
  './features/i18n/fiezel-th-loader.js',
  // brain-learning-infra: lima modul infrastruktur belajar + lane telemetri (config, events,
  // queue, transport). Aturan sama dengan modul brain lain - masuk precache HANYA setelah
  // berkasnya ada di repo, karena cache.addAll gagal total bila satu saja 404, dan
  // kesembilan berkas ini sudah ada. (Ingat: tanpa titik-koma di komentar blok ASSETS.)
  './features/brain/fiezel-stat-gate.js','./features/brain/fiezel-brain-manifest.js','./features/brain/fiezel-brain-config.js','./features/brain/fiezel-learning-metrics.js','./features/brain/fiezel-metrics-digest.js','./features/brain/fiezel-retention-probe.js','./features/brain/fiezel-attempt-record.js','./features/brain/fiezel-policy-verdict.js',
  './features/telemetry/fiezel-telemetry-config.js','./features/telemetry/fiezel-learning-events.js','./features/telemetry/fiezel-learning-queue.js','./features/telemetry/fiezel-learning-transport.js','./features/telemetry/fiezel-braincore-evidence.js',
  './features/neural-voice/fiezel-cf-tts-transport.js','./features/neural-voice/fiezel-cf-voice-notice.js','./features/quota/quota-copy.js',
  // FASE 11: jembatan bicara→maskot ikut precache - ia anggota grup malas 'voice',
  // dan boot-order-test menagih setiap berkas malas ada di ASSETS agar offline utuh.
  './features/neural-voice/fiezel-speech-bridge.js',
  // [ADAPTASI] OA-7 / gelombang SFX m025-177: 27 sampel OGG pustaka bunyi FIEZEL ikut
  // precache shell - PWA offline-first, dan total ~370 KB lebih kecil dari satu foto: murid
  // offline yang jawabannya benar tetap berhak mendengarnya. (Catatan: jangan menulis
  // titik-koma di komentar blok ASSETS - pwa-cache-test memotong daftar di situ.)
  // Termasuk aset RESERVED/RETIRED
  // (splash_paw_appear, stamp_thud) supaya cache dan direktori tidak pernah berbeda isi.
  './assets/audio/sfx/answer_correct.ogg','./assets/audio/sfx/answer_correct_perfect.ogg','./assets/audio/sfx/answer_wrong.ogg','./assets/audio/sfx/answer_wrong_retry.ogg','./assets/audio/sfx/button_tap.ogg','./assets/audio/sfx/error_system.ogg','./assets/audio/sfx/exam_complete.ogg','./assets/audio/sfx/exam_pass.ogg','./assets/audio/sfx/exam_result_reveal.ogg','./assets/audio/sfx/exam_score_tick.ogg','./assets/audio/sfx/lesson_complete.ogg','./assets/audio/sfx/lesson_start.ogg','./assets/audio/sfx/level_up.ogg','./assets/audio/sfx/notif_achievement.ogg','./assets/audio/sfx/notif_general.ogg','./assets/audio/sfx/notif_streak_reminder.ogg','./assets/audio/sfx/page_transition.ogg','./assets/audio/sfx/paw_appear.ogg','./assets/audio/sfx/paw_celebrate.ogg','./assets/audio/sfx/paw_encourage.ogg','./assets/audio/sfx/paw_greet.ogg','./assets/audio/sfx/splash_intro.ogg','./assets/audio/sfx/splash_paw_appear.ogg','./assets/audio/sfx/stamp_thud.ogg','./assets/audio/sfx/streak_5.ogg','./assets/audio/sfx/streak_10.ogg','./assets/audio/sfx/xp_gain.ogg'];
// Fallback MP3 (OI-1): Safari/iOS tidak bisa mendekode Ogg Vorbis, jadi ke-27 bunyi
// dikirim kembar .mp3 di assets/audio/sfx/ dan fiezel-ui-sfx.js memilih ekstensinya
// lewat canPlayType. Kembaran MP3 itu SENGAJA TIDAK masuk ASSETS di atas: konvensi repo
// (audio-asset-pipeline-test) melarang berkas .mp3 apa pun di precache shell supaya
// shell tidak menggemuk di tiap kenaikan SW_REV. MP3 sfx diambil malas (lazy) saat
// pertama diputar dan mendarat di cache runtime stabil lewat cabang terakhir fetch
// handler - murid iOS yang pernah mendengar sebuah bunyi tetap memilikinya luring.
// Konsekuensi yang diterima: mp3 di cache runtime tidak ikut invalidasi rilis, jadi
// kalau sebuah sampel dirender ulang, klien iOS lama memutar render lama sampai cache
// runtime-nya dibersihkan. Dicatat sebagai keterbatasan yang disadari, bukan bug.
// m025-142 (B-11): pencocok ini SEMPAT dimatikan jadi `()=>false` dengan alasan "model lokal
// sudah dihapus". Modelnya tidak dihapus - vendor/supertonic-3 masih 152 MB dan masih disajikan
// dari origin yang sama. Selama pencocoknya mati, setiap permintaan ke berkas itu jatuh ke
// cabang terakhir fetch handler dan DITULIS diam-diam ke cache runtime: kontraknya opt-in, tetapi
// perilakunya otomatis, dan kuota perangkat murid habis tanpa ia pernah menyalakan suara neural.
//
// Batasnya sengaja satu direktori, bukan daftar ekstensi: seluruh runtime dan model besar hidup
// di bawah vendor/, tidak ada satu pun entri vendor/ di ASSETS, dan lapisan neural punya cache
// sendiri yang ia isi saat murid benar-benar meminta. Daftar ekstensi akan meleset begitu ada
// berkas model baru dengan akhiran lain.
const isNeuralAsset=request=>{
  if(!request?.url)return false;
  try{return new URL(request.url).pathname.includes('/vendor/')}catch{return false}
};
// Wave 1 i18n (AI-13 F06): lapisan cache per-locale Thai, meniru pola neural-prepare yang
// sudah terbukti di SW ini. SW TIDAK pernah mengunduh isi cache ini saat install - halaman
// (runtime i18n) yang mengisinya on-demand saat murid memilih th, dengan membaca daftar
// asetnya dari features/i18n/locale-assets-th.json. Dengan begitu murid Indonesia tidak
// pernah mengunduh maupun menyimpan satu byte Thai pun (AI-13 F05), dan aset Thai tidak
// pernah mendarat diam-diam di cache runtime stabil yang bebas invalidasi (AI-13 F04).
// Nama cache stabil ber-versi KONTEN: angka v-nya naik hanya ketika kontrak isi locale th
// berubah (bukan tiap rilis shell) - activate di bawah membersihkan generasi basi.
const LOCALE_TH_CACHE='fiezel-locale-th-v1';
// Pencocok aset locale th. WAJIB sejalan dengan isi features/i18n/locale-assets-th.json
// (koordinasi path lintas gelombang: impl/handoff/W1-SW.md). Sengaja berbasis pola path,
// bukan daftar literal, supaya Wave 3 bisa menambah domain copy-th baru cukup lewat
// manifest tanpa menyunting SW - pola yang sama dengan pencocok vendor/ di atas.
const isLocaleThAsset=request=>{
  if(!request?.url)return false;
  try{
    const p=new URL(request.url).pathname;
    // W4-QA (handoff impl/handoff/W4-MERGE.md): regex dataset diperluas grammar→
    // (grammar|vocabulary) supaya /vocabulary-th.json root ikut tercakup — tanpa ini murid
    // th offline kehilangan arti kosakata (temuan W4-MERGE §3 butir 2). CATATAN: bentuk
    // persis usulan handoff (`(?:grammar|vocabulary)-[a-z0-9-]*-th`) TIDAK cocok dengan
    // /vocabulary-th.json — ia menuntut segmen ekstra di antara nama dan -th — jadi segmen
    // tengahnya dibuat opsional per-kata: (?:-[a-z0-9]+)*?-th (diverifikasi replika matcher
    // atas 17 entri manifest locale-assets-th.json, semua tercakup). naskah-th-brain.js
    // (tabel naskah Thai modul brain, W3-BRAIN-TH) juga belum cocok pola mana pun, jadi
    // ditambah pencocok prefix naskah-th- — pola prefix, bukan nama literal, mengikuti
    // konvensi copy-th- di atasnya agar berkas naskah th berikutnya otomatis tercakup.
    // m025-230: sidecar BANK SOAL th (speaking/listening/writing/reading-exam/misconception/
    // cloze/reading-bank) tidak pernah cocok pola mana pun di atas — pola dataset menuntut
    // nama diawali grammar|vocabulary. Empat di antaranya SUDAH terdaftar di manifest sejak
    // W3 tetapi tidak pernah tercakup matcher, jadi murid th offline kehilangan seluruh bank
    // soalnya diam-diam. Ditutup dengan pola direktori + sufiks (bukan daftar literal),
    // mengikuti konvensi copy-th-/naskah-th- di atas supaya sidecar bank berikutnya otomatis
    // ikut tercakup.
    return /\/features\/i18n\/[a-z0-9-]+-th\.json$/.test(p)
      ||p.includes('/features/i18n/copy-th-')
      ||p.includes('/features/i18n/naskah-th-')
      ||/\/(?:grammar|vocabulary)(?:-[a-z0-9]+)*?-th\.(?:js|json)$/.test(p)
      ||p.includes('/assets/fonts/NotoSansThaiLooped');
  }catch{return false}
};
const shellScope=String(self.registration?.scope||`${self.location.origin}/`);
const shellUrls=new Set(ASSETS.map(asset=>new URL(asset,shellScope).href));
const isShellRequest=request=>request?.mode==='navigate'||shellUrls.has(new URL(request.url).href);

// m025-83 OWNER: "puter jangan dialihkan ke web lagi, itu sangat mengganggu". This USED to
// be engine-aware: Chromium got strict COOP:same-origin (crossOriginIsolated=true, so the
// neural voice WASM runtime could run multi-threaded), WebKit got same-origin-allow-popups
// (preserving the Puter sign-in popup's window.opener channel). The theory was that Chromium
// had an "isolation-capable" Puter auth path that didn't need the opener - it doesn't. Strict
// COOP:same-origin severs window.opener for ANY cross-origin popup regardless of engine, so
// on Chromium (the majority of installs) the Puter sign-in popup could never message its
// result back to the app and fell through to a full top-level navigation instead - exactly
// the "redirected to the web" escape the owner is reporting. Login now wins over the
// multi-thread optimization: every engine gets same-origin-allow-popups on navigation, so
// the popup's opener channel survives and sign-in can complete without leaving the app.
// This is a safe trade, not a regression risk: fiezel-neural-voice-bootstrap.js already
// treats crossOriginIsolated as optional (`numThreads=1`/`wasmPolicy='single-thread'` when
// it's false) because WebKit has run without it since m025-79 - Chromium now takes the same
// already-proven fallback path instead of a new, untested one. COEP stays credentialless,
// and third-party Puter traffic is never reconstructed by this SW.
const COEP_POLICY='credentialless';
function openerPolicyFor(request){return request?.mode==='navigate'?'same-origin-allow-popups':'same-origin'}
function withCoopCoep(response,request){
  if(!response)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy',openerPolicyFor(request));
  headers.set('Cross-Origin-Embedder-Policy',COEP_POLICY);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

const shellRequests=()=>ASSETS.map(asset=>new Request(asset,{cache:'reload'}));
// Do not skipWaiting here. A new release is allowed to activate only after clients
// using the previous worker are gone, preventing a controller-generation swap in
// the middle of a live installed-PWA document.
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL_CACHE).then(c=>c.addAll(shellRequests()))));
// Because activation is no longer forced over live old clients, stale dedicated
// shell caches can be removed here. The stable neural/runtime CACHE is preserved.
// D16 (D7 T-5): activate membersihkan cache fiezel-v* basi yang bukan revisi aktif,
// dengan DUA pengecualian keras: (1) CACHE aktif tidak pernah disentuh; (2) cache basi
// yang masih menyimpan bita model neural (path /vendor/) DIPERTAHANKAN - model 152 MB
// itu mahal diunduh ulang dan siklus hidupnya milik lapisan neural, bukan SW ini.
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(async k=>{
  if(k.startsWith('fiezel-shell-')&&k!==SHELL_CACHE)return caches.delete(k);
  // Wave 1 i18n: generasi cache locale th yang basi ikut dibersihkan di sini - kalau kontrak
  // konten th naik (v1 -> v2), byte generasi lama tidak boleh menumpuk di kuota perangkat
  // (tekanan kuota iOS, AI-13 F07). Awalannya sengaja spesifik 'fiezel-locale-th-' supaya
  // cache stabil lain (fiezel-v*, fiezel-r2-audio-v1, dst) tidak pernah tersentuh aturan ini.
  if(k.startsWith('fiezel-locale-th-')&&k!==LOCALE_TH_CACHE)return caches.delete(k);
  if(k.startsWith('fiezel-v')&&k!==CACHE){
    try{
      const stale=await caches.open(k);
      const entries=await stale.keys();
      const holdsNeural=entries.some(req=>{try{return new URL(req.url||req).pathname.includes('/vendor/')}catch{return false}});
      if(!holdsNeural)return caches.delete(k);
    }catch{}
  }
})))));
/* Halaman luring yang DISINTESIS, bukan diambil dari cache.
   Disengaja: kalau ia berupa berkas ter-precache, ia akan hilang persis pada satu-satunya
   keadaan yang membutuhkannya (cache kosong). Naskahnya Indonesia karena murid FIEZEL
   membacanya dalam keadaan paling bingung - luring, layar asing, tidak ada yang jalan.
   Tanpa skrip, tanpa aset luar, tanpa font: ia harus bisa tampil ketika tidak ada apa pun
   yang bisa diambil. */
function halamanLuring(){
  const html='<!doctype html><html lang="id"><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>FIEZEL - sedang luring</title>'
    +'<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
    +'background:#0f1729;color:#e8eefc;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}'
    +'.k{max-width:32rem;text-align:center}h1{font-size:1.35rem;margin:0 0 .6rem}p{margin:0 0 1rem;color:#b7c4de}'
    +'button{min-height:44px;min-width:44px;padding:12px 22px;border:0;border-radius:12px;'
    +'background:#5b8cff;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}</style>'
    +'<div class="k"><h1>Kamu sedang luring</h1>'
    +'<p>FIEZEL belum sempat menyimpan pelajaranmu di perangkat ini, jadi belum ada yang bisa '
    +'dibuka tanpa internet. Sambungkan internet sebentar saja - sesudah itu FIEZEL bisa '
    +'dipakai penuh walau jaringannya putus.</p>'
    +'<button onclick="location.reload()">Coba lagi</button></div></html>';
  return new Response(html,{status:503,statusText:'Offline',headers:new Headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'})});
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const requestUrl=new URL(e.request.url);
  if(requestUrl.pathname.toLowerCase().endsWith('/version.json')){e.respondWith(fetch(e.request).then(r=>r&&r.ok?r:caches.match(e.request,{cacheName:SHELL_CACHE})).catch(()=>caches.match(e.request,{cacheName:SHELL_CACHE})));return}
  // m025-150 indeks audio TIDAK boleh cache-first.
  //
  // Batch aset mendarat di antara rilis, sedangkan SHELL_CACHE hanya berganti saat SW_REV
  // naik. Kalau manifest ikut aturan shell, setiap perangkat yang sudah terpasang akan terus
  // membaca indeks lama - dan setiap kalimat yang baru dibayar ke ElevenLabs terbaca ABSENT
  // sampai ada rilis yang sama sekali tidak berhubungan. Jaringan didahulukan, salinan shell
  // tetap jadi jaring pengaman luring. Polanya sama persis dengan version.json di atas.
  if(requestUrl.pathname.toLowerCase().endsWith('/audio/manifest.json')){e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(e.request,copy));return r}return caches.match(e.request,{cacheName:SHELL_CACHE}).then(c=>c||r)}).catch(()=>caches.match(e.request,{cacheName:SHELL_CACHE})));return}
  // Wave 1 i18n: manifest aset locale th mengikuti pola version.json / audio/manifest.json -
  // jaringan dulu, salinan di cache locale jadi jaring pengaman luring. Ia SENGAJA tidak masuk
  // ASSETS: daftar aset th akan bertambah antar-gelombang konten, dan memversikannya bersama
  // shell berarti tiap perubahan daftar th memaksa SEMUA murid (termasuk Indonesia) mengunduh
  // ulang cangkang ±9,7 MB (AI-13 F03) - persis yang lapisan ini hindari.
  if(requestUrl.pathname.toLowerCase().endsWith('/features/i18n/locale-assets-th.json')){e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(LOCALE_TH_CACHE).then(cache=>cache.put(e.request,copy));return r}return caches.match(e.request,{cacheName:LOCALE_TH_CACHE}).then(c=>c||r)}).catch(()=>caches.match(e.request,{cacheName:LOCALE_TH_CACHE})));return}
  if(requestUrl.origin!==self.location.origin){
    // Third-party SDK/API traffic is deliberately left to the browser. The
    // document uses COEP: credentialless, so no-cors resources such as Puter.js
    // can load without the service worker reconstructing or proxying opaque bodies.
    return;
  }
  let responsePromise;
  /* ============ m025-211: NAVIGASI DILAYANI CANGKANG DULU, JARINGAN MENYUSUL ============
    Laporan OWNER sesudah m025-206: "aman tapi sedikit lambat."

    Ia benar, dan sebabnya terukur. Bentuk sebelumnya mengambil dokumen dari JARINGAN lebih
    dulu (dengan anggaran 2,5 detik), padahal salinan yang sempurna sudah ada di perangkat.
    Jadi setiap peluncuran membayar satu perjalanan jaringan penuh sebelum satu piksel pun
    tercat. Diukur dengan 181 berkas cangkang sudah tersimpan:

      jaringan sehat ......... FCP    60 ms
      jaringan lambat ........ FCP   752 ms
      jaringan menggantung ... FCP  2556 ms   (habis anggaran, baru cangkang disajikan)

    Tetapi kecepatan bukan alasan utama perubahan ini. Alasan utamanya KOHERENSI, dan ia
    cacat yang lebih serius daripada lambat.

    SELURUH aset cangkang non-navigasi dilayani cache-first di dalam generasinya
    (`isShellRequest` di bawah). Hanya DOKUMEN yang diambil dari jaringan. Akibatnya, begitu
    build baru terbit sementara SW lama masih aktif - dan ia memang masih aktif, karena
    berkas ini sengaja tidak pernah memanggil skipWaiting() - murid menerima
    `index.html` build N+1 yang dijalankan di atas JavaScript build N.

    Terukur, bukan dugaan: dengan SW_REV tidak berubah, dokumen membawa penanda terbitan baru
    sementara `core-config.js` masih membawa penanda terbitan lama. TIDAK SEPADAN. Itu persis
    cangkang tak sepadan yang cabang ini justru dimaksudkan mencegah.

    Karena itu dokumen kini dilayani dari SHELL_CACHE, sama seperti setiap aset lain. Nama
    cache-nya berkunci SW_REV dan `activate` menghapus generasi lain, jadi cangkang yang
    ditemukan di sini DIJAMIN segenerasi dengan SW yang melayaninya - dokumen dan aset tidak
    lagi bisa berselisih generasi.

    Jaringan tidak ditinggalkan, ia hanya pindah ke belakang: setiap peluncuran tetap
    mengambil dokumen segar lewat waitUntil dan menimpanya ke cache generasi ini, jadi
    dokumen yang rusak atau usang tersembuhkan pada peluncuran berikutnya. Yang hilang hanya
    penyembuhan pada peluncuran yang SAMA - dan itu jalur yang nyaris mustahil dimasuki
    (`cache.put` hanya menulis respons `ok`, `addAll` menolak yang tidak `ok`), ditukar
    dengan menghapus satu perjalanan jaringan dari SETIAP peluncuran dan satu ketaksepadanan
    generasi yang terbukti nyata.

    BATAS YANG DISENGAJA, sama seperti sebelumnya: perangkat yang BELUM punya cangkang
    (pemasangan pertama, atau cache tergusur tekanan penyimpanan iOS) tetap menunggu
    jaringan. Di sana tidak ada apa pun untuk disajikan, jadi anggaran waktu tidak akan
    menolong - ia hanya akan mengganti menunggu dengan layar kosong.
     ============================================================================== */
  if(e.request.mode==='navigate'){
    /* Entri permintaan ITU SENDIRI lebih dulu, `./index.html` hanya sebagai cadangan rute
       tak dikenal. Bentuk pertama perbaikan ini menyajikan `./index.html` untuk SETIAP
       navigasi - dan itu akan membuat `creator-report-dashboard.html` dan
       `creator-report-setup.html` (keduanya ada di ASSETS, keduanya halaman sungguhan)
       tidak pernah bisa dibuka lagi. Membaca kunci yang sama dengan yang ditulis juga
       membuat revalidasi latar benar-benar menyegarkan yang disajikan, bukan kunci lain
       yang tidak pernah dibaca. */
    const cangkang=()=>caches.match(e.request,{cacheName:SHELL_CACHE})
      .then(c=>c||caches.match('./index.html',{cacheName:SHELL_CACHE}));
    const segarkan=fetch(new Request(e.request,{cache:'reload'})).then(r=>{
      if(r&&r.ok){
        const copy=r.clone();
        caches.open(SHELL_CACHE).then(cache=>cache.put(e.request,copy));
      }
      return r;
    });
    try{e.waitUntil(segarkan.catch(()=>{}))}catch(_){}
    /* JARING PENGAMAN LURING (P1 keandalan PWA).
       Sampai sini cangkang selalu menang bila ada. Yang tersisa adalah satu batas yang
       sebelumnya dijawab dengan penolakan mentah: LURING dan BELUM punya cangkang sama
       sekali (pemasangan pertama, atau cache tergusur tekanan penyimpanan iOS). Di sana
       murid mendapat halaman galat peramban - layar putih berbahasa Inggris tanpa satu
       petunjuk pun.
       Keberatan asli terhadap "fallback" tetap dihormati dan TIDAK dilanggar: yang dulu
       dilarang adalah menyajikan CANGKANG KOSONG, karena itu menghasilkan layar kosong
       permanen yang tidak bisa dibedakan dari aplikasi rusak. Halaman di bawah bukan
       cangkang: ia disintesis di dalam service worker (tidak butuh satu byte pun dari
       cache, jadi ia tetap ada justru pada kasus cache kosong), mengaku apa adanya, dan
       tidak berpura-pura menjadi aplikasi. Statusnya 503 supaya peramban maupun alat ukur
       tidak salah menghitungnya sebagai halaman yang berhasil dimuat. */
    responsePromise=cangkang().then(c=>c||segarkan).catch(()=>halamanLuring());
  }else if(isNeuralAsset(e.request)){
    // Neural runtime/model/voice assets are owned by the neural prepare layer and
    // stay in the stable runtime cache. A shell release never precaches/rewrites them.
    responsePromise=caches.match(e.request,{cacheName:CACHE}).then(c=>c||fetch(e.request));
  }else if(isLocaleThAsset(e.request)){
    // Aset locale th dimiliki lapisan locale (diisi halaman on-demand) dan dilayani cache-first
    // dari cache locale-nya, jatuh ke jaringan bila belum terisi. Seperti cabang neural di atas,
    // SW sengaja TIDAK menulis apa pun di sini: pengisian adalah keputusan halaman (opt-in murid
    // th), dan tanpa cabang ini aset th akan jatuh ke cabang terakhir lalu menetap selamanya di
    // cache runtime stabil yang bebas invalidasi rilis (AI-13 F04 - konten pedagogi basi).
    responsePromise=caches.match(e.request,{cacheName:LOCALE_TH_CACHE}).then(c=>c||fetch(e.request));
  }else if(isShellRequest(e.request)){
    // Non-navigation shell assets remain cache-first within this exact generation.
    // Missing shell bytes are refetched into this generation, never borrowed from
    // legacy shell entries that still happen to exist in the stable runtime cache.
    responsePromise=caches.match(e.request,{cacheName:SHELL_CACHE}).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(e.request,copy))}return r}));
  }else{
    responsePromise=caches.match(e.request,{cacheName:CACHE}).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok&&!isNeuralAsset(e.request)){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy))}return r}));
  }
  e.respondWith(responsePromise.then(r=>r&&(e.request.mode==='navigate'||/\.(?:m?js)$/i.test(requestUrl.pathname))?withCoopCoep(r,e.request):r));
});

self.addEventListener('periodicsync',e=>{if(e.tag==='fiezel-update-check')e.waitUntil(self.registration.update().catch(()=>{}))});

// m025-103: jendela yang sudah terbuka DIARAHKAN, bukan sekadar difokuskan.
// Sebelumnya tab yang sudah ada selalu menang, jadi notifikasi masukan pengguna yang
// menunjuk ke dasbor kreator hanya memunculkan aplikasi belajar - kabar sampai, tetapi
// tujuannya tidak. Untuk pengingat belajar url-nya './' sehingga perilakunya tidak
// berubah; navigate() juga tidak selalu tersedia, jadi fokus tetap jadi cadangan.
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if(typeof client.navigate==='function'&&url&&url!=='./'){return client.navigate(url).then(c=>(c&&c.focus?c.focus():client.focus())).catch(()=>client.focus())}if('focus'in client)return client.focus()}return clients.openWindow?clients.openWindow(url):undefined}))});

self.addEventListener('push',event=>{
  // m025-117: service worker tidak punya akses ke state murid, jadi teks cadangan di sini
  // TIDAK boleh menyebut nama siapa pun. Sapaan bernama datang dari payload push yang
  // memang membawanya; cadangan ini hanya berlaku saat payload-nya kosong atau rusak.
  let payload={title:'FIEZEL · Reminder belajar',body:'Waktunya kembali ke sesi belajar.',url:'./',tag:'fiezel-remote'};
  try{
    if(event.data){
      const parsed=event.data.json();
      if(parsed&&typeof parsed==='object')payload={...payload,...parsed};
    }
  }catch{
    try{payload.body=event.data?.text?.()||payload.body}catch{}
  }
  const options={body:String(payload.body||'').slice(0,280),tag:String(payload.tag||'fiezel-remote').slice(0,64),renotify:false,icon:'./apple-touch-icon.png',badge:'./favicon-64.png',data:{url:payload.url||'./'}};
  event.waitUntil(self.registration.showNotification(String(payload.title||'FIEZEL').slice(0,80),options));
});

/* ===== m025-235: UNDUHAN SUARA NEURAL YANG TIDAK IKUT MATI SAAT APLIKASI DITUTUP =====
   OWNER meminta suara neural terunduh di latar dan TETAP LANJUT walau murid menutup FIEZEL.
   Satu-satunya API web yang benar-benar bisa itu adalah Background Fetch: peramban sendiri
   yang memegang unduhannya, jadi ia berjalan tanpa satu pun dokumen hidup. Pengunduh potongan
   20 MB di features/neural-voice/fiezel-voice-offline-autoload.js tidak bisa - ia kode
   halaman, jadi ia berhenti begitu halaman ditutup dan baru melanjutkan dari potongan
   terakhir pada sesi berikutnya.

   Background Fetch HANYA ada di Chromium (Android + Chrome/Edge desktop). WebKit/iOS tidak
   memilikinya, dan murid FIEZEL banyak memakai iPhone, jadi jalur potongan 20 MB TIDAK
   digantikan apa pun di sini - di sana ia tetap satu-satunya jalur. Blok ini murni tambahan
   untuk mesin yang punya API-nya, dan seluruh pendaftarannya berpagar deteksi kemampuan
   supaya Safari tidak pernah menyentuh satu baris pun.

   TIDAK ADA SATU BARIS fetch/install/activate YANG BERUBAH karenanya. Blok ini hanya menulis
   ke cache runtime neural, dan hanya pada satu kejadian: unduhan latar yang SELESAI UTUH.

   KENAPA NAMA CACHE DIBACA DARI id PENDAFTARAN. Ketika 'backgroundfetchsuccess' tiba,
   aplikasinya boleh jadi sudah lama ditutup: tidak ada halaman yang bisa ditanyai, dan modul
   yang memiliki nama cache itu (fiezel-neural-voice-bootstrap.js) adalah kode halaman yang
   tidak bisa - dan tidak boleh - diimpor ke worker. Karena itu halaman menitipkan tujuannya
   pada id pendaftaran, dengan bentuk yang disepakati:

       fiezel-neural-voice::<namaCacheRuntimeNeural>

   MENEBAK nama cache adalah satu-satunya alternatif, dan ia lebih buruk daripada tidak
   melakukan apa-apa: tebakan yang meleset menaruh ratusan MB bita model di cache yang salah -
   kuota murid habis DAN lapisan neural tetap melihat cache-nya kosong. Jadi id yang tidak
   sesuai bentuk diabaikan dengan tenang, tanpa menulis apa pun.

   Bentuk nama yang diterima sengaja satu pola saja: cache runtime neural (fiezel-v...,
   dirakit lapisan neural dari version.js - cache yang sama dengan CACHE di kepala berkas
   ini). Dipakai POLA, bukan perbandingan langsung dengan CACHE, karena unduhan latar bisa
   dimulai di generasi version.js sebelumnya dan bita itu tetap milik lapisan neural (activate
   di atas juga sudah mempertahankan cache basi yang menyimpan bita model). Yang dijaga keras
   oleh pola ini: cangkang (fiezel-shell-...) dan cache locale (fiezel-locale-th-...) tidak
   mungkin cocok, jadi tidak ada id yang bisa membujuk jalur ini menulis ke sana. */
const BGF_NEURAL_PREFIX='fiezel-neural-voice::';
const namaCacheNeuralDariId=id=>{
  const teks=String(id||'');
  if(!teks.startsWith(BGF_NEURAL_PREFIX))return '';
  const nama=teks.slice(BGF_NEURAL_PREFIX.length);
  return /^fiezel-v[0-9][A-Za-z0-9._-]*$/.test(nama)?nama:'';
};
/* SEMUA respons dikumpulkan dulu, baru ditulis. Kalau ada satu saja rekaman yang responsnya
   tidak bisa dibaca atau tidak 'ok', TIDAK ADA yang ditulis sama sekali - alasannya sama
   dengan cabang gagal/batal di bawah: lapisan neural membaca kehadiran entri cache sebagai
   "aset ini sudah siap", jadi salinan separuh berbohong kepadanya. Mengumpulkan responsReady
   lebih dulu tidak menahan bita di memori: yang siap di situ kepalanya, badannya tetap
   mengalir ke cache saat put(). */
async function salinUnduhanLatarKeCacheNeural(pendaftaran,namaCache){
  const rekaman=await pendaftaran.matchAll();
  if(!rekaman.length)return;
  const siap=await Promise.all(rekaman.map(async r=>({request:r.request,response:await r.responseReady})));
  if(siap.some(x=>!x.response||!x.response.ok))return;
  const cache=await caches.open(namaCache);
  for(const {request,response} of siap)await cache.put(request,response);
}
/* Deteksi kemampuan, bukan asumsi. self.registration bisa tidak ada sama sekali di harness
   uji yang menjalankan berkas ini di sandbox, dan di WebKit BackgroundFetchManager memang
   tidak pernah ada - keduanya harus berakhir sama: pendengar tidak didaftarkan, dan tidak ada
   yang dilempar saat worker dievaluasi. */
const adaBackgroundFetch=(()=>{
  try{
    if(typeof self.BackgroundFetchManager!=='undefined')return true;
    return !!(self.registration&&'backgroundFetch' in self.registration);
  }catch{return false}
})();
if(adaBackgroundFetch){
  try{
    self.addEventListener('backgroundfetchsuccess',event=>{
      const namaCache=namaCacheNeuralDariId(event.registration?.id);
      if(!namaCache)return;
      event.waitUntil(salinUnduhanLatarKeCacheNeural(event.registration,namaCache).catch(()=>{}));
    });
    /* Gagal dan batal SENGAJA tidak menulis apa pun - itu seluruh isi kedua pendengar ini,
       dan mereka ada supaya keputusannya terbaca di tempat orang berikutnya akan mencarinya.
       Unduhan separuh lebih berbahaya daripada tidak ada unduhan: entri cache yang ada dibaca
       lapisan neural sebagai aset siap pakai, dan kebohongan itu baru ketahuan jauh kemudian,
       persis ketika murid menekan tombol bicara. Rekaman unduhan yang gagal dibuang peramban
       sendiri, dan tidak ada satu bita pun yang pernah masuk cache dari jalur ini, jadi tidak
       ada juga yang perlu dibersihkan.

       Tidak ada pencatatan di sini karena sw.js memang tidak punya kanal log: seluruh
       diagnostik suara hidup di localStorage halaman (FiezelVoiceDiagnostics), yang tidak bisa
       disentuh worker, dan kejadian ini justru tiba ketika halamannya tidak ada. Diam di sini
       jujur - ia bukan galat yang ditelan, karena tidak ada keadaan apa pun yang berubah. */
    self.addEventListener('backgroundfetchfail',()=>{});
    self.addEventListener('backgroundfetchabort',()=>{});
    /* Chromium menampilkan notifikasi kemajuan bawaan sistem untuk setiap unduhan latar, dan
       notifikasi itu bisa ditekan. Tanpa pendengar ini, tekanan murid tidak menghasilkan apa
       pun - aplikasi yang punya ikon di layar kunci tetapi tidak bisa dibuka dari situ terasa
       rusak. Bentuknya mengikuti notificationclick di atas: jendela yang sudah ada difokuskan
       lebih dulu, jendela baru hanya kalau memang tidak ada satu pun. */
    self.addEventListener('backgroundfetchclick',event=>{
      event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
        for(const client of list)if('focus' in client)return client.focus();
        return clients.openWindow?clients.openWindow('./'):undefined;
      }).catch(()=>{}));
    });
  }catch(_){}
}
