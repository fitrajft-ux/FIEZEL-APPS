/**
 * FIEZEL Duel Belajar — belajar bersama seperti main game, tanpa server:
 *  • Buat tantangan → main 8 soal berwaktu → dapat KODE/LINK → undang teman.
 *  • Teman membuka kode → soal yang SAMA (seed sama) → skor dibandingkan head-to-head.
 *  • Kode balasan dikirim balik → papan skor tantangan terisi.
 *  • Mode "Main berdua di satu HP": dua pemain bergantian, skor berdampingan.
 * Tiap jawaban salah tetap dijelaskan polanya — game, tapi tetap belajar.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelDuel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah modul ini dulu literal Indonesia, jadi murid
     yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft — kalau copy-map
     belum termuat (murid th memuat copy-th secara dinamis), fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  var root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  var KEY = 'fiezel-duel-v1';
  var SECONDS = 15, COUNT = 8;
  var MODES = {
    mix: { label: 'Campuran', skills: ['vocab_a2', 'past_tense', 'past_questions', 'listening_detail', 'reading_inference'] },
    vocab: { label: 'Vocabulary', skills: ['vocab_a2'] },
    grammar: { label: 'Grammar', skills: ['past_tense', 'past_questions'] },
    listening: { label: 'Listening', skills: ['listening_detail'] }
  };

  function bank() { return root.FiezelReviewBank; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]; }); }
  function defaults() { return { schema: KEY, name: '', challenges: {}, screen: 'home', game: null, code: '', hot: null }; }
  function load() { try { var raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.schema === KEY) return Object.assign(defaults(), raw, { game: null, hot: null, screen: 'home' }); } catch (_) {} return defaults(); }
  function save(st) { try { var c = Object.assign({}, st, { game: null, hot: null }); localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {} }

  // Set soal deterministik dari seed → dua pemain mendapat soal identik.
  function questionSet(seed, mode) {
    var B = bank(), skills = (MODES[mode] || MODES.mix).skills, ids = [], i = 0;
    while (ids.length < COUNT && i < COUNT * 3) {
      var sk = skills[i % skills.length];
      var got = B.pickFresh(sk, 1, { avoid: ids, seed: seed + i * 31 });
      if (got[0] && ids.indexOf(got[0].id) === -1) ids.push(got[0].id);
      i++;
    }
    return ids;
  }
  function encode(obj) { try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=+$/, ''); } catch (_) { return ''; } }
  function decode(code) {
    try {
      var s = String(code || '').trim(); var q = s.indexOf('duel=');
      if (q > -1) s = decodeURIComponent(s.slice(q + 5).split(/[&#\s]/)[0]);
      var o = JSON.parse(decodeURIComponent(escape(atob(s))));
      if (!o || o.v !== 1 || !o.seed) return null;
      /* Kode duel datang dari tautan yang dikirim ORANG LAIN (?duel=... di URL), jadi setiap
         field di dalamnya dikendalikan pengirim. Dibersihkan SEKALI di sini, di batas masuk,
         bukan di tiap tempat ia dicetak: skor/jumlah benar dipaksa jadi angka, mode dipaksa
         jadi salah satu kunci MODES yang memang ada, dan nama dipotong sepanjang kolom nama.
         Tanpa ini, `parsed.score` yang dicetak apa adanya ke innerHTML (joinView, dan kartu
         undangan di Home) adalah HTML dari penyerang. */
      return {
        v: 1,
        seed: String(o.seed).slice(0, 40),
        mode: MODES[o.mode] ? o.mode : 'mix',
        from: String(o.from == null ? '' : o.from).slice(0, 20),
        score: Math.max(0, Math.round(Number(o.score) || 0)),
        correct: Math.max(0, Math.round(Number(o.correct) || 0)),
        reply: o.reply === true
      };
    } catch (_) { return null; }
  }
  function shareLink(code) { try { var u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('duel', code); return u.toString(); } catch (_) { return code; } }
  function scoreFor(correct, msLeft, streak) { return correct ? 100 + Math.round((msLeft / (SECONDS * 1000)) * 50) + (streak >= 2 ? 20 : 0) : 0; }

  // ---- game engine ---------------------------------------------------------------------
  var mountEl = null, env = {}, st = null, timer = null;
  function newGame(opts) {
    var seed = opts.seed || (Date.now() % 100000) + 7, mode = opts.mode || 'mix';
    return { seed: seed, mode: mode, ids: questionSet(seed, mode), index: 0, score: 0, correct: 0, streak: 0, feedback: null, chosen: null, startedAt: Date.now(), qStart: Date.now(), left: SECONDS * 1000, from: opts.from || null, theirScore: opts.theirScore, theirCorrect: opts.theirCorrect, replyTo: opts.replyTo || null, results: [], players: opts.players || null, turn: 0 };
  }
  function tick() {
    if (!st.game || st.game.feedback) return;
    st.game.left = Math.max(0, SECONDS * 1000 - (Date.now() - st.game.qStart));
    var bar = mountEl && mountEl.querySelector('[data-duel-timer]');
    if (bar) { bar.style.setProperty('--p', (st.game.left / (SECONDS * 1000) * 100).toFixed(1) + '%'); var t = mountEl.querySelector('[data-duel-secs]'); if (t) t.textContent = Math.ceil(st.game.left / 1000); }
    if (st.game.left <= 0) answer(-1);
  }
  function startTimer() { stopTimer(); timer = setInterval(tick, 200); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function answer(choice) {
    var g = st.game, B = bank(), item = B.byId(g.ids[g.index]); if (!g || g.feedback) return;
    var fb = choice < 0 ? { correct: false, text: 'Waktu habis. Jawabannya “' + item.options[item.answer] + '”. ' + B.explain(item, item.answer).text.replace(/^Tepat\. /, '') } : B.explain(item, choice);
    var who = g.players ? g.turn : 0;
    var streak = g.players ? (g.players[who].streak || 0) : g.streak;
    streak = fb.correct ? streak + 1 : 0;
    var pts = scoreFor(fb.correct, g.left, streak);
    if (g.players) { var p = g.players[who]; p.streak = streak; p.score += pts; if (fb.correct) p.correct++; }
    else { g.streak = streak; g.score += pts; if (fb.correct) g.correct++; }
    g.results.push({ id: item.id, skill: item.skill, correct: fb.correct, who: who });
    g.feedback = Object.assign({ pts: pts, who: who }, fb); g.chosen = choice;
    render();
  }
  function next() {
    var g = st.game; if (!g) return;
    g.feedback = null; g.chosen = null;
    if (g.players && g.turn === 0) { g.turn = 1; }
    else { g.turn = 0; g.index += 1; }
    if (g.index >= g.ids.length) { finish(); return; }
    g.qStart = Date.now(); g.left = SECONDS * 1000; render();
  }
  function finish() {
    stopTimer();
    var g = st.game;
    if (!g.players) {
      var key = String(g.seed) + ':' + g.mode, ch = st.challenges[key] || { seed: g.seed, mode: g.mode, at: Date.now(), scores: [] };
      ch.scores = ch.scores.filter(function (s) { return !s.me; });
      ch.scores.push({ me: true, name: st.name || 'Aku', score: g.score, correct: g.correct });
      if (g.from) ch.scores = ch.scores.filter(function (s) { return s.name !== g.from; }).concat([{ name: g.from, score: g.theirScore, correct: g.theirCorrect }]);
      st.challenges[key] = ch;
    }
    st.screen = 'result'; save(st); render();
  }
  function myCode(g) { return encode({ v: 1, seed: g.seed, mode: g.mode, from: (st.name || 'Teman').slice(0, 20), score: g.score, correct: g.correct, reply: g.from ? true : undefined }); }

  // ---- render --------------------------------------------------------------------------
  function mount(el, options) {
    mountEl = el; env = options || {}; st = load();
    if (env.learnerName) { try { var n = env.learnerName(); if (n && !st.name) st.name = String(n).split(' ')[0]; } catch (_) {} }
    el.addEventListener('click', onClick); el.addEventListener('input', onInput);
    try { var c = new URL(location.href).searchParams.get('duel'); if (c) { st.code = c; st.screen = 'join'; history.replaceState(null, '', location.pathname); } } catch (_) {}
    render();
  }
  function unmount() { stopTimer(); }
  function render() {
    if (!mountEl) return;
    var g = st.game;
    var html = { home: homeView, play: playView, result: resultView, join: joinView, hot: hotSetupView }[st.screen]();
    mountEl.innerHTML = '<div class="duel" data-testid="duel">' + html + '</div>';
    if (st.screen === 'play' && g && !g.feedback) startTimer(); else stopTimer();
    if (env.afterRender) try { env.afterRender(); } catch (_) {}
  }
  function nameField() { return '<label class="duel-name">' + t('duel.nama-panggilan', 'Nama panggilanmu') + '<input type="text" maxlength="20" value="' + esc(st.name) + '" placeholder="mis. Rani" data-duel-name data-testid="duel-name"></label>'; }
  function homeView() {
    var keys = Object.keys(st.challenges).sort(function (a, b) { return st.challenges[b].at - st.challenges[a].at; }).slice(0, 5);
    return '<div class="lf-card duel-hero"><p class="lf-kicker">' + t('duel.judul', 'Duel Belajar') + '</p><h2>Main bersama teman</h2><p class="lf-muted">8 soal · 15 detik per soal · poin untuk jawaban tepat, bonus untuk cepat dan beruntun. Soal yang salah tetap dijelaskan polanya — jadi kalah pun tetap belajar.</p>' + nameField() +
      '<div class="duel-modes">' + Object.keys(MODES).map(function (m) { return '<button type="button" class="duel-mode" data-duel="start" data-mode="' + m + '" data-testid="duel-start-' + m + '"><b>' + MODES[m].label + '</b><small>' + t('duel.buat-tantangan', 'Buat tantangan') + '</small></button>'; }).join('') + '</div>' +
      '<div class="lf-actions"><button type="button" class="lf-ghost" data-duel="to-join" data-testid="duel-to-join">Punya kode/link teman?</button><button type="button" class="lf-ghost" data-duel="to-hot" data-testid="duel-to-hot">Main berdua di satu HP</button></div></div>' +
      (keys.length ? '<div class="lf-card"><h3>Papan skor tantanganmu</h3><ul class="duel-board">' + keys.map(function (k) { var c = st.challenges[k]; var rows = c.scores.slice().sort(function (a, b) { return b.score - a.score; }); return '<li><div class="duel-board-head"><b>' + esc(MODES[c.mode].label) + ' · #' + c.seed + '</b><small>' + rows.length + ' pemain</small></div><ol>' + rows.map(function (r, i) { return '<li' + (r.me ? ' class="is-me"' : '') + '><span>' + (i + 1) + '.</span> ' + esc(r.name) + ' <em>' + r.score + ' poin · ' + r.correct + '/' + COUNT + '</em></li>'; }).join('') + '</ol><div class="lf-actions"><button type="button" class="lf-mini" data-duel="share" data-key="' + esc(k) + '" data-testid="duel-share-' + esc(k) + '">Undang lagi</button><button type="button" class="lf-mini" data-duel="to-join">Tempel kode balasan</button></div></li>'; }).join('') + '</ul></div>' : '');
  }
  function joinView() {
    var parsed = st.code ? decode(st.code) : null;
    return '<div class="lf-card"><p class="lf-kicker">Gabung tantangan</p><h2>Masukkan kode atau link teman</h2>' + nameField() +
      '<textarea class="lf-code duel-code" rows="3" placeholder="Tempel kode / link ?duel=… di sini" data-duel-code data-testid="duel-code-input">' + esc(st.code) + '</textarea>' +
      (st.code && !parsed ? '<div class="lf-feedback is-wrong">Kode belum dikenali — pastikan tersalin utuh.</div>' : '') +
      (parsed ? '<div class="duel-invite" data-testid="duel-invite-preview"><b>' + esc(parsed.from || 'Teman') + '</b> ' + (parsed.reply ? 'membalas tantanganmu' : 'menantangmu') + ' · ' + esc((MODES[parsed.mode] || MODES.mix).label) + ' · skor ' + parsed.score + ' poin (' + parsed.correct + '/' + COUNT + ')</div>' : '') +
      '<div class="lf-actions">' + (parsed && !parsed.reply ? '<button type="button" class="lf-primary" data-duel="accept" data-testid="duel-accept">Terima & main soal yang sama</button>' : '') + (parsed && parsed.reply ? '<button type="button" class="lf-primary" data-duel="record-reply" data-testid="duel-record-reply">Catat ke papan skor</button>' : '') + '<button type="button" class="lf-ghost" data-duel="home">' + t('umum.kembali', 'Kembali') + '</button></div></div>';
  }
  function hotSetupView() {
    return '<div class="lf-card"><p class="lf-kicker">Satu HP, dua pemain</p><h2>Main berdua</h2><p class="lf-muted">Kalian bergantian menjawab soal yang sama. Yang lebih cepat dan tepat menang.</p>' +
      '<div class="tac-row"><label class="duel-name">Pemain 1<input type="text" maxlength="20" value="' + esc(st.name || '') + '" data-duel-p="0" data-testid="duel-p1"></label><label class="duel-name">Pemain 2<input type="text" maxlength="20" placeholder="Nama teman" data-duel-p="1" data-testid="duel-p2"></label></div>' +
      '<div class="duel-modes">' + Object.keys(MODES).map(function (m) { return '<button type="button" class="duel-mode" data-duel="start-hot" data-mode="' + m + '" data-testid="duel-hot-' + m + '"><b>' + MODES[m].label + '</b><small>Mulai berdua</small></button>'; }).join('') + '</div>' +
      '<div class="lf-actions"><button type="button" class="lf-ghost" data-duel="home">' + t('umum.kembali', 'Kembali') + '</button></div></div>';
  }
  function playView() {
    var g = st.game, B = bank(), item = B.byId(g.ids[g.index]), fb = g.feedback;
    var who = g.players ? g.players[g.turn] : null;
    var score = g.players ? g.players.map(function (p, i) { return '<span class="duel-p' + (i === g.turn ? ' is-turn' : '') + '">' + esc(p.name) + ' <b>' + p.score + '</b></span>'; }).join('') : '<span class="duel-p is-turn">' + esc(st.name || 'Aku') + ' <b>' + g.score + '</b></span>' + (g.from ? '<span class="duel-p">' + esc(g.from) + ' <b>' + g.theirScore + '</b></span>' : '');
    var ctx = '';
    if (item.contextKind === 'picture') ctx = '<div class="lf-picture" role="img" aria-label="Gambar: ' + esc(item.pictureAlt) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + item.picture + '</svg></div>';
    else if (item.context) ctx = '<div class="lf-context"><div class="lf-context-head"><span>' + (item.contextKind === 'dialogue' ? 'Dialog pendek' : 'Teks pendek') + '</span></div><pre class="lf-transcript">' + esc(item.context) + '</pre></div>';
    return '<div class="lf-card duel-play" data-testid="duel-play"><div class="duel-top"><div class="duel-scores">' + score + '</div><div class="duel-timer" data-duel-timer style="--p:' + (g.left / (SECONDS * 1000) * 100) + '%"><i></i><b data-duel-secs>' + Math.ceil(g.left / 1000) + '</b></div></div>' +
      '<div class="lf-q-meta"><span class="lf-chip">' + esc(B.AREAS[B.SKILLS[item.skill].area]) + '</span><span class="lf-muted">' + t('duel.soal-progress', 'Soal {n}').replace('{n}', g.index + 1) + ' / ' + g.ids.length + (who ? ' · giliran <b>' + esc(who.name) + '</b>' : '') + '</span></div>' + ctx +
      '<p class="lf-prompt">' + esc(item.prompt) + '</p><div class="lf-options">' + item.options.map(function (op, i) { var cls = 'lf-option'; if (fb && i === item.answer) cls += ' is-correct'; if (fb && !fb.correct && i === g.chosen) cls += ' is-wrong'; return '<button type="button" class="' + cls + '" data-duel="answer" data-choice="' + i + '" data-testid="duel-option-' + i + '"' + (fb ? ' disabled' : '') + '>' + esc(op) + '</button>'; }).join('') + '</div>' +
      (fb ? '<div class="lf-feedback ' + (fb.correct ? 'is-correct' : 'is-wrong') + '" data-testid="duel-feedback"><b>' + (fb.correct ? '+' + fb.pts + ' poin' : '+0') + '</b> · ' + esc(fb.text) + '</div><div class="lf-actions"><button type="button" class="lf-primary" data-duel="next" data-testid="duel-next">' + (g.index + 1 >= g.ids.length && (!g.players || g.turn === 1) ? 'Lihat hasil' : t('umum.lanjut', 'Lanjut')) + '</button></div>' : '') +
      '<div class="lf-actions lf-actions-end"><button type="button" class="lf-ghost" data-duel="quit">Keluar</button></div></div>';
  }
  function resultView() {
    var g = st.game, B = bank();
    var weak = {}; g.results.forEach(function (r) { if (!r.correct) weak[r.skill] = (weak[r.skill] || 0) + 1; });
    var weakList = Object.keys(weak).sort(function (a, b) { return weak[b] - weak[a]; }).map(function (k) { return B.SKILLS[k].short; });
    var head, board = '';
    if (g.players) {
      var p = g.players.slice().sort(function (a, b) { return b.score - a.score; }), tie = p[0].score === p[1].score;
      head = tie ? 'Seri! ' + p[0].score + ' – ' + p[1].score : esc(p[0].name) + ' menang ' + p[0].score + ' – ' + p[1].score;
      board = '<ul class="duel-versus">' + g.players.map(function (x) { return '<li><b>' + esc(x.name) + '</b><span>' + x.score + ' poin</span><small>' + x.correct + '/' + COUNT + ' tepat</small></li>'; }).join('') + '</ul>';
    } else if (g.from) {
      var win = g.score > g.theirScore, tie2 = g.score === g.theirScore;
      head = tie2 ? 'Seri dengan ' + esc(g.from) + '!' : win ? 'Kamu menang melawan ' + esc(g.from) + '!' : esc(g.from) + ' masih unggul — tantang balik!';
      board = '<ul class="duel-versus"><li class="is-me"><b>' + esc(st.name || 'Aku') + '</b><span>' + g.score + ' poin</span><small>' + g.correct + '/' + COUNT + '</small></li><li><b>' + esc(g.from) + '</b><span>' + g.theirScore + ' poin</span><small>' + g.theirCorrect + '/' + COUNT + '</small></li></ul>';
    } else head = g.score + ' poin · ' + g.correct + '/' + COUNT + ' tepat';
    var code = g.players ? '' : myCode(g);
    return '<div class="lf-card duel-result" data-testid="duel-result"><p class="lf-kicker">Session completed</p><h2>' + head + '</h2>' + board +
      (weakList.length ? '<p class="lf-reason"><b>Review needed:</b> ' + esc(weakList.join(', ')) + ' — pola ini masuk rencana belajarmu berikutnya.</p>' : '<p class="lf-reason"><b>Semua tepat.</b> Confidence-nya bagus untuk sesi ini — coba mode lain besok.</p>') +
      (code ? '<h3>' + (g.from ? 'Kirim hasil balik ke ' + esc(g.from) : 'Undang teman main soal yang sama') + '</h3><textarea class="lf-code duel-code" readonly rows="2" data-testid="duel-my-code">' + esc(g.from ? code : shareLink(code)) + '</textarea>' +
        '<div class="lf-actions"><button type="button" class="lf-primary" data-duel="copy-code" data-testid="duel-copy">Salin ' + (g.from ? 'kode balasan' : 'link undangan') + '</button>' + (typeof navigator !== 'undefined' && navigator.share ? '<button type="button" class="lf-ghost" data-duel="share-now" data-testid="duel-share-now">Bagikan…</button>' : '') + '</div>' : '') +
      '<div class="lf-actions"><button type="button" class="lf-ghost" data-duel="replay" data-testid="duel-replay">Main lagi (soal baru)</button><button type="button" class="lf-ghost" data-duel="home">Ke Duel</button></div></div>';
  }

  // ---- events --------------------------------------------------------------------------
  function toast(m) { if (env.toast) try { env.toast(m); } catch (_) {} }
  function copy(text, msg) { var done = function () { toast(msg || 'Tersalin.'); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done(); }
  function onInput(e) {
    var n = e.target.closest('[data-duel-name]'); if (n) { st.name = n.value.slice(0, 20); save(st); return; }
    var c = e.target.closest('[data-duel-code]'); if (c) { st.code = c.value; render(); var el = mountEl.querySelector('[data-duel-code]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } return; }
    var p = e.target.closest('[data-duel-p]'); if (p) { st.hot = st.hot || ['', '']; st.hot[+p.getAttribute('data-duel-p')] = p.value.slice(0, 20); if (p.getAttribute('data-duel-p') === '0') { st.name = p.value.slice(0, 20); save(st); } }
  }
  function onClick(e) {
    var btn = e.target.closest('[data-duel]'); if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-duel'), g = st.game;
    switch (act) {
      case 'start': st.game = newGame({ mode: btn.getAttribute('data-mode') }); st.screen = 'play'; break;
      case 'start-hot': { var names = st.hot || ['', '']; st.game = newGame({ mode: btn.getAttribute('data-mode'), players: [{ name: names[0] || st.name || 'Pemain 1', score: 0, correct: 0, streak: 0 }, { name: names[1] || 'Pemain 2', score: 0, correct: 0, streak: 0 }] }); st.screen = 'play'; break; }
      case 'answer': answer(Number(btn.getAttribute('data-choice'))); return;
      case 'next': next(); return;
      case 'quit': stopTimer(); st.game = null; st.screen = 'home'; break;
      case 'to-join': st.screen = 'join'; break;
      case 'to-hot': st.screen = 'hot'; break;
      case 'home': st.screen = 'home'; st.game = null; break;
      case 'accept': { var inv = decode(st.code); if (!inv) return; st.game = newGame({ seed: inv.seed, mode: inv.mode, from: inv.from || 'Teman', theirScore: inv.score || 0, theirCorrect: inv.correct || 0 }); st.code = ''; st.screen = 'play'; break; }
      case 'record-reply': {
        var rep = decode(st.code); if (!rep) return;
        var key = String(rep.seed) + ':' + rep.mode, ch = st.challenges[key];
        if (!ch) { toast('Tantangan ini bukan dari perangkat ini — tetap dicatat.'); ch = st.challenges[key] = { seed: rep.seed, mode: rep.mode, at: Date.now(), scores: [] }; }
        ch.scores = ch.scores.filter(function (s) { return s.name !== rep.from; }).concat([{ name: rep.from || 'Teman', score: rep.score || 0, correct: rep.correct || 0 }]);
        st.code = ''; st.screen = 'home'; toast('Skor ' + (rep.from || 'teman') + ' dicatat ke papan.'); break;
      }
      case 'copy-code': { var ta = mountEl.querySelector('[data-testid=duel-my-code]'); if (ta) copy(ta.value, g && g.from ? 'Kode balasan tersalin — kirim ke ' + g.from + '.' : 'Link undangan tersalin.'); return; }
      case 'share-now': { var ta2 = mountEl.querySelector('[data-testid=duel-my-code]'); try { navigator.share({ title: t('duel.judul-share', 'Duel Belajar FIEZEL'), text: (st.name || 'Aku') + ' menantangmu di FIEZEL!', url: ta2 && ta2.value.indexOf('http') === 0 ? ta2.value : undefined }); } catch (_) {} return; }
      case 'share': { var c2 = st.challenges[btn.getAttribute('data-key')]; if (!c2) return; var me = c2.scores.filter(function (s) { return s.me; })[0] || { score: 0, correct: 0 }; copy(shareLink(encode({ v: 1, seed: c2.seed, mode: c2.mode, from: (st.name || 'Teman').slice(0, 20), score: me.score, correct: me.correct })), 'Link undangan tersalin.'); return; }
      case 'replay': st.game = newGame({ mode: g ? g.mode : 'mix', players: g && g.players ? g.players.map(function (p) { return { name: p.name, score: 0, correct: 0, streak: 0 }; }) : null }); st.screen = 'play'; break;
      default: return;
    }
    save(st); render();
  }

  return { KEY: KEY, MODES: MODES, COUNT: COUNT, SECONDS: SECONDS, mount: mount, unmount: unmount, render: render, questionSet: questionSet, encode: encode, decode: decode, shareLink: shareLink, scoreFor: scoreFor, _state: function () { return st; } };
});
