import express from 'express';

import { routerInbox } from './routes/inbox.routes.js';
import { routerRequests } from './routes/requests.routes.js';
import { routerAnnouncement } from './routes/announcement.routes.js';

// ══════════════════════════════════════════════════════════════════════
// ENDPOINTS DE NOTIFICACIONES
// ══════════════════════════════════════════════════════════════════════
// Este archivo solo MONTA. Los endpoints viven en routes/, agrupados por para
// qué sirven, porque eran quinientas líneas seguidas donde costaba ver dónde
// terminaba un endpoint y empezaba el siguiente.
//
//   routes/inbox         leer la bandeja y marcar leído
//   routes/requests      solicitudes de horario: decidir, retirar, consultar
//   routes/announcement  publicar un anuncio de la plataforma
//
// EL ORDEN DE MONTAJE IMPORTA
//
// Express resuelve por orden de registro, y hay rutas con parámetro
// (`/notifications/:id/read`) que podrían capturar a otras. Se montan en el
// MISMO orden en que estaban escritas antes de repartirlas:
//
//   1. bandeja        GET  /notifications
//                     GET  /notifications/unread-count
//                     POST /notifications/:id/read
//                     POST /notifications/read-all
//   2. solicitudes    POST /notifications/:id/decide
//                     GET  /notifications/schedule/pending
//                     POST /notifications/:id/withdraw
//   3. anuncios       POST /notifications/announcement
//
// Cambiar este orden puede hacer que una ruta responda por otra, sin error y
// sin aviso. Si hay que tocarlo, contrastar antes y después la lista de rutas.

const routerNotification = express.Router();

routerNotification.use(routerInbox);
routerNotification.use(routerRequests);
routerNotification.use(routerAnnouncement);

export { routerNotification };
