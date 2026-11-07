// Dibuja en el DOM un fragmento de LaTeX de «modo texto» que ya tiene las macros propias expandidas
// (\colorbox, \parbox, \fbox, \small, \fontsize, \textbf, $…$, \par…). Es solo vista previa: el código no se toca.

import { grupo, colorDelPreambulo } from './macros.js?v=2026.11.07-f';
import { renderMate } from './mathjax.js?v=2026.11.07-f';

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

const TAMANOS = { tiny: .5, scriptsize: .7, footnotesize: .8, small: .9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.73, huge: 2.07, Huge: 2.49 };
const COLORES_BASE = { red: '#e00', green: '#0a0', blue: '#00f', black: '#000', white: '#fff', gray: '#808080', grey: '#808080', cyan: '#0bd', magenta: '#d0d', yellow: '#ee0', orange: '#f80', purple: '#808', brown: '#964', darkgray: '#404040', lightgray: '#bfbfbf' };
const ESTILOS = {   // \textXX{…} → etiqueta o clase
  textbf: ['b'], textit: ['i'], emph: ['i'], textsl: ['i'], texttt: ['code', 'rv-code'], underline: ['span', 'rv-underline'], textsc: ['span', 'rv-textsc'],
  textsf: ['span', 'rv-textsf'], textsuperscript: ['sup'], textsubscript: ['sub'], textrm: ['span'], textnormal: ['span'], mbox: ['span'], hbox: ['span'],
};
const IGNORAN = new Set(['label', 'setlength', 'thispagestyle', 'pagestyle', 'phantom', 'hphantom', 'vphantom', 'footnote', 'bibliographystyle', 'cline', 'renewcommand', 'addtolength', 'setcounter']);
const SIN_ARG = new Set(['noindent', 'strut', 'selectfont', 'begingroup', 'endgroup', 'raggedright', 'raggedleft', 'arraybackslash', 'normalfont', 'relax', 'ignorespaces', 'leavevmode', 'indent', 'null', 'protect', 'hfill', 'vfill', 'clearpage', 'newpage']);
const ACENTOS = { "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303' };
const ESCAPES = { ',': '\u2009', ';': '\u2005', ' ': ' ', '%': '%', '&': '&', _: '_', '#': '#', $: '$', '{': '{', '}': '}', '\\': '\n' };

export function colorTex(nombre) {
  const n = String(nombre || '').trim();
  return colorDelPreambulo(n) || COLORES_BASE[n] || (/^[a-zA-Z]+$/.test(n) ? n : null);
}

const tipografia = (s) => s.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”');

function longitud(txt, base = 600) {
  const m = /(-?[\d.]+)\s*(cm|mm|pt|in|em|ex|bp|\\(?:line|text|column)width)?/.exec(String(txt));
  if (!m) return null;
  const v = parseFloat(m[1]), u = m[2] || 'pt';
  if (/width/.test(u)) return { pct: v * 100 };
  return { px: v * ({ cm: 37.8, mm: 3.78, pt: 1.33, in: 96, em: 16, ex: 7, bp: 1.33 }[u] || 1.33) };
}

/** Argumento opcional [..] que empieza en s[i] (con espacios antes). */
function opcional(s, i) {
  let j = i; while (s[j] === ' ') j++;
  if (s[j] !== '[') return null;
  const f = s.indexOf(']', j);
  return f < 0 ? null : { txt: s.slice(j + 1, f), fin: f + 1 };
}
function obligatorio(s, i) { let j = i; while (s[j] === ' ' || s[j] === '\n') j++; return s[j] === '{' ? grupo(s, j) : null; }

function numero(txt) {   // \SI / \num: 1e-3 → 1×10⁻³
  const m = /^\s*([+-]?[\d.,]+)\s*[eE]\s*([+-]?\d+)\s*$/.exec(txt);
  const f = document.createDocumentFragment();
  if (m) { f.append(document.createTextNode(`${m[1]}\u00d710`)); const s = el('sup'); s.textContent = String(+m[2]).replace('-', '\u2212'); f.append(s); }
  else f.append(document.createTextNode(String(txt).trim()));
  return f;
}

function pintar(s, dest, prof) {
  let i = 0, buf = '';
  const vaciar = () => { if (buf) { dest.append(document.createTextNode(tipografia(buf))); buf = ''; } };
  const abrir = (estilo, tag = 'span') => { vaciar(); const sp = el(tag); estilo(sp); dest.append(sp); dest = sp; };   // vale hasta el final del grupo
  const mate = (tex, display = false) => { vaciar(); const sp = el(display ? 'div' : 'span', display ? 'rv-mate' : 'rv-mate-l'); renderMate(sp, tex, display); dest.append(sp); };
  const salto = () => { vaciar(); if (dest.lastChild && dest.lastChild.nodeName !== 'BR') dest.append(el('br')); };
  while (i < s.length) {
    const c = s[i];
    if (c === '$') {
      if (s[i + 1] === '$') { const j = s.indexOf('$$', i + 2); if (j > 0) { mate(s.slice(i + 2, j), true); i = j + 2; continue; } }
      let j = i + 1;
      while (j < s.length && (s[j] !== '$' || s[j - 1] === '\\')) j++;
      if (j < s.length) { mate(s.slice(i + 1, j)); i = j + 1; continue; }
    }
    if (c === '{') {
      const g = grupo(s, i);
      if (g) { vaciar(); const sp = el('span'); pintar(g.txt, sp, prof + 1); dest.append(sp); i = g.fin; continue; }
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z@]+)\*?/.exec(s.slice(i, i + 40));
      if (m) {
        const nom = m[1];
        let k = i + m[0].length;
        // ── órdenes con argumentos ──
        if (ESTILOS[nom]) {
          const g = obligatorio(s, k);
          if (g) { vaciar(); const [tag, cls] = ESTILOS[nom]; const e = el(tag, cls); pintar(g.txt, e, prof + 1); dest.append(e); i = g.fin; continue; }
        }
        if (nom === 'textcolor' || nom === 'colorbox' || nom === 'fcolorbox') {
          const op = opcional(s, k); if (op) k = op.fin;
          const c1 = obligatorio(s, k);
          const c2 = nom === 'fcolorbox' && c1 ? obligatorio(s, c1.fin) : null;
          const cuerpo = obligatorio(s, (c2 || c1 || { fin: k }).fin);
          if (c1 && cuerpo) {
            vaciar();
            const e = el('span');
            const col = colorTex(nom === 'fcolorbox' ? c2.txt : c1.txt);
            if (nom === 'textcolor') e.style.color = col || 'inherit';
            else { e.style.background = col || 'transparent'; e.style.padding = '0 .2em'; if (nom === 'fcolorbox') e.style.border = `1px solid ${colorTex(c1.txt) || '#000'}`; }
            pintar(cuerpo.txt, e, prof + 1); dest.append(e); i = cuerpo.fin; continue;
          }
        }
        if (nom === 'color') { const g = obligatorio(s, k); if (g) { const col = colorTex(g.txt); abrir((e) => { e.style.color = col || 'inherit'; }); i = g.fin; continue; } }
        if (nom === 'fbox' || nom === 'framebox') {
          const g = obligatorio(s, k);
          if (g) { vaciar(); const e = el('span', 'rv-fbox'); pintar(g.txt, e, prof + 1); dest.append(e); i = g.fin; continue; }
        }
        if (nom === 'parbox' || nom === 'makebox') {
          let j = k, o1 = opcional(s, j); while (o1) { j = o1.fin; o1 = opcional(s, j); }
          const w = obligatorio(s, j), cuerpo = w && obligatorio(s, w.fin);
          if (w && cuerpo) {
            vaciar();
            const e = el('span', 'rv-parbox');
            const L = /dimexpr/.test(w.txt) ? { pct: 100 } : longitud(w.txt);
            if (L && L.pct) e.style.width = `${Math.min(100, L.pct)}%`; else if (L && L.px) e.style.width = `${Math.min(700, L.px)}px`;
            pintar(cuerpo.txt, e, prof + 1); dest.append(e); i = cuerpo.fin; continue;
          }
        }
        if (nom === 'fontsize') {
          const a = obligatorio(s, k), b = a && obligatorio(s, a.fin);
          if (a && b) { const pt = parseFloat(a.txt); abrir((e) => { if (pt) e.style.fontSize = `${pt / 10}em`; }); i = b.fin; continue; }
        }
        if (nom === 'ref' || nom === 'eqref' || nom === 'autoref' || nom === 'pageref') {
          const g = obligatorio(s, k);
          if (g) { vaciar(); const e = el('span', 'rv-ref'); e.dataset.ref = g.txt.trim(); if (nom === 'eqref') e.dataset.eq = '1'; e.textContent = '?'; dest.append(e); i = g.fin; continue; }
        }
        if (/^cite[pt]?$/.test(nom)) {
          const op = opcional(s, k); if (op) k = op.fin;
          const g = obligatorio(s, k);
          if (g) { vaciar(); const e = el('span', 'rv-cita'); e.dataset.cita = g.txt.trim(); e.textContent = '[?]'; dest.append(e); i = g.fin; continue; }
        }
        if (nom === 'vspace' || nom === 'hspace') {
          const g = obligatorio(s, k);
          if (g) {
            vaciar(); const L = longitud(g.txt); const px = Math.max(0, Math.min(200, (L && L.px) || 0));
            if (nom === 'vspace') { const e = el('span'); e.style.cssText = `display:block;height:${px}px`; dest.append(e); } else { const e = el('span'); e.style.cssText = `display:inline-block;width:${px}px`; dest.append(e); }
            i = g.fin; continue;
          }
        }
        if (nom === 'SI' || nom === 'si' || nom === 'num' || nom === 'qty') {
          const a = obligatorio(s, k), b = nom === 'SI' || nom === 'qty' ? (a && obligatorio(s, a.fin)) : null;
          if (a && (b || nom === 'si' || nom === 'num')) {
            vaciar();
            if (nom === 'si') dest.append(document.createTextNode(a.txt.replace(/\\/g, '')));
            else { dest.append(numero(a.txt)); if (b) dest.append(document.createTextNode('\u00a0' + b.txt.replace(/\\/g, ''))); }
            i = (b || a).fin; continue;
          }
        }
        if (IGNORAN.has(nom)) { const g = obligatorio(s, k); if (g) { let f = g.fin; if (nom === 'setlength' || nom === 'addtolength' || nom === 'setcounter') { const g2 = obligatorio(s, f); if (g2) f = g2.fin; } i = f; continue; } }
        // ── órdenes de conmutación (valen hasta cerrar el grupo) ──
        if (TAMANOS[nom] != null) { abrir((e) => { e.style.fontSize = `${TAMANOS[nom]}em`; }); i = k; continue; }
        if (nom === 'bfseries') { abrir((e) => { e.style.fontWeight = '700'; }); i = k; continue; }
        if (nom === 'itshape' || nom === 'em' || nom === 'slshape') { abrir((e) => { e.style.fontStyle = 'italic'; }); i = k; continue; }
        if (nom === 'centering') { abrir((e) => { e.style.cssText += 'display:block;text-align:center'; }); i = k; continue; }
        if (nom === 'ttfamily') { abrir((e) => { e.className = 'rv-code'; }); i = k; continue; }
        if (nom === 'par' || nom === 'newline') { salto(); i = k; continue; }
        if (nom === 'today') { vaciar(); dest.append(document.createTextNode(new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' }))); i = k; continue; }
        if (nom === 'quad' || nom === 'qquad') { buf += nom === 'quad' ? '\u2003' : '\u2003\u2003'; i = k; continue; }
        if (SIN_ARG.has(nom)) { i = k; while (s[i] === ' ') i++; continue; }
        i = k; while (s[i] === ' ') i++; continue;   // orden desconocida: se omite
      }
      const n = s[i + 1];
      if (n === '(') { const j = s.indexOf('\\)', i + 2); if (j > 0) { mate(s.slice(i + 2, j)); i = j + 2; continue; } }
      if (n === '\\') { salto(); i += 2; const o = opcional(s, i); if (o && /^[\d.\s]*[a-z]*$/.test(o.txt)) i = o.fin; continue; }
      if (n in ACENTOS) {
        let t = s[i + 2], avance = 3;
        if (t === '{') { const g = grupo(s, i + 2); if (g) { t = g.txt; avance = g.fin - i; } }
        else if (t === '\\' && s[i + 3] === 'i') { t = 'i'; avance = 4; }
        buf += ((t || '') + ACENTOS[n]).normalize('NFC'); i += avance; continue;
      }
      if (n === '\\') { i += 2; continue; }
      buf += ESCAPES[n] ?? ''; i += 2; continue;
    }
    if (c === '~') buf += '\u00a0';
    else if (c === '&' || c === '}') { /* separadores de tabla y llaves sobrantes: no se dibujan */ }
    else if (c === '\n') buf += ' ';
    else buf += c;
    i++;
  }
  vaciar();
}

/** Fragmento de LaTeX (modo texto, macros ya expandidas) → DocumentFragment. */
export function nodoDeTex(tex) {
  const f = document.createDocumentFragment();
  pintar(String(tex ?? ''), f, 0);
  return f;
}
