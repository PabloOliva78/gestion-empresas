// Lectores de PDF: reciben el texto ya extraído y devuelven datos estructurados.
// Funciones puras (sin DOM), se prueban igual en el navegador y en Node.

const MODELOS_RET = { 700: '110/111', 701: '110/111', 702: '115', 703: '117', 704: '124', 705: '126', 706: '128', 707: '123' };

// Agrupa los trozos de texto de una página en líneas (items: {x, y, str}).
export function lineasPagina(items) {
  const filas = new Map();
  for (const it of items) {
    const k = Math.round(it.y / 3);
    if (!filas.has(k)) filas.set(k, []);
    filas.get(k).push(it);
  }
  return [...filas.entries()].sort((a, b) => b[0] - a[0])
    .map(([, v]) => v.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const aNum = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
const NUMS = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
const iso = (s) => { const m = /(\d{2})[/-](\d{2})[/-](\d{4})/.exec(s ?? ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const val = (t, re) => (re.exec(t) || [])[1]?.trim() ?? '';
const filas = (t) => t.split('\n').filter((l) => l && !l.startsWith('--- página'));
const tras = (L, desde, cab) => { // línea siguiente a la primera que cumple `cab`
  const i = L.findIndex((l, n) => n >= desde && cab.test(l));
  return i < 0 ? '' : (L[i + 1] ?? '');
};

export function nifDe(t) {
  return (/\b([ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])\b/.exec(t) || [])[1] ?? '';
}

export function clasificar(t) {
  if (/Consulta de Datos Identificativos y Censales/.test(t)) return 'censo';
  if (/Censo de Actividades y Locales/.test(t)) return 'actividades';
  if (/^Obligaciones tributarias/m.test(t)) return 'obligaciones';
  if (/Situación tributaria/i.test(t) && /Impuesto sobre el Valor Añadido/.test(t)) return 'situacion';
  if (/Consulta de Mis Representantes/.test(t)) return 'representantes';
  if (/Consulta de Mis Representados/.test(t)) return 'representados';
  if (/Consulta de Participes/.test(t)) return 'participes';
  if (/RECIBO DE|JUSTIFICANTE DE PAGO/.test(t)) return 'local';
  return null;
}

const PROVINCIAS = ['A CORUÑA', 'ALBACETE', 'ALICANTE', 'ALMERÍA', 'ARABA', 'ÁLAVA', 'ASTURIAS', 'ÁVILA', 'BADAJOZ', 'BALEARES', 'ILLES BALEARS', 'BARCELONA',
  'BIZKAIA', 'VIZCAYA', 'BURGOS', 'CÁCERES', 'CÁDIZ', 'CANTABRIA', 'CASTELLÓN', 'CEUTA', 'CIUDAD REAL', 'CÓRDOBA', 'CUENCA', 'GIPUZKOA', 'GUIPÚZCOA',
  'GIRONA', 'GRANADA', 'GUADALAJARA', 'HUELVA', 'HUESCA', 'JAÉN', 'LA RIOJA', 'LAS PALMAS', 'LEÓN', 'LLEIDA', 'LUGO', 'MADRID', 'MÁLAGA', 'MELILLA', 'MURCIA',
  'NAVARRA', 'OURENSE', 'PALENCIA', 'PONTEVEDRA', 'SALAMANCA', 'SANTA CRUZ DE TENERIFE', 'SEGOVIA', 'SEVILLA', 'SORIA', 'TARRAGONA', 'TERUEL', 'TOLEDO',
  'VALENCIA', 'VALLADOLID', 'ZAMORA', 'ZARAGOZA'];

function domicilio(L, desde, hasta) {
  const B = L.slice(desde, hasta);
  const via = tras(B, 0, /^Tipo Vía Nombre Vía/);
  const cab = /^(Referencia|Código|Tipo|Calificación|Domicilio)/;
  const compl0 = tras(B, 0, /^Complemento domicilio/);
  const compl = cab.test(compl0) ? '' : compl0;
  const cpl = tras(B, 0, /^Código Postal Municipio Provincia/); // "18220 18003 - ALBOLOTE GRANADA"
  const rcl = tras(B, 0, /^Referencia Catastral/);
  const rc = (/^(\w{14,20})\s/.exec(rcl) || [])[1] ?? '';
  const vm = /^(\S+)\s+(.+)\s+(\S+)\s+(\S+)$/.exec(via) || [];
  const cm = /^(\d{5})\s+(.+)$/.exec(cpl) || [];
  let resto = cm[2] ?? '', prov = '';
  const p = PROVINCIAS.find((x) => resto.toUpperCase().endsWith(' ' + x));
  if (p) { prov = p; resto = resto.slice(0, resto.length - p.length).trim(); }
  const mun = resto.replace(/^\d+\s*-\s*/, '');
  const dir = `${[vm[1], vm[2], vm[4]].filter(Boolean).join(' ')}, ${cm[1] ?? ''} ${mun} (${prov})`;
  const via2 = via.replace(/\s0$/, '');
  return { texto: [via2, compl, cm[1] ? `${cm[1]} ${mun} (${prov})` : cpl].filter(Boolean).join(', '), rc,
    d: { direccion: dir, tipoVia: vm[1] ?? '', nombreVia: vm[2] ?? '', tipoNumero: vm[3] ?? '', numero: vm[4] ?? '', complemento: compl,
      refCatastral: rc, indicadorRc: rcl.replace(/^\w{14,20}\s*/, ''), cp: cm[1] ?? '', municipio: resto, provincia: prov } };
}

export function leerCenso(t) {
  const L = filas(t);
  const iFis = L.findIndex((l) => l === 'Domicilio Fiscal');
  const iSoc = L.findIndex((l) => l === 'Domicilio Social');
  const sii = (/^(\S+)\s+(\d\d\/\d\d\/\d{4})/.exec(tras(L, 0, /^Situación Fecha de Situación/)) || []);
  const st = /^(\S+)\s+(\d\d\/\d\d\/\d{4})\s+(\S+)\s+(\d\d\/\d\d\/\d{4})(?:\s+(\d\d\/\d\d\/\d{4}))?/.exec(tras(L, 0, /^Situación Fecha de Situación/)) || [];
  const fis = iFis >= 0 ? domicilio(L, iFis, iSoc > iFis ? iSoc : L.length) : { texto: '', rc: '', d: {} };
  const soc = iSoc >= 0 ? domicilio(L, iSoc, L.length) : { texto: '', d: {} };
  return {
    anagrama: val(t, /Anagrama comercial[ \t]*(.*)$/m), forma_juridica: '', suscrito: val(t, /Suscrito voluntariamente a\s+(\S+)/),
    sii_tabla: { situacion: st[1] ?? '', fecha: st[2] ?? '', obligacion: st[3] ?? '', alta: st[4] ?? '', baja: st[5] ?? '' },
    fiscal: fis.d, social: soc.d,
    nif: val(t, /^NIF\s+(\S+)/m), razon: val(t, /Razón Social\s+(.+)$/m),
    delegacion: val(t, /Administración de su domicilio fiscal\s+(.+)$/m),
    constitucion: iso(val(t, /Fecha de Constitución\s+(.+)$/m)),
    notificaciones: val(t, /Obligado a notificaciones\s+(.+)$/m),
    sii: sii[1] ? `${sii[1]} desde ${sii[2]}` : '',
    domicilio_fiscal: fis.texto, ref_catastral: fis.rc, domicilio_social: soc.texto,
  };
}

export function leerActividades(t) {
  const L = filas(t), out = [];
  const ini = /^(Empresarial|Profesional|Artística)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+(Alta|Baja)\s+(\d\d-\d\d-\d{4})/;
  const corte = /^(Empresarial|Profesional|Artística|¿Dudas|Clic|Información|\d+ de \d+|Relación|Censo|Identificación|Datos|Titular)/;
  for (let i = 0; i < L.length; i++) {
    const m = ini.exec(L[i]);
    if (!m) continue;
    let den = m[3];
    if (L[i + 1] && !corte.test(L[i + 1]) && !/\d{2}-\d{2}-\d{4}/.test(L[i + 1])) den += ' ' + L[i + 1];
    out.push({ seccion: m[1], epigrafe: m[2], denominacion: den, estado: m[4], desde: iso(m[5]) });
  }
  return out;
}

export function leerObligaciones(t) {
  const out = [];
  const re = /^(.+?)\s+(MENSUAL|TRIMESTRAL|ANUAL)\s+((?:\d\d\/\d\d\/\d{4}\s+){1,3})(ALTA|BAJA)$/;
  for (const l of filas(t)) {
    const m = re.exec(l);
    if (!m) continue;
    const f = m[3].trim().split(/\s+/).map(iso); // 1: alta · 2: alta y última modificación · 3: alta, baja y modificación
    out.push({ descripcion: m[1], periodicidad: m[2], alta: f[0], baja: f.length === 3 ? f[1] : '', modif: f.length > 1 ? f[f.length - 1] : '', estado: m[4] });
  }
  return out;
}

export function leerSituacion(t) {
  const ret = [...new Set([...t.matchAll(/\b(70[0-7])\s+X\b/g)].map((m) => MODELOS_RET[m[1]]))];
  const ded = val(t, /586[^\n%]*?(\d{1,3},\d{2})\s*%/);
  return {
    regimen_iva: /\b510\s+X\s+General/.test(t) ? 'General' : '',
    deduccion: ded ? `${ded} %` : '', cierre: val(t, /\b640\s+(\d\d\/\d\d)/),
    pagos_frac: /\b621\s+X\b/.test(t) ? 'Sí (art. 40.3 LIS)' : '', retenciones: ret.join(', '),
  };
}

export function leerRepresentantes(t) {
  const re = /^\d+\s+([A-Z0-9]{9})\s+(.+?)\s+(ALTA|BAJA)\s+([A-ZÁÉÍÓÚ]+)\s+(\d\d-\d\d-\d{4})/;
  return filas(t).map((l) => re.exec(l)).filter(Boolean)
    .map((m) => ({ nif: m[1], nombre: m[2], situacion: m[3], tipo: m[4], fecha: iso(m[5]) }));
}

export function leerParticipes(t) {
  const re = /^\d+\s+([A-Z0-9]{9})\s+(.+?)\s+(Alta|Baja)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\S+)/;
  return filas(t).map((l) => re.exec(l)).filter(Boolean)
    .map((m) => ({ nif: m[1], nombre: m[2], estado: m[3], pct: aNum(m[4]), atrib: aNum(m[5]), tipo: m[6] }));
}

// ---------- Excel (.xlsx): lector mínimo, vale con hojas de nombre raro y prefijo x: (exports de Dynamics 365) ----------
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colNum = (ref) => ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const sinPrefijo = (s) => s.replace(/<(\/?)x:/g, '<$1');

// buffer: ArrayBuffer del archivo · JSZip: la librería (en el navegador window.JSZip) · devuelve filas (arrays de celdas)
export async function leerXlsx(buffer, JSZip) {
  const zip = await JSZip.loadAsync(buffer);
  const ss = zip.file('xl/sharedStrings.xml') ? sinPrefijo(await zip.file('xl/sharedStrings.xml').async('string')) : '';
  const comp = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const hoja = Object.keys(zip.files).find((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!hoja) return [];
  const xml = sinPrefijo(await zip.file(hoja).async('string'));
  const filas = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = [];
    let seq = 0;
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const col = ref ? colNum(ref) : seq;
      seq = col + 1;
      const t = /\bt="(\w+)"/.exec(c[1])?.[1];
      const v = c[2] ? (/<v>([\s\S]*?)<\/v>/.exec(c[2]) || [])[1] : undefined;
      const inl = c[2] ? (/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2]) || [])[1] : undefined;
      let val = v ?? inl ?? '';
      if (t === 's') val = comp[+val] ?? '';
      else if (t === 'str' || t === 'inlineStr') val = dec(String(val));
      else if (val !== '' && !isNaN(+val)) val = +val;
      celdas[col] = val;
    }
    if (celdas.length) filas.push(celdas);
  }
  return filas;
}

