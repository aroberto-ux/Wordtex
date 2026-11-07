# LaTeX visual

Editor de documentos LaTeX **que se usa como Word**. Quien no sabe LaTeX escribe, da formato, inserta tablas, figuras y ecuaciones con una cinta de opciones; quien sí sabe puede abrir la vista de código y editar el `.tex` directamente. Las dos vistas están sincronizadas en ambos sentidos.

Es una página estática (HTML + módulos JS, sin compilación) pensada para **GitHub Pages**. Funciona sola, guardando en el navegador, y opcionalmente con **Firebase** para editar entre varias personas al mismo tiempo.

## Qué incluye

- **Edición tipo Word**: negrita, cursiva, subrayado, tachado, superíndice/subíndice, monoespaciado, títulos (sección / subsección / …), listas con viñetas, numeradas y anidadas (Tab / Shift+Tab), alineación, citas, resúmenes, teoremas/definiciones/lemas/demostraciones, bloques de código, tabla de contenidos, saltos de página.
- **Tablas** (agregar/quitar filas y columnas, encabezado, bordes, alineación por columna) y **figuras** (subir imagen, ancho, pie de figura).
- **Ecuaciones** con un editor propio: se escribe en LaTeX con vista previa en vivo (MathJax 3) y una paleta de símbolos (griegas, operadores, flechas, fracciones, raíces, sumatorias…). También ecuaciones en línea.
- **Notas al pie, referencias cruzadas, citas y bibliografía**, enlaces.
- **Numeración como en LaTeX** (secciones, ecuaciones, figuras, tablas, teoremas) y **vista de página** con aspecto de documento compilado.
- **Menú `/`** para insertar bloques escribiendo, atajos de teclado, deshacer/rehacer, arrastrar bloques.
- **Vista de código**: el `.tex` completo, editable. Lo que no se entiende se conserva tal cual (como bloque «LaTeX avanzado»), que se puede reintentar convertir en editable desde su menú. Nada se pierde. Navegación bidireccional como en Overleaf: **doble clic** en el documento lleva el cursor del código a esa parte, y mover el cursor en el código resalta el bloque en el documento.
- **LaTeX avanzado con vista previa**: lo que no tiene editor propio se ve renderizado encima de su código (ecuaciones con MathJax, tablas con `\multicolumn`/`\multirow`, `minipage` y entornos propios, `\hrule`, `\vspace`, `\input`, `\bibliography`…). El código está en «Ver/editar código» y la vista previa lo sigue mientras se escribe. En el texto, `\textcolor`, `\textsc`, `\verb`, `\lstinline`, `\today`, `\LaTeX` o `{\small …}` se ven con su formato y se editan con un clic.
- **Dibujos TikZ**: bloque propio con vista previa en vivo, editor de código al lado, **herramienta de dibujo** (línea, flecha, rectángulo, círculo, texto, borrar; cuadrícula, ajuste, color y grosor) y plantillas (ejes cartesianos, diagrama de flujo, grafo, triángulo con ángulos, árbol). `\usepackage{tikz}` y las `\usetikzlibrary` necesarias se añaden solas.
- **Plantillas**: en blanco, artículo, tarea, apuntes, informe y carta.
- **Panel lateral**: esquema, ajustes del documento (clase, fuente, papel, márgenes, idioma, interlineado, columnas, portada), referencias, preámbulo avanzado y ayuda.
- **Exportar**: `.tex`, `.zip` (con el `.tex` y la carpeta `imagenes/`, listo para compilar), PDF (imprimiendo la vista de página), **abrir en Overleaf** y copia de seguridad `.json`. Antes de exportar hay una revisión en lenguaje sencillo de imágenes/archivos faltantes, referencias y citas rotas, etiquetas repetidas y requisitos de XeLaTeX/LuaLaTeX. También se puede **importar** un `.tex` o un `.json`.
- **Colaboración** (con Firebase): cada bloque se guarda por separado, así que dos personas pueden escribir a la vez en bloques distintos sin pisarse; se ven los avatares de quienes están en el documento.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `latex-visual`).
2. Sube **todos** los archivos de este zip a la raíz del repositorio (arrastrándolos en *Add file → Upload files*). Debe quedar `index.html` en la raíz.
3. En *Settings → Pages* elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`.
4. Espera un minuto y abre `https://TU-USUARIO.github.io/latex-visual/`.

