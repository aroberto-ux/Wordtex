// Numeración como la haría LaTeX (secciones, ecuaciones, figuras, tablas, teoremas, citas y
// referencias cruzadas). Se usa para que la vista de página muestre los mismos números que tendrá el PDF.

import { TEOREMAS, textoPlano, EQ_FILAS, dividirFilas } from './modelo.js?v=2026.11.07-o';
import { sinComentarios, expandirMacros, usaMacrosPropias } from './macros.js?v=2026.11.07-o';

export const ROTULOS = {
  spanish: { fig: 'Figura', tab: 'Tabla', resumen: 'Resumen', indice: 'Índice general', refs: 'Referencias', cap: 'Capítulo', teo: 'es' },
  english: { fig: 'Figure', tab: 'Table', resumen: 'Abstract', indice: 'Contents', refs: 'References', cap: 'Chapter', teo: 'en' },
  portuguese: { fig: 'Figura', tab: 'Tabela', resumen: 'Resumo', indice: 'Sumário', refs: 'Referências', cap: 'Capítulo', teo: 'es' },
  french: { fig: 'Figure', tab: 'Tableau', resumen: 'Résumé', indice: 'Table des matières', refs: 'Références', cap: 'Chapitre', teo: 'en' },
  german: { fig: 'Abbildung', tab: 'Tabelle', resumen: 'Zusammenfassung', indice: 'Inhaltsverzeichnis', refs: 'Literatur', cap: 'Kapitel', teo: 'en' },
  italian: { fig: 'Figura', tab: 'Tabella', resumen: 'Sommario', indice: 'Indice', refs: 'Bibliografia', cap: 'Capitolo', teo: 'es' },
};
export const rotulos = (idioma) => ROTULOS[idioma] || ROTULOS.english;

/** Número de filas numeradas de un entorno align/gather (una por cada «\\»). */
function filasEq(b) {
  if (!EQ_FILAS.has(b.env)) return [{ etiquetas: etiquetasEn(b.tex) }]; // equation y multline: un solo número
  // las filas con \nonumber o \notag no llevan número
  const filas = dividirFilas(b.tex).filter((x) => x.replace(/\\\\$/, '').trim() && !/\\(nonumber|notag)\b/.test(x)).map((x) => ({ etiquetas: etiquetasEn(x) }));
  return filas.length ? filas : [{ etiquetas: [] }];
}
const etiquetasEn = (t) => [...String(t || '').matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1].trim());

/**
 * table, figure y longtable de un bloque de LaTeX crudo, en orden (los anidados no cuentan aparte).
 * @returns {{tipo:'tab'|'fig', cap:boolean, texto:string, num?:string, nombre?:string}[]}
 */
function itemsFlotantes(tex) {
  const src = sinComentarios(tex);
  const out = [];
  const re = /\\begin\{(table|figure|longtable)(\*?)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const fin = src.indexOf(`\\end{${m[1]}${m[2]}}`, re.lastIndex);
    const texto = src.slice(m.index, fin < 0 ? src.length : fin);
    out.push({ tipo: m[1] === 'figure' ? 'fig' : 'tab', cap: /\\caption\b/.test(texto), texto });
    if (fin < 0) break;
    re.lastIndex = fin;
  }
  return out;
}

/**
 * @returns {{ info: Map<string, {num:string, nombre?:string}>, etiquetas: Map<string,string>, titulos: Array, citas: Map<string,number> }}
 */