// Balance de sumas y saldos (Dynamics 365: MainAccount, Nombre, Saldo de apertura, Débito, Crédito, Ajustes, Transacciones de cierre, Saldo de cierre)
export function leerSYS(filas) {
  const h = filas.findIndex((f) => (f ?? []).some((c) => /^(MainAccount|cuenta)$/i.test(String(c))) && f.some((c) => /saldo de apertura/i.test(String(c))));
  if (h < 0) return null;
  const cab = Array.from(filas[h], (c) => String(c ?? '').toLowerCase());
  const col = (re) => cab.findIndex((c) => re.test(c));
  const ix = { cta: col(/mainaccount|^cuenta/), nom: col(/nombre/), ape: col(/saldo de apertura/), deb: col(/d[eé]bito/), cre: col(/cr[eé]dito/),
    aju: col(/ajustes/), cie: col(/saldo de cierre/) };
  const n = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')) || 0);
  const r2 = (x) => Math.round(x * 100) / 100;
  const cuentas = filas.slice(h + 1).filter((f) => f && /^\d{3,}$/.test(String(f[ix.cta] ?? ''))).map((f) => {
    const apertura = n(f[ix.ape]), debe = n(f[ix.deb]), haber = n(f[ix.cre]), ajustes = ix.aju >= 0 ? n(f[ix.aju]) : 0;
    return { cuenta: String(f[ix.cta]), nombre: String(f[ix.nom] ?? ''), apertura, debe, haber, ajustes,
      cierre: ix.cie >= 0 ? n(f[ix.cie]) : 0, previo: r2(apertura + debe - haber + ajustes) }; // previo = saldo antes de las transacciones de cierre
  });
  return cuentas.length ? cuentas : null;
}

