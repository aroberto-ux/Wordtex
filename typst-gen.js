// Del modelo a código Typst (https://typst.app).
//
// Misma firma que latex-gen.js: generarTypst(doc, bloques) → { tex, imagenes }. Así los call-sites
// (exportar, codigo, lista) solo tienen que elegir el generador según cfg.formato.
//
// Las fórmulas del modelo se guardan en sintaxis LaTeX (campo `mate`/`tex`). En vez de reescribir toda
// la matemática, se delega en el paquete `mitex`, que renderiza LaTeX dentro de Typst: #mi(`…`) en línea
// y #mitex(`…`) en bloque. typst.ts descarga el paquete solo si el documento usa matemáticas.

import { recortarBr } from './latex-gen.js?v=2026.11.07-p';

// Nombres de archivo de imágenes (misma política que latex-gen: evita colisiones en el proyecto).
const ARCHIVO_RE = /[^\w.-]/g;
const nombreImagen = (n, i = 0) => (String(n || '').replace(ARCHIVO_RE, '_') || `imagen${i + 1}.png`);

/** Escapa el texto para contenido de Typst (modo markup). Las comillas NO se escapan aquí: solo tienen
 *  significado dentro de cadenas "…" (ver escCadena); en markup son literales. */
function escTexto(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([*_`$#@<>\[\]~])/g, '\\$1')   // caracteres con significado en markup
    .replace(/\u00a0/g, '~');                // espacio duro
}

/** Escapa una cadena para ir entre comillas dobles en código Typst (title:, autor…). */
const escCadena = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** Nivel de encabezado del modelo (0=capítulo … 3=subsubsección) a los «=» de Typst. */
const nivelTypst = (n, clase) => '='.repeat(Math.max(1, (clase === 'article' ? (n || 1) : (n || 0) + 1)));

/** Texto en línea (nodos del modelo) → markup de Typst. */
function inlineATypst(c, ctx) {
  let o = '';
  for (const n of c || []) {
    if (typeof n === 'string') { o += escTexto(n); continue; }
    if (n.s != null) {
      let t = escTexto(n.s).replace(/\n/g, ' ');
      if (n.c) t = '`' + n.s.replace(/`/g, '\u2018') + '`';   // código en línea: raw, sin escapar dentro
      if (n.sub) t = `#sub[${t}]`;
      if (n.sup) t = `#super[${t}]`;
      if (n.u) t = `#underline[${t}]`;
      if (n.st) t = `#strike[${t}]`;
      if (n.i) t = `_${t}_`;
      if (n.b) t = `*${t}*`;
      o += t;
    } else if (n.mate != null) { ctx.mate = true; o += `#mi(\`${String(n.mate).replace(/`/g, '')}\`)`; }
    else if (n.nota) o += `#footnote[${inlineATypst(recortarBr(n.nota), ctx)}]`;
    else if (n.cita != null) o += `@${n.cita}`;   // enlaza a la entrada de la bibliografía (#label), sin #bibliography
    else if (n.ref != null) o += `@${n.ref}`;
    else if (n.url != null) {
      const txt = n.c && n.c.length ? inlineATypst(n.c, ctx) : escTexto(n.url);
      o += n.url ? `#link(${escCadena(n.url)})[${txt}]` : txt;
    } else if (n.raw != null) { /* LaTeX avanzado: no tiene equivalente en Typst, se omite en Fase 1 */ }
    else if (n.br) o += ' \\\n';
  }
  return o;
}

/** Alineación de bloque: envuelve en #align(...) si no es justificado/izquierda por defecto. */
const alinear = (al, cuerpo) => (al === 'c' ? `#align(center)[${cuerpo}]` : al === 'r' ? `#align(right)[${cuerpo}]` : cuerpo);

/** Columnas de alineación del modelo (l/c/r) a las de table de Typst. */
const alTabla = { l: 'left', c: 'center', r: 'right' };
const contenidoCelda = (c) => (Array.isArray(c) ? c : (c && Array.isArray(c.c) ? c.c : []));
const cubierta = (c) => !!(c && !Array.isArray(c) && c.cover);

