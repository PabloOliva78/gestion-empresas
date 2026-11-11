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
  const re = /^\d+\s+([A-Z0-9]{9})\s+(.+?)\s+(ALTA|BAJA)\s+([A-ZÁÉÍÓÚ]+)\s+(\d\d-\d\d-\d{4})(?:\s+(\d\d\.\d\d))?/;
  return filas(t).map((l) => re.exec(l)).filter(Boolean)
    .map((m) => ({ nif: m[1], nombre: m[2], situacion: m[3], tipo: m[4], fecha: iso(m[5]), hora: m[6] ?? '' }));
}

// Situación tributaria con sus casillas: solo las marcadas, agrupadas por impuesto, como la consulta de la AEAT
export function leerSituacionCompleta(t) {
  const L = filas(t);
  const SEC = ['Impuesto sobre el Valor Añadido', 'Impuesto sobre Sociedades', 'Retenciones e ingresos a cuenta'];
  const cont = (i) => { // líneas de continuación del concepto (empiezan en minúscula o con «(»)
    let extra = '';
    for (let k = i + 1; L[k] && /^[a-zñáéíóú(¿]/.test(L[k]); k++) extra += ' ' + L[k];
    return extra;
  };
  const out = [];
  let sec = '', m;
  L.forEach((l, i) => {
    if (SEC.includes(l)) { sec = l; return; }
    const add = (casilla, concepto, marca, fecha) => out.push({ seccion: sec, casilla, concepto: (concepto + cont(i)).replace(/\s+/g, ' ').trim(), marca, fecha });
    if ((m = /^(\d{3})\s+X\s+(.+?)\s+\d{3}\s+(\d\d\/\d\d\/\d{4})$/.exec(l))) add(m[1], m[2], 'X', m[3]);
    else if ((m = /^(Fecha de cierre .+?)\s+(\d{3})\s+(\d\d\/\d\d)\b/.exec(l))) out.push({ seccion: sec, casilla: m[2], concepto: `${m[1]} (dd/mm)`, marca: m[3], fecha: '' });
    else if ((m = /^(.+?)\s+(\d{3})\s+X\s+\d{3}\s+(\d\d\/\d\d\/\d{4})$/.exec(l))) add(m[2], m[1], 'X', m[3]);
    else if ((m = /^(\d{3})\s+(.+?)\s+X$/.exec(l))) add(m[1], m[2], 'X', '');
    else if ((m = /^(Ingreso cuotas IVA a la importación.+?)\s+(INCLUIDO|EXCLUIDO)\s+(\d\d\/\d\d\/\d{4})$/.exec(l))) add('', m[1], m[2], m[3]);
  });
  return { estado: val(t, /Estado Sit\. Trib\.\s+(\S+)/), filas: out };
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
export async function leerXlsx(buffer, JSZip, nombreHoja) {
  const zip = await JSZip.loadAsync(buffer);
  const ss = zip.file('xl/sharedStrings.xml') ? sinPrefijo(await zip.file('xl/sharedStrings.xml').async('string')) : '';
  const comp = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  let hoja = Object.keys(zip.files).find((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (nombreHoja) { // hoja concreta por su nombre (libros con varias hojas)
    const wb = sinPrefijo(await zip.file('xl/workbook.xml').async('string'));
    const rels = sinPrefijo(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
    const tag = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => dec(/name="([^"]*)"/.exec(t)?.[1] ?? '') === nombreHoja);
    const rid = tag && /r:id="([^"]+)"/.exec(tag)?.[1];
    const rel = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
    const tg = rel && /Target="([^"]+)"/.exec(rel)?.[1];
    if (!tg) return [];
    hoja = tg.replace(/^\/?(xl\/)?/, 'xl/');
  }
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

// ---------- Libros de IVA del ERP y consultas del SII ----------
const fechaIso = (v) => {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400) * 1000).toISOString().slice(0, 10);
  const s = String(v ?? '');
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};
const numero = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  return (s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s)) || 0;
};
const r2n = (x) => Math.round(x * 100) / 100 + 0;

// «impuestos repercutidos / soportados registrados» (listado del ERP): asiento, factura, fecha, fecha factura, nif-cif, nombre, base, %, cuota, código, tipo libro
// Acepta las dos variantes de cabeceras: la del listado pegado en el Excel de trabajo y la exportación directa del ERP
//   Excel de trabajo: asiento · factura · fecha · fecha factura · nif-cif · nombre · base Imponible · % · cuota impuesto · codigo impuestos · tipo libro
//   Exportación ERP:  Asiento · Documento · Fecha · Fecha de la factura · NIF · Nombre · Origen (base) · Valor (%) · Importe de impuestos · Código de impuestos · Tipo de libro
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export function leerLibroIVA(filas) {
  const h = filas.findIndex((f) => f && Array.from(f, sinTildes).some((c) => /^(factura|documento)$/.test(c))
    && Array.from(f, sinTildes).some((c) => /^codigo (de )?impuestos?$/.test(c)));
  if (h < 0) return null;
  const cab = Array.from(filas[h], sinTildes);
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const c = { as: ix(/^asiento/), fa: ix(/^(factura|documento)$/), fe: ix(/^fecha$/), ff: ix(/^fecha (de la )?factura/), nif: ix(/^nif/), nom: ix(/^nombre/),
    ba: ix(/^(base|origen)/), pc: ix(/^(%|valor)$/), cu: ix(/^(cuota|importe de impuestos)/), co: ix(/^codigo (de )?impuestos?$/), tl: ix(/^tipo (de )?libro/), tp: ix(/^tipo (de )?pa[ií]s/) };
  const out = [], tipos = [];
  for (const f of filas.slice(h + 1)) {
    const factura = String(f?.[c.fa] ?? '').trim();
    if (!factura) continue;
    const codigo = String(f[c.co] ?? '').trim();
    tipos.push(String(f[c.tl] ?? ''));
    const fecha = fechaIso(f[c.fe]);
    out.push({ asiento: String(f[c.as] ?? ''), factura, fecha, ff: fechaIso(f[c.ff]) || fecha, nif: String(f[c.nif] ?? '').trim().toUpperCase(),
      nombre: String(f[c.nom] ?? '').trim(), base: numero(f[c.ba]), pct: numero(f[c.pc]), cuota: numero(f[c.cu]), codigo,
      ...(c.tp >= 0 && String(f[c.tp] ?? '').trim() ? { tipoPais: String(f[c.tp]).trim() } : {}),
      sentido: /^S\.UE\./.test(codigo) ? 'R' : /repercut/i.test(String(f[c.tl] ?? '')) || /^R\./.test(codigo) || /^S\.NC\.ISP\.A/.test(codigo) ? 'E' : 'R' }); // S.NC.ISP.A (ISP autorrepercutida) siempre va en el libro repercutido; las S.UE.* (adquisiciones intracomunitarias) siempre en el soportado, vengan en el archivo que vengan
  }
  // Si casi todo el archivo es del libro repercutido, TODO él es repercutido: sus líneas autorrepercutidas (S.NC.ISP.A, adquisiciones intracomunitarias…) vienen con tipo de libro «Impuestos soportados»
  // y se aceptan igualmente en este libro (no se descartan ni se pasan al soportado).
  const nRep = tipos.filter((t) => /repercut/i.test(t)).length, nSop = tipos.filter((t) => /soportad/i.test(t)).length;
  if (nRep + nSop > 0 && nRep / (nRep + nSop) >= 0.9) out.forEach((l) => { if (!/^S\.UE\./.test(l.codigo)) l.sentido = 'E'; });
  return out.length ? out : null;
}

// ---------- Extracto contable (mayor): movimientos con fecha, cuenta, asiento, descripción, debe y haber ----------
export function leerMayor(filas) {
  const nm = (s) => sinTildes(s).replace(/[º°]/g, '').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const SYN = {
    fecha: ['fecha', 'fecha contable', 'fecha contabilizacion', 'fecha de contabilizacion', 'fecha registro', 'fecha asiento', 'fecha operacion', 'fecha de registro'],
    cuenta: ['cuenta', 'cuenta contable', 'subcuenta', 'n cuenta', 'cta', 'codigo cuenta', 'numero de cuenta', 'cuenta n'],
    asiento: ['asiento', 'n asiento', 'numero de asiento', 'tipo de asiento', 'tipo asiento', 'n de asiento', 'documento'],
    desc: ['descripcion', 'concepto', 'texto', 'descripcion del asiento', 'detalle'],
    debe: ['debe', 'debito', 'importe debe', 'debe moneda', 'importe debito'],
    haber: ['haber', 'credito', 'importe haber', 'haber moneda', 'importe credito'],
    importe: ['importe', 'importe moneda'],
  };
  const mapear = (H) => {
    const map = {}, usado = new Set();
    for (const pasada of [0, 1]) for (const f of Object.keys(SYN)) {
      if (map[f] !== undefined) continue;
      for (const s of SYN[f]) {
        const i = H.findIndex((x, k) => !usado.has(k) && x && (pasada === 0 ? x === s : x.includes(s) && !(f === 'importe' && /debe|haber/.test(x))));
        if (i >= 0) { map[f] = i; usado.add(i); break; }
      }
    }
    for (const f of Object.keys(SYN)) if (map[f] === undefined) map[f] = -1;
    return map;
  };
  let h = -1, M = null;
  for (let i = 0; i < Math.min(filas.length, 60); i++) {
    if (!filas[i]) continue;
    const m = mapear(Array.from(filas[i], nm));
    if (m.fecha >= 0 && (m.debe >= 0 || m.haber >= 0 || m.importe >= 0)) { h = i; M = m; break; }
  }
  if (h < 0) return null;
  let fija = '';
  if (M.cuenta < 0) {
    for (let i = 0; i < h && !fija; i++) { const f = filas[i] || []; for (let j = 0; j < f.length && !fija; j++) if (/^(cuenta contable|cuenta|subcuenta)$/.test(nm(f[j]))) fija = String(f.slice(j + 1).find((v) => /\d{3,}/.test(String(v ?? ''))) ?? '').trim(); }
  }
  const out = [], vistos = new Map();
  for (const r of filas.slice(h + 1)) {
    if (!r) continue;
    const g = (k) => (M[k] >= 0 ? r[M[k]] : null);
    const fecha = fechaIso(g('fecha')), cuenta = String((M.cuenta >= 0 ? g('cuenta') : fija) ?? '').trim();
    let debe = g('debe') === null || g('debe') === '' ? null : numero(g('debe')), haber = g('haber') === null || g('haber') === '' ? null : numero(g('haber'));
    if (debe === null && haber === null && M.importe >= 0 && g('importe') !== null && g('importe') !== '') { const imp = numero(g('importe')); debe = imp > 0 ? imp : 0; haber = imp < 0 ? -imp : 0; }
    if (!fecha || !cuenta || ((debe ?? 0) === 0 && (haber ?? 0) === 0)) continue;
    const l = { fecha, cuenta, digitos: cuenta.replace(/\D/g, ''), debe: r2n(debe ?? 0), haber: r2n(haber ?? 0), asiento: String(g('asiento') ?? '').trim(), desc: String(g('desc') ?? '').trim() };
    const k = [l.cuenta, l.fecha, l.asiento, l.debe, l.haber, l.desc].join('|');
    l.n = (vistos.get(k) ?? 0) + 1; // movimientos idénticos dentro del mismo archivo cuentan todos; el mismo archivo cargado dos veces no duplica
    vistos.set(k, l.n);
    out.push(l);
  }
  return out.length ? out : null;
}

