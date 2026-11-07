// Funciones puras del botón «Compilar PDF»: elegir el motor de LaTeX y detectar imágenes del documento.
// Se ejecutan con:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { motorLatex, imagenesExternas } from '../exportar.js';

test('motorLatex elige el motor según el preámbulo', () => {
  assert.equal(motorLatex('\\documentclass{article}'), 'pdflatex');
  assert.equal(motorLatex('\\usepackage{amsmath}\\usepackage{tikz}'), 'pdflatex');
  // fontspec / polyglossia / \setmainfont → XeLaTeX
  assert.equal(motorLatex('\\usepackage{fontspec}'), 'xelatex');
  assert.equal(motorLatex('\\setmainfont{Latin Modern Roman}'), 'xelatex');
  assert.equal(motorLatex('\\usepackage[spanish]{polyglossia}'), 'xelatex');
  // luacode / luatextra / \directlua → LuaLaTeX
  assert.equal(motorLatex('\\usepackage{luacode}'), 'lualatex');
  assert.equal(motorLatex('\\directlua{tex.print("x")}'), 'lualatex');
  // lua gana sobre fontspec si aparecen ambos (se comprueba lua primero)
  assert.equal(motorLatex('\\usepackage{fontspec}\\usepackage{luacode}'), 'lualatex');
});

test('imagenesExternas solo cuenta \\includegraphics del LaTeX activo', () => {
  assert.deepEqual(imagenesExternas('\\includegraphics{a.png}\n\\includegraphics[width=3cm]{b.jpg}'), ['a.png', 'b.jpg']);
  // repetidas no se duplican
  assert.deepEqual(imagenesExternas('\\includegraphics{a.png}\n\\includegraphics{a.png}'), ['a.png']);
  // sin imágenes
  assert.deepEqual(imagenesExternas('Solo texto con $x^2$ y \\textbf{negrita}.'), []);
  // comentada: no cuenta (se mira el LaTeX activo, sin comentarios)
  assert.deepEqual(imagenesExternas('% \\includegraphics{oculta.png}\nHola'), []);
  // dentro de verbatim: tampoco cuenta
  assert.deepEqual(imagenesExternas('\\begin{verbatim}\n\\includegraphics{ej.png}\n\\end{verbatim}'), []);
});
