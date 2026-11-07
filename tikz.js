// Intérprete de un subconjunto de TikZ que produce SVG para la vista previa.
//
// No compila LaTeX: entiende los comandos de dibujo más habituales y avisa de lo demás sin romper nada.
// Funciona sin navegador (las pruebas lo usan en Node); en el navegador se le pasa una función `medir`
// para conocer el tamaño real del texto de los nodos.
//
// Soporta: \draw \fill \filldraw \path \node \coordinate \foreach (también con varias variables, «...»
// y count=), \begin{scope}, \tikzset/\tikzstyle, \pgfmathsetmacro, \def, \definecolor; caminos con
// -- -| |- rectangle circle ellipse arc grid «.. controls ..» to[out,in,bend] edge plot node coordinate
// cycle y árboles con child; coordenadas cartesianas, polares, relativas (+ y ++), de nodos con anclas
// y ($(a)!t!(b)$) / ($(a)+(b)$); colores de xcolor con mezclas (red!30!blue); grosores, discontinuas,
// flechas, opacidad, esquinas redondeadas, scale/xscale/yscale/shift/rotate, posiciones «above=of a».

import { parsearInline } from './latex-parse.js?v=2026.11.07-l';
import { quitarComentarios } from './tikz-libs.js?v=2026.11.07-l';
import { mateHtml } from './mathjax.js?v=2026.11.07-l';

export const PT_CM = 28.4527559;
const UNIDAD = { pt: 1, cm: PT_CM, mm: PT_CM / 10, in: 72.27, bp: 72.27 / 72, em: 10, ex: 4.3, sp: 1 / 65536 };

// ── Colores ────────────────────────────────────────────────────────────

export const COLORES = {
  red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], cyan: [0, 255, 255], magenta: [255, 0, 255], yellow: [255, 255, 0],
  black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], darkgray: [64, 64, 64], lightgray: [191, 191, 191],
  brown: [191, 128, 64], lime: [191, 255, 0], olive: [128, 128, 0], orange: [255, 128, 0], pink: [255, 191, 191],
  purple: [191, 0, 64], teal: [0, 128, 128], violet: [128, 0, 128],
};

function colorRGB(txt, propios) {
  const t = String(txt || '').trim();
  if (!t) return null;
  const partes = t.split('!').map((x) => x.trim());
  const base = (n) => propios[n] || COLORES[n] || null;
  let c = base(partes[0]);
  if (!c) return null;
  for (let i = 1; i < partes.length; i += 2) {
    const p = Math.max(0, Math.min(100, parseFloat(partes[i]))) / 100;
    if (!Number.isFinite(p)) return null;
    const otro = i + 1 < partes.length ? base(partes[i + 1]) : COLORES.white;
    if (!otro) return null;
    c = c.map((v, k) => v * p + otro[k] * (1 - p));
  }
  return c;
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Color de xcolor («red!30!blue», «teal»…) → color CSS, o null si no se conoce. */
export function colorCss(nombre) { const c = colorRGB(nombre, {}); return c ? hex(c) : null; }

// ── Expresiones (pgfmath simplificado) ─────────────────────────────────

const RAD = Math.PI / 180;
const FUNCIONES = {
  sin: (x) => Math.sin(x * RAD), cos: (x) => Math.cos(x * RAD), tan: (x) => Math.tan(x * RAD),
  asin: (x) => Math.asin(x) / RAD, acos: (x) => Math.acos(x) / RAD, atan: (x) => Math.atan(x) / RAD, atan2: (y, x) => Math.atan2(y, x) / RAD,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2, pow: Math.pow,
  min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, int: Math.trunc, mod: (a, b) => a % b,
  deg: (x) => x / RAD, rad: (x) => x * RAD, veclen: (x, y) => Math.hypot(x, y), sign: Math.sign, frac: (x) => x - Math.floor(x),
};

/** Evalúa una expresión. Devuelve { v, dim }: si dim es true, v está en pt. */
export function evaluar(expr) {
  const s = String(expr).replace(/\\pi\b/g, 'pi').replace(/[{}]/g, ' ');
  let i = 0;
  const esp = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const fallo = () => { throw new Error(`No se puede calcular «${expr}»`); };
  function primario() {
    esp();
    const c = s[i];
    if (c === '(') { i++; const r = suma(); esp(); if (s[i] !== ')') fallo(); i++; return r; }
    const mn = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
    if (mn) {
      i += mn[0].length; esp();
      const mu = /^(cm|mm|pt|in|bp|em|ex|sp)(?![a-zA-Z])/.exec(s.slice(i));
      if (mu) { i += mu[0].length; return { v: parseFloat(mn[0]) * UNIDAD[mu[1]], dim: true }; }
      return { v: parseFloat(mn[0]), dim: false };
    }
    const mi = /^[a-zA-Z]\w*/.exec(s.slice(i));
    if (mi) {
      i += mi[0].length;
      const n = mi[0];
      if (n === 'pi') return { v: Math.PI, dim: false };
      if (n === 'e') return { v: Math.E, dim: false };
      if (n === 'true') return { v: 1, dim: false };
      if (n === 'false') return { v: 0, dim: false };
      const f = FUNCIONES[n];
      if (!f) fallo();
      esp(); if (s[i] !== '(') fallo(); i++;
      const args = [];
      esp();
      if (s[i] !== ')') { for (;;) { args.push(suma().v); esp(); if (s[i] === ',') { i++; continue; } break; } }
      esp(); if (s[i] !== ')') fallo(); i++;
      return { v: f(...args), dim: false };
    }
    fallo();
  }
  function postfijo() {
    const r = primario();
    esp();
    if (s[i] === 'r' && !/[a-zA-Z]/.test(s[i + 1] || '')) { i++; return { v: r.v / RAD, dim: r.dim }; } // 2r = radianes
    return r;
  }
  function potencia() {
    const b = postfijo(); esp();
    if (s[i] === '^') { i++; const e = unario(); return { v: Math.pow(b.v, e.v), dim: b.dim }; }
    return b;
  }
  function unario() { esp(); if (s[i] === '-') { i++; const r = unario(); return { v: -r.v, dim: r.dim }; } if (s[i] === '+') { i++; return unario(); } return potencia(); }
  function producto() {
    let a = unario();
    for (;;) {
      esp();
      if (s[i] === '*') { i++; const b = unario(); a = { v: a.v * b.v, dim: a.dim || b.dim }; }
      else if (s[i] === '/') { i++; const b = unario(); a = { v: a.v / b.v, dim: a.dim && !b.dim }; }
      else return a;
    }
  }
  function suma() {
    let a = producto();
    for (;;) {
      esp();
      if (s[i] === '+' || s[i] === '-') {
        const op = s[i++]; const b = producto();
        // 1cm + 2 → el número sin unidad se toma en pt, como hace TikZ
        const v = op === '+' ? a.v + b.v : a.v - b.v;
        a = { v, dim: a.dim || b.dim };
      } else return a;
    }
  }
  const r = suma(); esp();
  if (i < s.length || !Number.isFinite(r.v)) fallo();
  return r;
}
/** Longitud en pt (sin unidad: `def` es la unidad por defecto, en pt). */
function longitud(expr, def = PT_CM) { const r = evaluar(expr); return r.dim ? r.v : r.v * def; }
const numero = (expr) => evaluar(expr).v;

// ── Lectura de texto ───────────────────────────────────────────────────

function cerrarCon(s, i, abre, cierra) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '{' && abre !== '{') { const k = cerrarCon(s, j, '{', '}'); if (k < 0) return -1; j = k - 1; continue; }
    if (c === abre) d++;
    else if (c === cierra) { d--; if (d === 0) return j + 1; }
  }
  return -1;
}
const grupoEn = (s, i) => { if (s[i] !== '{') return null; const f = cerrarCon(s, i, '{', '}'); return f < 0 ? null : { txt: s.slice(i + 1, f - 1), fin: f }; };
const opcEn = (s, i) => { if (s[i] !== '[') return null; const f = cerrarCon(s, i, '[', ']'); return f < 0 ? null : { txt: s.slice(i + 1, f - 1), fin: f }; };
const parEn = (s, i) => { if (s[i] !== '(') return null; const f = cerrarCon(s, i, '(', ')'); return f < 0 ? null : { txt: s.slice(i + 1, f - 1), fin: f }; };
const saltar = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

/** Divide por comas de nivel superior (fuera de llaves, corchetes y paréntesis). */
export function dividirComas(s) {
  const out = []; let d = 0, ini = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if ('{[('.includes(c)) d++;
    else if ('}])'.includes(c)) d--;
    else if (c === ',' && d === 0) { out.push(s.slice(ini, i)); ini = i + 1; }
  }
  out.push(s.slice(ini));
  return out.map((x) => x.trim()).filter((x) => x !== '');
}

export { quitarComentarios };

/** Fin de una sentencia (el «;» de nivel superior) a partir de i. */
function finSentencia(s, i) {
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '{') { const f = cerrarCon(s, j, '{', '}'); if (f < 0) return s.length; j = f - 1; continue; }
    if (c === '[') { const f = cerrarCon(s, j, '[', ']'); if (f > 0) { j = f - 1; continue; } }
    if (c === '(') { const f = cerrarCon(s, j, '(', ')'); if (f > 0) { j = f - 1; continue; } }
    if (c === ';') return j + 1;
  }
  return s.length;
}

/**
 * Parte el código en sentencias de nivel superior conservando el texto exacto (espacios y comentarios
 * incluidos). La herramienta de dibujo lo usa para reescribir solo lo que entiende.
 */
export function dividirSentencias(src) {
  const s = String(src);
  const out = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (j >= s.length) { out.push(s.slice(i)); break; }
    let fin;
    if (s[j] === '%') { fin = s.indexOf('\n', j); fin = fin < 0 ? s.length : fin + 1; }
    else if (s.startsWith('\\foreach', j)) fin = finForeach(s, j);
    else if (s.startsWith('\\begin{scope}', j)) { const k = s.indexOf('\\end{scope}', j); fin = k < 0 ? s.length : k + 11; }
    else fin = finSentencia(s, j);
    // el resto de la línea (espacios y un comentario) va con la sentencia
    const m = /^[ \t]*(%[^\n]*)?\n?/.exec(s.slice(fin));
    fin += m ? m[0].length : 0;
    out.push(s.slice(i, fin));
    i = fin;
  }
  return out;
}

function finForeach(s, j) {
  let k = j + 8;
  const enIn = s.indexOf(' in', k);
  if (enIn < 0) return finSentencia(s, j);
  k = saltar(s, enIn + 3);
  const lista = grupoEn(s, k);
  if (!lista) return finSentencia(s, j);
  k = saltar(s, lista.fin);
  if (s[k] === '{') { const g = grupoEn(s, k); return g ? g.fin : s.length; }
  if (s.startsWith('\\foreach', k)) return finForeach(s, k);
  return finSentencia(s, k);
}

// ── Transformaciones afines [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f ──

