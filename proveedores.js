// Bloque 12 · Proveedores - Clientes. Pestaña «Proveedores»: listado de proveedores del ERP con su país, sacado del listado de direcciones.
// Se cargan dos Excel del ERP (PROVEEDORES: Id. de parte, Cuenta, NIF, Nombre… · DIRECCIONES: Id. de parte, Ciudad, CP, País…) y se cruzan por «Id. de parte».
// Se guarda un solo registro por empresa con el tipo «fact-prov» (así comparte las protecciones de los libros grandes: no se carga con el resto de datos).
import { paisDeSiglas } from './paises.js?v=1';
export function crearProveedores({ S, esc, render, empresa, puede, grande, reemplazarGrande }) {
  const TIPO = 'fact-prov';
  const esNifEsp = (n) => /^[0-9]{8}[A-Z]$/.test(n) || /^[XYZKLM][0-9]{7}[A-Z]$/.test(n) || /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(n);
  // país deducido del NIF (para los proveedores sin país en el listado de direcciones): NIF español → ES; prefijo de 2 letras → ese país
  const paisNif = (nif) => { const n = String(nif ?? '').toUpperCase().replace(/[\s.\-/]/g, ''); if (!n) return ''; if (esNifEsp(n)) return 'ES'; return /^[A-Z]{2}/.test(n) ? paisDeSiglas(n.slice(0, 2))?.c ?? '' : ''; };
  const P = { msg: '', q: '', pais: '', cargando: false };
  const id0 = (v) => String(v ?? '').trim().replace(/^0+/, '');
  const txt = (v) => String(v ?? '').trim();

  async function leerExcel(f) {
    if (!window.XLSX) throw new Error('No se cargó la librería de Excel. Recarga la página.');
    const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  }
  async function cargar(files) {
    if (P.cargando || !S.sel) return;
    P.cargando = true; P.msg = 'Leyendo los Excel…'; render();
    try {
      let provs = null, dirs = null;
      for (const f of files) {
        const a = await leerExcel(f), cab = (a[0] ?? []).map((x) => txt(x).toLowerCase());
        if (cab.includes('cuenta de proveedor')) provs = { a, cab }; else if (cab.includes('ciudad') && cab.includes('id. de parte')) dirs = { a, cab };
        else throw new Error(`${f.name}: no reconozco el listado (debe ser el de PROVEEDORES con «Cuenta de proveedor» o el de DIRECCIONES con «Ciudad»).`);
      }
      if (!provs && !dirs) throw new Error('No hay ningún listado válido.');
      const col = (z, n) => z.cab.indexOf(n);
      let filas = (grande(TIPO) ?? []).map((x) => ({ ...x }));
      if (provs) {
        const c = { id: col(provs, 'id. de parte'), cta: col(provs, 'cuenta de proveedor'), nif: col(provs, 'nif'), nom: col(provs, 'nombre'), gr: col(provs, 'grupo'), div: col(provs, 'divisa'), imp: col(provs, 'grupo de impuestos') };
        const prev = new Map(filas.map((x) => [id0(x.id), x]));
        filas = provs.a.slice(1).filter((r) => txt(r[c.id]) || txt(r[c.cta])).map((r) => { const id = txt(r[c.id]), o = prev.get(id0(id)) ?? {}; return { id, cuenta: txt(r[c.cta]), nif: txt(r[c.nif]), nombre: txt(r[c.nom]), grupo: txt(r[c.gr]), divisa: txt(r[c.div]), imp: txt(r[c.imp]), pais: o.pais ?? '', ciudad: o.ciudad ?? '', estado: o.estado ?? '', cp: o.cp ?? '', tel: o.tel ?? '', nDir: o.nDir ?? 0 }; });
      }
      let conPais = 0;
      if (dirs) {
        const c = { id: col(dirs, 'id. de parte'), tel: col(dirs, 'teléfono'), ciu: col(dirs, 'ciudad'), est: col(dirs, 'estado'), cp: col(dirs, 'código postal'), pais: col(dirs, 'país/región') };
        const M = new Map();
        for (const r of dirs.a.slice(1)) { // varias direcciones por proveedor: se toma la primera con país y, entre ellas, la que tiene ciudad
          const id = id0(r[c.id]); if (!id) continue;
          const d = { pais: txt(r[c.pais]).toUpperCase(), ciudad: txt(r[c.ciu]), estado: txt(r[c.est]), cp: txt(r[c.cp]), tel: txt(r[c.tel]) }, a = M.get(id);
          if (!a) M.set(id, { ...d, n: 1 }); else { a.n++; if ((!a.pais && d.pais) || (a.pais === d.pais && !a.ciudad && d.ciudad)) Object.assign(a, d); }
        }
        filas.forEach((x) => { const d = M.get(id0(x.id)); if (d) { Object.assign(x, { pais: d.pais, ciudad: d.ciudad, estado: d.estado, cp: d.cp, tel: d.tel, nDir: d.n }); } if (x.pais) conPais++; });
      }
      if (!filas.length) throw new Error('El listado no trae proveedores.');
      P.msg = 'Guardando…'; render();
      const ok = await reemplazarGrande(TIPO, S.sel, filas);
      P.msg = ok === false ? 'No se pudo guardar (mira el aviso).' : `✓ ${filas.length} proveedores guardados${dirs ? ` · ${filas.filter((x) => x.pais).length} con país` : ''}.`;
    } catch (err) { P.msg = `✖ ${err.message}`; }
    P.cargando = false; render();
  }

  const nombrePais = (c) => { const p = paisDeSiglas(c); return p ? `${p.nombre} (${p.c})` : c; };
  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande(TIPO);
    if (!L) return '<p class="vacio">Cargando datos…</p>';
    const e = empresa();
    const zona = puede() ? `<div class="dropzone" data-provdz tabindex="0" role="button"><b>Suelta aquí los listados de PROVEEDORES y de DIRECCIONES</b> (los dos Excel del ERP, a la vez o por separado) o pulsa para elegirlos. Se cruzan por «Id. de parte» y cada proveedor recibe su país.<input type="file" data-provfile accept=".xlsx,.xls" multiple hidden></div>` : '';
    const msg = P.msg ? `<p class="dash-s" style="font-size:.85rem">${esc(P.msg)}</p>` : '';
    if (!L.length) return `<div class="inicio"><section class="dsec"><h3>Proveedores · ${esc(e?.nombre ?? '')}</h3>${zona}${msg}<p class="vacio">Sin proveedores cargados.</p></section></div>`;
    const filas = L.map((x) => { const pd = paisDeSiglas(x.pais), p = pd ? pd.c : (x.pais ? x.pais.toUpperCase() : paisNif(x.nif)); return { ...x, p, inf: !x.pais && !!p }; });
    const cuenta = {}; filas.forEach((x) => { const k = x.p || ''; cuenta[k] = (cuenta[k] || 0) + 1; });
    const paises = Object.keys(cuenta).sort((a, b) => (cuenta[b] - cuenta[a]));
    const vis = filas.filter((x) => !P.pais || (P.pais === '__sin' ? !x.p : x.p === P.pais)), q = String(P.q).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const sinPais = cuenta[''] || 0;
    return `<div class="inicio m347 prov"><section class="dsec m347-fijo"><h3>Proveedores · ${esc(e?.nombre ?? '')} · ${L.length} proveedores · ${sinPais ? `<span class="d-ko">${sinPais} sin país</span>` : '<span class="d-ok">todos con país</span>'}</h3>
      <div class="m347-bar"><select data-prov="pais"><option value="">Todos los países</option>${sinPais ? `<option value="__sin"${P.pais === '__sin' ? ' selected' : ''}>(sin país) · ${sinPais}</option>` : ''}${paises.filter((p) => p).map((p) => `<option value="${p}"${P.pais === p ? ' selected' : ''}>${esc(nombrePais(p))} · ${cuenta[p]}</option>`).join('')}</select>
      <input type="search" data-prov="q" placeholder="🔍 Buscar por nombre, NIF, cuenta o ciudad…" value="${esc(P.q)}" autocomplete="off"></div></section>
      ${zona}${msg}
      <section class="dsec"><div class="wrap" style="max-height:calc(100vh - 14rem);overflow:auto"><table class="tabla"><thead><tr><th>Cuenta</th><th>NIF</th><th>Nombre</th><th>País</th><th>UE</th><th>Ciudad</th><th>CP</th><th>Grupo</th><th>Grupo de impuestos</th><th>Divisa</th></tr></thead><tbody>
      ${vis.map((x) => { const b = `${x.cuenta} ${x.nif} ${x.nombre} ${x.ciudad}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return `<tr data-b="${esc(b)}"${q && !b.includes(q) ? ' style="display:none"' : ''}><td>${esc(x.cuenta)}</td><td>${esc(x.nif)}</td><td>${esc(x.nombre)}</td><td>${x.p ? `${esc(nombrePais(x.p))}${x.inf ? ' <span class="hint" title="No viene en el listado de direcciones: se deduce del prefijo del NIF">(por NIF)</span>' : ''}` : '<span class="d-ko">sin país</span>'}</td><td style="text-align:center">${paisDeSiglas(x.p)?.ue ? '✓' : ''}</td><td>${esc(x.ciudad)}</td><td>${esc(x.cp)}</td><td>${esc(x.grupo)}</td><td>${esc(x.imp)}</td><td>${esc(x.divisa)}</td></tr>`; }).join('')}
      </tbody></table></div></section>
      <p class="hint">País = el de la dirección del proveedor en el listado de direcciones del ERP (si tiene varias, la primera con país y ciudad). Si no la tiene, se deduce del prefijo del NIF-IVA y se marca «por NIF». «UE» indica Estado miembro de la Unión Europea.</p></div>`;
  }

  // zona de soltar (propia: no depende de las demás pestañas)
  document.addEventListener('click', (ev) => { const z = ev.target.closest?.('[data-provdz]'); if (z && !ev.target.closest('input')) z.querySelector('input')?.click(); });
  document.addEventListener('change', (ev) => {
    const d = ev.target.dataset ?? {};
    if (d.provfile !== undefined) { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) cargar(fs); }
    else if (d.prov === 'pais') { P.pais = ev.target.value; render(); }
  });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-provdz]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { ev.target.closest?.('[data-provdz]')?.classList.remove('over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest?.('[data-provdz]'); if (!z || !puede()) return;
    ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over');
    const fs = [...ev.dataTransfer.files].filter((f) => /\.xlsx?$/i.test(f.name)); if (fs.length) cargar(fs);
  }, true);
  document.addEventListener('input', (ev) => {
    if (ev.target.dataset?.prov !== 'q') return;
    P.q = ev.target.value; const q = P.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    document.querySelectorAll('.prov tbody tr[data-b]').forEach((tr) => { tr.style.display = !q || tr.dataset.b.includes(q) ? '' : 'none'; });
  });
  return { tabs: { prov: ['Proveedores', 'Listado con país', vista] } };
}
