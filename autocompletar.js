// Autocompletado de comandos y entornos LaTeX para la vista de código.
// Se muestra un menú al escribir «\» seguido de letras (o dentro de \begin{…}); al elegir, se inserta
// la plantilla con el cursor donde indica «‸». No modifica el modelo: solo escribe en el textarea.

import { h } from './ui.js?v=2026.11.07-e';

// [comando-para-mostrar, plantilla-a-insertar (con ‸ = cursor), descripción]
// La plantilla incluye la contrabarra; se reemplaza desde el «\» que escribió la persona.
const COMANDOS = [
  // Estructura
  ['\\section', '\\section{‸}', 'Sección'],
  ['\\subsection', '\\subsection{‸}', 'Subsección'],
  ['\\subsubsection', '\\subsubsection{‸}', 'Subsubsección'],
  ['\\chapter', '\\chapter{‸}', 'Capítulo (report/book)'],
  ['\\paragraph', '\\paragraph{‸}', 'Párrafo con título'],
  ['\\tableofcontents', '\\tableofcontents', 'Índice general'],
  ['\\maketitle', '\\maketitle', 'Generar el título'],
  ['\\title', '\\title{‸}', 'Título del documento'],
  ['\\author', '\\author{‸}', 'Autor'],
  ['\\date', '\\date{‸}', 'Fecha'],
  ['\\documentclass', '\\documentclass{‸}', 'Clase del documento'],
  ['\\usepackage', '\\usepackage{‸}', 'Cargar un paquete'],
  ['\\newpage', '\\newpage', 'Salto de página'],
  ['\\appendix', '\\appendix', 'Comienzo de apéndices'],
  // Formato de texto
  ['\\textbf', '\\textbf{‸}', 'Negrita'],
  ['\\textit', '\\textit{‸}', 'Cursiva'],
  ['\\emph', '\\emph{‸}', 'Énfasis'],
  ['\\underline', '\\underline{‸}', 'Subrayado'],
  ['\\texttt', '\\texttt{‸}', 'Monoespaciado'],
  ['\\textsc', '\\textsc{‸}', 'Versalitas'],
  ['\\textsuperscript', '\\textsuperscript{‸}', 'Superíndice'],
  ['\\textsubscript', '\\textsubscript{‸}', 'Subíndice'],
  ['\\textcolor', '\\textcolor{‸}{}', 'Texto en color'],
  ['\\footnote', '\\footnote{‸}', 'Nota al pie'],
  ['\\item', '\\item ‸', 'Elemento de lista'],
  // Referencias y enlaces
  ['\\label', '\\label{‸}', 'Etiqueta'],
  ['\\ref', '\\ref{‸}', 'Referencia cruzada'],
  ['\\eqref', '\\eqref{‸}', 'Referencia a ecuación'],
  ['\\cref', '\\cref{‸}', 'Referencia con nombre (cleveref)'],
  ['\\pageref', '\\pageref{‸}', 'Referencia a página'],
  ['\\cite', '\\cite{‸}', 'Cita bibliográfica'],
  ['\\url', '\\url{‸}', 'URL'],
  ['\\href', '\\href{‸}{}', 'Enlace con texto'],
  ['\\footnotemark', '\\footnotemark', 'Marca de nota al pie'],
  // Matemáticas
  ['\\frac', '\\frac{‸}{}', 'Fracción'],
  ['\\sqrt', '\\sqrt{‸}', 'Raíz cuadrada'],
  ['\\sum', '\\sum_{‸}^{}', 'Sumatoria'],
  ['\\prod', '\\prod_{‸}^{}', 'Productoria'],
  ['\\int', '\\int_{‸}^{}', 'Integral'],
  ['\\lim', '\\lim_{‸}', 'Límite'],
  ['\\partial', '\\partial ‸', 'Derivada parcial'],
  ['\\infty', '\\infty', 'Infinito'],
  ['\\cdot', '\\cdot', 'Punto de multiplicación'],
  ['\\times', '\\times', 'Signo por'],
  ['\\leq', '\\leq', 'Menor o igual'],
  ['\\geq', '\\geq', 'Mayor o igual'],
  ['\\neq', '\\neq', 'Distinto'],
  ['\\approx', '\\approx', 'Aproximadamente'],
  ['\\rightarrow', '\\rightarrow', 'Flecha derecha'],
  ['\\Rightarrow', '\\Rightarrow', 'Implica'],
  ['\\mathbb', '\\mathbb{‸}', 'Letra de pizarra (ℝ, ℕ…)'],
  ['\\mathcal', '\\mathcal{‸}', 'Caligráfica'],
  ['\\mathrm', '\\mathrm{‸}', 'Romana en modo matemático'],
  ['\\vec', '\\vec{‸}', 'Vector'],
  ['\\hat', '\\hat{‸}', 'Sombrero'],
  ['\\bar', '\\bar{‸}', 'Barra'],
  ['\\left', '\\left( ‸ \\right)', 'Delimitadores que crecen'],
  // Griegas habituales
  ['\\alpha', '\\alpha', 'α'], ['\\beta', '\\beta', 'β'], ['\\gamma', '\\gamma', 'γ'], ['\\delta', '\\delta', 'δ'],
  ['\\theta', '\\theta', 'θ'], ['\\lambda', '\\lambda', 'λ'], ['\\mu', '\\mu', 'μ'], ['\\pi', '\\pi', 'π'],
  ['\\sigma', '\\sigma', 'σ'], ['\\phi', '\\phi', 'φ'], ['\\omega', '\\omega', 'ω'], ['\\Delta', '\\Delta', 'Δ'],
  ['\\Sigma', '\\Sigma', 'Σ'], ['\\Omega', '\\Omega', 'Ω'],
  // Tablas, figuras e imágenes
  ['\\includegraphics', '\\includegraphics[width=0.8\\linewidth]{‸}', 'Insertar imagen'],
  ['\\caption', '\\caption{‸}', 'Pie de figura/tabla'],
  ['\\multicolumn', '\\multicolumn{2}{c}{‸}', 'Celda que abarca columnas'],
  ['\\multirow', '\\multirow{2}{*}{‸}', 'Celda que abarca filas'],
  ['\\hline', '\\hline', 'Línea horizontal'],
  ['\\toprule', '\\toprule', 'Regla superior (booktabs)'],
  ['\\midrule', '\\midrule', 'Regla intermedia (booktabs)'],
  ['\\bottomrule', '\\bottomrule', 'Regla inferior (booktabs)'],
  ['\\centering', '\\centering', 'Centrar'],
];

