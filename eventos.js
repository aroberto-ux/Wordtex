// Teclado, pegado, clics y arrastre dentro de la página de edición.

import { S, E } from './estado.js?v=2026.11.06-c';
import { abrirMenu, aviso } from './ui.js?v=2026.11.06-c';
import { nuevoId, bloqueNuevo, urlSegura } from './modelo.js?v=2026.11.06-c';
import { leerInline } from './inline-dom.js?v=2026.11.06-c';
import { autoAlto, marcarLista, actualizarVistaRaw } from './bloques-dom.js?v=2026.11.06-c';
import {
  mapa, bloqueDe, indiceDe, editablesDe, colocarCursor, marcarSucio, guardarPendientes, editarLista, modificar, reconciliar, enfocar,
  dividirBloque, fusionarConAnterior, eliminarBloque, moverBloqueA, deshacer, rehacer, insertarBloque, convertirBloque,
} from './ops.js?v=2026.11.06-c';
import {
  edDe, menuBloque, accionEq, accionImagen, editarExistente, celdaVecina, accionTabla, itemsInsertar, cambiarNivelItem, crearFiguraDesde,
  accionEnlace, formato, accionTikz, editarTermino,
} from './acciones.js?v=2026.11.06-c';

const FILA_DE = (ed) => ed.closest('.bq');

// ── Posición del cursor dentro de un campo editable ────────────────────

function vacioAntes(ed, r) {
  const pre = document.createRange(); pre.selectNodeContents(ed); pre.setEnd(r.startContainer, r.startOffset);
  const f = pre.cloneContents();
  f.querySelectorAll('.li-et').forEach((x) => x.remove()); // el término de la lista no cuenta como texto
  return !f.textContent.replace(/​/g, '') && !f.querySelector('.i-mate,.i-nota,.i-cita,.i-ref,.i-raw,br');
}
function vacioDespues(ed, r) {
  const post = document.createRange(); post.selectNodeContents(ed); post.setStart(r.endContainer, r.endOffset);
  const f = post.cloneContents();
  return !f.textContent.replace(/​/g, '') && !f.querySelector('.i-mate,.i-nota,.i-cita,.i-ref,.i-raw,br');
}
function enBorde(ed) {
  const s = getSelection();
  if (!s.rangeCount) return {};
  const r = s.getRangeAt(0);
  return { colapsado: r.collapsed, inicio: vacioAntes(ed, r), fin: vacioDespues(ed, r) };
}
const esVacio = (ed) => !ed.textContent.replace(/​/g, '').trim() && !ed.querySelector('.i-mate,.i-nota,.i-cita,.i-ref,.i-raw');

function lineaExtremo(ed, arriba) {
  const s = getSelection(); if (!s.rangeCount) return false;
  const r = s.getRangeAt(0).cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect) { const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; rect = el.getBoundingClientRect(); }
  const e = ed.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(ed).lineHeight) || 22;
  return arriba ? rect.top - e.top < lh * 0.8 : e.bottom - rect.bottom < lh * 0.8;
}

function dividirEd(ed) {
  const s = getSelection(); const r = s.getRangeAt(0);
  if (!r.collapsed) r.deleteContents();
  const post = document.createRange(); post.setStart(r.endContainer, r.endOffset); post.setEnd(ed, ed.childNodes.length);
  const tmp = document.createElement('div'); tmp.append(post.extractContents());
  return { antes: leerInline(ed), despues: leerInline(tmp) };
}

function vecino(ed, delta) {
  const todos = Array.from(E.bloques.querySelectorAll('.ed, textarea.cod-ta, textarea.raw-ta')).filter((x) => !x.classList.contains('celda') || delta !== 0);
  const i = todos.indexOf(ed);
  return todos[i + delta] || null;
}

// ── Teclado ─────────────────────────────────────────────────────────────

