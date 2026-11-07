// Pestaña «Código»: el documento como LaTeX, editable. Lo que se escribe aquí se interpreta y
// pasa a la vista visual (y al revés). Lo que no se entiende se conserva como «LaTeX avanzado».

import { S, E } from './estado.js?v=2026.11.07-p';
import { generarTex, mapearBloques } from './latex-gen.js?v=2026.11.07-p';
import { codigoDe, formatoDe } from './generar.js?v=2026.11.07-p';
import { parsearTex } from './latex-parse.js?v=2026.11.07-p';
import { diffBloques } from './sync.js?v=2026.11.07-p';
import { aplicarCambios, guardarPendientes, bus, mapa as mapaBloques, enfocar } from './ops.js?v=2026.11.07-p';
import { resaltarTex } from './resaltar.js?v=2026.11.07-p';
import { conectarAutocompletado } from './autocompletar.js?v=2026.11.07-p';

// En Typst (Fase 1) la pestaña de código es de solo lectura: generamos Typst desde los bloques pero
// todavía no interpretamos Typst de vuelta, así que no hay edición ni sincronización código→documento.
const esTypst = () => formatoDe(S.doc) === 'typst';
const escaparHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let tPeg = null, tGen = null;
let aplicando = false;
// Último texto que se escribió desde el modelo o que ya se aplicó. Si el área de código sigue igual, no se
// vuelve a interpretar: así entrar y salir de la vista de código nunca cambia el documento.
let ultimoAplicado = null;

export function textoActual() {
  // En Typst el código editado a mano es la fuente de verdad (incluido el vacío, mismo criterio que el
  // store: codigoTypst != null). Si aún no existe —documentos anteriores a la fase 2— se genera desde
  // los bloques. En LaTeX siempre se genera. codigoDe centraliza esa decisión.
  return codigoDe({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra, codigoTypst: S.doc.codigoTypst }, S.bloques).tex;
}

// Coloreado: un <pre> con el mismo texto (coloreado) va DEBAJO del textarea, que se vuelve transparente.
let preResalte = null, textoResaltado = null, rafResalte = 0;
// Banda que marca, en el código, el bloque que se edita en la vista del documento (SyncTeX inverso).
let bandaBloque = null;

function montarResalte() {
  const ta = E.codigoTa;
  const cont = document.createElement('div');
  cont.className = 'resalte';
  preResalte = document.createElement('pre');
  preResalte.className = 'codigo-resalte';
  preResalte.setAttribute('aria-hidden', 'true');
  bandaBloque = document.createElement('div');
  bandaBloque.className = 'codigo-banda';
  bandaBloque.setAttribute('aria-hidden', 'true');
  bandaBloque.hidden = true;
  ta.parentElement.insertBefore(cont, ta);
  cont.append(bandaBloque, preResalte, ta);
}

function sincronizarResalte() {
  if (!preResalte) return;
  const ta = E.codigoTa;
  if (textoResaltado !== ta.value) {
    textoResaltado = ta.value;
    // El resaltador es de LaTeX; en Typst se muestra el texto sin colorear (solo se escapa el HTML).
    const html = esTypst() ? escaparHtml(textoResaltado) : resaltarTex(textoResaltado);
    preResalte.innerHTML = html + '\n'; // el \n final iguala la altura de la última línea
  }
  preResalte.scrollTop = ta.scrollTop;
  preResalte.scrollLeft = ta.scrollLeft;
}

function programarResalte() {
  if (rafResalte) return;
  rafResalte = requestAnimationFrame(() => { rafResalte = 0; sincronizarResalte(); });
}

function gutter() {
  programarResalte();
  const n = (E.codigoTa.value.match(/\n/g) || []).length + 1;
  if (E.codigoGutter.dataset.n !== String(n)) {
    E.codigoGutter.dataset.n = String(n);
    E.codigoGutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  }
  E.codigoGutter.scrollTop = E.codigoTa.scrollTop;
}

export function mostrarAvisos(lista, error) {
  const a = E.codigoAvisos;
  a.replaceChildren();
  a.hidden = !lista.length && !error;
  if (error) { const d = document.createElement('div'); d.className = 'aviso-cod err'; d.textContent = error; a.append(d); }
  for (const t of lista) { const d = document.createElement('div'); d.className = 'aviso-cod'; d.textContent = '⚠ ' + t; a.append(d); }
}