// ---------- FUNDAE: costes comunicados (GRUPO aaff/grupo) y grupos formativos (aaff, grupo, fechas) ----------
export function fundaeFilas(filas, anio) {
  const R = { anio, costes: {}, grupos: {} };
  for (const c of filas) {
    const L = c.map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    let m = L.match(/^GRUPO\s+(\d+)\s*\/\s*(\d+)\s+(.+?)\s+(-?[\d.]+,\d{2})$/i);
    if (m) { R.costes[`${m[1]}/${m[2]}`] = { den: m[3], coste: numero(m[4]) }; continue; }
    m = L.match(/^(\d{4,})\s+(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(\S+))?/);
    if (m) R.grupos[`${m[2]}/${m[3]}`] = { id: m[1], den: m[4], ini: m[5], fin: m[6], est: m[7] || '' };
  }
  return R;
}

// ---------- Business Central (Fertinova): un solo libro de movimientos de IVA con ventas y compras ----------
// Se reparte en repercutido (Venta, Venta Autorepercutida) y soportado (Compra, Compra Autorepercutida); el código de impuestos es la columna
// «Conversion D365» y, si el archivo no la trae, se calcula con la tabla de equivalencias.
const EQ_BC = [["NAC", "IRPF.ALQ", "Compra", "I.ALQ"], ["NAC", "IRPF.INT", "Compra", "I.INT"], ["NAC", "IRPF.PROF", "Compra", "I.PR.GN"], ["NAC", "I.PR.PA", "Compra", "I.PR.PRA"], ["NAC", "I.PR.SR", "Compra", "I.PR.SR"],
  ["NAC", "BI21", "Compra", "IN.NR"], ["NAC", "BI10", "Compra", "IN.RD"], ["EXPORT.", "EXENTO", "Venta", "R.EX"], ["NAC", "ISP21", "Venta Autorepercutida", "R.ISP.NR"], ["NAC", "ISP10", "Venta Autorepercutida", "R.ISP.RD"],
  ["NAC", "NO SUJETO", "Venta", "R.NAC.NS"], ["NAC", "EXENTO", "Venta", "R.NC.EX"], ["NAC", "IVA21", "Venta", "R.NC.NR"], ["NAC", "S21", "Venta", "R.NC.NR.SR"], ["NAC", "IVA10", "Venta", "R.NC.RD"], ["NAC", "S10", "Venta", "R.NC.RD.SR"],
  ["NAC", "IVA4", "Venta", "R.NC.SR"], ["NAC", "S4", "Venta", "R.NC.SR.SR"], ["NACIONAL RE", "IVA21", "Venta", "R.RC.NR"], ["NACIONAL RE", "IVA10", "Venta", "R.RC.RD"], ["NACIONAL RE", "IVA4", "Venta", "R.RC.SR"],
  ["UE", "IVA21", "Venta Autorepercutida", "R.UE.NR"], ["UE", "S21", "Venta Autorepercutida", "R.UE.NR.SR"], ["UE", "IVA10", "Venta Autorepercutida", "R.UE.RD"], ["UE", "S10", "Venta Autorepercutida", "R.UE.RD.SR"],
  ["UE", "IVA4", "Venta Autorepercutida", "R.UE.SR"], ["EXPORT.", "IVA21", "Compra", "S.EX.NR"], ["EXPORT.", "S21", "Compra", "S.EX.NR.SR"], ["EXPORT.", "IVA10", "Compra", "S.EX.RD"],
  ["NAC", "ISP21", "Compra Autorepercutida", "S.ISP.NR"], ["NAC", "ISP10", "Compra Autorepercutida", "S.ISP.RD"], ["NAC", "IVA21", "Compra", "S.NC.NR"], ["NAC", "S21", "Compra", "S.NC.NR.SR"], ["NAC", "IVA10", "Compra", "S.NC.RD"],
  ["NAC", "S10", "Compra", "S.NC.RD.SR"], ["NAC", "IVA5", "Compra", "S.NC.RDN"], ["NAC", "IVA4", "Compra", "S.NC.SR"], ["UE", "IVA21", "Compra Autorepercutida", "S.UE.NR"], ["UE", "S21", "Compra Autorepercutida", "S.UE.NR.SR"],
  ["UE", "IVA10", "Compra Autorepercutida", "S.UE.RD"], ["UE", "S10", "Compra Autorepercutida", "S.UE.RD.SR"], ["UE", "IVA4", "Compra Autorepercutida", "S.UE.SR"], ["NAC", "IMPORT", "Compra", "DUA"],
  ["UE", "IVA21", "Venta", "R.UE"], ["UE", "S21", "Venta", "R.UE.S"], ["NAC", "EXENTO", "Compra", "S.NC.EX"], ["NAC", "NO SUJETO", "Compra", "S.NAC.NS"]];
