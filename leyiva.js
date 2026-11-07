// Bloque 10 · Exenciones y Leyes.
// Se carga el texto de la Ley 37/1992 del IVA (PDF, TXT o HTML del BOE), se parte en artículos, se sacan las exenciones (arts. 20 a 26)
// y las facturas emitidas y recibidas del libro de IVA se revisan frente a sus reglas. La consulta busca en el texto cargado (no inventa nada).
import { lineasPagina, rangoPeriodo } from './lectores.js?v=41';

const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SUF = /^(bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies|undecies|duodecies|terdecies|quaterdecies|quindecies)$/;
const ORD = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece'];

// ---------- Lectura del texto de la ley ----------
const RUIDO = /^(bolet[ií]n oficial del estado|legislaci[oó]n consolidada|p[aá]gina \d+|p[aá]g\. ?\d+|https?:\/\/|[uú]ltima modificaci[oó]n|cve:|verificable en|(t[ií]tulo|cap[ií]tulo|secci[oó]n) [ivxlc\d]+\b|^\d{1,3}$)/i;

export function partirLey(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !RUIDO.test(sinAc(l)) && !/^\d{1,3}$/.test(l));
  const sec = []; let cur = null, ultimo = 0, enDisp = false;
  const nuevo = (o) => { cur = { ...o, texto: '' }; sec.push(cur); };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    let m = /^Disposici[oó]n (adicional|transitoria|final|derogatoria) ([^.]+)\.\s*(.*)$/i.exec(l);
    if (m) { enDisp = true; const id = `D${m[1][0].toUpperCase()}-${sinAc(m[2]).replace(/\s+/g, '')}`; if (!sec.some((s) => s.id === id)) { nuevo({ id, tipo: 'disp', num: 0, titulo: `Disposición ${m[1]} ${m[2]}${m[3] ? '. ' + m[3] : ''}` }); continue; } }
    m = !enDisp && /^Art[ií]culo (\d+)(?: (\w+))?\.\s*(.*)$/i.exec(l);
    if (m) {
      const n = +m[1], suf = m[2] && SUF.test(sinAc(m[2])) ? sinAc(m[2]) : '';
      if (m[2] && !suf) m = null;
      else if (n >= ultimo && n <= ultimo + 40) {
        const id = suf ? `${n} ${suf}` : String(n);
        if (!sec.some((s) => s.id === id)) { ultimo = n; nuevo({ id, tipo: 'art', num: n, titulo: m[3] || lineas[i + 1] || '' }); if (!m[3]) i++; continue; }
      }
    }
    if (cur) cur.texto += (cur.texto ? '\n' : '') + l;
  }
  return sec;
}

// Exenciones: artículos 20 a 26, separadas por apartado (Uno, Dos…) y por número ordinal (1.º, 2.º…)
export function sacarExenciones(secciones) {
  const out = [];
  for (const s of secciones.filter((x) => x.tipo === 'art' && x.num >= 20 && x.num <= 26 && !/ /.test(x.id))) {
    let ap = '', item = null;
    const cierra = () => { if (item) { item.texto = item.texto.trim(); out.push(item); item = null; } };
    for (const l of s.texto.split('\n')) {
      const a = /^(Uno|Dos|Tres|Cuatro|Cinco|Seis|Siete|Ocho|Nueve|Diez)\.\s*(.*)$/.exec(l);
      const o = /^(\d{1,2})\.\s?[º°]\s*(.*)$/.exec(l);
      if (a) { cierra(); ap = a[1]; item = { art: s.num, ap, n: 0, texto: a[2] }; continue; }
      if (o) { cierra(); item = { art: s.num, ap, n: +o[1], texto: o[2] }; continue; }
      if (!item) item = { art: s.num, ap, n: 0, texto: '' };
      item.texto += (item.texto ? ' ' : '') + l;
    }
    cierra();
  }
  return out.filter((e) => e.texto.length > 12).map((e) => ({ ...e, ref: `Art. ${e.art}${e.ap ? '.' + e.ap : ''}${e.n ? '.' + e.n + '.º' : ''}` }));
}

// Temas más importantes de la Ley: [tema, artículos, para qué sirve en la revisión]
const TEMAS = [
  ['Hecho imponible y no sujeción', ['4', '5', '7', '8', '11', '13', '15'], 'Qué operaciones tributan y cuáles no (art. 7, no sujetas).'],
  ['Lugar de realización', ['68', '69', '70'], 'Si el IVA es español o no: bienes (68), servicios (69, 70).'],
  ['Exenciones en operaciones interiores', ['20'], 'Sanidad, enseñanza, seguros, financieras, arrendamientos de vivienda, segundas entregas de edificaciones…'],
  ['Exportaciones y operaciones asimiladas', ['21', '22', '23', '24'], 'Entregas fuera de la UE (art. 21), zonas francas y regímenes aduaneros.'],
  ['Operaciones intracomunitarias', ['25', '26', '13', '14', '15', '16'], 'Entregas exentas a otro Estado miembro (art. 25) y adquisiciones intracomunitarias.'],
  ['Devengo', ['75', '76', '77'], 'Cuándo se devenga el impuesto.'],
  ['Base imponible y modificación', ['78', '79', '80'], 'Qué entra en la base; rectificación e impagados (art. 80).'],
  ['Sujeto pasivo e inversión (ISP)', ['84', '85', '86', '87'], 'Quién ingresa el IVA; inversión del sujeto pasivo (art. 84.Uno.2.º).'],
  ['Repercusión', ['88', '89'], 'Repercusión de las cuotas y rectificación de las repercutidas.'],
  ['Tipos impositivos', ['90', '91', '92'], 'General 21 % (art. 90), reducido 10 % y superreducido 4 % (art. 91).'],
  ['Deducciones: requisitos', ['92', '93', '94', '95', '96', '97'], 'Cuotas deducibles, limitaciones (95) y exclusiones (96); requisitos de la factura (97).'],
  ['Deducciones: nacimiento y plazo', ['98', '99', '100', '101'], 'Cuándo nace el derecho a deducir y su caducidad (4 años).'],
  ['Prorrata', ['102', '103', '104', '105', '106'], 'Actividades con y sin derecho a deducir.'],
  ['Regularización de bienes de inversión', ['107', '108', '109', '110', '111', '112', '113'], 'Ajustes en 5 años (10 en inmuebles).'],
  ['Obligaciones del sujeto pasivo', ['164', '165'], 'Facturar, llevar libros, declarar.'],
  ['Regímenes especiales', ['122', '148', '149', '163 decies'], 'Simplificado, recargo de equivalencia, criterio de caja…'],
];

