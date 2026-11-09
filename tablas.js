// Columnas redimensionables en todas las tablas de la aplicación: se arrastra el borde derecho de la cabecera de una columna
// y el ancho queda guardado en este navegador (por pestaña y tabla) hasta que se cambie; doble clic en el borde = ancho original.
const CLAVE = 'colw-v2'; // v2: anchos en píxeles CSS (sin el aumento de pestaña); los guardados antes se descartan
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; } };
const guardar = (o) => { try { localStorage.setItem(CLAVE, JSON.stringify(o)); } catch { /* sin almacenamiento */ } };

// cabeceras «hoja» (las de una sola columna) y número de columnas, con colspan y rowspan
function mapa(tabla) {
  const thead = tabla.tHead;
  if (!thead || !thead.rows.length) return null;
  const ocupado = [], hojas = []; let ncols = 0;
  [...thead.rows].forEach((fila, r) => {
    ocupado[r] ??= []; let c = 0;
    [...fila.cells].forEach((celda) => {
      while (ocupado[r][c]) c++;
      const cs = celda.colSpan || 1, rs = celda.rowSpan || 1;
      for (let i = 0; i < rs; i++) { ocupado[r + i] ??= []; for (let j = 0; j < cs; j++) ocupado[r + i][c + j] = true; }
      if (cs === 1) hojas.push({ celda, col: c });
      c += cs; ncols = Math.max(ncols, c);
    });
  });
  return { hojas, ncols };
}

// aumento (zoom) de la pestaña donde está la tabla: los anchos se miden y se aplican en píxeles CSS, sin ese aumento
const zoomDe = (tabla) => { // píxeles de pantalla por píxel CSS dentro de la tabla: se mide con una sonda de 100 px (vale para cualquier forma de aumento)
  const padre = tabla.parentElement ?? document.body, sonda = document.createElement('div');
  sonda.style.cssText = 'position:absolute;visibility:hidden;width:100px;height:1px;padding:0;border:0';
  padre.appendChild(sonda); const z = sonda.getBoundingClientRect().width / 100; sonda.remove();
  return Number.isFinite(z) && z > 0 ? z : 1;
};

// ancho actual de cada columna (de su cabecera o, si no, de la primera fila del cuerpo)
function medir(tabla, m) {
  const z = zoomDe(tabla);
  const w = new Array(m.ncols).fill(null);
  m.hojas.forEach(({ celda, col }) => { w[col] = celda.getBoundingClientRect().width / z; });
  const f = tabla.tBodies[0]?.rows[0];
  if (f) { let c = 0; [...f.cells].forEach((celda) => { if ((celda.colSpan || 1) === 1 && w[c] === null) w[c] = celda.getBoundingClientRect().width / z; c += celda.colSpan || 1; }); }
  const conocidos = w.filter((x) => x !== null), media = conocidos.length ? conocidos.reduce((a, b) => a + b, 0) / conocidos.length : 80;
  return w.map((x) => Math.max(28, x ?? media));
}

function aplicar(tabla, w) {
  tabla.querySelectorAll(':scope > colgroup').forEach((g) => g.remove());
  const g = document.createElement('colgroup');
  w.forEach((x) => { const c = document.createElement('col'); c.style.width = `${Math.round(x)}px`; g.appendChild(c); });
  tabla.insertBefore(g, tabla.firstChild);
  tabla.style.setProperty('table-layout', 'fixed', 'important');
  tabla.style.setProperty('width', `${Math.round(w.reduce((a, b) => a + b, 0))}px`, 'important');
  tabla.style.setProperty('min-width', '0', 'important');
  tabla.style.setProperty('max-width', 'none', 'important');
}

function quitar(tabla) {
  tabla.querySelectorAll(':scope > colgroup').forEach((g) => g.remove());
  ['table-layout', 'width', 'min-width', 'max-width'].forEach((p) => tabla.style.removeProperty(p));
}

