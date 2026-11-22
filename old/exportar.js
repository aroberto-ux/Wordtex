// Descargas: .tex, .zip (con imágenes), PDF por impresión, Overleaf y copia JSON.

import { S } from './estado.js?v=2026.11.07-p';
import { descargar, nombreArchivo, aviso, modal, h } from './ui.js?v=2026.11.07-p';
import { generarTex } from './latex-gen.js?v=2026.11.07-p';
import { generarCodigo, codigoDe, formatoDe, extensionDe, nombreFormato } from './generar.js?v=2026.11.07-p';
import { compilarTypstAPdf } from './typst-compilar.js?v=2026.11.07-p';
import { guardarPendientes } from './ops.js?v=2026.11.07-p';

/** Código del documento en su formato (LaTeX o Typst). En Typst usa el código editado si existe.
 *  Devuelve { tex, imagenes }. */
export function textoLatex() {
  guardarPendientes(true);
  return codigoDe({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra, codigoTypst: S.doc.codigoTypst }, S.bloques);
}

/** Quita comentarios y regiones literales antes de buscar comandos activos. */
function latexActivo(src) {
  // Primero se neutraliza \verb/\lstinline y después se quitan comentarios. Así un marcador de
  // entorno escrito dentro de un comentario nunca puede ocultar comandos activos posteriores.
  const sinComentarios = String(src || '').split('\n').map((linea) => {
    let visible = linea.replace(/\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)([^a-zA-Z\s*{]).*?\1/g, '');
    for (let i = 0; i < visible.length; i++) {
      if (visible[i] !== '%') continue;
      let barras = 0; for (let j = i - 1; j >= 0 && visible[j] === '\\'; j--) barras++;
      if (barras % 2 === 0) return visible.slice(0, i);
    }
    return visible;
  }).join('\n');
  return sinComentarios.replace(/\\begin\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}[\s\S]*?\\end\{\1\}/g, '');
}

/** Revisión estática de un documento Typst: avisa de bloques sin equivalente e imágenes sin incluir. */
function analizarTypst(generado) {
  const hallazgos = [];
  const raw = S.bloques.filter((b) => b.t === 'raw').length;
  const tikz = S.bloques.filter((b) => b.t === 'tikz').length;
  if (raw) hallazgos.push({ nivel: 'aviso', titulo: `${raw} bloque(s) de «LaTeX avanzado»`, detalle: 'No tienen equivalente en Typst y se omiten en el documento Typst.' });
  if (tikz) hallazgos.push({ nivel: 'aviso', titulo: `${tikz} dibujo(s) TikZ`, detalle: 'TikZ es de LaTeX. En Typst se muestran como un recuadro; para dibujar usa el paquete cetz.' });
  if (S.bloques.some((b) => b.t === 'fig' && b.src)) hallazgos.push({ nivel: 'info', titulo: 'El documento tiene imágenes', detalle: 'La compilación en línea de Typst aún no incluye las imágenes incrustadas; aparecerán como un recuadro.' });
  return { generado, hallazgos, errores: 0, avisos: hallazgos.filter((x) => x.nivel === 'aviso').length };
}

