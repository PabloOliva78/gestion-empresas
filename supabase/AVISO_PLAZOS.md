# Activar el aviso semanal de plazos por correo

1. **Cuenta de envío** (la crea el responsable): alta en https://resend.com y crear una clave de API. Sin dominio propio verificado, Resend solo
   permite enviar a la dirección con la que se abrió la cuenta (comprobar sus condiciones actuales).
2. **Secretos** en Supabase > Edge Functions > Secrets (los pega el responsable): `RESEND_API_KEY` y `AVISO_PARA`
   (direcciones separadas por comas). Con dominio verificado, también `AVISO_DE`.
3. **Función**: desplegar `supabase/functions/aviso-plazos`.
4. **Base de datos**: ejecutar `supabase/11_avisos_plazos.sql` en el SQL Editor.
5. **Comprobar**: abrir la aplicación como administrador, pestaña «Aviso de plazos» > «Guardar ahora», y lanzar la función una vez a mano.

Para dejar de enviar: `select cron.unschedule('aviso-plazos-lunes');`
