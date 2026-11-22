// Banco de problemas · app principal.
// Vistas: asignaturas → temas → problemas, más el modo estudio.

import { iniciarStore, sanearProblema, sanearNombreTema, leerRespaldo } from './store.js?v=2026.11.22-mejoras';
import { crearDiagramaTikZ, tipografiarMatematicas } from './render.js?v=2026.11.22-mejoras';
import { avisar, confirmar, normalizar, esFavorito, alternarFavorito } from './ui.js?v=2026.11.22-mejoras';

const TEMA_KEY = 'banco-tema';
const NUEVO = '__nuevo__';
const POR_PAGINA = 25;

const el = (id) => document.getElementById(id);
const dom = {
  // vistas
  vistaAsig: el('vista-asignaturas'),
  vistaTemas: el('vista-temas'),
  vistaProb: el('vista-problemas'),
  vistaEstudio: el('vista-estudio'),
  grid: el('grid-asignaturas'),
  gridTemas: el('grid-temas'),
  // sesión
  sesionChip: el('sesion-chip'),
  btnLogin: el('btn-login'),
  btnLogout: el('btn-logout'),
  banner: el('banner-acceso'),
  // home
  h1Asig: el('h1-asig'),
  buscadorBanco: el('buscador-banco'),
  resBanco: el('resultados-banco'),
  resBancoInfo: el('resultados-banco-info'),
  resBancoLista: el('resultados-banco-lista'),
  btnExportarTodo: el('btn-exportar-todo'),
  btnImportarResp: el('btn-importar-respaldo'),
  fileRespaldo: el('file-respaldo'),
  btnPapeleraAsig: el('btn-papelera-asig'),
  // temas
  temaAsigNombre: el('tema-asig-nombre'),
  temaAsigDesc: el('tema-asig-desc'),
  btnNuevoTema: el('btn-nuevo-tema'),
  btnVolverAsig: el('btn-volver-asig'),
  buscadorAsig: el('buscador-asig'),
  resAsig: el('resultados-asig'),
  resAsigInfo: el('resultados-asig-info'),
  resAsigLista: el('resultados-asig-lista'),
  btnEstudiarAsig: el('btn-estudiar-asig'),
  btnPapeleraProb: el('btn-papelera-prob'),
  // problemas
  probRuta: el('prob-ruta'),
  asigNombre: el('asig-nombre'),
  asigDesc: el('asig-descripcion'),
  buscador: el('buscador'),
  filtroDif: el('filtro-dificultad'),
  filtroFav: el('filtro-fav'),
  dropzone: el('dropzone'),
  fileInput: el('file-input'),
  btnExportar: el('btn-exportar'),
  btnNuevoProb: el('btn-nuevo-prob'),
  btnEstudiarTema: el('btn-estudiar-tema'),
  btnVolver: el('btn-volver'),
  mensaje: el('mensaje'),
  contador: el('contador'),
  lista: el('lista'),
  // estudio
  btnVolverEstudio: el('btn-volver-estudio'),
  estudioRuta: el('estudio-ruta'),
  estudioTitulo: el('estudio-titulo'),
  estudioDif: el('estudio-dif'),
  estudioFav: el('estudio-fav'),
  estudioBarajar: el('btn-estudio-barajar'),
  estudioProgreso: el('estudio-progreso'),
  estudioTarjeta: el('estudio-tarjeta'),
  // asignatura (diálogo)
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
  // problema (diálogo)
  dlgProblema: el('dlg-problema'),
  dpTitulo: el('dp-titulo'),
  dpTema: el('dp-tema'),
  dpTemaNuevoFila: el('dp-tema-nuevo-fila'),
  dpTemaNuevo: el('dp-tema-nuevo'),
  dpDif: el('dp-dif'),
  dpEnunciado: el('dp-enunciado'),
  dpDiagrama: el('dp-diagrama'),
  dpRespuesta: el('dp-respuesta'),
  dpDiagramaResp: el('dp-diagrama-resp'),
  dpFuente: el('dp-fuente'),
  dpVista: el('dp-vista'),
  dpGuardar: el('dp-guardar'),
  dpCancelar: el('dp-cancelar'),
  // mover (diálogo)
  dlgMover: el('dlg-mover'),
  dmTema: el('dm-tema'),
  dmNuevoFila: el('dm-nuevo-fila'),
  dmNuevo: el('dm-nuevo'),
  dmGuardar: el('dm-guardar'),
  dmCancelar: el('dm-cancelar'),
  // papelera (diálogo)
  dlgPap: el('dlg-papelera'),
  papSub: el('pap-sub'),
  papLista: el('pap-lista'),
  papCerrar: el('pap-cerrar'),
  // varios
  estadoNube: el('estado-nube'),
  themeToggle: el('theme-toggle'),
  tplAsig: el('tpl-asignatura'),
  tplTema: el('tpl-tema'),
  tplProb: el('tpl-problema'),
};

let store = null;
let sesion = { puedeEditar: false, usuario: null, soportaLogin: false, sinConfig: false };
let asignaturasTodas = [];   // incluye las de la papelera
let asignaturas = [];        // solo activas
let problemas = [];          // activos de la asignatura abierta
let papeleraProb = [];       // problemas borrados de la asignatura abierta
let aidActual = null;
let temaActual = null;
let vista = 'asig';          // asig | temas | prob | estudio
let desuscribirProblemas = null;
let dlgModo = { tipo: 'crear', aid: null };
let dlgTemaModo = { tipo: 'crear', viejo: null };
let papeleraTipo = 'asig';

/* ---------- Utilidades ---------- */

// Ejecuta una operación de datos y traduce los errores a un aviso.
async function intentar(fn, prefijo) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    const crudo = String((e && (e.code || '')) + ' ' + (e && e.message ? e.message : e));
    const msg = /permission|insufficient|PERMISSION_DENIED/i.test(crudo)
      ? 'tu cuenta no tiene permiso para hacer este cambio.'
      : (e && e.message ? e.message : String(e));
    avisar(`${prefijo}: ${msg}`, { tipo: 'error' });
    return undefined;
  }
}

function exigirEdicion() {
  if (sesion.puedeEditar) return true;
  avisar('Necesitas iniciar sesión con una cuenta autorizada para editar.', { tipo: 'error' });
  return false;
}

