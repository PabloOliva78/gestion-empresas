// Fase 3 (bloque 4): dos pestañas nuevas de control. No modifican las pestañas «Modelo 349» ni «Modelo 390»; solo leen los libros y lo presentado.
//  · 349 · Rectificaciones: abonos de cada periodo que no tienen factura en el mismo periodo, con el periodo en que se declaró la operación original.
//  · 390 · Cuadre con el 303: IVA devengado, deducible y resultado de cada periodo (calculado con los libros y presentado) y el total del año.
export function crearFase3({ S, esc, render, empresa, grande, c303, prsVal, calcular349Ops }) {
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const r2 = (x) => Math.round(((Number(x) || 0) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const trim = () => empresa()?.tipo !== 'GE'; // gran empresa por meses; el resto por trimestres
  const pers = () => (trim() ? ['1T', '2T', '3T', '4T'] : MES.map((_, i) => String(i + 1).padStart(2, '0')));
  const etq = (p) => (/T$/.test(p) ? `${p[0]}T` : MES[+p - 1]);
  const sinDatos = '<p class="vacio">Sin datos: carga los libros de IVA (emitidas y recibidas).</p>';

  // ---------- 349 · Rectificaciones ----------
  function vista349r() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande('fact-E'), R = grande('fact-R');
    if (!L || !R) return '<p class="vacio">Cargando datos…</p>';
    if (!L.length && !R.length) return sinDatos;
    const ej = Number(S.ejercicio), P = pers(), cache = new Map();
    const ops = (y, p) => { const k = `${y}|${p}`; if (!cache.has(k)) cache.set(k, calcular349Ops(L, R, y, p)); return cache.get(k); };
    // periodos anteriores al de cada rectificación: los del mismo año y los del anterior
    const previos = (p) => [...P.map((q) => ({ y: ej - 1, p: q })), ...P.map((q) => ({ y: ej, p: q }))].filter((x) => x.y < ej || P.indexOf(x.p) < P.indexOf(p));
    const filas = [];
    P.forEach((p) => {
      ops(ej, p).rect.forEach((neg) => {
        const orig = previos(p).map((x) => ({ ...x, o: ops(x.y, x.p).ops.find((o) => o.pais === neg.pais && o.nif === neg.nif && o.clave === neg.clave) })).filter((x) => x.o && x.o.base > 0.005);
        filas.push({ p, neg, orig: orig[orig.length - 1], otros: orig.slice(0, -1) });
      });
    });
    const avisos = (l) => (l.length ? `<div class="aviso">${l.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : '');
    return `<div class="inicio"><section class="dsec"><h3>349 · Rectificaciones · ${esc(empresa()?.nombre ?? '')} · ${ej}</h3>
      <p class="dash-s" style="font-size:.8rem">Un abono se resta de las facturas del mismo operador y clave del periodo. Solo queda como rectificación lo que no tiene factura en ese periodo (o la supera): se declara en el apartado de rectificaciones, con el periodo y el importe de la operación original.</p>
      ${filas.length ? `<p class="dash-s"><span class="d-ko">${filas.length} rectificación(es) a declarar en ${ej}</span></p>
      <div class="wrap"><table class="tabla"><thead><tr><th>Periodo del abono</th><th>Clave</th><th>País</th><th>NIF-IVA</th><th>Operador</th><th>Base del abono</th><th>Periodo original (probable)</th><th>Base declarada entonces</th><th>Base rectificada</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td>${esc(etq(f.p))} ${ej}</td><td style="text-align:center"><b>${esc(f.neg.clave)}</b></td><td style="text-align:center">${esc(f.neg.pais)}</td><td>${esc(f.neg.nif)}</td><td>${esc(f.neg.nombre)}${f.neg.avisos.size ? ` <span class="d-ko">⚠ ${esc([...f.neg.avisos][0])}</span>` : ''}</td><td style="text-align:right">${money(f.neg.base)}</td>
        <td>${f.orig ? `${esc(etq(f.orig.p))} ${f.orig.y}${f.otros.length ? ` <span class="hint">(también ${f.otros.map((x) => `${esc(etq(x.p))} ${x.y}`).join(', ')})</span>` : ''}` : '<span class="d-ko">no encuentro la operación original</span>'}</td>
        <td style="text-align:right">${f.orig ? money(f.orig.o.base) : '—'}</td><td style="text-align:right"><b>${f.orig ? money(r2(f.orig.o.base + f.neg.base)) : '—'}</b></td></tr>`).join('')}</tbody></table></div>` : `<p class="dash-s"><span class="d-ok">✓ No hay rectificaciones pendientes de declarar en ${ej}</span></p>`}</section>
      ${avisos(['El periodo original se busca entre los periodos anteriores en los que ese mismo operador y clave tienen operaciones; si hay varios se propone el más reciente y se avisa de los demás. Confírmalo con la factura rectificada antes de presentar.'])}</div>`;
  }

  // ---------- 390 · Cuadre con el 303 ----------
  function vista390c() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande('fact-E'), R = grande('fact-R');
    if (!L || !R) return '<p class="vacio">Cargando datos…</p>';
    if (!L.length && !R.length) return sinDatos;
    const ej = Number(S.ejercicio), P = pers(), hay = (v) => v !== undefined && v !== null && v !== '';
    const tot = { dev: 0, ded: 0, c46: 0, pres46: 0, pres71: 0, calc71: 0 };
    const filas = P.map((p) => {
      let c = null; try { c = c303(L, R, ej, p); } catch { /* sin datos */ }
      const p46 = prsVal(ej, '303', p, 'res'), p71 = prsVal(ej, '303', p, 'liq'), dif = c && hay(p46) ? r2(c.c46 - Number(p46)) : null;
      if (c) { tot.dev += c.devengado; tot.ded += c.deducir; tot.c46 += c.c46; tot.calc71 += c.c71 ?? 0; }
      if (hay(p46)) tot.pres46 += Number(p46); if (hay(p71)) tot.pres71 += Number(p71);
      return `<tr><td>${esc(etq(p))}</td><td style="text-align:right">${c ? money(c.devengado) : '—'}</td><td style="text-align:right">${c ? money(c.deducir) : '—'}</td><td style="text-align:right"><b>${c ? money(c.c46) : '—'}</b></td><td style="text-align:right">${hay(p46) ? money(Number(p46)) : '—'}</td><td style="text-align:right">${hay(p71) ? money(Number(p71)) : '—'}</td>
        <td>${dif === null ? '<span class="d-nd">• sin 303 presentado</span>' : Math.abs(dif) <= 1 ? '<span class="d-ok">✓ Cuadra</span>' : `<span class="d-ko">✖ Diferencia ${money(dif)}</span>`}</td></tr>`;
    }).join('');
    const p390 = prsVal(ej, '390', 'A', 'res'), difA = hay(p390) ? r2(tot.c46 - Number(p390)) : null, difP = r2(tot.c46 - tot.pres46);
    return `<div class="inicio"><section class="dsec"><h3>390 · Cuadre con el 303 · ${esc(empresa()?.nombre ?? '')} · ${ej}</h3>
      <p class="dash-s" style="font-size:.8rem">IVA devengado, deducible y resultado (casilla 46) de cada periodo calculados con los libros, frente al 303 presentado. La suma del año es la que debe coincidir con el resumen anual 390.</p>
      <div class="wrap"><table class="tabla"><thead><tr><th>Periodo</th><th>IVA devengado</th><th>IVA deducible</th><th>Resultado 46 (libros)</th><th>46 presentado</th><th>71 presentado (liquidación)</th><th>Comparación</th></tr></thead><tbody>${filas}
      <tr class="totano"><td><b>Total ${ej}</b></td><td style="text-align:right"><b>${money(r2(tot.dev))}</b></td><td style="text-align:right"><b>${money(r2(tot.ded))}</b></td><td style="text-align:right"><b>${money(r2(tot.c46))}</b></td><td style="text-align:right"><b>${money(r2(tot.pres46))}</b></td><td style="text-align:right"><b>${money(r2(tot.pres71))}</b></td>
      <td>${Math.abs(difP) <= 1 ? '<span class="d-ok">✓ Año cuadrado con lo presentado</span>' : `<span class="d-ko">✖ Libros − presentado: ${money(difP)}</span>`}</td></tr></tbody></table></div>
      <p class="dash-s" style="margin-top:.5rem">${difA === null ? '<span class="d-nd">• No hay Modelo 390 presentado cargado: cuando lo cargues en «Impuestos presentados» se compara aquí.</span>' : Math.abs(difA) <= 1 ? `<span class="d-ok">✓ El resultado de los libros coincide con el 390 presentado (${money(Number(p390))})</span>` : `<span class="d-ko">✖ El 390 presentado (${money(Number(p390))}) difiere de los libros en ${money(difA)}</span>`}</p>
      <p class="hint">«71 presentado» es el resultado de la liquidación (con compensaciones y otros ajustes), por lo que puede diferir del 46 sin que haya error. La comparación se hace con el 46.</p></section></div>`;
  }
  return { tabs: {
    mod349r: ['349 · Rectificaciones', 'Abonos de periodos anteriores', vista349r],
    mod390c: ['390 · Cuadre con 303', 'Año frente a los 303', vista390c],
  } };
}
