// Bloque 8 · conciliaciones fiscales portadas de la aplicación antigua (diseño y cálculo copiados; solo cambia la capa de datos).
// Datos: libros de IVA, SII y mayor llegan de `grande()`; lo presentado, de «Impuestos Presentados» (prsVal); las nóminas, de la pestaña Nóminas.
export function crearConciliaciones(c) {
  const { S, esc, empresa, grande, prsVal, nomPer, nomMes, ctaDe, ctaPref, ctaCfg, casaCta, ctasEmpresa, calcCuenta } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const money = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const nf2 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v ?? 0);
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
    for (let i = 0; i < nP; i++) {
      const per = trim ? `${i + 1}T` : String(i + 1).padStart(2, '0'), a = rngPer(ej, per).map((t) => new Date(t).toISOString().slice(0, 10));
      const f = { txt: trim ? TRN[i] : MESES[i], per, e: { s: o0(), t: o0(), a: o0(), k: o0() }, r: { s: o0(), t: o0(), a: o0(), k: o0() } };
      const dentro = (x, campo) => x[campo] >= a[0] && x[campo] < a[1];
      const libE = LE.filter((l) => dentro(l, 'ff') && !/^(R\.)?I\./.test(l.codigo) && l.codigo !== 'R.NAC.NS' && !/^R\.RC\./.test(l.codigo));
      f.e.t = suma(libE); f.e.a = suma(libE.filter((l) => AUTO_E.includes(l.codigo))); f.e.k = { b: r2(f.e.t.b - f.e.a.b), c: r2(f.e.t.c - f.e.a.c) };
      f.e.s = suma(SE.filter((s) => dentro(s, 'fecha')));
      f.r.t = suma(LR.filter((l) => dentro(l, 'fecha') && !/^I\./.test(l.codigo)));
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
  function rangoConc() {
    const ej = ejNum(), p = S.periodo ?? '';
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
  function calcConc(M) {
    const R = rangoConc(), corte = Date.UTC(R.ej, R.m1, 1), trim = esTrim(), CT = ctasEmpresa(empresa()), cfg = ctaCfg();
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
    c349i: ['Conciliación 349 · Intrastat', 'Intrastat vs contabilidad', () => pendiente('Conciliación 349 / Intrastat')],
    conc: ['Conciliación Cuentas - Impuestos', 'Saldo frente a impuesto', () => vistaConc()],
    rprof: [RRES.rprof.tit, RRES.rprof.ts, () => vistaRetRes('rprof')],
    ralq: [RRES.ralq.tit, RRES.ralq.ts, () => vistaRetRes('ralq')],
    rint: [RRES.rint.tit, RRES.rint.ts, () => vistaRetRes('rint')],
    rsop: [RRES.rsop.tit, RRES.rsop.ts, () => vistaRetRes('rsop')],
    adif: ['Análisis Diferencias', 'Causa y origen por modelo', () => pendiente('Análisis de diferencias')],
    cis: ['Cálculo Impto. Soc.', 'Desde sumas y saldos', () => pendiente('Cálculo del Impuesto sobre Sociedades')],
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