// Entornos para \begin{…}: [nombre, plantilla con ‸, descripción]
const ENTORNOS = [
  ['itemize', '\\begin{itemize}\n  \\item ‸\n\\end{itemize}', 'Lista con viñetas'],
  ['enumerate', '\\begin{enumerate}\n  \\item ‸\n\\end{enumerate}', 'Lista numerada'],
  ['description', '\\begin{description}\n  \\item[‸] \n\\end{description}', 'Lista de definiciones'],
  ['equation', '\\begin{equation}\n  ‸\n\\end{equation}', 'Ecuación numerada'],
  ['align', '\\begin{align}\n  ‸\n\\end{align}', 'Ecuaciones alineadas'],
  ['figure', '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{‸}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}', 'Figura'],
  ['table', '\\begin{table}[htbp]\n  \\centering\n  \\caption{‸}\n  \\begin{tabular}{cc}\n    \\toprule\n    a & b \\\\\n    \\midrule\n    1 & 2 \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}', 'Tabla con pie'],
  ['tabular', '\\begin{tabular}{‸}\n  \n\\end{tabular}', 'Tabla simple'],
  ['tabularx', '\\begin{tabularx}{\\linewidth}{‸}\n  \n\\end{tabularx}', 'Tabla de ancho fijo'],
  ['center', '\\begin{center}\n  ‸\n\\end{center}', 'Centrado'],
  ['quote', '\\begin{quote}\n  ‸\n\\end{quote}', 'Cita en bloque'],
  ['verbatim', '\\begin{verbatim}\n‸\n\\end{verbatim}', 'Texto literal'],
  ['lstlisting', '\\begin{lstlisting}\n‸\n\\end{lstlisting}', 'Código fuente'],
  ['matrix', '\\begin{matrix}\n  ‸\n\\end{matrix}', 'Matriz'],
  ['pmatrix', '\\begin{pmatrix}\n  ‸\n\\end{pmatrix}', 'Matriz con paréntesis'],
  ['cases', '\\begin{cases}\n  ‸\n\\end{cases}', 'Definición por casos'],
  ['theorem', '\\begin{theorem}\n  ‸\n\\end{theorem}', 'Teorema'],
  ['proof', '\\begin{proof}\n  ‸\n\\end{proof}', 'Demostración'],
];

const MAX = 9;

/**
 * Conecta el autocompletado a un <textarea>. Devuelve una función para desconectarlo.
 * `alInsertar` (opcional) se llama tras insertar, p. ej. para refrescar resaltado/gutter.
 */
