// Bloque 8 · conciliaciones fiscales portadas de la aplicación antigua (diseño y cálculo copiados; solo cambia la capa de datos).
// Datos: libros de IVA, SII y mayor llegan de `grande()`; lo presentado, de «Impuestos Presentados» (prsVal); las nóminas, de la pestaña Nóminas.
export function crearConciliaciones(c) {
  const { S, esc, empresa, grande, prsVal, nomPer, nomMes, ctaDe, ctaPref, ctaCfg, casaCta, ctasEmpresa, calcCuenta, calc303, calc349, extra } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const nf2 = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 2 }).format(v ?? 0);
  const guion = (v) => (v === null || v === undefined || Math.abs(v) < 0.005 ? '-' : money(v));
  const bloqueAvisos = (l) => `<div class="aviso">${l.map((t) => `<div>${esc(t)}</div>`).join('')}</div>`;
  const ejNum = () => Number(S.ejercicio) || new Date().getFullYear();
  const esTrim = () => empresa()?.tipo === 'PYME';
  const MES_L = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const TRN = ['1T - Ene/Mar', '2T - Abr/Jun', '3T - Jul/Sep', '4T - Oct/Dic'];
  const MARGEN = 0.10 + 1e-9, MARGEN_RET = 0.20 + 1e-9;
  const fdate = (ms) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
  // presentado en «Impuestos Presentados»: null si no hay dato
  const pv = (ej, m, per, col) => { const v = prsVal(ej, m, per, col); return v === undefined || v === null || v === '' ? null : +v; };
  const lib = (k) => grande(k);
  const conFecha = (L) => (L ?? []).map((l) => ({ ...l, ms: Date.parse(l.fecha) }));
  const en = (l, a, b) => l.ms >= a && l.ms < b;
  const rngPer = (ej, p) => (/T$/.test(p) ? [Date.UTC(ej, (+p[0] - 1) * 3, 1), Date.UTC(ej, +p[0] * 3, 1)] : [Date.UTC(ej, +p - 1, 1), Date.UTC(ej, +p, 1)]);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(`conc8-${S.sel}-${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(`conc8-${S.sel}-${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

  // ================= Conciliaciones 111 / 115 / 123: lo presentado frente a la contabilidad =================
  function calcAudi(m) {
    const ej = ejNum(), trim = esTrim(), nP = trim ? 4 : 12;
    const sop = conFecha(lib('fact-R'));
    const pres = (col, per) => pv(ej, m, per, col) ?? 0;
    const tipo123 = +(lsGet('audi123tipo', 0.19));
    let may4751 = [];
    if (m === '123' && ctaDe('c47514')) { const M = lib('may-mov'); if (M) may4751 = calcCuenta('c47514', M).movs.map((x) => ({ ...x.l, _tipo: x.tipo })); }
    const filas = []; let hay = false;
    for (let i = 0; i < nP; i++) {
      const per = trim ? `${i + 1}T` : String(i + 1).padStart(2, '0'), [a, b] = rngPer(ej, per);
      const f = { txt: trim ? TRN[i] : MESES[i], per };
      if (m === '111') {
        const nom = nomPer(ej, per) ?? { s: 0, r: 0 }, pr = sop.filter((l) => en(l, a, b) && /^I\.PR/.test(l.codigo || ''));
        Object.assign(f, { c1: pres('base', per), k1: r2(nom.s), c2: pres('retN', per), k2: r2(nom.r), c3: pres('baseP', per), k3: r2(pr.reduce((s, l) => s + (+l.base || 0), 0)), c4: pres('retP', per), k4: r2(Math.abs(pr.reduce((s, l) => s - (+l.cuota || 0), 0))) });
      } else if (m === '115') {
        const al = sop.filter((l) => en(l, a, b) && l.codigo === 'I.ALQ');
        Object.assign(f, { c1: pres('base', per), k1: r2(al.reduce((s, l) => s + (+l.base || 0), 0)), c2: pres('ret', per), k2: r2(Math.abs(al.reduce((s, l) => s - (+l.cuota || 0), 0))) });
      } else {
        const ret = r2(may4751.filter((l) => en(l, a, b) && l._tipo === 'S').reduce((s, l) => s + (+l.haber || 0), 0));
        // dividendos exentos a empresas (I.DV.E): su base suma aunque no lleven retención · personas (I.DV…): base de la contabilidad si aparece; el resto de la retención se pasa a base con el tipo
        const dv = sop.filter((l) => en(l, a, b) && /^I\.DV/.test(l.codigo || '')), ex = dv.filter((l) => l.codigo === 'I.DV.E'), pe = dv.filter((l) => l.codigo !== 'I.DV.E');
        const bEx = r2(ex.reduce((s, l) => s + (+l.base || 0), 0)), bPe = r2(pe.reduce((s, l) => s + (+l.base || 0), 0)), rPe = r2(Math.abs(pe.reduce((s, l) => s - (+l.cuota || 0), 0)));
        const resto = Math.max(0, r2(ret - rPe)), bResto = tipo123 ? r2(resto / tipo123) : 0;
        Object.assign(f, { c1: pres('base', per), k1: r2(bEx + bPe + bResto), c2: pres('ret', per), k2: ret, det: { bEx, bPe, bResto } });
      }
      ['1', '2', '3', '4'].forEach((j) => { if (f[`c${j}`] !== undefined) { f[`d${j}`] = r2(f[`c${j}`] - f[`k${j}`]); if (f[`c${j}`] || f[`k${j}`]) hay = true; } });
      filas.push(f);
    }
    const T = { txt: 'TOTAL', tot: true };
    ['c', 'k', 'd'].forEach((x) => ['1', '2', '3', '4'].forEach((j) => { if (filas[0][x + j] !== undefined) T[x + j] = r2(filas.reduce((s, f) => s + f[x + j], 0)); }));
    filas.push(T);
    return { m, ej, trim, filas, hay, tipo123 };
  }
  function vistaAudi(m) {
    if (!S.sel) return sinEmpresa;
    if (!lib('fact-R') || (m === '123' && !lib('may-mov'))) return cargandoTxt;
    const A = calcAudi(m), T = A.filas[A.filas.length - 1], n = (v) => `<td class="n">${guion(v)}</td>`;
    const d = (v, j) => {
      const ok = Math.abs(v) <= MARGEN_RET, comp = !ok && Math.abs(T[`d${j}`] || 0) <= MARGEN_RET;
      return `<td class="n" style="font-weight:700;${ok ? 'color:#0a6' : comp ? 'color:#8a5a00;background:#fff3cd' : 'color:#a4161a;background:#fde7e7'}"${comp ? ' title="Se compensa con otro mes: el total del ejercicio cuadra"' : ''}>${Math.abs(v) < 0.005 ? '0,00' : money(v)}</td>`;
    };
    const grupos = m === '111' ? [['RENDIMIENTOS DEL TRABAJO', [['Base Mod. 111', 'Base contabilidad', 1], ['Retención Mod. 111', 'Retención contabilidad', 2]]], ['ACTIVIDADES PROFESIONALES', [['Base Mod. 111', 'Base contabilidad', 3], ['Retención Mod. 111', 'Retención contabilidad', 4]]]]
      : [['BASES IMPONIBLES', [[`Modelo ${m}`, 'Contabilidad', 1]]], ['RETENCIONES', [[`Modelo ${m}`, 'Contabilidad', 2]]]];
    const h1 = `<tr><th rowspan="2">Periodo</th>${grupos.map((g) => `<th colspan="${g[1].length * 3}">${g[0]}</th>`).join('')}</tr>`;
    const h2 = `<tr>${grupos.map((g) => g[1].map((cc) => `<th>${cc[0]}</th><th>${cc[1]}</th><th class="adif-d">Diferencia</th>`).join('')).join('')}</tr>`;
    const body = A.filas.map((f) => `<tr${f.tot ? ' class="tot"' : ''}><td${f.tot ? ' style="font-weight:700"' : ''}>${esc(f.txt)}</td>${grupos.map((g) => g[1].map((cc) => n(f[`c${cc[2]}`]) + n(f[`k${cc[2]}`]) + d(f[`d${cc[2]}`], cc[2])).join('')).join('')}</tr>`).join('');
    const sub = { 111: 'Compara lo declarado en el Modelo 111 (Presentados) con la contabilidad: nóminas (pestaña Nóminas) y retenciones profesionales del libro de soportado (códigos I.PR*).',
      115: 'Compara lo declarado en el Modelo 115 (Presentados) con el libro de soportado (código I.ALQ).',
      123: 'Compara lo declarado en el Modelo 123 (Presentados) con la contabilidad. Retención: extracto de la cuenta 4751.04 (haber, movimientos de la empresa). Base contable = dividendos exentos a empresas (I.DV.E, sin retención) + dividendos a personas que aparezcan en la contabilidad (I.DV) + la retención restante pasada a base con el tipo indicado.' }[m];
    return `<section class="block audi-sec"><h3 class="bt">AUDITORÍA MODELO ${m} - BASES Y RETENCIONES vs CONTABILIDAD</h3>
      <p class="leyenda" style="margin:0 0 8px">${sub} Cuadra por el total del ejercicio con un margen de ±0,20 €; en ámbar, diferencias de un mes que se compensan en otro.</p>
      <div class="filtros" style="display:flex;gap:16px;align-items:center;margin-bottom:8px"><span>Ejercicio: <b>${A.ej}</b></span><span>Tipo de empresa: <b>${esTrim() ? 'PYME (trimestral)' : 'Gran empresa (mensual)'}</b></span>
        ${m === '123' ? `<label>Tipo de retención: <input data-audi123tipo="1" value="${String(A.tipo123 * 100).replace('.', ',')}" size="4"> %</label>` : ''}</div>
      <div style="overflow:auto"><table class="aud audi-t" style="width:auto"><thead>${h1}${h2}</thead><tbody>${body}</tbody></table></div></section>`;
  }

  // ================= Conciliación 303: lo presentado en el SII frente a la contabilidad (libros de IVA), periodo a periodo =================
  // emitidas: el libro trae las autorepercutidas (ISP, intracomunitarias…) que el SII de emitidas no tiene → se restan para cuadrar
  const AUTO_E = ['R.ISP.NR', 'R.ISP.RD', 'S.NC.ISP.A', 'R.UE.NR', 'R.UE.RD', 'R.UE.NR.SR', 'R.UE.RD.SR'];
  function calcAudi303() {
    const ej = ejNum(), trim = esTrim(), nP = trim ? 4 : 12;
    const LE = lib('fact-E') ?? [], LR = lib('fact-R') ?? [], SE = lib('sii-E') ?? [], SR = lib('sii-R') ?? [];
    const o0 = () => ({ b: 0, c: 0 }), suma = (L) => ({ b: r2(L.reduce((s, l) => s + (+l.base || 0), 0)), c: r2(L.reduce((s, l) => s + (+l.cuota || 0), 0)) });
    const filas = []; let hay = false;
    // recibidas: una línea S.NAC.NS con el mismo importe que otra línea con IVA de la misma factura es un reflejo en el libro y el SII la declara una vez
    const nf = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, ''), gF = new Map(), espejo = new Set();
    LR.forEach((l) => { const k = `${nf(l.factura)}|${nf(l.nif)}`; (gF.get(k) ?? gF.set(k, []).get(k)).push(l); });
    gF.forEach((ls) => { const con = ls.filter((l) => l.codigo !== 'S.NAC.NS' && Math.abs(+l.cuota || 0) > 0.005); ls.filter((l) => l.codigo === 'S.NAC.NS').forEach((n) => { if (con.some((c) => Math.abs((+c.base || 0) - (+n.base || 0)) < 0.01)) espejo.add(n); }); });
    for (let i = 0; i < nP; i++) {
      const per = trim ? `${i + 1}T` : String(i + 1).padStart(2, '0'), a = rngPer(ej, per).map((t) => new Date(t).toISOString().slice(0, 10));
      const f = { txt: trim ? TRN[i] : MESES[i], per, e: { s: o0(), t: o0(), a: o0(), k: o0() }, r: { s: o0(), t: o0(), a: o0(), k: o0() } };
      const dentro = (x, campo) => x[campo] >= a[0] && x[campo] < a[1];
      const seP = SE.filter((s) => dentro(s, 'fecha')), nfac = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, ''), enSii = new Set(seP.map((s) => nfac(s.factura)));
      // el periodo sale del campo «fecha» del libro; las no sujetas (R.NAC.NS, arts. 7-14) solo cuentan si la factura está declarada en el SII
      const libE = LE.filter((l) => dentro(l, 'fecha') && !/^(R\.)?I\./.test(l.codigo) && (l.codigo !== 'R.NAC.NS' || enSii.has(nfac(l.factura))) && !/^R\.RC\./.test(l.codigo));
      f.e.t = suma(libE.map((l) => (l.codigo === 'R.NAC.NS' ? { ...l, base: 0 } : l))); // las no sujetas (art. 7-14): el SII las lleva como «importe no sujeto», no en base imponible
      f.e.a = suma(libE.filter((l) => AUTO_E.includes(l.codigo))); f.e.k = { b: r2(f.e.t.b - f.e.a.b), c: r2(f.e.t.c - f.e.a.c) };
      f.e.s = suma(seP);
      f.r.t = suma(LR.filter((l) => dentro(l, 'fecha') && !/^I\./.test(l.codigo) && !espejo.has(l)));
      f.r.s = suma(SR.filter((s) => s.ej === ej && s.per === per));
      if (f.e.s.c || f.e.s.b || f.e.t.c || f.e.t.b || f.r.s.c || f.r.s.b || f.r.t.c || f.r.t.b) hay = true;
      filas.push(f);
    }
    const T = { txt: 'TOTAL', tot: true, e: { s: o0(), t: o0(), a: o0(), k: o0() }, r: { s: o0(), t: o0(), a: o0(), k: o0() } };
    filas.forEach((f) => ['e', 'r'].forEach((t) => ['s', 't', 'a', 'k'].forEach((x) => { T[t][x].b = r2(T[t][x].b + f[t][x].b); T[t][x].c = r2(T[t][x].c + f[t][x].c); })));
    filas.push(T);
    return { ej, filas, hay };
  }
  function vistaAudi303() {
    if (!S.sel) return sinEmpresa;
    if (!lib('fact-E') || !lib('fact-R') || !lib('sii-E') || !lib('sii-R')) return cargandoTxt;
    const A = calcAudi303(), n = (v) => `<td class="n">${guion(v)}</td>`;
    const d = (v) => { v = r2(v); const ok = Math.abs(v) <= 0.10 + 1e-9; return `<td class="n" style="font-weight:700;${ok ? 'color:#0a6' : 'color:#a4161a;background:#fde7e7'}">${Math.abs(v) < 0.005 ? '0,00' : money(v)}</td>`; };
    const bE = (t, x) => n(t.s[x]) + n(t.t[x]) + n(t.a[x]) + n(t.k[x]) + d(t.s[x] - t.k[x]);
    const bR = (t, x) => n(t.s[x]) + n(t.t[x]) + d(t.s[x] - t.t[x]);
    const subE = ['SII emitidas', 'Libro emitidas', 'Autorepercutidas', 'Libro sin autorep.', 'Diferencia'], subR = ['SII recibidas', 'Libro recibidas', 'Diferencia'];
    const h1 = '<tr><th rowspan="3">Periodo</th><th colspan="10">IVA REPERCUTIDO · FACTURAS EMITIDAS</th><th colspan="6">IVA SOPORTADO · FACTURAS RECIBIDAS</th></tr>';
    const h2 = '<tr><th colspan="5">Base imponible</th><th colspan="5">Cuota</th><th colspan="3">Base imponible</th><th colspan="3">Cuota</th></tr>';
    const h3 = `<tr>${[subE, subE, subR, subR].map((L) => L.map((t) => `<th>${t}</th>`).join('')).join('')}</tr>`;
    const body = A.filas.map((f) => `<tr${f.tot ? ' class="tot"' : ''}><td${f.tot ? ' style="font-weight:700"' : ''}>${esc(f.txt)}</td>${bE(f.e, 'b') + bE(f.e, 'c') + bR(f.r, 'b') + bR(f.r, 'c')}</tr>`).join('');
    return `<section class="block audi-sec"><h3 class="bt">CONCILIACIÓN MODELO 303 - SII PRESENTADO vs CONTABILIDAD</h3>
      <p class="leyenda" style="margin:0 0 8px">Presentado: descargas del SII (LRFE emitidas y LRFR recibidas) del periodo. Contabilidad: libros de IVA del periodo, sin retenciones ni recargo. En emitidas se restan las autorepercutidas del libro (ISP, intracomunitarias…), que el SII de emitidas no recoge; la diferencia es SII − libro sin autorepercutidas. Se da por cuadrado con un margen de ±0,10 €. Ejercicio ${A.ej} · ${esTrim() ? 'PYME (trimestral)' : 'Gran empresa (mensual)'}.</p>
      <div style="overflow:auto"><table class="aud audi-t" style="width:auto"><thead>${h1}${h2}${h3}</thead><tbody>${body}</tbody></table></div></section>`;
  }
  const estadoAudi = (A) => { const T = A.filas[A.filas.length - 1]; return !A.hay ? 'Sin datos' : ['1', '2', '3', '4'].every((j) => T[`d${j}`] === undefined || Math.abs(T[`d${j}`]) <= MARGEN_RET) ? 'Cuadra' : 'Descuadre'; };
  const estado303 = () => { const A = calcAudi303(); if (!A.hay) return 'Sin datos'; const T = A.filas[A.filas.length - 1]; return Math.abs(T.e.s.c - T.e.k.c) <= 0.10 + 1e-9 && Math.abs(T.r.s.c - T.r.t.c) <= 0.10 + 1e-9 ? 'Cuadra' : 'Descuadre'; };
  const insigniaEstado = (e) => ({ t: e, c: e === 'Cuadra' ? 'verde' : e === 'Descuadre' ? 'rojo' : '' });

  // ================= Conciliación Cuentas - Impuestos (hojas ExCta) =================
  const CONC_DEF = { c4650: 'PAGO NOMINAS', c4700: 'MODELO 303 IVA A COMPENSAR', c4709: 'MODELO 200 IMPUESTO SOBRE SOCIEDADES A DEVOLVER', c4730: 'MODELO 202 PAGO A CUENTA IMPUESTO SOBRE SOCIEDADES',
    c4750: 'MODELO 303 IVA A INGRESAR', c47511: 'MODELO 111 RETENCIONES RDTOS DEL TRABAJO Y ACTIV. ECONOMICAS', c47512: 'MODELO 115 RETENCIONES DEL CAPITAL INMOBILIARIO', c47513: 'MODELO 115 RETENCIONES DEL CAPITAL INMOBILIARIO',
    c47514: 'MODELO 123 RETENCIONES DEL CAPITAL MOBILIARIO', c4752: 'MODELO 200 IMPUESTO SOBRE SOCIEDADES A INGRESAR', c4760: 'SEGURIDAD SOCIAL MES EN CURSO' };
  const concSinImp = (k) => /^(c4650|c47300[1-4]|c4745|c6400|c6420)$/.test(k);
  function rangoConc(per) {
    const ej = ejNum(), p = per ?? S.periodo ?? '';
    let m0 = 1, m1 = 12, txt = 'Todo el ejercicio';
    if (/^\d\d$/.test(p)) { m0 = m1 = +p; txt = `${p} - ${MESES[+p - 1]}`; } else if (/^[1-4]T$/.test(p)) { m1 = +p[0] * 3; m0 = m1 - 2; txt = `${p} - ${MESES[m0 - 1]} a ${MESES[m1 - 1]}`; }
    return { ej, m0, m1, txt, desde: Date.UTC(ej, m0 - 1, 1), hasta: Date.UTC(ej, m1, 0) };
  }
  // impuesto de la AEAT que se concilia con cada cuenta, a fin del periodo
  function impuestoCuenta(k, y, m, multi) {
    const mm = String(m).padStart(2, '0'), trim = esTrim(), [yk, pk] = trim ? (m >= 3 ? [y, `${Math.floor(m / 3)}T`] : [y - 1, '4T']) : [y, mm];
    const P = (mod, col, ejx = yk, perx = pk) => pv(ejx, mod, perx, col);
    switch (k) {
      case 'c4750': { const v = P('303', 'liq'); return { lado: 'H', v: v === null ? null : r2(Math.max(0, v)) }; }
      case 'c4700': { const c87 = P('303', 'c87'), liq = P('303', 'liq'); if (c87 === null && liq === null) return { lado: 'D', v: null }; return { lado: 'D', v: r2((c87 || 0) + (m === 12 && liq < 0 ? -liq : 0)) }; }
      case 'c47511': if (ctaDe('c47513')) return { lado: 'H', v: P('111', 'retN') }; { const a = P('111', 'retN'), b = P('111', 'retP'); return { lado: 'H', v: a === null && b === null ? null : r2((a || 0) + (b || 0)) }; }
      case 'c47512': if (ctaDe('c47513')) return { lado: 'H', v: P('111', 'retP') }; return { lado: 'H', v: P('115', 'ret') };
      case 'c47513': return { lado: 'H', v: P('115', 'ret') };
      case 'c47514': return { lado: 'H', v: P('123', 'ret') };
      // IS a años vencidos: en cualquier periodo de un año se concilia con el 200 del ejercicio anterior (que se paga o cobra en ese año)
      case 'c4752': { const v = P('200', 'res', y - 1, 'A'); return { lado: 'H', v: v === null ? null : r2(Math.max(0, v)) }; }
      case 'c4709': { const v = P('200', 'res', y - 1, 'A'); return { lado: 'D', v: v === null ? null : r2(Math.max(0, -v)) }; }
      case 'c4730': { const ps = [['1P', 3], ['2P', 9], ['3P', 11]].filter(([, fin]) => m >= fin); if (!ps.length) return { lado: 'D', v: 0 };
        const vs = ps.map(([p]) => P('202', 'res', y, p)); return { lado: 'D', v: vs.some((v) => v === null) ? null : r2(vs.reduce((s, v) => s + v, 0)) }; }
      case 'c4760': { const n = nomMes(y, mm); return { lado: 'H', v: n ? r2(n.ssTot || 0) : null }; }
      case 'c4650': return { lado: 'H', v: 0 };
      default: return null;
    }
  }
  function calcConc(M, per) {
    const R = rangoConc(per), corte = Date.UTC(R.ej, R.m1, 1), trim = esTrim(), CT = ctasEmpresa(empresa()), cfg = ctaCfg();
    const filas = Object.keys(CT).map((k) => {
      const C = CT[k], pref = ctaPref(k);
      const quit = cfg.quit ?? {}, ovs = cfg.ov ?? {}, firma = (l) => [l.cuenta, l.fecha, l.asiento, l.debe, l.haber, l.desc].join('|');
      const movs = M.filter((l) => !quit[firma(l)] && casaCta(pref, l.digitos)).map((l) => ({ ...l, ...(ovs[firma(l)] ?? {}), ms: Date.parse((ovs[firma(l)] ?? {}).fecha ?? l.fecha) }))
        .concat((cfg.lineas ?? []).filter((l) => casaCta(pref, String(l.cuenta).replace(/\D/g, ''))).map((l) => ({ ...l, ms: Date.parse(l.fecha) })));
      const saldo = r2(movs.filter((l) => l.ms < corte).reduce((s, l) => s + (+l.debe || 0) - (+l.haber || 0), 0));
      const subc = [...new Set(movs.map((l) => l.cuenta))].join(', ');
      let imp = null;
      if (k === 'c4700') {
        const per = trim ? `${Math.ceil(R.m1 / 3)}T` : String(R.m1).padStart(2, '0'), liq = pv(R.ej, '303', per, 'liq'), c87 = pv(R.ej, '303', per, 'c87');
        // pendiente de compensar a la fecha: casilla 87 + la 71 del periodo si sale negativa (en diciembre/4T, a devolver)
        imp = liq === null && c87 === null ? null : r2((c87 || 0) + (liq < 0 ? -liq : 0));
      } else if (k === 'c4650') imp = null;
      else if (k === 'c4730') { // pagos fraccionados del ejercicio ya vencidos: 1P (abril), 2P (octubre) y 3P (diciembre)
        const ps = [['1P', 4], ['2P', 10], ['3P', 12]].filter(([, m]) => R.m1 >= m).map(([p]) => pv(R.ej, '202', p, 'res'));
        imp = ps.length && ps.some((v) => v !== null) ? r2(ps.reduce((s, v) => s + (v || 0), 0)) : (ps.length ? null : 0);
      } else { const x = impuestoCuenta(k, R.ej, R.m1); if (x && x.v !== null) imp = x.lado === 'H' ? r2(-x.v) : r2(x.v); }
      const ctaStd = C.cta.split('.')[0] + String(C.cta.split('.')[1] || '').padStart(5, '0'); // 4752.01 → 475200001, aunque no tenga movimientos
      const modelo = ctaDe('c47513') && k === 'c47511' ? 'MODELO 111 RETENCIONES RDTOS DEL TRABAJO' : ctaDe('c47513') && k === 'c47512' ? 'MODELO 111 RETENCIONES ACTIV. ECONOMICAS' : CONC_DEF[k] || '';
      return { k, hoja: `ExCta${C.cta}`, cuenta: subc || ctaStd, nombre: C.desc, saldo, modelo, imp, dif: r2(saldo - (imp || 0)) };
    });
    return { R, filas, tot: { saldo: r2(filas.reduce((s, f) => s + f.saldo, 0)), imp: r2(filas.reduce((s, f) => s + (f.imp || 0), 0)), dif: r2(filas.reduce((s, f) => s + f.dif, 0)) } };
  }
  function vistaConc() {
    if (!S.sel) return sinEmpresa;
    const M = lib('may-mov'); if (!M) return cargandoTxt;
    if (!M.length) return bloqueAvisos(['Suelta los extractos contables para ver la conciliación de cuentas con los impuestos']);
    const D = calcConc(M), R = D.R, e = empresa();
    const FI = D.filas.filter((f) => !concSinImp(f.k)), FS = D.filas.filter((f) => concSinImp(f.k)), sm = (L, k) => r2(L.reduce((t, f) => t + (f[k] || 0), 0));
    return `<section class="block conc"><div class="aud-emp">${esc(e.nombre)}</div><div class="aud-nif">${esc(e.cif)}</div>
      <div class="aud-tit" style="margin-top:14px">SALDOS DE CUENTAS POR PERIODO - HOJAS ExCta</div>
      <div class="aud-sub">Papel de trabajo: saldo de cada cuenta según el ejercicio y periodo seleccionados</div>
      <table class="conc-cab"><tr><td>Ejercicio:</td><td class="amar">${R.ej}</td></tr><tr><td>Periodo:</td><td class="amar">${esc(R.txt)}</td></tr>
        <tr><td>Desde:</td><td class="c">${fdate(R.desde)}</td></tr><tr><td>Hasta:</td><td class="c">${fdate(R.hasta)}</td></tr></table>
      <div class="conc-dos"><div class="aud-tit" style="margin-top:14px;font-size:15px">CUENTAS CON IMPUESTOS</div>
      <div class="conc-flex"><table class="aud mov conc-t" style="width:100%"><thead><tr><th>Hoja</th><th>Cuenta</th><th>Nombre</th><th>Saldo Periodo</th><th>Modelo / Impuesto</th><th>Impuesto AEAT</th><th>Diferencia</th></tr></thead><tbody>
      ${FI.map((f) => `<tr><td>${esc(f.hoja)}</td><td class="c">${esc(f.cuenta)}</td><td>${esc(f.nombre)}</td><td class="n">${guion(f.saldo)}</td><td class="c gris">${esc(f.modelo)}</td><td class="n">${guion(f.imp || 0)}</td><td class="n ${Math.abs(f.dif) > 0.005 ? 'dif-ko' : ''}">${guion(f.dif)}</td></tr>`).join('')}
      <tr class="totano"><td>TOTAL</td><td></td><td></td><td class="n">${money(sm(FI, 'saldo'))}</td><td></td><td class="n">${money(sm(FI, 'imp'))}</td><td class="n">${money(sm(FI, 'dif'))}</td></tr>
      ${FS.length ? `<tr class="conc-sep"><td colspan="7" style="background:transparent;border:none;padding:18px 0 6px"><div class="aud-tit" style="font-size:15px;margin:0">CUENTAS SIN IMPUESTOS</div></td></tr>
      <tr class="conc-th"><th>Hoja</th><th>Cuenta</th><th>Nombre</th><th>Saldo Periodo</th><th colspan="3" class="conc-vac"></th></tr>
      ${FS.map((f) => `<tr><td>${esc(f.hoja)}</td><td class="c">${esc(f.cuenta)}</td><td>${esc(f.nombre)}</td><td class="n">${guion(f.saldo)}</td><td colspan="3" class="conc-vac"></td></tr>`).join('')}
      <tr class="totano"><td>TOTAL</td><td></td><td></td><td class="n">${money(sm(FS, 'saldo'))}</td><td colspan="3" class="conc-vac"></td></tr>` : ''}</tbody></table></div></div></section>`;
  }

  // ================= Resúmenes anuales de retenciones (profesionales, alquileres, intereses y dividendos, soportadas) =================
  const RRES = { rprof: { tit: 'Retenciones profesionales', ts: 'Por profesional · ejercicio' }, ralq: { tit: 'Retenciones alquileres', ts: 'Por inmueble · ejercicio' },
    rint: { tit: 'Retenciones intereses y dividendos', ts: 'Por perceptor · ejercicio' }, rsop: { tit: 'Retenciones soportadas', ts: 'Cuentas 4730.01 a 4730.05' } };
  const RSOP = [['4730.01', 'Retenciones bancarias'], ['4730.02', 'Retenciones Intereses Ptmo. Emp. Grupo'], ['4730.03', 'Retenciones Intereses Ptmo. Emp. Externas'], ['4730.04', 'Retenciones Alquileres'], ['4730.05', 'Pagos fraccionados']];
  const INMUEBLES_180 = { T: { nom: 'Torre Cautiva - Sede', ref: '7723401VG4172D0001IR' }, A: { nom: 'Nueva Nave Sevilla', ref: '4817003TG3341N0001JF' }, L: { nom: 'Local Nueva Sede', ref: '7723401VG4172D0120QB' },
    PROF: { nom: 'Nave Profitegra', ref: '3540127VG3034S0000PP' }, SEV: { nom: 'Nave Sevilla', ref: '4610014TG3341S0001QX' } };
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function inmueble180(l) {
    const nom = norm(l.nombre), fac = String(l.factura ?? '').trim().toUpperCase();
    if (/herogra/.test(nom) && fac.startsWith('A/')) return INMUEBLES_180.SEV;
    if (/alientagr/.test(nom)) return INMUEBLES_180[fac.charAt(0)] ?? null;
    if (/inverprode/.test(nom)) return INMUEBLES_180.PROF;
    return null;
  }
  function rresLineas(k) {
    const ej = ejNum(), re = k === 'rprof' ? /^I\.PR/ : k === 'ralq' ? /^I\.ALQ$/ : /^I\.(INT|DV)/;
    return conFecha(lib('fact-R')).filter((l) => re.test(l.codigo || '') && l.ms && new Date(l.ms).getUTCFullYear() === ej).map((l) => ({ ...l, ret: -(+l.cuota || 0) + 0 }));
  }
  function rresTipo(cod, b, r) {
    const m = /I\.PR\.GN/.test(cod) ? 15 : /I\.PR\.PRA/.test(cod) ? 7 : /I\.PR\.SR/.test(cod) ? 1 : /I\.DV\.E/.test(cod) ? 0 : /^I\.(INT|DV|ALQ)/.test(cod) ? 19 : null;
    if (m !== null) return m;
    return Math.abs(b) > 0.005 ? Math.round(r / b * 10000) / 100 : 0;
  }
  function rresAgrupa(L, clave) {
    const M = new Map();
    L.forEach((l) => { const cl = clave(l), x = M.get(cl) || { l, base: 0, ret: 0, n: 0 }; x.base += +l.base || 0; x.ret += +l.ret || 0; x.n++; M.set(cl, x); });
    return [...M.values()].map((x) => Object.assign(x, { base: r2(x.base), ret: r2(x.ret) })).sort((a, b) => String(a.l.nombre || '').localeCompare(String(b.l.nombre || '')));
  }
  const rresTabla = (cab, filas, tot, cls) => `<table class="aud mov rres ${cls || ''}"><thead><tr>${cab.map(([t, n]) => `<th${n ? ' class="n"' : ''}>${t}</th>`).join('')}</tr></thead><tbody>${filas.join('')}${tot || ''}</tbody></table>`;
  const rresTot = (txt, nc, b, r) => `<tr class="sub"><td colspan="${nc}"><b>${txt}</b></td>${b === null ? '' : `<td class="n"><b>${money(b)}</b></td>`}<td></td><td class="n"><b>${money(r)}</b></td></tr>`;
  function rsopCalc(M) {
    const ej = ejNum(), may = M.map((l) => ({ ...l, ms: Date.parse(l.fecha) })).filter((l) => l.ms && new Date(l.ms).getUTCFullYear() === ej && !/^I[-\s]|^OD-/i.test(String(l.asiento || '')));
    return RSOP.map(([cta, t]) => { const L = may.filter((l) => casaCta(cta, l.digitos)); return { c: cta, t, n: L.length, v: r2(L.reduce((a, l) => a + (+l.debe || 0), 0)), h: r2(L.reduce((a, l) => a + (+l.haber || 0), 0)) }; });
  }
  function rresChip(k) {
    try {
      if (k === 'rsop') { const M = lib('may-mov'); return M && M.length ? money(rsopCalc(M).reduce((a, x) => a + x.v, 0)) : 'Sin extracto'; }
      if (!lib('fact-R')) return '';
      const L = rresLineas(k); return L.length ? money(r2(L.reduce((a, l) => a + (+l.ret || 0), 0))) : 'Sin datos';
    } catch { return '—'; }
  }
  function vistaRetRes(k) {
    if (!S.sel) return sinEmpresa;
    const ej = S.ejercicio, T = RRES[k], sec = (h, body, ley) => `<section class="block"><h3 class="bt">${h}</h3>${ley ? `<p class="leyenda">${ley}</p>` : ''}${body}</section>`;
    if (k === 'rsop') {
      const M = lib('may-mov'); if (!M) return cargandoTxt;
      if (!M.length) return sec(`${T.tit} · ejercicio ${ej}`, '<p class="leyenda">Carga el extracto contable (mayor) para ver los cargos de las cuentas 4730.01 a 4730.05.</p>');
      const R = rsopCalc(M), tot = r2(R.reduce((a, x) => a + x.v, 0));
      return sec(`${T.tit} · ejercicio ${ej}`, rresTabla([['Cuenta'], ['Concepto'], ['Importe ejercicio €', 1]],
        R.map((x) => `<tr><td>${x.c}</td><td>${esc(x.t)}</td><td class="n">${money(x.v)}</td></tr>`),
        `<tr class="sub"><td colspan="2"><b>TOTAL RETENCIONES Y PAGOS A CUENTA</b></td><td class="n"><b>${money(tot)}</b></td></tr>`, 'rres-prof rres-sop'),
      'Cargos del ejercicio en cada cuenta según el extracto contable, sin los asientos de apertura (I-) ni de regularización (OD-).');
    }
    if (!lib('fact-R')) return cargandoTxt;
    const L = rresLineas(k);
    if (!L.length) return sec(`${T.tit} · ejercicio ${ej}`, '<p class="leyenda">No hay líneas de retención de este tipo en el libro de recibidas del ejercicio.</p>');
    const nif = (l) => l.nif || '(sin NIF)';
    if (k === 'rprof') {
      const G = rresAgrupa(L, (l) => `${nif(l)}|${l.codigo}`), tb = r2(G.reduce((a, x) => a + x.base, 0)), tr = r2(G.reduce((a, x) => a + x.ret, 0));
      return sec(`${T.tit} · ejercicio ${ej}`, rresTabla([['Profesional'], ['DNI / NIF'], ['Base ejercicio €', 1], ['Tipo %', 1], ['Retención ejercicio €', 1]],
        G.map((x) => `<tr><td><a href="#" class="certret" data-certret="${esc(nif(x.l))}" title="Emitir el certificado de retenciones de ${ej}">${esc(x.l.nombre || '')}</a></td><td>${esc(nif(x.l))}</td><td class="n">${money(x.base)}</td><td class="n">${nf2(rresTipo(x.l.codigo, x.base, x.ret))} %</td><td class="n">${money(x.ret)}</td></tr>`),
        rresTot(`TOTAL (${G.length} perceptores)`, 2, tb, tr), 'rres-prof'), 'Retenciones de actividades profesionales y agrícolas (111 / 190) del libro de recibidas, sin rendimientos del trabajo. Pincha en el nombre del profesional para emitir su certificado de retenciones del ejercicio.');
    }
    if (k === 'ralq') {
      const G = rresAgrupa(L, (l) => `${nif(l)}|${(inmueble180(l) || {}).ref || ''}`), tb = r2(G.reduce((a, x) => a + x.base, 0)), tr = r2(G.reduce((a, x) => a + x.ret, 0));
      return sec(`${T.tit} · ejercicio ${ej}`, rresTabla([['Arrendador'], ['CIF'], ['Referencia catastral'], ['Inmueble'], ['Base ejercicio €', 1], ['Tipo %', 1], ['Retención ejercicio €', 1]],
        G.map((x) => { const i = inmueble180(x.l); return `<tr><td>${esc(x.l.nombre || '')}</td><td>${esc(nif(x.l))}</td><td>${i ? esc(i.ref) : '—'}</td><td>${i ? esc(i.nom) : 'sin identificar'}</td><td class="n">${money(x.base)}</td><td class="n">${nf2(rresTipo(x.l.codigo, x.base, x.ret))} %</td><td class="n">${money(x.ret)}</td></tr>`; }),
        rresTot('TOTAL', 4, tb, tr), 'rres-prof'), 'Retenciones por arrendamiento de inmuebles urbanos (115 / 180), un renglón por inmueble.');
    }
    const ex = (l) => l.codigo === 'I.DV.E', con = L.filter((l) => !ex(l)), sin = L.filter(ex);
    const bloque = (LL, tit) => {
      const G = rresAgrupa(LL, (l) => `${nif(l)}|${l.codigo}`), tb = r2(G.reduce((a, x) => a + x.base, 0)), tr = r2(G.reduce((a, x) => a + x.ret, 0));
      return `<h4 style="margin:10px 0 4px">${tit}</h4>${G.length ? rresTabla([['Nombre'], ['CIF'], ['Concepto'], ['Base ejercicio €', 1], ['Tipo %', 1], ['Retención ejercicio €', 1]],
        G.map((x) => { const cd = x.l.codigo; return `<tr><td><a href="#" class="certret" data-certcap="${esc(nif(x.l))}" title="Emitir el certificado de retenciones de ${ej}">${esc(x.l.nombre || '')}</a></td><td>${esc(nif(x.l))}</td><td>${cd === 'I.INT' ? 'Intereses' : /^I\.DV/.test(cd) ? 'Dividendos' : esc(cd || '')}${cd === 'I.DV.E' ? ' · exento' : ''}</td><td class="n">${money(x.base)}</td><td class="n">${nf2(rresTipo(cd, x.base, x.ret))} %</td><td class="n">${money(x.ret)}</td></tr>`; }),
        rresTot('Total', 3, tb, tr), 'rres-prof rres-int') : '<p class="leyenda">Sin operaciones.</p>'}`;
    };
    const gb = r2(L.reduce((a, l) => a + (+l.base || 0), 0)), gr = r2(L.reduce((a, l) => a + (+l.ret || 0), 0));
    const totG = `<table class="aud mov rres rres-prof rres-int" style="margin-top:10px"><colgroup><col style="width:28%"><col style="width:12%"><col style="width:16%"><col style="width:16%"><col style="width:10%"><col style="width:18%"></colgroup><tbody>${rresTot('TOTAL GENERAL (con retención + exentos)', 3, gb, gr).replace('class="sub"', 'class="sub" style="background:var(--tot,#eef3f8)"')}</tbody></table>`;
    return sec(`${T.tit} · ejercicio ${ej}`, bloque(con, 'Con retención') + bloque(sin, 'Exentos (dividendos I.DV.E): solo base, retención cero') + totG, 'Capital mobiliario (123 / 193) del libro de recibidas. Pincha en el nombre del perceptor para emitir su certificado de retenciones del ejercicio (intereses y/o dividendos, con el ejercicio al que corresponden).');
  }

  // ================= Análisis Diferencias: causa y origen de cada descuadre, por modelo =================
  // movimientos del mayor de una cuenta (con las correcciones de la pestaña de la cuenta) y su tipo de asiento
  const movsK = (k, M) => {
    const cfg = ctaCfg(), pref = ctaPref(k), quit = cfg.quit ?? {}, ovs = cfg.ov ?? {}, firma = (l) => [l.cuenta, l.fecha, l.asiento, l.debe, l.haber, l.desc].join('|');
    return M.filter((l) => !quit[firma(l)] && casaCta(pref, l.digitos)).map((l) => ({ ...l, ...(ovs[firma(l)] ?? {}), _f: firma(l) }))
      .concat((cfg.lineas ?? []).filter((l) => casaCta(pref, String(l.cuenta).replace(/\D/g, ''))).map((l) => ({ ...l, digitos: String(l.cuenta).replace(/\D/g, ''), _f: `m:${l.id}` })))
      .map((l) => ({ ...l, ms: Date.parse(l.fecha) }));
  };
  const tipoMov = (k, l) => ctaCfg().clases?.[`${k}§${l._f}`] ?? ctaDe(k).tipo(String(l.asiento || '').trim().toUpperCase(), !!l.debe, !!l.haber, empresa()?.siglas ?? '');
  const vmov = (l) => r2((+l.debe || 0) - (+l.haber || 0));
  const txtMov = (l) => `asiento ${l.asiento || 's/n'} del ${fdate(l.ms)}${l.desc ? ` «${String(l.desc).slice(0, 60)}»` : ''} (${money(vmov(l))})`;
  /* cuentas de retenciones (111/115/123) y 4750 (303 a ingresar): mes a mes, lo contabilizado frente a lo declarado
     y cada pago frente a lo declarado del periodo anterior; devuelve el/los asiento(s) que descuadran */
  function descuadreMensual(f, R, ej, tol, soloP) {
    const mo = String(f.modelo || ''), y = R.ej, trim = esTrim(); let decl = null;
    const sum = (...a) => (a.some((x) => x !== null) ? r2(a.reduce((s, x) => s + (x || 0), 0)) : null);
    if (/MODELO 111/.test(mo)) decl = /TRABAJO Y ACTIV/.test(mo) ? (yy, p) => sum(pv(yy, '111', p, 'retN'), pv(yy, '111', p, 'retP')) : /RDTOS DEL TRABAJO$/.test(mo) ? (yy, p) => pv(yy, '111', p, 'retN') : /ACTIV\. ECONOMICAS$/.test(mo) ? (yy, p) => pv(yy, '111', p, 'retP') : (yy, p) => sum(pv(yy, '111', p, 'retN'), pv(yy, '111', p, 'retP'));
    else if (/MODELO 115/.test(mo)) decl = (yy, p) => pv(yy, '115', p, 'ret');
    else if (/MODELO 123/.test(mo)) decl = (yy, p) => pv(yy, '123', p, 'ret');
    else if (f.k === 'c4750') decl = (yy, p) => { const l = pv(yy, '303', p, 'liq'); return l === null ? null : Math.max(0, l); };
    if (!decl) return null;
    const perDe = (ms) => { const d = new Date(ms); return trim ? `${Math.floor(d.getUTCMonth() / 3) + 1}T` : String(d.getUTCMonth() + 1).padStart(2, '0'); };
    const nomP = (p) => (/T$/.test(p) ? p : MES_L[+p - 1].toLowerCase());
    const prev = (p) => (/T$/.test(p) ? (+p[0] === 1 ? [y - 1, '4T'] : [y, `${+p[0] - 1}T`]) : (+p === 1 ? [y - 1, '12'] : [y, String(+p - 1).padStart(2, '0')]));
    const out = [];
    [...new Set(ej.map((l) => perDe(l.ms)))].sort().filter((p) => !soloP || p === soloP).forEach((p) => {
      const L = ej.filter((l) => perDe(l.ms) === p), dev = L.filter((l) => vmov(l) < 0), pag = L.filter((l) => vmov(l) > 0);
      const d = decl(y, p), cont = r2(-dev.reduce((s, l) => s + vmov(l), 0));
      if (d !== null && Math.abs(cont - d) > tol) { const D = r2(cont - d), m1 = dev.find((l) => Math.abs(Math.abs(vmov(l)) - Math.abs(D)) <= tol);
        out.push(`En ${nomP(p)} se contabilizaron ${money(cont)} y se declararon ${money(d)} (diferencia ${money(D)}): ${m1 ? txtMov(m1) : `asientos del periodo ${dev.slice(0, 6).map(txtMov).join(', ')}${dev.length > 6 ? '…' : ''}`}`); }
      const dp = decl(...prev(p)), pagado = r2(pag.reduce((s, l) => s + vmov(l), 0));
      if (dp !== null && pag.length && Math.abs(pagado - dp) > tol) out.push(`El pago de ${nomP(p)} (${pag.map(txtMov).join(', ')}) no coincide con lo declarado del periodo anterior (${money(dp)}): diferencia ${money(r2(pagado - dp))}`);
    });
    return out.length ? out.join(' · ') : null;
  }
  /* explica la diferencia de una cuenta (saldo − impuesto): qué parte viene del ejercicio anterior sin liquidar
     (FIFO: los primeros movimientos de signo contrario del ejercicio liquidan el saldo de apertura) y de qué es el resto */
  function explicaDifCuenta(f, R, M) {
    const k = f.k, ini = Date.UTC(R.ej, 0, 1), corte = Date.UTC(R.ej, R.m1, 1), tol = /^c475/.test(k) ? MARGEN_RET : MARGEN;
    const movs = movsK(k, M);
    const antes = r2(movs.filter((l) => l.ms < ini).reduce((s, l) => s + vmov(l), 0));
    const ej = movs.filter((l) => l.ms >= ini && l.ms < corte).sort((a, b) => a.ms - b.ms);
    let pend = antes;
    if (Math.abs(antes) > tol) { for (const l of ej) { const x = vmov(l); if (!x || Math.sign(x) === Math.sign(pend)) continue; const u = Math.sign(pend) * Math.min(Math.abs(pend), Math.abs(x)); pend = r2(pend - u); if (Math.abs(pend) <= tol) { pend = 0; break; } } } else pend = 0;
    const dif = r2(f.dif), difEj = r2(dif - pend), partes = [];
    if (f.imp === null) partes.push('El modelo no está en Impuestos Presentados: no hay importe con el que cuadrar');
    if (Math.abs(antes) > tol && pend !== 0) partes.push(`${money(pend)} de ejercicios anteriores sin liquidar todavía`);
    if (Math.abs(difEj) > tol && f.imp !== null) {
      let q = descuadreMensual(f, R, ej, tol); const uno = q ? null : ej.find((l) => Math.abs(vmov(l) - difEj) <= tol); if (uno) q = `Corresponde al ${txtMov(uno)}`;
      if (!q) { const L = ej.slice(-400); for (let i = 0; i < L.length && !q; i++) for (let j = i + 1; j < L.length; j++) if (Math.abs(vmov(L[i]) + vmov(L[j]) - difEj) <= tol) { q = `Corresponde a dos asientos: ${txtMov(L[i])} y ${txtMov(L[j])}`; break; } }
      if (!q) { const Mm = {}; ej.forEach((l) => { const m = new Date(l.ms).getUTCMonth(); Mm[m] = r2((Mm[m] || 0) + vmov(l)); }); const mm = Object.keys(Mm).find((m) => Math.abs(Mm[m] - difEj) <= tol); if (mm !== undefined) q = `Es el neto de los movimientos de ${MES_L[+mm].toLowerCase()} ${R.ej}`; }
      if (!q && Math.abs(difEj) < 1) q = 'Diferencia de redondeo';
      if (!q && !movs.length) q = 'La cuenta no tiene movimientos en el mayor cargado';
      if (!q) { const T = {}; ej.forEach((l) => { const t = tipoMov(k, l) || '?'; T[t] = r2((T[t] || 0) + vmov(l)); }); q = `No coincide con un asiento ni con un mes; movimientos de ${R.ej} por tipo: ${Object.entries(T).filter(([, x]) => Math.abs(x) > 0.005).map(([t, x]) => `${t} ${money(x)}`).join(', ')}`; }
      partes.push(`${money(difEj)} del ejercicio ${R.ej}: ${q}`);
    }
    return { antes, pend, difEj, texto: partes.join(' · ') || 'Cuadra' };
  }
  /* detalle mes a mes de una cuenta con diferencia: saldo y impuesto a fin de cada periodo; la variación de la diferencia
     en el mes dice dónde nace el descuadre y se busca el asiento que la explica (margen ±1 €) */
  function adifCuentaMes(k, A, M) {
    const TOL = 1, ej = A.ej, pers = A.pers, CM = A.ctasMes;
    const nomP = (p) => (/T$/.test(p) ? p : MES_L[+p - 1]);
    const movs = movsK(k, M), ejL = movs.filter((l) => l.ms >= Date.UTC(ej, 0, 1)).sort((a, b) => a.ms - b.ms);
    /* FIFO hasta el último periodo: lo que queda sin liquidar de cada ejercicio anterior */
    const corte = Date.UTC(ej, A.R.m1, 1), capas = [];
    movs.filter((l) => l.ms < corte).sort((a, b) => a.ms - b.ms).forEach((l) => {
      let x = vmov(l); if (!x) return; const y = new Date(l.ms).getUTCFullYear();
      while (x && capas.length && Math.sign(capas[0].v) !== Math.sign(x)) { const cp = capas[0]; if (Math.abs(cp.v) <= Math.abs(x)) { x = r2(x + cp.v); capas.shift(); } else { cp.v = r2(cp.v + x); x = 0; } }
      if (x) capas.push({ y, v: x, l });
    });
    const porAnio = {}; capas.filter((cp) => cp.y < ej).forEach((cp) => { const o = porAnio[cp.y] = porAnio[cp.y] || { v: 0, L: [] }; o.v = r2(o.v + cp.v); o.L.push(cp.l); });
    const anios = Object.keys(porAnio).sort().filter((y) => Math.abs(porAnio[y].v) > TOL);
    let acum = 0; const filAnt = anios.map((y) => { const o = porAnio[y]; acum = r2(acum + o.v); return { p: `ANT${y}`, y, saldo: null, imp: null, varM: o.v, dif: acum, an: `Saldo de ${y} sin liquidar: ${o.L.slice(0, 4).map(txtMov).join(', ')}${o.L.length > 4 ? '…' : ''}` }; });
    let ant = null; const ini = acum;
    const filas = pers.map((p) => {
      const D = CM[p], f = D && D.filas.find((x) => x.k === k); if (!f) return null; const [a, b] = rngPer(ej, p), L = ejL.filter((l) => l.ms >= a && l.ms < b);
      const mov = r2(L.reduce((s, l) => s + vmov(l), 0)), dif = f.imp === null ? null : r2(f.saldo - f.imp), varM = dif === null ? null : r2(dif - (ant === null ? ini : ant)); if (dif !== null) ant = dif;
      let an = '';
      if (f.imp === null) an = 'Sin declaración en Impuestos Presentados para este periodo';
      else if (Math.abs(varM) > TOL) {
        const x = descuadreMensual(f, D.R, L, TOL, p), uno = L.find((l) => Math.abs(vmov(l) - varM) <= TOL);
        let par = null; if (!uno) { const LL = L.slice(0, 300); for (let i2 = 0; i2 < LL.length && !par; i2++) for (let j = i2 + 1; j < LL.length; j++) if (Math.abs(vmov(LL[i2]) + vmov(LL[j]) - varM) <= TOL) { par = [LL[i2], LL[j]]; break; } }
        an = `La diferencia varía ${money(varM)} en el mes: ${x || (uno ? `la origina el ${txtMov(uno)}` : par ? `la originan el ${txtMov(par[0])} y el ${txtMov(par[1])}` : (L.length ? `ningún asiento coincide; asientos del mes: ${L.slice(0, 6).map(txtMov).join(', ')}${L.length > 6 ? '…' : ''}` : 'la cuenta no tiene movimientos en el mes: la diferencia es del impuesto declarado'))}`;
      }
      return { p, mov, saldo: f.saldo, imp: f.imp, dif, varM, an };
    }).filter(Boolean);
    filas.unshift(...filAnt);
    const g = (x) => (x === null || x === undefined ? '-' : money(x));
    return `<table class="aud mov it-t adif-m"><thead><tr><th>Mes</th><th>Saldo a fin de mes</th><th>Impuesto declarado</th><th class="adif-d">Variación en el mes</th><th class="adif-d">Diferencia</th><th>Análisis del mes</th></tr></thead><tbody>${filas.map((r) => { const ko = r.varM !== null && Math.abs(r.varM) > TOL;
      return `<tr class="${ko ? 'cf-ko' : ''}"><td>${r.y ? `Ejercicio ${r.y}` : esc(nomP(r.p))}</td><td class="n">${r.saldo === null ? '-' : money(r.saldo)}</td><td class="n">${g(r.imp)}</td><td class="n adif-d">${g(r.varM)}</td><td class="n adif-d ${r.dif !== null && Math.abs(r.dif) > TOL ? 'dif-ko' : 'dif-ok'}"><b>${g(r.dif)}</b></td><td class="adif-an">${r.an ? esc(r.an) : '<span style="color:#1a7f37">✓ Sin variación</span>'}</td></tr>`; }).join('')}</tbody></table>`;
  }
  function adifCausa(dec, con, d, ctx) {
    if (dec === null || dec === undefined) return 'Falta la declaración en Impuestos Presentados';
    if (!con) return `Declarado sin nada en contabilidad / libros en el periodo${ctx && ctx.fuente ? ` (${ctx.fuente})` : ''}`;
    if (!dec) return 'Contabilizado y no declarado';
    if (ctx && ctx.lineas) {
      const L = ctx.lineas, a = Math.abs(d), u = L.find((l) => Math.abs(Math.abs(+l.v) - a) <= 0.02); if (u) return `La diferencia coincide con ${u.txt}`;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.abs(Math.abs((+L[i].v) + (+L[j].v)) - a) <= 0.02) return `La diferencia coincide con ${L[i].txt} + ${L[j].txt}`;
    }
    if ((con ? Math.abs(d / con) * 100 : 0) < 0.5) return 'Diferencia pequeña (redondeos o céntimos por línea)';
    return d > 0 ? 'Se ha declarado más de lo contabilizado' : 'Se ha declarado menos de lo contabilizado';
  }
  function calcAdif(M) {
    const ej = ejNum(), trim = esTrim();
    /* hasta el último periodo presentado del ejercicio (303/111/115): así la cuenta se cuadra con lo declarado a esa fecha */
    const reg = S.registros.find((r) => r.tipo === 'prs' && r.empresa_id === S.sel && r.ejercicio === ej)?.datos ?? {};
    const ps = Object.keys(reg).filter((k) => /^(303|111|115)\|/.test(k) && Object.values(reg[k] || {}).some((v) => v !== null && v !== undefined && v !== '')).map((k) => k.split('|')[1])
      .filter((x) => (trim ? /^[1-4]T$/.test(x) : /^\d\d$/.test(x))).sort();
    const PER = ps.length ? ps[ps.length - 1] : '';
    const R = rangoConc(PER), out = { ej, R, mods: [] }, perTxt = (p) => (/T$/.test(p) ? `${p} ${ej}` : `${MES_L[+p - 1] || p} ${ej}`);
    const sop = conFecha(lib('fact-R')).map((l) => ({ ...l, ret: -(+l.cuota || 0) + 0 }));
    const pers = []; for (let i = 1; i <= R.m1; i++) { if (trim) { if (i % 3 === 0) pers.push(`${i / 3}T`); } else pers.push(String(i).padStart(2, '0')); }
    const CM = {}; let CONC = null;
    if (M && M.length) { CONC = calcConc(M, PER); pers.forEach((p) => { try { CM[p] = calcConc(M, p); } catch { /* periodo sin datos */ } }); }
    out.ctasMes = CM; out.pers = pers;
    if (CONC) out.ctas = CONC.filas.filter((f) => !concSinImp(f.k)).map((f) => { const X = explicaDifCuenta(f, CONC.R, M); return { k: f.k, tipo: 'cta', txt: `Cta ${f.cuenta.split(',')[0]} · ${f.nombre}`, modelo: f.modelo, dec: f.imp, con: f.saldo, d: f.imp === null ? null : f.dif, ejD: f.imp === null ? 0 : X.difEj, antD: f.imp === null ? 0 : X.pend, causa: X.texto }; });
    // 303 y 349 de cada mes del periodo (mismo cálculo que los modelos); null si faltan los libros
    const RE = lib('fact-E') ?? [], mesesDe = (p) => (/T$/.test(p) ? [0, 1, 2].map((i) => (+p[0] - 1) * 3 + i + 1) : [+p]);
    const fmCache = {}, fm = (p) => fmCache[p] ??= mesesDe(p).map((x) => { try { const pp = String(x).padStart(2, '0'); return { mes: x, C3: calc303(RE, lib('fact-R') ?? [], ej, pp), K: calc349(RE, lib('fact-R') ?? [], ej, pp) }; } catch { return null; } }).filter(Boolean);
    const it = extra?.intra(ej), c583 = extra?.tiene583() ? extra.c583(ej) : null, c592 = extra?.tiene592() ? extra.c592(ej, '') : null;
    const lista = ['111', '115', '123', '200', '202', '303', '349'].concat(c583 ? ['583'] : []).concat(c592 ? ['592'] : []);
    lista.forEach((m) => {
      const filas = [], add = (o) => filas.push(o);
      /* 1) cuenta contable frente al modelo: el saldo arrastrado indica lo que viene de ejercicios anteriores */
      if (CONC) CONC.filas.filter((f) => new RegExp(`MODELO ${m}\\b`).test(f.modelo || '')).forEach((f) => {
        if (Math.abs(f.dif) <= MARGEN) { add({ tipo: 'cta', txt: `Cta ${f.cuenta.split(',')[0]} · ${f.nombre}`, per: `a ${fdate(R.hasta)}`, dec: f.imp, con: f.saldo, d: 0, ejD: 0, antD: 0, causa: 'Cuadra' }); return; }
        const X = explicaDifCuenta(f, CONC.R, M);
        add({ tipo: 'cta', txt: `Cta ${f.cuenta.split(',')[0]} · ${f.nombre}`, per: `a ${fdate(R.hasta)}`, dec: f.imp, con: f.saldo, d: f.imp === null ? null : f.dif, ejD: f.imp === null ? 0 : X.difEj, antD: f.imp === null ? 0 : X.pend, causa: X.texto });
      });
      /* 2) declarado frente a contabilidad / libros, periodo a periodo */
      if (/^(111|115|123)$/.test(m)) {
        try {
          const A = calcAudi(m), C = m === '111' ? [['1', 'Rdtos. trabajo · base', 'Nóminas'], ['2', 'Rdtos. trabajo · retenciones', 'Nóminas'], ['3', 'Profesionales · base', 'Libro de recibidas I.PR'], ['4', 'Profesionales · retenciones', 'Libro de recibidas I.PR']]
            : [['1', 'Base', m === '115' ? 'Libro de recibidas I.ALQ' : 'Libro de recibidas I.DV y cuenta 4751.04'], ['2', 'Retenciones', m === '115' ? 'Libro de recibidas I.ALQ' : 'Cuenta 4751.04']];
          A.filas.filter((f) => !f.tot && pers.includes(f.per)).forEach((f) => C.forEach(([j, t, fu]) => {
            const d = f[`d${j}`]; if (d === undefined || Math.abs(d) <= MARGEN_RET) return; const [a, b] = rngPer(ej, f.per);
            const rxc = new RegExp(`^${m === '111' ? 'I\\.PR' : m === '115' ? 'I\\.ALQ' : 'I\\.DV'}`);
            const L = /I\.PR|I\.ALQ|I\.DV/.test(fu) ? sop.filter((l) => en(l, a, b) && rxc.test(l.codigo || '')).map((l) => { const v = /reten/i.test(t) ? Math.abs(+l.ret || 0) : +l.base || 0; return { v, txt: `la factura ${l.factura || ''} de ${l.nombre || ''} (${money(v)})` }; }) : null;
            const dec = pv(ej, m, f.per, j === '1' ? 'base' : j === '2' ? (m === '111' ? 'retN' : 'ret') : j === '3' ? 'baseP' : 'retP');
            add({ tipo: 'per', txt: t, per: perTxt(f.per), dec: dec === null ? null : f[`c${j}`], con: f[`k${j}`], d: dec === null ? null : d, ejD: dec === null ? 0 : d, antD: 0, causa: adifCausa(dec === null ? null : f[`c${j}`], f[`k${j}`], d, { lineas: L, fuente: fu }) });
          }));
        } catch { /* sin datos del modelo */ }
      }
      if (m === '303') {
        try {
          const A = calcAudi303();
          A.filas.filter((f) => !f.tot && pers.includes(f.per)).forEach((f) => [['e', 'Emitidas · cuota SII frente a libro'], ['r', 'Recibidas · cuota SII frente a libro']].forEach(([t, txt]) => {
            const s = f[t].s.c, k = t === 'e' ? f[t].k.c : f[t].t.c; if (!s && !(f[t].s.b)) return; const d = r2(s - k); if (Math.abs(d) <= MARGEN) return;
            add({ tipo: 'per', txt, per: perTxt(f.per), dec: s, con: k, d, ejD: d, antD: 0, causa: d > 0 ? 'Más cuota en el SII que en el libro: facturas en el SII que no están en el libro del periodo (o fecha distinta)' : 'Más cuota en el libro que en el SII: facturas sin enviar al SII o enviadas en otro periodo' });
          }));
        } catch { /* sin datos del SII */ }
        if (!trim) pers.forEach((p) => {
          const res = pv(ej, '303', p, 'res'); if (res === null) return; const F = fm(p); if (!F.length) return;
          const calc = r2(F.reduce((s, x) => s + x.C3.c46 + x.C3.c77 - x.C3.c78, 0)), d = r2(res - calc); if (Math.abs(d) <= MARGEN) return;
          add({ tipo: 'per', txt: 'Resultado (46 + IVA diferido 77 − compensado 78) presentado frente a calculado', per: perTxt(p), dec: res, con: calc, d, ejD: d, antD: 0, causa: 'Facturas registradas en el libro después de presentar o reclasificadas; compara la pestaña Modelo 303 del periodo con lo presentado' });
        });
      }
      if (m === '349') {
        try {
          pers.forEach((p) => {
            const F = fm(p); if (!F.length) return;
            const cl = (k) => r2(F.reduce((s, x) => s + ((x.K.porClave.find((y) => y.clave === k) || {}).importe || 0), 0)), e = cl('E'), a = cl('A');
            const c59 = r2(F.reduce((s, x) => s + x.C3.G.entregas.base, 0)), itE = it ? r2(F.reduce((s, x) => s + it(x.mes, 'Expedición'), 0)) : null, itI = it ? r2(F.reduce((s, x) => s + it(x.mes, 'Introducción'), 0)) : null;
            const pe = pv(ej, '349', p, 'E');
            if (Math.abs(c59 - e) > MARGEN) add({ tipo: 'per', txt: '303 casilla 59 frente a 349 clave E', per: perTxt(p), dec: c59, con: e, d: r2(c59 - e), ejD: r2(c59 - e), antD: 0, causa: 'Entregas intracomunitarias en el 303 que el 349 no recoge (o al revés): revisa NIF intracomunitario y clave de cada factura' });
            if (itE !== null && (itE || itI)) {
              if (Math.abs(e - itE) > 1) add({ tipo: 'per', txt: '349 clave E frente a Intrastat', per: perTxt(p), dec: e, con: itE, d: r2(e - itE), ejD: r2(e - itE), antD: 0, causa: 'Servicios o portes en facturas de bienes, abonos declarados en el otro flujo o facturas fuera de plazo; detalle por factura en Conciliación 349 - Intrastat' });
              if (Math.abs(a - itI) > 1) add({ tipo: 'per', txt: '349 clave A frente a Intrastat', per: perTxt(p), dec: a, con: itI, d: r2(a - itI), ejD: r2(a - itI), antD: 0, causa: 'Adquisiciones sin Intrastat (servicios, umbral) o al revés; detalle en Conciliación 349 - Intrastat' });
            }
            if (pe !== null && Math.abs(pe - e) > MARGEN) add({ tipo: 'per', txt: '349 clave E presentado frente a calculado', per: perTxt(p), dec: pe, con: e, d: r2(pe - e), ejD: r2(pe - e), antD: 0, causa: 'Facturas añadidas o reclasificadas después de presentar' });
          });
        } catch { /* sin datos del 349 */ }
      }
      if (m === '583' && c583) {
        c583.pers.filter((p) => p !== '0A').forEach((p) => {
          const v = pv(ej, '583', p, 'res'), cc = c583.tot(p);
          if (v === null) { if (cc) add({ tipo: 'per', txt: `583 · ${p}`, per: `${p} ${ej}`, dec: null, con: cc, d: null, ejD: 0, antD: 0, causa: `Calculado ${money(cc)} sin declaración en Impuestos Presentados` }); return; }
          const d = r2(v - cc); if (Math.abs(d) > MARGEN) add({ tipo: 'per', txt: `583 · ${p}`, per: `${p} ${ej}`, dec: v, con: cc, d, ejD: d, antD: 0, causa: 'Retribuciones del trimestre distintas a las declaradas o minoración de la base no aplicada' });
        });
      }
      if (m === '592' && c592) {
        ['1T', '2T', '3T', '4T'].filter((p) => R.m1 >= +p[0] * 3).forEach((p) => {
          const L592 = extra.c592(ej, p); if (!L592) return; const cc = L592.res, v = pv(ej, '592', p, 'res');
          if (v === null) { if (cc) add({ tipo: 'per', txt: `592 · ${p}`, per: `${p} ${ej}`, dec: null, con: cc, d: null, ejD: 0, antD: 0, causa: `Calculado ${money(cc)} sin declaración en Impuestos Presentados` }); return; }
          const d = r2(v - cc); if (Math.abs(d) > MARGEN) add({ tipo: 'per', txt: `592 · ${p}`, per: `${p} ${ej}`, dec: v, con: cc, d, ejD: d, antD: 0, causa: 'Kilos de plástico no reciclado distintos a los declarados o deducciones/compensaciones no recogidas' });
        });
      }
      if (m === '202') { [['1P', 4], ['2P', 10], ['3P', 12]].filter(([, mm]) => R.m1 >= mm).forEach(([p]) => { const v = pv(ej, '202', p, 'res'); if (v === null) add({ tipo: 'per', txt: `Pago fraccionado ${p}`, per: `${p} ${ej}`, dec: null, con: null, d: 0, ejD: 0, antD: 0, causa: 'No está en Impuestos Presentados: la cuenta 4730.05 no se puede cuadrar con ese pago' }); }); }
      if (m === '200') { const v = pv(ej - 1, '200', 'A', 'res'); if (v === null) add({ tipo: 'per', txt: `Modelo 200 del ejercicio ${ej - 1}`, per: String(ej - 1), dec: null, con: null, d: 0, ejD: 0, antD: 0, causa: `No está en Impuestos Presentados: las cuentas 4709/4752 de ${ej} se cuadran con el 200 de ${ej - 1}` }); }
      /* resumen anual por concepto: se suman los periodos y el desglose dice en qué periodos está la diferencia */
      const G = new Map();
      filas.forEach((f) => {
        if (f.tipo !== 'per') { G.set(`cta|${G.size}`, f); return; }
        const k = `per|${f.txt}`, g = G.get(k);
        if (!g) { G.set(k, Object.assign({}, f, { per: `Ejercicio ${ej}`, partes: [f] })); return; }
        g.partes.push(f); ['con', 'ejD', 'antD'].forEach((cc) => { g[cc] = r2((+g[cc] || 0) + (+f[cc] || 0)); });
        g.dec = g.dec === null || f.dec === null ? (g.dec === null && f.dec === null ? null : r2((+g.dec || 0) + (+f.dec || 0))) : r2(g.dec + f.dec);
        g.d = g.d === null && f.d === null ? null : r2((+g.d || 0) + (+f.d || 0));
      });
      filas.length = 0;
      G.forEach((g) => {
        if (g.partes && g.partes.length) {
          const P = g.partes.filter((x) => x.d === null || Math.abs(x.d) > MARGEN || x.dec === null), cs = [...new Set(P.map((x) => x.causa))];
          g.causa = P.length ? `Por periodos: ${P.map((x) => `${x.per.replace(` ${ej}`, '').toLowerCase()} ${x.dec === null || x.d === null ? 'sin declarar' : money(x.d)}`).join(' · ')}. ${cs.join(' · ')}` : g.causa;
          g.sinDec = P.some((x) => x.dec === null); if (g.sinDec && g.d !== null && P.every((x) => x.dec === null)) g.d = null; delete g.partes;
        }
        filas.push(g);
      });
      const conDif = filas.filter((f) => f.d !== null && Math.abs(f.d) > MARGEN);
      out.mods.push({ m, filas, conDif, ejD: r2(conDif.reduce((s, f) => s + (f.ejD || 0), 0)), antD: r2(conDif.reduce((s, f) => s + (f.antD || 0), 0)), aviso: filas.filter((f) => f.dec === null && f.d !== 0).length });
    });
    return out;
  }
  /* 111 · 115 · 123: mes a mes, lo presentado (base y retenciones) frente a lo contabilizado (facturas recibidas, nóminas y cuentas 4751) */
  function adifMensual(m, M) {
    const ej = ejNum(), trim = esTrim(), sop = conFecha(lib('fact-R')).map((l) => ({ ...l, ret: -(+l.cuota || 0) + 0 }));
    const pers = trim ? ['1T', '2T', '3T', '4T'] : Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const nomP = (p) => (/T$/.test(p) ? `${MES_L[(+p[0] - 1) * 3].slice(0, 3)}-${MES_L[+p[0] * 3 - 1].slice(0, 3)}` : MES_L[+p - 1]);
    const P = (cc, p) => pv(ej, m, p, cc);
    const CT = ctasEmpresa(empresa()), kOf = (cta) => Object.keys(CT).find((k) => CT[k].cta === cta);
    const cta = (ct, codes, p) => { const k = kOf(ct); if (!k || !M) return null; const [a, b] = rngPer(ej, p); return r2(movsK(k, M).filter((l) => en(l, a, b) && codes.includes(tipoMov(k, l))).reduce((s, l) => s + (+l.haber || 0) - (+l.debe || 0), 0)); };
    const fac = (rx, campo, p) => { const [a, b] = rngPer(ej, p); const L = sop.filter((l) => en(l, a, b) && rx.test(l.codigo || '')); return { v: r2(Math.abs(L.reduce((s, l) => s + (campo === 'ret' ? (+l.ret || 0) : (+l.base || 0)), 0)) * (campo === 'ret' ? 1 : Math.sign(L.reduce((s, l) => s + (+l.base || 0), 0)) || 1)), L }; };
    const nom = (p) => { const ms = /T$/.test(p) ? [0, 1, 2].map((i) => String((+p[0] - 1) * 3 + i + 1).padStart(2, '0')) : [p]; const ns = ms.map((mm) => nomMes(ej, mm)).filter(Boolean); return { salarios: ns.reduce((s, x) => s + (+x.salarios || 0), 0), ret: ns.reduce((s, x) => s + (+x.ret || 0), 0) }; };
    const prof47512 = !!CT.c47513;
    let C = [];
    if (m === '111') C = [
      { t: 'Base nóminas', pres: (p) => P('base', p), cont: [['Nóminas', (p) => r2(nom(p).salarios)]] },
      { t: 'Retenciones nóminas', pres: (p) => P('retN', p), cont: [['Cta 4751.01 (N)', (p) => cta('4751.01', ['N'], p)], ['Nóminas', (p) => r2(nom(p).ret)]] },
      { t: 'Base profesionales', pres: (p) => P('baseP', p), cont: [['Facturas recibidas', (p) => fac(/^I\.PR/, 'base', p).v]], lin: (p) => fac(/^I\.PR/, 'base', p).L, campo: 'base' },
      { t: 'Retenciones profesionales', pres: (p) => P('retP', p), cont: [['Facturas recibidas', (p) => fac(/^I\.PR/, 'ret', p).v], [prof47512 ? 'Cta 4751.02' : `Cta 4751.01 (${empresa()?.siglas ?? ''})`, (p) => (prof47512 ? cta('4751.02', ['S'], p) : cta('4751.01', ['S'], p))]], lin: (p) => fac(/^I\.PR/, 'ret', p).L, campo: 'ret' }];
    else if (m === '115') C = [
      { t: 'Base alquileres', pres: (p) => P('base', p), cont: [['Facturas recibidas', (p) => fac(/^I\.ALQ/, 'base', p).v]], lin: (p) => fac(/^I\.ALQ/, 'base', p).L, campo: 'base' },
      { t: 'Retenciones alquileres', pres: (p) => P('ret', p), cont: [['Facturas recibidas', (p) => fac(/^I\.ALQ/, 'ret', p).v], [prof47512 ? 'Cta 4751.03' : 'Cta 4751.02', (p) => cta(prof47512 ? '4751.03' : '4751.02', ['S'], p)]], lin: (p) => fac(/^I\.ALQ/, 'ret', p).L, campo: 'ret' }];
    else if (m === '303' || m === '349') {
      const RE = lib('fact-E') ?? [], RR = lib('fact-R') ?? [], FM = {};
      const fm = (p) => FM[p] ??= (/T$/.test(p) ? [0, 1, 2].map((i) => (+p[0] - 1) * 3 + i + 1) : [+p]).map((x) => { try { const pp = String(x).padStart(2, '0'); return { mes: x, C3: calc303(RE, RR, ej, pp), K: calc349(RE, RR, ej, pp) }; } catch { return null; } }).filter(Boolean);
      if (m === '303') C = [
        { t: 'IVA diferido importación (77)', pres: (p) => P('adu', p), cont: [['Calculado', (p) => r2(fm(p).reduce((s, x) => s + (+x.C3.c77 || 0), 0))]] },
        // lo presentado guardado como «Resultado IVA» es la casilla 46 (régimen general); el IVA diferido (77) y las cuotas aplicadas (78) se comparan aparte
        { t: 'Resultado (casilla 46)', pres: (p) => P('res', p), cont: [['Calculado (46)', (p) => r2(fm(p).reduce((s, x) => s + x.C3.c46, 0))]] }];
      else {
        const cl = (p, k) => r2(fm(p).reduce((s, x) => s + ((x.K.porClave.find((y) => y.clave === k) || {}).importe || 0), 0)), itf = extra?.intra(ej);
        const itv = (p, fl) => (itf ? r2(fm(p).reduce((s, x) => s + itf(x.mes, fl), 0)) : null);
        // hasta 2024 se presentó el abono de servicios prestados (S negativo) restado de las entregas (E); desde 2025 cada clave va por separado
        const viejo = ej <= 2024, clx = (x, k) => (x.K.porClave.find((y) => y.clave === k) || {}).importe || 0;
        const clE = (p) => (viejo ? r2(fm(p).reduce((s, x) => s + clx(x, 'E') + Math.min(0, clx(x, 'S')), 0)) : cl(p, 'E'));
        const clS = (p) => (viejo ? r2(fm(p).reduce((s, x) => s + Math.max(0, clx(x, 'S')), 0)) : cl(p, 'S'));
        C = [{ t: 'Entregas (E)', pres: (p) => P('E', p), cont: [[viejo ? '349 calculado (E − abonos de S)' : '349 calculado', clE], ['303 casilla 59', (p) => r2(fm(p).reduce((s, x) => s + x.C3.G.entregas.base, 0))], ['Intrastat expedición', (p) => itv(p, 'Expedición')]] },
          { t: 'Adquisiciones (A)', pres: (p) => P('A', p), cont: [['349 calculado', (p) => cl(p, 'A')], ['Intrastat introducción', (p) => itv(p, 'Introducción')]] },
          { t: 'Servicios prestados (S)', pres: (p) => P('S', p), cont: [[viejo ? '349 calculado (sin abonos)' : '349 calculado', clS]] },
          { t: 'Servicios adquiridos (I)', pres: (p) => P('I', p), cont: [['349 calculado', (p) => cl(p, 'I')]] }];
      }
    }
    else C = [
      { t: 'Base capital mobiliario', pres: (p) => P('base', p), cont: [['Contabilidad', (p) => { try { const f = calcAudi('123').filas.find((x) => x.per === p); return f ? f.k1 : 0; } catch { return 0; } }]] },
      { t: 'Retenciones capital mobiliario', pres: (p) => P('ret', p), cont: [['Cta 4751.04', (p) => cta('4751.04', ['S'], p)], ['Facturas recibidas', (p) => fac(/^I\.DV/, 'ret', p).v]], lin: (p) => fac(/^I\.DV/, 'ret', p).L, campo: 'ret' }];
    const T = C.map((cc) => ({ p: 0, c: cc.cont.map(() => 0), d: 0 })); let nDif = 0;
    /* desfase: lo contabilizado en meses sin declarar que aparece declarado en un mes posterior */
    const VP = C.map((cc) => pers.map((p) => cc.pres(p))), VC = C.map((cc) => pers.map((p) => cc.cont[0][1](p) || 0)), absorbe = C.map(() => ({}));
    C.forEach((cc, ci) => pers.forEach((p, pi) => {
      const pr = VP[ci][pi]; if (pr === null) return; const d = r2(pr - VC[ci][pi]); if (Math.abs(d) <= MARGEN_RET) return;
      let suma = 0; const ids = [];
      for (let k = pi - 1; k >= 0 && VP[ci][k] === null; k--) { if (!VC[ci][k]) continue; suma = r2(suma + VC[ci][k]); ids.unshift(k); if (Math.abs(d - suma) <= MARGEN_RET) { absorbe[ci][pi] = ids.slice(); ids.forEach((x) => { absorbe[ci][x] = pi; }); break; } }
    }));
    const filas = pers.map((p, pi) => {
      const ana = [];
      const celdas = C.map((cc, ci) => {
        const raw = cc.pres(p), pr = raw === null ? 0 : raw, cs = cc.cont.map((x) => x[1](p)), d = r2(pr - (cs[0] || 0)), ko = Math.abs(d) > MARGEN_RET;
        T[ci].p += pr || 0; cs.forEach((v, j) => { T[ci].c[j] += v || 0; }); T[ci].d += d || 0;
        const ab = absorbe[ci][pi];
        if (ko && raw === null) { nDif++; ana.push(`${cc.t} ${money(d)}: ${typeof ab === 'number' ? `no se declaró en su mes; se declaró en ${nomP(pers[ab]).toLowerCase()}` : 'sin presentar en Impuestos Presentados, contabilizado sin declarar'}`); }
        else if (ko && Array.isArray(ab)) { nDif++; ana.push(`${cc.t} ${money(d)}: incluye lo contabilizado en ${ab.map((x) => `${nomP(pers[x]).toLowerCase()} (${money(VC[ci][x])})`).join(' y ')}, que no se declaró en su mes. Desfase de periodo, el total cuadra`); }
        else if (ko) { nDif++; let causa = adifCausa(pr, cs[0], d, { lineas: cc.lin ? cc.lin(p).map((l) => ({ v: cc.campo === 'ret' ? Math.abs(+l.ret || 0) : +l.base || 0, txt: `la factura ${l.factura || ''} de ${l.nombre || ''}` })) : null });
          if (cs.length > 1 && cs[1] !== null && Math.abs(pr - cs[1]) <= MARGEN_RET) causa += ` (sí cuadra con ${cc.cont[1][0]})`; ana.push(`${cc.t} ${money(d)}: ${causa}`); }
        return `<td class="n">${money(pr)}</td>${cs.map((v) => `<td class="n">${v === null ? '-' : money(v)}</td>`).join('')}<td class="n adif-d ${ko ? 'dif-ko' : 'dif-ok'}"><b>${money(d)}</b></td>`;
      }).join('');
      return `<tr><td>${esc(nomP(p))}</td>${celdas}<td class="adif-an">${ana.length ? esc(ana.join(' · ')) : '<span style="color:#1a7f37">✓ Cuadra</span>'}</td></tr>`;
    }).join('');
    const cab1 = C.map((cc) => `<th colspan="${cc.cont.length + 2}">${esc(cc.t)}</th>`).join(''), cab2 = C.map((cc) => `<th>Presentado</th>${cc.cont.map((x) => `<th>${esc(x[0])}</th>`).join('')}<th class="adif-d">Diferencia</th>`).join('');
    const tot = `<tr class="tot200"><td>TOTAL ${ej}</td>${T.map((t, ci) => `<td class="n">${money(r2(t.p))}</td>${C[ci].cont.map((x, j) => `<td class="n">${money(r2(t.c[j]))}</td>`).join('')}<td class="n adif-d">${money(r2(t.d))}</td>`).join('')}<td></td></tr>`;
    return { html: `<div style="overflow-x:auto"><table class="aud mov it-t adif-m"><thead><tr><th rowspan="2">${trim ? 'Trimestre' : 'Mes'}</th>${cab1}<th rowspan="2">Análisis del mes</th></tr><tr>${cab2}</tr></thead><tbody>${filas}${tot}</tbody></table></div>`, nDif };
  }
  function vistaAdif() {
    if (!S.sel) return sinEmpresa;
    const M = lib('may-mov'); if (!M || !lib('fact-R') || !lib('fact-E') || !lib('sii-E') || !lib('sii-R')) return cargandoTxt;
    if ((extra?.tiene592() && extra.c592(ejNum(), '') === null) || (extra?.tiene583() && extra.c583(ejNum()) === null) || (extra && extra.intra(ejNum()) === null)) return cargandoTxt;
    const A = calcAdif(M), ej = A.ej, g = (v) => (v === null || v === undefined ? '-' : money(v));
    const MENS = /^(111|115|123|303|349)$/;
    A.mods.forEach((x) => { if (MENS.test(x.m)) x.mens = adifMensual(x.m, M); x.difs = x.filas.filter((f) => f.tipo !== 'cta' && !(x.mens && f.tipo === 'per') && f.d !== null && Math.abs(f.d) > MARGEN); x.avs = x.filas.filter((f) => f.tipo !== 'cta' && !x.mens && f.dec === null).length; });
    const res = `<table class="aud mov it-t" style="width:auto"><thead><tr><th>Modelo</th><th>Diferencias</th><th>Del ejercicio ${ej}</th><th>De ejercicios anteriores</th><th>Estado</th></tr></thead><tbody>${A.mods.map((x) => {
      const n = x.difs.length, ejD = r2(x.difs.reduce((s, f) => s + (f.ejD || 0), 0)), antD = r2(x.difs.reduce((s, f) => s + (f.antD || 0), 0)), nm = x.mens ? x.mens.nDif : 0, n2 = n + nm, av2 = x.avs;
      return `<tr class="${n2 ? 'cf-ko' : av2 ? '' : 'cf-ok'}"><td><a href="#adif-${x.m}">Modelo ${x.m}</a></td><td class="c">${n2 || '-'}</td><td class="n">${n ? money(ejD) : '-'}</td><td class="n">${n && antD ? money(antD) : '-'}</td><td>${n2 ? `✖ ${n2} diferencia(s)${nm ? ` (${nm} en meses)` : ''}` : av2 ? '• falta información' : '✓ Cuadra'}</td></tr>`; }).join('')}
      ${A.ctas ? (() => { const k = A.ctas.filter((f) => f.d !== null && Math.abs(f.d) > 1), e = r2(k.reduce((s, f) => s + (f.ejD || 0), 0)), a = r2(k.reduce((s, f) => s + (f.antD || 0), 0)); return `<tr class="${k.length ? 'cf-ko' : 'cf-ok'}"><td><a href="#adif-ctas">Cuentas contables</a></td><td class="c">${k.length || '-'}</td><td class="n">${k.length ? money(e) : '-'}</td><td class="n">${a ? money(a) : '-'}</td><td>${k.length ? `✖ ${k.length} cuenta(s) descuadrada(s)` : '✓ Cuadran'}</td></tr>`; })() : ''}</tbody></table>`;
    const det = A.mods.map((x) => {
      const MM = x.mens, F = x.filas.filter((f) => f.tipo !== 'cta' && !MM && (f.d === null || Math.abs(f.d) > MARGEN || f.dec === null));
      if (MM) return `<section class="block" id="adif-${x.m}"><h3 class="bt">Modelo ${x.m} · ejercicio ${ej} · presentado frente a contabilizado, mes a mes</h3>${MM.html}</section>`;
      return `<section class="block" id="adif-${x.m}"><h3 class="bt">Modelo ${x.m} · ejercicio ${ej}</h3>${F.length ? `<table class="aud mov it-t"><thead><tr><th>Concepto</th><th>Periodo</th><th>Declarado / impuesto</th><th>Contabilidad / libros</th><th>Diferencia</th><th>Del ejercicio</th><th>De ejercicios anteriores</th><th>Por qué se produce y desglose</th></tr></thead><tbody>
        ${F.map((f) => `<tr class="${f.d && Math.abs(f.d) > MARGEN ? 'cf-ko' : ''}"><td>${esc(f.txt)}</td><td class="c">${esc(f.per)}</td><td class="n">${g(f.dec)}</td><td class="n">${g(f.con)}</td><td class="n"><b>${g(f.d)}</b></td><td class="n">${f.ejD ? money(f.ejD) : '-'}</td><td class="n">${f.antD ? money(f.antD) : '-'}</td><td style="white-space:normal;min-width:320px">${esc(f.causa)}</td></tr>`).join('')}</tbody></table>` : '<p class="leyenda">✓ Sin diferencias en el periodo.</p>'}</section>`;
    }).join('');
    return `${bloqueAvisos([`Análisis del ejercicio ${ej} hasta el último periodo presentado (${fdate(A.R.hasta)}; no depende del periodo elegido): para cada modelo, la cuenta contable frente al impuesto (lo arrastrado antes del 01/01/${ej} es de ejercicios anteriores; el resto, del ejercicio) y lo declarado frente a la contabilidad y los libros, periodo a periodo, con la causa probable.`])}
      <section class="block"><h3 class="bt">Resumen por modelo</h3>${res}</section>${det}
      ${A.ctas ? `<section class="block" id="adif-ctas"><h3 class="bt">Cuentas contables que concilian impuestos · saldo a ${fdate(A.R.hasta)} · margen ±1 €</h3><table class="aud mov it-t"><thead><tr><th>Cuenta</th><th>Modelo</th><th>Impuesto</th><th>Saldo</th><th>Diferencia</th><th>Del ejercicio</th><th>De ejercicios anteriores</th><th>Estado</th></tr></thead><tbody>${A.ctas.map((f) => { const ko = f.d !== null && Math.abs(f.d) > 1; return `<tr class="${ko ? 'cf-ko' : ''}"><td>${esc(f.txt)}</td><td class="gris">${esc(f.modelo || '')}</td><td class="n">${g(f.dec)}</td><td class="n">${g(f.con)}</td><td class="n adif-d"><b>${g(f.d)}</b></td><td class="n">${f.ejD ? money(f.ejD) : '-'}</td><td class="n">${f.antD ? money(f.antD) : '-'}</td><td>${f.dec === null ? '• Sin declaración' : ko ? '<span style="color:#b42318">✖ No cuadra</span>' : '<span style="color:#1a7f37">✓ Cuadra</span>'}</td></tr>`; }).join('')}</tbody></table>
        ${A.ctas.filter((f) => f.d !== null && Math.abs(f.d) > 1).map((f) => `<h4 style="margin:18px 0 4px">${esc(f.txt)} · ${esc(f.modelo || '')} · diferencia ${money(f.d)}, mes a mes</h4>${adifCuentaMes(f.k, A, M)}`).join('')}</section>` : ''}`;
  }

  // ================= Certificados de retenciones (pdf-lib) =================
  const cargarPdfLib = () => (window.PDFLib ? Promise.resolve() : new Promise((ok, ko) => {
    const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    sc.onload = () => ok(); sc.onerror = () => ko(new Error('No se ha podido cargar el generador de PDF (revisa la conexión a internet)')); document.head.appendChild(sc);
  }));
  const datosPagador = () => {
    const E = empresa(), nif = String(E.cif || '');
    const cen = E.datos?.aeat?.censo ?? {}; // consulta censal de la AEAT (pestaña Datos Identificativos Censales)
    let razon = String(cen.razon || E.nombre || '').toUpperCase().trim();
    if (!/\bS\.?\s?[AL]\.?U?\.?$/.test(razon)) razon += /^A/.test(nif) ? ' S.A.' : /^B/.test(nif) ? ' S.L.' : '';
    return { nif, razon, muni: String(cen.fiscal?.municipio || cen.social?.municipio || E.datos?.municipio || 'GRANADA').toUpperCase(), hoy: new Date() };
  };
  const lim = (v) => String(v ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  function descargarPdf(bytes, nombre) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function certificadoRet(nifP) {
    const ej = String(ejNum()), L = rresLineas('rprof').filter((l) => (l.nif || '(sin NIF)') === nifP); if (!L.length) return;
    const nomP = String(L[0].nombre || '').toUpperCase(), { nif: nifE, razon, muni, hoy } = datosPagador();
    const agr = (l) => /I\.PR\.SR/.test(l.codigo || ''), sm = (LL, cc) => r2(LL.reduce((s, l) => s + Math.abs(+l[cc] || 0) * (cc === 'base' ? Math.sign(+l.base || 0) || 1 : 1), 0));
    const P = L.filter((l) => !agr(l)), A = L.filter(agr);
    try { await cargarPdfLib(); } catch (e) { alert(e.message); return; }
    const B64 = (await import('./cert111.js?v=1')).default;
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib, doc = await PDFDocument.load(Uint8Array.from(atob(B64), (ch) => ch.charCodeAt(0))), f = await doc.embedFont(StandardFonts.Helvetica), [p1, p2] = doc.getPages();
    const t = (p, x, y, v, dcha) => { v = lim(v); if (!v) return; const w = f.widthOfTextAtSize(v, 9); p.drawText(v, { x: dcha ? x - w : x, y, size: 9, font: f, color: rgb(0, 0, 0) }); };
    const imp = (v) => (Math.abs(v) < 0.005 ? '' : money(v));
    /* página 1: rendimientos del trabajo (sin importes) */
    t(p1, 532.31, 690.02, ej); t(p1, 533.98, 99.15, ej); t(p1, 35, 762.51, nifP); t(p1, 143.62, 762.84, nomP); t(p1, 34, 719.25, nifE); t(p1, 143.96, 719.92, razon);
    /* página 2: actividades económicas, fecha y firma */
    t(p2, 532.33, 695.9, ej); t(p2, 532.67, 392.38, ej); t(p2, 531.66, 180.09, ej); t(p2, 34.31, 762.96, nifP); t(p2, 143.64, 762.95, nomP); t(p2, 32.3, 719.04, nifE); t(p2, 142.42, 719.04, razon);
    if (P.length) { t(p2, 380.64, 646.6, imp(sm(P, 'base')), true); t(p2, 474.15, 646.27, imp(sm(P, 'ret')), true); }
    if (A.length) { t(p2, 380.64, 600.6, imp(sm(A, 'base')), true); t(p2, 474.15, 600.27, imp(sm(A, 'ret')), true); }
    t(p2, 43.19, 53.68, muni); t(p2, 350, 53.68, String(hoy.getDate())); t(p2, 393, 53.68, MES_L[hoy.getMonth()].toLowerCase()); t(p2, 526, 53.68, String(hoy.getFullYear())); t(p2, 79.98, 20.8, razon);
    doc.setTitle(`Certificado de retenciones ${ej} - ${lim(nomP)}`);
    descargarPdf(await doc.save(), `Certificado retenciones ${ej} - ${lim(nomP).replace(/[\\/:*?"<>|]/g, '')}.pdf`);
  }
  /* certificado de rendimientos del capital mobiliario (123 / 193): mismo estilo que el modelo de la AEAT, dibujado con pdf-lib */
  const ejercicioDividendo = (l) => { const t = [l.factura, l.desc, l.concepto].filter(Boolean).join(' '); const m = t.match(/(?:DIVIDEND\w*|BENEFICIO\w*|RESULTADO\w*|EJERCICIO|EJ\.?|A CUENTA)\D{0,25}(20\d{2})/i) || t.match(/\b(20\d{2})\b/); return m ? m[1] : null; };
  const periodoInteres = (l) => { const t = [l.factura, l.desc, l.concepto].filter(Boolean).join(' '), m = t.match(/(20\d{2})(\d{2})(\d{2})\D{1,3}(20\d{2})(\d{2})(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} a ${m[6]}/${m[5]}/${m[4]}` : null; };
  async function certificadoCap(nifP) {
    const ej = String(ejNum()), L = rresLineas('rint').filter((l) => (l.nif || '(sin NIF)') === nifP).sort((a, b) => a.ms - b.ms); if (!L.length) return;
    const nomP = String(L[0].nombre || '').toUpperCase(), { nif: nifE, razon, muni, hoy } = datosPagador();
    const sociedad = /^[A-HJNPQRSUVW]/.test(nifP), impuesto = sociedad ? 'Impuesto sobre Sociedades' : 'Impuesto sobre la Renta de las Personas Físicas';
    /* grupos: dividendos por ejercicio del beneficio; intereses por periodo */
    const G = new Map();
    L.forEach((l) => {
      const cd = l.codigo || '', dv = /^I\.DV/.test(cd), k = dv ? `D|${ejercicioDividendo(l) || ''}` : `I|${periodoInteres(l) || ''}`;
      const g = G.get(k) || { dv, ejB: dv ? ejercicioDividendo(l) : null, per: dv ? null : periodoInteres(l), exento: true, b: 0, r: 0, L: [] };
      g.b = r2(g.b + (+l.base || 0)); g.r = r2(g.r + Math.abs(+l.ret || 0)); if (cd !== 'I.DV.E' && Math.abs(+l.ret || 0) > 0.005) g.exento = false; g.L.push(l); G.set(k, g);
    });
    const grupos = [...G.values()].sort((a, b) => (a.dv === b.dv ? 0 : a.dv ? -1 : 1));
    try { await cargarPdfLib(); } catch (e) { alert(e.message); return; }
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib, doc = await PDFDocument.create(), fR = await doc.embedFont(StandardFonts.Helvetica), fB = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.addPage([595.28, 841.89]), K = rgb(0, 0, 0), GR = rgb(0.35, 0.35, 0.35);
    const T = (x, y, v, o = {}) => { v = lim(v); const f = o.b ? fB : fR, s = o.s || 9, w = f.widthOfTextAtSize(v, s); pg.drawText(v, { x: o.dcha ? x - w : o.centro ? x - w / 2 : x, y, size: s, font: f, color: o.c || K }); };
    const Rc = (x, y, w, h, g) => pg.drawRectangle({ x, y, width: w, height: h, borderColor: K, borderWidth: g || 0.8 });
    const caja = (x, y, w, v, o = {}) => { Rc(x, y, w, 13); if (v !== undefined && v !== '') T(o.dcha ? x + w - 3 : x + 3, y + 3.4, v, { dcha: o.dcha }); };
    const seccion = (y, h, tit) => { Rc(30, y - h, 535, h); const w = fB.widthOfTextAtSize(tit, 9) + 26; pg.drawRectangle({ x: 40, y: y - 6, width: w, height: 13, color: rgb(1, 1, 1), borderColor: K, borderWidth: 0.8 }); T(46, y - 2.6, `•  ${tit}`, { b: 1 }); };
    let y = 800; Rc(30, y - 6, 535, 26, 1.6); T(297.6, y + 2, `Certificado de retenciones e ingresos a cuenta del ${impuesto}`, { b: 1, s: sociedad ? 11.5 : 10.8, centro: 1 }); y -= 30;
    seccion(y, 42, 'Datos del perceptor'); T(36, y - 17, 'NIF', { s: 5.5, c: GR }); T(143, y - 17, 'Apellidos y nombre, denominación o razón social', { s: 5.5, c: GR }); caja(34, y - 32, 100, nifP); caja(141, y - 32, 418, nomP); y -= 52;
    seccion(y, 42, 'Datos de la entidad pagadora'); T(36, y - 17, 'NIF', { s: 5.5, c: GR }); T(143, y - 17, 'Denominación o razón social', { s: 5.5, c: GR }); caja(34, y - 32, 100, nifE); caja(141, y - 32, 418, razon); y -= 56;
    Rc(30, y - 20, 330, 24, 1.6); T(36, y - 12, 'Rendimientos del capital mobiliario', { b: 1, s: 10 }); Rc(370, y - 20, 195, 24, 1.6); T(375, y - 12, 'Datos correspondientes al ejercicio', { b: 1, s: 8.4 }); caja(526, y - 17, 35, ej); y -= 36;
    /* claves del modelo 193 (tipo de percepción 1 dineraria · clave código 1: el código emisor es un NIF) */
    const fisica = !sociedad, CL = { A: 'A - Rendimientos o rentas obtenidas por la participación en los fondos propios de cualquier entidad.',
      B: 'B - Rendimientos o rentas obtenidos por la cesión a terceros de capitales propios cuando no corresponden a la clave D.',
      D: 'D - Rendimientos o rentas obtenidos por la cesión a terceros de capitales propios procedentes de entidades vinculadas cuando el perceptor sea contribuyente del IRPF.' };
    const NAT = { A02: '02 - Dividendos y participaciones en beneficios en cualquier tipo de entidad cuando no proceda la naturaleza 07 ni 08.', A08: '08 - Dividendos y participaciones en beneficios no sometidos a retención o ingreso a cuenta.',
      B03: '03 - Intereses de préstamos no bancarios.', D03: '03 - Intereses de préstamos no bancarios.' };
    grupos.forEach((g) => { g.clave = g.dv ? 'A' : (fisica ? 'D' : 'B'); g.nat = g.dv ? (g.exento ? '08' : '02') : '03';
      g.claves = [`Clave de percepción: ${CL[g.clave]}`, `Naturaleza: ${NAT[g.clave + g.nat]}`, 'Tipo de percepción: 1 - Dinerarias.', 'Clave código: 1 - El código emisor corresponde a un NIF.']; });
    const partir = (v, ancho, sz) => { const out = []; let lin = ''; String(v).split(' ').forEach((w) => { const t = lin ? `${lin} ${w}` : w; if (fR.widthOfTextAtSize(lim(t), sz) > ancho && lin) { out.push(lin); lin = w; } else lin = t; }); if (lin) out.push(lin); return out; };
    grupos.forEach((g) => { g.lineasClaves = g.claves.flatMap((cl) => partir(cl, 515, 7.2)); });
    const altoG = (g) => 34 + (g.L.length * 12) + (g.exento ? 12 : 0) + 8 + g.lineasClaves.length * 9.5;
    const hDet = 30 + grupos.reduce((s, g) => s + altoG(g) + 18, 0); seccion(y, hDet, 'Detalle de las percepciones y de las retenciones e ingresos a cuenta'); y -= 22;
    for (const g of grupos) {
      T(36, y, g.dv ? 'Rendimientos obtenidos por la participación en fondos propios de entidades (dividendos y participaciones en beneficios)' : 'Rendimientos obtenidos por la cesión a terceros de capitales propios (intereses)', { b: 1, s: 8.6 }); y -= 12;
      T(36, y, g.dv ? `Ejercicio al que corresponden los beneficios distribuidos: ${g.ejB || 'no indicado'}` : `Periodo de devengo: ${g.per || 'no indicado'} · ejercicio de percepción ${ej}`, { s: 8.5 });
      T(392, y + 1, 'Importe íntegro satisfecho', { s: 5.5, c: GR }); T(486, y + 1, 'Retenciones practicadas', { s: 5.5, c: GR }); y -= 16;
      T(42, y + 3.4, `Contraprestaciones dinerarias ${'.'.repeat(70)}`, { s: 8, c: GR }); caja(365, y, 110, money(g.b), { dcha: 1 }); caja(482, y, 80, money(g.r), { dcha: 1 }); y -= 6;
      for (const l of g.L) { y -= 12; T(48, y, `${fdate(l.ms)}   ${lim(l.factura || '')}`, { s: 7.5, c: GR }); T(470, y, money(+l.base || 0), { s: 7.5, c: GR, dcha: 1 }); T(559, y, money(Math.abs(+l.ret || 0)), { s: 7.5, c: GR, dcha: 1 }); }
      if (g.exento) { y -= 12; T(48, y, 'Exento de retención: dividendos percibidos por una entidad con derecho a la exención del art. 21 de la Ley del Impuesto sobre Sociedades', { s: 7.5 }); }
      y -= 6; const h = g.lineasClaves.length * 9.5 + 6; pg.drawRectangle({ x: 40, y: y - h, width: 521, height: h, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      g.lineasClaves.forEach((tx, i) => T(45, y - 9 - i * 9.5, tx, { s: 7.2 })); y -= h;
      y -= 20;
    }
    y = Math.min(y, 170); seccion(y, 60, 'Fecha y firma'); y -= 18;
    T(36, y, `Para que conste y sirva de justificante al interesado, en cumplimiento de lo dispuesto en la normativa del ${impuesto}, se expide la presente`, { s: sociedad ? 7 : 6.6 }); y -= 18;
    T(36, y + 3.4, 'En', { s: 8 }); caja(48, y, 250, muni); T(306, y + 3.4, 'a', { s: 8 }); caja(316, y, 30, String(hoy.getDate())); T(352, y + 3.4, 'de', { s: 8 }); caja(366, y, 120, MES_L[hoy.getMonth()].toLowerCase()); T(492, y + 3.4, 'de', { s: 8 }); caja(506, y, 54, String(hoy.getFullYear())); y -= 12;
    Rc(36, y - 40, 250, 38); T(40, y - 9, 'Firma y sello de la entidad pagadora', { s: 5.5, c: GR }); T(40, y - 34, 'Fdo.: D. / D.ª', { s: 6, c: GR }); T(80, y - 34, razon, { s: 9 });
    T(559, y - 34, 'La presente certificación deberá ser firmada por el retenedor, su apoderado o su representante', { s: 5.5, c: GR, dcha: 1 });
    doc.setTitle(`Certificado de retenciones ${ej} - ${lim(nomP)}`);
    descargarPdf(await doc.save(), `Certificado retenciones capital mobiliario ${ej} - ${lim(nomP).replace(/[\\/:*?"<>|]/g, '')}.pdf`);
  }
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('[data-certcap],[data-certret]'); if (!a) return; ev.preventDefault();
    (a.dataset.certcap ? certificadoCap(a.dataset.certcap) : certificadoRet(a.dataset.certret)).catch((e) => alert(e.message));
  });

  // tipo de retención de la conciliación 123 (se guarda en el navegador por empresa, como en la aplicación antigua)
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t?.dataset?.audi123tipo) { const v = parseFloat(String(t.value).replace(',', '.')); if (v > 0) { lsSet('audi123tipo', v / 100); c.render(); } }
  });

  const pendiente = (t) => `<p class="vacio">${t}: esta pestaña de la aplicación antigua todavía no está portada.</p>`;
  const tabs = {
    au111: ['Conciliación 111', 'Mod. 111 vs contabilidad', () => vistaAudi('111')],
    au115: ['Conciliación 115', 'Mod. 115 vs contabilidad', () => vistaAudi('115')],
    au123: ['Conciliación 123', 'Mod. 123 vs contabilidad', () => vistaAudi('123')],
    au303: ['Conciliación 303', 'SII vs contabilidad', () => vistaAudi303()],
    conc: ['Conciliación Cuentas - Impuestos', 'Saldo frente a impuesto', () => vistaConc()],
    rprof: [RRES.rprof.tit, RRES.rprof.ts, () => vistaRetRes('rprof')],
    ralq: [RRES.ralq.tit, RRES.ralq.ts, () => vistaRetRes('ralq')],
    rint: [RRES.rint.tit, RRES.rint.ts, () => vistaRetRes('rint')],
    rsop: [RRES.rsop.tit, RRES.rsop.ts, () => vistaRetRes('rsop')],
    adif: ['Análisis Diferencias', 'Causa y origen por modelo', () => vistaAdif()],
  };
  const guard = (f) => () => { try { return f(); } catch { return null; } };
  const badges = {
    au111: guard(() => { if (!S.sel || !lib('fact-R')) return null; return insigniaEstado(estadoAudi(calcAudi('111'))); }),
    au115: guard(() => { if (!S.sel || !lib('fact-R')) return null; return insigniaEstado(estadoAudi(calcAudi('115'))); }),
    au123: guard(() => { if (!S.sel || !lib('fact-R') || !lib('may-mov')) return null; return insigniaEstado(estadoAudi(calcAudi('123'))); }),
    au303: guard(() => { if (!S.sel || !lib('fact-E') || !lib('fact-R') || !lib('sii-E') || !lib('sii-R')) return null; return insigniaEstado(estado303()); }),
    conc: guard(() => { if (!S.sel) return { t: 'Por empresa' }; const M = lib('may-mov'); return { t: M && M.length ? 'Con extracto' : 'Sin extracto' }; }),
    rprof: guard(() => (S.sel ? { t: rresChip('rprof') } : null)), ralq: guard(() => (S.sel ? { t: rresChip('ralq') } : null)),
    rint: guard(() => (S.sel ? { t: rresChip('rint') } : null)), rsop: guard(() => (S.sel ? { t: rresChip('rsop') } : null)),
  };
  return { tabs, badges };
}
