// Bloque 12 · Proveedores - Clientes. Pestaña «Clientes»: listado de clientes del ERP; el Excel ya trae el país de cada cliente.
// Se guarda un solo registro por empresa con el tipo «fact-cli» (como los libros grandes: no se carga con el resto de datos).
import { paisDeSiglas } from './paises.js?v=1';
import { crearVistaTercero } from './terceros-vista.js?v=1';
export function crearClientes({ S, esc, render, empresa, puede, grande, reemplazarGrande }) {
  const TIPO = 'fact-cli';
  const esNifEsp = (n) => /^[0-9]{8}[A-Z]$/.test(n) || /^[XYZKLM][0-9]{7}[A-Z]$/.test(n) || /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(n);
  // país deducido del NIF (si el listado no trae país): NIF español → ES; prefijo de 2 letras → ese país
  const paisNif = (nif) => { const n = String(nif ?? '').toUpperCase().replace(/[\s.\-/]/g, ''); if (!n) return ''; if (esNifEsp(n)) return 'ES'; return /^[A-Z]{2}/.test(n) ? paisDeSiglas(n.slice(0, 2))?.c ?? '' : ''; };
  const P = { msg: '', q: '', pais: '', cargando: false, nuevo: null };
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
      filas = filas.concat((grande(TIPO) ?? []).filter((x) => x.manual).map((x) => ({ ...x }))); // lo añadido a mano se conserva
      P.msg = 'Guardando…'; render();
      const ok = await reemplazarGrande(TIPO, S.sel, filas);
      P.msg = ok === false ? 'No se pudo guardar (mira el aviso).' : `✓ ${filas.length} clientes guardados · ${filas.filter((x) => x.pais).length} con país.`;
    } catch (err) { P.msg = `✖ ${err.message}`; }
    P.cargando = false; render();
  }

  const zona = () => (puede() ? `<div class="dropzone" data-clidz tabindex="0" role="button"><b>Suelta aquí el listado de CLIENTES</b> (Excel del ERP con «Cuenta», «Nombre», «NIF», «Grupo de clientes» y «País/región») o pulsa para elegirlo. Sustituye al listado anterior; lo añadido a mano se conserva.<input type="file" data-clifile accept=".xlsx,.xls" multiple hidden></div>` : '');
  const V = crearVistaTercero({ S, esc, render, empresa, puede, grande, reemplazarGrande, P, TIPO, clave: 'cli', titulo: 'Clientes', singular: 'cliente', extras: [['grupo', 'Grupo'], ['imp', 'Grupo de impuestos'], ['divisa', 'Divisa'], ['tel', 'Teléfono']], paisNif,
    zona, nota: 'País = el que trae el listado de clientes del ERP. Si algún cliente no lo trae, se deduce del prefijo del NIF-IVA y se marca «por NIF». «UE» indica Estado miembro de la Unión Europea. Los clientes añadidos a mano no se pierden al volver a cargar el Excel.' });
  V.activar();
  const vista = () => V.vista();
  document.addEventListener('click', (ev) => { const z = ev.target.closest?.('[data-clidz]'); if (z && !ev.target.closest('input')) z.querySelector('input')?.click(); });
  document.addEventListener('change', (ev) => {
    const d = ev.target.dataset ?? {};
    if (d.clifile !== undefined) { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) cargar(fs); }
  });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-clidz]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { ev.target.closest?.('[data-clidz]')?.classList.remove('over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest?.('[data-clidz]'); if (!z || !puede()) return;
    ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over');
    const fs = [...ev.dataTransfer.files].filter((f) => /\.xlsx?$/i.test(f.name)); if (fs.length) cargar(fs);
  }, true);
  return { tabs: { cli: ['Clientes', 'Listado con país', vista] } };
}
