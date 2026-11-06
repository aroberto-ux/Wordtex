// Compila con pdfLaTeX todo lo que puede generar la página: las plantillas y un documento con todos los
// tipos de bloque en las tres clases y los seis idiomas. Uso:  node tests/compilar.mjs
// Necesita pdflatex instalado (TeX Live o MiKTeX). Si falta algún idioma de babel o ulem, se avisa y se
// sustituye para poder probar el resto.

import { mkdtempSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generarTex } from '../latex-gen.js';
import { parsearTex } from '../latex-parse.js';
import { cfgPorDefecto, bloqueNuevo, TEOREMAS } from '../modelo.js';
import { PLANTILLAS, crearDesdePlantilla } from '../plantillas.js';
import { PLANTILLAS_TIKZ } from '../tikz-plantillas.js';

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

const todos = ['p', 'h', 'lista', 'eq', 'tabla', 'cod', 'cita', 'resumen', 'toc', 'raw', 'salto'].map((t) => bloqueNuevo(t));
todos[0].c = [{ br: 1 }, { s: 'Símbolos: α ≤ β · 30° √2 − 1 ∞ « » … § © ¿¡ <a> "b" ' }, { s: 'tachado', st: 1 }, { s: ' x', sub: 1 }, { nota: [{ s: 'nota' }] },
  { s: ' ' }, { url: 'https://x.org/a_b%20c#d', c: [] }, { s: ' ' }, { mate: '\\frac{a}{b}' }, { br: 1 }];
todos.push({ t: 'tabla', filas: [[[{ s: 'a' }, { br: 1 }, { s: 'b' }], [{ s: 'c' }]], [[{ s: 'd' }], []]], enc: true, al: ['l', 'c'], borde: 'horizontal', pie: [{ s: 'Tabla' }], label: 'tab:a' });
todos.push({ ...bloqueNuevo('fig'), pie: [{ s: 'Sin imagen todavía' }], label: 'fig:a' });
todos.push({ t: 'eq', env: 'align', tex: 'a &= b \\\\ c &= d \\nonumber', num: true, label: 'eq:a' });
todos.push({ t: 'p', c: [{ s: 'Ver ' }, { ref: 'tab:a' }, { s: ', ' }, { ref: 'fig:a' }, { s: ', ' }, { ref: 'eq:a' }, { s: ' y ' }, { cita: 'k' }], al: 'j' });
todos.push({ t: 'cod', lang: 'TeX', src: '\\begin{lstlisting}\n\\end{lstlisting}\nñandú', num: true });
for (const tipo of Object.keys(TEOREMAS)) todos.push(bloqueNuevo('teo', { tipo, titulo: 'T', c: [{ s: 'x' }, { br: 1 }] }));
// entornos de ecuación nuevos, listas de descripción, figura centrada y las plantillas TikZ en sus tres ubicaciones
for (const env of ['multline', 'flalign', 'eqnarray', 'displaymath', 'math']) todos.push({ t: 'eq', env, tex: env === 'eqnarray' ? 'a &=& b \\\\ c &=& d' : env === 'flalign' ? 'a &= b & c &= d' : 'a = b \\\\ + c'.replace(/\\\\/, env === 'multline' ? '\\\\' : ''), num: !['displaymath', 'math'].includes(env), label: `eq:${env}` });
todos.push({ t: 'lista', ord: false, desc: true, items: [{ c: [{ s: 'def' }], n: 0, et: [{ s: 'Término ' }, { mate: 'x' }] }, { c: [{ s: 'sin término' }], n: 0, et: [] }, { c: [{ s: 'anidado' }], n: 1, et: [{ s: 'B]' }] }] });
todos.push({ ...bloqueNuevo('fig'), env: 'center' });
PLANTILLAS_TIKZ.forEach((p, k) => todos.push({ t: 'tikz', src: p.src, opc: p.opc, libs: p.libs, pie: k % 3 === 1 ? [{ s: p.nombre }] : [], ancho: k === 2 ? 60 : 0, label: k % 3 === 1 ? `fig:t${k}` : '', env: ['center', 'figure', ''][k % 3] }));
todos.push({ t: 'p', c: [{ s: 'Ver ' }, { ref: 'eq:multline' }, { s: ', ' }, { ref: 'eq:eqnarray' }, { s: ' y ' }, { ref: 'fig:t1' }], al: 'j' });
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

// el .tex de muestra: el original y el regenerado deben compilar y decir lo mismo
const muestra = new URL('./muestra/', import.meta.url);
for (const f of ['capitulo1.tex', 'figura.png']) copyFileSync(new URL(f, muestra), join(dir, f));
const original = readFileSync(new URL('muestra.tex', muestra), 'utf8');
// con las mismas fuentes que el regenerado (lmodern, microtype): así el texto extraído es comparable
casos['muestra-original'] = original.replace('\\usepackage[T1]{fontenc}', '\\usepackage[T1]{fontenc}\n\\usepackage{lmodern}\n\\usepackage{microtype}');
{ const m = parsearTex(original); casos['muestra-regenerada'] = generarTex(m, m.bloques).tex; }

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
// el PDF regenerado tiene el mismo texto que el original: se comparan las letras y cifras con sus
// repeticiones (el orden en que pdftotext extrae fórmulas y figuras cambia con cualquier detalle)
if (spawnSync('pdftotext', ['-v']).error == null) {
  const palabras = (n) => {
    spawnSync('pdftotext', [`${n}.pdf`, `${n}.txt`], { cwd: dir });
    if (!existsSync(join(dir, `${n}.txt`))) return null;
    const m = new Map();
    // letra a letra: el espaciado (logo de LaTeX, kerning) cambia cómo se parten las palabras al extraer
    for (const w of readFileSync(join(dir, `${n}.txt`), 'utf8').match(/[\p{L}\p{N}]/gu) || []) m.set(w, (m.get(w) || 0) + 1);
    return m;
  };
  const a = palabras('muestra-original'), b = palabras('muestra-regenerada');
  if (a && b) {
    const dif = [...new Set([...a.keys(), ...b.keys()])].filter((w) => a.get(w) !== b.get(w)).map((w) => `${w}: ${a.get(w) || 0}→${b.get(w) || 0}`);
    if (dif.length) fallos++;
    console.log(`${dif.length ? '✗' : '✓'} el PDF regenerado de la muestra tiene el mismo texto que el original${dif.length ? ': ' + dif.join(', ') : ''}`);
  }
}
console.log(fallos ? `\n${fallos} documento(s) con problemas. Archivos en ${dir}` : '\nTodo compila.');
process.exit(fallos ? 1 : 0);
