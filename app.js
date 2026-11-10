import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { crearModulos } from './modulos.js?v=280';
import { activarRedimension, activarCajas, activarAlineacion, activarImprimir } from './tablas.js?v=10';

// La sesión vive solo en la pestaña (sessionStorage): al abrir una nueva sesión del navegador vuelve a pedir usuario y contraseña
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true } });
// ...y se cierra tras 15 minutos sin tocar nada
const INACTIVIDAD_MS = 15 * 60 * 1000;
let ultimaActividad = Date.now();
['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener?.(ev, () => { ultimaActividad = Date.now(); }, { passive: true }));
setInterval?.(async () => {
  if (Date.now() - ultimaActividad < INACTIVIDAD_MS) return;
  ultimaActividad = Date.now();
  const { data } = await db.auth.getSession();
  if (data?.session) await db.auth.signOut();
}, 30000)?.unref?.();
const root = document.getElementById('app');

const AREAS = { fiscal: 'Fiscal', contable: 'Contable', laboral: 'Laboral', mercantil: 'Registro Mercantil' };
const ESTADOS = { pendiente: 'Pendiente', en_curso: 'En curso', presentado: 'Presentado' };
const ROLES = { admin: 'Administrador', gestor: 'Gestor', consulta: 'Consulta' };

const S = {
  perfil: null, empresas: [], obligaciones: [], conciliaciones: [], registros: [], usuarios: [], asign: [],
  tab: 'ini', filtro: { area: '', estado: '' },
  ejercicio: new Date().getFullYear(), periodo: '', // periodo '' = todo el ejercicio
  sel: '', menu: false, grp: -1, cargando: false, // empresa elegida ('' = todas) y grupo de pestañas abierto
};
let uidActual = null;
S.zooms = (() => { try { return JSON.parse(localStorage.getItem('zoom-pestanas') || '{}') || {}; } catch { return {}; } })(); // tamaño de cada pestaña y de sus tablas
const zoomDe = () => Math.min(2, Math.max(0.5, Number(S.zooms[S.tab]) || 1));
// ancho y tamaño del texto de los formularios de los modelos (111, 115, 303, 349, 583…), de cada pestaña
S.formas = (() => { try { return JSON.parse(localStorage.getItem('forma-modelos') || '{}') || {}; } catch { return {}; } })();
const formaDe = () => {
  const f = S.formas[S.tab] ?? {}, c = (k) => (Number(f[k]) > 0 ? Math.round(Number(f[k])) : undefined); // c1, c2, c3: ancho de las columnas de casillas (arrastrando el borde con el ratón)
  return { w: Math.min(2600, Math.max(500, Number(f.w) || 1200)), t: Math.min(2, Math.max(0.6, Number(f.t) || 1)), c1: c('c1'), c2: c('c2'), c3: c('c3') };
};
const formaVars = () => { const f = formaDe(); return `--f-w:${f.w}px;--f-t:${f.t}${[1, 2, 3].map((n) => (f[`c${n}`] ? `;--fc${n}:${f[`c${n}`]}px` : '')).join('')}`; };
activarRedimension(root, () => S.tab);
activarAlineacion(root); activarImprimir(root); activarCajas(root, () => S.tab); // ancho de los cuadros blancos de cada apartado, arrastrando su borde derecho // columnas de todas las tablas redimensionables con el ratón

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const puedeEditar = () => ['admin', 'gestor'].includes(S.perfil?.rol);
const esAdmin = () => S.perfil?.rol === 'admin';
const hoy = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? d.split('-').reverse().join('/') : '');
const empNombre = (id) => S.empresas.find((e) => e.id === id)?.nombre ?? '—';
// Logos en logos/<CIF>.jpg; si no existe el archivo, la imagen se oculta.
const logoHtml = (e, cls = 'logo') => (e?.datos?.logo
  ? `<img class="${cls}" src="${esc(e.datos.logo)}" alt="">` : e?.cif
    ? `<img class="${cls}" src="logos/${esc(e.cif)}.jpg?v=6" alt="" onerror="this.style.visibility='hidden'">` : `<span class="${cls}"></span>`);

// Orden y nombre con que se muestran las empresas en el desplegable (se reconocen por el nombre guardado)
const ORDEN_EMP = [['HEROGRA FERTILIZANTES S.A.', /herogra\s+fertiliz/i], ['HEROGRA ESPECIALES', /herogra\s+especiales/i], ['HISPALENSE DE LIQUIDOS S.L', /hispalense/i],
  ['MAXLOGTRANS S.L.', /maxlogtrans/i], ['LYS DEL SUR S.L.', /lys\s*del\s*sur|lysur/i], ['GESUFER S.L.', /gesufer|gesti[oó]n unificada/i], ['FERTINOVA S.L.', /fertinova/i],
  ['PRODUFER S.L.', /produfer/i], ['FERTICRONOS S.L.', /ferticronos/i], ['TECNOPLUS SOLUBLES S.L.', /tecnoplus/i], ['BISAR AGROINNOVATION S.L.', /bisar/i],
  ['MOTRILEÑA DE LIQUIDOS S.L.', /motrile/i], ['FARM CHEMICALS FGA S.L.', /farm\s*chemicals/i], ['PASEO DE CENES S.L.', /paseo|cenes/i]];
// si el nombre guardado no encaja con el patrón, se reconoce por la sigla (mismo orden que ORDEN_EMP)
const ORDEN_SIG = ['HER', 'ESP', 'HIS', 'MAX', 'LYS', 'GRU', 'FER', 'PDF', 'FTC', 'TCP', 'BSR', 'MOT', 'FCH', 'PAS'];
const idxEmp = (e) => { const i = ORDEN_EMP.findIndex(([, re]) => re.test(e?.nombre ?? '')); return i >= 0 ? i : ORDEN_SIG.indexOf(String(e?.siglas ?? '').toUpperCase()); };
const etiquetaEmp = (e) => { const i = idxEmp(e); return i < 0 ? e.nombre : `${i + 1}.- ${ORDEN_EMP[i][0]}`; };
const nombreEmp = (e) => { const i = idxEmp(e); return i < 0 ? (e?.nombre ?? '') : ORDEN_EMP[i][0]; }; // nombre de la empresa tal como se ve en la aplicación (sin el número)

function empresaSelector() {
  const e = S.empresas.find((x) => x.id === S.sel);
  const lista = [...S.empresas].sort((a, b) => (idxEmp(a) < 0 ? 99 : idxEmp(a)) - (idxEmp(b) < 0 ? 99 : idxEmp(b)));
  const item = (x) => `<button class="sel-op${x?.id === S.sel || (!x && !S.sel) ? ' on' : ''}" data-sel="${x ? x.id : ''}"><span><b>${esc(x ? etiquetaEmp(x) : 'Todas las empresas')}</b></span></button>`;
  return `<div class="sel"><button class="sel-btn" data-act="menu"><span>${esc(e ? etiquetaEmp(e) : 'Todas las empresas')}</span> ▾</button>
    ${S.menu ? `<div class="sel-menu">${item(null)}${lista.map(item).join('')}</div>` : ''}</div>`;
}

const opts = (obj, sel) => Object.entries(obj)
  .map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

// ---------- Datos ----------
async function cargar() {
  const [e, o, c, r] = await Promise.all([
    db.from('empresas').select('*').order('nombre'),
    db.from('obligaciones').select('*').order('vencimiento', { nullsFirst: false }),
    db.from('conciliaciones').select('*'),
    // las facturas (libros de IVA y SII) pesan mucho: se piden aparte, solo al abrir su pestaña
    db.from('registros').select('id,empresa_id,tipo,ejercicio,datos').not('tipo', 'in', '(fact-E,fact-R,sii-E,sii-R,may-mov,m592-mov,a22src,intra)')
    .not('tipo', 'like', 'sii-raw-%'),
  ]);
  S.empresas = e.data ?? [];
  S.obligaciones = o.data ?? [];
  S.conciliaciones = c.data ?? [];
  S.registros = r.data ?? [];
  if (!S.empresas.some((x) => x.id === S.sel)) S.sel = '';
  if (esAdmin()) {
    const [u, a] = await Promise.all([
      db.from('profiles').select('*').order('created_at'),
      db.from('empresa_usuarios').select('*'),
    ]);
    S.usuarios = u.data ?? [];
    S.asign = a.data ?? [];
  }
}

async function run(promesa) {
  const { error } = await promesa;
  if (error) { alert(error.message); return false; }
  await cargar();
  render();
  return true;
}

// ---------- Arranque / sesión ----------
async function boot() {
  const { data: { session } } = await db.auth.getSession();
  uidActual = session?.user?.id ?? null;
  if (!session) { S.perfil = null; return renderLogin(); }
  const { data: perfil, error } = await db.from('profiles').select('*').eq('id', uidActual).maybeSingle();
  if (error || !perfil) return renderLogin('No se pudo cargar el perfil.');
  S.perfil = perfil;
  if (!perfil.activo) return renderPendiente();
  S.cargando = true; render(); // se enseña ya la pantalla y los datos llegan después
  await cargar();
  if (!S.sel) S.sel = S.empresas.find((e) => /herogra\s+fertiliz/i.test(e.nombre ?? ''))?.id ?? ''; // al arrancar, siempre Herogra Fertilizantes
  S.cargando = false; render();
  M.d365Recoger(false); // si la carpeta de D365 ya tiene permiso, se cargan los libros nuevos solos
}

