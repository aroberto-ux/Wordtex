// Del modelo a código LaTeX.
//
// Reglas que se cumplen siempre:
//   · El .tex generado compila con pdfLaTeX en una distribución estándar (TeX Live / MiKTeX / Overleaf).
//   · Lo que genera esta función lo vuelve a leer latex-parse.js sin perder nada (ida y vuelta estable).

import { TEOREMAS, NIVELES } from './modelo.js?v=2026.11.04-c';

const ESC = { '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '\u00a0': '~' };
// Símbolos Unicode que pdfLaTeX no entiende por sí solo: se escriben como comandos de LaTeX.
// El lector (latex-parse.js) usa esta misma tabla al revés, así que \ensuremath{…} vuelve a ser el símbolo.
export const SIMBOLOS = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu',
  'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'φ': '\\varphi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  '±': '\\pm', '×': '\\times', '÷': '\\div', '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '∞': '\\infty', '∑': '\\sum', '∫': '\\int', '√': '\\surd',
  '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow', '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '∪': '\\cup', '∩': '\\cap',
  '∀': '\\forall', '∃': '\\exists', '∂': '\\partial', '∇': '\\nabla', '·': '\\cdot', '°': '^{\\circ}', '−': '-', '∅': '\\emptyset', '≡': '\\equiv', '∝': '\\propto',
};
const SIMB_RE = new RegExp('[' + Object.keys(SIMBOLOS).join('') + ']', 'g');
const aMate = (c) => `\\ensuremath{${SIMBOLOS[c]}}`;
export const escapar = (s) => String(s).replace(/[\\&%$#_{}~^\u00a0]/g, (c) => ESC[c]).replace(SIMB_RE, aMate);
const escUrl = (u) => String(u).replace(/([%#\\{}])/g, '\\$1');

const ARCHIVO_RE = /[^\w.-]/g;
export const nombreArchivo = (n, i = 0) => (String(n || '').replace(ARCHIVO_RE, '_') || `imagen${i + 1}.png`);

/** Quita los saltos de línea al principio y al final: «\\» sin texto antes no compila. */
export function recortarBr(c) {
  let a = 0, b = (c || []).length;
  while (a < b && c[a].br) a++;
  while (b > a && c[b - 1].br) b--;
  return a === 0 && b === (c || []).length ? (c || []) : c.slice(a, b);
}

/** Texto en línea → LaTeX. */
export function inlineATex(c, ctx = {}) {
  let o = '';
  for (const n of c || []) {
    if (typeof n === 'string') { o += escapar(n); continue; }
    if (n.s != null) {
      let t = escapar(n.s).replace(/\u201c/g, '``').replace(/\u201d/g, "''");
      t = t.replace(/\n/g, ' ');
      if (n.c) t = `\\texttt{${t}}`;
      if (n.sub) t = `\\textsubscript{${t}}`;
      if (n.sup) t = `\\textsuperscript{${t}}`;
      if (n.u) t = `\\underline{${t}}`;
      if (n.st) { t = `\\sout{${t}}`; if (ctx.usos) ctx.usos.add('ulem'); }
      if (n.i) t = `\\textit{${t}}`;
      if (n.b) t = `\\textbf{${t}}`;
      o += t;
    } else if (n.mate != null) o += `$${n.mate}$`;
    else if (n.nota) o += `\\footnote{${inlineATex(recortarBr(n.nota), ctx)}}`;
    else if (n.cita != null) o += `\\cite{${n.cita}}`;
    else if (n.ref != null) o += `\\ref{${n.ref}}`;
    else if (n.url != null) {
      const txt = n.c && n.c.length ? n.c : [{ s: n.url }];
      o += n.url ? `\\href{${escUrl(n.url)}}{${inlineATex(txt, ctx)}}` : inlineATex(txt, ctx);
    } else if (n.raw != null) { o += n.raw; detectarUsos(n.raw, ctx); }
    else if (n.br) o += '\\\\ ';
  }
  return o;
}

/** Paquetes que necesita el LaTeX propio (bloques crudos, preámbulo) aunque ningún bloque visual los use. */
const USOS_RAW = [
  [/\\(toprule|midrule|bottomrule|cmidrule|addlinespace)\b/, 'booktabs'],
  [/\\(lstinline|lstinputlisting)\b|\\begin\{lstlisting\}/, 'listings'],
  [/\\(sout|uline|uuline|uwave|xout|dashuline|dotuline)\b/, 'ulem'],
  [/\\begin\{(table|figure)\*?\}\s*\[[^\]]*H|\\(restylefloat|newfloat|floatstyle)\b/, 'float'],
  [/\\multirow\b/, 'multirow'],
  [/\\begin\{tabularx\}/, 'tabularx'],
  [/\\begin\{longtable\}|\\endhead\b/, 'longtable'],
  [/\\(onehalfspacing|doublespacing|singlespacing|setstretch)\b|\\begin\{(spacing|onehalfspace|doublespace)\}/, 'setspace'],
];
function detectarUsos(tex, ctx) {
  if (!ctx || !ctx.usos || !tex) return;
  for (const [re, p] of USOS_RAW) if (re.test(tex)) ctx.usos.add(p);
}

const LST_ES = "literate={á}{{\\'a}}1 {é}{{\\'e}}1 {í}{{\\'i}}1 {ó}{{\\'o}}1 {ú}{{\\'u}}1 {Á}{{\\'A}}1 {É}{{\\'E}}1 {Í}{{\\'I}}1 {Ó}{{\\'O}}1 {Ú}{{\\'U}}1 {ñ}{{\\~n}}1 {Ñ}{{\\~N}}1 {ü}{{\\\"u}}1 {Ü}{{\\\"U}}1 {¿}{{?`}}1 {¡}{{!`}}1";

const LST_LANG = { python: 'Python', java: 'Java', c: 'C', 'c++': 'C++', matlab: 'Matlab', sql: 'SQL', bash: 'bash', html: 'HTML', tex: 'TeX', r: 'R' };

function listaATex(items, ord, ctx) {
  const env = ord ? 'enumerate' : 'itemize';
  let o = '';
  const stack = [];
  const abrir = () => { o += `${'  '.repeat(stack.length)}\\begin{${env}}\n`; stack.push(env); };
  const cerrar = () => { stack.pop(); o += `${'  '.repeat(stack.length)}\\end{${env}}\n`; };
  for (const it of items) {
    const n = Math.min(it.n || 0, stack.length); // no se salta de nivel
    while (stack.length < n + 1) abrir();
    while (stack.length > n + 1) cerrar();
    o += `${'  '.repeat(stack.length)}\\item ${inlineATex(recortarBr(it.c), ctx)}\n`;
  }
  while (stack.length) cerrar();
  return o.trimEnd();
}

/** Celda con saltos de línea: una tabla anidada (sin paquetes extra), entre llaves para no partir la fila. */
function celdaATex(c, al, ctx) {
  const n = recortarBr(c);
  const s = inlineATex(n, ctx);
  if (!n.some((x) => x.br)) return s;
  return `{\\begin{tabular}[t]{@{}${al}@{}}${s}\\end{tabular}}`;
}

function tablaATex(b, ctx) {
  const cols = b.al.length;
  const barra = b.borde === 'completo' ? '|' : '';
  const spec = barra + b.al.join(barra) + barra;
  const hor = b.borde === 'horizontal';
  if (hor) ctx.usos.add('booktabs');
  const lin = (tipo) => (b.borde === 'completo' ? '\\hline\n' : hor ? { top: '\\toprule\n', mid: '\\midrule\n', bot: '\\bottomrule\n' }[tipo] : '');
  let t = `\\begin{tabular}{${spec}}\n` + lin('top');
  b.filas.forEach((f, i) => {
    const cel = f.map((c, j) => {
      const s = celdaATex(c, b.al[j] || 'l', ctx);
      return b.enc && i === 0 && s ? `\\textbf{${s}}` : s;
    });
    while (cel.length < cols) cel.push('');
    t += cel.join(' & ') + ' \\\\\n';
    if (i === 0 && b.enc && b.filas.length > 1) t += lin('mid');
    else if (b.borde === 'completo') t += '\\hline\n';
  });
  if (hor) t += lin('bot');
  t += '\\end{tabular}';
  if (b.pie && b.pie.length) {
    // en las tablas el pie va arriba (convención tipográfica habitual)
    return `\\begin{table}[htbp]\n\\centering\n\\caption{${inlineATex(recortarBr(b.pie), ctx)}}\n${b.label ? `\\label{${b.label}}\n` : ''}${t}\n\\end{table}`;
  }
  return `\\begin{center}\n${t}\n\\end{center}`;
}

/**
 * Nombre de archivo de la imagen de una figura dentro de imagenes/. Dos figuras distintas con el mismo
 * nombre se pisarían en el .zip, así que la segunda pasa a llamarse «nombre-2.png».
 * `imagenes` acumula [{nombre, src}] en el orden del documento.
 */
export function archivoDe(b, imagenes) {
  let arch = nombreArchivo(b.nombre, imagenes.length);
  const previa = imagenes.find((x) => x.nombre === arch);
  if (previa && previa.src !== b.src) {
    const [base, ext = ''] = /^(.*?)(\.[^.]*)?$/.exec(arch).slice(1);
    let k = 2; while (imagenes.some((x) => x.nombre === `${base}-${k}${ext}`)) k++;
    arch = `${base}-${k}${ext}`;
  }
  if (!imagenes.some((x) => x.nombre === arch)) imagenes.push({ nombre: arch, src: b.src });
  return arch;
}

const anchoLatex = (ancho) => (ancho / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

function bloqueATex(b, ctx) {
  const lab = (l) => (l ? `\\label{${l}}` : '');
  switch (b.t) {
    case 'p': {
      const s = inlineATex(recortarBr(b.c), ctx);
      if (b.al === 'c') return `\\begin{center}\n${s}\n\\end{center}`;
      if (b.al === 'r') return `\\begin{flushright}\n${s}\n\\end{flushright}`;
      if (b.al === 'l') return `\\begin{flushleft}\n${s}\n\\end{flushleft}`;
      return s;
    }
    case 'h': {
      const cmd = NIVELES[b.n] || 'section';
      const real = (b.n === 0 && ctx.cfg.clase === 'article') ? 'section' : cmd;
      return `\\${real}${b.num === false ? '*' : ''}{${inlineATex(recortarBr(b.c), ctx)}}${lab(b.label)}`;
    }
    case 'lista': return listaATex(b.items, b.ord, ctx);
    case 'eq': {
      const env = b.env + (b.num ? '' : '*');
      let cuerpoEq = b.tex.trim();
      if (b.label && b.num) {
        if (b.env === 'equation') cuerpoEq += ` ${lab(b.label)}`;
        else {
          // en align/gather la etiqueta va en la primera fila numerada (si cae en una con \nonumber, \ref da «??»)
          const filas = cuerpoEq.split(/(?<=\\\\)/);
          let k = filas.findIndex((f) => !/\\(nonumber|notag)\b/.test(f));
          if (k < 0) k = 0;
          filas[k] = filas[k].replace(/^([\s\S]*?)(\s*\\\\)?$/, (m, a, fin) => `${a.replace(/\s+$/, '')}${lab(b.label)}${fin || ''}`);
          cuerpoEq = filas.join('');
        }
      }
      return `\\begin{${env}}\n${cuerpoEq}\n\\end{${env}}`;
    }
    case 'tabla': return tablaATex(b, ctx);
    case 'fig': {
      const w = anchoLatex(b.ancho);
      const pie = b.pie && b.pie.length ? `\\caption{${inlineATex(recortarBr(b.pie), ctx)}}\n` : '';
      let img;
      if (b.src) {
        const arch = archivoDe(b, ctx.imagenes);
        img = `\\includegraphics[width=${w}\\linewidth]{imagenes/${arch}}`;
      } else {
        // sin imagen todavía: un recuadro del mismo tamaño para que el documento compile igual
        img = `\\fbox{\\parbox[c][0.3\\linewidth][c]{${w}\\linewidth}{\\centering Imagen pendiente}}`;
      }
      return `\\begin{figure}[htbp]\n\\centering\n${img}\n${pie}${b.label && pie ? lab(b.label) + '\n' : ''}\\end{figure}`;
    }
    case 'cod': {
      ctx.usos.add('listings');
      const lang = LST_LANG[(b.lang || '').toLowerCase()];
      const opc = [lang ? `language=${lang}` : '', b.num ? 'numbers=left' : ''].filter(Boolean).join(',');
      // «\end{lstlisting}» dentro del código cerraría el entorno antes de tiempo
      const src = b.src.replace(/\\end\{lstlisting\}/g, '\\end {lstlisting}');
      return `\\begin{lstlisting}${opc ? `[${opc}]` : ''}\n${src}\n\\end{lstlisting}`;
    }
    case 'teo': {
      ctx.teoremas.add(b.tipo);
      const tit = b.titulo ? `[${inlineATex([{ s: b.titulo }], ctx)}]` : '';
      return `\\begin{${b.tipo}}${tit}\n${inlineATex(recortarBr(b.c), ctx)}\n\\end{${b.tipo}}`;
    }
    case 'cita': return `\\begin{quote}\n${inlineATex(recortarBr(b.c), ctx)}\n\\end{quote}`;
    case 'resumen': ctx.usos.add('abstract'); return `\\begin{abstract}\n${inlineATex(recortarBr(b.c), ctx)}\n\\end{abstract}`;
    case 'salto': return '\\newpage';
    case 'toc': return '\\tableofcontents';
    case 'raw': detectarUsos(b.tex, ctx); return b.tex;
    default: return '';
  }
}

const BABEL = { spanish: 'spanish,es-tabla', english: 'english', portuguese: 'portuguese', french: 'french', german: 'ngerman', italian: 'italian' };
// La clase «book» no define el entorno abstract: se crea uno equivalente al de «report».
export const ABSTRACT_BOOK = [
  '% La clase book no trae resumen: se define uno igual al de report',
  '\\providecommand{\\abstractname}{Abstract}',
  '\\newenvironment{abstract}{\\begin{center}\\bfseries\\abstractname\\end{center}\\begin{quotation}}{\\end{quotation}}',
];

/** Texto plano apto para los metadatos del PDF (sin comandos). */
// Solo caracteres latinos que inputenc conoce: un α en los metadatos haría fallar la compilación.
const textoPdf = (s) => String(s).replace(/[\\{}%#&$^_~]/g, ' ').replace(/[^ -ſ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {object} doc { cfg, biblio, extra }
 * @param {object[]} bloques  bloques en orden
 * @returns {{ tex: string, imagenes: {nombre:string, src:string}[] }}
 */
export function generarTex(doc, bloques) {
  const cfg = doc.cfg;
  const ctx = { cfg, usos: new Set(), teoremas: new Set(), imagenes: [] };
  const cuerpo = bloques.map((b) => bloqueATex(b, ctx)).filter((s) => s !== '');
  const extra = (doc.extra || '').trim();
  detectarUsos(extra, ctx);
  // Si el preámbulo propio ya carga el paquete no se repite (con otras opciones daría «Option clash»).
  // listings y setspace se cargan igual cuando hace falta configurarlos antes del preámbulo propio.
  const cargaExtra = (p) => new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${p}\\b`).test(extra);
  for (const p of ['booktabs', 'ulem', 'float', 'multirow', 'tabularx', 'longtable']) if (cargaExtra(p)) ctx.usos.delete(p);
  if (cargaExtra('setspace') && cfg.interlineado === 1) ctx.usos.delete('setspace');

  const opciones = [`${cfg.fuente}pt`, cfg.papel];
  if (cfg.columnas === 2) opciones.push('twocolumn');
  const es = cfg.idioma === 'spanish';
  const pre = [];
  pre.push(`\\documentclass[${opciones.join(',')}]{${cfg.clase}}`);
  pre.push('\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}', '\\usepackage{microtype}');
  pre.push(`\\usepackage[${BABEL[cfg.idioma] || 'english'}]{babel}`);
  if (cfg.margen !== 'extra') pre.push(`\\usepackage[${cfg.papel},margin=${cfg.margen}cm]{geometry}`);
  pre.push('\\usepackage{amsmath,amssymb,amsthm}');
  pre.push('\\usepackage{graphicx}');
  if (ctx.usos.has('booktabs')) pre.push('\\usepackage{booktabs}');
  if (ctx.usos.has('ulem')) pre.push('\\usepackage[normalem]{ulem}');
  for (const p of ['float', 'multirow', 'tabularx', 'longtable']) if (ctx.usos.has(p)) pre.push(`\\usepackage{${p}}`);
  if (cfg.interlineado !== 1 || ctx.usos.has('setspace')) pre.push('\\usepackage{setspace}');
  if (cfg.interlineado !== 1) pre.push(`\\setstretch{${cfg.interlineado}}`);
  if (ctx.usos.has('listings')) {
    pre.push('\\usepackage{listings}', '\\usepackage{xcolor}',
      `\\lstset{basicstyle=\\ttfamily\\small, breaklines=true, frame=single, numberstyle=\\tiny, keywordstyle=\\color{blue}, commentstyle=\\color{gray}, stringstyle=\\color{teal}, ${LST_ES}}`);
  }
  pre.push('\\usepackage[hidelinks]{hyperref}');
  const meta = [cfg.titulo ? `pdftitle={${textoPdf(cfg.titulo)}}` : '', cfg.autor ? `pdfauthor={${textoPdf(cfg.autor)}}` : ''].filter(Boolean);
  if (meta.length) pre.push(`\\hypersetup{${meta.join(', ')}}`);
  if (cfg.clase === 'book' && ctx.usos.has('abstract')) pre.push(...ABSTRACT_BOOK);
  const vistos = Array.from(ctx.teoremas).filter((t) => TEOREMAS[t] && t !== 'proof');
  const nombres = (id) => TEOREMAS[id][es ? 'es' : 'en'];
  const porEstilo = {};
  for (const t of vistos) (porEstilo[TEOREMAS[t].estilo] ||= []).push(t);
  for (const est of ['plain', 'definition', 'remark']) {
    if (!porEstilo[est]) continue;
    pre.push(`\\theoremstyle{${est}}`);
    for (const t of porEstilo[est]) pre.push(`\\newtheorem{${t}}{${nombres(t)}}${cfg.clase === 'article' ? '' : '[chapter]'}`);
  }
  if (!cfg.numPag) pre.push('\\pagestyle{empty}');
  if (extra) pre.push('', '% --- Preámbulo propio ---', extra, '% ---');
  const info = [];
  if (cfg.titulo) info.push(`\\title{${inlineATex(textoAInline(cfg.titulo))}}`);
  if (cfg.autor) info.push(`\\author{${inlineATex(textoAInline(cfg.autor))}}`);
  if (cfg.fecha === 'ninguna') info.push('\\date{}');
  else if (cfg.fecha) info.push(`\\date{${inlineATex(textoAInline(cfg.fecha))}}`);

  const salida = [pre.join('\n'), ''];
  if (info.length) salida.push(info.join('\n'), '');
  salida.push('\\begin{document}', '');
  if (cfg.titulo && cfg.mostrarTitulo) salida.push('\\maketitle', '');
  salida.push(cuerpo.join('\n\n'));
  if (doc.biblio && doc.biblio.length) {
    salida.push('', `\\begin{thebibliography}{${doc.biblio.length > 9 ? 99 : 9}}`);
    for (const r of doc.biblio) salida.push(`\\bibitem{${r.key}} ${inlineATex(textoAInline(r.texto))}`);
    salida.push('\\end{thebibliography}');
  }
  salida.push('', '\\end{document}', '');
  return { tex: salida.join('\n').replace(/\n{4,}/g, '\n\n\n'), imagenes: ctx.imagenes };
}

const textoAInline = (s) => [{ s: String(s) }];