/** Revisión estática del proyecto. No sustituye una compilación real. */
export function analizarExportacion(generado = textoLatex()) {
  const { tex, imagenes } = generado;
  const hallazgos = [];
  const agregar = (nivel, titulo, detalle = '') => hallazgos.push({ nivel, titulo, detalle });
  // Los chequeos de abajo son específicos de LaTeX (\includegraphics, \ref, \cite…). En Typst solo se
  // informa de los bloques que no tienen equivalente (raw/tikz) y las imágenes.
  if (formatoDe({ cfg: S.doc.cfg }) === 'typst') return analizarTypst(generado);
  const activo = latexActivo(tex);
  const conocidos = new Set(imagenes.map((x) => `imagenes/${x.nombre}`));
  const rutasImagen = new Set();
  for (const m of activo.matchAll(/\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) rutasImagen.add(m[1].trim());
  for (const ruta of rutasImagen) if (!conocidos.has(ruta)) agregar('error', `Falta la imagen «${ruta}»`, 'El .zip no puede incluirla porque solo se importó su ruta. Añádela en Overleaf o reemplázala desde la vista visual.');

  const deps = new Set();
  for (const m of activo.matchAll(/\\(?:input|include|includepdf|bibliography|addbibresource)(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
    for (const ruta of m[1].split(',').map((x) => x.trim()).filter(Boolean)) deps.add(ruta);
  }
  for (const ruta of deps) agregar('error', `Falta el archivo externo «${ruta}»`, 'Wordtex conserva la referencia, pero el archivo no forma parte del proyecto exportado.');

  const etiquetas = new Map();
  for (const m of activo.matchAll(/\\label\{([^}]+)\}/g)) etiquetas.set(m[1], (etiquetas.get(m[1]) || 0) + 1);
  for (const [et, n] of etiquetas) if (n > 1) agregar('aviso', `Etiqueta repetida: «${et}»`, `Aparece ${n} veces; las referencias pueden apuntar al elemento equivocado.`);
  const refs = new Set();
  for (const m of activo.matchAll(/\\(?:ref|eqref|autoref|cref|Cref|pageref)\{([^}]+)\}/g)) for (const x of m[1].split(',').map((v) => v.trim()).filter(Boolean)) refs.add(x);
  for (const ref of refs) if (!etiquetas.has(ref)) agregar('error', `Referencia sin destino: «${ref}»`, 'Crea una etiqueta con ese nombre o corrige la referencia.');

  const claves = new Set((S.doc.biblio || []).map((x) => x.key));
  for (const m of activo.matchAll(/\\(?:cite|citep|citet|parencite|textcite)\*?(?:\s*\[[^\]]*\])*\s*\{([^}]+)\}/g)) {
    for (const key of m[1].split(',').map((x) => x.trim()).filter(Boolean)) if (!claves.has(key) && !new RegExp(`\\\\bibitem(?:\\[[^\\]]*\\])?\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`).test(activo)) agregar('error', `Cita sin bibliografía: «${key}»`, 'Añade la referencia desde el panel Referencias o incluye el archivo bibliográfico en Overleaf.');
  }

  const raw = S.bloques.filter((b) => b.t === 'raw').length;
  if (raw) agregar('info', `${raw} bloque${raw === 1 ? '' : 's'} de LaTeX avanzado`, 'Se conservan al exportar, pero su vista en Wordtex es aproximada.');
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*fontspec|\\setmainfont\b|\\usepackage(?:\[[^\]]*\])?\{[^}]*polyglossia/.test(activo)) agregar('aviso', 'El documento parece requerir XeLaTeX o LuaLaTeX', 'La opción «Abrir en Overleaf» usa pdfLaTeX por defecto; cambia el compilador dentro de Overleaf.');
  return { generado, hallazgos, errores: hallazgos.filter((x) => x.nivel === 'error').length, avisos: hallazgos.filter((x) => x.nivel === 'aviso').length };
}

function cuerpoRevision(r) {
  const estado = r.errores ? `${r.errores} problema${r.errores === 1 ? '' : 's'} que requieren atención` : r.avisos ? `${r.avisos} aviso${r.avisos === 1 ? '' : 's'}` : 'No se detectaron problemas';
  return h('div', { class: 'revision-exportacion' },
    h('p', { class: `revision-resumen ${r.errores ? 'error' : r.avisos ? 'aviso' : 'ok'}` }, estado),
    h('p', { class: 'vacio-panel' }, formatoDe({ cfg: S.doc.cfg }) === 'typst'
      ? 'Esta comprobación es orientativa. La confirmación definitiva se obtiene compilando el documento.'
      : 'Esta comprobación revisa archivos y referencias. La confirmación definitiva se obtiene compilando en Overleaf o con una distribución LaTeX.'),
    r.hallazgos.length ? h('ul', {}, r.hallazgos.map((x) => h('li', { class: `revision-${x.nivel}` }, h('strong', {}, x.titulo), x.detalle ? h('span', {}, x.detalle) : null))) : null,
  );
}

/** Abre el informe completo sin iniciar una descarga. */
export function revisarExportacion() {
  const r = analizarExportacion();
  modal({ titulo: 'Revisión antes de exportar', ancho: 620, cuerpo: cuerpoRevision(r), acciones: [{ texto: 'Cerrar', primario: true, fn: (c) => c(true) }] });
}

function trasRevision(nombreAccion, accion) {
  const r = analizarExportacion();
  if (!r.errores && !r.avisos) { accion(r.generado); return; }
  modal({
    titulo: 'Revisar antes de continuar', ancho: 620, cuerpo: cuerpoRevision(r),
    acciones: [
      { texto: 'Cancelar', fn: (c) => c(null) },
      { texto: nombreAccion, primario: !r.errores, peligro: !!r.errores, fn: (c) => { accion(r.generado); c(true); } },
    ],
  });
}

const base = () => nombreArchivo(S.doc.titulo || S.doc.cfg.titulo || 'documento');

