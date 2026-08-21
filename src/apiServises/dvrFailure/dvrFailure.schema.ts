import * as yup from 'yup';

// ══════════════════════════════════════════════════════════════════════
// LO QUE ACEPTAN LOS ENDPOINTS DE CAÍDAS
// ══════════════════════════════════════════════════════════════════════
// Se RECHAZA con 400 y con el motivo en vez de corregir en silencio. El recurso
// anterior aceptaba cualquier cosa —un `idLocal` mal tipeado entraba igual— y
// respondía 200; la caída quedaba cargada contra un establecimiento que no
// existe y nadie se enteraba hasta mirar la estadística.
//
// Lo que NO se valida acá porque no viene del cliente: quién reporta y el día
// operativo. El primero sale de la sesión y el segundo se calcula; aceptarlos
// del cuerpo permitiría cargar una caída a nombre de otro o meterla en un día
// que no le toca.


/**
 * Un ObjectId tal como llega en JSON: 24 caracteres hexadecimales.
 *
 * Con expresión regular y no con `Types.ObjectId.isValid()` porque aquélla
 * también acepta cualquier cadena de 12 caracteres y los números — un id mal
 * tipeado pasaría, y la caída quedaría colgada de un local inexistente.
 */
const objectId = (nombre: string) => yup.string()
    .matches(/^[0-9a-fA-F]{24}$/, `${nombre} no es un identificador válido`);


/**
 * El turno del operador, tal como lo nombra `user.workSchedule.shiftType`.
 *
 * Opcional: si el cliente no lo manda, la caída se guarda sin turno y la
 * estadística general sigue saliendo.
 */
const turno = yup.string()
    .oneOf(['Diurno', 'Nocturno'], 'El turno debe ser Diurno o Nocturno')
    .nullable()
    .default(null);


// ══════════════════════════════════════════════════════════════════════
// REGISTRAR UNA CAÍDA
// ══════════════════════════════════════════════════════════════════════

export const dvrFailureSchema = yup.object({

    // Lo único imprescindible: sin establecimiento no hay nada que registrar.
    local: objectId('El establecimiento')
        .required('Falta el establecimiento'),

    // El nombre es opcional porque el servidor lo resuelve del propio local si
    // no viene. Se acepta igual para no obligar a una consulta de más cuando el
    // cliente ya lo tiene a mano.
    localName: yup.string().trim().default(''),

    shift: turno,

    // ── Cuándo se cayó ────────────────────────────────────────────────
    // Se admite para poder cargar una caída detectada antes de alcanzar a
    // reportarla. Si no viene, la ruta pone la hora del servidor.
    //
    // No se acepta una fecha futura: sería un error de carga —o un reloj de
    // estación mal puesto— y arrastraría el episodio a un día operativo que
    // todavía no empezó.
    failedAt: yup.date()
        .typeError('La hora de la caída no es una fecha válida')
        .max(new Date(Date.now() + 60_000), 'La hora de la caída no puede estar en el futuro')
        .nullable()
        .default(null),

    // ── Rastro ────────────────────────────────────────────────────────
    noveltie: objectId('La novedad').nullable().default(null),
    alert: objectId('La alerta').nullable().default(null),
    alertName: yup.string().trim().default(''),

    // La URL que devolvió multimedia, no la imagen. Ver el modelo.
    evidence: yup.string().trim().default(''),

    note: yup.string().trim().max(500, 'La nota no puede pasar de 500 caracteres').default(''),
});


// ══════════════════════════════════════════════════════════════════════
// RESTABLECER
// ══════════════════════════════════════════════════════════════════════
// Cierra el episodio abierto de un establecimiento. Se identifica por el local y
// no por el _id del episodio a propósito: quien reporta que volvió la conexión
// está mirando el local, no un identificador que nunca vio. La ruta busca cuál
// es el episodio abierto.

export const dvrRestoreSchema = yup.object({

    local: objectId('El establecimiento')
        .required('Falta el establecimiento'),

    shift: turno,

    // Misma lógica que `failedAt`: se admite para poder cargar a mano un
    // restablecimiento que ocurrió antes de reportarlo.
    restoredAt: yup.date()
        .typeError('La hora del restablecimiento no es una fecha válida')
        .max(new Date(Date.now() + 60_000), 'La hora del restablecimiento no puede estar en el futuro')
        .nullable()
        .default(null),

    noveltie: objectId('La novedad').nullable().default(null),

    note: yup.string().trim().max(500, 'La nota no puede pasar de 500 caracteres').default(''),
});


// ══════════════════════════════════════════════════════════════════════
// CONSULTAR EL HISTORIAL Y LA ESTADÍSTICA
// ══════════════════════════════════════════════════════════════════════
// Van por query string, así que todo llega como cadena y yup castea.

export const dvrQuerySchema = yup.object({

    // Rango de días operativos. Ausentes = sin límite por ese lado.
    from: yup.date().typeError('La fecha "desde" no es válida').nullable().default(null),
    to: yup.date().typeError('La fecha "hasta" no es válida').nullable().default(null),

    local: objectId('El establecimiento').nullable().default(null),
    shift: turno,

    // ── Paginado ──────────────────────────────────────────────────────
    // Con techo, y no por prolijidad: el historial crece sin parar y un `limit`
    // sin tope permite pedir la colección entera de un saque. La API se despliega
    // a mano en un solo servidor.
    page: yup.number()
        .typeError('La página debe ser un número')
        .integer('La página debe ser un número entero')
        .min(0, 'La página no puede ser negativa')
        .default(0),

    limit: yup.number()
        .typeError('El límite debe ser un número')
        .integer('El límite debe ser un número entero')
        .min(1, 'El límite mínimo es 1')
        .max(200, 'El límite máximo es 200')
        .default(50),
});


export default dvrFailureSchema;
