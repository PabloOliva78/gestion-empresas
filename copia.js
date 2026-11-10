// Copia de seguridad (bloque 11 · Administración): descarga todos los datos de la web en un archivo ZIP. Pestaña nueva, solo administradores.
// No toca ninguna otra pestaña. Es una copia para guardar; no restaura nada por sí sola.
export function crearCopia({ db, S, esc, render }) {
  const PESADO = (t) => /^(fact-|sii-)/.test(t ?? '') || ['may-mov', 'm592-mov', 'a22src', 'intra'].includes(t);
  const E = { corriendo: false, msg: '', error: '', conPdf: false, listo: '' };
  const ultima = () => { try { return localStorage.getItem('copia-ultima') || ''; } catch { return ''; } };
  const diasDesde = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 864e5) : null);

  async function pagina(tabla, cols, extra) {
    const out = [];
    for (let d = 0; ; d += 1000) {
      let q = db.from(tabla).select(cols).range(d, d + 999);
      if (extra) q = extra(q);
      const { data, error } = await q;
      if (error) throw new Error(`${tabla}: ${error.message}`);
      out.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    return out;
  }
  // rutas de archivos (PDF, Excel…) guardados en Storage que cita algún registro
  function rutas(registros) {
    const s = new Set();
    const ver = (v) => { if (!v || typeof v !== 'object') return; if (typeof v.path === 'string' && v.path.includes('/')) s.add(v.path); for (const x of Object.values(v)) ver(x); };
    registros.forEach((r) => ver(r.datos));
    return [...s];
  }

  async function copiar() {
    if (E.corriendo) return;
    E.corriendo = true; E.error = ''; E.listo = ''; E.msg = 'Preparando…'; render();
    try {
      if (!window.JSZip) throw new Error('No se cargó la librería de compresión (JSZip). Recarga la página.');
      const zip = new window.JSZip(), fecha = new Date().toISOString().slice(0, 10), resumen = {};
      const paso = (t) => { E.msg = t; render(); };
      for (const [tabla, extra] of [['empresas'], ['obligaciones'], ['conciliaciones'], ['empresa_usuarios'], ['profiles']]) {
        paso(`Leyendo ${tabla}…`);
        const f = await pagina(tabla, '*', extra && ((q) => q));
        zip.file(`${tabla}.json`, JSON.stringify(f)); resumen[tabla] = f.length;
      }
      paso('Leyendo el historial de cambios…');
      try { const f = await pagina('auditoria', '*', (q) => q.order('id')); zip.file('auditoria.json', JSON.stringify(f)); resumen.auditoria = f.length; } catch { resumen.auditoria = 'no activado'; }
      paso('Contando los registros…');
      const lista = await pagina('registros', 'id,empresa_id,tipo,ejercicio', (q) => q.order('id')), todos = [];
      const ligeros = lista.filter((r) => !PESADO(r.tipo)), pesados = lista.filter((r) => PESADO(r.tipo));
      for (let i = 0; i < ligeros.length; i += 150) {
        paso(`Registros: ${Math.min(i + 150, ligeros.length)} de ${ligeros.length} (más ${pesados.length} libros grandes)…`);
        const { data, error } = await db.from('registros').select('*').in('id', ligeros.slice(i, i + 150).map((r) => r.id));
        if (error) throw new Error(`registros: ${error.message}`);
        todos.push(...(data ?? []));
      }
      for (let i = 0; i < pesados.length; i++) {
        paso(`Libros grandes: ${i + 1} de ${pesados.length} (${pesados[i].tipo})…`);
        const { data, error } = await db.from('registros').select('*').eq('id', pesados[i].id).maybeSingle();
        if (error) throw new Error(`${pesados[i].tipo}: ${error.message}`);
        if (data) todos.push(data);
      }
      zip.file('registros.json', JSON.stringify(todos)); resumen.registros = todos.length;
      if (E.conPdf) {
        const rs = rutas(todos); let n = 0, mal = 0;
        for (const p of rs) {
          paso(`Archivos: ${++n} de ${rs.length}…`);
          const { data, error } = await db.storage.from('documentos').download(p);
          if (error || !data) { mal++; continue; }
          zip.file(`documentos/${p}`, data);
        }
        resumen.archivos = `${rs.length - mal} de ${rs.length}`;
      }
      zip.file('LEEME.txt', `Copia de seguridad de la web de gestión de empresas\r\nFecha: ${new Date().toLocaleString('es-ES')}\r\nUsuario: ${S.perfil?.nombre || S.perfil?.email || ''}\r\n\r\n${Object.entries(resumen).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\nCada .json es una tabla de la base de datos. ${E.conPdf ? 'La carpeta documentos/ trae los archivos guardados.' : 'Esta copia no incluye los PDF ni los Excel guardados.'}\r\n`);
      paso('Comprimiendo…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `copia-seguridad-${fecha}.zip` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      try { localStorage.setItem('copia-ultima', new Date().toISOString()); } catch { /* sin almacenamiento */ }
      E.listo = `Copia descargada: copia-seguridad-${fecha}.zip (${(blob.size / 1048576).toFixed(1)} MB) · ${Object.entries(resumen).map(([k, v]) => `${k} ${v}`).join(' · ')}`;
    } catch (err) { E.error = err.message; }
    E.corriendo = false; E.msg = ''; render();
  }

  function vista() {
    const u = ultima(), d = diasDesde(u);
    return `<section class="dsec"><h3>Copia de seguridad</h3>
      <p class="dash-s" style="font-size:.85rem">${u ? `Última copia descargada desde este navegador: <b>${new Date(u).toLocaleString('es-ES')}</b>${d >= 30 ? ` · <span class="d-ko">hace ${d} días, conviene hacer otra</span>` : ''}` : '<span class="d-ko">Todavía no has descargado ninguna copia desde este navegador.</span>'}</p>
      <p class="hint">Descarga un archivo ZIP con todos los datos de la web: empresas, obligaciones, conciliaciones, usuarios, historial de cambios y todos los registros (impuestos presentados, nóminas, libros de IVA, SII, extractos, etc.). Guárdalo en OneDrive o en otro disco.</p>
      <label style="display:block;margin:.6rem 0"><input type="checkbox" data-copia="pdf"${E.conPdf ? ' checked' : ''}${E.corriendo ? ' disabled' : ''}> Incluir también los PDF y Excel guardados <span class="hint">(tarda mucho más y el archivo pesa bastante más)</span></label>
      <button class="small" data-copia-act="copiar"${E.corriendo ? ' disabled' : ''}>⬇ Descargar copia de seguridad</button>
      ${E.corriendo ? `<p class="dash-s" style="font-size:.85rem">⏳ ${esc(E.msg)} No cierres ni cambies de pestaña hasta que termine.</p>` : ''}
      ${E.listo ? `<p class="d-ok" style="font-size:.85rem">✓ ${esc(E.listo)}</p>` : ''}
      ${E.error ? `<p class="d-ko" style="font-size:.85rem">✖ ${esc(E.error)}</p>` : ''}
      <p class="hint">Es una copia para guardar por si algo se pierde: la web no la restaura sola. Si hiciera falta recuperar datos, se hace con este archivo.</p></section>`;
  }

  document.addEventListener('change', (ev) => { if (ev.target.dataset?.copia === 'pdf') { E.conPdf = ev.target.checked; render(); } });
  document.addEventListener('click', (ev) => { if (ev.target.closest?.('[data-copia-act="copiar"]')) copiar(); });

  return { tabs: { copia: ['Copia de seguridad', 'Descargar todos los datos', vista, true] } };
}