function tablaATypst(b, ctx) {
  const cols = b.al.length;
  const alins = b.al.map((a) => alTabla[a] || 'left').join(', ');
  const trazo = b.borde === 'completo' ? '1pt' : b.borde === 'horizontal' ? '(y: 1pt)' : 'none';
  const celdas = [];
  b.filas.forEach((f, i) => {
    for (let j = 0; j < cols; j++) {
      const c = f[j];
      if (cubierta(c)) continue;
      const cuerpo = inlineATypst(recortarBr(contenidoCelda(c)), ctx) || ' ';
      // Cabecera en negrita, salvo que el contenido ya venga en negrita (evita `**x**`, que en Typst es vacío).
      const yaNegrita = /^\*.*\*$/.test(cuerpo);
      const neg = b.enc && i === 0 && !yaNegrita;
      const span = (!Array.isArray(c) && c && c.colspan > 1) ? `colspan: ${c.colspan}, ` : '';
      const rspan = (!Array.isArray(c) && c && c.rowspan > 1) ? `rowspan: ${c.rowspan}, ` : '';
      const txt = neg ? `[*${cuerpo}*]` : `[${cuerpo}]`;
      celdas.push(span || rspan ? `table.cell(${span}${rspan})${txt}` : txt);
    }
  });
  // `table(...)` como función (sin #) para poder anidarla dentro de figure(); con # al usarla suelta en markup.
  const tabla = `table(\n  columns: ${cols},\n  align: (${alins}),\n  stroke: ${trazo},\n  ${celdas.join(', ')},\n)`;
  if (b.pie && b.pie.length) {
    return `#figure(\n  ${tabla.replace(/\n/g, '\n  ')},\n  caption: [${inlineATypst(recortarBr(b.pie), ctx)}],\n)${b.label ? ` <${b.label}>` : ''}`;
  }
  return '#' + tabla;
}

function figuraATypst(b, ctx) {
  // Fase 1: la compilación en el navegador no tiene sistema de archivos, así que una imagen incrustada
  // (b.src) o una ruta externa (b.ruta) no se pueden cargar; se dibuja un recuadro del tamaño pedido en
  // su lugar (y se registra la imagen para el .zip de LaTeX, aunque en Typst aún no se use).
  if (b.src) archivoDe(b, ctx.imagenes);
  const ancho = b.ancho || 70;
  const img = `rect(width: ${ancho}%, height: 4cm, stroke: 0.5pt)[#align(center + horizon)[${b.src || b.ruta ? 'Imagen (no se incluye al compilar en línea)' : 'Imagen pendiente'}]]`;
  if (b.pie && b.pie.length) {
    return `#figure(\n  ${img},\n  caption: [${inlineATypst(recortarBr(b.pie), ctx)}],\n)${b.label ? ` <${b.label}>` : ''}`;
  }
  return `#align(center)[#${img}]`;
}

export function archivoDe(b, imagenes) {
  let arch = nombreImagen(b.nombre, imagenes.length);
  const previa = imagenes.find((x) => x.nombre === arch);
  if (previa && previa.src !== b.src) {
    const [base, ext = ''] = /^(.*?)(\.[^.]*)?$/.exec(arch).slice(1);
    let k = 2; while (imagenes.some((x) => x.nombre === `${base}-${k}${ext}`)) k++;
    arch = `${base}-${k}${ext}`;
  }
  if (!imagenes.some((x) => x.nombre === arch)) imagenes.push({ nombre: arch, src: b.src });
  return arch;
}

/** Lista (con anidamiento) a markup de Typst: «- » para viñetas, «+ » para numeradas. */
function listaATypst(items, ctx) {
  let o = '';
  for (const it of items) {
    const sangria = '  '.repeat(it.n || 0);
    const marca = it.ord ? '+' : '-';
    // la etiqueta propia (\item[x]) de una lista de descripción → sintaxis de términos de Typst
    if (it.desc && Array.isArray(it.et) && it.et.length) {
      o += `${sangria}/ ${inlineATypst(it.et, ctx)}: ${inlineATypst(recortarBr(it.c), ctx)}\n`;
    } else {
      o += `${sangria}${marca} ${inlineATypst(recortarBr(it.c), ctx)}\n`;
    }
  }
  return o.trimEnd();
}

const TEO_NOMBRE = {
  theorem: { es: 'Teorema', en: 'Theorem' }, lemma: { es: 'Lema', en: 'Lemma' }, proposition: { es: 'Proposición', en: 'Proposition' },
  corollary: { es: 'Corolario', en: 'Corollary' }, definition: { es: 'Definición', en: 'Definition' }, example: { es: 'Ejemplo', en: 'Example' },
  remark: { es: 'Observación', en: 'Remark' }, proof: { es: 'Demostración', en: 'Proof' },
};

