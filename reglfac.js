// Bloque 10 · Exenciones y Leyes: Reglamento de facturación (Real Decreto 1619/2012).
// Se carga el texto del Reglamento (PDF, TXT o HTML del BOE), se parte en artículos y disposiciones, se guarda para todos los usuarios (tabla «leyes», id «rfac»)
// y se puede recorrer por temas, por índice o consultar. La consulta busca en el texto cargado: no interpreta ni inventa nada.
import { marcar, botonSubrayado, claseSubrayado } from './subrayar.js?v=2';
const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SUF = /^(bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)$/;

// ---------- Lectura del texto ----------
const RUIDO = /^(bolet[ií]n oficial del estado|legislaci[oó]n consolidada|p[aá]gina \d+|p[aá]g\. ?\d+|https?:\/\/|[uú]ltima modificaci[oó]n|cve:|verificable en|^\d{1,3}$)/i;
const PUNTOS = /(\.\s){3,}|\.{4,}/; // líneas del índice: «Artículo 6. Contenido de la factura. . . . . 13»

export function partirReglamento(texto) {
  let lineas = texto.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !RUIDO.test(sinAc(l)) && !PUNTOS.test(l));
  // el PDF consolidado trae antes el real decreto que lo aprueba (con sus propios artículos 1 a 3): el Reglamento empieza en su título
  const marca = lineas.findIndex((l) => /^reglamento por el que se regulan las obligaciones de facturaci[oó]n$/i.test(l)), prelim = lineas.findIndex((l) => /^t[ií]tulo preliminar$/i.test(l));
  if (marca >= 0) lineas = lineas.slice(marca + 1); else if (prelim >= 0) lineas = lineas.slice(prelim);
  lineas = lineas.filter((l) => !/^este documento es de car[aá]cter informativo/i.test(l));
  const fin = lineas.findIndex((l) => /^dado en madrid/i.test(l)); if (fin >= 0) lineas = lineas.slice(0, fin);
  const sec = []; let cur = null, ultimo = 0, tit = '', cap = '';
  const nuevo = (o) => { cur = { ...o, grupo: o.tipo === 'art' ? [tit, cap].filter(Boolean).join(' · ') : '', texto: '' }; sec.push(cur); };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^disposiciones (adicionales|transitorias|derogatorias|finales)$/i.test(l)) continue;
    if (/^(T[ÍI]TULO|CAP[ÍI]TULO) (PRELIMINAR|[IVXLC]+|[ÚU]NICO)\b/.test(l) && l.length < 160) { // «TÍTULO I» / «CAPÍTULO II»: el título va en la misma línea o en la siguiente
      let t = l.replace(/\s*\.$/, ''), j = i + 1;
      if (/^(T[ÍI]TULO|CAP[ÍI]TULO) (PRELIMINAR|[IVXLC]+|[ÚU]NICO)$/.test(t) && lineas[j] && !/^(art[ií]culo|disposici[oó]n|T[ÍI]TULO|CAP[ÍI]TULO) /i.test(lineas[j]) && !/^\d+\./.test(lineas[j]) && lineas[j].length < 160) { t += `. ${lineas[j].replace(/\.$/, '')}`; i = j; }
      if (/^T[ÍI]TULO/.test(t)) { tit = t; cap = ''; } else cap = t;
      continue;
    }
    let m = /^Disposici[oó]n (adicional|transitoria|final|derogatoria) ([^.]+)\.\s*(.*)$/i.exec(l);
    if (m) {
      const id = `D${m[1][0].toUpperCase()}-${sinAc(m[2]).replace(/\s+/g, '')}`;
      if (!sec.some((s) => s.id === id)) {
        let t = m[3]; while (t && !/\.$/.test(t) && lineas[i + 1] && !/^(\d+\.|[a-z]\)|art[ií]culo|disposici[oó]n)/i.test(lineas[i + 1]) && t.length < 260) t += ` ${lineas[++i]}`;
        nuevo({ id, tipo: 'disp', num: 0, titulo: `Disposición ${m[1]} ${m[2]}${t ? '. ' + t : ''}` }); continue;
      }
    }
    m = /^Art[ií]culo (\d+)(?: (\w+))?\.\s*(.*)$/i.exec(l);
    if (m) {
      const n = +m[1], suf = m[2] && SUF.test(sinAc(m[2])) ? sinAc(m[2]) : '';
      if (!(m[2] && !suf) && n >= ultimo && n <= ultimo + 5) {
        const id = suf ? `${n} ${suf}` : String(n);
        if (!sec.some((s) => s.id === id)) {
          ultimo = n;
          let t = m[3]; while (t && !/\.$/.test(t) && lineas[i + 1] && !/^(\d+\.|[a-z]\)|art[ií]culo|disposici[oó]n)/i.test(lineas[i + 1]) && t.length < 300) t += ` ${lineas[++i]}`;
          if (!t && lineas[i + 1]) t = lineas[++i];
          nuevo({ id, tipo: 'art', num: n, titulo: t.replace(/\.$/, '') }); continue;
        }
      }
    }
    if (cur) cur.texto += (cur.texto ? '\n' : '') + l;
  }
  return sec;
}

