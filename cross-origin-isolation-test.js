'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');

assert.ok(sw.includes("'Cross-Origin-Opener-Policy':'same-origin'"),'service worker must emit COOP same-origin');
assert.ok(sw.includes("'Cross-Origin-Embedder-Policy':'require-corp'"),'service worker must emit COEP require-corp');
assert.ok(sw.includes("e.request.mode==='navigate'"),'navigation responses must receive isolation headers');
assert.ok(sw.includes('withCoopCoep'),'same-origin responses must be rebuilt with COOP/COEP');
assert.ok(sw.includes('requestUrl.origin!==self.location.origin'),'cross-origin requests must be distinguished');
assert.ok(!sw.includes('fetchCrossOriginWithCorp'),'opaque no-cors responses must not be reconstructed');
assert.ok(!sw.includes("Cross-Origin-Resource-Policy','cross-origin'"),'service worker must not synthesize CORP onto opaque responses');
assert.ok(!sw.includes("status:200,statusText:'OK'"),'service worker must not turn opaque responses into synthetic 200 responses');

console.log('FIEZEL cross-origin isolation regression: PASS');
