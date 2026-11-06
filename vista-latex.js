// Vistas previas de lo que el editor conserva como «LaTeX avanzado»: bloques crudos y fragmentos en línea.
// No editan nada: muestran cómo quedará al compilar, y el código sigue siendo la fuente de verdad.
//
// Las funciones puras (texParaKatex, tipoVistaRaw) también se usan en Node (pruebas, aviso al importar).

import { parsearBloques, parsearInline } from './latex-parse.js?v=2026.11.05-a';
import { colorCss, tikzSvg } from './tikz.js?v=2026.11.05-a';

// ── Puras ──────────────────────────────────────────────────────────────

const ENV_MATE = /^(equation|align|gather|multline|flalign|eqnarray|alignat|displaymath|math|xalignat)\*?$/;

/** Código de una ecuación de bloque → lo que entiende KaTeX (sin \label, \nonumber ni \notag). */
export function texParaKatex(env, tex, arg = '') {
  let t = String(tex || '').replace(/\\label\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '');
  const e = String(env || 'equation').replace(/\*$/, '');
  if (e === 'align' || e === 'flalign' || e === 'eqnarray' || e === 'xalignat') return `\\begin{aligned}${t.replace(/\\tag\*?\{[^}]*\}/g, '')}\\end{aligned}`;
  if (e === 'alignat') return `\\begin{alignedat}{${arg || 1}}${t.replace(/\\tag\*?\{[^}]*\}/g, '')}\\end{alignedat}`;
  if (e === 'gather' || e === 'multline') return `\\begin{gathered}${t.replace(/\\tag\*?\{[^}]*\}/g, '')}\\end{gathered}`;
  return t;
}

const UN_COMANDO = /^\\([a-zA-Z]+)\*?\s*(\[[^\]]*\])?\s*(\{[^{}]*\})?\s*$/;
const ARCHIVOS = new Set(['input', 'include', 'bibliography', 'bibliographystyle', 'printbibliography', 'addbibresource', 'includeonly']);
const ESPACIOS = new Set(['vspace', 'bigskip', 'medskip', 'smallskip', 'vfill', 'addvspace']);
const REGLAS = new Set(['hrule', 'rule', 'hrulefill']);
const AJUSTES = new Set(['newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment', 'def', 'setcounter', 'addtocounter', 'setlength',
  'addtolength', 'pagenumbering', 'pagestyle', 'thispagestyle', 'centering', 'raggedright', 'raggedleft', 'appendix', 'listoffigures', 'listoftables',
  'clearpage', 'cleardoublepage', 'pagebreak', 'nopagebreak', 'linebreak', 'noindent', 'part', 'paragraph', 'subparagraph', 'maketitle', 'tableofcontents',
  'hfill', 'hspace', 'usepackage', 'graphicspath', 'DeclareMathOperator', 'makeatletter', 'makeatother', 'frontmatter', 'mainmatter', 'backmatter', 'onecolumn', 'twocolumn']);

/**
 * Qué vista previa tendrá un bloque crudo (sin tocar el DOM). null = ninguna: se muestra el código.
 * 'mate' | 'tabla' | 'tikz' | 'entorno' | 'regla' | 'espacio' | 'archivo' | 'ajuste' | 'comentario'
 */
export function tipoVistaRaw(tex) {
  const t = String(tex || '').trim();
  if (!t) return null;
  if (t.split('\n').every((l) => /^\s*%/.test(l) || !l.trim())) return 'comentario';
  if (/^\\\[[\s\S]*\\\]$/.test(t) || /^\$\$[\s\S]*\$\$$/.test(t)) return 'mate';
  const be = /^\\begin\{([^}]+)\}/.exec(t);
  if (be && t.endsWith(`\\end{${be[1]}}`)) {
    if (ENV_MATE.test(be[1])) return 'mate';
    if (be[1] === 'tikzpicture') return 'tikz';
    // tablas (y flotantes de tabla); una figura con una tabla dentro se muestra como entorno
    if (/^(table\*?|tabular\*?|tabularx|longtable|tabulary|array)$/.test(be[1]) && /\\begin\{(tabular\*?|tabularx|longtable|array|tabulary)\}/.test(t)) return 'tabla';
    if (/^(lstlisting|verbatim\*?|Verbatim|minted|comment)$/.test(be[1])) return null;
    return 'entorno';
  }
  const m = UN_COMANDO.exec(t);
  if (m) {
    if (ARCHIVOS.has(m[1])) return 'archivo';
    if (ESPACIOS.has(m[1])) return 'espacio';
    if (REGLAS.has(m[1])) return 'regla';
    if (AJUSTES.has(m[1])) return 'ajuste';
  }
  // varias líneas de comandos sueltos de configuración (\newcommand…, \setlength…)
  const lineas = t.split('\n').filter((l) => l.trim() && !/^\s*%/.test(l));
  if (lineas.length && lineas.every((l) => { const c = /^\s*\\([a-zA-Z]+)/.exec(l); return c && (AJUSTES.has(c[1]) || ESPACIOS.has(c[1]) || REGLAS.has(c[1])); })) return 'ajuste';
  if (/^\\(paragraph|subparagraph|part)\*?\{/.test(t)) return 'ajuste';
  return null;
}