// Temas más importantes del Reglamento: [tema, artículos, para qué sirve]
const TEMAS = [
  ['Obligación de documentar las operaciones', ['1', '2'], 'Quién debe expedir, entregar y conservar facturas y justificantes, y en qué operaciones.'],
  ['Excepciones a la obligación de facturar', ['3'], 'Operaciones en las que no hay que expedir factura (exentas por el art. 20 de la Ley del IVA, financieras, etc.).'],
  ['Facturas simplificadas', ['4', '7'], 'Cuándo se puede expedir factura simplificada y qué datos debe llevar.'],
  ['Factura expedida por el destinatario o por un tercero', ['5'], 'Autofacturas y facturación por terceros: requisitos y comunicación.'],
  ['Contenido de la factura', ['6'], 'Datos obligatorios: número y serie, fechas, NIF, domicilio, descripción, base, tipo y cuota, mención de exención o inversión…'],
  ['Medios de expedición y factura electrónica', ['8', '8 bis', '9', '10'], 'Papel o electrónica, factura electrónica obligatoria entre empresarios y profesionales, autenticidad e integridad.'],
  ['Plazo, moneda y lengua', ['11', '12'], 'Cuándo hay que expedir la factura y en qué moneda e idioma puede expresarse.'],
  ['Facturas recapitulativas y duplicados', ['13', '14'], 'Varias operaciones en una sola factura y expedición de duplicados.'],
  ['Facturas rectificativas', ['15'], 'Cuándo y cómo se rectifica una factura (series, datos y causas).'],
  ['Regímenes especiales', ['16'], 'Particularidades en agencias de viajes, bienes usados, recargo de equivalencia, criterio de caja, etc.'],
  ['Remisión de facturas', ['17', '18'], 'Obligación y plazo para enviar la factura al destinatario.'],
  ['Conservación de facturas', ['19', '20', '21', '22', '23'], 'Qué se conserva, durante cuánto tiempo, en qué forma y dónde; acceso de la Administración.'],
  ['Controversias y otros tributos', ['24', '25', '26'], 'Resolución de controversias y aplicación a otros impuestos y al IRPF.'],
];
const SUGERENCIAS = ['¿Qué datos debe llevar una factura?', '¿Cuándo se puede emitir una factura simplificada?', '¿Cuál es el plazo para expedir la factura?', '¿Cuándo es obligatoria la factura electrónica?', '¿Cómo se rectifica una factura?', '¿Cuánto tiempo hay que conservar las facturas?'];

