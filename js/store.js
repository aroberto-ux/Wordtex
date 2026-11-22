// Capa de datos del banco de problemas.
// Dos backends con la misma interfaz:
//   · Firebase (Firestore + Auth anónima): banco común en la nube.
//   · Local (localStorage): si Firebase no está configurado o falla.
//
// Estructura en Firestore (colección independiente del editor):
//   asignaturas/{aid}                   { nombre, descripcion, temas[], creadoPor, creado, actualizado }
//   asignaturas/{aid}/problemas/{pid}   { tema, dificultad, enunciado, respuesta,
//                                         diagrama, diagrama_respuesta, fuente, orden, creado }
//
// Los temas de una asignatura = unión del array `temas` (incluye los vacíos que
// crea el usuario) con los valores `tema` presentes en los problemas.

import { firebaseConfig } from '../firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const DIFICULTADES = ['baja', 'media', 'alta'];

const recortar = (v, n) => String(v ?? '').trim().slice(0, n);

export function sanearNombreTema(v) {
  return recortar(v || 'General', 120) || 'General';
}

export function sanearAsignatura(d) {
  const out = {
    nombre: recortar(d.nombre || 'Sin nombre', 120) || 'Sin nombre',
    descripcion: recortar(d.descripcion, 400),
  };
  // `temas` guarda los temas creados por el usuario (incluidos los vacíos).
  // Los temas que ya tienen problemas no necesitan estar aquí: se derivan.
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

  return {
    modo: 'local',
    suscribirAsignaturas(cb) { return suscribir(() => cb(listaAsig())); },
    suscribirProblemas(aid, cb) { return suscribir(() => cb(listaProb(aid))); },
    asignatura(aid) { const a = datos.asignaturas[aid]; return a ? { ...a } : null; },

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
    async eliminarAsignatura(aid) {
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
      for (const p of Object.values(datos.problemas[aid] || {})) if (p.tema === viejo) p.tema = t;
      a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },
    async eliminarTema(aid, nombre) {
      leer();
      const a = datos.asignaturas[aid]; if (!a) return false;
      a.temas = (Array.isArray(a.temas) ? a.temas : []).filter((x) => x !== nombre);
      const col = datos.problemas[aid] || {};
      for (const [pid, p] of Object.entries(col)) if (p.tema === nombre) delete col[pid];
      a.actualizado = Date.now();
      guardar(); emitir(); return true;
    },

    async agregarProblemas(aid, problemas) {
      leer();
      const col = (datos.problemas[aid] ||= {});
      let base = Object.values(col).reduce((m, p) => Math.max(m, p.orden || 0), 0);
      for (const p of problemas) {
        const id = nuevoId('p');
        col[id] = { id, ...sanearProblema(p), orden: (base += 1000), creado: Date.now() };
      }
      tocar(aid); guardar(); emitir();
      return problemas.length;
    },
    async eliminarProblema(aid, pid) {
      leer();
      if (datos.problemas[aid]) delete datos.problemas[aid][pid];
      tocar(aid); guardar(); emitir(); return true;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  Modo Firebase (Firestore + Auth anónima)
// ═════════════════════════════════════════════════════════════════════════

async function crearStoreFirebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);

  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }

  let user = await new Promise((res) => { const un = A.onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  if (!user) { await A.signInAnonymously(auth); user = auth.currentUser; }
  const uid = user ? user.uid : 'anon';

  const colAsig = () => F.collection(db, 'asignaturas');
  const refAsig = (aid) => F.doc(db, 'asignaturas', aid);
  const colProb = (aid) => F.collection(db, 'asignaturas', aid, 'problemas');
  const refProb = (aid, pid) => F.doc(db, 'asignaturas', aid, 'problemas', pid);

  return {
    modo: 'firebase',
    suscribirAsignaturas(cb) {
      const q = F.query(colAsig(), F.orderBy('actualizado', 'desc'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    },
    suscribirProblemas(aid, cb) {
      const q = F.query(colProb(aid), F.orderBy('orden'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    },
    async asignatura(aid) {
      const d = await F.getDoc(refAsig(aid));
      return d.exists() ? { id: d.id, ...d.data() } : null;
    },

    async crearAsignatura(d) {
      const ahora = Date.now();
      const ref = await F.addDoc(colAsig(), { ...sanearAsignatura(d), creadoPor: uid, creado: ahora, actualizado: ahora });
      return ref.id;
    },
    async actualizarAsignatura(aid, d) {
      // Solo nombre/descripción: no tocar `temas` aquí.
      const parche = { actualizado: Date.now() };
      if (d.nombre != null) parche.nombre = recortar(d.nombre, 120) || 'Sin nombre';
      if (d.descripcion != null) parche.descripcion = recortar(d.descripcion, 400);
      await F.updateDoc(refAsig(aid), parche);
      return true;
    },

    async agregarTema(aid, nombre) {
      const t = sanearNombreTema(nombre);
      await F.updateDoc(refAsig(aid), { temas: F.arrayUnion(t), actualizado: Date.now() });
      return true;
    },
    async renombrarTema(aid, viejo, nuevo) {
      const t = sanearNombreTema(nuevo);
      const snap = await F.getDoc(refAsig(aid));
      const temas = (snap.exists() && Array.isArray(snap.data().temas) ? snap.data().temas : []).map((x) => (x === viejo ? t : x));
      if (!temas.includes(t)) temas.push(t);
      // Reasignar el tema en los problemas afectados.
      const probs = await F.getDocs(F.query(colProb(aid), F.where('tema', '==', viejo)));
      for (let i = 0; i < probs.docs.length; i += 400) {
        const lote = F.writeBatch(db);
        for (const dd of probs.docs.slice(i, i + 400)) lote.update(dd.ref, { tema: t });
        await lote.commit();
      }
      await F.updateDoc(refAsig(aid), { temas: [...new Set(temas)], actualizado: Date.now() });
      return true;
    },
    async eliminarTema(aid, nombre) {
      // Borrar los problemas del tema y quitarlo del array.
      const probs = await F.getDocs(F.query(colProb(aid), F.where('tema', '==', nombre)));
      for (let i = 0; i < probs.docs.length; i += 400) {
        const lote = F.writeBatch(db);
        for (const dd of probs.docs.slice(i, i + 400)) lote.delete(dd.ref);
        await lote.commit();
      }
      await F.updateDoc(refAsig(aid), { temas: F.arrayRemove(nombre), actualizado: Date.now() });
      return true;
    },
    async eliminarAsignatura(aid) {
      const s = await F.getDocs(colProb(aid));
      for (let i = 0; i < s.docs.length; i += 400) {
        const lote = F.writeBatch(db);
        for (const d of s.docs.slice(i, i + 400)) lote.delete(d.ref);
        await lote.commit();
      }
      await F.deleteDoc(refAsig(aid));
      return true;
    },

    async agregarProblemas(aid, problemas) {
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
      await F.updateDoc(refAsig(aid), { actualizado: ahora }).catch(() => {});
      return problemas.length;
    },
    async eliminarProblema(aid, pid) {
      await F.deleteDoc(refProb(aid, pid));
      await F.updateDoc(refAsig(aid), { actualizado: Date.now() }).catch(() => {});
      return true;
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
