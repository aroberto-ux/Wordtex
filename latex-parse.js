// De código LaTeX al modelo. Entiende el subconjunto que genera esta página y los documentos
// habituales (secciones, listas, ecuaciones, tablas, figuras, teoremas, código, citas…).
// Lo que no reconoce se conserva tal cual como «bloque LaTeX» (o texto LaTeX en línea),
// de modo que al volver a generar el .tex no se pierde nada.

import {
  cfgPorDefecto, CLASES, IDIOMAS, ALIAS_TEOREMA, compactar, sanearBloque, sanearCfg, sanearBiblio, nuevoId,
} from './modelo.js?v=2026.11.04-a';

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
      if (l[k] === '\\') { k++; continue; }
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
  const c = cerrarEntorno(s, nombre, j);
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
        }
        if (nombre === 'footnote') { const a = arg(); if (a != null) { vaciar(); nodos.push({ nota: compactar(parsearInline(a)) }); i = j; continue; } }
        if (/^cite[pt]?$/.test(nombre) || nombre === 'nocite') {
          const op = opcional(s, j); if (op) j = op.fin;
          const a = arg();
          if (a != null && nombre !== 'nocite') { vaciar(); nodos.push({ cita: a.trim() }); i = j; continue; }
        }
        if (nombre === 'ref' || nombre === 'autoref' || nombre === 'pageref') {
          const a = arg();
          if (a != null && nombre === 'ref') { vaciar(); nodos.push({ ref: a.trim() }); i = j; continue; }
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
  const c = compactar(parsearInline(s));
  // recorta espacios en los extremos
  while (c.length && c[0].s != null && /^\s+$/.test(c[0].s)) c.shift();
  if (c.length && c[0].s != null) c[0].s = c[0].s.replace(/^\s+/, '');
  while (c.length && c[c.length - 1].s != null && /^\s+$/.test(c[c.length - 1].s)) c.pop();
  if (c.length && c[c.length - 1].s != null) c[c.length - 1].s = c[c.length - 1].s.replace(/\s+$/, '');
  return c;
};

// ── Bloques ─────────────────────────────────────────────────────────────

const SECCIONES = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };
const EQ_ENV = { equation: 'equation', align: 'align', gather: 'gather' };

function sacarEtiqueta(t) {
  let label = '';
  const out = t.replace(/\\label\{([^}]*)\}/g, (m, l) => { if (!label) label = l.trim(); return ''; });
  return { texto: out, label };
}

function parsearItems(cuerpo, nivel, items) {
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
  for (let t of trozos) {
    let etiqueta = '';
    const o = opcional(t, saltarEsp(t, 0));
    if (o && saltarEsp(t, 0) === saltarEsp(t, 0)) { etiqueta = o.txt; t = t.slice(o.fin); }
    // separar listas anidadas
    let texto = '', resto = '';
    let k = 0, anidadas = [];
    while (k < t.length) {
      const m = /^\\begin\{(itemize|enumerate)\}/.exec(t.slice(k, k + 30));
      if (m) { const e = entorno(t, k); if (e) { anidadas.push(e); k = e.fin; continue; } }
      if (anidadas.length) resto += t[k]; else texto += t[k];
      k++;
    }
    let c = inlineLimpio(texto + (resto.trim() ? ' ' + resto : ''));
    if (etiqueta) c = [{ s: etiqueta + ' ', b: 1 }, ...c];
    items.push({ c, n: Math.min(nivel, 2) });
    for (const a of anidadas) parsearItems(a.cuerpoCompleto, nivel + 1, items);
  }
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

function parsearTabular(cuerpo, spec) {
  if (/[*>@<!]/.test(spec)) return null;
  const letras = [];
  const limpia = spec.replace(/[pmb]\{[^}]*\}/g, 'l');
  for (const ch of limpia) { if ('lcr'.includes(ch)) letras.push(ch); else if (ch !== '|' && !/\s/.test(ch)) return null; }
  if (!letras.length) return null;
  let borde = spec.includes('|') ? 'completo' : 'ninguno';
  if (/\\toprule|\\midrule/.test(cuerpo)) borde = 'horizontal';
  else if (borde === 'ninguno' && /\\hline/.test(cuerpo)) borde = 'completo';
  if (/\\multicolumn|\\multirow/.test(cuerpo)) return null;
  const limpio = cuerpo.replace(/\\(hline|toprule|midrule|bottomrule)\b/g, '').replace(/\\cline\{[^}]*\}/g, '');
  const filasTxt = dividirNivel(limpio, '\\\\').map((r) => r.trim()).filter((r, idx, arr) => r !== '' || idx < arr.length - 1);
  while (filasTxt.length && filasTxt[filasTxt.length - 1] === '') filasTxt.pop();
  if (!filasTxt.length) return null;
  const filas = filasTxt.map((f) => dividirNivel(f, '&').map((c) => inlineLimpio(c)));
  const cols = Math.max(letras.length, ...filas.map((f) => f.length));
  filas.forEach((f) => { while (f.length < cols) f.push([]); });
  while (letras.length < cols) letras.push('l');
  // encabezado: toda la primera fila en negrita
  let enc = false;
  const f0 = filas[0];
  if (f0.every((c) => !c.length || c.every((n) => n.s == null || n.b)) && f0.some((c) => c.length)) {
    enc = true;
    filas[0] = f0.map((c) => c.map((n) => { if (n.s != null && n.b) { const { b, ...r } = n; return r; } return n; }));
  }
  return { t: 'tabla', filas, enc, al: letras, borde, pie: [], label: '' };
}

