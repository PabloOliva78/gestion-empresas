// Herramientas del armazón (fuera de las pestañas): exportar la pestaña abierta a Excel o PDF y aviso de sesión a punto de caducar.
// No modifica ninguna pestaña: lee lo que hay en pantalla.

// ---------- Exportar la pestaña abierta ----------
export function activarExportar() {
  const NUM = /^-?\d{1,3}(?:\.\d{3})*,\d+$|^-?\d+,\d+$/;
  const celdaTxt = (c) => {
    const i = c.querySelector('input:not([type=checkbox]):not([type=hidden]),textarea');
    if (i) return i.value;
    const s = c.querySelector('select');
    if (s) return s.options[s.selectedIndex]?.text ?? '';
    const k = c.querySelector('input[type=checkbox]');
    if (k) return k.checked ? 'Sí' : 'No';
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const valor = (t) => (NUM.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : t);
  // filas de una tabla (las columnas combinadas se expanden con celdas vacías para no descuadrar)
  const filasDe = (tabla) => [...tabla.rows].filter((r) => r.offsetParent !== null || r.getClientRects().length).map((r) => {
    const f = [];
    for (const c of r.cells) { f.push(valor(celdaTxt(c))); for (let k = 1; k < (c.colSpan || 1); k++) f.push(''); }
    return f;
  }).filter((f) => f.some((x) => x !== ''));
  const titulo = (tabla) => {
    let el = tabla.closest('.wrap') ?? tabla;
    for (let n = 0; el && n < 6; n++) {
      let p = el.previousElementSibling;
      while (p) { const h = p.matches?.('h3,h4,.prs-h,.css-4760-t,.it-sec,.cu-t,.aud-tit') ? p : p.querySelector?.('h3,h4,.prs-h,.css-4760-t,.it-sec,.cu-t'); if (h && h.textContent.trim()) return h.textContent.replace(/\s+/g, ' ').trim(); p = p.previousElementSibling; }
      el = el.parentElement;
      if (el?.classList?.contains('vista')) break;
    }
    return '';
  };
  const limpia = (s) => s.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  function excel() {
    const vista = document.querySelector('.vista');
    if (!vista) return void alert('No hay ninguna pestaña abierta.');
    const tablas = [...vista.querySelectorAll('table')].filter((t) => t.rows.length > 1 && !t.parentElement.closest('table')); // solo las tablas de primer nivel
    if (!tablas.length) return void alert('Esta pestaña no tiene ninguna tabla que exportar.');
    const nombre = (document.querySelector('.tab-tit')?.firstChild?.textContent ?? 'pestaña').trim(), emp = document.querySelector('.sel-btn span')?.textContent.trim() ?? '';
    const fich = `${nombre} ${emp} ${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (window.XLSX) {
      const wb = window.XLSX.utils.book_new(), usados = new Set();
      tablas.forEach((t, i) => {
        let n = limpia(titulo(t)) || `Tabla ${i + 1}`; const base = n; for (let k = 2; usados.has(n); k++) n = `${base.slice(0, 28)} ${k}`;
        usados.add(n); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(filasDe(t)), n);
      });
      return void window.XLSX.writeFile(wb, `${fich}.xlsx`);
    }
    // sin la librería de Excel: CSV de la primera tabla
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + filasDe(tablas[0]).map((f) => f.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: `${fich}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-exportar]'); if (!b) return;
    if (b.dataset.exportar === 'xlsx') excel(); else window.print(); // el PDF se guarda desde el diálogo de imprimir (destino «Guardar como PDF»); la barra lateral no sale en la impresión
  });
}

// ---------- Aviso de sesión a punto de caducar ----------
export function activarAvisoSesion(inactividadMs = 15 * 60 * 1000, avisoMs = 60 * 1000) {
  let ultima = Date.now(), caja = null;
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { ultima = Date.now(); quitar(); }, { passive: true }));
  const quitar = () => { if (caja) { caja.remove(); caja = null; } };
  setInterval(() => {
    const falta = inactividadMs - (Date.now() - ultima);
    if (!document.querySelector('.layout') || falta > avisoMs || falta <= 0) return void quitar();
    if (!caja) {
      caja = Object.assign(document.createElement('div'), { className: 'aviso-sesion no-print' });
      caja.setAttribute('role', 'alert');
      document.body.appendChild(caja);
    }
    caja.innerHTML = `Tu sesión se cerrará en <b>${Math.ceil(falta / 1000)} s</b> por inactividad. Mueve el ratón o pulsa una tecla para seguir.`;
  }, 1000);
}
