// Herramienta de dibujo para quien no sabe TikZ: línea, flecha, rectángulo, círculo y texto sobre una
// cuadrícula, con color y grosor. Genera el código TikZ.
//
// No pierde lo escrito a mano: el código se parte en sentencias (dividirSentencias) y solo las que tienen
// una de las formas simples de abajo se pueden borrar desde aquí. Todo lo demás se conserva literalmente,
// en su sitio, y se ve de fondo. Las formas nuevas se añaden al final.
//
// La parte pura (leerPiezas, escribirPiezas, formaATikz) se prueba en Node.

import { dividirSentencias, interpretarTikz, tikzASvg, colorCss, PT_CM } from './tikz.js?v=2026.11.07-n';

const NUM = '(-?\\d*\\.?\\d+)';
const P = `\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)`;
const RE = {
  linea: new RegExp(`^\\\\draw(?:\\[([^\\]]*)\\])?\\s*${P}\\s*--\\s*${P}\\s*;$`),
  rect: new RegExp(`^\\\\draw(?:\\[([^\\]]*)\\])?\\s*${P}\\s*rectangle\\s*${P}\\s*;$`),
  circulo: new RegExp(`^\\\\draw(?:\\[([^\\]]*)\\])?\\s*${P}\\s*circle\\s*\\(\\s*${NUM}\\s*(?:cm)?\\s*\\)\\s*;$`),
  texto: new RegExp(`^\\\\node(?:\\[([^\\]]*)\\])?\\s*at\\s*${P}\\s*\\{([^{}]*)\\}\\s*;$`),
};
export const GROSORES_HERR = [['thin', 'Fino'], ['thick', 'Grueso'], ['very thick', 'Muy grueso'], ['ultra thick', 'Extra grueso']];
export const COLORES_HERR = [['black', 'Negro'], ['red', 'Rojo'], ['blue', 'Azul'], ['green!50!black', 'Verde'], ['orange', 'Naranja'], ['purple', 'Morado'], ['teal', 'Turquesa'], ['gray', 'Gris']];
const PT_GROSOR = { thin: 0.4, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 };

/** Opciones que entiende la herramienta: color, grosor y flecha «->». Si hay otra cosa, la sentencia es ajena. */
function leerOpciones(txt) {
  const o = { color: 'black', grosor: 'thin', flecha: false };
  for (const x of String(txt || '').split(',').map((y) => y.trim()).filter(Boolean)) {
    if (x === '->') o.flecha = true;
    else if (PT_GROSOR[x] != null) o.grosor = x;
    else if (/^[a-z]+(![\d.]+(![a-z]+)?)*$/.test(x) && colorCss(x)) o.color = x;
    else return null;
  }
  return o;
}

/** Reconoce una sentencia de la herramienta. Devuelve la forma o null. */
export function reconocer(sentencia) {
  const t = sentencia.replace(/%[^\n]*$/gm, '').trim();
  let m;
  const n = (x) => +x;
  if ((m = RE.linea.exec(t))) { const o = leerOpciones(m[1]); if (o) return { tipo: o.flecha ? 'flecha' : 'linea', x1: n(m[2]), y1: n(m[3]), x2: n(m[4]), y2: n(m[5]), color: o.color, grosor: o.grosor }; }
  if ((m = RE.rect.exec(t))) { const o = leerOpciones(m[1]); if (o && !o.flecha) return { tipo: 'rect', x1: n(m[2]), y1: n(m[3]), x2: n(m[4]), y2: n(m[5]), color: o.color, grosor: o.grosor }; }
  if ((m = RE.circulo.exec(t))) { const o = leerOpciones(m[1]); if (o && !o.flecha) return { tipo: 'circulo', x1: n(m[2]), y1: n(m[3]), r: n(m[4]), color: o.color, grosor: o.grosor }; }
  if ((m = RE.texto.exec(t))) { const o = leerOpciones(m[1]); if (o && !o.flecha && o.grosor === 'thin') return { tipo: 'texto', x1: n(m[2]), y1: n(m[3]), texto: m[4], color: o.color }; }
  return null;
}

