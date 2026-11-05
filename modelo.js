// Modelo del documento. Un documento tiene:
//   · cfg    – ajustes generales (clase, tamaño de letra, papel, idioma, título…)
//   · biblio – referencias bibliográficas [{ key, texto }]
//   · extra  – líneas de preámbulo propias (paquetes y macros que se conservan tal cual)
//   · bloques – lista ordenada de bloques (párrafo, sección, lista, ecuación, tabla, figura…)
//
// Texto en línea («inline»): lista de nodos.
//   { s:'texto', b:1, i:1, u:1, c:1, st:1, sub:1, sup:1 }   texto con formato
//   { mate:'x^2' }  fórmula en línea      { nota:[…] }  nota al pie
//   { cita:'clave' } cita bibliográfica   { ref:'etiqueta' }  referencia cruzada
//   { url:'https://…', c:[…] }  enlace    { raw:'\\cmd{…}' }  LaTeX que se conserva tal cual
//   { br:1 }  salto de línea

export const CLASES = [['article', 'Artículo'], ['report', 'Informe (con capítulos)'], ['book', 'Libro']];
export const TAMANOS = [10, 11, 12];
export const PAPELES = [['a4paper', 'A4'], ['letterpaper', 'Carta (Letter)']];
export const IDIOMAS = [['spanish', 'Español'], ['english', 'English'], ['portuguese', 'Português'], ['french', 'Français'], ['german', 'Deutsch'], ['italian', 'Italiano']];

/** Entornos tipo teorema: id → nombre por idioma. */
export const TEOREMAS = {
  theorem: { es: 'Teorema', en: 'Theorem', estilo: 'plain' },
  lemma: { es: 'Lema', en: 'Lemma', estilo: 'plain' },
  proposition: { es: 'Proposición', en: 'Proposition', estilo: 'plain' },
  corollary: { es: 'Corolario', en: 'Corollary', estilo: 'plain' },
  definition: { es: 'Definición', en: 'Definition', estilo: 'definition' },
  example: { es: 'Ejemplo', en: 'Example', estilo: 'definition' },
  remark: { es: 'Observación', en: 'Remark', estilo: 'remark' },
  proof: { es: 'Demostración', en: 'Proof', estilo: 'proof' },
};
/** Nombres que se reconocen al leer un .tex (español e inglés) → id interno. */
export const ALIAS_TEOREMA = {
  theorem: 'theorem', teorema: 'theorem', thm: 'theorem', lemma: 'lemma', lema: 'lemma', lem: 'lemma',
  proposition: 'proposition', proposicion: 'proposition', prop: 'proposition', corollary: 'corollary', corolario: 'corollary', cor: 'corollary',
  definition: 'definition', definicion: 'definition', defn: 'definition', example: 'example', ejemplo: 'example', ex: 'example',
  remark: 'remark', observacion: 'remark', rem: 'remark', proof: 'proof', demostracion: 'proof',
};

export const LENGUAJES_COD = [
  ['', 'Texto sin colores'], ['Python', 'Python'], ['Java', 'Java'], ['C', 'C'], ['C++', 'C++'], ['Matlab', 'MATLAB'],
  ['SQL', 'SQL'], ['bash', 'Bash'], ['HTML', 'HTML'], ['TeX', 'LaTeX'], ['R', 'R'],
];

export const NIVELES = { 0: 'chapter', 1: 'section', 2: 'subsection', 3: 'subsubsection' };

export function cfgPorDefecto() {
  return {
    clase: 'article', fuente: 11, papel: 'a4paper', margen: 2.5, idioma: 'spanish', interlineado: 1,
    columnas: 1, numPag: true, titulo: '', autor: '', fecha: '', mostrarTitulo: true,
  };
}

let contador = 0;
export function nuevoId(pref = 'b') {
  contador = (contador + 1) % 1296;
  return pref + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3) + contador.toString(36);
}

export const txt = (s, extra = {}) => ({ s, ...extra });

/** Texto sin formato de una lista inline. */
export function textoPlano(c) {
  let o = '';
  for (const n of c || []) {
    if (typeof n === 'string') o += n;
    else if (n.s != null) o += n.s;
    else if (n.mate != null) o += '$' + n.mate + '$';
    else if (n.c) o += textoPlano(n.c);
    else if (n.nota) o += '';
    else if (n.br) o += ' ';
  }
  return o;
}

