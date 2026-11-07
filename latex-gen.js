// Del modelo a código LaTeX.
//
// Reglas que se cumplen siempre:
//   · El .tex generado compila con pdfLaTeX en una distribución estándar (TeX Live / MiKTeX / Overleaf).
//   · Lo que genera esta función lo vuelve a leer latex-parse.js sin perder nada (ida y vuelta estable).

import { TEOREMAS, NIVELES, EQ_SIN_NUMERO, EQ_FILAS, dividirFilas } from './modelo.js?v=2026.11.07-h';
import { libreriasNecesarias } from './tikz-libs.js?v=2026.11.07-h';

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
    } else if (n.mate != null) { o += `$${n.mate}$`; detectarUsos(n.mate, ctx); }
    else if (n.nota) o += `\\footnote{${inlineATex(recortarBr(n.nota), ctx)}}`;
    else if (n.cita != null) o += `\\cite{${n.cita}}`;
    else if (n.ref != null) o += `\\${n.eq ? 'eqref' : 'ref'}{${n.ref}}`;
    else if (n.url != null) {
      const txt = n.c && n.c.length ? n.c : [{ s: n.url }];
      o += n.url ? `\\href{${escUrl(n.url)}}{${inlineATex(txt, ctx)}}` : inlineATex(txt, ctx);
    } else if (n.raw != null) { o += n.raw; detectarUsos(n.raw, ctx); }
    else if (n.br) o += '\\\\ ';
  }
  return o;
}

/**
 * Paquetes que necesita el LaTeX propio (bloques crudos, ecuaciones, preámbulo) aunque ningún bloque visual los use.
 * Cada regla puede pedir uno o varios paquetes. Solo se cargan cuando hacen falta y nunca si el preámbulo propio ya los carga.
 */
