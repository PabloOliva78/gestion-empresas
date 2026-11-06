// Lectura del PDF del modelo 200 presentado: cada página con sus líneas, casillas e importes (estructura200), las bases imponibles negativas (leerBinPdf)
// y la liquidación (casLiquidacion200). Copiado de la aplicación antigua; trabaja sobre las páginas de `leerPdf` ({x, y, str} por texto).
const RX_IMP = /^\(?-?\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})\)?-?$|^-?\d+,\d{2}$/;
const r2 = (x) => Math.round((Number(x) || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100 + 0;
const parseNum = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const v = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t); return Number.isNaN(v) ? null : v; };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// páginas de pdf.js → líneas (textos de la misma altura, de izquierda a derecha), como textoPdf de la antigua
export function lineasDePags(pags) {
  const lineas = [];
  pags.forEach((items, pi) => {
    const its0 = items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str.trim(), x: i.x, y: Math.round(i.y), w: 0 }));
    const porY = new Map();
    its0.forEach((it) => { let k = [...porY.keys()].find((y) => Math.abs(y - it.y) <= 3); if (k === undefined) { k = it.y; porY.set(k, []); } porY.get(k).push(it); });
    [...porY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, its]) => { its.sort((a, b) => a.x - b.x); its.pag = pi + 1; lineas.push(its); });
  });
  return lineas;
}

export function estructura200(lineas) {
  const RXC = /^0\d{4}$/, paginas = []; let actual = null, pagNum = 0;
  lineas.forEach((its, li) => {
    if (its.pag !== pagNum) { pagNum = its.pag; actual = { pag: String(pagNum), n: pagNum, filas: [] }; paginas.push(actual); }
    const tx = its.map((t) => t.s).join(' '), mp = tx.match(/P[áa]gina\s+(\d+(?:\s+(?:bis|ter|quater|quinquies|sexies|septies|octies))?)\b/i);
    if (mp && !actual.fija && /^\s*200\b|\bB\d{8}|^P[áa]gina/.test(tx)) { actual.pag = mp[1]; actual.fija = true; }
    const idx = its.map((t, j) => (RXC.test(t.s) ? j : -1)).filter((j) => j >= 0); if (!idx.length) return;
    let lab = its.slice(0, idx[0]).map((t) => t.s).join(' ').replace(/\.{2,}.*$/, '').replace(/\s+/g, ' ').trim().replace(/[ .]+$/, '');
    if (lab.length < 3 && li > 0) { const pv = lineas[li - 1]; if (pv.pag === its.pag && !pv.some((t) => RXC.test(t.s))) lab = pv.map((t) => t.s).join(' ').replace(/\.{2,}.*$/, '').trim(); }
    const cas = idx.map((j, k) => {
      const fin = k + 1 < idx.length ? idx[k + 1] : its.length; let v = null;
      for (let q = j + 1; q < fin; q++) {
        if (RX_IMP.test(its[q].s)) { v = parseNum(its[q].s.replace(/[()]/g, '')); if (/^\(.*\)$/.test(its[q].s)) v = -Math.abs(v); const pr = its[q - 1]; if (pr && /^[-−–]$/.test(pr.s) && v > 0) v = -v; break; }
      }
      if (v === null && k === idx.length - 1) {
        for (const sig of [lineas[li - 1], lineas[li + 1]].filter(Boolean)) {
          if (sig.pag !== its.pag || sig.some((t) => RXC.test(t.s))) break; // importe en la línea de abajo, a la derecha de la casilla
          const o = sig.find((t) => RX_IMP.test(t.s) && t.x > its[j].x - 5 && Math.abs(t.y - its[j].y) <= 6); if (o) { v = parseNum(o.s.replace(/[()]/g, '')); break; }
        }
      }
      return [its[j].s, v];
    });
    actual.filas.push([lab.slice(0, 200), cas]);
  });
  return paginas.filter((p) => p.filas.length);
}

// páginas de la liquidación (12 a 14 bis): ahí están la base imponible, la cuota y el resultado
export function casLiquidacion200(est) {
  const o = {};
  (est || []).filter((p) => /^(12|13|14)( bis)?$/.test(p.pag)).forEach((p) => p.filas.forEach(([, cs]) => cs.forEach(([c, v]) => { if (v !== null) o[String(+c)] = v; })));
  return o;
}

// bases imponibles negativas de ejercicios anteriores: [{y, ini, apl, fut}]
export function leerBinPdf(lineas, ej) {
  const ini = lineas.findIndex((its) => /bases? imponibles? negativas?/.test(norm(its.map((t) => t.s).join(' '))));
  if (ini < 0) return [];
  const out = [], vistos = new Set(); let sinFila = 0;
  for (let li = ini; li < lineas.length && sinFila < 12; li++) {
    const its = lineas[li];
    const iy = its.findIndex((t) => /^(19|20)\d{2}$/.test(t.s.trim()));
    const imps = its.filter((t, j) => j > iy && RX_IMP.test(t.s)).map((t) => parseNum(t.s.replace(/[()]/g, '')));
    if (iy >= 0 && iy <= 1 && imps.length >= 2) {
      const y = +its[iy].s.trim();
      if ((!ej || (y < ej && y >= ej - 40)) && !vistos.has(y)) {
        vistos.add(y);
        const [a, b, c] = imps.length >= 3 ? imps : [imps[0], 0, imps[1]];
        out.push({ y, ini: r2(a || 0), apl: r2(b || 0), fut: r2(c || 0) });
      }
      sinFila = 0;
    } else if (out.length) sinFila++;
  }
  return out.sort((a, b) => a.y - b.y);
}

// 00621 (líquido a ingresar o devolver) = resultado de la autoliquidación (01586) o, si no está, cuota diferencial (00611)
export function revisar200(cas) {
  const ref = cas['1586'] !== undefined ? cas['1586'] : cas['611'];
  if (ref !== undefined && (cas['621'] === undefined || Math.abs(cas['621'] - ref) >= 0.01)) cas['621'] = ref;
  return cas;
}

// todo lo que se guarda en Presentados para un 200 leído: {cuota, res, est200, bin}
export function leer200(pags, ej) {
  const L = lineasDePags(pags), est200 = estructura200(L), cas = revisar200(casLiquidacion200(est200)), bin = leerBinPdf(L, ej);
  return { cuota: cas['562'], res: cas['621'], est200, bin };
}
