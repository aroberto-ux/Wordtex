// Parte 1: lo que antes caía en «LaTeX avanzado» ahora es nativo o tiene vista previa, sin perder nada.
// node --test tests/*.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearTex } from '../latex-parse.js';
import { generarTex } from '../latex-gen.js';
import { sanearBloque, dividirFilas, cfgPorDefecto } from '../modelo.js';
import { texParaKatex, tipoVistaRaw, resumenImportacion } from '../vista-latex.js';
import { numerar } from '../numerar.js';
import { analizarMuestra, RUTA_MUESTRA } from './muestra.mjs';

const sinId = (bs) => bs.map(({ id, orden, ...r }) => r);
const doc = (cuerpo, pre = '') => `\\documentclass{article}\n${pre}\\begin{document}\n${cuerpo}\n\\end{document}`;
const idaYVuelta = (src) => { const m = parsearTex(src); const t1 = generarTex(m, m.bloques).tex; const m2 = parsearTex(t1); return { m, m2, t1, t2: generarTex(m2, m2.bloques).tex }; };

test('muestra: ida y vuelta estable y solo quedan como avanzados los casos exóticos, todos con vista previa', () => {
  const r = analizarMuestra();
  assert.ok(r.estable);
  assert.equal(r.sinVista.length, 0, r.sinVista.join(' | '));
  assert.deepEqual(r.raw.map((x) => x.vista).sort(), ['archivo', 'archivo', 'archivo', 'entorno', 'entorno', 'espacio', 'mate', 'regla', 'tabla', 'tabla', 'tabla', 'tabla']);
  assert.deepEqual(r.m.bloques.filter((b) => b.t === 'eq').map((b) => b.env), ['align', 'gather', 'equation', 'multline', 'flalign', 'eqnarray', 'displaymath', 'math']);
  assert.deepEqual(r.m.bloques.filter((b) => b.t === 'tikz').map((b) => [b.env, b.ancho, b.label]), [['', 0, ''], ['figure', 0, 'fig:foreach'], ['figure', 0, 'fig:flujo'], ['center', 50, '']]);
});

test('muestra: el .tex regenerado conserva cada pieza del original', () => {
  const src = readFileSync(RUTA_MUESTRA, 'utf8');
  const { t1 } = analizarMuestra(src);
  for (const l of src.matchAll(/\\label\{[^}]*\}/g)) assert.ok(t1.includes(l[0]), l[0]);
  for (const trozo of ['\\multirow{2}{*}{Grupo}', '\\multicolumn{2}{c|}{Medición}', '\\input{capitulo1}', '\\textcolor{red}{rojo}', '\\textsc{Versalitas}', '\\verb|x_1 = 2|',
    '\\lstinline|print(x)|', '{\\small texto pequeño}', '{\\Large \\bfseries grande y en negrita}', '\\tikz \\draw[fill=blue] (0,0) circle (2pt);', '\\begin{caja}',
    '\\newcommand{\\R}{\\mathbb{R}}', '\\usetikzlibrary{arrows.meta,positioning}', '\\resizebox{0.5\\linewidth}{!}', '\\includegraphics[width=0.3\\linewidth]{figura.png}',
    '\\item[a)]', '\\item[] Sin viñeta.', '\\begin{description}', '\\item[Teorema]', '\\begin{alignat}{2}', '\\begin{eqnarray}', '\\begin{displaymath}', '\\begin{math}',
    '\\begin{tikzpicture}[node distance=1.5cm]', '\\hrule', '\\vspace{1cm}', '\\bibliography{referencias}', '\\begin{table*}[t]', '\\begin{longtable}{ll}']) {
    assert.ok(t1.includes(trozo), trozo);
  }
});

