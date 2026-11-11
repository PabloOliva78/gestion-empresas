// Vista común de «Proveedores» y «Clientes» (bloque 12): cabecera fija con buscador y filtro de país, tabla con scroll propio y alta de filas a mano.
// Las filas escritas a mano llevan manual:true y no se pierden al volver a cargar el Excel del ERP.
import { paisDeSiglas } from './paises.js?v=1';
export function crearVistaTercero({ S, esc, render, empresa, puede, grande, reemplazarGrande, P, TIPO, clave, titulo, singular, extras, zona, nota, paisNif }) {
  // extras: columnas propias de cada listado, [campo, cabecera]; P: estado { msg, q, pais, nuevo }
  const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nombrePais = (c) => { const p = paisDeSiglas(c); return p ? `${p.nombre} (${p.c})` : c; };
  const CAMPOS = [['cuenta', 'Cuenta'], ['nif', 'NIF'], ['nombre', 'Nombre']];
  const FORM = [...CAMPOS, ['pais', 'País (siglas)'], ...extras];

  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande(TIPO);
    if (!L) return '<p class="vacio">Cargando datos…</p>';
    const e = empresa(), ed = puede();
    const filas = L.map((x, i) => { const pd = paisDeSiglas(x.pais), p = pd ? pd.c : (x.pais ? String(x.pais).toUpperCase() : paisNif(x.nif)); return { ...x, i, p, inf: !x.pais && !!p }; });
    const cuenta = {}; filas.forEach((x) => { const k = x.p || ''; cuenta[k] = (cuenta[k] || 0) + 1; });
    const sinPais = cuenta[''] || 0, paises = Object.keys(cuenta).filter((p) => p).sort((a, b) => cuenta[b] - cuenta[a]);
    const vis = filas.filter((x) => !P.pais || (P.pais === '__sin' ? !x.p : x.p === P.pais)), q = sinAc(P.q).trim();
    const nv = P.nuevo;
    const inp = (c, t) => `<td class="in"><input data-tvf="${clave}|${c}" value="${esc(nv?.[c] ?? '')}" placeholder="${esc(t)}"${c === 'pais' ? ' size="4" maxlength="3" style="text-transform:uppercase"' : ''}></td>`;
    const filaNueva = nv ? `<tr class="nueva">${FORM.map(([c, t]) => (c === 'pais' ? `${inp(c, t)}<td></td>` : inp(c, t))).join('')}<td class="acc"><button class="pill" data-tvact="${clave}|ok">✔ Añadir</button> <button class="pill" data-tvact="${clave}|x">✕</button></td></tr>` : '';
    const cab = `<tr><th>Cuenta</th><th>NIF</th><th>Nombre</th><th>País</th><th>UE</th>${extras.map(([, t]) => `<th>${esc(t)}</th>`).join('')}<th></th></tr>`;
    const cuerpo = vis.map((x) => {
      const b = sinAc(`${x.cuenta} ${x.nif} ${x.nombre} ${extras.map(([c]) => x[c] ?? '').join(' ')}`);
      return `<tr data-b="${esc(b)}"${q && !b.includes(q) ? ' style="display:none"' : ''}><td>${esc(x.cuenta)}</td><td>${esc(x.nif)}</td><td>${esc(x.nombre)}${x.manual ? ' <span class="hint">a mano</span>' : ''}</td>
        <td>${x.p ? `${esc(nombrePais(x.p))}${x.inf ? ' <span class="hint" title="No viene en el listado: se deduce del prefijo del NIF">(por NIF)</span>' : ''}` : '<span class="d-ko">sin país</span>'}</td><td style="text-align:center">${paisDeSiglas(x.p)?.ue ? '✓' : ''}</td>
        ${extras.map(([c]) => `<td>${esc(x[c] ?? '')}</td>`).join('')}<td class="acc no-print">${ed && x.manual ? `<button class="pill" data-tvact="${clave}|del|${x.i}">Quitar</button>` : ''}</td></tr>`;
    }).join('');
    return `<div class="inicio m347 tercero ${clave} tercero-pag"><div class="tercero-top"><section class="dsec m347-fijo"><h3>${titulo} · ${esc(e?.nombre ?? '')} · ${L.length} ${titulo.toLowerCase()} · ${sinPais ? `<span class="d-ko">${sinPais} sin país</span>` : '<span class="d-ok">todos con país</span>'}</h3>
      <div class="m347-bar"><select data-tvpais="${clave}"><option value="">Todos los países</option>${sinPais ? `<option value="__sin"${P.pais === '__sin' ? ' selected' : ''}>(sin país) · ${sinPais}</option>` : ''}${paises.map((p) => `<option value="${p}"${P.pais === p ? ' selected' : ''}>${esc(nombrePais(p))} · ${cuenta[p]}</option>`).join('')}</select>
      <input type="search" data-tvq="${clave}" placeholder="🔍 Buscar por nombre, NIF, cuenta…" value="${esc(P.q)}" autocomplete="off">
      ${ed ? `<button class="small primary no-print" data-tvact="${clave}|add">＋ Añadir ${singular} a mano</button>` : ''}</div>
      ${zona()}${P.msg ? `<p class="dash-s" style="font-size:.8rem;margin:.2rem 0 0">${esc(P.msg)}</p>` : ''}</section></div>
      <div class="tercero-tabla"><table class="tabla"><thead>${cab}</thead><tbody>${filaNueva}${cuerpo || (L.length ? '' : `<tr><td colspan="${6 + extras.length}">Sin ${titulo.toLowerCase()} cargados: suelta el Excel arriba o añade uno a mano.</td></tr>`)}</tbody></table></div>
      <p class="hint tercero-nota">${nota}</p></div>`;
  }

  async function alta() {
    const n = P.nuevo; if (!n) return;
    if (!String(n.nombre ?? '').trim()) return void alert('Escribe al menos el nombre.');
    const fila = { id: 'man-' + Date.now(), manual: true, pais: String(n.pais ?? '').trim().toUpperCase() };
    FORM.forEach(([c]) => { if (c !== 'pais') fila[c] = String(n[c] ?? '').trim(); });
    P.nuevo = null; P.msg = 'Guardando…'; render();
    const ok = await reemplazarGrande(TIPO, S.sel, [fila, ...(grande(TIPO) ?? [])]);
    P.msg = ok === false ? 'No se pudo guardar (mira el aviso).' : `✓ ${singular[0].toUpperCase()}${singular.slice(1)} añadido a mano.`;
    render();
  }
  async function quitar(i) {
    const L = grande(TIPO) ?? [], x = L[+i]; if (!x?.manual) return;
    if (!confirm(`¿Quitar «${x.nombre}» del listado? (Solo se quitan los añadidos a mano.)`)) return;
    P.msg = 'Guardando…'; render();
    const ok = await reemplazarGrande(TIPO, S.sel, L.filter((_, j) => j !== +i));
    P.msg = ok === false ? 'No se pudo guardar (mira el aviso).' : '✓ Quitado.'; render();
  }
  function activar() {
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest?.('[data-tvact]'); if (!b) return;
      const [c, acc, i] = b.dataset.tvact.split('|'); if (c !== clave) return;
      if (acc === 'add') { P.nuevo = {}; render(); } else if (acc === 'x') { P.nuevo = null; render(); } else if (acc === 'ok') alta(); else if (acc === 'del') quitar(i);
    });
    document.addEventListener('change', (ev) => { if (ev.target.dataset?.tvpais === clave) { P.pais = ev.target.value; render(); } });
    document.addEventListener('input', (ev) => {
      const d = ev.target.dataset ?? {};
      if (d.tvq === clave) { P.q = ev.target.value; const q = sinAc(P.q).trim(); document.querySelectorAll(`.tercero.${clave} tbody tr[data-b]`).forEach((tr) => { tr.style.display = !q || tr.dataset.b.includes(q) ? '' : 'none'; }); }
      else if (d.tvf?.startsWith(clave + '|') && P.nuevo) P.nuevo[d.tvf.split('|')[1]] = ev.target.value;
    });
  }
  return { vista, activar };
}
