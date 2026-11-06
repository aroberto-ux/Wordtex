// Panel lateral: esquema, ajustes del documento, bibliografía y preámbulo propio.

import { S, E } from './estado.js?v=2026.11.05-a';
import { h, aviso, confirmar } from './ui.js?v=2026.11.05-a';
import { CLASES, TAMANOS, PAPELES, IDIOMAS, textoPlano } from './modelo.js?v=2026.11.05-a';
import { numeracion, bus, mapa, enfocar } from './ops.js?v=2026.11.05-a';

const PESTANAS = [['esquema', 'Esquema'], ['doc', 'Documento'], ['bib', 'Referencias'], ['avanzado', 'Avanzado'], ['ayuda', 'Ayuda']];
let activa = 'esquema';
let tBib = null;

export function cambiarCfg(parche) {
  const p = {};
  for (const [k, v] of Object.entries(parche)) { p['cfg.' + k] = v; S.doc.cfg[k] = v; }
  S.store.actualizarDocumento(S.did, p);
  bus.dispatchEvent(new CustomEvent('doc'));
}

const sel = (opts, valor, fn, etiqueta) => {
  const s = h('select', { 'aria-label': etiqueta, onchange: () => fn(s.value) }, opts.map(([v, n]) => h('option', { value: String(v) }, n)));
  s.value = String(valor);
  return s;
};
const campo = (et, control, ayuda) => h('label', { class: 'campo' }, h('span', {}, et), control, ayuda ? h('small', { class: 'ayuda' }, ayuda) : null);

function esquema() {
  const t = numeracion.titulos;
  const palabras = S.bloques.reduce((n, b) => {
    const txt = [b.c, b.pie, ...(b.items ? b.items.map((i) => i.c) : [])].filter(Boolean).map((c) => textoPlano(c)).join(' ');
    return n + (txt.trim() ? txt.trim().split(/\s+/).length : 0);
  }, 0);
  return h('div', {},
    t.length ? h('nav', { class: 'esquema', 'aria-label': 'Esquema del documento' }, t.map((x) => h('button', {
      class: `esq-f esq-n${x.n}`, onclick: () => { const bq = mapa.get(x.id); if (bq) { bq.scrollIntoView({ behavior: 'smooth', block: 'center' }); enfocar(x.id, 'inicio'); } },
    }, h('span', { class: 'esq-num' }, x.num), x.texto || '(sin título)')))
      : h('p', { class: 'vacio-panel' }, 'Aquí aparecerán las secciones del documento. Crea una con el menú de estilos de la cinta (Sección, Subsección…).'),
    h('p', { class: 'estadistica' }, `${palabras} palabras · ${S.bloques.length} bloques`));
}

