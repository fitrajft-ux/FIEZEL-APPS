/**
 * FIEZEL Review Bank — bank soal review bersama untuk alur learner (diagnostic → lesson)
 * dan Tutor Action Center ("Buat sesi review"). Murni data + fungsi tanpa DOM, deterministik,
 * dan tersedia offline.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelReviewBank = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah di berkas ini dulu literal Indonesia,
     jadi murid yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft:
     kalau copy-map belum termuat, fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  var AREAS = { grammar: 'Grammar', vocabulary: 'Vocabulary', reading: 'Reading', listening: 'Listening', speaking: 'Speaking' };

  var SKILLS = {
    past_tense: { id: 'past_tense', label: 'Past tense (verb 2)', short: 'Past tense', area: 'grammar', pattern: 'Subject + verb 2', objective: 'Membedakan bentuk dasar dan bentuk lampau saat ada penanda waktu (yesterday, last week, ago).', lesson: 'Mini lesson: Past Simple', minutesPer: 0.8 },
    past_questions: { id: 'past_questions', label: 'Questions in the past (did + verb 1)', short: 'Past questions', area: 'grammar', pattern: 'Did + subject + verb 1', objective: 'Membentuk pertanyaan lampau dengan did + verb 1 dan membedakannya dari was/were.', lesson: 'Mini lesson: Past Questions', minutesPer: 1 },
    vocab_a2: { id: 'vocab_a2', label: 'Vocabulary A2', short: 'Vocabulary A2', area: 'vocabulary', pattern: 'Makna kata dari petunjuk konteks', objective: 'Memilih kata A2 yang tepat dari petunjuk konteks kalimat.', lesson: 'Review: Vocabulary A2 dalam konteks', minutesPer: 0.6 },
    listening_detail: { id: 'listening_detail', label: 'Listening: detail dialog pendek', short: 'Listening detail', area: 'listening', pattern: 'Tangkap kata kunci tepat setelah pertanyaan', objective: 'Menangkap detail spesifik (waktu, jumlah, tempat) dari dialog pendek.', lesson: 'Sesi listening pendek', minutesPer: 1 },
    reading_inference: { id: 'reading_inference', label: 'Reading inference', short: 'Reading inference', area: 'reading', pattern: 'Petunjuk teks → kesimpulan', objective: 'Menyimpulkan makna yang tidak tertulis langsung dari petunjuk teks.', lesson: 'Review: Reading inference', minutesPer: 1.2 }
  };
  var SKILL_ORDER = ['past_tense', 'past_questions', 'vocab_a2', 'listening_detail', 'reading_inference'];

  var V1 = 'adalah bentuk dasar (verb 1) — cocok untuk present, bukan untuk kalimat lampau.';
  var V3 = 'adalah verb 3 (past participle); bentuk ini butuh have/has/had di depannya.';
  var ING = 'adalah bentuk -ing (continuous); ia butuh was/were di depannya dan tidak berdiri sendiri.';
  var S3 = 'adalah bentuk present dengan -s (orang ketiga tunggal), bukan bentuk lampau.';
  var AFTER_DID = 'Setelah “did”, kata kerja kembali ke bentuk dasar (verb 1) — “did” sudah membawa makna lampau, jadi lampau tidak ditandai dua kali.';

  function g(id, prompt, options, answer, marker, why, note) {
    return { id: id, skill: 'past_tense', prompt: prompt, options: options, answer: answer, marker: marker, why: why, note: note || 'Penanda waktu “' + marker + '” meminta bentuk lampau (verb 2).' };
  }
  function q(id, prompt, options, answer, marker, why, note) {
    return { id: id, skill: 'past_questions', prompt: prompt, options: options, answer: answer, marker: marker, why: why, note: note || 'Pertanyaan lampau: did + subject + verb 1.' };
  }
  function v(id, prompt, options, answer, clue, why, note) {
    return { id: id, skill: 'vocab_a2', prompt: prompt, options: options, answer: answer, marker: clue, why: why, note: note || 'Petunjuk konteksnya: “' + clue + '”.' };
  }
  function l(id, dialogue, prompt, options, answer, clue, why, note) {
    return { id: id, skill: 'listening_detail', context: dialogue, contextKind: 'dialogue', prompt: prompt, options: options, answer: answer, marker: clue, why: why, note: note || 'Kata kuncinya: “' + clue + '”.' };
  }
  function r(id, passage, prompt, options, answer, clue, why, note) {
    return { id: id, skill: 'reading_inference', context: passage, contextKind: 'passage', prompt: prompt, options: options, answer: answer, marker: clue, why: why, note: note || 'Kesimpulannya datang dari petunjuk “' + clue + '”, bukan dari kalimat yang tertulis langsung.' };
  }

  var ITEMS = [
    g('pt1', 'Yesterday I ___ to the market.', ['go', 'went', 'gone', 'going'], 1, 'yesterday', { 0: '“go” ' + V1, 2: '“gone” ' + V3, 3: '“going” ' + ING }),
    g('pt2', 'Last night we ___ a movie together.', ['watch', 'watched', 'watching', 'watches'], 1, 'last night', { 0: '“watch” ' + V1, 2: '“watching” ' + ING, 3: '“watches” ' + S3 }),
    g('pt3', 'She ___ her homework two hours ago.', ['finish', 'finished', 'finishes', 'finishing'], 1, 'two hours ago', { 0: '“finish” ' + V1, 2: '“finishes” ' + S3, 3: '“finishing” ' + ING }),
    g('pt4', 'They ___ in Bandung in 2019.', ['live', 'lived', 'living', 'lives'], 1, 'in 2019', { 0: '“live” ' + V1, 2: '“living” ' + ING, 3: '“lives” ' + S3 }),
    g('pt5', 'He ___ breakfast this morning before school.', ['eat', 'ate', 'eaten', 'eats'], 1, 'this morning', { 0: '“eat” ' + V1, 2: '“eaten” ' + V3, 3: '“eats” ' + S3 }),
    g('pt6', 'My father ___ me a book last week.', ['buy', 'bought', 'buys', 'buying'], 1, 'last week', { 0: '“buy” ' + V1, 2: '“buys” ' + S3, 3: '“buying” ' + ING }),
    g('pt7', 'We ___ very tired after the trip yesterday.', ['are', 'were', 'was', 'be'], 1, 'yesterday', { 0: '“are” adalah bentuk present dari to be.', 2: '“was” dipakai untuk I/he/she/it; subjek “we” butuh “were”.', 3: '“be” adalah bentuk dasar; ia tidak bisa jadi kata kerja utama di kalimat ini.' }, 'To be lampau: subjek jamak (we/they/you) + were.'),
    g('pt8', 'I ___ my keys yesterday, so I couldn\u2019t open the door.', ['lose', 'lost', 'losing', 'loses'], 1, 'yesterday', { 0: '“lose” ' + V1, 2: '“losing” ' + ING, 3: '“loses” ' + S3 }),
    g('pt9', 'The students ___ quiet during the exam last Monday.', ['are', 'were', 'was', 'is'], 1, 'last Monday', { 0: '“are” adalah bentuk present dari to be.', 2: '“was” untuk subjek tunggal; “the students” jamak, jadi “were”.', 3: '“is” adalah bentuk present tunggal.' }, 'To be lampau: subjek jamak + were.'),
    g('pt10', 'She ___ to me on the phone an hour ago.', ['speak', 'spoke', 'spoken', 'speaks'], 1, 'an hour ago', { 0: '“speak” ' + V1, 2: '“spoken” ' + V3, 3: '“speaks” ' + S3 }),

    q('pq1', '___ you go to school yesterday?', ['Do', 'Did', 'Were', 'Does'], 1, 'yesterday', { 0: '“Do” membentuk pertanyaan present; penanda “yesterday” meminta bentuk lampau “Did”.', 2: '“Were” dipakai untuk to be, bukan untuk kata kerja aksi seperti “go”.', 3: '“Does” adalah present untuk orang ketiga tunggal.' }),
    q('pq2', 'Did she ___ the test last week?', ['pass', 'passed', 'passes', 'passing'], 0, 'did', { 1: '“passed” menandai lampau dua kali. ' + AFTER_DID, 2: '“passes” ' + S3, 3: '“passing” ' + ING }),
    q('pq3', 'Where ___ they live before moving here?', ['do', 'did', 'were', 'was'], 1, 'before moving here', { 0: '“do” membentuk pertanyaan present; konteks “before moving here” menunjuk masa lampau.', 2: '“were” untuk to be; “live” adalah kata kerja aksi, jadi perlu “did”.', 3: '“was” untuk to be tunggal, bukan untuk kata kerja aksi.' }),
    q('pq4', 'Did you ___ the email this morning?', ['send', 'sent', 'sends', 'sending'], 0, 'did', { 1: '“sent” menandai lampau dua kali. ' + AFTER_DID, 2: '“sends” ' + S3, 3: '“sending” ' + ING }),
    q('pq5', '___ he at home last night?', ['Did', 'Was', 'Were', 'Is'], 1, 'at home', { 0: 'Tidak ada kata kerja aksi di kalimat ini — hanya to be (“at home”). Pertanyaan to be tidak memakai “did”.', 2: '“Were” untuk you/we/they; subjek “he” butuh “Was”.', 3: '“Is” adalah present; “last night” meminta lampau.' }, 'Pertanyaan dengan to be: Was/Were + subject — tanpa did.'),
    q('pq6', 'What time ___ the meeting start yesterday?', ['did', 'does', 'was', 'do'], 0, 'yesterday', { 1: '“does” adalah present.', 2: '“was” untuk to be; “start” adalah kata kerja aksi, jadi perlu “did”.', 3: '“do” adalah present.' }),
    q('pq7', 'Did your friends ___ the concert?', ['enjoy', 'enjoyed', 'enjoys', 'enjoying'], 0, 'did', { 1: '“enjoyed” menandai lampau dua kali. ' + AFTER_DID, 2: '“enjoys” ' + S3, 3: '“enjoying” ' + ING }),
    q('pq8', 'Why ___ you late this morning?', ['did', 'were', 'was', 'do'], 1, 'late', { 0: 'Tidak ada kata kerja aksi — “late” adalah kata sifat, jadi kalimat ini memakai to be (were), bukan did.', 2: '“was” untuk I/he/she/it; subjek “you” butuh “were”.', 3: '“do” adalah present.' }, 'Pertanyaan dengan to be: Were + you + kata sifat.'),

    v('vc1', 'I need to ___ my bike because the tire is flat.', ['fix', 'cook', 'borrow', 'wear'], 0, 'the tire is flat', { 1: '“cook” berarti memasak — tidak cocok dengan sepeda yang bannya kempes.', 2: '“borrow” berarti meminjam; masalahnya bukan tidak punya sepeda, tapi sepedanya rusak.', 3: '“wear” berarti memakai (pakaian).' }),
    v('vc2', 'The library is ___ on Sundays, so we can\u2019t go there.', ['open', 'closed', 'cheap', 'late'], 1, 'we can\u2019t go there', { 0: '“open” bertentangan dengan “we can’t go there”.', 2: '“cheap” (murah) tidak menjelaskan kenapa tidak bisa pergi.', 3: '“late” (terlambat) tidak menggambarkan keadaan perpustakaan.' }),
    v('vc3', 'She was ___ because she missed the bus.', ['happy', 'upset', 'hungry', 'tall'], 1, 'missed the bus', { 0: '“happy” bertentangan dengan kejadian ketinggalan bus.', 2: '“hungry” (lapar) tidak berhubungan dengan ketinggalan bus.', 3: '“tall” (tinggi) adalah ciri fisik, bukan perasaan.' }),
    v('vc4', 'Please ___ the light when you leave the room.', ['turn on', 'turn off', 'pick up', 'put on'], 1, 'when you leave', { 0: '“turn on” berarti menyalakan — saat meninggalkan ruangan, lampu justru dimatikan.', 2: '“pick up” berarti mengambil/menjemput.', 3: '“put on” berarti memakai (pakaian).' }),
    v('vc5', 'We ___ a table at the restaurant for 7 p.m.', ['cooked', 'booked', 'cleaned', 'sold'], 1, 'a table … for 7 p.m.', { 0: '“cooked” berarti memasak; kita tidak memasak meja.', 2: '“cleaned” berarti membersihkan — bukan yang dilakukan tamu restoran untuk jam 7.', 3: '“sold” berarti menjual.' }),
    v('vc6', 'The shop gives a 20% ___ on shoes today.', ['discount', 'receipt', 'ticket', 'change'], 0, '20%', { 1: '“receipt” adalah struk bukti pembayaran.', 2: '“ticket” adalah tiket/karcis.', 3: '“change” adalah uang kembalian.' }),
    v('vc7', 'My neighbour is very ___; she always helps everyone.', ['lazy', 'rude', 'kind', 'noisy'], 2, 'always helps everyone', { 0: '“lazy” (malas) bertentangan dengan “always helps everyone”.', 1: '“rude” (kasar) bertentangan dengan sikap suka menolong.', 3: '“noisy” (berisik) tidak berhubungan dengan menolong.' }),
    v('vc8', 'I can\u2019t hear you — the music is too ___.', ['quiet', 'loud', 'soft', 'slow'], 1, 'I can\u2019t hear you', { 0: '“quiet” (pelan) tidak membuat orang sulit mendengar.', 2: '“soft” (lembut/pelan) juga tidak menghalangi pendengaran.', 3: '“slow” (lambat) tidak berhubungan dengan kerasnya suara.' }),

    l('ld1', 'A: What time does the train leave?\nB: It leaves at 7:45, but we should be at the station by 7:30.', 'What time should they be at the station?', ['7:45', '7:30', '7:15', '8:00'], 1, 'be at the station by', { 0: '7:45 adalah waktu kereta BERANGKAT — pertanyaannya tentang kapan harus tiba di stasiun.', 2: '7:15 tidak disebut dalam dialog.', 3: '8:00 tidak disebut dalam dialog.' }),
    l('ld2', 'A: Do you want tea or coffee?\nB: Coffee, please — with milk but no sugar.', 'How does B want the coffee?', ['With milk and sugar', 'With milk, no sugar', 'Black, no milk', 'With sugar, no milk'], 1, 'with milk but no sugar', { 0: 'Kata “but no sugar” membatalkan gula — perhatikan kata pembalik “but”.', 2: 'B jelas meminta susu (“with milk”).', 3: 'Terbalik: yang diminta susu, yang ditolak gula.' }),
    l('ld3', 'A: Is the museum open tomorrow?\nB: Yes, from nine to five, but it\u2019s closed on Mondays.', 'When is the museum closed?', ['Tomorrow', 'On Mondays', 'At five', 'At nine'], 1, 'closed on Mondays', { 0: 'B menjawab “Yes” — besok museum buka.', 2: 'Jam lima adalah jam TUTUP harian, bukan hari libur; pertanyaannya soal kapan museum tidak buka.', 3: 'Jam sembilan adalah jam buka.' }),
    l('ld4', 'A: How much is the ticket?\nB: It\u2019s twelve dollars for adults and eight for students.', 'How much does a student pay?', ['12 dollars', '8 dollars', '20 dollars', '4 dollars'], 1, 'eight for students', { 0: '12 dolar adalah harga untuk “adults”.', 2: '20 dolar adalah jumlah keduanya — tidak diminta.', 3: '4 dolar adalah selisihnya, bukan harga tiket.' }),
    l('ld5', 'A: Where did you put my bag?\nB: I left it on the chair next to the window, not on the table.', 'Where is the bag?', ['On the table', 'On the chair', 'By the door', 'In the car'], 1, 'on the chair … not on the table', { 0: 'B justru menegaskan “not on the table” — tangkap kata negatif “not”.', 2: 'Pintu tidak disebut.', 3: 'Mobil tidak disebut.' }),
    l('ld6', 'A: Can we meet on Tuesday?\nB: Tuesday is difficult. Wednesday afternoon works better for me.', 'When will they probably meet?', ['Tuesday morning', 'Wednesday afternoon', 'Tuesday afternoon', 'Wednesday morning'], 1, 'Wednesday afternoon works better', { 0: 'B berkata Selasa “difficult” (sulit).', 2: 'Selasa ditolak — hari apa pun waktunya.', 3: 'Harinya benar, tapi B menyebut “afternoon”, bukan pagi.' }),

    r('ri1', 'Maya looked at the dark sky and took her umbrella before leaving the house.', 'What does Maya probably expect?', ['It will rain.', 'It will be sunny.', 'She will be late.', 'The shop is closed.'], 0, 'dark sky + umbrella', { 1: 'Langit gelap dan payung bukan tanda cuaca cerah.', 2: 'Tidak ada petunjuk tentang waktu atau keterlambatan.', 3: 'Toko tidak disebut sama sekali.' }),
    r('ri2', 'Tom checked his watch three times and kept looking at the door of the caf\u00e9.', 'How does Tom probably feel?', ['Relaxed', 'Waiting for someone and a little anxious', 'Hungry', 'Sleepy'], 1, 'checked his watch three times', { 0: 'Orang yang santai tidak melihat jam tiga kali sambil menatap pintu.', 2: 'Tidak ada petunjuk tentang makanan.', 3: 'Tidak ada petunjuk tentang kantuk.' }),
    r('ri3', 'The classroom was silent. Everyone was writing quickly, and the teacher was watching the clock.', 'What is most likely happening?', ['A party', 'An exam', 'A holiday', 'Lunch break'], 1, 'silent + writing quickly + watching the clock', { 0: 'Pesta tidak sunyi.', 2: 'Saat libur kelas kosong, tidak ada yang menulis.', 3: 'Saat istirahat makan tidak ada yang menulis cepat sambil diawasi jam.' }),
    r('ri4', 'Sari put on her coat, scarf and gloves before going outside.', 'What can we infer about the weather?', ['It is hot.', 'It is cold.', 'It is rainy.', 'It is windy.'], 1, 'coat, scarf and gloves', { 0: 'Mantel, syal, dan sarung tangan bukan pakaian untuk cuaca panas.', 2: 'Tidak ada petunjuk hujan (payung/jas hujan).', 3: 'Angin tidak disebut; ketiga benda itu khas untuk dingin.' }),
    r('ri5', 'Nobody answered when Budi knocked, and the lights were off.', 'What can we infer?', ['People are at home.', 'Nobody is home.', 'It is morning.', 'Budi is late.'], 1, 'nobody answered + lights off', { 0: 'Tidak ada yang menjawab dan lampu mati — tanda rumah kosong.', 2: 'Lampu mati bisa saja malam; waktu tidak bisa disimpulkan.', 3: 'Tidak ada petunjuk tentang janji atau jam.' })
  ];

  var BY_ID = {};
  ITEMS.forEach(function (it) { BY_ID[it.id] = it; });

  function itemsFor(skill) { return ITEMS.filter(function (it) { return it.skill === skill; }); }
  // Rekonstruksi soal statis, hasil-generate ('gpt:'/'gpq:'), dan hasil-acak ('base~oXXXX').
  function byId(id) {
    id = String(id || '');
    var vi = id.indexOf('~o');
    if (vi > -1) {
      var base = byId(id.slice(0, vi)), order = id.slice(vi + 2).split('').map(Number);
      return base ? applyOrder(base, order, id) : null;
    }
    if (BY_ID[id]) return BY_ID[id];
    var m = id.match(/^g(pt|pq):(\d+):(\d+):(\d+)$/);
    if (m) return (m[1] === 'pq' ? pastQItem : pastTenseItem)(+m[2], +m[3], +m[4]);
    var f = id.match(/^g(vc|ld|ri):(\d+)$/);
    if (f) return (f[1] === 'vc' ? vfItem : f[1] === 'ld' ? ldItem : riItem)(+f[2]);
    var p = id.match(/^gpi:(\d+):(\d+):(\d+):(\d+)$/);
    if (p) return picItem(+p[1], +p[2], +p[3], +p[4]);
    return null;
  }

  function seededShuffle(list, seed) {
    var arr = list.slice(), s = (Number(seed) || 1) >>> 0;
    for (var i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      var j = s % (i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function pick(skill, n, seed) {
    return seededShuffle(itemsFor(skill), seed || 7).slice(0, Math.max(0, n | 0));
  }

  // ---- Mesin variasi + anti-pengulangan -------------------------------------------------
  // Agar murid tidak bosan: soal yang sudah diuji dihindari, dan bila stok pola habis, soal
  // grammar dibuat baru dari template (subjek × kata kerja × penanda waktu). Untuk bank
  // terbatas (vocab/listening/reading) urutan pilihan diacak ulang supaya terasa segar.

  var GEN_VERBS = [
    { b: 'go', p: 'went', s: 'goes', ing: 'going', obj: 'to the market' },
    { b: 'watch', p: 'watched', s: 'watches', ing: 'watching', obj: 'a movie' },
    { b: 'finish', p: 'finished', s: 'finishes', ing: 'finishing', obj: 'the homework' },
    { b: 'play', p: 'played', s: 'plays', ing: 'playing', obj: 'football' },
    { b: 'visit', p: 'visited', s: 'visits', ing: 'visiting', obj: 'their grandmother' },
    { b: 'clean', p: 'cleaned', s: 'cleans', ing: 'cleaning', obj: 'the kitchen' },
    { b: 'call', p: 'called', s: 'calls', ing: 'calling', obj: 'a friend' },
    { b: 'study', p: 'studied', s: 'studies', ing: 'studying', obj: 'English' },
    { b: 'cook', p: 'cooked', s: 'cooks', ing: 'cooking', obj: 'dinner' },
    { b: 'eat', p: 'ate', s: 'eats', ing: 'eating', obj: 'breakfast' },
    { b: 'buy', p: 'bought', s: 'buys', ing: 'buying', obj: 'a new phone' },
    { b: 'see', p: 'saw', s: 'sees', ing: 'seeing', obj: 'an old friend' },
    { b: 'write', p: 'wrote', s: 'writes', ing: 'writing', obj: 'a letter' },
    { b: 'take', p: 'took', s: 'takes', ing: 'taking', obj: 'the bus' },
    { b: 'give', p: 'gave', s: 'gives', ing: 'giving', obj: 'a present' },
    { b: 'meet', p: 'met', s: 'meets', ing: 'meeting', obj: 'her cousin' },
    { b: 'lose', p: 'lost', s: 'loses', ing: 'losing', obj: 'his keys' },
    { b: 'find', p: 'found', s: 'finds', ing: 'finding', obj: 'the answer' },
    { b: 'travel', p: 'travelled', s: 'travels', ing: 'travelling', obj: 'to Bali' },
    { b: 'speak', p: 'spoke', s: 'speaks', ing: 'speaking', obj: 'to the teacher' }
  ];
  var GEN_SUBJ = [
    { s: 'I', low: 'I' }, { s: 'We', low: 'we' }, { s: 'They', low: 'they' }, { s: 'She', low: 'she' },
    { s: 'He', low: 'he' }, { s: 'My father', low: 'my father' }, { s: 'The students', low: 'the students' }, { s: 'My friends', low: 'my friends' }
  ];
  var GEN_TIME = ['yesterday', 'last week', 'last night', 'two days ago', 'last month', 'this morning'];

  function pastTenseItem(vi, si, ti) {
    var v = GEN_VERBS[vi % GEN_VERBS.length], su = GEN_SUBJ[si % GEN_SUBJ.length], tm = GEN_TIME[ti % GEN_TIME.length];
    return {
      id: 'gpt:' + (vi % GEN_VERBS.length) + ':' + (si % GEN_SUBJ.length) + ':' + (ti % GEN_TIME.length), skill: 'past_tense',
      prompt: su.s + ' ___ ' + v.obj + ' ' + tm + '.', options: [v.b, v.p, v.s, v.ing], answer: 1, marker: tm,
      why: { 0: '“' + v.b + '” ' + V1, 2: '“' + v.s + '” ' + S3, 3: '“' + v.ing + '” ' + ING },
      note: 'Penanda waktu “' + tm + '” meminta bentuk lampau (verb 2).'
    };
  }
  function pastQItem(vi, si, ti) {
    var v = GEN_VERBS[vi % GEN_VERBS.length], su = GEN_SUBJ[si % GEN_SUBJ.length], tm = GEN_TIME[ti % GEN_TIME.length];
    return {
      id: 'gpq:' + (vi % GEN_VERBS.length) + ':' + (si % GEN_SUBJ.length) + ':' + (ti % GEN_TIME.length), skill: 'past_questions',
      prompt: 'Did ' + su.low + ' ___ ' + v.obj + ' ' + tm + '?', options: [v.b, v.p, v.s, v.ing], answer: 0, marker: 'did',
      why: { 1: '“' + v.p + '” menandai lampau dua kali. ' + AFTER_DID, 2: '“' + v.s + '” ' + S3, 3: '“' + v.ing + '” ' + ING },
      note: 'Pertanyaan lampau: did + subject + verb 1.'
    };
  }
  // Template data untuk vocab/listening/reading (tak-terbatas seperti grammar: dipilih per
  // seed lalu urutan pilihan diacak variant()). Bentuk: [prompt/dialog/passage, jawaban,
  // [3 distraktor], kata kunci, [3 alasan distraktor]].
  var VF = [
    ['She was very ___ after she won the prize.', 'happy', ['sad', 'angry', 'tired'], 'won the prize', ['“sad” (sedih) bertentangan dengan menang.', '“angry” (marah) bertentangan dengan menang.', '“tired” (lelah) tidak dijelaskan konteks.']],
    ['I need an ___ because it is raining.', 'umbrella', ['apple', 'onion', 'engine'], 'it is raining', ['“apple” tidak melindungi dari hujan.', '“onion” tidak berhubungan.', '“engine” tidak berhubungan.']],
    ['The soup is too ___; I added more water.', 'salty', ['sweet', 'empty', 'quiet'], 'added more water', ['“sweet” tidak diperbaiki dengan air.', '“empty” bukan sifat rasa.', '“quiet” bukan sifat rasa.']],
    ['He is ___ because he did not sleep last night.', 'sleepy', ['excited', 'hungry', 'proud'], 'did not sleep', ['“excited” tidak cocok dengan kurang tidur.', '“hungry” soal lapar, bukan tidur.', '“proud” tidak berhubungan.']],
    ['Please ___ the door; it is cold outside.', 'close', ['open', 'break', 'paint'], 'it is cold outside', ['“open” justru menambah dingin.', '“break” berarti merusak.', '“paint” berarti mengecat.']],
    ['We arrived ___ so we missed the first bus.', 'late', ['early', 'quickly', 'safely'], 'missed the first bus', ['“early” bertentangan dengan ketinggalan bus.', '“quickly” tidak menjelaskan sebab.', '“safely” tidak menjelaskan sebab.']],
    ['This box is very ___; I cannot lift it.', 'heavy', ['light', 'cheap', 'clean'], 'cannot lift it', ['“light” bertentangan dengan tak terangkat.', '“cheap” soal harga.', '“clean” soal kebersihan.']],
    ['She ___ money every month to buy a laptop.', 'saves', ['spends', 'loses', 'throws'], 'to buy a laptop', ['“spends” justru menghabiskan.', '“loses” berarti kehilangan.', '“throws” berarti membuang.']],
    ['The museum is ___ on Mondays, so come on Tuesday.', 'closed', ['open', 'free', 'busy'], 'come on Tuesday', ['“open” bertentangan dengan datang hari lain.', '“free” soal biaya.', '“busy” tidak menjelaskan.']],
    ['My grandmother is very ___; she helps everyone.', 'kind', ['rude', 'lazy', 'noisy'], 'helps everyone', ['“rude” bertentangan dengan menolong.', '“lazy” bertentangan dengan menolong.', '“noisy” tidak berhubungan.']],
    ['Turn ___ the lights when you leave the room.', 'off', ['on', 'up', 'in'], 'when you leave', ['“on” justru menyalakan.', '“up” tidak dipakai untuk lampu di sini.', '“in” tidak cocok.']],
    ['The test was ___, so most students passed.', 'easy', ['difficult', 'expensive', 'loud'], 'most students passed', ['“difficult” bertentangan dengan banyak lulus.', '“expensive” soal harga.', '“loud” soal suara.']],
    ['I am ___; can we stop for lunch?', 'hungry', ['full', 'sleepy', 'angry'], 'stop for lunch', ['“full” bertentangan dengan minta makan.', '“sleepy” soal kantuk.', '“angry” soal marah.']],
    ['He speaks English ___; everyone understands him.', 'clearly', ['badly', 'slowly', 'rarely'], 'everyone understands', ['“badly” bertentangan dengan mudah dimengerti.', '“slowly” belum tentu jelas.', '“rarely” soal frekuensi.']],
    ['We ___ a table before going to the restaurant.', 'booked', ['cooked', 'cleaned', 'sold'], 'before going to the restaurant', ['“cooked” bukan yang dilakukan tamu.', '“cleaned” tidak cocok.', '“sold” berarti menjual.']],
    ['The road is ___, so drive carefully.', 'wet', ['dry', 'wide', 'new'], 'drive carefully', ['“dry” tidak menuntut hati-hati.', '“wide” soal lebar.', '“new” soal usia jalan.']]
  ];
  var LF = [
    ['A: What time is the meeting?\nB: At three, but please come at ten to three.', 'When should they arrive?', '2:50', ['3:00', '3:10', '2:30'], 'ten to three', ['3:00 adalah jam mulai, bukan jam datang.', '3:10 tidak disebut.', '2:30 tidak disebut.']],
    ['A: Would you like tea or juice?\nB: Juice, please, but without ice.', 'What does B want?', 'Juice without ice', ['Tea with ice', 'Juice with ice', 'Tea without ice'], 'without ice', ['B memilih jus, bukan teh.', 'B menolak es.', 'B memilih jus.']],
    ['A: How many people are coming?\nB: Ten adults and five children.', 'How many children are coming?', 'Five', ['Ten', 'Fifteen', 'Two'], 'five children', ['Sepuluh adalah jumlah dewasa.', 'Lima belas adalah total.', 'Dua tidak disebut.']],
    ['A: Where did you leave the umbrella?\nB: By the door, not in the car.', 'Where is the umbrella?', 'By the door', ['In the car', 'On the chair', 'At school'], 'not in the car', ['B menegaskan bukan di mobil.', 'Kursi tidak disebut.', 'Sekolah tidak disebut.']],
    ['A: Is the shop open now?\nB: Yes, until nine, but closed tomorrow.', 'When is the shop closed?', 'Tomorrow', ['Now', 'At nine tonight', 'On weekends'], 'closed tomorrow', ['Sekarang buka.', 'Jam sembilan tutup harian, bukan hari libur.', 'Akhir pekan tidak disebut.']],
    ['A: Shall we meet Monday?\nB: Monday is hard. Thursday is better for me.', 'When will they likely meet?', 'Thursday', ['Monday', 'Tuesday', 'Friday'], 'Thursday is better', ['B bilang Senin sulit.', 'Selasa tidak disebut.', 'Jumat tidak disebut.']],
    ['A: How much is the notebook?\nB: Three dollars each, or five for two.', 'How much for two notebooks?', 'Five dollars', ['Three dollars', 'Six dollars', 'Ten dollars'], 'five for two', ['Tiga dolar untuk satu.', 'Enam adalah 3×2 tanpa diskon.', 'Sepuluh tidak disebut.']],
    ['A: Did the train arrive?\nB: Not yet. It is twenty minutes late.', 'What happened to the train?', 'It is late', ['It arrived early', 'It was cancelled', 'It is on time'], 'twenty minutes late', ['Justru terlambat, bukan lebih awal.', 'Tidak dibatalkan.', 'Tidak tepat waktu.']],
    ['A: Which bag is yours?\nB: The small black one, not the big brown one.', 'Which bag is B\u2019s?', 'Small black', ['Big brown', 'Small brown', 'Big black'], 'small black one', ['B menolak yang cokelat besar.', 'Warna salah.', 'Ukuran salah.']],
    ['A: What is the homework?\nB: Read page ten, and answer only question two.', 'Which question must be answered?', 'Question two', ['Question ten', 'All questions', 'No questions'], 'only question two', ['Sepuluh adalah nomor halaman.', 'Hanya satu soal.', 'Ada satu soal yang dikerjakan.']]
  ];
  var RF = [
    ['Rudi packed sunscreen, a hat, and his swimming shorts.', 'Where is Rudi probably going?', 'To the beach', ['To school', 'To a meeting', 'To bed'], 'sunscreen, hat, swimming shorts', ['Sekolah tidak butuh baju renang.', 'Rapat tidak butuh baju renang.', 'Tidur tidak butuh itu.']],
    ['The streets were empty and all the shops had their lights off.', 'What can we infer?', 'It is very late at night', ['It is a busy morning', 'It is a holiday sale', 'It is raining hard'], 'empty + lights off', ['Pagi sibuk tidak sepi.', 'Obral membuat toko menyala.', 'Hujan tidak dijelaskan.']],
    ['Dina kept yawning and rubbing her eyes during the film.', 'How does Dina feel?', 'Sleepy', ['Excited', 'Angry', 'Hungry'], 'yawning + rubbing her eyes', ['Antusias tidak menguap terus.', 'Marah tidak dijelaskan.', 'Lapar tidak dijelaskan.']],
    ['Everyone clapped and the singer smiled and bowed.', 'What just happened?', 'A performance ended', ['A test started', 'A fight began', 'A meal was served'], 'clapped + bowed', ['Ujian tidak bertepuk tangan.', 'Tidak ada tanda pertengkaran.', 'Tidak ada makanan.']],
    ['Andi checked the map twice and asked a stranger for directions.', 'What can we infer about Andi?', 'He is lost', ['He is a tour guide', 'He is very tired', 'He is late for work'], 'checked map + asked directions', ['Pemandu tidak perlu bertanya arah.', 'Lelah tidak dijelaskan.', 'Terlambat tidak dijelaskan.']],
    ['The plants were brown and the soil was dry and cracked.', 'What can we infer?', 'They have not been watered', ['It rained a lot', 'It is winter', 'They are plastic'], 'brown + dry cracked soil', ['Hujan banyak membuat tanah basah.', 'Musim dingin tidak dijelaskan.', 'Tidak ada tanda plastik.']],
    ['Sari put on a thick coat, gloves, and a woollen hat.', 'What is the weather like?', 'Very cold', ['Very hot', 'Rainy', 'Windy only'], 'coat, gloves, woollen hat', ['Panas tidak butuh mantel tebal.', 'Tidak ada payung/jas hujan.', 'Ketiganya khas dingin, bukan hanya angin.']],
    ['The baby stopped crying as soon as her mother held her.', 'Why did the baby stop crying?', 'She felt safe with her mother', ['She was hungry', 'The room was dark', 'She saw a toy'], 'as soon as her mother held her', ['Lapar tidak dijelaskan sebagai sebab berhenti.', 'Kegelapan tidak disebut.', 'Mainan tidak disebut.']],
    ['Tono studied all week and smiled when he saw his grade.', 'What can we infer about the grade?', 'It was good', ['It was bad', 'It was missing', 'It was late'], 'studied all week + smiled', ['Senyum tidak cocok dengan nilai buruk.', 'Nilai tidak hilang.', 'Tidak ada soal keterlambatan.']],
    ['The waiter brought menus and filled the glasses with water.', 'Where are they?', 'At a restaurant', ['At a library', 'At a hospital', 'At a bus stop'], 'waiter + menus', ['Perpustakaan tidak ada pelayan/menu.', 'Rumah sakit tidak begitu.', 'Halte bus tidak begitu.']]
  ];
  function vfItem(i) { var f = VF[i % VF.length]; return { id: 'gvc:' + (i % VF.length), skill: 'vocab_a2', prompt: f[0], options: [f[1]].concat(f[2]), answer: 0, marker: f[3], why: { 1: f[4][0], 2: f[4][1], 3: f[4][2] }, note: 'Petunjuk konteksnya: “' + f[3] + '”.' }; }
  function ldItem(i) { var f = LF[i % LF.length]; return { id: 'gld:' + (i % LF.length), skill: 'listening_detail', context: f[0], contextKind: 'dialogue', prompt: f[1], options: [f[2]].concat(f[3]), answer: 0, marker: f[4], why: { 1: f[5][0], 2: f[5][1], 3: f[5][2] }, note: 'Kata kuncinya: “' + f[4] + '”.' }; }
  function riItem(i) { var f = RF[i % RF.length]; return { id: 'gri:' + (i % RF.length), skill: 'reading_inference', context: f[0], contextKind: 'passage', prompt: f[1], options: [f[2]].concat(f[3]), answer: 0, marker: f[4], why: { 1: f[5][0], 2: f[5][1], 3: f[5][2] }, note: 'Kesimpulannya datang dari petunjuk “' + f[4] + '”, bukan kalimat yang tertulis langsung.' }; }

  // Soal bergambar: pictogram SVG garis (24×24, offline, tanpa aset eksternal). [kata, arti, svg]
  var S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  var PIC = [
    ['apple', 'apel', '<path d="M12 7c-3-2-7 0-7 5 0 4 2.5 8 5 8 1 0 1.5-.5 2-.5s1 .5 2 .5c2.5 0 5-4 5-8 0-5-4-7-7-5z"/><path d="M12 7V4"/><path d="M12 5c1.5-2 3.5-2 4.5-1.5C15.5 5 13.5 5.5 12 5z"/>'],
    ['umbrella', 'payung', '<path d="M3 12a9 9 0 0 1 18 0H3z"/><path d="M12 12v7a2 2 0 0 0 4 0"/><path d="M12 3v1"/>'],
    ['bus', 'bus', '<rect x="4" y="4" width="16" height="14" rx="2"/><path d="M4 11h16"/><path d="M8 4v7M16 4v7"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/>'],
    ['key', 'kunci', '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l2 2M15 8l2 2"/>'],
    ['book', 'buku', '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/><path d="M9 7h6"/>'],
    ['cup', 'cangkir', '<path d="M5 9h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 11h1a2.5 2.5 0 0 1 0 5h-1"/><path d="M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3"/>'],
    ['chair', 'kursi', '<path d="M7 3h10v9H7z"/><path d="M5 12h14v4H5z"/><path d="M6 16v5M18 16v5"/>'],
    ['clock', 'jam', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ['sun', 'matahari', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    ['cloud', 'awan', '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z"/>'],
    ['bicycle', 'sepeda', '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h4l4 8"/><path d="M10 8h-2M14 8l-3 8"/>'],
    ['house', 'rumah', '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'],
    ['phone', 'telepon', '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'],
    ['fish', 'ikan', '<path d="M3 12s4-6 10-6 8 6 8 6-2 6-8 6-10-6-10-6z"/><path d="M3 12l-1-4M3 12l-1 4"/><circle cx="16" cy="11" r="1"/>'],
    ['tree', 'pohon', '<path d="M12 3l6 8h-3l4 5H5l4-5H6z"/><path d="M12 16v5"/>'],
    ['star', 'bintang', '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
    ['car', 'mobil', '<path d="M4 15l2-6h12l2 6"/><rect x="3" y="15" width="18" height="4" rx="1"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M8 9V7h8v2"/>'],
    ['bed', 'tempat tidur', '<path d="M3 18V8"/><path d="M3 12h18v6"/><path d="M5 12V9h6v3"/><path d="M3 18h18"/>'],
    ['glasses', 'kacamata', '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3"/><path d="M3.5 14L5 8M20.5 14L19 8"/>'],
    ['bag', 'tas', '<path d="M5 9h14l-1 12H6z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>']
  ];
  function picItem(w, d1, d2, d3) {
    var n = PIC.length; w %= n; d1 %= n; d2 %= n; d3 %= n;
    var pick3 = [d1, d2, d3], seen = { }; seen[w] = true;
    var ds = [];
    pick3.forEach(function (d) { var k = d; while (seen[k]) k = (k + 1) % n; seen[k] = true; ds.push(k); });
    var why = {};
    ds.forEach(function (k, i) { why[i + 1] = '“' + PIC[k][0] + '” berarti ' + PIC[k][1] + ' — bukan benda di gambar.'; });
    return { id: 'gpi:' + w + ':' + ds.join(':'), skill: 'vocab_a2', contextKind: 'picture', picture: PIC[w][2], pictureAlt: PIC[w][1], prompt: 'Kata Inggris apa yang cocok untuk gambar ini?', options: [PIC[w][0]].concat(ds.map(function (k) { return PIC[k][0]; })), answer: 0, marker: PIC[w][1], why: why, note: 'Gambar menunjukkan ' + PIC[w][1] + '.' };
  }
  // Soal kanonik dari seed (jawaban di posisi tetap); generated() mengacak urutannya.
  function canonicalFor(skill, seed) {
    var s = (Number(seed) || 1) >>> 0;
    if (skill === 'vocab_a2') {
      // Selang-seling: soal kalimat dan soal bergambar agar latihan kosakata terasa hidup.
      if (s % 2 === 1) return picItem(Math.floor(s / 2), Math.floor(s / 3) + 1, Math.floor(s / 5) + 2, Math.floor(s / 11) + 3);
      return vfItem(Math.floor(s / 2) % VF.length);
    }
    if (skill === 'listening_detail') return ldItem(s % LF.length);
    if (skill === 'reading_inference') return riItem(s % RF.length);
    var vi = s % GEN_VERBS.length, si = (Math.floor(s / 7)) % GEN_SUBJ.length, ti = (Math.floor(s / 53)) % GEN_TIME.length;
    return skill === 'past_questions' ? pastQItem(vi, si, ti) : pastTenseItem(vi, si, ti);
  }
  function generated(skill, seed) { return variant(canonicalFor(skill, seed), seed); }
  function baseId(id) { var i = String(id).indexOf('~o'); return i > -1 ? String(id).slice(0, i) : String(id); }

  /** Klon soal dengan urutan pilihan diacak; id meng-encode urutan agar bisa direkonstruksi. */
  function variant(item, seed) {
    var order = seededShuffle(item.options.map(function (_, i) { return i; }), seed || 3);
    return applyOrder(item, order, item.id + '~o' + order.join(''));
  }
  function applyOrder(item, order, id) {
    var opts = order.map(function (i) { return item.options[i]; });
    var why = {};
    if (item.why) order.forEach(function (old, ni) { if (item.why[old] != null) why[ni] = item.why[old]; });
    return Object.assign({}, item, { id: id, options: opts, answer: order.indexOf(item.answer), why: why });
  }

  /**
   * Ambil n soal SEGAR untuk sebuah skill: hindari id yang sudah pernah diuji (opts.avoid);
   * bila stok grammar habis, buat soal baru dari template; bila bank terbatas habis, acak
   * ulang pilihan soal lama supaya tidak terasa sama.
   */
  function pickFresh(skill, n, opts) {
    opts = opts || {}; n = Math.max(0, n | 0);
    var avoid = {}; (opts.avoid || []).forEach(function (id) { avoid[id] = true; });
    var seed = Number(opts.seed) || 7;
    var pool = itemsFor(skill);
    // Vocabulary: campurkan beberapa soal bergambar ke pool awal agar latihan kosakata hidup sejak soal pertama.
    if (skill === 'vocab_a2') for (var k = 0; k < 4; k++) pool = pool.concat([picItem(seed * 3 + k * 5, seed + k + 1, seed + k * 2 + 2, seed + k * 3 + 3)]);
    var out = seededShuffle(pool.filter(function (it) { return !avoid[it.id]; }), seed).slice(0, n);
    var have = {}, usedBase = {};
    out.forEach(function (it) { have[it.id] = true; usedBase[baseId(it.id)] = true; });
    // Stok statis habis → buat soal baru dari template (semua skill), hindari frame/pola yang
    // sudah dipakai di batch ini dan id yang sudah pernah diuji.
    var guard = 0;
    while (out.length < n && guard < 600) {
      var g = generated(skill, seed + guard * 101 + 13); guard++;
      var b = baseId(g.id);
      if (!avoid[g.id] && !avoid[b] && !have[g.id] && !usedBase[b]) { out.push(g); have[g.id] = true; usedBase[b] = true; }
    }
    if (out.length < n) {
      var base = seededShuffle(itemsFor(skill), seed + 1), j = 0;
      while (out.length < n && base.length) { out.push(variant(base[j % base.length], seed + out.length + 1)); j++; if (j > base.length * 4) break; }
    }
    return out;
  }

  /** Lima soal diagnostic: satu per skill, hindari yang sudah diuji, urutan skill tetap. */
  function diagnosticSet(opts) {
    if (typeof opts === 'number') opts = { seed: opts };
    opts = opts || {};
    var avoid = opts.avoid || [], seed = Number(opts.seed) || 11;
    return SKILL_ORDER.map(function (skill, i) { return pickFresh(skill, 1, { avoid: avoid, seed: seed + i * 17 })[0]; });
  }

  function optionText(item, index) {
    return index == null || index < 0 ? '' : String(item.options[index] == null ? '' : item.options[index]);
  }

  /** Umpan balik yang menjelaskan POLA bahasanya — bukan sekadar "salah". */
  function explain(item, chosen) {
    var correct = chosen === item.answer;
    var picked = optionText(item, chosen), right = optionText(item, item.answer);
    if (correct) {
      return { correct: true, text: 'Tepat. “' + right + '” — ' + item.note + ' Pola: ' + SKILLS[item.skill].pattern + '.' };
    }
    var reason = (item.why && item.why[chosen]) || '';
    var body;
    if (item.skill === 'past_tense' || item.skill === 'past_questions') {
      body = 'Dalam kalimat ini diperlukan “' + right + '” karena ' + (item.marker === 'did' ? 'sudah ada “did” di depannya.' : 'terdapat penanda “' + item.marker + '”.');
    } else if (item.skill === 'vocab_a2') {
      body = item.contextKind === 'picture' ? 'Gambar menunjukkan ' + item.marker + ', jadi kata yang tepat adalah “' + right + '”.' : 'Petunjuk konteksnya “' + item.marker + '” menunjuk ke “' + right + '”.';
    } else if (item.skill === 'listening_detail') {
      body = 'Jawabannya “' + right + '” — dengarkan kata kunci “' + item.marker + '”.';
    } else {
      body = 'Kesimpulan yang paling didukung teks adalah “' + right + '” lewat petunjuk “' + item.marker + '”.';
    }
    return {
      correct: false,
      text: t('review.belum-tepat-pilih', 'Belum tepat. Kamu memilih “{pilihan}”. ').replace('{pilihan}', picked) + (reason ? reason + ' ' : '') + body + t('review.coba-pola', ' Coba lagi dengan pola: {pola}.').replace('{pola}', SKILLS[item.skill].pattern)
    };
  }

  /**
   * Sesi review otomatis untuk tutor/learner: 5–10 soal, tujuan pembelajaran, estimasi durasi,
   * urutan latihan, dan penjelasan pasca-sesi. Tutor tidak menyusun soal dari nol.
   */
  function buildSession(opts) {
    var o = opts || {};
    var skills = (Array.isArray(o.skills) ? o.skills : []).filter(function (s) { return SKILLS[s]; });
    if (!skills.length) skills = ['past_tense'];
    var total = Math.min(10, Math.max(5, Number(o.count) || (skills.length >= 3 ? 10 : skills.length * 5)));
    var seed = Number(o.seed) || 21;
    var per = Math.ceil(total / skills.length), items = [], avoid = (o.avoid || []).slice();
    skills.forEach(function (skill, i) {
      var got = pickFresh(skill, per, { avoid: avoid, seed: seed + i });
      got.forEach(function (it) { avoid.push(it.id); });
      items = items.concat(got);
    });
    items = items.slice(0, total);
    var minutes = Math.max(3, Math.round(items.reduce(function (m, it) { return m + SKILLS[it.skill].minutesPer; }, 0) + 2));
    var order = skills.map(function (skill, i) {
      var count = items.filter(function (it) { return it.skill === skill; }).length;
      return { step: i + 1, skill: skill, title: SKILLS[skill].lesson, count: count, minutes: Math.max(1, Math.round(count * SKILLS[skill].minutesPer)) };
    });
    return {
      id: 'rs-' + seed + '-' + skills.join('-'),
      title: skills.length === 1 ? SKILLS[skills[0]].lesson : 'Sesi review: ' + skills.map(function (s) { return SKILLS[s].short; }).join(' + '),
      skills: skills,
      objectives: skills.map(function (s) { return { skill: s, text: SKILLS[s].objective }; }),
      itemIds: items.map(function (it) { return it.id; }),
      minutes: minutes,
      order: order,
      afterSession: skills.map(function (s) { return { skill: s, text: afterSessionNote(s) }; })
    };
  }

  function afterSessionNote(skill) {
    var map = {
      past_tense: 'Kesalahan paling umum: memakai verb 1 padahal ada penanda waktu lampau. Rekomendasi: satu putaran ulang 5 soal besok, lalu pindah ke Past Questions.',
      past_questions: 'Kesalahan paling umum: menandai lampau dua kali (did + verb 2) dan memakai did untuk kalimat to be. Rekomendasi: bandingkan berpasangan "Did you go" vs "Were you late".',
      vocab_a2: 'Kesalahan paling umum: memilih kata yang bertentangan dengan petunjuk konteks. Rekomendasi: garis bawahi kata kunci sebelum memilih.',
      listening_detail: 'Kesalahan paling umum: menangkap angka/tempat pertama yang terdengar, bukan yang ditanya. Rekomendasi: putar ulang sekali dengan transcript setelah percobaan pertama.',
      reading_inference: 'Kesalahan paling umum: memilih jawaban yang tertulis literal, bukan yang disimpulkan. Rekomendasi: tanya "petunjuk mana yang mendukung?" sebelum menjawab.'
    };
    return map[skill] || '';
  }

  return {
    AREAS: AREAS, SKILLS: SKILLS, SKILL_ORDER: SKILL_ORDER, ITEMS: ITEMS,
    itemsFor: itemsFor, byId: byId, pick: pick, pickFresh: pickFresh, variant: variant, generated: generated, picItem: picItem, PIC: PIC,
    diagnosticSet: diagnosticSet, explain: explain, buildSession: buildSession, afterSessionNote: afterSessionNote
  };
});
