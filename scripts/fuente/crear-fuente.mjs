// Genera la fuente «Libro Mayor» (sans geométrica de trazo uniforme y puntas redondas) en dos pesos.
// Uso:  cd scripts/fuente ; npm install ; node crear-fuente.mjs
// Salida: ../../fuentes/LibroMayor-Regular.otf y LibroMayor-Bold.otf
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const opentype = createRequire(import.meta.url)('opentype.js'); // hace falta tenerlo instalado (npm i opentype.js) o en NODE_PATH
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fuentes');

// ---------- esqueletos (trazos de línea central) · y hacia arriba · altura de mayúscula 700, x 500, descendente -200 ----------
const D = Math.PI / 180;
const arc = (cx, cy, rx, ry, a0, a1) => {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 9)), pts = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
};
const cat = (...ps) => ps.flat(); // une tramos en un solo trazo (listas de puntos)
const P = (x, y) => [[x, y]];
const L = 70, R = 470, TOP = 700, XH = 500;
const sk = {};

// mayúsculas
sk.A = [[[L, 0], [270, TOP], [R, 0]], [[135, 230], [405, 230]]];
const bowlP = cat([[L, 0], [L, TOP], [300, TOP]], arc(300, 525, 175, 175, 90, -90), [[L, 350]]);
sk.B = [[[L, 0], [L, TOP]], cat([[L, TOP], [300, TOP]], arc(300, 525, 175, 175, 90, -90), [[L, 350], [320, 350]], arc(320, 175, 175, 175, 90, -90), [[L, 0]])];
sk.C = [arc(270, 350, 200, 350, 45, 315)];
sk.D = [cat([[L, 0], [L, TOP], [250, TOP]], arc(250, 350, 220, 350, 90, -90), [[L, 0]])];
sk.E = [[[R, TOP], [L, TOP], [L, 0], [R, 0]], [[L, 350], [400, 350]]];
sk.F = [[[R, TOP], [L, TOP], [L, 0]], [[L, 350], [400, 350]]];
sk.G = [cat(arc(270, 350, 200, 350, 40, 360), [[270, 350]])];
sk.H = [[[L, 0], [L, TOP]], [[R, 0], [R, TOP]], [[L, 350], [R, 350]]];
sk.I = [[[270, 0], [270, TOP]]];
sk.J = [cat([[R, TOP], [R, 210]], arc(270, 210, 200, 210, 0, -150))];
sk.K = [[[L, 0], [L, TOP]], [[R, TOP], [L, 290]], [[185, 430], [R, 0]]];
sk.L = [[[L, TOP], [L, 0], [R, 0]]];
sk.M = [[[70, 0], [70, TOP], [320, 190], [570, TOP], [570, 0]]];
sk.N = [[[L, 0], [L, TOP], [R, 0], [R, TOP]]];
sk.O = [arc(270, 350, 200, 350, 0, -360)];
sk.P = [[[L, 0], [L, TOP]], cat([[L, TOP], [300, TOP]], arc(300, 525, 175, 175, 90, -90), [[L, 350]])];
sk.Q = [arc(270, 350, 200, 350, 0, -360), [[320, 170], [490, -40]]];
sk.R = [[[L, 0], [L, TOP]], cat([[L, TOP], [300, TOP]], arc(300, 525, 175, 175, 90, -90), [[L, 350]]), [[260, 350], [R, 0]]];
sk.S = [cat(arc(270, 525, 190, 175, 30, 270), arc(270, 175, 190, 175, 90, -150))];
sk.T = [[[40, TOP], [500, TOP]], [[270, TOP], [270, 0]]];
sk.U = [cat([[L, TOP], [L, 230]], arc(270, 230, 200, 230, 180, 360), [[R, TOP]])];
sk.V = [[[L, TOP], [270, 0], [R, TOP]]];
sk.W = [[[40, TOP], [180, 0], [320, 520], [460, 0], [600, TOP]]];
sk.X = [[[L, TOP], [R, 0]], [[L, 0], [R, TOP]]];
sk.Y = [[[L, TOP], [270, 330], [R, TOP]], [[270, 330], [270, 0]]];
sk.Z = [[[L, TOP], [R, TOP], [L, 0], [R, 0]]];