db.auth.onAuthStateChange((ev, session) => {
  const uid = session?.user?.id ?? null;
  if (ev === 'SIGNED_OUT' || (ev === 'SIGNED_IN' && uid !== uidActual)) setTimeout(boot, 0);
});

// ---------- Pantallas ----------
// el correo se recuerda en este equipo; la contraseña nunca (y la sesión vive solo en la pestaña: cada pestaña nueva la pide)
const correoGuardado = () => { try { return localStorage.getItem('login-correo') || ''; } catch { return ''; } };
function renderLogin(msg = '') {
  root.innerHTML = `<main class="login"><form id="f" class="card">
    <img class="login-logo" src="logos/po-asesoria.svg?v=1" alt="Asesoría PO">
    <h1>Gestión fiscal, contable y laboral</h1>
    <label>Correo<input name="email" type="email" required autocomplete="username" value="${esc(correoGuardado())}"></label>
    <label>Contraseña<input name="password" type="password" required minlength="8" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true"></label>
    <p class="err" id="msg">${esc(msg)}</p>
    <button class="primary">Entrar</button>
    <button type="button" id="reg" class="link">Solicitar acceso (crear cuenta)</button>
  </form></main>`;
  const f = root.querySelector('#f');
  const m = root.querySelector('#msg');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const { error } = await db.auth.signInWithPassword({ email: f.email.value, password: f.password.value });
    if (error) m.textContent = 'Correo o contraseña incorrectos.';
    else { try { localStorage.setItem('login-correo', f.email.value.trim()); } catch { /* sin almacenamiento */ } }
  };
  if (f.email.value) f.password.focus(); else f.email.focus();
  root.querySelector('#reg').onclick = async () => {
    if (!f.reportValidity()) return;
    const { error } = await db.auth.signUp({ email: f.email.value, password: f.password.value });
    m.textContent = error ? error.message
      : 'Cuenta creada. Un administrador debe activarla (revise su correo si se pide confirmación).';
  };
}

function renderPendiente() {
  root.innerHTML = `<main class="login"><div class="card"><h1>Cuenta pendiente de activación</h1>
    <p>Su cuenta (${esc(S.perfil.email)}) existe, pero un administrador debe activarla y asignarle empresas.</p>
    <button id="out">Salir</button></div></main>`;
  root.querySelector('#out').onclick = () => db.auth.signOut();
}

// Pestañas agrupadas como en la aplicación de impuestos: id → [título, subtítulo, vista, soloAdmin]
const GRUPOS = [
  // [título, pestañas, logo, subtítulo del panel]
  ['1.- INFORMACIÓN TRIBUTARIA', ['cmg', 'it', 'r111', 'r115', 'r123', 'pres', 'liq', 'lt', 'venc', 'calf', 'notif', 'iloc', 'dua', 'chkf', 'otros'],
    'aeat', 'Modelos presentados, liquidaciones, pagos y calendario.'],
  ['2.- INFORMACIÓN REGISTRO MERCANTIL', ['dreg', 'trl', 'acc', 'rmca', 'rmesc', 'rmactas', 'rmsocios', 'rmlibros', 'rmobl'],
    'rm', 'Datos registrales, titularidad, cuentas depositadas, actas, socios y libros.'],
  ['3.- INFORMACIÓN EMPRESA', ['asi', 'rev', 'chk', 'opemp', 'ficha'], 'emp', 'Entrada de apuntes, archivos cargados, checking de lo declarado y opciones de las empresas.'],
  ['4.- MODELOS TRIBUTARIOS', ['mod111', 'mod115', 'mod123', 'mod200', 'mod202', 'mod303', 'mod349', 'mod583', 'mod592', 'moda22', 'mod180', 'mod190', 'mod193', 'mod232', 'mod390', 'modintra'],
    'aeat', 'Retenciones, IVA, sociedades, Intrastat y el resto de modelos.'],
  ['5.- CUENTAS CONTABLES', ['c4650','c4700', 'c4709', 'c473001', 'c473002', 'c473003', 'c473004', 'c4730', 'c4745', 'c4750', 'c47511', 'c47512', 'c47513', 'c47514', 'c4752', 'c4760', 'c6400', 'c6420'], 'pgc', 'Extracto y resumen por periodo de cada cuenta: 465, 47x, 640 y 642.'],
  ['6.- SII – SUMINISTRO INMEDIATO INFORMACIÓN', ['siie', 'siir', 'concsiie', 'concsiir', 'fe', 'fr'], 'sii', 'Facturas emitidas y recibidas frente al SII de la AEAT.'],
  ['7.- ESTADOS FINANCIEROS', ['ca', 'bss', 'bsit', 'pyg', 'tef'], 'ef', 'Cuentas anuales, balance de sumas y saldos, balance de situación, pérdidas y ganancias y tipo efectivo.'],
  ['8.- CONCILIACIONES FISCALES', ['au111', 'au115', 'au123', 'au303', 'c349i', 'conc', 'rprof', 'ralq', 'rint', 'rsop', 'adif', 'cis', 'concall'], 'conc', 'Conciliaciones de los modelos y de las cuentas con los impuestos, retenciones y cálculo del Impuesto sobre Sociedades.'],
  ['9.- INFORMACIÓN SEGURIDAD SOCIAL', ['nom', 'nommes', 'cssoc', 'cnom', 'ssobl'], 'tgss', 'Nóminas, Seguridad Social y obligaciones laborales.'],
  ['10.- EXENCIONES Y LEYES', ['leyiva', 'leyexen', 'leyrev', 'leyask'], 'ley', 'Ley 37/1992 del IVA: lo más importante, exenciones, revisión de las facturas emitidas y recibidas y consulta.'],
  ['11.- ADMINISTRACIÓN', ['usuarios', 'envio'], 'adm', 'Usuarios, roles y acceso a las empresas.'],
];
const TABS = {
  calf: ['Calendario Fiscal', 'Plazos y domiciliaciones', () => vistaObligaciones()],
  chkf: ['Checking Fiscal', 'Obligaciones, plazos y límites', () => vistaObligaciones({ area: 'fiscal' })],
  rmobl: ['Plazos registrales', 'Libros y depósito de cuentas', () => vistaObligaciones({ area: 'mercantil' })],
  ficha: ['Ficha de la empresa', 'Datos y resumen', () => vistaFicha()],
  opemp: ['Opciones Empresa', 'Sigla, tipo, programa, banco y logo', () => vistaEmpresas()],
  m303: ['303 IVA', '4700 · 4750 · 472 · 477', () => vistaConciliaciones(['4700', '4750', '472', '477'])],
  m111: ['111 · 115 · 123', 'Retenciones · 4751', () => vistaConciliaciones(['4751'])],
  m200: ['200 · 202 Sociedades', '4752 · 473 · 474', () => vistaConciliaciones(['4752', '473', '474'])],
  c47: ['Grupo 47', 'Administraciones Públicas', () => vistaConciliaciones(['47'])],
  c465: ['465', 'Remuneraciones pendientes de pago', () => vistaConciliaciones(['465'])],
  c640: ['640', 'Sueldos y salarios', () => vistaConciliaciones(['640'])],
  c642: ['642', 'Seguridad Social a cargo de la empresa', () => vistaConciliaciones(['642'])],
  ssconc: ['Nóminas y Seguridad Social', '476 · 465 · 640 · 642', () => vistaConciliaciones(['476', '465', '640', '642'])],
  ssobl: ['Obligaciones laborales', 'RLC/RNT y nóminas', () => vistaObligaciones({ area: 'laboral' })],
  concall: ['Todas las conciliaciones', 'Todas las cuentas', () => vistaConciliaciones()],
  usuarios: ['Usuarios y roles', 'Accesos y empresas', () => vistaUsuarios(), true],
};
const AREA_TAB = { chkf: 'fiscal', rmobl: 'mercantil', ssobl: 'laboral' };

