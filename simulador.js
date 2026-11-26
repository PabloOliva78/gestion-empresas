// Bloque 14 · Simulador fiscal: «¿y si…?» sobre copias de los datos. No guarda ni cambia nada real.
//  1) Mover facturas de periodo y ver cómo queda el 303.  2) Compensar bases imponibles negativas en el 200.
export function crearSimulador({ S, esc, render, empresa, grande, c303, plazoMod }) {
  const E = { clave: '', mov: [], q: '', lado: 'E', is: { bi: '', bin: '', comp: '', tipo: '25', pagos: '', cn: '70' } };
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const fmt = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const num = (s) => { const t = String(s ?? '').trim(); if (!t) return 0; const v = parseFloat(t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t); /* «2.000.000» son dos millones */ return Number.isFinite(v) ? v : 0; };
  const fdia = (s) => String(s ?? '').slice(0, 10).split('-').reverse().join('/');
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const trim = () => empresa()?.tipo === 'PYME';
  const periodos = () => (trim() ? ['1T', '2T', '3T', '4T'] : MES.map((_, i) => String(i + 1).padStart(2, '0')));
  const perDe = (fecha) => { const m = +String(fecha).slice(5, 7); return trim() ? `${Math.ceil(m / 3)}T` : String(m).padStart(2, '0'); };
  const nomPer = (p) => (/T$/.test(p) ? `${p[0]}.º trimestre` : MES[+p - 1]);
  // fecha que se pone a la factura movida: el mismo día en el primer mes del periodo de destino (máximo 28)
  const fechaEn = (fecha, ej, p) => { const m = /T$/.test(p) ? (+p[0] - 1) * 3 + 1 : +p; return `${ej}-${String(m).padStart(2, '0')}-${String(Math.min(28, +String(fecha).slice(8, 10) || 1)).padStart(2, '0')}`; };
  const clave = (lado, l) => [lado, l.factura, l.nif, l.fecha].join('|');
  function facturas(lado, libro, ej) {
    const G = new Map();
    libro.forEach((l) => { if (String(l.fecha).slice(0, 4) !== String(ej)) return; const k = clave(lado, l); let f = G.get(k); if (!f) G.set(k, (f = { k, lado, factura: l.factura, nombre: l.nombre ?? '', nif: l.nif, fecha: l.fecha, base: 0, cuota: 0 })); if (!/^(R\.)?I\./.test(String(l.codigo ?? ''))) { f.base = r2(f.base + (+l.base || 0)); f.cuota = r2(f.cuota + (+l.cuota || 0)); } });
    return [...G.values()];
  }
  function simular(libro, lado, ej) {
    const M = new Map(E.mov.filter((m) => m.lado === lado).map((m) => [m.k, m.a]));
    return libro.map((l) => { const a = M.get(clave(lado, l)); if (!a) return l; const f = fechaEn(l.fecha, ej, a); return { ...l, fecha: f, ...(/^DUA/.test(String(l.codigo ?? '')) ? { ff: f } : {}) }; });
  }

  function bloque303() {
    const Er = grande('fact-E'), Rr = grande('fact-R'), ej = Number(S.ejercicio);
    if (!Er || !Rr) return '<p class="vacio">Cargando los libros…</p>';
    const libro = E.lado === 'E' ? Er : Rr, q = E.q.trim().toUpperCase();
    const halladas = q.length >= 2 ? facturas(E.lado, libro, ej).filter((f) => `${f.factura} ${f.nombre} ${f.nif} ${fmt(f.base)}`.toUpperCase().includes(q)).slice(0, 25) : [];
    const opciones = (sel) => periodos().map((p) => `<option value="${p}"${p === sel ? ' selected' : ''}>${nomPer(p)}</option>`).join('');
    const busca = `<div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label>Libro <select data-sim="lado"><option value="E"${E.lado === 'E' ? ' selected' : ''}>Emitidas</option><option value="R"${E.lado === 'R' ? ' selected' : ''}>Recibidas</option></select></label>
      <label>Buscar factura <input data-sim="q" value="${esc(E.q)}" placeholder="número, nombre, NIF o base" size="28"></label><button class="small" data-sim-act="buscar">Buscar</button></div>
      ${q.length >= 2 ? (halladas.length ? `<div class="wrap" style="max-height:260px;overflow:auto"><table class="tabla"><thead><tr><th>Factura</th><th>Fecha</th><th>Nombre</th><th class="num">Base</th><th class="num">Cuota</th><th>Mover a</th></tr></thead><tbody>${halladas.map((f) => `<tr><td>${esc(f.factura)}</td><td>${fdia(f.fecha)}</td><td>${esc(f.nombre)}</td><td class="num">${fmt(f.base)}</td><td class="num">${fmt(f.cuota)}</td><td><select data-sim-mover="${esc(f.k)}"><option value="">—</option>${opciones(E.mov.find((m) => m.k === f.k)?.a).replace(`value="${perDe(f.fecha)}"`, `value="${perDe(f.fecha)}" disabled`)}</select></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No hay facturas que coincidan en este libro y ejercicio.</p>') : ''}`;
    if (!E.mov.length) return `${busca}<p class="hint">Busca una factura y elige a qué periodo la pasarías.</p>`;
    const todas = [...facturas('E', Er, ej), ...facturas('R', Rr, ej)];
    const lista = E.mov.map((m, i) => { const f = todas.find((x) => x.k === m.k); return f ? `<li>${m.lado === 'E' ? 'Emitida' : 'Recibida'} <b>${esc(f.factura)}</b> · ${esc(f.nombre)} · cuota ${fmt(f.cuota)} · de ${nomPer(perDe(f.fecha))} a <b>${nomPer(m.a)}</b> <button class="small no-print" data-sim-act="quitar" data-i="${i}">Quitar</button></li>` : ''; }).join('');
    const afect = [...new Set(E.mov.flatMap((m) => { const f = todas.find((x) => x.k === m.k); return f ? [perDe(f.fecha), m.a] : []; }))].sort();
    let filas = '';
    try {
      const E2 = simular(Er, 'E', ej), R2 = simular(Rr, 'R', ej); let ta = 0, tb = 0;
      filas = afect.map((p) => { const a = r2(c303(Er, Rr, ej, p).c46), b = r2(c303(E2, R2, ej, p).c46); ta = r2(ta + a); tb = r2(tb + b); return `<tr><td>303 · ${nomPer(p)}</td><td class="num">${fmt(a)}</td><td class="num">${fmt(b)}</td><td class="num"><b>${b - a > 0 ? '+' : ''}${fmt(r2(b - a))}</b></td><td>${fdia(new Date(plazoMod('303', ej, p)).toISOString())}</td></tr>`; }).join('')
        + `<tr class="tot"><td><b>Total de los periodos afectados</b></td><td class="num"><b>${fmt(ta)}</b></td><td class="num"><b>${fmt(tb)}</b></td><td class="num"><b>${fmt(r2(tb - ta))}</b></td><td></td></tr>`;
    } catch (err) { filas = `<tr><td colspan="5">No se pudo calcular: ${esc(err.message)}</td></tr>`; }
    return `${busca}<ul>${lista}</ul><div class="wrap"><table class="tabla"><thead><tr><th>Modelo</th><th class="num">Ahora (devengado − deducible)</th><th class="num">Simulado</th><th class="num">Diferencia</th><th>Plazo hasta</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="hint">Se compara la casilla 46 de cada periodo. No incluye compensaciones de periodos anteriores ni el efecto en el prorrateo o en otros modelos.</p>`;
  }

  // compensación de bases imponibles negativas (art. 26 LIS): límite del 70 %, 50 % o 25 % según la cifra de negocios y, en todo caso, hasta 1.000.000 €
  function calc200() {
    const I = E.is, bi = num(I.bi), bin = Math.max(0, num(I.bin)), tipo = num(I.tipo), pagos = num(I.pagos);
    const limite = bi > 0 ? r2(Math.min(bi, Math.max(1000000, bi * num(I.cn) / 100))) : 0;
    const maximo = r2(Math.min(bin, limite)), pedida = String(I.comp).trim() === '' ? maximo : Math.max(0, num(I.comp)), comp = r2(Math.min(pedida, maximo));
    const res = (c) => { const base = r2(bi - c), cuota = r2(Math.max(0, base) * tipo / 100); return { base, cuota, fin: r2(cuota - pagos) }; };
    return { bi, bin, limite, maximo, comp, recortada: pedida > maximo + 0.005, sin: res(0), con: res(comp) };
  }
  function bloque200() {
    const I = E.is, C = calc200();
    const inp = (k, t, ph) => `<label style="display:flex;flex-direction:column;gap:2px">${t}<input data-sim200="${k}" value="${esc(I[k])}" placeholder="${ph || '0,00'}" inputmode="decimal" size="16"></label>`;
    const f = (t, a, b) => `<tr><td>${t}</td><td class="num">${fmt(a)}</td><td class="num">${fmt(b)}</td><td class="num">${fmt(r2(b - a))}</td></tr>`;
    return `<div class="no-print" style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">${inp('bi', 'Base imponible antes de compensar')}${inp('bin', 'Bases negativas pendientes')}${inp('comp', 'Importe a compensar', 'el máximo')}
      <label style="display:flex;flex-direction:column;gap:2px">Cifra de negocios año anterior<select data-sim200="cn">${[['70', 'Menos de 20 millones (70 %)'], ['50', 'De 20 a 60 millones (50 %)'], ['25', '60 millones o más (25 %)']].map(([v, t]) => `<option value="${v}"${I.cn === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      ${inp('tipo', 'Tipo (%)', '25')}${inp('pagos', 'Pagos a cuenta y retenciones')}<button class="small primary" data-sim-act="calc">Calcular</button></div>
      ${C.bi ? `<p>Compensación máxima: <b>${fmt(C.maximo)}</b> (límite ${fmt(C.limite)}).${C.recortada ? ' <span class="d-ko">El importe pedido supera el máximo: se usa el máximo.</span>' : ''} Quedarían pendientes <b>${fmt(r2(C.bin - C.comp))}</b>.</p>
      <div class="wrap"><table class="tabla"><thead><tr><th>Modelo 200</th><th class="num">Sin compensar</th><th class="num">Compensando ${fmt(C.comp)}</th><th class="num">Diferencia</th></tr></thead><tbody>${f('Base imponible', C.sin.base, C.con.base)}${f('Cuota íntegra', C.sin.cuota, C.con.cuota)}${f('A ingresar (+) o a devolver (−)', C.sin.fin, C.con.fin)}</tbody></table></div>` : '<p class="hint">Escribe la base imponible y las bases negativas pendientes.</p>'}
      <p class="hint">Cálculo orientativo: no incluye deducciones, reservas, tributación mínima ni límites especiales. Comprueba el tipo y el límite que corresponden a la empresa y al ejercicio.</p>`;
  }
  function vista() {
    if (!S.sel) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
    const k = `${S.sel}|${S.ejercicio}`;
    if (E.clave !== k) { E.clave = k; E.mov = []; E.q = ''; E.is = { bi: '', bin: '', comp: '', tipo: '25', pagos: '', cn: '70' }; }
    return `<div class="inicio"><section class="dsec"><h3>Simulador fiscal · ${esc(empresa().nombre)} · ${S.ejercicio}</h3><p class="dash-s">Todo es simulado: los datos reales no cambian y al cambiar de empresa se borra.</p></section>
      <section class="dsec"><h3>1. ¿Y si muevo facturas de periodo? · Modelo 303</h3>${bloque303()}</section>
      <section class="dsec"><h3>2. ¿Y si compenso bases negativas? · Modelo 200</h3>${bloque200()}</section></div>`;
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target, d = t.dataset; if (!d) return;
    if (d.sim) { E[d.sim] = t.value; if (d.sim === 'lado') render(); return; }
    if (d.sim200) { E.is[d.sim200] = t.value; if (d.sim200 === 'cn') render(); return; }
    if (d.simMover !== undefined) { const k = d.simMover; E.mov = E.mov.filter((m) => m.k !== k); if (t.value) E.mov.push({ k, lado: k.split('|')[0], a: t.value }); render(); }
  });
  document.addEventListener('input', (ev) => { const d = ev.target.dataset; if (d?.sim === 'q') E.q = ev.target.value; else if (d?.sim200) E.is[d.sim200] = ev.target.value; });
  document.addEventListener('keydown', (ev) => { const d = ev.target.dataset; if (ev.key === 'Enter' && (d?.sim === 'q' || d?.sim200)) { ev.preventDefault(); render(); } });
  document.addEventListener('click', (ev) => { const b = ev.target.closest?.('[data-sim-act]'); if (!b) return; if (b.dataset.simAct === 'quitar') E.mov.splice(+b.dataset.i, 1); render(); });
  return { tabs: { simfis: ['Simulador fiscal', '¿Y si…? sin tocar los datos', vista] } };
}
