// Vista del editor: une la cinta, la página, el código, el panel lateral y la colaboración.

import { S, E } from './estado.js?v=2026.11.07-c';
import { h, aviso, abrirMenu, iniciales, copiarTexto, hace } from './ui.js?v=2026.11.07-c';
import { bloqueNuevo, nuevoId } from './modelo.js?v=2026.11.07-c';
import { rotulos } from './numerar.js?v=2026.11.07-c';
import {
  bus, limpiarEstado, recibirBloques, guardarPendientes, haySinGuardar, deshacer, rehacer, refrescarDerivados, reconciliar, aplicarCambios, insertarBloque,
} from './ops.js?v=2026.11.07-c';
import { instalarEventos } from './eventos.js?v=2026.11.07-c';
import {
  seguirSeleccion, restaurarRango, formato, estadoFormato, alinear, alternarLista, sangria, accionMate, accionNota, accionCita, accionRef,
  accionEnlace, accionSimbolo, accionSaltoLinea, accionTabla, accionFig, accionImagen, menuInsertar, alElegirEstilo, edDe, celdaActual, accionTikz,
} from './acciones.js?v=2026.11.07-c';
import { iniciarCodigo, actualizarCodigo, textoActual } from './codigo.js?v=2026.11.07-c';
import { registrarPreambulo, comprobarPreambulo } from './mathjax.js?v=2026.11.07-c';
import { definicionesMathJax, usarFuentePreambulo } from './macros.js?v=2026.11.07-c';
import { iniciarPaneles, pintar as pintarPanel, cambiarCfg, abrirPestana } from './paneles.js?v=2026.11.07-c';
import { descargarTex, descargarZip, imprimirPDF, abrirOverleaf, descargarJSON, revisarExportacion } from './exportar.js?v=2026.11.07-c';

let unsubs = [];
let listo = false;
let ultimaLista = null;
let docRecibido = false;
let hbT = null, pubT = null, ultimaPub = 0;
let presentes = [];
let cableado = false;

const LANG = { spanish: 'es', english: 'en', portuguese: 'pt', french: 'fr', german: 'de', italian: 'it' };

// ── Estilo de la hoja según la configuración ────────────────────────────

export function aplicarEstiloHoja() {
  const c = S.doc.cfg;
  const ancho = c.papel === 'letterpaper' ? 21.59 : 21;
  const margen = c.margen === 'extra' ? 2.5 : c.margen;
  const s = E.hoja.style;
  s.setProperty('--ancho-hoja', ancho + 'cm');
  s.setProperty('--margen', margen + 'cm');
  s.setProperty('--fuente', (c.fuente * 1.3333).toFixed(2) + 'px');
  s.setProperty('--interlin', String(1.2 * c.interlineado));
  E.hoja.lang = LANG[c.idioma] || 'es';
  E.hoja.classList.toggle('doc-capitulos', c.clase !== 'article');
  E.hoja.classList.toggle('dos-col', c.columnas === 2);
  const sel = E.selEstilo.querySelector('option[value="h0"]');
  if (sel) sel.hidden = c.clase === 'article';
  ajustarZoom();
  pintarPortada();
  if (listo) refrescarDerivados();
}

function ajustarZoom() {
  const disp = E.zonaVisual.clientWidth - 32;
  const px = parseFloat(getComputedStyle(E.hoja).getPropertyValue('--ancho-hoja')) || 0;
  const ancho = E.hoja.offsetWidth || 794;
  const z = Math.min(1, Math.max(0.4, disp / ancho));
  E.hoja.style.zoom = z < 1 ? String(z) : '';
  void px;
}

function pintarPortada() {
  const c = S.doc.cfg;
  E.portada.hidden = !c.mostrarTitulo;
  const set = (el, v) => { if (document.activeElement !== el && el.textContent !== v) el.textContent = v; };
  set(E.pTitulo, c.titulo); set(E.pAutor, c.autor);
  const fecha = c.fecha === 'ninguna' ? '' : (c.fecha || new Date().toLocaleDateString(LANG[c.idioma] || 'es', { year: 'numeric', month: 'long', day: 'numeric' }));
  E.pFecha.textContent = fecha;
  E.pFecha.hidden = c.fecha === 'ninguna';
  E.pFecha.title = c.fecha ? 'Fecha personalizada: cámbiala en Documento' : 'La fecha de hoy (se actualiza al compilar). Cámbiala en Documento';
  E.pTitulo.dataset.ph = 'Título del documento'; E.pAutor.dataset.ph = 'Autor';
}

