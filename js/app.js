// Banco de problemas · app principal.
// Dos vistas: lista de asignaturas (home) y problemas de una asignatura.

import { iniciarStore, sanearProblema } from './store.js';
import { crearDiagramaTikZ, tipografiarMatematicas } from './render.js';

const DIFICULTADES = ['baja', 'media', 'alta'];
const TEMA_KEY = 'banco-tema';

const el = (id) => document.getElementById(id);
const dom = {
  // vistas
  vistaAsig: el('vista-asignaturas'),
  vistaProb: el('vista-problemas'),
  grid: el('grid-asignaturas'),
  // problemas
  asigNombre: el('asig-nombre'),
  asigDesc: el('asig-descripcion'),
  buscador: el('buscador'),
  filtroTema: el('filtro-tema'),
  filtroDif: el('filtro-dificultad'),
  dropzone: el('dropzone'),
  fileInput: el('file-input'),
  btnExportar: el('btn-exportar'),
  btnVolver: el('btn-volver'),
  mensaje: el('mensaje'),
  contador: el('contador'),
  lista: el('lista'),
  // asignatura
  btnNueva: el('btn-nueva-asig'),
  dlg: el('dlg-asig'),
  dlgTitulo: el('dlg-asig-titulo'),
  dlgNombre: el('dlg-asig-nombre'),
  dlgDesc: el('dlg-asig-desc'),
  dlgGuardar: el('dlg-asig-guardar'),
  dlgCancelar: el('dlg-asig-cancelar'),
  // varios
  estadoNube: el('estado-nube'),
  themeToggle: el('theme-toggle'),
  tplAsig: el('tpl-asignatura'),
  tplProb: el('tpl-problema'),
};

let store = null;
let asignaturas = [];
let problemas = [];
let aidActual = null;
let desuscribirProblemas = null;
let dlgModo = { tipo: 'crear', aid: null };

