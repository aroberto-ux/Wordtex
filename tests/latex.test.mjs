// Pruebas del núcleo (modelo ⇄ LaTeX). Se ejecutan con:  node --test tests/
// No necesitan navegador ni dependencias.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generarTex, mapearBloques } from '../latex-gen.js';
import { parsearTex } from '../latex-parse.js';
import { cfgPorDefecto, bloqueNuevo, sanearCfg, urlSegura } from '../modelo.js';
import { PLANTILLAS, crearDesdePlantilla } from '../plantillas.js';
import { diffBloques } from '../sync.js';
import { numerar } from '../numerar.js';
import { PALETA } from '../matematica.js';

const sinId = (bs) => bs.map(({ id, orden, ...r }) => r);
const doc = (bloques, cfg = {}) => ({ cfg: { ...cfgPorDefecto(), ...cfg }, biblio: [], extra: '', bloques });
const tex = (d) => generarTex(d, d.bloques).tex;
const idaYVuelta = (d) => parsearTex(tex(d));

test('cada plantilla sobrevive a la ida y vuelta sin cambios', () => {
  for (const p of PLANTILLAS) {
    const d = crearDesdePlantilla(p.id, 'X');
    const m = parsearTex(tex(d));
    if (d.bloques.length === 1 && !d.bloques[0].c?.length) assert.equal(m.bloques.length, 0, p.id);
    else assert.deepEqual(sinId(m.bloques), sinId(d.bloques), p.id);
    assert.deepEqual(m.cfg, d.cfg, p.id);
    assert.equal(m.extra, d.extra, p.id);
    assert.equal(generarTex(m, m.bloques).tex, tex(d), p.id);
  }
});

test('los símbolos Unicode vuelven a ser símbolos (texto, título, autor, bibliografía)', () => {
  const texto = 'α ≤ β · 30° √2 − 1 ∞';
  const d = doc([{ t: 'p', c: [{ s: texto }], al: 'j' }], { titulo: 'Ondas α y β', autor: 'Ana · Luis' });
  d.biblio = [{ key: 'k', texto: 'Δ de ε' }];
  const m = idaYVuelta(d);
  assert.deepEqual(m.bloques[0].c, [{ s: texto }]);
  assert.equal(m.cfg.titulo, 'Ondas α y β');
  assert.equal(m.cfg.autor, 'Ana · Luis');
  assert.equal(m.biblio[0].texto, 'Δ de ε');
});

test('sin título no se desactiva la portada', () => {
  assert.equal(idaYVuelta(doc([{ t: 'p', c: [{ s: 'a' }], al: 'j' }])).cfg.mostrarTitulo, true);
  assert.equal(idaYVuelta(doc([], { titulo: 'T', mostrarTitulo: false })).cfg.mostrarTitulo, false);
});

test('los comentarios al final de línea no pasan al texto', () => {
  const m = parsearTex('\\begin{document}\n\\section{Uno} % c\n\\begin{itemize}\n\\item a % c\n\\end{itemize}\n\\begin{tabular}{l}\nx % c\n\\end{tabular}\n\\end{document}');
  assert.deepEqual(m.bloques[0].c, [{ s: 'Uno' }]);
  assert.deepEqual(m.bloques[1].items[0].c, [{ s: 'a' }]);
  assert.deepEqual(m.bloques[2].filas[0][0], [{ s: 'x' }]);
});

test('\\newtheorem con contador compartido no deja texto suelto en el preámbulo', () => {
  const m = parsearTex('\\documentclass{article}\n\\newtheorem{theorem}{Teorema}\n\\newtheorem{lemma}[theorem]{Lema}\n\\newtheorem{conj}{Conjetura}[section]\n\\begin{document}\nx\n\\end{document}');
  assert.equal(m.extra, '\\newtheorem{conj}{Conjetura}[section]');
});

test('los comandos desconocidos del preámbulo se conservan en una sola pieza', () => {
  const m = parsearTex('\\documentclass{article}\n\\definecolor{azul}{RGB}{0,0,200}\n\\begin{document}\nx\n\\end{document}');
  assert.equal(m.extra, '\\definecolor{azul}{RGB}{0,0,200}');
});

