// Bloques 1 y 2 (información tributaria y registral), todo declarativo.
// Tres tipos de pestaña: lista de registros (tabla `registros`), ficha (`empresas.datos`)
// y documental (huecos con fecha, referencia y archivo en Storage, bucket `documentos`).
import { clasificar, nifDe, lineasPagina, leerCenso, leerActividades, leerObligaciones, leerSituacion,
  leerRepresentantes, leerParticipes, leerLocal, leerXlsx, leerSYS, resumenSYS, leerSituacionCompleta, leerLibroIVA, leerSII, conciliarSII, rangoPeriodo, calcular303, calcularRet, calcular349, casillasPDF, cabeceraPresentado, valoresPresentado } from './lectores.js?v=33';

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
    const pres = prsComoLista();
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
    nom: ['Nóminas', 'Cuadrante de la gestoría (a mano)', () => vistaNom()],
    cssoc: ['Conciliación Seguridad Social', 'Pagos · nóminas · IT · FUNDAE', () => vistaCssoc()],
    cnom: ['Control de nóminas', 'Cuadrante · 111 · 190 · ratios', () => vistaCnom()],
    it: ['Datos Identificativos Censales', 'Censo AEAT', () => vistaIT()],
    r111: ['Retenciones Modelo 111', 'Nóminas y profesionales', () => vistaListadoRet('111')],
    r115: ['Retenciones Modelo 115', 'Arrendamientos', () => vistaListadoRet('115')],
    r123: ['Retenciones Modelo 123', 'Capital mobiliario', () => vistaListadoRet('123')],
    pres: ['Impuestos Presentados', 'Justificantes y PDF', () => vistaPrs()],
    liq: ['Liquidaciones Presentar', 'Todas las empresas', L('liq')],
    venc: ['Pagos Domiciliados Impuestos', 'Todas las empresas', L('venc')],
    notif: ['Notificaciones y requerimientos', 'Plazos de respuesta', L('notif')],
    iloc: ['Impuestos Locales', 'IBI · IAE · IVTM', L('iloc')],
    dua: ['DUA-H1', 'Importaciones · IVA diferido', L('dua')],
    otros: ['Otros documentos', 'PDF de la empresa sin clasificar', L('otros')],
    bss: ['Balance de Sumas y Saldos', 'Cuentas del ejercicio', () => vistaBss()],
    mod111: ['Modelo 111', 'Retenciones IRPF', () => vistaRet('111')],
    mod115: ['Modelo 115', 'Retenciones alquiler', () => vistaRet('115')],
    mod123: ['Modelo 123', 'Capital mobiliario', () => vistaRet('123')],
    mod200: ['Modelo 200', 'IS desde balance y PyG', pendienteMod('Mod200')],
    mod202: ['Modelo 202', 'Pagos fraccionados IS', pendienteMod('Mod202')],
    mod303: ['Modelo 303', 'IVA', () => vistaMod303()],
    mod349: ['Modelo 349', 'Intracomunitarias', () => vistaMod349()],
    mod583: ['Modelo 583', 'Producción energía eléctrica', pendienteMod('Mod583')],
    mod592: ['Modelo 592', 'Envases de plástico', pendienteMod('Mod592')],
    moda22: ['Modelo A22', 'Devoluciones plástico', pendienteMod('(sin hoja propia en el Excel)')],
    mod180: ['Modelo 180', 'Resumen anual 115', () => vistaRetAnual('115')],
    mod190: ['Modelo 190', 'Resumen anual 111', () => vistaRetAnual('111')],
    mod193: ['Modelo 193', 'Resumen anual 123', () => vistaRetAnual('123')],
    mod232: ['Modelo 232', 'Operaciones vinculadas', pendienteMod('(sin hoja propia en el Excel)')],
    mod390: ['Modelo 390', 'Resumen anual IVA', () => vistaMod390()],
    modintra: ['Intrastat', 'Fichero AEAT', pendienteMod('Intrastat / Export Intrastat')],
    siie: ['SII Emitidas', 'Libro registro de facturas emitidas', () => dz('sii', 'Suelta aquí el Excel del SII de facturas emitidas', '(descarga de la sede de la AEAT) o haz clic para elegirlo') + vistaSII('E')],
    siir: ['SII Recibidas', 'Libro registro de facturas recibidas', () => dz('sii', 'Suelta aquí el Excel del SII de facturas recibidas', '(descarga de la sede de la AEAT) o haz clic para elegirlo') + vistaSII('R')],
    concsiie: ['Conciliación SII Emitidas', 'SII frente a contabilidad', () => vistaConcSII('E')],
    concsiir: ['Conciliación SII Recibidas', 'SII frente a contabilidad', () => vistaConcSII('R')],
    fe: ['Facturas emitidas', 'Libro de IVA repercutido', () => dz('emitidas', 'Suelta aquí el libro de IVA repercutido', '(Excel del ERP) o haz clic para elegirlo') + vistaFacturas('E')],
    fr: ['Facturas recibidas', 'Libro de IVA soportado', () => dz('recibidas', 'Suelta aquí el libro de IVA soportado', '(Excel del ERP) o haz clic para elegirlo') + vistaFacturas('R')],
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
  // dcha: posiciones de las columnas numéricas (alineadas a la derecha)
  const tb = (cols, filas, dcha = []) => `<div class="wrap"><table class="tabla tabla-it"><thead><tr>${cols.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((v, i) => `<td${dcha.includes(i) ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const coma = (n) => (n == null ? '' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const guiones = (d) => (d ? d.split('-').reverse().join('-') : '');

  function tablaSituacion(f) {
    let sec = '';
    const filas = f.filas.map((r) => {
      const cab = r.seccion !== sec ? `<tr class="sec"><td colspan="4">${esc((sec = r.seccion))}</td></tr>` : '';
      return `${cab}<tr><td class="num">${esc(r.casilla)}</td><td>${esc(r.concepto)}</td><td class="marca">${esc(r.marca)}</td><td class="c">${esc(r.fecha)}</td></tr>`;
    }).join('');
    return `<p>Estado situación tributaria: <b>${esc(f.estado)}</b></p><div class="wrap"><table class="tabla tabla-it">
      <thead><tr><th>Casilla</th><th>Concepto</th><th>Marcado / situación</th><th>Fecha</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="hint">Solo las casillas marcadas en la declaración censal. En las preguntas Sí/No (500, 501) el PDF solo trae la X: compruébalo en el original.</p>`;
  }

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
      act: () => (A.actividades ? tb(['Sección', 'Epígrafe', 'Denominación', 'Estado', 'F. Inicio', 'F. Baja'],
        A.actividades.map((a) => [a.seccion, a.epigrafe, a.denominacion, a.estado, guiones(a.desde), ''])) : sinDatos),
      sit: () => (A.situacionFull ? tablaSituacion(A.situacionFull) : s ? kv('Situación tributaria (resumen)', [['Régimen de IVA', s.regimen_iva],
        ['% provisional de deducción', s.deduccion], ['Cierre del ejercicio (IS)', s.cierre], ['Pagos fraccionados IS (art. 40.3)', s.pagos_frac],
        ['Retenciones (modelos)', s.retenciones]]) + '<p class="hint">Vuelve a soltar el PDF «Situación Tributaria» para ver todas las casillas.</p>' : sinDatos),
      soc: () => {
        if (!A.participes) return sinDatos;
        const alta = A.participes.filter((p) => p.estado === 'Alta').reduce((a, p) => a + p.pct, 0);
        return tb(['NIF', 'Apellidos y nombre / Razón social', 'Estado', '% Part.', '% Atrib.', 'Tipo'],
          A.participes.map((p) => [p.nif, p.nombre, p.estado, coma(p.pct), coma(p.atrib), p.tipo]), [3, 4])
          + `<p class="hint">Total % participación (altas): <b>${coma(alta)} %</b></p>`;
      },
      obl: () => (A.obligaciones ? tb(['Descripción de la obligación', 'Periodicidad', 'F. Alta efec.', 'F. Baja efec.', 'F. Últ. modif.', 'Estado'],
        A.obligaciones.map((o) => [o.descripcion, o.periodicidad, fmt(o.alta), fmt(o.baja), fmt(o.modif), o.estado])) : sinDatos),
      rep: () => (A.representantes ? tb(['NIF', 'Apellidos y nombre', 'Situación', 'Tipo de representación', 'Fecha última modificación'],
        A.representantes.map((x) => [x.nif, x.nombre, x.situacion, x.tipo, `${guiones(x.fecha)} ${x.hora ?? ''}`.trim()])) : sinDatos),
    }[subIT]();
    return `${dropzone}<section class="block"><h4 class="it-tit">Información tributaria · ${esc(e.nombre)}</h4>
      <nav class="subtabs">${subs.map(([k, l]) => `<button class="${k === subIT ? 'on' : ''}" data-act="m-sub" data-sub="${k}">${l}</button>`).join('')}</nav>${cuerpo}</section>`;
  }

  // ---------- Bloque 6: SII y libros de IVA ----------
  // Las facturas son muchas: se guardan en filas aparte (fact-E, fact-R, sii-E, sii-R) y se leen solo al abrir la pestaña.
  const GR = new Map(); // `${tipo}|${empresa}` → filas (null mientras carga)
  function grande(tipo) {
    const k = `${tipo}|${S.sel}`;
    if (GR.has(k)) return GR.get(k);
    GR.set(k, null);
    db.from('registros').select('datos').eq('empresa_id', S.sel).eq('tipo', tipo).maybeSingle()
      .then(({ data }) => { GR.set(k, data?.datos?.filas ?? []); render(); });
    return null;
  }
  // Solo mira lo que ya está cargado (las insignias del menú no deben disparar descargas pesadas)
  // Las insignias del panel de modelos enseñan importes: al abrir el grupo se piden los libros de la empresa elegida (una vez, luego quedan en memoria)
  const peek = (tipo) => (S.sel ? grande(tipo) : null);
  async function guardarGrande(tipo, empresaId, nuevas, clave) {
    const { data } = await db.from('registros').select('id,datos').eq('empresa_id', empresaId).eq('tipo', tipo).maybeSingle();
    const mapa = new Map((data?.datos?.filas ?? []).map((x) => [clave(x), x]));
    nuevas.forEach((x) => mapa.set(clave(x), x));
    const filas = [...mapa.values()];
    const err = await guardarRegistro(data, { ...(data ? {} : { id: crypto.randomUUID() }), empresa_id: empresaId, tipo, ejercicio: null, datos: { filas } });
    if (err) throw new Error(err);
    GR.set(`${tipo}|${empresaId}`, filas);
    return filas.length;
  }
  // Libro de IVA del ERP o consulta del SII: se reconoce por las cabeceras
  async function ingestaIVA(f, empresaId) {
    const filas = await leerXlsx(await f.arrayBuffer(), window.JSZip);
    const sii = leerSII(filas);
    if (sii) {
      const s = sii[0].sentido;
      const n = await guardarGrande('sii-' + s, empresaId, sii, (x) => `${x.factura}|${x.nif}|${x.ej}|${x.per}`);
      return `✔ ${f.name}: SII ${s === 'E' ? 'emitidas' : 'recibidas'} · ${sii.length} facturas leídas (${n} en total)`;
    }
    const lib = leerLibroIVA(filas);
    if (lib) {
      const partes = [];
      for (const s of ['E', 'R']) {
        const x = lib.filter((l) => l.sentido === s);
        if (x.length) { await guardarGrande('fact-' + s, empresaId, x, (l) => [l.factura, l.nif, l.ff, l.base, l.cuota, l.codigo, l.asiento].join('|')); partes.push(`${x.length} ${s === 'E' ? 'repercutidas' : 'soportadas'}`); }
      }
      return `✔ ${f.name}: libro de IVA · ${partes.join(' y ')}`;
    }
    return `❔ ${f.name}: guardado, pero no reconozco el formato (libro de IVA del ERP o consulta del SII)`;
  }

  const SENT = { E: { lib: 'repercutido', cuota: 'Cuota repercutida', nif: 'NIF destinatario', boton: 'EMITIDAS' }, R: { lib: 'soportado', cuota: 'Cuota soportada', nif: 'NIF emisor', boton: 'RECIBIDAS' } };
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  // Franja punteada para soltar un Excel (kind = botón del lateral al que equivale: sii, emitidas, recibidas)
  const dz = (kind, titulo, sub, acc = '.xlsx,.xls,.csv') => `<div class="dropzone" data-kind="${kind}" tabindex="0" role="button"><b>${titulo}</b> ${sub}
    <input type="file" data-dzkind="${kind}" accept="${acc}" multiple hidden></div>`;
  const suma = (a, k) => a.reduce((t, x) => t + x[k], 0);
  const TOPE = 1000;
  const tope = (n) => (n > TOPE ? `<p class="hint">Se muestran las ${TOPE} primeras de ${n}; el resto está cargado y cuenta en los totales.</p>` : '');
  const celdasNum = (v) => `<td class="num">${eur(v)}</td>`;

  // ---------- Facturas emitidas / recibidas: cabecera de filtros, columnas y acciones por línea ----------
  let fcCod = '', fcPais = '', fcQ = '';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const PREFIJOS = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'FI', 'FR', 'GB', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI', 'CH', 'NO', 'US', 'AD', 'MA']);
  const paisDe = (nif) => {
    const n = String(nif ?? '').toUpperCase();
    if (/^[A-HJ-NP-SUVW]\d{7}[0-9A-J]$/.test(n) || /^[XYZ]\d{7}[A-Z]$/.test(n) || /^\d{8}[A-Z]$/.test(n)) return 'ES';
    const p = n.slice(0, 2);
    return /^[A-Z]{2}/.test(n) && PREFIJOS.has(p) ? (p === 'EL' ? 'GR' : p) : 'ES';
  };
  const CLASIF = [[/^R\.NC\.EX$/, 'Operación interior exenta (art. 20)'], [/^R\.NC\./, 'Operación interior sujeta'], [/^R\.UE\.S$/, 'Prestación intracomunitaria de servicios'],
    [/^R\.UE$/, 'Entrega intracomunitaria de bienes'], [/^R\.UE\./, 'Adquisición intracomunitaria (autorrepercusión)'], [/^R\.EX/, 'Exportación'],
    [/^R\.NAC\.NS/, 'Operación no sujeta'], [/^R\.RC\./, 'Recargo de equivalencia'], [/^(R\.ISP|S\.NC\.ISP\.A)/, 'Inversión del sujeto pasivo'],
    [/^S\.NC\.EX/, 'Compra exenta (art. 20)'], [/^(S\.NC\.ISP|S\.ISP)/, 'Inversión del sujeto pasivo'], [/^S\.NC\./, 'Operación interior soportada'],
    [/^S\.UE\./, 'Adquisición intracomunitaria'], [/^S\.NAC\.NS/, 'Compra no sujeta'], [/^S\.EX\./, 'Importación exenta (art. 21)'], [/^IN\./, 'Bien de inversión'],
    [/^DUA/, 'Importación (DUA)'], [/^I\.PR/, 'Retención · profesionales'], [/^I\.ALQ/, 'Retención · alquiler'], [/^I\.INT/, 'Retención · intereses'], [/^I\.DV/, 'Retención · dividendos']];
  const clasif = (c) => (CLASIF.find(([re]) => re.test(c)) || [0, c])[1];
  const claveL = (l) => [l.asiento, l.factura, l.nif, l.ff, l.base, l.cuota, l.codigo].join('|');
  const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sentidoTab = () => (S.tab === 'fr' ? 'R' : 'E');

  function lineasFc(s, datos) {
    const r = rangoPeriodo(Number(S.ejercicio), S.periodo);
    let f = datos.filter((l) => { const d = s === 'E' ? l.ff : l.fecha; return d >= r.desde && d <= r.hasta; });
    if (fcCod) f = f.filter((l) => l.codigo === fcCod);
    if (fcPais) f = f.filter((l) => paisDe(l.nif) === fcPais);
    if (fcQ) { const q = sinAc(fcQ); f = f.filter((l) => sinAc(`${l.nif} ${l.nombre} ${l.factura}`).includes(q)); }
    return f;
  }

  function cuerpoFc(s, datos) {
    const f = lineasFc(s, datos);
    const n = new Set(f.map((l) => l.factura)).size;
    const otro = s === 'E' ? 'Recibidas' : 'Emitidas';
    const acc = (l) => {
      if (!puede()) return '';
      const a = (op, t) => `<button class="pill" data-act="m-fc" data-op="${op}" data-s="${s}" data-k="${esc(claveL(l))}">${t}</button>`;
      return `${a('signo', '± signo')}${a('mover', `→ ${otro}`)}${a('linea', '✕ línea')}${a('factura', '✕ factura')}`;
    };
    const filas = f.map((l) => { // todas las líneas del periodo, sin límite
      const p = paisDe(l.nif);
      return `<tr class="fc"><td>${fmt(s === 'E' ? l.ff : l.fecha)}</td><td>${esc(l.factura)}</td><td class="${p !== 'ES' ? 'nif-ext' : ''}">${esc(l.nif)}</td><td>${esc(l.nombre)}</td>
        <td>${p}</td><td>${esc(l.codigo)}</td>${celdasNum(l.base)}<td class="num">${Number(l.pct).toFixed(2).replace('.', ',')}</td>${celdasNum(l.cuota)}
        <td class="num">${/^R\.RC\./.test(l.codigo) ? eur(l.cuota) : ''}</td><td>${esc(clasif(l.codigo))}</td><td class="acc">${acc(l)}</td></tr>`;
    }).join('');
    const tot = `<tr><td colspan="6"><b>Total</b></td>${celdasNum(suma(f, 'base'))}<td></td>${celdasNum(suma(f, 'cuota'))}<td colspan="3"></td></tr>`;
    return { n, html: `<div class="wrap"><table class="tabla tabla-it"><thead><tr><th>Fecha</th><th>Nº factura</th><th>NIF</th><th>Nombre</th><th>País</th><th>Código</th>
      <th>Base</th><th>% IVA</th><th>Cuota</th><th>Recargo</th><th>Clasificación</th><th></th></tr></thead><tbody>${filas}${f.length ? tot : ''}</tbody></table></div>` };
  }

  function vistaFacturas(s) {
    if (!S.sel) return sinEmpresa;
    const datos = grande('fact-' + s);
    if (!datos) return cargandoTxt;
    if (!datos.length) return `<p class="vacio">Sin datos: carga el libro de IVA ${SENT[s].lib} con el botón ${SENT[s].boton}.</p>`;
    const ej = Number(S.ejercicio);
    const per = [`<option value="">Todo el ejercicio ${ej}</option>`,
      ...MESES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}"${S.periodo === v ? ' selected' : ''}>Periodo ${v} (${m}) ${ej}</option>`; }),
      ...['1T', '2T', '3T', '4T'].map((q) => `<option value="${q}"${S.periodo === q ? ' selected' : ''}>Trimestre ${q} ${ej}</option>`)].join('');
    const sel = (campo, valor, lista) => `<select data-fc="${campo}"><option value="">Todos</option>${lista.map((x) => `<option${x === valor ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    const c = cuerpoFc(s, datos);
    return `<div class="fc-cab"><label>Ver <select data-glob="periodo">${per}</select></label>
      <label>Código ${sel('cod', fcCod, [...new Set(datos.map((l) => l.codigo))].sort())}</label>
      <label>País ${sel('pais', fcPais, [...new Set(datos.map((l) => paisDe(l.nif)))].sort())}</label>
      <input data-fq type="search" placeholder="Buscar NIF, nombre, factura…" value="${esc(fcQ)}"><span id="fcCuenta" class="hint">${c.n} facturas</span></div>
      <div id="fcTabla">${c.html}</div>`;
  }

  // La búsqueda actualiza solo la tabla, para no perder el cursor al escribir
  function buscarFc(v) {
    fcQ = v;
    const s = sentidoTab(), datos = GR.get(`fact-${s}|${S.sel}`);
    if (!datos) return;
    const c = cuerpoFc(s, datos);
    const t = document.getElementById('fcTabla'), n = document.getElementById('fcCuenta');
    if (t) t.innerHTML = c.html;
    if (n) n.textContent = `${c.n} facturas`;
  }
  function setFc(campo, valor) { if (campo === 'cod') fcCod = valor; else fcPais = valor; render(); }

  async function reemplazarGrande(tipo, empresaId, filas, existente) {
    const ex = existente ?? (await db.from('registros').select('id').eq('empresa_id', empresaId).eq('tipo', tipo).maybeSingle()).data;
    const err = await guardarRegistro(ex, { ...(ex ? {} : { id: crypto.randomUUID() }), empresa_id: empresaId, tipo, ejercicio: null, datos: { filas } });
    if (err) return void alert(err);
    GR.set(`${tipo}|${empresaId}`, filas);
  }

  // ± signo · → pasar al otro libro · ✕ línea · ✕ factura
  async function opFc(s, op, key) {
    const tipo = 'fact-' + s;
    const arr = GR.get(`${tipo}|${S.sel}`);
    const i = arr ? arr.findIndex((l) => claveL(l) === key) : -1;
    if (i < 0) return;
    const l = arr[i];
    let nuevo = arr;
    if (op === 'signo') nuevo = arr.map((x, j) => (j === i ? { ...x, base: -x.base, cuota: -x.cuota } : x));
    else if (op === 'linea') { if (!confirm('¿Borrar esta línea del libro?')) return; nuevo = arr.filter((_, j) => j !== i); }
    else if (op === 'factura') {
      if (!confirm(`¿Borrar todas las líneas de la factura ${l.factura}?`)) return;
      nuevo = arr.filter((x) => !(x.factura === l.factura && x.nif === l.nif));
    } else if (op === 'mover') {
      const otro = s === 'E' ? 'R' : 'E';
      if (!confirm(`¿Pasar esta línea al libro de ${otro === 'R' ? 'recibidas' : 'emitidas'}?`)) return;
      const { data } = await db.from('registros').select('id,datos').eq('empresa_id', S.sel).eq('tipo', 'fact-' + otro).maybeSingle();
      await reemplazarGrande('fact-' + otro, S.sel, [...(data?.datos?.filas ?? []), { ...l, sentido: otro }], data);
      nuevo = arr.filter((_, j) => j !== i);
    }
    await reemplazarGrande(tipo, S.sel, nuevo);
    render();
  }

  function vistaFacturasViejo(s) {
    if (!S.sel) return sinEmpresa;
    const datos = grande('fact-' + s);
    if (!datos) return cargandoTxt;
    if (!datos.length) return `<p class="vacio">Sin datos: carga el libro de IVA ${SENT[s].lib} con el botón ${SENT[s].boton}.</p>`;
    const r = rangoPeriodo(Number(S.ejercicio), S.periodo);
    const f = datos.filter((l) => { const d = s === 'E' ? l.ff : l.fecha; return d >= r.desde && d <= r.hasta; });
    return `<div class="bar"><span class="space"></span><span class="chip">${f.length} líneas · ${r.desde.split('-').reverse().join('/')} – ${r.hasta.split('-').reverse().join('/')}</span></div>
      <div class="wrap"><table class="tabla"><thead><tr><th>Asiento</th><th>Factura</th><th>Fecha factura</th><th>NIF-CIF</th><th>Nombre</th>
      <th class="num">Base imponible</th><th class="num">%</th><th class="num">Cuota</th><th>Código impuesto</th></tr></thead><tbody>
      ${f.slice(0, TOPE).map((l) => `<tr><td>${esc(l.asiento)}</td><td>${esc(l.factura)}</td><td>${fmt(s === 'E' ? l.ff : l.fecha)}</td><td>${esc(l.nif)}</td><td>${esc(l.nombre)}</td>
        ${celdasNum(l.base)}<td class="num">${esc(l.pct)}</td>${celdasNum(l.cuota)}<td>${esc(l.codigo)}</td></tr>`).join('')}
      <tr><td colspan="5"><b>Total</b></td>${celdasNum(suma(f, 'base'))}<td></td>${celdasNum(suma(f, 'cuota'))}<td></td></tr></tbody></table></div>${tope(f.length)}`;
  }

  function vistaSII(s) {
    if (!S.sel) return sinEmpresa;
    const datos = grande('sii-' + s);
    if (!datos) return cargandoTxt;
    if (!datos.length) return '<p class="vacio">Sin datos: carga la consulta del SII con el botón SII.</p>';
    const r = rangoPeriodo(Number(S.ejercicio), S.periodo);
    const f = datos.filter((x) => (s === 'E' ? x.fecha >= r.desde && x.fecha <= r.hasta : x.ej === Number(S.ejercicio) && (!S.periodo || x.per === S.periodo)));
    const cab = s === 'E' ? ['Factura', 'Fecha expedición', SENT.E.nif, 'Nombre', 'Tipo', 'Estado'] : ['Factura', 'Fecha expedición', SENT.R.nif, 'Nombre', 'Tipo', 'Estado'];
    return `<div class="bar"><span class="space"></span><span class="chip">${f.length} facturas</span></div>
      <div class="wrap"><table class="tabla"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}<th class="num">Base total</th><th class="num">${SENT[s].cuota}</th>
      ${s === 'R' ? '<th class="num">Cuota deducible</th>' : ''}</tr></thead><tbody>
      ${f.map((x) => `<tr><td>${esc(x.factura)}</td><td>${fmt(x.fecha)}</td><td>${esc(x.nif)}</td><td>${esc(x.nombre)}</td><td>${esc(x.tipo)}</td><td>${esc(x.estado)}</td>
        ${celdasNum(x.base)}${celdasNum(x.cuota)}${s === 'R' ? celdasNum(x.deducible) : ''}</tr>`).join('')}
      <tr><td colspan="6"><b>Total</b></td>${celdasNum(suma(f, 'base'))}${celdasNum(suma(f, 'cuota'))}${s === 'R' ? celdasNum(suma(f, 'deducible')) : ''}</tr></tbody></table></div>`;
  }

  function vistaConcSII(s) {
    if (!S.sel) return sinEmpresa;
    const lib = grande('fact-' + s), sii = grande('sii-' + s);
    if (!lib || !sii) return cargandoTxt;
    if (!lib.length || !sii.length) {
      return `<p class="vacio">Faltan datos para conciliar: ${[!lib.length && `el libro de IVA (${SENT[s].boton})`, !sii.length && 'la consulta del SII (SII)'].filter(Boolean).join(' y ')}.</p>`;
    }
    const r = conciliarSII(s, lib, sii, Number(S.ejercicio), S.periodo);
    const x = r.resumen;
    const fila = (t, c, d, esN) => `<tr><td><b>${t}</b></td><td class="num">${esN ? c : eur(c)}</td><td class="num">${esN ? d : eur(d)}</td>
      <td class="num">${esN ? c - d : eur(Math.round((c - d) * 100) / 100)}</td></tr>`;
    const detalle = (tit, cols, filas, pinta) => `<h4 class="it-sec">${tit} <span class="chip">${filas.length}</span></h4>${filas.length ? `<div class="wrap"><table class="tabla">
      <thead><tr>${cols.map((c, i) => `<th${i > 2 ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${filas.slice(0, 200).map(pinta).join('')}</tbody></table></div>
      ${filas.length > 200 ? `<p class="hint">Se muestran 200 de ${filas.length}.</p>` : ''}` : '<p class="hint">Ninguna.</p>'}`;
    const base = (q) => `<td>${esc(q.factura)}</td><td>${esc(q.nif)}</td><td>${esc(q.nombre)}</td>`;
    return `<div class="conc-estado ${r.cuadra ? 'conc-ok' : 'conc-ko'}">${r.cuadra ? 'CUADRA' : 'DESCUADRE · revisar el detalle'}
        <small>${r.desde.split('-').reverse().join('/')} – ${r.hasta.split('-').reverse().join('/')}</small></div>
      <div class="wrap"><table class="tabla"><thead><tr><th>Resumen del periodo</th><th class="num">Contabilizado</th><th class="num">Declarado SII</th><th class="num">Diferencia</th></tr></thead><tbody>
      ${fila('Nº de facturas', x.nC, x.nS, true)}${fila('Base imponible', x.baseC, x.baseS)}${fila(SENT[s].cuota, x.cuotaC, x.cuotaS)}
      ${s === 'R' ? `<tr><td><b>Cuota deducible declarada (solo SII)</b></td><td></td>${celdasNum(x.dedS)}<td></td></tr>` : ''}</tbody></table></div>
      ${detalle('A. Contabilizadas que no están en el SII', ['Factura', 'NIF', 'Nombre', 'Base contab.', 'Cuota contab.'], r.a, (q) => `<tr>${base(q)}${celdasNum(q.base)}${celdasNum(q.cuota)}</tr>`)}
      ${detalle('B. Declaradas en el SII que no están contabilizadas', ['Factura', 'NIF', 'Nombre', 'Base SII', 'Cuota SII'], r.b, (q) => `<tr>${base(q)}${celdasNum(q.base)}${celdasNum(q.cuota)}</tr>`)}
      ${detalle('C. Facturas en ambos con importes distintos', ['Factura', 'NIF', 'Nombre', 'Base contab.', 'Base SII', 'Dif. base', 'Cuota contab.', 'Cuota SII', 'Dif. cuota'], r.c,
        (q) => `<tr>${base(q)}${celdasNum(q.base)}${celdasNum(q.baseS)}${celdasNum(Math.round((q.base - q.baseS) * 100) / 100)}${celdasNum(q.cuota)}${celdasNum(q.cuotaS)}${celdasNum(Math.round((q.cuota - q.cuotaS) * 100) / 100)}</tr>`)}
      <p class="hint">Reglas de tu Excel: en emitidas se dejan fuera las líneas de inversión del sujeto pasivo, intracomunitarias y RC, y los importes de las facturas «no sujetas / intereses / alquileres»; en recibidas, los códigos que no son IVA (I.PR.*, I.ALQ, I.INT, I.DV…).</p>`;
  }

  // ---------- Bloque 4: modelos tributarios ----------
  // Modelo 303: se calcula a partir de los libros de IVA (EMITIDAS / RECIBIDAS), con ajustes manuales por periodo
  const claveMan = () => (S.periodo || 'anual');
  const regMan = () => S.registros.find((r) => r.tipo === 'm303' && r.empresa_id === S.sel && r.ejercicio === Number(S.ejercicio));
  const manuales = () => regMan()?.datos?.[claveMan()] ?? {};
  const MAN303 = [['b14', 'Casilla 14 · Modificación bases'], ['c14', 'Casilla 15 · Modificación cuotas'], ['b25', 'Casilla 25 · Modificación bases (rec. equivalencia)'],
    ['c25', 'Casilla 26 · Modificación cuotas (rec. equivalencia)'], ['b35', 'Casilla 34 · Importaciones bienes de inversión (base)'], ['c35', 'Casilla 35 · Importaciones bienes de inversión (cuota)'],
    ['b39', 'Casilla 38 · Adq. intracomunitarias bienes de inversión (base)'], ['c39', 'Casilla 39 · Adq. intracomunitarias bienes de inversión (cuota)'],
    ['b41', 'Casilla 40 · Rectificación de deducciones (base)'], ['c41', 'Casilla 41 · Rectificación de deducciones (cuota)'], ['c42', 'Casilla 42 · Compensaciones régimen agricultura'],
    ['c43', 'Casilla 43 · Regularización de bienes de inversión'], ['c44', 'Casilla 44 · Regularización por prorrata definitiva'], ['pct65', 'Casilla 65 · % atribuible a la Administración del Estado (100)'],
    ['c110', 'Casilla 110 · Cuotas a compensar de periodos anteriores (importe positivo)'], ['c70', 'Casilla 70 · Resultado de la anterior autoliquidación (complementaria)']];

  function formMan303() {
    const d = manuales();
    openForm(`Ajustes manuales del 303 · ${S.periodo ? (PERIODOS[S.periodo] ?? S.periodo) : 'ejercicio'} ${S.ejercicio}`,
      MAN303.map(([k, l]) => ({ name: k, label: l, type: 'number', step: '0.01', value: d[k] ?? (k === 'pct65' ? 100 : 0) })), async (v) => {
        const reg = regMan();
        const datos = { ...(reg?.datos ?? {}), [claveMan()]: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? 0 : parseFloat(x)])) };
        const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'm303', ejercicio: Number(S.ejercicio), datos });
        if (err) return err;
        await cargar(); render();
      });
  }

  // ---- Modelo 303 con el aspecto del borrador de la Sede (casillas en recuadros) ----
  let rectif303 = true;
  const fnum = (n) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  const parseES = (s) => { const t = String(s ?? '').trim(); return (t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t)) || 0; };
  const BANCOS = { 2085: 'IBERCAJA', '0049': 'SANTANDER', '0182': 'BBVA', 2100: 'CAIXABANK', '0081': 'SABADELL', 3058: 'CAJAMAR', 2103: 'UNICAJA',
    '0128': 'BANKINTER', 1465: 'ING', '0073': 'OPENBANK', '0075': 'POPULAR', '0019': 'DEUTSCHE BANK', 3187: 'CAJA RURAL DEL SUR' };
  const bancoDe = (iban) => BANCOS[String(iban ?? '').replace(/\s/g, '').slice(4, 8)] ?? '';
  // periodo anterior: mes → mes anterior, trimestre → trimestre anterior (el primero enlaza con el último del año anterior)
  const prevPer = (ej, p) => {
    if (/^\d\d$/.test(p)) return +p === 1 ? [ej - 1, '12'] : [ej, String(+p - 1).padStart(2, '0')];
    if (/^[1-4]T$/.test(p)) return +p[0] === 1 ? [ej - 1, '4T'] : [ej, `${+p[0] - 1}T`];
    return null;
  };
  const manualDe = (ej, p) => S.registros.find((r) => r.tipo === 'm303' && r.empresa_id === S.sel && r.ejercicio === ej)?.datos?.[p] ?? {};
  // Cuota a compensar disponible al empezar el periodo: 87 del 303 anterior + su resultado si salió a compensar (71 < 0)
  function disponible303(E, R, ej, p, prof = 0) {
    const pp = prevPer(ej, p);
    if (!pp || prof > 24) return 0;
    const [e2, p2] = pp, r = rangoPeriodo(e2, p2);
    if (![...E, ...R].some((l) => l.fecha >= r.desde && l.fecha <= r.hasta)) return 0;
    const c = calcular303(E, R, e2, p2, manualDe(e2, p2), { rectif: rectif303, c110: disponible303(E, R, e2, p2, prof + 1) });
    return Math.round((c.c87 + (c.c71 < 0 ? -c.c71 : 0)) * 100) / 100;
  }
  async function guardarMan303(k, v) {
    const reg = regMan(), per = claveMan();
    const datos = { ...(reg?.datos ?? {}), [per]: { ...((reg?.datos ?? {})[per] ?? {}), [k]: parseES(v) } };
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'm303', ejercicio: Number(S.ejercicio), datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  async function guardarIban(v) {
    const e = empresa();
    if (!e) return;
    const { error } = await db.from('empresas').update({ datos: { ...(e.datos ?? {}), cuenta303: String(v).trim() } }).eq('id', e.id);
    if (error) return void alert(error.message);
    await cargar(); render();
  }
  const setRectif = (v) => { rectif303 = !!v; render(); };

  // Cuadre de los libros con el 303: todo lo que traen los libros en el periodo, por código de impuesto, y cómo se trata en el 303
  const TRAT = [[/^R\.EX/, 'Exportación'], [/^R\.ISP$/, 'Emitida con inversión del sujeto pasivo'],
    [/^(R\.ISP\.|R\.UE\.(NR|RD|SR)(\.SR)?$)/, 'Autoliquidación (ya se calcula desde el soportado)'], [/^R\.NC\.EX$/, 'Operación exenta (art. 20)'],
    [/^R\.NC\./, 'Operación interior sujeta'], [/^R\.RC\./, 'Recargo de equivalencia (línea aparte)'],
    [/^R\.UE\.S$/, 'Servicio intracomunitario no sujeto por localización (casilla 59 y 349 clave S)'], [/^R\.UE$/, 'Entrega intracomunitaria de bienes'],
    [/^R\.NAC\.NS/, 'Operación no sujeta por reglas de localización (casilla por verificar)'], [/^S\.NC\.ISP\.A/, 'Inversión del sujeto pasivo (autorrepercusión)'],
    [/^I\./, 'Línea de retención IRPF (no es IVA)'], [/^IN\./, 'Interior, bienes de inversión'], [/^S\.EX\./, 'Importación: factura del proveedor sin IVA (el IVA va en el DUA)'],
    [/^(S\.ISP\.|S\.NC\.ISP)/, 'Inversión del sujeto pasivo (recibida)'], [/^S\.(NAC\.NS|NC\.EX)/, 'Exenta o no sujeta (no va en el 303)'], [/^S\.NC\./, 'Interior, bienes y servicios corrientes'],
    [/^S\.UE\.(NR|RD|SR)\.SR$/, 'Adquisición intracomunitaria de servicios'], [/^S\.UE\./, 'Adquisición intracomunitaria de bienes'], [/^DUA/, 'Importación (DUA)']];
  const trat = (c) => (TRAT.find(([re]) => re.test(c)) || [0, ''])[1];

  function cuadre303(lib, libroR, c, p, ej) {
    const r = c.periodo;
    const mes = /^\d\d$/.test(p) ? `${p} (${MESES[+p - 1]}) ${ej}` : p ? `${p} ${ej}` : `ejercicio ${ej}`;
    const tabla = (titulo, datos, total) => {
      const en = datos.filter((l) => l.fecha >= r.desde && l.fecha <= r.hasta);
      const m = new Map();
      for (const l of en) { const a = m.get(l.codigo) ?? { n: 0, b: 0, q: 0 }; a.n++; a.b += l.base; a.q += l.cuota; m.set(l.codigo, a); }
      const filas = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      return `<h4 class="cu-t">${titulo} · ${en.length} líneas del periodo (${datos.length - en.length} de otros periodos no cuentan)</h4>
        <div class="wrap"><table class="tabla-cu"><thead><tr><th>Código</th><th>Nº</th><th>Base</th><th>Cuota</th><th>Tratamiento en el 303</th></tr></thead><tbody>
        ${filas.map(([cod, a]) => `<tr><td>${esc(cod)}</td><td class="num">${a.n}</td><td class="num">${fnum(a.b)}</td><td class="num">${fnum(a.q)}</td><td>${esc(trat(cod))}</td></tr>`).join('')}
        <tr class="tot"><td>TOTAL DEL LIBRO</td><td class="num">${en.length}</td><td class="num">${fnum(suma(en, 'base'))}</td><td class="num">${fnum(suma(en, 'cuota'))}</td><td>${total}</td></tr></tbody></table></div>`;
    };
    return `<h4 class="cu-t gr">Cuadre de los libros con el 303 (${mes})</h4>
      <p class="hint">Todo lo que traen los libros en el periodo, agrupado por código, y cómo se trata en el 303. La diferencia entre el total del libro y el 303 son las líneas que no llevan IVA a esta liquidación (retenciones, exentas, no sujetas) o que ya se calculan desde el otro libro.</p>
      ${tabla('IVA repercutido', lib, `En el 303: total devengado (27) = ${fnum(c.devengado)}`)}${tabla('IVA soportado', libroR, `En el 303: total a deducir (45) = ${fnum(c.deducir)}`)}`;
  }

  // ---- Modelo 349: declaración recapitulativa de operaciones intracomunitarias (importes sin IVA) ----
  function vistaMod349() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return cargandoTxt;
    if (!E.length && !R.length) return '<p class="vacio">Sin datos: carga los libros de IVA con los botones EMITIDAS y RECIBIDAS.</p>';
    const c = calcular349(E, R, Number(S.ejercicio), S.periodo);
    const f = (d) => d.split('-').reverse().join('/');
    const fila = (t, k, n, i, cls = '') => `<tr class="${cls}"><td>${t}</td><td class="c">${k}</td><td class="num">${n}</td><td class="num">${fnum(i)}</td></tr>`;
    return `<div class="bar"><span class="chip">${f(c.periodo.desde)} – ${f(c.periodo.hasta)}</span>
        ${S.periodo ? '' : '<span class="hint">Sin periodo elegido se muestra el ejercicio completo.</span>'}</div>
      <p class="hint">Declaración informativa, sin ingreso. Importes sin IVA.</p>
      <div class="wrap"><table class="tabla-cu"><thead><tr><th>Concepto</th><th>Clave</th><th>Nº operadores</th><th>Importe (€)</th></tr></thead><tbody>
        ${c.porClave.map((x) => fila(esc(x.concepto), x.clave, x.n, x.importe)).join('')}
        ${fila('Rectificaciones de periodos anteriores (clave C)', 'C', 0, 0)}
        ${fila('<b>TOTAL DECLARACIÓN</b>', '', c.operadores, c.total, 'tot')}</tbody></table></div>
      <h4 class="cu-t">Resumen por operador y clave (lo que se declara en el 349)</h4>
      ${c.porOperador.length ? `<div class="wrap"><table class="tabla-cu"><thead><tr><th>NIF-IVA</th><th>Nombre</th><th>Clave</th><th>Base imponible</th></tr></thead><tbody>
        ${c.porOperador.map((x) => `<tr><td>${esc(x.nif)}</td><td>${esc(x.nombre)}</td><td class="c">${x.clave}</td><td class="num">${fnum(x.base)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="hint">Sin operaciones intracomunitarias en el periodo.</p>'}
      <h4 class="cu-t">Detalle de operaciones intracomunitarias del periodo</h4>
      ${c.detalle.length ? `<div class="wrap"><table class="tabla-cu"><thead><tr><th>NIF-CIF</th><th>Nombre</th><th>País</th><th>Clave</th><th>Factura</th><th>Fecha</th><th>Base imponible</th></tr></thead><tbody>
        ${c.detalle.map((d) => `<tr><td>${esc(d.nif)}</td><td>${esc(d.nombre)}</td><td>${esc(d.pais)}</td><td class="c">${d.clave}</td><td>${esc(d.factura)}</td><td>${f(d.fecha)}</td><td class="num">${fnum(d.base)}</td></tr>`).join('')}
        <tr class="tot"><td colspan="6">TOTAL</td><td class="num">${fnum(c.total)}</td></tr></tbody></table></div>` : ''}
      <p class="hint">Borrador de trabajo. Claves de operación: E entregas de bienes · S servicios prestados · A adquisiciones de bienes · I servicios adquiridos · C rectificaciones. Verificar antes de presentar.</p>`;
  }

  function vistaMod303() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return cargandoTxt;
    if (!E.length && !R.length) return '<p class="vacio">Sin datos: carga los libros de IVA con los botones EMITIDAS y RECIBIDAS.</p>';
    const e = empresa(), ej = Number(S.ejercicio), p = S.periodo;
    const c = calcular303(E, R, ej, p, manuales(), { rectif: rectif303, c110: p ? disponible303(E, R, ej, p) : 0 });
    const g = c.G, mm = c.man, ro = puede() ? '' : ' readonly';
    const bx = (n, v, cls = '') => `<span class="bx ${cls}"><b>${n}</b><span class="v">${fnum(v)}</span></span>`;
    const inp = (n, k, v) => `<span class="bx man"><b>${n}</b><input data-man="${k}" value="${fnum(v)}"${ro}></span>`;
    const fila = (lb, a = '', t = '', q = '', cls = '') => `<div class="f-row ${cls}"><span class="lb">${lb}</span><span class="c1">${a}</span><span class="c2">${t}</span><span class="c3">${q}</span></div>`;
    const cab = (a, t, q) => fila('', `<span class="hd">${a}</span>`, `<span class="hd">${t}</span>`, `<span class="hd">${q}</span>`, 'head');
    const sec = (t) => `<div class="f303-sec">${t}</div>`;
    const tipo = (x) => (x.base ? Math.round((x.cuota / x.base) * 10000) / 100 : 0);
    const nota = (t) => ` <span class="nota">(${t})</span>`;
    const pp = p ? prevPer(ej, p) : null;
    const prevTxt = pp ? (/^\d\d$/.test(pp[1]) ? `${pp[1]}/${pp[0]}` : `${pp[1]} ${pp[0]}`) : '—';
    const t = c.c71 > 0 ? 'ing' : c.c71 < 0 ? 'comp' : 'cero';
    const chk = (l, on) => `<span class="chk"><span class="cb${on ? ' on' : ''}">✕</span>${l}</span>`;
    const iban = e?.datos?.cuenta303 ?? '';
    const det = c.detalle.map((x) => `<tr><td>${esc(x.codigo)}</td><td>${x.libro === 'E' ? 'Repercutido' : 'Soportado'}</td><td class="num">${x.n}</td>${celdasNum(x.base)}${celdasNum(x.cuota)}</tr>`).join('');
    return `<div class="f303-top-bar"><label>Cuenta de cargo del 303 <input data-iban class="iban" value="${esc(iban)}"${ro}></label>
        <label class="rect"><input type="checkbox" data-rectif${rectif303 ? ' checked' : ''}> Llevar facturas con base negativa a modificación (14-15 y 40-41)</label>
        ${p ? '' : '<span class="hint">Elige un periodo (trimestre o mes) en la barra lateral: el 303 es por periodo.</span>'}</div>
      <div class="f303">
        <div class="f303-top"><div class="ag"><b>Agencia Tributaria</b><small>Borrador para transcribir en la Sede Electrónica</small></div>
          <div class="tt">Impuesto sobre el Valor Añadido. Autoliquidación</div><div class="mod"><small>Modelo</small><b>303</b></div></div>
        ${sec('Identificación')}<div class="f303-id"><span class="idbox"><b>NIF</b><span>${esc(e?.cif)}</span></span>
          <span class="idbox grow"><b>Apellidos y nombre o razón social</b><span>${esc(e?.nombre)}</span></span></div>
        ${sec('Devengo')}<div class="f303-id"><span class="idbox"><b>Ejercicio</b><span>${ej}</span></span><span class="idbox"><b>Período</b><span>${esc(p || '—')}</span></span></div>
        ${sec('Liquidación (1) · IVA devengado')}${cab('Base imponible', 'Tipo %', 'Cuota')}
        ${fila('<b>Régimen general</b>')}
        ${fila('', bx('01', g.rg4.base), bx('02', 4, 't'), bx('03', g.rg4.cuota))}
        ${fila('', bx('04', g.rg10.base), bx('05', 10, 't'), bx('06', g.rg10.cuota))}
        ${fila('', bx('07', g.rg21.base), bx('08', 21, 't'), bx('09', g.rg21.cuota))}
        ${fila('Adquisiciones intracomunitarias de bienes y servicios', bx('10', g.intra.base), '', bx('11', g.intra.cuota))}
        ${fila('Otras operaciones con inversión del sujeto pasivo (excepto adq. intracom.)', bx('12', g.isp.base), '', bx('13', g.isp.cuota))}
        ${fila('Modificación bases y cuotas', bx('14', c.b14), '', bx('15', c.c14))}
        ${fila('<b>Recargo de equivalencia</b>')}
        ${fila('', bx('16', g.re14.base), bx('17', tipo(g.re14), 't'), bx('18', g.re14.cuota))}
        ${fila('', bx('19', g.re52.base), bx('20', tipo(g.re52), 't'), bx('21', g.re52.cuota))}
        ${fila('', bx('22', g.re05.base), bx('23', tipo(g.re05), 't'), bx('24', g.re05.cuota))}
        ${fila('Modificaciones bases y cuotas del recargo de equivalencia', bx('25', c.b25), '', bx('26', c.c25))}
        ${fila('<b>Total cuota devengada ( [03] + [06] + [09] + [11] + [13] + [15] + [18] + [21] + [24] + [26] )</b>', '', '', bx('27', c.devengado, 'tot'))}
        ${sec('Liquidación (1) · IVA deducible')}${cab('Base', '', 'Cuota')}
        ${fila('Por cuotas soportadas en operaciones interiores corrientes', bx('28', g.ded.base), '', bx('29', g.ded.cuota))}
        ${fila('Por cuotas soportadas en operaciones interiores con bienes de inversión', bx('30', g.inv.base), '', bx('31', g.inv.cuota))}
        ${fila('Por cuotas soportadas en las importaciones de bienes corrientes', bx('32', g.dua.base), '', bx('33', g.dua.cuota))}
        ${fila('Por cuotas soportadas en las importaciones de bienes de inversión', bx('34', mm.b35), '', bx('35', mm.c35))}
        ${fila('En adquisiciones intracomunitarias de bienes y servicios corrientes', bx('36', g.dedintra.base), '', bx('37', g.dedintra.cuota))}
        ${fila('En adquisiciones intracomunitarias de bienes de inversión', bx('38', mm.b39), '', bx('39', mm.c39))}
        ${fila('Rectificación de deducciones', bx('40', c.b40), '', bx('41', c.c41))}
        ${fila('Compensaciones Régimen especial A.G. y P.', '', '', inp('42', 'c42', mm.c42))}
        ${fila('Regularización bienes de inversión', '', '', inp('43', 'c43', mm.c43))}
        ${fila('Regularización por aplicación del porcentaje definitivo de prorrata', '', '', inp('44', 'c44', mm.c44))}
        ${fila('<b>Total a deducir ( [29] + [31] + [33] + [35] + [37] + [39] + [41] + [42] + [43] + [44] )</b>', '', '', bx('45', c.deducir, 'tot'))}
        ${fila('<b>Resultado régimen general ( [27] − [45] )</b>', '', '', bx('46', c.c46, 'tot'))}
        ${sec('Información adicional')}
        ${fila('Entregas intracomunitarias de bienes y servicios', '', '', bx('59', g.entregas.base))}
        ${fila('Exportaciones y operaciones asimiladas', '', '', bx('60', g.export.base))}
        ${fila(`Operaciones sujetas con inversión del sujeto pasivo que originan el derecho a deducción${nota('casilla 122 según mi conocimiento: compruébala')}`, '', '', bx('122', g.nosuj.base, 'warn'))}
        ${fila(`Operaciones no sujetas por reglas de localización${nota('casilla por verificar')}`, '', '', bx('¿?', g.locNS.base, 'warn'))}
        ${fila(`Operaciones exentas o no sujetas interiores${nota('casilla por verificar')}`, '', '', bx('¿?', g.exVentas.base + g.exCompras.base, 'warn'))}
        ${sec('Resultado')}
        ${fila('Suma de resultados ( [46] )', '', '', bx('64', c.c46))}
        ${fila('% Atribuible a la Administración del Estado', '', '', inp('65', 'pct65', c.pct))}
        ${fila('Atribuible a la Administración del Estado', '', '', bx('66', c.c66))}
        ${fila(`IVA a la importación liquidado por la Aduana pendiente de ingreso${nota('suma de DUA, DUARED, DUALCNR y DUALCRED')}`, '', '', bx('77', c.c77))}
        ${fila(`Cuotas a compensar pendientes de periodos previos${nota(`303 de ${prevTxt}: 87 + resultado a compensar (71), pestaña Presentados`)}`, '', '', bx('110', c.c110))}
        ${fila('Cuotas a compensar de periodos previos aplicadas en este periodo', '', '', inp('78', 'c78', c.c78))}
        ${fila('Cuotas a compensar de periodos previos pendientes para periodos posteriores ( [110] − [78] )', '', '', bx('87', c.c87))}
        ${fila('Exclusivamente para sujetos pasivos que tributan conjuntamente a la Administración del Estado y a las Haciendas Forales. Resultado de la regularización anual', '', '', inp('68', 'c68', c.c68))}
        ${fila('<b>Resultado ( [66] + [77] − [78] + [68] )</b>', '', '', bx('69', c.c69, 'tot'))}
        ${fila('A deducir (exclusivamente en caso de autoliquidación complementaria)', '', '', inp('70', 'c70', c.c70))}
        ${fila('<b>Resultado de la liquidación ( [69] − [70] )</b>', '', '', bx('71', c.c71, 'final'))}
        ${sec('Tipo de declaración')}<div class="f-chk">${chk('A ingresar', t === 'ing')}${chk('A compensar', t === 'comp')}${chk('A devolver o compensar (a elegir en el último periodo)', false)}${chk('Sin actividad o resultado cero', t === 'cero')}</div>
        ${sec('Domiciliación del pago')}
        ${fila(`Cuenta de cargo (IBAN) del 303 · importe a ingresar ${fnum(Math.max(c.c71, 0))} · <b>${esc(bancoDe(iban))}</b>`, '', '', `<input class="iban" data-iban value="${esc(iban)}"${ro}>`)}
      </div>
      ${p ? cuadre303(E, R, c, p, ej) : ''}
      <p class="hint">Borrador de trabajo: los importes salen del libro de IVA por código de impuesto y fecha. Las casillas en amarillo se rellenan a mano y se guardan por periodo. Las casillas marcadas «por verificar» hay que comprobarlas en el modelo oficial.</p>`;
  }

  function vistaMod303Viejo() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return cargandoTxt;
    if (!E.length && !R.length) return '<p class="vacio">Sin datos: carga los libros de IVA con los botones EMITIDAS y RECIBIDAS.</p>';
    const c = calcular303(E, R, Number(S.ejercicio), S.periodo, manuales());
    const m = (k) => Number(c.man[k]) || 0;
    const fila = (t, cb, b, ct, tipo, cc, cuota, cls = '') => `<tr class="${cls}"><td>${t}</td><td class="cas">${cb}</td><td class="num">${b === null ? '' : eur(b)}</td>
      <td class="cas">${ct}</td><td class="num">${tipo}</td><td class="cas">${cc}</td><td class="num">${cuota === null ? '' : eur(cuota)}</td></tr>`;
    const g = (k) => c.G[k];
    const sec = (t) => `<tr class="sec"><td colspan="7"><b>${t}</b></td></tr>`;
    const de = (t, k, cb, ct, cc, tipo = '') => fila(t, cb, g(k).base, ct, tipo, cc, g(k).cuota);
    const man = (t, cb, kb, cc, kc) => fila(t, cb, kb ? m(kb) : null, '', '', cc, m(kc));
    const cuerpo = [
      sec('IVA DEVENGADO · Régimen general'),
      de('Régimen general 21%', 'rg21', 1, 2, 3, 21), de('Régimen general 10%', 'rg10', 4, 5, 6, 10), de('Régimen general 5%', 'rg5', 's/ej', '', 's/ej', 5),
      de('Régimen general 4%', 'rg4', 7, 8, 9, 4), de('Régimen general 2%', 'rg2', 's/ej', '', 's/ej', 2),
      de('Adquisiciones intracomunitarias de bienes y servicios', 'intra', 10, '', 11), de('Otras operaciones con inversión del sujeto pasivo', 'isp', 12, '', 13),
      man('Modificación bases y cuotas', 14, 'b14', 15, 'c14'),
      de('Recargo de equivalencia 5,2%', 're52', 16, 17, 18, 5.2), de('Recargo de equivalencia 1,4%', 're14', 19, 20, 21, 1.4), de('Recargo de equivalencia 0,5%', 're05', 22, 23, 24, 0.5),
      man('Modificación bases y cuotas del recargo de equivalencia', 25, 'b25', 26, 'c25'),
      fila('<b>TOTAL CUOTA DEVENGADA</b>', '', null, '', '', 27, c.devengado, 'tot'),
      sec('IVA DEDUCIBLE'),
      de('Operaciones interiores corrientes', 'ded', 28, '', 29), de('Operaciones interiores con bienes de inversión', 'inv', 30, '', 31),
      de('Importaciones de bienes corrientes (DUA)', 'dua', 32, '', 33), man('Importaciones de bienes de inversión', 34, 'b35', 35, 'c35'),
      de('Adquisiciones intracomunitarias de bienes y servicios corrientes', 'dedintra', 36, '', 37), man('Adquisiciones intracomunitarias de bienes de inversión', 38, 'b39', 39, 'c39'),
      man('Rectificación de deducciones', 40, 'b41', 41, 'c41'), man('Compensaciones en régimen especial de agricultura, ganadería y pesca', '', null, 42, 'c42'),
      man('Regularización de bienes de inversión', '', null, 43, 'c43'), man('Regularización por aplicación del porcentaje definitivo de prorrata', '', null, 44, 'c44'),
      fila('<b>TOTAL A DEDUCIR</b>', '', null, '', '', 45, c.deducir, 'tot'),
      fila('<b>RESULTADO RÉGIMEN GENERAL</b>', '', null, '', '', 46, c.c46, 'tot'),
      sec('INFORMACIÓN ADICIONAL'),
      de('Entregas intracomunitarias de bienes y servicios', 'entregas', 59, '', ''), de('Exportaciones y operaciones asimiladas', 'export', 60, '', ''),
      de('Operaciones no sujetas o con inversión del sujeto pasivo con derecho a deducción', 'nosuj', 61, '', ''),
      sec('OPERACIONES EXENTAS Y NO SUJETAS (control interno, sin casilla propia)'),
      de('Ventas exentas art. 20 LIVA', 'exVentas', '-', '', ''), de('Compras exentas art. 20 LIVA', 'exCompras', '-', '', ''),
      de('Importaciones exentas art. 21 LIVA', 'exImp', '-', '', ''), de('Compras no sujetas', 'comprasNS', '-', '', ''),
      sec('RESULTADO DE LA LIQUIDACIÓN'),
      fila('% atribuible a la Administración del Estado', '', null, '', '', 65, null).replace('<td class="num"></td></tr>', `<td class="num">${esc(c.pct)}</td></tr>`),
      fila('Atribuible a la Administración del Estado', '', null, '', '', 66, c.c66),
      fila('IVA diferido aduana pendiente de ingreso', '', null, '', '', 77, c.c77),
      fila('<b>SUMA DE RESULTADOS</b>', '', null, '', '', '', c.suma, 'tot'),
      fila('Cuotas a compensar de ejercicios anteriores', '', null, '', '', 110, c.c110),
      fila('Cuotas a compensar aplicadas en el ejercicio', '', null, '', '', 78, c.c78),
      fila('Cuotas a compensar pendientes para periodos posteriores', '', null, '', '', 87, c.c87),
      fila('Resultado', '', null, '', '', 69, c.c69),
      fila('A deducir: resultado de la anterior autoliquidación (complementaria)', '', null, '', '', 70, c.c70),
      fila('<b>RESULTADO DE LA LIQUIDACIÓN</b>', '', null, '', '', 71, c.c71, 'tot final'),
    ].join('');
    const nomG = { rg21: 'Régimen general 21%', rg10: 'Régimen general 10%', rg5: 'Régimen general 5%', rg4: 'Régimen general 4%', rg2: 'Régimen general 2%',
      intra: 'Adquisiciones intracomunitarias', isp: 'Operaciones con inversión del sujeto pasivo', re52: 'Recargo equivalencia 5,2%', re14: 'Recargo equivalencia 1,4%',
      re05: 'Recargo equivalencia 0,5%', ded: 'IVA deducible · interiores corrientes', inv: 'IVA deducible · bienes de inversión', dua: 'IVA deducible · importaciones (DUA)',
      dedintra: 'IVA deducible · adquisiciones intracomunitarias', entregas: 'Entregas intracomunitarias', export: 'Exportaciones', nosuj: 'No sujetas / ISP con derecho a deducción',
      exVentas: 'Ventas exentas art. 20', exCompras: 'Compras exentas art. 20', exImp: 'Importaciones exentas art. 21', comprasNS: 'Compras no sujetas' };
    const det = c.detalle.map((x) => `<tr><td>${esc(nomG[x.grupo])}</td><td>${esc(x.codigo)}</td><td>${x.libro === 'E' ? 'Repercutido' : 'Soportado'}</td>
      <td class="num">${x.n}</td>${celdasNum(x.base)}${celdasNum(x.cuota)}</tr>`).join('');
    return `<div class="bar"><span class="chip">${c.periodo.desde.split('-').reverse().join('/')} – ${c.periodo.hasta.split('-').reverse().join('/')}</span>
      ${S.periodo ? '' : '<span class="hint">Elige un periodo (trimestre o mes) en la barra lateral: el 303 es por periodo.</span>'}<span class="space"></span>
      ${puede() ? '<button data-act="m-man303">Ajustes manuales</button>' : ''}</div>
      <div class="wrap"><table class="tabla tabla-it m303"><thead><tr><th>Concepto</th><th>Cas.</th><th>Base imponible (€)</th><th>Cas.</th><th>Tipo %</th><th>Cas.</th><th>Cuota (€)</th></tr></thead>
      <tbody>${cuerpo}</tbody></table></div>
      <h4 class="it-sec">Detalle por código de impuesto del periodo</h4>
      ${det ? `<div class="wrap"><table class="tabla"><thead><tr><th>Grupo</th><th>Código</th><th>Libro</th><th class="num">Líneas</th><th class="num">Base imponible</th><th class="num">Cuota IVA</th></tr></thead><tbody>${det}</tbody></table></div>` : '<p class="hint">Sin operaciones en el periodo.</p>'}
      <p class="hint">Borrador de trabajo: los importes salen del libro de IVA por código de impuesto y fecha (igual que la hoja Mod303 de tu Excel). Las casillas de los tipos 5 % y 2 % varían según el ejercicio: verifica en el modelo oficial. Los ajustes manuales (modificaciones, regularizaciones y complementaria) se guardan por periodo.</p>`;
  }

  // Retenciones: 111 (profesionales; la parte de nóminas se introduce a mano), 115 y 123, desde el libro de IVA soportado
  const manDe = (tipo) => S.registros.find((r) => r.tipo === tipo && r.empresa_id === S.sel && r.ejercicio === Number(S.ejercicio));
  const manPer = (tipo) => manDe(tipo)?.datos?.[S.periodo || 'anual'] ?? {};
  const CAMPOS_RET = {
    111: [['t1', 'Casilla 01 · Nº de perceptores de nómina'], ['t2', 'Casilla 02 · Percepciones de nómina (€)'], ['t3', 'Casilla 03 · Retenciones de nómina (€)'],
      ['c29', 'Casilla 29 · Resultado de la anterior autoliquidación (complementaria)']],
    115: [['c4', 'Casilla 04 · Resultado de la anterior autoliquidación (complementaria)']],
    123: [['c4', 'Casilla 04 · Resultado de la anterior autoliquidación (complementaria)']],
  };
  function formManRet(modelo) {
    const tipo = 'm' + modelo, d = manPer(tipo);
    openForm(`Ajustes manuales del ${modelo} · ${S.periodo ? (PERIODOS[S.periodo] ?? S.periodo) : 'ejercicio'} ${S.ejercicio}`,
      CAMPOS_RET[modelo].map(([k, l]) => ({ name: k, label: l, type: 'number', step: '0.01', value: d[k] ?? 0 })), async (v) => {
        const reg = manDe(tipo);
        const datos = { ...(reg?.datos ?? {}), [S.periodo || 'anual']: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? 0 : parseFloat(x)])) };
        const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo, ejercicio: Number(S.ejercicio), datos });
        if (err) return err;
        await cargar(); render();
      });
  }
  const nom = (n) => (n == null ? '' : eur(n));
  const cabRet = (c) => `<div class="bar"><span class="chip">${c.periodo.desde.split('-').reverse().join('/')} – ${c.periodo.hasta.split('-').reverse().join('/')}</span>
    ${S.periodo ? '' : '<span class="hint">Elige un periodo (trimestre o mes) en la barra lateral.</span>'}<span class="space"></span></div>`;

  function vistaRet(modelo) {
    if (!S.sel) return sinEmpresa;
    const R = grande('fact-R');
    if (!R) return cargandoTxt;
    if (!R.length) return '<p class="vacio">Sin datos: carga el libro de IVA soportado con el botón RECIBIDAS.</p>';
    const c = calcularRet(modelo, R, Number(S.ejercicio), S.periodo);
    const m = manPer('m' + modelo);
    const np = modelo === '111' ? nomPer(Number(S.ejercicio), perEf(empresa(), S.periodo)) : null; // percepciones y retenciones de nómina: del cuadrante de Nóminas
    const num = (k) => (np && k === 't2' ? np.s : np && k === 't3' ? np.r : Number(m[k]) || 0);
    let tabla;
    if (modelo === '111') {
      const f = (ap, con, c1, n, c2, p, c3, r, cls = '') => `<tr class="${cls}"><td>${ap}</td><td>${con}</td><td class="cas">${c1}</td><td class="num">${n}</td><td class="cas">${c2}</td>
        <td class="num">${nom(p)}</td><td class="cas">${c3}</td><td class="num">${nom(r)}</td></tr>`;
      const z = (ap, con, a) => f(ap, con, a, 0, a + 1, 0, a + 2, 0);
      const sumaRet = num('t3') + c.ret;
      tabla = `<thead><tr><th>Apartado</th><th>Concepto</th><th>Cas.</th><th>Nº perceptores</th><th>Cas.</th><th>Percepciones (€)</th><th>Cas.</th><th>Retenciones (€)</th></tr></thead><tbody>
        ${f('I. Rendimientos del trabajo', 'Dinerarios', 1, num('t1'), 2, num('t2'), 3, num('t3'))}${z('I. Rendimientos del trabajo', 'En especie', 4)}
        ${f('II. Rendimientos de actividades económicas', 'Dinerarios', 7, c.perceptores, 8, c.base, 9, c.ret)}${z('II. Rendimientos de actividades económicas', 'En especie', 10)}
        ${z('III. Premios por juegos, concursos, rifas…', 'Dinerarios', 13)}${z('III. Premios por juegos, concursos, rifas…', 'En especie', 16)}
        ${z('IV. Ganancias patrimoniales - aprovechamientos forestales', 'Dinerarias', 19)}${z('IV. Ganancias patrimoniales - aprovechamientos forestales', 'En especie', 22)}
        ${z('V. Contraprestaciones por cesión de derechos de imagen', 'Ingresos a cuenta', 25)}
        <tr class="sec"><td colspan="8"><b>LIQUIDACIÓN</b></td></tr>
        ${f('', 'Suma de retenciones e ingresos a cuenta', 28, '', '', '', '', sumaRet, 'tot').replace('<td class="cas"></td><td class="num"></td><td class="cas"></td>', '<td class="cas">28</td><td class="num"></td><td class="cas"></td>')}
        ${f('', 'A deducir: resultados a ingresar de anteriores autoliquidaciones (complementaria)', 29, '', '', '', '', num('c29'))}
        ${f('', '<b>RESULTADO A INGRESAR</b>', 30, '', '', '', '', sumaRet - num('c29'), 'tot final')}</tbody>`;
    } else {
      const f = (t, cas, v, cls = '') => `<tr class="${cls}"><td>${t}</td><td class="cas">${cas}</td><td class="num">${v}</td></tr>`;
      tabla = `<thead><tr><th>Concepto</th><th>Cas.</th><th>Importe (€)</th></tr></thead><tbody>
        ${f('Nº de perceptores', 1, c.perceptores)}${f('Base de las retenciones e ingresos a cuenta', 2, nom(c.base))}${f('Retenciones e ingresos a cuenta', 3, nom(c.ret))}
        ${f('A deducir: resultados a ingresar de anteriores autoliquidaciones (complementaria)', 4, nom(num('c4')))}${f('<b>RESULTADO A INGRESAR</b>', 5, nom(c.ret - num('c4')), 'tot final')}</tbody>`;
    }
    const lin = c.lineas.slice(0, 200).map((l) => `<tr><td>${esc(l.nif)}</td><td>${esc(l.nombre)}</td><td>${esc(l.factura)}</td><td>${fmt(l.fecha)}</td>${celdasNum(l.base)}<td class="num">${esc(l.pct)}</td>${celdasNum(l.cuota)}</tr>`).join('');
    return `${cabRet(c)}<div class="bar"><span class="space"></span>${puede() ? `<button data-act="m-manret" data-m="${modelo}">Ajustes manuales</button>` : ''}</div>
      <div class="wrap"><table class="tabla tabla-it m303">${tabla}</table></div>
      <h4 class="it-sec">Detalle de origen (trazabilidad)</h4>
      <div class="wrap"><table class="tabla"><thead><tr><th>Código</th><th>Concepto</th><th>Hoja origen</th><th class="num">Base</th><th class="num">Retención</th></tr></thead><tbody>
        ${c.porCodigo.map((x) => `<tr><td>${esc(x.codigo)}</td><td>${esc(x.concepto)}</td><td>Libro de IVA soportado</td>${celdasNum(x.base)}${celdasNum(x.ret)}</tr>`).join('')}
        <tr><td colspan="3"><b>TOTAL</b></td>${celdasNum(c.base)}${celdasNum(c.ret)}</tr></tbody></table></div>
      <h4 class="it-sec">Detalle de retenciones del periodo</h4>
      ${lin ? `<div class="wrap"><table class="tabla"><thead><tr><th>NIF-CIF</th><th>Nombre</th><th>Factura</th><th>Fecha</th><th class="num">Base imponible</th><th class="num">%</th><th class="num">Cuota</th></tr></thead><tbody>${lin}</tbody></table></div>${tope(c.lineas.length)}`
        : '<p class="hint">Sin retenciones en el periodo.</p>'}
      <p class="hint">Borrador de trabajo. Las cuotas conservan el signo negativo del libro registro y en las casillas figuran en positivo. ${modelo === '111' ? 'La parte de nóminas (casillas 1 a 3) se introduce a mano hasta que se carguen las nóminas.' : ''}</p>`;
  }

  // ---- Impuestos presentados: cuadrícula por modelo y periodo (importes presentados, editables; un registro «prs» por empresa y ejercicio) ----
  let prsVer = 'ej';
  const prsRegs = () => S.registros.filter((r) => r.tipo === 'prs' && r.empresa_id === S.sel);
  const PRS_VIEJO = [
    { t: 'Retenciones · 111, 115 y 123', tipo: 'per', ms: [['111', 'Modelo 111', [['retN', 'Nóminas (03+06)'], ['retP', 'Profesionales (09)']]], ['115', 'Modelo 115', [['ret', 'Retenciones (03)']]], ['123', 'Modelo 123', [['ret', 'Retenciones (09)']]]] },
    { t: 'IVA · 303, 349 e Intrastat', tipo: 'per', ms: [['303', 'Modelo 303', [['res', 'Resultado (71)']]], ['349', 'Modelo 349', [['imp', 'Importe (€)']]], ['INT', 'Intrastat', [['imp', 'Importe (€)']]]] },
    { t: 'Anuales · 180, 190, 193, 200 y 232', tipo: 'ano', ms: [['180', 'Modelo 180', [['perc', 'Percepciones (02)'], ['ret', 'Retenciones (03)']]], ['190', 'Modelo 190', [['perc', 'Percepciones (02)'], ['ret', 'Retenciones (03)']]],
      ['193', 'Modelo 193', [['perc', 'Percepciones (02)'], ['ret', 'Retenciones (03)']]], ['200', 'Modelo 200', [['cuota', 'Cuota (00562)'], ['res', 'Resultado (00621)']]], ['232', 'Modelo 232', [['imp', 'Importe (€)']]]] },
    { t: 'Pagos fraccionados · 202', tipo: 'p202', ms: [['202', 'Modelo 202', [['res', 'Pago fraccionado (34)']]]] },
    { t: 'Impuestos especiales · 583, 592 y A22', tipo: 'per', ms: [['583', 'Modelo 583', [['res', 'Resultado']]], ['592', 'Modelo 592', [['res', 'Resultado']]], ['A22', 'Modelo A22', [['res', 'Resultado']]]] },
  ];
  const prsVal = (ej, m, per, col) => prsRegs().find((r) => r.ejercicio === ej)?.datos?.[`${m}|${per}`]?.[col];
  const prsComoLista = () => S.registros.filter((r) => r.tipo === 'pres' && r.ejercicio === Number(S.ejercicio) && (!S.periodo || r.datos.periodo === S.periodo))
    .concat(S.registros.filter((r) => r.tipo === 'prs' && r.ejercicio === Number(S.ejercicio)).flatMap((r) => Object.keys(r.datos)
      .map((k) => ({ empresa_id: r.empresa_id, datos: { modelo: k.split('|')[0], periodo: k.split('|')[1] } })).filter((x) => !S.periodo || x.datos.periodo === S.periodo)));
  async function guardarPrs(clave, valor) {
    const [m, per, col, ej] = clave.split('|');
    const reg = prsRegs().find((r) => r.ejercicio === +ej), k = `${m}|${per}`;
    const datos = JSON.parse(JSON.stringify(reg?.datos ?? {}));
    datos[k] ??= {};
    if (String(valor).trim() === '') delete datos[k][col]; else datos[k][col] = parseES(valor);
    if (!Object.keys(datos[k]).length) delete datos[k];
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'prs', ejercicio: +ej, datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  const setPrsVer = (v) => { prsVer = v; render(); };

  function vistaPrsViejo() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), ej = Number(S.ejercicio), ed = puede();
    const anios = prsVer === 'todo' ? [...new Set([...prsRegs().map((r) => r.ejercicio), ej])].sort((a, b) => b - a) : [ej];
    const periodos = (tipo) => (tipo === 'p202' ? [['1P', 'Abril (1P)'], ['2P', 'Octubre (2P)'], ['3P', 'Diciembre (3P)']]
      : e.tipo === 'PYME' ? ['1T', '2T', '3T', '4T'].map((q) => [q, `${q} trimestre`]) : MESES.map((m, i) => [String(i + 1).padStart(2, '0'), m[0].toUpperCase() + m.slice(1)]));
    const celda = (y, m, per, col) => { const v = prsVal(y, m, per, col); return ed ? `<td class="in"><input data-prs="${m}|${per}|${col}|${y}" value="${v === undefined ? '' : fnum(v)}" placeholder="—"></td>` : `<td class="num">${v === undefined ? '—' : fnum(v)}</td>`; };
    const cab = (g) => `<thead><tr><th rowspan="2" class="pp">${g.tipo === 'ano' ? 'Ejercicio' : 'Periodo'}</th>${g.ms.map(([, n, cs]) => `<th colspan="${cs.length}" class="mh">${n}</th>`).join('')}</tr>
      <tr>${g.ms.map(([, , cs]) => cs.map(([, l]) => `<th class="ch">${l}</th>`).join('')).join('')}</tr></thead>`;
    const tabla = (g, y) => {
      const filas = g.tipo === 'ano' ? anios.map((a) => [String(a), a, 'A']) : periodos(g.tipo).map(([p, l]) => [l, y, p]);
      const cuerpo = filas.map(([l, yy, p]) => `<tr><td class="pp">${esc(l)}</td>${g.ms.map(([m, , cs]) => cs.map(([c]) => celda(yy, m, p, c)).join('')).join('')}</tr>`).join('');
      const tot = g.tipo === 'per' || g.tipo === 'p202' ? `<tr class="ttot"><td class="pp">Total ${y}</td>${g.ms.map(([m, , cs]) => cs.map(([c]) =>
        `<td class="num">${fnum(periodos(g.tipo).reduce((a, [p]) => a + (Number(prsVal(y, m, p, c)) || 0), 0))}</td>`).join('')).join('')}</tr>` : '';
      return `<table class="tprs">${cab(g)}<tbody>${cuerpo}${tot}</tbody></table>`;
    };
    const grupos = PRS.map((g) => `<section class="prs-card"><div class="prs-h">${g.t}</div><div class="wrap">${g.tipo === 'ano' ? tabla(g, ej)
      : anios.map((y) => `${anios.length > 1 ? `<div class="prs-y">Ejercicio ${y}</div>` : ''}${tabla(g, y)}`).join('')}</div></section>`).join('');
    return `${dz('prspdf', 'Suelta aquí los PDF de los impuestos presentados', '(uno o varios) o haz clic para elegirlos', '.pdf')}<div class="fc-cab"><span><b>${esc(e.nombre)}</b> · ${e.tipo === 'PYME' ? 'Pyme (trimestral)' : 'Gran empresa (mensual)'}</span>
      <label>Ver <select data-prsver><option value="ej"${prsVer === 'ej' ? ' selected' : ''}>Ejercicio ${ej}</option><option value="todo"${prsVer === 'todo' ? ' selected' : ''}>Todos los ejercicios</option></select></label></div>
      <p class="hint">Importes de las declaraciones presentadas. Se escriben a mano en cada celda (se guardan al salir) y alimentan la comprobación de las pestañas de retenciones y el cuadro de mando. La lectura automática de las casillas de los PDF está pendiente.</p>${listaPrsPdf()}${grupos}`;
  }

  // Columnas y casillas de cada modelo, como en la aplicación de impuestos: [clave, título, casilla]
  const CAS = (c) => (c === '' ? 'a mano' : /^[EASI]$/.test(c) ? `suma clave ${c}` : `casilla ${c}`);
  const PRS = [
    { t: 'Retenciones · 111, 115 y 123', tipo: 'per', ms: [
      ['111', [['base', 'Base Imponible', '02+05'], ['retN', 'Retenciones Nóminas', '03+06'], ['baseP', 'Bases Profesionales', '08'], ['retP', 'Retenciones Profesionales', '09']]],
      ['115', [['base', 'Bases Alquileres', '02'], ['ret', 'Retenciones Alquileres', '03']]],
      ['123', [['based', 'Base dividendos', '04'], ['retd', 'Retenciones dividendos', '07'], ['baser', 'Base resto de rentas', '05'], ['retr', 'Retenciones resto de rentas', '08'],
        ['base', 'Base total', '06'], ['ret', 'Retenciones total', '09']]]] },
    { t: 'IVA · 303, 349 e Intrastat', tipo: 'per', ms: [
      ['303', [['res', 'Resultado IVA', '46'], ['adu', 'IVA Aduanas', '77'], ['comp', 'IVA Compensar', '110'], ['apl', 'Cuotas Compensar Aplicadas', '78'],
        ['c87', 'Cuotas a compensar para periodos posteriores', '87'], ['liq', 'Resultado liquidación', '71']]],
      ['349', [['imp', 'Importe operaciones', '02'], ['E', 'Entregas (clave E)', 'E'], ['A', 'Adquisiciones (clave A)', 'A'], ['S', 'Servicios prestados (clave S)', 'S'],
        ['I', 'Servicios adquiridos (clave I)', 'I'], ['rect', 'Importe rectificaciones', '04']]],
      ['INT', [['exp', 'Expediciones (distribuciones) · importe', 'EXP'], ['kgE', 'Expediciones · masa neta kg', 'KGE'], ['int', 'Introducciones (llegadas) · importe', 'INT'], ['kgI', 'Llegadas · masa neta kg', 'KGI']]]] },
    { t: 'Anuales · 180, 190, 193, 200, 202 y 232', tipo: 'ano', ms: [
      ['180', [['base', 'Bases Alquileres', '02'], ['ret', 'Retenciones Alquileres', '03']]],
      ['190', [['base', 'Importe total de las percepciones relacionadas', '02'], ['retN', 'Importe total de las retenciones e ingresos a cuenta relacionados', '03']]],
      ['193', [['base', 'Bases Intereses + dividendos', '02'], ['ret', 'Retenciones Intereses', '03']]],
      ['200', [['cuota', 'Cuota Íntegra', '00562'], ['res', 'A devolver / A ingresar', '00621']]],
      ['232', [['ing', 'Total ingresos (I)', 'ING'], ['pag', 'Total pagos (P)', 'PAG'], ['nreg', 'Nº registros', 'NREG']]],
      ['202', [['res', 'A devolver / A ingresar', '34']], 'p202']] },
    { t: 'Impuestos especiales · 583, 592 y A22', tipo: 'per', ms: [
      ['583', [['base', 'Base imponible', ''], ['cuota', 'Cuota íntegra', ''], ['pagos', 'Pagos fraccionados anteriores', ''], ['res', 'A ingresar / A devolver', '']], 'p583'],
      ['592', [['kg', 'Cantidad kg (2)', '2'], ['base', 'Base imponible kg (3)', '3'], ['cuota', 'Cuota íntegra (5)', '5'], ['ded', 'Deducción (6)', '6'], ['res', 'Cuota íntegra total a ingresar (8)', '8']]],
      ['A22', [['imp', 'Importe solicitado', 'IMP'], ['kgV', 'Kg no reciclado vendido', 'KGV'], ['qV', 'Unidades vendidas', 'QV'], ['sop', 'IIEE soportado en adquisiciones', 'SOP']], 'pq']] },
  ];

  function vistaPrs() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), ej = Number(S.ejercicio), ed = puede();
    const anios = prsVer === 'todo' ? [...new Set([...prsRegs().map((r) => r.ejercicio), ej])].sort((a, b) => b - a) : [ej];
    const per = (tipo, y) => (tipo === 'p202' ? [['1P', 'Abril (1P)'], ['2P', 'Octubre (2P)'], ['3P', 'Diciembre (3P)']]
      : tipo === 'pq' ? ['1T', '2T', '3T', '4T'].map((q) => [q, `${q} trimestre`])
      : tipo === 'p583' ? [['3T', `3T ${y} · enero–septiembre`, y], ['0A', `Anual 0A ${y - 1} · enero–diciembre`, y - 1]]
      : e.tipo === 'PYME' ? ['1T', '2T', '3T', '4T'].map((q) => [q, `${q} trimestre`]) : MESES.map((m, i) => [String(i + 1).padStart(2, '0'), m[0].toUpperCase() + m.slice(1)]));
    const celda = (y, m, p, c) => { const v = prsVal(y, m, p, c); return ed ? `<td class="in"><input data-prs="${m}|${p}|${c}|${y}" value="${v === undefined ? '' : fnum(v)}" placeholder="—"></td>` : `<td class="num">${v === undefined ? '—' : fnum(v)}</td>`; };
    const tablaM = (m, cols, tipo, y) => {
      const filas = tipo === 'ano' ? anios.map((a) => [m === '200' ? `${a} · IS ${a - 1}` : m === '232' ? `${a} · ej. ${a - 1}` : String(a), a, 'A']) : per(tipo, y).map(([p, l, yy]) => [l, yy ?? y, p]);
      const cuerpo = filas.map(([l, yy, p]) => `<tr><td class="pp">${esc(l)}</td>${cols.map(([c]) => celda(yy, m, p, c)).join('')}</tr>`).join('');
      const tot = tipo === 'ano' || tipo === 'p583' ? '' : `<tr class="ttot"><td class="pp">Total ${y}</td>${cols.map(([c]) => `<td class="num">${fnum(per(tipo, y).reduce((a, [p]) => a + (Number(prsVal(y, m, p, c)) || 0), 0))}</td>`).join('')}</tr>`;
      return `<table class="tprs" style="flex:${cols.length + 1} 1 0"><thead><tr><th rowspan="2" class="pp">${tipo === 'ano' ? 'Ejercicio' : 'Periodo'}</th><th colspan="${cols.length}" class="mh">${m === 'INT' ? 'INTRASTAT' : m === '200' ? 'MODELO 200 · IS' : `MODELO ${m}`}</th></tr>
        <tr>${cols.map(([, l, c]) => `<th class="ch">${l}<small>${CAS(c)}</small></th>`).join('')}</tr></thead><tbody>${cuerpo}${tot}</tbody></table>`;
    };
    const fila = (g, y) => `<div class="prs-row">${g.ms.map(([m, cols, t]) => tablaM(m, cols, t ?? g.tipo, y)).join('')}</div>`;
    const grupos = PRS.map((g) => `<section class="prs-card"><div class="prs-h">${g.t}</div>${g.tipo === 'ano' ? fila(g, ej)
      : anios.map((y) => `${anios.length > 1 ? `<div class="prs-y">Ejercicio ${y}</div>` : ''}${fila(g, y)}`).join('')}</section>`).join('');
    return `${dz('prspdf', 'Suelta aquí los PDF de los impuestos presentados', '(uno o varios) o haz clic para elegirlos', '.pdf')}<div class="fc-cab"><span><b>${esc(e.nombre)}</b> · ${e.tipo === 'PYME' ? 'Pyme (trimestral)' : 'Gran empresa (mensual)'}</span>
      <label>Ver <select data-prsver><option value="ej"${prsVer === 'ej' ? ' selected' : ''}>Ejercicio ${ej}</option><option value="todo"${prsVer === 'todo' ? ' selected' : ''}>Todos los ejercicios</option></select></label></div>
      <p class="hint">Importes de las declaraciones presentadas, con las casillas de cada modelo. Al soltar el PDF se leen modelo, ejercicio, periodo y casillas y se rellenan solos; también puedes escribirlos o corregirlos a mano (se guardan al salir). El 583 tiene dos filas: el 3T del ejercicio (enero–septiembre) y el anual 0A del ejercicio anterior, que se presenta en el mismo mes.</p>${grupos}${listaPrsPdf()}`;
  }

  // ---- Bloque 1 · Retenciones Modelo 111 / 115 / 123: listado justificativo del periodo, desde el libro de recibidas ----
  const CLAVE_RET = (cod) => (/^I\.PR\./.test(cod) ? ['111', '111 · Actividades económicas'] : /^I\.NM/.test(cod) ? ['111T', '111 · Rendimientos del trabajo']
    : /^I\.ALQ/.test(cod) ? ['115', '115 · Arrendamientos'] : /^I\.(INT|DV)/.test(cod) ? ['123', '123 · Capital mobiliario'] : null);
  const trimDe = (mm) => `${Math.ceil(+mm / 3)}T`;
  // gran empresa → por meses; pyme → por trimestres (el trimestre figura en su último mes)
  const perEf = (e, per) => (e?.tipo === 'PYME' ? (/^\d\d$/.test(per) ? trimDe(per) : per) : (/^[1-4]T$/.test(per) ? String(+per[0] * 3).padStart(2, '0') : per));
  function lineasListado(mod, R, ej, per) {
    const r = rangoPeriodo(ej, per);
    const claves = { 111: ['111', '111T'], 115: ['115'], 123: ['123'] }[mod];
    const ov = retOv(); // clave elegida a mano por línea (111T, 111, 115, 123 o «-» = no declarar)
    const modelo = (l) => { const n = CLAVE_RET(l.codigo), o = ov[claveLinea(l)]; return { n, o, m: o && o !== '-' ? o : n?.[0] }; };
    return R.filter((l) => {
      const { n, m } = modelo(l);
      return n && claves.includes(m) && l.fecha >= r.desde && l.fecha <= r.hasta && (Math.abs(l.cuota) > 0.0049 || /^I\.DV\.E/.test(l.codigo)); // dividendos exentos se listan sin retención
    }).map((l) => { const { n, o } = modelo(l);
      return { id: claveLinea(l), f: l.fecha, fa: l.factura, ni: l.nif, no: l.nombre, b: l.base, re: -l.cuota + 0, t: l.base ? Math.round((-l.cuota / l.base) * 10000) / 100 : 0, k: o ? [o, RET_MODELOS[o]] : n }; })
      .sort((a, b) => a.f.localeCompare(b.f));
  }
  const RET_MODELOS = { '111T': '111 · Rendimientos del trabajo', 111: '111 · Actividades económicas', 115: '115 · Arrendamientos', 123: '123 · Capital mobiliario', '-': 'No declarar' };
  const retOv = () => S.registros.find((r) => r.tipo === 'retclave' && r.empresa_id === S.sel)?.datos ?? {};
  const claveLinea = (l) => `${l.factura}|${l.nif}|${l.fecha}|${l.codigo}|${l.base}`;
  async function guardarRetClave(id, v) {
    const reg = S.registros.find((r) => r.tipo === 'retclave' && r.empresa_id === S.sel);
    const datos = JSON.parse(JSON.stringify(reg?.datos ?? {}));
    if (v) datos[id] = v; else delete datos[id];
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'retclave', ejercicio: null, datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  // lo presentado: importes de «Impuestos Presentados» para ese modelo y periodo (null = sin presentar)
  const presentadoRet = (mod, ej, per) => {
    const d = prsVal(ej, `${mod}|${per}`.split('|')[0], per, mod === '111' ? 'retN' : 'ret'), p = mod === '111' ? prsVal(ej, '111', per, 'retP') : undefined;
    if (d !== undefined || p !== undefined) return Math.round(((Number(d) || 0) + (Number(p) || 0)) * 100) / 100;
    const fs =S.registros.filter((r) => r.tipo === 'pres' && r.empresa_id === S.sel && r.ejercicio === ej && r.datos.modelo === mod && r.datos.periodo === per);
    return fs.length ? Math.round(fs.reduce((a, r) => a + (Number(r.datos.importe) || 0), 0) * 100) / 100 : null;
  };
  const nominasMan = (per0, per) => { const d = manDe('m111')?.datos ?? {}; return d[per] ?? d[per0] ?? {}; };

  // Listado justificativo de una empresa (la actual, S.sel). modo: 'pantalla' (una tabla con la clave editable) o 'imprimir' (111 por apartados)
  function listadoRetHtml(mod, e, R, modo) {
    const ej = Number(S.ejercicio), per0 = S.periodo || '01', per = perEf(e, per0), ed = false, pant = modo === 'pantalla';
    const TB = (inner) => (pant ? `<div class="wrap"><table class="tabla-cu">${inner}</table></div>` : `<table>${inner}</table>`), H4 = (t) => `<h4${pant ? ' class="cu-t"' : ''}>${t}</h4>`;
    const todas = lineasListado(mod, R, ej, per), lis = todas.filter((x) => x.k[0] !== '-');
    const mn = mod === '111' ? nominasMan(per0, per) : {};
    const np = mod === '111' ? nomPer(ej, per) : null; // nóminas: cuadrante de la pestaña Nóminas (devengado + indemnizaciones, e IRPF)
    const nom = np ? [{ ...np, cuad: true }] : (Number(mn.t2) || Number(mn.t3)) ? [{ s: Number(mn.t2) || 0, r: Number(mn.t3) || 0 }] : [];
    const sumaL = (a, k) => rr(a.reduce((t, x) => t + x[k], 0));
    const lT = lis.filter((x) => x.k[0] === '111T'), lP = lis.filter((x) => x.k[0] === '111');
    const nR = rr(nom.reduce((a, n) => a + n.r, 0)), nS = rr(nom.reduce((a, n) => a + n.s, 0));
    const tN = rr(nR + sumaL(lT, 're')), tP = sumaL(lP, 're'), tR = rr(sumaL(lis, 're') + nR), tB = rr(sumaL(lis, 'b') + nS);
    const f = (d) => d.split('-').reverse().join('/');
    const nomFila = (n, clave) => `<tr><td class="c">${esc(per)}/${ej}</td><td colspan="3">${n.cuad ? 'Nóminas del periodo (devengado e IRPF)' : 'Nóminas del periodo (ajustes manuales: devengado e IRPF)'}</td><td class="num n">${fnum(n.s)}</td><td></td><td class="num n">${fnum(n.r)}</td>${clave ? '<td>111 · Trabajo (nómina)</td>' : ''}</tr>`;
    const sel = (x) => (ed ? `<select data-retclave="${esc(x.id)}">${Object.keys(RET_MODELOS).map((k) => `<option value="${k}"${x.k[0] === k ? ' selected' : ''}>${esc(RET_MODELOS[k])}</option>`).join('')}</select>` : esc(x.k[1] ?? RET_MODELOS[x.k[0]] ?? x.k[0]));
    const fl = (x, clave) => `<tr${x.k[0] === '-' ? ' style="opacity:.55"' : ''}><td class="c">${f(x.f)}</td><td>${esc(x.fa)}</td><td>${esc(x.ni)}</td><td>${esc(x.no)}</td><td class="num n">${fnum(x.b)}</td><td class="num n">${x.t ? fnum(x.t) : ''}</td><td class="num n">${fnum(x.re)}</td>${clave ? `<td>${sel(x)}</td>` : ''}</tr>`;
    const th = (clave) => `<thead><tr><th>Fecha</th><th>Factura</th><th>NIF</th><th>Perceptor</th><th>Base</th><th>% ret.</th><th>Retención</th>${clave ? '<th>Clave</th>' : ''}</tr></thead>`;
    let tabla;
    if (!todas.length && !nom.length) tabla = '<p class="hint">Sin líneas de retención en el periodo.</p>';
    else if (mod === '111') {
      const bN = rr(nS + sumaL(lT, 'b')), bP = sumaL(lP, 'b');
      tabla = `${H4('1. Rendimientos del trabajo · Nóminas (casillas 02-03 / 05-06)')}${nom.length || lT.length ? TB(`${th(false)}<tbody>${nom.map((n) => nomFila(n, false)).join('')}${lT.map((x) => fl(x, false)).join('')}
        <tr class="total tot"><td colspan="4">Subtotal nóminas (${nom.length + lT.length} líneas)</td><td class="num n">${fnum(bN)}</td><td></td><td class="num n">${fnum(tN)}</td></tr></tbody>`) : '<p class="hint">Sin nóminas en el periodo: rellénalas en 9.- Nóminas.</p>'}
        ${H4('2. Actividades económicas · Profesionales (casillas 08-09)')}${lP.length ? TB(`${th(false)}<tbody>${lP.map((x) => fl(x, false)).join('')}
        <tr class="total tot"><td colspan="4">Subtotal profesionales (${lP.length} líneas)</td><td class="num n">${fnum(bP)}</td><td></td><td class="num n">${fnum(tP)}</td></tr></tbody>`) : '<p class="hint">Sin profesionales en el periodo.</p>'}
        ${H4('3. Resumen')}${TB(`<thead><tr><th>Concepto</th><th>Base</th><th>Retención</th></tr></thead><tbody>
        <tr><td>Nóminas / trabajo</td><td class="num n">${fnum(bN)}</td><td class="num n">${fnum(tN)}</td></tr><tr><td>Profesionales</td><td class="num n">${fnum(bP)}</td><td class="num n">${fnum(tP)}</td></tr>
        <tr class="total tot"><td>Total Modelo 111</td><td class="num n">${fnum(rr(bN + bP))}</td><td class="num n">${fnum(tR)}</td></tr></tbody>`)}`;
    } else {
      tabla = `<table class="tabla-cu tret">${th(true)}<tbody>${nom.map((n) => nomFila(n, true)).join('')}${todas.map((x) => fl(x, true)).join('')}
        <tr class="total tot"><td colspan="4">Total listado (${lis.length + nom.length} líneas)</td><td class="num n">${fnum(tB)}</td><td></td><td class="num n">${fnum(tR)}</td><td></td></tr></tbody></table>`;
      if (modo === 'pantalla') tabla = `<div class="wrap">${tabla}</div>`;
    }
    // lo presentado (Impuestos Presentados) frente al listado
    const comp = (lbl, lisv, pr) => { const d = pr === null ? null : rr(lisv - pr), ok = d !== null && Math.abs(d) <= 0.01;
      return `<tr><td>${lbl}</td><td class="num n">${fnum(lisv)}</td><td class="num n">${pr === null ? '—' : fnum(pr)}</td><td class="num n"${d !== null && !ok ? ' style="color:#b00"' : ''}>${d === null ? '—' : fnum(d)}</td>
        <td class="c"><b style="color:${pr === null ? '#888' : ok ? '#070' : '#b00'}">${pr === null ? 'Sin presentar' : ok ? 'Cuadra' : 'Descuadre'}</b></td></tr>`; };
    const P = presentadoRet(mod, ej, per), pN = prsVal(ej, '111', per, 'retN'), pP = prsVal(ej, '111', per, 'retP');
    const filas = mod === '111' && !pant
      ? comp('Nóminas / trabajo (03+06)', tN, pN === undefined ? null : Number(pN)) + comp('Profesionales (09)', tP, pP === undefined ? null : Number(pP)) + comp('<b>Total 111</b>', tR, P)
      : comp(mod === '111' ? '<b>Total 111</b>' : `Retenciones (${mod === '115' ? '03' : '09'})`, tR, P);
    const cab = `<div class="rl-cab"><b>${esc(e.nombre)}</b> · NIF ${esc(e.cif)} · ${e.tipo === 'PYME' ? 'Pyme (trimestral)' : 'Gran empresa (mensual)'}<br>Modelo ${mod} · Periodo ${esc(per)}/${ej}${per !== per0 ? ' <small>(periodo de la empresa para el mes elegido)</small>' : ''}</div>`;
    return `${cab}${tabla}<h4 class="cu-t">Comprobación con lo presentado</h4><div class="wrap"><table class="tabla-cu tret"><thead><tr><th>Casilla</th><th>Listado</th><th>Presentado</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  function vistaListadoRet(mod) {
    if (!S.sel) return sinEmpresa;
    const R = grande('fact-R');
    if (!R) return cargandoTxt;
    const e = empresa(), per0 = S.periodo || '01', per = perEf(e, per0);
    const ops = (e.tipo === 'PYME' ? ['1T', '2T', '3T', '4T'].map((v) => [v, `${v} trimestre`]) : MESES.map((m, i) => [String(i + 1).padStart(2, '0'), `${String(i + 1).padStart(2, '0')} ${m}`]))
      .map(([v, t]) => `<option value="${v}"${v === per ? ' selected' : ''}>${t}</option>`).join('');
    const barra = `<div class="fc-cab"><label>Empresa <select data-glob="sel">${S.empresas.map((x) => `<option value="${x.id}"${x.id === S.sel ? ' selected' : ''}>${esc(x.nombre)} (${x.tipo === 'PYME' ? 'trim.' : 'mens.'})</option>`).join('')}</select></label>
      <label>Periodo <select data-glob="periodo">${ops}</select></label></div>
      <p class="hint">Gran empresa: por meses. Pyme: por trimestres. Las líneas salen del libro de IVA recibidas (botón RECIBIDAS) y las nóminas, de la pestaña Nóminas.</p>`;
    return `<h4 class="cu-t gr">Listado justificativo Mod. ${mod}</h4>${barra}${listadoRetHtml(mod, e, R, 'pantalla')}`;
  }

  // Libro de recibidas de cualquier empresa (en memoria si ya se pidió)
  async function datosR(empresaId) {
    const k = `fact-R|${empresaId}`;
    if (Array.isArray(GR.get(k))) return GR.get(k);
    const { data } = await db.from('registros').select('datos').eq('empresa_id', empresaId).eq('tipo', 'fact-R').maybeSingle();
    GR.set(k, data?.datos?.filas ?? []);
    return GR.get(k);
  }
  // PDF con una hoja vertical por empresa (el periodo elegido; trimestre en las pymes)
  async function imprimirRet(mod) {
    const w = window.open('', '_blank');
    if (!w) return void alert('Permite las ventanas emergentes para imprimir');
    w.document.write('<p style="font:14px system-ui">Preparando el listado de todas las empresas…</p>');
    const mods = mod === 'todos' ? ['111', '115', '123'] : [mod], sel0 = S.sel, per0 = S.periodo || '01';
    const pags = [];
    try {
      for (const e of S.empresas) {
        const R = await datosR(e.id);
        S.sel = e.id;
        pags.push(`<div class="pag">${mods.map((m) => listadoRetHtml(m, e, R, 'imprimir')).join('<div style="height:14px"></div>')}</div>`);
      }
    } finally { S.sel = sel0; }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Retenciones ${mod === 'todos' ? '111-115-123' : `Mod. ${mod}`} - ${per0}-${S.ejercicio}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600&display=swap"><style>
      @page{size:A4 portrait;margin:10mm} body{font:10.5pt 'Bricolage Grotesque',Arial,sans-serif;color:#000} .pag+.pag{break-before:page;page-break-before:always} tr{break-inside:avoid} h4{break-after:avoid;font-size:11.5pt;margin:10px 0 4px}
      .rl-cab{font-size:13pt;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:8px} table{width:100%;border-collapse:collapse;margin-bottom:6px}
      th,td{border:1px solid #999;padding:3px 5px;font-size:10pt} th{background:#eee} td.n{text-align:right;white-space:nowrap} td.c{text-align:center} tr.total td{font-weight:bold;background:#f4f4f4} .hint{color:#555}
      select{border:0;background:none;font:inherit;appearance:none}</style></head><body>${pags.join('')}<script>onload=()=>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  }

  // Resúmenes anuales por perceptor: 180 (115), 193 (123) y 190 (111, actividades económicas)
  function vistaRetAnual(modelo) {
    if (!S.sel) return sinEmpresa;
    const R = grande('fact-R');
    if (!R) return cargandoTxt;
    if (!R.length) return '<p class="vacio">Sin datos: carga el libro de IVA soportado con el botón RECIBIDAS.</p>';
    const c = calcularRet(modelo, R, Number(S.ejercicio), '');
    return `<div class="bar"><span class="chip">Ejercicio ${esc(S.ejercicio)} · ${c.perceptores} perceptores</span></div>
      ${c.porNif.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>NIF-CIF</th><th>Perceptor</th><th class="num">Base / percepciones</th><th class="num">Retenciones</th></tr></thead><tbody>
      ${c.porNif.map((x) => `<tr><td>${esc(x.nif)}</td><td>${esc(x.nombre)}</td>${celdasNum(x.base)}${celdasNum(x.ret)}</tr>`).join('')}
      <tr><td colspan="2"><b>Total</b></td>${celdasNum(c.base)}${celdasNum(c.ret)}</tr></tbody></table></div>` : '<p class="hint">Sin retenciones en el ejercicio.</p>'}
      <p class="hint">${modelo === '111' ? 'Solo actividades económicas (libro de IVA soportado). Los rendimientos del trabajo por perceptor salen de las nóminas, que aún no están cargadas.' : 'Suma de los doce meses del libro de IVA soportado, por perceptor.'}</p>`;
  }

  // 390: el 303 de cada periodo (mensual para gran empresa, trimestral para el resto) y el total del ejercicio
  function vistaMod390() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return cargandoTxt;
    if (!E.length && !R.length) return '<p class="vacio">Sin datos: carga los libros de IVA con los botones EMITIDAS y RECIBIDAS.</p>';
    const mensual = empresa()?.tipo === 'GE';
    const periodos = mensual ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')) : ['1T', '2T', '3T', '4T'];
    const man = regMan()?.datos ?? {};
    const filas = periodos.map((p) => ({ p, c: calcular303(E, R, Number(S.ejercicio), p, man[p] ?? {}) }));
    const tot = (k) => filas.reduce((a, x) => a + x.c[k], 0);
    return `<div class="bar"><span class="chip">${mensual ? 'Gran empresa · liquidación mensual' : 'Liquidación trimestral'} · ejercicio ${esc(S.ejercicio)}</span></div>
      <div class="wrap"><table class="tabla"><thead><tr><th>Periodo</th><th class="num">Cuota devengada (27)</th><th class="num">Total a deducir (45)</th><th class="num">Resultado RG (46)</th>
      <th class="num">IVA diferido aduana (77)</th><th class="num">Resultado liquidación (71)</th></tr></thead><tbody>
      ${filas.map((x) => `<tr><td><b>${esc(PERIODOS[x.p] ?? x.p)}</b></td>${celdasNum(x.c.devengado)}${celdasNum(x.c.deducir)}${celdasNum(x.c.c46)}${celdasNum(x.c.c77)}${celdasNum(x.c.c71)}</tr>`).join('')}
      <tr class="fila-ok"><td><b>TOTAL EJERCICIO</b></td>${celdasNum(tot('devengado'))}${celdasNum(tot('deducir'))}${celdasNum(tot('c46'))}${celdasNum(tot('c77'))}${celdasNum(tot('c71'))}</tr></tbody></table></div>
      <p class="hint">Suma de los 303 de cada periodo, con sus ajustes manuales. Resumen de trabajo: compáralo con el 390 oficial antes de presentarlo.</p>`;
  }

  // function (y no const) para que exista antes de montar las pestañas
  function pendienteMod(hoja) { return () => `<p class="vacio">Este modelo todavía no está migrado. En tu Excel se calcula en la hoja «${hoja}».</p>`; }

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

  // ---- Bloque 9 · Nóminas (a mano), conciliación de la Seguridad Social y control de nóminas ----
  // Un registro «nominas» por empresa y ejercicio: datos[mes 01..12][campo]; los campos c_* son de la conciliación de la SS
  const NOM_CONC = [['salarios', 'Total devengado (T. devengado − kilometraje − dietas − indemnizaciones)'], ['km', 'Kilometraje exento'], ['dietas', 'Dietas y manutención'], ['indem', 'Indemnizaciones'],
    ['ssEmp', 'SS empresa'], ['ssTrab', 'SS trabajador'], ['ssTot', 'SS empresa + trabajador (SS empresa + SS trabajador)', 1], ['ret', 'Retenciones'], ['anticipos', 'Anticipos'], ['embargos', 'Embargos'],
    ['seguro', 'Seguro'], ['liquido', 'Líquido'], ['dif', 'Diferencias', 1]];
  const NOM_DIF = 'Salarios + kilometraje + indemnizaciones + SS empresa − SS empresa y trabajador − retenciones − anticipos − embargos − seguro − líquido';
  const MM12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const rr = (x) => Math.round(x * 100) / 100 + 0;
  const nomReg = (y) => S.registros.find((r) => r.tipo === 'nominas' && r.empresa_id === S.sel && r.ejercicio === y);
  const nomCalc = (x) => {
    if (!x || !Object.keys(x).some((k) => !k.startsWith('c_'))) return null;
    const n = (k) => Number(x[k]) || 0, ssTot = n('ssEmp') + n('ssTrab');
    return { ...x, ssTot: rr(ssTot), dif: rr(n('salarios') + n('km') + n('indem') + n('ssEmp') - ssTot - n('ret') - n('anticipos') - n('embargos') - n('seguro') - n('liquido')) };
  };
  const nomMes = (y, mm) => nomCalc(nomReg(y)?.datos?.[mm]);
  // nóminas de un periodo (mes «01» o trimestre «1T»): base = devengado + indemnizaciones, y retenciones; null si no hay nóminas cargadas
  const nomPer = (ej, per) => {
    const meses = /^[1-4]T$/.test(per) ? [0, 1, 2].map((i) => String((+per[0] - 1) * 3 + i + 1).padStart(2, '0')) : /^\d\d$/.test(per ?? '') ? [per] : [];
    const nm = meses.map((mm) => nomMes(ej, mm)).filter(Boolean);
    return nm.length ? { s: rr(nm.reduce((a, x) => a + (Number(x.salarios) || 0) + (Number(x.indem) || 0), 0)), r: rr(nm.reduce((a, x) => a + (Number(x.ret) || 0), 0)) } : null;
  };
  async function guardarNom(clave, valor) {
    const [mm, campo, y] = clave.split('|');
    const reg = nomReg(+y);
    const datos = JSON.parse(JSON.stringify(reg?.datos ?? {}));
    datos[mm] ??= {};
    if (String(valor).trim() === '') delete datos[mm][campo]; else datos[mm][campo] = parseES(valor);
    if (!Object.keys(datos[mm]).length) delete datos[mm];
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'nominas', ejercicio: +y, datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  const celdaNom = (mm, campo, y, ed) => {
    const v = nomReg(y)?.datos?.[mm]?.[campo];
    return ed ? `<td class="in"><input data-nom="${mm}|${campo}|${y}" value="${v === undefined ? '' : fnum(v)}" placeholder="—"></td>` : `<td class="num">${v === undefined ? '—' : fnum(v)}</td>`;
  };
  const cabNom = (e, y, extra = '') => `<div class="fc-cab"><span><b>${esc(e.nombre)}</b> · Ejercicio ${y}${extra}</span></div>`;

  function vistaNom() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), y = Number(S.ejercicio), ed = puede();
    const dat = MM12.map((mm) => nomMes(y, mm));
    const mal = MM12.filter((mm, i) => dat[i] && Math.abs(dat[i].dif) > 0.01).map((mm) => MESES[+mm - 1]);
    const filas = NOM_CONC.map(([k, t, der]) => {
      const tot = rr(dat.reduce((a, x) => a + (x ? Number(x[k]) || 0 : 0), 0));
      const cel = MM12.map((mm, i) => (der ? (dat[i] ? `<td class="num${k === 'dif' && Math.abs(dat[i][k]) > 0.01 ? ' dif-ko' : ''}">${fnum(dat[i][k])}</td>` : '<td class="num vacio">—</td>') : celdaNom(mm, k, y, ed))).join('');
      return `<tr class="${k === 'liquido' ? 'sub' : k === 'dif' ? 'verde' : der ? 'cmp' : ''}"><td class="pp" ${k === 'dif' ? `title="${esc(NOM_DIF)}"` : ''}>${esc(t)}</td>${cel}<td class="num ejer">${fnum(tot)}</td></tr>`;
    }).join('');
    return `${cabNom(e, y, ` · ${dat.filter(Boolean).length} de 12 meses con nóminas`)}
      <p class="hint">Escribe los importes del cuadrante de la gestoría en cada mes (se guardan al salir de la celda). «Diferencias» = ${esc(NOM_DIF)}; debe dar cero.${mal.length ? ` <b style="color:#b42318">No cuadra en: ${mal.join(', ')}.</b>` : ''}</p>
      <section class="prs-card"><div class="wrap"><table class="tprs tnom"><thead><tr><th class="pp">Concepto</th>${MESES.map((m) => `<th>${m[0].toUpperCase() + m.slice(1, 3)} ${y}</th>`).join('')}<th class="ejer">EJERCICIO ${y}</th></tr></thead><tbody>${filas}</tbody></table></div></section>`;
  }

  function vistaCssoc() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), y = Number(S.ejercicio), ed = puede(), T = { p: 0, ss: 0, dsn: 0, it: 0, cur: 0, d: 0 };
    const z = (v) => (Math.abs(v) < 0.005 ? '—' : fnum(v));
    const filas = MM12.map((mm, i) => {
      const N = nomMes(y, mm), x = nomReg(y)?.datos?.[mm] ?? {};
      const ss = N ? N.ssTot : null, p = x.c_pagos !== undefined ? Number(x.c_pagos) : null;
      const it = -Math.abs(Number(x.c_it) || 0), cur = -Math.abs(Number(x.c_bonif) || 0);
      const dsn = p === null && ss === null ? null : rr((p || 0) - (ss || 0)), dif = dsn === null ? null : rr(dsn - it - cur), ok = dif !== null && Math.abs(dif) <= 1;
      T.p += p || 0; T.ss += ss || 0; T.dsn += dsn || 0; T.it += it; T.cur += cur; T.d += dif || 0;
      return `<tr class="${dif === null ? '' : ok ? 'cf-ok' : 'cf-ko'}"><td class="pp">${MESES[i][0].toUpperCase() + MESES[i].slice(1)} ${y}</td>${celdaNom(mm, 'c_pagos', y, ed)}<td class="num">${ss === null ? '—' : fnum(ss)}</td>
        <td class="num">${dsn === null ? '—' : fnum(dsn)}</td>${celdaNom(mm, 'c_it', y, ed)}${celdaNom(mm, 'c_bonif', y, ed)}<td class="num"><b>${dif === null ? '—' : fnum(dif)}</b></td><td>${dif === null ? 'Sin datos' : ok ? '✓ Cuadra' : p === null ? '✖ Sin pago' : '✖ Descuadra'}</td></tr>`;
    }).join('');
    return `${cabNom(e, y)}
      <p class="hint">Seguros Sociales pagados (los del mes siguiente, asientos PS de la 4760.01) − Seguridad Social de las nóminas (pestaña Nóminas) = Diferencias; menos IT y menos Bonificaciones (cursos FUNDAE), ambas en negativo = Dif. mes Seg. Social. Cero = verde; si no, rojo. Escribe pagos, IT y bonificaciones a mano en cada mes.</p>
      <section class="prs-card"><div class="wrap"><table class="tprs tnom"><thead><tr><th class="pp">Mes</th><th>Seguros Sociales pagados</th><th>Seguridad Social Nóminas</th><th>Diferencias SS − Nóminas</th><th>IT</th><th>Bonificaciones</th><th>Dif. mes Seg. Social</th><th>Estado</th></tr></thead>
      <tbody>${filas}<tr class="ttot"><td class="pp">TOTAL</td><td class="num">${fnum(T.p)}</td><td class="num">${fnum(T.ss)}</td><td class="num">${fnum(rr(T.dsn))}</td><td class="num">${z(T.it)}</td><td class="num">${z(T.cur)}</td><td class="num">${fnum(rr(T.d))}</td><td></td></tr></tbody></table></div></section>`;
  }

  function vistaCnom() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), y = Number(S.ejercicio), trim = e.tipo === 'PYME';
    const N = MM12.map((mm) => nomMes(y, mm));
    const hay = N.some(Boolean);
    const n = (v) => (v === null || v === undefined || isNaN(v) ? '—' : fnum(rr(v)));
    const pc = (v) => (v === null || !isFinite(v) ? '—' : `${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
    const dd = (a, b) => (a === null || a === undefined || b === null || b === undefined ? '<td class="num" style="color:#777">—</td>'
      : `<td class="num" style="font-weight:600;color:${Math.abs(a - b) <= 1 ? '#1a7f37' : '#b42318'}">${Math.abs(a - b) <= 1 ? '✓' : fnum(rr(a - b))}</td>`);
    const base = (x) => (x ? (Number(x.salarios) || 0) + (Number(x.indem) || 0) : null); // sujeto: salarios + indemnizaciones (km y dietas exentos)
    const pers = trim ? ['1T', '2T', '3T', '4T'].map((p) => ({ p, l: p, ix: [0, 1, 2].map((i) => (+p[0] - 1) * 3 + i) })) : MM12.map((p, i) => ({ p, l: MESES[i], ix: [i] }));
    let t = { b: 0, r: 0 };
    const f1 = pers.map(({ p, l, ix }) => {
      const xs = ix.map((i) => N[i]).filter(Boolean);
      const b = xs.length ? rr(xs.reduce((s, x) => s + base(x), 0)) : null, r = xs.length ? rr(xs.reduce((s, x) => s + (Number(x.ret) || 0), 0)) : null;
      const pb = prsVal(y, '111', p, 'base'), pr = prsVal(y, '111', p, 'retN');
      if (b === null && pb === undefined) return '';
      t.b += b || 0; t.r += r || 0;
      return `<tr><td class="pp">${l[0].toUpperCase() + l.slice(1)}</td><td class="num">${n(b)}</td><td class="num">${n(pb)}</td>${dd(b, pb)}<td class="num">${n(r)}</td><td class="num">${n(pr)}</td>${dd(r, pr)}<td class="num">${b ? pc(r / b) : '—'}</td></tr>`;
    }).join('');
    const anual = (k) => rr(N.reduce((s, x) => s + (x ? Number(x[k]) || 0 : 0), 0));
    const sumP = (c) => rr(pers.reduce((s, { p }) => s + (Number(prsVal(y, '111', p, c)) || 0), 0));
    const b190 = prsVal(y, '190', 'A', 'base'), r190 = prsVal(y, '190', 'A', 'retN');
    const bEsp = rr(anual('salarios') + anual('indem') + sumP('baseP')), rEsp = rr(anual('ret') + sumP('retP'));
    const R = MM12.map((mm, i) => ({ m: MESES[i], x: N[i] })).filter((o) => o.x).map(({ m, x }) => { const b = base(x) || 0, s = Number(x.salarios) || 0;
      return { m, tIrpf: b ? (Number(x.ret) || 0) / b : null, tSS: s ? (Number(x.ssEmp) || 0) / s : null, ssTrab: s ? (Number(x.ssTrab) || 0) / s : null, coste: rr(s + (Number(x.indem) || 0) + (Number(x.ssEmp) || 0)) }; });
    const al = [];
    R.forEach((r, i) => { const a = R[i - 1];
      if (r.tSS !== null && r.tSS < 0.25) al.push(`${r.m}: Seguridad Social de la empresa ${pc(r.tSS)} del salario (normal ≈ 30 %): ¿bonificaciones, bases máximas, IT o error de la gestoría?`);
      if (a) {
        if (r.tIrpf !== null && a.tIrpf !== null && Math.abs(r.tIrpf - a.tIrpf) > 0.03) al.push(`${r.m}: el tipo medio de IRPF pasa de ${pc(a.tIrpf)} a ${pc(r.tIrpf)} (revisar regularizaciones, altas/bajas o paga extra)`);
        if (a.coste && Math.abs(r.coste - a.coste) / a.coste > 0.2) al.push(`${r.m}: el coste de personal varía ${pc((r.coste - a.coste) / a.coste)} frente a ${a.m} (${n(a.coste)} → ${n(r.coste)})`);
      } });
    const f4 = R.map((r) => `<tr><td class="pp">${r.m[0].toUpperCase() + r.m.slice(1)}</td><td class="num">${pc(r.tIrpf)}</td><td class="num">${pc(r.tSS)}</td><td class="num">${pc(r.ssTrab)}</td><td class="num">${n(r.coste)}</td></tr>`).join('');
    const tabla = (tit, cab, cuerpo) => `<section class="prs-card"><div class="prs-h">${tit}</div><div class="wrap"><table class="tprs tnom"><thead><tr>${cab.map((c, i) => `<th${i ? '' : ' class="pp"'}>${c}</th>`).join('')}</tr></thead><tbody>${cuerpo}</tbody></table></div></section>`;
    return `${cabNom(e, y)}
      <p class="hint">Control del cuadrante de la gestoría (pestaña Nóminas) frente al 111 y al 190 presentados (pestaña Impuestos Presentados). Base sujeta = devengado − kilometraje − dietas (exentos); las indemnizaciones se toman como sujetas. ✓ = cuadra (±1 €).${hay ? '' : ` <b>No hay nóminas de ${y}: rellénalas en 9.- Nóminas.</b>`}</p>
      ${tabla(`1 · Cuadrante frente al modelo 111 (rendimientos del trabajo) · ${y}`, [trim ? 'Trimestre' : 'Mes', 'Base cuadrante', '111 percepciones [02+05]', 'Dif.', 'IRPF cuadrante', '111 retenciones [03+06]', 'Dif.', 'Tipo medio'],
        f1 || '<tr><td colspan="8" class="vacio">Sin datos</td></tr>')}
      ${tabla(`2 · Cuadrante frente al modelo 190 · ${y}`, ['Concepto', 'Cuadrante + profesionales 111', 'Modelo 190', 'Dif.'],
        `<tr><td class="pp">Percepciones</td><td class="num">${n(hay ? bEsp : null)}</td><td class="num">${n(b190)}</td>${dd(hay ? bEsp : null, b190)}</tr>
         <tr><td class="pp">Retenciones</td><td class="num">${n(hay ? rEsp : null)}</td><td class="num">${n(r190)}</td>${dd(hay ? rEsp : null, r190)}</tr>`)}
      ${tabla('3 · Ratios del cuadrante', ['Mes', 'Tipo medio IRPF', 'SS empresa / salario', 'SS trabajador / salario', 'Coste de personal'], f4 || '<tr><td colspan="5" class="vacio">Sin datos</td></tr>')}
      ${al.length ? `<section class="prs-card"><div class="prs-h">Alertas</div><ul class="hint" style="margin:.6rem 1.2rem">${al.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>` : ''}`;
  }

  // PDF de declaraciones presentadas: se guardan en la empresa (por el NIF del PDF, o la elegida) con modelo, ejercicio y periodo detectados
  async function cargarPresentados(files) {
    const informe = [], regs = new Map(); // regs: «prs» por empresa y ejercicio, acumulado mientras dura la carga
    let destino = null;
    const ANUALES = ['180', '190', '193', '200', '232'];
    for (const f of files) {
      try {
        if (!/\.pdf$/i.test(f.name)) { informe.push(`↷ ${f.name}: no es PDF`); continue; }
        const { texto: t, pags } = await leerPdf(f);
        const e = S.empresas.find((x) => x.cif && t.includes(x.cif)) ?? S.empresas.find((x) => x.cif === nifDe(t)) ?? empresa();
        if (!e) { informe.push(`⚠ ${f.name}: elige la empresa`); continue; }
        const h = cabeceraPresentado(t);
        const modelo = h.modelo || (/\b(A22|\d{3})\b/.exec(f.name) || [])[1] || '';
        const ejDecl = h.ej || Number(S.ejercicio);
        // el 200 (Impuesto sobre Sociedades) se presenta al año siguiente: se guarda en el año de presentación
        const ej = ['200', '232'].includes(modelo) ? (Number((/(?:realizada el|presentada el d[ií]a):?\s*\d\d-\d\d-(20\d\d)/i.exec(t) || [])[1]) || ejDecl + 1) : ejDecl;
        let per = h.per;
        if (ANUALES.includes(modelo)) per = 'A';
        else if (!['583', '202', 'A22'].includes(modelo) && per) per = perEf(e, per);
        const val = valoresPresentado(modelo, casillasPDF(pags), t);
        const ref = `${f.name}|${f.size}`;
        let aviso = '';
        if (modelo && Object.keys(val).length) {
          const k = `${e.id}|${ej}`;
          let r = regs.get(k);
          if (!r) {
            const ex = S.registros.find((x) => x.tipo === 'prs' && x.empresa_id === e.id && x.ejercicio === ej);
            r = { ex, datos: JSON.parse(JSON.stringify(ex?.datos ?? {})), id: ex?.id ?? crypto.randomUUID() };
            regs.set(k, r);
          }
          const clave = `${modelo}|${per || 'A'}`;
          r.datos[clave] = { ...(r.datos[clave] ?? {}), ...val };
          const err = await guardarRegistro(r.ex, { ...(r.ex ? {} : { id: r.id }), empresa_id: e.id, tipo: 'prs', ejercicio: ej, datos: r.datos });
          if (err) throw new Error(err);
          r.ex ??= { id: r.id };
          destino = { sel: e.id, ej: modelo === '583' && per === '0A' ? ej + 1 : ej };
          aviso = ` · ${Object.entries(val).map(([c, v]) => `${c} ${fnum(v)}`).join(', ')}`;
        } else aviso = ' · sin casillas reconocidas (rellénalas a mano)';
        if (S.registros.some((r) => r.tipo === 'prspdf' && r.empresa_id === e.id && r.datos.ref === ref)) { informe.push(`↻ ${e.siglas || e.nombre}: ${f.name} → ${modelo || '?'} · ${ej} · ${per || '—'} (PDF ya guardado, importes actualizados)${aviso}`); continue; }
        const id = crypto.randomUUID();
        const sub = await subir(e.id, 'prspdf', id, 'archivo', f);
        if (sub.error) throw new Error(sub.error);
        const err = await guardarRegistro(null, { id, empresa_id: e.id, tipo: 'prspdf', ejercicio: ej, datos: { nombre: f.name, ref, modelo, periodo: per, archivo: sub.val } });
        if (err) throw new Error(err);
        informe.push(`✔ ${e.siglas || e.nombre}: ${f.name} → modelo ${modelo || '?'} · ${ej} · ${per || '—'}${aviso}`);
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    await cargar();
    if (destino) { S.sel = destino.sel; S.ejercicio = destino.ej; } // se muestra la empresa y el ejercicio donde han quedado los importes
    render();
    alert(informe.join('\n'));
  }
  const listaPrsPdf = () => {
    const l = S.registros.filter((r) => r.tipo === 'prspdf' && r.empresa_id === S.sel).sort((a, b) => b.ejercicio - a.ejercicio || String(a.datos.modelo).localeCompare(b.datos.modelo));
    return l.length ? `<details class="prs-card prs-pdf"><summary class="prs-h">PDF incorporados (${l.length}) · pulsa para ver la lista</summary><div class="wrap"><table class="tprs" style="width:100%"><thead><tr><th class="pp">Modelo</th><th>Ejercicio</th><th>Periodo</th><th>Archivo</th><th></th></tr></thead><tbody>
      ${l.map((r) => `<tr><td class="pp">${esc(r.datos.modelo || '?')}</td><td class="num">${r.ejercicio}</td><td class="num">${esc(r.datos.periodo || '—')}</td><td>${verArchivo(r.datos.archivo)}</td>
        <td class="num">${puede() ? `<button class="small danger" data-act="m-del" data-id="${r.id}">Quitar</button>` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  };

  async function subirArchivos(files) {
    if (archKind === 'prspdf') return cargarPresentados(files);
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
        informe.push(['emitidas', 'recibidas', 'sii'].includes(archKind) ? await ingestaIVA(f, S.sel) : `✔ ${f.name}`);
      } catch (err) { informe.push(`✖ ${f.name}: ${err.message}`); }
    }
    await cargar(); render();
    alert(`${ARCH[archKind]}: ${informe.length} archivos\n${informe.join('\n')}\n\nSe guardan en la empresa y el ejercicio elegidos.`);
  }

  // ---------- Carga de PDF (AEAT y tributos locales) ----------
  async function leerPdf(file) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js).');
    lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out = [], pags = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const its = tc.items.map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }));
      pags.push(its);
      out.push(`--- página ${p} ---`, ...lineasPagina(its));
    }
    return { texto: out.join('\n'), pags };
  }
  const textoPdf = async (file) => (await leerPdf(file)).texto;

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
          F_.tocado = true; F_.aeat.situacion = r; F_.aeat.situacionFull = leerSituacionCompleta(t); informe.push(`✔ ${nom}: situación tributaria`);
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
      'm-man303': () => formMan303(),
      'm-fc': () => opFc(d.s, d.op, d.k),
      'm-manret': () => formManRet(d.m),
      'm-retprint': () => imprimirRet(d.m),
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
  // Insignias del bloque 6: usan los datos si ya se han leído; si no, los piden en segundo plano
  const nFilas = (tipo) => { const d = S.sel ? peek(tipo) : null; return d ? d.length : null; };
  [['siie', 'sii-E', 'facturas'], ['siir', 'sii-R', 'facturas'], ['fe', 'fact-E', 'líneas'], ['fr', 'fact-R', 'líneas']].forEach(([id, tipo, u]) => {
    badges[id] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const n = nFilas(tipo);
      return n === null ? { t: '…' } : n ? { t: `${n} ${u}`, c: 'verde' } : { t: 'Sin datos' };
    };
  });
  [['concsiie', 'E'], ['concsiir', 'R']].forEach(([id, s]) => {
    badges[id] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const lib = peek('fact-' + s), sii = peek('sii-' + s);
      if (!lib || !sii) return { t: '…' };
      if (!lib.length || !sii.length) return { t: 'Sin datos' };
      return conciliarSII(s, lib, sii, Number(S.ejercicio), S.periodo).cuadra ? { t: 'Cuadra', c: 'verde' } : { t: 'Descuadre', c: 'rojo' };
    };
  });
  // Insignias del panel «Modelos tributarios»: rojo = a ingresar, verde = a compensar/devolver, amarillo = resumen anual, gris = sin importe o sin datos
  const imp = (v) => (Math.abs(v) < 0.005 ? { t: 'Sin importe' } : v > 0 ? { t: `A ingresar ${fnum(v)}`, c: 'rojo' } : { t: `A compensar ${fnum(-v)}`, c: 'verde' });
  const libros = () => { const E = peek('fact-E'), R = peek('fact-R'); return E && R ? { E, R } : null; };
  badges.mod303 = () => {
    if (!S.sel) return { t: 'Por empresa' };
    if (!S.periodo) return { t: 'Elige periodo' };
    const l = libros();
    if (!l) return { t: '…' };
    if (!l.E.length && !l.R.length) return { t: 'Sin datos' };
    return imp(calcular303(l.E, l.R, Number(S.ejercicio), S.periodo, manuales(), { rectif: rectif303 }).c71);
  };
  ['111', '115', '123'].forEach((m) => {
    badges['mod' + m] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      if (!S.periodo) return { t: 'Elige periodo' };
      const l = libros();
      if (!l) return { t: '…' };
      if (!l.R.length) return { t: 'Sin datos' };
      const man = manPer('m' + m);
      return imp(calcularRet(m, l.R, Number(S.ejercicio), S.periodo).ret + (m === '111' ? Number(man.t3) || 0 : 0) - (Number(man.c29 ?? man.c4) || 0));
    };
  });
  [['mod180', '115'], ['mod190', '111'], ['mod193', '123']].forEach(([id, m]) => {
    badges[id] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const l = libros();
      if (!l) return { t: '…' };
      return l.R.length ? { t: fnum(calcularRet(m, l.R, Number(S.ejercicio), '').ret), c: 'amar' } : { t: 'Sin datos' };
    };
  });
  badges.mod390 = () => {
    if (!S.sel) return { t: 'Por empresa' };
    const l = libros();
    if (!l) return { t: '…' };
    if (!l.E.length && !l.R.length) return { t: 'Sin datos' };
    const ps = empresa()?.tipo === 'GE' ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')) : ['1T', '2T', '3T', '4T'];
    const man = regMan()?.datos ?? {};
    return { t: fnum(ps.reduce((a, p) => a + calcular303(l.E, l.R, Number(S.ejercicio), p, man[p] ?? {}, { rectif: rectif303 }).c71, 0)), c: 'amar' };
  };
  ['111', '115', '123'].forEach((m) => {
    badges['r' + m] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const R = peek('fact-R');
      if (!R) return { t: '…' };
      const per0 = S.periodo || '01', per = perEf(empresa(), per0);
      const lis = lineasListado(m, R, Number(S.ejercicio), per).filter((x) => x.k[0] !== '-');
      const tot = lis.reduce((a, x) => a + x.re, 0) + (m === '111' ? (nomPer(Number(S.ejercicio), per)?.r ?? (Number(nominasMan(per0, per).t3) || 0)) : 0);
      return lis.length || tot ? { t: fnum(tot), c: 'amar' } : { t: 'Sin líneas' };
    };
  });
  badges.pres = () => {
    if (!S.sel) return { t: 'Por empresa' };
    const n = prsRegs().filter((r) => r.ejercicio === Number(S.ejercicio)).reduce((a, r) => a + Object.keys(r.datos).length, 0);
    return n ? { t: `${n} declaraciones`, c: 'verde' } : { t: 'Sin datos' };
  };
  badges.mod349 = () => {
    if (!S.sel) return { t: 'Por empresa' };
    const l = libros();
    if (!l) return { t: '…' };
    if (!l.E.length && !l.R.length) return { t: 'Sin datos' };
    const c = calcular349(l.E, l.R, Number(S.ejercicio), S.periodo);
    return c.detalle.length ? { t: fnum(c.total), c: 'amar' } : { t: 'Sin importe' };
  };
  ['mod200', 'mod202', 'mod583', 'mod592', 'moda22', 'mod232', 'modintra'].forEach((id) => { badges[id] = () => ({ t: 'Sin datos' }); });
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

  const subirComo = (kind, files) => { archKind = kind; return subirArchivos(files); };

  return { guardarRetClave, guardarNom, guardarPrs, setPrsVer, tabs, accion, cargarPdfs, badges, subirArchivos, subirComo, cargado, titulo, listaArchivos, buscarFc, setFc, guardarMan303, guardarIban, setRectif };
}
