# Banco de problemas

Aplicación web para crear **espacios por asignatura**, dividirlos en **temas** y reunir **problemas con sus respuestas** para estudiar. La jerarquía es Asignatura → Tema → Problemas, con búsqueda, filtro por dificultad, fórmulas matemáticas y diagramas TikZ.

Las asignaturas y los problemas se guardan en la **nube (Firebase/Firestore)** y se comparten entre todos los que abren la página. Si Firebase no está disponible, la app sigue funcionando en modo local (solo en tu navegador).

> El editor LaTeX/Typst anterior de este repositorio se archivó en la carpeta [`old/`](old/). El historial de Git conserva todo.

## Cómo funciona

- **Inicio:** tarjetas de asignaturas. Puedes **crear**, **editar**, **borrar** o **abrir** una asignatura, **buscar en todo el banco**, **exportar todo** (respaldo) e **importar un respaldo**.
- **Dentro de una asignatura:** tarjetas de **temas** (crear, renombrar, borrar), buscador de **toda la asignatura** y **Modo estudio**.
- **Dentro de un tema:** sus problemas. Busca por texto (sin distinguir tildes ni mayúsculas), filtra por dificultad o por ★ favoritos, y pulsa **Mostrar respuesta**. Cada problema se puede **editar**, **mover** a otro tema, **eliminar** y marcar como **favorito**.
- **Nuevo problema / Editar:** formulario con **vista previa en vivo** de las fórmulas y de los diagramas TikZ. Si cierras con cambios sin guardar, te pregunta.
- **Agregar problemas en lote:** arrastra o selecciona archivos `.json` dentro de un tema (el campo `tema` se sustituye por el tema abierto).
- **Exportar JSON:** descarga los problemas del tema abierto.

### Seguridad: quién puede editar

Cualquiera puede **leer** el banco. Solo pueden **editar** las cuentas de Google autorizadas (`autenticacion: 'google'` en [`firebase-config.js`](firebase-config.js)). Las reglas de [`firestore.rules`](firestore.rules) lo imponen en el servidor; la página solo oculta los botones de edición a quien no tiene permiso.

Puesta en marcha (una sola vez):

1. **Authentication → Método de acceso:** habilita **Google** (deja **Anónimo** habilitado: lo usan los visitantes para leer). En **Authentication → Configuración → Dominios autorizados**, añade el dominio donde publicas (p. ej. `usuario.github.io`).
2. **Firestore → Datos:** crea la colección `config` con un documento de ID `acceso` y un campo `editores` de tipo *array* con tus correos **en minúsculas**, p. ej. `["tucorreo@gmail.com"]`. Para dar o quitar permisos basta con editar esa lista; no hay que republicar nada.
3. **Firestore → Reglas:** publica el contenido de [`firestore.rules`](firestore.rules) (conserva el bloque de `documentos` si usas el editor LaTeX).
4. Abre la página, pulsa **Iniciar sesión con Google**: deberías ver tu correo con la etiqueta «editor».

Hasta completar los pasos 2 y 3 la página queda en **solo lectura** (no se pierde nada). Para volver al banco abierto, pon `autenticacion: 'anonima'` y usa la variante abierta comentada en las reglas.

### Borrar es recuperable

Eliminar una asignatura, un tema o un problema **no los destruye**: se mueven a la **Papelera** (botón *Papelera* en el inicio y dentro de cada asignatura) y aparece un aviso con **Deshacer**. Solo *Eliminar para siempre*, desde la papelera y con confirmación, borra de verdad.

### Respaldo

**Exportar todo** (inicio) descarga `banco-respaldo-AAAA-MM-DD.json` con todas las asignaturas, temas y problemas activos. **Importar respaldo** lo restaura creando asignaturas nuevas (no sobrescribe nada). Conviene guardar un respaldo de vez en cuando.

### Modo estudio

Desde una asignatura (todos los temas) o desde un tema: problemas en **orden aleatorio**, de uno en uno y con la respuesta oculta. Tras ver la respuesta, marca **Lo sabía** (sale del mazo) o **Repasar de nuevo** (vuelve al final). Filtros por dificultad y por favoritos. Atajos: `Espacio` muestra la respuesta, `←` repasar, `→` lo sabía, `F` favorito.

