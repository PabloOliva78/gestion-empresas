// Bloque 4 · modelo 200 (Impuesto sobre Sociedades desde el balance de sumas y saldos) y modelo 202 (pagos fraccionados),
// portados de la aplicación antigua: motor efCtx (balance de situación y PyG por partidas de la hoja EstFinan), calc200/vista200 y calc202/vista202.
// Datos en `registros`: m200x (ajustes a mano, un registro por empresa y ejercicio del 200) y m202 (casillas, datos adicionales y PyG por periodo, un registro por empresa).
import { casLiquidacion200 } from './pdf200.js?v=1';
import { EF_BAL,EF_PYG, EF_ND, EF_FALLBACK_DEU, EF_FALLBACK_ACR, EF_FALLBACK_PYG } from './efdatos.js?v=1';

export function crearModelos3(c) {
  const { db, S, esc, render, empresa, puede, grande, prsVal, casaCta } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 2 });
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const guion = (v) => (v === null || v === undefined || Math.abs(v) < 0.005 ? '-' : money(v));
  const parseNum = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const v = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t); return Number.isNaN(v) ? null : v; };
  const fmtIn = (v) => (v === '' || v == null ? '' : String(r2(v)).replace('.', ','));
  const bloqueAvisos = (l) => (l.length ? `<div class="aviso">${l.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : '');
  const ejPanel = () => Number(S.ejercicio) || new Date().getFullYear();
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let msg = '';
  // el extracto contable (grande) solo se pide cuando se abre una de las dos pestañas; el chip del menú lo usa si ya está cargado
  let mayorPedido = false;
  const mayor = () => (mayorPedido ? grande('may-mov') : null);

  // ---------- Registros por empresa y ejercicio ----------
  const regDe = (tipo, ej) => S.registros.find((r) => r.tipo === tipo && r.empresa_id === S.sel && r.ejercicio === ej);
  async function guardar(tipo, ej, datos) {
    const ex = regDe(tipo, ej);
    if (ex) {
      ex.datos = datos;
      const { error } = await db.from('registros').update({ datos }).eq('id', ex.id);
      if (error) alert(error.message);
    } else {
      const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo, ejercicio: ej, datos };
      S.registros.push(fila);
      const { error } = await db.from('registros').insert(fila);
      if (error) alert(error.message);
    }
  }
  const manDe = (ej) => regDe('m200x', ej)?.datos ?? {};
  const datos202 = () => regDe('m202', null)?.datos ?? {};
  const guardar202 = (st) => guardar('m202', null, st);

  // ---------- Balance de sumas y saldos por ejercicio (registro `sys` de la pestaña Balance de Sumas y Saldos) ----------
  // solo las cuentas de último nivel, para no sumar dos veces las de grupo
  const soloHojas = (out) => out.filter((c0) => !out.some((o) => o !== c0 && o.digitos.length > c0.digitos.length && o.digitos.startsWith(c0.digitos)));
  const efLineas = (y) => {
    const reg = regDe('sys', y);
    return reg ? soloHojas(reg.datos.cuentas.map((x) => ({ digitos: String(x.cuenta), cuenta: String(x.cuenta), nombre: x.nombre, ap: x.apertura, debe: x.debe, haber: x.haber, cierre: x.previo }))) : [];
  };
  const efAnios = () => S.registros.filter((r) => r.tipo === 'sys' && r.empresa_id === S.sel && r.datos?.cuentas?.length).map((r) => r.ejercicio).sort((a, b) => b - a);

  // ---------- Motor de estados financieros (efCtx): balance de situación y PyG desde el balance de sumas y saldos ----------
  function efCtx(lineas) {
    const ss = lineas || [];
    const cache = new Map();
    const campo = { c: 'cierre', a: 'ap', d: 'debe', h: 'haber' };
    const suma = (col, pre) => { const k = col + pre; if (cache.has(k)) return cache.get(k); let s = 0; ss.forEach((l) => { if (l.digitos.startsWith(pre)) s += (l[campo[col]] || 0); }); s = r2(s); cache.set(k, s); return s; };
    const filas = {}; EF_BAL.forEach((f) => { filas['D' + f[0]] = f[3]; filas['E' + f[0]] = f[4]; }); EF_PYG.forEach((f) => { filas['I' + f[0]] = f[3]; }); EF_ND.forEach((f) => { filas['D' + f[0]] = f[3]; });
    const memo = new Map();
    const val = (col, row) => {
      const key = col + row; if (memo.has(key)) return memo.get(key); const e = filas[key]; let v = 0;
      if (!e) v = 0;
      else if (e.k === 'leaf') v = e.t.reduce((s, [sg, c0, p]) => s + sg * suma(c0, p), 0) + (EXTRA[key] || 0);
      else if (e.k === 'refs') v = e.r.reduce((s, r) => s + val(e.c, r), 0);
      if (e && e.neg) v = -v; v = r2(v); memo.set(key, v); return v;
    };
    // ninguna cuenta se queda fuera: la que no casa con ninguna partida va a la de su subgrupo del PGC (según sea deudora o acreedora)
    const EXTRA = {}, sinPartida = [];
    const pref = []; EF_BAL.forEach((f) => { if (f[3] && f[3].k === 'leaf') f[3].t.forEach(([sg, , p]) => { if (sg > 0) pref.push(p); }); }); EF_PYG.forEach((f) => { if (f[3] && f[3].k === 'leaf') f[3].t.forEach(([sg, , p]) => { if (sg > 0) pref.push(p); }); });
    ss.forEach((l) => {
      const d = String(l.digitos || ''); if (!/^[1-7]/.test(d) || pref.some((p) => d.startsWith(p))) return;
      if (Math.abs(+l.cierre || 0) < 0.005 && Math.abs(+l.ap || 0) < 0.005) return;
      const g2 = d.slice(0, 2), g1 = d[0];
      if (/^[67]/.test(d)) { const r = EF_FALLBACK_PYG[g2]; if (r) { EXTRA['I' + r] = (EXTRA['I' + r] || 0) + (+l.cierre || 0); sinPartida.push({ d, n: l.nombre, v: l.cierre, fila: 'I' + r }); } return; }
      [['D', 'cierre'], ['E', 'ap']].forEach(([col, k]) => {
        const v = +l[k] || 0; if (Math.abs(v) < 0.005) return; const Mp = v > 0 ? EF_FALLBACK_DEU : EF_FALLBACK_ACR; const r = Mp[g2] || Mp[g1];
        if (r) { EXTRA[col + r] = (EXTRA[col + r] || 0) + v; if (col === 'D') sinPartida.push({ d, n: l.nombre, v, fila: 'D' + r }); }
      });
    });
    return { val, suma, ss, sinPartida };
  }

  // ================= Modelo 200 · misma lógica que la hoja Mod200 =================
  // el IS que se presenta en el ejercicio seleccionado es el del ejercicio anterior (en 2026 se presenta el 200 de 2025)
  let ej200 = null;
  const ejercicio200 = () => ej200 || (ejPanel() - 1);
  const presDe = (ej, mod, per, col) => { const v = prsVal(ej, mod, per, col); return v === undefined || v === null || v === '' ? null : Number(v); };

  // el 200 de un ejercicio de IS se presenta (y se guarda en Presentados) en el año siguiente
  const regPrs = (y) => S.registros.find((r) => r.tipo === 'prs' && r.empresa_id === S.sel && r.ejercicio === y);
  // importe de la casilla 00505 en el 200 presentado del ejercicio o, si no hay, en el del año anterior (es una cantidad fija anual)
  function rev30Def(ej) {
    for (const y of [ej, ej - 1]) {
      const P = regPrs(y + 1)?.datos?.['200|A']; if (!P?.est200) continue; let v = null;
      P.est200.forEach((p) => p.filas.forEach(([, cs]) => cs.forEach(([c0, x]) => { if (c0 === '00505' && x !== null && v === null) v = +x; })));
      if (v !== null) return { v: r2(v), anio: y };
    }
    return { v: null, anio: null };
  }
  /* bloque D del 200: correcciones calculadas (balance + a mano) frente a las del 200 presentado, casando cada línea del PDF por su texto */
  const CORR_CASA = [[/Impuesto sobre Sociedades/i, null], [/multas/i, /multa|sanci[oó]n|recargo/i], [/donativos/i, /donativ|liberalidad/i], [/^Deterioros/i, /deterioro/i],
    [/^Reversión del 30/i, /30\s*%.*amortiz|Ley 16\/2012|\(00505\)/i],
    [/^Amortizaciones/i, /amortiz/i], [/^Provisiones/i, /provisi[oó]n/i], [/gastos financieros/i, /gastos financieros/i], [/vinculadas/i, /vinculad/i],
    [/plazos/i, /plazos/i], [/dividendos/i, /dividend|art\.?\s*21\b/i], [/Otros gastos no deducibles/i, /fondos propios|15\s*\.?\s*[af]\)|no deducible/i]];
  function compararCorr(bal, pdf, is) {
    const libres = pdf.map((x, i) => i), filas = [];
    bal.forEach((x) => {
      const regla = CORR_CASA.find(([rc]) => rc.test(x[0]));
      let pa = null, pd = null; const txt = [];
      if (is) {
        pa = 0; pd = 0;
        if (regla && regla[1] === null) { pa = +is.a || 0; pd = +is.d || 0; txt.push('00301/00302'); }
        else if (regla) { for (let j = libres.length - 1; j >= 0; j--) { const p = pdf[libres[j]]; if (regla[1].test(p[0])) { pa = r2(pa + (+p[3] || 0)); pd = r2(pd + (+p[4] || 0)); txt.unshift(p[0]); libres.splice(j, 1); } } }
      }
      filas.push({ t: x[0], n: x[1], k: x[2], ca: +x[3] || 0, cd: +x[4] || 0, pa, pd, casa: txt });
    });
    // líneas del 200 presentado que no se pueden calcular con el balance (cambio de criterio contable, etc.)
    libres.forEach((i) => { const p = pdf[i]; filas.push({ t: p[0], n: '200 presentado', k: p[2], ca: 0, cd: 0, pa: +p[3] || 0, pd: +p[4] || 0, casa: [], soloPdf: true }); });
    filas.forEach((f) => { f.dif = f.pa === null ? null : r2((f.ca - f.cd) - (f.pa - f.pd)); });
    // las que no tienen importe en ninguno de los dos lados no se enseñan
    return filas.filter((f) => Math.abs(f.ca) > 0.005 || Math.abs(f.cd) > 0.005 || (f.pa !== null && (Math.abs(f.pa) > 0.005 || Math.abs(f.pd) > 0.005)));
  }

  function calc200() {
    const ej = ejercicio200();
    const L = efLineas(ej), X = efCtx(L), F = (c0, r) => X.val(c0, r), Sm = (col, pre) => X.suma(col, pre);
    const man = manDe(ej); const M = (k, def = 0) => (man[k] === undefined || man[k] === '' ? def : (isNaN(+man[k]) ? man[k] : +man[k]));
    const R = { ej, man };
    // modelo 200 presentado del mismo ejercicio (Presentados, guardado en el año de presentación): sus páginas, casillas y bases negativas leídas del PDF
    const P200 = regPrs(ej + 1)?.datos?.['200|A'] ?? null, EST = P200?.est200?.length ? P200.est200 : null;
    const PC = {};
    if (EST) EST.filter((p) => /^(12|13|14)( bis)?$|^20 bis$|^15$/.test(p.pag)).forEach((p) => p.filas.forEach(([, cs]) => cs.forEach(([c0, v]) => { if (v !== null && PC[c0] === undefined) PC[c0] = v; })));
    R.P200 = P200; R.PC = PC; R.EST = EST;
    const rev30 = rev30Def(ej);
    // A. cabecera
    const incnEj = F('I', 14);
    R.tipo = M('tipo', 0.25); R.incnAnt = M('incnAnt', incnEj); R.erd = M('erd', R.incnAnt >= 10000000 ? 'NO' : 'SÍ');
    // D. correcciones al resultado
    const sumC = (pres, col = 'c') => r2(pres.reduce((s, p) => s + Sm(col, p), 0));
    R.corr = [
      ['Gastos no deducibles – multas, sanciones y recargos', 'art. 15.c)', 'Permanente', F('D', 303), 0],
      ['Gastos no deducibles – donativos y liberalidades', 'art. 15.e)', 'Permanente', F('D', 304), 0],
      // gasto por IS (aumento); si en la PyG es ingreso (impuesto positivo), es una disminución
      ['Gasto por Impuesto sobre Sociedades', 'art. 15.b)', 'Permanente', Math.max(0, r2(-F('I', 101))), Math.max(0, r2(F('I', 101)))],
      ['Deterioros no deducibles', 'art. 13', 'Temporaria', sumC(['693', '696', '697', '698', '699']), r2(-sumC(['793', '796']))],
      ['Reversión del 30 % de la amortización contable (art. 7 Ley 16/2012) · casilla 00505' + (rev30.v !== null && man.rev30 === undefined ? ' (importe del 200 presentado' + (rev30.anio !== ej ? ' de ' + rev30.anio : '') + ')' : ''), 'art. 7 Ley 16/2012', 'Temporaria', 0, M('rev30', rev30.v || 0)],
      ['Amortizaciones – exceso sobre tablas', 'arts. 12 y 103', 'Temporaria', sumC(['681900']), r2(-sumC(['781900']))],
      ['Provisiones no deducibles', 'art. 14', 'Temporaria', sumC(['695900']), r2(-sumC(['795900']))],
      ['Limitación de gastos financieros', 'art. 16', 'Temporaria', r2(Math.max(0, (-F('I', 86) - F('I', 79)) - Math.max(1000000, 0.3 * (F('I', 78) - F('I', 58) - F('I', 62) - F('I', 66))))), 0],
      ['Operaciones vinculadas – ajuste a valor de mercado', 'art. 18', 'Permanente', sumC(['669900']), r2(-sumC(['769900']))],
      ['Operaciones a plazos – criterio de caja', 'art. 11.4', 'Temporaria', r2(-sumC(['700900'])), sumC(['600900'])],
      ['Otros gastos no deducibles (art. 15.a y 15.f LIS)', 'art. 15', 'Permanente', r2(F('D', 305) + M('nd306') + M('nd307')), 0],
      ['Exención de dividendos de empresas del grupo y asociadas (art. 21 LIS)', 'art. 21', 'Permanente', 0, 0],
    ];
    // art. 21: dividendos del ejercicio (760) + dividendos a cobrar de ejercicios anteriores (545, saldo de apertura) cobrados en el ejercicio
    {
      const div760 = r2(F('I', 81) + F('I', 82)), L545 = (X.ss || []).filter((l) => String(l.digitos).startsWith('545'));
      const ant = L545.map((l) => ({ l, v: r2(Math.max(0, Math.min(+l.ap || 0, +l.haber || 0))) })).filter((o) => o.v > 0.005), div545 = r2(ant.reduce((t, o) => t + o.v, 0));
      const fila = R.corr[R.corr.length - 1]; fila[4] = r2((div760 + div545) * 0.95);
      if (div545) fila[0] += ' · 95 % de (' + money(div760) + ' dividendos del ejercicio + ' + money(div545) + ' dividendos a cobrar del ejercicio anterior cobrados: ' + ant.map((o) => o.l.nombre || o.l.digitos).join(', ') + ')';
    }
    [1, 2, 3].forEach((i) => { const t = man['ajT' + i]; if (t || M('ajA' + i) || M('ajD' + i)) R.corr.push([t || ('Otro ajuste ' + i), man['ajN' + i] || '', man['ajK' + i] || 'Permanente', M('ajA' + i), M('ajD' + i), 'aj' + i]); });
    R.corrSrc = 'balance de sumas y saldos (como tu Excel)';
    R.corrBal = R.corr.slice();
    // correcciones del 200 presentado (páginas 12 y 13), para compararlas con las calculadas y, si se elige, llevarlas a la liquidación
    const filasPdf = [];
    if (EST) EST.filter((p) => /^(12|13)$/.test(p.pag)).forEach((p) => p.filas.forEach(([l, cs]) => {
      if (cs.some(([c0]) => /^0030[12]$|^00500$|^00501$|^0041[78]$|^00004$/.test(c0))) return; const v = cs.map((x) => x[1]); if (v.every((x) => x === null)) return;
      // con una sola casilla: son disminuciones las exenciones (dividendos art. 21, rentas exentas…) y las que lo dicen
      const soloDis = /disminuc|exenci[oó]n|exent|dividend|art\.?\s*21\b|deducci[oó]n del 30\s*%|30\s*%.*amortizaci|Ley 16\/2012/i.test(l) || cs.some(([c0]) => c0 === '00505');
      const a = cs.length >= 2 ? (v[0] || 0) : (soloDis ? 0 : (v[0] || 0)), d = cs.length >= 2 ? (v[1] || 0) : (soloDis ? (v[0] || 0) : 0);
      filasPdf.push([l + ' (' + cs.map((x) => x[0]).join('/') + ')', '200 presentado', /temporal|amortiz|deterioro|provision|criterio|plazos/i.test(l) ? 'Temporaria' : 'Permanente', a, d, null, 'pdf']);
    }));
    R.corrCmp = compararCorr(R.corrBal, filasPdf, EST ? { a: PC['00301'], d: PC['00302'] } : null);
    if (EST && M('corrPdf', 'SÍ') === 'SÍ') {
      // las correcciones que no se pueden sacar del balance (cambio de criterio, donativos…) salen de las páginas 12 y 13 del 200 presentado
      const is = R.corr.find((x) => /Impuesto sobre Sociedades/.test(x[0]));
      R.corr = [is].concat(filasPdf); R.corrSrc = 'gasto por IS de la PyG y el resto de correcciones del 200 presentado de ' + ej + ' (páginas 12 y 13)';
    }
    R.J57 = r2(R.corr.reduce((s, x) => s + (+x[3] || 0), 0)); R.K57 = r2(R.corr.reduce((s, x) => s + (+x[4] || 0), 0));
    // C. liquidación
    const D = {}; R.D = D;
    D[32] = F('I', 108); D[33] = R.J57; D[34] = R.K57; D[35] = r2(D[32] + D[33] - D[34]);
    // otras correcciones del 200 presentado que no están en el detalle de las páginas 12 y 13 (cuadran la 00550 con el PDF)
    R.otrasPdf = 0;
    if (EST && (man.corrPdf || 'SÍ') !== 'NO') {
      try {
        const pc = casLiquidacion200(EST), p500 = pc['500'], p550 = pc['550'];
        const CC = R.corrCmp || [], pa = CC.some((f) => f.pa !== null) ? r2(CC.reduce((t, f) => t + (f.pa || 0), 0)) : D[33], pd = CC.some((f) => f.pd !== null) ? r2(CC.reduce((t, f) => t + (f.pd || 0), 0)) : D[34];
        if (p500 !== undefined && p550 !== undefined) { const o = r2((+p550) - ((+p500) + pa - pd)); if (Math.abs(o) > 0.005) { R.otrasPdf = o; D[35] = r2(D[35] + o); } }
      } catch { /* sin liquidación en el PDF */ }
    }
    // reserva de capitalización (art. 25)
    const O = {}; R.O = O;
    O[34] = F('D', 110); O[35] = F('D', 125); O[36] = r2(O[34] - O[35]); O[37] = F('E', 110); O[38] = F('E', 125); O[39] = r2(O[37] - O[38]); O[40] = r2(O[36] - O[39]);
    O[42] = r2(F('D', 124) - F('E', 124)); O[43] = M('o43'); O[44] = r2(F('D', 121) - F('E', 121)); O[45] = r2((F('D', 115) + F('D', 117)) - (F('E', 115) + F('E', 117))); O[46] = r2(F('D', 119) - F('E', 119)); O[47] = M('o47'); O[48] = M('o48');
    O[49] = r2(O[42] + O[43] + O[44] + O[45] + O[46] + O[47] + O[48]); O[50] = Math.max(0, r2(O[40] - O[49])); O[51] = M('mantiene', 'SÍ');
    O[11] = O[51] === 'SÍ' ? O[50] : 0; O[12] = M('plantilla', 0) / 100;
    O[13] = O[12] >= 0.1 ? 0.3 : O[12] >= 0.05 ? 0.265 : O[12] >= 0.02 ? 0.23 : 0.2; O[14] = r2(Math.max(0, O[11]) * O[13]);
    O[15] = R.incnAnt < 1000000 ? 0.25 : 0.2; O[16] = r2(Math.max(0, D[35]) * O[15]); O[17] = Math.min(O[14], O[16]); O[18] = Math.max(0, r2(O[14] - O[17]));
    R.capSrc = 'fórmula del art. 25 LIS (incremento de fondos propios)';
    if (PC['01032'] !== undefined && M('capPdf', 'SÍ') === 'SÍ') { O[17] = PC['01032']; R.capSrc = 'página 20 bis del 200 presentado (reserva dotada en el ejercicio: casilla 01140)'; }
    D[36] = O[17];
    // E. bases imponibles negativas
    R.bin = []; const H23 = R.incnAnt > 60000000 ? 0.25 : (R.incnAnt >= 20000000 ? 0.5 : 0.7);
    const H24 = (D[35] - D[36] <= 0) ? 0 : r2(Math.min(D[35] - D[36], Math.max(1000000, H23 * (D[35] - D[36]))));
    let acum = 0;
    const e200ant = regPrs(ej)?.datos?.['200|A'], e200 = P200;
    const p15 = EST ? (() => { const mm = {}; EST.filter((p) => p.pag === '15').forEach((p) => p.filas.forEach(([l, cs]) => { const y = (l.match(/(?:año|base)\D*((?:19|20)\d{2})/i) || [])[1]; if (y && cs.length >= 1 && cs[0][1] !== null) mm[+y] = cs[0][1]; })); return mm; })() : null;
    const binPdf = (e200ant?.bin?.length) ? { src: '200 de ' + (ej - 1) + ': pendiente para periodos futuros', m: Object.fromEntries(e200ant.bin.map((b) => [b.y, b.fut])), solo: true }
      : p15 ? { src: 'página 15 del 200 presentado de ' + ej + ' (no está en Presentados el 200 de ' + (ej - 1) + ')' + (Object.keys(p15).length ? '' : ' (sin bases negativas pendientes)'), m: p15, solo: true }
        : (e200?.bin?.length) ? { src: '200 de ' + ej + ': pendiente al principio del periodo', m: Object.fromEntries(e200.bin.map((b) => [b.y, b.ini])) } : null;
    R.binSrc = binPdf ? binPdf.src : 'cuentas 121 del balance de sumas y saldos (saldo de apertura), como tu Excel';
    const anios = new Set(); for (let y = ej - 11; y <= ej - 1; y++) anios.add(y); if (binPdf) Object.keys(binPdf.m).forEach((y) => anios.add(+y));
    const binSolo = binPdf && binPdf.solo;
    [...anios].sort((a, b) => a - b).forEach((y) => {
      const rx = new RegExp('^121.*' + y); const Gss = r2(-X.ss.filter((l) => rx.test(l.digitos)).reduce((s, l) => s + (l.ap || 0), 0));
      const mk = 'bin' + y, manual = (man[mk] !== undefined && man[mk] !== '');
      const G = manual ? +man[mk] : (binPdf && binPdf.m[y] !== undefined ? binPdf.m[y] : (binSolo ? 0 : Gss));
      const src = manual ? 'man' : (binPdf && binPdf.m[y] !== undefined ? 'pdf' : 'ss');
      const H = Math.min(G, Math.max(0, H24 - acum)); acum = r2(acum + H); R.bin.push([y, G, r2(H), r2(G - H), src]);
    });
    // lo presentado en el 200 del ejercicio (pendiente al inicio, aplicada y pendiente futuros), para comparar
    const presBin = (e200?.bin?.length) ? Object.fromEntries(e200.bin.map((b) => [b.y, b])) : (p15 ? Object.fromEntries(Object.entries(p15).map(([y, v]) => [y, { y: +y, ini: v, apl: null, fut: null }])) : null);
    R.binPres = presBin; R.binPresSrc = e200?.bin?.length ? '200 de ' + ej : p15 ? 'página 15 del 200 de ' + ej + ' (solo pendiente al inicio)' : '';
    if (presBin) Object.keys(presBin).forEach((y) => { if (!R.bin.some((b) => b[0] === +y)) R.bin.push([+y, 0, 0, 0, 'pres']); });
    R.bin.sort((a, b) => a[0] - b[0]);
    R.H22 = r2(R.bin.reduce((s, x) => s + x[2], 0)); R.H23 = H23; R.H24 = H24; D[37] = R.H22;
    // reserva de nivelación (art. 105)
    O[22] = (R.erd === 'SÍ' && R.tipo === 0.25) ? 'SÍ' : 'NO'; O[23] = Math.max(0, r2(D[35] - D[36] - D[37])); O[24] = 0.1; O[25] = r2(O[23] * O[24]);
    O[26] = r2(1000000 * Math.min(1, 365 / 365)); O[27] = O[22] !== 'SÍ' ? 0 : Math.min(O[25], O[26]);
    const min28 = man.minNiv === undefined || man.minNiv === '' ? null : +man.minNiv; O[28] = min28; O[29] = M('adicNiv');
    O[30] = r2(O[29] - (min28 === null ? O[27] : Math.min(min28, O[27])));          // en Excel MIN() ignora la celda vacía: sin dato se aplica el máximo
    D[38] = O[30];
    D[39] = r2(D[35] - D[36] - D[37] + D[38]); D[40] = R.tipo; D[41] = r2(Math.max(0, D[39]) * D[40]);
    // F. deducciones y bonificaciones
    const ded = [['Deducción por doble imposición internacional – imp. soportado', 'art. 31', '567', '474100', '630100011'],
      ['Deducción por doble imposición internacional – dividendos', 'art. 32', '568', '474110', '630100012'],
      ['Bonificación por rentas obtenidas en Ceuta y Melilla', 'art. 33', '570', '474120', '630100013'],
      ['Bonificación por prestación de servicios públicos locales', 'art. 34', '571', '474130', '630100014'],
      ['Deducción por actividades de I+D', 'art. 35.1', '798', '4742', '630100002'],
      ['Deducción por innovación tecnológica', 'art. 35.2', '799', '474300', '630100003'],
      ['Deducción por inversiones en producciones cinematográficas', 'art. 36', '588', '474400', '630100004'],
      ['Deducción por creación de empleo', 'arts. 37 y 38', '589', '474500', '630100005'],
      ['Deducción por inversiones en Canarias', 'Ley 20/1991', '590', '474600', '630100006']];
    R.ded = ded.map(([t, n, c0, pe, pg]) => ({ t, n, c: c0, E: Sm('a', pe), F: Sm('h', pg) }));
    let sumH = 0; R.ded.slice(0, 4).forEach((x) => { x.G = D[41]; x.H = r2(Math.min(x.E + x.F, Math.max(0, x.G - sumH))); sumH = r2(sumH + x.H); x.I = 0; });
    const H79 = r2(R.ded.reduce((s, x) => s + (x.H || 0), 0)); D[42] = H79; D[43] = Math.max(0, r2(D[41] - D[42])); D[44] = r2(Math.max(0, D[39]) * 0.15);
    const id = R.ded[4]; id.G = r2(id.F > 0.1 * D[43] ? 0.5 * D[43] : 0.25 * D[43]); id.H = 0; id.I = r2(Math.min(id.E + id.F, Math.max(0, id.G)));
    let sumI = id.I; R.ded.slice(5).forEach((x) => { x.G = r2(0.25 * D[43]); x.H = 0; x.I = r2(Math.min(x.E + x.F, Math.max(0, x.G - sumI))); sumI = r2(sumI + x.I); });
    R.ded.forEach((x) => { x.J = r2(x.E + x.F - (x.H || 0) - (x.I || 0)); });
    const I79 = r2(R.ded.reduce((s, x) => s + (x.I || 0), 0));
    const donat = r2(R.corr.filter((x) => /donativo/i.test(x[0])).reduce((s, x) => s + (+x[3] || 0), 0));
    R.dedDon = r2(donat * M('pctDon', 40) / 100);                                   // 00565: donaciones a entidades sin fines de lucro
    R.minLiq = R.incnAnt >= 20000000 ? D[44] : 0;                              // cuota líquida mínima del 15 % (art. 30 bis LIS, cifra de negocios ≥ 20 M€)
    const tope = Math.max(0, r2(D[43] - R.minLiq - R.dedDon));
    D[45] = r2(Math.min(I79, id.G, tope)); D[46] = Math.max(0, r2(D[43] - D[45] - R.dedDon));
    // retenciones (01766) y pagos fraccionados del 202 (00601, 00603, 00605): de Presentados; si no están, del balance
    D[48] = r2(['473000001', '473000002', '473000003', '473000004'].reduce((s, p) => s + Sm('d', p), 0)); R.retSrc = 'balance de sumas y saldos (cargos de 473000001 a 473000004)';
    { // con el extracto contable cargado: retenciones del ejercicio = cargos de las cuentas 4730.01 a 4730.04 en ese año (sin el impuesto devengado ni los saldos de ejercicios anteriores)
      const mayorL = mayor(), C4 = ['4730.01', '4730.02', '4730.03', '4730.04'];
      const may = (mayorL || []).filter((l) => String(l.fecha ?? '').slice(0, 4) === String(ej) && C4.some((p) => casaCta(p, String(l.cuenta ?? '').replace(/\D/g, ''))));
      if (may.length) {
        R.retDet = C4.map((p) => { const Ls = may.filter((l) => casaCta(p, String(l.cuenta ?? '').replace(/\D/g, '')) && !/^I[-\s]|^OD-/i.test(String(l.asiento || ''))); return [p, r2(Ls.reduce((t, l) => t + (l.debe || 0), 0))]; });
        D[48] = r2(R.retDet.reduce((t, x) => t + x[1], 0)); R.retSrc = 'extracto contable (cuentas ' + R.retDet.map((x) => x[0] + ': ' + money(x[1])).join(' · ') + ')';
      }
    }
    R.pf = ['1P', '2P', '3P'].map((p) => presDe(ej, '202', p, 'res'));
    D[47] = r2(D[46] - D[48]);                                                    // 00599 = cuota líquida − retenciones
    D[49] = R.pf.some((v) => v !== null) ? r2(R.pf.reduce((s, v) => s + (v || 0), 0)) : Sm('d', '473000005');
    R.pfSrc = R.pf.some((v) => v !== null) ? 'modelos 202 de ' + ej + ' en Presentados' : 'cargos de la cuenta 473000005';
    D[50] = r2(D[47] - D[49]); D[51] = D[50]; D[52] = D[51];                          // 00611 = 00599 − pagos fraccionados
    R.ingresar = Math.max(0, D[52]); R.devolver = D[52] < 0 ? -D[52] : 0;
    // G. asiento
    R.asiento = [['6300', 'Impuesto corriente (cuota líquida, casilla 00592)', D[46], null], ['473', 'H.P. retenciones y pagos a cuenta (retenciones + pagos fraccionados)', null, r2(D[48] + D[49])],
      ['4752', 'H.P. acreedora por Impuesto sobre Sociedades (a ingresar)', null, Math.max(0, D[52])], ['4709', 'H.P. deudora por devolución de impuestos (a devolver)', D[52] < 0 ? -D[52] : null, null]];
    R.pres = { ci: presDe(ej + 1, '200', 'A', 'cuota'), res: presDe(ej + 1, '200', 'A', 'res') };
    R.avisos = [];
    if (!X.ss.length) R.avisos.push('Carga el balance de sumas y saldos de ' + ej + ' (botón SYS; el ejercicio se toma del nombre del archivo) para calcular el modelo 200');
    R.avisos.push('Cálculo igual que la hoja Mod200 de tu Excel. Los datos que en el Excel se escriben a mano (INCN del ejercicio anterior, incremento de plantilla, minoración de la reserva de nivelación, ajustes adicionales…) se escriben aquí en las casillas de fondo crema');
    return R;
  }

  // ---------- Modelo 200 completo: las páginas del PDF presentado, dibujadas como el impreso y con sus casillas ----------
  let pag200 = 0, solo200 = false;
  const NOM200 = { '500': 'Resultado de la cuenta de pérdidas y ganancias', '501': 'Corrección por IS (aumentos)', '502': 'Corrección por IS (disminuciones)', '550': 'Base imponible antes de reserva de capitalización y BIN', '547': 'Compensación de bases imponibles negativas',
    '552': 'Base imponible', '558': 'Tipo de gravamen', '562': 'Cuota íntegra', '582': 'Cuota íntegra ajustada positiva', '592': 'Cuota líquida positiva', '599': 'Cuota del ejercicio a ingresar o a devolver', '600': 'Retenciones e ingresos a cuenta',
    '601': 'Pagos fraccionados', '611': 'Cuota diferencial', '612': 'Cuota diferencial (Diputaciones Forales)', '619': 'Cuota líquida mínima', '621': 'Líquido a ingresar o a devolver', '1032': 'Reserva de capitalización', '1033': 'Reserva de nivelación (adición)', '1034': 'Reserva de nivelación (minoración)', '1586': 'Resultado de la autoliquidación' };
  function modelo200Completo(R) {
    const P200 = R.P200;
    if (!P200?.est200?.length) return `<section class="block"><h3 class="bt">Modelo 200 completo</h3><p class="leyenda">Incorpora en Presentados el PDF del modelo 200 de ${R.ej} (descargado de la AEAT) para ver aquí todas sus páginas y casillas, con lo calculado al lado en la liquidación.</p></section>`;
    const D = R.D, CALC = { '500': D[32], '550': D[35], '1032': D[36], '547': D[37], '552': D[39], '1330': D[39], '562': D[41], '582': D[43], '588': D[45], '565': R.dedDon, '619': R.minLiq || undefined, '592': D[46], '1766': D[48], '599': D[47],
      '601': R.pf && R.pf[0] !== null ? R.pf[0] : undefined, '603': R.pf && R.pf[1] !== null ? R.pf[1] : undefined, '605': R.pf && R.pf[2] !== null ? R.pf[2] : undefined, '611': D[50], '1586': D[51], '621': D[52] };
    Object.keys(CALC).forEach((k) => { if (CALC[k] === undefined) delete CALC[k]; });
    const pags = P200.est200, sel = Math.min(pag200 || 0, pags.length - 1), pg = pags[sel], esLiq = /^(12|13|14)( bis)?$/.test(pg.pag);
    const nCas = pags.reduce((s, p) => s + p.filas.reduce((a, f) => a + f[1].length, 0), 0), nVal = pags.reduce((s, p) => s + p.filas.reduce((a, f) => a + f[1].filter((c0) => c0[1] !== null).length, 0), 0);
    const chips = pags.map((p, i) => `<button class="mini-b${i === sel ? ' primario' : ''}" data-act="m-pag200" data-i="${i}" title="${p.filas.reduce((a, f) => a + f[1].filter((c0) => c0[1] !== null).length, 0)} casillas con importe">Pág. ${esc(p.pag)}</button>`).join(' ');
    const filas = pg.filas.map(([lab, cs]) => {
      const conImp = cs.some((c0) => c0[1] !== null);
      return `<tr class="${conImp ? 'conimp' : ''}"><td>${esc(lab)}</td><td>${cs.map(([c0, v]) => {
        const k = String(+c0), calc = esLiq && CALC[k] !== undefined ? CALC[k] : null, dif = calc !== null && v !== null ? r2(calc - v) : null;
        return `<span class="c200"><span class="cas200">${esc(c0)}</span> <b>${v === null ? '' : money(v)}</b>${calc !== null ? ` <span class="calc200" title="Calculado en esta pestaña">calc. ${money(calc)}</span>${dif !== null && Math.abs(dif) > 0.01 ? ` <span class="dif-ko">dif. ${money(dif)}</span>` : dif !== null ? ' <span class="est-ok">✓</span>' : ''}` : ''}</span>`;
      }).join('')}</td></tr>`;
    }).join('');
    const arch = S.registros.find((r) => r.tipo === 'prspdf' && r.empresa_id === S.sel && r.ejercicio === R.ej + 1 && r.datos?.modelo === '200')?.datos?.archivo?.path ?? '';
    setTimeout(dibujar200, 0);
    return `<section class="block"><h3 class="bt">Modelo 200 completo · ${esc(P200.pdf || '')} · ${pags.length} páginas, ${nCas} casillas (${nVal} con importe)</h3>
    <div class="pag200">${chips}</div>
    <div class="pag200-img"><canvas id="c200" data-path="${esc(arch)}" data-n="${pg.n || sel + 1}"></canvas><p id="c200aviso" class="leyenda"></p></div>
    <h4 class="h200c">Casillas de la página ${esc(pg.pag)}${esLiq ? ' y lo calculado en esta pestaña' : ''}</h4>
    <label class="chk202"><input type="checkbox" data-solo200="1"${solo200 ? ' checked' : ''}> Ver solo las casillas con importe</label>
    <div class="wrap"><table class="tabla m200t t200c${solo200 ? ' solo' : ''}"><thead><tr><th>Página ${esc(pg.pag)} · concepto</th><th>Casillas e importes presentados${esLiq ? ' · y lo calculado en esta pestaña' : ''}</th></tr></thead><tbody>${filas}</tbody></table></div></section>`;
  }
  let PDF200 = { path: null, doc: null };
  async function dibujar200() {
    const cv = document.getElementById('c200'); if (!cv) return;
    const path = cv.dataset.path, n = +cv.dataset.n, aviso = document.getElementById('c200aviso');
    try {
      if (!path) { if (aviso) aviso.textContent = 'Para ver la página como el impreso de la AEAT, suelta otra vez el PDF del modelo 200 en Presentados (se guarda con el resto de documentos).'; cv.style.display = 'none'; return; }
      if (PDF200.path !== path) {
        const url = await c.urlPdf(path); if (!url) throw new Error('no se ha podido abrir el PDF guardado');
        const lib = window.pdfjsLib; if (!lib) throw new Error('sin lector de PDF');
        PDF200 = { path, doc: await lib.getDocument({ url }).promise };
      }
      const pg = await PDF200.doc.getPage(Math.min(n, PDF200.doc.numPages));
      const ancho = Math.min(cv.parentElement.clientWidth || 1000, 1100), vp0 = pg.getViewport({ scale: 1 }), esc0 = ancho / vp0.width, dpr = window.devicePixelRatio || 1, vp = pg.getViewport({ scale: esc0 * dpr });
      cv.width = vp.width; cv.height = vp.height; cv.style.width = ancho + 'px'; cv.style.height = (vp.height / dpr) + 'px';
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; cv.style.display = 'block'; if (aviso) aviso.textContent = '';
    } catch (e) { if (aviso) aviso.textContent = 'No se ha podido dibujar la página: ' + e.message; }
  }

  const domi = (mod, importe) => {
    if (!(importe > 0.005)) return '';
    const v = empresa()?.datos?.['cuenta' + mod] ?? '';
    return `<div class="f303-sec">Domiciliación del pago</div><div class="f303-id"><span class="idbox grow"><b>Cuenta de cargo (IBAN) del ${mod} · importe a ingresar ${money(importe)}</b><input data-ibanmod="${mod}" class="iban" value="${esc(v)}" placeholder="ES00 0000 0000 00 0000000000"${puede() ? '' : ' disabled'}></span></div>`;
  };

  const RAZON = { '500': 'D) Resultado del ejercicio de la PyG (balance de sumas y saldos)', '301-414': 'Bloque D: gasto por IS de la PyG y resto de correcciones del balance más lo escrito a mano',
    '550': '[00500] + aumentos − disminuciones', '1032': 'Reserva de capitalización: fórmula del art. 25 LIS', '547': 'Bases negativas (art. 26 LIS, bloque E): límite del 70 %/50 %/25 % de la base previa, con mínimo de 1 M€',
    '01033/01034': 'Reserva de nivelación ERD (art. 105 LIS): hasta el 10 % de la base, máximo 1 M€', '552': '[00550] − [01032] − [00547] ± reserva de nivelación', '558': 'Tipo de gravamen de la cabecera', '562': '[00552] × [00558]',
    '00563-00581': 'Bonificaciones y deducciones por doble imposición (bloque F)', '582': '[00562] − bonificaciones y DDI', '619': '15 % de la base imponible: mínimo de la cuota líquida si la cifra de negocios llega a 20 M€ (art. 30 bis LIS)', '00588-00590': 'Deducciones I+D+i (00588) y donativos al 40 % (00565), con el límite del art. 39 y sin bajar de la cuota líquida mínima',
    '592': '[00582] − deducciones', '599': '[00592] − retenciones e ingresos a cuenta [01766]', '01785-01799': 'Retenciones e ingresos a cuenta [01766]: cargos de las cuentas 473000001 a 473000004', '601': 'Pagos fraccionados [00601] + [00603] + [00605]: modelos 202 del ejercicio en Presentados (si no están, cargos de la cuenta 473000005)',
    '00611/00612': '[00599] − pagos fraccionados', '01586/01587': '= cuota diferencial', '00621/00622': '= resultado de la autoliquidación' };

  function vista200() {
    if (!S.sel) return sinEmpresa; mayorPedido = true;
    const R = calc200(), D = R.D, O = R.O, man = R.man, ed = puede();
    const dis = ed ? '' : ' disabled';
    const inp = (k, v, op = {}) => `<input class="presin" type="text" ${op.txt ? 'data-txt="1"' : 'inputmode="decimal"'} data-m200x="${k}" value="${v === undefined || v === null || v === '' ? '' : (op.txt ? esc(v) : fmtIn(v))}" placeholder="${op.ph !== undefined ? op.ph : '0'}" style="width:${op.w || 14}ch${op.txt ? ';text-align:left' : ''}"${dis}>`;
    const sel = (k, v, ops) => `<select data-m200x="${k}"${dis}>${ops.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    // modelo 200 presentado: todas sus casillas leídas del PDF (solo con el PDF entero: los números de casilla se repiten en otras páginas)
    const P200 = R.P200, casP = P200?.est200 ? casLiquidacion200(P200.est200) : {};
    const valP = (cas) => {
      const m = String(cas).match(/^0*(\d{3,5})(?:[/-]|$)/); if (!m) return null; const k = String(+m[1]); if (/-/.test(cas) && !/\//.test(cas) && !['588', '1785'].includes(k)) return null;
      if (k === '601') { const xs = ['601', '603', '605'].map((c0) => casP[c0]).filter((v) => v !== undefined); return xs.length ? r2(xs.reduce((s, v) => s + (+v), 0)) : null; }   // los tres pagos fraccionados
      if (k === '1033') { const a = casP['1033'], mn = casP['1034']; return (a === undefined && mn === undefined) ? null : r2((+a || 0) - (+mn || 0)); }   // adición − minoración
      if (k === '1785') return casP['1766'] !== undefined ? +casP['1766'] : null;    // total de retenciones e ingresos a cuenta
      if (k === '588') return casP['588'] !== undefined ? +casP['588'] : null;
      if (k === '562' && P200?.cuota !== undefined && P200.cuota !== '') return +P200.cuota; if (k === '621' && P200?.res !== undefined && P200.res !== '') return +P200.res;
      return casP[k] !== undefined ? +casP[k] : null;
    };
    // presentado de las correcciones: suma de las líneas del 200 presentado del bloque D (00301/00302 y páginas 12 y 13)
    const corrPresTot = (k) => { const CC0 = R.corrCmp || []; if (!P200?.est200 || !CC0.some((f) => f.pa !== null)) return null; return r2(CC0.reduce((s, f) => s + (f[k] || 0), 0)); };
    const fila = (cas, t, v, op = {}) => {
      const p = op.pres !== undefined ? op.pres : (cas ? valP(cas) : null), dif = (p !== null && typeof v === 'number' && !op.pct && op.html === undefined) ? r2(v - p) : null;
      return `<tr class="${op.tot ? 'tot200' : ''}${op.res ? ' res200' : ''}"><td class="c">${cas ? `<span class="cas200">${esc(cas)}</span>` : ''}</td><td>${esc(t)}</td><td class="n">${op.html !== undefined ? op.html : (op.pct ? nf.format(v * 100) + ' %' : money(v))}</td>
      <td class="n">${p === null ? '' : (op.pct ? nf.format(p) + ' %' : money(p))}</td><td class="n ${dif !== null && Math.abs(dif) > 0.01 ? 'dif-ko' : ''}">${dif === null ? '' : money(dif)}</td><td class="razon">${esc(RAZON[cas] || '')}</td></tr>`;
    };
    const cab = `<table class="tabla m200t"><tbody>
    <tr><td>Ejercicio</td><td class="n">${R.ej}</td></tr>
    <tr><td>¿Entidad de reducida dimensión (art. 101 LIS)?</td><td class="n">${sel('erd', R.erd, ['SÍ', 'NO'])}</td></tr>
    <tr><td>Importe neto de la cifra de negocios del ejercicio anterior (€)</td><td class="n">${inp('incnAnt', man.incnAnt)}</td></tr>
    <tr><td>Tipo de gravamen aplicable</td><td class="n">${sel('tipo', String(R.tipo), ['0.25', '0.23', '0.15', '0.2', '0.1', '0.01'])}</td></tr>
    ${R.EST ? `<tr><td>Correcciones del bloque D (salvo el gasto por IS)</td><td class="n">${sel('corrPdf', man.corrPdf || 'SÍ', ['SÍ', 'NO'])} <span class="man-lbl">SÍ = del 200 presentado · NO = del balance</span></td></tr>
    <tr><td>Reserva de capitalización (01032)</td><td class="n">${sel('capPdf', man.capPdf || 'SÍ', ['SÍ', 'NO'])} <span class="man-lbl">SÍ = la dotada en el 200 presentado · NO = fórmula del art. 25</span></td></tr>` : ''}
    <tr><td colspan="2" class="man-lbl nota200">Correcciones: ${esc(R.corrSrc)} · Reserva de capitalización: ${esc(R.capSrc || '')} · Bases negativas: ${esc(R.binSrc || '')} · Pagos fraccionados: ${esc(R.pfSrc || '')} · Retenciones: ${esc(R.retSrc || '')}</td></tr>
    <tr><td>Importe ingresado (€)</td><td class="n">${money(R.ingresar)}</td></tr><tr><td>Importe a devolver (€)</td><td class="n">${money(R.devolver)}</td></tr></tbody></table>`;
    const liq = `<table class="tabla m200t m200liq"><thead><tr><th>Casilla</th><th>Concepto</th><th>Calculado €</th><th>Presentado (PDF) €</th><th>Diferencia</th><th>Cómo se obtiene</th></tr></thead><tbody>
    ${fila('500', 'Resultado de la cuenta de pérdidas y ganancias (después del Impuesto sobre Sociedades)', D[32])}
    ${fila('301-414', 'Aumentos por correcciones al resultado contable (detalle bloque D)', D[33], { pres: corrPresTot('pa') })}
    ${fila('301-414', 'Disminuciones por correcciones al resultado contable (detalle bloque D)', D[34], { pres: corrPresTot('pd') })}
    ${R.otrasPdf ? fila('', 'Otras correcciones del 200 presentado no detalladas en las páginas 12 y 13 (00550 − 00500 − aumentos + disminuciones del PDF)', R.otrasPdf, { pres: R.otrasPdf }) : ''}
    ${fila('550', 'Base imponible antes de la reserva de capitalización y compensación de BIN', D[35], { tot: 1 })}
    ${fila('1032', 'Reducción por reserva de capitalización (art. 25 LIS)', D[36])}
    ${fila('547', 'Compensación de bases imponibles negativas de periodos anteriores (detalle bloque E)', D[37])}
    ${fila('01033/01034', 'Reserva de nivelación ERD (art. 105 LIS): adición (+) / minoración (−)', D[38])}
    ${fila('552', 'BASE IMPONIBLE', D[39], { tot: 1 })}
    ${fila('558', 'Tipo de gravamen', D[40], { pct: 1 })}
    ${fila('562', 'Cuota íntegra', D[41], { tot: 1 })}
    ${fila('00563-00581', 'Bonificaciones y deducciones por doble imposición (detalle bloque F)', D[42])}
    ${fila('582', 'Cuota íntegra ajustada positiva', D[43])}
    ${fila('619', 'Cuota líquida mínima (informativa: 15% de la base imponible, art. 30 bis LIS)', D[44])}
    ${fila('00588-00590', 'Deducciones para incentivar determinadas actividades (detalle bloque F)', D[45])}
    ${fila('592', 'CUOTA LÍQUIDA', D[46], { tot: 1 })}
    ${fila('599', 'Cuota del ejercicio a ingresar o a devolver', D[47])}
    ${fila('01785-01799', 'Retenciones e ingresos a cuenta del ejercicio', D[48])}
    ${fila('601', 'Pagos fraccionados (modelo 202)', D[49])}
    ${fila('00611/00612', 'Cuota diferencial', D[50], { tot: 1 })}
    ${fila('01586/01587', 'Resultado de la autoliquidación', D[51])}
    ${fila('00621/00622', 'RESULTADO (líquido a ingresar o a devolver)', D[52], { res: 1 })}</tbody></table>`;
    const CC = R.corrCmp || [];
    const tCC = (k) => r2(CC.reduce((s, f) => s + (f[k] || 0), 0));
    const hayPres = !!R.EST, sp = '<span class="sinp">sin presentar</span>';
    const corr = `<p class="leyenda">Calculado = balance de sumas y saldos + importes a mano. Presentado = páginas 12 y 13 del 200 presentado (gasto por IS: casillas 00301/00302). A la liquidación (bloque C) van: ${esc(R.corrSrc)}.</p>
    <table class="tabla m200t"><thead><tr><th rowspan="2">Concepto</th><th rowspan="2">Norma (LIS)</th><th rowspan="2">Naturaleza</th><th colspan="2">Calculado</th><th colspan="2">Presentado</th><th rowspan="2">Diferencia €</th></tr>
      <tr><th>Aumento €</th><th>Disminución €</th><th>Aumento €</th><th>Disminución €</th></tr></thead><tbody>
    ${CC.map((f) => `<tr><td title="${esc(f.casa.length ? 'En el 200 presentado: ' + f.casa.join(' · ') : f.soloPdf ? 'Solo está en el 200 presentado: no se calcula con el balance' : '')}">${esc(f.t)}${f.soloPdf ? ' <span class="man-lbl">(solo en el presentado)</span>' : ''}</td><td class="c">${esc(f.n)}</td><td class="c">${esc(f.k)}</td>
      <td class="n">${guion(f.ca)}</td><td class="n">${guion(f.cd)}</td><td class="n">${f.pa === null ? sp : guion(f.pa)}</td><td class="n">${f.pd === null ? '' : guion(f.pd)}</td>
      <td class="n ${f.dif !== null && Math.abs(f.dif) > 0.005 ? 'dif-ko' : ''}">${f.dif === null ? '' : guion(f.dif)}</td></tr>`).join('')}
    <tr><td>Retribución de fondos propios (art. 15.a) · a mano <span class="man-lbl">(suma en Otros gastos no deducibles)</span></td><td class="c">art. 15.a)</td><td class="c">Permanente</td><td class="n">${inp('nd306', man.nd306)}</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Otros gastos no deducibles · a mano <span class="man-lbl">(suma en Otros gastos no deducibles)</span></td><td class="c">art. 15</td><td class="c">Permanente</td><td class="n">${inp('nd307', man.nd307)}</td><td></td><td></td><td></td><td></td></tr>
    ${[1, 2, 3].map((i) => `<tr><td>${inp('ajT' + i, man['ajT' + i], { txt: 1, ph: 'Otro ajuste (concepto)', w: 36 })}</td><td class="c">${inp('ajN' + i, man['ajN' + i], { txt: 1, ph: 'art.', w: 10 })}</td><td class="c">${sel('ajK' + i, man['ajK' + i] || 'Permanente', ['Permanente', 'Temporaria'])}</td><td class="n">${inp('ajA' + i, man['ajA' + i])}</td><td class="n">${inp('ajD' + i, man['ajD' + i])}</td><td></td><td></td><td></td></tr>`).join('')}
    <tr class="tot200"><td colspan="3">TOTALES</td><td class="n">${money(tCC('ca'))}</td><td class="n">${money(tCC('cd'))}</td><td class="n">${hayPres ? money(tCC('pa')) : sp}</td><td class="n">${hayPres ? money(tCC('pd')) : ''}</td><td class="n ${hayPres && Math.abs(tCC('dif')) > 0.005 ? 'dif-ko' : ''}">${hayPres ? money(tCC('dif')) : ''}</td></tr>
    <tr><td colspan="3">Totales que van a la liquidación (casillas 00301-00414)</td><td class="n">${money(R.J57)}</td><td class="n">${money(R.K57)}</td><td colspan="3"></td></tr></tbody></table>`;
    const PB = R.binPres, dB = (x, y) => ((x === null || x === undefined || y === null || y === undefined) ? '' : `<span class="${Math.abs(r2(x - y)) > 0.005 ? 'dif-ko' : ''}">${guion(r2(x - y))}</span>`);
    const binRows = R.bin.map((b) => {
      const p = PB && PB[b[0]];
      return `<tr><td class="c">${b[0]}</td><td class="n ${b[4] === 'pdf' ? 'pdfok' : ''}" title="${b[4] === 'pdf' ? 'Del 200 del ejercicio anterior' : b[4] === 'man' ? 'Escrito a mano' : 'De la cuenta 121 del balance'}">${inp('bin' + b[0], b[4] === 'man' ? man['bin' + b[0]] : (b[1] || ''), { ph: '-' })}</td><td class="n">${guion(b[2])}</td><td class="n">${guion(b[3])}</td>
      <td class="n">${p ? guion(p.ini) : ''}</td><td class="n">${p && p.apl !== null ? guion(p.apl) : ''}</td><td class="n">${p && p.fut !== null ? guion(p.fut) : ''}</td>
      <td class="n">${p ? dB(b[1], p.ini) : ''}</td><td class="n">${p && p.apl !== null ? dB(b[2], p.apl) : ''}</td><td class="n">${p && p.fut !== null ? dB(b[3], p.fut) : ''}</td></tr>`;
    }).join('');
    const sP = (k) => (PB ? r2(Object.values(PB).reduce((s, x) => s + (x[k] || 0), 0)) : null);
    const bin = `<p class="leyenda">Pendiente al inicio tomado de: ${esc(R.binSrc)}. Presentado: ${PB ? esc(R.binPresSrc) : 'no está en Presentados el 200 de ' + R.ej}. Puedes corregir el pendiente al inicio; si lo borras vuelve al dato automático.</p><table class="tabla m200t"><thead>
    <tr><th rowspan="2">Ejercicio origen</th><th colspan="3">Calculado ${R.ej}</th><th colspan="3">Presentado ${R.ej}</th><th colspan="3">Diferencia (calculado − presentado)</th></tr>
    <tr><th>Pendiente al inicio (200 de ${R.ej - 1})</th><th>Compensada</th><th>Pendiente futuros</th><th>Pendiente al inicio</th><th>Compensada</th><th>Pendiente futuros</th><th>Inicio</th><th>Compensada</th><th>Futuros</th></tr></thead><tbody>
    ${binRows}
    <tr class="tot200"><td>TOTAL</td><td class="n">${money(r2(R.bin.reduce((s, b) => s + b[1], 0)))}</td><td class="n">${money(R.H22)}</td><td class="n">${money(r2(R.bin.reduce((s, b) => s + b[3], 0)))}</td>
      <td class="n">${PB ? money(sP('ini')) : ''}</td><td class="n">${PB ? money(sP('apl')) : ''}</td><td class="n">${PB ? money(sP('fut')) : ''}</td>
      <td class="n">${PB ? dB(r2(R.bin.reduce((s, b) => s + b[1], 0)), sP('ini')) : ''}</td><td class="n">${PB ? dB(R.H22, sP('apl')) : ''}</td><td class="n">${PB ? dB(r2(R.bin.reduce((s, b) => s + b[3], 0)), sP('fut')) : ''}</td></tr>
    <tr><td colspan="9">Porcentaje límite según INCN (art. 26 LIS)</td><td class="n">${nf.format(R.H23 * 100)} %</td></tr>
    <tr><td colspan="9">Importe máximo compensable en este ejercicio</td><td class="n">${money(R.H24)}</td></tr>
    <tr><td colspan="9">Comprobación del límite</td><td class="n">${R.H22 <= R.H24 ? 'Correcto' : '⚠ La compensación excede el límite del art. 26 LIS'}</td></tr></tbody></table>`;
    const f2 = (t, v, op = {}) => `<tr class="${op.tot ? 'tot200' : ''}"><td>${esc(t)}</td><td class="n">${op.html !== undefined ? op.html : (op.pct ? nf.format(v * 100) + ' %' : money(v))}</td></tr>`;
    const cap = `<table class="tabla m200t"><thead><tr><th colspan="2">RESERVA DE CAPITALIZACIÓN – LÍMITES DEL ART. 25 LIS</th></tr></thead><tbody>
    ${f2('Incremento de los fondos propios (€)', O[11])}${f2('Incremento de la plantilla media total (%)', 0, { html: inp('plantilla', man.plantilla, { w: 8 }) })}
    ${f2('% de reducción aplicable sobre el incremento de fondos propios', O[13], { pct: 1 })}${f2('Reducción teórica (incremento FP × %)', O[14])}
    ${f2('% límite sobre la base imponible positiva previa', O[15], { pct: 1 })}${f2('Límite máximo aplicable en el ejercicio', O[16])}
    ${f2('REDUCCIÓN APLICABLE (menor de los dos importes)', O[17], { tot: 1 })}${f2('Pendiente de aplicar en los 2 ejercicios siguientes', O[18])}
    <tr class="cab200"><td colspan="2">CÁLCULO DEL INCREMENTO DE FONDOS PROPIOS (art. 25.2 LIS)</td></tr>
    ${f2('Fondos propios al CIERRE del ejercicio (balance)', O[34])}${f2('(−) Resultado del ejercicio incluido en esos fondos propios', O[35])}${f2('Fondos propios al cierre sin el resultado del ejercicio', O[36])}
    ${f2('Fondos propios al INICIO del ejercicio (balance)', O[37])}${f2('(−) Resultado del ejercicio anterior incluido en esos fondos propios', O[38])}${f2('Fondos propios al inicio sin el resultado del ejercicio anterior', O[39])}
    ${f2('DIFERENCIA DE FONDOS PROPIOS', O[40], { tot: 1 })}
    ${f2('Aportaciones de socios', O[42])}${f2('Ampliaciones de capital o fondos propios por compensación de créditos', 0, { html: inp('o43', man.o43) })}
    ${f2('Ampliaciones de fondos propios por operaciones con acciones propias o de reestructuración', O[44])}${f2('Reservas de carácter legal o estatutario', O[45])}
    ${f2('Reserva de nivelación (art. 105 LIS) y reserva indisponible de la ZEC', O[46])}${f2('Fondos propios por emisión de instrumentos financieros compuestos', 0, { html: inp('o47', man.o47) })}
    ${f2('Variaciones por activos por impuesto diferido de cambios de tipo de gravamen', 0, { html: inp('o48', man.o48) })}
    ${f2('Total partidas no computables', O[49])}${f2('INCREMENTO DE FONDOS PROPIOS COMPUTABLE', O[50], { tot: 1 })}
    ${f2('¿Se mantiene el incremento durante 3 años y se dota la reserva indisponible?', 0, { html: sel('mantiene', O[51], ['SÍ', 'NO']) })}</tbody></table>`;
    const niv = `<table class="tabla m200t"><thead><tr><th colspan="2">RESERVA DE NIVELACIÓN – LÍMITES DEL ART. 105 LIS</th></tr></thead><tbody>
    ${f2('¿Cumple los requisitos (ERD art. 101 y tipo art. 29.1)?', 0, { html: O[22] })}${f2('Base imponible positiva previa (tras reserva de capitalización y BIN)', O[23])}
    ${f2('% máximo de minoración', O[24], { pct: 1 })}${f2('Límite por porcentaje (10% de la base)', O[25])}${f2('Límite absoluto anual (1.000.000 €)', O[26])}
    ${f2('MINORACIÓN MÁXIMA APLICABLE', O[27], { tot: 1 })}${f2('Minoración aplicada en este ejercicio (−) – casilla 01034 · vacío = la máxima', 0, { html: inp('minNiv', man.minNiv, { ph: 'máxima' }) })}
    ${f2('Adición de reservas dotadas en los 5 ejercicios anteriores (+) – casilla 01033', 0, { html: inp('adicNiv', man.adicNiv) })}
    ${f2('IMPORTE NETO A LA LIQUIDACIÓN (adición − minoración)', O[30], { tot: 1 })}</tbody></table>`;
    const dedT = `<table class="tabla m200t"><thead><tr><th>Concepto</th><th>Norma</th><th>Casilla</th><th>Pendiente al inicio €</th><th>Generada en el ejercicio €</th><th>Límite aplicable</th><th>Aplicada – bonif. y DDI €</th><th>Aplicada – incentivos €</th><th>Pendiente futuro €</th></tr></thead><tbody>
    ${R.ded.map((x) => `<tr><td>${esc(x.t)}</td><td class="c">${esc(x.n)}</td><td class="c">${x.c}</td><td class="n">${guion(x.E)}</td><td class="n">${guion(x.F)}</td><td class="n">${guion(x.G)}</td><td class="n">${guion(x.H)}</td><td class="n">${guion(x.I)}</td><td class="n">${guion(x.J)}</td></tr>`).join('')}
    <tr class="tot200"><td colspan="3">TOTALES</td>${['E', 'F'].map((k) => `<td class="n">${money(r2(R.ded.reduce((s, x) => s + x[k], 0)))}</td>`).join('')}<td></td>${['H', 'I', 'J'].map((k) => `<td class="n">${money(r2(R.ded.reduce((s, x) => s + (x[k] || 0), 0)))}</td>`).join('')}</tr></tbody></table>`;
    const asi = `<table class="tabla m200t"><thead><tr><th>Cuenta</th><th>Denominación</th><th>Debe</th><th>Haber</th></tr></thead><tbody>
    ${R.asiento.map((a) => `<tr><td class="c">${a[0]}</td><td>${esc(a[1])}</td><td class="n">${a[2] ? money(a[2]) : ''}</td><td class="n">${a[3] ? money(a[3]) : ''}</td></tr>`).join('')}
    <tr class="tot200"><td colspan="2">SUMAS</td><td class="n">${money(r2(R.asiento.reduce((s, a) => s + (a[2] || 0), 0)))}</td><td class="n">${money(r2(R.asiento.reduce((s, a) => s + (a[3] || 0), 0)))}</td></tr></tbody></table>`;
    const cmp = `<table class="tabla m200t"><thead><tr><th>Concepto</th><th>Calculado</th><th>Presentado</th><th>Diferencia</th></tr></thead><tbody>
    ${[['Cuota íntegra (00562)', D[41], R.pres.ci], ['Resultado (00621)', D[52], R.pres.res]].map(([t, a, p]) => `<tr><td>${t}</td><td class="n">${money(a)}</td><td class="n">${p === null ? sp : money(p)}</td><td class="n ${p !== null && Math.abs(a - p) > 0.01 ? 'dif-ko' : ''}">${p === null ? '' : money(r2(a - p))}</td></tr>`).join('')}</tbody></table>`;
    const contacto = `<table class="tabla m200t"><tbody><tr><td>Persona de contacto</td><td class="n">${inp('contacto', man.contacto, { txt: 1, w: 28, ph: '' })}</td></tr><tr><td>Teléfono</td><td class="n">${inp('tel', man.tel, { txt: 1, w: 16, ph: '' })}</td></tr><tr><td>Correo electrónico</td><td class="n">${inp('email', man.email, { txt: 1, w: 28, ph: '' })}</td></tr></tbody></table>`;
    const blq = (t, h, cls = '') => `<div class="blq200 ${cls}"><h3 class="bt">${t}</h3>${h}</div>`;
    // selector del ejercicio del modelo 200
    const def = ejPanel() - 1, ys = new Set([def, R.ej, ...efAnios(), ...S.registros.filter((r) => r.tipo === 'prs' && r.empresa_id === S.sel && r.datos?.['200|A']).map((r) => r.ejercicio - 1)].filter(Boolean));
    const selEj = `<div class="bar"><label><b>Ejercicio del modelo 200</b> <select data-m200ej="1">${[...ys].sort((a, b) => b - a).map((a) => `<option value="${a}"${a === R.ej ? ' selected' : ''}>${a}${efLineas(a).length ? ' · con sumas y saldos' : ' · sin sumas y saldos'}</option>`).join('')}</select></label>
      <span class="leyenda">Por defecto, el ejercicio anterior al del panel. Usa el balance de sumas y saldos de ese año.</span></div>`;
    // análisis del IS: ajustes extracontables, límite de compensación de BINs y tipo efectivo
    const analisis = (() => {
      const n = (v) => money(r2(v || 0)), pc = (v) => (isFinite(v) ? (v * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %' : '—');
      const C = CC.filter((f) => Math.abs(f.ca || 0) + Math.abs(f.cd || 0) + Math.abs(f.pa || 0) + Math.abs(f.pd || 0) > 0.005), tA = C.reduce((x, f) => x + (f.ca || 0), 0), tD = C.reduce((x, f) => x + (f.cd || 0), 0);
      const res = +D[32] || 0, base0 = +D[35] || 0, capi = +D[36] || 0, comp = +D[37] || 0, bi = +D[39] || 0, ci = +D[41] || 0, cl = +D[46] || 0;
      const gIS = C.filter((f) => /impuesto sobre (el )?(beneficio|sociedades)/i.test(f.t || '')).reduce((x, f) => x + (f.ca || 0) - (f.cd || 0), 0), resAI = res + gIS;
      const pct = R.incnAnt > 60000000 ? 0.25 : R.incnAnt >= 20000000 ? 0.5 : 0.7, lim = base0 - capi > 0 ? Math.max(1000000, pct * (base0 - capi)) : 0;
      const pendIni = (R.bin || []).reduce((x, b) => x + (+b[3] || 0), 0), pendFin = r2(pendIni - comp + (bi < 0 ? -bi : 0));
      const filasC = C.map((f) => `<tr><td>${esc(f.t || '')}</td><td class="n">${f.ca ? n(f.ca) : ''}</td><td class="n">${f.cd ? n(f.cd) : ''}</td></tr>`).join('');
      return `<section class="block"><h3 class="bt">Análisis del Impuesto sobre Sociedades ${R.ej} · ajustes extracontables, BINs y tipo efectivo</h3><div class="conc-flex" style="align-items:flex-start;gap:24px;flex-wrap:wrap">
       <div><h4 style="margin:4px 0">Del resultado contable a la base imponible</h4><table class="tabla m200t" style="width:auto"><thead><tr><th>Ajuste extracontable</th><th>Aumentos</th><th>Disminuciones</th></tr></thead><tbody>
        <tr class="tot200"><td>Resultado contable después de impuestos [00500]</td><td class="n" colspan="2">${n(res)}</td></tr>${filasC || '<tr><td colspan="3" class="c">Sin ajustes</td></tr>'}
        <tr class="tot200"><td>Total ajustes</td><td class="n">${n(tA)}</td><td class="n">${n(tD)}</td></tr>
        <tr class="tot200"><td>Base imponible previa [00550]</td><td class="n" colspan="2">${n(base0)}</td></tr>
        <tr><td colspan="3" class="leyenda">${Math.abs(r2(res + tA - tD) - r2(base0)) > 0.01 ? '⚠ resultado + ajustes = ' + n(res + tA - tD) : '✓ cuadra'}</td></tr></tbody></table></div>
       <div><h4 style="margin:4px 0">Compensación de bases imponibles negativas (art. 26 LIS)</h4><table class="tabla m200t" style="width:auto"><tbody>
        <tr><td>Cifra de negocios del ejercicio anterior</td><td class="n">${n(R.incnAnt)}</td></tr>
        <tr><td>Porcentaje de compensación</td><td class="n">${pc(pct)}</td></tr>
        <tr><td>Base previa − reserva de capitalización</td><td class="n">${n(base0 - capi)}</td></tr>
        <tr class="tot200"><td>Límite de compensación (mínimo 1.000.000 €)</td><td class="n">${n(lim)}</td></tr>
        <tr><td>BINs pendientes al inicio</td><td class="n">${n(pendIni)}</td></tr>
        <tr><td>Compensadas en el ejercicio [00547]</td><td class="n">${n(comp)}</td></tr>
        <tr><td>Margen sin usar del límite</td><td class="n">${n(Math.max(0, Math.min(lim, pendIni) - comp))}</td></tr>
        <tr class="tot200"><td>BINs pendientes al final${bi < 0 ? ' (incluida la de este ejercicio)' : ''}</td><td class="n">${n(pendFin)}</td></tr></tbody></table></div>
       <div><h4 style="margin:4px 0">Tipo efectivo</h4><table class="tabla m200t" style="width:auto"><tbody>
        <tr><td>Tipo de gravamen nominal</td><td class="n">${pc(+R.tipo)}</td></tr>
        <tr><td>Resultado contable antes de impuestos</td><td class="n">${n(resAI)}</td></tr>
        <tr><td>Cuota íntegra [00562] / base imponible</td><td class="n">${bi > 0 ? pc(ci / bi) : '—'}</td></tr>
        <tr class="tot200"><td>Cuota líquida [00592] / resultado antes de impuestos</td><td class="n">${resAI > 0 ? pc(cl / resAI) : '—'}</td></tr>
        <tr><td>Cuota líquida / base imponible</td><td class="n">${bi > 0 ? pc(cl / bi) : '—'}</td></tr></tbody></table>
        <p class="leyenda">Tipo efectivo: lo que se paga realmente tras ajustes, BINs, reservas, bonificaciones y deducciones.</p></div>
      </div></section>`;
    })();
    return `${selEj}${bloqueAvisos(R.avisos)}<section class="block"><h3 class="bt">Comparación con el 200 presentado ${R.ej}</h3>${cmp}${liq}</section>
    <section class="block"><h3 class="bt">MODELO 200 – IMPUESTO SOBRE SOCIEDADES. DECLARACIÓN-LIQUIDACIÓN ANUAL</h3><div class="grid200">
      ${blq('A. Datos de cabecera', cab)}${blq('B. Datos de contacto', contacto)}
      ${blq('C. Liquidación del impuesto', liq, 'ancho200')}${blq('D. Detalle de correcciones al resultado de la cuenta de pérdidas y ganancias', corr, 'ancho200')}
      ${blq('E. Bases imponibles negativas', bin)}${blq('F. Detalle de bonificaciones, deducciones por doble imposición y deducciones por incentivos', dedT)}
      <div class="fila3-200">${blq('Reserva de capitalización', cap)}${blq('Reserva de nivelación', niv)}${blq('G. Asiento contable', asi)}</div>
      ${blq('Domiciliación del pago', domi('200', D[52]) || '<p class="leyenda">El resultado no sale a ingresar.</p>')}
    </div></section>
    ${modelo200Completo(R)}
    ${analisis}
    <section class="block"><h3 class="bt">Todas las casillas del modelo 200 presentado ${R.ej}${P200?.pdf ? ' · ' + esc(P200.pdf) : ''}</h3>${(() => {
      if (!P200 || !Object.keys(casP).length) return '<p class="leyenda">Incorpora en Presentados el PDF del modelo 200 de ' + R.ej + ' para ver aquí todas sus casillas y compararlas con el cálculo.</p>';
      const usadas = new Set(['500', '550', '1032', '547', '1033', '1034', '552', '558', '562', '582', '619', '592', '599', '601', '611', '612', '1586', '1587', '621', '622']);
      const fs = Object.entries(casP).filter(([k, v]) => /^\d{3,5}$/.test(k) && +k >= 100 && v !== null && v !== '').sort((a, b) => +a[0] - +b[0]);
      return `<p class="leyenda">${fs.length} casillas leídas del PDF. Las marcadas con ● se comparan con el cálculo de esta pestaña.</p><div class="cas200-grid">${fs.map(([k, v]) => `<div class="${usadas.has(k) ? 'usada' : ''}"><span class="cas200">${String(k).padStart(5, '0')}</span> ${esc(NOM200[k] || '')}<b>${money(+v)}</b>${usadas.has(k) ? ' ●' : ''}</div>`).join('')}</div>`;
    })()}</section>`;
  }

  // ================= Modelo 202 · como el impreso de la AEAT (Datos adicionales, A) art. 40.2, B) art. 40.3) =================
  let per202 = null;
  const pyg202 = (cl) => { const o = datos202()['ss-' + cl]; if (!o) return null; if (o.norm) return { name: o.name, norm: o.norm, lines: [] }; return { name: o.name, lines: o.lines.map(([digitos, ap, debe, haber, cierre]) => ({ digitos, ap, debe, haber, cierre })) }; };
  const DAT202 = [['l49', 'Entidad que aplica el régimen de la Ley 49/2002, de 23 de diciembre'], ['l11', 'Entidad que aplica el régimen de la Ley 11/2009, de 26 de octubre'],
    ['a50', 'Entidad de capital-riesgo que aplica el régimen fiscal especial del art. 50 LIS'], ['nav', 'Entidad que aplica el régimen de las entidades navieras en función del tonelaje'],
    ['erd', 'Entidad que cumpla los requisitos para la aplicación de los incentivos de empresa de reducida dimensión (art. 101 LIS) y aplique el tipo de gravamen específico previsto para estas entidades'],
    ['m6', 'Importe neto de la cifra de negocios de los doce meses anteriores a la fecha de inicio del período impositivo es superior a 6.000.000 euros'], ['coop', 'Cooperativa fiscalmente protegida'],
    ['otras', 'Marque esta casilla si concurre ALGUNA de las circunstancias (RIC o bonificación art. 26 Ley 19/1994, régimen ZEC, bonificación Ceuta y Melilla art. 33 LIS, art. 17.2 LIS, régimen Cap. XIV Tít. VII LIS, bonificación art. 34 LIS)'],
    ['m1', 'Entidad con importe neto de la cifra de negocios del periodo impositivo inmediato anterior inferior a 1 millón de euros'], ['mas1', 'Otras entidades con posibilidad de aplicar más de un tipo impositivo']];
  // periodo del 202 según el periodo general: ene-mar / 1T → 1P · abr-sep / 2T-3T → 2P · oct-dic / 4T → 3P
  const per202De = (p) => { const m = /^\d\d$/.test(p) ? +p : /^[1-4]T$/.test(p) ? +p[0] * 3 : 0; return m >= 10 ? '3P' : m >= 4 ? '2P' : '1P'; };
  const FIN202 = { '1P': 3, '2P': 9, '3P': 11 };
  // retenciones soportadas desde el 1 de enero hasta el fin del periodo del 202 (1P marzo, 2P septiembre, 3P noviembre): cargos de 4730.01 a 4730.04 del extracto
  function ret202(ej, per) {
    const fin = FIN202[per]; if (!fin) return 0;
    const a = `${ej}-01-01`, b = `${ej}-${String(fin + 1).padStart(2, '0')}-01`, C4 = ['4730.01', '4730.02', '4730.03', '4730.04'];
    return r2((mayor() || []).filter((l) => l.fecha >= a && l.fecha < b && C4.some((p) => casaCta(p, String(l.cuenta ?? '').replace(/\D/g, ''))) && !/^I[-\s]|^OD-/i.test(String(l.asiento || ''))).reduce((t, l) => t + (l.debe || 0), 0));
  }
  function calc202() {
    const ej = ejPanel(), E = empresa() ?? {}, st = datos202(), per = per202 || per202De(S.periodo), cl = ej + '-' + per;
    const P = st[cl] || {}, A = (st['dat-' + ej] || {});
    const v = (k, def = 0) => (P[k] === undefined || P[k] === '' ? def : +P[k]);
    const modal = P.modal || (E.tipo === 'PYME' ? '40.2' : '40.3');
    const incn = A.incn || (E.tipo === 'PYME' ? '' : '10-20');            // cifra de negocios de los 12 meses anteriores
    const grande10 = ['10-20', '20-60', '60'].includes(incn);
    const C = {}, ant = ['1P', '2P', '3P'].slice(0, ['1P', '2P', '3P'].indexOf(per));
    const pagosAnt = r2(ant.reduce((s, p) => s + (presDe(ej, '202', p, 'res') || 0), 0));
    const pres = presDe(ej, '202', per, 'res');
    if (modal === '40.2') {
      const ejIS = per === '1P' ? ej - 2 : ej - 1, cuotaIS = presDe(ejIS + 1, '200', 'A', 'cuota');   // el 200 de ejIS se presenta (y se guarda) en ejIS + 1
      C['01'] = v('01', cuotaIS === null ? 0 : cuotaIS); C['02'] = v('02');
      C['03'] = r2(Math.max(0, C['01'] * 0.18 - C['02']));
      C['34'] = C['03'];
      return { ej, per, cl, modal, incn, grande: grande10, C, A, P, ejIS, cuotaIS, pagosAnt, pres };
    }
    let resPyG = null, gastoIS = null, isCalc = false, tipoISc = 25; const pp = pyg202(cl);
    try {
      const tipoIS = Number.isFinite(+A.tipo) && A.tipo !== '' && A.tipo !== undefined ? +A.tipo : 25;
      if (pp && pp.norm) { if (pp.norm.is) { resPyG = pp.norm.res; gastoIS = r2(-pp.norm.is); } else { gastoIS = pp.norm.res > 0 ? r2(pp.norm.res * tipoIS / 100) : 0; resPyG = r2(pp.norm.res - gastoIS); isCalc = true; tipoISc = tipoIS; } }   /* PyG sin gasto por IS: 05 = 25 % del resultado y 04 = resultado − 05 (así la 13 = resultado de la PyG) */
      else if (pp) { const X = efCtx(pp.lines), res = X.val('I', 108), is = r2(-X.val('I', 101)); if (Math.abs(is) > 0.005) { resPyG = res; gastoIS = is; } else { gastoIS = res > 0 ? r2(res * tipoIS / 100) : 0; resPyG = r2(res - gastoIS); isCalc = true; tipoISc = tipoIS; } }   /* el sumas y saldos del periodo aún no trae el IS contabilizado: 05 = tipo de gravamen × resultado antes de impuestos, 04 = resultado − 05 y 13 = resultado antes de impuestos */
    } catch { /* PyG ilegible */ }
    C['04'] = v('04', resPyG === null ? 0 : resPyG);
    C['05'] = v('05', gastoIS !== null && gastoIS > 0 ? gastoIS : 0); C['06'] = v('06', gastoIS !== null && gastoIS < 0 ? -gastoIS : 0); C['67'] = v('67'); C['37'] = v('37'); C['07'] = v('07'); C['08'] = v('08');
    C['38'] = r2(C['05'] + C['67'] + C['07']); C['39'] = r2(C['06'] + C['37'] + C['08']);
    C['13'] = r2(C['04'] + C['38'] - C['39']); C['44'] = v('44'); C['14'] = v('14'); C['45'] = v('45'); C['46'] = v('46');
    const mas1 = !!A.mas1;
    if (!mas1) {
      C['16'] = r2(Math.max(0, C['13'] - C['44'] - C['14'] + C['45'] - C['46']));
      C['17'] = v('17', grande10 ? 24 : 17); C['47'] = v('47'); C['40'] = v('40'); C['48'] = v('48'); C['49'] = v('49');
      C['18'] = r2(C['16'] * C['17'] / 100 + C['47'] - C['40'] + C['48'] - C['49']);
    } else {
      [['20', '21', '22'], ['23', '24', '25'], ['61', '62', '63'], ['64', '65', '66']].forEach(([b, p, i]) => { C[b] = v(b); C[p] = v(p); C[i] = r2(C[b] * C[p] / 100); });
      C['19'] = r2(C['20'] + C['23'] + C['61'] + C['64']); C['50'] = v('50'); C['42'] = v('42'); C['51'] = v('51'); C['52'] = v('52');
      C['26'] = r2(C['22'] + C['25'] + C['63'] + C['66'] + C['50'] - C['42'] + C['51'] - C['52']);
    }
    C['27'] = v('27'); C['28'] = v('28', ret202(ej, per)); C['29'] = v('29', 100);   /* 28: retenciones e ingresos a cuenta del ejercicio hasta el fin del periodo (cuentas 4730.01 a 4730.04) */ C['30'] = v('30', pagosAnt); C['31'] = v('31');
    C['32'] = r2(((mas1 ? C['26'] : C['18']) - C['27'] - C['28']) * C['29'] / 100 - C['30'] - C['31']);
    // mínimo a ingresar (cifra de negocios ≥ 10 millones): 23 % del resultado positivo de la cuenta de pérdidas y ganancias del periodo − pagos anteriores (disp. adic. 14ª LIS)
    const pctMin = v('pctMin', 23);
    C['33'] = grande10 ? r2(Math.max(0, Math.max(0, C['04']) * pctMin / 100 - C['30'] - C['31'])) : 0;
    C['34'] = r2(Math.max(0, C['32'], C['33']));
    return { ej, per, cl, modal, incn, grande: grande10, C, A, P, mas1, pctMin, resPyG, gastoIS, isCalc, tipoISc, pyg: pp, pagosAnt, pres };
  }

  function vista202() {
    if (!S.sel) return sinEmpresa; mayorPedido = true;
    const R = calc202(), C = R.C, P = R.P, A = R.A, e = empresa(), ed = puede(), dis = ed ? '' : ' disabled';
    const box = (k, on, ttl) => `<label class="chk202"><input type="checkbox" data-dat202="${k}"${on ? ' checked' : ''}${dis}> ${esc(ttl)}</label>`;
    const cas = (n, opts = {}) => {
      const man = P[n] !== undefined && P[n] !== '';
      return `<span class="c202"><b>${n}</b>${opts.calc ? `<span class="v">${opts.pct ? nf.format(C[n]) : money(C[n])}</span>` : `<input class="presin${man ? ' editado' : ''}" data-m202="${n}" value="${C[n] === undefined || (!man && !C[n]) ? '' : fmtIn(C[n])}" placeholder="${opts.ph || ''}"${dis}>`}</span>`;
    };
    const L = (t, n, o) => `<div class="l202"><span class="t">${t}</span>${cas(n, o)}</div>`;
    const L2 = (t, a, b, o = {}) => `<div class="l202 dos"><span class="t">${t}</span>${a ? cas(a, o.a || {}) : '<span class="c202 vacia"></span>'}${b ? cas(b, o.b || {}) : '<span class="c202 vacia"></span>'}</div>`;
    const dat = `<div class="sec202">Datos adicionales (3)</div><div class="box202">${DAT202.map(([k, t]) => box(k, !!A[k] || (k === 'm6' && R.grande), t)).join('')}
    <div class="l202" style="grid-template-columns:110px 1fr"><span class="c202" style="grid-template-columns:1fr"><input class="presin" data-dat202tipo="1" value="${esc(A.tipo ?? 25)}" style="width:8ch"${dis}></span><span class="t">Tipo de gravamen del Impuesto sobre Sociedades del ejercicio en curso</span></div>
    <div class="sub202"><b>Importe neto de la cifra de negocios</b> en los doce meses anteriores a la fecha de inicio del período impositivo:</div>
    ${[['10-20', 'Igual o superior a 10 millones de euros e inferior a 20 millones de euros'], ['20-60', 'Igual o superior a 20 millones de euros e inferior a 60 millones de euros'], ['60', 'Igual o superior a 60 millones de euros']].map(([k, t]) => `<label class="chk202"><input type="radio" name="incn202" data-incn202="${k}"${R.incn === k ? ' checked' : ''}${dis}> - ${t}</label>`).join('')}
    <label class="chk202"><input type="radio" name="incn202" data-incn202=""${!R.incn ? ' checked' : ''}${dis}> - Inferior a 10 millones de euros</label></div>`;
    const mod = `<div class="sec202">Liquidación (4)</div><div class="box202">
    <label class="chk202"><input type="radio" name="mod202" data-modal202="40.2"${R.modal === '40.2' ? ' checked' : ''}${dis}> Liquidación modalidad artículo 40.2 LIS</label>
    <label class="chk202"><input type="radio" name="mod202" data-modal202="40.3"${R.modal === '40.3' ? ' checked' : ''}${dis}> Liquidación modalidad artículo 40.3 LIS</label>`;
    let liq;
    if (R.modal === '40.2') {
      liq = `<div class="h202">A) Cálculo del pago fraccionado: modalidad artículo 40.2 LIS</div>
      ${L('Base del pago fraccionado <span class="man-lbl">(' + (R.cuotaIS !== null
        ? 'casilla 00562 del 200 del ejercicio ' + R.ejIS + ' (presentado en julio de ' + (R.ejIS + 1) + '), pestaña Presentados: ' + money(R.cuotaIS)
        : 'no está el 200 del ejercicio ' + R.ejIS + ' en Presentados: incorpóralo o escribe la cuota') + ')</span>'
        + (P['01'] !== undefined && P['01'] !== '' && R.cuotaIS !== null && Math.abs(+P['01'] - R.cuotaIS) > 0.005 ? ` <button class="mini-b" data-act="m-202usar" data-k="01">usar la 00562 (${money(R.cuotaIS)})</button>` : ''), '01')}
      ${L('Resultado de la declaración anterior (exclusivamente si ésta es complementaria)', '02')}
      ${L('A ingresar <span class="man-lbl">(18 % de [01] − [02])</span>', '03', { calc: true })}</div>`;
    } else {
      liq = `<div class="h202">B) Cálculo del pago fraccionado: modalidad artículo 40.3 LIS</div>
      ${L('Resultado contable (después del IS e IC) <span class="man-lbl">' + (R.resPyG !== null ? (R.isCalc ? '(' + esc(R.pyg.name) + ' · resultado antes de impuestos ' + money(r2(R.resPyG + R.gastoIS)) + ' − IS ' + R.tipoISc + ' % ' + money(R.gastoIS) + ')' : '(PyG del periodo, ' + esc(R.pyg.name) + ' · D) Resultado del ejercicio: ' + money(R.resPyG) + ')') : '(suelta arriba el Excel con la PyG o el balance de sumas y saldos de los ' + FIN202[R.per] + ' primeros meses, o escríbelo)') + '</span>', '04')}
      <div class="l202 dos cab"><span class="t">Correcciones al resultado contable:</span><span class="c202h">Aumentos</span><span class="c202h">Disminuciones</span></div>
      ${L2('Corrección por Impuesto sobre Sociedades (IS)' + (R.gastoIS !== null ? ' <span class="man-lbl">' + (R.isCalc ? '(' + R.tipoISc + ' % del resultado antes de impuestos del archivo, que no trae el IS contabilizado)' : '(PyG del periodo · 18. Impuesto sobre beneficios: ' + money(-R.gastoIS) + ')') + '</span>' : ''), '05', '06')}${L2('Corrección por Impuesto Complementario (IC)', '67', null)}
      ${L2('Reversión del 30% del importe de los gastos de amortiz. contable (art. 7 Ley 16/2012)', null, '37')}${L2('Resto correcciones al resultado contable, excepto comp. BI negativa ej. ant.', '07', '08')}
      ${L2('TOTAL', '38', '39', { a: { calc: true }, b: { calc: true } })}
      ${L('Base imponible previa', '13', { calc: true })}${L('Remanente reserva de capitalización no aplicada por insuficiencia de base', '44')}${L('Compensación de bases imponibles negativas de periodos anteriores', '14')}
      ${L2('Reserva de nivelación (art. 105 LIS) (sólo ERD que apliquen el tipo de gravamen específico)', '45', '46')}
      ${!R.mas1 ? `<div class="h202">B.1) Caso general (entidades con porcentaje único)</div>
        ${L('Base del pago fraccionado', '16', { calc: true })}${L('Porcentaje <span class="man-lbl">(' + (R.grande ? '24 %: cifra de negocios ≥ 10 millones' : '17 %: 5/7 del tipo de gravamen') + ')</span>', '17', { ph: R.grande ? '24' : '17' })}
        ${L('Dotaciones del art. 11.12 LIS (DA 7ª Ley 20/1990) (sólo cooperativas)', '47')}${L('Compensación de cuotas negativas de periodos anteriores (sólo cooperativas)', '40')}
        ${L2('Reserva de nivelación (art. 105 LIS) convertido en cuotas', '48', '49')}
        ${L('Resultado previo (clave ([16] x [17]) + [47] − [40] + [48] − [49])', '18', { calc: true })}`
        : `<div class="h202">B.2) Casos específicos (entidades con más de un porcentaje)</div>
        ${L('Base del pago fraccionado', '19', { calc: true })}
        ${[['20', '21', '22', 1], ['23', '24', '25', 2], ['61', '62', '63', 3], ['64', '65', '66', 4]].map(([b, p, i, n]) => `<div class="l202 tres"><span class="t">Base a tipo ${n}</span>${cas(b)}<span class="t2">Porcentaje</span>${cas(p)}${cas(i, { calc: true })}</div>`).join('')}
        ${L('Dotaciones del art. 11.12 LIS (sólo cooperativas)', '50')}${L('Compensación de cuotas negativas de periodos anteriores (sólo cooperativas)', '42')}
        ${L2('Reserva de nivelación (art. 105 LIS)', '51', '52')}
        ${L('Resultado previo (claves [22] + [25] + [63] + [66] + [50] − [42] + [51] − [52])', '26', { calc: true })}`}
      ${L('Bonificaciones correspondientes al período computado (total)', '27')}
      ${L('Retenciones e ingresos a cuenta practicados sobre ingresos período computado (total)', '28')}
      ${L('Volumen de operaciones en Territorio Común (%)', '29', { ph: '100' })}
      ${L('Pagos fraccionados anteriores correspondiente al período computado en Territorio Común (total) <span class="man-lbl">(Presentados: ' + money(R.pagosAnt) + ')</span>', '30')}
      ${L('Resultado de la declaración anterior (exclusivamente si ésta es complementaria)', '31')}
      ${L('Resultado', '32', { calc: true })}
      ${L('Mínimo a ingresar (sólo para empresas con CN igual o superior a 10 millones de euros) <span class="man-lbl">(' + nf.format(R.pctMin) + ' % del resultado contable positivo − pagos anteriores)</span>', '33', { calc: true })}
      ${L('<b>Cantidad a ingresar (mayor de claves [32] y [33])</b>', '34', { calc: true })}</div>`;
    }
    const perSel = `<div class="bar"><label>Periodo <select data-per202="1">${[['1P', '1P · abril (enero-marzo)'], ['2P', '2P · octubre (enero-septiembre)'], ['3P', '3P · diciembre (enero-noviembre)']].map(([v, t]) => `<option value="${v}"${R.per === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    ${R.pres === null ? '<span class="leyenda">Sin 202 ' + R.per + ' de ' + R.ej + ' en Presentados</span>' : `<span class="leyenda">202 ${R.per} presentado: <b>${money(R.pres)}</b> · diferencia <b class="${Math.abs(C['34'] - R.pres) > 0.01 ? 'dif-ko' : ''}">${money(r2(C['34'] - R.pres))}</b></span>`}</div>`;
    const st0 = datos202(), guardadas = Object.keys(st0).filter((k) => /^ss-\d{4}-[123]P$/.test(k)).sort();
    const lista = guardadas.length ? `<div class="pyg202-lista"><b>PyG guardadas:</b> ${guardadas.map((k) => { const c0 = k.slice(3), [y, p] = c0.split('-'); return `<span class="pyg202-it${c0 === R.cl ? ' act' : ''}"><a href="#" data-act="m-202ver" data-c="${c0}">${p} ${y} · ${{ '1P': 'ene-mar', '2P': 'ene-sep', '3P': 'ene-nov' }[p]}</a> <small>${esc(st0[k].name)}</small> ${ed ? `<button class="mini-b" data-act="m-202quitar" data-c="${c0}">✕</button>` : ''}</span>`; }).join('')}</div>` : '';
    const zona = R.modal === '40.3' && ed ? lista + `<div class="dropzone" data-kind="m202pyg" tabindex="0" role="button"><b>Suelta aquí el Excel con la PyG del ${R.per} ${R.ej}</b> (balance de sumas y saldos de los ${FIN202[R.per]} primeros meses: cuenta, saldo de apertura, débito, crédito y saldo de cierre). Puedes soltar varios a la vez: cada uno se guarda en su periodo (1P enero-marzo, 2P enero-septiembre, 3P enero-noviembre) según su nombre o sus fechas. Es independiente del balance de sumas y saldos del 200 · ${R.per} ${R.ej}: ${R.pyg ? '<b>' + esc(R.pyg.name) + '</b>' : 'sin cargar'}
      <input type="file" data-dzkind="m202pyg" accept=".xlsx,.xls,.csv" multiple hidden></div>` : (R.modal === '40.3' ? lista : '');
    const cabF = `<div class="f303-top"><div class="ag"><b>Agencia Tributaria</b><small>Borrador para transcribir en la Sede Electrónica</small></div>
      <div class="tt">Impuesto sobre Sociedades. Pago fraccionado</div><div class="mod"><small>Modelo</small><b>202</b></div></div>
      <div class="f303-sec">Identificación</div><div class="f303-id"><span class="idbox"><b>NIF</b><span>${esc(e?.cif || '—')}</span></span><span class="idbox grow"><b>Apellidos y nombre o razón social</b><span>${esc(e?.nombre || '—')}</span></span></div>
      <div class="f303-sec">Devengo</div><div class="f303-id"><span class="idbox"><b>Ejercicio</b><span>${R.ej}</span></span><span class="idbox"><b>Período</b><span>${R.per}</span></span></div>`;
    return zona + bloqueAvisos(['Art. 40.2 (pymes): la base es la cuota íntegra (casilla 00562) del último modelo 200 presentado. El 200 que se presenta en julio sirve para el 2P y el 3P de ese año y para el 1P del año siguiente; al incorporar un 200 nuevo en Presentados, la base se actualiza sola', 'Mismas casillas que el impreso del modelo 202. Las casillas en blanco se escriben; las calculadas salen solas. Los porcentajes (18 %, 17 %, 24 % y mínimo del 23 %) son los de la Ley del IS: compruébalos con la normativa vigente'])
      + (msg ? `<p class="hint rg-msg"><b>${esc(msg)}</b></p>` : '') + perSel
      + `<div class="f303 f202">${cabF}${dat}${mod}${liq}${domi('202', C['34'] || C['03'])}</div>`;
  }

  // ---------- Carga de la PyG del 202 (Excel con el balance de sumas y saldos del periodo o PyG normalizada) ----------
  async function hojasExcel(file) {
    const wb = window.XLSX.read(await file.arrayBuffer(), { cellDates: true });
    return wb.SheetNames.map((name) => ({ name, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true }) }));
  }
  // periodo del Excel: por el nombre (1P/2P/3P, marzo/septiembre/noviembre, 03/09/11) o por las fechas de sus primeras filas
  async function periodoPyg202(file, hojas) {
    const conv = (m) => (m <= 3 ? '1P' : m <= 9 ? '2P' : '3P'), MES = { marzo: 3, septiembre: 9, noviembre: 11, mar: 3, sep: 9, nov: 11 };
    const n = norm(file.name); let per = null, ej = null;
    const mP = n.match(/\b([123]) ?p\b/); if (mP) per = mP[1] + 'P';
    if (!per) for (const [k, v] of Object.entries(MES)) if (new RegExp('\\b' + k + '\\b').test(n)) { per = conv(v); break; }
    const mY = file.name.match(/(20\d\d)/); if (mY) ej = +mY[1];
    if (!per || !ej) {
      let maxD = null;
      hojas.forEach((s) => (s.rows || []).slice(0, 15).forEach((r) => (r || []).forEach((v) => {
        let d = v instanceof Date ? v : null;
        if (!d && typeof v === 'string') { const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(v); if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); }
        if (d && (!maxD || d > maxD)) maxD = d;
      })));
      if (maxD) { if (!per) per = conv(maxD.getUTCMonth() + 1); if (!ej) ej = maxD.getUTCFullYear(); }
    }
    return { per, ej };
  }
  // PyG en formato normalizado (descripción en una columna e importe del ejercicio actual en la siguiente)
  function leerPygNormalizada(sheets) {
    const num = (v) => { if (typeof v === 'number') return v; if (v === null || v === undefined || v === '') return null; const t = String(v).trim(); if (/^-?\d+(\.\d+)?$/.test(t)) return +t; const n = parseNum(t); return n === null || isNaN(n) ? null : n; };
    for (const sh of sheets) {
      const rows = sh.rows || []; let col = -1;
      rows.slice(0, 15).forEach((r) => (r || []).forEach((v, i) => { if (col < 0 && typeof v === 'string' && /ejercicio\s+actual|^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/i.test(v)) col = i; }));
      const o = { res: null, rai: null, is: null, cn: null };
      rows.forEach((r) => {
        if (!r) return; const di = r.findIndex((v) => typeof v === 'string' && /[a-z]/i.test(v)); if (di < 0) return; const d = norm(r[di]);
        const c0 = col > di ? col : r.findIndex((v, i) => i > di && num(v) !== null); if (c0 < 0) return; const v = num(r[c0]); if (v === null) return;
        if (/resultado del ejercicio/.test(d) && !/operaciones/.test(d)) o.res = v;
        else if (/resultado del ejercicio/.test(d) && o.res === null) o.res = v;
        if (/resultado antes de impuestos/.test(d)) o.rai = v;
        if (/^\W*\d*\W*impuestos? sobre (beneficios|sociedades)/.test(d) || /^\d+\.\s*impuestos? sobre beneficios/.test(d)) o.is = v;
        if (/importe neto de la cifra de negocios/.test(d) && o.cn === null) o.cn = v;
      });
      if (o.res === null && o.rai !== null) o.res = r2(o.rai + (o.is || 0));
      if (o.res !== null) return { res: r2(o.res), rai: o.rai === null ? null : r2(o.rai), is: o.is === null ? null : r2(o.is), cn: o.cn === null ? null : r2(o.cn) };
    }
    return null;
  }
  async function cargarPyg202(files) {
    if (!S.sel) return;
    const informe = [];
    for (const f of files) {
      try {
        const hojas = await hojasExcel(f), dp = await periodoPyg202(f, hojas), R0 = calc202();
        const per = dp.per || R0.per, ej = dp.ej || R0.ej, cl = ej + '-' + per;
        let cuentas = null; for (const h of hojas) { cuentas = c.leerSYS(h.rows); if (cuentas) break; }
        const st = JSON.parse(JSON.stringify(datos202()));
        if (cuentas) {
          st['ss-' + cl] = { name: f.name, lines: soloHojas(cuentas.map((x) => ({ digitos: String(x.cuenta), x }))).map(({ x }) => [String(x.cuenta), x.apertura, x.debe, x.haber, x.previo]) };
          const X = efCtx(st['ss-' + cl].lines.map(([digitos, ap, debe, haber, cierre]) => ({ digitos, ap, debe, haber, cierre })));
          informe.push(`✔ ${f.name}: PyG del ${per} ${ej} guardada${dp.per ? '' : ' (periodo tomado del que está seleccionado)'} · resultado del ejercicio ${money(X.val('I', 108))}`);
        } else {
          const N = leerPygNormalizada(hojas);
          if (!N) { informe.push(`❔ ${f.name}: no he encontrado ni un balance de sumas y saldos ni una PyG con la línea «Resultado del ejercicio»`); continue; }
          st['ss-' + cl] = { name: f.name, norm: N, lines: [] };
          informe.push(`✔ ${f.name}: PyG normalizada del ${per} ${ej} guardada · resultado del ejercicio ${money(N.res)}${N.is ? ' · impuesto sobre beneficios ' + money(N.is) : ''}`);
        }
        await guardar202(st); per202 = per;
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    msg = informe.join(' · '); render();
  }

  // ================= Eventos propios =================
  const acciones = {
    'm-pag200': (d) => { pag200 = +d.i || 0; render(); },
    'm-202usar': async (d) => { const st = JSON.parse(JSON.stringify(datos202())), R = calc202(); if (st[R.cl]) delete st[R.cl][d.k]; await guardar202(st); render(); },
    'm-202ver': (d) => { per202 = d.c.split('-')[1]; render(); },
    'm-202quitar': async (d) => {
      const st = JSON.parse(JSON.stringify(datos202())); if (!st['ss-' + d.c] || !confirm(`¿Quitar la PyG guardada de ${d.c}?`)) return;
      delete st['ss-' + d.c]; await guardar202(st); render();
    },
  };
  document.addEventListener('change', async (ev) => {
    const t = ev.target; const d = t.dataset; if (!d || !S.sel) return;
    if (d.solo200 !== undefined) { solo200 = t.checked; return void render(); }
    if (d.m200ej !== undefined) { ej200 = +t.value || null; return void render(); }
    if (d.m200x) {
      const ej = ejercicio200(), man = { ...manDe(ej) };
      const v = t.tagName === 'SELECT' ? t.value : d.txt ? t.value.trim() : parseNum(t.value);
      if (v === null || v === '') delete man[d.m200x]; else man[d.m200x] = v;
      await guardar('m200x', ej, man); return void render();
    }
    if (d.per202 !== undefined) { per202 = t.value; return void render(); }
    const st = JSON.parse(JSON.stringify(datos202())), R = calc202();
    if (d.m202) {
      st[R.cl] ??= {}; const v = parseNum(t.value);
      if (v === null) delete st[R.cl][d.m202]; else st[R.cl][d.m202] = v;
      await guardar202(st); return void render();
    }
    if (d.modal202) { st[R.cl] ??= {}; st[R.cl].modal = d.modal202; await guardar202(st); return void render(); }
    const dk = 'dat-' + R.ej;
    if (d.dat202) { st[dk] ??= {}; st[dk][d.dat202] = t.checked; await guardar202(st); return void render(); }
    if (d.dat202tipo) { st[dk] ??= {}; st[dk].tipo = parseNum(t.value) ?? 25; await guardar202(st); return void render(); }
    if (d.incn202 !== undefined) { st[dk] ??= {}; st[dk].incn = d.incn202; await guardar202(st); return void render(); }
  });

  // chips del menú (como chipImp de la antigua): a ingresar / a devolver / sin importe
  const chipImp = (v, pre) => {
    const p = pre ? pre + ' · ' : '';
    if (v === null || v === undefined || Number.isNaN(+v) || Math.abs(+v) < 0.005) return { t: p + 'Sin importe' };
    return { t: p + (v > 0 ? 'A ingresar ' : 'A devolver ') + money(Math.abs(v)), c: v > 0 ? 'amar' : 'verde' };
  };
  const badges = {
    mod200: () => { if (!S.sel) return { t: 'Por empresa' }; if (!efLineas(ejercicio200()).length) return { t: 'Sin sumas y saldos' }; try { return chipImp(calc200().D[52]); } catch { return { t: '-' }; } },
    mod202: () => { if (!S.sel) return { t: 'Por empresa' }; try { const R = calc202(); return chipImp(R.pres !== null && R.pres !== undefined ? R.pres : R.C['34'], 'Art. ' + R.modal); } catch { return { t: '-' }; } },
  };
  const kinds = { m202pyg: cargarPyg202 };
  const tabs = {
    mod200: ['Modelo 200', 'IS desde balance y PyG', vista200],
    mod202: ['Modelo 202', 'Pagos fraccionados IS', vista202],
  };
  return { tabs, kinds, acciones, badges };
}
