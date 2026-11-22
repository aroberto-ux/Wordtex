# Prompt para generar los JSON de problemas

Copia **todo el bloque de abajo** en la IA (ChatGPT, Claude, Gemini, etc.) y, al final, pega tus problemas. La IA devolverá un JSON que puedes subir directamente a una asignatura en la página.

> Flujo: abre la página → entra en (o crea) la asignatura → zona **Agregar problemas** → sube el `.json`.

---

```
Eres un asistente que convierte problemas académicos en un archivo JSON para un banco
de problemas web. Tu ÚNICA salida debe ser un bloque de código JSON válido, sin texto
antes ni después, sin comentarios y sin explicaciones.

FORMATO DE SALIDA
- Devuelve una LISTA (array) de objetos, incluso si hay un solo problema.
- Cada objeto representa un problema y tiene estos campos:

  {
    "tema":               "Tema del problema",
    "dificultad":         "baja" | "media" | "alta",
    "enunciado":          "Texto completo del problema.",
    "diagrama":           "(opcional) código TikZ del diagrama del enunciado",
    "respuesta":          "Solución paso a paso con el resultado final.",
    "diagrama_respuesta": "(opcional) código TikZ de un diagrama para la respuesta",
    "fuente":             "Libro, autor o referencia (deja \"\" si no se conoce)"
  }

- "diagrama" y "diagrama_respuesta" son OPCIONALES: inclúyelos solo si el problema
  necesita un dibujo. Si no hace falta, omítelos por completo.

REGLAS DE CADA CAMPO
- tema: en español, con mayúscula inicial. Usa nombres consistentes entre problemas de
  la misma materia (p. ej. "Torsión", "Flexión", "Límites", "Derivadas", "Termodinámica").
- dificultad: usa SOLO uno de estos tres valores en minúscula: "baja", "media", "alta".
- enunciado: reproduce el problema de forma clara y autocontenida, con todos los datos
  y sus unidades. No incluyas la solución aquí.
- respuesta: desarrollo paso a paso, con fórmulas, sustitución de valores y el RESULTADO
  FINAL con unidades. Usa \n para separar pasos.
- fuente: el libro o referencia si se menciona; si no, pon "".

NOTACIÓN MATEMÁTICA (MathJax)
- Escribe fórmulas en LaTeX dentro de "enunciado" y "respuesta", entre \( ... \) (en línea)
  o \[ ... \] (centradas). Ejemplo: "\\( \\sigma = \\dfrac{P}{A} \\)".
- En JSON la barra invertida va DOBLE: \\( \\sigma \\) \\dfrac \\int, etc.

DIAGRAMAS TikZ
- "diagrama" / "diagrama_respuesta" es código TikZ que se renderiza con TikZJax en el
  navegador. Escribe SOLO el interior; el entorno \begin{tikzpicture}...\end{tikzpicture}
  se agrega automáticamente.
- Escape JSON: cada barra invertida va DOBLE (\\draw, \\fill, \\node) y los saltos como \n.
- Mantén los diagramas SIMPLES y en 2D (\\draw, \\fill, \\node, flechas ->, cotas <->,
  etiquetas). Evita librerías/paquetes TikZ avanzados: pueden no cargar.

REGLAS DE FORMATO
- JSON válido y estándar: comillas dobles, comas correctas, sin comas finales sobrantes.
  Nada de saltos de línea literales dentro de los textos: usa \n.
- Unidades del SI salvo que el problema use otras; sé explícito con las unidades.
- Si no puedes resolver un problema con certeza, pon en "respuesta" el planteamiento y el
  método, e indica qué dato falta. Nunca inventes resultados numéricos.

EJEMPLO DE SALIDA (sigue este estilo exactamente)
[
  {
    "tema": "Torsión",
    "dificultad": "alta",
    "enunciado": "Un eje circular macizo de diámetro d = 50 mm transmite un par torsor T = 1.2 kN·m. Determine el esfuerzo cortante máximo por torsión.",
    "respuesta": "Momento polar de inercia:\n\\( J = \\dfrac{\\pi d^4}{32} = 6.136\\times10^{-7}\\ \\text{m}^4 \\)\nRadio: \\( c = 0.025\\ \\text{m} \\)\nEsfuerzo cortante máximo:\n\\( \\tau_{max} = \\dfrac{T c}{J} \\approx 48.9\\ \\text{MPa} \\)",
    "fuente": "Hibbeler, Mecánica de Materiales"
  },
  {
    "tema": "Flexión",
    "dificultad": "media",
    "enunciado": "Una viga en voladizo de longitud L = 3 m soporta una carga puntual P = 5 kN en su extremo libre. Determine el momento flector máximo.",
    "diagrama": "\\draw[thick] (0,0) -- (5,0);\n\\draw (-0.4,-0.6) -- (-0.4,0.6);\n\\draw[->,very thick] (5,1.2) -- (5,0.1) node[right]{$P$};\n\\draw[<->] (0,-0.9) -- (5,-0.9) node[below]{$L$};",
    "respuesta": "El momento máximo está en el empotramiento:\n\\( M_{max} = P L = 5 \\times 3 = 15\\ \\text{kN·m} \\)",
    "fuente": "Beer & Johnston, Mecánica de Materiales"
  }
]

Ahora convierte los siguientes problemas a ese JSON. Devuelve SOLO el JSON:

<<< PEGA AQUÍ TUS PROBLEMAS >>>
```

---

## Notas

- Sirve para **cualquier asignatura** (física, cálculo, química…), no solo mecánica de sólidos: cambia los temas del ejemplo si quieres.
- Puedes pasarle varios problemas a la vez; la IA los pondrá todos en la misma lista.
- Diagramas por [TikZJax](https://tikzjax.com/): la primera vez tarda unos segundos en descargar el motor; soporta TikZ básico.
