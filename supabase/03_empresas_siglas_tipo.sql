-- Ejecutar después de 02_conciliaciones.sql.
alter table public.empresas
  add column if not exists siglas text,
  add column if not exists tipo text check (tipo in ('GE','PYME'));

-- Pasa a columnas lo que se había guardado en notas ("Sigla XXX · Tipo YYY")
update public.empresas
set siglas = substring(notas from 'Sigla (\w+)'),
    tipo = substring(notas from 'Tipo (\w+)'),
    notas = null
where notas like 'Sigla %';
