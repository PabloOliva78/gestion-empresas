-- Fecha de última modificación de cada registro: la app la usa para saber si un libro grande ha cambiado
-- y no volver a descargarlo entero cada vez (ahorra tráfico de salida de Supabase). No borra ni cambia ningún dato.
alter table public.registros add column if not exists updated_at timestamptz not null default now();

create or replace function public.registros_tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists registros_updated_at on public.registros;
create trigger registros_updated_at before update on public.registros
  for each row execute function public.registros_tocar_updated_at();
