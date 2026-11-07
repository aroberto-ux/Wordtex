// Vista previa de los bloques «LaTeX avanzado»: tablas (tabular, booktabs, multicolumn, multirow),
// pies, notas, fórmulas en línea y macros del preámbulo. Es una aproximación visual: el código no cambia
// y sigue exportándose tal cual. Lo que no se reconoce simplemente no se dibuja.
//
// La parte de análisis (analizarRaw, columnas, filasDe) no toca el DOM y se prueba con Node.

import { renderMate } from './inline-dom.js?v=2026.11.07-j';
import { grupo, sinComentarios } from './macros.js?v=2026.11.07-j';

// ── Análisis (puro) ─────────────────────────────────────────────────────

const TAMANOS = { tiny: 0.6, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, normalsize: 1, large: 1.15 };

/** Divide por «&» o por «\\\\» (fin de fila) fuera de llaves y de $…$. */
export function dividir(s, sep) {
  const out = [];
  let d = 0, mate = false, ini = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (sep === '\\\\' && s[i + 1] === '\\' && d === 0 && !mate) { out.push(s.slice(ini, i)); i++; ini = i + 1; }
      else i++;
      continue;
    }
    if (c === '$') mate = !mate;
    else if (c === '{') d++;
    else if (c === '}') d--;
    else if (sep === '&' && c === '&' && d === 0 && !mate) { out.push(s.slice(ini, i)); ini = i + 1; }
  }
  out.push(s.slice(ini));
  return out;
}

/** Columnas de un tabular: [{ al:'l'|'c'|'r', bl:boolean, br:boolean }] (bl/br = línea vertical a izquierda/derecha). */
export function columnas(spec) {
  spec = String(spec)
    .replace(/\*\{(\d+)\}\{([^{}]*)\}/g, (_, n, s) => s.repeat(+n))
    .replace(/[<>@!]\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  const cols = [];
  let barra = false;
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i];
    if (c === '|') { barra = true; continue; }
    let al = null;
    if ('lcr'.includes(c)) al = c;
    else if (c === 'X') al = 'l';
    else if ('pmb'.includes(c)) { al = 'l'; if (spec[i + 1] === '{') { const g = grupo(spec, i + 1); if (g) i = g.fin - 1; } }
    if (al) { cols.push({ al, bl: barra, br: false }); barra = false; }
  }
  if (barra && cols.length) cols[cols.length - 1].br = true;
  return cols;
}

const alineacionDe = (s) => (String(s).replace(/[|@!<>]\{[^}]*\}|\|/g, '').match(/[lcr]/) || ['c'])[0];

/**
 * Cuerpo de un tabular → filas con celdas ya colocadas.
 * @returns {{ filas: {celdas:{txt:string,span:number,rspan:number,al:string,col:number,top:string|null,bot:string|null,bl:boolean,br:boolean}[]}[], ncols:number }}
 */
