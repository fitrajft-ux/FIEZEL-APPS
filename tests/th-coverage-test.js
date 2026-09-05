#!/usr/bin/env node
/**
 * WAVE 4 · tests/th-coverage-test.js — GERBANG: CAKUPAN & KEUTUHAN SELURUH KONTEN THAI
 *
 * Audit v2, AI-07 F08 (P0): risiko rilis th terburuk adalah "kolase tiga bahasa" — layar
 * murid Thai yang mencampur Thai + Indonesia + Inggris karena satu lapisan konten bolong
 * dan diam-diam jatuh ke fallback. Fallback per-kunci memang desain yang benar untuk
 * KETAHANAN runtime (kesalahan kecil tidak mematikan sesi), tetapi ia juga desain yang
 * menyembunyikan lubang dari mata pengembang. Gerbang ini adalah mata itu: ia menghitung
 * SEMUA permukaan konten th terhadap sumber kebenarannya masing-masing dan MERAH pada
 * lubang pertama — sebelum murid th pertama melihatnya.
 *
 * Empat permukaan yang dihitung (kontrak per gelombang):
 *   1. copy-th-<domain>.js vs copy-id-<domain>.js — paritas kunci 0 selisih per domain
 *      (IMPL-BRIEF §Konvensi i18n), paritas himpunan {placeholder} per kunci, dan setiap
 *      nilai th benar-benar ber-aksara Thai (aturan pengecualian di normalizeUntukBanding).
 *      th-only yang SAH hanya 2 kunci gems (W2-INT §3: padanan id-nya FUNGSI perakit).
 *   2. naskah-th-brain.js vs tabel internal 6 modul brain — kunci 1:1 dua arah per domain
 *      (kontrak W3-BRAIN-TH: kunci = kode rationale / kunci 'brain-*.…' modul).
 *   3. grammar-explanations-th.json vs grammar-templates.json — 153/153 id template, urutan
 *      bank, kunci distraktor byte-identik dengan opsi distraktor bank (klaim W4-MERGE §1),
 *      8 bidang wajib terisi, dan semua nilai ber-aksara Thai (banding ke padanan
 *      grammar-explanations-id.json untuk pengecualian locale-netral, mis. memoryCue yang
 *      di id-nya pun paradigma Inggris murni).
 *   4. vocabulary-th.json vs vocabulary-master.json — 1765/1765 id master, tanpa entri
 *      kosong, meaning+example ber-aksara Thai (kontrak W4-MERGE §1).
 *
 * ATURAN AKSARA (kenapa bukan sekadar "wajib ada [\u0E00-\u0E7F]"): sebagian nilai memang
 * SAH tanpa Thai — placeholder murni ('{benda}{posisi}'), label teknis/Inggris yang di
 * kanon id-nya pun bukan Indonesia ('Mastery BKT', 'FIEZEL · Keep it going'), URL, autonym
 * 'Bahasa Indonesia' (byte-identik by design, lihat header copy-id-settings-locale.js).
 * Maka nilai th lolos bila: mengandung aksara Thai, ATAU setelah normalisasi (buang
 * placeholder, tag HTML, tanda baca/spasi; huruf kecil) ia IDENTIK dengan padanan id-nya
 * (= konten locale-netral yang dipindah apa adanya), ATAU normalisasinya kosong (tidak ada
 * huruf yang bisa diterjemahkan). Nilai Inggris yang di id-nya BERBAHASA INDONESIA tidak
 * pernah lolos jalur mana pun — itulah definisi operasional lubang kolase.
 *
 * Print-only: tidak menulis berkas apa pun; exit 1 bila ada FAIL.
 * ENV: FIEZEL_ROOT → root repo (default __fzRoot).
 */
'use strict';
const __fzRoot = require('path').join(__dirname, '..'); /* m025-254: berkas ini pindah dari root ke tests/. __dirname dulu BERARTI root repo, dan puluhan gerbang memakainya untuk menunjuk berkas produksi - alias ini menjaga makna itu tetap benar tanpa menyunting setiap pemakaian. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.FIEZEL_ROOT || __fzRoot;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const checks = [];
let failed = false;
const check = (name, ok, details) => {
  checks.push({ name, ok: !!ok, details: String(details == null ? '' : details) });
  if (!ok) failed = true;
};

const RE_THAI = /[\u0E00-\u0E7F]/;
const RE_PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;

/** Himpunan placeholder bernama sebuah nilai, terurut — untuk banding paritas per kunci. */
function placeholdersOf(value) {
  return (String(value).match(RE_PLACEHOLDER) || []).sort().join(',');
}