test('los paquetes que necesita el LaTeX crudo se vuelven a cargar', () => {
  const m = parsearTex('\\documentclass{article}\n\\usepackage{booktabs}\n\\usepackage{listings}\n\\begin{document}\n\\begin{tabular}{lc}\\toprule \\multicolumn{2}{c}{X}\\\\ \\bottomrule\\end{tabular}\n\nUsa \\lstinline|x| aquí.\n\\end{document}');
  const t = generarTex(m, m.bloques).tex;
  assert.match(t, /\\usepackage\{booktabs\}/);
  assert.match(t, /\\usepackage\{listings\}/);
});

test('un paquete del preámbulo propio no se carga dos veces', () => {
  const d = doc([{ t: 'raw', tex: '\\toprule' }]); d.extra = '\\usepackage{booktabs}';
  assert.equal(tex(d).match(/\\usepackage\{booktabs\}/g).length, 1);
});

test('book con resumen define el entorno abstract y la ida y vuelta no lo duplica', () => {
  const d = doc([{ t: 'resumen', c: [{ s: 'r' }] }], { clase: 'book' });
  const t1 = tex(d);
  assert.match(t1, /\\newenvironment\{abstract\}/);
  const m = parsearTex(t1);
  assert.equal(m.extra, '');
  assert.equal(generarTex(m, m.bloques).tex, t1);
  assert.doesNotMatch(tex(doc([{ t: 'resumen', c: [] }], { clase: 'report' })), /newenvironment/);
});

test('figura sin imagen: recuadro que compila y vuelve a ser figura', () => {
  const d = doc([{ ...bloqueNuevo('fig'), ancho: 50, pie: [{ s: 'P' }], label: 'fig:a' }]);
  const t = tex(d);
  assert.doesNotMatch(t, /includegraphics/);
  assert.deepEqual(sinId(parsearTex(t).bloques), sinId(d.bloques));
});

test('dos figuras con el mismo nombre de archivo conservan su imagen', () => {
  const f = (src) => ({ t: 'fig', src, nombre: 'imagen.png', ancho: 70, pie: [], label: '' });
  const viejos = [{ id: 'a', orden: 1, ...f('data:image/png;base64,AAAA') }, { id: 'b', orden: 2, ...f('data:image/png;base64,BBBB') }];
  const { imagenes } = generarTex(doc([]), viejos);
  assert.deepEqual(imagenes.map((i) => i.nombre), ['imagen.png', 'imagen-2.png']);
  const d = diffBloques(viejos, parsearTex(generarTex(doc([]), viejos).tex).bloques);
  assert.deepEqual(d.final.map((b) => b.src.slice(-4)), ['AAAA', 'BBBB']);
});

test('saltos de línea: nunca al inicio de un párrafo y sin romper filas de tablas', () => {
  assert.doesNotMatch(tex(doc([{ t: 'p', c: [{ br: 1 }, { s: 'x' }, { br: 1 }], al: 'j' }])), /\\\\ x|x\\\\/);
  const tabla = { t: 'tabla', filas: [[[{ s: 'a' }, { br: 1 }, { s: 'b' }], [{ s: 'c' }]], [[{ s: 'd' }], []]], enc: true, al: ['l', 'c'], borde: 'completo', pie: [], label: '' };
  assert.deepEqual(sinId(idaYVuelta(doc([tabla])).bloques), [tabla]);
});

test('\\verb, \\noindent y \\end{lstlisting} dentro del código', () => {
  const m = parsearTex('\\begin{document}\n\\noindent El valor \\verb|a_b%| es\nlargo.\n\\end{document}');
  assert.equal(m.bloques.length, 1);
  assert.deepEqual(m.bloques[0].c.filter((n) => n.raw).map((n) => n.raw), ['\\noindent', '\\verb|a_b%|']);
  const cod = { t: 'cod', lang: 'TeX', src: '\\begin{lstlisting}\nx\n\\end{lstlisting}', num: false };
  assert.deepEqual(sinId(idaYVuelta(doc([cod])).bloques), [cod]);
});

