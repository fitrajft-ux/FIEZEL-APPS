const fs=require('fs'),path=require('path');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const homeRedesign=fs.readFileSync(path.join(root,'features/home-redesign/home-redesign.js'),'utf8');
const homeRedesignCss=fs.readFileSync(path.join(root,'features/home-redesign/home-redesign.css'),'utf8');
const setup=fs.readFileSync(path.join(root,'creator-report-setup.html'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'creator-report-dashboard.html'),'utf8');
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message)};

check((html.match(/class="nav(?: active)?"/g)||[]).length===5,'Static fallback bottom navigation must contain exactly five primary destinations.');
check((html.match(/data-lucide=/g)||[]).length>=9,'Core chrome must use the local icon system.');
check(/aria-label="Buka pengaturan"/.test(html)&&/aria-label="Atur soundtrack"/.test(html),'Icon-only topbar controls need accessible names.');
check(/launcher-shell/.test(app)&&/coach-preview/.test(app)&&/learning-launcher/.test(app),'Home launcher hierarchy is incomplete.');
check(/go\('skills'\)/.test(app)&&/FiezelSLAddon\.create/.test(app)&&/prepareNeuralVoice/.test(app),'Speaking, Listening, and explicit neural voice preparation are not integrated.');
check(html.indexOf('./features/neural-voice/fiezel-neural-voice-bootstrap.js')<html.indexOf('./app.js')&&html.indexOf('./features/speaking-listening/fiezel-speaking-listening-addon.js')<html.indexOf('./app.js'),'Feature runtimes must load before app.js.');
check(/id="globalSky"/.test(html)&&/id="globalCelestial"/.test(html)&&/\.global-sky/.test(css)&&/\.sky-light/.test(css),'Full-viewport celestial atmosphere is incomplete.');
check(/grid-template-columns:minmax\(0,1\.42fr\)/.test(css),'Desktop launcher layout is missing.');
check(/\.learning-launcher\{display:grid;grid-template-columns:repeat\(4,1fr\)/.test(css),'Desktop learning launcher must expose four feature cards.');
check(/@media\(max-width:860px\)/.test(css)&&/@media\(max-width:640px\)/.test(css),'Tablet and mobile breakpoints are missing.');
check(/\.launcher-shell\{grid-template-columns:1fr/.test(css),'Launcher does not collapse to one column.');
check(/\.learning-launcher\{grid-template-columns:1fr\}/.test(css),'Baseline learning launcher fallback does not collapse for mobile.');
check(/width:calc\(100% - 16px\)/.test(css),'Mobile bottom navigation lacks a viewport-safe width.');
check(/max-height:min\(760px,88vh\);overflow:auto/.test(css),'Modal content is not viewport bounded.');
check(/prefers-reduced-motion:reduce/.test(css)&&/\.reduce-motion \*/.test(css),'Reduced-motion coverage is incomplete.');
check(!/[🔊🗣✨💡🏠📚📈]/u.test(app+html),'Runtime UI still uses legacy control emoji instead of the icon library.');
check(/type="button" id="deploy"/.test(setup)&&/type="button" id="load"/.test(dashboard),'Auxiliary pages contain implicit buttons.');
check(/<meta name="viewport"/.test(setup)&&/<meta name="viewport"/.test(dashboard),'Auxiliary pages are not mobile-ready.');

check(html.includes('./features/home-redesign/home-redesign.css')&&html.includes('./features/home-redesign/home-redesign.js'),'Home redesign progressive enhancement assets must be loaded.');
check(html.indexOf('./app.js')<html.indexOf('./features/home-redesign/home-redesign.js'),'Home redesign enhancer must load after app.js so navigation/runtime functions already exist.');
check(/dataset\.view='skills'/.test(homeRedesign)&&/root\.go\('skills'\)/.test(homeRedesign),'Progressive navigation must add Skills Lab without removing the five-item static fallback.');
check(/replaceChildren\(\)/.test(homeRedesign)&&/createTextNode/.test(homeRedesign)&&/createElement\(strong\?'strong':'em'\)/.test(homeRedesign),'AI Coach rich text must be rendered with safe DOM text/strong/em nodes.');
check(!/\.innerHTML\s*=/.test(homeRedesign),'Home redesign must not inject coach or learner text through innerHTML.');
check(/insufficient/.test(homeRedesign)&&/bukti belum cukup/.test(homeRedesign)&&/sessionSize/.test(homeRedesign)&&/jumlah soal/.test(homeRedesign),'Home redesign must humanize bounded internal adaptive jargon in presentation only.');
check(/home-secondary-ai/.test(homeRedesign)&&/home-secondary-ai/.test(homeRedesignCss),'Hero AI analysis action must be explicitly demoted to secondary presentation.');
check(/home-stats>div:nth-child\(1\)/.test(homeRedesignCss)&&/home-stats>div:nth-child\(3\)/.test(homeRedesignCss),'Home overview must hide duplicated Level/Dikuasai summary metrics while leaving source data intact.');
check(/\.home-redesign-active \.learning-launcher\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(homeRedesignCss),'Mobile Home learning modules must use a compact two-column grid.');
check(/\.home-redesign-nav \.bottomnav\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test(homeRedesignCss),'Enhanced navigation must allocate six consistent destinations.');
check(/skills-loading::after/.test(homeRedesignCss)&&/@keyframes fiezelHomeSkeleton/.test(homeRedesignCss),'Skills Lab loading state needs an explicit skeleton treatment.');
check(/privacy-strip p\{display:none\}/.test(homeRedesignCss),'Creator Report must be compacted on Home while its Settings action remains available.');

if(failures.length){
  console.error('FIEZEL UI structure: FAIL');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('FIEZEL UI structure: PASS');
console.log(JSON.stringify({staticFallbackNavigation:5,enhancedNavigation:6,desktopLauncher:true,tabletBreakpoint:860,mobileBreakpoint:640,mobileLearningGrid:2,safeCoachRichText:true,reducedMotion:true,emojiControls:false}));
