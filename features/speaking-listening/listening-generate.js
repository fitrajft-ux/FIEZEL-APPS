/**
 * m025-111 penyusun soal listening berbasis skenario.
 *
 * MENGGANTI generator m025-108. Generator lama menyusun soal dari daftar kalimat
 * lepas; owner memeriksa hasilnya dan menolaknya karena terasa satu template yang
 * diganti satu-dua kata. Diagnosanya terukur dan tercatat di listening-quality.js:
 * 45% naskah C2 berbagi empat kata pembuka, seluruh bank hanya memuat lima nama
 * orang, dan 28% soal bisa dijawab lewat pencocokan kata tanpa mendengar sama sekali.
 *
 * BENTUK BARUNYA: satu skenario -> lima soal. Skenario membawa karakter, tempat,
 * dan situasinya sendiri; kelimanya soal menanyakan naskah yang sama dari lima
 * sudut resmi TOEFL/IELTS Listening - gist, detail, inference, attitude, paraphrase.
 * Itu sekaligus alasan naskahnya kini beberapa kalimat: gist dan inference tidak
 * bisa diuji sungguhan pada satu kalimat tunggal, dan bank lama 99% satu kalimat.
 *
 * DISTRAKTOR DITULIS TANGAN PER SOAL, tidak diambil dari pool bersama. Pool bersama
 * itulah yang membuat bank lama memakai ulang satu string pengecoh 19-20 kali per
 * level - pelajar cukup menghafal 27 label untuk menebak seluruh level.
 *
 * TETAP DETERMINISTIK. speaking-listening-test.js menjalankan ulang rebuild lalu
 * membandingkan hash berkasnya, jadi satu Math.random saja membuat tes itu gagal
 * setiap kali dijalankan. Pengacakan yang dilihat pelajar terjadi saat sesi dibuka
 * (DataRepository.for), bukan di sini.
 */
'use strict';

var quality = require('./listening-quality.js');

var MODES = ['gist', 'detail', 'inference', 'attitude', 'paraphrase'];

var FOCUS = {
  gist: 'main idea',
  detail: 'specific detail',
  inference: 'inference',
  attitude: "speaker's attitude or purpose",
  paraphrase: 'paraphrase recognition'
};

/**
 * Memutar array sebanyak n langkah.
 *
 * Dipakai menggantikan pengacakan supaya posisi jawaban benar berpindah-pindah tanpa
 * merusak determinisme. Tanpa ini pelajar belajar menekan tombol yang sama alih-alih
 * mendengarkan, dan skornya naik tanpa kemampuannya ikut naik.
 */
function rotate(list, n) {
  var out = list.slice();
  var shift = ((n % out.length) + out.length) % out.length;
  return out.slice(shift).concat(out.slice(0, shift));
}

function itemId(level, mode, index) {
  return 'listen_sc_' + level.toLowerCase() + '_' + mode + '_' + String(index + 1).padStart(3, '0');
}

/**
 * Satu skenario ditulis sebagai array supaya berkas sumbernya tetap terbaca sebagai
 * naskah, bukan sebagai konfigurasi. Urutannya tetap:
 *   [nama, tempat, topik, naskah, gist, detail, inference, attitude, paraphrase]
 * dan tiap soal: [pertanyaan, jawaban benar, pengecoh1, pengecoh2, pengecoh3].
 */
function readScenario(row) {
  return {
    character: row[0],
    setting: row[1],
    topic: row[2],
    script: row[3],
    questions: MODES.map(function (mode, i) {
      var q = row[4 + i];
      return { mode: mode, question: q[0], answer: q[1], distractors: q.slice(2) };
    })
  };
}

function buildLevel(level, source) {
  if (!source || !source.scenarios) return [];
  var items = [];
  var counter = {};
  MODES.forEach(function (m) { counter[m] = 0; });

  source.scenarios.forEach(function (row, sceneIndex) {
    var scene = readScenario(row);
    scene.questions.forEach(function (q, qIndex) {
      // Posisi jawaban diputar memakai dua indeks sekaligus. Memakai indeks soal saja
      // membuat gist selalu di posisi 0, detail selalu di posisi 1, dan seterusnya.
      var options = rotate([q.answer].concat(q.distractors), (sceneIndex + qIndex * 3) % 4);
      items.push({
        id: itemId(level, q.mode, counter[q.mode]++),
        schema: 'fiezel-listening-item-v1',
        level: level,
        mode: q.mode,
        script: scene.script,
        voiceLang: 'en-US',
        maxReplays: 2,
        pedagogy: {
          focus: FOCUS[q.mode],
          scenario: scene.topic + ' — ' + scene.setting,
          character: scene.character
        },
        privacy: { rawLearnerResponseRequiredForPersistence: false },
        question: q.question,
        options: options,
        answerIndex: options.indexOf(q.answer),
        scoring: { metric: 'exact_choice' }
      });
    });
  });
  return items;
}

module.exports = {
  MODES: MODES,
  rotate: rotate,
  buildLevel: buildLevel,
  assertSound: quality.assertSound
};
