(function(root){
  'use strict';

  var doc=root.document;
  if(!doc||root.__fiezelHomeRedesign)return;
  root.__fiezelHomeRedesign=true;

  var jargonRules=[
    [/\binsufficient\b/gi,'bukti belum cukup'],
    [/\bnegative\b/gi,'hasil terakhir menurun'],
    [/\babandoned\b/gi,'sesi terhenti'],
    [/\bsessionSize\b/gi,'jumlah soal'],
    [/\bfoundation\b/gi,'dasar'],
    [/\bstretch\b/gi,'menantang'],
    [/\bpace\b/gi,'tempo']
  ];

  function humanizeText(input){
    var value=String(input==null?'':input);
    jargonRules.forEach(function(rule){value=value.replace(rule[0],rule[1]);});
    return value.replace(/\s+/g,' ').trim();
  }

  function appendText(target,value){
    if(value)target.appendChild(doc.createTextNode(value));
  }

  function renderInlineRichText(target,input){
    var text=humanizeText(input);
    var pattern=/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
    var last=0;
    var match;
    target.replaceChildren();
    while((match=pattern.exec(text))){
      appendText(target,text.slice(last,match.index));
      var token=match[0];
      var strong=token.slice(0,2)==='**'||token.slice(0,2)==='__';
      var node=doc.createElement(strong?'strong':'em');
      node.textContent=token.slice(strong?2:1,strong?-2:-1);
      target.appendChild(node);
      last=match.index+token.length;
    }
    appendText(target,text.slice(last));
    target.dataset.homeRedesignRich='1';
    return target;
  }

  function openSkills(){
    var app=doc.getElementById('app');
    if(app)app.classList.add('skills-loading');
    try{
      if(typeof root.go==='function')root.go('skills');
    }finally{
      if(app&&typeof root.requestAnimationFrame==='function'){
        root.requestAnimationFrame(function(){root.requestAnimationFrame(function(){app.classList.remove('skills-loading');});});
      }else if(app){
        root.setTimeout(function(){app.classList.remove('skills-loading');},80);
      }
    }
  }

  function ensureSkillsNav(){
    var nav=doc.querySelector('.bottomnav');
    if(!nav)return;
    doc.body.classList.add('home-redesign-nav');
    if(nav.querySelector('[data-view="skills"]'))return;
    var button=doc.createElement('button');
    button.type='button';
    button.className='nav';
    button.dataset.view='skills';
    button.setAttribute('aria-label','Skills Lab');
    var icon=doc.createElement('i');
    icon.setAttribute('data-lucide','audio-waveform');
    var label=doc.createElement('span');
    label.textContent='Skills';
    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click',openSkills);
    nav.appendChild(button);
    try{root.lucide&&root.lucide.createIcons&&root.lucide.createIcons();}catch(_){ }
  }

  function enhanceCoach(home){
    var coach=home.querySelector('.coach-preview');
    if(!coach)return;
    var paragraph=coach.querySelector('p');
    if(paragraph&&!paragraph.dataset.homeRedesignRich){
      renderInlineRichText(paragraph,paragraph.textContent||'');
    }
    var planLabel=coach.querySelector('.coach-level span');
    if(planLabel&&/CORE PLAN/i.test(planLabel.textContent||''))planLabel.textContent='Rencana belajar hari ini';
    var detail=coach.querySelector('.coach-link');
    if(detail)detail.setAttribute('aria-label','Lihat analisis AI Coach lengkap');
  }

  function enhanceHome(){
    ensureSkillsNav();
    var home=doc.querySelector('#app .launcher-shell');
    doc.body.classList.toggle('home-redesign-active',!!home);
    if(!home)return;
    var secondary=home.querySelector('.launcher-actions .ghost-dark');
    if(secondary){
      secondary.classList.add('home-secondary-ai');
      secondary.setAttribute('aria-label','Analisis skill dengan AI — aksi sekunder');
    }
    enhanceCoach(home);
    var creator=doc.querySelector('#app .privacy-strip');
    if(creator){
      var title=creator.querySelector('b');
      if(title)title.textContent='Laporan untuk pengajar / orang tua';
      var manage=creator.querySelector('button');
      if(manage)manage.setAttribute('aria-label','Kelola laporan di pengaturan');
    }
  }

  var scheduled=false;
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    Promise.resolve().then(function(){scheduled=false;enhanceHome();});
  }

  function start(){
    var app=doc.getElementById('app');
    ensureSkillsNav();
    enhanceHome();
    if(app&&root.MutationObserver){
      new root.MutationObserver(schedule).observe(app,{childList:true,subtree:true});
    }
  }

  root.FiezelHomeRedesign=Object.freeze({humanizeText:humanizeText,renderInlineRichText:renderInlineRichText,enhance:enhanceHome,openSkills:openSkills});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})(typeof globalThis!=='undefined'?globalThis:this);