// Insignias de las fichas del menú: pendientes en rojo, al día en verde.
const pendObl = (area) => {
  const n = S.obligaciones.filter((o) => (!S.sel || o.empresa_id === S.sel) && (!area || o.area === area)
    && o.estado !== 'presentado' && delPeriodo(o)).length;
  return n ? { t: `${n} pendientes`, c: 'rojo' } : { t: 'Al día', c: 'verde' };
};
const badgeConc = (cuentas) => {
  if (!S.sel) return { t: 'Por empresa' };
  const l = S.conciliaciones.filter((c) => c.empresa_id === S.sel && c.ejercicio === Number(S.ejercicio)
    && (!cuentas || cuentas.some((p) => c.cuenta.startsWith(p))));
  const n = l.filter((c) => estadoConc(c) === 'Descuadre').length;
  return n ? { t: `${n} descuadres`, c: 'rojo' } : l.length ? { t: 'Todo cuadra', c: 'verde' } : { t: 'Sin datos' };
};
const BADGES_APP = {
  calf: () => pendObl(''), chkf: () => pendObl('fiscal'), rmobl: () => pendObl('mercantil'), ssobl: () => pendObl('laboral'),
  ficha: () => ({ t: 'Por empresa' }), opemp: () => ({ t: `${S.empresas.length} empresas` }),
  m303: () => badgeConc(['4700', '4750', '472', '477']), m111: () => badgeConc(['4751']), m200: () => badgeConc(['4752', '473', '474']),
  c47: () => badgeConc(['47']), c465: () => badgeConc(['465']), c640: () => badgeConc(['640']), c642: () => badgeConc(['642']),
  ssconc: () => badgeConc(['476', '465', '640', '642']), concall: () => badgeConc(null),
  usuarios: () => ({ t: `${S.usuarios.length} usuarios` }),
};
const insignia = (id) => {
  const b = (BADGES_APP[id] ?? M.badges[id])?.();
  return b ? `<span class="badge ${b.c ?? ''}">${esc(b.t)}</span>` : '';
};
const ICONOS = { aeat: 'png', rm: 'png', pgc: 'jpg', sii: 'png', tgss: 'png', emp: 'svg', ef: 'svg', conc: 'svg', ley: 'svg', adm: 'svg' };
const iconoGrupo = (k) => (k === 'emp' && S.sel ? logoHtml(S.empresas.find((x) => x.id === S.sel), 'gico') // «Información empresa»: el logo de la empresa elegida
  : k ?`<img class="gico" src="logos/grupo-${k}.${ICONOS[k]}?v=11" alt="" onerror="this.remove()">` : '');

function tabsNav() {
  const grupos = GRUPOS.map(([tit, ids, ico, sub], i) => ({ i, tit, ico, sub, ids: ids.filter((id) => (!TABS[id][3] || esAdmin()) && (!TABS[id][4] || TABS[id][4]())) }))
    .filter((g) => g.ids.length);
  const abierto = grupos.find((g) => g.i === S.grp);
  const nombre = (t) => { const s = t.replace(/^\d+\.-\s*/, ''); return s.charAt(0) + s.slice(1).toLowerCase(); };
  return `<div class="tabs-wrap"><nav class="tabs" style="--ng:${grupos.length}">${grupos.map((g) => `<button class="gpill${g.ids.includes(S.tab) ? ' act' : ''}${S.grp === g.i ? ' abierto' : ''}" data-grp="${g.i}">
      ${iconoGrupo(g.ico)}<span><b>${esc(g.tit)} ▾</b>${g.ids.includes(S.tab) ? `<small>${esc(TABS[S.tab][0])}</small>` : ''}</span></button>`).join('')}</nav>
    ${abierto ? `<div class="gpanel" style="--emp:${S.sel ? M.colorEmp(S.sel) : '#14286a'}"><div class="gpanel-h"><span class="gpanel-ico">${iconoGrupo(abierto.ico)}</span>
      <div><b>${esc(nombre(abierto.tit))}</b><small>${esc(abierto.sub)}</small></div></div>
      <div class="tiles">${abierto.ids.map((id) => `<button class="tile${id === S.tab ? ' on' : ''}" data-tab="${id}">
        <b>${esc(TABS[id][0])}</b><small>${esc(TABS[id][1])}</small>${insignia(id)}</button>`).join('')}</div></div>` : ''}</div>`;
}

// Años del desplegable de ejercicio: el actual más 1 y los 7 anteriores (y el elegido, si queda fuera).
function ejercicios() {
  const y = new Date().getFullYear();
  const a = new Set([Number(S.ejercicio)]);
  for (let i = y + 1; i >= y - 7; i--) a.add(i);
  return [...a].sort((p, q) => q - p);
}

// Periodos que tiene cada empresa: sus 12 meses (grandes) o sus 4 trimestres (pymes); todas tienen además el anual (valor vacío). Sin empresa elegida salen meses y trimestres.
const MESES_N = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MM12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const periodosDe = (e) => (!e ? [...MM12, '1T', '2T', '3T', '4T'] : e.tipo === 'PYME' ? ['1T', '2T', '3T', '4T'] : MM12);
const etiquetaPeriodo = (p) => (/^\d\d$/.test(p) ? `${p} · ${MESES_N[+p - 1]}` : `${p[0]}º trimestre (${p})`);

