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
