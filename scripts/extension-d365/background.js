// Extensión «Herogra · abrir factura en D365»: la aplicación (https://pablooliva78.github.io) le manda {tipo:'fac', num, cmp} y esta abre, en una pestaña de TU Chrome,
// el diario de facturas de D365 de esa empresa, filtra la factura y abre la vista previa del original, con clics reales (chrome.debugger).
// Mientras trabaja, Chrome enseña el aviso «… está depurando este navegador»; desaparece al terminar. Se reutiliza siempre la misma pestaña.
import { abrirFactura } from './flujo.js';

const D365 = 'https://herogra.operations.dynamics.com/';
const ORIGEN = 'https://pablooliva78.github.io';
let ocupado = false;

async function pestanaDe(cmp) {
  const { pestanaId } = await chrome.storage.session.get('pestanaId');
  const url = `${D365}?cmp=${cmp}&mi=CustInvoiceJournal`;
  if (pestanaId) {
    try {
      const t = await chrome.tabs.get(pestanaId);
      if (t?.url && new RegExp(`cmp=${cmp}(&|$)`, 'i').test(t.url) && /CustInvoiceJournal/i.test(t.url)) return { id: t.id, nueva: false };
      await chrome.tabs.update(pestanaId, { url, active: true }); // otra empresa: se carga su diario en la misma pestaña
      return { id: pestanaId, nueva: true };
    } catch { /* la pestaña se cerró: se abre otra */ }
  }
  const t = await chrome.tabs.create({ url, active: true });
  await chrome.storage.session.set({ pestanaId: t.id });
  return { id: t.id, nueva: true };
}

async function abrir(num, cmp) {
  if (ocupado) throw new Error('ya hay una factura abriéndose');
  ocupado = true;
  const latido = setInterval(() => chrome.runtime.getPlatformInfo(), 20000); // mantiene vivo el servicio mientras dura el proceso
  let id = null;
  try {
    const p = await pestanaDe(cmp); id = p.id;
    const t = await chrome.tabs.update(id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
    await chrome.debugger.attach({ tabId: id }, '1.3');
    const send = (metodo, params) => chrome.debugger.sendCommand({ tabId: id }, metodo, params);
    return await abrirFactura(send, num);
  } finally {
    clearInterval(latido);
    if (id !== null) await chrome.debugger.detach({ tabId: id }).catch(() => {});
    ocupado = false;
  }
}

chrome.runtime.onMessageExternal.addListener((msg, remitente, responder) => {
  if (!remitente?.origin || remitente.origin !== ORIGEN) { responder({ ok: false, error: 'origen no permitido' }); return; }
  if (msg?.tipo === 'estado') { responder({ ok: true, version: chrome.runtime.getManifest().version }); return; }
  if (msg?.tipo !== 'fac' || !/^[\w./ -]{1,40}$/.test(String(msg.num || '')) || !/^[A-Z]{2,5}$/.test(String(msg.cmp || ''))) { responder({ ok: false, error: 'datos no válidos' }); return; }
  responder({ ok: true, aceptado: true }); // respuesta inmediata: el proceso tarda unos segundos y sigue por su cuenta
  abrir(String(msg.num), String(msg.cmp)).then((r) => console.log('factura', msg.num, r ? 'abierta' : 'no encontrada'), (e) => console.warn('factura', msg.num, e.message));
});