const ID = [1, 0, 0, 1, 0, 0];
const mult = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const aplicar = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const aplicarV = (m, p) => ({ x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y });

// ── Estilos ────────────────────────────────────────────────────────────

const GROSORES = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };
const DISCONTINUA = {
  solid: null, dashed: [3, 3], 'densely dashed': [3, 2], 'loosely dashed': [3, 6], dotted: [0, 2], 'densely dotted': [0, 1], 'loosely dotted': [0, 4],
  'dash dot': [3, 2, 0, 2], 'dash dot dot': [3, 2, 0, 2, 0, 2], 'densely dash dot': [3, 1, 0, 1], 'loosely dash dot': [3, 4, 0, 4],
};
const FUENTES = { '\\tiny': 5, '\\scriptsize': 7, '\\footnotesize': 8, '\\small': 9, '\\normalsize': 10, '\\large': 12, '\\Large': 14.4, '\\LARGE': 17.28, '\\huge': 20.74, '\\Huge': 24.88 };
const ANCLAS = {
  center: [0, 0], north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0],
  'north east': [1, 1], 'north west': [-1, 1], 'south east': [1, -1], 'south west': [-1, -1],
  'mid': [0, 0], 'base': [0, 0], 'text': [0, 0], 'mid east': [1, 0], 'mid west': [-1, 0], 'base east': [1, 0], 'base west': [-1, 0],
};
const OPUESTA = { above: 'south', below: 'north', left: 'east', right: 'west', 'above left': 'south east', 'above right': 'south west', 'below left': 'north east', 'below right': 'north west' };
const DIRECCION = { above: [0, 1], below: [0, -1], left: [-1, 0], right: [1, 0], 'above left': [-1, 1], 'above right': [1, 1], 'below left': [-1, -1], 'below right': [1, -1] };
// Opciones que no cambian la vista previa de forma apreciable: se aceptan en silencio.
const SILENCIO = /^(smooth|sharp corners|sloped|auto|swap|'|on grid|line cap|line join|miter limit|>|baseline|remember picture|overlay|every |transform shape|execute at|trim|use as bounding box|name|outer sep|outer xsep|outer ysep|anchor|samples|domain|variable|mark|mark size|only marks|tension|looseness|level|edge from parent|growth parent anchor|parent anchor|child anchor|inner xsep|inner ysep|text depth|text height|node distance|label distance|pin distance|thin|semithick|thick|text centered|text ragged|text badly centered|align|tight|bend|in|out|relative|nodes|minimum|on layer|draw opacity|fill opacity|text opacity|opacity|font|level distance|sibling distance|grow|x|y|z|xstep|ystep|step|radius|x radius|y radius|start angle|end angle|delta angle|help lines|>=)/;

function nuevoEstilo() {
  return {
    color: [0, 0, 0], dibujar: null, rellenar: null, texto: null, lw: 0.4, dash: null, flechaI: null, flechaF: null, tipoFlecha: 'to',
    opac: 1, opacDib: 1, opacRel: 1, opacTxt: 1, redondeo: 0, forma: 'rectangle', dibujaNodo: false, rellenaNodo: null, innerSep: 3.333,
    minW: 0, minH: 0, anchoTexto: 0, fuente: 10, negrita: false, cursiva: false, mono: false, sans: false, alinear: 'center',
    ancla: null, desplazar: null, de: null, distancia: PT_CM, pos: null, etiquetas: [], nodeDistance: [PT_CM, PT_CM], deDeprecado: null,
    paso: [PT_CM, PT_CM], dominio: [-5, 5], muestras: 25, variable: '\\x', liso: false, outA: null, inA: null, curvar: 0, holgura: 1,
    nivel: PT_CM * 1.5 / 1, hermanos: PT_CM * 1.5, crecer: 'down', niveles: {}, radio: null, radioX: null, radioY: null,
    anguloIni: null, anguloFin: null, anguloDelta: null, matriz: ID,
  };
}

/** Interpreta un tipo de punta de flecha: «>», «stealth», «{Latex[length=3mm]}», «|»… */
function tipoPunta(t, porDefecto) {
  const s = t.replace(/[{}]/g, '').replace(/\[.*\]/, '').trim();
  if (!s) return null;
  if (s === '>' || s === '>>') return porDefecto;
  if (s === '<' || s === '<<') return porDefecto;
  if (s === '|') return 'barra';
  if (/^(stealth|Stealth|Straight Barb|Kite|Triangle)/.test(s)) return 'stealth';
  if (/^(latex|Latex)/.test(s)) return 'latex';
  if (/^(to|To|Classical TikZ Rightarrow|Computer Modern Rightarrow|cm to|Arc Barb)/.test(s)) return 'to';
  if (/^(Circle|o)$/.test(s)) return 'circulo';
  if (/^(Bar|Bracket|\]|\[)$/.test(s)) return 'barra';
  return porDefecto;
}

// ── Intérprete ─────────────────────────────────────────────────────────

const estimar = (html, fuente, op = {}) => {
  const lineas = String(html).split(/<br\s*\/?>/i);
  const texto = (x) => x.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, 'x');
  const largo = Math.max(1, ...lineas.map((l) => texto(l).length));
  let w = largo * fuente * (op.negrita ? 0.56 : 0.5);
  let n = lineas.length;
  if (op.ancho && w > op.ancho) { n = Math.ceil(w / op.ancho) + lineas.length - 1; w = op.ancho; }
  return { w: lineas.join('').trim() ? w : 0, h: n * fuente * 1.2 };
};

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto de un nodo (LaTeX) → HTML: negrita, cursiva, fórmulas con MathJax si está listo (síncrono: tex2chtml), saltos «\\». */
export function htmlDeTexto(tex) {
  const nodos = parsearInline(String(tex));
  const un = (n) => {
    if (n.br) return '<br>';
    if (n.mate != null) {
      const html = mateHtml(n.mate, false);
      if (html) return html;
      return `<i>${escHtml(n.mate)}</i>`;
    }
    if (n.s != null) {
      let t = escHtml(n.s);
      if (n.b) t = `<b>${t}</b>`; if (n.i) t = `<i>${t}</i>`; if (n.u) t = `<u>${t}</u>`; if (n.c) t = `<code>${t}</code>`;
      if (n.sub) t = `<sub>${t}</sub>`; if (n.sup) t = `<sup>${t}</sup>`; if (n.st) t = `<s>${t}</s>`;
      return t;
    }
    if (n.raw != null) {
      const m = /^\\(textcolor|color)\{([^}]*)\}/.exec(n.raw);
      if (m) return '';
      return /^\\[a-zA-Z]+$/.test(n.raw) ? '' : escHtml(n.raw.replace(/\\[a-zA-Z]+\*?|[{}]/g, ''));
    }
    if (n.url != null) return (n.c || []).map(un).join('');
    return '';
  };
  return nodos.map(un).join('');
}

/**
 * @param {string} src     contenido de la tikzpicture (sin \begin…\end)
 * @param {object} op      { opc: opciones de la tikzpicture, medir: (html, fuentePt, {negrita, ancho}) → {w,h} en pt }
 * @returns {{ elementos: object[], caja: {x0,y0,x1,y1}|null, avisos: string[] }}
 */
