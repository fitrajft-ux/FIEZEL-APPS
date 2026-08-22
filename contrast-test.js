/**
 * FIEZEL m025-85 — kontras universal. Laporan OWNER:
 *
 *   "coba kamu masuk ke menu os nya, banyak tulisan yang ga terbaca karena warna tulisan
 *    dan background sama. aku rasa itu bug lain, aku ingin kamu scan keseluruhan aplikasi
 *    universally"
 *
 * Bukan satu bug, melainkan tiga sistem warna yang bertabrakan dan mode gelap kalah di
 * dua di antaranya (lihat FIEZEL-M02585-KONTRAS-DAN-SWIPEBACK-HANDOFF.md):
 *
 *   A. style.css `button{color:var(--text);background:#fff}` - latarnya dipaku putih dan
 *      tidak pernah ikut tema, sementara teksnya ikut. Di mode gelap: #fdf4f6 di atas
 *      #ffffff = 1,08:1, dan ikon Lucide di dalamnya (currentColor) ikut hilang. 85 dari
 *      123 tombol aplikasi kena, termasuk seluruh tombol modal Pengaturan.
 *   B. features/tutor-classroom/fiezel-tutor-v3.js memanggil installBrowser() tanpa syarat,
 *      yang memasang kelas `fiezel-ui-v6` pada <html>. Akibatnya SETIAP aturan
 *      `html.fiezel-ui-v6` di tutor-v3.css berlaku se-aplikasi - termasuk
 *      `body{background:...var(--ui-bg)}` dengan --ui-bg:#f3f6fb, yang menimpa permanen
 *      `body{background:var(--sky-bottom)}` milik tema.
 *   C. blok `.scene-*` dipasang pada <body>, palet gelap dipasang pada <html>. Untuk isi
 *      body, nilai milik body yang diwarisi - spesifisitas tidak ikut bicara - jadi 12
 *      token kaca/ambient versi gelap tidak pernah berlaku dan .scene-day memasang kaca
 *      PUTIH di mode gelap.
 *
 * Berkas ini menjaga ketiganya tanpa browser: dua stylesheet diurai, custom property
 * diresolusikan untuk kedua tema, lalu rasio WCAG dihitung untuk daftar pasangan
 * (teks, latar) yang benar-benar ada di layar. Yang penting bukan hanya angkanya:
 * pemeriksaan terakhir mengunci INVARIANNYA - tidak boleh ada aturan se-aplikasi yang
 * mengambil `color` dari token tema sambil memaku `background` ke literal terang. Itulah
 * bentuk persis dari akar A, dan tanpa gerbang itu bug yang sama bisa masuk lagi lewat
 * satu baris CSS baru tanpa satu pun tes memerah.
 *
 * Lingkup: keempat kombinasi tema x fase kini diuji - terang/siang, gelap/siang,
 * gelap/malam, dan (sejak m025-113) terang/malam.
 *
 * m025-113: kombinasi terang + malam dulu sengaja dikecualikan dengan alasan
 * "memperbaikinya berarti mengubah tampilan mode terang". Harganya ditagih OWNER pada
 * 22 Agustus 2026 pukul 22.00: seluruh kartu modul di Home memakai latar terang milik
 * lapisan v6 sementara tintanya --glass-text yang menjadi TERANG pada .scene-night -
 * 1,05:1, judulnya benar-benar tidak terbaca, dan tidak satu pun tes memerah. Sejak
 * m025-113 permukaan dan tinta selalu diambil dari keluarga yang sama (kaca dengan kaca,
 * tema dengan tema), tanah halaman ikut fase langit di kedua tema, dan aksen yang duduk
 * di atas kaca punya tokennya sendiri: --accent-on-glass.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const SOURCE = {
  style: fs.readFileSync(path.join(root, 'style.css'), 'utf8'),
  tutor: fs.readFileSync(path.join(root, 'features', 'tutor-classroom', 'tutor-v3.css'), 'utf8')
};

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok - ' + name); }
  catch (e) { failures++; console.error('FAIL - ' + name + '\n    ' + (e && e.message)); }
}

/* ------------------------------------------------------------------ *
 * Pengurai CSS seadanya - cukup untuk berkas ini, tanpa dependensi
 * ------------------------------------------------------------------ */

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

