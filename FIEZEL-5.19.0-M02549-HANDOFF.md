# FIEZEL m025-49 — HANDOFF

**Untuk AI berikutnya. Baca seluruhnya sebelum menyentuh satu baris kode.**

Status: pekerjaan m025-49 **selesai sebagian dan BELUM di-deploy**. Ada di branch
`claude/neural-voice-crackin-delayed-259tmj`, satu commit di atas `main`. Gate lokal hijau
(59 suite). OWNER menghentikan pekerjaan di titik ini dan meminta handoff.

---

## 0. PERINTAH

Kamu melanjutkan pekerjaan suara neural FIEZEL. OWNER (`fitrajft-ux`, satu-satunya MASTER)
sudah mengambil satu keputusan arsitektur yang mengikat:

> **Ganti mesin suara dari on-device (Supertonic WASM) ke Puter cloud TTS.**

Itu keputusan OWNER, bukan usulanmu dan bukan milikmu untuk dibatalkan. Tapi keputusan itu
**membatalkan kebijakan tertulis repo ini** (100% on-device, tanpa cross-origin inference,
jalan offline, tanpa metered billing). Bagian §5 di bawah menjelaskan persis apa yang
harus kamu bereskan agar perubahan itu jujur, bukan diam-diam.

Aturan kerjamu:

1. **Jangan ulangi pekerjaan yang sudah selesai.** §3 dan §4 mendaftarkan apa yang sudah
   ada dan mengapa. Kalau kamu "memperbaiki" lagi hal yang sudah diperbaiki, kamu
   membuang waktu OWNER dan berisiko mengembalikan bug.
2. **Ukur sebelum mengubah.** §2 berisi bukti perangkat nyata. Kalau tebakanmu bertentangan
   dengan angka itu, tebakanmu yang salah.
3. **Jangan merge, jangan deploy.** Lihat §6. Merge ke `main` = deploy langsung ke aplikasi
   yang dipakai seorang anak bernama Jahran. Itu keputusan MASTER, bukan keputusanmu.
4. **Jangan melemahkan test untuk meloloskan perubahanmu.** Kalau sebuah assertion
   menghalangi, pahami dulu properti apa yang dijaganya. Ubah hanya kalau properti itu
   memang sudah tidak berlaku, dan tulis alasannya di test itu sendiri.
5. **Laporkan yang gagal seperti apa adanya.** Kalau satu bagian buntu, kerjakan sisanya
   sampai tuntas lalu katakan dengan jelas mana yang tidak selesai dan kenapa.

---

## 1. MASALAH YANG DILAPORKAN OWNER

Laporan verbatim (2026-08-19, setelah build m025-47 live):

- masuk ke Classroom → **banyak jeda**, **jeda terlalu panjang**
- suara masih **cracking**, tidak jernih/HD
- masih ada **suara pecah seperti radio rusak**
- **penjelasan terlalu pendek dan tanggung menggantung**, siswa jadi bingung
- ketuk tombol suara → **±30 detik** baru bunyi
- minta: sambungkan ke **otak Core Fiezel + Puter** agar AI bisa dipakai untuk penjelasan
- minta: setiap masuk subject baru ada **kata welcome yang berubah-ubah**, tidak repetitif
- minta: kalimat tanya tutor **nadanya naik di akhir**

---

## 2. BUKTI PERANGKAT — JANGAN BEKERJA TANPA MEMBACA INI

Sumber: capture Diagnostics dari perangkat OWNER sendiri.
Safari 26.5, standalone PWA, build m025-47, 2026-08-19T06:48:37Z.

| Berkas | Isi |
|---|---|
| `audit/m025/m02548-device-capture-20260819T0648Z.json` | capture mentah, apa adanya |
| `audit/m025/m02548-device-evidence.json` | hasil analisis terstruktur |

### 2.1 Temuan yang menentukan segalanya

