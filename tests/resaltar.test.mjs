import test from 'node:test';
import assert from 'node:assert/strict';
import { resaltarTex } from '../resaltar.js';

const plano = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('resaltar: nunca cambia el texto (solo envuelve en spans)', () => {
  const muestras = [
    '\\documentclass[12pt]{article}\n\\begin{document}\n\\section{Hola} % nota <b>\nTexto con $x^2 & y$ y \\textbf{negrita}.\n\\[ a < b \\]\n\\end{document}\n',
    '\\begin{verbatim}\n\\no $comando$ % aquí\n\\end{verbatim}\n\\verb|a\\b|',
    '\\label{eq:a} \\ref{eq:a} \\cite[p.~3]{k} \\\\ \\% \\$ { } & ', '', '\\', '$$', '\\begin{align', 'a\tb  c\n\n\n',
  ];
  for (const m of muestras) assert.equal(plano(resaltarTex(m)), m);
});

test('resaltar: clases principales', () => {
  const h = resaltarTex('\\section{A} % c\n$x \\alpha$ \\begin{align} a &= b \\\\ \\end{align} \\ref{k}');
  assert.match(h, /<span class="tk-sec">\\section<\/span>/);
  assert.match(h, /<span class="tk-c">% c<\/span>/);
  assert.match(h, /<span class="tk-mdel">\$<\/span>/);
  assert.match(h, /<span class="tk-mcmd">\\alpha<\/span>/);
  assert.match(h, /<span class="tk-env">align<\/span>/);
  assert.match(h, /<span class="tk-amp">&amp;<\/span>/);
  assert.match(h, /<span class="tk-ref">k<\/span>/);
});

test('resaltar: el texto de un comentario o verbatim no se interpreta', () => {
  assert.ok(!/tk-mdel/.test(resaltarTex('% $x$')));
  assert.ok(!/tk-mdel/.test(resaltarTex('\\begin{verbatim}$x$\\end{verbatim}')));
});
