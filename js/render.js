// Renderizado de diagramas y fórmulas.
//
// Los diagramas usan el intérprete TikZ local que ya incluía Wordtex. Genera
// SVG directamente en JavaScript: no depende de TikZJax, WebAssembly ni CDNs,
// y devuelve avisos para las instrucciones que aproxima o no reconoce.

import { tikzSvg } from '../old/tikz.js?v=2026.11.22-banco';

// ── Adaptación al tema claro/oscuro ──────────────────────────────────────
// Antes los diagramas se invertían con un filtro CSS en modo oscuro, lo que
// alteraba cualquier color con significado. Ahora:
//   · Si el diagrama es solo de tonos neutros (negro, blanco, grises), se
//     reasigna a los colores del tema: el negro pasa a `currentColor`, el
//     blanco al color de fondo y los grises se mezclan entre ambos.
//   · Si usa algún color real (rojo, azul…), NO se toca ningún color y en modo
//     oscuro se muestra sobre un panel claro, de modo que se vea tal como se
//     dibujó.
const esHex6 = /#([0-9a-f]{6})\b/gi;

export function tieneColor(svg) {
  for (const m of svg.matchAll(esHex6)) {
    const n = parseInt(m[1], 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 12) return true;
  }
  return false;
}

// Devuelve { valor, estilo } para un gris/negro/blanco. `prop` = fill | stroke | color.
function neutro(hex, prop) {
  const v = parseInt(hex.slice(0, 2), 16);
  if (v <= 8) return { valor: 'currentColor', estilo: '' };
  if (v >= 247) return { valor: '#' + hex, estilo: prop + ':var(--surface)' };
  const pct = Math.round((1 - v / 255) * 100);
  return { valor: '#' + hex, estilo: prop + ':color-mix(in srgb,var(--text) ' + pct + '%,var(--surface))' };
}

function adaptarEtiqueta(tag) {
  const estilos = [];
  let t = tag.replace(/\b(fill|stroke)="#([0-9a-f]{6})"/gi, (m, attr, hex) => {
    const r = neutro(hex.toLowerCase(), attr.toLowerCase());
    if (r.estilo) estilos.push(r.estilo);
    return attr + '="' + r.valor + '"';
  });
  if (estilos.length) {
    if (/\sstyle="/.test(t)) t = t.replace(/\sstyle="/, ' style="' + estilos.join(';') + ';');
    else t = t.replace(/(\/?>)$/, ' style="' + estilos.join(';') + '"$1');
  }
  return t;
}

export function adaptarSvg(svg) {
  if (tieneColor(svg)) return { svg, conColor: true };
  let out = svg.replace(/<(?:path|circle|ellipse|rect|line|polygon|polyline)\b[^>]*>/g, adaptarEtiqueta);
  // Texto de los nodos (divs dentro de foreignObject): color:#xxxxxx
  out = out.replace(/color:#([0-9a-f]{6})/gi, (m, hex) => {
    const r = neutro(hex.toLowerCase(), 'color');
    return r.estilo ? r.estilo : 'color:currentColor';
  });
  return { svg: out, conColor: false };
}

export function crearDiagramaTikZ(codigo) {
  const cont = document.createElement('div');
  cont.className = 'problema-diagrama';
  const lienzo = document.createElement('div');
  lienzo.className = 'tikz-lienzo';
  cont.appendChild(lienzo);

  // Se difiere un fotograma para pintar primero el resto de la tarjeta.
  requestAnimationFrame(() => {
    if (!cont.isConnected) return;
    try {
      const { src, opc } = separarTikzpicture(codigo);
      const resultado = tikzSvg(src, { opc });
      const adaptado = adaptarSvg(resultado.svg);
      lienzo.innerHTML = adaptado.svg;
      lienzo.dataset.colores = adaptado.conColor ? 'si' : 'no';

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
      lienzo.replaceChildren();
      const error = document.createElement('p');
      error.className = 'diagrama-error';
      error.textContent = 'No se pudo dibujar el diagrama: ' + (e?.message || String(e));
      lienzo.appendChild(error);
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