**Mesin butuh 2,03 detik CPU untuk tiap 1 detik suara.**
135,8 detik kerja mesin untuk menghasilkan 67,0 detik audio. Median realtime factor
**2,29**. Benchmark m025-37 yang tertulis di komentar kode (`RTF 0.25`) **diukur pada model
Piper yang sudah pensiun** — angka itu tidak berlaku untuk Supertonic dan menyesatkan
siapa pun yang membacanya. Jangan percaya komentar itu.

Konsekuensi yang tidak bisa dihindari dengan trik apa pun:

- streaming **tidak mungkin mengejar**: merender kalimat berikutnya selalu lebih lama
  daripada memutar kalimat sekarang;
- memecah kalimat lebih kecil **hanya memindahkan senyap**, tidak menghilangkannya;
- total waktu satu ucapan ≈ 2× durasi audionya, apa pun penjadwalannya.

RTF memburuk sepanjang sesi (0,72–1,47 di awal, 2,16–3,30 di akhir). Konsisten dengan
thermal throttling dan/atau dua worker bahasa hidup bersamaan.

### 2.2 Latensi dan lubang senyap yang terukur

| requestId | chunk | detik sampai bunyi pertama | lubang senyap di tengah ucapan |
|---|---|---|---|
| `nv-mszq0g2h-2` | 3 | 3,55 s | — |
| `nv-mszq1c4w-6` | 2 | 3,87 s | — |
| `nv-mszq2vi2-7` | 1 | 11,15 s | — |
| `nv-mszq5ujm-8` | 7 | **16,40 s** | **12,3 s · 9,9 s · 6,9 s · 13,3 s · 4,3 s** |
| `nv-mszqc43n-9` | 11 | 11,80 s | — |

"±30 detik" dari OWNER bukan berlebihan. 16,4 detik sebelum kata pertama, lalu 12 detik
senyap di tengah kalimat — itu yang dia dengar.

### 2.3 Main thread SEHAT

Watchdog event-loop: dijadwalkan 250 ms, teramati **250–284 ms** sepanjang sesi.

Artinya: perbaikan m025-48 (memindahkan tulisan `localStorage` keluar dari jalur audio)
**berhasil**. Crackle yang tersisa **bukan** main-thread starvation. Jangan cari lagi di
sana.

### 2.4 "Suara pecah seperti radio rusak" — mekanismenya sudah ketemu

Bukan artefak codec. Tiga hal:

1. **Teks Indonesia dibacakan mesin Inggris.** Mesin `id` menjawab
   `neural_generation_busy`, lalu `fiezel-tutor-indonesian-voice-fix.js` menyerahkan teks
   Indonesia ke `baseRuntime` — Supertonic yang sama tapi dibangun dengan
   `generationLang: 'en'`. Kata Indonesia dibaca dengan aturan baca Inggris.
   Terlihat di trace: `speak_neural_start {voice:'af_bella'}` untuk baris tutor Indonesia.
2. **Kalimat dipotong 64–80 karakter di tengah frasa** oleh cap Apple. Tiap potongan lalu
   diberi titik oleh `punctuate()` → nada **jatuh di tengah kalimat**, tiap potongan
   resolve persona sendiri, dan player menyisipkan jeda antar potongan.
   Trace: `chunkCount` sampai **16**, `maxChunkChars` 64.
3. Dua worker (id + en) hidup bersamaan berebut CPU satu-thread.

---

## 3. SUDAH SELESAI DAN SUDAH LIVE — m025-48 (di `main`, commit `d27046c`)

Jangan kerjakan ulang. Laporan lengkap: `FIEZEL-5.19.0-M02548-VOICE-CLARITY-REPORT.md`.

- **Bug paling penting**: `fiezel-sherpa-vits-adapter.js` me-resolve modul prosodi lewat
  `typeof root !== 'undefined' && root.FiezelProsody`. `root` adalah parameter *wrapper*
  UMD, sedangkan factory-nya ditulis sebagai **argumen** wrapper itu — scope chain-nya
  melewati parameter wrapper, jadi `root` adalah global bebas yang tidak pernah ada.
  `typeof` menelan ReferenceError-nya. **`punctuate()` tidak pernah jalan di perangkat mana
  pun sejak m025-37.** Semua milestone prosodi sebelumnya adalah dead code. Test lolos
  karena tiap test menyuntik modulnya sendiri. Sekarang kedua engine mengoper `prosody`
  secara eksplisit.