/** Texto del aviso al importar un .tex: cuántos bloques quedaron como LaTeX avanzado y cuántos se ven. */
export function resumenImportacion(bloques) {
  const raw = bloques.filter((b) => b.t === 'raw' && tipoVistaRaw(b.tex) !== 'comentario');
  const comentarios = bloques.filter((b) => b.t === 'raw').length - raw.length;
  const conVista = raw.filter((b) => tipoVistaRaw(b.tex)).length;
  let t = `Documento importado: ${bloques.length} bloque(s).`;
  if (!raw.length) t += ' Todo se puede editar visualmente.';
  else {
    t += ` ${raw.length} quedaron como LaTeX avanzado (se conservan tal cual)`;
    t += conVista === raw.length ? ', todos con vista previa.' : conVista ? `; ${conVista} con vista previa y ${raw.length - conVista} solo como código.` : ', solo como código.';
  }
  if (comentarios) t += ` ${comentarios} comentario(s) conservados.`;
  return t;
}

// ── DOM ────────────────────────────────────────────────────────────────

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const K = () => (typeof window !== 'undefined' ? window.katex : null);

function mate(tex, display = true) {
  const e = el(display ? 'div' : 'span', display ? 'rv-mate' : '');
  const katex = K();
  if (katex) { try { katex.render(tex, e, { throwOnError: false, displayMode: display, output: 'html', strict: 'ignore', trust: false }); return e; } catch { /* sigue */ } }
  e.textContent = tex;
  return e;
}

/** Pinta nodos inline sin depender de inline-dom.js (evita un ciclo de importaciones). */
let pintarInlineFn = null;
export function usarPintorInline(fn) { pintarInlineFn = fn; }
const inline = (nodos) => (pintarInlineFn ? pintarInlineFn(nodos) : document.createTextNode(nodos.map((n) => n.s || '').join('')));
const inlineTex = (tex) => inline(parsearInline(String(tex)));

/** Lee el argumento {…} que empieza en s[i] (con llaves equilibradas). */
function arg(s, i) {
  while (s[i] === ' ' || s[i] === '\n') i++;
  if (s[i] !== '{') return null;
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '{') d++;
    else if (s[j] === '}' && --d === 0) return { txt: s.slice(i + 1, j), fin: j + 1 };
  }
  return null;
}
function opc(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] !== '[') return null;
  const f = s.indexOf(']', i);
  return f < 0 ? null : { txt: s.slice(i + 1, f), fin: f + 1 };
}

/** Longitud de LaTeX → px de pantalla (para \vspace, \hspace, minipage…). */
function aPx(txt, ancho = 600) {
  const m = /(-?[\d.]+)\s*(cm|mm|pt|in|em|ex|bp|\\(?:line|text|column)width|\\linewidth)?/.exec(String(txt));
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = m[2] || 'pt';
  if (/width/.test(u)) return v * ancho;
  return v * ({ cm: 37.8, mm: 3.78, pt: 1.33, in: 96, em: 16, ex: 7, bp: 1.33 }[u] || 1.33);
}