function alTeclado(e) {
  const t = e.target;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); guardarPendientes(true); deshacer(); return; }
  if (ctrl && ((e.shiftKey && e.key.toLowerCase() === 'z') || (!e.shiftKey && e.key.toLowerCase() === 'y'))) { e.preventDefault(); guardarPendientes(true); rehacer(); return; }
  if (ctrl && e.key.toLowerCase() === 'k' && t.classList && t.classList.contains('ed')) { e.preventDefault(); accionEnlace(); return; }
  if (ctrl && e.key.toLowerCase() === 'e' && t.classList && t.classList.contains('ed')) { e.preventDefault(); formato('c'); return; }
  if (t.classList && t.classList.contains('eq-vista') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); accionEq(FILA_DE(t).dataset.id); return; }
  if (t.classList && t.classList.contains('tikz-vista') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); accionTikz(FILA_DE(t).dataset.id); return; }
  if (!t.classList || !t.classList.contains('ed')) {
    if (t.tagName === 'TEXTAREA' && t.classList.contains('cod-ta') && e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); }
    return;
  }
  const bq = FILA_DE(t); const id = bq.dataset.id; const b = bloqueDe(id);
  if (!b) return;
  const bd = enBorde(t);

  if (e.key === 'Enter' && !ctrl) {
    if (e.isComposing) return;
    if (t.classList.contains('celda')) {
      e.preventDefault();
      const todas = Array.from(bq.querySelectorAll('.celda'));
      const cols = bq.querySelectorAll('tbody tr:first-child .celda').length;
      const sig = todas[todas.indexOf(t) + cols];
      if (sig) colocarCursor(sig, 'fin');
      return;
    }
    if (t.classList.contains('pie') || b.t === 'h' && e.shiftKey) { e.preventDefault(); return; }
    if (e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
    if (b.t === 'p' || b.t === 'h') {
      e.preventDefault();
      const { antes, despues } = dividirEd(t);
      dividirBloque(id, antes, despues);
      return;
    }
    if (t.classList.contains('li')) { e.preventDefault(); enterEnLista(t, bq, b); return; }
    // enunciados, citas y resúmenes: salto de línea dentro del mismo bloque
    e.preventDefault(); document.execCommand('insertLineBreak');
    return;
  }

  if (e.key === 'Tab' && !ctrl) {
    if (t.classList.contains('li')) { e.preventDefault(); cambiarNivelItem(t, e.shiftKey ? -1 : 1); return; }
    if (t.classList.contains('celda')) {
      e.preventDefault();
      const n = celdaVecina(t, e.shiftKey ? -1 : 1);
      if (n) colocarCursor(n, 'inicio');
      else if (!e.shiftKey) { S.sel = id; accionTabla('fila+'); }
      return;
    }
  }

  if (e.key === 'Backspace' && bd.colapsado && bd.inicio) {
    if (t.classList.contains('li')) {
      const n = +t.dataset.n || 0;
      if (n > 0) { e.preventDefault(); cambiarNivelItem(t, -1); return; }
      e.preventDefault(); borrarItem(t, bq, b); return;
    }
    if (b.t === 'p' || b.t === 'h') {
      if (b.t === 'h' && !esVacio(t)) { e.preventDefault(); convertirBloque(id, 'p'); return; }
      const i = indiceDe(id);
      if (i === 0 && !esVacio(t)) { e.preventDefault(); return; }
      e.preventDefault();
      guardarPendientes(true);
      if (esVacio(t)) { if (S.bloques.length > 1) eliminarBloque(id); return; }
      if (!fusionarConAnterior(id)) { const v = vecino(t, -1); if (v) colocarCursor(v, 'fin'); }
      return;
    }
  }

  if (e.key === '/' && b.t === 'p' && esVacio(t) && !ctrl) {
    e.preventDefault();
    S.sel = id;
    abrirMenu(t, itemsInsertar());
    return;
  }

  // moverse entre bloques con las flechas
  if (!e.shiftKey && !ctrl && !e.altKey && !t.classList.contains('celda')) {
    if (e.key === 'ArrowUp' && bd.colapsado && lineaExtremo(t, true)) { const v = vecino(t, -1); if (v) { e.preventDefault(); colocarCursor(v, 'fin'); } }
    else if (e.key === 'ArrowDown' && bd.colapsado && lineaExtremo(t, false)) { const v = vecino(t, 1); if (v) { e.preventDefault(); colocarCursor(v, 'inicio'); } }
    else if (e.key === 'ArrowLeft' && bd.colapsado && bd.inicio) { const v = vecino(t, -1); if (v) { e.preventDefault(); colocarCursor(v, 'fin'); } }
    else if (e.key === 'ArrowRight' && bd.colapsado && bd.fin) { const v = vecino(t, 1); if (v) { e.preventDefault(); colocarCursor(v, 'inicio'); } }
  }
}

