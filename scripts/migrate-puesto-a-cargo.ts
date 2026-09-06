/**
 * Convierte el puesto viejo de cada trabajador en su cargo del tabulador.
 *
 *     npx tsx scripts/migrate-puesto-a-cargo.ts             muestra lo que haria; no escribe
 *     npx tsx scripts/migrate-puesto-a-cargo.ts --aplicar   escribe en la base del .env
 *
 * Hasta ahora el puesto era jobInformation.position, un texto de una lista
 * fija de trece. El modelo ya no lo declara: el cargo pasa a ser
 * jobInformation.tabuladorPosition, una referencia al tabulador, que es el
 * que sabe cuanto paga cada uno. Mongoose no borra un campo que deja de
 * declarar, asi que el texto viejo sigue en cada documento y este script lo
 * lee crudo, con aggregate, que no pasa por el esquema y devuelve lo que hay.
 *
 * LA TABLA DE REGLAS es la unica fuente de la conversion. Va por nombre y no
 * por id porque el nombre es lo que se ve y se edita en la pantalla del
 * tabulador; un id pegado aqui no le dice nada a quien revise esto dentro de
 * un ano. Los nombres se comparan normalizados (mayusculas, sin tildes,
 * espacios y barras colapsados) para que un retoque cosmetico no rompa una
 * regla, y una regla puede listar varios nombres porque ya paso que un cargo
 * se renombro desde la pantalla (SUB GERENTE a GERENTE DE OPERACIONES).
 *
 * El enum viejo no distingue turno y el tabulador si (hay OPERADOR SENIOR
 * DIURNO y NOCTURNO, por ejemplo), asi que esas reglas se resuelven con
 * workSchedule.shiftType. Dos puestos quedan SIN regla, Gerente y Analista de
 * auditoria: el tabulador tiene dos gerencias y ninguna auditoria de analista,
 * y elegir entre eso es de una persona desde la ficha, no de un script.
 * 'Operador' a secas va a OPERADOR DE MONITOREO y sale marcado como SUPUESTO:
 * el enum no separaba monitoreo de HP y los datos no lo dicen.
 *
 * Solo entra quien no tiene cargo todavia, un cargo inactivo no se asigna, y
 * el que no se resuelve se lista con su motivo y se deja en null. Por eso se
 * puede correr las veces que haga falta: cada corrida toma lo que falta y no
 * pisa lo que alguien ya asigno a mano.
 */

import '../src/config/index.js'; // carga el .env antes que nada
import mongoose, { Types } from 'mongoose';
import connectDB from '../src/config/db_connect.js';
import UserModel from '../src/apiServises/user/user.model.js';
import TabuladorModel from '../src/apiServises/tabulador/tabulador.model.js';


type Turno = 'Diurno' | 'Nocturno';

/**
 * Una regla: un valor del enum viejo y los nombres que puede tener hoy su
 * cargo. Con `cargo` el turno no importa; con `porTurno` el tabulador separa
 * diurno y nocturno y hace falta workSchedule.shiftType para elegir. Sin
 * ninguno de los dos, el puesto no tiene regla y se lista con `sinRegla`.
 */
interface Regla {
    puesto: string;
    cargo?: string[];
    porTurno?: Record<Turno, string[]>;
    sinRegla?: string;
    /** Por que la regla es una apuesta y no un dato. Se imprime al lado del cargo. */
    supuesto?: string;
}

const REGLAS: Regla[] = [
    { puesto: 'Gerente',               sinRegla: 'puede ser GERENTE DE OPERACIONES o GERENTE DE SISTEMAS; lo decide una persona' },
    { puesto: 'Subgerente',            cargo: ['SUB GERENTE', 'GERENTE DE OPERACIONES'] },
    { puesto: 'Coordinador',           porTurno: { Diurno: ['COORDINADOR'], Nocturno: ['COORDINADOR NOCTURNO'] } },
    { puesto: 'Supervisor',            cargo: ['SUPERVISOR'] },
    { puesto: 'Operador senior',       porTurno: { Diurno: ['OPERADOR SENIOR DIURNO'], Nocturno: ['OPERADOR SENIOR NOCTURNO'] } },
    { puesto: 'Operador experto',      porTurno: { Diurno: ['OPERADOR EXPERTO DIURNO'], Nocturno: ['OPERADOR EXPERTO NOCTURNO'] } },
    {
        puesto: 'Operador',
        porTurno: {
            Diurno:   ['OPERADOR DE MONITOREO DIURNO', 'OPERADOR MONITOREO DIURNO'],
            Nocturno: ['OPERADOR MONITOREO NOCTURNO', 'OPERADOR DE MONITOREO NOCTURNO'],
        },
        supuesto: 'el enum no separaba monitoreo de HP; se asume monitoreo',
    },
    { puesto: 'Verificador',           cargo: ['VERIFICADOR NOCTURNO'] },
    { puesto: 'Auditor de datos',      cargo: ['AUDITOR'] },
    { puesto: 'Analista de sistemas',  cargo: ['ANALISTA DE SISTEMAS'] },
    { puesto: 'Analista de reportes',  cargo: ['ANALISTAS DE REPORTES', 'ANALISTA DE REPORTES'] },
    { puesto: 'Analista de auditoria', sinRegla: 'el tabulador no tiene un cargo de auditoria para analista; lo decide una persona' },
    { puesto: 'Analista de RRHH',      cargo: ['RRHH'] },
];


