// Bloque 14 · La app aprende de ti: cuando repites la misma explicación (💬) en una conciliación, propone convertirla en regla. La regla marca las líneas
// que contienen un texto como explicadas; nunca cambia cifras ni estados. Se guarda en un registro «reglas» por empresa: { lista: [...], no: [claves descartadas] }.
export function crearReglas({ S, db, esc, render, empresa, puede, tituloTab, esConciliacion }) {
  const REPETIDAS = 3, MIN = 4;
  const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const norm = (s) => limpio(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reg = (tipo) => S.registros.find((r) => r.tipo === tipo && r.empresa_id === S.sel);
  const datos = () => ({ lista: [], no: [], ...(reg('reglas')?.datos ?? {}) });
  let msg = '';
  async function guardar(D) {
    const r = reg('reglas');
    if (r) { const { error } = await db.from('registros').update({ datos: D }).eq('id', r.id); if (error) return error.message; r.datos = D; }
    else { const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'reglas', ejercicio: null, datos: D }; const { error } = await db.from('registros').insert(fila); if (error) return error.message; S.registros.push(fila); }
    return null;
  }
  // explicaciones iguales (misma conciliación y mismo comentario) escritas al menos 3 veces
  function propuestas() {
    const D = datos(), G = new Map();
    Object.values(reg('explic')?.datos?.notas ?? {}).filter((n) => n.e === 'x' && n.t && n.tab).forEach((n) => { const k = `${n.tab}|${norm(n.t)}`; (G.get(k) ?? G.set(k, []).get(k)).push(n); });
    return [...G.entries()].filter(([k, L]) => L.length >= REPETIDAS && !D.no.includes(k) && !D.lista.some((x) => x.origen === k)).map(([k, L]) => {
      // lo que tienen en común las líneas explicadas (cada etiqueta son sus primeras celdas separadas por «·»)
      const partes = L.map((n) => String(n.r ?? '').split(' · ').map(limpio).filter((p) => p.length >= MIN));
      const comun = (partes[0] ?? []).filter((p) => partes.every((q) => q.some((x) => norm(x) === norm(p)))).sort((a, b) => b.length - a.length)[0] ?? '';
      return { k, tab: L[0].tab, texto: L[0].t, n: L.length, contiene: comun, ejemplos: L.slice(0, 3).map((n) => n.r) };
    });
  }
  // marca en la pestaña abierta las líneas que cumplen una regla activa (sin tocar las que ya tienen explicación escrita)
  let reloj = null;
  function marcar() {
    if (!S.sel || !esConciliacion(S.tab)) return;
    const L = datos().lista.filter((x) => x.activa && x.tab === S.tab && norm(x.contiene).length >= MIN);
    if (!L.length) return;
    document.querySelectorAll('.vista table').forEach((t) => {
      if (t.closest('.ttp, .exp-pop') || t.dataset.noexp) return;
      t.querySelectorAll('tbody tr').forEach((tr) => {
        const tds = tr.querySelectorAll(':scope > td');
        if (tds.length < 2 || tr.querySelector('.exp-n')) return;
        const texto = norm([...tds].map((td) => { const c = td.cloneNode(true); c.querySelectorAll('.exp-b').forEach((b) => b.remove()); return c.textContent; }).join(' · '));
        const r = L.find((x) => texto.includes(norm(x.contiene))); if (!r) return;
        const s = document.createElement('span'); s.className = 'exp-n ok rg-b'; s.title = `Regla: las líneas que contienen «${r.contiene}»`; s.textContent = `✓ Regla: ${r.texto}`; tds[0].append(s);
      });
    });
  }
  new MutationObserver((ms) => {
    if (ms.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.classList?.contains('exp-b') || n.classList?.contains('exp-n')))) return;
    clearTimeout(reloj); reloj = setTimeout(marcar, 200);
  }).observe(document.body, { childList: true, subtree: true });

  const campo = (v, attr, size) => `<input ${attr} value="${esc(v)}" size="${size}">`;
  function vista() {
    if (!S.sel) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
    const D = datos(), P = propuestas(), ed = puede();
    const prop = P.map((p, i) => `<div class="as-card"><p>Has explicado <b>${p.n} veces</b> en <b>${esc(tituloTab(p.tab))}</b>: «${esc(p.texto)}». ¿Aplicarlo siempre en esta empresa?</p>
      <p class="dash-s">Ejemplos: ${p.ejemplos.map(esc).join(' | ')}</p>
      ${ed ? `<p class="no-print"><label>A las líneas que contengan ${campo(p.contiene, `data-regla-cont="${i}" placeholder="proveedor, factura, concepto…"`, 34)}</label> <button class="small primary" data-regla="crear" data-i="${i}">Crear regla</button> <button class="small" data-regla="no" data-i="${i}">No proponer más</button></p>` : ''}</div>`).join('');
    const filas = D.lista.map((r) => `<tr><td>${esc(tituloTab(r.tab))}</td><td>${esc(r.contiene)}</td><td>${esc(r.texto)}</td><td>${esc(r.f ?? '')}</td><td style="text-align:center"><input type="checkbox" data-regla-activa="${esc(r.id)}"${r.activa ? ' checked' : ''}${ed ? '' : ' disabled'}></td><td class="no-print">${ed ? `<button class="small" data-regla="borrar" data-id="${esc(r.id)}">Quitar</button>` : ''}</td></tr>`).join('');
    return `<div class="inicio"><section class="dsec"><h3>La app aprende de ti · ${esc(empresa().nombre)}</h3>${msg ? `<p class="d-ko">${esc(msg)}</p>` : ''}
      ${prop || `<p class="hint">Sin propuestas. Aparecen cuando escribes ${REPETIDAS} veces el mismo comentario, marcado como «Explicada», en una misma conciliación (botón 💬).</p>`}</section>
      <section class="dsec"><h3>Reglas de esta empresa</h3><div class="wrap"><table class="tabla" data-noexp="1"><thead><tr><th>Conciliación</th><th>Líneas que contienen</th><th>Explicación</th><th>Creada</th><th>Activa</th><th></th></tr></thead><tbody>${filas || '<tr><td colspan="6" class="vacio">Todavía no hay reglas.</td></tr>'}</tbody></table></div>
      <p class="hint">Una regla solo añade la etiqueta «✓ Regla» a las líneas que contienen ese texto en esa conciliación: no cambia cifras, totales ni semáforos. Desactívala o quítala cuando quieras.</p></section></div>`;
  }
  async function aplicar(D) { msg = (await guardar(D)) ?? ''; render(); }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-regla]'); if (!b || !puede()) return;
    const D = datos(), a = b.dataset.regla;
    if (a === 'borrar') { if (!confirm('¿Quitar esta regla?')) return; D.lista = D.lista.filter((x) => x.id !== b.dataset.id); aplicar(D); return; }
    const p = propuestas()[+b.dataset.i]; if (!p) return;
    if (a === 'no') D.no = [...D.no, p.k];
    else {
      const contiene = limpio(document.querySelector(`[data-regla-cont="${b.dataset.i}"]`)?.value);
      if (contiene.length < MIN) { msg = `Escribe al menos ${MIN} letras que identifiquen las líneas (si no, la regla marcaría demasiadas).`; render(); return; }
      D.lista = [...D.lista, { id: crypto.randomUUID(), origen: p.k, tab: p.tab, contiene, texto: p.texto, activa: true, f: new Date().toISOString().slice(0, 10) }];
    }
    aplicar(D);
  });
  document.addEventListener('change', (ev) => { const id = ev.target.dataset?.reglaActiva; if (!id || !puede()) return; const D = datos(); D.lista = D.lista.map((x) => (x.id === id ? { ...x, activa: ev.target.checked } : x)); aplicar(D); });
  return { tabs: { reglas: ['La app aprende de ti', 'Reglas a partir de tus explicaciones', vista] } };
}
