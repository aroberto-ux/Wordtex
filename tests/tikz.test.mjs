// Parte 2: TikZ (intérprete de la vista previa, bloque, herramienta de dibujo, plantillas).
// node --test tests/*.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarTikz, tikzASvg, libreriasNecesarias, evaluar, dividirSentencias } from '../tikz.js';
import { leerPiezas, escribirPiezas, formaATikz, reconocer, textoNodo } from '../tikz-dibujo.js';
import { PLANTILLAS_TIKZ } from '../tikz-plantillas.js';
import { parsearTex } from '../latex-parse.js';
import { generarTex } from '../latex-gen.js';
import { cfgPorDefecto, bloqueNuevo, sanearBloque } from '../modelo.js';

const contar = (src, k) => interpretarTikz(src).elementos.filter((e) => !k || e.k === k).length;
const doc = (cuerpo, pre = '') => `\\documentclass{article}\n${pre}\\begin{document}\n${cuerpo}\n\\end{document}`;

test('intérprete: formas básicas, nodos y estilos', () => {
  const r = interpretarTikz('\\draw[red, thick, ->] (0,0) -- (1,1) node[above] {A};\n\\fill[blue!30] (2,0) circle (0.5);\n\\draw (0,0) rectangle (1,2) (3,0) ellipse (1 and 0.5);');
  assert.deepEqual(r.avisos, []);
  assert.equal(r.elementos.filter((e) => e.k === 'camino').length, 3);
  const flecha = r.elementos[0];
  assert.deepEqual(flecha.est.dibujar.map(Math.round), [255, 0, 0]);
  assert.equal(flecha.est.lw, 0.8);
  assert.equal(flecha.puntas.length, 1);
  assert.deepEqual(r.elementos[2].est.rellenar.map(Math.round), [179, 179, 255]);
  assert.match(tikzASvg(r), /^<svg[\s\S]*<\/svg>$/);
});

test('intérprete: \\foreach con «...», varias variables, count y anidado', () => {
  assert.equal(contar('\\foreach \\x in {0,1,...,4} \\draw (\\x,0) circle (0.1);', 'camino'), 5);
  assert.equal(contar('\\foreach \\x in {0,0.5,...,2} { \\fill (\\x,0) circle (1pt); }', 'camino'), 5);
  assert.equal(contar('\\foreach \\a/\\c in {0/red, 90/blue} \\fill[\\c] (\\a:1) circle (2pt);', 'camino'), 2);
  assert.equal(contar('\\foreach \\x in {1,2} \\foreach \\y in {1,2,3} \\draw (\\x,\\y) -- +(0.1,0);', 'camino'), 6);
  const r = interpretarTikz('\\foreach \\t [count=\\i] in {a,b,c} \\node at (\\i,0) {\\t};');
  assert.deepEqual(r.elementos.map((e) => Math.round(e.x / 28.45)), [1, 2, 3]);
});

test('intérprete: posiciones relativas, nodos con nombre y librería positioning', () => {
  const r = interpretarTikz('\\node[draw] (a) at (0,0) {A};\n\\node[draw, right=of a] (b) {B};\n\\draw[->] (a) -- (b);');
  assert.deepEqual(r.avisos, []);
  const [a, b] = r.elementos.filter((e) => e.k === 'nodo');
  assert.ok(Math.abs((b.x - b.w / 2) - (a.x + a.w / 2) - 28.45) < 0.1); // 1cm entre bordes
  const linea = r.elementos.find((e) => e.k === 'camino');
  assert.ok(Math.abs(linea.segs[0][1].x - (a.x + a.w / 2)) < 0.1); // empieza en el borde de A
});