/**
 * Normalisasi untuk banding locale-netral: buang placeholder + tag HTML, sisakan hanya
 * huruf/angka (Unicode), huruf kecil. Dua nilai yang identik setelah ini membawa konten
 * terjemahan yang sama persis — beda tanda baca/kutip/spasi saja (Thai tanpa spasi kata,
 * kutip lurus vs lengkung) BUKAN lubang terjemahan.
 */
function normalizeUntukBanding(value) {
  return String(value)
    .replace(RE_PLACEHOLDER, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/** Nilai th dianggap tercakup: ber-Thai, ATAU locale-netral identik dengan id, ATAU tanpa huruf. */
function nilaiThTercakup(thValue, idValue) {
  if (RE_THAI.test(String(thValue))) return true;
  const normTh = normalizeUntukBanding(thValue);
  if (normTh === '') return true; // placeholder/markup murni — tidak ada yang diterjemahkan
  return idValue != null && normTh === normalizeUntukBanding(idValue);
}

/* ===================================== 1 · COPY-MAP ====================================== */

/*
 * PENDAFTARAN DOMAIN OTOMATIS — jangan kembalikan ke daftar yang diketik tangan.
 *
 * Dulu di sini berdiri array 15 nama hasil ketikan (W2-INT §1). Array itu memeriksa dengan
 * ketat apa yang TERCANTUM di dalamnya, dan sama sekali BUTA terhadap yang tidak. Domain
 * baru karena itu lolos hijau tanpa pernah menyentuh Thai — kecuali penulisnya ingat
 * menyunting array ini, dan tidak ada apa pun yang memaksanya ingat.
 *
 * Itu bukan kekhawatiran teoretis: `copy-id-redesign.js` (76 kunci: navigasi 4 tab, Home
 * "Hari ini", ringkasan akhir sesi, tema malam, keadaan gagal audio) lahir di m025-246,
 * dimuat di produksi lewat index.html, tidak pernah punya kembaran th, dan tidak pernah
 * masuk array ini. Gerbang cakupan Thai tetap hijau selama berbulan-bulan sementara murid
 * Thai membaca 76 kalimat itu dalam bahasa Indonesia — persis "kolase tiga bahasa" yang
 * gerbang ini dibangun untuk mencegahnya.
 *
 * Sekarang daftarnya DITEMUKAN dari isi direktori. Berkas `copy-id-<domain>.js` baru
 * otomatis menuntut `copy-th-<domain>.js`, dan sebaliknya. Tidak ada yang perlu diingat.
 */
const DOMAINS = [...new Set(fs.readdirSync(path.join(ROOT, 'features', 'i18n'))
  .map((f) => (f.match(/^copy-(?:id|th)-(.+)\.js$/) || [])[1])
  .filter(Boolean))].sort();

/*
 * UTANG YANG SUDAH ADA SEBELUM pendaftaran otomatis dinyalakan, dengan tanggal dan alasan.
 *
 * Isi daftar ini BUKAN pengecualian permanen dan bukan tempat menaruh pekerjaan baru: ia
 * catatan lubang yang sudah terlanjur ada saat pagar dipasang, supaya pagarnya bisa berdiri
 * hari ini tanpa menyandera perbaikannya. Menambah nama baru ke sini = memilih mengirim
 * layar berbahasa campur ke murid Thai. Jangan. Tulis copy-th-nya.
 *
 * Setiap nama di sini WAJIB punya alasan dan tanggal, dan hilang begitu terjemahannya ada.
 */
const UTANG_TANPA_TH = new Map([
  ['redesign', { sejak: '2026-09-05', kunci: 76, catatan: 'm025-246 gelombang penyederhanaan pengalaman; terjemahan th menunggu peninjauan penutur Thai' }]
]);

/*
 * Utang PER-KUNCI: domain yang kembarannya ADA tetapi beberapa kunci th-nya belum ditulis.
 * Ditemukan oleh pendaftaran otomatis yang sama — domain `student` tidak pernah terukur
 * sebelumnya karena ia mendaftar lewat overrideCopy, pintu yang dulu tidak disediakan stub.
 * Aturannya identik dengan UTANG_TANPA_TH: bukan tempat pekerjaan baru, wajib bertanggal,
 * dan hilang begitu kuncinya ditulis.
 */
const UTANG_KUNCI = new Map([
  ['student', { sejak: '2026-09-05', kunci: new Set(['grammar.materi-new-memiliki-item-valid', 'fsl.exam-format-kicker']), catatan: 'terjemahan th menunggu peninjauan penutur Thai' }]
]);
// th-only yang SAH (W2-INT §3): padanan id kedua kunci ini adalah fungsi perakit
// (chipAria/streakToast) di gems-core.js — mendaftarkannya di copy-id = kalimat id BARU
// di mata gerbang emas. Selain dua ini, kunci th tanpa pasangan id = lubang kontrak.
const TH_ONLY_SAH = new Set(['gems.chip-aria', 'gems.streak-toast']);

/**
 * Muat copy-map lewat vm dengan stub FiezelI18n yang MENANGKAP registerCopy — bukan regex
 * atas sumber, supaya yang dihitung adalah peta yang benar-benar terdaftar di runtime.
 * Konteks memasang stub di TIGA jalan masuk yang dipakai berkas-berkas copy hari ini:
 * global bare (copy-id-settings-locale), self.FiezelI18n (mayoritas), globalThis.
 * require sengaja TIDAK disediakan: cabang require di copy-id-feat-b tidak boleh menyeret
 * runtime i18n sungguhan ke pengukuran.
 */
function muatCopyMap(relPath) {
  const tangkapan = [];
  /*
   * DUA pintu masuk, bukan satu. Sebagian domain mendaftar lewat registerCopy (kunci baru),
   * sebagian lagi lewat overrideCopy (menimpa kalimat yang sudah ada) — copy-*-student.js
   * memakai yang kedua, dan MENYERAH lebih awal bila overrideCopy tidak ada. Selama stub ini
   * hanya menyediakan registerCopy, domain student memuat nol kunci dan lolos tanpa diukur;
   * daftar domain yang diketik tangan menyembunyikannya karena 'student' memang tidak
   * tercantum di sana. Stub wajib menyediakan setiap pintu yang dipakai berkas copy.
   */
  const stub = {
    registerCopy: (locale, map) => { tangkapan.push([String(locale), map || {}]); },
    overrideCopy: (locale, map) => { tangkapan.push([String(locale), map || {}]); },
    t: (k) => String(k),
    getLocale: () => 'id'
  };
  const sandbox = { FiezelI18n: stub, console };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInContext(read(relPath), vm.createContext(sandbox), { filename: relPath });
  return tangkapan;
}

check('copy: ada domain yang ditemukan di features/i18n', DOMAINS.length > 0, DOMAINS.length + ' domain: ' + DOMAINS.join(', '));

/* Utang yang sudah lunas harus DICORET dari daftarnya, bukan dibiarkan menumpuk sebagai
   pengecualian mati yang diam-diam melonggarkan gerbang untuk domain lain kelak. */
for (const [domain, info] of UTANG_TANPA_TH) {
  const adaTh = fs.existsSync(path.join(ROOT, 'features', 'i18n', 'copy-th-' + domain + '.js'));
  check('copy ' + domain + ': masih terdaftar sebagai utang, jadi copy-th-nya memang belum ada',
    !adaTh, adaTh ? 'copy-th-' + domain + '.js SUDAH ada — hapus "' + domain + '" dari UTANG_TANPA_TH' : 'utang sejak ' + info.sejak);
}

for (const domain of DOMAINS) {
  const idPath = 'features/i18n/copy-id-' + domain + '.js';
  const thPath = 'features/i18n/copy-th-' + domain + '.js';
  const adaId = fs.existsSync(path.join(ROOT, idPath));
  const adaTh = fs.existsSync(path.join(ROOT, thPath));
  const utang = UTANG_TANPA_TH.get(domain);
  if (utang && adaId && !adaTh) {
    /* Lubang yang SUDAH tercatat: dilaporkan tiap jalan supaya tidak pernah hilang dari
       pandangan, tetapi tidak memerahkan gerbang — pagar untuk domain lain tetap berdiri. */
    console.log('UTANG copy ' + domain + ': tanpa copy-th (' + utang.kunci + ' kunci, sejak ' +
      utang.sejak + ') — ' + utang.catatan);
    continue;
  }
  check('copy ' + domain + ': kedua berkas ada (id DAN th)', adaId && adaTh,
    (adaId ? '' : 'copy-id-' + domain + '.js hilang; ') + (adaTh ? '' : 'copy-th-' + domain + '.js hilang'));
  if (!adaId || !adaTh) continue;

  const idReg = muatCopyMap(idPath);
  const thReg = muatCopyMap(thPath);
  check('copy ' + domain + ': copy-id mendaftar ke locale id saja',
    idReg.length > 0 && idReg.every((r) => r[0] === 'id'), JSON.stringify(idReg.map((r) => r[0])));
  check('copy ' + domain + ': copy-th mendaftar ke locale th saja',
    thReg.length > 0 && thReg.every((r) => r[0] === 'th'), JSON.stringify(thReg.map((r) => r[0])));

  const idMap = Object.assign({}, ...idReg.map((r) => r[1]));
  const thMap = Object.assign({}, ...thReg.map((r) => r[1]));
  const kunciId = Object.keys(idMap);
  const kunciTh = Object.keys(thMap);

  const semuaHilang = kunciId.filter((k) => !(k in thMap));
  const utangKunci = UTANG_KUNCI.get(domain);
  const dimaafkan = semuaHilang.filter((k) => utangKunci && utangKunci.kunci.has(k));
  const hilang = semuaHilang.filter((k) => !dimaafkan.includes(k));
  if (dimaafkan.length) {
    console.log('UTANG copy ' + domain + ': ' + dimaafkan.length + ' kunci tanpa th (sejak ' +
      utangKunci.sejak + ') — ' + dimaafkan.join(', ') + ' — ' + utangKunci.catatan);
  }
  check('copy ' + domain + ': paritas kunci id→th 0 selisih (' + kunciId.length + ' kunci id)',
    hilang.length === 0, hilang.length + ' kunci id tanpa padanan th: ' + hilang.slice(0, 8).join(', '));
  /* Utang yang sudah lunas wajib dicoret, sama seperti UTANG_TANPA_TH. */
  if (utangKunci) {
    const lunas = [...utangKunci.kunci].filter((k) => k in thMap);
    check('copy ' + domain + ': daftar UTANG_KUNCI tidak memuat kunci yang sudah diterjemahkan',
      lunas.length === 0, lunas.length ? 'sudah ada di th, hapus dari UTANG_KUNCI: ' + lunas.join(', ') : 'bersih');
  }

  const liar = kunciTh.filter((k) => !(k in idMap) && !TH_ONLY_SAH.has(k));
  check('copy ' + domain + ': tanpa kunci th liar di luar 2 th-only gems yang sah',
    liar.length === 0, liar.slice(0, 8).join(', '));

  const placeholderBeda = [];
  const tanpaThai = [];
  const kosong = [];
  for (const k of kunciTh) {
    const vTh = thMap[k];
    if (typeof vTh !== 'string' || vTh.trim() === '') { kosong.push(k); continue; }
    const vId = (k in idMap) ? idMap[k] : null;
    if (vId != null && placeholdersOf(vId) !== placeholdersOf(vTh)) {
      placeholderBeda.push(k + ' id[' + placeholdersOf(vId) + '] th[' + placeholdersOf(vTh) + ']');
    }
    if (!nilaiThTercakup(vTh, vId)) tanpaThai.push(k + ' = "' + String(vTh).slice(0, 60) + '"');
  }
  check('copy ' + domain + ': tanpa nilai th kosong', kosong.length === 0, kosong.slice(0, 8).join(', '));
  check('copy ' + domain + ': paritas himpunan {placeholder} per kunci 0 selisih',
    placeholderBeda.length === 0, placeholderBeda.slice(0, 8).join(' | '));
  check('copy ' + domain + ': semua nilai th ber-aksara Thai (atau locale-netral identik id)',
    tanpaThai.length === 0, tanpaThai.slice(0, 8).join(' | '));
}

/* ============================== 2 · NASKAH BRAIN (naskah-th-brain.js) ==================== */

// Kunci naskah th WAJIB 1:1 dengan tabel internal modulnya (kontrak W3-BRAIN-TH §1):
// listening/speaking per KODE rationale brain3_*, step/tutor/olm/srl per kunci 'brain-*.…'.
// Tabel modul tidak diekspor (modul brain MURNI, AI-08 F01), jadi sumber kebenarannya
// dibaca dari sumber modul dengan pola kunci masing-masing — pendekatan yang sama dengan
// skrip verifikasi W3-BRAIN-TH.
const NASKAH_TH = require(path.join(ROOT, 'features/i18n/naskah-th-brain.js'));
const TABEL_MODUL = {
  listening: ['features/brain/fiezel-listening-adaptive.js', /brain3_listening_[a-z0-9_]+/g],
  speaking: ['features/brain/fiezel-speaking-adaptive.js', /brain3_speaking_[a-z0-9_]+/g],
  step: ['features/brain/fiezel-step-tutor.js', /brain-step\.[a-z0-9-]+/g],
  tutor: ['features/brain/fiezel-tutor-brain.js', /brain-tutor\.[a-z0-9-]+/g],
  olm: ['features/brain/fiezel-olm.js', /brain-olm\.[a-z0-9-]+/g],
  srl: ['features/brain/fiezel-srl-coach.js', /brain-srl\.[a-z0-9-]+/g]
};

check('naskah: peta punya persis 6 domain modul brain',
  Object.keys(NASKAH_TH).sort().join(',') === Object.keys(TABEL_MODUL).sort().join(','),
  Object.keys(NASKAH_TH).join(','));

for (const [domain, [modulPath, re]] of Object.entries(TABEL_MODUL)) {
  const kunciModul = new Set(read(modulPath).match(re) || []);
  const peta = NASKAH_TH[domain] || {};
  const kunciNaskah = new Set(Object.keys(peta));
  const hilang = [...kunciModul].filter((k) => !kunciNaskah.has(k));
  const liar = [...kunciNaskah].filter((k) => !kunciModul.has(k));
  check('naskah ' + domain + ': paritas kunci vs tabel modul 0 selisih (' + kunciModul.size + ' kunci)',
    kunciModul.size > 0 && hilang.length === 0 && liar.length === 0,
    'hilang: [' + hilang.join(', ') + '] liar: [' + liar.join(', ') + ']');
  const bermasalah = Object.entries(peta)
    .filter(([, v]) => typeof v !== 'string' || v.trim() === '' || !RE_THAI.test(v))
    .map(([k]) => k);
  check('naskah ' + domain + ': semua nilai terisi dan ber-aksara Thai',
    bermasalah.length === 0, bermasalah.slice(0, 8).join(', '));
}

/* ========================= 3 · GRAMMAR (grammar-explanations-th.json) ==================== */

const bank = readJson('grammar-templates.json');
const grammarTh = readJson('grammar-explanations-th.json');
const grammarId = readJson('grammar-explanations-id.json');

check('grammar: skema & status DRAFT AI ada di header',
  grammarTh.schema === 'fiezel-grammar-explanations-th-v1' && /DRAFT AI/.test(String(grammarTh.status)),
  grammarTh.schema + ' / ' + String(grammarTh.status).slice(0, 40));

const bankIds = bank.templates.map((t) => t.id);
const thIds = Object.keys(grammarTh.templates || {});
// m025-190: pin 153 diikat ke jumlah deklarasi bank (lantai 153, gen2 = 179) — pola
// preseden a11abc3: paritas penuh + urutan tetap wajib, angka mati diganti kontrak.
check('grammar: paritas penuh id template vs bank (lantai 153), urut bank, tanpa selisih',
  bankIds.length >= 153 && thIds.length === bankIds.length && bankIds.join('|') === thIds.join('|'),
  'bank=' + bankIds.length + ' th=' + thIds.length);

const BIDANG_WAJIB = ['objective', 'misconception', 'reasoning', 'rule', 'whyCorrect', 'whyOthersFail', 'howToAvoid', 'memoryCue'];
{
  const bidangKosong = [];
  const bidangTanpaThai = [];
  const distraktorBeda = [];
  const distraktorBolong = [];
  for (const t of bank.templates) {
    const e = (grammarTh.templates || {})[t.id];
    if (!e) continue; // sudah tertangkap pemeriksaan 153/153
    const eId = (grammarId.templates || {})[t.id] || {};
    for (const f of BIDANG_WAJIB) {
      const v = e[f];
      if (typeof v !== 'string' || v.trim() === '') { bidangKosong.push(t.id + '.' + f); continue; }
      if (!nilaiThTercakup(v, eId[f])) bidangTanpaThai.push(t.id + '.' + f + ' = "' + v.slice(0, 50) + '"');
    }
    // Kunci distraktor WAJIB byte-identik dengan opsi distraktor bank (klaim W4-MERGE §1):
    // kunci yang meleset satu byte = penjelasan yang tidak pernah ditemukan runtime
    // (pola bug lama m025-129, lihat komentar app.js sekitar hidrasi distractors).
    const opsiBank = (t.distractors || []).map((d) => String(d.option)).sort();
    const opsiTh = Object.keys(e.distractors || {}).sort();
    if (opsiBank.join('\u0000') !== opsiTh.join('\u0000')) {
      distraktorBeda.push(t.id + ' bank[' + opsiBank.join(', ') + '] th[' + opsiTh.join(', ') + ']');
    }
    const dId = eId.distractors || {};
    for (const [opsi, d] of Object.entries(e.distractors || {})) {
      for (const f of ['misconception', 'whyFails']) {
        const v = d && d[f];
        if (typeof v !== 'string' || v.trim() === '') { bidangKosong.push(t.id + '.distractors[' + opsi + '].' + f); continue; }
        if (!nilaiThTercakup(v, dId[opsi] && dId[opsi][f])) {
          distraktorBolong.push(t.id + '.distractors[' + opsi + '].' + f + ' = "' + v.slice(0, 50) + '"');
        }
      }
    }
  }
  check('grammar: 8 bidang wajib + bidang distraktor semuanya terisi', bidangKosong.length === 0,
    bidangKosong.slice(0, 8).join(', '));
  check('grammar: semua bidang penjelasan ber-aksara Thai (atau locale-netral identik id)',
    bidangTanpaThai.length === 0, bidangTanpaThai.slice(0, 8).join(' | '));
  check('grammar: kunci distraktor byte-identik dengan opsi distraktor bank di 153 template',
    distraktorBeda.length === 0, distraktorBeda.slice(0, 5).join(' | '));
  check('grammar: nilai distraktor (misconception+whyFails) ber-aksara Thai — anti kolase tiga bahasa (AI-07 F08)',
    distraktorBolong.length === 0,
    distraktorBolong.length + ' nilai Inggris/non-Thai, contoh: ' + distraktorBolong.slice(0, 5).join(' | '));
}

/* ============================ 4 · VOCABULARY (vocabulary-th.json) ======================== */

const vocabTh = readJson('vocabulary-th.json');
const vocabMaster = readJson('vocabulary-master.json');

check('vocab: skema & status DRAFT AI ada di header',
  vocabTh.schema === 'fiezel-vocabulary-th-v1' && /DRAFT AI/.test(String(vocabTh.status)),
  vocabTh.schema + ' / ' + String(vocabTh.status).slice(0, 40));

{
  const idMaster = new Set(vocabMaster.map((e) => String(e.id)));
  const entri = vocabTh.entries || {};
  const kunciTh = Object.keys(entri);
  const hilang = [...idMaster].filter((k) => !(k in entri));
  const liar = kunciTh.filter((k) => !idMaster.has(k));
  check('vocab: ' + idMaster.size + '/' + idMaster.size + ' id master tercakup, tanpa entri liar',
    idMaster.size >= 1765 && kunciTh.length === idMaster.size && hilang.length === 0 && liar.length === 0 && Number(vocabTh.count) === kunciTh.length,
    'master=' + idMaster.size + ' th=' + kunciTh.length + ' hilang=' + hilang.length + ' liar=' + liar.length);

  const kosong = [];
  const tanpaThai = [];
  for (const [k, e] of Object.entries(entri)) {
    const meaning = e && e.meaning;
    const example = e && e.example;
    if (typeof meaning !== 'string' || meaning.trim() === '' || typeof example !== 'string' || example.trim() === '') {
      kosong.push(k); continue;
    }
    // meaning & example WAJIB Thai polos: keduanya kalimat terjemahan penuh (bukan label
    // teknis), jadi tidak memakai jalur pengecualian locale-netral copy-map.
    if (!RE_THAI.test(meaning) || !RE_THAI.test(example)) tanpaThai.push(k);
  }
  check('vocab: tanpa entri kosong (meaning+example terisi)', kosong.length === 0, kosong.slice(0, 8).join(', '));
  check('vocab: semua meaning+example ber-aksara Thai', tanpaThai.length === 0, tanpaThai.slice(0, 8).join(', '));
}

/* ======================================== Laporan ======================================== */

let pass = 0;
for (const c of checks) {
  if (c.ok) pass += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok || !c.details ? '' : `\n      → ${c.details}`}`);
}
console.log(`\nth-coverage-test: ${pass}/${checks.length} PASS${failed ? ' — GAGAL (ada lubang cakupan th — jangan rilis th sebelum hijau)' : ''}`);
process.exit(failed ? 1 : 0);
