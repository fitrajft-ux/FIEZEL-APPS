# FIEZEL 5.19.0 — M028 Audio Integrity Repair Handoff

Tanggal: 2026-08-19 WIB
Task: T-028
Branch: `agent/m028-audio-integrity-repair`
Baseline: `main` @ `eb2278e3a6aed4b711c84dc2cb706218cc39492b`
Status: `in_progress`

## 1. CONTEXT INJECTION WAJIB

M028 dimulai dari M027 dan diagnostics OWNER. Tidak boleh mengulang diagnosis dari nol.

```yaml
owner_evidence:
  general_delay: medium
  general_crackle: severe
  naturalness: poor
  human_likeness: poor
  classroom_delay: severe
  classroom_crackle: severe
  classroom_naturalness: extreme_failure
  perceived_emotion: none
technical_context:
  inference_latency: CONFIRMED
  crackle_source: UNRESOLVED_MODEL_VS_PLAYBACK
  expressiveness_interface_limit: CONFIRMED
  engine: supertonic-3-int8-2026-05-11
  generation_steps: 4
  backend: wasm-simd-worker
  cross_origin_isolated: false
```

Owner memerintahkan diagnostics tersebut cukup dan roadmap dilanjutkan tanpa physical A/B tambahan.

## 2. DATA-DRIVEN LATENCY DECISION

Capture OWNER memberi contoh:

- 18 chars -> ~1490 ms generation;
- 23 chars -> ~1714 ms;
- 48 chars -> ~2928 ms;
- 77 chars -> ~4585 ms;
- 78 chars -> ~4097 ms.

Hard cap produksi saat ini 80 karakter. M028 menurunkan Apple standalone hard cap default menjadi **32 karakter** untuk menurunkan time-to-first-audio. Capture juga menunjukkan generation tetap lebih cepat daripada durasi PCM pada contoh yang terlihat, sehingga next-chunk prefetch masih punya peluang mengejar playback setelah chunk pertama mulai.

## 3. SCOPE-LOCK

```yaml
task_id: T-028
objective: >
  Mengurangi crackle/dropout dari renderer dan menurunkan first-speech latency
  pada Apple standalone tanpa mengganti model dan tanpa true inference streaming.
files_allowed:
  - FIEZEL-5.19.0-M028-AUDIO-INTEGRITY-HANDOFF.md
  - features/neural-voice/fiezel-pcm-renderer-worklet.js
  - features/neural-voice/fiezel-web-audio-player.js
  - features/neural-voice/fiezel-neural-voice.js
  - neural-voice-m028-audio-integrity-test.js
  - neural-voice-device-hotfix-test.js
  - neural-voice-single-flight-test.js
  - .github/workflows/quality.yml
  - sw.js
  - features/neural-voice/fiezel-diag-panel.js
files_forbidden:
  - vendor/supertonic-3/*
  - NEURAL-VOICE-SOURCE-LOCK.json
  - features/neural-voice/fiezel-sherpa-vits-adapter.js
  - features/neural-voice/fiezel-supertonic-voice.js
  - features/neural-voice/fiezel-neural-voice-bootstrap.js
  - fiezel-core-worker.js
forbidden_actions:
  - Jangan mengganti model/vocoder.
  - Jangan menurunkan generationSteps di bawah 4.
  - Jangan menambah filter waveform spekulatif.
  - Jangan membuat model/worker inference kedua baru.
  - Jangan mengimplementasikan callback PCM incremental dari TTS worker.
  - Jangan mengubah kontrak FiezelVoiceRuntime.
  - Jangan memulai Local Qwen.
```

`neural-voice-device-hotfix-test.js` ditambahkan ke `files_allowed` setelah A6 membuktikan test legacy masih mematok policy `apple-standalone-inference-slice-v2` dan hard cap 80 karakter. Perubahan pada file itu dibatasi hanya pada dua assertion yang secara eksplisit superseded oleh keputusan T-028 menjadi policy v3 / 32 karakter; watchdog, prefetch-yield, lifecycle, privacy, dan invariant lain tetap tidak berubah.

`neural-voice-single-flight-test.js` juga termasuk scope karena test tersebut menguji Apple single-flight/prefetch pipeline pada effective hard cap dan policy identifier. Adaptasinya hanya memindahkan ekspektasi Apple dari 80/v2 menjadi 32/v3 serta jumlah slice minimum yang konsekuen; single active inference, overlap generation/playback, supersession, timeout, dan non-Apple behavior tetap wajib sama.

## 4. IMPLEMENTATION PLAN

### Renderer

Tambahkan AudioWorklet mono PCM renderer yang persistent per AudioContext:

`full generated chunk -> conditionSamples -> worklet queue -> audio render thread -> destination`

M028 **belum true streaming**. PCM baru masuk setelah satu generation chunk selesai. M029 nanti akan mengirim frame incremental ke renderer yang sama.

Renderer wajib:

- hanya dipilih pada Apple standalone jika AudioWorklet tersedia;
- fallback otomatis ke legacy `AudioBufferSourceNode` bila addModule/node gagal;
- context sample-rate mismatch -> fallback legacy, agar M028 tidak menambah resampler baru;
- queue tetap bounded oleh existing service `SCHEDULE_DEPTH=2`;
- fade-in/end dilakukan di worklet untuk mencegah step discontinuity;
- stop/close tetap aman;
- public player API tetap tepat `{ play, stop, warm, close }`.

