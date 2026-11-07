// Acciones de la cinta y de los bloques: formato, inserciones en el texto, tablas, figuras, menús.

import { S, E } from './estado.js?v=2026.11.07-j';
import { h, abrirMenu, aviso, pedir } from './ui.js?v=2026.11.07-j';
import { nuevoId } from './modelo.js?v=2026.11.07-j';
import { nodoInline, renderMate, leerInline, rellenar, chipRaw } from './inline-dom.js?v=2026.11.07-j';
import { editarMate } from './matematica.js?v=2026.11.07-j';
import { dlgNota, dlgEnlace, dlgCita, dlgRef, dlgRaw, dlgSimbolo } from './dialogos.js?v=2026.11.07-j';
import { etiquetaNueva } from './numerar.js?v=2026.11.07-j';
import { procesarImagen, marcarLista, chipTermino, NIVELES_LISTA } from './bloques-dom.js?v=2026.11.07-j';
import { editarTikz } from './tikz-editor.js?v=2026.11.07-j';
import { textoPlano } from './modelo.js?v=2026.11.07-j';
import { parsearInline, parsearTex } from './latex-parse.js?v=2026.11.07-j';
import { generarTex } from './latex-gen.js?v=2026.11.07-j';
import {
  mapa, bloqueDe, modificar, insertarBloque, eliminarBloque, duplicarBloque, moverBloque, convertirBloque, editarLista,
  guardarPendientes, marcarSucio, numeracion, refrescarDerivados, enfocar, aplicarCambios,
} from './ops.js?v=2026.11.07-j';

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

/**
 * Reintenta convertir un bloque «LaTeX avanzado» en elementos editables volviéndolo a interpretar con
 * el parser actual. Útil para documentos guardados antes de que el parser supiera reconocer algo
 * (listas, tablas con multirow, etc.). Devuelve cuántos bloques nativos se obtuvieron, o 0 si no se pudo.
 */