function descargarJSON(objeto, nombre) {
  const blob = new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const nombreArchivo = (s) => String(s).replace(/[^\w.-]+/g, '_');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const asigActual = () => asignaturas.find((a) => a.id === aidActual);

function coincide(texto, terminos) {
  const t = normalizar(texto);
  return terminos.every((x) => t.includes(x));
}
const terminosDe = (q) => normalizar(q).trim().split(/\s+/).filter(Boolean);

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

/* ---------- Sesión y permisos ---------- */

function aplicarSesion(s) {
  sesion = s;
  document.body.dataset.editor = s.puedeEditar ? 'si' : 'no';

  dom.btnLogin.hidden = !(s.soportaLogin && !s.usuario);
  dom.btnLogout.hidden = !s.usuario;

  if (s.usuario) {
    dom.sesionChip.hidden = false;
    dom.sesionChip.textContent = `${s.usuario.email} · ${s.puedeEditar ? 'editor' : 'solo lectura'}`;
  } else if (s.soportaLogin) {
    dom.sesionChip.hidden = false;
    dom.sesionChip.textContent = 'Solo lectura';
  } else {
    dom.sesionChip.hidden = true;
  }

  let banner = '';
  if (s.soportaLogin && !s.puedeEditar) {
    if (!s.usuario) banner = 'Estás en modo solo lectura. Inicia sesión con una cuenta autorizada para editar.';
    else if (s.sinConfig) banner = 'Falta crear el documento config/acceso en Firestore con la lista de editores (ver README).';
    else banner = `La cuenta ${s.usuario.email} no está en la lista de editores: solo puedes leer.`;
  }
  dom.banner.textContent = banner;
  dom.banner.hidden = !banner;

  refrescar();
}

/* ---------- Navegación entre vistas ---------- */

const SECCIONES = () => ({ asig: dom.vistaAsig, temas: dom.vistaTemas, prob: dom.vistaProb, estudio: dom.vistaEstudio });
const TITULOS = () => ({ asig: dom.h1Asig, temas: dom.temaAsigNombre, prob: dom.asigNombre, estudio: dom.estudioTitulo });

function soloVista(cual, enfocar = true) {
  vista = cual;
  const secs = SECCIONES();
  for (const [k, sec] of Object.entries(secs)) sec.hidden = k !== cual;
  if (enfocar) TITULOS()[cual].focus({ preventScroll: true });
}

function mostrarAsignaturas() {
  aidActual = null;
  temaActual = null;
  if (desuscribirProblemas) { desuscribirProblemas(); desuscribirProblemas = null; }
  problemas = []; papeleraProb = [];
  dom.buscadorAsig.value = '';
  soloVista('asig');
  location.hash = '';
  actualizarPapeleraBotones();
}

function abrirAsignatura(aid) {
  const asig = asignaturas.find((a) => a.id === aid);
  if (!asig) return;
  aidActual = aid;
  temaActual = null;
  dom.temaAsigNombre.textContent = asig.nombre;
  dom.temaAsigDesc.textContent = asig.descripcion || '';
  dom.buscadorAsig.value = '';
  dom.buscadorBanco.value = '';
  buscarBanco();
  buscarAsignatura();
  soloVista('temas');
  location.hash = '#' + encodeURIComponent(aid);

  if (desuscribirProblemas) desuscribirProblemas();
  problemas = []; papeleraProb = [];
  renderTemas();
  desuscribirProblemas = store.suscribirProblemas(aid, (lista) => {
    problemas = lista.filter((p) => !p.borrado);
    papeleraProb = lista.filter((p) => p.borrado);
    refrescar();
  });
}

function abrirTema(nombre) {
  if (!aidActual) return;
  temaActual = nombre;
  const asig = asigActual();
  dom.probRuta.textContent = asig ? asig.nombre : '';
  dom.asigNombre.textContent = nombre;
  dom.asigDesc.textContent = '';
  dom.buscador.value = '';
  dom.filtroDif.value = '';
  dom.filtroFav.checked = false;
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

// Abre el tema de un resultado de búsqueda (en cualquier asignatura).
function irAlTema(aid, tema) {
  dom.buscadorBanco.value = '';
  dom.buscadorAsig.value = '';
  if (aid !== aidActual) abrirAsignatura(aid);
  else { buscarAsignatura(); buscarBanco(); }
  abrirTema(tema);
}

// Repinta lo que esté a la vista cuando cambian los datos o la sesión.
function refrescar() {
  if (vista === 'temas') {
    renderTemas();
    if (dom.buscadorAsig.value.trim()) buscarAsignatura();
  } else if (vista === 'prob') {
    renderProblemas();
  }
  actualizarPapeleraBotones();
  if (dom.dlgPap.open) renderPapelera();
}

function temasDeAsignatura() {
  const asig = asigActual();
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
    vacio.textContent = sesion.puedeEditar
      ? 'Esta asignatura aún no tiene temas. Crea el primero con «Nuevo tema».'
      : 'Esta asignatura aún no tiene temas.';
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
  if (!exigirEdicion()) return;
  dlgTemaModo = { tipo: 'crear', viejo: null };
  dom.dlgTemaTitulo.textContent = 'Nuevo tema';
  dom.dlgTemaNombre.value = '';
  dom.dlgTema.showModal();
  dom.dlgTemaNombre.focus();
}
function abrirDialogoTemaEditar(nombre) {
  if (!exigirEdicion()) return;
  dlgTemaModo = { tipo: 'editar', viejo: nombre };
  dom.dlgTemaTitulo.textContent = 'Renombrar tema';
  dom.dlgTemaNombre.value = nombre;
  dom.dlgTema.showModal();
  dom.dlgTemaNombre.focus();
}
async function guardarDialogoTema() {
  const nombre = sanearNombreTema(dom.dlgTemaNombre.value);
  if (!dom.dlgTemaNombre.value.trim()) { dom.dlgTemaNombre.focus(); return; }
  if (!store || !aidActual || !exigirEdicion()) return;
  dom.dlgTema.close();
  await intentar(async () => {
    if (dlgTemaModo.tipo === 'crear') {
      await store.agregarTema(aidActual, nombre);
      avisar(`Tema «${nombre}» creado.`, { tipo: 'ok' });
    } else if (dlgTemaModo.viejo !== nombre) {
      const viejo = dlgTemaModo.viejo;
      await store.renombrarTema(aidActual, viejo, nombre);
      avisar(`Tema renombrado a «${nombre}».`, {
        tipo: 'ok',
        accion: { texto: 'Deshacer', fn: () => store.renombrarTema(aidActual, nombre, viejo) },
      });
    }
  }, 'No se pudo guardar el tema');
}
async function borrarTema(t) {
  if (!exigirEdicion()) return;
  const aid = aidActual;
  const res = await intentar(() => store.eliminarTema(aid, t.nombre), 'No se pudo borrar el tema');
  if (!res) return;
  if (temaActual === t.nombre) volverATemas();
  const detalle = t.n > 0 ? ` y sus ${t.n} problema${t.n === 1 ? '' : 's'}` : '';
  avisar(`Tema «${t.nombre}»${detalle} movido a la papelera.`, {
    accion: { texto: 'Deshacer', fn: () => store.restaurarTema(aid, t.nombre, res.pids) },
  });
}

/* ---------- Render: asignaturas ---------- */

function renderAsignaturas() {
  dom.grid.innerHTML = '';
  if (asignaturas.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = sesion.puedeEditar
      ? 'Aún no hay asignaturas. Crea la primera con «Nueva asignatura».'
      : 'Aún no hay asignaturas.';
    dom.grid.appendChild(vacio);
    return;
  }
  for (const a of asignaturas) {
    const nodo = dom.tplAsig.content.cloneNode(true);
    nodo.querySelector('.card-asig-nombre').textContent = a.nombre;
    const desc = nodo.querySelector('.card-asig-desc');
    if (a.descripcion) desc.textContent = a.descripcion; else desc.remove();
    nodo.querySelector('.card-asig-meta').textContent = 'Actualizada ' + fechaRelativa(a.actualizado);
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
  if (!exigirEdicion()) return;
  dlgModo = { tipo: 'crear', aid: null };
  dom.dlgTitulo.textContent = 'Nueva asignatura';
  dom.dlgNombre.value = '';
  dom.dlgDesc.value = '';
  dom.dlg.showModal();
  dom.dlgNombre.focus();
}
function abrirDialogoEditar(a) {
  if (!exigirEdicion()) return;
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
  if (!store) { avisar('Todavía estamos conectando con el almacenamiento. Espera un momento e inténtalo de nuevo.', { tipo: 'error' }); return; }
  if (!exigirEdicion()) return;
  const datos = { nombre, descripcion: dom.dlgDesc.value.trim() };
  dom.dlg.close();
  await intentar(async () => {
    if (dlgModo.tipo === 'crear') await store.crearAsignatura(datos);
    else await store.actualizarAsignatura(dlgModo.aid, datos);
  }, 'No se pudo guardar la asignatura');
}
async function borrarAsignatura(a) {
  if (!exigirEdicion()) return;
  const ok = await intentar(() => store.borrarAsignatura(a.id), 'No se pudo borrar la asignatura');
  if (!ok) return;
  if (aidActual === a.id) mostrarAsignaturas();
  avisar(`Asignatura «${a.nombre}» movida a la papelera.`, {
    accion: { texto: 'Deshacer', fn: () => store.restaurarAsignatura(a.id) },
  });
}

/* ---------- Render: problemas ---------- */

const problemasDelTema = () => problemas.filter((p) => p.tema === temaActual);

function problemasFiltrados() {
  const terminos = terminosDe(dom.buscador.value);
  const dif = dom.filtroDif.value;
  const soloFav = dom.filtroFav.checked;
  return problemasDelTema().filter((p) => {
    if (dif && p.dificultad !== dif) return false;
    if (soloFav && !esFavorito(aidActual, p.id)) return false;
    if (terminos.length && !coincide(`${p.enunciado} ${p.fuente} ${p.respuesta}`, terminos)) return false;
    return true;
  });
}

function renderProblemas() {
  if (temaActual === null) return;
  const delTema = problemasDelTema();
  const lista = problemasFiltrados();
  dom.lista.innerHTML = '';
  if (lista.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = delTema.length === 0
      ? (sesion.puedeEditar ? 'Este tema aún no tiene problemas. Crea uno con «Nuevo problema» o sube un archivo JSON.' : 'Este tema aún no tiene problemas.')
      : 'No hay problemas que coincidan con el filtro.';
    dom.lista.appendChild(vacio);
  } else {
    for (const p of lista) dom.lista.appendChild(crearTarjeta(p, {}));
  }
  dom.contador.textContent = `Mostrando ${lista.length} de ${delTema.length} problema(s).`;
  tipografiarMatematicas();
}

// ctx: { aid, ruta, soloLectura, irTema }
function crearTarjeta(p, ctx = {}) {
  const aid = ctx.aid ?? aidActual;
  const nodo = dom.tplProb.content.cloneNode(true);

  const chipDif = nodo.querySelector('.chip-dificultad');
  if (p.dificultad) {
    chipDif.textContent = p.dificultad.charAt(0).toUpperCase() + p.dificultad.slice(1);
    chipDif.dataset.nivel = p.dificultad;
  } else {
    chipDif.remove();
  }
  nodo.querySelector('.chip-ruta').textContent = ctx.ruta || '';

  // Favorito (por navegador)
  const btnFav = nodo.querySelector('.btn-fav');
  const pintarFav = () => {
    const f = esFavorito(aid, p.id);
    btnFav.textContent = f ? '★ Favorito' : '☆ Favorito';
    btnFav.setAttribute('aria-pressed', String(f));
  };
  pintarFav();
  btnFav.addEventListener('click', () => {
    alternarFavorito(aid, p.id);
    pintarFav();
    if (vista === 'prob' && dom.filtroFav.checked) renderProblemas();
  });

  // Acciones de edición (solo editores, y no en resultados de solo lectura)
  const btnEditar = nodo.querySelector('.btn-editar-prob');
  const btnMover = nodo.querySelector('.btn-mover-prob');
  const btnEliminar = nodo.querySelector('.btn-eliminar-prob');
  if (ctx.soloLectura) {
    btnEditar.remove(); btnMover.remove(); btnEliminar.remove();
  } else {
    btnEditar.addEventListener('click', () => abrirFormProblema(p, aid));
    btnMover.addEventListener('click', () => abrirMover(p, aid));
    btnEliminar.addEventListener('click', () => borrarProblema(p, aid));
  }
  const btnIr = nodo.querySelector('.btn-ir-tema');
  if (ctx.irTema) btnIr.addEventListener('click', ctx.irTema); else btnIr.remove();

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
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const oculto = resp.hasAttribute('hidden');
      if (oculto) { resp.removeAttribute('hidden'); btn.textContent = 'Ocultar respuesta'; tipografiarMatematicas(resp); }
      else { resp.setAttribute('hidden', ''); btn.textContent = 'Mostrar respuesta'; }
      btn.setAttribute('aria-expanded', String(oculto));
    });
  } else {
    btn.disabled = true;
    btn.textContent = 'Sin respuesta';
    resp.remove();
  }

  nodo.querySelector('.problema-fuente').textContent = p.fuente ? 'Fuente: ' + p.fuente : '';
  return nodo;
}