// minúsculas
const bowl = (cx = 250, rx = 180) => arc(cx, 250, rx, 250, 0, -360);
sk.a = [bowl(240, 170), [[410, XH], [410, 0]]];
sk.b = [[[L, 720], [L, 0]], bowl()];
sk.c = [arc(250, 250, 180, 250, 40, 320)];
sk.d = [bowl(240, 170), [[410, 720], [410, 0]]];
sk.e = [cat([[70, 250], [430, 250]], arc(250, 250, 180, 250, 0, 320))];
sk.f = [cat([[200, 0], [200, 600]], arc(330, 600, 130, 115, 180, 65)), [[80, XH], [360, XH]]];
sk.g = [bowl(240, 170), cat([[410, XH], [410, -60]], arc(240, -60, 170, 140, 0, -160))];
sk.h = [[[L, 720], [L, 0]], cat(arc(240, 330, 170, 170, 180, 0), [[410, 0]])];
sk.ı = [[[100, 0], [100, XH]]];
sk.i = [...sk.ı, P(100, 690)];
sk.j = [cat([[210, XH], [210, -60]], arc(90, -60, 120, 140, 0, -150)), P(210, 690)];
sk.k = [[[L, 720], [L, 0]], [[400, XH], [L, 200]], [[180, 300], [420, 0]]];
sk.l = [[[100, 720], [100, 0]]];
sk.m = [[[L, XH], [L, 0]], cat(arc(215, 350, 145, 150, 180, 0), [[360, 0]]), cat(arc(505, 350, 145, 150, 180, 0), [[650, 0]])];
sk.n = [[[L, XH], [L, 0]], cat(arc(240, 330, 170, 170, 180, 0), [[410, 0]])];
sk.o = [bowl()];
sk.p = [[[L, XH], [L, -200]], bowl()];
sk.q = [[[430, XH], [430, -200]], bowl()];
sk.r = [[[L, XH], [L, 0]], arc(240, 330, 170, 170, 180, 60)];
sk.s = [cat(arc(250, 375, 150, 125, 30, 270), arc(250, 125, 150, 125, 90, -150))];
sk.t = [cat([[190, 640], [190, 100]], arc(310, 100, 120, 100, 180, 300)), [[70, XH], [340, XH]]];
sk.u = [cat([[L, XH], [L, 170]], arc(240, 170, 170, 170, 180, 360), [[410, XH], [410, 0]])];
sk.v = [[[50, XH], [250, 0], [450, XH]]];
sk.w = [[[40, XH], [170, 0], [310, 420], [450, 0], [580, XH]]];
sk.x = [[[60, XH], [440, 0]], [[60, 0], [440, XH]]];
sk.y = [[[50, XH], [221, 0]], [[450, XH], [130, -200]]];
sk.z = [[[70, XH], [430, XH], [70, 0], [430, 0]]];

// cifras
sk['0'] = [arc(250, 350, 180, 350, 0, -360)];
sk['1'] = [[[110, 560], [260, TOP], [260, 0]]];
sk['2'] = [cat(arc(250, 500, 180, 200, 165, -35), [[70, 0], [430, 0]])];
sk['3'] = [cat(arc(240, 525, 170, 175, 150, -90), arc(240, 175, 190, 175, 90, -150))];
sk['4'] = [[[360, 0], [360, TOP], [50, 220], [460, 220]]];
sk['5'] = [cat([[430, TOP], [120, TOP], [141, 427]], arc(250, 235, 190, 235, 125, -150))];
sk['6'] = [arc(250, 230, 180, 230, 0, -360), cat([[70, 230], [70, 430]], arc(290, 430, 220, 270, 180, 65))];
sk['7'] = [[[60, TOP], [440, TOP], [190, 0]]];
sk['8'] = [arc(250, 540, 150, 160, 0, -360), arc(250, 190, 180, 190, 0, -360)];
sk['9'] = [arc(250, 470, 180, 230, 0, -360), cat([[430, 470], [430, 270]], arc(210, 270, 220, 270, 0, -115))];