function parseDecls(body) {
  const out = [];
  let depth = 0, buf = '';
  const push = chunk => {
    const t = chunk.trim();
    if (!t) return;
    const k = t.indexOf(':');
    if (k < 0) return;
    out.push({ prop: t.slice(0, k).trim().toLowerCase(), value: t.slice(k + 1).trim() });
  };
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { push(buf); buf = ''; } else buf += ch;
  }
  push(buf);
  return out;
}

// @media dimasuki secara rekursif; @keyframes/@font-face dilewati supaya "0%{}" tidak
// pernah terbaca sebagai selektor.
function parseRules(css, media, out) {
  out = out || [];
  media = media || '';
  let i = 0, buf = '';
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      let depth = 1, j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const body = css.slice(i + 1, j - 1);
      if (prelude.startsWith('@')) {
        if (/^@(media|supports)\b/i.test(prelude)) {
          parseRules(body, media ? media + ' && ' + prelude : prelude, out);
        }
      } else if (prelude) {
        out.push({ selector: prelude, media, decls: parseDecls(body) });
      }
      i = j;
      continue;
    }
    if (ch === '}') { buf = ''; i++; continue; }
    buf += ch;
    i++;
  }
  return out;
}

const norm = sel => String(sel).replace(/\s+/g, ' ').trim();
const RULES = {
  style: parseRules(stripComments(SOURCE.style)),
  tutor: parseRules(stripComments(SOURCE.tutor))
};

/* ------------------------------------------------------------------ *
 * Resolusi custom property
 * ------------------------------------------------------------------ */

// Kumpulkan seluruh deklarasi --x dari setiap aturan yang selektornya cocok, dalam urutan
// sumber; yang belakangan menang, persis seperti cascade untuk spesifisitas yang sama.
function collectVars(file, match) {
  const bag = {};
  for (const r of RULES[file]) {
    if (!match(norm(r.selector), r.media)) continue;
    for (const d of r.decls) if (d.prop.startsWith('--')) bag[d.prop] = d.value;
  }
  return bag;
}

const eq = want => (sel, media) => !media && sel === want;

// Rantai pewarisan nyata: :root (html) -> html.fiezel-ui-v6 -> penimpaan tema pada html
// -> blok .scene-* pada body. Blok scene ditaruh PALING AKHIR karena ia hidup di <body>:
// apa pun yang diwarisi isi body mengambil nilai body, bukan nilai html - itulah akar C.
function themeVars(theme, scene) {
  const chain = [
    () => collectVars('style', eq(':root')),
    () => collectVars('tutor', eq('html.fiezel-ui-v6'))
  ];
  if (theme === 'dark') {
    chain.push(() => collectVars('style', eq(':root[data-theme="dark"]')));
    chain.push(() => collectVars('tutor', eq(':root[data-theme="dark"].fiezel-ui-v6')));
  }
  if (scene === 'night') {
    chain.push(() => collectVars('style', eq('.scene-night')));
  } else {
    chain.push(() => collectVars('style', eq('.scene-day,.scene-dawn')));
    if (theme === 'dark') {
      chain.push(() => collectVars('style', (sel, media) =>
        !media && sel.startsWith(':root[data-theme="dark"] body.scene-day')));
    }
  }
  const bag = {};
  for (const step of chain) Object.assign(bag, step());
  return bag;
}

function resolveValue(value, vars) {
  let v = String(value);
  let guard = 0;
  while (v.indexOf('var(') >= 0 && guard++ < 60) {
    const next = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/,
      (m, name, fb) => {
        if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
        return fb === undefined ? 'transparent' : String(fb).trim();
      });
    if (next === v) break;
    v = next;
  }
  return v.trim();
}

/* ------------------------------------------------------------------ *
 * Warna, komposit, dan rasio WCAG
 * ------------------------------------------------------------------ */

function parseColor(input) {
  const v = String(input).trim().toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) {
    const [x, y, z] = m[1].split('');
    return { r: parseInt(x + x, 16), g: parseInt(y + y, 16), b: parseInt(z + z, 16), a: 1 };
  }
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
      a: 1
    };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (m) {
    return {
      r: Number(m[1]), g: Number(m[2]), b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4])
    };
  }
  return null;
}