const USOS_RAW = [
  [/\\(toprule|midrule|bottomrule|cmidrule|addlinespace)\b/, 'booktabs'],
  [/\\(lstinline|lstinputlisting)\b|\\begin\{lstlisting\}/, 'listings'],
  [/\\(sout|uline|uuline|uwave|xout|dashuline|dotuline)\b/, 'ulem'],
  [/\\(onehalfspacing|doublespacing|singlespacing|setstretch)\b|\\begin\{(spacing|onehalfspace|doublespace)\}/, 'setspace'],
  [/\\begin\{tikzpicture\}|\\tikz\b|\\tikzset\b|\\tikzstyle\b|\\usetikzlibrary\b/, 'tikz'],
  // color
  [/\\(textcolor|colorbox|fcolorbox|definecolor|colorlet|pagecolor|color)\b/, 'xcolor'],
  [/\\(rowcolor|cellcolor|columncolor|arrayrulecolor)\b/, ['xcolor', 'colortbl']],
  // tablas
  [/\\multirow\b/, 'multirow'],
  [/\\(newcolumntype|arraybackslash|extrarowheight)\b|>\{\\/, 'array'],
  [/\\begin\{tabularx\}/, 'tabularx'],
  [/\\begin\{tabulary\}/, 'tabulary'],
  [/\\begin\{longtable\}/, 'longtable'],
  [/\\(makecell|thead|makegapedcells)\b/, 'makecell'],
  // flotantes, columnas y pies
  [/\\begin\{(figure|table|algorithm)\*?\}\s*\[[^\]]*H[^\]]*\]|\\(floatstyle|restylefloat|newfloat)\b/, 'float'],
  [/\\begin\{multicols\*?\}/, 'multicol'],
  [/\\begin\{wrap(figure|table)\}/, 'wrapfig'],
  [/\\(captionof|captionsetup)\b/, 'caption'],
  [/\\begin\{(subfigure|subtable)\}|\\subcaption\b/, 'subcaption'],
  // listas y unidades
  [/\\(setlist|setenumerate|setitemize|setdescription|newlist)\b|\\begin\{(enumerate|itemize|description)\}\s*\[[^\]]*=/, 'enumitem'],
  [/\\begin\{enumerate\}\s*\[[^\]=]*\]/, 'enumerate'],
  [/\\(SI|qty|sisetup|SIrange|numrange|SIlist|numlist|qtylist|qtyrange|ang|unit)\b/, 'siunitx'],
  // matemáticas (lo que MathJax dibuja pero pdfLaTeX no conoce sin su paquete)
  [/\\bm\b/, 'bm'],
  [/\\(cancel|bcancel|xcancel|cancelto)\b/, 'cancel'],
  [/\\(coloneqq|eqqcolon|coloneq|dcases|rcases|mathclap|mathllap|mathrlap|DeclarePairedDelimiter|prescript|xleftrightarrow|xrightleftharpoons|Aboxed|shortintertext|underbracket|overbracket|vcentcolon|xmapsto|xhookrightarrow|splitfrac|adjustlimits)\b|\\begin\{(multlined|lgathered|rgathered|[pbvBV]matrix\*|dcases\*?|rcases|cases\*|drcases)\}/, 'mathtools'],
  [/\\mathscr\b/, 'mathrsfs'],
  [/\\mathbbm\b/, 'bbm'],
  [/\\(ce|pu)\s*\{/, 'mhchem'],
  // más matemáticas comunes de Overleaf (comandos inequívocos; (?![a-zA-Z]) en vez de \b porque
  // muchos van seguidos de _ ^ { que \b no trata como límite)
  [/\\(iint|iiint|iiiint|oiint|oiiint|idotsint)(?![a-zA-Z])/, 'esint'],
  [/\\(llbracket|rrbracket|varcurlyvee|varcurlywedge|lightning|shortrightarrow|mapsfrom)(?![a-zA-Z])/, 'stmaryrd'],
  [/\\(upalpha|upbeta|upgamma|updelta|upepsilon|upmu|uppi|upphi|upomega|uptheta|uplambda|upsigma|uptau|Upgamma|Updelta|Uppi|Upomega)(?![a-zA-Z])/, 'upgreek'],
  [/\\mathds(?![a-zA-Z])/, 'dsfont'],
  [/\\(xlongequal|xLongrightarrow|xLongleftarrow|xlongrightarrow|xlongleftarrow)(?![a-zA-Z])/, 'extarrows'],
  [/\\centernot(?![a-zA-Z])/, 'centernot'],
  [/\\nicefrac(?![a-zA-Z])/, 'nicefrac'],
  [/\\(tensor|indices)(?![a-zA-Z])/, 'tensor'],
  // tipografía y texto (comandos específicos de cada paquete)
  [/\\microtypesetup\b/, 'microtype'],
  [/\\(sethlcolor|hlc)\b/, 'soul'],
  [/\\(enquote|foreignquote|textquote|blockquote)\b/, 'csquotes'],
  [/\\(celsius|perthousand|micro|ohm|degree)\b/, 'gensymb'],
  [/\\(textcelsius|textohm|textmu|textdegree)\b/, 'textcomp'],
  [/\\FloatBarrier\b/, 'placeins'],
  [/\\(cref|Cref|crefrange|Crefrange|cpageref|namecref)\b/, ['hyperref', 'cleveref']],
  [/\\(autoref|nameref|hyperref|hypersetup|href|nolinkurl)\b/, 'hyperref'],
  [/\\(fancyhf|fancyhead|fancyfoot|fancypagestyle|headrulewidth|footrulewidth)\b/, 'fancyhdr'],
  [/\\(titleformat|titlespacing|titlerule|titleclass)\b/, 'titlesec'],
  [/\\(RaggedRight|RaggedLeft|justifying)\b|\\begin\{(FlushLeft|FlushRight)\}/, 'ragged2e'],
  [/\\lipsum\b/, 'lipsum'],
  [/\\(tcbox|tcbset|newtcolorbox)\b|\\begin\{tcolorbox\}/, 'tcolorbox'],
  [/\\(mdfsetup|newmdenv)\b|\\begin\{mdframed\}/, 'mdframed'],
  [/\\begin\{(algorithmic|algorithm)\}|\\(algrenewcommand|algnewcommand)\b/, ['algorithm', 'algpseudocode']],
  [/\\begin\{algorithm2e\}|\\(KwData|KwResult|KwIn|KwOut|SetKwInOut)\b/, 'algorithm2e'],
  [/\\includepdf\b/, 'pdfpages'],
  [/\\(rotatebox|turnbox)\b|\\begin\{sideways\}/, 'rotating'],
  [/\\adjustbox\b|\\begin\{adjustbox\}/, 'adjustbox'],
  [/\\begin\{(tikzcd)\}/, ['tikz-cd', 'tikz']],
];
function detectarUsos(tex, ctx) {
  if (!ctx || !ctx.usos || !tex) return;
  for (const [re, p] of USOS_RAW) if (re.test(tex)) for (const q of [].concat(p)) ctx.usos.add(q);
  // dibujos TikZ dentro de LaTeX avanzado: también necesitan sus librerías
  if (ctx.libs && /\\begin\{tikzpicture\}|\\tikz\b/.test(tex)) for (const l of libreriasNecesarias(tex)) ctx.libs.add(l);
}