- diagnostics sink (`fiezel-voice-diagnostics.js`) — menahan tulisan storage selama audio
  terjadwal. Terbukti berhasil (§2.3).
- `latencyHint:'playback'` + `sampleRate:44100` pada AudioContext.
- `conditionSamples()` — DC offset, impulse satu-sampel, headroom. Audio bersih dikembalikan
  by identity.
- penjadwalan gapless + trim silence tepi.
- intonasi: tanya naik, pujian terangkat, vokatif/partikel dapat koma, `silenceScale` 0,4
  (sebelumnya fallback glue 0,2), tempo per kalimat.
- angka/jam/ordinal Indonesia dibaca sebagai kata.
- `prewarm()` + penundaan release saat tab hidden.

---

## 4. SUDAH DIKERJAKAN, BELUM DI-DEPLOY — m025-49 (di branch ini)

Semua sudah di-commit di branch, gate lokal hijau. **Belum di-merge.**

| # | Perubahan | Berkas | Kenapa |
|---|---|---|---|
| 1 | Cap 80-karakter Apple jadi **opt-out** (`workerInference:true`) | `fiezel-neural-voice.js`, bootstrap, supertonic | Cap itu untuk Kokoro di main thread. Supertonic di Worker, dan §2.3 membuktikan main thread sehat. Cap memotong kalimat mid-frasa → §2.4 poin 2 |
| 2 | **Render cache** LRU dibatasi total sample (90 s @44,1 kHz ≈ 16 MB) | `fiezel-neural-voice.js` | Pada 2× realtime, satu baris yang diulang tidak boleh dibayar dua kali. Kunci: teks+voice+speed+lang+intent+posisi |
| 3 | `prefetch()` bisa menghangatkan teks **multi-kalimat**, chunk demi chunk, mengalah ke permintaan nyata di batas chunk | `fiezel-neural-voice.js` | Satu-satunya cara mesin yang lebih lambat dari realtime terasa instan: render **sebelum** diminta |
| 4 | `prefetch` diekspos di jalur Indonesia | `fiezel-supertonic-voice.js`, `fiezel-indonesian-voice.js` | Sengaja **tidak** meng-initialize engine — panggilan spekulatif tidak boleh membayar start-up worker |
| 5 | Classroom pre-render beat berikutnya saat idle | `fiezel-tutor-v3.js` (`warmNextBeat`) | Beat sudah diketahui di muka. Waktu Jahran membaca papan dipakai untuk merender |
| 6 | Kontensi engine **ditunggu**, bukan dilempar ke mesin Inggris | `fiezel-tutor-indonesian-voice-fix.js` | Perbaikan §2.4 poin 1. Retry 180/420/900 ms; kalau tetap sibuk → diam, bukan garble. `superseded` → skip (baris yang lebih baru sudah bicara) |
| 7 | **Welcome bervariasi** 10 baris + `{topic}`, index dirotasi & dipersist | `fiezel-genz-script.js` (`WELCOMES`, `welcome()`), `fiezel-tutor-v3.js` (`speakWelcome`) | Permintaan OWNER. Diucapkan lewat engine id langsung dengan `intent:'sapaan'` supaya register sapaan dipilih deterministik, bukan dari tebak kata |
| 8 | Bug kamus casual: `selamat datang kembali` → `haloo kembali` | `fiezel-genz-script.js` | Frasa panjang harus terdaftar lebih dulu; aturan diterapkan berurutan |

Test yang **sengaja** diubah, dengan alasan tertulis di dalamnya:
`m02545-repair-test.js` — dua assertion soal warm entry. Cache membuat baris identik gratis;
`stop()` membuang reservasi warm tapi **menyimpan** render yang sudah jadi, karena
`stopVoice()` dipanggil di setiap navigasi Classroom dan mengosongkan cache di situ akan
membuang seluruh manfaat pre-render.

