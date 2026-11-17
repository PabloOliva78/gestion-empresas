// Bloque 10 · Revisión factura AEAT: se deja el PDF de una factura, se lee en el navegador y se analiza frente a la Ley del IVA, el Reglamento de facturación
// y las reglas del SII (motor por reglas en revfactura-motor.js; informe completo en revfactura-fase.js). La factura NO se guarda ni se sube: solo vive en memoria
// mientras la pestaña está abierta y se borra al salir de ella (app.js llama a limpiar() cada vez que se dibuja otra pestaña).
// Solo se recuerdan en este navegador los datos de la empresa para el análisis (prorrata y si es revendedora), nunca la factura.
import { analizarFactura } from './revfactura-motor.js?v=6';
import { completarInforme, fmt } from './revfactura-fase.js?v=1';
import { leerFactura } from './revfactura-lector.js?v=4';

export function crearRevFactura({ S, esc, render, empresa, cargarOcr, esHabil }) {
  const ST = { res: null, nombre: '', texto: '', libro: '', msg: '', cargando: false, diag: '', estado: '', mini: '', fechaReg: '' };
  const limpiar = () => { if (ST.res || ST.texto || ST.nombre || ST.msg) { ST.res = null; ST.texto = ''; ST.nombre = ''; ST.msg = ''; ST.cargando = false; ST.diag = ''; ST.estado = ''; ST.mini = ''; ST.fechaReg = ''; } };
  const nf = (v, d = 2) => (v === null || v === undefined || v === '' ? '—' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }).format(+v));
  const ICO = { error: '✖', aviso: '⚠', info: 'ℹ', ok: '✓' }, COL = { error: ['#b42318', '#fde2e2'], aviso: ['#8a6d00', '#fff0a8'], info: ['#1e3a8a', '#e3ecff'], ok: ['#1b7f3b', '#dcf3e4'] };
  const SEV = { alta: COL.error, media: COL.aviso, baja: COL.info };
  const dmy = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

  // datos de la empresa para el análisis (por empresa, solo en este navegador)
  const cfgLeer = () => { try { return JSON.parse(localStorage.getItem('rfcfg') || '{}'); } catch { return {}; } };
  const cfgGuardar = (id, v) => { try { const c = cfgLeer(); c[id] = { ...(c[id] || {}), ...v }; localStorage.setItem('rfcfg', JSON.stringify(c)); } catch { /* sin almacenamiento */ } };
  const cfgDe = (id) => ({ prorrata: 100, revendedor: '', ...(cfgLeer()[id] || {}) });
  const idEfectivo = () => ST.res?.F?.empresaDet?.id ?? empresa()?.id;

  function analizar() {
    const e = empresa();
    const R = analizarFactura(ST.texto, { empresa: e ? { id: e.id, nombre: e.nombre, cif: e.cif } : null, grupo: (S.empresas || []).map((x) => ({ id: x.id, nombre: x.nombre, cif: x.cif })), libro: ST.libro });
    if (R.ok) { const c = cfgDe(R.F.empresaDet?.id ?? e?.id); completarInforme(R, ST.texto, { hoy: new Date(), esHabil, prorrata: c.prorrata, revendedor: c.revendedor, fechaReg: ST.fechaReg, empresaCambia: R.F.cambioEmpresa }); }
    ST.res = R;
  }
  async function leer(file) {
    if (!file || !/\.(pdf|png|jpe?g|webp|bmp)$/i.test(file.name)) { ST.msg = 'Solo se admiten facturas en PDF o imagen (PNG, JPG).'; return render(); }
    limpiar(); ST.cargando = true; ST.nombre = file.name; render();
    try {
      const L = await leerFactura(file, { cargarOcr, aviso: (m) => { ST.estado = m; render(); } });
      ST.texto = L.texto; ST.diag = L.diag; ST.mini = L.miniatura || ''; analizar(); ST.msg = '';
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
  const sec = (t, cuerpo, extra = '') => `<section class="dsec" style="margin-top:.7rem"${extra}><h3>${t}</h3>${cuerpo}</section>`;
  const num = (v, neg) => (v === null || v === undefined ? '—' : `<span${neg && Math.abs(v) > 0.005 ? ' style="color:#b42318;font-weight:600"' : ''}>${nf(v)}</span>`);

  function vistaConfig() {
    const e = empresa(), id = idEfectivo(), c = cfgDe(id), nom = ST.res?.F?.empresaDet?.nombre ?? e?.nombre ?? '—';
    return `<details class="no-print" style="margin:.5rem 0"${ST.res?.ok ? ' open' : ''}><summary><b>Datos de la empresa para el análisis</b> · ${esc(nom)} · prorrata ${esc(String(c.prorrata))} % · revendedora: ${c.revendedor === 'si' ? 'sí' : c.revendedor === 'no' ? 'no' : 'sin indicar'}</summary>
      <div class="bar" style="flex-wrap:wrap;gap:.6rem"><span>Periodicidad del 303: <b>mensual (obligada al SII)</b></span>
      <label>Prorrata <input type="number" min="0" max="100" step="1" value="${esc(String(c.prorrata))}" data-rfc="prorrata" style="width:5em"> %</label>
      <label>Revendedora habitual de móviles, consolas, portátiles o tablets <select data-rfc="revendedor"><option value=""${c.revendedor === '' ? ' selected' : ''}>No lo sé (doy los dos casos)</option><option value="si"${c.revendedor === 'si' ? ' selected' : ''}>Sí</option><option value="no"${c.revendedor === 'no' ? ' selected' : ''}>No</option></select></label>
      <label>Fecha de registro contable <input type="date" value="${esc(ST.fechaReg)}" data-rfc="fechaReg"></label></div>
      <p class="hint">La prorrata y lo de revendedora se recuerdan en este navegador para cada empresa; la fecha de registro solo vale para esta factura.</p></details>`;
  }

  function vistaInforme(R) {
    const F = R.F, X = R.X, S2 = R.SII, I = X.importes;
    const cab = `<p class="dash-s" style="font-size:.85rem"><b>${esc(ST.nombre)}</b> · operación: <b>${esc(F.operacion)}</b>${F.libro ? ` · libro ${esc(F.libro)}` : ''}${F.enGrupo && F.empresaDet ? ` · ${F.libro === 'Emitidas' ? 'emite' : 'va dirigida a'}: <b>${esc(F.empresaDet.nombre)}</b>${F.cambioEmpresa ? ' <span style="color:#8a6d00">(distinta de la elegida arriba)</span>' : ''}` : ''}</p>`;
    const ver = X.veredicto === 'OK' ? COL.ok : COL.error;
    const banner = `<div style="padding:.7rem 1rem;border-radius:8px;background:${ver[1]};color:${ver[0]};font-size:1.1rem"><b>${X.veredicto === 'OK' ? '✓ OK' : '✖ INCIDENCIAS'}</b> · ${X.incidencias.length} incidencia(s)${X.efectoTotal > 0.005 ? ` · efecto estimado <b>${fmt(X.efectoTotal)} €</b> de IVA` : ''}${X.sii?.vencido ? ' · <b>plazo del SII vencido</b>' : ''}</div>`;
    const lineas = X.lineas.length ? `<div style="overflow:auto"><table class="tabla rf-t"><thead><tr><th>Ref.</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Base</th><th>Tipo aplicado</th><th>Tipo correcto</th><th>Dif. IVA</th><th>Nota</th></tr></thead><tbody>${X.lineas.map((l) => { const dif = l.tipoA !== null && l.tipoC !== null ? Math.round(l.base * (l.tipoC - l.tipoA)) / 100 : null, mal = l.tipoA !== l.tipoC; return `<tr${mal ? ' style="background:#fde2e2"' : ''}><td>${esc(l.ref)}</td><td>${esc(l.desc)}</td><td>${l.cant === null ? '—' : esc(String(l.cant))}</td><td>${num(l.pu)}</td><td>${num(l.base)}</td><td>${l.tipoA === null ? '—' : `${l.tipoA} %`}</td><td>${l.isp ? 'ISP (sin IVA)' : l.tipoC === null ? '—' : `${l.tipoC} %`}</td><td>${num(dif, true)}</td><td><small>${esc(l.nota.join(' · '))}</small></td></tr>`; }).join('')}</tbody></table></div>${X.fiable ? '' : '<p class="hint" style="color:#8a6d00">No he leído todas las líneas: tabla orientativa (mira «Preguntas abiertas»).</p>'}` : '<p class="hint">No he podido separar las líneas de la factura.</p>';
    const incid = X.incidencias.length ? `<ul class="rf-l">${X.incidencias.map((i) => `<li style="border-left:4px solid ${SEV[i.sev][0]};background:${SEV[i.sev][1]}"><b style="color:${SEV[i.sev][0]}">${esc(i.sev.toUpperCase())}</b> ${esc(i.t)}${i.art ? ` <small>· ${esc(i.art)}</small>` : ''}${i.ef ? ` <b>· efecto ${fmt(i.ef)} €</b>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Sin incidencias.</p>';
    const hallazgosOk = R.H.filter((h) => h.nivel === 'ok' || h.nivel === 'info');
    const imp = `<table class="tabla rf-t"><thead><tr><th></th><th>Factura</th><th>Corregido</th><th>Diferencia</th></tr></thead><tbody>
      <tr><th style="text-align:left">Base imponible</th><td>${num(I.base)}</td><td>${num(I.baseC)}</td><td>${num(I.baseC !== null && I.base !== null ? Math.round((I.baseC - I.base) * 100) / 100 : null, true)}</td></tr>
      <tr><th style="text-align:left">IVA</th><td>${num(I.iva)}</td><td>${num(I.ivaC)}</td><td>${num(I.dif, true)}</td></tr>
      <tr><th style="text-align:left">Total</th><td>${num(I.total)}</td><td>${num(I.totalC)}</td><td>${num(I.totalC !== null && I.total !== null ? Math.round((I.totalC - I.total) * 100) / 100 : null, true)}</td></tr></tbody></table>
      <p class="hint">Calculado con ${esc(I.metodo)}.${I.ivaAutorrep ? ` IVA a autorrepercutir por ISP: <b>${fmt(I.ivaAutorrep)} €</b>.` : ''}${I.ivaDeducible !== null ? ` IVA deducible con prorrata del ${esc(String(I.pro))} %: <b>${fmt(I.ivaDeducible)} €</b>${I.ivaNoDed > 0.005 ? ` (no deducible ${fmt(I.ivaNoDed)} €, mayor gasto)` : ''}.` : ''}</p>${X.escenarios.length ? `<ul class="rf-l">${X.escenarios.map((s) => `<li style="border-left:4px solid ${COL.aviso[0]};background:${COL.aviso[1]}">${esc(s)}</li>`).join('')}</ul>` : ''}`;
    const sii = `<table class="tabla rf-t"><tbody>${fila('Libro', esc(S2.libro))}${fila('Tipo de factura', esc(S2.tipoFactura))}${fila('Clave de régimen', esc(S2.clave))}${S2.tipoNoExenta ? fila('Sujeta / no exenta', esc(S2.tipoNoExenta)) : ''}${S2.causaExenta ? fila('Causa de exención', esc(S2.causaExenta)) : ''}${X.desglose.length ? fila('Desglose (tipos correctos)', X.desglose.map((d) => (d.tipo === 'ISP' ? `ISP: base ${fmt(d.base)}` : `${esc(d.tipo)} %: base ${fmt(d.base)} · cuota ${fmt(d.cuota)}`)).join('<br>')) : ''}${X.sii ? fila('Fecha de la operación', dmy(X.sii.fechaOper)) + fila('Periodo del 303', esc(X.sii.periodo)) + fila('Plazo SII', `hasta el <b${X.sii.vencido ? ' style="color:#b42318"' : ''}>${dmy(X.sii.limite)}</b>${X.sii.vencido ? ' · <b style="color:#b42318">VENCIDO</b>' : ''}<br><small>día 16 del mes siguiente: ${dmy(X.sii.tope)}${X.sii.plazo4 ? ` · 4 días hábiles desde el registro: ${dmy(X.sii.plazo4)}` : ''}</small>`) : ''}${fila('Modelo 303', esc(S2.casillas303))}${S2.modelos.length ? fila('Otros modelos', esc(S2.modelos.join(' · '))) : ''}</tbody></table><p class="hint">${esc(S2.resumen)}</p>`;
    const exentas = F.exentas?.length ? `<table class="tabla rf-t"><thead><tr><th>Línea</th><th>Precepto</th><th>Causa SII</th><th>Veredicto</th></tr></thead><tbody>${F.exentas.map((x) => { const c = x.v === 'incorrecta' ? COL.error : x.v === 'dudosa' ? COL.aviso : COL.ok; return `<tr><td>${esc(x.linea)}</td><td>${x.art ? `art. ${x.art}${x.apt ? `.Uno.${x.apt}º` : ''}` : '<span style="color:#667085">sin citar</span>'}</td><td>${esc(x.causa || '—')}</td><td style="background:${c[1]};color:${c[0]}"><b>${esc(x.v)}</b><br><small>${x.motivos.map(esc).join('<br>')}</small></td></tr>`; }).join('')}</tbody></table>` : '<p class="hint">No se detectan líneas exentas ni al 0 % en el texto leído.</p>';
    const acc = `<ol>${X.acciones.map((a) => `<li>${esc(a.t)}${a.art ? ` <small>· ${esc(a.art)}</small>` : ''}${a.fecha ? ` <b>· ${esc(a.fecha)}</b>` : ''}</li>`).join('')}</ol>${X.asiento.length ? `<h4>Asiento propuesto (recibida)</h4><table class="tabla rf-t"><thead><tr><th>Cuenta</th><th>Concepto</th><th>Debe</th><th>Haber</th></tr></thead><tbody>${X.asiento.map((a) => `<tr><td>${esc(a.cta)}</td><td>${esc(a.n)}</td><td>${num(a.d)}</td><td>${num(a.h)}</td></tr>`).join('')}</tbody></table>` : ''}${X.email ? `<details class="no-print" style="margin-top:.5rem"><summary>Correo al proveedor (borrador)</summary><textarea id="facMail" rows="12" readonly style="width:100%;font-size:.8rem">${esc(X.email)}</textarea><div class="bar"><button class="small" data-facmail="1">Copiar el correo</button></div></details>` : ''}`;
    const preg = X.preguntas.length ? `<ul>${X.preguntas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="hint">Ninguna.</p>';
    const datos = `<table class="tabla rf-t"><tbody>${fila('Empresa del grupo', F.enGrupo && F.empresaDet ? `${esc(F.empresaDet.nombre)} (${esc(F.empresaDet.cif)}) · ${F.libro === 'Emitidas' ? 'emisora' : F.libro === 'Recibidas' ? 'destinataria' : ''}${F.gruposVistos.length > 1 ? ` · también aparece: ${esc(F.gruposVistos.filter((n) => n !== F.empresaDet.nombre).join(', '))}` : ''}` : '')}${fila('Número', esc(F.numero))}${fila('Fecha', esc(F.fecha))}${fila('Expedidor', F.emisor ? `${esc(F.emisor.id)} (${esc(F.paisEmisor)})` : (F.paisEmisor ? esc(F.paisEmisor) : ''))}${fila('Destinatario', F.receptor ? `${esc(F.receptor.id)} (${esc(F.paisReceptor)})` : '')}${fila('Base imponible', F.base === null ? '' : `${nf(F.base)} ${esc(F.moneda)}`)}${F.baseGravada !== undefined ? fila('Base gravada', `${nf(F.baseGravada)} ${esc(F.moneda)}`) : ''}${fila('Tipo de IVA', F.tipo === null ? '' : `${nf(F.tipo, 1)} %`)}${fila('Cuota', F.cuota === null ? '' : nf(F.cuota))}${fila('Total', F.total === null ? '' : `${nf(F.total)} ${esc(F.moneda)}`)}${F.incoterm ? fila('Incoterm', esc(F.incoterm)) : ''}</tbody></table>${hallazgosOk.length ? `<details style="margin-top:.4rem"><summary>Comprobaciones correctas e informativas (${hallazgosOk.length})</summary><ul class="rf-l">${hallazgosOk.map((h) => `<li style="border-left:4px solid ${COL[h.nivel][0]};background:${COL[h.nivel][1]}"><b style="color:${COL[h.nivel][0]}">${ICO[h.nivel]}</b> ${esc(h.t)}${h.art ? ` <small>· ${esc(h.art)}</small>` : ''}</li>`).join('')}</ul></details>` : ''}`;
    return cab + banner + sec('Tabla de líneas', lineas) + sec('Incidencias', incid) + sec('Importes corregidos', imp) + sec('Registro SII propuesto', sii) + sec('Líneas sin IVA o exentas', exentas) + sec('Acciones y plazos', acc) + sec('Preguntas abiertas', preg) + sec('Datos leídos', datos);
  }

  function vista() {
    const e = empresa(), R = ST.res;
    const zona = `<div class="drop-sii-in no-print" data-dropfac="1" tabindex="0" role="button" style="margin-bottom:8px;padding:1.2rem;text-align:center;cursor:pointer"><b>${ST.cargando ? (ST.estado || 'Leyendo la factura…') : 'Suelta aquí la factura (PDF o imagen)'}</b> o <label for="facIn" style="text-decoration:underline;cursor:pointer;font-weight:600">haz clic para elegirla</label>.<br><small>Se lee en tu navegador, no se guarda ni se sube, y se borra al salir de esta pestaña.</small><input type="file" id="facIn" accept=".pdf,application/pdf,image/*" hidden></div>`;
    const barra = `<div class="bar"><label>La factura es <select data-facl="1"><option value="">Detectar sola (entre las ${(S.empresas || []).length} empresas del grupo)</option><option value="Emitidas"${ST.libro === 'Emitidas' ? ' selected' : ''}>Emitida (la expide la empresa)</option><option value="Recibidas"${ST.libro === 'Recibidas' ? ' selected' : ''}>Recibida (la recibe la empresa)</option></select></label><span class="space"></span>${ST.res || ST.nombre ? `<button class="small danger" data-facdel="1" title="Borra la factura y el análisis de la memoria">Quitar la factura ahora</button>` : ''}</div>`;
    let cuerpo = '';
    if (ST.msg) cuerpo += `<p class="hint" style="color:#b42318">${esc(ST.msg)}</p>`;
    if (R && !R.ok) cuerpo += `<p class="vacio">${esc(R.error)}</p>`;
    if (R?.ok) cuerpo += vistaInforme(R);
    return `<div class="inicio rf"><section class="dsec"><h3>Revisión factura AEAT</h3>${zona}${barra}${vistaConfig()}${cuerpo || '<p class="vacio">Deja una factura en PDF o imagen y te digo qué revisaría la AEAT y cómo se declara en el SII.</p>'}
      ${ST.texto || ST.diag ? `<details class="no-print" style="margin:.5rem 0"><summary>Texto leído de la factura (para revisar el OCR)${ST.diag ? ` · ${esc(ST.diag)}` : ''}</summary>${ST.mini ? `<p class="hint">Así ve la página 1 el lector (si sale en blanco, el PDF no se está dibujando):</p><img alt="Vista de la página 1" src="${ST.mini}" style="max-width:100%;border:1px solid #ccc">` : ''}<pre style="white-space:pre-wrap;font-size:.75rem;max-height:22rem;overflow:auto">${esc(ST.texto)}</pre></details>` : ''}
      <details class="no-print" style="margin:.5rem 0"${R && !R.ok ? ' open' : ''}><summary>¿No la lee bien? Pega aquí el texto de la factura</summary><textarea id="facTxt" rows="6" style="width:100%;font-size:.8rem" placeholder="Abre el PDF, Ctrl+A, Ctrl+C y pega aquí con Ctrl+V"></textarea><div class="bar"><button class="small" data-factxt="1">Analizar este texto</button></div></details>
      <p class="hint">Análisis automático por reglas (Ley 37/1992 del IVA, Reglamento de facturación RD 1619/2012 y criterios del SII). Es orientativo: no sustituye la revisión de un profesional, no consulta VIES ni el censo, y los supuestos de inversión del sujeto pasivo y sus umbrales deben contrastarse con la norma vigente. La factura no se guarda en ningún sitio: solo vive en la memoria de esta pestaña y se borra al salir de ella, al cambiar de empresa o al pulsar «Quitar la factura ahora».</p></section></div>`;
  }

  // Firefox puede dar como destino un nodo de texto en los eventos de arrastre: se sube siempre al elemento
  const el = (ev) => { const t = ev.target; return t && t.nodeType === 3 ? t.parentElement : t; };
  const seguro = (f) => (ev) => { try { return f(ev); } catch (err) { ST.cargando = false; ST.msg = `Error en la pestaña: ${err?.message || err}. Puedes pegar el texto de la factura en el cuadro de abajo.`; try { render(); } catch { /* sin pintar */ } return undefined; } };
  // un error que se escapa (promesas, OCR…) se muestra en la pestaña en vez de quedarse mudo
  window.addEventListener('unhandledrejection', (ev) => { if (ST.cargando) { ST.cargando = false; ST.estado = ''; ST.msg = `Error al leer la factura: ${ev.reason?.message || ev.reason}. Puedes pegar el texto de la factura en el cuadro de abajo.`; render(); } });
  document.addEventListener('change', seguro((ev) => {
    const t = el(ev);
    if (t.id === 'facIn' && t.files?.[0]) { const f = t.files[0]; t.value = ''; return void leer(f); }
    if (t.dataset?.facl !== undefined) { ST.libro = t.value; if (ST.texto) { analizar(); render(); } }
    if (t.dataset?.rfc !== undefined) {
      if (t.dataset.rfc === 'fechaReg') ST.fechaReg = t.value;
      else cfgGuardar(idEfectivo(), { [t.dataset.rfc]: t.dataset.rfc === 'prorrata' ? Math.max(0, Math.min(100, +t.value || 0)) : t.value });
      if (ST.texto) analizar(); render();
    }
    return undefined;
  }));
  document.addEventListener('click', seguro((ev) => {
    const o = el(ev), z = o.closest?.('[data-dropfac]'); if (z && !o.closest('input,label')) return void document.getElementById('facIn')?.click();
    if (o.closest?.('[data-facdel]')) { limpiar(); render(); }
    if (o.closest?.('[data-factxt]')) pegado(document.getElementById('facTxt')?.value);
    if (o.closest?.('[data-facmail]')) { const m = document.getElementById('facMail'); if (m) { m.select(); try { navigator.clipboard?.writeText(m.value); } catch { /* se queda seleccionado para Ctrl+C */ } } }
    return undefined;
  }));
  // arrastrar y soltar: se atiende en toda la zona y también se frena que el navegador abra el archivo si se suelta fuera
  document.addEventListener('dragover', (ev) => { const z = el(ev)?.closest?.('[data-dropfac]'); if (z) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'; z.classList.add('over'); } });
  document.addEventListener('dragenter', (ev) => { if (el(ev)?.closest?.('[data-dropfac]')) ev.preventDefault(); });
  document.addEventListener('dragleave', (ev) => el(ev)?.closest?.('[data-dropfac]')?.classList.remove('over'));
  document.addEventListener('drop', seguro((ev) => {
    const z = el(ev)?.closest?.('[data-dropfac]'); if (!z) return;
    ev.preventDefault(); z.classList.remove('over');
    const f = ev.dataTransfer?.files?.[0] ?? (ev.dataTransfer?.items ? [...ev.dataTransfer.items].find((i) => i.kind === 'file')?.getAsFile() : null);
    if (f) leer(f); else { ST.msg = 'El navegador no ha entregado el archivo al soltarlo: usa «haz clic para elegirla».'; render(); }
  }));  return { limpiar, tabs: { leyfac: ['Revisión factura AEAT', 'Analiza una factura frente a la Ley y el SII', vista] } };
}
