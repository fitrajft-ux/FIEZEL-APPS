/* FIEZEL Core Brain runtime configuration.
 * workerUrl remains empty in distributable source until an operator-owned Puter Worker is deployed.
 * Never put VAPID private keys, cron tokens, or Puter auth tokens here.
 */
// OWNER MEMBALIK m025-34. Bendera ini dulu bernilai true dan artinya harfiah: tanpa izin
// notifikasi yang benar-benar 'granted', aplikasi tidak bisa dimasuki sama sekali. OWNER
// sekarang menilai pola itu sendiri sebagai kerusakannya: "Ini pola dark-pattern yang
// justru bikin app terasa murahan, bukan premium - Duolingo/Spotify minta izin notifikasi
// setelah onboarding, dengan alasan kontekstual, dan tetap bisa dipakai kalau ditolak."
//
// Bendera dipertahankan (bukan dihapus) dengan nilai false supaya modul mana pun yang
// masih membacanya - features/diagnostics/fiezel-diagnostic-register.js salah satunya -
// membaca keputusan yang benar, bukan `undefined` yang bisa berarti apa saja. Notifikasi
// sekarang DIUNDANG, tidak dipaksa: lihat startNotificationInvitation() di app.js.
self.FIEZEL_REQUIRE_NOTIFICATIONS=false;
// m025-61: penanda build halaman, dipakai health check untuk membandingkan versi yang
// benar-benar dimuat dengan shell yang dipegang service worker. Nilainya dijaga gate agar
// selalu sama dengan DIAG_BUILD; kalau keduanya berbeda, install-health-test gagal.
self.FIEZEL_PAGE_BUILD='m025-268';
// m025-150 profil suara ElevenLabs untuk sisi klien.
//
// Isinya sengaja hanya penanda, BUKAN rahasia apa pun: kunci API ElevenLabs hidup di
// GitHub Actions secret dan tidak pernah menyentuh berkas yang disajikan ke browser
// (mandat V2 pasal 6). Yang ada di sini hanya cukup untuk menghitung audioKey.
//
// voiceId dibiarkan kosong sampai owner memilih suaranya. Selama kosong, resolver menjawab
// setiap permintaan dengan ABSENT dan FIEZEL berbunyi persis seperti sebelum rilis ini -
// keadaan aman yang disengaja, bukan konfigurasi yang lupa diisi. Setelah batch pertama
// berjalan, manifest membawa profil yang sebenarnya dan nilai di sini tinggal jadi cadangan
// selama manifest belum termuat.
self.FIEZEL_AUDIO_CONFIG=Object.freeze({
  voiceId:'',
  modelId:'eleven_multilingual_v2',
  settings:Object.freeze({stability:0.5,similarityBoost:0.75,speed:1})
});
self.FIEZEL_CORE_CONFIG=Object.freeze({
  workerUrl:'https://fiezel-core.puter.work',
  protocolVersion:'1.7',
  aiGateway:'core-only',
  remotePushRequired:true,
  deploymentState:'validated'
});
// ── SAKELAR TRANSPORT CLOUDFLARE (m031-flags, cf-b1 §5.3 + cf-b6 pola P1) ────────────
//
// Worker `fiezel-api` SUDAH hidup (D1+KV, `/health` menjawab `protocol 1.7`, `/api/config`
// menjawab semua flag false), TETAPI alamat tetapnya `api.fiezel.my.id` BELUM aktif
// (menunggu nameserver) dan workers.dev sengaja dimatikan. Jadi yang dipasang di sini
// adalah SAKELARNYA DALAM KEADAAN MATI, bukan jalur yang hidup: `base` kosong dan
// `enabled:false`, sehingga `coreWorkerExec` di app.js tidak pernah menyentuh Cloudflare.
//
// FIELD BARU, BUKAN TIMPAAN. `FIEZEL_CORE_CONFIG.workerUrl` di atas TIDAK disentuh:
// `tests/remote-push-test.js:6` mengunci nilainya ke `^https://[a-z0-9-]+\.puter\.work$`, dan
// mengarahkannya ke domain Cloudflare akan memerahkan gerbang push sekaligus memutus jalur
// pengingat yang hari ini berjalan. Alamat CF hidup HANYA di `base` di bawah.
//
// Tiga status per endpoint (cf-b6 "Pola pagar rilis" P1), bukan boolean:
//   'off'    = kode CF ada di bundel tapi tidak pernah dieksekusi. Jalur Puter hari ini
//              melayani semuanya, tanpa satu pun fetch tambahan. Nol dampak murid.
//   'shadow' = jawaban yang DIPAKAI murid tetap dari Puter; salinan permintaan dikirim ke
//              CF dengan penanda dry-run, hasilnya DIBUANG dan hanya dibandingkan di konsol
//              diagnostik. Tidak pernah ditampilkan, tidak pernah menggandakan efek samping.
//   'on'     = CF menyajikan jawaban (dengan `credentials:'include'`).
//
// ROLLBACK SATU NILAI: `enabled:false` mematikan SELURUH jalur CF walau setiap endpoint
// bernilai 'on'. Itu satu-satunya sakelar yang perlu diingat saat insiden di sisi klien.
//
// TAPI SAKELAR STATIS INI BUKAN KILL SWITCH SESUNGGUHNYA. Berkas ini ikut di-precache
// service worker (`sw.js:35`, daftar ASSETS) dan dilayani cache-first, jadi mengubah
// nilainya TIDAK menjangkau PWA yang sudah terpasang sampai `SW_REV` naik dan generasi
// shell baru terpasang. Kill switch yang nyata ada di SERVER: `GET /api/config` pada Worker
// CF (KV `cfg:flags`), dibaca sekali per boot dengan timeout pendek dan default = nilai
// statis di bawah kalau gagal. Flag statis ini lapis KEDUA, bukan yang pertama.
//
// Tidak ada rahasia di blok ini (syarat `release-audit.py:105,130` untuk core-config.js).
// -- A6 (28 Agu 2026): PENYALAAN BERTAHAP TAHAP 1 - ANALYTICS SAJA --------------------
//
// Sampai commit ini blok di bawah bernilai `enabled:false` + `base:''` + semua endpoint
// 'off'. Akibatnya bukan "analytics belum ramai", melainkan NOL: `cfStaticMode('usage')`
// menjawab 'off', jadi app.js bahkan tidak memasang timer pemancar
// (`if(cfStaticMode('usage')!=='off')anBootSchedule();`), tidak ada satu pun murid yang
// pernah menembak Cloudflare, dan `/api/usage/events` yang SUDAH terbukti hidup di server
// (202 `accepted:1` tanpa cookie sesi, `dau_dedup`/`metrics_daily`/`usage_daily` terisi,
// dashboard owner menampilkan angkanya) tidak pernah menerima satu event pun dari produksi.
// Yang dinyalakan di sini adalah SATU jalur itu, bukan lebih.
//
// `base` = 'https://api.fiezel.my.id': custom domain Worker `fiezel-api` yang sudah aktif
// (zona Cloudflare `active`, p95 `GET /api/config` 97 ms pada 20 sampel). BUKAN workers.dev
// (sengaja dimatikan) dan BUKAN `FIEZEL_CORE_CONFIG.workerUrl` di atas - yang itu tetap
// `*.puter.work` karena `tests/remote-push-test.js:6` mengunci polanya dan jalur pengingat push
// hari ini bergantung padanya.
//
// DUA endpoint 'on', dan HANYA dua. Alasan tiap satu, bukan selera:
//
//   usage:'on'  - WAJIB, ini sakelar analytics itu sendiri. Dua tempat membacanya:
//                 (1) `anGateOpen()` di app.js menuntut `cfStaticMode('usage')==='on'`, dan
//                     `if(cfStaticMode('usage')!=='off')anBootSchedule()` di ekor blok
//                     pemancar hanya memasang timernya kalau nilai ini bukan 'off';
//                 (2) modul `features/analytics/fiezel-analytics-client.js` menuntut
//                     `endpoints.usage==='on'` sebelum ia mau membuat `installId`, menulis
//                     antrean, atau mengirim apa pun. Tanpa nilai ini seluruh paket
//                     analytics tetap kode mati. Yang dibelanjakannya: tulisan D1 - GRATIS
//                     pada batas pemakaian ini, NOL neuron.
//   config:'on' - WAJIB menurut arbiter rencana repo, `tools/flag-plan-check.mjs` aturan 4
//                 (`KILL_SWITCH_TAK_TERBACA`): endpoint hidup apa pun sementara `config`
//                 mati dinilai DANGER, karena rencana itu berarti "ada jalur CF hidup yang
//                 kill switch server-nya tidak diakui klien". Menyalakannya berbiaya NOL
//                 permintaan tambahan: tidak ada satu pun pemanggil `coreWorkerExec()` yang
//                 memakai path `/api/config` (pengambil kill switch memakai `fetch` langsung
//                 di `cfFetchServerConfig()`), jadi nilai ini pengakuan eksplisit bahwa
//                 jalur `GET /api/config` memang jalur yang kita pakai - dan ia yang membuat
//                 pemanggil masa depan ke path itu tidak diam-diam jatuh ke Puter.
//
// LIMA yang TIDAK dinyalakan, dan kenapa:
//   ai:'off'    - WAJIB tetap mati. `/api/ai/*` di Worker membelanjakan NEURON akun (plafon
//   tts:'off'     10.000/hari untuk SEMUA murid sekaligus) dan `/api/tts/*` memanggil
//                 binding `env.AI` yang sama. Itu keputusan owner terpisah dan BUKAN bagian
//                 paket ini. Selama keduanya 'off', murid tetap memakai Puter untuk suara
//                 dan AI persis seperti hari ini - dan analytics tidak butuh keduanya sama
//                 sekali. Dijaga assert (b) tests/cf-config-killswitch-test.js ATAS BERKAS INI,
//                 bukan atas harness sintetis.
//   quota:'off' - plafon per murid hanya relevan untuk jalur berbiaya (ai/tts). Analytics
//                 tidak menagih apa pun, jadi menyalakannya hanya menambah permukaan.
//   auth:'off'  - analytics privasi-maksimal SENGAJA tidak beridentitas: yang dikirim adalah
//                 `visitor_token = HMAC(pepper_harian, installId)`, dan server memang
//                 menerima `/api/usage/events` TANPA cookie sesi (terbukti 202). Menyalakan
//                 `auth` memindahkan sesi murid ke jalur baru tanpa alasan analytics.
//   health:'off'- `coreBrainHealth()` menembak `CORE_WORKER_URL` (Puter) langsung, bukan
//                 lewat transport CF, jadi nilai ini tidak dibaca siapa pun di jalur ini.
//
// SATU AKIBAT YANG HARUS DIBACA SEBELUM PERCAYA "analytics saja": peta rute di app.js
// (`CF_ENDPOINT_ROUTES`) menyatukan `/api/usage`, `/api/activity`, `/api/feedback`, dan
// `/api/policy` di bawah SATU kunci 'usage'. Jadi `usage:'on'` juga memindahkan empat
// pemanggil `coreWorkerExec` itu ke Cloudflare, sementara SLOT 5 Worker (`route-legacy.js`)
// masih [BELUM] terpasang, jadi keempatnya menjawab 404. Tiga di antaranya jatuh lunak
// (`/api/policy/next` -> kebijakan lokal, `/api/policy/outcome` -> tetap di antrean,
// `/api/activity` -> `false` senyap) dan SATU terlihat murid (`/api/feedback` -> toast
// "Gagal mengirim"). Kopling itu TIDAK bisa dipisahkan dari core-config.js: kunci yang sama
// dibaca `cfStaticMode('usage')` dan `cfEndpointMode()`. Rincian + jalan keluarnya di
// reports/work-a6-client-switch.md; sampai salah satunya dikerjakan, ini biaya yang
// DIKETAHUI, bukan kejutan.
//
// Tidak ada rahasia di blok ini (syarat `release-audit.py:105,130` untuk core-config.js).
self.FIEZEL_CF_CONFIG=Object.freeze({
  enabled:true,
  base:'https://api.fiezel.my.id',
  endpoints:Object.freeze({health:'off',config:'on',auth:'off',quota:'off',ai:'off',tts:'off',usage:'on'})
});
// ── KILL SWITCH SERVER: parameter pengambil `GET /api/config` (m031-killswitch) ────────
//
// Blok di ATAS adalah DEFAULT PEMASANGAN, bukan kill switch: ia ikut precache service
// worker (`sw.js:35`) dan dilayani cache-first, jadi mengubahnya tidak menjangkau PWA yang
// sudah terpasang sampai `SW_REV` naik. Kill switch yang nyata ada di server dan sekarang
// KLIEN benar-benar membacanya: `GET <base>/api/config` (Worker `fiezel-api`,
// `workers/api/route-config.js`, KV `cfg:flags`, `Cache-Control: no-store`).
//
// ATURAN PENGGABUNGAN — AND, BUKAN OR. Flag server hanya bisa MEMATIKAN. Ia TIDAK BISA
// menyalakan apa pun yang di blok atas bernilai 'off'. Alasannya bukan kerapian: satu
// server yang disusupi (atau satu nilai KV salah ketik oleh owner yang sedang panik) tidak
// boleh bisa menyalakan jalur AI/TTS/kuota di perangkat murid. Yang mati di berkas ini
// mati selamanya sampai ada rilis; yang hidup di berkas ini masih bisa dimatikan server
// dalam hitungan menit. Kedua arah itu tidak simetris dengan sengaja.
//
// PROTOKOL: kalau jawaban server bukan `protocol:'1.7'`, SELURUH jalur CF dianggap MATI —
// bukan diteruskan dengan flag yang bentuknya belum tentu kita pahami.
//
// CERMIN: hasilnya disimpan di memori dan di `sessionStorage` (BUKAN localStorage) dengan
// umur maksimum 5 menit, dibatasi keras di klien walau server mengaku ttlSeconds lebih
// panjang. Kill switch harus menjangkau perangkat dalam hitungan menit, bukan hari, dan
// cermin yang hidup lebih lama daripada itu adalah kill switch yang bisa diabaikan murid
// hanya dengan tidak menutup tabnya.
//
// Tidak ada rahasia di blok ini (syarat `release-audit.py:105,130` untuk core-config.js).
// BATAS WAKTU (F6). Angka di bawah bukan selera, ia hasil ukur terhadap jembatan hidup
// `api.fiezel.my.id` pada 28 Agu 2026 (bukti lengkap di reports/fix-f6-client-timeout.md):
//   - `GET /api/config` koneksi baru, 10 sampel: p95 = 1.41 s (handshake TLS 0.48-0.72 s).
//   - koneksi hangat: 0.35-0.47 s. Dari dalam Chromium, boot dingin: 1.16-1.32 s.
//   - `GET /api/quota` terautentikasi, jalur terlambat yang pernah terukur: 1.95 s.
// `timeoutMs:2500` yang lama hanya menyisakan ~1.2 s di atas p95, dan itu terbukti
// membatalkan permintaan yang sehat: dengan jawaban config ditunda, aplikasi memanggil
// `controller.abort()` pada 2898 ms lalu mematikan SELURUH jalur CF sampai sesi berikutnya.
// Anggaran baru 8000 ms dipilih dengan tiga alasan yang bisa diperiksa:
//   1) margin >= 4x p95 terukur (8000 - 1410 = 6590 ms), jadi satu paket hilang plus satu
//      handshake ulang tidak lagi terbaca sebagai "server mati";
//   2) lebih besar daripada `TIMEOUT_FAST_S=6` di deploy/edge/api-index.php, jadi klien
//      hidup lebih lama daripada proksinya sendiri dan MEMBACA 504-nya, bukan membatalkan
//      lebih dulu dan kehilangan diagnosis;
//   3) sama dengan `CLIENT_ABANDON_S=8` yang sudah jadi kontrak hop-by-hop F4.
// Menaikkan angka ini TIDAK menahan boot: `cfConfigBootOnce()` menjadwalkan permintaan lewat
// `requestIdleCallback`/`setTimeout` dan tidak pernah di-await; kegagalan apa pun (termasuk
// batas waktu ini) jatuh ke `cfConfigFailed()` -> semua jalur CF MATI.
// PENGUKURAN ULANG 28 Agu 2026, 14:35 — JEMBATAN PHP TIDAK LAGI DI JALUR PERMINTAAN.
// Nameserver `fiezel.my.id` pindah ke Cloudflare, zona berstatus `active` (07:24 UTC), dan
// `api.fiezel.my.id` kini custom domain Worker. Semua angka di blok di atas diukur terhadap
// jembatan reverse-proxy PHP di cPanel dan SUDAH BASI. Yang terukur pada jalur langsung, 20
// sampel `GET /api/config` lewat edge Cloudflare:
//     min 61 ms | median 70 ms | p95 97 ms | maks 129 ms
// Jadi p95 turun dari 1410 ms ke 97 ms, sekitar 14x.
//
// ANGKA 8000 ms SENGAJA TIDAK DITURUNKAN, dan alasannya perlu dibaca sebelum ada yang
// "merapikannya":
//   1) 97 ms itu diukur dari sandbox di pusat data, bukan dari ponsel murid di jaringan
//      seluler Indonesia. Menurunkan anggaran ke kelipatan angka pusat data berarti memakai
//      pengukuran yang TIDAK mewakili pengguna sebenarnya — persis kesalahan yang membuat
//      `timeoutMs:2500` membatalkan permintaan sehat.
//   2) Biaya anggaran besar di sini mendekati nol: permintaan config TIDAK menahan boot
//      (dijadwalkan lewat requestIdleCallback dan tidak pernah di-await), jadi murid tidak
//      menunggu. Yang ditukar hanya seberapa cepat kita menyerah ke jalur aman.
//   3) Biaya anggaran terlalu kecil justru nyata: murid di jaringan buruk kehilangan seluruh
//      jalur CF untuk sisa sesinya karena satu paket hilang.
// Yang boleh menurunkan angka ini hanyalah pengukuran dari perangkat murid sungguhan
// (jaringan seluler, bukan wifi kantor). Sampai bukti itu ada, 8000 ms tetap.
//
// Satu konsekuensi yang perlu dicatat: alasan (2) dan (3) di blok F6 di atas merujuk
// `TIMEOUT_FAST_S=6` dan `CLIENT_ABANDON_S=8` milik proksi PHP. Proksi itu sekarang jalur
// CADANGAN, bukan jalur utama, jadi kedua pengait itu tidak lagi mengikat — tetapi juga tidak
// bertentangan. Kalau proksi PHP dibongkar nanti, hapus rujukannya, bukan angkanya.
self.FIEZEL_CF_REMOTE=Object.freeze({
  path:'/api/config',
  protocol:'1.7',
  timeoutMs:8000,
  mirrorTtlMs:300000,
  mirrorMinTtlMs:30000,
  mirrorKey:'fiezel-cf-flags-mirror-v1'
});
// Batas waktu per KELAS endpoint untuk transport CF (`cfWorkerFetch` di app.js). Sebelum F6
// jalur ini tidak punya batas waktu SAMA SEKALI: satu jawaban yang tidak pernah datang
// menggantung selamanya di perangkat murid dan yang "menyelamatkan" hanya kesabaran
// pemanggil. Setiap nilai di bawah = latensi p95 terukur + margin yang disebut eksplisit:
//   identity/quota/usage 8000 ms  = p95 1.41 s + 6.59 s margin (alasan sama dengan di atas)
//   ai 30000 ms                   = sama dengan FIEZEL_AI_TIMEOUT_MS di app.js; generasi
//                                   model memang bisa belasan detik, jadi memangkasnya di
//                                   transport berarti membunuh jawaban yang sedang ditulis
//   tts 12000 ms                  = sama dengan RENDER_TIMEOUT_MS di
//                                   features/neural-voice/fiezel-cf-tts-transport.js, yang
//                                   sudah punya jatuh-balik suara peramban
self.FIEZEL_CF_TIMEOUTS=Object.freeze({
  health:8000,
  config:8000,
  auth:8000,
  quota:8000,
  usage:8000,
  ai:30000,
  tts:12000
});
