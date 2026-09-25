# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

`api_jarvis365` es el backend de una plataforma de auditoría de servicio en restaurantes. Guarda las alertas que levantan los operadores, vigila los horarios de monitoreo de cada local, avisa por WhatsApp cuando algo se cae o cuando un local deja de reportar, y lleva la nómina del personal.

Le consumen varios frontends: `reportes365` (informes en PDF), `Client365`, `Jarvis-express365` y `bioJarvis` (marcaje de entrada y salida).

Express 4 con Mongoose 6, ESM, y TypeScript transpilado con Babel. El código y el vocabulario están en español.

## Comandos

```sh
npm run dev        # nodemon -> tsx src/server.ts, NODE_ENV=development
npm run build      # babel src -> dist, luego gulp copia vistas y estáticos
npm start          # node ./dist/server.js
npm test           # 348 pruebas, ~1.5 s
```

### Pruebas

Usan `node:test` y `node:assert/strict`, sobre archivos `.ts` directamente. **No hay loader ni babel-register**: funciona por el borrado de tipos nativo de Node 24. Por eso las pruebas solo admiten TypeScript borrable, sin enums, y **todo import de solo tipos tiene que ir marcado con `import type`** o revienta al enlazar.

Comandos verificados:

```sh
node --test                                     # descubre todo: 348 pruebas
node --test test/nomina.test.ts                 # un archivo: 67
node --test --test-name-pattern="..." test/nomina.test.ts
```

Tres trampas comprobadas. `node --test test/` **falla**, porque Node intenta cargar el directorio como módulo; usa `node --test` a secas o rutas de archivo. El patrón de nombre es una expresión regular y exige que **toda la ascendencia** case, así que puedes aislar un `test` de primer nivel pero **no un `t.test` anidado**: al casar el padre corren todos sus hijos. Y no hay ningún archivo de prueba huérfano, el script de npm y el descubrimiento automático dan el mismo total.

Las pruebas **no tocan MongoDB**. Son unitarias puras. Las que importan modelos solo inspeccionan el esquema, y definir un esquema no abre conexión.

Dos archivos instalan un hook de resolución que reescribe `./x.js` a `./x.ts` cuando el hermano `.ts` existe, y cargan con `await import()` dinámico. Un import estático se resolvería antes de instalar el hook.

**La CI no corre las pruebas.** Córrelas tú.

## Arquitectura

### Arranque

`src/server.ts` lee los certificados de `cert/` de forma síncrona y crea **siempre** un servidor HTTPS. No hay elección entre HTTP y HTTPS: si faltan los certificados el proceso muere al importar. Como `cert/` está en `.gitignore`, **un clon limpio no arranca** sin provisionar los certificados aparte.

Hay además una segunda aplicación HTTP en el puerto 8080 que solo sirve los archivos de validación de certificados. No comparte middleware con la principal.

`server.ts` instala manejadores de `unhandledRejection` y `uncaughtException` que **registran y siguen adelante**, a propósito, para que una ruta mala no tumbe el vigilante de monitoreo. El efecto secundario es que los fallos no se ven desde fuera.

En `src/app.ts` el orden de registro es deliberado y está comentado como tal. Lo más importante: **CORS va primero, antes de los parsers**, porque un 413 del body-parser se salta el resto del middleware y el navegador se quedaba sin cabeceras CORS y sin poder leer el estado.

`helmet` está importado pero su `app.use` está comentado.

### Rutas: no hay montaje central

Cada router se registra con `app.use(router)` **en la raíz**, sin ruta de montaje. El prefijo va incrustado en cada ruta individual con una plantilla:

```js
`${nameApi}/document`
```

`nameApi` vale `/api_jarvis/v1`, o `/api_jarvis_dev/v1` cuando `NODE_ENV` es `development`, y **se evalúa una sola vez al importar**. Cambiar `NODE_ENV` cambia la ruta de toda la API.

Hay unos 185 endpoints repartidos en 27 módulos. El más grande con diferencia es `document.routes.js`.