function render() {
  if (!TABS[S.tab] || (TABS[S.tab][3] && !esAdmin())) S.tab = 'ini';
  const e = S.empresas.find((x) => x.id === S.sel);
  if (S.periodo && !periodosDe(e).includes(S.periodo)) S.periodo = ''; // el periodo elegido tiene que ser de esta empresa (meses o trimestres)
  const per = S.periodo ? (PERIODOS[S.periodo] ?? S.periodo) : 'Todo el ejercicio';
  const scrollTablas = [...root.querySelectorAll('.wrap')].map((w) => [w.scrollLeft, w.scrollTop]); // al redibujar, las tablas anchas no vuelven al principio
  root.innerHTML = `<div class="layout">
    <aside class="lat">
      <div>${e ? logoHtml(e, 'logo-aside') : ''}<h1>CONCILIACIÓN FISCAL – CONTABLE</h1></div>
      <div class="two">
        <label>Ejercicio<select data-glob="ejercicio">${ejercicios().map((y) =>
    `<option${y === Number(S.ejercicio) ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
        <label>Periodo<select data-glob="periodo">${periodosDe(e).map((p) => `<option value="${p}"${p === S.periodo ? ' selected' : ''}>${etiquetaPeriodo(p)}</option>`).join('')}<option value=""${S.periodo ? '' : ' selected'}>Anual (todo el ejercicio)</option></select></label>
      </div>
      <div class="lbl">Empresa${empresaSelector()}</div>
      ${puedeEditar() ? `<input type="file" id="archIn" multiple hidden>
        <input type="file" id="carpetaIn" webkitdirectory multiple hidden>
        <span class="hint" id="pdfEstado"></span>` : ''}
      <div class="zoom-c no-print" title="Tamaño de esta pestaña y de sus tablas (cada pestaña guarda el suyo)"><span>Tamaño pestaña</span><button data-zoom="-" title="Reducir">−</button><button data-zoom="0" title="Volver al 100 %">${Math.round(zoomDe() * 100)} %</button><button data-zoom="+" title="Aumentar">+</button></div>
      ${/^mod/.test(S.tab) ? `<div class="zoom-c no-print" title="Ancho del formulario del modelo"><span>Ancho modelo</span><button data-forma="w-" title="Más estrecho">−</button><button data-forma="w0" title="Volver a 1200 px">${formaDe().w} px</button><button data-forma="w+" title="Más ancho">+</button></div>
      <div class="zoom-c no-print" title="Tamaño del texto del formulario del modelo"><span>Texto modelo</span><button data-forma="t-" title="Texto más pequeño">−</button><button data-forma="t0" title="Volver al 100 %">${Math.round(formaDe().t * 100)} %</button><button data-forma="t+" title="Texto más grande">+</button></div>` : ''}
      <div class="lat-pie">${esc(S.perfil.nombre || S.perfil.email)}<br><span class="chip">${ROLES[S.perfil.rol]}</span><br><span class="hint" style="color:#b9c4dc;font-size:.72rem">Versión ${new URL(import.meta.url).searchParams.get('v') ?? '—'}</span>
        <button id="out" class="small">Salir</button></div>
    </aside>
    <main class="princ">
      <header class="doc"><div class="doc-l"><img class="logo-prog" src="logos/asesoria.svg?v=3" alt=""><b class="logo-txt">FISCAL<br>Y CONTABLE</b>
        <div>
        <p class="doc-emp">${e ? `${esc(e.nombre)} · NIF ${esc(e.cif)}` : 'Todas las empresas'}</p>
        <p class="doc-sub">Inicio · grupos de pestañas</p>
        <p class="doc-per">Ejercicio ${esc(S.ejercicio)} · ${esc(per)}${S.cargando ? ' · <span>Cargando datos…</span>' : ''}</p></div></div>
        <h2>CONCILIACIÓN FISCAL – CONTABILIDAD – AUDITORÍA</h2>
        <div class="doc-r">${e ? logoHtml(e, 'logo-cab') : ''}<div><span>Fecha del documento</span><b>${fmt(hoy())}</b></div></div></header>
      ${tabsNav()}
      <section class="vista${['siie', 'siir'].includes(S.tab) ? ' fijo-sii' : ''}" style="zoom:${zoomDe()};--z:${zoomDe()};${formaVars()}"><h3 class="tab-tit">${esc(TABS[S.tab][0])} <small>${esc(TABS[S.tab][1])}</small></h3>${TABS[S.tab][2]()}</section>
    </main></div>`;
  root.querySelectorAll('.wrap').forEach((w, i) => { if (scrollTablas[i]) { w.scrollLeft = scrollTablas[i][0]; w.scrollTop = scrollTablas[i][1]; } });
  alinearPanel();
  ajustarInicio();
  restaurarFoco();
}

// Pantalla de inicio: la letra se ajusta al ancho y al alto de la ventana para que quepa sin barra de desplazamiento vertical
function ajustarInicio() {
  const el = root.querySelector('.inicio');
  if (!el) return;
  let tb = Math.min(innerWidth * 0.0085, 20);
  for (let i = 0; i < 30; i++) {
    el.style.setProperty('--ini', `${tb}px`);
    if (document.documentElement.scrollHeight <= innerHeight + 1 || tb <= 6.5) break;
    tb *= 0.95;
  }
}
window.addEventListener('resize', () => ajustarInicio());

// Celdas de importes editables: el foco sobrevive a los redibujados y se navega con flechas, Intro y tabulador
let focoCelda = null;
const ATTR_CELDA = ['data-prs', 'data-nom', 'data-id', 'data-fce', 'data-sie', 'data-il'];
// Impuestos locales: doble clic en una fila con PDF lo abre
root.addEventListener('dblclick', (ev) => { const du = ev.target.closest?.('[data-duasel]'); if (du && !ev.target.closest('button,select')) { ev.preventDefault(); M.duaAbrir(du.dataset.duasel); return; }
  const pa = ev.target.closest?.('[data-prsabrir]'); if (pa && !ev.target.closest('select,button')) { ev.preventDefault(); M.abrirPrs(pa.dataset.prsabrir, ev.ctrlKey); return; }
  const nt = ev.target.closest?.('[data-ntpdf]'); if (nt && !ev.target.closest('select,button,textarea,input')) { ev.preventDefault(); M.abrirArch(nt.dataset.ntpdf); return; }
  const tr = ev.target.closest?.('[data-ilpdf]'); if (tr && !ev.target.closest('select,button')) { ev.preventDefault(); M.abrirArch(tr.dataset.ilpdf); } });
function restaurarFoco() {
  if (!focoCelda || (document.activeElement && document.activeElement !== document.body)) return;
  const i = [...root.querySelectorAll(`input[${focoCelda.a}]`)].find((x) => x.getAttribute(focoCelda.a) === focoCelda.v);
  if (i) { i.focus({ preventScroll: true }); i.select?.(); }
}
root.addEventListener('focusin', (ev) => {
  const i = ev.target;
  const a = i?.matches?.('td.in input') ? ATTR_CELDA.find((x) => i.hasAttribute(x)) : null;
  focoCelda = a ? { a, v: i.getAttribute(a) } : null;
});
function celdaVecina(inp, dr, dc) {
  const td = inp.closest('td'), tr = td.parentElement, filas = [...tr.parentElement.rows];
  let r = filas.indexOf(tr), c = td.cellIndex;
  for (;;) {
    if (dr) r += dr; else c += dc;
    const f = filas[r];
    if (!f || c < 0 || c >= f.cells.length) return null;
    const x = f.cells[c].querySelector('input');
    if (x) return x;
  }
}
const todoSel = (i) => i.selectionStart === 0 && i.selectionEnd === i.value.length; // al entrar en una celda se selecciona todo: así las flechas laterales también pasan a la vecina
root.addEventListener('keydown', (ev) => {
  const i = ev.target;
  if (!i?.matches?.('td.in input') || ev.ctrlKey || ev.altKey || ev.metaKey) return;
  const k = ev.key;
  let dest = null;
  if (k === 'ArrowDown' || (k === 'Enter' && !ev.shiftKey)) dest = celdaVecina(i, 1, 0);
  else if (k === 'ArrowUp' || (k === 'Enter' && ev.shiftKey)) dest = celdaVecina(i, -1, 0);
  else if (k === 'ArrowRight' && (i.selectionStart === i.value.length || todoSel(i))) dest = celdaVecina(i, 0, 1);
  else if (k === 'ArrowLeft' && (i.selectionEnd === 0 || todoSel(i))) dest = celdaVecina(i, 0, -1);
  else return;
  ev.preventDefault();
  if (dest) { dest.focus(); dest.select?.(); }
});

function refrescarTabs() {
  const w = root.querySelector('.tabs-wrap');
  if (!w) return;
  w.outerHTML = tabsNav();
  alinearPanel();
}

// El panel de pestañas se abre justo debajo de la pastilla de su grupo (sin salirse por la derecha)
function alinearPanel() {
  const p = root.querySelector('.gpanel'), pill = root.querySelector('.gpill.abierto'), wrap = root.querySelector('.tabs-wrap');
  if (wrap) { const h = () => document.documentElement?.style?.setProperty('--tabsH', `${wrap.offsetHeight}px`); h(); window.addEventListener?.('resize', h, { once: true }); }
  if (!p?.style || !pill || !wrap) return;
  const ancho = Math.min(wrap.clientWidth - 48, 1100);
  p.style.width = `${ancho}px`;
  p.style.marginRight = '0';
  p.style.marginLeft = `${Math.min(Math.max(pill.offsetLeft - 8, 24), Math.max(24, wrap.clientWidth - ancho - 24))}px`;
}

function vistaFicha() {
  const e = S.empresas.find((x) => x.id === S.sel);
  if (!e) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const obl = S.obligaciones.filter((o) => o.empresa_id === e.id);
  const pend = obl.filter((o) => o.estado !== 'presentado').length;
  const venc = obl.filter((o) => o.vencimiento && o.vencimiento < hoy() && o.estado !== 'presentado').length;
  const conc = S.conciliaciones.filter((c) => c.empresa_id === e.id && c.ejercicio === Number(S.ejercicio));
  const desc = conc.filter((c) => estadoConc(c) === 'Descuadre').length;
  return `<div class="ficha"><div>${logoHtml(e, 'logo-ficha')}</div><dl>
    <dt>Razón social</dt><dd>${esc(e.nombre)}</dd><dt>CIF</dt><dd>${esc(e.cif)}</dd>
    <dt>Siglas</dt><dd>${esc(e.siglas)}</dd><dt>Tipo</dt><dd>${esc(e.tipo)}</dd>
    <dt>Obligaciones pendientes</dt><dd>${pend}${venc ? ` · <span class="rojo">${venc} vencidas</span>` : ''}</dd>
    <dt>Conciliaciones ${esc(S.ejercicio)}</dt><dd>${conc.length}${desc ? ` · <span class="rojo">${desc} con descuadre</span>` : ''}</dd>
    <dt>Notas</dt><dd>${esc(e.notas)}</dd></dl>
    ${puedeEditar() ? `<button class="primary" data-act="edit-emp" data-id="${e.id}">Editar ficha</button>` : ''}</div>`;
}

// Las obligaciones con periodo "AAAA" o "AAAA-xx" se filtran por ejercicio y periodo; el resto siempre se ve.
function delPeriodo(o) {
  const m = /^(\d{4})(?:-(.+))?$/.exec(o.periodo ?? '');
  if (!m) return true;
  if (m[1] !== String(S.ejercicio)) return false;
  return !S.periodo || !m[2] || m[2] === S.periodo;
}

function vistaObligaciones({ area = '' } = {}) {
  const f = { ...S.filtro, empresa: S.sel, area: area || S.filtro.area };
  const lista = S.obligaciones.filter((o) => delPeriodo(o) &&
    (!f.empresa || o.empresa_id === f.empresa) && (!f.area || o.area === f.area) && (!f.estado || o.estado === f.estado));
  const filas = lista.map((o) => {
    const vencida = o.vencimiento && o.vencimiento < hoy() && o.estado !== 'presentado';
    return `<tr class="${vencida ? 'vencida' : o.estado === 'presentado' ? 'fila-ok' : ''}">
      <td>${esc(empNombre(o.empresa_id))}</td><td>${AREAS[o.area]}</td>
      <td>${esc(o.nombre)}<br><small>${esc(o.notas)}</small></td><td>${esc(o.periodo)}</td>
      <td>${fmt(o.vencimiento)}${vencida ? ' ⚠' : ''}</td>
      <td>${puedeEditar()
        ? `<select data-estado="${o.id}">${opts(ESTADOS, o.estado)}</select>`
        : ESTADOS[o.estado]}</td>
      <td class="acciones">${puedeEditar()
        ? `<button class="small" data-act="edit-obl" data-id="${o.id}">Editar</button>
           <button class="small danger" data-act="del-obl" data-id="${o.id}">Borrar</button>` : ''}</td></tr>`;
  }).join('');
  return `<div class="bar">
    ${area ? '' : `<label>Área<select data-filtro="area"><option value="">Todas</option>${opts(AREAS, f.area)}</select></label>`}
    <label>Estado<select data-filtro="estado"><option value="">Todos</option>${opts(ESTADOS, f.estado)}</select></label>
    <span class="space"></span>
    ${puedeEditar() && S.empresas.length ? `<button data-act="calendario">Calendario estándar</button>
      <button class="primary" data-act="new-obl">Nueva obligación</button>` : ''}</div>
    ${lista.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>Área</th><th>Obligación</th>
      <th>Periodo</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
      : '<p class="vacio">No hay obligaciones que mostrar.</p>'}`;
}

// Programa contable de cada empresa: D365 salvo Fertinova (Business Central, un solo libro de IVA con ventas y compras)
const PROGRAMAS = { D365: 'D365', BC: 'Business Central' };
const programaDe = (e) => e?.datos?.programa || (/fertinova/i.test(e?.nombre ?? '') ? 'BC' : 'D365');
async function guardarEmpCampo(clave, valor) {
  const [id, campo] = clave.split('|');
  const e = S.empresas.find((x) => x.id === id);
  if (!e) return;
  const cambio = campo === 'siglas' ? { siglas: nul(valor.trim().toUpperCase()) } : campo === 'tipo' ? { tipo: nul(valor) }
    : { datos: { ...(e.datos ?? {}), [campo]: valor.trim() } };
  const { error } = await db.from('empresas').update(cambio).eq('id', id);
  if (error) return void alert(error.message);
  await cargar(); render();
}
// Logo elegido a mano: se reduce a 240 px de alto y se guarda en la ficha de la empresa (si no hay, se usa logos/NIF.jpg)
async function subirLogo(id, file) {
  const e = S.empresas.find((x) => x.id === id);
  if (!e || !file) return;
  try {
    const img = await createImageBitmap(file), k = Math.min(1, 240 / img.height), cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
    await guardarEmpDatos(e, { ...(e.datos ?? {}), logo: cv.toDataURL('image/jpeg', 0.85) });
  } catch (err) { alert(`No se pudo leer la imagen: ${err.message}`); }
}
async function guardarEmpDatos(e, datos) {
  const { error } = await db.from('empresas').update({ datos }).eq('id', e.id);
  if (error) return void alert(error.message);
  await cargar(); render();
}
function vistaEmpresas() {
  const ed = puedeEditar();
  const cel = (e, campo, v, ph = '') => (ed ? `<input class="emp-in" data-empf="${e.id}|${campo}" value="${esc(v ?? '')}" placeholder="${ph}">` : esc(v ?? ''));
  const sel = (e, campo, ops, v) => (ed ? `<select data-empf="${e.id}|${campo}">${Object.entries(ops).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>` : esc(ops[v] ?? v ?? ''));
  const TIPOS = { '': '—', GE: 'Gran empresa (mensual)', PYME: 'Pyme (trimestral)' };
  const filas = [...S.empresas].sort((a, b) => (idxEmp(a) < 0 ? 99 : idxEmp(a)) - (idxEmp(b) < 0 ? 99 : idxEmp(b))).map((e) => `<tr><td><div class="emp">${logoHtml(e)}${esc(etiquetaEmp(e))}</div></td><td>${esc(e.cif)}</td>
    <td>${cel(e, 'siglas', e.siglas, 'Sigla')}</td><td>${sel(e, 'tipo', TIPOS, e.tipo ?? '')}</td><td>${sel(e, 'programa', PROGRAMAS, programaDe(e))}</td><td>${cel(e, 'banco', e.datos?.banco, 'Banco')}</td>
    <td class="acciones">${ed ? `<label class="small lbl-btn" title="Cambiar el logo">Logo<input type="file" accept="image/*" data-emplogo="${e.id}" hidden></label>${e.datos?.logo ? `<button class="small" data-act="emp-logodel" data-id="${e.id}" title="Quitar el logo cambiado">sin logo</button>` : ''}` : ''}</td>
    <td class="acciones">${ed ? `<button class="small" data-act="edit-emp" data-id="${e.id}">Editar</button>` : ''}${esAdmin() ? `<button class="small danger" data-act="del-emp" data-id="${e.id}" title="Borrar">✕</button>` : ''}</td></tr>`).join('');
  return `<div class="bar"><span class="space"></span>
    ${ed ? '<button class="primary" data-act="new-emp">Nueva empresa</button>' : ''}</div>
    ${S.empresas.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>NIF</th><th>Sigla</th><th>Tipo</th><th>Programa</th><th>Banco</th><th>Logo</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      <p class="hint">La sigla es la que usan los asientos de liquidación (HER, ESP…). Programa contable: D365, y Business Central en Fertinova (su libro de IVA trae ventas y compras en un solo archivo y se reparte solo al cargarlo en Facturas emitidas o recibidas).</p>` : '<p class="vacio">No hay empresas asignadas.</p>'}`;
}

function vistaUsuarios() {
  const filas = S.usuarios.map((u) => {
    const yo = u.id === S.perfil.id;
    const n = S.asign.filter((a) => a.user_id === u.id).length;
    return `<tr><td>${esc(u.nombre)}<br><small>${esc(u.email)}</small></td>
      <td><select data-rol="${u.id}" ${yo ? 'disabled' : ''}>${opts(ROLES, u.rol)}</select></td>
      <td><input type="checkbox" data-activo="${u.id}" ${u.activo ? 'checked' : ''} ${yo ? 'disabled' : ''}></td>
      <td>${u.rol === 'admin' ? 'Todas' : n + ' empresa(s)'}
        ${u.rol !== 'admin' ? `<button class="small" data-act="asig" data-id="${u.id}">Asignar</button>` : ''}</td></tr>`;
  }).join('');
  return `<div class="bar"><span class="space"></span><button class="primary" data-act="new-user">Nuevo usuario</button></div>
    <div class="wrap"><table class="tabla"><thead><tr><th>Usuario</th><th>Rol</th><th>Activo</th><th>Empresas</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

// ---------- Formularios ----------
function fieldHtml(f) {
  const v = esc(f.value ?? '');
  if (f.type === 'select') return `<label>${f.label}<select name="${f.name}">${opts(f.options, f.value)}</select></label>`;
  if (f.type === 'textarea') return `<label>${f.label}<textarea name="${f.name}" rows="3">${v}</textarea></label>`;
  if (f.type === 'file') return `<label>${f.label}<input name="${f.name}" type="file"></label>`;
  if (f.type === 'checks') return `<div><b>${f.label}</b><div class="checks">${f.options.map(([id, l]) =>
    `<label><input type="checkbox" name="${f.name}" value="${id}"${(f.value || []).includes(id) ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div></div>`;
  return `<label>${f.label}<input name="${f.name}" type="${f.type || 'text'}" value="${v}"${f.required ? ' required' : ''}${f.minlength ? ` minlength="${f.minlength}"` : ''}${f.step ? ` step="${f.step}"` : ''}></label>`;
}

function openForm(title, fields, onSubmit) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form class="form"><h3>${esc(title)}</h3>${fields.map(fieldHtml).join('')}
    <p class="err"></p><div class="row"><button type="button" class="ghost" data-x>Cancelar</button><button class="primary">Guardar</button></div></form>`;
  document.body.append(d);
  const form = d.querySelector('form');
  const err = d.querySelector('.err');
  d.querySelector('[data-x]').onclick = () => d.close();
  d.onclose = () => d.remove();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const v = {};
    fields.forEach((f) => { v[f.name] = f.type === 'checks' ? fd.getAll(f.name)
      : f.type === 'file' ? fd.get(f.name) : (fd.get(f.name) ?? '').toString().trim(); });
    err.textContent = '';
    const msg = await onSubmit(v);
    if (msg) err.textContent = msg; else d.close();
  };
  d.showModal();
}

const empOpts = () => Object.fromEntries(S.empresas.map((e) => [e.id, e.nombre]));
const nul = (s) => (s === '' ? null : s);

function formEmpresa(e = {}) {
  openForm(e.id ? 'Editar empresa' : 'Nueva empresa', [
    { name: 'nombre', label: 'Nombre', value: e.nombre, required: true },
    { name: 'cif', label: 'CIF', value: e.cif },
    { name: 'siglas', label: 'Siglas', value: e.siglas },
    { name: 'tipo', label: 'Tipo de empresa', type: 'select', options: { '': '—', GE: 'GE', PYME: 'PYME' }, value: e.tipo ?? '' },
    { name: 'notas', label: 'Notas', type: 'textarea', value: e.notas },
  ], async (v) => {
    const datos = { nombre: v.nombre, cif: nul(v.cif), siglas: nul(v.siglas.toUpperCase()), tipo: nul(v.tipo), notas: nul(v.notas) };
    const q = e.id ? db.from('empresas').update(datos).eq('id', e.id) : db.from('empresas').insert(datos);
    const { error } = await q;
    if (error) return error.message;
    await cargar(); render();
  });
}

function formObligacion(o = {}) {
  openForm(o.id ? 'Editar obligación' : 'Nueva obligación', [
    { name: 'empresa_id', label: 'Empresa', type: 'select', options: empOpts(), value: o.empresa_id || S.sel },
    { name: 'area', label: 'Área', type: 'select', options: AREAS, value: o.area },
    { name: 'nombre', label: 'Obligación (p. ej. Modelo 303, TC1, Cierre mensual)', value: o.nombre, required: true },
    { name: 'periodo', label: 'Periodo (p. ej. 2026-T1)', value: o.periodo },
    { name: 'vencimiento', label: 'Vencimiento', type: 'date', value: o.vencimiento },
    { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS, value: o.estado },
    { name: 'notas', label: 'Notas', type: 'textarea', value: o.notas },
  ], async (v) => {
    const datos = { empresa_id: v.empresa_id, area: v.area, nombre: v.nombre, periodo: nul(v.periodo),
      vencimiento: nul(v.vencimiento), estado: v.estado, notas: nul(v.notas) };
    const q = o.id ? db.from('obligaciones').update(datos).eq('id', o.id) : db.from('obligaciones').insert(datos);
    const { error } = await q;
    if (error) return error.message;
    await cargar(); render();
  });
}

function formUsuario() {
  openForm('Nuevo usuario', [
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'email', label: 'Correo', type: 'email', required: true },
    { name: 'password', label: 'Contraseña inicial (mín. 8)', type: 'password', required: true, minlength: 8 },
    { name: 'rol', label: 'Rol', type: 'select', options: ROLES, value: 'gestor' },
  ], async (v) => {
    // Cliente auxiliar sin sesión persistente para no desconectar al admin.
    const aux = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await aux.auth.signUp({ email: v.email, password: v.password, options: { data: { nombre: v.nombre } } });
    if (error) return error.message;
    if (!data.user || data.user.identities?.length === 0) return 'Ese correo ya está registrado.';
    const { error: e2 } = await db.from('profiles').update({ rol: v.rol, activo: true }).eq('id', data.user.id);
    if (e2) return e2.message;
    await cargar(); render();
  });
}

function formAsignar(uid) {
  const u = S.usuarios.find((x) => x.id === uid);
  openForm(`Empresas de ${u.nombre || u.email}`, [
    { name: 'ids', label: 'Empresas a las que tiene acceso', type: 'checks',
      options: S.empresas.map((e) => [e.id, e.nombre]),
      value: S.asign.filter((a) => a.user_id === uid).map((a) => a.empresa_id) },
  ], async (v) => {
    const del = await db.from('empresa_usuarios').delete().eq('user_id', uid);
    if (del.error) return del.error.message;
    if (v.ids.length) {
      const ins = await db.from('empresa_usuarios').insert(v.ids.map((id) => ({ empresa_id: id, user_id: uid })));
      if (ins.error) return ins.error.message;
    }
    await cargar(); render();
  });
}

// ---------- Conciliaciones (grupo 47, 465, 640, 642) ----------
const PERIODOS = {
  '1T': '1T', '2T': '2T', '3T': '3T', '4T': '4T', Anual: 'Anual',
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return [m, 'Mes ' + m];
  })),
};
const PLANTILLAS = [
  ['4700', 'HP deudora por IVA', 'Modelo 303 (a devolver / compensar)'],
  ['4750', 'HP acreedora por IVA', 'Modelo 303 (a ingresar)'],
  ['472', 'HP IVA soportado', 'Libro registro IVA soportado'],
  ['477', 'HP IVA repercutido', 'Libro registro IVA repercutido'],
  ['4751', 'HP acreedora por retenciones practicadas', 'Modelos 111 / 115 / 123'],
  ['4752', 'HP acreedora por Impuesto sobre Sociedades', 'Modelo 200 / 202'],
  ['473', 'HP retenciones y pagos a cuenta', 'Modelo 200'],
  ['474', 'Activos / pasivos por impuesto diferido', 'Cálculo fiscal'],
  ['476', 'Organismos de la Seguridad Social acreedores', 'RLC / RNT (Seguros Sociales)'],
  ['465', 'Remuneraciones pendientes de pago', 'Nóminas (líquido a percibir)'],
  ['640', 'Sueldos y salarios', 'Resumen de nóminas / Modelo 190'],
  ['642', 'Seguridad Social a cargo de la empresa', 'RLC / RNT (cuota empresa)'],
];
const eur = (n) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', style: 'currency', currency: 'EUR' }).format(n ?? 0);
const estadoConc = (c) => (Math.abs(c.diferencia) < 0.005 ? 'Cuadra' : c.justificada ? 'Justificada' : 'Descuadre');
const pad = (n) => String(n).padStart(2, '0');

// cuentas: prefijos de cuenta a mostrar (p. ej. ['4751']); sin argumento, todas.
function vistaConciliaciones(cuentas) {
  const f = { empresa: S.sel };
  if (!f.empresa) return '<p class="vacio">Elija una empresa en el desplegable de la izquierda para ver sus conciliaciones.</p>';
  const lista = S.conciliaciones
    .filter((c) => c.empresa_id === f.empresa && c.ejercicio === Number(S.ejercicio)
      && (!S.periodo || c.periodo === S.periodo || c.periodo === 'Anual')
      && (!cuentas || cuentas.some((p) => c.cuenta.startsWith(p))))
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta) || a.periodo.localeCompare(b.periodo));
  const desc = lista.filter((c) => estadoConc(c) === 'Descuadre').length;
  const filas = lista.map((c) => {
    const est = estadoConc(c);
    return `<tr class="${est === 'Descuadre' ? 'vencida' : est === 'Cuadra' ? 'fila-ok' : ''}">
      <td>${esc(c.periodo)}</td><td><b>${esc(c.cuenta)}</b></td>
      <td>${esc(c.concepto)}<br><small>${esc(c.fuente)}${c.notas ? ' · ' + esc(c.notas) : ''}</small></td>
      <td class="num">${eur(c.saldo_contable)}</td><td class="num">${eur(c.importe_oficial)}</td>
      <td class="num">${eur(c.diferencia)}</td>
      <td>${est === 'Cuadra' ? '<span class="ok">✔ Cuadra</span>' : est}</td>
      <td class="acciones">${puedeEditar()
        ? `<button class="small" data-act="edit-conc" data-id="${c.id}">Editar</button>
           <button class="small danger" data-act="del-conc" data-id="${c.id}">Borrar</button>` : ''}</td></tr>`;
  }).join('');
  return `<div class="bar">
    <span class="space"></span>
    ${lista.length ? `<span class="chip">${desc ? desc + ' con descuadre' : 'Todo cuadra'}</span>` : ''}
    ${puedeEditar() && f.empresa ? '<button class="primary" data-act="new-conc">Nueva conciliación</button>' : ''}</div>
    ${lista.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Periodo</th><th>Cuenta</th><th>Concepto</th>
      <th class="num">Saldo contable</th><th class="num">Importe oficial</th><th class="num">Diferencia</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>`
      : '<p class="vacio">No hay conciliaciones para esta empresa y ejercicio.</p>'}`;
}

function formConciliacion(c = {}) {
  const plantillas = { '': 'Personalizada' };
  PLANTILLAS.forEach((p, i) => { plantillas['p' + i] = `${p[0]} · ${p[1]}`; });
  openForm(c.id ? 'Editar conciliación' : 'Nueva conciliación', [
    { name: 'plantilla', label: 'Cuenta (plantilla)', type: 'select', options: plantillas, value: '' },
    { name: 'periodo', label: 'Periodo', type: 'select', options: PERIODOS, value: c.periodo },
    { name: 'cuenta', label: 'Cuenta (si es personalizada)', value: c.cuenta },
    { name: 'concepto', label: 'Concepto (si es personalizada)', value: c.concepto },
    { name: 'fuente', label: 'Documento oficial', value: c.fuente },
    { name: 'saldo', label: 'Saldo contable (€)', type: 'number', step: '0.01', value: c.saldo_contable ?? 0 },
    { name: 'oficial', label: 'Importe del documento oficial (€)', type: 'number', step: '0.01', value: c.importe_oficial ?? 0 },
    { name: 'justificada', label: 'Diferencia justificada', type: 'select',
      options: { no: 'No', si: 'Sí (explicada en notas)' }, value: c.justificada ? 'si' : 'no' },
    { name: 'notas', label: 'Notas', type: 'textarea', value: c.notas },
  ], async (v) => {
    const p = v.plantilla ? PLANTILLAS[Number(v.plantilla.slice(1))] : null;
    const cuenta = v.cuenta || p?.[0];
    const concepto = v.concepto || p?.[1];
    if (!cuenta || !concepto) return 'Elija una plantilla o indique cuenta y concepto.';
    const datos = {
      empresa_id: c.empresa_id || S.sel, ejercicio: c.ejercicio ?? Number(S.ejercicio), periodo: v.periodo,
      cuenta, concepto, fuente: nul(v.fuente || p?.[2] || ''),
      saldo_contable: parseFloat(v.saldo) || 0, importe_oficial: parseFloat(v.oficial) || 0,
      justificada: v.justificada === 'si', notas: nul(v.notas),
    };
    const q = c.id ? db.from('conciliaciones').update(datos).eq('id', c.id) : db.from('conciliaciones').insert(datos);
    const { error } = await q;
    if (error) return error.message;
    await cargar(); render();
  });
}

// Fechas orientativas para año natural; no ajusta fines de semana ni festivos. Revisar.
function calendarioEstandar(ej) {
  const y1 = ej + 1;
  const o = [];
  for (const [p, d] of [['1T', `${ej}-04-20`], ['2T', `${ej}-07-20`], ['3T', `${ej}-10-20`], ['4T', `${y1}-01-20`]]) {
    o.push(['fiscal', 'Modelo 303 IVA', `${ej}-${p}`, p === '4T' ? `${y1}-01-30` : d]);
    o.push(['fiscal', 'Modelo 111 Retenciones trabajo y profesionales', `${ej}-${p}`, d]);
    o.push(['fiscal', 'Modelo 115 Retenciones alquileres', `${ej}-${p}`, d]);
  }
  o.push(
    ['fiscal', 'Modelo 190 Resumen anual retenciones', `${ej}`, `${y1}-01-31`],
    ['fiscal', 'Modelo 390 Resumen anual IVA', `${ej}`, `${y1}-01-30`],
    ['fiscal', 'Modelo 347 Operaciones con terceros', `${ej}`, `${y1}-02-28`],
    ['fiscal', 'Modelo 200 Impuesto sobre Sociedades', `${ej}`, `${y1}-07-25`],
    ['contable', 'Formulación de cuentas anuales', `${ej}`, `${y1}-03-31`],
    ['contable', 'Aprobación de cuentas por la Junta', `${ej}`, `${y1}-06-30`],
    ['mercantil', 'Legalización de libros contables', `${ej}`, `${y1}-04-30`],
    ['mercantil', 'Depósito de cuentas anuales en el Registro Mercantil', `${ej}`, `${y1}-07-30`],
  );
  for (let m = 1; m <= 12; m++) {
    o.push(['laboral', 'Seguros Sociales (RLC/RNT)', `${ej}-${pad(m)}`, `${ej}-${pad(m)}-${pad(new Date(ej, m, 0).getDate())}`]);
  }
  return o;
}

function formCalendario() {
  openForm('Calendario estándar de obligaciones', [
    { name: 'empresa_id', label: 'Empresa', type: 'select', options: empOpts(), value: S.sel },
    { name: 'ejercicio', label: 'Ejercicio (año natural)', type: 'number', value: S.ejercicio, required: true },
  ], async (v) => {
    const ej = parseInt(v.ejercicio, 10);
    if (!ej) return 'Ejercicio no válido.';
    const existentes = new Set(S.obligaciones.filter((o) => o.empresa_id === v.empresa_id).map((o) => `${o.nombre}|${o.periodo}`));
    const filas = calendarioEstandar(ej)
      .filter(([, nombre, periodo]) => !existentes.has(`${nombre}|${periodo}`))
      .map(([area, nombre, periodo, vencimiento]) => ({ empresa_id: v.empresa_id, area, nombre, periodo, vencimiento, estado: 'pendiente' }));
    if (!filas.length) return 'Ese calendario ya existe para la empresa.';
    const { error } = await db.from('obligaciones').insert(filas);
    if (error) return error.message;
    await cargar(); render();
  });
}

// Bloques 1 y 2 (ver modulos.js): se añaden a las pestañas ya definidas.
const M = crearModulos({ db, S, esc, opts, openForm, fmt, render, cargar, eur, empNombre, PERIODOS, logoHtml, idxEmp, nombreEmp });
Object.assign(TABS, M.tabs);

// Buscador de pestañas (Ctrl+K)
function paleta() {
  const d = document.createElement('dialog');
  d.innerHTML = '<form class="form"><h3>Buscar pestaña</h3><input id="q" placeholder="p. ej. IBI, 111, socios…" autocomplete="off"><div class="pal"></div></form>';
  document.body.append(d);
  const q = d.querySelector('#q'), lista = d.querySelector('.pal');
  const sinAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pinta = () => {
    const f = sinAcento(q.value);
    const r = Object.entries(TABS).filter(([id, t]) => (!t[3] || esAdmin()) && (!f || sinAcento(`${t[0]} ${t[1]} ${id}`).includes(f))).slice(0, 12);
    lista.innerHTML = r.map(([id, t]) => `<button type="button" class="pal-op" data-ir="${id}"><b>${esc(t[0])}</b><small>${esc(t[1])}</small></button>`).join('')
      || '<p class="vacio">Sin resultados</p>';
  };
  const ir = (id) => { S.tab = id; S.grp = -1; d.close(); render(); };
  q.oninput = pinta;
  lista.onclick = (ev) => { const b = ev.target.closest('[data-ir]'); if (b) ir(b.dataset.ir); };
  q.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); const b = lista.querySelector('[data-ir]'); if (b) ir(b.dataset.ir); } };
  d.onclose = () => d.remove();
  d.querySelector('form').onsubmit = (ev) => ev.preventDefault();
  pinta(); d.showModal(); q.focus();
}
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k' && S.perfil?.activo) { ev.preventDefault(); paleta(); }
});

