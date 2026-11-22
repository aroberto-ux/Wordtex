// Capa de datos del banco de problemas.
// Dos backends con la misma interfaz:
//   · Firebase (Firestore + Auth): banco común en la nube.
//   · Local (localStorage): si Firebase no está configurado o falla.
//
// Estructura en Firestore:
//   config/acceso                        { editores: ['correo@dominio'] }   (solo lo escribe el dueño, en la consola)
//   asignaturas/{aid}                    { nombre, descripcion, temas[], creadoPor, creado, actualizado,
//                                          borrado?, borradoEn? }
//   asignaturas/{aid}/problemas/{pid}    { tema, dificultad, enunciado, respuesta, diagrama,
//                                          diagrama_respuesta, fuente, orden, creado, actualizado,
//                                          borrado?, borradoEn? }
//
// «Borrar» es SIEMPRE un borrado suave (borrado: true). Solo la papelera elimina de verdad.
// El store entrega todos los documentos (también los borrados); la app los separa.

import { firebaseConfig, opciones } from '../firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const DIFICULTADES = ['baja', 'media', 'alta'];
export const FORMATO_RESPALDO = 'banco-respaldo-v1';

const recortar = (v, n) => String(v ?? '').trim().slice(0, n);

export function sanearNombreTema(v) {
  return recortar(v || 'General', 120) || 'General';
}

export function sanearAsignatura(d) {
  const out = {
    nombre: recortar(d.nombre || 'Sin nombre', 120) || 'Sin nombre',
    descripcion: recortar(d.descripcion, 400),
  };
  if (Array.isArray(d.temas)) {
    const vistos = new Set();
    out.temas = d.temas
      .map(sanearNombreTema)
      .filter((t) => { if (vistos.has(t)) return false; vistos.add(t); return true; })
      .slice(0, 300);
  }
  return out;
}

export function sanearProblema(p) {
  const nivel = recortar(p.dificultad, 10).toLowerCase();
  return {
    tema: recortar(p.tema || 'General', 120) || 'General',
    dificultad: DIFICULTADES.includes(nivel) ? nivel : '',
    enunciado: recortar(p.enunciado, 20000),
    respuesta: recortar(p.respuesta, 20000),
    diagrama: recortar(p.diagrama, 20000),
    diagrama_respuesta: recortar(p.diagrama_respuesta, 20000),
    fuente: recortar(p.fuente, 300),
  };
}

