// Artículos de la Ley del IVA y del Reglamento de facturación a pantalla completa:
//  · el texto se reparte en columnas a lo ancho de la pantalla (sin barra de desplazamiento): se busca el número de columnas y el tamaño de letra con que cabe todo
//  · subrayado manual: se selecciona un texto y aparece una barra con tres colores (verde, rosa, azul) y «Quitar»; pulsar un subrayado propio permite quitarlo
// Los subrayados se guardan en un registro «leysub» (se ven desde cualquier equipo): { marcas: { 'leyOv|Artículo 84. …': [{ p: párrafo, a: inicio, b: fin, c: 'v'|'r'|'a' }] } }
// y, además, en este navegador por si no hay permiso de escritura. Todo se añade sobre lo que ya pintan leyiva.js y reglfac.js, sin tocarlos.
export function activarSubrayadoManual({ S, db }) {
  const COLORES = { v: 'Verde', r: 'Rosa', a: 'Azul' };
  const LS = 'ley-subrayados';
  const reg = () => S.registros.find((r) => r.tipo === 'leysub');
  const local = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
  const marcasDe = (k) => reg()?.datos?.marcas?.[k] ?? local()[k] ?? [];
  const cuerpo = () => document.querySelector('.ley-ov .ley-ov-cuerpo');
  const claveDe = (ov) => `${ov.id}|${(ov.querySelector('.ley-ov-cuerpo h2')?.textContent ?? '').trim().slice(0, 80)}`;
  const parrafos = (art) => [...art.querySelectorAll(':scope > p')];

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
  const nodosTexto = (p) => { const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), out = []; let pos = 0, n; while ((n = w.nextNode())) { out.push({ n, a: pos, b: pos + n.length }); pos += n.length; } return out; };
  function envolver(p, a, b, clase, idx) {
    nodosTexto(p).filter((x) => x.b > a && x.a < b).forEach((x) => {
      const r = document.createRange(); r.setStart(x.n, Math.max(a, x.a) - x.a); r.setEnd(x.n, Math.min(b, x.b) - x.a);
      const m = document.createElement('mark'); m.className = clase; m.dataset.sub = String(idx); r.surroundContents(m);
    });
  }
  function quitarMarcas(art) { art.querySelectorAll('mark.sub').forEach((m) => { const pa = m.parentNode; while (m.firstChild) pa.insertBefore(m.firstChild, m); pa.removeChild(m); pa.normalize(); }); }
  function pintar(art, k) {
    quitarMarcas(art);
    const ps = parrafos(art);
    marcasDe(k).forEach((m, i) => { const p = ps[m.p]; if (p && m.b <= p.textContent.length) envolver(p, m.a, m.b, `sub sub-${m.c}`, i); });
  }

  // ---------- columnas sin barra de desplazamiento ----------
  function ajustar(art) {
    if (!art?.isConnected) return;
    const W = art.clientWidth - 48, nMin = Math.max(1, Math.min(6, Math.floor(W / 400))), nMax = Math.max(nMin, Math.floor(W / 260));
    art.style.columnWidth = 'auto';
    for (let fs = 17; fs >= 11; fs--) {
      art.style.fontSize = `${fs}px`;
      for (let n = nMin; n <= nMax; n++) { art.style.columnCount = String(n); if (art.scrollWidth <= art.clientWidth + 2) return; }
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
    const art = cuerpo(), sel = getSelection();
    if (!art || !sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0); if (!art.contains(r.commonAncestorContainer)) return null;
    const trozos = [];
    parrafos(art).forEach((p, i) => {
      if (!r.intersectsNode(p) || p.classList.contains('hint')) return;
      const off = (nodo, o) => { const q = document.createRange(); q.selectNodeContents(p); q.setEnd(nodo, o); return q.toString().length; };
      const a = p.contains(r.startContainer) ? off(r.startContainer, r.startOffset) : 0, b = p.contains(r.endContainer) ? off(r.endContainer, r.endOffset) : p.textContent.length;
      if (b > a) trozos.push({ p: i, a, b });
    });
    return trozos.length ? { trozos, rect: r.getBoundingClientRect() } : null;
  }
  let reloj = null;
  function revisar() {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      const s = seleccion();
      if (!s) { if (barra && !pendiente?.marca) quitarBarra(); return; }
      mostrarBarra(s.rect.left + s.rect.width / 2, s.rect.bottom + 8, `<span>Subrayar</span>${Object.entries(COLORES).map(([c, n]) => `<button class="sub-c sub-${c}" data-subcol="${c}" title="${n}" aria-label="Subrayar en ${n.toLowerCase()}"></button>`).join('')}`);
      pendiente = { trozos: s.trozos }; // después de mostrarBarra, que lo borra
    }, 180);
  }
  document.addEventListener('selectionchange', () => { if (cuerpo()) revisar(); });
  document.addEventListener('mouseup', () => { if (cuerpo()) revisar(); });
  document.addEventListener('touchend', () => { if (cuerpo()) revisar(); });

  document.addEventListener('click', async (ev) => {
    const t = ev.target; if (!t?.closest) return;
    const col = t.closest('[data-subcol]');
    if (col && pendiente?.trozos) {
      const ov = document.querySelector('.ley-ov'), art = cuerpo(); if (!ov || !art) return;
      const k = claveDe(ov), arr = marcasDe(k).map((m) => ({ ...m }));
      pendiente.trozos.forEach((z) => arr.push({ ...z, c: col.dataset.subcol }));
      getSelection()?.removeAllRanges(); quitarBarra(); await guardar(k, arr); pintar(art, k); return;
    }
    const q = t.closest('[data-subquitar]');
    if (q) {
      const ov = document.querySelector('.ley-ov'), art = cuerpo(); if (!ov || !art) return;
      const k = claveDe(ov), i = Number(q.dataset.subquitar); quitarBarra();
      await guardar(k, marcasDe(k).filter((_, j) => j !== i)); pintar(art, k); return;
    }
    const m = t.closest('mark.sub');
    if (m && cuerpo()?.contains(m) && getSelection()?.isCollapsed) { // pulsar un subrayado propio: ofrece quitarlo
      const r = m.getBoundingClientRect();
      mostrarBarra(r.left + r.width / 2, r.bottom + 8, `<button class="sub-q" data-subquitar="${m.dataset.sub}">Quitar subrayado</button>`); pendiente = { marca: true }; return;
    }
    if (barra && !t.closest('#subBar')) quitarBarra();
  });

  // ---------- al abrir un artículo ----------
  const observador = new MutationObserver((muts) => {
    for (const mu of muts) for (const nodo of mu.addedNodes) {
      if (!(nodo instanceof HTMLElement) || !nodo.classList.contains('ley-ov')) continue;
      quitarBarra();
      const art = nodo.querySelector('.ley-ov-cuerpo'); if (!art) continue;
      pintar(art, claveDe(nodo)); ajustar(art);
    }
  });
  observador.observe(document.body, { childList: true });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => ajustar(cuerpo()), 150); });
}
