// Cada bloque del modelo ⇄ su representación editable en la página.

import { h } from './ui.js?v=2026.11.04-a';
import { TEOREMAS, LENGUAJES_COD, textoPlano } from './modelo.js?v=2026.11.04-a';
import { rellenar, leerInline, renderMate } from './inline-dom.js?v=2026.11.04-a';
import { rotulos } from './numerar.js?v=2026.11.04-a';

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

/** Pone el símbolo de cada elemento de una lista (1., a), i. o viñetas). */
export function marcarLista(lista) {
  const ord = lista.dataset.ord === '1';
  const cont = [0, 0, 0];
  for (const li of lista.querySelectorAll('.li')) {
    const n = +li.dataset.n || 0;
    cont[n]++; for (let k = n + 1; k < 3; k++) cont[k] = 0;
    li.style.marginLeft = (n * 28) + 'px';
    if (!ord) li.dataset.m = ['•', '–', '∗'][n];
    else li.dataset.m = [`${cont[0]}.`, `${String.fromCharCode(96 + cont[1])})`, `${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][cont[2] - 1] || cont[2]}.`][n];
  }
}

function pintarTabla(b) {
  const t = h('table', { class: `tabx tabx-${b.borde}` });
  const cuerpo = h('tbody');
  b.filas.forEach((fila, i) => {
    const tr = h('tr', { class: b.enc && i === 0 ? 'enc' : '' });
    fila.forEach((c, j) => {
      const td = ed(c, 'celda', '', { 'data-fila': i, 'data-col': j });
      td.style.textAlign = { l: 'left', c: 'center', r: 'right' }[b.al[j]] || 'left';
      tr.append(h('td', {}, td));
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
      cuerpo = h('div', { class: 'lista', 'data-ord': b.ord ? '1' : '0' }, b.items.map((it) => {
        const li = ed(it.c, 'li', PH.li, { 'data-n': it.n || 0 });
        return li;
      }));
      marcarLista(cuerpo);
      break;
    }
    case 'eq': {
      const vista = h('div', { class: 'eq-vista', tabindex: '0', role: 'button', 'data-accion': 'eq', title: 'Clic para editar la ecuación' });
      const t = b.env === 'equation' ? b.tex : `\\begin{aligned}${b.tex}\\end{aligned}`;
      renderMate(vista, t, true);
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
      const ta = h('textarea', { class: 'raw-ta', spellcheck: 'false', rows: 2, 'aria-label': 'Código LaTeX', wrap: 'off' });
      ta.value = b.tex;
      cuerpo = h('div', { class: 'raw' }, h('div', { class: 'raw-et', contenteditable: 'false' }, 'LaTeX avanzado · se conserva tal cual'), ta);
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
    case 'lista': return { ...base, items: Array.from(bq.querySelectorAll('.li')).map((li) => ({ c: leerInline(li), n: +li.dataset.n || 0 })) };
    case 'tabla': {
      const filas = Array.from(bq.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('.celda')).map((c) => leerInline(c)));
      return { ...base, filas, pie: leerInline(q('.pie')) };
    }
    case 'fig': return { ...base, pie: leerInline(q('.pie')) };
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
    else if (t === 'tabla' || t === 'fig') { const p = bq.querySelector('.pie'); p.dataset.pref = i.nombre ? `${i.nombre}${p.textContent.trim() ? '. ' : ''}` : ''; }
    else if (t === 'teo') bq.querySelector('.teo-nombre').textContent = i.nombre || '';
    else if (t === 'resumen') bq.querySelector('.resumen-t').textContent = ro.resumen;
    else if (t === 'toc') {
      bq.querySelector('.toc-t').textContent = ro.indice;
      bq.querySelector('.toc-lista').replaceChildren(...(num.titulos.length ? num.titulos.map((x) => h('div', { class: `toc-f toc-n${x.n}`, 'data-ir': x.id }, h('span', { class: 'toc-num' }, x.num), x.texto || '(sin título)'))
        : [h('div', { class: 'toc-vacio' }, 'Aún no hay secciones: aparecerán aquí.')]));
    }
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