function ambosTabular(cuerpo) {
  const i = cuerpo.indexOf('\\begin{tabular}');
  if (i < 0) return null;
  const e = entorno(cuerpo, i);
  if (!e) return null;
  const k = saltarEsp(e.cuerpoCompleto, 0);
  const g = grupo(e.cuerpoCompleto, k);
  if (!g) return null;
  return { tabla: parsearTabular(e.cuerpoCompleto.slice(g.fin), g.txt), ini: i, fin: e.fin };
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

function parsearFigura(cuerpo) {
  cuerpo = sinPosicion(cuerpo);
  const m = /\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]*)\}/.exec(cuerpo);
  if (!m) return null;
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
  const w = /width\s*=\s*([\d.]+)\s*(\\linewidth|\\textwidth|\\columnwidth|cm|mm|pt)?/.exec(m[1] || '');
  if (w) {
    const v = parseFloat(w[1]);
    if (!w[2]) ancho = 100 * v;
    else if (w[2].startsWith('\\')) ancho = 100 * v;
    else if (w[2] === 'cm') ancho = (v / 16) * 100;
    else if (w[2] === 'mm') ancho = (v / 160) * 100;
    else ancho = (v / 450) * 100;
  }
  const ruta = m[2].trim();
  const nombre = ruta.split('/').pop() || 'imagen.png';
  return { t: 'fig', src: '', nombre, ancho: Math.round(Math.min(100, Math.max(10, ancho))), pie, label };
}

