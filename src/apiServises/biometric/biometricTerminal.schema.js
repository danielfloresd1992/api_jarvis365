import * as yup from 'yup';
import { isTerminalCode, isValidHost } from './biometricTerminal.lib.js';

// ══════════════════════════════════════════════════════════════════════
// LO QUE SE ACEPTA AL GUARDAR O PROBAR UN TERMINAL
// ══════════════════════════════════════════════════════════════════════
// Lo que NO se acepta del cuerpo, y por qué:
//
//   passwordEnc         la cifra el servidor. Aceptarla dejaría guardar
//                       cualquier cosa como si fuera una contraseña.
//   device / lastCheck  los escribe la comprobación, con lo que dice el equipo.
//   createdBy / …By     salen de la sesión del administrador.
//   code (al editar)    lo usan los kioscos para saber cuál es su terminal.


const name = yup.string().trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(60, 'El nombre no puede pasar de 60 caracteres')
    .required('Falta el nombre del terminal');

// Vacío = se arma con el nombre ("Oficina Centro" → "oficina-centro").
const code = yup.string().trim().lowercase().default('')
    .test('codigo', 'El código solo admite minúsculas, números y guiones (hasta 30, sin guion al principio ni al final)',
        (value) => !value || isTerminalCode(value));

const office = yup.string().trim().max(80, 'La oficina no puede pasar de 80 caracteres').default('');

const host = yup.string().trim()
    .required('Falta la IP o el dominio del terminal')
    .test('host', 'Escribe solo la IP o el dominio, sin http://, sin puerto y sin barras', (value) => isValidHost(value));

const port = yup.number().typeError('El puerto tiene que ser un número')
    .integer('El puerto tiene que ser un número entero')
    .min(1, 'El puerto va de 1 a 65535')
    .max(65535, 'El puerto va de 1 a 65535');

const protocol = yup.string().oneOf(['http', 'https'], 'El protocolo es http o https').default('http');

const username = yup.string().trim()
    .max(64, 'El usuario no puede pasar de 64 caracteres')
    .required('Falta el usuario del terminal');

const password = yup.string().max(64, 'La contraseña no puede pasar de 64 caracteres');


export const createTerminalSchema = yup.object({
    name, code, office, host, port, protocol, username,
    password: password.required('Falta la contraseña del terminal'),
    enabled: yup.boolean().default(true),
});

// Al editar, la contraseña vacía significa «la misma de antes».
export const updateTerminalSchema = yup.object({
    name, office, host, port, protocol, username,
    password: password.default(''),
    enabled: yup.boolean(),
});

// Probar la conexión antes de guardar. Con `id`, la contraseña vacía es la guardada.
export const testTerminalSchema = yup.object({
    id: yup.string().trim().default(''),
    host, port, protocol, username,
    password: password.default(''),
});
