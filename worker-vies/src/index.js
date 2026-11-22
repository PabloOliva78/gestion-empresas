// Intermediario para consultar el censo VIES de la Comisión Europea desde la app (el VIES no permite llamarlo directamente desde una página web).
// Recibe /?pais=DE&nif=123456789 y devuelve el JSON del VIES. Solo acepta peticiones de la página de la app. No guarda nada.
const ORIGENES = ['https://pablooliva78.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const PAISES = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)$/;

export default {
  async fetch(req) {
    const origen = req.headers.get('Origin') ?? '';
    const cab = { 'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0], 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cab });
    if (!ORIGENES.includes(origen)) return new Response(JSON.stringify({ error: 'origen no permitido' }), { status: 403, headers: cab });
    const u = new URL(req.url), pais = (u.searchParams.get('pais') ?? '').toUpperCase(), nif = (u.searchParams.get('nif') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!PAISES.test(pais) || !/^[A-Z0-9]{2,14}$/.test(nif)) return new Response(JSON.stringify({ error: 'pais o nif incorrectos' }), { status: 400, headers: cab });
    try {
      const r = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countryCode: pais, vatNumber: nif }) });
      return new Response(await r.text(), { status: r.status, headers: cab });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'no se pudo consultar el VIES' }), { status: 502, headers: cab });
    }
  },
};