`attendanceUser` (la asistencia) sigue el patrón de `manager`: `attendanceUser.routes.js` es una línea por endpoint en orden jerárquico, `attendanceUser.controller.js` tiene un método por endpoint, y la lógica vive en `services/` (`.lib.js` puro, `.service.js` toca Mongo o sockets) y `report/`. Sus URLs siguen bajo `/user/attendance/...`.

El nombre de los recursos es inconsistente por accidente histórico: conviven `/noveltie`, `/novelties`, `/noveltiesAll`, `/novelty` y `/noventy`. Los parámetros se escriben a menudo pegados con `=` dentro del segmento, como `/local/id=:id`, en vez de como segmento propio.

### Modelos

Van **colocados junto a su servicio**, no en una carpeta central: `src/apiServises/<servicio>/<nombre>.model.(js|ts)`. Los esquemas de validación de yup van al lado como `.schema.`, salvo los de Document, que están sueltos en `src/libs/schema/`.

Ojo al registrar y al hacer `populate`: el modelo de usuario se registra en **minúscula**, como `user`.

### Sesión y autenticación

La sesión usa **connect-redis**. `connect-mongodb-session` está en las dependencias pero no se importa en ningún sitio.

La cookie se llama `connect.sid`, la de por defecto, nunca se renombra. Va con `httpOnly`, `sameSite: 'none'` y `secure` solo en producción. **Esa combinación en desarrollo la rechazan Chrome, Edge y Firefox**, así que un frontend en otro origen se queda sin cookie de sesión salvo que corra sobre TLS. Por eso la lista de orígenes incluye `https://localhost`.

`maxAge` está sin definir, o sea que es cookie de sesión de navegador. La caducidad real la lleva el middleware `extendSession` del lado del servidor.

**Si Redis no responde, el error se traga y express-session cae en silencio a MemoryStore.** Los síntomas son sesiones que se pierden al reiniciar y que no se comparten entre instancias, sin ningún error en el log.

El estado de sesión es `req.session.name` como bandera de "está dentro", más dos booleanos, `admin` y `super`. No hay enum de roles. Hay además un tercer rol ortogonal, el del día, que sale del marcaje de asistencia.

### Los guards

Están en `src/middleware/validateSessionAndUser.js` y se aplican **por ruta, no globalmente**. Varias rutas de usuario no llevan ninguno.

| Guard | Exige |
|---|---|
| `validateSession` | sesión **o** una API key válida |
| `validateSuperUser` | sesión + `super` |
| `validateAdminUser` | sesión + `admin` |
| `validateSessionAndUserSuper` | sesión + `super` **y** `admin` |
| `validateDayRoleUser` | el rol del día en la asistencia, sobre el día operativo |
| `validateAdminSessionOnly` | sesión + `admin`, y nada más: ni API key ni salto de servidor |
| `extendSession` | caducidad deslizante, nunca rechaza por sí solo |

Detalles que sorprenden. `validateSession` compara solo la IP en el salto servidor a servidor, mientras que todos los demás comparan IP y puerto. El límite de inactividad de `extendSession` es de unas 27 horas, no los cinco minutos que dice su propio mensaje, y se salta entero en desarrollo. Y ese mismo middleware tiene un salto por una cabecera que el cliente puede poner a mano.

### API keys

Formato `jk_<keyId>.<secreto>`. Se guardan como **HMAC-SHA256 del secreto**, no bcrypt, porque se verifican en cada petición y así un volcado de la base de datos no permite falsificar llaves. La comparación usa `timingSafeEqual`.

El candado de solo lectura vive en `apiKeyGate.lib.ts`, es puro y está probado. Los métodos de lectura pasan; para escribir hace falta el permiso `write`. Hay una lista negra de dos GET que en realidad escriben, `/document/exit` y `/document/resume/`.

**Hoy ninguna llave puede escribir**: el esquema de creación solo admite el permiso `read`, así que la puerta de escritura está cerrada por construcción.

### Tiempo tardío y días operativos

El **día operativo va de las 08:00 a las 07:00 del día siguiente**, en `America/Caracas`. Aparece en el rol del día, en el informe de novedades y en las caídas de DVR. Ojo, porque el resumen diario de documentos calcula "hoy" en UTC, que no es lo mismo cerca de medianoche.

