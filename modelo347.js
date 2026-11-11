// Modelo 347 (bloque 4): operaciones con terceros que superan 3.005,06 € en el año (IVA incluido), por trimestre.
// Pestaña nueva. Se calcula desde los libros de IVA cargados (emitidas → clave B · recibidas → clave A). No guarda nada.
export function crearModelo347({ S, esc, render, empresa, grande, normNif }) {
  const LIM = 3005.06;
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const r2 = (x) => Math.round(((Number(x) || 0) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const E = { ver: 'sobre' }; // sobre = solo los que superan el límite · todos
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
  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande('fact-E'), Rr = grande('fact-R');
    if (!L || !Rr) return '<p class="vacio">Cargando datos…</p>';
    if (!L.length && !Rr.length) return '<p class="vacio">Sin datos: carga los libros de IVA (emitidas y recibidas).</p>';
    const ej = Number(S.ejercicio), e = empresa();
    const B = calcular(L, 'B', ej), A = calcular(Rr, 'A', ej), sobre = (o) => Math.abs(o.total) > LIM;
    const tabla = (lista, tit, cab) => {
      const vis = E.ver === 'sobre' ? lista.filter(sobre) : lista, sup = lista.filter(sobre), tot = r2(sup.reduce((a, o) => a + o.total, 0));
      return `<section class="dsec"><h3>${tit} · ${sup.length} declarables de ${lista.length} terceros · total declarable ${money(tot)}</h3>
        <div class="wrap"><table class="tabla"><thead><tr><th>NIF</th><th>${cab}</th><th>Facturas</th><th>1T</th><th>2T</th><th>3T</th><th>4T</th><th>Total año</th><th></th></tr></thead><tbody>
        ${vis.map((o) => `<tr><td>${esc(o.nif || '—')}</td><td>${esc(o.nombre)}</td><td style="text-align:right">${o.n}</td>${o.q.map((v) => `<td style="text-align:right">${Math.abs(v) < 0.005 ? '-' : money(v)}</td>`).join('')}<td style="text-align:right"><b>${money(o.total)}</b></td><td>${sobre(o) ? '<span class="d-ok">✓ Se declara</span>' : '<span class="d-nd">no llega al límite</span>'}${o.nif ? '' : ' <span class="d-ko">sin NIF</span>'}</td></tr>`).join('') || '<tr><td colspan="9">Ninguno.</td></tr>'}
        </tbody></table></div></section>`;
    };
    return `<div class="inicio"><section class="dsec"><h3>Modelo 347 · Operaciones con terceros · ${esc(e?.nombre ?? '')} · ${ej} · <select data-m347="ver"><option value="sobre"${E.ver === 'sobre' ? ' selected' : ''}>Solo los que superan ${money(LIM)} €</option><option value="todos"${E.ver === 'todos' ? ' selected' : ''}>Todos los terceros</option></select></h3>
      <p class="dash-s" style="font-size:.8rem">Importes con IVA incluido (base + cuota), por tercero y trimestre. Emitidas = clave B (ventas) · Recibidas = clave A (compras).</p></section>
      ${tabla(B, 'Clave B · Entregas de bienes y servicios (clientes)', 'Cliente')}
      ${tabla(A, 'Clave A · Adquisiciones (proveedores)', 'Proveedor')}
      <p class="hint">Cálculo desde los libros de IVA cargados del ejercicio: se suman base y cuota de cada NIF (con rectificativas en negativo) y se declara el tercero cuyo total anual supera ${money(LIM)} €. Quedan fuera las retenciones y las operaciones intracomunitarias (van en el 349). No se incluyen los cobros en efectivo superiores a 6.000 € ni los arrendamientos de locales (clave de inmuebles, que piden la referencia catastral), ni se descuentan las operaciones de Hacienda o Seguridad Social: revísalo antes de presentar.</p></div>`;
  }
  document.addEventListener('change', (ev) => { if (ev.target.dataset?.m347 === 'ver') { E.ver = ev.target.value; render(); } });
  return { tabs: { mod347: ['Modelo 347', 'Operaciones con terceros', vista] } };
}