/** Paquetes que se añaden solos, en este orden, justo antes del preámbulo propio. */
export const PAQUETES_AUTO = ['xcolor', 'colortbl', 'array', 'tabularx', 'tabulary', 'longtable', 'makecell', 'multirow', 'float', 'multicol', 'wrapfig', 'caption', 'subcaption', 'enumitem', 'enumerate', 'siunitx', 'bm', 'cancel', 'mathtools', 'mathrsfs', 'bbm', 'mhchem',
  // símbolos y utilidades matemáticas sin configuración ni orden crítico
  'esint', 'stmaryrd', 'upgreek', 'dsfont', 'extarrows', 'centernot', 'nicefrac', 'tensor',
  // texto/tipografía sin orden crítico
  'csquotes', 'gensymb', 'textcomp', 'ragged2e', 'soul', 'lipsum'];

/**
 * Paquetes que deben cargarse DESPUÉS de hyperref o que configuran la página/flotantes y conviene
 * emitir al final del preámbulo generado (antes del propio). cleveref exige ir tras hyperref.
 */
export const PAQUETES_TARDIOS = ['cleveref', 'placeins', 'fancyhdr', 'titlesec', 'tcolorbox', 'mdframed', 'adjustbox', 'rotating', 'pdfpages', 'algorithm', 'algpseudocode', 'algorithm2e'];

const LST_ES = "literate={á}{{\\'a}}1 {é}{{\\'e}}1 {í}{{\\'i}}1 {ó}{{\\'o}}1 {ú}{{\\'u}}1 {Á}{{\\'A}}1 {É}{{\\'E}}1 {Í}{{\\'I}}1 {Ó}{{\\'O}}1 {Ú}{{\\'U}}1 {ñ}{{\\~n}}1 {Ñ}{{\\~N}}1 {ü}{{\\\"u}}1 {Ü}{{\\\"U}}1 {¿}{{?`}}1 {¡}{{!`}}1";

const LST_LANG = { python: 'Python', java: 'Java', c: 'C', 'c++': 'C++', matlab: 'Matlab', sql: 'SQL', bash: 'bash', html: 'HTML', tex: 'TeX', r: 'R' };

/** Etiqueta de \item[…]: si lleva «]» va entre llaves para no cerrar el corchete antes de tiempo. */
const etiquetaItem = (et, ctx) => { const t = inlineATex(et, ctx); return /\]/.test(t) ? `[{${t}}]` : `[${t}]`; };

