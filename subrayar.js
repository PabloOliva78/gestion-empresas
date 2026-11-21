// Subrayado en amarillo de lo más importante de un artículo (Ley del IVA y Reglamento de facturación): plazos, importes y porcentajes,
// obligaciones y prohibiciones («deberán», «no podrán»…), excepciones y exenciones. Se aplica al texto ya escapado y con las palabras buscadas marcadas.
const N = '(?:\\d[\\d.,]*|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|sesenta|noventa)';
const PATRONES = [
  'antes del d[ií]a \\d+ del mes siguiente(?:\\s+[^\\s,.;:]+){0,7}',
  '\\bplazos?\\b(?:\\s+[^\\s,.;:]+){0,6}',
  `\\b${N}\\s+(?:d[ií]as(?: h[aá]biles| naturales)?|meses|a[ñn]os|euros|por ciento)\\b`,
  '\\b\\d[\\d.,]*\\s?(?:€|%)',
  '\\b(?:deber[aá]n?|estar[aá]n? obligad[oa]s?|ser[aá]n? obligatori[oa]s?|obligatoriamente|no podr[aá]n?|no se podr[aá]n?|no proceder[aá]|no estar[aá]n? obligad[oa]s?|no tendr[aá]n?|no ser[aá]n?)\\b(?:\\s+[^\\s,.;:]+){0,9}',
  '\\b(?:salvo|excepto|exceptuad[oa]s?)\\b(?:\\s+[^\\s,.;:]+){0,5}',
  '\\b(?:exentas?|no sujet[oa]s?)\\b(?:\\s+[^\\s,.;:]+){0,3}',
  'inversi[oó]n del sujeto pasivo',
  '\\b(?:se devenga(?:r[aá]n?)?|devengo)\\b(?:\\s+[^\\s,.;:]+){0,4}',
  '\\btipos? (?:impositivos? )?(?:general|reducido|superreducido)(?:\\s+[^\\s,.;:]+){0,2}',
];
const RE = new RegExp(PATRONES.join('|'), 'gi');

// html: texto de un párrafo ya escapado (puede llevar <mark> de las palabras buscadas, que se respetan)
export function marcar(html) {
  return String(html).split(/(<[^>]+>)/).map((t) => (t.startsWith('<') ? t : t.replace(RE, (m) => `<mark class="imp">${m}</mark>`))).join('');
}

const CLAVE = 'ley-subrayado';
export const subrayadoActivo = () => { try { return localStorage.getItem(CLAVE) !== '0'; } catch { return true; } };
export const claseSubrayado = () => (subrayadoActivo() ? '' : ' sin-imp');
export const botonSubrayado = () => `<button class="small" data-subrtoggle="1" title="Quitar o poner el subrayado amarillo de lo más importante (plazos, importes, obligaciones, excepciones)">🖍 Subrayado: ${subrayadoActivo() ? 'sí' : 'no'}</button>`;

if (typeof document !== 'undefined' && !window.__subrayadoListo) {
  window.__subrayadoListo = true;
  document.addEventListener('click', (ev) => {
    const b = ev.target?.closest?.('[data-subrtoggle]'); if (!b) return;
    const on = !subrayadoActivo();
    try { localStorage.setItem(CLAVE, on ? '1' : '0'); } catch { /* sin almacenamiento */ }
    document.querySelectorAll('.ley-ov').forEach((o) => o.classList.toggle('sin-imp', !on));
    document.querySelectorAll('[data-subrtoggle]').forEach((x) => { x.textContent = `🖍 Subrayado: ${on ? 'sí' : 'no'}`; });
  });
}
