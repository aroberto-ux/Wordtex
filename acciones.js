// Acciones de la cinta y de los bloques: formato, inserciones en el texto, tablas, figuras, menús.

import { S, E } from './estado.js?v=2026.11.06-b';
import { h, abrirMenu, aviso, pedir } from './ui.js?v=2026.11.06-b';
import { nuevoId } from './modelo.js?v=2026.11.06-b';
import { nodoInline, renderMate, leerInline, rellenar, chipRaw } from './inline-dom.js?v=2026.11.06-b';
import { editarMate } from './matematica.js?v=2026.11.06-b';
import { dlgNota, dlgEnlace, dlgCita, dlgRef, dlgRaw, dlgSimbolo } from './dialogos.js?v=2026.11.06-b';
import { etiquetaNueva } from './numerar.js?v=2026.11.06-b';
import { procesarImagen, marcarLista, chipTermino } from './bloques-dom.js?v=2026.11.06-b';
import { editarTikz } from './tikz-editor.js?v=2026.11.06-b';
import { textoPlano } from './modelo.js?v=2026.11.06-b';
import { parsearInline } from './latex-parse.js?v=2026.11.06-b';
import {
  mapa, bloqueDe, modificar, insertarBloque, eliminarBloque, duplicarBloque, moverBloque, convertirBloque, editarLista,
  guardarPendientes, marcarSucio, numeracion, refrescarDerivados, enfocar, aplicarCambios,
} from './ops.js?v=2026.11.06-b';

// ── Selección ───────────────────────────────────────────────────────────

let ultimoRango = null;
export const edDe = (n) => { const e = n && (n.nodeType === 1 ? n : n.parentElement); const ed = e && e.closest && e.closest('.ed'); return ed && E.bloques.contains(ed) ? ed : null; };

export function seguirSeleccion() {
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    if (edDe(r.startContainer)) ultimoRango = r.cloneRange();
  });
}

export function restaurarRango() {
  if (!ultimoRango) return null;
  const ed = edDe(ultimoRango.startContainer);
  if (!ed || !ed.isConnected) { ultimoRango = null; return null; }
  if (document.activeElement !== ed) ed.focus({ preventScroll: true });
  const s = getSelection(); s.removeAllRanges(); s.addRange(ultimoRango);
  return ed;
}

function avisarEntrada(ed) { ed.dispatchEvent(new Event('input', { bubbles: true })); }

/** Inserta un nodo en línea en la posición del cursor. */
export function insertarEnLinea(nodo, { reemplazaSeleccion = true } = {}) {
  const ed = restaurarRango();
  if (!ed) { aviso('Haz clic primero dentro de un párrafo.', 'info'); return false; }
  const s = getSelection(); const r = s.getRangeAt(0);
  if (reemplazaSeleccion) r.deleteContents();
  r.insertNode(nodo);
  let despues = nodo.nextSibling;
  if (!despues) { despues = document.createTextNode('​'); nodo.after(despues); }
  r.setStartAfter(nodo); r.collapse(true);
  s.removeAllRanges(); s.addRange(r);
  ultimoRango = r.cloneRange();
  avisarEntrada(ed);
  return true;
}

// ── Formato de texto ────────────────────────────────────────────────────

function alternarCodigo() {
  const ed = restaurarRango(); if (!ed) return;
  const s = getSelection(); const r = s.getRangeAt(0);
  const cod = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; return e && e.closest('code'); };
  const a = cod(r.startContainer);
  if (a && a === cod(r.endContainer)) {
    const marca = document.createDocumentFragment();
    while (a.firstChild) marca.append(a.firstChild);
    a.replaceWith(marca);
  } else if (!r.collapsed) {
    const c = document.createElement('code');
    c.append(r.extractContents()); r.insertNode(c);
    r.selectNodeContents(c); s.removeAllRanges(); s.addRange(r);
  } else return;
  avisarEntrada(ed);
}

const EXEC = { b: 'bold', i: 'italic', u: 'underline', st: 'strikeThrough', sub: 'subscript', sup: 'superscript' };
export function formato(cmd) {
  const ed = restaurarRango(); if (!ed) { aviso('Haz clic dentro del texto que quieres formatear.', 'info'); return; }
  if (cmd === 'c') return alternarCodigo();
  // subíndice y superíndice son excluyentes
  if (cmd === 'sub' && document.queryCommandState('superscript')) document.execCommand('superscript');
  if (cmd === 'sup' && document.queryCommandState('subscript')) document.execCommand('subscript');
  document.execCommand('styleWithCSS', false, false);
  document.execCommand(EXEC[cmd]);
  ed.focus();
}

