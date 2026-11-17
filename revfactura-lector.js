// Lector de facturas para «Revisión factura AEAT»: capa de texto del PDF y, si no basta, OCR reforzado (más resolución, grises + contraste, giros y varios modos de página).
// Devuelve el texto y un diagnóstico de lo que se ha hecho, para que un fallo nunca sea mudo. Todo ocurre en el navegador; no se sube nada.
const util = (s) => (String(s ?? '').match(/[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/g) || []).length;

function filasDeItems(items) { // agrupa los trozos de texto por fila (misma altura) y los ordena de izquierda a derecha
  const f = new Map();
  for (const i of items) { if (!i.str || !i.str.trim()) continue; const k = Math.round(i.transform[5] / 3); (f.get(k) ?? f.set(k, []).get(k)).push({ x: i.transform[4], s: i.str }); }
  return [...f.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v.sort((a, b) => a.x - b.x).map((z) => z.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Lienzo con la página (o imagen) ampliada, en grises y con el contraste estirado; giro en grados (0, 90, 180, 270)
function preparar(origen, ancho, alto, giro, realzar) {
  const g = giro % 180 !== 0, cv = document.createElement('canvas');
  cv.width = g ? alto : ancho; cv.height = g ? ancho : alto;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.save(); cx.translate(cv.width / 2, cv.height / 2); cx.rotate(giro * Math.PI / 180); cx.drawImage(origen, -ancho / 2, -alto / 2, ancho, alto); cx.restore();
  if (realzar) {
    const im = cx.getImageData(0, 0, cv.width, cv.height), d = im.data, h = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = y; h[y]++; }
    const tot = d.length / 4; let a = 0, lo = 0, hi = 255; for (let i = 0; i < 256; i++) { a += h[i]; if (a > tot * 0.01) { lo = i; break; } } a = 0; for (let i = 255; i >= 0; i--) { a += h[i]; if (a > tot * 0.01) { hi = i; break; } }
    const k = hi > lo + 20 ? 255 / (hi - lo) : 1; for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = v; }
    cx.putImageData(im, 0, 0);
  }
  return cv;
}

export async function leerFactura(file, { cargarOcr, aviso }) {
  const diag = [], dec = (m) => aviso?.(m);
  const esImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
  let doc = null, capa = '', paginas = 1;
  if (!esImg) {
    const lib = window.pdfjsLib; if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js): recarga la página.');
    lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; paginas = doc.numPages;
    const pp = []; for (let p = 1; p <= doc.numPages; p++) pp.push(filasDeItems((await (await doc.getPage(p)).getTextContent()).items).join('\n'));
    capa = pp.join('\n');
    diag.push(`capa de texto del PDF: ${util(capa)} caracteres en ${paginas} página(s)`);
    if (util(capa) >= 120 * paginas) return { texto: capa, diag: diag.join(' · '), via: 'texto' };
  }
  // ---- OCR ----
  dec('Leyendo la factura con OCR…'); await cargarOcr();
  const w = await window.Tesseract.createWorker('spa'), partes = []; let miniatura = '';
  const leer = async (cv, psm) => { if (psm) await w.setParameters({ tessedit_pageseg_mode: String(psm) }); return (await w.recognize(cv)).data.text || ''; };
  try {
    for (let p = 1; p <= paginas; p++) {
      dec(`Leyendo la factura con OCR (página ${p} de ${paginas})…`);
      const pg = esImg ? null : await doc.getPage(p), tr = [];
      let mejor = { t: '', n: -1, desc: '' };
      const anota = (desc, t) => { const n = util(t); tr.push(`${desc}=${n}`); if (n > mejor.n) mejor = { t, n, desc }; return n; };
      const intento = async (desc, fn) => { try { return anota(desc, await fn()); } catch (e) { tr.push(`${desc}=error(${String(e.message || e).slice(0, 40)})`); return 0; } };
      // 1) método clásico (escala 2, lienzo sin tocar): es el que ya leía bien los DUA
      let cv2 = null, bmp = null;
      if (esImg) { bmp = await createImageBitmap(file); cv2 = document.createElement('canvas'); const k = Math.max(1, Math.min(2, 2400 / Math.max(bmp.width, bmp.height))); cv2.width = Math.round(bmp.width * k); cv2.height = Math.round(bmp.height * k); cv2.getContext('2d').drawImage(bmp, 0, 0, cv2.width, cv2.height); }
      else { const vp = pg.getViewport({ scale: 2 }); cv2 = document.createElement('canvas'); cv2.width = vp.width; cv2.height = vp.height; await pg.render({ canvasContext: cv2.getContext('2d'), viewport: vp }).promise; }
      if (p === 1) { try { const m = document.createElement('canvas'), k = 700 / cv2.width; m.width = 700; m.height = Math.round(cv2.height * k); const mx = m.getContext('2d'); mx.fillStyle = '#fff'; mx.fillRect(0, 0, m.width, m.height); mx.drawImage(cv2, 0, 0, m.width, m.height); miniatura = m.toDataURL('image/jpeg', 0.6); } catch { /* sin miniatura */ } }
      let n = await intento('clásico', () => leer(cv2, 0));
      // 2) reforzado: más resolución, grises y contraste, otros modos y giros
      if (n < 150) {
        let origen = cv2, ancho = cv2.width, alto = cv2.height;
        if (!esImg) { try { const v1 = pg.getViewport({ scale: 1 }), sc = Math.max(2, Math.min(3, 3400 / Math.max(v1.width, v1.height))), vp = pg.getViewport({ scale: sc }), base = document.createElement('canvas'); base.width = Math.round(vp.width); base.height = Math.round(vp.height); const bx = base.getContext('2d'); bx.fillStyle = '#fff'; bx.fillRect(0, 0, base.width, base.height); await pg.render({ canvasContext: bx, viewport: vp }).promise; origen = base; ancho = base.width; alto = base.height; } catch { /* se sigue con la de escala 2 */ } }
        const pr = (giro, realzar, psm) => intento(`giro${giro}${realzar ? '+contraste' : ''} modo${psm}`, () => leer(preparar(origen, ancho, alto, giro, realzar), psm));
        n = await pr(0, true, 3);
        if (n < 150) n = await pr(0, false, 3);
        if (n < 150) n = await pr(0, true, 6);
        if (n < 150) n = await pr(0, true, 11);
        if (n < 150) for (const g of [90, 270, 180]) { n = await pr(g, true, 3); if (n >= 150) break; }
      }
      diag.push(`OCR página ${p}: ${mejor.n} caracteres [${tr.join(', ')}]`); partes.push(mejor.t);
    }
  } finally { await w.terminate(); }
  const ocr = partes.join('\n');
  // si el PDF tenía algo de texto y el OCR no mejora, se queda con lo más largo
  const texto = util(ocr) >= util(capa) ? ocr : capa;
  return { texto, diag: diag.join(' · '), via: 'ocr', miniatura };
}
