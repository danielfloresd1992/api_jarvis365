# Documentación de jarvis_api

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