function listaATex(items, ord, ctx, desc = false, envPropio = '', opt = '') {
  const env = envPropio === 'list' ? 'list' : desc ? 'description' : ord ? 'enumerate' : 'itemize';
  let o = '';
  const stack = [];
  const abrir = () => { o += `${'  '.repeat(stack.length)}\\begin{${env}}${opt}\n`; stack.push(env); };
  const cerrar = () => { stack.pop(); o += `${'  '.repeat(stack.length)}\\end{${env}}\n`; };
  for (const it of items) {
    const n = Math.min(it.n || 0, stack.length); // no se salta de nivel
    while (stack.length < n + 1) abrir();
    while (stack.length > n + 1) cerrar();
    const et = Array.isArray(it.et) ? etiquetaItem(it.et, ctx) : '';
    o += `${'  '.repeat(stack.length)}\\item${et} ${inlineATex(recortarBr(it.c), ctx)}\n`.replace(/ \n$/, '\n');
  }
  while (stack.length) cerrar();
  return o.trimEnd();
}

/** Contenido inline de una celda normal o fusionada. */
const contenidoCelda = (c) => Array.isArray(c) ? c : (c && Array.isArray(c.c) ? c.c : []);
const cubierta = (c) => !!(c && !Array.isArray(c) && c.cover);

/** Celda con saltos de línea y, si corresponde, envoltorios multirow/multicolumn. */
function celdaATex(c, al, ctx, negrita = false) {
  const meta = Array.isArray(c) ? {} : (c || {});
  const n = recortarBr(contenidoCelda(c));
  let s = inlineATex(n, ctx);
  if (n.some((x) => x.br)) s = `{\\begin{tabular}[t]{@{}${al}@{}}${s}\\end{tabular}}`;
  if (negrita && s) s = `\\textbf{${s}}`;
  if (meta.rowspan > 1) {
    ctx.usos.add('multirow');
    s = `\\multirow{${meta.rowspan}}{${meta.anchoFila || '*'}}{${s}}`;
  }
  if (meta.colspan > 1) s = `\\multicolumn{${meta.colspan}}{${meta.spec || meta.al || al}}{${s}}`;
  return s;
}

