// ══════════════════════════════════════════════════════════════════════
// SISTEMA DE NOTIFICACIONES — mapa del módulo
// ══════════════════════════════════════════════════════════════════════
// Empieza a leer por acá.
//
// Una notificación es un HECHO que alguien debe conocer: se creó un
// establecimiento, cambió tu horario, marcaste tu entrada, alguien comentó tu
// día. Nace de una operación que YA ocurrió y nunca puede tumbarla.
//
//
// EL RECORRIDO, DE PRINCIPIO A FIN
//
//   1. ALGO PASA
//      Un controlador termina su trabajo —guarda el establecimiento, escribe el
//      horario, registra el marcaje— y solo entonces llama a:
//
//          notify({ type: 'establishment.created', actor, resource, ... })
//
//      El que llama NO decide el texto ni quién lo verá. Solo dice QUÉ pasó.
//
//   2. LA ESTRATEGIA DEL TIPO DECIDE                    → strategies/
//      `notify` busca la estrategia registrada para ese tipo y le pregunta:
//         · qué se lee, en español y en inglés
//         · de qué FAMILIA es (decide cómo la pinta el cliente)
//         · qué ALCANCE tiene: global, personal o de administradores
//         · si es personal, QUIÉNES son los destinatarios
//
//      Hay un archivo por familia. Para saber qué avisos existen sobre el
//      horario, se abre schedule.strategies.js y están todos ahí.
//
//   3. SE GUARDA                                        → notification.model.js
//      El texto se guarda YA RENDERIZADO, en los dos idiomas. No se guarda la
//      plantilla: si mañana se cambia una frase, el pasado tiene que seguir
//      diciendo lo que dijo.
//
//      El actor y el recurso se referencian Y se copian. La referencia sirve
//      para navegar; la copia, para que dentro de seis meses siga leyéndose
//      "Daniel Flores desactivó a Francisca Doral" aunque ese establecimiento
//      ya no exista.
//
//   4. SALE POR SOCKET                                  → notification.audience.js
//      Según el alcance:
//         global   → a todos
//         admin    → a la sala 'admins'
//         personal → a la sala de CADA destinatario, `user:<id>`
//
//      Lo personal no se emite a todos para esconderlo en el cliente. Eso no lo
//      hace privado: solo lo hace invisible.
//
//   5. SE LEE                                           → routes/
//      El cliente pide su bandeja y el servidor filtra por lo que le toca, con
//      el MISMO criterio con el que emitió. Lo leído se guarda en otra
//      colección, no dentro del aviso.
//
//
// LOS ARCHIVOS
//
//   notification.model.js       la forma del aviso guardado
//   notificationRead.model.js   quién leyó qué (colección aparte, a propósito)
//   notification.service.js     notify(): la mecánica de crear y emitir
//   notification.audience.js    QUIÉN LO VE, por socket y por consulta
//   notification.routes.js      monta los endpoints, en orden
//   routes/                     los endpoints, agrupados por para qué sirven
//   strategies/                 qué dice cada tipo y a quién le llega
//
//
// SI VIENES A AGREGAR UN AVISO NUEVO
//
//   1. Registra la estrategia en el archivo de su familia (strategies/).
//   2. Llama a notify() donde ocurre el hecho, después de guardarlo.
//   3. Nada más. El servicio, la emisión y la bandeja ya funcionan.
//
// Si la familia visual es nueva, hay que darla de alta también en el enum de
// notification.model.js y en el registro de vistas del cliente.

export { notify, diffChanges, actorFromSession, adminUserIds, NOTIFICATION_EVENT } from './notification.service.js';
export { userRoom, ADMIN_ROOM, audienceQuery } from './notification.audience.js';
export { registerStrategy, resolveStrategy } from './strategies/index.js';
export { routerNotification } from './notification.routes.js';
export { default as NotificationModel } from './notification.model.js';
export { default as NotificationReadModel } from './notificationRead.model.js';
