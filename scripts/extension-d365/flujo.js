// Pasos para abrir en D365 la vista previa del original de una factura emitida, con clics y teclas REALES (CDP: Input.dispatch…).
// Lo usa la extensión de Chrome (background.js, vía chrome.debugger) y las pruebas de Node (vía una sesión CDP): `send(método, parámetros)` es lo único que necesita.
export async function abrirFactura(send, num, { log = () => {}, esperaMax = 90000 } = {}) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r?.result?.value; };
  const esperar = async (expr, ms = 20000, paso = 200) => { const t0 = Date.now(); for (;;) { const v = await ev(expr).catch(() => undefined); if (v) return v; if (Date.now() - t0 > ms) return null; await dormir(paso); } };
  // centro de un elemento visible: la expresión devuelve el elemento (o null)
  const centro = (elemento) => `(() => { const e = (${elemento}); if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`;
  const clic = async (elemento, ms = 15000) => {
    const p = await esperar(centro(elemento), ms); if (!p) return false;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    return true;
  };
  const teclear = async (texto) => { for (const ch of texto) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await dormir(10); } };
  const ctrlA = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, commands: ['selectAll'] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 }); };
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; })`;
  const celdaFactura = visible('input[aria-label="Factura"]'); // si la pestaña se reutiliza, el DOM guarda formularios anteriores (ocultos): siempre el visible

  // que la página crea que tiene el foco aunque la ventana no lo tenga (si no, a veces las teclas no llegan al campo)
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  // 0) si la pestaña se reutiliza y está en la vista previa de la factura anterior, se vuelve al diario (sin recargar D365)
  if (await ev(`/Mostrar la factura/i.test(document.title)`)) { await clic(visible('button[id$="_SystemDefinedCloseButton"]'), 8000); await dormir(800); }
  // 1) diario de facturas cargado (hay filtro rápido y cuadrícula)
  if (!(await esperar(`!!document.querySelector('input[name=QuickFilter_Input]') && !!(${celdaFactura})`, 120000))) throw new Error('El diario de facturas de D365 no ha cargado');
  await dormir(150);
  // 2) cabecera «Factura» → desplegable → «es exactamente» → número → Aplicar
  const cabecera = `[...document.querySelectorAll('[role=columnheader]')].find((x) => /^Factura(\\s|$)/.test((x.innerText || x.getAttribute('aria-label') || '').trim()) && x.getBoundingClientRect().width > 2)`;
  const campo = visible('input[role=combobox][aria-label*="Campo de filtro: Factura"]');
  const botonAplicar = `[...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Aplicar' && b.getBoundingClientRect().width > 2)`;
  if (!(await clic(cabecera))) throw new Error('No encuentro la cabecera «Factura»');
  if (!(await esperar(centro(campo), 10000))) throw new Error('No se abrió el desplegable del filtro');
  for (let i = 0; i < 4; i++) { // D365 a veces se come las primeras letras: se comprueba lo escrito
    await clic(campo); await dormir(150); await ctrlA(); await teclear(num); await dormir(100);
    let v = await ev(`(${campo})?.value`);
    if (v !== num) { // si las teclas no llegaron, se inserta el texto de golpe sobre el campo seleccionado
      await ev(`(() => { const c = ${campo}; if (c) { c.focus(); c.select(); } })()`);
      await send('Input.insertText', { text: num }); await dormir(300);
      v = await ev(`(${campo})?.value`);
    }
    if (v === num) break;
    log(`texto del filtro incorrecto, se repite (intento ${i + 1})`);
  }
  if (!(await clic(botonAplicar))) throw new Error('No encuentro «Aplicar»');
  // 3) la búsqueda no es inmediata: se espera a que la primera fila sea esa factura
  if (!(await esperar(`(${celdaFactura})?.value === ${JSON.stringify(num)}`, 40000, 100))) { log(`Factura ${num} no encontrada`); return false; }
  await dormir(150);
  await clic(celdaFactura); // selecciona la fila
  await dormir(150);
  // 4) Factura › Documento › Ver › Vista previa de original
  const ver = visible('button[id$="_View_button"]');
  const pestana = visible('button[id$="_Invoice_button"]');
  const original = `[...document.querySelectorAll('[name=SalesInvoiceOriginal], button, [role=menuitem]')].find((x) => (x.innerText || '').trim() === 'Vista previa de original' && x.getBoundingClientRect().width > 2)`;
  let menu = false;
  for (let i = 0; i < 5 && !menu; i++) { // la cinta de D365 tarda en asentarse: esperas cortas y se reintenta enseguida
    if (!(await esperar(centro(ver), 700))) { await clic(pestana, 3000); await esperar(centro(ver), 3000); }
    if (await clic(ver, 3000) && (await esperar(centro(original), 2500, 100))) menu = true; else { log(`cinta de D365 aún no lista, se repite (intento ${i + 1})`); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }); await dormir(400); }
  }
  if (!menu) throw new Error('No se pudo abrir el menú Ver de D365');
  await clic(original);
  // 5) visor del PDF (si D365 se queda en «Procesando operación…», se cancela y se pide otra vez)
  const hayVisor = `!!document.querySelector('iframe[src*="pdfjs/web/viewer"]') || /Mostrar la factura/i.test(document.title)`;
  for (let intento = 1; intento <= 2; intento++) {
    if (await esperar(hayVisor, Math.min(esperaMax, 60000), 200)) return true;
    if (intento === 1) {
      log('la vista previa tarda más de 60 s: se cancela y se repite');
      await clic(`[...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Cancelar' && b.getBoundingClientRect().width > 2)`, 3000);
      await dormir(1500);
      if (await clic(ver, 5000)) { await esperar(centro(original), 6000); await clic(original, 3000); }
    }
  }
  throw new Error('D365 no abrió la vista previa de la factura');
}
