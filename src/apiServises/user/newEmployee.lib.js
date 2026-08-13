// ══════════════════════════════════════════════════════════════════════
// EMPLEADO DADO DE ALTA HOY
// ══════════════════════════════════════════════════════════════════════
// Su primer día no se le cobra: no genera llegada tarde, no genera unidades de
// descuento y no se le registra falta.
//
// El motivo es de negocio, no técnico. A alguien que se acaba de crear en el
// sistema se le arma el horario el mismo día en que entra, muchas veces
// después de que ya empezó a trabajar. Contarle un retardo contra una hora
// pautada que todavía no existía —o una falta por no haber marcado en un turno
// que se le asignó a media tarde— es cobrarle un error de captura.
//
//
// POR QUÉ SE MIRAN LAS DOS FECHAS
//
// El modelo tiene dos marcas de creación y ninguna es fiable por sí sola:
//
//   createdOn  declarado como `default: new Date()`. En Mongoose eso se evalúa
//              UNA vez, al cargar el módulo: todos los usuarios creados
//              durante un mismo arranque del servidor quedan con la hora en
//              que arrancó el proceso. Si el servidor lleva semanas encendido,
//              un usuario creado hoy dice haberse creado hace semanas.
//
//   createdAt  lo pone `timestamps: true` y sí es correcto por documento, pero
//              solo existe en los usuarios creados después de que se activó.
//
// Por eso se toma la MÁS RECIENTE de las dos. Cualquiera que caiga en el día
// de hoy basta para considerarlo nuevo.
//
// El sesgo del empate es deliberado: ante la duda, se trata como nuevo. Fallar
// hacia "no le cobres" deja un día sin registrar; fallar al revés le descuenta
// dinero a alguien por su primer día de trabajo.

const ATTENDANCE_TIMEZONE = 'America/Caracas';


/**
 * Partes del día de una fecha, en la zona de la operación.
 *
 * Se compara por día/mes/año y no por milisegundos a propósito: "el mismo día"
 * es una idea de calendario. Y se hace en la zona de Venezuela porque el
 * servidor trabaja en UTC — sin eso, un usuario creado a las 9 de la noche
 * queda registrado con la fecha de mañana y el sistema no lo ve como nuevo.
 *
 * @param {Date|string|number} [fecha]
 * @returns {{ dia: number, mes: number, anio: number, fecha: string }|null}
 *          `fecha` es "YYYY-MM-DD", cómoda para comparar y para registrar.
 */
export const diaDe = (fecha = new Date()) => {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;

    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ATTENDANCE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d).reduce((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
    }, {});

    const anio = Number(partes.year);
    const mes = Number(partes.month);
    const dia = Number(partes.day);

    return {
        dia,
        mes,
        anio,
        fecha: `${partes.year}-${partes.month}-${partes.day}`,
    };
};


/** ¿Las dos fechas caen en el mismo día de calendario? */
export const esElMismoDia = (a, b) => {
    const uno = diaDe(a);
    const otro = diaDe(b);
    return Boolean(uno && otro && uno.fecha === otro.fecha);
};


/**
 * Fecha de alta del usuario: la más reciente de las dos marcas que guarda el
 * modelo. Ver arriba por qué no se puede confiar en una sola.
 *
 * @param {object} user documento de UserModel (o su versión .lean())
 * @returns {Date|null}
 */
export const fechaDeAlta = (user) => {
    const candidatas = [user?.createdAt, user?.createdOn]
        .map(v => (v ? new Date(v) : null))
        .filter(d => d && !Number.isNaN(d.getTime()));

    if (candidatas.length === 0) return null;
    return new Date(Math.max(...candidatas.map(d => d.getTime())));
};


/**
 * ¿Este usuario se dio de alta HOY?
 *
 * Es la pregunta que hay que hacerse antes de cobrarle un retardo o una falta.
 *
 * @param {object} user          documento de UserModel
 * @param {Date}   [referencia]  con qué momento se compara; por defecto, ahora.
 *                               Se puede pasar para reproducir un corte pasado
 *                               o para probar sin depender del reloj.
 * @returns {boolean} true si se creó en la fecha de la referencia.
 *
 * @example
 *   if (esAltaDeHoy(user)) {
 *       // su primer día: ni retardo ni descuento
 *   }
 */
export const esAltaDeHoy = (user, referencia = new Date()) => {
    const alta = fechaDeAlta(user);
    if (!alta) return false;
    return esElMismoDia(alta, referencia);
};