> Los **favoritos** se guardan en este navegador (no se comparten ni se sincronizan entre dispositivos).

### Accesibilidad

Diálogos modales con foco gestionado, avisos y contadores en regiones `aria-live`, foco visible en todos los controles y el título de cada vista recibe el foco al navegar. En modo oscuro los diagramas TikZ **no se invierten**: los de tonos neutros adoptan los colores del tema y los que usan colores reales se muestran sobre un panel claro, tal como se dibujaron.

## Formato del JSON de problemas

Puedes subir una **lista** de problemas, un **único** problema, o un objeto `{ "problemas": [ ... ] }`. Campos de cada problema:

| Campo                | Requerido | Descripción |
|----------------------|-----------|-------------|
| `tema`               | No        | Tema (p. ej. `Torsión`). Por defecto `General`. |
| `dificultad`         | No        | `baja`, `media` o `alta`. |
| `enunciado`          | **Sí**    | Texto del problema. Admite LaTeX con `\( ... \)`. |
| `diagrama`           | No        | Código TikZ de un diagrama para el enunciado. |
| `respuesta`          | No        | Solución. Admite LaTeX. |
| `diagrama_respuesta` | No        | Código TikZ de un diagrama para la respuesta. |
| `fuente`             | No        | Libro o referencia. |

- **Fórmulas:** LaTeX entre `\( ... \)` (en línea) o `\[ ... \]` (centradas), renderizadas con [MathJax](https://www.mathjax.org/). En JSON la barra invertida va **doble**: `\\( \\sigma = P/A \\)`.
- **Diagramas:** el valor de `diagrama` / `diagrama_respuesta` es código TikZ que el intérprete incluido en el repositorio convierte directamente a SVG. No requiere un motor externo ni una descarga WebAssembly. Escribe solo el interior del `tikzpicture`; también se aceptan bloques completos. Soporta las instrucciones habituales de dibujo y muestra avisos cuando aproxima una función avanzada.

Para generar los JSON con una IA, usa el prompt de [`PROMPT_IA.md`](PROMPT_IA.md).

## Estructura del proyecto

```
.
├── index.html          # Página (home de asignaturas + vista de problemas)
├── assets/styles.css   # Estilos (tema claro/oscuro)
├── js/
│   ├── app.js          # Vistas, formulario, estudio, papelera, búsqueda
│   ├── store.js        # Capa de datos (Firestore + Auth, o localStorage)
│   ├── ui.js           # Avisos, confirmaciones, favoritos y búsqueda sin tildes
│   └── render.js       # Diagramas TikZ locales (con adaptación al tema) y fórmulas
├── firebase-config.js  # Configuración de Firebase (clave pública)
├── firestore.rules     # Reglas de seguridad (incluye la colección `asignaturas`)
├── vendor/             # KaTeX empaquetado (del proyecto anterior)
└── old/                # Editor LaTeX/Typst archivado
```

## Configuración de Firestore

Las reglas de [`firestore.rules`](firestore.rules) incluyen un bloque `match /asignaturas/{aid}` para esta app, independiente del editor anterior. Si cambias las reglas en la consola de Firebase, publica ese bloque. Datos en Firestore:

```
config/acceso                      { editores: ['correo@dominio', ...] }     (solo a mano, en la consola)
asignaturas/{aid}                  { nombre, descripcion, temas[], creadoPor, creado, actualizado,
                                     borrado?, borradoEn? }
asignaturas/{aid}/problemas/{pid}  { tema, dificultad, enunciado, respuesta,
                                     diagrama, diagrama_respuesta, fuente, orden, creado,
                                     actualizado?, borrado?, borradoEn? }
```

## Desarrollo local

Los módulos ES y el `fetch` requieren un servidor (no abras con `file://`):

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Publicar en GitHub Pages

**Settings → Pages → Deploy from a branch**, rama `main`, carpeta `/ (root)`. El archivo `.nojekyll` evita que Jekyll interfiera.