export function filasDe(cuerpo, spec) {
  const cols = columnas(spec);
  const filas = [];
  const ocup = [];          // ocup[col] = filas que aún le quedan a una celda \multirow
  let ncols = cols.length;
  for (let tz of dividir(cuerpo, '\\\\')) {
    tz = tz.replace(/^\s*\[[^\]]*\]/, ''); // \\[2pt]
    const reglas = [];
    tz = tz.replace(/\\cmidrule(?:\([^)]*\))?\{(\d+)-(\d+)\}/g, (_, a, b) => { reglas.push({ g: 'fina', a: +a - 1, b: +b - 1 }); return ''; });
    tz = tz.replace(/\\(toprule|midrule|bottomrule|hline)(?![a-zA-Z])/g, (_, r) => { reglas.push({ g: r === 'toprule' || r === 'bottomrule' ? 'gruesa' : 'fina' }); return ''; });
    tz = tz.replace(/\\addlinespace(?:\[[^\]]*\])?/g, '').replace(/\\noalign\s*\{[^{}]*\}/g, '');
    if (!tz.trim()) { if (filas.length) filas[filas.length - 1].abajo.push(...reglas); continue; } // regla al final
    const fila = { celdas: [], arriba: reglas, abajo: [] };
    let col = 0;
    for (const crudo of dividir(tz, '&')) {
      if (ocup[col] > 0) { ocup[col]--; col++; continue; } // hueco que tapa un \multirow de arriba
      let txt = crudo.trim(), span = 1, rspan = 1, al = (cols[col] || { al: 'l' }).al, mm;
      if ((mm = /^\\multicolumn\s*\{(\d+)\}\s*\{([^{}]*)\}\s*\{/.exec(txt))) {
        const g = grupo(txt, mm[0].length - 1);
        if (g) { span = Math.max(1, +mm[1]); al = alineacionDe(mm[2]); txt = g.txt.trim(); }
      }
      if ((mm = /^\\multirow\s*\{(\d+)\}\s*\{[^{}]*\}\s*(?:\[[^\]]*\]\s*)?\{/.exec(txt))) {
        const g = grupo(txt, mm[0].length - 1);
        if (g) { rspan = Math.max(1, +mm[1]); txt = g.txt.trim(); }
      }
      fila.celdas.push({ txt, span, rspan, al, col, top: null, bot: null, bl: !!(cols[col] && cols[col].bl), br: !!(cols[col + span - 1] && cols[col + span - 1].br) });
      if (rspan > 1) for (let k = 0; k < span; k++) ocup[col + k] = rspan - 1;
      col += span;
    }
    ncols = Math.max(ncols, col);
    filas.push(fila);
  }
  const peso = (g) => (g === 'gruesa' ? 2 : 1);
  const poner = (c, lado, r) => {
    const cubre = r.a == null || (c.col <= r.b && c.col + c.span - 1 >= r.a);
    if (cubre && (!c[lado] || peso(r.g) > peso(c[lado]))) c[lado] = r.g;
  };
  for (const f of filas) {
    for (const c of f.celdas) { for (const r of f.arriba) poner(c, 'top', r); for (const r of f.abajo) poner(c, 'bot', r); }
    delete f.arriba; delete f.abajo;
  }
  return { filas, ncols };
}

/** Primer \caption{…} (con o sin [corto]) de un texto. → { txt, ini, fin } o null. */
function leerCaption(s) {
  const m = /\\caption(?:\[[^\]]*\])?\s*\{/.exec(s);
  if (!m) return null;
  const g = grupo(s, m.index + m[0].length - 1);
  return g ? { txt: g.txt, ini: m.index, fin: g.fin } : null;
}

/** Un tabular (y lo que lo rodea dentro de su entorno table) → descripción. */
function tablaDe(cuerpo, suelta) {
  const ini = /\\begin\{(tabular\*?|tabularx)\}/.exec(cuerpo);
  if (!ini) return null;
  let p = ini.index + ini[0].length;
  if (cuerpo[p] === '[') p = cuerpo.indexOf(']', p) + 1;
  if (ini[1] !== 'tabular') { // tabularx y tabular* llevan antes el ancho
    const w = grupo(cuerpo, p); if (!w) return null; p = w.fin;
    if (cuerpo[p] === '[') p = cuerpo.indexOf(']', p) + 1;
  }
  const sp = grupo(cuerpo, p);
  if (!sp) return null;
  const cierre = `\\end{${ini[1]}}`;
  const fin = cuerpo.indexOf(cierre, sp.fin);
  if (fin < 0) return null;
  let antes = cuerpo.slice(0, ini.index);
  let despues = suelta ? '' : cuerpo.slice(fin + cierre.length);
  let caption = null, capArriba = true;
  const ca = leerCaption(antes);
  if (ca) { caption = ca.txt; antes = antes.slice(ca.fin); }
  else { const cd = leerCaption(despues); if (cd) { caption = cd.txt; capArriba = false; despues = despues.slice(0, cd.ini) + despues.slice(cd.fin); } }
  const lab = /\\label\{([^}]*)\}/.exec(cuerpo);
  let tam = null;
  for (const m of antes.matchAll(/\\(tiny|scriptsize|footnotesize|small|normalsize|large)(?![a-zA-Z])/g)) tam = TAMANOS[m[1]];
  const tcs = /\\setlength\s*\{\\tabcolsep\}\s*\{([\d.]+)\s*pt\}/.exec(antes);
  const str = /\\(?:(?:re)?newcommand\s*\{\\arraystretch\}|def\\arraystretch)\s*\{([\d.]+)\}/.exec(antes);
  return {
    caption, capArriba, label: lab ? lab[1] : '', spec: sp.txt, cuerpo: cuerpo.slice(sp.fin, fin),
    tam, tabcolsep: tcs ? +tcs[1] : null, stretch: str ? +str[1] : null,
    resto: despues.replace(/\\label\{[^}]*\}/g, '').trim(),
  };
}

