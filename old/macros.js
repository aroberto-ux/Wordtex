// Macros del preámbulo propio (\newcommand, \def, \DeclareMathOperator…) para que las fórmulas y las
// vistas previas las entiendan igual que LaTeX. No toca el DOM: se puede probar con Node.

/** Contenido del grupo {…} que empieza en s[i] (s[i] debe ser «{»). → { txt, fin } o null. */
export function grupo(s, i) {
  if (s[i] !== '{') return null;
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === '{') d++;
    else if (s[k] === '}' && --d === 0) return { txt: s.slice(i + 1, k), fin: k + 1 };
  }
  return null;
}

/** Quita los comentarios «% …» (respetando «\%»). */
export const sinComentarios = (s) => String(s || '').replace(/(^|[^\\])%.*$/gm, '$1');

/**
 * @param {string} extra  preámbulo propio
 * @returns {Record<string,string>}  { '\\R': '\\mathbb{R}', … } en el formato que acepta KaTeX
 */
export function macrosDe(extra = '') {
  const src = sinComentarios(extra);
  const m = {};
  let x;
  // \newcommand{\f}[2][x]{…}  \renewcommand\f{…}  \providecommand…
  const re = /\\(?:re|provide)?newcommand\*?\s*(?:\{\s*\\([a-zA-Z@]+)\s*\}|\\([a-zA-Z@]+))\s*(?:\[[^\]]*\]\s*)*\{/g;
  while ((x = re.exec(src))) {
    const g = grupo(src, x.index + x[0].length - 1);
    if (g) { m['\\' + (x[1] || x[2])] = g.txt; re.lastIndex = g.fin; }
  }
  // \def\f#1{…}
  const def = /\\def\s*\\([a-zA-Z@]+)\s*(?:#\d)*\s*\{/g;
  while ((x = def.exec(src))) {
    const g = grupo(src, x.index + x[0].length - 1);
    if (g) { m['\\' + x[1]] = g.txt; def.lastIndex = g.fin; }
  }
  // \DeclareMathOperator{\sen}{sen}  (con * = límites encima y debajo)
  const op = /\\DeclareMathOperator(\*?)\s*\{\s*\\([a-zA-Z]+)\s*\}\s*\{([^{}]*)\}/g;
  while ((x = op.exec(src))) m['\\' + x[2]] = `\\operatorname${x[1]}{${x[3]}}`;
  return m;
}

/**
 * Definiciones del preámbulo propio en forma de órdenes que MathJax entiende, en el orden en que aparecen:
 * \newcommand (con [n] y [valor] por defecto) y \def pasan tal cual (siempre como \renewcommand, para poder
 * redefinirlas al editar el preámbulo), \DeclareMathOperator, \definecolor y \DeclareSIUnit (→ \mathrm{…}).
 * @returns {string[]}
 */
export function definicionesMathJax(extra = '') {
  const src = sinComentarios(extra);
  const out = [];
  let x;
  const re = /\\(?:re|provide)?newcommand\*?\s*(?:\{\s*\\([a-zA-Z@]+)\s*\}|\\([a-zA-Z@]+))\s*((?:\[[^\]]*\]\s*)*)\{/g;
  while ((x = re.exec(src))) {
    const g = grupo(src, x.index + x[0].length - 1);
    if (g) { out.push({ pos: x.index, tex: `\\renewcommand{\\${x[1] || x[2]}}${x[3].replace(/\s+/g, '')}{${g.txt}}` }); re.lastIndex = g.fin; }
  }
  const def = /\\def\s*\\([a-zA-Z@]+)\s*((?:#\d)*)\s*\{/g;
  while ((x = def.exec(src))) {
    const g = grupo(src, x.index + x[0].length - 1);
    if (g) { out.push({ pos: x.index, tex: `\\def\\${x[1]}${x[2]}{${g.txt}}` }); def.lastIndex = g.fin; }
  }
  const op = /\\DeclareMathOperator(\*?)\s*\{\s*\\([a-zA-Z]+)\s*\}\s*\{([^{}]*)\}/g;
  while ((x = op.exec(src))) out.push({ pos: x.index, tex: `\\DeclareMathOperator${x[1]}{\\${x[2]}}{${x[3]}}` });
  const col = /\\definecolor\s*\{([^{}]*)\}\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
  while ((x = col.exec(src))) out.push({ pos: x.index, tex: x[0].replace(/\s+/g, '') });
  // \DeclareSIUnit\kgf{kgf}  (la orden puede ir en otra línea)
  const si = /\\DeclareSIUnit\s*\\([a-zA-Z]+)\s*\{([^{}]*)\}/g;
  while ((x = si.exec(src))) out.push({ pos: x.index, tex: `\\def\\${x[1]}{\\mathrm{${x[2]}}}` });
  // \strut dentro de \colorbox{…}{\strut …}: MathJax lo escribiría como texto; no aporta nada visible
  return out.sort((a, b) => a.pos - b.pos).map((d) => d.tex.replace(/\\strut\b\s*/g, ''));
}

// ── Expansión de macros de texto (solo para la vista previa; el código original no se toca) ─────────────

/** @typedef {{ n: number, opt: string|null, cuerpo: string }} MacroTexto */

/** Macros del preámbulo con su número de argumentos y valor opcional por defecto. @returns {Map<string, MacroTexto>} */
export function tablaMacros(extra = '') {
  const src = sinComentarios(extra);
  const t = new Map();
  let x;
  const re = /\\(?:re|provide)?newcommand\*?\s*(?:\{\s*\\([a-zA-Z@]+)\s*\}|\\([a-zA-Z@]+))\s*(\[\s*(\d)\s*\])?\s*(\[([^\]]*)\])?\s*\{/g;
  while ((x = re.exec(src))) {
    const g = grupo(src, x.index + x[0].length - 1);
    if (!g) continue;
    t.set(x[1] || x[2], { n: x[4] ? +x[4] : 0, opt: x[5] !== undefined ? x[5] : null, cuerpo: g.txt });
    re.lastIndex = g.fin;
  }
  const def = /\\def\s*\\([a-zA-Z@]+)\s*((?:#\d)*)\s*\{/g;
  while ((x = def.exec(src))) {
    const g = grupo(src, x.index + x[0].length - 1);
    if (g) { t.set(x[1], { n: x[2].length / 2, opt: null, cuerpo: g.txt }); def.lastIndex = g.fin; }
  }
  // \DeclareSIUnit\kgf{kgf}: en texto, la unidad es su propio nombre
  const si = /\\DeclareSIUnit\s*\\([a-zA-Z]+)\s*\{([^{}]*)\}/g;
  while ((x = si.exec(src))) t.set(x[1], { n: 0, opt: null, cuerpo: x[2] });
  return t;
}

/** Colores de \definecolor{nombre}{RGB|rgb|HTML|gray}{…} → { nombre: '#rrggbb' }. */
export function coloresDe(extra = '') {
  const out = {};
  const src = sinComentarios(extra);
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  for (const m of src.matchAll(/\\definecolor\s*\{([^{}]*)\}\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g)) {
    const v = m[3].split(',').map((s) => parseFloat(s));
    if (m[2] === 'RGB' && v.length === 3) out[m[1]] = hex(v[0], v[1], v[2]);
    else if (m[2] === 'rgb' && v.length === 3) out[m[1]] = hex(v[0] * 255, v[1] * 255, v[2] * 255);
    else if (m[2] === 'gray' && v.length === 1) out[m[1]] = hex(v[0] * 255, v[0] * 255, v[0] * 255);
    else if (m[2] === 'HTML' && /^[0-9a-fA-F]{6}$/.test(m[3].trim())) out[m[1]] = '#' + m[3].trim();
  }
  return out;
}

// El preámbulo vigente lo da el editor (estado compartido); aquí solo se guarda cómo pedirlo.
let fuentePreambulo = () => '';
let cache = { extra: null, macros: new Map(), colores: {} };
export function usarFuentePreambulo(fn) { fuentePreambulo = fn; cache.extra = null; }
function vigente() {
  const extra = String(fuentePreambulo() || '');
  if (extra !== cache.extra) cache = { extra, macros: tablaMacros(extra), colores: coloresDe(extra) };
  return cache;
}
export const macrosVigentes = () => vigente().macros;
/** Color definido con \definecolor en el preámbulo propio (o null). */
export const colorDelPreambulo = (nombre) => vigente().colores[nombre] || null;

/** Argumento de una macro: {…} o un solo carácter/orden. → { txt, fin } o null. */
function argumentoMacro(s, i) {
  while (s[i] === ' ' || s[i] === '\n' || s[i] === '\t') i++;
  if (i >= s.length) return null;
  if (s[i] === '{') return grupo(s, i);
  if (s[i] === '\\') { const m = /^\\([a-zA-Z@]+|.)/.exec(s.slice(i, i + 40)); return { txt: m[0], fin: i + m[0].length }; }
  return { txt: s[i], fin: i + 1 };
}

/** \IfFileExists{a}{sí}{no} → «no» (en la vista previa los archivos de la persona no están junto al código). \detokenize{x} → x. */
function ordenesDeSistema(s) {
  let out = s;
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const m = /\\(IfFileExists|IfFileExistsTF|detokenize|unexpanded)\b/.exec(out);
    if (!m) break;
    let k = m.index + m[0].length;
    const a = argumentoMacro(out, k);
    if (!a) break;
    if (m[1] === 'IfFileExists' || m[1] === 'IfFileExistsTF') {
      const b = argumentoMacro(out, a.fin), c = b && argumentoMacro(out, b.fin);
      if (!b || !c) break;
      out = out.slice(0, m.index) + c.txt + out.slice(c.fin);
    } else out = out.slice(0, m.index) + a.txt + out.slice(a.fin);
  }
  return out;
}

/**
 * Expande las macros del preámbulo propio dentro de `src` (con argumentos, opcional por defecto y anidamiento).
 * Lo que no sea una macro propia se deja igual. Devuelve el mismo texto si no hay nada que expandir.
 */
export function expandirMacros(src, tabla = macrosVigentes(), prof = 0) {
  src = String(src ?? '');
  if (!tabla.size || prof > 8 || !src.includes('\\')) return src;
  let out = '', i = 0, cambio = false;
  const re = /\\(\\|[a-zA-Z@]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const nombre = m[1];
    const def = nombre === '\\' ? null : tabla.get(nombre);
    if (!def) continue;
    let k = m.index + m[0].length;
    const args = [];
    let n = def.n;
    if (def.opt !== null && n > 0) {                       // primer argumento opcional: [valor] o el de por defecto
      let j = k; while (src[j] === ' ') j++;
      if (src[j] === '[') { const f = src.indexOf(']', j); if (f > 0) { args.push(src.slice(j + 1, f)); k = f + 1; } else args.push(def.opt); }
      else args.push(def.opt);
      n--;
    }
    let fallo = false;
    for (let a = 0; a < n; a++) {
      const g = argumentoMacro(src, k);
      if (!g) { fallo = true; break; }
      args.push(g.txt); k = g.fin;
    }
    if (fallo) continue;
    out += src.slice(i, m.index);
    let cuerpo = expandirMacros(def.cuerpo.replace(/#(\d)/g, (_, d) => args[d - 1] ?? ''), tabla, prof + 1);
    // como en TeX, tras una orden con nombre el espacio no cuenta: hay que separar \bfseries de lo que se expande a continuación
    if (/\\[a-zA-Z@]+$/.test(out) && /^[a-zA-Z@]/.test(cuerpo)) cuerpo = ' ' + cuerpo;
    if (/\\[a-zA-Z@]+$/.test(cuerpo) && /^[a-zA-Z@]/.test(src.slice(k))) cuerpo += ' ';
    out += cuerpo;
    i = k; re.lastIndex = k; cambio = true;
    if (out.length > 400000) break;
  }
  if (!cambio) return ordenesDeSistema(src);
  return ordenesDeSistema(out + src.slice(i)).replace(/\\strut\b\s*/g, '');   // \strut no dibuja nada y MathJax lo escribiría como texto
}

/** ¿Usa `src` alguna macro del preámbulo propio? */
export function usaMacrosPropias(src, tabla = macrosVigentes()) {
  if (!tabla.size) return false;
  for (const m of String(src || '').matchAll(/\\([a-zA-Z@]+)/g)) if (tabla.has(m[1])) return true;
  return false;
}
