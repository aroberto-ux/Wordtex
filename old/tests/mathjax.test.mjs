import test from 'node:test';
import assert from 'node:assert/strict';
import { mateHtml, mateDisponible, limpiarMate } from '../mathjax.js';
import { htmlDeTexto } from '../tikz.js';

test('mathjax.js se importa en Node y degrada sin MathJax', () => {
  assert.equal(mateDisponible(), false);
  assert.equal(mateHtml('x^2'), null);
  assert.doesNotThrow(() => limpiarMate(null));
});

test('TikZ: sin MathJax la fórmula de un nodo sale como texto en cursiva', () => {
  assert.equal(htmlDeTexto('$x^2$'), '<i>x^2</i>');
});
