-- Historial de cambios: quién cambió qué y cuándo.
-- Se ejecuta UNA VEZ en Supabase > SQL Editor. No cambia nada de lo que ya funciona: solo añade una tabla y dos disparadores que anotan los cambios.
-- Solo los administradores pueden leer el historial (pestaña «Historial de cambios» del bloque 11).

create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  fecha       timestamptz not null default now(),
  usuario_id  uuid,
  usuario     text,
  tabla       text not null,
  operacion   text not null,          -- INSERT, UPDATE o DELETE
  registro_id text,
  empresa_id  uuid,
  tipo        text,                   -- tipo del registro (prs, nominas, ctacfg…)
  ejercicio   int,
  antes       jsonb,
  despues     jsonb
);
create index if not exists auditoria_fecha_idx on public.auditoria (fecha desc);
create index if not exists auditoria_empresa_idx on public.auditoria (empresa_id, fecha desc);

alter table public.auditoria enable row level security;
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select using (public.es_admin());
-- no hay políticas de insert/update/delete: solo escribe el disparador (security definer)

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text; v_emp uuid; v_ej int; v_id text; v_a jsonb; v_d jsonb; v_mail text;
  pesado boolean := false;
begin
  select coalesce(nullif(nombre, ''), email) into v_mail from public.profiles where id = auth.uid();

  if TG_TABLE_NAME = 'registros' then
    if TG_OP = 'DELETE' then
      v_tipo := OLD.tipo; v_emp := OLD.empresa_id; v_ej := OLD.ejercicio; v_id := OLD.id::text; v_a := OLD.datos;
    elsif TG_OP = 'INSERT' then
      v_tipo := NEW.tipo; v_emp := NEW.empresa_id; v_ej := NEW.ejercicio; v_id := NEW.id::text; v_d := NEW.datos;
    else
      v_tipo := NEW.tipo; v_emp := NEW.empresa_id; v_ej := NEW.ejercicio; v_id := NEW.id::text; v_a := OLD.datos; v_d := NEW.datos;
    end if;
    -- libros de IVA, SII, mayor, etc.: pesan mucho; solo se anota que se tocaron
    pesado := v_tipo like 'fact-%' or v_tipo like 'sii-%' or v_tipo in ('may-mov', 'm592-mov', 'a22src', 'intra');
    if pesado then
      v_a := null; v_d := null;
    else
      if TG_OP = 'UPDATE' and v_a is not distinct from v_d then return null; end if; -- sin cambios reales
      if length(coalesce(v_a::text, '')) > 300000 then v_a := null; end if;
      if length(coalesce(v_d::text, '')) > 300000 then v_d := null; end if;
    end if;
  elsif TG_TABLE_NAME = 'empresas' then
    v_tipo := 'empresa';
    if TG_OP = 'DELETE' then
      v_emp := OLD.id; v_a := to_jsonb(OLD) #- '{datos,logo}';
    elsif TG_OP = 'INSERT' then
      v_emp := NEW.id; v_d := to_jsonb(NEW) #- '{datos,logo}';
    else
      v_emp := NEW.id; v_a := to_jsonb(OLD) #- '{datos,logo}'; v_d := to_jsonb(NEW) #- '{datos,logo}';
      if v_a is not distinct from v_d then return null; end if;
    end if;
    v_id := v_emp::text;
  end if;

  insert into public.auditoria (usuario_id, usuario, tabla, operacion, registro_id, empresa_id, tipo, ejercicio, antes, despues)
  values (auth.uid(), v_mail, TG_TABLE_NAME, TG_OP, v_id, v_emp, v_tipo, v_ej, v_a, v_d);
  return null;
end $$;

drop trigger if exists auditar_registros on public.registros;
create trigger auditar_registros after insert or update or delete on public.registros
  for each row execute function public.auditar();

drop trigger if exists auditar_empresas on public.empresas;
create trigger auditar_empresas after insert or update or delete on public.empresas
  for each row execute function public.auditar();

notify pgrst, 'reload schema';

-- Para comprobarlo, después de guardar algo en la web:
-- select fecha, usuario, tabla, operacion, tipo from public.auditoria order by fecha desc limit 10;