const r2 = (v) => String(+(+v).toFixed(2));
/** Forma → código TikZ (una línea). */
export function formaATikz(f) {
  const op = [];
  if (f.color && f.color !== 'black') op.push(f.color);
  if (f.tipo !== 'texto' && f.grosor && f.grosor !== 'thin') op.push(f.grosor);
  if (f.tipo === 'flecha') op.push('->');
  const o = op.length ? `[${op.join(', ')}]` : '';
  const p = (x, y) => `(${r2(x)},${r2(y)})`;
  switch (f.tipo) {
    case 'linea': case 'flecha': return `\\draw${o} ${p(f.x1, f.y1)} -- ${p(f.x2, f.y2)};`;
    case 'rect': return `\\draw${o} ${p(f.x1, f.y1)} rectangle ${p(f.x2, f.y2)};`;
    case 'circulo': return `\\draw${o} ${p(f.x1, f.y1)} circle (${r2(f.r)});`;
    case 'texto': return `\\node${o} at ${p(f.x1, f.y1)} {${f.texto}};`;
    default: return '';
  }
}

/** Texto escrito por la persona → texto de nodo: escapa % # & _ fuera de las fórmulas $…$. */
export function textoNodo(s) {
  return String(s).split('$').map((tr, i) => (i % 2 ? tr : tr.replace(/([%#&_])/g, '\\$1').replace(/[{}]/g, ''))).join('$');
}

/** Código → piezas: { ajena: texto } o { forma, texto } (texto = el original, para no reescribirlo). */
export function leerPiezas(src) {
  return dividirSentencias(src).map((texto) => {
    const forma = reconocer(texto);
    return forma ? { forma, texto } : { ajena: texto };
  });
}
/** Piezas → código. Lo ajeno y las formas que no cambiaron conservan su texto exacto. */
export function escribirPiezas(piezas) {
  let o = '';
  for (const p of piezas) {
    if (p.ajena != null) { o += p.ajena; continue; }
    if (p.texto != null) { o += p.texto; continue; }
    if (o && !o.endsWith('\n')) o += '\n';
    o += formaATikz(p.forma) + '\n';
  }
  return o.replace(/\n+$/, '');
}

// ── Interfaz ───────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const html = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); }
  for (const h of hijos.flat()) if (h != null) e.append(h);
  return e;
};

const HERRAMIENTAS = [['linea', '／ Línea'], ['flecha', '→ Flecha'], ['rect', '▭ Rectángulo'], ['circulo', '◯ Círculo'], ['texto', 'T Texto'], ['borrar', '⌫ Borrar']];

/**
 * @param {HTMLElement} cont
 * @param {{ src: string, opc: string, alCambiar: (src) => void, pedirTexto: () => Promise<string|null> }} op
 */
export function crearHerramienta(cont, { src, opc = '', alCambiar, pedirTexto }) {
  let piezas = leerPiezas(src);
  const pila = [];
  let herr = 'linea', color = 'black', grosor = 'thin', paso = 0.5, ajustar = true;
  // escala de la imagen (scale/xscale/yscale): la herramienta trabaja en las coordenadas del código
  const num = (re, d) => { const m = re.exec(opc); return m ? parseFloat(m[1]) || d : d; };
  const esc = num(/(?:^|,)\s*scale\s*=\s*([\d.]+)/, 1);
  const sx = esc * num(/xscale\s*=\s*([\d.]+)/, 1), sy = esc * num(/yscale\s*=\s*([\d.]+)/, 1);
  const k = (x) => x * PT_CM * sx, kY = (y) => -y * PT_CM * sy;

  // zona visible: al menos 0..8 × 0..5 cm, y lo que ya haya dibujado
  const todo = interpretarTikz(src, { opc });
  let x0 = -0.5, x1 = 8.5, y0 = -0.5, y1 = 5.5;
  if (todo.caja) {
    x0 = Math.min(x0, Math.floor(todo.caja.x0 / PT_CM / sx) - 0.5); x1 = Math.max(x1, Math.ceil(todo.caja.x1 / PT_CM / sx) + 0.5);
    y0 = Math.min(y0, Math.floor(todo.caja.y0 / PT_CM / sy) - 0.5); y1 = Math.max(y1, Math.ceil(todo.caja.y1 / PT_CM / sy) + 0.5);
  }
  let vista = null;
  const fondo = html('div', { class: 'dib-fondo' });
  const capa = svgEl('svg', { class: 'dib-capa', preserveAspectRatio: 'xMidYMid meet' });
  const lienzo = html('div', { class: 'dib-lienzo' }, fondo, capa);
  const botones = HERRAMIENTAS.map(([id, txt]) => html('button', { type: 'button', class: 'tb txt', 'data-h': id, 'aria-pressed': String(id === herr), onclick: () => { herr = id; botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.h === herr))); capa.dataset.h = herr; } }, txt));
  const selColor = html('select', { 'aria-label': 'Color', onchange: (e) => { color = e.target.value; } }, COLORES_HERR.map(([v, n]) => html('option', { value: v }, n)));
  const selGrosor = html('select', { 'aria-label': 'Grosor', onchange: (e) => { grosor = e.target.value; } }, GROSORES_HERR.map(([v, n]) => html('option', { value: v }, n)));
  const selPaso = html('select', { 'aria-label': 'Cuadrícula', onchange: (e) => { paso = +e.target.value; pintar(); } }, [['0.25', '0,25 cm'], ['0.5', '0,5 cm'], ['1', '1 cm']].map(([v, n]) => html('option', { value: v, selected: v === '0.5' }, n)));
  const chkAjustar = html('input', { type: 'checkbox', checked: true, onchange: (e) => { ajustar = e.target.checked; } });
  const btnDeshacer = html('button', { type: 'button', class: 'tb txt', disabled: true, onclick: () => { if (pila.length) { piezas = pila.pop(); cambio(false); } } }, '↶ Deshacer');
  const ajenas = () => piezas.filter((p) => p.ajena != null && p.ajena.trim() && !/^\s*%/.test(p.ajena)).length;
  const nota = html('p', { class: 'dib-nota' });
  cont.replaceChildren(
    html('div', { class: 'dib-barra' }, html('div', { class: 'grupo' }, botones), html('div', { class: 'grupo' }, html('label', {}, 'Color ', selColor), html('label', {}, 'Grosor ', selGrosor)),
      html('div', { class: 'grupo' }, html('label', {}, 'Cuadrícula ', selPaso), html('label', { class: 'fila' }, chkAjustar, ' Ajustar'), btnDeshacer)),
    lienzo, nota);
  capa.dataset.h = herr;
  // la zona se amplía hasta tener la forma del lienzo: así la cuadrícula lo llena entero
  const caja = lienzo.getBoundingClientRect();
  if (caja.width > 0 && caja.height > 0) {
    const asp = caja.width / caja.height, w = (x1 - x0) * sx, hh = (y1 - y0) * sy;
    if (w / hh < asp) { const e = (hh * asp - w) / 2 / sx; x0 -= e; x1 += e; } else { const e = (w / asp - hh) / 2 / sy; y0 -= e; y1 += e; }
  }
  vista = { x0: k(x0), y0: -kY(y0), x1: k(x1), y1: -kY(y1) };
  capa.setAttribute('viewBox', `${vista.x0} ${-vista.y1} ${vista.x1 - vista.x0} ${vista.y1 - vista.y0}`);

  function pintarFondo() {
    // lo que la herramienta no entiende se dibuja con el intérprete, en la misma zona
    const codigo = piezas.filter((p) => p.ajena != null).map((p) => p.ajena).join('');
    fondo.innerHTML = tikzASvg(interpretarTikz(codigo, { opc }), { vista, clase: 'dib-svg' });
    const n = ajenas();
    nota.textContent = n ? `Hay ${n} instrucción(es) escritas a mano que esta herramienta no edita: se ven en el dibujo y se conservan tal cual.` : 'Dibuja arrastrando sobre la cuadrícula. El código TikZ se escribe solo.';
  }
  function pintar() {
    capa.replaceChildren();
    const g = svgEl('g', { class: 'dib-rejilla' });
    for (let x = Math.ceil(x0 / paso) * paso; x <= x1 + 1e-9; x += paso) g.append(svgEl('line', { x1: k(x), y1: kY(y0), x2: k(x), y2: kY(y1), class: Math.abs(x % 1) < 1e-9 ? 'cm' : '' }));
    for (let y = Math.ceil(y0 / paso) * paso; y <= y1 + 1e-9; y += paso) g.append(svgEl('line', { x1: k(x0), y1: kY(y), x2: k(x1), y2: kY(y), class: Math.abs(y % 1) < 1e-9 ? 'cm' : '' }));
    g.append(svgEl('circle', { cx: 0, cy: 0, r: 1.5, class: 'origen' }));
    capa.append(g);
    piezas.forEach((p, i) => { if (p.forma) capa.append(dibujarForma(p.forma, i)); });
  }
  function dibujarForma(f, i, previa = false) {
    const c = colorCss(f.color) || '#000', w = PT_GROSOR[f.grosor] || 0.4;
    const g = svgEl('g', { class: previa ? 'dib-previa' : 'dib-forma', 'data-i': i });
    const trazo = { stroke: c, 'stroke-width': w, fill: 'none' };
    if (f.tipo === 'linea' || f.tipo === 'flecha') {
      g.append(svgEl('line', { x1: k(f.x1), y1: kY(f.y1), x2: k(f.x2), y2: kY(f.y2), ...trazo, 'stroke-linecap': 'round' }));
      if (f.tipo === 'flecha') {
        const dx = k(f.x2) - k(f.x1), dy = kY(f.y2) - kY(f.y1), n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, L = 3 + 3 * w;
        g.append(svgEl('path', { d: `M ${k(f.x2) - ux * L + uy * L * 0.7} ${kY(f.y2) - uy * L - ux * L * 0.7} L ${k(f.x2)} ${kY(f.y2)} L ${k(f.x2) - ux * L - uy * L * 0.7} ${kY(f.y2) - uy * L + ux * L * 0.7}`, ...trazo, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      }
    } else if (f.tipo === 'rect') g.append(svgEl('rect', { x: Math.min(k(f.x1), k(f.x2)), y: Math.min(kY(f.y1), kY(f.y2)), width: Math.abs(k(f.x2) - k(f.x1)), height: Math.abs(kY(f.y2) - kY(f.y1)), ...trazo }));
    else if (f.tipo === 'circulo') g.append(svgEl('ellipse', { cx: k(f.x1), cy: kY(f.y1), rx: Math.abs(k(f.r)), ry: Math.abs(f.r * PT_CM * sy), ...trazo }));
    else if (f.tipo === 'texto') { const t = svgEl('text', { x: k(f.x1), y: kY(f.y1), fill: c, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dib-texto' }); t.textContent = f.texto.replace(/\$/g, ''); g.append(t); }
    // zona ancha e invisible para poder señalar líneas finas con el ratón
    if (!previa) for (const hijo of [...g.children]) { const z = hijo.cloneNode(); z.setAttribute('class', 'dib-zona'); z.setAttribute('stroke-width', 8); g.append(z); }
    return g;
  }
  function cambio(guardar = true) {
    if (guardar) { pila.push(piezas.map((p) => ({ ...p }))); if (pila.length > 60) pila.shift(); }
    btnDeshacer.disabled = !pila.length;
    pintarFondo(); pintar();
    alCambiar(escribirPiezas(piezas));
  }
  const punto = (ev) => {
    const pt = capa.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(capa.getScreenCTM().inverse());
    let x = q.x / (PT_CM * sx), y = -q.y / (PT_CM * sy);
    if (ajustar) { x = Math.round(x / paso) * paso; y = Math.round(y / paso) * paso; }
    return { x: +x.toFixed(2), y: +y.toFixed(2) };
  };

  let arrastre = null;
  capa.addEventListener('pointerdown', async (ev) => {
    if (ev.button !== 0) return;
    if (herr === 'borrar') {
      const g = ev.target.closest('.dib-forma');
      if (g) { const i = +g.dataset.i; pila.push(piezas.map((p) => ({ ...p }))); piezas.splice(i, 1); cambio(false); }
      return;
    }
    const p = punto(ev);
    if (herr === 'texto') {
      const t = await pedirTexto();
      if (t) { pila.push(piezas.map((q) => ({ ...q }))); piezas.push({ forma: { tipo: 'texto', x1: p.x, y1: p.y, texto: textoNodo(t), color } }); cambio(false); }
      return;
    }
    arrastre = { p, previa: null };
    capa.setPointerCapture(ev.pointerId);
  });
  const formaDe = (a, b) => (herr === 'circulo'
    ? { tipo: 'circulo', x1: a.x, y1: a.y, r: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(2), color, grosor }
    : { tipo: herr, x1: a.x, y1: a.y, x2: b.x, y2: b.y, color, grosor });
  capa.addEventListener('pointermove', (ev) => {
    if (!arrastre) return;
    const f = formaDe(arrastre.p, punto(ev));
    if (arrastre.previa) arrastre.previa.remove();
    arrastre.previa = dibujarForma(f, -1, true);
    capa.append(arrastre.previa);
  });
  const soltar = (ev) => {
    if (!arrastre) return;
    const a = arrastre; arrastre = null;
    if (a.previa) a.previa.remove();
    const b = punto(ev);
    const f = formaDe(a.p, b);
    const vacia = herr === 'circulo' ? !f.r : (f.x1 === f.x2 && f.y1 === f.y2) || (herr === 'rect' && (f.x1 === f.x2 || f.y1 === f.y2));
    if (vacia) return;
    pila.push(piezas.map((p) => ({ ...p })));
    piezas.push({ forma: f });
    cambio(false);
  };
  capa.addEventListener('pointerup', soltar);
  capa.addEventListener('pointercancel', () => { if (arrastre && arrastre.previa) arrastre.previa.remove(); arrastre = null; });

  pintarFondo(); pintar();
  return { codigo: () => escribirPiezas(piezas) };
}
