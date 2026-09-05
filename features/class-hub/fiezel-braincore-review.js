/**
 * FIEZEL — fiezel-braincore-review.js · BRAINCORE REVIEW LOKAL untuk soal guru.
 * Murni (tanpa DOM, tanpa jaringan, tanpa Puter/API key). Braincore menyarankan,
 * guru memutuskan: setiap keluaran adalah saran ber-alasan, bukan keputusan.
 * Prior kesulitan tetap milik features/brain/fiezel-item-prior.js (difficultyFor);
 * berkas ini memanggilnya, tidak menirunya.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelBraincoreReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah di berkas ini dulu literal Indonesia,
     jadi murid yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft:
     kalau copy-map belum termuat, fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }
  var LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var SKILL_LABEL = { past_tense: 'Past tense', past_questions: 'Past questions', vocab_a2: 'Vocabulary A2', listening_detail: 'Listening detail', reading_inference: 'Reading inference', grammar: 'Grammar', vocabulary: 'Vocabulary', reading: 'Reading', listening: 'Listening', speaking: 'Speaking' };
  var SKILL_DOMAIN = { past_tense: 'grammar', past_questions: 'grammar', vocab_a2: 'vocabulary', listening_detail: 'listening', reading_inference: 'reading', grammar: 'grammar', vocabulary: 'vocabulary', reading: 'reading', listening: 'listening', speaking: 'speaking' };
  var REMEDIATION = { past_tense: 'Mini lesson: Past Simple (penanda waktu → verb 2)', past_questions: 'Mini lesson: Past Questions (did + verb 1)', vocab_a2: 'Review: Vocabulary A2 dalam konteks', listening_detail: 'Sesi listening detail dialog pendek', reading_inference: 'Review: Reading inference (petunjuk → kesimpulan)', grammar: 'Mini lesson grammar sesuai pola soal', vocabulary: 'Review kosakata dalam konteks', reading: 'Latihan membaca terpandu', listening: 'Latihan menyimak detail' };
  var MIS = {
    'agreement.bare_form': 'Bentuk dasar dipakai tanpa infleksi wajib',
    'tense_aspect.timeline_mismatch': 'Tense tidak cocok dengan garis waktu kalimat',
    'tense_aspect.progressive_overuse': 'Bentuk -ing dipakai berlebihan',
    'tense_aspect.perfect_misuse': 'Perfect dipakai/dilewatkan pada urutan waktu yang salah',
    'structure.double_marking': 'Penandaan ganda yang mubazir (did + verb 2)',
    'agreement.number_mismatch': 'Kesesuaian jumlah subjek-kata kerja salah',
    'question.auxiliary_error': 'Kata bantu pertanyaan salah tense atau jenis',
    'lexical.form_confusion': 'Bentuk/kata mirip tertukar makna',
    'prepositions.semantic_category': 'Kategori makna preposisi tertukar',
    'articles.sound_rule': 'Aturan bunyi a vs an salah terap',
    'articles.definiteness_mismatch': 'Kepastian rujukan (a/an vs the) salah pilih',
    'modality.function_confusion': 'Fungsi modal tertukar',
    'pronouns.case_form': 'Kasus pronomina tertukar',
    'comparison.form_intensifier': 'Bentuk komparatif/superlatif salah'
  };
  var IRREGULAR_PAST = ['went', 'saw', 'ate', 'drank', 'took', 'gave', 'came', 'made', 'had', 'did', 'said', 'got', 'wrote', 'read', 'ran', 'sat', 'spoke', 'bought', 'brought', 'thought', 'taught', 'caught', 'left', 'met', 'slept', 'felt', 'kept', 'told', 'sold', 'found', 'built', 'sent', 'spent', 'lost', 'paid', 'heard', 'held', 'stood', 'understood', 'won', 'swam', 'began', 'broke', 'chose', 'drove', 'fell', 'flew', 'forgot', 'knew', 'grew', 'threw', 'wore', 'woke', 'rode', 'rose', 'sang', 'was', 'were'];
  var TIME_PAST = /\b(yesterday|ago|last (night|week|month|year|summer)|in \d{4}|when i was|this morning)\b/i;
  var PREPS = ['in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'about', 'of', 'into', 'over', 'under'];
  var MODALS = ['can', 'could', 'may', 'might', 'must', 'should', 'would', 'will', 'shall'];
  var PRONOUNS = ['i', 'me', 'my', 'mine', 'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'we', 'us', 'our', 'it', 'its'];

  function str(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function lower(v) { return str(v).toLowerCase(); }
  function words(t) { return lower(t).replace(/_+/g, ' ').match(/[a-z']+/g) || []; }
  function uid(p) { return p + '-' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7); }
  function isPastForm(w) { w = lower(w); return /ed$/.test(w) && w.length > 3 || IRREGULAR_PAST.indexOf(w) !== -1; }
  function isIng(w) { return /ing$/.test(lower(w)) && w.length > 4; }
  function isThirdS(w) { w = lower(w); return /[^s]s$/.test(w) && !/ss$/.test(w) && w.length > 3; }
  function isBase(w) { w = lower(w); return /^[a-z]+$/.test(w) && !isPastForm(w) && !isIng(w) && !isThirdS(w); }
  function allIn(list, set) { return list.length > 0 && list.every(function (o) { return set.indexOf(lower(o)) !== -1; }); }

  // ---- 1. Parser impor (pipe / CSV / TSV / blok A–D) --------------------------------------
  function answerIndex(raw, options) {
    var v = str(raw); if (!v) return -1;
    if (/^[A-Fa-f]$/.test(v)) return v.toUpperCase().charCodeAt(0) - 65;
    if (/^\d+$/.test(v)) { var n = Number(v); return n >= 1 && n <= options.length ? n - 1 : -1; }
    for (var i = 0; i < options.length; i++) if (lower(options[i]) === lower(v)) return i;
    return -1;
  }
  function parseLine(line) {
    var sep = line.indexOf('|') !== -1 ? '|' : line.indexOf('\t') !== -1 ? '\t' : line.indexOf(';') !== -1 ? ';' : ',';
    var parts = line.split(sep).map(str).filter(Boolean);
    if (parts.length < 4) return null;
    var prompt = parts[0], rest = parts.slice(1), ansRaw = rest[rest.length - 1], options = rest.slice(0, -1);
    var idx = answerIndex(ansRaw, options);
    if (idx < 0 && rest.length >= 3) { options = rest; idx = 0; return { prompt: prompt, options: options, answer: 0, note: 'jawaban tak tertulis — pilihan pertama dianggap benar' }; }
    if (idx < 0) return null;
    return { prompt: prompt, options: options, answer: idx };
  }
  function parseBlocks(text) {
    var out = [], cur = null;
    text.split(/\r?\n/).forEach(function (raw) {
      var line = str(raw); if (!line) return;
      var opt = line.match(/^\(?([A-Fa-f])[.)]\s*(.+)$/);
      var ans = line.match(/^(answer|jawaban|kunci)\s*[:=]\s*(.+)$/i);
      if (ans && cur) { cur.answerRaw = ans[2]; return; }
      if (opt && cur) { cur.options.push(str(opt[2])); return; }
      if (cur && cur.options.length >= 2) { out.push(cur); cur = null; }
      cur = { prompt: line.replace(/^\d+[.)]\s*/, ''), options: [], answerRaw: '' };
    });
    if (cur && cur.options.length >= 2) out.push(cur);
    return out.map(function (b) { var idx = answerIndex(b.answerRaw, b.options); return { prompt: b.prompt, options: b.options, answer: idx < 0 ? 0 : idx, note: idx < 0 ? 'kunci tak terbaca — pilihan A dianggap benar' : undefined }; });
  }
  /** parseQuestions(text) -> { items:[{id,prompt,options,answer,note?}], errors:[{line,text}] } */
  function parseQuestions(text) {
    var lines = String(text || '').split(/\r?\n/), items = [], errors = [];
    var looksBlock = lines.some(function (l) { return /^\(?[A-Da-d][.)]\s+\S/.test(str(l)); });
    if (looksBlock) items = parseBlocks(text);
    else lines.forEach(function (l, i) { var t = str(l); if (!t) return; var q = parseLine(t); if (q) items.push(q); else errors.push({ line: i + 1, text: t.slice(0, 80) }); });
    items = items.slice(0, 40).map(function (q) { q.id = uid('tq'); q.options = q.options.slice(0, 6); return q; });
    return { items: items, errors: errors };
  }

  // ---- 2. Estimasi CEFR (heuristik, dinyatakan sebagai estimasi) ----------------------------
  function estimateCefr(text, prior) {
    var t = lower(text), ws = words(t), n = ws.length || 1;
    var avgLen = ws.reduce(function (m, w) { return m + w.length; }, 0) / n;
    var sentences = t.split(/[.!?]+/).filter(function (s) { return str(s); }).length || 1;
    var perSentence = n / sentences, score = 0, why = [];
    if (perSentence > 9) { score += 1; why.push('kalimat panjang'); }
    if (perSentence > 15) { score += 1; }
    if (avgLen > 4.6) { score += 1; why.push('kata rata-rata panjang'); }
    if (avgLen > 5.4) { score += 1; }
    if (/\b(have|has|had)\s+(been|\w+ed|\w+en)\b/.test(t)) { score += 1; why.push('perfect'); }
    if (/\bif\b[^.]*\b(would|could|might)\b/.test(t)) { score += 1; why.push('conditional'); }
    if (/\b(was|were|is|are|been|be)\s+\w+(ed|en)\b/.test(t)) { score += 1; why.push('passive'); }
    if (/\b(which|whose|whom|although|whereas|despite|nevertheless)\b/.test(t)) { score += 1; why.push('klausa kompleks'); }
    var idx = Math.min(4, score <= 0 ? 0 : score <= 1 ? 1 : score <= 3 ? 2 : score <= 4 ? 3 : 4);
    var priorIdx = LEVELS.indexOf(String(prior || '').toUpperCase());
    if (priorIdx >= 0 && Math.abs(priorIdx - idx) > 1) { idx = priorIdx > idx ? idx + 1 : idx - 1; why.push('ditarik ke level kelas ' + LEVELS[priorIdx]); }
    return { level: LEVELS[idx], rationale: why.length ? why.join(', ') : 'kalimat pendek, kosakata dasar' };
  }

  // ---- 3. Tebakan skill -----------------------------------------------------------------------
  function guessSkill(q, hint) {
    var opts = (q.options || []).map(lower), stem = lower(q.prompt);
    if (hint && SKILL_DOMAIN[hint] && hint !== 'grammar') return hint;
    var verbish = opts.length >= 3 && opts.filter(function (o) { return /^[a-z]+$/.test(o); }).length === opts.length && opts.some(isPastForm) && (opts.some(isBase) || opts.some(isIng));
    if (verbish && /^did\b/.test(stem)) return 'past_questions';
    if (verbish && (TIME_PAST.test(stem) || opts.some(isPastForm))) return 'past_tense';
    if (q.context && str(q.context).length > 160) return 'reading_inference';
    if (/\b(dialog|conversation|listen|audio)\b/.test(stem)) return 'listening_detail';
    if (allIn(opts, PREPS) || allIn(opts, MODALS) || allIn(opts, PRONOUNS) || allIn(opts, ['a', 'an', 'the', '-', 'no article'])) return 'grammar';
    if (opts.length && opts.every(function (o) { return /^[a-z-]+$/.test(o); }) && /___|\.\.\./.test(stem)) return hint === 'grammar' ? 'grammar' : 'vocab_a2';
    return hint || 'grammar';
  }

  // ---- 4. Kesulitan (delegasi ke FiezelItemPrior bila ada) ----------------------------------
  function prior() { try { return root && root.FiezelItemPrior ? root.FiezelItemPrior : (typeof require === 'function' ? require('../brain/fiezel-item-prior.js') : null); } catch (_) { return null; } }
  function difficulty(level, domain, stemLength) {
    var P = prior();
    if (P && P.difficultyFor) return P.difficultyFor({ level: level, domain: domain, stemLength: stemLength });
    var idx = LEVELS.indexOf(level); return (idx < 0 ? 0 : idx) + 1 + (stemLength > 120 ? 0.15 : 0);
  }
  function band(d) { return d < 2.2 ? 'mudah' : d < 3.6 ? 'sedang' : 'sulit'; }

  // ---- 5. Pemeriksaan kualitas -----------------------------------------------------------------
  function qualityChecks(q) {
    var issues = [], opts = (q.options || []).map(str), stem = str(q.prompt), ans = opts[q.answer];
    if (!stem) issues.push({ code: 'no_stem', severity: 'error', text: 'Stem soal kosong.' });
    if (opts.length < 3) issues.push({ code: 'few_options', severity: 'warn', text: 'Kurang dari 3 pilihan — peluang menebak ≥50%.' });
    if (q.answer == null || q.answer < 0 || q.answer >= opts.length) issues.push({ code: 'no_answer', severity: 'error', text: 'Kunci jawaban tidak menunjuk salah satu pilihan.' });
    var seen = {}; opts.forEach(function (o) { var k = lower(o); if (seen[k]) issues.push({ code: 'duplicate_options', severity: 'error', text: 'Pilihan ganda kembar: “' + o + '”.' }); seen[k] = 1; });
    if (ans) {
      var others = opts.filter(function (_, i) { return i !== q.answer; }), avg = others.length ? others.reduce(function (m, o) { return m + o.length; }, 0) / others.length : 0;
      if (avg && ans.length > avg * 1.6 && ans.length - avg > 4) issues.push({ code: 'answer_length_bias', severity: 'warn', text: 'Jawaban benar jauh lebih panjang dari distraktor — mudah ditebak.' });
    }
    if (stem.length > 160) issues.push({ code: 'stem_too_long', severity: 'info', text: 'Stem > 160 karakter — beban baca naik (prior +0.15).' });
    if (!/___|\.\.\.|\?$/.test(stem) && opts.every(function (o) { return words(o).length <= 2; })) issues.push({ code: 'no_blank', severity: 'warn', text: 'Tidak ada tanda rumpang (___) atau tanda tanya — murid tidak tahu di mana mengisi.' });
    if (opts.some(function (o) { return /all of the above|none of the above|semua benar/i.test(o); })) issues.push({ code: 'all_of_the_above', severity: 'warn', text: '“All/none of the above” melemahkan analisis distraktor.' });
    if (/\b(NOT|EXCEPT|KECUALI)\b/.test(stem) || /\bnot\b/i.test(stem) && /\bexcept\b/i.test(stem)) issues.push({ code: 'negative_stem', severity: 'info', text: 'Stem negatif — pastikan kata NOT/EXCEPT dicetak tebal untuk murid.' });
    var caps = opts.filter(function (o) { return /^[A-Z]/.test(o); }).length;
    if (caps && caps !== opts.length && !/^did\b|^[A-Z]/.test(stem.split('___')[1] || '')) issues.push({ code: 'inconsistent_case', severity: 'info', text: 'Kapitalisasi pilihan tidak seragam.' });
    var errors = issues.filter(function (i) { return i.severity === 'error'; }).length, warns = issues.filter(function (i) { return i.severity === 'warn'; }).length;
    return { issues: issues, score: Math.max(0, 100 - errors * 40 - warns * 15 - (issues.length - errors - warns) * 5) };
  }

  // ---- 6. Distraktor → kemungkinan miskonsepsi -------------------------------------------------
  function distractorTag(answer, d, skill, stem) {
    var a = lower(answer), o = lower(d), s = lower(stem);
    if (skill === 'past_questions' || /^did\b/.test(s)) { if (isPastForm(o)) return 'structure.double_marking'; if (isIng(o)) return 'tense_aspect.progressive_overuse'; if (isThirdS(o)) return 'agreement.number_mismatch'; return 'question.auxiliary_error'; }
    if (skill === 'past_tense' || isPastForm(a)) { if (isBase(o)) return 'agreement.bare_form'; if (isIng(o)) return 'tense_aspect.progressive_overuse'; if (isThirdS(o)) return 'tense_aspect.timeline_mismatch'; if (/en$/.test(o) || IRREGULAR_PAST.indexOf(o) === -1 && /(have|has|had)/.test(s)) return 'tense_aspect.perfect_misuse'; return 'tense_aspect.timeline_mismatch'; }
    if (PREPS.indexOf(a) !== -1 && PREPS.indexOf(o) !== -1) return 'prepositions.semantic_category';
    if (MODALS.indexOf(a) !== -1 && MODALS.indexOf(o) !== -1) return 'modality.function_confusion';
    if (PRONOUNS.indexOf(a) !== -1 && PRONOUNS.indexOf(o) !== -1) return 'pronouns.case_form';
    if ((a === 'a' || a === 'an') && (o === 'a' || o === 'an')) return 'articles.sound_rule';
    if (['a', 'an', 'the'].indexOf(a) !== -1 && ['a', 'an', 'the', '-'].indexOf(o) !== -1) return 'articles.definiteness_mismatch';
    if (/er$|est$|more |most /.test(a) && /er$|est$|more |most /.test(o)) return 'comparison.form_intensifier';
    if (a.slice(0, 3) === o.slice(0, 3) && a !== o) return 'lexical.form_confusion';
    return null;
  }
  function distractors(q, skill) {
    var opts = q.options || [], ans = opts[q.answer];
    return opts.map(function (o, i) {
      if (i === q.answer) return { index: i, text: o, isAnswer: true };
      var tag = distractorTag(ans, o, skill, q.prompt), a = lower(ans), d = lower(o);
      var plausible = !!tag || a.slice(0, 2) === d.slice(0, 2) || Math.abs(a.length - d.length) <= 2;
      return { index: i, text: o, isAnswer: false, plausibility: plausible ? 'kuat' : 'lemah', misconception: tag ? { code: tag, label: MIS[tag] || tag } : null, why: q.why && q.why[i] ? q.why[i] : '' };
    });
  }

  // ---- 7. Analisis satu soal --------------------------------------------------------------------
  /** analyzeQuestion(q, ctx{level, skill}) -> analisis lengkap (lihat docs/class-hub-audit.md). */
  function analyzeQuestion(q, ctx) {
    ctx = ctx || {};
    var skill = guessSkill(q, ctx.skill), domain = SKILL_DOMAIN[skill] || 'grammar';
    var cefr = estimateCefr(str(q.prompt) + ' ' + (q.options || []).join(' ') + ' ' + str(q.context), ctx.level);
    var stemLength = str(q.prompt).length + str(q.context).length;
    var d = difficulty(cefr.level, domain, stemLength), quality = qualityChecks(q), ds = distractors(q, skill);
    var misMap = {}; ds.forEach(function (x) { if (x.misconception) misMap[x.misconception.code] = x.misconception; });
    var mis = Object.keys(misMap).map(function (k) { return misMap[k]; });
    var weak = ds.filter(function (x) { return !x.isAnswer && x.plausibility === 'lemah'; }).length;
    var verdict = quality.issues.some(function (i) { return i.severity === 'error'; }) ? 'perlu-perbaikan' : (quality.score < 85 || weak >= 2) ? 'perlu-tinjau' : 'siap';
    return {
      skill: skill, skillLabel: SKILL_LABEL[skill] || skill, domain: domain,
      cefr: cefr.level, cefrRationale: cefr.rationale,
      difficulty: Math.round(d * 100) / 100, difficultyBand: band(d),
      quality: quality, distractors: ds, misconceptions: mis,
      remediation: { lesson: REMEDIATION[skill] || REMEDIATION.grammar, needed: mis.length > 0 },
      verdict: verdict
    };
  }

  // ---- 8. Saran perbaikan -----------------------------------------------------------------------
  function suggestImprovement(q, analysis) {
    var out = { id: q.id, prompt: str(q.prompt), options: (q.options || []).map(str), answer: q.answer, skill: analysis.skill, context: q.context ? str(q.context) : undefined, why: Object.assign({}, q.why || {}) }, changes = [];
    var codes = analysis.quality.issues.map(function (i) { return i.code; });
    if (codes.indexOf('duplicate_options') !== -1) { var seen = {}, keep = []; out.options.forEach(function (o, i) { var k = lower(o); if (seen[k] && i !== out.answer) { changes.push('Pilihan kembar “' + o + '” dibuang.'); return; } seen[k] = 1; keep.push({ o: o, i: i }); }); out.answer = keep.findIndex(function (x) { return x.i === out.answer; }); out.options = keep.map(function (x) { return x.o; }); }
    if (codes.indexOf('no_blank') !== -1 && !/\?$/.test(out.prompt)) { out.prompt = out.prompt.replace(/[.?!]?$/, ' ___.'); changes.push('Tanda rumpang ___ ditambahkan di akhir stem.'); }
    if (codes.indexOf('inconsistent_case') !== -1) { out.options = out.options.map(function (o) { return o.charAt(0).toLowerCase() + o.slice(1); }); changes.push('Kapitalisasi pilihan diseragamkan.'); }
    if (codes.indexOf('answer_length_bias') !== -1) changes.push('Saran: panjangkan distraktor atau ringkas jawaban benar (perlu keputusan guru).');
    if (out.options.length > 4) { var extra = out.options.length - 4, ans = out.options[out.answer]; out.options = out.options.filter(function (o, i) { return i === out.answer || extra-- <= 0 || false; }); out.options = out.options.slice(0, 4); if (out.options.indexOf(ans) === -1) out.options[3] = ans; out.answer = out.options.indexOf(ans); changes.push('Pilihan dibatasi 4 (standar bank FIEZEL).'); }
    if (out.prompt.length > 160) changes.push('Saran: pecah stem menjadi konteks + pertanyaan pendek.');
    analysis.distractors.forEach(function (d) { if (!d.isAnswer && d.misconception && !out.why[d.index]) { out.why[d.index] = '“' + d.text + '” — ' + d.misconception.label + '.'; } });
    if (Object.keys(out.why).length && !q.why) changes.push('Alasan distraktor diisi dari taksonomi miskonsepsi (umpan balik murid).');
    return { question: out, changes: changes };
  }

  /** analyzeSet(items, ctx) -> { items:[{original, analysis, suggested}], setIssues, summary } */
  function analyzeSet(items, ctx) {
    var rows = (items || []).map(function (q) { var a = analyzeQuestion(q, ctx); return { original: q, analysis: a, suggested: suggestImprovement(q, a) }; });
    var setIssues = [], pos = {};
    rows.forEach(function (r) { pos[r.original.answer] = (pos[r.original.answer] || 0) + 1; });
    Object.keys(pos).forEach(function (k) { if (rows.length >= 4 && pos[k] / rows.length > 0.6) setIssues.push({ code: 'answer_position_bias', text: Math.round(pos[k] / rows.length * 100) + '% kunci di posisi ' + String.fromCharCode(65 + Number(k)) + ' — acak posisi saat mode ujian.' }); });
    var levels = {}, skills = {}, mis = {};
    rows.forEach(function (r) { levels[r.analysis.cefr] = (levels[r.analysis.cefr] || 0) + 1; skills[r.analysis.skill] = (skills[r.analysis.skill] || 0) + 1; r.analysis.misconceptions.forEach(function (m) { mis[m.code] = mis[m.code] ? Object.assign(mis[m.code], { n: mis[m.code].n + 1 }) : { code: m.code, label: m.label, n: 1 }; }); });
    var ready = rows.filter(function (r) { return r.analysis.verdict === 'siap'; }).length;
    return { items: rows, setIssues: setIssues, summary: { count: rows.length, ready: ready, levels: levels, skills: skills, misconceptions: Object.keys(mis).map(function (k) { return mis[k]; }).sort(function (a, b) { return b.n - a.n; }), avgDifficulty: rows.length ? Math.round(rows.reduce(function (m, r) { return m + r.analysis.difficulty; }, 0) / rows.length * 100) / 100 : 0 } };
  }

  // ---- 9. Status tugas per murid (satu definisi dipakai guru & murid) -----------------------------
  /** assignmentStatus({deadline}, {done, startedAt}, todayStr) -> 'selesai'|'terlambat'|'sedang'|'belum' + late flag */
  function assignmentStatus(a, rec, todayStr) {
    var late = !!(a && a.deadline && todayStr && a.deadline < todayStr);
    if (rec && rec.done) { var doneDay = rec.done.at ? new Date(rec.done.at).toISOString().slice(0, 10) : todayStr; return { id: 'selesai', label: t('kelas.status-selesai', 'Selesai'), late: !!(a && a.deadline && doneDay > a.deadline) }; }
    if (late) return { id: 'terlambat', label: 'Terlambat', late: true };
    if (rec && rec.startedAt) return { id: 'sedang', label: 'Sedang mengerjakan', late: false };
    return { id: 'belum', label: t('kelas.status-belum-mulai', 'Belum mulai'), late: false };
  }
  function daysLeft(deadline, todayStr) { if (!deadline) return null; var d = new Date(deadline + 'T00:00:00'), t = new Date((todayStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00'); return Math.round((d - t) / 86400000); }

  return { LEVELS: LEVELS, SKILL_LABEL: SKILL_LABEL, SKILL_DOMAIN: SKILL_DOMAIN, MIS: MIS, parseQuestions: parseQuestions, estimateCefr: estimateCefr, guessSkill: guessSkill, qualityChecks: qualityChecks, distractors: distractors, analyzeQuestion: analyzeQuestion, suggestImprovement: suggestImprovement, analyzeSet: analyzeSet, assignmentStatus: assignmentStatus, daysLeft: daysLeft, uid: uid };
});