// signos
sk['.'] = [P(100, 0)];
sk[','] = [[[100, 0], [75, -110]]];
sk[':'] = [P(100, 0), P(100, 440)];
sk[';'] = [[[100, 0], [75, -110]], P(100, 440)];
sk['!'] = [[[100, 700], [100, 230]], P(100, 0)];
sk['¡'] = [[[100, 470], [100, 0]], P(100, 700)];
sk['?'] = [cat(arc(240, 510, 170, 190, 160, -50), [[240, 270], [240, 220]]), P(240, 0)];
sk['¿'] = [cat(arc(240, 190, 170, 190, -20, -230), [[240, 430], [240, 480]]), P(240, 700)];
sk['-'] = [[[60, 330], [300, 330]]];
sk['–'] = [[[40, 330], [440, 330]]];
sk['—'] = [[[40, 330], [740, 330]]];
sk['_'] = [[[0, -90], [480, -90]]];
sk['/'] = [[[40, -60], [330, TOP + 40]]];
sk['\\'] = [[[40, TOP + 40], [330, -60]]];
sk['|'] = [[[100, -150], [100, 800]]];
sk['('] = [arc(330, 300, 210, 480, 120, 240)];
sk[')'] = [arc(-10, 300, 210, 480, 60, -60)];
sk['['] = [[[220, 800], [90, 800], [90, -150], [220, -150]]];
sk[']'] = [[[20, 800], [150, 800], [150, -150], [20, -150]]];
sk['+'] = [[[60, 350], [440, 350]], [[250, 160], [250, 540]]];
sk['='] = [[[60, 440], [440, 440]], [[60, 240], [440, 240]]];
sk['*'] = [[[250, 700], [250, 400]], [[120, 625], [380, 475]], [[120, 475], [380, 625]]];
sk['%'] = [[[430, TOP], [70, 0]], arc(130, 570, 75, 85, 0, -360), arc(370, 130, 75, 85, 0, -360)];
sk['&'] = [arc(230, 550, 120, 150, 0, -360), cat([[170, 420], [450, 0]]), arc(240, 170, 170, 170, 40, 270)];
sk['#'] = [[[200, 0], [260, TOP]], [[340, 0], [400, TOP]], [[70, 240], [480, 240]], [[70, 460], [480, 460]]];
sk['@'] = [arc(350, 260, 300, 330, 0, 340), arc(350, 260, 105, 140, 0, -360), [[455, 400], [455, 130]]];
sk['$'] = [...sk.S, [[270, -70], [270, 770]]];
sk['€'] = [arc(290, 350, 200, 330, 45, 315), [[40, 430], [350, 430]], [[40, 270], [350, 270]]];
sk["'"] = [[[100, 700], [100, 520]]];
sk['"'] = [[[100, 700], [100, 520]], [[260, 700], [260, 520]]];
sk['<'] = [[[430, 520], [70, 350], [430, 180]]];
sk['>'] = [[[70, 520], [430, 350], [70, 180]]];
sk['~'] = [Array.from({ length: 21 }, (_, i) => [60 + i * 19, 350 + 55 * Math.sin(i / 20 * 2 * Math.PI)])];
sk['^'] = [[[70, 520], [250, TOP], [430, 520]]];
sk['°'] = [arc(120, 600, 90, 90, 0, -360)];
sk['«'] = [[[220, 470], [80, 250], [220, 30]], [[420, 470], [280, 250], [420, 30]]];
sk['»'] = [[[80, 470], [220, 250], [80, 30]], [[280, 470], [420, 250], [280, 30]]];

// letras voladas ª º
const mini = (key) => sk[key].map((s) => s.map(([x, y]) => [x * 0.55, y * 0.55 + 330]));
sk['ª'] = [...mini('a'), [[0, 300], [200, 300]]];
sk['º'] = [...mini('o'), [[0, 300], [200, 300]]];

// acentos sobre letras base
const centro = (b) => { const xs = b.flat().map((p) => p[0]); return (Math.min(...xs) + Math.max(...xs)) / 2; };
const ACC = {
  '´': (c, t) => [[[c - 30, t], [c + 55, t + 110]]],
  '`': (c, t) => [[[c + 30, t], [c - 55, t + 110]]],
  '¨': (c, t) => [P(c - 65, t + 50), P(c + 65, t + 50)],
  '^': (c, t) => [[[c - 70, t], [c, t + 90], [c + 70, t]]],
  '~': (c, t) => [Array.from({ length: 13 }, (_, i) => [c - 80 + i * 13.3, t + 50 + 32 * Math.sin(i / 12 * 2 * Math.PI)])],
  ',': (c) => [[[c + 10, -20], [c + 40, -90], [c - 15, -135]]],
};
const compuestos = [
  ['á', 'a', '´'], ['é', 'e', '´'], ['í', 'ı', '´'], ['ó', 'o', '´'], ['ú', 'u', '´'],
  ['à', 'a', '`'], ['è', 'e', '`'], ['ì', 'ı', '`'], ['ò', 'o', '`'], ['ù', 'u', '`'],
  ['ä', 'a', '¨'], ['ë', 'e', '¨'], ['ï', 'ı', '¨'], ['ö', 'o', '¨'], ['ü', 'u', '¨'],
  ['â', 'a', '^'], ['ê', 'e', '^'], ['î', 'ı', '^'], ['ô', 'o', '^'], ['û', 'u', '^'],
  ['ñ', 'n', '~'], ['ç', 'c', ','],
  ['Á', 'A', '´'], ['É', 'E', '´'], ['Í', 'I', '´'], ['Ó', 'O', '´'], ['Ú', 'U', '´'],
  ['À', 'A', '`'], ['È', 'E', '`'], ['Ò', 'O', '`'], ['Ù', 'U', '`'],
  ['Ä', 'A', '¨'], ['Ë', 'E', '¨'], ['Ï', 'I', '¨'], ['Ö', 'O', '¨'], ['Ü', 'U', '¨'],
  ['Ñ', 'N', '~'], ['Ç', 'C', ','],
];
for (const [ch, base, a] of compuestos) {
  const mayus = base !== 'ı' && base === base.toUpperCase();
  const c = centro(sk[base]);
  sk[ch] = [...sk[base], ...ACC[a](c, a === ',' ? 0 : mayus ? 730 : 530)];
}

