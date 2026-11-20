// Caché en el navegador de los libros grandes (facturas, SII, extractos…) para gastar menos tráfico de Supabase (el plan gratuito tiene 5 GB al mes).
// Antes de bajar un libro se pregunta SOLO por su fecha de última modificación (unos bytes); si coincide con la guardada, se usa la copia local y no se descarga nada.
// Necesita la columna registros.updated_at (supabase/10_updated_at.sql). Sin ella, o ante cualquier fallo de la caché, se lee de la base de datos como siempre.
// Solo para lecturas: lo que se lee para modificarlo y volver a guardarlo no pasa por aquí.
const NOMBRE = 'cache-libros-v1', ALMACEN = 'libros';
let abierta = null, sinColumna = false, apagada = false;

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

// Misma forma que la consulta original: { data: { id, datos } | null, error }
export async function leerRegistro(db, uid, empresaId, tipo) {
  const completo = () => db.from('registros').select('id,datos').eq('empresa_id', empresaId).eq('tipo', tipo).order('id').limit(1).maybeSingle();
  if (apagada || sinColumna || !uid || typeof indexedDB === 'undefined') return completo();
  const clave = `${uid}|${empresaId}|${tipo}`;
  let meta;
  try { meta = await db.from('registros').select('id,updated_at').eq('empresa_id', empresaId).eq('tipo', tipo).order('id').limit(1).maybeSingle(); } catch { return completo(); }
  if (meta.error) { if (/updated_at|column/i.test(meta.error.message || '')) sinColumna = true; return completo(); }
  if (!meta.data) return { data: null, error: null };
  try {
    const c = await idb('readonly', (a) => a.get(clave));
    if (c && c.id === meta.data.id && c.upd && c.upd === meta.data.updated_at) return { data: { id: c.id, datos: c.datos }, error: null };
  } catch { apagada = true; return completo(); }
  const r = await completo();
  if (!r.error && r.data) { try { await idb('readwrite', (a) => a.put({ id: r.data.id, upd: meta.data.updated_at, datos: r.data.datos }, clave)); } catch { /* sin espacio: se sigue sin caché */ } }
  return r;
}

// Al cerrar sesión se borra todo lo guardado en este navegador
export function limpiarCache() {
  try { abierta?.then((d) => d.close()).catch(() => {}); abierta = null; indexedDB.deleteDatabase(NOMBRE); } catch { /* nada que borrar */ }
}
