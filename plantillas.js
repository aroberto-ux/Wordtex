// Plantillas de documentos. Están escritas en LaTeX y se interpretan con el mismo lector que
// usa la pestaña «Código», así que lo que se ve aquí es exactamente lo que se podrá editar.

import { parsearTex } from './latex-parse.js?v=2026.11.07-n';

const CABECERA = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[spanish]{babel}
\usepackage[a4paper,margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb,amsthm}
`;

export const PLANTILLAS = [
  {
    id: 'blanco', nombre: 'Documento en blanco', icono: '📄', desc: 'Una hoja vacía para empezar de cero.',
    tex: CABECERA + String.raw`\title{Mi documento}
\author{Tu nombre}
\begin{document}
\maketitle

\end{document}`,
  },
  {
    id: 'articulo', nombre: 'Artículo o informe científico', icono: '🔬', desc: 'Resumen, secciones, ecuación, tabla y bibliografía.',
    tex: CABECERA + String.raw`\usepackage{graphicx}
\title{Título del artículo}
\author{Nombre Apellido}
\date{}
\begin{document}
\maketitle

\begin{abstract}
Escribe aquí un resumen breve (unas 150 palabras) con el problema, el método y el resultado principal.
\end{abstract}

\section{Introducción}
Presenta el tema y explica por qué es importante. Puedes citar trabajos previos \cite{knuth84} y hacer referencia a secciones, como la Sección~\ref{sec:metodo}.

\section{Metodología}\label{sec:metodo}
Describe cómo se hizo el trabajo. Las fórmulas se escriben con la paleta de símbolos; por ejemplo, la energía cinética es $E_c = \frac{1}{2}mv^2$ y, en una línea aparte:
\begin{equation}\label{eq:energia}
E = mc^{2}
\end{equation}

\section{Resultados}
Los datos se resumen en la Tabla~\ref{tab:datos}.
\begin{table}[h]
\centering
\begin{tabular}{|l|c|r|}
\hline
\textbf{Muestra} & \textbf{Medida} & \textbf{Error} \\
\hline
A & 1.25 & 0.02 \\
\hline
B & 1.31 & 0.03 \\
\hline
\end{tabular}
\caption{Resultados de las mediciones}
\label{tab:datos}
\end{table}

\section{Conclusiones}
Resume lo más importante y propón trabajo futuro.

\begin{thebibliography}{9}
\bibitem{knuth84} D. E. Knuth. \emph{The TeXbook}. Addison-Wesley, 1984.
\end{thebibliography}

\end{document}`,
  },
  {
    id: 'tarea', nombre: 'Taller o tarea', icono: '✏️', desc: 'Encabezado con nombre y ejercicios numerados con ecuaciones.',
    tex: CABECERA + String.raw`\title{Taller 1}
\author{Nombre Apellido \\ Asignatura}
\date{}
\begin{document}
\maketitle

\section*{Ejercicio 1}
Calcula la derivada de $f(x) = x^{3} + 2x$.

\begin{proof}
Por la regla de la potencia, $f'(x) = 3x^{2} + 2$.
\end{proof}

\section*{Ejercicio 2}
Resuelve la ecuación
\[
x^{2} - 5x + 6 = 0.
\]
Las soluciones son $x = 2$ y $x = 3$.

\section*{Ejercicio 3}
Responde y justifica:
\begin{enumerate}
\item ¿Es $\sqrt{2}$ un número racional?
\item ¿Por qué?
\end{enumerate}

\end{document}`,
  },
  {
    id: 'apuntes', nombre: 'Apuntes de clase', icono: '📚', desc: 'Definiciones, teoremas, ejemplos y demostraciones.',
    tex: CABECERA + String.raw`\newtheorem{theorem}{Teorema}
\newtheorem{definition}{Definición}
\newtheorem{example}{Ejemplo}
\title{Apuntes de Cálculo}
\author{Tu nombre}
\begin{document}
\maketitle
\tableofcontents

\section{Límites}
\begin{definition}
Decimos que $\lim_{x \to a} f(x) = L$ si para todo $\varepsilon > 0$ existe $\delta > 0$ tal que $|f(x) - L| < \varepsilon$ siempre que $0 < |x - a| < \delta$.
\end{definition}

\begin{example}
$\displaystyle \lim_{x \to 2} (3x + 1) = 7$.
\end{example}

\section{Continuidad}
\begin{theorem}[Valor intermedio]
Si $f$ es continua en $[a,b]$ y $y$ está entre $f(a)$ y $f(b)$, existe $c \in [a,b]$ con $f(c) = y$.
\end{theorem}

\begin{proof}
Se deja como ejercicio.
\end{proof}

\end{document}`,
  },
  {
    id: 'informe', nombre: 'Informe con capítulos', icono: '📘', desc: 'Clase «report»: índice, capítulos numerados y secciones.',
    tex: String.raw`\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[spanish]{babel}
\usepackage[a4paper,margin=3cm]{geometry}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{setspace}
\onehalfspacing
\title{Informe final}
\author{Nombre Apellido}
\begin{document}
\maketitle
\tableofcontents

\chapter{Introducción}
Contexto, objetivos y alcance del trabajo.

\section{Objetivo general}
Describe el objetivo principal.

\section{Objetivos específicos}
\begin{itemize}
\item Primer objetivo.
\item Segundo objetivo.
\end{itemize}

\chapter{Desarrollo}
Contenido principal del informe.

\chapter{Conclusiones}
Resultados y recomendaciones.

\end{document}`,
  },
  {
    id: 'carta', nombre: 'Carta formal', icono: '✉️', desc: 'Carta sencilla sin título, con fecha, saludo y despedida.',
    tex: CABECERA + String.raw`\pagestyle{empty}
\date{}
\begin{document}

\begin{flushright}
Bogotá, 4 de noviembre de 2026
\end{flushright}

Señores \\
Nombre de la entidad \\
Ciudad

\textbf{Asunto:} escribe aquí el asunto.

Estimados señores:

Escribe aquí el cuerpo de la carta. Expón con claridad el motivo, los datos necesarios y lo que esperas como respuesta.

Agradezco de antemano su atención.

Cordialmente,

\vspace{1.5cm}

Nombre Apellido \\
Teléfono · Correo electrónico

\end{document}`,
  },
];

/** Interpreta una plantilla y la devuelve lista para crear el documento. */
export function crearDesdePlantilla(id, titulo) {
  const p = PLANTILLAS.find((x) => x.id === id) || PLANTILLAS[0];
  const m = parsearTex(p.tex);
  if (m.cfg.titulo === '' && titulo) m.cfg.titulo = titulo;
  // la portada solo se muestra si la plantilla la pide (una carta no lleva bloque de título)
  m.cfg.mostrarTitulo = /\\maketitle\b/.test(p.tex);
  const bloques = m.bloques.map(({ id: _id, orden, ...r }) => r);
  if (!bloques.length) bloques.push({ t: 'p', c: [], al: 'j' });
  return { titulo: titulo || p.nombre, cfg: m.cfg, biblio: m.biblio, extra: m.extra, bloques };
}