function ajustes() {
  const c = S.doc.cfg;
  const titulo = h('input', { type: 'text', value: c.titulo, maxlength: 200, 'aria-label': 'Título', onchange: (e) => cambiarCfg({ titulo: e.target.value }) });
  const autor = h('input', { type: 'text', value: c.autor, maxlength: 200, 'aria-label': 'Autor', onchange: (e) => cambiarCfg({ autor: e.target.value }) });
  const fechaModo = c.fecha === '' ? 'hoy' : c.fecha === 'ninguna' ? 'ninguna' : 'otra';
  const fechaTxt = h('input', { type: 'text', value: fechaModo === 'otra' ? c.fecha : '', placeholder: 'Ej. Noviembre de 2026', maxlength: 100, hidden: fechaModo !== 'otra', 'aria-label': 'Fecha', onchange: (e) => cambiarCfg({ fecha: e.target.value.trim() || '' }) });
  const fechaSel = sel([['hoy', 'La de hoy (automática)'], ['ninguna', 'Sin fecha'], ['otra', 'Escribir una fecha…']], fechaModo, (v) => {
    fechaTxt.hidden = v !== 'otra';
    if (v === 'hoy') cambiarCfg({ fecha: '' }); else if (v === 'ninguna') cambiarCfg({ fecha: 'ninguna' }); else fechaTxt.focus();
  }, 'Fecha');
  const margenPropio = c.margen === 'extra';
  const margen = h('input', { type: 'number', min: 0.5, max: 6, step: 0.5, value: margenPropio ? 2.5 : c.margen, disabled: margenPropio, 'aria-label': 'Márgenes en cm', onchange: (e) => cambiarCfg({ margen: Math.max(0.5, Math.min(6, +e.target.value || 2.5)) }) });
  const propio = h('input', { type: 'checkbox', checked: margenPropio, onchange: (e) => cambiarCfg({ margen: e.target.checked ? 'extra' : 2.5 }) });
  return h('div', { class: 'ajustes' },
    h('h3', {}, 'Portada'),
    campo('Título', titulo), campo('Autor(es)', autor), campo('Fecha', [fechaSel, fechaTxt]),
    h('label', { class: 'fila chk' }, h('input', { type: 'checkbox', checked: c.mostrarTitulo, onchange: (e) => cambiarCfg({ mostrarTitulo: e.target.checked }) }), 'Mostrar el bloque de título'),
    h('h3', {}, 'Página'),
    campo('Tipo de documento', sel(CLASES, c.clase, (v) => cambiarCfg({ clase: v }), 'Tipo de documento'), 'Informe y Libro tienen capítulos.'),
    campo('Papel', sel(PAPELES, c.papel, (v) => cambiarCfg({ papel: v }), 'Papel')),
    campo('Márgenes (cm)', [margen, h('label', { class: 'fila chk' }, propio, 'Los defino yo en el preámbulo')]),
    campo('Columnas', sel([[1, 'Una'], [2, 'Dos']], c.columnas, (v) => cambiarCfg({ columnas: +v }), 'Columnas'), 'Las dos columnas se ven al compilar.'),
    h('label', { class: 'fila chk' }, h('input', { type: 'checkbox', checked: c.numPag, onchange: (e) => cambiarCfg({ numPag: e.target.checked }) }), 'Numerar las páginas'),
    h('h3', {}, 'Texto'),
    campo('Idioma', sel(IDIOMAS, c.idioma, (v) => cambiarCfg({ idioma: v }), 'Idioma'), 'Cambia la separación de palabras y rótulos como «Figura» o «Índice».'),
    campo('Tamaño de letra', sel(TAMANOS.map((t) => [t, `${t} pt`]), c.fuente, (v) => cambiarCfg({ fuente: +v }), 'Tamaño de letra')),
    campo('Interlineado', sel([[1, 'Sencillo'], [1.15, '1,15'], [1.5, '1,5'], [2, 'Doble']], c.interlineado, (v) => cambiarCfg({ interlineado: +v }), 'Interlineado')));
}

function referencias() {
  const lista = S.doc.biblio;
  const guardar = () => {
    const bib = Array.from(E.panelCuerpo.querySelectorAll('.ref-fila')).map((f) => ({ key: f.querySelector('.ref-key').value.replace(/[^\w:.-]/g, ''), texto: f.querySelector('.ref-txt').value.trim() })).filter((x) => x.key && x.texto);
    const unicas = []; const vistos = new Set();
    for (const b of bib) if (!vistos.has(b.key)) { vistos.add(b.key); unicas.push(b); }
    S.doc.biblio = unicas;
    S.store.actualizarDocumento(S.did, { biblio: unicas });
    bus.dispatchEvent(new CustomEvent('doc'));
  };
  const diferido = () => { clearTimeout(tBib); tBib = setTimeout(guardar, 500); };
  return h('div', {},
    h('p', { class: 'vacio-panel' }, 'Escribe cada referencia completa. Para citarla en el texto usa el botón «Cita» de la cinta. El número [1], [2]… se asigna solo.'),
    lista.map((r, i) => h('div', { class: 'ref-fila' },
      h('div', { class: 'ref-n' }, `[${i + 1}]`),
      h('input', { class: 'ref-key', type: 'text', value: r.key, maxlength: 40, 'aria-label': 'Clave', placeholder: 'clave', oninput: diferido }),
      h('textarea', { class: 'ref-txt', rows: 2, maxlength: 600, 'aria-label': 'Referencia', placeholder: 'Autor, título, editorial, año', oninput: diferido }, r.texto),
      h('button', { class: 'btn-icono', 'aria-label': 'Quitar referencia', title: 'Quitar', onclick: async () => {
        if (await confirmar(`Se quitará la referencia «${r.key}». Las citas que la usen mostrarán «?».`, 'Quitar', '¿Quitar referencia?')) {
          S.doc.biblio = lista.filter((_, j) => j !== i); S.store.actualizarDocumento(S.did, { biblio: S.doc.biblio }); bus.dispatchEvent(new CustomEvent('doc')); pintar(true);
        }
      } }, '×'))),
    h('button', { class: 'btn', onclick: () => {
      let k = 1; const usadas = new Set(lista.map((x) => x.key));
      while (usadas.has(`ref${k}`)) k++;
      S.doc.biblio = [...lista, { key: `ref${k}`, texto: 'Autor. Título. Editorial, año.' }];
      S.store.actualizarDocumento(S.did, { biblio: S.doc.biblio }); bus.dispatchEvent(new CustomEvent('doc')); pintar(true);
    } }, '＋ Añadir referencia'));
}

