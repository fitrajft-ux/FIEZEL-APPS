(function(root){
  'use strict';

  // FIEZEL diagnostics exporter (M-019)
  //
  // Tujuan: owner memakai FIEZEL dari ikon Home Screen (PWA standalone) dan tidak
  // punya Mac. Storage container standalone iOS terpisah dari tab Safari, dan tanpa
  // Mac tidak ada Web Inspector, jadi tidak ada cara membaca localStorage dari luar.
  // Panel ini membuat app mengekspor datanya sendiri.
  //
  // KONTRAK READ-ONLY: file ini tidak boleh menulis atau menghapus apa pun di
  // localStorage, CacheStorage, atau IndexedDB. Nilai token autentikasi tidak pernah
  // diekspor; panel hanya mencatat presence boolean dan origin non-secret.
  //
  // DIAG_BUILD adalah penanda deploy manual yang sekarang dijaga A7. Untuk setiap
  // product deploy, angka m025-N wajib naik tepat +1 dan SW_REV wajib membawa build
  // yang sama. Ini membedakan build baru aktif vs shell lama dari service worker.
  var DIAG_BUILD = 'm025-49';

  var KEY = 'fiezel-neural-voice-diagnostics-v1';
  var Z = 2147483000;

  if (!root.document || root.__fiezelDiagPanel) return;
  root.__fiezelDiagPanel = true;

  function safe(fn, fallback) {
    try { return fn(); }
    catch (error) { return arguments.length > 1 ? fallback : 'ERR: ' + String(error && error.message || error); }
  }

  function collectPuterAuth() {
    return safe(function(){
      var puter = root.puter || null;
      var auth = puter && puter.auth;
      var signedIn = null;
      if (auth && typeof auth.isSignedIn === 'function') {
        var value = auth.isSignedIn();
        if (typeof value === 'boolean') signedIn = value;
      }
      return {
        env: puter && puter.env != null ? String(puter.env) : null,
        authTokenPresent: !!(puter && puter.authToken),
        isSignedIn: signedIn,
        storedTokenV2Present: !!root.localStorage.getItem('puter.auth.token.v2'),
        storedTokenOrigin: root.localStorage.getItem('puter.auth.token.origin.v2') || null,
        apiOrigin: puter && puter.APIOrigin ? String(puter.APIOrigin) : null,
        defaultGUIOrigin: puter && puter.defaultGUIOrigin ? String(puter.defaultGUIOrigin) : null
      };
    }, {
      env: null,
      authTokenPresent: false,
      isSignedIn: null,
      storedTokenV2Present: false,
      storedTokenOrigin: null,
      apiOrigin: null,
      defaultGUIOrigin: null
    });
  }

  function collectSync() {
    return {
      diagBuild: DIAG_BUILD,
      appVersion: safe(function(){ return String(root.FIEZEL_VERSION || '(tidak ada)'); }),
      capturedAt: new Date().toISOString(),
      origin: safe(function(){ return location.origin; }),
      href: safe(function(){ return String(location.origin || '') + String(location.pathname || ''); }),
      standalone: safe(function(){
        return (root.navigator && root.navigator.standalone === true) ||
               !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
      }),
      userAgent: safe(function(){ return root.navigator.userAgent; }),
      crossOriginIsolated: safe(function(){ return root.crossOriginIsolated === true; }),
      puterLoaded: safe(function(){ return typeof root.puter !== 'undefined' && !!root.puter; }),
      puterWorkersLoaded: safe(function(){ return !!(root.puter && root.puter.workers); }),
      puterAuth: collectPuterAuth(),
      localStorageKeys: safe(function(){ return Object.keys(root.localStorage); }, []),
      target: safe(function(){ return root.localStorage.getItem(KEY); }, null),
      runtimeStatus: safe(function(){
        return (root.FiezelVoiceRuntime && root.FiezelVoiceRuntime.status)
          ? root.FiezelVoiceRuntime.status() : '(FiezelVoiceRuntime tidak ada)';
      }),
      swController: safe(function(){
        var c = root.navigator.serviceWorker && root.navigator.serviceWorker.controller;
        return c ? { scriptURL: c.scriptURL, state: c.state } : null;
      }),
      storageEstimate: '(memuat)',
      cacheInventory: '(memuat)'
    };
  }

  function addStorageEstimate(dump) {
    var manager = root.navigator && root.navigator.storage;
    if (!manager || typeof manager.estimate !== 'function') {
      dump.storageEstimate = '(navigator.storage.estimate tidak tersedia)';
      return Promise.resolve();
    }
    return manager.estimate().then(function(est){
      dump.storageEstimate = {
        quota: est && est.quota,
        usage: est && est.usage,
        available: (est && typeof est.quota === 'number' && typeof est.usage === 'number')
          ? est.quota - est.usage : null,
        usageDetails: (est && est.usageDetails) || null
      };
    }).catch(function(error){
      dump.storageEstimate = 'ERR: ' + String(error && error.message || error);
    });
  }

  function inspectCache(name) {
    return root.caches.open(name).then(function(cache){
      return cache.keys().then(function(requests){
        var neural = requests.filter(function(r){ return r.url.indexOf('/vendor/kokoro-') !== -1; });
        return neural.reduce(function(chain, request){
          return chain.then(function(list){
            return cache.match(request).then(function(response){
              list.push({
                asset: request.url.replace(/^.*\/vendor\//, 'vendor/'),
                contentLength: response ? response.headers.get('content-length') : null,
                contentType: response ? response.headers.get('content-type') : null
              });
              return list;
            });
          });
        }, Promise.resolve([])).then(function(neuralAssets){
          return { name: name, entryCount: requests.length, neuralAssets: neuralAssets };
        });
      });
    });
  }

  function addCacheInventory(dump) {
    if (!root.caches) {
      dump.cacheInventory = '(CacheStorage tidak tersedia)';
      return Promise.resolve();
    }
    return root.caches.keys().then(function(names){
      return names.reduce(function(chain, name){
        return chain.then(function(list){
          return inspectCache(name).then(function(info){ list.push(info); return list; })
            .catch(function(error){
              list.push({ name: name, error: String(error && error.message || error) });
              return list;
            });
        });
      }, Promise.resolve([]));
    }).then(function(list){
      dump.cacheInventory = list;
    }).catch(function(error){
      dump.cacheInventory = 'ERR: ' + String(error && error.message || error);
    });
  }

  function addRuntimeDiagnostics(dump) {
    dump.runtimeDiagnostics = safe(function(){
      return (root.FiezelVoiceRuntime && root.FiezelVoiceRuntime.diagnostics)
        ? root.FiezelVoiceRuntime.diagnostics() : '(FiezelVoiceRuntime tidak ada)';
    });
  }
  function serialize(value) {
    try { return JSON.stringify(value, null, 2); }
    catch (error) { return 'Gagal membentuk JSON: ' + String(error && error.message || error); }
  }

  function findMatches(value, query) {
    var matches = [];
    var needle = String(query || '').toLowerCase();
    if (!needle) return matches;
    var haystack = String(value || '').toLowerCase();
    var from = 0;
    while (from <= haystack.length) {
      var found = haystack.indexOf(needle, from);
      if (found < 0) break;
      matches.push(found);
      from = found + Math.max(needle.length, 1);
    }
    return matches;
  }

  function build() {
    var host = root.document.createElement('div');
    host.id = 'fiezelDiagHost';
    host.setAttribute('data-diag-build', DIAG_BUILD);

    var style = root.document.createElement('style');
    style.textContent = [
      '#fiezelDiagHost{position:fixed;z-index:' + Z + ';}',
      '#fiezelDiagOpen{position:fixed;z-index:' + Z + ';',
      'right:calc(12px + env(safe-area-inset-right));',
      'top:calc(12px + env(safe-area-inset-top));',
      'padding:9px 13px;border:1px solid #11172a;border-radius:11px;',
      'background:#11172a;color:#fff;font:600 13px/1 -apple-system,system-ui,sans-serif;}',
      '#fiezelDiagSheet{position:fixed;inset:0;z-index:' + (Z + 1) + ';display:none;',
      'flex-direction:column;gap:9px;background:#fff;',
      'padding:calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));}',
      '#fiezelDiagSheet.open{display:flex;}',
      '#fiezelDiagSheet h2{margin:0;font:700 15px/1.3 -apple-system,system-ui,sans-serif;color:#11172a;}',
      '#fiezelDiagSheet p{margin:0;font:400 12px/1.5 -apple-system,system-ui,sans-serif;color:#5f6c80;}',
      '#fiezelDiagSearchBar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}',
      '#fiezelDiagSearch{flex:1 1 180px;min-width:0;box-sizing:border-box;padding:10px 11px;',
      'border:1px solid #cfd5df;border-radius:10px;background:#fff;color:#11172a;',
      'font:500 13px/1.2 -apple-system,system-ui,sans-serif;}',
      '#fiezelDiagSearchCount{min-width:52px;text-align:center;color:#5f6c80;',
      'font:600 11px/1.2 -apple-system,system-ui,sans-serif;}',
      '#fiezelDiagSearchBar button{padding:10px 11px;border-radius:10px;border:1px solid #dfddd6;',
      'background:#fff;color:#11172a;font:600 12px/1 -apple-system,system-ui,sans-serif;}',
      '#fiezelDiagText{flex:1;width:100%;min-height:0;box-sizing:border-box;padding:9px;',
      'border:1px solid #dfddd6;border-radius:10px;background:#fbfbf9;color:#11172a;',
      'font:400 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-user-select:text;user-select:text;}',
      '#fiezelDiagBar{display:flex;flex-wrap:wrap;gap:7px;}',
      '#fiezelDiagBar button{flex:1 1 auto;padding:11px 13px;border-radius:11px;',
      'border:1px solid #dfddd6;background:#fff;color:#11172a;',
      'font:600 13px/1 -apple-system,system-ui,sans-serif;}',
      '#fiezelDiagBar button.primary{border-color:#11172a;background:#11172a;color:#fff;}'
    ].join('');

    var open = root.document.createElement('button');
    open.id = 'fiezelDiagOpen';
    open.type = 'button';
    open.textContent = 'Diagnostics';

    var sheet = root.document.createElement('div');
    sheet.id = 'fiezelDiagSheet';

    var heading = root.document.createElement('h2');
    heading.textContent = 'Diagnostics · ' + DIAG_BUILD;

    var note = root.document.createElement('p');
    note.textContent = 'Cari event penting langsung di bawah. Kirim isi kotak ini ke coordinator bila perlu.';

    var searchBar = root.document.createElement('div');
    searchBar.id = 'fiezelDiagSearchBar';

    var search = root.document.createElement('input');
    search.id = 'fiezelDiagSearch';
    search.type = 'search';
    search.placeholder = 'Cari: wasm_policy, timeout, adapter...';
    search.autocomplete = 'off';
    search.spellcheck = false;
    var searchCount = root.document.createElement('span');
    searchCount.id = 'fiezelDiagSearchCount';
    searchCount.textContent = 'Cari';

    var previous = root.document.createElement('button');
    previous.type = 'button';
    previous.textContent = '↑ Sebelumnya';

    var next = root.document.createElement('button');
    next.type = 'button';
    next.textContent = '↓ Berikutnya';

    searchBar.appendChild(search);
    searchBar.appendChild(searchCount);
    searchBar.appendChild(previous);
    searchBar.appendChild(next);

    var text = root.document.createElement('textarea');
    text.id = 'fiezelDiagText';
    text.readOnly = true;
    text.spellcheck = false;

    var bar = root.document.createElement('div');
    bar.id = 'fiezelDiagBar';

    var send = root.document.createElement('button');
    send.type = 'button';
    send.className = 'primary';
    send.textContent = 'Kirim';

    var sendTarget = root.document.createElement('button');
    sendTarget.type = 'button';
    sendTarget.textContent = 'Kirim ringkas';

    var close = root.document.createElement('button');
    close.type = 'button';
    close.textContent = 'Tutup';

    // m025-34: per-module badges so the user sees which module is broken without
    // reading raw JSON, and a plain-text summary they can paste straight into a chat.
    var badges = root.document.createElement('div');
    badges.id = 'fiezelDiagBadges';
    // The diagnostics harness renders this panel against a minimal DOM stub, so style
    // may be absent. Presentation is optional; the badges themselves are not.
    if (badges.style) badges.style.cssText = 'margin:2px 0;line-height:1.9;';
    badges.textContent = 'Menjalankan scan modul…';

    var copySummary = root.document.createElement('button');
    copySummary.type = 'button';
    copySummary.textContent = 'Copy ringkasan';

    bar.appendChild(copySummary);
    bar.appendChild(send);
    bar.appendChild(sendTarget);
    bar.appendChild(close);
    sheet.appendChild(heading);
    sheet.appendChild(note);
    sheet.appendChild(badges);
    sheet.appendChild(searchBar);
    sheet.appendChild(text);
    sheet.appendChild(bar);
    host.appendChild(style);
    host.appendChild(open);
    host.appendChild(sheet);

    return {
      host: host, open: open, sheet: sheet, text: text,
      search: search, searchCount: searchCount, previous: previous, next: next,
      send: send, sendTarget: sendTarget, close: close,
      badges: badges, copySummary: copySummary
    };
  }

  function share(button, label, payload) {
    var original = button.textContent;
    function done(message) {
      button.textContent = message;
      setTimeout(function(){ button.textContent = original; }, 2600);
    }
    if (root.navigator && typeof root.navigator.share === 'function') {
      root.navigator.share({ title: 'FIEZEL diagnostics ' + DIAG_BUILD, text: payload })
        .then(function(){ done('Terkirim'); })
        .catch(function(){ copy(button, done, payload); });
      return;
    }
    copy(button, done, payload);
  }

  function copy(button, done, payload) {
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(payload)
        .then(function(){ done('Tersalin'); })
        .catch(function(){ done('Salin manual dari kotak'); });
      return;
    }
    done('Salin manual dari kotak');
  }

  function mount() {
    var ui = build();
    var body = root.document.body;
    if (!body) return;
    body.appendChild(ui.host);

    var dump = null;
    var matches = [];
    var matchIndex = -1;

    function selectMatch(index) {
      var query = String(ui.search.value || '').trim();
      if (!query) {
        matches = [];
        matchIndex = -1;
        ui.searchCount.textContent = 'Cari';
        return;
      }
      matches = findMatches(ui.text.value, query);
      if (!matches.length) {
        matchIndex = -1;
        ui.searchCount.textContent = '0 hasil';
        return;
      }
      matchIndex = ((index % matches.length) + matches.length) % matches.length;
      ui.searchCount.textContent = (matchIndex + 1) + '/' + matches.length;
      var start = matches[matchIndex];
      safe(function(){
        if (typeof ui.text.focus === 'function') ui.text.focus();
        if (typeof ui.text.setSelectionRange === 'function') ui.text.setSelectionRange(start, start + query.length);
      });
    }

    function refreshSearch() {
      var query = String(ui.search.value || '').trim();
      if (!query) {
        matches = [];
        matchIndex = -1;
        ui.searchCount.textContent = 'Cari';
        return;
      }
      selectMatch(0);
    }

    function setText() {
      ui.text.value = serialize(dump);
      refreshSearch();
    }

    // m025-34: the button now scans every module, not just Neural Voice. The scan is
    // additive -- the existing TTS payload is preserved so older evidence stays readable.
    function runUniversalScan() {
      var bus = root.FiezelDiagnosticBus;
      if (!bus) { dump.universal = { error: 'diagnostic bus tidak tersedia' }; return Promise.resolve(); }
      return bus.getFullReport({
        diagBuild: DIAG_BUILD,
        appVersion: String(root.FIEZEL_VERSION || ''),
        standalone: dump.standalone,
        userAgent: dump.userAgent
      }).then(function(report){
        dump.universal = report;
        dump.universalSummary = bus.summaryText(report);
        renderBadges(report);
      }).catch(function(error){
        dump.universal = { error: String(error && error.message || error) };
      });
    }

    function renderBadges(report) {
      if (!ui.badges) return;
      var health = report.moduleHealth || {};
      var keys = Object.keys(health).sort();
      if (!keys.length) { ui.badges.textContent = 'Tidak ada modul terdaftar.'; return; }
      ui.badges.innerHTML = keys.map(function(key){
        var st = health[key].status;
        var color = st === 'pass' ? '#1f9d6f' : st === 'warn' ? '#c98a1b' : st === 'skip' ? '#748096' : '#e0526f';
        var label = st === 'pass' ? 'OK' : st === 'warn' ? 'WARN' : st === 'skip' ? 'SKIP' : 'FAIL';
        return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:999px;'
          + 'background:' + color + ';color:#fff;font:600 11px/1.4 -apple-system,system-ui,sans-serif;">'
          + label + ' ' + key + '</span>';
      }).join('');
    }

    function refresh() {
      dump = collectSync();
      addRuntimeDiagnostics(dump);
      setText();
      Promise.all([addStorageEstimate(dump), addCacheInventory(dump), runUniversalScan()]).then(function(){
        setText();
      });
    }

    ui.open.addEventListener('click', function(){
      refresh();
      ui.sheet.classList.add('open');
    });
    ui.close.addEventListener('click', function(){
      ui.sheet.classList.remove('open');
    });
    ui.search.addEventListener('input', refreshSearch);
    ui.search.addEventListener('keydown', function(event){
      if (!event || event.key !== 'Enter') return;
      if (event.preventDefault) event.preventDefault();
      selectMatch(matchIndex + (event.shiftKey ? -1 : 1));
    });
    ui.previous.addEventListener('click', function(){ selectMatch(matchIndex - 1); });
    ui.next.addEventListener('click', function(){ selectMatch(matchIndex + 1); });
    ui.send.addEventListener('click', function(){
      share(ui.send, 'Kirim', ui.text.value);
    });
    ui.copySummary.addEventListener('click', function(){
      // Human-readable digest, not JSON: this is the paste-into-chat path.
      var text = dump.universalSummary || 'Ringkasan belum siap. Tutup lalu buka lagi Diagnostics.';
      copy(ui.copySummary, function(label){ ui.copySummary.textContent = label; setTimeout(function(){ ui.copySummary.textContent = 'Copy ringkasan'; }, 1800); }, text);
    });
    ui.sendTarget.addEventListener('click', function(){
      var slim = {
        diagBuild: DIAG_BUILD,
        appVersion: dump && dump.appVersion,
        capturedAt: dump && dump.capturedAt,
        standalone: dump && dump.standalone,
        puterAuth: dump && dump.puterAuth,
        target: dump && dump.target,
        storageEstimate: dump && dump.storageEstimate
      };
      share(ui.sendTarget, 'Kirim ringkas', serialize(slim));
    });
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);