export function activarRedimension(raiz, pestana) {
  let n = 0;
  const preparar = () => {
    n = 0;
    const guardado = leer();
    raiz.querySelectorAll('table').forEach((tabla) => {
      const m = mapa(tabla);
      if (!m || m.ncols < 2 || !m.hojas.length) { n++; return; }
      const idx = n++;
      if (tabla.dataset.rs) return; // ya preparada
      const clave = `${pestana()}|${idx}|${m.hojas.map((h) => h.celda.textContent.trim().slice(0, 18)).join('/').slice(0, 140)}`;
      tabla.dataset.rs = clave;
      m.hojas.forEach(({ celda }) => {
        if (celda.querySelector(':scope > .col-rs')) return;
        if (getComputedStyle(celda).position === 'static') celda.style.position = 'relative';
        const t = document.createElement('span'); t.className = 'col-rs'; t.title = 'Arrastra para cambiar el ancho de la columna · doble clic: ancho original';
        celda.appendChild(t);
      });
      const w = guardado[clave];
      if (Array.isArray(w) && w.length === m.ncols) aplicar(tabla, w);
    });
  };
  let reloj = null;
  new MutationObserver(() => { clearTimeout(reloj); reloj = setTimeout(preparar, 40); }).observe(raiz, { childList: true, subtree: true });
  preparar();

  raiz.addEventListener('mousedown', (ev) => {
    const t = ev.target.closest?.('.col-rs'); if (!t || ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    const celda = t.parentElement, tabla = celda.closest('table'), m = mapa(tabla), h = m?.hojas.find((x) => x.celda === celda);
    if (!h) return;
    const w = medir(tabla, m), w0 = w[h.col], x0 = ev.clientX, clave = tabla.dataset.rs;
    document.body.classList.add('rs-arrastrando');
    const z = zoomDe(tabla), mover = (e) => { w[h.col] = Math.max(28, w0 + (e.clientX - x0) / z); aplicar(tabla, w); };
    const soltar = () => {
      document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', soltar);
      document.body.classList.remove('rs-arrastrando');
      const g = leer(); g[clave] = w.map((x) => Math.round(x)); guardar(g);
      const parar = (e) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', parar, true); setTimeout(() => window.removeEventListener('click', parar, true), 0); // el clic que sigue al arrastre no activa nada
    };
    document.addEventListener('mousemove', mover); document.addEventListener('mouseup', soltar);
  });
  raiz.addEventListener('dblclick', (ev) => {
    const t = ev.target.closest?.('.col-rs'); if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    const tabla = t.closest('table'), g = leer(); delete g[tabla.dataset.rs]; guardar(g); quitar(tabla);
  }, true);
}

// ---------- Ancho de los cuadros blancos que engloban cada apartado (tarjetas de todas las pestañas) ----------
// Se arrastra el borde derecho del cuadro; el ancho queda guardado en este navegador (por pestaña y apartado); doble clic en el borde = ancho original.
const CLAVE_CAJAS = 'cajaw-v1';
const leerC = () => { try { return JSON.parse(localStorage.getItem(CLAVE_CAJAS) || '{}') || {}; } catch { return {}; } };
const guardarC = (o) => { try { localStorage.setItem(CLAVE_CAJAS, JSON.stringify(o)); } catch { /* sin almacenamiento */ } };
const escalaCaja = (el) => { const s = document.createElement('div'); s.style.cssText = 'position:absolute;visibility:hidden;width:100px;height:1px;padding:0;border:0'; (el.parentElement ?? document.body).appendChild(s); const z = s.getBoundingClientRect().width / 100; s.remove(); return Number.isFinite(z) && z > 0 ? z : 1; };
export function activarCajas(raiz, pestana) {
  const SEL = '.vista section.dsec, .vista section.prs-card, .vista section.block, .vista .dropzone, .vista .aviso, .vista .chk-banner, .vista .conc-resumen, .vista .ley-aviso, .vista .ley-msg, .vista .bloque-avisos, .vista .sii-fijo, .vista .ley-fijo';
  const preparar = () => {
    const g = leerC(); let n = 0;
    raiz.querySelectorAll(SEL).forEach((c) => {
      n++;
      if (c.dataset.cw) return;
      const clave = `${pestana()}|${n}|${(c.querySelector('h3,h4,.prs-h')?.textContent ?? '').trim().slice(0, 30)}`;
      c.dataset.cw = clave;
      if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
      if (getComputedStyle(c).position === 'static') return; // posición fijada por la hoja de estilos: sin borde para arrastrar
      const t = document.createElement('span'); t.className = 'caja-rs'; t.title = 'Arrastra para cambiar el ancho del cuadro · doble clic: ancho original';
      c.appendChild(t);
      if (g[clave] > 0) { c.style.boxSizing = 'border-box'; c.style.width = `${g[clave]}px`; c.style.maxWidth = 'none'; }
    });
  };
  let reloj = null;
  new MutationObserver(() => { clearTimeout(reloj); reloj = setTimeout(preparar, 40); }).observe(raiz, { childList: true, subtree: true });
  preparar();
  // el clic que sigue a un arrastre (o al doble clic) en el borde no debe abrir el selector de archivos de las zonas de soltar ni activar nada
  raiz.addEventListener('click', (ev) => { if (ev.target.closest?.('.caja-rs')) { ev.preventDefault(); ev.stopPropagation(); } }, true);
  raiz.addEventListener('mousedown', (ev) => {
    const t = ev.target.closest?.('.caja-rs'); if (!t || ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    const c = t.parentElement, z = escalaCaja(c), w0 = c.getBoundingClientRect().width / z, x0 = ev.clientX, clave = c.dataset.cw;
    let w = Math.round(w0);
    document.body.classList.add('rs-arrastrando');
    const mover = (e) => { w = Math.max(260, Math.round(w0 + (e.clientX - x0) / z)); c.style.boxSizing = 'border-box'; c.style.width = `${w}px`; c.style.maxWidth = 'none'; };
    const soltar = () => {
      document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', soltar);
      document.body.classList.remove('rs-arrastrando');
      const g = leerC(); g[clave] = w; guardarC(g);
    };
    document.addEventListener('mousemove', mover); document.addEventListener('mouseup', soltar);
  });
  raiz.addEventListener('dblclick', (ev) => {
    const t = ev.target.closest?.('.caja-rs'); if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    const c = t.parentElement, g = leerC(); delete g[c.dataset.cw]; guardarC(g);
    ['width', 'max-width', 'box-sizing'].forEach((p) => c.style.removeProperty(p));
  }, true);
}

// ---------- Cifras siempre a la derecha, en cualquier tabla ----------
// Una columna cuyas celdas son sobre todo números (con miles y decimales, € o %) se alinea a la derecha entera, guiones incluidos.
// Respeta las celdas centradas a propósito (clase «c») y las que llevan campos de escritura.
const NUM_RE = /^[-−+]?\s*(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+[.,]\d+)\s*(?:€|%)?$/, INT_RE = /^[-−+]?\d+$/;
function alinearTabla(t) {
  const cols = [];
  for (const tr of t.rows) {
    if (tr.parentElement?.tagName === 'THEAD') continue;
    for (const td of tr.cells) {
      if (td.tagName !== 'TD' || td.colSpan > 1 || td.querySelector('input,select,textarea,button')) continue;
      const tx = td.textContent.trim(); if (!tx) continue;
      const i = td.cellIndex, c = (cols[i] ??= { n: 0, t: 0, cel: [] });
      c.t++; if (tx === '-' || tx === '–' || INT_RE.test(tx)) c.cel.push(td); else if (NUM_RE.test(tx)) { c.n++; c.cel.push(td); }
    }
  }
  for (const c of cols) {
    if (!c || !c.n || c.n < c.t * 0.5) continue;
    for (const td of c.cel) if (!td.classList.contains('c') && !td.style.textAlign) td.style.textAlign = 'right';
  }
}
export function activarAlineacion(raiz) {
  const pend = new Set(); let prog = false;
  const lanzar = () => { prog = false; for (const t of pend) { try { alinearTabla(t); } catch { /* tabla rara */ } } pend.clear(); };
  const ver = (n) => { if (n.nodeType !== 1) return; const t = n.closest?.('table'); if (t) pend.add(t); n.querySelectorAll?.('table').forEach((x) => pend.add(x)); };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(ver); if (pend.size && !prog) { prog = true; requestAnimationFrame(lanzar); } }).observe(raiz, { childList: true, subtree: true });
  raiz.querySelectorAll('table').forEach((x) => pend.add(x)); if (pend.size) requestAnimationFrame(lanzar);
}

