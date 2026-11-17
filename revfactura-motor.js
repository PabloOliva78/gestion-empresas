// Revisión de una factura (bloque 10): saca los datos del texto del PDF y los contrasta con la Ley 37/1992 del IVA, el Reglamento de facturación (RD 1619/2012)
// y las reglas de registro del SII. Todo es orientativo y por reglas (no hay IA): sin dependencias del navegador, se prueba en Node. No guarda nada.
const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
const PAISES = { EG: /egypt|egipto/i, CN: /\bchina\b/i, MA: /morocco|marruecos/i, TR: /turkey|t[uü]rkiye|turqu[ií]a/i, RU: /russia|rusia/i, GE: /georgia/i, IN: /\bindia\b/i, US: /united states|\busa\b|estados unidos/i, AE: /emirates|dubai|\buae\b/i, GB: /united kingdom|\buk\b|reino unido|london|londres/i, CH: /switzerland|suiza|geneva|ginebra|zug/i, TM: /turkmenistan|turkmenist[aá]n/i, KR: /korea/i, BR: /brazil|brasil/i, SA: /saudi/i };
const INCOTERMS = /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/;
const num = (s) => {
  let v = String(s ?? '').replace(/[^\d.,\-]/g, ''); if (!v) return null;
  const neg = v.startsWith('-') || /-$/.test(v); v = v.replace(/-/g, '');
  const c = v.lastIndexOf(','), p = v.lastIndexOf('.');
  if (c >= 0 && p >= 0) v = c > p ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  else if (c >= 0) v = /,\d{1,2}$/.test(v) ? v.replace(',', '.') : v.replace(/,/g, '');
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  const n = parseFloat(v); return Number.isFinite(n) ? (neg ? -n : n) : null;
};
const nf2 = (v) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (x) => Math.round((x + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;

// ---- NIF español: forma y dígito de control ----
export function validaNif(id) {
  const s = String(id ?? '').toUpperCase().replace(/^ES[\s\-]?/, '').replace(/[\s\-.]/g, '');
  const L = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (/^\d{8}[A-Z]$/.test(s)) return { tipo: 'DNI', ok: L[+s.slice(0, 8) % 23] === s[8], nif: s };
  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) return { tipo: 'NIE', ok: L[+(({ X: '0', Y: '1', Z: '2' })[s[0]] + s.slice(1, 8)) % 23] === s[8], nif: s };
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) {
    const d = s.slice(1, 8).split('').map(Number); let a = 0, b = 0;
    d.forEach((x, i) => { if (i % 2 === 0) { const y = x * 2; b += Math.floor(y / 10) + (y % 10); } else a += x; });
    const k = (10 - ((a + b) % 10)) % 10, letra = 'JABCDEFGHI'[k], c = s[8];
    const soloLetra = /[KPQRSNW]/.test(s[0]), soloDigito = /[ABEH]/.test(s[0]);
    const ok = soloLetra ? c === letra : soloDigito ? c === String(k) : c === String(k) || c === letra;
    return { tipo: 'CIF', ok, nif: s };
  }
  return null;
}

function ids(t) {
  const out = [], vistos = new Set();
  const add = (id, pos, pais, cuerpo) => { const k = pais + id; if (vistos.has(k)) return; vistos.add(k); out.push({ id, pos, pais, es: pais === 'ES' }); };
  for (const m of t.matchAll(/(?<![A-Z0-9])(?:ES[\s\-]?)?([ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])(?![A-Z0-9])/g)) { const v = validaNif(m[1]); if (v) add(m[1], m.index, 'ES'); }
  // errores típicos del OCR: la letra inicial del CIF leída como cifra (B→5/8, S→5, G→6, D→0); solo se acepta si el dígito de control cuadra
  const LET = { 5: 'BS', 8: 'B', 6: 'GB', 0: 'DO', 1: 'IJ', 3: 'J' };
  for (const m of t.matchAll(/(?<![A-Z0-9.,])(\d)(\d{7}[0-9A-J])(?![A-Z0-9])/g)) {
    const c = (LET[m[1]] || '').split('').map((L) => L + m[2]).filter((x) => 'ABCDEFGHJNPQRSUVW'.includes(x[0]) && validaNif(x)?.ok);
    if (c.length >= 1) add(c[0], m.index, 'ES');
  }
  for (const m of t.matchAll(/(?<![A-Z0-9])([A-Z]{2})[\s\-]?(\d[0-9A-Z]{7,11})(?![A-Z0-9])/g)) { if (EU.includes(m[1]) && /\d{6}/.test(m[2])) add(m[1] + m[2], m.index, m[1] === 'EL' ? 'GR' : m[1]); }
  return out.sort((a, b) => a.pos - b.pos);
}
const primero = (t, re) => { const m = re.exec(t); return m ? m : null; };

