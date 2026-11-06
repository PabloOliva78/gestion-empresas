// 11.- Administración · Enviar documentación
// Se eligen archivos ya cargados en la aplicación (PDF, Excel…) y se genera un correo listo para enviar
// (.eml con los archivos adjuntos, se abre en Outlook o en el correo que uses y se pulsa Enviar).
export function crearEnvio(c) {
  const { db, S, esc, render, empresa, docs = {} } = c;
  const sel = new Set();                                   // rutas de los archivos marcados
  const F = { tipo: '', ej: '', q: '' };                   // filtros de la lista
  const M = { de: '', para: '', cc: '', asunto: '', texto: '', maxMb: 20 };
  let estado = '', estadoMal = false, ocupado = false, empAnt = null;
  try { M.de = localStorage.getItem('env-de') ?? ''; M.maxMb = Number(localStorage.getItem('env-max')) || 20; } catch { /* sin almacenamiento */ }

  const TIPOS = { pres: 'Impuestos presentados', iloc: 'Impuestos locales', dua: 'DUA-H1', notif: 'Notificaciones', otros: 'Otros documentos', rmesc: 'Escrituras',
    rmdoc: 'Cuentas anuales presentadas', 'arch-emitidas': 'Libro de IVA emitidas', 'arch-recibidas': 'Libro de IVA recibidas', 'arch-extractos': 'Extractos', 'arch-sys': 'Sumas y saldos', 'arch-sii': 'SII',
    'arch-nominas': 'Nóminas', 'doc-rmactas': 'Actas', 'doc-rmsocios': 'Socios', 'doc-rmlibros': 'Libros', 'doc-rmca': 'Cuentas anuales (depósito)', 'doc-rmcert': 'Certificación', 'doc-rmaud': 'Auditoría',
    'doc-rmig': 'Informe de gestión', 'doc-rmmem': 'Memoria', 'doc-rmacu': 'Acuse de entrada', 'doc-rmnota': 'Nota de despacho' };
  // Los PDF de impuestos presentados se clasifican por modelo: Intrastat (exportaciones e importaciones UE), 111, 115, 123, 202, 303, 349, 583, 592, 180, 190, 193…
  const MOD_ORDEN = ['INT', '111', '115', '123', '202', '303', '349', '583', '592', '180', '190', '193', '200', '232', 'A22'];
  const MESES_N = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const modeloDe = (datos, nombre) => {
    const n = String(nombre ?? '').toUpperCase();
    if (/EXPORTACIONES\s+UE|IMPORTACIONES\s+UE|INTRASTAT/.test(n)) return 'INT';
    const m = String(datos?.modelo ?? '').trim().toUpperCase();
    if (m && m !== '?') return m;
    return (/\b(111|115|123|180|190|193|200|202|232|303|349|583|592|A22)\b/.exec(n) || [])[1] ?? '';
  };
  const periodoTxt = (datos, nombre) => {
    const p = String(datos?.periodo ?? ''), n = String(nombre ?? '').toLowerCase();
    if (/^\d\d$/.test(p) && +p >= 1 && +p <= 12) return cap(MESES_N[+p - 1]);
    if (p && p !== 'A') return p;
    const i = MESES_N.findIndex((x) => n.includes(x));
    return i >= 0 ? cap(MESES_N[i]) : (p === 'A' ? 'Anual' : '');
  };
  const ordenTipo = (t) => (t.startsWith('mod:') ? (MOD_ORDEN.indexOf(t.slice(4)) < 0 ? 50 : MOD_ORDEN.indexOf(t.slice(4))) : 100);
  const nomTipo = (t) => (t.startsWith('mod:') ? (t === 'mod:INT' ? 'Intrastat' : t === 'mod:?' ? 'Impuestos presentados (sin clasificar)' : `Modelo ${t.slice(4)}`) : TIPOS[t] ?? t.replace(/^(doc|arch)-/, ''));

  // todos los archivos guardados de la empresa: cualquier objeto {nombre, path} dentro de los datos de sus registros
  function archivos() {
    const out = [], vistos = new Set();
    const mira = (o, r, clave, prof) => {
      if (!o || typeof o !== 'object' || prof > 3) return;
      if (typeof o.path === 'string' && typeof o.nombre === 'string') {
        if (!vistos.has(o.path)) {
          vistos.add(o.path);
          const a = { path: o.path, nombre: o.nombre, tipo: r.tipo, ej: r.ejercicio ?? '', clave };
          if (r.tipo === 'prspdf' || r.tipo === 'pres') { // clasificado por modelo, con el flujo (exportaciones / importaciones) y el periodo como apartado
            const m = modeloDe(r.datos, o.nombre), n = o.nombre.toUpperCase();
            a.tipo = `mod:${m || '?'}`;
            a.ap = [m === 'INT' ? (/EXPORTACIONES/.test(n) ? 'Exportaciones UE (expediciones)' : /IMPORTACIONES/.test(n) ? 'Importaciones UE (introducciones)' : '') : '', periodoTxt(r.datos, o.nombre)].filter(Boolean).join(' · ');
          }
          out.push(a);
        }
        return;
      }
      for (const [k, v] of Object.entries(o)) mira(v, r, prof === 0 ? k : clave, prof + 1);
    };
    S.registros.filter((r) => r.empresa_id === S.sel).forEach((r) => mira(r.datos, r, '', 0));
    return out.sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || nomTipo(a.tipo).localeCompare(nomTipo(b.tipo)) || String(b.ej).localeCompare(String(a.ej)) || a.nombre.localeCompare(b.nombre));
  }
  const apartado = (a) => {
    if (a.ap !== undefined) return a.ap;
    const d = docs[a.tipo.replace(/^doc-/, '')]?.find(([k]) => k === a.clave);
    return d ? d[1] : (/^(titulares|sociedades|cadena)$/.test(a.clave) ? '' : a.clave);
  };
  const visibles = () => {
    const q = F.q.trim().toLowerCase();
    return archivos().filter((a) => (!F.tipo || a.tipo === F.tipo) && (!F.ej || String(a.ej) === F.ej) && (!q || `${a.nombre} ${nomTipo(a.tipo)} ${apartado(a)}`.toLowerCase().includes(q)));
  };

  function vista() {
    if (!S.sel) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
    if (empAnt !== S.sel) { sel.clear(); empAnt = S.sel; }
    const todos = archivos(), vis = visibles(), e = empresa();
    const tipos = [...new Set(todos.map((a) => a.tipo))].sort((a, b) => ordenTipo(a) - ordenTipo(b) || nomTipo(a).localeCompare(nomTipo(b)));
    const ejs = [...new Set(todos.map((a) => String(a.ej)).filter(Boolean))].sort().reverse();
    const marcados = todos.filter((a) => sel.has(a.path)).length;
    return `<p class="hint">Archivos guardados de <b>${esc(e?.nombre ?? '')}</b>. Marca los que quieras enviar, escribe el correo y pulsa «Preparar correo»: se descarga un archivo .eml con todo adjunto, que se abre en tu Outlook o Gmail y se envía desde tu cuenta.</p>
      <div class="bar"><input class="facin" data-envf="q" placeholder="Buscar…" value="${esc(F.q)}" size="22">
        <select data-envf="tipo"><option value="">Todos los tipos</option>${tipos.map((t) => `<option value="${esc(t)}"${F.tipo === t ? ' selected' : ''}>${esc(nomTipo(t))}</option>`).join('')}</select>
        <select data-envf="ej"><option value="">Todos los ejercicios</option>${ejs.map((a) => `<option${F.ej === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <span class="space"></span><button class="small" data-act="m-env-todos">Marcar los ${vis.length} visibles</button> <button class="small" data-act="m-env-ninguno">Quitar marcas</button></div>
      ${todos.length ? `<div class="wrap" style="max-height:340px;overflow:auto"><table class="tabla rg-tabla"><thead><tr><th></th><th>Tipo</th><th>Apartado</th><th>Ejercicio</th><th>Archivo</th></tr></thead><tbody>
        ${vis.map((a) => `<tr><td><input type="checkbox" data-envck="${esc(a.path)}"${sel.has(a.path) ? ' checked' : ''}></td><td>${esc(nomTipo(a.tipo))}</td><td>${esc(apartado(a))}</td><td>${esc(a.ej)}</td><td>${esc(a.nombre)}</td></tr>`).join('') || '<tr><td colspan="5" class="c">Ningún archivo con ese filtro</td></tr>'}
        </tbody></table></div>` : '<p class="vacio">Esta empresa no tiene archivos cargados.</p>'}
      <p><b id="envCount">${marcados} archivo(s) marcado(s)</b> · ${todos.length} en total</p>
      <section class="block"><h4 class="it-tit">Correo</h4><table class="tabla rg-tabla rotulos" style="width:auto"><tbody>
        <tr><td>De (tu correo)</td><td><input class="facin" data-env="de" value="${esc(M.de)}" size="46" placeholder="${esc(S.perfil?.email ?? 'tu@correo.com')}"></td></tr>
        <tr><td>Para (varios, separados por coma)</td><td><input class="facin" data-env="para" value="${esc(M.para)}" size="46"></td></tr>
        <tr><td>Copia (Cc)</td><td><input class="facin" data-env="cc" value="${esc(M.cc)}" size="46"></td></tr>
        <tr><td>Asunto</td><td><input class="facin" data-env="asunto" value="${esc(M.asunto)}" size="46" placeholder="Documentación ${esc(e?.nombre ?? '')}"></td></tr>
        <tr><td>Mensaje</td><td><textarea class="facin" data-env="texto" rows="6" cols="60">${esc(M.texto)}</textarea></td></tr>
        <tr><td>Tamaño máximo por correo (MB)</td><td><input class="facin" type="number" min="1" max="100" data-env="maxMb" value="${M.maxMb}" size="5"> <span class="hint">Si los archivos pesan más, se hacen varios correos (Outlook y Gmail suelen admitir unos 20-25 MB).</span></td></tr>
      </tbody></table>
      <p><button class="primary" data-act="m-env-gen"${ocupado ? ' disabled' : ''}>Preparar correo (.eml)</button> <span id="envEstado" class="hint${estadoMal ? ' rg-msg mal' : ''}">${esc(estado)}</span></p></section>`;
  }

  // ---- construcción del correo ----
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const lineas = (s) => s.replace(/(.{76})/g, '$1\r\n');
  const utf8 = (t) => new TextEncoder().encode(t);
  const cab = (t) => (/^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${b64(utf8(t))}?=`);
  const lista = (t) => String(t).split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
  const okMail = (x) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(x);
  const tipoMime = (n) => (/\.pdf$/i.test(n) ? 'application/pdf' : /\.xlsx$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : /\.xls$/i.test(n) ? 'application/vnd.ms-excel'
    : /\.docx$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.csv$/i.test(n) ? 'text/csv' : 'application/octet-stream');

  function eml({ de, para, cc, asunto, texto, adj }) {
    const lim = `----=_Parte_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const h = [`From: ${de}`, `To: ${para.join(', ')}`, ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []), `Subject: ${cab(asunto)}`, `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
      'MIME-Version: 1.0', 'X-Unsent: 1', `Content-Type: multipart/mixed; boundary="${lim}"`];
    let cuerpo = `\r\n--${lim}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${lineas(b64(utf8(texto || ' ')))}\r\n`;
    adj.forEach((a) => {
      const n = cab(a.nombre);
      cuerpo += `--${lim}\r\nContent-Type: ${tipoMime(a.nombre)}; name="${n}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${n}"\r\n\r\n${lineas(a.b64)}\r\n`;
    });
    return `${h.join('\r\n')}\r\n${cuerpo}--${lim}--\r\n`;
  }
  const bajar = (nombre, contenido) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([contenido], { type: 'message/rfc822' })), download: nombre });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const avisa = (t, mal = false) => { estado = t; estadoMal = mal; const el = document.getElementById('envEstado'); if (el) { el.textContent = t; el.classList.toggle('rg-msg', mal); el.classList.toggle('mal', mal); } };

  async function generar() {
    if (ocupado) return;
    const de = (M.de || S.perfil?.email || '').trim(), para = lista(M.para), cc = lista(M.cc), todos = archivos(), elegidos = todos.filter((a) => sel.has(a.path));
    if (!okMail(de)) return avisa('Escribe tu correo en «De».', true);
    if (!para.length || para.some((x) => !okMail(x))) return avisa('Revisa los correos de «Para»: separa varios con comas.', true);
    if (cc.some((x) => !okMail(x))) return avisa('Revisa los correos de «Copia».', true);
    if (!elegidos.length) return avisa('Marca al menos un archivo.', true);
    ocupado = true;
    try {
      const adj = [];
      for (const [i, a] of elegidos.entries()) {
        avisa(`Descargando ${i + 1} de ${elegidos.length}: ${a.nombre}…`);
        const { data, error } = await db.storage.from('documentos').download(a.path);
        if (error) throw new Error(`${a.nombre}: ${error.message}`);
        adj.push({ nombre: a.nombre, tam: data.size, b64: b64(new Uint8Array(await data.arrayBuffer())) });
      }
      const tope = Math.max(1, M.maxMb) * 1048576, partes = [[]];
      let peso = 0;
      adj.forEach((a) => { const t = Math.ceil(a.tam * 1.37); if (peso + t > tope && partes[partes.length - 1].length) { partes.push([]); peso = 0; } partes[partes.length - 1].push(a); peso += t; });
      const base = (M.asunto || `Documentación ${empresa()?.nombre ?? ''}`).trim(), n = partes.length;
      for (const [i, p] of partes.entries()) {
        bajar(`${base.replace(/[\\/:*?"<>|]+/g, ' ')}${n > 1 ? ` (parte ${i + 1} de ${n})` : ''}.eml`, eml({ de, para, cc, asunto: n > 1 ? `${base} (${i + 1}/${n})` : base, texto: M.texto, adj: p }));
        await new Promise((r) => setTimeout(r, 500));
      }
      avisa(`Listo: ${n} correo(s) con ${adj.length} archivo(s). Ábrelos (doble clic) y pulsa Enviar.${n > 1 ? ' Si el navegador pide permiso para descargar varios archivos, acéptalo.' : ''}`);
    } catch (err) { avisa(err.message, true); } finally { ocupado = false; }
  }

  document.addEventListener('change', (ev) => {
    const t = ev.target; if (!t.dataset) return;
    if (t.dataset.envck) {
      if (t.checked) sel.add(t.dataset.envck); else sel.delete(t.dataset.envck);
      const el = document.getElementById('envCount'); if (el) el.textContent = `${archivos().filter((a) => sel.has(a.path)).length} archivo(s) marcado(s)`;
    } else if (t.dataset.envf) { F[t.dataset.envf] = t.value; render(); }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!t.dataset) return;
    if (t.dataset.env) {
      M[t.dataset.env] = t.dataset.env === 'maxMb' ? (Number(t.value) || 20) : t.value;
      try { if (t.dataset.env === 'de') localStorage.setItem('env-de', t.value); if (t.dataset.env === 'maxMb') localStorage.setItem('env-max', String(M.maxMb)); } catch { /* sin almacenamiento */ }
    }
  });
  document.addEventListener('keyup', (ev) => { const t = ev.target; if (t?.dataset?.envf === 'q') { F.q = t.value; clearTimeout(vista.tm); vista.tm = setTimeout(() => { render(); const i = document.querySelector('[data-envf="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } });

  const acciones = {
    'm-env-todos': () => { visibles().forEach((a) => sel.add(a.path)); render(); },
    'm-env-ninguno': () => { sel.clear(); render(); },
    'm-env-gen': () => generar(),
  };
  const tabs = { envio: ['Enviar documentación', 'Archivos cargados por correo', vista, true] };
  return { tabs, acciones };
}