// ---------- Eventos ----------
root.addEventListener('click', (ev) => {
  const fuera = (S.menu && !ev.target.closest('.sel')) || (S.grp >= 0 && !ev.target.closest('.tabs-wrap'));
  if (fuera) { S.menu = false; if (!ev.target.closest('.tabs-wrap')) S.grp = -1; render(); }
  const dz = ev.target.closest('.dropzone');
  if (dz && ev.target.tagName !== 'INPUT') return void dz.querySelector('input').click();
  if (ev.target.closest('.logo-aside')) { S.tab = 'ini'; S.grp = -1; return render(); }
  const ds = ev.target.closest('[data-duasel]');
  if (ds && !ev.target.closest('button,input,select')) return void M.duaSeleccionar(ds.dataset.duasel, ev.detail);
  const ir = ev.target.closest('[data-ir]');
  if (ir && !ev.target.closest('button')) { S.tab = ir.dataset.ir; S.grp = -1; return render(); }
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.zoom !== undefined) {
    const z = t.dataset.zoom === '0' ? 1 : zoomDe() + (t.dataset.zoom === '+' ? 0.1 : -0.1), v = Math.min(2, Math.max(0.5, Math.round(z * 10) / 10));
    if (v === 1) delete S.zooms[S.tab]; else S.zooms[S.tab] = v;
    try { localStorage.setItem('zoom-pestanas', JSON.stringify(S.zooms)); } catch { /* sin almacenamiento */ }
    return render();
  }
  if (t.dataset.forma !== undefined) {
    const [k, op] = [t.dataset.forma[0], t.dataset.forma.slice(1)], f = { ...formaDe() };
    if (k === 'w') f.w = op === '0' ? 1200 : f.w + (op === '+' ? 100 : -100); else f.t = op === '0' ? 1 : Math.round((f.t + (op === '+' ? 0.1 : -0.1)) * 10) / 10;
    if (f.w === 1200 && f.t === 1 && !f.c1 && !f.c2 && !f.c3) delete S.formas[S.tab]; else S.formas[S.tab] = f;
    try { localStorage.setItem('forma-modelos', JSON.stringify(S.formas)); } catch { /* sin almacenamiento */ }
    return render();
  }
  if (t.dataset.act === 'menu') { S.menu = !S.menu; return render(); }
  if (t.dataset.sel !== undefined) { S.sel = t.dataset.sel; S.menu = false; return render(); }
  if (t.dataset.grp !== undefined) { S.grp = Number(t.dataset.grp); return refrescarTabs(); }
  if (t.id === 'out') return void db.auth.signOut();
  if (t.dataset.tab) { S.tab = t.dataset.tab; S.grp = -1; return render(); }
  if (t.dataset.act?.startsWith('m-')) return void M.accion(t.dataset);
  const id = t.dataset.id;
  const acciones = {
    'new-emp': () => formEmpresa(),
    'edit-emp': () => formEmpresa(S.empresas.find((e) => e.id === id)),
    'emp-logodel': () => { const e = S.empresas.find((x) => x.id === id); const { logo, ...resto } = e?.datos ?? {}; return e && guardarEmpDatos(e, resto); },
    'del-emp': () => confirm('¿Borrar la empresa y TODAS sus obligaciones?') && run(db.from('empresas').delete().eq('id', id)),
    'new-obl': () => formObligacion({ area: AREA_TAB[S.tab] }),
    'edit-obl': () => formObligacion(S.obligaciones.find((o) => o.id === id)),
    'del-obl': () => confirm('¿Borrar la obligación?') && run(db.from('obligaciones').delete().eq('id', id)),
    calendario: () => formCalendario(),
    inicio: () => { S.tab = 'ini'; S.grp = -1; render(); },
    buscar: () => paleta(),
    'new-conc': () => formConciliacion({ periodo: S.periodo || '1T' }),
    'edit-conc': () => formConciliacion(S.conciliaciones.find((c) => c.id === id)),
    'del-conc': () => confirm('¿Borrar la conciliación?') && run(db.from('conciliaciones').delete().eq('id', id)),
    'new-user': () => formUsuario(),
    asig: () => formAsignar(id),
  };
  acciones[t.dataset.act]?.();
});

