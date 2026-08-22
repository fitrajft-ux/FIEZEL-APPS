/**
 * m025-111 gerbang mutu soal listening.
 *
 * ALASAN BERKAS INI ADA. Owner menolak bank sebelumnya setelah memeriksanya sendiri,
 * dan menyebut soal yang salah sebagai larangan keras: siswa yang belajar dari FIEZEL
 * mengikuti apa yang tertulis tanpa punya cara memeriksa benar atau tidaknya. Karena
 * itu mutu tidak boleh bergantung pada ketelitian penulisnya saat itu. Setiap aturan
 * di bawah adalah cacat yang benar-benar terukur di bank lama, bukan aturan hipotetis.
 *
 * MELEMPAR, BUKAN MEMPERINGATKAN. Peringatan akan terlewat; soal cacat yang lolos
 * akan dikerjakan pelajar sungguhan. Generator memanggil gerbang ini, jadi bank yang
 * cacat tidak pernah sampai tertulis ke berkas.
 */
'use strict';

var STOP = new Set(('a an the and or but of to in on at for with my our your their his her its is are was were '
  + 'be been being am i we they he she it that this these those not no do does did have has had will would '
  + 'can could should may might must more most very so as than then there here about into from by out up '
  + 'down off over what when where why how which who whom if because while during after before').split(' '));

/** Kata isi naskah, tanpa kata fungsi. Dipakai semua pemeriksaan kemiripan. */
function content(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(function (w) { return w.length > 2 && !STOP.has(w); });
}

/**
 * Pemangkas akhiran seadanya. Urutannya penting: memangkas "es" lebih dulu membuat
 * "dates" menjadi "dat" sementara "date" tetap "date", dan dua kata yang jelas sama
 * lalu dihitung berbeda. Yang dibutuhkan di sini konsistensi, bukan ketepatan
 * linguistik - keduanya cukup asal kata yang sama selalu jatuh ke bentuk yang sama.
 */
function stems(text) {
  return new Set(content(text).map(function (w) {
    return w.replace(/ies$/, 'y').replace(/(ing|ed)$/, '').replace(/s$/, '');
  }));
}

function shared(a, b) {
  var out = 0;
  a.forEach(function (w) { if (b.has(w)) out++; });
  return out;
}

/** Jaccard atas trigram kata. Menangkap kalimat yang disusun ulang, bukan hanya identik. */
function trigrams(text) {
  var w = content(text), out = new Set();
  for (var i = 0; i + 2 < w.length; i++) out.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  var inter = shared(a, b);
  return inter / (a.size + b.size - inter);
}

/**
 * Kalibrasi CEFR. Batasnya dari deskriptor CEFR untuk pemahaman lisan, bukan dari
 * selera: A1-A2 kalimat pendek berpola tunggal, B1-B2 wacana beberapa kalimat dengan
 * penghubung, C1-C2 argumen yang boleh kompleks TETAPI dibatasi panjang katanya supaya
 * tidak kembali menjadi kutipan gaya jurnal - persis keluhan owner atas bank lama.
 */
var CEFR = {
  A1: { minWords: 22, maxWords: 55, maxLongRate: 0.10, minSentences: 3 },
  A2: { minWords: 30, maxWords: 70, maxLongRate: 0.14, minSentences: 3 },
  B1: { minWords: 40, maxWords: 90, maxLongRate: 0.20, minSentences: 3 },
  B2: { minWords: 50, maxWords: 110, maxLongRate: 0.26, minSentences: 3 },
  C1: { minWords: 60, maxWords: 130, maxLongRate: 0.32, minSentences: 3 },
  C2: { minWords: 65, maxWords: 150, maxLongRate: 0.36, minSentences: 3 }
};

/**
 * Ejaan British yang harus dihindari. Suaranya dirender Amazon Polly en-US, jadi
 * "colour" akan dibaca sebagai ejaan yang tidak cocok dengan yang pelajar lihat, dan
 * pelajar Indonesia belajar satu ejaan saja lebih dulu. Daftar eksplisit, bukan pola
 * "-ise", karena pola itu ikut menangkap kata biasa seperti noise dan wise.
 */
var BRITISH = new Set(('colour colours coloured favourite favourites neighbour neighbours behaviour behaviours '
  + 'centre centres theatre theatres programme programmes litre litres metre metres kilometre kilometres '
  + 'practise practised practising organise organised organising organisation organisations realise realised '
  + 'recognise recognised apologise apologised analyse analysed defence licence travelled travelling cancelled '
  + 'labelled modelling learnt spelt whilst amongst grey enrolment fulfil sceptical').split(' '));

