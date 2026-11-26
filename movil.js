// Versión para móvil y tablet: solo se activa en pantallas táctiles pequeñas (en el ordenador no hace nada).
// Pone las clases «movil» (y «tel» o «tab») en <html> para movil.css, y añade el botón ☰ que abre el menú lateral. No toca ninguna pestaña ni dato.
(() => {
  const raiz = document.documentElement;
  const forzado = () => { try { return localStorage.getItem('imp-movil'); } catch { return null; } };
  const tactil = window.matchMedia('(pointer: coarse)');
  // el lado corto de la pantalla distingue teléfono (< 600) de tablet (hasta 1100); un ordenador táctil con pantalla grande queda fuera
  function aplicar() {
    const corto = Math.min(window.screen.width, window.screen.height), f = forzado();
    const es = f === 'no' ? false : f === 'si' || (tactil.matches && corto <= 1100);
    raiz.classList.toggle('movil', es);
    raiz.classList.toggle('tel', es && Math.min(corto, window.innerWidth) < 600);
    raiz.classList.toggle('tab', es && !raiz.classList.contains('tel'));
    if (!es) raiz.classList.remove('menu-abierto');
  }
  const boton = document.createElement('button');
  boton.type = 'button'; boton.id = 'movMenu'; boton.className = 'no-print'; boton.setAttribute('aria-label', 'Abrir o cerrar el menú'); boton.textContent = '☰';
  const velo = document.createElement('div'); velo.id = 'movVelo'; velo.className = 'no-print';
  document.body.append(velo, boton);
  const menu = (abrir) => { raiz.classList.toggle('menu-abierto', abrir); boton.textContent = abrir ? '✕' : '☰'; };
  boton.addEventListener('click', (ev) => { ev.stopPropagation(); menu(!raiz.classList.contains('menu-abierto')); });
  velo.addEventListener('click', () => menu(false));
  // al elegir un bloque o una pestaña desde el menú, se cierra
  document.addEventListener('click', (ev) => { if (raiz.classList.contains('menu-abierto') && ev.target.closest?.('.lat [data-tab], .lat [data-grp], .lat #out')) menu(false); }, true);
  // el botón solo se ve cuando hay menú (no en la pantalla de acceso)
  const hayMenu = () => raiz.classList.toggle('con-menu', !!document.querySelector('#app .lat'));
  // tras cada redibujado, la pestaña abierta queda a la vista en la fila que se desliza
  const verActiva = () => { if (!raiz.classList.contains('movil')) return; const p = document.querySelector('#app .tpills > .tpill.on'); if (p) p.parentElement.scrollLeft = p.offsetLeft - (p.parentElement.clientWidth - p.offsetWidth) / 2; };
  new MutationObserver(() => { hayMenu(); requestAnimationFrame(verActiva); }).observe(document.getElementById('app'), { childList: true });
  window.addEventListener('resize', aplicar);
  window.addEventListener('orientationchange', aplicar);
  tactil.addEventListener?.('change', aplicar);
  aplicar(); hayMenu();
})();