async function borrarProblema(p, aid) {
  if (!exigirEdicion()) return;
  const ok = await intentar(() => store.borrarProblema(aid, p.id), 'No se pudo eliminar el problema');
  if (!ok) return;
  avisar('Problema movido a la papelera.', {
    accion: { texto: 'Deshacer', fn: () => store.restaurarProblema(aid, p.id) },
  });
}

/* ---------- Crear / editar problema (con vista previa) ---------- */

let formEstado = { aid: null, pid: null, original: null, sucio: false };

function llenarSelectTemas(select, { excluir = null, elegido = null } = {}) {
  const nombres = temasDeAsignatura().map((t) => t.nombre).filter((n) => n !== excluir);
  if (elegido && !nombres.includes(elegido) && elegido !== excluir) nombres.push(elegido);
  select.innerHTML = '';
  for (const n of nombres) {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    select.appendChild(o);
  }
  const nuevo = document.createElement('option');
  nuevo.value = NUEVO; nuevo.textContent = '＋ Nuevo tema…';
  select.appendChild(nuevo);
  select.value = elegido && nombres.includes(elegido) ? elegido : (nombres[0] ?? NUEVO);
}

function abrirFormProblema(p, aid = aidActual) {
  if (!exigirEdicion()) return;
  const nuevo = !p;
  formEstado = { aid, pid: nuevo ? null : p.id, original: nuevo ? null : { ...p }, sucio: false };
  dom.dpTitulo.textContent = nuevo ? 'Nuevo problema' : 'Editar problema';
  llenarSelectTemas(dom.dpTema, { elegido: nuevo ? temaActual : p.tema });
  dom.dpTemaNuevo.value = '';
  dom.dpTemaNuevoFila.hidden = dom.dpTema.value !== NUEVO;
  dom.dpDif.value = nuevo ? '' : (p.dificultad || '');
  dom.dpEnunciado.value = nuevo ? '' : p.enunciado;
  dom.dpDiagrama.value = nuevo ? '' : (p.diagrama || '');
  dom.dpRespuesta.value = nuevo ? '' : (p.respuesta || '');
  dom.dpDiagramaResp.value = nuevo ? '' : (p.diagrama_respuesta || '');
  dom.dpFuente.value = nuevo ? '' : (p.fuente || '');
  actualizarVistaPrevia();
  dom.dlgProblema.showModal();
  dom.dpEnunciado.focus();
}

