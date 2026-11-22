// Avisos (toasts) y confirmaciones propias, en lugar de alert() / confirm().
//   · avisar(): mensajes no bloqueantes, con botón opcional «Deshacer».
//     Viven en una región aria-live para que los lectores de pantalla los anuncien.
//   · confirmar(): diálogo modal accesible que devuelve una promesa booleana.

const el = (id) => document.getElementById(id);

export function avisar(texto, { tipo = '', accion = null, ms = null } = {}) {
  const cont = el('toasts');
  if (!cont) return { cerrar() {} };

  const t = document.createElement('div');
  t.className = 'toast' + (tipo ? ' toast-' + tipo : '');
  // Los errores se anuncian de inmediato; el resto, sin interrumpir.
  t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');

  const span = document.createElement('span');
  span.className = 'toast-texto';
  span.textContent = texto;
  t.appendChild(span);

  let cerrado = false;
  let temporizador = null;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    t.classList.add('saliendo');
    setTimeout(() => t.remove(), 180);
  };

  if (accion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-accion';
    b.textContent = accion.texto;
    b.addEventListener('click', async () => {
      cerrar();
      try { await accion.fn(); } catch (e) { console.error(e); avisar('No se pudo completar la acción: ' + (e?.message || e), { tipo: 'error' }); }
    });
    t.appendChild(b);
  }

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'toast-cerrar';
  x.setAttribute('aria-label', 'Cerrar aviso');
  x.textContent = '×';
  x.addEventListener('click', cerrar);
  t.appendChild(x);

  cont.appendChild(t);
  while (cont.children.length > 4) cont.firstElementChild.remove();

  const duracion = ms ?? (accion ? 9000 : tipo === 'error' ? 9000 : 4500);
  const armar = () => { temporizador = setTimeout(cerrar, duracion); };
  armar();
  t.addEventListener('mouseenter', () => clearTimeout(temporizador));
  t.addEventListener('mouseleave', armar);
  t.addEventListener('focusin', () => clearTimeout(temporizador));
  t.addEventListener('focusout', armar);
  return { cerrar };
}

export function confirmar({ titulo = '¿Confirmar?', texto = '', aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false } = {}) {
  const dlg = el('dlg-confirm');
  el('dlg-confirm-titulo').textContent = titulo;
  el('dlg-confirm-texto').textContent = texto;
  const ok = el('dlg-confirm-ok');
  const no = el('dlg-confirm-no');
  ok.textContent = aceptar;
  no.textContent = cancelar;
  ok.classList.toggle('btn-peligro', peligro);

  return new Promise((resolver) => {
    let resultado = false;
    const alAceptar = () => { resultado = true; dlg.close(); };
    const alCancelar = () => { dlg.close(); };
    const alCerrar = () => {
      ok.removeEventListener('click', alAceptar);
      no.removeEventListener('click', alCancelar);
      dlg.removeEventListener('close', alCerrar);
      resolver(resultado);
    };
    ok.addEventListener('click', alAceptar);
    no.addEventListener('click', alCancelar);
    dlg.addEventListener('close', alCerrar);
    dlg.showModal();
    // En acciones destructivas el foco inicial va en «Cancelar».
    (peligro ? no : ok).focus();
  });
}

// Texto sin tildes y en minúsculas, para búsquedas tolerantes.
export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Favoritos (por navegador): «repasar después».
const CLAVE_FAV = 'banco.favoritos.v1';
let favs = new Set();
try { favs = new Set(JSON.parse(localStorage.getItem(CLAVE_FAV)) || []); } catch { /* vacío */ }
const guardarFavs = () => { try { localStorage.setItem(CLAVE_FAV, JSON.stringify([...favs])); } catch { /* lleno */ } };
if (typeof addEventListener === 'function') {
  addEventListener('storage', (e) => {
    if (e.key === CLAVE_FAV) { try { favs = new Set(JSON.parse(e.newValue) || []); } catch { /* ignore */ } }
  });
}
export const esFavorito = (aid, pid) => favs.has(aid + '/' + pid);
export function alternarFavorito(aid, pid) {
  const k = aid + '/' + pid;
  if (favs.has(k)) favs.delete(k); else favs.add(k);
  guardarFavs();
  return favs.has(k);
}
