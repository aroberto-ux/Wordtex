// Numeración como la haría LaTeX (secciones, ecuaciones, figuras, tablas, teoremas, citas y
// referencias cruzadas). Se usa para que la vista de página muestre los mismos números que tendrá el PDF.

import { TEOREMAS, textoPlano } from './modelo.js?v=2026.11.04-b';

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
  if (b.env === 'equation') return 1;
  // las filas con \nonumber o \notag no llevan número
  const partes = String(b.tex || '').split(/\\\\/).filter((x) => x.trim() && !/\\(nonumber|notag)\b/.test(x));
  return Math.max(1, partes.length);
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
        const k = filasEq(b);
        const pref = capitulos && c[0] ? `${c[0]}.` : '';
        const a = eq + 1; eq += k;
        const txt = k === 1 ? `${pref}${a}` : `${pref}${a}–${pref}${eq}`;
        info.set(b.id, { num: txt });
        if (b.label) etiquetas.set(b.label, `${pref}${a}`);
      } else info.set(b.id, { num: '' });
    } else if (b.t === 'fig') {
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
    } else if (b.t === 'teo') {
      if (b.tipo === 'proof') { info.set(b.id, { num: '', nombre: TEOREMAS.proof[ro.teo] }); continue; }
      teo[b.tipo] = (teo[b.tipo] || 0) + 1;
      const num = `${capitulos && c[0] ? c[0] + '.' : ''}${teo[b.tipo]}`;
      info.set(b.id, { num, nombre: `${(TEOREMAS[b.tipo] || TEOREMAS.theorem)[ro.teo]} ${num}` });
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
    const tipo = b.t === 'h' ? 'Sección' : b.t === 'eq' ? 'Ecuación' : b.t === 'fig' ? 'Figura' : 'Tabla';
    out.push({ label: b.label, num: num.etiquetas.get(b.label) || '?', tipo, texto: b.t === 'h' ? textoPlano(b.c) : (b.t === 'eq' ? b.tex.slice(0, 30) : textoPlano(b.pie || [])) });
  }
  return out;
}

/** Etiqueta nueva para un bloque (única en el documento). */
export function etiquetaNueva(bloques, b) {
  const pref = b.t === 'h' ? 'sec' : b.t === 'eq' ? 'eq' : b.t === 'fig' ? 'fig' : 'tab';
  let base = pref + ':' + (b.t === 'h' ? textoPlano(b.c) : b.t === 'eq' ? '' : textoPlano(b.pie || []))
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  if (base.endsWith(':')) base += 'x';
  const usadas = new Set(bloques.map((x) => x.label).filter(Boolean));
  let l = base, k = 1;
  while (usadas.has(l)) l = `${base}${++k}`;
  return l;
}
