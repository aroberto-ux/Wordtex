// Capa de datos. Dos implementaciones con la misma interfaz:
//   · Firebase (Firestore + Auth): edición colaborativa en tiempo real.
//   · Local (localStorage): para probar sin configurar nada.
//
// Estructura en Firestore:
//   documentos/{did}                 { titulo, cfg, biblio, extra, creadoPor, creado, actualizado }
//   documentos/{did}/bloques/{bid}   { orden, j }   (j = el bloque como texto JSON: Firestore no admite
//                                                    listas dentro de listas, y las tablas las tienen)
//   documentos/{did}/presencia/{uid} { nombre, color, bloque, ts }

import { firebaseConfig, opciones } from './firebase-config.js?v=2026.11.07-o';
import { cfgPorDefecto, sanearCfg, sanearBiblio, sanearBloque, nuevoId } from './modelo.js?v=2026.11.07-o';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const COLORES = [210, 150, 28, 280, 340, 190, 100, 250, 12, 170];

function colorDe(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${COLORES[h % COLORES.length]} 62% 42%)`;
}

function nombreGuardado() {
  try { return localStorage.getItem('lv.nombre') || ''; } catch { return ''; }
}

const copia = (o) => JSON.parse(JSON.stringify(o));
const idLocal = (pref) => nuevoId(pref);

/** Aplica un parche con claves "a.b.c" (y BORRAR para eliminar). */
function aplicarParche(obj, parche, BORRAR) {
  for (const [k, v] of Object.entries(parche)) {
    const ruta = k.split('.');
    let o = obj;
    for (let i = 0; i < ruta.length - 1; i++) {
      if (typeof o[ruta[i]] !== 'object' || o[ruta[i]] === null) o[ruta[i]] = {};
      o = o[ruta[i]];
    }
    const ult = ruta[ruta.length - 1];
    if (v === BORRAR) delete o[ult];
    else o[ult] = JSON.parse(JSON.stringify(v));
  }
}

/** Documento tal como llega de fuera (Firebase, JSON importado): se valida todo. */
function docLimpio(id, d) {
  return {
    id, titulo: String(d.titulo || 'Sin título').slice(0, 160),
    cfg: sanearCfg({ ...cfgPorDefecto(), ...(d.cfg || {}) }),
    biblio: sanearBiblio(d.biblio), extra: String(d.extra || '').slice(0, 20000),
    creadoPor: d.creadoPor || '', creado: d.creado || 0, actualizado: d.actualizado || 0,
  };
}

function bloqueDe(id, orden, j) {
  let b = null;
  try { b = typeof j === 'string' ? JSON.parse(j) : j; } catch { /* dañado */ }
  b = b && sanearBloque(b);
  return b ? { id, orden: Number(orden) || 0, ...b } : null;
}

const sinId = (b) => { const { id, orden, ...r } = b; return r; };

// ═════════════════════════════════════════════════════════════════════════
//  Modo local
// ═════════════════════════════════════════════════════════════════════════

function crearStoreLocal() {
  const CLAVE = 'lv.local.v1';
  const BORRAR = Symbol('borrar');
  const uid = (() => {
    try {
      let u = localStorage.getItem('lv.uid');
      if (!u) { u = idLocal('u'); localStorage.setItem('lv.uid', u); }
      return u;
    } catch { return 'u-local'; }
  })();
  const usuario = { uid, nombre: nombreGuardado() || 'Tú', color: colorDe(uid) };

  let datos = { documentos: {}, bloques: {} };
  const leer = () => {
    try { datos = JSON.parse(localStorage.getItem(CLAVE)) || datos; } catch { /* vacío */ }
    datos.documentos ||= {};
    datos.bloques ||= {};
  };
  leer();
  const estado = { pendientes: 0, enLinea: true, error: null };
  const oyentesEstado = new Set();
  const emitEstado = () => oyentesEstado.forEach((cb) => cb({ ...estado }));
  // Escribe en el acto y siempre sobre lo último que haya en localStorage, para que dos pestañas no se pisen.
  const guardar = () => {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); estado.error = null; }
    catch (e) { estado.error = e; }
    emitEstado();
  };

  const oyentes = new Set();
  const emitir = () => { for (const o of Array.from(oyentes)) o.disparar(); };
  if (typeof addEventListener === 'function') {
    addEventListener('storage', (e) => { if (e.key === CLAVE) { leer(); emitir(); } });
  }
  const suscribir = (fn) => {
    const o = { disparar: fn };
    oyentes.add(o);
    queueMicrotask(fn);
    return () => oyentes.delete(o);
  };
  const listaDocs = () => Object.values(datos.documentos).sort((a, b) => b.actualizado - a.actualizado).map(copia);
  const listaBloques = (did) => Object.entries(datos.bloques[did] || {})
    .map(([id, x]) => bloqueDe(id, x.orden, x.j)).filter(Boolean).sort((a, b) => a.orden - b.orden);
  const tocar = (did) => { const d = datos.documentos[did]; if (d) d.actualizado = Date.now(); };
  const cambio = () => { guardar(); emitir(); return true; };

  return {
    modo: 'local',
    BORRAR,
    usuario,
    necesitaLogin: false,
    setNombre(n) { usuario.nombre = n; try { localStorage.setItem('lv.nombre', n); } catch { /* ignorar */ } },
    async iniciarSesionGoogle() { return usuario; },
    suscribirEstado(cb) { oyentesEstado.add(cb); cb({ ...estado }); return () => oyentesEstado.delete(cb); },

    suscribirDocumentos(cb) { return suscribir(() => cb(listaDocs())); },
    suscribirDocumento(did, cb) { return suscribir(() => { const d = datos.documentos[did]; cb(d ? docLimpio(did, d) : null); }); },
    suscribirBloques(did, cb) { return suscribir(() => cb(listaBloques(did))); },

    async crearDocumento({ titulo, cfg, biblio, extra }, bloques) {
      leer();
      const id = idLocal('d');
      const ahora = Date.now();
      datos.documentos[id] = { id, titulo, cfg: copia(cfg), biblio: copia(biblio || []), extra: extra || '', creadoPor: uid, creado: ahora, actualizado: ahora };
      datos.bloques[id] = {};
      bloques.forEach((b, i) => { datos.bloques[id][idLocal('b')] = { orden: (i + 1) * 1000, j: JSON.stringify(sinId(b)) }; });
      cambio();
      return id;
    },
    async actualizarDocumento(did, parche) {
      leer();
      const d = datos.documentos[did]; if (!d) return false;
      aplicarParche(d, { ...parche, actualizado: Date.now() }, BORRAR);
      return cambio();
    },
    async eliminarDocumento(did) { leer(); delete datos.documentos[did]; delete datos.bloques[did]; return cambio(); },

    /** Aplica varios cambios de bloques de una vez: { crear:[{id,orden,bloque}], actualizar:[{id,bloque}], mover:[{id,orden}], eliminar:[id] }. */
    async aplicarBloques(did, ops) {
      leer();
      const col = (datos.bloques[did] ||= {});
      for (const x of ops.eliminar || []) delete col[x];
      for (const x of ops.crear || []) col[x.id] = { orden: x.orden, j: JSON.stringify(sinId(x.bloque)) };
      for (const x of ops.actualizar || []) if (col[x.id]) col[x.id].j = JSON.stringify(sinId(x.bloque));
      for (const x of ops.mover || []) if (col[x.id]) col[x.id].orden = x.orden;
      tocar(did);
      return cambio();
    },

    async exportar(did) {
      const d = datos.documentos[did]; if (!d) throw new Error('No existe el documento');
      const l = docLimpio(did, d);
      return { formato: 'latex-visual-v1', titulo: l.titulo, cfg: l.cfg, biblio: l.biblio, extra: l.extra, bloques: listaBloques(did).map(sinId) };
    },
    async importar(obj) {
      const l = docLimpio('', obj);
      const bl = (obj.bloques || []).map((b) => sanearBloque(b)).filter(Boolean);
      return this.crearDocumento({ titulo: l.titulo, cfg: l.cfg, biblio: l.biblio, extra: l.extra }, bl);
    },

    suscribirPresencia(did, cb) { queueMicrotask(() => cb([])); return () => {}; },
    async publicarPresencia() {},
    async salirPresencia() {},
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  Firebase
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

  const BORRAR = F.deleteField();
  const estado = { pendientes: 0, enLinea: typeof navigator === 'undefined' ? true : navigator.onLine, error: null };
  const oyentesEstado = new Set();
  const emitEstado = () => oyentesEstado.forEach((cb) => cb({ ...estado }));
  if (typeof addEventListener === 'function') {
    addEventListener('online', () => { estado.enLinea = true; emitEstado(); });
    addEventListener('offline', () => { estado.enLinea = false; emitEstado(); });
  }
  function rastrear(promesa) {
    estado.pendientes++; emitEstado();
    return promesa.then(
      (r) => { estado.pendientes--; estado.error = null; emitEstado(); return r === undefined ? true : r; },
      (e) => { estado.pendientes--; estado.error = e; emitEstado(); console.error(e); return false; },
    );
  }

  let user = await new Promise((res) => { const un = A.onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  const usaGoogle = opciones.autenticacion === 'google';
  if (!user && !usaGoogle) { await A.signInAnonymously(auth); user = auth.currentUser; }

  const usuario = { uid: '', nombre: '', color: '' };
  const fijarUsuario = (u) => {
    usuario.uid = u.uid;
    usuario.nombre = (usaGoogle && u.displayName) || nombreGuardado() || 'Anónimo';
    usuario.color = colorDe(u.uid);
  };
  if (user) fijarUsuario(user);

  const refDoc = (did) => F.doc(db, 'documentos', did);
  const colBloques = (did) => F.collection(db, 'documentos', did, 'bloques');
  const refBloque = (did, bid) => F.doc(db, 'documentos', did, 'bloques', bid);
  const refPresencia = (did) => F.doc(db, 'documentos', did, 'presencia', usuario.uid);
  const alError = (e) => { estado.error = e; emitEstado(); console.error(e); };

  let ultimoToque = 0;
  const tocar = (did, lote) => {
    const ahora = Date.now();
    if (lote) { lote.update(refDoc(did), { actualizado: ahora }); return; }
    if (ahora - ultimoToque < 4000) return;
    ultimoToque = ahora;
    F.updateDoc(refDoc(did), { actualizado: ahora }).catch(() => {});
  };

  return {
    modo: 'firebase',
    BORRAR,
    usuario,
    get necesitaLogin() { return !user; },
    setNombre(n) { usuario.nombre = n; try { localStorage.setItem('lv.nombre', n); } catch { /* ignorar */ } },
    async iniciarSesionGoogle() {
      const r = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
      user = r.user; fijarUsuario(user);
      return usuario;
    },
    async cerrarSesion() { await A.signOut(auth); user = null; },
    suscribirEstado(cb) { oyentesEstado.add(cb); cb({ ...estado }); return () => oyentesEstado.delete(cb); },

    suscribirDocumentos(cb) {
      const q = F.query(F.collection(db, 'documentos'), F.orderBy('actualizado', 'desc'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => docLimpio(d.id, d.data()))), alError);
    },
    suscribirDocumento(did, cb) {
      return F.onSnapshot(refDoc(did), (d) => cb(d.exists() ? docLimpio(d.id, d.data()) : null), alError);
    },
    suscribirBloques(did, cb) {
      const q = F.query(colBloques(did), F.orderBy('orden'));
      return F.onSnapshot(q, (s) => cb(s.docs.map((d) => bloqueDe(d.id, d.data().orden, d.data().j)).filter(Boolean)), alError);
    },

    async crearDocumento({ titulo, cfg, biblio, extra }, bloques) {
      const ref = F.doc(F.collection(db, 'documentos'));
      const ahora = Date.now();
      const lote = F.writeBatch(db);
      lote.set(ref, { titulo, cfg, biblio: biblio || [], extra: extra || '', creadoPor: usuario.uid, creado: ahora, actualizado: ahora });
      bloques.forEach((b, i) => { lote.set(F.doc(colBloques(ref.id)), { orden: (i + 1) * 1000, j: JSON.stringify(sinId(b)) }); });
      const ok = await rastrear(lote.commit());
      if (!ok) throw estado.error || new Error('No se pudo crear el documento');
      return ref.id;
    },
    actualizarDocumento(did, parche) { return rastrear(F.updateDoc(refDoc(did), { ...parche, actualizado: Date.now() })); },
    async eliminarDocumento(did) {
      const [b, p] = await Promise.all([F.getDocs(colBloques(did)), F.getDocs(F.collection(db, 'documentos', did, 'presencia'))]);
      for (const d of [...b.docs, ...p.docs]) await F.deleteDoc(d.ref).catch(() => {});
      return rastrear(F.deleteDoc(refDoc(did)));
    },

    async aplicarBloques(did, ops) {
      const todos = [
        ...(ops.eliminar || []).map((id) => ({ k: 'del', id })),
        ...(ops.crear || []).map((x) => ({ k: 'set', id: x.id, v: { orden: x.orden, j: JSON.stringify(sinId(x.bloque)) } })),
        ...(ops.actualizar || []).map((x) => ({ k: 'upd', id: x.id, v: { j: JSON.stringify(sinId(x.bloque)) } })),
        ...(ops.mover || []).map((x) => ({ k: 'upd', id: x.id, v: { orden: x.orden } })),
      ];
      if (!todos.length) return true;
      let ok = true;
      for (let i = 0; i < todos.length; i += 400) {
        const lote = F.writeBatch(db);
        for (const t of todos.slice(i, i + 400)) {
          if (t.k === 'del') lote.delete(refBloque(did, t.id));
          else if (t.k === 'set') lote.set(refBloque(did, t.id), t.v);
          else lote.update(refBloque(did, t.id), t.v);
        }
        if (i + 400 >= todos.length) tocar(did, lote);
        ok = (await rastrear(lote.commit())) && ok;
      }
      return ok;
    },

    async exportar(did) {
      const [p, s] = await Promise.all([F.getDoc(refDoc(did)), F.getDocs(F.query(colBloques(did), F.orderBy('orden')))]);
      if (!p.exists()) throw new Error('No existe el documento');
      const l = docLimpio(did, p.data());
      return {
        formato: 'latex-visual-v1', titulo: l.titulo, cfg: l.cfg, biblio: l.biblio, extra: l.extra,
        bloques: s.docs.map((d) => bloqueDe(d.id, d.data().orden, d.data().j)).filter(Boolean).map(sinId),
      };
    },
    async importar(obj) {
      const l = docLimpio('', obj);
      const bl = (obj.bloques || []).map((b) => sanearBloque(b)).filter(Boolean);
      return this.crearDocumento({ titulo: l.titulo, cfg: l.cfg, biblio: l.biblio, extra: l.extra }, bl);
    },

    suscribirPresencia(did, cb) {
      return F.onSnapshot(F.collection(db, 'documentos', did, 'presencia'), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), () => {});
    },
    publicarPresencia(did, datos) {
      return F.setDoc(refPresencia(did), { nombre: usuario.nombre, color: usuario.color, bloque: null, ...datos, ts: Date.now() }).catch(() => {});
    },
    salirPresencia(did) { return F.deleteDoc(refPresencia(did)).catch(() => {}); },
  };
}

export async function iniciarStore() {
  if (!firebaseConfig) return crearStoreLocal();
  try {
    return await crearStoreFirebase();
  } catch (e) {
    console.error('No se pudo iniciar Firebase; se usa el modo local.', e);
    const s = crearStoreLocal();
    s.errorFirebase = e;
    return s;
  }
}