test('metadatos del PDF sin caracteres que rompan la compilación', () => {
  const t = tex(doc([], { titulo: 'Ondas α & β_1', autor: 'José' }));
  assert.match(t, /\\hypersetup\{pdftitle=\{Ondas β?1?.*\}, pdfauthor=\{José\}\}/);
  assert.doesNotMatch(t.match(/\\hypersetup.*/)[0], /[α&_]/);
});

test('los márgenes del panel (0,5 a 6 cm) se respetan', () => {
  assert.equal(sanearCfg({ margen: 0.5 }).margen, 0.5);
  assert.equal(sanearCfg({ margen: 6 }).margen, 6);
});

test('enlaces: se descartan los esquemas peligrosos', () => {
  assert.equal(urlSegura('javascript:alert(1)'), '');
  assert.equal(urlSegura('https://a.org'), 'https://a.org');
  assert.equal(urlSegura('mailto:a@b.co'), 'mailto:a@b.co');
  // direcciones protocol-relative (//host): navegan a un host externo, deben descartarse
  assert.equal(urlSegura('//evil.example/x'), '');
  assert.equal(urlSegura('http://a.org/path'), 'http://a.org/path');
  assert.equal(urlSegura('/ruta/relativa'), '/ruta/relativa');
  const m = parsearTex('\\begin{document}\n\\href{javascript:alert(1)}{clic}\n\\end{document}');
  assert.equal(m.bloques[0].c[0].url, '');
  assert.equal(generarTex(m, m.bloques).tex.includes('\\href'), false);
});

test('diffBloques: reordenar bloques del mismo tipo conserva su identidad', () => {
  const viejos = [
    { id: 'T', orden: 1000, t: 'tabla', filas: [[[{ s: 'vieja' }]]], al: ['l'] },
    { id: 'P', orden: 2000, t: 'p', c: [{ s: 'parrafo viejo' }] },
  ];
  // mismos tipos reordenados y con el contenido cambiado (sin coincidencias LCS)
  const nuevos = [
    { t: 'p', c: [{ s: 'parrafo nuevo' }] },
    { t: 'tabla', filas: [[[{ s: 'nueva' }]]], al: ['l'] },
  ];
  const d = diffBloques(viejos, nuevos);
  assert.deepEqual(d.crear, [], 'no debe crear bloques nuevos');
  assert.deepEqual(d.eliminar, [], 'no debe eliminar la tabla existente');
  assert.deepEqual(d.final.map((b) => b.id).sort(), ['P', 'T'], 'conserva los dos ids');
  // la tabla queda al final y mantiene su id T
  assert.equal(d.final.find((b) => b.t === 'tabla').id, 'T');
  assert.equal(d.final.find((b) => b.t === 'p').id, 'P');
});

test('numeración igual que en LaTeX: figuras y tablas solo con pie; align sin \\nonumber', () => {
  const bl = [
    { id: '1', t: 'fig', pie: [] }, { id: '2', t: 'fig', pie: [{ s: 'p' }] },
    { id: '3', t: 'tabla', pie: [], label: 'tab:x' }, { id: '4', t: 'tabla', pie: [{ s: 'p' }] },
    { id: '5', t: 'eq', env: 'align', num: true, tex: 'a \\\\ b \\nonumber \\\\ c' },
  ];
  const n = numerar(cfgPorDefecto(), bl);
  assert.deepEqual(['1', '2', '3', '4', '5'].map((k) => n.info.get(k).num), ['', '1', '', '1', '1–2']);
});

test('paleta de fórmulas: cada plantilla tiene como mucho un marcador de cursor', () => {
  for (const [, items] of PALETA) for (const [, snip] of items) assert.ok(snip.split('‸').length <= 2, snip);
  const abs = PALETA[0][1].find((x) => x[2] === 'Valor absoluto')[1];
  assert.equal(abs.replace('‸', 'x'), '\\left| x \\right|');
});

// documento LaTeX como string (para pruebas de importación)
const docTex = (cuerpo, pre = '') => `\\documentclass{article}\n${pre}\\begin{document}\n${cuerpo}\n\\end{document}`;

