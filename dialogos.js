// Diálogos pequeños para insertar notas, citas, referencias, enlaces y símbolos.

import { h, modal } from './ui.js?v=2026.11.04-a';

function simple({ titulo, cuerpo, ok = 'Aceptar', ancho = 460, valor, extraAcc = [] }) {
  return new Promise((res) => {
    modal({
      titulo, cuerpo, ancho,
      acciones: [...extraAcc, { texto: 'Cancelar', fn: (c) => c(null) }, { texto: ok, primario: true, fn: (c) => c(true) }],
      alCerrar: (v) => res(v === true ? valor() : (typeof v === 'object' && v ? v : null)),
    });
  });
}

export function dlgNota(texto = '') {
  const ta = h('textarea', { rows: 4, 'aria-label': 'Texto de la nota', placeholder: 'Texto de la nota al pie…' });
  ta.value = texto;
  setTimeout(() => ta.focus(), 40);
  return simple({ titulo: 'Nota al pie', cuerpo: h('label', { class: 'campo' }, h('span', {}, 'Aparecerá al final de la página'), ta), valor: () => (ta.value.trim() ? ta.value.trim() : null) });
}

export function dlgEnlace({ url = '', texto = '' } = {}, haySeleccion = false) {
  const u = h('input', { type: 'url', value: url, placeholder: 'https://…', 'aria-label': 'Dirección' });
  const t = h('input', { type: 'text', value: texto, placeholder: 'Texto que se verá', 'aria-label': 'Texto' });
  setTimeout(() => u.focus(), 40);
  return simple({
    titulo: 'Enlace', cuerpo: [h('label', { class: 'campo' }, h('span', {}, 'Dirección'), u), haySeleccion ? null : h('label', { class: 'campo' }, h('span', {}, 'Texto'), t)],
    valor: () => {
      let v = u.value.trim();
      if (!v) return null;
      if (!/^(https?:|mailto:)/i.test(v)) v = 'https://' + v;
      return { url: v, texto: t.value.trim() };
    },
  });
}

export function dlgCita(biblio, actual = '') {
  const marcadas = new Set(String(actual).split(',').map((x) => x.trim()).filter(Boolean));
  const checks = biblio.map((b) => {
    const c = h('input', { type: 'checkbox', value: b.key, checked: marcadas.has(b.key) });
    return h('label', { class: 'item-check' }, c, h('span', {}, h('b', {}, b.key), ' ', b.texto.slice(0, 120)));
  });
  const vacio = h('p', { class: 'vacio-panel' }, 'Todavía no hay referencias. Añade una abajo (o en el panel «Bibliografía»).');
  const key = h('input', { type: 'text', maxlength: 40, placeholder: 'clave corta, ej. knuth84', 'aria-label': 'Clave' });
  const texto = h('input', { type: 'text', maxlength: 600, placeholder: 'Autor, título, editorial, año', 'aria-label': 'Referencia completa' });
  return new Promise((res) => {
    modal({
      titulo: 'Citar una referencia', ancho: 520,
      cuerpo: h('div', {}, biblio.length ? h('div', { class: 'lista-check' }, checks) : vacio,
        h('details', { class: 'nueva-ref', open: !biblio.length }, h('summary', {}, 'Añadir una referencia nueva'),
          h('label', { class: 'campo' }, h('span', {}, 'Clave'), key), h('label', { class: 'campo' }, h('span', {}, 'Referencia'), texto))),
      acciones: [{ texto: 'Cancelar', fn: (c) => c(null) }, { texto: 'Insertar cita', primario: true, fn: (c) => c(true) }],
      alCerrar: (v) => {
        if (v !== true) return res(null);
        const claves = checks.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
        let nueva = null;
        const k = key.value.replace(/[^\w:.-]/g, '');
        if (k && texto.value.trim()) { nueva = { key: k, texto: texto.value.trim() }; claves.push(k); }
        res(claves.length ? { claves: claves.join(','), nueva } : null);
      },
    });
  });
}

/** `candidatos`: [{ id, tipo, num, texto, label }] de secciones, ecuaciones, figuras y tablas. */
export function dlgRef(candidatos, actual = '') {
  let elegido = candidatos.find((c) => c.label && c.label === actual) || null;
  const lista = h('div', { class: 'lista-radio', role: 'listbox' }, candidatos.map((c) => {
    const b = h('button', { type: 'button', role: 'option', class: 'item-radio', onclick: () => { elegido = c; lista.querySelectorAll('.item-radio').forEach((x) => x.setAttribute('aria-selected', String(x === b))); } },
      h('b', {}, `${c.tipo} ${c.num || ''}`), ' ', c.texto || '(sin texto)');
    b.setAttribute('aria-selected', String(elegido === c));
    return b;
  }));
  return new Promise((res) => {
    modal({
      titulo: 'Referencia cruzada', ancho: 520,
      cuerpo: h('div', {}, h('p', { class: 'vacio-panel' }, 'Se insertará el número de la sección, ecuación, figura o tabla elegida, y se actualizará solo si cambia.'),
        candidatos.length ? lista : h('p', { class: 'vacio-panel' }, 'Aún no hay nada a lo que referirse: añade una sección, ecuación, figura o tabla.')),
      acciones: [{ texto: 'Cancelar', fn: (c) => c(null) }, { texto: 'Insertar', primario: true, fn: (c) => c(true) }],
      alCerrar: (v) => res(v === true ? elegido : null),
    });
  });
}

export function dlgRaw(raw = '') {
  const ta = h('textarea', { rows: 3, class: 'mono', spellcheck: 'false', 'aria-label': 'Código LaTeX' });
  ta.value = raw;
  setTimeout(() => ta.focus(), 40);
  return simple({ titulo: 'LaTeX dentro del texto', cuerpo: [h('p', { class: 'vacio-panel' }, 'Código LaTeX que no tiene botón propio. Se copia tal cual al documento.'), ta], valor: () => ta.value.trim() || null });
}

const SIMBOLOS = '± × ÷ ≤ ≥ ≠ ≈ ∞ ° · − √ ∑ ∫ ∈ ∀ ∃ → ← ⇒ α β γ δ ε θ λ μ π ρ σ τ φ ω Δ Σ Ω § ¶ © « » ¿ ¡ …'.split(' ');
export function dlgSimbolo() {
  return new Promise((res) => {
    const m = modal({
      titulo: 'Insertar símbolo', ancho: 440,
      cuerpo: h('div', { class: 'simbolos' }, SIMBOLOS.map((s) => h('button', { type: 'button', class: 'sim', onclick: () => { res(s); m.cerrar(true); } }, s))),
      acciones: [{ texto: 'Cerrar', fn: (c) => c(null) }],
      alCerrar: () => res(null),
    });
  });
}