### Yang BELUM dikerjakan (tugasmu)

- **Penjelasan AI Core** (`/api/ai/chat` → Puter) untuk Classroom. Belum disentuh sama
  sekali. Task tercatat, kode nol.
- **Migrasi suara ke Puter TTS** — keputusan OWNER, §5.

---

## 5. TUGAS UTAMAMU: MIGRASI KE PUTER TTS

OWNER memilih ini dengan sadar setelah diberi tahu angka §2.1 dan konsekuensinya.

### 5.1 Yang WAJIB kamu selesaikan, bukan lewati

Perubahan ini membatalkan invarian yang tertulis di banyak tempat. Kalau kamu ganti mesin
tanpa membereskannya, repo ini akan **berbohong tentang dirinya sendiri**:

| Berkas | Klaim yang jadi tidak benar |
|---|---|
| `features/neural-voice/fiezel-neural-voice-config.js` | `zeroCostPolicy.remoteInferenceAllowed:false`, `localInferenceRequired:true`, `localRouting.crossOriginRuntimeNetworkAllowed:false`, `offlineAfterWarmRequired:true` |
| `NEURAL-VOICE-SOURCE-LOCK.json` | `policy.remoteInference:false`, `policy.crossOriginTtsRequests:false`, `policy.paidRuntime:false`, `policy.offlineAfterWarmRequired:true` |
| `features/neural-voice/fiezel-supertonic-voice.js` | `status()` mengembalikan `zeroPaidRuntime:true`, `crossOriginInference:false` |
| `neural-voice-test.js:43-44` | assert `[paidRuntime, vendorApiKey, remoteInference, crossOriginTtsRequests] === [false,false,false,false]` dan `offlineAfterWarmRequired === true` |
| `THIRD-PARTY-LICENSES.md` | perlu entri layanan Puter TTS |
| header komentar `fiezel-supertonic-voice.js` | "100% on-device, no API key, no paid runtime, no cross-origin inference" |

**Dua hal yang harus kamu angkat ke OWNER sebelum menulis kode, karena dia mungkin belum
menimbangnya:**

1. **Biaya.** Model Puter adalah "User Pays" — biaya jatuh ke akun Puter pengguna.
   `zeroCostPolicy` repo ini menulis `paidApiAllowed:false` dan `meteredBillingAllowed:false`.
   Tanya OWNER apakah ini diterima, dan berapa batas wajarnya. Suara dipakai **setiap
   kalimat** di Classroom — volumenya besar, bukan sesekali seperti AI chat.
2. **Offline.** FIEZEL adalah PWA yang dipakai offline. Cloud TTS mematikan Classroom saat
   tidak ada internet. **Rekomendasi kuat: pertahankan Supertonic sebagai fallback offline,
   jangan hapus.** Bundel 153 MB sudah terunduh di perangkat OWNER. Arsitektur yang benar
   adalah *dua* penyedia dengan pemilihan otomatis, bukan penggantian.

### 5.2 Rancangan yang saya sarankan

Buat lapisan penyedia di belakang kontrak `speak()` yang sudah ada — **jangan** bongkar
`fiezel-neural-voice.js`, karena semua perbaikan §4 hidup di situ dan berlaku untuk kedua
penyedia:

```
FiezelVoiceRuntime.speak()
        │
        ├── penyedia "puter-cloud"   → puter.ai.txt2speech() → PCM → player yang sama
        └── penyedia "supertonic"    → worker WASM (sekarang)  → PCM → player yang sama
```

- Penyedia cloud cukup mengembalikan `{audio: Float32Array, sampling_rate}` — persis
  kontrak `adapter.generate()` sekarang. Kalau kamu memenuhi kontrak itu, **render cache,
  prefetch, penjadwalan gapless, prosodi, persona, dan conditioning ikut jalan tanpa
  perubahan apa pun**. Itu sebabnya kontrak ini layak dipertahankan.
