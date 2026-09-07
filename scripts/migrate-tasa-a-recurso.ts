/**
 * Muda la tasa de cambio de los valores globales del bono a su propio recurso.
 *
 *     npx tsx scripts/migrate-tasa-a-recurso.ts             muestra lo que haria; no escribe
 *     npx tsx scripts/migrate-tasa-a-recurso.ts --dry-run   lo mismo, dicho a proposito
 *     npx tsx scripts/migrate-tasa-a-recurso.ts --aplicar   escribe en la base del .env
 *
 * La tasa estaba en dos sitios a la vez: un campo de `bonussettings` y una
 * copia sellada dentro de cada corte de nomina. Ahora es UNA VARIABLE GLOBAL
 * con recurso propio (`apiServises/exchangeRate`), y lo unico que se congela
 * al cerrar un corte son los montos en DOLARES: los bolivares se derivan de la
 * tasa vigente cada vez que se lee. Este script mueve el dato viejo y borra
 * los campos que dejaron de existir.
 *
 *
 * ESTE ARCHIVO ES EL UNICO SITIO DEL SISTEMA QUE PUEDE LEER LOS CAMPOS VIEJOS
 *
 * Por eso va por el driver crudo, `mongoose.connection.collection(...)`, y no
 * por los modelos: los modelos ya no declaran `bonussettings.exchangeRate`,
 * `nominaperiods.exchangeRate` ni `settled.amountBs`, asi que una lectura por
 * Mongoose devolveria los documentos ya sin ellos y un `$unset` en modo
 * estricto se descartaria en silencio. Un no-op silencioso es lo peor que
 * puede hacer una migracion.
 *
 *
 * QUE ENTRADA DEL HISTORIAL DEL BONO ES UN CAMBIO DE TASA
 *
 * El historial del bono archivaba el PAR (valor del bono, tasa) cada vez que
 * se tocaba cualquiera de los dos, asi que muchas de sus entradas repiten la
 * tasa anterior: fueron cambios del valor del bono. Copiarlas todas inventaria
 * un historial de tasa que nunca ocurrio, con dias en que la tasa "cambio" de
 * 36,5 a 36,5. Solo genera entrada la que difiere de la siguiente, y se queda
 * con la fecha y el autor de la ultima vez que esa tasa estuvo vigente.
 *
 * La lectura de una entrada es la misma de los dos lados: `changedAt` es
 * cuando esa tasa DEJO DE REGIR, no cuando empezo. Ver `ExchangeRateChange` en
 * exchangeRate.model.ts.
 *
 *
 * CORRERLO DOS VECES NO HACE DANO
 *
 * Si el documento de la tasa ya existe no se le toca el valor: pudo cargarlo
 * alguien a mano antes o despues de migrar, y esa tasa es mas nueva que
 * cualquier cosa que quede en el bono. Lo unico que se le escribe es el
 * historial viejo, y solo las entradas que no tenga ya, comparadas por fecha:
 * el paso siguiente borra el historial del bono, asi que si no se rescata aca
 * no queda en ningun otro lado. Comparar por fecha es lo que permite volver a
 * correr el script si una corrida se corto entre el rescate y el borrado.
 *
 * Los dos `$unset` son idempotentes por naturaleza: la segunda corrida no
 * encuentra ningun campo que borrar.
 */

import '../src/config/index.js'; // carga el .env antes que nada
import mongoose, { Types } from 'mongoose';
import connectDB from '../src/config/db_connect.js';

// Solo los tipos, y marcados con `type`: importar el modelo cargaria su
// esquema, y este script va por el driver crudo justamente para que ningun
// esquema se meta en el medio. A cambio, lo que se inserta queda comprobado
// contra la forma que el modelo declara, que es el unico error de este script
// que la base no perdonaria.
import type { ExchangeRateChange, ExchangeRateDoc } from '../src/apiServises/exchangeRate/exchangeRate.model.js';


/*
 * Los nombres de las colecciones, escritos a mano.
 *
 * Es lo que pluraliza Mongoose a partir del nombre de cada modelo
 * ('BonusSettings', 'NominaPeriod', 'ExchangeRate'), pero aca van como texto
 * porque el script no importa los modelos. A cambio de escribirlos, el del
 * bono se comprueba antes de tocar nada: un nombre que se desfase tiene que
 * reventar, no leer una coleccion vacia y reportar "no hay nada que migrar",
 * que es la misma mentira tranquilizadora del $unset descartado. Los otros dos
 * no se pueden comprobar —ninguno tiene por que existir todavia— y quedan a
 * cargo de quien lea el informe. Ver el arranque de `main`.
 */