root.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'carpetaIn') { const fs = [...t.files]; t.value = ''; return void M.cargarPdfs(fs); }
  if (t.dataset.fc) return void M.setFc(t.dataset.fc, t.value);
  if (t.dataset.prs) return void M.guardarPrs(t.dataset.prs, t.value);
  if (t.dataset.nom) return void M.guardarNom(t.dataset.nom, t.value);
  if (t.dataset.cta) return void M.cta(t.dataset.cta, t.dataset.id, t.type === 'checkbox' ? (t.checked ? '1' : '0') : t.value);
  if (t.dataset.siifil) return void M.siiFiltro(t.dataset.siifil, t.value);
  if (t.dataset.siitodos) return void M.siiTodosSet(t.dataset.siitodos, t.checked);
  if (t.dataset.fce) return void M.editarFc(t.dataset.fce, t.value);
  if (t.dataset.fcnv) return void M.fcNvCampo(t.dataset.fcnv, t.value);
  if (t.dataset.sie) return void M.editarSii(t.dataset.sie, t.value);
  if (t.dataset.csscta !== undefined) return void M.setCssCta(t.value);
  if (t.dataset.duames !== undefined) return void M.setDuaMes(t.value);
  if (t.dataset.duaanio !== undefined) return void M.setDuaAnio(t.value);
  if (t.dataset.duacampo) return void M.duaCampo(t.dataset.duacampo, t.value);
  if (t.dataset.ilver !== undefined) return void M.setIlVer(t.value);
  if (t.dataset.il) return void M.guardarIl(t.dataset.il, t.value);
  if (t.dataset.lt) return void M.setLt(t.dataset.lt, t.checked);
  if (t.dataset.nomasiento !== undefined) return void M.guardarNomAsiento(t.value);
  if (t.dataset.nomasmes !== undefined) return void M.setNomAsMes(t.value);
  if (t.dataset.calanio !== undefined) return void M.calSetAnio(t.value);
  if (t.dataset.ltmodo) return void M.setLtModo(t.dataset.ltmodo, t.value);
  if (t.dataset.ltfreq) return void M.setLtFreq(t.dataset.ltfreq, t.value);
  if (t.dataset.pgmes !== undefined) return void M.setPgMes(t.value);
  if (t.dataset.pgman) return void M.setPgMan(t.dataset.pgman, t.value);
  if (t.dataset.pgest) return void M.setPgEst(t.dataset.pgest, t.value);
  if (t.dataset.calfemp !== undefined) return void M.setCalEmp(t.checked);
  if (t.dataset.ntver !== undefined) return void M.setNtVer(t.value);
  if (t.dataset.nt) return void M.guardarNt(t.dataset.nt, t.value);
  if (t.dataset.cmgmod !== undefined) return void M.setCmgMod(t.value);
  if (t.dataset.liqver !== undefined) return void M.setLiqVer(t.value);
  if (t.dataset.d365auto !== undefined) return void M.d365Auto(t.checked);
  if (t.dataset.d365liq !== undefined) return void M.toggleLiqIva(t.dataset.d365liq);
  if (t.dataset.empf) return void guardarEmpCampo(t.dataset.empf, t.value);
  if (t.dataset.emplogo) { const f = t.files[0]; t.value = ''; return void subirLogo(t.dataset.emplogo, f); }
  if (t.dataset.asib) return void M.asiCampo(t.dataset.asib, t.value);
  if (t.dataset.asip) return void M.asiPrevCampo(t.dataset.asip, t.value);
  if (t.dataset.retclave) return void M.guardarRetClave(t.dataset.retclave, t.value);
  if (t.dataset.prsver !== undefined) return void M.setPrsVer(t.value);
  if (t.dataset.man) return void M.guardarMan303(t.dataset.man, t.value);
  if (t.dataset.iban !== undefined) return void M.guardarIban(t.value);
  if (t.dataset.rectif !== undefined) return void M.setRectif(t.checked);
  if (t.dataset.dzkind) { const fs = [...t.files]; t.value = ''; return void M.subirComo(t.dataset.dzkind, fs); }
  if (t.id === 'aeatIn') { const fs = [...t.files]; t.value = ''; return void M.cargarPdfs(fs); }
  if (t.id === 'archIn') { const fs = [...t.files]; t.value = ''; return void M.subirArchivos(fs); }
  if (t.dataset.glob) {
    S[t.dataset.glob] = t.dataset.glob === 'ejercicio' ? (parseInt(t.value, 10) || S.ejercicio) : t.value;
    return render();
  }
  if (t.dataset.filtro) { S.filtro[t.dataset.filtro] = t.value; return render(); }
  if (t.dataset.estado) return void run(db.from('obligaciones').update({ estado: t.value }).eq('id', t.dataset.estado));
  if (t.dataset.rol) return void run(db.from('profiles').update({ rol: t.value }).eq('id', t.dataset.rol));
  if (t.dataset.activo) return void run(db.from('profiles').update({ activo: t.checked }).eq('id', t.dataset.activo));
});

