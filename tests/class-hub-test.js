'use strict';
/**
 * tests/class-hub-test.js — gerbang Kelas sebagai learning hub Guru ↔ Murid ↔ Braincore.
 * Menguji: Braincore review lokal (parser, analisis, saran, status), kontrak payload/laporan
 * yang diperluas (server + store + learner-flow), dan wiring tab Kelas → class hub.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RV = require('../features/class-hub/fiezel-braincore-review.js');

const tests = [];
const test = (n, fn) => tests.push([n, fn]);

test('parseQuestions: format pipe, CSV, dan blok A–D terbaca; baris rusak dilaporkan', () => {
  const r = RV.parseQuestions('She ___ to school yesterday. | go | went | goes | going | B\nrusak\nHe ___ football every Sunday., play, plays, played, playing, 2');
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[0].answer, 1);
  assert.strictEqual(r.items[1].answer, 1);
  assert.strictEqual(r.errors.length, 1);
  assert.ok(/^tq-/.test(r.items[0].id));
  const b = RV.parseQuestions('1. Did you ___ the film?\nA. saw\nB. see\nC. seen\nD. seeing\nAnswer: B\n2. They ___ happy.\nA. was\nB. were\nAnswer: were');
  assert.strictEqual(b.items.length, 2);
  assert.strictEqual(b.items[0].answer, 1);
  assert.strictEqual(b.items[1].answer, 1);
});

test('analyzeQuestion: skill, CEFR, kesulitan, distraktor → miskonsepsi taksonomi', () => {
  const q = { id: 'tq-1', prompt: 'She ___ to school yesterday.', options: ['go', 'went', 'goes', 'going'], answer: 1 };
  const a = RV.analyzeQuestion(q, { level: 'A2' });
  assert.strictEqual(a.skill, 'past_tense');
  assert.ok(RV.LEVELS.includes(a.cefr));
  assert.ok(a.difficulty > 0);
  const codes = a.distractors.filter((d) => !d.isAnswer).map((d) => d.misconception && d.misconception.code);
  assert.ok(codes.includes('agreement.bare_form'), 'go → bentuk dasar');
  assert.ok(codes.includes('tense_aspect.progressive_overuse'), 'going → -ing berlebihan');
  assert.ok(a.misconceptions.length >= 2);
  assert.strictEqual(a.verdict, 'siap');
  const dq = RV.analyzeQuestion({ prompt: 'Did you ___ the film?', options: ['saw', 'see', 'seen'], answer: 1 }, {});
  assert.strictEqual(dq.skill, 'past_questions');
  assert.ok(dq.distractors[0].misconception.code === 'structure.double_marking');
});

test('qualityChecks + suggestImprovement: kembar dibuang, rumpang ditambah, alasan distraktor diisi', () => {
  const q = { id: 'tq-2', prompt: 'Choose the past form of go', options: ['went', 'go', 'go', 'gone'], answer: 0 };
  const a = RV.analyzeQuestion(q, {});
  const codes = a.quality.issues.map((i) => i.code);
  assert.ok(codes.includes('duplicate_options'));
  assert.ok(codes.includes('no_blank'));
  assert.strictEqual(a.verdict, 'perlu-perbaikan');
  const s = RV.suggestImprovement(q, a);
  assert.strictEqual(s.question.options.length, 3);
  assert.strictEqual(s.question.options[s.question.answer], 'went');
  assert.ok(/___/.test(s.question.prompt));
  assert.ok(s.changes.length >= 2);
  assert.ok(Object.keys(s.question.why).length >= 1, 'why distraktor terisi dari taksonomi');
  const bad = RV.qualityChecks({ prompt: 'x ___', options: ['a', 'b'], answer: 5 });
  assert.ok(bad.issues.some((i) => i.code === 'no_answer'));
});

test('analyzeSet: ringkasan set + bias posisi kunci', () => {
  const items = [0, 1, 2, 3, 4].map((i) => ({ id: 'tq-' + i, prompt: 'He ___ home late ' + i + ' days ago.', options: ['came', 'come', 'comes', 'coming'], answer: 0 }));
  const set = RV.analyzeSet(items, { level: 'A2' });
  assert.strictEqual(set.summary.count, 5);
  assert.ok(set.setIssues.some((i) => i.code === 'answer_position_bias'));
  assert.ok(set.summary.misconceptions.length >= 1);
  assert.ok(set.items[0].suggested && set.items[0].analysis);
});

test('assignmentStatus: belum / sedang / selesai / terlambat / selesai-terlambat', () => {
  const a = { deadline: '2026-09-10' };
  assert.strictEqual(RV.assignmentStatus(a, {}, '2026-09-08').id, 'belum');
  assert.strictEqual(RV.assignmentStatus(a, { startedAt: 1 }, '2026-09-08').id, 'sedang');
  assert.strictEqual(RV.assignmentStatus(a, {}, '2026-09-11').id, 'terlambat');
  const doneOk = RV.assignmentStatus(a, { done: { at: Date.UTC(2026, 8, 9, 12) } }, '2026-09-11');
  assert.strictEqual(doneOk.id, 'selesai'); assert.strictEqual(doneOk.late, false);
  const doneLate = RV.assignmentStatus(a, { done: { at: Date.UTC(2026, 8, 12, 12) } }, '2026-09-13');
  assert.strictEqual(doneLate.id, 'selesai'); assert.strictEqual(doneLate.late, true);
  assert.strictEqual(RV.assignmentStatus({ deadline: null }, {}, '2026-09-11').id, 'belum');
  assert.strictEqual(RV.daysLeft('2026-09-10', '2026-09-08'), 2);
});

test('server class-sync-core: payload menerima items[]+teacher; laporan menerima s/w; kompatibel mundur', async () => {
  const core = await import('../workers/api/teacher/class-sync-core.js');
  const base = { id: 'as-1', title: 'T', skills: ['past_tense'], itemIds: ['pt-1', 'tq-1'], minutes: 5, from: 'Kelas 8A' };
  const wrap = (a) => ({ code: 'FZ-ABC234', assignment: a });
  assert.ok(core.normalizeAssignment(wrap(base)).ok, 'payload lama tetap valid');
  const r = core.normalizeAssignment(wrap(Object.assign({}, base, { teacher: 'Bu Rina', items: [{ id: 'tq-1', prompt: 'She ___ home.', options: ['go', 'went'], answer: 1, skill: 'past_tense', why: { 0: 'bentuk dasar' } }] })));
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.payload.teacher, 'Bu Rina');
  assert.strictEqual(r.payload.items[0].why[0], 'bentuk dasar');
  assert.strictEqual(core.normalizeAssignment(wrap(Object.assign({}, base, { items: [{ id: 'tq-1', prompt: 'x', options: ['a'], answer: 0 }] }))).reason, 'bad_custom_options');
  assert.strictEqual(core.normalizeAssignment(wrap(Object.assign({}, base, { items: [{ id: 'tq-1', prompt: 'x', options: ['a', 'b'], answer: 3 }] }))).reason, 'bad_custom_answer');
  const rep = core.normalizeReport({ v: 1, cls: 'FZ-ABC234', name: 'Ani', at: Date.now(), skills: { past_tense: { c: 3, t: 5 } }, assign: [{ id: 'as-1', at: Date.now(), s: 1 }, { id: 'as-2', at: Date.now(), c: 3, t: 5, w: [{ i: 'pt-1', o: 2 }, { i: 'tq-1', o: 0 }] }] }, Date.now());
  assert.ok(rep.ok, JSON.stringify(rep));
  assert.strictEqual(rep.report.assign[0].s, 1);
  assert.strictEqual(rep.report.assign[1].w.length, 2);
  assert.strictEqual(core.normalizeReport({ v: 1, cls: 'FZ-ABC234', name: 'Ani', at: Date.now(), skills: {}, assign: [{ id: 'as-2', c: 1, t: 1, w: [{ i: 'x', o: 99 }] }] }, Date.now()).reason, 'bad_assign_wrong');
  const schema = read('workers/api/schema.js');
  assert.ok(/'\/api\/teacher\/class\/assign': 32768/.test(schema) && /'\/api\/learner\/class-report': 8192/.test(schema), 'byte limit menampung items & w');
});

test('teacher store: payload membawa teacher/items; ingest membaca s (sedang) dan w (bukti per-soal)', () => {
  const src = read('features/teacher/fiezel-teacher-store.js');
  assert.ok(/p\.teacher = String\(a\.teacher\)/.test(src) && /p\.items = a\.items\.map/.test(src), 'assignmentPayload meneruskan teacher + items');
  assert.ok(/hit\.s && !\(hit\.t > 0\)/.test(src) && /a\.progress\[s\.id\]/.test(src), 'ingest: s → progress');
  assert.ok(/w: hit && Array\.isArray\(hit\.w\)/.test(src), 'ingest: w tersimpan di done');
  assert.ok(/items: Array\.isArray\(p\.items\)/.test(src) && /teacher: p\.teacher/.test(src), 'acceptAssignmentPayload menyimpan items + teacher untuk murid');
  assert.ok(/opts\.itemIds/.test(src) && /custom/.test(src), 'buildAssignment menerima soal kustom');
});

test('learner-flow: markAssignmentStarted + recordAssignmentResult (satu mesin laporan)', () => {
  const src = read('features/learner-flow/fiezel-learner-flow.js');
  assert.ok(/function markAssignmentStarted/.test(src) && /s: 1/.test(src));
  assert.ok(/function recordAssignmentResult/.test(src) && /entry\.w = wrong/.test(src) && /pushToClass\(\)/.test(src));
  assert.ok(/markAssignmentStarted: markAssignmentStarted, recordAssignmentResult: recordAssignmentResult/.test(src), 'diekspor');
});

test('wiring: tab Kelas → classHubView; notifikasi tugas membuka Kelas; tutor tetap hidup; shell guru punya view hub', () => {
  const app = read('app.js');
  assert.ok(app.includes("if(state.view==='classroom')classHubView();"), 'renderInner memakai class hub');
  assert.ok(app.includes('const tutorClassroomWrapper=classroom;') && app.includes('current!==tutorClassroomWrapper'), 'pembanding rekursi memakai referensi tertangkap');
  assert.ok(app.includes("hub.mountStudent(host,{go,toast:showToast") && app.includes('openTutor:()=>tutorClassroomWrapper()'), 'tutor bersuara tetap dapat dibuka dari hub');
  assert.ok(app.includes("self.FiezelClassHub.openAssignment(e.aid)") && app.includes("go('classroom');return true"), 'notif tugas → Kelas');
  const shell = read('features/teacher/fiezel-teacher-shell.js');
  /* m025-265: label nav Ruang Guru kini lewat t('umum.kelas') supaya murid/guru th tidak
     membaca 'Kelas'. Yang dijaga gerbang ini tetap sama persis — entri nav 'hub' dengan
     ikon 'school' dan pemasangan mountTeacher — hanya bentuk labelnya yang tidak lagi
     dibekukan sebagai literal Indonesia. */
  assert.ok(/\['hub',[^\]]*'school'\]/.test(shell) && /FiezelClassHub\.mountTeacher\(hubEl/.test(shell), 'Ruang Guru memasang hub');
  assert.ok(/st\.view = 'hub'; st\.hubSeen = true/.test(shell), 'hub landing default sekali');
  const html = read('index.html');
  ['features/class-hub/fiezel-braincore-review.js', 'features/class-hub/fiezel-class-hub.js', 'features/class-hub/class-hub.css'].forEach((f) => assert.ok(html.includes(f), f + ' dimuat'));
  assert.ok(html.indexOf('fiezel-class-hub.js') < html.indexOf('fiezel-teacher-shell.js'), 'hub sebelum teacher-shell');
  const sw = read('sw.js');
  ['features/class-hub/fiezel-braincore-review.js', 'features/class-hub/fiezel-class-hub.js', 'features/class-hub/class-hub.css'].forEach((f) => assert.ok(sw.includes(f), f + ' di precache'));
  const hub = read('features/class-hub/fiezel-class-hub.js');
  ['data-testid="class-tab-\' + t[0]', 'data-testid="tclass-tab-\' + t[0]', 'tclass-to-review', 'tclass-approve-', 'tclass-use-suggest-', 'tclass-commit-send', 'class-option-', 'class-feedback'].forEach((id) => assert.ok(hub.includes(id), 'data-testid ' + id));
  assert.ok(/1 · Soal asli/.test(hub) && /2 · Analisis Braincore/.test(hub) && /3 · Saran perbaikan/.test(hub) && /4 · Soal final/.test(hub), 'pipeline Original → Analysis → Suggested → Final terlihat guru');
  assert.ok(!/puter|api[_-]?key|openai|gemini/i.test(hub), 'tanpa ketergantungan Puter/API key/cloud AI');
});

