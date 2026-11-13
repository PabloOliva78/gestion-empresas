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
      lin.push({ t: 'l', f, asiento: txt(r[col.asiento]), factura: txt(r[col.factura]), fdoc: iso(r[col['fecha de documento']]), desc: txt(r[col['descripción']]), vto: iso(r[col['fecha de vencimiento']]), vtop: iso(r[col['fecha de vto. pagaré']]),
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

  // ---------- Exportar a Excel y a PDF (con estados y observaciones, para reenviarlo) ----------
  // cod vacío = todos los proveedores que se ven ahora en la tabla; con código = solo ese proveedor
  const estTxt = (x) => (x.desap ? 'Por confirmar' : x.estado === 'sub' ? 'Conciliado' : x.estado === 'curso' ? 'Revisado' : 'Pendiente');
  const sdTxt = (s) => (s > 0.005 ? 'Saldo deudor' : s < -0.005 ? 'Saldo acreedor' : 'Saldo 0');
  function datosExport(cod) {
    const L = grande(TIPO) ?? [], pv = new Map(L.filter((x) => x.t === 'p').map((x) => [x.cod, x]));
    const q = sinAc(P.q).trim(), cods = cod ? [cod] : (P.vis ?? []).filter((p) => !q || p.b.includes(q)).map((p) => p.cod);
    const bloques = cods.map((c) => {
      const ls = L.filter((x) => x.t === 'l' && x.cod === c).sort((a, b) => a.f.localeCompare(b.f) || a.asiento.localeCompare(b.asiento)), h = pv.get(c) ?? {};
      const ok = ls.length > 0 && ls.every((x) => x.estado === 'sub' && !x.desap);
      return { cod: c, h, ls, ok, deb: r2(ls.reduce((s, x) => s + x.deb, 0)), cre: r2(ls.reduce((s, x) => s + x.cre, 0)) };
    }).filter((b) => b.ls.length);
    return { bloques, cargas: L.filter((x) => x.t === 'c').sort((a, b) => a.id - b.id), emp: empresa()?.nombre ?? '' };
  }
  const nomFich = (D, cod) => `Transacciones proveedor ${cod ? `${cod} ${D.bloques[0]?.h.nombre ?? ''}` : D.emp} ${hoy()}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  function exportarExcel(cod) {
    const D = datosExport(cod); if (!D.bloques.length || !window.XLSX) return void (P.msg = 'No hay nada que exportar con el filtro actual.', render());
    const X = window.XLSX, cab = ['Proveedor', 'Nombre', 'Conciliado', 'Revisado', 'Fecha', 'Asiento', 'Factura', 'Fecha de documento', 'Descripción', 'Fecha de vencimiento', 'Fecha de vto. pagaré', 'Débito', 'Crédito', 'Saldo', 'Divisa', 'Forma de pago', 'Estado conciliación', 'Observaciones', 'Fecha conciliada', 'Historial'];
    const aoa = [];
    if (cod) { const b = D.bloques[0], h = b.h; aoa.push(['Proveedor:', b.cod, 'Nombre:', h.nombre ?? ''], ['Teléfono:', h.tel ?? '', 'Email:', h.email ?? ''], ['Forma de pago:', h.pago ?? '', 'Condiciones de pago:', h.cond ?? ''], ['Empresa:', D.emp, 'Seguimiento a:', fd(hoy())], []); }
    aoa.push(cab);
    for (const b of D.bloques) {
      for (const x of b.ls) aoa.push([b.cod, b.h.nombre ?? '', x.estado === 'sub' && !x.desap ? 'Sí' : '', x.estado !== 'pend' && !x.desap ? 'Sí' : '', fd(x.f), x.asiento, x.factura, fd(x.fdoc), x.desc, fd(x.vto), fd(x.vtop), x.deb || '', x.cre || '', r2(x.deb - x.cre), x.divisa, x.pago, estTxt(x), x.nota, fd(x.fres), x.hist.map((h) => `${fd(h.f)} ${h.u}: ${h.a}`).join(' | ')]);
      if (cod) aoa.push(['', '', '', '', '', '', '', '', 'Total proveedor', '', '', b.deb, b.cre, r2(b.deb - b.cre), 'EUR', '', sdTxt(r2(b.deb - b.cre))]);
    }
    const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = [10, 30, 10, 9, 11, 14, 14, 13, 44, 13, 13, 11, 11, 11, 7, 26, 16, 44, 13, 60].map((w) => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, cod ? 'Proveedor' : 'Partidas');
    if (!cod) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(D.cargas.map((c) => ({ 'Fecha del listado': fd(c.f), Archivo: c.archivo, 'Cargado el': fd(c.el), Por: c.u, Proveedores: c.nProv, Partidas: c.nLin, Nuevas: c.nNue, 'Propuestas saldadas': c.nDes, 'Saldo abierto': c.saldo }))), 'Cargas');
    X.writeFile(wb, nomFich(D, cod) + '.xlsx');
  }
  function exportarPdf(cod) {
    const D = datosExport(cod), J = window.jspdf?.jsPDF;
    if (!D.bloques.length) return void (P.msg = 'No hay nada que exportar con el filtro actual.', render());
    if (!J || typeof J.API?.autoTable !== 'function') return void (P.msg = '✖ No se cargó la librería de PDF. Recarga la página.', render());
    const doc = new J({ orientation: 'landscape', unit: 'mm', format: 'a4' }), pie = `${D.emp} · seguimiento de transacciones de proveedores a ${fd(hoy())}`;
    const fondo = { Conciliado: [225, 243, 230], Revisado: [255, 240, 204], 'Por confirmar': [255, 240, 204], Pendiente: [253, 228, 228] };
    D.bloques.forEach((b, i) => {
      let y = i ? (doc.lastAutoTable.finalY + 9) : 14;
      if (i && y > 150) { doc.addPage(); y = 14; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.setTextColor(...(b.ok ? [27, 127, 59] : [198, 40, 40]));
      doc.text(`Proveedor ${b.cod} · ${b.h.nombre ?? ''}${b.ok ? '  (conciliado)' : '  (pendiente)'}`, 8, y);
      doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(60);
      doc.text([b.h.pago && `Forma de pago: ${b.h.pago}`, b.h.cond && `Condiciones: ${b.h.cond}`, b.h.tel && `Tel.: ${b.h.tel}`, b.h.email].filter(Boolean).join('   ·   '), 8, y + 4.5);
      const sd = r2(b.deb - b.cre), v = (n) => (n ? fm(n) : '-');
      const body = b.ls.map((x) => { const e = estTxt(x); return [x.estado === 'sub' && !x.desap ? 'X' : '', x.estado !== 'pend' && !x.desap ? 'X' : '', fd(x.f), x.asiento, x.factura, fd(x.fdoc), x.desc, fd(x.vto), v(x.deb), v(x.cre), v(r2(x.deb - x.cre)), { content: e, styles: { fillColor: fondo[e] } }, x.nota + (x.fres ? `${x.nota ? ' ' : ''}[conciliada el ${fd(x.fres)}]` : '')]; });
      body.push([{ content: '', colSpan: 6 }, 'Total proveedor', '', v(b.deb), v(b.cre), v(sd), sdTxt(sd), ''].map((c) => (typeof c === 'object' ? c : { content: c })).map((c) => ({ ...c, styles: { ...(c.styles ?? {}), fontStyle: 'bold', fillColor: [232, 237, 248] } })));
      doc.autoTable({
        startY: y + 7, theme: 'grid', margin: { left: 8, right: 8, top: 12, bottom: 12 },
        head: [['Conc.', 'Rev.', 'Fecha', 'Asiento', 'Factura', 'F. documento', 'Descripción', 'F. vto.', 'Débito', 'Crédito', 'Saldo', 'Estado conciliación', 'Observaciones']], body,
        styles: { fontSize: 6.8, cellPadding: 1.1, overflow: 'linebreak', valign: 'middle', lineColor: [200, 200, 200], lineWidth: 0.1, textColor: 20 },
        headStyles: { fillColor: [20, 40, 106], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 6.6 },
        columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 19 }, 4: { cellWidth: 20 }, 5: { cellWidth: 17, halign: 'center' }, 7: { cellWidth: 16, halign: 'center' }, 8: { cellWidth: 17, halign: 'right' }, 9: { cellWidth: 17, halign: 'right' }, 10: { cellWidth: 17, halign: 'right' }, 11: { cellWidth: 23, halign: 'center' } },
        didDrawPage: () => { doc.setFont(undefined, 'normal'); doc.setFontSize(7); doc.setTextColor(110); doc.text(pie, 8, 205); doc.text(`Página ${doc.internal.getNumberOfPages()}`, 289, 205, { align: 'right' }); },
      });
    });
    doc.save(nomFich(D, cod) + '.pdf');
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
    const todas = [...porProv.entries()].map(([cod, ls]) => {
      const a = ls.filter((x) => x.estado !== 'sub' && !x.desap), saldo = r2(a.reduce((s, x) => s + x.deb - x.cre, 0)), pc = ls.filter((x) => x.desap && x.estado !== 'sub').length;
      const venc = saldo < -0.005 ? Math.min(-saldo, r2(a.filter((x) => x.cre > 0 && x.vto && x.vto < ref).reduce((s, x) => s + x.cre, 0))) : 0;
      const est = pc ? ['Por confirmar', 'warn'] : !a.length ? ['Subsanado', 'ok'] : Math.abs(saldo) < 0.005 ? ['Saldo 0: falta compensar', 'acc'] : saldo > 0 ? ['Pagos sin factura / saldo deudor', 'warn'] : ['Pendiente de pago', 'acc'];
      return { cod, ls: ls.sort((x, y) => x.f.localeCompare(y.f) || x.asiento.localeCompare(y.asiento)), a, saldo, pc, venc, est, nombre: pv.get(cod)?.nombre ?? '', deb: r2(a.reduce((s, x) => s + x.deb, 0)), cre: r2(a.reduce((s, x) => s + x.cre, 0)) };
    }).sort((x, y) => x.cod.localeCompare(y.cod));
    const filas = todas.filter((p) => (P.f === 'abiertas' ? p.a.length : P.f === 'conf' ? p.pc : P.f === 'sub' ? p.ls.some((x) => x.estado === 'sub') : true));
    P.vis = filas.map((p) => ({ cod: p.cod, b: sinAc(`${p.cod} ${p.nombre} ${p.ls.map((x) => `${x.factura} ${x.desc}`).join(' ')}`) })); // lo que se ve (para exportar)
    const vencTot =r2(todas.reduce((s, p) => s + p.venc, 0)), conAb = todas.filter((p) => p.a.length).length;
    const tot2 = filas.reduce((s, p) => ({ deb: s.deb + p.deb, cre: s.cre + p.cre, saldo: s.saldo + p.saldo, venc: s.venc + p.venc, n: s.n + p.a.length }), { deb: 0, cre: 0, saldo: 0, venc: 0, n: 0 });
    const pill = (t, k) => `<span class="tt-pill ${k}">${esc(t)}</span>`;
    const tarj = (t, v, c = '', s = '') => `<div class="tt-k"><div class="tt-kt">${t}</div><div class="tt-kv ${c}">${v}</div>${s ? `<div class="tt-ks">${s}</div>` : ''}</div>`;
    const detalle = (p) => {
      const h = pv.get(p.cod) ?? {}, dt = p.ls.reduce((s, x) => ({ deb: s.deb + x.deb, cre: s.cre + x.cre }), { deb: 0, cre: 0 }), sd = r2(dt.deb - dt.cre);
      const v = (n) => (n ? fm(n) : '-');
      const fl = p.ls.map((x) => {
        const conc = x.estado === 'sub' && !x.desap, rev = x.estado === 'curso' || conc, k = esc(x.k);
        const chk = (w, on) => (ed ? `<input type="checkbox" data-ttchk="${w}|${k}"${on ? ' checked' : ''}>` : (on ? '✓' : ''));
        const est = x.desap ? `<span class="tt-pill warn">Por confirmar</span>${ed ? ` <button class="tt-b" data-ttact="ok|${k}">✔ Saldada</button> <button class="tt-b" data-ttact="no|${k}">Sigue pendiente</button>` : ''}`
          : `<span class="tt-pill ${conc ? 'ok' : rev ? 'warn' : 'ko'}">${conc ? 'Conciliado' : rev ? 'Revisado' : 'Pendiente'}</span>`;
        const hist = x.hist.map((y) => `${fd(y.f)} · ${y.u}: ${y.a}`).join('\n');
        return `<tr class="${conc ? 'cn' : ''}"><td class="c">${chk('conc', conc)}</td><td class="c">${chk('rev', rev)}</td><td class="c">${fd(x.f)}</td><td>${esc(x.asiento)}</td><td>${esc(x.factura)}</td><td class="c">${fd(x.fdoc)}</td><td>${esc(x.desc)}</td><td class="c">${fd(x.vto)}</td><td class="c">${fd(x.vtop)}</td>
          <td class="n">${v(x.deb)}</td><td class="n">${v(x.cre)}</td><td class="n">${v(r2(x.deb - x.cre))}</td><td class="c">${esc(x.divisa)}</td><td>${esc(x.pago)}</td><td class="c" title="${esc(hist)}">${est}${x.fres ? `<div class="tt-hi">✔ ${fd(x.fres)}</div>` : ''}</td>
          <td>${ed ? `<input class="tt-nin" data-ttnota="${k}" value="${esc(x.nota)}" placeholder="Añadir nota...">` : esc(x.nota)}</td></tr>`;
      }).join('');
      const lab = (t, val) => (val ? `<span><span class="tt-l">${t}</span> <b>${esc(val)}</b></span>` : '');
      return `<tr class="tt-det" data-ttd="${esc(p.cod)}" data-b="${esc(sinAc(`${p.cod} ${p.nombre} ${p.ls.map((x) => `${x.factura} ${x.desc}`).join(' ')}`))}"><td colspan="9">
        <div class="tt-cab">${lab('Proveedor:', p.cod)}${lab('Nombre:', p.nombre)}${lab('Teléfono:', h.tel)}${lab('Email:', h.email)}${lab('Forma de pago:', h.pago)}${lab('Condiciones de pago:', h.cond)}
          ${ed ? `<span class="tt-sp"></span><button class="tt-b" data-ttact="xls|${esc(p.cod)}">Excel</button> <button class="tt-b" data-ttact="pdf|${esc(p.cod)}">PDF</button> <button class="tt-b" data-ttact="provsub|${esc(p.cod)}">Marcar todas conciliadas</button>${p.pc ? ` <button class="tt-b" data-ttact="provok|${esc(p.cod)}">✔ Confirmar las ${p.pc} saldadas</button>` : ''}` : ''}</div>
        <div class="tt-sc"><table class="tt-t tt-dk"><thead><tr><th>Conciliado</th><th>Revisado</th><th>Fecha</th><th>Asiento</th><th>Factura</th><th>Fecha de documento</th><th>Descripción</th><th>Fecha de vencimiento</th><th>Fecha de vto. pagaré</th><th>Débito</th><th>Crédito</th><th>Saldo</th><th>Divisa</th><th>Forma de pago</th><th>Estado conciliación</th><th>Observaciones</th></tr></thead>
          <tbody>${fl}<tr class="tt-tp"><td colspan="6"></td><td>Total proveedor</td><td colspan="2"></td><td class="n">${v(r2(dt.deb))}</td><td class="n">${v(r2(dt.cre))}</td><td class="n">${v(sd)}</td><td class="c">EUR</td><td></td><td class="c">${sd > 0.005 ? 'Saldo deudor' : sd < -0.005 ? 'Saldo acreedor' : 'Saldo 0'}</td><td></td></tr></tbody></table></div></td></tr>`;
    };
    const cuerpo = filas.map((p) => {
      const b = sinAc(`${p.cod} ${p.nombre} ${p.ls.map((x) => `${x.factura} ${x.desc}`).join(' ')}`), abierto = P.abre.has(p.cod), oculto = q && !b.includes(q);
      return `<tr class="tt-r ${p.est[1] === 'ok' ? 'ok' : 'ko'}${abierto ? ' ab' : ''}" data-b="${esc(b)}" data-ttp="${esc(p.cod)}"${oculto ? ' style="display:none"' : ''}><td>${abierto ? '▾' : '▸'}</td><td>${esc(p.cod)}</td><td>${esc(p.nombre)}</td><td class="num n">${p.a.length}/${p.ls.length}</td><td class="num n">${fm(p.deb)}</td><td class="num n">${fm(p.cre)}</td>
        <td class="num n"><b>${fm(p.saldo)}</b></td><td class="num n">${p.venc ? `<span class="tt-neg">${fm(p.venc)}</span>` : ''}</td><td>${pill(p.est[0], p.est[1])}</td></tr>${abierto ? detalle(p).replace('<tr data-ttd', `<tr${oculto ? ' style="display:none"' : ''} data-ttd`) : ''}`;
    }).join('');
    const banner = porConf.length ? `<div class="tt-ban"><b>${porConf.length} partidas ya no salen en el último listado</b> (${fd(ult?.f)}): parece que las has saldado en el ERP. ${ed ? `<button class="tt-b pri" data-ttact="confirmar|">✔ Confirmar todas como saldadas</button> <button class="tt-b" data-ttact="mantener|">Siguen pendientes</button> <button class="tt-b" data-ttact="ver|conf">Revisarlas una a una</button>` : ''}</div>` : '';
    const histCargas = P.hist ? `<table class="tt-t tt-dt"><thead><tr><th>Listado del</th><th>Archivo</th><th>Cargado</th><th>Por</th><th>Proveedores</th><th>Partidas</th><th>Nuevas</th><th>Propuestas saldadas</th><th>Saldo abierto</th></tr></thead><tbody>${[...cargas].reverse().map((c) => `<tr><td>${fd(c.f)}</td><td>${esc(c.archivo)}</td><td>${fd(c.el)}</td><td>${esc(c.u)}</td><td class="num n">${c.nProv}</td><td class="num n">${c.nLin}</td><td class="num n">${c.nNue}</td><td class="num n">${c.nDes}</td><td class="num n">${fm(c.saldo)}</td></tr>`).join('')}</tbody></table>
      <h4 class="tt-h4">Últimos movimientos de seguimiento</h4><table class="tt-t tt-dt"><thead><tr><th>Fecha</th><th>Quién</th><th>Proveedor</th><th>Factura / descripción</th><th>Qué se hizo</th></tr></thead><tbody>${lin.flatMap((x) => x.hist.map((h) => ({ ...h, x }))).filter((h) => !/^Aparece/.test(h.a)).sort((a, b) => b.f.localeCompare(a.f)).slice(0, 40).map((h) => `<tr><td>${fd(h.f)}</td><td>${esc(h.u)}</td><td>${esc(h.x.cod)} ${esc(pv.get(h.x.cod)?.nombre ?? '')}</td><td>${esc(h.x.factura || h.x.desc)}</td><td>${esc(h.a)}</td></tr>`).join('')}</tbody></table>` : '';
    const opt = (v, t) => `<option value="${v}"${P.f === v ? ' selected' : ''}>${t}</option>`;
    return `<div class="inicio ttp"><h3 class="tt-h">Transacciones de proveedores · ${esc(e?.nombre ?? '')}${ult ? ` <span class="tt-f">listado del ${fd(ult.f)}</span>` : ''}</h3>
      <div class="tt-bar"><select class="tt-chip" data-ttf>${opt('abiertas', 'Con partidas abiertas')}${opt('conf', 'Por confirmar')}${opt('sub', 'Con partidas subsanadas')}${opt('todos', 'Todos los proveedores')}</select>
        <input class="tt-chip tt-q" type="search" data-ttq placeholder="Buscar proveedor, factura, descripción…" value="${esc(P.q)}" autocomplete="off">
        <span class="tt-sp"></span><button class="tt-chip no-print" data-ttact="hist|">${P.hist ? 'Ocultar' : 'Ver'} cargas y movimientos</button><button class="tt-chip no-print" data-ttact="xls|">Descargar Excel</button><button class="tt-chip no-print" data-ttact="pdf|">Descargar PDF</button></div>
      <div class="tt-kg">${tarj('Proveedores', todas.length, '', `${conAb} con partidas abiertas`)}${tarj('Saldo abierto', fm(sAb), '', `al inicio: ${fm(sIni)}`)}${tarj('De ello vencido', fm(vencTot), vencTot ? 'neg' : '')}${tarj('Subsanadas', `${sub} de ${tot}`, 'ok', tot ? `${Math.round((sub / tot) * 100)} % resuelto` : '')}${tarj('Por confirmar', porConf.length, porConf.length ? 'warn' : '')}</div>
      ${banner}${zona()}${P.msg ? `<p class="tt-msg">${esc(P.msg)}</p>` : ''}${histCargas}
      <div class="tt-box"><table class="tt-t"><thead><tr><th></th><th>Código</th><th>Proveedor</th><th class="n">Abiertas</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n">Saldo</th><th class="n">Vencido</th><th>Estado</th></tr></thead>
        <tbody>${cuerpo || `<tr><td colspan="9">${tot ? 'Nada con ese filtro.' : 'Sin transacciones cargadas: suelta el Excel arriba.'}</td></tr>`}${cuerpo ? `<tr class="tt-tot"><td></td><td colspan="2">Total (${filas.length} proveedores)</td><td class="n">${tot2.n}</td><td class="n">${fm(r2(tot2.deb))}</td><td class="n">${fm(r2(tot2.cre))}</td><td class="n">${fm(r2(tot2.saldo))}</td><td class="n">${fm(r2(tot2.venc))}</td><td></td></tr>` : ''}</tbody></table></div>
      <p class="tt-nota">Saldo = débito − crédito de las partidas abiertas (negativo: se le debe al proveedor; positivo: pagos sin factura o saldo a nuestro favor). «Vencido» = crédito con vencimiento anterior a la fecha del listado. Las partidas nunca se borran: las subsanadas quedan con su fecha, quién las marcó y su nota.</p></div>`;
  }

  // ---------- eventos ----------
  document.addEventListener('click', (ev) => {
    const z = ev.target.closest?.('[data-ttdz]'); if (z && !ev.target.closest('input')) { z.querySelector('input')?.click(); return; }
    const b = ev.target.closest?.('[data-ttact]');
    if (b) {
      const [a, k] = [b.dataset.ttact.slice(0, b.dataset.ttact.indexOf('|')), b.dataset.ttact.slice(b.dataset.ttact.indexOf('|') + 1)];
      if (a === 'ok') confirmar(k); else if (a === 'no') mantener(k); else if (a === 'confirmar') masivo('', 'confirmar'); else if (a === 'mantener') masivo('', 'mantener');
      else if (a === 'ver') { P.f = 'conf'; render(); } else if (a === 'hist') { P.hist = !P.hist; render(); } else if (a === 'xls') exportarExcel(k); else if (a === 'pdf') exportarPdf(k);
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
    else if (d.ttchk !== undefined) { const i = d.ttchk.indexOf('|'), w = d.ttchk.slice(0, i), k = d.ttchk.slice(i + 1), on = ev.target.checked; marcar(k, w === 'conc' ? (on ? 'sub' : 'pend') : (on ? 'curso' : 'pend')); }
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