export function conectarAutocompletado(ta, alInsertar = () => {}) {
  let caja = null, items = [], sel = 0, ancla = 0;

  const cerrar = () => { if (caja) { caja.remove(); caja = null; items = []; } };

  function contexto() {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return null; // con selección activa, no sugerir
    const antes = ta.value.slice(0, pos);
    // dentro de \begin{…} o \end{…}: sugerir entornos
    const mEnv = /\\(begin|end)\{([a-zA-Z*]*)$/.exec(antes);
    if (mEnv) {
      const q = mEnv[2];
      const lista = ENTORNOS.filter((e) => e[0].startsWith(q)).slice(0, MAX);
      return { tipo: 'entorno', q, desde: pos - q.length, lista };
    }
    // comando: \ seguido de letras (sin llegar a una llave/espacio)
    const mCmd = /\\([a-zA-Z]*)$/.exec(antes);
    if (mCmd) {
      const q = mCmd[1];
      if (!q) return null; // solo «\» aún: no abrir hasta que escriba una letra
      const lista = COMANDOS.filter((c) => c[0].slice(1).toLowerCase().startsWith(q.toLowerCase())).slice(0, MAX);
      return { tipo: 'comando', q, desde: pos - q.length - 1, lista }; // -1 para incluir la «\»
    }
    return null;
  }

  function pintar(ctx) {
    cerrar();
    if (!ctx || !ctx.lista.length) return;
    items = ctx.lista; sel = 0; ancla = ctx.desde;
    caja = h('div', { class: 'autocompletar', role: 'listbox' },
      items.map((it, i) => h('div', {
        class: 'autocompletar-item' + (i === sel ? ' sel' : ''), role: 'option', 'data-i': i,
        onmousedown: (e) => { e.preventDefault(); elegir(i, ctx); },
      }, h('span', { class: 'ac-cmd' }, ctx.tipo === 'entorno' ? it[0] : it[0]), h('span', { class: 'ac-desc' }, it[2]))));
    document.body.append(caja);
    situar();
  }

  // Posiciona la caja bajo el cursor usando un espejo del textarea para medir dónde está el caret.
  function situar() {
    if (!caja) return;
    const r = ta.getBoundingClientRect();
    const { top, left } = posicionCaret(ta, ancla);
    let x = r.left + left - ta.scrollLeft;
    let y = r.top + top - ta.scrollTop + 20;
    x = Math.min(x, innerWidth - caja.offsetWidth - 8);
    if (y + caja.offsetHeight > innerHeight - 8) y = r.top + top - ta.scrollTop - caja.offsetHeight - 4;
    caja.style.left = Math.max(8, x) + 'px';
    caja.style.top = Math.max(8, y) + 'px';
  }

  function elegir(i, ctx) {
    const it = ctx.lista[i];
    if (!it) return;
    let plantilla = ctx.tipo === 'entorno'
      ? it[1] // ya trae \begin{…}…\end{…}
      : it[1];
    // posición del cursor dentro de la plantilla (‸) y texto final
    const cursorRel = plantilla.indexOf('‸');
    const texto = plantilla.replace('‸', '');
    const fin = ta.selectionStart;
    ta.setRangeText(texto, ancla, fin, 'end');
    const nuevaPos = ancla + (cursorRel >= 0 ? cursorRel : texto.length);
    ta.setSelectionRange(nuevaPos, nuevaPos);
    cerrar();
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    alInsertar();
  }

  function mover(delta) {
    if (!caja) return;
    sel = (sel + delta + items.length) % items.length;
    [...caja.children].forEach((el, i) => el.classList.toggle('sel', i === sel));
    const elSel = caja.children[sel];
    if (elSel) elSel.scrollIntoView({ block: 'nearest' });
  }

  const onInput = () => { pintar(contexto()); };
  const onKeydown = (e) => {
    if (!caja) {
      // Ctrl+Espacio fuerza la apertura aunque no haya «\» reciente
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') { const c = contexto(); if (c) { e.preventDefault(); pintar(c); } }
      return;
    }
    // con el menú abierto, estas teclas lo controlan: se frena también la propagación para que el
    // propio textarea (p. ej. el Tab que inserta espacios) no las reciba.
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); mover(-1); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); elegir(sel, contexto() || { lista: items, tipo: 'comando', desde: ancla }); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); }
  };

  ta.addEventListener('input', onInput);
  ta.addEventListener('keydown', onKeydown, true);
  ta.addEventListener('scroll', () => caja && situar());
  ta.addEventListener('blur', () => setTimeout(cerrar, 120));
  return () => { cerrar(); ta.removeEventListener('input', onInput); ta.removeEventListener('keydown', onKeydown, true); };
}

// Mide la posición (en px, relativa al textarea) del carácter `indice` usando un div espejo.
function posicionCaret(ta, indice) {
  const esp = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'whiteSpace', 'padding', 'border', 'boxSizing', 'tabSize', 'wordWrap']) esp.style[p] = cs[p];
  esp.style.position = 'absolute'; esp.style.visibility = 'hidden'; esp.style.whiteSpace = 'pre-wrap'; esp.style.wordWrap = 'break-word';
  esp.style.width = ta.clientWidth + 'px';
  const antes = ta.value.slice(0, indice);
  esp.textContent = antes;
  const marca = document.createElement('span');
  marca.textContent = '\u200b';
  esp.append(marca);
  document.body.append(esp);
  const top = marca.offsetTop, left = marca.offsetLeft;
  esp.remove();
  return { top, left };
}