export function descargarTex() {
  const ext = extensionDe({ cfg: S.doc.cfg });
  const mime = ext === 'typ' ? 'text/plain;charset=utf-8' : 'application/x-tex;charset=utf-8';
  trasRevision('Descargar de todos modos', ({ tex, imagenes }) => {
    descargar(`${base()}.${ext}`, tex, mime);
    if (imagenes.length) aviso('El documento tiene imágenes: para compilarlo necesitas también la carpeta «imagenes». Mejor descarga el .zip.', 'info', 6000);
  });
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

async function descargarZipDirecto({ tex, imagenes }) {
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

export function descargarZip() {
  trasRevision('Descargar .zip de todos modos', (generado) => { descargarZipDirecto(generado); });
}

export function descargarJSON() {
  guardarPendientes(true);
  const obj = { formato: 'latex-visual-v1', titulo: S.doc.titulo, cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra, bloques: S.bloques.map(({ id, orden, ...r }) => r) };
  if (typeof S.doc.codigoTypst === 'string') obj.codigoTypst = S.doc.codigoTypst;   // código Typst editado
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

function abrirOverleafDirecto({ tex, imagenes }) {
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
      { texto: 'Descargar .zip', primario: true, fn: (c) => { descargarZipDirecto({ tex, imagenes }); c(true); } },
    ],
  });
}

export function abrirOverleaf() {
  trasRevision('Continuar hacia Overleaf', (generado) => abrirOverleafDirecto(generado));
}

// ── Compilar PDF (servicio TeXLive.net) ─────────────────────────────────
// Wordtex es un sitio estático sin servidor, así que la compilación real la hace un servicio externo
// gratuito y comunitario (texlive.net, el mismo que usan learnlatex.org y los foros de TeX). Primero se
// intenta por fetch para enseñar el PDF dentro de Wordtex; si el navegador bloquea la respuesta por CORS
// (o el servicio no responde), se cae a un envío por formulario que abre el PDF en una pestaña nueva.

const TEXLIVE = 'https://texlive.net/cgi-bin/latexcgi';

/** Motor de LaTeX según el preámbulo: fontspec/polyglossia → XeLaTeX; luacode/luatextra/luaotfload → LuaLaTeX. */
export function motorLatex(tex) {
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(luacode|luatextra|luaotfload|luamplib)\b|\\directlua\b/.test(tex)) return 'lualatex';
  if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bfontspec\b|\\setmainfont\b|\\usepackage(?:\[[^\]]*\])?\{[^}]*\bpolyglossia\b/.test(tex)) return 'xelatex';
  return 'pdflatex';
}