test('intérprete: lo que no entiende es un aviso, nunca un error', () => {
  const r = interpretarTikz('\\shade[ball color=red] (0,0) circle (1);\n\\pic {angle};\n\\draw (0,0) -- (noexiste);\n\\draw[decorate] (0,0) -- (1,0);\n\\draw (');
  assert.ok(r.avisos.length >= 4);
  const piezas = ['\\draw', '\\node', '(', ')', '{', '}', '[', ']', '--', ';', 'circle', 'arc', '\\foreach', '\\x', 'in', '1', ',', ':', 'node', 'rectangle', '..', 'controls', '$', '\\\\', 'child', 'plot', 'grid', 'to', 'edge'];
  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  for (let k = 0; k < 400; k++) {
    const src = Array.from({ length: 4 + Math.floor(azar() * 30) }, () => piezas[Math.floor(azar() * piezas.length)]).join(' ');
    assert.doesNotThrow(() => tikzASvg(interpretarTikz(src)), src);
  }
});

test('expresiones de pgfmath', () => {
  assert.equal(evaluar('2*3+1').v, 7);
  assert.ok(Math.abs(evaluar('sin(30)').v - 0.5) < 1e-9);
  assert.ok(Math.abs(evaluar('cos(pi r)').v + 1) < 1e-9);
  assert.equal(evaluar('1cm').dim, true);
  assert.equal(evaluar('-2^2').v, -4);
});

test('librerías necesarias', () => {
  assert.deepEqual(libreriasNecesarias('\\draw[-{Stealth}] (a) -- (b);\n\\node[draw, diamond, right=of a] {x};\n\\coordinate (m) at ($(a)!0.5!(b)$);'), ['arrows.meta', 'positioning', 'calc', 'shapes.geometric']);
  assert.deepEqual(libreriasNecesarias('\\node {Todo Circle};\n\\draw[->] (0,0) -- (1,0); % -{Stealth}'), []);
});

test('plantillas: la vista previa las entiende enteras', () => {
  assert.equal(PLANTILLAS_TIKZ.length, 6);
  for (const p of PLANTILLAS_TIKZ) assert.deepEqual(interpretarTikz(p.src, { opc: p.opc }).avisos, [], p.id);
});

test('bloque tikz: suelto, en figura, centrado y con \\resizebox; ida y vuelta estable', () => {
  const src = doc(['\\begin{tikzpicture}[scale=2]\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
    '\\begin{figure}[htbp]\n\\centering\n\\begin{tikzpicture}\n\\draw (0,0) circle (1);\n\\end{tikzpicture}\n\\caption{Un círculo}\n\\label{fig:c}\n\\end{figure}',
    '\\begin{center}\n\\resizebox{0.6\\linewidth}{!}{%\n\\begin{tikzpicture}\n\\draw (0,0) -- (2,0);\n\\end{tikzpicture}%\n}\n\\end{center}'].join('\n\n'), '\\usepackage{tikz}\n\\usetikzlibrary{calc}\n');
  const m = parsearTex(src);
  assert.deepEqual(m.bloques.map((b) => [b.t, b.env, b.opc, b.ancho, b.label, b.libs]), [
    ['tikz', '', 'scale=2', 0, '', ['calc']], ['tikz', 'figure', '', 0, 'fig:c', ['calc']], ['tikz', 'center', '', 60, '', ['calc']]]);
  assert.equal(m.bloques[0].src, '  \\draw (0,0) -- (1,1);');
  assert.equal(m.extra, '');
  const t1 = generarTex(m, m.bloques).tex;
  assert.match(t1, /\\usepackage\{tikz\}\n\\usetikzlibrary\{calc\}/);
  const m2 = parsearTex(t1);
  assert.equal(generarTex(m2, m2.bloques).tex, t1);
});

test('tikz en LaTeX avanzado o en el preámbulo propio también carga el paquete y sus librerías', () => {
  const d = { cfg: cfgPorDefecto(), biblio: [], extra: '' };
  const t = generarTex(d, [{ t: 'raw', tex: '\\begin{figure}\\begin{minipage}{.4\\linewidth}\\begin{tikzpicture}\\node[right=of a] {x};\\end{tikzpicture}\\end{minipage}\\end{figure}' }]).tex;
  assert.match(t, /\\usepackage\{tikz\}\n\\usetikzlibrary\{positioning\}/);
  // sin bloques tikz, \usetikzlibrary se queda en el preámbulo propio
  const m = parsearTex(doc('\\begin{figure}\\begin{minipage}{1cm}x\\end{minipage}\\end{figure}', '\\usepackage{tikz}\n\\usetikzlibrary{calc}\n'));
  assert.equal(m.extra, '\\usetikzlibrary{calc}');
});

