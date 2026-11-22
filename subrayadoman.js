// Artículos de la Ley del IVA y del Reglamento de facturación a pantalla completa, y lista de exenciones:
//  · artículos: el texto se reparte en columnas a lo ancho de la pantalla, llenando una columna tras otra y sin barra de desplazamiento (se busca la letra más grande con la que cabe todo)
//  · subrayado propio: se selecciona un texto y aparece una barra con tres colores (verde, rosa, azul) y «Quitar subrayado» (de lo seleccionado, entero o en parte);
//    pulsar un subrayado propio o uno amarillo automático permite quitarlo
// Los subrayados se guardan en un registro «leysub» (se ven desde cualquier equipo): { marcas: { clave: [{ p: párrafo, a: inicio, b: fin, c: 'v'|'r'|'a'|'x' }] } }
// (c = 'x' es «quitar el amarillo automático de esa parte»). Clave de un artículo: 'leyOv|Artículo 84. …'; en la lista de exenciones: 'exen' y p = referencia de la exención.
// Se guarda también en este navegador por si no hay permiso de escritura. Todo se añade sobre lo que pintan leyiva.js y reglfac.js, sin tocarlos.
export function activarSubrayadoManual({ S, db }) {
  const COLORES = { v: 'Verde', r: 'Rosa', a: 'Azul' };
  const LS = 'ley-subrayados', ZONAS = '.ley-ov-cuerpo, #leyExLista';
  const reg = () => S.registros.find((r) => r.tipo === 'leysub');
  const local = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
  // Los subrayados de artículos se apuntan a la LÍNEA ORIGINAL del texto (p = número de línea, v: 2). Los antiguos (sin v) apuntaban al párrafo, que era la línea + 1 (el 0 era el subtítulo).
  const norm = (k, m) => (k === 'exen' || m.v === 2 || typeof m.p !== 'number' ? m : { ...m, p: m.p - 1, v: 2 });
  const marcasDe = (k) => (reg()?.datos?.marcas?.[k] ?? local()[k] ?? []).map((m) => norm(k, m));
  const zonaDe = (n) => (n?.nodeType === 3 ? n.parentElement : n)?.closest?.(ZONAS) ?? null;
  const esExen = (z) => z?.id === 'leyExLista';
  const claveDe = (z) => (esExen(z) ? 'exen' : `${z.closest('.ley-ov')?.id}|${(z.querySelector('h2')?.textContent ?? '').trim().slice(0, 80)}`);
  // «párrafos» de una zona: en un artículo, las líneas originales del texto (<span data-l>, identificadas por su número de línea); en exenciones, las celdas de texto (identificadas por la referencia de la exención)
  const parrafos = (z) => (esExen(z) ? [...z.querySelectorAll('td.ley-ext')] : [...z.querySelectorAll('span[data-l]')]);
  const idDe = (z, el) => (esExen(z) ? el.dataset.ref : Number(el.dataset.l));
  const elDe = (z, id) => parrafos(z).find((el) => idDe(z, el) === id) ?? null;
  const hayOverlay = () => document.querySelector('.ley-ov .ley-ov-cuerpo');

  // ---------- guardar ----------
  let aviso = false;
  async function guardar(k, arr) {
    try { const l = local(); if (arr.length) l[k] = arr; else delete l[k]; localStorage.setItem(LS, JSON.stringify(l)); } catch { /* sin almacenamiento */ }
    const r = reg(), datos = JSON.parse(JSON.stringify(r?.datos ?? {}));
    datos.marcas ??= {}; if (arr.length) datos.marcas[k] = arr; else delete datos.marcas[k];
    let err = null;
    try {
      if (r) { const { error } = await db.from('registros').update({ datos }).eq('id', r.id); err = error?.message ?? null; if (!err) r.datos = datos; }
      else if (arr.length) {
        const emp = S.empresas?.[0]?.id; if (!emp) return;
        const fila = { id: crypto.randomUUID(), empresa_id: emp, tipo: 'leysub', ejercicio: null, datos };
        const { error } = await db.from('registros').insert(fila); err = error?.message ?? null; if (!err) S.registros.push(fila);
      }
    } catch (e) { err = String(e?.message ?? e); }
    if (err && !aviso) { aviso = true; alert(`El subrayado se ha guardado solo en este navegador (${err}).`); }
  }

  // ---------- aplicar subrayados al texto ----------
  let pintando = false;
  const nodosTexto = (p) => { const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), out = []; let pos = 0, n; while ((n = w.nextNode())) { out.push({ n, a: pos, b: pos + n.length }); pos += n.length; } return out; };
  function envolver(p, a, b, clase, idx) {
    nodosTexto(p).filter((x) => x.b > a && x.a < b).forEach((x) => {
      const r = document.createRange(); r.setStart(x.n, Math.max(a, x.a) - x.a); r.setEnd(x.n, Math.min(b, x.b) - x.a);
      const m = document.createElement('mark'); m.className = clase; m.dataset.sub = String(idx); r.surroundContents(m);
    });
  }
  function quitarMarcas(z) { z.querySelectorAll('mark.sub').forEach((m) => { const pa = m.parentNode; while (m.firstChild) pa.insertBefore(m.firstChild, m); pa.removeChild(m); pa.normalize(); }); }
  // posición (en caracteres) de un elemento dentro de su párrafo
  function posicion(p, el) { const q = document.createRange(); q.selectNodeContents(p); q.setEnd(el, 0); const a = q.toString().length; return [a, a + el.textContent.length]; }
  function pintar(z, k) {
    pintando = true;
    try {
      quitarMarcas(z);
      z.querySelectorAll('mark.imp-off').forEach((m) => m.classList.remove('imp-off'));
      const todas = marcasDe(k);
      todas.forEach((m, i) => { const p = elDe(z, m.p); if (m.c !== 'x' && p && m.b <= p.textContent.length) envolver(p, m.a, m.b, `sub sub-${m.c}`, i); });
      // c = 'x': quitar el subrayado amarillo automático de esa parte del texto
      todas.filter((m) => m.c === 'x').forEach((m) => { const p = elDe(z, m.p); if (!p) return; p.querySelectorAll('mark.imp').forEach((el) => { const [a, b] = posicion(p, el); if (a < m.b && b > m.a) el.classList.add('imp-off'); }); });
    } finally { pintando = false; }
  }
  // resta [a,b] de los subrayados propios de un párrafo (los parte si hace falta) y, si toca algún amarillo automático, anota que se quita
  function restar(arr, z, trozos) {
    let sal = arr.map((m) => ({ ...m }));
    trozos.forEach(({ p, a, b }) => {
      sal = sal.flatMap((m) => { if (m.c === 'x' || m.p !== p || m.b <= a || m.a >= b) return [m]; const r = []; if (m.a < a) r.push({ ...m, b: a }); if (m.b > b) r.push({ ...m, a: b }); return r; });
      const pe = elDe(z, p); if (pe && [...pe.querySelectorAll('mark.imp:not(.imp-off)')].some((el) => { const [x, y] = posicion(pe, el); return x < b && y > a; })) sal.push({ p, a, b, c: 'x', v: 2 });
    });
    return sal;
  }

  // ---------- columnas, llenando una a una y sin barra de desplazamiento ----------
  function ajustar(art) {
    if (!art?.isConnected) return;
    // columnas de unos 24 em de ancho; se busca la letra más grande con la que todo cabe (columnas más estrechas, hasta 14 em, si hace falta)
    const W = art.clientWidth - 48;
    art.style.columnWidth = 'auto';
    for (let fs = 20; fs >= 11; fs--) {
      art.style.fontSize = `${fs}px`;
      const nBase = Math.max(1, Math.floor(W / (fs * 24))), nMax = Math.max(nBase, Math.floor(W / (fs * 14)));
      for (let n = nBase; n <= nMax; n++) { art.style.columnCount = String(n); if (art.scrollWidth <= art.clientWidth + 2) return; }
    }
    art.style.overflowX = 'auto'; // no cabe ni con la letra más pequeña: solo entonces aparece la barra horizontal
  }

  // ---------- barra flotante ----------
  let barra = null, pendiente = null;
  const quitarBarra = () => { barra?.remove(); barra = null; pendiente = null; };
  function mostrarBarra(x, y, html) {
    quitarBarra();
    barra = document.createElement('div'); barra.id = 'subBar'; barra.innerHTML = html; document.body.appendChild(barra);
    const w = barra.offsetWidth; barra.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`; barra.style.top = `${Math.max(8, y)}px`;
    barra.addEventListener('pointerdown', (e) => e.preventDefault()); // no pierde la selección al pulsar
  }
  function seleccion() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0), z = zonaDe(r.commonAncestorContainer); if (!z) return null;
    const trozos = [];
    parrafos(z).forEach((p) => {
      if (!r.intersectsNode(p)) return;
      const off = (nodo, o) => { const q = document.createRange(); q.selectNodeContents(p); q.setEnd(nodo, o); return q.toString().length; };
      const a = p.contains(r.startContainer) ? off(r.startContainer, r.startOffset) : 0, b = p.contains(r.endContainer) ? off(r.endContainer, r.endOffset) : p.textContent.length;
      if (b > a) trozos.push({ p: idDe(z, p), a, b, v: 2 });
    });
    return trozos.length ? { trozos, z, rect: r.getBoundingClientRect() } : null;
  }
  let reloj = null;
  const revisar = () => {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      const s = seleccion();
      if (!s) { if (barra && !pendiente?.marca) quitarBarra(); return; }
      mostrarBarra(s.rect.left + s.rect.width / 2, s.rect.bottom + 8, `<span>Subrayar</span>${Object.entries(COLORES).map(([c, n]) => `<button class="sub-c sub-${c}" data-subcol="${c}" title="${n}" aria-label="Subrayar en ${n.toLowerCase()}"></button>`).join('')}<button class="sub-q" data-subquitarsel="1" title="Quita todo subrayado (el tuyo y el amarillo automático) de lo seleccionado">Quitar subrayado</button>`);
      pendiente = { trozos: s.trozos, z: s.z }; // después de mostrarBarra, que lo borra
    }, 180);
  };
  document.addEventListener('selectionchange', () => { if (zonaDe(getSelection()?.anchorNode)) revisar(); });
  document.addEventListener('mouseup', () => { if (zonaDe(getSelection()?.anchorNode)) revisar(); });
  document.addEventListener('touchend', () => { if (zonaDe(getSelection()?.anchorNode)) revisar(); });

  document.addEventListener('click', async (ev) => {
    const t = ev.target; if (!t?.closest) return;
    const col = t.closest('[data-subcol]');
    if (col && pendiente?.trozos) {
      const z = pendiente.z, k = claveDe(z), arr = marcasDe(k).map((m) => ({ ...m }));
      pendiente.trozos.forEach((x) => arr.push({ ...x, c: col.dataset.subcol }));
      getSelection()?.removeAllRanges(); quitarBarra(); await guardar(k, arr); pintar(z, k); return;
    }
    const qs = t.closest('[data-subquitarsel]');
    if (qs && pendiente?.trozos) { // quitar el subrayado de lo seleccionado (entero o solo una parte)
      const z = pendiente.z, k = claveDe(z), trozos = pendiente.trozos;
      getSelection()?.removeAllRanges(); quitarBarra(); await guardar(k, restar(marcasDe(k), z, trozos)); pintar(z, k); return;
    }
    const qi = t.closest('[data-subquitarimp]');
    if (qi && barra?._z) { // quitar un subrayado amarillo automático concreto
      const z = barra._z, k = claveDe(z), d = JSON.parse(qi.dataset.subquitarimp); quitarBarra();
      await guardar(k, [...marcasDe(k), { p: d[0], a: d[1], b: d[2], c: 'x', v: 2 }]); pintar(z, k); return;
    }
    const q = t.closest('[data-subquitar]');
    if (q && barra?._z) {
      const z = barra._z, k = claveDe(z), i = Number(q.dataset.subquitar); quitarBarra();
      await guardar(k, marcasDe(k).filter((_, j) => j !== i)); pintar(z, k); return;
    }
    const z = zonaDe(t), colapsada = getSelection()?.isCollapsed;
    const m = t.closest('mark.sub');
    if (m && z && colapsada) { // pulsar un subrayado propio: ofrece quitarlo
      const r = m.getBoundingClientRect();
      mostrarBarra(r.left + r.width / 2, r.bottom + 8, `<button class="sub-q" data-subquitar="${m.dataset.sub}">Quitar subrayado</button>`); barra._z = z; pendiente = { marca: true }; return;
    }
    const im = t.closest('mark.imp:not(.imp-off)');
    if (im && z && colapsada) { // pulsar un amarillo automático: ofrece quitarlo
      const pe = im.closest('span[data-l], td.ley-ext');
      if (pe && z.contains(pe)) { const [a, b] = posicion(pe, im), r = im.getBoundingClientRect(); mostrarBarra(r.left + r.width / 2, r.bottom + 8, `<button class="sub-q" data-subquitarimp='${JSON.stringify([idDe(z, pe), a, b]).replace(/'/g, '&#39;')}'>Quitar este subrayado</button>`); barra._z = z; pendiente = { marca: true }; return; }
    }
    if (barra && !t.closest('#subBar')) quitarBarra();
  });

  // ---------- al abrir un artículo o pintarse la lista de exenciones ----------
  const observador = new MutationObserver((muts) => {
    if (pintando) return;
    for (const mu of muts) {
      for (const nodo of mu.addedNodes) {
        if (nodo instanceof HTMLElement && nodo.classList.contains('ley-ov')) { quitarBarra(); nodo.lang = 'es'; /* para que el texto justificado parta las palabras en español */ const art = nodo.querySelector('.ley-ov-cuerpo'); if (art) { pintar(art, claveDe(art)); ajustar(art); } }
      }
    }
    // lista de exenciones: cada vez que se pinta (o se filtra) llegan celdas nuevas sin marcar
    const ex = document.getElementById('leyExLista');
    if (ex && ex.querySelector('td.ley-ext:not([data-pi])')) { ex.querySelectorAll('td.ley-ext').forEach((td) => { td.dataset.pi = '1'; }); pintar(ex, 'exen'); }
  });
  observador.observe(document.body, { childList: true, subtree: true });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => ajustar(hayOverlay()), 150); });
}