const EQ_BC_MAP = new Map(EQ_BC.map(([n, p, t, d]) => [[n, p, t].map((x) => x.toUpperCase().trim()).join('|'), d]));
export function leerLibroBC(filas) {
  const h = filas.findIndex((f) => { if (!f) return false; const H = Array.from(f, sinTildes); return H.includes('grupo contable iva negocio') && H.includes('tipo') && H.includes('base imponible'); });
  if (h < 0) return null;
  const H = Array.from(filas[h], (x) => sinTildes(x).replace(/[º°]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim()), c = (n) => H.indexOf(n);
  const I = { neg: c('grupo contable iva negocio'), prod: c('grupo contable iva prod'), fiva: c('fecha de iva'), freg: c('fecha registro'), doc: c('n documento'), tipo: c('tipo'), base: c('base imponible'),
    piva: c('% iva'), cuota: c('cuota impuesto'), calc: c('tipo calculo iva'), nif: c('cif nif'), fac: c('factura'), nom: c('nombre'), conv: c('conversion d365'), fdoc: c('fecha documento'),
    bs: c('base imponible signo'), cs: c('cuota impuesto signo'), auto: c('% autorepercutido') };
  const vacio = (v) => v === null || v === undefined || v === '';
  const out = [];
  for (const r of filas.slice(h + 1)) {
    if (!r) continue;
    const tipo = String(r[I.tipo] ?? '').trim();
    if (!tipo) continue;
    const venta = /^venta/i.test(tipo), sg = venta ? -1 : 1;
    const bRaw = numero(r[I.base]), qRaw = numero(r[I.cuota]);
    let pAuto = I.auto >= 0 ? numero(r[I.auto]) : 0;
    if (I.auto < 0 && /cargo revertido/i.test(String(r[I.calc] ?? '')) && venta && !qRaw) { const m = String(r[I.prod] ?? '').match(/(\d+)\s*$/); if (m) pAuto = +m[1] / 100; }
    const base = I.bs >= 0 && !vacio(r[I.bs]) ? numero(r[I.bs]) : r2n(sg * bRaw);
    const cuota = I.cs >= 0 && !vacio(r[I.cs]) ? numero(r[I.cs]) : r2n(sg * (pAuto > 0 ? bRaw * pAuto : qRaw));
    let codigo = I.conv >= 0 ? String(r[I.conv] ?? '').trim() : (EQ_BC_MAP.get([r[I.neg], r[I.prod], tipo].map((x) => String(x ?? '').toUpperCase().trim()).join('|')) || '');
    if (/^sin datos$/i.test(codigo) || !codigo) codigo = 'SIN.DATOS';
    let pct = numero(r[I.piva]);
    if (/^I\./i.test(codigo) && pct > 0) pct = -pct; // retenciones: en D365 el tipo va en negativo
    const fecha = fechaIso(r[I.fiva]) || fechaIso(r[I.freg]);
    const factura = String((I.fac >= 0 && r[I.fac]) || r[I.doc] || '').trim();
    if (!factura) continue;
    out.push({ asiento: '', factura, fecha, ff: fechaIso(r[I.fdoc]) || fecha, nif: String(r[I.nif] ?? '').trim().toUpperCase(), nombre: String(r[I.nom] ?? '').trim(),
      base, pct, cuota, codigo, sentido: venta ? 'E' : 'R' });
  }
  return out.length ? out : null;
}

// ---------- Coherencia código de impuesto (contabilidad) ↔ forma de declarar la factura en el SII ----------
// categoría que se espera en el SII para cada código del ERP
export function catEsperadaSii(sentido, cod) {
  const c = String(cod || '').toUpperCase(), tp = c.match(/\.(NR|RD|SR|RDN)(\.SR)?$/), iva = tp ? { NR: 21, RD: 10, SR: 4, RDN: 5 }[tp[1]] : null;
  if (sentido === 'E') {
    if (c === 'R.EX' || c.startsWith('R.EX.')) return { k: 'EX-E2', txt: 'exenta por exportación (causa E2)' };
    if (c === 'R.UE') return { k: 'EX-E5', txt: 'entrega intracomunitaria exenta (causa E5)' };
    if (c === 'R.UE.S') return { k: 'NSL', txt: 'servicio no sujeto por reglas de localización' };
    if (/^R\.ISP\./.test(c)) return { k: 'S2', txt: 'sujeta con inversión del sujeto pasivo (S2)' };
    if (/^R\.(NC|RC)\.EX/.test(c)) return { k: 'EX-*', txt: 'exenta (con causa E1…E6)' };
    if (/^R\.NAC\.NS/.test(c)) return { k: 'NS', txt: 'no sujeta (art. 7, 14 y otros)' };
    if (/^R\.(NC|RC)\./.test(c) && iva) return { k: `S1-${iva}`, txt: `sujeta no exenta al ${iva} % (S1)` };
    return null;
  }
  if (/^S\.UE\./.test(c)) return { k: `AIC-${iva || '?'}`, txt: `adquisición intracomunitaria (clave de régimen 09)${iva ? ` al ${iva} %` : ''}` };
  if (/^S\.ISP\./.test(c)) return { k: 'ISP', txt: 'con inversión del sujeto pasivo (ISP)' };
  if (/^IN\./.test(c) && iva) return { k: `NOISP-${iva}-BI`, txt: `sin ISP al ${iva} % · bien de inversión SÍ` };
  if (/^S\.NC\./.test(c) && iva) return { k: `NOISP-${iva}`, txt: `sin inversión del sujeto pasivo al ${iva} %` };
  return null;
}
export const txtCatSii = (k) => (/^AIC-/.test(k) ? `adquisición intracomunitaria (clave 09) al ${k.slice(4)} %` : /-BI$/.test(k) ? `${txtCatSii(k.slice(0, -3))} · bien de inversión SÍ` : k === 'NSL' ? 'no sujeta por localización'
  : k === 'NS' ? 'no sujeta' : k === 'S2' ? 'inversión sujeto pasivo (S2)' : k === 'ISP' ? 'ISP' : /^S1-/.test(k) ? `S1 al ${k.slice(3)} %` : /^NOISP-/.test(k) ? `no ISP al ${k.slice(6)} %` : /^EX-/.test(k) ? `exenta ${k.slice(3)}` : k);
export const normFac = (f) => String(f || '').toUpperCase().replace(/\s+/g, '');
// sin el prefijo de país (se quitan los que haya apilados: GBCZ684027135 = CZ684027135 = 684027135) y sin ceros a la izquierda; DMCC192962 no lleva prefijo (DM no es de los países de la lista)
const PREF_PAIS = new Set(['AE', 'AT', 'BE', 'BG', 'CH', 'CN', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MA', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'TR', 'US', 'XI']);
export const normNif = (n) => { let x = String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); while (x.length > 6 && PREF_PAIS.has(x.slice(0, 2))) x = x.slice(2); return x.replace(/^0+(?=\d)/, ''); };
// recibidas: una factura con una línea S.NAC.NS del mismo importe que otra línea con IVA (reflejo en el libro) cuenta una sola vez; el SII la declara una vez
export function espejosNS(lineas) {
  const g = new Map(), out = new Set();
  lineas.forEach((l) => { const k = `${normFac(l.factura)}|${normNif(l.nif)}`; (g.get(k) ?? g.set(k, []).get(k)).push(l); });
  g.forEach((ls) => {
    const con = ls.filter((l) => l.codigo !== 'S.NAC.NS' && Math.abs(+l.cuota || 0) > 0.005);
    ls.filter((l) => l.codigo === 'S.NAC.NS').forEach((n) => { if (con.some((c) => Math.abs((+c.base || 0) - (+n.base || 0)) < 0.01)) out.add(n); });
  });
  return out;
}
// cómo está declarada una fila del SII: {categoría: base}
function catsFilaSii(emit, H, r) {
  const o = {}, add = (k, v) => { if (Math.abs(v) > 0.005) o[k] = r2n((o[k] || 0) + v); };
  const esAIC = () => H.some((x, k) => /^Clave de R[eé]gimen Especial/i.test(x) && String(r[k] || '').trim().replace(/^0?/, '0') === '09');
  const aic = emit ? false : esAIC();
  const esBI = (g, j) => { const rx = new RegExp(`^\\(\\s*${g}\\s*\\)\\s*Bien\\s*(de\\s*)?Inversi[oó]n\\s*${j || ''}\\s*$`, 'i'); let k = H.findIndex((x) => rx.test(x)); if (k < 0) k = H.findIndex((x) => /^bien(es)?\s*(de\s*)?inversi/i.test(x)); return k >= 0 && /^S/i.test(String(r[k] || '').trim()) ? '-BI' : ''; };
  H.forEach((h, i) => {
    let m;
    if (emit) {
      if ((m = h.match(/^\((Servicio|Bienes|Factura)\) Base Imponible (\d+)$/))) {
        const g = m[1], j = m[2], it = H.findIndex((x) => new RegExp(`^\\(${g}\\) Tipo Impositivo(\\(%\\))? ${j}$`).test(x)), tn = H.findIndex((x) => x === `(${g}) Tipo No Exenta`);
        const tipoNE = String(tn >= 0 ? r[tn] || '' : '').trim().toUpperCase();
        add(tipoNE === 'S2' ? 'S2' : `S1-${it >= 0 ? numero(r[it]) : '?'}`, numero(r[i]));
      } else if ((m = h.match(/^\((Servicio|Bienes|Factura)\) Base Imponible Sujeta \/ Exenta (\d+)$/))) {
        const ic = H.findIndex((x) => x === `(${m[1]}) Causa Exenta ${m[2]}`), cau = String(ic >= 0 ? r[ic] || '' : '').trim().toUpperCase();
        add(cau ? `EX-${cau}` : 'EX-sin causa', numero(r[i]));
      } else if (/Importe no sujeto por reglas de localizaci/i.test(h)) add('NSL', numero(r[i]));
      else if (/Importe no sujeto/i.test(h)) add('NS', numero(r[i]));
    } else if ((m = h.match(/^\(\s*ISP\s*\)\s*Base Imponible\s*(\d*)\s*$/i))) add(`ISP${esBI('ISP', m[1])}`, numero(r[i]));
    else if ((m = h.match(/^\(\s*NO\s*ISP\s*\)\s*Base Imponible\s*(\d*)\s*$/i))) {
      const j = m[1], it = H.findIndex((x) => new RegExp(`^\\(\\s*NO\\s*ISP\\s*\\)\\s*Tipo Impositivo\\s*(\\(%\\))?\\s*${j}\\s*$`, 'i').test(x));
      add(aic ? `AIC-${it >= 0 ? numero(r[it]) : '?'}` : `NOISP-${it >= 0 ? numero(r[it]) : '?'}${esBI('NO\\s*ISP', j)}`, numero(r[i]));
    }
  });
  return o;
}

// Consulta de facturas del SII (Sede AEAT). Total base/cuota = suma de los desgloses, igual que las columnas «TOTAL … DECLARADA (SII)» del Excel
export function leerSII(filas) {
  // la fila de cabecera tiene a la vez «Nº Serie + Nº Factura», «Ejercicio» y «Periodo» (el cuadro de filtros de arriba solo trae el primero)
  const h = filas.findIndex((f) => f && f.some((c) => /^N[ºo°] Serie\s+\+\s+N[ºo°] Factura$/i.test(String(c ?? '').trim()))
    && f.some((c) => /^Ejercicio$/i.test(String(c ?? '').trim())) && f.some((c) => /^Periodo$/i.test(String(c ?? '').trim())));
  if (h < 0) return null;
  const cab = Array.from(filas[h], (c) => String(c ?? '').trim());
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const emitidas = cab.some((c) => /^NIF Destinatario/i.test(c));
  const bases = [], cuotas = [];
  cab.forEach((c, i) => {
    if (emitidas) {
      if (/^\((Factura|Servicio|Bienes)\) (Base Imponible \d+|Base Imponible Sujeta \/ Exenta|Importe no sujeto por reglas de localización)/.test(c)) bases.push(i);
      else if (/^\((Factura|Servicio|Bienes)\) Cuota Repercutida \d+/.test(c)) cuotas.push(i);
    } else if (/^\((NO ISP|ISP)\) Base Imponible ?\d+/.test(c)) bases.push(i);
    else if (/^\((NO ISP|ISP)\) Cuota Soportada ?\d+/.test(c)) cuotas.push(i);
  });
  const c = { fa: ix(/^N[ºo°] Serie/i), ej: ix(/^Ejercicio$/i), pe: ix(/^Periodo$/i), fe: ix(/^Fecha Expedici[oó]n$/i),
    nif: ix(emitidas ? /^NIF Destinatario/i : /^NIF Emisor/i), nom: ix(emitidas ? /^Nombre o Raz[oó]n Social Destinatario/i : /^Nombre o Raz[oó]n Social Factura Emisor/i),
    tipo: ix(/^Tipo de factura/i), est: ix(/^Estado( del registro)?$/i), ded: ix(/^Cuota Deducible$/i),
    nif2: ix(emitidas ? /^Identificador Destinatario/i : /^Identificador Emisor/i) }; // identificación de los no residentes (sin NIF español)
  const filaRaw = (f) => { const o = {}; f.forEach((v, i) => { const s = typeof v === 'number' ? v : String(v ?? '').trim(); if (s !== '') o[i] = s; }); return o; }; // solo las celdas con dato (todas las columnas de la descarga)
  const suma = (f, cols) => cols.reduce((a, i) => a + numero(f[i]), 0); // número (xlsx) o texto con coma decimal (csv de la sede)
  const out = [];
  for (const f of filas.slice(h + 1)) {
    const factura = String(f?.[c.fa] ?? '').trim();
    if (!factura) continue;
    out.push({ factura, ej: Number(f[c.ej]) || null, per: String(f[c.pe] ?? '').trim(), fecha: fechaIso(f[c.fe]), nif: String(f[c.nif] ?? '').trim().toUpperCase() || String(c.nif2 >= 0 ? f[c.nif2] ?? '' : '').trim().toUpperCase(),
      nombre: String(f[c.nom] ?? '').trim(), tipo: String(f[c.tipo] ?? '').trim(), estado: String(f[c.est] ?? '').trim(),
      base: r2n(suma(f, bases)), cuota: r2n(suma(f, cuotas)), deducible: c.ded >= 0 ? r2n(numero(f[c.ded])) : 0, sentido: emitidas ? 'E' : 'R', cats: catsFilaSii(emitidas, cab, f), raw: filaRaw(f) });
  }
  if (out.length) out.cab = cab;
  return out.length ? out : null;
}

// Periodo → fechas. '' = ejercicio completo, 1T..4T = trimestre, 01..12 = mes
export function rangoPeriodo(ej, periodo) {
  const ult = (m) => new Date(Date.UTC(ej, m, 0)).getUTCDate();
  const p2 = (n) => String(n).padStart(2, '0');
  let m1 = 1, m2 = 12;
  if (/^[1-4]T$/.test(periodo)) { m1 = (+periodo[0] - 1) * 3 + 1; m2 = m1 + 2; } else if (/^\d\d$/.test(periodo)) { m1 = m2 = +periodo; }
  return { desde: `${ej}-${p2(m1)}-01`, hasta: `${ej}-${p2(m2)}-${p2(ult(m2))}` };
}

// Reglas copiadas del Excel «INFORMACION CONCILIACION IMPUESTOS» (hojas ConcSII-E y ConsSII-R)
export const EXC_EMITIDAS = ['R.ISP.NR', 'R.ISP.RD', 'S.NC.ISP.A', 'R.UE.NR', 'R.UE.RD', 'R.UE.NR.SR', 'R.UE.RD.SR', 'R.RC.NR', 'R.RC.RD', 'R.RC.SR']; // líneas fuera del SII
export const FACT_FUERA_E = ['R.NAC.NS', 'R.I.INT', 'R.I.ALQ'];  // si una línea es de estos códigos, la factura entera queda fuera
export const EXC_RECIBIDAS = ['I.PR.GN', 'I.PR.PRA', 'I.PR.SR', 'I.ALQ', 'I.INT', 'I.DV', 'I.DV.E']; // códigos «no IVA»

// Conciliación SII vs contabilidad completa (la de la otra aplicación): cruce por factura (+ NIF en recibidas), margen ±0,10 €,
// descuadre por código de impuesto, facturas que se anulan entre sí y facturas declaradas en el SII de forma distinta a su código
export const MARGEN_SII = 0.10 + 1e-9;
export function conciliarSiiCompleta(sentido, libro, sii, ej, periodo) {
  const r = rangoPeriodo(ej, periodo), emit = sentido === 'E';
  const clave = (fac, nif) => (emit ? normFac(fac) : `${normFac(fac)}|${normNif(nif)}`);
  // las retenciones (I.ALQ, R.I.ALQ, I.PR…) llevan la misma base que la factura y no son IVA: no se cuentan en emitidas (en recibidas ya están en EXC_RECIBIDAS)
  const ls = sii.filter((s) => s.sentido === sentido && (emit ? s.fecha >= r.desde && s.fecha <= r.hasta : s.ej === ej && (!periodo || s.per === periodo)));
  const claveSii = new Set(ls.map((s) => clave(s.factura, s.nif)));   // las no sujetas (R.NAC.NS) solo cuentan si la factura está declarada en el SII
  const espejo = emit ? new Set() : espejosNS(libro.filter((l) => l.sentido === sentido));
  const lc = libro.filter((l) => l.sentido === sentido && !espejo.has(l) && (emit ? l.fecha >= r.desde && l.fecha <= r.hasta && !EXC_EMITIDAS.includes(l.codigo) && !/^(R\.)?I\./.test(l.codigo) && (l.codigo !== 'R.NAC.NS' || claveSii.has(clave(l.factura, l.nif)))
    : l.fecha >= r.desde && l.fecha <= r.hasta && !EXC_RECIBIDAS.includes(l.codigo)));
  const cont = new Map();
  for (const l of lc) {
    const k = clave(l.factura, l.nif);
    const o = cont.get(k) ?? { fac: l.factura, nif: l.nif, nom: l.nombre, base: 0, cuota: 0, cods: new Set(), esp: {}, txt: {}, sinRegla: false };
    o.base = r2n(o.base + (l.codigo === 'R.NAC.NS' ? 0 : l.base)); o.cuota = r2n(o.cuota + l.cuota); // las no sujetas (art. 7-14) el SII no las lleva en base imponible sino en «Importe no sujeto»; se comparan en su categoría (esp.NS)
    o.cods.add(String(l.codigo || '').trim().toUpperCase() || '(sin código)');
    const e = catEsperadaSii(sentido, l.codigo);
    if (e) { o.esp[e.k] = r2n((o.esp[e.k] || 0) + l.base); o.txt[e.k] = e.txt; } else o.sinRegla = true;
    cont.set(k, o);
  }
  const sm = new Map();
  for (const x of ls) {
    const k = clave(x.factura, x.nif);
    const o = sm.get(k) ?? { fac: x.factura, nif: x.nif, nom: x.nombre, base: 0, cuota: 0, deduc: 0, cats: {} };
    o.base = r2n(o.base + x.base); o.cuota = r2n(o.cuota + x.cuota); o.deduc = r2n(o.deduc + (x.deducible || 0));
    for (const [c, v] of Object.entries(x.cats ?? {})) o.cats[c] = r2n((o.cats[c] || 0) + v);
    sm.set(k, o);
  }
  // por qué una factura del SII no se empareja con la contabilidad: no está en el libro, tiene la fecha fuera del periodo o su código no cuenta
  const idxLibro = new Map();
  libro.filter((l) => l.sentido === sentido).forEach((l) => { const k = clave(l.factura, l.nif); (idxLibro.get(k) ?? idxLibro.set(k, []).get(k)).push(l); });
  const fdmyL = (d) => String(d || '').split('-').reverse().join('/');
  const excluidaL = (l) => (emit ? EXC_EMITIDAS.includes(l.codigo) || /^(R\.)?I\./.test(l.codigo) : EXC_RECIBIDAS.includes(l.codigo));
  const motivoSii = (k) => {
    const ls = idxLibro.get(k); if (!ls || !ls.length) return `No está en el libro de ${emit ? 'emitidas' : 'recibidas'} cargado: revisa el nº de factura (y el NIF) o carga el libro completo`;
    const campo = 'fecha', dentro = ls.filter((l) => l[campo] >= r.desde && l[campo] <= r.hasta), cods = [...new Set(ls.map((l) => l.codigo || '(sin código)'))].join(' + ');
    if (!dentro.length) return `Está en el libro (${cods}) con fecha ${fdmyL(ls[0][campo])}, fuera del periodo: pásala al periodo del SII o concilia el periodo en que está contabilizada`;
    if (dentro.every(excluidaL)) return `Está en el libro pero con código ${cods}, que no cuenta en esta conciliación: si debe ir al SII, corrige el código en el libro`;
    return `Está en el libro (${cods}) y no se empareja: revisa el nº de factura${emit ? '' : ' y el NIF'}`;
  };
  const A = [...cont.entries()].filter(([k]) => !sm.has(k)).map(([, v]) => v);
  const B = [...sm.entries()].filter(([k]) => !cont.has(k)).map(([k, v]) => ({ ...v, motivo: motivoSii(k) }));
  const C = [...cont.entries()].filter(([k, v]) => sm.has(k) && (Math.abs(v.base - sm.get(k).base) > MARGEN_SII || Math.abs(v.cuota - sm.get(k).cuota) > MARGEN_SII))
    .map(([k, v]) => ({ fac: v.fac, nif: v.nif, nom: v.nom, bc: v.base, bs: sm.get(k).base, cc: v.cuota, cs: sm.get(k).cuota }));
  const tot = (m) => ({ n: m.size, base: r2n([...m.values()].reduce((s, v) => s + v.base, 0)), cuota: r2n([...m.values()].reduce((s, v) => s + v.cuota, 0)) });
  const tc = tot(cont), ts = tot(sm); ts.deduc = r2n([...sm.values()].reduce((s, v) => s + v.deduc, 0));
  // descuadre por código de impuesto: cada factura va al código (o combinación de códigos) con que está contabilizada
  const facDesc = [], porCod = new Map();
  const add = (cod, c, s) => {
    if (Math.abs(r2n(c.base - s.base)) > MARGEN_SII || Math.abs(r2n(c.cuota - s.cuota)) > MARGEN_SII) facDesc.push({ cod, fac: c.fac || s.fac, nif: c.nif || s.nif, nom: c.nom || s.nom, bc: c.base, bs: s.base, db: r2n(c.base - s.base), cc: c.cuota, cs: s.cuota, dc: r2n(c.cuota - s.cuota), motivo: c.motivo || '', _c: c });
    const o = porCod.get(cod) ?? { cod, n: 0, bc: 0, bs: 0, cc: 0, cs: 0 };
    o.n++; o.bc = r2n(o.bc + c.base); o.cc = r2n(o.cc + c.cuota); o.bs = r2n(o.bs + s.base); o.cs = r2n(o.cs + s.cuota); porCod.set(cod, o);
  };
  cont.forEach((v, k) => add([...v.cods].sort().join(' + '), v, sm.get(k) ?? { base: 0, cuota: 0 }));
  sm.forEach((v, k) => { if (!cont.has(k)) add('Solo en el SII (no contabilizadas)', { base: 0, cuota: 0, fac: v.fac, nif: v.nif, nom: v.nom, motivo: motivoSii(k) }, v); });
  // facturas solo en contabilidad que se anulan entre sí (mismo NIF y código; una factura y su abono): cuadran
  const G = new Map();
  facDesc.forEach((x) => { if (Math.abs(x.bs) < 0.01 && Math.abs(x.cs) < 0.01 && x._c && x._c.cods) { const g = `${String(x.nif || '').toUpperCase()}|${x.cod}`; (G.get(g) ?? G.set(g, []).get(g)).push(x); } });
  G.forEach((xs) => { if (xs.length < 2) return; if (Math.abs(r2n(xs.reduce((s, x) => s + x.db, 0))) <= MARGEN_SII && Math.abs(r2n(xs.reduce((s, x) => s + x.dc, 0))) <= MARGEN_SII) xs.forEach((x) => { x.anula = true; x._c._anul = true; }); });
  const cods = [...porCod.values()].map((o) => ({ ...o, db: r2n(o.bc - o.bs), dc: r2n(o.cc - o.cs) }))
    .sort((a, b) => (Math.abs(b.db) + Math.abs(b.dc)) - (Math.abs(a.db) + Math.abs(a.dc)) || a.cod.localeCompare(b.cod));
  // facturas cuyo código no casa con la forma de declararlas en el SII
  const malSii = [];
  cont.forEach((o, k) => {
    if (!sm.has(k) || !Object.keys(o.esp).length || o.sinRegla) return;
    const dec = sm.get(k).cats;
    const ok = Object.keys(o.esp).every((ek) => { const v = ek === 'EX-*' ? r2n(Object.keys(dec).filter((d) => /^EX-E\d/.test(d)).reduce((s, d) => s + dec[d], 0)) : (dec[ek] || 0); return Math.abs(v - o.esp[ek]) <= 0.01; });
    if (!ok) malSii.push({ fac: o.fac, nif: o.nif, nom: o.nom, cods: [...o.cods].join(' + '), esp: Object.keys(o.esp).map((ek) => `${o.txt[ek]} ${o.esp[ek].toFixed(2)}`).join(' · '),
      dec: Object.keys(dec).map((d) => `${txtCatSii(d)} ${dec[d].toFixed(2)}`).join(' · ') || '(sin importes)' });
  });
  malSii.sort((a, b) => a.cods.localeCompare(b.cods) || String(a.fac).localeCompare(String(b.fac)));
  facDesc.sort((a, b) => a.cod.localeCompare(b.cod) || (Math.abs(b.db) + Math.abs(b.dc)) - (Math.abs(a.db) + Math.abs(a.dc)));
  const cero = (x) => Math.abs(x.base || 0) < 0.01 && Math.abs(x.cuota || 0) < 0.01;
  // facturas en ambos con diferencias de céntimos, dentro del margen: no descuadran una a una, pero pueden sumar un descuadre en el total
  const cents = [...cont.entries()].filter(([k]) => sm.has(k)).map(([k, v]) => { const s = sm.get(k); return { fac: v.fac, nif: v.nif, nom: v.nom, bc: v.base, bs: s.base, db: r2n(v.base - s.base), cc: v.cuota, cs: s.cuota, dc: r2n(v.cuota - s.cuota) }; })
    .filter((x) => (Math.abs(x.db) > 0.004 || Math.abs(x.dc) > 0.004) && Math.abs(x.db) <= MARGEN_SII && Math.abs(x.dc) <= MARGEN_SII)
    .sort((a, b) => (Math.abs(b.db) + Math.abs(b.dc)) - (Math.abs(a.db) + Math.abs(a.dc)));
  // cuadra si los totales (base y cuota) coinciden y ninguna factura emparejada tiene importe distinto: las facturas a cero sin declarar no cuentan, y las pendientes de emparejar cuyos importes se anulan entre sí (suma cero) dan el cuadre por bueno
  const cuad = Math.abs(r2n(tc.base - ts.base)) <= MARGEN_SII && Math.abs(r2n(tc.cuota - ts.cuota)) <= MARGEN_SII && !C.length;
  return { desde: r.desde, hasta: r.hasta, tc, ts, A, B, C, cents, cods, facDesc, malSii, anuladas: facDesc.filter((x) => x.anula).length, ceros: A.concat(B).filter(cero).length,
    comp: cuad ? A.filter((x) => !x._anul).concat(B).filter((x) => !cero(x)).length : 0,
    cuadra: cuad };
}

export function conciliarSII(sentido, libro, sii, ej, periodo, tol = 0.005) {
  const r = rangoPeriodo(ej, periodo);
  const emit = sentido === 'E';
  const clave = (x) => (emit ? x.factura : `${x.factura}|${x.nif}`);
  // Facturas «fuera»: cuentan en el nº de facturas, pero sus importes no entran en las sumas (igual que el Excel)
  const fuera = emit ? new Set(libro.filter((l) => FACT_FUERA_E.includes(l.codigo)).map((l) => l.factura)) : new Set();
  const lc = libro.filter((l) => l.sentido === sentido && (emit
    ? l.fecha >= r.desde && l.fecha <= r.hasta && !EXC_EMITIDAS.includes(l.codigo)
    : l.fecha >= r.desde && l.fecha <= r.hasta && !EXC_RECIBIDAS.includes(l.codigo)));
  const ls = sii.filter((s) => s.sentido === sentido && (emit
    ? s.fecha >= r.desde && s.fecha <= r.hasta
    : s.ej === ej && (!periodo || s.per === periodo)));
  const agrupa = (lista) => {
    const m = new Map();
    for (const x of lista) {
      const k = clave(x), a = m.get(k) ?? { k, factura: x.factura, nif: x.nif, nombre: x.nombre, base: 0, cuota: 0, deducible: 0 };
      if (!fuera.has(x.factura)) { a.base += x.base; a.cuota += x.cuota; a.deducible += x.deducible ?? 0; }
      m.set(k, a);
    }
    return m;
  };
  const C = agrupa(lc), S = agrupa(ls);
  const tot = (m, k) => r2n([...m.values()].reduce((a, x) => a + x[k], 0));
  const resumen = { nC: C.size, nS: S.size, baseC: tot(C, 'base'), baseS: tot(S, 'base'), cuotaC: tot(C, 'cuota'), cuotaS: tot(S, 'cuota'), dedS: tot(S, 'deducible') };
  const redondea = (x) => ({ ...x, base: r2n(x.base), cuota: r2n(x.cuota) });
  const a = [...C.values()].filter((x) => !S.has(x.k)).map(redondea);
  const b = [...S.values()].filter((x) => !C.has(x.k)).map(redondea);
  const c = [...C.values()].filter((x) => S.has(x.k)).map((x) => ({ ...x, baseS: r2n(S.get(x.k).base), cuotaS: r2n(S.get(x.k).cuota) }))
    .filter((x) => Math.abs(x.base - x.baseS) > tol || Math.abs(x.cuota - x.cuotaS) > tol).map((x) => ({ ...x, base: r2n(x.base), cuota: r2n(x.cuota) }));
  const cuadra = r2n(resumen.nC - resumen.nS) === 0 && r2n(resumen.baseC - resumen.baseS) === 0 && r2n(resumen.cuotaC - resumen.cuotaS) === 0;
  return { resumen, cuadra, a, b, c, desde: r.desde, hasta: r.hasta };
}

// ---------- Modelo 303 (borrador): suma por código de impuesto del libro, como la hoja Mod303 del Excel ----------
// grupo → [libro (E repercutido / R soportado), códigos de impuesto del ERP]
export const G303 = {
  rg21: ['E', ['R.NC.NR']], rg10: ['E', ['R.NC.RD']], rg5: ['E', ['R.NC.RDN']], rg4: ['E', ['R.NC.SR']], rg2: ['E', ['R.NC.SRN']],
  intra: ['E', ['R.UE.NR', 'R.UE.RD', 'R.UE.SR', 'R.UE.NR.SR', 'R.UE.RD.SR', 'R.UE.SR.SR']],
  isp: ['E', ['S.NC.ISP.A', 'R.ISP.NR', 'R.ISP.RD']],
  re52: ['E', ['R.RC.NR']], re14: ['E', ['R.RC.RD']], re05: ['E', ['R.RC.SR']],
  ded: ['R', ['S.NC.NR', 'S.NC.RD', 'S.NC.RDN', 'S.NC.SR', 'S.NC.SRN', 'S.NC.ISP', 'S.ISP.NR', 'S.ISP.RD']],
  inv: ['R', ['IN.NR', 'IN.RD', 'IN.SR']], dua: ['R', ['DUA', 'DUARED', 'DUALCNR', 'DUALCRED']],
  dedintra: ['R', ['S.UE.NR', 'S.UE.RD', 'S.UE.SR', 'S.UE.NR.SR', 'S.UE.RD.SR', 'S.UE.SR.SR']],
  entregas: ['E', ['R.UE', 'R.UE.S']], export: ['E', ['R.EX']], nosuj: ['E', ['R.ISP']], locNS: ['E', ['R.NAC.NS']],
  exVentas: ['E', ['R.NC.EX']], exCompras: ['R', ['S.NC.EX']], exImp: ['R', ['S.EX.NR', 'S.EX.RD', 'S.EX.SR']], comprasNS: ['R', ['S.NAC.NS']],
};

// man = ajustes manuales (celdas amarillas): b14/c14, b25/c25, b35/c35, b39/c39, b41/c41, c42, c43, c44, pct65, c110, c70
export function calcular303Viejo(libroE, libroR, ej, periodo, man = {}) {
  const r = rangoPeriodo(ej, periodo);
  const m = (k) => Number(man[k]) || 0;
  const G = {};
  const detalle = [];
  for (const [g, [lib, cods]] of Object.entries(G303)) {
    const lineas = (lib === 'E' ? libroE : libroR).filter((l) => l.fecha >= r.desde && l.fecha <= r.hasta && cods.includes(l.codigo));
    G[g] = { base: lineas.reduce((a, l) => a + l.base, 0), cuota: lineas.reduce((a, l) => a + l.cuota, 0) }; // sin redondear, como Excel
    for (const c of cods) {
      const x = lineas.filter((l) => l.codigo === c);
      if (x.length) detalle.push({ grupo: g, codigo: c, libro: lib, base: r2n(x.reduce((a, l) => a + l.base, 0)), cuota: r2n(x.reduce((a, l) => a + l.cuota, 0)), n: x.length });
    }
  }
  const devengado = ['rg21', 'rg10', 'rg5', 'rg4', 'rg2', 'intra', 'isp', 're52', 're14', 're05'].reduce((a, g) => a + G[g].cuota, 0) + m('c14') + m('c25');
  const deducir = G.ded.cuota + G.inv.cuota + G.dua.cuota + G.dedintra.cuota + m('c35') + m('c39') + m('c41') + m('c42') + m('c43') + m('c44');
  const c46 = devengado - deducir;
  const pct = man.pct65 === undefined || man.pct65 === '' ? 100 : Number(man.pct65);
  const c66 = c46 * pct / 100;
  const c77 = G.dua.cuota; // IVA a la importación liquidado por la Aduana (diferido)
  const suma = r2n(c66 + c77);
  const comp = Math.abs(m('c110'));
  const aplic = suma > 0 && comp > 0 ? r2n(Math.min(suma, comp)) : 0;
  const c69 = r2n(suma - aplic);
  return { periodo: r, G, detalle, man, devengado, deducir, c46, pct, c66, c77, suma, c110: comp, c78: aplic, c87: r2n(comp - aplic), c69, c70: m('c70'), c71: r2n(c69 - m('c70')) };
}

// Modelo 303 como el borrador de la Sede: las líneas con base negativa (rectificativas) van a modificación (14-15, 25-26 y 40-41)
// man: celdas amarillas (c42, c43, c44, pct65, c78, c68, c70, y ajustes extra b14/c14, b25/c25, b35/c35, b39/c39, b41/c41) · opc: {rectif, c110}
export function calcular303(libroE0, libroR, ej, periodo, man = {}, opc = {}) {
  // S.NC.ISP.A (ISP autorrepercutida) es siempre del repercutido: si alguna línea quedó guardada en el soportado, se cuenta aquí (sin duplicar las que ya están en el repercutido)
  const kIsp = (l) => [l.asiento, l.factura, l.nif, l.ff, l.base, l.cuota].join('|'), enE = new Set(libroE0.filter((l) => /^S\.NC\.ISP\.A/.test(l.codigo)).map(kIsp));
  const libroE = libroE0.concat(libroR.filter((l) => /^S\.NC\.ISP\.A/.test(l.codigo) && !enE.has(kIsp(l))));
  const rectif = opc.rectif !== false;
  const r = rangoPeriodo(ej, periodo);
  const m = (k) => Number(man[k]) || 0;
  const DEST = { rg21: 'dev', rg10: 'dev', rg5: 'dev', rg4: 'dev', rg2: 'dev', re52: 're', re14: 're', re05: 're', ded: 'ded', inv: 'ded', dedintra: 'ded' };
  const mod = { dev: { b: 0, c: 0 }, re: { b: 0, c: 0 }, ded: { b: 0, c: 0 } };
  const sum = (a, k) => a.reduce((t, l) => t + l[k], 0);
  const G = {};
  const detalle = [];
  for (const [g, [lib, cods]] of Object.entries(G303)) {
    const todas = (lib === 'E' ? libroE : libroR).filter((l) => l.fecha >= r.desde && l.fecha <= r.hasta && cods.includes(l.codigo));
    const neg = rectif && DEST[g] ? todas.filter((l) => l.base < 0) : [];
    const pos = neg.length ? todas.filter((l) => l.base >= 0) : todas;
    G[g] = { base: sum(pos, 'base'), cuota: sum(pos, 'cuota') };
    if (neg.length) { mod[DEST[g]].b += sum(neg, 'base'); mod[DEST[g]].c += sum(neg, 'cuota'); }
    for (const c of cods) {
      const x = todas.filter((l) => l.codigo === c);
      if (x.length) detalle.push({ grupo: g, codigo: c, libro: lib, base: r2n(sum(x, 'base')), cuota: r2n(sum(x, 'cuota')), n: x.length });
    }
  }
  const b14 = mod.dev.b + m('b14'), c14 = mod.dev.c + m('c14'), b25 = mod.re.b + m('b25'), c25 = mod.re.c + m('c25');
  const b40 = mod.ded.b + m('b41'), c41 = mod.ded.c + m('c41');
  const devengado = ['rg21', 'rg10', 'rg5', 'rg4', 'rg2', 'intra', 'isp', 're52', 're14', 're05'].reduce((a, g) => a + G[g].cuota, 0) + c14 + c25;
  const deducir = G.ded.cuota + G.inv.cuota + G.dua.cuota + G.dedintra.cuota + m('c35') + m('c39') + c41 + m('c42') + m('c43') + m('c44');
  const c46 = devengado - deducir;
  const pct = man.pct65 === undefined || man.pct65 === '' ? 100 : Number(man.pct65);
  const c66 = c46 * pct / 100;
  // casilla 77: con diferimiento del IVA a la importación, las cuotas de los DUA; sin ellos, a mano (como en la antigua)
  // El IVA diferido (77) es el de los DUA de la fecha del propio DUA (fecha de la factura) dentro del periodo; la deducción (32-33) va por la fecha de registro.
  // Un DUA de diciembre contabilizado en enero se deduce en enero pero su IVA diferido es de diciembre (así lo presenta la Sede).
  const dua77 = libroR.filter((l) => G303.dua[1].includes(l.codigo) && (l.ff || l.fecha) >= r.desde && (l.ff || l.fecha) <= r.hasta);
  const hayDua = !!(G.dua.base || G.dua.cuota || dua77.length);
  const c77 = hayDua ? sum(dua77, 'cuota') : m('c77');
  // operaciones a tipos distintos de 4, 10 y 21 % (5 % y 2 %): se suman a la cuota devengada y se enseñan en filas aparte, con la casilla por verificar
  const otros = [[5, G.rg5], [2, G.rg2]].filter(([, x]) => x.base || x.cuota).map(([tipo, x]) => ({ tipo, base: x.base, cuota: x.cuota }));
  const c110 = m('c110') ? Math.abs(m('c110')) : (opc.c110 ?? 0); // pendiente de periodos previos (lo calcula la vista desde el 303 anterior)
  // casilla 78: si no se ha escrito a mano, se aplican las cuotas pendientes de periodos anteriores (110) hasta donde llegue el IVA a ingresar de este periodo; lo que sobre queda en la 87 para el siguiente
  const c78 = m('c78') ? Math.abs(m('c78')) : r2n(Math.min(c110, Math.max(0, c66 + c77)));
  const c69 = r2n(c66 + c77 - c78 + m('c68'));
  return { periodo: r, G, detalle, man, b14, c14, b25, c25, b40, c41, devengado, deducir, c46, pct, c66, c77, hayDua, otros, c110, c78, c87: r2n(c110 - c78),
    c68: m('c68'), c69, c70: m('c70'), c71: r2n(c69 - m('c70')), suma: c46 };
}

// ---------- Declaraciones presentadas (PDF de la Sede): modelo, ejercicio, periodo y casillas ----------
// pags: por página, la lista de trozos de texto {x, y, str}. Los importes van bajo (o junto a) el número de casilla:
//  a) cabecera «… 01 02 03» y debajo los importes → cada uno a la casilla más cercana en horizontal
//  b) línea con solo el número de casilla y debajo «etiqueta … importe»   c) «… 28 19.095,92» en la misma línea
const MONEY = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const ENTERO = /^\d{1,7}$/;
export function casillasPDF(pags) {
  const cas = {};
  const poner = (k, v) => { if (cas[k] === undefined) cas[k] = aNum(v); };
  for (const items of pags) {
    const filas = new Map();
    for (const it of items) { const k = Math.round(it.y / 3); if (!filas.has(k)) filas.set(k, []); filas.get(k).push(it); }
    const L = [...filas.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v.sort((a, b) => a.x - b.x));
    L.forEach((its, i) => {
      const sig = L[i + 1];
      const ss = its.map((x) => x.str.trim()).filter(Boolean);
      const cabs = its.filter((x) => /^\d{1,5}$/.test(x.str.trim()) && its.indexOf(x) > 0 && /\.{3,}|\s{2,}|[A-Za-zÁ-ú]/.test(its.slice(0, its.indexOf(x)).map((y) => y.str).join('')));
      const textoAntes = (x) => /[A-Za-zÁ-ú]/.test(its.slice(0, its.indexOf(x)).map((y) => y.str).join(''));
      // c) «casilla importe» en la misma línea
      its.forEach((x, j) => { const n = its[j + 1]; if (/^\d{1,5}$/.test(x.str.trim()) && n && MONEY.test(n.str.trim()) && textoAntes(x)) poner(x.str.trim(), n.str.trim()); });
      // a) cabecera de casillas y fila de importes debajo
      const cs = cabs.filter((x) => textoAntes(x));
      if (cs.length && sig) {
        const vals = sig.filter((x) => MONEY.test(x.str.trim()) || (cs.length > 1 && ENTERO.test(x.str.trim())));
        if (vals.length && !sig.some((x) => /[A-Za-zÁ-ú]/.test(x.str))) {
          if (vals.length === cs.length) vals.forEach((v, k) => poner(cs[k].str.trim(), v.str.trim()));
          else vals.forEach((v) => { const c = cs.reduce((m, x) => (Math.abs(x.x - v.x) < Math.abs(m.x - v.x) ? x : m)); poner(c.str.trim(), v.str.trim()); });
        }
      }
      // d) «01 3 02 338.917,83 03 64.394,36»: pares casilla–valor seguidos (resúmenes del 180, 190, 193)
      const tk = its.map((x) => x.str.trim()).join(' ').split(/\s+/).filter(Boolean);
      if (tk.length >= 4 && tk.length % 2 === 0 && tk.every((x, k) => (k % 2 === 0 ? /^\d{2,5}$/.test(x) : MONEY.test(x) || ENTERO.test(x)))
        && tk.filter((_, k) => k % 2 === 0).every((x, k, a) => !k || +x > +a[k - 1])) for (let k = 0; k < tk.length; k += 2) poner(tk[k], tk[k + 1]);
      // e) «etiqueta … 69» o «euros 71» sin importe en la línea; el importe va al final de la línea siguiente (impresiones antiguas del 303, p. ej. 2022). No se toma si esa línea trae su propia casilla antes del importe.
      const ult = its[its.length - 1]?.str.trim();
      if (ult && /^\d{2,3}$/.test(ult) && its.length >= 2 && !its.some((x) => MONEY.test(x.str.trim())) && sig && sig.length >= 2) {
        const u = sig[sig.length - 1].str.trim(), antes = sig[sig.length - 2].str.trim();
        if (MONEY.test(u) && !/^\d{1,3}$/.test(antes) && sig.some((x) => /[A-Za-zÁ-ú]/.test(x.str))) poner(ult, u);
      }
      // b) línea con solo la casilla; la siguiente trae «etiqueta … importe»
      if (ss.length === 1 && /^\d{1,3}$/.test(ss[0]) && sig && sig.some((x) => /[A-Za-zÁ-ú]/.test(x.str))) {
        const u = sig[sig.length - 1].str.trim();
        if (MONEY.test(u) || ENTERO.test(u)) poner(ss[0], u);
      }
    });
  }
  return cas;
}
// Columnas de «Impuestos Presentados» según el modelo: {columna: importe}. cas = casillasPDF(); texto = líneas del PDF (para 583 y 592, que no llevan casillas numeradas)
const MON = '(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2,3})';
export function valoresPresentado(modelo, cas, texto = '') {
  const n = {};
  for (const [k, v] of Object.entries(cas)) n[+k] = v;
  const g = (...ks) => { const x = ks.filter((k) => n[k] !== undefined); return x.length ? r2n(x.reduce((a, k) => a + n[k], 0)) : undefined; };
  const out = {};
  const pon = (c, v) => { if (v !== undefined) out[c] = v; };
  const lineas = String(texto).split('\n').map((l) => l.trim());
  const num = (s) => aNum(s);
  if (modelo === '111') { pon('base', g(2, 5)); pon('retN', g(3, 6)); pon('baseP', g(8)); pon('retP', g(9)); }
  // sin importe impreso en la casilla = declaración a cero
  else if (modelo === '115' || modelo === '180') { pon('base', g(2) ?? 0); pon('ret', g(3) ?? 0); }
  else if (modelo === '190') { pon('base', g(2) ?? 0); pon('retN', g(3) ?? 0); }
  else if (modelo === '193') { pon('base', g(2) ?? 0); pon('ret', g(3) ?? 0); }
  else if (modelo === '123') { pon('based', g(4)); pon('baser', g(5)); pon('base', g(6)); pon('retd', g(7)); pon('retr', g(8)); pon('ret', g(9)); }
  else if (modelo === '303') { pon('res', g(46)); pon('adu', g(77)); pon('comp', g(110)); pon('apl', g(78)); pon('c87', g(87) ?? (n[110] !== undefined ? r2n(n[110] - (n[78] ?? 0)) : undefined)); pon('liq', g(71)); }
  else if (modelo === '349') {
    pon('imp', g(2)); pon('rect', g(4) ?? (n[2] !== undefined ? 0 : undefined));
    // hojas interiores: cada «Operador N» trae la clave (E, A, S, I…) y la base imponible; se suman por clave (sin las hojas de rectificaciones)
    const i0 = lineas.findIndex((l) => /^Operador 1$/.test(l));
    const iR = lineas.findIndex((l, i) => i > i0 && /rectificaci[oó]n|rectificada/i.test(l) && !/^Operador/.test(l));
    const blq = []; let cur = null;
    for (const l of lineas.slice(i0 < 0 ? lineas.length : i0, iR < 0 ? lineas.length : iR)) {
      if (/^Operador \d+$/.test(l)) { cur = []; blq.push(cur); continue; }
      if (cur && !/Código país|A cumplimentar|Datos del operador|^---/.test(l)) cur.push(l);
    }
    const sum = { E: 0, A: 0, S: 0, I: 0 }; let hay = false;
    for (const b of blq) {
      const txt = b.join(' ');
      const m = [...txt.matchAll(new RegExp(MON, 'g'))].pop();
      const c = (/(?:^|\s)([EASI])\s+-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s|$)/.exec(txt) || b.map((x) => /^([EASI])$/.exec(x)).find(Boolean)
        || b.map((x) => /^[A-Z]{2}\s+([EASI])$/.exec(x)).find(Boolean) || [...txt.matchAll(/(?:^|\s)([EASI])(?=\s|$)/g)].pop() || [])[1];
      if (m && c) { sum[c] += num(m[1]); hay = true; }
    }
    if (hay) for (const c of 'EASI') pon(c, r2n(sum[c]));
  }
  else if (modelo === '232') {
    // operaciones vinculadas: «… <tipo 2 dígitos> I|P <método> <importe>» (el nombre puede ocupar otra línea)
    const re = /\s\d{2}\s+([IP])\s+\w{1,3}\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;
    let ing = 0, pag = 0, nr = 0;
    for (const l of lineas) { const m = re.exec(l); if (m) { nr++; if (m[1] === 'I') ing += num(m[2]); else pag += num(m[2]); } }
    if (nr) { pon('ing', r2n(ing)); pon('pag', r2n(pag)); pon('nreg', nr); }
  } else if (modelo === '200') { pon('cuota', g(562)); pon('res', g(621)); }
  else if (modelo === '202') { pon('res', g(34) ?? g(3) ?? 0); } // sin importe en la casilla 34 (declaración negativa / resultado cero) = 0
  else if (modelo === 'INT') {
    const fl = (/Flujo:\s*([EI])\s*-/.exec(texto) || [])[1];
    let imp = 0, kg = 0, nP = 0;
    for (const l of lineas) {
      const a = /^16\.\s*Masa Neta:\s*([\d.,]+)/.exec(l), b = /^18\.\s*\*?Importe Factura:\s*([\d.,]+)/.exec(l);
      if (a) { kg += num(a[1]); nP++; } if (b) imp += num(b[1]);
    }
    if (fl && nP) { pon(fl === 'E' ? 'exp' : 'int', r2n(imp)); pon(fl === 'E' ? 'kgE' : 'kgI', r2n(kg)); }
  } else if (modelo === '583') {
    const re = new RegExp(`^\\d+\\s+\\d+\\s+\\d+\\s+${MON}\\s+${MON}\\s+(\\d+,\\d+)\\s+${MON}\\s+${MON}\\s+${MON}$`);
    let t = null;
    for (const l of lineas) { const m = re.exec(l); if (m) { t ??= { base: 0, cuota: 0, pagos: 0, res: 0 }; t.base += num(m[2]); t.cuota += num(m[4]); t.pagos += num(m[5]); t.res += num(m[6]); } }
    if (t) Object.entries(t).forEach(([c, v]) => pon(c, r2n(v)));
  } else if (modelo === '592') {
    // fila «1 P0 Plásticos cantidad base tipo cuota deducción [compensación] [total]»: los importes en 0 pueden venir sin las últimas columnas
    let t = null;
    for (const l of lineas) {
      if (!/^\d+\s+\S+\s+\D+\s-?\d/.test(l)) continue;
      const v = [...l.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2,3}/g)].map((m) => num(m[0]));
      if (v.length < 4) continue;
      t ??= { kg: 0, base: 0, cuota: 0, ded: 0 };
      t.kg += v[0]; t.base += v[1]; t.cuota += v[3]; t.ded += v[4] ?? 0;
    }
    if (t) Object.entries(t).forEach(([c, x]) => pon(c, r2n(x)));
    const i = lineas.findIndex((l) => /Total a ingresar/i.test(l));
    const m = i >= 0 && new RegExp(`${MON}\\s*$`).exec(lineas[i]);
    if (m) pon('res', num(m[1]));
  }
  // «NEGATIVA / SIN ACTIVIDAD / RESULTADO CERO» (justificante de la Sede) sin ninguna casilla con importe: todo a 0 y la declaración cuenta como presentada
  if (!Object.keys(out).length && /NEGATIVA\s*\/\s*SIN ACTIVIDAD\s*\/\s*RESULTADO CERO|declaraci[oó]n negativa/i.test(String(texto))) {
    const CEROS = { 111: ['base', 'retN', 'baseP', 'retP'], 123: ['based', 'baser', 'base', 'retd', 'retr', 'ret'], 303: ['res', 'adu', 'comp', 'apl', 'c87', 'liq'], 349: ['imp', 'rect'],
      583: ['base', 'cuota', 'pagos', 'res'], 592: ['kg', 'base', 'cuota', 'ded', 'res'], 115: ['base', 'ret'], 180: ['base', 'ret'], 190: ['base', 'retN'], 193: ['base', 'ret'] };
    (CEROS[modelo] ?? []).forEach((c) => { out[c] = 0; });
  }
  return out;
}
export function cabeceraPresentado(texto) {
  const t = texto.replace(/\s+/g, ' ');
  if (/Consulta de Intrastat/i.test(t)) {
    const m = /Periodo:\s*(\d\d)\s+(20\d\d)/i.exec(t) || [];
    return { modelo: 'INT', ej: +m[2] || null, per: m[1] ?? '' };
  }
  const modelo = (/Modelo\s+(A22|\d{3})\b/i.exec(texto) || [])[1] ?? '';
  const ej = (modelo === '232' && parseInt((/comprendido desde\s+\d\d \d\d (20\d\d)/i.exec(t) || [])[1] ?? '', 10))
    || parseInt((/Ejercicio.{0,150}?\b(20\d\d)\b/i.exec(t) || [])[1] ?? '', 10) || null;
  const per = (/Per[ií]odo[^\dA-Z]{0,80}?\b(0[1-9]|1[0-2]|[1-4]T|[1-3]P|0A)\b/i.exec(t) || /Per[ií]odo.{0,80}?\b(0[1-9]|1[0-2]|[1-4]T|[1-3]P|0A)\b/i.exec(t) || [])[1] ?? '';
  return { modelo, ej, per };
}