function cablearPortada() {
  let t = null;
  const campo = (el, clave) => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    el.addEventListener('paste', (e) => { e.preventDefault(); const tx = (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '); document.execCommand('insertText', false, tx); });
    el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => cambiarCfg({ [clave]: el.textContent.trim() }), 450); });
    el.addEventListener('blur', () => { clearTimeout(t); cambiarCfg({ [clave]: el.textContent.trim() }); });
  };
  campo(E.pTitulo, 'titulo'); campo(E.pAutor, 'autor');
  E.pFecha.addEventListener('click', () => { if (E.panel.hidden) E.panel.hidden = false; abrirPestana('doc'); });
}

// ── Cinta ───────────────────────────────────────────────────────────────

const CMD = {
  b: () => formato('b'), i: () => formato('i'), u: () => formato('u'), st: () => formato('st'), c: () => formato('c'), sub: () => formato('sub'), sup: () => formato('sup'),
  'al-j': () => alinear('j'), 'al-l': () => alinear('l'), 'al-c': () => alinear('c'), 'al-r': () => alinear('r'),
  ul: () => alternarLista(false), ol: () => alternarLista(true), indent: () => sangria(1), outdent: () => sangria(-1),
  mate: accionMate, nota: accionNota, cita: accionCita, ref: accionRef, enlace: accionEnlace, simbolo: accionSimbolo, br: accionSaltoLinea,
  deshacer: () => { guardarPendientes(true); deshacer(); }, rehacer: () => { guardarPendientes(true); rehacer(); },
  'tb-fila+': () => accionTabla('fila+'), 'tb-fila-': () => accionTabla('fila-'), 'tb-borrar-fila': () => accionTabla('borrar-fila'),
  'tb-col+': () => accionTabla('col+'), 'tb-col-': () => accionTabla('col-'), 'tb-borrar-col': () => accionTabla('borrar-col'),
  'tb-unir-derecha': () => accionTabla('unir-derecha'), 'tb-unir-abajo': () => accionTabla('unir-abajo'), 'tb-separar': () => accionTabla('separar'),
  'tb-al-l': () => accionTabla('al', 'l'), 'tb-al-c': () => accionTabla('al', 'c'), 'tb-al-r': () => accionTabla('al', 'r'), 'tb-enc': () => accionTabla('enc'),
  'fig-cambiar': () => accionImagen(S.sel), 'fig-quitar': () => accionFig('quitar'),
  tikz: async () => { const id = insertarBloque('tikz'); await accionTikz(id, { nuevo: true }); },
};

function cablearCinta() {
  // los botones no deben quitarle el foco (ni la selección) al texto
  E.cinta.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  E.cinta.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    const fn = CMD[b.dataset.cmd];
    if (b.dataset.cmd === 'insertar') { menuInsertar(b); return; }
    if (fn) { fn(); setTimeout(actualizarCinta, 30); }
  });
  E.selEstilo.addEventListener('change', () => {
    const v = E.selEstilo.value;
    restaurarRango();
    if (v) alElegirEstilo(v);
    setTimeout(actualizarCinta, 30);
  });
  E.tbBorde.addEventListener('change', () => accionTabla('borde', E.tbBorde.value));
  E.figAncho.addEventListener('input', () => {
    const img = E.bloques.querySelector(`.bq[data-id="${S.sel}"] img`);
    if (img) img.style.width = E.figAncho.value + '%';
    E.figAnchoVal.textContent = E.figAncho.value + '%';
  });
  E.figAncho.addEventListener('change', () => accionFig('ancho', +E.figAncho.value));
  document.addEventListener('selectionchange', () => { if (!E.vistaEditor.hidden) actualizarCinta(); });
  document.addEventListener('lv-foco', actualizarCinta);
  bus.addEventListener('undo', () => { E.btnDeshacer.disabled = !S.undo.length; E.btnRehacer.disabled = !S.redo.length; });
}

