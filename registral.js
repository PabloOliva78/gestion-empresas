// Bloque 2 · Información Registro Mercantil (portado de la aplicación antigua).
// Datos Registrales y Titularidad Real: se suelta el PDF o Excel y se leen los datos, con el archivo de origen.
import { crearEnvio } from './envio.js?v=2';

export function crearRegistral(c) {
  const { db, S, esc, render, cargar, empresa, puede, leerPdf, filasExcel, ocrPdf, eur } = c;
  const sinEmpresa = '<p class="vacio">Elija una empresa en el desplegable de la izquierda.</p>';
  let msg = '', msgMal = false;
  const aviso = (m, mal = false) => { msg = m; msgMal = mal; render(); };
  const avisoHtml = () => (msg ? `<p class="hint rg-msg${msgMal ? ' mal' : ''}"><b>${esc(msg)}</b></p>` : '');
  const hoy = () => new Date().toISOString().slice(0, 10);
  const nifEmp = () => String(empresa()?.cif ?? '').toUpperCase();
  const fdate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const celdaTxt = (v) => (v instanceof Date ? fdate(v) : String(v ?? ''));

  // Líneas de la página como las daba la aplicación antigua: cada línea es una lista de trozos {s, x, y}
  async function lineasDe(file) {
    const { pags } = await leerPdf(file);
    const lineas = []; let todo = '';
    pags.forEach((its, p) => {
      const items = its.map((i) => ({ s: String(i.str ?? '').trim(), x: i.x, y: Math.round(i.y) })).filter((i) => i.s);
      const porY = new Map();
      items.forEach((it) => {
        let k = [...porY.keys()].find((y) => Math.abs(y - it.y) <= 3);
        if (k === undefined) { k = it.y; porY.set(k, []); }
        porY.get(k).push(it);
      });
      [...porY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, l]) => { l.sort((a, b) => a.x - b.x); l.pag = p + 1; lineas.push(l); });
      todo += `${items.map((i) => i.s).join(' ')}\n`;
    });
    return { lineas, todo, n: pags.length };
  }
  const textoLineas = (lineas) => lineas.map((l) => l.map((i) => i.s).join('  ')).join('\n');

  // ================= Datos Registrales =================
  const DREG_CAMPOS = [['denominacion', 'Denominación social'], ['formaSocial', 'Forma social'], ['nif', 'NIF'], ['irus', 'IRUS'], ['euid', 'EUID'], ['cnae', 'CNAE'], ['cnaeDesc', 'Actividad (CNAE)'],
    ['nace', 'NACE'], ['naceDesc', 'Actividad (NACE)'],
    ['registro', 'Registro Mercantil'], ['tomo', 'Tomo'], ['libro', 'Libro'], ['folio', 'Folio'], ['seccion', 'Sección'], ['hoja', 'Hoja registral (hoja social)'],
    ['inscripcion', 'Inscripción'], ['lei', 'LEI'], ['web', 'Página web'], ['estado', 'Estado'], ['domicilio', 'Domicilio social'], ['fconst', 'Fecha de constitución'], ['notario', 'Notario (constitución)'],
    ['protocolo', 'Nº de protocolo']];
  // Ficha del Registro Mercantil (información mercantil) ya consultada: rellena lo que esté vacío de la empresa con ese NIF
  const FICHA_REG = {
    A18341404: { fecha: '07/11/2026', datos: { denominacion: 'HEROGRA FERTILIZANTES SOCIEDAD ANONIMA', formaSocial: 'No disponible', nif: 'A18341404', irus: '1000203781256', euid: 'ES18020.000008382', cnae: '2015', cnaeDesc: 'Fabricación de fertilizantes y compuestos nitrogenados',
      nace: '2015', naceDesc: 'Manufacture of fertilisers and nitrogen compounds', hoja: '5970', registro: 'Registro Mercantil de Granada', web: 'No disponible', estado: 'Vigente',
      domicilio: "Polígono Juncaril, calle A' (A prima) parcelas 204-205-206 y 111B.-, GRANADA, ALBOLOTE" },
    admins: [['ROMERO MARTINEZ ANA', 'Consejero Delegado Solidario'], ['ROMERO RUIZ JOAQUIN', 'Consejero Delegado Solidario'], ['ROMERO GOMEZ IGNACIO', 'Consejero'],
      ['ROMERO MARTINEZ JUAN JOSE', 'Consejero'], ['ABAD PERALTA JAIME', 'Consejero'], ['ROMERO RUIZ JUAN', 'Consejero']] },
  };
  const dregFichaGuardada = new Set();
  function dregDesdeFicha(e, d) {
    const F = FICHA_REG[String(e?.cif ?? '').toUpperCase()]; if (!F) return false;
    let cambio = false;
    Object.entries(F.datos).forEach(([k, v]) => { if (!d[k]) { d[k] = v; d._o[k] = `Ficha del Registro Mercantil (${F.fecha})`; cambio = true; } });
    if (!Array.isArray(d.admins) || !d.admins.length) { d.admins = F.admins.map(([nombre, cargo]) => ({ nombre, cargo, origen: `Ficha del Registro Mercantil (${F.fecha})` })); cambio = true; }
    return cambio;
  }
  // «NOMBRE APELLIDOS Cargo» → nombre y cargo (el cargo empieza en la primera palabra de cargo)
  const CARGO_RX = /\b(Presidente|Vicepresidente|Secretario|Vicesecretario|Consejero|Administrador|Apoderado|Liquidador|Director|Gerente|Auditor|Representante)\b.*$/;
  function adminsDeTexto(T) {
    const L = String(T).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()), i = L.findIndex((l) => /^Administradores y cargos de la sociedad/i.test(l));
    if (i < 0) return [];
    const out = [];
    for (const l of L.slice(i + 1)) {
      if (!l) continue;
      if (/^(Domicilio|Nota informativa|Certificaci|Volver)/i.test(l)) break;
      const m = CARGO_RX.exec(l); if (!m || m.index < 3) continue;
      out.push({ nombre: l.slice(0, m.index).replace(/^[•·\-\s]+/, '').trim(), cargo: m[0].trim() });
    }
    return out;
  }

  const dregDe = (e) => {
    const d = { ...(e.datos?.dreg ?? {}) };
    d._o = { ...(d._o ?? {}) }; d._arch = [...(d._arch ?? [])];
    if (!d.fconst && d.constitucion) { d.fconst = d.constitucion; d._o.fconst ??= 'Datos censales AEAT'; }
    return d;
  };
  async function dregGuardar(e, d, redibujar = true) {
    const datos = { ...(e.datos ?? {}), dreg: d };
    const { error } = await db.from('empresas').update({ datos }).eq('id', e.id);
    if (error) return aviso(error.message, true);
    e.datos = datos;
    if (redibujar) { await cargar(); render(); }
  }

  function dregExtraer(texto) {
    const T = String(texto || '').replace(/\r/g, ''), R = {}, L = T.split('\n');
    const prim = (rx, f = (m) => m[1], linea) => {
      for (const l of L) { const m = l.match(rx); if (m) { const v = String(f(m) || '').replace(/\s+/g, ' ').trim(); if (v) return v; } }
      if (linea) return '';
      const m = T.replace(/\n/g, ' ').match(rx);
      return m ? String(f(m) || '').replace(/\s+/g, ' ').trim() : '';
    };
    {
      const cand = [...T.matchAll(/\b(?:N\.?I\.?F\.?|C\.?I\.?F\.?)(?:\s+de\s+la\s+(?:entidad|sociedad))?\s*(:)?\s*([ABCDEFGHJNPQRSUVW][-\s]?\d{7}[0-9A-J])\b/gi)]
        .map((m) => ({ v: m[2].replace(/[-\s]/g, '').toUpperCase(), dp: !!m[1] }));
      R.nif = (cand.find((x) => x.v === nifEmp()) || cand.find((x) => x.dp) || cand[0] || {}).v || '';
    }
    R.irus = prim(/\bIRUS\s*[:.]?\s*(\d{8,16})\b/i);
    R.cnae = prim(/\bCNAE(?:[\s-]*\d{4})?\s*[:.]?\s*(\d{2}\.?\d{0,2}\.?\d?)\b/i, (m) => m[1]);
    R.cnaeDesc = prim(/\bCNAE(?:[\s-]*\d{4})?\s*[:.]?\s*\d{2}\.?\d{0,2}\.?\d?\s*[-–:]?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][^\n]{3,120}?)(?:\s{2,}|$)/i);
    R.registro = prim(/REGISTRO\s+MERCANTIL\s+(?:DE|DEL)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ' ]{3,40}?)(?:\s{2,}|\.|,|\s+(?:TOMO|HOJA|FOLIO|SECCI|INSCRIP|LIBRO)|$)/i,
      (m) => `Registro Mercantil de ${m[1].trim().replace(/\s+/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase())}`);
    R.tomo = prim(/\bTomo\s*[:.]?\s*(\d{1,6})\b/i);
    R.libro = prim(/\bLibro\s*[:.]?\s*(\d{1,6})\b/i);
    R.folio = prim(/\bFolio\s*[:.]?\s*(\d{1,6})\b/i);
    R.seccion = prim(/\bSecci[oó]n\s*[:.]?\s*(\d{1,2}[ªa]?|[A-Z]{1,3})\b/i);
    R.hoja = prim(/\b(?:N[ºo°.]*\s*(?:de\s+)?)?Hoja(?:\s+(?:Registral|Social))?(?:\s+n[ºo°.]*)?\s*[:.]?\s*([A-Z]{0,3}[-\s]?\d{1,7})\b/i, (m) => m[1].replace(/\s/g, ''));
    // ficha de «Información mercantil» del Registro (Registradores)
    R.formaSocial = prim(/\bForma\s+social\s*:?\s*([^\n]+)/i, undefined, true); R.euid = prim(/\bEUID\s*:?\s*(ES[0-9A-Z.]+)/i);
    R.nace = prim(/\bNACE\s*:?\s*(\d{2}\.?\d{0,2}\.?\d?)\b/i); R.naceDesc = prim(/\bNACE\s*:?\s*\d{2}\.?\d{0,2}\.?\d?\s*[-–:]?\s*([A-Za-z][^\n]{3,120})/i);
    R.estado = prim(/^\s*Estado\s*:?\s*(Vigente|Cancelad[oa]|Extinguid[oa]|En liquidaci[oó]n|Disuelt[oa])\b/i, undefined, true);
    R.web = prim(/\bP[aá]gina\s+Web\s*:?\s*(\S+)/i, undefined, true);
    if (!R.registro) { const m = /Registro\s+Mercantil\s*:\s*([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,30})/.exec(T); if (m) R.registro = `Registro Mercantil de ${m[1].trim().toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())}`; }
    ['formaSocial', 'web'].forEach((k) => { if (/^no disponible$/i.test(R[k] || '')) R[k] = ''; });
    const adm = adminsDeTexto(T); if (adm.length) R.admins = adm;
    R.inscripcion = prim(/\bInscripci[oó]n\s*[:.]?\s*(\d{1,4}[ªa]?)\b/i);
    R.lei = prim(/\bLEI\s*[:.]?\s*([A-Z0-9]{20})\b/);
    R.denominacion = prim(/\bDenominaci[oó]n(?:\s+de\s+la\s+Entidad|\s+social)?\s*:\s*([A-ZÁÉÍÓÚÑ0-9][^\n]*?)(?=\s{2,}|\s+N\.?I\.?F|\s+C\.?I\.?F|$)/i, undefined, true);
    R.domicilio = prim(/\bDomicilio(?:\s+social)?\s*:\s*([A-ZÁÉÍÓÚÑ0-9][^\n]*?)(?=\s{2,}|\s+C[óo]digo\s+Postal|$)/i, undefined, true);
    R.fconst = prim(/\b(?:Fecha\s+de\s+)?constituci[oó]n\s*[:.]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i);
    R.notario = prim(/\bNotari[oa](?:\s+autorizante)?\s*[:.]\s*(?:D\.?|D[ñn]a\.?|Don|Do[ñn]a)?\s*([A-ZÁÉÍÓÚÑ][^\n,;:]{4,60})/i);
    R.protocolo = prim(/\bprotocolo\s*(?:n[ºo°.]*|n[uú]mero)?\s*[:.]?\s*(\d[\d.]*)/i);
    Object.keys(R).forEach((k) => { if (!R[k]) delete R[k]; });
    return R;
  }

  async function textoArchivo(f) {
    if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp)$/i.test(f.name)) return (await ocrPdf(f, (m) => aviso(`${f.name}: ${m}`))).join('\n'); // captura de pantalla: se lee con OCR
    if (/\.pdf$/i.test(f.name)) {
      const { lineas } = await lineasDe(f);
      const t = textoLineas(lineas);
      return t.trim() ? t : (await ocrPdf(f, (m) => aviso(`${f.name}: ${m}`))).join('\n');
    }
    const filas = await filasExcel(f);
    return (filas ?? []).map((r) => (r ?? []).map((v) => celdaTxt(v).trim()).filter(Boolean).join('  ')).join('\n');
  }

  async function cargarDreg(files) {
    const e = empresa();
    if (!e) return aviso('Elige primero la empresa.', true);
    const d = dregDe(e);
    for (const f of files) {
      let texto;
      try { texto = await textoArchivo(f); } catch (err) { aviso(`${f.name}: no se ha podido leer (${err.message})`, true); continue; }
      const R = dregExtraer(texto);
      if (/PRESENTANTE/i.test(texto)) delete R.domicilio; // en la solicitud del Registro el domicilio es el del presentante
      Object.entries(R).forEach(([k, v]) => { d[k] = v; d._o[k] = f.name; });
      d._arch = d._arch.filter((a) => a.name !== f.name).concat([{ name: f.name, fecha: hoy(), campos: Object.keys(R), texto: texto.slice(0, 40000) }]);
      msg = `${f.name}: ${Object.keys(R).length} dato(s) registral(es) leídos${Object.keys(R).length ? '' : ' · revisa el texto extraído'}`; msgMal = !Object.keys(R).length;
    }
    await dregGuardar(e, d);
  }

  // fecha de constitución de los datos censales de la AEAT (solo rellena lo vacío)
  function dregDesdeCenso(e, d) {
    const f = e.datos?.aeat?.censo?.constitucion;
    if (f && !d.fconst) { d.fconst = f; d._o.fconst = 'Datos censales AEAT'; }
  }

  function vistaDreg() {
    const e = empresa();
    if (!e) return sinEmpresa;
    const d = dregDe(e); dregDesdeCenso(e, d); dregDesdeCA(e, d); dregDesdeEsc(e, d);
    const ed = puede();
    // datos de la ficha del Registro Mercantil: se rellenan los vacíos y se guardan una vez por empresa y sesión
    if (dregDesdeFicha(e, d) && ed && !dregFichaGuardada.has(e.id)) { dregFichaGuardada.add(e.id); setTimeout(() => dregGuardar(e, d, false), 0); }
    const admins = Array.isArray(d.admins) ? d.admins : [];
    // al abrir la pestaña, si faltan tomo, folio y hoja y hay cuentas anuales cargadas, se toman de ellas (una vez por empresa y sesión)
    if (ed && !(d.tomo && d.folio && d.hoja) && !dregCAProbado.has(e.id)) { dregCAProbado.add(e.id); setTimeout(() => dregDeCuentas(true), 0); }
    const av = d.nif && nifEmp() && d.nif !== nifEmp() ? `<p class="aviso">El NIF leído (${esc(d.nif)}) no coincide con el de la empresa seleccionada (${esc(nifEmp())})</p>` : '';
    const arch = d._arch;
    return `${ed ? `<div class="dropzone" data-kind="dreg" tabindex="0" role="button"><b>Suelta aquí el PDF, Excel o imagen (captura de pantalla) con los datos registrales</b> (nota simple, certificado IRUS, declaración de titularidad real, ficha de la sociedad del Registro Mercantil…) o pulsa para elegirlo. Se extraen NIF, IRUS, CNAE, Registro Mercantil, tomo, libro, folio, sección, hoja, inscripción, LEI, domicilio y fecha de constitución.
      <input type="file" data-dzkind="dreg" accept=".pdf,.xlsx,.xls,.csv,image/*" multiple hidden></div>` : ''}${avisoHtml()}${av}
      <section class="block"><h4 class="it-tit">Datos registrales · ${esc(e.nombre)}</h4>
      <table class="tabla rg-tabla rotulos"><thead><tr><th>Dato</th><th>Valor</th><th>Tomado de</th></tr></thead><tbody>
      ${DREG_CAMPOS.map(([k, t]) => `<tr><td><b>${t}</b></td><td><input class="facin" data-rgdreg="${k}" value="${esc(d[k] ?? '')}" size="${Math.max(12, String(d[k] ?? '').length + 2)}"${ed ? '' : ' disabled'}></td><td class="hint">${esc(d._o[k] ?? '')}</td></tr>`).join('')}
      </tbody></table>
      <h4 class="it-tit" style="margin-top:1rem">Administradores y cargos de la sociedad</h4>
      <table class="tabla rg-tabla rotulos"><thead><tr><th>Nombre</th><th>Cargo</th><th>Tomado de</th><th></th></tr></thead><tbody>
      ${admins.map((a, i) => `<tr><td><input class="facin" data-rgadm="${i}|nombre" value="${esc(a.nombre ?? '')}" size="${Math.max(24, String(a.nombre ?? '').length + 2)}"${ed ? '' : ' disabled'}></td><td><input class="facin" data-rgadm="${i}|cargo" value="${esc(a.cargo ?? '')}" size="${Math.max(24, String(a.cargo ?? '').length + 2)}"${ed ? '' : ' disabled'}></td><td class="hint">${esc(a.origen ?? '')}</td><td>${ed ? `<button class="small danger" data-act="m-rg-admdel" data-i="${i}" title="Quitar">✖</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vacio">Sin administradores: añádelos o suelta la ficha del Registro Mercantil.</td></tr>'}
      </tbody></table>
      ${ed ? '<p><button class="small" data-act="m-rg-admadd">+ Añadir administrador</button></p>' : ''}
      ${ed ? '<p><button class="small" data-act="m-rg-dregca">Tomar Registro Mercantil, tomo, folio y hoja de las cuentas anuales presentadas</button> <button class="small" data-act="m-rg-dregtr">Tomar Registro Mercantil, tomo, folio y hoja de Titularidad real</button></p>' : ''}
      ${arch.length ? `<p class="hint">Archivos leídos: ${arch.map((a) => `${esc(a.name)} (${esc(a.fecha)})${ed ? ` <button class="small" data-act="m-rg-dregquitar" data-n="${esc(a.name)}">Quitar</button>` : ''}`).join(' · ')}</p>
      <details><summary>Ver el texto extraído</summary>${arch.map((a) => `<h4>${esc(a.name)}</h4><pre class="rg-pre">${esc(a.texto ?? '')}</pre>`).join('')}</details>` : ''}
      </section>`;
  }

  async function admEditar(clave, v) {
    const e = empresa(); if (!e || !puede()) return;
    const [i, k] = clave.split('|'), d = dregDe(e); d.admins = (Array.isArray(d.admins) ? d.admins : []).map((a) => ({ ...a }));
    if (!d.admins[+i]) return;
    d.admins[+i][k] = String(v).trim(); d.admins[+i].origen = 'a mano';
    await dregGuardar(e, d, false);
  }
  async function admAnadir() {
    const e = empresa(); if (!e || !puede()) return;
    const d = dregDe(e); d.admins = [...(Array.isArray(d.admins) ? d.admins : []), { nombre: '', cargo: '', origen: 'a mano' }];
    await dregGuardar(e, d);
  }
  async function admQuitar(i) {
    const e = empresa(); if (!e || !puede()) return;
    const d = dregDe(e); d.admins = (Array.isArray(d.admins) ? d.admins : []).filter((_, j) => j !== +i);
    await dregGuardar(e, d);
  }
  async function dregEditar(k, v) {
    const e = empresa(); if (!e || !puede()) return;
    const d = dregDe(e); v = String(v).trim();
    d[k] = v; if (k === 'fconst') d.constitucion = v;
    d._o[k] = v ? 'a mano' : '';
    await dregGuardar(e, d, false);
  }
  async function dregQuitar(nombre) {
    const e = empresa(); if (!e) return;
    const d = dregDe(e);
    d._arch = d._arch.filter((a) => a.name !== nombre);
    Object.keys(d._o).forEach((k) => { if (d._o[k] === nombre) { delete d._o[k]; delete d[k]; } });
    await dregGuardar(e, d);
  }
  // datos registrales de la solicitud de depósito que lleva el PDF de las cuentas anuales: «Registro Mercantil de …» y «Datos Registrales: Tomo … Folio … Nº Hoja Registral …»
  function dregRegDeCA(texto) {
    const T = String(texto || '').replace(/\r/g, ''), R = {};
    let m = T.match(/Datos\s+Registrales\s*:?\s*Tomo\s*:?[\s_]*(\d{1,6})\s*Folio\s*:?[\s_]*(\d{1,6})\s*N[ºo°.]*\s*Hoja\s+Registral\s*:?[\s_]*([A-Z]{0,3}-?\s?\d{1,7})/i);
    if (m) { R.tomo = m[1]; R.folio = m[2]; R.hoja = m[3].replace(/\s/g, ''); }
    m = T.match(/SOLICITUD\s+DE\s+PRESENTACI[OÓ]N\s+EN\s+EL\s+REGISTRO\s+MERCANTIL\s+DE[\s_]*([A-ZÁÉÍÓÚÑ]+(?: [A-ZÁÉÍÓÚÑ]+)?)/);
    if (m) R.registro = `Registro Mercantil de ${m[1].toLowerCase().replace(/(^|\s)(\S)/g, (x, a, b) => a + b.toUpperCase())}`;
    return R;
  }
  let dregCAProbado = new Set();
  // rellena registro, tomo, folio y hoja con los de las cuentas anuales presentadas ya cargadas (del último ejercicio que los traiga)
  async function dregDeCuentas(auto = false) {
    const e = empresa(); if (!e) return;
    const filas = S.registros.filter((r) => r.tipo === 'rmdoc' && r.empresa_id === e.id && r.datos?.ca?.archivo?.path).sort((a, b) => b.ejercicio - a.ejercicio);
    if (!filas.length) { if (!auto) { msg = 'No hay cuentas anuales cargadas en 2.- Registro Mercantil › Cuentas anuales presentadas'; msgMal = true; render(); } return; }
    const d = dregDe(e); let R = {}, de = null;
    for (const f of filas) {
      try {
        let x = f.datos.ca.reg;
        if (!x) {
          const { data, error } = await db.storage.from('documentos').download(f.datos.ca.archivo.path);
          if (error) throw new Error(error.message);
          const { lineas } = await lineasDe(data);
          x = dregRegDeCA(lineas.map((l) => l.map((i) => i.s).join(' ')).join('\n'));
        }
        if (x.tomo || x.folio || x.hoja) { R = x; de = f; break; }
      } catch (err) { if (!auto) aviso(`${f.datos.ca.archivo.nombre}: ${err.message}`, true); }
    }
    let n = 0;
    ['registro', 'tomo', 'folio', 'hoja'].forEach((k) => { if (R[k] && (!d[k] || !auto && d._o[k] !== 'a mano')) { if (d[k] !== R[k]) n++; d[k] = R[k]; d._o[k] = `${de.datos.ca.archivo.nombre} (cuentas presentadas ${de.ejercicio})`; } });
    if (n) { msg = `${n} dato(s) registrales tomados de las cuentas anuales presentadas ${de.ejercicio}`; msgMal = false; await dregGuardar(e, d); }
    else if (!auto) { msg = Object.keys(R).length ? 'Los datos registrales ya coinciden con los de las cuentas anuales' : 'No encuentro tomo, folio y hoja en las cuentas anuales cargadas'; msgMal = !Object.keys(R).length; render(); }
  }
  async function dregDeTitReal() {
    const e = empresa(); if (!e) return;
    const T = trlDe(), d = dregDe(e); let n = 0;
    T.archivos.forEach((a) => {
      const R = dregExtraer(a.texto ?? '');
      ['registro', 'tomo', 'folio', 'hoja', 'irus', 'nif', 'denominacion'].forEach((k) => {
        if (R[k] && (!d[k] || ['registro', 'tomo', 'folio', 'hoja'].includes(k))) { d[k] = R[k]; d._o[k] = `${a.name} (Titularidad real)`; n++; }
      });
    });
    msg = n ? `${n} dato(s) tomados de Titularidad real` : 'No hay datos registrales en los archivos de Titularidad real'; msgMal = !n;
    await dregGuardar(e, d);
  }

  // ================= Titularidad Real =================
  const TRL_CAMPOS = [['nombre', 'Apellidos y nombre', 24], ['paisExp', 'País exp.', 3], ['tipoDoc', 'Tipo doc.', 5], ['doc', 'Documento', 10], ['fnac', 'Fecha nac.', 9],
    ['nac', 'Nacion.', 3], ['res', 'País resid.', 3], ['pctDir', '% directo', 5], ['pctInd', '% indirecto', 5], ['tipo', 'Tipo de titular real', 20]];
  const TRL_SOC = [['titular', 'Doc. titular real', 10], ['nivel', 'Nivel', 2], ['nombre', 'Denominación social', 20], ['pais', 'Nacion.', 3], ['paisExp', 'País exp.', 3],
    ['tipoDoc', 'Tipo doc.', 4], ['doc', 'Documento', 10], ['pct', '% en participada', 5], ['domicilio', 'Domicilio social', 30], ['registro', 'Datos registrales / LEI', 18]];
  const TRL_CAD = [['titular', 'Doc. titular real', 11], ['participante', 'Doc. participante', 11], ['participada', 'Doc. participada', 11], ['pct', '% participación directa', 7]];
  const TRL_TIPOS = ['Capital > 25 %', 'Derechos de voto > 25 %', 'Control por otros medios', 'Administrador / dirección (asimilado)'];
  const RX_DOC = /\b([XYZ]\d{7}[A-Z]|\d{8}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])\b/g;
  const RX_PJ = /\b(S\.?\s?L\.?U?|S\.?\s?A\.?U?|SOCIEDAD|LIMITADA|AN[OÓ]NIMA|S\.?\s?COOP|LTD|GMBH|B\.?V\.?|INC\.?|SARL|SAS|SPA|S\.?R\.?L\.?|HOLDING|INVERSIONES|FUNDACI[OÓ]N)\b/i;
  const TRL_PAISES = { ESPAÑA: 'ESPAÑA', ESPAÑOLA: 'ESPAÑA', ESPAÑOL: 'ESPAÑA', SPAIN: 'ESPAÑA', FRANCIA: 'FRANCIA', FRANCESA: 'FRANCIA', PORTUGAL: 'PORTUGAL', PORTUGUESA: 'PORTUGAL',
    ITALIA: 'ITALIA', ITALIANA: 'ITALIA', ALEMANIA: 'ALEMANIA', ALEMANA: 'ALEMANIA', 'REINO UNIDO': 'REINO UNIDO', BRITÁNICA: 'REINO UNIDO', 'PAÍSES BAJOS': 'PAÍSES BAJOS',
    NEERLANDESA: 'PAÍSES BAJOS', BÉLGICA: 'BÉLGICA', SUIZA: 'SUIZA', LUXEMBURGO: 'LUXEMBURGO', ANDORRA: 'ANDORRA', MARRUECOS: 'MARRUECOS', MÉXICO: 'MÉXICO', ARGENTINA: 'ARGENTINA',
    'ESTADOS UNIDOS': 'ESTADOS UNIDOS', IRLANDA: 'IRLANDA' };

  const trlReg = () => S.registros.find((r) => r.tipo === 'titreal' && r.empresa_id === S.sel);
  const trlDe = () => {
    const D = JSON.parse(JSON.stringify(trlReg()?.datos ?? {}));
    D.archivos ??= []; D.titulares ??= []; D.sociedades ??= []; D.cadena ??= []; D.cab ??= {};
    return D;
  };
  async function trlGuardar(D, redibujar = true) {
    const r = trlReg();
    if (r) {
      const { error } = await db.from('registros').update({ datos: D }).eq('id', r.id);
      if (error) return aviso(error.message, true);
      r.datos = D;
    } else {
      const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'titreal', ejercicio: null, datos: D };
      const { error } = await db.from('registros').insert(fila);
      if (error) return aviso(error.message, true);
      S.registros.push(fila);
    }
    if (redibujar) render();
  }

  const trlPct = (s) => {
    const m = String(s ?? '').replace(/\s/g, '').match(/(\d{1,3}(?:[.,]\d{1,6})?)%?/);
    if (!m) return '';
    const n = parseFloat(m[1].replace(',', '.'));
    return Number.isNaN(n) || n > 100 ? '' : String(n).replace('.', ',');
  };
  const trlFecha = (s) => {
    if (s instanceof Date) return fdate(s);
    const m = String(s ?? '').match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
    return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}` : '';
  };
  const trlPaises = (s) => {
    const u = String(s ?? '').toUpperCase(), r = [];
    Object.keys(TRL_PAISES).forEach((k) => { let i = u.indexOf(k); while (i >= 0) { r.push([i, TRL_PAISES[k]]); i = u.indexOf(k, i + 1); } });
    return r.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  };
  const trlPais = (s) => trlPaises(s)[0] || '';
  const trlEsPJ = (doc, nom) => /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(doc || '') || RX_PJ.test(nom || '');
  const trlTipoDoc = (d) => (/^[XYZ]\d{7}[A-Z]$/.test(d) ? 'NIE' : /^\d{8}[A-Z]$/.test(d) ? 'DNI' : /^[A-Z]\d{7}[0-9A-J]$/.test(d) ? 'NIF' : d ? 'Pasaporte/otro' : '');
  const trlTipoCtx = (t, pDir, pInd) => {
    const u = String(t || '').toUpperCase();
    if (/ADMINISTRADOR|DIRECCI[OÓ]N|ASIMILAD|CONSEJ/.test(u)) return TRL_TIPOS[3];
    if (/VOTO/.test(u)) return TRL_TIPOS[1];
    if (/OTROS MEDIOS|CONTROL/.test(u)) return TRL_TIPOS[2];
    return (parseFloat(String(pDir || 0).replace(',', '.')) || 0) + (parseFloat(String(pInd || 0).replace(',', '.')) || 0) > 0 ? TRL_TIPOS[0] : '';
  };

  // Excel: busca la fila de cabecera y lee una persona o sociedad por fila
  function trlDeExcel(sheets) {
    const T = [], S_ = [];
    const K = { nombre: /nombre|apellido|titular|denominaci|raz[oó]n social|socio|accionista/, doc: /\bnif\b|\bdni\b|\bnie\b|\bcif\b|documento|pasaporte|identificaci/, tipoDoc: /tipo\s*(de\s*)?doc/,
      fnac: /nacimiento/, nac: /nacionalidad/, res: /residencia/, pctDir: /direct/, pctInd: /indirect/, pct: /%|particip|porcentaje/, voto: /voto/,
      tipo: /tipo de titular|cargo|condici[oó]n|tipo de control|^tipo$/, nivel: /nivel/, domicilio: /domicilio|direcci[oó]n/, registro: /registr|lei/ };
    sheets.forEach((sh) => {
      const rows = sh.rows ?? []; let hr = -1, M = null;
      for (let i = 0; i < Math.min(25, rows.length); i++) {
        const m = {};
        (rows[i] ?? []).forEach((h, j) => {
          const t = String(h ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
          if (!t) return;
          Object.entries(K).forEach(([k, rx]) => { if (m[k] === undefined && rx.test(t) && !(k === 'nombre' && /tipo/.test(t)) && !(k === 'doc' && /tipo/.test(t))) m[k] = j; });
        });
        if ((m.nombre !== undefined) + (m.doc !== undefined) + (m.pct !== undefined || m.pctDir !== undefined) + (m.nac !== undefined) >= 2) { hr = i; M = m; break; }
      }
      if (hr < 0) return;
      for (let i = hr + 1; i < rows.length; i++) {
        const r = rows[i] ?? [], g = (k) => (M[k] !== undefined ? r[M[k]] : '');
        const nom = String(g('nombre') ?? '').trim(), doc = String(g('doc') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!nom && !doc) continue;
        if (/^total/i.test(nom)) continue;
        const pDir = trlPct(g('pctDir') !== '' && M.pctDir !== undefined ? g('pctDir') : g('pct')), pInd = trlPct(g('pctInd'));
        if (trlEsPJ(doc, nom)) S_.push({ nombre: nom, doc, nivel: String(g('nivel') ?? ''), pais: trlPais(g('nac') || g('res')) || String(g('nac') ?? ''), pct: pDir, domicilio: String(g('domicilio') ?? ''), registro: String(g('registro') ?? '') });
        else T.push({ nombre: nom, tipoDoc: String(g('tipoDoc') ?? '') || trlTipoDoc(doc), doc, fnac: trlFecha(g('fnac')), nac: trlPais(g('nac')) || String(g('nac') ?? ''),
          res: trlPais(g('res')) || String(g('res') ?? ''), pctDir: pDir, pctInd: pInd, tipo: trlTipoCtx(String(g('tipo') ?? '') + (M.voto !== undefined && g('voto') ? ' VOTO' : ''), pDir, pInd) });
      }
    });
    return { T, S: S_ };
  }

  // PDF: cada documento (DNI, NIE, NIF) es una persona o sociedad; el resto de datos se toma de su línea y de las de alrededor
  function trlDeTexto(lineas) {
    const T = [], S_ = [], vistos = new Set(), propio = nifEmp().replace(/[^A-Z0-9]/g, '');
    const L = lineas.map((l) => (Array.isArray(l) ? l.map((i) => i.s).join(' ') : String(l)));
    const limpiaNom = (t) => {
      let x = String(t || '');
      if (x.includes(':')) x = x.slice(x.lastIndexOf(':') + 1);
      x = x.replace(/(^|\s)(APELLIDOS?( Y NOMBRE)?|NOMBRE|DENOMINACI[OÓ]N SOCIAL|RAZ[OÓ]N SOCIAL|DNI|NIF|NIE|N\.I\.F\.?|DOCUMENTO|TITULAR REAL|D\.|DÑA\.|DOÑA|DON|SR\.|SRA\.)(?=\s|$)/gi, ' ');
      return x.replace(/\s+(CON|Y|CUYO|PROVISTO|PROVISTA|TITULAR DEL|CON EL)\s*$/i, '').replace(/[\s,;|.-]+$/, '').replace(/^[\s,;|.-]+/, '').replace(/\s+/g, ' ').trim();
    };
    L.forEach((ln, i) => {
      const docs = [...ln.toUpperCase().matchAll(RX_DOC)];
      docs.forEach((m, k) => {
        const doc = m[1];
        if (doc === propio || vistos.has(doc)) return;
        vistos.add(doc);
        const ini = k ? docs[k - 1].index + docs[k - 1][0].length : 0;
        let nom = limpiaNom(ln.slice(ini, m.index));
        if (nom.length < 4) {
          const desp = limpiaNom(ln.slice(m.index + doc.length).split(/\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d+[.,]?\d*\s*%/)[0]);
          nom = desp.length >= 4 ? desp : limpiaNom(L[i - 1] || '');
        }
        const ctx = [L[i - 1] || '', ln, L[i + 1] || ''].join(' '), sig = ln.slice(m.index + doc.length);
        const pm = [...sig.matchAll(/(\d{1,3}(?:[.,]\d{1,6})?)\s*%\s*(?:de\s+(?:forma\s+|manera\s+)?)?(indirect\w*|direct\w*)?/gi)].map((x) => ({ v: trlPct(x[1]), t: (x[2] || '').toLowerCase() })).filter((x) => x.v);
        let pD = '', pI = '';
        pm.forEach((x) => { if (/^indirect/.test(x.t)) pI ||= x.v; else if (/^direct/.test(x.t)) pD ||= x.v; else if (!pD) pD = x.v; else if (!pI) pI = x.v; });
        if (trlEsPJ(doc, nom)) S_.push({ nombre: nom, doc, nivel: (sig.match(/\bnivel\s*(\d)/i) || [])[1] || '', pais: trlPais(sig) || '', pct: pD || pI || '', domicilio: '', registro: '' });
        else {
          const ps = trlPaises(sig);
          T.push({ nombre: nom, tipoDoc: trlTipoDoc(doc), doc, fnac: trlFecha(sig) || trlFecha(ctx), nac: ps[0] || '', res: ps[1] || ps[0] || '', pctDir: pD, pctInd: pI,
            tipo: trlTipoCtx(`${ln} ${pD || pI ? '' : (L[i - 1] || '')}`, pD, pI) });
        }
      });
    });
    return { T, S: S_ };
  }

  // modelo oficial del Registro Mercantil (declaración de identificación del titular real, hojas TR / TRcc / TRcd)
  function trlDeFormTR(lineas) {
    const T = [], S_ = [], C = [], cab = {}; let sec = '';
    const TD = '(DNI-NIF|DNI|NIF|NIE|TIN|PASAPORTE|OTRO)';
    const rxP = new RegExp(`\\b([A-Z]{2})\\s+${TD}\\s+([A-Z0-9]+)\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s+([A-Z]{2})\\s+([A-Z]{2})(?:\\s+([\\d.,]+))?(?:\\s+([\\d.,]+))?`);
    const rxS = new RegExp(`^(\\d+)\\s+([A-Z]{2})\\s+${TD}\\s+([A-Z0-9]+)\\s+([A-Z]{2})\\b`);
    const txt = (l) => l.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
    const cabecera = (t) => /APELLIDOS|EXPEDICI|DOCUMENTO|NACIONALIDAD|RESIDENCIA|PARTICIPACI|MIENTO|^\(|^%/.test(t);
    const pct = (x) => (x ? String(x).replace(/\./g, '') : '');
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i], t = txt(l), U = t.toUpperCase(), nx = lineas[i + 1] ? txt(lineas[i + 1]) : '';
      if (/SOLICITUD DE PRESENTACI/.test(U)) sec = 'fin';
      if (sec === 'fin') continue;
      if (/OBLIGADA A PRESENTAR/.test(U)) cab.oblig = ((`${U} ${nx.toUpperCase()}`).match(/\b(SI|SÍ|NO)\b(?!.*\b(SI|SÍ|NO)\b)/) || [])[1] || cab.oblig;
      if (/PRESENTA POR PRIMERA VEZ/.test(U)) cab.presenta = (U.match(/\b(SI|SÍ|NO)\s*$/) || [])[1] || cab.presenta;
      if (/TIPO DE ACTUALIZACI/.test(U)) cab.tipo = (U.match(/\b(PRIMERA|ACTUALIZACI[OÓ]N|RECTIFICACI[OÓ]N)\b\s*$/) || [])[1] || cab.tipo;
      if (/DEBE REPUTARSE/.test(U)) cab.fecha = (t.match(/\d{2}\.\d{2}\.\d{4}/) || [])[0] || cab.fecha;
      const m0 = t.match(/^(I\.a|I\.b|II\.|III\.a|III\.b|IV\.a|IV\.b)\s/);
      if (m0) { sec = { 'I.a': 'Ia', 'I.b': 'Ib', 'II.': 'II', 'III.a': 'IIIa', 'III.b': 'IIIb', 'IV.a': 'IVa', 'IV.b': 'IVb' }[m0[1]]; continue; }
      if (/^(Ia|Ib|II)$/.test(sec)) {
        const m = t.match(rxP);
        if (!m) continue;
        let nom = t.slice(0, m.index).trim();
        if (!/[A-ZÁÉÍÓÚÑ]{2}/i.test(nom)) { for (let k = i - 1; k >= Math.max(0, i - 3); k--) { const p = txt(lineas[k]); if (p && !cabecera(p.toUpperCase())) { nom = p; break; } } }
        T.push({ nombre: nom, paisExp: m[1], tipoDoc: m[2], doc: m[3], fnac: m[4], nac: m[5], res: m[6], pctDir: sec === 'II' ? '' : pct(m[7]), pctInd: sec === 'II' ? '' : pct(m[8]),
          tipo: sec === 'Ia' ? TRL_TIPOS[0] : sec === 'Ib' ? TRL_TIPOS[1] : TRL_TIPOS[3] });
      } else if (/^III[ab]$/.test(sec)) {
        const m = t.match(rxS);
        if (!m) continue;
        const iNac = l.findIndex((it, k) => k > 0 && it.s === m[5] && l.slice(0, k).some((x) => x.s === m[4]));
        const resto = l.slice(iNac + 1);
        const reg = resto.filter((x) => /^T:|TOMO|HOJA|LEI|^[A-Z0-9]{20}$/i.test(x.s) || x.x >= 480), dom = resto.filter((x) => !reg.includes(x));
        const domX = dom.length ? Math.min(...dom.map((x) => x.x)) : 1e9;
        const prev = lineas[i - 1] || [];
        const tit = prev.find((x) => /^([XYZ]\d{7}[A-Z]|\d{8}[A-Z]|[A-Z]\d{7}[0-9A-J])$/.test(x.s));
        const nomIt = prev.filter((x) => x !== tit && x.x < domX - 5), domIt = prev.filter((x) => x !== tit && x.x >= domX - 5);
        S_.push({ titular: tit ? tit.s : '', nivel: m[1], nombre: nomIt.map((x) => x.s).join(' ').trim(), pais: m[5], paisExp: m[2], tipoDoc: m[3], doc: m[4], pct: '',
          domicilio: domIt.concat(dom).map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim(), registro: reg.map((x) => x.s).join(' ').trim(), via: sec === 'IIIa' ? 'capital' : 'voto' });
      } else if (/^IV[ab]$/.test(sec)) {
        const m = t.match(/^([A-Z0-9]{9})\s+([A-Z0-9]{9})\s+([A-Z0-9]{9})\s+([\d.,]+)$/);
        if (m) C.push({ titular: m[1], participante: m[2], participada: m[3], pct: pct(m[4]), via: sec === 'IVa' ? 'capital' : 'voto' });
      }
    }
    const propio = nifEmp();
    S_.forEach((x) => { const cc = C.find((q) => q.participante === x.doc && (q.participada === propio || !propio)) || C.find((q) => q.participante === x.doc); if (cc) x.pct = cc.pct; });
    return { T, S: S_, C, cab };
  }

  async function cargarTitReal(files) {
    if (!S.sel) return aviso('Elige primero la empresa.', true);
    const D = trlDe();
    for (const file of files) {
      let R = { T: [], S: [] }, texto = '';
      try {
        if (/\.pdf$/i.test(file.name)) {
          const { lineas, todo } = await lineasDe(file);
          texto = textoLineas(lineas);
          if (!texto.trim()) { texto = (await ocrPdf(file, (m) => aviso(`${file.name}: ${m}`))).join('\n'); R = trlDeTexto(texto.split('\n')); }
          else R = /DECLARACI[OÓ]N DE IDENTIFICACI[OÓ]N DEL TITULAR REAL/i.test(todo) && /I\.a/.test(todo) ? trlDeFormTR(lineas) : trlDeTexto(lineas);
        } else {
          const filas = await filasExcel(file), sh = [{ rows: filas ?? [] }];
          R = trlDeExcel(sh);
          if (!R.T.length && !R.S.length) {
            const ls = (filas ?? []).map((r) => (r ?? []).map(celdaTxt).join(' '));
            texto = ls.join('\n'); R = trlDeTexto(ls);
          } else texto = (filas ?? []).map((r) => (r ?? []).map(celdaTxt).join(' | ')).join('\n');
        }
      } catch (err) { aviso(`${file.name}: no se ha podido leer (${err.message})`, true); continue; }
      const add = (arr, nuevos) => nuevos.forEach((n) => {
        const i = arr.findIndex((x) => x.doc && x.doc === n.doc && (x.titular || '') === (n.titular || ''));
        n.origen = file.name;
        if (i >= 0) arr[i] = { ...arr[i], ...Object.fromEntries(Object.entries(n).filter(([, v]) => v !== '')) };
        else arr.push(n);
      });
      add(D.titulares, R.T); add(D.sociedades, R.S);
      if (R.C?.length) D.cadena = D.cadena.filter((x) => x.origen !== file.name).concat(R.C.map((x) => ({ ...x, origen: file.name })));
      if (R.cab && Object.keys(R.cab).length) D.cab = { ...D.cab, ...R.cab, origen: file.name };
      D.archivos = D.archivos.filter((a) => a.name !== file.name).concat([{ name: file.name, fecha: hoy(), n: R.T.length + R.S.length, texto: String(texto).slice(0, 60000) }]);
      msg = `${file.name}: ${R.T.length} titular(es) real(es) y ${R.S.length} sociedad(es) leídos${R.T.length + R.S.length ? '' : ' · revisa el texto extraído y complétalo a mano'}`;
      msgMal = !(R.T.length + R.S.length);
    }
    await trlGuardar(D);
  }

  function vistaTitReal() {
    const e = empresa();
    if (!e) return sinEmpresa;
    const D = trlDe(), ed = puede();
    const tabla = (arr, campos, clave, tit) => `<h4 class="it-sec">${tit} · ${arr.length}</h4><div class="wrap"><table class="tabla rg-tabla"><thead><tr>${campos.map((q) => `<th>${q[1]}</th>`).join('')}<th></th></tr></thead><tbody>
      ${arr.map((x, i) => `<tr title="${esc(`Origen: ${x.origen || 'a mano'}`)}">${campos.map(([k, , w]) => (k === 'tipo'
    ? `<td><select data-rgtr="${clave}|${i}|tipo"${ed ? '' : ' disabled'}><option value=""></option>${TRL_TIPOS.map((t) => `<option${x.tipo === t ? ' selected' : ''}>${t}</option>`).join('')}</select></td>`
    : `<td><input class="facin" data-rgtr="${clave}|${i}|${k}" value="${esc(x[k] || '')}" size="${w}"${ed ? '' : ' disabled'}></td>`)).join('')}<td>${ed ? `<button class="small danger" data-act="m-rg-trdel" data-c="${clave}" data-i="${i}">Quitar</button>` : ''}</td></tr>`).join('')
    || `<tr><td colspan="${campos.length + 1}" class="c">Sin datos: suelta un Excel o PDF o añade una línea</td></tr>`}
      </tbody></table></div>${ed ? `<button class="small" data-act="m-rg-tradd" data-c="${clave}" style="margin:6px 0 14px">+ Añadir línea</button>` : ''}`;
    const sinT = !D.titulares.length;
    return `${ed ? `<div class="dropzone" data-kind="trl" tabindex="0" role="button"><b>Suelta aquí el Excel o PDF de titularidad real</b> (declaración del Registro Mercantil, acta notarial, certificado, libro registro de socios…) o pulsa para elegirlo. Se extraen nombre, documento, fecha de nacimiento, nacionalidad, residencia, % directo e indirecto y tipo de titular real.
      <input type="file" data-dzkind="trl" accept=".pdf,.xlsx,.xls,.csv" multiple hidden></div>` : ''}${avisoHtml()}
      <section class="block"><h4 class="it-tit">Titularidad real · ${esc(e.nombre)}${e.cif ? ` · NIF ${esc(e.cif)}` : ''}</h4>
      <p class="hint">${sinT ? 'Sin titulares reales. Si ninguna persona física tiene más del 25 % (directo o indirecto) ni controla por otros medios, se declaran como titulares reales asimilados los administradores (art. 4.2.b Ley 10/2010).'
    : 'Revisa los datos extraídos: puedes corregir cualquier casilla, quitar o añadir líneas. Titular real: persona física con más del 25 % del capital o de los derechos de voto, directa o indirectamente, o que ejerza el control por otros medios.'}</p>
      <table class="tabla rg-tabla rotulos" style="width:auto;margin-bottom:12px"><tbody>${[['oblig', 'Obligada a presentar la identificación del titular real (SI/NO)'], ['presenta', 'Presenta por primera vez o actualiza/ratifica (SI/NO)'],
    ['tipo', 'Tipo de actualización (PRIMERA / ACTUALIZACIÓN / RECTIFICACIÓN)'], ['fecha', 'Fecha en que se produce el cambio (DD.MM.AAAA)']]
    .map(([k, t]) => `<tr><td>${t}</td><td><input class="facin" data-rgtrcab="${k}" value="${esc(D.cab[k] || '')}" size="14"${ed ? '' : ' disabled'}></td></tr>`).join('')}</tbody></table>
      ${tabla(D.titulares, TRL_CAMPOS, 'titulares', 'I-II. Titulares reales (personas físicas)')}
      ${tabla(D.sociedades, TRL_SOC, 'sociedades', 'III. Sociedades que intervienen en la cadena de control')}
      ${tabla(D.cadena, TRL_CAD, 'cadena', 'IV. Participaciones en la cadena de control')}
      ${D.archivos.length ? `<h4 class="it-sec">Archivos leídos</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Archivo</th><th>Fecha de carga</th><th>Registros</th><th></th></tr></thead><tbody>
      ${D.archivos.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.fecha)}</td><td class="num">${a.n}</td><td>${ed ? `<button class="small danger" data-act="m-rg-trquitar" data-n="${esc(a.name)}">Quitar</button>` : ''}</td></tr>`).join('')}</tbody></table>
      <details style="margin-top:8px"><summary>Ver el texto extraído de los archivos</summary>${D.archivos.map((a) => `<h4>${esc(a.name)}</h4><pre class="rg-pre">${esc(a.texto || '')}</pre>`).join('')}</details>` : ''}
      </section>`;
  }

  async function trlCampo(clave, valor) {
    const [col, i, k] = clave.split('|'); const D = trlDe();
    if (!D[col][+i]) return;
    D[col][+i][k] = valor;
    await trlGuardar(D, false);
  }
  async function trlCab(k, v) { const D = trlDe(); D.cab[k] = v; await trlGuardar(D, false); }

  // ================= Organigrama / Accionariado (común a todo el grupo) =================
  // Excel con casillas (socios y sociedades) unidas con flechas y el % de cada participación → participaciones
  async function accLeerOrganigrama(buf) {
    if (!window.JSZip) throw new Error('No se ha podido cargar el lector de Excel (JSZip). Revisa la conexión a internet.');
    const zip = await window.JSZip.loadAsync(buf), dp = new DOMParser();
    const leer = async (p) => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
    const all = (d, t) => (d ? Array.from(d.getElementsByTagNameNS('*', t)) : []);
    const ss = all(await leer('xl/sharedStrings.xml'), 'si').map((si) => all(si, 't').map((t) => t.textContent).join(''));
    const wbRels = all(await leer('xl/_rels/workbook.xml.rels'), 'Relationship'), wb = await leer('xl/workbook.xml');
    const res = [];
    for (const sh of all(wb, 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const rel = wbRels.find((r) => r.getAttribute('Id') === rid);
      if (!rel) continue;
      const path = `xl/${rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\.\//, '')}`;
      const doc = await leer(path);
      if (!doc) continue;
      const col2n = (s) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const ref = (r) => { const m = r.match(/^([A-Z]+)(\d+)$/); return { c: col2n(m[1]), r: +m[2] - 1 }; };
      const fm = all(doc, 'sheetFormatPr')[0];
      const defW = fm && fm.getAttribute('defaultColWidth') ? +fm.getAttribute('defaultColWidth') : (fm && fm.getAttribute('baseColWidth') ? +fm.getAttribute('baseColWidth') + 0.71 : 8.43);
      const defH = fm && fm.getAttribute('defaultRowHeight') ? +fm.getAttribute('defaultRowHeight') : 15;
      const cw = {}; all(doc, 'col').forEach((q) => { for (let i = +q.getAttribute('min'); i <= +q.getAttribute('max'); i++) cw[i - 1] = +q.getAttribute('width'); });
      const rh = {}; all(doc, 'row').forEach((q) => { if (q.getAttribute('ht')) rh[+q.getAttribute('r') - 1] = +q.getAttribute('ht'); });
      const wpx = (q) => Math.round((cw[q] !== undefined ? cw[q] : defW) * 7 + 5), hpx = (q) => ((rh[q] !== undefined ? rh[q] : defH) * 96) / 72;
      const X = (q) => { let s = 0; for (let i = 0; i < q; i++) s += wpx(i); return s; }, Y = (q) => { let s = 0; for (let i = 0; i < q; i++) s += hpx(i); return s; };
      const merges = all(doc, 'mergeCell').map((m) => { const [a, b] = m.getAttribute('ref').split(':').map(ref); return { c1: a.c, r1: a.r, c2: b.c, r2: b.r }; });
      const celdas = [];
      all(doc, 'c').forEach((q) => {
        const v = all(q, 'v')[0], t = q.getAttribute('t'); let val = null;
        if (t === 's' && v) val = ss[+v.textContent]; else if (t === 'inlineStr') val = all(q, 't').map((x) => x.textContent).join(''); else if (v) val = t === 'str' ? v.textContent : +v.textContent;
        if (val === null || val === '' || (typeof val === 'string' && !val.trim())) return;
        const p = ref(q.getAttribute('r')); const m = merges.find((mm) => mm.c1 === p.c && mm.r1 === p.r) || { c1: p.c, r1: p.r, c2: p.c, r2: p.r };
        celdas.push({ val, x1: X(m.c1), x2: X(m.c2 + 1), y1: Y(m.r1), y2: Y(m.r2 + 1), ref: q.getAttribute('r') });
      });
      const segs = [];
      const shRels = await leer(path.replace(/worksheets\/(sheet\d+\.xml)$/, 'worksheets/_rels/$1.rels'));
      const dRel = all(shRels, 'Relationship').find((r) => /drawing$/.test(r.getAttribute('Type') || ''));
      if (dRel) {
        const dd = await leer(`xl/${dRel.getAttribute('Target').replace(/^\.\.\//, '')}`);
        all(dd, 'twoCellAnchor').forEach((a) => {
          const sp = all(a, 'cxnSp')[0] || all(a, 'sp')[0];
          if (!sp) return;
          const prst = (all(sp, 'prstGeom')[0] || { getAttribute: () => '' }).getAttribute('prst') || '';
          if (!/connector|line|arrow/i.test(prst)) return;
          const pt = (tag) => { const el = all(a, tag)[0]; const g = (n) => +(all(el, n)[0] || { textContent: 0 }).textContent; return { x: X(g('col')) + g('colOff') / 9525, y: Y(g('row')) + g('rowOff') / 9525 }; };
          const f = pt('from'), t = pt('to'), xf = all(sp, 'xfrm')[0], fh = xf && xf.getAttribute('flipH') === '1', fv = xf && xf.getAttribute('flipV') === '1';
          const p1 = { x: fh ? t.x : f.x, y: fv ? t.y : f.y }, p2 = { x: fh ? f.x : t.x, y: fv ? f.y : t.y };
          const tail = !!all(sp, 'tailEnd').find((q) => q.getAttribute('type') && q.getAttribute('type') !== 'none'), head = !!all(sp, 'headEnd').find((q) => q.getAttribute('type') && q.getAttribute('type') !== 'none');
          segs.push({ p1, p2, tail, head, elbow: /bent/i.test(prst) });
        });
      }
      res.push({ hoja: sh.getAttribute('name'), celdas, segs });
    }
    return res;
  }
  const accNorm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(S\.?\s?L\.?U?|S\.?\s?A\.?U?|SL|SA|SLU)\b\.?/g, '').replace(/[^A-Z0-9Ñ ]/g, ' ').replace(/\b(DE|DEL|LA|LAS|LOS|EL|Y)\b/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^MAXLOGTRANS$/, 'MAXIMA LOGISTICA EN TRANSPORTE').replace(/^HEROGRA FER$/, 'HEROGRA FERTILIZANTES'); // nombres abreviados del Excel
  // el mismo socio con el mismo % en la misma sociedad, escrito de dos formas («LUIS MARTIN» y «LUIS MARTIN AGUADO»): se queda el nombre más completo
  function accUnir(rel) {
    const tok = (s) => accNorm(s).split(' ').filter(Boolean);
    const dentro = (a, b) => a.length >= 2 && a.length < b.length && a.every((t) => b.includes(t));
    // cada sociedad se toma de la última hoja en que aparece como participada (la consolidada); las demás hojas la repiten con otros esquemas
    const ultima = {};
    rel.forEach((r) => { const k = accNorm(r.participada); ultima[k] = Math.max(ultima[k] ?? -1, r.hoja ?? 0); });
    rel = rel.filter((r) => (r.hoja ?? 0) === ultima[accNorm(r.participada)]);
    // «RESTO» no es un socio: es el conjunto de los demás y repite el % de otro socio de la misma sociedad
    rel = rel.filter((r) => accNorm(r.socio) !== 'RESTO' || !rel.some((q) => q !== r && accNorm(q.socio) !== 'RESTO' && accNorm(q.participada) === accNorm(r.participada) && Math.abs((+q.pct || 0) - (+r.pct || 0)) < 1e-6));
    // el mismo socio con dos % distintos en la misma sociedad: el pequeño suele ser el de otro socio mal enlazado, se queda el mayor
    rel = rel.filter((r) => !rel.some((q) => q !== r && accNorm(q.socio) === accNorm(r.socio) && accNorm(q.participada) === accNorm(r.participada) && (+q.pct || 0) > (+r.pct || 0)));
    return rel.filter((r, i) => {
      const a = tok(r.socio), p = accNorm(r.participada);
      return !rel.some((q, j) => j !== i && accNorm(q.participada) === p && Math.abs((+q.pct || 0) - (+r.pct || 0)) < 1e-6 && dentro(a, tok(q.socio)));
    });
  }
  function accRelaciones(H) {
    const out = [], avisos = [];
    H.forEach(({ hoja, celdas, segs }, nh) => {
      const ents = celdas.filter((q) => typeof q.val === 'string' && !/^\s*[\d.,]+\s*%?\s*$/.test(q.val));
      const pcs = celdas.filter((q) => (typeof q.val === 'number' && q.val > 0 && q.val <= 1.0000001) || (typeof q.val === 'string' && /^\s*[\d.,]+\s*%\s*$/.test(q.val)));
      const pv = (q) => (typeof q.val === 'number' ? q.val * 100 : parseFloat(q.val.replace(',', '.')));
      const cerca = (a, b, t = 10) => Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t;
      const enCaja = (p, q, t = 8) => p.x >= q.x1 - t && p.x <= q.x2 + t && p.y >= q.y1 - t && p.y <= q.y2 + t;
      const junto = (e, P) => e.x >= P.x1 - 4 && e.x <= P.x2 + 4 && ((e.y >= P.y2 - 6 && e.y <= P.y2 + 30) || (e.y <= P.y1 + 6 && e.y >= P.y1 - 30));
      // sigue una línea desde el %: devuelve la casilla a la que llega y si termina en flecha (apunta a esa casilla)
      const seguir = (seg, desdeP1) => {
        let cur = desdeP1 ? seg : { p1: seg.p2, p2: seg.p1, tail: seg.head, head: seg.tail }; const usados = new Set([seg]); let haciaP = cur.head;
        for (let k = 0; k < 12; k++) {
          if (cur.tail) break;
          const pt = cur.p2;
          if (ents.some((q) => enCaja(pt, q, 3))) break; // la línea termina al llegar a una casilla
          const nx = segs.find((s) => !usados.has(s) && (cerca(s.p1, pt, 12) || cerca(s.p2, pt, 12)));
          if (!nx) break;
          usados.add(nx);
          cur = cerca(nx.p1, pt, 12) ? nx : { p1: nx.p2, p2: nx.p1, tail: nx.head, head: nx.tail };
          haciaP = haciaP || cur.head;
        }
        const pt = cur.p2, baja = pt.y >= cur.p1.y;
        const e = ents.filter((q) => enCaja(pt, q, 10)).sort((a, b) => Math.min(Math.abs(a.y1 - pt.y), Math.abs(a.y2 - pt.y)) - Math.min(Math.abs(b.y1 - pt.y), Math.abs(b.y2 - pt.y)))[0]
          || ents.filter((q) => q.x1 - 12 <= pt.x && q.x2 + 12 >= pt.x && (baja ? q.y1 >= pt.y - 12 : q.y2 <= pt.y + 12)).sort((a, b) => (baja ? a.y1 - b.y1 : b.y2 - a.y2))[0];
        return { e, flecha: !!cur.tail, haciaP };
      };
      pcs.forEach((P) => {
        const cx = (P.x1 + P.x2) / 2, lados = [];
        segs.forEach((s) => {
          if (Math.abs(s.p2.y - s.p1.y) <= 3 && Math.abs(s.p2.x - s.p1.x) > 40) return; // una línea horizontal larga no sale de un %
          const j1 = junto(s.p1, P), j2 = junto(s.p2, P);
          if (j1 && j2) { // línea corta con los dos extremos junto al %: se sigue desde el extremo que toca la casilla
            const d = (p) => Math.hypot(Math.max(P.x1 - p.x, 0, p.x - P.x2), Math.max(P.y1 - p.y, 0, p.y - P.y2));
            lados.push(seguir(s, d(s.p1) <= d(s.p2)));
          } else if (j1) lados.push(seguir(s, true));
          else if (j2) lados.push(seguir(s, false));
        });
        const vale = lados.filter((l) => l.e && !(l.e.y1 >= P.y1 - 1 && l.e.y2 <= P.y2 + 1));
        let socio = null, dest = null;
        const mismo = (p, q) => p === q || (p && q && String(p.val).trim() === String(q.val).trim()); // la misma sociedad dibujada en dos casillas
        const conFlecha = vale.filter((l) => l.flecha).filter((l, i, a) => a.findIndex((m) => mismo(m.e, l.e)) === i), sinFlecha = vale.filter((l) => !l.flecha);
        if (conFlecha.length === 1) { dest = conFlecha[0].e; socio = (sinFlecha.find((l) => !mismo(l.e, dest)) || vale.find((l) => !mismo(l.e, dest) && l.haciaP) || {}).e || null; }
        if (!socio) socio = ents.filter((q) => q.y2 <= P.y1 + 2 && P.y1 - q.y2 <= 100 && q.x1 <= cx && q.x2 >= cx).sort((a, b) => b.y2 - a.y2)[0];
        if (!dest) dest = ents.filter((q) => q.y1 >= P.y2 - 2 && q.y1 - P.y2 <= 100 && q.x1 <= cx && q.x2 >= cx).sort((a, b) => a.y1 - b.y1)[0];
        if (socio && dest && socio !== dest) out.push({ socio: String(socio.val).trim(), participada: String(dest.val).trim(), pct: Math.round(pv(P) * 1e6) / 1e6, celda: P.ref, hoja: nh });
        else avisos.push(`Porcentaje ${P.ref} (${pv(P).toFixed(4)} %): no se encuentra ${socio ? 'la sociedad participada' : 'el socio'}`);
      });
    });
    return { rel: out, avisos };
  }

  // las participaciones son del grupo: se guardan una sola vez, colgando de la primera empresa
  const accReg = () => S.registros.find((r) => r.tipo === 'accionariado');
  const accDatos = () => { const D = JSON.parse(JSON.stringify(accReg()?.datos ?? {})); D.rel ??= []; D.archivos ??= []; D.tipos ??= {}; return D; };
  async function accGuardar(D) {
    const r = accReg();
    if (r) {
      const { error } = await db.from('registros').update({ datos: D }).eq('id', r.id);
      if (error) return aviso(error.message, true);
      r.datos = D;
    } else {
      const fila = { id: crypto.randomUUID(), empresa_id: S.empresas[0]?.id ?? S.sel, tipo: 'accionariado', ejercicio: null, datos: D };
      const { error } = await db.from('registros').insert(fila);
      if (error) return aviso(error.message, true);
      S.registros.push(fila);
    }
  }
  async function cargarAccionariado(files) {
    for (const file of files) {
      let R;
      try { R = accRelaciones(await accLeerOrganigrama(await file.arrayBuffer())); } catch (err) { R = { rel: [], avisos: [], err }; }
      // si no es un organigrama (sin flechas), tabla con columnas socio / sociedad / %
      if (!R.rel.length) {
        try {
          const rows = (await filasExcel(file)) ?? []; let hr = -1, M = null;
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            const m = {};
            (rows[i] ?? []).forEach((h, j) => {
              const t = String(h ?? '').toLowerCase();
              if (m.s === undefined && /socio|accionista|titular|partícipe|participe/.test(t)) m.s = j;
              else if (m.p === undefined && /participada|sociedad|empresa|entidad/.test(t)) m.p = j;
              else if (m.pct === undefined && /%|porcentaje|particip/.test(t)) m.pct = j;
            });
            if (m.s !== undefined && m.p !== undefined && m.pct !== undefined) { hr = i; M = m; break; }
          }
          if (hr >= 0) {
            for (let i = hr + 1; i < rows.length; i++) {
              const r = rows[i] ?? [], so = String(r[M.s] ?? '').trim(), pa = String(r[M.p] ?? '').trim();
              let pc = typeof r[M.pct] === 'number' ? r[M.pct] : parseFloat(String(r[M.pct] ?? '').replace('%', '').replace(',', '.'));
              if (!so || !pa || Number.isNaN(pc)) continue;
              if (pc <= 1 && typeof r[M.pct] === 'number') pc *= 100;
              R.rel.push({ socio: so, participada: pa, pct: Math.round(pc * 1e6) / 1e6, celda: `fila ${i + 1}` });
            }
          }
        } catch (err) { R.err ??= err; }
      }
      if (!R.rel.length && R.err) { aviso(`${file.name}: no se ha podido leer (${R.err.message})`, true); continue; }
      const D = accDatos(), vistos = new Set();
      D.rel = D.rel.filter((r) => r.origen !== file.name);
      accUnir(R.rel).forEach((r) => {
        const k = `${accNorm(r.socio)}|${accNorm(r.participada)}`;
        vistos.add(k); r.origen = file.name; // si el mismo enlace sale en varias hojas, manda el último (la hoja TOTAL, que es la consolidada)
        D.rel = D.rel.filter((x) => `${accNorm(x.socio)}|${accNorm(x.participada)}` !== k); D.rel.push(r);
      });
      D.archivos = D.archivos.filter((a) => a.name !== file.name).concat([{ name: file.name, fecha: hoy(), n: vistos.size, avisos: R.avisos }]);
      await accGuardar(D);
      msg = `${file.name}: ${vistos.size} participaciones leídas${R.avisos.length ? ` · ${R.avisos.length} porcentaje(s) sin enlazar` : ''}`; msgMal = !vistos.size || R.avisos.length > 0;
    }
    render();
  }

  // participación efectiva (directa + indirecta por todas las cadenas)
  function accGrafo(rel) {
    const N = {}, nom = {};
    rel.forEach((r) => { const a = accNorm(r.socio), b = accNorm(r.participada); if (!a || !b) return; nom[a] ||= r.socio; nom[b] ||= r.participada; (N[a] ||= []).push({ b, p: (+r.pct || 0) / 100 }); });
    return { N, nom };
  }
  function accEfectiva(G, a, b) {
    let tot = 0;
    const dfs = (x, acc, vis) => { (G.N[x] || []).forEach(({ b: y, p }) => { if (vis.has(y)) return; const v = acc * p; if (y === b) tot += v; else { vis.add(y); dfs(y, v, vis); vis.delete(y); } }); };
    dfs(a, 1, new Set([a]));
    return tot * 100;
  }
  function accCaminos(G, a, b) {
    const out = [];
    const dfs = (x, path, ps, acc, vis) => {
      (G.N[x] || []).forEach(({ b: y, p }) => {
        if (vis.has(y)) return;
        const v = acc * p;
        if (y === b) out.push({ nodos: path.concat([y]), pcts: ps.concat([p * 100]), v: v * 100 });
        else { vis.add(y); dfs(y, path.concat([y]), ps.concat([p * 100]), v, vis); vis.delete(y); }
      });
    };
    dfs(a, [a], [], 1, new Set([a]));
    return out.filter((q) => q.v > 1e-9).sort((p, q) => q.v - p.v);
  }
  const n2 = (v) => (+v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

  // esquema del accionariado: cajas (personas en verde, sociedades en amarillo) y flechas con el %
  function accEsquema(D, G, sel, todo) {
    const A = {}, P = {};
    D.rel.forEach((r) => { const a = accNorm(r.socio), b = accNorm(r.participada); if (!a || !b || a === b) return; (A[a] ||= []).push({ b, p: +r.pct || 0 }); (P[b] ||= []).push({ a, p: +r.pct || 0 }); });
    let nodos = new Set(Object.keys(G.nom));
    if (!todo && sel) {
      const Sx = new Set([sel]);
      const sube = (k) => { (P[k] || []).forEach(({ a }) => { if (!Sx.has(a)) { Sx.add(a); sube(a); } }); };
      const baja = (k) => { (A[k] || []).forEach(({ b }) => { if (!Sx.has(b)) { Sx.add(b); baja(b); } }); };
      sube(sel); baja(sel); nodos = Sx;
    }
    const ns = [...nodos];
    if (!ns.length) return '';
    const niv = {};
    const calc = (k, vis) => {
      if (niv[k] != null) return niv[k];
      if (vis.has(k)) return 0;
      vis.add(k);
      const ps = (P[k] || []).filter((x) => nodos.has(x.a)), v = ps.length ? Math.max(...ps.map((x) => calc(x.a, vis) + 1)) : 0;
      vis.delete(k);
      niv[k] = v; return v;
    };
    ns.forEach((k) => calc(k, new Set()));
    const filas = []; ns.forEach((k) => { (filas[niv[k]] ||= []).push(k); });
    const pos = {};
    filas.forEach((f) => { f.sort((a, b) => String(G.nom[a] || a).localeCompare(String(G.nom[b] || b))); f.forEach((k, j) => { pos[k] = j; }); });
    for (let it = 0; it < 6; it++) {
      filas.forEach((f, i) => {
        if (!i) return;
        const bc = (k) => { const ps = (P[k] || []).filter((x) => nodos.has(x.a) && niv[x.a] < i); return ps.length ? ps.reduce((s, x) => s + pos[x.a], 0) / ps.length : pos[k]; };
        f.sort((a, b) => bc(a) - bc(b)); f.forEach((k, j) => { pos[k] = j; });
      });
    }
    for (let i = filas.length - 2; i >= 0; i--) { // de abajo arriba, para que los socios queden encima de sus participadas
      const f = filas[i], bc = (k) => { const hs = (A[k] || []).filter((x) => nodos.has(x.b)); return hs.length ? hs.reduce((s, x) => s + pos[x.b], 0) / hs.length : pos[k]; };
      f.sort((a, b) => bc(a) - bc(b)); f.forEach((k, j) => { pos[k] = j; });
    }
    const W = 158, H = 44, GX = 26, GY = 100;
    const grado = (k) => Math.max((A[k] || []).filter((x) => nodos.has(x.b)).length, (P[k] || []).filter((x) => nodos.has(x.a)).length);
    const wN = {}; ns.forEach((k) => { wN[k] = Math.max(W, 70 * grado(k)); });
    const anchoF = (f) => f.reduce((s, k) => s + wN[k] + GX, 0) - GX, ancho = Math.max(...filas.map(anchoF)) + 40;
    const xy = {};
    filas.forEach((f, i) => { let x = (ancho - anchoF(f)) / 2; f.forEach((k) => { xy[k] = { x, y: 20 + i * (H + GY) }; x += wN[k] + GX; }); });
    const alto = 20 + filas.length * (H + GY);
    const soc = new Set(D.rel.map((r) => accNorm(r.participada)).filter(Boolean));
    const parte = (t) => { const w = String(t).split(' '); const l = []; let cur = ''; w.forEach((x) => { if (`${cur} ${x}`.trim().length > 22 && cur) { l.push(cur); cur = x; } else cur = `${cur} ${x}`.trim(); }); if (cur) l.push(cur); return l.slice(0, 3); };
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" font-family="Calibri,Arial,sans-serif"><defs><marker id="accFl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4472c4"/></marker></defs>`;
    const salidas = {}, llegadas = {};
    ns.forEach((a) => (A[a] || []).filter((x) => nodos.has(x.b)).forEach((x) => { (salidas[a] ||= []).push(x.b); (llegadas[x.b] ||= []).push(a); }));
    Object.values(salidas).forEach((l) => l.sort((p, q) => xy[p].x - xy[q].x)); Object.values(llegadas).forEach((l) => l.sort((p, q) => xy[p].x - xy[q].x));
    const etiquetas = [];
    ns.forEach((a) => (A[a] || []).filter((x) => nodos.has(x.b)).forEach((x) => {
      const b = x.b, so = salidas[a], ll = llegadas[b];
      const x1 = xy[a].x + (wN[a] * (so.indexOf(b) + 1)) / (so.length + 1), y1 = xy[a].y + H, x2 = xy[b].x + (wN[b] * (ll.indexOf(a) + 1)) / (ll.length + 1), y2 = xy[b].y;
      const ym = y1 + Math.min(34, (y2 - y1) / 3);
      svg += `<path d="M${x1},${y1} L${x1},${ym} L${x2},${y2 - 22} L${x2},${y2 - 2}" fill="none" stroke="#4472c4" stroke-width="1.4" marker-end="url(#accFl)"/>`;
      etiquetas.push(`<rect x="${x1 - 31}" y="${y1 + 6}" width="62" height="16" fill="#fff" stroke="#000" stroke-width=".7"/><text x="${x1}" y="${y1 + 18}" font-size="10.5" text-anchor="middle">${n2(x.p)}%</text>`);
    }));
    ns.forEach((k) => {
      const { x, y } = xy[k], es = soc.has(k), l = parte(G.nom[k]), Wk = wN[k];
      svg += `<rect x="${x}" y="${y}" width="${Wk}" height="${H}" fill="${es ? '#fff9c4' : '#d9f2d0'}" stroke="${k === sel ? '#c00000' : '#000'}" stroke-width="${k === sel ? 2.4 : 0.9}"/>${
        l.map((t, i) => `<text x="${x + Wk / 2}" y="${y + H / 2 + (i - (l.length - 1) / 2) * 13 + 4}" font-size="11.5" fill="#000" text-anchor="middle"${es ? ' font-weight="600"' : ''}>${esc(t)}</text>`).join('')}`;
    });
    return `${svg}${etiquetas.join('')}</svg>`;
  }

  let accSoc = null, accTodo = false, accTR = null;
  function vistaAccionariado() {
    const D = accDatos(), G = accGrafo(D.rel), ed = puede();
    const soc = new Set(D.rel.map((r) => accNorm(r.participada)).filter(Boolean)), todos = Object.keys(G.nom);
    const tipo = (k) => (soc.has(k) ? 'Sociedad del grupo' : D.tipos[k] === 'pj' ? 'Sociedad externa' : D.tipos[k] === 'pf' ? 'Persona física' : RX_PJ.test(G.nom[k] || '') ? 'Sociedad externa' : 'Persona física');
    const selTipo = (k) => (soc.has(k) ? 'Sociedad del grupo' : `<select data-rgacctipo="${esc(k)}"${ed ? '' : ' disabled'}><option value="pf"${tipo(k) === 'Persona física' ? ' selected' : ''}>Persona física</option><option value="pj"${tipo(k) === 'Sociedad externa' ? ' selected' : ''}>Sociedad externa</option></select>`);
    const empAct = accNorm(empresa()?.nombre ?? '');
    const sel = accSoc && soc.has(accSoc) ? accSoc : (soc.has(empAct) ? empAct : [...soc][0]);
    const directos = D.rel.filter((r) => accNorm(r.participada) === sel);
    const pf = todos.filter((k) => k !== sel && tipo(k) !== 'Sociedad del grupo').map((k) => {
      const dir = D.rel.filter((r) => accNorm(r.socio) === k && accNorm(r.participada) === sel).reduce((s, r) => s + (+r.pct || 0), 0), tot = accEfectiva(G, k, sel);
      return { k, dir, ind: tot - dir, tot };
    }).filter((x) => x.tot > 0.000001).sort((a, b) => b.tot - a.tot);
    const filiales = [...soc].filter((k) => k !== sel).map((k) => ({ k, dir: D.rel.filter((r) => accNorm(r.socio) === sel && accNorm(r.participada) === k).reduce((s, r) => s + (+r.pct || 0), 0), tot: accEfectiva(G, sel, k) }))
      .filter((x) => x.tot > 0.000001).sort((a, b) => b.tot - a.tot);
    const sumDir = directos.reduce((s, r) => s + (+r.pct || 0), 0);
    const opts = [...soc].sort((a, b) => String(G.nom[a] || a).localeCompare(String(G.nom[b] || b))).map((k) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(G.nom[k])}</option>`).join('');
    const avisos = D.archivos.flatMap((a) => (a.avisos || []).map((x) => `${a.name}: ${x}`)).concat(
      [...soc].map((k) => ({ k, s: D.rel.filter((r) => accNorm(r.participada) === k).reduce((s, r) => s + (+r.pct || 0), 0) })).filter((x) => Math.abs(x.s - 100) > 0.01).map((x) => `${G.nom[x.k]}: sus socios suman ${n2(x.s)} % (no el 100 %)`));
    const caminos = () => {
      const k = accTR;
      if (!k || !pf.some((x) => x.k === k)) return '';
      const cs = accCaminos(G, k, sel), tot = cs.reduce((s, q) => s + q.v, 0);
      return `<div class="block" style="margin-top:8px;padding:8px 10px"><b>${esc(G.nom[k])} · cómo llega al ${n2(tot)} % de ${esc(G.nom[sel])}</b><table class="tabla rg-tabla" style="width:auto;margin-top:6px"><thead><tr><th>Cadena de participación</th><th>Cálculo</th><th>%</th></tr></thead><tbody>${
        cs.map((q) => `<tr><td>${q.nodos.map((nn) => esc(G.nom[nn])).join(' → ')}</td><td>${q.pcts.map((p) => `${n2(p)} %`).join(' × ')}</td><td class="num"><b>${n2(q.v)} %</b></td></tr>`).join('')}<tr><td colspan="2"><b>Total</b></td><td class="num">${n2(tot)} %</td></tr></tbody></table>
        <p class="hint">Sociedades por las que participa: ${esc([...new Set(cs.flatMap((q) => q.nodos.slice(1, -1)))].map((nn) => G.nom[nn]).join(', ') || 'ninguna (participación directa)')}</p></div>`;
    };
    return `${ed ? `<div class="dropzone" data-kind="acc" tabindex="0" role="button"><b>Suelta aquí el Excel de accionariado del grupo</b> (organigrama con las casillas de socios y sociedades unidas con flechas y el % de cada participación, o una tabla socio / sociedad participada / %) o pulsa para elegirlo.
      <input type="file" data-dzkind="acc" accept=".xlsx,.xlsm,.xls,.csv" multiple hidden></div>` : ''}${msg ? `<p class="leyenda">${esc(msg)}</p>` : ''}
      ${avisos.length ? `<ul class="avisos">${[...new Set(avisos)].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <section class="block acc-clon"><h4 class="it-tit">Accionariado · <select data-rgaccsoc="1">${opts || '<option>Sin datos</option>'}</select></h4>
      <div style="margin:4px 0 6px"><label><input type="checkbox" data-rgacctodo="1"${accTodo ? ' checked' : ''}> Ver todo el grupo</label> <span class="hint">Sin marcar: la sociedad elegida con sus socios (hacia arriba) y sus participadas (hacia abajo). Verde = personas · amarillo = sociedades.</span></div>
      <div class="acc-esq" style="overflow:auto;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:12px">${accEsquema(D, G, sel, accTodo)}</div>
      ${sel ? `<div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
        <div><h4 class="it-sec">Socios directos · suman ${n2(sumDir)} %</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Socio</th><th>Tipo</th><th>% directo</th></tr></thead><tbody>${
  directos.slice().sort((a, b) => b.pct - a.pct).map((r) => `<tr><td>${esc(r.socio)}</td><td>${selTipo(accNorm(r.socio))}</td><td class="num">${n2(r.pct)} %</td></tr>`).join('')}</tbody></table></div>
        <div><h4 class="it-sec">Participación efectiva de personas y socios externos</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Socio</th><th>Tipo</th><th>% directo</th><th>% indirecto</th><th>% total</th><th>Titular real (&gt; 25 %)</th></tr></thead><tbody>${
  pf.map((x) => {
    const pfis = tipo(x.k) === 'Persona física', tr = pfis && x.tot > 25;
    return `<tr${tr ? ` data-rgacctr="${esc(x.k)}" style="cursor:pointer" title="Pulsa para ver cómo llega a este porcentaje"` : ''}><td>${tr ? `<b><u>${esc(G.nom[x.k])}</u></b>` : esc(G.nom[x.k])}</td><td>${selTipo(x.k)}</td><td class="num">${n2(x.dir)} %</td><td class="num">${n2(x.ind)} %</td><td class="num"><b>${n2(x.tot)} %</b></td><td>${tr ? '<b>SÍ</b>' : (!pfis && x.tot > 25 ? `<span class="hint" title="Una sociedad no es titular real: añade sus socios en «Participaciones directas»">sociedad · indica sus socios</span>` : 'no')}</td></tr>`;
  }).join('')}</tbody></table>${caminos()}</div>
        <div><h4 class="it-sec">Sociedades participadas (directa e indirectamente)</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Sociedad</th><th>% directo</th><th>% efectivo</th></tr></thead><tbody>${
  filiales.map((x) => `<tr><td>${esc(G.nom[x.k])}</td><td class="num">${x.dir ? `${n2(x.dir)} %` : ''}</td><td class="num">${n2(x.tot)} %</td></tr>`).join('') || '<tr><td colspan="3" class="c">No participa en otras sociedades</td></tr>'}</tbody></table></div>
      </div>` : ''}
      <h4 class="it-sec" style="margin-top:16px">Participaciones directas del grupo · ${D.rel.length}</h4>
      <div class="wrap"><table class="tabla rg-tabla rg-acc" style="width:auto"><thead><tr><th>Socio</th><th>Sociedad participada</th><th>%</th><th>Origen</th><th></th></tr></thead><tbody>
      ${D.rel.map((r, i) => `<tr><td><input class="facin" data-rgaccf="${i}|socio" value="${esc(r.socio)}" size="${Math.max(10, ...D.rel.map((x) => String(x.socio ?? '').length)) + 2}"${ed ? '' : ' disabled'}></td><td><input class="facin" data-rgaccf="${i}|participada" value="${esc(r.participada)}" size="${Math.max(10, ...D.rel.map((x) => String(x.participada ?? '').length)) + 2}"${ed ? '' : ' disabled'}></td><td><input class="facin" data-rgaccf="${i}|pct" value="${esc(String(r.pct).replace('.', ','))}" size="${Math.max(6, ...D.rel.map((x) => String(x.pct ?? '').length)) + 1}" style="text-align:right"${ed ? '' : ' disabled'}></td><td class="hint">${esc((r.origen || 'a mano') + (r.celda ? ` · ${r.celda}` : ''))}</td><td>${ed ? `<button class="small danger" data-act="m-rg-accdel" data-i="${i}">Quitar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="c">Sin datos</td></tr>'}
      </tbody></table></div>${ed ? '<button class="small" data-act="m-rg-accadd" style="margin:6px 0">+ Añadir participación</button>' : ''}
      ${D.archivos.length ? `<p class="hint">Archivos leídos: ${D.archivos.map((a) => `${esc(a.name)} (${esc(a.fecha)}, ${a.n} participaciones)${ed ? ` <button class="small" data-act="m-rg-accquitar" data-n="${esc(a.name)}">Quitar</button>` : ''}`).join(' · ')}. El accionariado es del grupo: se ve igual desde todas las empresas.</p>` : ''}
      </section>`;
  }

  // ================= Cuentas Anuales Presentadas (unifica certificación, auditoría, informe de gestión, memoria, acuse y nota de despacho) =================
  const SECC = [['ca', 'Cuentas anuales'], ['cert', 'Certificación'], ['aud', 'Informe de auditoría'], ['ig', 'Informe de gestión'], ['mem', 'Memoria'], ['acu', 'Acuse de entrada'], ['nota', 'Nota de despacho']];
  let rgSec = 'ca', rgEj = null;
  const rmEj = () => rgEj ?? (Number(S.ejercicio) || new Date().getFullYear()) - 1;
  const rmReg = (y) => S.registros.find((r) => r.tipo === 'rmdoc' && r.empresa_id === S.sel && r.ejercicio === y);
  const rmDe = (y) => JSON.parse(JSON.stringify(rmReg(y)?.datos ?? {}));
  async function rmGuardar(y, D) {
    const r = rmReg(y);
    if (r) {
      const { error } = await db.from('registros').update({ datos: D }).eq('id', r.id);
      if (error) return aviso(error.message, true);
      r.datos = D;
    } else {
      const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: 'rmdoc', ejercicio: y, datos: D };
      const { error } = await db.from('registros').insert(fila);
      if (error) return aviso(error.message, true);
      S.registros.push(fila);
    }
  }
  const rmNum = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const neg = /^-|^\(.*\)$/.test(t); const v = parseFloat(t.replace(/[()\-\s.]/g, '').replace(',', '.')); return Number.isNaN(v) ? null : (neg ? -v : v); };
  // corre un año los años que aparecen en un texto (2025 → 2026, 2.025 → 2.026), sin tocar números de leyes (18/2022)
  const rmCorrer = (t, base, d = 1) => String(t || '').replace(/(^|[^\d./])(?:(\d{1,2}\/\d{1,2}\/)?)(20\d{2}|2\.0\d{2})(?![\d])/g, (m, pre, fecha, y) => {
    const n = +y.replace('.', ''); if (n < base - 6 || n > base + 2) return m;
    const v = n + d; return pre + (fecha || '') + (y.includes('.') ? `${String(v).slice(0, 1)}.${String(v).slice(1)}` : String(v));
  });
  const rmCorrerObj = (o, base) => {
    if (o == null) return o;
    if (typeof o === 'string') return rmCorrer(o, base);
    if (Array.isArray(o)) return o.map((x) => rmCorrerObj(x, base));
    if (typeof o === 'object') { const r = {}; Object.keys(o).forEach((k) => { r[k] = /^(texto|paginas|name|archivo|v|t|pn2|hist)$/.test(k) ? o[k] : rmCorrerObj(o[k], base); }); return r; }
    return o;
  };
  const rmDni = (d) => { d = String(d || '').toUpperCase(); const m = d.match(/^([XYZ]?)(\d{7,8})/); if (!m) return d; const n = +((m[1] ? 'XYZ'.indexOf(m[1]) : '') + m[2]); return m[1] + m[2] + 'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23]; };

  // texto por página; si es un escaneo, OCR en el navegador
  async function paginasDe(file) {
    const { lineas, n } = await lineasDe(file);
    const pags = Array.from({ length: n }, (_, p) => lineas.filter((l) => l.pag === p + 1).map((l) => l.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n'));
    if (pags.join('').replace(/\s/g, '').length >= 60 * n) return { paginas: pags, n, ocr: false, lineas };
    const out = await ocrPdf(file, (m) => aviso(`${file.name}: ${m}`));
    return { paginas: out, n, ocr: true, lineas: [] };
  }

  // ---- extractores (misma lógica que la aplicación antigua) ----
  function rmCasillas(lineas) {
    const its = []; lineas.forEach((l) => l.forEach((it) => its.push({ s: it.s, x: it.x, y: it.y, p: l.pag })));
    const num = (s) => /^-?\(?\d{1,3}(\.\d{3})*(,\d+)?\)?$/.test(s);
    const codes = its.filter((i) => /^\d{5}$/.test(i.s)), v = {}, t = {}, porPag = {};
    codes.forEach((q) => { (porPag[q.p] ||= []).push(q); });
    Object.entries(porPag).forEach(([p, cs]) => { // columnas de importes de la página: ejercicio (izquierda) y anterior (derecha)
      const xs = its.filter((i) => i.p == p && num(i.s) && /,/.test(i.s)).map((i) => i.x).sort((a, b) => a - b), mid = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : null;
      cs.forEach((q) => {
        const sig = cs.filter((o) => Math.abs(o.y - q.y) <= 8 && o.x > q.x + 5).sort((a, b) => a.x - b.x)[0];
        const en = its.filter((i) => i.p == p && i !== q && Math.abs(i.y - q.y) <= 8 && i.x > q.x + 5 && (!sig || i.x < sig.x)).sort((a, b) => a.x - b.x);
        let vals = en.filter((i) => num(i.s) && !/^\d{5}$/.test(i.s));
        if (vals.some((x) => x.s.includes(','))) vals = vals.filter((x) => x.s.includes(','));
        if (vals.length && !(q.s in v)) {
          if (vals.length >= 2) v[q.s] = [rmNum(vals[0].s), rmNum(vals[1].s)];
          else v[q.s] = mid !== null && vals[0].x > mid + 20 ? [null, rmNum(vals[0].s)] : [rmNum(vals[0].s), null];
        }
        const txt = en.map((i) => i.s).join(' ').trim();
        if (txt && !(q.s in t) && /[A-Za-z]/.test(txt)) t[q.s] = txt;
      });
    });
    return { v, t };
  }
  function rmCertDeTexto(tx) {
    const R = {}, T = String(tx).replace(/\r/g, '');
    let m = T.match(/(D\.|Dª\.?|Dña\.?|Don|Doña)\s+([^,\n]+?),\s*con\s+DNI(?:\s+n[uú]mero)?\s*([0-9XYZ]\d{7}[A-Z0-9]),\s*en\s+calidad\s+de\s+([\s\S]+?)\s+de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,&-]+?),\s*con\s+(?:CIF|NIF)/);
    if (m) { R.tratSec = m[1].replace(/^Don$/i, 'D.').replace(/^Doña$/i, 'Dª.'); R.secretario = m[2].trim(); R.secretarioDni = m[3]; const q = m[4].replace(/\s+/g, ' ').trim(); const o = q.match(/^(\S+)\s+del?\s+(.+)$/); R.cargoSec = o ? o[1] : q; R.organo = o ? o[2] : ''; }
    m = T.match(/Junta\s+General\s+([A-Za-zÁÉÍÓÚáéíóú ]+?)\s+celebrada\s+en\s+([^,\n]+),\s*a\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i); if (m) { R.tipoJunta = m[1].trim(); R.lugar = m[2].trim(); R.fechaJunta = m[3]; }
    m = T.match(/formuladas\s+en\s+([^,\n]+),\s*a\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4}),\s*aprobadas\s+el\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})[\s\S]{0,40}?constan\s+de\s+(\d+)\s+p[aá]ginas/i); if (m) { R.fechaForm = m[2]; R.pagCA = m[4]; }
    m = T.match(/informe\s+de\s+gesti[oó]n\s+que\s+consta\s+de\s+(\d+)\s+p[aá]ginas/i); if (m) R.pagIG = m[1];
    m = T.match(/Auditores?\s+de\s+cuentas,?\s+que\s+consta\s+de\s+(\d+)\s+p[aá]ginas/i); if (m) R.pagAud = m[1];
    m = T.match(/S\.A\.,?\s*([\s\S]{0,40}?no\s+ten[ií]a[\s\S]+?durante\s+el\s+mismo\.)/i) || T.match(/,\s*(no\s+ten[ií]a\s+al\s+principio[\s\S]+?mismo\.)/i); if (m) R.accPropias = m[1].replace(/\s+/g, ' ').replace(/^[,\s]+/, '').trim();
    m = T.match(/\n\s*V\S{0,2}[.,]?\s*B\S{0,2}[.,]?\s*(D\.|Dª\.?|Dña\.?)?\s*([^\n]+?)\.?\s*\n\s*DNI\s*([0-9XYZ]\d{7}[A-Z0-9])\s*\n\s*([^\n.]+)/i); if (m) { R.tratPres = m[1] || 'D.'; R.presidente = m[2].trim(); R.presidenteDni = rmDni(m[3]); R.cargoPres = m[4].trim(); }
    if (R.secretarioDni) R.secretarioDni = rmDni(R.secretarioDni);
    const dist = [], i = T.search(/DISTRIBUCI[OÓ]N\s+DE\s+RESULTADOS/i), j = T.search(/TOTAL,?\s+DISTRIBUIDO/i);
    if (i >= 0 && j > i) T.slice(i, j).split('\n').slice(1).forEach((l) => { const mm = l.match(/^\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ,().]+?)\s+(-?[\d.]+,\d{2}|-)\s*\.?-?\s*$/); if (mm) dist.push({ c: mm[1].trim(), v: mm[2] === '-' ? '' : String(rmNum(mm[2])) }); });
    if (dist.length) R.dist = dist;
    return R;
  }
  function rmAudDeTexto(pags) {
    const T = pags.join('\n'), R = {};
    let m = T.match(/([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ ]+?Auditores?,?\s*S\.?L\.?P?\.?)\s*\(([S5]\s?\d{3,5})\)/i); if (m) { R.firma = m[1].trim(); R.roacFirma = m[2].replace(/\s/g, '').replace(/^5(?=\d{4}$)/, 'S'); }
    m = T.match(/ROAC\s*(S\s?\d{3,5})/i); if (m && !R.roacFirma) R.roacFirma = m[1].replace(/\s/g, '');
    m = T.match(/\n\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\s*\((\d{4,6})\)/); if (m) { R.auditor = m[1]; R.roacAuditor = m[2]; }
    const ult = pags[pags.length - 1] || ''; m = ult.match(/(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4})/i); if (m) R.fecha = m[1];
    m = ult.match(/\d{4}\s*\n+\s*([^\n]*\d+[^\n]*)\n+\s*(\d{5}\s+[^\n]+)/); if (m) { R.domicilio = m[1].trim(); R.cp = m[2].trim(); }
    m = T.match(/A[ñn]o:?\s*(\d{4})[\s\S]{0,20}?N[uú]mero:?\s*([\d./]+)/i); if (m) R.sello = `${m[1]} · nº ${m[2]}`;
    R.opinion = /opini[oó]n\s+con\s+salvedades/i.test(T) ? 'Con salvedades' : /opini[oó]n\s+desfavorable/i.test(T) ? 'Desfavorable' : /denegaci[oó]n\s+de\s+opini[oó]n/i.test(T) ? 'Denegada' : 'Favorable';
    m = T.match(/Sobre la base del trabajo realizado[\s\S]+?aplicaci[oó]n\./i); if (m) R.otraInfo = m[0].replace(/\s+/g, ' ');
    const i = T.search(/Aspectos\s+m[aá]s\s+relevantes\s+de\s+la\s+auditor[ií]a/i), j = T.search(/Otra\s+informaci[oó]n/i);
    if (i >= 0) R.aspectos = T.slice(i, j > i ? j : i + 4000).replace(/^.*\n/, '').replace(/\n(?:\d+\s*$|N\s*$)/g, '').trim();
    R.paginas = String(pags.length);
    return R;
  }
  const IG_SECC = [['s2', '2.- Acontecimientos importantes ocurridos después del cierre del ejercicio'], ['s3', '3.- Evolución previsible de la Sociedad'], ['s4', '4.- Actividades realizadas en materia de Investigación y Desarrollo'],
    ['s5', '5.- Acciones propias'], ['s6', '6.- Aplazamiento de pago a proveedores'], ['s7', '7.- Descripción de los principales riesgos e incertidumbres a los que se enfrenta la Sociedad.'], ['s8', '8.- Políticas de gestión de riesgos'], ['s9', '9.- OTRAS CUESTIONES']];
  function rmIgDeTexto(pags) {
    const T = pags.join('\n'), R = { hist: {} };
    T.split('\n').forEach((l) => {
      const m = l.match(/E?\s*jercicio\s+(\d{4})\s+(.+)$/i); if (!m) return;
      const ns = (m[2].match(/-?\d{1,3}(?:\.\d{3})+|\d+,\d+|-?\d+/g) || []).map((x) => (x.includes(',') ? +x.replace(',', '.') : +x.replace(/\./g, ''))), h = (R.hist[m[1]] ||= {});
      if (ns.length === 2) { h.cifra = ns[0]; h.res = ns[1]; } else if (ns.length >= 4) { h.activo = ns[0]; h.fp = ns[1]; h.deuda = ns[2]; h.fm = ns[3]; if (ns[4] != null) h.liq = ns[4] >= 10 ? ns[4] / 100 : ns[4]; }
    });
    const cortes = IG_SECC.map(([k, t]) => ({ k, i: T.search(new RegExp(`\\n\\s*${t[0]}\\.?-\\s`)) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
    const fin = T.search(/\n\s*El\s+informe\s+de\s+gesti[oó]n\s+correspondiente/i);
    cortes.forEach((q, i) => {
      const hasta = i + 1 < cortes.length ? cortes[i + 1].i : (fin > q.i ? fin : T.length);
      R[q.k] = T.slice(q.i, hasta).replace(/^\s*\n?\s*\d\.?-[^\n]*\n/, '').replace(/\n\s*\d\s*\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/([^.:;\n])\n(?=[a-záéíóúñ(])/g, '$1 ').trim();
    });
    let m = T.match(/investigaci[oó]n\s+y\s+desarrollo\s+por\s+importe\s+de\s+([\d.]+)\s+euros[\s\S]{0,200}?importe\s+de\s+([\d.]+)\s+euros/i); if (m) { R.id = m[1]; R.idDed = m[2]; }
    m = T.match(/formulado\s+en\s+(\w+)[\s\S]{0,80}?con\s+fecha\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d\.?\d{3})/i); if (m) { R.lugar = m[1]; R.fechaForm = m[2]; }
    return R;
  }
  function rmMemDeTexto(pags) {
    const T = pags.map((p) => p.replace(/\n{3,}/g, '\n\n')).join('\n'), notas = [], rx = /\n\s*NOTA\s+(\d{1,2})\.?\s*([^\n]*)/g;
    let m, prev = null;
    while ((m = rx.exec(T))) { if (prev) prev.texto = T.slice(prev.ini, m.index).trim(); prev = { n: +m[1], titulo: m[2].trim().replace(/[.\s]+$/, ''), ini: m.index + m[0].length }; notas.push(prev); }
    if (prev) { const f = T.search(/\n\s*(?:FORMULACI[OÓ]N|DILIGENCIA)[^\n]*\n/i); prev.texto = T.slice(prev.ini, f > prev.ini ? f : T.length).trim(); }
    return notas.map(({ n, titulo, texto }) => ({ n, titulo, texto, pag: pags.findIndex((p) => new RegExp(`NOTA\\s+${n}\\b`, 'i').test(p)) + 1 || null }));
  }
  const DEP_CAMPOS = { acu: [['ident', 'Identificador'], ['ref', 'Referencia del documento'], ['enviado', 'Enviado por'], ['nifEnv', 'NIF del presentante'], ['recibido', 'Recibido en'], ['entrada', 'Número de entrada'], ['fecha', 'Fecha y hora de entrada'], ['firmante', 'Documento firmado por'], ['fechaFirma', 'Fecha de la firma']],
    nota: [['registro', 'Registro'], ['entidad', 'Entidad'], ['nif', 'NIF'], ['ejercicio', 'Ejercicio de las cuentas'], ['entrada', 'Número de entrada'], ['legajo', 'Número de legajo del depósito'], ['presentado', 'Presentado (asiento)'], ['fechaPres', 'Fecha de presentación'], ['fechaCalif', 'Calificado correcto el'], ['registrador', 'Registrador'], ['fechaFirma', 'Fecha de la firma'], ['huella', 'Huella digital'], ['csv', 'C.S.V.']] };
  function rmDepDeTexto(tipo, T) {
    const g = (re, i = 1) => { const m = T.match(re); return m ? m[i].replace(/\s+/g, ' ').trim() : ''; }, R = {};
    if (tipo === 'acu') {
      R.ident = g(/Identificador\s+(\S+)/); R.ref = g(/Referencia del documento\s+(\S+)/); R.enviado = g(/Enviado por\s+(.+?)\s+NIF/); R.nifEnv = g(/Enviado por.+?NIF\s+(\S+)/); R.recibido = g(/Recibido en\s+(.+?)(?=\s+N[úu]mero de entrada|\n|$)/);
      R.entrada = g(/N[úu]mero de entrada\s+(\d{4}\s*\/\s*\d+\s*\/\s*\d+)/).replace(/\s/g, ''); R.fecha = g(/N[úu]mero de entrada.+?Fecha\s+([\d/]+\s+[\d:]+)/); R.firmante = g(/D\.\/D[ªa]\.\s+(.+)/); R.fechaFirma = g(/firmado por:[\s\S]*?Fecha\s+([\d/]+\s+[\d:]+)/);
      const a = (R.fecha.match(/\d{2}\/\d{2}\/(\d{4})/) || [])[1]; R.ejercicio = a ? String(+a - 1) : '';
    } else {
      R.registro = g(/(Registro Mercantil de [A-ZÁÉÍÓÚÑ ]+)/); const m = T.match(/DEP[ÓO]SITO DE CUENTAS DE LA ENTIDAD\s+([\s\S]+?)\s+([A-Z]\d{8}|\d{8}[A-Z])\s/); if (m) { R.entidad = m[1].replace(/\s+/g, ' ').trim(); R.nif = m[2]; }
      R.ejercicio = g(/ejercicio\s+(\d{4})/i); R.entrada = g(/N[úu]mero de Entrada\s+([\d/]+)/i); R.legajo = g(/n[úu]mero de\s+legajo\s+([\d/]+)/i); R.huella = g(/HUELLA DIGITAL:\s*(\S+)/);
      const p = T.match(/Presentado\s*\(([^)]+)\)\s*([\d/]+)/); if (p) { R.presentado = p[1]; R.fechaPres = p[2]; } R.fechaCalif = g(/Calificado Correcto\s+([\d/]+)/i);
      R.registrador = g(/firmado con firma electr[óo]nica reconocida por\s+([^,]+)/i); R.fechaFirma = g(/el d[íi]a\s+([^.\n]+?)\.\s/i); R.csv = g(/C\.S\.V\.:\s*(\S+)/);
    }
    return R;
  }
  const rmEntradaNorm = (s) => { const p = String(s || '').replace(/\s/g, '').split('/').filter(Boolean); if (p.length !== 3) return ''; const i = p.findIndex((x) => x.length === 4); return i < 0 ? '' : [p[i]].concat(p.filter((x, j) => j !== i)).join('-'); };
  const rmAnioTexto = (t, nom) => {
    const m = String(t).match(/ejercicio\s+(?:cerrado\s+(?:al|a)\s+31\/12\/|terminado\s+.*?|)(\d)\.?(\d{3})\b/i) || String(t).match(/31\s+de\s+diciembre\s+de\s+(\d)\.?(\d{3})/i) || String(t).match(/31\/12\/(\d)(\d{3})/);
    if (m) return +(m[1] + m[2]);
    const n = String(nom || '').match(/(?:^|\D)(20\d{2})(?:\D|$)/); return n ? +n[1] : rmEj();
  };
  // a qué documento corresponde un PDF: por el nombre y, si no, por lo que se está viendo
  const rmClase = (nombre) => {
    const n = ` ${nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()} `;
    return /certific/.test(n) ? 'cert' : /audit/.test(n) ? 'aud' : /gestion/.test(n) ? 'ig' : /memoria/.test(n) ? 'mem' : /acuse/.test(n) ? 'acu' : /despacho|nota/.test(n) ? 'nota' : null;
  };

  async function cargarRm(files) {
    if (!S.sel) return aviso('Elige primero la empresa.', true);
    for (const file of files) {
      if (!/\.pdf$/i.test(file.name)) { aviso(`${file.name}: solo se leen PDF`, true); continue; }
      try {
        const tipo = rmClase(file.name) || rgSec;
        aviso(`Leyendo ${file.name}…`);
        const L = await paginasDe(file), texto = L.paginas.join('\n');
        let R, y;
        if (tipo === 'ca') {
          R = rmCasillas(L.lineas);
          if (!Object.keys(R.v).length) { aviso(`${file.name}: no se encuentran casillas del modelo del Registro Mercantil (¿es un escaneo?)`, true); continue; }
          const m = (R.t['01101'] || '').match(/(\d)\.?(\d{3})/); y = m ? +(m[1] + m[2]) : rmAnioTexto('', file.name);
          R.reg = dregRegDeCA(texto); // registro, tomo, folio y hoja de la solicitud de depósito
        } else if (tipo === 'cert') { R = rmCertDeTexto(texto); y = rmAnioTexto(texto, file.name); }
        else if (tipo === 'aud') { R = rmAudDeTexto(L.paginas); y = rmAnioTexto(texto, file.name); }
        else if (tipo === 'ig') { R = rmIgDeTexto(L.paginas); y = rmAnioTexto(texto, file.name); }
        else if (tipo === 'mem') { R = { notas: rmMemDeTexto(L.paginas) }; y = rmAnioTexto(texto, file.name); }
        else { R = rmDepDeTexto(tipo, texto); y = +R.ejercicio || rmAnioTexto(texto, file.name); }
        const sub = await c.subir(S.sel, `rmdoc-${y}`, 'doc', tipo, file);
        if (sub.error) throw new Error(sub.error);
        const D = rmDe(y);
        D[tipo] = { ...R, origen: 'archivo', fecha: hoy(), n: L.n, ocr: L.ocr, archivo: sub.val, ...(tipo === 'ca' ? {} : { texto: texto.slice(0, 80000) }) };
        await rmGuardar(y, D);
        rgEj = y; rgSec = tipo;
        msg = `${file.name}: ${SECC.find((q) => q[0] === tipo)[1].toLowerCase()} de ${y} leído${L.ocr ? ' con OCR' : ''}`; msgMal = false;
      } catch (err) { aviso(`${file.name}: ${err.message}`, true); }
    }
    render();
  }

  // valor de una casilla presentada del ejercicio (o, si no, la columna «anterior» de las del siguiente)
  function rmCasilla(y, code) {
    const a = rmDe(y).ca?.v?.[code]; if (a && a[0] != null) return a[0];
    const b = rmDe(y + 1).ca?.v?.[code]; return b && b[1] != null ? b[1] : null;
  }
  // borrador: lo del ejercicio, y si no lo del anterior con las fechas y años corridos
  function rmBorrador(tipo, y) {
    const D = rmDe(y)[tipo]; if (D) return D;
    for (let k = 1; k <= 3; k++) {
      const p = rmDe(y - k)[tipo];
      if (p) {
        let r = rmCorrerObj({ ...p }, y - k); for (let i = 1; i < k; i++) r = rmCorrerObj(r, y - k + i);
        delete r.texto; delete r.archivo; r.origen = 'borrador'; r.desde = y - k;
        if (tipo === 'cert') (r.dist || []).forEach((x) => { x.v = ''; });
        if (tipo === 'aud') { r.fecha = ''; r.sello = ''; }
        if (tipo === 'ig') { r.hist = p.hist; r.fechaForm = ''; r.id = ''; r.idDed = ''; }
        return r;
      }
    }
    return tipo === 'cert' ? { origen: 'borrador', tratSec: 'D.', cargoSec: 'secretario', organo: 'Consejo de Administración', tipoJunta: 'Ordinaria y Universal', tratPres: 'D.', cargoPres: 'Presidente',
      dist: [{ c: 'Reservas Voluntarias', v: '' }, { c: 'Reserva de capitalización', v: '' }, { c: 'Distribución de dividendos', v: '' }], accPropias: 'no tenía al principio del ejercicio, ni ha realizado ningún tipo de negocio que implique la adquisición o transmisión de Acciones Propias durante el mismo.' }
      : tipo === 'aud' ? { origen: 'borrador', opinion: 'Favorable' } : tipo === 'ig' ? { origen: 'borrador', hist: {} } : tipo === 'mem' ? { origen: 'borrador', notas: [] } : null;
  }

  const inp = (sec, k, v, w, ed) => `<input class="facin" data-rgf="${sec}|${k}" value="${esc(v ?? '')}" size="${w}"${ed ? '' : ' disabled'}>`;
  const RM_CERT_CAMPOS = [['secretario', 'Secretario/a (nombre)'], ['secretarioDni', 'DNI del secretario/a'], ['cargoSec', 'Cargo del secretario/a'], ['tratSec', 'Tratamiento (D./Dª.)'], ['presidente', 'Presidente/a (nombre)'], ['presidenteDni', 'DNI del presidente/a'],
    ['cargoPres', 'Cargo del presidente/a'], ['tratPres', 'Tratamiento (D./Dª.)'], ['organo', 'Órgano de administración'], ['tipoJunta', 'Tipo de junta'], ['lugar', 'Lugar'], ['fechaJunta', 'Fecha de la junta'], ['fechaForm', 'Fecha de formulación'],
    ['pagCA', 'Páginas de las cuentas anuales'], ['pagIG', 'Páginas del informe de gestión'], ['pagAud', 'Páginas del informe de auditoría'], ['accPropias', 'Acciones propias (texto)']];
  const RM_AUD_CAMPOS = [['firma', 'Sociedad de auditoría'], ['roacFirma', 'Nº ROAC de la sociedad'], ['nifFirma', 'NIF de la sociedad de auditoría'], ['auditor', 'Auditor firmante'], ['roacAuditor', 'Nº ROAC del auditor'], ['domicilio', 'Domicilio'],
    ['cp', 'Código postal y ciudad'], ['fecha', 'Fecha del informe'], ['opinion', 'Tipo de opinión'], ['sello', 'Sello REA (año y número)'], ['paginas', 'Páginas'], ['otraInfo', 'Conclusión sobre el informe de gestión']];
  const tablaCampos = (sec, campos, D, ed) => `<table class="tabla rg-tabla rotulos" style="width:auto"><tbody>${campos.map(([k, t]) => `<tr><td>${esc(t)}</td><td>${/otraInfo|accPropias/.test(k)
    ? `<textarea class="facin" data-rgf="${sec}|${k}" rows="3" cols="70"${ed ? '' : ' disabled'}>${esc(D[k] ?? '')}</textarea>` : inp(sec, k, D[k], 44, ed)}</td></tr>`).join('')}</tbody></table>`;

  function secCA(y, D, ed) {
    const E = D.ca;
    if (!E) return '<p class="hint">No hay cuentas anuales presentadas de este ejercicio. Suelta a la izquierda el PDF del depósito (formato Registro Mercantil, con casillas).</p>';
    const filas = Object.keys(E.v).filter((q) => /^[1-6]/.test(q)).sort();
    const clave = ['10000', '11000', '12000', '20000', '21000', '31000', '32000', '40100', '49100', '49500'].filter((q) => E.v[q]);
    const lab = (q) => esc(E.t?.[q] ?? '');
    const f = (v) => (v == null ? '—' : eur(v));
    return `${clave.length ? `<h4 class="it-sec">Cifras principales</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Casilla</th><th>Concepto</th><th class="num">${y}</th><th class="num">${y - 1}</th></tr></thead><tbody>${clave.map((q) => `<tr><td>${q}</td><td>${lab(q)}</td><td class="num">${f(E.v[q][0])}</td><td class="num">${f(E.v[q][1])}</td></tr>`).join('')}</tbody></table>` : ''}
      <h4 class="it-sec">Todas las casillas leídas · ${filas.length}</h4><div class="wrap" style="max-height:420px;overflow:auto"><table class="tabla rg-tabla"><thead><tr><th>Casilla</th><th>Concepto</th><th class="num">${y}</th><th class="num">${y - 1}</th></tr></thead><tbody>${filas.map((q) => `<tr><td>${q}</td><td>${lab(q)}</td><td class="num">${f(E.v[q][0])}</td><td class="num">${f(E.v[q][1])}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Leído de ${esc(E.archivo?.nombre ?? '')} (${esc(E.fecha ?? '')}). El ejercicio siguiente usa estas cifras como «ejercicio anterior».</p>`;
  }
  function secCert(y, D, ed) {
    const C = rmBorrador('cert', y) ?? {}, e = empresa(), dr = dregDe(e);
    const res = rmCasilla(y, '49500'), dist = C.dist ?? [], tot = dist.reduce((s, x) => s + (+x.v || 0), 0), iResto = dist.findIndex((x) => x.v === '' || x.v == null);
    const dv = (x, i) => (x.v !== '' && x.v != null ? +x.v : (i === iResto && res != null ? Math.round((res - tot) * 100) / 100 : 0));
    const nom = dr.denominacion || e.nombre, nif = dr.nif || e.cif || '';
    return `<p class="hint">${C.origen === 'borrador' ? (C.desde ? `Borrador: rellenado con la certificación de ${C.desde} (fechas corridas un año). Revisa fechas, páginas y la distribución del resultado.` : 'Borrador vacío: rellena los datos o suelta la certificación de un ejercicio.') : `Certificación de ${y} guardada.`}
      ${res == null ? ` No hay cuentas presentadas de ${y}: el resultado del ejercicio no se puede calcular.` : ` Resultado del ejercicio ${y}: ${eur(res)} (cuentas presentadas).`}</p>
      ${tablaCampos('cert', RM_CERT_CAMPOS, C, ed)}
      <h4 class="it-sec">Distribución del resultado</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Concepto</th><th class="num">Importe</th></tr></thead><tbody>
      ${dist.map((x, i) => `<tr><td><input class="facin" data-rgdist="${i}|c" value="${esc(x.c)}" size="34"${ed ? '' : ' disabled'}></td><td><input class="facin" data-rgdist="${i}|v" value="${esc(x.v ?? '')}" placeholder="${iResto === i && res != null ? esc(String(dv(x, i))) : ''}" size="14" style="text-align:right"${ed ? '' : ' disabled'}></td></tr>`).join('')}
      <tr><td><b>Total distribuido</b></td><td class="num"><b>${eur(dist.reduce((s, x, i) => s + dv(x, i), 0))}</b></td></tr></tbody></table>
      <section class="block rm-hoja"><p style="text-align:center"><b>CERTIFICACION ACTA JUNTA GENERAL</b></p>
      <p>${esc(C.tratSec)} ${esc(C.secretario)}, con DNI número ${esc(C.secretarioDni)}, en calidad de ${esc(C.cargoSec)} del ${esc(C.organo)} de ${esc(nom)}, con CIF ${esc(String(nif).replace(/^([A-Z])(\d)/, '$1-$2'))}, inscrita en el ${esc(dr.registro || 'Registro Mercantil')}:</p>
      <p><u><b>CERTIFICA:</b></u></p><p>Que en el libro de actas de dicha sociedad consta transcrita el acta de la Junta General ${esc(C.tipoJunta)} celebrada en ${esc(C.lugar)}, a ${esc(C.fechaJunta)}.</p>
      <p><u><b>Asistencia:</b></u> Asistieron la totalidad de los socios que representan el 100% del Capital Social, expresándose en el acta sus nombres y la representación que ostentan y constatando la firma de ellos.</p>
      <p><u><b>Aceptación:</b></u> Aceptaron por unanimidad, la celebración de la Junta y su orden del día, siendo designados así mismo por unanimidad presidente y secretario de la Junta.</p>
      <p><u><b>Orden del día:</b></u> 1.- Aprobación, si procede, de las Cuentas Anuales del ejercicio cerrado al 31/12/${y}. 2.- Aprobación, si procede, de la propuesta de Aplicación del Resultado del ejercicio.</p>
      <p><u><b>Acuerdos:</b></u> 1.- Aprobar por unanimidad la gestión del órgano de administración de la sociedad. 2.- Aprobar por unanimidad las Cuentas Anuales, compuestas por el Balance de Situación, la Cuenta de Pérdidas y Ganancias y la Memoria de la sociedad, así como el informe de auditoría del ejercicio iniciado el 01/01/${y} y finalizado el 31/12/${y}, formuladas de conformidad con la legislación vigente y que se acompañan a la presente certificación. 3.- Aprobar por unanimidad la propuesta de distribución del ${res != null && res < 0 ? 'resultado' : 'beneficio'}:</p>
      <table class="tabla rg-tabla" style="width:auto"><tbody><tr><td>Resultados del ejercicio</td><td class="num">${res != null ? eur(res) : ''}</td></tr>${dist.map((x, i) => `<tr><td>${esc(x.c)}</td><td class="num">${dv(x, i) ? eur(dv(x, i)) : '-'}</td></tr>`).join('')}</tbody></table>
      <p>Votan a favor de los acuerdos la integridad de los socios con derecho a voto, quedando, por tanto, aprobados por unanimidad.</p>
      <p>OTRO SI CERTIFICA, que en la misma sesión se extendió el acta correspondiente, la cual fue aprobada por unanimidad por el propio órgano y firmada por el secretario con el Visto bueno del presidente, en la misma fecha.</p>
      <p>ASI MISMO CERTIFICA, que durante el ejercicio ${y}, la mercantil ${esc(nom)}, ${esc(C.accPropias)}</p>
      <p>MAS CERTIFICA, que las Cuentas Anuales del ejercicio ${y}, han sido formuladas en ${esc(C.lugar)}, a ${esc(C.fechaForm)}, aprobadas el ${esc(C.fechaJunta)} y que constan de ${esc(C.pagCA)} páginas, cuyos ejemplares se adjuntan a la presente certificación, y son coincidentes con las cuentas anuales auditadas. De igual modo se adjunta un ejemplar del informe de gestión que consta de ${esc(C.pagIG)} páginas, así como un ejemplar del informe de los Auditores de cuentas, que consta de ${esc(C.pagAud)} páginas, debidamente firmado por estos se acompaña como anexo a esta certificación.</p>
      <p>IGUALMENTE CERTIFICA, que dichas cuentas fueron firmadas por todos los miembros de órgano de administración de la sociedad.</p>
      <p>Y para que así conste, se libra la presente en ${esc(C.lugar)} a ${esc(C.fechaJunta)}.</p>
      <p style="margin-top:22px">${esc(C.tratSec)} ${esc(C.secretario)}.<br>DNI ${esc(C.secretarioDni)}<br>${esc(String(C.cargoSec || '').replace(/^./, (q) => q.toUpperCase()))} del ${esc(C.organo)}.</p>
      <p>Vº. Bº. ${esc(C.tratPres)} ${esc(C.presidente)}.<br>DNI ${esc(C.presidenteDni)}<br>${esc(C.cargoPres)}.</p></section>`;
  }
  function secAud(y, D, ed) {
    const A = rmBorrador('aud', y) ?? {};
    return `<p class="hint">${A.origen === 'borrador' ? (A.desde ? `Borrador con el informe de ${A.desde}.` : 'Sin informe: suelta el PDF.') : `Informe de auditoría de ${y} guardado.`}</p>${tablaCampos('aud', RM_AUD_CAMPOS, A, ed)}
      <h4 class="it-sec">Aspectos más relevantes de la auditoría</h4><textarea class="facin" data-rgf="aud|aspectos" rows="14" style="width:100%"${ed ? '' : ' disabled'}>${esc(A.aspectos ?? '')}</textarea>`;
  }
  function secIg(y, D, ed) {
    const G = rmBorrador('ig', y) ?? { hist: {} }, hist = G.hist ?? {}, anios = Object.keys(hist).sort();
    const HK = [['cifra', 'Cifra de negocios'], ['res', 'Resultado'], ['activo', 'Activo'], ['fp', 'Fondos propios'], ['deuda', 'Deuda'], ['fm', 'Fondo de maniobra'], ['liq', 'Liquidez']];
    return `<p class="hint">${G.origen === 'borrador' ? (G.desde ? `Borrador con el informe de ${G.desde}.` : 'Sin informe: suelta el PDF.') : `Informe de gestión de ${y} guardado.`}</p>
      ${anios.length ? `<h4 class="it-sec">Evolución de cifras</h4><table class="tabla rg-tabla" style="width:auto"><thead><tr><th>Ejercicio</th>${HK.map((q) => `<th>${q[1]}</th>`).join('')}</tr></thead><tbody>${anios.map((a) => `<tr><td>${a}</td>${HK.map(([k]) => `<td class="num">${hist[a][k] == null ? '' : n2(hist[a][k])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
      ${tablaCampos('ig', [['lugar', 'Lugar de formulación'], ['fechaForm', 'Fecha de formulación'], ['id', 'I+D (importe)'], ['idDed', 'I+D (deducción)']], G, ed)}
      ${IG_SECC.map(([k, t]) => `<h4 class="it-sec">${esc(t)}</h4><textarea class="facin" data-rgf="ig|${k}" rows="5" style="width:100%"${ed ? '' : ' disabled'}>${esc(G[k] ?? '')}</textarea>`).join('')}`;
  }
  function secMem(y, D) {
    const M = D.mem ?? { notas: [] };
    return `${M.notas?.length ? `<h4 class="it-sec">Índice de la memoria · ${M.notas.length} notas</h4><div class="rg-indice">${M.notas.map((q) => `<button class="small" data-act="m-rg-irpag" data-p="${q.pag ?? ''}" title="${q.pag ? `Página ${q.pag}` : ''}"><b>Nota ${q.n}.</b> ${esc(String(q.titulo || '').slice(0, 70))}${q.pag ? ` <span class="hint">pág. ${q.pag}</span>` : ''}</button>`).join('')}</div>
      <details><summary>Texto de las notas</summary>${M.notas.map((q) => `<h4>Nota ${q.n}. ${esc(q.titulo)}</h4><pre class="rg-pre">${esc(q.texto ?? '')}</pre>`).join('')}</details>` : '<p class="hint">Suelta el PDF de la memoria para sacar su índice.</p>'}`;
  }
  function secDep(tipo, y, D, ed) {
    const R = D[tipo] ?? {}, otro = D[tipo === 'acu' ? 'nota' : 'acu'];
    const a = rmEntradaNorm(R.entrada), b = rmEntradaNorm(otro?.entrada);
    return `${R.archivo ? `<p class="hint">Leído de ${esc(R.archivo.nombre)}</p>` : '<p class="hint">Sin documento para este ejercicio.</p>'}
      <table class="tabla rg-tabla rotulos" style="width:auto"><tbody>${DEP_CAMPOS[tipo].map(([k, t]) => `<tr><td>${esc(t)}</td><td>${inp(tipo, k, R[k], 44, ed)}</td></tr>`).join('')}</tbody></table>
      ${a && b ? `<p><b>${a === b ? `✓ El número de entrada coincide con el ${tipo === 'acu' ? 'de la nota de despacho' : 'del acuse de entrada'}` : `✖ El número de entrada no coincide con el ${tipo === 'acu' ? 'de la nota de despacho' : 'del acuse de entrada'} (${esc(otro.entrada)})`}</b></p>` : ''}`;
  }

  function vistaCuentas() {
    const e = empresa();
    if (!e) return sinEmpresa;
    const y = rmEj(), D = rmDe(y), ed = puede();
    const anios = []; for (let a = (Number(S.ejercicio) || new Date().getFullYear()) + 1; a >= (Number(S.ejercicio) || new Date().getFullYear()) - 8; a--) anios.push(a);
    const doc = D[rgSec];
    const cuerpo = rgSec === 'ca' ? secCA(y, D, ed) : rgSec === 'cert' ? secCert(y, D, ed) : rgSec === 'aud' ? secAud(y, D, ed) : rgSec === 'ig' ? secIg(y, D, ed) : rgSec === 'mem' ? secMem(y, D) : secDep(rgSec, y, D, ed);
    return `<div class="bar"><label><b>Ejercicio de las cuentas</b> <select data-rgej="1">${anios.map((a) => `<option value="${a}"${a === y ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
      <nav class="subtabs">${SECC.map(([k, l]) => `<button class="${k === rgSec ? 'on' : ''}${rmDe(y)[k]?.archivo ? ' hecho' : ''}" data-act="m-rg-sec" data-s="${k}">${l}${rmDe(y)[k]?.archivo ? ' ✓' : ''}</button>`).join('')}</nav></div>
      ${avisoHtml()}
      <div class="rg-split"><div class="rg-izq">${ed ? `<div class="dropzone" data-kind="rmca" tabindex="0" role="button"><b>Suelta aquí el PDF</b> de las cuentas anuales, la certificación, el informe de auditoría, el de gestión, la memoria, el acuse o la nota de despacho (se reconoce por el nombre; si no, va a «${esc(SECC.find((q) => q[0] === rgSec)[1])}»).
        <input type="file" data-dzkind="rmca" accept=".pdf" multiple hidden></div>` : ''}
        <div class="rg-visor" data-rgvisor="${rgSec}|${y}">${doc?.archivo ? '<p class="hint">Cargando el PDF…</p>' : '<p class="hint">Sin PDF de este documento.</p>'}</div></div>
      <div class="rg-der"><section class="block"><h4 class="it-tit">${esc(SECC.find((q) => q[0] === rgSec)[1])} · ejercicio ${y}</h4>${cuerpo}
        ${doc && ed ? `<p><button class="small danger" data-act="m-rg-rmquitar">Quitar este documento de ${y}</button></p>` : ''}</section></div></div>`;
  }

  // ---- visor del PDF (mitad izquierda) ----
  const visorCache = new Map();
  async function montarVisores() {
    for (const el of document.querySelectorAll('[data-rgvisor]:not([data-montado])')) {
      el.dataset.montado = '1';
      const [tipo, y] = el.dataset.rgvisor.split('|');
      const arch = tipo === 'esc' ? S.registros.find((r) => r.id === y)?.datos?.archivo
        : tipo.startsWith('doc:') ? docReg(tipo.split(':')[1], +y)?.datos?.[tipo.split(':')[2]]?.archivo : rmDe(+y)[tipo]?.archivo;
      if (!arch?.path) continue;
      try {
        let buf = visorCache.get(arch.path);
        if (!buf) {
          const { data, error } = await db.storage.from('documentos').download(arch.path);
          if (error) throw new Error(error.message);
          buf = new Uint8Array(await data.arrayBuffer()); visorCache.set(arch.path, buf);
        }
        const lib = window.pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await lib.getDocument({ data: buf.slice() }).promise;
        el.innerHTML = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          if (!el.isConnected) return;
          const pg = await pdf.getPage(p), vp = pg.getViewport({ scale: 1.4 }), cv = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height; cv.dataset.vp = p; cv.style.cssText = 'width:100%;display:block;margin:0 0 6px;border:1px solid var(--line)';
          el.appendChild(cv);
          await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        }
      } catch (err) { el.innerHTML = `<p class="hint rg-msg mal">No se pudo mostrar el PDF: ${esc(err.message)}</p>`; }
    }
  }
  if (typeof MutationObserver !== 'undefined') {
    let tm = null;
    new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(montarVisores, 60); }).observe(document.body, { childList: true, subtree: true });
  }

  async function rmCampo(clave, valor) {
    const [sec, k] = clave.split('|'), y = rmEj(), D = rmDe(y);
    D[sec] = D[sec] ?? rmBorrador(sec, y) ?? {};
    D[sec][k] = valor; if (D[sec].origen === 'borrador') D[sec].origen = 'manual';
    await rmGuardar(y, D);
  }
  async function rmDist(clave, valor) {
    const [i, k] = clave.split('|'), y = rmEj(), D = rmDe(y);
    D.cert = D.cert ?? rmBorrador('cert', y);
    if (!D.cert.dist?.[+i]) return;
    D.cert.dist[+i][k] = valor; if (D.cert.origen === 'borrador') D.cert.origen = 'manual';
    await rmGuardar(y, D); render();
  }
  // datos registrales que trae la identificación de las cuentas (solo rellena lo vacío)
  function dregDesdeCA(e, d) {
    const filas = S.registros.filter((r) => r.tipo === 'rmdoc' && r.empresa_id === e.id && r.datos?.ca?.t).sort((a, b) => b.ejercicio - a.ejercicio);
    if (!filas.length) return;
    const E = filas[0].datos.ca, t = E.t ?? {}, pon = (k, v) => { if (v && !d[k]) { d[k] = v; d._o[k] = `${E.archivo?.nombre ?? 'cuentas'} (cuentas presentadas ${filas[0].ejercicio})`; } };
    Object.entries(E.reg ?? {}).forEach(([k, v]) => pon(k, v));
    pon('lei', (String(t['01009'] || '').match(/\b[A-Z0-9]{20}\b/) || [''])[0]); pon('nif', (String(t['01010'] || '').match(/\b[A-Z]\d{7}[0-9A-J]\b/) || [''])[0]); pon('denominacion', String(t['01020'] || '').trim());
    pon('domicilio', String(t['01022'] || '').replace(/\s+(Municipio|C[oó]digo postal)\b.*$/i, '').trim());
    const cn = String(t['02001'] || '').match(/^(\d{4})\s*(.*?)\s*(\(\d\))?$/); if (cn) { pon('cnae', cn[1]); pon('cnaeDesc', cn[2]); }
  }

  // ================= Escrituras =================
  const ESC_TIPOS = [['CONSTITUCI[OÓ]N', 'Constitución de sociedad'], ['AMPLIACI[OÓ]N DE CAPITAL|AUMENTO DE CAPITAL', 'Ampliación de capital'], ['REDUCCI[OÓ]N DE CAPITAL', 'Reducción de capital'], ['FUSI[OÓ]N', 'Fusión'], ['ESCISI[OÓ]N', 'Escisión'],
    ['MODIFICACI[OÓ]N DE ESTATUTOS|MODIFICACI[OÓ]N ESTATUTARIA', 'Modificación de estatutos'], ['TRASLADO DE DOMICILIO|CAMBIO DE DOMICILIO', 'Traslado de domicilio'], ['NOMBRAMIENTO', 'Nombramiento de cargos'], ['CESE|DIMISI[OÓ]N', 'Cese de cargos'],
    ['REVOCACI[OÓ]N', 'Revocación de poderes'], ['PODER', 'Apoderamiento'], ['ELEVACI[OÓ]N A P[UÚ]BLICO', 'Elevación a público de acuerdos sociales'], ['DISOLUCI[OÓ]N|LIQUIDACI[OÓ]N', 'Disolución y liquidación'], ['COMPRAVENTA', 'Compraventa'],
    ['HIPOTECA|PR[EÉ]STAMO', 'Préstamo / hipoteca'], ['CAMBIO DE DENOMINACI[OÓ]N', 'Cambio de denominación'], ['OBJETO SOCIAL', 'Modificación del objeto social'], ['TRANSFORMACI[OÓ]N', 'Transformación'], ['ACTA', 'Acta notarial']];
  const ESC_CAMPOS = [['tipo', 'Tipo de escritura'], ['fecha', 'Fecha'], ['lugar', 'Lugar'], ['notario', 'Notario'], ['protocolo', 'Nº de protocolo'], ['comparecen', 'Comparecientes'], ['capital', 'Capital / importe'], ['registro', 'Registro Mercantil'],
    ['tomo', 'Tomo'], ['folio', 'Folio'], ['hoja', 'Hoja'], ['inscripcion', 'Inscripción'], ['fechaInsc', 'Fecha de inscripción'], ['resumen', 'Resumen']];
  const ESC_NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintidós: 22, veintitres: 23, veintitrés: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintiséis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30,
    cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
    seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
  function escPalabras(t) {
    let tot = 0, cur = 0;
    String(t).toLowerCase().replace(/[^a-záéíóúñ ]/g, ' ').split(/\s+/).filter(Boolean).forEach((w) => {
      if (w === 'y') return;
      if (w === 'mil') { tot += (cur || 1) * 1000; cur = 0; return; }
      if (ESC_NUM[w] != null) cur += ESC_NUM[w];
    });
    return tot + cur;
  }
  function escExtraer(pags) {
    const T = pags.join('\n'), T1 = pags.slice(0, 3).join('\n'), U = T1.toUpperCase(), R = {};
    R.tipo = [...new Set(ESC_TIPOS.filter(([rx]) => new RegExp(`\\b(${rx})`, 'i').test(U)).map((x) => x[1]))].slice(0, 3).join(' · ');
    let m = T1.match(/N[ÚU]MERO\s+([A-ZÁÉÍÓÚÑ -]{3,80}?)\s*\(?\s*(\d[\d.]*)\s*\)?/i) || T1.match(/(?:n[ºo°]|n[uú]mero)\s*(?:de\s+)?protocolo\s*:?\s*()(\d[\d.]*)/i);
    if (m) R.protocolo = m[2] || String(escPalabras(m[1]));
    m = T1.match(/En\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)\s*,\s*(?:mi\s+residencia\s*,\s*)?(?:a|el\s+d[ií]a)\s+([a-záéíóúñ ]+?|\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(dos\s+mil[a-záéíóúñ ]*|\d{4})/i);
    if (m) {
      R.lugar = m[1];
      const d = /^\d+$/.test(m[2]) ? +m[2] : escPalabras(m[2]), a = /^\d+$/.test(m[4]) ? +m[4] : escPalabras(m[4]);
      R.fecha = `${d ? `${d} de ` : ''}${m[3].toLowerCase()} de ${a}`;
    } else { m = T1.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/); if (m) R.fecha = `${m[1]}/${m[2]}/${m[3]}`; }
    m = T1.match(/ante\s+m[ií]\s*,?\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ .]+?)\s*,\s*Notari[oa]/i) || T1.match(/(?:Notari[oa])\s+(?:D\.|Dª|Don|Doña)?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ .]+?)\s*(?:,|\n)/);
    if (m) R.notario = m[1].replace(/\s+/g, ' ').trim();
    const comp = [], rx = /(?:\bD\.|\bDª\.?|\bDOÑA|\bDON|\bDña\.?)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ ]{4,60}?)\s*,[\s\S]{0,260}?(?:D\.?N\.?I\.?|N\.?I\.?F\.?|N\.?I\.?E\.?)[^0-9XYZ]{0,25}([0-9XYZ][\d.]{7,10}\s?-?\s?[A-Z])/g;
    let q;
    while ((q = rx.exec(T1)) && comp.length < 8) { const dni = q[2].replace(/[\s.-]/g, ''); if (!comp.some((x) => x.includes(dni))) comp.push(`${q[1].trim()} (${dni})`); }
    R.comparecen = comp.join('; ');
    m = T.match(/capital\s+social[^.]{0,160}?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+,\d{2})\s*(?:euros|€|EUR)/i); if (m) R.capital = `${m[1]} €`;
    m = T.match(/REGISTRO\s+MERCANTIL\s+DE\s+([A-ZÁÉÍÓÚÑ]+)/i); if (m) R.registro = `Registro Mercantil de ${m[1][0]}${m[1].slice(1).toLowerCase()}`;
    m = T.match(/\bTomo\s*:?\s*(\d{1,6})/i); if (m) R.tomo = m[1];
    m = T.match(/\bFolio\s*:?\s*(\d{1,6})/i); if (m) R.folio = m[1];
    m = T.match(/\bHoja\s*(?:n[ºo°]\.?|registral)?\s*:?\s*([A-Z]{0,3}-?\s?\d{1,7})/i); if (m) R.hoja = m[1].replace(/\s/g, '');
    m = T.match(/\bInscripci[oó]n\s*:?\s*(\d{1,4}[ªa]?)/i); if (m) R.inscripcion = m[1];
    m = T.match(/(?:inscrit[oa]|inscripci[oó]n)[^\n]{0,120}?(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i); if (m) R.fechaInsc = m[1];
    const i = T1.search(/\b(EXPONE[N]?|OTORGA[N]?|DISPOSICIONES|ACUERDOS)\b/); if (i >= 0) R.resumen = `${T1.slice(i, i + 900).replace(/\s+/g, ' ').trim()}…`;
    return R;
  }
  let escSel = null;
  const escLista = () => S.registros.filter((r) => r.tipo === 'rmesc' && r.empresa_id === S.sel);
  // las escrituras subidas antes de esta versión solo traen fecha, notario, protocolo, tipo y descripción
  const escC = (r) => r.datos.c ?? { fecha: r.datos.fecha, notario: r.datos.notario, protocolo: r.datos.protocolo, tipo: r.datos.tipo, resumen: r.datos.desc };
  async function cargarEscrituras(files) {
    if (!S.sel) return aviso('Elige primero la empresa.', true);
    for (const file of files) {
      try {
        if (!/\.pdf$/i.test(file.name)) { aviso(`${file.name}: solo se leen PDF`, true); continue; }
        aviso(`Leyendo ${file.name}…`);
        const L = await paginasDe(file), R = escExtraer(L.paginas), id = crypto.randomUUID();
        const sub = await c.subir(S.sel, 'rmesc', id, 'archivo', file);
        if (sub.error) throw new Error(sub.error);
        const fila = { id, empresa_id: S.sel, tipo: 'rmesc', ejercicio: null, datos: { c: R, archivo: sub.val, name: file.name, fecha: hoy(), n: L.n, ocr: L.ocr, texto: L.paginas.join('\n\n— página —\n\n').slice(0, 120000) } };
        const { error } = await db.from('registros').insert(fila);
        if (error) throw new Error(error.message);
        S.registros.push(fila); escSel = id;
        msg = `${file.name}: escritura leída${L.ocr ? ' (OCR)' : ''}${R.tipo ? ` · ${R.tipo}` : ''}`; msgMal = false;
      } catch (err) { aviso(`${file.name}: ${err.message}`, true); }
    }
    render();
  }
  function vistaEscrituras() {
    const e = empresa();
    if (!e) return sinEmpresa;
    const D = escLista(), ed = puede();
    const sel = D.find((x) => x.id === escSel) ?? D[D.length - 1];
    const lista = D.length ? `<table class="tabla rg-tabla" style="width:100%;margin-bottom:10px"><thead><tr><th>Fecha</th><th>Tipo</th><th>Notario</th><th>Protocolo</th><th>Archivo</th><th></th></tr></thead><tbody>${
      D.slice().sort((a, b) => String(escC(b).fecha || '').localeCompare(String(escC(a).fecha || ''))).map((x) => `<tr class="${sel && x.id === sel.id ? 'sel-cod' : ''}" data-act="m-rg-escsel" data-id="${x.id}" style="cursor:pointer"><td>${esc(escC(x).fecha || '')}</td><td>${esc(escC(x).tipo || '')}</td><td>${esc(escC(x).notario || '')}</td><td>${esc(escC(x).protocolo || '')}</td><td>${esc(x.datos.name || x.datos.archivo?.nombre || '')}</td><td>${ed ? `<button class="small danger" data-act="m-rg-escdel" data-id="${x.id}">Quitar</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '';
    const drop = ed ? `<div class="dropzone" data-kind="rmesc" tabindex="0" role="button"><b>Suelta aquí el PDF de una escritura</b> (o varias) o pulsa para elegirla. Se guarda, se lee (con OCR si es un escaneo) y se sacan tipo, fecha, notario, protocolo, comparecientes, capital e inscripción en el Registro.
      <input type="file" data-dzkind="rmesc" accept=".pdf" multiple hidden></div>` : '';
    if (!sel) return `${drop}${avisoHtml()}<p class="vacio">No hay escrituras guardadas de esta empresa.</p>`;
    const C = escC(sel);
    const der = `<section class="block rm-hoja"><h4 class="it-tit">${esc(C.tipo || 'Escritura')}</h4><table class="tabla rg-tabla rotulos" style="width:100%"><tbody>${ESC_CAMPOS.map(([k, t]) => `<tr><td style="width:24%"><b>${t}</b></td><td>${k === 'resumen' || k === 'comparecen'
      ? `<textarea class="facin" data-rgesc="${k}" rows="${k === 'resumen' ? 8 : 3}" style="width:100%"${ed ? '' : ' disabled'}>${esc(C[k] || '')}</textarea>`
      : `<input class="facin" data-rgesc="${k}" value="${esc(C[k] || '')}" style="width:100%"${ed ? '' : ' disabled'}>`}</td></tr>`).join('')}</tbody></table>
      ${sel.datos.texto ? `<details style="margin-top:10px"><summary>Texto completo (${sel.datos.n} páginas${sel.datos.ocr ? ', leído con OCR' : ''})</summary><pre class="rg-pre">${esc(sel.datos.texto)}</pre></details>` : ''}</section>`;
    return `${avisoHtml()}<div class="rg-split"><div class="rg-izq"><div class="rg-visor" data-rgvisor="esc|${sel.id}"><p class="hint">Cargando el PDF…</p></div></div><div class="rg-der">${drop}${lista}${der}</div></div>`;
  }
  async function escCampo(k, v) {
    const r = escLista().find((x) => x.id === escSel) ?? escLista().slice(-1)[0];
    if (!r || !puede()) return;
    const datos = { ...r.datos, c: { ...escC(r), [k]: v } };
    const { error } = await db.from('registros').update({ datos }).eq('id', r.id);
    if (error) return aviso(error.message, true);
    r.datos = datos;
  }
  // la escritura de constitución manda sobre notario, protocolo y fecha de constitución (salvo lo escrito a mano)
  function dregDesdeEsc(e, d) {
    const r = S.registros.find((x) => x.tipo === 'rmesc' && x.empresa_id === e.id && /constituc/i.test(escC(x).tipo || ''));
    if (!r) return;
    const C = escC(r), o = `${r.datos.name ?? 'escritura'} (escritura de constitución)`;
    [['notario', C.notario], ['protocolo', C.protocolo], ['fconst', C.fecha]].forEach(([k, v]) => { if (v && d._o[k] !== 'a mano' && d[k] !== v) { d[k] = v; d._o[k] = o; } });
  }

  // ================= Actas, Socios y Libros: recuadro para soltar los archivos en su hueco =================
  const normN = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.\w{2,4}$/, '').replace(/[_.-]+/g, ' ');
  function huecoDe(tab, nombre, D) {
    const n = ` ${normN(nombre)} `, slots = (c.docs?.[tab] ?? []).map(([k]) => k);
    const pistas = [['instancia', /instancia/], ['acuse', /acuse/], ['nota', /nota.*despacho|despacho/], ['asiento', /asiento/], ['escritura', /escritura|compraventa/], ['titular', /titular/],
      ['diario', /diario/], ['mayor', /mayor/], ['sys', /sumas|\bsys\b/], ['bsit', /bsit|situacion/], ['libro', /libro|acta|socios/]];
    const hit = pistas.find(([k, rx]) => slots.includes(k) && rx.test(n));
    return hit ? hit[0] : (slots.find((k) => !D[k]?.archivo) ?? slots[0]);
  }
  // ---- Libro registro de socios en Excel: hoja «Resumen» (socios y saldo de acciones) y una hoja de identificación por socio con sus movimientos de acciones ----
  const sinAcL = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const fechaUS = (v) => { // m/d/aa de Excel → dd/mm/aaaa
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(v ?? '').trim()); if (!m) return String(v ?? '').trim();
    let y = +m[3]; if (y < 100) y += y > 50 ? 1900 : 2000;
    return `${String(+m[2]).padStart(2, '0')}/${String(+m[1]).padStart(2, '0')}/${y}`;
  };
  function leerLibroSocios(buf) {
    const X = window.XLSX; if (!X) return null;
    const wb = X.read(buf, { type: 'array' }), F = (n) => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: false });
    const txt = (v) => (v == null ? '' : String(v).trim()), num = (v) => { const t = String(v ?? '').replace(/[^\d.-]/g, ''); return t === '' || t === '-' ? null : Number(t); };
    const nRes = wb.SheetNames.find((n) => /resumen/i.test(n)); if (!nRes) return null;
    const R = F(nRes), L = { sociedad: '', cif: '', ejercicio: '', domicilio: '', resumen: [], total: null, hojas: [] };
    R.slice(0, 9).forEach((fila) => (fila ?? []).forEach((v) => {
      const t = txt(v);
      if (/^Sociedad:/i.test(t) && !L.sociedad) L.sociedad = t.replace(/^Sociedad:\s*/i, ''); else if (/^CIF:/i.test(t)) L.cif = t.replace(/^CIF:\s*/i, '');
      else if (/^Ejercicio:/i.test(t)) L.ejercicio = t.replace(/^Ejercicio:\s*/i, ''); else if (/^Domicilio:/i.test(t)) L.domicilio = t.replace(/^Domicilio:\s*/i, '');
    }));
    const h = R.findIndex((f) => sinAcL(f?.[0]).startsWith('nombre'));
    if (h < 0) return null;
    for (const f of R.slice(h + 1)) {
      const a = txt(f?.[0]); if (!a) continue;
      if (/^total/i.test(a)) { L.total = { etiqueta: a, saldo: num(f[4]) }; break; }
      L.resumen.push({ nombre: a, nif: txt(f[1]), nacionalidad: txt(f[2]), domicilio: txt(f[3]), saldo: num(f[4]) ?? 0, fecha: fechaUS(f[5]), tipo: txt(f[6]), obs: txt(f[7]) === '0' ? '' : txt(f[7]) });
    }
    for (const n of wb.SheetNames.filter((x) => x !== nRes)) {
      const H = F(n), campo = (rx) => { const f = H.find((r) => rx.test(sinAcL(r?.[0]))); return txt(f?.[1]); };
      const hc = H.findIndex((r) => sinAcL(r?.[0]) === 'fecha'); if (hc < 0) continue;
      const cab = (H[hc] ?? []).map((v) => sinAcL(v)), iTipo = cab.indexOf('tipo'), iObs = cab.findIndex((v) => v.startsWith('observ')), iNum = cab.findIndex((v) => v.startsWith('numeraci'));
      const hoja = { hoja: n, titulo: txt(H[0]?.[0]), nombre: campo(/^nombre/), nif: campo(/^nif/), nacionalidad: campo(/^nacionalidad/), domicilio: campo(/^domicilio/), mov: [] };
      for (const f of H.slice(hc + 1)) {
        const a = txt(f?.[0]);
        if (/^total/i.test(a)) { hoja.mov.push({ total: a, cantidad: num(f[2]) }); continue; }
        if (!a && !txt(f?.[1])) continue;
        const nums = iNum >= 0 ? f.slice(iNum, iTipo >= 0 ? iTipo : iNum + 1).map(txt).filter(Boolean) : [];
        hoja.mov.push({ fecha: fechaUS(a), concepto: txt(f[1]), cantidad: num(f[2]), saldo: num(f[3]), numeracion: nums.join(' – '), tipo: iTipo >= 0 ? txt(f[iTipo]) : '', obs: iObs >= 0 && txt(f[iObs]) !== '0' ? txt(f[iObs]) : '' });
      }
      if (hoja.nombre) L.hojas.push(hoja);
    }
    return L.resumen.length ? L : null;
  }
  const nEs = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 }));
  function libroSociosHtml(L) {
    const total = L.total?.saldo ?? L.resumen.reduce((s, x) => s + (x.saldo || 0), 0), pc = (v) => (total ? `${((v / total) * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : '');
    const filas = L.resumen.map((s) => `<tr class="${s.saldo ? '' : 'libro-baja'}"><td>${esc(s.nombre)}</td><td>${esc(s.nif)}</td><td>${esc(s.nacionalidad)}</td><td>${esc(s.domicilio)}</td><td class="num">${nEs(s.saldo)}</td><td class="num">${s.saldo ? pc(s.saldo) : ''}</td><td class="c">${esc(s.fecha)}</td><td>${esc(s.tipo)}</td><td>${esc(s.obs)}</td></tr>`).join('');
    const hoja = (h, i) => {
      const s = L.resumen.find((x) => x.nif && x.nif === h.nif) ?? L.resumen.find((x) => sinAcL(x.nombre) === sinAcL(h.nombre));
      return `<details class="libro-hoja"${i === 0 ? ' open' : ''}><summary><b>Hoja de identificación del socio ${i + 1}</b> · ${esc(h.nombre)} · ${esc(h.nif)}${s ? ` · saldo ${nEs(s.saldo)} acciones` : ''}</summary>
        <table class="tabla rg-tabla rotulos" style="width:auto;margin:.4rem 0"><tbody><tr><td>Nombre o razón social</td><td><b>${esc(h.nombre)}</b></td></tr><tr><td>NIF o CIF</td><td>${esc(h.nif)}</td></tr><tr><td>Nacionalidad</td><td>${esc(h.nacionalidad)}</td></tr><tr><td>Domicilio</td><td>${esc(h.domicilio)}</td></tr></tbody></table>
        <div class="wrap"><table class="tprs tnom libro-t"><thead><tr><th>Fecha</th><th>Concepto</th><th>Cantidad acciones</th><th>Saldo total acciones</th><th>Numeración de acciones</th><th>Tipo</th><th>Observaciones</th></tr></thead><tbody>${h.mov.map((m) => (m.total
        ? `<tr class="ttot"><td colspan="2">${esc(m.total)}</td><td class="num">${nEs(m.cantidad)}</td><td colspan="4"></td></tr>`
        : `<tr><td class="c">${esc(m.fecha)}</td><td>${esc(m.concepto)}</td><td class="num${(m.cantidad ?? 0) < 0 ? ' neg' : ''}">${nEs(m.cantidad)}</td><td class="num">${nEs(m.saldo)}</td><td>${esc(m.numeracion)}</td><td>${esc(m.tipo)}</td><td>${esc(m.obs)}</td></tr>`)).join('')}</tbody></table></div></details>`;
    };
    return `<section class="block"><h4 class="it-tit">LIBRO REGISTRO DE SOCIOS${L.ejercicio ? ` · ejercicio ${esc(L.ejercicio)}` : ''}</h4>
      <table class="tabla rg-tabla rotulos" style="width:auto"><tbody><tr><td>Sociedad</td><td><b>${esc(L.sociedad)}</b></td></tr>${L.cif ? `<tr><td>CIF</td><td>${esc(L.cif)}</td></tr>` : ''}${L.domicilio ? `<tr><td>Domicilio</td><td>${esc(L.domicilio)}</td></tr>` : ''}</tbody></table>
      <div class="wrap"><table class="tprs tnom libro-t" style="margin-top:.6rem"><thead><tr><th>Nombre o razón social</th><th>NIF o CIF</th><th>Nacionalidad</th><th>Domicilio</th><th>Saldo acciones</th><th>% capital</th><th>Fecha última anotación</th><th>Tipo</th><th>Observaciones</th></tr></thead><tbody>${filas}
      <tr class="ttot"><td colspan="4">${esc(L.total?.etiqueta ?? 'Total acciones')}</td><td class="num">${nEs(total)}</td><td class="num">${total ? '100,00 %' : ''}</td><td colspan="3"></td></tr></tbody></table></div>
      <p class="hint">Los socios con saldo 0 ya no tienen acciones (aparecen atenuados). Despliega la hoja de cada socio para ver todos sus movimientos: constitución, ampliaciones y transmisiones.</p></section>
      <section class="block"><h4 class="it-tit">Hojas de identificación de los socios · ${L.hojas.length}</h4>${L.hojas.map(hoja).join('') || '<p class="hint">El Excel no trae hojas de socios.</p>'}</section>`;
  }
  let rgDocEj = null; const rgDocSec = {};
  const docEj = () => rgDocEj ?? Number(S.ejercicio);
  const docReg = (tab, y) => S.registros.find((x) => x.tipo === `doc-${tab}` && x.empresa_id === S.sel && x.ejercicio === y);
  async function docGuardar(tab, y, D) {
    const r = docReg(tab, y);
    if (r) {
      const { error } = await db.from('registros').update({ datos: D }).eq('id', r.id);
      if (error) return aviso(error.message, true);
      r.datos = D;
    } else {
      const fila = { id: crypto.randomUUID(), empresa_id: S.sel, tipo: `doc-${tab}`, ejercicio: y, datos: D };
      const { error } = await db.from('registros').insert(fila);
      if (error) return aviso(error.message, true);
      S.registros.push(fila);
    }
  }
  // misma presentación que Cuentas Anuales Presentadas: ejercicio, un apartado por documento, recuadro para soltar, PDF a la izquierda y datos a la derecha
  function vistaDocsRg(tab) {
    const e = empresa();
    if (!e) return sinEmpresa;
    const y = docEj(), ed = puede(), slots = c.docs[tab], sec = slots.some(([k]) => k === rgDocSec[tab]) ? rgDocSec[tab] : slots[0][0];
    const D = docReg(tab, y)?.datos ?? {}, cur = D[sec] ?? {}, nomSec = slots.find(([k]) => k === sec)[1];
    const anios = []; for (let a = (Number(S.ejercicio) || new Date().getFullYear()) + 1; a >= (Number(S.ejercicio) || new Date().getFullYear()) - 8; a--) anios.push(a);
    const esPdf = /\.pdf$/i.test(cur.archivo?.nombre ?? '');
    return `<div class="bar"><label><b>Ejercicio</b> <select data-rgdej="1">${anios.map((a) => `<option value="${a}"${a === y ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
      <nav class="subtabs">${slots.map(([k, l]) => `<button class="${k === sec ? 'on' : ''}${D[k]?.archivo ? ' hecho' : ''}" data-act="m-rg-dsec" data-t="${tab}" data-s="${k}">${esc(l)}${D[k]?.archivo ? ' ✓' : ''}</button>`).join('')}</nav></div>
      ${avisoHtml()}
      ${cur.libro ? `${ed ? `<div class="dropzone" data-kind="doc-${tab}" tabindex="0" role="button"><b>Suelta aquí otro archivo</b> (Excel del libro de socios, escritura…) o haz clic para elegirlo; el Excel se lee y se enseña como libro registro de socios.
        <input type="file" data-dzkind="doc-${tab}" multiple hidden></div>` : ''}
        <p>${cur.archivo?.path ? `<button class="small" data-act="m-abrir" data-path="${esc(cur.archivo.path)}">📎 ${esc(cur.archivo.nombre)}</button>` : ''} ${cur.archivo && ed ? `<button class="small danger" data-act="m-rg-docdel" data-t="${tab}" data-s="${sec}">Quitar este documento de ${y}</button>` : ''}</p>
        ${libroSociosHtml(cur.libro)}` : `<div class="rg-split"><div class="rg-izq">${ed ? `<div class="dropzone" data-kind="doc-${tab}" tabindex="0" role="button"><b>Suelta aquí el archivo</b> (se coloca en su apartado por el nombre; si no se reconoce, en «${esc(nomSec)}») o haz clic para elegirlo.
        <input type="file" data-dzkind="doc-${tab}" multiple hidden></div>` : ''}
        <div class="rg-visor"${esPdf ? ` data-rgvisor="doc:${tab}:${sec}|${y}"` : ''}>${cur.archivo ? (esPdf ? '<p class="hint">Cargando el PDF…</p>' : '<p class="hint">Este archivo no es un PDF: ábrelo con el botón.</p>') : '<p class="hint">Sin archivo en este apartado.</p>'}</div></div>
      <div class="rg-der"><section class="block"><h4 class="it-tit">${esc(nomSec)} · ejercicio ${y}</h4>
        <table class="tabla rg-tabla rotulos" style="width:auto"><tbody>
          <tr><td>Fecha</td><td><input type="date" class="facin" data-rgdoc="${tab}|${sec}|fecha" value="${esc(cur.fecha ?? '')}"${ed ? '' : ' disabled'}></td></tr>
          <tr><td>Referencia (nº de asiento, justificante, observaciones)</td><td><input class="facin" data-rgdoc="${tab}|${sec}|ref" value="${esc(cur.ref ?? '')}" size="44"${ed ? '' : ' disabled'}></td></tr>
          <tr><td>Archivo</td><td>${cur.archivo?.path ? `<button class="small" data-act="m-abrir" data-path="${esc(cur.archivo.path)}">📎 ${esc(cur.archivo.nombre)}</button>` : '—'}</td></tr>
        </tbody></table>
        ${cur.archivo && ed ? `<p><button class="small danger" data-act="m-rg-docdel" data-t="${tab}" data-s="${sec}">Quitar este documento de ${y}</button></p>` : ''}</section></div></div>`}`;
  }
  async function cargarDocs(tab, files) {
    if (!S.sel) return aviso('Elige primero la empresa.', true);
    const ej = docEj(), tipo = `doc-${tab}`;
    for (const f of files) {
      try {
        const r = docReg(tab, ej);
        const D = { ...(r?.datos ?? {}) }, slot = huecoDe(tab, f.name, D);
        const sub = await c.subir(S.sel, `${tipo}-${ej}`, 'doc', slot, f);
        if (sub.error) throw new Error(sub.error);
        D[slot] = { fecha: D[slot]?.fecha ?? '', ref: D[slot]?.ref ?? '', archivo: sub.val };
        // un Excel en «Socios» se lee y se presenta como libro registro de socios
        if (tab === 'rmsocios' && /\.xlsx?$/i.test(f.name)) { try { const L = leerLibroSocios(await f.arrayBuffer()); if (L) D[slot].libro = L; } catch { /* sin libro: queda solo el archivo */ } }
        await docGuardar(tab, ej, D); rgDocSec[tab] = slot;
        msg = `${f.name}: guardado en «${(c.docs[tab].find(([k]) => k === slot) ?? [])[1] ?? slot}» (${ej})`; msgMal = false;
      } catch (err) { aviso(`${f.name}: ${err.message}`, true); }
    }
    render();
  }

  // ================= Eventos propios =================
  const acciones = {
    'm-rg-dsec': (d) => { rgDocSec[d.t] = d.s; render(); },
    'm-rg-docdel': async (d) => {
      if (!confirm('¿Quitar este documento y su archivo?')) return;
      const y = docEj(), D = { ...(docReg(d.t, y)?.datos ?? {}) }, p = D[d.s]?.archivo?.path;
      if (p) await db.storage.from('documentos').remove([p]);
      delete D[d.s]; await docGuardar(d.t, y, D); render();
    },
    'm-rg-escsel': (d) => { escSel = d.id; render(); },
    'm-rg-escdel': async (d) => {
      if (!confirm('¿Quitar esta escritura y su archivo?')) return;
      const r = escLista().find((x) => x.id === d.id); if (!r) return;
      if (r.datos.archivo?.path) await db.storage.from('documentos').remove([r.datos.archivo.path]);
      await db.from('registros').delete().eq('id', r.id);
      S.registros.splice(S.registros.indexOf(r), 1); render();
    },
    'm-rg-sec': (d) => { rgSec = d.s; render(); },
    'm-rg-irpag': (d) => { const cv = document.querySelector(`[data-rgvisor] canvas[data-vp="${d.p}"]`); cv?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'm-rg-rmquitar': async () => {
      if (!confirm('¿Quitar este documento y su archivo?')) return;
      const y = rmEj(), D = rmDe(y), p = D[rgSec]?.archivo?.path;
      if (p) await db.storage.from('documentos').remove([p]);
      delete D[rgSec]; await rmGuardar(y, D); render();
    },
    'm-rg-accdel': async (d) => { const D = accDatos(); D.rel.splice(+d.i, 1); await accGuardar(D); render(); },
    'm-rg-accadd': async () => { const D = accDatos(); D.rel.push({ socio: '', participada: '', pct: 0 }); await accGuardar(D); render(); },
    'm-rg-accquitar': async (d) => {
      if (!confirm(`¿Quitar ${d.n} y las participaciones leídas de él?`)) return;
      const D = accDatos(); D.rel = D.rel.filter((r) => r.origen !== d.n); D.archivos = D.archivos.filter((a) => a.name !== d.n);
      await accGuardar(D); render();
    },
    'm-rg-dregtr': () => dregDeTitReal(),
    'm-rg-dregca': () => dregDeCuentas(false),
    'm-rg-dregquitar': (d) => dregQuitar(d.n),
    'm-rg-admadd': () => admAnadir(),
    'm-rg-admdel': (d) => admQuitar(d.i),
    'm-rg-tradd': async (d) => { const D = trlDe(); D[d.c].push({}); await trlGuardar(D); },
    'm-rg-trdel': async (d) => { const D = trlDe(); D[d.c].splice(+d.i, 1); await trlGuardar(D); },
    'm-rg-trquitar': async (d) => {
      if (!confirm(`¿Quitar ${d.n} y los datos que se leyeron de él?`)) return;
      const D = trlDe(); const n = d.n;
      D.archivos = D.archivos.filter((a) => a.name !== n);
      ['titulares', 'sociedades', 'cadena'].forEach((c_) => { D[c_] = D[c_].filter((x) => x.origen !== n); });
      await trlGuardar(D);
    },
  };
  document.addEventListener('change', (ev) => {
    const t = ev.target; if (!t.dataset) return;
    if (t.dataset.rgdreg) dregEditar(t.dataset.rgdreg, t.value);
    else if (t.dataset.rgadm) admEditar(t.dataset.rgadm, t.value);
    else if (t.dataset.rgtr) trlCampo(t.dataset.rgtr, t.value);
    else if (t.dataset.rgtrcab) trlCab(t.dataset.rgtrcab, t.value);
    else if (t.dataset.rgdej) { rgDocEj = +t.value; render(); }
    else if (t.dataset.rgdoc) {
      const [tab, sec, k] = t.dataset.rgdoc.split('|'), y = docEj(), D = { ...(docReg(tab, y)?.datos ?? {}) };
      D[sec] = { ...(D[sec] ?? {}), [k]: t.value }; docGuardar(tab, y, D);
    }
    else if (t.dataset.rgesc) escCampo(t.dataset.rgesc, t.value);
    else if (t.dataset.rgf) rmCampo(t.dataset.rgf, t.value);
    else if (t.dataset.rgdist) rmDist(t.dataset.rgdist, t.value);
    else if (t.dataset.rgej) { rgEj = +t.value; render(); }
    else if (t.dataset.rgacctipo) { const D = accDatos(); D.tipos[t.dataset.rgacctipo] = t.value; accGuardar(D).then(render); }
    else if (t.dataset.rgacctodo) { accTodo = t.checked; render(); }
    else if (t.dataset.rgaccsoc) { accSoc = t.value; render(); }
    else if (t.dataset.rgaccf) {
      const [i, k] = t.dataset.rgaccf.split('|'), D = accDatos();
      if (!D.rel[+i]) return;
      D.rel[+i][k] = k === 'pct' ? (parseFloat(t.value.replace('%', '').replace(/\./g, '').replace(',', '.')) || 0) : t.value;
      accGuardar(D).then(render);
    }
  });
  document.addEventListener('click', (ev) => {
    const f = ev.target.closest?.('[data-rgacctr]');
    if (f && !ev.target.closest('select')) { accTR = accTR === f.dataset.rgacctr ? null : f.dataset.rgacctr; render(); }
  });

  const kinds = { dreg: cargarDreg, trl: cargarTitReal, acc: cargarAccionariado, rmca: cargarRm, rmesc: cargarEscrituras };
  const tabs = {
    dreg: ['Datos Registrales', 'NIF, IRUS, CNAE, Registro', vistaDreg],
    trl: ['Titularidad Real', 'Titulares reales', vistaTitReal],
    acc: ['Organigrama', 'Socios y participadas', vistaAccionariado],
    rmca: ['Cuentas Anuales Presentadas', 'Cuentas, certificación, auditoría, gestión, memoria, acuse y nota', vistaCuentas],
    rmesc: ['Escrituras', 'Notariales', vistaEscrituras],
  };
  [['rmactas', 'Actas', 'Libro de actas'], ['rmsocios', 'Socios', 'Libro registro de socios'], ['rmlibros', 'Libros', 'Libros contables']].forEach(([t, n, s]) => {
    kinds[`doc-${t}`] = (files) => cargarDocs(t, files);
    tabs[t] = [n, s, () => vistaDocsRg(t)];
  });
  const EV = crearEnvio(c); // 11.- Administración · Enviar documentación
  Object.assign(tabs, EV.tabs); Object.assign(acciones, EV.acciones);
  return { tabs, kinds, acciones };
}
