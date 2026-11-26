// Bloque 14 · Contestador de requerimientos: se suelta el PDF de Hacienda, se reconocen modelo, periodo y plazo, y se monta un expediente (ZIP)
// con el borrador de respuesta, los libros del periodo, los justificantes presentados y los PDF que se añadan. Todo ocurre en el navegador: no guarda nada.
export function crearRequerim({ db, S, esc, render, empresa, grande, leerPdf, esHabil }) {
  const E = { clave: '', msg: '', f: null, adj: [], ocupado: false };
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const hoyIso = () => new Date().toLocaleDateString('en-CA');
  const fdia = (s) => String(s ?? '').slice(0, 10).split('-').reverse().join('/');
  const nifN = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  const limpioNom = (s) => String(s ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  const PIDE = [['libros', 'Libros registro de IVA', /libros?\s+(registro|de\s+iva|de\s+facturas)/i], ['facturas', 'Copia de facturas', /facturas?/i], ['pagos', 'Justificantes de pago y extractos', /justificantes?\s+(de|del)\s+pago|medios?\s+de\s+pago|extractos?\s+bancari/i],
    ['contratos', 'Contratos', /contratos?/i], ['nominas', 'Nóminas y certificados de retenciones', /n[óo]minas?|certificados?\s+de\s+retenciones/i], ['modelo', 'Autoliquidación presentada', /autoliquidaci[óo]n|declaraci[óo]n/i]];

  // lectura del texto del requerimiento; todo lo reconocido se puede corregir en pantalla
  function reconocer(texto, nombre) {
    const t = texto.replace(/[ \t]+/g, ' ');
    const nifs = [...new Set((t.toUpperCase().match(/\b(?:[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/g) ?? []))];
    const emp = S.empresas.find((e) => e.cif && nifs.includes(nifN(e.cif)));
    const mod = (/modelos?\s*:?\s*(\d{3})\b/i.exec(t) ?? [])[1] ?? (/\b(303|390|349|347|111|190|115|180|123|193|200|202|232|592|583)\b/.exec(t) ?? [])[1] ?? '';
    const ej = (/ejercicio\s*:?\s*(20\d\d)/i.exec(t) ?? [])[1] ?? String(S.ejercicio);
    let per = ((/per[íi]odos?\s*:?\s*([1-4]T|0?[1-9](?!\d)|1[0-2](?!\d)|[1-3]P|0A)\b/i.exec(t) ?? [])[1] ?? '').toUpperCase();
    if (/^\d$/.test(per)) per = `0${per}`; if (per === '0A') per = 'A';
    if (!per) { const i = MES.findIndex((m) => new RegExp(`per[íi]odo[^.]{0,30}${m}`, 'i').test(t)); if (i >= 0) per = String(i + 1).padStart(2, '0'); }
    const ref = (/(?:referencia|n[úu]mero de (?:requerimiento|justificante)|expediente(?:\s*\/\s*referencia)?)\s*:?\s*([A-Z0-9]{8,})/i.exec(t) ?? [])[1] ?? '';
    const dias = (/plazo\s+de\s+(\d{1,2}|diez|quince|cinco)\s+d[íi]as/i.exec(t) ?? [])[1];
    const nd = dias ? ({ diez: 10, quince: 15, cinco: 5 }[dias.toLowerCase()] ?? +dias) : 10;
    return { nombre, emp: emp?.id ?? '', mod, ej, per: per || 'A', ref, dias: nd, hallado: !!dias, notif: hoyIso(), pide: Object.fromEntries(PIDE.map(([k, , rx]) => [k, rx.test(t)])), alega: '', firma: '' };
  }
  const vence = (f) => { let t = Date.parse(f.notif), n = Math.max(0, +f.dias || 0); if (!Number.isFinite(t)) return ''; while (n > 0) { t += 864e5; if (esHabil(t)) n--; } return new Date(t).toISOString().slice(0, 10); };
  const mesesDe = (p) => (/^[1-4]T$/.test(p) ? [1, 2, 3].map((k) => (+p[0] - 1) * 3 + k) : /^\d\d$/.test(p) ? [+p] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const nomPer = (p) => (p === 'A' ? 'anual' : /T$/.test(p) ? `${p[0]}.º trimestre` : /P$/.test(p) ? `pago fraccionado ${p}` : MES[+p - 1] ?? p);
  // libros del periodo según el modelo: IVA para 303/390/349/347 (y por defecto); en retenciones, las recibidas con retención
  function libros(f) {
    const Er = grande('fact-E'), Rr = grande('fact-R'); if (!Er || !Rr) return null;
    const M = new Set(mesesDe(f.per)), ret = ['111', '115', '123', '180', '190', '193'].includes(f.mod);
    const enPer = (l) => String(l.fecha).slice(0, 4) === String(f.ej) && M.has(+String(l.fecha).slice(5, 7)) && (!ret || /^I\./.test(String(l.codigo ?? '')));
    return { E: ret ? [] : Er.filter(enPer), R: Rr.filter(enPer) };
  }
  const justificantes = (f) => S.registros.filter((r) => ['pres', 'prspdf'].includes(r.tipo) && r.empresa_id === S.sel && String(r.ejercicio) === String(f.ej) && String(r.datos?.modelo ?? '') === f.mod
    && (f.per === 'A' || String(r.datos?.periodo ?? '') === f.per) && r.datos?.archivo?.path).map((r) => r.datos.archivo).filter((a, i, L) => L.findIndex((x) => x.path === a.path) === i);

  function borrador(f, adjuntos) {
    const e = empresa(), li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Contestación al requerimiento</title><style>body{font:11pt Calibri,Arial,sans-serif;line-height:1.45}h1{font-size:13pt}</style></head><body>
<p><b>A LA AGENCIA ESTATAL DE ADMINISTRACIÓN TRIBUTARIA</b><br>[Dependencia u oficina que firma el requerimiento]</p>
<h1>Contestación al requerimiento${f.ref ? ` · referencia ${esc(f.ref)}` : ''}</h1>
<p>D./D.ª ${esc(f.firma) || '[nombre y NIF de quien firma]'}, en representación de <b>${esc(e.nombre)}</b>, con NIF ${esc(e.cif ?? '[NIF]')},</p>
<p><b>EXPONE</b></p>
<p>1. Que con fecha ${fdia(f.notif)} se ha recibido requerimiento relativo al modelo ${esc(f.mod || '[modelo]')}, ejercicio ${esc(f.ej)}, periodo ${esc(nomPer(f.per))}.</p>
<p>2. Que dentro del plazo concedido aporta la documentación que se relaciona al final.</p>
<p>3. ${f.alega.trim() ? esc(f.alega).replace(/\n/g, '<br>') : '[Explicaciones o alegaciones: redactar aquí]'}</p>
<p><b>SOLICITA</b></p>
<p>Que se tenga por presentado este escrito, con la documentación que lo acompaña, y por atendido en plazo el requerimiento.</p>
<p><b>Documentación que se aporta</b></p><ol>${li(adjuntos.length ? adjuntos : ['[relacionar documentos]'])}</ol>
<p>En ______________, a ____ de ______________ de ______.</p><p><br><br>Fdo.: ______________________</p></body></html>`;
  }
  // ZIP sin comprimir (suficiente para PDF y Excel, que ya van comprimidos)
  const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(ficheros) {
    const enc = new TextEncoder(), partes = [], cen = []; let pos = 0;
    const u = (...v) => { const out = []; v.forEach(([n, x]) => { for (let i = 0; i < n; i++) out.push((x >>> (8 * i)) & 255); }); return new Uint8Array(out); };
    const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    ficheros.forEach(({ nombre, bytes }) => {
      const n = enc.encode(nombre), crc = crc32(bytes), comun = [[2, 20], [2, 0x800], [2, 0], [2, hora], [2, dia], [4, crc], [4, bytes.length], [4, bytes.length], [2, n.length], [2, 0]];
      partes.push(u([4, 0x04034b50], ...comun), n, bytes);
      cen.push(u([4, 0x02014b50], [2, 20], ...comun, [2, 0], [2, 0], [2, 0], [4, 0], [4, pos]), n);
      pos += 30 + n.length + bytes.length;
    });
    const tam = cen.reduce((s, x) => s + x.length, 0);
    return new Blob([...partes, ...cen, u([4, 0x06054b50], [2, 0], [2, 0], [2, ficheros.length], [2, ficheros.length], [4, tam], [4, pos], [2, 0])], { type: 'application/zip' });
  }
  const bajar = (blob, nombre) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const nombreBase = (f) => limpioNom(`Requerimiento ${empresa().siglas || empresa().nombre} ${f.mod} ${f.per} ${f.ej}`);

  async function expediente() {
    const f = E.f, L = libros(f); if (!L || E.ocupado) return;
    E.ocupado = true; E.msg = 'Preparando el expediente…'; render();
    const out = [], nombres = [], fallos = [], enc = new TextEncoder(), usados = new Set();
    const mete = (nombre, bytes, titulo) => { let n = limpioNom(nombre), i = 2; while (usados.has(n.toLowerCase())) n = limpioNom(nombre).replace(/(\.[^.]*)?$/, ` (${i++})$1`); usados.add(n.toLowerCase()); out.push({ nombre: n, bytes }); if (titulo !== false) nombres.push(titulo || n); };
    try {
      const X = window.XLSX;
      if (X) [['E', 'Libro IVA emitidas'], ['R', 'Libro IVA recibidas']].forEach(([k, t]) => {
        if (!L[k].length) return;
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Fecha', 'Fecha factura', 'Factura', 'NIF', 'Nombre', 'Código', 'Base', 'Cuota', 'Asiento'], ...L[k].map((l) => [l.fecha, l.ff ?? '', l.factura, l.nif, l.nombre ?? '', l.codigo, l.base, l.cuota, l.asiento ?? ''])]), 'Libro');
        mete(`${t} ${f.per} ${f.ej}.xlsx`, new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })), `${t} (${L[k].length} líneas)`);
      });
      for (const a of justificantes(f)) {
        const { data, error } = await db.storage.from('documentos').download(a.path);
        if (error || !data) fallos.push(a.nombre || a.path); else mete(a.nombre || a.path.split('/').pop(), new Uint8Array(await data.arrayBuffer()));
      }
      for (const a of E.adj) mete(a.name, new Uint8Array(await a.arrayBuffer()));
      mete('Contestacion (borrador).doc', enc.encode(`﻿${borrador(f, nombres)}`), false);
      bajar(zip(out), `${nombreBase(f)}.zip`);
      E.msg = `✓ Expediente descargado con ${out.length} archivo(s).${fallos.length ? ` No se pudieron bajar: ${fallos.join(', ')}.` : ''}`;
    } catch (err) { E.msg = `✖ ${err.message}`; }
    E.ocupado = false; render();
  }
  async function cargar(file) {
    E.msg = 'Leyendo el PDF…'; render();
    try {
      const { texto } = await leerPdf(file);
      if (texto.replace(/--- página \d+ ---/g, '').trim().length < 40) { E.f = reconocer('', file.name); E.msg = 'El PDF no tiene texto (parece escaneado): rellena los datos a mano.'; }
      else { E.f = reconocer(texto, file.name); E.msg = ''; }
      E.adj = [file];
    } catch (err) { E.msg = `✖ No se pudo leer el PDF: ${err.message}`; }
    render();
  }
  function vista() {
    if (!S.sel) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
    if (E.clave !== String(S.sel)) { E.clave = String(S.sel); E.f = null; E.adj = []; E.msg = ''; }
    const zona = `<div class="dropzone" data-reqzona tabindex="0" role="button"><b>Suelta aquí el PDF del requerimiento</b> o pulsa para elegirlo<input type="file" data-reqfile accept=".pdf" hidden></div>`;
    const f = E.f;
    let cuerpo = '';
    if (f) {
      const otra = f.emp && f.emp !== S.sel ? S.empresas.find((x) => x.id === f.emp) : null;
      const L = libros(f), J = justificantes(f), v = vence(f), dias = v ? Math.round((Date.parse(v) - Date.parse(hoyIso())) / 864e5) : null;
      const inp = (k, t, size, tipo) => `<label style="display:flex;flex-direction:column;gap:2px">${t}<input data-req="${k}" type="${tipo || 'text'}" value="${esc(f[k])}" size="${size}"></label>`;
      const fila = (t, n, ok, falta) => `<tr><td>${t}</td><td class="num">${n}</td><td><span class="as-p as-${ok ? 'ok' : 'wa'}">${ok ? 'Listo' : falta}</span></td></tr>`;
      cuerpo = `${otra ? `<div class="aviso"><p>✖ El requerimiento parece de <b>${esc(otra.nombre)}</b>. Elígela en el desplegable de la izquierda y vuelve a soltar el PDF.</p></div>` : !f.emp ? '<p class="d-ko">No he reconocido el NIF de ninguna empresa en el PDF: comprueba que la elegida es la correcta.</p>' : ''}
        <div class="no-print" style="display:flex;gap:14px;flex-wrap:wrap;margin:8px 0">${inp('mod', 'Modelo', 6)}${inp('ej', 'Ejercicio', 6)}<label style="display:flex;flex-direction:column;gap:2px">Periodo<select data-req="per">${['A', ...MES.map((_, i) => String(i + 1).padStart(2, '0')), '1T', '2T', '3T', '4T', '1P', '2P', '3P'].map((p) => `<option value="${p}"${p === f.per ? ' selected' : ''}>${nomPer(p)}</option>`).join('')}</select></label>${inp('ref', 'Referencia', 22)}${inp('notif', 'Fecha de notificación', 12, 'date')}${inp('dias', 'Días hábiles', 4)}</div>
        <p>Responder antes del <b>${v ? fdia(v) : '—'}</b>${dias === null ? '' : dias < 0 ? ' <span class="d-ko">(plazo vencido)</span>' : ` (quedan ${dias} días)`}. <span class="dash-s">${f.hallado ? 'Plazo leído del PDF' : 'Plazo por defecto: compruébalo'}; no cuenta festivos autonómicos ni locales.</span></p>
        <p>El PDF parece pedir: ${PIDE.filter(([k]) => f.pide[k]).map(([, t]) => `<b>${t}</b>`).join(', ') || 'no lo he reconocido'}.</p>
        <div class="wrap"><table class="tabla"><thead><tr><th>Se adjunta</th><th class="num">Elementos</th><th>Estado</th></tr></thead><tbody>
        ${L ? fila('Libros del periodo', `${L.E.length + L.R.length} líneas`, L.E.length + L.R.length > 0, 'Sin líneas') : '<tr><td colspan="3">⏳ Cargando los libros…</td></tr>'}
        ${fila('Justificantes presentados del modelo', J.length, J.length > 0, 'No hay ninguno cargado')}
        ${fila('PDF añadidos (incluye el requerimiento)', E.adj.length, !f.pide.facturas || E.adj.length > 1, 'Añade las facturas pedidas')}</tbody></table></div>
        <p class="no-print">${E.adj.map((a, i) => `<span class="as-p as-nd">${esc(a.name)} <button class="small" data-req-act="quitar" data-i="${i}" title="Quitar">✕</button></span>`).join(' ')} <label class="small" style="cursor:pointer;text-decoration:underline">＋ Añadir facturas u otros documentos<input type="file" data-reqmas multiple hidden></label></p>
        <div class="no-print" style="display:flex;flex-direction:column;gap:8px;max-width:760px">${inp('firma', 'Firma (nombre y NIF)', 50)}<label style="display:flex;flex-direction:column;gap:2px">Explicaciones o alegaciones<textarea data-req="alega" rows="5">${esc(f.alega)}</textarea></label></div>
        <p class="no-print"><button class="small primary" data-req-act="zip"${E.ocupado || !L ? ' disabled' : ''}>Descargar expediente (ZIP)</button> <button class="small" data-req-act="doc">Solo el borrador (Word)</button></p>`;
    }
    return `<div class="inicio"><section class="dsec"><h3>Contestador de requerimientos · ${esc(empresa().nombre)}</h3>${zona}${E.msg ? `<p><b>${esc(E.msg)}</b></p>` : ''}${cuerpo}
      <p class="hint">El borrador sale de una plantilla: revisa los datos, redacta las alegaciones y comprueba el plazo antes de presentarlo. Nada de esto se guarda en la aplicación.</p></section></div>`;
  }
  document.addEventListener('click', (ev) => {
    const z = ev.target.closest?.('[data-reqzona]'); if (z && !ev.target.closest('input')) { z.querySelector('input')?.click(); return; }
    const b = ev.target.closest?.('[data-req-act]'); if (!b || !E.f) return;
    const a = b.dataset.reqAct;
    if (a === 'zip') expediente();
    else if (a === 'quitar') { E.adj.splice(+b.dataset.i, 1); render(); }
    else if (a === 'doc') bajar(new Blob([`﻿${borrador(E.f, [])}`], { type: 'application/msword' }), `${nombreBase(E.f)}.doc`);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target, d = t.dataset; if (!d) return;
    if (d.reqfile !== undefined) { const f = t.files[0]; t.value = ''; if (f) cargar(f); return; }
    if (d.reqmas !== undefined) { E.adj.push(...t.files); t.value = ''; render(); return; }
    if (d.req && E.f) { E.f[d.req] = t.value; if (d.req !== 'alega' && d.req !== 'firma') render(); }
  });
  document.addEventListener('input', (ev) => { const k = ev.target.dataset?.req; if (E.f && (k === 'alega' || k === 'firma')) E.f[k] = ev.target.value; });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-reqzona]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { ev.target.closest?.('[data-reqzona]')?.classList.remove('over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest?.('[data-reqzona]'); if (!z) return;
    ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over');
    const f = [...ev.dataTransfer.files].find((x) => /\.pdf$/i.test(x.name)); if (f) cargar(f);
  }, true);
  return { tabs: { reqres: ['Contestador de requerimientos', 'Del PDF de Hacienda al expediente', vista] } };
}