function bloqueATypst(b, ctx) {
  switch (b.t) {
    case 'p': return alinear(b.al, inlineATypst(recortarBr(b.c), ctx));
    case 'h': return `${nivelTypst(b.n, ctx.cfg.clase)} ${inlineATypst(recortarBr(b.c), ctx)}${b.label ? ` <${b.label}>` : ''}`;
    case 'lista': {
      // marcar ord/desc en cada item para el render anidado
      const items = b.items.map((it) => ({ ...it, ord: b.ord, desc: b.desc }));
      return listaATypst(items, ctx);
    }
    case 'eq': {
      ctx.mate = true;
      const num = b.num ? '' : '#set math.equation(numbering: none)\n';
      const et = b.label ? ` <${b.label}>` : '';
      return `${num}#mitex(\`${String(b.tex).trim().replace(/`/g, '')}\`)${et}`;
    }
    case 'tabla': return tablaATypst(b, ctx);
    case 'fig': return figuraATypst(b, ctx);
    case 'tikz': return `// (Dibujo TikZ omitido: TikZ es de LaTeX; usa cetz en Typst)\n#align(center)[#rect(stroke: 0.5pt, inset: 8pt)[Dibujo TikZ no disponible en Typst]]`;
    case 'cod': {
      const lang = (b.lang || '').toLowerCase();
      // bloque de código literal de Typst (```lang … ```)
      return '```' + (lang || '') + '\n' + String(b.src).replace(/```/g, "'''") + '\n```';
    }
    case 'teo': {
      const nom = (TEO_NOMBRE[b.tipo] || TEO_NOMBRE.theorem)[ctx.cfg.idioma === 'spanish' ? 'es' : 'en'];
      const tit = b.titulo ? ` (${b.titulo})` : '';
      return `#block(width: 100%, inset: 8pt, radius: 4pt, fill: luma(245), stroke: 0.5pt)[*${nom}${escTexto(tit)}.* ${inlineATypst(recortarBr(b.c), ctx)}]`;
    }
    case 'cita': return `#quote(block: true)[${inlineATypst(recortarBr(b.c), ctx)}]`;
    case 'resumen': return `#align(center)[*${ctx.cfg.idioma === 'spanish' ? 'Resumen' : 'Abstract'}*]\n#block(inset: (x: 2em))[${inlineATypst(recortarBr(b.c), ctx)}]`;
    case 'salto': return '#pagebreak()';
    case 'toc': return '#outline()';
    case 'raw': return `// (LaTeX avanzado omitido en Typst)`;
    default: return '';
  }
}

/**
 * @param {object} doc { cfg, biblio, extra }
 * @param {object[]} bloques  bloques en orden
 * @returns {{ tex: string, imagenes: {nombre:string, src:string}[] }}  (tex = código Typst)
 */
export function generarTypst(doc, bloques) {
  const cfg = doc.cfg;
  const ctx = { cfg, imagenes: [], mate: false, cita: false };
  const cuerpo = bloques.map((b) => bloqueATypst(b, ctx)).filter((s) => s !== '');

  // Preámbulo: configuración de página y documento.
  const pre = [];
  const papel = cfg.papel === 'letterpaper' ? 'us-letter' : 'a4';
  const margen = cfg.margen === 'extra' ? 2.5 : cfg.margen;
  pre.push(`#set page(paper: ${escCadena(papel)}, margin: ${margen}cm, numbering: ${cfg.numPag ? '"1"' : 'none'})`);
  pre.push(`#set text(size: ${cfg.fuente}pt, lang: ${escCadena(cfg.idioma === 'spanish' ? 'es' : cfg.idioma === 'german' ? 'de' : cfg.idioma === 'french' ? 'fr' : cfg.idioma === 'portuguese' ? 'pt' : cfg.idioma === 'italian' ? 'it' : 'en')})`);
  pre.push('#set par(justify: true' + (cfg.interlineado !== 1 ? `, leading: ${(cfg.interlineado * 0.65).toFixed(2)}em` : '') + ')');
  pre.push('#set heading(numbering: "1.1")');
  if (ctx.mate) {
    pre.unshift('#import "@preview/mitex:0.2.4": *');
    pre.push('#set math.equation(numbering: "(1)")');
  }

  // Portada sencilla con el título/autor/fecha.
  const portada = [];
  if (cfg.titulo && cfg.mostrarTitulo) {
    portada.push(`#align(center)[\n  #text(size: 1.6em, weight: "bold")[${escTexto(cfg.titulo)}]`);
    if (cfg.autor) portada.push(`  #v(0.6em)\n  #text(size: 1.1em)[${escTexto(cfg.autor)}]`);
    if (cfg.fecha && cfg.fecha !== 'ninguna') portada.push(`  #v(0.4em)\n  ${escTexto(cfg.fecha)}`);
    else if (!cfg.fecha) portada.push(`  #v(0.4em)\n  #datetime.today().display()`);
    portada.push(']');
  }

  const salida = [pre.join('\n'), ''];
  if (portada.length) salida.push(portada.join('\n'), '');
  salida.push(cuerpo.join('\n\n'));

  if (doc.biblio && doc.biblio.length) {
    // Bibliografía sencilla sin archivo .bib: cada entrada es un párrafo numerado con su clave como
    // destino (<clave>), de modo que las citas del texto (@clave) enlazan a ella.
    salida.push('', `#heading(numbering: none)[${cfg.idioma === 'spanish' ? 'Referencias' : 'References'}]`);
    doc.biblio.forEach((r, i) => {
      salida.push(`#block[[${i + 1}] ${escTexto(r.texto)} #label(${escCadena(r.key)})]`);
    });
  }

  return { tex: salida.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n', imagenes: ctx.imagenes };
}