// Medida real del texto de los nodos TikZ (en el navegador); se guarda en caché.
const cacheMedidas = new Map();
let medidor = null;
export function medirTexto(html, fuente, op = {}) {
  const k = `${fuente}|${op.negrita ? 1 : 0}|${op.ancho || 0}|${op.mono ? 1 : 0}|${html}`;
  if (cacheMedidas.has(k)) return cacheMedidas.get(k);
  if (!medidor) {
    medidor = el('div', 'tikz-medidor');
    medidor.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;line-height:1.2;font-family:LM,"Latin Modern Roman",serif';
    document.body.append(medidor);
  }
  medidor.style.fontSize = fuente + 'px';
  medidor.style.fontWeight = op.negrita ? '700' : '400';
  medidor.style.fontFamily = op.mono ? 'LMmono,monospace' : 'LM,"Latin Modern Roman",serif';
  medidor.style.whiteSpace = op.ancho ? 'normal' : 'nowrap';
  medidor.style.width = op.ancho ? op.ancho + 'px' : 'auto';
  medidor.innerHTML = html;
  const r = medidor.getBoundingClientRect();
  const out = { w: html.trim() ? r.width : 0, h: r.height || fuente * 1.2 };
  if (cacheMedidas.size > 2000) cacheMedidas.clear();
  cacheMedidas.set(k, out);
  return out;
}

/**
 * Dibuja un TikZ dentro de `cont` y devuelve los avisos. Nunca lanza: si algo falla, se ve el aviso.
 * @param {HTMLElement} cont
 */
export function dibujarTikz(cont, src, { opc: o = '', ancho = 0 } = {}) {
  try {
    const r = tikzSvg(src, { opc: o, medir: typeof document !== 'undefined' ? medirTexto : null, ancho });
    cont.innerHTML = r.svg; // el SVG lo construye tikz.js con todo el texto escapado
    return r.avisos;
  } catch (e) {
    cont.textContent = 'No se pudo dibujar la vista previa.';
    return [e.message || String(e)];
  }
}

// ── Tablas con \multicolumn y \multirow ─────────────────────────────────

function dividirNivel(s, sep) {
  const out = []; let d = 0, ini = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (sep === '\\\\' && s[i + 1] === '\\' && d === 0) { out.push(s.slice(ini, i)); i++; ini = i + 1; continue; }
      if (s.startsWith('\\begin{', i)) { d++; i += 6; continue; }
      if (s.startsWith('\\end{', i)) { d--; i += 4; continue; }
      i++; continue;
    }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (sep === '&' && c === '&' && d === 0) { out.push(s.slice(ini, i)); ini = i + 1; }
  }
  out.push(s.slice(ini));
  return out;
}
const alineacion = (spec) => {
  const out = [];
  const s = spec.replace(/[pmbX]\{[^}]*\}/g, 'l').replace(/@\{[^}]*\}|!\{[^}]*\}|>\{[^}]*\}|<\{[^}]*\}/g, '').replace(/\*\{(\d+)\}\{([^}]*)\}/g, (m, n, x) => x.repeat(+n));
  for (const ch of s) if ('lcrX'.includes(ch)) out.push(ch === 'c' ? 'center' : ch === 'r' ? 'right' : 'left');
  return out;
};

