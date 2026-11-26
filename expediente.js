// Expediente del cierre: en una hoja, lo comprobado, presentado, conciliado y comentado de la empresa elegida en un mes o trimestre. Se saca en PDF o Excel.
// Pestaña nueva que solo LEE: no guarda nada ni cambia ninguna otra pestaña.
export function crearExpediente({ S, esc, render, empresa, obDelMes, estadoOb, hoyUtc, cierre, resumenConc, resumenIntra, tituloTab }) {
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const E = { per: '', prep: '', rev: '' };
  const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
  const fdia = (ms) => new Date(ms).toISOString().slice(0, 10).split('-').reverse().join('/');
  const trim = () => empresa()?.tipo === 'PYME';
  const periodos = () => (trim() ? ['1T', '2T', '3T', '4T'] : MES.map((_, i) => String(i + 1).padStart(2, '0')));
  const nomPer = (p) => (/T$/.test(p) ? `${p[0]}.º trimestre` : MES[+p - 1]);
  const perDef = () => { const d = new Date(), actual = Number(S.ejercicio) === d.getFullYear(); // lo que se está cerrando: el periodo anterior al actual
    if (trim()) return `${actual ? Math.max(1, Math.ceil((d.getMonth() + 1) / 3) - 1) : 4}T`; return String(actual ? Math.max(1, d.getMonth()) : 12).padStart(2, '0'); };
  const perSel = () => (periodos().includes(E.per) ? E.per : perDef());
  const mesesDe = (p) => (/T$/.test(p) ? [1, 2, 3].map((k) => String((+p[0] - 1) * 3 + k).padStart(2, '0')) : [p]);

  // archivos presentados que corresponden a una obligación (justificantes subidos en Impuestos Presentados)
  const justificantes = (o) => {
    const mods = [String(o.mod), String(o.clave)], pers = [String(o.per), String(o.pk)];
    return [...new Set(S.registros.filter((r) => ['pres', 'prspdf'].includes(r.tipo) && r.empresa_id === S.sel && Number(r.ejercicio) === Number(o.yPres)
      && mods.includes(String(r.datos?.modelo ?? '')) && pers.includes(String(r.datos?.periodo ?? ''))).map((r) => r.datos?.archivo?.nombre ?? r.datos?.nombre).filter(Boolean))];
  };
  const ESTADO = { ok: ['ok', 'Presentado'], venc: ['ko', 'Vencido sin presentar'], pron: ['wa', 'Vence en 7 días'], fut: ['nd', 'En plazo'] };
  const NOTA = { ok: 'Cargado', ko: 'Descuadre', aviso: 'Pendiente', nd: '—' };

  // reúne los datos del expediente (los mismos para la pantalla, el PDF y el Excel)
  function datos() {
    const emp = empresa(), ej = Number(S.ejercicio), per = perSel(), meses = mesesDe(per), hoy = hoyUtc();
    cierre.resumir(emp).then((hizo) => { if (hizo) render(); });
    const porMes = meses.map((mm) => cierre.comprobar(emp, mm));
    const comprob = porMes[0].it.slice(0, 8).map((x, i) => ({ nombre: x[0], cel: porMes.map((c) => ({ st: c.it[i][1], txt: c.it[i][2] || NOTA[c.it[i][1]] })) }));
    const vistos = new Set();
    const modelos = meses.flatMap((mm) => obDelMes(emp, ej, mm)).filter((o) => { const k = `${o.mod}|${o.per}|${o.yP}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
      .map((o) => { const st = estadoOb(o, hoy); return { mod: o.mod, per: o.per === 'A' || o.per === '0A' ? `Anual ${o.yP}` : `${o.per}/${o.yP}`, fin: fdia(o.fin), imp: o.imp, just: justificantes(o), st }; })
      .sort((a, b) => String(a.mod).localeCompare(String(b.mod)));
    let conc = null, cargando = false;
    try {
      const a = resumenConc(per), b = resumenIntra(meses.map(Number));
      if (a === null || b === null) cargando = true; else conc = [...a, ...b];
    } catch (err) { conc = []; console.error('Expediente: conciliaciones', err); }
    const notas = Object.values(S.registros.find((r) => r.tipo === 'explic' && r.empresa_id === S.sel)?.datos?.notas ?? {})
      .filter((n) => String(n.ej ?? '') === String(ej) && (!n.per || n.per === per || meses.includes(String(n.per))))
      .map((n) => ({ tab: tituloTab(n.tab), linea: n.r ?? '', texto: n.t ?? '', estado: n.e === 'x' ? 'Explicada' : 'Pendiente', fecha: n.f ?? '' }));
    return { emp, ej, per, meses, comprob, modelos, conc, cargando, notas, leyendo: cierre.cargando(emp) };
  }
  const pil = (c, t) => `<span class="ex-p ex-${c}">${esc(t)}</span>`;
  const ST_CEL = { ok: 'ok', ko: 'ko', aviso: 'wa', nd: 'nd' };
  function cuerpo(D) {
    const t = (cab, filas, vacio) => (filas.length ? `<div class="wrap"><table class="tabla ex-t"><thead><tr>${cab.map(([c, n]) => `<th${n ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>` : `<p class="hint">${vacio}</p>`);
    return `<h4>1. Comprobaciones${D.leyendo ? ' · leyendo los libros…' : ''}</h4>
      ${t([['Comprobación'], ...D.meses.map((m) => [MES[+m - 1]])], D.comprob.map((c) => `<tr><td>${esc(c.nombre)}</td>${c.cel.map((x) => `<td>${pil(ST_CEL[x.st], x.txt)}</td>`).join('')}</tr>`), 'Sin comprobaciones.')}
      <h4>2. Modelos del periodo</h4>
      ${t([['Modelo'], ['Periodo'], ['Plazo hasta'], ['Importe', 1], ['Justificante'], ['Estado']], D.modelos.map((m) => `<tr><td>${esc(m.mod)}</td><td>${esc(m.per)}</td><td>${m.fin}</td><td class="num">${fmt(m.imp)}</td><td>${m.just.length ? m.just.map(esc).join('<br>') : '—'}</td><td>${pil(...ESTADO[m.st])}</td></tr>`), 'Ningún modelo en este periodo.')}
      <h4>3. Conciliaciones</h4>
      ${D.cargando ? '<p class="hint">⏳ Cargando los libros para conciliar…</p>' : t([['Control'], ['Periodo'], ['Frente a'], ['Importe', 1], ['Contra'], ['Importe', 1], ['Diferencia', 1], ['Estado']], (D.conc ?? []).map((c) => `<tr><td>${esc(c.control)}</td><td>${esc(c.per)}</td><td>${esc(c.na)}</td><td class="num">${fmt(c.a)}</td><td>${esc(c.nb)}</td><td class="num">${fmt(c.b)}</td><td class="num">${fmt(c.d)}</td><td>${pil(c.st, c.txt)}</td></tr>`), 'No hay datos que conciliar en este periodo.')}
      <h4>4. Comentarios y diferencias explicadas</h4>
      ${t([['Pestaña'], ['Línea'], ['Comentario'], ['Estado'], ['Fecha']], D.notas.map((n) => `<tr><td>${esc(n.tab)}</td><td>${esc(n.linea)}</td><td>${esc(n.texto)}</td><td>${pil(n.estado === 'Explicada' ? 'ok' : 'wa', n.estado)}</td><td>${esc(n.fecha)}</td></tr>`), 'Sin comentarios en este periodo (se escriben con el botón 💬 de las conciliaciones).')}`;
  }
  const CSS = `.ex-p{padding:1px 8px;border-radius:8px;font-size:.78rem;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ex-ok{background:#e6f4ea;color:#137333}.ex-ko{background:#fce8e6;color:#a50e0e}.ex-wa{background:#fef7e0;color:#8a5a00}.ex-nd{background:#eef0f4;color:#5b6475}`;
  const firmas = () => `<div class="ex-firmas" style="display:flex;gap:40px;flex-wrap:wrap;margin-top:28px"><span>Preparado por: ${esc(E.prep) || '______________________'}</span><span>Revisado por: ${esc(E.rev) || '______________________'}</span><span>Fecha: ____ / ____ / ______</span></div>`;

  function vista() {
    if (!S.sel) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
    const D = datos();
    return `<style>${CSS}.ex-t{width:100%}.ex-sec h4{margin:16px 0 6px}</style><section class="dsec ex-sec"><h3>Expediente de cierre · ${esc(D.emp.nombre)}</h3>
      <div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label>Periodo <select data-exped="per">${periodos().map((p) => `<option value="${p}"${p === D.per ? ' selected' : ''}>${nomPer(p)} ${D.ej}</option>`).join('')}</select></label>
        <label>Preparado por <input data-exped="prep" value="${esc(E.prep)}" size="18"></label><label>Revisado por <input data-exped="rev" value="${esc(E.rev)}" size="18"></label>
        <button class="small primary" data-exped-act="pdf"${D.cargando || D.leyendo ? ' disabled' : ''}>Sacar PDF</button><button class="small" data-exped-act="xls"${D.cargando || D.leyendo ? ' disabled' : ''}>Descargar Excel</button></div>
      ${cuerpo(D)}${firmas()}
      <p class="hint">El expediente es una foto de lo que hay cargado ahora. Guarda el PDF cuando cierres el periodo. Esta pestaña solo lee: no cambia ningún dato.</p></section>`;
  }
  const nombreFich = (D) => `Expediente ${String(D.emp.siglas || D.emp.nombre).replace(/[\\/:*?"<>|]/g, '')} ${D.per} ${D.ej}`;
  function pdf() {
    const D = datos(), w = window.open('', '_blank');
    if (!w) { alert('El navegador ha bloqueado la ventana del PDF. Permite las ventanas emergentes de esta página.'); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(nombreFich(D))}</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px Arial,sans-serif;color:#111;margin:0}h2{margin:0 0 2px;font-size:17px}h4{margin:14px 0 4px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #c9ced8;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eef0f4;-webkit-print-color-adjust:exact;print-color-adjust:exact}.num{text-align:right;white-space:nowrap}tr{page-break-inside:avoid}${CSS}</style></head><body>
      <h2>Expediente de cierre · ${esc(D.emp.nombre)}</h2><div>${esc(D.emp.cif ?? '')} · ${nomPer(D.per)} ${D.ej} · generado el ${new Date().toLocaleString('es-ES')}</div>${cuerpo(D)}${firmas()}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  function excel() {
    const X = window.XLSX; if (!X) { alert('No se cargó la librería de Excel. Recarga la página.'); return; }
    const D = datos(), wb = X.utils.book_new(), hoja = (n, a) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(a), n);
    hoja('Comprobaciones', [[`Expediente de cierre · ${D.emp.nombre} · ${nomPer(D.per)} ${D.ej}`], ['Preparado por', E.prep], ['Revisado por', E.rev], ['Generado', new Date().toLocaleString('es-ES')], [], ['Comprobación', ...D.meses.map((m) => MES[+m - 1])], ...D.comprob.map((c) => [c.nombre, ...c.cel.map((x) => x.txt)])]);
    hoja('Modelos', [['Modelo', 'Periodo', 'Plazo hasta', 'Importe', 'Justificante', 'Estado'], ...D.modelos.map((m) => [m.mod, m.per, m.fin, m.imp ?? '', m.just.join(' · '), ESTADO[m.st][1]])]);
    hoja('Conciliaciones', [['Control', 'Periodo', 'Frente a', 'Importe', 'Contra', 'Importe', 'Diferencia', 'Estado'], ...(D.conc ?? []).map((c) => [c.control, c.per, c.na, c.a ?? '', c.nb, c.b ?? '', c.d ?? '', c.txt])]);
    hoja('Comentarios', [['Pestaña', 'Línea', 'Comentario', 'Estado', 'Fecha'], ...D.notas.map((n) => [n.tab, n.linea, n.texto, n.estado, n.fecha])]);
    X.writeFile(wb, `${nombreFich(D)}.xlsx`);
  }
  document.addEventListener('change', (ev) => { const k = ev.target.dataset?.exped; if (!k) return; E[k] = ev.target.value; if (k === 'per') render(); });
  document.addEventListener('input', (ev) => { const k = ev.target.dataset?.exped; if (k === 'prep' || k === 'rev') E[k] = ev.target.value; });
  document.addEventListener('click', (ev) => { const b = ev.target.closest?.('[data-exped-act]'); if (!b) return; if (b.dataset.expedAct === 'pdf') pdf(); else excel(); });

  return { tabs: { exped: ['Expediente de cierre', 'PDF y Excel del periodo', vista] } };
}