var MODES = ['gist', 'detail', 'inference', 'attitude', 'paraphrase'];

function fail(msg) { throw new Error('mutu listening: ' + msg); }

/**
 * @param {Array} items  seluruh bank, termasuk item lama, supaya soal baru
 *                       benar-benar diadu dengan yang sudah ada (aturan 5 owner).
 */
function assertSound(items) {
  var seenId = Object.create(null);
  var scripts = [];          // {id, level, script, tri, opening}
  var optionUse = Object.create(null);
  var byLevel = Object.create(null);
  var characters = Object.create(null);
  var settings = Object.create(null);

  items.forEach(function (item) {
    if (seenId[item.id]) fail('id ganda ' + item.id);
    seenId[item.id] = true;
    if (!item.script) fail('naskah kosong di ' + item.id);
    (byLevel[item.level] = byLevel[item.level] || []).push(item);
  });

  // ---- 1. kemiripan naskah antar item, di dalam level yang sama ----
  Object.keys(byLevel).forEach(function (level) {
    var seenScript = Object.create(null);
    byLevel[level].forEach(function (item) {
      var key = item.script.toLowerCase().trim();
      // Satu skenario memang dipakai lima soal; yang dilarang adalah naskah yang
      // sama muncul di skenario yang berbeda.
      var scen = (item.pedagogy && item.pedagogy.scenario) || item.id;
      if (seenScript[key] && seenScript[key] !== scen) {
        fail('naskah dipakai dua skenario di ' + level + ': ' + item.script.slice(0, 60));
      }
      seenScript[key] = scen;
    });

    var uniq = [];
    var done = Object.create(null);
    byLevel[level].forEach(function (item) {
      var k = item.script.toLowerCase().trim();
      if (done[k]) return;
      done[k] = true;
      uniq.push({ id: item.id, script: item.script, tri: trigrams(item.script), open: content(item.script).slice(0, 4).join(' ') });
    });
    for (var i = 0; i < uniq.length; i++) {
      for (var j = i + 1; j < uniq.length; j++) {
        if (uniq[i].open && uniq[i].open === uniq[j].open) {
          fail('empat kata pembuka sama di ' + level + ': ' + uniq[i].id + ' & ' + uniq[j].id + ' -> "' + uniq[i].open + '"');
        }
        var sim = jaccard(uniq[i].tri, uniq[j].tri);
        if (sim >= 0.34) {
          fail('naskah terlalu mirip di ' + level + ' (' + sim.toFixed(2) + '): ' + uniq[i].id + ' & ' + uniq[j].id);
        }
      }
    }
  });

  // ---- 2. per item ----
  items.forEach(function (item) {
    if (MODES.indexOf(item.mode) === -1 && item.mode !== 'dictation') fail('mode tak dikenal ' + item.mode + ' di ' + item.id);
    if (item.mode === 'dictation') {
      if (item.answerText !== item.script) fail('dictation tidak sepadan ' + item.id);
      return;
    }
    if (!Array.isArray(item.options) || item.options.length !== 4) fail('pilihan bukan empat ' + item.id);
    if (new Set(item.options).size !== 4) fail('pilihan tidak unik ' + item.id);
    if (!(item.answerIndex >= 0 && item.answerIndex < 4)) fail('indeks jawaban di luar rentang ' + item.id);
    if (!item.question || item.question.length < 8) fail('pertanyaan terlalu pendek ' + item.id);

    item.options.forEach(function (o) { optionUse[o] = (optionUse[o] || 0) + 1; });

    var s = stems(item.script);
    var overlap = item.options.map(function (o) { return shared(stems(o), s); });
    var key = overlap[item.answerIndex];
    var others = overlap.filter(function (_, k) { return k !== item.answerIndex; });

    // Pengecoh yang tidak memakai kosakata naskah membuat soal bisa dijawab hanya
    // dengan mencocokkan kata - 28% bank lama begitu.
    if (key > 0 && others.every(function (o) { return o === 0; })) {
      fail('bisa dijawab tanpa mendengar (hanya kunci yang memakai kata naskah): ' + item.id);
    }
    var maxOther = Math.max.apply(null, others);
    // Kebalikannya: pengecoh yang memakai kata naskah lebih banyak dari kunci membuat
    // dua jawaban sama-sama bisa dibela. 158 soal bank lama begitu. Tidak berlaku untuk
    // inference dan attitude, yang jawabannya memang tidak diucapkan di naskah.
    if ((item.mode === 'gist' || item.mode === 'detail') && maxOther > key) {
      fail('pengecoh lebih menempel ke naskah daripada kunci: ' + item.id);
    }
    // Paraphrase dibalik: kunci yang paling harfiah berarti pelajar cukup mencari
    // kalimat yang paling mirip bunyinya, bukan yang sama maknanya.
    if (item.mode === 'paraphrase' && key > maxOther) {
      fail('paraphrase terlalu harfiah, kunci paling menempel ke naskah: ' + item.id);
    }
  });

  // ---- 3. per level ----
  Object.keys(byLevel).forEach(function (level) {
    var rows = byLevel[level].filter(function (i) { return i.options; });
    if (!rows.length) return;

    var pos = [0, 0, 0, 0];
    var longest = 0;
    rows.forEach(function (r) {
      pos[r.answerIndex]++;
      var lens = r.options.map(function (o) { return o.length; });
      if (lens[r.answerIndex] === Math.max.apply(null, lens)) longest++;
    });
    pos.forEach(function (c, i) {
      var share = c / rows.length;
      if (share < 0.18 || share > 0.32) fail('posisi jawaban ' + i + ' di ' + level + ' ' + Math.round(share * 100) + '% (harus 18-32%)');
    });
    if (longest / rows.length > 0.40) {
      fail('kunci adalah opsi terpanjang ' + Math.round(longest / rows.length * 100) + '% di ' + level + ' (maks 40%)');
    }

    var mode = Object.create(null);
    rows.forEach(function (r) { mode[r.mode] = (mode[r.mode] || 0) + 1; });

    var band = CEFR[level];
    if (band) {
      var seen = Object.create(null);
      byLevel[level].forEach(function (item) {
        var k = item.script.toLowerCase().trim();
        if (seen[k]) return;
        seen[k] = true;
        var w = String(item.script).trim().split(/\s+/);
        if (w.length < band.minWords || w.length > band.maxWords) {
          fail('panjang naskah ' + w.length + ' kata di luar rentang ' + level + ' (' + band.minWords + '-' + band.maxWords + '): ' + item.id);
        }
        var long = w.filter(function (x) { return x.replace(/[^A-Za-z]/g, '').length >= 9; }).length / w.length;
        if (long > band.maxLongRate) {
          fail('kata panjang ' + Math.round(long * 100) + '% di ' + level + ' (maks ' + Math.round(band.maxLongRate * 100) + '%): ' + item.id);
        }
        var sentences = (item.script.match(/[.!?]/g) || []).length;
        if (sentences < band.minSentences) {
          fail('naskah hanya ' + sentences + ' kalimat di ' + level + ' (min ' + band.minSentences + '): ' + item.id);
        }
        var british = item.script.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)
          .filter(function (w) { return BRITISH.has(w); });
        if (british.length) fail('ejaan British ("' + british[0] + '") sementara voice en-US: ' + item.id);
      });
    }

    // Karakter dan tempat harus benar-benar berbeda: bank lama hanya punya lima nama
    // orang untuk 1236 soal.
    var scen = Object.create(null);
    byLevel[level].forEach(function (item) {
      var p = item.pedagogy || {};
      if (!p.scenario) return;
      if (scen[p.scenario]) return;
      scen[p.scenario] = true;
      var who = String(p.character || '').toLowerCase();
      if (!who) fail('skenario tanpa karakter di ' + item.id);
      if (characters[who]) fail('karakter dipakai dua skenario: ' + p.character + ' (' + item.id + ')');
      characters[who] = item.id;
      var place = String(p.scenario.split('—').pop() || '').trim().toLowerCase();
      if (settings[place]) fail('setting dipakai dua skenario: ' + place + ' (' + item.id + ')');
      settings[place] = item.id;
    });
  });

  // ---- 4. pemakaian ulang string pengecoh di seluruh bank ----
  Object.keys(optionUse).forEach(function (o) {
    if (optionUse[o] > 2) fail('string opsi dipakai ' + optionUse[o] + ' kali: "' + o + '"');
  });

  return true;
}

module.exports = {
  assertSound: assertSound,
  content: content,
  stems: stems,
  trigrams: trigrams,
  jaccard: jaccard,
  CEFR: CEFR,
  MODES: MODES
};
