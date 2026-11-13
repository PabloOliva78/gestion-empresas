// Bloque 4 · modelos tributarios portados de la aplicación antigua: 232 (operaciones vinculadas) y 583 (producción eléctrica).
// Los datos de cada modelo se guardan en `registros` (tipo m232 / m583, un registro por empresa y ejercicio).
export function crearModelos(c) {
  const { db, S, esc, render, empresa, puede, eur, grande, leerPdf, obl592, bancoDe = () => '', calc303, calc349, calc349Ops } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
  const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 2 });
  const parseNum = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const v = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t); return Number.isNaN(v) ? null : v; };
  const miles232 = (v) => { const n = parseNum(v); return n === null ? String(v ?? '') : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }); };
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
  // presentado: el PDF cargado en esta pestaña o el 232 de Impuestos Presentados (se guarda en el año de presentación, ej + 1)
  const m232Pres = (ej, D) => !!D.pres || !!regDe('prs', S.sel, ej + 1)?.datos?.['232|A'];
  async function m232Proponer(ej, silencio) {
    const D = m232Reg(ej), A = m232Reg(ej - 1), R = calc232(ej), O = m232Ops(ej);
    if (m232Pres(ej, D)) { if (!silencio) aviso(`El 232 de ${ej} ya está cargado como presentado: no se rehace`, true); return; }
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
    if (ed && !auto232.has(clave) && !m232Pres(ej, D)) {
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
      ${F.map((f, i) => `<tr><td class="c">${i + 1}</td>${M232_COLS.map(([k, , w]) => `<td><input class="facin${k === 'imp' ? ' num' : ''}" data-m232f="${i}|${k}" value="${esc(k === 'imp' ? miles232(f[k]) : (f[k] || ''))}" size="${w}"${dis}></td>`).join('')}<td class="no-print">${ed ? `<button class="small" data-act="m-232del" data-i="${i}">Quitar</button>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="${M232_COLS.length + 2}" class="c">Sin registros: pulsa «Rehacer desde los libros», suelta el 232 presentado o añade líneas</td></tr>`}
      ${F.length ? `<tr class="tot"><td colspan="9">Total ingresos (I) · pagos (P)</td><td class="num">I ${n(tot('I'))}<br>P ${n(tot('P'))}</td><td></td></tr>` : ''}</tbody></table></div>
      <div class="no-print" style="margin-top:6px">${ed ? '<button class="small" data-act="m-232add">+ Añadir registro</button> ' : ''}${ed ? `<button class="small" data-act="m-232prop">Rehacer desde los libros de IVA (${ej})</button> ` : ''}<button class="small primary" data-act="m-232bor">Borrador para presentar</button>
        <span class="hint">${m232Pres(ej, D) ? 'Cargado del 232 presentado.' : `Se rellena solo con las entidades del grupo que superan 250.000 €: 08 arrendamientos (R.I.ALQ), 09 intereses (R.I.INT), resto 01/06 según el 232 de ${ej - 1}; vinculación, provincia y método del año anterior. Los registros que cambies a mano se conservan al rehacer.`}</span></div>
      ${Object.keys(porE).length ? `<h4 style="margin:10px 0 4px">Resumen por entidad vinculada</h4><div class="wrap"><table class="tabla" style="width:auto"><thead><tr><th>NIF</th><th>Entidad</th><th>Ingresos (I)</th><th>Pagos (P)</th></tr></thead><tbody>${Object.entries(porE).map(([k, o]) => `<tr><td>${esc(k)}</td><td>${esc(o.nom)}</td><td class="num">${n(o.I)}</td><td class="num">${n(o.P)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h4 style="margin:10px 0 4px">(4) Reducción de rentas de activos intangibles (art. 23 LIS) · (5) Operaciones con paraísos fiscales</h4><p class="hint">Sin datos: si los hubiera, añádelos en Observaciones del cuadro de abajo.</p></section>`;
    const otrasEnt = S.empresas.filter((e) => e.id !== S.sel && e.cif && !R.filas.some((x) => x.id === nifN(e.cif)));
    // Presentado (izquierda) frente a calculado con Emitidas y Recibidas (derecha), por entidad, tipo de operación e ingreso/pago
    const TIPO_OP = { '01': 'Bienes (ventas / compras)', '06': 'Servicios', '08': 'Arrendamientos', '09': 'Intereses' };
    const OPS = m232Ops(ej), CMP = new Map(), nomDe = (nif) => (S.empresas.find((e) => nifN(e.cif) === nif) ?? {}).nombre || '';
    const gk = (nif, op, ip) => { const k = `${nif}|${op}|${ip}`; if (!CMP.has(k)) CMP.set(k, { nif, op, ip, nom: nomDe(nif), pres: 0, calc: 0, hayP: false }); return CMP.get(k); };
    F.forEach((f) => { if (!f.nif) return; const g = gk(f.nif, f.op || '01', f.ip === 'P' ? 'P' : 'I'); g.pres = r2(g.pres + (parseNum(f.imp) || 0)); g.hayP = true; g.nom = f.nom || g.nom; });
    Object.entries(OPS).forEach(([k, v]) => { const [nif, op, ip] = k.split('|'); if (Math.abs(v) < 0.005) return; const g = gk(nif, op, ip); g.calc = r2(g.calc + v); });
    const FC = [...CMP.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.op.localeCompare(b.op) || a.ip.localeCompare(b.ip)).map((x) => ({ ...x, d: r2(x.pres - x.calc) }));
    const tolC = 1, sumTipo = (op, ip, k) => r2(FCo.filter((x) => x.op === op && x.ip === ip).reduce((s, x) => s + x[k], 0));
    const obIds = new Set(R.filas.filter((q) => q.oblig).map((q) => q.id)), FCo = FC.filter((q) => obIds.has(q.nif)); // solo las entidades que superan 250.000 € (las que se declaran)
    const lado = (titulo, nota, k) => {
      const porTipo = Object.keys(TIPO_OP).flatMap((op) => ['I', 'P'].map((ip) => [op, ip])).filter(([op, ip]) => FCo.some((x) => x.op === op && x.ip === ip && Math.abs(x[k]) > 0.004));
      const totI = r2(FCo.filter((x) => x.ip === 'I').reduce((s, x) => s + x[k], 0)), totP = r2(FCo.filter((x) => x.ip === 'P').reduce((s, x) => s + x[k], 0));
      const filasT = porTipo.map(([op, ip]) => `<tr><td>${op} · ${esc(TIPO_OP[op])}</td><td>${ip === 'I' ? 'Ingresos' : 'Pagos'}</td><td class="n">${n(sumTipo(op, ip, k))}</td></tr>`).join('');
      const filasE = FCo.filter((x) => Math.abs(x[k]) > 0.004).map((x) => `<tr><td>${esc(x.nom)}</td><td>${esc(x.nif)}</td><td>${x.op} · ${esc(TIPO_OP[x.op] || '')}</td><td>${x.ip === 'I' ? 'Ingreso' : 'Pago'}</td><td class="n">${n(x[k])}</td></tr>`).join('');
      return `<div class="c232"><h4 style="margin:0 0 2px">${titulo}</h4><p class="hint" style="margin:0 0 6px">${nota}</p>
        <h5 style="margin:6px 0 4px">Resumen por tipo de operación</h5>
        <div class="wrap"><table class="tabla it-conc" style="width:100%"><thead><tr><th>Tipo de operación</th><th>Ingreso / Pago</th><th>Importe</th></tr></thead><tbody>${filasT || '<tr><td colspan="3" class="c">Sin operaciones</td></tr>'}
          <tr class="tot"><td colspan="2">Total ingresos (I) · pagos (P)</td><td class="n">I ${n(totI)}<br>P ${n(totP)}</td></tr></tbody></table></div>
        <h5 style="margin:10px 0 4px">Por entidad vinculada</h5>
        <div class="wrap"><table class="tabla it-conc" style="width:100%"><thead><tr><th>Entidad</th><th>NIF</th><th>Tipo de operación</th><th>Ingreso / Pago</th><th>Importe</th></tr></thead><tbody>${filasE || '<tr><td colspan="5" class="c">Sin operaciones</td></tr>'}</tbody></table></div></div>`;
    };
    const estado232 = (x) => (!x.hayP ? 'Calculado y no está en el presentado: añádelo al 232' : Math.abs(x.calc) < 0.005 ? 'Está en el presentado y no sale en los libros: revisa el NIF, el ejercicio o el libro' : 'Importe distinto: revisa las facturas de esta entidad');
    const comparacion = FC.length ? `<section class="block"><h3 class="bt">Modelo 232 de ${ej} · calculado con Emitidas y Recibidas</h3>
      ${lado('CALCULADO (libros de IVA)', `Lo que sale de Emitidas (ingresos) y Recibidas (pagos) de ${ej} con las sociedades del grupo; 08 arrendamientos (R.I.ALQ), 09 intereses (R.I.INT), el resto 01 bienes / 06 servicios.`, 'calc')}</section>` : '';
    return `${avisos([`Modelo 232 (declaración informativa de operaciones vinculadas): obligatorio por cada entidad vinculada con la que el conjunto de operaciones del mismo tipo supere 250.000 € en el periodo impositivo (valor de mercado). Plazo: del 1 al 30 de noviembre de ${ej + 1} para el ejercicio ${ej} (si se presenta, sale en Liquidaciones a presentar de octubre y en el Calendario Fiscal de noviembre).`,
      'Ventas y compras salen de los libros de IVA cargados (bases imponibles con NIF de una sociedad del grupo). Préstamos, garantías, servicios sin IVA, dividendos y operaciones específicas (> 100.000 €, sin umbral en paraísos fiscales) añádelos en «Otras operaciones».'])}${avisoHtml()}
      ${estructura}${comparacion}<section class="block"><h3 class="bt">Detalle desde los libros de IVA · operaciones con sociedades del grupo ${ej} · ${esc(empresa().nombre)}</h3>
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

  // ---------- Registros grandes (se piden aparte, solo al abrir la pestaña) ----------
  const BIG = new Map(); // `${tipo}|${empresa}` → {id, datos} (null mientras carga)
  function big(tipo, def) {
    const k = `${tipo}|${S.sel}`; if (BIG.has(k)) return BIG.get(k);
    BIG.set(k, null);
    db.from('registros').select('id,datos').eq('empresa_id', S.sel).eq('tipo', tipo).maybeSingle()
      .then(({ data }) => { BIG.set(k, { id: data?.id, datos: data?.datos ?? def() }); render(); });
    return null;
  }
  async function bigGuardar(tipo, datos) {
    const k = `${tipo}|${S.sel}`, cur = BIG.get(k) ?? {};
    BIG.set(k, { id: cur.id, datos }); render(); // se ve al momento en todas las pestañas; el guardado sigue después
    // los guardados van de uno en uno (si hay otro esperando, guardará lo último): dos a la vez se bloquean entre sí en la base de datos
    let q = colaBig.get(k); if (!q) { q = { p: Promise.resolve(), pend: null }; colaBig.set(k, q); }
    if (q.pend) return q.pend;
    q.pend = q.p.then(async () => { q.pend = null; await bigGuardar0(tipo, BIG.get(k)?.datos ?? datos); });
    q.p = q.pend.catch(() => {});
    return q.pend;
  }
  const colaBig = new Map();
  async function bigGuardar0(tipo, datos) {
    const k = `${tipo}|${S.sel}`, cur = BIG.get(k) ?? {};
    if (cur.id) { const { error } = await db.from('registros').update({ datos }).eq('id', cur.id); if (error) alert(error.message); }
    else { cur.id = crypto.randomUUID(); const { error } = await db.from('registros').insert({ id: cur.id, empresa_id: S.sel, tipo, ejercicio: null, datos }); if (error) alert(error.message); }
    BIG.set(k, { id: cur.id, datos });
  }
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  async function hojasExcel(file) {
    const wb = window.XLSX.read(await file.arrayBuffer(), { cellDates: true });
    return wb.SheetNames.map((name) => ({ name, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true }) }));
  }
  const fechaUtc = (v) => {
    if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    const s = String(v ?? ''); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
  };
  const fdmy = (d) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');
  const nf3 = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const k3 = (v) => (+v).toLocaleString('es-ES', { maximumFractionDigits: 3 });
  const oblIntE = (e) => ['HER', 'ESP', 'HIS'].includes(String(e?.siglas ?? '').toUpperCase()) || /herogra\s+fertiliz|herogra\s+especiales|hispalense/i.test(e?.nombre ?? ''); // Intrastat: solo Herogra, Especiales e Hispalense
  const MES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // ================= Modelo 592 · impuesto especial sobre los envases de plástico no reutilizables =================
  // Igual que la hoja Mod592 del Excel: liquidación a partir de la contabilidad de fabricantes y del libro registro de existencias AIC.
  const datos592 = () => { const r = regDe('m592', S.sel, null) ?? S.registros.find((x) => x.tipo === 'm592' && x.empresa_id === S.sel); return { cab: { tipo: 0.45 }, comp: {}, ...(r?.datos ?? {}) }; };
  async function guardar592(d) {
    const ex = S.registros.find((x) => x.tipo === 'm592' && x.empresa_id === S.sel);
    if (ex) { ex.datos = d; const { error } = await db.from('registros').update({ datos: d }).eq('id', ex.id); if (error) alert(error.message); }
    else { const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'm592', ejercicio: null, datos: d }; S.registros.push(fila); const { error } = await db.from('registros').insert(fila); if (error) alert(error.message); }
  }
  const rango592 = (ej, per) => (/^[1-4]T$/.test(per) ? [Date.UTC(ej, (+per[0] - 1) * 3, 1), Date.UTC(ej, +per[0] * 3, 1)]
    : /^\d\d$/.test(per) ? [Date.UTC(ej, +per - 1, 1), Date.UTC(ej, +per, 1)] : [Date.UTC(ej, 0, 1), Date.UTC(ej + 1, 0, 1)]);
  function calc592De(d, mov, ej, per) {
    const [t0, t1] = rango592(+ej, per), tipo = +(d.cab.tipo === undefined ? 0.45 : d.cab.tipo) || 0;
    const t = (r) => fechaUtc(r.fecha)?.getTime(), en = (r) => t(r) >= t0 && t(r) < t1, c = (r) => String(r.concepto ?? '').trim().charAt(0), rg = (r) => String(r.regimen ?? '').trim().charAt(0).toLowerCase();
    const fab = mov.fab.filter(en), aic = mov.aic.filter(en), s = (l, k) => Math.round(l.reduce((a, r) => a + (+r[k] || 0), 0) * 1000) / 1000;
    const devF = fab.filter((r) => c(r) === '4' && rg(r) === 'a'), devA = aic.filter((r) => c(r) === '1' && rg(r) === 'a');
    const kg = Math.round((s(devF, 'kg') + s(devA, 'kg')) * 1000) / 1000, base = Math.round((s(devF, 'kgnr') + s(devA, 'kgnr')) * 1000) / 1000;
    const dedKg = Math.round((s(fab.filter((r) => c(r) === '3'), 'kgnr') + s(aic.filter((r) => ['2', '3', '4'].includes(c(r))), 'kgnr')) * 1000) / 1000;
    // como el Excel: cuota del periodo = (base acumulada hasta fin de periodo − base acumulada anterior) × tipo, redondeando cada acumulado
    const antes = (r) => t(r) < t0, hasta = (r) => t(r) < t1;
    const suma = (filtro, k) => Math.round((mov.fab.filter((r) => filtro(r) && c(r) === '4' && rg(r) === 'a').reduce((a, r) => a + (+r[k] || 0), 0)
      + mov.aic.filter((r) => filtro(r) && c(r) === '1' && rg(r) === 'a').reduce((a, r) => a + (+r[k] || 0), 0)) * 1000) / 1000;
    const kgAc = suma(hasta, 'kg'), baseAc = suma(hasta, 'kgnr'), cuotaAc = r2(baseAc * tipo), dedAc = r2(r2(suma(antes, 'kgnr') * tipo) + dedKg * tipo);
    const cuota = r2(r2(suma(hasta, 'kgnr') * tipo) - r2(suma(antes, 'kgnr') * tipo)), ded = r2(dedKg * tipo), comp = +((d.comp ?? {})[`${ej}-${per}`]) || 0, res = r2(cuotaAc - dedAc - comp);
    return { ej, per, tipo, kg, base, cuota, dedKg, ded, comp, res, kgAc, baseAc, cuotaAc, dedAc, fab, aic, nFab: mov.fab.length, nAic: mov.aic.length };
  }
  // importe a ingresar del 592 del periodo (casilla 8), con los registros ya cargados en su pestaña; null si no aplica o aún no hay datos cargados
  function importe592(ej, per) {
    if (!per || !obl592(empresa())) return null;
    const cur = big('m592-mov', () => ({ fab: [], aic: [] })); if (!cur) return null;
    return calc592De(datos592(), { fab: cur.datos.fab ?? [], aic: cur.datos.aic ?? [] }, String(ej), per).res;
  }
  // importar los registros desde un Excel (como las tablas D y E de la hoja Mod592, o un listado con esas columnas)
  async function cargar592(files) {
    const cur = big('m592-mov', () => ({ fab: [], aic: [] })); if (!cur) return;
    const mov = cur.datos; mov.fab ??= []; mov.aic ??= []; let nF = 0, nA = 0;
    for (const file of files) {
      let sheets; try { sheets = await hojasExcel(file); } catch (e) { aviso(`${file.name}: ${e.message}`, true); continue; }
      const col = (H, rx) => H.findIndex((h) => rx.test(h));
      sheets.forEach((sh) => { for (let i = 0; i < sh.rows.length; i++) {
        const H = (sh.rows[i] ?? []).map((v) => norm(v));
        if (!(H.some((h) => /^kilogramos/.test(h)) && H.some((h) => /^concepto/.test(h)) && H.some((h) => /^fecha/.test(h)))) continue;
        const esFab = H.some((h) => /^descripcion producto/.test(h));
        const I = { as: col(H, /^n asiento/), con: col(H, /^concepto/), cla: col(H, /^clave producto/), des: col(H, /^descripcion producto/), fe: col(H, /^fecha/), ju: col(H, /^justificante/),
          kg: col(H, /^kilogramos/), nr: col(H, /^kg no reciclados/), re: col(H, /^regimen fiscal/), no: col(H, /^(destinatario|proveedor)/), nif: col(H, /^nif/) };
        for (let j = i + 1; j < sh.rows.length; j++) {
          const r = sh.rows[j] ?? [], first = String(r[I.as] ?? r[I.con] ?? '').trim();
          if (/^totales?$/i.test(first)) break;
          const num = (v) => (typeof v === 'number' ? v : parseNum(v));
          if (!String(r[I.con] ?? '').trim() || num(r[I.kg]) === null) continue;
          const fecha = fechaUtc(r[I.fe]);
          const fila = { asiento: String(r[I.as] ?? ''), concepto: String(r[I.con] ?? ''), clave: String(r[I.cla] ?? ''), desc: I.des >= 0 ? String(r[I.des] ?? '') : '', fecha: fdmy(fecha), justificante: String(r[I.ju] ?? ''),
            kg: num(r[I.kg]) || 0, kgnr: num(r[I.nr]) ?? num(r[I.kg]) ?? 0, regimen: String(r[I.re] ?? ''), nombre: String(r[I.no] ?? ''), nif: String(r[I.nif] ?? ''), arch: file.name };
          const lista = esFab ? mov.fab : mov.aic, k = [fila.asiento, fila.fecha, fila.justificante, fila.kg].join('|');
          if (lista.some((x) => [x.asiento, x.fecha, x.justificante, x.kg].join('|') === k)) continue; // sin duplicar
          lista.push(fila); if (esFab) nF++; else nA++;
        }
        i++;
      } });
      await bigGuardar('m592-mov', mov);
      aviso(`${file.name}: ${nA} movimientos del libro registro AIC y ${nF} de la contabilidad de fabricantes añadidos (sin duplicar)`);
    }
  }
  function vista592() {
    if (!S.sel) return sinEmpresa;
    if (!obl592(empresa())) return avisos(['El modelo 592 solo está activado para Herogra Fertilizantes, Herogra Especiales y Lysur']);
    const cur = big('m592-mov', () => ({ fab: [], aic: [] })); if (!cur) return cargandoTxt;
    const mov = { fab: cur.datos.fab ?? [], aic: cur.datos.aic ?? [] }, d = datos592(), ej = String(S.ejercicio), per = S.periodo ?? '', L = calc592De(d, mov, ej, per), cab = d.cab ?? {}, e = empresa(), ed = puede(), dis = ed ? '' : ' disabled';
    const inp = (k, v, ph = '', w = 28) => `<input class="presin" data-m592cab="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" style="width:${w}ch;text-align:left"${dis}>`;
    const iban592 = empresa()?.datos?.cuenta592 ?? cab.iban ?? '';
    const inpb = (k, v, ph = '') => `<input data-m592cab="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}"${dis}>`;
    const tabla = (lst, fab) => `<div class="wrap" style="overflow-x:auto"><table class="tabla"><thead><tr><th>Nº asiento</th><th>Concepto</th><th>Clave producto</th>${fab ? '<th>Descripción</th>' : ''}<th>Fecha</th><th>Justificante</th><th>Kilogramos</th><th>Kg no reciclados</th><th>Régimen fiscal</th><th>${fab ? 'Destinatario' : 'Proveedor'}</th><th>NIF</th><th></th></tr></thead><tbody>
      ${lst.map((r) => `<tr><td>${esc(r.asiento)}</td><td>${esc(r.concepto)}</td><td>${esc(r.clave)}</td>${fab ? `<td>${esc(r.desc)}</td>` : ''}<td class="c">${esc(r.fecha)}</td><td>${esc(r.justificante)}</td><td class="num">${nf3(r.kg)}</td><td class="num">${nf3(r.kgnr)}</td><td>${esc(r.regimen)}</td><td>${esc(r.nombre)}</td><td>${esc(r.nif)}</td><td>${ed ? `<button class="small" data-act="m-592del" data-l="${fab ? 'fab' : 'aic'}" data-k="${esc([r.asiento, r.fecha, r.justificante, r.kg].join('|'))}">✕</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="${fab ? 12 : 11}" class="c">Sin movimientos en el periodo</td></tr>`}
      ${lst.length ? `<tr class="tot"><td colspan="${fab ? 6 : 5}">TOTALES</td><td class="num">${nf3(lst.reduce((s, r) => s + (+r.kg || 0), 0))}</td><td class="num">${nf3(lst.reduce((s, r) => s + (+r.kgnr || 0), 0))}</td><td colspan="4"></td></tr>` : ''}</tbody></table></div>`;
    return `${ed ? `<div class="dropzone" data-kind="m592" tabindex="0" role="button"><b>Suelta aquí el Excel con el libro registro de existencias AIC y/o la contabilidad de fabricantes</b> (como las tablas D y E de la hoja Mod592) · cargados: ${L.nAic} movimientos AIC y ${L.nFab} de fabricantes
      <input type="file" data-dzkind="m592" accept=".xlsx,.xls,.xlsm" multiple hidden></div>` : ''}${avisoHtml()}
      ${avisos(['Liquidación como la hoja Mod592 del Excel: base = kg no reciclados de las adquisiciones intracomunitarias sujetas (concepto 1, régimen a) y de las entregas de fabricante sujetas (concepto 4, régimen a) del periodo × tipo impositivo; deducción = kg no reciclados de devoluciones, envíos fuera, inadecuación o destrucción (art. 80) × tipo impositivo. Plazo: hasta el día 20 del mes siguiente (calendario AEAT)'])}
      <div class="f303">
      <div class="f303-top"><div class="ag"><b>Oficina Gestora</b><small>${inp('oficina', cab.oficina, 'D18200', 8)} ${inp('ofnom', cab.ofnom, 'Granada', 12)}</small></div>
        <div class="tt">Impuesto especial sobre los envases de plástico no reutilizables. Declaración - Liquidación<br><span class="nota">${L.res > 0.005 ? 'Ingreso con Domiciliación del Pago' : L.res < -0.005 ? 'A devolver / compensar' : 'Sin actividad o resultado cero'}</span></div>
        <div class="mod"><small>Modelo</small><b>592</b></div></div>
      <div class="f303-sec">Identificación</div>
      <div class="f303-id"><span class="idbox"><b>NIF</b><span>${esc(e.cif)}</span></span><span class="idbox grow"><b>Apellidos y nombre o razón social</b><span>${esc(e.nombre)}</span></span></div>
      <div class="f303-id"><span class="idbox grow"><b>Domicilio fiscal</b>${inpb('domfis', cab.domfis, 'PG JUNCARIL CL LOJA')}</span><span class="idbox grow"><b>Localidad y provincia</b>${inpb('locfis', cab.locfis, '18220 ALBOLOTE (GRANADA)')}</span></div>
      <div class="f303-id"><span class="idbox grow"><b>Domicilio, localidad y provincia del establecimiento</b>${inpb('domest', cab.domest, 'Establecimiento')}</span><span class="idbox"><b>CIP</b>${inpb('cip', cab.cip, 'ES00018AP028G')}</span></div>
      <div class="f303-sec">Periodo de liquidación</div>
      <div class="f303-id"><span class="idbox"><b>Ejercicio</b><span>${esc(ej)}</span></span><span class="idbox"><b>Período</b><span>${esc(/^\d\d$/.test(per) ? `${per} ${MES_L[+per - 1].charAt(0) + MES_L[+per - 1].slice(1).toLowerCase()}` : per || 'Anual')}</span></span>
        <span class="idbox grow"><b>Número de Referencia</b>${inpb(`nrc_${ej}-${per}`, cab[`nrc_${ej}-${per}`], 'NRC del pago')}</span></div>
      <div class="f303-id"><span class="idbox"><b>Importe ingreso</b><span>${nf3(Math.max(0, L.res))}</span></span><span class="idbox grow"><b>IBAN${bancoDe(iban592) ? ' · ' + esc(bancoDe(iban592)) : ''}</b><input data-ibanmod="592" class="iban" value="${esc(iban592)}" placeholder="ES00 0000 0000 00 0000000000"${dis}></span></div>
      <div class="f303-sec">Datos de Contacto</div>
      <div class="f303-id"><span class="idbox grow"><b>Persona de contacto</b>${inpb('contacto', cab.contacto, '')}</span><span class="idbox"><b>Teléfono</b>${inpb('tel', cab.tel, '')}</span><span class="idbox"><b>Fax</b>${inpb('fax', cab.fax, '')}</span><span class="idbox grow"><b>E-mail</b>${inpb('email', cab.email, '')}</span></div>
      <div class="f303-sec">Liquidación</div>
      <div class="f303-id"><span class="idbox grow"><b>Tipo de obligado</b><select data-m592cab="obligado"${dis} style="flex:1;border:0;background:transparent;font:inherit;padding:.4rem .9rem">${['Adquirente intracomunitario', 'Fabricante', 'Fabricante y adquirente intracomunitario', 'Importador'].map((o) => `<option${(cab.obligado || 'Adquirente intracomunitario') === o ? ' selected' : ''}>${o}</option>`).join('')}</select></span>
        <span class="idbox"><b>Tipo impositivo (€/kg)</b>${inpb('tipo', cab.tipo ?? 0.45, '0,45')}</span></div>
      <div class="wrap" style="padding:0 1rem"><table class="f592-liq"><thead><tr><th></th><th>Epígrafe</th><th>Cantidad (2)</th><th>Base Imponible (3)</th><th>Tipo Impositivo (4)</th><th>Cuota íntegra (5)</th><th>Deducción (6)</th><th>Compensación (7)</th><th>Cuota íntegra Total (8)</th></tr></thead>
        <tbody><tr><td>1</td><td>P0 Plásticos</td><td class="num">${nf3(L.kgAc)}</td><td class="num">${nf3(L.baseAc)}</td><td class="num">${Number(L.tipo).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td><td class="num">${eur(L.cuotaAc)}</td><td class="num">${eur(L.dedAc)}</td>
          <td class="num"><span class="bx man"><input data-m592comp="${ej}-${per}" value="${L.comp ? fmtIn(L.comp) : ''}" placeholder="0,00"${dis}></span></td><td class="num"><b>${eur(L.res)}</b></td></tr></tbody></table></div>
      <div class="f-row l1"><span class="lb"><b>Cuota íntegra Total a Ingresar</b></span><span class="bx final"><b>8</b><span class="v">${nf3(L.res)}</span></span></div>
      <p class="hint" style="padding:0 1rem">Como el impreso de la AEAT: cantidad y base acumuladas hasta el fin del periodo; la deducción incluye lo ya liquidado en periodos anteriores (${eur(r2(L.dedAc - L.ded))}) y las deducciones del art. 80 del periodo (${eur(L.ded)}, ${nf3(L.dedKg)} kg).</p></div>
      <section class="block"><h3 class="bt">E. Libro registro de existencias – adquirentes intracomunitarios (${L.aic.length} del periodo)</h3>${tabla(L.aic, false)}</section>
      <section class="block"><h3 class="bt">D. Contabilidad de fabricantes (${L.fab.length} del periodo)</h3>${tabla(L.fab, true)}</section>`;
  }

  // ================= Modelo A22 · solicitudes de devolución del impuesto especial sobre envases de plástico =================
  const A22_CAMPOS = [['per', 'Periodo (trimestre)', 8], ['fpres', 'Fecha de presentación', 11], ['motivo', 'Motivo (exportación, envío UE, no reutilizable…)', 26], ['kg', 'Kg de plástico no reciclado', 10],
    ['imp', 'Importe solicitado (€)', 11], ['estado', 'Estado', 12], ['fdev', 'Fecha devolución', 11], ['dev', 'Importe devuelto (€)', 11], ['obs', 'Observaciones', 24]];
  const A22_CFG0 = { cae: 'ES00019FP001Q', a2: '2', a4: '1', a9: '19', v2: 'D', v5: '3', v10: 'CLIENTE', tipo: 0.45, nifs: { 'PLASTICOS VANGUARDIA': 'A28118230' }, kg: { DVZ498: 0.104, MAB559: 0.059 }, desde: '', hasta: '' };
  const a22Reg = () => S.registros.find((x) => x.tipo === 'a22' && x.empresa_id === S.sel);
  const a22Datos = () => { const r = a22Reg(); return { filas: [], cfg: {}, ...(r?.datos ?? {}) }; };
  async function a22Guardar(d) {
    const ex = a22Reg();
    if (ex) { ex.datos = d; const { error } = await db.from('registros').update({ datos: d }).eq('id', ex.id); if (error) alert(error.message); }
    else { const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'a22', ejercicio: null, datos: d }; S.registros.push(fila); const { error } = await db.from('registros').insert(fila); if (error) alert(error.message); }
  }
  const a22Cfg = () => ({ ...A22_CFG0, ...a22Datos().cfg });
  const a22Src = () => { const cur = big('a22src', () => ({ compras: [], ventas: [], archivos: [] })); return cur ? { compras: [], ventas: [], archivos: [], ...cur.datos } : null; };
  const a22N = (v) => (typeof v === 'number' ? v : (parseNum(v) || 0));
  async function a22Cargar(files) {
    const cur = big('a22src', () => ({ compras: [], ventas: [], archivos: [] })); if (!cur) return;
    const Sx = { compras: [], ventas: [], archivos: [], ...cur.datos }; let nc = 0, nv = 0;
    for (const f of files) {
      let sh = []; try { sh = await hojasExcel(f); } catch (e) { aviso(`${f.name}: ${e.message}`, true); continue; }
      const porAnio = sh.some((s) => /^(compras|ventas)\b/i.test(s.name ?? '') && !/consolid/i.test(s.name ?? ''));
      sh.forEach((s) => {
        const nm = String(s.name ?? ''), esC = /compra/i.test(nm), esV = /venta/i.test(nm); if (!esC && !esV) return; if (porAnio && /consolid/i.test(nm)) return;
        const hr = s.rows.findIndex((r) => r && r.some((v) => /^fecha$/i.test(String(v ?? '').trim())) && r.some((v) => /^factura$/i.test(String(v ?? '').trim()))); if (hr < 0) return;
        const H = s.rows[hr].map((v) => String(v ?? '').trim().toLowerCase()), ix = (rx) => H.findIndex((h) => rx.test(h));
        const iF = ix(/^fecha$/), iFa = ix(/^factura$/), iP = ix(/^producto$/), iQ = ix(/^cantidad$/);
        if (esC) {
          const iPr = ix(/^proveedor/), iL = ix(/^lote$/), iI = ix(/^importe/);
          s.rows.slice(hr + 1).forEach((r) => { if (!r || !r[iFa] || !r[iF]) return; const fa = String(r[iFa]).trim(); if (Sx.compras.some((x) => x.fa === fa)) return; const d = fechaUtc(r[iF]); if (!d) return;
            Sx.compras.push({ fa, fecha: d.toISOString().slice(0, 10), prov: String(r[iPr] ?? '').trim(), prod: String(r[iP] ?? '').trim(), q: a22N(r[iQ]), lote: String(r[iL] ?? '').trim(), imp: a22N(r[iI]) }); nc++; });
        } else {
          const iCl = ix(/^cliente/), iKg = ix(/^kg/), iPa = ix(/^pa[ií]s/), iI = ix(/^importe/);
          s.rows.slice(hr + 1).forEach((r, j) => { if (!r || !r[iFa] || !r[iF]) return; const d = fechaUtc(r[iF]); if (!d) return;
            const k = `${String(r[iFa]).trim()}|${String(r[iP] ?? '').trim()}|${a22N(r[iQ])}|${nm}|${j}`; if (Sx.ventas.some((x) => x.k === k)) return;
            Sx.ventas.push({ k, fa: String(r[iFa]).trim(), fecha: d.toISOString().slice(0, 10), cli: String(r[iCl] ?? '').trim(), prod: String(r[iP] ?? '').trim(), q: a22N(r[iQ]), kg: a22N(r[iKg]), pais: String(r[iPa] ?? '').trim(), imp: a22N(r[iI]) }); nv++; });
        }
      });
      Sx.archivos = (Sx.archivos ?? []).filter((a) => a !== f.name).concat([f.name]);
    }
    await bigGuardar('a22src', Sx);
    aviso(`A22: ${nc} compras y ${nv} líneas de venta leídas`);
  }
  function a22Calc(Sx) {
    const C = a22Cfg(), fac = (prod) => { const k = Object.keys(C.kg).find((x) => String(prod).toUpperCase().includes(x.toUpperCase())); return k ? +C.kg[k] : (/50\s*%\s*R/i.test(prod) ? 0.059 : 0.104); };
    const nif = (prov) => { const k = Object.keys(C.nifs).find((x) => String(prov).toUpperCase().includes(x.toUpperCase())); return k ? C.nifs[k] : ''; };
    const lots = Sx.compras.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.lote).localeCompare(String(b.lote))).map((c) => ({ ...c, rest: c.q, asig: 0, asigF: 0, n: 0, fac: new Set(), paises: new Set(), ini: null, fin: null }));
    const esFuera = (v) => v.pais && !/^espa[ñn]a$/i.test(v.pais);
    // todas las ventas por fecha consumen los lotes por orden de compra hasta completarlos; un lote solo sirve a ventas posteriores a su fecha de compra
    const lin = new Map(); let sinLote = 0;
    Sx.ventas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fa.localeCompare(b.fa)).forEach((v) => {
      let q = v.q;
      for (const L of lots) {
        if (q <= 0) break; if (L.rest <= 0) continue; if (L.fecha >= v.fecha) break;
        const t = Math.min(q, L.rest); L.rest -= t; q -= t; L.asig += t; L.fac.add(v.fa); L.paises.add(v.pais); L.ini = L.ini || v.fecha; L.fin = v.fecha;
        if (esFuera(v)) { L.asigF += t; const k = `${L.fa}|${v.fa}`; if (!lin.has(k)) lin.set(k, { L, v, q: 0 }); lin.get(k).q += t; }
      }
      if (q > 0) sinLote += q;
    });
    lots.forEach((L) => { L.n = L.fac.size; });
    const ok = (d) => (!C.desde || d >= C.desde) && (!C.hasta || d <= C.hasta);
    const ventas = [...lin.values()].filter((x) => ok(x.v.fecha)).map((x) => { const kg = +(x.q * fac(x.L.prod)).toFixed(3);
      return { comp: x.L.fa, venta: x.v.fa, fecha: x.v.fecha, cod: String(+(String(x.v.cli).match(/^\s*(\d+)/) || [0, ''])[1] || ''), cli: String(x.v.cli).replace(/^\s*\d+\s*-\s*/, ''), prod: x.L.prod, q: x.q, kg, imp: r2(kg * C.tipo), pais: x.v.pais }; });
    const usadas = new Set(ventas.map((v) => v.comp));
    const compras = lots.filter((L) => usadas.has(L.fa)).map((L) => { const kg = +(L.q * fac(L.prod)).toFixed(3); return { fa: L.fa, fecha: L.fecha, nif: nif(L.prov), prov: L.prov, prod: L.prod, q: L.q, kg, cuota: r2(kg * C.tipo) }; });
    const trim = {}; ventas.forEach((v) => { const t = `${v.fecha.slice(0, 4)}-${Math.ceil(+v.fecha.slice(5, 7) / 3)}T`; const o = (trim[t] ??= { kg: 0, imp: 0, q: 0, n: 0 }); o.kg += v.kg; o.q += v.q; o.imp += v.imp; o.n++; });
    return { S: Sx, C, lots, ventas, compras, trim, sinLote };
  }
  function a22Csv(tipo) {
    const Sx = a22Src(); if (!Sx) return;
    const R = a22Calc(Sx), C = R.C, d = (s) => fdmy(new Date(`${s}T00:00:00Z`)), py = (v) => { const t = String(v); return /[.e]/.test(t) ? t : `${t}.0`; }, n3 = (v) => py(+v.toFixed(3)), n2 = (v) => py(+v.toFixed(2));
    const q = (x) => { const t = String(x ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const filas = tipo === 'adq' ? R.compras.slice().sort((a, b) => a.fa.localeCompare(b.fa)).map((c) => [c.fa, d(c.fecha), C.a2, '', C.a4, c.nif, c.prov, C.cae, C.a9, c.prod, c.q, n3(c.kg), n2(c.cuota)])
      : R.ventas.slice().sort((a, b) => a.venta.localeCompare(b.venta) || a.comp.localeCompare(b.comp)).map((v) => [v.comp, C.v2, v.venta, d(v.fecha), C.v5, v.cod, v.cli, v.prod, v.q, C.v10, n3(v.kg), n2(v.imp)]);
    const b = new TextEncoder().encode(`﻿${filas.map((r) => r.map(q).join(',')).join('\r\n')}\r\n`); // UTF-8 con BOM, separado por comas
    const rng = (C.desde || '').slice(0, 4) + (C.hasta && C.hasta.slice(0, 4) !== (C.desde || '').slice(0, 4) ? `-${C.hasta.slice(0, 4)}` : '');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b], { type: 'text/csv' }));
    a.download = `${tipo === 'adq' ? 'ADQUISICION' : 'VENTA'}_A22_${empresa().siglas || empresa().cif}${rng ? `_${rng}` : ''}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  }
  function a22Bloque(Sx) {
    const R = a22Calc(Sx), C = R.C, n = (v) => eur(v), ed = puede(), dis = ed ? '' : ' disabled';
    const tq = Object.entries(R.trim).sort(), tv = R.ventas.reduce((a, v) => a + v.imp, 0), tk = R.ventas.reduce((a, v) => a + v.kg, 0);
    const inp = (k, v, w) => `<input class="facin" data-a22cfg="${k}" value="${esc(v ?? '')}" size="${w || 10}"${dis}>`;
    return `<section class="block"><h3 class="bt">A22 desde el Excel del ERP · plástico de compras nacionales vendido a clientes fuera de España</h3>
      ${ed ? `<div class="dropzone" data-kind="a22" tabindex="0" role="button"><b>Suelta aquí el Excel del ERP</b> (hojas «Compras 1L …» y «Ventas 1L …» de cada año) o pulsa para elegirlo. Se juntan las compras y ventas de todos los años y se reparten por lote.
        <input type="file" data-dzkind="a22" accept=".xlsx,.xls,.xlsm" multiple hidden></div>` : ''}
      <p class="hint">Cargado: ${Sx.compras.length} compras (lotes) y ${Sx.ventas.length} líneas de venta${(Sx.archivos ?? []).length ? ` de ${esc(Sx.archivos.join(', '))}` : ''}. ${Sx.compras.length && ed ? '<button class="small no-print" data-act="m-a22borrar">Quitar lo cargado</button>' : ''}</p>
      ${Sx.compras.length ? `<p class="hint">Criterio: las facturas a clientes, por fecha, consumen los lotes de compra nacional en orden hasta completar cada lote y pasan al siguiente (un lote solo para ventas posteriores a su compra). Al A22 van las líneas de clientes fuera de España (UE y exportación). Kg de plástico = unidades × kg/ud del envase comprado; importe = kg × ${String(C.tipo).replace('.', ',')} €/kg.${R.sinLote ? ` Ventas sin lote asignado: ${R.sinLote.toLocaleString('es-ES')} unidades.` : ''}</p>
      <div class="no-print" style="margin:6px 0">Periodo de la solicitud: desde <input type="date" data-a22cfg="desde" value="${esc(C.desde)}"${dis}> hasta <input type="date" data-a22cfg="hasta" value="${esc(C.hasta)}"${dis}> · <button class="small primary" data-act="m-a22csv" data-t="adq">Descargar ADQUISICION .csv (${R.compras.length})</button> <button class="small primary" data-act="m-a22csv" data-t="venta">Descargar VENTA .csv (${R.ventas.length})</button> ${ed ? '<button class="small" data-act="m-a22pasar">Pasar a solicitudes por trimestre</button>' : ''}</div>
      <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap">
       <div><h4 style="margin:4px 0">Por trimestre de venta</h4><div class="wrap"><table class="tabla" style="width:auto"><thead><tr><th>Trimestre</th><th>Líneas</th><th>Unidades</th><th>Kg plástico</th><th>A devolver</th></tr></thead><tbody>${tq.map(([t, o]) => `<tr><td>${t}</td><td class="num">${o.n}</td><td class="num">${k3(o.q)}</td><td class="num">${k3(o.kg)}</td><td class="num">${n(o.imp)}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td class="num">${R.ventas.length}</td><td class="num">${k3(R.ventas.reduce((a, v) => a + v.q, 0))}</td><td class="num">${k3(tk)}</td><td class="num">${n(tv)}</td></tr></tbody></table></div></div>
       <div><h4 style="margin:4px 0">Resumen por lote</h4><div class="wrap" style="max-height:420px;overflow:auto"><table class="tabla" style="width:auto"><thead><tr><th>Lote</th><th>Factura compra</th><th>Fecha</th><th>Producto</th><th>Comprado</th><th>Asignado a ventas</th><th>De ello fuera de España</th><th>Resto</th><th>Fact. venta</th><th>Países</th><th>Primera</th><th>Última</th></tr></thead><tbody>${R.lots.map((L) => `<tr><td>${esc(L.lote)}</td><td>${esc(L.fa)}</td><td>${fdmy(new Date(`${L.fecha}T00:00:00Z`))}</td><td>${esc(L.prod)}</td><td class="num">${k3(L.q)}</td><td class="num">${k3(L.asig)}</td><td class="num">${k3(L.asigF)}</td><td class="num">${k3(L.rest)}</td><td class="num">${L.n}</td><td>${esc([...L.paises].join(', '))}</td><td>${L.ini ? fdmy(new Date(`${L.ini}T00:00:00Z`)) : ''}</td><td>${L.fin ? fdmy(new Date(`${L.fin}T00:00:00Z`)) : ''}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
      <details class="no-print" style="margin-top:8px"><summary>Datos fijos de los ficheros (CAE, códigos, NIF proveedores, kg/ud)</summary><p>CAE / nº registro ${inp('cae', C.cae, 16)} · adquisición campos 3, 5 y 9: ${inp('a2', C.a2, 3)} ${inp('a4', C.a4, 3)} ${inp('a9', C.a9, 3)} · venta campos 2, 5 y 10: ${inp('v2', C.v2, 3)} ${inp('v5', C.v5, 3)} ${inp('v10', C.v10, 9)} · tipo €/kg ${inp('tipo', C.tipo, 5)}</p>
        <p>NIF de proveedores (nombre=NIF; …): ${inp('nifs', Object.entries(C.nifs).map(([a, b]) => `${a}=${b}`).join('; '), 50)}</p><p>Kg de plástico no reciclado por unidad (código=kg; …): ${inp('kg', Object.entries(C.kg).map(([a, b]) => `${a}=${b}`).join('; '), 50)}</p></details>` : ''}
    </section>`;
  }
  function vistaA22() {
    if (!S.sel) return sinEmpresa;
    const Sx = a22Src(); if (!Sx) return cargandoTxt;
    const D = a22Datos().filas, ej = String(S.ejercicio), ed = puede(), dis = ed ? '' : ' disabled';
    const L = D.map((r, i) => ({ r, i })).filter((x) => !x.r.per || String(x.r.per).includes(ej)), s = (k) => r2(L.reduce((a, x) => a + (parseNum(x.r[k]) || 0), 0));
    return `${avisos(['Modelo A22: solicitud de devolución del Impuesto especial sobre los envases de plástico no reutilizables (envases enviados fuera del territorio, exportados, destrucción, etc.). Se presenta por periodos trimestrales en los que se haya producido el hecho que da derecho a la devolución. Relacionado con el modelo 592.'])}${avisoHtml()}
      <section class="block"><h3 class="bt">Modelo A22 · Devoluciones IEEPNR · ${esc(empresa().nombre)} · ${ej}</h3>
      <div class="wrap" style="overflow-x:auto"><table class="tabla" style="width:auto"><thead><tr>${A22_CAMPOS.map((c) => `<th>${c[1]}</th>`).join('')}<th class="no-print"></th></tr></thead><tbody>
      ${L.map(({ r, i }) => `<tr>${A22_CAMPOS.map(([k, , w]) => `<td><input class="facin" data-a22="${i}|${k}" value="${esc(r[k] || '')}" size="${w}"${/^f/.test(k) ? ' placeholder="dd/mm/aaaa"' : ''}${dis}></td>`).join('')}<td class="no-print">${ed ? `<button class="small" data-act="m-a22del" data-i="${i}">Quitar</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="${A22_CAMPOS.length + 1}" class="c">Sin solicitudes en ${ej}</td></tr>`}
      ${L.length ? `<tr class="tot"><td colspan="3">Total ${ej}</td><td class="num">${fmtIn(s('kg'))}</td><td class="num">${eur(s('imp'))}</td><td></td><td></td><td class="num">${eur(s('dev'))}</td><td>Pendiente: ${eur(r2(s('imp') - s('dev')))}</td><td></td></tr>` : ''}
      </tbody></table></div>${ed ? '<button class="small no-print" data-act="m-a22add" style="margin-top:6px">+ Añadir solicitud</button>' : ''}</section>${a22Bloque(Sx)}`;
  }

  // ================= Intrastat · líneas de Dynamics y exportación .txt (formato AEAT) =================
  // La conciliación con el 349 está en el bloque de conciliaciones; aquí van las líneas, los avisos y los ficheros.
  const INTRA_COLS = ['Fecha', 'Dirección', 'País/región', 'Provincia de origen o destino', 'Código de transacción', 'Transporte', 'Código Intrastat de la mercancía', 'Peso', 'Importe de la factura', 'Importe estadístico', 'NIF', 'Código de artículo', 'Categoría', 'Factura'];
  const INTRA_ISO3 = { AUT: 'AT', BEL: 'BE', BGR: 'BG', CYP: 'CY', CZE: 'CZ', DEU: 'DE', DNK: 'DK', EST: 'EE', ESP: 'ES', FIN: 'FI', FRA: 'FR', GRC: 'GR', HRV: 'HR', HUN: 'HU', IRL: 'IE', ITA: 'IT', LTU: 'LT', LUX: 'LU', LVA: 'LV', MLT: 'MT', NLD: 'NL', POL: 'PL', PRT: 'PT', ROU: 'RO', SWE: 'SE', SVN: 'SI', SVK: 'SK', XI: 'XI' };
  const INTRA_CFG0 = { tol: 1, incoterm: 'DDP', regimen: '1', ncDef: '31052090', txtServ: 'SERVICIOS', nifIntro: 'Sí' };
  const MES_MAY = MES_L.map((m) => m.toUpperCase());
  const nf2 = (v) => Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const guion = (v) => (Math.abs(v) < 0.005 ? '-' : eur(v));
  let intraMes = 0, intraF = {}, intraFich = [];
  const intraCur = () => big('intra', () => ({ rows: [], serv: [], cfg: {}, exp: {} }));
  const datosIntra = () => {
    const cur = intraCur(); if (!cur) return null; const d = cur.datos;
    return { rows: d.rows ?? [], serv: d.serv ?? [], cfg: { ...INTRA_CFG0, ...(d.cfg ?? {}) }, exp: { per: String(new Date().getMonth() + 1).padStart(2, '0'), flujo: 'ambos', ...(d.exp ?? {}) } };
  };
  const guardarIntra = (D) => bigGuardar('intra', D);
  const intraTx = (x) => String(x ?? '').trim().replace(/\s+/g, '').toUpperCase();
  const intraNifN = (x) => String(x ?? '').toUpperCase().replace(/[\s.-]/g, '');
  const intraNum = (x) => { if (x === null || x === undefined || x === '') return null; if (typeof x === 'number') return x; const n = parseNum(String(x)); return n === null || Number.isNaN(n) ? null : n; };
  const kf = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '');
  const COD_AIB = ['S.UE.NR', 'S.UE.RD', 'S.UE.SR'];
  // cálculo de las columnas grises (Año → Importe conciliación), igual que TablaIntrastat
  function calcIntra(D, rep, sop) {
    const C = D.cfg, entregas = rep.filter((l) => l.codigo === 'R.UE'), adq = sop.filter((l) => COD_AIB.includes(l.codigo));
    const nifRUE = new Set(entregas.map((l) => intraNifN(l.nif))), nifSUE = new Set(adq.map((l) => intraNifN(l.nif)));
    const facRUE = new Set(entregas.map((l) => kf(l.factura)).filter(Boolean)), facSUE = new Set(adq.map((l) => kf(l.factura)).filter(Boolean));
    return D.rows.map((r) => {
      const f = fechaUtc(r[0]), o = { r, fecha: f };
      o.anio = f ? f.getUTCFullYear() : ''; o.mes = f ? f.getUTCMonth() + 1 : '';
      const dir = String(r[1] ?? '').trim().toLowerCase(); o.flujo = /^distribuci|^expedici|^salida/.test(dir) ? 'Expedición' : /^llegada|^introducci|^entrada/.test(dir) ? 'Introducción' : '';
      const p = String(r[2] ?? '').trim().toUpperCase(); o.em = p === '' ? '' : p.length === 2 ? p : (INTRA_ISO3[p] || '');
      o.servicio = !f ? '' : (C.txtServ && String(r[12] || '').toUpperCase().includes(String(C.txtServ).toUpperCase()) ? 'Sí' : 'No');
      o.nc = !f ? '' : (String(r[6] ?? '').trim() || C.ncDef);
      const x = intraNifN(r[10]), pref = o.em === 'GR' ? 'EL' : o.em, iso = INTRA_ISO3[x.slice(0, 3)] || '';
      o.nifExp = x === '' ? '' : (iso && Number.isNaN(+x.charAt(2))) ? (iso === 'GR' ? 'EL' : iso) + x.slice(3) : (/^\d+$/.test(x) ? pref + x : x);
      o.incluir = (!f || o.servicio === 'Sí') ? 0 : 1;
      o.valor = o.incluir === 1 ? (intraNum(r[8]) || 0) : 0;
      // en el fichero AEAT una línea con valor negativo se declara en el flujo contrario (llegada negativa = expedición y al revés); solo cambia el flujo del fichero
      o.flujoF = (intraNum(r[8]) || 0) < 0 ? (o.flujo === 'Introducción' ? 'Expedición' : o.flujo === 'Expedición' ? 'Introducción' : o.flujo) : o.flujo;
      const av = [];
      if (f) {
        if (o.servicio === 'Sí') av.push('• Servicio: excluido del fichero');
        else {
          if (o.em === '') av.push('✖ País no reconocido'); if (String(r[3] ?? '').trim() === '') av.push('✖ Sin provincia'); if (!(Math.abs(intraNum(r[7]) || 0) > 0)) av.push('✖ Peso 0');
          if (o.flujoF === 'Expedición' && (o.nifExp.length < 4 || o.nifExp.length > 14 || o.nifExp.slice(0, 2) !== (o.em === 'GR' ? 'EL' : o.em))) av.push('✖ NIF IVA no válido');
          if (String(r[6] ?? '').trim() === '') av.push('• NC por defecto');
          if (o.flujoF === 'Introducción' && String(r[4] ?? '').trim() === '12') av.push('• Naturaleza 12 en llegada: revisar');
        }
      }
      o.avisos = av.join(' | ');
      // la línea suma en su partida original: un abono de emitidas declarado como llegada cuenta en expediciones (en negativo) y al revés
      const fk = kf(r[13]);
      o.flujoConc = o.incluir !== 1 ? '' : fk ? ((o.flujo === 'Introducción' && facRUE.has(fk) && !facSUE.has(fk)) ? 'Expedición' : (o.flujo === 'Expedición' && facSUE.has(fk) && !facRUE.has(fk)) ? 'Introducción' : o.flujo)
        : (o.flujo === 'Introducción' && nifRUE.has(o.nifExp) && !nifSUE.has(o.nifExp)) ? 'Expedición' : (o.flujo === 'Expedición' && !nifRUE.has(o.nifExp) && nifSUE.has(o.nifExp)) ? 'Introducción' : o.flujo;
      o.impConc = o.flujoConc === '' ? 0 : (o.flujoConc === o.flujo ? 1 : -1) * o.valor;
      return o;
    });
  }
  function lineaIntra(o, C) {
    const inv = o.flujoF !== o.flujo; // al pasar al flujo contrario se quita el signo negativo
    const nf = (x, d) => { let n = intraNum(x); if (n !== null && inv) n = Math.abs(n); return n === null ? '' : n.toFixed(d).replace('.', ','); };
    const pr = String(o.r[3] ?? '').trim(), prov = pr === '' ? '' : (/^\d+$/.test(pr) ? pr.padStart(2, '0') : intraTx(pr));
    const cn = String(o.r[4] ?? '').trim(), nat = /^\d+$/.test(cn) ? cn.padStart(2, '0') : intraTx(cn);
    const nif = (o.flujoF === 'Introducción' && C.nifIntro !== 'Sí') ? '' : o.nifExp;
    return `${[o.em, prov, intraTx(C.incoterm), nat, intraTx(o.r[5]), '', intraTx(o.nc), o.em, intraTx(C.regimen), nf(o.r[7], 3), '', nf(o.r[8], 2), nf(o.r[9], 2), nif].join(';')};`;
  }
  async function intraAnadirFilas(filas) {
    const D = datosIntra(); if (!D) return; let n = 0;
    filas.forEach((r) => {
      if (!r || !r.some((v) => v !== null && v !== '')) return; if (String(r[0] ?? '').trim().toLowerCase() === 'fecha') return; // cabecera
      const f = fechaUtc(r[0]); if (!f) return;
      const fila = INTRA_COLS.map((_, j) => { const v = r[j]; return v instanceof Date ? fdmy(fechaUtc(v)) : (v === undefined ? null : v); }); fila[0] = fdmy(f); D.rows.push(fila); n++;
    });
    await guardarIntra(D); aviso(`${n} línea(s) Intrastat añadidas`);
  }
  async function cargarIntra(files) {
    for (const f of files) { const sh = await hojasExcel(f); if (sh[0]) await intraAnadirFilas(sh[0].rows); }
  }
  // «Recoger ahora» (descarga semanal de D365): carga un Intrastat en la empresa del fichero (no tiene por qué ser la elegida), sin duplicar lo que ya está.
  // Se compara por contenido y por número de veces, así dos líneas iguales del mismo archivo (mismas mercancías y factura) se conservan.
  async function intraIngesta(empId, file) {
    const sh = await hojasExcel(file), filas = (sh.find((h) => h.rows.some((r) => r && String(r[0] ?? '').trim().toLowerCase() === 'fecha')) ?? sh[0])?.rows ?? [];
    const { data, error: e0 } = await db.from('registros').select('id,datos').eq('empresa_id', empId).eq('tipo', 'intra').maybeSingle();
    if (e0) throw new Error(e0.message);
    const d = data?.datos ?? { rows: [], serv: [], cfg: {}, exp: {} }, rows = d.rows ?? [];
    const firma = (r) => JSON.stringify(INTRA_COLS.map((_, j) => String(r[j] ?? '').trim()));
    const tengo = new Map(); rows.forEach((r) => { const k = firma(r); tengo.set(k, (tengo.get(k) || 0) + 1); });
    // el Excel de D365 trae la cabecera y alguna columna más («Es válido»): las columnas se buscan por su nombre; sin cabecera, por posición
    const hd = filas.find((r) => r && String(r[0] ?? '').trim().toLowerCase() === 'fecha'), nm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const pos = INTRA_COLS.map((c, j) => { const i = hd ? hd.findIndex((x) => nm(x) === nm(c)) : j; return i; });
    const porNombre = hd && pos.filter((i) => i >= 0).length >= 12 ? pos : INTRA_COLS.map((_, j) => j);
    const nuevas = []; filas.forEach((r) => {
      if (!r || !r.some((v) => v !== null && v !== '')) return; if (String(r[0] ?? '').trim().toLowerCase() === 'fecha') return;
      const rr0 = porNombre.map((i) => (i >= 0 ? r[i] : undefined)), f = fechaUtc(rr0[0]); if (!f) return;
      const fila = rr0.map((v) => (v instanceof Date ? fdmy(fechaUtc(v)) : (v === undefined ? null : v))); fila[0] = fdmy(f); nuevas.push(fila);
    });
    const vistas = new Map(), añadir = [];
    nuevas.forEach((fila) => { const k = firma(fila), c = (vistas.get(k) || 0) + 1; vistas.set(k, c); if (c > (tengo.get(k) || 0)) añadir.push(fila); });
    if (!nuevas.length) throw new Error('no he encontrado líneas Intrastat (fecha, dirección, país…)');
    if (!añadir.length) return { leidas: nuevas.length, nuevas: 0 };
    const datos = { ...d, rows: [...rows, ...añadir] };
    const { error } = data?.id ? await db.from('registros').update({ datos }).eq('id', data.id) : await db.from('registros').insert({ id: crypto.randomUUID(), empresa_id: empId, tipo: 'intra', ejercicio: null, datos });
    if (error) throw new Error(error.message);
    BIG.delete(`intra|${empId}`); // se vuelve a leer de la base de datos al abrir la pestaña
    return { leidas: nuevas.length, nuevas: añadir.length };
  }
  function intraFiltrar() {
    const q = (k) => String(intraF[k] || '').trim().toUpperCase(); let n = 0, t = 0;
    const imp = q('imp').replace(/\s/g, ''), nimp = (x) => x.replace(/\./g, '').replace(',', '.');
    document.querySelectorAll('tr[data-fnif]').forEach((tr) => { t++;
      const ok = (!q('fac') || (tr.dataset.ffac || '').includes(q('fac'))) && (!q('nif') || tr.dataset.fnif.includes(q('nif'))) && (!q('pais') || tr.dataset.fpais.includes(q('pais'))) && (!q('flujo') || tr.dataset.fflujo.includes(q('flujo')))
        && (!imp || tr.dataset.fimp.split(/\s+/).some((v) => v && (nimp(v) === nimp(imp) || v.startsWith(imp) || nimp(v).startsWith(nimp(imp)))));
      tr.style.display = ok ? '' : 'none'; if (ok) n++; });
    const e = document.querySelector('.it-nfil'); if (e) e.textContent = Object.values(intraF).some((v) => String(v || '').trim()) ? `${n} de ${t} líneas` : '';
  }
  function vistaIntra() {
    if (!S.sel) return sinEmpresa;
    const D = datosIntra(), Er = grande('fact-E'), Rr = grande('fact-R');
    if (!D || !Er || !Rr) return cargandoTxt;
    const C = D.cfg, ej = ejercicio(), O = calcIntra(D, Er, Rr), ed = puede(), dis = ed ? '' : ' disabled';
    const cfgIn = (k, t, w) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:2px 14px 2px 0">${t} <input class="facin" data-intracfg="${k}" value="${esc(C[k])}" size="${w || 8}"${dis}></label>`;
    const cfg = `<div>${cfgIn('tol', 'Tolerancia (€):', 5)}${cfgIn('incoterm', 'Condiciones de entrega (Incoterm):', 5)}${cfgIn('regimen', 'Régimen estadístico:', 3)}${cfgIn('ncDef', 'NC para producto sin código:', 10)}${cfgIn('txtServ', 'Texto en Categoría que identifica servicios:', 12)}
      <label style="display:inline-flex;gap:6px;align-items:center">Exportar NIF en introducciones <select data-intracfg="nifIntro"${dis}>${['Sí', 'No'].map((v) => `<option${C.nifIntro === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>`;
    // tabla de líneas del ejercicio
    const idx0 = O.map((o, i) => [o, i]).filter(([o]) => o.anio === ej || o.anio === '');
    const mSel = intraMes, idx = mSel ? idx0.filter(([o]) => o.mes === mSel) : idx0;
    const nMes = (m) => idx0.filter(([o]) => o.mes === m).length;
    const subtabs = `<span class="it-subtabs no-print"><button class="small${mSel ? '' : ' primary'}" data-act="m-intrames" data-m="0">Todos (${idx0.length})</button>${MES_L.map((t, i) => (nMes(i + 1) ? `<button class="small${mSel === i + 1 ? ' primary' : ''}" data-act="m-intrames" data-m="${i + 1}">${t.slice(0, 3)} (${nMes(i + 1)})</button>` : '')).join('')}</span>`;
    const filtros = `<div class="fc-cab no-print it-fil">Buscar: ${[['fac', 'Nº factura'], ['nif', 'CIF / NIF'], ['pais', 'País'], ['flujo', 'Flujo'], ['imp', 'Importe']].map(([k, t]) => `<label>${t} <input data-intrafil="${k}" value="${esc(intraF[k] || '')}" size="${k === 'flujo' ? 11 : 12}"></label>`).join(' ')} <span class="it-nfil hint"></span></div>`;
    const celda = (v, i, j) => { const t = v instanceof Date ? fdmy(fechaUtc(v)) : (v == null ? '' : String(v)); return `<td><input class="facin" data-intracel="${i}|${j}" value="${esc(t)}" size="${Math.max(4, Math.min(28, t.length + 1))}"${dis}></td>`; };
    const lineas = D.rows.length ? `<div class="wrap" style="max-height:520px;overflow:auto"><table class="tabla"><thead><tr><th></th>${INTRA_COLS.map((c) => `<th>${c}</th>`).join('')}<th class="gris">Año</th><th class="gris">Mes</th><th class="gris">Flujo</th><th class="gris">Estado miembro</th><th class="gris">Servicio</th><th class="gris">NC exportar</th><th class="gris">NIF exportar</th><th class="gris">Incluir</th><th class="gris">Valor facturado (€)</th><th class="gris">Avisos</th><th class="gris">Flujo conciliación</th><th class="gris">Importe conciliación (€)</th></tr></thead><tbody>
      ${idx.map(([o, i]) => `<tr data-ffac="${esc(String(o.r[13] || '')).toUpperCase()}" data-fnif="${esc(`${o.r[10] || ''} ${o.nifExp || ''}`).toUpperCase()}" data-fpais="${esc(`${o.r[2] || ''} ${o.em || ''}`).toUpperCase()}" data-fflujo="${esc(`${o.flujo} ${o.flujoConc}`).toUpperCase()}" data-fimp="${esc([o.r[8], o.r[9], o.valor, o.impConc].map((v) => `${v ?? ''} ${typeof v === 'number' ? nf2(v) : ''}`).join(' '))}"><td>${ed ? `<button class="small" data-act="m-intradel" data-i="${i}" title="Quitar esta línea">✖</button>` : ''}</td>${INTRA_COLS.map((_, j) => celda(j === 0 ? (o.fecha ? fdmy(o.fecha) : o.r[0]) : o.r[j], i, j)).join('')}
        <td class="c">${o.anio}</td><td class="c">${o.mes}</td><td${o.flujoF !== o.flujo ? ' title="Valor negativo: en el fichero va en el flujo contrario"' : ''}>${o.flujoF}${o.flujoF !== o.flujo ? ' ↔' : ''}</td><td class="c">${o.em}</td><td class="c">${o.servicio}</td><td>${esc(o.nc)}</td><td>${esc(o.nifExp)}</td><td class="c">${o.incluir}</td><td class="num">${guion(o.valor)}</td>
        <td class="${/✖/.test(o.avisos) ? 'fila-pend' : ''}">${esc(o.avisos)}</td><td>${o.flujoConc}</td><td class="num">${guion(o.impConc)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">${idx.length} línea(s) ${mSel ? `de ${MES_L[mSel - 1].toLowerCase()} ` : ''}de ${ej}${D.rows.length > idx0.length ? ` · ${D.rows.length - idx0.length} de otros ejercicios guardadas` : ''}. Las celdas blancas se pueden corregir; las grises se calculan solas.</p>` : '<p class="hint">Sin datos: suelta la descarga de Dynamics o pégala abajo.</p>';
    // exportación
    const E = D.exp, meses = /^\dT$/.test(E.per) ? [1, 2, 3].map((k) => (+E.per[0] - 1) * 3 + k) : [+E.per];
    const flujos = E.flujo === 'ambos' ? ['Expedición', 'Introducción'] : [E.flujo];
    intraFich = []; meses.forEach((m) => flujos.forEach((fl) => {
      const sel = O.filter((o) => o.anio === ej && o.mes === m && o.flujoF === fl && o.incluir === 1), excl = O.filter((o) => o.anio === ej && o.mes === m && o.flujoF === fl && o.incluir === 0).length;
      const err = sel.filter((o) => /✖/.test(o.avisos)).length, nombre = `INTRASTAT_${fl === 'Expedición' ? 'E' : 'I'}_${ej}_${String(m).padStart(2, '0')}.txt`;
      const estado = (sel.length === 0 ? 'Sin líneas en este mes' : sel.length > 1000 ? '⚠ Más de 1000 líneas: dividir en varias declaraciones' : err ? `⚠ ${err} línea(s) con errores (✖ en columna Avisos)` : '✓ Listo para exportar') + (excl ? ` · ${excl} servicio(s) excluido(s)` : '');
      intraFich.push({ fl, m, nombre, estado, txt: sel.map((o) => lineaIntra(o, C)).join('\r\n'), n: sel.length });
    }));
    const exp = `<div class="fc-cab"><label>Periodo <select data-intraexp="per"${dis}>${Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((v) => `<option value="${v}"${E.per === v ? ' selected' : ''}>${v} - ${MES_L[+v - 1]}</option>`).join('')}${['1T', '2T', '3T', '4T'].map((v) => `<option value="${v}"${E.per === v ? ' selected' : ''}>${v} (3 ficheros por flujo)</option>`).join('')}</select></label>
        <label>Flujo <select data-intraexp="flujo"${dis}>${[['ambos', 'Expedición + Introducción (ficheros separados)'], ['Expedición', 'Expedición'], ['Introducción', 'Introducción']].map(([v, t]) => `<option value="${v}"${E.flujo === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
      ${intraFich.map((f, k) => `<div class="block" style="margin:8px 0"><b>Declaración ${f.fl === 'Expedición' ? 'EXPEDICIÓN (E)' : 'INTRODUCCIÓN (I)'} - ${MES_MAY[f.m - 1]} ${ej}</b> · ${f.n} línea(s) · <span class="${/✖|⚠/.test(f.estado) ? 'fila-pend' : ''}">${esc(f.estado)}</span>
        <div style="margin:6px 0"><button class="small" data-act="m-intradesc" data-k="${k}"${f.n ? '' : ' disabled'}>⬇ Descargar ${esc(f.nombre)}</button> <button class="small" data-act="m-intracopia" data-k="${k}"${f.n ? '' : ' disabled'}>Copiar</button></div>
        ${f.n ? `<pre style="max-height:160px;overflow:auto;background:#f7f7f7;padding:6px;font-size:11px">${esc(f.txt)}</pre>` : ''}</div>`).join('')}
      <p class="hint">Formato de línea: EM;Provincia;Incoterm;Naturaleza;Transporte;Puerto;NC;País origen;Régimen;Masa kg;Unid.supl.;Valor facturado;Valor estadístico;NIF IVA. Guarda el .txt en una carpeta llamada AEAT y en la Sede (Intrastat > Presentación por fichero) indica flujo, mes y año.</p>`;
    setTimeout(intraFiltrar, 0);
    // el día 4 de cada mes toca sacar de Dynamics el Intrastat del mes anterior (solo HER, ESP e HIS: se presenta por meses)
    let avisoDia4 = '';
    if (oblIntE(empresa())) {
      const hoy = new Date(), ene = hoy.getMonth() === 0, mm = ene ? 12 : hoy.getMonth(), yy = ene ? hoy.getFullYear() - 1 : hoy.getFullYear(), nMes = O.filter((o) => o.anio === yy && o.mes === mm).length;
      if (nMes) avisoDia4 = `<p class="hint" style="color:#1a7f37">✓ Intrastat de ${MES_L[mm - 1].toLowerCase()} ${yy} cargado (${nMes} líneas).</p>`;
      else if (hoy.getDate() >= 4) avisoDia4 = `<div class="aviso no-print"><p>⚠ Desde el día 4 toca sacar de Dynamics el Intrastat de <b>${MES_L[mm - 1].toLowerCase()} ${yy}</b>: todavía no hay líneas de ese mes. Usa el botón «Abrir Intrastat en Dynamics», descarga el Excel y suéltalo aquí.</p></div>`;
      else avisoDia4 = `<p class="hint no-print">El día 4 se saca de Dynamics el Intrastat del mes anterior (${MES_L[mm - 1].toLowerCase()} ${yy}).</p>`;
    }
    return `${avisoHtml()}<section class="block"><h3 class="bt">INTRASTAT · ${ej}</h3>
      <p class="hint">Distribuciones = Expedición, Llegadas = Introducción. País ISO3 → ISO2. Servicios (Categoría con «${esc(C.txtServ)}») se excluyen; producto sin NC toma el NC por defecto. Avisos: ✖ = error que hay que corregir antes de presentar; • = informativo. El 349 se calcula desde los libros registro (R.UE y S.UE.NR/RD/SR).</p>
      ${cfg}<p class="hint no-print">La conciliación con el modelo 349 está en Conciliaciones → Conciliación 349 - Intrastat.</p></section>
      <section class="block"><h3 class="bt">Descarga de Dynamics (13 columnas + nº de factura) ${oblIntE(empresa()) ? '<button class="small no-print" data-act="m-intradyn" title="Abre la página de Intrastat de Dynamics 365 de esta empresa en otra pestaña">↗ Abrir Intrastat en Dynamics</button>' : ''}</h3>${avisoDia4}
      ${ed ? `<div class="dropzone" data-kind="intra" tabindex="0" role="button"><b>Suelta aquí el Excel o CSV de Dynamics</b> o haz clic para elegirlo (se añade a lo que hay)
        <input type="file" data-dzkind="intra" accept=".xlsx,.xls,.xlsm,.csv" multiple hidden></div>
      <div class="no-print" style="margin:8px 0"><textarea id="intraPega" rows="3" style="width:100%;font-size:11px" placeholder="…o pega aquí las filas copiadas de Excel (13 columnas más el nº de factura opcional: ${INTRA_COLS.join(', ')})"></textarea>
        <button class="small" data-act="m-intrapega">Añadir lo pegado</button> <button class="small" data-act="m-intraadd" title="Añade una fila en blanco al final de la tabla para rellenarla a mano">＋ Añadir línea a mano</button><button class="small" data-act="m-intravaciar">Vaciar las líneas de ${ej}</button>${mSel ? ` <button class="small" data-act="m-intravaciarmes" data-m="${mSel}">Vaciar las líneas de ${MES_L[mSel - 1].toLowerCase()}</button>` : ''} ${subtabs}</div>` : `<div class="no-print">${subtabs}</div>`}
      ${D.rows.length ? filtros : ''}${lineas}</section>
      <section class="block"><h3 class="bt">Exportación Intrastat (formato AEAT .txt)</h3>${exp}</section>`;
  }

  // ================= Conciliación 349 - Intrastat (bienes · por mes y por factura) =================
  let intraConcMes = 0;
  // el nº de factura abre esa factura en Emitidas (expediciones) o Recibidas (introducciones) para corregirla; allí hay un botón para volver a esta pestaña
  const lnkFac = (fl, fac) => `<a href="#" class="lnk-fac" data-gofac="${fl === 'Expedición' ? 'E' : 'R'}" data-fac="${esc(fac)}" title="Abrir esta factura en ${fl === 'Expedición' ? 'Emitidas' : 'Recibidas'} para corregirla">${esc(fac)}</a>`;
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('[data-gofac]'); if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    document.dispatchEvent(new CustomEvent('ir-factura', { detail: { s: a.dataset.gofac, fac: a.dataset.fac, dest: a.dataset.dest || '' } }));
  }, true);
  function vistaIntraConc() {
    if (!S.sel) return sinEmpresa;
    const D = datosIntra(), rep = grande('fact-E'), sop = grande('fact-R');
    if (!D || !rep || !sop) return cargandoTxt;
    const C = D.cfg, ej = ejercicio(), O = calcIntra(D, rep, sop), tol = +C.tol || 0;
    const mesDe = (l) => { const f = fechaUtc(l.fecha); return f && f.getUTCFullYear() === ej ? f.getUTCMonth() + 1 : 0; };
    const bienE = (l) => l.codigo === 'R.UE', bienA = (l) => COD_AIB.includes(l.codigo);
    const SV = D.serv.map((fac) => { const ls = rep.filter((l) => String(l.factura || '').trim() === String(fac || '').trim()), l0 = ls[0], nif = l0 ? String(l0.nif || '') : '';
      return { fac, fecha: l0 ? fechaUtc(l0.fecha) : null, nif, nombre: l0 ? (l0.nombre || '') : '', pais: nif ? nif.slice(0, 2).toUpperCase().replace('EL', 'GR') : '', base: r2(ls.filter(bienE).reduce((s, l) => s + (+l.base || 0), 0)), ok: !!l0 }; });
    const servF = new Set(SV.map((x) => kf(x.fac)));
    const est = (a, b, d) => (Math.abs(a) < 0.005 && Math.abs(b) < 0.005 ? '<span class="sinp">Sin operaciones</span>' : Math.abs(d) <= tol
      ? '<b class="ok" style="color:#0a6;background:#e6f6ec;padding:1px 8px;border-radius:3px">Cuadra</b>' : '<b class="dif-ko" style="color:#a4161a;background:#fde7e7;padding:1px 8px;border-radius:3px">Revisar</b>');
    const tot = [0, 0, 0, 0, 0, 0];
    // regla: en cada mes el Intrastat no debe ser mayor que el 349 del mismo mes (más la tolerancia)
    let nMayor = 0;
    const mayor = '<b class="dif-ko" style="color:#a4161a;background:#fde7e7;padding:1px 6px;border-radius:3px;display:block;margin-top:2px" title="En este mes el Intrastat supera al 349">Intrastat &gt; 349</b>';
    const filasRes = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const iE = r2(O.filter((o) => o.anio === ej && o.mes === m && o.flujoConc === 'Expedición').reduce((s, o) => s + o.impConc, 0));
      const rueM = rep.filter((l) => mesDe(l) === m && bienE(l));
      const mE = r2(rueM.reduce((s, l) => s + (+l.base || 0), 0) - SV.filter((s) => s.fecha && s.fecha.getUTCFullYear() === ej && s.fecha.getUTCMonth() + 1 === m).reduce((s, x) => s + x.base, 0)
        - O.filter((o) => o.anio === ej && o.mes === m && o.flujo === 'Expedición' && o.servicio === 'Sí').reduce((s, o) => s + (intraNum(o.r[8]) || 0), 0));
      const iI = r2(O.filter((o) => o.anio === ej && o.mes === m && o.flujoConc === 'Introducción').reduce((s, o) => s + o.impConc, 0));
      const mI = r2(sop.filter((l) => mesDe(l) === m && bienA(l)).reduce((s, l) => s + (+l.base || 0), 0));
      const dE = r2(iE - mE), dI = r2(iI - mI);
      [iE, mE, dE, iI, mI, dI].forEach((v, k) => { tot[k] = r2(tot[k] + v); });
      const exE = dE > tol, exI = dI > tol; if (exE) nMayor++; if (exI) nMayor++;
      return `<tr><td>${MES_L[i].toUpperCase()}</td><td class="n">${guion(iE)}</td><td class="n">${guion(mE)}</td><td class="n ${Math.abs(dE) > tol ? 'dif-ko' : ''}">${guion(dE)}</td><td class="c">${est(iE, mE, dE)}${exE ? mayor : ''}</td>
        <td class="n">${guion(iI)}</td><td class="n">${guion(mI)}</td><td class="n ${Math.abs(dI) > tol ? 'dif-ko' : ''}">${guion(dI)}</td><td class="c">${est(iI, mI, dI)}${exI ? mayor : ''}</td></tr>`;
    }).join('');
    const avisoMayor = nMayor ? `<div class="aviso"><p>✖ El Intrastat supera al 349 en ${nMayor} comprobación(es) mensual(es) (marcadas «Intrastat &gt; 349»). Cada mes el Intrastat no debe ser mayor que el 349: revisa facturas sin declarar en el 349, anticipos (R.UE.VA) o líneas del Intrastat de más.</p></div>` : '<p class="hint" style="color:#1a7f37">✓ En ningún mes el Intrastat supera al 349.</p>';
    const resumen = `${avisoMayor}<table class="aud mov it-t"><thead><tr><th rowspan="2">Mes</th><th colspan="4">EXPEDICIONES / ENTREGAS (clave E)</th><th colspan="4">INTRODUCCIONES / ADQUISICIONES (clave A)</th></tr>
      <tr><th>Intrastat (valor facturado)</th><th>Modelo 349 clave E (entregas de bienes)</th><th>Diferencia</th><th>Estado</th><th>Intrastat (valor facturado)</th><th>Modelo 349 clave A (adquisiciones de bienes)</th><th>Diferencia</th><th>Estado</th></tr></thead>
      <tbody>${filasRes}<tr class="tot200"><td>TOTAL ${ej}</td>${tot.map((v, k) => `<td class="n">${nf2(v)}</td>${k === 2 || k === 5 ? '<td></td>' : ''}`).join('')}</tr></tbody></table>`;
    const serv = `<table class="aud mov it-t"><thead><tr><th>Factura</th><th>Fecha</th><th>NIF</th><th>Nombre</th><th>País</th><th>Base 349 (€)</th><th></th></tr></thead><tbody>
      ${SV.map((s, i) => `<tr><td>${esc(s.fac)}</td><td class="c">${s.ok ? fdmy(s.fecha) : '<b class="dif-ko">No encontrada</b>'}</td><td>${esc(s.nif)}</td><td>${esc(s.nombre)}</td><td class="c">${esc(s.pais)}</td><td class="n">${guion(s.base)}</td><td class="no-print">${puede() ? `<button class="small" data-act="m-intraservdel" data-i="${i}">Quitar</button>` : ''}</td></tr>`).join('')}
      ${puede() ? '<tr class="no-print"><td><input class="facin" data-intraservadd="1" placeholder="Nº de factura" size="16"></td><td colspan="6" class="hint">Escribe el nº de factura del libro de repercutido; el resto se rellena solo.</td></tr>' : ''}</tbody></table>`;
    // conciliación por nº de factura: líneas Intrastat del mes frente al 349 (libros) del mismo mes
    const calcMes = (m) => ['Expedición', 'Introducción'].map((fl) => {
      const otro = fl === 'Expedición' ? 'llegada (introducción)' : 'expedición', M = new Map();
      const g = (k) => { if (!M.has(k)) M.set(k, { fac: k, nif: '', nom: '', it: 0, itn: 0, nIt: 0, m: 0, mn: 0, nM: 0 }); return M.get(k); };
      O.filter((o) => o.anio === ej && o.mes === m && o.flujoConc === fl).forEach((o) => { const x = g(kf(o.r[13]) || '(sin nº de factura)'), v = +o.impConc || 0; if (v < 0) x.itn = r2(x.itn + v); else x.it = r2(x.it + v); x.nIt++; if (!x.nif) x.nif = o.nifExp || String(o.r[10] || ''); });
      const L = fl === 'Expedición' ? rep.filter((l) => mesDe(l) === m && bienE(l)) : sop.filter((l) => mesDe(l) === m && bienA(l));
      const porF = new Map(); L.forEach((l) => { const k = kf(l.factura) || '(sin nº de factura)'; (porF.get(k) || porF.set(k, []).get(k)).push(l); });
      porF.forEach((ls, k) => {
        const x = g(k), obj = r2((x.it || 0) + (x.itn || 0)); let usa = ls;
        // si varias líneas del 349 y una parte suma lo del Intrastat, esas son los bienes; el resto (portes, servicios) se aparta
        if (ls.length > 1 && ls.length <= 14 && x.nIt) {
          const t = r2(ls.reduce((s, l) => s + (+l.base || 0), 0));
          if (Math.abs(t - obj) > tol) {
            let mejor = null;
            for (let mk = 1; mk < (1 << ls.length) - 1; mk++) { let sm = 0; for (let i = 0; i < ls.length; i++) if (mk & (1 << i)) sm += +ls[i].base || 0; if (Math.abs(r2(sm) - obj) <= tol) { const n = ls.filter((_, i) => mk & (1 << i)).length; if (!mejor || n > mejor.n) mejor = { m: mk, n }; } }
            if (mejor) { usa = ls.filter((_, i) => mejor.m & (1 << i)); x.servAp = r2(ls.filter((_, i) => !(mejor.m & (1 << i))).reduce((s, l) => s + (+l.base || 0), 0)); }
          }
        }
        usa.forEach((l) => { const v = +l.base || 0; if (v < 0) x.mn = r2(x.mn + v); else x.m = r2(x.m + v); x.nM++; x.nif = x.nif || l.nif || ''; x.nom = x.nom || l.nombre || ''; });
      });
      const F = [...M.values()].map((x) => {
        const d = r2((x.it + x.itn) - (x.m + x.mn)), sv = servF.has(x.fac);
        const e = sv && !x.nIt ? ['ok', 'Servicio (lista de servicios del 349)']
          : x.nIt && x.nM ? (Math.abs(d) <= tol ? ['ok', (x.itn ? `Cuadra · la negativa (${nf2(x.itn)}) está declarada en el Intrastat como ${otro}` : 'Cuadra') + (x.servAp ? ` · se aparta ${nf2(x.servAp)} de servicio (no es bien)` : '')]
            : ['ko', x.mn && !x.itn ? `Importe distinto · la negativa (${nf2(x.mn)}) no está en el Intrastat como ${otro}` : 'Importe distinto'])
            : x.nM ? (!x.m && x.mn < 0 ? ['ko', `Abono sin declarar en el Intrastat (debería ir como ${otro})`] : ['ko', 'Solo en el 349: ¿servicio declarado como bien?'])
              : ['ko', 'Solo en Intrastat: no está en el 349 como bien'];
        return Object.assign(x, { d, est: e });
      }).sort((a, b) => (a.est[0] === 'ok') - (b.est[0] === 'ok') || a.fac.localeCompare(b.fac));
      return { fl, F, nKo: F.filter((x) => x.est[0] === 'ko').length };
    });
    const MS = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({ m, B: calcMes(m) })).filter((x) => x.B.some((b) => b.F.length));
    let concFac;
    if (!MS.length) concFac = `<section class="block"><h3 class="bt">Conciliación por nº de factura · fichero Intrastat vs modelo 349 · ${ej}</h3><p class="leyenda">Sin líneas Intrastat ni facturas del 349 en ${ej}.</p></section>`;
    else {
      let sel = intraConcMes || intraMes || 0; if (!MS.some((x) => x.m === sel)) sel = (MS.find((x) => x.B.some((b) => b.nKo)) || MS[MS.length - 1]).m;
      const tabsM = `<div class="it-subtabs it-conctabs no-print" style="margin:0 0 8px">${MS.map((x) => { const k = x.B.reduce((s, b) => s + b.nKo, 0); return `<button class="small${x.m === sel ? ' primary' : ''} ${k ? 'mes-ko' : 'mes-ok'}" data-act="m-intraconcmes" data-m="${x.m}">${MES_L[x.m - 1].slice(0, 3)} ${k ? `· ${k} ✖` : '✓'}</button>`; }).join('')}</div>`;
      const B = MS.find((x) => x.m === sel).B;
      const itE = r2(O.filter((o) => o.anio === ej && o.mes === sel && o.flujoConc === 'Expedición').reduce((s, o) => s + o.impConc, 0)), itI = r2(O.filter((o) => o.anio === ej && o.mes === sel && o.flujoConc === 'Introducción').reduce((s, o) => s + o.impConc, 0));
      const e349 = r2(rep.filter((l) => mesDe(l) === sel && bienE(l)).reduce((s, l) => s + (+l.base || 0), 0)), a349 = r2(sop.filter((l) => mesDe(l) === sel && bienA(l)).reduce((s, l) => s + (+l.base || 0), 0));
      const ok = (v) => Math.abs(v) <= Math.max(tol, 0.01);
      const fila = (t, ta, a, tb, b, acc) => { const d = r2(a - b), bien = ok(d); return `<tr class="${bien ? 'cf-ok' : 'cf-ko'}"><td>${t}</td><td>${ta}</td><td class="n">${nf2(a)}</td><td>${tb}</td><td class="n">${nf2(b)}</td><td class="n">${guion(d)}</td><td>${bien ? '✓ Cuadra' : `✖ ${acc}`}</td></tr>`; };
      // 303 y 349 del mes (mismo cálculo que los modelos): casilla 59 y 10 frente a las claves del 349 y al Intrastat
      const pMes = String(sel).padStart(2, '0'); let c59 = null, c10 = null, neg10 = 0, k349 = null;
      try { const C3 = calc303(rep, sop, ej, pMes); c59 = r2(C3.G.entregas.base); neg10 = r2(sop.filter((l) => mesDe(l) === sel && /^S\.UE/.test(l.codigo || '') && (+l.base || 0) < 0).reduce((s, l) => s + (+l.base || 0), 0)); c10 = r2(C3.G.intra.base); neg10 = 0; /* la casilla 10 ya incluye las negativas: no se suman otra vez */ const P9 = calc349Ops(rep, sop, ej, pMes); k349 = (k) => r2([...P9.ops, ...P9.rect].filter((x) => x.clave === k).reduce((s, x) => s + x.base, 0)); } catch { /* sin datos del 303 */ }
      const k349E = k349 ? k349('E') : e349, k349AI = k349 ? r2(k349('A') + k349('I')) : r2(a349);
      const filas = [...(c59 === null ? [] : [fila('Entregas intracomunitarias', '303 casilla 59', c59, k349 ? '349 claves E + S (con rectificaciones)' : '349 clave E', k349 ? r2(k349E + k349('S')) : k349E, 'El 303 y el 349 deben llevar las mismas facturas R.UE: revisa los códigos del libro')]),
        fila(c59 === null ? 'Entregas intracomunitarias' : '', '349 clave E (con rectificaciones)', k349E, 'Intrastat expediciones', itE, 'Ver las facturas en rojo de abajo'),
        ...(c10 === null ? [] : [fila('Adquisiciones intracomunitarias', neg10 ? `303 casilla 10 + negativas en 14 y 40 (${nf2(neg10)})` : '303 casilla 10', c10, '349 claves A + I (con rectificaciones)', k349AI, 'Abonos de servicios intracomunitarios: deben ir igual en el 303 (10-11 o 14-15) y en el 349 (clave I o rectificación)')]),
        fila(c10 === null ? 'Adquisiciones intracomunitarias' : '', '349 clave A (con rectificaciones)', k349 ? k349('A') : a349, 'Intrastat introducciones', itI, 'Ver las facturas en rojo de abajo')];
      const MOT = [['solo349', 'Factura de bienes en el 349 sin Intrastat', 'Si es un servicio, codifícala en el libro como servicio (clave S / I); si es un bien, genera su línea Intrastat en Dynamics'],
        ['negativa', 'Línea negativa que no está en el Intrastat', 'Si es un descuento o devolución de bienes, declárala en Dynamics como flujo contrario (llegada / expedición) con el mismo nº de factura; si es un servicio, ponle el código de servicio'],
        ['abono', 'Abono sin declarar en el Intrastat', 'Genera en Dynamics la llegada (abono de emitidas) o la expedición (abono de recibidas) con el mismo nº de factura'],
        ['soloIt', 'Línea Intrastat sin factura de bienes en el 349', 'Revisa el nº de factura de la línea Intrastat o el código del libro (R.UE / S.UE)'],
        ['importe', 'Importe distinto', 'Revisa el importe de la línea Intrastat frente al de la factura']];
      const G = {}; B.forEach(({ fl, F }) => F.filter((x) => x.est[0] === 'ko').forEach((x) => { const t = x.est[1], k = /^Solo en el 349/.test(t) ? 'solo349' : /no está en el Intrastat como/.test(t) ? 'negativa' : /^Abono/.test(t) ? 'abono' : /^Solo en Intrastat/.test(t) ? 'soloIt' : 'importe'; (G[k] = G[k] || []).push({ fl, x }); }));
      const queHacer = (x) => { const t = x.est[1], im = nf2(Math.abs(x.d));
        if (/^Solo en el 349/.test(t)) return `Factura de ${im} € en el 349 sin Intrastat: si es un servicio, codifícala como servicio (S.UE / clave I); si es un bien, genera su línea Intrastat en Dynamics con el nº ${x.fac}`;
        if (/no está en el Intrastat como/.test(t)) return `Negativa de ${nf2(Math.abs(x.mn))} € sin Intrastat: declárala en Dynamics como flujo contrario con el nº ${x.fac}, o ponle código de servicio si lo es`;
        if (/^Abono/.test(t)) return `Genera en Dynamics el abono de ${im} € (llegada si es de emitidas, expedición si es de recibidas) con el nº ${x.fac}`;
        if (/^Solo en Intrastat/.test(t)) return `Línea Intrastat de ${im} € sin factura de bienes en el 349: revisa el nº de factura de la línea o el código del libro (R.UE / S.UE)`;
        return `Diferencia de ${im} €: ajusta el importe de la línea Intrastat (${nf2(r2(x.it + x.itn))}) al de la factura en el 349 (${nf2(r2(x.m + x.mn))})`; };
      const grupos = MOT.filter(([k]) => G[k]).map(([k, t, acc]) => `<div style="border:1px solid #c9a0a0;border-radius:4px;margin:10px 0;padding:6px 8px;background:#fff"><h4 style="margin:0 0 2px">${t} · ${G[k].length} factura(s)</h4><div style="margin:0 0 6px;color:#333">→ ${acc}</div><table class="aud mov it-t it-conc"><thead><tr><th>Flujo</th><th>Nº factura</th><th>NIF</th><th>Nombre</th><th>Intrastat €</th><th>349 €</th><th>Diferencia</th><th>Qué hacer</th></tr></thead><tbody>${G[k].map(({ fl, x }) => `<tr class="cf-ko"><td>${fl === 'Expedición' ? 'Expedición (E)' : 'Introducción (A)'}</td><td>${lnkFac(fl, x.fac)}</td><td>${esc(x.nif)}</td><td>${esc(x.nom)}</td><td class="n">${guion(r2(x.it + x.itn))}</td><td class="n">${guion(r2(x.m + x.mn))}</td><td class="n">${guion(x.d)}</td><td>${esc(queHacer(x))}</td></tr>`).join('')}</tbody></table></div>`).join('');
      const listo = filas.every((f) => f.includes('cf-ok')) && !grupos;
      const tablaGrupos = grupos ? `<h4 style="margin:10px 0 4px">Facturas a revisar, por motivo</h4>${grupos}` : '';
      const control = `<h4 style="margin:6px 0 4px">Control antes de presentar · 349 · Intrastat · ${MES_L[sel - 1]} ${ej} · ${listo ? '<b style="color:#0a6">✓ listo para presentar</b>' : '<span class="dif-ko">✖ revisar antes de presentar</span>'}</h4>
        <table class="aud mov it-t it-conc"><thead><tr><th>Operaciones</th><th>Fuente</th><th>Importe €</th><th>Frente a</th><th>Importe €</th><th>Diferencia</th><th>Estado / qué hacer</th></tr></thead><tbody>${filas.join('')}</tbody></table>${tablaGrupos}`;
      const bloques = B.map(({ fl, F, nKo }) => { const t = (k) => r2(F.reduce((s, x) => s + x[k], 0));
        return `<h4 style="margin:10px 0 4px">${fl === 'Expedición' ? 'EXPEDICIONES (E) · 349 clave E (entregas de bienes)' : 'INTRODUCCIONES (I) · 349 clave A (adquisiciones de bienes)'} · ${nKo ? `<span class="dif-ko">${nKo} factura(s) a revisar</span>` : '<b style="color:#0a6">todo cuadra</b>'}</h4>${F.length ? `<table class="aud mov it-t it-conc"><thead><tr><th>Nº factura</th><th>NIF</th><th>Nombre</th><th>Líneas Intrastat</th><th>Intrastat €</th><th>Líneas 349</th><th>349 positivas €</th><th>349 negativas €</th><th>Diferencia</th><th>Estado</th><th>Qué hacer</th></tr></thead><tbody>
          ${F.map((x) => `<tr class="${x.est[0] === 'ok' ? 'cf-ok' : 'cf-ko'}"><td>${lnkFac(fl, x.fac)}</td><td>${esc(x.nif)}</td><td>${esc(x.nom)}</td><td class="c">${x.nIt || '-'}</td><td class="n">${guion(r2(x.it + x.itn))}</td><td class="c">${x.nM || '-'}</td><td class="n">${guion(x.m)}</td><td class="n">${guion(x.mn)}</td><td class="n">${guion(x.d)}</td><td>${x.est[0] === 'ok' ? '✓ ' : '✖ '}${esc(x.est[1])}</td><td>${x.est[0] === 'ok' ? '' : esc(queHacer(x))}</td></tr>`).join('')}
          <tr class="tot200"><td colspan="3">TOTAL</td><td></td><td class="n">${nf2(r2(t('it') + t('itn')))}</td><td></td><td class="n">${nf2(t('m'))}</td><td class="n">${nf2(t('mn'))}</td><td class="n">${nf2(t('d'))}</td><td></td><td></td></tr></tbody></table>` : '<p class="leyenda">Sin operaciones en el mes.</p>'}`; });
      const sinFac = O.some((o) => o.anio === ej && o.mes === sel && o.incluir === 1 && !String(o.r[13] ?? '').trim());
      concFac = `<section class="block"><h3 class="bt">Conciliación por nº de factura · fichero Intrastat vs modelo 349 · ${MES_L[sel - 1]} ${ej}</h3>${tabsM}${control}
        <p class="leyenda">Verde = coincide; rojo = a revisar. Intrastat = líneas que van al .txt (valor facturado) agrupadas por la columna Factura; 349 = facturas que el modelo 349 declara con clave E (expediciones) o clave A (introducciones). Las líneas negativas se declaran en el Intrastat en el flujo contrario (una negativa de emitidas como llegada y al revés); aquí suman en su partida original, en negativo, por su nº de factura. Una factura que está en el 349 y no en el Intrastat suele ser un servicio metido como bien.${sinFac ? ' <b class="dif-ko">Hay líneas Intrastat de este mes sin nº de factura: pégalas de nuevo con la columna Factura para poder cruzarlas.</b>' : ''}</p>${bloques.join('')}</section>`;
    }
    return `<section class="block"><h3 class="bt">CONCILIACIÓN 349 - INTRASTAT (bienes) · ${ej}</h3>
      <p class="leyenda">Distribuciones = Expedición, Llegadas = Introducción. País ISO3 → ISO2. Servicios (Categoría con «${esc(C.txtServ)}») se excluyen; producto sin NC toma el NC por defecto. El 349 se calcula desde los libros registro (R.UE y S.UE.NR/RD/SR).</p>
      <h4 style="margin-top:12px">Resumen mensual</h4>${resumen}</section>
      <section class="block"><h3 class="bt">Servicios incluidos en el 349 (R.UE) · se descuentan en la conciliación</h3>${serv}</section>
      ${concFac}`;
  }

  // ================= Eventos propios =================
  const acciones = {
    'm-intraconcmes': (d) => { intraConcMes = +d.m; render(); },
    // Dynamics 365: la página de Intrastat de la empresa (el código de la empresa en Dynamics va en cmp: HER, ESP, LYS…)
    'm-intradyn': () => { const e = empresa(), cmp = String(e?.siglas || '').trim().toUpperCase(); window.open(`https://herogra.operations.dynamics.com/?cmp=${encodeURIComponent(cmp || 'HER')}&mi=Intrastat`, '_blank', 'noopener'); },
    'm-intraadd': async () => {
      const D = datosIntra(); if (!D) return; const ej = ejercicio(), hoy = new Date();
      const m = intraMes || (hoy.getFullYear() === ej ? hoy.getMonth() + 1 : 1), dia = !intraMes && hoy.getFullYear() === ej ? hoy.getDate() : 1;
      const fila = INTRA_COLS.map(() => ''); fila[0] = `${String(dia).padStart(2, '0')}/${String(m).padStart(2, '0')}/${ej}`; fila[1] = 'Distribuciones'; fila[3] = '18'; fila[4] = '11'; fila[5] = '3';
      D.rows.push(fila); await guardarIntra(D);
      const i = D.rows.length - 1; setTimeout(() => { const c = document.querySelector(`[data-intracel="${i}|0"]`); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); c.select?.(); } }, 60);
    },
    'm-intraservdel': async (d) => { const D = datosIntra(); if (!D) return; D.serv.splice(+d.i, 1); await guardarIntra(D); render(); },
    'm-intrames': (d) => { intraMes = +d.m; render(); },
    'm-intradel': async (d) => { const D = datosIntra(); if (!D) return; D.rows.splice(+d.i, 1); await guardarIntra(D); render(); },
    'm-intrapega': () => intraAnadirFilas(String(document.getElementById('intraPega')?.value ?? '').split(/\r?\n/).map((l) => l.split('\t'))),
    'm-intravaciar': async () => {
      const ej = ejercicio(); if (!confirm(`¿Quitar todas las líneas Intrastat de ${ej}?`)) return;
      const D = datosIntra(); if (!D) return; D.rows = D.rows.filter((r) => { const f = fechaUtc(r[0]); return f && f.getUTCFullYear() !== ej; }); await guardarIntra(D); render();
    },
    'm-intravaciarmes': async (d) => {
      const m = +d.m, ej = ejercicio(); if (!confirm(`¿Vaciar las líneas Intrastat de ${MES_L[m - 1].toLowerCase()} ${ej}?`)) return;
      const D = datosIntra(); if (!D) return; D.rows = D.rows.filter((r) => { const f = fechaUtc(r[0]); return !(f && f.getUTCFullYear() === ej && f.getUTCMonth() + 1 === m); }); await guardarIntra(D); intraMes = 0; render();
    },
    'm-intradesc': (d) => { const f = intraFich[+d.k]; if (!f) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`${f.txt}\r\n`], { type: 'text/plain' })); a.download = f.nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    'm-intracopia': (d) => { const f = intraFich[+d.k]; if (f && navigator.clipboard) navigator.clipboard.writeText(f.txt).then(() => aviso(`Copiado: ${f.nombre}`)); },
    'm-592del': async (d) => { const cur = big('m592-mov', () => ({ fab: [], aic: [] })); if (!cur) return; const mov = cur.datos; mov[d.l] = (mov[d.l] ?? []).filter((r) => [r.asiento, r.fecha, r.justificante, r.kg].join('|') !== d.k); await bigGuardar('m592-mov', mov); render(); },
    'm-a22add': async () => { const D = a22Datos(); D.filas.push({ per: `1T ${S.ejercicio}` }); await a22Guardar(D); render(); },
    'm-a22del': async (d) => { const D = a22Datos(); D.filas.splice(+d.i, 1); await a22Guardar(D); render(); },
    'm-a22csv': (d) => a22Csv(d.t),
    'm-a22borrar': async () => { if (!confirm('¿Quitar las compras y ventas cargadas para el A22?')) return; await bigGuardar('a22src', { compras: [], ventas: [], archivos: [] }); render(); },
    'm-a22pasar': async () => {
      const Sx = a22Src(); if (!Sx) return; const R = a22Calc(Sx), D = a22Datos();
      Object.entries(R.trim).forEach(([t, o]) => { const per = `${t.slice(5)} ${t.slice(0, 4)}`, x = D.filas.find((r) => r.per === per);
        const v = { per, motivo: 'Envíos fuera de España (UE y exportación)', kg: String(+o.kg.toFixed(3)).replace('.', ','), imp: o.imp.toFixed(2).replace('.', ',') }; if (x) Object.assign(x, v); else D.filas.push(v); });
      await a22Guardar(D); render();
    },
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
    if (d.intraservadd) { const v = t.value.trim(); if (v) { const D = datosIntra(); if (D) { D.serv.push(v); await guardarIntra(D); } } return void render(); }
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
    if (d.intracfg) { const D = datosIntra(); if (!D) return; D.cfg[d.intracfg] = d.intracfg === 'tol' ? (parseNum(t.value) || 0) : t.value; await guardarIntra(D); return void render(); }
    if (d.intraexp) { const D = datosIntra(); if (!D) return; D.exp[d.intraexp] = t.value; await guardarIntra(D); return void render(); }
    if (d.intracel) { const [i, j] = d.intracel.split('|').map(Number), D = datosIntra(); if (!D) return; if (D.rows[i]) { D.rows[i][j] = t.value; await guardarIntra(D); } return void render(); }
    if (d.m592cab) { const x = datos592(); x.cab ??= {}; x.cab[d.m592cab] = d.m592cab === 'tipo' ? (parseNum(t.value) ?? 0.45) : t.value; await guardar592(x); return void render(); }
    if (d.m592comp) { const x = datos592(); x.comp ??= {}; const v = parseNum(t.value); if (!v) delete x.comp[d.m592comp]; else x.comp[d.m592comp] = v; await guardar592(x); return void render(); }
    if (d.a22) { const [i, k] = d.a22.split('|'), D = a22Datos(); if (!D.filas[+i]) return; D.filas[+i][k] = t.value.trim(); return void a22Guardar(D); }
    if (d.a22cfg) {
      const k = d.a22cfg, D = a22Datos(), C = { ...D.cfg };
      if (k === 'nifs' || k === 'kg') { const o = {}; t.value.split(';').forEach((p) => { const [a, b] = p.split('='); if (a && b) o[a.trim()] = k === 'kg' ? parseNum(b.trim()) : b.trim(); }); C[k] = o; }
      else C[k] = k === 'tipo' ? (parseNum(t.value) || 0.45) : t.value.trim();
      D.cfg = C; await a22Guardar(D); return void render();
    }
    if (d.m583i) { const [k, cmp] = d.m583i.split('|'); m583Guardar((E) => { const I = E.inst[+k]; if (/^q\d$/.test(cmp)) { I.q = I.q ?? ['', '', '', '']; const v = parseNum(t.value); I.q[+cmp[1]] = v === null ? '' : v; } else I[cmp] = t.value.trim(); }); }
    else if (d.m583sel) m583Guardar((E) => { E[d.m583sel] = t.value.trim(); });
    else if (d.m583chk) m583Guardar((E) => { E[d.m583chk] = t.checked; });
  });

  document.addEventListener('input', (ev) => { const k = ev.target.dataset?.intrafil; if (!k) return; intraF = { ...intraF, [k]: ev.target.value }; intraFiltrar(); });

  const kinds = { m232: cargar232, m592: cargar592, a22: a22Cargar, intra: cargarIntra };
  // ================= Conciliación mod 592: calculado frente a presentado, por empresa y periodo (resumen de control; solo lee) =================
  // mismo cálculo que la pestaña «Modelo 592» con los movimientos cargados de cada empresa (HER, ESP y LYS); presentado = el 592 de «Impuestos presentados»
  const nfm = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  // ================= Conciliación mod 583: calculado frente a presentado, por empresa y periodo (resumen de control; solo lee) =================
  // mismo cálculo que la pestaña «Modelo 583» (retribuciones por trimestre a mano o desde el mayor); presentado = el 583 de «Impuestos presentados» del mismo ejercicio
  function filas583() {
    const ej = ejercicio(), selAnt = S.sel, out = [], lista = c.empOrden ? c.empOrden() : [...S.empresas]; let cargando = false;
    try {
      for (const e of lista) {
        if (!(c.obl583 ? c.obl583(e) : false)) continue;
        S.sel = e.id;
        const M = grande('may-mov'); if (M === null) cargando = true; // el mayor sirve para tomar las retribuciones de la cuenta de ventas de electricidad
        const R = calc583(ej, M), prs = S.registros.find((x) => x.tipo === 'prs' && x.empresa_id === e.id && x.ejercicio === ej)?.datos ?? {}, hayDatos = R.inst.some((x) => x.q.some((v) => v));
        for (const p of R.pers) {
          const P = prs[`583|${p}`] ?? null, n = (v) => (v === undefined || v === null || v === '' ? null : Number(v)), pRes = P ? n(P.res) : null;
          if (!P && !hayDatos) continue;
          const calc = R.tot(p), tB = r2(R.inst.reduce((s, x) => s + x.calc[p].base, 0)), tC = r2(R.inst.reduce((s, x) => s + x.calc[p].cuota, 0)), dif = pRes !== null ? r2(calc - pRes) : null;
          const est = !P ? ['aviso', 'Pendiente de presentar'] : !hayDatos ? ['aviso', 'Presentado; faltan las retribuciones para calcular'] : pRes === null ? ['aviso', 'Presentado; no se leyó el importe del PDF'] : Math.abs(dif) <= 1 ? ['ok', 'Cuadra'] : ['ko', 'Diferencia'];
          out.push({ e, p, base: tB, cuota: tC, calc, pRes, dif, est });
        }
      }
    } finally { S.sel = selAnt; }
    return { filas: out, cargando };
  }
  function vistaC583() {
    if (!S.empresas.length) return '<p class="vacio">Sin empresas.</p>';
    const { filas: F, cargando } = filas583(), ej = ejercicio(), ic = { ok: '🟢', ko: '🔴', aviso: '🟡', nd: '⚪' }, k = (x) => F.filter((f) => f.est[0] === x).length, num = (v) => (v === null || v === undefined ? '—' : nfm(v));
    return `<section class="dsec"><h3>Conciliación mod 583 · impuesto sobre el valor de la producción de energía eléctrica · ${ej}</h3>
      <p class="dash-s" style="font-size:.8rem">${ic.ok} ${k('ok')} cuadran · ${ic.ko} ${k('ko')} con diferencia · ${ic.aviso} ${k('aviso')} pendientes o sin datos para calcular${cargando ? ' · ⏳ cargando el mayor de alguna empresa…' : ''}</p>
      <div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>Periodo</th><th>Base calculada</th><th>Cuota íntegra calculada</th><th>Cuota diferencial calculada</th><th>Cuota diferencial presentada</th><th>Diferencia</th><th></th><th>Estado</th></tr></thead><tbody>
      ${F.map((x) => `<tr><td>${esc(x.e.nombre)}</td><td>${x.p} ${ej}</td><td class="n">${num(x.base)}</td><td class="n">${num(x.cuota)}</td><td class="n">${num(x.calc)}</td><td class="n">${num(x.pRes)}</td><td class="n">${num(x.dif)}</td><td style="text-align:center">${ic[x.est[0]]}</td><td>${esc(x.est[1])}</td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin periodos del 583 en este ejercicio (empresas con 583: Herogra Fertilizantes, Lysur, Gesufer e Hispalense).</td></tr>'}</tbody></table></div>
      <p class="hint">Calculado = el mismo cálculo de la pestaña «Modelo 583» con las retribuciones de cada trimestre (escritas a mano o tomadas del mayor). Presentado = la cuota diferencial del 583 en «Impuestos presentados». Cuadra si difiere en 1 € o menos. Esta pestaña solo lee: no cambia ningún dato.</p></section>`;
  }
  function filas592() {
    const ej = String(ejercicio()), selAnt = S.sel, out = [], lista = c.empOrden ? c.empOrden() : [...S.empresas]; let cargando = false;
    try {
      for (const e of lista) {
        if (!obl592(e)) continue;
        S.sel = e.id;
        const cur = big('m592-mov', () => ({ fab: [], aic: [] }));
        if (!cur) { cargando = true; continue; }
        const mov = { fab: cur.datos.fab ?? [], aic: cur.datos.aic ?? [] }, d = datos592();
        const prs = S.registros.find((x) => x.tipo === 'prs' && x.empresa_id === e.id && x.ejercicio === +ej)?.datos ?? {};
        const pers = e.tipo === 'PYME' ? ['1T', '2T', '3T', '4T'] : Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
        for (const per of pers) {
          const L = calc592De(d, mov, ej, per), P = prs[`592|${per}`] ?? null, hayMov = L.fab.length > 0 || L.aic.length > 0;
          if (!P && !hayMov) continue;
          const n = (v) => (v === undefined || v === null || v === '' ? null : Number(v)), pRes = P ? n(P.res) : null, pCuota = P ? n(P.cuota) : null;
          const dRes = pRes !== null ? r2(L.res - pRes) : null, dCuota = pCuota !== null ? r2(L.cuotaAc - pCuota) : null, difs = [dRes, dCuota].filter((v) => v !== null); // la cuota del 592 presentado es la acumulada del año
          const est = !P ? ['aviso', 'Pendiente de presentar'] : !hayMov ? ['aviso', 'Presentado; sin movimientos cargados para calcular'] : !difs.length ? ['aviso', 'Presentado; no se leyeron importes del PDF'] : difs.every((v) => Math.abs(v) <= 1) ? ['ok', 'Cuadra'] : ['ko', 'Diferencia'];
          out.push({ e, per, calcCuota: L.cuotaAc, pCuota, calcRes: L.res, pRes, dRes, dCuota, est, mov: L.fab.length + L.aic.length });
        }
      }
    } finally { S.sel = selAnt; }
    return { filas: out, cargando };
  }
  function vistaC592() {
    if (!S.empresas.length) return '<p class="vacio">Sin empresas.</p>';
    const { filas: F, cargando } = filas592(), ej = ejercicio(), ic = { ok: '🟢', ko: '🔴', aviso: '🟡', nd: '⚪' }, k = (x) => F.filter((f) => f.est[0] === x).length, num = (v) => (v === null || v === undefined ? '—' : nfm(v));
    return `<section class="dsec"><h3>Conciliación mod 592 · impuesto de envases de plástico no reutilizables · ${ej}</h3>
      <p class="dash-s" style="font-size:.8rem">${ic.ok} ${k('ok')} cuadran · ${ic.ko} ${k('ko')} con diferencia · ${ic.aviso} ${k('aviso')} pendientes o sin movimientos${cargando ? ' · ⏳ cargando los movimientos de alguna empresa…' : ''}</p>
      <div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>Periodo</th><th>Movimientos</th><th>Cuota acumulada calculada</th><th>Cuota acumulada presentada</th><th>A ingresar calculado</th><th>A ingresar presentado</th><th>Diferencia</th><th></th><th>Estado</th></tr></thead><tbody>
      ${F.map((x) => `<tr><td>${esc(x.e.nombre)}</td><td>${x.per} ${ej}</td><td class="n">${x.mov}</td><td class="n">${num(x.calcCuota)}</td><td class="n">${num(x.pCuota)}</td><td class="n">${num(x.calcRes)}</td><td class="n">${num(x.pRes)}</td><td class="n">${num(x.dRes)}</td><td style="text-align:center">${ic[x.est[0]]}</td><td>${esc(x.est[1])}</td></tr>`).join('') || '<tr><td colspan="10" class="vacio">Sin periodos del 592 en este ejercicio (el modelo solo está activado para Herogra Fertilizantes, Herogra Especiales y Lysur).</td></tr>'}</tbody></table></div>
      <p class="hint">Calculado = el mismo cálculo de la pestaña «Modelo 592» con el libro registro AIC y la contabilidad de fabricantes cargados de cada empresa. Presentado = la cuota y el total a ingresar del 592 en «Impuestos presentados». Cuadra si el total a ingresar difiere en 1 € o menos. Esta pestaña solo lee: no cambia ningún dato.</p></section>`;
  }
  const tabs = {
    modintra: ['Intrastat', 'Fichero AEAT', vistaIntra],
    c349i: ['Conciliación 349 - Intrastat', 'Bienes · por mes y factura', vistaIntraConc],
    mod592: ['Modelo 592', 'Envases de plástico', vista592],
    c592: ['Conciliación mod 592', 'Calculado frente a presentado', vistaC592],
    c583: ['Conciliación mod 583', 'Calculado frente a presentado', vistaC583],
    moda22: ['Modelo A22', 'Devoluciones plástico', vistaA22],
    mod232: ['Modelo 232', 'Operaciones vinculadas', vista232],
    mod583: ['Modelo 583', 'Producción energía eléctrica', vista583],
  };
  // Importe (valor) de expediciones e introducciones de los datos de Intrastat ya cargados, de los meses dados (1-12) del ejercicio; null si no hay nada cargado en esos meses
  const intraImportes = (ej, meses, rep, sop, cargar = false) => { // rep y sop = libros de IVA emitidas y recibidas: con ellos se reparte cada línea entre expediciones e introducciones igual que la conciliación con el 349
    if (!BIG.get(`intra|${S.sel}`)?.datos) { if (cargar) datosIntra(); return null; } // cargar: Inicio pide los datos del Intrastat si aún no están en memoria (se redibuja al llegar); las píldoras del menú no los piden
    const D = datosIntra(); if (!D) return null;
    const O = calcIntra(D, rep ?? [], sop ?? []).filter((o) => o.anio === ej && meses.includes(o.mes));
    if (!O.length) return null;
    const s = (fl) => r2(O.filter((o) => o.flujoConc === fl).reduce((a, o) => a + o.impConc, 0)); // mismo importe que «Intrastat (valor facturado)» de la conciliación
    return { exp: s('Expedición'), int: s('Introducción'), n: O.length };
  };
  // datos para Conciliaciones fiscales › Análisis Diferencias (583, 592 e Intrastat por mes); null mientras cargan
  const adif = {
    tiene583: () => S.registros.some((r) => r.tipo === 'm583' && r.empresa_id === S.sel),
    c583: (ej) => { const M = grande('may-mov'); return M ? calc583(ej, M) : null; },
    tiene592: () => obl592(empresa()),
    c592: (ej, per) => { const cur = big('m592-mov', () => ({ fab: [], aic: [] })); return cur ? calc592De(datos592(), { fab: cur.datos.fab ?? [], aic: cur.datos.aic ?? [] }, String(ej), per) : null; },
    intra: (ej) => {
      const D = datosIntra(), E = grande('fact-E'), R = grande('fact-R'); if (!D || !E || !R) return null;
      const O = calcIntra(D, E, R).filter((o) => o.anio === ej);
      return (mes, fl) => r2(O.filter((o) => o.mes === mes && o.flujoConc === fl).reduce((s, o) => s + o.impConc, 0));
    },
  };
  // ---------- Chips del menú: a ingresar / a devolver / sin importe, con lo que ya está cargado (sin pedir datos pesados) ----------
  const chipImp = (v, pre) => {
    const p = pre ? pre + ' · ' : '';
    if (v === null || v === undefined || Number.isNaN(+v) || Math.abs(+v) < 0.005) return { t: p + 'Sin importe' };
    return { t: p + (v > 0 ? 'A ingresar ' : 'A devolver ') + eur(Math.abs(v)), c: v > 0 ? 'amar' : 'verde' };
  };
  const badges = {
    mod583: () => {
      if (!S.sel) return { t: 'Por empresa' };
      const R = calc583(ejercicio(), null);
      return R.inst.some((x) => x.q.some((v) => v)) ? chipImp(R.tot(R.per), R.per) : { t: 'Sin datos' };
    },
    mod592: () => {
      if (!S.sel) return { t: 'Por empresa' };
      const cur = BIG.get(`m592-mov|${S.sel}`);
      if (!cur?.datos) return { t: 'Sin datos' };
      const mov = { fab: cur.datos.fab ?? [], aic: cur.datos.aic ?? [] };
      return chipImp(calc592De(datos592(), mov, String(S.ejercicio), S.periodo ?? '').res);
    },
    moda22: () => {
      if (!S.sel) return { t: 'Por empresa' };
      const L = a22Datos().filas.filter((r) => !r.per || String(r.per).includes(String(S.ejercicio)));
      const imp = r2(L.reduce((a, r) => a + (parseNum(r.imp) || 0), 0));
      return L.length ? { t: `A devolver ${eur(imp)}`, c: 'verde' } : { t: 'Sin datos' };
    },
    mod232: () => {
      if (!S.sel) return { t: 'Por empresa' };
      const ej = m232EjDef(), D = m232Reg(ej), tot = r2((D.filas ?? []).reduce((a, f) => a + Math.abs(parseNum(f.imp) || 0), 0));
      return D.filas?.length ? { t: `${ej} · ${D.filas.length} reg. · ${eur(tot)}`, c: 'amar' } : { t: 'Sin datos' };
    },
    modintra: () => {
      if (!S.sel) return { t: 'Por empresa' };
      const cur = BIG.get(`intra|${S.sel}`);
      if (!cur?.datos) return { t: 'Sin datos' };
      const ej = ejercicio(), n = (cur.datos.rows ?? []).filter((r) => fechaUtc(r[0])?.getUTCFullYear() === ej).length;
      // importe del periodo elegido: suma de expediciones e introducciones (informativo, no se paga)
      const ms = /^\d\d$/.test(S.periodo ?? '') ? [+S.periodo] : /^[1-4]T$/.test(S.periodo ?? '') ? [0, 1, 2].map((i) => (+S.periodo[0] - 1) * 3 + i + 1) : Array.from({ length: 12 }, (_, i) => i + 1), im = intraImportes(ej, ms, grande('fact-E') ?? [], grande('fact-R') ?? []);
      // la píldora dice lo que dice el modelo: los importes de las dos declaraciones (expedición e introducción) de los ficheros, sin sumarlas (son declaraciones distintas)
      const Dp = datosIntra(), Op = Dp ? calcIntra(Dp, grande('fact-E') ?? [], grande('fact-R') ?? []).filter((o) => o.anio === ej && ms.includes(o.mes) && o.incluir === 1) : [];
      if (Op.length) { const fv = (o) => (o.flujoF !== o.flujo ? Math.abs(o.valor) : o.valor), sf = (fl) => r2(Op.filter((o) => o.flujoF === fl).reduce((a, o) => a + fv(o), 0)); return { t: `E ${eur(sf('Expedición'))} · I ${eur(sf('Introducción'))}`, c: 'amar' }; }
      if (im) return { t: eur(r2(im.exp + im.int)), c: 'amar' };
      return n ? { t: `${n} líneas ${ej}`, c: 'amar' } : { t: 'Sin datos' };
    },
  };
  return { tabs, kinds, acciones, adif, badges, intraIngesta, oblIntE, intraImportes, importe592 };
}