test('tablas con columnas avanzadas (p{}, >{}, @{}) se importan como tabla editable', () => {
  const m = parsearTex(docTex('\\begin{tabular}{l >{\\raggedright\\arraybackslash}p{4.3cm} c}\n\\toprule\na & b & c \\\\\n\\midrule\n1 & 2 & 3 \\\\\n\\bottomrule\n\\end{tabular}'));
  assert.equal(m.bloques.length, 1);
  assert.equal(m.bloques[0].t, 'tabla', 'debe ser tabla nativa, no raw');
  assert.deepEqual(m.bloques[0].al, ['l', 'l', 'c']); // p{} → l
  assert.equal(m.bloques[0].filas.length, 2);
  assert.equal(m.bloques[0].al.length, 3);
});

test('tabularx se importa como tabla editable (argumento de ancho antes del spec)', () => {
  const m = parsearTex(docTex('\\begin{tabularx}{\\textwidth}{@{}l X@{}}\na & b \\\\\n1 & 2 \\\\\n\\end{tabularx}'));
  assert.equal(m.bloques[0].t, 'tabla');
  assert.deepEqual(m.bloques[0].al, ['l', 'l']); // X → l
});

test('\\multicolumn se importa como celda fusionada y conserva su semántica al exportar', () => {
  const m = parsearTex(docTex('\\begin{tabular}{c c c}\n\\toprule\na & b & c \\\\\n\\midrule\n\\multicolumn{2}{r}{Total} & 20 \\\\\n\\bottomrule\n\\end{tabular}'));
  assert.equal(m.bloques[0].t, 'tabla');
  const ult = m.bloques[0].filas[m.bloques[0].filas.length - 1];
  assert.deepEqual(ult[0], { c: [{ s: 'Total' }], colspan: 2, al: 'r', spec: 'r' });
  assert.deepEqual(ult[1], { cover: [1, 0] });
  assert.deepEqual(ult[2], [{ s: '20' }]);
  const t1 = generarTex(m, m.bloques).tex;
  assert.match(t1, /\\multicolumn\{2\}\{r\}\{Total\}/);
  const m2 = parsearTex(t1);
  assert.equal(generarTex(m2, m2.bloques).tex, t1);
});

test('\\multirow se importa como celda fusionada y conserva su semántica al exportar', () => {
  const m = parsearTex(docTex('\\begin{tabular}{c c}\n\\multirow{2}{*}{G} & 1 \\\\\n & 2 \\\\\n\\end{tabular}'));
  assert.equal(m.bloques[0].t, 'tabla');
  assert.deepEqual(m.bloques[0].filas[0][0], { c: [{ s: 'G' }], rowspan: 2, anchoFila: '*' });
  assert.deepEqual(m.bloques[0].filas[1][0], { cover: [0, 0] });
  const t1 = generarTex(m, m.bloques).tex;
  assert.match(t1, /\\multirow\{2\}\{\*\}\{G\}/);
  const m2 = parsearTex(t1);
  assert.equal(generarTex(m2, m2.bloques).tex, t1);
});

test('tabla con espacio extra por fila (\\\\[2ex]) se importa y conserva el espaciado', () => {
  const m = parsearTex(docTex('\\begin{tabular}{l l}\na & b \\\\[2ex]\nc & d \\\\\ne & f \\\\\n\\end{tabular}'));
  assert.equal(m.bloques[0].t, 'tabla', 'ya no se degrada a LaTeX avanzado');
  assert.equal(m.bloques[0].esp[0], '2ex'); // el espacio pertenece a la primera fila
  assert.ok(!m.bloques[0].esp[1] && !m.bloques[0].esp[2]); // las demás filas sin espaciado extra
  const t1 = generarTex(m, m.bloques).tex;
  assert.match(t1, /b \\\\\[2ex\]/, 'regenera el espaciado en la fila correcta');
  const m2 = parsearTex(t1);
  assert.equal(generarTex(m2, m2.bloques).tex, t1); // round-trip estable
});

