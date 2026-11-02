// Bloques 1 y 2 (información tributaria y registral), todo declarativo.
// Tres tipos de pestaña: lista de registros (tabla `registros`), ficha (`empresas.datos`)
// y documental (huecos con fecha, referencia y archivo en Storage, bucket `documentos`).
import { clasificar, nifDe, lineasPagina, leerCenso, leerActividades, leerObligaciones, leerSituacion,
  leerRepresentantes, leerParticipes, leerLocal } from './lectores.js?v=8';

export function crearModulos(c) {
  const { db, S, esc, opts, openForm, fmt, render, cargar, eur, empNombre, PERIODOS } = c;

  const SINO = { Sí: 'Sí', No: 'No' };
  const ESTADO = { Pendiente: 'Pendiente', Presentado: 'Presentado' };
  const MODELOS = Object.fromEntries(['303', '111', '115', '123', '349', '390', '190', '180', '193', '347', '200', '202', '036/037']
    .map((m) => [m, m]));
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const empresa = () => S.empresas.find((e) => e.id === S.sel);
  const empOpts = () => Object.fromEntries(S.empresas.map((e) => [e.id, e.siglas ? `${e.siglas} · ${e.nombre}` : e.nombre]));
  const num = (v) => (v === '' || v == null ? null : parseFloat(v));

  // ---------- Archivos ----------
  async function subir(empresaId, grupo, idReg, clave, file) {
    const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
    const path = `${empresaId}/${grupo}/${idReg}/${clave}-${limpio}`;
    const { error } = await db.storage.from('documentos').upload(path, file, { upsert: true });
    return error ? { error: error.message } : { val: { nombre: file.name, path } };
  }
  async function abrir(path) {
    const { data, error } = await db.storage.from('documentos').createSignedUrl(path, 120);
    if (error) return void alert(error.message);
    const a = Object.assign(document.createElement('a'), { href: data.signedUrl, target: '_blank', rel: 'noopener' });
    a.click();
  }
  const verArchivo = (a) => (a?.path ? `<button class="small" data-act="m-abrir" data-path="${esc(a.path)}">📎 ${esc(a.nombre)}</button>` : '');
  const rutas = (obj) => Object.values(obj ?? {}).map((x) => x?.path).filter(Boolean);
  const quitarArchivos = async (paths) => { if (paths.length) await db.storage.from('documentos').remove(paths); };

  // ---------- Listas de registros ----------
  const P = { k: 'periodo', l: 'Periodo', t: 'sel', o: PERIODOS };
  const F = (k, l) => ({ k, l, t: 'date' });
  const T = (k, l) => ({ k, l, t: 'text' });
  const E = (k, l) => ({ k, l, t: 'eur' });
  const N = (k, l) => ({ k, l, t: 'num' });
  const S_ = (k, l, o) => ({ k, l, t: 'sel', o });
  const A = (k, l = 'Archivo') => ({ k, l, t: 'archivo' });
  const AR = (k, l) => ({ k, l, t: 'area' });

  const LISTAS = {
    r111: { cols: [P, N('perceptores', 'Perceptores'), E('base', 'Base'), E('ret', 'Retenciones'), F('fecha', 'Presentado el'), S_('estado', 'Estado', ESTADO)] },
    r115: { cols: [P, N('arrendadores', 'Arrendadores'), E('base', 'Base'), E('ret', 'Retenciones'), F('fecha', 'Presentado el'), S_('estado', 'Estado', ESTADO)] },
    r123: { cols: [P, N('perceptores', 'Perceptores'), E('base', 'Base'), E('ret', 'Retenciones'), F('fecha', 'Presentado el'), S_('estado', 'Estado', ESTADO)] },
    pres: { cols: [S_('modelo', 'Modelo', MODELOS), P, E('importe', 'Resultado'), F('fecha', 'Presentado el'), T('justificante', 'Nº justificante / CSV'), A('archivo', 'PDF')] },
    liq: { todas: true, cols: [S_('modelo', 'Modelo', MODELOS), P, E('importe', 'Importe'), F('vencimiento', 'Vencimiento'), S_('estado', 'Estado', ESTADO)] },
    venc: { todas: true, cols: [S_('modelo', 'Modelo', MODELOS), P, E('importe', 'Importe'), F('fecha', 'Fecha de cargo'), T('banco', 'Banco / cuenta'), S_('estado', 'Estado', { Pendiente: 'Pendiente', Cargado: 'Cargado' })] },
    notif: { ej: false, cols: [F('fecha', 'Recibida'), T('organismo', 'Organismo'), T('asunto', 'Asunto'), F('plazo', 'Plazo de respuesta'), S_('estado', 'Estado', { Pendiente: 'Pendiente', Respondida: 'Respondida', Cerrada: 'Cerrada' }), A('archivo')] },
    iloc: { ej: false, cols: [S_('impuesto', 'Impuesto', { IBI: 'IBI', IAE: 'IAE', IVTM: 'IVTM', Vados: 'Vados', Basura: 'Basura', Otros: 'Otros' }),
      T('municipio', 'Municipio'), T('per', 'Periodo'), T('objeto', 'Objeto tributario'), E('importe', 'Importe'), F('vencimiento', 'Fecha límite'),
      F('fecha_pago', 'Fecha de pago'), S_('estado', 'Estado', { Pendiente: 'Pendiente', Pagado: 'Pagado' }), T('ref', 'Id. recibo'), A('archivo', 'PDF')] },
    dua: { cols: [F('fecha', 'Fecha'), T('dua', 'Nº DUA'), T('proveedor', 'Proveedor'), E('base', 'Base'), E('iva', 'IVA diferido'), S_('estado', 'Estado', { Pendiente: 'Pendiente', Aplicado: 'Aplicado' }), A('archivo')] },
    trl: { ej: false, cols: [T('nombre', 'Titular real'), T('nif', 'NIF'), N('pct', '% titularidad'), S_('tipo', 'Tipo', { Directa: 'Directa', Indirecta: 'Indirecta', Control: 'Control' }), F('fecha', 'Desde')] },
    acc: { ej: false, cols: [S_('relacion', 'Relación', { Socio: 'Socio', Participada: 'Participada' }), T('nombre', 'Nombre'), T('nif', 'NIF'), N('pct', '% capital'), T('notas', 'Notas')] },
    rmesc: { ej: false, cols: [F('fecha', 'Fecha'), T('notario', 'Notario'), T('protocolo', 'Nº protocolo'), T('tipo', 'Tipo'), T('desc', 'Descripción'), A('archivo')] },
  };

  const celda = (x, v) => {
    if (x.t === 'eur') return `<td class="num">${v == null ? '' : eur(v)}</td>`;
    if (x.t === 'num') return `<td class="num">${esc(v)}</td>`;
    if (x.t === 'date') return `<td>${fmt(v)}</td>`;
    if (x.t === 'archivo') return `<td>${verArchivo(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  };

  function vistaLista(id) {
    const cfg = LISTAS[id];
    if (!cfg.todas && !S.sel) return sinEmpresa;
    let filas = S.registros.filter((r) => r.tipo === id && (cfg.todas ? (!S.sel || r.empresa_id === S.sel) : r.empresa_id === S.sel));
    if (cfg.ej !== false) filas = filas.filter((r) => r.ejercicio === Number(S.ejercicio));
    if (S.periodo && cfg.cols.some((x) => x.k === 'periodo')) {
      filas = filas.filter((r) => !r.datos.periodo || r.datos.periodo === S.periodo || r.datos.periodo === 'Anual');
    }
    const clave = (r) => r.datos.fecha || r.datos.vencimiento || r.datos.periodo || '';
    filas.sort((a, b) => clave(a).localeCompare(clave(b)));
    const edit = puede();
    const cuerpo = filas.map((r) => `<tr>${cfg.todas ? `<td>${esc(empNombre(r.empresa_id))}</td>` : ''}
      ${cfg.cols.map((x) => celda(x, r.datos[x.k])).join('')}
      <td class="acciones">${edit ? `<button class="small" data-act="m-edit" data-m="${id}" data-id="${r.id}">Editar</button>
        <button class="small danger" data-act="m-del" data-id="${r.id}">Borrar</button>` : ''}</td></tr>`).join('');
    return `<div class="bar"><span class="space"></span>${edit ? `<button class="primary" data-act="m-new" data-m="${id}">Añadir</button>` : ''}</div>
      ${filas.length ? `<div class="wrap"><table class="tabla"><thead><tr>${cfg.todas ? '<th>Empresa</th>' : ''}
        ${cfg.cols.map((x) => `<th${x.t === 'eur' || x.t === 'num' ? ' class="num"' : ''}>${esc(x.l)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${cuerpo}</tbody></table></div>` : '<p class="vacio">Sin registros para esta selección.</p>'}`;
  }

  const puede = () => ['admin', 'gestor'].includes(S.perfil?.rol);

  function formReg(id, r = null) {
    const cfg = LISTAS[id];
    const d = r?.datos ?? {};
    const fields = cfg.cols.map((x) => {
      if (x.t === 'archivo') return { name: x.k, label: `${x.l}${d[x.k] ? ` (actual: ${d[x.k].nombre})` : ''}`, type: 'file' };
      if (x.t === 'sel') return { name: x.k, label: x.l, type: 'select', options: x.o, value: d[x.k] };
      return { name: x.k, label: x.l, type: x.t === 'eur' || x.t === 'num' ? 'number' : x.t === 'date' ? 'date' : 'text',
        step: x.t === 'eur' ? '0.01' : x.t === 'num' ? 'any' : undefined, value: d[x.k] };
    });
    if (cfg.todas) fields.unshift({ name: 'empresa_id', label: 'Empresa', type: 'select', options: empOpts(), value: r?.empresa_id || S.sel });
    openForm(r ? 'Editar registro' : 'Nuevo registro', fields, async (v) => {
      const empresaId = cfg.todas ? v.empresa_id : (r?.empresa_id || S.sel);
      const idReg = r?.id || crypto.randomUUID();
      const datos = {};
      for (const x of cfg.cols) {
        if (x.t === 'archivo') {
          const f = v[x.k];
          if (f && f.size) {
            const res = await subir(empresaId, id, idReg, x.k, f);
            if (res.error) return res.error;
            datos[x.k] = res.val;
          } else if (d[x.k]) datos[x.k] = d[x.k];
        } else datos[x.k] = x.t === 'eur' || x.t === 'num' ? num(v[x.k]) : v[x.k];
      }
      const fila = { empresa_id: empresaId, tipo: id, ejercicio: cfg.ej === false ? null : (r?.ejercicio ?? Number(S.ejercicio)), datos };
      const { error } = r ? await db.from('registros').update(fila).eq('id', r.id) : await db.from('registros').insert({ id: idReg, ...fila });
      if (error) return error.message;
      await cargar(); render();
    });
  }

  async function borrarReg(r) {
    if (!r || !confirm('¿Borrar el registro y sus archivos?')) return;
    await quitarArchivos(rutas(r.datos));
    const { error } = await db.from('registros').delete().eq('id', r.id);
    if (error) return void alert(error.message);
    await cargar(); render();
  }

  // ---------- Fichas (datos censales y registrales) ----------
  const FICHAS = {
    it: [T('nif', 'NIF'), T('razon', 'Razón social'), T('domicilio', 'Domicilio fiscal'), T('ref_catastral', 'Referencia catastral'),
      T('delegacion', 'Administración AEAT'), T('iae', 'Epígrafes IAE'), AR('actividades', 'Actividades (censo)'),
      S_('periodicidad', 'Periodicidad IVA', { Mensual: 'Mensual', Trimestral: 'Trimestral' }), T('regimen', 'Régimen de IVA'),
      T('deduccion', '% provisional de deducción'), T('cierre', 'Cierre del ejercicio'), T('pagos_frac', 'Pagos fraccionados IS'),
      T('retenciones', 'Retenciones (modelos)'), T('sii', 'SII'), T('notificaciones', 'Notificaciones electrónicas'),
      AR('obligaciones', 'Obligaciones tributarias (censo)'), T('representante', 'Representantes'), AR('representados', 'Representados'),
      F('cert_cad', 'Caducidad certificado digital')],
    dreg: [T('nif', 'NIF'), T('irus', 'IRUS'), T('cnae', 'CNAE'), T('registro', 'Registro Mercantil de'), T('tomo', 'Tomo'),
      T('folio', 'Folio'), T('hoja', 'Hoja'), T('inscripcion', 'Inscripción'), F('constitucion', 'Fecha de constitución'),
      T('capital', 'Capital social'), T('ejercicio_social', 'Ejercicio social'), T('domicilio', 'Domicilio social'), T('objeto', 'Objeto social')],
  };

  function vistaFichaDatos(id) {
    const e = empresa();
    if (!e) return sinEmpresa;
    const d = e.datos?.[id] ?? {};
    return `<div class="bar"><span class="space"></span>${puede() ? `<button class="primary" data-act="m-ficha" data-m="${id}">Editar datos</button>` : ''}</div>
      <div class="ficha"><dl>${FICHAS[id].map((x) => `<dt>${esc(x.l)}</dt><dd>${x.t === 'date' ? fmt(d[x.k]) : esc(d[x.k])}</dd>`).join('')}</dl></div>`;
  }

  function formFicha(id) {
    const e = empresa();
    const d = e.datos?.[id] ?? {};
    openForm('Editar datos', FICHAS[id].map((x) => (x.t === 'sel'
      ? { name: x.k, label: x.l, type: 'select', options: { '': '—', ...x.o }, value: d[x.k] ?? '' }
      : { name: x.k, label: x.l, type: x.t === 'date' ? 'date' : x.t === 'area' ? 'textarea' : 'text', value: d[x.k] })), async (v) => {
      const datos = { ...(e.datos ?? {}), [id]: v };
      const { error } = await db.from('empresas').update({ datos }).eq('id', e.id);
      if (error) return error.message;
      await cargar(); render();
    });
  }

  // ---------- Documentos por ejercicio ----------
  const COMUNES = [['instancia', 'Instancia'], ['acuse', 'Acuse de entrada'], ['nota', 'Nota de despacho'], ['asiento', 'Asiento']];
  const DOCS = {
    rmca: [['cuentas', 'Cuentas anuales depositadas'], ['acuse', 'Acuse de entrada'], ['nota', 'Nota de despacho']],
    rmcert: [['cert', 'Certificación del acta de la junta'], ['acta', 'Acta de aprobación de cuentas']],
    rmaud: [['informe', 'Informe de auditoría (auditor y opinión en referencia)']],
    rmig: [['informe', 'Informe de gestión']],
    rmmem: [['memoria', 'Memoria']],
    rmacu: [['acuse', 'Acuse de entrada de la presentación']],
    rmnota: [['nota', 'Nota de despacho del depósito de cuentas']],
    rmactas: [['libro', 'Libro de actas'], ...COMUNES],
    rmsocios: [['libro', 'Libro registro de socios'], ['escritura', 'Escritura o contrato de compraventa'], ['titular', 'Titularidad real'], ...COMUNES.slice(0, 3)],
    rmlibros: [['diario', 'Libro diario'], ['mayor', 'Libro mayor'], ['sys', 'Balance de sumas y saldos'], ['bsit', 'Balance de situación'], ...COMUNES],
  };
  const regDoc = (id) => S.registros.find((r) => r.tipo === 'doc-' + id && r.empresa_id === S.sel && r.ejercicio === Number(S.ejercicio));

  function vistaDocs(id) {
    if (!S.sel) return sinEmpresa;
    const D = regDoc(id)?.datos ?? {};
    const hecho = DOCS[id].filter(([k]) => D[k]?.path || D[k]?.fecha || D[k]?.ref).length;
    const filas = DOCS[id].map(([k, l]) => `<tr><td>${esc(l)}</td><td>${fmt(D[k]?.fecha)}</td><td>${esc(D[k]?.ref)}</td>
      <td>${verArchivo(D[k]?.archivo)}</td><td class="acciones">${puede()
    ? `<button class="small" data-act="m-doc-edit" data-m="${id}" data-slot="${k}">${D[k] ? 'Editar' : 'Añadir'}</button>
        ${D[k] ? `<button class="small danger" data-act="m-doc-del" data-m="${id}" data-slot="${k}">Quitar</button>` : ''}` : ''}</td></tr>`).join('');
    return `<div class="bar"><span class="chip">${hecho} de ${DOCS[id].length} · ejercicio ${esc(S.ejercicio)}</span></div>
      <div class="wrap"><table class="tabla"><thead><tr><th>Documento</th><th>Fecha</th><th>Referencia</th><th>Archivo</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  }

  async function guardarDoc(id, D) {
    const r = regDoc(id);
    const { error } = r
      ? await db.from('registros').update({ datos: D }).eq('id', r.id)
      : await db.from('registros').insert({ empresa_id: S.sel, tipo: 'doc-' + id, ejercicio: Number(S.ejercicio), datos: D });
    return error?.message;
  }

  function formDoc(id, slot) {
    const r = regDoc(id);
    const D = { ...(r?.datos ?? {}) };
    const act = D[slot] ?? {};
    const etiqueta = DOCS[id].find(([k]) => k === slot)[1];
    openForm(etiqueta, [
      { name: 'fecha', label: 'Fecha', type: 'date', value: act.fecha },
      { name: 'ref', label: 'Referencia (nº de asiento, justificante, observaciones)', value: act.ref },
      { name: 'archivo', label: `Archivo${act.archivo ? ` (actual: ${act.archivo.nombre})` : ''}`, type: 'file' },
    ], async (v) => {
      let archivo = act.archivo;
      if (v.archivo && v.archivo.size) {
        const res = await subir(S.sel, 'doc-' + id + '-' + S.ejercicio, 'doc', slot, v.archivo);
        if (res.error) return res.error;
        archivo = res.val;
      }
      D[slot] = { fecha: v.fecha, ref: v.ref, ...(archivo ? { archivo } : {}) };
      const err = await guardarDoc(id, D);
      if (err) return err;
      await cargar(); render();
    });
  }

  async function quitarDoc(id, slot) {
    if (!confirm('¿Quitar este documento?')) return;
    const D = { ...(regDoc(id)?.datos ?? {}) };
    await quitarArchivos(rutas({ a: D[slot]?.archivo }));
    delete D[slot];
    const err = await guardarDoc(id, D);
    if (err) return void alert(err);
    await cargar(); render();
  }

  // ---------- Cuadro de mando del grupo ----------
  function vistaCmg() {
    const cols = ['303', '111', '115', '123', '349', '390', '190', '200'];
    const pres = S.registros.filter((r) => r.tipo === 'pres' && r.ejercicio === Number(S.ejercicio)
      && (!S.periodo || r.datos.periodo === S.periodo));
    const liq = S.registros.filter((r) => r.tipo === 'liq' && r.ejercicio === Number(S.ejercicio) && r.datos.estado !== 'Presentado');
    const filas = S.empresas.map((e) => `<tr><td><div class="emp">${c.logoHtml(e)}<b>${esc(e.siglas || e.nombre)}</b></div></td>
      ${cols.map((m) => { const n = pres.filter((r) => r.empresa_id === e.id && r.datos.modelo === m).length;
        return `<td class="c">${n ? `<span class="ok">✔ ${n}</span>` : '<span class="muted">—</span>'}</td>`; }).join('')}
      <td class="c">${liq.filter((r) => r.empresa_id === e.id).length || '<span class="muted">—</span>'}</td></tr>`).join('');
    return `<div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th>${cols.map((m) => `<th class="c">${m}</th>`).join('')}
      <th class="c">Por presentar</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="hint">✔ n = declaraciones presentadas del modelo en el ejercicio y periodo elegidos (se alimenta de «Impuestos Presentados»).</p>`;
  }

  // ---------- Pestañas ----------
  const L = (id) => () => vistaLista(id);
  const D = (id) => () => vistaDocs(id);
  const tabs = {
    cmg: ['Cuadro de mando del grupo', 'Empresa × modelo × periodo', vistaCmg],
    it: ['Datos Identificativos Censales', 'Censo AEAT', () => vistaFichaDatos('it')],
    r111: ['Retenciones Modelo 111', 'Nóminas y profesionales', L('r111')],
    r115: ['Retenciones Modelo 115', 'Arrendamientos', L('r115')],
    r123: ['Retenciones Modelo 123', 'Capital mobiliario', L('r123')],
    pres: ['Impuestos Presentados', 'Justificantes y PDF', L('pres')],
    liq: ['Liquidaciones Presentar', 'Todas las empresas', L('liq')],
    venc: ['Pagos Domiciliados Impuestos', 'Todas las empresas', L('venc')],
    notif: ['Notificaciones y requerimientos', 'Plazos de respuesta', L('notif')],
    iloc: ['Impuestos Locales', 'IBI · IAE · IVTM', L('iloc')],
    dua: ['DUA-H1', 'Importaciones · IVA diferido', L('dua')],
    dreg: ['Datos Registrales', 'NIF, IRUS, CNAE, Registro', () => vistaFichaDatos('dreg')],
    trl: ['Titularidad Real', 'Titulares reales', L('trl')],
    acc: ['Organigrama', 'Socios y participadas', L('acc')],
    rmca: ['Cuentas Anuales Presentadas', 'Depósito en el Registro', D('rmca')],
    rmcert: ['Certificación Presentada', 'Acta de la junta', D('rmcert')],
    rmaud: ['Informe de Auditoría', 'Auditor y opinión', D('rmaud')],
    rmig: ['Informe de Gestión', 'Borrador del ejercicio', D('rmig')],
    rmmem: ['Memoria Presentada', 'Notas de la memoria', D('rmmem')],
    rmacu: ['Acuse de Entrada', 'Presentación en el Registro', D('rmacu')],
    rmnota: ['Nota de Despacho', 'Depósito de cuentas', D('rmnota')],
    rmesc: ['Escrituras', 'Notariales', L('rmesc')],
    rmactas: ['Actas', 'Libro de actas', D('rmactas')],
    rmsocios: ['Socios', 'Libro registro de socios', D('rmsocios')],
    rmlibros: ['Libros', 'Libros contables', D('rmlibros')],
  };

  // ---------- Carga de PDF (AEAT y tributos locales) ----------
  async function textoPdf(file) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js).');
    lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      out.push(`--- página ${p} ---`, ...lineasPagina(tc.items.map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))));
    }
    return out.join('\n');
  }

  async function guardarRegistro(existente, fila) {
    const { error } = existente
      ? await db.from('registros').update(fila).eq('id', existente.id)
      : await db.from('registros').insert(fila);
    return error?.message;
  }

  async function cargarPdfs(files) {
    const informe = [];
    const vistos = new Set();
    const ficha = {};
    for (const f of files) {
      try {
        const t = await textoPdf(f);
        const tipo = clasificar(t);
        if (!tipo) { informe.push(`❔ ${f.name}: no reconocido`); continue; }
        const nif = nifDe(t);
        const e = S.empresas.find((x) => x.cif === nif);
        if (!e) { informe.push(`⚠ ${f.name}: el NIF ${nif || '?'} no coincide con ninguna empresa`); continue; }
        const nom = e.siglas || e.nombre;
        const F_ = (ficha[e.id] ??= { e, it: { ...(e.datos?.it ?? {}) }, dreg: { ...(e.datos?.dreg ?? {}) }, tocado: false });
        if (tipo === 'censo') {
          const r = leerCenso(t);
          Object.assign(F_.it, { nif: r.nif, razon: r.razon, domicilio: r.domicilio_fiscal, ref_catastral: r.ref_catastral,
            delegacion: r.delegacion, sii: r.sii, notificaciones: r.notificaciones });
          Object.assign(F_.dreg, { nif: r.nif, constitucion: r.constitucion, domicilio: r.domicilio_social });
          F_.tocado = true; informe.push(`✔ ${nom}: datos censales`);
        } else if (tipo === 'actividades') {
          const r = leerActividades(t);
          F_.it.iae = r.map((a) => a.epigrafe).join(', ');
          F_.it.actividades = r.map((a) => `${a.epigrafe} ${a.denominacion} (${a.estado} desde ${fmt(a.desde)})`).join('\n');
          F_.tocado = true; informe.push(`✔ ${nom}: ${r.length} actividades`);
        } else if (tipo === 'obligaciones') {
          const r = leerObligaciones(t);
          F_.it.obligaciones = r.map((o) => `${o.descripcion} · ${o.periodicidad.toLowerCase()} · ${o.estado.toLowerCase()} desde ${fmt(o.alta)}`).join('\n');
          const iva = r.find((o) => /VALOR AÑADIDO/.test(o.descripcion));
          if (iva) F_.it.periodicidad = iva.periodicidad === 'MENSUAL' ? 'Mensual' : 'Trimestral';
          F_.tocado = true; informe.push(`✔ ${nom}: ${r.length} obligaciones censales`);
        } else if (tipo === 'situacion') {
          const r = leerSituacion(t);
          Object.assign(F_.it, { regimen: r.regimen_iva, deduccion: r.deduccion, cierre: r.cierre, pagos_frac: r.pagos_frac, retenciones: r.retenciones });
          F_.tocado = true; informe.push(`✔ ${nom}: situación tributaria`);
        } else if (tipo === 'representantes') {
          const r = leerRepresentantes(t);
          F_.it.representante = r.map((x) => `${x.nombre} (${x.nif})`).join('; ');
          F_.tocado = true; informe.push(`✔ ${nom}: ${r.length} representantes`);
        } else if (tipo === 'representados') {
          const r = leerRepresentantes(t);
          F_.it.representados = r.map((x) => `${x.nombre} (${x.nif}) · ${x.situacion.toLowerCase()} ${x.tipo.toLowerCase()} desde ${fmt(x.fecha)}`).join('\n');
          F_.tocado = true; informe.push(`✔ ${nom}: ${r.length} representados`);
        } else if (tipo === 'participes') {
          const r = leerParticipes(t);
          for (const p of r) {
            const ex = S.registros.find((x) => x.tipo === 'acc' && x.empresa_id === e.id && x.datos.nif === p.nif);
            const err = await guardarRegistro(ex, { empresa_id: e.id, tipo: 'acc', ejercicio: null,
              datos: { relacion: p.tipo === 'Socio' ? 'Socio' : 'Participada', nombre: p.nombre, nif: p.nif, pct: p.pct, notas: `AEAT: ${p.estado}` } });
            if (err) throw new Error(err);
          }
          informe.push(`✔ ${nom}: ${r.length} socios/partícipes`);
        } else if (tipo === 'local') {
          const r = leerLocal(t);
          const clave = `${e.id}|${r.ref}`;
          if (!r.ref) { informe.push(`⚠ ${f.name}: no se encontró el id del recibo`); continue; }
          if (vistos.has(clave)) { informe.push(`↩ ${f.name}: repetido (${r.ref})`); continue; }
          vistos.add(clave);
          const ex = S.registros.find((x) => x.tipo === 'iloc' && x.empresa_id === e.id && x.datos.ref === r.ref);
          const estado = r.clase === 'pagado' ? 'Pagado' : 'Pendiente';
          if (ex && ex.datos.estado === 'Pagado' && estado === 'Pendiente') { informe.push(`↩ ${f.name}: ya está pagado`); continue; }
          const id = ex?.id || crypto.randomUUID();
          const sub = await subir(e.id, 'iloc', id, 'archivo', f);
          const datos = { impuesto: r.impuesto, municipio: r.municipio, per: r.periodo, objeto: r.objeto, importe: r.importe,
            vencimiento: r.vencimiento, fecha_pago: r.fecha_pago, estado, ref: r.ref, ...(sub.val ? { archivo: sub.val } : {}) };
          const err = await guardarRegistro(ex, { id, empresa_id: e.id, tipo: 'iloc', ejercicio: r.ejercicio, datos });
          if (err) throw new Error(err);
          informe.push(`✔ ${nom}: ${r.impuesto} ${r.periodo} · ${estado.toLowerCase()} · ${r.importe != null ? eur(r.importe) : '—'}`);
        }
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    for (const F_ of Object.values(ficha)) {
      if (!F_.tocado) continue;
      const { error } = await db.from('empresas').update({ datos: { ...(F_.e.datos ?? {}), it: F_.it, dreg: F_.dreg } }).eq('id', F_.e.id);
      if (error) informe.push(`✖ ${F_.e.nombre}: ${error.message}`);
    }
    await cargar(); render();
    alert(informe.join('\n') || 'No se leyó ningún archivo.');
  }

  function accion(d) {
    const reg = () => S.registros.find((r) => r.id === d.id);
    ({
      'm-new': () => formReg(d.m),
      'm-edit': () => formReg(d.m, reg()),
      'm-del': () => borrarReg(reg()),
      'm-abrir': () => abrir(d.path),
      'm-ficha': () => formFicha(d.m),
      'm-doc-edit': () => formDoc(d.m, d.slot),
      'm-doc-del': () => quitarDoc(d.m, d.slot),
      'm-pdf': () => document.getElementById('pdfIn')?.click(),
    })[d.act]?.();
  }

  return { tabs, accion, cargarPdfs };
}