test('ecuaciones con entornos anidados y entornos nuevos son bloques nativos', () => {
  const { m, t1, t2 } = idaYVuelta(doc('\\begin{align*}\nf &= \\begin{cases} 1 & x>0 \\\\ 0 & x \\le 0 \\end{cases}\n\\end{align*}\n\n\\begin{multline*}\na \\\\ b\n\\end{multline*}'));
  assert.deepEqual(m.bloques.map((b) => [b.t, b.env, b.num]), [['eq', 'align', false], ['eq', 'multline', false]]);
  assert.equal(t1, t2);
  // un entorno no matemático dentro de una ecuación no se acepta
  assert.equal(parsearTex(doc('\\begin{equation}\n\\begin{tikzpicture}\\end{tikzpicture}\n\\end{equation}')).bloques[0].t, 'raw');
});

test('etiquetas de ecuaciones: solo se separan si al regenerar quedan en el mismo sitio', () => {
  const dos = parsearTex(doc('\\begin{align}\na \\label{x} \\\\\nb \\label{y}\n\\end{align}')).bloques[0];
  assert.equal(dos.label, ''); assert.match(dos.tex, /\\label\{x\}[\s\S]*\\label\{y\}/);
  const segunda = parsearTex(doc('\\begin{align}\na \\\\\nb \\label{y}\n\\end{align}')).bloques[0];
  assert.equal(segunda.label, ''); assert.match(segunda.tex, /\\label\{y\}/);
  const primera = parsearTex(doc('\\begin{align}\na \\label{x} \\\\\nb\n\\end{align}')).bloques[0];
  assert.equal(primera.label, 'x'); assert.doesNotMatch(primera.tex, /label/);
  // las etiquetas escritas dentro del código también se numeran, fila a fila (sin contar \nonumber)
  const n = numerar(cfgPorDefecto(), [{ id: 'e', t: 'eq', env: 'align', num: true, tex: 'a \\label{x} \\\\ c \\nonumber \\\\ \\begin{cases} 1 \\\\ 2 \\end{cases} \\label{y}' }]);
  assert.equal(n.etiquetas.get('x'), '1'); assert.equal(n.etiquetas.get('y'), '2'); assert.equal(n.info.get('e').num, '1–2');
});

test('dividirFilas no corta dentro de cases, matrices ni llaves', () => {
  assert.deepEqual(dividirFilas('a \\\\ \\begin{pmatrix} 1 \\\\ 2 \\end{pmatrix} {x \\\\ y} \\\\ c'), ['a \\\\', ' \\begin{pmatrix} 1 \\\\ 2 \\end{pmatrix} {x \\\\ y} \\\\', ' c']);
});

test('listas: description y \\item[…] sin pérdida; lo irrepresentable queda como avanzado', () => {
  const { m, t1, t2 } = idaYVuelta(doc('\\begin{description}\n\\item[A] uno\n\\item[{B]}] dos\n\\end{description}\n\n\\begin{enumerate}\n\\item[i)] x\n\\item y\n\\end{enumerate}'));
  assert.equal(t1, t2);
  assert.deepEqual(sinId(m.bloques)[0], { t: 'lista', ord: false, desc: true, items: [{ c: [{ s: 'uno' }], n: 0, et: [{ s: 'A' }] }, { c: [{ s: 'dos' }], n: 0, et: [{ s: 'B]' }] }] });
  assert.match(t1, /\\item\[\{B\]\}\] dos/);
  assert.deepEqual(m.bloques[1].items.map((i) => i.et), [[{ s: 'i)' }], undefined]);
  // otra clase de lista anidada, o texto antes del primer \item: se conserva tal cual
  assert.equal(parsearTex(doc('\\begin{itemize}\n\\item a\n\\begin{enumerate}\\item b\\end{enumerate}\n\\end{itemize}')).bloques[0].t, 'raw');
  assert.equal(parsearTex(doc('\\begin{itemize}\n\\setlength{\\itemsep}{0pt}\n\\item a\n\\end{itemize}')).bloques[0].t, 'raw');
});

