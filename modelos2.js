// Bloque 4 · 349, 390 y resúmenes anuales 180 / 190 / 193 con el diseño de la aplicación antigua
// (ficha del impreso para el 349; cuadro de doce meses o cuatro trimestres para el 390 y los resúmenes anuales).
import { calcular349Ops, esUE, periodoAnterior349 } from './lectores.js?v=52';
export function crearModelos2(c) {
  const { S, esc, empresa, grande, calcularRet, calcular349, c303, nomPer, totalRet, render } = c;
  const nombreEmp = c.nombreEmp ?? ((e) => e?.nombre ?? ''); // nombre con que se muestra la empresa en la aplicación (p. ej. HEROGRA FERTILIZANTES S.A.)
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  const money = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const guion = (v) => (v === null || v === undefined || Math.abs(v) < 0.005 ? '-' : money(v));
  const avisos = (l) => (l.length ? `<div class="aviso">${l.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : '');
  const MES_L = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const ejercicio = () => Number(S.ejercicio) || new Date().getFullYear();
  const esTrim = () => empresa()?.tipo !== 'GE'; // gran empresa por meses; el resto por trimestres
  const periodos = () => (esTrim() ? ['1T', '2T', '3T', '4T'] : Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));
  const etq = (p) => (/T$/.test(p) ? `${p[0]}T (${MES_L[(+p[0] - 1) * 3].slice(0, 3)}-${MES_L[+p[0] * 3 - 1].slice(0, 3)})` : MES_L[+p - 1]);
  const enPer = (l, ej, p) => { const f = String(l.fecha ?? ''); if (f.slice(0, 4) !== String(ej)) return false; const m = +f.slice(5, 7); return /T$/.test(p) ? Math.ceil(m / 3) === +p[0] : m === +p; };

  // ---------- Cabecera de la ficha (como la de las pestañas de resumen de la antigua) ----------
  const ficha = (mod, extra) => `<div class="ficha"><div><dt>Empresa:</dt><dd class="nom">${esc(empresa().nombre)}</dd></div>
    ${empresa().cif ? `<div><dt>NIF:</dt><dd>${esc(empresa().cif)}</dd></div>` : ''}<div><dt>Modelo:</dt><dd>${mod}</dd></div><div><dt>Ejercicio:</dt><dd>${ejercicio()}</dd></div>${extra}</div>`;
  const filaAncha = (cls, txt) => (cls === 'gap' ? '<tr class="gap"><td colspan="29"></td></tr>'
    : `<tr class="${cls}"><td>${esc(txt)}</td><td></td><td></td>${Array.from({ length: 13 }, (_, i) => `<td class="bi${i === 12 ? ' ejer' : ''}"></td><td class="ci${i === 12 ? ' ejer' : ''}"></td>`).join('')}</tr>`);
  const cuadro = (ejTit, pers, cab3, h2a, h2b, F, D, extraCls = '') => {
    const h1 = `<tr><th rowspan="2" class="c390">${cab3[0]}</th><th rowspan="2">${cab3[1]}</th><th rowspan="2">${cab3[2]}</th>${pers.map((p, i) => `<th colspan="2" class="mes${D.n[i] ? '' : ' vacio'}">${etq(p)} - ${ejTit}</th>`).join('')}<th colspan="2" class="mes ejer">EJERCICIO ${ejTit}</th></tr>`;
    const h2 = `<tr>${pers.concat(['']).map((_, i) => `<th class="bi${i === pers.length ? ' ejer' : ''}">${h2a}</th><th class="ci${i === pers.length ? ' ejer' : ''}">${h2b}</th>`).join('')}</tr>`;
    const body = F.map((r) => {
      if (r.sec) return filaAncha('sec', r.sec);
      if (r.cab) return filaAncha('cab', r.txt);
      const vals = pers.map((_, i) => (D.n[i] ? r.g(D.m[i]) : null));
      let tb = 0, tc = 0; vals.forEach((v) => { if (v) { tb += v.base || 0; tc += v.cuota || 0; } });
      if (r.anual) tc = r.anual();
      const soloCuota = vals.every((v) => !v || v.base === null);
      const cel = (v, k) => (v === null ? `<td class="n ${k}">-</td>` : `<td class="n ${k}">${k === 'bi' ? (v.base === null ? '' : r.cnt ? (v.base ? String(v.base) : '-') : guion(v.base)) : (v.cuota === null ? '' : guion(v.cuota))}</td>`);
      const cls = (r.sub ? 'sub' : r.verde ? 'verde' : r.cmp || r.vacia ? 'cmp' : '') + (r.gini ? ' gini' : '') + (r.gfin ? ' gfin' : '');
      const tBase = r.cmp ? '' : r.cnt ? String(r.anualN ?? '-') : soloCuota ? '' : guion(r2(tb));
      return `<tr class="${cls}"><td>${esc(r.txt)}</td><td class="c ref">${esc(r.cod ?? r.nif ?? '')}</td><td class="n ref">${D.A ? esc(r.clave ?? '') : r.tipo === null || r.tipo === undefined ? '' : nf.format(r.tipo)}</td>${vals.map((v) => cel(v, 'bi') + cel(v, 'ci')).join('')}
        <td class="n bi ejer">${tBase}</td><td class="n ci ejer">${r.cnt ? '' : guion(r2(tc))}</td></tr>${r.sub ? filaAncha('gap', '') : ''}`;
    }).join('');
    return `<div class="scroll390"><table class="t390${extraCls}"><thead>${h1}${h2}</thead><tbody>${body}</tbody></table></div>`;
  };

  // ================= 390 · catálogo de códigos de impuesto, mes a mes =================
  const CAT390 = [
    { sec: 'IVA DEVENGADO' },
    { grp: 'NACIONAL · Régimen General', codes: [['R.NC.NR', 21], ['R.NC.RD', 10], ['R.NC.RDN', 5], ['R.NC.SR', 4], ['R.NC.SRN', 2]] },
    { grp: 'NACIONAL · Recargo de Equivalencia', codes: [['R.RC.NR', 5.2], ['R.RC.RD', 1.4], ['R.RC.SR', 0.5]] },
    { sub: 'TOTAL VENTAS SUJETAS Y NO EXENTAS', id: 'VSNE' },
    { grp: 'NACIONAL EXENTO · Artículo 20 LIVA', codes: [['R.NC.EX', 0]] },
    { grp: 'EXPORTACIONES · Artículo 21 LIVA', codes: [['R.EX', 0]] },
    { grp: 'ENTREGAS INTRACOM. · Artículo 25 LIVA', codes: [['R.UE', 0]] },
    { grp: 'ISP · Artículo 84. Uno. 2º', codes: [['R.ISP', 0]] },
    { sub: 'TOTAL VENTAS SUJETAS Y EXENTAS', id: 'VSE' },
    { grp: 'NO SUJETAS · Artículos 7º - 14º', codes: [['R.NAC.NS', 0]] },
    { grp: 'NO SUJETAS · N.S.R.L.', codes: [['R.UE.S', 0]] },
    { sub: 'TOTAL VENTAS NO SUJETAS', id: 'VNS' },
    { grp: 'AUTOREPERCUTIDO · Intracomunitarias Bienes', codes: [['R.UE.NR', 21], ['R.UE.RD', 10], ['R.UE.SR', 4]] },
    { grp: 'AUTOREPERCUTIDO · Intracomunitarias Servicios', codes: [['R.UE.NR.SR', 21], ['R.UE.RD.SR', 10], ['R.UE.SR.SR', 4]] },
    { grp: 'AUTOREPERCUTIDO · Inversión Sujeto Pasivo', codes: [['S.NC.ISP.A', 21], ['R.ISP.NR', 21], ['R.ISP.RD', 10]] },
    { sub: 'TOTAL IVA AUTOREPERCUTIDO - CARGO REVERTIDO', id: 'AUTO' },
    { otros: 'rep' },
    { verde: 'TOTAL IVA DEVENGADO', id: 'DEV', de: ['VSNE', 'AUTO', 'OTROS_rep'] },
    { sec: 'IVA SOPORTADO' },
    { grp: 'NACIONAL · Régimen General', codes: [['S.NC.NR', 21], ['S.NC.RD', 10], ['S.NC.RDN', 5], ['S.NC.SR', 4], ['S.NC.SRN', 2]] },
    { grp: 'NACIONAL · Inversión Sujeto Pasivo', codes: [['S.NC.ISP', 21], ['S.ISP.NR', 21], ['S.ISP.RD', 10]] },
    { grp: 'NACIONAL · Bienes Inversión', codes: [['IN.NR', 21], ['IN.RD', 10], ['IN.SR', 4]] },
    { sub: 'TOTAL COMPRAS SUJETAS Y NO EXENTAS', id: 'CSNE' },
    { grp: 'ADQUISICIONES INTRACOMUNITARIAS · Bienes', codes: [['S.UE.NR', 21], ['S.UE.RD', 10], ['S.UE.SR', 4]] },
    { grp: 'ADQUISICIONES INTRACOMUNITARIAS · Servicios', codes: [['S.UE.NR.SR', 21], ['S.UE.RD.SR', 10], ['S.UE.SR.SR', 4]] },
    { grp: 'NACIONAL EXENTO · Artículo 20 LIVA', codes: [['S.NC.EX', 0]] },
    { grp: 'IMPORTACIONES · Artículo 21 LIVA', codes: [['S.EX.NR', 0], ['S.EX.RD', 0], ['S.EX.SR', 0]] },
    { sub: 'TOTAL COMPRAS SUJETAS Y EXENTAS', id: 'CSE' },
    { grp: 'NO SUJETO · N.S.R.L.', codes: [['S.NAC.NS', 0]] },
    { sub: 'TOTAL COMPRAS NO SUJETAS', id: 'CNS' },
    { grp: 'IVA DIFERIDO · H1', codes: [['DUA', 21], ['DUARED', 10]] },
    { grp: 'IVA DIFERIDO · Complementarias H1', codes: [['DUALCNR', 21], ['DUALCRED', 10]] },
    { sub: 'TOTAL IVA DIFERIDO DUAS - H1', id: 'DUA' },
    { otros: 'sop' },
    { verde: 'TOTAL IVA DEDUCIBLE', id: 'DED', de: ['CSNE', 'CSE', 'CNS', 'DUA', 'OTROS_sop'] },
    { verde: 'DIFERENCIA IVA DEVENGADO − IVA DEDUCIBLE', id: 'DIF', resta: ['DEV', 'DED'] },
    { cmp: 'Comprobación: resultado del 303 del mes (casilla 46)' },
  ];
  const COD390 = new Set(CAT390.flatMap((x) => (x.codes ? x.codes.map((k) => k[0]) : [])));

  function calc390(E, R) {
    const ej = ejercicio(), pers = periodos(), out = { ej, pers, n: [], m: [], avisos: [], otros: { rep: new Set(), sop: new Set() } };
    pers.forEach((p) => {
      const rep = E.filter((l) => enPer(l, ej, p)), sop = R.filter((l) => enPer(l, ej, p)), K = {}, O = { rep: { base: 0, cuota: 0, n: 0 }, sop: { base: 0, cuota: 0, n: 0 } };
      [...rep.map((l) => ({ l, side: 'rep' })), ...sop.map((l) => ({ l, side: 'sop' }))].forEach(({ l, side }) => {
        let k = String(l.codigo ?? '').trim().toUpperCase();
        if (!COD390.has(k) && /\.SR$/.test(k) && COD390.has(k.slice(0, -3))) k = k.slice(0, -3); // variante de servicios (…SR) que no está en el catálogo: con su código base
        if (/^(R\.)?I\./.test(k)) return; // el IRPF no va en el 390
        if (COD390.has(k)) { const o = (K[k] ??= { base: 0, cuota: 0, n: 0 }); o.base = r2(o.base + l.base); o.cuota = r2(o.cuota + l.cuota); o.n++; }
        else { const o = O[side]; o.base = r2(o.base + l.base); o.cuota = r2(o.cuota + l.cuota); o.n++; out.otros[side].add(k || '(sin código)'); }
      });
      out.n.push(rep.length + sop.length);
      out.m.push({ K, O, R: rep.length + sop.length ? c303(E, R, ej, p) : null });
    });
    ['rep', 'sop'].forEach((s) => { if (out.otros[s].size) out.avisos.push(`Códigos del ${s === 'rep' ? 'repercutido' : 'soportado'} que no están en tu catálogo (van en "Otros códigos"): ${[...out.otros[s]].join(', ')}`); });
    const conDatos = out.n.filter((x) => x).length;
    if (conDatos < pers.length) out.avisos.push(`Hay datos de ${conDatos} de ${pers.length}${esTrim() ? ' trimestres' : ' meses'}. Suelta en cada libro los archivos del resto de ${esTrim() ? 'trimestres' : 'meses'} (se suman si tienen las mismas columnas)`);
    out.avisos.push('El 390 suma las líneas por su código de impuestos tal como vienen (base = Origen, cuota = Importe de impuestos).');
    return out;
  }
  function filas390(D) {
    const F = []; let blq = []; const tot = {};
    CAT390.forEach((it) => {
      if (it.sec) { F.push({ sec: it.sec }); return; }
      if (it.grp) { it.codes.forEach(([k, t], i) => { const r = { txt: i === 0 ? it.grp : '', cod: k, tipo: t, gini: i === 0, gfin: i === it.codes.length - 1, g: (x) => x.K[k] ?? { base: 0, cuota: 0 } }; F.push(r); blq.push(r); }); return; }
      if (it.otros) {
        const s = it.otros; if (!D.otros[s].size) { tot[`OTROS_${s}`] = null; return; }
        const r = { txt: 'OTROS CÓDIGOS (fuera del catálogo)', cod: '…', tipo: null, g: (x) => x.O[s] }; F.push(r); tot[`OTROS_${s}`] = [r]; return;
      }
      if (it.sub) { const rs = blq; blq = []; tot[it.id] = rs; F.push({ txt: it.sub, sub: true, g: (x) => { let b = 0, q = 0; rs.forEach((r) => { const v = r.g(x); b += v.base; q += v.cuota; }); return { base: r2(b), cuota: r2(q) }; } }); return; }
      if (it.verde && it.de) { const rs = it.de.flatMap((k) => tot[k] ?? []); tot[it.id] = rs; F.push({ txt: it.verde, verde: true, g: (x) => ({ base: null, cuota: r2(rs.reduce((s, r) => s + r.g(x).cuota, 0)) }) }); return; }
      if (it.verde && it.resta) { const [a, b] = it.resta.map((k) => tot[k] ?? []); F.push({ txt: it.verde, verde: true, g: (x) => ({ base: null, cuota: r2(a.reduce((s, r) => s + r.g(x).cuota, 0) - b.reduce((s, r) => s + r.g(x).cuota, 0)) }) }); return; }
      if (it.cmp) F.push({ txt: it.cmp, cmp: true, g: (x) => ({ base: null, cuota: x.R?.c46 ?? 0 }) });
    });
    const conDatos = D.m.filter((_, i) => D.n[i]);
    const cas = (n, t, op = {}) => F.push({ txt: t, cod: `Casilla ${n}`, g: (x) => ({ base: null, cuota: r2(x.R?.[`c${n}`] ?? 0) }), ...op });
    F.push({ sec: 'LIQUIDACIÓN (casillas del 303 de cada mes)' });
    cas('66', 'Atribuible a la Administración del Estado');
    cas('77', 'IVA a la importación liquidado por la Aduana pendiente de ingreso');
    cas('110', 'Cuotas a compensar pendientes de periodos previos', { anual: () => (conDatos.length ? r2(conDatos[0].R?.c110 ?? 0) : 0) });
    cas('78', 'Cuotas a compensar de periodos previos aplicadas en este periodo');
    cas('87', 'Cuotas a compensar de periodos previos pendientes para periodos posteriores', { anual: () => (conDatos.length ? r2(conDatos[conDatos.length - 1].R?.c87 ?? 0) : 0) });
    cas('69', 'Resultado', { sub: true });
    return F;
  }
  function vista390() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return cargandoTxt;
    if (!E.length && !R.length) return '<p class="vacio">Sin datos: carga los libros de IVA con los botones EMITIDAS y RECIBIDAS.</p>';
    const D = calc390(E, R), F = filas390(D);
    const dif = F.find((r) => r.txt === 'DIFERENCIA IVA DEVENGADO − IVA DEDUCIBLE');
    const desc = D.pers.filter((p, i) => D.n[i] && Math.abs(dif.g(D.m[i]).cuota - (D.m[i].R?.c46 ?? 0)) > 0.01).map((p) => etq(p).toLowerCase());
    if (desc.length) D.avisos.unshift(`La diferencia por códigos no cuadra con el resultado del 303 (casilla 46) en: ${desc.join(', ')}. Suele deberse a reclasificaciones hechas a mano o a códigos fuera del catálogo`);
    return `${avisos(D.avisos)}<p class="hint">Listado del ejercicio por los códigos de impuestos de tu catálogo, mes a mes, con los mismos grupos y totales. La fila de comprobación muestra el resultado del 303 de cada mes para que veas que cuadra.</p>
      <section class="block m390">${ficha('390', `<div><dt>Meses con datos:</dt><dd>${D.n.filter((x) => x).length} de ${D.pers.length}</dd></div>`)}
      ${cuadro(D.ej, D.pers, ['Concepto', 'Código', '%'], 'Base imp.', 'Cuota imp.', F, D)}</section>`;
  }

  // ================= 180 · 190 · 193: resumen anual por perceptor, mes a mes =================
  const ANUALES = {
    190: { tit: 'Modelo 190 · Resumen anual de retenciones del trabajo y actividades económicas', mod: '111', cmp: 'casilla 28 del 111',
      grupos: [{ tit: 'RENDIMIENTOS DEL TRABAJO', codes: [['I.NM', null, 'A']] }, { tit: 'RENDIMIENTOS DE ACTIVIDADES ECONÓMICAS', codes: [['I.PR.GN', 15, 'G'], ['I.PR.PRA', 7, 'G'], ['I.PR.SR', 1, 'H']] }],
      nota: 'Claves de percepción según mi conocimiento: A trabajo por cuenta ajena, G actividades profesionales, H actividades agrícolas y ganaderas (el 1 % es el de engorde de porcino y avicultura). No pongo subclaves porque no las tengo seguras: confírmalas antes de presentar.' },
    180: { tit: 'Modelo 180 · Resumen anual de retenciones por arrendamiento de inmuebles urbanos', mod: '115', cmp: 'casilla 03 del 115',
      grupos: [{ tit: 'RENDIMIENTOS CAPITAL INMOBILIARIO', codes: [['I.ALQ', 19, '']] }],
      nota: 'El 180 pide además, por cada arrendador, la referencia catastral y la situación del inmueble. Esos datos no vienen en el libro de IVA: tendrás que añadirlos al presentarlo.' },
    193: { tit: 'Modelo 193 · Resumen anual de retenciones del capital mobiliario', mod: '123', cmp: 'casilla 09 del 123',
      grupos: [{ tit: 'RENDIMIENTOS CAPITAL MOBILIARIO · Intereses', codes: [['I.INT', 19, '']] }, { tit: 'RENDIMIENTOS CAPITAL MOBILIARIO · Dividendos', codes: [['I.DV', 19, ''], ['I.DV.E', 0, '']] }],
      nota: 'Los dividendos exentos (I.DV.E) se muestran aparte y sin retención; comprueba con tu asesor si deben incluirse en el 193. El 193 pide también la naturaleza, la clave y otros datos del perceptor que no vienen en el libro.' },
  };
  // Modelo 180: inmueble de cada factura de alquiler según arrendador y nº de factura
  const INMUEBLES_180 = { T: { nom: 'Torre Cautiva - Sede', ref: '7723401VG4172D0001IR' }, A: { nom: 'Nueva Nave Sevilla', ref: '4817003TG3341N0001JF' }, L: { nom: 'Local Nueva Sede', ref: '7723401VG4172D0120QB' },
    PROF: { nom: 'Nave Profitegra', ref: '3540127VG3034S0000PP' }, SEV: { nom: 'Nave Sevilla', ref: '4610014TG3341S0001QX' } };
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function inmueble180(l) {
    const nom = norm(l.nombre), fac = String(l.factura ?? '').trim().toUpperCase();
    if (/herogra/.test(nom) && fac.startsWith('A/')) return INMUEBLES_180.SEV; // Herogra → Lysur
    if (/alientagr/.test(nom)) return INMUEBLES_180[fac.charAt(0)] ?? null; // T / A / L
    if (/inverprode/.test(nom)) return INMUEBLES_180.PROF; // Inverprode → Herogra
    return null;
  }
  function calcAnual(k, R) {
    const A = ANUALES[k], ej = ejercicio(), pers = periodos(), out = { ej, A, pers, n: [], m: [], avisos: [] };
    const todas = [];
    pers.forEach((p) => {
      const L = calcularRet(A.mod, R, ej, p).lineas.map((l) => ({ ...l, ret: -l.cuota + 0 })), np = k === 190 ? nomPer(ej, p) : null;
      todas.push(...L);
      out.n.push(L.length + (np ? 1 : 0)); out.m.push({ L, nom: np, cmp: totalRet(A.mod, R, ej, p) });
    });
    const listados = new Set(A.grupos.flatMap((g) => g.codes.map((x) => x[0])));
    const otros = todas.filter((l) => !listados.has(l.codigo));
    out.grupos = A.grupos.map((g) => ({ tit: g.tit, codes: g.codes }));
    if (otros.length) {
      out.grupos.push({ tit: 'OTRAS RETENCIONES ASIGNADAS A ESTE MODELO', codes: [...new Set(otros.map((l) => l.codigo))].map((x) => [x, null, '']) });
      out.avisos.push(`Hay retenciones con códigos fuera de la lista de este modelo (se muestran aparte): ${[...new Set(otros.map((l) => l.codigo || '(sin código)'))].join(', ')}`);
    }
    const conDatos = out.n.filter((x) => x).length;
    if (conDatos < pers.length) out.avisos.push(`Hay datos de ${conDatos} de ${pers.length}${esTrim() ? ' trimestres' : ' meses'}. Suelta en el libro de soportado los archivos del resto de ${esTrim() ? 'trimestres' : 'meses'}`);
    const sinNif = todas.filter((l) => !l.nif).length;
    if (sinNif) out.avisos.push(`${sinNif} línea(s) sin NIF: el perceptor se identifica por el nombre y así no se puede presentar`);
    out.avisos.push('Los perceptores se agrupan por NIF. Se usan las líneas con retención asignadas a este modelo.');
    out.usarNom = k === 190 && out.m.some((x) => x.nom);
    if (out.usarNom) out.avisos.unshift('Rendimientos del trabajo desde la pestaña Nóminas: base = total devengado y retención = IRPF de cada mes. Las líneas I.NM del libro de soportado no se suman para no contar dos veces');
    out.todas = todas;
    return out;
  }
  function filasAnual(D, k) {
    const F = [], sumL = (ls) => ({ base: r2(ls.reduce((s, l) => s + l.base, 0)), cuota: r2(ls.reduce((s, l) => s + l.ret, 0)) });
    const nomV = (x) => (x.nom ? { base: r2(x.nom.s || 0), cuota: r2(x.nom.r || 0) } : { base: 0, cuota: 0 });
    D.grupos.forEach((g) => {
      F.push({ sec: g.tit });
      g.codes.forEach(([cod, tipo, clave]) => {
        if (cod === 'I.NM' && D.usarNom) {
          F.push({ txt: 'Nóminas de la gestoría', cab: true });
          F.push({ txt: 'Total devengado e IRPF (pestaña Nóminas)', nif: '', clave, tipo: null, g: nomV });
          F.push({ txt: 'Total rendimientos del trabajo', sub: true, g: nomV });
          return;
        }
        const ls = D.todas.filter((l) => l.codigo === cod);
        const pers = [...new Map(ls.map((l) => [l.nif || `(sin NIF) ${l.nombre}`, l.nombre])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
        F.push({ txt: cod + (tipo !== null ? ` · ${nf.format(tipo)} %` : ''), cab: true });
        pers.forEach(([nif, nom]) => {
          const dePer = (l) => l.codigo === cod && (l.nif || `(sin NIF) ${l.nombre}`) === nif;
          if (k === 180) { // 180: un renglón por inmueble (referencia catastral)
            const inms = [...new Map(ls.filter(dePer).map((l) => { const i = inmueble180(l); return [i ? i.ref : '', i]; })).entries()].sort((a, b) => a[0].localeCompare(b[0]));
            inms.forEach(([ref, i]) => F.push({ txt: `${nom} · ${i ? `${i.nom} · Ref. catastral ${ref}` : 'inmueble sin identificar'}`, nif, clave, tipo, g: (x) => sumL(x.L.filter((l) => dePer(l) && (inmueble180(l)?.ref ?? '') === ref)) }));
            return;
          }
          F.push({ txt: nom, nif, clave, tipo, g: (x) => sumL(x.L.filter(dePer)) });
        });
        if (!pers.length) F.push({ txt: '(sin perceptores en el ejercicio)', vacia: true, g: () => ({ base: 0, cuota: 0 }) });
        F.push({ txt: `Total ${cod}`, sub: true, g: (x) => sumL(x.L.filter((l) => l.codigo === cod)) });
      });
    });
    F.push({ txt: `TOTAL MODELO ${k}`, verde: true, g: (x) => {
      if (!D.usarNom) return sumL(x.L);
      const s = sumL(x.L.filter((l) => l.codigo !== 'I.NM')), v = nomV(x); return { base: r2(s.base + v.base), cuota: r2(s.cuota + v.cuota) };
    } });
    const sinNom = (l) => !D.usarNom || l.codigo !== 'I.NM';
    F.push({ txt: D.usarNom ? 'Nº de perceptores (sin contar los trabajadores de nóminas)' : 'Nº de perceptores', cnt: true, g: (x) => ({ base: new Set(x.L.filter(sinNom).map((l) => l.nif || l.nombre)).size, cuota: null }),
      anualN: new Set(D.todas.filter(sinNom).map((l) => l.nif || l.nombre)).size });
    F.push({ txt: `Comprobación: ${D.A.cmp} de cada ${esTrim() ? 'trimestre' : 'mes'}`, cmp: true, g: (x) => ({ base: null, cuota: x.cmp }) });
    return F;
  }
  function vistaAnual(k) {
    if (!S.sel) return sinEmpresa;
    const R = grande('fact-R');
    if (!R) return cargandoTxt;
    if (!R.length) return '<p class="vacio">Sin datos: carga el libro de IVA soportado con el botón RECIBIDAS.</p>';
    const D = calcAnual(k, R), F = filasAnual(D, k);
    const tot = F.find((r) => r.verde), cmp = F.find((r) => r.cmp);
    const desc = D.pers.filter((p, i) => D.n[i] && Math.abs(tot.g(D.m[i]).cuota - cmp.g(D.m[i]).cuota) > 0.01).map((p) => etq(p).toLowerCase());
    if (desc.length) D.avisos.unshift(`El total no cuadra con la ${D.A.cmp} en: ${desc.join(', ')}`);
    return `${avisos(D.avisos)}<p class="hint">Resumen del ejercicio mes a mes y por perceptor, con los mismos datos que los ${D.A.mod} mensuales. ${esc(D.A.nota)}</p>
      <section class="block m390">${ficha(k, `<div><dt>Perceptores:</dt><dd>${new Set(D.todas.map((l) => l.nif || l.nombre)).size}</dd></div>`)}
      ${cuadro(D.ej, D.pers, ['Perceptor', 'NIF', 'Clave'], 'Base ret.', 'Retención', F, D, ' tanual')}</section>`;
  }

  // ================= 349 · copia de la pestaña de la antigua: fichero .txt, resumen, relación de operadores y facturas incluidas =================
  const lsKey = () => `txt349-${S.sel}`;
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(lsKey()) || '{}') || {}; } catch { return {}; } };
  const lsSet = (o) => { try { localStorage.setItem(lsKey(), JSON.stringify(o)); } catch { /* sin almacenamiento */ } };
  const fdateIso = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  const nf2 = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  // diseño de registro de la AEAT: 500 posiciones, ISO-8859-1
  function t349Cfg() {
    const c = lsGet(), p = S.periodo ?? '', perDef = esTrim() ? (/^\d\d$/.test(p) ? `${Math.ceil(+p / 3)}T` : p) : p;
    return { per: c.per || perDef, tel: c.tel || '', cont: c.cont || '', just: c.just || '', comp: c.comp || '', ant: c.ant || '' };
  }
  const txtAlfa = (v, n) => String(v || '').toUpperCase().replace(/Ñ/g, '\u0001').replace(/Ç/g, '\u0002').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'Ñ').replace(/\u0002/g, 'Ç').replace(/[^A-Z0-9Ñ &,.\-'/()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).padEnd(n, ' ');
  const txtNum = (v, n) => String(Math.round(Math.abs(+v || 0))).padStart(n, '0').slice(-n);
  const datos349 = () => calcular349Ops(grande('fact-E') ?? [], grande('fact-R') ?? [], ejercicio(), S.periodo);
  function bloque349Txt(m) {
    const c = t349Cfg(), inp = (k, ph, w) => `<input data-t349="${k}" value="${esc(c[k])}" placeholder="${ph}" style="width:${w}ch">`;
    const neg = m.rect, R = lsGet().rect ?? {}, pa = periodoAnterior349(ejercicio(), c.per), ej = String(pa.ej), cP = pa.per; // rectificación: periodo inmediatamente anterior
    const rect = neg.length ? `<h4 style="margin:10px 0 4px">Facturas negativas → rectificaciones</h4><table class="tabla t349-rect" style="width:100%;table-layout:fixed;font-size:12px"><colgroup><col style="width:22%"><col style="width:5%"><col style="width:19%"><col style="width:9%"><col style="width:8%"><col style="width:11%"><col style="width:10%"><col style="width:11%"><col style="width:5%"></colgroup><thead><tr><th>Operador</th><th>Clave</th><th>Facturas negativas</th><th>Importe</th><th>Ejercicio rectificado</th><th>Periodo rectificado</th><th>Base declarada anteriormente</th><th>Base rectificada (nueva)</th><th>Excluir</th></tr></thead><tbody>
      ${neg.map((o) => { const k = `${o.pais}|${o.nif}|${o.clave}`, r = R[k] ?? {}, def = { ej, per: cP, ant: nf2(-o.base), nue: nf2(0) }, f = (cc) => `<input value="${esc(def[cc])}" readonly tabindex="-1" style="width:100%;box-sizing:border-box;text-align:right;color:#555;background:#f4f4f4">`;
        return `<tr><td>${esc(o.pais + o.nif)} · ${esc(o.nombre)}</td><td class="c">${o.clave}</td><td>${o.lineas.map((l) => esc((l.factura || 's/n') + (l.fecha ? ` (${fdateIso(l.fecha)})` : ''))).join('<br>')}</td><td class="n">${money(o.base)}</td><td>${f('ej')}</td><td>${f('per')}</td><td>${f('ant')}</td><td>${f('nue')}</td><td class="c"><input type="checkbox" data-t349r="${esc(k)}|exc"${r.exc ? ' checked' : ''}></td></tr>`; }).join('')}</tbody></table>
      <p class="leyenda">Las facturas negativas no restan del neto: van como registro de rectificación (por operador y clave). Si el operador tiene facturas en el periodo, el abono se resta de ellas y no sale aquí. Automático: ejercicio y periodo inmediatamente anteriores al de esta declaración, base declarada anteriormente = importe del abono y base rectificada = 0 (declarada + importe). «Excluir» lo deja fuera del fichero.</p>` : '';
    return `<div class="filtros" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <label>Periodo <select data-t349="per">${['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '1T', '2T', '3T', '4T', '0A'].map((v) => `<option${v === c.per ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Teléfono contacto ${inp('tel', '9 dígitos', 11)}</label><label>Persona de contacto ${inp('cont', 'Apellidos y nombre', 28)}</label>
      <label>Nº justificante ${inp('just', '349 + 10 dígitos', 15)}</label>
      <label>Tipo <select data-t349="comp"><option value=""${!c.comp ? ' selected' : ''}>Normal</option><option value="C"${c.comp === 'C' ? ' selected' : ''}>Complementaria</option><option value="S"${c.comp === 'S' ? ' selected' : ''}>Sustitutiva</option></select></label>
      ${c.comp ? `<label>Nº justificante anterior ${inp('ant', '13 dígitos', 15)}</label>` : ''}
      <button class="btn small" data-gen349="1">Generar fichero .txt 349</button></div>${rect}
      <p class="leyenda">Fichero para «Presentación mediante fichero» en la sede de la AEAT: registro 1 (declarante), un registro 2 por operador y un registro 2 de rectificación por cada operador/clave con facturas negativas. El justificante, si se deja vacío, se genera (349 + 10 dígitos).</p>`;
  }
  function generar349Txt() {
    const m = datos349(), c = t349Cfg(), e = empresa(), ej = String(ejercicio()), err = [];
    if (!e) return;
    if (!m.ops.length && !m.rect.length) err.push('No hay operadores en el periodo');
    m.ops.concat(m.rect).forEach((o) => { if (!o.pais || o.pais === '?' || !esUE(o.pais)) err.push(`${o.nombre}: país UE no válido (${o.pais || 'vacío'})`); if (!o.nif) err.push(`${o.nombre}: falta NIF-IVA`); });
    const R = lsGet().rect ?? {}, rect = [];
    m.rect.forEach((o) => {
      const r = R[`${o.pais}|${o.nif}|${o.clave}`] ?? {}; if (r.exc) return;
      const pa = periodoAnterior349(ejercicio(), c.per), rej = String(pa.ej), rper = pa.per; const ant = r2(-o.base); let nue = null;
      if (nue === null && ant !== null) nue = r2(ant + o.base); else if (nue !== null && nue < 0 && ant !== null) nue = r2(ant + nue);
      const q = `${o.nombre} (${o.clave}, abono ${nf2(o.base)}): `;
      if (!/^\d{4}$/.test(rej)) err.push(`${q}ejercicio rectificado no válido`);
      else if (!/^(0[1-9]|1[0-2]|[1-4]T|0A)$/.test(rper)) err.push(`${q}periodo rectificado no válido (01-12, 1T-4T)`);
      else if (ant === null) err.push(`${q}falta la base declarada anteriormente en el 349 de ${rper}/${rej}`);
      else if (nue < 0) err.push(`${q}la base rectificada sale negativa (${nf2(nue)}). La base declarada anteriormente (${nf2(ant)}) debe ser la base total que se declaró para este operador y clave en ${rper}/${rej}; la rectificada = declarada − abono. Si no consta declarada, márcalo Excluir`);
      else rect.push({ o, rej, rper, ant, nue });
    });
    if (!c.per) err.push('Elige el periodo del fichero');
    if (c.tel && !/^\d{9}$/.test(c.tel)) err.push('Teléfono: 9 dígitos');
    if (c.just && !/^349\d{10}$/.test(c.just)) err.push('Nº justificante: 349 + 10 dígitos');
    if (c.comp && !/^349\d{10}$/.test(c.ant)) err.push('Nº justificante anterior obligatorio en complementaria/sustitutiva');
    if (err.length) { alert(`No se genera el fichero:\n- ${err.join('\n- ')}`); return; }
    const malV = m.ops.concat(m.rect).filter((o) => vies[clienteVies(o)]?.est === 'ko');
    if (malV.length && !confirm(`VIES dice que estos NIF-IVA no están registrados:\n- ${malV.map((o) => `${o.pais}${o.nif} ${o.nombre}`).join('\n- ')}\n\nLa AEAT los rechazará. ¿Generar el fichero igualmente?`)) return;
    const just = c.just || `349${String(Date.now()).slice(-10)}`, nif = txtAlfa(e.cif, 9), cent = (v) => Math.round(Math.abs(v) * 100);
    const pos = m.ops.filter((o) => o.base >= 0), tot = pos.reduce((s, o) => s + cent(o.base), 0), totR = rect.reduce((s, x) => s + cent(x.nue), 0);
    if (!pos.length && !rect.length) { alert('No hay operadores que incluir'); return; }
    let r1 = `1349${ej}${nif}${txtAlfa(nombreEmp(e), 40)}T${txtNum(c.tel, 9).replace(/^0{9}$/, '         ')}${txtAlfa(c.cont, 40)}${just}${c.comp === 'C' ? 'C' : ' '}${c.comp === 'S' ? 'S' : ' '}${c.comp ? c.ant : '0'.repeat(13)}${c.per.padEnd(2)}${txtNum(pos.length, 9)}${txtNum(tot, 15)}${txtNum(rect.length, 9)}${txtNum(totR, 15)} `;
    r1 = r1.padEnd(500, ' ');
    const cab2 = (o) => `2349${ej}${nif}${' '.repeat(58)}${txtAlfa(o.pais, 2)}${txtAlfa(String(o.nif).replace(/[^A-Za-z0-9]/g, ''), 15)}${txtAlfa(o.nombre, 40)}${o.clave}`;
    const r2s = pos.map((o) => (cab2(o) + txtNum(cent(o.base), 13)).padEnd(500, ' ')).concat(rect.map((x) => (cab2(x.o) + ' '.repeat(13) + x.rej + x.rper + txtNum(cent(x.nue), 13) + txtNum(cent(x.ant), 13)).padEnd(500, ' ')));
    const txt = [r1].concat(r2s).join('\r\n'), bad = [r1].concat(r2s).find((x) => x.length !== 500);
    if (bad) { alert('Error interno: registro con longitud distinta de 500'); return; }
    const bytes = new Uint8Array(txt.length); for (let i = 0; i < txt.length; i++) { const k = txt.charCodeAt(i); bytes[i] = k < 256 ? k : 32; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'text/plain;charset=iso-8859-1' }));
    a.download = `${e.cif}_349_${ej}_${c.per}.txt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (!c.just) { const o = lsGet(); o.just = just; lsSet(o); render(); }
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target; if (!t?.dataset) return;
    if (t.dataset.t349) { const o = lsGet(); o[t.dataset.t349] = t.value.trim(); lsSet(o); render(); }
    else if (t.dataset.t349r) { const [k, f] = t.dataset.t349r.split('|'), o = lsGet(); (o.rect ??= {}); (o.rect[k] ??= {})[f] = t.checked; lsSet(o); render(); }
  });
  document.addEventListener('click', (ev) => { if (ev.target.closest?.('[data-gen349]')) generar349Txt(); });
  // ---- Comprobación de los NIF-IVA comunitarios con VIES (Comisión Europea) ----
  // Resultado por país+NIF en memoria: { est: 'ok' | 'ko' | 'err', nombre, msg }. Si el navegador no deja la consulta, queda el enlace a VIES.
  const vies = {};
  let viesMsg = '', viesOcupado = false;
  const clienteVies = (o) => `${o.pais === 'EL' ? 'EL' : o.pais}${String(o.nif).replace(/[^A-Za-z0-9]/g, '')}`;
  async function comprobarVies() {
    if (viesOcupado) return;
    const m = datos349(), todos = [...new Map(m.ops.concat(m.rect).filter((o) => o.pais && o.pais !== '?' && o.nif).map((o) => [clienteVies(o), o])).values()];
    if (!todos.length) { viesMsg = 'No hay NIF-IVA con prefijo de país que comprobar.'; render(); return; }
    viesOcupado = true;
    let n = 0;
    for (const o of todos) {
      n++; viesMsg = `Consultando VIES… ${n} de ${todos.length}`; render();
      try {
        const r = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-service/ms/${encodeURIComponent(o.pais)}/vat/${encodeURIComponent(String(o.nif).replace(/[^A-Za-z0-9]/g, ''))}`);
        const j = await r.json();
        if (j.isValid === true || j.valid === true) vies[clienteVies(o)] = { est: 'ok', nombre: j.name && j.name !== '---' ? j.name : '', msg: j.address && j.address !== '---' ? j.address : '' };
        else if (j.isValid === false || j.valid === false) vies[clienteVies(o)] = { est: 'ko', nombre: '', msg: 'VIES dice que el NIF-IVA no está registrado' };
        else vies[clienteVies(o)] = { est: 'err', nombre: '', msg: j.errorWrappers?.[0]?.error || j.userError || 'VIES no ha dado respuesta' };
      } catch (err) { vies[clienteVies(o)] = { est: 'err', nombre: '', msg: 'No se ha podido consultar VIES desde el navegador' }; }
      await new Promise((ok) => setTimeout(ok, 400)); // sin ráfagas: VIES limita las consultas
    }
    const k = Object.values(vies);
    viesMsg = `VIES: ${k.filter((x) => x.est === 'ok').length} válidos · ${k.filter((x) => x.est === 'ko').length} no válidos · ${k.filter((x) => x.est === 'err').length} sin respuesta`;
    viesOcupado = false; render();
  }
  document.addEventListener('click', (ev) => { if (ev.target.closest?.('[data-vies349]')) comprobarVies(); });
  const celdaVies = (o) => {
    const r = vies[clienteVies(o)];
    if (!r) return '<span class="hint">sin comprobar</span>';
    return r.est === 'ok' ? `<span style="color:#14602a;font-weight:600" title="${esc(`${r.nombre} ${r.msg}`.trim())}">✓ válido${r.nombre ? ` · ${esc(r.nombre)}` : ''}</span>`
      : r.est === 'ko' ? `<span style="color:#a4161a;font-weight:600">✕ no válido</span>` : `<span style="color:#8a6d00" title="${esc(r.msg)}">⚠ sin respuesta</span>`;
  };
  function vista349() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return cargandoTxt;
    if (!E.length && !R.length) return '<p class="vacio">Sin datos: carga los libros de IVA con los botones EMITIDAS y RECIBIDAS.</p>';
    const e = empresa(), ej = ejercicio(), p = S.periodo, m = calcular349Ops(E, R, ej, p);
    const cl = { E: 'E', A: 'A', T: 'T', S: 'S', I: 'I' };
    const sec = (t) => `<div class="f303-sec">${t}</div>`;
    const fila = (lb, q, cls = '') => `<div class="f-row l1 ${cls}"><span class="lb">${lb}</span>${q}</div>`;
    const caja = (v, cls = '') => `<span class="bx ${cls}"><b></b><span class="v">${v}</span></span>`;
    const rel = m.ops.length ? `<p class="no-print" style="margin:0 0 8px"><button class="small" data-vies349="1"${viesOcupado ? ' disabled' : ''}>Comprobar los NIF-IVA con VIES</button> <a class="small" href="https://ec.europa.eu/taxation_customs/vies/#/vat-validation" target="_blank" rel="noopener">Abrir VIES</a> <span class="hint">${esc(viesMsg || 'Consulta la web oficial de la Comisión Europea, de uno en uno.')}</span></p>
      <table class="t349-t rel"><colgroup><col style="width:70px"><col style="width:170px"><col><col style="width:80px"><col style="width:170px"><col style="width:230px"></colgroup>
      <thead><tr><th>Código país</th><th>NIF comunitario</th><th>Apellidos y nombre o razón social</th><th>Clave</th><th>Base imponible</th><th>VIES</th></tr></thead><tbody>
      ${m.ops.map((o) => `<tr class="${o.avisos.size ? 'aviso' : ''}" title="${esc([...o.avisos].join('; '))}"><td class="c">${esc(o.pais)}</td><td>${esc(o.nif)}</td><td>${esc(o.nombre)}${o.avisos.size ? ` <span class="man-lbl">⚠ ${esc([...o.avisos].join('; '))}</span>` : ''}</td><td class="c"><b>${cl[o.clave] || o.clave}</b></td><td class="n">${money(o.base)}</td><td>${o.pais === '?' ? '<span class="hint">falta el prefijo de país</span>' : celdaVies(o)}</td></tr>`).join('')}
      </tbody></table>
      <p class="leyenda" style="margin:8px 0 0">Claves: E entregas intracomunitarias de bienes · A adquisiciones intracomunitarias de bienes · T operaciones triangulares · S prestaciones intracomunitarias de servicios · I adquisiciones intracomunitarias de servicios.</p>`
      : '<p class="leyenda">No hay operaciones intracomunitarias en el periodo.</p>';
    const fact = m.ops.length ? `<div class="lst-scroll" style="max-height:480px"><table class="t349-t aud"><thead><tr><th>Clave</th><th>Libro</th><th>Fecha</th><th>Factura</th><th>País</th><th>NIF</th><th>Nombre</th><th>Código impuesto</th><th>Base imponible</th></tr></thead><tbody>
      ${m.ops.map((o) => o.lineas.slice().sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))).map((l) => `<tr><td class="c"><b>${o.clave}</b></td><td>${l.side === 'rep' ? 'Emitida' : 'Recibida'}</td><td class="c">${fdateIso(l.fecha)}</td><td>${esc(l.factura || '')}</td><td class="c">${esc(o.pais)}</td><td>${esc(l.nif || '')}</td><td>${esc(l.nombre || '')}</td><td>${esc(l.tipoop || '')}</td><td class="n">${money(l.base)}</td></tr>`).join('')
        + `<tr class="totano"><td colspan="8">Total ${o.clave} · ${esc(o.nombre)} (${o.n} factura${o.n > 1 ? 's' : ''})</td><td class="n">${money(o.base)}</td></tr>`).join('')}
      </tbody></table></div>` : '';
    return `${avisos(m.avisos)}<p class="hint">Se agrupa por país, NIF comunitario y clave. Las facturas con NIF de otro Estado miembro se detectan solas; el resto depende del código de impuesto del libro de IVA.</p>
      <div class="f303 t349"><div class="f303-top"><div class="ag"><b>Agencia Tributaria</b><small>Borrador para transcribir en la Sede Electrónica</small></div>
        <div class="tt">Declaración recapitulativa de operaciones intracomunitarias</div><div class="mod"><small>Modelo</small><b>349</b></div></div>
      ${sec('Identificación')}<div class="f303-id"><span class="idbox"><b>NIF</b><span>${esc(e?.cif)}</span></span><span class="idbox grow"><b>Apellidos y nombre o razón social</b><span>${esc(nombreEmp(e))}</span></span></div>
      ${sec('Devengo')}<div class="f303-id"><span class="idbox"><b>Ejercicio</b><span>${ej}</span></span><span class="idbox"><b>Período</b><span>${esc(p || '—')}</span></span></div>
      ${sec('Fichero .txt para presentar')}<div class="t349-b">${bloque349Txt(m)}</div>
      ${sec('Resumen de los datos incluidos en la declaración')}
      ${fila('Número total de operadores intracomunitarios', caja(m.nOps))}
      ${fila('<b>Importe de las operaciones intracomunitarias</b>', caja(money(m.total), 'tot'))}
      ${fila('Número total de operadores intracomunitarios con rectificaciones', caja(m.nRect || 0))}
      ${fila('Facturas negativas del periodo (rectificaciones) <span class="man-lbl">el importe a declarar es la base rectificada, ver «Fichero .txt»</span>', caja(money(m.totRect || 0)))}
      ${sec('Relación de operadores intracomunitarios')}<div class="t349-b">${rel}</div>
      ${m.ops.length ? `${sec('Facturas incluidas en la declaración')}<div class="t349-b">${fact}</div>` : ''}</div>`;
  }
  const tabs = {
    mod349: ['Modelo 349', 'Intracomunitarias', vista349],
    mod390: ['Modelo 390', 'Resumen anual IVA', vista390],
    mod180: ['Modelo 180', 'Resumen anual 115', () => vistaAnual(180)],
    mod190: ['Modelo 190', 'Resumen anual 111', () => vistaAnual(190)],
    mod193: ['Modelo 193', 'Resumen anual 123', () => vistaAnual(193)],
  };
  return { tabs };
}
