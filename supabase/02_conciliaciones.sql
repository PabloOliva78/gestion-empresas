-- Ejecutar DESPUÉS de schema.sql (Supabase > SQL Editor).

-- Área "mercantil" (Registro Mercantil) en las obligaciones
alter table public.obligaciones drop constraint if exists obligaciones_area_check;
alter table public.obligaciones add constraint obligaciones_area_check
  check (area in ('fiscal','contable','laboral','mercantil'));

-- Conciliación: saldo contable de una cuenta vs. importe del documento oficial
-- (modelo AEAT, RLC/RNT de la Seguridad Social, nóminas...)
create table public.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ejercicio int not null,
  periodo text not null,                 -- 1T..4T, Anual, 01..12
  cuenta text not null,                  -- 4750, 476, 465, 640, 642...
  concepto text not null,
  fuente text,                           -- Modelo 303, RLC...
  saldo_contable numeric(14,2) not null default 0,
  importe_oficial numeric(14,2) not null default 0,
  diferencia numeric(14,2) generated always as (saldo_contable - importe_oficial) stored,
  justificada boolean not null default false,
  notas text,
  created_at timestamptz not null default now()
);

create index on public.conciliaciones (empresa_id, ejercicio);

alter table public.conciliaciones enable row level security;

create policy conc_select on public.conciliaciones for select
  using (public.acceso_empresa(empresa_id));
create policy conc_insert on public.conciliaciones for insert
  with check (public.puede_editar_empresa(empresa_id));
create policy conc_update on public.conciliaciones for update
  using (public.puede_editar_empresa(empresa_id)) with check (public.puede_editar_empresa(empresa_id));
create policy conc_delete on public.conciliaciones for delete
  using (public.puede_editar_empresa(empresa_id));
