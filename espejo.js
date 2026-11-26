// Bloque 14 · Espejo del grupo: cada factura de una empresa del grupo a otra debe estar en las emitidas de la primera y en las recibidas de la segunda.
// Solo LEE los libros de IVA de todas las empresas; no guarda nada.
import { leerRegistro } from './cachelibros.js?v=1';
export function crearEspejo({ db, S, esc, render, empOrden }) {
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const E = { libros: new Map(), leyendo: false, prog: '', error: '', mes: '', ver: 'mal', emp: '' };
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const fmt = (v) => (v === null ? '—' : new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
  const fdia = (s) => String(s ?? '').slice(0, 10).split('-').reverse().join('/');
  const nifN = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  const facN = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(^|[A-Z])0+(?=\d)/g, '$1');
  const MARGEN = 0.02 + 1e-9;

  async function leerTodo() {
    if (E.leyendo) return;
    E.leyendo = true; E.error = ''; E.libros.clear();
    const L = empOrden();
    for (let i = 0; i < L.length; i++) {
      E.prog = `Leyendo ${i + 1} de ${L.length}: ${L[i].nombre}…`; render();
      const o = {};
      for (const t of ['fact-E', 'fact-R']) {
        const { data, error } = await leerRegistro(db, S.perfil?.id, L[i].id, t);
        if (error) { E.error = `${L[i].nombre}: ${error.message}`; o[t] = null; } else o[t] = data?.datos?.filas ?? [];
      }
      E.libros.set(L[i].id, o);
    }
    E.leyendo = false; E.prog = ''; render();
  }
  // líneas de un libro contra un NIF, agrupadas por factura (las retenciones, códigos I., van aparte de la base y la cuota)
  function facturas(libro, nif) {
    const G = new Map();
    (libro ?? []).forEach((l) => {
      if (nifN(l.nif) !== nif) return;
      const k = facN(l.factura) || `(sin número ${l.fecha})`, ret = /^(R\.)?I\./.test(String(l.codigo ?? ''));
      let f = G.get(k); if (!f) G.set(k, (f = { k, num: l.factura || '(sin número)', fecha: l.fecha, base: 0, cuota: 0, ret: 0 }));
      if (ret) f.ret = r2(f.ret + Math.abs(+l.cuota || 0)); else { f.base = r2(f.base + (+l.base || 0)); f.cuota = r2(f.cuota + (+l.cuota || 0)); }
      if (String(l.fecha) < String(f.fecha)) f.fecha = l.fecha;
    });
    return [...G.values()];
  }
  // empareja las emitidas por A a B con las recibidas por B de A: primero por número y, si no, por importe
  function cruzar(emi, rec, ej, mes) {
    const libres = new Set(rec), pares = [], dentro = (f) => String(f.fecha).slice(0, 4) === String(ej) && (!mes || String(f.fecha).slice(5, 7) === mes);
    const iguales = (a, b) => Math.abs(a.base - b.base) <= MARGEN && Math.abs(a.cuota - b.cuota) <= MARGEN;
    const anio = emi.filter((f) => String(f.fecha).slice(0, 4) === String(ej)), resto = [];
    anio.forEach((a) => { const b = [...libres].filter((x) => x.k === a.k).sort((x, y) => Number(iguales(a, y)) - Number(iguales(a, x)))[0]; if (b) { libres.delete(b); pares.push({ a, b, num: true }); } else resto.push(a); });
    resto.forEach((a) => { const b = [...libres].filter((x) => (a.base || a.cuota) && iguales(a, x)).sort((x, y) => Math.abs(Date.parse(x.fecha) - Date.parse(a.fecha)) - Math.abs(Date.parse(y.fecha) - Date.parse(a.fecha)))[0]; if (b) { libres.delete(b); pares.push({ a, b, num: false }); } else pares.push({ a, b: null }); });
    libres.forEach((b) => pares.push({ a: null, b }));
    return pares.filter(({ a, b }) => (a ? dentro(a) : dentro(b))).map(({ a, b, num }) => {
      let st, txt;
      if (!a) { st = 'ko'; txt = 'Recibida sin emitida (o es de otro ejercicio)'; }
      else if (!b) { st = 'ko'; txt = 'Falta en la receptora'; }
      else if (!iguales(a, b)) { st = 'ko'; txt = `Importe distinto (base ${fmt(r2(b.base - a.base))}, cuota ${fmt(r2(b.cuota - a.cuota))})`; }
      else if (Math.abs(a.ret - b.ret) > MARGEN) { st = 'ko'; txt = `Retención distinta (${fmt(a.ret)} / ${fmt(b.ret)})`; }
      else if (!num) { st = 'wa'; txt = `Coincide el importe, número distinto (${b.num})`; }
      else if (String(a.fecha).slice(0, 7) !== String(b.fecha).slice(0, 7)) { st = 'wa'; txt = 'Coincide, registrada en otro mes'; }
      else { st = 'ok'; txt = 'Coincide'; }
      return { a, b, st, txt };
    });
  }
  function resultado() {
    const ej = Number(S.ejercicio), L = empOrden(), out = [], sin = [];
    L.forEach((e) => { const o = E.libros.get(e.id); if (o && (!o['fact-E']?.length && !o['fact-R']?.length)) sin.push(e.nombre); });
    L.forEach((A) => L.forEach((B) => {
      if (A.id === B.id || !A.cif || !B.cif || (E.emp && A.id !== E.emp && B.id !== E.emp)) return;
      const lA = E.libros.get(A.id)?.['fact-E'], lB = E.libros.get(B.id)?.['fact-R'];
      if (!lA?.length || !lB?.length) return; // sin libro de una de las dos no se puede cruzar
      cruzar(facturas(lA, nifN(B.cif)), facturas(lB, nifN(A.cif)), ej, E.mes).forEach((p) => out.push({ A, B, ...p }));
    }));
    const orden = { ko: 0, wa: 1, ok: 2 };
    out.sort((x, y) => orden[x.st] - orden[y.st] || x.A.nombre.localeCompare(y.A.nombre) || x.B.nombre.localeCompare(y.B.nombre) || String(x.a?.fecha ?? x.b.fecha).localeCompare(String(y.a?.fecha ?? y.b.fecha)));
    return { out, sin };
  }
  const nom = (e) => e.siglas || e.nombre;
  const pil = (st, t) => `<span class="as-p as-${st}">${esc(t)}</span>`;
  function vista() {
    if (!S.empresas.length) return '<p class="vacio">Sin empresas.</p>';
    const ej = Number(S.ejercicio), listo = E.libros.size && !E.leyendo;
    const cab = `<p class="no-print"><button class="small primary" data-espejo="leer"${E.leyendo ? ' disabled' : ''}>${E.libros.size ? '↻ Volver a leer los libros' : 'Leer los libros de todas las empresas'}</button> ${E.prog ? `<span class="dash-s">⏳ ${esc(E.prog)}</span>` : ''}</p>${E.error ? `<p class="d-ko">✖ ${esc(E.error)}</p>` : ''}`;
    let cuerpo = '<p class="hint">Pulsa el botón para leer los libros de IVA emitidas y recibidas y cruzar las facturas entre las empresas del grupo.</p>';
    if (listo) {
      const { out, sin } = resultado(), n = { ko: 0, wa: 0, ok: 0 }; out.forEach((x) => n[x.st]++);
      const ver = out.filter((x) => E.ver === 'todas' || x.st !== 'ok');
      cuerpo = `<div class="no-print" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        <label>Mes <select data-espejo="mes"><option value="">Todo ${ej}</option>${MES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}"${E.mes === v ? ' selected' : ''}>${m}</option>`; }).join('')}</select></label>
        <label>Empresa <select data-espejo="emp"><option value="">Todas</option>${empOrden().map((e) => `<option value="${e.id}"${E.emp === e.id ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>
        <label>Ver <select data-espejo="ver"><option value="mal"${E.ver === 'mal' ? ' selected' : ''}>Solo lo que hay que revisar</option><option value="todas"${E.ver === 'todas' ? ' selected' : ''}>Todas</option></select></label>
        <button class="small" data-espejo="xls">Descargar Excel</button></div>
        <p>${pil('ko', `${n.ko} a revisar`)} ${pil('wa', `${n.wa} con aviso`)} ${pil('ok', `${n.ok} coinciden`)}</p>
        ${ver.length ? `<div class="wrap" style="max-height:620px;overflow:auto"><table class="tabla"><thead><tr><th>Emite</th><th>Recibe</th><th>Factura</th><th>Fecha emisión</th><th class="num">Base emitida</th><th class="num">Cuota emitida</th><th>Fecha registro</th><th class="num">Base recibida</th><th class="num">Cuota recibida</th><th>Resultado</th></tr></thead><tbody>${ver.slice(0, 1500).map((x) => `<tr><td title="${esc(x.A.nombre)}">${esc(nom(x.A))}</td><td title="${esc(x.B.nombre)}">${esc(nom(x.B))}</td><td>${esc((x.a ?? x.b).num)}</td><td>${x.a ? fdia(x.a.fecha) : '—'}</td><td class="num">${fmt(x.a?.base ?? null)}</td><td class="num">${fmt(x.a?.cuota ?? null)}</td><td>${x.b ? fdia(x.b.fecha) : '—'}</td><td class="num">${fmt(x.b?.base ?? null)}</td><td class="num">${fmt(x.b?.cuota ?? null)}</td><td>${pil(x.st, x.txt)}</td></tr>`).join('')}</tbody></table></div>${ver.length > 1500 ? `<p class="hint">Se muestran 1.500 de ${ver.length}; el Excel las trae todas.</p>` : ''}` : '<p class="hint">Nada que revisar con estos filtros.</p>'}
        ${sin.length ? `<p class="hint">Sin libros cargados (no entran en el cruce): ${sin.map(esc).join(', ')}.</p>` : ''}`;
    }
    return `<div class="inicio"><section class="dsec"><h3>Espejo del grupo · ${ej}</h3>${cab}${cuerpo}
      <p class="hint">Se emparejan por CIF y número de factura y, si el número no coincide, por base y cuota. Solo se cruzan las empresas que tienen cargados el libro de emitidas de una y el de recibidas de la otra. Esta pestaña solo lee.</p></section></div>`;
  }
  function excel() {
    const X = window.XLSX; if (!X) return;
    const { out } = resultado(), wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Emite', 'Recibe', 'Factura', 'Fecha emisión', 'Base emitida', 'Cuota emitida', 'Retención emitida', 'Fecha registro', 'Base recibida', 'Cuota recibida', 'Retención recibida', 'Resultado'],
      ...out.map((x) => [x.A.nombre, x.B.nombre, (x.a ?? x.b).num, x.a?.fecha ?? '', x.a?.base ?? '', x.a?.cuota ?? '', x.a?.ret ?? '', x.b?.fecha ?? '', x.b?.base ?? '', x.b?.cuota ?? '', x.b?.ret ?? '', x.txt])]), 'Espejo');
    X.writeFile(wb, `Espejo del grupo ${S.ejercicio}${E.mes ? ` ${E.mes}` : ''}.xlsx`);
  }
  document.addEventListener('change', (ev) => { const k = ev.target.dataset?.espejo; if (k === 'mes' || k === 'ver' || k === 'emp') { E[k] = ev.target.value; render(); } });
  document.addEventListener('click', (ev) => { const b = ev.target.closest?.('button[data-espejo]'); if (!b) return; if (b.dataset.espejo === 'leer') leerTodo(); else if (b.dataset.espejo === 'xls') excel(); });
  return { tabs: { espejo: ['Espejo del grupo', 'Facturas entre empresas', vista] } };
}
