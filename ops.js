// Núcleo del editor: mantiene la lista de bloques, la dibuja en la página, la guarda en el almacén
// y aplica cambios de estructura (insertar, dividir, mover, borrar…) con deshacer/rehacer.

import { S, E } from './estado.js?v=2026.11.06-a';
import { nuevoId, bloqueNuevo } from './modelo.js?v=2026.11.06-a';
import { diffPorId, firma, necesitaReindexar } from './sync.js?v=2026.11.06-a';
import { pintarBloque, leerBloque, decorar } from './bloques-dom.js?v=2026.11.06-a';
import { numerar } from './numerar.js?v=2026.11.06-a';
import { numerarInline } from './inline-dom.js?v=2026.11.06-a';

export const bus = new EventTarget();
const avisar = (tipo, detalle) => bus.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));

export const mapa = new Map();     // id → elemento .bq
const cache = new Map();           // id → firma de lo que hay dibujado
export const dirty = new Set();    // ids con cambios sin guardar
const enVuelo = new Map();         // id → { firma, orden, ts }: escrito por mí y aún no confirmado
const borrados = new Map();        // id → ts
let guardarT = null;
let ultimoUndo = 0;
export let numeracion = { info: new Map(), etiquetas: new Map(), titulos: [], citas: new Map() };

const TTL = 8000;
const copiaB = (b) => JSON.parse(JSON.stringify(b));
export const indiceDe = (id) => S.bloques.findIndex((b) => b.id === id);
export const bloqueDe = (id) => S.bloques.find((b) => b.id === id);

// ── Deshacer ────────────────────────────────────────────────────────────

function empujarUndo(rafaga = false) {
  const ahora = Date.now();
  if (rafaga && ahora - ultimoUndo < 1500 && S.undo.length) { ultimoUndo = ahora; return; }
  ultimoUndo = ahora;
  S.undo.push(S.bloques.map(copiaB));
  if (S.undo.length > 100) S.undo.shift();
  S.redo.length = 0;
  avisar('undo');
}

export function deshacer() { moverHistorial(S.undo, S.redo); }
export function rehacer() { moverHistorial(S.redo, S.undo); }
function moverHistorial(de, a) {
  guardarPendientes(true);
  if (!de.length) return;
  a.push(S.bloques.map(copiaB));
  const objetivo = de.pop();
  ultimoUndo = 0;
  aplicarCambios(objetivo, { sinUndo: true });
  avisar('undo');
}

// ── Guardado ────────────────────────────────────────────────────────────

export function marcarSucio(id) {
  dirty.add(id);
  if (dirty.size === 1) empujarUndo(true);
  clearTimeout(guardarT);
  guardarT = setTimeout(() => guardarPendientes(), 400);
  if (E.estado) E.estado.textContent = 'Guardando…';
}

/** Lee de la página los bloques editados y los envía al almacén. */
export function guardarPendientes(sinDerivados = false) {
  clearTimeout(guardarT);
  if (!dirty.size) return;
  const actualizar = [];
  for (const id of dirty) {
    const bq = mapa.get(id); const i = indiceDe(id);
    if (!bq || i < 0) continue;
    const orig = S.bloques[i];
    const nuevo = leerBloque(bq, orig);
    if (firma(nuevo) === firma(orig)) continue;
    S.bloques[i] = { id, orden: orig.orden, ...nuevo };
    cache.set(id, firma(nuevo));
    enVuelo.set(id, { firma: firma(nuevo), orden: orig.orden, ts: Date.now() });
    actualizar.push({ id, bloque: nuevo });
  }
  dirty.clear();
  if (actualizar.length) S.store.aplicarBloques(S.did, { actualizar });
  if (!sinDerivados) refrescarDerivados();
  avisar('cambio');
}

/** Vuelve a calcular números, índice y referencias. */
export function refrescarDerivados() {
  numeracion = numerar(S.doc.cfg, S.bloques, S.doc.biblio);
  decorar(E.bloques, numeracion, S.doc.cfg);
  numerarInline(E.bloques, numeracion, S.doc.biblio);
  if (E.portada) numerarInline(E.portada, numeracion, S.doc.biblio);
  avisar('derivados');
}

// ── Dibujar ─────────────────────────────────────────────────────────────

const ocupado = (bq) => bq.contains(document.activeElement);

