// De código LaTeX al modelo. Entiende el subconjunto que genera esta página y los documentos
// habituales (secciones, listas, ecuaciones, tablas, figuras, teoremas, código, citas…).
// Lo que no reconoce se conserva tal cual como «bloque LaTeX» (o texto LaTeX en línea),
// de modo que al volver a generar el .tex no se pierde nada.

import {
  cfgPorDefecto, CLASES, IDIOMAS, ALIAS_TEOREMA, compactar, sanearBloque, sanearCfg, sanearBiblio, nuevoId, EQ_SIN_NUMERO, EQ_FILAS, dividirFilas,
} from './modelo.js?v=2026.11.07-n';
import { SIMBOLOS, ABSTRACT_BOOK, PAQUETES_AUTO, PAQUETES_TARDIOS } from './latex-gen.js?v=2026.11.07-n';
import { tablaMacros } from './macros.js?v=2026.11.07-n';

// \ensuremath{\alpha} → α (lo contrario de lo que hace latex-gen.js con los símbolos Unicode)
const SIMBOLO_DE = new Map(Object.entries(SIMBOLOS).map(([u, cmd]) => [cmd, u]));

// ── Utilidades de texto ─────────────────────────────────────────────────

const esLetra = (c) => /[A-Za-z]/.test(c || '');

/** Lee un grupo {…} equilibrado que empieza en s[i]. */
function grupo(s, i) {
  if (s[i] !== '{') return null;
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '%' ) { const nl = s.indexOf('\n', j); if (nl < 0) break; j = nl; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return { txt: s.slice(i + 1, j), fin: j + 1 }; }
  }
  return null;
}

function opcional(s, i) {
  if (s[i] !== '[') return null;
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === ']' && d === 0) return { txt: s.slice(i + 1, j), fin: j + 1 };
  }
  return null;
}

const saltarEsp = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

function comando(s, i) {
  if (s[i] !== '\\') return null;
  let j = i + 1;
  if (!esLetra(s[j])) return { nombre: s[j] || '', fin: j + 1, simbolo: true };
  while (esLetra(s[j])) j++;
  const nombre = s.slice(i + 1, j);
  let estrella = false;
  if (s[j] === '*') { estrella = true; j++; }
  return { nombre, estrella, fin: j };
}

/** Quita los comentarios que acompañan a una línea (% sin escapar). */
function sinComentarios(s) {
  return s.split('\n').map((l) => {
    for (let k = 0; k < l.length; k++) {
      if (l[k] === '\\') {
        // \verb|…%…| no es un comentario
        const v = /^\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)([^a-zA-Z\s*{])/.exec(l.slice(k, k + 60));
        if (v) { const f = l.indexOf(v[1], k + v[0].length); if (f > 0) { k = f; continue; } }
        k++; continue;
      }
      if (l[k] === '%') return l.slice(0, k).replace(/\s+$/, '');
    }
    return l;
  }).join('\n');
}