- Decode respons Puter (kemungkinan MP3/WAV) lewat `AudioContext.decodeAudioData`, ambil
  channel 0, lewatkan ke `conditionSamples()` seperti biasa.
- Pilihan penyedia: cloud saat online & Puter signed-in (`puter.auth.isSignedIn()`),
  otomatis turun ke Supertonic saat offline/gagal/timeout.
- **Cache tetap wajib**, bahkan lebih berharga: menghemat uang, bukan cuma waktu.
- Rahasiakan tidak ada: tanpa API key di klien. Puter memakai sesi login pengguna.

### 5.3 Yang harus diverifikasi di perangkat, bukan di test

- latensi kata pertama (target: < 2 detik),
- apakah suara Indonesia Puter terdengar lebih baik daripada Supertonic — **belum tentu**;
  kalau lebih buruk, seluruh migrasi ini tidak ada gunanya dan OWNER harus tahu itu,
- perilaku saat internet putus di tengah kalimat.

### 5.4 Penjelasan AI Classroom (tugas kedua)

Jalurnya sudah ada dan berfungsi: `askFiezelAI(prompt)` (app.js:952) →
`coreWorkerExec('/api/ai/chat')` → `user.puter.ai.chat` di `fiezel-core-worker.js:275`.
Worker sudah dikonfigurasi (`core-config.js`: `https://fiezel-core.puter.work`,
`deploymentState:'validated'`), dan diagnostics melaporkan `core: pass`, `isSignedIn: true`.

Sumber "penjelasan pendek menggantung": beat di `fiezel-tutor-v3.js` (`richerBeats`) adalah
`idText` hardcoded yang pendek. Ganti/lengkapi dengan penjelasan dari Core AI, dengan beat
tertulis sebagai fallback offline. Ada rate limit (`allowAiRequest`) — hormati, dan cache
hasilnya per beat.

---

## 6. PROTOKOL KERJA — TIDAK BISA DITAWAR

### 6.1 Otoritas

`MASTER-ONLY-GOVERNANCE.md` adalah ENFORCED POLICY. §5: **"MASTER alone decides
merge/deploy/promotion."** Kamu boleh commit dan push ke branch. Kamu **tidak** merge ke
`main` tanpa OWNER mengatakannya di sesi itu juga. Merge = deploy ke GitHub Pages = langsung
dipakai Jahran.

Catatan penting: channel GitHub di sesi ini terautentikasi **sebagai `fitrajft-ux`**. Jadi
teknis kamu *bisa* merge. Bahwa kamu bisa bukan berarti kamu boleh.

### 6.2 Aturan rilis yang akan menggagalkan PR-mu kalau dilanggar

Gate A7 (`.github/workflows/a6-a7-verifiers.yml`):

- kalau kamu menyentuh `index.html|style.css|app.js|sw.js|version.js|manifest.json|features/`,
  maka `DIAG_BUILD` di `features/neural-voice/fiezel-diag-panel.js` **wajib naik tepat +1**
  dari `main`, dan
- `SW_REV` di `sw.js` **wajib** membawa prefix `m025-<DIAG_BUILD>-`.

Sekarang `main` = `m025-47`. Branch ini juga `m025-47` (dipakai m025-48). **Deploy
berikutnya wajib `m025-48`** di kedua tempat. Kalau tidak, PWA terpasang tidak akan refresh
shell dan OWNER akan melihat kode lama sambil mengira kamu berbohong.

### 6.3 Verifikasi

```bash
# WAJIB: seluruh daftar, bukan sebagian. Saya pernah menjalankan sebagian dan CI merah.
python3 -c "
s=open('.github/workflows/quality.yml').read()
b=s[s.index('- name: Core validation'):]
[print(l.strip()) for l in b.splitlines() if l.strip().startswith('node ')]" | while read c; do
  $c >/dev/null 2>&1 || echo "FAIL $c"
done
```

