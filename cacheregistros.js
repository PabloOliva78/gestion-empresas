// Carga incremental de la tabla «registros» (todos los documentos, estados, nóminas… menos los libros grandes) para gastar mucho menos tráfico de Supabase.
// Antes, cada guardado volvía a bajar TODOS los registros de TODAS las empresas. Ahora solo se pide la lista ligera (id + fecha de modificación) y se descargan
// únicamente los registros nuevos o modificados; el resto sale de la memoria o de la copia guardada en este navegador (IndexedDB).
// Necesita registros.updated_at (supabase/10_updated_at.sql). Sin ella, o ante cualquier fallo, se carga todo como siempre (completo()).
const NOMBRE = 'cache-registros-v1', ALMACEN = 'reg';
let abierta = null, mem = null, sinColumna = false, apagada = false;

function abrir() {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      try {
        const r = indexedDB.open(NOMBRE, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
      } catch (e) { mal(e); }
    });
  }
  return abierta;
}
const idb = (modo, fn) => abrir().then((d) => new Promise((ok, mal) => {
  const t = d.transaction(ALMACEN, modo), q = fn(t.objectStore(ALMACEN));
  t.oncomplete = () => ok(q?.result); t.onerror = () => mal(t.error); t.onabort = () => mal(t.error);
}));

const COLS = 'id,empresa_id,tipo,ejercicio,datos';

// base(cols): consulta de registros ya filtrada (los tipos pesados excluidos); completo(): la carga de siempre
export async function cargarRegistros(uid, base, completo) {
  if (apagada || sinColumna || !uid || typeof indexedDB === 'undefined') return completo();
  try {
    const ligera = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await base('id,updated_at').order('id').range(d, d + 999);
      if (error || !data) { if (/updated_at|column/i.test(error?.message || '')) sinColumna = true; return completo(); }
      ligera.push(...data);
      if (data.length < 1000) break;
    }
    if (!mem || mem.uid !== uid) {
      const c = await idb('readonly', (a) => a.get('reg|' + uid)).catch(() => { apagada = true; return null; });
      if (apagada) return completo();
      mem = { uid, filas: new Map((c?.filas ?? []).map((f) => [f.id, f])), upd: new Map(Object.entries(c?.upd ?? {})) };
    }
    let cambio = false;
    const vivos = new Set(ligera.map((x) => x.id));
    for (const id of [...mem.filas.keys()]) if (!vivos.has(id)) { mem.filas.delete(id); mem.upd.delete(id); cambio = true; }
    const faltan = ligera.filter((x) => !mem.filas.has(x.id) || mem.upd.get(x.id) !== x.updated_at);
    for (let i = 0; i < faltan.length; i += 100) {
      const lote = faltan.slice(i, i + 100);
      const { data, error } = await base(COLS).in('id', lote.map((x) => x.id));
      if (error || !data) return completo();
      const ts = new Map(lote.map((x) => [x.id, x.updated_at]));
      for (const f of data) { mem.filas.set(f.id, f); mem.upd.set(f.id, ts.get(f.id)); }
      cambio = true;
    }
    if (cambio) { const filas = [...mem.filas.values()], upd = Object.fromEntries(mem.upd); idb('readwrite', (a) => a.put({ filas, upd }, 'reg|' + uid)).catch(() => { /* sin espacio: se sigue con la memoria */ }); }
    return ligera.map((x) => mem.filas.get(x.id)).filter(Boolean);
  } catch { return completo(); }
}

export function limpiarCacheRegistros() {
  mem = null;
  try { abierta?.then((d) => d.close()).catch(() => {}); abierta = null; indexedDB.deleteDatabase(NOMBRE); } catch { /* nada que borrar */ }
}
