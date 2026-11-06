// Pruebas de la vista previa y del soporte de «LaTeX avanzado». Se ejecutan con:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { macrosDe } from '../macros.js';
import { analizarRaw, columnas, filasDe } from '../raw-vista.js';
import { numerar } from '../numerar.js';
import { generarTex } from '../latex-gen.js';
import { parsearTex } from '../latex-parse.js';
import { cfgPorDefecto, bloqueNuevo } from '../modelo.js';

const TABLA = String.raw`\begin{table}[H]
\centering
\caption{Puntos utilizados en el procedimiento de la norma (ec.~\ref{eq:Enorma}).}
\label{tab:puntosnorma}
\footnotesize
\setlength{\tabcolsep}{5pt}
\renewcommand{\arraystretch}{1.2}
\begin{tabular}{@{}cccccc@{}}
\toprule
Ciclo & $\varepsilon_{c1}$ & $\sigma_{c1}$ (MPa) & $\varepsilon_{c2}$ & $\sigma_{c2}$ (MPa) & $E_c$ (GPa) \\
\midrule
1 & $50.2\times10^{-6}$ & 2.336 & $258.9\times10^{-6}$ & 11.329 & 43.10 \\
2 & $50.3\times10^{-6}$ & 2.450 & $254.9\times10^{-6}$ & 11.326 & 43.38 \\
\bottomrule
\end{tabular}
\notatabla{$\varepsilon_{c1}$ es la deformación más cercana a $50\times10^{-6}$.}
\end{table}`;

const doc = (bloques, extra = '') => ({ cfg: { ...cfgPorDefecto() }, biblio: [], extra, bloques });

test('macrosDe: \\newcommand con y sin argumentos, \\def y \\DeclareMathOperator', () => {
  const m = macrosDe(String.raw`\newcommand{\fc}{f'_c}
\newcommand{\notatabla}[1]{\par\footnotesize\textit{Nota:} #1}
\renewcommand\R{\mathbb{R}} % comentario
\def\N{\mathbb{N}}
\DeclareMathOperator{\sen}{sen}
\DeclareMathOperator*{\argmin}{arg\,min}`);
  assert.equal(m['\\fc'], "f'_c");
  assert.equal(m['\\notatabla'], '\\par\\footnotesize\\textit{Nota:} #1');
  assert.equal(m['\\R'], '\\mathbb{R}');
  assert.equal(m['\\N'], '\\mathbb{N}');
  assert.equal(m['\\sen'], '\\operatorname{sen}');
  assert.equal(m['\\argmin'], '\\operatorname*{arg\\,min}');
});

test('columnas: @{}, repeticiones, p{} y líneas verticales', () => {
  assert.deepEqual(columnas('@{}cccccc@{}').map((c) => c.al), ['c', 'c', 'c', 'c', 'c', 'c']);
  assert.deepEqual(columnas('l*{2}{r}').map((c) => c.al), ['l', 'r', 'r']);
  assert.deepEqual(columnas('|l|p{3cm}|').map((c) => [c.al, c.bl, c.br]), [['l', true, false], ['l', true, true]]);
});