test('smoke DOM-stub: alur murid (terima → kerjakan → hasil → laporan w/s) dan guru (buat → tinjau → setujui → simpan)', () => {
  const store = {};
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  /* Node 22+ (yang dipakai quality.yml) memasang `navigator` sebagai getter global tanpa
     setter, jadi penugasan biasa melempar TypeError dan gerbang ini merah di CI walau
     hijau di mesin lama. defineProperty menembusnya tanpa mengubah apa pun yang diuji. */
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  globalThis.document = { body: { classList: { add() {}, remove() {} } }, getElementById: () => null };
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.FormData = function (f) { const d = f._data || {}; return { get: (k) => (Array.isArray(d[k]) ? d[k][0] : d[k]) ?? null, getAll: (k) => (Array.isArray(d[k]) ? d[k] : d[k] != null ? [d[k]] : []) }; };
  require('../features/learner-flow/fiezel-review-bank.js');
  require('../features/brain/fiezel-item-prior.js');
  require('../features/teacher/fiezel-teacher-store.js');
  require('../features/learner-flow/fiezel-learner-flow.js');
  require('../features/class-hub/fiezel-class-hub.js');
  const Hub = globalThis.FiezelClassHub, TS = globalThis.FiezelTeacherStore, LF = globalThis.FiezelLearnerFlow, Bank = globalThis.FiezelReviewBank;
  assert.ok(Hub && TS && LF && Bank);
  const mkEl = () => { const el = { innerHTML: '', _h: {}, addEventListener(t, fn) { (el._h[t] = el._h[t] || []).push(fn); }, querySelector: () => null, fire(t, target) { (el._h[t] || []).forEach((fn) => fn({ target, preventDefault() {} })); } }; return el; };
  const btn = (attrs, match) => { const b = { _attrs: attrs, getAttribute: (k) => (k in attrs ? attrs[k] : null), checked: attrs.checked, value: attrs.value, _match: () => false }; b.closest = (sel) => (sel === '[data-ch]' ? b : (match && match[sel]) || null); return b; };

  // ---- GURU: kelas + murid, buat tugas soal sendiri lewat pipeline Braincore ------------------
  const st = TS.defaults(); st.teacher.name = 'Bu Rina';
  const c = TS.newClass('Kelas 8A', 'A2'); c.code = 'FZ-AB2C3D'; c.students.push(TS.newStudent('Ani'), TS.newStudent('Budi')); st.classes.push(c); st.activeClassId = c.id;
  const tEl = mkEl(); let rer = 0; const env = { st: () => st, cls: () => c, persist() {}, toast(t) { env.last = t; }, rerender() { rer++; Hub.mountTeacher(tEl, env); } };
  Hub.mountTeacher(tEl, env);
  assert.ok(tEl.innerHTML.includes('data-testid="class-hub-teacher"') && tEl.innerHTML.includes('Kelas 8A') && tEl.innerHTML.includes('tclass-student-'));
  tEl.fire('click', btn({ 'data-ch': 'ttab', 'data-tab': 'buat' }));
  assert.ok(tEl.innerHTML.includes('tclass-draft-form'));
  const form = { _data: { title: 'PR Past Tense', skills: 'past_tense', deadline: '2030-01-01', mode: 'latihan', raw: '' }, getAttribute: (k) => (k === 'data-ch-form' ? 'draft-source' : null), _match: (sel) => sel === '[data-ch-form]' };
  tEl.fire('click', btn({ 'data-ch': 'source', 'data-source': 'tulis' }, { form }));
  const d = Hub._teacherUi().draft; assert.strictEqual(d.source, 'tulis');
  d.items.push({ id: 'tq-smoke1', prompt: 'She ___ to school yesterday.', options: ['go', 'went', 'goes', 'going'], answer: 1 });
  d.items.push({ id: 'tq-smoke2', prompt: 'Choose the past of see', options: ['saw', 'see', 'see'], answer: 0 });
  form.closest = (sel) => (sel === '[data-ch-form]' ? form : null); tEl.fire('submit', form);
  assert.strictEqual(d.step, 2, 'masuk tahap tinjauan Braincore');
  assert.ok(tEl.innerHTML.includes('tclass-review-summary') && tEl.innerHTML.includes('1 · Soal asli') && tEl.innerHTML.includes('4 · Soal final'));
  assert.strictEqual(d.approved[0], true, 'soal siap disetujui otomatis'); assert.ok(!d.approved[1], 'soal bermasalah menunggu keputusan guru');
  tEl.fire('click', btn({ 'data-ch': 'use-suggest', 'data-i': '1' }));
  assert.strictEqual(d.finals[1].options.length, 2, 'saran Braincore dipakai (kembar dibuang)');
  tEl.fire('click', btn({ 'data-ch': 'approve-all' }));
  tEl.fire('click', btn({ 'data-ch': 'step', 'data-step': '3' }));
  assert.ok(tEl.innerHTML.includes('tclass-confirm'));
  tEl.fire('click', btn({ 'data-ch': 'commit' }));
  assert.strictEqual(c.assignments.length, 1);
  const a = c.assignments[0];
  assert.strictEqual(a.title, 'PR Past Tense'); assert.strictEqual(a.teacher, 'Bu Rina'); assert.strictEqual(a.items.length, 2); assert.strictEqual(a.source, 'tulis'); assert.ok(a.review && a.review.count === 2);
  assert.ok(tEl.innerHTML.includes('tclass-status-' + a.id) && tEl.innerHTML.includes('2 belum mulai'));
  assert.ok(tEl.innerHTML.includes('Soal persis yang diterima murid') && tEl.innerHTML.includes('She ___ to school yesterday.'), 'tugas baru langsung terbuka: soal persis terlihat');
  tEl.fire('click', btn({ 'data-ch': 'expand', 'data-id': a.id }));
  assert.ok(!tEl.innerHTML.includes('Soal persis yang diterima murid'), 'toggle tutup');
  const payload = TS.assignmentPayload(c, a);
  assert.strictEqual(payload.teacher, 'Bu Rina'); assert.strictEqual(payload.items.length, 2); assert.ok(payload.items[1].why, 'alasan distraktor ikut ke murid');

  // ---- MURID: terima payload → Kelas → kerjakan di runner → hasil + laporan ---------------------
  store['fiezel-onboarding-v1'] = JSON.stringify({ name: 'Ani', classCode: 'FZ-AB2C3D' });
  assert.ok(TS.acceptAssignmentPayload(payload));
  const sEl = mkEl(); const senv = { toast() {}, go() {}, openTutor() { senv.tutor = true; }, afterRender() {} };
  Hub.mountStudent(sEl, senv);
  assert.ok(sEl.innerHTML.includes('class-hub-student') && sEl.innerHTML.includes('Bu Rina') && sEl.innerHTML.includes('PR Past Tense') && sEl.innerHTML.includes('Belum mulai'));
  sEl.fire('click', btn({ 'data-ch': 'open', 'data-id': a.id }));
  assert.ok(sEl.innerHTML.includes('class-runner') && sEl.innerHTML.includes('Soal 1 dari 2'));
  let lf = LF.load(); assert.ok(lf.doneAssign.some((x) => x.id === a.id && x.s === 1), 'status sedang mengerjakan dilaporkan');
  sEl.fire('click', btn({ 'data-ch': 'answer', 'data-i': '0' })); // salah (bentuk dasar)
  assert.ok(sEl.innerHTML.includes('class-feedback') && sEl.innerHTML.includes('Belum tepat'));
  sEl.fire('click', btn({ 'data-ch': 'next' }));
  sEl.fire('click', btn({ 'data-ch': 'answer', 'data-i': '0' })); // benar
  sEl.fire('click', btn({ 'data-ch': 'next' }));
  assert.ok(sEl.innerHTML.includes('class-result') && sEl.innerHTML.includes('Bu Rina'));
  lf = LF.load(); const entry = lf.doneAssign.find((x) => x.id === a.id);
  assert.deepStrictEqual({ c: entry.c, t: entry.t, w: entry.w }, { c: 1, t: 2, w: [{ i: 'tq-smoke1', o: 0 }] }, 'bukti per-soal tersimpan untuk guru');
  assert.ok(lf.skills.past_tense && lf.skills.past_tense.total === 2, 'mesin skill learner-flow terpakai');
  assert.strictEqual(JSON.parse(store[TS.ASSIGN_KEY]).length, 0, 'antrean tugas kosong');
  assert.strictEqual(JSON.parse(store[Hub.SUB_KEY]).length, 1, 'riwayat selesai tersimpan');
  sEl.fire('click', btn({ 'data-ch': 'review', 'data-id': a.id }));
  assert.ok(sEl.innerHTML.includes('Pembahasan') && sEl.innerHTML.includes('Jawabanmu'));
  sEl.fire('click', btn({ 'data-ch': 'tab', 'data-tab': 'kelas' }));
  assert.ok(sEl.innerHTML.includes('class-my-class') && sEl.innerHTML.includes('class-open-tutor'));
  sEl.fire('click', btn({ 'data-ch': 'tutor' })); assert.ok(senv.tutor, 'tutor bersuara tetap bisa dibuka dari Kelas');
  sEl.fire('click', btn({ 'data-ch': 'tab', 'data-tab': 'progres' }));
  assert.ok(sEl.innerHTML.includes('class-kpi-done'));

  // ---- GURU menerima laporan: status selesai + miskonsepsi per soal ---------------------------
  const codeStr = LF.tutorCode(lf, 'Ani');
  const parsed = TS.parseLearnerCode(codeStr); assert.ok(parsed && parsed.name === 'Ani', 'kode laporan terbaca');
  TS.ingest(c, parsed);
  const ani = c.students.find((s) => s.name === 'Ani');
  assert.ok(a.done[ani.id] && a.done[ani.id].w && a.done[ani.id].w[0].i === 'tq-smoke1', 'bukti per-soal sampai ke guru');
  env.rerender();
  tEl.fire('click', btn({ 'data-ch': 'result', 'data-id': a.id }));
  assert.ok(tEl.innerHTML.includes('tclass-result-items') && tEl.innerHTML.includes('1 murid keliru') && /Bentuk dasar dipakai/.test(tEl.innerHTML), 'guru melihat soal keliru + miskonsepsi');
  assert.ok(tEl.innerHTML.includes('tclass-remedial'));
  tEl.fire('click', btn({ 'data-ch': 'ttab', 'data-tab': 'braincore' }));
  assert.ok(tEl.innerHTML.includes('Braincore menyarankan. Guru memutuskan. Murid belajar.') && /Bentuk dasar dipakai/.test(tEl.innerHTML));
  tEl.fire('click', btn({ 'data-ch': 'remedial', 'data-skill': 'past_tense', 'data-title': 'Remedial Past tense' }));
  assert.strictEqual(Hub._teacherUi().tab, 'buat'); assert.strictEqual(Hub._teacherUi().draft.title, 'Remedial Past tense');
});

