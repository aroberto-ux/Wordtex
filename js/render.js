// Renderizado de diagramas y fórmulas.
//
// Los diagramas usan el intérprete TikZ local que ya incluía Wordtex. Genera
// SVG directamente en JavaScript: no depende de TikZJax, WebAssembly ni CDNs,
// y devuelve avisos para las instrucciones que aproxima o no reconoce.

import { tikzSvg } from '../old/tikz.js?v=2026.11.22-banco';

export function crearDiagramaTikZ(codigo) {
  const cont = document.createElement('div');
  cont.className = 'problema-diagrama';

  // Se difiere un fotograma para pintar primero el resto de la tarjeta.
  requestAnimationFrame(() => {
    if (!cont.isConnected) return;
    try {
      const { src, opc } = separarTikzpicture(codigo);
      const resultado = tikzSvg(src, { opc });
      cont.innerHTML = resultado.svg;

      if (resultado.avisos.length) {
        const detalles = document.createElement('details');
        detalles.className = 'diagrama-avisos';
        const resumen = document.createElement('summary');
        resumen.textContent = 'El diagrama se mostró con algunas aproximaciones';
        const lista = document.createElement('ul');
        for (const aviso of resultado.avisos) {
          const item = document.createElement('li');
          item.textContent = aviso;
          lista.appendChild(item);
        }
        detalles.append(resumen, lista);
        cont.appendChild(detalles);
      }
    } catch (e) {
      console.warn('Diagrama TikZ:', e);
      cont.replaceChildren();
      const error = document.createElement('p');
      error.className = 'diagrama-error';
      error.textContent = 'No se pudo dibujar el diagrama: ' + (e?.message || String(e));
      cont.appendChild(error);
    }
  });

  return cont;
}

// Acepta tanto el contenido interior recomendado por el prompt como un bloque
// completo \begin{tikzpicture}[opciones] ... \end{tikzpicture}. También quita
// \usetikzlibrary: el intérprete local no necesita cargar librerías externas.
function separarTikzpicture(codigo) {
  let texto = String(codigo || '').trim();
  texto = texto.replace(/\\usetikzlibrary\s*\{[^}]*\}/g, '').trim();

  const bloque = /\\begin\s*\{tikzpicture\}\s*(?:\[([^\]]*)\])?([\s\S]*?)\\end\s*\{tikzpicture\}/.exec(texto);
  if (bloque) return { src: bloque[2].trim(), opc: (bloque[1] || '').trim() };
  return { src: texto, opc: '' };
}

// MathJax carga con defer. Esperamos a typesetPromise para no perder las
// fórmulas del primer render; si el CDN falla, el texto LaTeX queda visible.
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