function datosForm() {
  let tema = dom.dpTema.value;
  if (tema === NUEVO) tema = dom.dpTemaNuevo.value.trim();
  return {
    tema,
    dificultad: dom.dpDif.value,
    enunciado: dom.dpEnunciado.value.trim(),
    respuesta: dom.dpRespuesta.value.trim(),
    diagrama: dom.dpDiagrama.value.trim(),
    diagrama_respuesta: dom.dpDiagramaResp.value.trim(),
    fuente: dom.dpFuente.value.trim(),
  };
}

function actualizarVistaPrevia() {
  const d = datosForm();
  dom.dpVista.replaceChildren();
  const bloque = (titulo, texto, diag) => {
    const h = document.createElement('h4');
    h.textContent = titulo;
    dom.dpVista.appendChild(h);
    if (texto) {
      const t = document.createElement('div');
      t.className = 'problema-enunciado';
      t.textContent = texto;
      dom.dpVista.appendChild(t);
    }
    if (diag) dom.dpVista.appendChild(crearDiagramaTikZ(diag));
  };
  if (!d.enunciado && !d.diagrama && !d.respuesta && !d.diagrama_respuesta) {
    const v = document.createElement('p');
    v.className = 'vacio-vista';
    v.textContent = 'Aquí verás el problema tal como se mostrará, con fórmulas y diagramas.';
    dom.dpVista.appendChild(v);
    return;
  }
  if (d.enunciado || d.diagrama) bloque('Enunciado', d.enunciado, d.diagrama);
  if (d.respuesta || d.diagrama_respuesta) bloque('Respuesta', d.respuesta, d.diagrama_respuesta);
  tipografiarMatematicas(dom.dpVista);
}
const actualizarVistaPreviaLento = debounce(actualizarVistaPrevia, 300);

async function guardarFormProblema() {
  if (!exigirEdicion()) return;
  const d = datosForm();
  if (!d.enunciado) {
    dom.dpEnunciado.focus();
    avisar('El enunciado es obligatorio.', { tipo: 'error' });
    return;
  }
  if (!d.tema) {
    dom.dpTemaNuevo.focus();
    avisar('Escribe el nombre del tema nuevo.', { tipo: 'error' });
    return;
  }
  const { aid, pid, original } = formEstado;
  const id = await intentar(() => store.guardarProblema(aid, pid, d), 'No se pudo guardar el problema');
  if (!id) return;
  formEstado.sucio = false;
  dom.dlgProblema.close();
  if (original) {
    avisar('Cambios guardados.', {
      tipo: 'ok',
      accion: { texto: 'Deshacer', fn: () => store.guardarProblema(aid, pid, original) },
    });
  } else {
    avisar('Problema creado.', { tipo: 'ok' });
  }
}

