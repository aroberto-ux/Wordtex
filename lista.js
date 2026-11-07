// Lista de documentos: crear (con plantillas), importar .tex / .json, renombrar, duplicar, descargar, eliminar.

import { S, E } from './estado.js?v=2026.11.07-m';
import { h, aviso, pedir, confirmar, abrirMenu, hace, modal, descargar, nombreArchivo } from './ui.js?v=2026.11.07-m';
import { PLANTILLAS, crearDesdePlantilla } from './plantillas.js?v=2026.11.07-m';
import { parsearTex } from './latex-parse.js?v=2026.11.07-m';
import { generarTex } from './latex-gen.js?v=2026.11.07-m';
import { sanearBloque } from './modelo.js?v=2026.11.07-m';
import { resumenImportacion } from './vista-latex.js?v=2026.11.07-m';

let unsub = null;
let cableado = false;
let ultima = [];

export function entrarLista() {
  preparar();
  E.vistaLista.hidden = false;
  document.title = 'LaTeX visual';
  if (!unsub) unsub = S.store.suscribirDocumentos((l) => { ultima = l; pintar(); });
}

export function salirLista() {
  if (unsub) { unsub(); unsub = null; }
  E.vistaLista.hidden = true;
  E.rejilla.replaceChildren();
}

function preparar() {
  if (cableado) return;
  cableado = true;
  document.getElementById('btn-nueva').addEventListener('click', nueva);
  document.getElementById('btn-importar').addEventListener('click', () => E.inputImportar.click());
  E.inputImportar.addEventListener('change', async () => {
    const f = E.inputImportar.files && E.inputImportar.files[0];
    E.inputImportar.value = '';
    if (!f) return;
    try { await importarArchivo(f); } catch (e) { aviso(e.message || 'No se pudo importar el archivo.', 'error', 5000); }
  });
}

async function importarArchivo(f) {
  const texto = await f.text();
  const titulo = f.name.replace(/\.[^.]+$/, '') || 'Documento importado';
  if (/\.json$/i.test(f.name)) {
    const obj = JSON.parse(texto);
    if (!obj || obj.formato !== 'latex-visual-v1' || !Array.isArray(obj.bloques)) throw new Error('Ese JSON no es una copia de LaTeX visual.');
    const id = await S.store.importar(obj);
    aviso('Documento importado.', 'ok'); location.hash = `#documentos/${id}`; return;
  }
  const m = parsearTex(texto);
  const bloques = m.bloques.map(({ id, orden, ...r }) => r);
  if (!bloques.length) bloques.push({ t: 'p', c: [], al: 'j' });
  const id = await S.store.crearDocumento({ titulo, cfg: m.cfg, biblio: m.biblio, extra: m.extra }, bloques);
  aviso(`${resumenImportacion(bloques)}${m.avisos.length ? ' ' + m.avisos[0] : ''}`, 'ok', 9000);
  location.hash = `#documentos/${id}`;
}

async function nueva() {
  let elegida = 'blanco';
  const titulo = h('input', { type: 'text', value: 'Documento sin título', maxlength: 120, 'aria-label': 'Nombre del documento' });
  const rejilla = h('div', { class: 'plantillas', role: 'listbox', 'aria-label': 'Plantillas' }, PLANTILLAS.map((p) => {
    const b = h('button', { type: 'button', role: 'option', class: 'plantilla', 'aria-selected': String(p.id === elegida), onclick: () => {
      elegida = p.id; rejilla.querySelectorAll('.plantilla').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      if (/^(Documento sin título|Taller 1|Mi documento)$/.test(titulo.value) || PLANTILLAS.some((q) => q.nombre === titulo.value)) titulo.value = p.id === 'blanco' ? 'Documento sin título' : p.nombre;
    } }, h('span', { class: 'pl-ico' }, p.icono), h('b', {}, p.nombre), h('small', {}, p.desc));
    return b;
  }));
  const ok = await new Promise((res) => {
    modal({
      titulo: 'Nuevo documento', ancho: 640,
      cuerpo: h('div', {}, h('label', { class: 'campo' }, h('span', {}, 'Nombre'), titulo), h('div', { class: 'campo-et' }, 'Empieza desde una plantilla'), rejilla),
      acciones: [{ texto: 'Cancelar', fn: (c) => c(null) }, { texto: 'Crear', primario: true, fn: (c) => c(true) }],
      alCerrar: (v) => res(v === true),
    });
    setTimeout(() => { titulo.focus(); titulo.select(); }, 40);
  });
  if (!ok) return;
  try {
    const nombre = titulo.value.trim() || 'Documento sin título';
    const d = crearDesdePlantilla(elegida, nombre);
    // en el documento en blanco el título de la portada es el nombre que se escribió
    if (elegida === 'blanco' && nombre !== 'Documento sin título') d.cfg.titulo = nombre;
    const id = await S.store.crearDocumento({ titulo: nombre, cfg: d.cfg, biblio: d.biblio, extra: d.extra }, d.bloques);
    location.hash = `#documentos/${id}`;
  } catch (e) {
    console.error(e);
    aviso('No se pudo crear el documento. Revisa la conexión y las reglas de Firestore.', 'error', 5000);
  }
}

