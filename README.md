# Gestión fiscal, contable y laboral

Web estática (GitHub Pages) + base de datos y login en la nube (Supabase, plan gratuito). Los datos NO se guardan en su equipo ni en GitHub.

## Puesta en marcha

### 1. Supabase (nube)
1. Cree cuenta en https://supabase.com y un proyecto nuevo, **región UE (Frankfurt)**.
2. **SQL Editor** → ejecute primero `supabase/schema.sql` y después `supabase/02_conciliaciones.sql`.
3. **Project Settings → API**: copie *Project URL* y la clave *anon public* en `config.js`.
4. **Authentication → Providers → Email**: deje activado. Para que el administrador pueda crear usuarios que entren directamente, desactive *Confirm email* (o déjelo activo y cada usuario confirmará su correo).

### 2. GitHub Pages
1. Cree un repositorio en GitHub y suba el contenido de esta carpeta (el repositorio puede ser público: no contiene datos; la clave *anon* es pública por diseño y la protección la hace RLS).
2. **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`.
3. En Supabase, **Authentication → URL Configuration**: ponga como *Site URL* la dirección de su página (`https://SU-USUARIO.github.io/SU-REPO/`).

### 3. Primer acceso
El **primer usuario que se registre** es administrador. Los siguientes quedan inactivos hasta que el administrador los active (pestaña *Usuarios*), o los cree él directamente con *Nuevo usuario*.

## Roles
| Rol | Puede |
|---|---|
| Administrador | Todo: usuarios, roles, todas las empresas |
| Gestor | Crear empresas y editar empresas/obligaciones que tiene asignadas |
| Consulta | Solo ver las empresas asignadas |

Los permisos se aplican en la base de datos (RLS), no solo en pantalla.

## Limitaciones del plan gratuito
- Supabase pausa proyectos tras ~1 semana sin actividad (se reactiva desde su panel).
- Copias de seguridad automáticas no incluidas: exporte los datos periódicamente.
- Son datos personales/laborales: aplique RGPD (contrato de encargado con Supabase, contraseñas robustas).

## Módulos
1. ✅ Base: login, usuarios/roles, empresas, obligaciones (fiscal, contable, laboral, Registro Mercantil) y **calendario estándar** (303, 111, 115, 190, 390, 347, 200, Seguros Sociales, legalización de libros, depósito de cuentas). Las fechas son orientativas para año natural: revíselas.
2. ✅ Conciliaciones: saldo contable vs. documento oficial por empresa, ejercicio y periodo, con plantillas para las cuentas 4700, 4750, 472, 477, 4751, 4752, 473, 474, 476, 465, 640 y 642. Marca Cuadra / Descuadre / Justificada.
3. Pendiente: importar saldos desde el balance de sumas y saldos (Excel/CSV) y cuadres cruzados automáticos (p. ej. 640 vs. Modelo 190, 642 vs. RLC, 476 vs. 642).
4. Pendiente: avisos de vencimientos próximos.
