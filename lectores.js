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
export function leerLibroIVA(filas) {
  const h = filas.findIndex((f) => f && f.some((c) => /^factura$/i.test(String(c ?? '').trim())) && f.some((c) => /codigo impuestos/i.test(String(c ?? ''))));
  if (h < 0) return null;
  const cab = Array.from(filas[h], (c) => String(c ?? '').trim().toLowerCase());
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const c = { as: ix(/^asiento/), fa: ix(/^factura$/), fe: ix(/^fecha$/), ff: ix(/fecha factura/), nif: ix(/^nif/), nom: ix(/^nombre/),
    ba: ix(/^base/), pc: ix(/^%/), cu: ix(/^cuota/), co: ix(/codigo impuestos/), tl: ix(/tipo libro/) };
  const out = [];
  for (const f of filas.slice(h + 1)) {
    const factura = String(f?.[c.fa] ?? '').trim();
    if (!factura) continue;
    const codigo = String(f[c.co] ?? '').trim();
    const fecha = fechaIso(f[c.fe]);
    out.push({ asiento: String(f[c.as] ?? ''), factura, fecha, ff: fechaIso(f[c.ff]) || fecha, nif: String(f[c.nif] ?? '').trim().toUpperCase(),
      nombre: String(f[c.nom] ?? '').trim(), base: numero(f[c.ba]), pct: numero(f[c.pc]), cuota: numero(f[c.cu]), codigo,
      sentido: /repercut/i.test(String(f[c.tl] ?? '')) || /^R\./.test(codigo) ? 'E' : 'R' });
  }
  return out.length ? out : null;
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
    tipo: ix(/^Tipo de factura/i), est: ix(/^Estado( del registro)?$/i), ded: ix(/^Cuota Deducible$/i) };
  const suma = (f, cols) => cols.reduce((a, i) => a + (typeof f[i] === 'number' ? f[i] : 0), 0);
  const out = [];
  for (const f of filas.slice(h + 1)) {
    const factura = String(f?.[c.fa] ?? '').trim();
    if (!factura) continue;
    out.push({ factura, ej: Number(f[c.ej]) || null, per: String(f[c.pe] ?? '').trim(), fecha: fechaIso(f[c.fe]), nif: String(f[c.nif] ?? '').trim().toUpperCase(),
      nombre: String(f[c.nom] ?? '').trim(), tipo: String(f[c.tipo] ?? '').trim(), estado: String(f[c.est] ?? '').trim(),
      base: r2n(suma(f, bases)), cuota: r2n(suma(f, cuotas)), deducible: c.ded >= 0 ? r2n(numero(f[c.ded])) : 0, sentido: emitidas ? 'E' : 'R' });
  }
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

export function conciliarSII(sentido, libro, sii, ej, periodo, tol = 0.005) {
  const r = rangoPeriodo(ej, periodo);
  const emit = sentido === 'E';
  const clave = (x) => (emit ? x.factura : `${x.factura}|${x.nif}`);
  // Facturas «fuera»: cuentan en el nº de facturas, pero sus importes no entran en las sumas (igual que el Excel)
  const fuera = emit ? new Set(libro.filter((l) => FACT_FUERA_E.includes(l.codigo)).map((l) => l.factura)) : new Set();
  const lc = libro.filter((l) => l.sentido === sentido && (emit
    ? l.ff >= r.desde && l.ff <= r.hasta && !EXC_EMITIDAS.includes(l.codigo)
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
  entregas: ['E', ['R.UE', 'R.UE.S']], export: ['E', ['R.EX']], nosuj: ['E', ['R.ISP', 'R.NAC.NS']],
  exVentas: ['E', ['R.NC.EX']], exCompras: ['R', ['S.NC.EX']], exImp: ['R', ['S.EX.NR', 'S.EX.RD', 'S.EX.SR']], comprasNS: ['R', ['S.NAC.NS']],
};

// man = ajustes manuales (celdas amarillas): b14/c14, b25/c25, b35/c35, b39/c39, b41/c41, c42, c43, c44, pct65, c110, c70
export function calcular303(libroE, libroR, ej, periodo, man = {}) {
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