// ---------- Módulo ----------
export function crearReglFac(c) {
  const { S, esc, render, db, puede } = c;
  const ST = { sub: 'resumen', idx: '', q: '', res: null, msg: '' };
  let LEY; // undefined = sin pedir · null = sin cargar · objeto = Reglamento
  const cache = (v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('reglfac-cache') || 'null'); localStorage.setItem('reglfac-cache', JSON.stringify(v)); } catch { /* sin almacenamiento */ } return null; };
  async function pedir() {
    if (LEY !== undefined) return;
    LEY = cache() ?? null;
    const { data, error } = await db.from('leyes').select('*').eq('id', 'rfac').maybeSingle();
    if (!error) { LEY = data ? { ...data.datos, nombre: data.nombre } : LEY; if (data) cache(LEY); }
    else ST.msg = `No se pudo leer la tabla «leyes» (${error.message}). Mientras tanto el Reglamento se guarda solo en este navegador.`;
    render();
  }
  const secs = () => LEY?.secciones ?? [];
  const art = (n) => secs().find((s) => s.tipo === 'art' && s.id === String(n));
  const tituloArt = (n) => { const s = art(n); return s ? `Art. ${s.id}. ${s.titulo}` : `Art. ${n}`; };
  const detalleArt = (n) => (art(n) ? `<button class="ley-art" data-rfart="${esc(art(n).id)}"><span>${esc(tituloArt(n))}</span><i>Abrir ›</i></button>` : `<span class="chip">Art. ${esc(n)}</span>`);
  const msg = () => (ST.msg ? `<p class="ley-msg">${esc(ST.msg)}</p>` : '');

  async function textoDeArchivo(f) {
    if (/\.pdf$/i.test(f.name)) {
      const lib = window.pdfjsLib; if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js).');
      lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise, out = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const tc = await (await doc.getPage(p)).getTextContent();
        const its = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str })).sort((a, b) => b.y - a.y || a.x - b.x);
        const lin = []; let cur = null; // las piezas de texto con casi la misma altura forman una línea
        for (const i of its) { if (cur && Math.abs(cur.y - i.y) <= 2.5) cur.t.push(i); else { cur = { y: i.y, t: [i] }; lin.push(cur); } }
        lin.forEach((l) => out.push(l.t.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
      }
      return out.join('\n');
    }
    const buf = new Uint8Array(await f.arrayBuffer()); let t = new TextDecoder('utf-8').decode(buf);
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
    if (/\.html?$/i.test(f.name) || /^\s*<(!doctype|html)/i.test(t)) {
      const d = new DOMParser().parseFromString(t.replace(/<\/(p|div|h\d|li|tr|br)>/gi, '\n$&').replace(/<br\s*\/?>/gi, '\n'), 'text/html');
      d.querySelectorAll('script,style').forEach((e) => e.remove());
      return d.body.textContent;
    }
    return t;
  }
  async function cargar(f) {
    if (!f) return;
    if (!puede()) return void alert('Solo un administrador o gestor puede cargar el Reglamento.');
    try {
      ST.msg = `Leyendo ${f.name}…`; render();
      const secciones = partirReglamento(await textoDeArchivo(f)), arts = secciones.filter((s) => s.tipo === 'art');
      if (arts.length < 15) throw new Error(`Solo se reconocen ${arts.length} artículos: el archivo no parece el Reglamento de facturación con los artículos en texto (¿es un escaneo?).`);
      const ley = { nombre: 'Real Decreto 1619/2012, de 30 de noviembre, por el que se aprueba el Reglamento por el que se regulan las obligaciones de facturación', fuente: f.name, cargada: new Date().toISOString().slice(0, 10), secciones };
      const { error } = await db.from('leyes').upsert({ id: 'rfac', nombre: ley.nombre, datos: ley, updated_at: new Date().toISOString() });
      cache(ley); LEY = ley;
      ST.msg = error ? `Reglamento leído (${arts.length} artículos) pero NO se guardó en Supabase: ${error.message}. Queda guardado solo en este navegador.` : `✔ ${f.name}: ${arts.length} artículos y ${secciones.length - arts.length} disposiciones leídos, guardados para todos los usuarios.`;
    } catch (e) { ST.msg = `✘ ${f.name}: ${e.message}`; }
    render();
  }
  async function quitar() {
    if (!puede() || !confirm('¿Quitar el Reglamento cargado?')) return;
    await db.from('leyes').delete().eq('id', 'rfac'); cache(null); LEY = null; ST.res = null; render();
  }

  const subnav = () => `<nav class="subtabs">${[['resumen', 'Lo más importante'], ['indice', 'Índice completo'], ['consulta', 'Consultar']].map(([k, l]) => `<button class="${k === ST.sub ? 'on' : ''}" data-rfsub="${k}">${l}</button>`).join('')}</nav>`;
  function vista() {
    pedir();
    const zona = puede() ? `<div class="dropzone" data-rffile="1" tabindex="0" role="button"><b>${LEY ? 'Suelte otra versión del Reglamento para sustituirlo' : 'Suelte aquí el Reglamento de facturación (Real Decreto 1619/2012)'}</b> (PDF, TXT o HTML del BOE; mejor el texto consolidado). Se divide en artículos y se guarda para todos los usuarios.<input type="file" id="rfFileIn" accept=".pdf,.txt,.htm,.html" hidden></div>` : '';
    if (!LEY) return `${zona}${msg()}<p class="ley-aviso">Todavía no hay ningún Reglamento cargado: suelte el PDF (o el TXT/HTML) del BOE en el recuadro de arriba.</p>`;
    const arts = secs().filter((s) => s.tipo === 'art'), disp = secs().length - arts.length;
    const cab = `<div class="ley-fijo">${zona}${msg()}<div class="ley-cab"><b>${esc(LEY.nombre)}</b><span>Archivo ${esc(LEY.fuente)} · cargado el ${esc((LEY.cargada || '').split('-').reverse().join('/'))} · ${arts.length} artículos${disp ? ` · ${disp} disposiciones` : ''}</span>${puede() ? '<button class="small danger" data-rfquitar="1">Quitar el Reglamento</button>' : ''}</div>${subnav()}</div>`;
    if (ST.sub === 'indice') return `${cab}<input class="ley-buscar" data-rfidx="1" placeholder="Filtrar artículos (p. ej. 6, simplificada, rectificativa, conservación…)" value="${esc(ST.idx)}"><div id="rfIdxLista">${indiceHtml()}</div>`;
    if (ST.sub === 'consulta') return `${cab}${consultaHtml()}`;
    const temas = TEMAS.map(([t, ns, para]) => {
      const hay = ns.filter((n) => art(n));
      return `<div class="ley-tema"><h4>${esc(t)}</h4><p class="hint">${esc(para)}</p>${hay.length ? hay.map(detalleArt).join('') : '<p class="hint">Artículos no encontrados en el texto cargado.</p>'}</div>`;
    }).join('');
    return `${cab}<div class="ley-temas">${temas}</div>`;
  }
  function indiceHtml() {
    const f = sinAc(ST.idx).trim();
    const l = secs().filter((s) => !f || sinAc(`${s.id} ${s.titulo} ${s.grupo ?? ''}`).includes(f) || (f.length > 3 && sinAc(s.texto).includes(f)));
    let g = null;
    return l.map((s) => {
      const cab = !f && s.grupo && s.grupo !== g ? `<h4 class="ley-grupo">${esc(s.grupo)}</h4>` : ''; g = s.grupo;
      return `${cab}<button class="ley-art" data-rfart="${esc(s.id)}"><span>${s.tipo === 'art' ? `Art. ${esc(s.id)}. ` : ''}${esc(s.titulo)}</span><i>Abrir ›</i></button>`;
    }).join('') || '<p class="vacio">Sin resultados.</p>';
  }

  // --- consulta: busca en el texto cargado y devuelve los pasajes más pertinentes ---
  const STOP = new Set('que como cual cuales cuando donde para por con sin una uno unos unas los las del les mas son esta este esto estan ser sus pero entre sobre desde hasta hay puede pueden debe deben tiene tienen cada todo toda todos todas'.split(' '));
  const stem = (w) => w.slice(0, 5);
  const terminos = (q) => [...new Set(sinAc(q).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem))];
  function buscar(q) {
    const ts = terminos(q), out = [];
    const mArt = /art(?:[ií]culo|\.)?\s*(\d+)(?:\s*(bis|ter|quater))?/i.exec(sinAc(q));
    const cuenta = (txt) => { const toks = sinAc(txt).split(/[^a-z0-9ñ]+/); return ts.reduce((s, t) => s + Math.min(6, toks.filter((w) => w.startsWith(t)).length), 0); };
    for (const s of secs()) {
      const sc = ts.length ? cuenta(s.texto) / Math.log(12 + s.texto.length / 400) + cuenta(s.titulo) * 4 : 0;
      const dir = mArt && s.tipo === 'art' && s.id === (mArt[2] ? `${mArt[1]} ${mArt[2]}` : mArt[1]);
      if (sc > 0 || dir) out.push({ s, sc: sc + (dir ? 1000 : 0) });
    }
    out.sort((p, q2) => q2.sc - p.sc);
    return out.slice(0, 5).map(({ s }) => {
      const pars = s.texto.split('\n').map((p) => ({ p, v: cuenta(p) })).filter((x) => x.v > 0).sort((p, q2) => q2.v - p.v).slice(0, 3).map((x) => x.p);
      return { s, pars: pars.length ? pars : [s.texto.slice(0, 500)] };
    });
  }
  const resalta = (txt, ts) => {
    let h = esc(txt); if (!ts.length) return h;
    const cl = { a: 'aáàä', e: 'eéèë', i: 'iíìï', o: 'oóòö', u: 'uúùü', n: 'nñ' };
    const re = new RegExp(`(${ts.map((t) => t.split('').map((ch) => (cl[ch] ? `[${cl[ch]}]` : ch)).join('')).join('|')})`, 'gi');
    return h.replace(re, '<mark>$1</mark>');
  };
  function responder(q) { ST.q = q; ST.res = { q, ts: terminos(q), hits: buscar(q) }; render(); }
  function consultaHtml() {
    const R = ST.res; let out = '';
    if (R) {
      out += `<section class="ley-resp"><h4>Resultados para: «${esc(R.q)}»</h4>`;
      out += !R.hits.length ? '<p class="vacio">No encuentro nada en el Reglamento con esas palabras: pruebe con otros términos o con el número del artículo («art. 6»).</p>'
        : `<p class="hint">Pasajes del Reglamento más relacionados con la pregunta (extracto literal, ordenado por relevancia):</p>${R.hits.map(({ s, pars }) => `<div class="ley-hit"><h5>${s.tipo === 'art' ? `Art. ${esc(s.id)}. ` : ''}${esc(s.titulo)}</h5>${pars.map((p) => `<p>${resalta(p, R.ts)}</p>`).join('')}<button class="ley-art" data-rfart="${esc(s.id)}" data-rfq2="1"><span>Abrir el artículo completo</span><i>Abrir ›</i></button></div>`).join('')}`;
      out += '</section>';
    }
    return `<div class="ley-preg"><input class="ley-buscar" data-rfq="1" placeholder="Pregunte o busque: contenido de la factura, plazo, rectificativa, art. 6…" value="${esc(ST.q)}"><button class="primary" data-rfask="1">Buscar</button></div>
      <p class="hint">La consulta busca en el texto del Reglamento cargado y devuelve los pasajes literales más pertinentes; no interpreta ni inventa.</p>${out}
      <div class="ley-sug">${SUGERENCIAS.map((s) => `<button class="small" data-rfask="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  }

  // --- artículo a pantalla completa ---
  function cerrarArt() { document.getElementById('rfOv')?.remove(); document.documentElement.style.overflow = ''; }
  function abrirArt(id, ts = []) {
    const L = secs(), i = L.findIndex((s) => s.id === id), s = L[i]; if (!s) return;
    const prev = L[i - 1], next = L[i + 1], nom = (x) => (x.tipo === 'art' ? `Art. ${x.id}` : x.titulo.slice(0, 28));
    document.getElementById('rfOv')?.remove();
    const ov = document.createElement('div'); ov.id = 'rfOv'; ov.className = `ley-ov${claseSubrayado()}`;
    ov.innerHTML = `<div class="ley-ov-barra"><button class="primary" data-rfvolver="1">‹ Volver</button><b>${s.tipo === 'art' ? `Artículo ${esc(s.id)}` : 'Disposición'}</b>
      <span class="space"></span>${botonSubrayado()}<button data-rfart2="${prev ? esc(prev.id) : ''}"${prev ? '' : ' disabled'}>‹ ${prev ? esc(nom(prev)) : ''}</button><button data-rfart2="${next ? esc(next.id) : ''}"${next ? '' : ' disabled'}>${next ? esc(nom(next)) : ''} ›</button></div>
      <article class="ley-ov-cuerpo"><h2>${s.tipo === 'art' ? `Artículo ${esc(s.id)}. ` : ''}${esc(s.titulo)}</h2><p class="hint">${esc(s.grupo ? `${s.grupo} · ` : '')}${esc(LEY?.nombre ?? '')}</p>${s.texto.split('\n').map((p) => `<p>${marcar(resalta(p, ts))}</p>`).join('')}</article>`;
    document.body.appendChild(ov); document.documentElement.style.overflow = 'hidden';
    ov.querySelector('.ley-ov-cuerpo').scrollTop = 0; ov._ts = ts;
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.getElementById('rfOv')) { ev.preventDefault(); cerrarArt(); } });

  // --- eventos ---
  let tIdx;
  document.addEventListener('click', (ev) => {
    const t = ev.target; if (!t?.closest) return;
    let b;
    if (t.closest('[data-rfvolver]')) { cerrarArt(); return; }
    if ((b = t.closest('[data-rfart2]'))) { if (b.dataset.rfart2) abrirArt(b.dataset.rfart2, document.getElementById('rfOv')?._ts ?? []); return; }
    if ((b = t.closest('[data-rfart]'))) { abrirArt(b.dataset.rfart, b.dataset.rfq2 ? ST.res?.ts ?? [] : []); return; }
    if (t.closest('[data-rfquitar]')) { quitar(); return; }
    if ((b = t.closest('[data-rfsub]'))) { ST.sub = b.dataset.rfsub; render(); return; }
    if ((b = t.closest('[data-rfask]'))) { const v = b.dataset.rfask === '1' ? (document.querySelector('[data-rfq]')?.value ?? '') : b.dataset.rfask; if (v.trim()) responder(v.trim()); }
  });
  document.addEventListener('change', (ev) => { const t = ev.target; if (t?.id === 'rfFileIn') { const f = t.files[0]; t.value = ''; cargar(f); } });
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!t?.dataset) return;
    if (t.dataset.rfidx) { ST.idx = t.value; clearTimeout(tIdx); tIdx = setTimeout(() => { const el = document.getElementById('rfIdxLista'); if (el) el.innerHTML = indiceHtml(); }, 250); }
    else if (t.dataset.rfq !== undefined) ST.q = t.value;
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target?.dataset?.rfq !== undefined && ev.target.value.trim()) { ev.preventDefault(); responder(ev.target.value.trim()); } });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-rffile]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => ev.target.closest?.('[data-rffile]')?.classList.remove('over'));
  document.addEventListener('drop', (ev) => { const z = ev.target.closest?.('[data-rffile]'); if (!z) return; ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over'); cargar(ev.dataTransfer.files[0]); }, true);

  return {
    tabs: { leyrfac: ['Reglamento de Facturación', 'Real Decreto 1619/2012: lo más importante y consulta', vista] },
    badges: { leyrfac: () => (LEY ? { t: `${secs().filter((s) => s.tipo === 'art').length} artículos`, c: 'verde' } : LEY === undefined ? null : { t: 'Sin cargar', c: 'rojo' }) },
  };
}
