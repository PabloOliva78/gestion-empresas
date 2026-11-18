# Scripts del navegador (guardados aquí para poder reinstalarlos en otro ordenador)

## d365-filtro.user.js — buscar el proveedor/cliente en Dynamics 365
Cuando se da doble clic en un proveedor o cliente de la app, se abre D365 en su lista con `#cuenta=XXXXX` en la dirección.
El script escribe esa cuenta en el filtro de la lista y deja el registro seleccionado; tú pulsas «Transacciones».

Instalación (una vez por ordenador):
1. En Chrome, instala la extensión Tampermonkey (Chrome Web Store).
2. Tampermonkey > Crear un nuevo script > borra lo que haya, pega el contenido de `d365-filtro.user.js` y guarda (Ctrl+S).
3. Si Chrome pide activar el «Modo de desarrollador» o permitir scripts de usuario para Tampermonkey (chrome://extensions), actívalo.

Opciones: dentro del script, `PULSAR_TRANSACCIONES = true` hace que además pulse «Transacciones» solo.
Si cambia la pantalla de D365 tras una actualización y deja de buscar, se ajusta el script. Sin el script, la app copia la cuenta al portapapeles para pegarla con Ctrl+V en el filtro.
