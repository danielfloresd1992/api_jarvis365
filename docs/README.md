# Documentación de jarvis_api

## Cómo funcionan los modelos de IA (para decidir, no para programar)

**[Modelos-de-IA-explicados.pdf](Modelos-de-IA-explicados.pdf)** — qué es un
modelo predictivo, cómo se entrena, por qué queda congelado en su fecha de
corte, qué cuesta el contexto, por qué falla cuando el contexto se hace enorme,
las alucinaciones y cómo se mitigan, los modelos cuantizados, el panorama de
modelos abiertos y de frontera, el costo real de un servidor propio frente a
pagar por uso, qué hace falta para montar un bot de atención al cliente, y la
comparación contra un bot sin IA.

Es el documento que se le entrega a quien tiene que aprobar un presupuesto de
IA sin ser del área de informática. Lenguaje técnico intermedio: usa los
términos reales, pero ninguno aparece sin definirse antes.

### Cómo regenerarlo

```bash
node src/scripts/generar-explicativo-modelos-ia.js
```

**Las cifras caducan.** Los precios de las API, los nombres de modelo y los
costos de hardware se comprobaron contra fuentes públicas el 21 de septiembre
de 2026, con una pasada de verificación que corrigió varios errores de la
primera investigación. Hay precios promocionales con fecha de vencimiento y
modelos con retirada anunciada. Antes de reutilizar el documento para una
decisión de compra, volver a comprobar las secciones 10, 11 y 13.

**La sección 13 caduca antes que el resto.** El 1 de octubre de 2026 Meta
empieza a cobrar los mensajes de servicio de WhatsApp y, al cerrar el
documento, todavía no había publicado las tarifas. Las cifras del canal son
estimaciones sobre lo que los proveedores atribuyen a Venezuela, no el
tarifario oficial. En cuanto Meta publique, hay que rehacer esa sección.

Los conceptos no caducan; las cifras sí. Al actualizar, mantener la distinción
entre lo medido y lo estimado: el documento afirma solo lo que quedó
verificado, y dice explícitamente dónde no llega la evidencia.

---

## Reporte de avances del ecosistema (semanal)

**[Avances-Jarvis365-2026-09-21.pdf](Avances-Jarvis365-2026-09-21.pdf)** — qué
avanzó la semana del 14 al 21 de septiembre de 2026 en Ava Bot, Reportes 365 y
Jarvis Express 365, y en qué punto está cada desarrollo. Para lectura de
gerencia.

Cubre los tres proyectos, no solo esta API: los repositorios viven en
`D:\Nueva carpeta\ava bot`, `D:\Nueva carpeta\reportes365` y
`C:\Users\TutosPC-XXX\Desktop\Jarvis-express365`.

### Cómo regenerarlo

```bash
node src/scripts/generar-reporte-avances-ecosistema.js
```

Cada semana se reescribe el objeto `REPORTE` de
[`src/scripts/generar-reporte-avances-ecosistema.js`](../src/scripts/generar-reporte-avances-ecosistema.js)
—el contenido está redactado, no se deduce del código— y se cambia el nombre del
archivo de salida. El resto del generador no se toca. Las piezas de dibujo son
las de [`src/scripts/lib/piezasInforme.js`](../src/scripts/lib/piezasInforme.js),
compartidas con el informe del molde de las alertas.

Regla al escribirlo: cada cifra tiene que poder recontarse, y lo que esté sin
terminar va en «Lo que falta», nunca como entregado.

---

## Informe de novedades (para leer, no para programar)

**[informe-avances.pdf](informe-avances.pdf)** — qué se agregó a la plataforma
y qué cambia en el día a día, en lenguaje llano. Es el documento que se le
enseña a alguien que no toca el código: gerencia, RRHH, un supervisor nuevo.

Incluye una última sección con lo que todavía depende de actualizar el
servidor central a mano, que es la diferencia entre "está hecho" y "se ve".

### Cómo regenerarlo

```bash
npm run build
node dist/scripts/generar-informe-avances.js
```

A diferencia de la guía técnica, **este texto está redactado, no se deduce del
código**. Cuando se sumen funciones nuevas hay que escribirlas en el generador:
[`src/scripts/generar-informe-avances.js`](../src/scripts/generar-informe-avances.js).

Regla al ampliarlo: si una frase necesita saber qué es un *endpoint*, un
*socket* o una colección, está mal escrita para este documento.

---

## Las alertas y su molde en el catálogo

**[informe-molde-alertas.pdf](informe-molde-alertas.pdf)** — cómo encajan
Franchise, Local, Noveltie y Menu, por qué una alerta tiene que enviarse
siguiendo el molde de su documento del catálogo, qué se rompe en reportes365,
en los bonos y en los conteos cuando `menuRef` no corresponde con el título, y
el contrato correcto de `POST /novelties`. Es el documento que se le entrega a
quien integra contra la API.

### Cómo regenerarlo

```bash
node src/scripts/generar-informe-molde-alertas.js
```

No hace falta el build: el generador solo importa pdfkit. La captura de ejemplo
sale de [`img/ejemplo-alerta-mal-clasificada.png`](img/ejemplo-alerta-mal-clasificada.png);
si no está, el informe se genera igual, sin la figura.

Como el informe de novedades, **está redactado, no se deduce del código**. Lo
que afirma sobre la creación de novedades se leyó el 21 de septiembre de 2026:
si se activan las validaciones que recomienda, hay que reescribir la sección 5
en [`src/scripts/generar-informe-molde-alertas.js`](../src/scripts/generar-informe-molde-alertas.js).

---

## Guía del sistema de notificaciones

**[guia-sistema-notificaciones.pdf](guia-sistema-notificaciones.pdf)** — cómo
funciona el sistema de principio a fin: dónde nace un aviso, cómo se decide qué
dice y quién puede verlo, cómo viaja por socket y cómo se consulta después.
Incluye el mapa de archivos y los endpoints.

### Cómo regenerarla

```bash
npm run build
node dist/scripts/generar-guia-notificaciones.js
```

La guía **no se escribe a mano**: el generador vive en
[`src/scripts/generar-guia-notificaciones.js`](../src/scripts/generar-guia-notificaciones.js)
y la tabla de tipos sale del registro real de estrategias del código.

Eso significa dos cosas:

- Un tipo de notificación nuevo aparece solo en la guía la próxima vez que se
  genere.
- Ningún tipo puede quedar descrito de una forma en el papel y de otra en el
  sistema.

Conviene regenerarla al agregar tipos, endpoints o familias. Si se cambia
alguna decisión de fondo —cómo se decide la audiencia, por ejemplo—, eso sí hay
que redactarlo en el generador: el texto explicativo es prosa, no se deduce del
código.