// Resumen orientativo para cuando todavía no hay ley cargada (siempre se contrasta con el texto de la ley)
const FAQ = [
  ['tipo tipos impositivos general reducido superreducido porcentaje 21 10 4', 'Tipos del IVA', 'Tipo general 21 % (art. 90), reducido 10 % y superreducido 4 % (art. 91). Hay tipos temporales fijados por real decreto-ley: comprobar su vigencia antes de aplicarlos.', ['90', '91']],
  ['devengo cuando devenga entrega servicio anticipo', 'Devengo', 'Las entregas de bienes se devengan cuando se ponen en poder del adquirente; los servicios, cuando se prestan; los cobros anticipados, en el momento del cobro por el importe cobrado.', ['75']],
  ['deducir deduccion plazo caduca cuatro anos nace derecho', 'Plazo para deducir el IVA soportado', 'El derecho a deducir nace al devengarse la cuota y puede ejercerse hasta que pasen cuatro años desde ese nacimiento.', ['98', '99', '100']],
  ['inversion sujeto pasivo isp construccion obra chatarra', 'Inversión del sujeto pasivo', 'Ejecuciones de obra de construcción o rehabilitación para promotores o contratistas, chatarra, oro y otros supuestos del art. 84.Uno.2.º: la factura va sin IVA y lo autorrepercute el destinatario.', ['84']],
  ['entrega intracomunitaria exenta nif iva comunitario 349', 'Entregas intracomunitarias exentas', 'Exentas si el adquirente es un empresario con NIF-IVA de otro Estado miembro y los bienes se transportan fuera de España dentro de la UE; se declaran en el modelo 349.', ['25']],
  ['exportacion exenta fuera union europea aduana dua', 'Exportaciones', 'Entregas de bienes enviados fuera de la UE exentas (art. 21); se justifican con el documento aduanero de salida.', ['21']],
  ['factura requisitos deducir original nif proveedor', 'Requisitos para deducir', 'Hace falta factura original (o documento aduanero) con los datos del art. 97; sin NIF del proveedor no se deduce, salvo factura simplificada.', ['97']],
  ['limitaciones deduccion vehiculos atenciones clientes joyas exclusiones afectacion', 'Limitaciones y exclusiones', 'Solo se deduce lo afecto a la actividad (art. 95; vehículos: presunción del 50 %) y hay gastos excluidos (art. 96: joyas, alimentos, espectáculos, atenciones a clientes…).', ['95', '96']],
  ['rectificar modificar base imponible impagados incobrable', 'Modificación de la base', 'La base se modifica por devoluciones, descuentos, rectificaciones y créditos incobrables (art. 80), con los plazos y requisitos de ese artículo.', ['80']],
  ['lugar realizacion servicios bienes localizacion empresario destinatario', 'Lugar de realización', 'Bienes: art. 68. Servicios a empresarios: donde está establecido el destinatario (art. 69.Uno.1.º); a particulares: donde está el prestador; reglas especiales en el art. 70.', ['68', '69', '70']],
  ['prorrata', 'Prorrata', 'Si hay operaciones con y sin derecho a deducir, solo se deduce el porcentaje que fija la prorrata (arts. 102 a 106).', ['102', '103', '104']],
  ['recargo equivalencia comerciante minorista', 'Recargo de equivalencia', 'Régimen de los comerciantes minoristas: el proveedor repercute IVA más recargo (5,2 %, 1,4 % o 0,5 %). Arts. 148 a 163.', ['148', '149']],
];

// ---------- Reglas de revisión de facturas ----------
const RE_UE = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|GR|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[A-Z0-9]/i;
const esNifEs = (n) => /^(ES)?([0-9XYZKLM]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])$/i.test(n || '');
const esUE = (n) => RE_UE.test(n || '');
const esExtranjero = (n) => !!n && !esNifEs(n);
const TIPOS_OK = [0, 0.5, 1.4, 4, 5, 5.2, 7.5, 10, 21];
const MAP_SUF = { NR: 21, RD: 10, SR: 4, RDN: 5 };

