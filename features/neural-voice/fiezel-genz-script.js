/**
 * m025-42 spoken-script shaping — Gen Z register, and the two pronunciation repairs
 * the research round actually measured.
 *
 * OWNER: "gaya bahasanya jangan baku, lebih ke bahasa anak Gen Z."
 *
 * This layer rewrites what is SPOKEN, never what is stored. Lesson content stays in
 * `features/classroom/classroom-lessons-v1.json` exactly as authored, so nothing in
 * the content pipeline, the transcript, or the written UI changes; only the string
 * handed to the engine does. That is what makes the register switchable without a
 * content migration, and reversible if OWNER wants a different register later.
 *
 * Two of the rules are not style at all, they are defect fixes found by round-tripping
 * generated audio back through ASR:
 *
 *   1. A bare single letter glues to its neighbour. "A sama an itu..." came back as
 *      "asaman". Wrapping the letter as a quoted word ("kata 'a' dan kata 'an'") was
 *      the only one of four candidate phrasings that survived the round trip.
 *   2. "diawali bunyi yu" came back as "di awal ibu Nyu" - the English fragment merges
 *      with the Indonesian word before it. "bunyi awalnya seperti yu" survived.
 *
 * Both engines (old Piper and new Supertonic) failed the same way, so these belong to
 * the script layer rather than to any adapter.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FiezelGenZScript = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Formal -> conversational. Deliberately small and boring: every entry is a word a
  // Jakarta teenager would actually say, none is slang that dates within a year
  // ("bestie", "anjay", "gaskeun" are intentionally absent), and none collides with
  // an English lesson term. Matching is word-boundary only, so English target
  // sentences inside a line are left alone.
  var CASUAL = Object.freeze([
    ['sudah', 'udah'],
    ['telah', 'udah'],
    ['tidak', 'nggak'],
    ['tak', 'nggak'],
    ['bukan main', 'keren'],
    ['benar', 'bener'],
    ['membuat', 'bikin'],
    ['seperti', 'kayak'],
    ['bertanya', 'nanya'],
    ['mudah', 'gampang'],
    ['saya', 'aku'],
    ['anda', 'kamu'],
    ['tetapi', 'tapi'],
    ['namun', 'tapi'],
    ['karena', 'soalnya'],
    ['oleh karena itu', 'makanya'],
    ['dengan kata lain', 'jadinya'],
    ['selesai', 'kelar'],
    ['melihat', 'lihat'],
    ['mengucapkan', 'ucapin'],
    ['perhatikan', 'perhatiin'],
    ['mari kita', 'yuk kita'],
    // m025-49: the longer phrase must be listed FIRST, because these are applied in
    // order. "selamat datang" -> "haloo" was turning "selamat datang kembali" into
    // "haloo kembali", which is not a greeting in any register - it loses the "back".
    ['selamat datang kembali', 'balik lagi nih'],
    ['selamat datang', 'haloo']
  ]);

  // Anti-bosan pools. A tutor that opens every lesson with the same word is the
  // boredom OWNER is trying to remove, so the caller rotates instead of repeating.
  var OPENERS = Object.freeze([
    'Haloo!', 'Oke, siap?', 'Yuk!', 'Nah, kita lanjut ya.',
    'Hei, balik lagi nih.', 'Oke, gas!', 'Siap ya?', 'Yuk kita mulai.'
  ]);
  var PRAISES = Object.freeze([
    'Wih, keren banget!', 'Mantap!', 'Nah, bener!', 'Sip, tepat!',
    'Keren, lanjut!', 'Yes, itu dia!', 'Bagus banget!', 'Top, kamu paham!'
  ]);

  /**
   * m025-49 subject welcome, per OWNER: every time Jahran opens a subject the tutor
   * greets him by name and says what they are about to do together - and never twice the
   * same way, because a greeting that repeats is worse than no greeting at all.
   *
   * `{topic}` is filled with the subject on screen. Each line is written to be spoken:
   * short, one breath, opening on an interjection so the persona layer hears it as a
   * greeting and switches to the brighter register instead of the explaining one.
   */
  var WELCOMES = Object.freeze([
    'Halooo Jahran, balik lagi nih! Yuk kita bedah {topic} bareng aku.',
    'Hai Jahran! Siap ya, hari ini kita bongkar {topic} sampai kebiasaan.',
    'Nah, Jahran datang! Kita kupas {topic} pelan-pelan, santai aja.',
    'Halo Jahran, ketemu lagi! Sekarang giliran {topic} yang kita taklukin.',
    'Hei Jahran, mantap kamu balik lagi! Gas kita bedah {topic}.',
    'Yuk Jahran, kita mulai! {topic} kelihatannya ribet, padahal enggak.',
    'Wih, Jahran udah balik! Aku udah siapin {topic} buat kamu.',
    'Halooo Jahran! Hari ini kita ngobrolin {topic}, aku temenin sampai paham.',
    'Hai Jahran, semangat ya! {topic} kita bahas sampai kamu pede.',
    'Nah Jahran, pas banget! Ayo bedah {topic} bareng aku sekarang.'
  ]);

  function escapeRe(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * m025-48 spoken numbers.
   *
   * The engine is a character model with no rule FSTs configured (see the worker's
   * `ruleFsts: ''`), so a digit reaches it as a digit and is read on whatever the
   * training data suggests. In an Indonesian line that is a coin toss, and the two
   * shapes this content actually contains are the ones most likely to lose it:
   * "50.000", where the dot is a thousands separator and not a decimal point, and
   * "07:15", which is a clock time rather than two numbers.
   *
   * A tutor that says "lima puluh ribu" is not a nicer version of one that says the
   * digits - it is the difference between a person and a form reader. So numbers are
   * spelled out here, in the spoken-script layer, where the written lesson text is left
   * exactly as authored.
   */
  var NUM_UNITS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh',
    'delapan', 'sembilan', 'sepuluh', 'sebelas'];

  function numberWords(value) {
    var n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) return String(value);
    if (n < 12) return NUM_UNITS[n];
    if (n < 20) return NUM_UNITS[n - 10] + ' belas';
    if (n < 100) return joinWords(NUM_UNITS[Math.floor(n / 10)] + ' puluh', n % 10);
    if (n < 200) return joinWords('seratus', n % 100);
    if (n < 1000) return joinWords(numberWords(Math.floor(n / 100)) + ' ratus', n % 100);
    if (n < 2000) return joinWords('seribu', n % 1000);
    if (n < 1e6) return joinWords(numberWords(Math.floor(n / 1000)) + ' ribu', n % 1000);
    if (n < 1e9) return joinWords(numberWords(Math.floor(n / 1e6)) + ' juta', n % 1e6);
    if (n < 1e12) return joinWords(numberWords(Math.floor(n / 1e9)) + ' miliar', n % 1e9);
    return digitWords(String(n));
  }
  function joinWords(head, rest) { return rest ? head + ' ' + numberWords(rest) : head; }

  /** Digit by digit, the way a person reads a phone number or a code. */
  function digitWords(text) {
    return String(text).split('').map(function (ch) {
      return /[0-9]/.test(ch) ? NUM_UNITS[Number(ch)] : ch;
    }).join(' ').replace(/\s+/g, ' ').trim();
  }

  // Written short forms nobody pronounces letter by letter.
  var ABBREVIATIONS = Object.freeze([
    ['dll', 'dan lain-lain'],
    ['dsb', 'dan sebagainya'],
    ['dgn', 'dengan'],
    ['tsb', 'tersebut'],
    ['yg', 'yang'],
    ['utk', 'untuk'],
    ['krn', 'karena'],
    ['sbg', 'sebagai'],
    ['tdk', 'nggak'],
    ['jgn', 'jangan']
  ]);

  /** Indonesian reading of the numbers and short forms inside one spoken line. */
  function verbalize(text) {
    var out = String(text == null ? '' : text);
    if (!out.trim()) return '';

    ABBREVIATIONS.forEach(function (pair) {
      // The dot is left in place: in "... dll." it is also the sentence's full stop, and
      // swallowing it costs the line its final fall in intonation.
      var re = new RegExp('(^|[^\\w-])' + escapeRe(pair[0]) + '(?![\\w-])', 'gi');
      out = out.replace(re, function (_m, lead) { return lead + pair[1]; });
    });

    // A clock time is two numbers with a relationship, not two numbers.
    out = out.replace(/(^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g, function (_m, lead, hh, mm) {
      var minute = Number(mm);
      var spoken = numberWords(Number(hh));
      return lead + (minute ? spoken + ' lewat ' + numberWords(minute) : spoken + ' tepat');
    });

    // "ke-3" is an ordinal and joins its number into one word: ketiga, not "ke tiga".
    out = out.replace(/\bke-(\d+)\b/g, function (_m, digits) {
      var n = Number(digits);
      if (n === 1) return 'pertama';
      return 'ke' + numberWords(n).replace(/\s+/g, ' ');
    });

    out = out.replace(/(\d[\d.,]*)\s*%/g, function (_m, number) { return readNumber(number) + ' persen'; });

    // Every remaining run of digits, longest shapes first so a grouped thousand is not
    // read as three separate numbers.
    out = out.replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g, function (match) {
      return readNumber(match);
    });

    return out.replace(/\s+/g, ' ').trim();
  }

  function readNumber(token) {
    var text = String(token).trim();
    var parts = text.split(',');
    var whole = parts[0].replace(/\./g, '');
    var spoken;
    // A leading zero is never a quantity - it is a code, a phone number or a room.
    if (/^0\d/.test(whole)) spoken = digitWords(whole);
    else if (whole.length > 12) spoken = digitWords(whole);
    else spoken = numberWords(Number(whole));
    if (parts.length > 1 && parts[1]) spoken += ' koma ' + digitWords(parts[1]);
    return spoken;
  }

  // "sangat mudah" -> "gampang banget", not "banget gampang": in casual Indonesian the
  // intensifier follows the word it intensifies. A flat word-for-word dictionary gets
  // this backwards, so intensifiers are their own rule.
  function moveIntensifier(text) {
    return String(text)
      .replace(/\bsangat\s+([\w'-]+)/gi, function (_m, word) { return word + ' banget'; })
      .replace(/\b([\w'-]+)\s+sekali\b/gi, function (_m, word) { return word + ' banget'; });
  }

  function matchCase(source, replacement) {
    if (/^[A-Z]/.test(source)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
  }

  /** Formal Indonesian -> the register the tutor speaks in. */
  function casualize(text) {
    var out = moveIntensifier(String(text == null ? '' : text));
    if (!out.trim()) return '';
    CASUAL.forEach(function (pair) {
      var re = new RegExp('(^|[^\\w-])(' + escapeRe(pair[0]) + ')(?![\\w-])', 'gi');
      out = out.replace(re, function (_m, lead, word) { return lead + matchCase(word, pair[1]); });
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  /**
   * Pronunciation repairs. Applied after casualize so the rewritten text is what gets
   * protected, and safe to re-run: a letter already quoted is not quoted again.
   */
  function pronounceable(text) {
    var out = String(text == null ? '' : text);
    if (!out.trim()) return '';

    // "diawali bunyi X" / "diawali dengan bunyi X" -> the phrasing that survived ASR.
    out = out.replace(/\bdiawali\s+(?:dengan\s+)?bunyi\s+/gi, 'bunyi awalnya seperti ');

    // Bare grammar articles spoken as letters. Narrower than it looks on purpose:
    // the defect only appears when the article is NOT starting an English noun phrase -
    // "A sama an itu", "kita pakai a, bukan an" - because there the engine has nothing
    // to bind the letter to except the neighbouring Indonesian word. In "a university
    // student" the article is doing its normal job and must be left exactly as written,
    // or the tutor would say "kata a university student" out loud.
    var FOLLOWERS = ['sama', 'dan', 'atau', 'itu', 'bukan', 'ya', 'nih', 'sih', 'juga'];
    var followRe = '(?:' + FOLLOWERS.map(escapeRe).join('|') + ')';
    ['a', 'an', 'the', 'i'].forEach(function (token) {
      // Adjacent on either side: "... dan an dipakai" is the same defect as "a, bukan an".
      var re = new RegExp(
        "(^|[^\\w'\u2019-])(" + escapeRe(token) + ")(?=\\s*(?:[,.;:!?]|$)|\\s+" + followRe + "\\b)",
        'gi');
      var reAfterConnector = new RegExp(
        "(\\b" + followRe + "\\s+)(" + escapeRe(token) + ")(?![\\w'\u2019-])", 'gi');
      var quote = function (match, lead, word, offset, whole) {
        var before = whole.slice(Math.max(0, offset - 6), offset + lead.length);
        if (/kata\s+'$|'$/.test(before)) return match;
        // A sentence-initial article keeps the sentence's capital on the carrier word,
        // so the line still reads (and is spoken) as a sentence opening.
        var carrier = (offset === 0 && /^[A-Z]/.test(word)) ? 'Kata' : 'kata';
        return lead + carrier + " '" + word.toLowerCase() + "'";
      };
      out = out.replace(re, quote);
      out = out.replace(reAfterConnector, function (match, lead, word, offset, whole) {
        var head = whole.slice(Math.max(0, offset - 6), offset + lead.length);
        if (/kata\s+'$|'$/.test(head)) return match;
        return lead + "kata '" + word.toLowerCase() + "'";
      });
    });

    return out.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
  }

  /**
   * The full spoken-text pipeline for one Indonesian line.
   * English lines are passed through untouched: the casual dictionary is Indonesian,
   * and the target language must never be "made casual" by us.
   */
  function speakable(text, lang) {
    var line = String(text == null ? '' : text);
    if (!line.trim()) return '';
    if (!/^id/i.test(String(lang || 'id'))) return line.replace(/\s+/g, ' ').trim();
    return pronounceable(verbalize(casualize(line)));
  }

  /** Deterministic-but-rotating pick, so a session never repeats twice in a row. */
  function rotate(pool, index) {
    var list = pool && pool.length ? pool : [''];
    var i = Number(index);
    if (!Number.isFinite(i) || i < 0) i = 0;
    return list[Math.floor(i) % list.length];
  }

  function opener(index) { return rotate(OPENERS, index); }
  function praise(index) { return rotate(PRAISES, index); }

  /**
   * The greeting for one subject entry.
   * @param {string} topic subject name as shown on screen
   * @param {number} index how many subjects have been opened before this one
   */
  function welcome(topic, index) {
    // A lesson title is written to be READ - "Articles a / an / the" - and a slash spoken
    // aloud is not a word. Said out loud a person says "atau", so that is what the tutor
    // says; the bare letters are then handled by pronounceable() downstream.
    var subject = String(topic == null ? '' : topic)
      .replace(/\s*[\/|]\s*/g, ' atau ')
      .replace(/\s+/g, ' ')
      .trim();
    // Never leave a hole in the sentence: an unnamed subject is still "this material".
    if (!subject) subject = 'materi ini';
    return rotate(WELCOMES, index).split('{topic}').join(subject);
  }

  return Object.freeze({
    CASUAL: CASUAL,
    OPENERS: OPENERS,
    PRAISES: PRAISES,
    ABBREVIATIONS: ABBREVIATIONS,
    casualize: casualize,
    verbalize: verbalize,
    numberWords: numberWords,
    moveIntensifier: moveIntensifier,
    pronounceable: pronounceable,
    speakable: speakable,
    opener: opener,
    praise: praise,
    WELCOMES: WELCOMES,
    welcome: welcome
  });
}));
