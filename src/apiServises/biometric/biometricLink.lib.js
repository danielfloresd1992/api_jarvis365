// ══════════════════════════════════════════════════════════════════════
// VÍNCULO ENTRE EL TERMINAL Y LOS USUARIOS DE LA API — reglas puras
// ══════════════════════════════════════════════════════════════════════
// El terminal identifica a cada persona por su número de empleado (employeeNo,
// texto de 1 a 32 caracteres); la API, por su documento de usuario. El vínculo
// vive en el usuario, en user.biometric.employeeNo, y es uno a uno: un número
// por usuario y un usuario por número (índice único parcial en user.model.js).
//
// Las sugerencias son solo eso: el administrador confirma cada vínculo. Ante la
// duda (dos candidatos, o un candidato para dos personas) no se sugiere nada.



// Partículas que no identifican a nadie: "María de la Cruz" se compara como "maria cruz".
const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

// normalizeName = «un nombre comparable»: sin tildes, en minúsculas y con espacios simples
export function normalizeName(text) {
    return String(text ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// nameTokens = «las palabras que identifican un nombre»
export function nameTokens(text) {
    return normalizeName(text).split(' ').filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

// A lo sumo una letra de diferencia (insertada, borrada o cambiada).
function withinOneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (a.length > b.length) i++;
        else if (a.length < b.length) j++;
        else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
}

// tokensMatch = «dos palabras de un nombre son la misma»: iguales, o con una
// letra de diferencia si las dos son largas ("Darlenys" / "Darlenis")
export function tokensMatch(a, b) {
    if (a === b) return true;
    return Math.min(a.length, b.length) >= 5 && withinOneEdit(a, b);
}

// nameMatch = «cuántas palabras del nombre del terminal están en el nombre completo
// del usuario». En el terminal suele ir "Nombre Apellido"; en la API, los dos
// nombres y los dos apellidos. Cada palabra del usuario se usa una sola vez.
export function nameMatch(deviceName, fullName) {
    const device = nameTokens(deviceName);
    const pool = nameTokens(fullName);
    let matched = 0;
    for (const token of device) {
        const index = pool.findIndex((candidate) => tokensMatch(token, candidate));
        if (index >= 0) {
            matched++;
            pool.splice(index, 1);
        }
    }
    return { matched, total: device.length };
}

const digitsOf = (text) => String(text ?? '').replace(/\D/g, '');

// sameIdNumber = «el número de empleado es la cédula del usuario» (quien se
// registró en el terminal con su CI). Seis dígitos como mínimo: un "25" no es una cédula.
export function sameIdNumber(employeeNo, dni) {
    const a = digitsOf(employeeNo);
    return a.length >= 6 && a === digitsOf(dni);
}

export const fullNameOf = (user) => `${user?.name ?? ''} ${user?.surName ?? ''}`.trim();

// isValidEmployeeNo = «un número de empleado que el terminal admite»: 1 a 32 caracteres, sin controles ni barras
export function isValidEmployeeNo(text) {
    return typeof text === 'string'
        && text.length >= 1
        && text.length <= 32
        && text.trim() === text
        && !/[\u0000-\u001f\u007f/\\]/.test(text);
}

// compactUser = «lo que la pantalla necesita de un usuario de la API»
export function compactUser(user) {
    return {
        id: String(user._id),
        name: user.name ?? '',
        surName: user.surName ?? '',
        dni: user.dni ?? null,
        disabled: user.inabilited === true,
        employeeNo: user.biometric?.employeeNo ?? null,
    };
}

// suggestionFor = «el usuario que probablemente es esta persona del terminal», o null.
// Primero por cédula; si no, por nombre: todas las palabras del nombre del
// terminal (al menos dos) tienen que estar en el del usuario, y el candidato
// tiene que ser único. `candidates` son usuarios compactos libres y habilitados.
export function suggestionFor(deviceUser, candidates) {
    const byId = candidates.filter((u) => sameIdNumber(deviceUser.employeeNo, u.dni));
    if (byId.length === 1) return { userId: byId[0].id, reason: 'cedula' };
    if (byId.length > 1) return null;

    const byName = candidates.filter((u) => {
        const match = nameMatch(deviceUser.name, fullNameOf(u));
        return match.total >= 2 && match.matched === match.total;
    });
    return byName.length === 1 ? { userId: byName[0].id, reason: 'nombre' } : null;
}

// buildLinkReport = «el estado del vínculo, persona por persona del terminal»
//   employees:   cada persona del terminal con su usuario vinculado o su sugerencia
//   users:       todos los usuarios de la API (para elegir a mano)
//   orphanLinks: usuarios vinculados a un número que ya no está en el terminal
export function buildLinkReport(deviceUsers, apiUsers) {
    const users = apiUsers.map(compactUser);
    const byId = new Map(users.map((u) => [u.id, u]));
    const byEmployeeNo = new Map(users.filter((u) => u.employeeNo).map((u) => [u.employeeNo, u]));
    const free = users.filter((u) => !u.employeeNo && !u.disabled);

    const employees = deviceUsers.map((deviceUser) => {
        const linkedUser = byEmployeeNo.get(String(deviceUser.employeeNo)) ?? null;
        return { ...deviceUser, linkedUser, suggestion: linkedUser ? null : suggestionFor(deviceUser, free) };
    });

    // Un mismo usuario sugerido para dos personas del terminal: no se sugiere a ninguna.
    const times = new Map();
    for (const e of employees) if (e.suggestion) times.set(e.suggestion.userId, (times.get(e.suggestion.userId) ?? 0) + 1);
    for (const e of employees) {
        if (!e.suggestion) continue;
        e.suggestion = times.get(e.suggestion.userId) > 1
            ? null
            : { reason: e.suggestion.reason, user: byId.get(e.suggestion.userId) };
    }

    const deviceNumbers = new Set(deviceUsers.map((d) => String(d.employeeNo)));
    const orphanLinks = users.filter((u) => u.employeeNo && !deviceNumbers.has(u.employeeNo));

    return {
        employees,
        users,
        orphanLinks,
        summary: {
            total: employees.length,
            linked: employees.filter((e) => e.linkedUser).length,
            suggested: employees.filter((e) => e.suggestion).length,
            orphanLinks: orphanLinks.length,
        },
    };
}