/** Regenera el texto a partir del modelo (si no se está escribiendo ahí). */
export function actualizarCodigo(forzar = false) {
  if (S.vista === 'visual' || !S.doc) return;
  // En Typst el código SÍ es editable (es la fuente de verdad); en LaTeX siempre lo ha sido.
  E.codigoTa.readOnly = false;
  E.codigoTa.removeAttribute('aria-readonly');
  E.codigoTa.title = '';
  if (!forzar && document.activeElement === E.codigoTa) return;
  const t = textoActual();
  if (E.codigoTa.value !== t) { E.codigoTa.value = t; }
  ultimoAplicado = t;
  gutter();
  // el texto cambió: recolocar la banda del bloque marcado sobre sus nuevas líneas
  if (bloqueMarcado) { const id = bloqueMarcado; bloqueMarcado = null; marcarBloqueEnCodigo(id); }
  if (forzar || document.activeElement !== E.codigoTa) mostrarAvisos([]);
}

export function programarActualizacion() {
  if (S.vista === 'visual' || aplicando) return;
  clearTimeout(tGen);
  tGen = setTimeout(() => actualizarCodigo(), 250);
}

function aplicarTexto() {
  // En Typst el código es la fuente de verdad: se guarda tal cual (no se interpreta de vuelta, no hay
  // parser Typst). No toca los bloques.
  if (esTypst()) {
    const texto = E.codigoTa.value;
    if (texto === ultimoAplicado) return;
    S.doc.codigoTypst = texto;
    S.store.actualizarDocumento(S.did, { codigoTypst: texto });
    ultimoAplicado = texto;
    return;
  }
  const texto = E.codigoTa.value;
  if (texto === ultimoAplicado) return;
  let m;
  try { m = parsearTex(texto); } catch (e) { console.error(e); mostrarAvisos([], 'No se pudo interpretar el código.'); return; }
  aplicando = true;
  try {
    guardarPendientes(true);
    const completo = /\\begin\{document\}/.test(texto);
    if (completo) {
      const parche = {};
      for (const [k, v] of Object.entries(m.cfg)) if (S.doc.cfg[k] !== v) parche['cfg.' + k] = v;
      if (JSON.stringify(m.biblio) !== JSON.stringify(S.doc.biblio)) parche.biblio = m.biblio;
      if (m.extra !== S.doc.extra) parche.extra = m.extra;
      if (Object.keys(parche).length) {
        S.store.actualizarDocumento(S.did, parche);
        for (const [k, v] of Object.entries(parche)) { if (k.startsWith('cfg.')) S.doc.cfg[k.slice(4)] = v; else S.doc[k] = v; }
        bus.dispatchEvent(new CustomEvent('doc'));
      }
    }
    const nuevos = m.bloques.length ? m.bloques : [{ t: 'p', c: [], al: 'j' }];
    const d = diffBloques(S.bloques, nuevos);
    if (d.crear.length || d.actualizar.length || d.eliminar.length || d.mover.length) aplicarCambios(null, { diff: d });
    mostrarAvisos(m.avisos);
    ultimoAplicado = texto;
  } finally { aplicando = false; }
}

/**
 * Lleva el cursor del editor de código al bloque `id` (doble clic en la vista del documento, como el
 * SyncTeX inverso de Overleaf). Si el documento está en vista «visual» pasa a «dividida» para que el
 * código sea visible.
 */
export function irABloque(id) {
  if (!S.doc || esTypst()) return false;   // el mapeo SyncTeX usa LaTeX; en Typst no aplica
  if (S.vista === 'visual') bus.dispatchEvent(new CustomEvent('ir-vista', { detail: 'dividida' }));
  // asegurar que el textarea tiene el .tex al día (si veníamos de la vista visual estaba en pausa)
  actualizarCodigo(true);
  const tex = E.codigoTa.value;
  const pos = mapearBloques({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra }, S.bloques, tex).get(id);
  if (pos == null) return false;
  const ta = E.codigoTa;
  // seleccionar la primera línea del bloque ayuda a verlo; el cursor queda al inicio
  const finLinea = tex.indexOf('\n', pos);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(pos, finLinea < 0 ? tex.length : finLinea);
  // desplazar para dejar la línea cerca de un tercio superior del área visible
  const antes = tex.slice(0, pos);
  const linea = (antes.match(/\n/g) || []).length;
  const alturaLinea = ta.scrollHeight / ((tex.match(/\n/g) || []).length + 1);
  ta.scrollTop = Math.max(0, (linea - 3) * alturaLinea);
  gutter();
  return true;
}

