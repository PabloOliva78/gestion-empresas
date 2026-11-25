// Revisión factura AEAT · informe completo (fases 1-3): líneas con tipo aplicado y correcto, importes corregidos, incidencias con efecto en €,
// ISP del art. 84.Uno.2º (móviles, consolas, portátiles, tablets, chips, chatarra, oro, obra), deducibilidad, registro SII con periodo y plazos,
// albaranes, acciones (rectificativa, correo al proveedor, asiento) y preguntas abiertas. Trabaja sobre el resultado de analizarFactura() y el texto leído.
// Todo orientativo y en el navegador; los umbrales y supuestos de ISP deben contrastarse con la norma vigente.
import { num } from './revfactura-motor.js?v=7';

const r2 = (x) => Math.round((x + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
export const fmt = (v) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)|-?\d+\.\d{2}(?!\d)/g;
const SKIP = /^(?:total|base\s+imponible|subtotal|sub-total|desglose|impuestos?|cuota|iva\b|importe\s+(?:total|iva|neto)|neto|vencimiento|pendiente|forma\s+de\s+pago|iban|swift|tel[eé]fono|fecha|estado)|\bal\s+\d+[.,]?\d*\s*%\s+sobre|iban\b|swift\b/i;
const PORTE = /\b(?:porte|portes|transporte|flete|env[ií]o|gastos\s+de\s+env[ií]o|reparto|delivery|shipping)\b/i;
const DISP = /tel[eé]fonos?\s+m[oó]vil(?:es)?|smartphones?|\bm[oó]vil(?:es)?\b|iphone|consolas?|playstation|xbox|nintendo|port[aá]til(?:es)?|laptops?|notebooks?|macbook|\btablets?\b|tabletas?|ipad/i;
const OTRAS = [
  [/chatarra|ferralla|desperdicios?|residuos?\s+met[aá]lic|\bscrap\b/i, 'chatarra, desperdicios y residuos'],
  [/oro\s+de\s+inversi[oó]n|lingotes?\s+de\s+oro/i, 'oro de inversión'],
  [/ejecuci[oó]n\s+de\s+obra|obras?\s+de\s+(?:construcci[oó]n|rehabilitaci[oó]n|urbanizaci[oó]n)|subcontrata\s+de\s+obra/i, 'ejecuciones de obra con inmuebles'],
  [/circuitos?\s+integrados?|microprocesadores?|\bchips?\b/i, 'chips / dispositivos de circuito integrado'],
  [/renuncia\s+a\s+la\s+exenci[oó]n/i, 'renuncia a la exención en inmuebles'],
];
const NO_DED = /\bmultas?\b|sanci[oó]n|recargo\s+(?:de\s+apremio|ejecutivo|de\s+prestaci[oó]n)|intereses\s+de\s+demora/i;

const UTC = (y, m, d) => Date.UTC(y, m - 1, d);
const dmy = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
function fechaDe(s) {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return UTC(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s); if (!m) return null; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return UTC(y, +m[2], +m[1]);
}

// ---- fase 1: líneas de la factura (referencia, descripción, cantidad, precio, importe, tipo) ----
export function parseLineas(texto, F) {
  const L = [];
  for (const raw of String(texto ?? '').split('\n')) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (s.length < 6 || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(s) || SKIP.test(s)) continue;
    const pm = /(\d{1,2}(?:[.,]\d+)?)\s*%/.exec(s), sinPct = pm ? s.replace(pm[0], ' ') : s;
    const am = sinPct.match(MON); if (!am?.length) continue;
    const amts = am.map(num).filter((x) => x !== null); if (!amts.length) continue;
    const imp = amts[amts.length - 1]; if (!(imp > 0)) continue;
    if (amts.length === 1 && !pm && ((F.total !== null && Math.abs(imp - F.total) < 0.005) || (F.base !== null && Math.abs(imp - F.base) < 0.005))) continue;
    const resto = sinPct.replace(MON, ' ');
    const nums = (resto.match(/(?<![A-Za-z0-9#\/\-.])\d+(?:[.,]\d+)?(?![A-Za-z0-9\/\-])/g) || []).map(num).filter((x) => x !== null && x > 0 && x < 1e7);
    let cant = null, pu = null, calcOk = null, esperado = null;
    outer: for (const c of nums) for (const p of amts) if (Math.abs(c * p - imp) <= 0.02 + imp * 0.0005) { cant = c; pu = p; calcOk = true; break outer; }
    if (cant === null && amts.length >= 2 && nums.length) { const c = nums[0], p = amts[amts.length - 2], e = r2(c * p); if (e > imp * 0.4 && e < imp * 2.5) { cant = c; pu = p; calcOk = false; esperado = e; } }
    const ref = (/^([A-Z0-9][A-Z0-9\-\/.]{2,19})\s/i.exec(s) || [])[1];
    const desc = resto.replace(/\b(?:EUR|USD|GBP)\b|[€$£]/g, ' ').replace(/\s+/g, ' ').replace(/^\S*\d\S*\s+/, '').trim() || s;
    L.push({ txt: s.length > 120 ? `${s.slice(0, 117)}…` : s, ref: ref && /\d/.test(ref) ? ref : '', desc, cant, pu, base: imp, tipoTxt: pm ? num(pm[1]) : null, calcOk, esperado });
    if (L.length >= 40) break;
  }
  return L;
}

const claveProd = (d) => String(d).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !/^(?:con|sin|por|para|del|las|los|una|uno|uds?|und|kg|tn)$/.test(w)).slice(0, 3).join(' ');

// ---- informe completo ----
export function completarInforme(R, texto, cfg = {}) {
  if (!R?.ok) return R;
  const F = R.F, hoy = cfg.hoy instanceof Date ? cfg.hoy : new Date(), esHabil = cfg.esHabil ?? ((t) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6; });
  const inc = [], preg = [], add = (sev, t, art = '', ef = null) => inc.push({ sev, t, art, ef });
  const recibida = F.libro === 'Recibidas', pro = cfg.prorrata === undefined || cfg.prorrata === '' ? 100 : Math.max(0, Math.min(100, +cfg.prorrata));
  const sumRes = (x) => x.reduce((a, b) => a + b, 0);

  // 1) líneas con su tipo aplicado
  const L = parseLineas(texto, F), motorL = F.lineas || [];
  const hoyUtc = UTC(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
  for (const l of L) {
    let t = l.tipoTxt;
    if (t === null) { const m = motorL.find((x) => Math.abs(x.imp - l.base) < 0.005); if (m && m.gravada !== null && m.gravada !== undefined) t = m.gravada ? (F.tipo ?? null) : 0; else if (F.tipo !== null && F.baseGravada === undefined) t = F.tipo; }
    l.tipoA = t; l.tipoC = t; l.nota = [];
  }
  const sumLin = r2(sumRes(L.map((l) => l.base))), cobertura = F.base ? sumLin / F.base : 0, fiable = L.length > 0 && cobertura > 0.9 && cobertura < 1.1;
  if (L.length && !fiable) preg.push(`He leído ${L.length} línea(s) por ${fmt(sumLin)} € y la base es ${fmt(F.base ?? 0)} €: no están todas, así que la tabla de líneas es orientativa. Revisa el «Texto leído».`);
  if (!L.length) preg.push('No he podido separar las líneas de la factura: el análisis se hace con los totales.');

  // aritmética de cada línea
  for (const l of L) if (l.calcOk === false) { add('media', `La línea «${l.txt}» no cuadra: ${l.cant} × ${fmt(l.pu)} = ${fmt(l.esperado)} y la factura pone ${fmt(l.base)} (puede ser un descuento o un error).`, 'art. 6.1.f RD 1619/2012', r2(Math.abs(l.base - l.esperado))); l.nota.push('importe no cuadra'); }

  // 2) 0 % sin justificar (las que el motor marcó como incorrectas) → tipo correcto = el de las demás líneas
  const tiposPos = L.map((l) => l.tipoA).filter((t) => t > 0), moda = (a) => { const c = {}; a.forEach((x) => { c[x] = (c[x] || 0) + 1; }); return +Object.entries(c).sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0]; };
  const tGen = tiposPos.length ? moda(tiposPos) : (F.tipo > 0 ? F.tipo : 21);
  const incorrectas = (F.exentas || []).filter((x) => x.v === 'incorrecta');
  for (const l of L) { if (incorrectas.some((x) => x.linea.slice(0, 40) === l.txt.slice(0, 40)) && (l.tipoA === 0 || l.tipoA === null)) { l.tipoC = tGen; l.nota.push('0 % sin justificar'); } }

  // 3) mismo producto, mismo tipo; los portes siguen al bien principal
  const grupos = {}; L.forEach((l) => { const k = claveProd(l.desc); if (k && l.tipoA !== null && !PORTE.test(l.desc)) (grupos[k] ||= []).push(l); });
  for (const [k, g] of Object.entries(grupos)) { const ts = [...new Set(g.map((l) => l.tipoA))]; if (ts.length > 1) { const mo = moda(g.map((l) => l.tipoA)); g.forEach((l) => { if (l.tipoA !== mo && l.tipoC === l.tipoA) { l.tipoC = mo; l.nota.push('mismo producto con otro tipo'); } }); add('alta', `El mismo producto («${k}») aparece con tipos distintos (${ts.join(' % y ')} %): debe aplicarse el mismo.`, 'arts. 90 y 91 LIVA', r2(sumRes(g.filter((l) => l.tipoC !== l.tipoA).map((l) => l.base * (l.tipoC - l.tipoA) / 100)))); } }
  const principal = [...L].filter((l) => !PORTE.test(l.desc) && l.tipoA !== null).sort((a, b) => b.base - a.base)[0];
  for (const l of L) if (PORTE.test(l.desc) && principal && l.tipoA !== null && l.tipoA !== principal.tipoA) { l.tipoC = principal.tipoA; l.nota.push('el porte sigue al bien'); add('media', `El porte/transporte «${l.txt}» lleva ${l.tipoA} % y el bien principal ${principal.tipoA} %: los portes siguen el tipo del bien.`, 'art. 79.Uno.2º LIVA', r2(l.base * (principal.tipoA - l.tipoA) / 100)); }

  // 4) ISP del art. 84.Uno.2º: dispositivos (móviles, consolas, portátiles, tablets) y otros supuestos
  const disp = L.filter((l) => DISP.test(l.desc) || DISP.test(l.txt)), sumDisp = r2(sumRes(disp.map((l) => l.base)));
  const hayIvaF = (F.cuota ?? 0) > 0 || (F.tipo ?? 0) > 0;
  const escenarios = [];
  if (disp.length) {
    const supera = sumDisp > 10000, rev = cfg.revendedor, tD = disp.find((l) => l.tipoA > 0)?.tipoA ?? tGen, ivaD = r2(sumDisp * tD / 100);
    const aplica = rev === 'si' ? true : supera ? true : rev === 'no' ? false : null;
    if (aplica === true) {
      disp.forEach((l) => { l.tipoC = 0; l.isp = true; l.nota.push('ISP'); });
      if (!F.isp) add('alta', `Entrega de móviles/consolas/portátiles/tablets por ${fmt(sumDisp)} € ${rev === 'si' ? 'a una sociedad revendedora' : 'por encima de 10.000 € sin IVA'}: corresponde inversión del sujeto pasivo (sin IVA y con la mención del art. 84.Uno.2º), y la factura ${hayIvaF ? 'lleva IVA' : 'no cita la ISP'}.`, 'art. 84.Uno.2º LIVA', hayIvaF ? ivaD : null);
    } else if (aplica === false) {
      if (F.isp || disp.some((l) => l.tipoA === 0)) add('alta', `La factura aplica ISP/0 % a dispositivos por ${fmt(sumDisp)} €, pero la sociedad no es revendedora y no se superan 10.000 €: debía llevar IVA (${fmt(ivaD)} €).`, 'art. 84.Uno.2º LIVA', ivaD);
    } else {
      escenarios.push(`Dispositivos (móviles/consolas/portátiles/tablets) por ${fmt(sumDisp)} €. Si la sociedad es revendedora habitual → ISP: factura sin IVA y la sociedad autorrepercute ${fmt(ivaD)} € (casillas 12-13 y 28-29 del 303). Si no lo es (y no pasan de 10.000 €) → IVA normal ${tD} %: ${fmt(ivaD)} € repercutidos por el proveedor.`);
      add('media', `Dispositivos por ${fmt(sumDisp)} €: el resultado depende de si la sociedad es revendedora habitual (ver «Preguntas abiertas»).`, 'art. 84.Uno.2º LIVA', ivaD);
      preg.push('¿La sociedad es revendedora habitual de móviles, consolas, portátiles o tablets? (elígelo en «Datos de la empresa para el análisis»).');
    }
  }
  for (const [re, nombre] of OTRAS) { const o = L.filter((l) => re.test(l.desc) || re.test(l.txt)); if (o.length && !F.isp) { const b = r2(sumRes(o.map((l) => l.base))); add('media', `Hay una línea de ${nombre} (${fmt(b)} €): puede estar en inversión del sujeto pasivo si el destinatario es empresario. La factura ${hayIvaF ? 'lleva IVA' : 'no cita la ISP'}; confirma el supuesto.`, 'art. 84.Uno.2º LIVA', hayIvaF ? r2(b * tGen / 100) : null); } }

  // 5) importes corregidos
  const ivaOrig = F.cuota ?? (F.base !== null && F.tipo !== null ? r2((F.baseGravada ?? F.base) * F.tipo / 100) : null);
  let ivaCorr = ivaOrig, baseCorr = F.base, metodo = 'totales';
  if (fiable) { ivaCorr = r2(sumRes(L.map((l) => (l.tipoC ?? 0) * l.base / 100))); baseCorr = sumLin; metodo = 'líneas'; }
  else if (incorrectas.length) { const falta = r2(sumRes(incorrectas.map((x) => { const m = /(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(x.linea); const b = m ? num(m[1]) : 0; return b * tGen / 100; }))); ivaCorr = r2((ivaOrig ?? 0) + falta); metodo = 'cuota omitida'; }
  const totalOrig = F.total ?? (F.base !== null && ivaOrig !== null ? r2(F.base + ivaOrig) : null);
  const totalCorr = baseCorr !== null && ivaCorr !== null ? r2(baseCorr + ivaCorr - (F.retTipo ? r2(baseCorr * F.retTipo / 100) : 0)) : null;
  const tIsp = disp.find((l) => l.tipoA > 0)?.tipoA ?? tGen, ivaAutorrep = r2(sumRes(L.filter((l) => l.isp).map((l) => l.base * tIsp / 100)));
  const dif = ivaOrig !== null && ivaCorr !== null ? r2(ivaCorr - ivaOrig) : 0;
  if (Math.abs(dif) > 0.02 && !inc.some((x) => x.ef !== null && Math.abs(x.ef - Math.abs(dif)) < 0.05)) add('alta', `El IVA correcto sería ${fmt(ivaCorr)} € y la factura pone ${fmt(ivaOrig ?? 0)} €: ${dif > 0 ? 'falta repercutir' : 'se ha repercutido de más'} ${fmt(Math.abs(dif))} €.`, 'arts. 90 y 91 LIVA', Math.abs(dif));
  // deducibilidad: prorrata y gastos no deducibles
  const ivaDeducible = recibida && ivaOrig !== null ? r2((ivaOrig) * pro / 100) : null, ivaNoDed = recibida && ivaOrig !== null ? r2(ivaOrig - ivaDeducible) : null;
  if (recibida && pro < 100 && ivaOrig > 0) add('baja', `Con prorrata del ${pro} % solo se deduce ${fmt(ivaDeducible)} € de IVA; el resto (${fmt(ivaNoDed)} €) es mayor gasto.`, 'arts. 102 a 106 LIVA', ivaNoDed);
  if (recibida && NO_DED.test(texto)) add('media', 'Aparecen conceptos de multas, sanciones, recargos o intereses de demora: no son gasto deducible en el Impuesto sobre Sociedades y no llevan IVA deducible.', 'art. 15.c LIS', null);
  if (recibida && /(?:retenci[oó]n|IRPF)/i.test(texto) && F.retTipo === null) add('baja', 'La factura menciona retención/IRPF pero no he podido leer el tipo: comprueba el modelo 111/115.', 'art. 101 LIRPF', null);

  // 6) albaranes, fecha de operación y plazos
  const albs = []; for (const ln of String(texto).split('\n')) if (/albar[aá]n|delivery\s+note|nota\s+de\s+entrega|\balb\b/i.test(ln)) { const f = fechaDe(ln); if (f) albs.push(f); }
  const fFact = F.fecha ? fechaDe(F.fecha) : null;
  const meses = [...new Set(albs.map((t) => new Date(t).toISOString().slice(0, 7)))];
  let fOper = fFact;
  if (albs.length) { fOper = Math.max(...albs); if (meses.length > 1) add('media', `La factura agrupa albaranes de ${meses.length} meses distintos (${meses.join(', ')}): una factura recapitulativa solo puede agrupar operaciones del mismo mes natural.`, 'art. 22 RD 1619/2012'); else if (fFact) { const d = new Date(fOper), lim = UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 16); if (fFact > lim) add('media', `La factura (${dmy(fFact)}) se expide después del día 16 del mes siguiente a la operación (${dmy(lim)}): fuera del plazo de expedición.`, 'art. 11 RD 1619/2012'); } }
  const fp = fOper ?? fFact; let sii = null;
  if (fp) {
    const d = new Date(fp), py = d.getUTCFullYear(), pm = d.getUTCMonth() + 1, ajusta = (t) => { while (!esHabil(t)) t += 864e5; return t; };
    const tope = ajusta(UTC(py, pm + 1, 16)), reg = cfg.fechaReg ? fechaDe(cfg.fechaReg) : null;
    let plazo4 = null; if (reg) { let t = reg, n = 0; while (n < 4) { t += 864e5; if (esHabil(t)) n++; } plazo4 = t; }
    const limite = plazo4 ? Math.min(plazo4, tope) : tope, vencido = hoyUtc > limite;
    sii = { periodo: `${py}/${String(pm).padStart(2, '0')}`, fechaOper: fp, tope, plazo4, limite, vencido, reg };
    if (vencido) add('alta', `Plazo del SII vencido el ${dmy(limite)}: ${plazo4 && plazo4 < tope ? '4 días hábiles desde el registro contable' : 'día 16 del mes siguiente al periodo'}. Regístrala ya y deja constancia del motivo del retraso.`, 'art. 62.6 RIVA');
    if (!reg) preg.push(`¿Cuándo se registró contablemente? Sin esa fecha solo calculo el tope del día 16 (${dmy(tope)}); si la registras hoy, los 4 días hábiles vencen el ${dmy((() => { let t = hoyUtc, n = 0; while (n < 4) { t += 864e5; if (esHabil(t)) n++; } return t; })())}.`);
  }
  if (cfg.empresaCambia) preg.push(`La factura va dirigida a ${F.empresaDet?.nombre}, distinta de la empresa elegida arriba: cámbiala antes de registrar.`);

  // 7) incidencias: las del motor (errores y avisos) + las nuevas; sin duplicar el resumen de exentas
  const delMotor = R.H.filter((h) => (h.nivel === 'error' || h.nivel === 'aviso') && !/línea\(s\) exenta\(s\)/.test(h.t)).map((h) => ({ sev: h.nivel === 'error' ? 'alta' : 'media', t: h.t, art: h.art, ef: null }));
  const deExentas = (F.exentas || []).filter((x) => x.v !== 'correcta').map((x) => { const m = /(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(x.linea), b = m ? num(m[1]) : null; return { sev: x.v === 'incorrecta' ? 'alta' : 'media', t: `Línea sin IVA «${x.linea}»: ${x.motivos.join(' ')}`, art: 'arts. 20 a 25 y 90 LIVA', ef: x.v === 'incorrecta' && b ? r2(b * tGen / 100) : null }; });
  const todas = [...delMotor, ...deExentas, ...inc].sort((a, b) => ({ alta: 0, media: 1, baja: 2 })[a.sev] - ({ alta: 0, media: 1, baja: 2 })[b.sev]);
  const vistos = new Set(), incidencias = todas.filter((x) => { const k = x.t.slice(0, 80); if (vistos.has(k)) return false; vistos.add(k); return true; });
  const hayGraves = incidencias.some((x) => x.sev === 'alta' || x.sev === 'media');
  const efectoTotal = Math.abs(dif) > 0.02 ? Math.abs(dif) : r2(sumRes(incidencias.filter((x) => x.sev === 'alta' && x.ef).map((x) => x.ef)));

  // 8) registro SII propuesto con el desglose por tipo (tipos correctos)
  const desglose = {}; (fiable ? L : []).forEach((l) => { const k = l.isp ? 'ISP' : String(l.tipoC ?? '?'); (desglose[k] ||= { base: 0, cuota: 0 }).base += l.base; if (!l.isp) desglose[k].cuota += l.base * (l.tipoC ?? 0) / 100; });
  const desg = Object.entries(desglose).map(([k, v]) => ({ tipo: k, base: r2(v.base), cuota: r2(v.cuota) }));

  // 9) acciones: rectificativa, correo al proveedor, asiento y fechas
  const acciones = [];
  const hayErrorFactura = incidencias.some((x) => x.sev === 'alta' && x.ef !== null) || Math.abs(dif) > 0.02;
  if (hayErrorFactura) {
    acciones.push({ t: `Pedir al proveedor una factura rectificativa (R1/R4) con ${dif > 0 ? 'la cuota que falta' : 'la cuota corregida'}.`, art: 'art. 15 RD 1619/2012 y art. 80 LIVA', fecha: sii ? `antes del 303 del periodo ${sii.periodo}` : '' });
    acciones.push({ t: recibida ? 'Mientras llega la rectificativa, registrarla en el SII tal como se recibió (F1, cuota que consta) y deducir solo la cuota repercutida; al recibir la rectificativa, registrar la diferencia como rectificativa (R1) y deducir el resto en ese periodo.' : 'Registrar la factura emitida y rectificarla (R1/R4) cuando se corrija.', art: 'art. 61 RIVA', fecha: sii ? dmy(sii.limite) : '' });
  } else acciones.push({ t: recibida ? 'Registrarla en el SII con los datos propuestos y contabilizarla.' : 'Registrar la factura emitida en el SII.', art: '', fecha: sii ? dmy(sii.limite) : '' });
  const gasto = baseCorr ?? F.base, ivaAs = recibida ? (ivaOrig ?? 0) : 0;
  const asiento = recibida && gasto !== null ? [
    { cta: '600 / 62x', d: gasto, h: null, n: 'Compras o gasto (base imponible)' },
    ...(ivaDeducible ? [{ cta: '472', d: ivaDeducible, h: null, n: 'H.P. IVA soportado deducible' }] : []),
    ...(ivaNoDed ? [{ cta: '600 / 62x', d: ivaNoDed, h: null, n: 'IVA no deducible (mayor gasto)' }] : []),
    ...(ivaAutorrep ? [{ cta: '472 / 477', d: ivaAutorrep, h: ivaAutorrep, n: 'IVA autorrepercutido (ISP)' }] : []),
    { cta: '400', d: null, h: r2(gasto + ivaAs - (F.retTipo ? r2(gasto * F.retTipo / 100) : 0)), n: 'Proveedores' },
  ] : [];
  const emailProv = hayErrorFactura ? `Asunto: Solicitud de factura rectificativa · ${F.numero || 'factura'} de ${F.fecha || ''}\n\nBuenos días:\n\nHemos revisado la factura ${F.numero || ''} de fecha ${F.fecha || ''} (base ${F.base !== null ? fmt(F.base) : '—'} €, IVA ${ivaOrig !== null ? fmt(ivaOrig) : '—'} €, total ${totalOrig !== null ? fmt(totalOrig) : '—'} €) y detectamos lo siguiente:\n\n${incidencias.filter((x) => x.sev === 'alta').map((x) => `- ${x.t}${x.art ? ` (${x.art})` : ''}`).join('\n')}\n\nSegún nuestros cálculos, el IVA correcto sería ${ivaCorr !== null ? fmt(ivaCorr) : '—'} € y el total ${totalCorr !== null ? fmt(totalCorr) : '—'} €. Les rogamos que nos remitan una factura rectificativa a la mayor brevedad, para poder registrarla dentro de plazo.\n\nUn saludo.` : '';

  R.X = {
    veredicto: hayGraves ? 'INCIDENCIAS' : 'OK', efectoTotal, fiable, lineas: L, incidencias, preguntas: preg, escenarios,
    importes: { base: F.base, iva: ivaOrig, total: totalOrig, baseC: baseCorr, ivaC: ivaCorr, totalC: totalCorr, dif, metodo, ivaDeducible, ivaNoDed, pro, ivaAutorrep },
    sii, desglose: desg, acciones, asiento, email: emailProv,
  };
  return R;
}
