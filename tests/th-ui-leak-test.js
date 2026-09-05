#!/usr/bin/env node
/**
 * GERBANG KEBOCORAN NASKAH INDONESIA DI MODE THAI (tests/th-ui-leak-test.js) — m025-265.
 *
 * ==========================================================================
 * KENAPA GERBANG INI ADA
 * ==========================================================================
 * FIEZEL punya dua locale murid (id, th) dan lapisan i18n yang lengkap sejak Gelombang 2:
 * 2.205 kunci id dengan padanan th untuk semuanya. Tapi lapisan itu hanya bekerja untuk
 * kalimat yang MEMANGGILNYA. Audit m025-265 menemukan ±200 kalimat yang tidak: literal
 * Indonesia yang dicetak langsung ke DOM di app.js dan 20 modul features/*. Murid yang
 * memilih ภาษาไทย membaca kalimat itu dalam bahasa Indonesia — dan tidak ada satu pun
 * gerbang yang merah karenanya, karena tidak ada yang memeriksanya.
 *
 * Gerbang ini memeriksanya. Ia memindai app.js + features/** untuk literal berbahasa
 * Indonesia yang TIDAK lewat FiezelI18n.t()/t(kunci, fallback), lalu membandingkannya
 * dengan ANGGARAN per berkas di bawah. Angka di ALLOWLIST adalah utang yang sudah diketahui
 * dan dijelaskan; naik satu = merah.
 *
 * KENAPA ANGGARAN, BUKAN NOL:
 *   - features/quota/quota-copy.js dan features/prasasti/fiezel-prasasti-core.js adalah
 *     berkas KANON yang sha-nya dikunci id-golden-snapshot dan punya protokol th sendiri
 *     (copy-th-quota.js + CANON_TH_RULES yang menunggu penutur asli). Menyentuhnya lewat
 *     sapuan mekanis akan menembus dua gerbang sekaligus.
 *   - features/neural-voice/fiezel-cf-voice-notice.js adalah cermin naskah quota di atas.
 *   - listening-scenarios-a1/a2.js adalah KONTEN BELAJAR (pilihan jawaban komprehensi),
 *     jalur th-nya lewat sidecar listening-bank-th.json, bukan copy-map.
 *   - satu literal di app.js adalah potongan PROMPT AI (rubrik penilaian), bukan naskah UI.
 *   - beberapa berkas menyimpan naskahnya sebagai tabel copy id yang padanan th-nya hidup
 *     di naskah-th-brain.js (brain-olm.*, brain-tutor.*), jadi ia bukan kebocoran.
 *   - ZONA AUDIO (fiezel-diag-panel.js, fiezel-neural-voice-audibility-fix.js): gerbang P0
 *     tests/audio-locale-guard-test.js melarang berkas zona audio menyebut FiezelI18n SAMA
 *     SEKALI — locale yang bocor ke sana pernah ikut ter-hash ke kunci cache audio (AI-17
 *     F02). Sapuan m025-266 sempat memindahkan naskah kedua berkas ini lalu DIKEMBALIKAN
 *     ketika gerbang itu merah: pagar P0 tidak dilonggarkan demi naskah. Utangnya nyata dan
 *     tercatat di sini; jalan keluarnya adalah menyuntik label dari LUAR zona audio, bukan
 *     menambah pengecualian di audio-locale-guard.
 *
 * Turunkan angkanya saat utangnya dibayar. JANGAN menaikkannya untuk membuat gerbang hijau.
 */
'use strict';
const __fzRoot = require('path').join(__dirname, '..');
const fs = require('fs');
const path = require('path');

/* Anggaran kebocoran per berkas — lihat alasannya di kepala berkas. */
const ALLOWLIST = Object.freeze({
  'app.js': 1,                                                  // potongan prompt AI (rubrik), bukan UI
  'features/brain/fiezel-olm.js': 1,                            // tabel copy id, padanan th di naskah-th-brain.js
  'features/brain/fiezel-tutor-brain.js': 3,                    // idem
  'features/class-hub/fiezel-class-hub.js': 1,                  // fallback t() dengan kutip ganda di dalamnya
  'features/neural-voice/fiezel-cf-voice-notice.js': 3,         // cermin naskah kanon quota
  'features/onboarding/fiezel-onboarding.js': 1,                // pemilih bahasa memang dwibahasa
  'features/neural-voice/fiezel-diag-panel.js': 6,              // zona audio: AI-17 F02 melarang FiezelI18n di sini
  'features/neural-voice/fiezel-neural-voice-audibility-fix.js': 2, // idem — lihat catatan ZONA AUDIO di bawah
  'features/prasasti/fiezel-prasasti-core.js': 3,               // berkas kanon, sha dikunci
  'features/quota/quota-copy.js': 5,                            // berkas kanon, sha dikunci + CANON_TH_RULES
  'features/speaking-listening/listening-scenarios-a1.js': 11,  // konten belajar, jalur th lewat sidecar
  'features/speaking-listening/listening-scenarios-a2.js': 12   // idem
});