/** Qué bloque corresponde a la posición `offset` del código: el último que empieza en o antes de ahí. */
function bloqueEnPosicion(offset) {
  if (!S.doc || esTypst()) return null;
  const posiciones = mapearBloques({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra }, S.bloques, E.codigoTa.value);
  let elegido = null, mejor = -1;
  for (const [id, pos] of posiciones) if (pos <= offset && pos > mejor) { mejor = pos; elegido = id; }
  return elegido;
}

/**
 * Lleva la vista del documento al bloque que corresponde a la posición `offset` del código (doble clic
 * en el editor de LaTeX, como el SyncTeX directo de Overleaf). Si está en vista «código» pura pasa a
 * «dividida» para que el documento sea visible, resalta el bloque y lo centra.
 */
export function irADocumento(offset) {
  if (!S.doc) return false;
  const id = bloqueEnPosicion(offset);
  if (!id) return false;
  if (S.vista === 'codigo') bus.dispatchEvent(new CustomEvent('ir-vista', { detail: 'dividida' }));
  const bq = mapaBloques.get(id);
  if (!bq) return false;
  // resaltar como el eco del cursor y centrar; enfocar coloca el cursor en el bloque
  ultimoEco = id;
  for (const x of E.bloques.querySelectorAll('.bq-eco')) x.classList.remove('bq-eco');
  bq.classList.add('bq-eco');
  bq.scrollIntoView({ block: 'center', behavior: 'smooth' });
  enfocar(id, 'inicio');
  return true;
}

// ── Documento → código: marcar en el código el bloque que se edita en la vista visual ──────────
let bloqueMarcado = null;   // id del bloque cuya banda está pintada
let rangoMarcado = null;    // { ini, fin } offsets en el .tex, para recolocar la banda al hacer scroll

/** Coloca/actualiza la banda sobre las líneas del bloque marcado, siguiendo el scroll del textarea. */
function situarBanda() {
  if (!bandaBloque) return;
  const ta = E.codigoTa;
  // Con ajuste de línea una línea lógica ocupa varias visuales: el cálculo por nº de línea no sirve,
  // así que no se dibuja la banda (el resaltado del bloque en el documento sigue funcionando).
  if (!rangoMarcado || S.vista === 'codigo' || E.zonaCodigo.classList.contains('ajuste')) { bandaBloque.hidden = true; return; }
  const tex = ta.value;
  // altura de línea real (no scrollHeight/nLíneas, que se infla si el textarea tiene espacio sobrante)
  const cs = getComputedStyle(ta);
  let alturaLinea = parseFloat(cs.lineHeight);
  if (!Number.isFinite(alturaLinea)) alturaLinea = parseFloat(cs.fontSize) * 1.55; // 'normal': usa el ratio del CSS
  const padTop = parseFloat(cs.paddingTop) || 0;
  const lineaIni = (tex.slice(0, rangoMarcado.ini).match(/\n/g) || []).length;
  const nLineas = Math.max(1, (tex.slice(rangoMarcado.ini, rangoMarcado.fin).match(/\n/g) || []).length);
  bandaBloque.hidden = false;
  bandaBloque.style.top = (padTop + lineaIni * alturaLinea - ta.scrollTop) + 'px';
  bandaBloque.style.height = (nLineas * alturaLinea) + 'px';
}

/** Marca en el código el bloque `id` (el que se está editando en el documento). */
export function marcarBloqueEnCodigo(id) {
  if (!bandaBloque) return;
  if (S.vista === 'codigo' || !id || !S.doc || esTypst()) { bloqueMarcado = null; rangoMarcado = null; bandaBloque.hidden = true; return; }
  if (id === bloqueMarcado) { situarBanda(); return; }
  const tex = E.codigoTa.value;
  const pos = mapearBloques({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra }, S.bloques, tex);
  const ini = pos.get(id);
  if (ini == null) { bloqueMarcado = null; rangoMarcado = null; bandaBloque.hidden = true; return; }
  // fin = inicio del siguiente bloque que tenga posición, o el fin del cuerpo
  let fin = tex.lastIndexOf('\\end{document}'); if (fin < 0) fin = tex.length;
  for (const p of pos.values()) if (p > ini && p < fin) fin = p;
  bloqueMarcado = id; rangoMarcado = { ini, fin };
  situarBanda();
}