// ---------- Modelo 349: operaciones intracomunitarias por clave de operación (importes sin IVA) ----------
// [clave, concepto, libro, códigos de impuesto del ERP]
export const CLAVES349 = [
  ['E', 'Entregas intracomunitarias de bienes', 'E', ['R.UE']],
  ['S', 'Prestaciones de servicios intracomunitarios', 'E', ['R.UE.S']],
  ['A', 'Adquisiciones intracomunitarias de bienes', 'R', ['S.UE.NR', 'S.UE.RD', 'S.UE.SR']],
  ['I', 'Adquisiciones de servicios intracomunitarios', 'R', ['S.UE.NR.SR', 'S.UE.RD.SR', 'S.UE.SR.SR']],
];
const PAISES_IVA = { AT: 'Austria', BE: 'Bélgica', BG: 'Bulgaria', CY: 'Chipre', CZ: 'Chequia', DE: 'Alemania', DK: 'Dinamarca', EE: 'Estonia', EL: 'Grecia', ES: 'España',
  FI: 'Finlandia', FR: 'Francia', GB: 'Reino Unido', HR: 'Croacia', HU: 'Hungría', IE: 'Irlanda', IT: 'Italia', LT: 'Lituania', LU: 'Luxemburgo', LV: 'Letonia', MT: 'Malta',
  NL: 'Países Bajos', PL: 'Polonia', PT: 'Portugal', RO: 'Rumanía', SE: 'Suecia', SI: 'Eslovenia', SK: 'Eslovaquia', XI: 'Irlanda del Norte' };