/** Une nodos de texto contiguos con el mismo formato. */
export function compactar(c) {
  const out = [];
  for (let n of c || []) {
    if (typeof n === 'string') n = { s: n };
    const prev = out[out.length - 1];
    if (n.s != null && prev && prev.s != null && ['b', 'i', 'u', 'c', 'st', 'sub', 'sup'].every((k) => !!prev[k] === !!n[k])) prev.s += n.s;
    else if (n.s !== '') out.push({ ...n });
  }
  return out;
}

export const MARCAS = ['b', 'i', 'u', 'c', 'st', 'sub', 'sup'];

/** Bloques nuevos con contenido de ejemplo. */
export function bloqueNuevo(tipo, o = {}) {
  switch (tipo) {
    case 'p': return { t: 'p', c: [], al: 'j', ...o };
    case 'h': return { t: 'h', n: 1, c: [txt('Título de la sección')], num: true, ...o };
    case 'lista': return { t: 'lista', ord: false, items: [{ c: [txt('Primer elemento')], n: 0 }, { c: [txt('Segundo elemento')], n: 0 }], ...o };
    case 'eq': return { t: 'eq', env: 'equation', tex: 'E = mc^{2}', num: false, label: '', ...o };
    case 'tabla': {
      const f = o.filas || 3, c = o.cols || 3;
      const filas = Array.from({ length: f }, (_, i) => Array.from({ length: c }, (_, j) => (i === 0 ? [txt(`Columna ${j + 1}`)] : [])));
      return { t: 'tabla', filas, enc: true, al: Array(c).fill('l'), borde: 'completo', pie: [], label: '' };
    }
    case 'fig': return { t: 'fig', src: '', nombre: 'imagen.png', ancho: 70, pie: [], label: '', ...o };
    case 'cod': return { t: 'cod', lang: 'Python', src: 'def saludar(nombre):\n    return f"Hola, {nombre}"', num: true, ...o };
    case 'teo': return { t: 'teo', tipo: 'theorem', titulo: '', c: [], ...o };
    case 'cita': return { t: 'cita', c: [], ...o };
    case 'resumen': return { t: 'resumen', c: [], ...o };
    case 'salto': return { t: 'salto' };
    case 'toc': return { t: 'toc' };
    case 'raw': return { t: 'raw', tex: '% LaTeX propio', ...o };
    default: return { t: 'p', c: [] };
  }
}

export const TIPOS_BLOQUE = ['p', 'h', 'lista', 'eq', 'tabla', 'fig', 'cod', 'teo', 'cita', 'resumen', 'salto', 'toc', 'raw'];

// ── Validación (todo lo que entra de fuera —importar, Firebase, JSON— pasa por aquí) ─────────────

const cadena = (v, max) => String(v == null ? '' : v).slice(0, max);
const entre = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const etiqueta = (v) => cadena(v, 60).replace(/[^\w:.-]/g, '');

export function sanearInline(c, prof = 0) {
  if (!Array.isArray(c) || prof > 4) return [];
  const out = [];
  for (const n of c.slice(0, 4000)) {
    if (typeof n === 'string') { if (n) out.push({ s: cadena(n, 20000) }); continue; }
    if (!n || typeof n !== 'object') continue;
    if (typeof n.s === 'string') {
      const o = { s: cadena(n.s, 20000) };
      for (const k of MARCAS) if (n[k]) o[k] = 1;
      out.push(o);
    } else if (typeof n.mate === 'string') out.push({ mate: cadena(n.mate, 4000) });
    else if (Array.isArray(n.nota)) out.push({ nota: sanearInline(n.nota, prof + 1) });
    else if (typeof n.cita === 'string') out.push({ cita: cadena(n.cita, 200).replace(/[^\w:.,\- ]/g, '') });
    else if (typeof n.ref === 'string') out.push({ ref: etiqueta(n.ref) });
    else if (typeof n.url === 'string') out.push({ url: cadena(n.url, 2000), c: sanearInline(n.c, prof + 1) });
    else if (typeof n.raw === 'string') out.push({ raw: cadena(n.raw, 4000) });
    else if (n.br) out.push({ br: 1 });
  }
  return out;
}