async function cerrarFormProblema() {
  if (formEstado.sucio) {
    const ok = await confirmar({
      titulo: '¿Descartar los cambios?',
      texto: 'Hay cambios sin guardar en este problema.',
      aceptar: 'Descartar',
      cancelar: 'Seguir editando',
      peligro: true,
    });
    if (!ok) return;
  }
  formEstado.sucio = false;
  dom.dlgProblema.close();
}

/* ---------- Mover problema a otro tema ---------- */

let moverEstado = null;
function abrirMover(p, aid = aidActual) {
  if (!exigirEdicion()) return;
  moverEstado = { aid, p };
  llenarSelectTemas(dom.dmTema, { excluir: p.tema });
  dom.dmNuevo.value = '';
  dom.dmNuevoFila.hidden = dom.dmTema.value !== NUEVO;
  dom.dlgMover.showModal();
  dom.dmTema.focus();
}
async function guardarMover() {
  if (!moverEstado || !exigirEdicion()) return;
  let destino = dom.dmTema.value;
  if (destino === NUEVO) destino = dom.dmNuevo.value.trim();
  if (!destino) { dom.dmNuevo.focus(); return; }
  destino = sanearNombreTema(destino);
  const { aid, p } = moverEstado;
  dom.dlgMover.close();
  if (destino === p.tema) return;
  const ok = await intentar(() => store.moverProblema(aid, p.id, destino), 'No se pudo mover el problema');
  if (!ok) return;
  avisar(`Problema movido a «${destino}».`, {
    tipo: 'ok',
    accion: { texto: 'Deshacer', fn: () => store.moverProblema(aid, p.id, p.tema) },
  });
}

/* ---------- Papelera ---------- */

function actualizarPapeleraBotones() {
  const na = asignaturasTodas.filter((a) => a.borrado).length;
  dom.btnPapeleraAsig.textContent = na ? `Papelera (${na})` : 'Papelera';
  const np = papeleraProb.length;
  dom.btnPapeleraProb.textContent = np ? `Papelera (${np})` : 'Papelera';
}

function abrirPapelera(tipo) {
  if (!exigirEdicion()) return;
  papeleraTipo = tipo;
  renderPapelera();
  dom.dlgPap.showModal();
  dom.papCerrar.focus();
}

function renderPapelera() {
  const esAsig = papeleraTipo === 'asig';
  dom.papSub.textContent = esAsig
    ? 'Las asignaturas borradas conservan todos sus problemas. Restáuralas o elimínalas para siempre.'
    : 'Problemas y temas borrados de esta asignatura. Restáuralos o elimínalos para siempre.';
  const items = (esAsig ? asignaturasTodas.filter((a) => a.borrado) : papeleraProb.slice())
    .sort((a, b) => (b.borradoEn || 0) - (a.borradoEn || 0));
  dom.papLista.replaceChildren();
  if (items.length === 0) {
    const v = document.createElement('p');
    v.className = 'vacio';
    v.textContent = 'La papelera está vacía.';
    dom.papLista.appendChild(v);
    return;
  }
  for (const it of items) {
    const fila = document.createElement('div');
    fila.className = 'pap-item';
    const info = document.createElement('div');
    info.className = 'pap-info';
    const titulo = document.createElement('p');
    titulo.className = 'pap-titulo';
    const meta = document.createElement('p');
    meta.className = 'pap-meta';
    if (esAsig) {
      titulo.textContent = it.nombre;
      meta.textContent = 'Borrada ' + fechaRelativa(it.borradoEn);
    } else {
      titulo.textContent = it.enunciado.replace(/\s+/g, ' ').slice(0, 110);
      meta.textContent = `Tema «${it.tema}» · borrado ${fechaRelativa(it.borradoEn)}`;
    }
    info.append(titulo, meta);

    const acc = document.createElement('div');
    acc.className = 'pap-acciones';
    const bRest = document.createElement('button');
    bRest.type = 'button'; bRest.className = 'link-btn'; bRest.textContent = 'Restaurar';
    bRest.addEventListener('click', async () => {
      const ok = await intentar(
        () => (esAsig ? store.restaurarAsignatura(it.id) : store.restaurarProblema(aidActual, it.id)),
        'No se pudo restaurar');
      if (ok) avisar('Restaurado.', { tipo: 'ok' });
    });
    const bDel = document.createElement('button');
    bDel.type = 'button'; bDel.className = 'link-btn btn-borrar'; bDel.textContent = 'Eliminar para siempre';
    bDel.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: '¿Eliminar para siempre?',
        texto: esAsig
          ? `Se borrará definitivamente «${it.nombre}» con todos sus problemas. No se puede deshacer.`
          : 'Se borrará definitivamente este problema. No se puede deshacer.',
        aceptar: 'Eliminar', peligro: true,
      });
      if (!ok) return;
      await intentar(
        () => (esAsig ? store.eliminarAsignaturaDefinitivo(it.id) : store.eliminarProblemaDefinitivo(aidActual, it.id)),
        'No se pudo eliminar');
    });
    acc.append(bRest, bDel);
    fila.append(info, acc);
    dom.papLista.appendChild(fila);
  }
}

/* ---------- Búsqueda ---------- */

// Pinta resultados con paginación sencilla (los diagramas son costosos).
function pintarResultados(items, { lista, info, soloLectura, conAsig }) {
  let mostrados = POR_PAGINA;
  const total = items.length;
  info.textContent = total === 0 ? 'Sin resultados.' : `${total} resultado${total === 1 ? '' : 's'}.`;
  const pintar = () => {
    lista.replaceChildren();
    for (const it of items.slice(0, mostrados)) {
      lista.appendChild(crearTarjeta(it.p, {
        aid: it.aid,
        ruta: conAsig ? `${it.asig} › ${it.p.tema}` : it.p.tema,
        soloLectura,
        irTema: () => irAlTema(it.aid, it.p.tema),
      }));
    }
    if (total > mostrados) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sutil mas-resultados';
      b.textContent = `Mostrar más (${total - mostrados})`;
      b.addEventListener('click', () => { mostrados += POR_PAGINA; pintar(); });
      lista.appendChild(b);
    }
    tipografiarMatematicas();
  };
  pintar();
}

