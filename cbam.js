// Bloque 13 · CBAM (Mecanismo de Ajuste en Frontera por Carbono). Todo se guarda en un registro «cbam» por empresa.
// Las importaciones salen de los DUA de «DUA-H1» (una línea por partida con código CBAM); operadores, instalaciones y emisiones se cargan
// desde los informes QReport ya presentados o desde la plantilla del productor, y se pueden escribir a mano.
import { leerQReport, leerPlantilla } from './cbam-lector.js?v=2';

export function crearCbam({ db, S, esc, render, cargar, empresa, puede, guardarRegistro, duaRegs, duaLeer, textoPdf }) {
  const FACTOR0 = { 2026: 2.5, 2027: 5, 2028: 10, 2029: 22.5, 2030: 48.5, 2031: 61, 2032: 73.5, 2033: 86, 2034: 100 };
  // Mercancías CBAM de fertilizantes según el registro de la UE y el TARIC: [código NC, grupo, detalle]. Los cuatro últimos de 3105 salen de tus QReport; falta confirmar el resto de 3105 con la lista oficial.
  const CATALOGO = [['28080000', 'Nitric acid; sulphonitric acids', ''], ['28141000', 'Anhydrous ammonia', ''], ['28142000', 'Ammonia in aqueous solution', ''], ['28342100', 'Nitrates of potassium', ''],
    ['31021010', 'Urea, whether or not in aqueous solution', 'Urea containing more than 45 % by weight of nitrogen on the dry anhydrous product'], ['31021012', 'Urea, whether or not in aqueous solution', 'In aqueous solution, containing at least 31.8 % but not exceeding 33.2 % by weight of urea'],
    ['31021015', 'Urea, whether or not in aqueous solution', 'In aqueous solution, containing more than 33.2 % but not exceeding 55 % by weight of urea'], ['31021019', 'Urea, whether or not in aqueous solution', 'Other'], ['31021090', 'Urea, whether or not in aqueous solution', 'Other Urea'],
    ['31022100', 'Ammonium sulphate', ''], ['31022900', 'Other Ammonium Sulfate', ''], ['31023010', 'Ammonium nitrate, whether or not in aqueous solution', 'In aqueous solution'], ['31023090', 'Ammonium nitrate, whether or not in aqueous solution', 'Other Ammonium Nitrate'],
    ['31024010', 'Mixtures of ammonium nitrate with calcium carbonate or other inorganic non-fertilising substances', 'With a nitrogen content not exceeding 28 % by weight'], ['31024090', 'Mixtures of ammonium nitrate with calcium carbonate or other inorganic non-fertilising substances', 'With a nitrogen content exceeding 28 % by weight'],
    ['31025000', 'Sodium nitrate', ''], ['31026000', 'Double salts and mixtures of calcium nitrate and ammonium nitrate', ''], ['31028000', 'Mixtures of urea and ammonium nitrate in aqueous or ammoniacal solution', ''], ['31029000', 'Other, including mixtures not specified in the foregoing subheadings', ''],
    ['31052010', 'Mineral or chemical fertilisers containing the three elements nitrogen, phosphorus and potassium', 'With a nitrogen content exceeding 10 % by weight on the dry anhydrous product'], ['31052090', 'Mineral or chemical fertilisers containing the three elements nitrogen, phosphorus and potassium', 'Other'],
    ['31053000', 'Diammonium hydrogenorthophosphate (diammonium phosphate)', ''], ['31054000', 'Ammonium dihydrogenorthophosphate (monoammonium phosphate) and mixtures with diammonium phosphate', '']];
  const PREF0 = CATALOGO.map((c) => c[0]).join(', '); // los códigos que cuentan como CBAM (se pueden cambiar en «Cálculo»: un código más corto vale como prefijo)
  const UMBRAL_T = 50;
  // Precio del certificado: media trimestral en 2026 (publicada por la Comisión; semanal desde 2027). Editable por trimestre.
  const PRECIOQ0 = { '2026-Q1': 75.36, '2026-Q2': 75.28, '2026-Q3': 82.32 };
  const precioQ = (d, q, y) => num(d.cfg.precioQ?.[q]) || num(d.cfg.precio?.[y]);
  const precioAnio = (d, y) => { const ps = [1, 2, 3, 4].map((n) => precioQ(d, `${y}-Q${n}`, y)).filter(Boolean); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0; };
  const nf = (v, d = 2) => (v === null || v === undefined || v === '' || Number.isNaN(+v) ? '' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }).format(+v));
  const r2 = (x) => Math.round((Number(x) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const num = (s) => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const ST = { ano: null, q: '', msg: '' };
  const ano = () => ST.ano ?? Number(S.ejercicio);
  const ed = () => puede();

  // ---------- datos guardados ----------
  const regCbam = () => S.registros.find((r) => r.tipo === 'cbam' && r.empresa_id === S.sel);
  const DEF = () => ({ oper: [], inst: [], emi: [], asig: {}, aut: { estado: 'No solicitada' }, cert: [], cfg: { prefijos: PREF0, factor: { ...FACTOR0 }, precio: {}, precioQ: { ...PRECIOQ0 }, deduc: {}, ctaGasto: '', ctaProv: '' }, decl: {}, inf: [], docs: [], tareas: null });
  function D() { const d = regCbam()?.datos ?? {}, b = DEF(); return { ...b, ...d, cfg: { ...b.cfg, ...(d.cfg ?? {}), factor: { ...b.cfg.factor, ...(d.cfg?.factor ?? {}) }, precioQ: { ...b.cfg.precioQ, ...(d.cfg?.precioQ ?? {}) } }, aut: { ...b.aut, ...(d.aut ?? {}) } }; }
  async function guardar(mut) {
    const reg = regCbam(), datos = D(); mut(datos);
    const err = await guardarRegistro(reg, { ...(reg ? {} : { id: crypto.randomUUID() }), empresa_id: S.sel, tipo: 'cbam', ejercicio: null, datos });
    if (err) return void alert(err);
    await cargar(); render();
  }

  // ---------- líneas de importación (partidas de los DUA con código CBAM) ----------
  const fechaDe = (s) => { const m = /(\d\d)-(\d\d)-(\d{4})/.exec(s || ''); return m ? { y: +m[3], mo: +m[2], d: +m[1] } : null; };
  const esCbam = (taric, pref) => { const c = String(taric ?? '').replace(/\D/g, ''); return !!c && pref.split(/[,\s]+/).filter(Boolean).some((p) => c.startsWith(p)); };
  function lineas(d) {
    const out = [];
    duaRegs().forEach((r) => {
      const R = r.datos, f = fechaDe(R.levante) ?? fechaDe(R.grab);
      const ps = R.partidas?.length ? R.partidas : [{ n: 1, taric: (String(R.taric ?? '').match(/\d{8,10}/) ?? [''])[0], desc: R.desc, origen: R.paisExp, neta: num(R.neta), reg: '' }];
      ps.forEach((p) => {
        if (!esCbam(p.taric, d.cfg.prefijos)) return;
        out.push({ key: `${R.num}|${p.n}`, num: R.num, n: p.n, f, y: f?.y, q: f ? `${f.y}-Q${Math.ceil(f.mo / 3)}` : '', taric: p.taric, nc: String(p.taric).slice(0, 8), desc: p.desc || R.desc || '', origen: p.origen || R.paisExp || '', tm: (p.neta || 0) / 1000, reg: p.reg || '', exped: R.expedidor || '', porPartida: !!R.partidas?.length });
      });
    });
    return out.sort((a, b) => (b.f ? b.f.y * 1e4 + b.f.mo * 100 + b.f.d : 0) - (a.f ? a.f.y * 1e4 + a.f.mo * 100 + a.f.d : 0));
  }
  function emisionDe(d, l) { // instalación elegida para la línea → emisión de su producto (mismo código NC)
    const a = d.asig[l.key] ?? {}; if (!a.inst) return null;
    return d.emi.find((e) => e.instK === a.inst && String(e.nc) === l.nc) ?? d.emi.find((e) => e.instK === a.inst && String(e.nc).slice(0, 6) === l.nc.slice(0, 6)) ?? null;
  }
  const calc = (d, l) => { const e = emisionDe(d, l); if (!e) return { e: null, dir: 0, ind: 0, tot: 0 }; const dir = l.tm * num(e.directa), ind = l.tm * num(e.indirecta); return { e, dir, ind, tot: dir + ind }; };

  // ---------- piezas de pantalla ----------
  const sinEmp = '<p class="vacio">Elige una empresa en el desplegable de arriba.</p>';
  const instNombre = (d, k) => { const i = d.inst.find((x) => x.k === k); return i ? `${i.id} · ${i.nombre}` : ''; };
  const optsInst = (d, sel) => `<option value="">—</option>${d.inst.map((i) => `<option value="${esc(i.k)}"${i.k === sel ? ' selected' : ''}>${esc(`${i.id} · ${i.nombre}`)}</option>`).join('')}`;
  const selAno = (anos) => `<label>Año <select data-cbano="1">${anos.map((y) => `<option${y === ano() ? ' selected' : ''}>${y}</option>`).join('')}</select></label>`;
  const anosDe = (L) => { const s = new Set([Number(S.ejercicio), 2026]); L.forEach((l) => l.y && s.add(l.y)); return [...s].sort((a, b) => b - a); };
  // tabla editable: cols = [campo, etiqueta, ancho(em), tipo?]; los datos viven en d[clave]
  const tablaEd = (d, clave, cols, add) => `<div class="wrap"><table class="tabla cb-t"><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${(d[clave] ?? []).map((f, i) => `<tr>${cols.map(([c, , w, t]) => `<td>${ed() ? (t === 'inst' ? `<select data-cb="${clave}|${i}|${c}">${optsInst(d, f[c])}</select>` : `<input style="width:${w ?? 8}em" data-cb="${clave}|${i}|${c}" value="${esc(f[c] ?? '')}">`) : esc(f[c] ?? '')}</td>`).join('')}<td>${ed() && clave !== 'decl' ? `<button class="small danger" data-cbdel="${clave}|${i}" title="Borrar">✕</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="vacio">Todavía no hay nada.</td></tr>`}</tbody></table></div>${ed() && add ? `<p><button class="small" data-cbadd="${clave}">+ ${add}</button></p>` : ''}`;
  const kpi = (t, v, s = '') => `<div class="cb-k"><small>${t}</small><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;

  // ---------- 1 · Importaciones ----------
  function vistaImp() {
    if (!S.sel) return sinEmp;
    const d = D(), L = lineas(d), y = ano(), LY = L.filter((l) => l.y === y), t = LY.reduce((a, l) => a + l.tm, 0);
    const emis = LY.reduce((a, l) => a + calc(d, l).tot, 0), sinEm = LY.filter((l) => !emisionDe(d, l)).length, sinPart = L.filter((l) => !l.porPartida).length;
    const filas = LY.map((l) => { const c = calc(d, l);
      return `<tr><td>${esc(l.q)}</td><td>${l.f ? `${String(l.f.d).padStart(2, '0')}/${String(l.f.mo).padStart(2, '0')}/${l.f.y}` : ''}</td><td>${esc(l.num)}</td><td class="c">${l.n}</td><td>${esc(l.taric)}</td><td>${esc(l.desc)}</td><td>${esc(l.origen)}</td><td class="num">${nf(l.tm, 3)}</td>
        <td>${ed() ? `<select data-cbasig="${esc(l.key)}">${optsInst(d, d.asig[l.key]?.inst)}</select>` : esc(instNombre(d, d.asig[l.key]?.inst))}</td>
        <td class="num">${c.e ? nf(num(c.e.directa) + num(c.e.indirecta), 4) : '<span class="rojo">sin emisión</span>'}</td><td class="num">${c.e ? nf(c.tot, 3) : ''}</td></tr>`; }).join('');
    return `<div class="inicio cb"><section class="dsec"><h3>Importaciones afectadas por el CBAM · ${esc(empresa()?.nombre ?? '')}</h3>
      <div class="bar">${selAno(anosDe(L))}<span class="space"></span>${ed() ? '<button class="small" data-cbreleer="1" title="Vuelve a leer los PDF de los DUA guardados para sacar cada partida (código, masa y origen)">Releer partidas de los DUA</button>' : ''}</div>
      ${ST.msg ? `<p class="hint">${esc(ST.msg)}</p>` : ''}
      <div class="cb-ks">${kpi('Toneladas ' + y, nf(t, 3) + ' t', t > UMBRAL_T ? 'supera el umbral de 50 t' : 'bajo el umbral de 50 t')}${kpi('Emisiones incorporadas', nf(emis, 3) + ' tCO₂')}${kpi('Líneas sin emisión', sinEm, sinEm ? 'elige la instalación' : 'todas con emisión')}${kpi('DUA leídos entero', sinPart ? `${sinPart} sin partidas` : 'por partida', sinPart ? 'pulsa «Releer»' : '')}</div>
      ${LY.length ? `<div class="wrap"><table class="tabla cb-t"><thead><tr><th>Trim.</th><th>Levante</th><th>DUA</th><th>Part.</th><th>Código TARIC</th><th>Mercancía</th><th>Origen</th><th class="num">Toneladas</th><th>Instalación</th><th class="num">tCO₂/t</th><th class="num">tCO₂</th></tr></thead><tbody>${filas}</tbody></table></div>`
        : `<p class="vacio">No hay importaciones CBAM en ${y}. Carga los DUA en «DUA-H1» (bloque 1): salen aquí las partidas cuyo código figura en el catálogo CBAM (lista en «Cálculo de la obligación»).</p>`}
      <p class="hint">Cada línea es una partida de un DUA de «DUA-H1». Elige la instalación de origen y las emisiones salen de «Emisiones por producto» (mismo código NC). Toneladas = masa neta de la partida.</p></section></div>`;
  }

  // ---------- 2 · Operadores e instalaciones ----------
  const OPCOLS = [['id', 'Id. operador', 6], ['nombre', 'Nombre', 18], ['pais', 'País', 3], ['ciudad', 'Ciudad', 10], ['calle', 'Calle', 16], ['cp', 'C. postal', 6], ['contacto', 'Contacto', 12], ['email', 'Correo', 16], ['tel', 'Teléfono', 11]];
  const INCOLS = [['id', 'Id. instalación', 6], ['nombre', 'Nombre', 16], ['opId', 'Operador', 6], ['pais', 'País', 3], ['ciudad', 'Ciudad', 10], ['cp', 'C. postal', 6], ['lat', 'Latitud', 9], ['lon', 'Longitud', 9], ['tipoCoord', 'Tipo coord.', 3], ['paisProd', 'País prod.', 3]];
  function vistaInst() {
    if (!S.sel) return sinEmp; const d = D();
    return `<div class="inicio cb"><section class="dsec"><h3>Operadores e instalaciones</h3>
      <div class="bar"><span class="space"></span>${ed() ? '<button class="primary small" data-cbqr="1">Cargar informe QReport (PDF)</button><input type="file" id="cbQrIn" accept=".pdf" multiple hidden>' : ''}</div>${ST.msg ? `<p class="hint">${esc(ST.msg)}</p>` : ''}
      <h4 class="it-sec">Operadores (productores o proveedores)</h4>${tablaEd(d, 'oper', OPCOLS, 'Añadir operador')}
      <h4 class="it-sec">Instalaciones de producción</h4>${tablaEd(d, 'inst', INCOLS, 'Añadir instalación')}
      <p class="hint">Se escriben una vez y se reutilizan en todos los trimestres. Al cargar un QReport ya presentado se rellenan solos, con lo que ya conste (dirección, contacto y coordenadas). El operador y la instalación no salen del DUA: los facilita el proveedor.</p></section></div>`;
  }

  // ---------- 3 · Emisiones por producto ----------
  const EMCOLS = [['instK', 'Instalación', 14, 'inst'], ['nc', 'Código NC (8)', 8], ['producto', 'Producto', 16], ['metodo', 'Método', 4], ['directa', 'Directas tCO₂/t', 7], ['indirecta', 'Indirectas tCO₂/t', 7], ['mwh', 'Electricidad MWh/t', 7], ['factor', 'Factor tCO₂/MWh', 7], ['fuenteFactor', 'Fuente factor', 6], ['fuenteElec', 'Fuente electr.', 6], ['periodo', 'Periodo de los datos', 16], ['origenDato', 'Origen del dato', 14]];
  function vistaEmi() {
    if (!S.sel) return sinEmp; const d = D();
    return `<div class="inicio cb"><section class="dsec"><h3>Emisiones incorporadas por producto e instalación</h3>
      <div class="bar"><span class="space"></span>${ed() ? '<button class="primary small" data-cbpl="1">Cargar plantilla del productor (Excel)</button><input type="file" id="cbPlIn" accept=".xlsx,.xls" multiple hidden>' : ''}</div>${ST.msg ? `<p class="hint">${esc(ST.msg)}</p>` : ''}
      ${tablaEd(d, 'emi', EMCOLS, 'Añadir emisión')}
      <p class="hint">Emisión específica = tCO₂ por tonelada de producto: directas (de la instalación), indirectas (electricidad × factor) y electricidad consumida por tonelada. La plantilla del productor («CBAM communication template for installations») trae una fila por producto en la hoja Summary_Communication; el factor de electricidad se calcula como indirectas ÷ MWh/t y puedes corregirlo. Comprueba el periodo de los datos frente al de tus importaciones.</p></section></div>`;
  }

  // ---------- 4 · Cálculo de la obligación ----------
  function vistaCalc() {
    if (!S.sel) return sinEmp; const d = D(), L = lineas(d), y = ano(), LY = L.filter((l) => l.y === y);
    const t = LY.reduce((a, l) => a + l.tm, 0), emis = r2(LY.reduce((a, l) => a + calc(d, l).tot, 0));
    const pct = num(d.cfg.factor[y]) / 100, precio = precioAnio(d, y), ded = num(d.cfg.deduc[y]);
    const bruto = LY.reduce((a, l) => a + calc(d, l).tot * pct * precioQ(d, l.q, y), 0), cert = Math.max(0, emis * pct - (precio ? ded / precio : 0)), imp = r2(Math.max(0, bruto - ded)); // cada línea con el precio de su trimestre
    const pctU = t / UMBRAL_T * 100;
    const proy = Object.keys(FACTOR0).map((a) => { const f = num(d.cfg.factor[a]) / 100; return `<tr><td><b>${a}</b></td><td class="num">${nf(num(d.cfg.factor[a]), 1)} %</td><td class="num">${nf(emis * f, 2)}</td><td class="num">${precio ? nf(emis * f * precio, 2) : ''}</td></tr>`; }).join('');
    const inp = (k, a, ph) => `<input style="width:7em" data-cbcfg="${k}|${a}" value="${esc(d.cfg[k][a] ?? '')}" placeholder="${ph}">`;
    return `<div class="inicio cb"><section class="dsec"><h3>Cálculo de la obligación · ${y}</h3><div class="bar">${selAno(anosDe(L))}<span class="space"></span></div>
      <div class="cb-ks">${kpi('Toneladas importadas', nf(t, 3) + ' t')}${kpi('Emisiones incorporadas', nf(emis, 2) + ' tCO₂')}${kpi('Certificados a entregar', nf(cert, 2), `factor CBAM ${nf(pct * 100, 1)} %`)}${kpi('Importe estimado', nf(imp, 2) + ' €', precio ? `precio medio ${nf(precio, 2)} €/certificado` : 'falta el precio')}</div>
      <div class="cb-um"><b>Umbral de ${UMBRAL_T} t por año</b><div class="um-bar" style="display:block;height:14px;background:#e6ebf5;border-radius:9px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, pctU)}%;background:${pctU > 100 ? '#dc2626' : pctU >= 80 ? '#f59e0b' : '#16a34a'}"></i></div><small>${nf(t, 1)} t de ${UMBRAL_T} t · ${pctU > 100 ? 'superado: hay que ser declarante autorizado y declarar' : 'por debajo del umbral (comprueba la norma vigente)'}</small></div>
      <h4 class="it-sec">Datos del año ${y}</h4><div class="cb-form"><label>Factor CBAM ${y} (%) ${inp('factor', y, '')}</label>${[1, 2, 3, 4].map((n) => `<label>Precio ${n}T (€/t) ${inp('precioQ', `${y}-Q${n}`, y === 2026 && n === 4 ? 'sin publicar' : '0,00')}</label>`).join('')}<label>Precio del carbono pagado en origen, total (€) ${inp('deduc', y, '0,00')}</label></div>
      <h4 class="it-sec">Evolución prevista (mismas emisiones)</h4><div class="wrap"><table class="tabla cb-t" style="width:auto"><thead><tr><th>Año</th><th class="num">Factor CBAM</th><th class="num">Certificados</th><th class="num">Importe €</th></tr></thead><tbody>${proy}</tbody></table></div>
      <h4 class="it-sec">Códigos CBAM y cuentas del asiento</h4><div class="cb-form"><label>Códigos que cuentan como CBAM (empiezan por) <input style="width:20em" data-cbcfg2="prefijos" value="${esc(d.cfg.prefijos)}"></label>
        <label>Cuenta de gasto <input style="width:8em" data-cbcfg2="ctaGasto" value="${esc(d.cfg.ctaGasto)}" placeholder="6…"></label><label>Cuenta de provisión <input style="width:8em" data-cbcfg2="ctaProv" value="${esc(d.cfg.ctaProv)}" placeholder="14… / 4999"></label></div>
      <details><summary><b>Mercancías CBAM de fertilizantes (${CATALOGO.length} códigos del registro de la UE)</b></summary><div class="wrap"><table class="tabla cb-t" style="width:auto"><thead><tr><th>Código NC</th><th>Mercancía</th><th>Detalle</th></tr></thead><tbody>${CATALOGO.map(([c, g, x]) => `<tr><td>${c}</td><td>${esc(g)}</td><td>${esc(x)}</td></tr>`).join('')}</tbody></table></div></details>
      <h4 class="it-sec">Asiento propuesto</h4><div class="wrap"><table class="tabla cb-t" style="width:auto"><thead><tr><th>Cuenta</th><th class="num">Debe</th><th class="num">Haber</th></tr></thead><tbody><tr><td>${esc(d.cfg.ctaGasto || '(cuenta de gasto)')} · Gasto por certificados CBAM ${y}</td><td class="num">${nf(imp, 2)}</td><td></td></tr><tr><td>${esc(d.cfg.ctaProv || '(cuenta de provisión)')} · Provisión por certificados CBAM</td><td></td><td class="num">${nf(imp, 2)}</td></tr></tbody></table></div>
      <p class="hint">Certificados = emisiones × factor CBAM del año − (precio del carbono pagado en origen ÷ precio del certificado). El factor es el porcentaje de la obligación que no cubre la asignación gratuita (2026: 2,5 % hasta el 100 % en 2034). El precio es la media trimestral publicada por la Comisión en 2026 (75,36 · 75,28 · 82,32 €; el 4T aún sin publicar) y semanal desde 2027; los certificados se compran en la plataforma común desde febrero de 2027. El umbral de 50 t es el de la Comisión. El factor por año y los plazos de declaración hay que confirmarlos en el Reglamento (UE) 2023/956 consolidado.</p></section></div>`;
  }

  // ---------- 5 · Autorización y certificados ----------
  const CTCOLS = [['fecha', 'Fecha', 9], ['tipo', 'Tipo (Compra / Entrega / Devolución)', 14], ['cant', 'Certificados', 8], ['precio', 'Precio €', 8], ['nota', 'Nota', 24]];
  function vistaAut() {
    if (!S.sel) return sinEmp; const d = D(), a = d.aut, ct = d.cert;
    const compra = ct.filter((c) => /^c/i.test(c.tipo)).reduce((s, c) => s + num(c.cant), 0), sale = ct.filter((c) => /^(e|d)/i.test(c.tipo)).reduce((s, c) => s + num(c.cant), 0);
    const f = (k, t, w = 10) => `<label>${t} ${ed() ? `<input style="width:${w}em" data-cbaut="${k}" value="${esc(a[k] ?? '')}">` : esc(a[k] ?? '')}</label>`;
    return `<div class="inicio cb"><section class="dsec"><h3>Declarante autorizado y certificados</h3>
      <div class="cb-form"><label>Estado ${ed() ? `<select data-cbaut="estado">${['No solicitada', 'Solicitada', 'Autorizada', 'Denegada'].map((x) => `<option${x === a.estado ? ' selected' : ''}>${x}</option>`).join('')}</select>` : esc(a.estado)}</label>
        ${f('solicitud', 'Nº de solicitud', 14)}${f('fSolicitud', 'Fecha de solicitud')}${f('numero', 'Nº de autorización', 14)}${f('fAut', 'Fecha de autorización')}${f('vigencia', 'Vigencia hasta')}${f('notas', 'Notas', 24)}</div>
      <h4 class="it-sec">Cuenta de certificados</h4><div class="cb-ks">${kpi('Comprados', nf(compra, 2))}${kpi('Entregados / devueltos', nf(sale, 2))}${kpi('Saldo', nf(compra - sale, 2))}</div>
      ${tablaEd(d, 'cert', CTCOLS, 'Añadir movimiento')}
      <p class="hint">Desde 2026 solo puede importar un declarante autorizado. Aquí queda constancia de la solicitud y de la autorización, y de las compras y entregas de certificados.</p></section></div>`;
  }

  // ---------- 6 · Informe trimestral ----------
  const DCOLS = [['nombre', 'Declarante', 22], ['nif', 'NIF', 12], ['funcion', 'Función', 4], ['pais', 'País', 3], ['provincia', 'Provincia', 9], ['poblacion', 'Población', 9], ['calle', 'Calle', 12], ['cp', 'C. postal', 6], ['anc', 'Autoridad (ANC)', 9]];
  const FCOLS = [['firmaFecha', 'Firmado el', 10], ['firmaLugar', 'Firmado en', 9], ['firmaNombre', 'Firmado por', 20], ['firmaCargo', 'Cargo', 6]];
  const INFCOLS = [['periodo', 'Periodo', 8], ['id', 'Identificación', 24], ['emision', 'Fecha de emisión', 16], ['estado', 'Estado', 9], ['notas', 'Notas', 20]];
  function filasInforme(d, q) {
    return lineas(d).filter((l) => l.q === q).sort((a, b) => a.num.localeCompare(b.num) || a.n - b.n).map((l, i) => { const c = calc(d, l), e = c.e, ins = d.inst.find((x) => x.k === d.asig[l.key]?.inst), op = d.oper.find((o) => o.id === ins?.opId) ?? {};
      return { n: i + 1, l, e, ins, op, dir: c.dir, ind: c.ind, tot: c.tot, falta: !e || !ins || !op.id }; });
  }
  function vistaInf() {
    if (!S.sel) return sinEmp; const d = D(), L = lineas(d), qs = [...new Set(L.map((l) => l.q).filter(Boolean))].sort().reverse();
    const q = ST.q && qs.includes(ST.q) ? ST.q : (qs[0] ?? ''), F = filasInforme(d, q), falta = F.filter((x) => x.falta).length;
    const decl = d.decl;
    return `<div class="inicio cb"><section class="dsec"><h3>Informe CBAM trimestral · ${esc(empresa()?.nombre ?? '')}</h3>
      <div class="bar"><label>Periodo <select data-cbq="1">${qs.map((x) => `<option${x === q ? ' selected' : ''}>${x}</option>`).join('') || '<option>—</option>'}</select></label><span class="space"></span>
        <button class="small primary" data-cbxls="${esc(q)}"${F.length ? '' : ' disabled'}>Exportar Excel del informe</button></div>
      <p class="dash-s" style="font-size:.78rem">${F.length} mercancías en ${esc(q || '—')}${falta ? ` · <b style="color:#b42318">${falta} sin instalación, operador o emisión</b>` : ' · todas completas'}. Importador: ${esc(decl.nombre || '—')}.</p>
      ${F.length ? `<div class="wrap"><table class="tabla cb-t"><thead><tr><th>Nº</th><th>NC</th><th>Origen</th><th>Proc.</th><th class="num">Masa neta t</th><th>Operador</th><th>Instalación</th><th>Método</th><th class="num">Dir. t/t</th><th class="num">Ind. t/t</th><th class="num">MWh/t</th><th class="num">Factor</th><th class="num">Emisiones tCO₂</th></tr></thead><tbody>${F.map((x) => `<tr${x.falta ? ' style="background:#fde2e2"' : ''}><td class="c">${x.n}</td><td>${esc(x.l.nc)}</td><td class="c">${esc(String(x.l.origen).slice(0, 2).toUpperCase())}</td><td class="c">${esc(String(x.l.reg).slice(0, 2))}</td><td class="num">${nf(x.l.tm, 4)}</td><td>${esc(x.op.id ?? '')} ${esc(x.op.nombre ?? '')}</td><td>${esc(x.ins ? `${x.ins.id} ${x.ins.nombre}` : '')}</td><td>${esc(x.e?.metodo ?? '')}</td><td class="num">${nf(x.e?.directa, 4)}</td><td class="num">${nf(x.e?.indirecta, 4)}</td><td class="num">${nf(x.e?.mwh, 3)}</td><td class="num">${nf(x.e?.factor, 4)}</td><td class="num">${nf(x.tot, 4)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vacio">No hay mercancías en este periodo.</p>'}
      <h4 class="it-sec">Datos del declarante y firma</h4>${tablaEd({ decl: [decl] }, 'decl', DCOLS)}${tablaEd({ decl: [decl] }, 'decl', FCOLS)}
      <h4 class="it-sec">Informes presentados</h4>${tablaEd(d, 'inf', INFCOLS, 'Añadir informe')}
      <p class="hint">Reproduce los campos del QReport: mercancía (NC, origen, procedimiento, masa), operador, instalación, método de producción y emisiones directas, indirectas y absolutas. El Excel sirve para revisar y para volcar los datos en el registro CBAM de la UE.</p></section></div>`;
  }
  function exportarXls(q) {
    const d = D(), F = filasInforme(d, q), X = window.XLSX; if (!X) return alert('No se cargó el lector de Excel.');
    const cab = [['Informe CBAM', q], ['Declarante', d.decl.nombre ?? ''], ['NIF', d.decl.nif ?? ''], ['Autoridad competente', d.decl.anc ?? ''], ['Firmado por', d.decl.firmaNombre ?? ''], ['Cargo', d.decl.firmaCargo ?? '']];
    const ms = [['Nº', 'DUA', 'Partida', 'Código NC', 'Descripción', 'País de origen', 'Procedimiento', 'Masa neta (t)', 'Id. operador', 'Operador', 'País operador', 'Id. instalación', 'Instalación', 'País instalación', 'Latitud', 'Longitud', 'Método de producción', 'Emisiones directas (tCO2/t)', 'Emisiones indirectas (tCO2/t)', 'Electricidad (MWh/t)', 'Factor de emisión (tCO2/MWh)', 'Fuente del factor', 'Emisiones directas (tCO2)', 'Emisiones indirectas (tCO2)', 'Emisiones totales (tCO2)'],
      ...F.map((x) => [x.n, x.l.num, x.l.n, x.l.nc, x.l.desc, String(x.l.origen).slice(0, 2).toUpperCase(), String(x.l.reg).slice(0, 2), r2(x.l.tm * 1e4) / 1e4, x.op.id ?? '', x.op.nombre ?? '', x.op.pais ?? '', x.ins?.id ?? '', x.ins?.nombre ?? '', x.ins?.pais ?? '', x.ins?.lat ?? '', x.ins?.lon ?? '', x.e?.metodo ?? '', x.e?.directa ?? '', x.e?.indirecta ?? '', x.e?.mwh ?? '', x.e?.factor ?? '', x.e?.fuenteFactor ?? '', r2(x.dir * 1e4) / 1e4, r2(x.ind * 1e4) / 1e4, r2(x.tot * 1e4) / 1e4])];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(cab), 'Cabecera'); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(ms), 'Mercancías');
    X.writeFile(wb, `CBAM_${q}_${(empresa()?.siglas ?? 'EMP')}.xlsx`);
  }

  // ---------- 7 · Calendario y lista de tareas ----------
  const TAREAS0 = [['Solicitar la autorización de declarante CBAM', ''], ['Cargar los DUA del trimestre en «DUA-H1»', ''], ['Recoger los datos de emisiones de cada productor', ''], ['Revisar las emisiones de cada línea importada', ''], ['Declaración anual CBAM (confirmar fecha vigente)', ''], ['Comprar y entregar los certificados (confirmar fecha vigente)', ''], ['Mantener los certificados exigidos al cierre de cada trimestre (confirmar)', ''], ['Provisión contable de los certificados en el cierre', '']].map(([texto, fecha]) => ({ texto, fecha, hecho: false }));
  const TACOLS = [['hecho', 'Hecho (sí/no)', 5], ['texto', 'Tarea', 40], ['fecha', 'Fecha límite', 10], ['nota', 'Nota', 24]];
  function vistaCal() {
    if (!S.sel) return sinEmp; const d = D(), T = d.tareas ?? TAREAS0, dd = { ...d, tareas: T.map((x) => ({ ...x, hecho: x.hecho === true ? 'sí' : x.hecho === false ? '' : x.hecho })) }, hoy = new Date().toISOString().slice(0, 10);
    const pend = T.filter((x) => !(x.hecho === true || /^s/i.test(x.hecho))).length, venc = T.filter((x) => x.fecha && x.fecha < hoy && !(x.hecho === true || /^s/i.test(x.hecho))).length;
    return `<div class="inicio cb"><section class="dsec"><h3>Calendario y lista de tareas CBAM</h3>
      <p class="dash-s" style="font-size:.78rem">${pend} pendientes${venc ? ` · <b style="color:#b42318">${venc} vencidas</b>` : ''}</p>${tablaEd(dd, 'tareas', TACOLS, 'Añadir tarea')}
      <p class="hint">Escribe la fecha límite de cada tarea (aaaa-mm-dd) y marca «sí» al terminarla. Las fechas de la declaración anual y de la entrega de certificados hay que confirmarlas con la normativa vigente.</p></section></div>`;
  }

  // ---------- 8 · Documentos ----------
  const DOCOLS = [['fecha', 'Fecha', 9], ['tipo', 'Tipo (declaración, verificación, solicitud…)', 18], ['nombre', 'Nombre del documento', 28], ['ruta', 'Enlace o ruta', 36]];
  function vistaDoc() { if (!S.sel) return sinEmp; const d = D(); return `<div class="inicio cb"><section class="dsec"><h3>Documentos CBAM</h3>${tablaEd(d, 'docs', DOCOLS, 'Añadir documento')}<p class="hint">Referencias a los documentos del CBAM (informes presentados, solicitud de declarante, verificaciones, comunicaciones de los productores) con su enlace o ruta.</p></section></div>`; }

  // ---------- acciones ----------
  // Texto del QReport en el orden en que lo escribe el PDF (cada dato junto a su etiqueta); el de los DUA lo ordena por filas y rompe las tablas
  async function textoQR(file) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('No se cargó el lector de PDF (pdf.js).');
    lib.GlobalWorkerOptions.workerSrc ||= 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, out = [];
    for (let p = 1; p <= doc.numPages; p++) out.push((await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).filter((s) => s && s.trim()).join(' | '));
    return out.join('\n');
  }
  async function cargarQR(files) {
    const nuevos = { oper: 0, inst: 0, emi: 0 }; let ultimo = null;
    for (const f of [...files].filter((x) => /\.pdf$/i.test(x.name))) {
      let Q = null; try { Q = leerQReport(await textoQR(f)); } catch (e) { ST.msg = `${f.name}: ${e.message}`; continue; }
      if (!Q || !Q.mercancias.length) { ST.msg = `${f.name}: no parece un informe CBAM (QReport).`; continue; }
      await guardar((d) => {
        Q.oper.forEach((o) => { if (!d.oper.some((x) => x.id === o.id)) { d.oper.push(o); nuevos.oper++; } });
        Q.inst.forEach((i) => { if (!d.inst.some((x) => x.k === i.k)) { d.inst.push(i); nuevos.inst++; } });
        Q.emi.forEach((e) => { if (!d.emi.some((x) => x.k === e.k)) { d.emi.push(e); nuevos.emi++; } });
        if (!d.inf.some((x) => x.id === Q.informe.id && x.periodo === Q.informe.periodo)) d.inf.push({ periodo: Q.informe.periodo, id: Q.informe.id, emision: Q.informe.emision, estado: Q.informe.estado, notas: `${Q.mercancias.length} mercancías` });
        if (!d.decl.nombre) d.decl = { ...Q.decl };
      });
      ultimo = Q.informe.periodo;
    }
    ST.msg = ultimo ? `QReport ${ultimo} leído: ${nuevos.oper} operadores, ${nuevos.inst} instalaciones y ${nuevos.emi} emisiones nuevas.` : ST.msg; render();
  }
  async function cargarPlantilla(files) {
    let n = 0, nom = '';
    for (const f of [...files]) {
      let P = null; try { P = leerPlantilla(window.XLSX, await f.arrayBuffer()); } catch (e) { ST.msg = `${f.name}: ${e.message}`; continue; }
      if (!P || !P.emi.length) { ST.msg = `${f.name}: no es la plantilla del productor (falta la hoja Summary_Communication con productos).`; continue; }
      await guardar((d) => {
        let ins = d.inst.find((i) => String(i.nombre).toUpperCase() === P.inst.nombre.toUpperCase());
        if (!ins) { ins = { k: `PL|${P.inst.nombre}`, id: '', opId: '', nombre: P.inst.nombre, pais: P.inst.pais, ciudad: '', cp: '', lat: P.inst.lat ?? '', lon: P.inst.lon ?? '', tipoCoord: '', paisProd: P.inst.pais }; d.inst.push(ins); }
        P.emi.forEach((e) => { const k = `${ins.k}|${e.nc}|${e.directa}|${e.indirecta}`; if (!d.emi.some((x) => x.k === k)) { d.emi.push({ k, instK: ins.k, nc: e.nc, producto: e.producto, metodo: '', directa: e.directa, indirecta: e.indirecta, mwh: e.mwh, factor: e.factor, fuenteFactor: e.fuenteFactor, fuenteElec: '', periodo: e.periodo, origenDato: e.origenDato }); n++; } });
      });
      nom = P.inst.nombre;
    }
    ST.msg = n ? `Plantilla de ${nom}: ${n} emisiones nuevas.` : ST.msg; render();
  }
  async function releerDua() {
    const regs = duaRegs().filter((r) => !r.datos.partidas?.length && r.datos.arch?.path); let n = 0; ST.msg = '';
    for (const r of regs) {
      try {
        const { data, error } = await db.storage.from('documentos').download(r.datos.arch.path); if (error || !data) continue;
        const R = await duaLeer(data); if (!R?.partidas?.length) continue;
        const err = await guardarRegistro(r, { datos: { ...r.datos, partidas: R.partidas } }); if (!err) n++;
      } catch { /* sigue con el siguiente */ }
    }
    ST.msg = `${n} de ${regs.length} DUA releídos por partidas.`; await cargar(); render();
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target, ds = t.dataset ?? {};
    if (ds.cbano) { ST.ano = Number(t.value); return render(); }
    if (ds.cbq) { ST.q = t.value; return render(); }
    if (ds.cb) { const [c, i, k] = ds.cb.split('|'); return void guardar((d) => { const arr = c === 'decl' ? [d.decl] : (d[c] ??= []); if (c === 'tareas' && !d.tareas) d.tareas = TAREAS0.map((x) => ({ ...x })); const fila = c === 'decl' ? d.decl : (c === 'tareas' ? d.tareas : arr)[+i]; if (fila) fila[k] = t.value; if (c === 'tareas' && fila && k === 'hecho') fila.hecho = /^s/i.test(t.value); }); }
    if (ds.cbasig) return void guardar((d) => { d.asig[ds.cbasig] = { ...(d.asig[ds.cbasig] ?? {}), inst: t.value }; });
    if (ds.cbcfg) { const [k, a] = ds.cbcfg.split('|'); return void guardar((d) => { d.cfg[k][a] = t.value; }); }
    if (ds.cbcfg2) return void guardar((d) => { d.cfg[ds.cbcfg2] = t.value; });
    if (ds.cbaut) return void guardar((d) => { d.aut[ds.cbaut] = t.value; });
    if (t.id === 'cbQrIn' && t.files?.length) { const fs = [...t.files]; t.value = ''; return void cargarQR(fs); }
    if (t.id === 'cbPlIn' && t.files?.length) { const fs = [...t.files]; t.value = ''; return void cargarPlantilla(fs); }
    return undefined;
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-cbadd],[data-cbdel],[data-cbqr],[data-cbpl],[data-cbreleer],[data-cbxls]'); if (!b) return;
    const ds = b.dataset;
    if (ds.cbqr) return void document.getElementById('cbQrIn')?.click();
    if (ds.cbpl) return void document.getElementById('cbPlIn')?.click();
    if (ds.cbreleer) return void releerDua();
    if (ds.cbxls) return void exportarXls(ds.cbxls);
    if (ds.cbadd) return void guardar((d) => { const c = ds.cbadd; if (c === 'tareas' && !d.tareas) d.tareas = TAREAS0.map((x) => ({ ...x })); (d[c] ??= []).push(c === 'inst' ? { k: `M|${Date.now()}` } : c === 'emi' ? { k: `M|${Date.now()}` } : {}); });
    if (ds.cbdel) { const [c, i] = ds.cbdel.split('|'); if (!confirm('¿Borrar esta fila?')) return undefined; return void guardar((d) => { if (c === 'tareas' && !d.tareas) d.tareas = TAREAS0.map((x) => ({ ...x })); (d[c] ??= []).splice(+i, 1); }); }
    return undefined;
  });
  return { tabs: {
    cbamimp: ['Importaciones', 'Partidas de los DUA', vistaImp], cbaminst: ['Operadores e instalaciones', 'Productores y plantas', vistaInst], cbamemi: ['Emisiones por producto', 'tCO₂ por tonelada', vistaEmi],
    cbamcalc: ['Cálculo de la obligación', 'Certificados e importe', vistaCalc], cbamaut: ['Autorización y certificados', 'Declarante y saldo', vistaAut], cbaminf: ['Informe trimestral', 'QReport y exportación', vistaInf],
    cbamcal: ['Calendario y tareas', 'Plazos y lista de control', vistaCal], cbamdoc: ['Documentos CBAM', 'Justificantes y verificaciones', vistaDoc],
  } };
}