test('analizarRaw: la tabla de ejemplo (booktabs, pie, nota, tamaño, separación)', () => {
  const { tablas } = analizarRaw(TABLA);
  assert.equal(tablas.length, 1);
  const t = tablas[0];
  assert.equal(t.k, 0);
  assert.equal(t.label, 'tab:puntosnorma');
  assert.match(t.caption, /^Puntos utilizados/);
  assert.equal(t.capArriba, true);
  assert.equal(t.tam, 0.8);
  assert.equal(t.tabcolsep, 5);
  assert.equal(t.stretch, 1.2);
  assert.match(t.resto, /^\\notatabla\{/);
  const { filas, ncols } = filasDe(t.cuerpo, t.spec);
  assert.equal(ncols, 6);
  assert.equal(filas.length, 3);
  assert.equal(filas[0].celdas.length, 6);
  assert.equal(filas[0].celdas[0].top, 'gruesa');   // \toprule
  assert.equal(filas[0].celdas[0].bot, null);
  assert.equal(filas[1].celdas[0].top, 'fina');     // \midrule
  assert.equal(filas[2].celdas[0].bot, 'gruesa');   // \bottomrule
  assert.equal(filas[1].celdas[1].txt, '$50.2\\times10^{-6}$');
});

test('filasDe: multicolumn, multirow y cmidrule', () => {
  const { filas } = filasDe(String.raw`\toprule
\multirow{2}{*}{A} & \multicolumn{2}{c}{B} \\
\cmidrule(lr){2-3}
 & x & y \\
\bottomrule`, 'lcc');
  assert.equal(filas.length, 2);
  assert.deepEqual([filas[0].celdas[0].rspan, filas[0].celdas[1].span, filas[0].celdas[1].al], [2, 2, 'c']);
  assert.equal(filas[1].celdas.length, 2);          // el hueco bajo \multirow no se dibuja…
  assert.equal(filas[1].celdas[0].col, 1);          // …y las demás celdas conservan su columna
  assert.equal(filas[1].celdas[0].top, 'fina');     // \cmidrule solo sobre las columnas 2–3
});

test('analizarRaw: tabular suelto, figuras y texto sin tabla', () => {
  assert.equal(analizarRaw('\\vspace{1cm}\n\\textbf{hola}').tablas.length, 0);
  const s = analizarRaw('\\begin{tabular}{ll}a & b\\end{tabular}').tablas;
  assert.equal(s.length, 1); assert.equal(s[0].k, -1);
  const dos = analizarRaw(String.raw`\begin{figure}\caption{F}\end{figure}\begin{table}\caption{T}\begin{tabular}{l}x\end{tabular}\end{table}`).tablas;
  assert.equal(dos.length, 1); assert.equal(dos[0].k, 1); // la figura ocupa el lugar 0
});

test('numerar: la tabla del bloque crudo cuenta como en LaTeX y se puede citar', () => {
  const t1 = { ...bloqueNuevo('tabla'), pie: [{ s: 'Primera' }], label: 'tab:uno', id: 'a' };
  const raw = { t: 'raw', tex: TABLA, id: 'b' };
  const t3 = { ...bloqueNuevo('tabla'), pie: [{ s: 'Tercera' }], label: 'tab:tres', id: 'c' };
  const n = numerar(cfgPorDefecto(), [t1, raw, t3], []);
  assert.equal(n.info.get('b').items[0].nombre, 'Tabla 2');
  assert.equal(n.etiquetas.get('tab:puntosnorma'), '2');
  assert.equal(n.etiquetas.get('tab:tres'), '3');     // las siguientes se desplazan igual que en el PDF
  const sinPie = numerar(cfgPorDefecto(), [{ t: 'raw', tex: '\\begin{table}\\begin{tabular}{l}x\\end{tabular}\\end{table}', id: 'z' }], []);
  assert.equal(sinPie.info.get('z').num, '');         // sin \caption no se numera
});

test('[H] carga float, \\multirow carga multirow y no se repiten si el preámbulo propio ya los carga', () => {
  const t = generarTex(doc([{ t: 'raw', tex: TABLA }]), [{ t: 'raw', tex: TABLA }]).tex;
  assert.match(t, /\\usepackage\{float\}/);
  assert.match(t, /\\usepackage\{booktabs\}/);
  const m = generarTex(doc([], ''), [{ t: 'raw', tex: '\\multirow{2}{*}{a}' }]).tex;
  assert.match(m, /\\usepackage\{multirow\}/);
  const e = generarTex(doc([], '\\usepackage{float}'), [{ t: 'raw', tex: TABLA }]).tex;
  assert.equal((e.match(/\\usepackage\{float\}/g) || []).length, 1);
});

test('ida y vuelta: el bloque crudo con [H] no cambia ni mueve paquetes al preámbulo propio', () => {
  const d = doc([{ t: 'raw', tex: TABLA }], String.raw`\newcommand{\fc}{f'_c}`);
  const t1 = generarTex(d, d.bloques).tex;
  const m = parsearTex(t1);
  assert.equal(m.extra, d.extra);
  assert.deepEqual(m.bloques.map(({ id, orden, ...r }) => r), [{ t: 'raw', tex: TABLA }]);
  assert.equal(generarTex(m, m.bloques).tex, t1);
});

// ── Paquetes que se cargan solos ────────────────────────────────────────

const tex = (bloques, extra = '') => generarTex(doc(bloques, extra), bloques).tex;
const raw = (t) => [{ t: 'raw', tex: t }];
const carga = (t, p) => new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{${p}\\}`).test(t);

test('paquetes: lo que se escribe en LaTeX avanzado carga su paquete', () => {
  assert.ok(carga(tex(raw('\\textcolor{red}{a}')), 'xcolor'));
  const c = tex(raw('\\cellcolor{gray!20} a'));
  assert.ok(carga(c, 'xcolor') && carga(c, 'colortbl'));
  assert.ok(carga(tex(raw('\\begin{tabularx}{\\linewidth}{lX}a\\end{tabularx}')), 'tabularx'));
  assert.ok(carga(tex(raw('\\begin{longtable}{l}a\\end{longtable}')), 'longtable'));
  assert.ok(carga(tex(raw('\\begin{multicols}{2}a\\end{multicols}')), 'multicol'));
  assert.ok(carga(tex(raw('\\begin{enumerate}[label=\\alph*)]\\item a\\end{enumerate}')), 'enumitem'));
  assert.ok(carga(tex(raw('\\SI{5}{\\meter}')), 'siunitx'));
  assert.ok(carga(tex(raw('\\captionof{figure}{x}')), 'caption'));
  const s = tex(raw('\\begin{subfigure}{.5\\textwidth}\\captionof{figure}{x}\\end{subfigure}'));
  assert.ok(carga(s, 'subcaption') && !carga(s, 'caption'));
});

test('paquetes: las ecuaciones y las fórmulas en línea también cuentan', () => {
  const eq = { ...bloqueNuevo('eq'), tex: 'x \\coloneqq \\bm{y} + \\cancel{z} + \\mathscr{L}' };
  const t = tex([eq]);
  for (const p of ['mathtools', 'bm', 'cancel', 'mathrsfs']) assert.ok(carga(t, p), p);
  const p = { t: 'p', c: [{ mate: '\\mathbbm{1}_A \\ce{H2O}' }] };
  const t2 = tex([p]);
  assert.ok(carga(t2, 'bbm') && carga(t2, 'mhchem'));
  assert.ok(!carga(tex([{ t: 'p', c: [{ mate: 'x^2 + \\frac{a}{b}' }] }]), 'bm'));   // lo normal no carga nada de más
});

test('paquetes: no se repiten si el preámbulo propio ya los carga, ni chocan con un \\bm propio', () => {
  const n = (t, p) => (t.match(new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${p}\\b`, 'g')) || []).length;
  assert.equal(n(tex(raw('\\textcolor{red}{a}'), '\\usepackage[dvipsnames]{xcolor}'), 'xcolor'), 1);
  assert.equal(n(tex(raw('\\begin{lstlisting}\\end{lstlisting}'), '\\usepackage[table]{xcolor}'), 'xcolor'), 1);
  assert.ok(!carga(tex(raw('$\\bm{x}$'), '\\newcommand{\\bm}[1]{\\boldsymbol{#1}}'), 'bm'));
});