export function actualizarCinta() {
  const b = S.sel ? S.bloques.find((x) => x.id === S.sel) : null;
  const f = estadoFormato();
  for (const k of ['b', 'i', 'u', 'st', 'c', 'sub', 'sup']) {
    const btn = E.cinta.querySelector(`[data-cmd="${k}"]`);
    if (btn) btn.setAttribute('aria-pressed', String(!!f[k]));
  }
  for (const a of ['j', 'l', 'c', 'r']) { const btn = E.cinta.querySelector(`[data-cmd="al-${a}"]`); if (btn) btn.setAttribute('aria-pressed', String(!!b && b.t === 'p' && b.al === a)); }
  E.cinta.querySelector('[data-cmd="ul"]').setAttribute('aria-pressed', String(!!b && b.t === 'lista' && !b.ord));
  E.cinta.querySelector('[data-cmd="ol"]').setAttribute('aria-pressed', String(!!b && b.t === 'lista' && b.ord));
  let v = '';
  if (b) v = b.t === 'p' ? 'p' : b.t === 'h' ? 'h' + (S.doc.cfg.clase === 'article' ? Math.max(1, b.n) : b.n) : b.t === 'teo' ? 'teo:' + b.tipo : (b.t === 'cita' || b.t === 'resumen') ? b.t : '';
  if (E.selEstilo !== document.activeElement) E.selEstilo.value = v;
  const enTabla = b && b.t === 'tabla', enFig = b && b.t === 'fig' && b.src;
  E.cintaTabla.hidden = !enTabla; E.cintaFig.hidden = !enFig;
  if (enTabla) { E.tbBorde.value = b.borde; E.cinta.querySelector('[data-cmd="tb-enc"]').setAttribute('aria-pressed', String(!!b.enc)); }
  if (enFig && document.activeElement !== E.figAncho) { E.figAncho.value = b.ancho; E.figAnchoVal.textContent = b.ancho + '%'; }
  const sinTexto = !(document.activeElement && (document.activeElement.classList.contains('ed')));
  void sinTexto; void celdaActual; void edDe;
}

// ── Vistas visual / código / dividida ───────────────────────────────────

export function fijarVista(v) {
  S.vista = v;
  E.cuerpo.classList.remove('vista-visual', 'vista-codigo', 'vista-dividida');
  E.cuerpo.classList.add('vista-' + v);
  document.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === v)));
  try { localStorage.setItem('lv.vista', v); } catch { /* ignorar */ }
  if (v !== 'visual' && S.doc) actualizarCodigo(true);
  requestAnimationFrame(ajustarZoom);
}

// ── Exportar, compartir ─────────────────────────────────────────────────

function menuExportar(ancla) {
  abrirMenu(ancla, [
    { texto: 'Revisar compatibilidad…', icono: '✓', fn: () => revisarExportacion() },
    '-',
    { texto: 'Descargar .zip (proyecto completo)', icono: '⇩', fn: () => descargarZip() },
    { texto: 'Descargar solo el .tex', icono: '⇩', fn: () => descargarTex() },
    { texto: 'Guardar como PDF (imprimir)…', icono: '🖨', fn: () => imprimirPDF() },
    { texto: 'Abrir en Overleaf (para compilar)', icono: '↗', fn: () => abrirOverleaf() },
    '-',
    { texto: 'Copiar el código LaTeX', icono: '⧉', fn: async () => { guardarPendientes(true); try { await copiarTexto(textoActual()); aviso('Código copiado.', 'ok'); } catch { aviso('No se pudo copiar.', 'error'); } } },
    { texto: 'Copia de seguridad (.json)', icono: '{ }', fn: () => descargarJSON() },
  ], { alineado: 'der' });
}

async function compartir() {
  const url = location.href;
  try { await copiarTexto(url); } catch { /* ignorar */ }
  aviso(S.store.modo === 'firebase' ? 'Enlace copiado. Quien lo abra podrá editar este documento.' : 'Enlace copiado. En modo local solo funciona en este navegador; configura Firebase para compartir.', 'ok', 5000);
}

// ── Colaboración ────────────────────────────────────────────────────────

