// Configuración de MathJax 3 (componente tex-chtml). Debe cargarse ANTES que MathJax: index.html la incluye primero.
//
// No usamos el «auto-render» sobre toda la página: el documento es un contenteditable y MathJax
// reescribiría el texto que escribe la persona. Los delimitadores se configuran igualmente (para
// que $…$, \(…\), $$…$$ y \[…\] se entiendan) y mathjax.js pide el trabajo por elemento con
// MathJax.typesetPromise([el]).
(function () {
  let resolver;
  /** Promesa global: true cuando MathJax está listo, false si no pudo cargarse (sin red, bloqueado…). */
  window.mathjaxListo = new Promise((r) => { resolver = r; });
  window.mathjaxFallo = () => resolver(false);

  window.MathJax = {
    loader: {
      // ams ya viene dentro de tex-chtml.js (basta con listarlo en `packages`); el resto se descarga aparte.
      load: ['[tex]/mathtools', '[tex]/color', '[tex]/cancel', '[tex]/boldsymbol', '[tex]/physics', '[tex]/mhchem', '[tex]/braket'],
    },
    tex: {
      packages: {
        '[+]': ['ams', 'mathtools', 'color', 'cancel', 'boldsymbol', 'physics', 'mhchem', 'braket'],
        // Sin «noundefined» un comando desconocido da error (<mjx-merror>) y el editor puede avisar,
        // igual que hacía KaTeX con .katex-error. Con él, MathJax lo pintaría en rojo sin avisar.
        '[-]': ['noundefined'],
      },
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
      processEscapes: true,
      processEnvironments: true,
      processRefs: false,
      tags: 'none', // la numeración de ecuaciones la pone numerar.js, no MathJax
      macros: {
        bm: ['{\\boldsymbol{#1}}', 1], // KaTeX lo traía; en LaTeX viene del paquete bm
        // aproximaciones de siunitx para las fórmulas (el PDF usa el paquete de verdad)
        SI: ['{#1\\,\\mathrm{#2}}', 2],
        si: ['\\mathrm{#1}', 1],
        num: ['{#1}', 1],
        ang: ['{#1^{\\circ}}', 1],
        unit: ['\\mathrm{#1}', 1],
        qty: ['{#1\\,\\mathrm{#2}}', 2],
        strut: '\\vphantom{\\mathstrut}',
        // nicefrac: fracción en línea (el PDF usa el paquete)
        nicefrac: ['{}^{#1}\\!/_{#2}', 2],
        // esint: integrales de superficie/volumen que AMS no trae
        oiint: '{\\unicode{x222F}}',
        oiiint: '{\\unicode{x2230}}',
        // upgreek: griegas rectas (aproximación con \mathrm sobre la griega normal)
        upmu: '{\\mathrm{\\mu}}',
        uppi: '{\\mathrm{\\pi}}',
        upomega: '{\\mathrm{\\omega}}',
        uptheta: '{\\mathrm{\\theta}}',
        upalpha: '{\\mathrm{\\alpha}}',
        upbeta: '{\\mathrm{\\beta}}',
        upgamma: '{\\mathrm{\\gamma}}',
        updelta: '{\\mathrm{\\delta}}',
        uplambda: '{\\mathrm{\\lambda}}',
        upsigma: '{\\mathrm{\\sigma}}',
      },
    },
    chtml: {
      displayAlign: 'center',
      matchFontHeight: true,
      adaptiveCSS: true,
    },
    options: {
      enableMenu: false, // sin menú contextual: el clic sobre una fórmula abre el editor
      ignoreHtmlClass: 'tex2jax_ignore',
      processHtmlClass: 'tex2jax_process',
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation', 'annotation-xml'],
    },
    startup: {
      typeset: false, // nada de composición automática al cargar
      pageReady() {
        return window.MathJax.startup.defaultPageReady().then(() => resolver(true));
      },
    },
  };
})();
