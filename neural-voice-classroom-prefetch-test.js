'use strict';
// m025-53: Classroom's speak() never called runtime.prefetch() at all, unlike Library's
// narrate() (fiezel-library-ui.js warmNext, m025-45/47). The m025-52 device capture showed
// zero prefetch_start/prefetch_ready/prefetch_hit events across the whole session, and
// source review found `service` is set synchronously before any of the captured requests -
// ruling out a timing gap - which narrowed it to "this caller never calls prefetch", i.e.
// Classroom. Of Classroom's speak() call sites, only the teaching-beat auto-narration has a
// deterministic "next" item (beats are read in lesson order, like Library reads sentences);
// the reactive sites (quiz answers, micro-check feedback, "confused") do not, because the
// next utterance depends on what the user does next. This regression covers the one site
// that is actually fixed and confirms the reactive sites were deliberately left alone.
const assert = require('assert');
const fs = require('fs');

const src = fs.readFileSync('features/tutor-classroom/fiezel-tutor-v3.js', 'utf8');
const Tutor = require('./features/tutor-classroom/fiezel-tutor-v3.js');
const pack = require('./features/classroom/classroom-lessons-v1.json');

let pass = 0;
function test(name, fn) { fn(); pass += 1; console.log('PASS', name); }

// ---- behavioral: the data warmNextBeat relies on is really deterministic --------------
test('session.beats() gives the same next beat warmNextBeat would prefetch', () => {
  const lesson = pack.lessons[0];
  assert.ok((lesson.segments || []).length >= 2, 'fixture lesson must have at least two beats');
  const session = Tutor.createSession(pack, null, Tutor.evidenceDefault());
  session.chooseCategory(lesson.category);
  session.chooseLesson(lesson.id);
  const snap = session.snapshot();
  assert.equal(snap.phase, 'teach');
  assert.equal(snap.beatIndex, 0);
  const beats = session.beats();
  assert.equal(beats[0].en, lesson.segments[0].en, 'current beat must be beat 0');
  assert.equal(beats[1].en, lesson.segments[1].en, 'the beat warmNextBeat would prefetch is beat 1, known up front');
});

test('advancing past the last beat leaves no "next" to warm - warmNextBeat must no-op there', () => {
  const lesson = pack.lessons[0];
  const session = Tutor.createSession(pack, null, Tutor.evidenceDefault());
  session.chooseCategory(lesson.category);
  session.chooseLesson(lesson.id);
  const lastIndex = session.beats().length - 1;
  for (let i = 0; i < lastIndex; i += 1) {
    const beat = session.currentBeat();
    if (beat && beat.check) session.answerMicro(beat.check.answerIndex);
    session.nextBeat();
  }
  const snap = session.snapshot();
  assert.equal(snap.beatIndex, lastIndex, 'must be on the last beat');
  assert.equal(session.beats()[snap.beatIndex + 1], undefined, 'no beat exists past the last one');
});

// ---- source: warmNextBeat exists, is wired to the one deterministic site, and matches -
test('warmNextBeat exists and guards on session, phase, and the exact beat that called it', () => {
  assert.match(src, /function warmNextBeat\(beatIndexAtCall\)/, 'warmNextBeat must exist');
  const body = src.slice(src.indexOf('function warmNextBeat'), src.indexOf('function bundleStatus'));
  assert.match(body, /if \(!runtime \|\| typeof runtime\.prefetch !== 'function' \|\| !session\) return;/,
    'must bail if the runtime or session is not available - never throw from a deferred callback');
  assert.match(body, /if \(snap\.phase !== 'teach' \|\| snap\.beatIndex !== beatIndexAtCall\) return;/,
    'a stale deferred call (user already moved on) must not warm a now-wrong beat');
  assert.match(body, /var upcoming = session\.beats\(\)\[beatIndexAtCall \+ 1\];/,
    'the beat to warm is read from live session state, not captured at call time');
  assert.match(body, /if \(!upcoming\) return;/, 'the last beat has nothing after it to warm');
  assert.match(body, /runtime\.prefetch\(upcoming\.en,/, 'must call the existing runtime.prefetch, not a new mechanism');
});

test('the prefetch key matches what the real next speak() call will use', () => {
  const body = src.slice(src.indexOf('function warmNextBeat'), src.indexOf('function bundleStatus'));
  assert.match(body, /speed: Math\.max\(\.55, Math\.min\(1\.25, baseSpeed\(\)\)\)/,
    'speed must use the same clamp the beat speak() call applies for speedFactor 1, or the ' +
    'warm cache key never matches and the reservation is silently wasted');
});

test('warmNextBeat is called from teaching-beat auto-narration only, once', () => {
  const calls = src.match(/warmNextBeat\(/g) || [];
  // One in the definition's own setTimeout is not a call to itself; count call sites only.
  const callSites = (src.match(/\bwarmNextBeat\(snap\.beatIndex\)/g) || []).length;
  assert.equal(callSites, 1, 'exactly one call site: the teaching-beat auto-narration branch');
  assert.match(src, /if \(autoSpeak && beat\) \{ speak\(\{ en: beat\.en, id: beat\.idText \}, 1\); warmNextBeat\(snap\.beatIndex\); \}/,
    'must run alongside the actual speak() call for the current beat, not instead of it');
});

test('the reactive speak() call sites are untouched - no next item exists for them to warm', () => {
  ['speak(ans, 1);', 'speak(out.feedback, 1);', "speak(out.result.feedback, 1);", 'speak(out, 1);']
    .forEach((callSite) => {
      const at = src.indexOf(callSite);
      assert.ok(at > -1, 'expected reactive call site to still exist: ' + callSite);
      const nearby = src.slice(at, at + callSite.length + 40);
      assert.ok(!/warmNextBeat/.test(nearby), 'reactive call site must not warm a guessed-at next item: ' + callSite);
    });
});

console.log('classroom prefetch regression: ' + pass + ' checks passed');