### Realtime

Socket.io comparte el servidor HTTPS. **No hay namespaces**, solo tres salas: `lobby`, que nadie usa, `user:<id>` y `admins`.

**El socket no autentica nada.** No hay `io.use` ni verificación en el handshake, y a la sala se entra con un evento `join-user` en el que el propio cliente dice quién es y si es administrador. El comentario del código explica que la sala existe para que una notificación personal no viaje a todos, pero como la entrada no se verifica, cualquier cliente puede pedir la sala de otro usuario o la de administradores. El filtrado del buzón por REST sí es real; la sala no.

Hay además relés de cliente a cliente sin validar. Uno de ellos permite que cualquier navegador conectado difunda un aviso a todos los demás.

El evento `warning` que escucha `reportes365` **no sale de esta API**, sino del bot de WhatsApp, que es un segundo servidor de sockets distinto.

`close-session-user` se emite solo desde las dos ramas de marcaje de salida, y es un **broadcast a todos**, no a la sala del usuario.

### Monitoreo y avisos

El vigilante es un único `setInterval` de 30 segundos arrancado en `server.listen`. Cada paso del tick va envuelto para que uno que falle no mate a los demás.

No hay `node-cron` ni Agenda ni Bull. Todo lo programado son temporizadores a mano que se reprograman solos. El de DVR apunta a la hora exacta siguiente en vez de usar un intervalo, con su razón escrita: un intervalo acabaría disparando a y diecisiete para siempre y acumularía deriva con los cambios de hora.

El **corte de silencio** avisa al grupo de los locales que llevan una hora sin reportar. Quedan fuera los eximidos a mano y los que tienen el DVR caído. La idempotencia es una clave única en Mongo, gana el primero que escribe.

Los avisos al grupo salen por el **bot de WhatsApp**, no por sockets, a través de `src/services/whatsapp/whatsappBot.service.js` (DVR todavía lo importa reexportado desde el job de asistencia). Cada destino tiene su variable de entorno y su respaldo escrito en el código. Todos los envíos llevan una bandera de activación que **por defecto solo está encendida en producción**, para que una máquina de desarrollo no llene el grupo real.

El campo `dvrEffect` del catálogo de alertas marca cuál alerta reporta que se cayeron las cámaras y cuál que volvieron. El candado solo se echa si además **existe alguna alerta de reconexión** en el catálogo, con su razón explícita: sin llave no se cierra la puerta, o el local se quedaría mudo para siempre.

### Nómina

Un documento de Mongo es **un mes** con **cuatro cortes**: dos quincenas, el bono y el margen cero. La invariante que sostiene el módulo es que los cuatro cortes, sin movimientos ni deducciones, suman exactamente el salario total del tabulador.

Al crear el mes se **sella** en cada persona la copia de las cifras tecleadas de su cargo. No se sellan las tarifas derivadas: esas se recalculan al leer, para que arreglar una fórmula aplique hacia atrás mientras el mes conserva sus propias cifras.

Dos reglas que conviene no romper. Lo sellado está **solo en dólares**, y el importe puede quedar negativo a propósito. Y **los bolívares no se sellan nunca**: se vuelven a derivar en cada lectura, incluso en cortes cerrados.

La tasa de cambio **no se consulta a ninguna API externa**, la teclea un administrador. Su valor por defecto es cero a propósito: un cero visible se pregunta, una tasa vieja se paga.

El tabulador es la escala salarial, un documento por cargo, con solo cuatro de las quince columnas de la hoja original. El cargo de un trabajador es una referencia a él.

Los tres scripts de `scripts/` corren con `tsx`, **todos son simulacro por defecto** y solo escriben con `--aplicar`. Apuntan a la base que diga la configuración, así que revísala antes.

## Problemas conocidos, verificados

Estos están comprobados leyendo el código, no deducidos. No los "arregles de paso" sin que te lo pidan, pero tampoco construyas encima asumiendo que funcionan.

### Despliegue roto

`.github/workflows/deploy.yml` **tiene marcadores de conflicto de merge commiteados en `main`**. El YAML es inválido, así que el despliegue automático no puede ni parsearse. Es el único archivo del repositorio en ese estado.

