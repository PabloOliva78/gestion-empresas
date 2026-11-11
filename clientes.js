// Bloque 12 · Proveedores - Clientes. Pestaña «Clientes»: listado de clientes del ERP; el Excel ya trae el país de cada cliente.
// Se guarda un solo registro por empresa con el tipo «fact-cli» (como los libros grandes: no se carga con el resto de datos).
import { paisDeSiglas } from './paises.js?v=1';
export function crearClientes({ S, esc, render, empresa, puede, grande, reemplazarGrande }) {
  const TIPO = 'fact-cli';
  const esNifEsp = (n) => /^[0-9]{8}[A-Z]$/.test(n) || /^[XYZKLM][0-9]{7}[A-Z]$/.test(n) || /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(n);
  // país deducido del NIF (si el listado no trae país): NIF español → ES; prefijo de 2 letras → ese país
  const paisNif = (nif) => { const n = String(nif ?? '').toUpperCase().replace(/[\s.\-/]/g, ''); if (!n) return ''; if (esNifEsp(n)) return 'ES'; return /^[A-Z]{2}/.test(n) ? paisDeSiglas(n.slice(0, 2))?.c ?? '' : ''; };
  const P = { msg: '', q: '', pais: '', cargando: false };
  const txt = (v) => String(v ?? '').trim();
  const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  async function leerExcel(f) {
    if (!window.XLSX) throw new Error('No se cargó la librería de Excel. Recarga la página.');
    const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  }
  async function cargar(files) {
    if (P.cargando || !S.sel) return;
    P.cargando = true; P.msg = 'Leyendo el Excel…'; render();
    try {
      let filas = null;
      for (const f of files) {
        const a = await leerExcel(f), cab = (a[0] ?? []).map((x) => txt(x).toLowerCase());
        if (!(cab.includes('cuenta') && cab.includes('grupo de clientes'))) throw new Error(`${f.name}: no reconozco el listado (debe ser el de CLIENTES, con «Cuenta», «Nombre», «Grupo de clientes» y «País/región»).`);
        const c = { cta: cab.indexOf('cuenta'), nom: cab.indexOf('nombre'), nif: cab.indexOf('nif'), gr: cab.indexOf('grupo de clientes'), div: cab.indexOf('divisa'), tel: cab.indexOf('teléfono'), imp: cab.indexOf('grupo de impuestos'), pais: cab.indexOf('país/región'), fac: cab.indexOf('cuenta de facturación') };
        filas = (filas ?? []).concat(a.slice(1).filter((r) => txt(r[c.cta]) || txt(r[c.nom])).map((r) => ({ cuenta: txt(r[c.cta]), nombre: txt(r[c.nom]), nif: txt(r[c.nif]), grupo: txt(r[c.gr]), divisa: txt(r[c.div]), tel: txt(r[c.tel]), imp: txt(r[c.imp]), pais: txt(r[c.pais]).toUpperCase(), cfact: c.fac >= 0 ? txt(r[c.fac]) : '' })));
      }
      if (!filas?.length) throw new Error('El listado no trae clientes.');
      P.msg = 'Guardando…'; render();
      const ok = await reemplazarGrande(TIPO, S.sel, filas);
      P.msg = ok === false ? 'No se pudo guardar (mira el aviso).' : `✓ ${filas.length} clientes guardados · ${filas.filter((x) => x.pais).length} con país.`;
    } catch (err) { P.msg = `✖ ${err.message}`; }
    P.cargando = false; render();
  }

  const nombrePais = (c) => { const p = paisDeSiglas(c); return p ? `${p.nombre} (${p.c})` : c; };
  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande(TIPO);
    if (!L) return '<p class="vacio">Cargando datos…</p>';
    const e = empresa();
    const zona = puede() ? `<div class="dropzone" data-clidz tabindex="0" role="button"><b>Suelta aquí el listado de CLIENTES</b> (Excel del ERP con «Cuenta», «Nombre», «NIF», «Grupo de clientes» y «País/región») o pulsa para elegirlo. Sustituye al listado anterior.<input type="file" data-clifile accept=".xlsx,.xls" multiple hidden></div>` : '';
    const msg = P.msg ? `<p class="dash-s" style="font-size:.85rem">${esc(P.msg)}</p>` : '';
    if (!L.length) return `<div class="inicio"><section class="dsec"><h3>Clientes · ${esc(e?.nombre ?? '')}</h3>${zona}${msg}<p class="vacio">Sin clientes cargados.</p></section></div>`;
    const filas = L.map((x) => { const pd = paisDeSiglas(x.pais), p = pd ? pd.c : (x.pais ? x.pais.toUpperCase() : paisNif(x.nif)); return { ...x, p, inf: !x.pais && !!p }; });
    const cuenta = {}; filas.forEach((x) => { const k = x.p || ''; cuenta[k] = (cuenta[k] || 0) + 1; });
    const paises = Object.keys(cuenta).filter((p) => p).sort((a, b) => cuenta[b] - cuenta[a]), sinPais = cuenta[''] || 0;
    const vis = filas.filter((x) => !P.pais || (P.pais === '__sin' ? !x.p : x.p === P.pais)), q = sinAc(P.q).trim();
    return `<div class="inicio m347 cli"><section class="dsec m347-fijo"><h3>Clientes · ${esc(e?.nombre ?? '')} · ${L.length} clientes · ${sinPais ? `<span class="d-ko">${sinPais} sin país</span>` : '<span class="d-ok">todos con país</span>'}</h3>
      <div class="m347-bar"><select data-cli="pais"><option value="">Todos los países</option>${sinPais ? `<option value="__sin"${P.pais === '__sin' ? ' selected' : ''}>(sin país) · ${sinPais}</option>` : ''}${paises.map((p) => `<option value="${p}"${P.pais === p ? ' selected' : ''}>${esc(nombrePais(p))} · ${cuenta[p]}</option>`).join('')}</select>
      <input type="search" data-cli="q" placeholder="🔍 Buscar por nombre, NIF o cuenta…" value="${esc(P.q)}" autocomplete="off"></div></section>
      ${zona}${msg}
      <section class="dsec"><div class="wrap" style="max-height:calc(100vh - 14rem);overflow:auto"><table class="tabla"><thead><tr><th>Cuenta</th><th>NIF</th><th>Nombre</th><th>País</th><th>UE</th><th>Grupo</th><th>Grupo de impuestos</th><th>Divisa</th><th>Teléfono</th></tr></thead><tbody>
      ${vis.map((x) => { const b = sinAc(`${x.cuenta} ${x.nif} ${x.nombre}`); return `<tr data-b="${esc(b)}"${q && !b.includes(q) ? ' style="display:none"' : ''}><td>${esc(x.cuenta)}</td><td>${esc(x.nif)}</td><td>${esc(x.nombre)}</td><td>${x.p ? `${esc(nombrePais(x.p))}${x.inf ? ' <span class="hint" title="No viene en el listado: se deduce del prefijo del NIF">(por NIF)</span>' : ''}` : '<span class="d-ko">sin país</span>'}</td><td style="text-align:center">${paisDeSiglas(x.p)?.ue ? '✓' : ''}</td><td>${esc(x.grupo)}</td><td>${esc(x.imp)}</td><td>${esc(x.divisa)}</td><td>${esc(x.tel)}</td></tr>`; }).join('')}
      </tbody></table></div></section>
      <p class="hint">País = el que trae el listado de clientes del ERP. Si algún cliente no lo trae, se deduce del prefijo del NIF-IVA y se marca «por NIF». «UE» indica Estado miembro de la Unión Europea.</p></div>`;
  }

  document.addEventListener('click', (ev) => { const z = ev.target.closest?.('[data-clidz]'); if (z && !ev.target.closest('input')) z.querySelector('input')?.click(); });
  document.addEventListener('change', (ev) => {
    const d = ev.target.dataset ?? {};
    if (d.clifile !== undefined) { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) cargar(fs); }
    else if (d.cli === 'pais') { P.pais = ev.target.value; render(); }
  });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-clidz]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { ev.target.closest?.('[data-clidz]')?.classList.remove('over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest?.('[data-clidz]'); if (!z || !puede()) return;
    ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over');
    const fs = [...ev.dataTransfer.files].filter((f) => /\.xlsx?$/i.test(f.name)); if (fs.length) cargar(fs);
  }, true);
  document.addEventListener('input', (ev) => {
    if (ev.target.dataset?.cli !== 'q') return;
    P.q = ev.target.value; const q = sinAc(P.q).trim();
    document.querySelectorAll('.cli tbody tr[data-b]').forEach((tr) => { tr.style.display = !q || tr.dataset.b.includes(q) ? '' : 'none'; });
  });
  return { tabs: { cli: ['Clientes', 'Listado con país', vista] } };
}