const COL_BONUS = 'bonussettings';
const COL_NOMINA = 'nominaperiods';
const COL_TASA = 'exchangerates';

/**
 * De donde salio la tasa que se migra. La vieja solo podia teclearla un
 * administrador en la pantalla de los valores del bono, no habia consulta
 * automatica a ningun lado, asi que 'manual' es un dato y no una suposicion.
 */
const FUENTE = 'manual';

/** La base guarda UTC y quien lee este informe liquida nomina en Caracas. */
const TZ = process.env.MONITORING_TZ || 'America/Caracas';


/** Quien hizo un cambio. Los dos recursos guardan el actor con esta forma, asi
 *  que el del bono pasa al historial de la tasa tal cual, sin traducir nada. */
interface ActorCrudo {
    nameUser?: string;
    _id?: Types.ObjectId | string | null;
}

/** Una entrada del historial del bono, tal como esta en la base. */
interface CambioDelBono {
    pointValue?: number;
    exchangeRate?: number;
    changedAt?: Date;
    changedBy?: ActorCrudo | null;
}

/** El documento del bono, con el campo que su modelo ya no declara. */
interface AjustesDelBono {
    _id: Types.ObjectId;
    exchangeRate?: number;
    history?: CambioDelBono[];
    updatedBy?: ActorCrudo | null;
    createdAt?: Date;
}

/** Lo que hace falta saber del recurso nuevo para decidir si se toca o no. */
interface TasaExistente {
    _id: Types.ObjectId;
    value?: number;
    history?: { value?: number; changedAt?: Date }[];
    createdAt?: Date;
}

/** Una entrada del bono ya depurada: con tasa utilizable y con fecha. */
interface EntradaUtil {
    value: number;
    changedAt: Date;
    changedBy: ActorCrudo | null;
}


/** Recorta o rellena a un ancho fijo, para que la tabla se lea en columnas. */
const col = (valor: unknown, ancho: number) => {
    const t = String(valor ?? '');
    return t.length > ancho ? `${t.slice(0, ancho - 1)}~` : t.padEnd(ancho);
};

const fecha = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleString('es-VE', { timeZone: TZ, hour12: false }) : '(sin fecha)';

const quien = (a: ActorCrudo | null | undefined) => a?.nameUser || '(sin registro)';

// Los numeros salen crudos, sin separador de miles ni redondeo: un informe de
// migracion tiene que dejar ver EXACTAMENTE lo que se va a escribir, y un
// formato bonito esconderia una diferencia en el tercer decimal.
const tasa = (v: number) => String(v);

const esTasa = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;


// `--dry-run` gana si vienen los dos. El defecto ya es no escribir, como en los
// otros scripts de esta carpeta; el flag existe porque tambien se pide por su
// nombre, y entre dos ordenes contradictorias se obedece la que no toca la
// base.
const dryRun = process.argv.includes('--dry-run');
const aplicar = process.argv.includes('--aplicar') && !dryRun;


/**
 * Los cambios de tasa que hay que rescatar del historial del bono, del mas
 * viejo al mas reciente, y desde cuando rige la tasa vigente.
 *
 * `entradas` viene del mas viejo al mas reciente y `vigente` es la tasa que
 * rige hoy, asi que la secuencia completa de tasas es `[...entradas, vigente]`.
 * Una entrada solo cuenta como cambio de tasa si difiere de la que le sigue;
 * las demas eran cambios del valor del bono.
 *
 * De ahi salen dos cosas mas:
 *
 *   `vigenteDesde`  la tasa de hoy empezo a regir cuando la anterior dejo de
 *                   hacerlo, o sea en el `changedAt` de la ultima entrada que
 *                   si fue un cambio. Sin ninguna, rige desde que existe el
 *                   documento del bono.
 *   `puestaPor`     quien la puso. El `changedBy` de una entrada es quien
 *                   habia dejado ESA tasa, asi que el autor de la vigente esta
 *                   en la entrada siguiente a la ultima que cambio; si no hay
 *                   ninguna posterior, lo mas cercano es el `updatedBy` del
 *                   bono. Atribuirsela derecho a `updatedBy` seria firmar un
 *                   cambio de tasa a nombre de quien quiza solo toco el valor
 *                   del bono.
 */