function indiceItem(li) { return Array.from(li.parentElement.querySelectorAll('.li')).indexOf(li); }

function enterEnLista(li, bq, b) {
  const id = b.id;
  const k = indiceItem(li);
  if (esVacio(li) && (+li.dataset.n || 0) > 0) { cambiarNivelItem(li, -1); return; } // como en Word: primero sube de nivel
  if (esVacio(li)) { // salir de la lista
    const nid = nuevoId('b');
    editarLista((l) => {
      const i = l.findIndex((x) => x.id === id);
      const lb = l[i];
      const items = lb.items.filter((_, j) => j !== k);
      const resto = lb.items.slice(k + 1);
      const p = { ...bloqueNuevo('p'), id: nid };
      if (!items.length) { l.splice(i, 1, p); return; }
      const antes = lb.items.slice(0, k);
      if (!antes.length) { // era el primer elemento: el párrafo queda encima y la lista sigue debajo
        l.splice(i, 1, { ...p, orden: lb.orden }, { ...lb, id: nuevoId('b'), items: resto });
        return;
      }
      l[i] = { ...lb, items: antes };
      const piezas = [p];
      if (resto.length) piezas.push({ ...lb, id: nuevoId('b'), items: resto.map((x) => ({ ...x, n: Math.min(x.n, 2) })), label: '' });
      l.splice(i + 1, 0, ...piezas);
    }, { foco: { id: nid, donde: 'inicio' } });
    return;
  }
  const { antes, despues } = dividirEd(li);
  const n = +li.dataset.n || 0;
  editarLista((l) => {
    const i = l.findIndex((x) => x.id === id);
    const items = l[i].items.slice();
    items[k] = { ...items[k], c: antes, n };
    // en una lista de descripción el elemento nuevo lleva su término (vacío)
    items.splice(k + 1, 0, l[i].desc ? { c: despues, n, et: [] } : { c: despues, n });
    l[i] = { ...l[i], items };
  }, { foco: { id, donde: { idx: k + 1, pos: 'inicio' } } });
}

function borrarItem(li, bq, b) {
  const id = b.id; const k = indiceItem(li);
  editarLista((l) => {
    const i = l.findIndex((x) => x.id === id);
    const lb = l[i];
    const cur = lb.items[k];
    if (k === 0) {
      if (lb.items.length === 1) { l[i] = { ...bloqueNuevo('p'), c: cur.c, id, orden: lb.orden }; return { foco: { id, donde: 'inicio' } }; }
      // el primer elemento pasa a ser un párrafo encima de la lista
      const p = { ...bloqueNuevo('p'), c: cur.c, id: nuevoId('b') };
      l[i] = { ...lb, items: lb.items.slice(1) };
      l.splice(i, 0, p);
      return { foco: { id: p.id, donde: 'inicio' } };
    }
    const items = lb.items.slice();
    const prev = items[k - 1];
    items[k - 1] = { ...prev, c: [...prev.c, ...cur.c] };
    items.splice(k, 1);
    l[i] = { ...lb, items };
    return { foco: { id, donde: { idx: k - 1, pos: 'fin' } } };
  });
}

// ── Pegar ───────────────────────────────────────────────────────────────