/**
 * La forma en que se comparan los nombres: mayusculas, sin tildes, y los
 * espacios y barras colapsados. Es la misma tolerancia que uno tiene al leer
 * "COORDINADOR/ RESPONSABILIDAD ADM" y "COORDINADOR / RESPONSABILIDAD ADM"
 * como el mismo cargo. No va mas alla (no quita parentesis ni plurales) para
 * que dos cargos distintos no se confundan por accidente.
 */
const clave = (texto: string) =>
    texto
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();


/** Un cargo del tabulador tal como esta hoy, con su clave de comparacion ya calculada. */
interface CargoVivo {
    _id: Types.ObjectId;
    name: string;
    active: boolean;
    clave: string;
}

/** Lo que sale de buscar un cargo: o el cargo, o por que no. */
interface Hallazgo {
    cargo?: CargoVivo;
    motivo?: string;
}

/**
 * Busca el primer candidato que exista y este activo. Un candidato que existe
 * pero esta inactivo no gana aunque vaya primero: si SUB GERENTE quedo
 * inactivo y GERENTE DE OPERACIONES es el vivo, el vivo es el que vale. Solo
 * si ninguno esta activo se informa el inactivo, que es distinto de que no
 * exista ninguno.
 */
function buscarCargo(candidatos: string[], cargos: CargoVivo[]): Hallazgo {
    let inactivo: CargoVivo | undefined;
    for (const nombre of candidatos) {
        const k = clave(nombre);
        const activo = cargos.find((c) => c.clave === k && c.active);
        if (activo) return { cargo: activo };
        inactivo ??= cargos.find((c) => c.clave === k);
    }
    if (inactivo) return { motivo: `el cargo ${inactivo.name} esta inactivo` };
    return { motivo: `ningun cargo del tabulador se llama ${candidatos.join(' ni ')}` };
}


/** El documento crudo del usuario, con el campo viejo que el modelo ya no declara. */
interface UsuarioCrudo {
    _id: Types.ObjectId;
    name?: string;
    surName?: string;
    inabilited?: boolean;
    jobInformation?: { position?: string | null };
    workSchedule?: { shiftType?: string | null };
}

/** Una fila de la tabla: lo que se leyo y lo que se decidio. */
interface Fila {
    _id: Types.ObjectId;
    apellido: string;
    nombre: string;
    activo: boolean;
    puesto: string | null;
    turno: string | null;
    regla?: Regla;
    cargo?: CargoVivo;
    motivo?: string;
}

const esTurno = (t: string | null): t is Turno => t === 'Diurno' || t === 'Nocturno';

function decidir(u: UsuarioCrudo, cargos: CargoVivo[]): Fila {
    const puesto = u.jobInformation?.position?.trim() || null;
    const turno = u.workSchedule?.shiftType?.trim() || null;
    const fila: Fila = {
        _id: u._id,
        apellido: u.surName ?? '',
        nombre: u.name ?? '',
        activo: u.inabilited !== true,
        puesto,
        turno,
    };

    if (!puesto) return { ...fila, motivo: 'sin puesto viejo' };

    const regla = REGLAS.find((r) => clave(r.puesto) === clave(puesto));
    if (!regla) return { ...fila, motivo: `el puesto "${puesto}" no esta en la tabla de reglas` };
    fila.regla = regla;

    if (regla.cargo) return { ...fila, ...buscarCargo(regla.cargo, cargos) };

    if (regla.porTurno) {
        // Sin turno no se adivina: el modelo pone Diurno por defecto, pero un
        // documento viejo que no trae workSchedule nunca paso por ese defecto
        // y asumirlo aqui seria inventar un dato que decide el sueldo.
        if (!esTurno(turno)) return { ...fila, motivo: 'el cargo depende del turno y el usuario no tiene turno' };
        return { ...fila, ...buscarCargo(regla.porTurno[turno], cargos) };
    }

    return { ...fila, motivo: regla.sinRegla ?? 'sin regla' };
}


