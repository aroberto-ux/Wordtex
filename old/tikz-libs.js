// Librerías de TikZ que necesita un dibujo para compilar. Sin dependencias: lo usan latex-gen.js y tikz.js.

export function quitarComentarios(src) {
  return String(src).split('\n').map((l) => {
    for (let k = 0; k < l.length; k++) { if (l[k] === '\\') { k++; continue; } if (l[k] === '%') return l.slice(0, k); }
    return l;
  }).join('\n');
}


const LIBRERIAS = [
  // puntas de arrows.meta solo en una especificación de flecha: «-{Stealth}», «{Latex[length=2mm]}-», «>={Stealth}»
  [/(?:-|>=)\s*\{?\s*(?:Stealth|Latex|Triangle|Kite|Square|Straight Barb|Arc Barb|Hooks|Bar|Bracket|Rays|To|Circle|Implies)\b|[\[,]\s*\{(?:Stealth|Latex|Triangle|Kite|Square|Straight Barb|Arc Barb|Hooks|Bar|Bracket|Rays|To|Circle|Implies)\b[^}]*\}\s*-/, 'arrows.meta'],
  [/\b(above|below|left|right)(\s+(left|right))?\s*=\s*[^,\]]*\bof\b/, 'positioning'],
  [/\(\s*\$/, 'calc'],
  [/\[[^\]]*\b(diamond|ellipse|trapezium|regular polygon|star|cylinder|isosceles triangle|kite|dart|semicircle)\b[^\]]*\]/, 'shapes.geometric'],
  [/\b(decorate|decoration)\b[\s\S]*\bbrace\b/, 'decorations.pathreplacing'],
  [/\bdecoration\s*=\s*\{?\s*(snake|zigzag|coil|random steps|bumps|saw)\b/, 'decorations.pathmorphing'],
  [/\bmark\s*=\s*at position/, 'decorations.markings'],
  [/\bpattern\s*=/, 'patterns'],
  [/\bfit\s*=/, 'fit'],
  [/\bon background layer\b/, 'backgrounds'],
  [/\bpic\b[^;]*\bangle\b/, 'angles'],
  [/\bpic\s*\[[^\]]*"/, 'quotes'],
  [/\bname path\b|\bname intersections\b/, 'intersections'],
  [/\bmatrix of (math )?nodes\b/, 'matrix'],
  [/\bdrop shadow\b|\bcircular drop shadow\b/, 'shadows'],
  [/\[[^\]]*\b(state|initial|accepting)\b[^\]]*\]/, 'automata'],
];
/** Librerías de TikZ que usa el código (para añadir \usetikzlibrary al generar el .tex). */
export function libreriasNecesarias(src) {
  const s = quitarComentarios(src);
  return LIBRERIAS.filter(([re]) => re.test(s)).map(([, l]) => l);
}
