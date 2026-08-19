'use strict';
// m025-39 regression for two production defects OWNER hit after the tutor v3 handover:
// session pages loading slowly, and Classroom failing on reload.
const assert = require('assert');
const fs = require('fs');

const fix = fs.readFileSync('features/tutor-classroom/fiezel-tutor-indonesian-voice-fix.js', 'utf8');
const selftests = require('./features/diagnostics/fiezel-module-selftests.js');
const targets = require('./features/diagnostics/fiezel-diagnostic-targets.js');

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('PASS', name); };

(async () => {
  // ---- defect 1: MutationObserver feedback loop made every render slow -------------
  test('the mechanism: an unconditional write inside an observer runs away', () => {
    // Reproduces the shipped behaviour in miniature so the fix is justified by the
    // mechanism, not by assertion alone.
    let mutations = 0; let observers = [];
    const bundle = { _t: 'placeholder',
      get textContent() { return this._t; },
      set textContent(v) { this._t = v; mutations++; observers.forEach(cb => cb()); } };
    const drive = write => {
      mutations = 0; bundle._t = 'placeholder'; observers = [];
      let depth = 0, runaway = false;
      observers.push(() => { if (++depth > 50) { runaway = true; return; } write(); });
      write();
      return { mutations, runaway };
    };
    const bad = drive(() => { bundle.textContent = 'FIXED'; });
    const good = drive(() => { if (bundle.textContent !== 'FIXED') bundle.textContent = 'FIXED'; });
    assert.strictEqual(bad.runaway, true, 'unconditional write must be shown to loop');
    assert.strictEqual(good.runaway, false, 'guarded write must settle');
    assert.strictEqual(good.mutations, 1, 'guarded write mutates exactly once');
  });

  test('shipped writes are guarded, so the observer cannot feed itself', () => {
    assert.ok(/function setTextIfChanged/.test(fix), 'writes go through a change-guarded helper');
    assert.ok(/if \(String\(node\.textContent \|\| ''\) === value\) return false;/.test(fix),
      'helper must compare before assigning');
    // No raw textContent assignment may remain in the observer path.
    const rawWrites = fix.match(/\.textContent\s*=/g) || [];
    assert.strictEqual(rawWrites.length, 1,
      'only the helper may assign textContent; found ' + rawWrites.length + ' assignments');
  });

  test('the observer is detached while writing and re-attached after', () => {
    assert.ok(/observer\.disconnect\(\)/.test(fix), 'detach before writing');
    const disconnectAt = fix.indexOf('observer.disconnect()');
    const writeAt = fix.indexOf('setTextIfChanged(root.document.querySelector');
    assert.ok(disconnectAt > -1 && writeAt > -1 && disconnectAt < writeAt,
      'disconnect must precede the writes');
    assert.ok(/if \(wasObserving\) observe\(\);/.test(fix), 're-attach after writing');
  });

  test('observer bursts are coalesced instead of running per record', () => {
    assert.ok(/function scheduleCorrection/.test(fix), 'callback schedules rather than works inline');
    assert.ok(/if \(scheduled\) return;/.test(fix), 'repeat records collapse into one pass');
    assert.ok(/new root\.MutationObserver\(scheduleCorrection\)/.test(fix),
      'observer must call the coalescing scheduler, not the DOM pass directly');
  });

  // ---- defect 2: Classroom hard-required the optional 94MB Indonesian bundle --------
  // m025-49 changes the architecture: Puter cloud can make the Indonesian runtime ready
  // without downloading the local bundle. The old assertion `status().prepared` meant
  // "all readiness is a local download" and is no longer true system-wide. Preserve the
  // properties that still matter: local `prepared` remains an offline-download signal,
  // cloud readiness is explicit, and every Classroom fallback keeps Indonesian language.
  test('Classroom selects the Indonesian runtime from local preparation or cloud readiness', () => {
    assert.ok(/indoReady/.test(fix), 'Indonesian runtime readiness is checked');
    assert.ok(/indoStatus\.prepared \|\| indoStatus\.cloudReady/.test(fix),
      'local downloaded readiness and Puter cloud readiness are distinct valid routes');
    assert.ok(/baseRuntime\.speak\(spoken/.test(fix),
      'a last-resort neural route still exists when the dedicated runtime cannot be used');
    assert.ok(/\{ lang: 'id-ID', allowFallback: false \}/.test(fix),
      'the last-resort global runtime must be forced to Indonesian, never inherit English default');
    // The old code threw when the module was missing; that is what broke Classroom.
    assert.ok(!/throw new Error\('indonesian_bundle_module_missing'\)[\s\S]{0,200}classroomStop/.test(fix),
      'a missing local Indonesian bundle must not abort Classroom speech');
  });

  test('the fallback is neural, never browser TTS', () => {
    assert.ok(!/SpeechSynthesis/.test(fix), 'browser TTS must not appear in the tutor path');
    const speakBlock = fix.slice(fix.indexOf('async function classroomSpeak'), fix.indexOf('function classroomStop'));
    assert.ok(/allowFallback: false/.test(speakBlock), 'fallback path stays neural-only');
  });

  // ---- defect 3: the scanner reported every healthy install as failing --------------
  test('adaptive accepts the numeric level index the app actually stores', () => {
    // state.level is a 1-based index into LEVELS, resolved as LEVELS[state.level-1].
    [1, 2, 3, 4, 5, 6].forEach(index => {
      assert.deepStrictEqual(selftests.adaptive({ level: index }, targets), [],
        'index ' + index + ' is valid app data, not a defect');
    });
    ['A1', 'C2'].forEach(cefr => {
      assert.deepStrictEqual(selftests.adaptive({ level: cefr }, targets), [],
        'a CEFR string stays acceptable');
    });
  });

  test('adaptive still catches a genuinely out-of-range level', () => {
    [0, 7, 'Z9'].forEach(bad => {
      const codes = selftests.adaptive({ level: bad }, targets).map(f => f.code);
      assert.ok(codes.includes('ADAPTIVE_INVALID_LEVEL'), 'must still flag ' + JSON.stringify(bad));
    });
    assert.deepStrictEqual(selftests.adaptive({ level: '' }, targets), [], 'unset level is not a defect');
    assert.ok(selftests.adaptive({ level: 1, stuck: true }, targets).map(f => f.code).includes('ADAPTIVE_STUCK'));
  });


  // ---- defect 4 (m025-40): a Proxy over the frozen runtime killed ALL speech --------
  test('the mechanism: proxying a frozen object with substituted members throws', () => {
    const frozen = Object.freeze({ speak: function () { return 'base'; } });
    const proxied = new Proxy(frozen, {
      get(t, p, r) { if (p === 'speak') return function () { return 'other'; }; return Reflect.get(t, p, r); }
    });
    assert.throws(() => proxied.speak,
      /non-configurable|read-only/i,
      'a get trap must return the frozen target value, so substitution is a hard TypeError');
    // The supported idiom: copy the surface, override on the copy.
    const wrapped = Object.freeze(Object.assign({}, frozen, { speak: function () { return 'other'; } }));
    assert.strictEqual(wrapped.speak(), 'other', 'spread-and-freeze substitutes cleanly');
  });

  test('the tutor patch never proxies the runtime', () => {
    assert.ok(!/new Proxy\s*\(\s*baseRuntime/.test(fix),
      'FiezelVoiceRuntime is frozen; proxying it breaks every speak call app-wide');
    assert.ok(/Object\.freeze\(Object\.assign\(\{\}, baseRuntime/.test(fix),
      'must use the spread-and-freeze idiom the other neural patch layers use');
  });

  test('the override preserves the rest of the runtime surface', () => {
    // A wrapper that forgets a member silently removes capability from every caller.
    const base = Object.freeze({
      schema: 's', speak() { return 'b'; }, stop() { return 'bs'; },
      status() { return { prepared: true }; }, prepare() { return 'p'; },
      ensureReady() { return 'e'; }, totalBytes: 7
    });
    const patched = Object.freeze(Object.assign({}, base, { speak: () => 'c', stop: () => 'cs' }));
    Object.keys(base).forEach(key => {
      assert.ok(key in patched, 'member ' + key + ' must survive the override');
    });
    assert.strictEqual(patched.prepare(), 'p');
    assert.strictEqual(patched.ensureReady(), 'e');
    assert.strictEqual(patched.totalBytes, 7);
    assert.strictEqual(patched.speak(), 'c');
  });

  console.log(`FIEZEL tutor classroom regression: PASS ${pass}/0`);
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
