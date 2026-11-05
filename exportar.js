// Descargas: .tex, .zip (con imágenes), PDF por impresión, Overleaf y copia JSON.

import { S } from './estado.js?v=2026.11.04-c';
import { descargar, nombreArchivo, aviso, modal, h } from './ui.js?v=2026.11.04-c';
import { generarTex } from './latex-gen.js?v=2026.11.04-c';
import { guardarPendientes } from './ops.js?v=2026.11.04-c';

export function textoLatex() {
  guardarPendientes(true);
  return generarTex({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra }, S.bloques);
}

const base = () => nombreArchivo(S.doc.titulo || S.doc.cfg.titulo || 'documento');

export function descargarTex() {
  const { tex, imagenes } = textoLatex();
  descargar(`${base()}.tex`, tex, 'application/x-tex;charset=utf-8');
  if (imagenes.length) aviso('El documento tiene imágenes: para compilarlo necesitas también la carpeta «imagenes». Mejor descarga el .zip.', 'info', 6000);
}

// ── ZIP sin compresión ──────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {Array<{nombre:string, datos:Uint8Array}>} archivos */
export function crearZip(archivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let pos = 0;
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, hora, true); loc.setUint16(12, fecha, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, a.datos.length, true); loc.setUint32(22, a.datos.length, true); loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), nombre, a.datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, hora, true); cen.setUint16(14, fecha, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, a.datos.length, true); cen.setUint32(24, a.datos.length, true); cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, pos, true);
    central.push(new Uint8Array(cen.buffer), nombre);
    pos += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}

export function bytesDeDataUrl(u) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(u || '');
  if (!m) return null;
  if (m[2]) { const b = atob(m[3]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  return new TextEncoder().encode(decodeURIComponent(m[3]));
}

export async function descargarZip() {
  const { tex, imagenes } = textoLatex();
  const enc = new TextEncoder();
  const archivos = [{ nombre: 'main.tex', datos: enc.encode(tex) }];
  const faltan = [];
  for (const im of imagenes) {
    let datos = bytesDeDataUrl(im.src);
    if (!datos && /^https?:/.test(im.src)) { try { datos = new Uint8Array(await (await fetch(im.src)).arrayBuffer()); } catch { /* sin acceso */ } }
    if (datos) archivos.push({ nombre: `imagenes/${im.nombre}`, datos }); else faltan.push(im.nombre);
  }
  archivos.push({
    nombre: 'LEEME.txt',
    datos: enc.encode(`Proyecto LaTeX exportado desde LaTeX visual.\n\nPara obtener el PDF:\n  · En Overleaf: Nuevo proyecto → Subir proyecto → elige este .zip.\n  · En tu computador: pdflatex main.tex (dos veces si hay índice o referencias).\n${faltan.length ? `\nImágenes que no se pudieron incluir: ${faltan.join(', ')}\n` : ''}`),
  });
  descargar(`${base()}.zip`, crearZip(archivos), 'application/zip');
  if (faltan.length) aviso(`No se pudieron incluir estas imágenes: ${faltan.join(', ')}`, 'error', 6000);
}

export function descargarJSON() {
  guardarPendientes(true);
  const obj = { formato: 'latex-visual-v1', titulo: S.doc.titulo, cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra, bloques: S.bloques.map(({ id, orden, ...r }) => r) };
  descargar(`${base()}.json`, JSON.stringify(obj, null, 2), 'application/json');
}

// ── PDF (imprimir la vista de página) ───────────────────────────────────

export function imprimirPDF() {
  guardarPendientes(true);
  const cfg = S.doc.cfg;
  const margen = cfg.margen === 'extra' ? 2.5 : cfg.margen;
  let st = document.getElementById('estilo-pagina');
  if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.append(st); }
  st.textContent = `@page { size: ${cfg.papel === 'letterpaper' ? 'letter' : 'A4'}; margin: ${margen}cm; }`;
  document.body.classList.add('imprimiendo');
  const fin = () => { document.body.classList.remove('imprimiendo'); window.removeEventListener('afterprint', fin); };
  window.addEventListener('afterprint', fin);
  aviso('En el diálogo de impresión elige «Guardar como PDF». Es una vista aproximada: para la tipografía exacta de LaTeX compila el .tex en Overleaf.', 'info', 7000);
  setTimeout(() => window.print(), 250);
}

// ── Overleaf ────────────────────────────────────────────────────────────

export function abrirOverleaf() {
  const { tex, imagenes } = textoLatex();
  const enviar = () => {
    const f = h('form', { action: 'https://www.overleaf.com/docs', method: 'post', target: '_blank', style: { display: 'none' } },
      h('input', { type: 'hidden', name: 'snip', value: tex }),
      h('input', { type: 'hidden', name: 'snip_name', value: S.doc.titulo || 'documento' }),
      h('input', { type: 'hidden', name: 'engine', value: 'pdflatex' }));
    document.body.append(f); f.submit(); f.remove();
  };
  if (!imagenes.length) { enviar(); return; }
  modal({
    titulo: 'Abrir en Overleaf', ancho: 460,
    cuerpo: h('div', {}, h('p', {}, 'Tu documento tiene imágenes y Overleaf no puede recibirlas de esta forma. Lo más cómodo es descargar el .zip y subirlo en Overleaf (Nuevo proyecto → Subir proyecto).'),
      h('p', { class: 'vacio-panel' }, 'También puedes abrirlo solo con el texto; las imágenes aparecerán como errores hasta que las subas.')),
    acciones: [
      { texto: 'Cancelar', fn: (c) => c(null) },
      { texto: 'Abrir solo el texto', fn: (c) => { enviar(); c(true); } },
      { texto: 'Descargar .zip', primario: true, fn: (c) => { descargarZip(); c(true); } },
    ],
  });
}