/** Hace que la página coincida con S.bloques (solo toca lo que cambió). `forzar`: ids que se redibujan aunque tengan el foco. */
export function reconciliar(forzar = new Set()) {
  const vivos = new Set(S.bloques.map((b) => b.id));
  for (const [id, bq] of mapa) if (!vivos.has(id)) { bq.remove(); mapa.delete(id); cache.delete(id); }
  let anterior = null;
  for (const b of S.bloques) {
    let bq = mapa.get(b.id);
    const f = firma(b);
    if (!bq || forzar.has(b.id) || (cache.get(b.id) !== f && !dirty.has(b.id) && !ocupado(bq))) {
      const nuevo = pintarBloque(b);
      if (bq) bq.replaceWith(nuevo);
      bq = nuevo;
      mapa.set(b.id, bq); cache.set(b.id, f);
      if (E.sel && S.sel === b.id) bq.classList.add('sel');
    }
    const esperado = anterior ? anterior.nextElementSibling : E.bloques.firstElementChild;
    if (bq !== esperado) E.bloques.insertBefore(bq, esperado);
    anterior = bq;
  }
  E.bloques.classList.toggle('vacio', S.bloques.length === 0);
  refrescarDerivados();
}

// ── Almacén ⇄ página ────────────────────────────────────────────────────

/** Recibe la lista de bloques del almacén y la mezcla con lo que aún no se ha confirmado. */
export function recibirBloques(lista) {
  const ahora = Date.now();
  for (const [id, v] of enVuelo) if (ahora - v.ts > TTL) enVuelo.delete(id);
  for (const [id, ts] of borrados) if (ahora - ts > TTL) borrados.delete(id);
  const locales = new Map(S.bloques.map((b) => [b.id, b]));
  const salida = [];
  const vistos = new Set();
  for (const b of lista) {
    vistos.add(b.id);
    if (borrados.has(b.id)) continue;
    const v = enVuelo.get(b.id);
    if (v) {
      if (v.firma === firma(b) && v.orden === b.orden) enVuelo.delete(b.id);
      else if (locales.has(b.id)) { salida.push(locales.get(b.id)); continue; }
    }
    if (dirty.has(b.id) && locales.has(b.id)) { salida.push(locales.get(b.id)); continue; }
    salida.push(b);
  }
  for (const [id] of enVuelo) if (!vistos.has(id) && locales.has(id)) salida.push(locales.get(id));
  for (const id of borrados.keys()) if (!vistos.has(id)) borrados.delete(id);
  salida.sort((a, b) => a.orden - b.orden);
  S.bloques = salida;
  if (necesitaReindexar(S.bloques)) reindexar();
  reconciliar();
  avisar('cambio');
}

function reindexar() {
  const nuevos = S.bloques.map((b, i) => ({ ...b, orden: (i + 1) * 1000 }));
  const mover = nuevos.map((b) => ({ id: b.id, orden: b.orden }));
  nuevos.forEach((b) => enVuelo.set(b.id, { firma: firma(b), orden: b.orden, ts: Date.now() }));
  S.bloques = nuevos;
  S.store.aplicarBloques(S.did, { mover });
}

/**
 * Cambia la lista de bloques a `nueva` (los bloques que ya existían llevan su `id`).
 * @param {object} o  { foco: {id, donde}, sinUndo }
 */
export function aplicarCambios(nueva, o = {}) {
  guardarPendientes(true);
  if (!o.sinUndo) empujarUndo();
  const d = o.diff || diffPorId(S.bloques, nueva);
  const ahora = Date.now();
  for (const x of d.eliminar) borrados.set(x, ahora);
  for (const x of d.crear) borrados.delete(x.id);
  for (const x of d.crear) enVuelo.set(x.id, { firma: firma(x.bloque), orden: x.orden, ts: ahora });
  for (const x of d.actualizar) { const f = d.final.find((y) => y.id === x.id); enVuelo.set(x.id, { firma: firma(x.bloque), orden: f.orden, ts: ahora }); }
  for (const x of d.mover) { const f = d.final.find((y) => y.id === x.id); enVuelo.set(x.id, { firma: firma(f), orden: x.orden, ts: ahora }); }
  const forzar = new Set([...d.actualizar.map((x) => x.id), ...d.crear.map((x) => x.id)]);
  S.bloques = d.final;
  if (d.crear.length || d.actualizar.length || d.mover.length || d.eliminar.length) S.store.aplicarBloques(S.did, d);
  reconciliar(forzar);
  avisar('cambio');
  if (o.foco) enfocar(o.foco.id, o.foco.donde || 'fin');
  return d;
}

