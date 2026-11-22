// Diferencias explicadas por línea (botón 💬 en cada fila de las pestañas de conciliación) y dossier en PDF con todas las conciliaciones de una empresa.
// Las notas se guardan en un registro «explic» por empresa: { notas: { clave: { t, e, f, tab, ej, per, r } } }. e = 'p' pendiente · 'x' explicada.
// La clave de una línea es: pestaña | ejercicio | periodo | título de la primera columna de la tabla | texto de sus dos primeras celdas.
// Todo se añade encima de lo que pintan las pestañas (no hay que tocarlas una a una).
export function crearExplicaciones({ S, db, esc, render, root, TABS, conc, dossierTabs, puede, esAdmin }) {
  const regNotas = () => S.registros.find((r) => r.tipo === 'explic' && r.empresa_id === S.sel);
  const notas = () => regNotas()?.datos?.notas ?? {};
  const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const hoy = () => new Date().toISOString().slice(0, 10);

  async function guardarNota(key, nota) {
    const r = regNotas(), datos = JSON.parse(JSON.stringify(r?.datos ?? {}));
    datos.notas ??= {};
    if (nota) datos.notas[key] = nota; else delete datos.notas[key];
    if (r) {
      const { error } = await db.from('registros').update({ datos }).eq('id', r.id);
      if (error) return error.message;
      r.datos = datos;
    } else if (nota) {
      const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'explic', ejercicio: null, datos };
      const { error } = await db.from('registros').insert(fila);
      if (error) return error.message;
      S.registros.push(fila);
    }
    return null;
  }

  // ---------- botón 💬 en cada fila de las tablas de las pestañas de conciliación ----------
  let reloj = null, marcando = false;
  function marcar() {
    if (!S.sel || !conc.has(S.tab)) return;
    marcando = true;
    try {
      const N = notas();
      root.querySelectorAll('.vista table').forEach((t) => {
        if (t.closest('.ttp, .exp-pop') || t.dataset.noexp) return;
        const cab = limpio(t.querySelector('thead th')?.textContent).slice(0, 24);
        // La clave de una línea son sus dos primeras celdas. Si varias líneas de la tabla tienen esas dos celdas iguales (p. ej. «Recibidas · Registro muy posterior»),
        // la explicación de una valdría para todas: en ese caso la clave incluye también las celdas siguientes (factura, fecha, NIF, importes…).
        const filas = [...t.querySelectorAll('tbody tr')].map((tr) => ({ tr, tds: tr.querySelectorAll(':scope > td'), marca: tr.querySelector('.exp-b') }));
        const txtDe = (f, i) => limpio(f.tds[i]?.textContent).slice(0, 40), baseDe = (f) => [S.tab, S.ejercicio, S.periodo || '', cab, txtDe(f, 0), txtDe(f, 1)].join('|');
        const cuenta = new Map(), ocupadas = new Set(filas.filter((f) => f.marca).map((f) => f.marca.dataset.exp));
        filas.forEach((f) => { if (!f.marca && f.tds.length >= 2) { const k = baseDe(f); cuenta.set(k, (cuenta.get(k) ?? 0) + 1); } });
        filas.forEach((f) => {
          const { tr, tds } = f;
          if (tds.length < 2 || f.marca) return;
          const txt = (i) => txtDe(f, i);
          if (!txt(0) && !txt(1)) return;
          const base = baseDe(f), repetida = (cuenta.get(base) ?? 0) > 1 || ocupadas.has(base);
          const key = repetida ? [base, ...[2, 3, 4, 5, 6, 7].map(txt)].join('|') : base, n = N[key];
          const b = document.createElement('button');
          b.className = `exp-b${n ? ` on ${n.e === 'x' ? 'ok' : 'pend'}` : ''}`; b.type = 'button'; b.dataset.exp = key; b.dataset.lbl = (repetida ? [0, 1, 2, 3, 4] : [0, 1]).map(txt).filter(Boolean).join(' · ');
          b.title = n ? `${n.e === 'x' ? 'Explicada' : 'Pendiente'}: ${n.t}` : 'Explicar esta línea';
          b.textContent = '💬';
          tds[0].append(b);
          if (n) { const s = document.createElement('span'); s.className = `exp-n ${n.e === 'x' ? 'ok' : 'pend'}`; s.textContent = `${n.e === 'x' ? '✓' : '⏳'} ${n.t}`; tds[0].append(s); }
        });
      });
    } finally { marcando = false; }
  }
  new MutationObserver((ms) => {
    if (marcando || ms.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.classList?.contains('exp-b') || n.classList?.contains('exp-n')))) return;
    clearTimeout(reloj); reloj = setTimeout(marcar, 60);
  }).observe(root, { childList: true, subtree: true });

  // ---------- ventanita para escribir la explicación ----------
  const cerrar = () => document.querySelector('.exp-pop')?.remove();
  function abrir(btn) {
    cerrar();
    const key = btn.dataset.exp, n = notas()[key] ?? {}, ed = puede();
    const p = document.createElement('div'); p.className = 'exp-pop';
    p.innerHTML = `<b>Explicar esta línea</b><small>${esc(btn.dataset.lbl || '')}</small>
      <textarea rows="4" placeholder="Por qué hay diferencia (p. ej. factura de diciembre contabilizada en enero)"${ed ? '' : ' readonly'}>${esc(n.t ?? '')}</textarea>
      ${ed ? `<label>Estado <select><option value="p"${n.e !== 'x' ? ' selected' : ''}>Pendiente</option><option value="x"${n.e === 'x' ? ' selected' : ''}>Explicada</option></select></label>` : `<small>${n.e === 'x' ? 'Explicada' : 'Pendiente'}${n.f ? ' · ' + esc(n.f) : ''}</small>`}
      <div class="exp-bt">${ed ? '<button class="small primary" data-expok="1">Guardar</button>' : ''}${ed && n.t ? '<button class="small" data-expdel="1">Quitar</button>' : ''}<button class="small" data-expno="1">Cerrar</button></div><small class="exp-err"></small>`;
    document.body.append(p);
    const r = btn.getBoundingClientRect();
    p.style.left = `${Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.left))}px`; p.style.top = `${Math.max(8, Math.min(window.innerHeight - p.offsetHeight - 8, r.bottom + 4))}px`;
    p.dataset.key = key; p.dataset.lbl = btn.dataset.lbl || '';
    p.querySelector('textarea').focus();
  }
  document.addEventListener('click', async (ev) => {
    const t = ev.target, b = t.closest?.('.exp-b');
    if (b) { ev.preventDefault(); ev.stopPropagation(); abrir(b); return; }
    const pop = t.closest?.('.exp-pop');
    if (pop) {
      ev.stopPropagation();
      if (t.closest('[data-expno]')) return void cerrar();
      const key = pop.dataset.key;
      if (t.closest('[data-expdel]') || t.closest('[data-expok]')) {
        const borrar = !!t.closest('[data-expdel]'), tx = limpio(pop.querySelector('textarea').value);
        if (!borrar && !tx) { pop.querySelector('.exp-err').textContent = 'Escribe la explicación (o pulsa Quitar).'; return; }
        const [tab, ej, per] = key.split('|');
        const err = await guardarNota(key, borrar ? null : { t: tx, e: pop.querySelector('select')?.value === 'x' ? 'x' : 'p', f: hoy(), tab, ej, per, r: pop.dataset.lbl });
        if (err) { pop.querySelector('.exp-err').textContent = err; return; }
        cerrar(); render();
      }
      return;
    }
    if (!t.closest?.('.exp-b')) cerrar();
    const del = t.closest?.('[data-explist-del]');
    if (del) { ev.stopPropagation(); if (!puede() || !confirm('¿Quitar esta explicación?')) return; const err = await guardarNota(del.dataset.explistDel, null); if (err) alert(err); else render(); return; }
    if (t.closest?.('[data-dossier]')) { ev.stopPropagation(); dossier(); }
  }, true);

  // ---------- pestaña: lista de todas las explicaciones de la empresa ----------
  function vistaExplic() {
    if (!S.sel) return '<p class="vacio">Elige una empresa para ver sus explicaciones.</p>';
    const L = Object.entries(notas()).map(([k, v]) => ({ k, ...v })).sort((a, b) => String(a.tab).localeCompare(String(b.tab)) || String(a.ej).localeCompare(String(b.ej)) || String(a.r).localeCompare(String(b.r)));
    const pend = L.filter((x) => x.e !== 'x').length, nom = (id) => TABS[id]?.[0] ?? id;
    return `<section class="dsec"><h3>Diferencias explicadas</h3>
      <p class="dash-s" style="font-size:.8rem">✓ ${L.length - pend} explicadas · ⏳ ${pend} pendientes</p>
      <p class="no-print"><button class="small" data-dossier="1" title="Abre un documento con todas las conciliaciones de la empresa y sus explicaciones. Elige «Guardar como PDF» al imprimir">📄 Dossier PDF de todas las conciliaciones</button></p>
      <div class="wrap"><table class="tabla" data-noexp="1"><thead><tr><th>Conciliación</th><th>Ejercicio</th><th>Periodo</th><th>Línea</th><th>Explicación</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>
      ${L.map((x) => `<tr><td>${esc(nom(x.tab))}</td><td>${esc(x.ej)}</td><td>${esc(x.per || 'Anual')}</td><td>${esc(x.r)}</td><td>${esc(x.t)}</td><td>${x.e === 'x' ? '✓ Explicada' : '⏳ Pendiente'}</td><td>${esc(x.f ?? '')}</td><td class="no-print">${puede() ? `<button class="small" data-explist-del="${esc(x.k)}">Quitar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="vacio">Aún no hay explicaciones. En cualquier conciliación, pulsa 💬 en una línea para explicar su diferencia.</td></tr>'}</tbody></table></div>
      <p class="hint">Cada explicación está ligada a una línea concreta de una conciliación, ejercicio y periodo. Si cambian los datos y la línea cambia de texto, la explicación deja de aparecer en su sitio pero sigue en esta lista.</p></section>`;
  }

  // ---------- dossier: todas las conciliaciones de la empresa en un documento apaisado ----------
  const CARGANDO = /Cargando…|Cargando\.\.\.|⏳ leyendo|leyendo los libros/i;
  async function dossier() {
    if (!S.sel) return void alert('Elige una empresa.');
    const w = window.open('', '_blank'); if (!w) return void alert('Permite las ventanas emergentes para ver el dossier.');
    w.document.write('<p style="font:14px system-ui">Preparando el dossier de todas las conciliaciones… puede tardar unos segundos si hay que leer libros.</p>');
    const tab0 = S.tab, ids = dossierTabs().filter((id) => TABS[id] && !(TABS[id][3] && !esAdmin()) && (!TABS[id][4] || TABS[id][4]()));
    const pintar = async (id) => { S.tab = id; try { const h = TABS[id][2](); return typeof h?.then === 'function' ? await h : String(h ?? ''); } catch (e) { return `<p class="vacio">No se pudo generar esta pestaña: ${esc(e.message)}</p>`; } };
    const out = {};
    try {
      for (let intento = 0; intento < 20; intento++) {
        let faltan = 0;
        for (const id of ids) { out[id] = await pintar(id); if (CARGANDO.test(out[id])) faltan++; }
        S.tab = tab0;
        if (!faltan) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally { S.tab = tab0; render(); }
    const e = S.empresas.find((x) => x.id === S.sel) ?? {}, N = notas(), css = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => `<link rel="stylesheet" href="${l.href}">`).join('');
    const resumen = ids.map((id) => { const L = Object.values(N).filter((n) => n.tab === id); return `<tr><td>${esc(TABS[id][0])}</td><td>${esc(TABS[id][1])}</td><td class="num">${L.filter((n) => n.e === 'x').length}</td><td class="num">${L.filter((n) => n.e !== 'x').length}</td></tr>`; }).join('');
    const secciones = ids.map((id) => {
      const L = Object.values(N).filter((n) => n.tab === id).sort((a, b) => String(a.ej).localeCompare(String(b.ej)));
      return `<section class="dos-sec"><h2>${esc(TABS[id][0])} <small>${esc(TABS[id][1])}</small></h2><div class="vista${conc.has(id) ? ' bl-conc' : ''}">${out[id]}</div>
        ${L.length ? `<h4>Explicaciones de las diferencias</h4><table class="tabla"><thead><tr><th>Ejercicio</th><th>Periodo</th><th>Línea</th><th>Explicación</th><th>Estado</th></tr></thead><tbody>${L.map((n) => `<tr><td>${esc(n.ej)}</td><td>${esc(n.per || 'Anual')}</td><td>${esc(n.r)}</td><td>${esc(n.t)}</td><td>${n.e === 'x' ? '✓ Explicada' : '⏳ Pendiente'}</td></tr>`).join('')}</tbody></table>` : ''}</section>`;
    }).join('');
    w.document.open();
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Dossier de conciliaciones · ${esc(e.nombre)} · ${esc(S.ejercicio)}</title>${css}
      <style>@page{size:A4 landscape;margin:8mm}body{background:#fff;margin:0;padding:12px;zoom:.68;color:#000}.dos-sec{page-break-before:always;margin-bottom:18px}.dos-sec h2{font-size:18px;margin:0 0 8px}.dos-sec small{font-weight:400;color:#555}.dos-portada h1{font-size:26px;margin:0}.exp-b{display:none}.no-print{display:none!important}.vista{zoom:1!important;position:static!important;height:auto!important;overflow:visible!important}.wrap{overflow:visible!important;max-width:none!important}table{break-inside:auto}tr{break-inside:avoid}@media screen{.barra{position:sticky;top:0;background:#fff;padding:6px 0;z-index:5}}@media print{.barra{display:none}}</style></head><body>
      <div class="barra"><button onclick="print()">Imprimir / guardar PDF (apaisado)</button></div>
      <section class="dos-portada"><h1>Dossier de conciliaciones fiscal–contables</h1><p><b>${esc(e.nombre)}</b> · NIF ${esc(e.cif)} · Ejercicio ${esc(S.ejercicio)}${S.periodo ? ' · Periodo ' + esc(S.periodo) : ''}</p><p>Generado el ${new Date().toLocaleDateString('es-ES')}. Contiene ${ids.length} pestañas de conciliación tal como están en la aplicación en este momento, con las explicaciones de las diferencias.</p>
      <table class="tabla"><thead><tr><th>Conciliación</th><th>Contenido</th><th>Explicadas</th><th>Pendientes</th></tr></thead><tbody>${resumen}</tbody></table></section>${secciones}</body></html>`);
    w.document.close();
  }

  return { tabs: { explic: ['Diferencias explicadas', 'Notas por línea y dossier PDF', vistaExplic] } };
}