export function interpretarTikz(src, { opc = '', medir = null } = {}) {
  const avisos = new Set();
  const aviso = (t) => { if (avisos.size < 30) avisos.add(t); };
  const elementos = [];
  const nodos = new Map();
  const estilos = new Map();
  const propios = {};
  const macros = new Map();
  let pasos = 0;
  const medirTxt = medir || estimar;

  // ── opciones ──
  function aplicarOpciones(est, txt, ctx = 'camino', prof = 0) {
    if (!txt || prof > 8) return est;
    for (const o of dividirComas(txt)) {
      const m = /^([^=]+?)\s*=\s*([\s\S]*)$/.exec(o);
      const k = (m ? m[1] : o).trim(), v = m ? m[2].trim().replace(/^\{([\s\S]*)\}$/, '$1') : null;
      try { opcion(est, k, v, o, ctx, prof); } catch (e) { aviso(`Opción no entendida: «${o}»`); }
    }
    return est;
  }
  function opcion(est, k, v, crudo, ctx, prof) {
    if (/\/\.(style|append style)$/.test(k)) {
      const nombre = k.replace(/\/\.(style|append style)$/, '').trim();
      if (/^level \d+$/.test(nombre)) { est.niveles = { ...est.niveles, [nombre.slice(6)]: v || '' }; return; }
      estilos.set(nombre, (/append/.test(k) && estilos.get(nombre) ? estilos.get(nombre) + ',' : '') + (v || ''));
      return;
    }
    if (v == null && estilos.has(k)) { aplicarOpciones(est, estilos.get(k), ctx, prof + 1); return; }
    if (v == null && /-/.test(k) && /^[^=]*-[^=]*$/.test(k) && /[<>|{}\]\[]|stealth|latex|to\b/i.test(k) && !/ /.test(k.replace(/\{[^}]*\}/g, ''))) {
      // especificación de flechas: «->», «<->», «-{Stealth}», «|-|»…
      const idx = k.replace(/\{[^}]*\}/g, (x) => '_'.repeat(x.length)).indexOf('-');
      const a = k.slice(0, idx), b = k.slice(idx + 1);
      est.flechaI = tipoPunta(a, est.tipoFlecha); est.flechaF = tipoPunta(b, est.tipoFlecha);
      return;
    }
    if (k === '>' && v) { est.tipoFlecha = tipoPunta(v, 'to') || 'to'; return; }
    if (v == null && GROSORES[k] != null) { est.lw = GROSORES[k]; return; }
    if (v == null && k in DISCONTINUA) { est.dash = DISCONTINUA[k]; return; }
    if (v == null && OPUESTA[k]) { est.ancla = OPUESTA[k]; est.desplazar = null; est.de = null; return; }
    if (OPUESTA[k] && v != null) {
      const mo = /^(?:([^]*?)\s+)?of\s+(.+)$/.exec(v);
      if (mo) { est.de = { dir: k, nodo: mo[2].trim(), dist: mo[1] ? mo[1].split(/\s+and\s+/).map((x) => longitud(x)) : null }; est.ancla = OPUESTA[k]; }
      else { est.ancla = OPUESTA[k]; est.desplazar = { dir: k, d: longitud(v) }; }
      return;
    }
    const deprec = /^(above|below|left|right)( (left|right))? of$/.exec(k);
    if (deprec && v) { est.deDeprecado = { dir: deprec[1] + (deprec[2] || ''), nodo: v }; return; }
    if (v == null) {
      const c = colorRGB(k, propios);
      if (c) { est.color = c; return; }
    }
    switch (k) {
      case 'draw': if (v == null) est.dibujar = est.dibujar || 'actual'; else if (v === 'none') est.dibujar = 'ninguno'; else est.dibujar = colorRGB(v, propios) || aviso(`Color desconocido: ${v}`) || 'actual'; est.dibujaNodo = v !== 'none'; return;
      case 'fill': if (v == null) est.rellenar = 'actual'; else if (v === 'none') est.rellenar = null; else est.rellenar = colorRGB(v, propios) || (aviso(`Color desconocido: ${v}`), 'actual'); est.rellenaNodo = est.rellenar; return;
      case 'color': { const c = colorRGB(v, propios); if (c) est.color = c; else aviso(`Color desconocido: ${v}`); return; }
      case 'text': { const c = colorRGB(v, propios); if (c) est.texto = c; return; }
      case 'line width': est.lw = longitud(v, 1); return;
      case 'dash pattern': { const n = [...v.matchAll(/(on|off)\s+([\d.]+\s*\w*)/g)].map((x) => longitud(x[2], 1)); est.dash = n.length ? n : null; return; }
      case 'opacity': est.opac = numero(v); return;
      case 'draw opacity': est.opacDib = numero(v); return;
      case 'fill opacity': est.opacRel = numero(v); return;
      case 'text opacity': est.opacTxt = numero(v); return;
      case 'rounded corners': est.redondeo = v == null ? 4 : longitud(v, 1); return;
      case 'sharp corners': est.redondeo = 0; return;
      case 'circle': case 'rectangle': case 'ellipse': case 'diamond': case 'coordinate': est.forma = k; return;
      case 'shape': est.forma = v; return;
      case 'inner sep': est.innerSep = longitud(v, 1); return;
      case 'aspect': est.aspecto = numero(v); return;
      case 'minimum size': est.minW = est.minH = longitud(v, 1); return;
      case 'minimum width': est.minW = longitud(v, 1); return;
      case 'minimum height': est.minH = longitud(v, 1); return;
      case 'text width': est.anchoTexto = longitud(v, 1); return;
      case 'align': est.alinear = v; return;
      case 'font': {
        for (const [cmd, tam] of Object.entries(FUENTES)) if (v.includes(cmd)) est.fuente = tam;
        if (/\\bfseries|\\bf\b/.test(v)) est.negrita = true;
        if (/\\itshape|\\it\b/.test(v)) est.cursiva = true;
        if (/\\ttfamily/.test(v)) est.mono = true;
        if (/\\sffamily/.test(v)) est.sans = true;
        return;
      }
      case 'anchor': est.ancla = v; return;
      case 'xshift': est.matriz = mult(est.matriz, [1, 0, 0, 1, longitud(v), 0]); return;
      case 'yshift': est.matriz = mult(est.matriz, [1, 0, 0, 1, 0, longitud(v)]); return;
      case 'shift': { const p = coord(v.replace(/^\{|\}$/g, '').replace(/^\(|\)$/g, ''), { usarMatriz: false }); est.matriz = mult(est.matriz, [1, 0, 0, 1, p.x, p.y]); return; }
      case 'scale': { const f = numero(v); est.matriz = mult(est.matriz, [f, 0, 0, f, 0, 0]); return; }
      case 'xscale': est.matriz = mult(est.matriz, [numero(v), 0, 0, 1, 0, 0]); return;
      case 'yscale': est.matriz = mult(est.matriz, [1, 0, 0, numero(v), 0, 0]); return;
      case 'rotate': { const a = numero(v) * RAD; est.matriz = mult(est.matriz, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); return; }
      case 'x': est.matriz = mult(est.matriz, [longitud(v) / PT_CM, 0, 0, 1, 0, 0]); return;
      case 'y': est.matriz = mult(est.matriz, [1, 0, 0, longitud(v) / PT_CM, 0, 0]); return;
      case 'pos': est.pos = numero(v); return;
      case 'midway': est.pos = 0.5; return;
      case 'near start': est.pos = 0.25; return;
      case 'near end': est.pos = 0.75; return;
      case 'at start': est.pos = 0; return;
      case 'at end': est.pos = 1; return;
      case 'very near start': est.pos = 0.125; return;
      case 'very near end': est.pos = 0.875; return;
      case 'node distance': est.nodeDistance = v.split(/\s+and\s+/).map((x) => longitud(x)); if (est.nodeDistance.length === 1) est.nodeDistance.push(est.nodeDistance[0]); return;
      case 'label': est.etiquetas = [...est.etiquetas, v]; return;
      case 'step': { const p = /^\(?([^,]+),([^)]+)\)?$/.exec(v); est.paso = p ? [longitud(p[1]), longitud(p[2])] : [longitud(v), longitud(v)]; return; }
      case 'xstep': est.paso = [longitud(v), est.paso[1]]; return;
      case 'ystep': est.paso = [est.paso[0], longitud(v)]; return;
      case 'help lines': est.color = COLORES.gray; est.lw = 0.2; return;
      case 'domain': { const [a, b] = v.split(':'); est.dominio = [numero(a), numero(b)]; return; }
      case 'samples': est.muestras = Math.max(2, Math.min(400, Math.round(numero(v)))); return;
      case 'variable': est.variable = v; return;
      case 'smooth': est.liso = true; return;
      case 'out': est.outA = numero(v); return;
      case 'in': est.inA = numero(v); return;
      case 'bend left': est.curvar = v == null ? 30 : numero(v); return;
      case 'bend right': est.curvar = -(v == null ? 30 : numero(v)); return;
      case 'looseness': est.holgura = numero(v); return;
      case 'level distance': est.nivel = longitud(v); return;
      case 'sibling distance': est.hermanos = longitud(v); return;
      case 'grow': est.crecer = v; return;
      case 'radius': est.radio = longitud(v); return;
      case 'x radius': est.radioX = longitud(v); return;
      case 'y radius': est.radioY = longitud(v); return;
      case 'start angle': est.anguloIni = numero(v); return;
      case 'end angle': est.anguloFin = numero(v); return;
      case 'delta angle': est.anguloDelta = numero(v); return;
      case 'regular polygon': case 'star': case 'trapezium': case 'cylinder': case 'isosceles triangle': est.forma = 'rectangle'; aviso(`La forma «${k}» se muestra como rectángulo`); return;
      case 'pattern': est.rellenar = COLORES.lightgray; aviso('Los rellenos con «pattern» se muestran en gris'); return;
      case 'decorate': case 'decoration': case 'postaction': case 'preaction': case 'drop shadow': case 'shading': case 'top color': case 'bottom color': case 'left color': case 'right color': case 'ball color': case 'inner color': case 'outer color':
        aviso(`«${k}» no se muestra en la vista previa (sí al compilar)`); return;
      default:
        if (SILENCIO.test(k)) return;
        aviso(`Opción no reconocida: «${crudo}» (se ignora en la vista previa)`);
    }
  }
  const estiloDe = (base, txt, ctx) => aplicarOpciones({ ...base, etiquetas: [] }, txt, ctx);
  const colorFinal = (c, est) => (c === 'actual' || c == null ? est.color : c);

  // ── coordenadas ──
  let ctxCoord = { matriz: ID };
  function coord(txt, { usarMatriz = true } = {}) {
    const m = usarMatriz ? ctxCoord.matriz : ID;
    let t = txt.trim();
    if (/^\$[\s\S]*\$$/.test(t)) return calc(t.slice(1, -1).trim());
    const partes = dividirComas(t);
    if (partes.length === 2) {
      const x = evaluar(partes[0]), y = evaluar(partes[1]);
      return aplicar(m, { x: x.dim ? x.v : x.v * PT_CM, y: y.dim ? y.v : y.v * PT_CM });
    }
    if (partes.length === 3) throw new Error('Las coordenadas 3D no se muestran en la vista previa');
    // polar: ángulo:radio
    const pol = /^([^:]+):([\s\S]+)$/.exec(t);
    if (pol && !nodos.has(t)) {
      const a = numero(pol[1]) * RAD;
      const r2 = pol[2].split(/\s+and\s+/);
      const rx = longitud(r2[0]), ry = r2[1] ? longitud(r2[1]) : rx;
      return aplicar(m, { x: rx * Math.cos(a), y: ry * Math.sin(a) });
    }
    return puntoDeNodo(t);
  }
  function puntoDeNodo(t, hacia = null) {
    const mm = /^(.+?)(?:\.(.+))?$/.exec(t.trim());
    let n = nodos.get(t.trim()), ancla = null;
    if (!n && mm && nodos.has(mm[1].trim())) { n = nodos.get(mm[1].trim()); ancla = mm[2].trim(); }
    if (!n) throw new Error(`No existe el nodo o coordenada «${t}»`);
    if (!ancla) return { x: n.x, y: n.y, nodo: n };
    return anclaje(n, ancla);
  }
  function anclaje(n, ancla) {
    if (/^-?[\d.]+$/.test(ancla)) return borde(n, Number(ancla));
    const d = ANCLAS[ancla];
    if (!d) throw new Error(`Ancla desconocida: ${ancla}`);
    if (!d[0] && !d[1]) return { x: n.x, y: n.y };
    if (n.forma === 'rectangle' || n.forma === 'coordinate') return { x: n.x + d[0] * n.w / 2, y: n.y + d[1] * n.h / 2 };
    return borde(n, Math.atan2(d[1], d[0]) / RAD);
  }
  /** Punto del borde de un nodo en la dirección `ang` (grados). */
  function borde(n, ang) {
    const a = ang * RAD, cx = Math.cos(a), sy = Math.sin(a);
    const w = n.w / 2, h = n.h / 2;
    if (n.forma === 'coordinate' || (!w && !h)) return { x: n.x, y: n.y };
    let t;
    if (n.forma === 'circle') t = Math.max(w, h);
    else if (n.forma === 'ellipse') t = 1 / Math.sqrt((cx / w) ** 2 + (sy / h) ** 2);
    else if (n.forma === 'diamond') t = 1 / (Math.abs(cx) / w + Math.abs(sy) / h);
    else t = Math.min(Math.abs(cx) > 1e-9 ? w / Math.abs(cx) : Infinity, Math.abs(sy) > 1e-9 ? h / Math.abs(sy) : Infinity);
    return { x: n.x + t * cx, y: n.y + t * sy };
  }
  const bordeHacia = (n, p) => borde(n, Math.atan2(p.y - n.y, p.x - n.x) / RAD);
  function calc(expr) {
    // ($(a)!0.5!(b)$), ($(a)+(1,0)$), ($(a)!1cm!(b)$), ($2*(a)-(b)$)
    const part = /^\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*!\s*([^!]+)\s*!\s*\(([^()]*)\)$/.exec(expr);
    if (part) {
      const a = coord(part[1]), b = coord(part[3]);
      const tt = evaluar(part[2]);
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = tt.dim ? tt.v / d : tt.v;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    let x = 0, y = 0, i = 0;
    const s = expr;
    let signo = 1;
    while (i < s.length) {
      i = saltar(s, i);
      if (s[i] === '+') { signo = 1; i++; continue; }
      if (s[i] === '-') { signo = -1; i++; continue; }
      let f = 1;
      const mf = /^([\d.]+)\s*\*?\s*(?=\()/.exec(s.slice(i));
      if (mf) { f = parseFloat(mf[1]); i += mf[0].length; }
      const p = parEn(s, i);
      if (!p) throw new Error(`Cálculo de coordenadas no soportado: ${expr}`);
      const c = coord(p.txt);
      x += signo * f * c.x; y += signo * f * c.y; i = p.fin; signo = 1;
    }
    return { x, y };
  }

  // ── nodos ──
  function crearNodo(estBase, opcTxt, nombre, texto, en) {
    const est = estiloDe(estBase, (estilos.get('every node') || '') + ',' + (opcTxt || ''), 'nodo');
    const html = htmlDeTexto(texto);
    let w, h;
    if (est.forma === 'coordinate') { w = 0; h = 0; }
    else {
      const t = medirTxt(html, est.fuente, { negrita: est.negrita, ancho: est.anchoTexto || 0, mono: est.mono });
      const tw = est.anchoTexto || t.w, th = Math.max(t.h, html ? 0 : 0);
      w = tw + 2 * est.innerSep; h = th + 2 * est.innerSep;
      if (est.forma === 'circle') { const d = Math.hypot(w, h); w = h = Math.max(d, est.minW, est.minH); }
      else if (est.forma === 'ellipse') { w *= Math.SQRT2; h *= Math.SQRT2; }
      else if (est.forma === 'diamond') { const a = est.aspecto || 1; const H = tw / (2 * a) + th / 2 + est.innerSep; w = 2 * a * H; h = 2 * H; }
      w = Math.max(w, est.minW); h = Math.max(h, est.minH);
    }
    let p = en || { x: 0, y: 0 };
    let ancla = est.ancla || 'center';
    if (est.de) {
      const ref = nodos.get(est.de.nodo.replace(/\..*$/, '').trim());
      if (!ref) throw new Error(`No existe el nodo «${est.de.nodo}»`);
      const dir = DIRECCION[est.de.dir];
      const dist = est.de.dist || est.nodeDistance;
      const dx = dist[0], dy = dist.length > 1 ? dist[1] : dist[0];
      const desde = anclaje(ref, ref.forma === 'coordinate' ? 'center' : (OPUESTA[est.de.dir] ? oposicion(OPUESTA[est.de.dir]) : 'center'));
      p = { x: desde.x + dir[0] * (dir[1] ? dx : dx), y: desde.y + dir[1] * (dir[0] ? dy : dy) };
      if (!dir[0]) p.x = desde.x; if (!dir[1]) p.y = desde.y;
    } else if (est.deDeprecado) {
      const ref = nodos.get(est.deDeprecado.nodo.trim());
      if (ref) { const dir = DIRECCION[est.deDeprecado.dir]; p = { x: ref.x + dir[0] * est.nodeDistance[0], y: ref.y + dir[1] * est.nodeDistance[1] }; }
    }
    if (est.desplazar) { const d = DIRECCION[est.desplazar.dir]; const n = Math.hypot(d[0], d[1]); p = { x: p.x + d[0] / n * est.desplazar.d, y: p.y + d[1] / n * est.desplazar.d }; }
    // xshift/yshift propios del nodo (la posición ya trae las transformaciones del camino o del scope)
    p = { x: p.x + est.matriz[4] - estBase.matriz[4], y: p.y + est.matriz[5] - estBase.matriz[5] };
    // el ancla elegida queda en p: el centro se desplaza
    const temporal = { x: 0, y: 0, w, h, forma: est.forma === 'coordinate' ? 'coordinate' : est.forma };
    const off = ANCLAS[ancla] || /^-?[\d.]+$/.test(ancla) ? anclaje(temporal, ancla) : { x: 0, y: 0 };
    const n = { x: p.x - off.x, y: p.y - off.y, w, h, forma: temporal.forma, est, html };
    if (nombre) nodos.set(nombre, n);
    if (est.forma !== 'coordinate') elementos.push({ k: 'nodo', ...n, est: resumenEst(est) });
    for (const lab of est.etiquetas) etiqueta(n, lab, estBase);
    return n;
  }
  const oposicion = (a) => ({ south: 'north', north: 'south', east: 'west', west: 'east', 'south east': 'north west', 'south west': 'north east', 'north east': 'south west', 'north west': 'south east' }[a] || 'center');
  function etiqueta(n, lab, estBase) {
    let txt = lab.trim(), opc = '';
    const o = opcEn(txt, 0); if (o) { opc = o.txt; txt = txt.slice(o.fin); }
    const m = /^([a-z ]+|-?[\d.]+):([\s\S]*)$/.exec(txt);
    const pos = m ? m[1].trim() : 'above', texto = (m ? m[2] : txt).replace(/^\{([\s\S]*)\}$/, '$1');
    let ang = { above: 90, below: 270, left: 180, right: 0, 'above left': 135, 'above right': 45, 'below left': 225, 'below right': 315 }[pos];
    if (ang == null) ang = Number(pos) || 90;
    const b = n.forma === 'coordinate' ? { x: n.x, y: n.y } : borde(n, ang);
    const dirs = [[0, 'west'], [45, 'south west'], [90, 'south'], [135, 'south east'], [180, 'east'], [225, 'north east'], [270, 'north'], [315, 'north west'], [360, 'west']];
    const a2 = ((ang % 360) + 360) % 360;
    const anc = dirs.reduce((x, y) => (Math.abs(y[0] - a2) < Math.abs(x[0] - a2) ? y : x))[1];
    crearNodo({ ...estBase, ancla: null, de: null, desplazar: null, etiquetas: [], matriz: ID }, `anchor=${anc},${opc}`, null, texto, b);
  }
  const resumenEst = (e) => ({
    dibujar: e.dibujaNodo ? colorFinal(e.dibujar, e) : null, rellenar: e.rellenaNodo ? colorFinal(e.rellenaNodo, e) : null,
    texto: e.texto || e.color, lw: e.lw, dash: e.dash, opacDib: e.opac * e.opacDib, opacRel: e.opac * e.opacRel, opacTxt: e.opac * e.opacTxt,
    redondeo: e.redondeo, fuente: e.fuente, negrita: e.negrita, cursiva: e.cursiva, mono: e.mono, sans: e.sans, alinear: e.alinear, anchoTexto: e.anchoTexto,
  });

  // ── caminos ──
  function camino(cmd, resto, estBase) {
    let i = 0;
    const s = resto;
    let est = { ...estBase };
    const o0 = opcEn(s, saltar(s, 0));
    if (o0) { est = estiloDe(estBase, o0.txt, 'camino'); i = o0.fin; }
    const prevMatriz = ctxCoord.matriz;
    const inicioCamino = elementos.length; // el camino se dibuja debajo de los nodos que crea
    ctxCoord = { matriz: est.matriz };
    const segs = []; // comandos: ['M',p] ['L',p] ['C',c1,c2,p] ['Z']
    let cur = null, ref = null, curNodo = null, ini = null, ultimo = null;
    const pendientes = []; // nodos del camino: se colocan al final del segmento
    const mover = (p) => { segs.push(['M', p]); ini = p; };
    const inicioDesde = (hacia) => {
      // si el punto actual es un nodo con tamaño, el trazo empieza en su borde (una coordenada no tiene borde)
      if (curNodo && (curNodo.w || curNodo.h)) { const b = bordeHacia(curNodo, hacia); mover(b); return b; }
      if (!segs.length) mover(cur);
      return cur;
    };
    const destino = (txt, desde) => {
      let rel = 0, t = txt;
      if (t.startsWith('++')) { rel = 2; t = t.slice(2); } else if (t.startsWith('+')) { rel = 1; t = t.slice(1); }
      const pp = parEn(t, saltar(t, 0));
      const interior = pp ? pp.txt : t;
      if (rel) {
        const v = coordRel(interior);
        const p = { x: (ref || cur || { x: 0, y: 0 }).x + v.x, y: (ref || cur || { x: 0, y: 0 }).y + v.y };
        return { p, rel };
      }
      const p = coord(interior);
      return { p: { x: p.x, y: p.y }, nodo: p.nodo && !/\./.test(interior) ? p.nodo : null, rel };
    };
    const coordRel = (t) => {
      const p0 = aplicar(ctxCoord.matriz, { x: 0, y: 0 });
      const p = coord(t);
      if (p.nodo) throw new Error('Una coordenada relativa no puede ser un nodo');
      return { x: p.x - p0.x, y: p.y - p0.y };
    };
    const fijar = (d, p) => { cur = p; curNodo = d.nodo || null; if (d.rel !== 1) ref = p; };
    const leerCoord = () => {
      i = saltar(s, i);
      let pre = '';
      if (s.startsWith('++', i)) { pre = '++'; i += 2; } else if (s[i] === '+') { pre = '+'; i++; }
      i = saltar(s, i);
      const p = parEn(s, i);
      if (!p) throw new Error('Se esperaba una coordenada');
      i = p.fin;
      return pre + '(' + p.txt + ')';
    };
    let segAnt = null; // para «node[midway]»: [p0, …puntos]

    while (i < s.length) {
      i = saltar(s, i);
      if (i >= s.length || s[i] === ';') break;
      if (++pasos > 200000) throw new Error('El dibujo es demasiado grande para la vista previa');
      const r = s.slice(i);
      if (r[0] === '(' || r[0] === '+') {
        const d = destino(leerCoord(), cur);
        fijar(d, d.p);
        if (!d.nodo || !(d.nodo.w || d.nodo.h)) mover(d.p);
        segAnt = null;
        continue;
      }
      if (r.startsWith('--') || r.startsWith('-|') || r.startsWith('|-')) {
        const op = r.slice(0, 2); i += 2;
        i = saltar(s, i);
        // «-- node {texto} (b)»: el nodo va en medio del segmento
        const enMedio = [];
        while (s.startsWith('node', i)) { const nn = leerNodoEnCamino(s, i); enMedio.push(nn); i = saltar(s, nn.fin); }
        if (s.startsWith('cycle', i)) {
          i += 5;
          if (ini) { segAnt = [cur, ini]; segs.push(['Z']); for (const nn of enMedio) colocarNodoEnSegmento({ ...nn, estPos: nn.estPos ?? 0.5 }, segAnt, est); cur = ini; curNodo = null; }
          continue;
        }
        const d = destino(leerCoord(), cur);
        let objetivo = d.p;
        if (op === '--') {
          const a = inicioDesde(objetivo);
          if (d.nodo) objetivo = bordeHacia(d.nodo, a);
          if (!segs.length) mover(a);
          segs.push(['L', objetivo]); segAnt = [a, objetivo];
        } else {
          const esquina = op === '-|' ? { x: d.p.x, y: cur.y } : { x: cur.x, y: d.p.y };
          const a = inicioDesde(esquina);
          // si la esquina cae en el centro del nodo destino, se llega desde el punto de partida
          if (d.nodo) objetivo = bordeHacia(d.nodo, dist(esquina, d.p) > 1e-6 ? esquina : a);
          if (!segs.length) mover(a);
          segs.push(['L', esquina], ['L', objetivo]); segAnt = [a, esquina, objetivo];
        }
        for (const nn of enMedio) colocarNodoEnSegmento({ ...nn, estPos: nn.estPos ?? 0.5 }, segAnt, est);
        fijar(d, d.p);
        continue;
      }
      if (r.startsWith('..')) {
        const m = /^\.\.\s*controls\s*/.exec(r);
        if (!m) throw new Error('«..» sin «controls»');
        i += m[0].length;
        const c1 = destino(leerCoord(), cur).p;
        i = saltar(s, i);
        let c2 = c1;
        if (s.startsWith('and', i)) { i += 3; c2 = destino(leerCoord(), cur).p; }
        i = saltar(s, i);
        if (!s.startsWith('..', i)) throw new Error('Falta «..» al final de «controls»');
        i += 2;
        const d = destino(leerCoord(), cur);
        const a = inicioDesde(c1);
        const fin = d.nodo ? bordeHacia(d.nodo, c2) : d.p;
        if (!segs.length) mover(a);
        segs.push(['C', c1, c2, fin]); segAnt = [a, c1, c2, fin];
        fijar(d, d.p);
        continue;
      }
      const pal = /^[a-z]+/.exec(r);
      const palabra = pal ? pal[0] : '';
      if (palabra === 'rectangle') {
        i += 9;
        const d = destino(leerCoord(), cur);
        const a = cur, b = d.p;
        const c2 = { x: b.x, y: a.y }, c4 = { x: a.x, y: b.y };
        if (!(segs.length && segs[segs.length - 1][0] === 'M')) mover(a);
        if (est.redondeo) {
          const xs = [a.x, b.x].sort((u, v) => u - v), ys = [a.y, b.y].sort((u, v) => u - v);
          segs.pop(); redondeado(segs, xs[0], ys[0], xs[1], ys[1], est.redondeo);
        } else segs.push(['L', c2], ['L', b], ['L', c4], ['Z']);
        fijar(d, b); ini = null; segAnt = [a, b];
        continue;
      }
      if (palabra === 'circle' || palabra === 'ellipse') {
        i += palabra.length;
        i = saltar(s, i);
        let rx = est.radioX ?? est.radio, ry = est.radioY ?? est.radio;
        const o = opcEn(s, i);
        if (o) { const e2 = estiloDe(est, o.txt); rx = e2.radioX ?? e2.radio; ry = e2.radioY ?? e2.radio; i = o.fin; i = saltar(s, i); }
        const p = parEn(s, i);
        if (p) {
          i = p.fin;
          const partes = p.txt.split(/\s+and\s+/);
          rx = longitud(partes[0]); ry = partes[1] ? longitud(partes[1]) : rx;
        }
        if (rx == null) throw new Error('Falta el radio del círculo');
        if (ry == null) ry = rx;
        const c = curNodo ? { x: curNodo.x, y: curNodo.y } : cur;
        if (segs.length && segs[segs.length - 1][0] === 'M') segs.pop();
        elipse(segs, c, rx, ry, est.matriz);
        segAnt = null;
        continue;
      }
      if (palabra === 'arc') {
        i += 3; i = saltar(s, i);
        let a0, a1, rx, ry;
        const o = opcEn(s, i), p = !o && parEn(s, i);
        if (o) {
          const e2 = estiloDe(est, o.txt); i = o.fin;
          a0 = e2.anguloIni; a1 = e2.anguloFin ?? (e2.anguloDelta != null ? a0 + e2.anguloDelta : null);
          rx = e2.radioX ?? e2.radio; ry = e2.radioY ?? e2.radio ?? rx;
        } else if (p) {
          i = p.fin;
          const q = p.txt.split(':');
          a0 = numero(q[0]); a1 = numero(q[1]);
          const rr = q.slice(2).join(':').split(/\s+and\s+/);
          rx = longitud(rr[0]); ry = rr[1] ? longitud(rr[1]) : rx;
        }
        if (a0 == null || a1 == null || rx == null) throw new Error('Arco incompleto');
        const ang = (t) => ({ x: rx * Math.cos(t * RAD), y: ry * Math.sin(t * RAD) });
        // el centro queda en el sistema de coordenadas sin transformar
        const L = ctxCoord.matriz;
        const v0 = aplicarV(L, ang(a0));
        const c = { x: cur.x - v0.x, y: cur.y - v0.y };
        if (!segs.length) mover(cur);
        const pts = arco(c, rx, ry, a0, a1, L);
        segs.push(...pts);
        const finP = pts[pts.length - 1][3];
        segAnt = [cur, finP];
        cur = finP; curNodo = null; ref = finP;
        continue;
      }
      if (palabra === 'grid') {
        i += 4; i = saltar(s, i);
        let e2 = est;
        const o = opcEn(s, i); if (o) { e2 = estiloDe(est, o.txt); i = o.fin; }
        const d = destino(leerCoord(), cur);
        // la rejilla se calcula sin transformar y luego se transforma
        const inv = invertir(ctxCoord.matriz);
        const a = aplicar(inv, cur), b = aplicar(inv, d.p);
        const [x0, x1] = [a.x, b.x].sort((u, v) => u - v), [y0, y1] = [a.y, b.y].sort((u, v) => u - v);
        const [sx, sy] = e2.paso;
        if ((x1 - x0) / sx > 400 || (y1 - y0) / sy > 400) throw new Error('Rejilla demasiado fina');
        for (let x = Math.ceil(x0 / sx - 1e-9) * sx; x <= x1 + 1e-9; x += sx) segs.push(['M', aplicar(ctxCoord.matriz, { x, y: y0 })], ['L', aplicar(ctxCoord.matriz, { x, y: y1 })]);
        for (let y = Math.ceil(y0 / sy - 1e-9) * sy; y <= y1 + 1e-9; y += sy) segs.push(['M', aplicar(ctxCoord.matriz, { x: x0, y })], ['L', aplicar(ctxCoord.matriz, { x: x1, y })]);
        fijar(d, d.p); segAnt = null;
        continue;
      }
      if (palabra === 'to' || palabra === 'edge') {
        i += palabra.length; i = saltar(s, i);
        let e2 = est;
        const o = opcEn(s, i); if (o) { e2 = estiloDe(est, o.txt); i = o.fin; i = saltar(s, i); }
        const nodosTo = [];
        while (s.startsWith('node', i)) { const nn = leerNodoEnCamino(s, i); nodosTo.push(nn); i = saltar(s, nn.fin); }
        const d = destino(leerCoord(), cur);
        const desde = curNodo ? { x: curNodo.x, y: curNodo.y } : cur;
        const curva = curvaTo(desde, d.p, e2, curNodo, d.nodo);
        if (palabra === 'edge') {
          elementos.push({ k: 'camino', segs: [['M', curva[0]], ['C', curva[1], curva[2], curva[3]]], est: resumenCamino(e2, 'draw'), flechas: true });
          for (const nn of nodosTo) colocarNodoEnSegmento({ ...nn, estPos: nn.estPos ?? 0.5 }, curva, e2);
        } else {
          if (curNodo || !segs.length) mover(curva[0]);
          segs.push(['C', curva[1], curva[2], curva[3]]); segAnt = curva;
          // los nodos de «to» van en medio de la curva, como en TikZ
          for (const nn of nodosTo) colocarNodoEnSegmento({ ...nn, estPos: nn.estPos ?? 0.5 }, curva, est);
          fijar(d, d.p);
        }
        continue;
      }
      if (palabra === 'node') {
        const nn = leerNodoEnCamino(s, i);
        i = nn.fin;
        if (nn.at) { pendientes.push({ nn, en: coord(nn.at) }); continue; }
        if (segAnt && (nn.estPos != null)) colocarNodoEnSegmento(nn, segAnt, est);
        else {
          const nodo = crearNodo(est, nn.opc, nn.nombre, nn.texto, cur || { x: 0, y: 0 });
          i = saltar(s, i);
          if (s.startsWith('child', i)) { i = arbol(s, i, nodo, est, 1); }
        }
        continue;
      }
      if (palabra === 'coordinate') {
        i += 10; i = saltar(s, i);
        const o = opcEn(s, i); let op = ''; if (o) { op = o.txt; i = saltar(s, o.fin); }
        const p = parEn(s, i); if (!p) throw new Error('«coordinate» sin nombre');
        i = p.fin;
        crearNodo(est, 'coordinate,' + op, p.txt.trim(), '', cur || { x: 0, y: 0 });
        continue;
      }
      if (palabra === 'plot') {
        i += 4; i = saltar(s, i);
        let e2 = est;
        const o = opcEn(s, i); if (o) { e2 = estiloDe(est, o.txt); i = saltar(s, o.fin); }
        let pts = [];
        if (s.startsWith('coordinates', i)) {
          i = saltar(s, i + 11);
          const g = grupoEn(s, i); if (!g) throw new Error('plot coordinates sin lista');
          i = g.fin;
          for (const m of g.txt.matchAll(/\(([^()]*)\)/g)) pts.push(coord(m[1]));
        } else if (s.startsWith('function', i)) { throw new Error('«plot function» usa gnuplot: no se muestra en la vista previa'); }
        else {
          const p = parEn(s, i); if (!p) throw new Error('plot sin expresión');
          i = p.fin;
          const [a, b] = e2.dominio;
          const n = e2.muestras;
          const v = e2.variable.replace(/^\\/, '');
          const re = new RegExp(`\\\\${v}(?![a-zA-Z])`, 'g');
          for (let k = 0; k < n; k++) {
            const x = a + (b - a) * k / (n - 1);
            const t = p.txt.replace(re, `(${x})`);
            try { pts.push(coord(t)); } catch { /* punto fuera del dominio */ }
          }
        }
        if (!pts.length) continue;
        const enlazar = segs.length && cur;
        if (enlazar) segs.push(['L', pts[0]]); else mover(pts[0]);
        if (e2.liso && pts.length > 2) suave(segs, pts); else for (const p of pts.slice(1)) segs.push(['L', p]);
        cur = pts[pts.length - 1]; ref = cur; curNodo = null; segAnt = null;
        continue;
      }
      if (palabra === 'cycle') { i += 5; if (ini) segs.push(['Z']); continue; }
      if (palabra === 'foreach') throw new Error('«foreach» dentro de un camino no se muestra en la vista previa');
      if (palabra === 'let' || palabra === 'pic' || palabra === 'svg' || palabra === 'parabola' || palabra === 'sin' || palabra === 'cos' || palabra === 'decorate') {
        throw new Error(`«${palabra}» no se muestra en la vista previa`);
      }
      if (r[0] === '[') { const o = opcEn(s, i); est = estiloDe(est, o.txt); i = o.fin; continue; }
      if (r[0] === '{') { const g = grupoEn(s, i); i = g ? g.fin : s.length; aviso('Grupos «{…}» dentro de un camino: se omiten'); continue; }
      throw new Error(`No se entiende «${r.slice(0, 24)}»`);
    }
    for (const { nn, en } of pendientes) crearNodo(est, nn.opc, nn.nombre, nn.texto, en);
    const tipo = cmd === 'path' ? (est.dibujar && est.dibujar !== 'ninguno' ? 'draw' : null) : cmd;
    if (segs.some((x) => x[0] !== 'M') && (tipo || est.rellenar)) elementos.splice(inicioCamino, 0, { k: 'camino', segs, est: resumenCamino(est, tipo), flechas: true });
    ctxCoord = { matriz: prevMatriz };
    return i;

    function leerNodoEnCamino(s2, j) {
      j += 4; j = saltar(s2, j);
      let op = '', nombre = null, at = null;
      for (;;) {
        j = saltar(s2, j);
        const o = opcEn(s2, j); if (o) { op += (op ? ',' : '') + o.txt; j = o.fin; continue; }
        if (s2[j] === '(') { const p = parEn(s2, j); nombre = p.txt.trim(); j = p.fin; continue; }
        if (s2.startsWith('at', j) && /[\s(]/.test(s2[j + 2])) { j = saltar(s2, j + 2); const p = parEn(s2, j); at = p.txt; j = p.fin; continue; }
        break;
      }
      const g = grupoEn(s2, j);
      if (!g) throw new Error('Nodo sin texto «{…}»');
      const e2 = estiloDe(est, op);
      return { opc: op, nombre, at, texto: g.txt, fin: g.fin, estPos: e2.pos };
    }
    function colocarNodoEnSegmento(nn, seg, e) {
      const t = nn.estPos == null ? 1 : nn.estPos;
      const p = puntoEn(seg, t);
      crearNodo(e, nn.opc, nn.nombre, nn.texto, p);
    }
  }

  function curvaTo(a, b, e, na, nb) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) / RAD;
    let out = e.outA, inn = e.inA;
    if (e.curvar) { out = ang + e.curvar; inn = ang + 180 - e.curvar; }
    if (out == null || inn == null) {
      const p0 = na ? bordeHacia(na, b) : a, p3 = nb ? bordeHacia(nb, a) : b;
      return [p0, lerp(p0, p3, 1 / 3), lerp(p0, p3, 2 / 3), p3];
    }
    const p0 = na ? borde(na, out) : a, p3 = nb ? borde(nb, inn) : b;
    const k = 0.3915 * e.holgura * Math.hypot(p3.x - p0.x, p3.y - p0.y || 0) || 0.3915 * d;
    return [p0, { x: p0.x + k * Math.cos(out * RAD), y: p0.y + k * Math.sin(out * RAD) }, { x: p3.x + k * Math.cos(inn * RAD), y: p3.y + k * Math.sin(inn * RAD) }, p3];
  }
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  function puntoEn(seg, t) {
    if (seg.length === 4 && seg[1] && seg[2]) {
      const [p0, p1, p2, p3] = seg; const u = 1 - t;
      return { x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x, y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y };
    }
    if (seg.length === 3) return t <= 0.5 ? lerp(seg[0], seg[1], t * 2) : lerp(seg[1], seg[2], (t - 0.5) * 2);
    return lerp(seg[0], seg[seg.length - 1], t);
  }
  function arbol(s, i, padre, est, nivel) {
    const hijos = [];
    for (;;) {
      i = saltar(s, i);
      if (!s.startsWith('child', i)) break;
      i += 5; i = saltar(s, i);
      let op = '';
      const o = opcEn(s, i); if (o) { op = o.txt; i = saltar(s, o.fin); }
      const g = grupoEn(s, i);
      if (!g) throw new Error('«child» sin «{…}»');
      hijos.push({ op, cuerpo: g.txt }); i = g.fin;
    }
    const eNivel = estiloDe(est, est.niveles[nivel] || '');
    const n = hijos.length;
    hijos.forEach((h, k) => {
      if (/\bmissing\b/.test(h.op)) return;
      const off = (k - (n - 1) / 2) * eNivel.hermanos;
      const dir = { down: [off, -eNivel.nivel], up: [off, eNivel.nivel], right: [eNivel.nivel, -off], left: [-eNivel.nivel, -off] }[eNivel.crecer] || [off, -eNivel.nivel];
      if (!(eNivel.crecer in { down: 1, up: 1, right: 1, left: 1 })) aviso(`grow=${eNivel.crecer} se muestra hacia abajo`);
      const en = { x: padre.x + dir[0], y: padre.y + dir[1] };
      const eh = estiloDe(eNivel, h.op);
      let cuerpo = h.cuerpo.trim();
      let hijo;
      if (cuerpo.startsWith('node')) {
        let j = 4, op = '', nombre = null;
        for (;;) {
          j = saltar(cuerpo, j);
          const o = opcEn(cuerpo, j); if (o) { op += (op ? ',' : '') + o.txt; j = o.fin; continue; }
          if (cuerpo[j] === '(') { const p = parEn(cuerpo, j); nombre = p.txt.trim(); j = p.fin; continue; }
          break;
        }
        const g = grupoEn(cuerpo, j);
        if (!g) throw new Error('Nodo hijo sin texto');
        hijo = crearNodo({ ...eh, ancla: null, de: null, desplazar: null }, op, nombre, g.txt, en);
        cuerpo = cuerpo.slice(g.fin);
      } else if (cuerpo.startsWith('coordinate')) {
        hijo = crearNodo(eh, 'coordinate', null, '', en);
        cuerpo = cuerpo.slice(10).replace(/^\s*\([^)]*\)/, '');
      } else hijo = { x: en.x, y: en.y, w: 0, h: 0, forma: 'coordinate' };
      const a = bordeHacia(padre, hijo), b = bordeHacia(hijo, padre);
      elementos.push({ k: 'camino', segs: [['M', a], ['L', b]], est: resumenCamino(eh, 'draw'), flechas: false });
      const resto = cuerpo.trim();
      if (resto.startsWith('child')) arbol(resto, 0, hijo, eh, nivel + 1);
      else if (resto && !/^edge from parent/.test(resto)) aviso(`Dentro de «child» no se entiende «${resto.slice(0, 20)}»`);
    });
    return i;
  }
  const resumenCamino = (e, tipo) => ({
    dibujar: tipo === 'draw' || tipo === 'filldraw' || (tipo === 'fill' && false) ? (e.dibujar === 'ninguno' ? null : colorFinal(e.dibujar, e)) : (e.dibujar && e.dibujar !== 'ninguno' && tipo !== 'fill' ? colorFinal(e.dibujar, e) : null),
    rellenar: tipo === 'fill' || tipo === 'filldraw' ? colorFinal(e.rellenar, e) : (e.rellenar ? colorFinal(e.rellenar, e) : null),
    lw: e.lw, dash: e.dash, flechaI: e.flechaI, flechaF: e.flechaF, opacDib: e.opac * e.opacDib, opacRel: e.opac * e.opacRel, redondeo: e.redondeo,
  });

  // ── sentencias ──
  const sustituir = (txt) => {
    if (!macros.size) return txt;
    let t = txt;
    for (const [k, v] of [...macros].sort((a, b) => b[0].length - a[0].length)) t = t.replace(new RegExp(`\\\\${k}(?![a-zA-Z])`, 'g'), v);
    return t;
  };
  function ejecutar(codigo, estBase, prof = 0) {
    if (prof > 12) throw new Error('Demasiados niveles anidados');
    const s = codigo;
    let i = 0;
    while (i < s.length) {
      i = saltar(s, i);
      if (i >= s.length) break;
      if (++pasos > 200000) { aviso('El dibujo es demasiado grande: la vista previa se corta'); return; }
      const ini = i;
      try {
        if (s[i] === ';') { i++; continue; }
        if (s[i] === '{') { const g = grupoEn(s, i); ejecutar(g ? g.txt : '', estBase, prof + 1); i = g ? g.fin : s.length; continue; }
        if (s.startsWith('\\begin{scope}', i)) {
          let j = i + 13;
          const o = opcEn(s, saltar(s, j)); let op = '';
          if (o) { op = o.txt; j = o.fin; }
          const f = buscarFinScope(s, j);
          ejecutar(s.slice(j, f.cuerpo), estiloDe(estBase, op, 'scope'), prof + 1);
          i = f.fin; continue;
        }
        const m = /^\\([a-zA-Z]+)\*?/.exec(s.slice(i));
        if (!m) { const f = finSentencia(s, i); aviso(`No se entiende «${s.slice(i, Math.min(f, i + 30)).trim()}»`); i = f; continue; }
        const cmd = m[1];
        let j = i + m[0].length;
        if (cmd === 'foreach') { i = foreach(s, j, estBase, prof); continue; }
        // \tikzset cambia los ajustes del resto del scope (y define estilos)
        if (cmd === 'tikzset') { const g = grupoEn(s, saltar(s, j)); if (g) { aplicarOpciones(estBase, g.txt, 'set'); i = g.fin; } else i = finSentencia(s, i); continue; }
        if (cmd === 'tikzstyle') {
          const g = grupoEn(s, saltar(s, j));
          const f = finSentencia(s, i);
          if (g) { const resto = s.slice(g.fin, f); const o = /=\s*\[([\s\S]*)\]/.exec(resto); if (o) estilos.set(g.txt.trim(), o[1]); }
          i = f; continue;
        }
        if (cmd === 'pgfmathsetmacro' || cmd === 'pgfmathtruncatemacro') {
          j = saltar(s, j);
          const n = /^\\([a-zA-Z]+)|^\{\\([a-zA-Z]+)\}/.exec(s.slice(j));
          if (!n) throw new Error('pgfmathsetmacro sin nombre');
          j = saltar(s, j + n[0].length);
          const g = grupoEn(s, j);
          let v = numero(sustituir(g.txt));
          if (cmd === 'pgfmathtruncatemacro') v = Math.trunc(v);
          macros.set(n[1] || n[2], String(+v.toFixed(6)));
          i = g.fin; continue;
        }
        if (cmd === 'def' || cmd === 'newcommand' || cmd === 'renewcommand') {
          const mm = /^\s*\{?\\([a-zA-Z]+)\}?\s*\{([^{}]*)\}/.exec(s.slice(j));
          if (!mm) throw new Error(`\\${cmd} complejo`);
          macros.set(mm[1], mm[2]); i = j + mm[0].length; continue;
        }
        if (cmd === 'definecolor') {
          const a = grupoEn(s, saltar(s, j)), b = a && grupoEn(s, saltar(s, a.fin)), c = b && grupoEn(s, saltar(s, b.fin));
          if (!c) throw new Error('\\definecolor incompleto');
          const vals = c.txt.split(',').map(Number);
          const modelo = b.txt.trim();
          if (modelo === 'RGB') propios[a.txt.trim()] = vals;
          else if (modelo === 'rgb') propios[a.txt.trim()] = vals.map((x) => x * 255);
          else if (modelo === 'HTML') { const h = c.txt.trim(); propios[a.txt.trim()] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); }
          else if (modelo === 'gray') propios[a.txt.trim()] = [vals[0] * 255, vals[0] * 255, vals[0] * 255];
          else aviso(`Modelo de color «${modelo}» no soportado`);
          i = c.fin; continue;
        }
        if (cmd === 'colorlet') {
          const a = grupoEn(s, saltar(s, j)), b = a && grupoEn(s, saltar(s, a.fin));
          if (b) { const col = colorRGB(b.txt, propios); if (col) propios[a.txt.trim()] = col; i = b.fin; } else i = finSentencia(s, i);
          continue;
        }
        const f = finSentencia(s, i);
        const sent = sustituir(s.slice(j, f).replace(/;$/, ''));
        switch (cmd) {
          case 'draw': case 'fill': case 'filldraw': case 'path': case 'shade': case 'shadedraw': case 'clip': case 'pattern': {
            let tipo = cmd;
            if (cmd === 'shade' || cmd === 'shadedraw') { aviso('Los sombreados (\\shade) se muestran como relleno gris'); tipo = cmd === 'shade' ? 'fill' : 'filldraw'; }
            if (cmd === 'clip') { aviso('\\clip no recorta en la vista previa'); tipo = 'path'; }
            if (cmd === 'pattern') tipo = 'fill';
            let eb = { ...estBase };
            if (tipo === 'fill' || tipo === 'filldraw') eb = { ...eb, rellenar: eb.rellenar || 'actual' };
            if (tipo === 'filldraw' || tipo === 'draw') eb = { ...eb, dibujar: eb.dibujar === 'ninguno' ? 'ninguno' : eb.dibujar || 'actual' };
            if (cmd === 'shade' || cmd === 'shadedraw') eb.rellenar = COLORES.lightgray;
            camino(tipo, sent, eb);
            break;
          }
          case 'node': {
            // \node[opc] (nombre) at (x,y) {texto};  — y también el orden (nombre) [opc]
            let k = 0, op = '', nombre = null, at = null;
            for (;;) {
              k = saltar(sent, k);
              const o = opcEn(sent, k); if (o) { op += (op ? ',' : '') + o.txt; k = o.fin; continue; }
              if (sent[k] === '(') { const p = parEn(sent, k); nombre = p.txt.trim(); k = p.fin; continue; }
              if (sent.startsWith('at', k)) { k = saltar(sent, k + 2); const p = parEn(sent, k); if (!p) throw new Error('«at» sin coordenada'); at = p.txt; k = p.fin; continue; }
              break;
            }
            const g = grupoEn(sent, k);
            if (!g) throw new Error('\\node sin texto «{…}»');
            ctxCoord = { matriz: estBase.matriz };
            const en = at ? coord(at) : aplicar(estBase.matriz, { x: 0, y: 0 });
            const nodo = crearNodo({ ...estBase }, op, nombre, g.txt, en);
            const resto = sent.slice(g.fin).trim();
            if (resto.startsWith('child')) arbol(resto, 0, nodo, estiloDe(estBase, op), 1);
            else if (resto) camino('path', `(${nombre || '0,0'}) ${resto}`, estBase);
            break;
          }
          case 'coordinate': {
            let k = 0, op = '', nombre = null, at = null;
            for (;;) {
              k = saltar(sent, k);
              const o = opcEn(sent, k); if (o) { op += o.txt; k = o.fin; continue; }
              if (sent[k] === '(') { const p = parEn(sent, k); nombre = p.txt.trim(); k = p.fin; continue; }
              if (sent.startsWith('at', k)) { k = saltar(sent, k + 2); const p = parEn(sent, k); at = p.txt; k = p.fin; continue; }
              break;
            }
            ctxCoord = { matriz: estBase.matriz };
            crearNodo(estBase, 'coordinate,' + op, nombre, '', at ? coord(at) : { x: 0, y: 0 });
            break;
          }
          case 'matrix': aviso('\\matrix no se muestra en la vista previa'); break;
          case 'pic': aviso('\\pic no se muestra en la vista previa'); break;
          case 'usetikzlibrary': break;
          default: aviso(`\\${cmd} no se muestra en la vista previa`);
        }
        i = f;
      } catch (e) {
        aviso(e.message || String(e));
        ctxCoord = { matriz: estBase.matriz };
        const f = finSentencia(s, ini);
        i = Math.max(f, ini + 1);
      }
    }
  }
  function buscarFinScope(s, j) {
    let d = 1, k = j;
    const re = /\\(begin|end)\{scope\}/g; re.lastIndex = j;
    let m;
    while ((m = re.exec(s))) { if (m[1] === 'begin') d++; else if (--d === 0) return { cuerpo: m.index, fin: m.index + m[0].length }; k = re.lastIndex; }
    throw new Error('Falta \\end{scope}');
  }
  function foreach(s, j, estBase, prof) {
    // \foreach \x [count=\i] in {…} {…}   ·   \foreach \x/\y in {…} \draw …;
    const mv = /^\s*((?:\\[a-zA-Z]+\s*\/?\s*)+)/.exec(s.slice(j));
    if (!mv) throw new Error('\\foreach sin variable');
    const vars = mv[1].split('/').map((x) => x.trim().replace(/^\\/, ''));
    j += mv[0].length;
    j = saltar(s, j);
    let contar = null;
    const o = opcEn(s, j);
    if (o) {
      const c = /count\s*=\s*\\([a-zA-Z]+)(?:\s+from\s+(-?\d+))?/.exec(o.txt);
      if (c) contar = { v: c[1], desde: c[2] ? +c[2] : 1 };
      if (/evaluate|remember|parse/.test(o.txt)) aviso('Opciones avanzadas de \\foreach: se ignoran en la vista previa');
      j = saltar(s, o.fin);
    }
    if (!s.startsWith('in', j)) throw new Error('\\foreach sin «in»');
    j = saltar(s, j + 2);
    let listaTxt;
    const g = grupoEn(s, j);
    if (g) { listaTxt = g.txt; j = g.fin; }
    else { const m = /^\\([a-zA-Z]+)/.exec(s.slice(j)); if (!m || !macros.has(m[1])) throw new Error('Lista de \\foreach no reconocida'); listaTxt = macros.get(m[1]); j += m[0].length; }
    j = saltar(s, j);
    let cuerpo, fin;
    if (s[j] === '{') { const b = grupoEn(s, j); cuerpo = b.txt; fin = b.fin; }
    else if (s.startsWith('\\foreach', j)) { fin = finForeach(s, j); cuerpo = s.slice(j, fin); }
    else { fin = finSentencia(s, j); cuerpo = s.slice(j, fin); }
    const valores = expandirLista(sustituir(listaTxt));
    if (valores.length > 2000) throw new Error('\\foreach con demasiados valores');
    valores.forEach((val, k) => {
      const partes = vars.length > 1 ? dividirBarra(val) : [val];
      let c = cuerpo;
      const reemplazos = vars.map((v, n) => [v, partes[n] ?? partes[partes.length - 1]]);
      if (contar) reemplazos.push([contar.v, String(contar.desde + k)]);
      for (const [v, x] of reemplazos.sort((a, b) => b[0].length - a[0].length)) c = c.replace(new RegExp(`\\\\${v}(?![a-zA-Z])`, 'g'), () => x);
      ejecutar(c, estBase, prof + 1);
    });
    return fin;
  }
  const dividirBarra = (v) => { const out = []; let d = 0, ini = 0; for (let i = 0; i < v.length; i++) { const c = v[i]; if ('{(['.includes(c)) d++; else if ('})]'.includes(c)) d--; else if (c === '/' && d === 0) { out.push(v.slice(ini, i)); ini = i + 1; } } out.push(v.slice(ini)); return out.map((x) => x.trim().replace(/^\{([\s\S]*)\}$/, '$1')); };
  function expandirLista(txt) {
    const items = dividirComas(txt);
    const out = [];
    for (let k = 0; k < items.length; k++) {
      if (items[k] !== '...') { out.push(items[k]); continue; }
      const fin = items[k + 1];
      const a = out[out.length - 1], b = out.length > 1 ? out[out.length - 2] : null;
      if (a == null || fin == null) throw new Error('«...» mal usado en \\foreach');
      if (/^[a-zA-Z]$/.test(a) && /^[a-zA-Z]$/.test(fin)) {
        for (let c = a.charCodeAt(0) + 1; c <= fin.charCodeAt(0); c++) out.push(String.fromCharCode(c));
      } else {
        const va = numero(a), vf = numero(fin);
        const paso = b != null && !Number.isNaN(Number(b)) ? va - numero(b) : (vf >= va ? 1 : -1);
        if (!paso) throw new Error('Paso cero en \\foreach');
        const n = Math.floor((vf - va) / paso + 1e-9);
        if (n > 2000) throw new Error('\\foreach con demasiados valores');
        for (let q = 1; q <= n; q++) out.push(String(+(va + paso * q).toFixed(10)));
      }
      k++;
    }
    return out;
  }

  // ── ejecución ──
  const base = aplicarOpciones(nuevoEstilo(), opc, 'picture');
  ctxCoord = { matriz: base.matriz };
  try { ejecutar(quitarComentarios(src), base); } catch (e) { aviso(e.message || String(e)); }

  // flechas y caja
  let caja = null;
  const ampliar = (x, y, m = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!caja) caja = { x0: x - m, y0: y - m, x1: x + m, y1: y + m };
    else { caja.x0 = Math.min(caja.x0, x - m); caja.y0 = Math.min(caja.y0, y - m); caja.x1 = Math.max(caja.x1, x + m); caja.y1 = Math.max(caja.y1, y + m); }
  };
  for (const el of elementos) {
    if (el.k === 'nodo') { ampliar(el.x - el.w / 2, el.y - el.h / 2); ampliar(el.x + el.w / 2, el.y + el.h / 2); continue; }
    const m = (el.est.lw || 0.4) / 2;
    for (const sg of el.segs) for (const p of sg.slice(1)) if (p) ampliar(p.x, p.y, m);
    if (el.flechas && el.est.dibujar) el.puntas = puntas(el);
    for (const pu of el.puntas || []) for (const p of pu.pts) ampliar(p.x, p.y, m);
  }
  return { elementos, caja, avisos: [...avisos] };
}

