// Banco de problemas · app principal.
// Dos vistas: lista de asignaturas (home) y problemas de una asignatura.

import { iniciarStore, sanearProblema, sanearNombreTema } from './store.js?v=2026.11.22-temas';
import { crearDiagramaTikZ, tipografiarMatematicas } from './render.js?v=2026.11.22-local';

const TEMA_KEY = 'banco-tema';

const el = (id) => document.getElementById(id);
const dom = {
  // vistas
  vistaAsig: el('vista-asignaturas'),
  vistaTemas: el('vista-temas'),
  vistaProb: el('vista-problemas'),
  grid: el('grid-asignaturas'),
  gridTemas: el('grid-temas'),
  // temas
  temaAsigNombre: el('tema-asig-nombre'),
  temaAsigDesc: el('tema-asig-desc'),
  btnNuevoTema: el('btn-nuevo-tema'),
  btnVolverAsig: el('btn-volver-asig'),
  // problemas
  probRuta: el('prob-ruta'),
  asigNombre: el('asig-nombre'),
  asigDesc: el('asig-descripcion'),
  buscador: el('buscador'),
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
  // tema (diálogo)
  dlgTema: el('dlg-tema'),
  dlgTemaTitulo: el('dlg-tema-titulo'),
  dlgTemaNombre: el('dlg-tema-nombre'),
  dlgTemaGuardar: el('dlg-tema-guardar'),
  dlgTemaCancelar: el('dlg-tema-cancelar'),
  // varios
  estadoNube: el('estado-nube'),
  themeToggle: el('theme-toggle'),
  tplAsig: el('tpl-asignatura'),
  tplTema: el('tpl-tema'),
  tplProb: el('tpl-problema'),
};

let store = null;
let asignaturas = [];
let problemas = [];          // todos los problemas de la asignatura abierta
let aidActual = null;        // asignatura abierta (en vista temas o problemas)
let temaActual = null;       // tema abierto (en vista problemas); null = solo en vista temas
let desuscribirProblemas = null;
let dlgModo = { tipo: 'crear', aid: null };
let dlgTemaModo = { tipo: 'crear', viejo: null };

/* ---------- Tema claro/oscuro ---------- */

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  dom.themeToggle.title = tema === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
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

function soloVista(cual) {
  dom.vistaAsig.hidden = cual !== 'asig';
  dom.vistaTemas.hidden = cual !== 'temas';
  dom.vistaProb.hidden = cual !== 'prob';
}

function mostrarAsignaturas() {
  aidActual = null;
  temaActual = null;
  if (desuscribirProblemas) { desuscribirProblemas(); desuscribirProblemas = null; }
  soloVista('asig');
  location.hash = '';
}

// Abre una asignatura: muestra sus temas. Se suscribe a los problemas para
// derivar la lista de temas y los conteos.
function abrirAsignatura(aid) {
  const asig = asignaturas.find((a) => a.id === aid);
  if (!asig) return;
  aidActual = aid;
  temaActual = null;
  dom.temaAsigNombre.textContent = asig.nombre;
  dom.temaAsigDesc.textContent = asig.descripcion || '';
  soloVista('temas');
  location.hash = '#' + encodeURIComponent(aid);

  if (desuscribirProblemas) desuscribirProblemas();
  problemas = [];
  renderTemas();
  desuscribirProblemas = store.suscribirProblemas(aid, (lista) => {
    problemas = lista;
    if (temaActual === null) renderTemas();
    else renderProblemas();
  });
}

// Abre un tema dentro de la asignatura actual: muestra sus problemas.
function abrirTema(nombre) {
  if (!aidActual) return;
  temaActual = nombre;
  const asig = asignaturas.find((a) => a.id === aidActual);
  dom.probRuta.textContent = asig ? asig.nombre : '';
  dom.asigNombre.textContent = nombre;
  dom.asigDesc.textContent = '';
  dom.buscador.value = '';
  dom.filtroDif.value = '';
  dom.mensaje.textContent = '';
  soloVista('prob');
  location.hash = '#' + encodeURIComponent(aidActual) + '/' + encodeURIComponent(nombre);
  renderProblemas();
}

function volverATemas() {
  temaActual = null;
  soloVista('temas');
  if (aidActual) location.hash = '#' + encodeURIComponent(aidActual);
  renderTemas();
}

// Lista de temas de la asignatura abierta = temas creados (array `temas`) +
// temas presentes en los problemas. Con el conteo de problemas de cada uno.
function temasDeAsignatura() {
  const asig = asignaturas.find((a) => a.id === aidActual);
  const conteo = new Map();
  for (const p of problemas) conteo.set(p.tema, (conteo.get(p.tema) || 0) + 1);
  const nombres = new Set(Array.isArray(asig?.temas) ? asig.temas : []);
  for (const t of conteo.keys()) nombres.add(t);
  return [...nombres]
    .sort((a, b) => a.localeCompare(b))
    .map((nombre) => ({ nombre, n: conteo.get(nombre) || 0 }));
}

