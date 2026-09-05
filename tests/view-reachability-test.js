'use strict';
const __fzRoot = require('path').join(__dirname, '..');
/**
 * tests/view-reachability-test.js — gerbang LAYAR YATIM.
 *
 * Sebuah nama di VALID_VIEWS (app.js) berarti go() menerimanya dan renderInner() menggambar
 * sesuatu untuknya. Itu TIDAK berarti murid bisa sampai ke sana: kalau tidak ada satu pun
 * tombol/tautan yang memanggil go('<view>'), layar itu hidup, lolos semua gerbang lain, dan
 * tidak pernah dilihat siapa pun.
 *
 * Kelas bug ini sudah memakan korban: m025-254 mengganti tombol "Tanya FIEZEL" di topbar
 * dengan lonceng notifikasi. Komentar index.html berjanji "askView tetap ada; aksesnya lewat
 * pembimbing PAW" - tapi tidak ada kode yang menepatinya. Layar Tanya FIEZEL (indeks materi
 * lokal + jawaban AI, features/search/fiezel-search.js) yatim sebelas build sampai m025-266,
 * dan tests/search-feedback-test.js tetap hijau sepanjang waktu itu karena yang dijaganya
 * hanyalah "rute terdaftar" dan "rute menggambar sesuatu".
 *
 * Yang dijaga di sini: SETIAP view di VALID_VIEWS harus punya minimal satu PINTU - pemanggilan
 * go('<view>') di kode produksi (index.html, app.js, features/**) di luar komentar.
 *
 * TIDAK ADA DAFTAR YANG DIKETIK TANGAN di berkas ini. Tiga hal ditemukan dari kode:
 *   1. Daftar view: dibaca dari literal VALID_VIEWS di app.js.
 *   2. Kelompok alias: dibaca dari renderInner(). Dua view yang digambar oleh FUNGSI YANG
 *      SAMA (`state.view==='ask'||state.view==='search')askView()`, atau
 *      `skillsLab('listening')` vs `skillsLab()`) adalah satu layar dengan beberapa nama -
 *      cukup salah satu namanya berpintu. Ini yang membuat rute lama seperti 'search',
 *      'profile', 'listening' tetap sah untuk back-nav tanpa menuntut tombolnya sendiri
 *      (m025-246: "rute lama tetap sah ... menghapus satu nama akan membuat go() menampilkan
 *      toast pada perjalanan yang benar-benar valid").
 *   3. Pintu: dipindai dari semua berkas produksi, bukan dari daftar berkas.
 *
 * Pembuktian: gerbang ini MERAH pada main sebelum m025-266 (kelompok ask/search: 0 pintu)
 * dan hijau sesudahnya. Kalau suatu hari kamu menghapus pintu terakhir sebuah view, ia
 * merah lagi - dan itulah gunanya.
 */
const fs = require('fs');
const path = require('path');

const results = []; let failures = 0;
function assert(c, m) { results.push({ ok: !!c, message: m }); if (!c) failures += 1; }

function read(rel) { return fs.readFileSync(path.join(__fzRoot, rel), 'utf8'); }

// Komentar bukan pintu. Blok komentar dan baris yang seluruhnya // dibuang; komentar // di
// ujung baris kode SENGAJA dibiarkan, karena app.js padat dan 'https://' di dalam string
// akan ikut terpotong kalau kita memotong setiap '//'.
function stripJs(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
}
function stripHtml(src) { return src.replace(/<!--[\s\S]*?-->/g, ' '); }

/* ----------------------------------------------------------- (1) daftar view dari app.js -- */
const appSrc = read('app.js');
const validMatch = appSrc.match(/const VALID_VIEWS=new Set\(\[([^\]]*)\]\)/);
assert(validMatch, 'literal VALID_VIEWS ditemukan di app.js (kalau bentuknya berubah, perbarui pola di gerbang ini, jangan hapus gerbangnya)');
const views = validMatch ? [...validMatch[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]) : [];
assert(views.length >= 10, 'VALID_VIEWS terbaca berisi >= 10 view (terbaca ' + views.length + ')');