test('figura centrada y opciones/ruta de \\includegraphics se conservan', () => {
  const src = doc('\\begin{center}\n\\includegraphics[height=3cm]{figs/foto.jpg}\n\\end{center}\n\n\\begin{figure}[htbp]\n\\centering\n\\includegraphics[scale=0.5]{img/a.png}\n\\caption{A}\n\\label{fig:a}\n\\end{figure}');
  const { m, t1, t2 } = idaYVuelta(src);
  assert.deepEqual(m.bloques.map((b) => [b.t, b.env, b.ruta, b.opcImg]), [['fig', 'center', 'figs/foto.jpg', 'height=3cm'], ['fig', 'figure', 'img/a.png', 'scale=0.5']]);
  assert.match(t1, /\\begin\{center\}\n\\includegraphics\[height=3cm\]\{figs\/foto\.jpg\}\n\\end\{center\}/);
  assert.match(t1, /\\includegraphics\[scale=0\.5\]\{img\/a\.png\}/);
  assert.equal(t1, t2);
});

test('documentos guardados con la versión anterior siguen abriéndose', () => {
  assert.deepEqual(sanearBloque({ t: 'fig', src: '', nombre: 'a.png', ancho: 70, pie: [], label: '' }), { t: 'fig', src: '', nombre: 'a.png', ancho: 70, pie: [], label: '', env: 'figure' });
  assert.deepEqual(sanearBloque({ t: 'lista', ord: true, items: [{ c: [{ s: 'x' }], n: 0 }] }), { t: 'lista', ord: true, items: [{ c: [{ s: 'x' }], n: 0 }] });
  assert.deepEqual(sanearBloque({ t: 'eq', env: 'gather', tex: 'a', num: true, label: '' }), { t: 'eq', env: 'gather', tex: 'a', num: true, label: '' });
  assert.equal(sanearBloque({ t: 'eq', env: 'displaymath', tex: 'a', num: true }).num, false);
  assert.equal(sanearBloque({ t: 'eq', env: 'raro', tex: 'a' }).env, 'equation');
});

test('vistas previas: KaTeX y clasificación de bloques avanzados', () => {
  assert.equal(texParaKatex('eqnarray', 'a &=& b \\label{x} \\nonumber'), '\\begin{aligned}a &=& b  \\end{aligned}');
  assert.equal(texParaKatex('multline', 'a \\\\ b'), '\\begin{gathered}a \\\\ b\\end{gathered}');
  assert.equal(texParaKatex('alignat', 'x &= 1', '2'), '\\begin{alignedat}{2}x &= 1\\end{alignedat}');
  const casos = {
    '\\begin{minipage}{0.4\\linewidth}x\\end{minipage}': 'entorno', '\\begin{tabularx}{\\linewidth}{lX}a&b\\end{tabularx}': 'tabla', '\\hrule': 'regla',
    '\\vspace{2cm}': 'espacio', '\\input{cap}': 'archivo', '\\bibliography{refs}': 'archivo', '% nota': 'comentario', '\\begin{verbatim}x\\end{verbatim}': null,
    '\\newcommand{\\x}{1}\n\\setlength{\\parskip}{1em}': 'ajuste', '\\begin{alignat}{2}x\\end{alignat}': 'mate', '\\foo{bar}': null,
  };
  for (const [tex, tipo] of Object.entries(casos)) assert.equal(tipoVistaRaw(tex), tipo, tex);
});

test('numeración: figuras y tablas dentro de LaTeX avanzado cuentan como en el PDF', () => {
  const m = parsearTex(readFileSync(RUTA_MUESTRA, 'utf8'));
  const n = numerar(m.cfg, m.bloques);
  assert.deepEqual(['fig:mini', 'fig:foreach', 'fig:flujo', 'tab:grupos', 'eq:f', 'eq:sistema', 'eq:arr1', 'eq:arr2'].map((l) => n.etiquetas.get(l)), ['1', '2', '3', '1', '1', '4', '7', '8']);
});

test('aviso al importar', () => {
  assert.equal(resumenImportacion([{ t: 'p', c: [] }]), 'Documento importado: 1 bloque(s). Todo se puede editar visualmente.');
  assert.match(resumenImportacion([{ t: 'raw', tex: '\\hrule' }, { t: 'raw', tex: '\\foo' }, { t: 'raw', tex: '% c' }]), /2 quedaron como LaTeX avanzado.*1 con vista previa y 1 solo como código.*1 comentario/);
});