test('bloque tikz: saneado (límites y valores válidos)', () => {
  const b = sanearBloque({ t: 'tikz', src: 'x'.repeat(200000), libs: ['calc', 'calc', '}{malo', 'positioning'], ancho: 500, env: 'raro', opc: '[scale=2]' });
  assert.equal(b.src.length, 100000);
  assert.deepEqual(b.libs, ['calc', 'positioning']);
  assert.equal(b.ancho, 100); assert.equal(b.env, 'center'); assert.equal(b.opc, 'scale=2');
  assert.deepEqual(Object.keys(sanearBloque(bloqueNuevo('tikz'))).sort(), ['ancho', 'env', 'label', 'libs', 'opc', 'pie', 'src', 't']);
});

test('herramienta de dibujo: conserva tal cual lo escrito a mano', () => {
  const src = '\\tikzset{x/.style={red}}\n\\draw[x] (0,0) -- (1,1); % estilo propio\n\\draw[red, thick] (0,0) -- (2,0);   % mía\n\\foreach \\i in {1,2} {\n  \\fill (\\i,1) circle (1pt);\n}\n\\node at (1,2) {Hola};';
  const piezas = leerPiezas(src);
  assert.equal(escribirPiezas(piezas), src);
  assert.deepEqual(piezas.filter((p) => p.forma).map((p) => p.forma.tipo), ['linea', 'texto']);
  // borrar la línea roja y añadir un círculo: lo demás no cambia ni un carácter
  const sin = piezas.filter((p) => !(p.forma && p.forma.tipo === 'linea'));
  sin.push({ forma: { tipo: 'circulo', x1: 1, y1: 1, r: 0.5, color: 'blue', grosor: 'thick' } });
  assert.equal(escribirPiezas(sin), '\\tikzset{x/.style={red}}\n\\draw[x] (0,0) -- (1,1); % estilo propio\n\\foreach \\i in {1,2} {\n  \\fill (\\i,1) circle (1pt);\n}\n\\node at (1,2) {Hola};\n\\draw[blue, thick] (1,1) circle (0.5);');
});

test('herramienta de dibujo: formas y texto', () => {
  const formas = [
    { tipo: 'linea', x1: 0, y1: 0, x2: 1.5, y2: -2, color: 'black', grosor: 'thin' }, { tipo: 'flecha', x1: 0, y1: 0, x2: 1, y2: 0, color: 'green!50!black', grosor: 'very thick' },
    { tipo: 'rect', x1: 0, y1: 0, x2: 2, y2: 1, color: 'red', grosor: 'thin' }, { tipo: 'texto', x1: 1, y1: 1, texto: 'Área $A$', color: 'blue' },
  ];
  for (const f of formas) assert.deepEqual(reconocer(formaATikz(f)), f.tipo === 'texto' ? { ...f } : f, formaATikz(f));
  assert.equal(formaATikz(formas[1]), '\\draw[green!50!black, very thick, ->] (0,0) -- (1,0);');
  assert.equal(textoNodo('50% de x_1 y $x_1$ & {b}'), '50\\% de x\\_1 y $x_1$ \\& b');
  assert.equal(reconocer('\\draw[dashed] (0,0) -- (1,1);'), null); // opción que la herramienta no maneja: ajena
});

test('dividirSentencias respeta foreach, scope y comentarios', () => {
  const s = '\\foreach \\x in {1,2} \\draw (\\x,0) -- (0,1);\n% comentario\n\\begin{scope}[red]\n\\draw (0,0);\n\\end{scope}\n\\node {a; b};';
  assert.equal(dividirSentencias(s).join(''), s);
  assert.equal(dividirSentencias(s).length, 4);
});