function nuevoId(pref) {
  return pref + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Quita campos internos para exportar.
const limpiarProblema = ({ id, orden, creado, actualizado, borrado, borradoEn, ...p }) => p;

function armarRespaldo(asignaturas) {
  return {
    formato: FORMATO_RESPALDO,
    exportado: new Date().toISOString(),
    asignaturas: asignaturas.map((a) => ({
      nombre: a.nombre,
      descripcion: a.descripcion || '',
      temas: Array.isArray(a.temas) ? a.temas : [],
      problemas: a.problemas.map(limpiarProblema),
    })),
  };
}

// Valida y normaliza un respaldo leído de un archivo.
export function leerRespaldo(datos) {
  if (!datos || datos.formato !== FORMATO_RESPALDO || !Array.isArray(datos.asignaturas)) {
    throw new Error('El archivo no es un respaldo del banco (formato «' + FORMATO_RESPALDO + '»).');
  }
  return datos.asignaturas.map((a) => ({
    ...sanearAsignatura(a),
    problemas: (Array.isArray(a.problemas) ? a.problemas : []).map(sanearProblema).filter((p) => p.enunciado),
  }));
}

// ═════════════════════════════════════════════════════════════════════════
//  Modo local (localStorage)
// ═════════════════════════════════════════════════════════════════════════

function crearStoreLocal() {
  const CLAVE = 'banco.local.v1';
  let datos = { asignaturas: {}, problemas: {} };

  const leer = () => {
    try { datos = JSON.parse(localStorage.getItem(CLAVE)) || datos; } catch { /* vacío */ }
    datos.asignaturas ||= {};
    datos.problemas ||= {};
  };
  const guardar = () => {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* lleno */ }
  };
  leer();

  const oyentes = new Set();
  const emitir = () => oyentes.forEach((fn) => fn());
  if (typeof addEventListener === 'function') {
    addEventListener('storage', (e) => { if (e.key === CLAVE) { leer(); emitir(); } });
  }
  const suscribir = (fn) => { oyentes.add(fn); queueMicrotask(fn); return () => oyentes.delete(fn); };

  const listaAsig = () => Object.values(datos.asignaturas)
    .sort((a, b) => b.actualizado - a.actualizado).map((a) => ({ ...a }));
  const listaProb = (aid) => Object.values(datos.problemas[aid] || {})
    .sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((p) => ({ ...p }));
  const tocar = (aid) => { const a = datos.asignaturas[aid]; if (a) a.actualizado = Date.now(); };
  const colProb = (aid) => (datos.problemas[aid] ||= {});

  const sesion = { puedeEditar: true, usuario: null, soportaLogin: false, cargando: false, sinConfig: false };

  return {
    modo: 'local',
    sesion: () => ({ ...sesion }),
    onSesion(fn) { queueMicrotask(() => fn({ ...sesion })); return () => {}; },
    async iniciarSesionGoogle() {},
    async cerrarSesion() {},

    suscribirAsignaturas(cb) { return suscribir(() => cb(listaAsig())); },
    suscribirProblemas(aid, cb) { return suscribir(() => cb(listaProb(aid))); },

    async crearAsignatura(d) {
      leer();
      const id = nuevoId('a');
      const ahora = Date.now();
      datos.asignaturas[id] = { id, ...sanearAsignatura(d), creadoPor: 'local', creado: ahora, actualizado: ahora };
      datos.problemas[id] = {};
      guardar(); emitir();
      return id;
    },
    async actualizarAsignatura(aid, d) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      a.nombre = recortar(d.nombre || a.nombre, 120) || a.nombre;
      a.descripcion = recortar(d.descripcion ?? a.descripcion, 400);
      a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },
    async borrarAsignatura(aid) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      a.borrado = true; a.borradoEn = Date.now(); a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },
    async restaurarAsignatura(aid) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      delete a.borrado; delete a.borradoEn; a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },
    async eliminarAsignaturaDefinitivo(aid) {
      leer();
      delete datos.asignaturas[aid]; delete datos.problemas[aid];
      guardar(); emitir(); return true;
    },

    async agregarTema(aid, nombre) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      const t = sanearNombreTema(nombre);
      a.temas = Array.isArray(a.temas) ? a.temas : [];
      if (!a.temas.includes(t)) a.temas.push(t);
      a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },
    async renombrarTema(aid, viejo, nuevo) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      const t = sanearNombreTema(nuevo);
      a.temas = (Array.isArray(a.temas) ? a.temas : []).map((x) => (x === viejo ? t : x));
      if (!a.temas.includes(t)) a.temas.push(t);
      for (const p of Object.values(colProb(aid))) if (p.tema === viejo) p.tema = t;
      a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },
    // Borrado suave del tema: marca sus problemas y lo quita de la lista.
    // Devuelve los ids afectados para poder deshacer.
    async eliminarTema(aid, nombre) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return { pids: [] };
      a.temas = (Array.isArray(a.temas) ? a.temas : []).filter((x) => x !== nombre);
      const pids = [];
      for (const [pid, p] of Object.entries(colProb(aid))) {
        if (p.tema === nombre && !p.borrado) { p.borrado = true; p.borradoEn = Date.now(); pids.push(pid); }
      }
      a.actualizado = Date.now();
      guardar(); emitir(); return { pids };
    },
    async restaurarTema(aid, nombre, pids) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      a.temas = Array.isArray(a.temas) ? a.temas : [];
      if (!a.temas.includes(nombre)) a.temas.push(nombre);
      const col = colProb(aid);
      for (const pid of pids || []) if (col[pid]) { delete col[pid].borrado; delete col[pid].borradoEn; }
      a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },

    async agregarProblemas(aid, problemas) {
      leer();
      const col = colProb(aid);
      let base = Object.values(col).reduce((m, p) => Math.max(m, p.orden || 0), 0);
      for (const p of problemas) {
        const id = nuevoId('p');
        col[id] = { id, ...sanearProblema(p), orden: (base += 1000), creado: Date.now() };
      }
      tocar(aid); guardar(); emitir();
      return problemas.length;
    },
    // Crea (pid = null) o actualiza un problema. Devuelve su id.
    async guardarProblema(aid, pid, d) {
      leer();
      const col = colProb(aid);
      if (pid && col[pid]) {
        col[pid] = { ...col[pid], ...sanearProblema(d), actualizado: Date.now() };
      } else {
        pid = nuevoId('p');
        col[pid] = { id: pid, ...sanearProblema(d), orden: Date.now(), creado: Date.now() };
      }
      tocar(aid); guardar(); emitir();
      return pid;
    },
    async moverProblema(aid, pid, tema) {
      leer();
      const p = colProb(aid)[pid]; if (!p) return false;
      p.tema = sanearNombreTema(tema); p.actualizado = Date.now();
      tocar(aid); guardar(); emitir(); return true;
    },
    async borrarProblema(aid, pid) {
      leer();
      const p = colProb(aid)[pid]; if (!p) return false;
      p.borrado = true; p.borradoEn = Date.now();
      tocar(aid); guardar(); emitir(); return true;
    },
    async restaurarProblema(aid, pid) {
      leer();
      const p = colProb(aid)[pid]; if (!p) return false;
      delete p.borrado; delete p.borradoEn;
      tocar(aid); guardar(); emitir(); return true;
    },
    async eliminarProblemaDefinitivo(aid, pid) {
      leer();
      delete colProb(aid)[pid];
      tocar(aid); guardar(); emitir(); return true;
    },

    async exportarTodo() {
      leer();
      return armarRespaldo(listaAsig().filter((a) => !a.borrado)
        .map((a) => ({ ...a, problemas: listaProb(a.id).filter((p) => !p.borrado) })));
    },
    async importarRespaldo(asignaturas) {
      let np = 0;
      for (const a of asignaturas) {
        const aid = await this.crearAsignatura(a);
        np += await this.agregarProblemas(aid, a.problemas);
      }
      return { asignaturas: asignaturas.length, problemas: np };
    },
    async cargarTodo() {
      leer();
      return listaAsig().filter((a) => !a.borrado).map((a) => ({
        aid: a.id, nombre: a.nombre, problemas: listaProb(a.id).filter((p) => !p.borrado),
      }));
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  Modo Firebase (Firestore + Auth)
// ═════════════════════════════════════════════════════════════════════════

async function crearStoreFirebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const modoGoogle = opciones && opciones.autenticacion === 'google';

  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }

  // ── Sesión y permisos ────────────────────────────────────────────────
  // Todos entran (anónimo) y pueden LEER. En modo «google», solo los correos
  // listados en config/acceso.editores pueden escribir (lo imponen las reglas;
  // aquí solo se lee la lista para mostrar u ocultar los controles de edición).
  const sesion = { puedeEditar: !modoGoogle, usuario: null, soportaLogin: modoGoogle, cargando: true, sinConfig: false };
  const oyentes = new Set();
  const emitirSesion = () => oyentes.forEach((fn) => fn({ ...sesion }));

  async function evaluarSesion(user) {
    const real = user && !user.isAnonymous;
    sesion.usuario = real ? { email: user.email || '', nombre: user.displayName || user.email || '' } : null;
    sesion.sinConfig = false;
    if (!modoGoogle) {
      sesion.puedeEditar = true;
    } else if (!real || !user.emailVerified) {
      sesion.puedeEditar = false;
    } else {
      try {
        const d = await F.getDoc(F.doc(db, 'config', 'acceso'));
        const lista = d.exists() && Array.isArray(d.data().editores)
          ? d.data().editores.map((x) => String(x).toLowerCase()) : [];
        sesion.sinConfig = !d.exists();
        sesion.puedeEditar = lista.includes(String(user.email || '').toLowerCase());
      } catch (e) {
        console.warn('No se pudo leer config/acceso:', e);
        sesion.puedeEditar = false;
      }
    }
    sesion.cargando = false;
    emitirSesion();
  }

  const primero = await new Promise((res) => { const un = A.onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  if (!primero) await A.signInAnonymously(auth);
  await evaluarSesion(auth.currentUser);
  A.onAuthStateChanged(auth, async (u) => {
    if (!u) { try { await A.signInAnonymously(auth); } catch (e) { console.error(e); } return; }
    evaluarSesion(u);
  });

  const uid = () => (auth.currentUser ? auth.currentUser.uid : 'anon');
  const colAsig = () => F.collection(db, 'asignaturas');
  const refAsig = (aid) => F.doc(db, 'asignaturas', aid);
  const colProb = (aid) => F.collection(db, 'asignaturas', aid, 'problemas');
  const refProb = (aid, pid) => F.doc(db, 'asignaturas', aid, 'problemas', pid);
  const tocar = (aid) => F.updateDoc(refAsig(aid), { actualizado: Date.now() }).catch(() => {});

  let cacheTodo = null;
  let cacheT = 0;
  const invalidar = () => { cacheTodo = null; };

  async function enLotes(refs, fnLote) {
    for (let i = 0; i < refs.length; i += 400) {
      const lote = F.writeBatch(db);
      for (const r of refs.slice(i, i + 400)) fnLote(lote, r);
      await lote.commit();
    }
  }

  return {
    modo: 'firebase',
    sesion: () => ({ ...sesion }),
    onSesion(fn) { oyentes.add(fn); queueMicrotask(() => fn({ ...sesion })); return () => oyentes.delete(fn); },
    async iniciarSesionGoogle() {
      const prov = new A.GoogleAuthProvider();
      prov.setCustomParameters({ prompt: 'select_account' });
      await A.signInWithPopup(auth, prov);
    },
    async cerrarSesion() { await A.signOut(auth); },

    suscribirAsignaturas(cb) {
      const q = F.query(colAsig(), F.orderBy('actualizado', 'desc'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    },
    suscribirProblemas(aid, cb) {
      const q = F.query(colProb(aid), F.orderBy('orden'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    },

    async crearAsignatura(d) {
      invalidar();
      const ahora = Date.now();
      const ref = await F.addDoc(colAsig(), { ...sanearAsignatura(d), creadoPor: uid(), creado: ahora, actualizado: ahora });
      return ref.id;
    },
    async actualizarAsignatura(aid, d) {
      invalidar();
      const parche = { actualizado: Date.now() };
      if (d.nombre != null) parche.nombre = recortar(d.nombre, 120) || 'Sin nombre';
      if (d.descripcion != null) parche.descripcion = recortar(d.descripcion, 400);
      await F.updateDoc(refAsig(aid), parche);
      return true;
    },
    async borrarAsignatura(aid) {
      invalidar();
      await F.updateDoc(refAsig(aid), { borrado: true, borradoEn: Date.now(), actualizado: Date.now() });
      return true;
    },
    async restaurarAsignatura(aid) {
      invalidar();
      await F.updateDoc(refAsig(aid), { borrado: F.deleteField(), borradoEn: F.deleteField(), actualizado: Date.now() });
      return true;
    },
    async eliminarAsignaturaDefinitivo(aid) {
      invalidar();
      const s = await F.getDocs(colProb(aid));
      await enLotes(s.docs.map((d) => d.ref), (l, r) => l.delete(r));
      await F.deleteDoc(refAsig(aid));
      return true;
    },

    async agregarTema(aid, nombre) {
      const t = sanearNombreTema(nombre);
      await F.updateDoc(refAsig(aid), { temas: F.arrayUnion(t), actualizado: Date.now() });
      return true;
    },
    async renombrarTema(aid, viejo, nuevo) {
      invalidar();
      const t = sanearNombreTema(nuevo);
      const snap = await F.getDoc(refAsig(aid));
      const temas = (snap.exists() && Array.isArray(snap.data().temas) ? snap.data().temas : []).map((x) => (x === viejo ? t : x));
      if (!temas.includes(t)) temas.push(t);
      const probs = await F.getDocs(F.query(colProb(aid), F.where('tema', '==', viejo)));
      await enLotes(probs.docs.map((d) => d.ref), (l, r) => l.update(r, { tema: t, actualizado: Date.now() }));
      await F.updateDoc(refAsig(aid), { temas: [...new Set(temas)], actualizado: Date.now() });
      return true;
    },
    async eliminarTema(aid, nombre) {
      invalidar();
      const probs = await F.getDocs(F.query(colProb(aid), F.where('tema', '==', nombre)));
      const vivos = probs.docs.filter((d) => !d.data().borrado);
      await enLotes(vivos.map((d) => d.ref), (l, r) => l.update(r, { borrado: true, borradoEn: Date.now() }));
      await F.updateDoc(refAsig(aid), { temas: F.arrayRemove(nombre), actualizado: Date.now() });
      return { pids: vivos.map((d) => d.id) };
    },
    async restaurarTema(aid, nombre, pids) {
      invalidar();
      await enLotes((pids || []).map((pid) => refProb(aid, pid)),
        (l, r) => l.update(r, { borrado: F.deleteField(), borradoEn: F.deleteField() }));
      await F.updateDoc(refAsig(aid), { temas: F.arrayUnion(nombre), actualizado: Date.now() });
      return true;
    },

    async agregarProblemas(aid, problemas) {
      invalidar();
      const s = await F.getDocs(colProb(aid));
      let base = s.docs.reduce((m, d) => Math.max(m, d.data().orden || 0), 0);
      const ahora = Date.now();
      for (let i = 0; i < problemas.length; i += 400) {
        const lote = F.writeBatch(db);
        for (const p of problemas.slice(i, i + 400)) {
          lote.set(F.doc(colProb(aid)), { ...sanearProblema(p), orden: (base += 1000), creado: ahora });
        }
        await lote.commit();
      }
      await tocar(aid);
      return problemas.length;
    },
    async guardarProblema(aid, pid, d) {
      invalidar();
      const datos = sanearProblema(d);
      if (pid) {
        await F.updateDoc(refProb(aid, pid), { ...datos, actualizado: Date.now() });
      } else {
        const ref = await F.addDoc(colProb(aid), { ...datos, orden: Date.now(), creado: Date.now() });
        pid = ref.id;
      }
      await tocar(aid);
      return pid;
    },
    async moverProblema(aid, pid, tema) {
      invalidar();
      await F.updateDoc(refProb(aid, pid), { tema: sanearNombreTema(tema), actualizado: Date.now() });
      await tocar(aid);
      return true;
    },
    async borrarProblema(aid, pid) {
      invalidar();
      await F.updateDoc(refProb(aid, pid), { borrado: true, borradoEn: Date.now() });
      await tocar(aid);
      return true;
    },
    async restaurarProblema(aid, pid) {
      invalidar();
      await F.updateDoc(refProb(aid, pid), { borrado: F.deleteField(), borradoEn: F.deleteField() });
      await tocar(aid);
      return true;
    },
    async eliminarProblemaDefinitivo(aid, pid) {
      invalidar();
      await F.deleteDoc(refProb(aid, pid));
      await tocar(aid);
      return true;
    },

    async cargarTodo() {
      if (cacheTodo && Date.now() - cacheT < 60000) return cacheTodo;
      const s = await F.getDocs(colAsig());
      const vivas = s.docs.filter((d) => !d.data().borrado);
      const res = await Promise.all(vivas.map(async (d) => {
        const ps = await F.getDocs(colProb(d.id));
        return {
          aid: d.id,
          nombre: d.data().nombre,
          temas: d.data().temas,
          descripcion: d.data().descripcion,
          problemas: ps.docs.map((x) => ({ id: x.id, ...x.data() })).filter((p) => !p.borrado)
            .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
        };
      }));
      res.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      cacheTodo = res; cacheT = Date.now();
      return res;
    },
    async exportarTodo() {
      invalidar();
      return armarRespaldo(await this.cargarTodo());
    },
    async importarRespaldo(asignaturas) {
      let np = 0;
      for (const a of asignaturas) {
        const aid = await this.crearAsignatura(a);
        np += await this.agregarProblemas(aid, a.problemas);
      }
      return { asignaturas: asignaturas.length, problemas: np };
    },
  };
}

export async function iniciarStore() {
  if (!firebaseConfig) return { store: crearStoreLocal(), aviso: null };
  try {
    return { store: await crearStoreFirebase(), aviso: null };
  } catch (e) {
    console.error('No se pudo iniciar Firebase; se usa el modo local.', e);
    return { store: crearStoreLocal(), aviso: 'No se pudo conectar con la nube; los cambios se guardan solo en este navegador.' };
  }
}