/* ------------------------------------------------ (2) kelompok alias dari renderInner() --- */
const renderStart = appSrc.indexOf('function renderInner(){');
assert(renderStart !== -1, 'renderInner() ditemukan di app.js');
const renderBody = renderStart === -1 ? '' : stripJs(appSrc.slice(renderStart, appSrc.indexOf('\n', renderStart)));
const rendererOf = {};
for (const m of renderBody.matchAll(/if\(((?:state\.view==='[a-z-]+'(?:\|\|)?)+)\)([A-Za-z_$][\w$]*)\(/g)) {
  const names = [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  for (const n of names) rendererOf[n] = m[2];
}
for (const v of views) {
  assert(rendererOf[v], 'view "' + v + '" digambar oleh sebuah fungsi di renderInner() (kalau tidak, ia terdaftar tapi kosong)');
}
const groups = {};
for (const v of views) {
  const key = rendererOf[v] || ('__solo__' + v);
  (groups[key] = groups[key] || []).push(v);
}

/* ------------------------------------------------------- (3) pintu dari berkas produksi --- */
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const productionFiles = [path.join(__fzRoot, 'index.html'), path.join(__fzRoot, 'app.js')]
  .concat(walk(path.join(__fzRoot, 'features'), []));

/** view -> [ 'berkas:baris', ... ]
 *  Dua bentuk pintu, keduanya nyata di kode ini:
 *   (a) go('<view>') literal - nav bar, kartu hub, tautan dalam layar, callback modul.
 *   (b) properti objek view:'<view>' - kartu berbasis data (latihanCards(), skillHub di
 *       home(), indeks pencarian) yang templatnya memanggil go('${c.view}'). Tanpa bentuk
 *       ini 'writing' terbaca yatim padahal kartunya ada di tab Latihan dan hub Home. */
const doors = {};
const goCalls = {}; /* hanya bentuk (a) - dipakai pemeriksaan arah balik di bawah */
const DOOR_PATTERNS = [
  /\bgo\(\s*(?:\\?["'])([a-z-]+)(?:\\?["'])/g,
  /[{,\s]view\s*:\s*'([a-z-]+)'/g
];
for (const file of productionFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = file.endsWith('.html') ? stripHtml(raw) : stripJs(raw);
  src.split('\n').forEach((line, i) => {
    DOOR_PATTERNS.forEach((re, idx) => {
      for (const m of line.matchAll(re)) {
        const at = path.relative(__fzRoot, file) + ':' + (i + 1);
        (doors[m[1]] = doors[m[1]] || []).push(at);
        if (idx === 0) (goCalls[m[1]] = goCalls[m[1]] || []).push(at);
      }
    });
  });
}

for (const [renderer, members] of Object.entries(groups)) {
  const found = members.flatMap((v) => (doors[v] || []).map((at) => v + ' <- ' + at));
  const label = members.length > 1 ? members.join('/') + ' (' + renderer + '())' : members[0];
  assert(found.length > 0,
    'layar ' + label + ' punya pintu: go(\'<view>\') atau view:\'<view>\' di index.html/app.js/features/** di luar komentar' +
    (found.length ? ' [' + found.length + ' pintu, mis. ' + found[0] + ']' : ' [0 pintu - LAYAR YATIM]'));
}

/* Pintu yang menunjuk ke nama yang TIDAK ada di VALID_VIEWS = tombol yang selalu berakhir di
 * toast "halaman tak tersedia". Sisi lain dari bug yang sama. Hanya bentuk (a) yang diperiksa:
 * properti view:'…' juga dipakai modul lain untuk ruang nama view-nya sendiri (Ruang Guru:
 * 'briefing', 'insights', 'hub') dan itu bukan pemanggilan go() app.js. */
for (const [target, where] of Object.entries(goCalls)) {
  assert(views.includes(target), 'go(\'' + target + '\') menuju view yang terdaftar di VALID_VIEWS [' + where[0] + (where.length > 1 ? ' +' + (where.length - 1) : '') + ']');
}

for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.message);
console.log(`\nview-reachability: ${results.length - failures}/${results.length} lulus; ${Object.keys(groups).length} layar, ${views.length} nama view`);
if (failures) process.exit(1);