/* ---------- Render: temas ---------- */

function renderTemas() {
  const temas = temasDeAsignatura();
  dom.gridTemas.innerHTML = '';
  if (temas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Esta asignatura aún no tiene temas. Crea el primero con “Nuevo tema”.';
    dom.gridTemas.appendChild(vacio);
    return;
  }
  for (const t of temas) {
    const nodo = dom.tplTema.content.cloneNode(true);
    nodo.querySelector('.card-asig-nombre').textContent = t.nombre;
    nodo.querySelector('.card-asig-meta').textContent =
      t.n === 0 ? 'Sin problemas' : `${t.n} problema${t.n === 1 ? '' : 's'}`;
    nodo.querySelector('.btn-abrir').addEventListener('click', () => abrirTema(t.nombre));
    nodo.querySelector('.btn-editar').addEventListener('click', () => abrirDialogoTemaEditar(t.nombre));
    nodo.querySelector('.btn-borrar').addEventListener('click', () => borrarTema(t));
    dom.gridTemas.appendChild(nodo);
  }
}

/* ---------- Diálogo tema ---------- */

function abrirDialogoTemaCrear() {
  dlgTemaModo = { tipo: 'crear', viejo: null };
  dom.dlgTemaTitulo.textContent = 'Nuevo tema';
  dom.dlgTemaNombre.value = '';
  dom.dlgTema.showModal();
  dom.dlgTemaNombre.focus();
}
function abrirDialogoTemaEditar(nombre) {
  dlgTemaModo = { tipo: 'editar', viejo: nombre };
  dom.dlgTemaTitulo.textContent = 'Renombrar tema';
  dom.dlgTemaNombre.value = nombre;
  dom.dlgTema.showModal();
  dom.dlgTemaNombre.focus();
}
async function guardarDialogoTema() {
  const nombre = sanearNombreTema(dom.dlgTemaNombre.value);
  if (!dom.dlgTemaNombre.value.trim()) { dom.dlgTemaNombre.focus(); return; }
  if (!store || !aidActual) return;
  dom.dlgTema.close();
  try {
    if (dlgTemaModo.tipo === 'crear') await store.agregarTema(aidActual, nombre);
    else if (dlgTemaModo.viejo !== nombre) await store.renombrarTema(aidActual, dlgTemaModo.viejo, nombre);
  } catch (e) {
    console.error(e);
    alert('No se pudo guardar el tema: ' + (e && e.message ? e.message : e));
  }
}
async function borrarTema(t) {
  const aviso = t.n > 0
    ? `¿Borrar el tema “${t.nombre}” y sus ${t.n} problema(s)? Afecta a todos y no se puede deshacer.`
    : `¿Borrar el tema “${t.nombre}”?`;
  if (!confirm(aviso)) return;
  try {
    await store.eliminarTema(aidActual, t.nombre);
    if (temaActual === t.nombre) volverATemas();
  } catch (e) {
    console.error(e);
    alert('No se pudo borrar el tema: ' + (e && e.message ? e.message : e));
  }
}

/* ---------- Render: asignaturas ---------- */