Gate perangkat nyata jalan otomatis di PR: `m02547-neural-library-safari.yml` (Safari asli
di runner macOS arm64) dan `m02526-product-neural-safari.yml`. **Kalau kamu ganti penyedia
suara, probe di workflow itu harus ikut diperbarui**, kalau tidak dia membuktikan
konfigurasi yang tidak lagi dikirim.

### 6.4 Kalau OWNER mengirim capture Diagnostics lagi

Itu bukti paling berharga di proyek ini. Parse, jangan dibaca sekilas:
`d['target']` adalah string JSON berisi array trace. Skrip analisis yang saya pakai ada di
riwayat; polanya: hitung RTF per `adapter_generate_ready`, hitung jarak
`chunk_plan`→`playback_start` pertama, dan lubang `playback_done`→`playback_start`
berikutnya.

---

## 7. CARA BERPIKIR YANG SAYA PAKAI

Ini bagian yang OWNER minta secara khusus. Bukan gaya bahasa — ini urutan berpikir yang
membuat perbedaan antara memperbaiki gejala dan memperbaiki sebab.

**1. Ukur dulu, jangan percaya komentar kode.**
Komentar bilang `RTF 0.25`. Perangkat bilang 2,03. Angka di komentar itu diukur pada model
yang sudah pensiun dan tidak pernah diperbarui. Semua rencana yang saya susun sebelum
melihat capture perangkat **salah**, termasuk milik saya sendiri. Saya membuangnya.

**2. Tanya "apakah kode ini benar-benar jalan?" sebelum "apakah kode ini benar?"**
Modul prosodi tidak pernah dieksekusi di perangkat selama enam milestone. Tidak ada yang
memeriksa, karena test-nya lolos — tiap test menyuntik modulnya sendiri, jadi jalur yang
diuji bukan jalur yang dikirim. Pertanyaan "apakah wiring produksi sama dengan wiring test?"
adalah pertanyaan yang menemukan bug ini.

**3. Cari mekanismenya, bukan yang terdengar masuk akal.**
"Cracking" bisa berarti sepuluh hal. Saya tidak menebak — saya cari mana yang
*meninggalkan jejak*. Watchdog menutup satu hipotesis (main thread sehat). Trace
`voice=af_bella` untuk baris Indonesia membuka hipotesis lain yang jauh lebih spesifik:
teks Indonesia dibaca mesin Inggris. Itu bukan "crackle", itu bahasa yang salah — dan
mekanismenya bisa ditunjuk barisnya.

**4. Kalau perbaikanmu tidak tahan diperiksa, buang.**
Saya menulis pemecahan "lead chunk pendek" supaya kata pertama cepat keluar. Lalu saya
hitung: pada RTF 2, itu cuma memindahkan senyap dan menambah sambungan. **Saya hapus kode
yang baru saja saya tulis.** Kode yang sudah ditulis bukan alasan untuk mempertahankannya.

**5. Batas kontrak lebih penting daripada kerapian.**
Saya *bisa* membongkar `splitIntoChunks`. Saya tidak, karena kontrak evidence device-probe
didefinisikan dengannya. Saya juga membalik flag `mainThreadInference` menjadi
`workerInference` setelah test gagal — bukan karena test-nya rewel, tapi karena test itu
benar: default harus mempertahankan perilaku lama, dan yang baru harus **menyatakan diri**.

**6. Test yang menghalangi harus dipahami, bukan dilemahkan.**
Dua assertion di `m02545-repair-test.js` saya ubah. Sebelum mengubah, saya tanya: properti
apa yang dijaga? "Audio yang dibatalkan tidak boleh diputar." Cache tidak melanggar itu —
kuncinya memuat teks, voice, speed, bahasa, intent, dan posisi, jadi hanya bisa diputar
untuk permintaan yang persis sama. Saya tulis alasan itu **di dalam test**, supaya orang
berikutnya tidak perlu menebak.

**7. Jujur tentang apa yang belum terbukti.**
Semua nilai tuning (`silenceScale`, `GAP_MS`, delta tempo) terverifikasi mesin, **belum
pernah didengar telinga**. Saya katakan itu setiap kali melapor. Menyebut pekerjaan
"selesai" padahal gate sebenarnya adalah telinga OWNER adalah bentuk berbohong yang paling
mudah dilakukan dan paling mahal akibatnya.