/** Atajo: copia profunda de los bloques para modificarlos y aplicar. */
export function editarLista(fn, o) {
  guardarPendientes(true);
  const lista = S.bloques.map(copiaB);
  const r = fn(lista);
  if (r === false) return;
  const hecho = aplicarCambios(Array.isArray(r) ? r : lista, { ...o, ...(r && r.foco ? { foco: r.foco } : {}) });
  return hecho;
}

export function modificar(id, fn, o) {
  return editarLista((l) => { const i = l.findIndex((b) => b.id === id); if (i < 0) return false; l[i] = { ...fn(l[i]), id, orden: l[i].orden }; }, o);
}

// ── Foco ────────────────────────────────────────────────────────────────

export function editablesDe(bq) { return Array.from(bq.querySelectorAll('.ed, textarea.cod-ta, textarea.raw-ta')); }

export function colocarCursor(e, donde = 'fin') {
  e.focus({ preventScroll: false });
  if (e.tagName === 'TEXTAREA') { const p = donde === 'inicio' ? 0 : e.value.length; e.setSelectionRange(p, p); return; }
  const r = document.createRange();
  r.selectNodeContents(e);
  r.collapse(donde === 'inicio');
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

export function enfocar(id, donde = 'fin') {
  const bq = mapa.get(id);
  if (!bq) return;
  const eds = editablesDe(bq);
  let e, pos = donde;
  if (donde && typeof donde === 'object') { e = eds[donde.idx]; pos = donde.pos || 'inicio'; }
  else e = donde === 'fin' ? eds[eds.length - 1] : eds[0];
  if (e) colocarCursor(e, pos);
  else { bq.scrollIntoView({ block: 'nearest' }); }
  S.sel = id;
}

// ── Operaciones de estructura ───────────────────────────────────────────

const vacioEditable = (b) => (b.t === 'p' && !b.c.length) || (b.t === 'h' && !b.c.length);

/** Inserta un bloque nuevo debajo del actual (o lo reemplaza si el actual es un párrafo vacío). */
export function insertarBloque(tipo, opts = {}) {
  const nuevo = { ...bloqueNuevo(tipo, opts.datos), id: nuevoId('b') };
  const nuevoId_ = nuevo.id;
  editarLista((l) => {
    const i = S.sel ? l.findIndex((b) => b.id === S.sel) : l.length - 1;
    if (i >= 0 && vacioEditable(l[i]) && !opts.sinReemplazo) { nuevo.orden = l[i].orden; l.splice(i, 1, nuevo); }
    else l.splice(i + 1, 0, nuevo);
    // después de un bloque que no es texto conviene tener un párrafo para seguir escribiendo
    const j = l.findIndex((b) => b.id === nuevoId_);
    if (j === l.length - 1 && !['p', 'h'].includes(nuevo.t)) l.push({ ...bloqueNuevo('p'), id: nuevoId('b') });
  }, { foco: { id: nuevoId_, donde: 'inicio' } });
  S.sel = nuevoId_;
  return nuevoId_;
}

export function eliminarBloque(id) {
  editarLista((l) => {
    const i = l.findIndex((b) => b.id === id);
    if (i < 0) return false;
    l.splice(i, 1);
    const v = l[Math.min(i, l.length - 1)];
    return { foco: v ? { id: v.id, donde: i > 0 ? 'fin' : 'inicio' } : null };
  });
}

export function duplicarBloque(id) {
  const nid = nuevoId('b');
  editarLista((l) => {
    const i = l.findIndex((b) => b.id === id);
    if (i < 0) return false;
    const c = copiaB(l[i]); c.id = nid; if (c.label) c.label = '';
    l.splice(i + 1, 0, c);
  }, { foco: { id: nid, donde: 'inicio' } });
}

export function moverBloque(id, delta) {
  editarLista((l) => {
    const i = l.findIndex((b) => b.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= l.length) return false;
    const [b] = l.splice(i, 1);
    l.splice(j, 0, b);
  });
  requestAnimationFrame(() => mapa.get(id) && mapa.get(id).scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

export function moverBloqueA(id, antesDe) {
  editarLista((l) => {
    const i = l.findIndex((b) => b.id === id);
    if (i < 0 || id === antesDe) return false;
    const [b] = l.splice(i, 1);
    const j = antesDe ? l.findIndex((x) => x.id === antesDe) : l.length;
    l.splice(j < 0 ? l.length : j, 0, b);
  });
}

/** Cambia el tipo de bloque conservando el texto (párrafo ⇄ sección ⇄ lista…). */
export function convertirBloque(id, tipo, nivel) {
  const nid = id;
  editarLista((l) => {
    const i = l.findIndex((b) => b.id === id);
    if (i < 0) return false;
    const b = l[i];
    const c = b.t === 'lista' ? [].concat(...b.items.map((it, k) => (k ? [{ br: 1 }, ...it.c] : it.c))) : (b.c || []);
    if (tipo === 'p') {
      if (b.t === 'lista') { // cada elemento pasa a ser un párrafo
        const ps = b.items.map((it, k) => ({ ...bloqueNuevo('p'), c: it.c, id: k === 0 ? id : nuevoId('b') }));
        l.splice(i, 1, ...ps);
      } else l[i] = { ...bloqueNuevo('p'), c, id, orden: b.orden };
    } else if (tipo === 'h') l[i] = { ...bloqueNuevo('h', { n: nivel, c }), num: b.t === 'h' ? b.num : true, label: b.label || '', id, orden: b.orden };
    else if (tipo === 'lista') l[i] = b.t === 'lista' ? { ...b, ord: nivel === 'ord' } : { ...bloqueNuevo('lista', { ord: nivel === 'ord', items: [{ c, n: 0 }] }), id, orden: b.orden };
    else if (tipo === 'teo') l[i] = { ...bloqueNuevo('teo', { tipo: nivel, c }), id, orden: b.orden };
    else if (tipo === 'cita' || tipo === 'resumen') l[i] = { ...bloqueNuevo(tipo, { c }), id, orden: b.orden };
  }, { foco: { id: nid, donde: 'fin' } });
}

/** Parte un párrafo/sección por el cursor (Enter). */
export function dividirBloque(id, antes, despues) {
  const nid = nuevoId('b');
  editarLista((l) => {
    const i = l.findIndex((b) => b.id === id);
    if (i < 0) return false;
    const b = l[i];
    l[i] = { ...b, c: antes };
    l.splice(i + 1, 0, { ...bloqueNuevo('p'), c: despues, al: b.t === 'p' ? b.al : 'j', id: nid });
  }, { foco: { id: nid, donde: 'inicio' } });
}

/** Une el bloque con el anterior (Retroceso al inicio). */
export function fusionarConAnterior(id) {
  guardarPendientes(true);
  const i = indiceDe(id);
  if (i <= 0) return false;
  const a = S.bloques[i - 1], b = S.bloques[i];
  if (!(a.t === 'p' || a.t === 'h') || !(b.t === 'p' || b.t === 'h')) return false;
  const finA = a.c.length;
  editarLista((l) => {
    l[i - 1] = { ...l[i - 1], c: [...a.c, ...b.c] };
    l.splice(i, 1);
  }, { foco: { id: a.id, donde: 'fin' } });
  // el cursor queda al final del texto de A; si B no estaba vacío se coloca entre ambos
  if (b.c.length && finA) {
    const e = mapa.get(a.id) && mapa.get(a.id).querySelector('.ed');
    if (e) colocarCursorEnNodo(e, finA);
  }
  return true;
}

function colocarCursorEnNodo(e, nHijosAntes) {
  const nodo = e.childNodes[nHijosAntes];
  const r = document.createRange();
  if (nodo) { r.setStartBefore(nodo); r.collapse(true); } else { r.selectNodeContents(e); r.collapse(false); }
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

export function limpiarEstado() {
  mapa.clear(); cache.clear(); dirty.clear(); enVuelo.clear(); borrados.clear();
  clearTimeout(guardarT);
  S.undo.length = 0; S.redo.length = 0; S.sel = null; S.bloques = [];
  ultimoUndo = 0;
}

export function haySinGuardar() { return dirty.size > 0 || enVuelo.size > 0; }