// Buscador de facturas: filtra mientras se escribe
let tFq;
root.addEventListener('input', (ev) => {
  if (ev.target.dataset.fqf !== undefined) { const k = ev.target.dataset.fqf, v = ev.target.value; clearTimeout(tFq); tFq = setTimeout(() => M.buscarFcCampo(k, v), 250); return; }
  if (ev.target.dataset.fq === undefined) return;
  const v = ev.target.value;
  clearTimeout(tFq);
  tFq = setTimeout(() => M.buscarFc(v), 200); // con miles de filas, se espera a que pares de escribir
});

// Soltar PDF sobre la franja punteada de datos censales
// Menú de bloques: al pasar el ratón por un bloque se abre su panel (superpuesto, sin mover nada); al salir se cierra
let cierraGrp;
root.addEventListener('mouseover', (ev) => {
  const p = ev.target.closest?.('.gpill');
  if (ev.target.closest?.('.tabs-wrap')) clearTimeout(cierraGrp);
  if (p && S.grp !== Number(p.dataset.grp)) { S.grp = Number(p.dataset.grp); refrescarTabs(); }
});
root.addEventListener('mouseout', (ev) => {
  if (S.grp < 0 || !ev.target.closest?.('.tabs-wrap') || ev.relatedTarget?.closest?.('.tabs-wrap')) return;
  cierraGrp = setTimeout(() => { S.grp = -1; refrescarTabs(); }, 250);
});
// Ctrl+V sobre el recuadro de Entrada Información: captura de pantalla o texto copiado de Excel
root.addEventListener('paste', (ev) => { if (ev.target.closest?.('[data-asipega]')) M.asiPegar(ev); });
root.addEventListener('dragover', (ev) => { const dz = ev.target.closest('.dropzone'); if (dz) { ev.preventDefault(); dz.classList.add('over'); } });
root.addEventListener('dragleave', (ev) => ev.target.closest?.('.dropzone')?.classList.remove('over'));
root.addEventListener('drop', (ev) => {
  const dz = ev.target.closest('.dropzone');
  if (!dz) return;
  ev.preventDefault();
  const fs = [...ev.dataTransfer.files];
  return void (dz.dataset.kind ? M.subirComo(dz.dataset.kind, fs) : M.cargarPdfs(fs));
});