function vistaTabla(tex) {
  const caja = el('div', 'rv-tabla');
  const m = /\\begin\{(tabular\*?|tabularx|longtable|array|tabulary)\}/.exec(tex);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (m[1] === 'tabular*' || m[1] === 'tabularx' || m[1] === 'tabulary') { const a = arg(tex, i); if (!a) return null; i = a.fin; }
  const o = opc(tex, i); if (o) i = o.fin;
  const spec = arg(tex, i); if (!spec) return null;
  const finEnv = tex.indexOf(`\\end{${m[1]}}`, spec.fin);
  let cuerpo = tex.slice(spec.fin, finEnv < 0 ? tex.length : finEnv);
  const cap = /\\caption\s*(\[[^\]]*\])?\s*\{/.exec(tex);
  const pie = cap ? arg(tex, cap.index + cap[0].length - 1) : null;
  const borde = spec.txt.includes('|');
  const lineas = /\\(toprule|midrule|bottomrule)/.test(cuerpo);
  cuerpo = cuerpo.replace(/\\caption\s*(\[[^\]]*\])?\s*\{[^{}]*\}(\s*\\\\)?/g, '').replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\(endfirsthead|endhead|endfoot|endlastfoot)\b/g, '\\\\').replace(/\\(hline|toprule|midrule|bottomrule)\b/g, '')
    .replace(/\\c?(line|midrule)(\([^)]*\))?\{[^}]*\}/g, '').replace(/\\addlinespace(\[[^\]]*\])?/g, '');
  const al = alineacion(spec.txt);
  const tabla = el('table', `rv-tab${borde ? ' con-borde' : ''}${lineas ? ' con-lineas' : ''}`);
  const ocupado = [];
  const filas = dividirNivel(cuerpo, '\\\\').map((x) => x.trim());
  while (filas.length && !filas[filas.length - 1]) filas.pop();
  for (const f of filas) {
    if (!f) continue;
    const tr = el('tr');
    let col = 0;
    for (let celda of dividirNivel(f, '&')) {
      while (ocupado[col] > 0) { ocupado[col]--; if (!celda.trim()) { celda = null; col++; break; } col++; }
      if (celda === null) continue;
      const td = el('td');
      let txt = celda.trim();
      let span = 1;
      const mc = /^\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{/.exec(txt);
      if (mc) {
        const a = arg(txt, mc[0].length - 1);
        span = +mc[1]; td.colSpan = span;
        td.style.textAlign = alineacion(mc[2])[0] || 'center';
        txt = a ? a.txt : '';
      } else td.style.textAlign = al[col] || 'left';
      const mr = /^\\multirow\s*(\[[^\]]*\])?\s*\{(\d+)\}\s*(\[[^\]]*\])?\s*\{([^}]*)\}\s*\{/.exec(txt);
      if (mr) {
        const a = arg(txt, mr[0].length - 1);
        td.rowSpan = +mr[2]; td.style.verticalAlign = 'middle';
        for (let k = 0; k < span; k++) ocupado[col + k] = +mr[2] - 1;
        txt = a ? a.txt : '';
      }
      td.append(inlineTex(txt));
      tr.append(td);
      col += span;
    }
    tabla.append(tr);
  }
  if (pie) caja.append(el('div', 'rv-pie', ''), tabla); else caja.append(tabla);
  if (pie) caja.firstChild.append(document.createTextNode('Tabla: '), inlineTex(pie.txt));
  return caja;
}

// ── Bloques de solo lectura (para minipage, figuras compuestas y entornos propios) ──

const CTX_VISTA = () => ({ biblio: [], cfg: {}, avisos: [], tikzLibs: [], vista: true });

/** Bloques del modelo → DOM de solo lectura. */
export function vistaBloques(bloques, prof = 0) {
  const f = el('div', 'rv-bloques');
  for (const b of bloques) {
    let e = null;
    switch (b.t) {
      case 'p': {
        // párrafos que solo separan minipages (\hfill, \quad…) no se muestran
        if (b.c.every((n) => (n.raw && /^\\(hfill|hspace\*?\{[^}]*\}|quad|qquad|,|;|\s)+$/.test(n.raw)) || (n.s != null && !n.s.trim()))) continue;
        e = el('p', 'rv-p'); e.style.textAlign = { c: 'center', r: 'right', l: 'left' }[b.al] || ''; e.append(inline(b.c)); break;
      }
      case 'h': e = el(`h${Math.min(6, (b.n || 1) + 2)}`, 'rv-h'); e.append(inline(b.c)); break;
      case 'lista': {
        e = el(b.desc ? 'dl' : b.ord ? 'ol' : 'ul', 'rv-lista');
        for (const it of b.items) {
          if (b.desc) { const dt = el('dt'); dt.append(inline(it.et || [])); const dd = el('dd'); dd.append(inline(it.c)); dd.style.marginLeft = (1.5 + it.n * 1.5) + 'em'; e.append(dt, dd); }
          else { const li = el('li'); li.style.marginLeft = it.n * 1.5 + 'em'; if (it.et) li.dataset.et = (it.et || []).map((x) => x.s || '').join(''); li.append(inline(it.c)); e.append(li); }
        }
        break;
      }
      case 'eq': e = mate(texParaKatex(b.env, b.tex), b.env !== 'math'); break;
      case 'tabla': {
        e = el('table', 'rv-tab con-borde');
        b.filas.forEach((fila, i) => { const tr = el('tr'); fila.forEach((c, j) => { const td = el('td'); td.style.textAlign = { c: 'center', r: 'right' }[b.al[j]] || 'left'; if (b.enc && !i) td.style.fontWeight = '700'; td.append(inline(c)); tr.append(td); }); e.append(tr); });
        break;
      }
      case 'fig': {
        e = el('div', 'rv-fig');
        if (b.src) { const img = el('img'); img.src = b.src; img.style.width = b.ancho + '%'; e.append(img); }
        else e.append(el('div', 'rv-img-pend', `🖼 ${b.ruta || b.nombre}`));
        if (b.pie && b.pie.length) { const p = el('div', 'rv-pie'); p.append(document.createTextNode('Figura: '), inline(b.pie)); e.append(p); }
        break;
      }
      case 'tikz': {
        e = el('div', 'rv-fig');
        const d = el('div', 'rv-tikz'); dibujarTikz(d, b.src, { opc: b.opc, ancho: b.ancho }); e.append(d);
        if (b.pie && b.pie.length) { const p = el('div', 'rv-pie'); p.append(document.createTextNode('Figura: '), inline(b.pie)); e.append(p); }
        break;
      }
      case 'cod': e = el('pre', 'rv-cod', b.src); break;
      case 'teo': e = el('div', 'rv-teo'); e.append(el('b', '', (b.tipo || '') + (b.titulo ? ` (${b.titulo})` : '') + '. '), inline(b.c)); break;
      case 'cita': case 'resumen': e = el('blockquote', 'rv-cita'); e.append(inline(b.c)); break;
      case 'raw':
        // separadores entre minipages (\hfill, \hspace…) y comentarios no se muestran
        if (/^\s*(\\(hfill|hspace\*?\{[^}]*\}|quad|qquad|vspace\*?\{[^}]*\}|centering|noindent)\s*)+$/.test(b.tex) || tipoVistaRaw(b.tex) === 'comentario') continue;
        e = vistaBloqueRaw(b.tex, prof + 1) || el('pre', 'rv-cod', b.tex); break;
      default: continue;
    }
    f.append(e);
  }
  return f;
}

