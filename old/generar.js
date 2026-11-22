// Punto único para generar el código del documento según su formato (LaTeX o Typst).
// Los call-sites (exportar, codigo, lista) usan esto en vez de llamar directamente a un generador.

import { generarTex } from './latex-gen.js?v=2026.11.07-p';
import { generarTypst } from './typst-gen.js?v=2026.11.07-p';

/** Formato de un documento (por defecto latex). */
export const formatoDe = (doc) => (doc && doc.cfg && doc.cfg.formato === 'typst' ? 'typst' : 'latex');

/** Genera el código del documento. Devuelve { tex, imagenes } (tex = LaTeX o Typst según el formato). */
export function generarCodigo(doc, bloques) {
  return formatoDe(doc) === 'typst' ? generarTypst(doc, bloques) : generarTex(doc, bloques);
}

/**
 * Código efectivo del documento (lo que se compila/exporta/muestra), con sus imágenes.
 * En Typst, si hay código editado a mano (doc.codigoTypst) ESE es la fuente de verdad; si no, se genera
 * desde los bloques. En LaTeX siempre se genera desde los bloques. «Tiene código» = es un string
 * (incluido el vacío), igual que el criterio de persistencia del store (codigoTypst != null).
 */
export function codigoDe(doc, bloques) {
  if (formatoDe(doc) === 'typst' && doc && typeof doc.codigoTypst === 'string') {
    // Las imágenes se derivan igualmente de los bloques (para el aviso/zip); el texto manda el editado.
    const { imagenes } = generarTypst(doc, bloques);
    return { tex: doc.codigoTypst, imagenes };
  }
  return generarCodigo(doc, bloques);
}

/** Extensión de archivo para el formato. */
export const extensionDe = (doc) => (formatoDe(doc) === 'typst' ? 'typ' : 'tex');

/** Nombre legible del formato. */
export const nombreFormato = (doc) => (formatoDe(doc) === 'typst' ? 'Typst' : 'LaTeX');
