-- Tiempo máximo de las consultas de la aplicación.
-- Los libros de IVA y los extractos se guardan en UNA fila por empresa (tabla registros, campo datos). Cuando el libro es grande
-- (miles de líneas), actualizarlo tarda más de lo que Supabase permite por defecto a los usuarios de la aplicación (unos 8 segundos)
-- y sale el aviso «canceling statement due to statement timeout» (por ejemplo al pasar una línea de recibidas a emitidas).
-- Se ejecuta UNA VEZ en Supabase › SQL Editor.
alter role authenticated set statement_timeout = '120s';
alter role anon set statement_timeout = '30s';
notify pgrst, 'reload config';

-- Para comprobarlo (debe devolver 2 min en authenticated):
-- select rolname, rolconfig from pg_roles where rolname in ('authenticated', 'anon');
