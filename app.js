// Arranque y enrutador por hash:
//   #documentos          → lista
//   #documentos/<id>     → editor

import { S, E } from './estado.js?v=2026.11.07-n';
import { iniciarStore } from './store.js?v=2026.11.07-n';
import { opciones } from './firebase-config.js?v=2026.11.07-n';
import { $, aviso, h } from './ui.js?v=2026.11.07-n';
import { VERSION } from './version.js?v=2026.11.07-n';
import { entrarLista, salirLista } from './lista.js?v=2026.11.07-n';
import { entrarEditor, salirEditor } from './editor.js?v=2026.11.07-n';

function referencias() {
  Object.assign(E, {
    vistaLogin: $('#vista-login'), vistaLista: $('#vista-lista'), vistaEditor: $('#vista-editor'),
    rejilla: $('#rejilla'), listaVacia: $('#lista-vacia'), inputImportar: $('#input-importar'),
    titulo: $('#ed-titulo'), estado: $('#ed-estado'), presencia: $('#ed-presencia'),
    btnDeshacer: $('#btn-deshacer'), btnRehacer: $('#btn-rehacer'), btnExportar: $('#btn-exportar'),
    cinta: $('#cinta'), cintaTabla: $('#cinta-tabla'), cintaFig: $('#cinta-fig'), selEstilo: $('#sel-estilo'),
    tbBorde: $('#tb-borde'), figAncho: $('#fig-ancho'), figAnchoVal: $('#fig-ancho-val'),
    cuerpo: $('#ed-cuerpo'), zonaVisual: $('#zona-visual'), hoja: $('#hoja'), relleno: $('#hoja-relleno'),
    portada: $('#portada'), pTitulo: $('#p-titulo'), pAutor: $('#p-autor'), pFecha: $('#p-fecha'), bloques: $('#bloques'),
    zonaCodigo: $('#zona-codigo'), codigoTa: $('#codigo-ta'), codigoGutter: $('#codigo-gutter'), codigoAvisos: $('#codigo-avisos'),
    panel: $('#panel'), panelTabs: $('#panel-tabs'), panelCuerpo: $('#panel-cuerpo'),
  });
}

function ruta() {
  const partes = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const [vista, id] = partes;
  if (vista === 'documentos' && id) return { vista: 'editor', id };
  return { vista: 'lista' };
}

function enrutar() {
  if (S.store.necesitaLogin) { salirLista(); salirEditor(); E.vistaLogin.hidden = false; return; }
  E.vistaLogin.hidden = true;
  const r = ruta();
  if (r.vista === 'editor') { salirLista(); entrarEditor(r.id); }
  else { salirEditor(); entrarLista(); }
}

// ── Aviso visible de errores (para saber qué falla sin abrir la consola) ──
let totalFallos = 0;
function mostrarFallo(msg, detalle = '') {
  if (/ResizeObserver loop/i.test(msg)) return;
  totalFallos++;
  let b = document.getElementById('fallo');
  if (!b) { b = h('div', { id: 'fallo', class: 'fallo', role: 'alert' }); document.body.prepend(b); }
  const texto = `Algo falló: ${msg}`;
  const completo = `${texto}\nVersión: ${VERSION}\nNavegador: ${navigator.userAgent}\nPágina: ${location.href}\n${detalle}`;
  b.replaceChildren(
    h('span', { class: 'fallo-msg' }, texto + (totalFallos > 1 ? ` (+${totalFallos - 1} más)` : '')),
    h('span', { class: 'fallo-v' }, `versión ${VERSION}`),
    h('button', { class: 'btn', onclick: (ev) => { if (navigator.clipboard) navigator.clipboard.writeText(completo).then(() => { ev.target.textContent = 'Copiado'; }); } }, 'Copiar detalle'),
    h('button', { class: 'btn', onclick: () => location.reload() }, 'Recargar'),
    h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => { b.remove(); totalFallos = 0; } }, '×'),
  );
}
addEventListener('error', (ev) => mostrarFallo(ev.message || 'error desconocido', ev.error && ev.error.stack ? ev.error.stack : `${ev.filename}:${ev.lineno}`));
addEventListener('unhandledrejection', (ev) => { const r = ev.reason; mostrarFallo(String((r && r.message) || r), r && r.stack ? r.stack : ''); });

// ── Tema claro / oscuro ──────────────────────────────────────────────────
// Tres estados: 'sistema' (sigue al SO), 'claro' y 'oscuro'. Se guarda la elección y, en el head,
// un script la aplica antes de pintar para que no haya parpadeo.
const TEMAS = ['sistema', 'claro', 'oscuro'];
const ICONO_TEMA = { sistema: '🖥', claro: '☀', oscuro: '🌙' };
function temaGuardado() {
  try { const t = localStorage.getItem('lv.tema'); return TEMAS.includes(t) ? t : 'sistema'; } catch { return 'sistema'; }
}
function aplicarTema(t) {
  if (t === 'sistema') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
  try { if (t === 'sistema') localStorage.removeItem('lv.tema'); else localStorage.setItem('lv.tema', t); } catch { /* ignorar */ }
  const btn = document.getElementById('btn-tema');
  if (btn) { btn.textContent = ICONO_TEMA[t]; btn.title = `Tema: ${t === 'sistema' ? 'del sistema' : t} (clic para cambiar)`; }
}
function iniciarTema() {
  const btn = document.getElementById('btn-tema');
  if (!btn) return;
  aplicarTema(temaGuardado());
  btn.addEventListener('click', () => { const i = TEMAS.indexOf(temaGuardado()); aplicarTema(TEMAS[(i + 1) % TEMAS.length]); });
}

async function arrancar() {
  referencias();
  iniciarTema();
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta && meta.content !== VERSION) mostrarFallo(`el navegador tiene archivos de dos versiones (${meta.content} y ${VERSION}). Recarga con Ctrl+Shift+R.`);
  document.getElementById('lista-titulo').textContent = opciones.titulo || 'Documentos LaTeX';
  try { S.store = await iniciarStore(); }
  catch (e) { console.error(e); document.body.textContent = 'No se pudo iniciar la aplicación: ' + (e && e.message ? e.message : e); return; }
  const vEl = document.getElementById('version');
  if (vEl) vEl.textContent = `Versión ${VERSION} · ${S.store.modo === 'firebase' ? 'conectado a Firebase' : 'modo local (sin Firebase)'}`;
  if (S.store.modo === 'local') {
    let cerrado = false;
    try { cerrado = sessionStorage.getItem('lv.bannerCerrado') === '1'; } catch { /* ignorar */ }
    $('#banner-local').hidden = cerrado;
    $('#banner-cerrar').addEventListener('click', () => { $('#banner-local').hidden = true; try { sessionStorage.setItem('lv.bannerCerrado', '1'); } catch { /* ignorar */ } });
    if (S.store.errorFirebase) aviso('No se pudo conectar con Firebase; se usa el modo local. Revisa firebase-config.js.', 'error', 7000);
  }
  $('#btn-google').addEventListener('click', async () => {
    try { await S.store.iniciarSesionGoogle(); location.reload(); } catch (e) { aviso('No se pudo iniciar sesión: ' + (e.message || e), 'error', 5000); }
  });
  addEventListener('hashchange', enrutar);
  enrutar();
}

arrancar();
