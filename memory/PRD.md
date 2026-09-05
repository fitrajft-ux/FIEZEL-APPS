# FIEZEL 2.0 — Full UI/UX Redesign

## Problem statement (asli)
Redesign UI/UX FIEZEL menyeluruh: cheerful + premium + modern, palet pastel dipertahankan (light yellow, pastel pink, cream, mint, lilac, maroon), mobile-first PWA, navigasi sederhana, CTA jelas, feedback benar/salah natural. Revisi user: mock diterima; SEMUA maskot PAW tetap seperti sebelumnya; tambah panel Online & Teman yang mudah dilihat; fitur tambah teman lewat ID; tombol gabung kelas dengan kode guru.

## Arsitektur
- Static PWA di root repo (index.html, app.js, style.css, features/*), preview `tools/preview-server.mjs` :3000.
- Backend: Cloudflare Worker `workers/api` (D1). Sosial: `route-social.js`.

## Yang sudah diimplementasikan (Juni 2026, build m025-258)
- `fiezel-2.css` (lapisan redesign, dimuat terakhir + masuk cache SW): token radius/shadow, tipografi Jakarta (serif dihapus dari display), tombol pill tactile (sun 3D edge, CTA utama ink), bottom nav pill dengan tab aktif kuning, kartu Hari Ini gradasi kuning + eyebrow maroon, skill hub pastel per skill (pink/mint/lilac/peach/kuning/sky), tabs segmented, opsi kuis berhuruf A–D dengan state benar/salah 3D, feedback tinted, form input membulat.
- Panel **Online & Teman** di Home (`socialHomeBody`, data-testid `home-online-panel`): avatar teman + status online, tombol **Tambah teman** (`openAddFriendModal`) dan **Gabung kelas** (`openJoinClassModal`), tautan Lihat semua. Selalu tampil (juga saat offline/flag off).
- Tab Teman: kartu "Tambah teman lewat ID" (input @handle → `POST /api/social/friends/add`), kartu "Gabung kelas dengan kode guru", daftar teman, kode undangan lama dipindah ke `<details>` "Cara lain".
- Worker: route baru `POST /api/social/friends/add` {handle} (dua arah, idempoten, anti-oracle), schema.js size, client `api.friendAdd`.
- Gabung kelas: kode disimpan ke `fiezel-onboarding-v1.classCode` (jalur yang sama dengan onboarding), memicu `FiezelLearnerFlow.pushToClass`, bisa diganti/keluar.
- i18n: kunci `social2.*` id + th.
- Mock design HTML statis di `/app/mockups/` (referensi arah desain).
- Gate lokal hijau: pwa-release-coherence, install-health, boot-order, lucide-icon-coverage, th-coverage, social-frontend, social-api-contract.

- Jalur Grammar bernode (`grammar()`): ringkasan ring X/N di atas, node dot + kartu lesson, node aktif berbingkai kuning dengan progress bar + CTA `grammar-path-continue`, lesson selesai bertanda ✓, terkunci redup.
- Progres: `cefrRoadmapMarkup` → kartu level gelap (`progress-level-card`, % menuju level berikut dari lesson grammar yang tembus ambang, track A1–C2, streak); `weeklyActivityChartMarkup` → "Minggu ini" (`progress-week-card`) dari data nyata `skillTimeline()` (kotak per hari, hari ini putus-putus). Kunci i18n `progress2.*` id+th.

## Backlog
- P1: layar hasil sesi ala mock (skor besar, mastery naik, langkah berikutnya).
- P1: desktop layout sidebar (mock d1–d3) untuk ≥1024px.
- P2: deploy worker (`wrangler deploy`) supaya endpoint friends/add aktif di produksi.

## Class Hub — Kelas = Guru ↔ Murid ↔ Braincore (Sep 2026, build m025-259)
Problem statement: rebuild "Class" di bottom nav sebagai learning hub guru–murid (audit dulu; jangan buang fondasi; Braincore di tengah loop, tanpa Puter/API key/cloud AI). Audit + flow + gap + arsitektur + 3 konsep UI: `docs/class-hub-audit.md`.
- `features/class-hub/fiezel-braincore-review.js`: review lokal soal guru (parser impor, CEFR estimasi, skill, kesulitan via FiezelItemPrior, 9 cek kualitas, distraktor → kode taksonomi miskonsepsi, saran perbaikan, status tugas 4 warna).
- `features/class-hub/fiezel-class-hub.js` + `class-hub.css`: wajah murid (Tugas / Kelas Saya / Progres + runner tugas di dalam Kelas) dan wajah guru (Kelas Saya / Tugas / Buat Tugas 3 langkah / Hasil / Braincore) yang dipasang di Ruang Guru sebagai view `hub` (landing default).
- Kontrak data diperluas aditif: payload tugas `teacher`, `items[]` (soal kustom); laporan murid `assign[].s` (sedang) dan `assign[].w` (soal salah); byte limit assign 32 KB / class-report 8 KB.
- app.js: view `classroom` → `classHubView()`; tutor bersuara tetap hidup lewat kartu "Tutor FIEZEL"; notifikasi tugas → Kelas; learner-flow merutekan blok tugas guru ke hub.
- Gate baru `tests/class-hub-test.js` (unit + smoke DOM-stub loop penuh) masuk quality.yml.
Backlog: satukan `route-teacher.js` (pohon konten server) sebagai sumber impor; kalibrasi review dengan bukti; ledger miskonsepsi murid dari `w[]`; i18n TH hub.

## m025-266 — Pintu Tanya FIEZEL + gerbang layar yatim (Sep 2026, branch fix/pintu-tanya-fiezel)
- Akar masalah: m025-254 mengganti tombol topbar "Tanya FIEZEL" dengan lonceng; `askView()` (view `ask`/`search`) yatim 11 build tanpa satu pun `go('ask')`.
- Perbaikan: chip "Cari materi" di kepala panel pembimbing PAW (`features/ui/fiezel-coach-bubble.js`, opsi `openAsk` dari `syncCoachBubble()` app.js), i18n `coach.cari-materi` id+th.
- Gerbang baru `tests/view-reachability-test.js` (VALID_VIEWS + alias renderInner + pintu, semua ditemukan dari kode); terdaftar di quality.yml. Merah pada app.js main, hijau sesudah.
- Handoff: `docs/handoffs/FIEZEL-M025266-PINTU-TANYA-FIEZEL-HANDOFF.md`.
- Backlog terdekat (PR terpisah): tiga chip + aria-label gelembung di coach-bubble masih teks Indonesia langsung (murid Thai melihat chip Indonesia).