export const paisNombre = (nif) => PAISES_IVA[String(nif ?? '').slice(0, 2).toUpperCase()] ?? String(nif ?? '').slice(0, 2).toUpperCase();

export function calcular349(libroE, libroR, ej, periodo) {
  const r = rangoPeriodo(ej, periodo);
  const detalle = [];
  for (const [clave, , lib, cods] of CLAVES349) {
    for (const l of (lib === 'E' ? libroE : libroR)) {
      if (l.fecha >= r.desde && l.fecha <= r.hasta && cods.includes(l.codigo)) {
        detalle.push({ clave, nif: l.nif, nombre: l.nombre, pais: paisNombre(l.nif), factura: l.factura, fecha: l.fecha, base: l.base });
      }
    }
  }
  detalle.sort((a, b) => a.clave.localeCompare(b.clave) || a.nif.localeCompare(b.nif) || a.fecha.localeCompare(b.fecha));
  const nOp = (x) => new Set(x.map((d) => d.nif).filter(Boolean)).size;
  const porClave = CLAVES349.map(([clave, concepto]) => {
    const x = detalle.filter((d) => d.clave === clave);
    return { clave, concepto, n: nOp(x), importe: r2n(x.reduce((a, d) => a + d.base, 0)) };
  });
  const m = new Map();
  for (const d of detalle) {
    const k = `${d.nif}|${d.nombre}|${d.clave}`;
    const a = m.get(k) ?? { nif: d.nif, nombre: d.nombre, clave: d.clave, base: 0 };
    a.base += d.base;
    m.set(k, a);
  }
  const porOperador = [...m.values()].map((x) => ({ ...x, base: r2n(x.base) })).sort((a, b) => a.nif.localeCompare(b.nif) || a.clave.localeCompare(b.clave));
  return { periodo: r, detalle, porClave, porOperador, operadores: nOp(detalle), total: r2n(detalle.reduce((a, d) => a + d.base, 0)) };
}

