// Bloque 12 · Pestaña «Transacciones» (proveedores): seguimiento de las partidas pendientes del ERP.
// Se carga el Excel «Informe de transacciones de proveedor» (una hoja por proveedor) a una fecha. Cada carga es una foto fechada y NUNCA borra nada:
//  · las partidas que ya no salen en el listado nuevo se proponen como saldadas y las confirma el usuario;
//  · el usuario también puede marcar a mano cada partida (Pendiente / En curso / Subsanada) con su nota;
//  · queda constancia de lo que había (primera vez que se vio), de lo que se arregló (fecha, quién, nota) y de cada carga.
// Se guarda un registro por empresa de tipo «fact-tprov» (comparte las protecciones de los libros grandes). Filas: t:'c' carga, t:'p' proveedor, t:'l' partida.
export function crearTransProv({ S, esc, render, empresa, puede, grande, reemplazarGrande }) {
  const TIPO = 'fact-tprov';
  const P = { msg: '', q: '', f: 'abiertas', cargando: false, abre: new Set(), hist: false };
  const txt = (v) => String(v ?? '').trim();
  const sinAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fm = (n) => (Math.abs(n) < 0.005 ? '0,00' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fd = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const quien = () => S.perfil?.nombre || S.perfil?.email || '';
  const ESTADOS = [['pend', 'Pendiente'], ['curso', 'En curso'], ['sub', 'Subsanada']];
  const nEst = (e) => ESTADOS.find((x) => x[0] === e)?.[1] ?? e;

  // ---------- lectura del Excel ----------
  const iso = (v) => {
    if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const m = String(v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  };
  const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0);
  const ETQ = { 'proveedor:': 'cod', 'nombre:': 'nombre', 'teléfono/móvil:': 'tel', 'email:': 'email', 'forma de pago:': 'pago', 'condiciones de pago:': 'cond' };
  function leerHoja(ws) {
    const a = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const prov = { t: 'p' }; let fecha = '', col = null; const lin = [];
    a.slice(0, 7).forEach((r) => r.forEach((c) => { if (!fecha && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(txt(c))) fecha = iso(txt(c)); }));
    for (const r of a) {
      const c0 = txt(r[0]).toLowerCase();
      if (c0 === 'fecha' && r.some((c) => txt(c).toLowerCase() === 'asiento')) { col = {}; r.forEach((c, i) => { const k = txt(c).toLowerCase(); if (k && col[k] === undefined) col[k] = i; }); continue; }
      if (!col) { r.forEach((c, i) => { const k = ETQ[txt(c).toLowerCase()]; if (k && !prov[k]) { const v = r.slice(i + 1).find((x) => txt(x) !== ''); if (v !== undefined) prov[k] = txt(v); } }); continue; }
      const f = iso(r[col.fecha]); if (!f) continue; // la línea de totales no lleva fecha
      lin.push({ t: 'l', f, asiento: txt(r[col.asiento]), factura: txt(r[col.factura]), fdoc: iso(r[col['fecha de documento']]), desc: txt(r[col['descripción']]), vto: iso(r[col['fecha de vencimiento']]),
        deb: r2(num(r[col['débito']])), cre: r2(num(r[col['crédito']])), pago: txt(r[col['forma de pago']]), divisa: txt(r[col.divisa]) });
    }
    return { prov, lin, fecha };
  }
  async function leerExcel(file) {
    if (!window.XLSX) throw new Error('No se cargó la librería de Excel. Recarga la página.');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const hojas = wb.SheetNames.map((n) => leerHoja(wb.Sheets[n])).filter((h) => h.prov.cod);
    if (!hojas.length) throw new Error('No reconozco el listado: cada hoja debe empezar con «Proveedor:», «Nombre:»… y la tabla «Fecha · Asiento · Factura…».');
    return { hojas, fecha: hojas.find((h) => h.fecha)?.fecha || hoy() };
  }

  // ---------- fusión con lo que ya había ----------
  function fusionar(L, { hojas, fecha }, archivo) {
    const antes = L.filter((x) => x.t === 'l'), idx = new Map(antes.map((x) => [x.k, x]));
    const vistas = new Set(), nuevas = [], u = quien();
    let nNue = 0, nDes = 0, nVuelve = 0;
    const provs = new Map(L.filter((x) => x.t === 'p').map((x) => [x.cod, x]));
    for (const h of hojas) {
      provs.set(h.prov.cod, { ...(provs.get(h.prov.cod) ?? {}), ...h.prov });
      const rep = new Map();
      for (const l of h.lin) {
        const base = `${h.prov.cod}|${l.asiento}|${l.factura}|${l.deb}|${l.cre}|${l.f}`; const n = (rep.get(base) ?? 0) + 1; rep.set(base, n);
        const k = n > 1 ? `${base}#${n}` : base; vistas.add(k);
        const o = idx.get(k);
        if (o) {
          const x = { ...o, ult: fecha, vto: l.vto || o.vto };
          if (x.desap) { delete x.desap; nVuelve++; x.hist = [...x.hist, { f: hoy(), u, a: `Vuelve a salir en el listado del ${fd(fecha)}` }]; if (x.estado === 'sub') { x.estado = 'pend'; delete x.fres; } }
          nuevas.push(x);
        } else { nNue++; nuevas.push({ ...l, k, cod: h.prov.cod, estado: 'pend', nota: '', pri: fecha, ult: fecha, hist: [{ f: hoy(), u, a: `Aparece en el listado del ${fd(fecha)}` }] }); }
      }
    }
    for (const o of antes) {
      if (vistas.has(o.k)) continue;
      if (o.estado === 'sub' || o.desap) { nuevas.push(o); continue; }
      nDes++; nuevas.push({ ...o, desap: fecha, hist: [...o.hist, { f: hoy(), u, a: `Ya no sale en el listado del ${fd(fecha)}: propuesta como saldada` }] });
    }
    const abiertas = nuevas.filter((x) => x.estado !== 'sub' && !x.desap);
    const carga = { t: 'c', id: Date.now(), f: fecha, archivo, u, el: hoy(), nProv: hojas.length, nLin: hojas.reduce((s, h) => s + h.lin.length, 0), nNue, nDes, nVuelve,
      saldo: r2(abiertas.reduce((s, x) => s + x.deb - x.cre, 0)), antes: antes.length };
    return [...L.filter((x) => x.t === 'c'), carga, ...provs.values(), ...nuevas];
  }

  async function cargar(files) {
    if (P.cargando || !S.sel) return;
    P.cargando = true; P.msg = 'Leyendo el Excel…'; render();
    try {
      const f = files[0], r = await leerExcel(f), L = grande(TIPO) ?? [];
      const ult = L.filter((x) => x.t === 'c').map((x) => x.f).sort().pop();
      if (ult && r.fecha < ult && !confirm(`Este listado es del ${fd(r.fecha)} y ya hay una carga más reciente (${fd(ult)}). ¿Cargarlo igualmente? Las partidas que no salgan en él se propondrán como saldadas.`)) { P.cargando = false; P.msg = 'Carga cancelada.'; return render(); }
      const nl = fusionar(L, r, f.name);
      P.msg = 'Guardando…'; render();
      const ok = await reemplazarGrande(TIPO, S.sel, nl);
      const c = nl.filter((x) => x.t === 'c').pop();
      P.msg = ok === false ? 'No se pudo guardar (mira el aviso).' : `✓ Listado del ${fd(r.fecha)} guardado: ${c.nProv} proveedores, ${c.nLin} partidas · ${c.nNue} nuevas · ${c.nDes} por confirmar como saldadas.`;
    } catch (err) { P.msg = `✖ ${err.message}`; }
    P.cargando = false; render();
  }

  // ---------- cambios a mano ----------
  async function cambiar(k, fn, msg) {
    const L = grande(TIPO) ?? [], u = quien(), d = hoy();
    await reemplazarGrande(TIPO, S.sel, L.map((x) => (x.t === 'l' && x.k === k ? fn(x, u, d) : x)));
    if (msg) { P.msg = msg; render(); }
  }
  const poner = (x, est, u, d, extra) => {
    const y = { ...x, estado: est, hist: [...x.hist, { f: d, u, a: extra || `Marcada «${nEst(est)}»` }] }; delete y.desap;
    if (est === 'sub') y.fres = d; else delete y.fres; return y;
  };
  const marcar = (k, est) => cambiar(k, (x, u, d) => (x.estado === est && !x.desap ? x : poner(x, est, u, d)));
  const nota = (k, v) => cambiar(k, (x, u, d) => (x.nota === v ? x : { ...x, nota: v, hist: [...x.hist, { f: d, u, a: `Nota: ${v || '(vacía)'}` }] }));
  const confirmar = (k) => cambiar(k, (x, u, d) => poner(x, 'sub', u, d, 'Confirmada como saldada en el ERP (ya no salía en el listado)'));
  const mantener = (k) => cambiar(k, (x, u, d) => { const y = { ...x, hist: [...x.hist, { f: d, u, a: 'Se mantiene pendiente (no se confirma la saldada)' }] }; delete y.desap; return y; });
  async function masivo(cod, que) { // que: 'confirmar' | 'mantener' | 'sub'
    const L = grande(TIPO) ?? [], u = quien(), d = hoy();
    const sel = (x) => x.t === 'l' && (!cod || x.cod === cod) && (que === 'sub' ? x.estado !== 'sub' : !!x.desap && x.estado !== 'sub');
    const n = L.filter(sel).length; if (!n) return;
    const txtq = que === 'mantener' ? `¿Mantener pendientes ${n} partidas?` : `¿Marcar como subsanadas ${n} partidas${cod ? '' : ' de todos los proveedores'}?`;
    if (!confirm(txtq)) return;
    await reemplazarGrande(TIPO, S.sel, L.map((x) => (!sel(x) ? x : que === 'mantener' ? (() => { const y = { ...x, hist: [...x.hist, { f: d, u, a: 'Se mantiene pendiente (no se confirma la saldada)' }] }; delete y.desap; return y; })()
      : poner(x, 'sub', u, d, que === 'confirmar' ? 'Confirmada como saldada en el ERP (ya no salía en el listado)' : undefined))));
    P.msg = `✓ ${n} partidas actualizadas.`; render();
  }

  // ---------- Excel de seguimiento ----------
  function descargar() {
    const L = grande(TIPO) ?? []; if (!L.length || !window.XLSX) return;
    const pv = new Map(L.filter((x) => x.t === 'p').map((x) => [x.cod, x]));
    const est = (x) => (x.desap ? 'Por confirmar (ya no sale)' : nEst(x.estado));
    const hoja1 = L.filter((x) => x.t === 'l').sort((a, b) => a.cod.localeCompare(b.cod) || a.f.localeCompare(b.f)).map((x) => ({ Proveedor: x.cod, Nombre: pv.get(x.cod)?.nombre ?? '', Fecha: fd(x.f), Asiento: x.asiento, Factura: x.factura, Descripción: x.desc, Vencimiento: fd(x.vto),
      Débito: x.deb, Crédito: x.cre, Estado: est(x), 'Visto por 1.ª vez': fd(x.pri), 'Último listado': fd(x.ult), 'Fecha subsanada': fd(x.fres), Nota: x.nota, Historial: x.hist.map((h) => `${fd(h.f)} ${h.u}: ${h.a}`).join(' | ') }));
    const hoja2 = L.filter((x) => x.t === 'c').map((c) => ({ 'Fecha del listado': fd(c.f), Archivo: c.archivo, 'Cargado el': fd(c.el), Por: c.u, Proveedores: c.nProv, Partidas: c.nLin, Nuevas: c.nNue, 'Propuestas saldadas': c.nDes, 'Saldo abierto': c.saldo }));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(hoja1), 'Partidas');
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(hoja2), 'Cargas');
    window.XLSX.writeFile(wb, `Seguimiento transacciones proveedores ${hoy()}.xlsx`);
  }

  // ---------- vista ----------
  const zona = () => (puede() ? `<div class="dropzone" data-ttdz tabindex="0" role="button"><b>Suelta aquí el Excel «Informe de transacciones de proveedor»</b> (una hoja por proveedor) o pulsa para elegirlo. Cada carga se guarda como una foto fechada: lo que ya no salga se propone como saldado y lo confirmas tú.<input type="file" data-ttfile accept=".xlsx,.xls" hidden></div>` : '');
  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const L = grande(TIPO); if (!L) return '<p class="vacio">Cargando datos…</p>';
    const e = empresa(), ed = puede();
    const cargas = L.filter((x) => x.t === 'c').sort((a, b) => a.id - b.id), ult = cargas[cargas.length - 1];
    const lin = L.filter((x) => x.t === 'l'), pv = new Map(L.filter((x) => x.t === 'p').map((x) => [x.cod, x]));
    const ref = ult?.f ?? hoy(), tot = lin.length, sub = lin.filter((x) => x.estado === 'sub').length, porConf = lin.filter((x) => x.desap && x.estado !== 'sub');
    const ab = lin.filter((x) => x.estado !== 'sub' && !x.desap), sAb = r2(ab.reduce((s, x) => s + x.deb - x.cre, 0)), sIni = cargas.length ? cargas[0].saldo : 0;
    const q = sinAc(P.q).trim();
    const porProv = new Map(); lin.forEach((x) => { (porProv.get(x.cod) ?? porProv.set(x.cod, []).get(x.cod)).push(x); });
    const filas = [...porProv.entries()].map(([cod, ls]) => {
      const a = ls.filter((x) => x.estado !== 'sub' && !x.desap), saldo = r2(a.reduce((s, x) => s + x.deb - x.cre, 0)), pc = ls.filter((x) => x.desap && x.estado !== 'sub').length;
      const venc = saldo < -0.005 ? Math.min(-saldo, r2(a.filter((x) => x.cre > 0 && x.vto && x.vto < ref).reduce((s, x) => s + x.cre, 0))) : 0;
      const est = pc ? ['Por confirmar', 'warn'] : !a.length ? ['Subsanado', 'ok'] : Math.abs(saldo) < 0.005 ? ['Saldo 0: falta compensar', 'acc'] : saldo > 0 ? ['Pagos sin factura / saldo deudor', 'warn'] : ['Pendiente de pago', 'acc'];
      return { cod, ls: ls.sort((x, y) => x.f.localeCompare(y.f) || x.asiento.localeCompare(y.asiento)), a, saldo, pc, venc, est, nombre: pv.get(cod)?.nombre ?? '', deb: r2(a.reduce((s, x) => s + x.deb, 0)), cre: r2(a.reduce((s, x) => s + x.cre, 0)) };
    }).filter((p) => (P.f === 'abiertas' ? p.a.length : P.f === 'conf' ? p.pc : P.f === 'sub' ? p.ls.some((x) => x.estado === 'sub') : true)).sort((x, y) => x.cod.localeCompare(y.cod));
    const pill = (t, k) => `<span class="pill" style="background:var(--bg-${k === 'ok' ? 'success' : k === 'warn' ? 'warning' : 'accent'},#eee);color:var(--text-${k === 'ok' ? 'success' : k === 'warn' ? 'warning' : 'accent'},#333);cursor:default">${esc(t)}</span>`;
    const tarj = (t, v, c = '') => `<div style="background:var(--surface-1,#f4f5f7);border-radius:8px;padding:.5rem .8rem;min-width:9rem"><div style="font-size:.75rem;opacity:.7">${t}</div><div style="font-size:1.3rem;font-weight:600;${c}">${v}</div></div>`;
    const detalle = (p) => {
      const h = pv.get(p.cod) ?? {};
      const fl = p.ls.filter((x) => (P.f === 'sub' ? x.estado === 'sub' : true)).map((x) => {
        const est = x.desap ? `<span class="d-ko">Por confirmar</span> ${ed ? `<button class="pill" data-ttact="ok|${esc(x.k)}">✔ Saldada</button> <button class="pill" data-ttact="no|${esc(x.k)}">Sigue pendiente</button>` : ''}`
          : ed ? `<select data-ttest="${esc(x.k)}">${ESTADOS.map(([v, t]) => `<option value="${v}"${x.estado === v ? ' selected' : ''}>${t}</option>`).join('')}</select>` : esc(nEst(x.estado));
        const hist = x.hist.map((y) => `${fd(y.f)} · ${y.u}: ${y.a}`).join('\n');
        return `<tr${x.estado === 'sub' ? ' style="opacity:.6"' : ''}><td>${fd(x.f)}</td><td>${esc(x.asiento)}</td><td>${esc(x.factura)}</td><td>${esc(x.desc)}</td><td>${fd(x.vto)}</td><td class="num n">${x.deb ? fm(x.deb) : ''}</td><td class="num n">${x.cre ? fm(x.cre) : ''}</td>
          <td>${est}</td><td>${ed ? `<input data-ttnota="${esc(x.k)}" value="${esc(x.nota)}" placeholder="Qué has arreglado en el ERP" style="width:15rem">` : esc(x.nota)}</td>
          <td class="hint" title="${esc(hist)}" style="white-space:nowrap">${x.fres ? `✔ ${fd(x.fres)}` : `desde ${fd(x.pri)}`} ⓘ</td></tr>`;
      }).join('');
      return `<tr data-ttd="${esc(p.cod)}" data-b="${esc(sinAc(`${p.cod} ${p.nombre} ${p.ls.map((x) => `${x.factura} ${x.desc}`).join(' ')}`))}"><td colspan="9" style="background:var(--surface-1,#f7f8fa);padding:.4rem .8rem">
        <div class="hint" style="margin-bottom:.3rem">${[h.pago && `Forma de pago: ${h.pago}`, h.cond && `Condiciones: ${h.cond}`, h.tel && `Tel.: ${h.tel}`, h.email && h.email].filter(Boolean).map(esc).join(' · ')}
          ${ed ? ` <button class="pill" data-ttact="provsub|${esc(p.cod)}">Marcar todas subsanadas</button>${p.pc ? ` <button class="pill" data-ttact="provok|${esc(p.cod)}">✔ Confirmar las ${p.pc} saldadas</button>` : ''}` : ''}</div>
        <table class="tabla"><thead><tr><th>Fecha</th><th>Asiento</th><th>Factura</th><th>Descripción</th><th>Vto.</th><th>Débito</th><th>Crédito</th><th>Estado</th><th>Nota</th><th>Historial</th></tr></thead><tbody>${fl}</tbody></table></td></tr>`;
    };
    const cuerpo = filas.map((p) => {
      const b = sinAc(`${p.cod} ${p.nombre} ${p.ls.map((x) => `${x.factura} ${x.desc}`).join(' ')}`), abierto = P.abre.has(p.cod), oculto = q && !b.includes(q);
      return `<tr data-b="${esc(b)}" data-ttp="${esc(p.cod)}" style="cursor:pointer${oculto ? ';display:none' : ''}"><td>${abierto ? '▾' : '▸'}</td><td>${esc(p.cod)}</td><td>${esc(p.nombre)}</td><td class="num n">${p.a.length}/${p.ls.length}</td><td class="num n">${fm(p.deb)}</td><td class="num n">${fm(p.cre)}</td>
        <td class="num n"><b>${fm(p.saldo)}</b></td><td class="num n">${p.venc ? `<span class="d-ko">${fm(p.venc)}</span>` : ''}</td><td>${pill(p.est[0], p.est[1])}</td></tr>${abierto ? detalle(p).replace('<tr data-ttd', `<tr${oculto ? ' style="display:none"' : ''} data-ttd`) : ''}`;
    }).join('');
    const banner = porConf.length ? `<div style="background:var(--bg-warning,#fff6e0);border-radius:8px;padding:.5rem .8rem;margin:.4rem 0"><b>${porConf.length} partidas ya no salen en el último listado</b> (${fd(ult?.f)}): parece que las has saldado en el ERP. ${ed ? `<button class="small primary" data-ttact="confirmar|">✔ Confirmar todas como saldadas</button> <button class="small" data-ttact="mantener|">Siguen pendientes</button> <button class="small" data-ttact="ver|conf">Revisarlas una a una</button>` : ''}</div>` : '';
    const histCargas = P.hist ? `<table class="tabla"><thead><tr><th>Listado del</th><th>Archivo</th><th>Cargado</th><th>Por</th><th>Proveedores</th><th>Partidas</th><th>Nuevas</th><th>Propuestas saldadas</th><th>Saldo abierto</th></tr></thead><tbody>${[...cargas].reverse().map((c) => `<tr><td>${fd(c.f)}</td><td>${esc(c.archivo)}</td><td>${fd(c.el)}</td><td>${esc(c.u)}</td><td class="num n">${c.nProv}</td><td class="num n">${c.nLin}</td><td class="num n">${c.nNue}</td><td class="num n">${c.nDes}</td><td class="num n">${fm(c.saldo)}</td></tr>`).join('')}</tbody></table>
      <h4 style="margin:.6rem 0 .2rem">Últimos movimientos de seguimiento</h4><table class="tabla"><thead><tr><th>Fecha</th><th>Quién</th><th>Proveedor</th><th>Factura / descripción</th><th>Qué se hizo</th></tr></thead><tbody>${lin.flatMap((x) => x.hist.map((h) => ({ ...h, x }))).filter((h) => !/^Aparece/.test(h.a)).sort((a, b) => b.f.localeCompare(a.f)).slice(0, 40).map((h) => `<tr><td>${fd(h.f)}</td><td>${esc(h.u)}</td><td>${esc(h.x.cod)} ${esc(pv.get(h.x.cod)?.nombre ?? '')}</td><td>${esc(h.x.factura || h.x.desc)}</td><td>${esc(h.a)}</td></tr>`).join('')}</tbody></table>` : '';
    const opt = (v, t) => `<option value="${v}"${P.f === v ? ' selected' : ''}>${t}</option>`;
    return `<div class="inicio m347 tercero ttp tercero-pag"><div class="tercero-top"><section class="dsec m347-fijo"><h3>Transacciones de proveedores · ${esc(e?.nombre ?? '')}${ult ? ` · listado del ${fd(ult.f)}` : ''}</h3>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin:.3rem 0">${tarj('Pendiente al inicio', fm(sIni), '')}${tarj('Saldo abierto ahora', fm(sAb))}${tarj('Subsanadas', `${sub} de ${tot}`, 'color:var(--text-success,#2a7a3b)')}${tarj('% resuelto', tot ? `${Math.round((sub / tot) * 100)} %` : '—')}${tarj('Por confirmar', porConf.length, porConf.length ? 'color:var(--text-warning,#b26a00)' : '')}</div>
      <div class="m347-bar"><select data-ttf>${opt('abiertas', 'Con partidas abiertas')}${opt('conf', 'Por confirmar')}${opt('sub', 'Con partidas subsanadas')}${opt('todos', 'Todos los proveedores')}</select>
        <input type="search" data-ttq placeholder="🔍 Buscar proveedor, factura, descripción…" value="${esc(P.q)}" autocomplete="off">
        <button class="small no-print" data-ttact="hist|">${P.hist ? 'Ocultar' : 'Ver'} cargas y movimientos</button><button class="small no-print" data-ttact="xls|">⬇ Excel de seguimiento</button></div>
      ${banner}${zona()}${P.msg ? `<p class="dash-s" style="font-size:.8rem;margin:.2rem 0 0">${esc(P.msg)}</p>` : ''}${histCargas}</section></div>
      <div class="tercero-tabla"><table class="tabla"><thead><tr><th></th><th>Código</th><th>Proveedor</th><th>Abiertas</th><th>Débito</th><th>Crédito</th><th>Saldo</th><th>Vencido</th><th>Estado</th></tr></thead>
        <tbody>${cuerpo || `<tr><td colspan="9">${tot ? 'Nada con ese filtro.' : 'Sin transacciones cargadas: suelta el Excel arriba.'}</td></tr>`}</tbody></table></div>
      <p class="hint tercero-nota">Saldo = débito − crédito de las partidas abiertas (negativo: se le debe al proveedor; positivo: pagos sin factura o saldo a nuestro favor). «Vencido» = crédito con vencimiento anterior a la fecha del listado. Las partidas nunca se borran: las subsanadas quedan con su fecha, quién las marcó y su nota.</p></div>`;
  }

  // ---------- eventos ----------
  document.addEventListener('click', (ev) => {
    const z = ev.target.closest?.('[data-ttdz]'); if (z && !ev.target.closest('input')) { z.querySelector('input')?.click(); return; }
    const b = ev.target.closest?.('[data-ttact]');
    if (b) {
      const [a, k] = [b.dataset.ttact.slice(0, b.dataset.ttact.indexOf('|')), b.dataset.ttact.slice(b.dataset.ttact.indexOf('|') + 1)];
      if (a === 'ok') confirmar(k); else if (a === 'no') mantener(k); else if (a === 'confirmar') masivo('', 'confirmar'); else if (a === 'mantener') masivo('', 'mantener');
      else if (a === 'ver') { P.f = 'conf'; render(); } else if (a === 'hist') { P.hist = !P.hist; render(); } else if (a === 'xls') descargar();
      else if (a === 'provsub') masivo(k, 'sub'); else if (a === 'provok') masivo(k, 'confirmar');
      return;
    }
    const tr = ev.target.closest?.('tr[data-ttp]'); if (tr && !ev.target.closest('button,input,select')) { const c = tr.dataset.ttp; if (P.abre.has(c)) P.abre.delete(c); else P.abre.add(c); render(); }
  });
  document.addEventListener('change', (ev) => {
    const d = ev.target.dataset ?? {};
    if (d.ttfile !== undefined) { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) cargar(fs); }
    else if (d.ttf !== undefined) { P.f = ev.target.value; render(); }
    else if (d.ttest !== undefined) marcar(d.ttest, ev.target.value);
    else if (d.ttnota !== undefined) nota(d.ttnota, ev.target.value.trim());
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.dataset?.ttq === undefined) return;
    P.q = ev.target.value; const q = sinAc(P.q).trim();
    document.querySelectorAll('.ttp tbody tr[data-b]').forEach((tr) => { tr.style.display = !q || tr.dataset.b.includes(q) ? '' : 'none'; });
  });
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest?.('[data-ttdz]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { ev.target.closest?.('[data-ttdz]')?.classList.remove('over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest?.('[data-ttdz]'); if (!z || !puede()) return;
    ev.preventDefault(); ev.stopPropagation(); z.classList.remove('over');
    const fs = [...ev.dataTransfer.files].filter((f) => /\.xlsx?$/i.test(f.name)); if (fs.length) cargar(fs);
  }, true);
  return { tabs: { tprov: ['Transacciones', 'Pendientes y subsanación', vista] } };
}