/** Entorno de texto (minipage, figure, center, entornos propios…) → vista de su contenido. */
function vistaEntorno(tex, prof) {
  const be = /^\\begin\{([^}]+)\}/.exec(tex);
  const nombre = be[1];
  let cuerpo = tex.slice(be[0].length, tex.length - `\\end{${nombre}}`.length);
  const caja = el('div', `rv-env rv-${nombre.replace(/[^\w]/g, '')}`);
  // argumentos: [pos]{ancho} en minipage, posición [htbp] en flotantes, {n} en multicols
  let i = 0;
  const o = opc(cuerpo, i); if (o) i = o.fin;
  if (nombre === 'minipage' || nombre === 'multicols' || nombre === 'wrapfigure' || nombre === 'subfigure') {
    const a = arg(cuerpo, i);
    if (a) {
      i = a.fin;
      const pct = /([\d.]+)\s*\\(line|text|column)width/.exec(a.txt);
      if (nombre === 'minipage' || nombre === 'subfigure') { caja.style.width = pct ? `${Math.min(100, parseFloat(pct[1]) * 100)}%` : `${Math.min(600, aPx(a.txt) || 300)}px`; caja.classList.add('rv-mini'); }
      if (nombre === 'multicols') caja.style.columnCount = parseInt(a.txt, 10) || 2;
    }
  }
  cuerpo = cuerpo.slice(i);
  // pie y etiqueta de flotantes: abajo, como «Figura: …»
  let pie = null;
  const cap = /\\caption\s*(\[[^\]]*\])?\s*\{/.exec(cuerpo);
  if (cap) { const a = arg(cuerpo, cap.index + cap[0].length - 1); if (a) { pie = a.txt; cuerpo = cuerpo.slice(0, cap.index) + cuerpo.slice(a.fin); } }
  cuerpo = cuerpo.replace(/\\label\{[^}]*\}/g, '');
  if (/\\centering\b/.test(cuerpo) || nombre === 'center') { caja.style.textAlign = 'center'; cuerpo = cuerpo.replace(/\\centering\b/g, ''); }
  const conocidos = /^(figure|table|minipage|center|flushleft|flushright|multicols|subfigure|wrapfigure|quote|quotation)\*?$/;
  if (!conocidos.test(nombre)) caja.append(el('div', 'rv-env-et', `Entorno «${nombre}»`));
  let bloques;
  try { bloques = parsearBloques(cuerpo, CTX_VISTA()); } catch { bloques = [{ t: 'raw', tex: cuerpo }]; }
  // un entorno que se lee como sí mismo daría un bucle
  if (bloques.length === 1 && bloques[0].t === 'raw' && bloques[0].tex.trim() === tex.trim()) return null;
  caja.append(vistaBloques(bloques, prof));
  if (pie != null) {
    const p = el('div', 'rv-pie');
    p.append(document.createTextNode(/^table/.test(nombre) ? 'Tabla: ' : 'Figura: '), inlineTex(pie));
    caja.append(p);
  }
  return caja;
}

