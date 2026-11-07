// Pruebas del generador de Typst (typst-gen.js) y del dispatcher (generar.js).
// Se ejecutan con:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { generarTypst } from '../typst-gen.js';
import { generarCodigo, formatoDe, extensionDe, nombreFormato } from '../generar.js';
import { cfgPorDefecto } from '../modelo.js';

const gen = (bloques, cfgExtra = {}, biblio = []) => generarTypst({ cfg: { ...cfgPorDefecto(), formato: 'typst', titulo: 'Doc', autor: 'Yo', ...cfgExtra }, biblio, extra: '' }, bloques).tex;

test('dispatcher elige el generador según cfg.formato', () => {
  assert.equal(formatoDe({ cfg: { formato: 'typst' } }), 'typst');
  assert.equal(formatoDe({ cfg: { formato: 'latex' } }), 'latex');
  assert.equal(formatoDe({ cfg: {} }), 'latex');          // por defecto latex
  assert.equal(formatoDe({}), 'latex');
  assert.equal(extensionDe({ cfg: { formato: 'typst' } }), 'typ');
  assert.equal(extensionDe({ cfg: { formato: 'latex' } }), 'tex');
  assert.equal(nombreFormato({ cfg: { formato: 'typst' } }), 'Typst');
  // generarCodigo con formato typst produce Typst (no LaTeX): sin \documentclass, con #set page
  const out = generarCodigo({ cfg: { ...cfgPorDefecto(), formato: 'typst' }, biblio: [], extra: '' }, [{ t: 'p', c: [{ s: 'hola' }], al: 'j' }]).tex;
  assert.match(out, /#set page\(/);
  assert.doesNotMatch(out, /\\documentclass/);
});

test('encabezados usan = según el nivel', () => {
  const out = gen([
    { t: 'h', n: 1, c: [{ s: 'Sección' }], num: true, label: 'sec:a' },
    { t: 'h', n: 2, c: [{ s: 'Subsección' }], num: true, label: '' },
  ]);
  assert.match(out, /^= Sección <sec:a>$/m);
  assert.match(out, /^== Subsección$/m);
});

test('formato inline: negrita, cursiva, código y enlaces', () => {
  const out = gen([{ t: 'p', al: 'j', c: [
    { s: 'normal ' }, { s: 'negrita', b: 1 }, { s: ' ' }, { s: 'cursiva', i: 1 },
    { s: ' ' }, { url: 'https://x.org', c: [{ s: 'enlace' }] },
  ] }]);
  assert.match(out, /\*negrita\*/);
  assert.match(out, /_cursiva_/);
  assert.match(out, /#link\("https:\/\/x\.org"\)\[enlace\]/);
});

test('fórmulas: inline con #mi y bloque con #mitex (reutiliza el LaTeX del modelo)', () => {
  const out = gen([
    { t: 'p', al: 'j', c: [{ s: 'La fórmula ' }, { mate: 'x^2' }, { s: '.' }] },
    { t: 'eq', env: 'equation', tex: '\\frac{a}{b}', num: true, label: 'eq:x' },
  ]);
  assert.match(out, /#mi\(`x\^2`\)/);
  assert.match(out, /#mitex\(`\\frac\{a\}\{b\}`\) <eq:x>/);
  assert.match(out, /#import "@preview\/mitex/);   // se importa mitex solo si hay matemáticas
});

test('sin matemáticas no se importa mitex', () => {
  const out = gen([{ t: 'p', al: 'j', c: [{ s: 'solo texto' }] }]);
  assert.doesNotMatch(out, /mitex/);
});

test('listas con viñetas, numeradas y anidadas', () => {
  const vinetas = gen([{ t: 'lista', ord: false, items: [{ c: [{ s: 'a' }], n: 0 }, { c: [{ s: 'b' }], n: 1 }] }]);
  assert.match(vinetas, /^- a$/m);
  assert.match(vinetas, /^ {2}- b$/m);  // anidado con sangría
  const num = gen([{ t: 'lista', ord: true, items: [{ c: [{ s: 'x' }], n: 0 }] }]);
  assert.match(num, /^\+ x$/m);
});

test('tabla con cabecera y pie se vuelve figure+table', () => {
  const out = gen([{ t: 'tabla', filas: [[[{ s: 'A' }], [{ s: 'B' }]], [[{ s: '1' }], [{ s: '2' }]]], enc: true, al: ['l', 'c'], borde: 'completo', pie: [{ s: 'Datos' }], label: 'tab:x' }]);
  assert.match(out, /#figure\(/);
  assert.match(out, /table\(/);
  assert.match(out, /columns: 2/);
  assert.match(out, /align: \(left, center\)/);
  assert.match(out, /\[\*A\*\]/);        // cabecera en negrita
  assert.match(out, /caption: \[Datos\]/);
  assert.match(out, /<tab:x>/);
});

test('teorema, cita, código y saltos', () => {
  const out = gen([
    { t: 'teo', tipo: 'theorem', titulo: 'T', c: [{ s: 'enunciado' }] },
    { t: 'cita', c: [{ s: 'citado' }] },
    { t: 'cod', lang: 'Python', src: 'x = 1', num: false },
    { t: 'salto' },
    { t: 'toc' },
  ]);
  assert.match(out, /\*Teorema \(T\)\.\*/);
  assert.match(out, /#quote\(block: true\)\[citado\]/);
  assert.match(out, /```python\nx = 1\n```/);
  assert.match(out, /#pagebreak\(\)/);
  assert.match(out, /#outline\(\)/);
});

test('escapa caracteres especiales de Typst en el texto (pero no las comillas en markup)', () => {
  const out = gen([{ t: 'p', al: 'j', c: [{ s: 'a*b_c #d $e "f"' }] }]);
  assert.match(out, /a\\\*b\\_c \\#d \\\$e "f"/);   // las comillas quedan literales, sin \"
});

test('citas usan @clave y enlazan con la entrada etiquetada de la bibliografía', () => {
  const out = gen([{ t: 'p', al: 'j', c: [{ s: 'ver ' }, { cita: 'knuth' }] }], {}, [{ key: 'knuth', texto: 'Knuth 1984' }]);
  assert.match(out, /@knuth/);
  assert.doesNotMatch(out, /#cite/);
  assert.match(out, /#label\("knuth"\)/);           // la entrada lleva el destino
});

test('cabecera ya en negrita no se re-envuelve (evita ** vacío de Typst)', () => {
  const out = gen([{ t: 'tabla', filas: [[[{ s: 'Col', b: 1 }]], [[{ s: '1' }]]], enc: true, al: ['l'], borde: 'completo', pie: [] }]);
  assert.match(out, /\[\*Col\*\]/);
  assert.doesNotMatch(out, /\*\*Col\*\*/);
});

test('las figuras con imagen se dibujan como recuadro (la compilación en línea no tiene archivos)', () => {
  const out = gen([{ t: 'fig', src: 'data:image/png;base64,xx', nombre: 'f.png', ancho: 60, pie: [], label: '', env: 'figure' }]);
  assert.match(out, /rect\(width: 60%/);
  assert.doesNotMatch(out, /image\(/);              // no se emite image(): typst.ts no podría resolverla
});

test('portada con título y configuración de página', () => {
  const out = gen([{ t: 'p', al: 'j', c: [{ s: 'x' }] }], { titulo: 'Mi Título', autor: 'Ana', papel: 'letterpaper', fuente: 12, margen: 3, numPag: false });
  assert.match(out, /paper: "us-letter"/);
  assert.match(out, /margin: 3cm/);
  assert.match(out, /numbering: none/);   // sin numerar páginas
  assert.match(out, /size: 12pt/);
  assert.match(out, /Mi Título/);
  assert.match(out, /Ana/);
});

test('raw y tikz se omiten/avisan pero no rompen', () => {
  const out = gen([
    { t: 'raw', tex: '\\usepackage{foo}' },
    { t: 'tikz', src: '\\draw (0,0);', opc: '', libs: [], pie: [], ancho: 0, env: 'center' },
    { t: 'p', al: 'j', c: [{ s: 'sigue' }] },
  ]);
  assert.doesNotMatch(out, /usepackage/);     // el raw de LaTeX no aparece
  assert.match(out, /TikZ/);                    // aviso de dibujo no disponible
  assert.match(out, /sigue/);
});