/** Recorta o rellena a un ancho fijo, para que la tabla se lea en columnas. */
const col = (valor: unknown, ancho: number) => {
    const t = String(valor ?? '');
    return t.length > ancho ? `${t.slice(0, ancho - 1)}~` : t.padEnd(ancho);
};

/** Como se ve un cargo en la salida: el nombre y, si la regla es una apuesta, la marca. */
const verCargo = (f: Fila) => (f.cargo ? f.cargo.name + (f.regla?.supuesto ? ' [supuesto]' : '') : 'SIN RESOLVER');


const aplicar = process.argv.includes('--aplicar');

/**
 * Quien no tiene cargo todavia. El $or cubre las dos formas de "no tener":
 * el campo en null (lo pone el defecto del modelo al guardar) y el campo
 * ausente (todo documento anterior a que existiera). `{ campo: null }` a
 * secas ya cubre ambas en Mongo, pero decirlo explicito deja claro que se
 * penso en las dos.
 */
const SIN_CARGO = {
    $or: [
        { 'jobInformation.tabuladorPosition': null },
        { 'jobInformation.tabuladorPosition': { $exists: false } },
    ],
};


async function main() {
    await connectDB();

    let escritos = 0;
    let saltados = 0;
    let filas: Fila[] = [];
    let yaMigrados = 0;

    try {
        // 1. El tabulador tal como esta hoy, activos e inactivos. Los inactivos
        //    hacen falta para distinguir "ese cargo esta inactivo" de "ese cargo
        //    no existe": son dos avisos distintos para quien revisa.
        const cargos: CargoVivo[] = (await TabuladorModel.find({}).select('name active').sort({ order: 1 }).lean())
            .map((c) => ({ _id: c._id, name: c.name, active: c.active, clave: clave(c.name) }));

        // 2. Los usuarios sin cargo, crudos. Se lee con aggregate y no con
        //    find: Mongoose no pasa el pipeline por el esquema, asi que el
        //    filtro y la proyeccion sobre `jobInformation.position`, que el
        //    modelo ya no declara, llegan intactos a Mongo y el campo vuelve.
        const usuarios: UsuarioCrudo[] = await UserModel.aggregate([
            { $match: SIN_CARGO },
            {
                $project: {
                    name: 1,
                    surName: 1,
                    inabilited: 1,
                    'jobInformation.position': 1,
                    'workSchedule.shiftType': 1,
                },
            },
        ]);

        yaMigrados = await UserModel.collection.countDocuments({ 'jobInformation.tabuladorPosition': { $ne: null } });

        filas = usuarios
            .map((u) => decidir(u, cargos))
            .sort((a, b) =>
                Number(b.activo) - Number(a.activo)
                || a.apellido.localeCompare(b.apellido, 'es')
                || a.nombre.localeCompare(b.nombre, 'es'),
            );

        // 3. Mostrar la tabla siempre: es la forma de revisar antes de aplicar.
        console.log('');
        console.log(
            ` ${col('APELLIDO', 20)} ${col('NOMBRE', 20)} ${col('ESTADO', 6)} ${col('PUESTO VIEJO', 22)}` +
            ` ${col('TURNO', 11)} ${col('CARGO PROPUESTO', 40)} MOTIVO`,
        );
        for (const f of filas) {
            console.log(
                ` ${col(f.apellido, 20)} ${col(f.nombre, 20)} ${col(f.activo ? 'activo' : 'baja', 6)} ${col(f.puesto ?? '(sin puesto)', 22)}` +
                ` ${col(f.turno ?? '(sin turno)', 11)} ${col(verCargo(f), 40)} ${f.motivo ?? ''}`,
            );
        }

        // 4. Resumen por regla. Salen las trece reglas aunque no las use nadie,
        //    para que se vea contra que cargo vivo resolvio cada una; y al final
        //    los que no tienen puesto o traen uno que no esta en la tabla.
        interface Cuenta { usuarios: number; resueltos: number; cargos: Map<string, number>; motivos: Set<string> }
        const nueva = (): Cuenta => ({ usuarios: 0, resueltos: 0, cargos: new Map(), motivos: new Set() });
        const cuentas = new Map<string, Cuenta>(REGLAS.map((r) => [r.puesto, nueva()]));
        const OTROS = '(sin puesto o fuera de la tabla)';

        for (const f of filas) {
            const nombre = f.regla?.puesto ?? OTROS;
            const c = cuentas.get(nombre) ?? nueva();
            cuentas.set(nombre, c);
            c.usuarios += 1;
            if (f.cargo) {
                c.resueltos += 1;
                c.cargos.set(f.cargo.name, (c.cargos.get(f.cargo.name) ?? 0) + 1);
            } else if (f.motivo) {
                c.motivos.add(f.motivo);
            }
        }

        console.log('');
        console.log(` ${col('PUESTO VIEJO', 32)} ${col('USUARIOS', 8)} ${col('RESUELTOS', 9)} ${col('SIN RESOLVER', 12)} CARGO(S) DEL TABULADOR / MOTIVO`);
        for (const [nombre, c] of cuentas) {
            const regla = REGLAS.find((r) => r.puesto === nombre);
            const partes: string[] = [];
            if (c.cargos.size) {
                partes.push([...c.cargos].map(([cargo, n]) => `${cargo} (${n})`).join(', ') + (regla?.supuesto ? ' [supuesto]' : ''));
            } else if (regla && !regla.sinRegla && c.usuarios === 0) {
                // Nadie usa la regla, pero se muestra a que resolveria para que
                // una regla rota se note aunque hoy no le toque a nadie.
                const resolveria = regla.porTurno
                    ? (['Diurno', 'Nocturno'] as Turno[]).map((t) => `${t}: ${buscarCargo(regla.porTurno![t], cargos).cargo?.name ?? 'SIN RESOLVER'}`).join(' / ')
                    : buscarCargo(regla.cargo!, cargos).cargo?.name ?? 'SIN RESOLVER';
                partes.push(`(sin usuarios) resolveria a ${resolveria}` + (regla.supuesto ? ' [supuesto]' : ''));
            }
            if (regla?.sinRegla) partes.push(`SIN REGLA: ${regla.sinRegla}`);
            for (const m of c.motivos) if (!regla?.sinRegla || m !== regla.sinRegla) partes.push(m);
            console.log(
                ` ${col(nombre, 32)} ${String(c.usuarios).padStart(8)} ${String(c.resueltos).padStart(9)}` +
                ` ${String(c.usuarios - c.resueltos).padStart(12)} ${partes.join('; ')}`,
            );
        }

        const resueltos = filas.filter((f) => f.cargo).length;
        const supuestos = filas.filter((f) => f.cargo && f.regla?.supuesto).length;
        console.log('');
        console.log(
            ` ${filas.length} usuario(s) sin cargo: ${resueltos} con cargo propuesto` +
            (supuestos ? ` (${supuestos} por regla marcada como supuesto)` : '') +
            `, ${filas.length - resueltos} SIN RESOLVER. ${yaMigrados} ya tenian cargo y no se tocan.`,
        );

        if (!aplicar) {
            console.log('');
            console.log('Sin --aplicar no se escribe nada.');
            return;
        }

        // 5. Escribir, uno por uno y solo los resueltos. El filtro repite la
        //    condicion "sin cargo" a proposito: entre la lectura y este punto
        //    alguien pudo asignar uno desde la ficha, y ese gana. Va por la
        //    coleccion nativa para que la escritura no dependa de lo que el
        //    modelo cargado declare: `strict` descarta en silencio un $set
        //    sobre una ruta que no conoce, y un no-op silencioso es lo peor
        //    que puede hacer una migracion.
        for (const f of filas) {
            if (!f.cargo) continue;
            const r = await UserModel.collection.updateOne(
                { _id: f._id, 'jobInformation.tabuladorPosition': null },
                { $set: { 'jobInformation.tabuladorPosition': f.cargo._id } },
            );
            if (r.modifiedCount === 1) escritos += 1;
            else saltados += 1;
        }
    } finally {
        await mongoose.disconnect();
    }

    console.log('');
    console.log(
        `Listo: ${escritos} escrito(s), ${saltados} saltado(s) porque ya tenian cargo al momento de escribir,` +
        ` ${filas.filter((f) => !f.cargo).length} sin resolver que siguen en null.`,
    );
}


main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