const NOMBRE_AJUSTE = {
  newcommand: 'Define un comando', renewcommand: 'Redefine un comando', providecommand: 'Define un comando', newenvironment: 'Define un entorno', renewenvironment: 'Redefine un entorno',
  def: 'Define un comando', setcounter: 'Cambia un contador', addtocounter: 'Cambia un contador', setlength: 'Cambia una medida', addtolength: 'Cambia una medida',
  pagenumbering: 'Numeración de páginas', pagestyle: 'Estilo de página', thispagestyle: 'Estilo de esta página', centering: 'Centrado a partir de aquí',
  raggedright: 'Alineado a la izquierda a partir de aquí', raggedleft: 'Alineado a la derecha a partir de aquí', appendix: 'Apéndices: las secciones siguientes se numeran A, B, C…',
  listoffigures: 'Índice de figuras (se genera al compilar)', listoftables: 'Índice de tablas (se genera al compilar)', clearpage: 'Salto de página',
  cleardoublepage: 'Salto a página impar', pagebreak: 'Salto de página', nopagebreak: 'Sin salto de página aquí', linebreak: 'Salto de línea', noindent: 'Sin sangría',
  maketitle: 'Título del documento', tableofcontents: 'Índice general', hfill: 'Espacio horizontal flexible', hspace: 'Espacio horizontal', usepackage: 'Carga un paquete',
  graphicspath: 'Carpeta de imágenes', DeclareMathOperator: 'Define un operador matemático', makeatletter: 'Ajuste interno', makeatother: 'Ajuste interno',
  frontmatter: 'Páginas preliminares', mainmatter: 'Cuerpo del libro', backmatter: 'Páginas finales', onecolumn: 'Una columna', twocolumn: 'Dos columnas',
  vspace: 'Espacio vertical', bigskip: 'Espacio vertical', medskip: 'Espacio vertical', smallskip: 'Espacio vertical', vfill: 'Espacio vertical flexible', addvspace: 'Espacio vertical', hrule: 'Línea', rule: 'Línea',
};

/**
 * Vista previa de un bloque crudo, o null si no hay ninguna posible.
 * @returns {HTMLElement|null}
 */