function pintarPresencia() {
  const otros = presentes.filter((p) => p.uid !== S.store.usuario.uid && Date.now() - (p.ts || 0) < 70000);
  E.presencia.replaceChildren(...[...otros.slice(0, 6).map((p) => h('span', { class: 'avatar', style: { background: p.color }, title: p.nombre }, iniciales(p.nombre))),
    ...(otros.length > 6 ? [h('span', { class: 'avatar mas' }, `+${otros.length - 6}`)] : [])]);
  E.bloques.querySelectorAll('.bq-quien').forEach((q) => { q.textContent = ''; q.style.cssText = ''; q.parentElement.style.removeProperty('--quien'); });
  for (const p of otros) {
    const bq = p.bloque && E.bloques.querySelector(`.bq[data-id="${p.bloque}"]`);
    if (!bq) continue;
    const q = bq.querySelector('.bq-quien');
    q.textContent = p.nombre; q.style.background = p.color;
    bq.style.setProperty('--quien', p.color);
  }
}

function publicar() {
  const ahora = Date.now();
  if (ahora - ultimaPub < 1200) { clearTimeout(pubT); pubT = setTimeout(publicar, 1300); return; }
  ultimaPub = ahora;
  S.store.publicarPresencia(S.did, { bloque: S.sel || null });
}

function mostrarEstado(est) {
  if (!E.estado) return;
  let t = 'Guardado', c = '';
  if (est.error) { t = 'No se pudo guardar'; c = 'err'; }
  else if (!est.enLinea) { t = 'Sin conexión: se guardará al volver'; c = 'warn'; }
  else if (est.pendientes > 0) t = 'Guardando…';
  else if (S.store.modo === 'local') t = 'Guardado en este navegador';
  E.estado.textContent = t; E.estado.className = 'ed-estado ' + c;
}

// ── Entrar / salir ──────────────────────────────────────────────────────

function cablearDivisor() {
  const d = document.getElementById('divisor');
  try { const w = localStorage.getItem('lv.wcodigo'); if (w) E.cuerpo.style.setProperty('--w-codigo', w); } catch { /* ignorar */ }
  let activo = false;
  const mover = (x) => {
    const r = E.cuerpo.getBoundingClientRect();
    const panel = E.panel.hidden ? 0 : E.panel.offsetWidth;
    const w = Math.max(280, Math.min(r.width - panel - 320, r.right - panel - x));
    E.cuerpo.style.setProperty('--w-codigo', w + 'px');
  };
  d.addEventListener('pointerdown', (e) => { activo = true; d.setPointerCapture(e.pointerId); d.classList.add('activo'); document.body.classList.add('arrastrando-divisor'); });
  d.addEventListener('pointermove', (e) => { if (activo) mover(e.clientX); });
  const fin = () => {
    if (!activo) return;
    activo = false; d.classList.remove('activo'); document.body.classList.remove('arrastrando-divisor');
    try { localStorage.setItem('lv.wcodigo', E.cuerpo.style.getPropertyValue('--w-codigo')); } catch { /* ignorar */ }
    ajustarZoom();
  };
  d.addEventListener('pointerup', fin); d.addEventListener('pointercancel', fin);
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const w = E.zonaCodigo.offsetWidth + (e.key === 'ArrowLeft' ? 40 : -40);
    E.cuerpo.style.setProperty('--w-codigo', Math.max(280, w) + 'px'); ajustarZoom();
  });
}