/* ---------- Tema claro/oscuro ---------- */

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  dom.themeToggle.textContent = tema === 'claro' ? '☀️' : '🌙';
  try { localStorage.setItem(TEMA_KEY, tema); } catch { /* ignore */ }
}
function iniciarTema() {
  let guardado = null;
  try { guardado = localStorage.getItem(TEMA_KEY); } catch { /* ignore */ }
  const claro = window.matchMedia('(prefers-color-scheme: light)').matches;
  aplicarTema(guardado || (claro ? 'claro' : 'oscuro'));
  dom.themeToggle.addEventListener('click', () => {
    aplicarTema(document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro');
  });
}

/* ---------- Navegación entre vistas ---------- */

function mostrarAsignaturas() {
  aidActual = null;
  if (desuscribirProblemas) { desuscribirProblemas(); desuscribirProblemas = null; }
  dom.vistaProb.hidden = true;
  dom.vistaAsig.hidden = false;
  location.hash = '';
}

function abrirAsignatura(aid) {
  const asig = asignaturas.find((a) => a.id === aid);
  if (!asig) return;
  aidActual = aid;
  dom.asigNombre.textContent = asig.nombre;
  dom.asigDesc.textContent = asig.descripcion || '';
  dom.buscador.value = '';
  dom.filtroTema.value = '';
  dom.filtroDif.value = '';
  dom.mensaje.textContent = '';
  dom.vistaAsig.hidden = true;
  dom.vistaProb.hidden = false;
  location.hash = '#' + encodeURIComponent(aid);

  if (desuscribirProblemas) desuscribirProblemas();
  problemas = [];
  renderProblemas();
  desuscribirProblemas = store.suscribirProblemas(aid, (lista) => {
    problemas = lista;
    refrescarTemas();
    renderProblemas();
  });
}

/* ---------- Render: asignaturas ---------- */

function renderAsignaturas() {
  dom.grid.innerHTML = '';
  if (asignaturas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Aún no hay asignaturas. Crea la primera con “+ Nueva asignatura”.';
    dom.grid.appendChild(vacio);
    return;
  }
  for (const a of asignaturas) {
    const nodo = dom.tplAsig.content.cloneNode(true);
    nodo.querySelector('.card-asig-nombre').textContent = a.nombre;
    const desc = nodo.querySelector('.card-asig-desc');
    if (a.descripcion) desc.textContent = a.descripcion; else desc.remove();
    nodo.querySelector('.card-asig-meta').textContent =
      'Actualizada ' + fechaRelativa(a.actualizado);
    nodo.querySelector('.btn-abrir').addEventListener('click', () => abrirAsignatura(a.id));
    nodo.querySelector('.btn-editar').addEventListener('click', () => abrirDialogoEditar(a));
    nodo.querySelector('.btn-borrar').addEventListener('click', () => borrarAsignatura(a));
    dom.grid.appendChild(nodo);
  }
}

function fechaRelativa(ts) {
  if (!ts) return 'hace poco';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} día(s)`;
}

/* ---------- Diálogo asignatura ---------- */

function abrirDialogoCrear() {
  dlgModo = { tipo: 'crear', aid: null };
  dom.dlgTitulo.textContent = 'Nueva asignatura';
  dom.dlgNombre.value = '';
  dom.dlgDesc.value = '';
  dom.dlg.showModal();
  dom.dlgNombre.focus();
}
function abrirDialogoEditar(a) {
  dlgModo = { tipo: 'editar', aid: a.id };
  dom.dlgTitulo.textContent = 'Editar asignatura';
  dom.dlgNombre.value = a.nombre;
  dom.dlgDesc.value = a.descripcion || '';
  dom.dlg.showModal();
  dom.dlgNombre.focus();
}
async function guardarDialogo() {
  const nombre = dom.dlgNombre.value.trim();
  if (!nombre) { dom.dlgNombre.focus(); return; }
  const datos = { nombre, descripcion: dom.dlgDesc.value.trim() };
  dom.dlg.close();
  if (dlgModo.tipo === 'crear') await store.crearAsignatura(datos);
  else await store.actualizarAsignatura(dlgModo.aid, datos);
}
async function borrarAsignatura(a) {
  if (!confirm(`¿Borrar la asignatura “${a.nombre}” y todos sus problemas? Esto afecta a todos los usuarios y no se puede deshacer.`)) return;
  await store.eliminarAsignatura(a.id);
  if (aidActual === a.id) mostrarAsignaturas();
}

/* ---------- Render: problemas ---------- */

function problemasFiltrados() {
  const q = dom.buscador.value.trim().toLowerCase();
  const tema = dom.filtroTema.value;
  const dif = dom.filtroDif.value;
  return problemas.filter((p) => {
    if (tema && p.tema !== tema) return false;
    if (dif && p.dificultad !== dif) return false;
    if (q) {
      const texto = `${p.enunciado} ${p.tema} ${p.fuente} ${p.respuesta}`.toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

function renderProblemas() {
  const lista = problemasFiltrados();
  dom.lista.innerHTML = '';
  if (lista.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = problemas.length === 0
      ? 'Esta asignatura aún no tiene problemas. Sube un archivo JSON para empezar.'
      : 'No hay problemas que coincidan con el filtro.';
    dom.lista.appendChild(vacio);
  } else {
    for (const p of lista) dom.lista.appendChild(crearTarjeta(p));
  }
  dom.contador.textContent = `Mostrando ${lista.length} de ${problemas.length} problema(s).`;
  tipografiarMatematicas();
}

function crearTarjeta(p) {
  const nodo = dom.tplProb.content.cloneNode(true);
  nodo.querySelector('.chip-tema').textContent = p.tema;

  const chipDif = nodo.querySelector('.chip-dificultad');
  if (p.dificultad) {
    chipDif.textContent = 'Dificultad: ' + p.dificultad;
    chipDif.dataset.nivel = p.dificultad;
  } else {
    chipDif.remove();
  }

  nodo.querySelector('.btn-eliminar-prob').addEventListener('click', async () => {
    if (confirm('¿Eliminar este problema? Afecta a todos los usuarios.')) {
      await store.eliminarProblema(aidActual, p.id);
    }
  });

  nodo.querySelector('.problema-enunciado').textContent = p.enunciado;

  const contDiagEnun = nodo.querySelector('.problema-diagrama-enunciado');
  if (p.diagrama) contDiagEnun.appendChild(crearDiagramaTikZ(p.diagrama));
  else contDiagEnun.remove();

  const resp = nodo.querySelector('.problema-respuesta');
  const btn = nodo.querySelector('.btn-revelar');
  const tieneRespuesta = p.respuesta || p.diagrama_respuesta;
  if (tieneRespuesta) {
    nodo.querySelector('.respuesta-texto').textContent = p.respuesta || '';
    const contDiagResp = nodo.querySelector('.problema-diagrama-respuesta');
    if (p.diagrama_respuesta) contDiagResp.appendChild(crearDiagramaTikZ(p.diagrama_respuesta));
    else contDiagResp.remove();
    btn.addEventListener('click', () => {
      const oculto = resp.hasAttribute('hidden');
      if (oculto) { resp.removeAttribute('hidden'); btn.textContent = 'Ocultar respuesta'; tipografiarMatematicas(resp); }
      else { resp.setAttribute('hidden', ''); btn.textContent = 'Mostrar respuesta'; }
    });
  } else {
    btn.disabled = true;
    btn.textContent = 'Sin respuesta';
    resp.remove();
  }

  nodo.querySelector('.problema-fuente').textContent = p.fuente ? 'Fuente: ' + p.fuente : '';
  return nodo;
}

function refrescarTemas() {
  const temas = [...new Set(problemas.map((p) => p.tema))].sort((a, b) => a.localeCompare(b));
  const actual = dom.filtroTema.value;
  dom.filtroTema.innerHTML = '<option value="">Todos los temas</option>';
  for (const t of temas) {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    dom.filtroTema.appendChild(opt);
  }
  if (temas.includes(actual)) dom.filtroTema.value = actual;
}

/* ---------- Subir / exportar JSON ---------- */

// Acepta: lista de problemas, un problema suelto, o un objeto { problemas: [...] }.
function extraerProblemas(datos) {
  let arr;
  if (Array.isArray(datos)) arr = datos;
  else if (datos && Array.isArray(datos.problemas)) arr = datos.problemas;
  else if (datos && typeof datos === 'object') arr = [datos];
  else arr = [];
  return arr
    .filter((p) => p && typeof p === 'object')
    .map(sanearProblema)
    .filter((p) => p.enunciado);
}

async function manejarArchivos(fileList) {
  const archivos = [...fileList].filter((f) => /\.json$/i.test(f.name) || f.type.includes('json'));
  if (archivos.length === 0) { mostrarMensaje('Solo se aceptan archivos .json.', 'error'); return; }

  let total = [];
  const errores = [];
  for (const archivo of archivos) {
    try {
      const datos = JSON.parse(await archivo.text());
      const nuevos = extraerProblemas(datos);
      if (nuevos.length === 0) errores.push(`${archivo.name}: sin problemas válidos`);
      else total = total.concat(nuevos);
    } catch {
      errores.push(`${archivo.name}: JSON inválido`);
    }
  }

  if (total.length) {
    mostrarMensaje(`Subiendo ${total.length} problema(s)…`, '');
    try {
      await store.agregarProblemas(aidActual, total);
      mostrarMensaje(
        `Se agregaron ${total.length} problema(s).` + (errores.length ? ' Con avisos: ' + errores.join('; ') : ''),
        'ok'
      );
    } catch (e) {
      console.error(e);
      mostrarMensaje('Error al guardar en la nube: ' + (e && e.message ? e.message : e), 'error');
    }
  } else {
    mostrarMensaje('No se agregó nada. ' + errores.join('; '), 'error');
  }
}

function mostrarMensaje(texto, tipo) {
  dom.mensaje.textContent = texto;
  dom.mensaje.className = 'mensaje ' + (tipo || '');
}

function exportar() {
  const asig = asignaturas.find((a) => a.id === aidActual);
  const salida = {
    formato: 'banco-problemas-v1',
    asignatura: asig ? asig.nombre : '',
    problemas: problemas.map(({ id, orden, creado, ...p }) => p),
  };
  const blob = new Blob([JSON.stringify(salida, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (asig ? asig.nombre.replace(/[^\w.-]+/g, '_') : 'problemas') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  mostrarMensaje(`Exportados ${problemas.length} problema(s).`, 'ok');
}

/* ---------- Eventos ---------- */

function enlazarEventos() {
  dom.btnNueva.addEventListener('click', abrirDialogoCrear);
  dom.dlgGuardar.addEventListener('click', guardarDialogo);
  dom.dlgCancelar.addEventListener('click', () => dom.dlg.close());
  dom.dlgNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarDialogo(); } });

  dom.btnVolver.addEventListener('click', mostrarAsignaturas);

  dom.buscador.addEventListener('input', renderProblemas);
  dom.filtroTema.addEventListener('change', renderProblemas);
  dom.filtroDif.addEventListener('change', renderProblemas);

  dom.dropzone.addEventListener('click', () => dom.fileInput.click());
  dom.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom.fileInput.click(); }
  });
  dom.fileInput.addEventListener('change', (e) => { manejarArchivos(e.target.files); dom.fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => dom.dropzone.addEventListener(ev, (e) => { e.preventDefault(); dom.dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => dom.dropzone.addEventListener(ev, (e) => { e.preventDefault(); dom.dropzone.classList.remove('dragover'); }));
  dom.dropzone.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) manejarArchivos(e.dataTransfer.files); });

  dom.btnExportar.addEventListener('click', exportar);
}

/* ---------- Arranque ---------- */

async function iniciar() {
  iniciarTema();
  enlazarEventos();

  const { store: s, aviso } = await iniciarStore();
  store = s;
  dom.estadoNube.textContent = store.modo === 'firebase' ? '☁️ En la nube' : '💾 Solo este navegador';
  dom.estadoNube.dataset.modo = store.modo;
  if (aviso) mostrarMensaje(aviso, 'error');

  store.suscribirAsignaturas((lista) => {
    asignaturas = lista;
    renderAsignaturas();
    // Si estamos dentro de una asignatura, refrescar su cabecera.
    if (aidActual) {
      const a = asignaturas.find((x) => x.id === aidActual);
      if (a) { dom.asigNombre.textContent = a.nombre; dom.asigDesc.textContent = a.descripcion || ''; }
      else mostrarAsignaturas(); // fue borrada
    } else {
      // Abrir directamente si el hash apunta a una asignatura existente.
      const hash = decodeURIComponent(location.hash.slice(1));
      if (hash && asignaturas.some((x) => x.id === hash)) abrirAsignatura(hash);
    }
  });
}

iniciar();
