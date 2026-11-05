// Del modelo a código LaTeX.

import { TEOREMAS, NIVELES, MARCAS } from './modelo.js?v=2026.11.04-a';

const ESC = { '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '\u00a0': '~' };
// Símbolos Unicode que pdfLaTeX no entiende por sí solo: se escriben como comandos de LaTeX.
const SIMBOLOS = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu',
  'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'φ': '\\varphi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  '±': '\\pm', '×': '\\times', '÷': '\\div', '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '∞': '\\infty', '∑': '\\sum', '∫': '\\int', '√': '\\sqrt{\\ }',
  '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow', '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '∪': '\\cup', '∩': '\\cap',
  '∀': '\\forall', '∃': '\\exists', '∂': '\\partial', '∇': '\\nabla', '·': '\\cdot', '°': '^{\\circ}', '−': '-', '∅': '\\emptyset', '≡': '\\equiv', '∝': '\\propto',
};
const SIMB_RE = new RegExp('[' + Object.keys(SIMBOLOS).join('') + ']', 'g');
const aMate = (c) => { const v = SIMBOLOS[c]; return c === '−' ? '--' : `\\ensuremath{${v}}`; };
export const escapar = (s) => String(s).replace(/[\\&%$#_{}~^\u00a0]/g, (c) => ESC[c]).replace(SIMB_RE, aMate);
const escUrl = (u) => String(u).replace(/([%#\\{}])/g, '\\$1');

const ARCHIVO_RE = /[^\w.-]/g;
export const nombreArchivo = (n, i = 0) => (String(n || '').replace(ARCHIVO_RE, '_') || `imagen${i + 1}.png`);

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
    else if (n.nota) o += `\\footnote{${inlineATex(n.nota, ctx)}}`;
    else if (n.cita != null) o += `\\cite{${n.cita}}`;
    else if (n.ref != null) o += `\\ref{${n.ref}}`;
    else if (n.url != null) { o += `\\href{${escUrl(n.url)}}{${inlineATex(n.c && n.c.length ? n.c : [{ s: n.url }], ctx)}}`; }
    else if (n.raw != null) o += n.raw;
    else if (n.br) o += '\\\\ ';
  }
  return o;
}

const LST_ES = "literate={á}{{\\'a}}1 {é}{{\\'e}}1 {í}{{\\'i}}1 {ó}{{\\'o}}1 {ú}{{\\'u}}1 {Á}{{\\'A}}1 {É}{{\\'E}}1 {Í}{{\\'I}}1 {Ó}{{\\'O}}1 {Ú}{{\\'U}}1 {ñ}{{\\~n}}1 {Ñ}{{\\~N}}1 {ü}{{\\\"u}}1 {Ü}{{\\\"U}}1 {¿}{{?`}}1 {¡}{{!`}}1";

const LST_LANG = { python: 'Python', java: 'Java', c: 'C', 'c++': 'C++', matlab: 'Matlab', sql: 'SQL', bash: 'bash', html: 'HTML', tex: 'TeX', r: 'R' };

function listaATex(items, ord, ctx) {
  const env = ord ? 'enumerate' : 'itemize';
  let o = '', nivel = -1;
  const stack = [];
  const abrir = () => { o += `${'  '.repeat(stack.length)}\\begin{${env}}\n`; stack.push(env); };
  const cerrar = () => { stack.pop(); o += `${'  '.repeat(stack.length)}\\end{${env}}\n`; };
  for (const it of items) {
    const n = Math.min(it.n || 0, stack.length); // no se salta de nivel
    while (stack.length < n + 1) abrir();
    while (stack.length > n + 1) cerrar();
    o += `${'  '.repeat(stack.length)}\\item ${inlineATex(it.c, ctx)}\n`;
    nivel = n;
  }
  while (stack.length) cerrar();
  return o.trimEnd();
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
    const cel = f.map((c) => {
      const s = inlineATex(c, ctx);
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
    return `\\begin{table}[h]\n\\centering\n${t}\n\\caption{${inlineATex(b.pie, ctx)}}\n${b.label ? `\\label{${b.label}}\n` : ''}\\end{table}`;
  }
  return `\\begin{center}\n${t}\n\\end{center}`;
}

function bloqueATex(b, ctx) {
  const lab = (l) => (l ? `\\label{${l}}` : '');
  switch (b.t) {
    case 'p': {
      const s = inlineATex(b.c, ctx);
      if (b.al === 'c') return `\\begin{center}\n${s}\n\\end{center}`;
      if (b.al === 'r') return `\\begin{flushright}\n${s}\n\\end{flushright}`;
      if (b.al === 'l') return `\\begin{flushleft}\n${s}\n\\end{flushleft}`;
      return s;
    }
    case 'h': {
      const cmd = NIVELES[b.n] || 'section';
      const real = (b.n === 0 && ctx.cfg.clase === 'article') ? 'section' : cmd;
      return `\\${real}${b.num === false ? '*' : ''}{${inlineATex(b.c, ctx)}}${lab(b.label)}`;
    }
    case 'lista': return listaATex(b.items, b.ord, ctx);
    case 'eq': {
      const env = b.env + (b.num ? '' : '*');
      return `\\begin{${env}}\n${b.tex.trim()}${b.label && b.num ? ` ${lab(b.label)}` : ''}\n\\end{${env}}`;
    }
    case 'tabla': return tablaATex(b, ctx);
    case 'fig': {
      const arch = nombreArchivo(b.nombre, ctx.imagenes.length);
      if (b.src) ctx.imagenes.push({ nombre: arch, src: b.src });
      const w = (b.ancho / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=${w}\\linewidth]{imagenes/${arch}}\n${b.pie && b.pie.length ? `\\caption{${inlineATex(b.pie, ctx)}}\n` : ''}${lab(b.label) ? lab(b.label) + '\n' : ''}\\end{figure}`;
    }
    case 'cod': {
      const lang = LST_LANG[(b.lang || '').toLowerCase()];
      if (!b.lang || !lang) {
        ctx.usos.add('listings');
        return `\\begin{lstlisting}${b.num ? '[numbers=left]' : ''}\n${b.src}\n\\end{lstlisting}`;
      }
      ctx.usos.add('listings');
      return `\\begin{lstlisting}[language=${lang}${b.num ? ',numbers=left' : ''}]\n${b.src}\n\\end{lstlisting}`;
    }
    case 'teo': {
      ctx.teoremas.add(b.tipo);
      const tit = b.titulo ? `[${inlineATex([{ s: b.titulo }], ctx)}]` : '';
      return `\\begin{${b.tipo}}${tit}\n${inlineATex(b.c, ctx)}\n\\end{${b.tipo}}`;
    }
    case 'cita': return `\\begin{quote}\n${inlineATex(b.c, ctx)}\n\\end{quote}`;
    case 'resumen': return `\\begin{abstract}\n${inlineATex(b.c, ctx)}\n\\end{abstract}`;
    case 'salto': return '\\newpage';
    case 'toc': return '\\tableofcontents';
    case 'raw': return b.tex;
    default: return '';
  }
}

const BABEL_AJUSTE = { spanish: 'spanish', english: 'english', portuguese: 'portuguese', french: 'french', german: 'ngerman', italian: 'italian' };

/**
 * @param {object} doc { cfg, biblio, extra }
 * @param {object[]} bloques  bloques en orden
 * @returns {{ tex: string, imagenes: {nombre:string, src:string}[] }}
 */
export function generarTex(doc, bloques) {
  const cfg = doc.cfg;
  const ctx = { cfg, usos: new Set(), teoremas: new Set(), imagenes: [] };
  const cuerpo = bloques.map((b) => bloqueATex(b, ctx)).filter((s) => s !== '');

  const opciones = [`${cfg.fuente}pt`, cfg.papel];
  if (cfg.columnas === 2) opciones.push('twocolumn');
  const es = cfg.idioma === 'spanish';
  const pre = [];
  pre.push(`\\documentclass[${opciones.join(',')}]{${cfg.clase}}`);
  pre.push('\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}');
  pre.push(`\\usepackage[${BABEL_AJUSTE[cfg.idioma] || 'english'}]{babel}`);
  if (cfg.margen !== 'extra') pre.push(`\\usepackage[${cfg.papel},margin=${cfg.margen}cm]{geometry}`);
  pre.push('\\usepackage{amsmath,amssymb,amsthm}');
  pre.push('\\usepackage{graphicx}');
  if (ctx.usos.has('booktabs')) pre.push('\\usepackage{booktabs}');
  if (ctx.usos.has('ulem')) pre.push('\\usepackage[normalem]{ulem}');
  if (cfg.interlineado !== 1) pre.push('\\usepackage{setspace}', `\\setstretch{${cfg.interlineado}}`);
  if (ctx.usos.has('listings')) {
    pre.push('\\usepackage{listings}', '\\usepackage{xcolor}',
      `\\lstset{basicstyle=\\ttfamily\\small, breaklines=true, frame=single, numberstyle=\\tiny, keywordstyle=\\color{blue}, commentstyle=\\color{gray}, stringstyle=\\color{teal}, ${LST_ES}}`);
  }
  pre.push('\\usepackage[hidelinks]{hyperref}');
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
  if (doc.extra && doc.extra.trim()) pre.push('', '% --- Preámbulo propio ---', doc.extra.trim(), '% ---');
  const info = [];
  if (cfg.titulo) info.push(`\\title{${inlineATex(textoAInline(cfg.titulo))}}`);
  if (cfg.autor) info.push(`\\author{${inlineATex(textoAInline(cfg.autor))}}`);
  if (cfg.fecha === 'ninguna') info.push('\\date{}');
  else if (cfg.fecha) info.push(`\\date{${inlineATex(textoAInline(cfg.fecha))}}`);

  const salida = [pre.join('\n'), '', info.join('\n'), '\\begin{document}', ''];
  if (cfg.titulo && cfg.mostrarTitulo) salida.push('\\maketitle', '');
  salida.push(cuerpo.join('\n\n'));
  if (doc.biblio && doc.biblio.length) {
    salida.push('', `\\begin{thebibliography}{99}`);
    for (const r of doc.biblio) salida.push(`\\bibitem{${r.key}} ${inlineATex(textoAInline(r.texto))}`);
    salida.push('\\end{thebibliography}');
  }
  salida.push('', '\\end{document}', '');
  return { tex: salida.join('\n').replace(/\n{4,}/g, '\n\n\n').replace(/^\n+(?=\\begin\{document\})/m, ''), imagenes: ctx.imagenes };
}

const textoAInline = (s) => [{ s: String(s) }];
