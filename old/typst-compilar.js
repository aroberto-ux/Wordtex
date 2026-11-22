// Compilación de Typst a PDF en el navegador, con typst.ts (WebAssembly). No necesita servidor: todo
// ocurre en el cliente. El compilador WASM (~12 MB con sus fuentes) se descarga de un CDN la primera
// vez que se compila y queda en caché del navegador; por eso la carga es perezosa.

const CDN = 'https://cdn.jsdelivr.net/npm';
const SNIPPET = `${CDN}/@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs`;
const WASM_COMPILER = `${CDN}/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm`;
const WASM_RENDERER = `${CDN}/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm`;

let cargando = null;

/** Carga (una sola vez) el motor de Typst y devuelve el objeto $typst listo para compilar. */
function cargarTypst() {
  if (cargando) return cargando;
  cargando = import(/* @vite-ignore */ SNIPPET).then((mod) => {
    const $typst = mod.$typst;
    $typst.setCompilerInitOptions({ getModule: () => WASM_COMPILER });
    $typst.setRendererInitOptions({ getModule: () => WASM_RENDERER });
    return $typst;
  }).catch((e) => { cargando = null; throw e; });
  return cargando;
}

/**
 * Compila código Typst a PDF.
 * @param {string} codigo  documento Typst (main)
 * @returns {Promise<Uint8Array>} bytes del PDF
 */
export async function compilarTypstAPdf(codigo) {
  const $typst = await cargarTypst();
  return $typst.pdf({ mainContent: codigo });
}