function invertir(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** Elipse (o círculo) como cuatro curvas de Bézier, transformada. */
function elipse(segs, c, rx, ry, m) {
  const k = 0.5522847498;
  const L = (x, y) => { const v = aplicarV(m, { x, y }); return { x: c.x + v.x, y: c.y + v.y }; };
  segs.push(['M', L(rx, 0)],
    ['C', L(rx, k * ry), L(k * rx, ry), L(0, ry)], ['C', L(-k * rx, ry), L(-rx, k * ry), L(-rx, 0)],
    ['C', L(-rx, -k * ry), L(-k * rx, -ry), L(0, -ry)], ['C', L(k * rx, -ry), L(rx, -k * ry), L(rx, 0)], ['Z']);
}
/** Arco de a0 a a1 grados como curvas de Bézier (como mucho 90° cada una). */
function arco(c, rx, ry, a0, a1, m) {
  const out = [];
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90));
  const paso = (a1 - a0) / n;
  const P = (t) => { const v = aplicarV(m, { x: rx * Math.cos(t * RAD), y: ry * Math.sin(t * RAD) }); return { x: c.x + v.x, y: c.y + v.y }; };
  const D = (t) => aplicarV(m, { x: -rx * Math.sin(t * RAD), y: ry * Math.cos(t * RAD) });
  for (let k = 0; k < n; k++) {
    const t0 = a0 + paso * k, t1 = t0 + paso;
    const h = 4 / 3 * Math.tan((paso * RAD) / 4);
    const p0 = P(t0), p3 = P(t1), d0 = D(t0), d1 = D(t1);
    out.push(['C', { x: p0.x + h * d0.x, y: p0.y + h * d0.y }, { x: p3.x - h * d1.x, y: p3.y - h * d1.y }, p3]);
  }
  return out;
}
function redondeado(segs, x0, y0, x1, y1, r) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const k = 0.5522847498 * r;
  segs.push(['M', { x: x0 + r, y: y0 }], ['L', { x: x1 - r, y: y0 }], ['C', { x: x1 - r + k, y: y0 }, { x: x1, y: y0 + r - k }, { x: x1, y: y0 + r }],
    ['L', { x: x1, y: y1 - r }], ['C', { x: x1, y: y1 - r + k }, { x: x1 - r + k, y: y1 }, { x: x1 - r, y: y1 }],
    ['L', { x: x0 + r, y: y1 }], ['C', { x: x0 + r - k, y: y1 }, { x: x0, y: y1 - r + k }, { x: x0, y: y1 - r }],
    ['L', { x: x0, y: y0 + r }], ['C', { x: x0, y: y0 + r - k }, { x: x0 + r - k, y: y0 }, { x: x0 + r, y: y0 }], ['Z']);
}
/** Curva suave (Catmull-Rom) por los puntos, para «plot[smooth]». */
function suave(segs, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    segs.push(['C', { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
  }
}

/** Puntas de flecha al principio y al final de un camino abierto. */
function puntas(el) {
  const out = [];
  const segs = el.segs;
  if (!segs.length || segs[segs.length - 1][0] === 'Z') return out;
  const e = el.est;
  const hacer = (tipo, p, dir) => {
    if (!tipo) return;
    const n = Math.hypot(dir.x, dir.y);
    if (!n) return;
    const ux = dir.x / n, uy = dir.y / n, px = -uy, py = ux;
    const L = 2.6 + 2.6 * e.lw, W = L * (tipo === 'to' ? 0.75 : 0.62);
    const P = (a, b) => ({ x: p.x - ux * a + px * b, y: p.y - uy * a + py * b });
    if (tipo === 'barra') out.push({ tipo: 'linea', pts: [P(0, W), P(0, -W)] });
    else if (tipo === 'circulo') out.push({ tipo: 'circulo', pts: [P(L / 3, 0)], r: L / 3 });
    else if (tipo === 'to') out.push({ tipo: 'linea', pts: [P(L * 0.8, W), P(0, 0), P(L * 0.8, -W)] });
    else out.push({ tipo: 'relleno', pts: tipo === 'latex' ? [P(L, W), P(0, 0), P(L, -W)] : [P(L, W), P(0, 0), P(L, -W), P(L * 0.7, 0)] });
  };
  // final
  const ult = segs[segs.length - 1];
  const finP = ult[ult.length - 1];
  const antes = ult[0] === 'C' ? (dist(ult[2], finP) > 1e-6 ? ult[2] : ult[1]) : (segs[segs.length - 2] ? segs[segs.length - 2][segs[segs.length - 2].length - 1] : null);
  if (antes) hacer(e.flechaF, finP, { x: finP.x - antes.x, y: finP.y - antes.y });
  // principio
  const k = segs.findIndex((s) => s[0] !== 'M');
  if (k > 0) {
    const p0 = segs[k - 1][1], s1 = segs[k];
    const sig = s1[0] === 'C' ? (dist(s1[1], p0) > 1e-6 ? s1[1] : s1[2]) : s1[1];
    hacer(e.flechaI, p0, { x: p0.x - sig.x, y: p0.y - sig.y });
  }
  return out;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ── SVG ────────────────────────────────────────────────────────────────

const n2 = (v) => +v.toFixed(2);
const pathD = (segs) => segs.map((s) => {
  if (s[0] === 'Z') return 'Z';
  return s[0] + ' ' + s.slice(1).map((p) => `${n2(p.x)} ${n2(-p.y)}`).join(' ');
}).join(' ');
const col = (c) => (Array.isArray(c) ? hex(c) : '#000');

/**
 * Resultado de interpretarTikz → texto SVG.
 * @param {object} res
 * @param {object} op  { ancho: % del ancho disponible (0 = tamaño natural), vista: {x0,y0,x1,y1} fija (para la herramienta de dibujo) }
 */
export function tikzASvg(res, { ancho = 0, vista = null, clase = 'tikz-svg' } = {}) {
  const c = vista || res.caja;
  if (!c) return `<svg xmlns="http://www.w3.org/2000/svg" class="${clase} vacio" viewBox="0 0 120 30" width="160" height="40"><text x="60" y="19" text-anchor="middle" font-size="9" fill="#999" font-family="system-ui,sans-serif">Dibujo vacío</text></svg>`;
  const m = vista ? 0 : 3;
  const x0 = c.x0 - m, y0 = -c.y1 - m, w = Math.max(1, c.x1 - c.x0 + 2 * m), h = Math.max(1, c.y1 - c.y0 + 2 * m);
  const tam = ancho ? `width="${ancho}%"` : `width="${n2(w * 4 / 3)}" height="${n2(h * 4 / 3)}"`;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" class="${clase}" viewBox="${n2(x0)} ${n2(y0)} ${n2(w)} ${n2(h)}" ${tam} style="max-width:100%;height:auto;overflow:visible">`;
  for (const el of res.elementos) {
    if (el.k === 'camino') {
      const e = el.est;
      const stroke = e.dibujar ? `stroke="${col(e.dibujar)}" stroke-width="${n2(e.lw)}"${e.opacDib < 1 ? ` stroke-opacity="${e.opacDib}"` : ''}` : 'stroke="none"';
      const dash = e.dash && e.dibujar ? ` stroke-dasharray="${e.dash.map((x) => n2(x || 0.01)).join(' ')}"${e.dash.includes(0) ? ' stroke-linecap="round"' : ''}` : '';
      const fill = e.rellenar ? `fill="${col(e.rellenar)}"${e.opacRel < 1 ? ` fill-opacity="${e.opacRel}"` : ''}` : 'fill="none"';
      o += `<path d="${pathD(el.segs)}" ${fill} ${stroke}${dash} stroke-linejoin="round"/>`;
      for (const p of el.puntas || []) {
        const color = col(e.dibujar);
        if (p.tipo === 'relleno') o += `<path d="M ${p.pts.map((q) => `${n2(q.x)} ${n2(-q.y)}`).join(' L ')} Z" fill="${color}" stroke="${color}" stroke-width="${n2(e.lw / 2)}" stroke-linejoin="round"/>`;
        else if (p.tipo === 'circulo') o += `<circle cx="${n2(p.pts[0].x)}" cy="${n2(-p.pts[0].y)}" r="${n2(p.r)}" fill="${color}"/>`;
        else o += `<path d="M ${p.pts.map((q) => `${n2(q.x)} ${n2(-q.y)}`).join(' L ')}" fill="none" stroke="${color}" stroke-width="${n2(e.lw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    } else if (el.k === 'nodo') {
      const e = el.est;
      const cx = el.x, cy = -el.y;
      if (e.dibujar || e.rellenar) {
        const attrs = `${e.rellenar ? `fill="${col(e.rellenar)}"${e.opacRel < 1 ? ` fill-opacity="${e.opacRel}"` : ''}` : 'fill="none"'} ${e.dibujar ? `stroke="${col(e.dibujar)}" stroke-width="${n2(e.lw)}"` : 'stroke="none"'}${e.dash && e.dibujar ? ` stroke-dasharray="${e.dash.map((x) => n2(x || 0.01)).join(' ')}"` : ''}`;
        if (el.forma === 'circle') o += `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(el.w / 2)}" ${attrs}/>`;
        else if (el.forma === 'ellipse') o += `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(el.w / 2)}" ry="${n2(el.h / 2)}" ${attrs}/>`;
        else if (el.forma === 'diamond') o += `<path d="M ${n2(cx)} ${n2(cy - el.h / 2)} L ${n2(cx + el.w / 2)} ${n2(cy)} L ${n2(cx)} ${n2(cy + el.h / 2)} L ${n2(cx - el.w / 2)} ${n2(cy)} Z" ${attrs}/>`;
        else o += `<rect x="${n2(cx - el.w / 2)}" y="${n2(cy - el.h / 2)}" width="${n2(el.w)}" height="${n2(el.h)}"${e.redondeo ? ` rx="${n2(e.redondeo)}"` : ''} ${attrs}/>`;
      }
      if (el.html) {
        const tw = Math.max(el.w, 4) + 40, th = Math.max(el.h, e.fuente * 1.3) + 4;
        const fam = e.mono ? "'LMmono',monospace" : e.sans ? 'system-ui,sans-serif' : "'LM','Latin Modern Roman',serif";
        const est = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:${/left/.test(e.alinear) ? 'left' : /right/.test(e.alinear) ? 'right' : 'center'};font:${e.cursiva ? 'italic ' : ''}${e.negrita ? 700 : 400} ${n2(e.fuente)}px/1.2 ${fam};color:${col(e.texto)};${e.opacTxt < 1 ? `opacity:${e.opacTxt};` : ''}${e.anchoTexto ? '' : 'white-space:nowrap;'}`;
        o += `<foreignObject x="${n2(cx - tw / 2)}" y="${n2(cy - th / 2)}" width="${n2(tw)}" height="${n2(th)}"><div xmlns="http://www.w3.org/1999/xhtml" style="${est}"><div${e.anchoTexto ? ` style="width:${n2(e.anchoTexto)}px"` : ''}>${el.html}</div></div></foreignObject>`;
      }
    }
  }
  return o + '</svg>';
}

/** Atajo: código → { svg, avisos, caja }. */
export function tikzSvg(src, { opc = '', medir = null, ancho = 0 } = {}) {
  const r = interpretarTikz(src, { opc, medir });
  return { svg: tikzASvg(r, { ancho }), avisos: r.avisos, caja: r.caja, res: r };
}

// Detección de librerías: vive en tikz-libs.js (sin dependencias) para que latex-gen.js pueda usarla.
export { libreriasNecesarias } from './tikz-libs.js?v=2026.11.07-l';