/**
 * Busca las tablas de un bloque de LaTeX crudo. `k` es la posición del entorno table/figure dentro del
 * bloque (es la misma que usa numerar.js), para poder poner «Tabla N» en el pie.
 * @returns {{ tablas: object[] }}
 */
export function analizarRaw(tex) {
  const src = sinComentarios(tex);
  const tablas = [];
  const rangos = [];
  let k = 0, m;
  const env = /\\begin\{(table|figure)(\*?)\}(?:\s*\[[^\]]*\])?([\s\S]*?)\\end\{\1\2\}/g;
  while ((m = env.exec(src))) {
    rangos.push([m.index, m.index + m[0].length]);
    if (m[1] === 'table') { const t = tablaDe(m[3], false); if (t) tablas.push({ ...t, k, pos: m.index }); }
    k++;
  }
  const suelto = /\\begin\{(tabular\*?|tabularx)\}/g;
  while ((m = suelto.exec(src))) {
    if (rangos.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const t = tablaDe(src.slice(m.index), true);
    if (t) tablas.push({ ...t, caption: null, k: -1, pos: m.index });
  }
  tablas.sort((a, b) => a.pos - b.pos);
  return { tablas };
}

// ── Dibujo ──────────────────────────────────────────────────────────────

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const ACENTOS = { "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303' };
const ESCAPES = { ',': '\u2009', ';': '\u2005', ' ': ' ', '%': '%', '&': '&', _: '_', '#': '#', $: '$', '{': '{', '}': '}' };
const ETIQUETAS = { textbf: 'b', textit: 'i', emph: 'i', textsl: 'i', texttt: 'code', underline: 'u', textsuperscript: 'sup', textsubscript: 'sub' };
const IGNORAN_ARG = new Set(['hspace', 'vspace', 'label', 'setlength', 'phantom', 'hphantom', 'vphantom', 'footnote', 'rule', 'cline', 'caption', 'bibliographystyle']);
const tipografia = (s) => s.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”');

/**
 * Texto de LaTeX → nodos dentro de `dest`: $mates$, \textbf, \emph, \ref, \cite, acentos, \, ~ y macros del
 * preámbulo (con argumentos). `ctx.tam` recoge el último \footnotesize/\small… que aparezca.
 */
export function texto(s, dest, macros, ctx = {}, prof = 0) {
  let i = 0, buf = '';
  const vaciar = () => { if (buf) { dest.append(document.createTextNode(tipografia(buf))); buf = ''; } };
  const mate = (tex) => { vaciar(); const sp = el('span', 'rv-mate'); renderMate(sp, tex, false); dest.append(sp); };
  while (i < s.length) {
    const c = s[i];
    if (c === '$') {
      let j = i + 1;
      while (j < s.length && (s[j] !== '$' || s[j - 1] === '\\')) j++;
      if (j < s.length) { mate(s.slice(i + 1, j)); i = j + 1; continue; }
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+)\*?/.exec(s.slice(i, i + 40));
      if (m) {
        const nom = m[1];
        const k = i + m[0].length;
        const g = s[k] === '{' ? grupo(s, k) : null;
        if (g && ETIQUETAS[nom]) { vaciar(); const e = el(ETIQUETAS[nom]); texto(g.txt, e, macros, ctx, prof); dest.append(e); i = g.fin; continue; }
        if (g && /^(ref|eqref|autoref|pageref)$/.test(nom)) { vaciar(); const e = el('span', 'rv-ref'); e.dataset.ref = g.txt.trim(); if (nom === 'eqref') e.dataset.eq = '1'; e.textContent = '?'; dest.append(e); i = g.fin; continue; }
        if (g && /^(cite|citep|citet)$/.test(nom)) { vaciar(); const e = el('span', 'rv-cita'); e.dataset.cita = g.txt.trim(); e.textContent = '[?]'; dest.append(e); i = g.fin; continue; }
        if (g && nom === 'textcolor') {
          const g2 = s[g.fin] === '{' ? grupo(s, g.fin) : null;
          if (g2) { vaciar(); const e = el('span'); if (/^[a-zA-Z]+$/.test(g.txt)) e.style.color = g.txt; texto(g2.txt, e, macros, ctx, prof); dest.append(e); i = g2.fin; continue; }
        }
        if (g && IGNORAN_ARG.has(nom)) { i = g.fin; continue; }
        if (TAMANOS[nom] != null) { ctx.tam = TAMANOS[nom]; i = k; continue; }
        if (nom === 'par' || nom === 'newline') { vaciar(); dest.append(el('br')); i = k; continue; }
        const def = macros['\\' + nom];
        if (typeof def === 'string' && prof < 6) {
          const n = Math.max(0, ...Array.from(def.matchAll(/#(\d)/g), (x) => +x[1]));
          const args = [];
          let kk = k;
          for (let a = 0; a < n; a++) {
            while (s[kk] === ' ') kk++;
            if (s[kk] === '{') { const ga = grupo(s, kk); if (!ga) break; args.push(ga.txt); kk = ga.fin; }
            else if (kk < s.length) { args.push(s[kk]); kk++; }
          }
          vaciar();
          texto(def.replace(/#(\d)/g, (_, d) => args[d - 1] ?? ''), dest, macros, ctx, prof + 1);
          i = kk; continue;
        }
        i = k; while (s[i] === ' ') i++; // un comando desconocido se omite (y se come el espacio que lo sigue)
        continue;
      }
      const n = s[i + 1];
      if (n === '(') { const j = s.indexOf('\\)', i + 2); if (j > 0) { mate(s.slice(i + 2, j)); i = j + 2; continue; } }
      if (n === '\\') { vaciar(); dest.append(el('br')); i += 2; continue; }
      if (n in ACENTOS) {
        let t = s[i + 2], avance = 3;
        if (t === '{') { const ga = grupo(s, i + 2); if (ga) { t = ga.txt; avance = ga.fin - i; } }
        else if (t === '\\' && s[i + 3] === 'i') { t = 'i'; avance = 4; }
        buf += ((t || '') + ACENTOS[n]).normalize('NFC'); i += avance; continue;
      }
      buf += ESCAPES[n] ?? ''; i += 2; continue;
    }
    if (c === '~') buf += '\u00a0';
    else if (c !== '{' && c !== '}') buf += c;
    i++;
  }
  vaciar();
}

function figuraTabla(t, macros) {
  const fig = el('figure', 'rawfig');
  const cuerpo = el('div', 'rawfig-c');
  const pie = (() => {
    if (t.caption == null) return null;
    const p = el('figcaption', 'rawcap');
    const n = el('b', 'rawcap-n'); n.dataset.k = String(t.k); p.append(n);
    texto(t.caption, p, macros);
    return p;
  })();
  if (pie && t.capArriba) fig.append(pie);

  const tbl = el('table', 'rawtab');
  if (t.tabcolsep != null) tbl.style.setProperty('--tcs', `${t.tabcolsep}pt`);
  if (t.stretch != null) tbl.style.setProperty('--str', String(t.stretch));
  const tb = el('tbody');
  for (const f of filasDe(t.cuerpo, t.spec).filas) {
    const tr = el('tr');
    for (const c of f.celdas) {
      const td = el('td');
      if (c.span > 1) td.colSpan = c.span;
      if (c.rspan > 1) td.rowSpan = c.rspan;
      td.style.textAlign = { l: 'left', c: 'center', r: 'right' }[c.al] || 'left';
      if (c.top) td.classList.add('rt-' + c.top);
      if (c.bot) td.classList.add('rb-' + c.bot);
      if (c.bl) td.classList.add('rv-bl');
      if (c.br) td.classList.add('rv-br');
      texto(c.txt, td, macros);
      tr.append(td);
    }
    tb.append(tr);
  }
  tbl.append(tb);
  const sc = el('div', 'rawtab-sc'); sc.append(tbl);
  cuerpo.append(sc);

  let nota = null;
  if (t.resto) {
    const ctx = {};
    nota = el('div', 'rawnota');
    texto(t.resto, nota, macros, ctx);
    if (!nota.textContent.trim() && !nota.querySelector('.rv-mate')) nota = null;
    else if (ctx.tam) nota.style.fontSize = `${ctx.tam}em`;
  }
  if (nota) cuerpo.append(nota);
  if (t.tam) cuerpo.style.fontSize = `${t.tam}em`;
  fig.append(cuerpo);
  if (pie && !t.capArriba) fig.append(pie);
  return fig;
}

/** Elemento con la vista previa del bloque, o null si no hay nada que dibujar. */
export function vistaRaw(tex, macros = {}) {
  try {
    const { tablas } = analizarRaw(tex);
    if (!tablas.length) return null;
    const raiz = el('div', 'rawvista');
    for (const t of tablas) raiz.append(figuraTabla(t, macros));
    return raiz;
  } catch (e) {
    return null; // la vista previa nunca debe impedir editar el código
  }
}