// Semua literal warna di dalam sebuah nilai (termasuk setiap stop gradien).
const COLOR_TOKEN = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^()]*\)/g;
function colorStops(value) {
  const v = String(value);
  const direct = parseColor(v);
  if (direct) return [direct];
  const found = (v.match(COLOR_TOKEN) || []).map(parseColor).filter(Boolean);
  return found;
}

// Untuk pemeriksaan invarian: hanya literal yang benar-benar DIPAKU yang dihitung.
// var(--panel,#fff) bukan literal terang - #fff cuma cadangan kalau tokennya hilang, dan
// rgba(var(--surface-rgb),.9) hanya berisi token. Seluruh ekspresi var() dibuang dulu.
function literalStops(value) {
  let v = String(value), guard = 0;
  while (/var\([^()]*\)/.test(v) && guard++ < 20) v = v.replace(/var\([^()]*\)/g, '');
  return colorStops(v);
}

const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1
});

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
const luminance = c => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = c => '#' + [c.r, c.g, c.b]
  .map(x => Math.round(x).toString(16).padStart(2, '0')).join('');

/* ------------------------------------------------------------------ *
 * Latar halaman: --ui-bg dengan lapisan .global-sky di atasnya
 * ------------------------------------------------------------------ */

// app.js menulis --sky-top/--sky-bottom sebagai INLINE STYLE dari jam perangkat saja,
// tidak pernah dari tema. Jadi warna langit tidak bisa dibaca dari CSS - yang dipakai di
// sini adalah kasus TERBURUK yang bisa ditulis app.js (putih penuh saat siang) pada
// opasitas lapisan yang memang tertulis di CSS. Dua tint radial pada body sengaja
// diabaikan: keduanya <= 18% dan tidak bisa membalik satu pun pasangan di bawah.
const SKY = { day: '#ffffff', night: '#0d0710' };

function skyOpacity(theme, scene) {
  let value = null;
  for (const r of RULES.tutor) {
    if (norm(r.selector) === 'html.fiezel-ui-v6 .global-sky' && !r.media) {
      for (const d of r.decls) if (d.prop === 'opacity') value = Number(d.value);
    }
  }
  if (theme === 'dark') {
    for (const r of RULES.style) {
      if (norm(r.selector) === ':root[data-theme="dark"] .global-sky' && !r.media) {
        for (const d of r.decls) if (d.prop === 'opacity') value = Number(d.value);
      }
    }
  }
  // m025-113: tema TERANG pada fase senja/malam. Sebelum rilis ini kombinasi itu tidak
  // pernah diukur, dan di sanalah tanah halaman berhenti di abu-abu tengah: langit gelap
  // pada .58 di atas --ui-bg terang. Sekarang langitnya memang menjadi tanahnya, jadi
  // opasitas itu ikut dibaca dari CSS - bukan diasumsikan.
  if (theme === 'light' && scene === 'night') {
    const want = ':root[data-theme="light"] body.scene-night .global-sky';
    for (const r of RULES.style) {
      if (r.media) continue;
      const parts = norm(r.selector).split(',').map(x => x.trim());
      if (!parts.includes(want)) continue;
      for (const d of r.decls) if (d.prop === 'opacity') value = Number(d.value);
    }
  }
  return value;
}

function pageBase(theme, scene) {
  const vars = themeVars(theme, scene);
  const base = parseColor(resolveValue('var(--ui-bg)', vars));
  const sky = parseColor(SKY[scene]);
  sky.a = skyOpacity(theme, scene);
  return over(sky, base);
}


/* ------------------------------------------------------------------ *
 * Nilai latar diambil dari DEKLARASI yang benar-benar menang di berkas,
 * bukan ditulis ulang di sini. Kalau tidak, mengembalikan
 * `button{background:#fff}` tidak akan memerahkan satu pun pasangan.
 * ------------------------------------------------------------------ */

