// Harness lokal (bukan gerbang): potret Home + chrome di 320/390/768/1280 untuk meninjau redesign.
// Pakai: node tools/dev/chrome-shots.mjs [outdir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pw = (() => { for (const id of ['playwright', '/usr/lib/node_modules/playwright']) { try { return require(id); } catch (_) {} } return null; })();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || '/tmp/fz-shots';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(ROOT, p));
  fs.stat(f, (err, st) => { if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}/index.html`;
const browser = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const seed = () => { try { localStorage.clear();
  localStorage.setItem('fiezel-onboarding-v1', JSON.stringify({ done: true, at: Date.now(), via: 'finish', locale: 'id', name: 'Rani' }));
  localStorage.setItem('fiezel-reminder-invite-v1', JSON.stringify({ offers: 9, decided: true }));
  localStorage.setItem('fiezel-puter-auth-skipped', '1'); localStorage.setItem('fiezel-tour-v1', 'finish'); } catch (_) {} };
const VIEWS = process.env.VIEWS ? process.env.VIEWS.split(',') : ['home'];
for (const [name, w, h] of [['320', 320, 568], ['390', 390, 844], ['768', 768, 1024], ['1280', 1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  await page.addInitScript(seed);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof window.go === 'function', null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.evaluate(() => { document.getElementById('fiezelBootSplash')?.remove(); document.documentElement.classList.remove('fz-booting'); document.querySelector('.fiezel-ob')?.remove(); document.getElementById('fzRitual')?.remove(); document.querySelector('.fz-tour, [class*="tour"]')?.remove(); });
  for (const v of VIEWS) {
    if (v !== 'home') { await page.evaluate(vv => window.go(vv), v); await page.waitForTimeout(600); }
    await page.screenshot({ path: path.join(OUT, `${v}-${name}.png`) });
    if (v === 'home' && process.env.FULL) await page.screenshot({ path: path.join(OUT, `${v}-${name}-full.png`), fullPage: true });
  }
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    nav: [...document.querySelectorAll('.nav')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
    icons: [...document.querySelectorAll('.topbar .icon-button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }));
  console.log(name, JSON.stringify(m));
  await ctx.close();
}
await browser.close(); server.close();
