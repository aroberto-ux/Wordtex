// Editor de fórmulas: se escribe o se arma con una paleta de símbolos y se ve al instante.
// El «‸» de cada plantilla marca dónde queda el cursor (no se usa «|» porque es un símbolo real: |x|, ‖x‖).
const CURSOR = '‸';

import { h, modal } from './ui.js?v=2026.11.04-c';
import { renderMate } from './inline-dom.js?v=2026.11.04-c';

const G = (...l) => l.map((x) => [x[0], x[1] || x[0]]);
const griegas = [
  ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'], ['ε', '\\varepsilon'], ['ζ', '\\zeta'], ['η', '\\eta'], ['θ', '\\theta'], ['ι', '\\iota'], ['κ', '\\kappa'],
  ['λ', '\\lambda'], ['μ', '\\mu'], ['ν', '\\nu'], ['ξ', '\\xi'], ['π', '\\pi'], ['ρ', '\\rho'], ['σ', '\\sigma'], ['τ', '\\tau'], ['φ', '\\varphi'], ['χ', '\\chi'], ['ψ', '\\psi'], ['ω', '\\omega'],
  ['Γ', '\\Gamma'], ['Δ', '\\Delta'], ['Θ', '\\Theta'], ['Λ', '\\Lambda'], ['Ξ', '\\Xi'], ['Π', '\\Pi'], ['Σ', '\\Sigma'], ['Φ', '\\Phi'], ['Ψ', '\\Psi'], ['Ω', '\\Omega'],
];

export const PALETA = [
  ['Básico', [
    ['a⁄b', '\\frac{‸}{}', 'Fracción'], ['√', '\\sqrt{‸}', 'Raíz cuadrada'], ['ⁿ√', '\\sqrt[n]{‸}', 'Raíz n-ésima'], ['xⁿ', '^{‸}', 'Potencia'], ['xₙ', '_{‸}', 'Subíndice'],
    ['Σ', '\\sum_{i=1}^{n} ‸', 'Sumatoria'], ['∏', '\\prod_{i=1}^{n} ‸', 'Productoria'], ['∫', '\\int_{a}^{b} ‸ \\, dx', 'Integral'], ['∮', '\\oint ‸', 'Integral de línea'], ['lim', '\\lim_{x \\to ‸}', 'Límite'],
    ['(  )', '\\left( ‸ \\right)', 'Paréntesis que se ajustan'], ['[  ]', '\\left[ ‸ \\right]', 'Corchetes'], ['|x|', '\\left| ‸ \\right|', 'Valor absoluto'], ['‖x‖', '\\left\\| ‸ \\right\\|', 'Norma'],
    ['(n k)', '\\binom{n}{‸}', 'Combinatoria'], ['∂', '\\frac{\\partial ‸}{\\partial x}', 'Derivada parcial'], ['d/dx', '\\frac{d‸}{dx}', 'Derivada'],
    ['Matriz', '\\begin{pmatrix} ‸ & \\\\ & \\end{pmatrix}', 'Matriz 2×2'], ['Sistema', '\\begin{cases} ‸ & \\text{si } \\\\ & \\text{si } \\end{cases}', 'Definición por casos'],
  ]],
  ['Griegas', griegas],
  ['Operadores', G(['±', '\\pm'], ['∓', '\\mp'], ['×', '\\times'], ['÷', '\\div'], ['·', '\\cdot'], ['∘', '\\circ'], ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['≈', '\\approx'], ['≡', '\\equiv'], ['∼', '\\sim'], ['∝', '\\propto'],
    ['∈', '\\in'], ['∉', '\\notin'], ['⊂', '\\subset'], ['⊆', '\\subseteq'], ['∪', '\\cup'], ['∩', '\\cap'], ['∅', '\\emptyset'], ['∀', '\\forall'], ['∃', '\\exists'], ['¬', '\\neg'], ['∧', '\\wedge'], ['∨', '\\vee'],
    ['∞', '\\infty'], ['∇', '\\nabla'], ['∂', '\\partial'], ['…', '\\ldots'], ['⋯', '\\cdots'], ['⋮', '\\vdots'], ['′', "'"], ['°', '^{\\circ}'])],
  ['Flechas', G(['→', '\\to'], ['←', '\\leftarrow'], ['↔', '\\leftrightarrow'], ['⇒', '\\Rightarrow'], ['⇐', '\\Leftarrow'], ['⇔', '\\Leftrightarrow'], ['↦', '\\mapsto'], ['↑', '\\uparrow'], ['↓', '\\downarrow'])],
  ['Funciones', G(['sen', '\\sin'], ['cos', '\\cos'], ['tan', '\\tan'], ['ln', '\\ln'], ['log', '\\log'], ['exp', '\\exp'], ['máx', '\\max'], ['mín', '\\min'], ['det', '\\det'], ['mcd', '\\gcd'], ['arcsen', '\\arcsin'], ['senh', '\\sinh'])],
  ['Estilos', [
    ['ℝ', '\\mathbb{R}', 'Reales'], ['ℕ', '\\mathbb{N}'], ['ℤ', '\\mathbb{Z}'], ['ℚ', '\\mathbb{Q}'], ['ℂ', '\\mathbb{C}'], ['𝐱', '\\mathbf{‸}', 'Negrita'], ['x⃗', '\\vec{‸}', 'Vector'], ['x̂', '\\hat{‸}'], ['x̄', '\\bar{‸}'],
    ['x̄̄', '\\overline{‸}', 'Barra larga'], ['ẋ', '\\dot{‸}'], ['texto', '\\text{‸}', 'Texto normal dentro de la fórmula'], ['𝒜', '\\mathcal{‸}'],
  ]],
];