// Ancho de las columnas de casillas de los formularios de los modelos: se arrastra el borde derecho de la columna (en la separación entre casillas); doble clic = anchos originales
const colForma = (ev) => {
  const row = ev.target.closest?.('.f-row'); if (!row || row.classList.contains('l1')) return null;
  for (const n of [1, 2, 3]) {
    const c = row.querySelector(`:scope > .c${n}`); if (!c) continue;
    const r = c.getBoundingClientRect(), sig = row.querySelector(`:scope > .c${n + 1}`), limite = sig ? sig.getBoundingClientRect().left : r.right + 16;
    if (ev.clientX >= r.right - 3 && ev.clientX < limite && ev.clientX <= r.right + 16) return { row, n, c };
  }
  return null;
};
const escalaForma = (el) => { const s = document.createElement('div'); s.style.cssText = 'position:absolute;visibility:hidden;width:100px;height:1px'; el.appendChild(s); const z = s.getBoundingClientRect().width / 100; s.remove(); return Number.isFinite(z) && z > 0 ? z : 1; };
root.addEventListener('mousemove', (ev) => { if (!document.body.classList.contains('fr-arrastrando')) document.body.classList.toggle('fr-borde', !!colForma(ev)); });
root.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  const h = colForma(ev); if (!h) return;
  ev.preventDefault();
  const z = escalaForma(h.row), w0 = h.c.getBoundingClientRect().width / z, x0 = ev.clientX, caja = h.row.closest('.f303') ?? h.row, k = `c${h.n}`;
  let w = Math.round(w0);
  document.body.classList.add('fr-arrastrando');
  const mover = (e) => { w = Math.max(70, Math.round(w0 + (e.clientX - x0) / z)); caja.style.setProperty(`--fc${h.n}`, `${w}px`); };
  const soltar = () => {
    document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', soltar);
    document.body.classList.remove('fr-arrastrando', 'fr-borde');
    S.formas[S.tab] = { ...formaDe(), [k]: w };
    try { localStorage.setItem('forma-modelos', JSON.stringify(S.formas)); } catch { /* sin almacenamiento */ }
  };
  document.addEventListener('mousemove', mover); document.addEventListener('mouseup', soltar);
});
root.addEventListener('dblclick', (ev) => {
  if (!colForma(ev)) return;
  ev.preventDefault();
  const f = { ...formaDe() }; delete f.c1; delete f.c2; delete f.c3;
  if (f.w === 1200 && f.t === 1) delete S.formas[S.tab]; else S.formas[S.tab] = f;
  try { localStorage.setItem('forma-modelos', JSON.stringify(S.formas)); } catch { /* sin almacenamiento */ }
  root.querySelectorAll('.f303').forEach((b) => ['--fc1', '--fc2', '--fc3'].forEach((v) => b.style.removeProperty(v)));
  render();
});

boot();
