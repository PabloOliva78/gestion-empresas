// Cuatro controles fiscales nuevos (solo leen los libros y lo presentado; lo único que escriben son sus propios registros):
//  · «Cambios en libros» (camblib): al cargar o corregir un libro de IVA se compara con el que había y se anotan las facturas nuevas, modificadas o borradas que caen en un periodo cuyo 303 YA estaba presentado (posible complementaria)
//  · «Plazo de deducción» (plazoded): facturas recibidas registradas mucho después de su fecha (el derecho a deducir caduca a los 4 años, art. 99.Tres LIVA)
//  · «Devoluciones pendientes» (devol): seguimiento de las devoluciones solicitadas (IVA, IS…), con el plazo de 6 meses de la AEAT y los intereses de demora que se podrían reclamar
//  · «Facturas simplificadas» (simpl): facturas simplificadas (F2 del SII) que superan 400 € o 3.000 €
export function crearControlesIva({ S, db, esc, render, empresa, puede, grande, prsVal }) {
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const r2 = (x) => Math.round(((Number(x) || 0) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const fd = (f) => String(f || '').slice(0, 10).split('-').reverse().join('/');
  const nifN = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  const facN = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
  const num = (v) => { const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const hoy = () => new Date().toISOString().slice(0, 10);
  const sel = () => '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
  const cargando = '<p class="vacio">Cargando datos…</p>';
  const caja = (tit, intro, cuerpo) => `<div class="inicio"><section class="dsec"><h3>${tit}</h3>${intro ? `<p class="dash-s" style="font-size:.8rem">${intro}</p>` : ''}${cuerpo}</section></div>`;
  const ins = (c, t) => (c === 'ko' ? `<span class="d-ko">✖ ${esc(t)}</span>` : c === 'ok' ? `<span class="d-ok">✓ ${esc(t)}</span>` : `<span class="d-nd">• ${esc(t)}</span>`);
  const regDe = (tipo, emp = S.sel) => S.registros.find((r) => r.tipo === tipo && String(r.empresa_id) === String(emp));

  // guarda el dato de un registro propio (uno por empresa y tipo), de uno en uno
  let cola = Promise.resolve();
  function guardarReg(tipo, emp, mut) {
    const paso = async () => {
      const r = regDe(tipo, emp), datos = JSON.parse(JSON.stringify(r?.datos ?? {}));
      mut(datos);
      if (r) { const { error } = await db.from('registros').update({ datos }).eq('id', r.id); if (error) return error.message; r.datos = datos; return null; }
      const fila = { id: crypto.randomUUID(), empresa_id: emp, tipo, ejercicio: null, datos };
      const { error } = await db.from('registros').insert(fila); if (error) return error.message; S.registros.push(fila); return null;
    };
    const p = cola.then(paso, paso); cola = p.catch(() => {}); return p;
  }

  // ---------- ¿está presentado el 303 de un periodo? ----------
  const presentado303 = (emp, ej, per) => S.registros.some((r) => String(r.empresa_id) === String(emp) && (
    ((r.tipo === 'pres' || (r.tipo === 'liq' && r.datos?.estado === 'Presentado')) && r.datos?.modelo === '303' && r.datos?.periodo === per && Number(r.ejercicio) === Number(ej))
    || (r.tipo === 'prs' && Number(r.ejercicio) === Number(ej) && r.datos?.[`303|${per}`] !== undefined)));
  const periodoDe = (e, fecha) => { const y = +String(fecha).slice(0, 4), m = +String(fecha).slice(5, 7); if (!y || !m) return null; return { ej: y, per: e?.tipo === 'GE' ? String(m).padStart(2, '0') : `${Math.ceil(m / 3)}T` }; };

  // =====================================================================================
  // 16 · Cambios en libros después de presentar
  // =====================================================================================
  // Se llama al guardar un libro de IVA (cargas y correcciones). antes = lo que había, despues = lo que queda. La primera carga (libro vacío) no se anota.
  function registrarCambios(tipo, empresaId, antes, despues) {
    try {
      if (!/^fact-[ER]$/.test(tipo) || !Array.isArray(antes) || !antes.length || !Array.isArray(despues)) return;
      const emp = (S.empresas ?? []).find((e) => String(e.id) === String(empresaId)); if (!emp) return;
      const grupos = (arr) => { const m = new Map(); arr.forEach((l) => { const k = [nifN(l.nif), facN(l.factura), l.codigo ?? '', l.pct ?? ''].join('|'); const g = m.get(k) ?? m.set(k, { l, base: 0, cuota: 0, n: 0 }).get(k); g.base = r2(g.base + (Number(l.base) || 0)); g.cuota = r2(g.cuota + (Number(l.cuota) || 0)); g.n++; }); return m; };
      const A = grupos(antes), D = grupos(despues), af = []; let n = 0, m = 0, b = 0;
      const linea = (k, g, g0) => { const per = periodoDe(emp, g.l.fecha); if (!per || !presentado303(emp.id, per.ej, per.per)) return false; af.push({ k, fa: String(g.l.factura ?? ''), nif: g.l.nif ?? '', nm: g.l.nombre ?? '', f: g.l.fecha ?? '', b: g.base, c: g.cuota, ...(g0 ? { b0: g0.base, c0: g0.cuota } : {}), p: `${per.per} ${per.ej}` }); return true; };
      D.forEach((g, key) => { const g0 = A.get(key); if (!g0) { n++; linea('N', g); } else if (Math.abs(g.base - g0.base) > 0.005 || Math.abs(g.cuota - g0.cuota) > 0.005 || g.n !== g0.n || g.l.fecha !== g0.l.fecha) { m++; linea('M', g, g0); } });
      A.forEach((g0, key) => { if (!D.has(key)) { b++; linea('B', g0); } });
      if (!af.length) return; // solo se anota lo que toca un periodo ya presentado
      const entrada = { t: new Date().toISOString(), l: tipo === 'fact-E' ? 'E' : 'R', n, m, b, af: af.slice(0, 100), mas: Math.max(0, af.length - 100) };
      guardarReg('camblib', emp.id, (d) => { d.e = [entrada, ...(d.e ?? [])].slice(0, 60); });
    } catch { /* nunca debe impedir guardar el libro */ }
  }
  function vistaCambios() {
    if (!S.sel) return sel();
    const E = (regDe('camblib')?.datos?.e ?? []).map((e, i) => ({ ...e, i })), pend = E.filter((e) => !e.rev), ed = puede?.() !== false;
    const tit = `Cambios en los libros de IVA tras presentar · ${esc(empresa()?.nombre ?? '')}`;
    const intro = 'Cada vez que se carga o se corrige un libro de IVA (emitidas o recibidas), la app lo compara con el que había y anota las facturas nuevas, modificadas o borradas que caen en un periodo cuyo modelo 303 ya estaba presentado. Si el 303 ya se presentó, un cambio así puede obligar a una complementaria o a una rectificación.';
    if (!E.length) return caja(tit, intro, `<p class="dash-s"><span class="d-ok">✓ No hay cambios anotados en periodos ya presentados</span></p><p class="hint">Se anotan a partir de ahora. La primera carga de un libro vacío no cuenta como cambio.</p>`);
    const nom = { N: 'Nueva', M: 'Modificada', B: 'Borrada' };
    return caja(tit, intro, `<p class="dash-s">${pend.length ? `<span class="d-ko">${pend.length} carga(s) con cambios sin revisar</span>` : '<span class="d-ok">✓ Todo revisado</span>'} · ${E.length} anotadas</p>
      ${E.map((e) => `<div class="wrap" style="margin-bottom:.8rem"><p class="dash-s"><b>${esc(new Date(e.t).toLocaleString('es-ES'))}</b> · libro de ${e.l === 'E' ? 'emitidas' : 'recibidas'} · ${e.n} nuevas, ${e.m} modificadas, ${e.b} borradas ${e.rev ? ins('ok', 'Revisado') : ins('ko', 'Sin revisar')}${ed ? ` <button class="small" data-act="m-cbrev" data-i="${e.i}">${e.rev ? 'Marcar sin revisar' : 'Marcar revisado'}</button>` : ''}</p>
        <table class="tabla"><thead><tr><th>Cambio</th><th>Periodo presentado</th><th>Factura</th><th>Fecha</th><th>NIF</th><th>Nombre</th><th>Base</th><th>Cuota</th><th>Antes (base · cuota)</th></tr></thead><tbody>
        ${e.af.map((x) => `<tr><td>${x.k === 'M' ? ins('ko', nom[x.k]) : ins('aviso', nom[x.k])}</td><td>303 ${esc(x.p)}</td><td>${esc(x.fa)}</td><td>${esc(fd(x.f))}</td><td>${esc(x.nif)}</td><td>${esc(x.nm)}</td><td style="text-align:right">${money(x.b)}</td><td style="text-align:right">${money(x.c)}</td><td>${x.b0 !== undefined ? `${money(x.b0)} · ${money(x.c0)}` : '—'}</td></tr>`).join('')}</tbody></table>${e.mas ? `<p class="hint">y ${e.mas} líneas más</p>` : ''}</div>`).join('')}
      <p class="hint">Solo se anotan los cambios en periodos con el 303 presentado (en «Impuestos presentados» o liquidaciones marcadas como presentadas). Se anotan las últimas 60 cargas con cambios.</p>`);
  }

  // =====================================================================================
  // 18 · Plazo de deducción del IVA soportado
  // =====================================================================================
  let mesesAviso = 6;
  const meses = (a, b) => { const x = new Date(a), y = new Date(b); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()) - (y.getUTCDate() < x.getUTCDate() ? 1 : 0); };
  const addAnios = (f, n) => { const d = new Date(f); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };
  function vistaPlazo() {
    if (!S.sel) return sel();
    const R = grande('fact-R'); if (!R) return cargando;
    const ej = Number(S.ejercicio), tit = `Plazo de deducción del IVA soportado · ${esc(empresa()?.nombre ?? '')} · ${ej}`;
    const intro = 'El derecho a deducir el IVA soportado caduca a los cuatro años desde que nace (art. 99.Tres LIVA). Esta pestaña marca las facturas recibidas que se han registrado mucho después de su fecha: cuanto más tarde, más riesgo de que no se pueda deducir o de que se discuta el periodo.';
    const L = R.filter((l) => String(l.fecha ?? '').slice(0, 4) === String(ej) && Number(l.cuota) > 0.005 && l.ff && l.fecha && !/(^|\.)I\.(ALQ|INT|DV|PR)/.test(String(l.codigo ?? '')))
      .map((l) => ({ l, m: meses(l.ff, l.fecha), limite: addAnios(l.ff, 4) })).filter((x) => x.m > mesesAviso).sort((a, b) => b.m - a.m);
    const cls = (x) => (x.l.fecha > x.limite ? ['ko', 'Fuera de plazo (más de 4 años)'] : x.m >= 42 ? ['ko', 'Cerca del límite de 4 años'] : x.m >= 12 ? ['aviso', 'Registrada más de un año después'] : ['aviso', `Registrada más de ${mesesAviso} meses después`]);
    const sel6 = [3, 6, 12].map((n) => `<button class="small${n === mesesAviso ? ' primary' : ''}" data-act="m-pdmeses" data-n="${n}">más de ${n} meses</button>`).join(' ');
    const tot = r2(L.reduce((s, x) => s + (Number(x.l.cuota) || 0), 0)), graves = L.filter((x) => cls(x)[0] === 'ko').length;
    return caja(tit, intro, `<p>Avisar si el retraso es de: ${sel6}</p>
      <p class="dash-s">${L.length ? `<span class="d-${graves ? 'ko' : 'nd'}">${L.length} factura(s) registradas con retraso</span> · cuota ${money(tot)}${graves ? ` · <span class="d-ko">${graves} en riesgo</span>` : ''}` : '<span class="d-ok">✓ Ninguna factura recibida registrada con retraso</span>'}</p>
      ${L.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Factura</th><th>Fecha factura</th><th>Fecha registro</th><th>Meses de retraso</th><th>Último día para deducir</th><th>NIF</th><th>Nombre</th><th>Base</th><th>Cuota</th><th>Aviso</th></tr></thead><tbody>
      ${L.slice(0, 400).map((x) => { const [c, t] = cls(x); return `<tr><td>${esc(x.l.factura)}</td><td>${esc(fd(x.l.ff))}</td><td>${esc(fd(x.l.fecha))}</td><td style="text-align:right">${x.m}</td><td>${esc(fd(x.limite))}</td><td>${esc(x.l.nif)}</td><td>${esc(x.l.nombre)}</td><td style="text-align:right">${money(x.l.base)}</td><td style="text-align:right">${money(x.l.cuota)}</td><td>${ins(c, t)}</td></tr>`; }).join('')}</tbody></table></div>${L.length > 400 ? `<p class="hint">Se muestran las 400 con más retraso de ${L.length}.</p>` : ''}` : ''}
      <p class="hint">Se compara la fecha de la factura con la de registro del libro de recibidas del ejercicio (solo facturas con cuota; no las retenciones). El «último día para deducir» es la fecha de la factura más cuatro años: es orientativo, el plazo se cuenta desde que nace el derecho (devengo y recepción de la factura).</p>`);
  }

  // =====================================================================================
  // 20 · Seguimiento de devoluciones pendientes
  // =====================================================================================
  const TIPO_DEMORA = 4.0625; // interés de demora que conozco (2024 y 2025): hay que confirmar el vigente y editarlo en la pestaña
  const datosDev = () => regDe('devol')?.datos ?? {};
  const itemsDev = () => datosDev().items ?? [];
  const sumaMeses = (f, n) => { const d = new Date(f); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const dias = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
  function calcDev(x, tipo) {
    const ini = x.ini || x.solic || '', venc = ini ? sumaMeses(ini, 6) : '', fin = x.estado === 'Cobrada' ? (x.cobro || hoy()) : hoy();
    const retraso = venc && x.estado !== 'Denegada' ? Math.max(0, dias(venc, fin)) : 0, imp = num(x.imp);
    const interes = r2(imp * (tipo / 100) * retraso / 365);
    let est;
    if (x.estado === 'Denegada') est = ['nd', 'Denegada'];
    else if (!ini) est = ['nd', 'Falta la fecha de inicio del plazo'];
    else if (x.estado === 'Cobrada') est = retraso > 0 ? ['aviso', `Cobrada con ${retraso} días de retraso: reclamar intereses`] : ['ok', 'Cobrada en plazo'];
    else est = retraso > 0 ? ['ko', `Plazo vencido hace ${retraso} días: reclamar intereses`] : ['nd', `Dentro de plazo (${-dias(venc, hoy())} días)`];
    return { venc, retraso, interes, est };
  }
  function sugerenciasDev() {
    const ej = Number(S.ejercicio), e = empresa(), per = e?.tipo === 'GE' ? '12' : '4T', out = [], ya = new Set(itemsDev().map((x) => x.concepto));
    const liq = prsVal(ej, '303', per, 'liq');
    if (liq !== undefined && liq !== null && liq < 0) { const c = `IVA 303 ${per} ${ej}`; if (!ya.has(c)) out.push({ concepto: c, imp: money(-liq) }); }
    const is = prsVal(ej + 1, '200', 'A', 'res');
    if (is !== undefined && is !== null && is < 0) { const c = `Impuesto sobre Sociedades ${ej}`; if (!ya.has(c)) out.push({ concepto: c, imp: money(-is) }); }
    return out;
  }
  function vistaDev() {
    if (!S.sel) return sel();
    const tipo = Number(datosDev().tipo ?? TIPO_DEMORA), items = itemsDev(), ed = puede?.() !== false, sug = sugerenciasDev();
    const tit = `Devoluciones pendientes · ${esc(empresa()?.nombre ?? '')}`;
    const intro = 'Seguimiento de las devoluciones solicitadas a la AEAT (IVA, Impuesto sobre Sociedades…). La AEAT tiene seis meses para devolver; pasado ese plazo se pueden reclamar intereses de demora. Escribe cada devolución y la app calcula el vencimiento, los días de retraso y los intereses orientativos.';
    const c = items.map((x) => ({ x, k: calcDev(x, tipo) }));
    const venc = c.filter((y) => y.k.est[0] === 'ko').length, pend = r2(c.filter((y) => y.x.estado === 'Pendiente').reduce((s, y) => s + num(y.x.imp), 0));
    const campo = (i, f, v, tp = 'text', ancho = '') => (ed ? `<input data-dv="${f}" data-i="${i}" type="${tp}" value="${esc(v ?? '')}" style="${ancho}">` : esc(v ?? ''));
    const filas = c.map(({ x, k }, i) => `<tr><td>${campo(i, 'concepto', x.concepto, 'text', 'min-width:11rem')}</td><td>${campo(i, 'imp', x.imp, 'text', 'width:7rem;text-align:right')}</td><td>${campo(i, 'solic', x.solic, 'date')}</td><td>${campo(i, 'ini', x.ini, 'date')}</td>
      <td>${ed ? `<select data-dv="estado" data-i="${i}">${['Pendiente', 'Cobrada', 'Denegada'].map((o) => `<option${o === x.estado ? ' selected' : ''}>${o}</option>`).join('')}</select>` : esc(x.estado)}</td><td>${campo(i, 'cobro', x.cobro, 'date')}</td>
      <td>${esc(fd(k.venc)) || '—'}</td><td style="text-align:right">${k.retraso || ''}</td><td style="text-align:right">${k.interes ? money(k.interes) : ''}</td><td>${ins(k.est[0], k.est[1])}</td>${ed ? `<td><button class="small danger" data-act="m-devdel" data-i="${i}">Quitar</button></td>` : ''}</tr>`).join('');
    return caja(tit, intro, `<p class="dash-s">${venc ? `<span class="d-ko">${venc} devolución(es) con el plazo vencido</span> · ` : ''}Pendiente de cobro: <b>${money(pend)}</b> · ${items.length} devolución(es)</p>
      ${sug.length && ed ? `<p class="dash-s">Sugerencias según lo presentado: ${sug.map((s, i) => `<button class="small" data-act="m-devsug" data-i="${i}">Añadir ${esc(s.concepto)} (${s.imp} €)</button>`).join(' ')}</p>` : ''}
      ${ed ? '<p><button class="btn" data-act="m-devadd">Añadir devolución</button></p>' : ''}
      ${items.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Concepto</th><th>Importe solicitado</th><th>Fecha de solicitud</th><th>Inicio del plazo de 6 meses</th><th>Estado</th><th>Fecha de cobro</th><th>Vence</th><th>Días de retraso</th><th>Intereses orientativos</th><th>Situación</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${filas}</tbody></table></div>` : '<p class="vacio">Todavía no hay devoluciones anotadas.</p>'}
      <p class="dash-s">Tipo de interés de demora (%): ${ed ? `<input data-dv="tipo" value="${esc(String(tipo).replace('.', ','))}" style="width:5rem;text-align:right">` : esc(String(tipo))} <span class="hint">Orientativo: pon el tipo vigente (el último que conozco es 4,0625 %). El plazo de seis meses se cuenta desde el final del plazo de presentación de la declaración, o desde que se presentó si fue después: escribe esa fecha en «Inicio del plazo»; si la dejas vacía se usa la fecha de solicitud.</span></p>`);
  }
  // Un campo de fecha lanza «change» en cuanto lo escrito a mano es una fecha válida (p. ej. al teclear el año): guardar y repintar entonces borraba lo que se estaba escribiendo. Mientras tenga el foco se espera a que salga del campo
  const guardaDev = (t) => {
    const f = t.dataset.dv, i = Number(t.dataset.i);
    guardarReg('devol', S.sel, (d) => {
      if (f === 'tipo') { d.tipo = num(t.value) || TIPO_DEMORA; return; }
      d.items ??= []; if (d.items[i]) d.items[i][f] = t.value;
    }).then((err) => { if (err) alert(`No se ha podido guardar: ${err}`); render(); });
  };
  document.addEventListener('change', (ev) => { const t = ev.target; if (!t?.dataset?.dv) return; if (t.type === 'date' && document.activeElement === t) return; guardaDev(t); });
  document.addEventListener('focusout', (ev) => { const t = ev.target; if (t?.dataset?.dv && t.type === 'date' && t.value !== String(itemsDev()[Number(t.dataset.i)]?.[t.dataset.dv] ?? '')) guardaDev(t); });

  // =====================================================================================
  // 21 · Facturas simplificadas
  // =====================================================================================
  function vistaSimpl() {
    if (!S.sel) return sel();
    const E = grande('sii-E'), R = grande('sii-R'); if (!E || !R) return cargando;
    const ej = Number(S.ejercicio), tit = `Facturas simplificadas · ${esc(empresa()?.nombre ?? '')} · ${ej}`;
    const intro = 'Una factura simplificada (tipo F2 del SII) solo vale hasta 400 € IVA incluido, o hasta 3.000 € en los casos del Reglamento de facturación (venta al por menor, hostelería, transporte de viajeros, aparcamiento, etc.). Por encima, hay que emitir factura completa con los datos del destinatario. En las recibidas, una simplificada por encima del límite o sin NIF puede impedir deducir la cuota.';
    const F = [['Emitidas', E], ['Recibidas', R]].flatMap(([lado, lib]) => lib.filter((l) => /^(F2|R5)/i.test(String(l.tipo ?? '')) && String(l.fecha ?? l.ej ?? '').slice(0, 4) === String(ej)).map((l) => ({ lado, l, total: r2((Number(l.base) || 0) + (Number(l.cuota) || 0)) })));
    if (!F.length) return caja(tit, intro, `<p class="dash-s"><span class="d-nd">• No hay facturas simplificadas (F2) en los libros del SII de ${ej}</span></p><p class="hint">Se leen de los libros SII cargados (emitidas y recibidas), que son los que traen el tipo de factura.</p>`);
    const ev = (x) => { const t = Math.abs(x.total); if (t > 3000) return ['ko', 'Supera 3.000 €: no puede ser simplificada']; if (t > 400) return ['aviso', 'Supera 400 €: solo vale en actividades con límite de 3.000 €']; if (x.lado === 'Recibidas' && !nifN(x.l.nif)) return ['aviso', 'Sin NIF del emisor: revisa la deducción']; return ['ok', 'Dentro del límite']; };
    const filas = F.map((x) => ({ ...x, e: ev(x) })).sort((a, b) => ({ ko: 0, aviso: 1, ok: 2 })[a.e[0]] - ({ ko: 0, aviso: 1, ok: 2 })[b.e[0]] || Math.abs(b.total) - Math.abs(a.total));
    const ko = filas.filter((x) => x.e[0] === 'ko').length, av = filas.filter((x) => x.e[0] === 'aviso').length, vis = filas.filter((x) => x.e[0] !== 'ok');
    return caja(tit, intro, `<p class="dash-s">${ko ? `<span class="d-ko">${ko} por encima de 3.000 €</span> · ` : ''}${av ? `<span class="d-nd">${av} por encima de 400 € o sin NIF</span> · ` : ''}${F.length} simplificadas en el ejercicio</p>
      ${vis.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Libro</th><th>Factura</th><th>Fecha</th><th>Tipo</th><th>NIF</th><th>Nombre</th><th>Base</th><th>Cuota</th><th>Total</th><th>Aviso</th></tr></thead><tbody>
      ${vis.slice(0, 400).map((x) => `<tr><td>${x.lado}</td><td>${esc(x.l.factura)}</td><td>${esc(fd(x.l.fecha))}</td><td>${esc(x.l.tipo)}</td><td>${esc(x.l.nif)}</td><td>${esc(x.l.nombre)}</td><td style="text-align:right">${money(x.l.base)}</td><td style="text-align:right">${money(x.l.cuota)}</td><td style="text-align:right"><b>${money(x.total)}</b></td><td>${ins(x.e[0], x.e[1])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dash-s"><span class="d-ok">✓ Todas las simplificadas están dentro del límite</span></p>'}
      <p class="hint">Importe = base + cuota. El límite de 3.000 € depende de la actividad: la app no la conoce, por eso entre 400 y 3.000 € es solo un aviso. No se revisan las rectificativas de simplificadas más allá de su importe.</p>`);
  }

  return {
    tabs: {
      camblib: ['Cambios en libros', 'Facturas cambiadas en periodos con el 303 ya presentado', vistaCambios],
      plazoded: ['Plazo de deducción', 'Facturas recibidas registradas con mucho retraso (límite de 4 años)', vistaPlazo],
      devol: ['Devoluciones pendientes', 'Seguimiento de devoluciones solicitadas a la AEAT e intereses de demora', vistaDev],
      simpl: ['Facturas simplificadas', 'Simplificadas (F2) por encima de 400 € o 3.000 €', vistaSimpl],
    },
    acciones: {
      'm-cbrev': (d) => { guardarReg('camblib', S.sel, (x) => { const e = x.e?.[Number(d.i)]; if (e) e.rev = !e.rev; }).then(() => render()); },
      'm-pdmeses': (d) => { mesesAviso = Number(d.n) || 6; render(); },
      'm-devadd': () => { guardarReg('devol', S.sel, (x) => { (x.items ??= []).push({ concepto: '', imp: '', solic: '', ini: '', estado: 'Pendiente', cobro: '' }); }).then(() => render()); },
      'm-devdel': (d) => { if (!confirm('¿Quitar esta devolución del seguimiento?')) return; guardarReg('devol', S.sel, (x) => { x.items = (x.items ?? []).filter((_, j) => j !== Number(d.i)); }).then(() => render()); },
      'm-devsug': (d) => { const s = sugerenciasDev()[Number(d.i)]; if (!s) return; guardarReg('devol', S.sel, (x) => { (x.items ??= []).push({ concepto: s.concepto, imp: s.imp, solic: '', ini: '', estado: 'Pendiente', cobro: '' }); }).then(() => render()); },
    },
    registrarCambios,
    _t: { calcDev, periodoDe },
  };
}
