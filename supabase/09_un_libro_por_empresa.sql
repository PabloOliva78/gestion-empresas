-- Un solo registro por empresa y tipo para los libros grandes (IVA, SII, extractos, Intrastat…).
-- Si por una prisa o un fallo la web intentara crear una segunda fila del mismo libro, la base de datos ya no la deja
-- (antes se creaba y la web enseñaba «Sin datos» porque no sabía cuál leer).
-- Se ejecuta UNA VEZ en Supabase > SQL Editor. No cambia ni borra ningún dato.
create unique index if not exists registros_libro_unico on public.registros (empresa_id, tipo)
  where tipo like 'fact-%' or tipo like 'sii-%' or tipo in ('may-mov', 'm592-mov', 'a22src', 'intra');
notify pgrst, 'reload schema';
