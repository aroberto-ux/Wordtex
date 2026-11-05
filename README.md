# LaTeX visual

Editor de documentos LaTeX **que se usa como Word**. Quien no sabe LaTeX escribe, da formato, inserta tablas, figuras y ecuaciones con una cinta de opciones; quien sí sabe puede abrir la vista de código y editar el `.tex` directamente. Las dos vistas están sincronizadas en ambos sentidos.

Es una página estática (HTML + módulos JS, sin compilación) pensada para **GitHub Pages**. Funciona sola, guardando en el navegador, y opcionalmente con **Firebase** para editar entre varias personas al mismo tiempo.

## Qué incluye

- **Edición tipo Word**: negrita, cursiva, subrayado, tachado, superíndice/subíndice, monoespaciado, títulos (sección / subsección / …), listas con viñetas, numeradas y anidadas (Tab / Shift+Tab), alineación, citas, resúmenes, teoremas/definiciones/lemas/demostraciones, bloques de código, tabla de contenidos, saltos de página.
- **Tablas** (agregar/quitar filas y columnas, encabezado, bordes, alineación por columna) y **figuras** (subir imagen, ancho, pie de figura).
- **Ecuaciones** con un editor propio: se escribe en LaTeX con vista previa en vivo (KaTeX) y una paleta de símbolos (griegas, operadores, flechas, fracciones, raíces, sumatorias…). También ecuaciones en línea.
- **Notas al pie, referencias cruzadas, citas y bibliografía**, enlaces.
- **Numeración como en LaTeX** (secciones, ecuaciones, figuras, tablas, teoremas) y **vista de página** con aspecto de documento compilado.
- **Menú `/`** para insertar bloques escribiendo, atajos de teclado, deshacer/rehacer, arrastrar bloques.
- **Vista de código**: el `.tex` completo, editable. Lo que no se entiende se conserva tal cual (como bloque «LaTeX crudo»), nada se pierde.
- **Plantillas**: en blanco, artículo, tarea, apuntes, informe y carta.
- **Panel lateral**: esquema, ajustes del documento (clase, fuente, papel, márgenes, idioma, interlineado, columnas, portada), referencias, preámbulo avanzado y ayuda.
- **Exportar**: `.tex`, `.zip` (con el `.tex` y la carpeta `imagenes/`, listo para compilar), PDF (imprimiendo la vista de página), **abrir en Overleaf** y copia de seguridad `.json`. También se puede **importar** un `.tex` o un `.json`.
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
| `exportar.js`, `plantillas.js` | Exportaciones y plantillas |
| `firebase-config.js`, `firestore.rules` | Configuración y reglas de Firebase |
| `vendor/katex/` | KaTeX (ecuaciones y tipografía de la vista de página) |
| `tests/` | Pruebas automáticas (no hace falta subirlas a GitHub Pages, pero no estorban) |

## Calidad del LaTeX generado

- **Compila siempre** con pdfLaTeX en TeX Live, MiKTeX u Overleaf: cada paquete se carga solo si hace falta (también los que usa tu LaTeX avanzado), una figura sin imagen sale como recuadro «Imagen pendiente», la clase *Libro* recibe un entorno de resumen, los saltos de línea dentro de celdas usan una tabla anidada y nunca se escribe `\\` al principio de un párrafo.
- **Tipografía cuidada**: `microtype`, `lmodern`, `booktabs` para tablas con líneas horizontales, pie de tabla arriba y de figura abajo, flotantes `[htbp]`, metadatos del PDF (título y autor) y, en español, «Tabla» en vez de «Cuadro» (`es-tabla`).
- **Ida y vuelta estable**: lo que genera la página lo vuelve a leer sin perder nada (símbolos como α, ≤ o ° incluidos) y entrar o salir de la vista de código no cambia el documento si no se editó.
- **Misma numeración que el PDF**: figuras y tablas se numeran solo si tienen pie, y en `align` las filas con `\nonumber` no cuentan.

## Pruebas

Con [Node.js](https://nodejs.org) 18 o más reciente, desde la carpeta del proyecto:

```bash
node --test tests/*.test.mjs   # núcleo: modelo ⇄ LaTeX, ida y vuelta, numeración (segundos)
node tests/compilar.mjs        # compila con pdflatex las plantillas y un documento con todo, en 3 clases y 6 idiomas
```

La segunda necesita `pdflatex`; si a tu instalación le falta algún idioma de babel o `ulem`, lo avisa y lo sustituye para probar el resto.

## Límites que conviene conocer

- No hay compilación real a PDF en el navegador (ver arriba). La vista de página es una aproximación.
- «Abrir en Overleaf» y el modo Firebase se probaron de forma limitada: el primero depende de Overleaf, el segundo requiere tu proyecto de Firebase.
- Al **importar un `.tex`**, los comentarios al final de una línea (`texto % nota`) se descartan; los comentarios de línea completa se conservan. La `~` (espacio fijo) pasa a ser un espacio normal. Lo que el editor no reconoce se conserva como LaTeX crudo, y los paquetes que ese LaTeX necesita se siguen cargando.
- Si **editas** en la vista de código, al salir se vuelve a formatear el `.tex`. Si solo lo miras, no se toca nada.
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