// ---------- Botón «Imprimir» en cada tabla de la conciliación SII: la tabla sola, en una hoja vertical ----------
function imprimirTabla(tabla, titulo) {
  const w = window.open('', '_blank'); if (!w) { alert('El navegador ha bloqueado la ventana de impresión'); return; }
  const c = tabla.cloneNode(true); c.querySelectorAll('button,input,select,.no-print').forEach((x) => x.remove());
  const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
  w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(titulo) + '</title><style>'
    + '@page{size:A4 portrait;margin:8mm}body{font:11px Arial,sans-serif;color:#000;margin:0}h1{font-size:13px;margin:0 0 6px}'
    + 'table{border-collapse:collapse;width:100%}th{background:#fdf0c9;border:1px solid #999;padding:2px 5px;font-size:10px}'
    + 'td{border:1px solid #ccc;padding:2px 5px;white-space:nowrap}td.num,td.n{text-align:right}tr.ttot td{font-weight:700;background:#fff7dc}'
    + '.dif-ko{color:#b00020;font-weight:700}.est-ok{color:#1b7f3b}tr.cf-ok td{background:#e1f3e6}tr.cf-ko td{background:#fdecea}'
    + '</style></head><body><h1>' + esc(titulo) + '</h1><div id="c">' + c.outerHTML + '</div><script>onload=function(){var c=document.getElementById("c"),W=733,H=1020,z=Math.min(1,W/c.scrollWidth,H/c.scrollHeight);'
    + 'if(z<0.45)z=Math.min(1,W/c.scrollWidth);c.style.zoom=z;setTimeout(function(){print()},250)}<\/script></body></html>');
  w.document.close();
}
function botonImprimir(wrap) {
  if (wrap.dataset.imp) return; wrap.dataset.imp = '1';
  const t = wrap.querySelector('table'); if (!t) return;
  const barra = document.createElement('div'); barra.className = 'no-print'; barra.style.cssText = 'margin:2px 0 4px';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = '🖨 Imprimir esta tabla';
  b.onclick = () => {
    const ant = wrap.previousElementSibling, cab = ant && ant.classList.contains('css-4760-t') ? ant : wrap.parentElement?.querySelector(':scope > .css-4760-t');
    const card = wrap.closest('.prs-card')?.querySelector('.prs-h');
    imprimirTabla(t, [cab?.textContent.trim().replace(/\s+/g, ' '), card?.textContent.trim()].filter(Boolean).join(' · ') || 'Tabla');
  };
  barra.appendChild(b); wrap.parentElement.insertBefore(barra, wrap);
}
export function activarImprimir(raiz) {
  const pend = new Set(); let prog = false;
  const lanzar = () => { prog = false; pend.forEach((w) => { try { botonImprimir(w); } catch { /* tabla rara */ } }); pend.clear(); };
  const ver = (n) => { if (n.nodeType !== 1) return; n.querySelectorAll?.('table.conc-t').forEach((t) => { const w = t.closest('.wrap'); if (w) pend.add(w); }); if (n.matches?.('table.conc-t')) { const w = n.closest('.wrap'); if (w) pend.add(w); } };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(ver); if (pend.size && !prog) { prog = true; requestAnimationFrame(lanzar); } }).observe(raiz, { childList: true, subtree: true });
  ver(raiz); if (pend.size) requestAnimationFrame(lanzar);
}
