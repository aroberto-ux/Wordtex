// Pestaña «Código»: el documento como LaTeX, editable. Lo que se escribe aquí se interpreta y
// pasa a la vista visual (y al revés). Lo que no se entiende se conserva como «LaTeX avanzado».

import { S, E } from './estado.js?v=2026.11.06-c';
import { generarTex } from './latex-gen.js?v=2026.11.06-c';
import { parsearTex } from './latex-parse.js?v=2026.11.06-c';
import { diffBloques } from './sync.js?v=2026.11.06-c';
import { aplicarCambios, guardarPendientes, bus } from './ops.js?v=2026.11.06-c';
import { resaltarTex } from './resaltar.js?v=2026.11.06-c';

let tPeg = null, tGen = null;
let aplicando = false;
// Último texto que se escribió desde el modelo o que ya se aplicó. Si el área de código sigue igual, no se
// vuelve a interpretar: así entrar y salir de la vista de código nunca cambia el documento.
let ultimoAplicado = null;

export function textoActual() {
  return generarTex({ cfg: S.doc.cfg, biblio: S.doc.biblio, extra: S.doc.extra }, S.bloques).tex;
}

// Coloreado: un <pre> con el mismo texto (coloreado) va DEBAJO del textarea, que se vuelve transparente.
let preResalte = null, textoResaltado = null, rafResalte = 0;

function montarResalte() {
  const ta = E.codigoTa;
  const cont = document.createElement('div');
  cont.className = 'resalte';
  preResalte = document.createElement('pre');
  preResalte.className = 'codigo-resalte';
  preResalte.setAttribute('aria-hidden', 'true');
  ta.parentElement.insertBefore(cont, ta);
  cont.append(preResalte, ta);
}

function sincronizarResalte() {
  if (!preResalte) return;
  const ta = E.codigoTa;
  if (textoResaltado !== ta.value) {
    textoResaltado = ta.value;
    preResalte.innerHTML = resaltarTex(textoResaltado) + '\n'; // el \n final iguala la altura de la última línea
  }
  preResalte.scrollTop = ta.scrollTop;
  preResalte.scrollLeft = ta.scrollLeft;
}

function programarResalte() {
  if (rafResalte) return;
  rafResalte = requestAnimationFrame(() => { rafResalte = 0; sincronizarResalte(); });
}

function gutter() {
  programarResalte();
  const n = (E.codigoTa.value.match(/\n/g) || []).length + 1;
  if (E.codigoGutter.dataset.n !== String(n)) {
    E.codigoGutter.dataset.n = String(n);
    E.codigoGutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  }
  E.codigoGutter.scrollTop = E.codigoTa.scrollTop;
}

export function mostrarAvisos(lista, error) {
  const a = E.codigoAvisos;
  a.replaceChildren();
  a.hidden = !lista.length && !error;
  if (error) { const d = document.createElement('div'); d.className = 'aviso-cod err'; d.textContent = error; a.append(d); }
  for (const t of lista) { const d = document.createElement('div'); d.className = 'aviso-cod'; d.textContent = '⚠ ' + t; a.append(d); }
}

/** Regenera el texto a partir del modelo (si no se está escribiendo ahí). */
export function actualizarCodigo(forzar = false) {
  if (S.vista === 'visual' || !S.doc) return;
  if (!forzar && document.activeElement === E.codigoTa) return;
  const t = textoActual();
  if (E.codigoTa.value !== t) { E.codigoTa.value = t; }
  ultimoAplicado = t;
  gutter();
  if (forzar || document.activeElement !== E.codigoTa) mostrarAvisos([]);
}

export function programarActualizacion() {
  if (S.vista === 'visual' || aplicando) return;
  clearTimeout(tGen);
  tGen = setTimeout(() => actualizarCodigo(), 250);
}

function aplicarTexto() {
  const texto = E.codigoTa.value;
  if (texto === ultimoAplicado) return;
  let m;
  try { m = parsearTex(texto); } catch (e) { console.error(e); mostrarAvisos([], 'No se pudo interpretar el código.'); return; }
  aplicando = true;
  try {
    guardarPendientes(true);
    const completo = /\\begin\{document\}/.test(texto);
    if (completo) {
      const parche = {};
      for (const [k, v] of Object.entries(m.cfg)) if (S.doc.cfg[k] !== v) parche['cfg.' + k] = v;
      if (JSON.stringify(m.biblio) !== JSON.stringify(S.doc.biblio)) parche.biblio = m.biblio;
      if (m.extra !== S.doc.extra) parche.extra = m.extra;
      if (Object.keys(parche).length) {
        S.store.actualizarDocumento(S.did, parche);
        for (const [k, v] of Object.entries(parche)) { if (k.startsWith('cfg.')) S.doc.cfg[k.slice(4)] = v; else S.doc[k] = v; }
        bus.dispatchEvent(new CustomEvent('doc'));
      }
    }
    const nuevos = m.bloques.length ? m.bloques : [{ t: 'p', c: [], al: 'j' }];
    const d = diffBloques(S.bloques, nuevos);
    if (d.crear.length || d.actualizar.length || d.eliminar.length || d.mover.length) aplicarCambios(null, { diff: d });
    mostrarAvisos(m.avisos);
    ultimoAplicado = texto;
  } finally { aplicando = false; }
}

export function iniciarCodigo() {
  montarResalte();
  E.codigoTa.addEventListener('input', () => {
    gutter();
    clearTimeout(tPeg);
    tPeg = setTimeout(aplicarTexto, 650);
  });
  E.codigoTa.addEventListener('scroll', gutter);
  E.codigoTa.addEventListener('blur', () => { clearTimeout(tPeg); aplicarTexto(); setTimeout(() => actualizarCodigo(true), 0); });
  E.codigoTa.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  });
  bus.addEventListener('cambio', programarActualizacion);
  bus.addEventListener('doc', programarActualizacion);
}