Ese mismo flujo ejecuta `docker compose up -d --build`, pero **no hay ningún archivo compose en el repositorio**.

El `dockerfile` termina en `CMD ["node", "dist/index.js"]` y **ese archivo no existe**: el punto de entrada real es `dist/server.js`, que es el que usa `npm start`.

### Rutas de documento que no funcionan

- `GET /document` siempre da 500. Hace `new Model.findOne(...)`, con `new` sobre un método estático, y además pasa una bandera como filtro.
- `PUT /document?id=` tiene **el guard invertido**: rechaza con 400 cuando el id **es** válido. No puede acertar nunca.
- `DELETE /document` borra el documento pero **deja huérfanas todas sus páginas**, porque el `deleteMany` usa el modelo equivocado.
- `GET /document/week` **no existe**. Cae en `GET /document/:id` y devuelve 400. Si algún día se añade, tiene que declararse **por encima** de la ruta con parámetro, como ya están `/document/exit` y `/document/paginate`.
- `PATCH /document/update/:id` responde 200 pero **descarta en silencio** todo lo que no sean tres campos, por el `stripUnknown` de yup.
- Varias actualizaciones devuelven el documento **anterior** al cambio, porque les falta `{ new: true }`.
- `GET` y `PUT` de `/document/config/:id` son asimétricos: el primero espera el id del **establecimiento** y el segundo el de la **configuración**.

### Consultas que no filtran

Tres sitios filtran locales por `{ status: 'activo' }`, pero el modelo no tiene campo `status`, tiene `isActive`. Con el `strictQuery` que Mongoose 6 trae activado por defecto, la clave desconocida se descarta y **el filtro queda vacío**, así que devuelven todos los locales, activos o no.

En la misma línea, `/franchise/establishments=:name` selecciona dos campos que tampoco existen en el modelo.

Y `/menu?alertDocument=false` filtra por `true`, porque hace `Boolean` sobre la cadena de la query y `Boolean('false')` es verdadero. Solo cuenta que el parámetro esté presente.

### Configuración

`MONGO_URI` **no está en el `.env`**, así que se usa el respaldo escrito en el código y la API se conecta a una base local. Las variables de base de datos que sí están en el `.env` no las lee nadie.

`CORS_ORIGINS` se parsea en la configuración pero **no se consume**: los orígenes reales están escritos a mano en `src/config/origins.js`. Añadir un frontend nuevo exige tocar código y volver a desplegar.

`src/config/db_connect.js` hace `console.log(config)` en cada arranque, y ese objeto **incluye los secretos**. Conviene quitarlo.

### Tipos

`tsc` **nunca corre**. La compilación es Babel, que borra los tipos sin comprobarlos, así que un error de tipos se despliega igual. Los tres `tsconfig` son para el editor.

Las extensiones de import conviven en tres estilos incompatibles y solo se sostienen por los plugins de Babel. Un script suelto lanzado con `node` a pelo se rompe.

## Contrato con reportes365

Vale la pena tenerlo presente porque los dos proyectos se tocan mucho.

La autenticación es **cookie de sesión**, sin tokens. El frontend manda `withCredentials` y dos cabeceras que lo identifican.

`config_report` en el establecimiento es una **referencia, no un subdocumento**. Hay que poblarlo o pedir la configuración por su endpoint. Todas las banderas que el informe lee viven ahí, no en el local.

`weeklyAlerts` guarda **solo las alertas extra**, por id del catálogo. Se espera que reportes365 resuelva por nombre las alertas base de cada demora y las añada. No tiene endpoint propio ni validación: viaja por la actualización genérica de configuración.

`Menu.category` **no tiene enum**. Es texto libre y nada impide una errata; la alerta simplemente no aparecerá donde debería, sin error.

El endpoint `/extract` de novedades es el camino antiguo. Usa formato de fecha `MM-DD-YYYY`, filtra por campos marcados como obsoletos y devuelve una proyección por exclusión que además quita el `_id`. Hay un endpoint moderno y bastante más sano para las alertas del día.
