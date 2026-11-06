// Plantillas de dibujos TikZ que se pueden insertar desde el editor de dibujos.
// Todas compilan con pdfLaTeX (lo comprueba tests/compilar.mjs) y la vista previa las entiende.

export const PLANTILLAS_TIKZ = [
  {
    id: 'vacio', nombre: 'En blanco', desc: 'Una flecha y un círculo para empezar.', libs: [], opc: '',
    src: String.raw`\draw[thick, ->] (0,0) -- (2,0);
\draw[blue] (1,1) circle (0.5);`,
  },
  {
    id: 'ejes', nombre: 'Ejes cartesianos', desc: 'Ejes con marcas, cuadrícula y la gráfica de una función.', libs: [], opc: '',
    src: String.raw`\draw[help lines, step=0.5] (-2.5,-1.5) grid (2.5,2.5);
\draw[->, thick] (-2.7,0) -- (2.8,0) node[right] {$x$};
\draw[->, thick] (0,-1.7) -- (0,2.8) node[above] {$y$};
\foreach \x in {-2,-1,1,2} \draw (\x,0.08) -- (\x,-0.08) node[below] {\small $\x$};
\foreach \y in {-1,1,2} \draw (0.08,\y) -- (-0.08,\y) node[left] {\small $\y$};
\draw[domain=-1.6:1.6, smooth, samples=50, very thick, blue] plot (\x, {\x*\x - 1});
\node[blue, right] at (1.5,1.6) {$y = x^2 - 1$};`,
  },
  {
    id: 'flujo', nombre: 'Diagrama de flujo', desc: 'Inicio, proceso, decisión y fin con flechas.', libs: ['positioning', 'arrows.meta', 'shapes.geometric'], opc: '',
    src: String.raw`\tikzset{
  caja/.style={draw, rounded corners, fill=blue!10, minimum width=2.6cm, minimum height=0.9cm, align=center},
  decision/.style={draw, diamond, fill=orange!15, aspect=2, inner sep=1pt, align=center},
  flecha/.style={-{Stealth}, thick}
}
\node[caja] (inicio) {Inicio};
\node[caja, below=of inicio] (leer) {Leer los datos};
\node[decision, below=of leer] (ok) {¿Son\\válidos?};
\node[caja, below=of ok] (calc) {Calcular};
\node[caja, right=1.5cm of ok] (error) {Mostrar error};
\node[caja, below=of calc] (fin) {Fin};
\draw[flecha] (inicio) -- (leer);
\draw[flecha] (leer) -- (ok);
\draw[flecha] (ok) -- node[right] {sí} (calc);
\draw[flecha] (ok) -- node[above] {no} (error);
\draw[flecha] (error) |- (leer);
\draw[flecha] (calc) -- (fin);`,
  },
  {
    id: 'grafo', nombre: 'Grafo', desc: 'Vértices con nombre, aristas con peso y una dirigida.', libs: [], opc: '',
    src: String.raw`\tikzset{vertice/.style={circle, draw, fill=teal!15, minimum size=8mm}}
\node[vertice] (1) at (0,0) {1};
\node[vertice] (2) at (2.5,1.2) {2};
\node[vertice] (3) at (2.5,-1.2) {3};
\node[vertice] (4) at (5,0) {4};
\draw (1) -- node[above left] {3} (2);
\draw (1) -- node[below left] {5} (3);
\draw (2) -- node[right] {1} (3);
\draw[->, thick, red] (2) -- node[above right] {2} (4);
\draw (3) to[bend right] node[below right] {7} (4);`,
  },
  {
    id: 'triangulo', nombre: 'Triángulo con ángulos', desc: 'Vértices, lados y los tres ángulos marcados.', libs: [], opc: '',
    src: String.raw`\coordinate[label=below left:$A$] (A) at (0,0);
\coordinate[label=below right:$B$] (B) at (4,0);
\coordinate[label=above:$C$] (C) at (1.2,2.6);
\draw[thick] (A) -- (B) -- (C) -- cycle;
\node[below] at (2,0) {$c$};
\node[above right] at (2.6,1.3) {$a$};
\node[above left] at (0.6,1.3) {$b$};
% ángulos: un arco en cada vértice
\draw[red] (0.6,0) arc (0:65.22:0.6);
\node[red] at (0.8,0.51) {$\alpha$};
\draw[blue] (3.4,0) arc (180:137.12:0.6);
\node[blue] at (3.12,0.35) {$\beta$};
\draw[green!50!black] (0.99,2.15) arc (245.22:317.12:0.5);
\node[green!50!black] at (1.36,1.77) {$\gamma$};`,
  },
  {
    id: 'arbol', nombre: 'Árbol', desc: 'Raíz con dos hijos y cuatro nietos.', libs: [],
    opc: 'level distance=1.4cm, level 1/.style={sibling distance=3.2cm}, level 2/.style={sibling distance=1.5cm}, every node/.style={circle, draw, minimum size=7mm}',
    src: String.raw`\node {R}
  child { node {A}
    child { node {A1} }
    child { node {A2} } }
  child { node {B}
    child { node {B1} }
    child { node {B2} } };`,
  },
];