// Cuentas que se conciliarán: [clave, prefijos de cuenta, concepto, cómo se mide]
//  saldo = saldo previo · acreedor = saldo previo cambiado de signo · debe / haber = movimiento del año · neto = debe − haber
export const PLAN_SYS = [
  ['4700', ['470000'], 'HP deudora por IVA', 'saldo'], ['4750', ['4750'], 'HP acreedora por IVA', 'acreedor'],
  ['472', ['472'], 'HP IVA soportado', 'debe'], ['477', ['477'], 'HP IVA repercutido', 'haber'],
  ['4751', ['4751'], 'HP acreedora por retenciones practicadas', 'acreedor'], ['4752', ['4752'], 'HP acreedora por Impuesto sobre Sociedades', 'acreedor'],
  ['473', ['473'], 'HP retenciones y pagos a cuenta', 'debe'], ['474', ['474'], 'Activos / pasivos por impuesto diferido', 'saldo'],
  ['476', ['476'], 'Organismos de la Seguridad Social acreedores', 'acreedor'], ['465', ['465'], 'Remuneraciones pendientes de pago', 'acreedor'],
  ['640', ['640'], 'Sueldos y salarios', 'neto'], ['642', ['642'], 'Seguridad Social a cargo de la empresa', 'neto'],
];
export function resumenSYS(cuentas) {
  const r2 = (x) => Math.round(x * 100) / 100 + 0; // el + 0 evita el «-0»
  return PLAN_SYS.map(([clave, pref, concepto, modo]) => {
    const cs = cuentas.filter((c) => pref.some((p) => c.cuenta.startsWith(p)));
    const suma = (k) => cs.reduce((a, c) => a + c[k], 0);
    const valor = { saldo: suma('previo'), acreedor: -suma('previo'), debe: suma('debe'), haber: suma('haber'), neto: suma('debe') - suma('haber') }[modo];
    return { clave, concepto, modo, n: cs.length, valor: r2(valor) };
  }).filter((r) => r.n);
}