/** Busca el \end{nombre} que cierra un \begin{nombre} cuyo cuerpo empieza en `desde`. */
function cerrarEntorno(s, nombre, desde) {
  const re = new RegExp(`\\\\(begin|end)\\{${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g');
  re.lastIndex = desde;
  let d = 1, m;
  while ((m = re.exec(s))) {
    if (m[1] === 'begin') d++;
    else { d--; if (d === 0) return { cuerpo: s.slice(desde, m.index), fin: m.index + m[0].length }; }
  }
  return null;
}

/** Lee \begin{nombre}[opc]{…}… en s[i]. */
function entorno(s, i) {
  const m = /^\\begin\{([^}]+)\}/.exec(s.slice(i, i + 80));
  if (!m) return null;
  const nombre = m[1];
  let j = i + m[0].length;
  // en los entornos literales (código) no hay anidamiento: termina en el primer \end{…}
  const literal = /^(lstlisting|verbatim\*?|Verbatim|minted|comment)$/.test(nombre);
  const f = literal ? s.indexOf(`\\end{${nombre}}`, j) : -1;
  const c = literal ? (f < 0 ? null : { cuerpo: s.slice(j, f), fin: f + nombre.length + 6 }) : cerrarEntorno(s, nombre, j);
  if (!c) return null;
  return { nombre, cuerpoCompleto: c.cuerpo, fin: c.fin, raw: s.slice(i, c.fin), inicioCuerpo: j };
}

// ── Texto en línea ──────────────────────────────────────────────────────

const ACENTOS = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄' };
const MARCA_CMD = { textbf: 'b', textit: 'i', emph: 'i', underline: 'u', texttt: 'c', sout: 'st', textsuperscript: 'sup', textsubscript: 'sub', textrm: null, textnormal: null, mbox: null };

function pegarTexto(nodos, buf, marcas) {
  if (buf) nodos.push({ s: buf, ...marcas });
}

export function parsearInline(src, marcas = {}) {
  const nodos = [];
  let buf = '';
  const vaciar = () => { pegarTexto(nodos, buf, marcas); buf = ''; };
  const s = src;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === '\\') { vaciar(); nodos.push({ br: 1 }); i += 2; while (s[i] === ' ' || s[i] === '\n') i++; const o = opcional(s, saltarEsp(s, i)); if (o && /^[\d.]+\s*(pt|mm|cm|em|ex)$/.test(o.txt.trim()) && saltarEsp(s, i) === i) i = o.fin; continue; }
      if ('%&$#_{}'.includes(n)) { buf += n; i += 2; continue; }
      if (n === ' ') { buf += ' '; i += 2; continue; }
      if (n === '(') {
        const f = s.indexOf('\\)', i + 2);
        if (f > 0) { vaciar(); nodos.push({ mate: s.slice(i + 2, f).trim() }); i = f + 2; continue; }
      }
      if (n && ACENTOS[n]) {
        let letra = null, fin = i + 2;
        if (s[fin] === '{') { const g = grupo(s, fin); if (g && g.txt.length === 1) { letra = g.txt; fin = g.fin; } }
        else if (esLetra(s[fin]) || s[fin] === '\\') {
          if (s[fin] === '\\' && (s[fin + 1] === 'i') && !esLetra(s[fin + 2])) { letra = 'i'; fin += 2; } else if (esLetra(s[fin])) { letra = s[fin]; fin++; }
        }
        if (letra) { buf += (letra + ACENTOS[n]).normalize('NFC'); i = fin; continue; }
      }
      // \verb|…| (el delimitador puede ser cualquier carácter): se conserva entero
      if (s.startsWith('verb', i + 1) && !esLetra(s[i + 5] === '*' ? s[i + 6] : s[i + 5])) {
        const ini = i + 5 + (s[i + 5] === '*' ? 1 : 0);
        const delim = s[ini];
        const f = delim ? s.indexOf(delim, ini + 1) : -1;
        if (f > 0) { vaciar(); nodos.push({ raw: s.slice(i, f + 1) }); i = f + 1; continue; }
      }
      // \lstinline[…]|…| o \lstinline{…}: código en línea, se conserva entero
      if (s.startsWith('lstinline', i + 1) && !esLetra(s[i + 10])) {
        let k = i + 10;
        const op = opcional(s, k); if (op) k = op.fin;
        let f = -1;
        if (s[k] === '{') { const g = grupo(s, k); if (g) f = g.fin - 1; }
        else if (s[k] && !/\s/.test(s[k])) f = s.indexOf(s[k], k + 1);
        if (f > 0) { vaciar(); nodos.push({ raw: s.slice(i, f + 1) }); i = f + 1; continue; }
      }
      // \tikz[…]{…} o \tikz[…] \draw …; — dibujo en línea
      if (s.startsWith('tikz', i + 1) && !esLetra(s[i + 5])) {
        let k = saltarEsp(s, i + 5);
        const op = opcional(s, k); if (op) k = saltarEsp(s, op.fin);
        let f = -1;
        if (s[k] === '{') { const g = grupo(s, k); if (g) f = g.fin; }
        else { const pc = s.indexOf(';', k); if (pc > 0) f = pc + 1; }
        if (f > 0) { vaciar(); nodos.push({ raw: s.slice(i, f) }); i = f; continue; }
      }
      const cm = comando(s, i);
      if (cm && !cm.simbolo) {
        let j = cm.fin;
        const nombre = cm.nombre;
        const arg = () => { const k = saltarEsp(s, j); const g = grupo(s, k); if (g) { j = g.fin; return g.txt; } return null; };
        if (nombre in MARCA_CMD) {
          const a = arg();
          if (a != null) {
            vaciar();
            const m2 = MARCA_CMD[nombre] ? { ...marcas, [MARCA_CMD[nombre]]: 1 } : marcas;
            nodos.push(...parsearInline(a, m2)); i = j; continue;
          }
          // \textbf sin llaves (p. ej. «\textbf Para el desarrollo…»): en la práctica el usuario quiere
          // el formato en el resto del grupo, igual que {\bfseries …}. Se aplica al resto del texto.
          if (MARCA_CMD[nombre]) {
            vaciar();
            const resto = s.slice(saltarEsp(s, j));
            const m2 = { ...marcas, [MARCA_CMD[nombre]]: 1 };
            nodos.push(...parsearInline(resto, m2));
            i = s.length; continue;
          }
        }
        if (nombre === 'ensuremath') {
          const k = saltarEsp(s, j), g = grupo(s, k);
          if (g && SIMBOLO_DE.has(g.txt.trim())) { buf += SIMBOLO_DE.get(g.txt.trim()); i = g.fin; continue; }
        }
        if (nombre === 'footnote') { const a = arg(); if (a != null) { vaciar(); nodos.push({ nota: compactar(parsearInline(a)) }); i = j; continue; } }
        if (/^cite[pt]?$/.test(nombre) || nombre === 'nocite') {
          const op = opcional(s, j); if (op) j = op.fin;
          const a = arg();
          if (a != null && nombre !== 'nocite') { vaciar(); nodos.push({ cita: a.trim() }); i = j; continue; }
        }
        if (nombre === 'ref' || nombre === 'eqref' || nombre === 'autoref' || nombre === 'pageref') {
          const a = arg();
          if (a != null && nombre === 'ref') { vaciar(); nodos.push({ ref: a.trim() }); i = j; continue; }
          if (a != null && nombre === 'eqref') { vaciar(); nodos.push({ ref: a.trim(), eq: 1 }); i = j; continue; }
          if (a != null) { vaciar(); nodos.push({ raw: s.slice(i, j) }); i = j; continue; }
        }
        if (nombre === 'href') {
          const u = arg(), t = arg();
          if (u != null && t != null) { vaciar(); nodos.push({ url: u.replace(/\\([%#&_{}])/g, '$1'), c: compactar(parsearInline(t)) }); i = j; continue; }
        }
        if (nombre === 'url') { const u = arg(); if (u != null) { vaciar(); nodos.push({ url: u, c: [] }); i = j; continue; } }
        if (nombre === 'textbackslash') { arg(); buf += '\\'; i = j; if (s.startsWith('{}', i)) i += 2; continue; }
        if (nombre === 'textasciitilde') { buf += '~'; i = j; if (s.startsWith('{}', i)) i += 2; continue; }
        if (nombre === 'textasciicircum') { buf += '^'; i = j; if (s.startsWith('{}', i)) i += 2; continue; }
        if (nombre === 'ldots' || nombre === 'dots' || nombre === 'textellipsis') { buf += '…'; i = j; if (s.startsWith('{}', i)) i += 2; continue; }
        if (nombre === 'newline') { vaciar(); nodos.push({ br: 1 }); i = j; while (s[i] === ' ' || s[i] === '\n') i++; continue; }
        // comando desconocido: se conserva con sus argumentos
        let k = j;
        for (;;) {
          const k2 = k;
          const sp = s[k] === ' ' ? k + 1 : k;
          const o = opcional(s, sp), g = grupo(s, sp);
          if (o) k = o.fin; else if (g) k = g.fin;
          if (k === k2) break;
        }
        vaciar(); nodos.push({ raw: s.slice(i, k) }); i = k; continue;
      }
      // símbolo de control no reconocido (\, \; \! \- …)
      vaciar(); nodos.push({ raw: s.slice(i, i + 2) }); i += 2; continue;
    }
    if (c === '$') {
      const dob = s[i + 1] === '$';
      const cierre = s.indexOf(dob ? '$$' : '$', i + (dob ? 2 : 1));
      if (cierre > 0) { vaciar(); nodos.push({ mate: s.slice(i + (dob ? 2 : 1), cierre).trim() }); i = cierre + (dob ? 2 : 1); continue; }
    }
    if (c === '{') {
      const g = grupo(s, i);
      if (g) {
        if (!/[\\$]/.test(g.txt)) { buf += g.txt; i = g.fin; continue; }
        vaciar(); nodos.push({ raw: s.slice(i, g.fin) }); i = g.fin; continue;
      }
    }
    if (c === '~') { buf += ' '; i++; continue; }
    if (c === '`' && s[i + 1] === '`') { buf += '“'; i += 2; continue; }
    if (c === "'" && s[i + 1] === "'") { buf += '”'; i += 2; continue; }
    if (c === '\n' || c === '\t' || c === '\r') { if (!buf.endsWith(' ')) buf += ' '; i++; continue; }
    if (c === ' ') { if (!buf.endsWith(' ')) buf += ' '; i++; continue; }
    buf += c; i++;
  }
  vaciar();
  return nodos;
}

const inlineLimpio = (s) => {
  const c = compactar(parsearInline(sinComentarios(s)));
  // recorta espacios en los extremos
  while (c.length && c[0].s != null && /^\s+$/.test(c[0].s)) c.shift();
  if (c.length && c[0].s != null) c[0].s = c[0].s.replace(/^\s+/, '');
  while (c.length && c[c.length - 1].s != null && /^\s+$/.test(c[c.length - 1].s)) c.pop();
  if (c.length && c[c.length - 1].s != null) c[c.length - 1].s = c[c.length - 1].s.replace(/\s+$/, '');
  return c;
};

// ── Bloques ─────────────────────────────────────────────────────────────

const SECCIONES = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };

function sacarEtiqueta(t) {
  let label = '';
  const out = t.replace(/\\label\{([^}]*)\}/g, (m, l) => { if (!label) label = l.trim(); return ''; });
  return { texto: out, label };
}

/**
 * Elementos de una lista. Con `estricto` devuelve false si la lista tiene algo que el modelo no puede
 * representar sin perderlo (otra clase de lista anidada, texto después de una sublista, más de tres
 * niveles, contenido antes del primer \item): entonces se conserva como LaTeX avanzado.
 */
function parsearItems(cuerpo, nivel, items, env = 'itemize', estricto = true) {
  // trozos separados por \item de nivel superior
  const trozos = [];
  let i = 0, ini = -1;
  while (i < cuerpo.length) {
    if (cuerpo.startsWith('\\begin{', i)) { const e = entorno(cuerpo, i); if (e) { i = e.fin; continue; } }
    if (cuerpo.startsWith('\\item', i) && !esLetra(cuerpo[i + 5])) {
      if (ini >= 0) trozos.push(cuerpo.slice(ini, i));
      ini = i + 5; i += 5; continue;
    }
    i++;
  }
  if (ini >= 0) trozos.push(cuerpo.slice(ini));
  const antes = ini >= 0 ? cuerpo.slice(0, cuerpo.search(/\\item(?![a-zA-Z])/)) : cuerpo;
  if (estricto && sinComentarios(antes).trim()) return false;
  if (estricto && nivel > 4) return false;
  for (let t of trozos) {
    let et = null;
    // \item[etiqueta]: LaTeX también lo lee así aunque haya un espacio antes del corchete.
    // En description la etiqueta es lo habitual. En itemize/enumerate, en cambio, un \item seguido
    // solo de «[texto]» casi siempre es el contenido del elemento (p. ej. «[Ensayo 1: …]»), no una
    // viñeta propia: tomarlo como etiqueta dejaría el elemento sin texto. Por eso aquí solo se trata
    // como etiqueta si es una lista de descripción o si después del corchete queda contenido real.
    const o = opcional(t, saltarEsp(t, 0));
    if (o && (env === 'description' || sinComentarios(t.slice(o.fin)).trim())) {
      et = inlineLimpio(o.txt.replace(/^\{([\s\S]*)\}$/, '$1')); t = t.slice(o.fin);
    }
    // separar listas anidadas
    let texto = '', resto = '';
    let k = 0, anidadas = [];
    while (k < t.length) {
      const m = /^\\begin\{(itemize|enumerate|description)\}/.exec(t.slice(k, k + 30));
      if (m) { const e = entorno(t, k); if (e) { anidadas.push(e); k = e.fin; continue; } }
      if (anidadas.length) resto += t[k]; else texto += t[k];
      k++;
    }
    if (estricto && (anidadas.some((a) => a.nombre !== env) || sinComentarios(resto).trim())) return false;
    const c = inlineLimpio(texto + (resto.trim() ? ' ' + resto : ''));
    const it = { c, n: Math.min(nivel, 4) };
    if (et) it.et = et;
    items.push(it);
    for (const a of anidadas) if (parsearItems(a.cuerpoCompleto, nivel + 1, items, env, estricto) === false) return false;
  }
  return true;
}

/** Parte `s` en piezas separadas por `sep` (nivel superior: fuera de llaves y de entornos). */
function dividirNivel(s, sep) {
  const out = [];
  let d = 0, ini = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (sep === '\\\\' && s[i + 1] === '\\' && d === 0) { out.push(s.slice(ini, i)); i++; ini = i + 1; continue; }
      i++; continue;
    }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (sep === '&' && c === '&' && d === 0) { out.push(s.slice(ini, i)); ini = i + 1; }
  }
  out.push(s.slice(ini));
  return out;
}

// Celda con saltos de línea, tal como la escribe latex-gen.js: {\begin{tabular}[t]{@{}l@{}}a\\ b\end{tabular}}
const CELDA_MULTI = /^(\\textbf\{)?\{\\begin\{tabular\}\[t\]\{@\{\}[lcr]@\{\}\}([\s\S]*)\\end\{tabular\}\}(\})?$/;
function celdaLimpia(c) {
  const m = CELDA_MULTI.exec(c.trim());
  if (!m || !!m[1] !== !!m[3]) return inlineLimpio(c);
  const n = inlineLimpio(m[2]);
  return m[1] ? n.map((x) => (x.s != null ? { ...x, b: 1 } : x)) : n;
}

/**
 * Lee un preámbulo de columnas de tabular/tabularx/array y devuelve la alineación por columna (l/c/r).
 * Entiende: l c r, p{…}/m{…}/b{…} (→l), X de tabularx (→l), >{…}/<{…}/@{…}/!{…} (se ignoran, no son
 * columnas), barras | y *{n}{…} (repetición). Devuelve null si encuentra algo que no sabe leer.
 */
function alineacionesSpec(spec) {
  // *{3}{c} → ccc (repetición de enumitem/array)
  let s = spec;
  for (let i = 0; i < 6; i++) {
    const m = /\*\{\s*(\d+)\s*\}\s*\{/.exec(s);
    if (!m) break;
    const g = grupo(s, m.index + m[0].length - 1);
    if (!g) return null;
    s = s.slice(0, m.index) + g.txt.repeat(Math.min(+m[1], 50)) + s.slice(g.fin);
  }
  const al = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === 'l' || ch === 'c' || ch === 'r') { al.push(ch); i++; continue; }
    if (ch === 'p' || ch === 'm' || ch === 'b') { // p{..}/m{..}/b{..}: columna de ancho fijo → se alinea a la izquierda
      const g = grupo(s, saltarEsp(s, i + 1));
      if (!g) return null;
      al.push(ch === 'm' ? 'c' : 'l'); i = g.fin; continue;
    }
    if (ch === 'X') { al.push('l'); i++; continue; } // tabularx
    if (ch === '>' || ch === '<' || ch === '@' || ch === '!') { // decoradores de columna: se descartan
      const g = grupo(s, saltarEsp(s, i + 1));
      if (!g) return null;
      i = g.fin; continue;
    }
    if (ch === '|' || /\s/.test(ch)) { i++; continue; }
    return null; // algo desconocido
  }
  return al.length ? al : null;
}

// Lee un comando que ocupa toda la celda y tiene tres argumentos obligatorios.
function tresGruposCelda(src, nombre) {
  const t = src.trim();
  const m = new RegExp(`^\\\\${nombre}(?![a-zA-Z])`).exec(t);
  if (!m) return null;
  let i = saltarEsp(t, m[0].length);
  const a = grupo(t, i); if (!a) return null;
  i = saltarEsp(t, a.fin); const b = grupo(t, i); if (!b) return null;
  i = saltarEsp(t, b.fin); const c = grupo(t, i); if (!c || saltarEsp(t, c.fin) !== t.length) return null;
  return [a.txt, b.txt, c.txt];
}

/** Celda con posible multicolumn/multirow, incluso anidados. */
function celdaConSpan(txt) {
  let contenido = txt.trim(), colspan = 1, rowspan = 1, al = '', spec = '', anchoFila = '';
  for (let n = 0; n < 3; n++) {
    const mc = tresGruposCelda(contenido, 'multicolumn');
    if (mc) {
      const k = Number(mc[0]); if (!Number.isInteger(k) || k < 1 || k > 20) return null;
      colspan = k; spec = mc[1];
      const ali = alineacionesSpec(spec); al = (ali && ali[0]) || 'l'; contenido = mc[2]; continue;
    }
    const mr = tresGruposCelda(contenido, 'multirow');
    if (mr) {
      const k = Number(mr[0]); if (!Number.isInteger(k) || k < 1 || k > 100) return null;
      rowspan = k; anchoFila = mr[1]; contenido = mr[2]; continue;
    }
    break;
  }
  const c = celdaLimpia(contenido);
  if (colspan === 1 && rowspan === 1) return c;
  return { c, ...(colspan > 1 ? { colspan, spec, al } : {}), ...(rowspan > 1 ? { rowspan, anchoFila } : {}) };
}

function parsearTabular(cuerpo, spec, meta = {}) {
  const letras = alineacionesSpec(spec);
  if (!letras) return null;
  // Las reglas parciales (\cline/\cmidrule) todavía no se modelan: se conservaría la tabla como
  // LaTeX avanzado. El espacio extra por fila (\\[2ex]) sí se guarda y se vuelve a emitir.
  if (/\\(?:cline|cmidrule)(?:\([^)]*\))?\{/.test(cuerpo)) return null;
  let borde = /[|]/.test(spec) ? 'completo' : 'ninguno';
  if (/\\toprule|\\midrule/.test(cuerpo)) borde = 'horizontal';
  else if (borde === 'ninguno' && /\\hline/.test(cuerpo)) borde = 'completo';
  const limpio = cuerpo.replace(/\\(hline|toprule|midrule|bottomrule)\b/g, '');
  // Al dividir por «\\», un «[2ex]» queda al inicio del trozo siguiente pero pertenece a la fila que
  // acaba de terminar: se guarda como su espaciado (esp[i]) y se quita del texto de la fila siguiente.
  const trozos = dividirNivel(limpio, '\\\\');
  const esp = [];
  const filasTxt = [];
  trozos.forEach((r, idx) => {
    const m = /^\s*\[([^\]]*)\]/.exec(r);
    if (m && idx > 0) esp[idx - 1] = m[1].trim(); // el espacio pertenece a la fila anterior
    const texto = m ? r.slice(m[0].length).trim() : r.trim();
    filasTxt.push(texto);
  });
  // quita el último trozo vacío (tras el «\\» final) sin perder el alineamiento de `esp`
  while (filasTxt.length && filasTxt[filasTxt.length - 1] === '') { filasTxt.pop(); esp.length = Math.min(esp.length, filasTxt.length); }
  if (!filasTxt.length) return null;
  const cols = letras.length;
  const filas = Array.from({ length: filasTxt.length }, () => Array(cols).fill(null));
  for (let i = 0; i < filasTxt.length; i++) {
    let col = 0;
    for (const raw of dividirNivel(filasTxt[i], '&')) {
      // En la fila cubierta por multirow suele aparecer un & vacío para esa posición: consumirlo.
      if (!raw.trim() && filas[i][col] && filas[i][col].cover) { col++; continue; }
      while (col < cols && filas[i][col] && filas[i][col].cover) col++;
      if (col >= cols) return null;
      const celda = celdaConSpan(raw);
      if (celda == null) return null;
      const cs = Array.isArray(celda) ? 1 : (celda.colspan || 1);
      const rs = Array.isArray(celda) ? 1 : (celda.rowspan || 1);
      if (col + cs > cols || i + rs > filas.length) return null;
      for (let y = i; y < i + rs; y++) for (let x = col; x < col + cs; x++) {
        if (filas[y][x]) return null; // solapamiento ambiguo: conservar la tabla como LaTeX avanzado
      }
      filas[i][col] = celda;
      for (let y = i; y < i + rs; y++) for (let x = col; x < col + cs; x++) if (y !== i || x !== col) filas[y][x] = { cover: [i, col] };
      col += cs;
    }
    while (col < cols) { if (!filas[i][col]) filas[i][col] = []; col++; }
  }
  for (const f of filas) for (let j = 0; j < cols; j++) if (!f[j]) f[j] = [];
  // encabezado: toda la primera fila en negrita
  let enc = false;
  const contenido = (c) => Array.isArray(c) ? c : c && !c.cover ? c.c : [];
  const f0 = filas[0];
  if (f0.every((c) => c && c.cover || !contenido(c).length || contenido(c).every((n) => n.s == null || n.b)) && f0.some((c) => contenido(c).length)) {
    enc = true;
    filas[0] = f0.map((celda) => {
      if (celda && celda.cover) return celda;
      const c = contenido(celda).map((n) => { if (n.s != null && n.b) { const { b, ...r } = n; return r; } return n; });
      return Array.isArray(celda) ? c : { ...celda, c };
    });
  }
  const avanzada = meta.env && meta.env !== 'tabular' || /[pmbX>@<!*]/.test(spec);
  const hayEsp = esp.some((x) => x);
  return { t: 'tabla', filas, enc, al: letras, borde, pie: [], label: '', ...(hayEsp ? { esp } : {}), ...(avanzada ? { spec, ...meta } : {}) };
}

function ambosTabular(cuerpo) {
  // tabular, o tabularx/tabulary (con un argumento de ancho extra antes del spec)
  const m = /\\begin\{(tabular|tabularx|tabulary)\}/.exec(cuerpo);
  if (!m) return null;
  const i = m.index;
  const nombre = m[1];
  const e = entorno(cuerpo, i);
  if (!e) return null;
  let k = saltarEsp(e.cuerpoCompleto, 0), anchoTab = '';
  if (nombre !== 'tabular') { const ga = grupo(e.cuerpoCompleto, k); if (!ga) return null; anchoTab = ga.txt; k = saltarEsp(e.cuerpoCompleto, ga.fin); }
  const g = grupo(e.cuerpoCompleto, k);
  if (!g) return null;
  return { tabla: parsearTabular(e.cuerpoCompleto.slice(g.fin), g.txt, { env: nombre, ...(anchoTab ? { anchoTab } : {}) }), ini: i, fin: e.fin };
}

const sinPosicion = (c) => c.replace(/^\s*\[[a-zA-Z!]*\]/, '');

function parsearFloatTabla(cuerpo) {
  cuerpo = sinPosicion(cuerpo);
  const t = ambosTabular(cuerpo);
  if (!t || !t.tabla) return null;
  const resto = cuerpo.slice(0, t.ini) + cuerpo.slice(t.fin);
  const cap = /\\caption(?:\[[^\]]*\])?\s*\{/.exec(resto);
  let pie = [], label = '', r2 = resto;
  if (cap) {
    const g = grupo(resto, cap.index + cap[0].length - 1);
    if (g) { pie = inlineLimpio(g.txt); r2 = resto.slice(0, cap.index) + resto.slice(g.fin); }
  }
  const { texto, label: l } = sacarEtiqueta(r2);
  label = l;
  const sobrante = texto.replace(/\\(centering|small|footnotesize|large|normalsize)\b/g, '').trim();
  if (sobrante) return null;
  return { ...t.tabla, pie, label };
}

const FIG_PENDIENTE = /\\fbox\{\\parbox\[c\]\[[^\]]*\]\[c\]\{([\d.]+)\\linewidth\}\{\\centering Imagen pendiente\}\}/;

function parsearFigura(cuerpo) {
  cuerpo = sinPosicion(cuerpo);
  let m = /\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]*)\}/.exec(cuerpo);
  if (!m) {
    // recuadro «Imagen pendiente» que genera latex-gen.js para una figura sin imagen
    const p = FIG_PENDIENTE.exec(cuerpo);
    if (!p) return null;
    m = [p[0], `[width=${p[1]}\\linewidth]`, 'imagenes/imagen.png'];
  }
  let resto = cuerpo.replace(m[0], '');
  let pie = [];
  const cap = /\\caption(?:\[[^\]]*\])?\s*\{/.exec(resto);
  if (cap) {
    const g = grupo(resto, cap.index + cap[0].length - 1);
    if (g) { pie = inlineLimpio(g.txt); resto = resto.slice(0, cap.index) + resto.slice(g.fin); }
  }
  const { texto, label } = sacarEtiqueta(resto);
  if (texto.replace(/\\(centering|small|footnotesize|large|normalsize)\b/g, '').trim()) return null;
  let ancho = 70;
  const opc = (m[1] || '').replace(/^\[|\]$/g, '').trim();
  const w = /width\s*=\s*([\d.]+)\s*(\\linewidth|\\textwidth|\\columnwidth|cm|mm|pt)?/.exec(opc);
  if (w) {
    const v = parseFloat(w[1]);
    if (!w[2]) ancho = 100 * v;
    else if (w[2].startsWith('\\')) ancho = 100 * v;
    else if (w[2] === 'cm') ancho = (v / 16) * 100;
    else if (w[2] === 'mm') ancho = (v / 160) * 100;
    else ancho = (v / 453.5) * 100; // 1 pt = 1/72,27 in; 16 cm de ancho útil ≈ 453,5 pt (coherente con la rama cm)
  }
  const ruta = m[2].trim();
  const nombre = ruta.split('/').pop() || 'imagen.png';
  const f = { t: 'fig', src: '', nombre, ancho: Math.round(Math.min(100, Math.max(10, ancho))), pie, label };
  // Lo que no sea «width=0.N\linewidth» se guarda tal cual (escala, alto, cm…), igual que la ruta original
  if (opc && !/^width=(0?\.\d+|1(\.0+)?)\\linewidth$/.test(opc.replace(/\s+/g, ''))) f.opcImg = opc;
  if (ruta !== 'imagenes/' + nombre) f.ruta = ruta;
  return f;
}

/** \begin{tikzpicture}[opc] … \end{tikzpicture}, quizá dentro de \resizebox{N\linewidth}{!}{…}. */
function leerTikz(texto) {
  let t = texto.trim(), ancho = 0;
  const rb = /^\\resizebox\{([\d.]+)\\linewidth\}\{!\}\{%?\s*([\s\S]*?)%?\s*\}$/.exec(t);
  if (rb) { ancho = Math.round(parseFloat(rb[1]) * 100); t = rb[2].trim(); if (!(ancho >= 1 && ancho <= 100)) return null; }
  if (!t.startsWith('\\begin{tikzpicture}')) return null;
  const e = entorno(t, 0);
  if (!e || e.fin !== t.length) return null;
  let cuerpo = e.cuerpoCompleto, opc = '';
  const o = opcional(cuerpo, 0);
  if (o) { opc = o.txt; cuerpo = cuerpo.slice(o.fin); }
  const src = cuerpo.replace(/^[ \t]*\n/, '').replace(/\s+$/, '');
  return { t: 'tikz', libs: [], opc, src, pie: [], ancho, label: '', env: '' };
}

/** Figura con un dibujo TikZ (con pie y etiqueta opcionales). */
function parsearFiguraTikz(cuerpo) {
  cuerpo = sinPosicion(cuerpo);
  const i = cuerpo.search(/\\resizebox\{[^}]*\}\{!\}\{%?\s*\\begin\{tikzpicture\}|\\begin\{tikzpicture\}/);
  if (i < 0) return null;
  let fin;
  if (cuerpo.startsWith('\\resizebox', i)) {
    const a = grupo(cuerpo, i + 10), b = a && grupo(cuerpo, a.fin), c = b && grupo(cuerpo, b.fin);
    if (!c) return null; fin = c.fin;
  } else { const e = entorno(cuerpo, i); if (!e) return null; fin = e.fin; }
  const tk = leerTikz(cuerpo.slice(i, fin));
  if (!tk) return null;
  let resto = cuerpo.slice(0, i) + cuerpo.slice(fin);
  let pie = [];
  const cap = /\\caption\s*\{/.exec(resto);
  if (cap) {
    const g = grupo(resto, cap.index + cap[0].length - 1);
    if (g) { pie = inlineLimpio(g.txt); resto = resto.slice(0, cap.index) + resto.slice(g.fin); }
  }
  const { texto, label } = sacarEtiqueta(resto);
  if (texto.replace(/\\centering\b/g, '').trim()) return null;
  return { ...tk, pie, label, env: 'figure' };
}

// Entornos que pueden ir dentro de una ecuación (MathJax los dibuja)
const MATE_INTERNOS = /^(cases|dcases|rcases|aligned|alignedat|gathered|split|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|array|subarray|substack)\*?$/;

/**
 * Etiqueta de una ecuación. Solo se separa del código si al volver a generarlo queda igual: una etiqueta
 * en la ecuación numerada, o en la primera fila numerada de align/gather/flalign/eqnarray (ahí la pone
 * latex-gen.js). Si hay varias, o está en otra fila, se queda dentro del código.
 */
function etiquetaEq(env, cuerpo, numerada) {
  const labels = [...cuerpo.matchAll(/\\label\{([^}]*)\}/g)];
  if (labels.length !== 1 || !numerada) return { tex: cuerpo.trim(), label: '' };
  if (EQ_FILAS.has(env)) {
    const filas = dividirFilas(cuerpo);
    const k = filas.findIndex((f) => !/\\(nonumber|notag)\b/.test(f));
    const enFila = filas.findIndex((f) => /\\label\{/.test(f));
    if (k !== enFila) return { tex: cuerpo.trim(), label: '' };
  }
  return { tex: cuerpo.replace(/\s*\\label\{[^}]*\}/, '').trim(), label: labels[0][1].trim() };
}

// Comandos de formato que pueden aparecer dentro de una lista antes del primer \item (etiquetas
// personalizadas, contadores, medidas). Se conservan tal cual en `opt` para el round-trip.
const AJUSTE_LISTA = new Set(['renewcommand', 'newcommand', 'providecommand', 'setcounter', 'addtocounter', 'setlength', 'addtolength', 'setlistdepth', 'setitemize', 'setenumerate']);

/** Avanza sobre los comandos de ajuste (y espacios) que preceden al primer \item; devuelve el índice final
 *  (= k si no hay ningún ajuste, para no tocar listas normales). */
function prefijoAjustes(cuerpo, k) {
  let i = saltarEsp(cuerpo, k);
  let capturado = false, fin = i;
  for (;;) {
    if (cuerpo[i] !== '\\') break;
    const cm = comando(cuerpo, i);
    if (!cm || cm.simbolo || !AJUSTE_LISTA.has(cm.nombre)) break;
    let j = cm.fin;
    // consume solo los argumentos entre llaves \cmd{a}{b}… (los comandos de AJUSTE_LISTA no llevan [opcional])
    for (;;) {
      const s2 = saltarEsp(cuerpo, j);
      if (cuerpo[s2] !== '{') break;
      const g = grupo(cuerpo, s2); if (!g) return k; j = g.fin;
    }
    capturado = true; fin = j; i = saltarEsp(cuerpo, j);
  }
  // solo cuenta como prefijo si capturamos algún ajuste y de verdad llegamos a un \item
  if (!capturado) return k;
  return cuerpo.startsWith('\\item', i) && !esLetra(cuerpo[i + 5]) ? fin : k;
}

function bloqueEntorno(e, ctx) {
  const nombre = e.nombre.replace(/\*$/, '');
  const estrella = e.nombre.endsWith('*');
  const cuerpo = e.cuerpoCompleto;
  switch (nombre) {
    case 'itemize': case 'enumerate': case 'description': case 'list': {
      if (estrella) return null;
      // opciones de enumitem [leftmargin=*, …] (o, en `list`, las dos llaves {etiqueta}{ajustes}): se guardan
      // tal cual en `opt` para devolverlas al exportar, y el cuerpo queda como una lista normal.
      let k = 0, opt = '';
      const ini = saltarEsp(cuerpo, 0);
      if (nombre === 'list') {
        const g1 = cuerpo[ini] === '{' ? grupo(cuerpo, ini) : null;
        const g2 = g1 && cuerpo[saltarEsp(cuerpo, g1.fin)] === '{' ? grupo(cuerpo, saltarEsp(cuerpo, g1.fin)) : null;
        if (!g2) return null;
        opt = cuerpo.slice(ini, g2.fin); k = g2.fin;
      } else if (cuerpo[ini] === '[') {
        const o = opcional(cuerpo, ini);
        if (o) { opt = cuerpo.slice(ini, o.fin); k = o.fin; }
      }
      // Ajustes de formato antes del primer \item (p. ej. \renewcommand{\labelenumi}{\alph{enumi})},
      // \setcounter, \setlength): se guardan en `opt` para devolverlos al exportar y la lista se parsea
      // igual. Sin esto, cualquier contenido antes del primer \item degrada toda la lista a raw.
      const pre = prefijoAjustes(cuerpo, k);
      if (pre > k) { opt = (opt ? opt + '\n' : '') + cuerpo.slice(k, pre).trim(); k = pre; }
      const items = [];
      const ok = parsearItems(cuerpo.slice(k), 0, items, nombre, !ctx.vista);
      if (ok === false || !items.length) return null;
      const b = { t: 'lista', ord: nombre === 'enumerate', ...(nombre === 'description' ? { desc: true } : {}), items };
      if (nombre === 'list') b.env = 'list';
      if (opt) b.opt = opt;
      return [b];
    }
    case 'equation': case 'align': case 'gather': case 'multline': case 'flalign': case 'eqnarray': case 'displaymath': case 'math': {
      if (estrella && EQ_SIN_NUMERO.has(nombre)) return null;
      // dentro solo se aceptan entornos matemáticos (cases, pmatrix, aligned…)
      for (const m of cuerpo.matchAll(/\\begin\{([^}]+)\}/g)) if (!MATE_INTERNOS.test(m[1])) return null;
      const num = !estrella && !EQ_SIN_NUMERO.has(nombre);
      const { tex, label } = etiquetaEq(nombre, cuerpo, num);
      return [{ t: 'eq', env: nombre, tex, num, label }];
    }
    case 'tikzpicture': { const tk = leerTikz(e.raw); return tk ? [tk] : null; }
    case 'tabular': case 'tabularx': case 'tabulary': {
      // tabularx/tabulary llevan un argumento de ancho ({\textwidth}) antes del spec de columnas
      let k = saltarEsp(cuerpo, 0), anchoTab = '';
      if (nombre !== 'tabular') { const ga = grupo(cuerpo, k); if (!ga) return null; anchoTab = ga.txt; k = saltarEsp(cuerpo, ga.fin); }
      const g = grupo(cuerpo, k);
      if (!g) return null;
      const t = parsearTabular(cuerpo.slice(g.fin), g.txt, { env: nombre, ...(anchoTab ? { anchoTab } : {}) });
      return t ? [t] : null;
    }
    case 'table': { if (estrella) return null; const t = parsearFloatTabla(cuerpo); return t ? [t] : null; }
    case 'figure': {
      if (estrella) return null;
      if (/\\begin\{tikzpicture\}/.test(cuerpo)) { const tk = parsearFiguraTikz(cuerpo); return tk ? [tk] : null; }
      const f = parsearFigura(cuerpo); return f ? [f] : null;
    }
    case 'lstlisting': case 'verbatim': {
      let lang = '', num = false, src = cuerpo;
      if (nombre === 'lstlisting') {
        const o = opcional(src, 0);
        if (o) { const l = /language\s*=\s*\{?([\w+#]+)/i.exec(o.txt); lang = l ? l[1] : ''; num = /numbers\s*=\s*(left|right)/.test(o.txt); src = src.slice(o.fin); }
      }
      src = src.replace(/^\r?\n/, '').replace(/\s+$/, '').replace(/\\end \{lstlisting\}/g, '\\end{lstlisting}');
      return [{ t: 'cod', lang, src, num }];
    }
    case 'quote': case 'quotation': return [{ t: 'cita', c: inlineLimpio(sinComentarios(cuerpo)) }];
    case 'abstract': return [{ t: 'resumen', c: inlineLimpio(sinComentarios(cuerpo)) }];
    case 'center': case 'flushleft': case 'flushright': {
      if (nombre === 'center') {
        // \begin{center}\includegraphics…\end{center} → figura centrada; un dibujo TikZ → bloque tikz
        const solo = cuerpo.trim();
        const tk = leerTikz(solo);
        if (tk) return [{ ...tk, env: 'center' }];
        if (/^\\includegraphics\s*(\[[^\]]*\])?\s*\{[^}]*\}$/.test(solo)) { const f = parsearFigura(solo); if (f) return [{ ...f, env: 'center' }]; }
      }
      const al = nombre === 'center' ? 'c' : nombre === 'flushleft' ? 'l' : 'r';
      const bl = parsearBloques(cuerpo, ctx);
      if (!bl.length) return null;
      for (const b of bl) if (b.t === 'p') b.al = al;
      return bl;
    }
    case 'thebibliography': {
      const sinPrimero = cuerpo.replace(/^\s*\{[^}]*\}/, '');
      const partes = sinPrimero.split(/\\bibitem/).slice(1);
      for (const p of partes) {
        const k = saltarEsp(p, 0);
        const op = opcional(p, k);
        const g = grupo(p, op ? saltarEsp(p, op.fin) : k);
        if (!g) continue;
        const texto = compactar(parsearInline(p.slice(g.fin))).map((n) => n.s ?? '').join('').trim();
        ctx.biblio.push({ key: g.txt.trim(), texto });
      }
      return [];
    }
    default: {
      const id = ALIAS_TEOREMA[nombre];
      if (id) {
        let c = cuerpo, titulo = '';
        const o = opcional(c, saltarEsp(c, 0));
        if (o && saltarEsp(c, 0) === 0) { titulo = compactar(parsearInline(o.txt)).map((n) => n.s ?? '').join(''); c = c.slice(o.fin); }
        else if (o) { titulo = compactar(parsearInline(o.txt)).map((n) => n.s ?? '').join(''); c = c.slice(o.fin); }
        return [{ t: 'teo', tipo: id, titulo, c: inlineLimpio(sinComentarios(c)) }];
      }
      return null;
    }
  }
}

const RAW_SUELTOS = /^\\(vspace|hspace|bigskip|medskip|smallskip|clearpage|cleardoublepage|centering|hrule|hrulefill|pagebreak|newpage|input|include|bibliographystyle|bibliography|appendix|printbibliography|listoffigures|listoftables|setcounter|pagenumbering|raggedright|vfill|hfill|part|paragraph|subparagraph|usepackage|newcommand|renewcommand|def)\b/;

/** Parte el cuerpo del documento en bloques. */
export function parsearBloques(cuerpo, ctx = { biblio: [], cfg: {} }) {
  const bloques = [];
  let par = '';
  let i = 0;
  const s = cuerpo;
  const vaciar = () => {
    const t = sinComentarios(par).trim();
    par = '';
    if (!t) return;
    const c = inlineLimpio(t);
    // un párrafo que es solo una orden desconocida (\foto{…}, \pendientep{…}…) es un bloque de LaTeX avanzado, no un párrafo con una ficha
    const utiles = c.filter((n) => !(n.s != null && !String(n.s).trim()));
    const orden = utiles.length === 1 && typeof utiles[0].raw === 'string' ? /^\\([a-zA-Z@]+)/.exec(utiles[0].raw) : null;
    if (orden && ctx.macros && ctx.macros.has(orden[1])) { bloques.push({ t: 'raw', tex: utiles[0].raw }); return; }
    bloques.push({ t: 'p', c, al: 'j' });
  };
  const empujar = (b) => { vaciar(); if (Array.isArray(b)) bloques.push(...b); else bloques.push(b); };
  let profundidad = 0;
  let comentarios = [];
  const cerrarComentarios = () => { if (comentarios.length) { bloques.push({ t: 'raw', tex: comentarios.join('\n') }); comentarios = []; } };

  while (i < s.length) {
    const c = s[i];
    const inicioLinea = i === 0 || s[i - 1] === '\n';
    // línea de comentario completa
    if (inicioLinea && profundidad === 0) {
      const fin = s.indexOf('\n', i) < 0 ? s.length : s.indexOf('\n', i);
      const linea = s.slice(i, fin);
      if (/^\s*%/.test(linea)) { vaciar(); comentarios.push(linea.trim()); i = fin + 1; continue; }
      cerrarComentarios();
    }
    // línea en blanco
    if (c === '\n' && profundidad === 0 && /^\n[ \t]*\n/.test(s.slice(i, i + 40).replace(/\r/g, ''))) { vaciar(); i++; continue; }
    if (c === '\\' && profundidad === 0) {
      const cm = comando(s, i);
      const n = cm.nombre;
      if (cm.simbolo && n === '[') {
        const f = s.indexOf('\\]', i + 2);
        if (f > 0) { const { texto, label } = sacarEtiqueta(s.slice(i + 2, f)); empujar({ t: 'eq', env: 'equation', tex: texto.trim(), num: false, label }); i = f + 2; continue; }
      }
      if (!cm.simbolo && n in SECCIONES) {
        let j = cm.fin;
        const o = opcional(s, saltarEsp(s, j)); if (o) j = o.fin;
        const g = grupo(s, saltarEsp(s, j));
        if (g) {
          j = g.fin;
          let label = '';
          const ml = /^\s*\\label\{([^}]*)\}/.exec(s.slice(j));
          if (ml) { label = ml[1].trim(); j += ml[0].length; }
          empujar({ t: 'h', n: SECCIONES[n], c: inlineLimpio(g.txt), num: !cm.estrella, label });
          i = j; continue;
        }
      }
      if (n === 'begin') {
        const e = entorno(s, i);
        if (e) {
          const r = bloqueEntorno(e, ctx);
          if (r) { empujar(r); i = e.fin; continue; }
          empujar({ t: 'raw', tex: e.raw }); i = e.fin; continue;
        }
      }
      // \resizebox{N\linewidth}{!}{…tikzpicture…} suelto: un dibujo con tamaño
      if (n === 'resizebox' && !par.trim()) {
        const a1 = grupo(s, saltarEsp(s, cm.fin)), a2 = a1 && grupo(s, saltarEsp(s, a1.fin)), a3 = a2 && grupo(s, saltarEsp(s, a2.fin));
        const tk = a3 && leerTikz(s.slice(i, a3.fin));
        if (tk) { empujar(tk); i = a3.fin; continue; }
      }
      if (n === 'newpage' || n === 'clearpage') { empujar({ t: 'salto' }); i = cm.fin; continue; }
      if (n === 'tableofcontents') { empujar({ t: 'toc' }); i = cm.fin; continue; }
      if (n === 'maketitle') { ctx.cfg.mostrarTitulo = true; vaciar(); i = cm.fin; continue; }
      if (!cm.simbolo && RAW_SUELTOS.test(s.slice(i, i + 40)) && !par.trim()) {
        // línea completa con un comando suelto: se conserva como bloque
        const fin = s.indexOf('\n', i) < 0 ? s.length : s.indexOf('\n', i);
        const linea = s.slice(i, fin);
        empujar({ t: 'raw', tex: linea.trim() }); i = fin + 1; continue;
      }
    }
    if (c === '$' && s[i + 1] === '$' && profundidad === 0) {
      const f = s.indexOf('$$', i + 2);
      if (f > 0) { const { texto, label } = sacarEtiqueta(s.slice(i + 2, f)); empujar({ t: 'eq', env: 'equation', tex: texto.trim(), num: false, label }); i = f + 2; continue; }
    }
    if (c === '$') { // matemática en línea: se copia entera
      const f = s.indexOf('$', i + 1);
      if (f > 0) { par += s.slice(i, f + 1); i = f + 1; continue; }
    }
    if (c === '\\') { // comando dentro de un párrafo: copiar con su siguiente carácter para no confundir \{ o \%
      par += s.slice(i, i + 2); i += 2; continue;
    }
    if (c === '{') profundidad++;
    else if (c === '}') profundidad = Math.max(0, profundidad - 1);
    par += c; i++;
  }
  vaciar();
  cerrarComentarios();
  return bloques;
}

// ── Preámbulo ───────────────────────────────────────────────────────────

const PAQUETES_PROPIOS = new Set(['inputenc', 'fontenc', 'lmodern', 'microtype', 'babel', 'tikz', 'amsmath', 'amssymb', 'amsthm', 'amsfonts', 'graphicx', 'booktabs', 'ulem', 'setspace', 'listings', 'hyperref', 'geometry']);

/** Salta espacios y tabuladores, pero no el cambio de línea. */
const saltarEspLinea = (s, i) => { while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++; return i; };

function parsearPreambulo(pre, cfg, ctx) {
  const extra = [];
  // El «preámbulo propio» que escribe latex-gen.js se conserva tal cual (ni se reordena ni se depura)
  let literal = '';
  pre = pre.replace(/^% --- Preámbulo propio ---\n([\s\S]*?)\n% ---[ \t]*$/m, (m, x) => { literal = x.trim(); return ''; });
  // líneas que añade latex-gen.js por su cuenta (se vuelven a generar si hacen falta)
  pre = pre.split('\n').filter((l) => !ABSTRACT_BOOK.includes(l.trim())).join('\n');
  let i = 0;
  while (i < pre.length) {
    i = saltarEsp(pre, i);
    if (i >= pre.length) break;
    if (pre[i] === '%') {
      // los separadores «% --- Preámbulo propio ---» y «% ---» los pone latex-gen.js
      const nl = pre.indexOf('\n', i); const linea = pre.slice(i, nl < 0 ? pre.length : nl).trim();
      if (!/^% ?---/.test(linea)) extra.push(linea);
      i = nl < 0 ? pre.length : nl + 1; continue;
    }
    if (pre[i] !== '\\') { const nl = pre.indexOf('\n', i); extra.push(pre.slice(i, nl < 0 ? pre.length : nl).trim()); i = nl < 0 ? pre.length : nl + 1; continue; }
    const ini = i;
    const cm = comando(pre, i);
    let j = cm.fin;
    const opciones = [];
    const argumentos = [];
    const conocidos = { documentclass: 1, usepackage: 1, title: 1, author: 1, date: 1, newtheorem: 2, theoremstyle: 1, setstretch: 1, pagestyle: 1, lstset: 1, onehalfspacing: 0, doublespacing: 0, singlespacing: 0 };
    // Los comandos desconocidos se conservan con todos sus argumentos de la misma línea (\definecolor{a}{RGB}{…})
    const desconocido = !(cm.nombre in conocidos);
    const maxArgs = desconocido ? 9 : conocidos[cm.nombre];
    if (cm.nombre === 'newcommand' || cm.nombre === 'renewcommand' || cm.nombre === 'DeclareMathOperator' || cm.nombre === 'def') {
      // se conservan completos: nombre + (opcionales) + cuerpo
      let k = j;
      for (let n = 0; n < 4; n++) {
        const k2 = saltarEsp(pre, k);
        const o = opcional(pre, k2), g = grupo(pre, k2);
        if (o) k = o.fin; else if (g) { k = g.fin; if (cm.nombre !== 'newcommand' && cm.nombre !== 'renewcommand') { if (n >= 1) break; } else if (n >= 1 && !/^\s*\[/.test(pre.slice(k, k + 5))) break; } else if (cm.nombre === 'def') { const nl = pre.indexOf('\n', k2); k = nl < 0 ? pre.length : nl; break; } else break;
      }
      extra.push(pre.slice(ini, k).trim()); i = k; continue;
    }
    for (;;) {
      // los argumentos pueden ir en otra línea solo en los comandos conocidos y antes del primero
      const k = desconocido || argumentos.length ? saltarEspLinea(pre, j) : saltarEsp(pre, j);
      const o = opcional(pre, k);
      // \newtheorem{lemma}[theorem]{Lema} y \newtheorem{teo}{Teorema}[section] llevan opcionales entre argumentos
      if (o && (!argumentos.length || cm.nombre === 'newtheorem' || desconocido)) { opciones.push(o.txt); j = o.fin; continue; }
      const g = grupo(pre, k);
      if (g && argumentos.length < maxArgs) { argumentos.push(g.txt); j = g.fin; continue; }
      break;
    }
    const raw = pre.slice(ini, j);
    const opt = opciones.join(',');
    const a0 = (argumentos[0] || '').trim();
    switch (cm.nombre) {
      case 'documentclass': {
        if (CLASES.some(([v]) => v === a0)) cfg.clase = a0; else ctx.avisos.push(`La clase «${a0}» no está soportada; se usó «article». Revisa el resultado.`);
        for (const o of opt.split(',').map((x) => x.trim())) {
          const m = /^(\d+)pt$/.exec(o);
          if (m && [10, 11, 12].includes(+m[1])) cfg.fuente = +m[1];
          else if (o === 'a4paper' || o === 'letterpaper') cfg.papel = o;
          else if (o === 'twocolumn') cfg.columnas = 2;
        }
        break;
      }
      case 'usepackage': {
        const pks = a0.split(',').map((x) => x.trim());
        if (pks.length === 1 && pks[0] === 'babel') {
          const lang = IDIOMAS.map(([v]) => v).concat(['ngerman']).find((l) => new RegExp(`\\b${l}\\b`).test(opt));
          if (lang) cfg.idioma = lang === 'ngerman' ? 'german' : lang; else extra.push(raw.trim());
        } else if (pks.length === 1 && pks[0] === 'geometry') {
          const mm = /(?:^|,)\s*margin\s*=\s*([\d.]+)\s*cm/.exec(opt);
          const resto = opt.replace(/margin\s*=\s*[\d.]+\s*cm/, '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'a4paper' && x !== 'letterpaper');
          if (mm && !resto.length) cfg.margen = +mm[1]; else { cfg.margen = 'extra'; extra.push(raw.trim()); }
        } else if (pks.every((p) => PAQUETES_PROPIOS.has(p))) { /* se vuelve a generar */ }
        else if (!opt && pks.every((p) => PAQUETES_AUTO.includes(p) || PAQUETES_TARDIOS.includes(p))) { /* se vuelve a generar si hace falta */ }
        else extra.push(raw.trim());
        break;
      }
      case 'title': cfg.titulo = compactar(parsearInline(argumentos[0] || '')).map((n) => n.s ?? (n.br ? ' ' : '')).join('').replace(/\s+/g, ' ').trim(); break;
      case 'author': cfg.autor = compactar(parsearInline((argumentos[0] || '').replace(/\s*\\and\b\s*/g, ', '))).map((n) => n.s ?? (n.br ? ', ' : '')).join('').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim(); break;
      case 'date': cfg.fecha = a0 === '' ? 'ninguna' : (a0 === '\\today' ? '' : compactar(parsearInline(argumentos[0])).map((n) => n.s ?? '').join('')); break;
      case 'newtheorem': if (!ALIAS_TEOREMA[a0]) extra.push(raw.trim()); break;
      case 'theoremstyle': break;
      case 'setstretch': cfg.interlineado = parseFloat(a0) || 1; break;
      case 'onehalfspacing': cfg.interlineado = 1.5; break;
      case 'doublespacing': cfg.interlineado = 2; break;
      case 'singlespacing': cfg.interlineado = 1; break;
      case 'pagestyle': if (a0 === 'empty') cfg.numPag = false; else extra.push(raw.trim()); break;
      case 'lstset': if (!/literate/.test(raw)) extra.push(raw.trim()); break;
      case 'usetikzlibrary': {
        // si el documento tiene bloques TikZ las librerías pasan a ellos (parsearTex); si no, se quedan aquí
        const linea = raw.trim();
        extra.push(linea);
        ctx.tikzLibs.push({ linea, libs: a0.split(',').map((x) => x.trim()).filter(Boolean) });
        break;
      }
      case 'hypersetup': {
        // pdftitle y pdfauthor salen del título y el autor; lo demás se conserva
        const claves = a0.replace(/\{[^{}]*\}/g, '').split(',').map((x) => x.split('=')[0].trim()).filter(Boolean);
        if (!claves.every((k) => k === 'pdftitle' || k === 'pdfauthor')) extra.push(raw.trim());
        break;
      }
      default: extra.push(raw.trim());
    }
    i = j;
  }
  return { extra: extra.filter(Boolean).join('\n'), literal };
}

/**
 * @param {string} src  código LaTeX (documento completo o solo el cuerpo)
 * @returns {{ cfg, biblio, extra, bloques, avisos }}
 */
export function parsearTex(src) {
  const avisos = [];
  const cfg = cfgPorDefecto();
  const ctx = { biblio: [], cfg, avisos, tikzLibs: [] };
  src = String(src || '').replace(/\r\n?/g, '\n');
  const ini = src.indexOf('\\begin{document}');
  const fin = src.lastIndexOf('\\end{document}');
  let pre = '', cuerpo = src;
  if (ini >= 0) {
    pre = src.slice(0, ini);
    cuerpo = src.slice(ini + '\\begin{document}'.length, fin > ini ? fin : src.length);
    cfg.mostrarTitulo = false;
    cfg.margen = 'extra';
  } else cfg.margen = cfgPorDefecto().margen;
  const { extra, literal } = ini >= 0 ? parsearPreambulo(pre, cfg, ctx) : { extra: '', literal: '' };
  ctx.macros = new Set(tablaMacros(extra + '\n' + literal).keys());   // órdenes propias: una línea que es solo \foto{…} es un bloque, no un párrafo
  const bloques = parsearBloques(cuerpo, ctx).map((b) => sanearBloque(b)).filter(Boolean);
  // sin título no se genera \maketitle: eso no significa que la portada esté desactivada
  if (!cfg.titulo) cfg.mostrarTitulo = true;
  let extraFinal = extra;
  // latex-gen.js carga xcolor junto con listings: si se va a cargar listings, el xcolor sin opciones sobra
  const conListings = bloques.some((b) => b.t === 'cod') || /\\(lstinline|lstinputlisting)\b|\\begin\{lstlisting\}/.test(JSON.stringify(bloques) + literal);
  if (conListings) extraFinal = extra.split('\n').filter((l) => l.trim() !== '\\usepackage{xcolor}').join('\n');
  const tikz = bloques.filter((b) => b.t === 'tikz');
  if (tikz.length && ctx.tikzLibs.length) {
    const libs = [...new Set(ctx.tikzLibs.flatMap((x) => x.libs))];
    for (const b of tikz) b.libs = [...new Set([...libs, ...b.libs])];
    const lineas = new Set(ctx.tikzLibs.map((x) => x.linea));
    extraFinal = extraFinal.split('\n').filter((l) => !lineas.has(l.trim())).join('\n');
  }
  extraFinal = [extraFinal, literal].filter(Boolean).join('\n');
  return {
    cfg: sanearCfg(cfg), biblio: sanearBiblio(ctx.biblio), extra: extraFinal, avisos,
    bloques: bloques.map((b) => ({ ...b, id: nuevoId() })),
  };
}