function bloqueEntorno(e, ctx) {
  const nombre = e.nombre.replace(/\*$/, '');
  const estrella = e.nombre.endsWith('*');
  const cuerpo = e.cuerpoCompleto;
  switch (nombre) {
    case 'itemize': case 'enumerate': {
      const items = [];
      parsearItems(cuerpo, 0, items);
      return items.length ? [{ t: 'lista', ord: nombre === 'enumerate', items }] : null;
    }
    case 'equation': case 'align': case 'gather': {
      if (nombre !== 'equation' && /\\begin\{/.test(cuerpo)) return null;
      const { texto, label } = sacarEtiqueta(cuerpo);
      return [{ t: 'eq', env: EQ_ENV[nombre], tex: texto.trim(), num: !estrella, label }];
    }
    case 'tabular': {
      const g = grupo(cuerpo, saltarEsp(cuerpo, 0));
      if (!g) return null;
      const t = parsearTabular(cuerpo.slice(g.fin), g.txt);
      return t ? [t] : null;
    }
    case 'table': { const t = parsearFloatTabla(cuerpo); return t ? [t] : null; }
    case 'figure': { const f = parsearFigura(cuerpo); return f ? [f] : null; }
    case 'lstlisting': case 'verbatim': {
      let lang = '', num = false, src = cuerpo;
      if (nombre === 'lstlisting') {
        const o = opcional(src, 0);
        if (o) { const l = /language\s*=\s*\{?([\w+#]+)/i.exec(o.txt); lang = l ? l[1] : ''; num = /numbers\s*=\s*(left|right)/.test(o.txt); src = src.slice(o.fin); }
      }
      src = src.replace(/^\r?\n/, '').replace(/\s+$/, '');
      return [{ t: 'cod', lang, src, num }];
    }
    case 'quote': case 'quotation': return [{ t: 'cita', c: inlineLimpio(sinComentarios(cuerpo)) }];
    case 'abstract': return [{ t: 'resumen', c: inlineLimpio(sinComentarios(cuerpo)) }];
    case 'center': case 'flushleft': case 'flushright': {
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

const RAW_SUELTOS = /^\\(vspace|hspace|bigskip|medskip|smallskip|noindent|clearpage|cleardoublepage|centering|hrule|hrulefill|pagebreak|newpage|input|include|bibliographystyle|bibliography|appendix|printbibliography|listoffigures|listoftables|setcounter|pagenumbering|raggedright|vfill|hfill|part|paragraph|subparagraph|usepackage|newcommand|renewcommand|def)\b/;

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
    bloques.push({ t: 'p', c: inlineLimpio(t), al: 'j' });
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

const PAQUETES_PROPIOS = new Set(['inputenc', 'fontenc', 'lmodern', 'babel', 'amsmath', 'amssymb', 'amsthm', 'amsfonts', 'graphicx', 'booktabs', 'ulem', 'setspace', 'listings', 'hyperref', 'geometry']);

function parsearPreambulo(pre, cfg, ctx) {
  const extra = [];
  let i = 0;
  while (i < pre.length) {
    i = saltarEsp(pre, i);
    if (i >= pre.length) break;
    if (pre[i] === '%') { const nl = pre.indexOf('\n', i); const linea = pre.slice(i, nl < 0 ? pre.length : nl).trim(); if (!/^% ?(---|!|Preámbulo)/.test(linea) || /Preámbulo propio/.test(linea) === false) { if (!/^% ?---/.test(linea)) extra.push(linea); } i = nl < 0 ? pre.length : nl + 1; continue; }
    if (pre[i] !== '\\') { const nl = pre.indexOf('\n', i); extra.push(pre.slice(i, nl < 0 ? pre.length : nl).trim()); i = nl < 0 ? pre.length : nl + 1; continue; }
    const ini = i;
    const cm = comando(pre, i);
    let j = cm.fin;
    const opciones = [];
    const argumentos = [];
    const maxArgs = { documentclass: 1, usepackage: 1, title: 1, author: 1, date: 1, newtheorem: 3, theoremstyle: 1, setstretch: 1, pagestyle: 1, lstset: 1 }[cm.nombre] ?? 0;
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
      const k = saltarEsp(pre, j);
      const o = opcional(pre, k);
      if (o && !argumentos.length) { opciones.push(o.txt); j = o.fin; continue; }
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
        else extra.push(raw.trim());
        break;
      }
      case 'title': cfg.titulo = compactar(parsearInline(argumentos[0] || '')).map((n) => n.s ?? '').join('').trim(); break;
      case 'author': cfg.autor = compactar(parsearInline((argumentos[0] || '').replace(/\s*\\and\b\s*/g, ', '))).map((n) => n.s ?? (n.br ? ', ' : '')).join('').trim(); break;
      case 'date': cfg.fecha = a0 === '' ? 'ninguna' : (a0 === '\\today' ? '' : compactar(parsearInline(argumentos[0])).map((n) => n.s ?? '').join('')); break;
      case 'newtheorem': if (!ALIAS_TEOREMA[a0]) extra.push(raw.trim()); break;
      case 'theoremstyle': break;
      case 'setstretch': cfg.interlineado = parseFloat(a0) || 1; break;
      case 'onehalfspacing': cfg.interlineado = 1.5; break;
      case 'doublespacing': cfg.interlineado = 2; break;
      case 'singlespacing': cfg.interlineado = 1; break;
      case 'pagestyle': if (a0 === 'empty') cfg.numPag = false; else extra.push(raw.trim()); break;
      case 'lstset': if (!/literate/.test(raw)) extra.push(raw.trim()); break;
      default: extra.push(raw.trim());
    }
    i = j;
  }
  return extra.filter(Boolean).join('\n');
}

/**
 * @param {string} src  código LaTeX (documento completo o solo el cuerpo)
 * @returns {{ cfg, biblio, extra, bloques, avisos }}
 */
export function parsearTex(src) {
  const avisos = [];
  const cfg = cfgPorDefecto();
  const ctx = { biblio: [], cfg, avisos };
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
  const extra = ini >= 0 ? parsearPreambulo(pre, cfg, ctx) : '';
  const bloques = parsearBloques(cuerpo, ctx).map((b) => sanearBloque(b)).filter(Boolean);
  let extraFinal = extra;
  if (bloques.some((b) => b.t === 'cod')) extraFinal = extra.split('\n').filter((l) => l.trim() !== '\\usepackage{xcolor}').join('\n');
  return {
    cfg: sanearCfg(cfg), biblio: sanearBiblio(ctx.biblio), extra: extraFinal, avisos,
    bloques: bloques.map((b) => ({ ...b, id: nuevoId() })),
  };
}