let ultimoEco = null, eand = 0;
/** Resalta en la vista del documento el bloque donde está el cursor del código (SyncTeX directo). */
function reflejarEnDocumento() {
  if (S.vista === 'codigo') return; // sin vista del documento no hay nada que resaltar
  const id = bloqueEnPosicion(E.codigoTa.selectionStart);
  if (id === ultimoEco) return;
  ultimoEco = id;
  for (const x of E.bloques.querySelectorAll('.bq-eco')) x.classList.remove('bq-eco');
  const bq = id && mapaBloques.get(id); // mapa id→elemento .bq (de ops.js)
  if (!bq) return;
  bq.classList.add('bq-eco');
  bq.scrollIntoView({ block: 'nearest' });
}
function programarReflejo() {
  cancelAnimationFrame(eand);
  eand = requestAnimationFrame(reflejarEnDocumento);
}

/** Activa o desactiva el ajuste de línea (envolver las líneas largas) y lo recuerda. */
function aplicarAjuste(on) {
  E.zonaCodigo.classList.toggle('ajuste', on);
  E.codigoTa.setAttribute('wrap', on ? 'soft' : 'off');
  const btn = document.getElementById('codigo-ajuste');
  if (btn) btn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('lv.ajusteCodigo', on ? '1' : '0'); } catch { /* ignorar */ }
  requestAnimationFrame(() => { sincronizarResalte(); situarBanda(); });
}

function iniciarAjuste() {
  const btn = document.getElementById('codigo-ajuste');
  let on = false;
  try { on = localStorage.getItem('lv.ajusteCodigo') === '1'; } catch { /* ignorar */ }
  aplicarAjuste(on);
  if (btn) btn.addEventListener('click', () => aplicarAjuste(!E.zonaCodigo.classList.contains('ajuste')));
}

export function iniciarCodigo() {
  montarResalte();
  iniciarAjuste();
  // sugerencias de comandos y entornos LaTeX mientras se escribe
  conectarAutocompletado(E.codigoTa, () => { gutter(); programarActualizacion(); });
  E.codigoTa.addEventListener('input', () => {
    gutter();
    programarReflejo();
    clearTimeout(tPeg);
    tPeg = setTimeout(aplicarTexto, 650);
  });
  E.codigoTa.addEventListener('scroll', () => { gutter(); situarBanda(); });
  // al pasar a editar el código, se oculta la banda del documento (manda la dirección código→doc)
  E.codigoTa.addEventListener('focus', () => { bloqueMarcado = null; rangoMarcado = null; if (bandaBloque) bandaBloque.hidden = true; });
  // editar un bloque en la vista del documento marca su código aquí (SyncTeX inverso)
  document.addEventListener('lv-foco', () => {
    if (S.vista !== 'dividida') return;
    // mandar en la dirección documento→código: quitar el eco código→documento para no confundir
    ultimoEco = null;
    for (const x of E.bloques.querySelectorAll('.bq-eco')) x.classList.remove('bq-eco');
    marcarBloqueEnCodigo(S.sel);
  });
  // mover el cursor/selección en el código resalta el bloque correspondiente en el documento
  E.codigoTa.addEventListener('keyup', programarReflejo);
  E.codigoTa.addEventListener('click', programarReflejo);
  E.codigoTa.addEventListener('select', programarReflejo);
  // doble clic en el código: lleva la vista del documento a ese bloque (como el doble clic al revés)
  E.codigoTa.addEventListener('dblclick', () => irADocumento(E.codigoTa.selectionStart));
  E.codigoTa.addEventListener('blur', () => { clearTimeout(tPeg); aplicarTexto(); setTimeout(() => actualizarCodigo(true), 0); });
  E.codigoTa.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  });
  bus.addEventListener('cambio', programarActualizacion);
  bus.addEventListener('doc', programarActualizacion);
  // tras repintar bloques (reconciliar reemplaza el DOM y pierde .bq-eco), volver a reflejar el cursor
  bus.addEventListener('cambio', () => { if (document.activeElement === E.codigoTa) { ultimoEco = null; programarReflejo(); } });
}