export function sanearBloque(b) {
  if (!b || typeof b !== 'object') return null;
  const t = b.t;
  switch (t) {
    case 'p': return { t, c: sanearInline(b.c), al: ['j', 'l', 'c', 'r'].includes(b.al) ? b.al : 'j' };
    case 'h': return { t, n: [0, 1, 2, 3].includes(b.n) ? b.n : 1, c: sanearInline(b.c), num: b.num !== false, label: etiqueta(b.label) };
    case 'lista': return {
      t, ord: !!b.ord,
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 500).map((i) => ({ c: sanearInline(i && i.c), n: entre(i && i.n, 0, 2, 0) })),
    };
    case 'eq': return { t, env: ['equation', 'align', 'gather'].includes(b.env) ? b.env : 'equation', tex: cadena(b.tex, 8000), num: !!b.num, label: etiqueta(b.label) };
    case 'tabla': {
      const filas = (Array.isArray(b.filas) ? b.filas : []).slice(0, 100).map((f) => (Array.isArray(f) ? f : []).slice(0, 20).map((c) => sanearInline(c)));
      const cols = Math.max(1, ...filas.map((f) => f.length));
      filas.forEach((f) => { while (f.length < cols) f.push([]); });
      const al = Array.from({ length: cols }, (_, i) => (['l', 'c', 'r'].includes(b.al && b.al[i]) ? b.al[i] : 'l'));
      return { t, filas: filas.length ? filas : [[[]]], enc: !!b.enc, al, borde: ['completo', 'horizontal', 'ninguno'].includes(b.borde) ? b.borde : 'completo', pie: sanearInline(b.pie), label: etiqueta(b.label) };
    }
    case 'fig': return {
      t, src: /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(b.src || '') || /^https:\/\/[^\s"'<>]+$/i.test(b.src || '') ? b.src : '',
      nombre: cadena(b.nombre, 80).replace(/[^\w.-]/g, '_') || 'imagen.png', ancho: entre(b.ancho, 10, 100, 70), pie: sanearInline(b.pie), label: etiqueta(b.label),
    };
    case 'cod': return { t, lang: cadena(b.lang, 20).replace(/[^\w+#-]/g, ''), src: cadena(b.src, 100000), num: !!b.num };
    case 'teo': return { t, tipo: TEOREMAS[b.tipo] ? b.tipo : 'theorem', titulo: cadena(b.titulo, 200), c: sanearInline(b.c) };
    case 'cita': case 'resumen': return { t, c: sanearInline(b.c) };
    case 'salto': case 'toc': return { t };
    case 'raw': return { t, tex: cadena(b.tex, 50000) };
    default: return null;
  }
}

export function sanearCfg(c) {
  const d = cfgPorDefecto();
  c = c && typeof c === 'object' ? c : {};
  return {
    clase: CLASES.some(([v]) => v === c.clase) ? c.clase : d.clase,
    fuente: TAMANOS.includes(Number(c.fuente)) ? Number(c.fuente) : d.fuente,
    papel: PAPELES.some(([v]) => v === c.papel) ? c.papel : d.papel,
    margen: c.margen === 'extra' ? 'extra' : entre(c.margen, 1, 5, d.margen),
    idioma: IDIOMAS.some(([v]) => v === c.idioma) ? c.idioma : d.idioma,
    interlineado: entre(c.interlineado, 1, 2.5, 1),
    columnas: Number(c.columnas) === 2 ? 2 : 1,
    numPag: c.numPag !== false,
    titulo: cadena(c.titulo, 300), autor: cadena(c.autor, 300), fecha: cadena(c.fecha, 100),
    mostrarTitulo: c.mostrarTitulo !== false,
  };
}

export function sanearBiblio(b) {
  return (Array.isArray(b) ? b : []).slice(0, 300).map((x) => ({ key: cadena(x && x.key, 60).replace(/[^\w:.-]/g, ''), texto: cadena(x && x.texto, 2000) }))
    .filter((x) => x.key);
}
