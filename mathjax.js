// Capa fina sobre MathJax 3 para el resto de la aplicación.
//
//  · renderMate(el, tex, display)   → compone una fórmula dentro de `el` (por lotes, asíncrono).
//  · pintorEnVivo(el, ms)           → igual, pero con debounce y descartando resultados viejos (vista previa).
//  · limpiarMate(el)                → MathJax.typesetClear: olvida las fórmulas de `el` (evita fugas de memoria).
//  · mateHtml(tex, display)         → HTML síncrono (para los nodos de TikZ, que se miden al momento).
//
// Se puede importar desde Node (pruebas): no toca `window` ni `document` al cargarse.

const MJ = () => (typeof globalThis !== 'undefined' ? globalThis.MathJax : null);
const LOTE = 40;             // fórmulas por llamada a typesetPromise (para no bloquear la interfaz)
const REINTENTOS_DESCONECTADO = 3;

export function mathjaxListo() {
  return typeof window !== 'undefined' && window.mathjaxListo ? window.mathjaxListo : Promise.resolve(false);
}

/** ¿Se puede componer ya, de forma síncrona (tex2chtml)? */
export const mateDisponible = () => typeof MJ()?.tex2chtml === 'function';

const siguienteFotograma = () => new Promise((ok) => {
  // requestAnimationFrame se pausa en pestañas ocultas: el temporizador evita que el trabajo se quede esperando.
  let hecho = false;
  const fin = () => { if (!hecho) { hecho = true; ok(); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fin);
  setTimeout(fin, 80);
});

const envolver = (tex, display) => (display ? `\\[${tex}\\]` : `\\(${tex}\\)`);

// ── Cola de composición ──────────────────────────────────────────────────

/** @type {Map<HTMLElement, {tex:string, display:boolean, esperan:Function[], intentos:number}>} */
const pendientes = new Map();
let enCurso = false;
let vueltas = 0;

/** Quita de la lista de MathJax las fórmulas cuyo contenedor ya no está en la página (bloques repintados). */
function podarHuerfanas() {
  const doc = MJ()?.startup?.document;
  if (!doc || !doc.math) return;
  try {
    const sueltas = [];
    for (const m of doc.math) if (m.typesetRoot && !m.typesetRoot.isConnected) sueltas.push(m);
    for (const m of sueltas) doc.math.remove(m);
  } catch { /* la poda es opcional */ }
}

export function limpiarMate(el) {
  const mj = MJ();
  if (mj && typeof mj.typesetClear === 'function' && el) { try { mj.typesetClear([el]); } catch { /* sigue */ } }
}

function resultadoDe(el, tex) {
  // Llaves sin cerrar: MathJax no llega a reconocer la fórmula y deja los delimitadores como texto.
  if (!el.querySelector('mjx-container')) {
    el.textContent = tex;
    el.classList.add('mj-error'); el.setAttribute('data-mj-error', 'Falta cerrar una llave');
    return { ok: false, error: 'Falta cerrar una llave' };
  }
  const err = el.querySelector('mjx-merror, [data-mjx-error]');
  const msg = err ? (err.getAttribute('data-mjx-error') || err.getAttribute('title') || err.textContent || 'Error de LaTeX') : '';
  el.classList.toggle('mj-error', !!err);
  if (err) el.setAttribute('data-mj-error', msg); else el.removeAttribute('data-mj-error');
  return { ok: !err, error: msg };
}

async function vaciarCola() {
  if (enCurso) return;
  enCurso = true;
  try {
    const listo = await mathjaxListo();
    while (pendientes.size) {
      await siguienteFotograma();
      const lote = [];
      for (const [el, p] of [...pendientes].slice(0, LOTE)) {
        pendientes.delete(el);
        // Elementos aún sin insertar en la página: se espera unos fotogramas (MathJax mide con el contenedor ya puesto).
        if (!el.isConnected && p.intentos < REINTENTOS_DESCONECTADO) { p.intentos++; pendientes.set(el, p); continue; }
        lote.push([el, p]);
      }
      if (!lote.length) continue;

      if (!listo || !MJ() || !MJ().typesetPromise) {           // sin MathJax: se queda el código como texto
        for (const [el, p] of lote) { el.textContent = p.tex; el.removeAttribute('data-mj'); p.esperan.forEach((f) => f({ ok: false, error: 'MathJax no está disponible' })); }
        continue;
      }
      for (const [el, p] of lote) {
        limpiarMate(el);                                       // typesetClear ANTES de reescribir el contenido
        el.setAttribute('data-mj', 'componiendo');
        el.textContent = envolver(p.tex, p.display);
      }
      let fallo = null;
      try { await MJ().typesetPromise(lote.map(([el]) => el)); } catch (e) { fallo = e; console.warn('MathJax:', e); }
      for (const [el, p] of lote) {
        el.removeAttribute('data-mj');
        el.classList.remove('mj-pend');
        let r;
        if (fallo && !el.querySelector('mjx-container')) { el.textContent = p.tex; r = { ok: false, error: String(fallo.message || fallo) }; }
        else r = resultadoDe(el, p.tex);
        p.esperan.forEach((f) => f(r));
      }
      if (++vueltas % 10 === 0) podarHuerfanas();
    }
  } finally { enCurso = false; if (pendientes.size) vaciarCola(); }
}

/**
 * Compone `tex` dentro de `el`. Vuelve enseguida con un marcador de posición (el código en gris la primera vez;
 * la composición anterior se mantiene mientras llega la nueva) y la promesa se resuelve al terminar.
 * @returns {Promise<{ok:boolean, error:string}>}
 */
export function renderMate(el, tex, display = false) {
  tex = String(tex ?? '');
  return new Promise((ok) => {
    if (!tex.trim()) {
      const p = pendientes.get(el);
      if (p) { pendientes.delete(el); p.esperan.forEach((f) => f({ ok: true, error: '' })); }
      limpiarMate(el);
      el.classList.remove('mj-error'); el.removeAttribute('data-mj-error'); el.removeAttribute('data-mj');
      el.textContent = '▢'; el.classList.add('vacia');
      return ok({ ok: true, error: '' });
    }
    el.classList.remove('vacia');
    if (!el.querySelector('mjx-container')) {                 // primera vez: se ve el código mientras se compone
      limpiarMate(el);
      el.textContent = tex;
      el.classList.add('mj-pend');
    }
    const ya = pendientes.get(el);
    if (ya) { ya.tex = tex; ya.display = display; ya.esperan.push(ok); }
    else pendientes.set(el, { tex, display, esperan: [ok], intentos: 0 });
    vaciarCola();
  });
}

/**
 * Vista previa en vivo: `pintar(tex, display)` espera `ms` sin cambios antes de componer (debounce) y descarta
 * resultados de peticiones superadas (resuelve null). `pintar.ahora(...)` salta la espera; `pintar.cerrar()` limpia.
 */
export function pintorEnVivo(el, ms = 150) {
  let temporizador = 0, ticket = 0, anterior = null;
  const lanzar = (tex, display) => {
    const mio = ++ticket;
    return renderMate(el, tex, display).then((r) => (mio === ticket ? r : null));
  };
  const pintar = (tex, display = false) => new Promise((ok) => {
    clearTimeout(temporizador);
    if (anterior) anterior(null);
    anterior = ok;
    temporizador = setTimeout(() => { anterior = null; lanzar(tex, display).then(ok); }, ms);
  });
  pintar.ahora = (tex, display = false) => {
    clearTimeout(temporizador);
    if (anterior) { anterior(null); anterior = null; }
    return lanzar(tex, display);
  };
  pintar.cerrar = () => {
    clearTimeout(temporizador); ticket++;
    if (anterior) { anterior(null); anterior = null; }
    pendientes.delete(el);
    limpiarMate(el);
  };
  return pintar;
}

// ── Síncrono (TikZ) ──────────────────────────────────────────────────────

function asegurarEstilos() {
  const mj = MJ();
  if (typeof document === 'undefined' || !mj?.chtmlStylesheet) return;
  const hoja = mj.chtmlStylesheet();            // trae también las reglas de los caracteres recién usados
  if (!hoja.isConnected) document.head.append(hoja);
}

/** Fórmula → cadena HTML de MathJax, sin esperar. null si MathJax aún no está listo o la fórmula falla. */
export function mateHtml(tex, display = false) {
  const mj = MJ();
  if (!mj || typeof mj.tex2chtml !== 'function' || !mj.startup?.adaptor) return null;
  try {
    const nodo = mj.tex2chtml(String(tex), { display });
    const html = mj.startup.adaptor.outerHTML(nodo);
    if (/<mjx-merror/.test(html)) return null;
    asegurarEstilos();
    return html;
  } catch { return null; }                      // p. ej. una extensión que todavía se está descargando
}
