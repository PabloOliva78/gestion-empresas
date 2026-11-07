-- Bloque 10 · Exenciones y Leyes: textos de leyes cargados (Ley del IVA 37/1992, etc.).
-- Son comunes a todas las empresas: los lee cualquier usuario activo y los modifica un administrador o gestor.
-- Ejecutar una vez en el editor SQL de Supabase.
create table if not exists public.leyes (
  id text primary key,                 -- 'iva' = Ley 37/1992 del IVA
  nombre text not null,
  datos jsonb not null default '{}'::jsonb,   -- {secciones: [{id, tipo, num, titulo, texto}], exenciones: [...], fuente, cargada}
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.leyes enable row level security;

create policy leyes_select on public.leyes for select using (public.mi_rol() is not null);
create policy leyes_insert on public.leyes for insert with check (public.mi_rol() in ('admin','gestor'));
create policy leyes_update on public.leyes for update
  using (public.mi_rol() in ('admin','gestor')) with check (public.mi_rol() in ('admin','gestor'));
create policy leyes_delete on public.leyes for delete using (public.mi_rol() in ('admin','gestor'));
