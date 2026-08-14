// ══════════════════════════════════════════════════════════════════════
// ESTRATEGIAS DE NOTIFICACIÓN — puerta única
// ══════════════════════════════════════════════════════════════════════
// Cada TIPO de notificación decide tres cosas por su cuenta:
//   · qué texto se lee, en español y en inglés
//   · A QUIÉN LE LLEGA (global, personal o de administradores)
//   · con qué familia visual y qué nivel se pinta
//
// Sin esto, notification.service.js sería un switch gigante que crece con cada
// evento del sistema. Con el patrón Estrategia, agregar "se solicitó un cambio
// de horario" es registrar un objeto más: el servicio no se toca.
//
// UNA ESTRATEGIA RECIBE UN CONTEXTO
//
//   { actor, target, resource, changes, extra, meta }
//
// y devuelve texto y audiencia. No sabe nada de Mongo ni de sockets.
//
// LOS IMPORTS DE ABAJO NO SON DECORATIVOS
//
// Cada archivo se registra a sí mismo al cargarse. Importarlos acá es lo que
// llena el registro: si se quita uno, sus tipos dejan de existir en silencio y
// caen al FALLBACK. Por eso este archivo es la ÚNICA puerta — quien pida
// `resolveStrategy` desde otro lado se arriesga a leer un registro a medio
// llenar.
//
// UNA FAMILIA POR ARCHIVO, para poder responder de un vistazo "¿qué avisos
// existen sobre el horario?" abriendo un solo archivo.

import './attendance.strategies.js';   // marcaje: entrada y salida del propio empleado
import './comment.strategies.js';      // notas escritas sobre el día de otra persona
import './menu.strategies.js';         // alertas y su bonificación (dos familias)
import './resource.strategies.js';     // establecimientos y franquicias
import './schedule.strategies.js';     // horario, horas extras y solicitudes de cambio
import './system.strategies.js';       // anuncios de la plataforma

export { registerStrategy, resolveStrategy, STRATEGIES } from './registry.js';
export { actorName, targetName, changedLabels, readable, fechasDe } from './helpers.js';
