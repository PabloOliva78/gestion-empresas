// Cierre del mes (bloque 1): lista de comprobación por empresa y mes + semáforo del grupo. Pestaña nueva; no modifica ninguna otra.
// Solo LEE datos (libros de IVA, SII, mayor, nóminas y modelos presentados) y los cuenta; no guarda nada.
export function crearCierre({ db, S, esc, render, empOrden, obDelMes, estadoOb, hoyUtc, conciliar, empresa }) {
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MM12 = MES.map((_, i) => String(i + 1).padStart(2, '0'));
  const E = { mes: '', resumen: new Map(), cargando: new Set(), todas: false, prog: '', error: '' };
  const clave = (id) => `${id}|${S.ejercicio}`;
  const mesDef = () => { const d = new Date(); return Number(S.ejercicio) === d.getFullYear() ? String(Math.max(1, d.getMonth())).padStart(2, '0') : '12'; }; // el mes que se cierra: el anterior al actual
  const mesSel = () => E.mes || mesDef();

  async function leerLibro(eid, tipo) {
    const { data, error } = await db.from('registros').select('datos').eq('empresa_id', eid).eq('tipo', tipo).order('id').limit(1).maybeSingle();
    if (error) throw new Error(`${tipo}: ${error.message}`);
    return data?.datos?.filas ?? [];
  }
  // cuenta, mes a mes, lo que hay cargado de una empresa en el ejercicio (no se guardan las filas, solo los recuentos)
  async function resumir(emp) {
    const ej = Number(S.ejercicio), k = clave(emp.id);
    if (E.resumen.has(k) || E.cargando.has(k)) return false;
    E.cargando.add(k);
    try {
      const [fE, fR, sE, sR, may] = [await leerLibro(emp.id, 'fact-E'), await leerLibro(emp.id, 'fact-R'), await leerLibro(emp.id, 'sii-E'), await leerLibro(emp.id, 'sii-R'), await leerLibro(emp.id, 'may-mov')];
      const out = {};
      MM12.forEach((mm) => {
        const ym = `${ej}-${mm}`, cuenta = (L) => L.filter((x) => x.ej === ej && x.per === mm).length;
        const r = { E: cuenta(fE), R: cuenta(fR), sE: cuenta(sE), sR: cuenta(sR), M: may.filter((l) => String(l.fecha ?? '').slice(0, 7) === ym).length, cE: null, cR: null };
        try { if (r.E && r.sE) r.cE = conciliar('E', fE, sE, ej, mm).cuadra; } catch { /* sin datos */ }
        try { if (r.R && r.sR) r.cR = conciliar('R', fR, sR, ej, mm).cuadra; } catch { /* sin datos */ }
        out[mm] = r;
      });
      E.resumen.set(k, out);
    } catch (err) { E.error = `${emp.nombre}: ${err.message}`; E.resumen.set(k, null); } // null = no se pudo leer (no se reintenta solo)
    E.cargando.delete(k);
    return true;
  }
  async function revisarTodas() {
    if (E.todas) return;
    E.todas = true; E.error = '';
    const lista = empOrden();
    for (let i = 0; i < lista.length; i++) { E.prog = `Revisando ${i + 1} de ${lista.length}: ${lista[i].nombre}…`; render(); await resumir(lista[i]); }
    E.todas = false; E.prog = ''; render();
  }

  const nominas = (emp, ej, mm) => {
    const r = S.registros.filter((x) => x.tipo === 'nominas' && x.empresa_id === emp.id && x.ejercicio === ej).sort((a, b) => Object.keys(b.datos ?? {}).length - Object.keys(a.datos ?? {}).length)[0];
    return Object.keys(r?.datos?.[mm] ?? {}).length > 0;
  };
  // estado de cada comprobación: ok · ko · aviso (algo pendiente) · nd (sin revisar / no aplica)
  function comprobar(emp, mm) {
    const ej = Number(S.ejercicio), hoy = hoyUtc();
    const R = E.resumen.get(clave(emp.id))?.[mm]; // undefined si aún no se ha revisado
    const obs = obDelMes(emp, ej, mm).map((o) => ({ o, st: estadoOb(o, hoy) }));
    const venc = obs.filter((x) => x.st === 'venc'), pend = obs.filter((x) => x.st !== 'ok');
    const lib = (n, t) => (!R ? ['nd', 'sin revisar'] : n ? ['ok', `${n} ${t}`] : ['aviso', 'sin datos']);
    const conc = (c) => (!R ? ['nd', 'sin revisar'] : c === null ? ['nd', 'sin datos para cotejar'] : c ? ['ok', 'cuadra'] : ['ko', 'descuadre']);
    const it = [
      ['Libro IVA emitidas', ...lib(R?.E, 'facturas')],
      ['Libro IVA recibidas', ...lib(R?.R, 'facturas')],
      ['SII emitidas cargado', ...lib(R?.sE, 'facturas')],
      ['SII recibidas cargado', ...lib(R?.sR, 'facturas')],
      ['Conciliación SII–libro emitidas', ...conc(R?.cE)],
      ['Conciliación SII–libro recibidas', ...conc(R?.cR)],
      ['Mayor contable cargado', ...(!R ? ['nd', 'sin revisar'] : R.M ? ['ok', `${R.M} apuntes`] : ['aviso', 'sin apuntes'])],
      ['Nóminas del mes', ...(nominas(emp, ej, mm) ? ['ok', 'cargadas'] : ['aviso', 'sin nóminas'])],
      ['Modelos del periodo', ...(!obs.length ? ['nd', 'ninguno'] : venc.length ? ['ko', `${venc.length} vencido(s) sin presentar`] : pend.length ? ['aviso', `${pend.length} pendiente(s)`] : ['ok', `${obs.length} presentado(s)`])],
    ];
    const t = it.map((x) => x[1]);
    return { it, obs, venc, pend, global: t.includes('ko') ? 'ko' : t.includes('aviso') ? 'aviso' : t.every((x) => x === 'ok' || x === 'nd') && t.includes('ok') ? (R ? 'ok' : 'nd') : 'nd' };
  }
  const ic = { ok: '<span class="d-ok">✓</span>', ko: '<span class="d-ko">✖</span>', aviso: '<span style="color:#8a6d00">●</span>', nd: '<span class="d-nd">•</span>' };
  const luz = (g) => ({ ok: '🟢', ko: '🔴', aviso: '🟡', nd: '⚪' })[g];

  function vista() {
    if (!S.empresas.length) return '<p class="vacio">Sin empresas.</p>';
    const ej = Number(S.ejercicio), mm = mesSel(), emp = S.sel ? empresa() : null, lista = empOrden();
    if (emp) resumir(emp).then((hizo) => { if (hizo) render(); });
    const filas = lista.map((e) => {
      const c = comprobar(e, mm), cel = (i) => `<td title="${esc(c.it[i][2])}" style="text-align:center">${ic[c.it[i][1]]}</td>`;
      return `<tr${e.id === S.sel ? ' style="outline:2px solid #1f3864"' : ''}><td><b>${esc(e.nombre)}</b></td><td style="text-align:center;font-size:1rem">${luz(c.global)}</td>${[0, 1, 2, 3, 4, 5, 6, 7].map(cel).join('')}
        <td title="${esc(c.it[8][2])}">${ic[c.it[8][1]]} ${esc(c.it[8][2])}</td></tr>`;
    }).join('');
    const alertas = lista.map((e) => ({ e, c: comprobar(e, mm) })).filter((x) => x.c.venc.length).map((x) => `<li><b>${esc(x.e.nombre)}</b>: ${x.c.venc.map((v) => `${esc(v.o.mod)} ${esc(v.o.per)}`).join(', ')}</li>`).join('');
    const detalle = emp ? (() => {
      const c = comprobar(emp, mm), cargando = E.cargando.has(clave(emp.id));
      return `<section class="dsec"><h3>${esc(emp.nombre)} · ${MES[+mm - 1]} ${ej} ${luz(c.global)}</h3>
        ${cargando ? '<p class="dash-s">⏳ Leyendo los libros de esta empresa…</p>' : ''}
        <div class="wrap"><table class="tabla"><thead><tr><th>Comprobación</th><th></th><th>Detalle</th></tr></thead><tbody>
        ${c.it.map((x) => `<tr><td>${esc(x[0])}</td><td style="text-align:center">${ic[x[1]]}</td><td>${esc(x[2])}</td></tr>`).join('')}</tbody></table></div>
        ${c.obs.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Modelo</th><th>Periodo</th><th>Plazo hasta</th><th>Estado</th></tr></thead><tbody>${c.obs.map(({ o, st }) => `<tr><td>${esc(o.mod)}</td><td>${esc(o.per)}/${o.yP}</td><td>${new Date(o.fin).toISOString().slice(0, 10).split('-').reverse().join('/')}</td><td>${st === 'ok' ? '<span class="d-ok">✓ Presentado</span>' : st === 'venc' ? '<span class="d-ko">✖ Vencido sin presentar</span>' : st === 'pron' ? '<span style="color:#8a6d00">● Vence en 7 días</span>' : '<span class="d-nd">○ En plazo</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
    })() : '<p class="hint">Elige una empresa en el desplegable para ver su lista de cierre detallada.</p>';
    return `<div class="inicio"><section class="dsec"><h3>Cierre del mes · <select data-cierre="mes">${MES.map((n, i) => `<option value="${MM12[i]}"${MM12[i] === mm ? ' selected' : ''}>${n}</option>`).join('')}</select> de ${ej}</h3>
      <p class="dash-s" style="font-size:.8rem">🟢 todo en orden · 🟡 falta algo por cargar o presentar · 🔴 descuadre o modelo vencido · ⚪ sin revisar</p>
      <p><button class="small" data-cierre-act="todas"${E.todas ? ' disabled' : ''}>🔍 Revisar los libros de todas las empresas</button> <button class="small" data-cierre-act="limpiar"${E.todas ? ' disabled' : ''}>↻ Olvidar lo revisado</button> ${E.prog ? `<span class="dash-s">⏳ ${esc(E.prog)}</span>` : ''}</p>
      ${E.error ? `<p class="d-ko" style="font-size:.85rem">✖ ${esc(E.error)}</p>` : ''}
      ${alertas ? `<div class="aviso-cierre"><b>🔴 Modelos vencidos sin presentar</b><ul style="margin:.2rem 0 0 1.1rem">${alertas}</ul></div>` : ''}
      <div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th></th><th title="Libro IVA emitidas">Emit.</th><th title="Libro IVA recibidas">Recib.</th><th title="SII emitidas">SII E</th><th title="SII recibidas">SII R</th><th title="Conciliación SII–libro emitidas">Conc. E</th><th title="Conciliación SII–libro recibidas">Conc. R</th><th title="Mayor contable">Mayor</th><th title="Nóminas del mes">Nóm.</th><th>Modelos</th></tr></thead><tbody>${filas}</tbody></table></div></section>
      ${detalle}
      <p class="hint">Los modelos y las nóminas se comprueban al momento. Los libros (IVA, SII y mayor) se leen de la base de datos al pulsar «Revisar los libros de todas las empresas» (la empresa elegida se lee sola). Los modelos que dependen de datos del libro (115, 123, 349) solo se detectan de las demás empresas si se ha abierto antes su libro. Esta pestaña solo lee: no cambia ningún dato.</p></div>`;
  }

  document.addEventListener('change', (ev) => { if (ev.target.dataset?.cierre === 'mes') { E.mes = ev.target.value; render(); } });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-cierre-act]'); if (!b) return;
    if (b.dataset.cierreAct === 'todas') revisarTodas();
    else if (b.dataset.cierreAct === 'limpiar') { E.resumen.clear(); E.error = ''; render(); }
  });

  return { tabs: { cierre: ['Cierre del mes', 'Lista de comprobación y semáforo', vista] } };
}