function alPegar(e) {
  // el destino puede ser un <b>, <i> o enlace dentro del campo: lo que importa es el campo editable
  const t = (e.target.nodeType === 1 ? e.target : e.target.parentElement)?.closest('.ed') || e.target;
  const cd = e.clipboardData;
  if (cd && cd.files && cd.files.length && /^image\//.test(cd.files[0].type)) { e.preventDefault(); crearFiguraDesde(cd.files[0]); return; }
  if (!t.classList || !t.classList.contains('ed')) return;
  e.preventDefault();
  const texto = ((cd && cd.getData('text/plain')) || '').replace(/\r/g, '');
  if (!texto) return;
  const bq = FILA_DE(t); const b = bloqueDe(bq.dataset.id);
  const piezas = texto.split(/\n\s*\n+/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  if (b && b.t === 'p' && piezas.length > 1) {
    const [primera, ...resto] = piezas;
    document.execCommand('insertText', false, primera);
    guardarPendientes(true);
    const ids = resto.map(() => nuevoId('b'));
    editarLista((l) => {
      const i = l.findIndex((x) => x.id === b.id);
      l.splice(i + 1, 0, ...resto.map((x, j) => ({ ...bloqueNuevo('p'), c: [{ s: x }], id: ids[j] })));
    }, { foco: { id: ids[ids.length - 1], donde: 'fin' } });
    return;
  }
  document.execCommand('insertText', false, texto.replace(/\s*\n\s*/g, ' '));
}

// ── Clics, cambios, foco ────────────────────────────────────────────────

function alClic(e) {
  const t = e.target;
  const act = t.closest('[data-accion]');
  const bq = t.closest('.bq');
  const ir = t.closest('[data-ir]');
  if (ir) { const b = mapa.get(ir.dataset.ir); if (b) { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); enfocar(ir.dataset.ir, 'inicio'); } return; }
  const term = t.closest('.li-et');
  if (term && E.bloques.contains(term)) { e.preventDefault(); editarTermino(term); return; }
  const inl = t.closest('.i-mate,.i-nota,.i-cita,.i-ref,.i-raw');
  if (inl && E.bloques.contains(inl)) { e.preventDefault(); editarExistente(inl); return; }
  const url = t.closest('a.i-url');
  if (url) {
    const dir = urlSegura(url.getAttribute('data-url'));
    if ((e.ctrlKey || e.metaKey) && dir) window.open(dir, '_blank', 'noopener');
    e.preventDefault(); return;
  }
  if (!act || !bq) return;
  const id = bq.dataset.id;
  const a = act.dataset.accion;
  if (a === 'menu') { e.preventDefault(); S.sel = id; menuBloque(act, id); }
  else if (a === 'eq') accionEq(id);
  else if (a === 'img') accionImagen(id);
  else if (a === 'tikz') accionTikz(id);
}

function alCambiar(e) {
  const t = e.target;
  const bq = t.closest && t.closest('.bq');
  if (!bq) return;
  const id = bq.dataset.id;
  if (t.classList.contains('teo-tipo')) {
    marcarSucio(id); guardarPendientes();
    reconciliar(new Set([id]));
    enfocar(id, 'fin');
    return;
  }
  if (t.classList.contains('cod-lang') || t.classList.contains('cod-num')) { marcarSucio(id); guardarPendientes(); }
}

function alEntrar(e) {
  const t = e.target;
  const bq = t.closest && t.closest('.bq');
  if (!bq) return;
  S.sel = bq.dataset.id;
  E.bloques.querySelectorAll('.bq.sel').forEach((x) => { if (x !== bq) x.classList.remove('sel'); });
  bq.classList.add('sel');
  document.dispatchEvent(new CustomEvent('lv-foco'));
}

function alSalir(e) {
  const bq = e.target.closest && e.target.closest('.bq');
  if (bq && !bq.contains(e.relatedTarget)) guardarPendientes();
}

let tVista = null;
function alEscribir(e) {
  const bq = e.target.closest && e.target.closest('.bq');
  if (!bq) return;
  if (e.target.tagName === 'TEXTAREA') autoAlto(e.target);
  // la vista previa del LaTeX avanzado sigue al código mientras se escribe
  if (e.target.classList.contains('raw-ta')) { clearTimeout(tVista); tVista = setTimeout(() => actualizarVistaRaw(bq), 300); }
  marcarSucio(bq.dataset.id);
}

// ── Arrastrar bloques e imágenes ────────────────────────────────────────

let arrastrando = null;
function destinoDe(y) {
  const bqs = Array.from(E.bloques.querySelectorAll('.bq'));
  for (const bq of bqs) { const r = bq.getBoundingClientRect(); if (y < r.top + r.height / 2) return bq; }
  return null;
}
function limpiarDrop() { E.bloques.querySelectorAll('.drop-antes').forEach((x) => x.classList.remove('drop-antes')); E.bloques.classList.remove('drop-fin'); }

function iniciarArrastre() {
  E.bloques.addEventListener('dragstart', (e) => {
    const asa = e.target.closest && e.target.closest('.asa-mover');
    if (!asa) { return; }
    const bq = asa.closest('.bq');
    arrastrando = bq.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'bloque:' + arrastrando);
    e.dataTransfer.setDragImage(bq, 20, 14);
    bq.classList.add('arrastrando');
  });
  E.bloques.addEventListener('dragend', () => { arrastrando = null; limpiarDrop(); E.bloques.querySelectorAll('.arrastrando').forEach((x) => x.classList.remove('arrastrando')); });
  E.bloques.addEventListener('dragover', (e) => {
    const hayImg = e.dataTransfer && Array.from(e.dataTransfer.items || []).some((i) => i.kind === 'file');
    if (!arrastrando && !hayImg) return;
    e.preventDefault();
    limpiarDrop();
    const d = destinoDe(e.clientY);
    if (d) d.classList.add('drop-antes'); else E.bloques.classList.add('drop-fin');
  });
  E.bloques.addEventListener('dragleave', (e) => { if (!E.bloques.contains(e.relatedTarget)) limpiarDrop(); });
  E.bloques.addEventListener('drop', (e) => {
    const d = destinoDe(e.clientY);
    const destino = d ? d.dataset.id : null;
    limpiarDrop();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (arrastrando) { e.preventDefault(); const id = arrastrando; arrastrando = null; moverBloqueA(id, destino); return; }
    if (f && /^image\//.test(f.type)) {
      e.preventDefault();
      if (destino) { const i = indiceDe(destino); S.sel = i > 0 ? S.bloques[i - 1].id : null; } else S.sel = S.bloques.length ? S.bloques[S.bloques.length - 1].id : null;
      crearFiguraDesde(f);
    }
  });
}