// regla → [gravedad, artículos de la Ley, título]
export const REGLAS = {
  cuota: ['error', ['78', '90', '91'], 'La cuota no coincide con base × tipo'],
  tipo: ['aviso', ['90', '91'], 'Tipo de IVA que no existe en la Ley'],
  tcod: ['aviso', ['90', '91'], 'El tipo no coincide con el del código de impuesto'],
  cero: ['error', ['78', '90'], 'Cuota con tipo 0 %'],
  exCuota: ['error', ['20', '21', '25', '7', '69'], 'Operación exenta, no sujeta o no localizada en España con IVA repercutido'],
  ueNif: ['error', ['25'], 'Entrega intracomunitaria exenta sin NIF-IVA comunitario del cliente'],
  uesNif: ['aviso', ['69'], 'Servicio a la UE no sujeto: el cliente no tiene NIF-IVA comunitario'],
  exNif: ['aviso', ['21'], 'Exportación a un cliente con NIF español'],
  ispCuota: ['error', ['84'], 'Factura con inversión del sujeto pasivo y con cuota'],
  locEmit: ['aviso', ['68', '69'], 'IVA español a un cliente comunitario: revisar el lugar de realización'],
  sopExt: ['aviso', ['69', '84', '85'], 'IVA español soportado a un proveedor extranjero'],
  aicEs: ['error', ['13', '15'], 'Adquisición intracomunitaria con proveedor de NIF español'],
  ispSin: ['aviso', ['84'], 'Inversión del sujeto pasivo sin cuota autorrepercutida'],
  nif: ['aviso', ['97', '164'], 'Factura sin NIF'],
  caduca: ['error', ['98', '99', '100'], 'Deducción fuera del plazo de cuatro años'],
  fpost: ['aviso', ['97', '98'], 'Factura fechada después de su anotación en el libro'],
  dup: ['aviso', ['97', '164'], 'Posible factura duplicada'],
};
const CAUSA_EXENTA = [[/^R\.EX/, 'Art. 21 · exportación'], [/^R\.UE$/, 'Art. 25 · entrega intracomunitaria'], [/^R\.(NC|RC)\.EX/, 'Art. 20 · exención en operaciones interiores'],
  [/^R\.UE\.S$/, 'Art. 69 · servicio no sujeto por localización'], [/^R\.NAC\.NS/, 'Art. 7 · operación no sujeta'], [/^R\.ISP\./, 'Art. 84.Uno · inversión del sujeto pasivo']];

const masAnios = (iso, n) => `${+iso.slice(0, 4) + n}${iso.slice(4)}`;
export function revisar(lineas, sentido, desde, hasta) {
  const emit = sentido === 'E';
  const sel = lineas.filter((l) => l.sentido === sentido && !/^(R\.)?I\./i.test(l.codigo) && l.codigo !== 'SIN.DATOS'
    && (emit ? (l.ff || l.fecha) : (l.fecha || l.ff)) >= desde && (emit ? (l.ff || l.fecha) : (l.fecha || l.ff)) <= hasta);
  const dups = new Map();
  if (!emit) for (const l of sel) { const k = [l.factura, l.nif, l.codigo, l.base, l.cuota].join('|'); (dups.get(k) ?? dups.set(k, new Set()).get(k)).add(l.asiento); }
  const res = [];
  for (const l of sel) {
    const c = String(l.codigo || '').toUpperCase(), nif = String(l.nif || '').toUpperCase().replace(/[\s-]/g, ''), a = [];
    const base = +l.base || 0, cuota = +l.cuota || 0, pct = Math.abs(+l.pct || 0);
    const add = (id, det = '') => a.push({ id, det });
    const sfx = /\.(NR|RD|SR|RDN)(\.SR)?$/.exec(c);
    const exenta = CAUSA_EXENTA.slice(0, 5).some(([re]) => re.test(c));
    const sinCuota = /^R\.(ISP|RC|UE)/.test(c); // emitidas sin IVA por diseño (ISP, adquisiciones UE): la cuota no se calcula con el tipo
    if (!sinCuota && pct > 0 && Math.abs(cuota - (base * pct) / 100) > 0.03 + Math.abs(base) * 1e-6) add('cuota', `esperada ${nf.format(r2((base * pct) / 100))}`);
    if (pct > 0 && !TIPOS_OK.includes(pct)) add('tipo', `${pct} %`);
    if (!sinCuota && sfx && pct > 0 && pct !== MAP_SUF[sfx[1]]) add('tcod', `código ${c} (${MAP_SUF[sfx[1]]} %) y tipo ${pct} %`);
    if (pct === 0 && Math.abs(cuota) > 0.005 && !exenta) add('cero');
    if (emit) {
      if (exenta && Math.abs(cuota) > 0.005) add('exCuota', `${c}: cuota ${nf.format(cuota)}`);
      if (c === 'R.UE' && (!nif || esNifEs(nif))) add('ueNif', nif ? `NIF ${nif}` : 'sin NIF');
      if (c === 'R.UE.S' && (!nif || esNifEs(nif))) add('uesNif', nif ? `NIF ${nif}` : 'sin NIF');
      if (/^R\.EX/.test(c) && esNifEs(nif) && !/canarias|ceuta|melilla/i.test(`${l.tipoPais ?? ''} ${l.pais ?? ''}`)) add('exNif', `NIF ${nif}`);
      if (/^R\.ISP\./.test(c) && Math.abs(cuota) > 0.005) add('ispCuota');
      if (/^R\.(NC|RC)\.(NR|RD|SR|RDN)/.test(c) && esUE(nif) && !esNifEs(nif)) add('locEmit', `NIF ${nif}`);
      if (!nif && !/^R\.NAC\.NS/.test(c) && Math.abs(base) > 3000) add('nif', 'base superior a 3.000 €');
    } else {
      if (/^S\.NC\./.test(c) && !/ISP/.test(c) && esExtranjero(nif) && Math.abs(cuota) > 0.005) add('sopExt', `NIF ${nif}`);
      if (/^S\.UE\./.test(c) && esNifEs(nif)) add('aicEs', `NIF ${nif}`);
      if (/^S\.ISP\./.test(c) && pct > 0 && Math.abs(cuota) < 0.005) add('ispSin');
      if (!nif && Math.abs(cuota) > 0.005 && Math.abs(base) > 400) add('nif', 'sin NIF del proveedor y base superior a 400 €');
      if (l.ff && l.fecha && masAnios(l.ff, 4) < l.fecha) add('caduca', `factura ${l.ff.split('-').reverse().join('/')}, anotada ${l.fecha.split('-').reverse().join('/')}`);
      if (l.ff && l.fecha && l.ff > l.fecha) add('fpost');
      if (dups.get([l.factura, l.nif, l.codigo, l.base, l.cuota].join('|'))?.size > 1) add('dup', 'misma factura en asientos distintos');
    }
    res.push({ l, a });
  }
  return res;
}