### Chunk policy

Apple standalone hard cap default:

`80 -> 32 chars`

Non-Apple behavior tidak berubah.

## 5. DONE WHEN

- worklet module terdaftar dan bisa menerima full Float32 PCM chunk;
- worklet output tidak membutuhkan main-thread per-render scheduling;
- fallback legacy teruji;
- sample-rate mismatch fail-safe ke legacy;
- Apple chunk plan default <=32 karakter;
- default non-Apple chunk policy tidak berubah;
- player public API tidak berubah;
- worklet masuk service-worker shell asset list;
- DIAG_BUILD/SW_REV naik sesuai A7 release boundary;
- focused M028 test PASS;
- full Quality Gate PASS;
- A6/A7 PASS;
- Safari acceptance PASS bila workflow terpicu.

## 6. NON-GOALS / HONEST STATUS

M028 tidak mengklaim:

- source crackle sudah dipastikan model atau playback;
- naturalness/human-likeness sudah selesai;
- neural emotion sudah ada;
- long-text true streaming sudah selesai.

Roadmap berikut tetap:

`M028 renderer + latency repair -> M029 true PCM streaming -> stress test long text -> model-quality/expressiveness repair -> Local Qwen`

---

## 7. M028-2 — LEAD-IN SILENCE (follow-up di atas M028 yang sudah merged)

- Status: `implemented_pending_verification`
- Otoritas: OWNER directive ke sesi HELPER:APEX; dicatat di #12 comment 5341643463 dan 5341877568
- Base: `main` setelah PR #82 merged
- Release marker: `DIAG_BUILD m025-50`, `SW_REV m025-50-lead-in-trim-20260819-1`

### Bukti: engine dijalankan offline

`vendor/supertonic-3/sherpa-onnx-wasm-main-tts.js` punya jalur Emscripten untuk Node, jadi
engine yang benar-benar dikirim ke produksi bisa dijalankan tanpa perangkat: file model
ditulis ke FS WASM persis seperti `sherpa-onnx-tts.worker.js`, dan `createOfflineTts`
dibangun dengan config identik. Tidak ada file `vendor/` yang diubah.

Setiap render dimulai dengan senyap di bawah silence floor sebelum sampel ucapan pertama:

| chars | gen ms | audio s | RTF | lead-in ms | tail ms | peak | clipped | impulses | max jump |
|---|---|---|---|---|---|---|---|---|---|
| 9 | 2534 | 1.40 | 1.81 | 215 | 434 | 0.317 | 0 | 0 | 0.092 |
| 15 | 2187 | 1.59 | 1.37 | 372 | 502 | 0.380 | 0 | 0 | 0.129 |
| 22 | 2206 | 2.00 | 1.11 | 318 | 443 | 0.244 | 0 | 0 | 0.091 |
| 41 | 9834 | 3.05 | 3.22 | 344 | 661 | 0.346 | 0 | 0 | 0.134 |
| 80 | 19462 | 5.73 | 3.39 | 557 | 638 | 0.362 | 0 | 0 | 0.112 |

### Perubahan

`trim: joined` berarti ucapan satu chunk tidak pernah di-trim, jadi dead air itu diputar
utuh sebelum ada bunyi — persis kasus balasan pendek, tempat delay paling terasa.
`trimSilence()` kini memisahkan kepala dari ekor: kepala selalu di-trim pada jalur
streaming, ekor tetap memakai kebijakan m025-47 karena untuk baris tunggal ekor itulah
penjarak antar kalimat Library. Default tanpa opsi tidak berubah.

Diukur pada PCM engine asli: **sampel ucapan pertama datang 401 ms lebih awal.**

### Klasifikasi crackle diperbarui

```yaml
crackle_source:
  model_pcm: RULED_OUT_BY_MEASUREMENT
  remaining: playback/scheduling path
```

PCM model mentah: nol clipping, nol non-finite, nol impuls, lompatan antar-sampel maksimum
0,09–0,13 melawan p99 0,03. `conditionSamples()` mengembalikannya by identity. Tiga
mekanisme lain dieliminasi: `prosody.resample` tidak aktif (`usePitchContour: false`),
sambungan frasa memakai crossfade 6 ms, dan perbaikan impuls tidak mengubah satu pun sampel
pada nada 220 Hz/6 kHz/12 kHz maupun noise fricative 0,5 dan 0,9.

Batas klaim: x86 desktop WASM single-thread, 5 ucapan, `sid 0` Inggris. Model bukan lagi
tersangka utama; ini bukan berarti tereliminasi mutlak untuk semua perangkat/suara/panjang.

### Amandemen scope

Jalur streaming lintas platform, jadi ini mengubah playback non-Apple juga. Ditandai
eksplisit, bukan diselipkan. Chunk policy, worklet, dan asset SW tidak tersentuh.

### Lanjutan

Belum ada bukti perangkat fisik dan tidak ada klaim audible. Langkah berikut tidak berubah:
`M029 true PCM streaming -> stress test long text -> model-quality/expressiveness repair`.
