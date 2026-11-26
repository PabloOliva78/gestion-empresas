// Envía por correo los plazos sin presentar que la aplicación guarda en «avisos_plazos».
// Secretos (Supabase > Edge Functions > Secrets): RESEND_API_KEY, AVISO_PARA (una o varias direcciones separadas por comas) y, opcional, AVISO_DE.
import { createClient } from 'npm:@supabase/supabase-js@2';

const DIAS = 10;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fdia = (s: string) => s.split('-').reverse().join('/');
const resp = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  const clave = Deno.env.get('RESEND_API_KEY'), para = (Deno.env.get('AVISO_PARA') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!clave || !para.length) return resp(500, { error: 'Faltan los secretos RESEND_API_KEY o AVISO_PARA' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await db.from('avisos_plazos').select('datos,actualizado,ultimo_envio').eq('id', 1).maybeSingle();
  if (error) return resp(500, { error: error.message });
  if (!data) return resp(200, { enviado: false, motivo: 'La aplicación todavía no ha guardado la lista de plazos' });
  if (data.ultimo_envio && Date.now() - Date.parse(data.ultimo_envio) < 6 * 864e5) return resp(200, { enviado: false, motivo: 'Ya se envió en los últimos 6 días' });

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()); // AAAA-MM-DD
  const dias = (f: string) => Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5);
  const plazos: { f: string; t: string; e: string }[] = data.datos?.plazos ?? [];
  const venc = plazos.filter((x) => dias(x.f) < 0), prox = plazos.filter((x) => dias(x.f) >= 0 && dias(x.f) <= DIAS);
  const antig = Math.floor((Date.now() - Date.parse(data.actualizado)) / 864e5);
  const fila = (x: { f: string; t: string; e: string }) => {
    const d = dias(x.f), txt = d < 0 ? 'Vencido' : d === 0 ? 'Vence hoy' : `En ${d} día${d === 1 ? '' : 's'}`;
    return `<tr><td style="border:1px solid #ccc;padding:4px 8px">${esc(x.e)}</td><td style="border:1px solid #ccc;padding:4px 8px">${esc(x.t)}</td><td style="border:1px solid #ccc;padding:4px 8px">${fdia(x.f)}</td><td style="border:1px solid #ccc;padding:4px 8px;color:${d <= 0 ? '#a50e0e' : '#8a5a00'}">${txt}</td></tr>`;
  };
  const asunto = venc.length + prox.length ? `Plazos: ${venc.length} vencido(s) y ${prox.length} que vencen en ${DIAS} días` : `Plazos: nada pendiente en los próximos ${DIAS} días`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111"><p><b>${asunto}</b></p>
    ${venc.length + prox.length ? `<table style="border-collapse:collapse;font-size:13px"><tr>${['Empresa', 'Modelo y periodo', 'Vence', 'Estado'].map((c) => `<th style="border:1px solid #ccc;padding:4px 8px;text-align:left;background:#eef0f4">${c}</th>`).join('')}</tr>${[...venc, ...prox].map(fila).join('')}</table>` : ''}
    <p style="color:${antig >= 3 ? '#a50e0e' : '#666'};font-size:12px">Lista guardada por la aplicación el ${new Date(data.actualizado).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}${antig >= 3 ? ` (hace ${antig} días: ábrela para actualizarla)` : ''}.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('AVISO_DE') ?? 'Plazos <onboarding@resend.dev>', to: para, subject: asunto, html }),
  });
  if (!r.ok) return resp(502, { error: `El servicio de correo respondió ${r.status}`, detalle: (await r.text()).slice(0, 300) });
  await db.from('avisos_plazos').update({ ultimo_envio: new Date().toISOString() }).eq('id', 1);
  return resp(200, { enviado: true, vencidos: venc.length, proximos: prox.length });
});
