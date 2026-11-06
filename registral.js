// Bloque 2 · Información Registro Mercantil (portado de la aplicación antigua).
// Datos Registrales y Titularidad Real: se suelta el PDF o Excel y se leen los datos, con el archivo de origen.
export function crearRegistral(c) {
  const { db, S, esc, render, cargar, empresa, puede, leerPdf, filasExcel, ocrPdf } = c;
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
    return { lineas, todo };
  }
  const textoLineas = (lineas) => lineas.map((l) => l.map((i) => i.s).join('  ')).join('\n');

  // ================= Datos Registrales =================
  const DREG_CAMPOS = [['denominacion', 'Denominación social'], ['nif', 'NIF'], ['irus', 'IRUS'], ['cnae', 'CNAE'], ['cnaeDesc', 'Actividad (CNAE)'],
    ['registro', 'Registro Mercantil'], ['tomo', 'Tomo'], ['libro', 'Libro'], ['folio', 'Folio'], ['seccion', 'Sección'], ['hoja', 'Hoja registral'],
    ['inscripcion', 'Inscripción'], ['lei', 'LEI'], ['domicilio', 'Domicilio social'], ['fconst', 'Fecha de constitución'], ['notario', 'Notario (constitución)'],
    ['protocolo', 'Nº de protocolo']];

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
    R.hoja = prim(/\b(?:N[ºo°.]*\s*(?:de\s+)?)?Hoja(?:\s+Registral)?(?:\s+n[ºo°.]*)?\s*[:.]?\s*([A-Z]{0,3}[-\s]?\d{1,7})\b/i, (m) => m[1].replace(/\s/g, ''));
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
    if (/\.pdf$/i.test(f.name)) {
      const { lineas } = await lineasDe(f);
      const t = textoLineas(lineas);
      return t.trim() ? t : (ocrPdf ? ocrPdf(f, (m) => aviso(`${f.name}: ${m}`)) : '');
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
    const d = dregDe(e); dregDesdeCenso(e, d);
    const ed = puede();
    const av = d.nif && nifEmp() && d.nif !== nifEmp() ? `<p class="aviso">El NIF leído (${esc(d.nif)}) no coincide con el de la empresa seleccionada (${esc(nifEmp())})</p>` : '';
    const arch = d._arch;
    return `${ed ? `<div class="dropzone" data-kind="dreg" tabindex="0" role="button"><b>Suelta aquí el PDF o Excel con los datos registrales</b> (nota simple, certificado IRUS, declaración de titularidad real, ficha de la sociedad…) o pulsa para elegirlo. Se extraen NIF, IRUS, CNAE, Registro Mercantil, tomo, libro, folio, sección, hoja, inscripción, LEI, domicilio y fecha de constitución.
      <input type="file" data-dzkind="dreg" accept=".pdf,.xlsx,.xls,.csv" multiple hidden></div>` : ''}${avisoHtml()}${av}
      <section class="block"><h4 class="it-tit">Datos registrales · ${esc(e.nombre)}</h4>
      <table class="tabla rg-tabla"><thead><tr><th>Dato</th><th>Valor</th><th>Tomado de</th></tr></thead><tbody>
      ${DREG_CAMPOS.map(([k, t]) => `<tr><td><b>${t}</b></td><td><input class="facin" data-rgdreg="${k}" value="${esc(d[k] ?? '')}" size="${/denominacion|domicilio|cnaeDesc|registro/.test(k) ? 48 : 22}"${ed ? '' : ' disabled'}></td><td class="hint">${esc(d._o[k] ?? '')}</td></tr>`).join('')}
      </tbody></table>
      ${ed ? '<p><button class="small" data-act="m-rg-dregtr">Tomar Registro Mercantil, tomo, folio y hoja de Titularidad real</button></p>' : ''}
      ${arch.length ? `<p class="hint">Archivos leídos: ${arch.map((a) => `${esc(a.name)} (${esc(a.fecha)})${ed ? ` <button class="small" data-act="m-rg-dregquitar" data-n="${esc(a.name)}">Quitar</button>` : ''}`).join(' · ')}</p>
      <details><summary>Ver el texto extraído</summary>${arch.map((a) => `<h4>${esc(a.name)}</h4><pre class="rg-pre">${esc(a.texto ?? '')}</pre>`).join('')}</details>` : ''}
      </section>`;
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
          if (!texto.trim() && ocrPdf) { texto = await ocrPdf(file, (m) => aviso(`${file.name}: ${m}`)); R = trlDeTexto(texto.split('\n')); }
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
      <table class="tabla rg-tabla" style="width:auto;margin-bottom:12px"><tbody>${[['oblig', 'Obligada a presentar la identificación del titular real (SI/NO)'], ['presenta', 'Presenta por primera vez o actualiza/ratifica (SI/NO)'],
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

  // ================= Eventos propios =================
  const acciones = {
    'm-rg-dregtr': () => dregDeTitReal(),
    'm-rg-dregquitar': (d) => dregQuitar(d.n),
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
    else if (t.dataset.rgtr) trlCampo(t.dataset.rgtr, t.value);
    else if (t.dataset.rgtrcab) trlCab(t.dataset.rgtrcab, t.value);
  });

  const kinds = { dreg: cargarDreg, trl: cargarTitReal };
  const tabs = {
    dreg: ['Datos Registrales', 'NIF, IRUS, CNAE, Registro', vistaDreg],
    trl: ['Titularidad Real', 'Titulares reales', vistaTitReal],
  };
  return { tabs, kinds, acciones };
}
