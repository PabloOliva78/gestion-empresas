import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { crearModulos } from './modulos.js?v=72';

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
  tab: 'cmg', filtro: { area: '', estado: '' },
  ejercicio: new Date().getFullYear(), periodo: '', // periodo '' = todo el ejercicio
  sel: '', menu: false, grp: -1, cargando: false, // empresa elegida ('' = todas) y grupo de pestañas abierto
};
let uidActual = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const puedeEditar = () => ['admin', 'gestor'].includes(S.perfil?.rol);
const esAdmin = () => S.perfil?.rol === 'admin';
const hoy = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => (d ? d.split('-').reverse().join('/') : '');
const empNombre = (id) => S.empresas.find((e) => e.id === id)?.nombre ?? '—';
// Logos en logos/<CIF>.jpg; si no existe el archivo, la imagen se oculta.
const logoHtml = (e, cls = 'logo') => (e?.cif
  ? `<img class="${cls}" src="logos/${esc(e.cif)}.jpg?v=6" alt="" onerror="this.style.visibility='hidden'">` : `<span class="${cls}"></span>`);

// Orden y nombre con que se muestran las empresas en el desplegable (se reconocen por el nombre guardado)
const ORDEN_EMP = [['HEROGRA FERTILIZANTES S.A.', /herogra\s+fertiliz/i], ['HEROGRA ESPECIALES', /herogra\s+especiales/i], ['HISPALENSE DE LIQUIDOS S.L', /hispalense/i],
  ['MAXLOGTRANS S.L.', /maxlogtrans/i], ['LYS DEL SUR S.L.', /lys\s*del\s*sur|lysur/i], ['GESUFER S.L.', /gesufer|gesti[oó]n unificada/i], ['FERTINOVA S.L.', /fertinova/i],
  ['PRODUFER S.L.', /produfer/i], ['FERTICRONOS S.L.', /ferticronos/i], ['TECNOPLUS SOLUBLES S.L.', /tecnoplus/i], ['BISAR AGROINNOVATION S.L.', /bisar/i],
  ['MOTRILEÑA DE LIQUIDOS S.L.', /motrile/i], ['FARM CHEMICALS FGA S.L.', /farm\s*chemicals/i], ['PASEO DE CENES S.L.', /paseo\s*(de\s*)?cenes/i]];
const idxEmp = (e) => ORDEN_EMP.findIndex(([, re]) => re.test(e?.nombre ?? ''));
const etiquetaEmp = (e) => { const i = idxEmp(e); return i < 0 ? e.nombre : `${i + 1}.- ${ORDEN_EMP[i][0]}`; };

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
    db.from('registros').select('id,empresa_id,tipo,ejercicio,datos').not('tipo', 'in', '(fact-E,fact-R,sii-E,sii-R,may-mov)'),
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
  S.cargando = false; render();
}

db.auth.onAuthStateChange((ev, session) => {
  const uid = session?.user?.id ?? null;
  if (ev === 'SIGNED_OUT' || (ev === 'SIGNED_IN' && uid !== uidActual)) setTimeout(boot, 0);
});