// Selektor yang dipakai di bawah semuanya sederajat spesifisitasnya, jadi urutan sumber
// adalah aturan yang benar: deklarasi terakhir yang menyebut selektor itu yang menang.
function declared(file, token, prop) {
  let value = null;
  for (const r of RULES[file]) {
    if (r.media) continue;
    const parts = norm(r.selector).split(',').map(x => x.trim());
    if (!parts.includes(token)) continue;
    for (const d of r.decls) if (d.prop === prop) value = d.value;
  }
  return value;
}
const ref = (file, token) => ({ file, token });
function layerValue(layer) {
  if (typeof layer === 'string') return layer;
  const v = declared(layer.file, layer.token, 'background');
  assert.ok(v, 'tidak ada deklarasi background untuk ' + layer.token + ' di ' + layer.file + '.css');
  return v;
}

/* ------------------------------------------------------------------ *
 * Daftar pasangan nyata (selektor, token teks, tumpukan latar)
 * Tumpukan latar ditulis dari BAWAH ke ATAS, di atas latar halaman.
 * ------------------------------------------------------------------ */

const CARD = ref('style', '.card');
const MODAL = ref('style', '.modal-panel');

const PAIRS = [
  { name: 'button — seluruh tombol non-primary', text: 'var(--text)', bg: [ref('style', 'button')] },
  { name: 'button di dalam modal Pengaturan', text: 'var(--text)', bg: [MODAL, ref('style', 'button')] },
  { name: '.icon-button — tombol Pengaturan di topbar', text: 'var(--glass-text)', bg: [ref('style', '.icon-button')] },
  { name: '.card', text: 'var(--glass-text)', bg: [CARD] },
  { name: '.card .muted', text: 'var(--glass-muted)', bg: [CARD] },
  { name: '.home-stats>div', text: 'var(--glass-text)', bg: [ref('style', '.home-stats'), ref('style', '.home-stats>div')] },
  { name: '.home-stats small', text: 'var(--glass-muted)', bg: [ref('style', '.home-stats'), ref('style', '.home-stats>div')] },
  { name: '.report-settings', text: 'var(--text)', bg: [MODAL, ref('style', '.report-settings')] },
  { name: '.report-settings .muted', text: 'var(--muted)', bg: [MODAL, ref('style', '.report-settings')] },
  { name: '.report-preview p', text: 'var(--muted)', bg: [MODAL, ref('style', '.report-preview')] },
  { name: '.setting-row small', text: 'var(--glass-muted)', bg: [MODAL] },
  { name: '.notification-status', text: 'var(--muted)', bg: [MODAL, ref('style', '.notification-status')] },
  { name: '.launch-card', text: 'var(--glass-text)', bg: [ref('tutor', 'html.fiezel-ui-v6 .launch-card')] },
  { name: '.launch-card small', text: 'var(--glass-muted)', bg: [ref('tutor', 'html.fiezel-ui-v6 .launch-card')] },
  { name: '.bottomnav .nav', text: 'var(--glass-muted)', bg: [ref('style', '.bottomnav')] },
  { name: '.bottomnav .nav.active', text: 'var(--accent-on-glass)', bg: [ref('style', '.bottomnav')] },
  { name: '.passage', text: 'var(--ink-soft)', bg: [ref('style', '.passage')] },
  { name: '.option — pilihan jawaban kuis', text: 'var(--text)', bg: [ref('style', '.option')] },
  { name: '.level-card', text: 'var(--text)', bg: [ref('style', '.level-card')] },
  { name: '.level-card p', text: 'var(--muted)', bg: [ref('style', '.level-card')] },
  { name: '.topbar .brand-button — merek FIEZEL', text: 'var(--ambient-text)', bg: [ref('tutor', 'html.fiezel-ui-v6 .topbar')], large: true },
  { name: '.topbar .brand-edition', text: 'var(--ambient-muted)', bg: [ref('tutor', 'html.fiezel-ui-v6 .topbar')] },
  { name: '.section-head h1', text: 'var(--ambient-text)', bg: [], large: true },
  { name: '.section-head p', text: 'var(--ambient-muted)', bg: [] },
  { name: '.section-kicker', text: 'var(--accent-on-glass)', bg: [] },
  { name: '.status-pill', text: 'var(--accent-strong)', bg: [ref('style', '.hero'), ref('style', '.status-pill')] },
  { name: '.quiz-topbar', text: 'var(--text)', bg: [ref('style', '.quiz-topbar')] },
  { name: '.feedback', text: 'var(--text)', bg: [CARD, ref('style', '.feedback')] },
  { name: '.mission-panel p', text: 'var(--glass-muted)', bg: [ref('style', '.mission-panel')] },
  { name: '.privacy-strip p', text: 'var(--muted)', bg: [ref('style', '.privacy-strip')] },
  { name: '.journey-block span', text: 'var(--glass-muted)', bg: [ref('style', '.journey-today')] },
  { name: '.lesson-example p', text: 'var(--muted)', bg: [ref('style', '.lesson-example')] },
  { name: '.diag-grid>div', text: 'var(--text)', bg: [ref('style', '.diag-grid>div')] },
  { name: '.confidence-box', text: 'var(--text)', bg: [ref('style', '.confidence-box')] },
  { name: '.library span', text: 'var(--ink-soft)', bg: [ref('style', '.library span')] },
  { name: '.error', text: 'var(--ink-danger)', bg: [ref('style', '.error')] },
  { name: '.modal-panel', text: 'var(--glass-text)', bg: [MODAL] },
  { name: '.flash-face', text: 'var(--text)', bg: [ref('style', '.flash-face')] },
  { name: '.welcome-icon', text: 'var(--accent-strong)', bg: [MODAL, ref('style', '.welcome-icon')] },
  // Classroom v3 (tutor-v3.css)
  { name: '.tutor-hub h2', text: 'var(--ui-text)', bg: [ref('tutor', '.tutor-hub')], large: true },
  { name: '.tutor-hub>section p', text: 'var(--ui-muted)', bg: [ref('tutor', '.tutor-hub')] },
  { name: '.tutor-subject small', text: 'var(--ui-muted)', bg: [ref('tutor', '.tutor-subject')] },
  { name: '.tutor-options button', text: 'var(--text)', bg: [ref('tutor', '.tutor-options button')] },
  { name: '.tutor-caption p', text: 'var(--ui-ink-soft)', bg: [ref('tutor', '.tutor-caption')] },
  { name: '.tutor-topic b', text: 'var(--ui-text)', bg: [ref('tutor', '.tutor-topic')] },
  // .tutor-summary-grid span sengaja TIDAK didaftarkan: --ui-muted #67758d di atas tint
  // dingin itu sudah 4,38:1 di mode TERANG sejak sebelum m025-85 (literalnya dulu #f7f9fc,
  // praktis sama). Memperbaikinya berarti menggelapkan --ui-muted, yaitu mengubah tampilan
  // mode terang - justru yang dilarang oleh perbaikan ini. Dicatat, bukan disembunyikan.
  { name: '.tutor-kicker', text: 'var(--ui-accent)', bg: [ref('tutor', '.tutor-hub')] }
];

