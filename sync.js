// Sincronización entre una lista de bloques "vieja" (la guardada) y una "nueva" (la que sale de leer
// el código LaTeX o de pegar contenido): calcula el mínimo de cambios para que quienes editan a la vez
// no pisen todo el documento. Funciones puras (se prueban en Node).

import { nuevoId } from './modelo.js?v=2026.11.07-m';
import { archivoDe } from './latex-gen.js?v=2026.11.07-m';

export const firma = (b) => { const { id, orden, ...r } = b; return JSON.stringify(r); };

/** Valor de `orden` entre dos vecinos (null = extremo). */
export function ordenEntre(a, b) {
  if (a == null && b == null) return 1000;
  if (a == null) return b - 1000;
  if (b == null) return a + 1000;
  return (a + b) / 2;
}

/** Reasigna `orden` si los valores se han vuelto demasiado juntos o repetidos. */
export function necesitaReindexar(bloques) {
  for (let i = 1; i < bloques.length; i++) if (!(bloques[i].orden - bloques[i - 1].orden > 1e-6)) return true;
  return false;
}

/** Las imágenes se guardan dentro del bloque; el código LaTeX solo sabe el nombre del archivo. */
export function conservarImagenes(viejos, nuevos) {
  // mismo nombre de archivo que escribe latex-gen.js en \includegraphics (puede llevar «-2», «-3»…)
  const porNombre = new Map();
  const imagenes = [];
  for (const b of viejos) if (b.t === 'fig' && b.src) porNombre.set(archivoDe(b, imagenes), b.src);
  return nuevos.map((b) => (b.t === 'fig' && !b.src && porNombre.has(b.nombre) ? { ...b, src: porNombre.get(b.nombre) } : b));
}

/**
 * @param {Array} viejos  bloques guardados [{id, orden, …}]
 * @param {Array} nuevos  bloques deseados (sin id o con id ajeno)
 * @returns {{ crear: Array<{id, orden, bloque}>, actualizar: Array<{id, bloque}>, eliminar: string[], final: Array }}
 */
export function diffBloques(viejos, nuevos) {
  nuevos = conservarImagenes(viejos, nuevos);
  const sv = viejos.map(firma), sn = nuevos.map(firma);
  const n = sv.length, m = sn.length;
  // LCS por firmas
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = sv[i] === sn[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const par = []; // [i, j] iguales
  for (let i = 0, j = 0; i < n && j < m;) {
    if (sv[i] === sn[j]) { par.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const asignado = new Array(m).fill(null); // id viejo reutilizado
  const usadoV = new Set();
  const actualizar = [];
  for (const [i, j] of par) { asignado[j] = viejos[i].id; usadoV.add(i); }
  // huecos entre coincidencias: emparejar por tipo (cola FIFO por tipo, conserva el orden relativo).
  // No se usa un cursor monótono: así un bloque viejo reordenado dentro del hueco no se salta ni se
  // elimina mientras exista otro nuevo de su mismo tipo que pueda heredar su identidad.
  const limites = [[-1, -1], ...par, [n, m]];
  for (let k = 0; k < limites.length - 1; k++) {
    const [i0, j0] = limites[k], [i1, j1] = limites[k + 1];
    const colas = new Map(); // tipo -> índices viejos disponibles, en orden
    for (let i = i0 + 1; i < i1; i++) { const t = viejos[i].t; if (!colas.has(t)) colas.set(t, []); colas.get(t).push(i); }
    for (let j = j0 + 1; j < j1; j++) {
      const cola = colas.get(nuevos[j].t);
      if (cola && cola.length) {
        const q = cola.shift();
        asignado[j] = viejos[q].id; usadoV.add(q); actualizar.push({ id: viejos[q].id, bloque: nuevos[j] });
      }
    }
  }
  const eliminar = viejos.filter((_, i) => !usadoV.has(i)).map((b) => b.id);
  return resolver(viejos, nuevos, asignado, actualizar, eliminar);
}

/** Reparte `orden` y separa crear / mover. `asignado[j]` = id viejo reutilizado (o null = bloque nuevo). */
function resolver(viejos, nuevos, asignado, actualizar, eliminar) {
  const m = nuevos.length;
  const final = [];
  const crear = [];
  const ordenViejo = new Map(viejos.map((b) => [b.id, b.orden]));
  let prev = null;
  const pendientes = [];
  for (let j = 0; j < m; j++) {
    const id = asignado[j] || nuevos[j].id || nuevoId();
    const nuevoB = !asignado[j];
    let o = nuevoB ? null : ordenViejo.get(id);
    if (o != null && prev != null && !(o > prev)) o = null;
    final.push({ id, orden: o, bloque: nuevos[j], nuevo: nuevoB });
    if (o != null) prev = o;
    else pendientes.push(j);
  }
  for (const j of pendientes) {
    let a = null, b = null;
    for (let k = j - 1; k >= 0; k--) if (final[k].orden != null) { a = final[k].orden; break; }
    for (let k = j + 1; k < m; k++) if (final[k].orden != null) { b = final[k].orden; break; }
    final[j].orden = ordenEntre(a, b);
    // el siguiente que lo necesite verá este valor como vecino
  }
  const mover = [];
  for (const f of final) {
    if (f.nuevo) crear.push({ id: f.id, orden: f.orden, bloque: f.bloque });
    else if (ordenViejo.get(f.id) !== f.orden) mover.push({ id: f.id, orden: f.orden });
  }
  return { crear, actualizar, eliminar, mover, final: final.map((f) => ({ ...f.bloque, id: f.id, orden: f.orden })) };
}

/**
 * Como diffBloques, pero los bloques nuevos traen su `id` (el mismo si ya existía): sirve para
 * mover, dividir, fusionar y borrar bloques sin perder su identidad.
 */
export function diffPorId(viejos, nuevos) {
  const porId = new Map(viejos.map((b) => [b.id, b]));
  const asignado = nuevos.map((b) => (b.id && porId.has(b.id) ? b.id : null));
  const usados = new Set(asignado.filter(Boolean));
  const actualizar = [];
  nuevos.forEach((b, j) => { if (asignado[j] && firma(porId.get(asignado[j])) !== firma(b)) actualizar.push({ id: asignado[j], bloque: b }); });
  const eliminar = viejos.filter((b) => !usados.has(b.id)).map((b) => b.id);
  const r = resolver(viejos, nuevos, asignado, actualizar, eliminar);
  return r;
}
