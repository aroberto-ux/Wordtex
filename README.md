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

## Límites que conviene conocer

- No hay compilación real a PDF en el navegador (ver arriba). La vista de página es una aproximación.
- «Abrir en Overleaf» y el modo Firebase se probaron de forma limitada: el primero depende de Overleaf, el segundo requiere tu proyecto de Firebase.
- Al **importar un `.tex`**, los comentarios al final de una línea (`texto % nota`) se pierden; los comentarios de línea completa se conservan. La `~` (espacio fijo) pasa a ser un espacio normal. Lo que el editor no reconoce se conserva como LaTeX crudo.
- La vista de código vuelve a formatear el `.tex` al salir de ella.
- Deshacer/rehacer cubre el contenido de los bloques; los cambios de ajustes del documento no se deshacen.
- El tachado usa el paquete `ulem` y el español `babel`; deben estar instalados al compilar (Overleaf los trae).
- Las imágenes se incrustan en el documento (se reducen a un tamaño razonable); no es un gestor de archivos grandes.

## Problemas frecuentes

- **Veo la versión vieja**: recarga con Ctrl+Shift+R.
- **«No se pudo conectar con Firebase; se usa el modo local»**: revisa `firebase-config.js`, que Anónimo esté activado y que tu dominio esté en los dominios autorizados.
- **No se guardan los cambios en Firebase**: revisa las reglas de Firestore (el aviso de estado arriba muestra errores de permisos).
- **No aparece la lista de documentos de otra persona**: en modo local cada navegador tiene los suyos; hace falta Firebase para compartir.
