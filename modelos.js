// Bloque 4 · modelos tributarios portados de la aplicación antigua: 232 (operaciones vinculadas) y 583 (producción eléctrica).
// Los datos de cada modelo se guardan en `registros` (tipo m232 / m583, un registro por empresa y ejercicio).
export function crearModelos(c) {
  const { db, S, esc, render, empresa, puede, eur, grande, leerPdf } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  const parseNum = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const v = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t); return Number.isNaN(v) ? null : v; };
  const fmtIn = (v) => (v === '' || v == null ? '' : String(r2(v)).replace('.', ','));
  const nifN = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  const ejercicio = () => Number(S.ejercicio) || new Date().getFullYear();
  const avisos = (l) => l.map((t) => `<div class="aviso">${esc(t)}</div>`).join('');
  let msg = '', msgMal = false;
  const aviso = (m, mal = false) => { msg = m; msgMal = mal; render(); };
  const avisoHtml = () => (msg ? `<p class="hint rg-msg${msgMal ? ' mal' : ''}"><b>${esc(msg)}</b></p>` : '');

  // ---------- Registros por empresa y ejercicio ----------
  const regDe = (tipo, empId, ej) => S.registros.find((r) => r.tipo === tipo && r.empresa_id === empId && r.ejercicio === ej);
  async function guardar(tipo, empId, ej, datos) {
    const ex = regDe(tipo, empId, ej);
    if (ex) {
      ex.datos = datos;
      const { error } = await db.from('registros').update({ datos }).eq('id', ex.id);
      if (error) alert(error.message);
    } else {
      const fila = { id: crypto.randomUUID(), empresa_id: empId, tipo, ejercicio: ej, datos };
      S.registros.push(fila);
      const { error } = await db.from('registros').insert(fila);
      if (error) alert(error.message);
    }
  }

  // ================= Modelo 232 · operaciones vinculadas con sociedades del grupo (desde los libros de IVA) =================
  const M232_COLS = [['nif', 'NIF', 10], ['fj', 'F/J/Otra', 3], ['nom', 'Apellidos y nombre / Razón social', 28], ['vinc', 'Tipo vinculación', 3], ['prov', 'Código provincia/país', 4],
    ['op', 'Tipo de operación', 3], ['ip', 'Ingreso (I) / Pago (P)', 2], ['met', 'Método valoración (art. 18.4 LIS)', 4], ['imp', 'Importe operación', 13]];
  const M232_PROV41 = ['B91428995']; // Sevilla (Hispalense de Líquidos); el resto del grupo, Granada (18)
  let ej232 = null;
  const m232EjDef = () => ej232 || Math.min(ejercicio(), new Date().getFullYear() - 1); // en 2026 se presenta el 232 de 2025
  const nuevo232 = () => ({ cab: {}, filas: [], man: {} });
  const m232Reg = (ej, empId = S.sel) => { const r = regDe('m232', empId, ej); return r ? { ...nuevo232(), ...r.datos } : nuevo232(); };
  const m232Guardar = (ej, D, empId = S.sel) => guardar('m232', empId, ej, D);

  function calc232(ej) {
    const E = grande('fact-E'), R = grande('fact-R');
    const G = {};
    S.empresas.forEach((e) => { if (e.id !== S.sel && e.cif) G[nifN(e.cif)] = { e, rep: 0, sop: 0, nr: 0, ns: 0 }; });
    [['rep', E], ['sop', R]].forEach(([side, L]) => (L ?? []).forEach((l) => {
      if (String(l.fecha ?? '').slice(0, 4) !== String(ej)) return;
      const g = G[nifN(l.nif)]; if (!g) return;
      g[side] = r2(g[side] + (+l.base || 0)); g[side === 'rep' ? 'nr' : 'ns']++;
    }));
    const man = m232Reg(ej).man;
    return { ej, filas: Object.entries(G).map(([nif, g]) => { const m = man[nif] ?? {}, otras = +m.otras || 0;
      return { id: nif, nom: g.e.nombre, rep: g.rep, sop: g.sop, otras, nr: g.nr, ns: g.ns, oblig: Math.abs(g.rep) + Math.abs(g.sop) + Math.abs(otras) > 250000, obs: m.obs ?? '' }; })
      .filter((x) => x.nr || x.ns || x.otras || x.obs) };
  }

  // registros del apartado 3 desde los libros: R.I.ALQ → 08 arrendamientos, R.I.INT → 09 intereses (y se quita la línea duplicada de la misma factura); resto 01 bienes / 06 servicios según el 232 del año anterior
  function m232Ops(ej) {
    const ids = new Set(S.empresas.filter((e) => e.id !== S.sel && e.cif).map((e) => nifN(e.cif))), A = m232Reg(ej - 1), O = {};
    const esp = (l) => { const t = String(l.codigo ?? '').toUpperCase(); return t.includes('.I.ALQ') ? '08' : t.includes('.I.INT') ? '09' : ''; };
    [['rep', 'I', grande('fact-E')], ['sop', 'P', grande('fact-R')]].forEach(([, ip, lib]) => {
      const L = (lib ?? []).filter((l) => String(l.fecha ?? '').slice(0, 4) === String(ej) && ids.has(nifN(l.nif)));
      const conEsp = new Set(L.filter(esp).map((l) => `${nifN(l.nif)}|${String(l.factura ?? '').trim()}`));
      L.forEach((l) => {
        const nif = nifN(l.nif), e = esp(l);
        if (!e && conEsp.has(`${nif}|${String(l.factura ?? '').trim()}`)) return;
        let op = e;
        if (!op) { const p = A.filas.find((f) => f.nif === nif && f.ip === ip && !['08', '09'].includes(f.op)); op = p ? p.op : /NS$/.test(String(l.codigo ?? '').toUpperCase()) ? '06' : '01'; }
        const k = `${nif}|${op}|${ip}`; O[k] = r2((O[k] || 0) + (+l.base || 0));
      });
    });
    return O;
  }
  function m232Vinc(nif, ej) {
    const ys = S.registros.filter((r) => r.tipo === 'm232' && r.empresa_id === S.sel && r.ejercicio <= ej).sort((a, b) => b.ejercicio - a.ejercicio);
    for (const r of ys) { const f = (r.datos.filas ?? []).find((x) => x.nif === nif && x.vinc); if (f) return f.vinc; }
    return 'D';
  }
  const m232Prov = (nif) => (M232_PROV41.includes(nif) ? '41' : '18');
  // vinculación, provincia (41/18), tipo de operación y método nunca en blanco
  function m232Completar(D, ej) {
    let n = 0;
    D.filas.forEach((f) => { if (!f.nif) return;
      if (!f.vinc) { f.vinc = m232Vinc(f.nif, ej); n++; } if (!f.prov) { f.prov = m232Prov(f.nif); n++; } if (!f.op) { f.op = '01'; n++; }
      if (!f.ip) { f.ip = 'I'; n++; } if (!f.fj) { f.fj = 'J'; n++; } if (!f.met) { f.met = '1A'; n++; } });
    return n;
  }
  async function m232Proponer(ej, silencio) {
    const D = m232Reg(ej), A = m232Reg(ej - 1), R = calc232(ej), O = m232Ops(ej);
    if (D.pres) { if (!silencio) aviso(`El 232 de ${ej} ya está cargado como presentado: no se rehace`, true); return; }
    const ob = new Set(R.filas.filter((x) => x.oblig).map((x) => x.id)), nueva = [];
    Object.entries(O).sort().forEach(([k, v]) => {
      const [nif, op, ip] = k.split('|'); if (!ob.has(nif) || !(Math.abs(v) > 0.005)) return;
      const E = S.empresas.find((e) => nifN(e.cif) === nif) ?? {}, pk = A.filas.find((f) => f.nif === nif && f.op === op && f.ip === ip) ?? {}, pn = A.filas.find((f) => f.nif === nif) ?? {};
      nueva.push({ nif, fj: pn.fj || 'J', nom: pn.nom || E.nombre || '', vinc: pn.vinc || m232Vinc(nif, ej), prov: pn.prov || m232Prov(nif), op, ip, met: pk.met || pn.met || '1A', imp: fmtIn(r2(v)), auto: 1 });
    });
    D.filas = D.filas.filter((f) => !f.auto).concat(nueva); m232Completar(D, ej);
    if (!D.cab.cnae && A.cab?.cnae) D.cab.cnae = A.cab.cnae;
    if (!D.cab.tipoEj && A.cab?.tipoEj) D.cab.tipoEj = A.cab.tipoEj;
    D.oblig = !!(ob.size || D.filas.length);
    await m232Guardar(ej, D);
    if (!silencio) aviso(`232 de ${ej}: ${nueva.length} registros desde los libros`); else render();
  }

  function m232Borrador(ej) {
    const D = m232Reg(ej), F = D.filas, E = empresa(), n = (v) => eur(parseNum(v) || 0);
    const tot = (ip) => eur(r2(F.filter((f) => f.ip === ip).reduce((a, f) => a + (parseNum(f.imp) || 0), 0)));
    const w = window.open('', '_blank'); if (!w) return void aviso('El navegador ha bloqueado la ventana del borrador', true);
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Borrador 232 ${ej} · ${esc(E.nombre)}</title><style>body{font:12px Arial,sans-serif;margin:24px;color:#000}h1{font-size:16px;margin:0}h2{font-size:13px;margin:16px 0 6px;background:#dde4ee;padding:4px 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:3px 5px;vertical-align:top}th{background:#eef1f5;font-size:11px}.n{text-align:right;white-space:nowrap}.c{text-align:center}.cab td{border:1px solid #777}.mark{color:#a00;font-weight:700}@media print{button{display:none}}</style></head><body>
      <button onclick="print()">Imprimir / guardar PDF</button>
      <p class="mark">BORRADOR · no presentado</p><h1>Modelo 232 · Declaración informativa de operaciones vinculadas y de operaciones y situaciones relacionadas con países o territorios calificados como no cooperativos</h1>
      <h2>(1) Identificación · (2) Devengo</h2><table class="cab"><tr><th>NIF</th><th>Razón social</th><th>Ejercicio</th><th>Tipo de ejercicio</th><th>CNAE 2009 actividad principal</th><th>Plazo</th></tr><tr><td>${esc(E.cif)}</td><td>${esc(E.nombre)}</td><td class="c">${ej}</td><td class="c">${esc(D.cab.tipoEj || '1')}</td><td class="c">${esc(D.cab.cnae || '')}</td><td>1 a 30 de noviembre de ${ej + 1}</td></tr></table>
      <h2>(3) Información de operaciones con personas o entidades vinculadas (art. 13.4 RIS)</h2><table><tr><th>#</th>${M232_COLS.map((x) => `<th>${x[1]}</th>`).join('')}</tr>
      ${F.map((f, i) => `<tr><td class="c">${i + 1}</td>${M232_COLS.map(([k]) => `<td class="${k === 'imp' ? 'n' : ['fj', 'vinc', 'prov', 'op', 'ip', 'met'].includes(k) ? 'c' : ''}">${k === 'imp' ? n(f.imp) : esc(f[k] || '')}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="10" class="c">Sin registros</td></tr>'}
      <tr><td colspan="9"><b>Total ingresos (I)</b></td><td class="n"><b>${tot('I')}</b></td></tr><tr><td colspan="9"><b>Total pagos (P)</b></td><td class="n"><b>${tot('P')}</b></td></tr></table>
      <h2>(4) Reducción de rentas procedentes de determinados activos intangibles (art. 23 LIS)</h2><p>Sin datos.</p><h2>(5) Operaciones y situaciones relacionadas con países o territorios calificados como no cooperativos</h2><p>Sin datos.</p>
      <p style="font-size:10px;color:#555">Borrador generado ${new Date().toLocaleString('es-ES')} desde los libros de IVA y el 232 de ${ej - 1}. Tipos: 01 bienes · 06 servicios · 08 arrendamientos · 09 intereses. Revisar vinculación, provincia y método antes de presentar en la Sede (formulario 232).</p></body></html>`);
    w.document.close();
  }

  async function m232Pdf(file) {
    let L;
    try { L = (await leerPdf(file)).texto.split('\n').filter((l) => !l.startsWith('--- página')).map((l) => l.replace(/\s+/g, ' ').trim()); }
    catch (e) { return void aviso(`${file.name}: ${e.message}`, true); }
    const t = L.join(' ');
    const ej = +((t.match(/Ejercicio[\s.]*((?:19|20)\d{2})/) || [])[1] || 0);
    if (!ej) return void aviso(`${file.name}: no encuentro el ejercicio del 232`, true);
    const rx = /^([A-Z0-9]{9})\s+(F|J|Otra)\s+(.+?)\s+([A-Z])\s+(\d{2,3})\s+(\d{2})\s+([IP])\s+(\S{1,3})\s+(-?[\d.]+,\d{2})$/, filas = [];
    L.forEach((l) => { const m = l.match(rx); if (m) filas.push({ nif: m[1], fj: m[2], nom: m[3], vinc: m[4], prov: m[5], op: m[6], ip: m[7], met: m[8], imp: m[9] }); });
    if (!filas.length) return void aviso(`${file.name}: no encuentro registros de operaciones vinculadas`, true);
    const cnae = (t.match(/actividad principal[\s.]*(\d{4})/) || [])[1] || '', tipoEj = (t.match(/Tipo ejercicio[\s.]*(\d)/) || [])[1] || '';
    const just = (t.match(/N[uú]mero de justificante:\s*(\d+)/) || [])[1] || '', fp = (t.match(/Presentaci[oó]n realizada el:\s*(\d{2}-\d{2}-\d{4})/) || [])[1] || '';
    const dec = (t.match(/Identificaci[oó]n\s*\(1\)[\s\S]{0,200}?\b([A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z])\b/) || [])[1] || '';
    const otra = dec && dec !== nifN(empresa()?.cif) && S.empresas.find((e) => nifN(e.cif) === dec);
    const destino = otra ? otra.id : S.sel;
    await m232Guardar(ej, { ...m232Reg(ej, destino), cab: { cnae, tipoEj, just, fpres: fp, pdf: file.name }, filas, pres: true, oblig: true }, destino);
    if (!otra) ej232 = ej;
    aviso(`${file.name}: 232 de ${ej} · ${filas.length} registros leídos${otra ? ` · guardado en ${otra.nombre} (es su declarante), no en ${empresa().nombre}` : ''}`);
  }
  async function cargar232(files) { for (const f of files) await m232Pdf(f); }

  const auto232 = new Set();
  function vista232() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), Rr = grande('fact-R');
    if (!E || !Rr) return cargandoTxt;
    const ej = m232EjDef(), R = calc232(ej), ob = R.filas.filter((x) => x.oblig), D = m232Reg(ej), ed = puede();
    // como en la antigua: si hay obligados y no hay 232 presentado ni registros a mano, se propone solo desde los libros
    const clave = `${S.sel}|${ej}|${E.length}|${Rr.length}`;
    if (ed && !auto232.has(clave) && !D.pres) {
      auto232.add(clave);
      const o = !!(ob.length || D.filas.length), falta = !D.filas.some((f) => !f.auto) && ob.length;
      if (falta) setTimeout(() => m232Proponer(ej, true), 0);
      else if (!!D.oblig !== o || m232Completar(D, ej)) setTimeout(() => { D.oblig = o; m232Completar(D, ej); m232Guardar(ej, D); }, 0);
    }
    const F = D.filas, n = (v) => eur(v), tot = (ip) => r2(F.filter((f) => f.ip === ip).reduce((a, f) => a + (parseNum(f.imp) || 0), 0));
    const porE = {}; F.forEach((f) => { const o = (porE[f.nif] ??= { nom: f.nom, I: 0, P: 0 }); o[f.ip === 'P' ? 'P' : 'I'] += parseNum(f.imp) || 0; });
    const dis = ed ? '' : ' disabled';
    const estructura = `<section class="block"><h3 class="bt">Modelo 232 · ${esc(empresa().nombre)} · ejercicio <input class="facin" data-m232ej="1" value="${ej}" size="5"></h3>
      ${ed ? `<div class="dropzone" data-kind="m232" tabindex="0" role="button"><b>Suelta aquí el PDF de un modelo 232 presentado</b> o pulsa para elegirlo: se cargan sus registros en su ejercicio y sirven de plantilla (vinculación, provincia, tipo de operación y método) para el año siguiente.
        <input type="file" data-dzkind="m232" accept=".pdf" multiple hidden></div>` : ''}
      <div class="wrap"><table class="tabla" style="width:auto;margin:8px 0"><tbody>
        <tr><td>(1) Identificación</td><td>${esc(empresa().cif)} · ${esc(empresa().nombre)}</td></tr>
        <tr><td>(2) Devengo · ejercicio / tipo ejercicio</td><td>${ej} / <input class="facin" data-m232cab="tipoEj" value="${esc(D.cab.tipoEj || '1')}" size="2"${dis}></td></tr>
        <tr><td>Código CNAE (2009) actividad principal</td><td><input class="facin" data-m232cab="cnae" value="${esc(D.cab.cnae || '')}" size="6"${dis}></td></tr>
        ${D.cab.just ? `<tr><td>Presentado</td><td>justificante ${esc(D.cab.just)}${D.cab.fpres ? ` · el ${esc(D.cab.fpres)}` : ''}${D.cab.pdf ? ` · ${esc(D.cab.pdf)}` : ''}</td></tr>` : ''}</tbody></table></div>
      <h4 style="margin:6px 0">(3) Información operaciones con personas o entidades vinculadas (art. 13.4 RIS)</h4>
      <div class="wrap" style="overflow-x:auto"><table class="tabla" style="width:auto"><thead><tr><th>#</th>${M232_COLS.map((x) => `<th>${x[1]}</th>`).join('')}<th class="no-print"></th></tr></thead><tbody>
      ${F.map((f, i) => `<tr><td class="c">${i + 1}</td>${M232_COLS.map(([k, , w]) => `<td><input class="facin${k === 'imp' ? ' num' : ''}" data-m232f="${i}|${k}" value="${esc(f[k] || '')}" size="${w}"${dis}></td>`).join('')}<td class="no-print">${ed ? `<button class="small" data-act="m-232del" data-i="${i}">Quitar</button>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="${M232_COLS.length + 2}" class="c">Sin registros: pulsa «Rehacer desde los libros», suelta el 232 presentado o añade líneas</td></tr>`}
      ${F.length ? `<tr class="tot"><td colspan="9">Total ingresos (I) · pagos (P)</td><td class="num">I ${n(tot('I'))}<br>P ${n(tot('P'))}</td><td></td></tr>` : ''}</tbody></table></div>
      <div class="no-print" style="margin-top:6px">${ed ? '<button class="small" data-act="m-232add">+ Añadir registro</button> ' : ''}${ed ? `<button class="small" data-act="m-232prop">Rehacer desde los libros de IVA (${ej})</button> ` : ''}<button class="small primary" data-act="m-232bor">Borrador para presentar</button>
        <span class="hint">${D.pres ? 'Cargado del 232 presentado.' : `Se rellena solo con las entidades del grupo que superan 250.000 €: 08 arrendamientos (R.I.ALQ), 09 intereses (R.I.INT), resto 01/06 según el 232 de ${ej - 1}; vinculación, provincia y método del año anterior. Los registros que cambies a mano se conservan al rehacer.`}</span></div>
      ${Object.keys(porE).length ? `<h4 style="margin:10px 0 4px">Resumen por entidad vinculada</h4><div class="wrap"><table class="tabla" style="width:auto"><thead><tr><th>NIF</th><th>Entidad</th><th>Ingresos (I)</th><th>Pagos (P)</th></tr></thead><tbody>${Object.entries(porE).map(([k, o]) => `<tr><td>${esc(k)}</td><td>${esc(o.nom)}</td><td class="num">${n(o.I)}</td><td class="num">${n(o.P)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h4 style="margin:10px 0 4px">(4) Reducción de rentas de activos intangibles (art. 23 LIS) · (5) Operaciones con paraísos fiscales</h4><p class="hint">Sin datos: si los hubiera, añádelos en Observaciones del cuadro de abajo.</p></section>`;
    const otrasEnt = S.empresas.filter((e) => e.id !== S.sel && e.cif && !R.filas.some((x) => x.id === nifN(e.cif)));
    return `${avisos([`Modelo 232 (declaración informativa de operaciones vinculadas): obligatorio por cada entidad vinculada con la que el conjunto de operaciones del mismo tipo supere 250.000 € en el periodo impositivo (valor de mercado). Plazo: del 1 al 30 de noviembre de ${ej + 1} para el ejercicio ${ej} (si se presenta, sale en Liquidaciones a presentar de octubre y en el Calendario Fiscal de noviembre).`,
      'Ventas y compras salen de los libros de IVA cargados (bases imponibles con NIF de una sociedad del grupo). Préstamos, garantías, servicios sin IVA, dividendos y operaciones específicas (> 100.000 €, sin umbral en paraísos fiscales) añádelos en «Otras operaciones».'])}${avisoHtml()}
      ${estructura}<section class="block"><h3 class="bt">Detalle desde los libros de IVA · operaciones con sociedades del grupo ${ej} · ${esc(empresa().nombre)}</h3>
      <p><b>${ob.length ? `⚠ Obligado a presentar por ${ob.length} entidad(es) vinculada(s)` : 'Sin entidades que superen 250.000 € con los datos cargados'}</b></p>
      <div class="wrap"><table class="tabla" style="width:auto"><thead><tr><th>Entidad vinculada</th><th>NIF</th><th>Ventas / prestaciones (IVA repercutido)</th><th>Compras / adquisiciones (IVA soportado)</th><th>Otras operaciones (a mano)</th><th>¿Supera 250.000 €?</th><th>Observaciones</th></tr></thead><tbody>
      ${R.filas.map((x) => `<tr${x.oblig ? ' class="fila-ok"' : ''}><td>${esc(x.nom)}</td><td>${esc(x.id)}</td><td class="num">${n(x.rep)} <small>(${x.nr} fact.)</small></td><td class="num">${n(x.sop)} <small>(${x.ns} fact.)</small></td><td><input class="facin num" data-m232="${esc(x.id)}|otras" value="${x.otras ? fmtIn(x.otras) : ''}" size="12"${dis}></td><td class="c">${x.oblig ? '<b>SÍ · declarar</b>' : 'no'}</td><td><input class="facin" data-m232="${esc(x.id)}|obs" value="${esc(x.obs)}" size="30"${dis}></td></tr>`).join('')
        || `<tr><td colspan="7" class="c">Sin operaciones con sociedades del grupo en los libros cargados de ${ej}</td></tr>`}
      </tbody></table></div>
      ${ed ? `<p class="hint no-print">Añadir otra entidad vinculada: <select data-m232addent="1"><option value="">elige…</option>${otrasEnt.map((e) => `<option value="${esc(nifN(e.cif))}">${esc(e.nombre)}</option>`).join('')}</select></p>` : ''}</section>`;
  }

  // ================= Modelo 583 · impuesto sobre el valor de la producción de la energía eléctrica =================
  /* ejercicio 2023: suspendido · 2024: 50 %/75 %/100 %/100 % · 2026 (RDL 18/2026): 90 %/0 %/70 %/60 % · tipo 7 % (3,5 % en 2027 y 0 % desde 2028) */
  const M583_PER = [['1T', '1er pago fraccionado (enero-marzo)', '1 al 20 de mayo'], ['2T', '2º pago fraccionado (enero-junio)', '1 al 20 de septiembre'],
    ['3T', '3er pago fraccionado (enero-septiembre) · pago único si < 500.000 €', '1 al 20 de noviembre'], ['4T', '4º pago fraccionado (enero-diciembre)', '1 al 20 de febrero del año siguiente'],
    ['0A', 'Autoliquidación anual', '1 al 30 de noviembre del año siguiente']];
  const m583Pct = (y, q) => (y === 2023 ? 0 : y === 2024 ? [0.5, 0.75, 1, 1][q] : y === 2026 ? [0.9, 0, 0.7, 0.6][q] : 1);
  const m583Tipo = (y) => (y >= 2028 ? 0 : y === 2027 ? 3.5 : 7);
  const casaCta = (pref, dig) => {
    const m = /^(\d+)[.,](\d+)$/.exec(pref);
    if (m) { const sub = m[2].replace(/^0+/, '') || '0'; return new RegExp(`^${m[1]}0*${sub}$`).test(dig) || new RegExp(`^${m[1]}${m[2]}0*$`).test(dig); }
    return dig.startsWith(String(pref).replace(/\D/g, ''));
  };
  const inst0 = () => ({ reg: '', deleg: '', mwh: '', q: ['', '', '', ''] });
  const m583Datos = (ej) => { const r = regDe('m583', S.sel, ej); const E = r ? { ...r.datos } : {}; if (!E.inst?.length) E.inst = [inst0()]; return E; };
  const m583Guardar = async (f) => { const ej = ejercicio(), E = m583Datos(ej); f(E); await guardar('m583', S.sel, ej, E); render(); };
  // retribuciones del trimestre desde el mayor de la cuenta de ventas de electricidad (si se indica)
  function m583Auto(cta, ej, M) {
    if (!cta || !M) return null;
    const r = [0, 0, 0, 0]; let hay = false;
    M.forEach((l) => { if (String(l.fecha ?? '').slice(0, 4) !== String(ej) || !casaCta(cta, String(l.digitos ?? ''))) return; hay = true; r[Math.floor((Number(l.fecha.slice(5, 7)) - 1) / 3)] += (+l.haber || 0) - (+l.debe || 0); });
    return hay ? r.map(r2) : null;
  }
  function calc583(ej, M) {
    const E = m583Datos(ej), auto = m583Auto(E.cta, ej, M), tipo = m583Tipo(ej);
    const prev = regDe('m583', S.sel, ej - 1)?.datos; const prevTot = prev?.inst ? prev.inst.reduce((s, i) => s + (i.q ?? []).reduce((a, x) => a + (+x || 0), 0), 0) : null;
    const grandeV = E.grande !== undefined ? !!E.grande : prevTot !== null ? prevTot > 500000 : true;
    const per = E.per || (grandeV ? '1T' : '3T');
    const pers = grandeV ? ['1T', '2T', '3T', '4T', '0A'] : ['3T', '0A']; // períodos AEAT del 583: 1T-4T y 0A
    const nQ = { '1T': 1, '2T': 2, '3T': 3, '4T': 4, '0A': 4 };
    const inst = E.inst.map((I, k) => {
      const q = [0, 1, 2, 3].map((i) => { const v = I.q?.[i]; return v !== '' && v !== undefined && v !== null ? +v : k === 0 && auto ? auto[i] : 0; });
      const calc = {}; let pagos = 0;
      pers.forEach((p) => { const base = r2(q.slice(0, nQ[p]).reduce((s, x, i) => s + x * m583Pct(ej, i), 0)), cuota = r2(base * tipo / 100), dif = p === '0A' ? r2(cuota - pagos) : r2(Math.max(0, cuota - pagos));
        calc[p] = { base, cuota, pagos: r2(pagos), dif }; if (p !== '0A') pagos += dif; });
      return { I, q, calc };
    });
    return { ej, E, auto, tipo, grande: grandeV, per: pers.includes(per) ? per : pers[0], pers, inst, tot: (p) => r2(inst.reduce((s, x) => s + (x.calc[p] ? x.calc[p].dif : 0), 0)) };
  }
  function vista583() {
    if (!S.sel) return sinEmpresa;
    const M = grande('may-mov');
    if (!M) return cargandoTxt;
    const R = calc583(ejercicio(), M), p = R.per, PI = M583_PER.find((x) => x[0] === p), ed = puede(), dis = ed ? '' : ' disabled', e = empresa();
    const L = (t, n, v) => `<div class="f-row l1"><span class="lb">${t}</span><span class="bx"><b>${n}</b><span class="v">${v}</span></span></div>`;
    const pctTxt = [0, 1, 2, 3].map((i) => `${Math.round(m583Pct(R.ej, i) * 100)} %`).join(' · ');
    const ret = R.inst.map((x, k) => `<tr><td><input class="facin" data-m583i="${k}|reg" value="${esc(x.I.reg || '')}" placeholder="RO/RE o CIL" size="16"${dis}></td><td><input class="facin" data-m583i="${k}|deleg" value="${esc(x.I.deleg || '')}" size="6"${dis}></td>
      ${[0, 1, 2, 3].map((i) => { const man = x.I.q && x.I.q[i] !== '' && x.I.q[i] !== undefined; return `<td><input class="facin num${man ? ' editado' : ''}" data-m583i="${k}|q${i}" value="${man ? fmtIn(+x.I.q[i]) : ''}" placeholder="${!man && k === 0 && R.auto ? eur(R.auto[i]) : '0,00'}" size="13"${dis}></td>`; }).join('')}
      <td><input class="facin" data-m583i="${k}|mwh" value="${esc(x.I.mwh || '')}" size="10"${dis}></td><td>${ed && R.inst.length > 1 ? `<button class="small" data-act="m-583del" data-k="${k}">✕</button>` : ''}</td></tr>`).join('');
    const liq = R.inst.map((x, k) => { const cc = x.calc[p] ?? { base: 0, cuota: 0, pagos: 0, dif: 0 }; return `<div class="f583-inst">
      ${R.inst.length > 1 ? `<div class="f303-sec">Instalación ${esc(x.I.reg || String(k + 1))}</div>` : ''}
      ${L('a) Número de registro (RO/RE) o CIL de la instalación', 'a', esc(x.I.reg || '—'))}
      ${L('b) Delegación de la AEAT donde radica la instalación', 'b', esc(x.I.deleg || '—'))}
      ${p === '0A' ? L('c) Energía eléctrica medida en barras de central (MWh)', 'c', esc(x.I.mwh || '—')) : ''}
      ${L('d) Base imponible (art. 6 Ley 15/2012) · retribuciones acumuladas × porcentaje que integra la base', 'd', eur(cc.base))}
      ${L('e) Tipo impositivo (%)', 'e', nf.format(R.tipo))}
      ${L('f) Cuota íntegra [d × e]', 'f', eur(cc.cuota))}
      ${L('g) Pagos fraccionados realizados del ejercicio', 'g', eur(cc.pagos))}
      ${L(`h) Cuota diferencial [f − g]${p === '0A' ? ' (negativa: a devolver)' : ' (si es negativa, cero)'}`, 'h', eur(cc.dif))}</div>`; }).join('');
    const resumen = `<div class="wrap"><table class="tabla" style="width:100%"><thead><tr><th>Periodo</th><th>Concepto</th><th>Plazo de presentación</th><th class="num">Base imponible</th><th class="num">Cuota íntegra</th><th class="num">Pagos anteriores</th><th class="num">Cuota diferencial</th></tr></thead><tbody>${R.pers.map((q) => {
      const t = (k) => r2(R.inst.reduce((s, x) => s + x.calc[q][k], 0)), P2 = M583_PER.find((x) => x[0] === q);
      return `<tr${q === p ? ' class="fila-sel"' : ''}><td class="c"><button class="small" data-act="m-583per" data-p="${q}">${q}</button></td><td>${esc(P2[1])}</td><td>${esc(P2[2])}</td><td class="num">${eur(t('base'))}</td><td class="num">${eur(t('cuota'))}</td><td class="num">${eur(t('pagos'))}</td><td class="num"><b>${eur(t('dif'))}</b></td></tr>`; }).join('')}</tbody></table></div>`;
    const av = [`Ejercicio ${R.ej}: tipo ${nf.format(R.tipo)} %; porcentaje de las retribuciones de cada trimestre que integra la base: ${pctTxt}.${R.ej === 2026 ? ' Real Decreto-ley 18/2026, de 29 de junio: minoración del 10 % (1T), 100 % (2T), 30 % (3T) y 40 % (4T) para los pagos fraccionados y la autoliquidación de 2026.' : R.ej === 2027 ? ' Real Decreto-ley 18/2026: tipo del 3,5 % en 2027.' : R.ej >= 2028 ? ' Real Decreto-ley 18/2026: tipo del 0 %; no hay que autoliquidar ni hacer pagos fraccionados.' : ''}`];
    if (!R.auto && !R.inst.some((x) => x.I.q?.some((v) => v !== '' && v !== undefined))) av.push('Escribe las retribuciones de cada trimestre (importe total por la electricidad incorporada al sistema, según la notificación del operador) o indica la cuenta de ventas de electricidad para tomarlas del mayor.');
    return `${avisos(av)}<div class="f303"><div class="f303-top"><div class="ag"><b>Agencia Tributaria</b><small>Borrador para transcribir en la Sede Electrónica</small></div><div class="tt">Impuesto sobre el valor de la producción de la energía eléctrica. Autoliquidación y pagos fraccionados</div><div class="mod"><small>Modelo</small><b>583</b></div></div>
      <div class="f303-sec">Identificación (2)</div><div class="f303-id"><span class="idbox"><b>NIF</b><span>${esc(e.cif || '—')}</span></span><span class="idbox grow"><b>Apellidos y nombre o razón social</b><span>${esc(e.nombre || '—')}</span></span></div>
      <div class="f303-sec">Periodo de liquidación (3)</div>
      ${L('Ejercicio', '', R.ej)}
      <div class="f-row l1"><span class="lb">Periodo</span><span class="bx"><b></b><select data-m583sel="per"${dis} style="width:100%;min-width:0">${R.pers.map((q) => `<option value="${q}"${q === p ? ' selected' : ''}>${q} · ${M583_PER.find((x) => x[0] === q)[1]}</option>`).join('')}</select></span></div>
      <label class="f583-chk"><input type="checkbox" data-m583chk="grande"${R.grande ? ' checked' : ''}${dis}> Valor de la producción del año anterior superior a 500.000 € (cuatro pagos fraccionados; si no, un pago único en noviembre)</label>
      ${L('Plazo de presentación', '', esc(PI[2]))}
      <div class="f303-sec">Retribuciones por la electricidad incorporada al sistema</div>
      <div class="f-row l1"><span class="lb">Cuenta de ventas de electricidad (para tomar las retribuciones del mayor por trimestres; opcional)</span><span class="bx"><b></b><input data-m583sel="cta" value="${esc(R.E.cta || '')}" placeholder="p. ej. 7050.01"${dis}></span></div>
      <div class="wrap" style="padding:0 1rem"><table class="tabla" style="width:auto;margin-top:6px"><thead><tr><th>Nº registro / CIL</th><th>Delegación</th><th>1er trimestre</th><th>2º trimestre</th><th>3er trimestre</th><th>4º trimestre</th><th>MWh (anual)</th><th></th></tr></thead><tbody>${ret}</tbody></table></div>
      ${ed ? '<div style="padding:.5rem 1rem"><button class="small no-print" data-act="m-583add">Añadir instalación</button></div>' : ''}
      <div class="f303-sec">Liquidación (6)</div>${liq}
      <div class="f-row l1"><span class="lb"><b>i) Cuota diferencial total${p === '0A' ? ' (a ingresar o, si es negativa, a devolver)' : ' · a ingresar'}</b></span><span class="bx final"><b>i</b><span class="v"><b>${eur(R.tot(p))}</b></span></span></div>
      <div class="f303-sec">Calendario del ejercicio ${R.ej}</div>${resumen}</div>`;
  }

  // ================= Eventos propios =================
  const acciones = {
    'm-232add': async () => { const ej = m232EjDef(), D = m232Reg(ej); D.filas.push({ fj: 'J', ip: 'I', met: '1A' }); await m232Guardar(ej, D); render(); },
    'm-232prop': () => m232Proponer(m232EjDef(), false),
    'm-232bor': () => m232Borrador(m232EjDef()),
    'm-232del': async (d) => { const ej = m232EjDef(), D = m232Reg(ej); D.filas.splice(+d.i, 1); await m232Guardar(ej, D); render(); },
    'm-583per': (d) => m583Guardar((E) => { E.per = d.p; }),
    'm-583add': () => m583Guardar((E) => { E.inst.push(inst0()); }),
    'm-583del': (d) => m583Guardar((E) => { E.inst.splice(+d.k, 1); }),
  };
  document.addEventListener('change', async (ev) => {
    const t = ev.target; if (!t.dataset) return;
    const d = t.dataset;
    if (d.m232ej !== undefined) { ej232 = +t.value || null; return void render(); }
    if (d.m232cab) { const ej = m232EjDef(), D = m232Reg(ej); D.cab[d.m232cab] = t.value.trim(); return void m232Guardar(ej, D); }
    if (d.m232f) {
      const [i, k] = d.m232f.split('|'), ej = m232EjDef(), D = m232Reg(ej); if (!D.filas[+i]) return;
      D.filas[+i][k] = t.value.trim(); delete D.filas[+i].auto; await m232Guardar(ej, D); if (k === 'imp' || k === 'ip') render(); return;
    }
    if (d.m232 || d.m232addent) {
      const ej = m232EjDef(), D = m232Reg(ej);
      if (d.m232addent) { if (!t.value) return; D.man[t.value] ??= { obs: ' ' }; }
      else { const [id, k] = d.m232.split('|'); D.man[id] ??= {}; D.man[id][k] = k === 'otras' ? (parseNum(t.value) || 0) : t.value; }
      await m232Guardar(ej, D); return void render();
    }
    if (d.m583i) { const [k, cmp] = d.m583i.split('|'); m583Guardar((E) => { const I = E.inst[+k]; if (/^q\d$/.test(cmp)) { I.q = I.q ?? ['', '', '', '']; const v = parseNum(t.value); I.q[+cmp[1]] = v === null ? '' : v; } else I[cmp] = t.value.trim(); }); }
    else if (d.m583sel) m583Guardar((E) => { E[d.m583sel] = t.value.trim(); });
    else if (d.m583chk) m583Guardar((E) => { E[d.m583chk] = t.checked; });
  });

  const kinds = { m232: cargar232 };
  const tabs = {
    mod232: ['Modelo 232', 'Operaciones vinculadas', vista232],
    mod583: ['Modelo 583', 'Producción energía eléctrica', vista583],
  };
  return { tabs, kinds, acciones };
}
