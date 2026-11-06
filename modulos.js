// Bloques 1 y 2 (información tributaria y registral), todo declarativo.
// Tres tipos de pestaña: lista de registros (tabla `registros`), ficha (`empresas.datos`)
// y documental (huecos con fecha, referencia y archivo en Storage, bucket `documentos`).
import { clasificar, nifDe, lineasPagina, leerCenso, leerActividades, leerObligaciones, leerSituacion,
  leerRepresentantes, leerParticipes, leerLocal, leerXlsx, leerSYS, resumenSYS, leerSituacionCompleta, leerLibroIVA, leerLibroBC, leerMayor, fundaeFilas, leerSII, conciliarSII, conciliarSiiCompleta, rangoPeriodo, MARGEN_SII, calcular303, calcularRet, calcular349, casillasPDF, cabeceraPresentado, valoresPresentado } from './lectores.js?v=41';

import { CAB_SII } from './siicab.js?v=1';
import { crearRegistral } from './registral.js?v=1';

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
  // Estado fiscal de todas las empresas: cada modelo en el mes del periodo que liquida (grandes: mensual; pymes: trimestral, en el último mes del trimestre)
  let cmgMod = '';
  const COLOR_EMP = { HER: '#1f3864', ESP: '#9b1c2c', HIS: '#0b7f8f', LYS: '#001433', GRU: '#bf4123', FER: '#1b4d2e', BSR: '#570000', FCH: '#17234e', FTC: '#432158', PDF: '#b5418e', TCP: '#5b2c83', PAS: '#911844', MOT: '#c0392b', MAX: '#008215' };
  const FONDO_EMP = ['#e8eef8', '#fbe7ea', '#e0f4f6', '#e3e8f2', '#fdece6', '#e6f2ea', '#f6e3e3', '#e6e9f5', '#efe7f5', '#fae8f3', '#efe9f8', '#f8e6ec', '#fcebe8', '#e3f5e6'];
  const CMG_ST = { ok: ['#1a7f37', '#e6f4ea', '✓', 'presentado'], venc: ['#b42318', '#fde8e8', '✖', 'vencido sin presentar'], pron: ['#8a6d00', '#fff8d6', '●', 'vence en 7 días o menos'], fut: ['#667085', '#f2f4f7', '○', 'en plazo'] };
  // ---- Qué modelos le tocan a cada empresa y cómo van: lo usan el cuadro de mando, las liquidaciones a presentar, los pagos domiciliados e Inicio ----
  // 111, 303, 200 y 390: obligatorios · 115: solo si está de ALTA en el censo · 123, 202, 349, Intrastat, 232 y A22: si tiene datos ·
  // 592: HER, ESP y LYS · 583: HER, LYS, GRU (Gesufer) e HIS · 180, 190 y 193: con datos del ejercicio
  const SIG_592 = ['HER', 'ESP', 'LYS'], SIG_583 = ['HER', 'LYS', 'GRU', 'HIS'];
  // por sigla o, si no coincide, por el nombre de la empresa
  const RX_592 = /herogra\s+fertiliz|herogra\s+especiales|lys\s+del\s+sur|lysur/i, RX_583 = /herogra\s+fertiliz|lys\s+del\s+sur|lysur|gesti[oó]n\s+unificada|gesufer|hispalense/i;
  const obl592 = (e) => SIG_592.includes(String(e.siglas ?? '').toUpperCase()) || RX_592.test(e.nombre ?? '');
  const obl583 = (e) => SIG_583.includes(String(e.siglas ?? '').toUpperCase()) || RX_583.test(e.nombre ?? '');
  const MODS_PAGO = ['303', '111', '115', '123', '202', '200', '592', '583'];
  const hoyUtc = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const habilF = (y, m, d) => { let t = Date.UTC(y, m - 1, d); while (!esHabil(t)) t += 864e5; return t; };
  // fin de plazo de presentación según la regla general del calendario de la AEAT
  const plazoMod = (mod, y, per) => {
    if (['180', '190', '193'].includes(mod)) return habilF(y + 1, 1, 31);
    if (mod === '390') return habilF(y + 1, 1, 30);
    if (mod === '200') return habilF(y + 1, 7, 25);
    if (mod === '202') return per === '1P' ? habilF(y, 4, 20) : per === '2P' ? habilF(y, 10, 20) : habilF(y, 12, 20);
    if (mod === '232') return habilF(y + 1, 11, 30);
    if (mod === '583') return per === '0A' ? habilF(y + 1, 11, 30) : habilF(y, 11, 20);
    if (mod === 'Intrastat') { const m = +per; return m === 12 ? habilF(y + 1, 1, 12) : habilF(y, m + 1, 12); }
    if (mod === '349') { const q = /^[1-4]T$/.test(per), m = q ? +per[0] * 3 : +per; if (m === 12) return habilF(y + 1, 1, 30); return !q && m === 7 ? habilF(y, 9, 20) : habilF(y, m + 1, 20); }
    const iva = mod === '303';
    if (/^[1-4]T$/.test(per)) { const q = +per[0]; return q === 4 ? habilF(y + 1, 1, iva ? 30 : 20) : habilF(y, q * 3 + 1, 20); }
    const m = +per;
    return m === 12 ? habilF(y + 1, 1, iva ? 30 : 20) : habilF(y, m + 1, iva ? Math.min(30, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) : 20);
  };
  const colMes = (per) => (per === '0A' || per === 'A' ? 12 : /^\d\d$/.test(per) ? +per - 1 : /^[1-4]T$/.test(per) ? +per[0] * 3 - 1 : ({ 1: 2, 2: 8, 3: 10 })[per[0]] ?? 12);
  // ¿el periodo de la obligación (mes, trimestre, pago fraccionado) cae dentro del periodo p elegido?
  const enPeriodo = (o, p) => {
    if (!p) return true;
    if (o.per === p) return true;
    const mesesDe = (q) => (/^\d\d$/.test(q) ? [+q] : /^[1-4]T$/.test(q) ? [0, 1, 2].map((i) => (+q[0] - 1) * 3 + i + 1) : []);
    const a = mesesDe(o.per), b = mesesDe(p);
    return a.length && b.length ? a.some((m) => b.includes(m)) : false;
  };
  function presIndex() {
    const hecho = new Set(), usado = new Set(), marcas = new Set();
    const marca = (id, y, m, p) => { hecho.add(`${id}|${y}|${m}|${p}`); usado.add(`${id}|${y}|${m}`); };
    S.registros.forEach((r) => {
      if (r.tipo === 'prs') Object.entries(r.datos ?? {}).forEach(([k, v]) => { const [m, p] = k.split('|'); if (v && Object.keys(v).length) marca(r.empresa_id, r.ejercicio, m, p); });
      else if (r.tipo === 'pres' || (r.tipo === 'liq' && r.datos?.estado === 'Presentado')) { const m = r.datos?.modelo; if (m) marca(r.empresa_id, r.ejercicio, m, r.datos.periodo); }
      else if (r.tipo === 'liqpres') (r.datos?.marcas ?? []).forEach((k) => { hecho.add(`${r.empresa_id}|${k}`); marcas.add(`${r.empresa_id}|${k}`); });
    });
    return { hecho, usado, marcas };
  }
  const valPres = (id, y, m, p) => {
    const d = S.registros.find((r) => r.tipo === 'prs' && r.empresa_id === id && r.ejercicio === y)?.datos?.[`${m}|${p}`];
    if (!d) return null;
    const n = (k) => (d[k] === undefined || d[k] === '' ? null : Number(d[k]));
    if (m === '303') return n('liq') ?? n('res');
    if (m === '111') return n('retN') === null && n('retP') === null ? null : (n('retN') || 0) + (n('retP') || 0);
    if (m === '115' || m === '123') return n('ret');
    if (m === '349') return n('imp');
    return n('res') ?? n('imp');
  };
  // 115: solo si el censo lo tiene de ALTA en el periodo (si está de baja o no aparece, no se pone)
  function alta115(e, ej, per) {
    const os = (e?.datos?.aeat?.obligaciones ?? []).filter((o) => /ARREND/i.test(o.descripcion ?? ''));
    if (!os.length || !per) return false;
    const mm = /^\d\d$/.test(per) ? [per, per] : /^[1-4]T$/.test(per) ? [String((+per[0] - 1) * 3 + 1).padStart(2, '0'), String(+per[0] * 3).padStart(2, '0')] : ['01', '12'];
    const ini = `${ej}-${mm[0]}-01`, fin = `${ej}-${mm[1]}-31`;
    return os.some((o) => (o.alta || '0000-00-00') <= fin && (o.estado === 'ALTA' || (o.baja && o.baja >= ini)));
  }
  function obligaciones(e, ej, ix) {
    const sig = String(e.siglas ?? '').toUpperCase(), trim = e.tipo === 'PYME', pers = trim ? ['1T', '2T', '3T', '4T'] : MM12, out = [];
    const uso = (m) => [ej - 1, ej, ej + 1].some((y) => ix.usado.has(`${e.id}|${y}|${m}`));
    const ANUAL = /^(200|232|180|190|193|390)$/;
    const add = (mod, per, yP, yPres, clave) => {
      const pk = ANUAL.test(mod) ? 'A' : per;
      out.push({ e, mod, per, yP, yPres, clave, pk, fin: plazoMod(mod, yP, per), pres: ix.hecho.has(`${e.id}|${yPres}|${clave}|${pk}`), imp: valPres(e.id, yPres, clave, pk) });
    };
    pers.forEach((p) => { add('303', p, ej, ej, '303'); add('111', p, ej, ej, '111'); if (alta115(e, ej, p)) add('115', p, ej, ej, '115'); });
    if (uso('123')) pers.forEach((p) => add('123', p, ej, ej, '123'));
    if (uso('349')) pers.forEach((p) => add('349', p, ej, ej, '349'));
    if (obl592(e)) pers.forEach((p) => add('592', p, ej, ej, '592'));
    if (!trim || uso('202')) ['1P', '2P', '3P'].forEach((p) => add('202', p, ej, ej, '202'));
    if (obl583(e)) { add('583', '3T', ej, ej, '583'); add('583', '0A', ej - 1, ej - 1, '583'); }
    if (uso('INT')) MM12.forEach((p) => add('Intrastat', p, ej, ej, 'INT'));
    if (uso('A22')) ['1T', '2T', '3T', '4T'].forEach((p) => add('A22', p, ej, ej, 'A22'));
    if (uso('232')) add('232', 'A', ej - 1, ej, '232');
    add('390', 'A', ej, ej, '390'); add('200', 'A', ej, ej + 1, '200'); add('190', 'A', ej, ej, '190');
    if (uso('180') || out.some((o) => o.mod === '115')) add('180', 'A', ej, ej, '180');
    if (uso('193') || uso('123')) add('193', 'A', ej, ej, '193');
    return out;
  }
  const estadoOb = (o, hoy) => { if (o.pres) return 'ok'; const d = Math.round((o.fin - hoy) / 864e5); return d < 0 ? 'venc' : d <= 7 ? 'pron' : 'fut'; };
  const empOrden = () => [...S.empresas].sort((a, b) => (c.idxEmp(a) < 0 ? 99 : c.idxEmp(a)) - (c.idxEmp(b) < 0 ? 99 : c.idxEmp(b)));
  const perTxt = (o) => (o.per === 'A' ? `Anual ${o.yP}` : o.per === '0A' ? `Anual ${o.yP}` : `${o.per}/${o.yP}`);
  const chipEst = (st, fin) => { const [fg, bg, ic, tx] = CMG_ST[st]; return `<span class="cmg-chip" title="${esc(`${tx} · fin ${fechaTxt(fin)}`)}" style="color:${fg};background:${bg};border-color:${fg}55">${ic} ${esc(tx)}</span>`; };

  function vistaCmg() {
    if (!S.empresas.length) return '<p class="vacio">Sin empresas.</p>';
    const ej = Number(S.ejercicio), hoy = hoyUtc(), ix = presIndex();
    const G = [], tot = { ok: 0, venc: 0, pron: 0, fut: 0 }, mods = new Set();
    empOrden().forEach((e, i) => {
      const g = { e, i, cel: Array.from({ length: 13 }, () => []), n: { venc: 0, pron: 0 } };
      obligaciones(e, ej, ix).forEach((o) => {
        mods.add(o.mod);
        if (cmgMod && cmgMod !== o.mod) return;
        const st = estadoOb(o, hoy);
        tot[st]++; if (g.n[st] !== undefined) g.n[st]++;
        g.cel[o.mod === '583' ? 9 : o.mod === '200' ? 5 : colMes(o.per)].push({ mod: o.mod, st, per: o.per, fin: o.fin });
      });
      G.push(g);
    });
    const chip = (x) => { const [fg, bg, ic, tx] = CMG_ST[x.st];
      return `<span class="cmg-chip" title="${esc(`${x.mod === 'Intrastat' ? 'Intrastat' : 'Modelo ' + x.mod} · ${x.per} · ${tx} · fin ${fechaTxt(x.fin)}`)}" style="color:${fg};background:${bg};border-color:${fg}55">${ic} ${x.mod === 'Intrastat' ? 'INT' : esc(x.mod)}</span>`; };
    const MS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Anual'];
    const filas = G.map((g) => { const bar = COLOR_EMP[String(g.e.siglas ?? '').toUpperCase()] ?? '#1f3864', fondo = FONDO_EMP[g.i % FONDO_EMP.length];
      return `<tr style="background:${fondo}"><td class="cmg-e" style="border-left:6px solid ${bar}"><b>${esc(g.e.nombre)}</b><div class="cmg-s">${g.n.venc ? `<b style="color:#b42318">${g.n.venc} vencido(s)</b> ` : ''}${g.n.pron ? `<b style="color:#8a6d00">${g.n.pron} próximos</b>` : ''}${!g.n.venc && !g.n.pron ? '✓ al día' : ''}</div></td>
        ${g.cel.map((cs) => `<td>${cs.map(chip).join('')}</td>`).join('')}</tr>`; }).join('');
    return `<div class="inicio"><section class="dsec"><h3>Cuadro de mando del grupo · ${ej} · <select data-cmgmod="1"><option value="">Todos los modelos</option>${[...mods].sort().map((m) => `<option${m === cmgMod ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></h3>
      <p class="dash-s" style="font-size:.7rem"><span style="color:#1a7f37">✓ ${tot.ok} presentados</span> · <span style="color:#b42318">✖ ${tot.venc} vencidos sin presentar</span> · <span style="color:#8a6d00">● ${tot.pron} vencen en 7 días</span> · <span style="color:#667085">○ ${tot.fut} en plazo</span></p>
      <div class="wrap"><table class="tabla cmg-t"><thead><tr><th>Empresa</th>${MS.map((m) => `<th>${m}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div></section>
      <p class="hint">Estado fiscal de todas las empresas en ${ej}: cada modelo en el mes del periodo que liquida (en las pymes, trimestrales en el último mes del trimestre; el 202 en marzo, septiembre y noviembre; los anuales en la columna Anual). Solo salen los modelos que le tocan a cada empresa: 111, 303, 200 y 390 siempre (y el 202 en las grandes); el 115 si está de alta en el censo; el 123, 349, Intrastat, 232 y A22 si hay datos (y el 202 en las pymes); el 592 en HER, ESP y LYS; el 583 en HER, LYS, GRU e HIS; el 180, 190 y 193 con datos del ejercicio. Presentado = está en «Impuestos Presentados» o marcado en «Liquidaciones Presentar». Los plazos son los de la regla general de la AEAT.</p></div>`;
  }

  // Liquidaciones a presentar y pagos domiciliados: las mismas obligaciones, todas las empresas
  let liqVer = 'pend';
  const filtroLista = (L, hoy) => L.filter((o) => (liqVer === 'todas' || !o.pres) && (S.periodo ? enPeriodo(o, S.periodo) : o.fin <= hoy + 45 * 864e5));
  async function toggleMarca(eid, k) {
    const reg = S.registros.find((r) => r.tipo === 'liqpres' && r.empresa_id === eid), set = new Set(reg?.datos?.marcas ?? []);
    if (set.has(k)) set.delete(k); else set.add(k);
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: eid, tipo: 'liqpres', ejercicio: null, datos: { marcas: [...set] } });
    if (err) return void alert(err);
    await cargar(); render();
  }
  function tablaOb(titulo, pago) {
    const ej = Number(S.ejercicio), hoy = hoyUtc(), ix = presIndex(), ed = puede();
    let L = empOrden().flatMap((e) => obligaciones(e, ej, ix));
    if (pago) L = L.filter((o) => MODS_PAGO.includes(o.mod));
    L = filtroLista(L, hoy).sort((a, b) => a.fin - b.fin || String(a.e.nombre).localeCompare(String(b.e.nombre)) || a.mod.localeCompare(b.mod));
    const dom = (o) => { let t = o.fin - 5 * 864e5; while (!esHabil(t)) t -= 864e5; return t; };
    const fila = (o) => { const k = `${o.yPres}|${o.clave}|${o.pk}`, manual = ix.marcas.has(`${o.e.id}|${k}`);
      return `<tr class="${o.pres ? 'fila-ok' : estadoOb(o, hoy) === 'venc' ? 'fila-pend' : ''}"><td>${esc(o.e.nombre)}</td><td class="c">${/^\d+$/.test(o.mod) ? 'Modelo ' + esc(o.mod) : esc(o.mod)}</td><td class="c">${esc(perTxt(o))}</td>
        <td class="c">${fechaTxt(pago ? dom(o) : o.fin)}</td>${pago ? `<td>${esc(o.e.datos?.banco ?? '')}</td>` : ''}<td class="num">${o.imp === null ? '—' : fnum(o.imp)}</td><td class="c">${chipEst(estadoOb(o, hoy), o.fin)}</td>
        <td class="c">${ed ? (o.pres && !manual ? '' : `<button class="small" data-act="m-liqmarca" data-e="${o.e.id}" data-k="${esc(k)}">${manual ? 'Quitar marca' : 'Marcar presentado'}</button>`) : ''}</td></tr>`; };
    return `<div class="bar"><span class="chip">${S.periodo ? esc(PERIODOS[S.periodo] ?? S.periodo) : 'Vencidos y próximos 45 días'} · ${ej}</span>
        <label>Ver <select data-liqver="1"><option value="pend"${liqVer === 'pend' ? ' selected' : ''}>Pendientes</option><option value="todas"${liqVer === 'todas' ? ' selected' : ''}>Todas</option></select></label><span class="space"></span></div>
      ${L.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>Modelo</th><th>Periodo</th><th>${pago ? 'Fecha de cargo' : 'Vencimiento'}</th>${pago ? '<th>Banco</th>' : ''}<th class="num">Importe</th><th>Estado</th><th></th></tr></thead><tbody>${L.map(fila).join('')}</tbody></table></div>`
        : `<p class="vacio">${esc(titulo)}: nada pendiente en este periodo.</p>`}
      <p class="hint">${pago ? 'Fecha de cargo: cinco días antes del fin de plazo (día hábil). ' : ''}Solo salen los modelos que le tocan a cada empresa: 111, 303, 200 y 390 siempre (y el 202 en las grandes); el 115 si está de alta en el censo; el 123, 349, Intrastat, 232 y A22 si hay datos (y el 202 en las pymes); el 592 en HER, ESP y LYS; el 583 en HER, LYS, GRU e HIS; el 180, 190 y 193 con datos del ejercicio. El importe es el presentado. Elige un periodo en la barra lateral para ver solo ese.</p>`;
  }
  const vistaLiq = () => tablaOb('Liquidaciones a presentar', false);
  const vistaVenc = () => tablaOb('Pagos domiciliados', true);
  const setLiqVer = (v) => { liqVer = v; render(); };
  const setCmgMod = (v) => { cmgMod = v; render(); };

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
    siie: ['SII-LRFE', 'SII emitidas', () => vistaSII('E')],
    siir: ['SII-LRFR', 'SII recibidas', () => vistaSII('R')],
    concsiie: ['ConcSII-E', 'SII vs contabilidad', () => vistaConcSII('E')],
    concsiir: ['ConsSII-R', 'SII vs contabilidad', () => vistaConcSII('R')],
    fe: ['Emitidas', 'Facturas emitidas', () => dz('emitidas', 'Suelta aquí el libro de IVA repercutido', '(Excel del ERP) o haz clic para elegirlo') + vistaFacturas('E')],
    fr: ['Recibidas', 'Facturas recibidas', () => dz('recibidas', 'Suelta aquí el libro de IVA soportado', '(Excel del ERP) o haz clic para elegirlo') + vistaFacturas('R')],
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
  function parseCsv(txt) {
    const l1 = txt.slice(0, txt.indexOf('\n') < 0 ? txt.length : txt.indexOf('\n'));
    const d = [';', '\t', ','].map((c) => [c, l1.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let r = [], c = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === d) { r.push(c); c = ''; }
      else if (ch === '\n') { r.push(c.replace(/\r$/, '')); rows.push(r); r = []; c = ''; }
      else c += ch;
    }
    if (c || r.length) { r.push(c.replace(/\r$/, '')); rows.push(r); }
    return rows;
  }  // Excel moderno (.xlsx) con el lector propio; los .xls antiguos (FUNDAE, algunos extractos) con SheetJS
  async function filasExcel(f) {
    const buf = await f.arrayBuffer(), u = new Uint8Array(buf, 0, 4);
    if (/\.(csv|txt)$/i.test(f.name)) { // descargas de la sede (CSV con ; y acentos de Windows)
      const bytes = new Uint8Array(buf); let txt = new TextDecoder('utf-8').decode(bytes);
      if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(bytes);
      return parseCsv(txt.replace(/^\uFEFF/, ''));
    }
    if (u[0] === 0xD0 && u[1] === 0xCF && window.XLSX) {
      const wb = window.XLSX.read(buf);
      return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
    }
    return leerXlsx(buf, window.JSZip);
  }
  // Libro de IVA del ERP o consulta del SII: se reconoce por las cabeceras
  async function ingestaIVA(f, empresaId) {
    const filas = await filasExcel(f);
    const sii = leerSII(filas);
    if (sii) {
      const s = sii[0].sentido;
      const kf = (x) => `${x.factura}|${x.nif}|${x.ej}|${x.per}`, porPer = new Map();
      // todas las columnas de la descarga, por periodo (la pantalla pide solo los meses que enseña)
      sii.forEach((x) => { const p = `${x.ej}-${x.per}`; (porPer.get(p) ?? porPer.set(p, []).get(p)).push({ k: kf(x), raw: x.raw }); });
      for (const [p, rows] of porPer) await guardarGrande(`sii-raw-${s}-${p}`, empresaId, rows, (q) => q.k);
      await reemplazarGrande(`sii-cab-${s}`, empresaId, sii.cab);
      const n = await guardarGrande('sii-' + s, empresaId, sii.map(({ raw, ...x }) => ({ ...x, src: f.name })), kf);
      return `✔ ${f.name}: SII ${s === 'E' ? 'emitidas' : 'recibidas'} · ${sii.length} facturas leídas (${n} en total)`;
    }
    const bc = leerLibroBC(filas); // Business Central (Fertinova): un solo libro con ventas y compras
    const lib = bc ?? leerLibroIVA(filas);
    if (lib) {
      const partes = [];
      for (const s of ['E', 'R']) {
        const x = lib.filter((l) => l.sentido === s).map((l) => ({ ...l, src: f.name }));
        if (x.length) { await guardarGrande('fact-' + s, empresaId, x, (l) => [l.factura, l.nif, l.ff, l.base, l.cuota, l.codigo, l.asiento].join('|')); partes.push(`${x.length} ${s === 'E' ? 'repercutidas' : 'soportadas'}`); }
      }
      return `✔ ${f.name}: libro de IVA${bc ? ' (Business Central)' : ''} · ${partes.join(' y ')}`;
    }
    return `❔ ${f.name}: guardado, pero no reconozco el formato (libro de IVA del ERP o consulta del SII)`;
  }

  const SENT = { E: { lib: 'repercutido', cuota: 'Cuota repercutida', nif: 'NIF destinatario', boton: 'EMITIDAS' }, R: { lib: 'soportado', cuota: 'Cuota soportada', nif: 'NIF emisor', boton: 'RECIBIDAS' } };
  const cargandoTxt = '<p class="vacio">Cargando datos…</p>';
  // Franja punteada para soltar un Excel (kind = botón del lateral al que equivale: sii, emitidas, recibidas)
  const dz = (kind, titulo, sub, acc = '.xlsx,.xls,.csv') => `<div class="dropzone" data-kind="${kind}" tabindex="0" role="button"><b>${titulo}</b> ${sub}
    <input type="file" data-dzkind="${kind}" accept="${acc}" multiple hidden></div>${listaArch(kind)}`;
  // archivos dejados en cada pestaña, con la opción de quitarlos (y los datos que aportaron)
  function listaArch(kind) {
    if (!S.sel || !ARCH[kind]) return '';
    const l = S.registros.filter((r) => r.tipo === `arch-${kind}` && r.empresa_id === S.sel).sort((a, b) => String(b.datos.subido).localeCompare(String(a.datos.subido)));
    if (!l.length) return '';
    return `<details class="arch-det"><summary>Archivos dejados aquí (${l.length})</summary><table class="tprs tnom" style="width:auto"><tbody>${l.map((r) => `<tr><td>${esc(r.datos.nombre)}</td><td>${esc(r.datos.subido ?? '')}</td>
      <td>${verArchivo(r.datos.archivo)}</td><td>${puede() ? `<button class="small danger" data-act="m-archdel" data-id="${r.id}" title="Quitar el archivo y los datos que aportó">✖ Quitar</button>` : ''}</td></tr>`).join('')}</tbody></table></details>`;
  }
  async function quitarDatosArchivo(tipo, nombre, empresaId) {
    const { data } = await db.from('registros').select('id,datos').eq('empresa_id', empresaId).eq('tipo', tipo).maybeSingle();
    const filas = data?.datos?.filas ?? [], quitadas = filas.filter((x) => x.src === nombre);
    if (quitadas.length) await reemplazarGrande(tipo, empresaId, filas.filter((x) => x.src !== nombre), data);
    return quitadas;
  }
  async function quitarArch(id) {
    const r = S.registros.find((x) => x.id === id);
    if (!r || !confirm(`¿Quitar «${r.datos.nombre}» y los datos que aportó a la empresa?`)) return;
    const kind = r.tipo.slice(5), nombre = r.datos.nombre, emp = r.empresa_id;
    try {
      let n = 0;
      if (kind === 'emitidas' || kind === 'recibidas') for (const t of ['fact-E', 'fact-R']) n += (await quitarDatosArchivo(t, nombre, emp)).length;
      else if (kind === 'extractos') n += (await quitarDatosArchivo('may-mov', nombre, emp)).length;
      else if (kind === 'sii') {
        for (const s of ['E', 'R']) {
          const q = await quitarDatosArchivo(`sii-${s}`, nombre, emp); n += q.length;
          const porPer = new Map();
          q.forEach((x) => { const p = `${x.ej}-${x.per}`; (porPer.get(p) ?? porPer.set(p, new Set()).get(p)).add(`${x.factura}|${x.nif}|${x.ej}|${x.per}`); });
          for (const [p, ks] of porPer) {
            const { data } = await db.from('registros').select('id,datos').eq('empresa_id', emp).eq('tipo', `sii-raw-${s}-${p}`).maybeSingle();
            if (data) await reemplazarGrande(`sii-raw-${s}-${p}`, emp, (data.datos?.filas ?? []).filter((x) => !ks.has(x.k)), data);
          }
        }
      }
      const { error } = await db.from('registros').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await cargar(); render();
      if (!n && ['emitidas', 'recibidas', 'extractos', 'sii'].includes(kind)) alert('Archivo quitado. Los datos de este archivo se cargaron antes de que la app guardara su origen y no se pueden separar: si hay que borrarlos, quítalos a mano.');
    } catch (err) { alert(`No se pudo quitar: ${err.message}`); }
  }
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
    if (fcQ) { const q = sinAc(fcQ); f = f.filter((l) => sinAc(`${l.nif} ${l.nombre} ${l.factura}`).includes(q) || buscaImporte(l, fcQ)); }
    return f;
  }
  // Si lo escrito es un importe, casa con la base o la cuota (exacto) o con parte del importe (3 cifras o más)
  function buscaImporte(l, q) {
    q = String(q ?? '').trim();
    if (!/^[-+]?[\d.,\s€]+$/.test(q) || !/\d/.test(q)) return false;
    const vs = [l.base, l.cuota].filter((v) => Number.isFinite(v)), n = parseES(q.replace(/[€\s]/g, ''));
    if (n && vs.some((v) => Math.abs(Math.abs(v) - Math.abs(n)) < 0.006)) return true;
    const t = q.replace(/[€\s]/g, '').replace(/^[-+]/, '');
    return t.length >= 3 && vs.some((v) => fnum(Math.abs(v)).includes(t) || String(Math.abs(rr(v))).includes(t));
  }

  // Factura a mano: una línea más del libro (se guarda en el propio libro de la empresa, marcada «a mano»)
  let fcNueva = null;
  function fcNvAbrir(s) {
    const r = rangoPeriodo(Number(S.ejercicio), S.periodo);
    fcNueva = { s, fecha: r.desde.split('-').reverse().join('/'), factura: '', nif: '', nombre: '', codigo: '', base: '', pct: '21', cuota: '' };
    render();
  }
  async function fcNvOk() {
    const N = fcNueva;
    if (!N) return;
    const f = fIsoCta(N.fecha), base = parseES(N.base), pct = parseES(N.pct);
    if (!f) return void alert('Escribe una fecha válida (dd/mm/aaaa).');
    if (!N.factura.trim()) return void alert('Falta el nº de factura.');
    if (!N.codigo.trim()) return void alert('Falta el código de impuesto (el mismo que usa el libro, p. ej. el de otras líneas del libro).');
    if (!base) return void alert('Falta la base.');
    const cuota = N.cuota.trim() === '' ? rr((base * pct) / 100) : parseES(N.cuota);
    const tipo = `fact-${N.s}`, arr = GR.get(`${tipo}|${S.sel}`) ?? [];
    await reemplazarGrande(tipo, S.sel, [...arr, { asiento: '', factura: N.factura.trim(), fecha: f, ff: f, nif: N.nif.trim().toUpperCase(), nombre: N.nombre.trim(),
      base, pct, cuota, codigo: N.codigo.trim(), sentido: N.s, src: 'a mano', manual: true }]);
    fcNueva = null;
    render();
  }
  function fcNvCampo(campo, valor) { if (fcNueva) fcNueva[campo] = valor; }

  function cuerpoFc(s, datos) {
    const f = lineasFc(s, datos);
    const n = new Set(f.map((l) => l.factura)).size;
    const otro = s === 'E' ? 'Recibidas' : 'Emitidas';
    const acc = (l) => {
      const lupa = s === 'R' && l.factura ? `<button class="pill" data-act="m-esker" data-n="${esc(l.factura)}" title="Buscar esta factura en Esker">🔎</button>` : '';
      if (!puede()) return lupa;
      const a = (op, t) => `<button class="pill" data-act="m-fc" data-op="${op}" data-s="${s}" data-k="${esc(claveL(l))}">${t}</button>`;
      return `${a('signo', '± signo')}${a('mover', `→ ${otro}`)}${a('linea', '✕ línea')}${a('factura', '✕ factura')}${lupa}`;
    };
    // cada campo del libro es editable (se guarda en el propio libro de la empresa)
    const ed = puede(), idx = new Map(datos.map((l, i) => [l, i]));
    const ci = (l, campo, v, cls = '') => (ed ? `<td class="in ${cls}"><input data-fce="${s}|${idx.get(l)}|${campo}" value="${esc(v)}"></td>` : `<td class="${cls}">${esc(v)}</td>`);
    const filas = f.map((l) => { // todas las líneas del periodo, sin límite
      const p = paisDe(l.nif);
      return `<tr class="fc">${ci(l, 'fecha', fmt(s === 'E' ? l.ff : l.fecha))}${ci(l, 'factura', l.factura)}${ci(l, 'nif', l.nif, p !== 'ES' ? 'nif-ext' : '')}${ci(l, 'nombre', l.nombre)}
        <td>${p}</td>${ci(l, 'codigo', l.codigo)}${ci(l, 'base', fnum(l.base), 'num')}${ci(l, 'pct', Number(l.pct).toFixed(2).replace('.', ','), 'num')}${ci(l, 'cuota', fnum(l.cuota), 'num')}
        <td class="num">${/^R\.RC\./.test(l.codigo) ? eur(l.cuota) : ''}</td><td>${esc(clasif(l.codigo))}${l.manual ? ' <span class="hint">a mano</span>' : ''}</td><td class="acc">${acc(l)}</td></tr>`;
    }).join('');
    const nv = fcNueva?.s === s && puede() ? (() => {
      const ni = (c, ph, cls = '') => `<td class="in ${cls}"><input data-fcnv="${c}" value="${esc(fcNueva[c] ?? '')}" placeholder="${ph}"${c === 'codigo' ? ' list="fcCods"' : ''}></td>`;
      return `<tr class="nueva">${ni('fecha', 'dd/mm/aaaa', 'c')}${ni('factura', 'nº factura', 'tl')}${ni('nif', 'NIF', 'tl')}${ni('nombre', 'nombre', 'tl')}<td></td>${ni('codigo', 'código')}${ni('base', 'base', 'num')}${ni('pct', '% IVA', 'num')}${ni('cuota', 'cuota (auto)', 'num')}<td></td><td></td>
        <td class="acc"><button class="pill" data-act="m-fcnvok">✔ Añadir</button><button class="pill" data-act="m-fcnvx">✕</button></td></tr>`;
    })() : '';
    const codsDl = `<datalist id="fcCods">${[...new Set(datos.map((l) => l.codigo))].sort().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
    const sinRet = f.filter((l) => !/^(R\.)?I\./.test(l.codigo)); // el total no incluye las retenciones (misma base que la factura)
    const tot = `<tr><td colspan="6"><b>Total (sin retenciones)</b></td>${celdasNum(suma(sinRet, 'base'))}<td></td>${celdasNum(suma(sinRet, 'cuota'))}<td colspan="3"></td></tr>`;
    return { n, html: `<div class="wrap"><table class="tabla tabla-it"><thead><tr><th>Fecha</th><th>Nº factura</th><th>NIF</th><th>Nombre</th><th>País</th><th>Código</th>
      <th>Base</th><th>% IVA</th><th>Cuota</th><th>Recargo</th><th>Clasificación</th><th></th></tr></thead><tbody>${nv}${filas}${f.length ? tot : ''}</tbody></table></div>${codsDl}` };
  }

  function vistaFacturas(s) {
    if (!S.sel) return sinEmpresa;
    const datos = grande('fact-' + s);
    if (!datos) return cargandoTxt;
    if (!datos.length && fcNueva?.s !== s) return `<p class="vacio">Sin datos: carga el libro de IVA ${SENT[s].lib} con el botón ${SENT[s].boton}.</p>${puede() ? `<button class="small" data-act="m-fcnv" data-s="${s}">＋ Añadir factura a mano</button>` : ''}`;
    const ej = Number(S.ejercicio);
    const per = [`<option value="">Todo el ejercicio ${ej}</option>`,
      ...MESES.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}"${S.periodo === v ? ' selected' : ''}>Periodo ${v} (${m}) ${ej}</option>`; }),
      ...['1T', '2T', '3T', '4T'].map((q) => `<option value="${q}"${S.periodo === q ? ' selected' : ''}>Trimestre ${q} ${ej}</option>`)].join('');
    const sel = (campo, valor, lista) => `<select data-fc="${campo}"><option value="">Todos</option>${lista.map((x) => `<option${x === valor ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    const c = cuerpoFc(s, datos);
    return `<div class="fc-cab"><label>Ver <select data-glob="periodo">${per}</select></label>
      <label>Código ${sel('cod', fcCod, [...new Set(datos.map((l) => l.codigo))].sort())}</label>
      <label>País ${sel('pais', fcPais, [...new Set(datos.map((l) => paisDe(l.nif)))].sort())}</label>
      <input data-fq type="search" placeholder="Buscar NIF, nombre, factura o importe…" value="${esc(fcQ)}"><span id="fcCuenta" class="hint">${c.n} facturas</span>
      ${puede() ? `<button class="small" data-act="m-fcnv" data-s="${s}">＋ Añadir factura</button>` : ''}</div>
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
  async function editarFc(clave, valor) {
    const [s, i, campo] = clave.split('|'), tipo = `fact-${s}`, arr = GR.get(`${tipo}|${S.sel}`), l = arr?.[+i];
    if (!l) return;
    const nl = { ...l };
    if (campo === 'fecha') { const f = fIsoCta(valor); if (!f) return void alert('Fecha no válida: escríbela como dd/mm/aaaa.'); if (s === 'E') nl.ff = f; else nl.fecha = f; }
    else if (['base', 'cuota', 'pct'].includes(campo)) nl[campo] = parseES(valor);
    else if (campo === 'nif' || campo === 'codigo') nl[campo] = valor.trim().toUpperCase();
    else nl[campo] = valor.trim();
    await reemplazarGrande(tipo, S.sel, arr.map((x, j) => (j === +i ? nl : x)));
    render();
  }
  // SII: cada campo de la consulta es editable y cada registro se puede quitar
  async function editarSii(clave, valor) {
    const [s, i, campo] = clave.split('|'), tipo = `sii-${s}`, arr = GR.get(`${tipo}|${S.sel}`), l = arr?.[+i];
    if (!l) return;
    const nl = { ...l };
    if (campo === 'fecha') { const f = fIsoCta(valor); if (!f) return void alert('Fecha no válida: escríbela como dd/mm/aaaa.'); nl.fecha = f; }
    else if (['base', 'cuota', 'deducible'].includes(campo)) nl[campo] = parseES(valor);
    else if (campo === 'nif') nl.nif = valor.trim().toUpperCase();
    else nl[campo] = valor.trim();
    await reemplazarGrande(tipo, S.sel, arr.map((x, j) => (j === +i ? nl : x)));
    render();
  }
  async function quitarSii(s, i) {
    const tipo = `sii-${s}`, arr = GR.get(`${tipo}|${S.sel}`);
    if (!arr?.[+i] || !confirm(`¿Quitar la factura ${arr[+i].factura} del SII?`)) return;
    await reemplazarGrande(tipo, S.sel, arr.filter((_, j) => j !== +i));
    render();
  }
  // Esker on Demand: abre la lista de facturas de proveedor y deja el nº de factura en el portapapeles
  const ESKER_URL = 'https://as1.ondemand.esker.com/ondemand/webaccess/ase/documents.aspx?Target=adminList&ViewId=101747698&tab=1580987142';
  async function buscarEsker(n) {
    let url = ESKER_URL;
    try { url = localStorage.getItem('imp-eskerUrl') || ESKER_URL; } catch (_) { /* sin almacenamiento */ }
    const w = window.open(`${url.split('#')[0]}#hgfac=${encodeURIComponent(n)}`, 'esker');
    try { await navigator.clipboard.writeText(n); } catch (_) { /* si no se copia, se escribe a mano */ }
    if (w) try { w.focus(); } catch (_) { /* otra pestaña */ }
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

  // ---- SII-LRFE / SII-LRFR: la descarga de la sede con todas sus columnas, filtros, corrección de factura/NIF/nombre/importes y registros quitados ----
  let siiFil = { E: {}, R: {} }, siiTodos = { E: false, R: false }, siiN = { E: 150, R: 150 };
  const siiKey = (x) => `${x.factura}|${x.nif}|${x.ej}|${x.per}`;
  const siiMeses = () => (/^\d\d$/.test(S.periodo) ? [S.periodo] : /^[1-4]T$/.test(S.periodo) ? [0, 1, 2].map((i) => String((+S.periodo[0] - 1) * 3 + i + 1).padStart(2, '0')) : MM12);
  const quitReg = () => S.registros.find((r) => r.tipo === 'siiquit' && r.empresa_id === S.sel);
  // Plazo de presentación al SII: 4 días hábiles desde la expedición (emitidas) o el registro contable (recibidas), con tope el día 15 del mes siguiente
  const festivosNac = (y) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Set([[0, 1], [0, 6], [4, 1], [7, 15], [9, 12], [10, 1], [11, 6], [11, 8], [11, 25]].map(([mm, dd]) => Date.UTC(y, mm, dd)).concat([Date.UTC(y, mes - 1, dia) - 2 * 864e5]));
  };
  const esHabil = (t) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6 && !festivosNac(new Date(t).getUTCFullYear()).has(t); };
  const masHabiles = (t, n) => { for (let k = 0; k < n;) { t += 864e5; if (esHabil(t)) k++; } return t; };
  const fechaSii = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v > 20000 ? Math.floor((Date.UTC(1899, 11, 30) + v * 864e5) / 864e5) * 864e5 : null;
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
  };
  const fechaTxt = (t) => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/');
  function plazoSii(s, todos, raw, cab) {
    const emit = s === 'E', iFp = cab.findIndex((c) => /presentaci/i.test(c) && /fecha|hora|timestamp/i.test(c)), iMod = cab.findIndex((c) => /timestamp|ltima modificaci/i.test(c)), iP = iFp >= 0 ? iFp : iMod;
    if (iP < 0) return `<div class="aviso"><p>⚠ Plazo de 4 días hábiles: la descarga del SII no trae la fecha de presentación; descárgala con esa columna para comprobarlo.</p></div>`;
    const iB = emit ? -1 : cab.findIndex((c) => /^Fecha (de )?Registro Contable/i.test(c));
    const fuera = []; let n = 0, sinF = 0;
    for (const x of todos) {
      if (/anulad/i.test(x.estado)) continue;
      const w = raw.get(siiKey(x)), fp = fechaSii(w?.[iP]), fb = (iB >= 0 ? fechaSii(w?.[iB]) : null) ?? fechaSii(x.fecha);
      n++;
      if (!fp || !fb) { sinF++; continue; }
      const per = String(x.per ?? '').trim().toUpperCase(), trim = /^[1-4]T$/.test(per), mes = trim ? (+per[0]) * 3 : /^\d{1,2}$/.test(per) ? +per : new Date(fb).getUTCMonth() + 1;
      const mFin = emit ? new Date(fb).getUTCMonth() + 1 : mes, yFin = emit ? new Date(fb).getUTCFullYear() : x.ej;
      const tope = Date.UTC(mFin === 12 ? yFin + 1 : yFin, mFin === 12 ? 0 : mFin, 15), lim = Math.min(masHabiles(fb, 4), tope);
      if (fp > lim) { let dd = 0; for (let t = lim; t < fp;) { t += 864e5; if (esHabil(t)) dd++; } fuera.push({ x, fb, fp, lim, dd }); }
    }
    fuera.sort((a, b) => b.dd - a.dd);
    const base = emit ? 'expedición' : 'registro contable';
    const tabla = fuera.length ? `<div class="wrap"><table class="tprs tnom" style="width:auto"><thead><tr><th>Factura</th><th>Nombre</th><th>${emit ? 'Expedición' : 'Registro'}</th><th>Límite</th><th>Presentada</th><th>Días hábiles tarde</th></tr></thead>
      <tbody>${fuera.slice(0, 50).map((f) => `<tr><td>${esc(f.x.factura)}</td><td>${esc(f.x.nombre)}</td><td class="c">${fechaTxt(f.fb)}</td><td class="c">${fechaTxt(f.lim)}</td><td class="c">${fechaTxt(f.fp)}</td><td class="num">${f.dd}</td></tr>`).join('')}</tbody></table></div>
      ${fuera.length > 50 ? `<p class="hint">y ${fuera.length - 50} más</p>` : ''}` : '';
    return `<section class="prs-card"><div class="prs-h">Plazo de presentación al SII · ${n} facturas del periodo · ${fuera.length ? `${fuera.length} fuera de plazo` : 'todas en plazo'}</div>
      <p class="hint" style="margin:.4em 1em">4 días hábiles desde la ${base} (tope: día 15 del mes siguiente${emit ? '' : ', al trimestre en las trimestrales'}). No cuentan sábados, domingos ni festivos nacionales.${sinF ? ` ${sinF} sin fecha para comprobar.` : ''}${iFp < 0 ? ' Fecha de presentación tomada de «última modificación»: una factura modificada después puede salir tarde sin estarlo.' : ''}</p>${tabla}</section>`;
  }
  function siiFiltro(clave, valor) { const [s, c] = clave.split('|'); siiFil[s][c] = valor; siiN[s] = 150; render(); }
  function vistaSII(s) {
    if (!S.sel) return sinEmpresa;
    const datos = grande('sii-' + s), cab0 = grande('sii-cab-' + s);
    if (!datos || !cab0) return cargandoTxt;
    const cab = cab0.length ? cab0 : CAB_SII[s]; // todas las columnas de la descarga, vengan con datos o sin ellos
    const ej = Number(S.ejercicio), e = empresa(), ed = puede(), emit = s === 'E';
    const meses = siiMeses(), shards = meses.map((mm) => grande(`sii-raw-${s}-${ej}-${mm}`));
    if (shards.some((x) => x === null)) return cargandoTxt;
    const raw = new Map(); shards.forEach((sh) => sh.forEach((r) => raw.set(r.k, r.raw)));
    const dropz = dz('sii', 'Suelta aquí las descargas del SII', '(facturas emitidas y recibidas, .xlsx, .xls o .csv) o pulsa para elegirlas');
    if (!datos.length) return `${dropz}<div class="aviso"><p>⚠ Suelta la consulta de facturas ${emit ? 'emitidas' : 'recibidas'} descargada de la Sede Electrónica (el Excel o CSV con la columna «Nº Serie + Nº Factura»).</p></div>`;
    const r = rangoPeriodo(ej, S.periodo), F = siiFil[s], idx = new Map(datos.map((l, i) => [l, i]));
    const todos = datos.filter((x) => (emit ? x.fecha >= r.desde && x.fecha <= r.hasta : x.ej === ej && (!S.periodo || x.per === S.periodo)));
    const iClave = cab.findIndex((c) => /^Clave de R[eé]gimen Especial/i.test(c));
    const ok = (x) => {
      const w = raw.get(siiKey(x)) ?? {};
      if (F.nif && !String(x.nif).toLowerCase().includes(F.nif.toLowerCase())) return false;
      if (F.nom && !sinAc(x.nombre).includes(sinAc(F.nom))) return false;
      if (F.fac && !String(x.factura).toLowerCase().includes(F.fac.toLowerCase())) return false;
      if (F.tipo && String(x.tipo).toLowerCase() !== F.tipo.toLowerCase()) return false;
      if (F.desde && fIsoCta(F.desde) && x.fecha < fIsoCta(F.desde)) return false;
      if (F.hasta && fIsoCta(F.hasta) && x.fecha > fIsoCta(F.hasta)) return false;
      if (F.clave && !String(iClave >= 0 ? w[iClave] ?? '' : '').toLowerCase().includes(F.clave.toLowerCase())) return false;
      if (F.estado && !String(x.estado).toLowerCase().includes(F.estado.toLowerCase())) return false;
      if (F.csv && !Object.values(w).some((v) => String(v).toLowerCase().includes(F.csv.toLowerCase()))) return false;
      const imp = x.base + x.cuota;
      if (F.imin !== undefined && F.imin !== '' && imp < parseES(F.imin)) return false;
      if (F.imax !== undefined && F.imax !== '' && imp > parseES(F.imax)) return false;
      return true;
    };
    const cumple = todos.filter(ok), lista = (siiTodos[s] ? todos : cumple).slice(0, siiN[s]);
    const sumB = rr(cumple.reduce((t, x) => t + x.base, 0)), sumC = rr(cumple.reduce((t, x) => t + x.cuota, 0));
    // solo las columnas de la descarga que tienen algún dato en lo que se ve
    const cols = cab.map((_, i) => i); // todas las columnas de la descarga, con o sin datos
    const conRaw = todos.filter((x) => raw.has(siiKey(x))).length, aviso = conRaw < todos.length ? `<div class="aviso"><p>⚠ Solo ${conRaw} de ${todos.length} facturas de este periodo traen todas las columnas de la descarga: suelta de nuevo el CSV de ese periodo para completarlas (no se duplican).</p></div>` : '';
    const nOcultas = 0;
    const celdaRaw = (v) => { const t = v === undefined ? '' : String(v); return `<td class="${/^-?[\d.]+,\d+$/.test(t) ? 'num' : ''}">${esc(t)}</td>`; };
    const fil = (k, lbl, ph = '') => `<label>${lbl}<input class="emp-in" style="width:7em" data-siifil="${s}|${k}" value="${esc(F[k] ?? '')}" placeholder="${esc(ph)}"></label>`;
    const ci = (x, campo, v, cls = '') => (ed ? `<td class="in ${cls}"><input data-sie="${s}|${idx.get(x)}|${campo}" value="${esc(v)}"></td>` : `<td class="${cls}">${esc(v)}</td>`);
    const Q = quitReg()?.datos?.[s] ?? [];
    const filas = lista.map((x) => `<tr class="${ok(x) ? '' : 'sii-no'}">${cols.map((k) => celdaRaw((raw.get(siiKey(x)) ?? {})[k])).join('')}${ci(x, 'factura', x.factura)}${ci(x, 'nif', x.nif)}${ci(x, 'nombre', x.nombre)}${ci(x, 'base', fnum(x.base), 'num')}${ci(x, 'cuota', fnum(x.cuota), 'num')}
      <td class="c">${ok(x) ? 'VERDADERO' : 'FALSO'}</td><td class="c">${ed ? `<button class="small" data-act="m-siidel" data-s="${s}" data-i="${idx.get(x)}" title="Quitar este registro del SII">✖</button>` : ''}</td></tr>`).join('');
    const quitados = Q.length ? `<div class="aviso"><b>Facturas quitadas del SII (${Q.length})</b> ${ed ? `<button class="small" data-act="m-siirec" data-s="${s}" data-i="${Q.length - 1}">↩ Deshacer la última (${esc(Q[Q.length - 1].factura)})</button> <button class="small" data-act="m-siirec" data-s="${s}" data-i="todas">Recuperar todas</button>` : ''}
      <table class="tprs tnom" style="width:auto;margin-top:.4em"><tbody>${Q.map((q, i) => `<tr><td>${esc(q.factura)}</td><td>${esc(q.nif)}</td><td>${esc(q.nombre)}</td><td class="num">${fnum(q.base)}</td><td class="num">${fnum(q.cuota)}</td><td>${ed ? `<button class="small" data-act="m-siirec" data-s="${s}" data-i="${i}">↩ Recuperar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `${dropz}${aviso}
      <section class="prs-card"><div class="prs-h">SII - LIBRO REGISTRO DE FACTURAS ${emit ? 'EMITIDAS (LRFE)' : 'RECIBIDAS (LRFR)'}</div>
      <p class="hint" style="margin:.4em 1em">Consulta de facturas ${emit ? 'emitidas' : 'recibidas'} de la Sede Electrónica de la AEAT · Se muestran las ${cols.length} columnas de la descarga (desliza la tabla hacia los lados para verlas todas)</p>
      <div class="css-flex" style="gap:2em;flex-wrap:wrap;padding-bottom:.2em"><table class="tprs tnom" style="width:auto"><tbody>
        <tr><td>NIF Titular</td><td class="amar"><b>${esc(e.cif)}</b></td></tr><tr><td>Nombre / Razón social</td><td class="amar"><b>${esc(e.nombre)}</b></td></tr>
        <tr><td>Libro registro</td><td class="amar"><b>Facturas ${emit ? 'Emitidas' : 'Recibidas'}</b></td></tr><tr><td>Ejercicio</td><td class="amar"><b>${ej}</b></td></tr>
        <tr><td>Periodo</td><td class="amar"><b>${S.periodo ? (PERIODOS[S.periodo] ?? S.periodo) : 'Todo el ejercicio'}</b></td></tr></tbody></table>
        <table class="tprs tnom" style="width:auto"><tbody><tr><td>Registros que cumplen filtros / pegados</td><td class="amar num"><b>${cumple.length} / ${todos.length}</b></td></tr>
        <tr><td>Total base declarada (filtrada)</td><td class="amar num"><b>${fnum(sumB)}</b></td></tr><tr><td>Total cuota ${emit ? 'repercutida' : 'soportada'} (filtrada)</td><td class="amar num"><b>${fnum(sumC)}</b></td></tr></tbody></table></div>
      <div class="fc-cab" style="margin:.4em 1em"><b>Filtros adicionales:</b>${fil('nif', emit ? 'NIF Destinatario' : 'NIF Emisor')}${fil('nom', 'Nombre')}${fil('fac', 'Nº Serie + Nº Factura')}${fil('tipo', 'Tipo de factura', 'F1, F2, R1…')}
        ${fil('desde', 'Fecha expedición desde', 'dd/mm/aaaa')}${fil('hasta', 'hasta', 'dd/mm/aaaa')}${fil('clave', 'Clave régimen')}${fil('estado', 'Estado', 'Correcta…')}${fil('csv', 'CSV')}${fil('imin', 'Importe total desde')}${fil('imax', 'hasta')}
        <label><input type="checkbox" data-siitodos="${s}"${siiTodos[s] ? ' checked' : ''}> Ver también los que no cumplen</label></div>
      <div class="wrap siiwrap"><table class="tabla sii-t"><thead><tr>${cols.map((k) => `<th>${esc(cab[k] ?? '')}</th>`).join('')}<th>Nº factura (corregir)</th><th>NIF (corregir)</th><th>Nombre (corregir)</th><th>TOTAL BASE DECLARADA (SII)</th><th>TOTAL CUOTA ${emit ? 'REPERCUTIDA' : 'SOPORTADA'} (SII)</th><th>CUMPLE TODOS LOS FILTROS</th><th></th></tr></thead>
        <tbody>${filas}<tr class="ttot"><td colspan="${cols.length + 3}"><b>TOTAL (registros que cumplen)</b></td><td class="num">${fnum(sumB)}</td><td class="num">${fnum(sumC)}</td><td></td><td></td></tr></tbody></table></div>
      ${quitados}
      ${(siiTodos[s] ? todos : cumple).length > lista.length ? `<button class="small" data-act="m-siimas" data-s="${s}" style="margin:.6em 1em">Ver más (${lista.length} de ${(siiTodos[s] ? todos : cumple).length})</button>` : ''}</section>${plazoSii(s, todos, raw, cab)}`;
  }
  async function quitarSii2(s, i) {
    const tipo = `sii-${s}`, arr = GR.get(`${tipo}|${S.sel}`), l = arr?.[+i];
    if (!l || !confirm(`¿Quitar la factura ${l.factura} del SII?`)) return;
    const reg = quitReg(), datos = JSON.parse(JSON.stringify(reg?.datos ?? {}));
    (datos[s] ??= []).push(l);
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'siiquit', ejercicio: null, datos });
    if (err) return void alert(err);
    await reemplazarGrande(tipo, S.sel, arr.filter((_, j) => j !== +i));
    await cargar(); render();
  }
  async function recuperarSii(s, i) {
    const reg = quitReg(); if (!reg) return;
    const datos = JSON.parse(JSON.stringify(reg.datos)), Q = datos[s] ?? [];
    const rec = i === 'todas' ? Q.splice(0, Q.length) : Q.splice(+i, 1);
    if (!rec.length) return;
    const tipo = `sii-${s}`, arr = GR.get(`${tipo}|${S.sel}`) ?? [];
    const err = await guardarRegistro(reg, { ...reg, datos });
    if (err) return void alert(err);
    await reemplazarGrande(tipo, S.sel, [...arr, ...rec]);
    await cargar(); render();
  }

  // ---- Conciliación SII vs contabilidad (clon de la otra aplicación) ----
  let siiCod = { E: '', R: '' }, siiTodo = false;
  function vistaConcSII(s) {
    if (!S.sel) return sinEmpresa;
    const lib = grande('fact-' + s), sii = grande('sii-' + s);
    if (!lib || !sii) return cargandoTxt;
    const e = s === 'E', ej = Number(S.ejercicio);
    const av = [];
    if (!lib.length) av.push(`Falta el libro de IVA ${e ? 'repercutido' : 'soportado'} (contabilidad): suéltalo en la pestaña Facturas ${e ? 'emitidas' : 'recibidas'}.`);
    if (!sii.length) av.push(`Falta la descarga del SII de facturas ${e ? 'emitidas' : 'recibidas'}: suéltala en la franja de arriba.`);
    av.push(e ? 'Se cruza por número de factura. En la contabilidad no cuentan las autorepercutidas, el recargo de equivalencia ni las retenciones.' : 'Se cruza por número de factura + NIF del emisor. En la contabilidad no cuentan los códigos de retenciones (I.*).');
    const cab = `${dz('sii', 'Suelta aquí las descargas del SII', '(facturas emitidas y recibidas, .xlsx, .xls o .csv) o pulsa para elegirlas')}<div class="aviso">${av.map((a) => `<p>⚠ ${esc(a)}</p>`).join('')}</div>`;
    if (!lib.length || !sii.length) return cab;
    const D = conciliarSiiCompleta(s, lib, sii, ej, S.periodo), x = D.tc, y = D.ts;
    const dif = (a, b) => rr(a - b), ko = (d) => (Math.abs(d) > 0.10 + 1e-9 ? 'dif-ko' : 'est-ok');
    const nomC = e ? 'Contabilizado (IVA repercutido)' : 'Contabilizado (IVA soportado)', nomS = e ? 'Declarado SII (SII-LRFE)' : 'Declarado SII (SII-LRFR)';
    const TOPE_C = siiTodo ? 1e9 : 200;
    const mas = (n, cs) => (n > TOPE_C ? `<tr><td colspan="${cs}" class="c"><button class="small" data-act="m-siitodo">Se ven ${TOPE_C} de ${n} · mostrar todas</button></td></tr>` : '');
    const lst = (arr, cols) => `<div class="wrap" style="max-height:60vh;overflow:auto"><table class="tprs tnom conc-t"><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead>
      <tbody>${arr.slice(0, TOPE_C).map((q) => `<tr>${cols.map((c) => `<td class="${c[2] === 'n' ? 'num' : ''}">${c[2] === 'n' ? fnum(q[c[1]] || 0) : esc(q[c[1]] || '')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="vacio">Ninguna</td></tr>`}
      ${arr.length ? `<tr class="ttot"><td>TOTAL</td>${cols.slice(1).map((c) => `<td class="num">${c[2] === 'n' ? fnum(rr(arr.reduce((t, q) => t + (q[c[1]] || 0), 0))) : ''}</td>`).join('')}</tr>` : ''}${mas(arr.length, cols.length)}</tbody></table></div>`;
    const fd = D.facDesc.filter((q) => !siiCod[s] || q.cod === siiCod[s]);
    const filasCod = D.cods.map((o) => `<tr class="${siiCod[s] === o.cod ? 'sel-cod' : ''}" data-act="m-siicod" data-t="${s}" data-cod="${esc(o.cod)}" style="cursor:pointer" title="Ver sus facturas que descuadran"><td>${esc(o.cod)}</td><td class="num">${o.n}</td><td class="num">${fnum(o.bc)}</td><td class="num">${fnum(o.bs)}</td>
      <td class="num ${Math.abs(o.db) > 0.01 ? 'dif-ko' : ''}">${fnum(o.db)}</td><td class="num">${fnum(o.cc)}</td><td class="num">${fnum(o.cs)}</td><td class="num ${Math.abs(o.dc) > 0.01 ? 'dif-ko' : ''}">${fnum(o.dc)}</td></tr>`).join('');
    return `${cab}
      <section class="prs-card"><div class="prs-h">CONCILIACIÓN SII vs CONTABILIDAD - FACTURAS ${e ? 'EMITIDAS' : 'RECIBIDAS'} · ${D.desde.split('-').reverse().join('/')} – ${D.hasta.split('-').reverse().join('/')}</div>
      <div class="no-print" style="margin:.4em 1em"><button class="small" data-act="m-siixl" data-s="${s}">⬇ Descargar Excel</button></div>
      <div class="wrap"><table class="tprs tnom conc-t" style="width:auto;min-width:40em"><thead><tr><th></th><th>${nomC}</th><th>${nomS}</th><th>Diferencia</th></tr></thead><tbody>
        <tr><td>Nº de facturas</td><td class="num">${x.n}</td><td class="num">${y.n}</td><td class="num ${x.n !== y.n ? 'dif-ko' : ''}">${x.n - y.n}</td></tr>
        <tr><td>Base imponible</td><td class="num">${fnum(x.base)}</td><td class="num">${fnum(y.base)}</td><td class="num ${ko(dif(x.base, y.base))}">${fnum(dif(x.base, y.base))}</td></tr>
        <tr><td>Cuota ${e ? 'repercutida' : 'soportada'}</td><td class="num">${fnum(x.cuota)}</td><td class="num">${fnum(y.cuota)}</td><td class="num ${ko(dif(x.cuota, y.cuota))}">${fnum(dif(x.cuota, y.cuota))}</td></tr>
        ${e ? '' : `<tr><td>Cuota deducible declarada (solo SII)</td><td></td><td class="num">${fnum(y.deduc)}</td><td></td></tr>`}
        <tr class="${D.cuadra ? 'cf-ok' : 'cf-ko'}"><td>Situación</td><td colspan="3"><b>${D.cuadra ? `CUADRA${D.ceros ? ` (hay ${D.ceros} factura(s) a cero solo en un lado: no afectan a los importes)` : ''}` : 'DESCUADRE - revisar el detalle'}</b></td></tr></tbody></table></div>
      <div class="css-flex" style="align-items:flex-start;flex-wrap:wrap">
        <div><div class="css-4760-t">Descuadre por código de impuesto</div><div class="wrap" style="max-height:60vh;overflow:auto"><table class="tprs tnom conc-t"><thead><tr><th>Código de impuesto (contabilidad)</th><th>Nº facturas</th><th>Base contab.</th><th>Base SII</th><th>Dif. base</th><th>Cuota contab.</th><th>Cuota SII</th><th>Dif. cuota</th></tr></thead>
          <tbody>${filasCod || '<tr><td colspan="8" class="vacio">Sin datos</td></tr>'}${D.cods.length ? `<tr class="ttot"><td>TOTAL</td><td class="num">${D.cods.reduce((t, o) => t + o.n, 0)}</td>${['bc', 'bs', 'db', 'cc', 'cs', 'dc'].map((k) => `<td class="num">${fnum(rr(D.cods.reduce((t, o) => t + o[k], 0)))}</td>`).join('')}</tr>` : ''}</tbody></table></div></div>
        <div><div class="css-4760-t">Facturas que descuadran${siiCod[s] ? ` · ${esc(siiCod[s])} <button class="small" data-act="m-siicod" data-t="${s}" data-cod="">(ver todas)</button>` : ''} · ${fd.filter((q) => !q.anula).length}${D.anuladas ? ` <span class="est-ok" style="font-weight:400">· ${D.anuladas} que se anulan entre sí (cuadran)</span>` : ''}</div>
          <div class="wrap" style="max-height:60vh;overflow:auto"><table class="tprs tnom conc-t"><thead><tr><th>Código</th><th>Factura</th><th>${e ? 'NIF' : 'NIF Emisor'}</th><th>Nombre</th><th>Base contab.</th><th>Base SII</th><th>Dif. base</th><th>Cuota contab.</th><th>Cuota SII</th><th>Dif. cuota</th></tr></thead>
          <tbody>${fd.slice(0, TOPE_C).map((q) => `<tr${q.anula ? ' class="cf-ok" title="Se anula con otra factura del mismo NIF y código: cuadra"' : ''}><td>${esc(q.cod)}${q.anula ? ' ✓' : ''}</td><td>${esc(q.fac || '')}</td><td>${esc(q.nif || '')}</td><td>${esc(q.nom || '')}</td><td class="num">${fnum(q.bc)}</td><td class="num">${fnum(q.bs)}</td>
            <td class="num ${q.anula ? 'est-ok' : Math.abs(q.db) > 0.01 ? 'dif-ko' : ''}">${fnum(q.db)}</td><td class="num">${fnum(q.cc)}</td><td class="num">${fnum(q.cs)}</td><td class="num ${q.anula ? 'est-ok' : Math.abs(q.dc) > 0.01 ? 'dif-ko' : ''}">${fnum(q.dc)}</td></tr>`).join('') || '<tr><td colspan="10" class="vacio">Ninguna factura descuadra</td></tr>'}${mas(fd.length, 10)}</tbody></table></div></div></div>
      <div class="css-4760-t" style="margin:.8em 1em 0">Facturas declaradas en el SII de forma distinta a su código de impuesto · ${D.malSii.length}</div>
      <div class="wrap" style="max-height:60vh;overflow:auto"><table class="tprs tnom conc-t"><thead><tr><th>Código (contabilidad)</th><th>Factura</th><th>${e ? 'NIF' : 'NIF Emisor'}</th><th>Nombre</th><th>Debería estar en el SII como</th><th>Está declarada en el SII como</th></tr></thead>
        <tbody>${D.malSii.slice(0, TOPE_C).map((q) => `<tr><td>${esc(q.cods)}</td><td>${esc(q.fac || '')}</td><td>${esc(q.nif || '')}</td><td>${esc(q.nom || '')}</td><td>${esc(q.esp)}</td><td class="dif-ko">${esc(q.dec)}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Todas las facturas están declaradas en el SII como corresponde a su código</td></tr>'}${mas(D.malSii.length, 6)}</tbody></table></div>
      <p class="hint">${e ? 'R.EX → exenta E2 · R.UE → exenta E5 · R.UE.S → no sujeta por localización · R.NC/R.RC → S1 al tipo del código · R.NC.EX → exenta con causa · R.NAC.NS → no sujeta · R.ISP → S2'
        : 'S.UE → adquisición intracomunitaria (clave de régimen 09) al tipo del código · S.ISP → ISP · S.NC → sin ISP al tipo del código · IN → sin ISP al tipo del código y bien de inversión SÍ'}. Los códigos sin regla (DUA, retenciones…) no se revisan. Así se ve qué factura corregir en el SII para que la predeclaración del 303 salga bien.</p>
      <p class="hint">Pulsa un código para ver solo sus facturas. Cada factura se asigna al código (o combinación de códigos) con que está contabilizada; el SII no trae código, así que las declaradas que no están en la contabilidad salen aparte. Ordenado de mayor a menor descuadre. Margen para dar por cuadrado: ±0,10 €.</p>
      <div class="css-flex" style="align-items:flex-start;flex-wrap:wrap">
        <div><div class="css-4760-t">A. Contabilizadas que no están en el SII · ${D.A.length}</div>${lst(D.A, [['Factura', 'fac'], [e ? 'NIF' : 'NIF Emisor', 'nif'], ['Nombre', 'nom'], ['Base contab.', 'base', 'n'], ['Cuota contab.', 'cuota', 'n']])}</div>
        <div><div class="css-4760-t">B. Declaradas en el SII que no están contabilizadas · ${D.B.length}</div>${lst(D.B, [['Factura', 'fac'], [e ? 'NIF' : 'NIF Emisor', 'nif'], ['Nombre', 'nom'], ['Base SII', 'base', 'n'], ['Cuota SII', 'cuota', 'n']])}</div>
        <div><div class="css-4760-t">C. En ambos con importes distintos · ${D.C.length}</div>${lst(D.C.map((q) => ({ ...q, db: rr(q.bc - q.bs), dc: rr(q.cc - q.cs) })), [['Factura', 'fac'], ['Nombre', 'nom'], ['Base contab.', 'bc', 'n'], ['Base SII', 'bs', 'n'], ['Dif. base', 'db', 'n'], ['Cuota contab.', 'cc', 'n'], ['Cuota SII', 'cs', 'n'], ['Dif. cuota', 'dc', 'n']])}</div>
      </div></section>`;
  }

  // Excel de la conciliación SII vs contabilidad (lo mismo que se ve en pantalla), con SheetJS
  function excelConcSii(s) {
    const lib = GR.get(`fact-${s}|${S.sel}`), sii = GR.get(`sii-${s}|${S.sel}`);
    if (!lib?.length || !sii?.length || !window.XLSX) return void alert('Faltan el libro de IVA o la descarga del SII (o no se ha cargado la librería de Excel).');
    const X = window.XLSX, e = s === 'E', em = empresa(), ej = Number(S.ejercicio), D = conciliarSiiCompleta(s, lib, sii, ej, S.periodo), x = D.tc, y = D.ts;
    const N = (v) => ({ t: 'n', v: Number(v) || 0, z: '#,##0.00;-#,##0.00;"-"' }), I = (v) => ({ t: 'n', v: Number(v) || 0, z: '0' });
    const nif = e ? 'NIF' : 'NIF Emisor', rows = [];
    const blk = (tit, cab, arr, f) => { rows.push([], [tit], cab); arr.forEach((q) => rows.push(f(q))); if (!arr.length) rows.push(['Ninguna']); };
    rows.push([`CONCILIACIÓN SII vs CONTABILIDAD - FACTURAS ${e ? 'EMITIDAS' : 'RECIBIDAS'}`], [`${em?.nombre ?? ''} · ${em?.cif ?? ''}`],
      [`Periodo: ${D.desde.split('-').reverse().join('/')} – ${D.hasta.split('-').reverse().join('/')}`], [],
      ['', 'Contabilizado', 'Declarado SII', 'Diferencia'],
      ['Nº de facturas', I(x.n), I(y.n), I(x.n - y.n)], ['Base imponible', N(x.base), N(y.base), N(rr(x.base - y.base))],
      [`Cuota ${e ? 'repercutida' : 'soportada'}`, N(x.cuota), N(y.cuota), N(rr(x.cuota - y.cuota))],
      ['Situación', D.cuadra ? `CUADRA${D.ceros ? ` (hay ${D.ceros} factura(s) a cero solo en un lado)` : ''}` : 'DESCUADRE - revisar el detalle']);
    blk('DESCUADRE POR CÓDIGO DE IMPUESTO', ['Código', 'Nº facturas', 'Base contab.', 'Base SII', 'Dif. base', 'Cuota contab.', 'Cuota SII', 'Dif. cuota'], D.cods,
      (o) => [o.cod, I(o.n), N(o.bc), N(o.bs), N(o.db), N(o.cc), N(o.cs), N(o.dc)]);
    blk('FACTURAS QUE DESCUADRAN', ['Código', 'Factura', nif, 'Nombre', 'Base contab.', 'Base SII', 'Dif. base', 'Cuota contab.', 'Cuota SII', 'Dif. cuota', ''], D.facDesc,
      (q) => [q.cod, q.fac || '', q.nif || '', q.nom || '', N(q.bc), N(q.bs), N(q.db), N(q.cc), N(q.cs), N(q.dc), q.anula ? 'se anula con otra (cuadra)' : '']);
    blk('DECLARADAS EN EL SII DE FORMA DISTINTA A SU CÓDIGO', ['Código (contabilidad)', 'Factura', nif, 'Nombre', 'Debería estar como', 'Está declarada como'], D.malSii,
      (q) => [q.cods, q.fac || '', q.nif || '', q.nom || '', q.esp, q.dec]);
    blk('A. CONTABILIZADAS QUE NO ESTÁN EN EL SII', ['Factura', nif, 'Nombre', 'Base contab.', 'Cuota contab.'], D.A, (q) => [q.fac || '', q.nif || '', q.nom || '', N(q.base), N(q.cuota)]);
    blk('B. DECLARADAS EN EL SII QUE NO ESTÁN CONTABILIZADAS', ['Factura', nif, 'Nombre', 'Base SII', 'Cuota SII'], D.B, (q) => [q.fac || '', q.nif || '', q.nom || '', N(q.base), N(q.cuota)]);
    blk('C. EN AMBOS CON IMPORTES DISTINTOS', ['Factura', 'Nombre', 'Base contab.', 'Base SII', 'Cuota contab.', 'Cuota SII'], D.C, (q) => [q.fac || '', q.nom || '', N(q.bc), N(q.bs), N(q.cc), N(q.cs)]);
    const ws = X.utils.aoa_to_sheet(rows), wb = X.utils.book_new();
    ws['!cols'] = [34, 16, 16, 34, 16, 16, 16, 16, 16, 16, 28].map((wch) => ({ wch }));
    X.utils.book_append_sheet(wb, ws, e ? 'ConcSII-E' : 'ConsSII-R');
    X.writeFile(wb, `ConcSII-${e ? 'E' : 'R'}_${em?.cif ?? ''}_${ej}-${S.periodo || 'anual'}.xlsx`);
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
      <label>Periodo <select data-glob="periodo">${ops}</select></label>
      <button data-act="m-retprint" data-m="${mod}">Imprimir PDF Mod. ${mod} · todas las empresas</button><button data-act="m-retprint" data-m="todos">Imprimir PDF 111+115+123 · todas las empresas</button></div>
      <p class="hint">Gran empresa: por meses. Pyme: por trimestres. Las líneas salen del libro de IVA recibidas y las nóminas, de la pestaña Nóminas. En la impresión cada empresa va en un folio vertical (gran empresa por el mes, pyme por su trimestre).</p>`;
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
        const cuentas = leerSYS(await filasExcel(f));
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

  // ================= Bloque 5 · Cuentas contables: extracto de cada cuenta + resumen por periodo (como la otra aplicación) =================
  // Columnas: ['c',código,etiqueta,desplazamiento] suma debe+haber del tipo · ['f',clave,etiqueta,fórmula,esDiferencia] · ['s',clave,etiqueta] saldo real al cierre
  //           ['x',clave,etiqueta,fuente] dato externo (nóminas, presentados o a mano) · ['a',clave,etiqueta,de] acumulado.  {S} = sigla de la empresa en los asientos
  const P2 = (a, n) => !!n && a.startsWith(n);
  const CTAS_BASE = {
    c4650: { cta: '4650.01', desc: 'Remuneraciones pendientes de pago', tit: 'RESUMEN MENSUAL REMUNERACIONES PENDIENTES DE PAGO - EXCEL NÓMINAS', per: 'mes',
      tipo: (a, d) => (P2(a, 'PN') ? 'PN' : P2(a, 'N') ? 'N' : d ? 'OD' : 'OH'), codes: ['PN', 'OD', 'OH', 'N'],
      cols: [['c', 'PN', 'PN - Pago Nóminas'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'N', 'N - Nóminas Devengadas'],
        ['f', 'SP', 'Saldo del periodo (PN + OD − OH − N)', (v) => v.PN + v.OD - v.OH - v.N], ['a', 'SC', 'Saldo cuenta', 'SP'],
        ['x', 'G', 'Nómina Gestoría (líquido de las nóminas)', 'nom:liquido'], ['f', 'D', 'Diferencia (PN − Nómina Gestoría)', (v) => (v.G === null ? null : v.PN - v.G), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c4700: { cta: '4700.01', desc: 'H.P. deudora por IVA - Modelo 303', tit: 'RESUMEN MENSUAL H.P. DEUDORA POR IVA - MODELO 303', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, S) ? 'S' : P2(a, 'DEV') ? 'DEV' : P2(a, 'RS') ? 'RS' : 'OD'), codes: ['S', 'OD', 'RS', 'DEV'],
      cols: [['c', 'S', '{S} - Liquidaciones IVA'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'RS', 'RS - Reclasificaciones de Saldo'], ['c', 'DEV', 'DEV - Devoluciones de IVA', 'DY'],
        ['f', 'T', 'Total movimientos ({S} + OD − RS − DEV)', (v) => v.S + v.OD - v.RS - v.DEV], ['a', 'SC', 'Saldo Cuenta', 'T'],
        ['x', 'M', 'Modelo 303 Presentado', '303neg'], ['f', 'D', 'Diferencia ({S} − Modelo 303; en diciembre a devolver: DEV − Modelo 303)', (v) => (v.M === null ? null : v._devolver ? v.DEV - v.M : v.S - v.M), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c4709: { cta: '4709.01', desc: 'H.P. deudora por IS - Modelo 200', tit: 'RESUMEN MENSUAL H.P. DEUDORA POR IS - MODELO 200', per: 'ano',
      tipo: (a, d) => (P2(a, 'DEV') ? 'DEV' : P2(a, 'I-') ? 'I' : d ? 'OD' : 'OH'), codes: ['I', 'OD', 'OH', 'DEV'],
      cols: [['c', 'I', 'I - Impuesto Devengado'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'DEV', 'DEV - Devoluciones de IS (cobradas ejercicio siguiente)', 'Y'],
        ['f', 'SE', 'Saldo del ejercicio (I + OD − OH − DEV)', (v) => v.I + v.OD - v.OH - v.DEV], ['a', 'SA', 'Saldo acumulado', 'SE'],
        ['x', 'M', 'Impuesto Presentado Mod. 200', 'man'], ['f', 'D', 'Diferencia (I − Impuesto Presentado)', (v) => (v.M === null ? null : v.I - v.M), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c4730: { cta: '4730.05', desc: 'H.P. reten. y pagos a cta - Pagos fraccionados IS (Mod. 202)', tit: 'RESUMEN POR PERIODO DE PAGO FRACCIONADO (1P / 2P / 3P) - MOD 202', per: 'p202',
      tipo: (a, d) => (P2(a, 'PM') ? 'PM' : P2(a, 'I') ? 'I' : d ? 'OD' : 'OH'), codes: ['PM', 'OD', 'OH', 'I'],
      cols: [['c', 'PM', 'PM - Pago Mod. 202'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'I', 'I - Impto. Devengado'],
        ['f', 'SP', 'Saldo del periodo (PM + OD − OH − I)', (v) => v.PM + v.OD - v.OH - v.I], ['a', 'SC', 'Saldo Cuenta', 'SP'],
        ['x', 'M', 'Impuesto Presentado Mod. 202', 'man'], ['f', 'D', 'Diferencia (PM − Impuesto Presentado)', (v) => (v.M === null ? null : v.PM - v.M), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c4750: { cta: '4750.01', desc: 'H.P. acreedora por IVA - Modelo 303', tit: 'RESUMEN POR PERIODO Y TIPO DE ASIENTO', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, S) ? 'S' : P2(a, 'PM') ? 'PM' : P2(a, 'RS') ? 'RS' : 'OH'), codes: ['PM', 'RS', 'OH', 'S'],
      cols: [['c', 'PM', 'PM - Pago Modelo 303', 1], ['c', 'RS', 'RS - Reclasificaciones de Saldo'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'S', '{S} - Liquidaciones IVA'],
        ['f', 'T', 'Total movimientos (PM + RS − OH − {S})', (v) => v.PM + v.RS - v.OH - v.S], ['a', 'SC', 'Saldo Cuenta', 'T'],
        ['x', 'M', 'Modelo 303 Presentado', '303pos'], ['f', 'D', 'Diferencia ({S} − Modelo 303)', (v) => (v.M === null ? null : v.S - v.M), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c47511: { cta: '4751.01', desc: 'H.P. acreedora por retenciones - modelo 111', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR RETENCIONES PROFESIONALES Y RDTOS. TRABAJO - MODELO 111', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, 'PN') ? 'PN' : P2(a, 'PP') ? 'PP' : P2(a, S) ? 'S' : P2(a, 'OD') ? 'OD' : P2(a, 'OH') ? 'OH' : P2(a, 'N') ? 'N' : 'OTROS'), codes: ['PN', 'N', 'PP', 'S', 'OD', 'OH', 'OTROS'],
      cols: [['c', 'PN', 'PN - Pago nóminas retenciones', 1], ['c', 'N', 'N - Nóminas retenciones'], ['f', 'D1', 'Diferencia (PN − N)', (v) => v.PN - v.N, true],
        ['c', 'PP', 'PP - Pago retenciones profesionales', 1], ['c', 'S', '{S} - Retenciones profesionales'], ['f', 'D2', 'Diferencia (PP − {S})', (v) => v.PP - v.S, true],
        ['c', 'OD', 'Otros Mov. Debe (OD)'], ['c', 'OH', 'Otros Mov. Haber (OH)'], ['f', 'D3', 'Diferencia (OD − OH)', (v) => v.OD - v.OH],
        ['a', 'TS', 'Total Saldo Cuenta', 'TD'], ['f', 'TD', 'Total diferencias (PN−N + PP−{S} + OD−OH)', (v) => v.D1 + v.D2 + v.D3, true], ['a', 'DA', 'Diferencias Acumuladas', 'TD']] },
    c47512: { cta: '4751.02', desc: 'H.P. acreedora por retenciones - modelo 115', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR RETENCIONES CAPITAL INMOBILIARIO - MODELO 115', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, 'PA') ? 'PA' : P2(a, S) ? 'S' : d ? 'OD' : 'OH'), codes: ['PA', 'S', 'OD', 'OH'],
      cols: [['c', 'PA', 'PA - Pagos Alquiler Retenciones', 1], ['c', 'S', '{S} - Retenciones Alquileres'], ['f', 'D1', 'Diferencia (PA − {S})', (v) => v.PA - v.S, true],
        ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['f', 'D2', 'Diferencia (OD − OH)', (v) => v.OD - v.OH],
        ['a', 'TS', 'Total Saldo Cuenta', 'TD'], ['f', 'TD', 'Total diferencias (PA−{S} + OD−OH)', (v) => v.D1 + v.D2, true], ['a', 'AC', 'Acumulado diferencias', 'TD']] },
    c47514: { cta: '4751.04', desc: 'H.P. acreedora por retenciones - modelo 123', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR RETENCIONES CAPITAL MOBILIARIO - MODELO 123', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, 'PI') ? 'PI' : P2(a, S) ? 'S' : d ? 'OD' : 'OH'), codes: ['PI', 'S', 'OD', 'OH'],
      cols: [['c', 'PI', 'PI - Pago Retenciones Intereses (pagado el mes siguiente)', 1], ['c', 'S', '{S} - Retenciones Intereses Div.'], ['f', 'D1', 'Diferencia (PI − {S})', (v) => v.PI - v.S, true],
        ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['f', 'D2', 'Diferencia (OD − OH)', (v) => v.OD - v.OH],
        ['a', 'TS', 'Total Saldo Cuenta', 'TD'], ['f', 'TD', 'Total diferencias (PI−{S} + OD−OH)', (v) => v.D1 + v.D2, true], ['a', 'AC', 'Acumulado diferencias', 'TD']] },
    c4752: { cta: '4752.01', desc: 'H.P. acreedora por I.S. Mod. 200', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR IS - MODELO 200', per: 'ano',
      tipo: (a, d) => (P2(a, 'PM') ? 'PM' : P2(a, 'I') ? 'I' : d ? 'OD' : 'OH'), codes: ['PM', 'OD', 'OH', 'I'],
      cols: [['c', 'PM', 'PM - Pago I.S. (pagado en el ejercicio siguiente)', 'Y'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'I', 'I - Impuesto Devengado'],
        ['f', 'SE', 'Saldo del ejercicio (PM + OD − OH − I)', (v) => v.PM + v.OD - v.OH - v.I], ['a', 'SA', 'Saldo acumulado', 'SE'],
        ['x', 'M', 'Impuesto Presentado Mod. 200', 'man'], ['f', 'D', 'Diferencia (I − Impuesto Presentado)', (v) => (v.M === null ? null : v.I - v.M), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c4760: { cta: '4760.01', desc: 'Organismos de la Seguridad Social, acreedores', tit: 'RESUMEN MENSUAL ORG SEGURIDAD SOCIAL - TC2 GESTORIA', per: 'mes',
      tipo: (a, d) => (P2(a, 'PS') ? 'PS' : P2(a, 'IT') ? 'IT' : P2(a, 'CB') ? 'CB' : P2(a, 'N') ? 'N' : d ? 'OD' : 'OH'), codes: ['PS', 'OD', 'OH', 'IT', 'CB', 'N'],
      cols: [['c', 'PS', 'PS - Pago Seguridad Social', 1], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'IT', 'IT - Rectificaciones IT'], ['c', 'CB', 'CB - Rectificaciones cursos Bonif.'], ['c', 'N', 'N - Seguridad Social Devengada'],
        ['f', 'SP', 'Saldo del periodo (PS + OD) − (OH + IT + CB + N)', (v) => (v.PS + v.OD) - (v.OH + v.IT + v.CB + v.N)], ['a', 'SC', 'Saldo acumulado', 'SP'],
        ['x', 'G', 'Seguridad Social Gestoría', 'nom:ssTot'], ['f', 'D', 'Diferencia (PS − Seguridad Social Gestoría)', (v) => (v.G === null ? null : v.PS - v.G), true], ['a', 'AC', 'Acumulado diferencias', 'D']] },
    c6400: { cta: '6400.01', desc: 'Sueldos y salarios', tit: 'RESUMEN SALARIOS - NÓMINAS', per: 'mes',
      tipo: (a, d) => { const p = a.split('-')[0]; return p === 'N' || p === 'RTB' ? 'N' : p === 'IT' ? 'IT' : p === 'OD' ? 'OD' : p === 'OH' ? 'OH' : p === 'C' || p[0] === 'I' ? 'C' : d ? 'OD' : 'OH'; }, codes: ['N', 'IT', 'OD', 'OH', 'C'],
      cols: [['c', 'N', 'N - Salarios Nóminas'], ['c', 'IT', 'IT - Bajas'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'C', 'C - Cierre del Ejercicio'],
        ['f', 'SP', 'Saldo del mes (N + IT + OD − OH − C)', (v) => v.N + v.IT + v.OD - v.OH - v.C], ['a', 'SC', 'Saldo Cuenta', 'SP']] },
    c6420: { cta: '6420.01', desc: 'Seguridad Social a cargo de la empresa', tit: 'RESUMEN SEGURIDAD SOCIAL EMPRESA - NÓMINAS', per: 'mes',
      tipo: (a, d) => { const p = a.split('-')[0]; return ['SS', 'R', 'OD', 'OH', 'C'].includes(p) ? p : d ? 'OD' : 'OH'; }, codes: ['SS', 'R', 'OD', 'OH', 'C'],
      cols: [['c', 'SS', 'SS - Seguridad Social Empresa Nóminas'], ['c', 'R', 'R - Regularizaciones'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'C', 'C - Cierre del Ejercicio'],
        ['f', 'SP', 'Saldo del mes (SS + R + OD − OH − C)', (v) => v.SS + v.R + v.OD - v.OH - v.C], ['a', 'SC', 'Saldo Cuenta', 'SP']] },
  };
  // Fertinova: sus cuentas 4751 son propias
  const CTAS_FERTINOVA = {
    c47511: { cta: '4751.01', desc: 'H.P. Acreedora por Retenciones Rdtos. Trabajo Mod. 111', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR RETENCIONES RDTOS. TRABAJO - MODELO 111', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, 'PN') ? 'PN' : P2(a, 'N') ? 'N' : P2(a, S) ? 'N' : d ? 'OD' : 'OH'), codes: ['PN', 'N', 'OD', 'OH'],
      cols: [['c', 'PN', 'PN - Pago nóminas retenciones', 1], ['c', 'N', 'N - Nóminas retenciones'], ['f', 'D1', 'Diferencia (PN − N)', (v) => v.PN - v.N, true],
        ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['f', 'D2', 'Diferencia (OD − OH)', (v) => v.OD - v.OH],
        ['a', 'TS', 'Total Saldo Cuenta', 'TD'], ['f', 'TD', 'Total diferencias (PN−N + OD−OH)', (v) => v.D1 + v.D2, true], ['a', 'DA', 'Diferencias Acumuladas', 'TD']] },
    c47512: { cta: '4751.02', desc: 'H.P. Acreedora por Retenciones Profesionales Mod. 111', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR RETENCIONES PROFESIONALES - MODELO 111', per: 'mes',
      tipo: (a, d, h, S) => (P2(a, 'PP') ? 'PP' : P2(a, S) ? 'S' : d ? 'OD' : 'OH'), codes: ['PP', 'S', 'OD', 'OH'],
      cols: [['c', 'PP', 'PP - Pago retenciones profesionales', 1], ['c', 'S', '{S} - Retenciones profesionales'], ['f', 'D1', 'Diferencia (PP − {S})', (v) => v.PP - v.S, true],
        ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['f', 'D2', 'Diferencia (OD − OH)', (v) => v.OD - v.OH],
        ['a', 'TS', 'Total Saldo Cuenta', 'TD'], ['f', 'TD', 'Total diferencias (PP−{S} + OD−OH)', (v) => v.D1 + v.D2, true], ['a', 'AC', 'Acumulado diferencias', 'TD']] },
  };
  CTAS_FERTINOVA.c47513 = { ...CTAS_BASE.c47512, cta: '4751.03', desc: 'H.P. Acreedora por Retenciones Capital Mobiliario Mod. 115', tit: 'RESUMEN MENSUAL H.P. ACREEDORA POR RETENCIONES - MODELO 115' };
  CTAS_FERTINOVA.c47514 = { ...CTAS_BASE.c47514, desc: 'H.P. Acreedora por Retenciones Capital Mobiliario Mod. 123' };
  const retCta = (n, cod, desc, lbl) => ({ cta: `4730.0${n}`, desc, tit: `RESUMEN POR PERIODO DE ${lbl.toUpperCase()}`, per: 'mes',
    tipo: (a, d) => (P2(a, cod) ? cod : P2(a, 'I') ? 'I' : d ? 'OD' : 'OH'), codes: [cod, 'OD', 'OH', 'I'],
    cols: [['c', cod, `${cod} - ${lbl}`], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'I', 'I - Impto. Devengado'],
      ['f', 'SP', `Saldo del periodo (${cod} + OD − OH − I)`, (v) => v[cod] + v.OD - v.OH - v.I], ['a', 'SC', 'Saldo Cuenta', 'SP']] });
  const CTAS_HER_RET = { c473001: retCta(1, 'RTB', 'H.P. Retenciones Bancarias', 'Retenciones bancarias'), c473002: retCta(2, 'RTC', 'H.P. Retenciones Capital Mobiliario E.G.', 'Retenciones capital mobiliario'),
    c473003: retCta(3, 'RTLM', 'H.P. Retenciones Capital Mobiliario Liquimed', 'Retenciones capital mobiliario Liquimed'), c473004: retCta(4, 'RTA', 'H.P. Retenciones Capital Inmobiliario E.G.', 'Retenciones capital inmobiliario') };
  const CTAS_LYS = { c4745: { cta: '4745.0', desc: 'Créditos por impuestos diferidos - pérdidas', tit: 'RESUMEN ANUAL CRÉDITOS POR IMPUESTOS DIFERIDOS - PÉRDIDAS', per: 'ano',
    tipo: (a, d) => { const p = String(a || '').toUpperCase(); return p.startsWith('CID') ? 'CID' : p.startsWith('RC') ? 'RC' : p.startsWith('OH') ? 'OH' : p.startsWith('OD') ? 'OD' : d ? 'OD' : 'OH'; }, codes: ['CID', 'OD', 'OH', 'RC'],
    cols: [['c', 'CID', 'CID - Créditos Imp. Diferidos'], ['c', 'OD', 'OD - Otros Mov. Debe'], ['c', 'OH', 'OH - Otros Mov. Haber'], ['c', 'RC', 'RC - Reducción Créditos'],
      ['f', 'T', 'Total movimientos (CID + OD − OH − RC)', (v) => v.CID + v.OD - v.OH - v.RC], ['a', 'SC', 'Saldo Cuenta', 'T']] } };
  const TODAS_CTAS = { ...CTAS_BASE, c47513: CTAS_FERTINOVA.c47513, ...CTAS_HER_RET, ...CTAS_LYS };
  // cuentas que tiene cada empresa, en orden
  function ctasEmpresa(e) {
    const cif = e?.cif ?? '', fer = cif === 'B18546614';
    const orden = Object.keys(CTAS_BASE);
    if (fer) orden.splice(orden.indexOf('c47514'), 0, 'c47513');
    if (cif === 'A18341404') orden.splice(orden.indexOf('c4730'), 0, ...Object.keys(CTAS_HER_RET));
    if (cif === 'B18361329' || cif === 'B91428995') orden.splice(orden.indexOf('c4730'), 0, 'c473001', 'c473002');
    if (cif === 'B18765289') orden.splice(orden.indexOf('c4730') + 1, 0, 'c4745');
    return Object.fromEntries(orden.map((k) => [k, CTAS_LYS[k] || CTAS_HER_RET[k] || (fer && CTAS_FERTINOVA[k]) || CTAS_BASE[k]]));
  }
  const ctaDe = (k) => ctasEmpresa(empresa())[k] ?? TODAS_CTAS[k];
  Object.keys(TODAS_CTAS).forEach((k) => { tabs[k] = [`Cuenta ${TODAS_CTAS[k].cta}`, TODAS_CTAS[k].desc, () => vistaCuenta(k), false, () => !!ctasEmpresa(empresa())[k]]; });

  // configuración por empresa: cuenta elegida, tipo de cada asiento, comprobados, saldo del balance, importes a mano y ámbito
  const ctaCfgReg = () => S.registros.find((r) => r.tipo === 'ctacfg' && r.empresa_id === S.sel);
  const ctaCfg = () => ctaCfgReg()?.datos ?? {};
  async function guardarCta(mut) {
    const reg = ctaCfgReg(), datos = JSON.parse(JSON.stringify(reg?.datos ?? {}));
    mut(datos);
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'ctacfg', ejercicio: null, datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  const setIn = (o, ...ruta) => { const v = ruta.pop(), k = ruta.pop(); let c = o; ruta.forEach((r) => { c = c[r] ??= {}; }); if (v === '' || v == null) delete c[k]; else c[k] = v; };
  function accionCta(tipo, id, valor) {
    const [a, b] = id.split('§');
    if (tipo === 'pref') return guardarCta((d) => setIn(d, 'pref', a, valor.trim() === ctaDe(a)?.cta ? '' : valor.trim()));
    if (tipo === 'ambito') return guardarCta((d) => setIn(d, 'ambito', a, valor === 'todo' ? '' : valor));
    if (tipo === 'balance') return guardarCta((d) => setIn(d, 'balance', a, valor.trim() === '' ? '' : parseES(valor)));
    if (tipo === 'manual') return guardarCta((d) => setIn(d, 'manual', a, b, valor.trim() === '' ? '' : parseES(valor)));
    if (tipo === 'comp') return guardarCta((d) => setIn(d, 'comp', a, valor));
    if (tipo === 'clase') return guardarCta((d) => setIn(d, 'clases', id, valor));
    if (tipo === 'compvis') return guardarCta((d) => { (ctaVis ?? []).forEach((f) => setIn(d, 'comp', f, 'Sí')); });
    if (tipo === 'ov') {
      const v = b === 'fecha' ? fIsoCta(valor) : b === 'debe' || b === 'haber' ? (valor.trim() === '' ? 0 : parseES(valor)) : valor.trim();
      if (b === 'fecha' && !v) return void alert('Fecha no válida: escríbela como dd/mm/aaaa.');
      return guardarCta((d) => { if (a.startsWith('m:')) { const l = (d.lineas ?? []).find((x) => `m:${x.id}` === a); if (l) l[b] = v; } else ((d.ov ??= {})[a] ??= {})[b] = v; });
    }
    if (tipo === 'quit') return guardarCta((d) => { if (id.startsWith('m:')) d.lineas = (d.lineas ?? []).filter((x) => `m:${x.id}` !== id); else (d.quit ??= {})[id] = 1; });
    if (tipo === 'nv') { ctaNueva = { ...(ctaNueva ?? {}), [id]: valor }; return undefined; }
    if (tipo === 'vertp') { ctaVerTp = valor === '1'; return render(); }
    if (tipo === 'filtro') { ctaFil.comp = valor; ctaMas = 300; return render(); }
    if (tipo === 'buscar') { ctaFil.q = valor; ctaMas = 300; return render(); }
    return undefined;
  }
  let ctaFil = { comp: 'todos', q: '' }, ctaMas = 300, ctaVis = [], ctaVerTp = false, ctaNueva = null, ctaUlt = { fecha: '', cuenta: '' }; // las columnas Tipo y Periodo van ocultas hasta que se pidan
  const fIsoCta = (s) => { const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(s).trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()) ? String(s).trim() : ''; };
  function ctaNvOk() {
    const N = ctaNueva ?? {}, f = fIsoCta(N.fecha ?? ''), cuenta = (N.cuenta ?? '').trim(), debe = parseES(N.debe), haber = parseES(N.haber);
    if (!f || !cuenta || (!debe && !haber)) return void alert('Rellena la fecha (dd/mm/aaaa), la cuenta y un importe en debe o en haber.');
    ctaNueva = null;
    return guardarCta((d) => { (d.lineas ??= []).push({ id: crypto.randomUUID(), fecha: f, cuenta, asiento: (N.asiento ?? '').trim(), desc: (N.desc ?? '').trim(), debe, haber }); });
  }
  const ctaPref = (k) => ctaCfg().pref?.[k] || ctaDe(k).cta;

  // periodos
  const perDe = (T, d) => { const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    return T === 'ano' ? String(y) : T === 'p202' ? `${y}-${m <= 4 ? '1P' : m <= 10 ? '2P' : '3P'}` : T === 'tri' ? `${y}-${Math.ceil(m / 3)}T` : `${y}-${String(m).padStart(2, '0')}`; };
  const rangoDe = (T, key) => {
    if (T === 'ano') { const y = +key; return [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)]; }
    const y = +key.slice(0, 4);
    if (T === 'p202') { const p = key.slice(5); return p === '1P' ? [Date.UTC(y, 0, 1), Date.UTC(y, 4, 1)] : p === '2P' ? [Date.UTC(y, 4, 1), Date.UTC(y, 10, 1)] : [Date.UTC(y, 10, 1), Date.UTC(y + 1, 0, 1)]; }
    if (T === 'tri') { const q = +key[5]; return [Date.UTC(y, (q - 1) * 3, 1), Date.UTC(y, q * 3, 1)]; }
    const m = +key.slice(5); return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)];
  };
  const perAnterior = (T, key) => {
    if (T === 'ano') return String(+key - 1);
    const y = +key.slice(0, 4);
    if (T === 'p202') { const p = key.slice(5); return p === '1P' ? `${y - 1}-3P` : p === '2P' ? `${y}-1P` : `${y}-2P`; }
    if (T === 'tri') { const q = +key[5]; return q === 1 ? `${y - 1}-4T` : `${y}-${q - 1}T`; }
    const m = +key.slice(5); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  };
  const etiquetaPer = (T, key) => (T === 'ano' ? key : `${key.slice(5)}-${key.slice(0, 4)}`);
  const fdate = (ms) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

  function calcCuenta(k, M) {
    const C = ctaDe(k), e = empresa(), cfg = ctaCfg(), ej = Number(S.ejercicio), pref = ctaPref(k), sigla = e?.siglas ?? '';
    const firma = (l) => [l.cuenta, l.fecha, l.asiento, l.debe, l.haber, l.desc].join('|');
    const quit = cfg.quit ?? {}, ovs = cfg.ov ?? {};
    const originales = M.map((l) => ({ ...l, firma: firma(l) })).filter((l) => !quit[l.firma]).map((l) => { const o = ovs[l.firma]; return o ? { ...l, ...o, digitos: l.digitos, editado: Object.keys(o) } : l; });
    const manuales = (cfg.lineas ?? []).map((l) => ({ fecha: l.fecha, cuenta: l.cuenta, digitos: String(l.cuenta).replace(/\D/g, ''), debe: +l.debe || 0, haber: +l.haber || 0, asiento: l.asiento || '', desc: l.desc || '', firma: `m:${l.id}`, manual: true }));
    const todos = [...originales, ...manuales].filter((l) => casaCta(pref, l.digitos)).map((l) => ({ ...l, ms: Date.parse(l.fecha) }))
      .sort((a, b) => a.ms - b.ms || String(a.asiento).localeCompare(String(b.asiento)));
    todos.forEach((l) => { l._tipo = cfg.clases?.[`${k}§${l.firma}`] ?? C.tipo(String(l.asiento || '').trim().toUpperCase(), !!l.debe, !!l.haber, sigla); });
    const ambito = cfg.ambito?.[k] || 'todo';
    const ini = ambito === 'todo' ? -8.64e15 : Date.UTC(ej, 0, 1), fin = ambito === 'todo' ? 8.64e15 : Date.UTC(ej + 1, 0, 1);
    const saldoIni = rr(todos.filter((l) => l.ms < ini).reduce((s, l) => s + l.debe - l.haber, 0));
    let acc = saldoIni;
    const movs = todos.filter((l) => l.ms >= ini && l.ms < fin).map((l) => { acc = rr(acc + l.debe - l.haber); return { l, saldo: acc, comp: cfg.comp?.[l.firma] || '', tipo: l._tipo }; });
    const tD = rr(movs.reduce((s, x) => s + x.l.debe, 0)), tH = rr(movs.reduce((s, x) => s + x.l.haber, 0));
    const si = movs.filter((x) => x.comp === 'Sí'), no = movs.filter((x) => x.comp === 'No');
    const impComp = rr(si.reduce((s, x) => s + x.l.debe + x.l.haber, 0)), saldoFin = rr(saldoIni + tD - tH);
    const bal = cfg.balance?.[`${k}-${ej}`];
    const ctl = { n: movs.length, comp: si.length, exc: no.length, pend: movs.length - si.length - no.length, impComp, cobertura: tD + tH ? impComp / (tD + tH) : 0, saldoIni, tD, tH, neto: rr(tD - tH), saldoFin, balance: bal === undefined ? null : +bal };
    ctl.dif = rr(saldoFin - (ctl.balance || 0)); ctl.estado = Math.abs(ctl.dif) < 0.005 ? 'CUADRA' : 'REVISAR DIFERENCIA';
    // ---- resumen por periodo ----
    const T = e?.tipo === 'PYME' && C.per === 'mes' && ['c4700', 'c4750', 'c47511', 'c47512', 'c47513', 'c47514'].includes(k) ? 'tri' : C.per, keys = new Set();
    const shiftCodes = new Set(C.cols.filter((c) => c[0] === 'c' && c[3]).map((c) => c[1]));
    todos.forEach((l) => { const p = perDe(T, new Date(l.ms)); keys.add(p); if (shiftCodes.has(l._tipo)) keys.add(perAnterior(T, p)); });
    const extNom = C.cols.find((c) => c[0] === 'x' && String(c[3]).startsWith('nom:'));
    if (extNom && todos.length) {
      const lo = perDe(T, new Date(todos[0].ms)), hi = perDe(T, new Date(todos[todos.length - 1].ms));
      for (let y = +lo.slice(0, 4); y <= +hi.slice(0, 4); y++) MM12.forEach((mm) => { const ym = `${y}-${mm}`; if (ym >= lo && ym <= hi && nomMes(y, mm)) keys.add(ym); });
    }
    const suma = (code, t0, t1) => rr(todos.filter((l) => l._tipo === code && l.ms >= t0 && l.ms < t1).reduce((s, l) => s + l.debe + l.haber, 0));
    const man = cfg.manual?.[k] ?? {}, acum = {}, filas = [], od = {};
    [...keys].sort().forEach((key) => {
      const [t0, t1] = rangoDe(T, key), v = {}, fuente = {};
      C.cols.forEach(([t, c, lab, x]) => {
        if (t === 'c') {
          if (!x) v[c] = suma(c, t0, t1);
          else if (x === 1) { const d = new Date(T === 'tri' ? t1 - 1 : t0); v[c] = suma(c, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 1)); }
          else if (x === 'Y') { const y = new Date(t0).getUTCFullYear(); v[c] = suma(c, Date.UTC(y + 1, 0, 1), Date.UTC(y + 2, 0, 1)); }
          else if (x === 'DY') { const d = new Date(t0); v[c] = d.getUTCMonth() === 11 ? suma(c, Date.UTC(d.getUTCFullYear() + 1, 0, 1), Date.UTC(d.getUTCFullYear() + 2, 0, 1)) : 0; }
        } else if (t === 's') v[c] = rr(todos.filter((l) => l.ms < t1).reduce((s, l) => s + l.debe - l.haber, 0));
        else if (t === 'x') {
          let val = null, src = '';
          if (String(x).startsWith('nom:')) { const n = nomMes(+key.slice(0, 4), key.slice(5)); if (n) { val = rr(Number(n[x.slice(4)]) || 0); src = 'nom'; } }
          const y = +key.slice(0, 4), esT = T === 'tri';
          const kPres = esT ? key.slice(5) : T === 'mes' && e?.tipo === 'PYME' ? (+key.slice(5) % 3 === 0 ? `${+key.slice(5) / 3}T` : null) : key.slice(5);
          if (kPres === null && (x === '303neg' || x === '303pos')) { v[c] = null; fuente[c] = 'nodecl'; return; }
          const pv = x === '303neg' || x === '303pos' ? prsVal(y, '303', kPres, 'liq')
            : x === 'man' && (k === 'c4709' || k === 'c4752') ? prsVal(y + 1, '200', 'A', 'res') // el 200 del ejercicio y se presenta (y se guarda) en el año siguiente
              : x === 'man' && k === 'c4730' ? prsVal(y, '202', key.slice(5), 'res') : undefined;
          if (x === '303neg' && pv !== undefined && pv < 0) {
            const ult = esT ? /-4T$/.test(key) : /-12$/.test(key), c87 = prsVal(y, '303', kPres, 'c87');
            if (ult && ((v.DEV || 0) > 0.005 || !(c87 > 0.005))) v._devolver = true;
          }
          if (pv !== undefined) { val = x === '303neg' || k === 'c4709' ? rr(Math.max(0, -pv)) : x === '303pos' || k === 'c4752' ? rr(Math.max(0, pv)) : rr(pv); src = 'pres'; }
          else if (!String(x).startsWith('nom:')) src = 'sinpres';
          if (src !== 'nom' && src !== 'pres' && man[key] !== undefined && man[key] !== '') { val = +man[key]; src = 'man'; } // a mano solo si no hay dato de nóminas o presentados
          v[c] = val; fuente[c] = src || 'vacio';
        }
      });
      C.cols.forEach(([t, c, lab, f]) => { if (t === 'f') { const r = f(v); v[c] = r === null ? null : rr(r); } });
      C.cols.forEach(([t, c, lab, de]) => { if (t === 'a') { if (v[de] !== null && v[de] !== undefined) acum[c] = rr((acum[c] || 0) + v[de]); v[c] = v[de] === null ? null : (acum[c] || 0); } });
      filas.push({ key, lbl: etiquetaPer(T, key), v, fuente, y: key.slice(0, 4) });
    });
    const avisos = [];
    if (!M.length) avisos.push('Falta el extracto contable: suéltalo en la franja de arriba.');
    else if (!todos.length) avisos.push(`El extracto no tiene movimientos de la cuenta ${pref}. Cambia la cuenta en el recuadro «Cuenta contable».`);
    if (!sigla) avisos.push('Falta la sigla de la empresa (pestaña Empresas): es la que usan los asientos de liquidación.');
    if (extNom) avisos.push(`La columna «${C.cols.find((c) => c[0] === 'x' && String(c[3]).startsWith('nom:'))[2]}» trae el total del mes de la pestaña Nóminas.`);
    if (C.cols.some((c) => c[0] === 'x' && !String(c[3]).startsWith('nom:'))) avisos.push('La columna del impuesto presentado se trae de «Impuestos Presentados», del mismo periodo. Donde pone «sin presentar» falta ese dato (o se puede escribir a mano).');
    if (C.cols.some((c) => c[0] === 'c' && c[3])) avisos.push('Las columnas marcadas como pagadas el periodo siguiente suman los pagos del mes (o ejercicio) posterior.');
    avisos.push('El tipo de cada movimiento se deduce del asiento; se puede cambiar en la tabla.');
    return { k, C, T, ej, pref, ambito, movs, ctl, filas, avisos, subcuentas: [...new Set(todos.map((l) => l.cuenta))].sort(),
      desde: ambito === 'todo' ? (movs.length ? fdate(movs[0].l.ms) : '-') : `01/01/${ej}`, hasta: ambito === 'todo' ? (movs.length ? fdate(movs[movs.length - 1].l.ms) : '-') : `31/12/${ej}` };
  }

  function vistaCuenta(k) {
    if (!S.sel) return sinEmpresa;
    const M = grande('may-mov');
    if (!M) return cargandoTxt;
    if (!ctaDe(k)) return '<p class="vacio">Esta cuenta no aplica a la empresa elegida.</p>';
    const D = calcCuenta(k, M), C = D.C, c = D.ctl, e = empresa(), ed = puede(), sigla = e?.siglas ?? '';
    const lblS = (t) => String(t).replace(/\{S\}/g, sigla);
    const z = (v) => (v === null || v === undefined || Math.abs(v) < 0.005 ? '-' : fnum(v));
    let movs = D.movs;
    if (ctaFil.comp === 'pend') movs = movs.filter((x) => !x.comp); else if (ctaFil.comp === 'Sí' || ctaFil.comp === 'No') movs = movs.filter((x) => x.comp === ctaFil.comp);
    if (ctaFil.q) { const q = sinAc(ctaFil.q); movs = movs.filter((x) => sinAc(`${fdate(x.l.ms)} ${x.l.asiento} ${x.l.desc} ${x.l.debe} ${x.l.haber} ${x.tipo}`).includes(q)); }
    ctaVis = movs.map((x) => x.l.firma);
    const opts = (t) => C.codes.map((cc) => `<option value="${cc}"${t === cc ? ' selected' : ''}>${esc(cc === 'S' ? sigla : cc)}</option>`).join('');
    const vis = movs.slice(0, ctaMas);
    ctaUlt = { fecha: movs.length ? fdate(movs[movs.length - 1].l.ms) : fdate(Date.now()), cuenta: D.subcuentas[0] || D.pref };
    // cada campo del extracto es editable (se guarda como corrección sobre el apunte original); los apuntes a mano también
    const cel = (x, campo, v, cls = '') => (ed ? `<td class="in ${cls}"><input class="${(x.l.editado ?? []).includes(campo) ? 'ed' : ''}" data-cta="ov" data-id="${esc(x.l.firma)}§${campo}" value="${esc(v)}"></td>` : `<td class="${cls}">${esc(v)}</td>`);
    const filas = vis.map((x) => `<tr class="${x.comp === 'No' ? 'cf-ko' : x.comp === 'Sí' ? 'cf-ok' : ''}${x.l.manual ? ' manual' : ''}">${cel(x, 'fecha', fdate(x.l.ms), 'c')}${cel(x, 'asiento', x.l.asiento, 'tl')}${cel(x, 'desc', x.l.desc, 'tl cto')}
      ${cel(x, 'debe', x.l.debe ? fnum(x.l.debe) : '', 'num')}${cel(x, 'haber', x.l.haber ? fnum(x.l.haber) : '', 'num')}<td class="num" style="color:${x.saldo < 0 ? '#a32b2b' : 'inherit'}">${fnum(x.saldo)}</td>
      <td class="c">${ed ? `<select data-cta="comp" data-id="${esc(x.l.firma)}"><option value=""></option><option${x.comp === 'Sí' ? ' selected' : ''}>Sí</option><option${x.comp === 'No' ? ' selected' : ''}>No</option></select>` : esc(x.comp)}</td>
      <td class="c">${ed ? `<button class="small" data-act="m-ctaquit" data-id="${esc(x.l.firma)}" title="Quitar este apunte de la cuenta${x.l.manual ? ' (línea a mano)' : ''}">✖</button>` : ''}</td></tr>`).join('');
    const nv = ctaNueva ? (() => { const ni = (c, ph, cls = '') => `<td class="in ${cls}"><input data-cta="nv" data-id="${c}" value="${esc(ctaNueva[c] ?? '')}" placeholder="${ph}"></td>`;
      return `<tr class="nueva">${ni('fecha', 'dd/mm/aaaa', 'c')}${ni('asiento', 'asiento', 'tl')}<td class="in tl cto"><input data-cta="nv" data-id="desc" value="${esc(ctaNueva.desc ?? '')}" placeholder="concepto"></td>${ni('debe', 'debe', 'num')}${ni('haber', 'haber', 'num')}${ni('cuenta', 'cuenta', 'tl')}
        <td class="c" colspan="2"><button class="small" data-act="m-ctanvok">Registrar</button> <button class="small" data-act="m-ctanvx">Cancelar</button></td></tr>`; })() : '';
    const nCom = c.comp || 0, nPen = c.pend || 0, nExc = c.exc || 0, cobPct = Math.round((c.cobertura || 0) * 1000) / 10, circ = 2 * Math.PI * 26, arco = Math.max(0, Math.min(1, c.cobertura || 0)) * circ;
    const kp = (tit, val, col, extra = '') => `<div class="xc-k" style="border-top-color:${col}"><div class="xc-kt">${tit}</div><div class="xc-kv">${val}</div>${extra}</div>`;
    const banner = `<div class="xc-cab"><div class="xc-glow"></div>
      <div class="xc-ruta"><span class="xc-p">5. Cuentas contables</span><span class="xc-s">›</span><span class="xc-pa">Extracto · ${esc(D.pref)}</span><span class="xc-emp">${esc(e.nombre)} <span>· ${esc(e.cif)}</span></span></div>
      <div class="xc-fila"><div class="xc-izq"><div class="xc-tit">Extracto de cuenta contable</div><div class="xc-sub">Formato auditoría · papel de trabajo: movimientos, saldo acumulado y controles de revisión</div>
        <div class="xc-sel"><span class="xc-cta"><input class="xc-pref" data-cta="pref" data-id="${k}" value="${esc(D.pref)}" aria-label="Cuenta"${ed ? '' : ' disabled'}><span class="xc-desc">${esc(C.desc)}</span></span>
          <span class="xc-p">Ejercicio <b>${D.ej}</b></span>
          <span class="xc-p">Periodo <select data-cta="ambito" data-id="${k}"><option value="todo"${D.ambito === 'todo' ? ' selected' : ''}>Todo el extracto</option><option value="ej"${D.ambito !== 'todo' ? ' selected' : ''}>Año completo ${D.ej}</option></select></span>
          <span class="xc-p">Saldo según balance <input class="xc-balin" type="text" inputmode="decimal" data-cta="balance" data-id="${k}-${D.ej}" value="${c.balance === null ? '' : fnum(c.balance)}" placeholder="-"${ed ? '' : ' disabled'}></span></div>
        <div class="xc-per">Periodo del extracto: <b>${D.desde}</b> → <b>${D.hasta}</b> <span class="xc-sc">${esc(D.subcuentas.join(', ') || 'sin movimientos')}</span></div></div>
        <div class="xc-rev"><svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Cobertura de la revisión ${cobPct} por ciento"><title>Cobertura de la revisión</title><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="#7be0b4" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arco.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" fill="#fff" font-size="13" font-weight="600">${cobPct} %</text></svg>
          <div class="xc-rt"><b>Revisión</b><div>${nCom} de ${c.n} comprobadas</div><div>${nPen} pendientes</div><div>${nExc} con excepción</div></div></div></div>
      <div class="xc-kg">${kp('Saldo inicial', z(c.saldoIni), '#98a2b3')}${kp('Total debe', `<span style="color:#1d4ed8">${z(c.tD)}</span>`, '#2f6df0')}${kp('Total haber', `<span style="color:#5b3fd0">${z(c.tH)}</span>`, '#7a5af8')}
        ${kp('Saldo final calculado', `<span style="color:#17703a">${z(c.saldoFin)}</span>`, '#19b36b')}${kp('Frente al balance', `<span style="color:${c.estado === 'CUADRA' ? '#17703a' : '#a32b2b'}">${fnum(c.dif)}</span>`, c.estado === 'CUADRA' ? '#19b36b' : '#e0334c',
          `<span class="xc-est ${c.estado === 'CUADRA' ? 'ok' : 'ko'}">${c.estado === 'CUADRA' ? 'Cuadra' : 'Revisar diferencia'}</span>`)}</div></div>`;
    // resumen por periodo
    const cols = C.cols, xc = (cc) => (cc[0] === 'f' || cc[1] === 'DA' ? ' xdif' : '');
    const celda = (cc, fila) => {
      const [t, cn] = cc, v = fila.v[cn], f = fila.fuente[cn];
      if (t === 'x' && f === 'nodecl') return '<td class="num vacio" title="Sin declaración en este mes (se presenta por trimestres)">-</td>';
      if (t === 'x' && (f === 'sinpres' || f === 'vacio')) return ed ? `<td class="in"><input data-cta="manual" data-id="${k}§${fila.key}" value="" placeholder="sin presentar" title="No hay importe de este periodo en Impuestos Presentados: escríbelo a mano o rellénalo allí"></td>` : '<td class="num vacio">sin presentar</td>';
      if (t === 'x' && f === 'nom') return `<td class="num pdfok" title="Total del mes en la pestaña Nóminas">${fnum(v)}</td>`;
      if (t === 'x' && f === 'pres') return `<td class="num pdfok" title="De Impuestos Presentados">${fnum(v)}</td>`;
      if (t === 'x' && f === 'man') return `<td class="in"><input data-cta="manual" data-id="${k}§${fila.key}" value="${fnum(v)}"></td>`;
      const dif = t === 'f' && cc[4];
      return `<td class="num${dif && v !== null && Math.abs(v) > 0.01 ? ' dif-ko' : ''}${xc(cc)}">${v === null || v === undefined ? '-' : (t === 'f' || t === 'a' ? fnum(v) : z(v))}</td>`;
    };
    const anos = [...new Set(D.filas.map((x) => x.y))];
    const cuerpo = anos.map((y) => {
      const rs = D.filas.filter((x) => x.y === y);
      const tr = rs.map((x) => `<tr><td class="pp">${esc(x.lbl)}</td>${cols.map((cc) => celda(cc, x)).join('')}</tr>`).join('');
      if (C.per === 'ano') return tr;
      return `${tr}<tr class="ttot"><td class="pp">TOTAL ${y}</td>${cols.map(([tt, cn]) => `<td class="num">${tt === 'c' || tt === 'x' ? z(rr(rs.reduce((s, f) => s + (f.v[cn] || 0), 0))) : ''}</td>`).join('')}</tr>`;
    }).join('');
    const resumen = `<div class="css-4760-t">${esc(lblS(D.T === 'tri' ? C.tit.replace('MENSUAL', 'TRIMESTRAL') : C.tit))}</div>
      <div class="wrap"><table class="tprs tnom res" style="--ncol:${cols.length}"><thead><tr><th class="pp">${C.per === 'ano' ? 'Ejercicio' : 'Periodo'}</th>${cols.map((cc) => `<th class="${xc(cc).trim()}">${esc(lblS(cc[2]))}</th>`).join('')}</tr></thead>
      <tbody>${cuerpo || `<tr><td colspan="${cols.length + 1}" class="vacio">Sin movimientos</td></tr>`}</tbody></table></div>`;
    const av = D.avisos.map((a) => `<p>⚠ ${esc(a)}</p>`).join('');
    return `${dz('extractos', 'Suelta aquí el extracto contable (mayor)', '(Excel de la cuenta o de varias cuentas) o pulsa para elegirlo')}
      ${banner}
      <section class="prs-card ctas"><div class="css-flex"><div class="mov-wrap">
        <div class="fc-cab" style="margin:0 0 .5rem"><label>Comprobado <select data-cta="filtro" data-id="x"><option value="todos">Todas</option><option value="pend"${ctaFil.comp === 'pend' ? ' selected' : ''}>Pendientes</option><option${ctaFil.comp === 'Sí' ? ' selected' : ''}>Sí</option><option${ctaFil.comp === 'No' ? ' selected' : ''}>No</option></select></label>
        <input type="search" data-cta="buscar" data-id="x" placeholder="Buscar concepto, asiento, fecha, importe, tipo…" value="${esc(ctaFil.q)}" size="34">
        ${ed ? `<button class="small" data-act="m-ctavis">Marcar visibles como comprobadas</button> <button class="small" data-act="m-ctanv">＋ Añadir línea</button>` : ''}</div>
        <div class="wrap"><table class="tprs tnom mov"><thead><tr><th>Fecha</th><th>Asiento</th><th>Concepto</th><th>Debe</th><th>Haber</th><th>Saldo acumulado</th><th title="Comprobado">C</th><th title="Eliminar apunte">E</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="8" class="vacio">Sin movimientos</td></tr>'}${nv}</tbody></table></div>
        ${movs.length > vis.length ? `<button class="small" data-act="m-ctamas" style="margin-top:.5rem">Ver más (${vis.length} de ${movs.length})</button>` : ''}</div>
        <div class="res-wrap">${resumen}</div></div></section>
      ${av ? `<div class="aviso">${av}</div>` : ''}`;
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

  // ---- Conciliación Seguridad Social: pagos (asientos PS de la 4760.01) frente a la SS de las nóminas del mes anterior, IT y cursos FUNDAE ----
  const casaCta = (pref, dig) => {
    const m = /^(\d+)[.,](\d+)$/.exec(pref);
    if (m) { const sub = m[2].replace(/^0+/, '') || '0'; return new RegExp(`^${m[1]}0*${sub}$`).test(dig) || new RegExp(`^${m[1]}${m[2]}0*$`).test(dig); }
    return dig.startsWith(String(pref).replace(/\D/g, ''));
  };
  const cssCta = () => { try { return localStorage.getItem('cssCta') || '4760.01'; } catch { return '4760.01'; } };
  const setCssCta = (v) => { try { localStorage.setItem('cssCta', String(v).trim() || '4760.01'); } catch { /* sin almacenamiento */ } render(); };
  const ymDe = (f) => f.slice(0, 7);
  const sumMes = (f, d) => { const [y, m] = f.slice(0, 7).split('-').map(Number); const t = y * 12 + (m - 1) + d; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

  // FUNDAE: un registro «fundae» por empresa y ejercicio; costes y grupos se unen por AAFF/grupo
  const fundaeReg = (y) => S.registros.find((r) => r.tipo === 'fundae' && r.empresa_id === S.sel && r.ejercicio === y);
  const fundaeFecha = (s) => { const m = String(s ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
  function fundaeMes(ej) {
    const M = {}, sin = [];
    S.registros.filter((r) => r.tipo === 'fundae' && r.empresa_id === S.sel).forEach((r) => {
      Object.entries(r.datos.costes ?? {}).forEach(([k, c]) => {
        const g = r.datos.grupos?.[k], fin = g && fundaeFecha(g.fin);
        if (!fin) { if (r.ejercicio === ej) sin.push({ k, den: c.den, coste: c.coste }); return; }
        if (+fin.slice(0, 4) !== ej) return;
        (M[fin.slice(0, 7)] ??= []).push({ k, den: c.den || g.den, coste: c.coste, fin: g.fin });
      });
    });
    return { M, sin };
  }
  async function cargarFundae(files) {
    if (!S.sel) return void alert('Elige primero la empresa en el desplegable de la izquierda.');
    const ok = [], mal = [], lote = [];
    for (const f of files) {
      try {
        let filas = [], anio = null, nif = null;
        if (/\.pdf$/i.test(f.name)) {
          const { texto } = await leerPdf(f);
          filas = texto.split('\n').filter((l) => !/^--- página/.test(l)).map((l) => [l]);
          anio = Number((texto.match(/A[ñn]o:\s*(\d{4})/) || [])[1]) || null;
          nif = (texto.match(/NIF empresa:\s*([A-Z0-9]{9})/i) || [])[1] || null;
        } else {
          const rows = await filasExcel(f);
          rows.forEach((r) => { if (r && /^NIF:?$/i.test(String(r[0] ?? '').trim())) { const v = r.slice(1).find((x) => x && String(x).trim()); if (v) nif = String(v).trim(); } });
          const hr = rows.findIndex((r) => r && r.some((v) => /C[oó]digo|Id Grupo|AAFF/i.test(String(v ?? ''))));
          if (hr >= 0) {
            const H = rows[hr].map((v) => String(v ?? '').trim()), ix = (re) => H.findIndex((h) => re.test(h));
            const iC = ix(/^C[oó]digo/i), iD = ix(/^Denominaci/i), iCo = ix(/Coste/i), iId = ix(/Id Grupo/i), iA = ix(/^AAFF/i), iG = ix(/^Grupo$/i), iI = ix(/inicio/i), iF = ix(/^(Fecha )?fin/i);
            const fd = (v) => { const d = typeof v === 'number' ? new Date(Date.UTC(1899, 11, 30) + v * 86400000) : null; return d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : String(v ?? ''); };
            rows.slice(hr + 1).forEach((r) => {
              if (!r) return;
              if (iCo >= 0 && iC >= 0) { if (!r[iC]) return; filas.push(['GRUPO', String(r[iC]).replace(/\s+/g, ''), String(r[iD] ?? '-').trim() || '-', fnum(typeof r[iCo] === 'number' ? r[iCo] : parseES(r[iCo]))]); }
              else if (iA >= 0 && iG >= 0 && iF >= 0) { if (r[iA] == null || r[iA] === '') return; filas.push([String(r[iId] != null ? Math.round(+r[iId]) || r[iId] : '0000').padStart(4, '0'), String(r[iA]).trim(), String(r[iG]).trim(), String(r[iD] ?? '-').trim() || '-', fd(r[iI]), fd(r[iF]), String(r[H.length - 1] ?? '').trim()]); }
            });
          }
        }
        if (nif && empresa()?.cif && nif.toUpperCase() !== empresa().cif.toUpperCase()) { mal.push(`${f.name} (es del NIF ${nif}, no de la empresa elegida)`); continue; }
        const R = fundaeFilas(filas, anio), nC = Object.keys(R.costes).length, nG = Object.keys(R.grupos).length;
        if (!nC && !nG) { mal.push(f.name); continue; }
        const g = Object.values(R.grupos)[0], dg = g && fundaeFecha(g.fin);
        lote.push({ f, R, nC, nG, y: anio || (dg ? +dg.slice(0, 4) : null) });
      } catch (e) { mal.push(`${f.name} (${e.message})`); }
    }
    const yLote = (lote.find((x) => x.y) || {}).y || Number(S.ejercicio);
    for (const { f, R, nC, nG, y } of lote) {
      const yy = y || yLote, reg = fundaeReg(yy), d = JSON.parse(JSON.stringify(reg?.datos ?? { costes: {}, grupos: {} }));
      Object.assign(d.costes ??= {}, R.costes); Object.assign(d.grupos ??= {}, R.grupos);
      const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'fundae', ejercicio: yy, datos: d });
      if (err) { mal.push(`${f.name} (${err})`); continue; }
      await cargar();
      ok.push(`${f.name} (${yy}: ${nC ? `${nC} costes` : ''}${nC && nG ? ', ' : ''}${nG ? `${nG} grupos` : ''})`);
    }
    render();
    alert(`FUNDAE: ${ok.length ? ok.join('; ') : 'nada nuevo'}${mal.length ? `\nNo reconocidos: ${mal.join(', ')}` : ''}`);
  }
  async function quitarFundae(y) {
    if (!confirm(`¿Quitar los datos de FUNDAE de ${y}?`)) return;
    const reg = fundaeReg(Number(y));
    if (reg) { const { error } = await db.from('registros').delete().eq('id', reg.id); if (error) return void alert(error.message); }
    await cargar(); render();
  }
  async function ingestaMayor(f, empresaId) {
    const filas = await filasExcel(f);
    const mv = leerMayor(filas);
    if (!mv) return `❔ ${f.name}: guardado, pero no reconozco el extracto (hacen falta fecha, cuenta, debe y haber)`;
    const n = await guardarGrande('may-mov', empresaId, mv.map((l) => ({ ...l, src: f.name })), (l) => `${l.cuenta}|${l.fecha}|${l.asiento}|${l.debe}|${l.haber}|${l.desc}#${l.n}`);
    return `✔ ${f.name}: extracto contable · ${mv.length} movimientos leídos (${n} en total)`;
  }

  // resumen mensual de una cuenta del mayor, con el saldo de ejercicios anteriores; tipo(asiento, esDebe) → columna
  function resumenCtaCss(titulo, cta, cols, tipo, sp, ej, M, desplazaPS, etqPrev, etq) {
    const nuevo = () => Object.fromEntries(cols.map((c) => [c, 0]));
    const mes = {}, P = nuevo(); let hay = false;
    (M ?? []).forEach((l) => {
      if (!casaCta(cta, l.digitos)) return;
      hay = true;
      let t = tipo(String(l.asiento || '').trim().toUpperCase(), !!l.debe);
      if (!cols.includes(t)) t = l.debe ? 'OD' : 'OH';
      const ym = desplazaPS && t === 'PS' ? sumMes(l.fecha, -1) : ymDe(l.fecha), y = +ym.slice(0, 4), imp = (+l.debe || 0) + (+l.haber || 0);
      if (y < ej) { P[t] += imp; return; }
      if (y > ej) return;
      (mes[+ym.slice(5)] ??= nuevo())[t] += imp;
    });
    const z = (v) => (Math.abs(v) < 0.005 ? '-' : fnum(rr(v)));
    let sal = rr(sp(P));
    const T = nuevo(); let tsp = 0;
    const fil = MESES.map((mn, i) => { const v = mes[i + 1] ?? nuevo(), s = rr(sp(v)); sal = rr(sal + s); cols.forEach((c) => (T[c] += v[c])); tsp += s;
      return `<tr><td>${mn.toUpperCase()}</td>${cols.map((c) => `<td class="num">${z(v[c])}</td>`).join('')}<td class="num">${z(s)}</td><td class="num"><b>${fnum(sal)}</b></td></tr>`; }).join('');
    return `<div class="css-4760"><div class="css-4760-t">RESUMEN CUENTA ${esc(cta)} · ${ej}${hay ? '' : ' <span class="hint">(sin movimientos: suelta el extracto contable)</span>'}</div>
      <table class="tprs tnom"><thead><tr><th class="pp">Mes</th>${cols.map((c) => `<th title="${esc(etq[c] ?? c)}">${c}</th>`).join('')}<th>Saldo del mes</th><th>Saldo cuenta</th></tr></thead><tbody>
      <tr class="cmp"><td colspan="${cols.length + 2}">${etqPrev}</td><td class="num"><b>${fnum(rr(sp(P)))}</b></td></tr>${fil}
      <tr class="ttot"><td>TOTAL ${ej}</td>${cols.map((c) => `<td class="num">${fnum(rr(T[c]))}</td>`).join('')}<td class="num">${fnum(rr(tsp))}</td><td class="num">${fnum(sal)}</td></tr></tbody></table></div>`;
  }

  function vistaCssoc() {
    if (!S.sel) return sinEmpresa;
    const M = grande('may-mov');
    if (!M) return cargandoTxt;
    const e = empresa(), y = Number(S.ejercicio), ed = puede(), cta = cssCta(), hayMayor = M.length > 0;
    const pag = {}, rit = {};
    M.forEach((l) => {
      const a = String(l.asiento || '').trim().toUpperCase();
      if (/^PS/.test(a) && casaCta(cta, l.digitos)) pag[ymDe(l.fecha)] = rr((pag[ymDe(l.fecha)] || 0) + (+l.debe || 0) - (+l.haber || 0));
      if (/^IT/.test(a) && casaCta(cta, l.digitos)) rit[ymDe(l.fecha)] = rr((rit[ymDe(l.fecha)] || 0) + (+l.debe || 0) + (+l.haber || 0));
    });
    const F = fundaeMes(y), T = { p: 0, ss: 0, dsn: 0, it: 0, cur: 0, d: 0 };
    const z = (v) => (Math.abs(v) < 0.005 ? '-' : fnum(v));
    const filas = MM12.map((mm, i) => {
      const ymN = `${y}-${mm}`, ymP = sumMes(`${ymN}-01`, 1), N = nomMes(y, mm), x = nomReg(y)?.datos?.[mm] ?? {};
      const ss = N ? N.ssTot : null;
      const p = pag[ymP] !== undefined ? pag[ymP] : (!hayMayor && x.c_pagos !== undefined ? Number(x.c_pagos) : null);
      const it = hayMayor ? -(rit[ymN] || 0) : -Math.abs(Number(x.c_it) || 0);
      const cur = F.M[ymN] ? -rr(F.M[ymN].reduce((a, c) => a + (c.coste || 0), 0)) : (Object.keys(F.M).length ? 0 : -Math.abs(Number(x.c_bonif) || 0));
      const dsn = p === null && ss === null ? null : rr((p || 0) - (ss || 0)), dif = dsn === null ? null : rr(dsn - it - cur), ok = dif !== null && Math.abs(dif) <= 0.9;
      T.p += p || 0; T.ss += ss || 0; T.dsn += dsn || 0; T.it += it; T.cur += cur; T.d += dif || 0;
      const tit = (F.M[ymN] ?? []).map((c) => `${c.k} ${c.den} (${c.fin}): ${fnum(c.coste)}`).join('\n');
      const pagoCel = !hayMayor && ed ? celdaNom(mm, 'c_pagos', y, ed) : `<td class="num" title="Pagados en ${MESES[+ymP.slice(5) - 1]} ${ymP.slice(0, 4)}">${p === null ? '-' : fnum(p)}</td>`;
      return `<tr class="${dif === null ? '' : ok ? 'cf-ok' : 'cf-ko'}"><td class="pp">${MESES[i].toUpperCase()} ${y}</td>${pagoCel}<td class="num">${ss === null ? '-' : fnum(ss)}</td>
        <td class="num">${dsn === null ? '-' : fnum(dsn)}</td><td class="num">${z(it)}</td><td class="num" title="${esc(tit)}">${z(cur)}</td><td class="num"><b>${dif === null ? '-' : fnum(dif)}</b></td>
        <td>${dif === null ? 'Sin datos' : ok ? '✓ Cuadra' : p === null ? '✖ Sin pago' : '✖ Descuadra'}</td></tr>`;
    }).join('');
    const av = [];
    if (!hayMayor) av.push(`Falta el extracto contable (mayor) de la cuenta ${cta}: suéltalo en la franja de arriba (mientras tanto los pagos se pueden escribir a mano).`);
    if (!MM12.some((mm) => nomMes(y, mm))) av.push('Faltan las nóminas (pestaña Nóminas).');
    if (!S.registros.some((r) => r.tipo === 'fundae' && r.empresa_id === S.sel)) av.push('Suelta los listados de FUNDAE (Costes y Grupos formativos, en PDF o en el Excel que exporta FUNDAE) para descontar los cursos bonificados.');
    else { const ys = S.registros.filter((r) => r.tipo === 'fundae' && r.empresa_id === S.sel).map((r) => r.ejercicio); if (!ys.includes(y)) av.push(`Los listados de FUNDAE cargados son del ejercicio ${ys.join(', ')}: para ${y} suelta los de ${y}.`); }
    if (F.sin.length) av.push(`Cursos de FUNDAE con coste pero sin grupo formativo (sin fecha), no se asignan a ningún mes: ${F.sin.map((c) => `${c.k} ${fnum(c.coste)}`).join(', ')}. En el PDF de costes solo vienen los registros visibles: exporta a Excel o pon «Mostrar 100».`);
    const cursos = Object.entries(F.M).sort().flatMap(([ym, L]) => L.map((c) => `<tr><td>${MESES[+ym.slice(5) - 1].toUpperCase()}</td><td class="c">${esc(c.k)}</td><td>${esc(c.den)}</td><td class="c">${esc(c.fin)}</td><td class="num">${fnum(c.coste)}</td></tr>`)).join('');
    const E4760 = { PS: 'Pago Seguridad Social (del mes siguiente)', OD: 'Otros mov. debe', OH: 'Otros mov. haber', IT: 'Rectificaciones IT', CB: 'Rectificaciones cursos bonificados', N: 'Seguridad Social devengada' };
    const r4760 = resumenCtaCss('4760', '4760.01', ['PS', 'OD', 'OH', 'IT', 'CB', 'N'],
      (a, d) => (a.startsWith('PS') ? 'PS' : a.startsWith('IT') ? 'IT' : a.startsWith('CB') ? 'CB' : a.startsWith('N') ? 'N' : d ? 'OD' : 'OH'), (v) => (v.PS + v.OD) - (v.OH + v.IT + v.CB + v.N), y, M, true, 'Diferencia ejercicio anterior', E4760);
    const r6400 = resumenCtaCss('6400', '6400.01', ['N', 'IT', 'OD', 'OH', 'C'],
      (a, d) => { const p = a.split('-')[0]; return p === 'N' || p === 'RTB' ? 'N' : p === 'IT' ? 'IT' : p === 'OD' ? 'OD' : p === 'OH' ? 'OH' : p === 'C' || p[0] === 'I' ? 'C' : d ? 'OD' : 'OH'; },
      (v) => v.N + v.IT + v.OD - v.OH - v.C, y, M, false, 'Saldo ejercicio anterior', { N: 'Salarios nóminas', IT: 'Bajas', OD: 'Otros mov. debe', OH: 'Otros mov. haber', C: 'Cierre del ejercicio' });
    const r6420 = resumenCtaCss('6420', '6420.01', ['SS', 'R', 'OD', 'OH', 'C'],
      (a, d) => { const p = a.split('-')[0]; return ['SS', 'R', 'OD', 'OH', 'C'].includes(p) ? p : d ? 'OD' : 'OH'; },
      (v) => v.SS + v.R + v.OD - v.OH - v.C, y, M, false, 'Saldo ejercicio anterior', { SS: 'Seguridad Social empresa nóminas', R: 'Regularizaciones', OD: 'Otros mov. debe', OH: 'Otros mov. haber', C: 'Cierre del ejercicio' });
    return `${dz('fundae', 'Suelta aquí los listados de FUNDAE', '(Costes y Grupos formativos, PDF o Excel) o pulsa para elegirlos', '.pdf,.xlsx,.xls,.csv')}
      ${dz('extractos', 'Suelta aquí el extracto contable (mayor)', 'de las cuentas 4760.01, 6400.01 y 6420.01 (Excel) o pulsa para elegirlo')}
      ${av.length ? `<div class="aviso">${av.map((a) => `<p>⚠ ${esc(a)}</p>`).join('')}</div>` : ''}
      <p class="hint">Seguros Sociales (pagos: asientos PS en la ${esc(cta)} del mes siguiente) − Seguridad Social de las nóminas = Diferencias; menos IT (asientos IT de la ${esc(cta)} del mes) y menos Bonificaciones (cursos FUNDAE), ambas en negativo = Dif. mes Seg. Social. Cero = verde; si no, rojo.</p>
      <section class="prs-card"><div class="prs-h">Conciliación Seguridad Social · ${y}</div>
      <p style="margin:.5rem 1rem" class="hint">Cuenta de pagos de seguros sociales: <input class="emp-in" data-csscta="1" value="${esc(cta)}" style="width:7rem"></p>
      <div class="css-flex"><div class="wrap"><table class="tprs tnom css-conc"><thead><tr><th class="pp">Mes</th><th>Seguros Sociales</th><th>Seguridad Social Nóminas</th><th>Diferencias Seg. Soc. − Nóminas</th><th>IT</th><th>Bonificaciones</th><th>Dif. Mes Seg. Social</th><th>Estado</th></tr></thead>
      <tbody><tr class="cmp"><td colspan="8">Ejercicio ${y}</td></tr>${filas}<tr class="ttot"><td class="pp">TOTAL</td><td class="num">${fnum(rr(T.p))}</td><td class="num">${fnum(rr(T.ss))}</td><td class="num">${fnum(rr(T.dsn))}</td><td class="num">${fnum(rr(T.it))}</td><td class="num">${fnum(rr(T.cur))}</td><td class="num">${fnum(rr(T.d))}</td><td></td></tr></tbody></table></div>
      <div class="wrap">${r4760}</div><div class="wrap">${r6400}</div><div class="wrap">${r6420}</div></div></section>
      ${cursos ? `<section class="prs-card"><div class="prs-h">Cursos bonificados FUNDAE · ${y}</div><div class="wrap"><table class="tprs tnom"><thead><tr><th>Mes</th><th>AAFF / Grupo</th><th>Denominación</th><th>Fecha fin</th><th>Coste bonificado</th></tr></thead><tbody>${cursos}</tbody></table></div>
      ${ed ? `<button class="small" data-act="m-fundaedel" data-y="${y}" style="margin:.6rem 1rem">Quitar los datos de FUNDAE de ${y}</button>` : ''}</section>` : ''}`;
  }

  // ---------- Inicio: resumen al arrancar (impuestos del periodo, conciliaciones, saldos de cuentas y liquidaciones pendientes) ----------
  // Configuración de libros D365 por empresa (registro «liqiva»): auto = descarga semanal activada; meses = liquidaciones de IVA hechas (no se vuelven a cargar)
  const liqReg = (id) => S.registros.find((r) => r.tipo === 'liqiva' && r.empresa_id === id);
  async function liqGuardar(id, mut) {
    const reg = liqReg(id), datos = JSON.parse(JSON.stringify(reg?.datos ?? {}));
    mut(datos);
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: id, tipo: 'liqiva', ejercicio: null, datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  // La tarea de los lunes lee config.json (en la carpeta de D365): por NIF, auto y meses liquidados. Cada cambio se escribe también ahí.
  const d365Main = async () => (d365H ??= await idbD365('readonly', (s) => s.get('carpeta')).catch(() => null));
  async function d365CfgLeer(h) { try { return JSON.parse(await (await (await h.getFileHandle('config.json')).getFile()).text()); } catch { return null; } }
  async function d365CfgSembrar(h) { // lo que ya hay en config.json pasa a la base de datos si la empresa aún no tiene nada
    const j = await d365CfgLeer(h); let nuevo = false;
    for (const [nif, x] of Object.entries(j?.empresas ?? {})) {
      const e = S.empresas.find((q) => q.cif === nif);
      if (!e || liqReg(e.id)) continue;
      const err = await guardarRegistro(null, { id: crypto.randomUUID(), empresa_id: e.id, tipo: 'liqiva', ejercicio: null, datos: { auto: !!x.auto, meses: x.liquidados ?? [] } });
      if (!err) nuevo = true;
    }
    if (nuevo) await cargar();
  }
  async function d365Cambio(mut) {
    const h = await d365Main(), e = empresa();
    let permiso = false;
    if (h) { try { permiso = (await h.queryPermission({ mode: 'readwrite' })) === 'granted' || (await h.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { /* sin permiso */ } }
    if (h && permiso) await d365CfgSembrar(h); // antes de cambiar nada, trae lo que ya tenía el archivo
    await liqGuardar(S.sel, mut);
    if (!h) d365Msg = 'Elige la carpeta de D365 («Elegir carpeta…») para que la tarea de los lunes vea este cambio.';
    else if (!permiso) d365Msg = 'Sin permiso de escritura en la carpeta de D365: la tarea de los lunes no verá este cambio.';
    else {
      try {
        const j = (await d365CfgLeer(h)) ?? { empresas: {} }, d = liqReg(e.id)?.datos ?? {};
        j.empresas ??= {}; j.empresas[e.cif] = { auto: !!d.auto, liquidados: d.meses ?? [] }; j.actualizado = new Date().toISOString();
        const w = await (await h.getFileHandle('config.json', { create: true })).createWritable();
        await w.write(JSON.stringify(j, null, 1)); await w.close();
        d365Msg = 'Guardado también en config.json (lo lee la tarea de los lunes).';
      } catch (err) { d365Msg = `No se pudo escribir config.json: ${err.message}`; }
    }
    render();
  }
  function toggleLiqIva(txt) {
    const ms = txt.split(',');
    return d365Cambio((d) => { const set = new Set(d.meses ?? []), todos = ms.every((m) => set.has(m)); ms.forEach((m) => (todos ? set.delete(m) : set.add(m))); d.meses = [...set].sort(); });
  }
  const d365Auto = (on) => d365Cambio((d) => { d.auto = !!on; });

  // ---- Libros de IVA de D365: la tarea semanal deja D365_<SIGLA>_<Repercutido|Soportado>_<AAAA-MM>.xlsx en la carpeta «Archivos Claude-D365»;
  // también se recogen los «Líneas de informes de IVA*.xlsx» exportados a mano (la empresa va por el prefijo del asiento). La carpeta se elige una vez y se recuerda en este navegador.
  const idbD365 = (modo, fn) => new Promise((ok, no) => {
    const r = indexedDB.open('gestion-d365', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => { const t = r.result.transaction('h', modo), q = fn(t.objectStore('h')); t.oncomplete = () => ok(q.result); t.onerror = () => no(t.error); };
    r.onerror = () => no(r.error);
  });
  let d365H = null, d365Msg = '', d365Ocupado = false;
  const d365Hecho = () => { try { return new Set(JSON.parse(localStorage.getItem('d365hecho') || '[]')); } catch { return new Set(); } };
  const d365Marca = (set) => { try { localStorage.setItem('d365hecho', JSON.stringify([...set].slice(-3000))); } catch { /* sin almacenamiento */ } };
  const ymVal = (v) => {
    const d = v instanceof Date ? v : typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)) : null;
    if (d && !Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(String(v ?? '')) ?? null, i = /^(\d{4})-(\d{2})/.exec(String(v ?? ''));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}` : i ? `${i[1]}-${i[2]}` : null;
  };
  async function reconocerD365(file) {
    const filas = await filasExcel(file), hd = (filas[0] ?? []).map((x) => sinAc(String(x ?? ''))), j = (t) => hd.indexOf(t);
    const jA = j('asiento'), jF = j('fecha');
    if (jA < 0 || jF < 0) return null;
    const cnt = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); }, pre = new Map(), mes = new Map(), top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    filas.slice(1).forEach((r) => { if (!r) return; cnt(pre, (String(r[jA] ?? '').match(/^([A-Z]{2,4})-/) || [])[1]); cnt(mes, ymVal(r[jF])); });
    const sig = top(pre), ym = top(mes);
    return sig && ym ? { sig, ym } : null;
  }
  let d365O = null; // segunda carpeta (por ejemplo una subcarpeta de Descargas: Chrome no deja elegir Descargas entera)
  async function d365Carpeta(cual) {
    if (!window.showDirectoryPicker) return void alert('Este navegador no deja elegir carpetas. Usa Chrome o Edge.');
    try {
      const h = await window.showDirectoryPicker({ id: cual === 'otra' ? 'd365-otra' : 'd365-exportaciones', mode: cual === 'otra' ? 'read' : 'readwrite', ...(cual === 'otra' ? { startIn: 'downloads' } : {}) });
      if (cual === 'otra') d365O = h; else d365H = h;
      await idbD365('readwrite', (s) => s.put(h, cual === 'otra' ? 'otra' : 'carpeta'));
      d365Msg = `Carpeta ${cual === 'otra' ? 'adicional' : 'de exportaciones'}: ${h.name}`; render();
      return d365Recoger(true);
    } catch (err) { if (err?.name !== 'AbortError') alert(err.name === 'SecurityError' || /system|sistema/i.test(err.message) ? 'Chrome no deja elegir la carpeta Descargas entera: crea una subcarpeta dentro (por ejemplo «D365») y elige esa.' : err.message); }
    return undefined;
  }
  // manual = con un clic del usuario (puede pedir permiso); sin manual solo se lee si el navegador ya lo permite
  async function d365Recoger(manual) {
    if (d365Ocupado) return;
    d365Ocupado = true;
    try {
      d365H ??= await idbD365('readonly', (s) => s.get('carpeta')).catch(() => null);
      d365O ??= await idbD365('readonly', (s) => s.get('otra')).catch(() => null);
      const carpetas = [];
      for (const h of [d365H, d365O].filter(Boolean)) {
        let perm = 'prompt';
        try { perm = await h.queryPermission({ mode: 'read' }); if (perm !== 'granted' && manual) perm = await h.requestPermission({ mode: 'read' }); } catch { /* sin permiso */ }
        if (perm === 'granted') carpetas.push(h); else if (manual) { d365Msg = `Sin permiso para leer ${h.name}: pulsa «Recoger ahora» y acepta.`; render(); }
      }
      if (!d365H && !d365O) { if (manual) { d365Msg = 'Elige primero la carpeta de exportaciones de D365.'; render(); } return; }
      if (!carpetas.length) return;
      if (carpetas.includes(d365H)) await d365CfgSembrar(d365H);
      const hecho = d365Hecho(), omit = [], tocadas = new Set(); let cargados = 0;
      const entradas = [];
      for (const dir of carpetas) for await (const [n, h] of dir.entries()) entradas.push([n, h]);
      for (const [n, h] of entradas) {
        if (h.kind !== 'file') continue;
        const mN = /^D365_([^_]+)_(Repercutido|Soportado)_(\d{4})-(\d{2})(?:_.*)?\.xlsx$/i.exec(n), esL = /^L[ií]neas de informes de IVA.*\.xlsx$/i.test(n);
        if (!mN && !esL) continue;
        const f = await h.getFile(), clave = `${n}|${f.lastModified}|${f.size}`;
        if (hecho.has(clave)) continue;
        let sig, ym;
        if (mN) { sig = mN[1].toUpperCase(); ym = `${mN[3]}-${mN[4]}`; } else { const R = await reconocerD365(f).catch(() => null); if (!R) { omit.push(`${n} (no reconocido)`); continue; } ({ sig, ym } = R); }
        const e = S.empresas.find((x) => String(x.siglas ?? '').toUpperCase() === sig);
        if (!e) { omit.push(`${n} (empresa ${sig})`); continue; }
        const cfg = liqReg(e.id)?.datos ?? {};
        if (mN && !cfg.auto) { omit.push(`${n} (automático desactivado)`); continue; }
        if ((cfg.meses ?? []).includes(ym)) { omit.push(`${n} (IVA liquidado)`); continue; }
        try { await ingestaIVA(f, e.id); hecho.add(clave); cargados++; tocadas.add(e.id); } catch (err) { omit.push(`${n} (${err.message})`); }
      }
      d365Marca(hecho);
      d365Msg = `${cargados ? `${cargados} libro(s) de D365 cargados (${[...tocadas].map(empNombre).join(', ')})` : 'No hay libros nuevos de D365'}${omit.length ? ` · sin cargar: ${omit.slice(0, 4).join(', ')}` : ''}`;
      if (cargados || manual) { await cargar(); render(); }
    } finally { d365Ocupado = false; }
  }
  function vistaInicio() {
    if (!S.sel) return sinEmpresa;
    const E = grande('fact-E'), R = grande('fact-R'), M = grande('may-mov'), sE = grande('sii-E'), sR = grande('sii-R');
    if (!E || !R || !M || !sE || !sR) return cargandoTxt;
    const e = empresa(), ej = Number(S.ejercicio), p = S.periodo, ed = puede(), meses = siiMeses();
    const per = p ? (PERIODOS[p] ?? p) : 'Todo el ejercicio';
    const hay = (v) => v !== undefined && v !== null, g = (v) => (hay(v) && !Number.isNaN(v) ? fnum(v) : '—');
    const ok = (t = 'Cuadra') => `<span class="d-ok">✓ ${esc(t)}</span>`, ko = (t = 'Descuadre') => `<span class="d-ko">✖ ${esc(t)}</span>`, nd = (t = 'Sin datos') => `<span class="d-nd">• ${esc(t)}</span>`;
    const tarjeta = (tab, tit, cuerpo) => `<div class="dash-c" data-ir="${tab}" title="Abrir ${esc(tit)}"><div class="dash-t">${esc(tit)}</div>${cuerpo}</div>`;
    const pv = (m, col) => (p ? prsVal(ej, m, p, col) : undefined);
    // 1) impuestos del periodo: calculado desde los libros y lo presentado
    const calc = {};
    let r111 = { ret: 0 }, nomR = 0;
    if (p) {
      try {
        r111 = calcularRet('111', R, ej, p);
        const np = nomPer(ej, perEf(e, p)), m111 = manPer('m111');
        nomR = np ? np.r : Number(m111.t3) || 0;
        calc['111'] = rr(nomR + r111.ret - (Number(m111.c29) || 0));
        ['115', '123'].forEach((m) => { calc[m] = rr(calcularRet(m, R, ej, p).ret - (Number(manPer('m' + m).c4) || 0)); });
        if (E.length || R.length) {
          calc['303'] = calcular303(E, R, ej, p, manuales(), { rectif: rectif303, c110: disponible303(E, R, ej, p) }).c71;
          calc['349'] = calcular349(E, R, ej, p).total;
        }
      } catch (err) { /* sin libros: solo se muestra lo presentado */ }
    }
    const pres = { 111: hay(pv('111', 'retN')) || hay(pv('111', 'retP')) ? rr((pv('111', 'retN') || 0) + (pv('111', 'retP') || 0)) : null, 115: pv('115', 'ret') ?? null,
      123: pv('123', 'ret') ?? null, 303: pv('303', 'liq') ?? pv('303', 'res') ?? null, 349: pv('349', 'imp') ?? null };
    const imps = ['111', '115', '123', '303', '349'].map((m) => {
      const c = calc[m], pr = pres[m];
      if (c === undefined && pr === null) return '';
      if (m === '115' && !alta115(e, ej, p)) return '';
      if (['115', '123', '349'].includes(m) && !(Math.abs(c || 0) >= 0.005) && !(Math.abs(pr || 0) >= 0.005)) return '';
      const est = c === undefined ? '' : m === '349' ? 'Informativa' : c > 0.005 ? 'A ingresar' : c < -0.005 ? 'A compensar' : 'Cero';
      const cu = pr === null ? nd('Sin presentar') : Math.abs(pr - (c || 0)) <= 1 ? ok('Presentado') : ko(`Presentado ${g(pr)}`);
      return tarjeta('mod' + m, 'Modelo ' + m, `<div class="dash-v">${g(c)}</div><div class="dash-s">${est}</div><div class="dash-s">${cu}</div>`);
    }).filter(Boolean);
    const tiene = (m) => imps.some((h) => h.includes(`data-ir="mod${m}"`));
    // 2) conciliaciones
    const conc = [];
    ['111', '115', '123'].forEach((m) => {
      if (m !== '111' && !tiene(m)) return;
      let st = nd(), dif = '';
      const pr = m === '111' ? [pv('111', 'retN'), pv('111', 'retP')] : [pv(m, 'ret')];
      if (p && pr.some(hay)) {
        try {
          const ds = m === '111' ? [(pr[0] || 0) - nomR, (pr[1] || 0) - r111.ret] : [(pr[0] || 0) - calcularRet(m, R, ej, p).ret];
          const mal = ds.some((d) => Math.abs(d) > 1);
          st = mal ? ko() : ok();
          if (mal) dif = `<div class="dash-s">Diferencia mayor: ${g(ds.reduce((a, d) => (Math.abs(d) > Math.abs(a) ? d : a), 0))} €</div>`;
        } catch (err) { /* sin libros */ }
      }
      conc.push(tarjeta('r' + m, 'Conciliación ' + m, `<div class="dash-s">${st}</div>${dif}`));
    });
    { let st = nd(), det = '';
      try {
        const mal = []; let hayD = false;
        meses.forEach((mm) => {
          const d = {};
          [['E', E, sE], ['R', R, sR]].forEach(([s, lib, sii]) => { if (lib.length && sii.length) d[s] = conciliarSiiCompleta(s, lib, sii, ej, mm); });
          if (!Object.keys(d).length) return;
          const lado = (s, n) => (d[s] && !d[s].cuadra ? `${n} SII−libro ${fnum(rr(d[s].ts.cuota - d[s].tc.cuota))} ` : '');
          if (['E', 'R'].some((s) => d[s] && (d[s].tc.n || d[s].ts.n))) hayD = true;
          if (!d.E?.cuadra && d.E || !d.R?.cuadra && d.R) mal.push(`<div class="dash-s">${esc(MESES[+mm - 1].toUpperCase())}: ${lado('E', 'emitidas')}${lado('R', 'recibidas')}</div>`);
        });
        if (hayD) { st = mal.length ? ko() : ok(); det = mal.slice(0, 6).join('') + (mal.length > 6 ? '<div class="dash-s">…</div>' : ''); }
      } catch (err) { /* sin datos */ }
      conc.push(tarjeta('concsiie', 'Conciliación 303 · SII', `<div class="dash-s">${st}</div>${det}`)); }
    { let st = nd(), det = '';
      try {
        const nm = meses.filter((mm) => nomMes(ej, mm));
        if (M.length && nm.length) {
          const cta = cssCta(), pag = {}, rit = {};
          M.forEach((l) => {
            const a = String(l.asiento || '').trim().toUpperCase();
            if (/^PS/.test(a) && casaCta(cta, l.digitos)) pag[ymDe(l.fecha)] = rr((pag[ymDe(l.fecha)] || 0) + (+l.debe || 0) - (+l.haber || 0));
            if (/^IT/.test(a) && casaCta(cta, l.digitos)) rit[ymDe(l.fecha)] = rr((rit[ymDe(l.fecha)] || 0) + (+l.debe || 0) + (+l.haber || 0));
          });
          const F = fundaeMes(ej), mal = [];
          nm.forEach((mm) => {
            const ymN = `${ej}-${mm}`, ymP = sumMes(`${ymN}-01`, 1), N = nomMes(ej, mm), x = nomReg(ej)?.datos?.[mm] ?? {};
            const ss = N.ssTot, pg = pag[ymP] !== undefined ? pag[ymP] : null, it = -(rit[ymN] || 0);
            const cur = F.M[ymN] ? -rr(F.M[ymN].reduce((a, c) => a + (c.coste || 0), 0)) : (Object.keys(F.M).length ? 0 : -Math.abs(Number(x.c_bonif) || 0));
            const dif = rr(rr((pg || 0) - ss) - it - cur);
            if (Math.abs(dif) > 0.9) mal.push(`<div class="dash-s">${esc(MESES[+mm - 1])}: ${pg === null ? 'sin pago' : 'descuadra'} ${fnum(dif)}</div>`);
          });
          st = mal.length ? ko() : ok(); det = mal.join('');
        }
      } catch (err) { /* sin datos */ }
      conc.push(tarjeta('cssoc', 'Conciliación Seguridad Social', `<div class="dash-s">${st}</div>${det}`)); }
    const nMal = conc.filter((c) => c.includes('d-ko')).length;
    // 3) saldos de las cuentas que concilian impuestos, a fin del periodo
    const rg = rangoPeriodo(ej, p), corte = Date.parse(rg.hasta) + 864e5, m1 = +rg.hasta.slice(5, 7), fer = e?.cif === 'B18546614';
    const MOD = { c4700: 'MODELO 303 IVA A COMPENSAR', c4709: 'MODELO 200 IMPUESTO SOBRE SOCIEDADES A DEVOLVER', c4730: 'MODELO 202 PAGO A CUENTA IMPUESTO SOBRE SOCIEDADES',
      c4750: 'MODELO 303 IVA A INGRESAR', c47511: fer ? 'MODELO 111 RETENCIONES RDTOS DEL TRABAJO' : 'MODELO 111 RETENCIONES RDTOS DEL TRABAJO Y ACTIV. ECONOMICAS',
      c47512: fer ? 'MODELO 111 RETENCIONES PROFESIONALES' : 'MODELO 115 RETENCIONES DEL CAPITAL INMOBILIARIO', c47513: 'MODELO 115 RETENCIONES DEL CAPITAL MOBILIARIO',
      c47514: 'MODELO 123 RETENCIONES DEL CAPITAL MOBILIARIO', c4752: 'MODELO 200 IMPUESTO SOBRE SOCIEDADES A INGRESAR', c4760: 'SEGURIDAD SOCIAL MES EN CURSO' };
    const neg = (v) => (v === null ? null : rr(-v));
    const impK = (k) => {
      const liq = pv('303', 'liq'), c87 = pv('303', 'c87'), v200 = prsVal(ej, '200', 'A', 'res');
      if (k === 'c4700') return !hay(liq) && !hay(c87) ? null : rr((c87 || 0) + (liq < 0 ? -liq : 0));
      if (k === 'c4750') return pres[303] === null ? null : rr(-Math.max(0, pres[303]));
      if (k === 'c47511') return fer ? (hay(pv('111', 'retN')) ? neg(pv('111', 'retN')) : null) : neg(pres[111]);
      if (k === 'c47512') return fer ? (hay(pv('111', 'retP')) ? neg(pv('111', 'retP')) : null) : neg(pres[115]);
      if (k === 'c47513') return neg(pres[115]);
      if (k === 'c47514') return neg(pres[123]);
      if (k === 'c4709') return hay(v200) ? rr(v200 < 0 ? -v200 : 0) : null;
      if (k === 'c4752') return hay(v200) ? rr(v200 > 0 ? -v200 : 0) : null;
      if (k === 'c4730') { const ps = [['1P', 4], ['2P', 10], ['3P', 12]].filter(([, m]) => m1 >= m).map(([q]) => prsVal(ej, '202', q, 'res')); return !ps.length ? 0 : ps.some(hay) ? rr(ps.reduce((s, v) => s + (v || 0), 0)) : null; }
      if (k === 'c4760') { const n = nomMes(ej, String(m1).padStart(2, '0')); return n ? rr(-n.ssTot) : null; }
      return null;
    };
    let ctas = '<p class="hint">Carga el extracto contable para ver los saldos.</p>';
    if (M.length) {
      try {
        const F = Object.entries(ctasEmpresa(e)).filter(([k]) => MOD[k]).map(([k, C]) => {
          const D = calcCuenta(k, M), mv = D.movs.filter((x) => x.l.ms < corte), saldo = mv.length ? mv[mv.length - 1].saldo : D.ctl.saldoIni, imp = p ? impK(k) : null;
          const std = C.cta.split('.')[0] + String(C.cta.split('.')[1] || '').padStart(5, '0');
          return { k, cuenta: D.subcuentas[0] || std, nombre: C.desc, modelo: MOD[k], saldo, imp, dif: rr(saldo - (imp || 0)) };
        }).sort((a, b) => String(a.cuenta).replace(/\D/g, '').localeCompare(String(b.cuenta).replace(/\D/g, '')));
        ctas = `<table class="dash-tab dash-sal"><thead><tr><th>Cuenta</th><th>Modelo</th><th>Saldo</th><th>Impuesto</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>${F.map((f) => `<tr data-ir="${f.k}">
          <td>${esc(f.cuenta)} · ${esc(f.nombre)}</td><td class="gris">${esc(f.modelo)}</td><td class="n">${g(f.saldo)}</td><td class="n">${g(f.imp)}</td><td class="n"><b>${g(f.imp === null ? null : f.dif)}</b></td>
          <td>${f.imp === null ? nd('Sin declaración') : Math.abs(f.dif) <= 1 ? ok() : ko()}</td></tr>`).join('')}</tbody></table>`;
      } catch (err) { ctas = `<p class="hint">No se han podido calcular los saldos: ${esc(err.message)}</p>`; }
    }
    // 4) liquidaciones pendientes de presentar
    const pend = p ? obligaciones(e, ej, presIndex()).filter((o) => !o.pres && (o.per === p || (/^[1-4]T$/.test(p) && enPeriodo(o, p)))).map((o) => ({ mod: o.mod, per: perTxt(o), imp: o.imp ?? calc[o.mod] ?? null })) : [];
    const siiTxt = [];
    [['E', 'SII emitidas', sE], ['R', 'SII recibidas', sR]].forEach(([s, n, L]) => {
      const c = L.filter((x) => (s === 'E' ? x.fecha >= rg.desde && x.fecha <= rg.hasta : x.ej === ej && (!p || x.per === p))).length;
      if (c) siiTxt.push(ok(`${n}: presentado (${c} registros)`)); else if (p) pend.push({ mod: n, per: `${p}/${ej}`, imp: null });
    });
    const liq = (p ? '' : '<p class="hint">Elige un mes o un trimestre en Periodo.</p>') + (siiTxt.length ? `<p class="dash-s">${siiTxt.join(' &nbsp; ')}</p>` : '')
      + (pend.length ? `<table class="dash-tab"><thead><tr><th>Empresa</th><th>Modelo</th><th>Periodo</th><th>Importe</th></tr></thead><tbody>${pend.map((f) => `<tr data-ir="liq"><td class="nw">${esc(e.nombre)}</td>
        <td class="c">${/^\d+$/.test(f.mod) ? 'Modelo ' + esc(f.mod) : esc(f.mod)}</td><td class="c">${esc(f.per)}</td><td class="n">${g(f.imp)}</td></tr>`).join('')}</tbody></table><p class="hint">${pend.length} liquidación(es) sin marcar como presentadas.</p>`
        : `<p>${ok('Todas las liquidaciones del periodo están presentadas')}</p>`);
    const lq = meses.map((mm) => `${ej}-${mm}`), setL = new Set(S.registros.find((r) => r.tipo === 'liqiva' && r.empresa_id === S.sel)?.datos?.meses ?? []), liqHecha = !!p && lq.every((m) => setL.has(m));
    const cfgD = liqReg(S.sel)?.datos ?? {}, ultimos = (cfgD.meses ?? []).slice(-6);
    return `<div class="inicio"><section class="dsec"><h3>Libros de IVA · ${esc(e.nombre)}</h3><div class="d-fila">
        <label title="Marcado: cada semana se cargan solos los libros que la tarea de D365 deja en la carpeta de exportaciones. Sin marcar: los subes tú como siempre."><input type="checkbox" data-d365auto="1"${cfgD.auto ? ' checked' : ''}${ed ? '' : ' disabled'}> <b>Descarga automática semanal desde D365</b></label>
        ${ed && p ? `<label title="Marcado: ese mes no se vuelve a cargar desde D365."><input type="checkbox" data-d365liq="${lq.join(',')}"${liqHecha ? ' checked' : ''}> <b>Liquidación de IVA hecha · ${esc(per)}</b></label>` : ''}
        <span class="dash-s">Exportaciones de D365: guárdalas en <b>${esc(d365H?.name ?? 'Archivos Claude-D365')}</b>${ed ? ` ${d365H ? '' : '<button class="small" data-act="m-d365carpeta" data-c="carpeta">Elegir carpeta…</button>'}${d365O ? ` y <b>${esc(d365O.name)}</b>` : ''} <button class="small" data-act="m-d365carpeta" data-c="otra" title="Otra carpeta más, por ejemplo una subcarpeta de Descargas">${d365O ? 'Cambiar otra carpeta…' : 'Otra carpeta…'}</button> <button class="small" data-act="m-d365recoger">Recoger ahora</button>` : ''}</span>
        <span class="dash-s">${cfgD.auto ? 'Automático' : 'Manual'}${ultimos.length ? ` · liquidados: ${esc(ultimos.join(', '))}` : ''}</span></div>
        ${d365Msg ? `<div class="d-fila"><span class="dash-s">${esc(d365Msg)}</span></div>` : ''}</section>
      <section class="dsec"><h3>Impuestos del periodo · ${esc(per)}</h3>${p ? `<div class="dash-g">${imps.join('') || '<p class="hint">Sin datos de impuestos en este periodo.</p>'}</div>` : '<p class="hint">Elige un mes o un trimestre en Periodo.</p>'}</section>
      <section class="dsec"><h3>Conciliaciones</h3><div class="conc-resumen ${nMal ? 'd-ko' : 'd-ok'}">${nMal ? `✖ ${nMal} conciliación${nMal > 1 ? 'es' : ''} con descuadre` : '✓ Todas las conciliaciones cuadran'}</div><div class="dash-g">${conc.join('')}</div></section>
      <div class="dash-2"><section class="dsec"><h3>Saldos de las cuentas contables</h3>${ctas}</section><section class="dsec"><h3>Liquidaciones a presentar pendientes</h3>${liq}</section></div>
      <p class="hint">Pincha en cualquier recuadro o fila para ir a su pestaña.</p></div>`;
  }
  tabs.ini = ['Inicio', 'Resumen del periodo', vistaInicio];
  tabs.liq = ['Liquidaciones Presentar', 'Todas las empresas', vistaLiq];
  tabs.venc = ['Pagos Domiciliados Impuestos', 'Todas las empresas', vistaVenc];
  tabs.iloc = ['Impuestos Locales', 'IBI · IAE · IVTM', vistaIloc];
  tabs.dua = ['DUA-H1', 'Importaciones · IVA diferido', vistaDua];

  // ---------- Impuestos locales: IBI, IAE, IVTM, vados · periodo voluntario y domiciliación (un registro «iloc» por recibo, con su PDF en Storage) ----------
  const IL_CAMPOS = [['tipo', 'Impuesto', 0], ['objeto', 'Objeto (ref. catastral / epígrafe / matrícula)', 26], ['muni', 'Municipio / organismo', 16], ['ej', 'Ejercicio', 6], ['imp', 'Importe (€)', 10],
    ['ini', 'Inicio voluntario', 0], ['fin', 'Fin voluntario', 0], ['dom', 'Domiciliado', 0], ['cargo', 'Fecha de cargo', 0], ['cta', 'Cuenta de cargo', 18], ['pag', 'Pagado', 0], ['obs', 'Observaciones', 20]];
  let ilVer = 'todos', ilMsg = '';
  const ilDe = (r, k) => {
    const d = r.datos ?? {};
    if (k === 'tipo') return d.tipo ?? d.impuesto ?? 'IBI';
    if (k === 'muni') return d.muni ?? d.municipio ?? '';
    if (k === 'ej') return String(d.ej ?? r.ejercicio ?? '');
    if (k === 'imp') return d.imp ?? d.importe ?? '';
    if (k === 'fin') return d.fin ?? d.vencimiento ?? '';
    if (k === 'cargo') return d.cargo ?? d.fecha_pago ?? '';
    if (k === 'pag') return d.pag ?? (d.estado === 'Pagado' ? 'Sí' : 'No');
    return d[k] ?? '';
  };
  const ilFecha = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const ilArch = (r) => r.datos?.arch ?? r.datos?.archivo; // rchivo es como lo guardaba la carga antigua
  const ilRegs = () => S.registros.filter((r) => r.tipo === 'iloc' && r.empresa_id === S.sel);
  function vistaIloc() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), ed = puede(), hoy = Date.now(), D = ilRegs();
    const anios = [...new Set(D.map((r) => ilDe(r, 'ej')).filter(Boolean))].sort().reverse();
    const L = D.filter((r) => ilVer === 'todos' || !ilDe(r, 'ej') || ilDe(r, 'ej') === ilVer)
      .sort((a, b) => ilDe(b, 'ej').localeCompare(ilDe(a, 'ej')) || String(ilDe(a, 'tipo')).localeCompare(String(ilDe(b, 'tipo'))) || String(ilDe(a, 'fin') || ilDe(a, 'cargo')).localeCompare(String(ilDe(b, 'fin') || ilDe(b, 'cargo'))));
    const sel = (id, k, v, ops) => (ed ? `<select data-il="${id}|${k}">${ops.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>` : esc(v));
    const celda = (r, k, w) => {
      const v = ilDe(r, k);
      if (k === 'tipo') return `<td class="in">${sel(r.id, k, v, IL_TIPOS_IL)}</td>`;
      if (k === 'dom' || k === 'pag') return `<td class="in">${sel(r.id, k, v || 'No', ['No', 'Sí'])}</td>`;
      if (k === 'ini' || k === 'fin' || k === 'cargo') return `<td class="in"><input type="date" data-il="${r.id}|${k}" value="${esc(v)}"${ed ? '' : ' disabled'}></td>`;
      if (k === 'imp') return `<td class="in"><input class="num" data-il="${r.id}|${k}" value="${v === '' ? '' : fnum(v)}" size="${w}"${ed ? '' : ' readonly'}></td>`;
      return `<td class="in"><input data-il="${r.id}|${k}" value="${esc(v)}" size="${w}"${ed ? '' : ' readonly'}></td>`;
    };
    const est = (r) => {
      if (ilDe(r, 'pag') === 'Sí') return `<span class="d-ok">✓ pagado${ilFecha(ilDe(r, 'cargo')) ? ' el ' + fechaTxt(ilFecha(ilDe(r, 'cargo'))) : ''}</span>`;
      const f = ilFecha(ilDe(r, 'fin'));
      if (f === null) return '';
      const d = Math.round((f - hoy) / 864e5);
      return d < 0 ? '<b style="color:#a50e0e">vencido</b>' : d <= 15 ? `<b style="color:#b06000">vence en ${d} día(s)</b>` : 'en plazo';
    };
    const imp = (r) => Number(ilDe(r, 'imp')) || 0;
    const tot = (t) => rr(L.filter((r) => ilDe(r, 'tipo') === t).reduce((a, r) => a + imp(r), 0));
    const fila = (r) => `<tr${ilArch(r)?.path ? ` data-ilpdf="${esc(ilArch(r).path)}" title="Doble clic: abrir ${esc(ilArch(r).nombre)}" style="cursor:pointer"` : ''}>${IL_CAMPOS.map(([k, , w]) => celda(r, k, w)).join('')}<td>${est(r)}</td>
      <td>${ilArch(r)?.path ? `<button class="small" data-act="m-abrir" data-path="${esc(ilArch(r).path)}">📄 ${esc(ilDe(r, 'tipo'))} ${esc(ilDe(r, 'ej'))}</button>` : ''}</td>
      <td>${ed ? `<button class="small" data-act="m-ildel" data-id="${r.id}">Quitar</button>` : ''}</td></tr>`;
    return `${ed ? dz('iloc', 'Suelta aquí (o pulsa para elegir) todos los PDF que quieras, sin límite, de recibos o justificantes de pago', '(IBI, IAE, IVTM, vados… del Servicio Provincial Tributario u otros): se leen el impuesto, objeto, municipio, ejercicio, importe, último día de pago y si constan pagados. Doble clic en una fila con PDF para abrirlo.', '.pdf') : ''}<section class="dsec il-s"><h3>Impuestos locales · ${esc(e.nombre)} · <select data-ilver="1"><option value="todos">Todos los ejercicios</option>${anios.map((a) => `<option${a === ilVer ? ' selected' : ''}>${a}</option>`).join('')}</select> <span class="dash-s">(${L.length} recibo(s))</span></h3>
      ${ilMsg ? `<p class="dash-s">${esc(ilMsg)}</p>` : ''}
      <div class="wrap"><table class="tprs tnom il-t"><thead><tr>${IL_CAMPOS.map((c) => `<th>${c[1]}</th>`).join('')}<th>Situación</th><th>PDF</th><th></th></tr></thead>
        <tbody>${L.map(fila).join('') || `<tr><td colspan="${IL_CAMPOS.length + 3}" class="c">Sin recibos${ilVer === 'todos' ? '' : ' en ' + ilVer}: suelta un PDF o añade una línea</td></tr>`}</tbody></table></div>
      ${ed ? '<button class="small" data-act="m-iladd" style="margin-top:.5rem">+ Añadir recibo</button>' : ''}
      ${L.length ? `<p class="dash-s">Total ${ilVer === 'todos' ? 'todos los ejercicios' : ilVer}: IBI ${fnum(tot('IBI'))} · IAE ${fnum(tot('IAE'))} · IVTM ${fnum(tot('IVTM'))}${tot('Vado') ? ' · Vados ' + fnum(tot('Vado')) : ''}${tot('Otro') ? ' · Otros ' + fnum(tot('Otro')) : ''} · pendiente de pago ${fnum(rr(L.filter((r) => ilDe(r, 'pag') !== 'Sí').reduce((a, r) => a + imp(r), 0)))}</p>` : ''}</section>`;
  }
  const IL_TIPOS_IL = ['IBI', 'IAE', 'IVTM', 'Vado', 'Otro'];
  const ilTipo = (t) => { const u = sinAc(t).toUpperCase(); return /\bIBI\b|BIENES INMUEBLES/.test(u) ? 'IBI' : /ACTIVIDADES ECONOM|\bIAE\b/.test(u) ? 'IAE' : /\bIVTM\b|VEHICULOS DE TRACCION/.test(u) ? 'IVTM' : /VADO/.test(u) ? 'Vado' : 'Otro'; };
  // PDF de recibos (pendientes) y justificantes de pago (pagados) de impuestos locales
  async function ilPdf(file) {
    const texto = await textoPdf(file);
    const ls = texto.split('\n').filter((l) => l && !l.startsWith('--- página')), t = ls.join('\n'), iso = (d) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d ?? '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
    const sig = (re) => { const i = ls.findIndex((l) => re.test(l)); return i >= 0 ? ls[i + 1] || '' : ''; }, nums = (l) => (l.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g) || []);
    const nif = (/Identificador Fiscal:?\s*([A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z])/.exec(t) || /\b([A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z])\b/.exec(sig(/Identificador Fiscal/)) || [])[1] ?? '';
    const r = { dom: 'No' };
    const pag = /consta como PAGADA la siguiente deuda relativa a\s*(.+)/i.exec(t);
    if (pag) {
      r.tipo = ilTipo(pag[1]); r.pag = 'Sí';
      const v = /\n\s*(.+?)\s+-\s+((?:19|20)\d{2})-[A-Z]*\s*-?\s*ID:\s*(\S+)/.exec(t);
      if (v) { r.muni = v[1].trim(); r.ej = v[2]; r.id = v[3]; }
      const o = sig(/^Objeto Tributario/), fc = /(\d{2}\/\d{2}\/\d{4})\s*$/.exec(o);
      r.objeto = o.replace(/\s*\d{2}\/\d{2}\/\d{4}\s*$/, '').replace(/\s+/g, ' ').trim(); if (fc) r.cargo = iso(fc[1]);
      const n = nums(sig(/^Principal\s+Recargo/)); if (n.length) r.imp = parseES(n[n.length - 1]);
      r.obs = `Justificante de pago${r.id ? ' · ' + r.id : ''}`;
    } else if (/RECIBO DE\s/i.test(t)) {
      r.tipo = ilTipo((/RECIBO DE\s+(.+)/i.exec(t) || [])[1] || ''); r.pag = 'No';
      r.muni = ((/\bAYTO\.? DE\s+([^\n]+)/i.exec(t) || [])[1] || '').trim(); r.ej = (/PERIODO:\s*((?:19|20)\d{2})/.exec(t) || [])[1] || '';
      r.objeto = sig(/^Objeto Tributario$/).trim();
      const rc = /Catast\D{0,6}?(\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2}|\d{7}[A-Z]{2}\d{4}[A-Z])/.exec(t); if (rc) r.objeto = `${rc[1]} · ${r.objeto}`;
      r.id = (/\b(\d{8,}[A-Z0-9]+)\b/.exec(sig(/Identificaci[oó]n del Recibo/)) || [])[1] || '';
      const u = sig(/[UÚ]ltimo d[ií]a de pago/), f = /\d{2}\/\d{2}\/\d{4}/.exec(u); if (f) r.fin = iso(f[0]);
      const n = nums(u); if (n.length) r.imp = parseES(n[n.length - 1]);
      if (r.imp === undefined) { const n2 = nums(sig(/Importe a Ingresar$/)); if (n2.length) r.imp = parseES(n2[n2.length - 1]); }
      const ref = (/Referencia de Pago\s*:?\s*(\d+)/.exec(t) || [])[1], rec = /Recargo pendiente[\s\S]{0,80}?\b(\d+)%\s+([\d.,]+)/.exec(t) || [];
      r.obs = `Recibo pendiente${r.id ? ' · ' + r.id : ''}${ref ? ' · ref. pago ' + ref : ''}${rec[1] ? ` · recargo ${rec[1]}% ${rec[2]} fuera de plazo` : ''}`;
    } else return { error: 'no reconozco el recibo ni el justificante de pago' };
    if (!r.ej) return { error: 'no encuentro el ejercicio' };
    return { r, nif };
  }
  async function ilCargar(files) {
    let n = 0, act = 0; const otras = new Set(), mal = [];
    for (const f of files.filter((x) => /\.pdf$/i.test(x.name))) {
      try {
        ilMsg = `Leyendo ${f.name}…`; render();
        const x = await ilPdf(f);
        if (x.error) { mal.push(`${f.name} (${x.error})`); continue; }
        const { r, nif } = x, E = S.empresas.find((q) => q.cif === nif), id = E ? E.id : S.sel;
        if (E && E.id !== S.sel) otras.add(E.nombre);
        const prev = S.registros.find((q) => q.tipo === 'iloc' && q.empresa_id === id && (r.id ? q.datos?.id === r.id : (ilDe(q, 'tipo') === r.tipo && q.datos?.objeto === r.objeto && ilDe(q, 'ej') === String(r.ej) && Number(ilDe(q, 'imp')) === r.imp)));
        const regId = prev?.id ?? crypto.randomUUID(), sub = await subir(id, 'iloc', regId, 'pdf', f);
        if (sub.error) mal.push(`${f.name} (PDF no guardado: ${sub.error})`);
        const datos = { ...(prev?.datos ?? {}), ...r, arch: sub.val ?? (prev ? ilArch(prev) : undefined) };
        if (prev) { datos.dom = prev.datos?.dom === 'Sí' ? 'Sí' : datos.dom; if (prev.datos?.cta) datos.cta = prev.datos.cta; }
        const err = await guardarRegistro(prev, prev ? { datos, ejercicio: +r.ej } : { id: regId, empresa_id: id, tipo: 'iloc', ejercicio: +r.ej, datos });
        if (err) { mal.push(`${f.name} (${err})`); continue; }
        if (prev) act++; else n++;
      } catch (err) { mal.push(`${f.name} (${err.message})`); }
    }
    ilMsg = `${n} recibo(s) nuevo(s)${act ? ` · ${act} actualizado(s)` : ''}${otras.size ? ` · guardados en ${[...otras].join(', ')}` : ''}${mal.length ? ` · sin leer: ${mal.join(', ')}` : ''}`;
    await cargar(); render();
  }
  async function guardarIl(clave, valor) {
    const [id, k] = clave.split('|'), reg = S.registros.find((r) => r.id === id);
    if (!reg) return;
    const datos = { ...reg.datos }, v = String(valor).trim();
    if (k === 'imp') datos.imp = v === '' ? '' : parseES(v); else datos[k] = v;
    const err = await guardarRegistro(reg, k === 'ej' && /^\d{4}$/.test(v) ? { datos, ejercicio: +v } : { datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  async function ilAnadir() {
    const ej = ilVer !== 'todos' ? +ilVer : Number(S.ejercicio);
    const err = await guardarRegistro(null, { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'iloc', ejercicio: ej, datos: { tipo: 'IBI', ej: String(ej), dom: 'No', pag: 'No' } });
    if (err) return void alert(err);
    await cargar(); render();
  }
  async function ilQuitar(id) {
    const reg = S.registros.find((r) => r.id === id);
    if (!reg || !confirm('¿Quitar este recibo?')) return;
    await quitarArchivos(rutas({ a: ilArch(reg) }));
    const { error } = await db.from('registros').delete().eq('id', id);
    if (error) return void alert(error.message);
    await cargar(); render();
  }
  const setIlVer = (v) => { ilVer = v; render(); };

  // ---------- DUA-H1 (importación, IVA diferido): un registro «dua» por declaración, con su PDF en Storage ----------
  const DUA_CAMPOS = [['num', 'Número del DUA'], ['grab', 'Fecha de grabación'], ['levante', 'Fecha de levante'], ['aduana', 'Aduana de presentación'], ['importador', 'Importador'], ['declarante', 'Declarante'], ['expedidor', 'Expedidor / exportador'],
    ['paisExp', 'País de expedición'], ['paisDest', 'País de destino'], ['transporte', 'Medio de transporte de llegada'], ['contenedores', 'Contenedores'], ['codEntrega', 'Código de entrega'], ['lugar', 'Lugar precisado'], ['divisa', 'Divisa'],
    ['totalFac', 'Total factura'], ['modoTr', 'Modo de transporte en frontera'], ['desc', 'Descripción de las mercancías'], ['taric', 'Código TARIC'], ['bruta', 'Masa bruta (kg)'], ['neta', 'Masa neta (kg)']];
  const DUA_TRIB = { A00: 'Derechos Aduana', A30: 'Derechos Antidumping', '1PL': 'Impuesto Plástico', B00: 'IVA Importación' };
  let duaSel = null, duaMes = 'todos', duaMsg = '';
  const duaNum = (s) => { const v = String(s || '').replace(/,/g, '.'), p = v.split('.'); return p.length > 2 ? +(`${p.slice(0, -1).join('')}.${p[p.length - 1]}`) : +v; };
  const duaEur = (s) => +String(s || '0').replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  // códigos mal leídos por el OCR (APL, IPL, A0O, BOO…) → código correcto
  const duaCod = (k) => { const c = String(k).toUpperCase().replace(/[OQ]/g, '0'); return /^[AÁIL1|]PL$/.test(c) ? '1PL' : /^B0+$/.test(c) ? 'B00' : /^A0+$/.test(c) ? 'A00' : c; };
  const duaTipo = (t) => String(t || '').replace(/,000(?=\s*(%|\/))/, '');
  const duaFecha = (s) => { const m = /(\d\d)-(\d\d)-(\d{4})/.exec(String(s || '')); return m ? { d: +m[1], m: +m[2], y: +m[3] } : null; };
  function duaDeTexto(T) {
    const L = T.split('\n').map((x) => x.trim()), g = (re, i = 1) => { const m = T.match(re); return m ? m[i].replace(/\s+/g, ' ').trim() : ''; },
      all = (re) => [...T.matchAll(re)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter((x) => x && x !== '-');
    const R = {}, limpia = (s) => String(s || '').replace(/\s/g, '').replace(/[|l]/g, 'I'), valido = (s) => /^\d\d[A-Z]{2}\d{6}[A-Z0-9]{8}$/.test(s);
    // el número sale de «Importación. Detallada …» o de la línea MRN (en los escaneos el OCR separa las letras y cambia la I por «|» o «1»)
    R.num = limpia(g(/Importaci[oó]n\.\s*Detallada\s+([0-9A-Z |]+?)\s*$/m));
    if (!valido(R.num)) { const m = limpia(g(/^MRN:\s*([0-9A-Z |]+?)\s*$/m)); R.num = valido(m) ? m : ''; }
    R.grab = g(/Fecha de grabaci[oó]n:\s*(\d\d-\d\d-\d{4}(?:\s+\d\d:\d\d:\d\d)?)/); R.levante = g(/Fecha de levante:\s*(\d\d-\d\d-\d{4}(?:\s+\d\d:\d\d:\d\d)?)/);
    R.aduana = g(/Aduana de Presentaci[oó]n\s*:\s*(.+)/); R.importador = g(/1304\.\s*NIF:\s*(.+)/); R.declarante = g(/1305\.\s*NIF:\s*(.+)/);
    R.expedidor = [...new Set(all(/1301\.\s*Nombre:[ \t]*(.*)/g))].join(' · '); R.paisExp = [...new Set(all(/1606\.\s*Pa[ií]s de expedici[oó]n:\s*(.*)/g))].join(' · ');
    R.paisDest = g(/1603\.a\.\s*Pa[ií]s:\s*(.+)/); const prov = g(/1603\.b\.\s*Provincia:\s*(.+)/); if (prov && prov !== '-') R.paisDest += ` (${prov})`;
    R.transporte = g(/1906\.\s*N[uú]mero de Identificaci[oó]n medio transporte llegada\s*:\s*(.+)/);
    const cont = []; [...T.matchAll(/1907\.\s*Contenedores([\s\S]{0,400})/g)].forEach((m) => { (m[1].match(/\b[A-Z]{4}\d{7}\b/g) || []).forEach((c) => cont.push(c)); });
    R.contenedores = cont.length ? [...new Set(cont)].join(', ') : g(/1901\.\s*Contenedores\s*:\s*(.+)/);
    R.codEntrega = g(/C[oó]digo de entrega:\s*(.+)/); R.lugar = g(/Lugar precisado:\s*(.+)/); R.divisa = g(/1405\.\s*Divisa\s*:\s*(.+)/); R.totalFac = g(/1406\.\s*Total Factura\s*:\s*([\d.,]+)/);
    R.modoTr = g(/1903\.\s*Modo de Transporte en Frontera:[ \t]*(\S[^\n]*)/); R.desc = all(/1805\.\s*Descripci[oó]n de las mercanc[ií]as:\s*(.*)/g).join(' · '); R.taric = all(/1809\.\s*C[oó]digo TARIC:\s*(.*)/g).join(' · ');
    const sum = (re) => { const v = all(re).map(duaNum).filter((x) => !Number.isNaN(x)); return v.length ? String(rr(v.reduce((a, b) => a + b, 0))) : ''; };
    R.bruta = sum(/1804\.\s*Masa Bruta \(Kg\):\s*([\d.,]+)/g); R.neta = sum(/1801\.\s*Masa Neta\s*\(kg\):\s*([\d.,]+)/g);
    const trib = (ini, fin) => {
      const a = L.findIndex((l) => l.startsWith(ini)); if (a < 0) return {};
      const o = {};
      for (let i = a + 1; i < L.length && !L[i].startsWith(fin) && !/^Calculado a Pagar|^1314\./.test(L[i]); i++) {
        const m = L[i].match(/^([A-Za-zÁÉÍÓÚ0-9]{3,4})\s+(.+)$/); if (!m || !/€|%|\/\s*KGM/.test(m[2])) continue;
        const s = (`${m[2]} ${L[i + 1] && !/^[A-Z0-9]{3,4}\s/.test(L[i + 1]) ? L[i + 1] : ''}`).replace(/(\d)\s+,(\d)/g, '$1,$2'), esp = s.match(/(\d[\d.]*,\d{4,6})\s*K/), adv = s.match(/([\d.]+,\d\d)\s*€\s+[\d.,]+\s*%/),
          tip = s.match(/([\d.,]+\s*%|[\d.,]+\s*\/\s*KGM)/), imps = [...s.matchAll(/([\d.]+,\d\d)\s*€/g)].map((x) => duaEur(x[1]));
        const base = adv ? duaEur(adv[1]) : esp ? duaNum(esp[1]) : null, bTxt = adv ? '' : esp ? 'kg' : '', impo = adv ? imps[1] : imps[0];
        const k = /envases de pl/i.test(s) ? '1PL' : /antidumping/i.test(s) ? 'A30' : /Derechos\s+(de\s+)?Aduana/i.test(s) ? 'A00' : /I\.?\s*V\.?\s*A\.?/.test(s) ? 'B00' : duaCod(m[1]), prev = o[k];
        o[k] = { cod: k, base: prev && base !== null ? rr((prev.base || 0) + base) : base, ud: bTxt, tipo: tip ? tip[1].replace(/\s+/g, ' ') : '', imp: rr((prev ? prev.imp : 0) + (impo || 0)) };
      }
      return o;
    };
    R.declarados = trib('Tributos Declarados', 'Tributos Calculados'); R.calculados = trib('Tributos Calculados', 'Importe IVA Diferido');
    R.ivaDif = g(/Importe IVA Diferido:\s*([\d.,]+)/);
    return R;
  }
  // Texto del PDF del DUA; si es un escaneo (sin capa de texto), se lee con OCR (Tesseract, se descarga la primera vez)
  async function duaTexto(file) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js).');
    lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, pags = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pags.push(lineasPagina(tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))).join('\n'));
    }
    if (pags.join('').replace(/\s/g, '').length >= 60 * doc.numPages) return pags.join('\n');
    await cargarTesseract();
    const w = await window.Tesseract.createWorker('spa'), out = [];
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        duaMsg = `${file.name}: leyendo el escaneo (OCR) página ${p} de ${doc.numPages}…`; render();
        const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 2 }), cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        out.push((await w.recognize(cv)).data.text);
      }
    } finally { await w.terminate(); }
    return out.join('\n');
  }
  const duaRegs = () => S.registros.filter((r) => r.tipo === 'dua' && r.empresa_id === S.sel && r.datos?.num);
  const duaVal = (R, k) => (R.man && R.man[k] !== undefined ? R.man[k] : R[k] || '');
  const duaFixTrib = (R) => { ['declarados', 'calculados'].forEach((t) => { const o = R[t] || {}, n = {}; Object.keys(o).forEach((k) => { const c = duaCod(k), x = { ...o[k], cod: c }; n[c] = n[c] ? { ...x, imp: rr((n[c].imp || 0) + (x.imp || 0)) } : x; }); R[t] = n; }); return R; };
  async function duaCargar(files) {
    let n = 0; const mal = [], otras = [];
    for (const f of files.filter((x) => /\.pdf$/i.test(x.name))) {
      try {
        duaMsg = `Leyendo ${f.name}…`; render();
        const R = duaDeTexto(await duaTexto(f));
        // el número del nombre del archivo manda si el PDF no lo trae o el OCR lo ha leído con un par de errores (5 por 6…)
        const fm = /\d\dES\d{6}[A-Z0-9]{8}/i.exec(String(f.name).replace(/\s/g, '')), fn = fm ? fm[0].toUpperCase() : '';
        if (fn && (!R.num || [...fn].filter((ch, i) => ch !== R.num[i]).length <= 2)) R.num = fn;
        if (!R.num) { mal.push(`${f.name} (no parece un DUA de importación: no encuentro «Importación. Detallada»)`); continue; }
        const prev = duaRegs().find((r) => r.datos.num === R.num), regId = prev?.id ?? crypto.randomUUID(), sub = await subir(S.sel, 'dua', regId, 'pdf', f);
        if (sub.error) mal.push(`${f.name} (PDF no guardado: ${sub.error})`);
        const fe = duaFecha(R.levante || R.grab), datos = { ...R, archivo: f.name, man: prev?.datos?.man ?? {}, arch: sub.val ?? prev?.datos?.arch }, ej = fe ? fe.y : Number(S.ejercicio);
        const err = await guardarRegistro(prev, prev ? { datos, ejercicio: ej } : { id: regId, empresa_id: S.sel, tipo: 'dua', ejercicio: ej, datos });
        if (err) { mal.push(`${f.name} (${err})`); continue; }
        n++; duaSel = R.num; if (fe) duaMes = `${fe.y}-${String(fe.m).padStart(2, '0')}`;
        const nifImp = (/^ES([A-Z0-9]+)/.exec(R.importador) || [])[1];
        if (nifImp && nifImp !== empresa()?.cif) otras.push(`${R.num}: el importador (${nifImp}) no es la empresa seleccionada`);
      } catch (err) { mal.push(`${f.name} (${err.message})`); }
    }
    duaMsg = `${n} DUA leído(s)${otras.length ? ` · ojo: ${otras.join('; ')}` : ''}${mal.length ? ` · sin leer: ${mal.join(', ')}` : ''}`;
    await cargar(); render();
  }
  async function duaCampo(clave, valor) {
    const [num, k] = clave.split('|'), reg = duaRegs().find((r) => r.datos.num === num);
    if (!reg) return;
    const datos = { ...reg.datos, man: { ...(reg.datos.man ?? {}), [k]: String(valor).trim() } };
    const err = await guardarRegistro(reg, { datos });
    if (err) return void alert(err);
    await cargar(); render();
  }
  async function duaQuitar(num) {
    const reg = duaRegs().find((r) => r.datos.num === num);
    if (!reg || !confirm(`¿Eliminar el DUA ${num}?`)) return;
    await quitarArchivos(rutas({ a: reg.datos.arch }));
    const { error } = await db.from('registros').delete().eq('id', reg.id);
    if (error) return void alert(error.message);
    duaSel = null; await cargar(); render();
  }
  function duaSeleccionar(num, clics) {
    const reg = duaRegs().find((r) => r.datos.num === num);
    if (clics >= 2) return;
    if (duaSel !== num) { duaSel = num; render(); }
  }
  // doble clic en la fila: abre el PDF en otra pestaña (la ventana se abre ya, en el gesto del usuario, para que el navegador no la bloquee)
  async function abrirNuevaPestana(path) {
    const w = window.open('', '_blank');
    const { data, error } = await db.storage.from('documentos').createSignedUrl(path, 300);
    if (error || !data) { w?.close(); return void alert(error?.message ?? 'No se pudo abrir el PDF'); }
    if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank');
    return undefined;
  }
  function duaAbrir(num) {
    const reg = duaRegs().find((r) => r.datos.num === num);
    if (reg?.datos?.arch?.path) return abrirNuevaPestana(reg.datos.arch.path);
    duaMsg = 'Este DUA no tiene el PDF guardado: vuelve a soltarlo.'; render();
    return undefined;
  }
  const setDuaMes = (v) => { duaMes = v; render(); };
  function vistaDua() {
    if (!S.sel) return sinEmpresa;
    const regs = duaRegs().map((r) => duaFixTrib({ ...r.datos })), ed = puede(), e = empresa();
    const mesDe = (R) => { const f = duaFecha(R.levante || R.grab); return f ? `${f.y}-${String(f.m).padStart(2, '0')}` : 'sin fecha'; };
    const meses = [...new Set(regs.map(mesDe))].sort(), defM = /^\d\d$/.test(S.periodo ?? '') ? `${S.ejercicio}-${S.periodo}` : null;
    const mesSel = duaMes && (meses.includes(duaMes) || duaMes === 'todos') ? duaMes : (defM && meses.includes(defM) ? defM : 'todos');
    const nomM = (k) => { const m = /^(\d{4})-(\d\d)$/.exec(k); return m ? `${MESES[+m[2] - 1][0].toUpperCase()}${MESES[+m[2] - 1].slice(1)} ${m[1]}` : k; };
    const tr = (R, c) => (R.declarados || {})[c] || (R.calculados || {})[c] || null;
    const celdas = (R, c) => { const t = tr(R, c); return t ? `<td class="num g1">${t.base === null ? '—' : t.ud === 'kg' ? `${t.base.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg` : fnum(t.base)}</td><td class="c mid">${esc(duaTipo(t.tipo))}</td><td class="num g3">${fnum(t.imp)}</td>` : '<td class="num g1">—</td><td class="c mid">—</td><td class="num g3">—</td>'; };
    const tabla = (lista, tit) => {
      const ORD = ['B00', 'A00', '1PL', 'A30'], cods = [...new Set(['B00', 'A00', '1PL'].concat(...lista.map((R) => Object.keys(R.declarados || {}).concat(Object.keys(R.calculados || {})))))].sort((a, b) => { const x = ORD.indexOf(a), y = ORD.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b); });
      const tot = {}; cods.forEach((c) => { tot[c] = [0, 0, false]; });
      lista.forEach((R) => cods.forEach((c) => { const t = tr(R, c); if (t) { if (t.ud !== 'kg') tot[c][0] += t.base || 0; else tot[c][2] = true; tot[c][1] += t.imp || 0; } }));
      const neta = (R) => { const v = duaVal(R, 'neta'); return v && !Number.isNaN(duaNum(v)) ? duaNum(v).toLocaleString('es-ES', { maximumFractionDigits: 3 }) : esc(v); };
      return `<h4 class="it-sec">${esc(tit)} · ${lista.length} DUA</h4><div class="wrap"><table class="tprs tnom il-t dua-t"><thead><tr><th rowspan="2">Nº DUA</th><th rowspan="2">Importador</th><th rowspan="2">Exportador</th><th rowspan="2">País</th><th rowspan="2">TARIC</th><th rowspan="2">Masa neta (kg)</th><th rowspan="2">Lugar precisado</th><th rowspan="2">Medio transporte llegada</th>${cods.map((c) => `<th colspan="3">${esc(c)}${DUA_TRIB[c] ? ' · ' + DUA_TRIB[c] : ''}</th>`).join('')}</tr>
        <tr>${'<th class="g1">Base imponible</th><th class="mid">Tipo</th><th class="g3">Importe</th>'.repeat(cods.length)}</tr></thead><tbody>
        ${lista.map((R) => `<tr data-duasel="${esc(R.num)}" style="cursor:pointer${R.num === duaSel ? ';background:#fff6d6' : ''}"><td${R.arch?.path ? '' : ' title="Sin PDF guardado: suéltalo de nuevo"'}>${esc(R.num)}</td><td>${esc(duaVal(R, 'importador').replace(/^ES[A-Z0-9]+\s*-\s*/, ''))}</td><td>${esc(duaVal(R, 'expedidor'))}</td><td>${esc(duaVal(R, 'paisExp'))}</td>
          <td>${esc((String(duaVal(R, 'taric')).replace(/\s/g, '').match(/\d{8,10}/g) || []).join(' · '))}</td><td class="num">${neta(R)}</td><td>${esc(duaVal(R, 'lugar'))}</td><td>${esc(duaVal(R, 'transporte'))}</td>${cods.map((c) => celdas(R, c)).join('')}</tr>`).join('')}
        <tr class="ttot"><td colspan="8">Total ${esc(tit)}</td>${cods.map((c) => `<td class="num g1">${tot[c][2] && !tot[c][0] ? '' : fnum(rr(tot[c][0]))}</td><td class="mid"></td><td class="num g3">${fnum(rr(tot[c][1]))}</td>`).join('')}</tr></tbody></table></div>`;
    };
    const porMes = mesSel === 'todos' ? meses : [mesSel];
    const tablas = regs.length ? porMes.map((k) => tabla(regs.filter((R) => mesDe(R) === k).sort((a, b) => (a.levante || '').localeCompare(b.levante || '')), nomM(k))).join('') : '<p class="hint">Todavía no hay DUA cargados para esta empresa.</p>';
    const Sel = regs.find((R) => R.num === duaSel) ?? null;
    const tribT = (o, t) => { const xs = Object.values(o || {}); return xs.length ? `<h4 class="it-sec">${t}</h4><table class="tprs tnom il-t dua-t" style="width:auto"><thead><tr><th>Tributo</th><th>Base</th><th>Tipo</th><th>Importe</th></tr></thead><tbody>${xs.map((x) => `<tr><td><b>${esc(x.cod)}</b>${DUA_TRIB[x.cod] ? `<br><small>${DUA_TRIB[x.cod]}</small>` : ''}</td><td class="num">${x.base === null ? '—' : x.ud === 'kg' ? `${x.base.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg` : fnum(x.base)}</td><td class="c">${esc(duaTipo(x.tipo))}</td><td class="num">${fnum(x.imp)}</td></tr>`).join('')}</tbody></table>` : ''; };
    const ficha = Sel ? `<section class="dsec dua-s"><h3>DUA ${esc(Sel.num)} ${ed ? `<button class="small" data-act="m-duadel" data-n="${esc(Sel.num)}">Eliminar</button>` : ''}</h3><p class="dash-s">Leído de ${esc(Sel.archivo || '')}. Los campos se pueden corregir.</p>
      <div class="css-flex" style="align-items:flex-start;gap:1.5rem"><table class="tprs tnom il-t dua-t" style="width:auto"><tbody>${DUA_CAMPOS.map(([k, t]) => `<tr><td>${esc(t)}</td><td class="in"><input data-duacampo="${esc(Sel.num)}|${k}" value="${esc(duaVal(Sel, k))}" size="${Math.max(8, String(duaVal(Sel, k)).length + 1)}"${ed ? '' : ' readonly'}></td></tr>`).join('')}</tbody></table>
      <div>${tribT(Sel.calculados, 'Tributos calculados')}${tribT(Sel.declarados, 'Tributos declarados')}${Sel.ivaDif ? `<p><b>Importe IVA diferido: ${fnum(duaNum(Sel.ivaDif))}</b></p>` : ''}</div></div></section>` : '';
    return `${ed ? dz('dua', 'Suelta aquí los PDF de los DUA (H1)', 'o pulsa para elegirlos. Puedes soltar varios a la vez; se ordenan por el mes de la fecha de levante.', '.pdf') : ''}<section class="dsec dua-s"><h3>DUA-H1 · ${esc(e.nombre)}</h3>
      ${duaMsg ? `<p class="dash-s">${esc(duaMsg)}</p>` : ''}
      <div class="dua-bar"><b>Mes</b> <select data-duames="1"><option value="todos">Todos</option>${meses.map((k) => `<option value="${k}"${k === mesSel ? ' selected' : ''}>${esc(nomM(k))}</option>`).join('')}</select>
        <span class="dash-s">Pulsa una fila para ver su detalle; doble clic para abrir el PDF en otra pestaña.</span></div>${tablas}</section>${ficha}`;
  }

  function vistaCnom() {
    if (!S.sel) return sinEmpresa;
    const e = empresa(), y = Number(S.ejercicio), trim = e.tipo === 'PYME';
    const N = MM12.map((mm) => nomMes(y, mm));
    const hay = N.some(Boolean);
    const n = (v) => (v === null || v === undefined || isNaN(v) ? '—' : fnum(rr(v)));
    const pc = (v) => (v === null || !isFinite(v) ? '—' : `${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
    const dd = (a, b) => (a === null || a === undefined || b === null || b === undefined ? '<td class="num" style="color:#777">—</td>'
      : `<td class="num" style="font-weight:600;color:${Math.abs(a - b) <= 0.9 ? '#1a7f37' : '#b42318'}">${Math.abs(a - b) <= 0.9 ? '✓' : fnum(rr(a - b))}</td>`);
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
      <p class="hint">Control del cuadrante de la gestoría (pestaña Nóminas) frente al 111 y al 190 presentados (pestaña Impuestos Presentados). Base sujeta = devengado − kilometraje − dietas (exentos); las indemnizaciones se toman como sujetas. ✓ = cuadra (±0,90 €).${hay ? '' : ` <b>No hay nóminas de ${y}: rellénalas en 9.- Nóminas.</b>`}</p>
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
    if (archKind === 'fundae') return cargarFundae(files);
    if (archKind === 'sys') return cargarSYS(files);
    if (archKind === 'impuestos') return cargarPdfs(files);
    if (archKind === 'registro') return cargarRegistro(files);
    if (!S.sel) return void alert('Elige primero la empresa en el desplegable de la izquierda.');
    const informe = [], vistos = new Set();
    for (const f of files) {
      try {
        const ref = `${f.name}|${f.size}`;
        const leible = ['emitidas', 'recibidas', 'sii', 'extractos'].includes(archKind); // estos se vuelven a leer aunque el archivo ya esté guardado (puede que la lectura anterior fallara)
        const yaGuardado = archivosDe(archKind).some((r) => r.datos.ref === ref);
        if (vistos.has(ref) || (yaGuardado && !leible)) { informe.push(`↩ ${f.name}: repetido`); continue; }
        vistos.add(ref);
        if (!yaGuardado) {
          const id = crypto.randomUUID();
          const sub = await subir(S.sel, 'arch-' + archKind, id, 'archivo', f);
          if (sub.error) throw new Error(sub.error);
          const err = await guardarRegistro(null, { id, empresa_id: S.sel, tipo: 'arch-' + archKind, ejercicio: Number(S.ejercicio),
            datos: { nombre: f.name, ref, archivo: sub.val, subido: new Date().toISOString().slice(0, 10) } });
          if (err) throw new Error(err);
        }
        informe.push(['emitidas', 'recibidas', 'sii'].includes(archKind) ? await ingestaIVA(f, S.sel) : archKind === 'extractos' ? await ingestaMayor(f, S.sel) : `✔ ${f.name}`);
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
      ...acc3,
      ...R2.acciones,
      'm-liqmarca': () => toggleMarca(d.e, d.k),
      'm-iladd': () => ilAnadir(),
      'm-duadel': () => duaQuitar(d.n),
      'm-ildel': () => ilQuitar(d.id),
      'm-d365carpeta': () => d365Carpeta(d.c),
      'm-d365recoger': () => d365Recoger(true),
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
      'm-esker': () => buscarEsker(d.n),
      'm-siixl': () => excelConcSii(d.s),
      'm-fcnv': () => fcNvAbrir(d.s),
      'm-fcnvok': () => fcNvOk(),
      'm-fcnvx': () => { fcNueva = null; render(); },
      'm-manret': () => formManRet(d.m),
      'm-retprint': () => imprimirRet(d.m),
      'm-fundaedel': () => quitarFundae(d.y),
      'm-ctavis': () => accionCta('compvis', '', ''),
      'm-siicod': () => { siiCod[d.t] = d.cod; render(); },
      'm-siitodo': () => { siiTodo = true; render(); },
      'm-siidel': () => quitarSii2(d.s, d.i),
      'm-archdel': () => quitarArch(d.id),
      'm-siirec': () => recuperarSii(d.s, d.i),
      'm-siimas': () => { siiN[d.s] += 150; render(); },
      'm-ctamas': () => { ctaMas += 300; render(); },
      'm-ctaquit': () => accionCta('quit', d.id, ''),
      'm-ctanv': () => { ctaNueva = { fecha: ctaUlt.fecha, cuenta: ctaUlt.cuenta, asiento: '', desc: '', debe: '', haber: '' }; render(); },
      'm-ctanvok': () => ctaNvOk(),
      'm-ctanvx': () => { ctaNueva = null; render(); },
      'm-sube': () => {
        archKind = d.kind;
        const inp = document.getElementById('archIn');
        inp.accept = d.kind === 'impuestos' || d.kind === 'registro' ? '.pdf' : '.xlsx,.xls,.csv,.txt,.pdf';
        inp.click();
      },
      'm-pdf': () => document.getElementById('pdfIn')?.click(),
      'm-carpeta': () => document.getElementById('carpetaIn')?.click(),
    })[d.act]?.(d);
  }

  // ================= Bloque 3 · Información empresa: Entrada Información, Archivos Documentación y Checking Información =================
  // Libro grande de la empresa (facturas, SII, extracto): lo pide a la base de datos y lo deja en memoria para el resto de pestañas
  async function traer(tipo) {
    const k = `${tipo}|${S.sel}`;
    if (GR.get(k)) return GR.get(k);
    const { data } = await db.from('registros').select('datos').eq('empresa_id', S.sel).eq('tipo', tipo).maybeSingle();
    const filas = data?.datos?.filas ?? [];
    GR.set(k, filas);
    return filas;
  }

  // ---- Entrada Información: apuntes a mano en cualquier cuenta contable (misma lista que «Añadir línea» de cada extracto) ----
  let asiB = null, asiPrev = [], asiOcr = '', asiCtl = null, asiOrigen = 'texto';
  const asiBor = () => (asiB ??= { fecha: fdate(Date.now()), asiento: '', cuenta: '', desc: '', debe: '', haber: '' });
  const asiCampo = (k, v) => { asiBor()[k] = v; };
  const asiPrevCampo = (clave, v) => { const [i, k] = clave.split('|'); if (asiPrev[+i]) asiPrev[+i][k] = v; };

  // texto pegado desde Excel (Ctrl+V): tabuladores, celdas entre comillas con saltos de línea y fila de cabecera opcional
  function tsvFilas(txt) {
    const R = []; let f = [], c = '', q = false;
    const t = String(txt || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
      if (ch === '"' && c === '') { q = true; continue; }
      if (ch === '\t') { f.push(c); c = ''; continue; }
      if (ch === '\n') { f.push(c); R.push(f); f = []; c = ''; continue; }
      c += ch;
    }
    if (c !== '' || f.length) { f.push(c); R.push(f); }
    return R.map((r) => r.map((v) => v.replace(/\s+/g, ' ').trim())).filter((r) => r.some((v) => v));
  }
  function asiNum(v) {
    let x = String(v || '').replace(/[€\s]/g, '');
    if (!x || x === '-') return 0;
    let neg = false;
    if (/^\(.*\)$/.test(x)) { neg = true; x = x.slice(1, -1); }
    if (/-$/.test(x)) { neg = true; x = x.slice(0, -1); }
    if (/,\d{1,2}$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
    else if (/\.\d{1,2}$/.test(x) && /,/.test(x)) x = x.replace(/,/g, '');
    else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
    const n = parseFloat(x);
    return Number.isNaN(n) ? null : (neg ? -n : n);
  }
  // asiento metido en el concepto (p. ej. «$SS-01018349 NOMINAS JULIO»): pasa a su columna
  const asiFix = (l) => {
    const m = /^[^A-Za-z0-9]*([A-Za-z$§|]{1,6}-\d{3,})\s+(.*)$/.exec(String(l.desc || ''));
    if (!String(l.asiento || '').trim() && m) { l.asiento = m[1]; l.desc = m[2].trim(); }
    return l;
  };
  // lecturas de imagen: prefijos del asiento estropeados («SsS-…», «S$SS-…») se igualan al prefijo habitual del lote
  function asiLimpiarLote(L2) {
    L2.forEach(asiFix);
    const cnt = {};
    L2.forEach((l) => { const m = /^([A-Z]{1,5})-\d+$/.exec(String(l.asiento || '')); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; });
    const P = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (!P) return L2;
    const pre = P[0];
    L2.forEach((l) => {
      const m = /^([A-Za-z$§|]{1,6})-(\d{3,})$/.exec(String(l.asiento || '').trim());
      if (!m) return;
      const letras = m[1].toUpperCase().replace(/[^A-Z]/g, '');
      if (m[1] !== pre && (letras === pre || letras.includes(pre) || (letras.length <= pre.length + 2 && [...pre].every((ch) => letras.includes(ch))))) l.asiento = `${pre}-${m[2]}`;
    });
    return L2;
  }
  // texto suelto (de un PDF o de la lectura de una imagen): fecha, asiento, cuenta de 9 a 12 cifras, concepto e importes
  function lineasDeTextoOcr(txt, B) {
    const out = [], rxF = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/, rxImp = /-?\d{1,3}(?:[.\s]\d{3})+[,.]\d{2}\b|-?\d+[,.]\d{2}\b/g;
    const num = (x) => { const m = /^(-?[\d.\s]*?)[,.](\d{2})$/.exec(x); return m ? +`${m[1].replace(/[.\s]/g, '')}.${m[2]}` : parseES(x); };
    let prev = null;
    String(txt || '').split(/\r?\n/).forEach((raw) => {
      let s = raw.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) return;
      const tags = [...s.matchAll(/⟦([DHS]):([^⟧]+)⟧/g)].map((m) => ({ c: m[1], v: m[2] }));
      s = s.replace(/⟦[DHS]:[^⟧]+⟧/g, ' ');
      const imps = tags.length ? tags.map((t) => t.v) : (s.match(rxImp) || []).map((x) => x.replace(/\s/g, '')), mf = rxF.exec(s);
      if (!imps.length) { // fila sin importes: continuación del concepto de la anterior (texto partido en dos renglones)
        if (!mf && prev && !/^(fecha|asiento|concepto|debe|haber|saldo|divisa|importe)\b/i.test(s)) prev.desc = `${prev.desc} ${s.replace(/\bEUR\b/g, '').trim()}`.trim(); else prev = null;
        return;
      }
      if (/\bsaldo\s+(final|inicial|anterior|acumulado)\b/i.test(s)) { prev = null; return; }
      let fecha = B.fecha || '';
      if (mf) { const y = mf[3].length === 2 ? `20${mf[3]}` : mf[3]; fecha = `${mf[1].padStart(2, '0')}/${mf[2].padStart(2, '0')}/${y}`; s = s.replace(mf[0], ' '); }
      if (!tags.length) imps.forEach((x) => { s = s.replace(x, ' '); });
      s = s.replace(/\b(EUR|EURO|EUROS|€)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      let asiento = B.asiento || '', cuenta = B.cuenta || '';
      const tk = s.split(' ');
      if (tk[0] && /\d/.test(tk[0]) && /^[A-Z0-9/\-.]{3,}$/i.test(tk[0])) { asiento = tk.shift(); s = tk.join(' '); }
      const mc = /\b[1-7]\d{8,11}\b/.exec(s);
      if (mc) { cuenta = mc[0]; s = s.replace(mc[0], ' ').replace(/\s+/g, ' ').trim(); }
      const v = imps.map(num);
      let debe = '', haber = '';
      if (tags.length) { // columna según la posición del importe en la imagen
        const sum = (c) => rr(tags.reduce((a, t) => a + (t.c === c ? (num(t.v) || 0) : 0), 0)), d = sum('D'), h = sum('H');
        debe = d ? fnum(d) : ''; haber = h ? fnum(h) : '';
      } else if (v.length === 1) { if (v[0] < 0) haber = fnum(-v[0]); else debe = fnum(v[0]); } else { debe = v[0] ? fnum(v[0]) : ''; haber = v[1] ? fnum(v[1]) : ''; }
      if (!debe && !haber) { prev = null; return; }
      prev = { fecha, asiento, cuenta, desc: s, debe, haber };
      out.push(prev);
    });
    return out;
  }
  function asiDeTexto(txt, B) {
    asiCtl = null;
    const R = tsvFilas(txt);
    if (!R.length) return [];
    if (!R.some((r) => r.length > 1)) return lineasDeTextoOcr(txt, B);
    const hi = R.findIndex((r) => r.some((v) => /^fecha/.test(sinAc(v))) && r.some((v) => /^(debe|haber)/.test(sinAc(v)))), H = (hi >= 0 ? R[hi] : []).map(sinAc);
    const ix = (rx) => H.findIndex((h) => rx.test(h));
    const C = hi >= 0 ? { f: ix(/^fecha/), a: ix(/^asiento|^n.? ?asiento|documento/), c: ix(/^cuenta/), t: ix(/^concepto|^descrip/), d: ix(/^debe/), h: ix(/^haber/) } : { f: 0, a: 1, c: 2, t: 3, d: 4, h: 5 };
    const datos = R.slice(hi + 1), g = (r, k) => (k >= 0 ? (r[k] || '') : ''), out = [], fuera = [];
    let td = 0, th = 0;
    datos.forEach((r, n) => {
      const d = asiNum(g(r, C.d)), h = asiNum(g(r, C.h)), fila = hi + 2 + n;
      if (d === null || h === null) { fuera.push(`fila ${fila}: importe no válido (${g(r, C.d)} / ${g(r, C.h)})`); return; }
      if (!d && !h) { if (r.join('').trim()) fuera.push(`fila ${fila}: sin importe en Debe ni Haber`); return; }
      td += d; th += h;
      const l = { fecha: g(r, C.f) || B.fecha || '', asiento: g(r, C.a) || B.asiento || '', cuenta: g(r, C.c).replace(/\s/g, '') || B.cuenta || '', desc: g(r, C.t), debe: d ? fnum(d) : '', haber: h ? fnum(h) : '' };
      if (!fIsoCta(l.fecha)) fuera.push(`fila ${fila}: fecha no válida (${l.fecha}) — se deja para corregir`);
      if (!l.cuenta) fuera.push(`fila ${fila}: sin cuenta — se deja para corregir`);
      out.push(l);
    });
    asiCtl = { filas: datos.length, leidas: out.length, debe: rr(td), haber: rr(th), fuera, cab: hi >= 0 };
    return out;
  }
  function asiTexto(t) {
    asiOrigen = 'texto';
    const L2 = asiLimpiarLote(asiDeTexto(t, asiBor())), c = asiCtl;
    asiPrev = asiPrev.concat(L2);
    asiOcr = L2.length ? `${L2.length} línea(s) leídas del texto${c ? ` · Debe ${fnum(c.debe)} · Haber ${fnum(c.haber)}` : ''}${c?.fuera.length ? ` · ${c.fuera.length} aviso(s): ${c.fuera.slice(0, 4).join('; ')}` : ''}`
      : 'No he encontrado líneas con importes en el texto';
    render();
  }
  const cargarTesseract = () => (window.Tesseract ? Promise.resolve() : new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = ok; s.onerror = () => ko(new Error('No se ha podido descargar el lector de imágenes (hace falta internet)'));
    document.head.appendChild(s);
  }));
  // Captura de un extracto: se amplía, se lee con OCR y las filas se rehacen por la posición de cada palabra (Debe/Haber por columna)
  async function asiLeerImagen(blob) {
    const B = asiBor();
    asiOrigen = 'imagen'; asiOcr = 'Leyendo la imagen…'; render();
    try {
      await cargarTesseract();
      const img = await createImageBitmap(blob), k = Math.min(3, Math.max(1, 2000 / Math.max(img.width, 1))), cv = document.createElement('canvas');
      cv.width = img.width * k; cv.height = img.height * k;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, cv.width, cv.height);
      const w = await window.Tesseract.createWorker('spa');
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      const r = await w.recognize(cv);
      await w.terminate();
      const W = (r.data.words || []).filter((x) => String(x.text || '').trim()).map((x) => ({ t: x.text, x: x.bbox.x0, x1: x.bbox.x1, y: (x.bbox.y0 + x.bbox.y1) / 2, h: x.bbox.y1 - x.bbox.y0 }));
      const esImp = (t) => /^-?\d{1,3}(?:[.\s]\d{3})+[,.]\d{2}$|^-?\d+[,.]\d{2}$/.test(String(t).trim());
      const imW = W.filter((x) => esImp(x.t)), cab = { D: W.find((x) => /^debe$/i.test(x.t)), H: W.find((x) => /^haber$/i.test(x.t)), S: W.find((x) => /^saldo$/i.test(x.t)) };
      let colDe = null;
      if (cab.D && cab.H) { // con cabecera Debe/Haber/Saldo se usa su sitio
        const cs = Object.entries(cab).filter(([, v]) => v).map(([kk, v]) => [kk, (v.x + v.x1) / 2]);
        colDe = (x) => cs.reduce((m, c) => (Math.abs(c[1] - (x.x + x.x1) / 2) < Math.abs(m[1] - (x.x + x.x1) / 2) ? c : m))[0];
      } else if (imW.length) { // sin cabecera: los importes se agrupan por su borde derecho
        const tol = cv.width * 0.04, xs = imW.map((x) => x.x1).sort((a, b) => a - b), gr = [];
        xs.forEach((v) => { const g = gr[gr.length - 1]; if (g && v - g.max <= tol) { g.v.push(v); g.max = v; } else gr.push({ v: [v], max: v }); });
        const cen = gr.map((g) => g.v.reduce((s, v) => s + v, 0) / g.v.length), et = cen.length >= 3 ? ['D', 'H', 'S'] : cen.length === 2 ? ['D', 'H'] : ['D'];
        if (cen.length >= 2) colDe = (x) => { let kk = 0; cen.forEach((c, i) => { if (Math.abs(c - x.x1) < Math.abs(cen[kk] - x.x1)) kk = i; }); return et[Math.min(kk, et.length - 1)]; };
      }
      if (colDe) W.forEach((x) => { if (esImp(x.t)) x.t = `⟦${colDe(x)}:${x.t.trim()}⟧`; });
      let texto = r.data.text;
      if (W.length) {
        const hs = W.map((x) => x.h).sort((a, b) => a - b), tol = Math.max(4, (hs[Math.floor(hs.length / 2)] || 10) * 0.6), filas = [];
        [...W].sort((a, b) => a.y - b.y).forEach((x) => { const f = filas.find((ff) => Math.abs(ff.y - x.y) <= tol); if (f) { f.w.push(x); f.y = (f.y * (f.w.length - 1) + x.y) / f.w.length; } else filas.push({ y: x.y, w: [x] }); });
        texto = filas.sort((a, b) => a.y - b.y).map((f) => f.w.sort((a, b) => a.x - b.x).map((x) => x.t).join(' ')).join('\n');
      }
      const L2 = asiLimpiarLote(lineasDeTextoOcr(texto, B));
      asiPrev = asiPrev.concat(L2);
      asiOcr = L2.length ? `${L2.length} línea(s) leídas de la imagen: revísalas antes de registrar` : 'No he encontrado líneas con importes en la imagen';
    } catch (e) { asiOcr = `⚠ ${e.message}`; }
    render();
  }
  async function asiImagenes(files) { for (const f of files) { if (/^image\//.test(f.type)) await asiLeerImagen(f); } }
  function asiPegar(ev) {
    const cd = ev.clipboardData;
    if (!cd) return;
    ev.preventDefault();
    const it = [...cd.items].find((i) => i.type.startsWith('image/'));
    if (it) return void asiLeerImagen(it.getAsFile());
    const t = cd.getData('text');
    if (t) asiTexto(t);
    return undefined;
  }
  async function asiPegarBoton() {
    try {
      for (const it of await navigator.clipboard.read()) {
        const ty = it.types.find((x) => x.startsWith('image/'));
        if (ty) return void asiLeerImagen(await it.getType(ty));
      }
      const txt = await navigator.clipboard.readText();
      if (txt) return void asiTexto(txt);
      return void alert('No hay ninguna imagen ni texto en el portapapeles.');
    } catch { return void alert('El navegador no deja leer el portapapeles desde el botón: haz clic en el recuadro y pulsa Ctrl+V.'); }
  }
  const asiValida = (l) => {
    const f = fIsoCta(l.fecha), cuenta = String(l.cuenta || '').trim(), debe = rr(parseES(l.debe)), haber = rr(parseES(l.haber));
    return f && cuenta && (debe || haber) ? { fecha: f, cuenta, asiento: String(l.asiento || '').trim(), desc: String(l.desc || '').trim(), debe, haber } : null;
  };
  // Registra las líneas válidas en la configuración de cuentas de la empresa; devuelve las que no valen (sin fecha, cuenta o importe)
  async function asiRegistrar(lineas, origen) {
    if (!S.sel) return void alert('Elige primero la empresa en el desplegable de la izquierda.');
    const ok = [], mal = [];
    lineas.forEach((l) => { const v = asiValida(l); if (v) ok.push(v); else mal.push(l); });
    if (!ok.length) return void alert('Rellena la fecha (dd/mm/aaaa), la cuenta y un importe en debe o en haber.');
    const lote = origen ? Date.now() : null;
    await guardarCta((d) => { ok.forEach((v) => (d.lineas ??= []).push({ id: crypto.randomUUID(), ...v, ...(lote ? { lote, origen } : {}) })); });
    return mal;
  }
  async function asiRegUna() {
    const B = asiBor(), mal = await asiRegistrar([B]);
    if (mal && !mal.length) { asiB = { ...B, cuenta: '', desc: '', debe: '', haber: '' }; render(); } // la fecha y el asiento se mantienen para la siguiente
  }
  async function asiRegPrev() {
    asiLimpiarLote(asiPrev);
    const mal = await asiRegistrar(asiPrev, asiOrigen);
    if (!mal) return;
    asiPrev = mal;
    asiOcr = mal.length ? `${mal.length} línea(s) sin fecha, cuenta o importe: corrígelas y vuelve a registrar` : '';
    render();
  }
  const asiQuitarLote = (lote) => confirm('¿Quitar todas las líneas de este lote de las cuentas contables?')
    && guardarCta((d) => { d.lineas = (d.lineas ?? []).filter((x) => String(x.lote) !== String(lote)); });

  function vistaAsi() {
    if (!S.sel) return sinEmpresa;
    const ed = puede(), B = asiBor(), cfg = ctaCfg(), dis = ed ? '' : ' disabled';
    const inp = (k, w, ph, cls = '') => `<td class="in ${cls}"><input data-asib="${k}" value="${esc(B[k] ?? '')}" size="${w}" placeholder="${esc(ph)}"${dis}></td>`;
    const CAB = '<th>Fecha</th><th>Asiento</th><th>Cuenta contable</th><th>Concepto</th><th>Debe</th><th>Haber</th>';
    const form = `<section class="prs-card"><div class="prs-h">Nueva línea en una cuenta contable</div><div class="wrap"><table class="tprs tnom" style="width:auto"><thead><tr>${CAB}<th></th></tr></thead>
      <tbody><tr>${inp('fecha', 11, 'dd/mm/aaaa', 'c')}${inp('asiento', 12, 'nº asiento')}${inp('cuenta', 14, 'p. ej. 470000001')}${inp('desc', 40, 'concepto')}${inp('debe', 12, '', 'num')}${inp('haber', 12, '', 'num')}
      <td>${ed ? '<button class="small" data-act="m-asireg">Registrar</button>' : ''}</td></tr></tbody></table></div>
      <p class="hint">La línea va a la cuenta contable indicada y aparece en su extracto (pestañas del bloque 5), ordenada por fecha. Tras registrar se vacía para meter la siguiente (la fecha y el asiento se mantienen).</p></section>`;
    const ip = (i, k, w, cls = '') => `<td class="in ${cls}"><input data-asip="${i}|${k}" value="${esc(asiPrev[i][k] ?? '')}" size="${w}"></td>`;
    const prev = asiPrev.length ? `<div class="wrap"><table class="tprs tnom" style="width:auto"><thead><tr>${CAB}<th></th></tr></thead><tbody>
      ${asiPrev.map((l, i) => `<tr>${ip(i, 'fecha', 11, 'c')}${ip(i, 'asiento', 12)}${ip(i, 'cuenta', 14)}${ip(i, 'desc', 40)}${ip(i, 'debe', 12, 'num')}${ip(i, 'haber', 12, 'num')}
        <td><button class="small" data-act="m-asipswap" data-i="${i}" title="Pasar el importe de Debe a Haber o al revés">⇄</button> <button class="small" data-act="m-asipdel" data-i="${i}" title="Quitar esta línea">✖</button></td></tr>`).join('')}</tbody></table></div>
      <div style="margin-top:.5rem"><button class="small" data-act="m-asipreg">Registrar todas (${asiPrev.length})</button> <button class="small" data-act="m-asipvaciar">Descartar</button></div>
      <p class="hint">La lectura de imágenes no es perfecta: revisa cuentas e importes. Debe y Haber se distinguen por la columna en que está cada importe (con o sin cabecera); si no se sabe, va a Debe (usa ⇄ para pasarlo a Haber). Las líneas sin fecha, asiento o cuenta toman las del formulario de arriba.</p>` : '';
    const imagen = ed ? `<section class="prs-card"><div class="prs-h">Líneas desde una imagen o texto pegado</div>
      <div style="display:flex;gap:.6rem;align-items:stretch;flex-wrap:wrap"><div contenteditable="true" data-asipega="1" style="flex:1;min-width:280px;min-height:64px;border:2px dashed #7f9bd8;border-radius:6px;padding:.6rem;outline:none;cursor:text" title="Haz clic aquí y pulsa Ctrl+V"><b>Haz clic aquí y pulsa Ctrl+V</b> para pegar una captura o líneas copiadas de Excel</div>
        <button class="small" data-act="m-asipegabtn">📋 Pegar del portapapeles</button>
        ${dz('asiimg', 'o suelta / elige', 'un archivo de imagen', 'image/*')}</div>
      <textarea id="asiPegaTxt" rows="4" style="width:100%;margin-top:.5rem;font-size:.85rem" placeholder="…o pega aquí líneas de Excel, del ERP o de un PDF: fecha, asiento, cuenta, concepto, debe y haber (con o sin fila de cabecera)"></textarea>
      <div style="margin:.4rem 0"><button class="small" data-act="m-asipegatxt">Leer el texto</button> <span class="hint">Las líneas salen abajo para revisarlas antes de registrarlas.</span></div>
      ${asiOcr ? `<p class="hint"><b>${esc(asiOcr)}</b></p>` : ''}${prev}</section>` : '';
    const todas = cfg.lineas ?? [], G = new Map();
    todas.filter((l) => l.lote).forEach((l) => {
      const g = G.get(l.lote) ?? G.set(l.lote, { k: l.lote, n: 0, d: 0, h: 0, cts: new Set(), f1: l.fecha, f2: l.fecha, o: l.origen || 'imagen' }).get(l.lote);
      g.n++; g.d += +l.debe || 0; g.h += +l.haber || 0; g.cts.add(l.cuenta); if (l.fecha < g.f1) g.f1 = l.fecha; if (l.fecha > g.f2) g.f2 = l.fecha;
    });
    const lotes = G.size ? `<section class="prs-card"><div class="prs-h">Lotes registrados desde imagen o texto · ${G.size}</div><div class="wrap"><table class="tprs tnom" style="width:auto"><thead><tr><th>Registrado</th><th>Origen</th><th>Líneas</th><th>Cuentas</th><th>Fechas</th><th>Debe</th><th>Haber</th><th></th></tr></thead><tbody>
      ${[...G.values()].sort((a, b) => b.k - a.k).map((g) => `<tr><td>${new Date(+g.k).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(g.o)}</td><td class="c">${g.n}</td><td>${esc([...g.cts].slice(0, 4).join(', ') + (g.cts.size > 4 ? ' …' : ''))}</td>
        <td>${fdate(Date.parse(g.f1))}${g.f2 !== g.f1 ? ` a ${fdate(Date.parse(g.f2))}` : ''}</td><td class="num">${fnum(g.d)}</td><td class="num">${fnum(g.h)}</td><td>${ed ? `<button class="small danger" data-act="m-asilotedel" data-lote="${g.k}">✖ Quitar lote</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Quitar un lote borra todas sus líneas de las cuentas contables de una vez.</p></section>` : '';
    const A = [...todas].sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta)) || String(a.fecha).localeCompare(String(b.fecha)));
    const nq = Object.keys(cfg.quit ?? {}).length;
    const lista = `<section class="prs-card"><div class="prs-h">Líneas metidas a mano · ${A.length}</div>${A.length ? `<div class="wrap"><table class="tprs tnom" style="width:auto"><thead><tr><th>Cuenta</th><th>Fecha</th><th>Asiento</th><th>Concepto</th><th>Debe</th><th>Haber</th><th></th></tr></thead><tbody>
      ${A.slice(0, 300).map((l) => `<tr><td>${esc(l.cuenta)}</td><td class="c">${fdate(Date.parse(l.fecha))}</td><td>${esc(l.asiento)}</td><td>${esc(l.desc)}</td><td class="num">${l.debe ? fnum(l.debe) : ''}</td><td class="num">${l.haber ? fnum(l.haber) : ''}</td>
        <td>${ed ? `<button class="small" data-act="m-asiquit" data-id="${l.id}" title="Quitar esta línea">✖</button>` : ''}</td></tr>`).join('')}</tbody></table></div>${A.length > 300 ? `<p class="hint">Se muestran las 300 primeras de ${A.length}.</p>` : ''}` : '<p class="hint">Todavía no hay líneas metidas a mano en esta empresa.</p>'}
      ${nq && ed ? `<p class="hint">Hay ${nq} apunte(s) de los extractos quitados en las cuentas. <button class="small" data-act="m-asirest">Volver a poner todos los quitados</button></p>` : ''}</section>`;
    return `${form}${imagen}${lotes}${lista}`;
  }

  // ---- Archivos Documentación: todo lo que se ha dejado en la empresa y cuántas líneas se han leído de cada archivo ----
  const KIND_STORES = { emitidas: ['fact-E', 'fact-R'], recibidas: ['fact-E', 'fact-R'], sii: ['sii-E', 'sii-R'], extractos: ['may-mov'] };
  const STORES_REV = [['fact-E', 'Libro emitidas', 'ff'], ['fact-R', 'Libro recibidas', 'fecha'], ['sii-E', 'SII emitidas', 'fecha'], ['sii-R', 'SII recibidas', 'fecha'], ['may-mov', 'Extracto contable', 'fecha']];
  function revDatos() {
    if (!S.sel) return null;
    const st = {};
    let cargando = false;
    STORES_REV.forEach(([t]) => { const d = grande(t); if (d === null) cargando = true; st[t] = d ?? []; });
    const filas = Object.keys(ARCH).flatMap((k) => S.registros.filter((r) => r.tipo === `arch-${k}` && r.empresa_id === S.sel)
      .sort((a, b) => String(b.datos.subido).localeCompare(String(a.datos.subido))).map((r) => {
        const ts = KIND_STORES[k];
        let n = null, desde = '', hasta = '', sinOrigen = false;
        if (ts) {
          const ls = ts.flatMap((t) => st[t].filter((x) => x.src === r.datos.nombre)), fs = ls.map((x) => x.ff || x.fecha).filter(Boolean).sort();
          n = ls.length; desde = fs[0] ?? ''; hasta = fs[fs.length - 1] ?? '';
          sinOrigen = !n && ts.some((t) => st[t].length && !st[t].some((x) => x.src));
        }
        return { r, k, n, desde, hasta, sinOrigen };
      }));
    return { st, filas, cargando, nRev: filas.filter((f) => f.n === 0 && !f.sinOrigen).length };
  }
  function vistaRev() {
    if (!S.sel) return sinEmpresa;
    const D = revDatos(), ed = puede();
    const fd = (iso) => (iso ? fdate(Date.parse(iso)) : '');
    const resumen = STORES_REV.map(([t, nom, campo]) => {
      const d = D.st[t], fs = d.map((x) => x[campo] || x.fecha).filter(Boolean).sort();
      return `<div class="xc-k"><div class="xc-kt">${nom}</div><div class="xc-kv">${D.cargando && !d.length ? '…' : d.length}</div><small>${fs.length ? `${fd(fs[0])} → ${fd(fs[fs.length - 1])}` : 'sin líneas'}</small></div>`;
    }).join('');
    const estado = (f) => (f.n === null ? '<span class="hint">se guarda tal cual</span>'
      : f.n > 0 ? `<span class="verde">✔ ${f.n} líneas</span>` : f.sinOrigen ? '<span class="hint">cargado antes de guardar el origen: no se puede contar</span>'
        : D.cargando ? '…' : '<b class="rojo">✖ Sin líneas leídas · revisa el formato del archivo</b>');
    const filas = D.filas.map((f) => `<tr class="${f.n === 0 && !f.sinOrigen ? 'cf-ko' : f.n > 0 ? 'cf-ok' : ''}"><td>${ARCH[f.k]}</td><td>${esc(f.r.datos.nombre)}</td><td class="c">${esc(f.r.datos.subido ?? '')}</td><td class="c">${f.r.ejercicio ?? ''}</td>
      <td>${estado(f)}</td><td class="c">${f.desde ? `${fd(f.desde)} → ${fd(f.hasta)}` : ''}</td><td>${verArchivo(f.r.datos.archivo)}</td>
      <td>${ed ? `<button class="small danger" data-act="m-archdel" data-id="${f.r.id}" title="Quitar el archivo y los datos que aportó">✖ Quitar</button>` : ''}</td></tr>`).join('');
    return `<div class="fc-cab"><span><b>${esc(empresa().nombre)}</b> · ${D.filas.length} archivos guardados${D.nRev ? ` · <b class="rojo">${D.nRev} por revisar</b>` : D.filas.length ? ' · <span class="verde">Revisado ✓</span>' : ''}</span></div>
      <div class="xc-kg" style="margin:.4rem 0 .8rem">${resumen}</div>
      <section class="prs-card"><div class="prs-h">Archivos de la empresa</div>${D.filas.length ? `<div class="wrap"><table class="tprs tnom" style="width:auto"><thead><tr><th>Tipo</th><th>Archivo</th><th>Subido</th><th>Ejercicio</th><th>Lectura</th><th>Fechas leídas</th><th></th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : '<p class="hint">Todavía no hay archivos cargados en esta empresa. Se suben en las zonas de carga de cada pestaña (libros, SII, extractos, SYS y nóminas).</p>'}
      <p class="hint">Para cada archivo se cuentan las líneas que la app ha leído y el rango de fechas que contienen. Un archivo con «Sin líneas leídas» se guardó pero no se reconoció su formato (libro de IVA del ERP, consulta del SII o extracto con fecha, cuenta, debe y haber). Las columnas se reconocen solas por su cabecera.</p></section>`;
  }

  // ---- Checking Información: lo declarado frente a lo contabilizado, de una vez, para el ejercicio y periodo elegidos ----
  const MARGEN_RET = 0.2 + 1e-9, MARGEN_IVA = 0.1 + 1e-9;
  let chkR = null, chkOcupado = false;
  const chkClave = () => `${S.sel}|${S.ejercicio}|${S.periodo}`;
  const mesesPer = (p) => (/^[1-4]T$/.test(p) ? [0, 1, 2].map((i) => (+p[0] - 1) * 3 + i + 1) : /^\d\d$/.test(p) ? [+p] : MM12.map(Number));
  const chkPers = (e) => { const ms = mesesPer(S.periodo); return (e?.tipo === 'PYME' ? ['1T', '2T', '3T', '4T'] : MM12).filter((p) => mesesPer(p).some((m) => ms.includes(m))); };
  async function calcChk() {
    const e = empresa(), ej = Number(S.ejercicio), pers = chkPers(e), out = [];
    const add = (area, txt, dec, con, tol, nota = '') => {
      if (dec === null && con !== null && /^Mod\. 1/.test(area)) nota = `${nota ? `${nota} · ` : ''}falta la declaración en Impuestos Presentados`;
      const d = dec === null || con === null ? null : rr(dec - con);
      out.push({ area, txt, dec, con, d, ok: d === null ? null : Math.abs(d) <= tol, nota });
    };
    const [E, R, SE, SR, M] = await Promise.all(['fact-E', 'fact-R', 'sii-E', 'sii-R', 'may-mov'].map(traer));
    // retenciones: presentado frente a contabilidad (mismas líneas que el listado justificativo)
    const decl = (m, cols) => { let hay = false, t = 0; pers.forEach((p) => cols.forEach((c) => { const v = prsVal(ej, m, p, c); if (v !== undefined) { hay = true; t += Number(v) || 0; } })); return hay ? rr(t) : null; };
    const nom = (p) => nomPer(ej, p) ?? { s: Number(nominasMan(p, p).t2) || 0, r: Number(nominasMan(p, p).t3) || 0 };
    const sumP = (f) => rr(pers.reduce((a, p) => a + f(p), 0));
    const lst = (m, p, ks) => lineasListado(m, R, ej, p).filter((x) => ks.includes(x.k[0]));
    const sre = (m, ks) => sumP((p) => lst(m, p, ks).reduce((s, x) => s + x.re, 0)), sb = (m, ks) => sumP((p) => lst(m, p, ks).reduce((s, x) => s + x.b, 0));
    if (R.length || pers.some((p) => nom(p).s || nom(p).r)) {
      add('Mod. 111', 'Rendimientos del trabajo · base', decl('111', ['base']), rr(sumP((p) => nom(p).s) + sb('111', ['111T'])), MARGEN_RET, 'Nóminas y libro de recibidas');
      add('Mod. 111', 'Rendimientos del trabajo · retenciones', decl('111', ['retN']), rr(sumP((p) => nom(p).r) + sre('111', ['111T'])), MARGEN_RET, 'Nóminas y libro de recibidas');
      add('Mod. 111', 'Profesionales · base', decl('111', ['baseP']), sb('111', ['111']), MARGEN_RET, 'Libro de recibidas (I.PR)');
      add('Mod. 111', 'Profesionales · retenciones', decl('111', ['retP']), sre('111', ['111']), MARGEN_RET, 'Libro de recibidas (I.PR)');
      add('Mod. 115', 'Alquileres · base', decl('115', ['base']), sb('115', ['115']), MARGEN_RET, 'Libro de recibidas (I.ALQ)');
      add('Mod. 115', 'Alquileres · retenciones', decl('115', ['ret']), sre('115', ['115']), MARGEN_RET, 'Libro de recibidas (I.ALQ)');
      add('Mod. 123', 'Capital mobiliario · base', decl('123', ['base']), sb('123', ['123']), MARGEN_RET, 'Libro de recibidas');
      add('Mod. 123', 'Capital mobiliario · retenciones', decl('123', ['ret']), sre('123', ['123']), MARGEN_RET, 'Libro de recibidas');
    } else add('Mod. 111', 'Sin libro de recibidas ni nóminas: no se pueden comprobar las retenciones', null, null, 0, 'Carga el libro de recibidas y las nóminas');
    // saldo de cada cuenta de impuestos frente a lo declarado (resumen por periodo de las pestañas del bloque 5)
    if (M.length) {
      const mesesFila = (T, key) => (T === 'ano' ? MM12.map(Number) : T === 'p202' ? ({ '1P': [1, 2, 3, 4], '2P': [5, 6, 7, 8, 9, 10], '3P': [11, 12] }[key.slice(5)] ?? []) : T === 'tri' ? mesesPer(key.slice(5)) : [+key.slice(5)]);
      const sel = mesesPer(S.periodo);
      for (const k of Object.keys(ctasEmpresa(e))) {
        const Dc = calcCuenta(k, M), C = Dc.C;
        if (!Dc.movs.length) continue;
        const filas = Dc.filas.filter((f) => +f.y === ej && mesesFila(Dc.T, f.key).some((m) => sel.includes(m)));
        const X = C.cols.find((c) => c[0] === 'x'), hayD = C.cols.some((c) => c[0] === 'f' && c[1] === 'D'), hayTD = C.cols.some((c) => c[0] === 'f' && c[1] === 'TD');
        const txt = `Cta ${Dc.pref} · ${C.desc}`;
        if (X && hayD) {
          const con = filas.filter((f) => f.v[X[1]] !== null && f.v[X[1]] !== undefined);
          if (con.length) {
            const dec = rr(con.reduce((a, f) => a + f.v[X[1]], 0)), dif = rr(con.reduce((a, f) => a + (f.v.D ?? 0), 0));
            add('Cuentas', txt, dec, rr(dec + dif), MARGEN_IVA, `${X[2]} frente al saldo de la cuenta`);
          } else add('Cuentas', txt, null, null, 0, `Sin importe de «${X[2]}» en el periodo`);
        } else if (hayTD && filas.length) {
          const d = rr(filas.reduce((a, f) => a + (f.v.TD ?? 0), 0));
          out.push({ area: 'Cuentas', txt, dec: null, con: null, d, ok: Math.abs(d) <= MARGEN_IVA, nota: 'Total diferencias de la cuenta en el periodo' });
        }
      }
    } else add('Cuentas', 'Sin extracto contable: no se pueden comprobar los saldos', null, null, 0, 'Carga el extracto contable');
    // 303: SII frente a libros, resultado presentado frente a calculado y 349
    const sinPer = S.periodo === 'Anual' ? '' : S.periodo;
    for (const s of ['E', 'R']) {
      const nm = s === 'E' ? 'Emitidas' : 'Recibidas', lib = s === 'E' ? E : R, sii = s === 'E' ? SE : SR;
      if (!sii.length || !lib.length) { add('Mod. 303', `${nm} · SII frente a libro`, null, null, 0, !sii.length ? `Sin descarga del SII de ${nm.toLowerCase()}` : `Sin libro de IVA de ${nm.toLowerCase()}`); continue; }
      const c = conciliarSiiCompleta(s, lib, sii, ej, sinPer), dif = c.A.length + c.B.length + c.C.length;
      add('Mod. 303', `${nm} · base SII frente a libro`, c.ts.base, c.tc.base, MARGEN_SII, dif ? `${dif} factura(s) con diferencia: ver ConcSII` : '');
      add('Mod. 303', `${nm} · cuota SII frente a libro`, c.ts.cuota, c.tc.cuota, MARGEN_SII, dif ? `${dif} factura(s) con diferencia: ver ConcSII` : '');
    }
    if (E.length || R.length) {
      const liq = pers.map((p) => prsVal(ej, '303', p, 'liq'));
      if (liq.some((v) => v !== undefined)) {
        const calc = rr(pers.reduce((a, p, i) => a + (liq[i] === undefined ? 0 : calcular303(E, R, ej, p, manualDe(ej, p), { rectif: rectif303, c110: disponible303(E, R, ej, p) }).c71), 0));
        add('Mod. 303', 'Resultado presentado frente a calculado con los libros', rr(liq.reduce((a, v) => a + (Number(v) || 0), 0)), calc, MARGEN_IVA, 'Casilla 71 del 303 presentado frente al calculado en la pestaña 303');
      } else add('Mod. 303', 'Resultado presentado frente a calculado con los libros', null, null, 0, 'Sin 303 en Impuestos Presentados');
      const i349 = pers.map((p) => prsVal(ej, '349', p, 'imp'));
      if (i349.some((v) => v !== undefined)) {
        const calc = rr(pers.reduce((a, p, i) => a + (i349[i] === undefined ? 0 : calcular349(E, R, ej, p).total), 0));
        add('Mod. 349', 'Importe presentado frente a calculado con los libros', rr(i349.reduce((a, v) => a + (Number(v) || 0), 0)), calc, MARGEN_IVA, 'Operaciones intracomunitarias');
      }
    }
    return out;
  }
  async function hacerChk() {
    if (!S.sel || chkOcupado) return;
    chkOcupado = true; render();
    try {
      const res = await calcChk();
      chkR = { key: chkClave(), ts: new Date(), res, nOk: res.filter((x) => x.ok === true).length, nKo: res.filter((x) => x.ok === false).length, nNo: res.filter((x) => x.ok === null).length };
    } catch (err) { alert(`No se ha podido hacer el checking: ${err.message}`); }
    chkOcupado = false; render();
  }
  function vistaChk() {
    if (!S.sel) return sinEmpresa;
    const C = chkR?.key === chkClave() ? chkR : null, per = S.periodo ? (PERIODOS[S.periodo] ?? S.periodo) : 'Todo el ejercicio';
    const btn = `<div style="margin:0 0 .6rem"><button class="primary" data-act="m-chkhacer"${chkOcupado ? ' disabled' : ''}>${chkOcupado ? 'Comprobando…' : C ? '⟳ Volver a comprobar' : '▶ Hacer el checking'}</button> ${C ? `<span class="hint">Comprobado el ${C.ts.toLocaleDateString('es-ES')} a las ${C.ts.toLocaleTimeString('es-ES')}</span>` : ''}</div>`;
    const tit = `<div class="fc-cab"><span><b>${esc(empresa().nombre)}</b> · Ejercicio ${esc(S.ejercicio)} · ${esc(per)}</span></div>`;
    if (!C) return `${tit}${btn}<p class="hint">Compara de una vez: retenciones del trabajo, profesionales (111), alquileres (115) y capital mobiliario (123); el saldo de cada cuenta de impuestos frente a lo presentado; el 303 (SII frente a libros y resultado) y el 349. Los importes presentados salen de «Impuestos Presentados». Pendiente de migrar: Intrastat y los plazos del SII (4 días hábiles).</p>`;
    const areas = [...new Set(C.res.map((x) => x.area))], z = (v) => (v === null ? '-' : fnum(v));
    const filas = areas.map((a) => `<tr class="ttot"><td colspan="6"><b>${esc(a)}</b></td></tr>${C.res.filter((x) => x.area === a).map((x) => `<tr class="${x.ok === null ? '' : x.ok ? 'cf-ok' : 'cf-ko'}"><td>${esc(x.txt)}</td><td class="num">${z(x.dec)}</td><td class="num">${z(x.con)}</td><td class="num">${z(x.d)}</td><td>${x.ok === null ? '— sin datos' : x.ok ? '✓ OK' : '✖ Revisar'}</td><td class="hint">${esc(x.nota)}</td></tr>`).join('')}`).join('');
    const banner = C.nKo ? `<div style="background:#fde7e7;color:#a4161a;border:1px solid #a4161a;border-radius:6px;padding:.6rem .9rem;font-weight:700;margin-bottom:.6rem">✖ ${C.nKo} comprobación(es) a revisar de ${C.nOk + C.nKo}${C.nNo ? ` · ${C.nNo} sin datos` : ''}</div>`
      : `<div style="background:#e6f6ec;color:#0a5c2b;border:1px solid #0a6;border-radius:6px;padding:.6rem .9rem;font-weight:700;margin-bottom:.6rem">✓ OK · todo lo declarado coincide con lo contabilizado (${C.nOk} comprobaciones${C.nNo ? ` · ${C.nNo} sin datos para comprobar` : ''})</div>`;
    return `${tit}${btn}${banner}<section class="prs-card"><div class="wrap"><table class="tprs tnom" style="width:100%"><thead><tr><th>Comprobación</th><th>Declarado €</th><th>Contabilizado €</th><th>Diferencia</th><th>Estado</th><th>Origen</th></tr></thead><tbody>${filas}</tbody></table></div></section>
      <p class="hint">Márgenes: ±${MARGEN_RET.toFixed(2).replace('.', ',')} € en retenciones y ±${MARGEN_IVA.toFixed(2).replace('.', ',')} € en IVA, SII y cuentas. «Sin datos» = falta el archivo o la declaración en Impuestos Presentados.</p>`;
  }

  tabs.asi = ['Entrada Información', 'Apuntes en cuentas contables', vistaAsi];
  tabs.rev = ['Archivos Documentación', 'Columnas y líneas', vistaRev];
  tabs.chk = ['Checking Información', 'Declarado vs contabilizado', vistaChk];
  const acc3 = {
    'm-asireg': () => asiRegUna(),
    'm-asipegabtn': () => asiPegarBoton(),
    'm-asipegatxt': () => { const t = document.getElementById('asiPegaTxt')?.value ?? ''; if (t.trim()) asiTexto(t); },
    'm-asipreg': () => asiRegPrev(),
    'm-asipvaciar': () => { asiPrev = []; asiOcr = ''; asiCtl = null; render(); },
    'm-asipdel': (d) => { asiPrev.splice(+d.i, 1); render(); },
    'm-asipswap': (d) => { const l = asiPrev[+d.i]; if (l) [l.debe, l.haber] = [l.haber, l.debe]; render(); },
    'm-asiquit': (d) => accionCta('quit', `m:${d.id}`, ''),
    'm-asilotedel': (d) => asiQuitarLote(d.lote),
    'm-asirest': () => guardarCta((d) => { delete d.quit; }),
    'm-chkhacer': () => hacerChk(),
  };

  // Insignias de las fichas del menú (texto y color)
  const unidad ={ pres: 'declaraciones', iloc: 'recibos', notif: 'notificaciones', otros: 'documentos', acc: 'socios y participadas', trl: 'titulares', rmesc: 'escrituras' };
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
  // SII y libros de IVA: cuota del periodo y estado de la conciliación
  const cacheCs = new Map();
  ['E', 'R'].forEach((s) => {
    const rg = () => rangoPeriodo(Number(S.ejercicio), S.periodo);
    badges[s === 'E' ? 'siie' : 'siir'] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const d = peek('sii-' + s);
      if (!d) return { t: '…' };
      if (!d.length) return { t: 'Sin descarga' };
      const r = rg(), ej = Number(S.ejercicio);
      return { t: `Cuota ${fnum(suma(d.filter((x) => (s === 'E' ? x.fecha >= r.desde && x.fecha <= r.hasta : x.ej === ej && (!S.periodo || x.per === S.periodo))), 'cuota'))}` };
    };
    badges[s === 'E' ? 'fe' : 'fr'] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const d = peek('fact-' + s);
      if (!d) return { t: '…' };
      const r = rg();
      return { t: `Cuota ${fnum(suma(d.filter((l) => { const f = s === 'E' ? l.ff : l.fecha; return f >= r.desde && f <= r.hasta && !/^(R\.)?I\./.test(l.codigo); }), 'cuota'))}` }; // sin retenciones
    };
    badges[s === 'E' ? 'concsiie' : 'concsiir'] = () => {
      if (!S.sel) return { t: 'Por empresa' };
      const lib = peek('fact-' + s), sii = peek('sii-' + s);
      if (!lib || !sii) return { t: '…' };
      if (!lib.length || !sii.length) return { t: '—' };
      const k = `${S.sel}|${s}|${S.ejercicio}|${S.periodo}|${lib.length}|${sii.length}|${sii[0]?.base}|${lib[0]?.base}`;
      if (!cacheCs.has(k)) { const D = conciliarSiiCompleta(s, lib, sii, Number(S.ejercicio), S.periodo); cacheCs.set(k, D.cuadra ? { t: 'Cuadra', c: 'verde' } : { t: `Dif. cuota ${fnum(rr(D.tc.cuota - D.ts.cuota))}`, c: 'rojo' }); }
      return cacheCs.get(k);
    };
  });
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

  // Insignias del bloque 3
  badges.asi = () => {
    if (!S.sel) return { t: 'Por empresa' };
    const n = (ctaCfg().lineas ?? []).length;
    return n ? { t: `${n} líneas a mano`, c: 'verde' } : { t: 'Sin líneas' };
  };
  badges.rev = () => {
    if (!S.sel) return { t: 'Por empresa' };
    const D = revDatos();
    if (D.cargando) return { t: '…' };
    return D.nRev ? { t: `${D.nRev} por revisar`, c: 'rojo' } : D.filas.length ? { t: 'Revisado ✓', c: 'verde' } : { t: 'Sin archivos' };
  };
  badges.chk = () => {
    if (!S.sel) return { t: 'Por empresa' };
    return chkR?.key === chkClave() ? (chkR.nKo ? { t: `${chkR.nKo} a revisar`, c: 'rojo' } : { t: 'OK', c: 'verde' }) : { t: 'Sin hacer' };
  };

  // Bloque 2 (Datos Registrales, Titularidad Real…): ver registral.js
  const ocrPdf = async (file, aviso) => {
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    await cargarTesseract();
    const w = await window.Tesseract.createWorker('spa'), out = [];
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        aviso?.(`leyendo el escaneo (OCR) página ${p} de ${doc.numPages}…`);
        const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 2 }), cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        out.push((await w.recognize(cv)).data.text);
      }
    } finally { await w.terminate(); }
    return out.join('\n');
  };
  const R2 = crearRegistral({ db, S, esc, render, cargar, empresa, puede, leerPdf: (f) => leerPdf(f), filasExcel: (f) => filasExcel(f), ocrPdf: (f, cb) => ocrPdf(f, cb) });
  Object.assign(tabs, R2.tabs);
  const subirComo = (kind, files) => (R2.kinds[kind] ? R2.kinds[kind](files) : kind === 'iloc' ? ilCargar(files) : kind === 'dua' ? duaCargar(files) : kind === 'asiimg' ? asiImagenes(files) : (archKind = kind, subirArchivos(files)));

  return { duaDeTexto, setDuaMes, duaCampo, duaSeleccionar, setIlVer, guardarIl, abrirArch: abrirNuevaPestana, duaAbrir, setLiqVer, setCmgMod, d365Auto, toggleLiqIva, d365Recoger, siiFiltro, siiTodosSet: (s, v) => { siiTodos[s] = v; siiN[s] = 150; render(); }, editarFc, fcNvCampo, editarSii, cta: accionCta, setCssCta, guardarRetClave, guardarNom, guardarPrs, setPrsVer, tabs, accion, cargarPdfs, badges, subirArchivos, subirComo, cargado, titulo, listaArchivos, buscarFc, setFc, guardarMan303, guardarIban, setRectif, asiCampo, asiPrevCampo, asiPegar };
}
