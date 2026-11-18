# Scripts y tareas automáticas del proyecto (guardados aquí para reinstalarlos en otro ordenador)

Todo lo que no es la propia web vive en esta carpeta o en `.github/workflows`. Se recupera clonando/copiando el proyecto.

## Scripts de Chrome (Tampermonkey)
Instalación, una vez por ordenador:
1. En Chrome, instala la extensión **Tampermonkey** (Chrome Web Store).
2. Tampermonkey > Crear un nuevo script > borra lo que haya, pega el contenido del `.user.js` y guarda (Ctrl+S).
3. Si Chrome pide activar el «Modo de desarrollador» para los scripts de usuario (chrome://extensions), actívalo.

### d365-filtro.user.js — buscar el proveedor/cliente en Dynamics 365
Al dar doble clic en un proveedor o cliente de la app (Proveedores, Clientes y Transacciones), se abre D365 en su lista con `#cuenta=XXXXX` en la dirección.
El script escribe esa cuenta en el filtro de la lista y deja el registro seleccionado; tú pulsas «Transacciones».
- Si no está instalado, la app copia la cuenta al portapapeles para pegarla con Ctrl+V en el filtro.
- `PULSAR_TRANSACCIONES = true` intenta pulsar «Transacciones» solo, pero D365 ignora los clics simulados: de momento no funciona.
- Si D365 cambia su pantalla tras una actualización y deja de buscar, hay que ajustarlo.

### esker-buscar-factura.user.js — buscar la factura en Esker
Al abrir Esker desde el botón 🔎 de la app (libro de facturas recibidas), filtra la factura y abre su ficha con el PDF.

## Tareas programadas
- **GitHub Actions** `.github/workflows/mantener-supabase-activo.yml`: cada día a las 06:17 (UTC) hace una consulta ligera a Supabase para que el plan gratuito no pause el proyecto. Va con el repositorio: no hay que reinstalar nada.
- Tareas programadas de Claude o del Programador de tareas de Windows relacionadas con el proyecto: ninguna.

No hay scripts de «libros» ni de «Intrastat» en el proyecto: esas partes están dentro de la propia app (`lectores.js`, `modulos.js`, `modelos.js`…).