// 349 de la antigua: operadores agrupados por país, NIF comunitario y clave; las facturas negativas van aparte como rectificaciones
export const UE_PAISES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI'];
export const esUE = (c) => UE_PAISES.includes(c);
const esNifEsp = (n) => /^[0-9]{8}[A-Z]$/.test(n) || /^[XYZKLM][0-9]{7}[A-Z]$/.test(n) || /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(n);
export function calcular349Ops(libroE, libroR, ej, periodo) {
  const r = rangoPeriodo(ej, periodo), grupos = new Map(), gruposR = new Map();
  for (const [clave, , lib, cods] of CLAVES349) {
    for (const l of (lib === 'E' ? libroE : libroR)) {
      if (!(l.fecha >= r.desde && l.fecha <= r.hasta && cods.includes(l.codigo))) continue;
      let n = String(l.nif ?? '').toUpperCase().replace(/[\s.\-/]/g, ''), pais = '?';
      if (/^[A-Z]{2}/.test(n) && !esNifEsp(n)) { const pre = n.slice(0, 2) === 'GR' ? 'EL' : n.slice(0, 2); pais = pre; n = n.slice(2); } // el prefijo del NIF dice el país
      const k = `${pais}|${n}|${clave}`, G = l.base < 0 ? gruposR : grupos;
      const gr = G.get(k) ?? { pais, nif: n, nombre: l.nombre, clave, base: 0, n: 0, avisos: new Set(), lineas: [] };
      gr.base = r2n(gr.base + l.base); gr.n++; gr.lineas.push({ ...l, side: lib === 'E' ? 'rep' : 'sop', tipoop: l.codigo });
      if (pais === '?' || !pais) gr.avisos.add('El NIF no lleva prefijo de país: no sé de qué Estado miembro es; complétalo antes de presentar');
      else if (!esUE(pais)) gr.avisos.add(`País ${pais} no es un Estado miembro: esta operación probablemente no va en el 349`);
      if (!n) gr.avisos.add('Falta el NIF-IVA');
      G.set(k, gr);
    }
  }
  // un abono se resta de las facturas del mismo operador y clave del periodo; solo queda como rectificación lo que no tiene factura en el periodo (o lo que la supera)
  for (const [k, neg] of [...gruposR]) {
    const pos = grupos.get(k); if (!pos) continue;
    const net = r2n(pos.base + neg.base);
    pos.lineas.push(...neg.lineas); pos.n += neg.n; neg.avisos.forEach((a) => pos.avisos.add(a));
    if (net >= 0) { pos.base = net; gruposR.delete(k); } else { neg.base = net; neg.lineas = pos.lineas; neg.n = pos.n; grupos.delete(k); }
  }
  const ceros = [...grupos.values()].filter((o) => Math.abs(o.base) < 0.005); // los que quedan a cero no se declaran
  ceros.forEach((o) => grupos.delete(`${o.pais}|${o.nif}|${o.clave}`));
  const orden = (a, b) => a.clave.localeCompare(b.clave) || String(a.nombre).localeCompare(String(b.nombre));
  const ops = [...grupos.values()].sort(orden), rect = [...gruposR.values()].sort(orden), avisos = [];
  if (ceros.length) avisos.push(`${ceros.length} operador(es) con el neto del periodo a cero no se declaran: ${ceros.map((o) => `${o.nombre} (${o.clave})`).join(', ')}`);
  ops.forEach((o) => { if (o.base < 0) avisos.push(`${o.nombre} (${o.clave}): el neto del periodo es negativo; las rectificaciones de periodos anteriores se declaran en el apartado de rectificaciones, no aquí`); });
  avisos.push('No se calculan rectificaciones de periodos anteriores ni las claves de ventas en consigna (M, H, R, D, C): si las tienes, añádelas en la presentación');
  return { ops, rect, nOps: ops.length, total: r2n(ops.reduce((s, o) => s + o.base, 0)), nRect: rect.length, totRect: r2n(rect.reduce((s, o) => s + o.base, 0)), avisos, periodo: r };
}

