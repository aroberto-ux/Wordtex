// Punto único para generar el código del documento según su formato (LaTeX o Typst).
// Los call-sites (exportar, codigo, lista) usan esto en vez de llamar directamente a un generador.

import { generarTex } from './latex-gen.js?v=2026.11.07-o';
import { generarTypst } from './typst-gen.js?v=2026.11.07-o';

/** Formato de un documento (por defecto latex). */
export const formatoDe = (doc) => (doc && doc.cfg && doc.cfg.formato === 'typst' ? 'typst' : 'latex');

/** Genera el código del documento. Devuelve { tex, imagenes } (tex = LaTeX o Typst según el formato). */
export function generarCodigo(doc, bloques) {
  return formatoDe(doc) === 'typst' ? generarTypst(doc, bloques) : generarTex(doc, bloques);
}

/** Extensión de archivo para el formato. */
export const extensionDe = (doc) => (formatoDe(doc) === 'typst' ? 'typ' : 'tex');

/** Nombre legible del formato. */
export const nombreFormato = (doc) => (formatoDe(doc) === 'typst' ? 'Typst' : 'LaTeX');
