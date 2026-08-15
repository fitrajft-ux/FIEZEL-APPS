'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'features/neural-voice/fiezel-diag-panel.js'),'utf8');

function element(tag){return{tagName:tag,children:[],listeners:{},dataset:{},id:'',className:'',type:'',textContent:'',value:'',classList:{add(){},remove(){}},setAttribute(k,v){this.dataset[k]=v},appendChild(x){this.children.push(x);return x},addEventListener(k,v){this.listeners[k]=v}}}
const store={
  'puter.auth.token.v2':'SENTINEL-STORED-TOKEN',
  'puter.auth.token.origin.v2':'https://api.puter.com',
  'fiezel-neural-voice-diagnostics-v1':'[]'
};
const body=element('body');
const ctx={
  console,Promise,JSON,Date,Object,String,setTimeout,
  document:{readyState:'complete',body,createElement:element,addEventListener(){}},
  location:{
    origin:'https://fitrajft-ux.github.io',
    pathname:'/FIEZEL-APPS/',
    href:'https://fitrajft-ux.github.io/FIEZEL-APPS/?auth=SENTINEL-URL-QUERY#SENTINEL-URL-HASH'
  },
  navigator:{userAgent:'iPhone',standalone:true},
  matchMedia:()=>({matches:true}),
  localStorage:{getItem:k=>store[k]??null},
  FIEZEL_VERSION:'5.19.0',
  puter:{env:'web',authToken:'SENTINEL-RUNTIME-TOKEN',auth:{isSignedIn:()=>true},workers:{},APIOrigin:'https://api.puter.com',defaultGUIOrigin:'https://puter.com'}
};
ctx.globalThis=ctx;
vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'fiezel-diag-panel.js'});
const host=body.children.find(x=>x.id==='fiezelDiagHost');
assert.ok(host);
const open=host.children.find(x=>x.id==='fiezelDiagOpen');
const sheet=host.children.find(x=>x.id==='fiezelDiagSheet');
const text=sheet.children.find(x=>x.id==='fiezelDiagText');
open.listeners.click();
setTimeout(()=>{
  try{
    const raw=text.value;
    const dump=JSON.parse(raw);
    assert.equal(dump.diagBuild,'m025-1');
    assert.equal(dump.href,'https://fitrajft-ux.github.io/FIEZEL-APPS/','diagnostics href must redact query and hash');
    assert.equal(dump.puterAuth.authTokenPresent,true);
    assert.equal(dump.puterAuth.isSignedIn,true);
    assert.equal(dump.puterAuth.storedTokenV2Present,true);
    assert.equal(dump.puterAuth.storedTokenOrigin,'https://api.puter.com');
    assert.equal(dump.puterAuth.apiOrigin,'https://api.puter.com');
    assert.equal(dump.puterAuth.defaultGUIOrigin,'https://puter.com');
    assert.ok(!raw.includes('SENTINEL-STORED-TOKEN'),'stored token content must never be exported');
    assert.ok(!raw.includes('SENTINEL-RUNTIME-TOKEN'),'runtime token content must never be exported');
    assert.ok(!raw.includes('SENTINEL-URL-QUERY'),'URL query content must never be exported');
    assert.ok(!raw.includes('SENTINEL-URL-HASH'),'URL hash content must never be exported');
    console.log('FIEZEL Puter auth diagnostics secrecy regression: PASS');
  }catch(error){console.error(error.stack||error);process.exitCode=1}
},0);
