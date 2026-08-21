'use strict';
// m028-5 regression: the Supertonic worker is a single WASM thread with no cancellation
// primitive, so stop() can only silence the CALLER's promise - it cannot make the worker
// stop computing. Before this fix, stop() cleared the adapter's single-flight guard
// (`pending`/`generating`) while the worker's in-flight reply for the STOPPED request was
// still outstanding. A new request could then start, post a second message to the same
// worker, and receive the FIRST (stopped) request's audio when it arrived - wrong
// utterance - while its own real reply, arriving later, was silently dropped because
// `pending` had already been consumed by the wrong reply.
//
// This harness controls exactly when the fake worker "replies", so the race is
// reproduced deterministically rather than relying on timing.
const assert = require('assert');
const Adapter = require('./features/neural-voice/fiezel-sherpa-vits-adapter.js');

function controllableWorker() {
  const posts = [];
  let onmessage = null;
  const worker = {
    set onmessage(fn) { onmessage = fn; },
    get onmessage() { return onmessage; },
    onerror: null,
    postMessage(message) { posts.push(message); },
    terminate() {}
  };
  // The real worker announces readiness once, asynchronously, before any generate call.
  setTimeout(() => { if (onmessage) onmessage({ data: { type: 'sherpa-onnx-tts-ready', numSpeakers: 10, modelType: 0 } }); }, 0);
  return {
    worker,
    posts,
    // Delivers a result for the OLDEST still-unanswered generate/generateWithConfig post,
    // exactly like a real single-threaded worker replying in the order it received work.
    replyToOldest(samples) {
      const index = posts.findIndex((p) => (p.type === 'generate' || p.type === 'generateWithConfig') && !p.__answered);
      if (index === -1) throw new Error('no outstanding generate call to reply to');
      posts[index].__answered = true;
      onmessage({ data: { type: 'sherpa-onnx-tts-result', samples: samples || new Float32Array([0.1, 0.1]), sampleRate: 44100 } });
    }
  };
}

function makeAdapter(env) {
  return Adapter.createSherpaVitsAdapter({
    env: { Worker: function () { return env.worker; } },
    expectedSpeakers: 10,
    voiceSids: { id_natural: 2 },
    defaultVoice: 'id_natural',
    padBetweenPhrases: false,
    naturalSpeed: 1
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let pass = 0;
async function test(name, fn) {
  await fn();
  pass += 1;
  console.log('PASS', name);
}

async function run() {
  await test('a second request is refused while the stopped first request is still computing', async () => {
    const env = controllableWorker();
    const adapter = makeAdapter(env);
    await adapter.initialize();

    // Attached immediately: stop() below rejects this promise, and an unattached
    // rejection left pending across several awaits is a real bug of its own.
    const firstRejection = assert.rejects(
      adapter.generate('Kalimat pertama.', { voice: 'id_natural' }),
      /neural_generation_stopped/
    );
    await tick();
    adapter.stop();
    await firstRejection;

    // Before the fix: pending/generating were cleared by stop(), so this second call
    // was allowed to start immediately - even though the worker is still computing the
    // first request in the background and cannot be told to abandon it.
    await assert.rejects(
      adapter.generate('Kalimat kedua.', { voice: 'id_natural' }),
      /neural_generation_busy/,
      'starting a second request while the worker is still busy must fail closed, not silently corrupt the pending slot'
    );

    // The worker's late reply for the STOPPED first request finally arrives. It must
    // not be attributed to anything - there is no live pending request to corrupt.
    env.replyToOldest(new Float32Array([0.9, 0.9]));
    await tick();

    // The adapter must now be genuinely free: the worker is idle again.
    const third = adapter.generate('Kalimat ketiga.', { voice: 'id_natural' });
    await tick();
    env.replyToOldest(new Float32Array([0.3, 0.3]));
    const result = await third;
    assert.ok(Math.abs(result.audio[0] - 0.3) < 1e-6,
      'the next real request must resolve with ITS OWN audio, never a stale reply');
  });

  await test('once the worker actually replies, a new request can proceed normally', async () => {
    const env = controllableWorker();
    const adapter = makeAdapter(env);
    await adapter.initialize();

    const first = adapter.generate('Satu.', { voice: 'id_natural' });
    await tick();
    env.replyToOldest(new Float32Array([0.5, 0.5]));
    const firstResult = await first;
    assert.ok(Math.abs(firstResult.audio[0]-0.5)<1e-6);

    const second = adapter.generate('Dua.', { voice: 'id_natural' });
    await tick();
    env.replyToOldest(new Float32Array([0.7, 0.7]));
    const secondResult = await second;
    assert.ok(Math.abs(secondResult.audio[0]-0.7)<1e-6, 'sequential requests without stop() are unaffected by this fix');
  });

  console.log('worker stale-result regression: ' + pass + ' checks passed');
}

run().catch((error) => { console.error('FAIL', error && error.stack || error); process.exit(1); });
