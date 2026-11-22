// Coloreado de sintaxis de LaTeX (al estilo Overleaf) para la vista de código.
// Función pura: texto → HTML con <span class="tk-…">. NUNCA añade ni quita caracteres (solo envuelve), porque se dibuja
// justo debajo de un <textarea> transparente y las dos capas deben coincidir letra por letra. Se prueba con Node.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sp = (c, t) => (t ? `<span class="tk-${c}">${esc(t)}</span>` : '');

const ENV_MATE = /^(equation|align|gather|multline|flalign|eqnarray|alignat|xalignat|displaymath|math|split|aligned|gathered|alignedat|cases|[pbBvV]?matrix|smallmatrix|array|subequations)\*?$/;
const ENV_LITERAL = /^(verbatim\*?|Verbatim\*?|lstlisting|minted|comment|filecontents\*?)$/;
const SECCION = /^(part|chapter|section|subsection|subsubsection|paragraph|subparagraph|title|author|date|caption|footnote)\*?$/;
const REFERENCIA = /^(label|ref|eqref|pageref|autoref|nameref|cref|Cref|cite|citep|citet|citeauthor|nocite|input|include|includegraphics|usepackage|documentclass|bibliography|bibliographystyle|addbibresource|url|href|hyperref)\*?$/;

/** @param {string} s @returns {string} HTML (el mismo texto, con spans) */
export function resaltarTex(s) {
  s = String(s ?? '');
  const n = s.length;
  let out = '';
  let i = 0;
  let dolar = false, dolar2 = false, paren = false, corch = false, envMate = 0;
  const enMate = () => dolar || dolar2 || paren || corch || envMate > 0;
  const cmdCls = () => (enMate() ? 'mcmd' : 'cmd');

  // Llaves de una cadena corta tipo {nombre} que empieza en i (sin anidar); devuelve {txt, fin} o null.
  const arg = (j) => {
    let k = j; while (s[k] === ' ' || s[k] === '\t') k++;
    if (s[k] !== '{') return null;
    const f = s.indexOf('}', k);
    if (f < 0) return null;
    const txt = s.slice(k + 1, f);
    if (txt.includes('\n') || txt.includes('{')) return null;
    return { esp: s.slice(j, k), txt, fin: f + 1 };
  };

  while (i < n) {
    const c = s[i];
    if (c === '%') {                                  // comentario hasta fin de línea
      let f = s.indexOf('\n', i); if (f < 0) f = n;
      out += sp('c', s.slice(i, f)); i = f; continue;
    }
    if (c === '\\') {
      const d = s[i + 1];
      if (d === undefined) { out += sp(cmdCls(), '\\'); i++; continue; }
      if (!/[a-zA-Z@]/.test(d)) {                     // símbolo de control: \\ \% \$ \{ \( \[ …
        const t = c + d;
        if (d === '(') { paren = true; out += sp('mdel', t); }
        else if (d === ')') { paren = false; out += sp('mdel', t); }
        else if (d === '[') { corch = true; out += sp('mdel', t); }
        else if (d === ']') { corch = false; out += sp('mdel', t); }
        else if (d === '\\') out += sp('amp', t);
        else out += sp(cmdCls(), t);
        i += 2; continue;
      }
      const m = /^\\[a-zA-Z@]+\*?/.exec(s.slice(i, i + 40));
      const nombre = m[0].slice(1);
      const base = nombre.replace(/\*$/, '');
      i += m[0].length;
      if (base === 'begin' || base === 'end') {
        out += sp('kw', m[0]);
        const a = arg(i);
        if (a) {
          out += esc(a.esp) + sp('br', '{') + sp('env', a.txt) + sp('br', '}');
          i = a.fin;
          if (ENV_MATE.test(a.txt)) envMate = Math.max(0, envMate + (base === 'begin' ? 1 : -1));
          if (base === 'begin' && ENV_LITERAL.test(a.txt)) {   // el contenido se deja tal cual hasta \end{…}
            const fin = s.indexOf(`\\end{${a.txt}}`, i);
            const f = fin < 0 ? n : fin;
            out += sp('lit', s.slice(i, f)); i = f;
          }
        }
        continue;
      }
      if (base === 'verb') {                          // \verb|…|
        const dl = s[i];
        if (dl && !/[a-zA-Z\s]/.test(dl)) {
          const f = s.indexOf(dl, i + 1);
          const e = f < 0 || s.slice(i, f).includes('\n') ? i + 1 : f + 1;
          out += sp('kw', m[0]) + sp('lit', s.slice(i, e)); i = e; continue;
        }
      }
      if (SECCION.test(nombre)) { out += sp('sec', m[0]); continue; }
      out += sp(cmdCls(), m[0]);
      if (REFERENCIA.test(nombre)) {
        let j = i;
        const o = /^\s*\[[^\]\n]*\]/.exec(s.slice(j, j + 200));   // opciones [..] se dejan como están
        if (o) { out += esc(o[0]); j += o[0].length; }
        const a = arg(j);
        if (a) { out += esc(a.esp) + sp('br', '{') + sp('ref', a.txt) + sp('br', '}'); j = a.fin; }
        i = j;
      }
      continue;
    }
    if (c === '$') {
      if (s[i + 1] === '$') { dolar2 = !dolar2; out += sp('mdel', '$$'); i += 2; }
      else { dolar = !dolar; out += sp('mdel', '$'); i++; }
      continue;
    }
    if (c === '{' || c === '}') { out += sp('br', c); i++; continue; }
    if (c === '&') { out += sp('amp', c); i++; continue; }
    // texto corrido hasta el siguiente carácter especial
    let j = i + 1;
    while (j < n && !'%\\${}&'.includes(s[j])) j++;
    const trozo = s.slice(i, j);
    out += enMate() ? sp('m', trozo) : esc(trozo);
    i = j;
  }
  return out;
}