function tablaATex(b, ctx) {
  const cols = b.al.length;
  const barra = b.borde === 'completo' ? '|' : '';
  const specSimple = barra + b.al.join(barra) + barra;
  const spec = b.spec || specSimple;
  const env = ['tabularx', 'tabulary'].includes(b.env) && b.spec ? b.env : 'tabular';
  if (env === 'tabularx') ctx.usos.add('tabularx');
  if (env === 'tabulary') ctx.usos.add('tabulary');
  if (/[pmb]\{|[><@!]\{/.test(spec)) ctx.usos.add('array');
  const hor = b.borde === 'horizontal';
  if (hor) ctx.usos.add('booktabs');
  const lin = (tipo) => (b.borde === 'completo' ? '\\hline\n' : hor ? { top: '\\toprule\n', mid: '\\midrule\n', bot: '\\bottomrule\n' }[tipo] : '');
  const apertura = env === 'tabular' ? `\\begin{tabular}{${spec}}` : `\\begin{${env}}{${b.anchoTab || '\\linewidth'}}{${spec}}`;
  let t = apertura + '\n' + lin('top');
  b.filas.forEach((f, i) => {
    const cel = [];
    for (let j = 0; j < cols; j++) {
      const c = f[j];
      if (cubierta(c)) {
        // Un colspan ya consume sus columnas en esta misma fila. Un rowspan que viene de una fila
        // anterior necesita, en cambio, un campo vacío para conservar la posición de los &.
        if (c.cover[0] < i) cel.push('');
        continue;
      }
      const al = !Array.isArray(c) && c && c.al || b.al[j] || 'l';
      cel.push(celdaATex(c, al, ctx, b.enc && i === 0));
    }
    const esp = b.esp && b.esp[i] ? `[${b.esp[i]}]` : '';
    t += cel.join(' & ') + ` \\\\${esp}\n`;
    const sigueRowspan = i + 1 < b.filas.length && b.filas[i + 1].some((c) => cubierta(c) && c.cover[0] <= i);
    if (!sigueRowspan) {
      if (i === 0 && b.enc && b.filas.length > 1) t += lin('mid');
      else if (b.borde === 'completo') t += '\\hline\n';
    }
  });
  if (hor) t += lin('bot');
  t += `\\end{${env}}`;
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

function tikzATex(b, ctx, lab) {
  ctx.usos.add('tikz');
  for (const l of b.libs || []) ctx.libs.add(l);
  for (const l of libreriasNecesarias(b.src)) ctx.libs.add(l);
  let dibujo = `\\begin{tikzpicture}${b.opc ? `[${b.opc}]` : ''}\n${b.src.replace(/^\n+|\s+$/g, '')}\n\\end{tikzpicture}`;
  if (b.ancho) dibujo = `\\resizebox{${anchoLatex(b.ancho)}\\linewidth}{!}{%\n${dibujo}%\n}`;
  const pie = b.pie && b.pie.length ? `\\caption{${inlineATex(recortarBr(b.pie), ctx)}}\n` : '';
  if (b.env === 'figure' || pie) return `\\begin{figure}[htbp]\n\\centering\n${dibujo}\n${pie}${b.label && pie ? lab(b.label) + '\n' : ''}\\end{figure}`;
  if (b.env === 'center') return `\\begin{center}\n${dibujo}\n\\end{center}`;
  return dibujo;
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
    case 'lista': return listaATex(b.items, b.ord, ctx, b.desc, b.env, b.opt || '');
    case 'eq': {
      // displaymath y math no tienen versión con * ni número
      const env = b.env + (b.num || EQ_SIN_NUMERO.has(b.env) ? '' : '*');
      let cuerpoEq = b.tex.trim();
      detectarUsos(cuerpoEq, ctx);
      if (b.label && b.num) {
        if (!EQ_FILAS.has(b.env)) cuerpoEq += ` ${lab(b.label)}`;
        else {
          // en align/gather la etiqueta va en la primera fila numerada (si cae en una con \nonumber, \ref da «??»)
          const filas = dividirFilas(cuerpoEq);
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
      const opcImg = b.opcImg || `width=${w}\\linewidth`;
      if (b.src) {
        const arch = archivoDe(b, ctx.imagenes);
        img = `\\includegraphics[${opcImg}]{imagenes/${arch}}`;
      } else if (b.ruta) {
        // figura importada de un .tex: se mantiene la referencia original al archivo
        img = `\\includegraphics[${opcImg}]{${b.ruta}}`;
      } else {
        // sin imagen todavía: un recuadro del mismo tamaño para que el documento compile igual
        img = `\\fbox{\\parbox[c][0.3\\linewidth][c]{${w}\\linewidth}{\\centering Imagen pendiente}}`;
      }
      // centrada sin pie: \begin{center} (no flota). Con pie hace falta un figure: \caption fuera de un flotante no compila.
      if (b.env === 'center' && !pie) return `\\begin{center}\n${img}\n\\end{center}`;
      return `\\begin{figure}[htbp]\n\\centering\n${img}\n${pie}${b.label && pie ? lab(b.label) + '\n' : ''}\\end{figure}`;
    }
    case 'tikz': return tikzATex(b, ctx, lab);
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
  const ctx = { cfg, usos: new Set(), teoremas: new Set(), imagenes: [], libs: new Set() };
  const cuerpo = bloques.map((b) => bloqueATex(b, ctx)).filter((s) => s !== '');
  const extra = (doc.extra || '').trim();
  detectarUsos(extra, ctx);
  // Si el preámbulo propio ya carga el paquete no se repite (con otras opciones daría «Option clash»).
  // listings y setspace se cargan igual cuando hace falta configurarlos antes del preámbulo propio.
  const cargaExtra = (p) => new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${p}\\b`).test(extra);
  for (const p of ['booktabs', 'ulem', 'hyperref', 'microtype', ...PAQUETES_AUTO, ...PAQUETES_TARDIOS]) if (cargaExtra(p)) ctx.usos.delete(p);
  // \bm definido por el usuario (\newcommand{\bm}…) choca con el paquete bm
  if (/\\(?:re)?newcommand\s*\{?\s*\\bm\b|\\def\s*\\bm\b/.test(extra)) ctx.usos.delete('bm');
  // subcaption ya carga caption; tabularx, colortbl y makecell cargan array
  if (ctx.usos.has('subcaption')) ctx.usos.delete('caption');
  // enumitem ya entiende los atajos de enumerate
  if (ctx.usos.has('enumitem')) ctx.usos.delete('enumerate');
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
  if (ctx.usos.has('tikz') || ctx.libs.size) {
    pre.push('\\usepackage{tikz}');
    if (ctx.libs.size) pre.push(`\\usetikzlibrary{${[...ctx.libs].join(',')}}`);
  }
  if (ctx.usos.has('booktabs')) pre.push('\\usepackage{booktabs}');
  if (ctx.usos.has('ulem')) pre.push('\\usepackage[normalem]{ulem}');
  if (cfg.interlineado !== 1 || ctx.usos.has('setspace')) pre.push('\\usepackage{setspace}');
  if (cfg.interlineado !== 1) pre.push(`\\setstretch{${cfg.interlineado}}`);
  // xcolor también hace falta con listings (colores del código); si el preámbulo propio ya lo carga no se repite
  if (ctx.usos.has('listings') && !ctx.usos.has('xcolor') && !cargaExtra('xcolor')) ctx.usos.add('xcolor');
  for (const p of PAQUETES_AUTO) if (ctx.usos.has(p)) pre.push(`\\usepackage{${p}}`);
  if (ctx.usos.has('listings')) {
    pre.push('\\usepackage{listings}',
      `\\lstset{basicstyle=\\ttfamily\\small, breaklines=true, frame=single, numberstyle=\\tiny, keywordstyle=\\color{blue}, commentstyle=\\color{gray}, stringstyle=\\color{teal}, ${LST_ES}}`);
  }
  // diagramas conmutativos: tikz-cd necesita tikz y su librería cd
  if (ctx.usos.has('tikz-cd') && !pre.some((l) => l.includes('{tikz}'))) pre.push('\\usepackage{tikz}');
  if (ctx.usos.has('tikz-cd')) pre.push('\\usepackage{tikz-cd}');
  if (!cargaExtra('hyperref')) pre.push('\\usepackage[hidelinks]{hyperref}');
  const meta = [cfg.titulo ? `pdftitle={${textoPdf(cfg.titulo)}}` : '', cfg.autor ? `pdfauthor={${textoPdf(cfg.autor)}}` : ''].filter(Boolean);
  if (meta.length && !cargaExtra('hyperref')) pre.push(`\\hypersetup{${meta.join(', ')}}`);
  // paquetes que deben ir después de hyperref (cleveref) o configuran página/flotantes
  for (const p of PAQUETES_TARDIOS) if (ctx.usos.has(p)) pre.push(`\\usepackage{${p}}`);
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

/**
 * Para «doble clic → código»: dado el .tex ya generado, devuelve el índice de carácter donde empieza
 * el fragmento de cada bloque del cuerpo. Reaprovecha bloqueATex (misma salida que generarTex) y busca
 * cada fragmento consecutivamente a partir de \begin{document}, así el colapso de líneas en blanco del
 * final no afecta. Devuelve Map(id → offset); los bloques sin fragmento propio se omiten.
 */
export function mapearBloques(doc, bloques, tex) {
  const mapa = new Map();
  const ctx = { cfg: doc.cfg, usos: new Set(), teoremas: new Set(), imagenes: [], libs: new Set() };
  let desde = tex.indexOf('\\begin{document}');
  desde = desde < 0 ? 0 : desde + '\\begin{document}'.length;
  for (const b of bloques) {
    const frag = bloqueATex(b, ctx);
    if (frag === '') continue;
    // La primera línea NO vacía del fragmento sirve de ancla: es estable frente a reajustes de
    // espacios y evita que un fragmento que empieza con un salto de línea ancle en la cadena vacía
    // (indexOf('') devolvería `desde` y mapearía al bloque anterior).
    const ancla = frag.split('\n').find((l) => l.trim() !== '');
    if (!ancla) continue;
    const pos = tex.indexOf(ancla, desde);
    if (pos < 0) continue;
    mapa.set(b.id, pos);
    desde = pos + ancla.length;
  }
  return mapa;
}