**8. Koreksi diri secepat mungkin, tanpa drama.**
Saya salah soal A7 dan "15 commit" karena `origin/main` lokal saya basi. Saya `fetch`, saya
lihat saya salah, saya katakan "abaikan paragraf itu", lalu lanjut. Saya juga membuat CI
merah karena menjalankan sebagian suite. Saya perbaiki, saya sebut itu kesalahan saya, saya
lanjut. Jangan menyembunyikan, jangan berpanjang-panjang.

**9. Yang mudah diukur bukan berarti yang penting.**
Gate Safari hijau dengan `transitionMs: 1`. Terlihat sempurna. Tapi gate itu menguji jalur
Library (satu kalimat per panggilan) — justru jalur di mana streaming tidak aktif. Saya
katakan ke OWNER bahwa angka itu **tidak** membuktikan perbaikan yang dia tanyakan. Metrik
hijau yang mengukur hal yang salah lebih berbahaya daripada tidak ada metrik.

---

## 8. JEBAKAN YANG AKAN MENGGIGITMU

1. **Pola UMD `root`.** Beberapa modul di `features/neural-voice/` memakai
   `(function(root, factory){...}(globalThis, function(){ ...pakai `root`... }))`. Di dalam
   factory, `root` **tidak ada**. Kalau kamu lihat `typeof root !== 'undefined' && root.X`,
   itu selalu `null`. Periksa modul lain — saya hanya memperbaiki yang di adapter.
2. **Test lolos ≠ produksi jalan.** Lihat §7 poin 2.
3. **`neural_generation_busy` sengaja fail-closed.** Dipin tiga assertion di
   `neural-voice-single-flight-test.js`. Ada alasannya: inference yang timeout harus tetap
   memegang lock sampai benar-benar settle, kalau tidak dua inference jalan bersamaan.
   **Jangan longgarkan.** Perbaiki di pemanggil, seperti yang saya lakukan.
4. **`stopVoice()` dipanggil di setiap navigasi Classroom.** Apa pun yang kamu buang di
   `stop()` akan terbuang sangat sering.
5. **Dua worker bahasa hidup bersamaan** berebut satu thread. Kalau migrasi cloud hanya
   untuk satu bahasa, kamu tetap punya masalah ini.
6. **`FiezelVoiceRuntime` di-`Object.freeze` dan dibungkus ulang** oleh beberapa layer
   (`audibility-fix`, `ios-cache-fix`, `tutor-indonesian-voice-fix`). Proxy dengan
   substitusi anggota **melanggar invariant objek beku** dan pernah mematikan seluruh suara
   (m025-40). Pola yang benar: `Object.freeze(Object.assign({}, base, {override}))`.
7. **Urutan `<script>` di `index.html` itu bermakna.** Sink diagnostics harus dimuat sebelum
   modul yang mencatat ke dalamnya; `tutor-indonesian-voice-fix` harus setelah `tutor-v3`.
   Ada test yang menjaga keduanya.

---

## 9. RINGKAS: LANGKAH PERTAMAMU

1. Baca `audit/m025/m02548-device-evidence.json`. Itu kebenaran lapangan.
2. Angkat dua pertanyaan §5.1 ke OWNER (biaya, offline) **sebelum** menulis kode.
3. Bangun lapisan penyedia §5.2. Jangan bongkar `fiezel-neural-voice.js`.
4. Perbarui setiap klaim kebijakan di §5.1 supaya repo tidak berbohong.
5. Naikkan `DIAG_BUILD` ke `m025-48` dan `SW_REV` ke `m025-48-...`.
6. Jalankan **seluruh** gate. Buka PR. **Berhenti.** Biarkan OWNER yang merge.

Selebihnya: dengarkan OWNER, ukur sebelum mengubah, dan katakan yang sebenarnya tentang apa
yang belum kamu buktikan.
