// Estado compartido entre las vistas (lista, editor).

export const S = {
  store: null,
  did: null,
  doc: null,        // { id, titulo, cfg, biblio, extra }
  bloques: [],      // [{ id, orden, t, … }] en orden
  sel: null,        // id del bloque con el cursor
  undo: [],
  redo: [],
  usuarios: [],
  vista: 'visual',  // visual | codigo | dividida
};

export const E = {}; // referencias a nodos del DOM, se llenan en app.js