function renderAsignaturas() {
  dom.grid.innerHTML = '';
  if (asignaturas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'Aún no hay asignaturas. Crea la primera con “Nueva asignatura”.';
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
  if (!store) { alert('Todavía estamos conectando con el almacenamiento. Espera un momento e inténtalo de nuevo.'); return; }
  const datos = { nombre, descripcion: dom.dlgDesc.value.trim() };
  dom.dlg.close();
  try {
    if (dlgModo.tipo === 'crear') await store.crearAsignatura(datos);
    else await store.actualizarAsignatura(dlgModo.aid, datos);
  } catch (e) {
    console.error(e);
    alert('No se pudo guardar la asignatura: ' + (e && e.message ? e.message : e));
  }
}
async function borrarAsignatura(a) {
  if (!confirm(`¿Borrar la asignatura “${a.nombre}” y todos sus problemas? Esto afecta a todos los usuarios y no se puede deshacer.`)) return;
  await store.eliminarAsignatura(a.id);
  if (aidActual === a.id) mostrarAsignaturas();
}

/* ---------- Render: problemas ---------- */

// Problemas del tema abierto (temaActual), tras aplicar búsqueda y dificultad.
function problemasDelTema() {
  return problemas.filter((p) => p.tema === temaActual);
}

function problemasFiltrados() {
  const q = dom.buscador.value.trim().toLowerCase();
  const dif = dom.filtroDif.value;
  return problemasDelTema().filter((p) => {
    if (dif && p.dificultad !== dif) return false;
    if (q) {
      const texto = `${p.enunciado} ${p.fuente} ${p.respuesta}`.toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

function renderProblemas() {
  const delTema = problemasDelTema();
  const lista = problemasFiltrados();
  dom.lista.innerHTML = '';
  if (lista.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = delTema.length === 0
      ? 'Este tema aún no tiene problemas. Sube un archivo JSON para empezar.'
      : 'No hay problemas que coincidan con el filtro.';
    dom.lista.appendChild(vacio);
  } else {
    for (const p of lista) dom.lista.appendChild(crearTarjeta(p));
  }
  dom.contador.textContent = `Mostrando ${lista.length} de ${delTema.length} problema(s).`;
  tipografiarMatematicas();
}

function crearTarjeta(p) {
  const nodo = dom.tplProb.content.cloneNode(true);

  const chipDif = nodo.querySelector('.chip-dificultad');
  if (p.dificultad) {
    chipDif.textContent = p.dificultad.charAt(0).toUpperCase() + p.dificultad.slice(1);
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
    // Dentro de un tema, todos los problemas subidos se asignan a ese tema.
    if (temaActual) total = total.map((p) => ({ ...p, tema: temaActual }));
    mostrarMensaje(`Subiendo ${total.length} problema(s)…`, '');
    try {
      await store.agregarProblemas(aidActual, total);
      mostrarMensaje(
        `Se agregaron ${total.length} problema(s) a “${temaActual}”.` + (errores.length ? ' Con avisos: ' + errores.join('; ') : ''),
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
  const delTema = problemasDelTema();
  const salida = {
    formato: 'banco-problemas-v1',
    asignatura: asig ? asig.nombre : '',
    tema: temaActual || '',
    problemas: delTema.map(({ id, orden, creado, ...p }) => p),
  };
  const blob = new Blob([JSON.stringify(salida, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base = `${asig ? asig.nombre : 'asignatura'}-${temaActual || 'tema'}`.replace(/[^\w.-]+/g, '_');
  a.download = base + '.json';
  a.click();
  URL.revokeObjectURL(url);
  mostrarMensaje(`Exportados ${delTema.length} problema(s) del tema “${temaActual}”.`, 'ok');
}

/* ---------- Eventos ---------- */

function enlazarEventos() {
  dom.btnNueva.addEventListener('click', abrirDialogoCrear);
  dom.dlgGuardar.addEventListener('click', guardarDialogo);
  dom.dlgCancelar.addEventListener('click', () => dom.dlg.close());
  dom.dlgNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarDialogo(); } });

  // Temas
  dom.btnNuevoTema.addEventListener('click', abrirDialogoTemaCrear);
  dom.btnVolverAsig.addEventListener('click', mostrarAsignaturas);
  dom.dlgTemaGuardar.addEventListener('click', guardarDialogoTema);
  dom.dlgTemaCancelar.addEventListener('click', () => dom.dlgTema.close());
  dom.dlgTemaNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarDialogoTema(); } });

  dom.btnVolver.addEventListener('click', volverATemas);

  dom.buscador.addEventListener('input', renderProblemas);
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

  dom.estadoNube.textContent = 'Conectando…';
  dom.estadoNube.dataset.modo = 'conectando';
  renderAsignaturas(); // pinta el estado vacío de inmediato

  const { store: s, aviso } = await iniciarStore();
  store = s;
  dom.estadoNube.textContent = store.modo === 'firebase' ? 'En la nube' : 'Solo este navegador';
  dom.estadoNube.dataset.modo = store.modo;
  if (aviso) mostrarMensaje(aviso, 'error');

  let arranqueHash = false;
  store.suscribirAsignaturas((lista) => {
    asignaturas = lista;
    renderAsignaturas();

    if (aidActual) {
      const a = asignaturas.find((x) => x.id === aidActual);
      if (!a) { mostrarAsignaturas(); return; } // la asignatura fue borrada
      // Refrescar cabeceras y la lista de temas (p. ej. si cambió `temas`).
      dom.temaAsigNombre.textContent = a.nombre;
      dom.temaAsigDesc.textContent = a.descripcion || '';
      if (temaActual === null) renderTemas();
    } else if (!arranqueHash) {
      // Primera carga: abrir directamente desde el hash #aid o #aid/tema.
      arranqueHash = true;
      const partes = location.hash.slice(1).split('/');
      const aid = decodeURIComponent(partes[0] || '');
      const tema = partes[1] != null ? decodeURIComponent(partes[1]) : null;
      if (aid && asignaturas.some((x) => x.id === aid)) {
        abrirAsignatura(aid);
        if (tema) abrirTema(tema);
      }
    }
  });
}

iniciar();
