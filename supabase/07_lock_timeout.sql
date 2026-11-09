-- Tiempo máximo de espera cuando otra operación tiene bloqueada la misma fila.
-- Sale el aviso «canceling statement due to lock timeout» si se guarda dos veces seguidas el mismo libro de IVA o del Intrastat
-- (cada libro es UNA fila por empresa en la tabla registros).
-- Se ejecuta UNA VEZ en Supabase > SQL Editor.
alter role authenticated set lock_timeout = '120s';
alter role anon set lock_timeout = '30s';
notify pgrst, 'reload config';

-- Para comprobarlo (debe devolver lock_timeout=2min en authenticated):
-- select rolname, rolconfig from pg_roles where rolname in ('authenticated', 'anon');