const SCENARIOS = [
  { theme: 'light', scene: 'day' },
  { theme: 'dark', scene: 'day' },
  { theme: 'dark', scene: 'night' },
  // m025-113: terang + malam TIDAK lagi dikecualikan. Di sanalah OWNER menemukan Home
  // "berantakan dari atas sampai bawah": kartu modul memakai latar terang milik lapisan
  // v6 sementara tintanya --glass-text yang menjadi TERANG pada .scene-night - 1,05:1,
  // judulnya benar-benar tidak terbaca. Alasan pengecualian dulu adalah "memperbaikinya
  // berarti mengubah mode terang"; itu memang yang dilakukan m025-113, dengan sengaja:
  // permukaan dan tinta sekarang selalu diambil dari keluarga yang sama.
  { theme: 'light', scene: 'night' }
];

function measure(pair, theme, scene) {
  const vars = themeVars(theme, scene);
  let bg = pageBase(theme, scene);
  for (const layer of pair.bg) {
    const raw = layerValue(layer);
    const stops = colorStops(resolveValue(raw, vars));
    assert.ok(stops.length, 'latar tidak bisa diurai: ' + raw + ' -> ' + resolveValue(raw, vars));
    // Stop paling terang dan paling gelap sama-sama harus lolos, jadi ambil yang terburuk
    // relatif terhadap tinta belakangan; di sini cukup tumpuk stop pertama dan terakhir.
    bg = stops.reduce((acc, s) => over(s, acc), bg);
    if (stops.length > 1) bg = over(stops[0], bg);
  }
  const inkValue = resolveValue(pair.text, vars);
  const ink = parseColor(inkValue);
  assert.ok(ink, 'warna teks tidak bisa diurai: ' + pair.text + ' -> ' + inkValue);
  const flat = ink.a < 1 ? over(ink, bg) : ink;
  return { ratio: contrast(flat, bg), ink: hex(flat), bg: hex(bg) };
}

