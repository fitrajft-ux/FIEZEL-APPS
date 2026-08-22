'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const child=require('child_process');
const root=__dirname;
const feature=path.join(root,'features','speaking-listening');
const runtime=require(path.join(feature,'fiezel-speaking-listening-addon.js'));
const listening=JSON.parse(fs.readFileSync(path.join(feature,'listening-bank-v1.json'),'utf8'));
const speaking=JSON.parse(fs.readFileSync(path.join(feature,'speaking-bank-v1.json'),'utf8'));
const runtimeText=fs.readFileSync(path.join(feature,'fiezel-speaking-listening-addon.js'),'utf8');
let pass=0;
function test(name,fn){fn();pass++;console.log('PASS',name)}
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
const levels=['A1','A2','B1','B2','C1','C2'];
// m025-31: OWNER reduced the English catalog to Bella and Heart.
const voices=['af_bella','af_heart'];

test('runtime schema',()=>assert.equal(runtime.schema,'fiezel-speaking-listening-addon-v1'));
// m025-111: seluruh bank kini berasal dari skenario. Yang dijaga bukan angka total,
// melainkan bahwa tiap level punya 40 skenario dan lima format resmi TOEFL/IELTS -
// mematok totalnya membuat setiap penambahan skenario berikutnya gagal tanpa alasan.
test('listening bank identity',()=>assert.deepStrictEqual([listening.schema,listening.version,listening.status],['fiezel-listening-bank-v1',2,'reviewed_release_seed']));
test('listening count matches items',()=>assert.equal(listening.count,listening.items.length));
test('tidak ada sisa bank lama',()=>assert.ok(listening.items.every(i=>i.id.startsWith('listen_sc_')),'masih ada item bank lama'));
test('setiap level punya 40 skenario',()=>{for(const level of levels){const scenarios=new Set(listening.items.filter(i=>i.level===level).map(i=>i.pedagogy.scenario));assert.equal(scenarios.size,40,level+' punya '+scenarios.size+' skenario')}});
test('setiap level punya 40 soal untuk tiap format resmi',()=>{for(const level of levels)for(const mode of ['gist','detail','inference','attitude','paraphrase'])assert.equal(listening.items.filter(i=>i.level===level&&i.mode===mode).length,40,level+'/'+mode)});
// Nama dan tempat yang dipakai ulang adalah cara paling cepat membuat bank terasa
// seperti satu template - bank lama hanya memuat lima nama orang untuk 1236 soal.
test('karakter dan setting tidak dipakai dua skenario',()=>{const who=new Set(),where=new Set();for(const i of listening.items){const c=i.pedagogy.character;assert.ok(c,'skenario tanpa karakter: '+i.id);if(!who.has(c+'|'+i.pedagogy.scenario)){assert.ok(![...who].some(k=>k.split('|')[0]===c),'karakter dipakai dua skenario: '+c);who.add(c+'|'+i.pedagogy.scenario)}where.add(i.pedagogy.scenario)}assert.equal(where.size,240)});
// Gerbang mutu dijalankan generator sebelum berkas ditulis. Tes ini memastikan gerbang
// itu benar-benar hidup: bank yang tersimpan harus lolos pemeriksaan yang sama.
test('bank tersimpan lolos gerbang mutu',()=>{const quality=require(path.join(feature,'listening-quality.js'));assert.equal(quality.assertSound(listening.items),true)});
// Satu skenario memang dipakai lima soal; yang membuat bank terasa diulang-ulang adalah
// naskah yang sama muncul di DUA skenario berbeda, dan itu tidak terlihat dari jumlah
// item mana pun.
test('tidak ada naskah dipakai dua skenario',()=>{const seen=new Map();for(const i of listening.items){if(i.mode==='dictation')continue;const key=i.level+'|'+i.script.toLowerCase();const scen=i.pedagogy.scenario;if(seen.has(key))assert.equal(seen.get(key),scen,'naskah dipakai dua skenario di '+i.level+': '+i.script.slice(0,60));else seen.set(key,scen)}});
// Jawaban benar yang menumpuk di satu posisi bisa ditebak tanpa mendengarkan sama sekali.
test('posisi jawaban benar tersebar',()=>{const mcq=listening.items.filter(i=>i.mode!=='dictation'),pos=[0,0,0,0];mcq.forEach(i=>pos[i.answerIndex]++);const min=Math.min(...pos),max=Math.max(...pos);assert.ok(min>=max*0.7,'sebaran posisi jawaban timpang: '+pos.join('/'))});
test('speaking bank reviewed v2 seed',()=>assert.deepStrictEqual([speaking.schema,speaking.version,speaking.status,speaking.count],['fiezel-speaking-bank-v1',2,'reviewed_release_seed',36]));
test('all IDs unique',()=>assert.equal(new Set([...listening.items,...speaking.items].map(item=>item.id)).size,listening.items.length+speaking.items.length));
test('six seed items per level per domain',()=>{for(const level of levels)assert.equal(speaking.items.filter(item=>item.level===level).length,6)});
// Dictation tidak termasuk lima format resmi, tetapi menulis ulang yang didengar melatih
// pemenggalan kata dan ejaan - dan itu tidak diuji satu pun format pilihan ganda. Kalimatnya
// diambil dari naskah skenario yang sudah lolos gerbang, bukan ditulis sebagai daftar lepas.
test('dictation ada di tiap level dan berasal dari naskah skenario',()=>{const scripts=new Set(listening.items.filter(i=>i.mode!=='dictation').map(i=>i.script));for(const level of levels){const rows=listening.items.filter(i=>i.level===level&&i.mode==='dictation');assert.ok(rows.length>=30,level+' hanya punya '+rows.length+' dictation');assert.ok(rows.every(i=>[...scripts].some(s=>s.includes(i.script))),level+' punya dictation di luar naskah skenario')}});
test('two items per speaking mode and level',()=>{for(const level of levels)for(const mode of ['repeat_target','guided_response','roleplay'])assert.equal(speaking.items.filter(item=>item.level===level&&item.mode===mode).length,2)});
test('listening voices use locked pool',()=>assert.ok(listening.items.every(item=>voices.includes(item.voice)&&item.audioProfile==='listening')));
test('listening MCQ answer integrity',()=>assert.ok(listening.items.filter(item=>item.mode!=='dictation').every(item=>item.options.length===4&&new Set(item.options).size===4&&Number.isInteger(item.answerIndex)&&item.answerIndex>=0&&item.answerIndex<4)));
test('dictation target integrity',()=>assert.ok(listening.items.filter(item=>item.mode==='dictation').every(item=>item.answerText===item.script&&item.scoring.metric==='token_f1')));
test('raw listening response persistence forbidden',()=>assert.ok(listening.items.every(item=>item.privacy.rawLearnerResponseRequiredForPersistence===false)));
test('repeat targets use token F1',()=>assert.ok(speaking.items.filter(item=>item.mode==='repeat_target').every(item=>item.targetText&&item.scoring.metric==='token_f1')));
test('open speaking items use concept groups',()=>assert.ok(speaking.items.filter(item=>item.mode!=='repeat_target').every(item=>item.scoring.metric==='target_concept_coverage'&&item.scoring.minimumWords>=4&&item.targetConcepts.length>=2&&item.targetConcepts.every(group=>Array.isArray(group)&&group.length))));
test('all supplied speaking samples meet their own target',()=>{for(const item of speaking.items){const result=runtime.scoreSpeaking(item,item.sampleAnswer);assert.equal(result.passed,true,`${item.id} sample scored ${result.score}`)}});
test('guided alternative phrasing is accepted',()=>assert.equal(runtime.scoreSpeaking(speaking.items.find(item=>item.id==='speak_0003'),'I love fried rice since it tastes good.').passed,true));
test('roleplay alternative phrasing is accepted',()=>assert.equal(runtime.scoreSpeaking(speaking.items.find(item=>item.id==='speak_0011'),'Could you say that again, please?').passed,true));
test('irrelevant short speech fails coverage',()=>assert.equal(runtime.scoreSpeaking(speaking.items.find(item=>item.id==='speak_0027'),'I do not know.').passed,false));
test('speaking result disclaims pronunciation',()=>assert.ok(speaking.items.every(item=>runtime.scoreSpeaking(item,item.sampleAnswer).claim==='spoken_production_coverage_not_pronunciation')));
test('automatic listening stays locked until audio succeeds',()=>assert.ok(runtimeText.includes('<fieldset class="fsl-work" data-work disabled>')&&runtimeText.includes("querySelector('[data-work]').disabled=false")));
test('external TTS dependency is lifecycle checked',()=>assert.ok(runtimeText.includes("typeof this.options.tts.play==='function'")&&runtimeText.includes("typeof this.options.tts.stop==='function'")));
test('canonical learner state is never referenced',()=>assert.ok(!runtimeText.includes('fiezel-v4-state')));
test('raw transcript and audio persistence stay disabled',()=>{const cfg=runtime.__test.mergeConfig({persistRawAudio:true,persistRawTranscript:true});assert.equal(cfg.persistRawAudio,false);assert.equal(cfg.persistRawTranscript,false)});
test('capability metadata is bounded and sanitized',()=>{const capabilityEvents={};for(let i=0;i<30;i++)capabilityEvents['capability-'+i]={status:'x'.repeat(100),at:Number.MAX_SAFE_INTEGER,raw:'forbidden'};const clean=runtime.__test.sanitizeState({schema:'fiezel-speaking-listening-state-v1',events:[],capabilityEvents},120);assert.ok(Object.keys(clean.capabilityEvents).length<=12);assert.ok(Object.values(clean.capabilityEvents).every(value=>Object.keys(value).sort().join(',')==='at,status'&&value.status.length<=40))});
test('state sanitizer strips raw media claims',()=>{const clean=runtime.__test.sanitizeState({schema:'fiezel-speaking-listening-state-v1',events:[{domain:'speaking',itemId:'x',level:'B1',mode:'roleplay',score:88,passed:true,responseMs:1000,rawAudioStored:true,rawTranscriptStored:true,transcript:'secret'}]},120);assert.equal(clean.events[0].rawAudioStored,false);assert.equal(clean.events[0].rawTranscriptStored,false);assert.ok(!JSON.stringify(clean).includes('secret'))});
// m025-110: OWNER meminta urutan soal berubah setiap kali sesi dibuka dan tidak bisa
// ditebak. Yang dijaga di sini adalah pengacakan itu terjadi DI SESI, bukan di bank -
// bank harus tetap identik setiap rebuild, dan mengacak sumbernya akan membuat tes
// idempotensi di bawah merah setiap kali dijalankan.
test('urutan sesi diacak, bank soal tidak',()=>{
  const {shuffle}=runtime.__test;
  const base=Array.from({length:24},(_,i)=>i);
  const snapshot=base.join(',');
  const a=shuffle(base),b=shuffle(base);
  assert.equal(base.join(','),snapshot,'shuffle mengacak larik aslinya, bukan salinannya');
  assert.notEqual(a.join(','),b.join(','),'dua sesi berturut-turut mendapat urutan sama');
  assert.equal(a.slice().sort((x,y)=>x-y).join(','),snapshot,'ada soal hilang atau ganda setelah diacak');
});
test('pengacakan tidak memihak posisi awal',()=>{
  // Pengacakan yang memihak membuat soal pertama bisa ditebak, yang persis keluhan OWNER.
  const {shuffle}=runtime.__test;
  const base=Array.from({length:10},(_,i)=>i),count={};
  for(let t=0;t<4000;t++){const s=shuffle(base);count[s[0]]=(count[s[0]]||0)+1}
  const v=Object.values(count);
  assert.equal(v.length,10,'tidak semua soal pernah muncul pertama');
  assert.ok((Math.max(...v)-Math.min(...v))/4000<0.03,'sebaran posisi pertama timpang: '+v.join('/'));
});
test('sesi mengambil soal lewat jalur yang diacak',()=>{
  const src=fs.readFileSync(path.join(feature,'fiezel-speaking-listening-addon.js'),'utf8');
  assert.ok(/return shuffle\(rows\.filter/.test(src),'pemilih soal sesi tidak mengacak');
});
// OWNER: tombol Lanjut terkubur di bawah blok umpan balik dan harus dicari dengan
// menggulir. Blok itu memuat naskah lengkap, jadi pada soal panjang tombolnya berada
// jauh di luar layar tepat ketika ia paling dibutuhkan.
test('tombol Lanjut Skills Lab mengambang, tidak ikut tergulung',()=>{
  const css=fs.readFileSync(path.join(feature,'speaking-listening-addon.css'),'utf8');
  assert.ok(/\.fsl-feedback \.fsl-actions\{[^}]*position:fixed/.test(css),
    'tombol Lanjut tidak mengambang');
  // Hanya blok umpan balik yang diangkat: .fsl-actions juga dipakai tombol mulai dan
  // rekam, dan membuat semuanya mengambang akan menutupi soalnya.
  assert.ok(!/^\.fsl-actions\{[^}]*position:fixed/m.test(css),
    'seluruh .fsl-actions ikut mengambang dan akan menutupi soal');
});
test('data rebuild is idempotent',()=>{const files=[path.join(feature,'listening-bank-v1.json'),path.join(feature,'speaking-bank-v1.json')],before=files.map(hash);child.execFileSync(process.execPath,[path.join(root,'rebuild-speaking-listening-data.js')],{stdio:'ignore'});assert.deepStrictEqual(files.map(hash),before)});
// m025-65: replay pengguna kini benar-benar disimpan pada event. Sebelumnya controller
// menghitungnya lalu membuangnya, sehingga R3 harus melaporkan replay sebagai "belum terukur"
// - bukan karena tidak diketahui aplikasi, melainkan karena tidak pernah dicatat.
test('replay pengguna tercatat pada event, bukan dibuang',()=>{
  const store=new runtime.__test.StateStore(runtime.__test.mergeConfig({}));
  store.state=runtime.__test.freshState();
  const item={id:'lis_0001',level:'A2',mode:'gist'};
  store.record('listening',item,{score:70,passed:true,metric:'keyword_coverage'},8000,3);
  const event=store.state.events[store.state.events.length-1];
  assert.equal(event.replays,3);
  const evidence=store.evidence();
  assert.equal(evidence.domains.listening.replays,3);
  assert.equal(evidence.domains.listening.replayRate,3);
});

test('replay yang tidak wajar dibatasi sebelum disimpan',()=>{
  const store=new runtime.__test.StateStore(runtime.__test.mergeConfig({}));
  store.state=runtime.__test.freshState();
  const item={id:'lis_0002',level:'A2',mode:'gist'};
  store.record('listening',item,{score:50,passed:false,metric:'keyword_coverage'},5000,9999);
  store.record('listening',item,{score:50,passed:false,metric:'keyword_coverage'},5000,-4);
  assert.equal(store.state.events[0].replays,20);
  assert.equal(store.state.events[1].replays,0);
});

test('sanitizer mempertahankan replay dan tetap membatasinya',()=>{
  const clean=runtime.__test.sanitizeState({schema:'fiezel-speaking-listening-state-v1',events:[
    {domain:'listening',itemId:'x',level:'A2',mode:'gist',score:60,passed:true,responseMs:5000,replays:2},
    {domain:'listening',itemId:'y',level:'A2',mode:'gist',score:60,passed:true,responseMs:5000,replays:500}
  ]},120);
  assert.equal(clean.events[0].replays,2);
  assert.equal(clean.events[1].replays,20);
});

test('pemanggil meneruskan jumlah replay yang benar-benar terjadi',()=>assert.ok(runtimeText.includes('this.store.record(this.domain,item,result,ms,this.replays)')));

console.log(`FIEZEL Speaking + Listening: PASS ${pass}/0`);
