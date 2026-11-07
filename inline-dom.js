// Texto en línea del modelo ⇄ DOM editable (contenteditable).

import { compactar } from './modelo.js?v=2026.11.07-m';
import { vistaRawInline, usarPintorInline } from './vista-latex.js?v=2026.11.07-m';
import { renderMate as componerMate } from './mathjax.js?v=2026.11.07-m';

/**
 * Fórmula dentro de `el` con MathJax. Es asíncrona: deja un marcador y compone por lotes; devuelve una promesa
 * {ok, error} que se cumple al terminar (los llamadores que no la necesitan la ignoran).
 */
export function renderMate(el, tex, display = false) {
  return componerMate(el, tex, display);
}

const el = (tag, cls, attrs = {}) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function envolver(n, texto) {
  let cur = document.createTextNode(texto);
  const cadena = [['c', 'code'], ['sub', 'sub'], ['sup', 'sup'], ['st', 's'], ['u', 'u'], ['i', 'i'], ['b', 'b']];
  for (const [k, tag] of cadena) if (n[k]) { const e = document.createElement(tag); e.append(cur); cur = e; }
  return cur;
}

export function nodoInline(n) {
  if (typeof n === 'string') n = { s: n };
  if (n.s != null) return envolver(n, n.s);
  if (n.br) return document.createElement('br');
  if (n.mate != null) {
    const e = el('span', 'i-mate', { contenteditable: 'false', 'data-tex': n.mate, title: 'Clic para editar la fórmula' });
    renderMate(e, n.mate);
    return e;
  }
  if (n.nota) return el('span', 'i-nota', { contenteditable: 'false', 'data-nota': JSON.stringify(n.nota), title: 'Nota al pie: clic para editar' });
  if (n.cita != null) return el('span', 'i-cita', { contenteditable: 'false', 'data-cita': n.cita, title: 'Cita bibliográfica' });
  if (n.ref != null) return el('span', 'i-ref', { contenteditable: 'false', 'data-ref': n.ref, ...(n.eq ? { 'data-eq': '1' } : {}), title: n.eq ? 'Referencia a ecuación (\\eqref)' : 'Referencia cruzada' });
  if (n.url != null) {
    const a = el('a', 'i-url', { 'data-url': n.url, title: n.url + ' (Ctrl+clic para abrir)' });
    a.append(pintarInline(n.c && n.c.length ? n.c : [{ s: n.url }]));
    return a;
  }
  if (n.raw != null) return chipRaw(n.raw);
  return document.createTextNode('');
}

/**
 * Fragmento de LaTeX que se conserva tal cual. Si se sabe mostrar (\textcolor, \textsc, \today, \LaTeX,
 * \verb, {\small …}…) se ve renderizado; si no, se ve el código. El código original va en data-raw.
 */
export function chipRaw(raw) {
  const e = el('span', 'i-raw', { contenteditable: 'false', 'data-raw': raw });
  let vista = null;
  try { vista = vistaRawInline(raw); } catch { /* sin vista */ }
  if (vista) { e.classList.add('vista'); e.title = `LaTeX: ${raw.length > 160 ? raw.slice(0, 158) + '…' : raw}\nClic para editar`; e.append(vista); }
  else { e.title = 'Código LaTeX que se conserva tal cual: clic para editar'; e.textContent = raw.length > 28 ? raw.slice(0, 26) + '…' : raw; }
  return e;
}

export function pintarInline(nodos) {
  const f = document.createDocumentFragment();
  for (const n of nodos || []) f.append(nodoInline(n));
  return f;
}

export function rellenar(contenedor, nodos) {
  contenedor.replaceChildren(pintarInline(nodos));
}

const MARCAS_TAG = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 'st', STRIKE: 'st', DEL: 'st', SUB: 'sub', SUP: 'sup', CODE: 'c' };

function leer(raiz, marcas, out) {
  for (const n of raiz.childNodes) {
    if (n.nodeType === 3) {
      const s = n.nodeValue.replace(/[ ​]/g, (c) => (c === '​' ? '' : ' ')).replace(/\n/g, ' ');
      if (s) out.push({ s, ...marcas });
      continue;
    }
    if (n.nodeType !== 1) continue;
    const c = n.classList;
    if (n.tagName === 'BR') { out.push({ br: 1 }); continue; }
    if (c.contains('i-mate')) { out.push({ mate: n.getAttribute('data-tex') || '' }); continue; }
    if (c.contains('i-nota')) { try { out.push({ nota: JSON.parse(n.getAttribute('data-nota') || '[]') }); } catch { /* ignorar */ } continue; }
    if (c.contains('i-cita')) { out.push({ cita: n.getAttribute('data-cita') || '' }); continue; }
    if (c.contains('i-ref')) { out.push(n.hasAttribute('data-eq') ? { ref: n.getAttribute('data-ref') || '', eq: 1 } : { ref: n.getAttribute('data-ref') || '' }); continue; }
    if (c.contains('i-raw')) { out.push({ raw: n.getAttribute('data-raw') || '' }); continue; }
    if (c.contains('li-et')) continue; // el término de una lista de descripción se lee aparte
    if (c.contains('i-url')) { const sub = []; leer(n, {}, sub); out.push({ url: n.getAttribute('data-url') || '', c: compactar(sub) }); continue; }
    const m = MARCAS_TAG[n.tagName];
    if (m) { leer(n, { ...marcas, [m]: 1 }, out); continue; }
    if (n.style && (n.style.fontWeight === 'bold' || +n.style.fontWeight >= 600)) { leer(n, { ...marcas, b: 1 }, out); continue; }
    if (n.style && n.style.fontStyle === 'italic') { leer(n, { ...marcas, i: 1 }, out); continue; }
    if (n.tagName === 'DIV' || n.tagName === 'P') { if (out.length) out.push({ br: 1 }); }
    leer(n, marcas, out);
  }
}

/** Contenido de un elemento editable → nodos del modelo. */
export function leerInline(raiz) {
  const out = [];
  leer(raiz, {}, out);
  while (out.length && out[out.length - 1].br) out.pop();
  return compactar(out);
}

/** Pone números a notas, citas y referencias que ya están en la página. */
export function numerarInline(raiz, num, biblio) {
  let nota = 0;
  for (const e of raiz.querySelectorAll('.i-nota')) { nota++; e.textContent = String(nota); }
  for (const e of raiz.querySelectorAll('.i-cita, .rv-cita')) {
    const claves = (e.getAttribute('data-cita') || '').split(',').map((x) => x.trim()).filter(Boolean);
    const n = claves.map((k) => num.citas.get(k) || '?');
    e.textContent = `[${n.join(', ')}]`;
    e.classList.toggle('rota', n.includes('?'));
  }
  for (const e of raiz.querySelectorAll('.i-ref, .rv-ref')) {
    const t = num.etiquetas.get(e.getAttribute('data-ref') || e.dataset.ref || '');
    e.textContent = t ? ((e.hasAttribute('data-eq')) ? `(${t})` : t) : '?';
    e.classList.toggle('rota', !t);
  }
}

usarPintorInline(pintarInline);
