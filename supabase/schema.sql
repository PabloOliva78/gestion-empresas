-- Ejecutar completo en Supabase > SQL Editor.
-- Roles: admin (todo), gestor (edita sus empresas), consulta (solo lectura).
-- El PRIMER usuario que se registre queda como admin activo; los demás
-- quedan inactivos hasta que un admin los active y les asigne rol/empresas.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  rol text not null default 'consulta' check (rol in ('admin','gestor','consulta')),
  activo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cif text,
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.empresa_usuarios (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (empresa_id, user_id)
);

create table public.obligaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  area text not null check (area in ('fiscal','contable','laboral')),
  nombre text not null,
  periodo text,
  vencimiento date,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','presentado')),
  notas text,
  created_at timestamptz not null default now()
);

create index on public.obligaciones (empresa_id);
create index on public.obligaciones (vencimiento);

-- Perfil automático al registrarse
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.profiles) into primero;
  insert into public.profiles (id, email, nombre, rol, activo)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', new.email),
          case when primero then 'admin' else 'consulta' end, primero);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- Funciones de permisos (security definer para evitar recursión de RLS)
create function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid() and activo
$$;

create function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'admin', false)
$$;

create function public.acceso_empresa(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.activo
      and (p.rol = 'admin' or exists (
        select 1 from public.empresa_usuarios eu
        where eu.empresa_id = eid and eu.user_id = p.id))
  )
$$;

create function public.puede_editar_empresa(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.acceso_empresa(eid) and public.mi_rol() in ('admin','gestor')
$$;

-- El creador de una empresa queda asignado a ella
create function public.asignar_creador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.empresa_usuarios (empresa_id, user_id)
    values (new.id, new.created_by) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger empresa_asigna_creador
after insert on public.empresas for each row execute function public.asignar_creador();

-- RLS
alter table public.profiles enable row level security;
alter table public.empresas enable row level security;
alter table public.empresa_usuarios enable row level security;
alter table public.obligaciones enable row level security;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.es_admin());
create policy profiles_update on public.profiles for update
  using (public.es_admin()) with check (public.es_admin());

create policy empresas_select on public.empresas for select
  using (public.acceso_empresa(id) or (created_by = auth.uid() and public.mi_rol() in ('admin','gestor')));
create policy empresas_insert on public.empresas for insert
  with check (public.mi_rol() in ('admin','gestor'));
create policy empresas_update on public.empresas for update
  using (public.puede_editar_empresa(id)) with check (public.puede_editar_empresa(id));
create policy empresas_delete on public.empresas for delete
  using (public.es_admin());

create policy eu_select on public.empresa_usuarios for select
  using (user_id = auth.uid() or public.es_admin());
create policy eu_admin_all on public.empresa_usuarios for all
  using (public.es_admin()) with check (public.es_admin());

create policy obl_select on public.obligaciones for select
  using (public.acceso_empresa(empresa_id));
create policy obl_insert on public.obligaciones for insert
  with check (public.puede_editar_empresa(empresa_id));
create policy obl_update on public.obligaciones for update
  using (public.puede_editar_empresa(empresa_id)) with check (public.puede_editar_empresa(empresa_id));
create policy obl_delete on public.obligaciones for delete
  using (public.puede_editar_empresa(empresa_id));
