# FIEZEL-APPS — working agreement

This is fitrajft-ux's personal repo (FIEZEL, a personal English-learning PWA). Owner has
pre-authorized the following so Claude can work without stopping to ask each time:

- **Git/GitHub actions on this repo are pre-authorized**: commit, push to feature branches,
  create PRs, and merge PRs (including `--delete-branch`) without asking first. Still create
  a feature branch per change rather than committing straight to `main`, and still run the
  relevant tests before merging.
- Still ask first for anything genuinely destructive or hard to undo in a way a normal merge
  isn't: `git push --force` to `main`, `git reset --hard`, deleting data, or anything outside
  this repo.
- **Repo layout (m025-254)**: root holds the app shell, config, data banks, and the release
  scripts CI calls; every gate lives in `tests/` (run them from the repo root, e.g.
  `node tests/regression-test.js`); handoffs in `docs/handoffs/`, other docs in `docs/`,
  evidence and audit output in `reports/`, one-off harnesses in `tools/dev/`. Gates reach
  production files through `__fzRoot` (`path.join(__dirname, '..')`) — see `tests/README.md`.
- Version/build bump ritual (see `core-config.js` `FIEZEL_PAGE_BUILD`, `fiezel-diag-panel.js`
  `DIAG_BUILD`, `sw.js` `SW_REV`) must stay coherent — bump all three together, +1 from the
  current `m025-N`, per the tests in `tests/install-health-test.js` / `tests/pwa-release-coherence-test.js`.
- Before calling any change done, run the local test suite (see `.github/workflows/quality.yml`
  for the exact list) and loop until green. Pre-existing unrelated failures (e.g. the
  `vendor/kokoro-js/kokoro.web.js` hash-lock tests, which fail even on a clean `main` checkout
  in this environment) don't block — confirm via `git diff main -- <path>` that the file is
  untouched before treating a failure as pre-existing.
- **Setiap teks yang dilihat pengguna lahir DUA BAHASA — Indonesia dan Thai.** FIEZEL punya
  murid Thai; teks yang hanya ditulis dalam Indonesia sampai ke mereka sebagai layar
  berbahasa campur, bukan sebagai teks yang hilang. Jadi: jangan pernah menulis kalimat
  langsung di `app.js` atau modul fitur. Daftarkan lewat pasangan
  `features/i18n/copy-id-<domain>.js` + `features/i18n/copy-th-<domain>.js` (kunci sama
  persis, `{placeholder}` sama persis, nilai th ber-aksara Thai), lalu panggil dengan
  `FiezelI18n.t('<kunci>')`. Domain baru cukup dibuat sebagai pasangan berkas —
  `tests/th-coverage-test.js` menemukannya sendiri dari isi direktori dan langsung menuntut
  kembarannya; tidak ada daftar yang perlu disunting. Kalau terjemahan Thai-nya belum bisa
  ditulis, catat sebagai utang bertanggal di `UTANG_TANPA_TH` / `UTANG_KUNCI` di gerbang itu
  dan sebutkan di laporanmu — jangan diam-diam mengirim kunci tanpa th. Latar lengkapnya di
  `docs/handoffs/I18N-TH-PARITY-HANDOFF.md`.
- Owner reports should stay short in chat; put detail in the PR description, not the chat reply.