test('tabla dentro de \\begin{center} se importa como tabla editable', () => {
  const m = parsearTex(docTex('\\begin{center}\n\\begin{tabular}{l l}\nFecha: x & Resumen: y \\\\\n\\end{tabular}\n\\end{center}'));
  const tabla = m.bloques.find((b) => b.t === 'tabla');
  assert.ok(tabla, 'hay una tabla nativa');
  assert.equal(tabla.filas.length, 1);
  assert.equal(tabla.al.length, 2);
});

test('detección de paquetes nuevos: cleveref tras hyperref; csquotes/nicefrac/esint antes', () => {
  const d = doc([
    { t: 'p', c: [{ s: 'Ver ' }, { raw: '\\cref{x}' }, { s: ' y ' }, { raw: '\\enquote{t}' }], al: 'j' },
    { t: 'eq', env: 'equation', num: false, tex: '\\nicefrac{1}{2} \\oiint_S F', label: '' },
  ]);
  const pre = tex(d).split('\\begin{document}')[0];
  assert.ok(pre.includes('\\usepackage{nicefrac}'), 'nicefrac');
  assert.ok(pre.includes('\\usepackage{csquotes}'), 'csquotes');
  assert.ok(pre.includes('\\usepackage{esint}'), 'esint');
  assert.ok(pre.includes('\\usepackage{cleveref}'), 'cleveref');
  // cleveref debe ir DESPUÉS de hyperref para compilar
  assert.ok(pre.indexOf('{hyperref}') < pre.indexOf('{cleveref}'), 'cleveref tras hyperref');
});

test('paquetes nuevos sin opciones del preámbulo importado no se duplican', () => {
  const m = parsearTex('\\documentclass{article}\n\\usepackage{nicefrac}\n\\usepackage{csquotes}\n\\usepackage{fancyhdr}\n\\begin{document}\n\\enquote{x}\n\\end{document}');
  // al no llevar opciones ni configuración, se descartan y se regeneran si hacen falta
  assert.ok(!/nicefrac|fancyhdr/.test(m.extra), 'no se quedan en el preámbulo propio');
});

test('listas anidadas de hasta 5 niveles se importan sin degradarse a LaTeX avanzado', () => {
  const src = docTex('\\begin{enumerate}\n\\item A\n\\begin{enumerate}\n\\item B\n\\begin{enumerate}\n\\item C\n\\begin{enumerate}\n\\item D\n\\end{enumerate}\n\\end{enumerate}\n\\end{enumerate}\n\\end{enumerate}');
  const m = parsearTex(src);
  assert.equal(m.bloques.length, 1);
  assert.equal(m.bloques[0].t, 'lista');
  assert.deepEqual(m.bloques[0].items.map((it) => it.n), [0, 1, 2, 3]);
  // round-trip estable
  const t1 = generarTex(m, m.bloques).tex;
  const m2 = parsearTex(t1);
  assert.equal(generarTex(m2, m2.bloques).tex, t1);
});

test('mapearBloques: cada bloque apunta a su fragmento en el .tex (para «doble clic → código»)', () => {
  const d = { cfg: cfgPorDefecto(), biblio: [], extra: '' };
  const bloques = [
    { id: 'a', orden: 1, t: 'h', n: 1, c: [{ s: 'Intro' }], num: true, label: '' },
    { id: 'b', orden: 2, t: 'p', c: [{ s: 'Hola mundo' }], al: 'j' },
    { id: 'c', orden: 3, t: 'eq', env: 'equation', num: false, tex: 'E = mc^2', label: '' },
    { id: 'e', orden: 4, t: 'p', c: [{ s: 'Hola mundo' }], al: 'j' }, // idéntico a «b»: no debe mapear al mismo sitio
  ];
  const t = generarTex(d, bloques).tex;
  const m = mapearBloques(d, bloques, t);
  const pos = bloques.map((b) => m.get(b.id));
  assert.ok(pos.every((p) => p != null), 'todos los bloques se localizan');
  assert.ok(pos.every((p, i) => i === 0 || p > pos[i - 1]), 'las posiciones son crecientes');
  assert.ok(t.startsWith('\\section{Intro}', pos[0]));
  assert.ok(t.startsWith('\\begin{equation*}', pos[2]));
  assert.notEqual(pos[1], pos[3]); // los dos párrafos idénticos mapean a offsets distintos
});