// periodo inmediatamente anterior al de la declaración (para las rectificaciones): 01 → 12 del año anterior, 1T → 4T del año anterior, 0A → 0A del año anterior
export function periodoAnterior349(ej, per) {
  const p = String(per ?? '');
  if (/^\d\d$/.test(p)) return +p > 1 ? { ej, per: String(+p - 1).padStart(2, '0') } : { ej: ej - 1, per: '12' };
  if (/^[1-4]T$/.test(p)) return +p[0] > 1 ? { ej, per: `${+p[0] - 1}T` } : { ej: ej - 1, per: '4T' };
  return { ej: ej - 1, per: '0A' };
}

// ---------- Retenciones (111 profesionales, 115, 123): libro soportado por código de impuesto, cuotas en positivo ----------
export const RET = {
  111: [['I.PR.GN', 'Actividades profesionales - tipo general'], ['I.PR.PRA', 'Profesionales - inicio de actividad'], ['I.PR.SR', 'Actividades profesionales - tipo reducido']],
  115: [['I.ALQ', 'Arrendamiento de inmuebles urbanos']],
  123: [['I.INT', 'Intereses de préstamos y cuentas'], ['I.DV', 'Dividendos'], ['I.DV.E', 'Dividendos exentos']],
};
export function calcularRet(modelo, libroR, ej, periodo) {
  const r = rangoPeriodo(ej, periodo);
  const cods = RET[modelo].map((x) => x[0]);
  const lineas = libroR.filter((l) => l.fecha >= r.desde && l.fecha <= r.hasta && cods.includes(l.codigo))
    .sort((a, b) => a.nif.localeCompare(b.nif) || a.fecha.localeCompare(b.fecha));
  const suma = (a, k) => a.reduce((t, l) => t + l[k], 0);
  const porCodigo = RET[modelo].map(([codigo, concepto]) => {
    const x = lineas.filter((l) => l.codigo === codigo);
    return { codigo, concepto, base: suma(x, 'base'), ret: -suma(x, 'cuota') };
  });
  const m = new Map();
  for (const l of lineas) {
    const a = m.get(l.nif) ?? { nif: l.nif, nombre: l.nombre, base: 0, ret: 0 };
    a.base += l.base; a.ret -= l.cuota;
    m.set(l.nif, a);
  }
  return { periodo: r, lineas, porCodigo, base: suma(lineas, 'base'), ret: -suma(lineas, 'cuota') + 0, perceptores: new Set(lineas.map((l) => l.nif).filter(Boolean)).size,
    porNif: [...m.values()] };
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