for (const sc of SCENARIOS) {
  const label = sc.theme === 'dark' ? 'gelap' : 'terang';
  const phase = sc.scene === 'night' ? 'malam' : 'siang';
  for (const pair of PAIRS) {
    const need = pair.large ? 3 : 4.5;
    test(`kontras ${label}/${phase} — ${pair.name}`, () => {
      const m = measure(pair, sc.theme, sc.scene);
      assert.ok(
        m.ratio >= need,
        `${m.ratio.toFixed(2)}:1 (butuh ${need}:1) — ${m.ink} di atas ${m.bg}`
      );
    });
  }
}

/* ------------------------------------------------------------------ *
 * Akar A / B / C dikunci sebagai struktur, bukan cuma sebagai angka
 * ------------------------------------------------------------------ */

test('akar A — button tidak lagi memaku latarnya ke putih', () => {
  const rule = RULES.style.find(r => norm(r.selector) === 'button' && !r.media &&
    r.decls.some(d => d.prop === 'background'));
  assert.ok(rule, 'aturan button dengan background tidak ditemukan');
  const bg = rule.decls.filter(d => d.prop === 'background').pop().value;
  assert.ok(/var\(--/.test(bg), 'button{background:' + bg + '} - latar tombol harus dari token tema');
});

test('akar B — --ui-* punya kembaran gelap untuk kedua selektor tema', () => {
  const attr = collectVars('tutor', eq(':root[data-theme="dark"].fiezel-ui-v6'));
  const query = collectVars('tutor', (sel, media) =>
    /prefers-color-scheme:\s*dark/.test(media) && sel === ':root:not([data-theme="light"]).fiezel-ui-v6');
  assert.ok(Object.keys(attr).length >= 10, 'blok :root[data-theme="dark"].fiezel-ui-v6 kosong');
  assert.deepStrictEqual(attr, query, 'blok gelap atribut dan media query harus identik, kalau tidak salah satunya diam-diam basi');
  const light = collectVars('tutor', eq('html.fiezel-ui-v6'));
  for (const key of Object.keys(light)) {
    if (key === '--ui-radius') continue;
    assert.ok(key in attr, key + ' tidak punya nilai gelap - permukaan itu akan tetap terang di mode gelap');
  }
});

test('akar B — latar halaman --ui-bg gelap di mode gelap', () => {
  const dark = parseColor(resolveValue('var(--ui-bg)', themeVars('dark', 'day')));
  const light = parseColor(resolveValue('var(--ui-bg)', themeVars('light', 'day')));
  assert.ok(luminance(dark) < 0.05, '--ui-bg gelap = ' + hex(dark) + ', masih terang');
  assert.ok(luminance(light) > 0.7, '--ui-bg terang berubah menjadi ' + hex(light) + ' - mode terang tidak boleh bergeser');
});

test('akar C — .scene-day/.scene-dawn sadar tema, 12 token kaca berhenti jadi kode mati', () => {
  const dayLight = themeVars('light', 'day');
  const dayDark = themeVars('dark', 'day');
  const scened = ['--glass-thin', '--glass-regular', '--glass-thick', '--glass-edge',
    '--glass-text', '--glass-muted', '--glass-line', '--ambient-text', '--ambient-muted',
    '--chrome-bg', '--launcher-start', '--launcher-end'];
  for (const key of scened) {
    assert.notStrictEqual(dayDark[key], dayLight[key],
      key + ' sama di kedua tema saat scene-day - blok .scene-* pada <body> masih membayangi palet gelap');
  }
  const glass = parseColor(resolveValue('var(--glass-thick)', dayDark));
  assert.ok(luminance(glass) < 0.05, 'kaca mode gelap saat siang = ' + hex(glass) + ', masih material terang');
  const ink = parseColor(resolveValue('var(--glass-text)', dayDark));
  assert.ok(luminance(ink) > 0.7, 'tinta kaca mode gelap = ' + hex(ink) + ', masih tinta terang');
});

test('akar C — .scene-dusk/.scene-night tetap material gelap di kedua tema', () => {
  for (const theme of ['light', 'dark']) {
    const vars = themeVars(theme, 'night');
    const glass = parseColor(resolveValue('var(--glass-thick)', vars));
    const ink = parseColor(resolveValue('var(--glass-text)', vars));
    assert.ok(luminance(glass) < 0.08, theme + '/malam: kaca ' + hex(glass) + ' tidak gelap');
    assert.ok(luminance(ink) > 0.7, theme + '/malam: tinta ' + hex(ink) + ' tidak terang');
  }
});

test('langit tidak boleh membanjiri halaman gelap', () => {
  // app.js menulis --sky-* dari jam saja; satu-satunya rem yang tersedia di CSS adalah
  // opasitas lapisannya. Tanpa rem itu, siang hari di mode gelap latar naik ke ~#9d8f92.
  const light = skyOpacity('light');
  const dark = skyOpacity('dark');
  assert.ok(typeof light === 'number' && light > 0, 'opasitas .global-sky mode terang tidak terbaca');
  assert.ok(typeof dark === 'number', 'mode gelap tidak menurunkan opasitas .global-sky');
  assert.ok(dark <= 0.3, 'opasitas langit mode gelap ' + dark + ' terlalu tinggi');
  const base = pageBase('dark', 'day');
  assert.ok(luminance(base) < 0.06, 'latar halaman gelap saat siang = ' + hex(base));
});

test('kedua blok gelap style.css identik, tidak ada drift', () => {
  const attr = collectVars('style', eq(':root[data-theme="dark"]'));
  const query = collectVars('style', (sel, media) =>
    /prefers-color-scheme:\s*dark/.test(media) && sel === ':root:not([data-theme="light"])');
  assert.deepStrictEqual(attr, query, 'palet gelap atribut dan media query berbeda');
  const dayAttr = collectVars('style', (sel, media) =>
    !media && sel.startsWith(':root[data-theme="dark"] body.scene-day'));
  const dayQuery = collectVars('style', (sel, media) =>
    /prefers-color-scheme:\s*dark/.test(media) && sel.startsWith(':root:not([data-theme="light"]) body.scene-day'));
  assert.deepStrictEqual(dayAttr, dayQuery, 'penimpaan scene-day gelap berbeda antara atribut dan media query');
});

test('token permukaan terang persis seperti literal yang digantikannya', () => {
  // Kontrak m025-85: mode terang TIDAK BOLEH bergeser. Nilai di sebelah kanan adalah
  // literal yang dulu dipaku di setiap aturan; kalau ada yang menggesernya, tes ini merah.
  const vars = themeVars('light', 'day');
  const expect = {
    '--surface-rgb': '255,254,250',
    '--surface-pure-rgb': '255,255,255',
    '--bg-rgb': '250,247,246',
    '--surface-solid': '#ffffff',
    '--surface-tint': '#fdfafa',
    '--surface-warm': '#f6f4ed',
    '--surface-cool': '#f9fbfd',
    '--surface-edge': '#f3dfe3',
    '--surface-edge-strong': '#e7cdd2',
    '--surface-mute': '#e4eaf2',
    '--ink-soft': '#4a343a',
    '--ink-danger': '#a13454'
  };
  for (const [key, want] of Object.entries(expect)) {
    assert.strictEqual(vars[key], want, key + ' bergeser dari nilai terang aslinya');
  }
});

/* ------------------------------------------------------------------ *
 * INVARIAN: tidak ada aturan yang mencampur tinta bertema dengan
 * permukaan yang dipaku. Inilah bentuk persis akar A.
 * ------------------------------------------------------------------ */

// Warna terang/gelap yang SAH dan sengaja tidak ikut tema (lihat handoff bagian 2.5):
// tombol utama dan toast berteks putih permanen, shell launcher yang memang gradien marun
// gelap, scrim gerbang, seluruh lapisan --fz-* (splash + onboarding), chip tint+tinta yang
// konsisten sendiri, ilustrasi matahari/bulan, dan papan tulis Classroom.
const LEGIT = [
  /(^|[\s,])\.?(primary|auth-primary|quiz-next|luxe)\b/,
  /\.toast\b/, /\.launcher-/, /\.ghost-dark\b/, /\.coach-/, /\.celestial-status\b/,
  /\.notification-gate\b/, /\.voice-bundle-sheet\b/, /\.daily-lock\b/, /\.library-\w+-sheet\b/,
  /\.fiezel-/, /\.fz-/, /\.launch-icon\b/, /\.result-icon\b/, /\.setting-icon\b/,
  /\.global-celestial\b/, /\.progress-tab\.active\b/, /::selection\b/,
  /\.notification-status\.(success|error)\b/, /\.bundle-ready\b/,
  /\.tutor-board\b/, /\.tutor-avatar\b/, /\.tutor-talk-(button|sheet)\b/,
  /\.answer-burst\.(success|error)\b/, /\.skeleton/, /\.empty-state/
];
const isLegit = sel => LEGIT.some(re => re.test(sel));

function lastDecl(rule, props) {
  let hit = null;
  for (const d of rule.decls) if (props.includes(d.prop)) hit = d;
  return hit;
}

test('INVARIAN — tidak ada aturan yang memaku latar terang di bawah teks bertema', () => {
  const bad = [];
  for (const file of ['style', 'tutor']) {
    for (const rule of RULES[file]) {
      const sel = norm(rule.selector);
      if (isLegit(sel)) continue;
      const color = lastDecl(rule, ['color']);
      const bg = lastDecl(rule, ['background', 'background-color']);
      if (!color || !bg) continue;
      if (!/var\(--/.test(color.value)) continue;
      for (const stop of literalStops(bg.value)) {
        if (stop.a < 0.5) continue;
        if (luminance(stop) > 0.5) {
          bad.push(file + '.css  ' + sel + '  {color:' + color.value + ';background:' + bg.value + '}');
          break;
        }
      }
    }
  }
  assert.deepStrictEqual(bad, [],
    'teks bertema di atas permukaan yang dipaku terang - inilah bug 1,08:1 yang dilaporkan OWNER:\n    ' +
    bad.join('\n    '));
});

test('INVARIAN — tidak ada tinta gelap yang dipaku di atas permukaan bertema', () => {
  const bad = [];
  for (const file of ['style', 'tutor']) {
    for (const rule of RULES[file]) {
      const sel = norm(rule.selector);
      if (isLegit(sel)) continue;
      const color = lastDecl(rule, ['color']);
      const bg = lastDecl(rule, ['background', 'background-color']);
      if (!color || !bg) continue;
      if (!/var\(--/.test(bg.value)) continue;
      const stops = literalStops(color.value);
      if (!stops.length || /var\(--/.test(color.value)) continue;
      if (luminance(stops[0]) < 0.2) {
        bad.push(file + '.css  ' + sel + '  {color:' + color.value + ';background:' + bg.value + '}');
      }
    }
  }
  assert.deepStrictEqual(bad, [],
    'tinta gelap dipaku di atas permukaan bertema - hilang begitu permukaannya menggelap:\n    ' +
    bad.join('\n    '));
});

test('INVARIAN — setiap token permukaan baru punya pasangan gelap', () => {
  const light = themeVars('light', 'day');
  const dark = themeVars('dark', 'day');
  const surfaces = Object.keys(light).filter(k => /^--(surface|ink)-/.test(k) || k === '--surface-rgb');
  assert.ok(surfaces.length >= 10, 'token permukaan tidak ditemukan');
  for (const key of surfaces) {
    assert.notStrictEqual(dark[key], light[key], key + ' tidak punya nilai gelap');
  }
});

process.on('exit', () => {
  if (failures) {
    console.error('FIEZEL m025-85 kontras universal: FAIL (' + failures + ')');
    process.exitCode = 1;
  } else {
    console.log('FIEZEL m025-85 kontras universal: PASS');
  }
});
