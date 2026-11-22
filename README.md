# Banco de problemas

Aplicación web para crear **espacios por asignatura**, dividirlos en **temas** y reunir **problemas con sus respuestas** para estudiar. La jerarquía es Asignatura → Tema → Problemas, con búsqueda, filtro por dificultad, fórmulas matemáticas y diagramas TikZ.

Las asignaturas y los problemas se guardan en la **nube (Firebase/Firestore)** y se comparten entre todos los que abren la página. Si Firebase no está disponible, la app sigue funcionando en modo local (solo en tu navegador).

> El editor LaTeX/Typst anterior de este repositorio se archivó en la carpeta [`old/`](old/). El historial de Git conserva todo.

## Cómo funciona

- **Inicio:** tarjetas de asignaturas. Puedes **crear**, **editar**, **borrar** o **abrir** una asignatura.
- **Dentro de una asignatura:** tarjetas de **temas**. Puedes **crear** un tema (incluso vacío), **renombrarlo** o **borrarlo**. Cada tarjeta muestra cuántos problemas tiene. Los temas aparecen automáticamente a partir del campo `tema` de los problemas, más los que crees a mano.
- **Dentro de un tema:** sus problemas. Busca por texto, filtra por dificultad y pulsa **Mostrar respuesta** para revelar la solución.
- **Agregar problemas:** arrastra o selecciona archivos `.json` dentro de un tema. Todos los problemas del archivo se asignan a ese tema (sobrescribiendo su campo `tema`). Se guardan en la nube, para todos.
- **Exportar JSON:** descarga los problemas del tema abierto.

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
- **Diagramas:** el valor de `diagrama` / `diagrama_respuesta` es código TikZ que el intérprete incluido en el repositorio convierte directamente a SVG. No requiere un motor externo ni una descarga WebAssembly. Escribe solo el interior del `tikzpicture`; también se aceptan bloques completos. Soporta las instrucciones habituales de dibujo y muestra avisos cuando aproxima una función avanzada.

Para generar los JSON con una IA, usa el prompt de [`PROMPT_IA.md`](PROMPT_IA.md).

## Estructura del proyecto

```
.
├── index.html          # Página (home de asignaturas + vista de problemas)
├── assets/styles.css   # Estilos (tema claro/oscuro)
├── js/
│   ├── app.js          # Orquestación de vistas y eventos
│   ├── store.js        # Capa de datos (Firestore + localStorage)
│   └── render.js       # Diagramas TikZ locales y fórmulas (MathJax)
├── firebase-config.js  # Configuración de Firebase (clave pública)
├── firestore.rules     # Reglas de seguridad (incluye la colección `asignaturas`)
├── vendor/             # KaTeX empaquetado (del proyecto anterior)
└── old/                # Editor LaTeX/Typst archivado
```

## Configuración de Firestore

Las reglas de [`firestore.rules`](firestore.rules) incluyen un bloque `match /asignaturas/{aid}` para esta app, independiente del editor anterior. Si cambias las reglas en la consola de Firebase, publica ese bloque. Datos en Firestore:

```
asignaturas/{aid}                  { nombre, descripcion, temas[], creadoPor, creado, actualizado }
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