// Búsqueda dentro de la asignatura abierta (datos en vivo: se puede editar).
function buscarAsignatura() {
  const terminos = terminosDe(dom.buscadorAsig.value);
  const activa = terminos.length > 0;
  dom.resAsig.hidden = !activa;
  dom.gridTemas.hidden = activa;
  if (!activa) return;
  const items = problemas
    .filter((p) => coincide(`${p.enunciado} ${p.respuesta} ${p.fuente} ${p.tema}`, terminos))
    .map((p) => ({ p, aid: aidActual, asig: asigActual()?.nombre || '' }));
  pintarResultados(items, { lista: dom.resAsigLista, info: dom.resAsigInfo, soloLectura: false, conAsig: false });
}

// Búsqueda en todo el banco (solo lectura; se abre el tema para editar).
let secBusqueda = 0;
async function buscarBanco() {
  const terminos = terminosDe(dom.buscadorBanco.value);
  const activa = terminos.length > 0;
  dom.resBanco.hidden = !activa;
  dom.grid.hidden = activa;
  if (!activa || !store) return;
  const mi = ++secBusqueda;
  dom.resBancoInfo.textContent = 'Buscando…';
  dom.resBancoLista.replaceChildren();
  let todo;
  try {
    todo = await store.cargarTodo();
  } catch (e) {
    console.error(e);
    dom.resBancoInfo.textContent = 'No se pudo buscar: ' + (e && e.message ? e.message : e);
    return;
  }
  if (mi !== secBusqueda) return;
  const items = [];
  for (const a of todo) {
    for (const p of a.problemas) {
      if (coincide(`${a.nombre} ${p.tema} ${p.enunciado} ${p.respuesta} ${p.fuente}`, terminos)) {
        items.push({ p, aid: a.aid, asig: a.nombre });
      }
    }
  }
  pintarResultados(items, { lista: dom.resBancoLista, info: dom.resBancoInfo, soloLectura: true, conAsig: true });
}