Con eso ya funciona en **modo local**: los documentos se guardan en el navegador de cada persona (no se comparten).

> Al actualizar la página sube los archivos nuevos **sin sobrescribir `firebase-config.js`** si ya pegaste tu configuración. La versión que estás viendo aparece al pie de la lista de documentos y en `<meta name="app-version">` de `index.html`. Si tras actualizar ves algo viejo, recarga con Ctrl+Shift+R.

## Activar la edición colaborativa (opcional)

1. Entra a <https://console.firebase.google.com> y crea un proyecto (o **reutiliza el de tu página de presentaciones**: los documentos van en su propia colección `documentos`).
2. *Compilación → Authentication → Método de acceso*: activa **Anónimo** (y **Google** si quieres limitar quién edita).
3. *Compilación → Firestore Database → Crear base de datos*.
4. *Configuración del proyecto → Tus apps → Web (`</>`)*: registra una app y copia el objeto `firebaseConfig`.
5. Pégalo en `firebase-config.js` (reemplaza `null`) y súbelo al repositorio.
6. En *Firestore → Reglas* pega el contenido de `firestore.rules` (variante A, abierta con enlace, o variante B, solo con cuenta de Google). **Si ya tienes reglas de otra página no las borres**: añade solo el bloque `match /documentos/{did} { … }` dentro de `match /databases/{database}/documents { … }`.
7. En *Authentication → Configuración → Dominios autorizados* añade `TU-USUARIO.github.io`.

Cuando la configuración está bien, la lista de documentos pasa a ser compartida: quien tenga el enlace de un documento (`…/#documentos/ID`) lo edita junto con los demás.

## Cómo se obtiene el PDF

La página **no compila LaTeX dentro del navegador**. Opciones:

- **Imprimir / guardar como PDF** desde *Exportar*: usa la vista de página (aspecto parecido, no idéntico, al de LaTeX; el diseño a dos columnas solo se ve al compilar).
- **Abrir en Overleaf**: envía el `.tex` y las imágenes a Overleaf, que compila con LaTeX real.
- **Descargar `.zip`** y compilar con `pdflatex` (o cualquier distribución) en tu computador.

## Estructura de archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css` | Página y estilos |
| `app.js` | Enrutador (`#documentos` y `#documentos/ID`) |
| `lista.js` | Lista de documentos, nuevo documento con plantillas, importar |
| `editor.js` | Armado del editor: cinta, páginas, vista de código, divisor |
| `modelo.js` | Modelo del documento y saneado de datos |
| `latex-gen.js` | Modelo → código LaTeX |
| `latex-parse.js` | Código LaTeX → modelo |
| `sync.js` | Diferencias entre bloques (vista de código y colaboración) |
| `store.js` | Almacenamiento: local o Firebase |
| `ops.js`, `acciones.js`, `eventos.js` | Estado, deshacer, formato, teclado y arrastre |
| `bloques-dom.js`, `inline-dom.js`, `numerar.js` | Dibujo de bloques, texto en línea y numeración |
| `matematica.js`, `dialogos.js`, `paneles.js`, `codigo.js` | Editor de ecuaciones, ventanas, panel lateral, vista de código |
| `resaltar.js` | Coloreado de sintaxis LaTeX de la vista de código (función pura, con pruebas) |
| `autocompletar.js` | Sugerencias de comandos y entornos LaTeX en la vista de código |
| `exportar.js`, `plantillas.js` | Exportaciones y plantillas |
| `vista-latex.js` | Vistas previas del LaTeX avanzado (bloques y fragmentos en línea) |
| `tikz.js`, `tikz-libs.js` | Intérprete de TikZ a SVG para la vista previa; librerías que necesita cada dibujo |
| `tikz-editor.js`, `tikz-dibujo.js`, `tikz-plantillas.js` | Editor de dibujos, herramienta de dibujo visual y plantillas TikZ |
| `firebase-config.js`, `firestore.rules` | Configuración y reglas de Firebase |
| `mathjax-config.js`, `mathjax.js` | Configuración de MathJax 3 (tex-chtml, desde CDN) y capa que compone fórmulas por lotes, con debounce y `typesetClear` |
| `vendor/katex/fonts/` | Solo las tipografías (Latin Modern) de la vista de página; el motor de fórmulas ya no es KaTeX |
| `tests/` | Pruebas automáticas (no hace falta subirlas a GitHub Pages, pero no estorban) |