export function analizarFactura(texto, ctx = {}) {
  const T = String(texto ?? '').replace(/\r/g, ''), t1 = T.replace(/[ \t]+/g, ' '), hoy = ctx.hoy ?? new Date();
  const F = {}, H = [], add = (nivel, t, art = '') => H.push({ nivel, t, art });
  if (t1.replace(/\s/g, '').length < 40) return { ok: false, error: 'No he podido leer texto en el PDF (¿escaneo de mala calidad?).' };

  // ---- datos ----
  const m = {
    num: [...t1.matchAll(/(?:factura|invoice|fra\.?|n[úu]m(?:ero)?\.?|n[ºo°?]\.?|inv\.?)\s*(?:n[úu]m(?:ero)?\.?|n[ºo°?]\.?|no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\.#]*(?: [A-Z0-9\/\-\.#]*\d[A-Z0-9\/\-\.#]*)?)/gi)].find((x) => /\d/.test(x[1]) && x[1].trim().length >= 3 && !/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(x[1].trim())) ?? null,
    fecha: primero(t1, /(?:fecha(?:\s+de\s+(?:expedici[oó]n|emisi[oó]n|factura))?|date|invoice\s+date)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/i) ?? primero(t1, /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}-\d{2}-\d{2})/),
    base: primero(t1, /(?:base\s+imponible|taxable\s+(?:base|amount)|total\s+base|importe\s+neto|net\s+(?:amount|total)|subtotal|sub-total)\s*(?:\(?[A-Z€$]{0,3}\)?)?\s*[:\-]?\s*(-?[\d.,]*\d)/i),
    tipo: primero(t1, /(?:IVA|I\.V\.A\.?|VAT|IGIC|TAX)\s*(?:al|at|rate)?\s*[:\-(]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i) ?? primero(t1, /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:de\s+)?(?:IVA|I\.V\.A\.?|VAT)/i),
    cuota: primero(t1, /(?:IVA|I\.V\.A\.?|VAT|TAX)\s*\(?\d{1,2}(?:[.,]\d{1,2})?\s*%\)?\s*[:\-]?\s*(-?[\d.,]*\d)/i) ?? primero(t1, /(?:cuota\s+(?:de\s+)?(?:IVA|I\.V\.A\.?)|(?:IVA|VAT)\s*(?:amount|importe)|total\s+(?:IVA|VAT)|importe\s+(?:del\s+)?IVA)\s*(?:\(?[A-Z€$]{0,3}\)?)?\s*[:\-]?\s*(-?[\d.,]*\d)/i),
    total: [...t1.matchAll(/(?:total\s+factura|total\s+a\s+pagar|importe\s+total|total\s+(?:invoice|amount|due|eur|usd)?|amount\s+due|invoice\s+total|total)\s*(?:\(?[A-Z€$]{0,3}\)?)?\s*[:\-]?\s*(-?[\d.,]*\d)/gi)].map((x) => num(x[1])).filter((x) => x !== null).pop(),
    ret: primero(t1, /(?:retenci[oó]n|IRPF)[^\d%]{0,25}(\d{1,2}(?:[.,]\d+)?)\s*%/i),
  };
  F.numero = m.num && /\d/.test(m.num[1]) && m.num[1].length >= 3 ? m.num[1].trim() : ''; F.fechaTxt = m.fecha ? m.fecha[1] : '';
  const MES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const fTxt = (() => { // «February 29th, 2024» o «29 de febrero de 2024»
    const a = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(t1), b = /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})\b/i.exec(t1);
    if (m.fecha) return null; const x = a ? [a[3], MES[a[1].toLowerCase()], a[2]] : b ? [b[3], MES[b[2].toLowerCase()], b[1]] : null;
    return x ? `${x[2]}/${x[1]}/${x[0]}` : null;
  })();
  if (fTxt) m.fecha = [fTxt, fTxt];
  const f = m.fecha ? (() => { const s = m.fecha[1]; let d, mo, y; const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (a) { y = +a[1]; mo = +a[2]; d = +a[3]; } else { const b = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s); if (!b) return null; d = +b[1]; mo = +b[2]; y = +b[3] < 100 ? 2000 + +b[3] : +b[3]; } const dt = new Date(y, mo - 1, d); return dt.getMonth() === mo - 1 ? dt : null; })() : null;
  F.fecha = f ? `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}` : '';
  F.base = m.base ? num(m.base[1]) : null; F.tipo = m.tipo ? num(m.tipo[1]) : null; F.cuota = m.cuota ? num(m.cuota[1]) : null; F.total = m.total ?? null; F.retTipo = m.ret ? num(m.ret[1]) : null;
  if (!F.numero) { const nh = /(?<![A-Z0-9])([A-Z0-9]{0,4}#\d{3,})/i.exec(t1); if (nh) F.numero = nh[1].toUpperCase(); }
  // «Desglose de impuestos: 93,51 € al 21,00 % sobre 445,30 €» → cuota, tipo y base gravada (puede ser solo una parte de la base)
  const dg = /(-?\d[\d.,]*\d)\s*(?:€|eur)?\s+al\s+(\d{1,2}(?:[.,]\d+)?)\s*%\s+sobre\s+(-?\d[\d.,]*\d)/i.exec(t1);
  if (dg) { F.cuota = num(dg[1]); F.tipo = num(dg[2]); F.baseGravada = num(dg[3]); }
  // tabla «Base imponible | Impuestos | Total» con las cifras en la fila siguiente
  const tb = /base\s+imponible\s+(?:impuestos?|iva|cuota)\s+total[^\d-]{0,30}(-?\d[\d.,]*\d)\s*(?:€|eur)?\s+(-?\d[\d.,]*\d)\s*(?:€|eur)?\s+(-?\d[\d.,]*\d)/i.exec(t1);
  if (tb) { F.base = num(tb[1]); F.cuota = num(tb[2]); F.total = num(tb[3]); }
  F.moneda = /\bUSD\b|\$|US\s?dollar/i.test(t1) ? 'USD' : /\bGBP\b|£/.test(t1) ? 'GBP' : /\bEUR\b|€|euro/i.test(t1) ? 'EUR' : '';
  F.incoterm = (INCOTERMS.exec(t1) ?? [])[1] ?? '';
  const palabra = (re) => re.test(t1);
  F.rectificativa = palabra(/rectificativa|factura\s+de\s+abono|nota\s+de\s+abono|credit\s+note|nota\s+de\s+cr[eé]dito/i);
  F.simplificada = palabra(/factura\s+simplificada|ticket|tique\b|simplified\s+invoice/i);
  F.exenta = palabra(/\bexent[oa]\b|exempt|art(?:[ií]culo|\.)?\s*(?:20|21|22|23|24|25)\b/i);
  F.isp = palabra(/inversi[oó]n\s+del\s+sujeto\s+pasivo|reverse\s+charge|art(?:[ií]culo|\.)?\s*84/i);
  F.intracom = palabra(/intracomunitari|intra-?community|art(?:[ií]culo|\.)?\s*25\b/i);
  F.noSujeta = palabra(/no\s+sujet[ao]|not\s+subject\s+to\s+vat|outside\s+the\s+scope/i);
  F.recargo = palabra(/recargo\s+de\s+equivalencia/i);

  const nFact = new Set([...t1.matchAll(/(?:commercial\s+invoice|factura|invoice)\s*(?:n[úu]m(?:ero)?\.?|n[ºo°?]\.?|no\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\.# ]{2,20}\d)/gi)].map((x) => x[1].replace(/\s+/g, '').toUpperCase())).size;
  const nombreMio = !!ctx.empresa?.nombre && t1.toUpperCase().includes(String(ctx.empresa.nombre).toUpperCase().replace(/\s+(S\.?A\.?|S\.?L\.?)\.?$/, '').trim());

  // ---- partes de la factura ----
  const lista = ids(T), emp = String(ctx.empresa?.cif ?? '').toUpperCase().replace(/^ES[\s\-]?/, '').replace(/[\s\-.]/g, '');
  const esMia = (x) => !!(emp && x?.id && x.id.toUpperCase().replace(/^ES[\s\-]?/, '').replace(/[\s\-.]/g, '') === emp);
  const rx = /(?:cliente|destinatario|facturar?\s+a|bill\s+to|invoice\s+to|customer|buyer|sold\s+to|consignee|datos\s+del\s+cliente)/i.exec(T);
  let emisor = null, receptor = null;
  if (rx) receptor = lista.find((x) => x.pos >= rx.index && x.pos < rx.index + 400) ?? null;
  const mia = lista.find(esMia);
  if (mia) { if (!receptor && (lista.indexOf(mia) > 0 || /recib|compra/i.test(ctx.libro ?? ''))) receptor = mia; if (!emisor && receptor === mia) emisor = lista.find((x) => x !== mia) ?? null; if (!receptor && lista.indexOf(mia) === 0) emisor = mia; if (emisor === mia) receptor = receptor ?? lista.find((x) => x !== mia) ?? null; }
  if (!emisor) emisor = lista.find((x) => x !== receptor) ?? null;
  if (!receptor) receptor = lista.find((x) => x !== emisor) ?? null;
  F.emisor = emisor; F.receptor = receptor;
  let libro = emisor && esMia(emisor) ? 'Emitidas' : receptor && esMia(receptor) ? 'Recibidas' : nombreMio && !lista.some(esMia) ? 'Recibidas' : (ctx.libro || '');
  F.libro = libro;
  if (emp && !lista.some(esMia) && !nombreMio) add('aviso', `La empresa elegida (${ctx.empresa?.nombre ?? emp}) no aparece en la factura ni como expedidor ni como destinatario: comprueba que has elegido la empresa correcta arriba.`, 'art. 97.Uno LIVA');
  const paisTxt = (() => { for (const [c, re] of Object.entries(PAISES)) if (re.test(t1)) return c; return ''; })();
  const paisE = emisor?.pais ?? (paisTxt && !esMia(emisor ?? {}) ? paisTxt : ''), paisR = receptor?.pais ?? '';
  F.paisEmisor = paisE; F.paisReceptor = paisR;
  const ue = (p) => EU.includes(p === 'GR' ? 'EL' : p), esp = (p) => p === 'ES';

  if (nFact > 1) add('aviso', `El PDF parece contener ${nFact} facturas distintas: analiza una por archivo; los importes y fechas de abajo pueden mezclar varias.`, '');
  // ---- requisitos formales (art. 6 RD 1619/2012) ----
  const simple = F.simplificada || (!receptor && F.total !== null && Math.abs(F.total) <= 400);
  if (!F.numero) add('error', 'No se localiza el número (y serie) de la factura.', 'art. 6.1.a RD 1619/2012'); else add('ok', `Número de factura: ${F.numero}.`);
  if (!F.fecha) add('error', 'No se localiza la fecha de expedición.', 'art. 6.1.b RD 1619/2012'); else if (f > hoy) add('error', `La fecha de expedición (${F.fecha}) es posterior a hoy.`, 'art. 6.1.b RD 1619/2012'); else add('ok', `Fecha de expedición: ${F.fecha}.`);
  if (F.fecha && f < new Date(hoy.getFullYear() - 4, hoy.getMonth(), hoy.getDate())) add('aviso', `La factura es de hace más de 4 años (${F.fecha}): el derecho a deducir y el de la Administración a liquidar pueden haber prescrito.`, 'arts. 100 y 66 LGT');
  for (const [rol, x] of [['expedidor', emisor], ['destinatario', receptor]]) {
    if (!x) { if (rol === 'expedidor' || !simple) add(rol === 'expedidor' ? 'error' : 'aviso', `No se localiza el NIF/NIF-IVA del ${rol}.`, rol === 'expedidor' ? 'art. 6.1.d RD 1619/2012' : 'art. 6.1.d RD 1619/2012 (necesario para deducir)'); continue; }
    if (x.es) { const v = validaNif(x.id); if (v && !v.ok) add('error', `El NIF del ${rol} (${x.id}) no supera la validación del dígito de control: puede estar mal escrito.`, 'art. 6.1.d RD 1619/2012'); else add('ok', `NIF del ${rol}: ${x.id} (${v?.tipo}).`); } else add('ok', `NIF-IVA del ${rol}: ${x.id} (${x.pais}). Comprueba que esté vigente en VIES.`);
  }
  if (!/(?:calle|c\/|avda|avenida|plaza|pol[ií]gono|street|road|avenue|address|direcci[oó]n|domicilio|\b\d{5}\b)/i.test(t1)) add('aviso', 'No se aprecia el domicilio del expedidor/destinatario.', 'art. 6.1.c RD 1619/2012');
  if (!/(?:descripci[oó]n|concepto|description|producto|servicio|item|detalle)/i.test(t1)) add('aviso', 'No se aprecia la descripción de la operación.', 'art. 6.1.e RD 1619/2012');
  if (simple) add('info', 'Factura simplificada: solo exige menos datos (art. 7 RD 1619/2012) y, sin NIF del destinatario, no da derecho a deducción salvo excepciones (arts. 97.Uno.3º y 6.1.d).', 'arts. 4 y 7 RD 1619/2012');

  // ---- importes ----
  // líneas con importe: se busca qué conjunto de líneas suma la base gravada (el resto va sin IVA)
  F.lineas = [];
  {
    const MON = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)|-?\d+\.\d{2}(?!\d)/g;
    const cand = T.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(s) && !/total|base\s+imponible|impuesto|desglose|subtotal|vencimiento|pendiente|fecha|cuota|\bIVA\b|forma\s+de\s+pago|\bal\s+\d+[.,]?\d*\s*%\s+sobre/i.test(s));
    for (const s of cand) { const a = s.match(MON); if (a?.length) { const imp = num(a[a.length - 1]); if (imp !== null && imp > 0 && imp !== F.total && imp !== F.base) F.lineas.push({ txt: s.length > 110 ? s.slice(0, 107) + '…' : s, imp, gravada: null }); } }
    if (F.lineas.length > 14) F.lineas = [];
    const bg0 = F.baseGravada ?? null;
    if (F.lineas.length && bg0 !== null && F.base !== null && Math.abs(bg0 - F.base) > 0.02) {
      const L = F.lineas; let hit = null, n = 0;
      const rec = (i, sum, pick) => { if (hit || n++ > 40000) return; if (Math.abs(sum - bg0) <= 0.02) { hit = pick.slice(); return; } if (i >= L.length || sum > bg0 + 0.02) return; pick.push(i); rec(i + 1, sum + L[i].imp, pick); pick.pop(); rec(i + 1, sum, pick); };
      rec(0, 0, []);
      if (hit) L.forEach((l, i) => { l.gravada = hit.includes(i); });
    }
  }
  const bgImp = F.baseGravada ?? F.base;
  if (F.baseGravada !== undefined && F.base !== null && Math.abs(F.baseGravada - F.base) > 0.02) add('aviso', `Solo ${nf2(F.baseGravada)} de los ${nf2(F.base)} de base llevan IVA: ${nf2(r2(F.base - F.baseGravada))} van sin IVA. Revisa abajo en «Líneas exentas» qué conceptos son y si está justificado.`, 'art. 6.1.f-j RD 1619/2012');
  if (F.base !== null && F.tipo !== null && F.cuota !== null) {
    const esp = r2(bgImp * F.tipo / 100); if (Math.abs(esp - F.cuota) > 0.05 + Math.abs(bgImp) * 0.0001) add('error', `La cuota (${F.cuota}) no cuadra con base × tipo: ${bgImp} × ${F.tipo} % = ${esp}.`, 'art. 6.1.f-h RD 1619/2012'); else add('ok', `Base gravada ${bgImp}, tipo ${F.tipo} %, cuota ${F.cuota}: cuadran.`);
  } else if (F.base !== null || F.cuota !== null || F.tipo !== null) add('aviso', `Importes incompletos: base ${F.base ?? '¿?'}, tipo ${F.tipo ?? '¿?'}, cuota ${F.cuota ?? '¿?'}.`, 'art. 6.1.f-h RD 1619/2012');
  if (F.base !== null && F.total !== null) { const ret = F.retTipo ? r2(F.base * F.retTipo / 100) : 0, esp = r2(F.base + (F.cuota ?? (F.tipo !== null ? F.base * F.tipo / 100 : 0)) - ret); if (Math.abs(esp - F.total) > 0.05 + Math.abs(F.total) * 0.0001) add('aviso', `El total (${F.total}) no es base + IVA${ret ? ' − retención' : ''} (${esp}).`, ''); }
  if (F.tipo !== null && ![0, 4, 10, 21, 5.2, 1.4, 0.5].includes(F.tipo) && (esp(paisE) || !paisE)) add('error', `El tipo de IVA ${F.tipo} % no existe en territorio común (4 %, 10 %, 21 %; recargo 0,5 / 1,4 / 5,2 %).`, 'arts. 90 y 91 LIVA');
  if (F.retTipo !== null) add('info', `Lleva retención del ${F.retTipo} %: va en el modelo ${/alquiler|arrend|lease|rent/i.test(t1) ? '115' : '111'} y, en el SII, no cambia la clave pero debe constar la retención (la factura la lleva el proveedor profesional o arrendador).`, 'art. 101 LIRPF');

  // ---- clasificación de la operación y declaración ----
  const bienes = /(?:fertili[sz]|abono|urea|nitrat|ammoni|npk|mercanc|goods|product|bags|sacos|tonne|tonelad|\bMT\b|\bkg\b|material|equipo|m[aá]quina)/i.test(t1), servicios = /(?:servicio|service|asesor|consult|honorarios|mantenimiento|alquiler|transporte|flete|freight|licencia|comisi[oó]n)/i.test(t1);
  F.bienes = bienes && !servicios ? 'bienes' : servicios && !bienes ? 'servicios' : (bienes && servicios ? 'mixto' : 'desconocido');
  const SII = { libro: libro || '—', tipoFactura: F.rectificativa ? 'R1 a R5 (según causa)' : simple ? 'F2' : 'F1', clave: '01', tipoNoExenta: '', causaExenta: '', modelos: [], casillas303: '', resumen: '' };
  let op = 'desconocida';
  const recib = libro === 'Recibidas', emit = libro === 'Emitidas';
  const hayIva = (F.cuota ?? 0) > 0 || (F.tipo ?? 0) > 0;

  if (esp(paisE) && esp(paisR || 'ES')) {
    op = 'interior';
    if (F.isp) { add('info', 'Operación con inversión del sujeto pasivo: el destinatario empresario liquida el IVA. La factura NO debe llevar cuota.', 'art. 84.Uno.2º LIVA'); if (hayIva) add('error', 'Menciona inversión del sujeto pasivo pero lleva cuota de IVA repercutida.', 'art. 84.Uno.2º LIVA'); SII.tipoNoExenta = 'S2 (no exenta con inversión del sujeto pasivo)'; SII.casillas303 = recib ? 'Devengo: 12-13 · Deducción: 28-29 (o 30-31 inversión)' : 'La declara el cliente; tú, base sin cuota'; }
    else if (F.exenta) { add('info', 'Operación exenta: la factura debe citar el precepto de exención y no llevar cuota.', 'arts. 20 a 25 LIVA y art. 6.1.j RD 1619/2012'); if (hayIva) add('error', 'Dice exenta pero lleva cuota de IVA.', 'arts. 20 a 25 LIVA'); SII.causaExenta = 'E1 (art. 20) / E6 (otros): elige según el artículo citado'; }
    else if (F.noSujeta) { add('info', 'Operación no sujeta: no lleva IVA; debe justificarse la no sujeción.', 'arts. 4 y 7 LIVA'); SII.tipoNoExenta = 'N1 (no sujeta art. 7 y 14 u otros)'; }
    else { if (!hayIva && F.base !== null) add('error', 'Operación interior sin IVA y sin mención de exención ni de inversión del sujeto pasivo: la AEAT exigiría explicar por qué no lleva IVA.', 'art. 90 LIVA'); SII.tipoNoExenta = 'S1 (no exenta sin inversión del sujeto pasivo)'; if (F.tipo !== null && ![21, 10, 4].includes(F.tipo) && !F.recargo) add('aviso', 'Revisa el tipo aplicado: general 21 %, reducido 10 % (art. 91.Uno) o superreducido 4 % (art. 91.Dos).', 'arts. 90 y 91 LIVA'); SII.casillas303 = recib ? 'Deducción: 28-29 (interiores corrientes) o 30-31 (bienes de inversión)' : `Devengo: ${F.tipo === 4 ? '01-03' : F.tipo === 10 ? '04-06' : '07-09'} (régimen general)`; }
    if (F.recargo) { SII.clave = '18'; add('info', 'Recargo de equivalencia: clave de régimen 18 en el SII.', 'arts. 148 a 163 LIVA'); }
    SII.resumen = 'Operación interior.';
  } else if (!esp(paisE) && ue(paisE) && esp(paisR || 'ES')) {
    op = F.bienes === 'servicios' ? 'servicios UE' : 'adquisición intracomunitaria';
    if (F.bienes === 'servicios') { add('info', 'Prestación de servicios B2B de un empresario de la UE: se localiza en España y el destinatario autorrepercute (inversión del sujeto pasivo).', 'arts. 69.Uno.1º y 84.Uno.2º LIVA'); SII.tipoNoExenta = 'S2 (no exenta con ISP)'; SII.casillas303 = 'Devengo: 10-11 · Deducción: 36-37 (o 38-39 si inversión)'; SII.modelos = ['349 clave S (declaración del adquirente de servicios)']; }
    else { add('info', 'Adquisición intracomunitaria de bienes: tributa en España con autorrepercusión; la factura del proveedor va sin IVA.', 'arts. 13, 15 y 85 LIVA'); SII.clave = '09'; SII.casillas303 = 'Devengo: 10-11 · Deducción: 36-37 (o 38-39 si inversión)'; SII.modelos = ['349 clave A (adquisiciones)']; }
    if (hayIva) add('aviso', `La factura lleva IVA (${F.tipo ?? ''} %) de otro Estado: no se puede deducir en España; se pide la devolución al Estado del proveedor, o se pide la rectificación si el proveedor debía aplicar la no sujeción.`, 'Directiva 2008/9/CE');
    if (!hayIva && !F.isp && !F.intracom) add('info', 'La factura sin IVA debería citar la inversión del sujeto pasivo / operación intracomunitaria exenta del proveedor.', 'art. 226 Directiva 2006/112/CE');
    SII.resumen = 'Adquisición de la UE (recibida).';
  } else if (esp(paisE) && ue(paisR)) {
    op = F.bienes === 'servicios' ? 'servicios a UE' : 'entrega intracomunitaria';
    if (F.bienes === 'servicios') { add('info', 'Servicios B2B a empresario de la UE: no sujetos en España (se localizan en destino). Sin IVA y con la mención de inversión del sujeto pasivo.', 'art. 69.Uno.1º LIVA'); SII.tipoNoExenta = 'N2 (no sujeta por reglas de localización)'; SII.modelos = ['349 clave S']; SII.casillas303 = 'Casilla 61 (no sujetas por localización)'; }
    else { add('info', 'Entrega intracomunitaria exenta: exige NIF-IVA vigente del cliente (VIES) y prueba del transporte a otro Estado miembro. La factura debe citar el art. 25.', 'art. 25 LIVA'); SII.causaExenta = 'E5 (art. 25 entrega intracomunitaria)'; SII.modelos = ['349 clave E']; SII.casillas303 = 'Casilla 59 (entregas intracomunitarias exentas)'; if (!F.intracom && !F.exenta) add('error', 'Falta la mención de exención (art. 25 LIVA) en una entrega a la UE.', 'art. 6.1.j RD 1619/2012'); }
    if (hayIva) add('error', 'La factura a un cliente de la UE lleva IVA: si la operación está exenta o no sujeta no debe llevarlo.', 'arts. 25 y 69 LIVA');
    SII.resumen = 'Operación con la UE (emitida).';
  } else if (esp(paisR || 'ES') && (paisE && !ue(paisE) && !esp(paisE) || (!paisE && (F.incoterm || F.moneda === 'USD')))) {
    op = F.bienes === 'servicios' ? 'servicios de fuera de la UE' : 'importación';
    if (op === 'importación') { add('info', `Importación de bienes${F.incoterm ? ` (${F.incoterm})` : ''}: el IVA se liquida en el DUA, no en la factura del proveedor (que va sin IVA). La base del IVA es el valor en aduana más derechos y gastos hasta el primer lugar de destino.`, 'arts. 17, 18, 83 y 83.Uno LIVA'); SII.tipoFactura = 'F5 (importaciones: el DUA) / la factura del proveedor, F6 u omitida del libro según criterio'; SII.casillas303 = 'Deducción: 32-33 (importaciones corrientes) o 34-35 (inversión); el IVA lo da el DUA'; SII.resumen = 'La factura del proveedor justifica el valor; el IVA y su deducción salen del DUA, no de esta factura.'; if (hayIva) add('aviso', 'Una factura de un proveedor de fuera de la UE no debería llevar IVA español.', 'art. 17 LIVA'); if (F.moneda && F.moneda !== 'EUR') add('info', `Importe en ${F.moneda}: el DUA convierte al tipo de cambio de la aduana (art. 83). Registra la factura con el contravalor que figure en el DUA.`, 'art. 83 LIVA'); }
    else { add('info', 'Servicios de empresario de fuera de la UE a un empresario en España: se localizan aquí y se autorrepercuten.', 'arts. 69.Uno.1º y 84.Uno.2º LIVA'); SII.tipoNoExenta = 'S2 (no exenta con ISP)'; SII.casillas303 = 'Devengo: 12-13 · Deducción: 28-29'; }
    if (!hayIva) add('ok', 'Sin IVA español en la factura, como corresponde.');
  } else if (esp(paisE) && paisR && !ue(paisR) && !esp(paisR)) {
    op = 'exportación'; add('info', 'Entrega a un cliente de fuera de la UE: exportación exenta con DUA de salida con levante y sello de salida.', 'art. 21 LIVA'); SII.causaExenta = 'E2 (art. 21 exportación)'; SII.clave = '02'; SII.casillas303 = 'Casilla 60 (exportaciones y asimiladas)'; if (hayIva) add('error', 'Una exportación exenta no lleva IVA.', 'art. 21 LIVA');
  } else if (esp(paisE) && !paisR && emit && !hayIva && (F.moneda === 'USD' || F.incoterm)) {
    op = 'exportación'; add('info', 'Posible exportación (moneda extranjera/Incoterm, sin IVA): necesitas el DUA de salida para justificar la exención.', 'art. 21 LIVA'); SII.causaExenta = 'E2 (art. 21 exportación)'; SII.clave = '02';
  } else { add('aviso', 'No he podido determinar el tipo de operación (países de expedidor/destinatario). Indica en «Libro» si es emitida o recibida y comprueba los NIF.', ''); }
  F.operacion = op;

  // ---- deducibilidad (solo recibidas) ----
  if (recib || (!libro && receptor && !emisor?.es)) {
    if (receptor && emp && !esMia(receptor)) add('error', `El destinatario de la factura (${receptor.id}) no es la empresa elegida (${ctx.empresa?.cif}): la AEAT no admite la deducción si no consta como destinatario.`, 'art. 97.Uno LIVA');
    if (/(?:atenci[oó]n|obsequio|regalo|cesta|gift|restaurante|restaurant|hotel|joyer|bebida|alcohol)/i.test(t1)) add('aviso', 'Hay conceptos de dudosa deducibilidad (atenciones a clientes, regalos, restauración, joyas…): comprueba afectación y límites.', 'art. 96.Uno.5º LIVA / art. 15 LIS');
    if (/(?:veh[ií]culo|coche|autom[oó]vil|renting|leasing|gasolina|combustible)/i.test(t1)) add('aviso', 'Vehículos y combustible: la deducción se presume del 50 % salvo prueba de afectación exclusiva.', 'art. 95.Tres.2ª LIVA');
    if (F.fecha && f) add('info', `Plazo para deducir: hasta el 31/12/${f.getFullYear() + 4} aproximadamente (4 años desde el devengo).`, 'art. 100.Dos LIVA');
  }
  if (F.rectificativa) { add('info', 'Factura rectificativa: debe referenciar la factura original (número y fecha) y la causa. En el SII, tipo R1 (error fundado en derecho o art. 80.Uno/Dos/Tres/Cuatro y 80.Cuatro) o R4 (resto); R5 si es simplificada.', 'art. 15 RD 1619/2012 y art. 80 LIVA'); if (!/(?:rectific|original|referencia|factura\s+n)/i.test(t1)) add('aviso', 'No se ve la referencia a la factura rectificada.', 'art. 15 RD 1619/2012'); }

  // ---- líneas exentas: cuáles son, por qué se declaran exentas y si el precepto encaja con la operación ----
  F.exentas = [];
  {
    const lineas = [...new Set(T.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 3))];
    const reEx = /\bexent[oa]s?\b|\bexempt(?:ed|ion)?\b|\bsin\s+i\.?v\.?a\b|(?<![\d.,])0(?:[.,]0+)?\s?%|\bart(?:[ií]culo|\.)?\s*2[0-7]\b/i;
    const GR = { educ: [9, 10, 11], sanit: [2, 3, 4, 5, 6, 7, 8], seguro: [16], financ: [17, 18], vivienda: [23] };
    const NOM = { educ: 'enseñanza/formación', sanit: 'servicios sanitarios', seguro: 'seguros', financ: 'operaciones financieras', vivienda: 'alquiler de vivienda' };
    const infer = (s) => /ense[ñn]anza|educaci[oó]n|docente|colegio|formaci[oó]n/i.test(s) ? 'educ' : /sanitari|m[eé]dic|hospital|cl[ií]nica|odontol/i.test(s) ? 'sanit' : /seguro|p[oó]liza|reaseguro/i.test(s) ? 'seguro' : /pr[eé]stamo|cr[eé]dito|intereses|comisi[oó]n\s+bancaria|financier|\baval\b/i.test(s) ? 'financ' : /(?:alquiler|arrendamiento)[^.]{0,40}vivienda|vivienda[^.]{0,40}(?:alquiler|arrendamiento)/i.test(s) ? 'vivienda' : '';
    const CAUSA = { 20: 'E1', 21: 'E2', 22: 'E3', 23: 'E4', 24: 'E4', 25: 'E5' };
    const ueR = ue(paisR), fueraR = !!paisR && !ueR && !esp(paisR), recibExt = recib && !!paisE && !esp(paisE);
    for (const ln of lineas) {
      if (F.exentas.length >= 10) break;
      if (!reEx.test(ln)) continue;
      if (/inversi[oó]n\s+del\s+sujeto|reverse\s+charge/i.test(ln) && !/exent|exempt/i.test(ln)) continue;
      if (/no\s+sujet[ao]|not\s+subject/i.test(ln) && !/exent|exempt/i.test(ln)) continue;
      const am = /art(?:[ií]culo|\.)?\s*(2[0-7])(?:\.?\s*(?:uno|dos|ap(?:artado)?\.?)?\s*[.,]?\s*(?:n[ºo°?]?\s*)?(\d{1,2}))?/i.exec(ln);
      const art = am ? +am[1] : null, apt = am?.[2] ? +am[2] : null, cero = /(?<![\d.,])0(?:[.,]0+)?\s?%/.test(ln), grp = infer(ln) || infer(t1);
      const mot = [], q = (n, tx) => mot.push({ n, t: tx });
      if (!art) {
        if (cero && !/exent|exempt/i.test(ln)) q('error', 'Tipo 0 %: en territorio común no existe tipo 0 %; debe ser exenta (con su precepto), no sujeta o inversión del sujeto pasivo.');
        else q(op === 'interior' ? 'error' : 'aviso', 'Se declara exenta sin citar el precepto (art. 20 a 25 LIVA): la factura debe indicarlo.');
      } else if (art === 21) {
        if (recibExt) q('ok', 'Compra a un proveedor de otro país: su exención se rige por su propia ley; aquí no hay IVA español que deducir.');
        else if (!paisR) q('aviso', 'Exportación (art. 21): no se identifica el país del cliente; exige cliente fuera de la UE y DUA de salida.');
        else if (esp(paisR)) q('error', 'Cita el art. 21 (exportación) pero el cliente es español: una venta en España no es una exportación.');
        else if (ueR) q('error', 'Cita el art. 21 (exportación) pero el cliente es de la UE: sería entrega intracomunitaria (art. 25), no exportación.');
        else q('ok', 'Exportación a cliente de fuera de la UE: correcta si hay DUA de salida con levante y sello de salida.');
      } else if (art === 25) {
        if (recibExt) q('ok', 'Compra a un proveedor de otro país: su exención se rige por su propia ley; aquí no hay IVA español que deducir.');
        else if (!paisR) q('aviso', 'Entrega intracomunitaria (art. 25): no se identifica el país del cliente; exige NIF-IVA vigente en VIES y transporte a otro Estado miembro.');
        else if (esp(paisR)) q('error', 'Cita el art. 25 (entrega intracomunitaria) pero el cliente es español.');
        else if (fueraR) q('error', 'Cita el art. 25 pero el cliente es de fuera de la UE: sería exportación (art. 21).');
        else q('ok', 'Entrega a cliente de la UE: correcta si el NIF-IVA está vigente en VIES y hay prueba del transporte.');
      } else if (art === 22) q('aviso', 'Art. 22 (operaciones asimiladas a exportación: navegación marítima y aérea, avituallamiento…): comprueba que el bien o servicio entra en alguno de sus apartados.');
      else if (art === 23 || art === 24) q('aviso', `Art. ${art} (zonas francas, depósitos aduaneros y otros regímenes): exige que los bienes estén vinculados a ese régimen; comprueba la documentación aduanera.`);
      else if (art === 26 || art === 27) q(op === 'importación' ? 'ok' : 'aviso', op === 'importación' ? `Importación exenta (art. ${art}): el DUA debe reflejar el motivo de la exención.` : `Art. ${art} se refiere a importaciones exentas; la operación no parece una importación.`);
      else if (art === 20) {
        if (op !== 'interior' && !recibExt) q('aviso', 'El art. 20 solo regula operaciones interiores exentas; la operación no parece interior.');
        else if (grp && apt && !GR[grp].includes(apt)) q('aviso', `El apartado citado (20.Uno.${apt}º) no encaja con el concepto, que parece ${NOM[grp]}.`);
        else if (!grp && F.bienes === 'bienes') q('aviso', 'Entrega de bienes exenta por el art. 20: salvo casos tasados (sellos, oro de inversión…) las entregas de bienes tributan; revisa el motivo.');
        else if (!grp) q('aviso', 'No puedo confirmar por el concepto que la operación sea de las exentas del art. 20 (sanidad, enseñanza, seguros, financieras, alquiler de vivienda…).');
        else q('ok', `Encaja con una exención del art. 20 (${NOM[grp]}).`);
        if (emit) q('aviso', 'Las operaciones exentas del art. 20 no dan derecho a deducir: afectan a la prorrata (si es la actividad habitual) o a la regla de deducción.');
      }
      const v = mot.some((x) => x.n === 'error') ? 'incorrecta' : mot.some((x) => x.n === 'aviso') ? 'dudosa' : 'correcta';
      F.exentas.push({ linea: ln.length > 110 ? ln.slice(0, 107) + '…' : ln, art, apt, causa: art ? (CAUSA[art] ?? 'E6') : '', v, motivos: mot.map((x) => x.t) });
    }
    // parte de la base que va sin IVA (la cuota solo cubre la base gravada): qué líneas son y si hay justificación
    const resto = F.baseGravada !== undefined && F.base !== null ? r2(F.base - F.baseGravada) : 0;
    if (resto > 0.02) {
      const sin = F.lineas.filter((l) => l.gravada === false && !F.exentas.some((x) => x.linea === l.txt));
      for (const l of (sin.length ? sin : [{ txt: `Importe sin IVA (resto de la base): ${nf2(resto)}`, imp: resto }])) {
        const sup = /suplido|\btasas?\b|arancel|gastos\s+(?:de\s+)?(?:notar|registr)|provisi[oó]n\s+de\s+fondos/i.test(l.txt), cuotaOm = r2(l.imp * (F.tipo ?? 21) / 100), mot = [];
        if (sup) mot.push('Parece un suplido: no forma parte de la base del IVA solo si se paga en nombre y por cuenta del cliente, se justifica y va facturado aparte.');
        else if (op === 'interior' || !op) mot.push(`Línea sin IVA, sin precepto de exención ni causa de no sujeción citados. Si no se justifica tributa al ${F.tipo ?? 21} %: cuota no repercutida de ${nf2(cuotaOm)} €. Si es exenta, debe citar el artículo (arts. 20 a 25 LIVA); si es un suplido, ir separada.`);
        else mot.push('Línea sin IVA: comprueba que la operación está exenta o no sujeta y que consta el precepto.');
        F.exentas.push({ linea: l.txt, art: null, apt: null, causa: '', v: sup ? 'dudosa' : (op === 'interior' || !op) ? 'incorrecta' : 'dudosa', motivos: mot });
      }
    }
    const nEx = F.exentas.length;
    if (nEx) {
      const bad = F.exentas.filter((x) => x.v === 'incorrecta').length, dud = F.exentas.filter((x) => x.v === 'dudosa').length;
      add(bad ? 'error' : dud ? 'aviso' : 'ok', `${nEx} línea(s) exenta(s) o al 0 %: ${bad} incorrecta(s), ${dud} dudosa(s), ${nEx - bad - dud} correcta(s). Detalle en «Líneas exentas».`, 'arts. 20 a 25 LIVA');
      const c = F.exentas.find((x) => x.art && x.v !== 'incorrecta' && x.causa); if (c) SII.causaExenta = `${c.causa} (art. ${c.art} LIVA)`;
      if (hayIva && F.base && F.baseGravada === undefined) add('aviso', 'La factura mezcla líneas exentas y líneas con IVA: la base de cada tipo y la exenta deben ir desglosadas, y la cuota calcularse solo sobre la parte gravada.', 'art. 6.1.f-j RD 1619/2012');
    }
  }

  // ---- resumen SII ----
  if (!SII.resumen) SII.resumen = 'Revisa los datos del tipo de operación.';
  return { ok: true, F, H, SII, resumen: { errores: H.filter((x) => x.nivel === 'error').length, avisos: H.filter((x) => x.nivel === 'aviso').length } };
}
