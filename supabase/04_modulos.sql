-- Ejecutar después de 03. Bloques 1 y 2: registros genéricos, fichas y documentos.

-- Fichas (datos censales y registrales) dentro de la empresa
alter table public.empresas add column if not exists datos jsonb not null default '{}';

-- Registros genéricos (retenciones, presentados, notificaciones, DUA, titulares, escrituras, documentos...)
create table public.registros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null,
  ejercicio int,
  datos jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.registros (empresa_id, tipo, ejercicio);

alter table public.registros enable row level security;
create policy reg_select on public.registros for select using (public.acceso_empresa(empresa_id));
create policy reg_insert on public.registros for insert with check (public.puede_editar_empresa(empresa_id));
create policy reg_update on public.registros for update
  using (public.puede_editar_empresa(empresa_id)) with check (public.puede_editar_empresa(empresa_id));
create policy reg_delete on public.registros for delete using (public.puede_editar_empresa(empresa_id));
grant select, insert, update, delete on public.registros to authenticated;

-- Almacén privado de PDF/Excel: la primera carpeta de cada archivo es el id de la empresa
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy doc_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.acceso_empresa(((storage.foldername(name))[1])::uuid));
create policy doc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.puede_editar_empresa(((storage.foldername(name))[1])::uuid));
create policy doc_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.puede_editar_empresa(((storage.foldername(name))[1])::uuid));
create policy doc_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.puede_editar_empresa(((storage.foldername(name))[1])::uuid));
