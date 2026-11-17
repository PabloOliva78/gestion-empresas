// Bloque 10 · Revisión factura AEAT: se deja el PDF de una factura, se lee en el navegador y se analiza frente a la Ley del IVA, el Reglamento de facturación
// y las reglas del SII (motor por reglas en revfactura-motor.js). La factura NO se guarda ni se sube: solo vive en memoria mientras la pestaña está abierta
// y se borra al salir de ella (app.js llama a limpiar() cada vez que se dibuja otra pestaña).
import { analizarFactura } from './revfactura-motor.js?v=3';
import { leerFactura } from './revfactura-lector.js?v=1';

export function crearRevFactura({ S, esc, render, empresa, cargarOcr }) {
  const ST = { res: null, nombre: '', texto: '', libro: '', msg: '', cargando: false, diag: '', estado: '' };
  const limpiar = () => { if (ST.res || ST.texto || ST.nombre || ST.msg) { ST.res = null; ST.texto = ''; ST.nombre = ''; ST.msg = ''; ST.cargando = false; ST.diag = ''; ST.estado = ''; } };
  const nf = (v, d = 2) => (v === null || v === undefined || v === '' ? '—' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }).format(+v));
  const ICO = { error: '✖', aviso: '⚠', info: 'ℹ', ok: '✓' }, COL = { error: ['#b42318', '#fde2e2'], aviso: ['#8a6d00', '#fff0a8'], info: ['#1e3a8a', '#e3ecff'], ok: ['#1b7f3b', '#dcf3e4'] };

  function analizar() {
    const e = empresa();
    ST.res = analizarFactura(ST.texto, { empresa: e ? { nombre: e.nombre, cif: e.cif } : null, libro: ST.libro });
  }
  async function leer(file) {
    if (!file || !/\.(pdf|png|jpe?g|webp|bmp)$/i.test(file.name)) { ST.msg = 'Solo se admiten facturas en PDF o imagen (PNG, JPG).'; return render(); }
    limpiar(); ST.cargando = true; ST.nombre = file.name; render();
    try {
      const L = await leerFactura(file, { cargarOcr, aviso: (m) => { ST.estado = m; render(); } });
      ST.texto = L.texto; ST.diag = L.diag; analizar(); ST.msg = '';
      if (!ST.res.ok) ST.msg = `${ST.res.error} Lectura: ${L.diag}. Puedes pegar el texto de la factura en el cuadro de abajo.`;
    } catch (err) { ST.res = null; ST.msg = `No he podido leer el archivo: ${err.message}. Puedes pegar el texto de la factura en el cuadro de abajo.`; }
    ST.cargando = false; ST.estado = ''; render();
  }
  function pegado(txt) {
    limpiar(); ST.nombre = 'texto pegado'; ST.texto = String(txt || ''); ST.diag = 'texto pegado a mano';
    if (ST.texto.trim().length < 10) { ST.msg = 'Pega primero el texto de la factura.'; return render(); }
    analizar(); ST.msg = ST.res.ok ? '' : ST.res.error; render();
  }
  const fila = (k, v) => `<tr><th style="width:12em;text-align:left">${k}</th><td>${v || '<span style="color:#667085">no localizado</span>'}</td></tr>`;
  function vista() {
    const e = empresa(), R = ST.res, F = R?.F;
    const zona = `<div class="drop-sii-in no-print" data-dropfac="1" tabindex="0" role="button" style="margin-bottom:8px;padding:1.2rem;text-align:center;cursor:pointer"><b>${ST.cargando ? (ST.estado || 'Leyendo la factura…') : 'Suelta aquí la factura (PDF o imagen)'}</b> o haz clic para elegirlo.<br><small>Se lee en tu navegador, no se guarda ni se sube, y se borra al salir de esta pestaña.</small><input type="file" id="facIn" accept=".pdf,application/pdf,image/*" hidden></div>`;
    const barra = `<div class="bar"><label>La factura es <select data-facl="1"><option value="">Detectar sola${e ? ` (${esc(e.nombre)})` : ''}</option><option value="Emitidas"${ST.libro === 'Emitidas' ? ' selected' : ''}>Emitida (la expide la empresa)</option><option value="Recibidas"${ST.libro === 'Recibidas' ? ' selected' : ''}>Recibida (la recibe la empresa)</option></select></label><span class="space"></span>${ST.res || ST.nombre ? `<button class="small danger" data-facdel="1" title="Borra la factura y el análisis de la memoria">Quitar la factura ahora</button>` : ''}</div>`;
    let cuerpo = '';
    if (ST.msg) cuerpo += `<p class="hint" style="color:#b42318">${esc(ST.msg)}</p>`;
    if (R && !R.ok) cuerpo += `<p class="vacio">${esc(R.error)}</p>`;
    if (R?.ok) {
      const { errores, avisos } = R.resumen, S2 = R.SII;
      const orden = { error: 0, aviso: 1, info: 2, ok: 3 };
      cuerpo += `<p class="dash-s" style="font-size:.85rem"><b>${esc(ST.nombre)}</b> · ${errores ? `<b style="color:#b42318">${errores} error(es)</b>` : '<b style="color:#1b7f3b">sin errores</b>'} · ${avisos} aviso(s) · operación: <b>${esc(F.operacion)}</b>${F.libro ? ` · libro ${esc(F.libro)}` : ''}</p>
      <div class="rf-g"><section class="dsec"><h3>Qué revisaría la AEAT</h3><ul class="rf-l">${[...R.H].sort((a, b) => orden[a.nivel] - orden[b.nivel]).map((h) => `<li style="border-left:4px solid ${COL[h.nivel][0]};background:${COL[h.nivel][1]}"><b style="color:${COL[h.nivel][0]}">${ICO[h.nivel]}</b> ${esc(h.t)}${h.art ? ` <small>· ${esc(h.art)}</small>` : ''}</li>`).join('')}</ul></section>
      <section class="dsec"><h3>Cómo declararla en el SII</h3><table class="tabla rf-t"><tbody>${fila('Libro', esc(S2.libro))}${fila('Tipo de factura', esc(S2.tipoFactura))}${fila('Clave de régimen', esc(S2.clave))}${S2.tipoNoExenta ? fila('Sujeta / no exenta', esc(S2.tipoNoExenta)) : ''}${S2.causaExenta ? fila('Causa de exención', esc(S2.causaExenta)) : ''}${fila('Modelo 303', esc(S2.casillas303))}${S2.modelos.length ? fila('Otros modelos', esc(S2.modelos.join(' · '))) : ''}</tbody></table><p class="hint">${esc(S2.resumen)}</p>
      <h3 style="margin-top:.8rem">Líneas exentas</h3>${F.exentas?.length ? `<table class="tabla rf-t"><thead><tr><th>Línea</th><th>Precepto</th><th>Causa SII</th><th>Veredicto</th></tr></thead><tbody>${F.exentas.map((x) => { const c = x.v === 'incorrecta' ? COL.error : x.v === 'dudosa' ? COL.aviso : COL.ok; return `<tr><td>${esc(x.linea)}</td><td>${x.art ? `art. ${x.art}${x.apt ? `.Uno.${x.apt}º` : ''}` : '<span style="color:#667085">sin citar</span>'}</td><td>${esc(x.causa || '—')}</td><td style="background:${c[1]};color:${c[0]}"><b>${esc(x.v)}</b><br><small>${x.motivos.map(esc).join('<br>')}</small></td></tr>`; }).join('')}</tbody></table>` : '<p class="hint">No se detectan líneas exentas ni al 0 % en el texto leído.</p>'}
      <h3 style="margin-top:.8rem">Datos leídos</h3><table class="tabla rf-t"><tbody>${fila('Número', esc(F.numero))}${fila('Fecha', esc(F.fecha))}${fila('Expedidor', F.emisor ? `${esc(F.emisor.id)} (${esc(F.paisEmisor)})` : (F.paisEmisor ? esc(F.paisEmisor) : ''))}${fila('Destinatario', F.receptor ? `${esc(F.receptor.id)} (${esc(F.paisReceptor)})` : '')}${fila('Base imponible', F.base === null ? '' : `${nf(F.base)} ${esc(F.moneda)}`)}${F.baseGravada !== undefined ? fila('Base gravada', `${nf(F.baseGravada)} ${esc(F.moneda)}`) : ''}${fila('Tipo de IVA', F.tipo === null ? '' : `${nf(F.tipo, 1)} %`)}${fila('Cuota', F.cuota === null ? '' : nf(F.cuota))}${fila('Total', F.total === null ? '' : `${nf(F.total)} ${esc(F.moneda)}`)}${F.incoterm ? fila('Incoterm', esc(F.incoterm)) : ''}</tbody></table></section></div>`;
    }
    return `<div class="inicio rf"><section class="dsec"><h3>Revisión factura AEAT</h3>${zona}${barra}${cuerpo || '<p class="vacio">Deja una factura en PDF y te digo qué revisaría la AEAT y cómo se declara en el SII.</p>'}
      ${ST.texto ? `<details class="no-print" style="margin:.5rem 0"><summary>Texto leído de la factura (para revisar el OCR)${ST.diag ? ` · ${esc(ST.diag)}` : ''}</summary><pre style="white-space:pre-wrap;font-size:.75rem;max-height:22rem;overflow:auto">${esc(ST.texto)}</pre></details>` : ''}
      <details class="no-print" style="margin:.5rem 0"${ST.res && !ST.res.ok ? ' open' : ''}><summary>¿No la lee bien? Pega aquí el texto de la factura</summary><textarea id="facTxt" rows="6" style="width:100%;font-size:.8rem" placeholder="Abre el PDF, Ctrl+A, Ctrl+C y pega aquí con Ctrl+V"></textarea><div class="bar"><button class="small" data-factxt="1">Analizar este texto</button></div></details>
      <p class="hint">Análisis automático por reglas (Ley 37/1992 del IVA, Reglamento de facturación RD 1619/2012 y criterios del SII). Es orientativo: no sustituye la revisión de un profesional y no consulta VIES ni el censo. La factura no se guarda en ningún sitio: solo vive en la memoria de esta pestaña y se borra al salir de ella, al cambiar de empresa o al pulsar «Quitar la factura ahora».</p></section></div>`;
  }

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'facIn' && t.files?.[0]) { const f = t.files[0]; t.value = ''; return void leer(f); }
    if (t.dataset?.facl !== undefined) { ST.libro = t.value; if (ST.texto) { analizar(); render(); } }
    return undefined;
  });
  document.addEventListener('click', (ev) => {
    const z = ev.target.closest?.('[data-dropfac]'); if (z && !ev.target.closest('input')) return void document.getElementById('facIn')?.click();
    if (ev.target.closest?.('[data-facdel]')) { limpiar(); render(); }
    if (ev.target.closest?.('[data-factxt]')) pegado(document.getElementById('facTxt')?.value);
    return undefined;
  });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-dropfac]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => ev.target.closest?.('[data-dropfac]')?.classList.remove('over'));
  document.addEventListener('drop', (ev) => { const z = ev.target.closest?.('[data-dropfac]'); if (!z) return; ev.preventDefault(); z.classList.remove('over'); const f = ev.dataTransfer.files[0]; if (f) leer(f); });
  return { limpiar, tabs: { leyfac: ['Revisión factura AEAT', 'Analiza una factura frente a la Ley y el SII', vista] } };
}