async function renombrar(d) {
  const r = await pedir({ titulo: 'Cambiar nombre', etiqueta: 'Nombre', valor: d.titulo, ok: 'Guardar' });
  if (r) S.store.actualizarDocumento(d.id, { titulo: r.valor });
}

async function duplicar(d) {
  try {
    const datos = await S.store.exportar(d.id);
    datos.titulo = `Copia de ${d.titulo}`;
    const id = await S.store.importar(datos);
    aviso('Documento duplicado.', 'ok'); location.hash = `#documentos/${id}`;
  } catch (e) { console.error(e); aviso('No se pudo duplicar.', 'error'); }
}

async function descargarTexDe(d) {
  try {
    const o = await S.store.exportar(d.id);
    const bloques = o.bloques.map((b) => ({ ...sanearBloque(b), id: '' }));
    const { tex, imagenes } = generarTex({ cfg: o.cfg, biblio: o.biblio, extra: o.extra }, bloques);
    descargar(`${nombreArchivo(d.titulo)}.tex`, tex, 'application/x-tex;charset=utf-8');
    if (imagenes.length) aviso('Tiene imágenes: abre el documento y descarga el .zip para incluirlas.', 'info', 6000);
  } catch { aviso('No se pudo exportar.', 'error'); }
}

async function descargarJsonDe(d) {
  try { descargar(`${nombreArchivo(d.titulo)}.json`, JSON.stringify(await S.store.exportar(d.id), null, 2), 'application/json'); }
  catch { aviso('No se pudo exportar.', 'error'); }
}

async function eliminar(d) {
  if (!(await confirmar(`«${d.titulo}» se eliminará para todas las personas. Antes puedes descargar una copia de seguridad.`, 'Eliminar', '¿Eliminar documento?'))) return;
  await S.store.eliminarDocumento(d.id);
  aviso('Documento eliminado.');
}

const NOMBRE_CLASE = { article: 'Artículo', report: 'Informe', book: 'Libro' };

function tarjeta(d) {
  const abrir = () => { location.hash = `#documentos/${d.id}`; };
  const hoja = h('button', { class: 'tarjeta-hoja', 'aria-label': `Abrir ${d.titulo}`, onclick: abrir },
    h('div', { class: 'mini-hoja' }, h('b', {}, d.cfg.titulo || d.titulo), h('i', {}, d.cfg.autor || ''), h('span', { class: 'ln' }), h('span', { class: 'ln' }), h('span', { class: 'ln c' }), h('span', { class: 'ln' }), h('span', { class: 'ln c' })));
  const menu = h('button', { class: 'btn-icono', 'aria-label': `Opciones de ${d.titulo}`, onclick: (e) => {
    abrirMenu(e.currentTarget, [
      { texto: 'Abrir', icono: '✎', fn: abrir },
      { texto: 'Cambiar nombre', icono: 'T', fn: () => renombrar(d) },
      { texto: 'Duplicar', icono: '⧉', fn: () => duplicar(d) },
      { texto: 'Descargar .tex', icono: '⇩', fn: () => descargarTexDe(d) },
      { texto: 'Copia de seguridad (.json)', icono: '{ }', fn: () => descargarJsonDe(d) },
      '-',
      { texto: 'Eliminar', icono: '🗑', peligro: true, fn: () => eliminar(d) },
    ], { alineado: 'der' });
  } }, '⋯');
  return h('article', { class: 'tarjeta' }, hoja,
    h('div', { class: 'tarjeta-info' },
      h('div', { class: 'tarjeta-texto', onclick: abrir }, h('b', {}, d.titulo || 'Sin título'), h('small', {}, `${NOMBRE_CLASE[d.cfg.clase] || 'Documento'} · editado ${hace(d.actualizado)}`)),
      menu));
}

function pintar() {
  E.listaVacia.hidden = ultima.length > 0;
  E.rejilla.replaceChildren(...ultima.map(tarjeta));
}