export function estadoFormato() {
  const o = {};
  try { for (const [k, c] of Object.entries(EXEC)) o[k] = document.queryCommandState(c); } catch { /* ignorar */ }
  const s = getSelection();
  if (s.rangeCount) { const e = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement); o.c = !!(e && e.closest('code')); }
  return o;
}

export function alinear(al) {
  const id = S.sel; const b = bloqueDe(id);
  if (!b || b.t !== 'p') { aviso('El alineado se aplica a los párrafos.', 'info'); return; }
  modificar(id, (x) => ({ ...x, al }), { foco: { id, donde: 'fin' } });
}

// ── Inserciones en línea ────────────────────────────────────────────────

export async function accionMate() {
  const r = await editarMate({ titulo: 'Fórmula en el texto', tex: '' });
  if (!r || !r.tex) return;
  insertarEnLinea(nodoInline({ mate: r.tex }));
}

export async function accionNota() {
  const t = await dlgNota();
  if (t) insertarEnLinea(nodoInline({ nota: [{ s: t }] }));
}

export async function accionCita() {
  const r = await dlgCita(S.doc.biblio);
  if (!r) return;
  if (r.nueva) {
    const bib = S.doc.biblio.filter((x) => x.key !== r.nueva.key).concat([r.nueva]);
    S.doc.biblio = bib;
    await S.store.actualizarDocumento(S.did, { biblio: bib });
  }
  insertarEnLinea(nodoInline({ cita: r.claves }));
  refrescarDerivados();
}

/** Secciones, ecuaciones, figuras y tablas numeradas a las que se puede hacer referencia. */
function candidatosRef() {
  const cands = [];
  for (const b of S.bloques) {
    if (!['h', 'eq', 'fig', 'tabla', 'tikz'].includes(b.t)) continue;
    const i = numeracion.info.get(b.id) || {};
    if (!i.num) continue;
    cands.push({
      id: b.id, label: b.label || '', num: i.num, tipo: b.t === 'h' ? 'Sección' : b.t === 'eq' ? 'Ecuación' : b.t === 'fig' || b.t === 'tikz' ? 'Figura' : 'Tabla',
      texto: b.t === 'h' ? leerTexto(b.c) : b.t === 'eq' ? b.tex.slice(0, 40) : leerTexto(b.pie || []),
    });
  }
  return cands;
}

/** Etiqueta del bloque elegido; si no tiene, se le crea una. */
function etiquetaDe(c) {
  if (c.label) return c.label;
  const label = etiquetaNueva(S.bloques, bloqueDe(c.id));
  modificar(c.id, (x) => ({ ...x, label }), { sinUndo: true });
  return label;
}

export async function accionRef() {
  const c = await dlgRef(candidatosRef());
  if (!c) return;
  insertarEnLinea(nodoInline({ ref: etiquetaDe(c) }));
  refrescarDerivados();
}

const leerTexto = (c) => (c || []).map((n) => n.s || (n.mate ? '$' + n.mate + '$' : '')).join('');

export async function accionEnlace() {
  const ed = restaurarRango(); if (!ed) { aviso('Haz clic dentro del texto.', 'info'); return; }
  const s = getSelection(); const r = s.getRangeAt(0);
  const e = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const a = e && e.closest('a.i-url');
  const v = await dlgEnlace({ url: a ? a.getAttribute('data-url') : '', texto: '' }, a || !r.collapsed);
  if (!v) return;
  restaurarRango();
  if (a) { a.setAttribute('data-url', v.url); a.title = v.url; avisarEntrada(ed); return; }
  const nodo = nodoInline({ url: v.url, c: [] });
  if (!getSelection().getRangeAt(0).collapsed) {
    const rr = getSelection().getRangeAt(0);
    nodo.replaceChildren(rr.extractContents());
    rr.insertNode(nodo);
    avisarEntrada(ed);
  } else {
    if (v.texto) nodo.replaceChildren(document.createTextNode(v.texto));
    insertarEnLinea(nodo);
  }
}

export async function accionSimbolo() {
  const s = await dlgSimbolo();
  if (!s) return;
  const ed = restaurarRango(); if (!ed) return;
  document.execCommand('insertText', false, s);
}

