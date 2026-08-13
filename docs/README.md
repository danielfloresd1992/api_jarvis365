# Documentación de jarvis_api

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
