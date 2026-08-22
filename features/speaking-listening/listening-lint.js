#!/usr/bin/env node
/**
 * m025-111 pelapor mutu soal listening.
 *
 * listening-quality.js melempar pada pelanggaran pertama, karena itulah yang benar
 * untuk gerbang: satu soal cacat cukup untuk menolak bank. Tetapi saat menulis ratusan
 * skenario, berhenti di pelanggaran pertama berarti ratusan kali jalan bolak-balik.
 * Berkas ini memeriksa aturan yang sama lalu melaporkan SEMUANYA sekaligus.
 *
 * Pakai: node features/speaking-listening/listening-lint.js [A1 A2 ...]
 */
'use strict';

var quality = require('./listening-quality.js');
var generate = require('./listening-generate.js');

var LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function load(level) {
  try { return require('./listening-scenarios-' + level.toLowerCase() + '.js'); }
  catch (e) { return null; }
}

function report(items) {
  var out = [];
  items.forEach(function (item) {
    if (!item.options) return;
    var s = quality.stems(item.script);
    var ov = item.options.map(function (o) { return quality.shared ? 0 : 0; });
    ov = item.options.map(function (o) {
      var n = 0;
      quality.stems(o).forEach(function (w) { if (s.has(w)) n++; });
      return n;
    });
    var key = ov[item.answerIndex];
    var others = ov.filter(function (_, k) { return k !== item.answerIndex; });
    var maxOther = Math.max.apply(null, others);
    if (key > 0 && others.every(function (o) { return o === 0; })) {
      out.push([item.id, 'giveaway: hanya kunci memakai kata naskah', item.options[item.answerIndex]]);
    }
    if ((item.mode === 'gist' || item.mode === 'detail') && maxOther > key) {
      out.push([item.id, 'ambigu: pengecoh ' + maxOther + ' > kunci ' + key, item.options[ov.indexOf(maxOther)]]);
    }
    if (item.mode === 'paraphrase' && key > maxOther) {
      out.push([item.id, 'paraphrase harfiah: kunci ' + key + ' > pengecoh ' + maxOther, item.options[item.answerIndex]]);
    }
  });
  return out;
}

function main() {
  var want = process.argv.slice(2);
  var levels = want.length ? want : LEVELS;
  var all = [], bad = 0;
  levels.forEach(function (level) {
    var src = load(level);
    if (!src) { console.log(level + ': belum ada berkas skenario'); return; }
    var items = generate.buildLevel(level, src);
    all = all.concat(items);
    var rows = report(items);
    console.log(level + ': ' + src.scenarios.length + ' skenario, ' + items.length + ' soal, ' + rows.length + ' temuan opsi');
    rows.forEach(function (r) { console.log('   ' + r[0] + '  ' + r[1] + '  -> ' + r[2]); bad++; });
    var w = {}, seen = {};
    items.forEach(function (i) {
      if (seen[i.script]) return; seen[i.script] = true;
      var n = i.script.trim().split(/\s+/).length;
      var band = quality.CEFR[level];
      var long = i.script.trim().split(/\s+/).filter(function (x) { return x.replace(/[^A-Za-z]/g, '').length >= 9; }).length / n;
      var sent = (i.script.match(/[.!?]/g) || []).length;
      if (n < band.minWords || n > band.maxWords) { console.log('   ' + i.id + '  panjang ' + n + ' kata di luar ' + band.minWords + '-' + band.maxWords); bad++; }
      if (long > band.maxLongRate) { console.log('   ' + i.id + '  kata panjang ' + Math.round(long * 100) + '%'); bad++; }
      if (sent < band.minSentences) { console.log('   ' + i.id + '  hanya ' + sent + ' kalimat'); bad++; }
      w[i.id] = n;
    });
  });
  try { quality.assertSound(all); console.log('\nGERBANG: LULUS (' + all.length + ' soal)'); }
  catch (e) { console.log('\nGERBANG: ' + e.message); bad++; }
  process.exit(bad ? 1 : 0);
}

main();