function avanzado() {
  const ta = h('textarea', { class: 'mono', rows: 12, spellcheck: 'false', 'aria-label': 'Preámbulo propio', placeholder: '\\usepackage{tikz}\n\\newcommand{\\R}{\\mathbb{R}}' });
  ta.value = S.doc.extra || '';
  let t = null;
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.doc.extra = ta.value; S.store.actualizarDocumento(S.did, { extra: ta.value }); bus.dispatchEvent(new CustomEvent('doc')); }, 600); });
  return h('div', {},
    h('p', { class: 'vacio-panel' }, 'Paquetes y macros de LaTeX propios (por ejemplo \\usepackage{tikz}). Se copian tal cual antes de «\\begin{document}». Solo hace falta si ya sabes LaTeX. Los paquetes habituales (xcolor, multirow, float, tabularx, longtable, multicol, enumitem, siunitx, bm, cancel, mathtools, caption, subcaption…) se cargan solos cuando tu texto, tus ecuaciones o tu LaTeX avanzado los usan.'),
    ta);
}

function ayuda() {
  const f = (a, b) => h('tr', {}, h('th', {}, a), h('td', {}, b));
  return h('div', { class: 'ayuda-panel' },
    h('h3', {}, 'Escribir'),
    h('table', {}, h('tbody', {},
      f('Enter', 'Nuevo párrafo (o elemento de lista)'), f('Mayús+Enter', 'Salto de línea'), f('/', 'En un párrafo vacío: menú para insertar'),
      f('Tab / Mayús+Tab', 'Sangría en listas; celda siguiente en tablas'), f('Ctrl+B / I / U', 'Negrita, cursiva, subrayado'), f('Ctrl+E', 'Código en línea'),
      f('Ctrl+K', 'Enlace'), f('Ctrl+Z / Y', 'Deshacer / rehacer'))),
    h('h3', {}, 'Cómo se traduce a LaTeX'),
    h('table', {}, h('tbody', {},
      f('Sección', '\\section{…}'), f('Negrita', '\\textbf{…}'), f('Lista', '\\begin{itemize}…'), f('Ecuación', '\\begin{equation}…'),
      f('Tabla', '\\begin{tabular}…'), f('Cita [1]', '\\cite{clave}'), f('Referencia', '\\ref{etiqueta}'), f('Nota al pie', '\\footnote{…}'))),
    h('p', { class: 'vacio-panel' }, 'Abre la vista «Dividida» para ver el código LaTeX mientras escribes: es una buena forma de aprender.'),
    h('p', { class: 'vacio-panel' }, 'Lo que ves en la página es una vista aproximada. La tipografía exacta (saltos de línea y de página) la decide LaTeX al compilar el .tex.'));
}

const VISTAS = { esquema, doc: ajustes, bib: referencias, avanzado, ayuda };

export function pintar(forzar = false) {
  if (!forzar && E.panelCuerpo.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) return;
  E.panelTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === activa)));
  E.panelCuerpo.replaceChildren(VISTAS[activa]());
}

export function iniciarPaneles() {
  E.panelTabs.replaceChildren(...PESTANAS.map(([k, n]) => h('button', { role: 'tab', 'data-tab': k, onclick: () => { activa = k; pintar(true); } }, n)));
  bus.addEventListener('derivados', () => { if (activa === 'esquema') pintar(); });
  bus.addEventListener('doc', () => { if (activa !== 'esquema') pintar(); });
  pintar(true);
}

export function abrirPestana(k) { activa = k; E.panel.hidden = false; E.cuerpo.classList.remove('sin-panel'); pintar(true); }