// ---------- de esqueleto a contorno ----------
function contornos(strokes, r, cuadrado) {
  const out = [];
  const area = (pl) => pl.reduce((s, [x, y], i) => { const [x2, y2] = pl[(i + 1) % pl.length]; return s + (x * y2 - x2 * y); }, 0) / 2;
  const horario = (pl) => (area(pl) > 0 ? pl.slice().reverse() : pl); // y hacia arriba: horario = área negativa
  const circ = (x, y) => cuadrado
    ? horario([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]])
    : horario(Array.from({ length: 14 }, (_, i) => { const a = i / 14 * 2 * Math.PI; return [x + r * Math.cos(a), y + r * Math.sin(a)]; }));
  for (const pts of strokes) {
    for (let i = 0; i < pts.length; i++) {
      out.push(circ(pts[i][0], pts[i][1]));
      if (i === 0) continue;
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      if (d < 0.01) continue;
      const nx = -dy / d * r, ny = dx / d * r;
      out.push(horario([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]));
    }
  }
  return out;
}

function fuente(nombre, estilo, r, sb, v) {
  const glifos = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() })];
  glifos.push(new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 260, path: new opentype.Path() }));
  for (const [ch, strokes0] of Object.entries(sk)) {
    const strokes = strokes0.map((s) => s.map(([x, y]) => [x * v.sx + v.sk * y, y]));
    const xs = strokes.flat().map((p) => p[0]);
    const mn = Math.min(...xs), mx = Math.max(...xs);
    const esCifra = /\d/.test(ch);
    const adv = esCifra ? 620 : mx - mn + 2 * r + 2 * sb;
    const dx = esCifra ? (620 - (mx - mn)) / 2 - mn : r + sb - mn;
    const path = new opentype.Path();
    for (const c of contornos(strokes.map((s) => s.map(([x, y]) => [x + dx, y])), r, v.cuadrado)) {
      c.forEach(([x, y], i) => (i ? path.lineTo(Math.round(x), Math.round(y)) : path.moveTo(Math.round(x), Math.round(y))));
      path.close();
    }
    glifos.push(new opentype.Glyph({ name: 'u' + ch.codePointAt(0).toString(16).padStart(4, '0'), unicode: ch.codePointAt(0), advanceWidth: Math.round(adv), path }));
  }
  return new opentype.Font({ familyName: nombre, styleName: estilo, unitsPerEm: 1000, ascender: 960, descender: -260, glyphs: glifos });
}

// Variantes para elegir: r = grosor (radio del trazo), sb = espacio lateral, sx = anchura, sk = inclinación, cuadrado = puntas rectas
const VARIANTES = [
  { id: 'redonda', nombre: 'Redonda', r: [36, 56], sb: [55, 50], sx: 1, sk: 0, cuadrado: false },
  { id: 'fina', nombre: 'Fina', r: [22, 40], sb: [60, 55], sx: 1, sk: 0, cuadrado: false },
  { id: 'ancha', nombre: 'Ancha', r: [42, 62], sb: [65, 60], sx: 1.18, sk: 0, cuadrado: false },
  { id: 'tecnica', nombre: 'Tecnica', r: [34, 54], sb: [50, 46], sx: 0.9, sk: 0, cuadrado: true },
  { id: 'cursiva', nombre: 'Cursiva', r: [36, 56], sb: [55, 50], sx: 0.95, sk: 0.2, cuadrado: false },
];
const soloVar = process.argv[2];
for (const v of VARIANTES) {
  if (soloVar && soloVar !== v.id) continue;
  ['Regular', 'Bold'].forEach((estilo, i) => {
    const f = fuente('Libro Mayor ' + v.nombre, estilo, v.r[i], v.sb[i], v);
    const buf = Buffer.from(f.toArrayBuffer());
    writeFileSync(join(OUT, `LibroMayor-${v.nombre}-${estilo}.otf`), buf);
    console.log(v.nombre, estilo, buf.length, 'bytes');
  });
}
