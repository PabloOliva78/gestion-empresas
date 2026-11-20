// Abre las transacciones de un proveedor/cliente en Dynamics 365 desde la app.
// D365 solo admite enlaces con el filtro cifrado y ningún script de página puede pulsar sus botones, así que hay dos vías:
//  1) Por defecto: enlace d365://prov/00173?cmp=ESP. Windows lo pasa a scripts/automatizaciones-windows (abrir-d365.js), que con Chrome
//     filtra la cuenta y pulsa «Transacciones» con clics reales. Hay que registrar el enlace una vez por ordenador (registrar-enlace.ps1).
//  2) Alternativa (localStorage 'd365-modo' = 'tampermonkey'): abre la lista de D365 con #cuenta=… y el script de Tampermonkey
//     (scripts/d365-filtro.user.js) escribe la cuenta en el filtro; sin él la cuenta queda copiada para pegarla con Ctrl+V.
const ERP = 'https://herogra.operations.dynamics.com/';
const EXT_ID = 'fndcidhkaoadpaceikbelbnbobhdnnaj'; // extensión «Herogra · abrir factura en D365» (scripts/extension-d365): abre la factura en una pestaña de tu Chrome
const LOCAL = 'http://127.0.0.1:47831'; // servicio local de Windows (servidor-d365.js): evita depender del permiso de Chrome para abrir el enlace d365://
// Precalentar: al abrir Emitidas se le pide a la extensión que cargue ya el diario de facturas de D365 de esa empresa (en segundo plano); como mucho una vez cada 20 minutos por empresa
const calientes = new Map();
export function precalentarD365(siglas) {
  const sig = String(siglas || '').toUpperCase(); if (!/^[A-Z]{2,5}$/.test(sig)) return;
  if (Date.now() - (calientes.get(sig) || 0) < 20 * 60 * 1000) return; calientes.set(sig, Date.now());
  try { if (window.chrome?.runtime?.sendMessage) chrome.runtime.sendMessage(EXT_ID, { tipo: 'precalentar', cmp: sig }, () => { void chrome.runtime.lastError; }); } catch { /* sin extensión */ }
}
// Libros de IVA descargados de D365 que están en este PC (los sirve el servicio local): lista y descarga de cada uno
export const listarLibrosD365 = () => fetch(`${LOCAL}/ficheros`).then((r) => { if (!r.ok) throw new Error('el servicio local no respondió'); return r.json(); });
export const bajarLibroD365 = (n) => fetch(`${LOCAL}/fichero?n=${encodeURIComponent(n)}`).then((r) => { if (!r.ok) throw new Error('no se pudo leer ' + n); return r.blob(); });
export function abrirD365({ tipo = 'prov', cuenta, siglas }) {
  const c = String(cuenta ?? '').trim(); if (!c) return;
  const sig = String(siglas || 'HER').toUpperCase();
  let modo = ''; try { modo = localStorage.getItem('d365-modo') || ''; } catch { /* sin almacenamiento */ }
  const aviso = (t) => {
    const d = Object.assign(document.createElement('div'), { className: 'no-print', textContent: t });
    d.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;background:#1d1d1f;color:#fff;padding:10px 16px;border-radius:12px;font:13px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.3)';
    document.body.appendChild(d); setTimeout(() => d.remove(), 6000);
  };
  const quien = tipo === 'prov' ? 'proveedor' : tipo === 'fac' ? 'factura' : 'cliente';
  if (modo !== 'tampermonkey') {
    const lanzarEnlace = () => { const a = Object.assign(document.createElement('a'), { href: `d365://${tipo}/${encodeURIComponent(c)}?cmp=${encodeURIComponent(sig)}` }); document.body.appendChild(a); a.click(); a.remove(); };
    // 1º la extensión de Chrome (solo facturas: abre la pestaña en TU Chrome); 2º el servicio local; 3º el enlace d365:// de siempre
    const viaServicio = () => fetch(`${LOCAL}/abrir?tipo=${encodeURIComponent(tipo)}&c=${encodeURIComponent(c)}&cmp=${encodeURIComponent(sig)}`).then((r) => { if (!r.ok) throw new Error('rechazada'); }).catch(lanzarEnlace);
    const viaExtension = () => new Promise((ok) => { try { if (tipo !== 'fac' || !window.chrome?.runtime?.sendMessage) return ok(false); chrome.runtime.sendMessage(EXT_ID, { tipo: 'fac', num: c, cmp: sig }, (r) => { void chrome.runtime.lastError; ok(!!r?.ok); }); } catch { ok(false); } });
    viaExtension().then((hecho) => { if (!hecho) viaServicio(); });
    aviso(`Abriendo D365: ${quien} ${c}…${tipo === 'fac' ? ' tarda unos segundos en buscarla y abrir su vista previa' : ''} (si no pasa nada, falta registrar el enlace: scripts/automatizaciones-windows/registrar-enlace.ps1)`);
    return;
  }
  window.open(`${ERP}?cmp=${encodeURIComponent(sig)}&mi=${tipo === 'prov' ? 'VendTableListPage' : tipo === 'fac' ? 'CustInvoiceJournal' : 'CustTableListPage'}#cuenta=${encodeURIComponent(c)}`, '_blank', 'noopener');
  (navigator.clipboard?.writeText(c) ?? Promise.reject()).then(() => aviso(`Cuenta de ${quien} ${c} copiada (si D365 no la busca sola, pégala con Ctrl+V en el filtro).`), () => aviso(`Cuenta de ${quien}: ${c} (no se pudo copiar; escríbela en el filtro de D365).`));
}