test('mapearBloques: raw que empieza con salto de línea, figura con pie y bloque sin fragmento', () => {
  const d = { cfg: cfgPorDefecto(), biblio: [], extra: '' };
  const bloques = [
    { id: 'r', orden: 1, t: 'raw', tex: '\n\\vspace{1cm}' },                       // ancla no debe ser la cadena vacía
    { id: 'f', orden: 2, t: 'fig', src: '', nombre: 'x.png', ancho: 50, pie: [{ s: 'Un pie' }], label: 'fig:x', env: 'figure' }, // fragmento multilínea
    { id: 'p', orden: 3, t: 'p', c: [{ s: 'Texto final' }], al: 'j' },
  ];
  const t = generarTex(d, bloques).tex;
  const m = mapearBloques(d, bloques, t);
  assert.ok(t.startsWith('\\vspace{1cm}', m.get('r')), 'el raw ancla en su primera línea no vacía');
  assert.ok(t.startsWith('\\begin{figure}', m.get('f')), 'la figura ancla en \\begin{figure}');
  assert.ok(t.startsWith('Texto final', m.get('p')));
  assert.ok(m.get('r') < m.get('f') && m.get('f') < m.get('p'), 'posiciones crecientes');
});

test('reinterpretar LaTeX avanzado: convierte lo representable y deja crudo lo dependiente de contexto', () => {
  // réplica de la lógica de acciones.js:reinterpretarRaw sobre el modelo (sin DOM)
  const sinIds = (bs) => bs.map(({ id, orden, ...r }) => r);
  const convertible = (texRaw) => {
    const m = parsearTex(docTex(texRaw));
    const u = m.bloques.length === 1 ? m.bloques[0] : null;
    const sigueCrudo = u && (u.t === 'raw' || (u.t === 'p' && (u.c || []).length === 1 && u.c[0].raw != null));
    if (!m.bloques.length || sigueCrudo) return false;
    const regen = generarTex({ cfg: cfgPorDefecto(), biblio: [], extra: '' }, m.bloques).tex;
    let rep; try { rep = parsearTex(regen).bloques; } catch { rep = null; }
    return !!rep && JSON.stringify(sinIds(rep)) === JSON.stringify(sinIds(m.bloques));
  };
  assert.equal(convertible('\\begin{itemize}\n\\item Uno\n\\item Dos\n\\end{itemize}'), true);
  assert.equal(convertible('\\begin{tabular}{cc}\n\\multirow{2}{*}{G} & 1 \\\\\n & 2 \\\\\n\\end{tabular}'), true);
  assert.equal(convertible('Celda A & Celda B \\\\'), false); // fila suelta: depende del contexto, se deja crudo
});

test('itemize: \\item seguido solo de [texto] es el contenido, no una viñeta propia', () => {
  const m = parsearTex(docTex('\\begin{itemize}\n\\item [Ensayo 1: verificar.]\n\\item [Ensayo 2: medir.]\n\\end{itemize}'));
  assert.equal(m.bloques[0].t, 'lista');
  // el corchete es el contenido del elemento; no debe quedar como etiqueta con el texto vacío
  assert.deepEqual(m.bloques[0].items[0], { c: [{ s: '[Ensayo 1: verificar.]' }], n: 0 });
  assert.equal(m.bloques[0].items[0].et, undefined);
  // una etiqueta de verdad (con contenido después) sí se conserva
  const conEt = parsearTex(docTex('\\begin{enumerate}\n\\item[a)] Primero.\n\\end{enumerate}'));
  assert.deepEqual(conEt.bloques[0].items[0], { c: [{ s: 'Primero.' }], n: 0, et: [{ s: 'a)' }] });
  // en description el corchete sigue siendo la etiqueta aunque no haya más texto
  const desc = parsearTex(docTex('\\begin{description}\n\\item[Término]\n\\end{description}'));
  assert.deepEqual(desc.bloques[0].items[0].et, [{ s: 'Término' }]);
});