// ---------- Módulo ----------
export function crearLeyIva(c) {
  const { S, esc, render, empresa, db, puede, grande } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  const ST = { sub: 'resumen', idx: '', q: '', res: null, sent: 'E', regla: '', pag: 100, msg: '', exQ: '', exArt: '' };
  let LEY; // undefined = sin pedir · null = sin ley cargada · objeto = ley

  const cache = (v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('leyiva-cache') || 'null'); localStorage.setItem('leyiva-cache', JSON.stringify(v)); } catch { /* sin almacenamiento */ } return null; };
  async function pedirLey() {
    if (LEY !== undefined) return;
    LEY = cache() ?? null; // mientras llega, lo último guardado en este navegador
    const { data, error } = await db.from('leyes').select('*').eq('id', 'iva').maybeSingle();
    if (!error) { LEY = data ? { ...data.datos, nombre: data.nombre } : LEY; if (data) cache(LEY); }
    else ST.msg = `No se pudo leer la tabla «leyes» (${error.message}). Ejecute supabase/06_leyes.sql en Supabase; mientras tanto la ley se guarda solo en este navegador.`;
    render();
  }
  const secs = () => LEY?.secciones ?? [];
  const art = (n) => secs().find((s) => s.tipo === 'art' && s.id === String(n));
  const tituloArt = (n) => { const s = art(n); return s ? `Art. ${s.id}. ${s.titulo}` : `Art. ${n}`; };
  const textoArt = (n, max = 1400) => { const s = art(n); return s ? (s.texto.length > max ? s.texto.slice(0, max) + '…' : s.texto) : ''; };
  const detalleArt = (n) => (art(n) ? `<button class="ley-art" data-leyart="${esc(art(n).id)}"><span>${esc(tituloArt(n))}</span><i>Abrir ›</i></button>` : `<span class="chip">Art. ${esc(n)}</span>`);
  const sinLey = () => `<p class="ley-aviso">Todavía no hay ninguna ley cargada: vaya a <b>Ley IVA 37/1992</b> y suelte el PDF (o el TXT/HTML) del BOE. Sin ella, las revisiones y las consultas usan solo el resumen orientativo.</p>`;

  // --- lectura del archivo ---
  async function textoDeArchivo(f) {
    if (/\.pdf$/i.test(f.name)) {
      const lib = window.pdfjsLib; if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js).');
      lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise, out = [];
      for (let p = 1; p <= doc.numPages; p++) {
        if (p % 10 === 0) { ST.msg = `Leyendo ${f.name}: página ${p} de ${doc.numPages}…`; render(); }
        const tc = await (await doc.getPage(p)).getTextContent();
        out.push(lineasPagina(tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))).join('\n'));
      }
      return out.join('\n');
    }
    const buf = new Uint8Array(await f.arrayBuffer()); let t = new TextDecoder('utf-8').decode(buf);
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
    if (/\.html?$/i.test(f.name) || /^\s*<(!doctype|html)/i.test(t)) {
      const d = new DOMParser().parseFromString(t.replace(/<\/(p|div|h\d|li|tr|br)>/gi, '\n$&').replace(/<br\s*\/?>/gi, '\n'), 'text/html');
      d.querySelectorAll('script,style').forEach((e) => e.remove());
      return d.body.textContent;
    }
    return t;
  }
  async function cargarLey(f) {
    if (!f) return;
    if (!puede()) return void alert('Solo un administrador o gestor puede cargar la ley.');
    try {
      ST.msg = `Leyendo ${f.name}…`; render();
      const secciones = partirLey(await textoDeArchivo(f)), arts = secciones.filter((s) => s.tipo === 'art');
      if (arts.length < 20) throw new Error(`Solo se reconocen ${arts.length} artículos: el archivo no parece la Ley del IVA con los artículos en texto (¿es un escaneo?).`);
      const ley = { nombre: 'Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido', fuente: f.name, cargada: new Date().toISOString().slice(0, 10), secciones, exenciones: sacarExenciones(secciones) };
      const { error } = await db.from('leyes').upsert({ id: 'iva', nombre: ley.nombre, datos: ley, updated_at: new Date().toISOString() });
      cache(ley); LEY = ley;
      ST.msg = error ? `Ley leída (${arts.length} artículos) pero NO se guardó en Supabase: ${error.message}. Ejecute supabase/06_leyes.sql; queda guardada solo en este navegador.` : `✔ ${f.name}: ${arts.length} artículos y ${ley.exenciones.length} exenciones leídas, guardadas para todos los usuarios.`;
    } catch (e) { ST.msg = `✘ ${f.name}: ${e.message}`; }
    render();
  }
  async function quitarLey() {
    if (!puede() || !confirm('¿Quitar la ley cargada?')) return;
    await db.from('leyes').delete().eq('id', 'iva'); cache(null); LEY = null; ST.res = null; render();
  }

  // --- vistas ---
  const subnav = (lista) => `<nav class="subtabs">${lista.map(([k, l]) => `<button class="${k === ST.sub ? 'on' : ''}" data-leysub="${k}">${l}</button>`).join('')}</nav>`;
  const msg = () => (ST.msg ? `<p class="ley-msg">${esc(ST.msg)}</p>` : '');

  function vistaLey() {
    pedirLey();
    const zona = puede() ? `<div class="dropzone" data-leyfile="1" tabindex="0" role="button"><b>${LEY ? 'Suelte otra versión de la ley para sustituirla' : 'Suelte aquí la Ley 37/1992 del IVA'}</b> (PDF, TXT o HTML del BOE; mejor el texto consolidado). Se divide en artículos y se guarda para todos los usuarios.<input type="file" id="leyFileIn" accept=".pdf,.txt,.htm,.html" hidden></div>` : '';
    if (!LEY) return `${zona}${msg()}${sinLey()}${faqHtml()}`;
    const arts = secs().filter((s) => s.tipo === 'art'), disp = secs().length - arts.length;
    const temas = TEMAS.map(([t, ns, para]) => {
      const hay = ns.filter((n) => art(n));
      return `<div class="ley-tema"><h4>${esc(t)}</h4><p class="hint">${esc(para)}</p>${hay.length ? hay.map(detalleArt).join('') : '<p class="hint">Artículos no encontrados en el texto cargado.</p>'}</div>`;
    }).join('');
    return `<div class="ley-fijo">${zona}${msg()}<div class="ley-cab"><b>${esc(LEY.nombre)}</b><span>Archivo ${esc(LEY.fuente)} · cargado el ${esc((LEY.cargada || '').split('-').reverse().join('/'))} · ${arts.length} artículos${disp ? ` · ${disp} disposiciones` : ''} · ${(LEY.exenciones || []).length} exenciones</span>${puede() ? '<button class="small danger" data-leyquitar="1">Quitar la ley</button>' : ''}</div>
      ${subnav([['resumen', 'Lo más importante'], ['indice', 'Índice completo']])}</div>
      ${ST.sub === 'indice' ? `<input class="ley-buscar" data-leyidx="1" placeholder="Filtrar artículos (p. ej. 20, exentas, deducción…)" value="${esc(ST.idx)}"><div id="leyIdxLista">${indiceHtml()}</div>` : `<div class="ley-temas">${temas}</div>`}`;
  }
  function indiceHtml() {
    const f = sinAc(ST.idx).trim();
    const l = secs().filter((s) => !f || sinAc(`${s.id} ${s.titulo}`).includes(f) || (f.length > 3 && sinAc(s.texto).includes(f))).slice(0, 80);
    return l.map((s) => `<button class="ley-art" data-leyart="${esc(s.id)}"><span>${s.tipo === 'art' ? `Art. ${esc(s.id)}. ` : ''}${esc(s.titulo)}</span><i>Abrir ›</i></button>`).join('') || '<p class="vacio">Sin resultados.</p>';
  }
  function faqHtml() {
    return `<section class="ley-tema"><h4>Resumen orientativo (sin ley cargada)</h4>${FAQ.map(([, t, r, ns]) => `<p><b>${esc(t)}.</b> ${esc(r)} <span class="hint">(Arts. ${ns.join(', ')})</span></p>`).join('')}</section>`;
  }

  function vistaExenciones() {
    pedirLey();
    const ex = LEY?.exenciones ?? [];
    if (!ex.length) return `${msg()}${LEY ? '<p class="vacio">La ley cargada no trae exenciones reconocibles (arts. 20 a 26).</p>' : sinLey()}
      <section class="ley-tema"><h4>Dónde están las exenciones</h4><p>Operaciones interiores: <b>art. 20</b> · exportaciones: <b>art. 21</b> · asimiladas: <b>arts. 22 a 24</b> · entregas intracomunitarias: <b>art. 25</b> · adquisiciones intracomunitarias: <b>art. 26</b>. Las no sujetas están en el <b>art. 7</b>.</p></section>`;
    const f = sinAc(ST.exQ).trim();
    const l = ex.filter((e) => (!ST.exArt || String(e.art) === ST.exArt) && (!f || sinAc(`${e.ref} ${e.texto}`).includes(f)));
    return `${msg()}<div class="bar"><label>Artículo<select data-leyexart="1"><option value="">Todos (20 a 26)</option>${[20, 21, 22, 23, 24, 25, 26].filter((n) => ex.some((e) => e.art === n)).map((n) => `<option value="${n}"${String(n) === ST.exArt ? ' selected' : ''}>Art. ${n}</option>`).join('')}</select></label>
      <input class="ley-buscar" data-leyexq="1" placeholder="Buscar en las exenciones (p. ej. vivienda, seguros, enseñanza…)" value="${esc(ST.exQ)}"><span class="space"></span><span class="hint">${l.length} de ${ex.length}</span></div>
      <div class="wrap" id="leyExLista">${exTabla(l)}</div>
      <p class="hint">Textos extraídos de la ley cargada. Una exención aplicada a una factura se ve en «Revisión de facturas» (códigos R.EX, R.UE, R.NC.EX…).</p>`;
  }
  const exTabla = (l) => `<table class="tabla"><thead><tr><th>Referencia</th><th>Exención</th></tr></thead><tbody>${l.slice(0, 300).map((e) => `<tr><td class="ley-ref">${esc(e.ref)}</td><td>${esc(e.texto)}</td></tr>`).join('')}</tbody></table>`;

  function vistaRevision() {
    if (!S.sel) return sinEmpresa;
    pedirLey();
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return '<p class="vacio">Cargando las facturas del libro de IVA…</p>';
    const { desde, hasta } = rangoPeriodo(Number(S.ejercicio), S.periodo);
    const todas = [...E, ...R.filter((l) => !/^S\.NC\.ISP\.A/.test(l.codigo))];
    const res = revisar(todas, ST.sent, desde, hasta);
    const con = res.filter((x) => x.a.length), cnt = {};
    con.forEach((x) => x.a.forEach((a) => { cnt[a.id] = (cnt[a.id] ?? 0) + 1; }));
    const shown = ST.regla ? con.filter((x) => x.a.some((a) => a.id === ST.regla)) : con;
    const gr = (id) => REGLAS[id][0];
    const nErr = Object.entries(cnt).filter(([id]) => gr(id) === 'error').reduce((s, [, n]) => s + n, 0);
    // exenciones y operaciones especiales aplicadas (solo emitidas)
    let exenHtml = '';
    if (ST.sent === 'E') {
      const g = new Map();
      for (const x of res) { const [, causa] = CAUSA_EXENTA.find(([re]) => re.test(String(x.l.codigo).toUpperCase())) ?? []; if (!causa) continue; const k = `${x.l.codigo}|${causa}`; const o = g.get(k) ?? { cod: x.l.codigo, causa, n: 0, base: 0 }; o.n++; o.base += +x.l.base || 0; g.set(k, o); }
      exenHtml = g.size ? `<section class="ley-tema"><h4>Exenciones y operaciones sin IVA aplicadas en el periodo</h4><table class="tabla"><thead><tr><th>Código</th><th>Fundamento en la Ley</th><th>Líneas</th><th>Base</th></tr></thead><tbody>${[...g.values()].sort((p, q) => q.base - p.base).map((o) => `<tr><td>${esc(o.cod)}</td><td>${esc(o.causa)}</td><td>${o.n}</td><td class="num">${nf.format(r2(o.base))}</td></tr>`).join('')}</tbody></table></section>` : '';
    }
    const resumen = Object.keys(cnt).length ? `<div class="ley-reglas">${Object.entries(cnt).sort((p, q) => (gr(q[0]) === 'error') - (gr(p[0]) === 'error') || q[1] - p[1]).map(([id, n]) => `<button class="ley-regla ${gr(id)}${ST.regla === id ? ' on' : ''}" data-leyregla="${id}"><b>${n}</b> ${esc(REGLAS[id][2])}<small>Art. ${REGLAS[id][1].join(', ')}</small></button>`).join('')}</div>` : '<p class="ley-ok">✔ Ninguna línea incumple las reglas revisadas en este periodo.</p>';
    const reglaTxt = ST.regla ? `<section class="ley-tema"><h4>${esc(REGLAS[ST.regla][2])}</h4>${LEY ? REGLAS[ST.regla][1].map(detalleArt).join('') : '<p class="hint">Cargue la ley para ver aquí el texto de los artículos.</p>'}</section>` : '';
    const filas = shown.slice(0, ST.pag).map(({ l, a }) => `<tr><td>${esc(((ST.sent === 'E' ? l.ff : l.fecha) || '').split('-').reverse().join('/'))}</td><td>${esc(l.factura)}</td><td>${esc(l.nif)}</td><td>${esc(l.nombre)}</td><td>${esc(l.codigo)}</td>
      <td class="num">${nf.format(l.base)}</td><td class="num">${esc(l.pct)}</td><td class="num">${nf.format(l.cuota)}</td>
      <td>${a.map((x) => `<span class="ley-tag ${REGLAS[x.id][0]}" title="Art. ${REGLAS[x.id][1].join(', ')}">${esc(REGLAS[x.id][2])}${x.det ? ` <i>(${esc(x.det)})</i>` : ''}</span>`).join('')}</td></tr>`).join('');
    return `${msg()}${LEY ? '' : sinLey()}<div class="bar"><label>Libro<select data-leysent="1"><option value="E"${ST.sent === 'E' ? ' selected' : ''}>Facturas emitidas (repercutido)</option><option value="R"${ST.sent === 'R' ? ' selected' : ''}>Facturas recibidas (soportado)</option></select></label>
      <span class="space"></span><span class="hint">${res.length} líneas revisadas · ${con.length} con avisos (${nErr} errores) · ${esc(desde.split('-').reverse().join('/'))} – ${esc(hasta.split('-').reverse().join('/'))}</span>${con.length ? '<button class="small" data-leyxls="1">Exportar a Excel</button>' : ''}</div>
      ${resumen}${reglaTxt}
      ${shown.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Factura</th><th>NIF</th><th>Nombre</th><th>Código</th><th>Base</th><th>%</th><th>Cuota</th><th>Revisar</th></tr></thead><tbody>${filas}</tbody></table></div>
      ${shown.length > ST.pag ? `<p><button class="small" data-leymas="1">Mostrar más (${shown.length - ST.pag} restantes)</button></p>` : ''}` : ''}
      ${exenHtml}
      <p class="hint">Son comprobaciones automáticas sobre los códigos de impuesto, tipos, importes y NIF del libro de IVA frente a la Ley 37/1992: marcan lo que hay que mirar, no sustituyen el criterio del asesor. Cambie el periodo y el ejercicio en el panel de la izquierda.</p>`;
  }
  function exportarRevision() {
    if (!window.XLSX || !S.sel) return;
    const { desde, hasta } = rangoPeriodo(Number(S.ejercicio), S.periodo);
    const todas = [...(grande('fact-E') ?? []), ...(grande('fact-R') ?? []).filter((l) => !/^S\.NC\.ISP\.A/.test(l.codigo))];
    const rows = [['Libro', 'Fecha', 'Factura', 'NIF', 'Nombre', 'Código', 'Base', '%', 'Cuota', 'Aviso', 'Gravedad', 'Artículos', 'Detalle']];
    for (const s of ['E', 'R']) for (const { l, a } of revisar(todas, s, desde, hasta)) for (const x of a) rows.push([s === 'E' ? 'Emitidas' : 'Recibidas', (s === 'E' ? l.ff : l.fecha) || '', l.factura, l.nif, l.nombre, l.codigo, l.base, l.pct, l.cuota, REGLAS[x.id][2], REGLAS[x.id][0], REGLAS[x.id][1].join(', '), x.det]);
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rows), 'Revisión Ley IVA');
    window.XLSX.writeFile(wb, `RevisionLeyIVA_${empresa()?.cif ?? ''}_${S.ejercicio}${S.periodo ? '_' + S.periodo : ''}.xlsx`);
  }

  // --- consulta: busca en el texto cargado y devuelve los pasajes más pertinentes ---
  const STOP = new Set('que como cual cuales cuando donde para por con sin una uno unos unas los las del les mas son esta este esto estan ser sus pero entre sobre desde hasta hay puede pueden debe deben tiene tienen cada todo toda todos todas'.split(' '));
  const stem = (w) => (w.startsWith('exen') ? 'exen' : w.slice(0, 5));
  function terminos(q) { return [...new Set(sinAc(q).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem))]; }
  function buscar(q) {
    const ts = terminos(q), out = [];
    const mArt = /art(?:[ií]culo|\.)?\s*(\d+)(?:\s*(bis|ter|quater))?/i.exec(sinAc(q));
    const cuenta = (txt) => { const toks = sinAc(txt).split(/[^a-z0-9ñ]+/); return ts.reduce((s, t) => s + Math.min(6, toks.filter((w) => w.startsWith(t)).length), 0); };
    for (const s of secs()) {
      const sc = ts.length ? cuenta(s.texto) / Math.log(12 + s.texto.length / 400) + cuenta(s.titulo) * 4 : 0;
      const dir = mArt && s.tipo === 'art' && s.id === (mArt[2] ? `${mArt[1]} ${mArt[2]}` : mArt[1]);
      if (sc > 0 || dir) out.push({ s, sc: sc + (dir ? 1000 : 0) });
    }
    out.sort((p, q) => q.sc - p.sc);
    return out.slice(0, 5).map(({ s, sc }) => {
      const pars = s.texto.split('\n').map((p) => ({ p, v: cuenta(p) })).filter((x) => x.v > 0).sort((p, q) => q.v - p.v).slice(0, 3).map((x) => x.p);
      return { s, sc, pars: pars.length ? pars : [s.texto.slice(0, 500)] };
    });
  }
  const resalta = (txt, ts) => {
    let h = esc(txt); if (!ts.length) return h;
    const cl = { a: 'aáàä', e: 'eéèë', i: 'iíìï', o: 'oóòö', u: 'uúùü', n: 'nñ' };
    const re = new RegExp(`(${ts.map((t) => t.split('').map((ch) => (cl[ch] ? `[${cl[ch]}]` : ch)).join('')).join('|')})`, 'gi');
    return h.replace(re, '<mark>$1</mark>');
  };
  function responder(q) {
    ST.q = q; const ts = terminos(q);
    const faq = FAQ.filter(([k]) => { const ks = k.split(' '); return ts.some((t) => ks.some((w) => sinAc(w).startsWith(t))); })
      .map((f) => ({ f, n: ts.filter((t) => f[0].split(' ').some((w) => sinAc(w).startsWith(t))).length })).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.f);
    ST.res = { q, ts, faq, hits: LEY ? buscar(q) : [] };
    render();
  }
  function vistaConsulta() {
    pedirLey();
    const R = ST.res;
    let out = '';
    if (R) {
      out += `<section class="ley-resp"><h4>Respuesta a: «${esc(R.q)}»</h4>`;
      if (R.faq.length) out += R.faq.map(([, t, r, ns]) => `<p><b>${esc(t)}.</b> ${esc(r)} <span class="hint">(Arts. ${ns.join(', ')} — resumen orientativo; el texto literal está debajo si la ley está cargada)</span></p>`).join('');
      if (!LEY) out += sinLey();
      else if (!R.hits.length) out += '<p class="vacio">No encuentro nada en la ley cargada con esas palabras: pruebe con otros términos o con el número del artículo («art. 84»).</p>';
      else out += `<p class="hint">Pasajes de la ley cargada más relacionados con la pregunta (extracto literal, ordenado por relevancia):</p>${R.hits.map(({ s, pars }) => `<div class="ley-hit"><h5>${s.tipo === 'art' ? `Art. ${esc(s.id)}. ` : ''}${esc(s.titulo)}</h5>${pars.map((p) => `<p>${resalta(p, R.ts)}</p>`).join('')}<button class="ley-art" data-leyart="${esc(s.id)}" data-leyq2="1"><span>Abrir el artículo completo</span><i>Abrir ›</i></button></div>`).join('')}`;
      out += '</section>';
    }
    return `${msg()}<div class="ley-preg"><input class="ley-buscar" data-leyq="1" placeholder="Pregunte: ¿qué operaciones están exentas?, ¿plazo para deducir?, art. 84…" value="${esc(ST.q)}"><button class="primary" data-leyask="1">Buscar y responder</button></div>
      <p class="hint">La consulta busca en el texto de la Ley cargada y devuelve los pasajes literales más pertinentes; no interpreta ni inventa. Las preguntas más comunes llevan además un resumen orientativo.</p>${out}
      <div class="ley-sug">${['¿Qué operaciones están exentas?', '¿Cuál es el plazo para deducir el IVA soportado?', '¿Cuándo se aplica la inversión del sujeto pasivo?', 'Requisitos de la entrega intracomunitaria exenta', 'Tipos de IVA reducido y superreducido', 'Limitaciones a la deducción de cuotas'].map((s) => `<button class="small" data-leyask="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  }

  // --- artículo a pantalla completa: se abre encima sin tocar la pantalla de debajo, y «Volver» regresa justo donde estaba ---
  function cerrarArt() { document.getElementById('leyOv')?.remove(); document.documentElement.style.overflow = ''; }
  function abrirArt(id, ts = []) {
    const L = secs(), i = L.findIndex((s) => s.id === id), s = L[i]; if (!s) return;
    const prev = L[i - 1], next = L[i + 1], nom = (x) => (x.tipo === 'art' ? `Art. ${x.id}` : x.titulo.slice(0, 28));
    document.getElementById('leyOv')?.remove();
    const ov = document.createElement('div'); ov.id = 'leyOv'; ov.className = 'ley-ov';
    ov.innerHTML = `<div class="ley-ov-barra"><button class="primary" data-leyvolver="1">‹ Volver</button><b>${s.tipo === 'art' ? `Artículo ${esc(s.id)}` : 'Disposición'}</b>
      <span class="space"></span><button data-leyart2="${prev ? esc(prev.id) : ''}"${prev ? '' : ' disabled'}>‹ ${prev ? esc(nom(prev)) : ''}</button><button data-leyart2="${next ? esc(next.id) : ''}"${next ? '' : ' disabled'}>${next ? esc(nom(next)) : ''} ›</button></div>
      <article class="ley-ov-cuerpo"><h2>${s.tipo === 'art' ? `Artículo ${esc(s.id)}. ` : ''}${esc(s.titulo)}</h2><p class="hint">${esc(LEY?.nombre ?? '')}</p>${s.texto.split('\n').map((p) => `<p>${resalta(p, ts)}</p>`).join('')}</article>`;
    document.body.appendChild(ov); document.documentElement.style.overflow = 'hidden';
    ov.querySelector('.ley-ov-cuerpo').scrollTop = 0; ov._ts = ts;
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.getElementById('leyOv')) { ev.preventDefault(); cerrarArt(); } });

  // --- eventos ---
  let tIdx;
  document.addEventListener('click', (ev) => {
    const t = ev.target; if (!t?.closest) return;
    let b;
    if (t.closest('[data-leyvolver]')) { cerrarArt(); return; }
    if ((b = t.closest('[data-leyart2]'))) { if (b.dataset.leyart2) abrirArt(b.dataset.leyart2, document.getElementById('leyOv')?._ts ?? []); return; }
    if ((b = t.closest('[data-leyart]'))) { abrirArt(b.dataset.leyart, b.dataset.leyq2 ? ST.res?.ts ?? [] : []); return; }
    if (t.closest('[data-leyquitar]')) { quitarLey(); return; }
    if ((b = t.closest('[data-leysub]'))) { ST.sub = b.dataset.leysub; render(); return; }
    if ((b = t.closest('[data-leyregla]'))) { ST.regla = ST.regla === b.dataset.leyregla ? '' : b.dataset.leyregla; ST.pag = 100; render(); return; }
    if (t.closest('[data-leymas]')) { ST.pag += 200; render(); return; }
    if (t.closest('[data-leyxls]')) { exportarRevision(); return; }
    if ((b = t.closest('[data-leyask]'))) { const v = b.dataset.leyask === '1' ? (document.querySelector('[data-leyq]')?.value ?? '') : b.dataset.leyask; if (v.trim()) responder(v.trim()); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target; if (!t?.dataset) return;
    if (t.id === 'leyFileIn') { const f = t.files[0]; t.value = ''; cargarLey(f); return; }
    if (t.dataset.leysent) { ST.sent = t.value; ST.regla = ''; ST.pag = 100; render(); return; }
    if (t.dataset.leyexart) { ST.exArt = t.value; render(); }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!t?.dataset) return;
    if (t.dataset.leyidx) { ST.idx = t.value; clearTimeout(tIdx); tIdx = setTimeout(() => { const el = document.getElementById('leyIdxLista'); if (el) el.innerHTML = indiceHtml(); }, 250); }
    else if (t.dataset.leyexq) { ST.exQ = t.value; clearTimeout(tIdx); tIdx = setTimeout(() => { const f = sinAc(ST.exQ).trim(), el = document.getElementById('leyExLista');
      if (el) el.innerHTML = exTabla((LEY?.exenciones ?? []).filter((e) => (!ST.exArt || String(e.art) === ST.exArt) && (!f || sinAc(`${e.ref} ${e.texto}`).includes(f)))); }, 250); }
    else if (t.dataset.leyq !== undefined) ST.q = t.value;
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target?.dataset?.leyq !== undefined && ev.target.value.trim()) { ev.preventDefault(); responder(ev.target.value.trim()); } });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-leyfile]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => ev.target.closest?.('[data-leyfile]')?.classList.remove('over'));
  document.addEventListener('drop', (ev) => { const z = ev.target.closest?.('[data-leyfile]'); if (!z) return; ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over'); cargarLey(ev.dataTransfer.files[0]); }, true);

  const tabs = {
    leyiva: ['Ley IVA 37/1992', 'Cargar la ley y lo más importante', vistaLey],
    leyexen: ['Exenciones', 'Arts. 20 a 26 de la Ley', vistaExenciones],
    leyrev: ['Revisión de facturas', 'Emitidas y recibidas frente a la Ley', vistaRevision],
    leyask: ['Consultar la Ley', 'Pregunte y busque en el texto', vistaConsulta],
  };
  const badges = {
    leyiva: () => (LEY ? { t: `${secs().filter((s) => s.tipo === 'art').length} artículos`, c: 'verde' } : LEY === undefined ? null : { t: 'Sin cargar', c: 'rojo' }),
    leyexen: () => (LEY?.exenciones?.length ? { t: `${LEY.exenciones.length} exenciones` } : null),
  };
  return { tabs, badges };
}
