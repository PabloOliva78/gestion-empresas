// Detector de errores en los libros de IVA (emitidas y recibidas). Solo lee los libros ya cargados; no escribe nada ni baja datos nuevos.
// Revisa cada línea y marca: cuota que no sale de base × tipo, línea repetida, NIF español con dígito de control incorrecto, factura sin NIF,
// signos contrarios en base y cuota, tipo de IVA poco habitual y fecha de factura muy lejos de la de registro.
export function crearDetector({ S, esc, render, empresa, grande }) {
  const money = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);
  const r2 = (x) => Math.round(((Number(x) || 0) + (x < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const fd = (f) => String(f || '').slice(0, 10).split('-').reverse().join('/');
  const nifN = (n) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  const facN = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
  const TIPOS = [0, 1, 2, 4, 5, 10, 21, 0.5, 1.4, 1.75, 5.2, 7.5, 8.5, 9, 12, 13.5, 16, 18, 20]; // incluye recargos de equivalencia y tipos antiguos

  // Dígito de control de DNI, NIE y CIF. Devuelve true (válido), false (inválido) o null (no es un NIF español que se pueda comprobar)
  function nifOk(n) {
    const s = nifN(n);
    if (!/^[A-Z0-9]{9}$/.test(s)) return null;
    const L = 'TRWAGMYFPDXBNJZSQVHLCKE';
    if (/^[0-9]{8}[A-Z]$/.test(s)) return L[Number(s.slice(0, 8)) % 23] === s[8];
    if (/^[XYZ][0-9]{7}[A-Z]$/.test(s)) return L[Number('XYZ'.indexOf(s[0]) + s.slice(1, 8)) % 23] === s[8];
    if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(s)) {
      let imp = 0, par = 0;
      for (let i = 0; i < 7; i++) { const d = Number(s[i + 1]); if (i % 2 === 0) { const x = d * 2; imp += Math.floor(x / 10) + (x % 10); } else par += d; }
      const dc = (10 - ((imp + par) % 10)) % 10, letra = 'JABCDEFGHI'[dc];
      return s[8] === String(dc) || s[8] === letra;
    }
    return null; // K, L, M u otros formatos: no se comprueban
  }

  // Líneas que no se revisan: autorrepercutidas en Emitidas (S.UE.*, S.NC.ISP.*: ya van en Recibidas) y retenciones de alquileres, intereses y dividendos en Recibidas
  // En Emitidas tampoco las UE sin repercutir (R.UE.NR, R.UE.RD, R.UE.SR y sus variantes .SR) ni las ISP (R.ISP.NR, R.ISP.RD): sí se revisan R.UE.S y R.UE, que son repercutidas
  // Las líneas de retención (alquileres, intereses, dividendos, profesionales: código I.ALQ, I.INT, I.DV, I.PR, o con un tipo negativo como −19 %) no se revisan en ningún libro
  const excluida = (lado, l) => {
    const cod = String(l.codigo ?? '');
    if (Number(l.pct) < 0 || /(^|\.)I\.(ALQ|INT|DV|PR)/.test(cod)) return true;
    return lado === 'Emitidas' && /^(S\.UE\.|S\.NC\.ISP|R\.UE\.(NR|RD|SR)(\.|$)|R\.ISP\.(NR|RD)(\.|$))/.test(cod);
  };

  // Revisa un libro y devuelve una lista de incidencias { tipo, gravedad, linea, detalle }
  function revisar(libro, lado, ej) {
    // En Emitidas no se revisan las facturas autorrepercutidas (adquisiciones intracomunitarias S.UE.* e inversión del sujeto pasivo S.NC.ISP.*): ya se revisan en Recibidas
    // Las retenciones no son facturas con IVA: fuera de la revisión (ver excluida)
    const out = [], L = (libro ?? []).filter((l) => String(l.fecha ?? l.ff ?? '').slice(0, 4) === String(ej) && !excluida(lado, l)), vistos = new Map();
    const add = (tipo, gravedad, l, detalle) => out.push({ tipo, gravedad, lado, l, detalle });
    L.forEach((l) => {
      const base = Number(l.base) || 0, cuota = Number(l.cuota) || 0, pct = Number(l.pct) || 0, cod = String(l.codigo ?? '');
      const autorrep = /^(S\.UE\.|S\.NC\.ISP|R\.UE\.|R\.NC\.ISP)/.test(cod); // adquisiciones intracomunitarias e ISP: la cuota va autorrepercutida y se revisa igual
      // 1) cuota distinta de base × tipo
      if (pct > 0 || cuota !== 0) {
        const esp = r2(base * pct / 100), dif = r2(cuota - esp);
        if (Math.abs(dif) > 0.02 && !(pct === 0 && base === 0)) add('Cuota ≠ base × tipo', 'ko', l, `Con ${pct} % de ${money(base)} saldría ${money(esp)} y el libro trae ${money(cuota)} (diferencia ${money(dif)}).`);
      }
      // 2) signos contrarios entre base y cuota
      if (base !== 0 && cuota !== 0 && Math.sign(base) !== Math.sign(cuota) && !autorrep) add('Signos contrarios', 'ko', l, `La base es ${money(base)} y la cuota ${money(cuota)}: uno es positivo y el otro negativo.`);
      // 3) tipo de IVA poco habitual
      if (pct > 0 && !TIPOS.some((t) => Math.abs(t - pct) < 0.001)) add('Tipo poco habitual', 'aviso', l, `El tipo ${pct} % no es de los habituales (21, 10, 4, 5, 0,5, 1,4, 1,75, 5,2…).`);
      // 4) NIF
      const nif = nifN(l.nif);
      if (!nif) { if (Math.abs(base) >= 0.01) add('Sin NIF', 'aviso', l, 'La factura no tiene NIF de cliente o proveedor.'); }
      else if (nifOk(l.nif) === false && !/^(S\.UE|R\.UE|X\.|E\.)/.test(cod)) add('NIF incorrecto', 'ko', l, `El dígito de control de ${nif} no es válido.`);
      // 5) fechas
      if (l.ff && l.fecha && l.ff !== l.fecha) {
        const dd = (new Date(l.fecha) - new Date(l.ff)) / 86400000;
        if (dd < -31) add('Factura posterior al registro', 'aviso', l, `Fecha de la factura ${fd(l.ff)}, registrada el ${fd(l.fecha)}.`);
        else if (dd > 366) add('Registro muy posterior', 'aviso', l, `Fecha de la factura ${fd(l.ff)}, registrada el ${fd(l.fecha)} (más de un año de diferencia).`);
      }
      // 6) línea repetida: misma factura, NIF, importes, tipo y código
      const k = [nifN(l.nif), facN(l.factura), r2(base), r2(cuota), pct, cod].join('|');
      if (vistos.has(k)) { const p = vistos.get(k); if (!p.dup) { p.dup = true; add('Línea repetida', 'ko', p.l, `La misma factura con los mismos importes aparece ${p.n + 1}+ veces (asientos ${[p.l.asiento, l.asiento].filter(Boolean).join(' y ') || '—'}).`); } p.n++; }
      else vistos.set(k, { l, n: 1, dup: false });
    });
    return out;
  }

  let verTodos = false;
  const LIM = 400;
  function vista() {
    if (!S.sel) return '<p class="vacio">Elige una empresa en el desplegable de la izquierda.</p>';
    const E = grande('fact-E'), R = grande('fact-R');
    if (!E || !R) return '<p class="vacio">Cargando datos…</p>';
    const ej = Number(S.ejercicio), tit = `<h3>Errores en los libros de IVA · ${esc(empresa()?.nombre ?? '')} · ${ej}</h3>`;
    if (!E.length && !R.length) return `<div class="inicio"><section class="dsec">${tit}<p class="vacio">Sin datos: carga los libros de IVA (emitidas y recibidas).</p></section></div>`;
    const inc = [...revisar(E, 'Emitidas', ej), ...revisar(R, 'Recibidas', ej)];
    const nL = (E ?? []).filter((l) => String(l.fecha ?? '').slice(0, 4) === String(ej) && !excluida('Emitidas', l)).length + (R ?? []).filter((l) => String(l.fecha ?? '').slice(0, 4) === String(ej) && !excluida('Recibidas', l)).length;
    const porTipo = new Map(); inc.forEach((i) => { const g = porTipo.get(i.tipo) ?? porTipo.set(i.tipo, { n: 0, g: i.gravedad }).get(i.tipo); g.n++; });
    const orden = { ko: 0, aviso: 1 }, filas = inc.slice().sort((a, b) => orden[a.gravedad] - orden[b.gravedad] || a.tipo.localeCompare(b.tipo) || String(a.l.fecha).localeCompare(String(b.l.fecha)));
    const mostrar = verTodos ? filas : filas.slice(0, LIM);
    const resumen = porTipo.size ? `<div class="wrap"><table class="tabla"><thead><tr><th>Tipo de incidencia</th><th>Gravedad</th><th>Líneas</th></tr></thead><tbody>${[...porTipo.entries()].sort((a, b) => orden[a[1].g] - orden[b[1].g] || b[1].n - a[1].n).map(([t, g]) => `<tr><td>${esc(t)}</td><td>${g.g === 'ko' ? '<span class="d-ko">✖ Error</span>' : '<span class="d-nd">• Aviso</span>'}</td><td style="text-align:right">${g.n}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<div class="inicio"><section class="dsec">${tit}
      <p class="dash-s" style="font-size:.8rem">Se revisa cada línea de los libros de IVA emitidas y recibidas del ejercicio: cuota que no sale de base × tipo, línea repetida, NIF español con dígito de control incorrecto, factura sin NIF, signos contrarios, tipo de IVA poco habitual y fechas muy distantes. Solo lee los libros ya cargados.</p>
      <p class="dash-s">${inc.length ? `<span class="d-ko">${inc.length} incidencia(s)</span> en ${nL} líneas revisadas` : `<span class="d-ok">✓ Sin incidencias en ${nL} líneas revisadas</span>`}</p>
      ${resumen}
      ${inc.length ? `<div class="wrap"><table class="tabla"><thead><tr><th>Libro</th><th>Incidencia</th><th>Factura</th><th>Fecha</th><th>NIF</th><th>Nombre</th><th>Base</th><th>%</th><th>Cuota</th><th>Detalle</th></tr></thead><tbody>
      ${mostrar.map((i) => `<tr><td>${esc(i.lado)}</td><td>${i.gravedad === 'ko' ? '<span class="d-ko">✖ ' : '<span class="d-nd">• '}${esc(i.tipo)}</span></td><td>${esc(i.l.factura)}</td><td>${esc(fd(i.l.ff || i.l.fecha))}</td><td>${esc(i.l.nif)}</td><td>${esc(i.l.nombre)}</td><td style="text-align:right">${money(i.l.base)}</td><td style="text-align:right">${esc(i.l.pct ?? '')}</td><td style="text-align:right">${money(i.l.cuota)}</td><td>${esc(i.detalle)}</td></tr>`).join('')}</tbody></table></div>
      ${filas.length > LIM ? `<p class="hint">Se muestran ${verTodos ? filas.length : LIM} de ${filas.length}. <button class="btn" data-act="m-chklibtodos">${verTodos ? 'Mostrar solo las primeras' : 'Mostrar todas'}</button></p>` : ''}` : ''}
      <p class="hint">Un aviso no tiene por qué ser un error: por ejemplo, un NIF extranjero sin prefijo o un tipo antiguo. Los errores (cuota, signos, líneas repetidas, NIF español) conviene corregirlos en el ERP y volver a cargar el libro.</p></section></div>`;
  }

  return {
    tabs: { chklib: ['Errores en libros', 'Cuotas, NIF, duplicados y fechas de los libros de IVA', vista] },
    acciones: { 'm-chklibtodos': () => { verTodos = !verTodos; render(); } },
    nifOk, revisar,
  };
}