const IMPUESTOS = [[/IBI/, 'IBI'], [/ACTIVIDADES|IAE/, 'IAE'], [/IVTM|VEH[IÍ]CULOS/, 'IVTM'], [/VADO/, 'Vados'], [/BASURA|RESIDUOS/, 'Basura']];
const impuestoDe = (s) => (IMPUESTOS.find(([re]) => re.test(s)) || [0, 'Otros'])[1];

// Recibos pendientes ("RECIBO DE ...") y justificantes de pago de tributosgranada.es
export function leerLocal(t) {
  const L = filas(t);
  const id = (/\b\d{8,}[A-Z]{2}\d{2}[A-Z]\d{6}\b/.exec(t) || [])[0] ?? '';
  const periodo = val(t, /PERIODO:\s*(\S+)/) || val(t, /\b(\d{4}-(?:ANUAL|\d*))\s*-\s*ID:/);
  const ejercicio = parseInt((/(20\d\d)/.exec(periodo) || [])[1] ?? '', 10) || null;
  if (/JUSTIFICANTE DE PAGO/.test(t)) {
    const iq = L.findIndex((l) => /^Que consta como PAGADA/.test(l));
    const sueltas = iq > 0 && /^[A-ZÁÉÍÓÚÑ ]{2,60}$/.test(L[iq - 1]) ? L[iq - 1] : '';
    const imp = impuestoDe(val(t, /relativa a\s+([A-ZÁÉÍÓÚ ]{2,60})$/m) || sueltas || '');
    const ln = L.find((l) => /-\s*(?:19|20)\d\d-\w+\s*-\s*ID:/.test(l)) ?? '';
    const objL = tras(L, 0, /^Objeto Tributario Fecha de cobro/);
    const cobro = (/(\d\d\/\d\d\/\d{4})\s*$/.exec(objL) || [])[1] ?? '';
    const totL = tras(L, 0, /^Principal Recargo Intereses Costas Bajas Total Cobrado/);
    const nums = totL.match(NUMS) ?? [];
    return { clase: 'pagado', ref: id, impuesto: imp, municipio: (/^([^-]+?)\s*-/.exec(ln) || [])[1]?.trim() ?? '',
      periodo: (/-\s*((?:19|20)\d\d-\w+)\s*-/.exec(ln) || [])[1] ?? periodo, ejercicio,
      objeto: objL.replace(/\s*\d\d\/\d\d\/\d{4}\s*$/, '').trim(), importe: nums.length ? aNum(nums[nums.length - 1]) : null,
      fecha_pago: iso(cobro), vencimiento: '' };
  }
  const cab = val(t, /^RECIBO DE\s+(.+)$/m);
  const mun = (/^AYTO\.? DE\s+(.+)$/m.exec(t) || [])[1]?.trim() ?? '';
  const nums = (tras(L, 0, /^Principal pendiente Recargo pendiente/).match(NUMS) ?? []);
  return { clase: 'pendiente', ref: id, impuesto: impuestoDe(cab), municipio: mun, periodo, ejercicio,
    objeto: tras(L, 0, /^Objeto Tributario$/), importe: nums.length ? aNum(nums[nums.length - 1]) : null,
    fecha_pago: '', vencimiento: iso(val(t, /Caducidad de documento\s*:\s*(\S+)/)) };
}
