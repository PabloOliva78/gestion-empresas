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
    ba: ix(/^(base|origen)/), pc: ix(/^(%|valor)$/), cu: ix(/^(cuota|importe de impuestos)/), co: ix(/^codigo (de )?impuestos?$/), tl: ix(/^tipo (de )?libro/) };
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
export function calcular303(libroE, libroR, ej, periodo, man = {}, opc = {}) {
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
  const c77 = G.dua.cuota; // IVA a la importación liquidado por la Aduana (diferido)
  const c110 = m('c110') ? Math.abs(m('c110')) : (opc.c110 ?? 0); // pendiente de periodos previos (lo calcula la vista desde el 303 anterior)
  const c78 = Math.abs(m('c78'));
  const c69 = r2n(c66 + c77 - c78 + m('c68'));
  return { periodo: r, G, detalle, man, b14, c14, b25, c25, b40, c41, devengado, deducir, c46, pct, c66, c77, c110, c78, c87: r2n(c110 - c78),
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
  else if (modelo === '202') { pon('res', g(34) ?? g(3)); }
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