/*
 * SOAL BERGAMBAR HARUS MEMBAWA GAMBARNYA KE RUNNER KELAS.
 *
 * Owner melaporkan: "banyak soal di dalam kelas tentang kata Inggris apa yang cocok untuk
 * gambar ini, tapi banyak sekali soal yang tidak ada gambarnya, jadi siswa tidak bisa
 * menjawab." Datanya tidak pernah hilang — bank soal utuh, dan latihan mandiri menggambarnya
 * dengan benar. Yang bolong adalah PENAMPILNYA: runner kelas mencetak item.context dan
 * item.prompt tetapi tidak pernah menyebut item.picture sama sekali, sehingga setiap soal
 * `contextKind:'picture'` sampai ke murid sebagai pertanyaan tanpa gambar — mustahil
 * dijawab, hanya bisa ditebak.
 *
 * Penyebab strukturalnya: satu bank, TIGA penampil (latihan mandiri, duel, runner kelas),
 * markup gambarnya disalin ke masing-masing. Penampil yang lupa menyalin tidak membuat
 * apa pun merah. Karena itu markupnya sekarang satu sumber di bank (pictureHtml) dan
 * gerbang di bawah menuntut SETIAP penampil memakainya.
 */
test('soal bergambar: bank menyediakan satu sumber markup', () => {
  const Bank = require(path.join(ROOT, 'features', 'learner-flow', 'fiezel-review-bank.js'));
  assert.strictEqual(typeof Bank.pictureHtml, 'function', 'bank mengekspor pictureHtml');
  const item = Bank.byId('gpi:0:1:2:3');
  assert.ok(item && item.contextKind === 'picture' && item.picture, 'bank bisa membangun soal gambar');
  const html = Bank.pictureHtml(item, 'ch-picture');
  assert.ok(/<svg/.test(html) && html.includes(item.picture), 'markup membawa SVG gambarnya');
  assert.ok(/class="ch-picture"/.test(html), 'kelas CSS bisa ditentukan pemanggil');
  assert.ok(/role="img"/.test(html) && /aria-label="Gambar: /.test(html), 'gambar punya nama aksesibel');
  assert.strictEqual(Bank.pictureHtml({ contextKind: 'text', prompt: 'x' }), '', 'soal non-gambar tidak menghasilkan markup');
  assert.strictEqual(Bank.pictureHtml(null), '', 'item kosong tidak melempar');
});

test('soal bergambar: runner kelas BENAR-BENAR mencetak gambarnya', () => {
  /* Uji PERILAKU, bukan pencocokan teks sumber. Versi pertama gerbang ini hanya mencari
     kata "pictureHtml" di berkasnya dan tetap hijau saat pemanggilannya dilumpuhkan —
     hijau yang berarti "tidak diukur". Sekarang runnernya benar-benar dijalankan. */
  const store = {};
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  globalThis.document = { body: { classList: { add() {}, remove() {} } }, getElementById: () => null };
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  require('../features/learner-flow/fiezel-review-bank.js');
  require('../features/brain/fiezel-item-prior.js');
  require('../features/teacher/fiezel-teacher-store.js');
  require('../features/learner-flow/fiezel-learner-flow.js');
  require('../features/class-hub/fiezel-braincore-review.js');
  require('../features/class-hub/fiezel-class-hub.js');
  const Hub = globalThis.FiezelClassHub, TS = globalThis.FiezelTeacherStore, Bank = globalThis.FiezelReviewBank;
  const pic = Bank.byId('gpi:0:1:2:3');
  assert.ok(pic && pic.picture, 'bank menyediakan soal bergambar');

  const mkEl = () => { const el = { innerHTML: '', _h: {}, addEventListener(t, fn) { (el._h[t] = el._h[t] || []).push(fn); }, querySelector: () => null, fire(t, target) { (el._h[t] || []).forEach((fn) => fn({ target, preventDefault() {} })); } }; return el; };
  const btn = (attrs) => { const b = { _attrs: attrs, getAttribute: (k) => (k in attrs ? attrs[k] : null), value: attrs.value }; b.closest = (sel) => (sel === '[data-ch]' ? b : null); return b; };

  store['fiezel-onboarding-v1'] = JSON.stringify({ name: 'Ani', classCode: 'FZ-AB2C3D' });
  /* Tugas yang HANYA berisi satu soal bergambar, dikirim lewat itemIds seperti tugas
     bank sungguhan: murid menyelesaikannya dari bank lokal. */
  assert.ok(TS.acceptAssignmentPayload({
    v: 1, t: 'assign', id: 'as-pic-1', title: 'Kosakata bergambar', skills: ['vocab_a2'],
    itemIds: [pic.id], minutes: 5, from: 'Bu Rina', teacher: 'Bu Rina', cls: 'FZ-AB2C3D',
    mode: 'latihan', timer: 0, shuffle: false
  }), 'tugas bergambar diterima murid');

  const sEl = mkEl();
  Hub.mountStudent(sEl, { toast() {}, go() {}, openTutor() {}, afterRender() {} });
  sEl.fire('click', btn({ 'data-ch': 'open', 'data-id': 'as-pic-1' }));

  assert.ok(sEl.innerHTML.includes('class-runner'), 'runner kelas terbuka');
  assert.ok(sEl.innerHTML.includes(pic.prompt), 'pertanyaannya tercetak');
  assert.ok(/<svg/.test(sEl.innerHTML), 'GAMBARNYA ikut tercetak — tanpa ini soal mustahil dijawab');
  assert.ok(sEl.innerHTML.includes(pic.picture), 'yang tercetak adalah gambar milik soal ini');
  assert.ok(/aria-label="Gambar: /.test(sEl.innerHTML), 'gambar punya nama aksesibel');
});

test('sintaks: app.js & modul class-hub dapat di-parse', () => {
  const vm = require('vm');
  ['app.js', 'features/class-hub/fiezel-class-hub.js', 'features/class-hub/fiezel-braincore-review.js', 'features/teacher/fiezel-teacher-shell.js', 'features/teacher/fiezel-teacher-store.js', 'features/learner-flow/fiezel-learner-flow.js'].forEach((f) => { new vm.Script(read(f), { filename: f }); });
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + '\n  ' + (e && e.stack || e)); }
  }
  console.log(fail ? `\n${fail} gagal` : '\nSemua gerbang class-hub lulus');
  process.exit(fail ? 1 : 0);
})();
