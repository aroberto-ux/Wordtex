// Cada bloque del modelo ⇄ su representación editable en la página.

import { h } from './ui.js?v=2026.11.07-c';
import { TEOREMAS, LENGUAJES_COD, textoPlano } from './modelo.js?v=2026.11.07-c';
import { rellenar, leerInline, renderMate, pintarInline } from './inline-dom.js?v=2026.11.07-c';
import { rotulos } from './numerar.js?v=2026.11.07-c';
import { texParaMate, vistaBloqueRaw, tipoVistaRaw, dibujarTikz } from './vista-latex.js?v=2026.11.07-c';

const PH = {
  p: 'Escribe aquí… (pulsa «/» para insertar algo)', h: 'Título', teo: 'Enunciado…', cita: 'Texto de la cita…', resumen: 'Escribe el resumen…',
  pie: 'Pie (opcional)', li: 'Elemento de la lista',
};

export function ed(nodos, cls, ph, extra = {}) {
  const e = h('div', { class: `ed ${cls}`, contenteditable: 'true', 'data-ph': ph || '', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', ...extra });
  rellenar(e, nodos);
  return e;
}

export function autoAlto(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 40) + 'px'; }

const ALINEA = { j: 'justify', l: 'left', c: 'center', r: 'right' };

export const NIVELES_LISTA = 5; // niveles de anidamiento admitidos (0..NIVELES_LISTA-1)
const ROMANO = (k) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'][k - 1] || String(k);
const VINETAS = ['•', '–', '∗', '·', '‣']; // itemize por nivel, como LaTeX (bullet, dash, asterisk, dot…)

/** Pone el símbolo de cada elemento de una lista (1., a), i., A. o viñetas) en todos los niveles. */
export function marcarLista(lista) {
  const ord = lista.dataset.ord === '1';
  const cont = new Array(NIVELES_LISTA).fill(0);
  for (const li of lista.querySelectorAll('.li')) {
    const n = Math.min(+li.dataset.n || 0, NIVELES_LISTA - 1);
    cont[n]++; for (let k = n + 1; k < NIVELES_LISTA; k++) cont[k] = 0;
    li.style.marginLeft = (n * 28) + 'px';
    // con etiqueta propia (\item[…]) o en una lista de descripción no hay viñeta ni número
    if (lista.dataset.desc === '1' || li.querySelector(':scope > .li-et')) { li.dataset.m = ''; continue; }
    if (!ord) li.dataset.m = VINETAS[n] || VINETAS[VINETAS.length - 1];
    else {
      // enumerate anidado en LaTeX: 1.  (a)  i.  A.  y luego se repite
      const estilo = n % 4;
      if (estilo === 0) li.dataset.m = `${cont[n]}.`;
      else if (estilo === 1) li.dataset.m = `${String.fromCharCode(96 + ((cont[n] - 1) % 26) + 1)})`;
      else if (estilo === 2) li.dataset.m = `${ROMANO(cont[n])}.`;
      else li.dataset.m = `${String.fromCharCode(64 + ((cont[n] - 1) % 26) + 1)}.`;
    }
  }
}

function pintarTabla(b) {
  const t = h('table', { class: `tabx tabx-${b.borde}` });
  const cuerpo = h('tbody');
  b.filas.forEach((fila, i) => {
    const tr = h('tr', { class: b.enc && i === 0 ? 'enc' : '' });
    fila.forEach((celda, j) => {
      if (celda && !Array.isArray(celda) && celda.cover) return;
      const meta = Array.isArray(celda) ? {} : (celda || {});
      const c = Array.isArray(celda) ? celda : (meta.c || []);
      const editable = ed(c, 'celda', '', { 'data-fila': i, 'data-col': j });
      editable.style.textAlign = { l: 'left', c: 'center', r: 'right' }[meta.al || b.al[j]] || 'left';
      const td = h('td', {
        ...(meta.colspan > 1 ? { colspan: meta.colspan } : {}),
        ...(meta.rowspan > 1 ? { rowspan: meta.rowspan } : {}),
        class: meta.colspan > 1 || meta.rowspan > 1 ? 'fusionada' : '',
      }, editable);
      if (meta.colspan > 1 || meta.rowspan > 1) td.title = `Celda fusionada (${meta.rowspan || 1} fila(s) × ${meta.colspan || 1} columna(s))`;
      tr.append(td);
    });
    cuerpo.append(tr);
  });
  t.append(cuerpo);
  return t;
}

export function pintarBloque(b) {
  const asa = h('div', { class: 'bq-asa', contenteditable: 'false' },
    h('button', { type: 'button', class: 'asa-btn', 'data-accion': 'menu', title: 'Opciones del bloque (mover, duplicar, eliminar…)', 'aria-label': 'Opciones del bloque' }, '⋮'),
    h('span', { class: 'asa-mover', draggable: 'true', title: 'Arrastra para mover este bloque', 'aria-hidden': 'true' }, '⠿'));
  const bq = h('div', { class: `bq bq-${b.t}`, 'data-id': b.id, 'data-t': b.t });
  let cuerpo;
  switch (b.t) {
    case 'p': {
      cuerpo = ed(b.c, 'p', PH.p);
      cuerpo.style.textAlign = ALINEA[b.al] || 'justify';
      break;
    }
    case 'h': cuerpo = ed(b.c, `h h${b.n}${b.num === false ? ' sinnum' : ''}`, PH.h); break;
    case 'lista': {
      cuerpo = h('div', { class: `lista${b.desc ? ' desc' : ''}`, 'data-ord': b.ord ? '1' : '0', 'data-desc': b.desc ? '1' : '0' }, b.items.map((it) => {
        const li = ed(it.c, 'li', PH.li, { 'data-n': it.n || 0 });
        if (Array.isArray(it.et)) li.prepend(chipTermino(it.et));
        return li;
      }));
      marcarLista(cuerpo);
      break;
    }
    case 'eq': {
      const vista = h('div', { class: 'eq-vista', tabindex: '0', role: 'button', 'data-accion': 'eq', title: 'Clic para editar la ecuación' });
      renderMate(vista, texParaMate(b.env, b.tex), b.env !== 'math');
      cuerpo = h('div', { class: 'eq', contenteditable: 'false' }, vista, h('span', { class: 'eq-num' }));
      break;
    }
    case 'tabla': {
      const pie = ed(b.pie, 'pie', PH.pie);
      cuerpo = h('figure', { class: 'tabla' }, h('div', { class: 'tabla-sc' }, pintarTabla(b)), pie);
      break;
    }
    case 'fig': {
      const img = b.src
        ? h('img', { src: b.src, alt: b.nombre, style: { width: b.ancho + '%' }, draggable: 'false' })
        : h('button', { type: 'button', class: 'fig-vacia', 'data-accion': 'img' }, h('span', { class: 'fig-ico' }, '🖼'), 'Haz clic para añadir una imagen');
      cuerpo = h('figure', { class: 'fig' }, h('div', { class: 'fig-img', contenteditable: 'false', 'data-accion': b.src ? 'img' : null }, img), ed(b.pie, 'pie', PH.pie));
      if (!b.src && b.ruta) cuerpo.querySelector('.fig-vacia').append(h('small', { class: 'fig-ruta' }, `Archivo original: ${b.ruta}`));
      break;
    }
    case 'tikz': {
      const vista = h('div', { class: 'tikz-vista', tabindex: '0', role: 'button', 'data-accion': 'tikz', title: 'Clic para editar el dibujo' });
      const avisos = h('div', { class: 'tikz-avisos', contenteditable: 'false' });
      cuerpo = h('figure', { class: 'fig tikz-bq', contenteditable: 'false' }, vista, avisos, ed(b.pie, 'pie', PH.pie, { contenteditable: 'true' }));
      pintarTikz(cuerpo, b);
      break;
    }
    case 'cod': {
      const ta = h('textarea', { class: 'cod-ta', spellcheck: 'false', rows: 3, 'aria-label': 'Código', wrap: 'off' });
      ta.value = b.src;
      const sel = h('select', { class: 'cod-lang', 'aria-label': 'Lenguaje' }, LENGUAJES_COD.map(([v, n]) => h('option', { value: v }, n)));
      sel.value = LENGUAJES_COD.some(([v]) => v === b.lang) ? b.lang : '';
      const num = h('input', { type: 'checkbox', class: 'cod-num', checked: !!b.num });
      cuerpo = h('div', { class: 'cod' }, h('div', { class: 'cod-cab' }, h('span', {}, 'Código'), sel, h('label', {}, num, ' Numerar líneas')), ta);
      queueMicrotask(() => autoAlto(ta));
      break;
    }
    case 'teo': {
      const sel = h('select', { class: 'teo-tipo', 'aria-label': 'Tipo' }, Object.entries(TEOREMAS).map(([k, v]) => h('option', { value: k }, v.es)));
      sel.value = b.tipo;
      cuerpo = h('div', { class: `teo teo-${TEOREMAS[b.tipo] ? TEOREMAS[b.tipo].estilo : 'plain'}` },
        h('div', { class: 'teo-cab', contenteditable: 'false' }, sel, h('span', { class: 'teo-nombre' }), h('span', { class: 'teo-par' }, '('), h('input', { class: 'teo-titulo', type: 'text', value: b.titulo || '', placeholder: 'Título (opcional)', maxlength: 120, 'aria-label': 'Título' }), h('span', { class: 'teo-par' }, ')')),
        ed(b.c, 'teo-c', PH.teo));
      break;
    }
    case 'cita': cuerpo = h('blockquote', { class: 'cita' }, ed(b.c, 'cita-c', PH.cita)); break;
    case 'resumen': cuerpo = h('div', { class: 'resumen' }, h('div', { class: 'resumen-t', contenteditable: 'false' }, 'Resumen'), ed(b.c, 'resumen-c', PH.resumen)); break;
    case 'salto': cuerpo = h('div', { class: 'salto', contenteditable: 'false' }, h('span', {}, 'Salto de página')); break;
    case 'toc': cuerpo = h('div', { class: 'toc', contenteditable: 'false' }, h('div', { class: 'toc-t' }, 'Índice general'), h('div', { class: 'toc-lista' })); break;
    case 'raw': {
      // Vista previa (si la hay) y, debajo, el código dentro de «Ver/editar código». El textarea está siempre
      // en el DOM para que leerBloque lo encuentre aunque el desplegable esté cerrado.
      const ta = h('textarea', { class: 'raw-ta', spellcheck: 'false', rows: 2, 'aria-label': 'Código LaTeX', wrap: 'off' });
      ta.value = b.tex;
      const det = h('details', { class: 'raw-det' }, h('summary', { contenteditable: 'false' }, 'Ver/editar código'), ta);
      det.addEventListener('toggle', () => autoAlto(ta));
      cuerpo = h('div', { class: 'raw' }, h('div', { class: 'raw-et', contenteditable: 'false' }), h('div', { class: 'raw-vista', contenteditable: 'false' }), det);
      pintarVistaRaw(cuerpo, b.tex, true);
      queueMicrotask(() => autoAlto(ta));
      break;
    }
    default: cuerpo = h('div', {}, '?');
  }
  bq.append(asa, h('div', { class: 'bq-cuerpo' }, cuerpo), h('div', { class: 'bq-quien', contenteditable: 'false' }));
  return bq;
}

/** Lee el bloque tal como está ahora en la página. `orig` aporta lo que no se edita en el DOM. */
export function leerBloque(bq, orig) {
  const q = (s) => bq.querySelector(s);
  const { id, orden, ...base } = orig;
  switch (orig.t) {
    case 'p': return { ...base, c: leerInline(q('.ed')) };
    case 'h': return { ...base, c: leerInline(q('.ed')) };
    case 'lista': return {
      ...base,
      items: Array.from(bq.querySelectorAll('.li')).map((li) => {
        const it = { c: leerInline(li), n: +li.dataset.n || 0 };
        const et = li.querySelector(':scope > .li-et');
        if (et) { try { it.et = JSON.parse(et.dataset.et || '[]'); } catch { it.et = []; } }
        return it;
      }),
    };
    case 'tabla': {
      // Partir del modelo original conserva spans y celdas cubiertas; el DOM solo contiene las anclas visibles.
      const filas = JSON.parse(JSON.stringify(base.filas || []));
      for (const c of bq.querySelectorAll('.celda')) {
        const i = +c.dataset.fila, j = +c.dataset.col;
        if (!filas[i] || !filas[i][j]) continue;
        const texto = leerInline(c);
        if (Array.isArray(filas[i][j])) filas[i][j] = texto;
        else filas[i][j] = { ...filas[i][j], c: texto };
      }
      return { ...base, filas, pie: leerInline(q('.pie')) };
    }
    case 'fig': case 'tikz': return { ...base, pie: leerInline(q('.pie')) };
    case 'cod': return { ...base, src: q('.cod-ta').value, lang: q('.cod-lang').value, num: q('.cod-num').checked };
    case 'teo': return { ...base, tipo: q('.teo-tipo').value, titulo: q('.teo-titulo').value, c: leerInline(q('.teo-c')) };
    case 'cita': return { ...base, c: leerInline(q('.cita-c')) };
    case 'resumen': return { ...base, c: leerInline(q('.resumen-c')) };
    case 'raw': return { ...base, tex: q('.raw-ta').value };
    default: return { ...base };
  }
}

/** Números, rótulos y vistas derivadas (índice) de todos los bloques de la página. */
export function decorar(raiz, num, cfg) {
  const ro = rotulos(cfg.idioma);
  for (const bq of raiz.querySelectorAll('.bq')) {
    const i = num.info.get(bq.dataset.id) || {};
    const t = bq.dataset.t;
    if (t === 'h') bq.querySelector('.ed').dataset.num = i.num || '';
    else if (t === 'eq') bq.querySelector('.eq-num').textContent = i.num ? `(${i.num})` : '';
    else if (t === 'tabla' || t === 'fig' || t === 'tikz') { const p = bq.querySelector('.pie'); p.dataset.pref = i.nombre ? `${i.nombre}${p.textContent.trim() ? '. ' : ''}` : ''; }
    else if (t === 'teo') bq.querySelector('.teo-nombre').textContent = i.nombre || '';
    else if (t === 'raw' && i.items) {
      // pies de tablas y figuras del LaTeX avanzado: «Tabla 2. …» con el número que tendrán en el PDF
      const pies = [...bq.querySelectorAll('.rv-pie[data-flot]')];
      i.items.filter((x) => x.cap).forEach((x, k) => { if (pies[k]) pies[k].dataset.pref = `${x.nombre}. `; });
    }
    else if (t === 'resumen') bq.querySelector('.resumen-t').textContent = ro.resumen;
    else if (t === 'toc') {
      bq.querySelector('.toc-t').textContent = ro.indice;
      bq.querySelector('.toc-lista').replaceChildren(...(num.titulos.length ? num.titulos.map((x) => h('div', { class: `toc-f toc-n${x.n}`, 'data-ir': x.id }, h('span', { class: 'toc-num' }, x.num), x.texto || '(sin título)'))
        : [h('div', { class: 'toc-vacio' }, 'Aún no hay secciones: aparecerán aquí.')]));
    }
  }
}

// ── LaTeX avanzado, términos de listas y dibujos TikZ ──────────────────

const NOMBRE_VISTA = { mate: 'ecuación', tabla: 'tabla', tikz: 'dibujo TikZ', entorno: 'entorno', regla: 'línea', espacio: 'espacio', archivo: 'archivo incluido', ajuste: 'configuración', comentario: 'comentario' };

/** Pinta (o vuelve a pintar al editar el código) la vista previa de un bloque «LaTeX avanzado». */
export function pintarVistaRaw(cont, tex, inicial = false) {
  const vista = cont.querySelector('.raw-vista'), et = cont.querySelector('.raw-et'), det = cont.querySelector('.raw-det');
  let v = null;
  try { v = vistaBloqueRaw(tex); } catch { v = null; }
  vista.replaceChildren(...(v ? [v] : []));
  vista.hidden = !v;
  const tipo = v ? tipoVistaRaw(tex) : null;
  // Con vista previa no hay etiqueta: el documento se ve como en el PDF. Sin vista previa solo se muestra el código.
  et.textContent = v ? '' : 'Código LaTeX';
  et.hidden = !!v;
  if (v) cont.dataset.tipo = tipo || ''; else delete cont.dataset.tipo;
  cont.classList.toggle('sin-vista', !v);
  // sin vista previa, o si solo hay comentarios (un bloque recién creado), el código se ve abierto
  if (inicial || !v) det.open = !v || tipo === 'comentario';
}
export function actualizarVistaRaw(bq) {
  const c = bq && bq.querySelector('.raw');
  if (c) pintarVistaRaw(c, c.querySelector('.raw-ta').value);
}

/** Término de un elemento de lista (\item[término]): se edita con un clic, como las fórmulas. */
export function chipTermino(et) {
  const e = h('span', { class: 'li-et', contenteditable: 'false', 'data-et': JSON.stringify(et || []), title: 'Término o etiqueta del elemento: clic para cambiarlo' });
  if (et && et.length) e.append(pintarInline(et)); else e.classList.add('vacio');
  return e;
}

/** Dibuja el TikZ de un bloque en su vista previa y resume los avisos del intérprete. */
export function pintarTikz(cuerpo, b) {
  const vista = cuerpo.querySelector('.tikz-vista'), av = cuerpo.querySelector('.tikz-avisos');
  const avisos = dibujarTikz(vista, b.src, { opc: b.opc, ancho: b.ancho });
  av.replaceChildren();
  av.hidden = !avisos.length;
  if (avisos.length) {
    const d = h('details', {}, h('summary', {}, `⚠ ${avisos.length === 1 ? 'Algo no se ve' : `${avisos.length} cosas no se ven`} en la vista previa (el PDF sí las tendrá)`), h('ul', {}, avisos.map((a) => h('li', {}, a))));
    av.append(d);
  }
}

// ── Imágenes ────────────────────────────────────────────────────────────

const MAX_CHARS = 760000; // por debajo del límite de 1 MiB de Firestore, con margen

/** Reduce una imagen para que quepa dentro del documento. Devuelve { src, nombre }. */
export function procesarImagen(archivo, nombresUsados = new Set()) {
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(archivo.type)) return rej(new Error('Usa una imagen PNG, JPG, GIF o WebP.'));
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const png = archivo.type === 'image/png';
      let esc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      let calidad = 0.88, salida = null;
      for (let intento = 0; intento < 8; intento++) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * esc)); c.height = Math.max(1, Math.round(img.naturalHeight * esc));
        const g = c.getContext('2d');
        if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(img, 0, 0, c.width, c.height);
        salida = c.toDataURL(png && intento < 4 ? 'image/png' : 'image/jpeg', calidad);
        if (salida.length <= MAX_CHARS) break;
        esc *= 0.8; calidad = Math.max(0.6, calidad - 0.05);
      }
      if (salida.length > MAX_CHARS * 1.3) return rej(new Error('La imagen es demasiado grande incluso reducida.'));
      const ext = salida.startsWith('data:image/png') ? 'png' : 'jpg';
      let base = (archivo.name || 'imagen').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'imagen';
      let nombre = `${base}.${ext}`, k = 1;
      while (nombresUsados.has(nombre)) nombre = `${base}-${++k}.${ext}`;
      res({ src: salida, nombre });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

export { textoPlano };