export function numerar(cfg, bloques, biblio = []) {
  const info = new Map();
  const etiquetas = new Map();
  const titulos = [];
  const capitulos = cfg.clase !== 'article';
  const ro = rotulos(cfg.idioma);
  let c = [0, 0, 0, 0];
  let eq = 0, fig = 0, tab = 0;
  const teo = {};
  const reiniciar = () => { eq = 0; fig = 0; tab = 0; for (const k of Object.keys(teo)) teo[k] = 0; };
  for (const b of bloques) {
    if (b.t === 'h') {
      // en «article» el nivel 0 se comporta como sección (igual que al generar el .tex)
      const nivel = capitulos ? b.n : Math.max(1, b.n);
      let num = '';
      if (b.num !== false) {
        c[nivel]++; for (let k = nivel + 1; k < 4; k++) c[k] = 0;
        if (nivel === 0) reiniciar();
        num = (capitulos ? c.slice(0, nivel + 1) : c.slice(1, nivel + 1)).join('.');
      }
      info.set(b.id, { num });
      if (b.label && num) etiquetas.set(b.label, num);
      titulos.push({ id: b.id, n: nivel, num, texto: textoPlano(b.c) });
    } else if (b.t === 'eq') {
      if (b.num) {
        const filas = filasEq(b);
        const pref = capitulos && c[0] ? `${c[0]}.` : '';
        const a = eq + 1; eq += filas.length;
        const txt = filas.length === 1 ? `${pref}${a}` : `${pref}${a}–${pref}${eq}`;
        info.set(b.id, { num: txt });
        if (b.label) etiquetas.set(b.label, `${pref}${a}`);
        // etiquetas escritas dentro del código, fila a fila
        filas.forEach((f, k) => { for (const l of f.etiquetas) etiquetas.set(l, `${pref}${a + k}`); });
      } else info.set(b.id, { num: '' });
    } else if (b.t === 'fig' || b.t === 'tikz') {
      // como en LaTeX: solo las figuras con pie (\caption) llevan número
      if (b.pie && b.pie.length) {
        fig++;
        const num = `${capitulos && c[0] ? c[0] + '.' : ''}${fig}`;
        info.set(b.id, { num, nombre: `${ro.fig} ${num}` });
        if (b.label) etiquetas.set(b.label, num);
      } else info.set(b.id, { num: '' });
    } else if (b.t === 'tabla') {
      if (b.pie && b.pie.length) {
        tab++;
        const num = `${capitulos && c[0] ? c[0] + '.' : ''}${tab}`;
        info.set(b.id, { num, nombre: `${ro.tab} ${num}` });
        if (b.label) etiquetas.set(b.label, num);
      } else info.set(b.id, { num: '' });
    } else if (b.t === 'raw') {
      // LaTeX avanzado: también cuenta para la numeración (figuras y tablas con pie, ecuaciones numeradas)
      let t = String(b.tex || '').trim();
      if (usaMacrosPropias(t)) t = expandirMacros(t).trim();   // \foto, \grafica… cuentan como las figuras que realmente son
      const mat = /^\\begin\{(equation|align|gather|multline|flalign|eqnarray|alignat|xalignat)\}/.exec(t);
      const pref = capitulos && c[0] ? `${c[0]}.` : '';
      const items = itemsFlotantes(t);
      if (items.length) {
        // cada table, figure o longtable del bloque cuenta como en LaTeX (solo si tiene \caption)
        for (const it of items) {
          if (!it.cap) { it.num = ''; continue; }
          if (it.tipo === 'fig') { fig++; it.num = pref + fig; it.nombre = `${ro.fig} ${it.num}`; }
          else { tab++; it.num = pref + tab; it.nombre = `${ro.tab} ${it.num}`; }
          for (const l of etiquetasEn(it.texto)) etiquetas.set(l, it.num);
        }
        for (const it of items) delete it.texto;
        info.set(b.id, { num: (items.find((x) => x.num) || {}).num || '', items });
      } else if (mat) {
        const filas = filasEq({ env: /^(equation|multline)$/.test(mat[1]) ? 'equation' : 'align', tex: t.slice(mat[0].length).replace(/\\end\{[^}]*\}\s*$/, '') });
        const a = eq + 1; eq += filas.length;
        filas.forEach((f, k) => { for (const l of f.etiquetas) etiquetas.set(l, `${pref}${a + k}`); });
      }
    } else if (b.t === 'teo') {
      if (b.tipo === 'proof') { info.set(b.id, { num: '', nombre: TEOREMAS.proof[ro.teo] }); continue; }
      teo[b.tipo] = (teo[b.tipo] || 0) + 1;
      const num = `${capitulos && c[0] ? c[0] + '.' : ''}${teo[b.tipo]}`;
      info.set(b.id, { num, nombre: `${(TEOREMAS[b.tipo] || TEOREMAS.theorem)[ro.teo]} ${num}` });
      // \label dentro del enunciado (se conserva como LaTeX en línea)
      for (const n of b.c || []) if (n.raw != null) for (const l of etiquetasEn(n.raw)) etiquetas.set(l, num);
    }
  }
  const citas = new Map((biblio || []).map((x, i) => [x.key, i + 1]));
  return { info, etiquetas, titulos, citas };
}

/** Etiquetas disponibles para referencias cruzadas: [{ label, num, tipo, texto }]. */
export function etiquetasDisponibles(bloques, num) {
  const out = [];
  for (const b of bloques) {
    if (!b.label) continue;
    const i = num.info.get(b.id) || {};
    const tipo = b.t === 'h' ? 'Sección' : b.t === 'eq' ? 'Ecuación' : b.t === 'fig' || b.t === 'tikz' ? 'Figura' : 'Tabla';
    out.push({ label: b.label, num: num.etiquetas.get(b.label) || '?', tipo, texto: b.t === 'h' ? textoPlano(b.c) : (b.t === 'eq' ? b.tex.slice(0, 30) : textoPlano(b.pie || [])) });
  }
  return out;
}

/** Etiqueta nueva para un bloque (única en el documento). */
export function etiquetaNueva(bloques, b) {
  const pref = b.t === 'h' ? 'sec' : b.t === 'eq' ? 'eq' : b.t === 'fig' || b.t === 'tikz' ? 'fig' : 'tab';
  let base = pref + ':' + (b.t === 'h' ? textoPlano(b.c) : b.t === 'eq' ? '' : textoPlano(b.pie || []))
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  if (base.endsWith(':')) base += 'x';
  const usadas = new Set(bloques.map((x) => x.label).filter(Boolean));
  let l = base, k = 1;
  while (usadas.has(l)) l = `${base}${++k}`;
  return l;
}
