// Bloques 1 y 2 (información tributaria y registral), todo declarativo.
// Tres tipos de pestaña: lista de registros (tabla `registros`), ficha (`empresas.datos`)
// y documental (huecos con fecha, referencia y archivo en Storage, bucket `documentos`).
import { clasificar, nifDe, lineasPagina, leerCenso, leerActividades, leerObligaciones, leerSituacion,
  leerRepresentantes, leerParticipes, leerLocal, leerXlsx, leerSYS, resumenSYS } from './lectores.js?v=14';

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
    otros: { ej: false, cols: [T('nombre', 'Documento'), F('cargado', 'Cargado el'), A('archivo', 'Archivo')] },
    rmesc: { ej: false, cols: [F('fecha', 'Fecha'), T('notario', 'Notario'), T('protocolo', 'Nº protocolo'), T('tipo', 'Tipo'), T('desc', 'Descripción'), A('archivo')] },
  };

  // Pendiente en rojo; pagado / presentado / cargado… en verde.
  const HECHO = ['Pagado', 'Presentado', 'Cargado', 'Aplicado', 'Respondida', 'Cerrada'];
  const claseEstado = (e) => (e === 'Pendiente' ? 'fila-pend' : HECHO.includes(e) ? 'fila-ok' : '');

  const celda = (x, v) => {
    if (x.t === 'eur') return `<td class="num">${v == null ? '' : eur(v)}</td>`;
    if (x.t === 'num') return `<td class="num">${esc(v)}</td>`;
    if (x.t === 'date') return `<td>${fmt(v)}</td>`;
    if (x.t === 'archivo') return `<td>${verArchivo(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  };

  function filasDe(id) {
    const cfg = LISTAS[id];
    let filas = S.registros.filter((r) => r.tipo === id && (cfg.todas ? (!S.sel || r.empresa_id === S.sel) : r.empresa_id === S.sel));
    if (cfg.ej !== false) filas = filas.filter((r) => r.ejercicio === Number(S.ejercicio));
    if (S.periodo && cfg.cols.some((x) => x.k === 'periodo')) {
      filas = filas.filter((r) => !r.datos.periodo || r.datos.periodo === S.periodo || r.datos.periodo === 'Anual');
    }
    return filas;
  }

  function vistaLista(id) {
    const cfg = LISTAS[id];
    if (!cfg.todas && !S.sel) return sinEmpresa;
    const filas = filasDe(id);
    const clave = (r) => r.datos.fecha || r.datos.vencimiento || r.datos.periodo || '';
    filas.sort((a, b) => clave(a).localeCompare(clave(b)));
    const edit = puede();
    const cuerpo = filas.map((r) => `<tr class="${claseEstado(r.datos.estado)}">${cfg.todas ? `<td>${esc(empNombre(r.empresa_id))}</td>` : ''}
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
    const hecho = DOCS[id].filter(([k]) => D[k] && (D[k].fecha || D[k].ref || D[k].archivo)).length;
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
    it: ['Datos Identificativos Censales', 'Censo AEAT', () => vistaIT()],
    r111: ['Retenciones Modelo 111', 'Nóminas y profesionales', L('r111')],
    r115: ['Retenciones Modelo 115', 'Arrendamientos', L('r115')],
    r123: ['Retenciones Modelo 123', 'Capital mobiliario', L('r123')],
    pres: ['Impuestos Presentados', 'Justificantes y PDF', L('pres')],
    liq: ['Liquidaciones Presentar', 'Todas las empresas', L('liq')],
    venc: ['Pagos Domiciliados Impuestos', 'Todas las empresas', L('venc')],
    notif: ['Notificaciones y requerimientos', 'Plazos de respuesta', L('notif')],
    iloc: ['Impuestos Locales', 'IBI · IAE · IVTM', L('iloc')],
    dua: ['DUA-H1', 'Importaciones · IVA diferido', L('dua')],
    otros: ['Otros documentos', 'PDF de la empresa sin clasificar', L('otros')],
    bss: ['Balance de Sumas y Saldos', 'Cuentas del ejercicio', () => vistaBss()],
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

  // ---------- Datos censales de la AEAT, con las mismas subpestañas que la consulta ----------
  let subIT = 'censo';
  const kv = (tit, filas) => `<h4 class="it-sec">${esc(tit)}</h4><table class="kv"><tbody>${filas
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
  const dropzone = `<div class="dropzone" tabindex="0" role="button"><b>Suelta aquí los PDF de la sede de la AEAT</b> (uno o varios) o haz clic para elegirlos
    <input type="file" id="aeatIn" accept=".pdf" multiple hidden></div>`;
  const tb = (cols, filas) => `<div class="wrap"><table class="tabla tabla-it"><thead><tr>${cols.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const coma = (n) => (n == null ? '' : String(n).replace('.', ','));

  function vistaIT() {
    const e = empresa();
    if (!e) return sinEmpresa;
    const A = e.datos?.aeat;
    if (!A) return `${dropzone}<p class="hint">Aún no hay consulta de la AEAT cargada: suelta aquí sus PDF.</p>${vistaFichaDatos('it')}`;
    const subs = [['censo', 'Datos censales'], ['act', 'Relación de actividades'], ['sit', 'Situación tributaria'],
      ['soc', 'Socios / partícipes'], ['obl', 'Mis obligaciones'], ['rep', 'Mis representantes']];
    const dom = (d = {}, conRc) => [['Dirección', d.direccion], ['Tipo Vía', d.tipoVia], ['Nombre Vía', d.nombreVia], ['Tipo de Número', d.tipoNumero],
      ['Número de Casa', d.numero], ['Complemento domicilio', d.complemento],
      ...(conRc ? [['Referencia Catastral', d.refCatastral], ['Indicador de referencia catastral', d.indicadorRc]] : []),
      ['Código Postal', d.cp], ['Municipio', d.municipio], ['Provincia', d.provincia]];
    const sinDatos = '<p class="vacio">Sin datos: carga el PDF correspondiente.</p>';
    const c = A.censo, s = A.situacion;
    const cuerpo = {
      censo: () => (c ? kv('Datos identificativos del contribuyente', [['NIF', c.nif], ['Razón Social', c.razon], ['Anagrama comercial', c.anagrama],
        ['Administración de su domicilio fiscal', c.delegacion], ['Forma Jurídica', c.forma_juridica], ['Fecha de Constitución', fmt(c.constitucion)],
        ['Obligado a notificaciones electrónicas', c.notificaciones], ['Suscrito voluntariamente a notificaciones electrónicas', c.suscrito]])
        + '<h4 class="it-sec">Suministro Inmediato de Información · situación en el censo</h4>'
        + tb(['Situación', 'Fecha de Situación', 'Obligación Mensual IVA', 'Fecha Alta Efectiva', 'Fecha Baja Efectiva', 'Referencia'],
          [[c.sii_tabla?.situacion, c.sii_tabla?.fecha, c.sii_tabla?.obligacion, c.sii_tabla?.alta, c.sii_tabla?.baja, '']])
        + kv('Domicilio fiscal', dom(c.fiscal, true)) + kv('Domicilio social', dom(c.social, false)) : sinDatos),
      act: () => (A.actividades ? tb(['Sección', 'Epígrafe', 'Denominación', 'Estado', 'F.Inicio', 'F.Baja', 'Locales', 'Num.Ref.'],
        A.actividades.map((a) => [a.seccion, a.epigrafe, a.denominacion, a.estado, fmt(a.desde), '', '', ''])) : sinDatos),
      sit: () => (s ? kv('Situación tributaria', [['Régimen de IVA', s.regimen_iva], ['% provisional de deducción', s.deduccion],
        ['Cierre del ejercicio (IS)', s.cierre], ['Pagos fraccionados IS (art. 40.3)', s.pagos_frac], ['Retenciones (modelos)', s.retenciones]]) : sinDatos),
      soc: () => (A.participes ? tb(['NIF', 'Apellidos y Nombre', 'Estado', '% Part.', '% Atrib.', 'Tipo'],
        A.participes.map((p) => [p.nif, p.nombre, p.estado, coma(p.pct), coma(p.atrib), p.tipo])) : sinDatos),
      obl: () => (A.obligaciones ? tb(['Descripción de la obligación', 'Periodicidad', 'F. Alta Efec.', 'F. Baja Efec.', 'F. Ult. Modif.', 'Estado'],
        A.obligaciones.map((o) => [o.descripcion, o.periodicidad, fmt(o.alta), fmt(o.baja), fmt(o.modif), o.estado])) : sinDatos),
      rep: () => {
        const cols = ['NIF', 'Apellidos y Nombre', 'Situación', 'Tipo de representación', 'Fecha última modificación'];
        const f = (l) => l.map((x) => [x.nif, x.nombre, x.situacion, x.tipo, fmt(x.fecha)]);
        return `<h4 class="it-sec">Mis representantes</h4>${A.representantes ? tb(cols, f(A.representantes)) : sinDatos}
          <h4 class="it-sec">Mis representados</h4>${A.representados ? tb(cols, f(A.representados)) : sinDatos}`;
      },
    }[subIT]();
    return `${dropzone}<h4 class="it-tit">Información tributaria · ${esc(e.nombre)}</h4>
      <nav class="subtabs">${subs.map(([k, l]) => `<button class="${k === subIT ? 'on' : ''}" data-act="m-sub" data-sub="${k}">${l}</button>`).join('')}</nav>${cuerpo}`;
  }

  // ---------- Botones del lateral: un archivo por tipo, solo se ve el nombre ----------
  const ARCH = { emitidas: 'Emitidas', recibidas: 'Recibidas', extractos: 'Extractos', sys: 'SYS', sii: 'SII', nominas: 'Nóminas' };
  let archKind = 'impuestos';
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.\w{2,4}$/, '').replace(/[_.\-]+/g, ' ');
  const archivosDe = (k) => S.registros.filter((r) => r.tipo === 'arch-' + k && r.empresa_id === S.sel && r.ejercicio === Number(S.ejercicio));

  function cargado(k) {
    if (!S.sel) return false;
    if (ARCH[k]) return archivosDe(k).length > 0;
    if (k === 'impuestos') return !!empresa()?.datos?.aeat || S.registros.some((r) => r.empresa_id === S.sel && ['pres', 'iloc', 'otros'].includes(r.tipo));
    return S.registros.some((r) => r.empresa_id === S.sel && (r.tipo === 'rmesc'
      || (r.tipo.startsWith('doc-rm') && r.ejercicio === Number(S.ejercicio) && Object.keys(r.datos).length)));
  }
  const titulo = (k) => (ARCH[k] ? `${archivosDe(k).length} archivos` : cargado(k) ? 'Hay datos cargados' : 'Sin cargar');

  function listaArchivos() {
    if (!S.sel) return '';
    const filas = Object.keys(ARCH).flatMap((k) => archivosDe(k).map((r) => `<li><b>${ARCH[k]}</b> ${esc(r.datos.nombre)}</li>`));
    return filas.length ? `<ul class="arch">${filas.join('')}</ul>` : '<span class="hint">Sin archivos cargados</span>';
  }

  // Nombre del PDF del Registro → pestaña y hueco (acuse, nota de despacho, libro de actas…)
  function claseRegistro(nombre) {
    const n = ` ${norm(nombre)} `;
    let slot = /instancia/.test(n) ? 'instancia' : /acuse/.test(n) ? 'acuse' : /nota.*despacho/.test(n) ? 'nota' : /asiento/.test(n) ? 'asiento' : null;
    let tab = null;
    if (/acta/.test(n) && !/certific/.test(n)) { tab = 'rmactas'; slot ||= 'libro'; }
    else if (/socios|titular|compraventa/.test(n)) { tab = 'rmsocios'; slot = /titular/.test(n) ? 'titular' : /compraventa|escritura/.test(n) ? 'escritura' : slot || 'libro'; }
    else if (/diario|mayor|sumas y saldos|\bsys\b|bsit|situacion/.test(n)) {
      tab = 'rmlibros'; slot = /diario/.test(n) ? 'diario' : /mayor/.test(n) ? 'mayor' : /sumas|\bsys\b/.test(n) ? 'sys' : /bsit|situacion/.test(n) ? 'bsit' : slot;
    } else if (/certific/.test(n)) { tab = 'rmcert'; slot = /acta/.test(n) ? 'acta' : 'cert'; }
    else if (/audit/.test(n)) { tab = 'rmaud'; slot = 'informe'; }
    else if (/gestion/.test(n)) { tab = 'rmig'; slot = 'informe'; }
    else if (/memoria/.test(n)) { tab = 'rmmem'; slot = 'memoria'; }
    else if (/cuentas anuales|deposito/.test(n)) { tab = 'rmca'; slot = ['acuse', 'nota'].includes(slot) ? slot : 'cuentas'; }
    else if (slot === 'acuse') tab = 'rmacu';
    else if (slot === 'nota') tab = 'rmnota';
    else if (/escritura/.test(n)) return { tab: 'rmesc' };
    return tab && DOCS[tab]?.some(([k]) => k === slot) ? { tab, slot } : null;
  }

  async function cargarRegistro(files) {
    const estado = (m) => { const el = document.getElementById('pdfEstado'); if (el) el.textContent = m; };
    const informe = [], cache = {};
    for (const [i, f] of files.entries()) {
      try {
        estado(`Leyendo ${i + 1} de ${files.length}…`);
        let e = empresa();
        if (!e) { // sin empresa elegida: se busca por el NIF que trae el PDF
          const t = await textoPdf(f);
          e = S.empresas.find((x) => x.cif === (nifDe(t) || nifDe(f.webkitRelativePath || '')));
        }
        if (!e) { informe.push(`⚠ ${f.name}: elige la empresa o usa un PDF con su NIF`); continue; }
        const ej = parseInt((/\b(20\d\d)\b/.exec(f.name) || [])[1] ?? '', 10) || Number(S.ejercicio);
        const cl = claseRegistro(f.name);
        const nom = e.siglas || e.nombre;
        if (!cl || cl.tab === 'rmesc') {
          const id = crypto.randomUUID();
          const sub = await subir(e.id, cl ? 'rmesc' : 'otros', id, 'archivo', f);
          if (sub.error) throw new Error(sub.error);
          const err = await guardarRegistro(null, { id, empresa_id: e.id, tipo: cl ? 'rmesc' : 'otros', ejercicio: null,
            datos: cl ? { fecha: '', desc: f.name, archivo: sub.val } : { nombre: f.name, cargado: new Date().toISOString().slice(0, 10), ref: `${f.name}|${f.size}`, archivo: sub.val } });
          if (err) throw new Error(err);
          informe.push(`✔ ${nom}: ${f.name} → ${cl ? 'Escrituras' : 'Otros documentos'}`);
          continue;
        }
        const clave = `${e.id}|${cl.tab}|${ej}`;
        const c = (cache[clave] ??= (() => {
          const reg = S.registros.find((r) => r.tipo === 'doc-' + cl.tab && r.empresa_id === e.id && r.ejercicio === ej);
          return { reg, empresa: e.id, tab: cl.tab, ej, datos: { ...(reg?.datos ?? {}) } };
        })());
        const sub = await subir(e.id, `doc-${cl.tab}-${ej}`, 'doc', cl.slot, f);
        if (sub.error) throw new Error(sub.error);
        c.datos[cl.slot] = { fecha: c.datos[cl.slot]?.fecha ?? '', ref: c.datos[cl.slot]?.ref ?? '', archivo: sub.val };
        informe.push(`✔ ${nom}: ${f.name} → ${tabs[cl.tab][0]} (${DOCS[cl.tab].find(([k]) => k === cl.slot)[1]}, ${ej})`);
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    for (const c of Object.values(cache)) {
      const err = await guardarRegistro(c.reg, { ...(c.reg ? {} : { id: crypto.randomUUID() }), empresa_id: c.empresa, tipo: 'doc-' + c.tab, ejercicio: c.ej, datos: c.datos });
      if (err) informe.push(`✖ ${tabs[c.tab][0]}: ${err}`);
    }
    estado('');
    await cargar(); render();
    alert(informe.join('\n') || 'No se cargó ningún archivo.');
  }

  // Balance de sumas y saldos: guarda el archivo, las cuentas y rellena el saldo contable de las conciliaciones anuales
  async function cargarSYS(files) {
    const informe = [];
    const porNombre = (name) => {
      const n = ` ${norm(name)} `;
      return S.empresas.map((x) => [x, norm(x.nombre).replace(/\s(s l|s a|sl|sa)$/, '').trim()])
        .filter(([, k]) => k.length > 3 && n.includes(` ${k} `)).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
    };
    for (const f of files) {
      try {
        const e = porNombre(f.name) ?? empresa();
        if (!e) { informe.push(`⚠ ${f.name}: elige la empresa (no la reconozco por el nombre)`); continue; }
        const ej = parseInt((/\b(20\d\d)\b/.exec(f.name) || [])[1] ?? '', 10) || Number(S.ejercicio);
        const cuentas = leerSYS(await leerXlsx(await f.arrayBuffer(), window.JSZip));
        if (!cuentas) { informe.push(`❔ ${f.name}: no parece un balance de sumas y saldos`); continue; }
        const nom = e.siglas || e.nombre;
        const ref = `${f.name}|${f.size}`;
        if (!S.registros.some((r) => r.tipo === 'arch-sys' && r.empresa_id === e.id && r.datos.ref === ref)) {
          const id = crypto.randomUUID();
          const sub = await subir(e.id, 'arch-sys', id, 'archivo', f);
          if (sub.error) throw new Error(sub.error);
          const err = await guardarRegistro(null, { id, empresa_id: e.id, tipo: 'arch-sys', ejercicio: ej,
            datos: { nombre: f.name, ref, archivo: sub.val, subido: new Date().toISOString().slice(0, 10) } });
          if (err) throw new Error(err);
        }
        const ex = S.registros.find((r) => r.tipo === 'sys' && r.empresa_id === e.id && r.ejercicio === ej);
        const err = await guardarRegistro(ex, { ...(ex ? {} : { id: crypto.randomUUID() }), empresa_id: e.id, tipo: 'sys', ejercicio: ej, datos: { nombre: f.name, cuentas } });
        if (err) throw new Error(err);
        let n = 0;
        for (const r of resumenSYS(cuentas)) { // saldo contable de cada cuenta; el importe oficial y las notas no se tocan
          const c = S.conciliaciones.find((x) => x.empresa_id === e.id && x.ejercicio === ej && x.periodo === 'Anual' && x.cuenta === r.clave);
          const { error } = c
            ? await db.from('conciliaciones').update({ saldo_contable: r.valor }).eq('id', c.id)
            : await db.from('conciliaciones').insert({ empresa_id: e.id, ejercicio: ej, periodo: 'Anual', cuenta: r.clave, concepto: r.concepto,
              fuente: 'Balance de sumas y saldos', saldo_contable: r.valor, importe_oficial: 0 });
          if (error) throw new Error(error.message);
          n++;
        }
        informe.push(`✔ ${nom} ${ej}: ${cuentas.length} cuentas · ${n} conciliaciones con su saldo contable`);
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    await cargar(); render();
    alert(informe.join('\n'));
  }

  // Pestaña «Balance de Sumas y Saldos»
  let bssFiltro = '';
  function vistaBss() {
    const e = empresa();
    if (!e) return sinEmpresa;
    const reg = S.registros.find((r) => r.tipo === 'sys' && r.empresa_id === e.id && r.ejercicio === Number(S.ejercicio));
    if (!reg) return `<p class="vacio">No hay balance de ${esc(S.ejercicio)}. Cárgalo con el botón SYS (el ejercicio se toma del nombre del archivo).</p>`;
    const todas = reg.datos.cuentas;
    const filtros = [['', 'Todas'], ['47', 'Grupo 47'], ['465', '465'], ['640', '640'], ['642', '642'], ['4', 'Grupo 4'], ['6', 'Gastos (6)'], ['7', 'Ingresos (7)']];
    const filas = todas.filter((c) => !bssFiltro || c.cuenta.startsWith(bssFiltro));
    const suma = (k) => filas.reduce((a, c) => a + c[k], 0);
    const ks = ['apertura', 'debe', 'haber', 'ajustes', 'previo', 'cierre'];
    return `<div class="bar">${filtros.map(([k, l]) => `<button class="small${k === bssFiltro ? ' primary' : ''}" data-act="m-bss" data-f="${k}">${l}</button>`).join('')}
      <span class="space"></span><span class="chip">${esc(reg.datos.nombre)} · ${filas.length} de ${todas.length} cuentas</span></div>
      <div class="wrap"><table class="tabla"><thead><tr><th>Cuenta</th><th>Nombre</th><th class="num">Saldo de apertura</th><th class="num">Débito</th>
        <th class="num">Crédito</th><th class="num">Ajustes</th><th class="num">Saldo antes del cierre</th><th class="num">Saldo de cierre</th></tr></thead>
        <tbody>${filas.map((c) => `<tr><td><b>${esc(c.cuenta)}</b></td><td>${esc(c.nombre)}</td>${ks.map((k) => `<td class="num">${eur(c[k])}</td>`).join('')}</tr>`).join('')}
        <tr><td></td><td><b>Total</b></td>${ks.map((k) => `<td class="num"><b>${eur(suma(k))}</b></td>`).join('')}</tr></tbody></table></div>
      <p class="hint">«Saldo antes del cierre» = apertura + débito − crédito + ajustes. El saldo de cierre sale a cero porque el ejercicio ya está regularizado.</p>`;
  }

  async function subirArchivos(files) {
    if (archKind === 'sys') return cargarSYS(files);
    if (archKind === 'impuestos') return cargarPdfs(files);
    if (archKind === 'registro') return cargarRegistro(files);
    if (!S.sel) return void alert('Elige primero la empresa en el desplegable de la izquierda.');
    const informe = [], vistos = new Set();
    for (const f of files) {
      try {
        const ref = `${f.name}|${f.size}`;
        if (vistos.has(ref) || archivosDe(archKind).some((r) => r.datos.ref === ref)) { informe.push(`↩ ${f.name}: repetido`); continue; }
        vistos.add(ref);
        const id = crypto.randomUUID();
        const sub = await subir(S.sel, 'arch-' + archKind, id, 'archivo', f);
        if (sub.error) throw new Error(sub.error);
        const err = await guardarRegistro(null, { id, empresa_id: S.sel, tipo: 'arch-' + archKind, ejercicio: Number(S.ejercicio),
          datos: { nombre: f.name, ref, archivo: sub.val, subido: new Date().toISOString().slice(0, 10) } });
        if (err) throw new Error(err);
        informe.push(`✔ ${f.name}`);
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    await cargar(); render();
    alert(`${ARCH[archKind]}: ${informe.length} archivos\n${informe.join('\n')}\n\nSe guardan en la empresa y el ejercicio elegidos.`);
  }

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
    const estado = (m) => { const el = document.getElementById('pdfEstado'); if (el) el.textContent = m; };
    for (const [i, f] of files.entries()) {
      try {
        if (!/\.pdf$/i.test(f.name)) { informe.push(`↷ ${f.name}: no es PDF`); continue; }
        estado(`Leyendo ${i + 1} de ${files.length}…`);
        const t = await textoPdf(f);
        const tipo = clasificar(t);
        const nif = nifDe(t) || nifDe(f.webkitRelativePath || '');
        const e = S.empresas.find((x) => x.cif === nif);
        if (!e) { informe.push(`⚠ ${f.name}: ${nif ? `el NIF ${nif} no coincide con ninguna empresa` : 'no se encontró el NIF'}`); continue; }
        const nom = e.siglas || e.nombre;
        if (!tipo) { // PDF de la empresa que aún no sabemos leer: se guarda en «Otros documentos»
          const ref = `${f.name}|${f.size}`;
          if (vistos.has(e.id + ref) || S.registros.some((x) => x.tipo === 'otros' && x.empresa_id === e.id && x.datos.ref === ref)) {
            informe.push(`↩ ${f.name}: repetido`); continue;
          }
          vistos.add(e.id + ref);
          const id = crypto.randomUUID();
          const sub = await subir(e.id, 'otros', id, 'archivo', f);
          if (sub.error) throw new Error(sub.error);
          const err = await guardarRegistro(null, { id, empresa_id: e.id, tipo: 'otros', ejercicio: null,
            datos: { nombre: f.name, cargado: new Date().toISOString().slice(0, 10), ref, archivo: sub.val } });
          if (err) throw new Error(err);
          informe.push(`📎 ${nom}: ${f.name} (guardado sin clasificar)`);
          continue;
        }
        const F_ = (ficha[e.id] ??= { e, it: { ...(e.datos?.it ?? {}) }, dreg: { ...(e.datos?.dreg ?? {}) }, aeat: { ...(e.datos?.aeat ?? {}) }, tocado: false });
        if (tipo === 'censo') {
          const r = leerCenso(t);
          Object.assign(F_.it, { nif: r.nif, razon: r.razon, domicilio: r.domicilio_fiscal, ref_catastral: r.ref_catastral,
            delegacion: r.delegacion, sii: r.sii, notificaciones: r.notificaciones });
          Object.assign(F_.dreg, { nif: r.nif, constitucion: r.constitucion, domicilio: r.domicilio_social });
          F_.tocado = true; F_.aeat.censo = r; informe.push(`✔ ${nom}: datos censales`);
        } else if (tipo === 'actividades') {
          const r = leerActividades(t);
          F_.it.iae = r.map((a) => a.epigrafe).join(', ');
          F_.it.actividades = r.map((a) => `${a.epigrafe} ${a.denominacion} (${a.estado} desde ${fmt(a.desde)})`).join('\n');
          F_.tocado = true; F_.aeat.actividades = r; informe.push(`✔ ${nom}: ${r.length} actividades`);
        } else if (tipo === 'obligaciones') {
          const r = leerObligaciones(t);
          F_.it.obligaciones = r.map((o) => `${o.descripcion} · ${o.periodicidad.toLowerCase()} · ${o.estado.toLowerCase()} desde ${fmt(o.alta)}`).join('\n');
          const iva = r.find((o) => /VALOR AÑADIDO/.test(o.descripcion));
          if (iva) F_.it.periodicidad = iva.periodicidad === 'MENSUAL' ? 'Mensual' : 'Trimestral';
          F_.tocado = true; F_.aeat.obligaciones = r; informe.push(`✔ ${nom}: ${r.length} obligaciones censales`);
        } else if (tipo === 'situacion') {
          const r = leerSituacion(t);
          Object.assign(F_.it, { regimen: r.regimen_iva, deduccion: r.deduccion, cierre: r.cierre, pagos_frac: r.pagos_frac, retenciones: r.retenciones });
          F_.tocado = true; F_.aeat.situacion = r; informe.push(`✔ ${nom}: situación tributaria`);
        } else if (tipo === 'representantes') {
          const r = leerRepresentantes(t);
          F_.it.representante = r.map((x) => `${x.nombre} (${x.nif})`).join('; ');
          F_.tocado = true; F_.aeat.representantes = r; informe.push(`✔ ${nom}: ${r.length} representantes`);
        } else if (tipo === 'representados') {
          const r = leerRepresentantes(t);
          F_.it.representados = r.map((x) => `${x.nombre} (${x.nif}) · ${x.situacion.toLowerCase()} ${x.tipo.toLowerCase()} desde ${fmt(x.fecha)}`).join('\n');
          F_.tocado = true; F_.aeat.representados = r; informe.push(`✔ ${nom}: ${r.length} representados`);
        } else if (tipo === 'participes') {
          const r = leerParticipes(t);
          for (const p of r) {
            const ex = S.registros.find((x) => x.tipo === 'acc' && x.empresa_id === e.id && x.datos.nif === p.nif);
            const err = await guardarRegistro(ex, { empresa_id: e.id, tipo: 'acc', ejercicio: null,
              datos: { relacion: p.tipo === 'Socio' ? 'Socio' : 'Participada', nombre: p.nombre, nif: p.nif, pct: p.pct, notas: `AEAT: ${p.estado}` } });
            if (err) throw new Error(err);
          }
          F_.aeat.participes = r; F_.tocado = true; informe.push(`✔ ${nom}: ${r.length} socios/partícipes`);
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
      const { error } = await db.from('empresas').update({ datos: { ...(F_.e.datos ?? {}), it: F_.it, dreg: F_.dreg, aeat: F_.aeat } }).eq('id', F_.e.id);
      if (error) informe.push(`✖ ${F_.e.nombre}: ${error.message}`);
    }
    await cargar(); render();
    estado('');
    const ok = informe.filter((l) => l.startsWith('✔'));
    const resto = informe.filter((l) => !l.startsWith('✔'));
    alert([`${ok.length} de ${files.length} archivos leídos y asignados a su empresa.`, ...(ok.length <= 12 ? ok : []),
      ...resto.slice(0, 30), resto.length > 30 ? `… y ${resto.length - 30} avisos más` : ''].filter(Boolean).join('\n'));
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
      'm-sub': () => { subIT = d.sub; render(); },
      'm-bss': () => { bssFiltro = d.f; render(); },
      'm-sube': () => {
        archKind = d.kind;
        const inp = document.getElementById('archIn');
        inp.accept = d.kind === 'impuestos' || d.kind === 'registro' ? '.pdf' : '.xlsx,.xls,.csv,.txt,.pdf';
        inp.click();
      },
      'm-pdf': () => document.getElementById('pdfIn')?.click(),
      'm-carpeta': () => document.getElementById('carpetaIn')?.click(),
    })[d.act]?.();
  }

  // Insignias de las fichas del menú (texto y color)
  const unidad = { pres: 'declaraciones', iloc: 'recibos', notif: 'notificaciones', otros: 'documentos', acc: 'socios y participadas', trl: 'titulares', rmesc: 'escrituras' };
  const badges = {};
  Object.keys(LISTAS).forEach((id) => {
    badges[id] = () => {
      if (!LISTAS[id].todas && !S.sel) return { t: 'Por empresa' };
      const fs = filasDe(id);
      const pend = fs.filter((r) => r.datos.estado === 'Pendiente').length;
      if (pend) return { t: `${pend} pendientes`, c: 'rojo' };
      return fs.length ? { t: `${fs.length} ${unidad[id] ?? 'registros'}`, c: fs.some((r) => HECHO.includes(r.datos.estado)) ? 'verde' : '' } : { t: 'Sin datos' };
    };
  });
  Object.keys(DOCS).forEach((id) => {
    badges[id] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const D = regDoc(id)?.datos ?? {};
      const n = DOCS[id].filter(([k]) => D[k] && (D[k].fecha || D[k].ref || D[k].archivo)).length;
      return { t: `${n} de ${DOCS[id].length}`, c: n === DOCS[id].length ? 'verde' : '' };
    };
  });
  badges.bss = () => {
    if (!S.sel) return { t: 'Por empresa' };
    const reg = S.registros.find((r) => r.tipo === 'sys' && r.empresa_id === S.sel && r.ejercicio === Number(S.ejercicio));
    return reg ? { t: `${reg.datos.cuentas.length} cuentas`, c: 'verde' } : { t: 'Sin datos' };
  };
  Object.keys(FICHAS).forEach((id) => {
    badges[id] = () => {
      const e = empresa();
      if (!e) return { t: 'Por empresa' };
      const n = FICHAS[id].filter((x) => e.datos?.[id]?.[x.k]).length;
      return { t: `${n} de ${FICHAS[id].length} datos`, c: n === FICHAS[id].length ? 'verde' : '' };
    };
  });

  return { tabs, accion, cargarPdfs, badges, subirArchivos, cargado, titulo, listaArchivos };
}