const ID_WORDS = /\b(Akun|Masuk|Daftar|Pengaturan|Simpan|Batal|Lanjut|Kembali|Selesai|Silakan|Memuat|Jawaban|Pilih|Kirim|Aktifkan|Aktivasi|Nama|Kelas|Guru|Murid|Suara|Notifikasi|Riwayat|Belajar|Undangan|Coba lagi|Status|Belum|Sudah|Hapus|Tambah|Ubah|Buat|Tutup|Cari|Ruang|Tugas|Soal|Materi|Metrik)\b/;

/* Buang komentar tanpa menggeser nomor baris — komentar Indonesia ada di mana-mana di repo
   ini dan bukan naskah murid. */
function stripComments(text) {
  let inBlock = false;
  return text.split('\n').map((line) => {
    let out = '', i = 0;
    while (i < line.length) {
      if (inBlock) { const e = line.indexOf('*/', i); if (e < 0) { i = line.length; } else { inBlock = false; i = e + 2; } continue; }
      const b = line.indexOf('/*', i), l = line.indexOf('//', i);
      if (b >= 0 && (l < 0 || b < l)) { out += line.slice(i, b); inBlock = true; i = b + 2; continue; }
      if (l >= 0) { if (line[l - 1] === ':') { out += line.slice(i, l + 2); i = l + 2; continue; } out += line.slice(i, l); i = line.length; continue; }
      out += line.slice(i); i = line.length;
    }
    return out;
  });
}

/* Literal yang menjadi ARGUMEN KEDUA t()/T() adalah fallback i18n — itu jalur yang benar,
   bukan kebocoran. */
function fallbackLiterals(text) {
  const out = new Set();
  const re = /\b[tT]\(\s*['"][^'"]+['"]\s*,\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(text))) out.add(m[2].replace(/\\'/g, "'").trim());
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/i18n|node_modules/.test(p)) walk(p, acc); }
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

function leaksIn(file) {
  const text = fs.readFileSync(path.join(__fzRoot, file), 'utf8');
  const fb = fallbackLiterals(text);
  const seen = new Set(), hits = [];
  stripComments(text).forEach((line, i) => {
    (line.match(/[>'"`]([^<>'"`]{5,110})[<'"`]/g) || []).forEach((raw) => {
      const s = raw.slice(1, -1).trim();
      if (!ID_WORDS.test(s) || /FiezelI18n\.t\(/.test(s) || /^[a-z0-9.\-_/]+$/.test(s) || seen.has(s) || fb.has(s)) return;
      seen.add(s);
      hits.push({ line: i + 1, text: s });
    });
  });
  return hits;
}

const files = ['app.js', ...walk(path.join(__fzRoot, 'features')).map((p) => path.relative(__fzRoot, p))];
let failed = false;
const report = { schema: 'fiezel-th-ui-leak-v1', generatedAt: new Date().toISOString(), files: {} };

for (const f of files) {
  const hits = leaksIn(f);
  const budget = ALLOWLIST[f] || 0;
  if (hits.length) report.files[f] = { leaks: hits.length, budget, sample: hits.slice(0, 5) };
  if (hits.length > budget) {
    failed = true;
    console.log(`FAIL  ${f} — ${hits.length} literal Indonesia di jalur render, anggaran ${budget}`);
    hits.slice(0, 8).forEach((h) => console.log(`        ${f}:${h.line}  ${JSON.stringify(h.text.slice(0, 80))}`));
  } else if (hits.length) {
    console.log(`PASS  ${f} — ${hits.length}/${budget} (utang yang sudah dijelaskan)`);
  }
}

/* Anggaran yang tidak lagi terpakai juga kegagalan: kalau utangnya sudah dibayar, angkanya
   harus turun, bukan tertinggal sebagai izin yang menganga. */
for (const f of Object.keys(ALLOWLIST)) {
  const actual = report.files[f] ? report.files[f].leaks : 0;
  if (actual < ALLOWLIST[f]) {
    failed = true;
    console.log(`FAIL  ${f} — anggaran ${ALLOWLIST[f]} tapi kebocorannya tinggal ${actual}. Turunkan angkanya.`);
  }
}

/* Setiap kunci id WAJIB punya padanan th — kunci tanpa th membuat murid th jatuh ke id. */
const store = { id: {}, th: {} };
const root = { FiezelI18n: { registerCopy: (l, m) => Object.assign(store[l], m) } };
for (const f of fs.readdirSync(path.join(__fzRoot, 'features/i18n')).filter((f) => /^copy-(id|th)-.*\.js$/.test(f))) {
  new Function('self', fs.readFileSync(path.join(__fzRoot, 'features/i18n', f), 'utf8'))(root);
}
const noTh = Object.keys(store.id).filter((k) => !store.th[k]);
report.copyKeys = { id: Object.keys(store.id).length, th: Object.keys(store.th).length, idTanpaTh: noTh.length };
if (noTh.length) {
  failed = true;
  console.log(`FAIL  ${noTh.length} kunci id tanpa padanan th, contoh: ${noTh.slice(0, 5).join(', ')}`);
} else {
  console.log(`PASS  ${Object.keys(store.id).length} kunci id, semuanya punya padanan th`);
}

report.pass = !failed;
fs.writeFileSync(path.join(__fzRoot, 'reports/th-ui-leak-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\nFIEZEL m025-265 kebocoran naskah Indonesia di mode Thai: ${failed ? 'FAIL' : 'PASS'}`);
if (failed) process.exitCode = 1;
