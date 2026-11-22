// Renderizado de diagramas TikZ (TikZJax) y fórmulas LaTeX (MathJax).
//
// TikZJax expone window.TikZJax(root): procesa los <script type="text/tikz">
// que existan dentro de `root` en ese momento (descarga el motor WASM la
// primera vez) y reemplaza cada script por el SVG. Con TikZJaxNoAutostart
// NO procesa nada solo; hay que invocarlo manualmente por cada diagrama.
// Además puede cargarse con `defer`, así que esperamos a que esté disponible.

// Espera (con sondeo) a que window.TikZJax esté cargado. Se resuelve a null
// si tras el tiempo límite no apareció (p. ej. sin conexión al CDN).
let esperaTikZ = null;
function tikzListo(timeoutMs = 20000) {
  if (window.TikZJax) return Promise.resolve(window.TikZJax);
  if (esperaTikZ) return esperaTikZ;
  esperaTikZ = new Promise((resolve) => {
    const inicio = Date.now();
    const id = setInterval(() => {
      if (window.TikZJax) { clearInterval(id); resolve(window.TikZJax); }
      else if (window.__tikzFallo || Date.now() - inicio > timeoutMs) { clearInterval(id); resolve(null); }
    }, 120);
  });
  return esperaTikZ;
}

// Serializa los renders: TikZJax reutiliza un único motor WASM y no admite
// compilaciones concurrentes, así que procesamos un diagrama a la vez.
let colaTikz = Promise.resolve();

export function crearDiagramaTikZ(codigo) {
  const cont = document.createElement('div');
  cont.className = 'problema-diagrama';

  const aviso = document.createElement('span');
  aviso.className = 'diagrama-cargando';
  aviso.textContent = 'Renderizando diagrama…';
  cont.appendChild(aviso);

  const script = document.createElement('script');
  script.setAttribute('type', 'text/tikz');
  script.textContent = normalizarTikZ(codigo);
  cont.appendChild(script);

  colaTikz = colaTikz.then(async () => {
    const TikZJax = await tikzListo();
    if (!TikZJax) {
      aviso.textContent = 'No se pudo cargar el motor de diagramas (sin conexión a tikzjax.com).';
      return;
    }
    if (!script.isConnected) { aviso.remove(); return; } // tarjeta ya quitada
    try {
      // TikZJax(root) procesa los <script type="text/tikz"> dentro de `root`,
      // pero por un detalle de la librería NO espera a terminar: lanza el
      // procesamiento y vuelve. Por eso esperamos nosotros a que aparezca el
      // SVG (o se agote el tiempo), en lugar de confiar en su promesa.
      await TikZJax(cont);
      const ok = await esperarSvg(cont, 90000);
      if (ok) aviso.remove();
      else aviso.textContent = 'El diagrama tardó demasiado o no se pudo renderizar.';
    } catch (e) {
      console.warn('TikZJax:', e);
      aviso.textContent = 'No se pudo renderizar el diagrama (revisa la sintaxis TikZ). Ver consola.';
    }
  });

  return cont;
}

// Espera a que TikZJax reemplace el <script> por un <svg> dentro de `cont`.
function esperarSvg(cont, timeoutMs) {
  return new Promise((resolve) => {
    if (cont.querySelector('svg')) return resolve(true);
    const inicio = Date.now();
    const id = setInterval(() => {
      if (cont.querySelector('svg')) { clearInterval(id); resolve(true); }
      else if (Date.now() - inicio > timeoutMs) { clearInterval(id); resolve(false); }
    }, 150);
  });
}

function normalizarTikZ(codigo) {
  const c = codigo.trim();
  if (c.includes('\\begin{tikzpicture}')) return c;
  return `\\begin{tikzpicture}\n${c}\n\\end{tikzpicture}`;
}

// MathJax v3 puede cargarse con `defer`: window.MathJax.typesetPromise no
// existe hasta que termina. Esperamos a que esté disponible (o se agota el
// tiempo) para no perder el tipografiado de los primeros renders.
let mathListo = null;
function esperarMathJax(timeoutMs = 20000) {
  if (window.MathJax && window.MathJax.typesetPromise) return Promise.resolve(window.MathJax);
  if (mathListo) return mathListo;
  mathListo = new Promise((resolve) => {
    const inicio = Date.now();
    const id = setInterval(() => {
      if (window.MathJax && window.MathJax.typesetPromise) { clearInterval(id); resolve(window.MathJax); }
      else if (window.__mathFallo || Date.now() - inicio > timeoutMs) { clearInterval(id); resolve(null); }
    }, 120);
  });
  return mathListo;
}

let colaMath = Promise.resolve();
export function tipografiarMatematicas(scope) {
  colaMath = colaMath
    .then(async () => {
      const MJ = await esperarMathJax();
      if (!MJ) return;
      return MJ.typesetPromise(scope ? [scope] : undefined);
    })
    .catch((e) => console.warn('MathJax:', e));
}
