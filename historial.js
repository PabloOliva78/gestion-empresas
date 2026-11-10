// Historial de cambios (bloque 11 · Administración): quién cambió qué y cuándo. Pestaña nueva, solo para administradores.
// Lee la tabla `auditoria`, que rellenan los disparadores de supabase/08_auditoria.sql; no toca ninguna otra pestaña.
export function crearHistorial({ db, S, esc, render, empNombre }) {
  const TIPOS = { prs: 'Impuestos presentados', prspdf: 'PDF de impuestos presentados', nominas: 'Nóminas', fundae: 'FUNDAE', ctacfg: 'Cuentas contables (ajustes)', siiquit: 'SII (facturas quitadas)',
    retclave: 'Retenciones (clave de línea)', m303: 'Modelo 303 (a mano)', m111: 'Modelo 111 (a mano)', m115: 'Modelo 115 (a mano)', m123: 'Modelo 123 (a mano)', liqiva: 'Libros de IVA (liquidado/automático)',
    liqpres: 'Liquidaciones (marcadas presentadas)', iloc: 'Impuestos locales', dua: 'DUA-H1', empresa: 'Datos de la empresa', 'fact-E': 'Libro de IVA emitidas', 'fact-R': 'Libro de IVA recibidas',
    'sii-E': 'SII emitidas', 'sii-R': 'SII recibidas', 'may-mov': 'Extracto contable', intra: 'Intrastat', m232: 'Modelo 232', 'm592-mov': 'Modelo 592' };
  const OPS = { INSERT: 'Alta', UPDATE: 'Cambio', DELETE: 'Baja' };
  const F = { todas: false, op: '', q: '', n: 200 }, C = { clave: null, filas: null, error: '', cargando: false };

  async function cargar() {
    const clave = JSON.stringify([S.sel, F.todas, F.op, F.n]);
    if (C.clave === clave && (C.filas || C.cargando)) return;
    C.clave = clave; C.cargando = true; C.filas = null; C.error = '';
    let q = db.from('auditoria').select('id,fecha,usuario,tabla,operacion,empresa_id,tipo,ejercicio,antes,despues').order('fecha', { ascending: false }).limit(F.n);
    if (S.sel && !F.todas) q = q.eq('empresa_id', S.sel);
    if (F.op) q = q.eq('operacion', F.op);
    const { data, error } = await q;
    C.cargando = false;
    if (error) C.error = /auditoria|relation|schema cache/i.test(error.message) ? 'falta' : error.message;
    C.filas = data ?? [];
    render();
  }

  const corto = (v) => { const t = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); return t.length > 60 ? `${t.slice(0, 57)}…` : t; };
  // diferencias entre dos valores JSON, hasta dos niveles: «303|10 · liq: 0 → -5000»
  function difs(a, b, ruta = '', prof = 0, out = []) {
    if (out.length >= 8) return out;
    const objA = a && typeof a === 'object' && !Array.isArray(a), objB = b && typeof b === 'object' && !Array.isArray(b);
    if (objA && objB && prof < 2) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) difs(a[k], b[k], ruta ? `${ruta} · ${k}` : k, prof + 1, out); return out; }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${ruta || 'valor'}: ${a === undefined ? '(nuevo)' : corto(a)} → ${b === undefined ? '(quitado)' : corto(b)}`);
    return out;
  }
  function resumen(r) {
    if (['fact-E', 'fact-R', 'may-mov', 'm592-mov', 'a22src', 'intra'].includes(r.tipo) || /^sii-/.test(r.tipo ?? '')) return '<span class="hint">libro o extracto completo (no se detalla)</span>';
    if (r.operacion === 'INSERT') return '<span class="hint">registro nuevo</span>';
    if (r.operacion === 'DELETE') return '<span class="hint">registro eliminado</span>';
    const d = difs(r.antes, r.despues);
    return d.length ? d.map((x) => `<div>${esc(x)}</div>`).join('') + (d.length >= 8 ? '<div class="hint">…</div>' : '') : '<span class="hint">sin detalle</span>';
  }
  const fecha = (s) => { const d = new Date(s); return `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`; };

  function vista() {
    cargar();
    if (C.error === 'falta') return `<div class="aviso"><p>⚠ Falta activar el historial. Abre Supabase › SQL Editor, pega el contenido de <b>supabase/08_auditoria.sql</b> y pulsa Run (una sola vez). Después recarga esta pestaña.</p></div>`;
    if (C.error) return `<div class="aviso"><p>⚠ ${esc(C.error)}</p></div>`;
    if (!C.filas) return '<p class="vacio">Cargando el historial…</p>';
    const q = F.q.trim().toLowerCase();
    const filas = C.filas.filter((r) => !q || [r.usuario, TIPOS[r.tipo] ?? r.tipo, r.empresa_id ? empNombre(r.empresa_id) : '', JSON.stringify(r.despues ?? ''), JSON.stringify(r.antes ?? '')].join(' ').toLowerCase().includes(q));
    const cuerpo = filas.map((r) => `<tr><td>${esc(fecha(r.fecha))}</td><td>${esc(r.usuario ?? '—')}</td><td>${esc(r.empresa_id ? empNombre(r.empresa_id) : '—')}</td>
      <td>${esc(TIPOS[r.tipo] ?? r.tipo ?? r.tabla)}${r.ejercicio ? ` · ${r.ejercicio}` : ''}</td><td class="c">${esc(OPS[r.operacion] ?? r.operacion)}</td><td class="hist-d">${resumen(r)}</td></tr>`).join('');
    return `<div class="bar"><span class="chip">${S.sel && !F.todas ? esc(empNombre(S.sel)) : 'Todas las empresas'} · últimos ${F.n}</span>
        <label><input type="checkbox" data-hist="todas"${F.todas ? ' checked' : ''}> Todas las empresas</label>
        <label>Operación <select data-hist="op"><option value="">Todas</option>${Object.entries(OPS).map(([k, v]) => `<option value="${k}"${F.op === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <input type="search" data-hist="q" placeholder="Buscar usuario, tipo o valor…" value="${esc(F.q)}" size="30">
        <label>Mostrar <select data-hist="n">${[200, 500, 1000].map((n) => `<option${F.n === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="small" data-hist-act="refrescar">⟳ Actualizar</button> <button class="small" data-hist-act="csv">⬇ Descargar CSV</button></div>
      ${filas.length ? `<div class="wrap"><table class="tabla hist-t"><thead><tr><th>Fecha</th><th>Usuario</th><th>Empresa</th><th>Qué</th><th>Acción</th><th>Cambio</th></tr></thead><tbody>${cuerpo}</tbody></table></div>`
        : '<p class="vacio">Sin cambios anotados con este filtro.</p>'}
      <p class="hint">Se anotan los cambios hechos desde que se activó el historial. Los libros de IVA, el SII y los extractos solo dejan constancia de que se tocaron.</p>`;
  }

  function csv() {
    const esc2 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const l = ['Fecha;Usuario;Empresa;Qué;Acción;Cambio', ...(C.filas ?? []).map((r) => [fecha(r.fecha), r.usuario, r.empresa_id ? empNombre(r.empresa_id) : '', `${TIPOS[r.tipo] ?? r.tipo ?? r.tabla}${r.ejercicio ? ` ${r.ejercicio}` : ''}`, OPS[r.operacion] ?? r.operacion,
      ['fact-E', 'fact-R', 'may-mov'].includes(r.tipo) ? 'libro completo' : difs(r.antes, r.despues).join(' | ')].map(esc2).join(';'))];
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + l.join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: `historial-cambios-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  document.addEventListener('change', (ev) => {
    const k = ev.target.dataset?.hist; if (!k) return;
    if (k === 'op') F.op = ev.target.value; else if (k === 'n') F.n = Number(ev.target.value); else if (k === 'todas') F.todas = ev.target.checked; else return;
    C.clave = null; render();
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.dataset?.hist !== 'q') return;
    F.q = ev.target.value; render();
    const i = document.querySelector('[data-hist="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-hist-act]'); if (!b) return;
    if (b.dataset.histAct === 'refrescar') { C.clave = null; render(); } else if (b.dataset.histAct === 'csv') csv();
  });

  // admin = true (4.º elemento): la pestaña solo la ven los administradores
  return { tabs: { hist: ['Historial de cambios', 'Quién cambió qué y cuándo', vista, true] } };
}