## Calidad del LaTeX generado

- **Compila siempre** con pdfLaTeX en TeX Live, MiKTeX u Overleaf: cada paquete se carga solo si hace falta (también los que usan tus ecuaciones y tu LaTeX avanzado: xcolor, colortbl, array, tabularx, longtable, makecell, multirow, float, multicol, wrapfig, caption, subcaption, enumitem, siunitx, bm, cancel, mathtools, mathrsfs, bbm, mhchem; nunca se repite uno que ya cargue tu preámbulo propio), una figura sin imagen sale como recuadro «Imagen pendiente», la clase *Libro* recibe un entorno de resumen, los saltos de línea dentro de celdas usan una tabla anidada y nunca se escribe `\\` al principio de un párrafo.
- **Tipografía cuidada**: `microtype`, `lmodern`, `booktabs` para tablas con líneas horizontales, pie de tabla arriba y de figura abajo, flotantes `[htbp]`, metadatos del PDF (título y autor) y, en español, «Tabla» en vez de «Cuadro» (`es-tabla`).
- **Ida y vuelta estable**: lo que genera la página lo vuelve a leer sin perder nada (símbolos como α, ≤ o ° incluidos) y entrar o salir de la vista de código no cambia el documento si no se editó.
- **Misma numeración que el PDF**: figuras y tablas se numeran solo si tienen pie, y en `align` las filas con `\nonumber` no cuentan.

## Pruebas

