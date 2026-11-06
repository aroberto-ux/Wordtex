// Editor de un bloque TikZ: código con vista previa al lado, herramienta de dibujo, plantillas,
// ubicación (centrado / figura con pie / suelto), tamaño y librerías.

import { h, modal, confirmar, pedir } from './ui.js?v=2026.11.05-a';
import { dibujarTikz } from './vista-latex.js?v=2026.11.05-a';
import { libreriasNecesarias } from './tikz.js?v=2026.11.05-a';
import { crearHerramienta } from './tikz-dibujo.js?v=2026.11.05-a';
import { PLANTILLAS_TIKZ } from './tikz-plantillas.js?v=2026.11.05-a';

const UBICACIONES = [['center', 'Centrado (si le pones pie, pasa a ser figura)'], ['figure', 'Figura flotante (con número si tiene pie)'], ['', 'Suelto, tal cual en el texto']];
const TAMANOS = [[0, 'Tamaño natural'], [100, 'Todo el ancho'], [80, '80 % del ancho'], [60, '60 % del ancho'], [40, '40 % del ancho'], [25, '25 % del ancho']];

/**
 * @param {object} b  bloque tikz
 * @returns {Promise<null | { src, opc, libs, env, ancho }>}
 */
export function editarTikz(b, { nuevo = false } = {}) {
  return new Promise((res) => {
    const inicial = JSON.stringify({ src: b.src, opc: b.opc, libs: b.libs, env: b.env, ancho: b.ancho });
    const ta = h('textarea', { class: 'tikz-ta mono', spellcheck: 'false', 'aria-label': 'Código TikZ (lo que va dentro de tikzpicture)', wrap: 'off' });
    ta.value = b.src;
    const opc = h('input', { type: 'text', class: 'mono', value: b.opc || '', placeholder: 'ej. scale=1.5, thick', 'aria-label': 'Opciones de la imagen' });
    const libs = h('input', { type: 'text', class: 'mono', value: (b.libs || []).join(', '), placeholder: 'ej. positioning, calc', 'aria-label': 'Librerías de TikZ' });
    const auto = h('small', { class: 'ayuda' });
    const vista = h('div', { class: 'tikz-ed-vista' });
    const avisos = h('ul', { class: 'tikz-ed-avisos' });
    const env = h('select', { 'aria-label': 'Ubicación' }, UBICACIONES.map(([v, n]) => h('option', { value: v }, n)));
    env.value = b.env;
    const ancho = h('select', { 'aria-label': 'Tamaño' }, TAMANOS.map(([v, n]) => h('option', { value: String(v) }, n)));
    ancho.value = String(b.ancho || 0);
    const plantillas = h('select', { 'aria-label': 'Empezar desde una plantilla' }, h('option', { value: '' }, 'Plantillas…'), PLANTILLAS_TIKZ.map((p) => h('option', { value: p.id, title: p.desc }, p.nombre)));

    let t = null;
    const actualizar = () => {
      const lista = dibujarTikz(vista, ta.value, { opc: opc.value, ancho: +ancho.value });
      avisos.replaceChildren(...lista.map((a) => h('li', {}, a)));
      avisos.hidden = !lista.length;
      const det = libreriasNecesarias(ta.value).filter((l) => !leerLibs().includes(l));
      auto.textContent = det.length ? `Se añadirán solas al generar el .tex: ${det.join(', ')}` : 'Las que haga falta se añaden solas al generar el .tex.';
    };
    const programar = () => { clearTimeout(t); t = setTimeout(actualizar, 220); };
    const leerLibs = () => libs.value.split(',').map((x) => x.trim()).filter((x) => /^[\w.\- ]+$/.test(x));
    ta.addEventListener('input', programar);
    opc.addEventListener('input', programar);
    ancho.addEventListener('change', actualizar);
    libs.addEventListener('input', programar);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });

    plantillas.addEventListener('change', async () => {
      const p = PLANTILLAS_TIKZ.find((x) => x.id === plantillas.value);
      plantillas.value = '';
      if (!p) return;
      const vacio = !ta.value.trim() || (nuevo && ta.value === b.src);
      if (!vacio && !(await confirmar('El código actual se reemplazará por la plantilla.', 'Reemplazar', '¿Usar la plantilla?', false))) return;
      ta.value = p.src; opc.value = p.opc; libs.value = p.libs.join(', ');
      actualizar();
      if (pestana === 'dibujar') mostrar('dibujar');
    });

    // pestañas: código / dibujar
    const zonaCodigo = h('div', { class: 'tikz-ed-codigo' },
      h('div', { class: 'tikz-ed-col' }, h('div', { class: 'tikz-ed-et' }, 'Código TikZ'), ta,
        h('label', { class: 'campo' }, h('span', {}, 'Opciones de la imagen (\\begin{tikzpicture}[…])'), opc),
        h('label', { class: 'campo' }, h('span', {}, 'Librerías (\\usetikzlibrary)'), libs, auto)),
      h('div', { class: 'tikz-ed-col' }, h('div', { class: 'tikz-ed-et' }, 'Vista previa'), vista, avisos));
    const zonaDibujo = h('div', { class: 'tikz-ed-dibujo', hidden: true });
    let pestana = 'codigo', herramienta = null;
    const tabs = h('div', { class: 'paleta-tabs', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', 'data-p': 'codigo', onclick: () => mostrar('codigo') }, 'Código y vista previa'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-p': 'dibujar', onclick: () => mostrar('dibujar') }, 'Dibujar sin código'));
    function mostrar(p) {
      if (pestana === 'dibujar' && herramienta) ta.value = herramienta.codigo();
      pestana = p;
      tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.p === p)));
      zonaCodigo.hidden = p !== 'codigo'; zonaDibujo.hidden = p !== 'dibujar';
      if (p === 'dibujar') {
        herramienta = crearHerramienta(zonaDibujo, {
          src: ta.value, opc: opc.value,
          alCambiar: (src) => { ta.value = src; },
          pedirTexto: async () => { const r = await pedir({ titulo: 'Texto', etiqueta: 'Texto (para una fórmula escribe $…$)', ok: 'Poner' }); return r ? r.valor : null; },
        });
      } else { herramienta = null; actualizar(); }
    }

    const cuerpo = h('div', { class: 'tikz-ed' },
      h('div', { class: 'tikz-ed-barra' }, plantillas, h('label', {}, 'Ubicación ', env), h('label', {}, 'Tamaño ', ancho)),
      tabs, zonaCodigo, zonaDibujo);
    const valor = () => ({
      src: (pestana === 'dibujar' && herramienta ? herramienta.codigo() : ta.value).replace(/\s+$/, ''),
      opc: opc.value.trim().replace(/^\[|\]$/g, ''), libs: leerLibs(), env: env.value, ancho: +ancho.value,
    });
    modal({
      titulo: nuevo ? 'Nuevo dibujo' : 'Editar dibujo', ancho: 1040, clase: 'modal-tikz', cuerpo,
      acciones: [
        { texto: 'Cancelar', fn: (c) => c(null) },
        { texto: nuevo ? 'Insertar' : 'Aceptar', primario: true, fn: (c) => c(true) },
      ],
      cerrarFuera: false,
      antesDeCerrar: () => (JSON.stringify(valor()) === inicial ? true : confirmar('Se perderán los cambios del dibujo.', 'Descartar', '¿Cerrar sin guardar?')),
      alCerrar: (v) => res(v === true ? valor() : null),
    });
    actualizar();
    setTimeout(() => ta.focus(), 40);
  });
}
