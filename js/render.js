// Renderizado de diagramas TikZ (TikZJax) y fórmulas LaTeX (MathJax).

// Crea un contenedor con <script type="text/tikz">. TikZJax detecta los
// scripts nuevos en el DOM y los reemplaza por el SVG compilado.
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

  const obs = new MutationObserver(() => {
    if (cont.querySelector('svg') || !script.isConnected) {
      aviso.remove();
      obs.disconnect();
    }
  });
  requestAnimationFrame(() => obs.observe(cont, { childList: true }));
  return cont;
}

function normalizarTikZ(codigo) {
  const c = codigo.trim();
  if (c.includes('\\begin{tikzpicture}')) return c;
  return `\\begin{tikzpicture}\n${c}\n\\end{tikzpicture}`;
}

let cola = Promise.resolve();
export function tipografiarMatematicas(scope) {
  if (!(window.MathJax && window.MathJax.typesetPromise)) return;
  cola = cola
    .then(() => window.MathJax.typesetPromise(scope ? [scope] : undefined))
    .catch((e) => console.warn('MathJax:', e));
}
