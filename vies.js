// Comprobación de NIF-IVA europeos contra el censo VIES de la Comisión Europea.
// El VIES no deja que una página web lo llame directamente, así que la consulta pasa por un intermediario gratuito (Cloudflare Worker, carpeta worker-vies) que no guarda nada.
// Los resultados se guardan en un registro «vies» por empresa: { res: { 'FR12345678901': { v: true|false, n: nombre, f: 'AAAA-MM-DD' } } }.
export const URL_VIES = 'https://vies-proxy.olitriguero.workers.dev/';
const PAISES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI'];

export function crearVies({ S, db, esc, render, empresa, grande, puede }) {
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const hoy = () => new Date().toISOString().slice(0, 10);
  const fd = (f) => String(f || '').slice(0, 10).split('-').reverse().join('/');
  const limpiar = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normal = (n) => { const s = limpiar(n); return s.startsWith('GR') ? `EL${s.slice(2)}` : s; }; // Grecia en el VIES es EL
  const esUE = (s) => /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(s) && PAISES.includes(s.slice(0, 2));
  const regVies = () => S.registros.find((r) => r.tipo === 'vies' && r.empresa_id === S.sel);
  const res = () => regVies()?.datos?.res ?? {};
  let enCurso = null; // { hechos, total } mientras se consulta
  let verTodos = false;

  async function guardar(nuevos) {
    const r = regVies(), datos = JSON.parse(JSON.stringify(r?.datos ?? {}));
    datos.res = { ...(datos.res ?? {}), ...nuevos };
    if (r) { const { error } = await db.from('registros').update({ datos }).eq('id', r.id); if (error) return error.message; r.datos = datos; }
    else { const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'vies', ejercicio: null, datos }; const { error } = await db.from('registros').insert(fila); if (error) return error.message; S.registros.push(fila); }
    return null;
  }

  // Consulta un NIF-IVA. Devuelve { v, n } o { err } si el VIES no pudo responder (no cuenta como inválido)
  async function consultaUna(nif) {
    try {
      const r = await fetch(`${URL_VIES}?pais=${nif.slice(0, 2)}&nif=${nif.slice(2)}`);
      const j = await r.json();
      if (typeof j.valid === 'boolean' && !j.errorWrappers && j.actionSucceed !== false) return { v: j.valid, n: j.valid ? String(j.name ?? '').trim() : '' };
      return { err: j.errorWrappers?.[0]?.error ?? j.error ?? 'sin respuesta del VIES' };
    } catch { return { err: 'no se pudo conectar' }; }
  }
  // Errores pasajeros del VIES (país caído, servicio saturado, tiempo agotado): se reintenta hasta 3 veces esperando unos segundos. Los demás (p. ej. formato incorrecto) no.
  const PASAJERO = /UNAVAILABLE|MAX_CONCURRENT|TIMEOUT|BUSY|SERVICE|no se pudo|sin respuesta/i;
  const ESPERAS = [2500, 6000]; // segundos de espera antes del 2.º y del 3.er intento
  async function consultar(nif, espera = (ms) => new Promise((ok) => setTimeout(ok, ms))) {
    let r = await consultaUna(nif);
    for (let i = 0; r.err && PASAJERO.test(r.err) && i < ESPERAS.length; i++) { await espera(ESPERAS[i]); r = await consultaUna(nif); }
    return r;
  }

  // NIF europeos (no españoles) de los libros del ejercicio, con sus líneas
  function nifsLibros() {
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return null;
    const ej = String(S.ejercicio), M = new Map();
    [['Emitidas', E], ['Recibidas', R]].forEach(([lado, lib]) => lib.forEach((l) => {
      if (String(l.fecha ?? '').slice(0, 4) !== ej) return;
      const n = normal(l.nif); if (!esUE(n)) return;
      const g = M.get(n) ?? M.set(n, { nif: n, nombre: l.nombre, lados: new Set(), lineas: 0, base: 0, fecha: '' }).get(n);
      g.lados.add(lado); g.lineas++; g.base += Number(l.base) || 0; if (String(l.fecha) > g.fecha) g.fecha = String(l.fecha);
    }));
    return [...M.values()];
  }

  async function comprobar(lista) {
    if (enCurso || !lista.length) return;
    enCurso = { hechos: 0, total: lista.length, fallos: 0 }; render();
    let lote = {};
    for (const nif of lista) {
      const r = await consultar(nif);
      if (r.err) { enCurso.fallos++; lote[nif] = { e: r.err, f: hoy() }; } else lote[nif] = { v: r.v, n: r.n, f: hoy() };
      enCurso.hechos++;
      if (enCurso.hechos % 10 === 0) { await guardar(lote); lote = {}; render(); }
      await new Promise((ok) => setTimeout(ok, 250));
    }
    const err = Object.keys(lote).length ? await guardar(lote) : null;
    const fin = enCurso; enCurso = null; render();
    if (err) alert(`No se pudieron guardar los resultados: ${err}`);
    else if (fin.fallos) alert(`${fin.fallos} NIF no se pudieron consultar (el VIES de algún país no responde). Vuelve a pulsar «Comprobar pendientes» más tarde.`);
  }

  const estado = (r) => (!r || r.e ? 'pend' : r.v ? 'ok' : 'ko');

  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = nifsLibros();
    if (!L) return '<p class="vacio">Cargando datos…</p>';
    const ej = Number(S.ejercicio), tit = `<h3>NIF-IVA europeos (VIES) · ${esc(empresa()?.nombre ?? '')} · ${ej}</h3>`;
    const intro = '<p class="dash-s" style="font-size:.8rem">Comprueba contra el censo VIES de la Comisión Europea los NIF-IVA de clientes y proveedores de otros países de la UE que aparecen en los libros de IVA del ejercicio. Una entrega exenta a la UE exige que el NIF del cliente esté vigente en el VIES. Cada consulta guarda la fecha; los NIF ya comprobados no se vuelven a consultar salvo que lo pidas.</p>';
    if (!L.length) return `<div class="inicio"><section class="dsec">${tit}${intro}<p class="dash-s"><span class="d-nd">• No hay NIF de otros países de la UE en los libros de ${ej}</span></p></section></div>`;
    const R = res(), est = (n) => estado(R[n]), pend = L.filter((x) => est(x.nif) === 'pend'), ko = L.filter((x) => est(x.nif) === 'ko'), ok = L.filter((x) => est(x.nif) === 'ok');
    const orden = { ko: 0, pend: 1, ok: 2 }, filas = L.slice().sort((a, b) => orden[est(a.nif)] - orden[est(b.nif)] || String(a.nombre).localeCompare(String(b.nombre))).filter((x) => verTodos || est(x.nif) !== 'ok');
    const ed = puede?.() !== false;
    const botones = ed ? `<p><button class="btn" data-act="m-viescomp" ${enCurso || !pend.length ? 'disabled' : ''}>Comprobar pendientes (${pend.length})</button> <button class="small" data-act="m-viesrecomp" ${enCurso ? 'disabled' : ''}>Volver a comprobar todos</button> <button class="small" data-act="m-viesver">${verTodos ? 'Ocultar los válidos' : 'Ver también los válidos'}</button></p>` : '';
    const prog = enCurso ? `<p class="dash-s"><span class="d-nd">• Consultando… ${enCurso.hechos} de ${enCurso.total}</span></p>` : '';
    const celda = (x) => {
      const r = R[x.nif], e = est(x.nif);
      if (e === 'ok') return `<span class="d-ok">✓ Válido</span> <span class="hint">${esc(fd(r.f))}</span>`;
      if (e === 'ko') return `<span class="d-ko">✖ No figura en el VIES</span> <span class="hint">${esc(fd(r.f))}</span>`;
      return `<span class="d-nd">• ${r?.e ? `Sin respuesta (${esc(r.e)})` : 'Sin comprobar'}</span>`;
    };
    return `<div class="inicio"><section class="dsec">${tit}${intro}
      <p class="dash-s">${ko.length ? `<span class="d-ko">${ko.length} NIF no figuran en el VIES</span> · ` : ''}${pend.length ? `<span class="d-nd">${pend.length} sin comprobar</span> · ` : ''}<span class="d-ok">${ok.length} válidos</span> · ${L.length} NIF europeos</p>
      ${botones}${prog}
      ${filas.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>NIF-IVA</th><th>Nombre en los libros</th><th>Nombre en el VIES</th><th>Libro</th><th>Líneas</th><th>Base ${ej}</th><th>Última factura</th><th>Estado</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
      ${filas.map((x) => `<tr><td>${esc(x.nif)}</td><td>${esc(x.nombre)}</td><td>${esc(R[x.nif]?.n ?? '')}</td><td>${esc([...x.lados].join(' y '))}</td><td style="text-align:right">${x.lineas}</td><td style="text-align:right">${money(x.base)}</td><td>${esc(fd(x.fecha))}</td><td>${celda(x)}</td>${ed ? `<td><button class="small" data-act="m-viesuno" data-k="${esc(x.nif)}" ${enCurso ? 'disabled' : ''}>Consultar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="dash-s"><span class="d-ok">✓ Todos los NIF europeos están comprobados y son válidos</span></p>'}
      <p class="hint">«No figura en el VIES» significa que el censo no lo reconoce como operador intracomunitario en la fecha de la consulta: revisa el NIF con el cliente o proveedor antes de aplicar la exención. Si el VIES de un país no responde, el NIF queda «sin respuesta» y se reintenta con el botón.</p></section></div>`;
  }

  return {
    tabs: { vies: ['NIF-IVA europeos (VIES)', 'Comprobación de NIF de la UE contra el censo VIES', vista] },
    _t: { consultar },
    acciones: {
      'm-viescomp': () => { const L = nifsLibros() ?? []; comprobar(L.filter((x) => estado(res()[x.nif]) === 'pend').map((x) => x.nif)); },
      'm-viesrecomp': () => { const L = nifsLibros() ?? []; if (L.length && confirm(`Se volverán a consultar los ${L.length} NIF al VIES. ¿Continuar?`)) comprobar(L.map((x) => x.nif)); },
      'm-viesuno': (d) => comprobar([d.k]),
      'm-viesver': () => { verTodos = !verTodos; render(); },
    },
  };
}
