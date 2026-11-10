// Plazo del SII (bloque 6): comprueba si cada factura se envió dentro de 4 días naturales.
// Emitidas: 4 días desde la fecha de la factura. Recibidas: 4 días desde su contabilización (fecha de registro).
// Pestaña nueva: solo lee los envíos ya cargados (sii-raw-*); no guarda nada.
export function crearSiiPlazo({ db, S, esc, render, empresa }) {
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS = 4;
  const E = { mes: '', datos: new Map(), cargando: new Set(), solo: 'tarde' };
  const mesSel = () => E.mes || String(Math.max(1, new Date().getMonth() + (new Date().getDate() > 15 ? 1 : 0))).padStart(2, '0');
  const clave = (s, ej, mm) => `${S.sel}|${s}|${ej}|${mm}`;
  // fecha → número de día (UTC) desde «dd-mm-aaaa», «aaaa-mm-dd» o con hora
  const dia = (v) => {
    const t = String(v ?? '').trim(); let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/), a, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; a = +m[3]; } else { m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; a = +m[1]; mo = +m[2]; d = +m[3]; }
    return Date.UTC(a, mo - 1, d) / 864e5;
  };
  const iso = (n) => (n === null ? '' : new Date(n * 864e5).toISOString().slice(0, 10).split('-').reverse().join('/'));
  const envio = (raw) => { // fecha y hora de envío al SII: el primer valor con hora (dd-mm-aaaa hh:mm:ss)
    for (const k of Object.keys(raw).map(Number).sort((a, b) => a - b)) if (/^\d{1,2}-\d{1,2}-\d{4} \d{2}:\d{2}:\d{2}/.test(String(raw[k] ?? ''))) return raw[k];
    return null;
  };
  async function leer(s, ej, mm) {
    const k = clave(s, ej, mm);
    if (E.datos.has(k) || E.cargando.has(k)) return;
    E.cargando.add(k);
    try {
      const { data, error } = await db.from('registros').select('datos').eq('empresa_id', S.sel).eq('tipo', `sii-raw-${s}-${ej}-${mm}`).order('id').limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      const filas = (data?.datos?.filas ?? []).map((f) => {
        const r = f.raw ?? {}, ref = dia(r[3]), env = dia(envio(r)), nombre = s === 'E' ? r[6] : r[5];
        return { fac: String(f.k ?? '').split('|')[0], nombre: String(nombre ?? ''), ref, env, dias: ref !== null && env !== null ? env - ref : null };
      });
      E.datos.set(k, { filas, hay: !!data });
    } catch (err) { E.datos.set(k, { filas: [], hay: false, error: err.message }); }
    E.cargando.delete(k);
    render();
  }
  const resumen = (L) => {
    const con = L.filter((x) => x.dias !== null), tarde = con.filter((x) => x.dias > DIAS);
    return { n: L.length, sin: L.length - con.length, tarde, bien: con.length - tarde.length, peor: tarde.reduce((a, x) => Math.max(a, x.dias - DIAS), 0) };
  };

  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const ej = Number(S.ejercicio), mm = mesSel(), e = empresa();
    const bloque = (s, tit, regla) => {
      const k = clave(s, ej, mm); leer(s, ej, mm);
      const D = E.datos.get(k);
      if (!D) return `<section class="dsec"><h3>${tit}</h3><p class="dash-s">⏳ Leyendo los envíos al SII…</p></section>`;
      if (!D.hay) return `<section class="dsec"><h3>${tit}</h3><p class="dash-s">${D.error ? `<span class="d-ko">✖ ${esc(D.error)}</span>` : `Sin envíos cargados de ${MES[+mm - 1].toLowerCase()} ${ej}. Se cargan en la pestaña de ${s === 'E' ? 'SII emitidas' : 'SII recibidas'}.`}</p></section>`;
      const R = resumen(D.filas), lista = (E.solo === 'todas' ? D.filas.filter((x) => x.dias !== null) : R.tarde).sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
      return `<section class="dsec"><h3>${tit}</h3>
        <p class="dash-s">${R.tarde.length ? `<span class="d-ko">✖ ${R.tarde.length} fuera de plazo</span>` : '<span class="d-ok">✓ Todas dentro de plazo</span>'} · ${R.bien} en plazo de ${R.n}${R.sin ? ` · ${R.sin} sin fecha` : ''}${R.peor ? ` · mayor retraso ${R.peor} día(s)` : ''}</p>
        <p class="hint">${regla}</p>
        ${lista.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Factura</th><th>Tercero</th><th>${s === 'E' ? 'Fecha factura' : 'Contabilización'}</th><th>Enviada al SII</th><th>Días</th><th>Estado</th></tr></thead><tbody>${lista.slice(0, 500).map((x) => `<tr><td>${esc(x.fac)}</td><td>${esc(x.nombre)}</td><td>${iso(x.ref)}</td><td>${iso(x.env)}</td><td style="text-align:right">${x.dias}</td><td>${x.dias > DIAS ? `<span class="d-ko">✖ ${x.dias - DIAS} día(s) tarde</span>` : '<span class="d-ok">✓ En plazo</span>'}</td></tr>`).join('')}</tbody></table></div>${lista.length > 500 ? `<p class="hint">Se enseñan las 500 primeras de ${lista.length}.</p>` : ''}` : ''}</section>`;
    };
    return `<div class="inicio"><section class="dsec"><h3>Plazo de envío al SII · ${esc(e?.nombre ?? '')} · <select data-siipl="mes">${MES.map((n, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}"${v === mm ? ' selected' : ''}>${n}</option>`; }).join('')}</select> de ${ej} · <select data-siipl="ver"><option value="tarde"${E.solo === 'tarde' ? ' selected' : ''}>Solo las fuera de plazo</option><option value="todas"${E.solo === 'todas' ? ' selected' : ''}>Todas</option></select></h3>
      <p class="dash-s" style="font-size:.8rem">Plazo: ${DIAS} días naturales. Se cuenta desde la fecha de la factura (emitidas) y desde su contabilización (recibidas) hasta el día del envío al SII.</p></section>
      ${bloque('E', 'Facturas emitidas', 'Días entre la fecha de la factura y el envío al SII.')}
      ${bloque('R', 'Facturas recibidas', 'Días entre la contabilización (fecha de registro) y el envío al SII.')}</div>`;
  }

  document.addEventListener('change', (ev) => {
    const k = ev.target.dataset?.siipl; if (!k) return;
    if (k === 'mes') E.mes = ev.target.value; else E.solo = ev.target.value;
    render();
  });
  return { tabs: { siiplazo: ['Plazo SII (4 días)', 'Envíos fuera de plazo', vista] } };
}
