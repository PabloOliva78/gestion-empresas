// Tareas programadas (bloque 11 · Administración): comprueba si se han ejecutado las tareas automáticas de Windows (descarga de libros de IVA y de cuentas de D365,
// copia de seguridad de la base de datos, Intrastat). Lo pregunta al servicio local del PC (servidor-d365.js, /tareas), así que solo funciona desde el PC donde corren las tareas.
// Pestaña nueva, solo administradores; no toca ninguna otra pestaña.
export function crearTareas({ esc, render }) {
  const LOCAL = 'http://127.0.0.1:47831';
  // días de margen para dar una tarea por atrasada (null = no se juzga: solo se informa)
  const TAREAS = {
    'Libros IVA D365 semanal': { desc: 'Descarga los libros de IVA de todas las empresas desde D365', cuando: 'Lunes 08:00', dias: 8 },
    'Cuentas contables D365 semanal': { desc: 'Descarga los mayores de las cuentas de impuestos desde D365', cuando: 'Lunes 09:00', dias: 8 },
    'Copia de seguridad BD semanal': { desc: 'Copia de toda la base de datos a Google Drive y comprobación de que se puede restaurar', cuando: 'Domingo 21:00', dias: 8 },
    'Intrastat D365 mensual (dia 4)': { desc: 'Descarga el Intrastat del mes', cuando: 'Día 4 de cada mes, 09:00', dias: 35 },
    'Intrastat D365 mensual (reintento dia 5)': { desc: 'Reintento del Intrastat si el día 4 no se pudo', cuando: 'Día 5 de cada mes, 09:00', dias: null },
    'Servidor D365 local': { desc: 'Servicio del PC que conecta la web con D365 y con estos avisos', cuando: 'Al iniciar sesión en Windows', dias: null },
  };
  const E = { cargando: false, datos: null, error: '', cuando: 0 };

  async function cargar() {
    if (E.cargando || (E.datos && Date.now() - E.cuando < 60000)) return;
    E.cargando = true; E.error = ''; render();
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 25000);
      const r = await fetch(`${LOCAL}/tareas`, { signal: c.signal }); clearTimeout(t);
      if (!r.ok) throw new Error(`El servicio contestó ${r.status}`);
      E.datos = await r.json(); E.cuando = Date.now();
    } catch (e) { E.datos = null; E.error = e.name === 'AbortError' ? 'El servicio del PC no contestó a tiempo.' : 'No se pudo hablar con el servicio local del PC (127.0.0.1).'; }
    E.cargando = false; render();
  }

  const fecha = (s) => { if (!s) return '—'; const d = new Date(s); return `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`; };
  const hace = (s) => { const m = Math.round((Date.now() - Date.parse(s)) / 60000); if (m < 60) return `hace ${Math.max(m, 0)} min`; if (m < 2880) return `hace ${Math.round(m / 60)} h`; return `hace ${Math.round(m / 1440)} días`; };

  // estado de una tarea: [clase, texto]
  function estado(t, def) {
    const nunca = !t.l || /^19(99|00)|^0001/.test(t.l);
    if (t.e === 'Running') return ['d-ok', '⏳ En marcha ahora'];
    if (t.e === 'Disabled') return ['d-ko', '⛔ Desactivada'];
    if (nunca) return def?.dias == null && !/Servidor/.test(t.n) ? ['dash-s', 'Aún no ha hecho falta'] : ['dash-s', /Servidor/.test(t.n) ? '✓ Activo' : 'Todavía no se ha ejecutado'];
    const dias = (Date.now() - Date.parse(t.l)) / 864e5;
    if (t.r === 0) return def?.dias && dias > def.dias ? ['d-ko', `⚠ Atrasada: la última vez que salió bien fue ${hace(t.l)}`] : ['d-ok', '✓ Hecha'];
    if (t.r === 267009) return ['d-ok', '⏳ En marcha ahora'];
    if (t.r === 267014 || t.r === 267012) return ['d-ko', '✖ Interrumpida antes de terminar'];
    return ['d-ko', `✖ Terminó con error (código ${t.r})`];
  }

  function vista() {
    cargar();
    if (E.error) return `<div class="aviso"><p>⚠ ${esc(E.error)} Esta pestaña solo funciona desde el PC del trabajo, con el servicio «Servidor D365 local» en marcha.</p></div><p><button class="small" data-tareas-act="ref">⟳ Reintentar</button></p>`;
    if (!E.datos) return '<p class="vacio">Consultando las tareas del PC…</p>';
    const por = Object.fromEntries(E.datos.tareas.map((t) => [t.n, t]));
    const nombres = [...Object.keys(TAREAS), ...E.datos.tareas.map((t) => t.n).filter((n) => !TAREAS[n])];
    const filas = nombres.map((n) => {
      const t = por[n], def = TAREAS[n] ?? {};
      if (!t) return `<tr><td><b>${esc(n)}</b><div class="hint">${esc(def.desc ?? '')}</div></td><td>${esc(def.cuando ?? '')}</td><td colspan="3"><span class="d-ko">✖ La tarea no está creada en este PC</span></td></tr>`;
      const [cl, tx] = estado(t, def);
      const nunca = !t.l || /^19(99|00)|^0001/.test(t.l);
      return `<tr><td><b>${esc(n)}</b><div class="hint">${esc(def.desc ?? '')}</div></td><td>${esc(def.cuando ?? '')}</td>
        <td>${nunca ? '—' : `${esc(fecha(t.l))}<div class="hint">${esc(hace(t.l))}</div>`}</td><td><span class="${cl}">${esc(tx)}</span></td><td>${t.x ? esc(fecha(t.x)) : '—'}</td></tr>`;
    }).join('');
    const reg = E.datos.registro ?? [];
    return `<div class="bar"><span class="chip">Comprobado a las ${esc(new Date(E.datos.ahora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))}</span>
        <button class="small" data-tareas-act="ref">⟳ Actualizar</button></div>
      <div class="wrap"><table class="tabla"><thead><tr><th>Tarea</th><th>Cuándo se ejecuta</th><th>Última ejecución</th><th>Resultado</th><th>Próxima</th></tr></thead><tbody>${filas}</tbody></table></div>
      <details style="margin-top:.8rem"><summary>Final del registro de los scripts (${reg.length} últimas líneas)</summary>
        <pre style="max-height:22rem;overflow:auto;font-size:.75rem;white-space:pre-wrap">${esc(reg.join('\n') || 'Sin registro todavía.')}</pre></details>
      <p class="hint">Los datos salen del Programador de tareas de Windows de este PC. «Hecha» significa que Windows la dio por terminada sin error; el detalle de cada paso está en el registro de abajo. La tarea «Revisar consumo de Supabase» no aparece aquí: es de la app de Claude, no de Windows.</p>`;
  }

  document.addEventListener('click', (ev) => { if (ev.target.closest?.('[data-tareas-act="ref"]')) { E.cuando = 0; E.datos = null; cargar(); } });
  return { tabs: { tareas: ['Tareas programadas', '¿Se han hecho las tareas automáticas?', vista, true] } };
}
