// Compila con pdfLaTeX todo lo que puede generar la página: las plantillas y un documento con todos los
// tipos de bloque en las tres clases y los seis idiomas. Uso:  node tests/compilar.mjs
// Necesita pdflatex instalado (TeX Live o MiKTeX). Si falta algún idioma de babel o ulem, se avisa y se
// sustituye para poder probar el resto.

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generarTex } from '../latex-gen.js';
import { parsearTex } from '../latex-parse.js';
import { cfgPorDefecto, bloqueNuevo, TEOREMAS } from '../modelo.js';
import { PLANTILLAS, crearDesdePlantilla } from '../plantillas.js';

const hay = (arch) => { try { return !!execFileSync('kpsewhich', [arch]).toString().trim(); } catch { return false; } };
if (spawnSync('pdflatex', ['--version']).status !== 0) { console.log('pdflatex no está instalado: no se compila nada.'); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'latex-visual-'));
const faltan = ['spanish.ldf', 'ngerman.ldf', 'french.ldf', 'italian.ldf', 'portuguese.ldf', 'ulem.sty'].filter((a) => !hay(a));
if (faltan.length) console.log(`Aviso: faltan ${faltan.join(', ')} en esta instalación; se sustituyen para probar el resto.`);
if (faltan.includes('ulem.sty')) writeFileSync(join(dir, 'ulem.sty'), '\\ProvidesPackage{ulem}\\DeclareOption*{}\\ProcessOptions\\newcommand\\sout[1]{#1}\n');
const adaptar = (t) => t.replace(/\\usepackage\[([^\]]*)\]\{babel\}/, (m, o) => {
  const ldf = { 'spanish,es-tabla': 'spanish', ngerman: 'ngerman' }[o] || o;
  return faltan.includes(`${ldf}.ldf`) ? '\\usepackage[english]{babel}' : m;
});

const casos = {};
for (const p of PLANTILLAS) { const d = crearDesdePlantilla(p.id, 'X'); casos[`plantilla-${p.id}`] = generarTex(d, d.bloques).tex; }

// LaTeX avanzado: tabla con [H], booktabs, \multirow y macros propias (necesita float, booktabs y multirow)
{
  const raw = String.raw`\begin{table}[H]
\centering
\caption{Ensayo (ec.~\ref{eq:a}).}
\label{tab:avanzada}
\footnotesize
\setlength{\tabcolsep}{5pt}
\renewcommand{\arraystretch}{1.2}
\begin{tabular}{@{}lccc@{}}
\toprule
\multirow{2}{*}{Ciclo} & \multicolumn{2}{c}{Valores} & $E_c$ \\
\cmidrule(lr){2-3}
 & $\varepsilon$ & $\sigma$ & (GPa) \\
\midrule
1 & $50.2\times10^{-6}$ & 2.336 & 43.10 \\
\bottomrule
\end{tabular}
\notatabla{Esfuerzo cercano a $0.40\,\fc$.}
\end{table}`;
  const extra = String.raw`\newcommand{\fc}{f'_c}
\newcommand{\notatabla}[1]{\par\footnotesize\textit{Nota:} #1}`;
  const d = { cfg: { ...cfgPorDefecto(), idioma: 'spanish' }, biblio: [], extra };
  casos['avanzado-tabla-H'] = generarTex(d, [{ ...bloqueNuevo('eq'), tex: 'x = 1', num: true, label: 'eq:a' }, { t: 'raw', tex: raw }]).tex;
}

const todos = ['p', 'h', 'lista', 'eq', 'tabla', 'cod', 'cita', 'resumen', 'toc', 'raw', 'salto'].map((t) => bloqueNuevo(t));
todos[0].c = [{ br: 1 }, { s: 'Símbolos: α ≤ β · 30° √2 − 1 ∞ « » … § © ¿¡ <a> "b" ' }, { s: 'tachado', st: 1 }, { s: ' x', sub: 1 }, { nota: [{ s: 'nota' }] },
  { s: ' ' }, { url: 'https://x.org/a_b%20c#d', c: [] }, { s: ' ' }, { mate: '\\frac{a}{b}' }, { br: 1 }];
todos.push({ t: 'tabla', filas: [[[{ s: 'a' }, { br: 1 }, { s: 'b' }], [{ s: 'c' }]], [[{ s: 'd' }], []]], enc: true, al: ['l', 'c'], borde: 'horizontal', pie: [{ s: 'Tabla' }], label: 'tab:a' });
todos.push({ ...bloqueNuevo('fig'), pie: [{ s: 'Sin imagen todavía' }], label: 'fig:a' });
todos.push({ t: 'eq', env: 'align', tex: 'a &= b \\\\ c &= d \\nonumber', num: true, label: 'eq:a' });
todos.push({ t: 'p', c: [{ s: 'Ver ' }, { ref: 'tab:a' }, { s: ', ' }, { ref: 'fig:a' }, { s: ', ' }, { ref: 'eq:a' }, { s: ' y ' }, { cita: 'k' }], al: 'j' });
todos.push({ t: 'cod', lang: 'TeX', src: '\\begin{lstlisting}\n\\end{lstlisting}\nñandú', num: true });
for (const tipo of Object.keys(TEOREMAS)) todos.push(bloqueNuevo('teo', { tipo, titulo: 'T', c: [{ s: 'x' }, { br: 1 }] }));
for (const clase of ['article', 'report', 'book']) {
  for (const idioma of ['spanish', 'english', 'german', 'portuguese', 'french', 'italian']) {
    const cfg = { ...cfgPorDefecto(), clase, idioma, titulo: 'Ondas α & β_1', autor: 'José', interlineado: 1.5, columnas: clase === 'book' ? 2 : 1, numPag: clase !== 'report' };
    const d = { cfg, biblio: [{ key: 'k', texto: 'Autor & co_1. Título, 2024.' }], extra: '\\usepackage{booktabs}' };
    const t = generarTex(d, [{ ...bloqueNuevo('h', { n: 0, c: [{ s: 'Capítulo' }] }) }, ...todos]).tex;
    casos[`todo-${clase}-${idioma}`] = t;
    const m = parsearTex(t);
    if (generarTex(m, m.bloques).tex !== t) console.log(`✗ todo-${clase}-${idioma}: la ida y vuelta cambia el .tex`);
  }
}

let fallos = 0;
for (const [nombre, t] of Object.entries(casos)) {
  writeFileSync(join(dir, `${nombre}.tex`), adaptar(t));
  let ok = true;
  for (let pasada = 0; pasada < 2 && ok; pasada++) {
    ok = spawnSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', `${nombre}.tex`], { cwd: dir, timeout: 60000 }).status === 0;
  }
  const log = existsSync(join(dir, `${nombre}.log`)) ? readFileSync(join(dir, `${nombre}.log`), 'latin1') : '';
  const err = (log.match(/^! .*$/m) || [''])[0];
  const avisos = (log.match(/LaTeX Warning: (Reference|Citation)[^\n]*undefined/g) || []).length;
  if (!ok || avisos) fallos++;
  console.log(`${ok && !avisos ? '✓' : '✗'} ${nombre}${err ? '  ' + err : ''}${avisos ? `  (${avisos} referencias sin resolver)` : ''}`);
}
console.log(fallos ? `\n${fallos} documento(s) con problemas. Archivos en ${dir}` : '\nTodo compila.');
process.exit(fallos ? 1 : 0);
