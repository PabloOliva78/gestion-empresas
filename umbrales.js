// Alertas de umbrales (bloque 1): el tipo de la empresa (GE mensual / PYME trimestral) se decide cada ejercicio por el volumen de operaciones del año anterior.
// El tipo de cada ejercicio se guarda en el registro «tipoej» (empresa + ejercicio); si no hay, vale el de «Opciones Empresa». app.js lo aplica al abrir cada ejercicio.
// Además avisa de otros límites: cifra de negocios (10 M€), producción del 583 (500.000 €) y terceros del 347 (3.005,06 €).
export function crearUmbrales({ S, esc, render, cargar, empresa, grande, normNif, guardarRegistro, puede }) {
  const LIM_VOL = 6010121.04, LIM_INCN = 10000000, LIM_583 = 500000, LIM_347 = 3005.06;
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const r2 = (x) => Math.round(((Number(x) || 0) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const TIPOS = { GE: 'Gran empresa (mensual)', PYME: 'Pyme (trimestral)' };
  const fuera = (cod) => /^(R\.)?I\./.test(cod ?? ''); // retenciones: no son operaciones de IVA

  // volumen de operaciones de un año: base de las facturas emitidas del libro de IVA (con exentas y rectificativas)
  const volLibro = (L, y) => { let v = 0, n = 0; for (const l of L) { if (String(l.fecha ?? '').slice(0, 4) !== String(y) || fuera(l.codigo)) continue; v += Number(l.base) || 0; n++; } return n ? r2(v) : null; };
  // cifra de negocios (cuentas 70) del balance de sumas y saldos de ese año
  const incn = (y) => { const reg = S.registros.find((r) => r.tipo === 'sys' && r.empresa_id === S.sel && r.ejercicio === y); const cs = reg?.datos?.cuentas; if (!cs?.length) return null; const v = r2(-cs.filter((c) => String(c.cuenta).startsWith('70')).reduce((a, c) => a + (+c.previo || 0), 0)); return v > 0 ? v : null; };
  const regTipo = (y) => S.registros.find((r) => r.tipo === 'tipoej' && r.empresa_id === S.sel && r.ejercicio === y);
  const m583Tot = (y) => { const r = S.registros.find((x) => x.tipo === 'm583' && x.empresa_id === S.sel && x.ejercicio === y)?.datos; return r?.inst ? r2(r.inst.reduce((s, i) => s + (i.q ?? []).reduce((a, x) => a + (+x || 0), 0), 0)) : null; };

  function terceros347(libro, ej) {
    const M = new Map();
    for (const l of libro) {
      if (String(l.fecha ?? '').slice(0, 4) !== String(ej) || fuera(l.codigo) || /\.UE\.|^(R|S)\.UE/.test(l.codigo ?? '')) continue;
      const k = normNif(l.nif) || `SIN-NIF|${l.nombre ?? ''}`;
      M.set(k, (M.get(k) ?? 0) + (Number(l.base) || 0) + (Number(l.cuota) || 0));
    }
    return [...M.values()].map(r2);
  }

  const color = (p) => (p > 100 ? 'r' : p >= 80 ? 'a' : 'v'); // «superior a» el límite: justo en el límite todavía no se supera
  const fila = (tit, sub, valor, pct, etiqueta, detalle = '') => `<div class="um-fila"><div><b>${tit}</b><small>${sub}</small></div>
    <div class="um-bar"><i class="${color(pct)}" style="width:${Math.min(100, Math.max(2, pct))}%"></i></div>
    <div class="um-val">${valor}${detalle ? `<small>${detalle}</small>` : ''}</div><div class="um-pill ${color(pct)}">${etiqueta}</div></div>`;

  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de arriba.</p>';
    const L = grande('fact-E'), Rr = grande('fact-R');
    if (!L || !Rr) return '<p class="vacio">Cargando datos…</p>';
    const e = empresa(), ej = Number(S.ejercicio), ed = puede(), base = e?.tipoBase ?? e?.tipo ?? '';
    const vol = (y) => { const l = volLibro(L, y); if (l !== null) return { v: l, f: 'libro' }; const b = incn(y); return b !== null ? { v: b, f: 'balance' } : { v: null, f: '' }; };

    // --- tipo de cada ejercicio ---
    const filasT = [ej + 1, ej, ej - 1, ej - 2, ej - 3].map((y) => {
      const ref = vol(y - 1), prev = y === ej + 1, prop = ref.v === null ? null : ref.v > LIM_VOL ? 'GE' : 'PYME', puesto = regTipo(y)?.datos?.tipo || '', efec = puesto || base;
      const est = !prop ? ['', 'Sin datos'] : !efec ? ['a', 'Sin tipo'] : prop === efec ? ['v', 'Coincide'] : ['a', `Debería ser ${prop}`];
      const sel = ed ? `<select data-umbtipo="${y}"><option value="">Como en Opciones Empresa${base ? ` (${base})` : ''}</option>${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}"${k === puesto ? ' selected' : ''}>${t}</option>`).join('')}</select>` : esc(TIPOS[efec] ?? '—');
      return `<tr class="${y === ej ? 'um-ej' : ''}"><td><b>${y}</b>${prev ? ' <small>previsión</small>' : y === ej ? ' <small>abierto</small>' : ''}</td>
        <td class="num">${ref.v === null ? '—' : money(ref.v)}<small class="um-f">${ref.f === 'libro' ? `facturas emitidas ${y - 1}${prev ? ' (hasta ahora)' : ''}` : ref.f === 'balance' ? `cifra de negocios ${y - 1} (aprox.)` : `sin libro ni balance de ${y - 1}`}</small></td>
        <td>${prop ? `<b>${esc(TIPOS[prop])}</b>` : '—'}</td><td>${sel}</td>
        <td><span class="um-pill ${est[0]}">${est[1]}</span>${ed && prop && prop !== efec ? ` <button class="small primary" data-umbaplicar="${y}|${prop}">Aplicar ${prop}</button>` : ''}</td></tr>`;
    }).join('');

    // --- otras alertas ---
    const alertas = [];
    const v0 = vol(ej);
    if (v0.v !== null) { const p = v0.v / LIM_VOL * 100; alertas.push(fila(`Volumen de operaciones ${ej}`, `${money(LIM_VOL)} € → el año siguiente pasa a gran empresa (mensual)`, `${money(v0.v)} €`, p, p > 100 ? 'Superado' : `${Math.round(p)} %`, v0.f === 'balance' ? 'cifra de negocios (aprox.)' : 'facturas emitidas hasta ahora')); }
    const i1 = incn(ej - 1);
    if (i1 !== null) { const p = i1 / LIM_INCN * 100; alertas.push(fila(`Cifra de negocios ${ej - 1}`, `${money(LIM_INCN)} € → deja de ser empresa de reducida dimensión y el 202 va al 24 %`, `${money(i1)} €`, p, p > 100 ? 'Superado' : `${Math.round(p)} %`)); }
    const p583 = m583Tot(ej - 1);
    if (p583 !== null) { const p = p583 / LIM_583 * 100; alertas.push(fila(`Producción eléctrica ${ej - 1} (modelo 583)`, `${money(LIM_583)} € → cuatro pagos fraccionados en vez de pago único`, `${money(p583)} €`, p, p > 100 ? 'Superado' : `${Math.round(p)} %`)); }
    const t347 = [...terceros347(L, ej), ...terceros347(Rr, ej)], sobre = t347.filter((v) => Math.abs(v) > LIM_347).length, cerca = t347.filter((v) => Math.abs(v) >= LIM_347 * 0.8 && Math.abs(v) <= LIM_347).length;
    if (t347.length) alertas.push(fila(`Modelo 347 · ${ej}`, `${money(LIM_347)} € por tercero y año`, `${sobre} declarables`, sobre ? 100 : cerca ? 85 : 10, cerca ? `${cerca} cerca` : sobre ? 'Revisar' : 'Sin riesgo', `${cerca} terceros entre el 80 y el 100 % del límite`));

    return `<div class="inicio um"><section class="dsec"><h3>Tipo de empresa por ejercicio · ${esc(e?.nombre ?? '')}</h3>
      <p class="dash-s" style="font-size:.75rem">Cada ejercicio la empresa es gran empresa (periodos mensuales) o pyme (trimestrales) según el volumen de operaciones del año anterior: más de ${money(LIM_VOL)} € = gran empresa. La app propone el tipo y tú lo confirmas con el botón; puedes fijarlo a mano en cualquier ejercicio. Al abrir ese ejercicio, los periodos y los modelos se adaptan solos.</p>
      <div class="wrap"><table class="tabla"><thead><tr><th>Ejercicio</th><th class="num">Volumen de operaciones del año anterior</th><th>Corresponde</th><th>Aplicado</th><th>Estado</th></tr></thead><tbody>${filasT}</tbody></table></div></section>
      <section class="dsec"><h3>Otros límites que cambian las obligaciones</h3>${alertas.length ? `<div class="um-card">${alertas.join('')}</div>` : '<p class="vacio">Sin datos: carga los libros de IVA, el balance de sumas y saldos o el modelo 583.</p>'}</section>
      <p class="hint">Volumen de operaciones: base imponible de las facturas emitidas del año (con exentas y rectificativas), sin retenciones; si no hay libro de ese año se usa la cifra de negocios del balance, de forma aproximada. En la fila de previsión solo cuentan las facturas hasta ahora. El tipo de «Opciones Empresa» vale para los ejercicios en los que no fijes ninguno aquí.</p></div>`;
  }

  async function guardarTipo(y, tipo) {
    const ex = regTipo(y);
    const err = await guardarRegistro(ex, { ...(ex ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'tipoej', ejercicio: y, datos: { tipo } });
    if (err) return void alert(err);
    await cargar(); render();
  }
  document.addEventListener('change', (ev) => { const y = ev.target.dataset?.umbtipo; if (y) guardarTipo(Number(y), ev.target.value); });
  document.addEventListener('click', (ev) => { const b = ev.target.closest?.('[data-umbaplicar]'); if (!b) return; const [y, t] = b.dataset.umbaplicar.split('|'); guardarTipo(Number(y), t); });
  return { tabs: { umbr: ['Alertas de umbrales', 'Tipo GE / PYME por ejercicio', vista] } };
}
