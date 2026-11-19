# Extensión de Chrome «Herogra · abrir factura en D365»

Hace que el botón **🔎 D365** de la pestaña Emitidas abra la factura **en una pestaña de tu Chrome de diario** (como hace Esker), no en una ventana nueva.
La aplicación le manda el nº de factura y la empresa; la extensión abre el diario de facturas de D365, filtra la factura (cabecera «Factura» › «es exactamente» › Aplicar),
y pulsa Factura › Ver › «Vista previa de original», con clics reales (D365 ignora los simulados). Siempre usa la **misma pestaña** (la reutiliza, sin recargar D365 cuando es la misma empresa).

## Instalar (una vez por ordenador, ~1 minuto)
1. En Chrome, abre `chrome://extensions`.
2. Activa **«Modo de desarrollador»** (arriba a la derecha).
3. Pulsa **«Cargar descomprimida»** y elige esta carpeta (`scripts/extension-d365`, en Google Drive: `G:\Mi unidad\conciliacion-app\scripts\extension-d365`).
4. Comprueba que el ID sea `fndcidhkaoadpaceikbelbnbobhdnnaj` (está fijado con la clave del manifiesto; es el que usa la app en `d365.js`).
5. Recarga la app (Ctrl+F5) y pulsa «🔎 D365» en una factura de Emitidas.

No muevas ni borres la carpeta: Chrome la lee desde ahí. Si la cambias de sitio, vuelve a cargarla (el ID no cambia).

## Qué hace Chrome mientras trabaja
Mientras la extensión maneja la pestaña, Chrome enseña el aviso «**Herogra · abrir factura en D365 está depurando este navegador**». Desaparece solo al terminar. No pulses «Cancelar» en ese aviso.

## Si no funciona
- Si la extensión no está instalada o falla, la app usa el servicio local (`servidor-d365.js`) y, si tampoco, el enlace `d365://`.
- `flujo.js` son los pasos (los mismos que prueba `probar-flujo.mjs` con una sesión de depuración en el Chrome auxiliar); `background.js` recibe la petición de la app y se encarga de la pestaña.
- Solo acepta peticiones de `https://pablooliva78.github.io` y solo actúa en `https://herogra.operations.dynamics.com`.