/* ---------- Subir / exportar / respaldo ---------- */

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
  if (!exigirEdicion()) return;
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
    if (temaActual) total = total.map((p) => ({ ...p, tema: temaActual }));
    mostrarMensaje(`Subiendo ${total.length} problema(s)…`, '');
    try {
      await store.agregarProblemas(aidActual, total);
      mostrarMensaje(
        `Se agregaron ${total.length} problema(s) a «${temaActual}».` + (errores.length ? ' Con avisos: ' + errores.join('; ') : ''),
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
  if (tipo === 'error') dom.mensaje.setAttribute('role', 'alert');
  else dom.mensaje.setAttribute('role', 'status');
}

function exportar() {
  const asig = asigActual();
  const delTema = problemasDelTema();
  const salida = {
    formato: 'banco-problemas-v1',
    asignatura: asig ? asig.nombre : '',
    tema: temaActual || '',
    problemas: delTema.map(({ id, orden, creado, actualizado, borrado, borradoEn, ...p }) => p),
  };
  descargarJSON(salida, nombreArchivo(`${asig ? asig.nombre : 'asignatura'}-${temaActual || 'tema'}`) + '.json');
  mostrarMensaje(`Exportados ${delTema.length} problema(s) del tema «${temaActual}».`, 'ok');
}

async function exportarTodo() {
  dom.btnExportarTodo.disabled = true;
  try {
    const resp = await store.exportarTodo();
    const np = resp.asignaturas.reduce((n, a) => n + a.problemas.length, 0);
    const fecha = new Date().toISOString().slice(0, 10);
    descargarJSON(resp, `banco-respaldo-${fecha}.json`);
    avisar(`Respaldo descargado: ${resp.asignaturas.length} asignatura(s), ${np} problema(s).`, { tipo: 'ok' });
  } catch (e) {
    console.error(e);
    avisar('No se pudo crear el respaldo: ' + (e && e.message ? e.message : e), { tipo: 'error' });
  } finally {
    dom.btnExportarTodo.disabled = false;
  }
}

async function importarRespaldo(archivo) {
  if (!exigirEdicion() || !archivo) return;
  let asigs;
  try {
    asigs = leerRespaldo(JSON.parse(await archivo.text()));
  } catch (e) {
    avisar('No se pudo leer el respaldo: ' + (e && e.message ? e.message : e), { tipo: 'error' });
    return;
  }
  const np = asigs.reduce((n, a) => n + a.problemas.length, 0);
  const ok = await confirmar({
    titulo: 'Importar respaldo',
    texto: `Se crearán ${asigs.length} asignatura(s) nuevas con ${np} problema(s). No se modifica ni se reemplaza nada de lo que ya existe.`,
    aceptar: 'Importar',
  });
  if (!ok) return;
  const res = await intentar(() => store.importarRespaldo(asigs), 'No se pudo importar el respaldo');
  if (res) avisar(`Importadas ${res.asignaturas} asignatura(s) y ${res.problemas} problema(s).`, { tipo: 'ok' });
}

/* ---------- Modo estudio ---------- */

let est = null;
const barajarLista = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function abrirEstudio(ambito) {
  if (!aidActual) return;
  est = { ambito, cola: [], total: 0, sabidas: 0, repasos: 0, revelada: false };
  const asig = asigActual();
  dom.estudioRuta.textContent = asig ? asig.nombre : '';
  dom.estudioTitulo.textContent = ambito === 'tema' ? `Modo estudio · ${temaActual}` : 'Modo estudio · toda la asignatura';
  dom.estudioDif.value = '';
  dom.estudioFav.checked = false;
  soloVista('estudio');
  armarMazo();
}

function armarMazo() {
  const dif = dom.estudioDif.value;
  const soloFav = dom.estudioFav.checked;
  const pool = problemas.filter((p) =>
    (est.ambito === 'asig' || p.tema === temaActual) &&
    (!dif || p.dificultad === dif) &&
    (!soloFav || esFavorito(aidActual, p.id)));
  est.cola = barajarLista(pool);
  est.total = pool.length;
  est.sabidas = 0;
  est.repasos = 0;
  est.revelada = false;
  renderEstudio();
}

function salirEstudio() {
  const volverATema = est && est.ambito === 'tema';
  est = null;
  if (volverATema && temaActual !== null) { soloVista('prob'); renderProblemas(); }
  else { temaActual = null; soloVista('temas'); renderTemas(); }
}

function renderEstudio() {
  const cont = dom.estudioTarjeta;
  cont.replaceChildren();
  if (est.total === 0) {
    dom.estudioProgreso.textContent = '';
    const v = document.createElement('p');
    v.className = 'vacio';
    v.textContent = 'No hay problemas para estudiar con estos filtros.';
    cont.appendChild(v);
    return;
  }
  if (est.cola.length === 0) {
    dom.estudioProgreso.textContent = `Completado: ${est.total} de ${est.total}.`;
    const fin = document.createElement('div');
    fin.className = 'estudio-fin';
    fin.innerHTML = '<h2>¡Repaso terminado!</h2>';
    const p1 = document.createElement('p');
    p1.textContent = `Problemas: ${est.total} · repasos adicionales: ${est.repasos}.`;
    const b1 = document.createElement('button');
    b1.type = 'button'; b1.className = 'btn'; b1.textContent = 'Estudiar de nuevo';
    b1.addEventListener('click', armarMazo);
    const b2 = document.createElement('button');
    b2.type = 'button'; b2.className = 'btn btn-sutil'; b2.textContent = 'Salir';
    b2.addEventListener('click', salirEstudio);
    fin.append(p1, b1, b2);
    cont.appendChild(fin);
    b1.focus({ preventScroll: true });
    return;
  }

  const p = est.cola[0];
  dom.estudioProgreso.textContent =
    `Quedan ${est.cola.length} de ${est.total} · ${est.sabidas} sabida${est.sabidas === 1 ? '' : 's'}`;

  const meta = document.createElement('div');
  meta.className = 'estudio-meta';
  if (p.dificultad) {
    const c = document.createElement('span');
    c.className = 'chip chip-dificultad';
    c.dataset.nivel = p.dificultad;
    c.textContent = p.dificultad.charAt(0).toUpperCase() + p.dificultad.slice(1);
    meta.appendChild(c);
  }
  if (est.ambito === 'asig') {
    const c = document.createElement('span');
    c.className = 'chip chip-ruta';
    c.textContent = p.tema;
    meta.appendChild(c);
  }
  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = 'link-btn btn-fav';
  const pintarFav = () => {
    const f = esFavorito(aidActual, p.id);
    fav.textContent = f ? '★ Favorito' : '☆ Favorito';
    fav.setAttribute('aria-pressed', String(f));
  };
  pintarFav();
  fav.addEventListener('click', () => { alternarFavorito(aidActual, p.id); pintarFav(); });
  meta.appendChild(fav);
  cont.appendChild(meta);

  const enun = document.createElement('div');
  enun.className = 'problema-enunciado';
  enun.textContent = p.enunciado;
  cont.appendChild(enun);
  if (p.diagrama) cont.appendChild(crearDiagramaTikZ(p.diagrama));

  const resp = document.createElement('div');
  resp.className = 'problema-respuesta';
  resp.hidden = true;
  const rt = document.createElement('div');
  rt.className = 'respuesta-texto';
  rt.textContent = p.respuesta || (p.diagrama_respuesta ? '' : 'Este problema no tiene respuesta guardada.');
  resp.appendChild(rt);
  if (p.diagrama_respuesta) resp.appendChild(crearDiagramaTikZ(p.diagrama_respuesta));
  if (p.fuente) {
    const f = document.createElement('div');
    f.className = 'problema-fuente';
    f.textContent = 'Fuente: ' + p.fuente;
    resp.appendChild(f);
  }

  const controles = document.createElement('div');
  controles.className = 'estudio-controles';
  const bRev = document.createElement('button');
  bRev.type = 'button'; bRev.className = 'btn'; bRev.id = 'estudio-revelar';
  bRev.textContent = 'Mostrar respuesta';
  const bRep = document.createElement('button');
  bRep.type = 'button'; bRep.className = 'btn btn-sutil'; bRep.id = 'estudio-repasar';
  bRep.textContent = 'Repasar de nuevo'; bRep.hidden = true;
  const bSab = document.createElement('button');
  bSab.type = 'button'; bSab.className = 'btn'; bSab.id = 'estudio-sabia';
  bSab.textContent = 'Lo sabía'; bSab.hidden = true;
  bRev.addEventListener('click', estudioRevelar);
  bRep.addEventListener('click', () => estudioMarcar(false));
  bSab.addEventListener('click', () => estudioMarcar(true));
  controles.append(bRev, bRep, bSab);

  cont.append(resp, controles);
  est.revelada = false;
  tipografiarMatematicas(cont);
  bRev.focus({ preventScroll: true });
}

function estudioRevelar() {
  if (!est || est.revelada || est.cola.length === 0) return;
  est.revelada = true;
  const cont = dom.estudioTarjeta;
  cont.querySelector('.problema-respuesta').hidden = false;
  cont.querySelector('#estudio-revelar').hidden = true;
  cont.querySelector('#estudio-repasar').hidden = false;
  const sab = cont.querySelector('#estudio-sabia');
  sab.hidden = false;
  tipografiarMatematicas(cont.querySelector('.problema-respuesta'));
  sab.focus({ preventScroll: true });
}

function estudioMarcar(sabia) {
  if (!est || est.cola.length === 0 || !est.revelada) return;
  if (sabia) { est.cola.shift(); est.sabidas += 1; }
  else { est.cola.push(est.cola.shift()); est.repasos += 1; }
  renderEstudio();
}

function teclasEstudio(e) {
  if (vista !== 'estudio' || !est || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === ' ' || e.key === 'Spacebar') {
    if (tag === 'BUTTON') return; // el botón enfocado actúa por sí mismo
    e.preventDefault(); estudioRevelar();
  } else if (e.key === 'ArrowRight') { e.preventDefault(); estudioMarcar(true); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); estudioMarcar(false); }
  else if (e.key === 'f' || e.key === 'F') {
    const b = dom.estudioTarjeta.querySelector('.btn-fav');
    if (b) b.click();
  }
}

/* ---------- Eventos ---------- */