// ---------- Pantallas ----------
function renderLogin(msg = '') {
  root.innerHTML = `<main class="login"><form id="f" class="card">
    <h1>Gestión fiscal, contable y laboral</h1>
    <label>Correo<input name="email" type="email" required autocomplete="username"></label>
    <label>Contraseña<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>
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
  };
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
  ['1.- INFORMACIÓN TRIBUTARIA', ['cmg', 'it', 'r111', 'r115', 'r123', 'pres', 'liq', 'venc', 'calf', 'notif', 'iloc', 'dua', 'chkf', 'otros'],
    'aeat', 'Modelos presentados, liquidaciones, pagos y calendario.'],
  ['2.- INFORMACIÓN REGISTRO MERCANTIL', ['dreg', 'trl', 'acc', 'rmca', 'rmcert', 'rmaud', 'rmig', 'rmmem', 'rmacu', 'rmnota', 'rmesc', 'rmactas', 'rmsocios', 'rmlibros', 'rmobl'],
    'rm', 'Datos registrales, titularidad, cuentas depositadas, actas, socios y libros.'],
  ['3.- INFORMACIÓN EMPRESA', ['ficha', 'empresas'], '', 'Ficha de la empresa y listado de empresas del grupo.'],
  ['4.- MODELOS TRIBUTARIOS', ['mod111', 'mod115', 'mod123', 'mod200', 'mod202', 'mod303', 'mod349', 'mod583', 'mod592', 'moda22', 'mod180', 'mod190', 'mod193', 'mod232', 'mod390', 'modintra'],
    'aeat', 'Retenciones, IVA, sociedades, Intrastat y el resto de modelos.'],
  ['5.- CUENTAS CONTABLES', ['bss', 'c4650', 'c4700', 'c4709', 'c473001', 'c473002', 'c473003', 'c473004', 'c4730', 'c4745', 'c4750', 'c47511', 'c47512', 'c47513', 'c47514', 'c4752', 'c4760', 'c6400', 'c6420'], 'pgc', 'Extracto y resumen por periodo de cada cuenta: 465, 47x, 640 y 642.'],
  ['6.- SII – SUMINISTRO INMEDIATO INFORMACIÓN', ['siie', 'siir', 'concsiie', 'concsiir', 'fe', 'fr'], 'sii', 'Facturas emitidas y recibidas frente al SII de la AEAT.'],
  ['8.- CONCILIACIONES FISCALES', ['conc'], '', 'Todas las conciliaciones fiscales y contables.'],
  ['9.- INFORMACIÓN SEGURIDAD SOCIAL', ['nom', 'cssoc', 'cnom', 'ssobl'], 'tgss', 'Nóminas, Seguridad Social y obligaciones laborales.'],
  ['11.- ADMINISTRACIÓN', ['usuarios'], '', 'Usuarios, roles y acceso a las empresas.'],
];
const TABS = {
  calf: ['Calendario Fiscal', 'Plazos y domiciliaciones', () => vistaObligaciones()],
  chkf: ['Checking Fiscal', 'Obligaciones, plazos y límites', () => vistaObligaciones({ area: 'fiscal' })],
  rmobl: ['Plazos registrales', 'Libros y depósito de cuentas', () => vistaObligaciones({ area: 'mercantil' })],
  ficha: ['Ficha de la empresa', 'Datos y resumen', () => vistaFicha()],
  empresas: ['Empresas', 'Listado y logos', () => vistaEmpresas()],
  m303: ['303 IVA', '4700 · 4750 · 472 · 477', () => vistaConciliaciones(['4700', '4750', '472', '477'])],
  m111: ['111 · 115 · 123', 'Retenciones · 4751', () => vistaConciliaciones(['4751'])],
  m200: ['200 · 202 Sociedades', '4752 · 473 · 474', () => vistaConciliaciones(['4752', '473', '474'])],
  c47: ['Grupo 47', 'Administraciones Públicas', () => vistaConciliaciones(['47'])],
  c465: ['465', 'Remuneraciones pendientes de pago', () => vistaConciliaciones(['465'])],
  c640: ['640', 'Sueldos y salarios', () => vistaConciliaciones(['640'])],
  c642: ['642', 'Seguridad Social a cargo de la empresa', () => vistaConciliaciones(['642'])],
  ssconc: ['Nóminas y Seguridad Social', '476 · 465 · 640 · 642', () => vistaConciliaciones(['476', '465', '640', '642'])],
  ssobl: ['Obligaciones laborales', 'RLC/RNT y nóminas', () => vistaObligaciones({ area: 'laboral' })],
  conc: ['Todas las conciliaciones', 'Todas las cuentas', () => vistaConciliaciones()],
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
  ficha: () => ({ t: 'Por empresa' }), empresas: () => ({ t: `${S.empresas.length} empresas` }),
  m303: () => badgeConc(['4700', '4750', '472', '477']), m111: () => badgeConc(['4751']), m200: () => badgeConc(['4752', '473', '474']),
  c47: () => badgeConc(['47']), c465: () => badgeConc(['465']), c640: () => badgeConc(['640']), c642: () => badgeConc(['642']),
  ssconc: () => badgeConc(['476', '465', '640', '642']), conc: () => badgeConc(null),
  usuarios: () => ({ t: `${S.usuarios.length} usuarios` }),
};
const insignia = (id) => {
  const b = (BADGES_APP[id] ?? M.badges[id])?.();
  return b ? `<span class="badge ${b.c ?? ''}">${esc(b.t)}</span>` : '';
};
const ICONOS = { aeat: 'png', rm: 'png', pgc: 'jpg', sii: 'png', tgss: 'png' };
const iconoGrupo = (k) => (k ? `<img class="gico" src="logos/grupo-${k}.${ICONOS[k]}?v=11" alt="" onerror="this.remove()">` : '');

function tabsNav() {
  const grupos = GRUPOS.map(([tit, ids, ico, sub], i) => ({ i, tit, ico, sub, ids: ids.filter((id) => (!TABS[id][3] || esAdmin()) && (!TABS[id][4] || TABS[id][4]())) }))
    .filter((g) => g.ids.length);
  const abierto = grupos.find((g) => g.i === S.grp);
  const nombre = (t) => { const s = t.replace(/^\d+\.-\s*/, ''); return s.charAt(0) + s.slice(1).toLowerCase(); };
  return `<div class="tabs-wrap"><nav class="tabs">${grupos.map((g) => `<button class="gpill${g.ids.includes(S.tab) ? ' act' : ''}${S.grp === g.i ? ' abierto' : ''}" data-grp="${g.i}">
      ${iconoGrupo(g.ico)}<span><b>${esc(g.tit)} ▾</b>${g.ids.includes(S.tab) ? `<small>${esc(TABS[S.tab][0])}</small>` : ''}</span></button>`).join('')}</nav>
    ${abierto ? `<div class="gpanel"><div class="gpanel-h"><span class="gpanel-ico">${iconoGrupo(abierto.ico)}</span>
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

function render() {
  if (!TABS[S.tab] || (TABS[S.tab][3] && !esAdmin())) S.tab = 'cmg';
  const e = S.empresas.find((x) => x.id === S.sel);
  const per = S.periodo ? (PERIODOS[S.periodo] ?? S.periodo) : 'Todo el ejercicio';
  root.innerHTML = `<div class="layout">
    <aside class="lat">
      <div>${e ? logoHtml(e, 'logo-aside') : ''}<h1>CONCILIACIÓN FISCAL – CONTABLE</h1></div>
      <div class="two">
        <label>Ejercicio<select data-glob="ejercicio">${ejercicios().map((y) =>
    `<option${y === Number(S.ejercicio) ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
        <label>Periodo<select data-glob="periodo"><option value="">Todo el ejercicio</option>${opts(PERIODOS, S.periodo)}</select></label>
      </div>
      <div class="lbl">Empresa${empresaSelector()}</div>
      ${puedeEditar() ? `<input type="file" id="archIn" multiple hidden>
        <input type="file" id="carpetaIn" webkitdirectory multiple hidden>
        <span class="hint" id="pdfEstado"></span>` : ''}
      <div class="lat-pie">${esc(S.perfil.nombre || S.perfil.email)}<br><span class="chip">${ROLES[S.perfil.rol]}</span>
        <button id="out" class="small">Salir</button></div>
    </aside>
    <main class="princ">
      <header class="doc"><div><h2>CONCILIACIÓN FISCAL – CONTABILIDAD – AUDITORÍA</h2>
        <p class="doc-emp">${e ? `${esc(e.nombre)} · ${esc(e.cif)}` : 'Todas las empresas'}</p>
        <p><b>Ejercicio ${esc(S.ejercicio)} · ${esc(per)}</b>${S.cargando ? ' · <span class="hint">Cargando datos…</span>' : ''}</p></div>
        <div class="doc-r"><span>Fecha del documento</span><b>${fmt(hoy())}</b></div></header>
      ${tabsNav()}
      <section class="vista"><h3 class="tab-tit">${esc(TABS[S.tab][0])} <small>${esc(TABS[S.tab][1])}</small></h3>${TABS[S.tab][2]()}</section>
    </main></div>`;
  alinearPanel();
  restaurarFoco();
}

// Celdas de importes editables: el foco sobrevive a los redibujados y se navega con flechas, Intro y tabulador
let focoCelda = null;
const ATTR_CELDA = ['data-prs', 'data-nom'];
function restaurarFoco() {
  if (!focoCelda || (document.activeElement && document.activeElement !== document.body)) return;
  const i = root.querySelector(`input[${focoCelda.a}="${focoCelda.v}"]`);
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
root.addEventListener('keydown', (ev) => {
  const i = ev.target;
  if (!i?.matches?.('td.in input') || ev.ctrlKey || ev.altKey || ev.metaKey) return;
  const k = ev.key;
  let dest = null;
  if (k === 'ArrowDown' || (k === 'Enter' && !ev.shiftKey)) dest = celdaVecina(i, 1, 0);
  else if (k === 'ArrowUp' || (k === 'Enter' && ev.shiftKey)) dest = celdaVecina(i, -1, 0);
  else if (k === 'ArrowRight' && i.selectionStart === i.value.length) dest = celdaVecina(i, 0, 1);
  else if (k === 'ArrowLeft' && i.selectionEnd === 0) dest = celdaVecina(i, 0, -1);
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
function vistaEmpresas() {
  const ed = puedeEditar();
  const cel = (e, campo, v, ph = '') => (ed ? `<input class="emp-in" data-empf="${e.id}|${campo}" value="${esc(v ?? '')}" placeholder="${ph}">` : esc(v ?? ''));
  const sel = (e, campo, ops, v) => (ed ? `<select data-empf="${e.id}|${campo}">${Object.entries(ops).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>` : esc(ops[v] ?? v ?? ''));
  const TIPOS = { '': '—', GE: 'Gran empresa (mensual)', PYME: 'Pyme (trimestral)' };
  const filas = [...S.empresas].sort((a, b) => (idxEmp(a) < 0 ? 99 : idxEmp(a)) - (idxEmp(b) < 0 ? 99 : idxEmp(b))).map((e) => `<tr><td><div class="emp">${logoHtml(e)}${esc(etiquetaEmp(e))}</div></td><td>${esc(e.cif)}</td>
    <td>${cel(e, 'siglas', e.siglas, 'Sigla')}</td><td>${sel(e, 'tipo', TIPOS, e.tipo ?? '')}</td><td>${sel(e, 'programa', PROGRAMAS, programaDe(e))}</td><td>${cel(e, 'banco', e.datos?.banco, 'Banco')}</td>
    <td class="acciones">${ed ? `<button class="small" data-act="edit-emp" data-id="${e.id}">Editar</button>` : ''}${esAdmin() ? `<button class="small danger" data-act="del-emp" data-id="${e.id}" title="Borrar">✕</button>` : ''}</td></tr>`).join('');
  return `<div class="bar"><span class="space"></span>
    ${ed ? '<button class="primary" data-act="new-emp">Nueva empresa</button>' : ''}</div>
    ${S.empresas.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>NIF</th><th>Sigla</th><th>Tipo</th><th>Programa</th><th>Banco</th><th></th></tr></thead>
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
const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n ?? 0);
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
const M = crearModulos({ db, S, esc, opts, openForm, fmt, render, cargar, eur, empNombre, PERIODOS, logoHtml });
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
  const t = ev.target.closest('button');
  if (!t) return;
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
    'del-emp': () => confirm('¿Borrar la empresa y TODAS sus obligaciones?') && run(db.from('empresas').delete().eq('id', id)),
    'new-obl': () => formObligacion({ area: AREA_TAB[S.tab] }),
    'edit-obl': () => formObligacion(S.obligaciones.find((o) => o.id === id)),
    'del-obl': () => confirm('¿Borrar la obligación?') && run(db.from('obligaciones').delete().eq('id', id)),
    calendario: () => formCalendario(),
    inicio: () => { S.tab = 'cmg'; S.grp = -1; render(); },
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
  if (t.dataset.csscta !== undefined) return void M.setCssCta(t.value);
  if (t.dataset.empf) return void guardarEmpCampo(t.dataset.empf, t.value);
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
root.addEventListener('dragover', (ev) => { const dz = ev.target.closest('.dropzone'); if (dz) { ev.preventDefault(); dz.classList.add('over'); } });
root.addEventListener('dragleave', (ev) => ev.target.closest?.('.dropzone')?.classList.remove('over'));
root.addEventListener('drop', (ev) => {
  const dz = ev.target.closest('.dropzone');
  if (!dz) return;
  ev.preventDefault();
  const fs = [...ev.dataTransfer.files];
  return void (dz.dataset.kind ? M.subirComo(dz.dataset.kind, fs) : M.cargarPdfs(fs));
});

boot();
