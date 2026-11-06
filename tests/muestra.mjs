// Informe del .tex de muestra (tests/muestra/muestra.tex): qué bloques salen, cuántos quedan como LaTeX
// avanzado y si la ida y vuelta parsear → generar es estable. Uso:  node tests/muestra.mjs
// También lo usa tests/parte1.test.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsearTex } from '../latex-parse.js';
import { generarTex } from '../latex-gen.js';
import { tipoVistaRaw } from '../vista-latex.js';

export const RUTA_MUESTRA = fileURLToPath(new URL('./muestra/muestra.tex', import.meta.url));

export function analizarMuestra(src = readFileSync(RUTA_MUESTRA, 'utf8')) {
  const m = parsearTex(src);
  const t1 = generarTex(m, m.bloques).tex;
  const m2 = parsearTex(t1);
  const t2 = generarTex(m2, m2.bloques).tex;
  const raw = m.bloques.filter((b) => b.t === 'raw');
  const sinComentarios = raw.filter((b) => tipoVistaRaw(b.tex) !== 'comentario');
  const porTipo = {};
  for (const b of m.bloques) porTipo[b.t] = (porTipo[b.t] || 0) + 1;
  return {
    m, t1, t2, estable: t1 === t2, porTipo,
    raw: sinComentarios.map((b) => ({ vista: tipoVistaRaw(b.tex), inicio: b.tex.split('\n')[0].slice(0, 60) })),
    sinVista: sinComentarios.filter((b) => !tipoVistaRaw(b.tex)).map((b) => b.tex.split('\n')[0]),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = analizarMuestra();
  console.log('Bloques por tipo:', r.porTipo);
  console.log(`\nLaTeX avanzado (sin contar comentarios): ${r.raw.length}`);
  for (const x of r.raw) console.log(`  · [${x.vista || 'sin vista previa'}] ${x.inicio}`);
  console.log(`\nIda y vuelta parsear → generar → parsear → generar estable: ${r.estable ? 'sí' : 'NO'}`);
  if (!r.estable) {
    const a = r.t1.split('\n'), b = r.t2.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    console.log(`  primera diferencia en la línea ${i + 1}:\n  - ${a[i]}\n  + ${b[i]}`);
  }
  process.exit(r.estable ? 0 : 1);
}