export async function accionRawLinea() {
  const t = await dlgRaw();
  if (t) insertarEnLinea(nodoInline({ raw: t }));
}

export function accionSaltoLinea() {
  const ed = restaurarRango(); if (!ed) return;
  document.execCommand('insertLineBreak');
}

/** Clic sobre una fórmula, nota, cita, referencia o LaTeX ya insertados. */
export async function editarExistente(el) {
  const ed = edDe(el); if (!ed) return;
  const fin = () => avisarEntrada(ed);
  if (el.classList.contains('i-mate')) {
    const r = await editarMate({ titulo: 'Fórmula en el texto', tex: el.getAttribute('data-tex') || '' });
    if (!r) return;
    if (!r.tex) { el.remove(); fin(); return; }
    el.setAttribute('data-tex', r.tex); renderMate(el, r.tex); fin();
  } else if (el.classList.contains('i-nota')) {
    const actual = JSON.parse(el.getAttribute('data-nota') || '[]').map((n) => n.s || '').join('');
    const t = await dlgNota(actual);
    if (t === null) return;
    el.setAttribute('data-nota', JSON.stringify([{ s: t }])); fin();
  } else if (el.classList.contains('i-cita')) {
    const r = await dlgCita(S.doc.biblio, el.getAttribute('data-cita'));
    if (!r) return;
    if (r.nueva) { const bib = S.doc.biblio.filter((x) => x.key !== r.nueva.key).concat([r.nueva]); S.doc.biblio = bib; await S.store.actualizarDocumento(S.did, { biblio: bib }); }
    el.setAttribute('data-cita', r.claves); fin(); refrescarDerivados();
  } else if (el.classList.contains('i-ref')) {
    const r = await dlgRef(candidatosRef(), el.getAttribute('data-ref') || '', { conQuitar: true });
    if (!r) return;
    if (r.quitar) { el.remove(); fin(); return; }
    el.setAttribute('data-ref', etiquetaDe(r)); fin(); refrescarDerivados();
  } else if (el.classList.contains('i-raw')) {
    const t = await dlgRaw(el.getAttribute('data-raw') || '');
    if (t === null) return;
    el.replaceWith(chipRaw(t)); fin();
  }
}

// ── Ecuaciones, imágenes ────────────────────────────────────────────────

export async function accionEq(id) {
  const b = bloqueDe(id); if (!b) return;
  const r = await editarMate({ titulo: 'Ecuación', tex: b.tex, bloque: true, opc: { env: b.env, num: b.num, label: b.label } });
  if (!r) return;
  if (!r.tex) { eliminarBloque(id); return; }
  modificar(id, (x) => ({ ...x, tex: r.tex, env: r.env, num: r.num, label: r.label }), { foco: { id, donde: 'fin' } });
}

/** Abre el editor de dibujos TikZ de un bloque. Si se cancela un dibujo recién insertado, se quita. */
export async function accionTikz(id, { nuevo = false } = {}) {
  const b = bloqueDe(id); if (!b) return;
  const r = await editarTikz(b, { nuevo });
  if (!r) { if (nuevo) eliminarBloque(id); return; }
  modificar(id, (x) => ({ ...x, ...r }), { foco: null });
}

/** Clic en el término de un elemento de lista (\item[término]). */
export async function editarTermino(chip) {
  const ed = edDe(chip); if (!ed) return;
  let actual = [];
  try { actual = JSON.parse(chip.dataset.et || '[]'); } catch { /* vacío */ }
  const previo = textoPlano(actual);
  const r = await pedir({ titulo: 'Término', etiqueta: 'Texto del término (para una fórmula escribe $…$)', valor: previo, ok: 'Guardar' });
  if (!r || r.valor === previo) return;
  chip.replaceWith(chipTermino(compactarNodos(parsearInline(r.valor))));
  marcarLista(ed.parentElement);
  ed.dispatchEvent(new Event('input', { bubbles: true }));
}
const compactarNodos = (n) => n.filter((x) => x.s == null || x.s.trim() || n.length === 1);

function nombresDeImagenes(salvo) { return new Set(S.bloques.filter((b) => b.t === 'fig' && b.id !== salvo).map((b) => b.nombre)); }

