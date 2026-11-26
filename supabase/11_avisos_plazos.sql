-- Aviso semanal de plazos por correo. Ejecutar después de 10 y después de desplegar la función «aviso-plazos» (ver AVISO_PLAZOS.md).

-- Una sola fila (id = 1) con la lista de plazos sin presentar que guarda la aplicación.
create table if not exists public.avisos_plazos (
  id int primary key check (id = 1),
  datos jsonb not null default '{}',
  actualizado timestamptz not null default now(),
  ultimo_envio timestamptz
);

alter table public.avisos_plazos enable row level security;
-- solo administradores (la lista incluye todas las empresas); la función de envío usa la clave de servicio
create policy avisos_select on public.avisos_plazos for select using (public.es_admin());
create policy avisos_insert on public.avisos_plazos for insert with check (public.es_admin());
create policy avisos_update on public.avisos_plazos for update using (public.es_admin()) with check (public.es_admin());
grant select, insert, update on public.avisos_plazos to authenticated;

-- Envío programado: cada lunes a las 06:00 UTC (07:00 u 08:00 en España). La clave es la pública «anon» de config.js;
-- la función no envía más de un correo cada 6 días aunque se la llame más veces.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('aviso-plazos-lunes', '0 6 * * 1', $$
  select net.http_post(
    url := 'https://ocgsxtbzbkzatpvusjcy.supabase.co/functions/v1/aviso-plazos',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ3N4dGJ6Ymt6YXRwdnVzamN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MzE3NzAsImV4cCI6MjEwOTIwNzc3MH0.GyjmL6Uoh_TkHVinGCMupB0UUzLcA9dz16F8pdJspPI"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