function cablear() {
  if (cableado) return;
  cableado = true;
  cablearDivisor();
  if (innerWidth < 1000) { E.panel.hidden = true; E.cuerpo.classList.add('sin-panel'); document.getElementById('btn-panel').setAttribute('aria-pressed', 'false'); }
  cablearCinta(); cablearPortada(); iniciarCodigo(); iniciarPaneles(); instalarEventos(); seguirSeleccion();
  registrarPreambulo(() => (S.doc ? S.doc.extra : ''), definicionesMathJax);
  usarFuentePreambulo(() => (S.doc ? S.doc.extra : ''));
  bus.addEventListener('doc', comprobarPreambulo); // si cambia el preámbulo propio, las fórmulas se recomponen
  document.getElementById('btn-volver').addEventListener('click', () => { guardarPendientes(); location.hash = '#documentos'; });
  E.btnExportar.addEventListener('click', (e) => menuExportar(e.currentTarget));
  document.getElementById('btn-compartir').addEventListener('click', compartir);
  document.getElementById('btn-panel').addEventListener('click', () => {
    E.panel.hidden = !E.panel.hidden; E.cuerpo.classList.toggle('sin-panel', E.panel.hidden); requestAnimationFrame(ajustarZoom);
    document.getElementById('btn-panel').setAttribute('aria-pressed', String(!E.panel.hidden));
  });
  document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => fijarVista(b.dataset.vista)));
  E.titulo.addEventListener('change', () => { const t = E.titulo.value.trim() || 'Sin título'; S.doc.titulo = t; S.store.actualizarDocumento(S.did, { titulo: t }); document.title = t + ' · LaTeX visual'; });
  E.titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') E.titulo.blur(); });
  new ResizeObserver(() => ajustarZoom()).observe(E.zonaVisual);
  addEventListener('pagehide', () => { if (!E.vistaEditor.hidden) guardarPendientes(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !E.vistaEditor.hidden) guardarPendientes(true); });
  addEventListener('beforeunload', (e) => { if (!E.vistaEditor.hidden && haySinGuardar()) { guardarPendientes(true); if (S.store.modo === 'firebase') e.preventDefault(); } });
  addEventListener('afterprint', () => document.body.classList.remove('imprimiendo'));
  bus.addEventListener('derivados', () => { pintarPresencia(); });
  bus.addEventListener('ir-vista', (e) => { if (e.detail && S.vista !== e.detail) fijarVista(e.detail); });
}

function intentarListo() {
  if (!docRecibido || ultimaLista == null) return;
  if (!listo) { listo = true; }
  recibirBloques(ultimaLista);
  ultimaLista = null;
}

export function entrarEditor(did) {
  cablear();
  if (S.did === did && listo) { E.vistaEditor.hidden = false; return; }
  salirEditor();
  S.did = did; S.doc = null; listo = false; docRecibido = false; ultimaLista = null;
  E.vistaEditor.hidden = false;
  E.bloques.replaceChildren();
  E.estado.textContent = 'Cargando…';
  let vista = 'dividida';
  try { vista = localStorage.getItem('lv.vista') || 'visual'; } catch { vista = 'visual'; }
  fijarVista(['visual', 'codigo', 'dividida'].includes(vista) ? vista : 'visual');

  unsubs.push(S.store.suscribirDocumento(did, (d) => {
    if (!d) { aviso('Ese documento no existe o fue eliminado.', 'error', 4000); location.hash = '#documentos'; return; }
    const primera = !S.doc;
    S.doc = d;
    document.title = (d.titulo || 'Documento') + ' · LaTeX visual';
    if (document.activeElement !== E.titulo) E.titulo.value = d.titulo;
    docRecibido = true;
    aplicarEstiloHoja();
    pintarPanel();
    bus.dispatchEvent(new CustomEvent('doc'));
    if (primera) { intentarListo(); actualizarCodigo(true); } else if (listo) refrescarDerivados();
  }));
  unsubs.push(S.store.suscribirBloques(did, (lista) => {
    ultimaLista = lista;
    if (docRecibido) intentarListo();
  }));
  unsubs.push(S.store.suscribirEstado(mostrarEstado));
  unsubs.push(S.store.suscribirPresencia(did, (l) => { presentes = l; pintarPresencia(); }));
  publicar();
  clearInterval(hbT);
  hbT = setInterval(() => { if (!E.vistaEditor.hidden) S.store.publicarPresencia(S.did, { bloque: S.sel || null }); }, 25000);
  document.addEventListener('lv-foco', publicar);
  E.btnDeshacer.disabled = true; E.btnRehacer.disabled = true;
}

export function salirEditor() {
  if (S.did) { try { guardarPendientes(true); } catch { /* ignorar */ } }
  for (const u of unsubs) { try { u(); } catch { /* ignorar */ } }
  unsubs = [];
  clearInterval(hbT);
  document.removeEventListener('lv-foco', publicar);
  if (S.did && S.store) S.store.salirPresencia(S.did);
  limpiarEstado();
  S.did = null; S.doc = null; listo = false; docRecibido = false;
  if (E.vistaEditor) E.vistaEditor.hidden = true;
  if (E.bloques) E.bloques.replaceChildren();
}

void bloqueNuevo; void nuevoId; void rotulos; void aplicarCambios; void reconciliar; void hace;