test('paquetes: ida y vuelta estable y sin llevarse nada al preámbulo propio', () => {
  const eq = { ...bloqueNuevo('eq'), tex: '\\bm{x} = \\cancel{y}' };
  const d = doc([{ t: 'raw', tex: '\\textcolor{red}{a} \\multirow{2}{*}{b}' }, eq], '\\newcommand{\\R}{\\mathbb{R}}');
  const t1 = generarTex(d, d.bloques).tex;
  const m = parsearTex(t1);
  assert.equal(m.extra, d.extra);
  assert.equal(generarTex(m, m.bloques).tex, t1);
  // un xcolor con opciones del usuario se conserva
  const m2 = parsearTex(tex(raw('\\textcolor{red}{a}'), '\\usepackage[dvipsnames]{xcolor}'));
  assert.match(m2.extra, /\\usepackage\[dvipsnames\]\{xcolor\}/);
});

test('paquetes habituales: \\eqref, etiquetas de teoremas y numeración de tabularx/longtable', () => {
  const src = String.raw`\documentclass[10pt,a4paper]{article}
\usepackage{amsmath,amsthm}\usepackage{booktabs,tabularx,longtable,float}
\newtheorem{teorema}{Teorema}
\begin{document}
\begin{teorema}\label{t:1} Algo. \end{teorema}
Ver \ref{t:1}, \eqref{eq:1} y \ref{tab:x}, \ref{tab:l}.
\begin{table}[H]\caption{X}\label{tab:x}\begin{tabularx}{\textwidth}{lX}\toprule a & b \\ \bottomrule\end{tabularx}\end{table}
\begin{longtable}{ll}\caption{L}\label{tab:l}\\ a & b \\ \end{longtable}
\end{document}`;
  const m = parsearTex(src);
  const t = generarTex(m, m.bloques).tex;
  assert.match(t, /\\eqref\{eq:1\}/);                 // no se degrada a \ref ni a código crudo
  assert.equal(generarTex(parsearTex(t), parsearTex(t).bloques).tex, t);
  const bl = m.bloques.map((b, i) => ({ ...b, id: 'b' + i }));
  const n = numerar(m.cfg, bl, []);
  assert.equal(n.etiquetas.get('t:1'), '1');           // el \label dentro del teorema se resuelve
  assert.equal(n.etiquetas.get('tab:x'), '1');
  assert.equal(n.etiquetas.get('tab:l'), '2');         // longtable con \caption también cuenta
});

test('definicionesMathJax: \\newcommand con argumentos, \\def, \\definecolor y \\DeclareSIUnit del preámbulo', async () => {
  const { definicionesMathJax } = await import('../macros.js');
  const d = definicionesMathJax(String.raw`% \newcommand{\no}{x}
\definecolor{amarillopend}{RGB}{255,244,179}
\newcommand{\pendiente}[1]{\colorbox{amarillopend}{\strut #1}}
\newcommand{\f}[2][x]{#1+#2}
\DeclareSIUnit
\kgf{kgf}
\def\v#1{\vec{#1}}
\DeclareMathOperator{\sen}{sen}`);
  assert.deepEqual(d, [
    '\\definecolor{amarillopend}{RGB}{255,244,179}',
    '\\renewcommand{\\pendiente}[1]{\\colorbox{amarillopend}{#1}}',
    '\\renewcommand{\\f}[2][x]{#1+#2}',
    '\\def\\kgf{\\mathrm{kgf}}',
    '\\def\\v#1{\\vec{#1}}',
    '\\DeclareMathOperator{\\sen}{sen}',
  ]);
});