Con [Node.js](https://nodejs.org) 18 o más reciente, desde la carpeta del proyecto:

```bash
node --test tests/*.test.mjs   # núcleo, LaTeX avanzado, TikZ y herramienta de dibujo (segundos)
node tests/muestra.mjs         # informe del .tex de muestra: bloques, cuáles quedan como avanzados, ida y vuelta
node tests/compilar.mjs        # compila con pdflatex plantillas, un documento con todo (3 clases × 6 idiomas) y la muestra
```

La segunda necesita `pdflatex`; si a tu instalación le falta algún idioma de babel o `ulem`, lo avisa y lo sustituye para probar el resto.

## Dibujos TikZ: cómo funciona la vista previa

La página **no ejecuta TeX**: la vista previa la dibuja un intérprete propio (`tikz.js`) que traduce a SVG el TikZ habitual: `\draw`, `\fill`, `\filldraw`, `\path`, `\node`, `\coordinate`, `\foreach` (con `...`, varias variables y `count`), `scope`, `\tikzset`/`\tikzstyle`, `\pgfmathsetmacro`, `\definecolor`; caminos con `--`, `-|`, `|-`, `rectangle`, `circle`, `ellipse`, `arc`, `grid`, curvas `.. controls ..`, `to[out=…, in=…]`, `bend left/right`, `edge`, `plot` (funciones y `coordinates`) y árboles con `child`; coordenadas cartesianas, polares, relativas, de nodos y anclas, y `($(a)!0.5!(b)$)`; colores de xcolor con mezclas, grosores, discontinuas, flechas, opacidad, esquinas redondeadas, `scale`/`shift`/`rotate` y `right=of a`. Lo que no entiende aparece como aviso bajo el dibujo y **sí** sale en el PDF, porque el `.tex` lleva el código original.

Se descartó [TikZJax](https://tikzjax.com) (TeX real en WebAssembly): pesa varios MB, tarda segundos por dibujo, depende de cargar archivos externos (no hay versiones publicadas del proyecto original) y su licencia (LPPL 1.3c) obliga a distribuir sus archivos con condiciones propias. El intérprete propio es instantáneo, funciona sin conexión y el SVG se imprime con la vista de página.

## Límites que conviene conocer

- No hay compilación real a PDF en el navegador (ver arriba). La vista de página es una aproximación.
- «Abrir en Overleaf» y el modo Firebase se probaron de forma limitada: el primero depende de Overleaf, el segundo requiere tu proyecto de Firebase.
- Al **importar un `.tex`**, los comentarios al final de una línea (`texto % nota`) se descartan; los comentarios de línea completa se conservan. La `~` (espacio fijo) pasa a ser un espacio normal. Lo que el editor no reconoce se conserva como LaTeX crudo, y los paquetes que ese LaTeX necesita se siguen cargando.
- Si **editas** en la vista de código, al salir se vuelve a formatear el `.tex`. Si solo lo miras, no se toca nada.
- **TikZ en la vista previa** (en el PDF todo sale bien): no se dibujan `pic`, `\matrix`, decoraciones, `pattern` (se ve gris), sombreados (`\shade`, se ve gris), `\clip` (no recorta), `let`, intersecciones, 3D, `pgfplots` (`axis`), formas de `shapes` distintas de rectángulo, círculo, elipse y rombo, ni `foreach` dentro de un camino. El tamaño del texto de los nodos es aproximado.
- La **herramienta de dibujo** solo edita líneas, flechas, rectángulos, círculos y textos sencillos (`\draw[color, grosor] (a) -- (b);` y similares); el resto del código se conserva y se ve de fondo, pero no se mueve ni se borra desde ahí. Trabaja en las coordenadas del código (tiene en cuenta `scale`, no `rotate` ni `shift` de la imagen).
- Al importar, `\newtheorem` con contador compartido (`\newtheorem{lemma}[theorem]{Lema}`) pasa a usar un contador propio por tipo de enunciado.
- Deshacer/rehacer cubre el contenido de los bloques; los cambios de ajustes del documento no se deshacen.
- El tachado usa el paquete `ulem` y los idiomas usan `babel`; deben estar instalados al compilar (Overleaf y las instalaciones completas de TeX Live/MiKTeX los traen).
- Las imágenes se incrustan en el documento (se reducen a un tamaño razonable); no es un gestor de archivos grandes.

## Problemas frecuentes

- **Veo la versión vieja**: recarga con Ctrl+Shift+R.
- **«No se pudo conectar con Firebase; se usa el modo local»**: revisa `firebase-config.js`, que Anónimo esté activado y que tu dominio esté en los dominios autorizados.
- **No se guardan los cambios en Firebase**: revisa las reglas de Firestore (el aviso de estado arriba muestra errores de permisos).
- **No aparece la lista de documentos de otra persona**: en modo local cada navegador tiene los suyos; hace falta Firebase para compartir.

## Cambios

**2026.11.07-f**
- **Tema claro / oscuro manual**: botón en la barra del editor que cambia entre *sistema*, *claro* y *oscuro*. Antes el modo oscuro solo seguía al sistema operativo; ahora se puede forzar y se recuerda. Se aplica antes de pintar, sin parpadeo.
- **Aspecto más cuidado**: la página del documento «flota» como papel real (sombra más rica, esquinas apenas redondeadas) sobre una zona de trabajo con un degradado suave; microtransiciones en botones, cinta, tarjetas y resaltados para que todo se sienta fluido. Respeta `prefers-reduced-motion`.

**2026.11.07-e**
- **Sugerencias de código LaTeX** en la vista de código: al escribir `\` seguido de letras aparece un menú con comandos frecuentes (`\section`, `\textbf`, `\frac`, `\includegraphics`, griegas, referencias…) y, dentro de `\begin{…}`, con entornos (`itemize`, `figure`, `table`, `align`, `pmatrix`…). Se navega con ↑/↓, se acepta con Enter o Tab, se cierra con Esc, y las plantillas dejan el cursor en el hueco. `Ctrl+Espacio` lo abre a demanda.
- **Barras de desplazamiento más finas** y discretas en toda la aplicación.

**2026.11.07-d**
- **Sincronización código → documento** (SyncTeX directo, como en Overleaf): al mover el cursor en la vista de código, el bloque correspondiente se resalta en la vista del documento y se desplaza hasta él. Junto con el «doble clic → código» ya existente, la navegación entre vistas es bidireccional.
- **Convertir «LaTeX avanzado» en editable**: en el menú (⋮) de un bloque de LaTeX avanzado hay una opción «Convertir en editable» que lo vuelve a interpretar con el parser actual. Sirve para documentos guardados antes de que el editor supiera reconocer algo (listas, tablas con `\multirow`…) sin tener que volver a pegar el código. Si no se puede representar, el bloque se queda como estaba.

**2026.11.07-c**
- **Doble clic → código** (como el SyncTeX inverso de Overleaf): al hacer doble clic en cualquier parte del documento, el editor de código LaTeX salta a la línea de ese bloque y la resalta. Si estabas en la vista «Visual», se abre la vista «Dividida» para que el código sea visible.

**2026.11.07-b**
- Listas: un `\item` seguido solo de `[texto]` (p. ej. `\item [Ensayo 1: …]`) en `itemize`/`enumerate` ahora se lee como el **contenido** del elemento, no como una viñeta propia que dejaba el elemento vacío. Las etiquetas de verdad (`\item[a)] texto`) y las listas de descripción no cambian.

**2026.11.07-a**
- **Celdas fusionadas editables y sin pérdida**: `\multicolumn` y los casos comunes de `\multirow` se importan como celdas HTML fusionadas, se pueden editar visualmente y se vuelven a exportar conservando sus spans, alineación y ancho. La cinta permite unir a la derecha/abajo y separar. Para evitar corrupción, insertar o eliminar filas/columnas queda bloqueado hasta separar las celdas fusionadas.
- Las tablas `tabularx`/`tabulary` conservan su entorno, ancho y especificación avanzada de columnas. Si una tabla usa reglas parciales (`\cline`, `\cmidrule`) o espaciado explícito por fila, permanece como LaTeX avanzado hasta que Wordtex pueda reproducirlo exactamente.
- **Revisión antes de exportar**: detecta imágenes y archivos externos faltantes, referencias sin destino, citas sin bibliografía, etiquetas repetidas y documentos que parecen requerir XeLaTeX/LuaLaTeX. Se puede abrir desde Exportar y aparece antes de descargar `.tex`/`.zip` o enviar a Overleaf. Ignora comentarios, `verbatim`, `lstlisting`, `minted` y `\verb` para evitar falsos avisos.

**2026.11.06-d**
- **Muchos más paquetes de LaTeX se cargan solos** para que el `.tex` compile como en Overleaf sin tocar el preámbulo: `esint`, `stmaryrd`, `upgreek`, `dsfont`, `extarrows`, `centernot`, `nicefrac`, `tensor`, `csquotes`, `gensymb`, `textcomp`, `ragged2e`, `soul`, `cleveref` (se carga después de `hyperref`, como debe ser), `fancyhdr`, `titlesec`, `placeins`, `tcolorbox`, `mdframed`, `adjustbox`, `rotating`, `pdfpages`, `algorithm`/`algpseudocode`, `algorithm2e`, `tikz-cd` y `siunitx` ampliado. Al importar, estos paquetes sin opciones ya no se duplican.
- **Tablas más parecidas a Overleaf**: las columnas con ancho fijo (`p{…}`, `m{…}`, `b{…}`), decoradores (`>{…}`, `<{…}`, `@{…}`, `!{…}`), `*{n}{…}`, la columna `X` de **tabularx**/**tabulary** y el **`\multicolumn`** ya se importan como tabla editable en vez de quedar como «LaTeX avanzado». La versión siguiente añadió preservación semántica de spans y `\multirow`.
- **Listas anidadas de hasta 5 niveles** (antes 3), con marcadores por nivel como en LaTeX (viñetas •/–/∗/·/‣; numeradas 1./(a)/i./A.). Las listas con opciones de `enumitem` (`[leftmargin=*, …]`) y `\begin{list}{}{…}` se importan y conservan sus opciones.
- **Vista previa de fórmulas** más completa: MathJax carga `physics`, `mhchem` y `braket`, y hay macros‑puente para `\nicefrac`, `\oiint`, `\unit`, `\qty` y las griegas rectas (`\upmu`, `\uppi`…).

**2026.11.06-c**
- Colaboración: al editar el mismo bloque dos personas, cuando el almacén confirma tu cambio se acepta de inmediato el cambio posterior de la otra persona, en vez de conservar tu versión hasta 8 s (antes podía «resucitar» tu copia vieja). Se mantiene el respaldo por tiempo de espera.
- Deshacer: una edición continua larga ya no se agrupaba en un único paso que lo abarcaba todo; ahora se crea un punto de deshacer cada ~1,5 s de escritura seguida, conservando la granularidad.
- Limpieza: eliminados archivos residuales (`a`, `tests/f`, `vendor/katex/aaa`, `vendor/katex/fonts/q`, `LEEME-eliminar.txt`) y el motor KaTeX que ya no se usa (`vendor/katex/katex.min.js` y `.css`); se conservan las tipografías Latin Modern (`vendor/katex/fonts/`) y su `LICENSE`.

**2026.11.06-b**
- Tablas: «insertar fila arriba» e «insertar columna a la izquierda» dejaban el cursor en la fila/celda de al lado en vez de en la nueva; ahora el foco va a la fila o celda recién creada.
- Colaboración y vista de código: reordenar dos bloques del mismo tipo (p. ej. intercambiar una tabla y un párrafo) ya no borra y recrea uno de ellos; conservan su identidad (y las figuras su imagen). El emparejamiento dentro de cada hueco usa colas por tipo en vez de un cursor que podía saltarse bloques.
- Fusionar un párrafo con el anterior (Retroceso al inicio) colocaba mal el cursor cuando el texto llevaba formato o fórmulas; ahora se sitúa en el límite real entre ambos textos.
- Enlaces: las direcciones «protocol-relative» (`//host/…`) de un `.tex` importado se descartan, como ya se hacía con `javascript:`.
- Vista previa de figuras: el ancho en `pt` usaba una referencia (450 pt) incoherente con la de `cm`; ahora ambas coinciden (≈ 453,5 pt por 16 cm).
- Pruebas: regresión de `diffBloques` al reordenar bloques del mismo tipo y de `urlSegura` con direcciones protocol-relative.

**2026.11.05-a**
- Ecuaciones: `multline`, `flalign`, `eqnarray`, `displaymath` y `math` son bloques editables, y también las que llevan `cases`, `pmatrix`, `aligned`… dentro. Las etiquetas escritas fila a fila se conservan y se numeran.
- Listas de descripción (`description`) y `\item[etiqueta]` editables, sin perder la etiqueta. `\begin{center}\includegraphics…` es una figura; las figuras importadas conservan la ruta y las opciones de `\includegraphics`.
- LaTeX avanzado con vista previa y código en «Ver/editar código»; fragmentos en línea renderizados. Importar un `.tex` informa de cuántos bloques quedaron como avanzados.
- Bloque TikZ con editor, vista previa, herramienta de dibujo y plantillas; se reconoce al importar (suelto, en `figure`, en `center` o con `\resizebox`). Las referencias a figuras y tablas dentro del LaTeX avanzado se numeran.
- Pruebas: `tests/parte1.test.mjs`, `tests/tikz.test.mjs`, `tests/muestra/` con su informe, y la muestra regenerada se compila y compara con la original.

**2026.11.04-b**
- La vista de código ya no altera el documento al entrar y salir sin editar (antes podía borrar símbolos del título, convertir símbolos del texto en LaTeX crudo y desactivar la portada).
- Corregidos `.tex` que no compilaban: resumen en la clase *Libro*, `\newtheorem{…}[…]{…}` importado, paquetes descartados al importar que el LaTeX crudo necesitaba, figuras sin imagen y saltos de línea al inicio de un párrafo.
- Paleta de fórmulas: los botones |x| y ‖x‖ dejaban el cursor en mal sitio y producían errores.
- Márgenes de 0,5 a 6 cm respetados; Enter en el primer elemento vacío de una lista ya no deja una lista invisible; Enter en un elemento vacío anidado primero sube de nivel; pegar dentro de texto en negrita o cursiva se trata igual que en texto normal.
- Clic en una referencia cruzada abre un diálogo para cambiarla o quitarla (antes la borraba al instante).
- Numeración igual que en el PDF; etiquetas de `align` en la primera fila numerada; nombres de imagen repetidos ya no se pisan en el `.zip`.
- El documento en blanco usa como título el nombre escrito; la plantilla Carta no muestra portada.
- Los enlaces con esquemas peligrosos (`javascript:`) se descartan.
- Mejor tipografía: `microtype`, `es-tabla`, pies de tabla arriba, `[htbp]`, metadatos del PDF.
- Pruebas automáticas en `tests/`.
