// CBAM: lectores de ficheros. Sin dependencias del navegador (se prueban con Node).
//  · leerQReport(texto)  → el informe CBAM trimestral (PDF «qreport-…») que presentó la empresa: operadores, instalaciones, emisiones y mercancías.
//  · leerPlantilla(XLSX, buffer) → la «CBAM communication template for installations» que manda el productor (hoja Summary_Communication).
const num = (s) => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const arreglaTexto = (s) => String(s ?? '').replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã±/g, 'ñ');

export function leerQReport(texto) {
  let t = arreglaTexto(texto).replace(/[|\s]+/g, ' ').trim();
  const CAB = /CBAM Mecanismo de Ajuste en Frontera por Carbono CBAM QReport Identificación del informe (\S+) Declarante del informe (.+?) Importador (.+?) ANC (\S+) Periodo de notificación (\S+) Fecha de emisión (\S+) Estado (\S+)/;
  const c = CAB.exec(t);
  if (!c) return null;
  const informe = { id: c[1], declarante: c[2], importador: c[3], anc: c[4], periodo: c[5], emision: c[6], estado: c[7] };
  t = t.replace(new RegExp(CAB.source, 'g'), ' ').replace(/\s+/g, ' ');
  // declarante y firma (primera página)
  const decl = {};
  const dm = /Código postal: (.+?) Datos del importador/.exec(t);
  if (dm) {
    const m = /^(.+?) (ES[A-Z0-9]{8,11}) (\d\d) - \d\d ([A-Z]{2}) - \S+ (\S+) (\S+) (.+) (\d{5})$/.exec(dm[1]);
    if (m) Object.assign(decl, { nombre: m[1], nif: m[2], funcion: m[3], pais: m[4], provincia: m[5], poblacion: m[6], calle: m[7], cp: m[8], anc: informe.anc });
  }
  const fm = /Cargo del firmante: (\d{4}-\d\d-\d\d) (\S+) (.+) (\S+) Certifico/.exec(t);
  if (fm) Object.assign(decl, { firmaFecha: fm[1], firmaLugar: fm[2], firmaNombre: fm[3], firmaCargo: fm[4] });

  const bloques = t.split(/(?=Mercancías \d{1,3}\. \d{8} [A-Z]{2} )/).filter((b) => /^Mercancías \d{1,3}\. \d{8} [A-Z]{2} /.test(b));
  const mercancias = [];
  for (const b of bloques) {
    const g = (re) => { const m = re.exec(b); return m ? m.slice(1) : []; };
    const [n, nc, origen] = g(/^Mercancías (\d{1,3})\. (\d{8}) ([A-Z]{2})/);
    const [sh6, shNom] = g(/Código de la subpartida en el sistema armonizado (\d{6}) - (.+?) Código de la nomenclatura combinada/);
    const [desc] = g(/Descripción de las mercancías (.+?) País de origen/);
    const [proc] = g(/Procedimiento solicitado (\d+) - /);
    const [masa] = g(/Medida de las mercancías \(importadas\) Masa neta ([\d.,]+)/);
    const ia = b.indexOf('Id. del operador'), ib = b.indexOf('Identificador de la instalación'), ic = b.indexOf('Medida de las mercancías (producidas)');
    const secOp = ia >= 0 ? b.slice(ia, ib > ia ? ib : undefined) : '', secIn = ib >= 0 ? b.slice(ib, ic > ib ? ic : undefined) : '';
    const s = (sec, re) => { const m = re.exec(sec); return m ? m[1].trim() : ''; };
    const op = {
      id: s(secOp, /Id\. del operador (\S+)/), nombre: s(secOp, /Nombre del operador (.+?) Dirección/), pais: s(secOp, /Código del país ([A-Z]{2})/),
      ciudad: s(secOp, /Población (.+?) (?:Calle|Provincia|Número|Línea|Código postal|Apartado)/), calle: s(secOp, /Calle (.+?) (?:Número|Línea|Código postal|Apartado|Provincia|Persona)/),
      cp: s(secOp, /Código postal (\S+)/), contacto: s(secOp, /Persona de contacto Nombre (.+?) Correo electrónico/), email: s(secOp, /Correo electrónico (\S+)/), tel: s(secOp, /Número de teléfono (\S+)/),
    };
    const inst = {
      id: s(secIn, /Identificador de la instalación (\S+)/), nombre: s(secIn, /Nombre de la instalación (.+?) Dirección/), pais: s(secIn, /País de establecimiento ([A-Z]{2})/),
      ciudad: s(secIn, /Población (.+?) (?:Calle|Código postal|Provincia|Número|Línea)/), cp: s(secIn, /Código postal (\S+)/), lat: s(secIn, /Latitud \(N-S\) (\S+)/), lon: s(secIn, /Longitud \(E-O\) (\S+)/),
      tipoCoord: s(secIn, /Tipo de coordenadas (\d\d)/), paisProd: s(secIn, /País de producción Código del país ([A-Z]{2})/),
    };
    const em = {
      directa: num(g(/Emisiones implícitas \(directas\) específicas ([\d.]+) tCO2/)[0]), indirecta: num(g(/Emisiones implícitas \(indirectas\) específicas ([\d.]+) tCO2/)[0]),
      mwh: num(g(/Electricidad consumida ([\d.]+) MWh/)[0]), factor: num(g(/Factor de emisión ([\d.]+) t ?CO2/)[0]), fuenteFactor: g(/Fuente del factor de emisión (\d\d)/)[0] ?? '',
      fuenteElec: g(/Fuente de electricidad (\w+) - /)[0] ?? '', tipoDet: g(/Emisiones directas implícitas Tipo de determinación (\d\d)/)[0] ?? '', normas: g(/Tipo de normas de notificación aplicables (\w+) - /)[0] ?? '',
      metodo: g(/Método de producción \d+\. (P\d+), /)[0] ?? '', metodoNom: g(/Método de producción \d+\. P\d+, (.+?) Método/)[0] ?? '',
    };
    mercancias.push({ n: +n, nc, origen, sh6, shNom, desc, proc, masaT: num(masa), op, inst, em, produccion: num(s(secIn, /Cantidad (\S+)/)) });
  }
  // maestros: operadores, instalaciones (cada una de su operador) y emisiones por instalación y producto
  const oper = [], inst = [], emi = [];
  for (const m of mercancias) {
    if (m.op.id && !oper.some((o) => o.id === m.op.id)) oper.push({ ...m.op });
    const ik = `${m.op.id}|${m.inst.id}`;
    if (m.inst.id && !inst.some((i) => i.k === ik)) inst.push({ k: ik, opId: m.op.id, ...m.inst });
    const k = `${ik}|${m.nc}|${m.em.metodo}|${m.em.directa}|${m.em.indirecta}`;
    if (m.inst.id && !emi.some((e) => e.k === k)) emi.push({ k, instK: ik, nc: m.nc, producto: m.desc, ...m.em, periodo: informe.periodo, origenDato: `QReport ${informe.periodo}` });
  }
  return { informe, decl, mercancias, oper, inst, emi };
}