export function instalarEventos() {
  const r = E.bloques;
  r.addEventListener('keydown', alTeclado);
  r.addEventListener('paste', alPegar);
  r.addEventListener('click', alClic);
  r.addEventListener('input', alEscribir);
  r.addEventListener('change', alCambiar);
  r.addEventListener('focusin', alEntrar);
  r.addEventListener('focusout', alSalir);
  // clic en el espacio vacío bajo el último bloque: enfocar el final
  E.hoja.addEventListener('mousedown', (e) => {
    if (e.target === E.hoja || e.target === E.relleno) {
      e.preventDefault();
      const ult = S.bloques[S.bloques.length - 1];
      if (ult && ['p'].includes(ult.t) && !ult.c.length) enfocar(ult.id, 'fin');
      else { S.sel = ult ? ult.id : null; insertarBloque('p', { sinReemplazo: true }); }
    }
  });
  iniciarArrastre();
  document.addEventListener('keydown', (e) => {
    if (E.vistaEditor.hidden || e.defaultPrevented) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); guardarPendientes(); aviso('Todo se guarda automáticamente.', 'ok', 1800); }
    if (ctrl && !e.shiftKey && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase()) && !E.bloques.contains(document.activeElement) && document.activeElement && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); if (e.key.toLowerCase() === 'z') deshacer(); else rehacer();
    }
  });
}
