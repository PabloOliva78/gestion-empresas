// Aviso de plazos por correo. La app guarda en la tabla «avisos_plazos» la lista de plazos sin presentar y una función programada de Supabase
// (supabase/functions/aviso-plazos) la envía cada lunes. Solo la guarda un administrador, porque es quien ve todas las empresas.
// Mientras la tabla no exista (falta activar el envío), no se guarda nada y la pestaña lo indica.
export function crearAvisoPlazos({ db, S, esc, render, eventosCal, hoyUtc }) {
  const DIA = 864e5, ATRAS = 90, DELANTE = 45, AVISO = 10;
  const E = { estado: 'sin', error: '', guardado: '', firma: '', ocupado: false };
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const fdia = (s) => s.split('-').reverse().join('/');
  // plazos de presentación sin presentar: vencidos en los últimos 90 días y los de los próximos 45
  function lista() {
    const hoy = hoyUtc(), y = new Date(hoy).getUTCFullYear(), vistos = new Set();
    return eventosCal([y - 1, y], false)
      .filter((o) => o.t === 'plazo' && !o.pres && o.fecha >= hoy - ATRAS * DIA && o.fecha <= hoy + DELANTE * DIA)
      .map((o) => ({ f: iso(o.fecha), t: o.txt, e: o.emp, i: o.imp ?? null }))
      .filter((x) => { const k = `${x.f}|${x.t}|${x.e}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
      .sort((a, b) => a.f.localeCompare(b.f) || a.e.localeCompare(b.e) || a.t.localeCompare(b.t));
  }
  async function guardar(forzar) {
    if (E.ocupado || S.perfil?.rol !== 'admin' || !S.empresas.length || !S.registros.length) return;
    if (E.estado === 'falta' && !forzar) return;
    let plazos; try { plazos = lista(); } catch { return; }
    const firma = `${iso(hoyUtc())}|${JSON.stringify(plazos)}`;
    if (firma === E.firma && !forzar) return;
    E.ocupado = true;
    const { error } = await db.from('avisos_plazos').upsert({ id: 1, datos: { plazos }, actualizado: new Date().toISOString() });
    E.ocupado = false;
    const antes = E.estado;
    if (error) { E.estado = /avisos_plazos|does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code}`) ? 'falta' : 'error'; E.error = error.message; }
    else { E.estado = 'ok'; E.error = ''; E.firma = firma; E.guardado = new Date().toLocaleString('es-ES'); }
    if (S.tab === 'avisopl' && (forzar || antes !== E.estado)) render();
  }
  [25000, 60000].forEach((t) => setTimeout(() => { guardar(false); }, t));
  setInterval(() => { guardar(false); }, 120000);

  function vista() {
    const hoy = hoyUtc(), L = lista(), corte = iso(hoy + AVISO * DIA), h = iso(hoy);
    const venc = L.filter((x) => x.f < h), prox = L.filter((x) => x.f >= h && x.f <= corte);
    const dias = (f) => Math.round((Date.parse(f) - hoy) / DIA);
    const fila = (x) => { const d = dias(x.f); return `<tr><td>${esc(x.e)}</td><td>${esc(x.t)}</td><td>${fdia(x.f)}</td><td>${d < 0 ? '<span class="d-ko">✖ Vencido</span>' : d === 0 ? '<span class="d-ko">Vence hoy</span>' : `<span style="color:#8a6d00">En ${d} día${d === 1 ? '' : 's'}</span>`}</td></tr>`; };
    const est = S.perfil?.rol !== 'admin' ? 'La lista la guarda un administrador al usar la aplicación.'
      : E.estado === 'ok' ? `<span class="d-ok">✓ Lista guardada para el correo</span> · ${esc(E.guardado)}`
      : E.estado === 'falta' ? '<span class="d-ko">El envío por correo todavía no está activado en Supabase</span> (pasos en supabase/AVISO_PLAZOS.md).'
      : E.estado === 'error' ? `<span class="d-ko">✖ No se pudo guardar la lista: ${esc(E.error)}</span>` : 'Todavía no se ha guardado la lista en esta sesión.';
    return `<div class="inicio"><section class="dsec"><h3>Aviso de plazos por correo</h3>
      <p>${est} ${S.perfil?.rol === 'admin' ? '<button class="small no-print" data-avisopl="guardar">Guardar ahora</button>' : ''}</p>
      <p class="dash-s">Cada lunes se envía lo vencido sin presentar (últimos ${ATRAS} días) y lo que vence en los próximos ${AVISO} días. Así quedaría hoy: ${venc.length} vencido(s) y ${prox.length} por vencer.</p>
      ${venc.length + prox.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Empresa</th><th>Modelo y periodo</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${[...venc, ...prox].map(fila).join('')}</tbody></table></div>` : '<p class="hint">Nada pendiente.</p>'}
      <p class="hint">El correo usa la última lista guardada: lo que marques como presentado deja de salir en cuanto la aplicación vuelve a guardarla (lo hace sola cada dos minutos si está abierta).</p></section></div>`;
  }
  document.addEventListener('click', (ev) => { if (ev.target.closest?.('[data-avisopl]')) guardar(true); });

  return { tabs: { avisopl: ['Aviso de plazos', 'Correo semanal de vencimientos', vista] } };
}