// Plantilla del productor: hoja «Summary_Communication» (una fila por producto)
const fechaUS = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s ?? '').trim()); if (!m) return String(s ?? ''); const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; };
export function leerPlantilla(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets.Summary_Communication;
  if (!ws) return null;
  const R = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const col = (r, L) => { let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return String(r?.[n - 1] ?? '').trim(); };
  const out = { inst: { nombre: '', pais: '', unlocode: '', ini: '', fin: '' }, emi: [] };
  let cab = -1;
  R.forEach((r, i) => {
    const d = col(r, 'D');
    if (/^Name of the installation/i.test(d)) out.inst.nombre = col(r, 'G');
    else if (/^Country/i.test(d)) out.inst.pais = col(r, 'G');
    else if (/^UNLOCODE/i.test(d)) out.inst.unlocode = col(r, 'G');
    else if (/^Reporting period start/i.test(d)) out.inst.ini = fechaUS(col(r, 'G'));
    else if (/^Reporting period end/i.test(d)) out.inst.fin = fechaUS(col(r, 'G'));
    else if (/^Street/i.test(d)) out.inst.calle = col(r, 'G');
    else if (/latitude/i.test(d)) out.inst.lat = col(r, 'G');
    else if (/longitude/i.test(d)) out.inst.lon = col(r, 'G');
    if (cab < 0 && /^CN Codes$/i.test(col(r, 'F'))) cab = i;
  });
  if (cab < 0) return null;
  for (let i = cab + 1; i < R.length; i++) {
    const nc = col(R[i], 'F').replace(/\D/g, '');
    if (nc.length < 8) continue;
    const dir = num(col(R[i], 'I')), ind = num(col(R[i], 'J')), mwh = num(col(R[i], 'O'));
    out.emi.push({ nc: nc.slice(0, 8), producto: col(R[i], 'H') || col(R[i], 'D'), proceso: col(R[i], 'D'), directa: dir, indirecta: ind, total: num(col(R[i], 'K')), mwh, factor: mwh ? Math.round((ind / mwh) * 1000) / 1000 : null, fuenteFactor: col(R[i], 'N'), porDefecto: col(R[i], 'M'), periodo: `${out.inst.ini} / ${out.inst.fin}`, origenDato: 'Plantilla del productor' });
  }
  return out;
}