export function elegirImagen() {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', style: { display: 'none' } });
    inp.addEventListener('change', () => { res(inp.files && inp.files[0] ? inp.files[0] : null); inp.remove(); });
    inp.addEventListener('cancel', () => { res(null); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}

export async function accionImagen(id) {
  const f = await elegirImagen();
  if (!f) return;
  await ponerImagen(id, f);
}

export async function ponerImagen(id, archivo) {
  try {
    const { src, nombre } = await procesarImagen(archivo, nombresDeImagenes(id));
    modificar(id, (x) => { const { ruta, ...r } = x; return { ...r, src, nombre }; }, { foco: { id, donde: 'fin' } });
  } catch (e) { aviso(e.message || 'No se pudo usar la imagen.', 'error', 5000); }
}

export async function crearFiguraDesde(archivo) {
  const id = insertarBloque('fig');
  await ponerImagen(id, archivo);
}

export async function insertarFigura() {
  const f = await elegirImagen();
  if (!f) return;
  await crearFiguraDesde(f);
}

// ── Tablas ──────────────────────────────────────────────────────────────

export function celdaActual() {
  const e = document.activeElement;
  return e && e.classList && e.classList.contains('celda') ? e : null;
}

export function accionTabla(op, valor) {
  const c = celdaActual();
  const id = S.sel; const b = bloqueDe(id);
  if (!b || b.t !== 'tabla') return;
  const f = c ? +c.dataset.fila : 0, k = c ? +c.dataset.col : 0;
  const cols = b.al.length;
  let foco = { idx: f * cols + k, pos: 'inicio' };
  modificar(id, (x) => {
    const t = { ...x, filas: x.filas.map((r) => r.slice()), al: x.al.slice() };
    if (op === 'fila+') { t.filas.splice(f + 1, 0, Array.from({ length: cols }, () => [])); foco = { idx: (f + 1) * cols + k, pos: 'inicio' }; }
    else if (op === 'fila-') { t.filas.splice(f, 0, Array.from({ length: cols }, () => [])); foco = { idx: f * cols + k, pos: 'inicio' }; }
    else if (op === 'borrar-fila') { if (t.filas.length > 1) { t.filas.splice(f, 1); foco = { idx: Math.min(f, t.filas.length - 1) * cols + k, pos: 'inicio' }; } }
    else if (op === 'col+') { t.filas.forEach((r) => r.splice(k + 1, 0, [])); t.al.splice(k + 1, 0, t.al[k]); const nc = cols + 1; foco = { idx: f * nc + k + 1, pos: 'inicio' }; }
    else if (op === 'col-') { t.filas.forEach((r) => r.splice(k, 0, [])); t.al.splice(k, 0, t.al[k]); const nc = cols + 1; foco = { idx: f * nc + k, pos: 'inicio' }; }
    else if (op === 'borrar-col') { if (cols > 1) { t.filas.forEach((r) => r.splice(k, 1)); t.al.splice(k, 1); const nc = cols - 1; foco = { idx: f * nc + Math.min(k, nc - 1), pos: 'inicio' }; } }
    else if (op === 'al') t.al[k] = valor;
    else if (op === 'borde') t.borde = valor;
    else if (op === 'enc') t.enc = !t.enc;
    return t;
  }, { foco: { id, donde: foco } });
}

export function accionFig(op, valor) {
  const id = S.sel; const b = bloqueDe(id);
  if (!b || b.t !== 'fig') return;
  // al mover el ancho se dejan de usar las opciones originales de \includegraphics (escala, alto…)
  if (op === 'ancho') modificar(id, (x) => { const { opcImg, ...r } = x; return { ...r, ancho: valor }; }, { foco: null });
  else if (op === 'quitar') modificar(id, (x) => ({ ...x, src: '' }));
}

/** Teclado: Tab dentro de una tabla. */
export function celdaVecina(c, delta) {
  const todas = Array.from(c.closest('table').querySelectorAll('.celda'));
  return todas[todas.indexOf(c) + delta] || null;
}

// ── Menús ───────────────────────────────────────────────────────────────

export function itemsInsertar(fn = (t, o) => insertarBloque(t, o)) {
  const teo = (tipo, nombre) => ({ texto: nombre, icono: '∎', fn: () => fn('teo', { datos: { tipo } }) });
  return [
    { texto: 'Párrafo', icono: '¶', fn: () => fn('p', { sinReemplazo: true }) },
    { texto: 'Sección', icono: 'H1', fn: () => fn('h', { datos: { n: 1, c: [] } }) },
    { texto: 'Subsección', icono: 'H2', fn: () => fn('h', { datos: { n: 2, c: [] } }) },
    '-',
    { texto: 'Lista con viñetas', icono: '•', fn: () => fn('lista', { datos: { ord: false } }) },
    { texto: 'Lista numerada', icono: '1.', fn: () => fn('lista', { datos: { ord: true } }) },
    { texto: 'Lista de definiciones', icono: '≔', fn: () => fn('lista', { datos: { desc: true, items: [{ c: [{ s: 'Su definición.' }], n: 0, et: [{ s: 'Término' }] }] } }) },
    '-',
    { texto: 'Ecuación…', icono: '∑', fn: async () => { const id = fn('eq', {}); await accionEq(id); } },
    { texto: 'Tabla', icono: '▦', fn: () => fn('tabla', { datos: { filas: 3, cols: 3 } }) },
    { texto: 'Imagen…', icono: '🖼', fn: async () => { const f = await elegirImagen(); if (f) await crearFiguraDesde(f); } },
    { texto: 'Dibujo (TikZ)…', icono: '✎', fn: async () => { const id = fn('tikz', {}); await accionTikz(id, { nuevo: true }); } },
    '-',
    teo('theorem', 'Teorema'), teo('definition', 'Definición'), teo('example', 'Ejemplo'), teo('proof', 'Demostración'), teo('lemma', 'Lema'), teo('remark', 'Observación'),
    '-',
    { texto: 'Cita en bloque', icono: '❝', fn: () => fn('cita', {}) },
    { texto: 'Resumen', icono: 'Ab', fn: () => fn('resumen', {}) },
    { texto: 'Código', icono: '</>', fn: () => fn('cod', {}) },
    { texto: 'Índice general', icono: '☰', fn: () => fn('toc', { sinReemplazo: true }) },
    { texto: 'Salto de página', icono: '⤓', fn: () => fn('salto', { sinReemplazo: true }) },
    { texto: 'LaTeX avanzado', icono: '{ }', fn: () => fn('raw', {}) },
  ];
}

export function menuInsertar(ancla) { abrirMenu(ancla, itemsInsertar()); }

export function menuBloque(ancla, id) {
  const b = bloqueDe(id); if (!b) return;
  const i = S.bloques.findIndex((x) => x.id === id);
  abrirMenu(ancla, [
    { texto: 'Subir', icono: '↑', deshabilitado: i === 0, fn: () => moverBloque(id, -1) },
    { texto: 'Bajar', icono: '↓', deshabilitado: i === S.bloques.length - 1, fn: () => moverBloque(id, 1) },
    { texto: 'Duplicar', icono: '⧉', fn: () => duplicarBloque(id) },
    { texto: 'Insertar debajo…', icono: '＋', fn: () => { S.sel = id; setTimeout(() => abrirMenu(ancla, itemsInsertar(), {}), 0); } },
    '-',
    { texto: 'Eliminar', icono: '🗑', peligro: true, fn: () => eliminarBloque(id) },
  ]);
}

export function alElegirEstilo(v) {
  const id = S.sel; const b = bloqueDe(id);
  if (!b) return;
  if (v === 'p') convertirBloque(id, 'p');
  else if (v.startsWith('h')) convertirBloque(id, 'h', +v.slice(1));
  else if (v.startsWith('teo:')) convertirBloque(id, 'teo', v.slice(4));
  else if (v === 'cita' || v === 'resumen') convertirBloque(id, v);
}

export function alternarLista(ord) {
  const id = S.sel; const b = bloqueDe(id);
  if (!b) return;
  if (b.t === 'lista') { if (b.ord === ord) convertirBloque(id, 'p'); else convertirBloque(id, 'lista', ord ? 'ord' : 'sin'); }
  else if (b.t === 'p' || b.t === 'h') convertirBloque(id, 'lista', ord ? 'ord' : 'sin');
}

export function sangria(delta) {
  const e = document.activeElement;
  if (!e || !e.classList.contains('li')) { aviso('La sangría se aplica a elementos de una lista.', 'info'); return; }
  cambiarNivelItem(e, delta);
}

export function cambiarNivelItem(li, delta) {
  const n = Math.max(0, Math.min(2, (+li.dataset.n || 0) + delta));
  if (n === +li.dataset.n) return;
  // no se puede saltar un nivel respecto al elemento anterior
  const prev = li.previousElementSibling;
  const max = prev ? (+prev.dataset.n || 0) + 1 : 0;
  li.dataset.n = Math.min(n, max);
  marcarLista(li.parentElement);
  marcarSucio(li.closest('.bq').dataset.id);
}