export function reinterpretarRaw(id) {
  const b = bloqueDe(id);
  if (!b || b.t !== 'raw') return 0;
  let bloques = [];
  try {
    const m = parsearTex(`\\documentclass{article}\n\\begin{document}\n${b.tex}\n\\end{document}`);
    bloques = m.bloques;
  } catch { aviso('No se pudo reinterpretar este bloque.', 'error', 4000); return 0; }
  // No hay mejora real si: vuelve a salir un único bloque raw, o un único párrafo cuyo contenido es
  // un solo fragmento LaTeX crudo (el mismo comando que no se sabe representar, ahora dentro de un p).
  const u = bloques.length === 1 ? bloques[0] : null;
  const sigueCrudo = u && (u.t === 'raw' || (u.t === 'p' && (u.c || []).length === 1 && u.c[0].raw != null));
  if (!bloques.length || sigueCrudo) { aviso('Este bloque no se puede convertir todavía; se queda como LaTeX avanzado.', 'info', 5000); return 0; }
  // Garantía de que no se pierde nada: al regenerar los bloques nuevos y volver a interpretarlos, el
  // modelo debe ser el mismo (estabilidad semántica). Si cambia, el fragmento dependía del contexto o
  // no es representable sin pérdida: se deja como LaTeX avanzado. No se compara el texto crudo porque
  // el generador puede reformatear espacios/saltos de forma inofensiva.
  const sinIds = (bs) => bs.map(({ id: _i, orden: _o, ...r }) => r);
  const regenerado = generarTex({ cfg: S.doc.cfg, biblio: [], extra: '' }, bloques).tex;
  let reparsado;
  try { reparsado = parsearTex(regenerado).bloques; } catch { reparsado = null; }
  if (!reparsado || JSON.stringify(sinIds(reparsado)) !== JSON.stringify(sinIds(bloques))) {
    aviso('No se pudo convertir sin cambiar el contenido; se queda como LaTeX avanzado.', 'info', 5000); return 0;
  }
  editarLista((l) => {
    const i = l.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const orden = l[i].orden;
    const nuevos = bloques.map((nb, k) => ({ ...nb, id: k === 0 ? id : nuevoId('b'), ...(k === 0 ? { orden } : {}) }));
    l.splice(i, 1, ...nuevos);
  }, { foco: { id, donde: 'inicio' } });
  aviso(`Convertido en ${bloques.length} elemento${bloques.length === 1 ? '' : 's'} editable${bloques.length === 1 ? '' : 's'}.`, 'ok', 3500);
  return bloques.length;
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

const celdaContenido = (c) => Array.isArray(c) ? c : (c && Array.isArray(c.c) ? c.c : []);
const celdaCubierta = (c) => !!(c && !Array.isArray(c) && c.cover);
const celdaFusionada = (c) => !!(c && !Array.isArray(c) && !c.cover && ((c.colspan || 1) > 1 || (c.rowspan || 1) > 1));
const tablaFusionada = (t) => t.filas.some((r) => r.some((c) => celdaFusionada(c)));
const contenidoVacio = (c) => !celdaContenido(c).some((n) => n.s == null || String(n.s).trim());
const simplificarSpec = (t) => { delete t.spec; delete t.anchoTab; delete t.env; };

export function accionTabla(op, valor) {
  const c = celdaActual();
  const id = S.sel; const b = bloqueDe(id);
  if (!b || b.t !== 'tabla') return;
  const f = c ? +c.dataset.fila : 0, k = c ? +c.dataset.col : 0;
  const cols = b.al.length;
  const estructural = ['fila+', 'fila-', 'borrar-fila', 'col+', 'col-', 'borrar-col'].includes(op);
  if (estructural && tablaFusionada(b)) {
    aviso('Para insertar o eliminar filas/columnas, separa primero las celdas fusionadas. Así no se pierde la estructura LaTeX.', 'info', 6000);
    return;
  }
  // objeto mutable: `modificar` recibe esta misma referencia antes de ejecutar la transformación
  const foco = { fila: f, col: k, pos: 'inicio' };
  let mensaje = '';
  modificar(id, (x) => {
    const t = { ...x, filas: JSON.parse(JSON.stringify(x.filas)), al: x.al.slice() };
    if (op === 'fila+') { t.filas.splice(f + 1, 0, Array.from({ length: cols }, () => [])); foco.fila = f + 1; }
    else if (op === 'fila-') { t.filas.splice(f, 0, Array.from({ length: cols }, () => [])); foco.fila = f; }
    else if (op === 'borrar-fila') { if (t.filas.length > 1) { t.filas.splice(f, 1); foco.fila = Math.min(f, t.filas.length - 1); } }
    else if (op === 'col+') { t.filas.forEach((r) => r.splice(k + 1, 0, [])); t.al.splice(k + 1, 0, t.al[k]); foco.col = k + 1; simplificarSpec(t); }
    else if (op === 'col-') { t.filas.forEach((r) => r.splice(k, 0, [])); t.al.splice(k, 0, t.al[k]); foco.col = k; simplificarSpec(t); }
    else if (op === 'borrar-col') { if (cols > 1) { t.filas.forEach((r) => r.splice(k, 1)); t.al.splice(k, 1); foco.col = Math.min(k, cols - 2); simplificarSpec(t); } }
    else if (op === 'al') {
      t.al[k] = valor;
      const actual = t.filas[f] && t.filas[f][k];
      if (actual && !Array.isArray(actual) && !actual.cover) { actual.al = valor; if (actual.colspan > 1) actual.spec = valor; }
      simplificarSpec(t);
    } else if (op === 'borde') { t.borde = valor; simplificarSpec(t); }
    else if (op === 'enc') t.enc = !t.enc;
    else if (op === 'unir-derecha') {
      const a = t.filas[f] && t.filas[f][k], d = t.filas[f] && t.filas[f][k + 1];
      if (k + 1 >= cols || celdaCubierta(a) || celdaFusionada(a) || celdaCubierta(d) || celdaFusionada(d)) mensaje = 'Solo se pueden unir dos celdas simples contiguas.';
      else if (!contenidoVacio(d)) mensaje = 'La celda de la derecha debe estar vacía para evitar perder texto.';
      else { t.filas[f][k] = { c: celdaContenido(a), colspan: 2, al: t.al[k], spec: t.al[k] }; t.filas[f][k + 1] = { cover: [f, k] }; }
    } else if (op === 'unir-abajo') {
      const a = t.filas[f] && t.filas[f][k], d = t.filas[f + 1] && t.filas[f + 1][k];
      if (f + 1 >= t.filas.length || celdaCubierta(a) || celdaFusionada(a) || celdaCubierta(d) || celdaFusionada(d)) mensaje = 'Solo se pueden unir dos celdas simples contiguas.';
      else if (!contenidoVacio(d)) mensaje = 'La celda inferior debe estar vacía para evitar perder texto.';
      else { t.filas[f][k] = { c: celdaContenido(a), rowspan: 2, anchoFila: '*' }; t.filas[f + 1][k] = { cover: [f, k] }; }
    } else if (op === 'separar') {
      const a = t.filas[f] && t.filas[f][k];
      if (!celdaFusionada(a)) mensaje = 'La celda actual no está fusionada.';
      else {
        const rs = a.rowspan || 1, cs = a.colspan || 1;
        for (let y = f; y < f + rs; y++) for (let z = k; z < k + cs; z++) t.filas[y][z] = [];
        t.filas[f][k] = a.c || [];
      }
    }
    return t;
  }, { foco: { id, donde: foco } });
  if (mensaje) aviso(mensaje, 'info', 5000);
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
    // solo en «LaTeX avanzado»: reintentar convertirlo en elementos editables con el parser actual
    ...(b.t === 'raw' ? ['-', { texto: 'Convertir en editable', icono: '↺', fn: () => reinterpretarRaw(id) }] : []),
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
  const n = Math.max(0, Math.min(NIVELES_LISTA - 1, (+li.dataset.n || 0) + delta));
  if (n === +li.dataset.n) return;
  // no se puede saltar un nivel respecto al elemento anterior
  const prev = li.previousElementSibling;
  const max = prev ? (+prev.dataset.n || 0) + 1 : 0;
  li.dataset.n = Math.min(n, max);
  marcarLista(li.parentElement);
  marcarSucio(li.closest('.bq').dataset.id);
}