const EJEMPLOS = [
  ['Fórmula cuadrática', 'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}'],
  ['Teorema de Pitágoras', 'a^{2} + b^{2} = c^{2}'],
  ['Identidad de Euler', 'e^{i\\pi} + 1 = 0'],
  ['Integral definida', '\\int_{0}^{1} x^{2} \\, dx = \\frac{1}{3}'],
  ['Serie de Basilea', '\\sum_{n=1}^{\\infty} \\frac{1}{n^{2}} = \\frac{\\pi^{2}}{6}'],
  ['Sistema alineado', 'a &= b + c \\\\ d &= e + f'],
];

function insertar(ta, snippet) {
  const a = ta.selectionStart, b = ta.selectionEnd;
  const sel = ta.value.slice(a, b);
  const i = snippet.indexOf(CURSOR);
  let txt = snippet, cursor = a + snippet.length;
  if (i >= 0) {
    txt = snippet.slice(0, i) + sel + snippet.slice(i + 1);
    cursor = a + i + sel.length;
    if (sel) cursor = a + txt.length;
  }
  ta.setRangeText(txt, a, b, 'end');
  ta.setSelectionRange(cursor, cursor);
  ta.focus();
  ta.dispatchEvent(new Event('input'));
}

/**
 * @param {object} o
 * @param {string} o.tex
 * @param {string} o.titulo
 * @param {boolean} [o.bloque]   true = ecuación en su propia línea (permite entorno, numeración y etiqueta)
 * @param {{env:string,num:boolean,label:string}} [o.opc]
 * @returns {Promise<null | {tex, env?, num?, label?}>}
 */
export function editarMate({ tex = '', titulo = 'Fórmula', bloque = false, opc = { env: 'equation', num: false, label: '' } }) {
  return new Promise((res) => {
    const ta = h('textarea', { class: 'mate-ta', rows: bloque ? 5 : 3, spellcheck: 'false', 'aria-label': 'Código de la fórmula', placeholder: 'Escribe la fórmula o usa los botones de arriba…' });
    ta.value = tex;
    const vista = h('div', { class: 'mate-vista', 'aria-live': 'polite' });
    const aviso = h('div', { class: 'mate-aviso' });
    const env = h('select', { 'aria-label': 'Tipo de ecuación' },
      h('option', { value: 'equation' }, 'Una línea'), h('option', { value: 'align' }, 'Varias líneas alineadas (usa & y \\\\)'), h('option', { value: 'gather' }, 'Varias líneas centradas (usa \\\\)'));
    env.value = opc.env;
    const num = h('input', { type: 'checkbox', checked: !!opc.num });
    const label = h('input', { type: 'text', value: opc.label || '', maxlength: 40, placeholder: 'ej. eq:energia', 'aria-label': 'Etiqueta para referencias' });
    const pintar = () => {
      let t = ta.value;
      const multi = bloque && env.value !== 'equation';
      if (multi) t = `\\begin{aligned}${t}\\end{aligned}`;
      renderMate(vista, t, bloque);
      vista.classList.toggle('vacia', !ta.value.trim());
      const err = vista.querySelector('.katex-error');
      aviso.textContent = err ? 'Hay algo que LaTeX no entenderá (revisa llaves y comandos).' : '';
    };
    ta.addEventListener('input', pintar);
    env.addEventListener('change', pintar);

    const pestanas = h('div', { class: 'paleta-tabs', role: 'tablist' });
    const cuerpo = h('div', { class: 'paleta-cuerpo' });
    const mostrar = (k) => {
      pestanas.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === k)));
      cuerpo.replaceChildren(...PALETA[k][1].map(([etq, snip, tip]) => h('button', {
        type: 'button', class: 'sim', title: tip || snip.replace(CURSOR, ''), style: etq.length > 3 ? { gridColumn: 'span 2' } : null,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => insertar(ta, snip),
      }, etq)));
    };
    PALETA.forEach(([n], k) => pestanas.append(h('button', { type: 'button', role: 'tab', onclick: () => mostrar(k) }, n)));
    mostrar(0);

    const ejemplos = h('select', { 'aria-label': 'Insertar un ejemplo', onchange: (e) => {
      const i = +e.target.value; e.target.value = '';
      if (i >= 0 && EJEMPLOS[i]) { ta.value = EJEMPLOS[i][1]; if (bloque && EJEMPLOS[i][1].includes('&')) env.value = 'align'; pintar(); ta.focus(); }
    } }, h('option', { value: '' }, 'Ejemplos…'), EJEMPLOS.map(([n], i) => h('option', { value: i }, n)));

    const opcBloque = bloque ? h('div', { class: 'mate-opc' },
      h('label', {}, 'Formato ', env),
      h('label', { class: 'fila' }, num, ' Numerar'),
      h('label', {}, 'Etiqueta ', label)) : null;

    const cuerpoModal = h('div', { class: 'mate' }, pestanas, cuerpo, h('div', { class: 'mate-fila' }, ejemplos), ta, aviso,
      h('div', { class: 'mate-vista-et' }, 'Vista previa'), vista, opcBloque);
    pintar();
    modal({
      titulo, ancho: 640, clase: 'modal-mate', cuerpo: cuerpoModal,
      acciones: [
        { texto: 'Cancelar', fn: (c) => c(null) },
        { texto: 'Aceptar', primario: true, fn: (c) => c(true) },
      ],
      alCerrar: (v) => {
        if (v !== true) return res(null);
        const out = { tex: ta.value.trim() };
        if (bloque) { out.env = env.value; out.num = num.checked; out.label = label.value.replace(/[^\w:.-]/g, ''); }
        res(out);
      },
    });
    setTimeout(() => ta.focus(), 40);
  });
}