// texlive.net solo recibe archivos de texto (.tex): escribe cada filecontents[] como texto plano, sin
// decodificar binarios. Por eso las imágenes del documento no viajan a este compilador; para un PDF con
// imágenes el camino es el .zip → Overleaf. Aquí solo informamos cuántas quedan fuera.
// Se mira solo el LaTeX «activo» (sin comentarios ni verbatim), igual que analizarExportacion, para no
// avisar por un \includegraphics comentado o de ejemplo.
export function imagenesExternas(tex) {
  const refs = new Set();
  for (const m of latexActivo(tex).matchAll(/\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) refs.add(m[1].trim());
  return [...refs];
}

/** Envío por formulario: no sufre CORS porque es una navegación normal; abre el PDF en otra pestaña. */
function enviarFormularioTexlive({ tex }, engine) {
  const ta = h('textarea', { name: 'filecontents[]' }); ta.value = tex; ta.style.display = 'none';
  const f = h('form', { action: TEXLIVE, method: 'post', target: '_blank', enctype: 'multipart/form-data', style: { display: 'none' } },
    h('input', { type: 'hidden', name: 'engine', value: engine }),
    h('input', { type: 'hidden', name: 'return', value: 'pdf' }),   // mismo resultado que el camino fetch: PDF directo
    h('input', { type: 'hidden', name: 'filename[]', value: 'document.tex' }),
    ta);
  document.body.append(f); f.submit(); f.remove();
  aviso('Compilando en texlive.net: el PDF se abrirá en una pestaña nueva.', 'info', 6000);
}

/** Muestra el PDF compilado en un modal con visor y botón de descarga. */
function mostrarPDF(blob) {
  const url = URL.createObjectURL(blob);
  const visor = h('iframe', { class: 'pdf-visor', src: url, title: 'PDF compilado' });
  const { cerrar } = modal({
    titulo: 'PDF compilado', ancho: 900, clase: 'modal-pdf', cuerpo: h('div', { class: 'pdf-caja' }, visor),
    acciones: [
      { texto: 'Descargar PDF', primario: true, fn: () => { descargar(`${base()}.pdf`, blob, 'application/pdf'); } },
      { texto: 'Cerrar', fn: (c) => c(true) },
    ],
    alCerrar: () => setTimeout(() => URL.revokeObjectURL(url), 2000),
  });
  return cerrar;
}

/** Muestra el log de compilación cuando el compilador devuelve errores en vez de un PDF. */
function mostrarLog(texto, generado, engine) {
  const log = String(texto || '').slice(-8000);
  const esTypst = engine === 'typst';
  const acciones = esTypst
    ? [{ texto: 'Cerrar', primario: true, fn: (c) => c(true) }]
    : [{ texto: 'Reintentar en pestaña nueva', fn: (c) => { enviarFormularioTexlive(generado, engine); c(true); } },
       { texto: 'Cerrar', primario: true, fn: (c) => c(true) }];
  modal({
    titulo: 'La compilación falló', ancho: 720, clase: 'modal-log',
    cuerpo: h('div', {},
      h('p', {}, esTypst
        ? 'Typst no pudo generar el PDF. Suele deberse a un error en el documento (o a que no se pudo descargar el motor). Abajo está el detalle:'
        : 'El servicio de LaTeX no pudo generar el PDF. Suele deberse a un error en el código o a un paquete que no está en el servidor. Abajo está el registro (las últimas líneas son las más útiles):'),
      h('pre', { class: 'log-tex' }, log || 'Sin registro disponible.')),
    acciones,
  });
}

async function compilarConTexlive(generado) {
  const { tex } = generado;
  const engine = motorLatex(tex);

  const fd = new FormData();
  fd.append('engine', engine);
  fd.append('return', 'pdf');            // pide el PDF crudo (no la página visor de PDF.js)
  fd.append('filename[]', 'document.tex');
  fd.append('filecontents[]', tex);

  const cerrarEspera = aviso('Compilando el PDF en texlive.net… (se envía el texto del documento a ese servicio)', 'info', 120000);
  let resp;
  try {
    resp = await fetch(TEXLIVE, { method: 'POST', body: fd });
  } catch {
    // CORS o red: el navegador bloqueó la respuesta. Se cae al envío por formulario (pestaña nueva).
    cerrarEspera();
    enviarFormularioTexlive(generado, engine);
    return;
  }
  cerrarEspera();
  const tipo = resp.headers.get('content-type') || '';
  if (resp.ok && /pdf/.test(tipo)) {
    const blob = await resp.blob();
    if (blob.size) mostrarPDF(blob);
    else mostrarLog('El servicio devolvió un PDF vacío. Reintenta; si persiste, abre el .tex en Overleaf.', generado, engine);
  } else {
    // El servicio devolvió un log de error (texto) o algo inesperado.
    let texto = '';
    try { texto = await resp.text(); } catch { /* sin cuerpo */ }
    mostrarLog(texto, generado, engine);
  }
}

/** Compila un documento Typst a PDF en el navegador (typst.ts WASM) y lo muestra. */
async function compilarConTypst(generado) {
  const cerrarEspera = aviso('Compilando con Typst… (la primera vez descarga el motor, puede tardar)', 'info', 180000);
  try {
    const bytes = await compilarTypstAPdf(generado.tex);
    cerrarEspera();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (blob.size) mostrarPDF(blob);
    else mostrarLog('Typst no produjo ningún PDF. Revisa el documento e inténtalo de nuevo.', generado, 'typst');
  } catch (e) {
    cerrarEspera();
    // typst.ts lanza con el mensaje de error de compilación (o un fallo de red al traer el motor WASM).
    mostrarLog(String(e && e.message || e), generado, 'typst');
  }
}

export function compilarPDF() {
  if (!S.bloques.length) { aviso('El documento está vacío: no hay nada que compilar.', 'info'); return; }
  if (formatoDe({ cfg: S.doc.cfg }) === 'typst') {
    trasRevision('Compilar de todos modos', (generado) => { compilarConTypst(generado); });
    return;
  }
  trasRevision('Compilar de todos modos', (generado) => {
    const imgs = imagenesExternas(generado.tex);
    if (imgs.length) {
      // El compilador en línea no recibe imágenes: se avisa y se ofrece el .zip (que sí las lleva a Overleaf).
      modal({
        titulo: 'El documento tiene imágenes', ancho: 480,
        cuerpo: h('div', {},
          h('p', {}, `El compilador en línea solo recibe el texto, así que las ${imgs.length === 1 ? 'imagen' : `${imgs.length} imágenes`} aparecerán como un recuadro de error en el PDF.`),
          h('p', { class: 'vacio-panel' }, 'Para un PDF con las imágenes, descarga el .zip y súbelo a Overleaf (Nuevo proyecto → Subir proyecto).')),
        acciones: [
          { texto: 'Descargar .zip', fn: (c) => { descargarZipDirecto(generado); c(true); } },
          { texto: 'Compilar solo el texto', primario: true, fn: (c) => { compilarConTexlive(generado); c(true); } },
        ],
      });
      return;
    }
    compilarConTexlive(generado);
  });
}
