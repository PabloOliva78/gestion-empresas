// Prueba del flujo de la extensión (flujo.js) con una sesión CDP en el Chrome auxiliar (puerto 9333). Uso: node probar-flujo.mjs "A/000036/26" [HER]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const { abrirFactura } = await import(pathToFileURL('G:\\Mi unidad\\conciliacion-app\\scripts\\extension-d365\\flujo.js').href);
const num = process.argv[2] || 'A/000036/26', cmp = (process.argv[3] || 'HER').toUpperCase();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const probar = async () => { try { return await chromium.connectOverCDP('http://127.0.0.1:9333', { timeout: 3000 }); } catch { return null; } };
let b = await probar();
if (!b) { spawn(CHROME, ['--remote-debugging-port=9333', `--user-data-dir=${path.join(aqui, 'perfil-d365-abrir')}`, '--no-first-run', 'about:blank'], { detached: true, stdio: 'ignore' }).unref(); for (let i = 0; i < 30 && !b; i++) { await new Promise((r) => setTimeout(r, 1000)); b = await probar(); } }
const ctx = b.contexts()[0];
for (const p of ctx.pages()) { const t = await p.title().catch(() => ''); if (/Diario de facturas|Mostrar la factura/i.test(t)) await p.close().catch(() => {}); }
const page = await ctx.newPage();
await page.bringToFront();
const t0 = Date.now();
await page.goto(`https://herogra.operations.dynamics.com/?cmp=${cmp}&mi=CustInvoiceJournal`, { waitUntil: 'commit', timeout: 120000 });
const cdp = await ctx.newCDPSession(page);
const ok = await abrirFactura((m, p) => cdp.send(m, p), num, { log: (m) => console.log('  ·', m) });
console.log(`resultado: ${ok} · ${((Date.now() - t0) / 1000).toFixed(1)} s · título: ${await page.title()}`);
process.exit(0);