// Cierra un diálogo si se hace clic en el fondo (fuera del cuadro).
function cerrarAlClicFuera(dlg) {
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
}

function enlazarEventos() {
  dom.btnNueva.addEventListener('click', abrirDialogoCrear);
  dom.dlgGuardar.addEventListener('click', guardarDialogo);
  dom.dlgCancelar.addEventListener('click', () => dom.dlg.close());
  dom.dlgNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarDialogo(); } });

  // Sesión
  dom.btnLogin.addEventListener('click', async () => {
    try { await store.iniciarSesionGoogle(); }
    catch (e) {
      if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
      console.error(e);
      avisar('No se pudo iniciar sesión: ' + (e && e.message ? e.message : e), { tipo: 'error' });
    }
  });
  dom.btnLogout.addEventListener('click', async () => {
    try { await store.cerrarSesion(); avisar('Sesión cerrada.'); } catch (e) { console.error(e); }
  });

  // Respaldo y papelera
  dom.btnExportarTodo.addEventListener('click', exportarTodo);
  dom.btnImportarResp.addEventListener('click', () => dom.fileRespaldo.click());
  dom.fileRespaldo.addEventListener('change', (e) => { importarRespaldo(e.target.files[0]); dom.fileRespaldo.value = ''; });
  dom.btnPapeleraAsig.addEventListener('click', () => abrirPapelera('asig'));
  dom.btnPapeleraProb.addEventListener('click', () => abrirPapelera('prob'));
  dom.papCerrar.addEventListener('click', () => dom.dlgPap.close());
  cerrarAlClicFuera(dom.dlgPap);

  // Búsqueda
  dom.buscadorBanco.addEventListener('input', debounce(buscarBanco, 300));
  dom.buscadorAsig.addEventListener('input', debounce(buscarAsignatura, 200));

  // Temas
  dom.btnNuevoTema.addEventListener('click', abrirDialogoTemaCrear);
  dom.btnVolverAsig.addEventListener('click', mostrarAsignaturas);
  dom.dlgTemaGuardar.addEventListener('click', guardarDialogoTema);
  dom.dlgTemaCancelar.addEventListener('click', () => dom.dlgTema.close());
  dom.dlgTemaNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarDialogoTema(); } });
  dom.btnEstudiarAsig.addEventListener('click', () => abrirEstudio('asig'));

  // Problemas
  dom.btnVolver.addEventListener('click', volverATemas);
  dom.buscador.addEventListener('input', renderProblemas);
  dom.filtroDif.addEventListener('change', renderProblemas);
  dom.filtroFav.addEventListener('change', renderProblemas);
  dom.btnNuevoProb.addEventListener('click', () => abrirFormProblema(null));
  dom.btnEstudiarTema.addEventListener('click', () => abrirEstudio('tema'));
  dom.btnExportar.addEventListener('click', exportar);

  // Formulario de problema
  dom.dpGuardar.addEventListener('click', guardarFormProblema);
  dom.dpCancelar.addEventListener('click', cerrarFormProblema);
  dom.dlgProblema.addEventListener('cancel', (e) => {
    if (formEstado.sucio) { e.preventDefault(); cerrarFormProblema(); }
  });
  dom.dlgProblema.querySelector('#dp-form').addEventListener('input', () => {
    formEstado.sucio = true;
    actualizarVistaPreviaLento();
  });
  dom.dpTema.addEventListener('change', () => {
    dom.dpTemaNuevoFila.hidden = dom.dpTema.value !== NUEVO;
    if (!dom.dpTemaNuevoFila.hidden) dom.dpTemaNuevo.focus();
  });

  // Mover
  dom.dmGuardar.addEventListener('click', guardarMover);
  dom.dmCancelar.addEventListener('click', () => dom.dlgMover.close());
  dom.dmTema.addEventListener('change', () => {
    dom.dmNuevoFila.hidden = dom.dmTema.value !== NUEVO;
    if (!dom.dmNuevoFila.hidden) dom.dmNuevo.focus();
  });

  // Estudio
  dom.btnVolverEstudio.addEventListener('click', salirEstudio);
  dom.estudioDif.addEventListener('change', armarMazo);
  dom.estudioFav.addEventListener('change', armarMazo);
  dom.estudioBarajar.addEventListener('click', armarMazo);
  document.addEventListener('keydown', teclasEstudio);

  // Carga de JSON
  dom.dropzone.addEventListener('click', () => dom.fileInput.click());
  dom.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom.fileInput.click(); }
  });
  dom.fileInput.addEventListener('change', (e) => { manejarArchivos(e.target.files); dom.fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => dom.dropzone.addEventListener(ev, (e) => { e.preventDefault(); dom.dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => dom.dropzone.addEventListener(ev, (e) => { e.preventDefault(); dom.dropzone.classList.remove('dragover'); }));
  dom.dropzone.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) manejarArchivos(e.dataTransfer.files); });
}

/* ---------- Arranque ---------- */

async function iniciar() {
  iniciarTema();
  enlazarEventos();

  dom.estadoNube.textContent = 'Conectando…';
  dom.estadoNube.dataset.modo = 'conectando';
  renderAsignaturas();

  const { store: s, aviso } = await iniciarStore();
  store = s;
  dom.estadoNube.textContent = store.modo === 'firebase' ? 'En la nube' : 'Solo este navegador';
  dom.estadoNube.dataset.modo = store.modo;
  if (aviso) avisar(aviso, { tipo: 'error' });

  store.onSesion(aplicarSesion);

  let arranqueHash = false;
  store.suscribirAsignaturas((lista) => {
    asignaturasTodas = lista;
    asignaturas = lista.filter((a) => !a.borrado);
    renderAsignaturas();
    actualizarPapeleraBotones();
    if (dom.dlgPap.open) renderPapelera();

    if (aidActual) {
      const a = asignaturas.find((x) => x.id === aidActual);
      if (!a) { mostrarAsignaturas(); return; } // borrada (a la papelera) o inexistente
      dom.temaAsigNombre.textContent = a.nombre;
      dom.temaAsigDesc.textContent = a.descripcion || '';
      if (vista === 'temas') renderTemas();
    } else if (!arranqueHash) {
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