export function vistaBloqueRaw(tex, prof = 0) {
  if (prof > 4) return null;
  const t = String(tex || '').trim();
  const tipo = tipoVistaRaw(t);
  if (!tipo) return null;
  try {
    switch (tipo) {
      case 'comentario': return el('div', 'rv-comentario', t.split('\n').map((l) => l.replace(/^\s*%\s?/, '')).join('\n'));
      case 'mate': {
        if (/^\\\[/.test(t)) return mate(texParaKatex('equation', t.slice(2, -2)));
        if (/^\$\$/.test(t)) return mate(texParaKatex('equation', t.slice(2, -2)));
        const be = /^\\begin\{([^}]+)\}(\{[^}]*\})?/.exec(t);
        const cuerpo = t.slice(be[0].length, t.length - `\\end{${be[1]}}`.length);
        return mate(texParaKatex(be[1], cuerpo, be[2] ? be[2].slice(1, -1) : ''), !/^math$/.test(be[1]));
      }
      case 'tabla': {
        const caja = el('div', 'rv-env');
        const tb = vistaTabla(t);
        if (!tb) return null;
        caja.append(tb);
        return caja;
      }
      case 'tikz': {
        const e = /^\\begin\{tikzpicture\}(\[[^\]]*\])?/.exec(t);
        const d = el('div', 'rv-tikz');
        dibujarTikz(d, t.slice(e[0].length, t.length - '\\end{tikzpicture}'.length), { opc: e[1] ? e[1].slice(1, -1) : '' });
        return d;
      }
      case 'entorno': return vistaEntorno(t, prof);
      case 'regla': return el('hr', 'rv-regla');
      case 'espacio': {
        const m = UN_COMANDO.exec(t);
        const a = m[3] ? m[3].slice(1, -1) : '';
        const alto = m[1] === 'vspace' || m[1] === 'addvspace' ? aPx(a) : { bigskip: 16, medskip: 8, smallskip: 4, vfill: 24 }[m[1]];
        const e = el('div', 'rv-espacio', `${NOMBRE_AJUSTE[m[1]]}${a ? ': ' + a : ''}`);
        e.style.height = Math.max(12, Math.min(200, alto || 12)) + 'px';
        return e;
      }
      case 'archivo': {
        const m = UN_COMANDO.exec(t);
        const a = m[3] ? m[3].slice(1, -1).trim() : '';
        const texto = {
          input: `📄 Aquí se incluye el archivo «${/\.\w+$/.test(a) ? a : a + '.tex'}»`, include: `📄 Aquí se incluye el capítulo «${a}.tex» (en una página nueva)`,
          includeonly: `📄 Solo se compilan: ${a}`, bibliography: `📚 Bibliografía desde «${a.split(',').map((x) => x.trim() + '.bib').join('», «')}» (la genera BibTeX al compilar)`,
          bibliographystyle: `📚 Estilo de la bibliografía: ${a}`, printbibliography: '📚 Bibliografía (la genera biblatex al compilar)', addbibresource: `📚 Archivo de bibliografía: ${a}`,
        }[m[1]];
        return el('div', 'rv-archivo', texto);
      }
      case 'ajuste': {
        const lineas = t.split('\n').filter((l) => l.trim() && !/^\s*%/.test(l));
        const caja = el('div', 'rv-ajustes');
        for (const l of lineas) {
          const c = /^\s*\\([a-zA-Z]+)\*?/.exec(l);
          const nombre = c ? c[1] : '';
          if (nombre === 'part' || nombre === 'paragraph' || nombre === 'subparagraph') {
            const a = arg(l, l.indexOf('{'));
            const e = el(nombre === 'part' ? 'div' : 'p', nombre === 'part' ? 'rv-parte' : 'rv-p');
            if (nombre === 'part') e.append(document.createTextNode('Parte: '), inlineTex(a ? a.txt : ''));
            else { const b = el('b'); b.append(inlineTex(a ? a.txt : '')); e.append(b, document.createTextNode(' '), inlineTex(a ? l.slice(a.fin) : '')); }
            caja.append(e); continue;
          }
          if (REGLAS.has(nombre)) { caja.append(el('hr', 'rv-regla')); continue; }
          const n = /\\(?:newcommand|renewcommand|providecommand|newenvironment|renewenvironment|def|DeclareMathOperator)\*?\s*\{?\\?([a-zA-Z@]+)/.exec(l);
          caja.append(el('div', 'rv-ajuste', `⚙ ${NOMBRE_AJUSTE[nombre] || 'Ajuste'}${n ? ': ' + (/environment/.test(nombre) ? n[1] : '\\' + n[1]) : ''}`));
        }
        return caja;
      }
    }
  } catch (e) {
    console.warn('Vista previa no disponible', e);
  }
  return null;
}

// ── Fragmentos en línea ────────────────────────────────────────────────

