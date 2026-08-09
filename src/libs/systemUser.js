// ══════════════════════════════════════════════════════════════════════
// USUARIO DEL SISTEMA
// ══════════════════════════════════════════════════════════════════════
// Identidad con la que Jarvis firma lo que hace por su cuenta, sin que una
// persona lo haya pedido: las faltas automáticas del corte de asistencia, sus
// comentarios en el documento, y los anuncios de la campana.
//
// Vivía dentro de attendanceReport.service.js. Se movió acá porque ahora lo usa
// también el sistema de notificaciones, y dos copias del mismo _id terminan
// separándose el día que cambie: quedaría media plataforma firmando con un
// usuario y la otra mitad con otro.
//
// Para cambiar el usuario firmante basta ATTENDANCE_SYSTEM_USER_ID en el .env,
// sin tocar código. El nombre de la variable se conserva por compatibilidad con
// los despliegues que ya la tienen configurada.

export const SYSTEM_USER_ID = process.env.ATTENDANCE_SYSTEM_USER_ID || '697657323dc213f05486e03a';

// Cómo se lee en pantalla. No se toma del documento del usuario a propósito:
// en la base figura como "Jarvis Vision", pero en la campana se prefiere una
// firma que se entienda como el sistema y no como una persona.
export const SYSTEM_USER_LABEL = 'Usuario de Jarvis';
