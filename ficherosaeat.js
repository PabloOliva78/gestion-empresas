// Ficheros para importar en la Sede de la AEAT (Importar en el formulario): modelos 111, 115 y 123, registros de longitud fija en texto plano.
// Diseños oficiales: DR111e16v18, DR115e15v13 y DR123e24 (sede.agenciatributaria.gob.es › Diseños de registro). El fichero va en ISO-8859-1 (un byte por carácter).
// Todo son funciones puras: reciben los importes ya calculados por la app y devuelven el texto del fichero.
const blancos = (n) => ' '.repeat(n);
const SIN_TILDES = (s) => String(s ?? '').toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'Ñ');
// alfanumérico: mayúsculas, sin tildes (se conserva la Ñ), solo letras, números y blancos; alineado a la izquierda y relleno con blancos
export function alfa(s, n) {
  const t = SIN_TILDES(s).replace(/[^A-Z0-9Ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.slice(0, n).padEnd(n, ' ');
}
// numérico entero (nº de perceptores…) alineado a la derecha con ceros
export function entero(v, n) {
  const x = Math.round(Number(v) || 0);
  if (x < 0) throw new Error(`valor negativo (${x}) en un campo que no admite signo`);
  const s = String(x);
  if (s.length > n) throw new Error(`el valor ${x} no cabe en ${n} posiciones`);
  return s.padStart(n, '0');
}
// importe: n posiciones con 2 decimales implícitos (15 enteros + 2 decimales = 17); si admite signo, el negativo lleva una N en la primera posición
export function importe(v, n = 17, conSigno = false) {
  const c = Math.round((Number(v) || 0) * 100 + (Number(v) < 0 ? -1e-9 : 1e-9));
  if (c < 0 && !conSigno) throw new Error(`importe negativo (${(c / 100).toFixed(2)}) en un campo que no admite signo`);
  const s = String(Math.abs(c));
  if (s.length > (c < 0 ? n - 1 : n)) throw new Error(`el importe ${(c / 100).toFixed(2)} no cabe en ${n} posiciones`);
  return c < 0 ? 'N' + s.padStart(n - 1, '0') : s.padStart(n, '0');
}
const IBAN = (s) => alfa(String(s ?? '').replace(/\s+/g, ''), 34);

// d = { tipo ('I' ingreso, 'U' domiciliación, 'N' negativa), nif, nombre, ej, per, iban, comp (true si complementaria), just (nº de justificante anterior), c: { '01': …, '02': … } }
// c = casillas por número tal como en el impreso de la AEAT; los nº de perceptores/rentas son enteros y el resto importes
export function ficheroAeat(modelo, d) {
  const c = d.c ?? {}, ej = String(d.ej), per = String(d.per);
  if (!/^\d{4}$/.test(ej)) throw new Error('ejercicio no válido');
  if (!/^(0[1-9]|1[0-2]|[1-4]T)$/.test(per)) throw new Error(`periodo no válido (${per})`);
  const nif = alfa(String(d.nif ?? '').replace(/[^A-Za-z0-9]/g, ''), 9);
  if (!nif.trim()) throw new Error('la empresa no tiene NIF');
  const cab = `<T${modelo}0${ej}${per}0000>`, aux = `<AUX>${blancos(70)}${alfa('0001', 4)}${blancos(4)}${blancos(9)}${blancos(213)}</AUX>`;
  const compl = d.comp ? 'X' : ' ', just = alfa(d.comp ? d.just : '', 13), iban = IBAN(d.tipo === 'U' ? d.iban : '');
  let pag;
  if (modelo === '111') {
    const I = (k, n = 8) => entero(c[k], n), M = (k, sg = false) => importe(c[k], 17, sg);
    pag = '<T11101000>' + ' ' + alfa(d.tipo, 1) + nif + alfa(d.nombre, 60) + blancos(20) + ej + per
      + ['01', '04', '07', '10', '13', '16', '19', '22', '25'].map((k) => { const n = +k; return I(k) + M(String(n + 1).padStart(2, '0')) + M(String(n + 2).padStart(2, '0')); }).join('')
      + M('28') + M('29', true) + M('30') + compl + just + ' ' + iban + blancos(389) + blancos(13) + '</T11101000>';
    if (pag.length !== 1000) throw new Error(`error interno: el 111 mide ${pag.length} posiciones en vez de 1000`);
  } else if (modelo === '115') {
    pag = '<T11501000>' + ' ' + alfa(d.tipo, 1) + nif + alfa(d.nombre, 60) + blancos(20) + ej + per
      + entero(c['01'], 15) + importe(c['02']) + importe(c['03']) + importe(c['04']) + importe(c['05']) + compl + just + iban + blancos(236) + blancos(13) + '</T11501000>';
    if (pag.length !== 500) throw new Error(`error interno: el 115 mide ${pag.length} posiciones en vez de 500`);
  } else if (modelo === '123') {
    pag = '<T12301000>' + ' ' + alfa(d.tipo, 1) + nif + alfa(d.nombre, 80) + ej + per
      + ['01', '02', '03'].map((k) => entero(c[k], 15)).join('') + ['04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14'].map((k) => importe(c[k])).join('')
      + compl + just + iban + blancos(200) + '</T12301000>';
    if (pag.length !== 600) throw new Error(`error interno: el 123 mide ${pag.length} posiciones en vez de 600`);
  } else throw new Error('modelo no soportado');
  return cab + aux.slice(0) + pag + `</T${modelo}0${ej}${per}0000>`;
}

// texto → bytes ISO-8859-1 (un byte por carácter, para que las posiciones fijas no se muevan)
export function bytesLatin1(t) {
  const b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) { const k = t.charCodeAt(i); b[i] = k < 256 ? k : 63; }
  return b;
}