function reconstruir(entradas: EntradaUtil[], vigente: number, bono: AjustesDelBono | null) {
    const historial: ExchangeRateChange[] = [];
    let ultimoCambio = -1;

    for (let i = 0; i < entradas.length; i++) {
        const siguiente = i + 1 < entradas.length ? entradas[i + 1].value : vigente;
        if (entradas[i].value === siguiente) continue;

        historial.push({
            value: entradas[i].value,
            source: FUENTE,
            changedAt: entradas[i].changedAt,
            changedBy: entradas[i].changedBy,
        });
        ultimoCambio = i;
    }

    return {
        historial,
        vigenteDesde: entradas[ultimoCambio]?.changedAt ?? bono?.createdAt ?? new Date(),
        puestaPor: entradas[ultimoCambio + 1]?.changedBy ?? bono?.updatedBy ?? null,
    };
}


async function main() {
    await connectDB();

    try {
        const db = mongoose.connection.db;

        // La coleccion del bono tiene que existir: es de donde sale el dato que
        // se migra. Si falta, o el .env apunta a otra base o el nombre se
        // desfaso, y reventar aca es mejor que leer una coleccion vacia e
        // informar "no hay nada que migrar", que es la misma mentira
        // tranquilizadora del $unset descartado.
        //
        // La de nomina NO se puede exigir igual aunque tambien sea de origen:
        // Mongo crea una coleccion recien en el primer insert, asi que en una
        // base donde todavia nadie armo un corte `nominaperiods` no existe.
        // Exigirla dejaba la tasa del bono sin migrar por una coleccion que
        // nunca tuvo nada que limpiar. Se avisa que falta, en el mismo informe,
        // y se sigue. La del recurso nuevo tampoco: la crea el insert de abajo.
        const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
        if (!existentes.has(COL_BONUS)) {
            console.error('');
            console.error(`No se escribe nada: la base ${db.databaseName} no tiene la coleccion ${COL_BONUS}.`);
            console.error('O el .env apunta a otra base, o el nombre del modelo cambio y hay que corregirlo aca.');
            process.exitCode = 1;
            return;
        }
        const hayNomina = existentes.has(COL_NOMINA);

        const colBonus = mongoose.connection.collection(COL_BONUS);
        const colNomina = mongoose.connection.collection(COL_NOMINA);
        const colTasa = mongoose.connection.collection(COL_TASA);

        // ── 1. LO QUE HAY ─────────────────────────────────────────────
        const bono = await colBonus.findOne({}) as AjustesDelBono | null;
        const yaExiste = await colTasa.findOne({}) as TasaExistente | null;

        const vigente = Number(bono?.exchangeRate);
        const hayVigente = esTasa(vigente);

        const crudas = bono?.history ?? [];
        const entradas: EntradaUtil[] = crudas
            .map(e => ({ value: Number(e.exchangeRate), changedAt: e.changedAt, changedBy: e.changedBy ?? null }))
            .filter((e): e is EntradaUtil => esTasa(e.value) && e.changedAt instanceof Date);

        // Una entrada sin tasa, con la tasa en cero o sin fecha no se migra, y
        // tampoco corta la cuenta de arriba: no dice que la tasa haya cambiado,
        // dice que de ese momento no se sabe la tasa. El cero es el defecto de
        // antes de que alguien la cargara, y meterlo en el historial afirmaria
        // que hubo un dia en que se pago a cero.
        const descartadas = crudas.length - entradas.length;

        const { historial, vigenteDesde, puestaPor } = reconstruir(entradas, vigente, bono);

        // ── 2. QUE SE HACE CON EL RECURSO NUEVO ───────────────────────
        let accion: 'crear' | 'rescatar-historial' | 'nada' = 'nada';
        let motivo = '';
        let aEscribir: ExchangeRateChange[] = [];

        if (!yaExiste && hayVigente) {
            accion = 'crear';
            aEscribir = historial;
        }
        else if (!yaExiste) {
            // Sin tasa vigente no se crea el documento en cero: "sin
            // configurar" se representa con la ausencia del documento, y un
            // cero guardado dejaria toda la columna de bolivares del sistema en
            // cero como si estuviera configurada.
            motivo = 'el bono no tiene tasa cargada y no hay documento que crear'
                + (historial.length ? `. OJO: los ${historial.length} cambio(s) de tasa de su historial se borran sin migrar, porque no hay documento donde colgarlos` : '');
        }
        else {
            // La tasa ya la cargo alguien y esa manda, pero el historial del
            // bono se borra en el paso siguiente: si no se rescata aca, la
            // pregunta "a que tasa se pago enero" se queda sin respuesta para
            // siempre.
            //
            // La vigente vieja entra como ultima entrada porque dejo de regir
            // justo cuando se creo este documento, y solo si el documento nacio
            // con otra: el valor con el que nacio es la primera entrada de su
            // historial, o el actual si todavia no tiene ninguna.
            const inicial = Number(yaExiste.history?.[0]?.value ?? yaExiste.value);
            const rescate = [...historial];
            if (hayVigente && inicial !== vigente) {
                rescate.push({
                    value: vigente,
                    source: FUENTE,
                    changedAt: yaExiste.createdAt ?? new Date(),
                    changedBy: puestaPor,
                });
            }

            // Lo que ya esta no se repite. La fecha alcanza como identidad: dos
            // entradas del historial del bono no comparten `changedAt`, asi que
            // una que ya figure en el recurso solo puede haber llegado de una
            // corrida anterior de este mismo script — que es exactamente el caso
            // que hay que no duplicar si la primera se corto entre el rescate y
            // el borrado.
            const yaEstan = new Set((yaExiste.history ?? []).map(h => h.changedAt?.getTime()));
            aEscribir = rescate.filter(c => !yaEstan.has(c.changedAt.getTime()));

            if (aEscribir.length) accion = 'rescatar-historial';
            else motivo = `la tasa ya existe (${tasa(Number(yaExiste.value))}) y su historial ya tiene todo lo que habia en el bono`;
        }

        // ── 3. QUE SE BORRA ───────────────────────────────────────────
        const bonoConCampo = bono?.exchangeRate !== undefined ? 1 : 0;
        const entradasConCampo = crudas.filter(e => e.exchangeRate !== undefined).length;

        const cortesConTasa = await colNomina.countDocuments({ exchangeRate: { $exists: true } });

        // Las filas se cuentan con un aggregate y no una por una: son ciento y
        // pico por corte y lo unico que se quiere es el numero para el informe.
        // `$type` devuelve 'missing' cuando el campo no esta.
        const [conteoBs] = await colNomina.aggregate([
            { $match: { 'rows.settled.amountBs': { $exists: true } } },
            {
                $project: {
                    filas: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ['$rows', []] },
                                as: 'f',
                                cond: { $ne: [{ $type: '$$f.settled.amountBs' }, 'missing'] },
                            },
                        },
                    },
                },
            },
            { $group: { _id: null, cortes: { $sum: 1 }, filas: { $sum: '$filas' } } },
        ]).toArray();

        const cortesConBs = Number(conteoBs?.cortes ?? 0);
        const filasConBs = Number(conteoBs?.filas ?? 0);

        // ── 4. EL INFORME, siempre: es la forma de revisar antes de aplicar ──
        console.log('');
        console.log(' LA TASA VIEJA, en los valores globales del bono');
        if (!bono) {
            console.log('   no hay documento de valores globales del bono');
        } else {
            console.log(`   vigente     ${hayVigente ? `${tasa(vigente)} Bs/$` : '(sin cargar)'}`);
            console.log(`   desde       ${fecha(vigenteDesde)}, puesta por ${quien(puestaPor)}`);
            console.log(`   historial   ${crudas.length} entrada(s): ${historial.length} con cambio de tasa,`
                + ` ${entradas.length - historial.length} sin cambio (eran del valor del bono)`
                + (descartadas ? `, ${descartadas} descartada(s) por no traer tasa utilizable ni fecha` : ''));
        }

        console.log('');
        console.log(` EL RECURSO NUEVO (${COL_TASA})`);
        if (accion === 'crear') {
            console.log(`   se crea con la tasa ${tasa(vigente)} y ${aEscribir.length} entrada(s) de historial`);
        } else if (accion === 'rescatar-historial') {
            console.log(`   ya existe con la tasa ${tasa(Number(yaExiste?.value))}, que NO se toca`);
            console.log(`   se le agregan ${aEscribir.length} entrada(s) de historial que si no se perderian`);
        } else {
            console.log(`   nada: ${motivo}`);
        }

        if (aEscribir.length) {
            console.log('');
            console.log(` ${col('DEJO DE REGIR', 24)} ${col('TASA', 12)} QUIEN LA HABIA PUESTO`);
            for (const c of aEscribir) {
                console.log(` ${col(fecha(c.changedAt), 24)} ${col(tasa(c.value), 12)} ${quien(c.changedBy)}`);
            }
            if (accion === 'crear') {
                console.log(` ${col('(vigente)', 24)} ${col(tasa(vigente), 12)} ${quien(puestaPor)}`);
            }
        }

        console.log('');
        console.log(' LO QUE SE BORRA');
        console.log(`   ${col(COL_BONUS, 14)} exchangeRate de ${bonoConCampo} documento(s) y de ${entradasConCampo} entrada(s) de su historial`);
        console.log(`   ${col(COL_NOMINA, 14)} ` + (hayNomina
            ? `exchangeRate de ${cortesConTasa} corte(s), settled.amountBs de ${filasConBs} fila(s) en ${cortesConBs} corte(s)`
            : 'la coleccion todavia no existe: nunca se armo un corte, no hay nada que limpiar'));

        // ── 5. NADA QUE HACER ─────────────────────────────────────────
        const hayTrabajo = accion !== 'nada' || bonoConCampo || entradasConCampo || cortesConTasa || cortesConBs;
        if (!hayTrabajo) {
            console.log('');
            console.log('No hay nada que migrar: ni queda tasa vieja en el bono ni bolivares sellados en la nomina.');
            return;
        }

        if (!aplicar) {
            console.log('');
            console.log(dryRun ? '--dry-run: no se escribe nada.' : 'Sin --aplicar no se escribe nada.');
            return;
        }

        // ── 6. ESCRIBIR ───────────────────────────────────────────────
        let creado = 0;
        let rescatadas = 0;

        if (accion === 'crear') {
            // `createdAt` y `updatedAt` llevan la fecha en que la tasa empezo a
            // regir, no la de hoy: la pantalla muestra ese `updatedAt` como
            // "cuando se actualizo la tasa", y estamparle hoy diria que la tasa
            // es de hoy cuando puede tener meses, que es justo lo que hay que
            // ver para saber que hace falta cargarla. La clave de version va
            // explicita porque la pone Mongoose al crear y aca inserta el
            // driver crudo; Mongoose la espera despues, al guardar.
            const nuevo: ExchangeRateDoc & { __v: number } = {
                value: vigente,
                source: FUENTE,
                history: aEscribir,
                updatedBy: puestaPor,
                createdAt: vigenteDesde,
                updatedAt: vigenteDesde,
                __v: 0,
            };
            await colTasa.insertOne(nuevo);
            creado = 1;
        }

        if (accion === 'rescatar-historial' && yaExiste) {
            // Van al PRINCIPIO del array, que es donde les toca: todo lo que se
            // rescata es anterior al documento que las recibe, y el historial
            // se guarda del mas viejo al mas reciente. Se empujan en vez de
            // reescribir el campo entero para no pisar una entrada que alguien
            // acabe de generar cargando la tasa desde la pantalla.
            const r = await colTasa.updateOne(
                { _id: yaExiste._id },
                { $push: { history: { $each: aEscribir, $position: 0 } } },
            );
            if (r.modifiedCount === 1) rescatadas = aEscribir.length;
            else console.log('El documento de la tasa desaparecio mientras corria el script; no se agrego nada.');
        }

        // El `$unset` de las entradas va por `arrayFilters` y no por `$[]` a
        // secas para tocar solo las que traen el campo: asi el modifiedCount
        // dice la verdad y no se reescribe un array que ya estaba limpio.
        const limpiezaBono = await colBonus.updateMany(
            { $or: [{ exchangeRate: { $exists: true } }, { 'history.exchangeRate': { $exists: true } }] },
            { $unset: { exchangeRate: '', 'history.$[cambio].exchangeRate': '' } },
            { arrayFilters: [{ 'cambio.exchangeRate': { $exists: true } }] },
        );

        // Los cortes viejos guardaron los bolivares sellados de cada fila, y
        // esos ya no son la verdad: el bolivar se deriva de la tasa vigente al
        // leer. Dejarlos seria dejar dos respuestas para la misma columna, y la
        // vieja gana siempre porque esta escrita.
        const limpiezaNomina = hayNomina
            ? (await colNomina.updateMany(
                { $or: [{ exchangeRate: { $exists: true } }, { 'rows.settled.amountBs': { $exists: true } }] },
                { $unset: { exchangeRate: '', 'rows.$[fila].settled.amountBs': '' } },
                { arrayFilters: [{ 'fila.settled.amountBs': { $exists: true } }] },
            )).modifiedCount
            : 0;

        const queSeHizo = creado
            ? `tasa ${tasa(vigente)} creada con ${aEscribir.length} entrada(s) de historial`
            : rescatadas
                ? `${rescatadas} entrada(s) de historial rescatada(s)`
                : 'el recurso de la tasa no se toco';

        console.log('');
        console.log(
            `Listo: ${queSeHizo}; ${limpiezaBono.modifiedCount} documento(s) de ${COL_BONUS} limpiado(s),`
            + ` ${limpiezaNomina} corte(s) de ${COL_NOMINA} limpiado(s).`,
        );
    } finally {
        await mongoose.disconnect();
    }
}


main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
