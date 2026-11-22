# Banco de problemas

Aplicación web para crear **espacios por asignatura** y reunir **problemas con sus respuestas** para estudiar. Cada asignatura tiene su propio banco de problemas, con búsqueda, filtros, fórmulas matemáticas y diagramas TikZ.

Las asignaturas y los problemas se guardan en la **nube (Firebase/Firestore)** y se comparten entre todos los que abren la página. Si Firebase no está disponible, la app sigue funcionando en modo local (solo en tu navegador).

> El editor LaTeX/Typst anterior de este repositorio se archivó en la carpeta [`old/`](old/). El historial de Git conserva todo.

## Cómo funciona

- **Inicio:** verás las tarjetas de asignaturas. Puedes **crear**, **editar** o **borrar** una asignatura, o **abrirla**.
- **Dentro de una asignatura:** el banco de problemas de esa materia. Busca por texto, filtra por tema o dificultad y pulsa **Mostrar respuesta** para revelar cada solución.
- **Agregar problemas:** arrastra o selecciona archivos `.json` en la zona de carga. Los problemas se guardan en la asignatura abierta, en la nube, para todos.
- **Exportar JSON:** descarga todos los problemas de la asignatura (útil para respaldo o para compartir un archivo).

> ⚠️ **Acceso abierto:** cualquiera que abra la página (sesión anónima) puede crear, editar y **borrar** asignaturas y problemas. Es un banco común. Si en el futuro quieres restringirlo, cambia a login con Google siguiendo la *Variante B* de [`firestore.rules`](firestore.rules).

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
- **Diagramas:** el valor de `diagrama` / `diagrama_respuesta` es código TikZ que [TikZJax](https://tikzjax.com/) compila a SVG en el navegador. Escribe solo el interior del `tikzpicture`. La primera carga descarga el motor (varios MB) y puede tardar unos segundos; luego queda en caché.

Para generar los JSON con una IA, usa el prompt de [`PROMPT_IA.md`](PROMPT_IA.md).

## Estructura del proyecto

```
.
├── index.html          # Página (home de asignaturas + vista de problemas)
├── assets/styles.css   # Estilos (tema claro/oscuro)
├── js/
│   ├── app.js          # Orquestación de vistas y eventos
│   ├── store.js        # Capa de datos (Firestore + localStorage)
│   └── render.js       # TikZ (TikZJax) y fórmulas (MathJax)
├── firebase-config.js  # Configuración de Firebase (clave pública)
├── firestore.rules     # Reglas de seguridad (incluye la colección `asignaturas`)
├── vendor/             # KaTeX empaquetado (del proyecto anterior)
└── old/                # Editor LaTeX/Typst archivado
```

## Configuración de Firestore

Las reglas de [`firestore.rules`](firestore.rules) incluyen un bloque `match /asignaturas/{aid}` para esta app, independiente del editor anterior. Si cambias las reglas en la consola de Firebase, publica ese bloque. Datos en Firestore:

```
asignaturas/{aid}                  { nombre, descripcion, creadoPor, creado, actualizado }
asignaturas/{aid}/problemas/{pid}  { tema, dificultad, enunciado, respuesta,
                                     diagrama, diagrama_respuesta, fuente, orden, creado }
```

## Desarrollo local

Los módulos ES y el `fetch` requieren un servidor (no abras con `file://`):

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Publicar en GitHub Pages

**Settings → Pages → Deploy from a branch**, rama `main`, carpeta `/ (root)`. El archivo `.nojekyll` evita que Jekyll interfiera.
