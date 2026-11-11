// Modelo 347 (bloque 4): operaciones con terceros que superan 3.005,06 € en el año (IVA incluido), por trimestre.
// Pestaña nueva. Se calcula desde los libros de IVA cargados (emitidas → clave B · recibidas → clave A). No guarda nada.
export function crearModelo347({ S, esc, render, empresa, grande, normNif }) {
  const LIM = 3005.06;
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const r2 = (x) => Math.round(((Number(x) || 0) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const E = { ver: 'sobre', q: '' }; // ver: sobre = solo los que superan el límite · todos; q = texto del buscador
  // líneas que no son operaciones del 347: retenciones (no son IVA) y operaciones intracomunitarias (van en el 349)
  const fuera = (cod) => /^(R\.)?I\./.test(cod ?? '') || /\.UE\.|^(R|S)\.UE/.test(cod ?? '');
  function calcular(libro, clave, ej) {
    const M = new Map();
    for (const l of libro) {
      if (String(l.fecha ?? '').slice(0, 4) !== String(ej) || fuera(l.codigo)) continue;
      const k = normNif(l.nif) || `SIN-NIF|${l.nombre ?? ''}`, t = Math.ceil(+String(l.fecha).slice(5, 7) / 3) - 1;
      let o = M.get(k); if (!o) M.set(k, (o = { nif: l.nif || '', nombre: l.nombre || '', clave, q: [0, 0, 0, 0], n: 0 }));
      o.q[t] += (Number(l.base) || 0) + (Number(l.cuota) || 0); o.n++;
      if (!o.nombre && l.nombre) o.nombre = l.nombre;
    }
    return [...M.values()].map((o) => ({ ...o, q: o.q.map(r2), total: r2(o.q.reduce((a, b) => a + b, 0)) })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }
  const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande('fact-E'), Rr = grande('fact-R');
    if (!L || !Rr) return '<p class="vacio">Cargando datos…</p>';
    if (!L.length && !Rr.length) return '<p class="vacio">Sin datos: carga los libros de IVA (emitidas y recibidas).</p>';
    const ej = Number(S.ejercicio), e = empresa();
    const B = calcular(L, 'B', ej), A = calcular(Rr, 'A', ej), sobre = (o) => Math.abs(o.total) > LIM, q = sinAc(E.q).trim();
    const tabla = (lista, tit, cab, id) => {
      const sup = lista.filter(sobre), tot = r2(sup.reduce((a, o) => a + o.total, 0)), vis = E.ver === 'sobre' ? sup : lista;
      return `<section class="dsec m347-c" data-m347col="${id}"><h3>${tit}</h3>
        <p class="dash-s m347-res">${sup.length} declarables de ${lista.length} terceros · total declarable <b>${money(tot)}</b></p>
        <div class="wrap"><table class="tabla"><thead><tr><th>NIF</th><th>${cab}</th><th>1T</th><th>2T</th><th>3T</th><th>4T</th><th>Total año</th></tr></thead><tbody>
        ${vis.map((o) => `<tr data-b="${esc(sinAc(o.nif + ' ' + o.nombre))}"${q && !sinAc(o.nif + ' ' + o.nombre).includes(q) ? ' style="display:none"' : ''} title="${o.n} factura(s)${sobre(o) ? '' : ' · no llega al límite'}"><td>${esc(o.nif || '—')}${o.nif ? '' : ' <span class="d-ko">sin NIF</span>'}</td><td>${esc(o.nombre)}</td>${o.q.map((v) => `<td style="text-align:right">${Math.abs(v) < 0.005 ? '-' : money(v)}</td>`).join('')}<td style="text-align:right"><b>${money(o.total)}</b></td></tr>`).join('') || '<tr><td colspan="7">Ninguno.</td></tr>'}
        </tbody></table></div></section>`;
    };
    return `<div class="inicio m347"><section class="dsec m347-fijo"><h3>Modelo 347 · Operaciones con terceros · ${esc(e?.nombre ?? '')} · ${ej}</h3>
      <div class="m347-bar"><select data-m347="ver"><option value="sobre"${E.ver === 'sobre' ? ' selected' : ''}>Solo los que superan ${money(LIM)} €</option><option value="todos"${E.ver === 'todos' ? ' selected' : ''}>Todos los terceros</option></select>
      <input type="search" data-m347="q" placeholder="🔍 Buscar por NIF o nombre…" value="${esc(E.q)}" autocomplete="off"></div>
      <p class="dash-s" style="font-size:.75rem;margin:.2rem 0 0">Importes con IVA incluido (base + cuota), por tercero y trimestre. A la izquierda clientes (clave B, emitidas) y a la derecha proveedores (clave A, recibidas).</p></section>
      <div class="m347-g">${tabla(B, 'Clientes · clave B', 'Cliente', 'B')}${tabla(A, 'Proveedores · clave A', 'Proveedor', 'A')}</div>
      <p class="hint">Cálculo desde los libros de IVA cargados del ejercicio: se suman base y cuota de cada NIF (con rectificativas en negativo) y se declara el tercero cuyo total anual supera ${money(LIM)} €. Quedan fuera las retenciones y las operaciones intracomunitarias (van en el 349). No se incluyen los cobros en efectivo superiores a 6.000 € ni los arrendamientos de locales (que piden la referencia catastral), ni se descuentan las operaciones de Hacienda o Seguridad Social: revísalo antes de presentar.</p></div>`;
  }
  document.addEventListener('change', (ev) => { if (ev.target.dataset?.m347 === 'ver') { E.ver = ev.target.value; render(); } });
  // el buscador filtra las filas en pantalla sin volver a dibujar (así no pierde el cursor)
  document.addEventListener('input', (ev) => {
    if (ev.target.dataset?.m347 !== 'q') return;
    E.q = ev.target.value; const q = sinAc(E.q).trim();
    document.querySelectorAll('.m347 tbody tr[data-b]').forEach((tr) => { tr.style.display = !q || tr.dataset.b.includes(q) ? '' : 'none'; });
  });
  return { tabs: { mod347: ['Modelo 347', 'Operaciones con terceros', vista] } };
}