const TAMANOS = { tiny: .5, scriptsize: .7, footnotesize: .8, small: .9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.73, huge: 2.07, Huge: 2.49 };
const SIMBOLOS = { S: '§', P: '¶', copyright: '©', textregistered: '®', texttrademark: '™', textdegree: '°', dag: '†', ddag: '‡', pounds: '£', euro: '€', textellipsis: '…',
  guillemotleft: '«', guillemotright: '»', textquestiondown: '¿', textexclamdown: '¡', ss: 'ß', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', i: 'ı', l: 'ł', L: 'Ł', textbullet: '•', textendash: '–', textemdash: '—' };
const fechaHoy = () => new Date().toLocaleDateString(document.documentElement.lang || 'es', { year: 'numeric', month: 'long', day: 'numeric' });
function logo(t) {
  const e = el('span', 'rv-logo');
  if (t === 'TeX') e.innerHTML = 'T<span class="e">e</span>X';
  else e.innerHTML = 'L<span class="a">a</span>T<span class="e">e</span>X' + (t === 'LaTeXe' ? '2<span class="eps">ε</span>' : '');
  return e;
}

/**
 * Contenido renderizado para un fragmento crudo en línea, o null si no se sabe mostrar (se ve el código).
 * @returns {Node|null}
 */
export function vistaRawInline(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  try {
    let m;
    if ((m = /^\\verb\*?(.)([\s\S]*)\1$/.exec(t))) return el('code', 'rv-code', m[2]);
    if ((m = /^\\lstinline(?:\[[^\]]*\])?(?:\{([\s\S]*)\}|(.)([\s\S]*)\2)$/.exec(t))) return el('code', 'rv-code', m[1] ?? m[3]);
    if (/^\\tikz\b/.test(t)) {
      const mm = /^\\tikz\s*(\[[^\]]*\])?\s*([\s\S]*)$/.exec(t);
      let cuerpo = mm[2].trim();
      if (cuerpo.startsWith('{') && cuerpo.endsWith('}')) cuerpo = cuerpo.slice(1, -1);
      const s = el('span', 'rv-tikz-linea');
      dibujarTikz(s, cuerpo, { opc: mm[1] ? mm[1].slice(1, -1) : '' });
      return s;
    }
    if ((m = /^\\([a-zA-Z]+)(\{\})?$/.exec(t))) {
      const c = m[1];
      if (c === 'today') return el('span', '', fechaHoy());
      if (c === 'LaTeX' || c === 'TeX' || c === 'LaTeXe') return logo(c);
      if (SIMBOLOS[c]) return el('span', '', SIMBOLOS[c]);
      if (c === 'quad' || c === 'qquad') { const e = el('span', 'rv-hueco'); e.style.width = c === 'quad' ? '1em' : '2em'; return e; }
      if (c === 'hfill') { const e = el('span', 'rv-hueco'); e.style.width = '3em'; return e; }
      if (c === 'linebreak' || c === 'newline') return el('br');
      return null;
    }
    if ((m = /^\\hspace\*?\{([^}]*)\}$/.exec(t))) { const e = el('span', 'rv-hueco'); e.style.width = Math.max(2, Math.min(300, aPx(m[1]) || 8)) + 'px'; return e; }
    if ((m = /^\\(label|pageref)\{([^}]*)\}$/.exec(t))) return el('span', 'rv-tenue', m[1] === 'label' ? `🏷 ${m[2]}` : 'p. ?');
    // \textcolor{color}{texto}, \textsc{…}, \textsf{…}…
    if ((m = /^\\textcolor\s*(\[[^\]]*\])?\s*\{([^}]*)\}\s*\{/.exec(t))) {
      const a = arg(t, m[0].length - 1);
      if (!a || a.fin !== t.length) return null;
      const e = el('span'); e.style.color = (m[1] ? null : colorCss(m[2])) || 'inherit'; e.append(inlineTex(a.txt)); return e;
    }
    if ((m = /^\\(textsc|textsf|textsl|textrm|textup|textmd|textnormal|uppercase|MakeUppercase|MakeLowercase|underline|mbox|fbox|textbf|textit|emph)\s*\{/.exec(t))) {
      const a = arg(t, m[0].length - 1);
      if (!a || a.fin !== t.length) return null;
      const e = el('span', `rv-${m[1]}`); e.append(inlineTex(a.txt)); return e;
    }
    // grupo con declaraciones: {\small …}, {\Large \bfseries …}, {\color{red} …}
    if (t.startsWith('{') && t.endsWith('}')) {
      let cuerpo = t.slice(1, -1);
      const e = el('span');
      let alguna = false;
      for (;;) {
        cuerpo = cuerpo.replace(/^\s+/, '');
        const d = /^\\([a-zA-Z]+)\b\s*/.exec(cuerpo);
        if (!d) break;
        const c = d[1];
        if (TAMANOS[c]) e.style.fontSize = TAMANOS[c] + 'em';
        else if (c === 'bfseries' || c === 'bf') e.style.fontWeight = '700';
        else if (c === 'itshape' || c === 'it' || c === 'em' || c === 'slshape' || c === 'sl') e.style.fontStyle = 'italic';
        else if (c === 'ttfamily' || c === 'tt') e.classList.add('rv-code');
        else if (c === 'sffamily' || c === 'sf') e.classList.add('rv-textsf');
        else if (c === 'scshape' || c === 'sc') e.classList.add('rv-textsc');
        else if (c === 'rmfamily' || c === 'normalfont' || c === 'upshape' || c === 'mdseries') { /* normal */ }
        else if (c === 'color') { const a = arg(cuerpo, d[0].length); if (!a) break; e.style.color = colorCss(a.txt) || 'inherit'; cuerpo = cuerpo.slice(a.fin); alguna = true; continue; }
        else break;
        alguna = true;
        cuerpo = cuerpo.slice(d[0].length);
      }
      if (!alguna) return null;
      e.append(inlineTex(cuerpo));
      return e;
    }
  } catch { /* sin vista */ }
  return null;
}
