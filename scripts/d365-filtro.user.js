// ==UserScript==
// @name         Gestión fiscal -> D365: buscar proveedor/cliente
// @namespace    herogra-gestion
// @version      1.0
// @description  Cuando la app abre D365 con #cuenta=XXXXX, escribe la cuenta en el filtro de la lista de proveedores o clientes y deja el registro seleccionado.
// @match        https://herogra.operations.dynamics.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  // true = tras filtrar deja el foco en el botón «Transacciones» (solo hay que pulsar Intro); false = no toca el foco
  const DEJAR_FOCO_EN_TRANSACCIONES = true;
  const m = /[#&]cuenta=([^&]+)/.exec(location.hash); if (!m) return;
  const cuenta = decodeURIComponent(m[1]);
  const esperar = (fn, ms = 30000) => new Promise((ok, ko) => { const t0 = Date.now(), i = setInterval(() => { const r = fn(); if (r) { clearInterval(i); ok(r); } else if (Date.now() - t0 > ms) { clearInterval(i); ko(new Error('tiempo agotado')); } }, 250); });
  const poner = (inp, v) => {
    inp.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    for (const t of ['keydown', 'keypress', 'keyup']) inp.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  };
  window.addEventListener('load', async () => {
    try {
      const inp = await esperar(() => [...document.querySelectorAll('input')].find((i) => i.offsetParent && i.name && /QuickFilterControl\d*_Input$/.test(i.name)));
      await new Promise((r) => setTimeout(r, 1200)); // deja que la lista termine de cargar
      poner(inp, cuenta);
      if (DEJAR_FOCO_EN_TRANSACCIONES) {
        // D365 ignora los clics y teclas simulados, pero un Intro REAL sobre un botón con el foco sí lo pulsa:
        // se deja el foco en «Transacciones» (se reintenta unos segundos por si D365 se lo quita) y solo hay que pulsar Intro.
        await new Promise((r) => setTimeout(r, 2500));
        for (let i = 0; i < 8; i++) {
          const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent && e.textContent.trim() === 'Transacciones');
          if (b && document.activeElement !== b) b.focus();
          await new Promise((r) => setTimeout(r, 700));
        }
      }
    } catch (e) { console.warn('[D365 filtro]', e.message); }
  });
})();
