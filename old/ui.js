// Utilidades de interfaz: crear nodos, avisos, diálogos y menús.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'draggable']);

export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ── Avisos ──────────────────────────────────────────────────────────────

export function aviso(texto, tipo = 'info', ms = 3200) {
  const cont = $('#toasts');
  if (!cont) return () => {};
  const t = h('div', { class: `toast ${tipo}`, role: 'status' }, texto);
  cont.append(t);
  let quitado = false;
  const quitar = () => { if (quitado) return; quitado = true; t.classList.add('sale'); setTimeout(() => t.remove(), 250); };
  const temp = setTimeout(quitar, ms);
  // Devuelve una función para cerrarlo antes de tiempo (p. ej. un «Compilando…» al llegar el resultado).
  return () => { clearTimeout(temp); quitar(); };
}

// ── Diálogos ────────────────────────────────────────────────────────────

let modalesAbiertos = 0;
const pilaModales = []; // el de arriba es el único que responde a Esc
export const hayModal = () => modalesAbiertos > 0;

export function modal({ titulo, cuerpo, acciones = [], ancho = 420, alCerrar, clase = '', cerrarFuera = true, antesDeCerrar = null }) {
  const fondo = h('div', { class: 'modal-fondo' });
  const caja = h('div', { class: ('modal ' + clase).trim(), role: 'dialog', 'aria-modal': 'true', style: { maxWidth: ancho + 'px' } },
    h('h2', {}, titulo), h('div', { class: 'modal-cuerpo' }, cuerpo),
    h('div', { class: 'modal-acciones' }, acciones.map((a) => h('button', {
      class: a.primario ? 'btn primario' : a.peligro ? 'btn peligro' : 'btn',
      onclick: () => a.fn(cerrar),
    }, a.texto))));
  fondo.append(caja);
  modalesAbiertos++;
  const yo = {};
  pilaModales.push(yo);
  let cerrado = false;
  let consultando = false;
  function cerrar(valor) {
    if (cerrado || consultando) return;
    // Cerrar sin elegir (Esc, clic fuera) puede requerir confirmación si hay cambios sin guardar.
    if (valor === null && antesDeCerrar) {
      consultando = true;
      Promise.resolve(antesDeCerrar()).then((ok) => { consultando = false; if (ok) cerrar(valor); });
      return;
    }
    cerrado = true; modalesAbiertos--;
    pilaModales.splice(pilaModales.indexOf(yo), 1);
    fondo.remove(); document.removeEventListener('keydown', tecla, true);
    if (alCerrar) alCerrar(valor);
  }
  function tecla(e) {
    if (e.key === 'Escape' && pilaModales[pilaModales.length - 1] === yo) { e.stopPropagation(); cerrar(null); }
  }
  fondo.addEventListener('pointerdown', (e) => { if (cerrarFuera && e.target === fondo) cerrar(null); });
  document.addEventListener('keydown', tecla, true);
  document.body.append(fondo);
  return { cerrar, caja };
}

export function pedir({ titulo, etiqueta, valor = '', ok = 'Aceptar', extra = null }) {
  return new Promise((res) => {
    const input = h('input', { type: 'text', value: valor, maxlength: 120, 'aria-label': etiqueta });
    const enviar = (cerrar) => { const v = input.value.trim(); if (v) { res({ valor: v, extra }); cerrar(true); } };
    const m = modal({
      titulo,
      cuerpo: [h('label', { class: 'campo' }, h('span', {}, etiqueta), input), extra && extra.nodo].filter(Boolean),
      acciones: [
        { texto: 'Cancelar', fn: (c) => c(null) },
        { texto: ok, primario: true, fn: enviar },
      ],
      alCerrar: (v) => { if (!v) res(null); },
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(m.cerrar); });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

export function confirmar(texto, ok = 'Eliminar', titulo = '¿Seguro?', peligro = true) {
  return new Promise((res) => {
    modal({
      titulo, cuerpo: h('p', {}, texto),
      acciones: [
        { texto: 'Cancelar', fn: (c) => c(false) },
        { texto: ok, peligro, primario: !peligro, fn: (c) => c(true) },
      ],
      alCerrar: (v) => res(v === true),
    });
  });
}

// ── Menús desplegables ──────────────────────────────────────────────────

let menuAbierto = null;
export function cerrarMenu() {
  if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; }
}

export function abrirMenu(ancla, items, { alineado = 'izq' } = {}) {
  cerrarMenu();
  const m = h('div', { class: 'menu', role: 'menu' }, items.map((it) => {
    if (it === '-') return h('hr');
    return h('button', {
      class: 'menu-item' + (it.peligro ? ' peligro' : ''), role: 'menuitem', disabled: !!it.deshabilitado,
      onclick: () => { cerrarMenu(); it.fn(); },
    }, it.icono ? h('span', { class: 'menu-ico' }, it.icono) : null, it.texto);
  }));
  document.body.append(m);
  const r = ancla.getBoundingClientRect();
  const w = m.offsetWidth;
  let x = alineado === 'der' ? r.right - w : r.left;
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  const abajo = innerHeight - r.bottom - 12, arriba = r.top - 12;
  let y = r.bottom + 4;
  if (m.offsetHeight > abajo) {
    if (arriba > abajo) { m.style.maxHeight = Math.max(160, arriba) + 'px'; y = Math.max(8, r.top - Math.min(m.offsetHeight, arriba) - 4); }
    else m.style.maxHeight = Math.max(160, abajo) + 'px';
  }
  m.style.left = x + 'px';
  m.style.top = y + 'px';
  menuAbierto = m;
  setTimeout(() => {
    const fuera = (e) => {
      if (!m.contains(e.target)) { cerrarMenu(); document.removeEventListener('pointerdown', fuera, true); }
    };
    document.addEventListener('pointerdown', fuera, true);
  }, 0);
  return m;
}

// ── Varios ──────────────────────────────────────────────────────────────

export function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function nombreArchivo(t) {
  return (t || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'documento';
}

export function hace(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.round(s / 86400)} d`;
  return new Date(ms).toLocaleDateString('es');
}

export function copiarTexto(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  const ta = h('textarea', { value: t, style: { position: 'fixed', opacity: 0 } });
  document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  return Promise.resolve();
}

export function iniciales(n) {
  const p = String(n || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
