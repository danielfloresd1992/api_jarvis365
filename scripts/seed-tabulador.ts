/**
 * Carga los 25 cargos de la hoja TABULADOR de «MODELO DE NOMINA (1).xlsx».
 *
 *     npx tsx scripts/seed-tabulador.ts             muestra lo que haria; no escribe
 *     npx tsx scripts/seed-tabulador.ts --aplicar   escribe en la base del .env
 *
 * DOS TRABAJOS DISTINTOS, y conviene no confundirlos:
 *
 *   CARGA INICIAL   crea los 25 cargos, y SOLO si la tabla esta vacia. Con la
 *                   tabla poblada no crea nada: el nombre se edita desde la
 *                   ficha, asi que un cargo renombrado se veria como uno que
 *                   falta y se crearia duplicado. Paso de verdad con SUB
 *                   GERENTE, renombrado a GERENTE DE OPERACIONES.
 *   RELLENO         pone el salario base donde el campo FALTA. Es idempotente
 *                   y corre siempre con --aplicar.
 *
 * Antes de escribir, cada fila pasa por el mismo esquema de yup que el POST y
 * se comprueba que el TOTAL SALARIO calculado coincide con la columna O de la
 * hoja: si una sola fila no cuadra, no se escribe ninguna.
 *
 * El relleno existe porque los 25 cargos se cargaron antes de que el campo
 * existiera, y sin el la quincena sale NaN. Toca solo los documentos donde el
 * campo FALTA, asi que un cargo con salario propio no se pisa y una segunda
 * corrida no rellena nada.
 *
 * Dos decisiones sobre la hoja:
 *   - El Nº de la hoja no es unico (dos filas con 3), asi que `order` es la
 *     posicion de la fila, 1 a 25.
 *   - «OPERADOR SENIOR DIRNO» se carga como DIURNO: es un error de tecleo y
 *     el nombre es la clave unica, asi que conviene corregirlo antes de que
 *     algo apunte a el.
 */

import '../src/config/index.js'; // carga el .env antes que nada
import mongoose from 'mongoose';
import connectDB from '../src/config/db_connect.js';
import TabuladorModel from '../src/apiServises/tabulador/tabulador.model.js';
import tabuladorSchema from '../src/apiServises/tabulador/tabulador.schema.js';
import { ratesOf, DEFAULT_BASE_SALARY_BS } from '../src/apiServises/tabulador/tabulador.lib.js';


/** Una fila de la hoja: los cuatro numeros que se teclean y el total que muestra, para comprobar. */
interface FilaDeLaHoja {
    name: string;
    monthlyBasePackage: number;   // K  PAQUETE MENSUAL BASE
    fullPackage: number;          // M  PAQUETE COMPLETO
    complementaryBonus: number;   // N  BONO COMPLEMEN
    overtimeHourRate: number;     // H  HORA EXTRA
    zeroMarginOverride?: number;  // L  solo cuando la hoja lo teclea a mano
    totalEnHoja: number;          // O  TOTAL SALARIO, para comprobar
}

const HOJA: FilaDeLaHoja[] = [
    { name: 'SUB GERENTE',                          monthlyBasePackage: 400, fullPackage: 500, complementaryBonus: 100, overtimeHourRate: 2.6, totalEnHoja: 600 },
    { name: 'RRHH',                                 monthlyBasePackage: 200, fullPackage: 300, complementaryBonus:  50, overtimeHourRate: 1.9, zeroMarginOverride: 130, totalEnHoja: 380 },
    { name: 'COORDINADOR/ RESPONSABILIDAD ADM',     monthlyBasePackage: 200, fullPackage: 300, complementaryBonus: 100, overtimeHourRate: 2.9, totalEnHoja: 400 },
    { name: 'SISTEMAS',                             monthlyBasePackage: 300, fullPackage: 420, complementaryBonus:  50, overtimeHourRate: 2.6, totalEnHoja: 470 },
    { name: 'DESARROLLO',                           monthlyBasePackage: 300, fullPackage: 370, complementaryBonus:  50, overtimeHourRate: 2.3, totalEnHoja: 420 },
    { name: 'AUDITOR',                              monthlyBasePackage: 200, fullPackage: 200, complementaryBonus:  20, overtimeHourRate: 1.3, totalEnHoja: 220 },
    { name: 'MARKETING',                            monthlyBasePackage: 400, fullPackage: 400, complementaryBonus:   0, overtimeHourRate: 1.3, totalEnHoja: 400 },
    { name: 'ANALISTA/ RES. ADMIN',                 monthlyBasePackage: 100, fullPackage: 180, complementaryBonus:  60, overtimeHourRate: 1.1, totalEnHoja: 240 },
    { name: 'COORDINADOR REPORTE',                  monthlyBasePackage: 200, fullPackage: 300, complementaryBonus:  70, overtimeHourRate: 1.9, totalEnHoja: 370 },
    { name: 'COORDINADOR NOCTURNO',                 monthlyBasePackage: 200, fullPackage: 350, complementaryBonus:  50, overtimeHourRate: 2.2, totalEnHoja: 400 },
    { name: 'COORDINADOR',                          monthlyBasePackage: 200, fullPackage: 300, complementaryBonus:  50, overtimeHourRate: 1.9, totalEnHoja: 350 },
    { name: 'SUPERVISOR',                           monthlyBasePackage: 200, fullPackage: 210, complementaryBonus:   0, overtimeHourRate: 1.5, totalEnHoja: 210 },
    { name: 'OPERADOR EXPERTO NOCTURNO',            monthlyBasePackage: 200, fullPackage: 230, complementaryBonus:  20, overtimeHourRate: 1.4, totalEnHoja: 250 },
    { name: 'OPERADOR EXPERTO DIURNO',              monthlyBasePackage: 200, fullPackage: 220, complementaryBonus:  20, overtimeHourRate: 1.4, totalEnHoja: 240 },
    { name: 'OPERADOR SENIOR NOCTURNO',             monthlyBasePackage: 200, fullPackage: 250, complementaryBonus:  20, overtimeHourRate: 1.9, totalEnHoja: 270 },
    { name: 'OPERADOR SENIOR DIURNO',               monthlyBasePackage: 200, fullPackage: 250, complementaryBonus:  20, overtimeHourRate: 1.6, totalEnHoja: 270 },
    { name: 'OPERADOR DE MONITOREO DIURNO',         monthlyBasePackage: 120, fullPackage: 120, complementaryBonus:  40, overtimeHourRate: 0.8, totalEnHoja: 160 },
    { name: 'OPERADOR MONITOREO NOCTURNO',          monthlyBasePackage: 145, fullPackage: 145, complementaryBonus:  40, overtimeHourRate: 0.9, totalEnHoja: 185 },
    { name: 'ANALISTA DE SISTEMAS',                 monthlyBasePackage: 300, fullPackage: 300, complementaryBonus:   0, overtimeHourRate: 1.9, totalEnHoja: 300 },
    { name: 'OPERADOR HP DIURNO',                   monthlyBasePackage: 260, fullPackage: 260, complementaryBonus:   0, overtimeHourRate: 1.6, totalEnHoja: 260 },
    { name: 'DESARROLLADOR HP',                     monthlyBasePackage: 300, fullPackage: 300, complementaryBonus:   0, overtimeHourRate: 2.6, totalEnHoja: 300 },
    { name: 'VERIFICADOR NOCTURNO',                 monthlyBasePackage: 250, fullPackage: 250, complementaryBonus:   0, overtimeHourRate: 3.6, totalEnHoja: 250 },
    { name: 'OPERADOR DE MONITOREO HP (NOCTURNO)',  monthlyBasePackage: 250, fullPackage: 250, complementaryBonus:   0, overtimeHourRate: 3.6, totalEnHoja: 250 },
    { name: 'ANALISTAS DE REPORTES',                monthlyBasePackage: 100, fullPackage: 180, complementaryBonus:  40, overtimeHourRate: 3.6, totalEnHoja: 220 },
    { name: 'ENTRENADORA',                          monthlyBasePackage: 200, fullPackage: 250, complementaryBonus:  30, overtimeHourRate: 4.6, totalEnHoja: 280 },
];


const aplicar = process.argv.includes('--aplicar');
const OPCIONES_VALIDACION = { abortEarly: false, stripUnknown: true };


async function main() {
    // 1. Validar cada fila como lo haria el POST, y comprobar el total contra la hoja.
    const cargos = [];
    const fallos: string[] = [];

    for (const [i, fila] of HOJA.entries()) {
        const { totalEnHoja, ...datos } = fila;
        try {
            const cargo = await tabuladorSchema.validate({ ...datos, order: i + 1 }, OPCIONES_VALIDACION);
            const { totalSalary, zeroMargin } = ratesOf(cargo);
            if (Math.abs(totalSalary - totalEnHoja) > 0.005) {
                fallos.push(`${cargo.name}: el total calculado (${totalSalary}) no coincide con la hoja (${totalEnHoja})`);
            }
            cargos.push({ cargo, zeroMargin, totalSalary });
        } catch (e: any) {
            fallos.push(`${fila.name}: ${(e.errors ?? [e.message]).join('; ')}`);
        }
    }

    // 2. Mostrar la tabla siempre: es la forma de revisar antes de aplicar.
    console.log('');
    console.log(' Nº  CARGO                                   BASE  COMPLETO  BONO  H.EXTRA  MARGEN  TOTAL');
    for (const { cargo, zeroMargin, totalSalary } of cargos) {
        const margen = cargo.zeroMarginOverride != null ? `${zeroMargin}*` : `${zeroMargin}`;
        console.log(
            ` ${String(cargo.order).padStart(2)}  ${cargo.name.padEnd(38)} ${String(cargo.monthlyBasePackage).padStart(5)}` +
            ` ${String(cargo.fullPackage).padStart(9)} ${String(cargo.complementaryBonus).padStart(5)}` +
            ` ${cargo.overtimeHourRate.toFixed(2).padStart(8)} ${margen.padStart(7)} ${String(totalSalary).padStart(6)}`,
        );
    }
    console.log('');
    console.log(' * margen tecleado a mano en la hoja (la formula daria completo - base)');

    if (fallos.length) {
        console.error('');
        console.error(`No se escribe nada: ${fallos.length} fila(s) no cuadran.`);
        for (const f of fallos) console.error(` - ${f}`);
        process.exitCode = 1;
        return;
    }

    if (!aplicar) {
        console.log('');
        console.log(`${cargos.length} cargos listos. Sin --aplicar no se escribe nada.`);
        return;
    }

    // 3. Escribir.
    await connectDB();
    let creados = 0;
    let existentes = 0;
    let rellenados = 0;
    try {
        // LA CARGA INICIAL SOLO CORRE CON LA TABLA VACIA.
        //
        // Antes creaba «los que falten por nombre», y eso resucita cargos: el
        // nombre se edita desde la ficha del tabulador, asi que renombrar SUB
        // GERENTE a GERENTE DE OPERACIONES hacia que la siguiente corrida no lo
        // encontrara y lo creara de nuevo, dejando los dos. Paso de verdad.
        //
        // Con la tabla ya poblada, el nombre dejo de ser una clave estable y
        // este script no tiene forma de saber si un cargo falta o lo
        // renombraron. Asi que no adivina: informa y no escribe. Para volver a
        // cargar desde cero hay que vaciar la coleccion a mano, que es una
        // decision de una persona y no de un script.
        existentes = await TabuladorModel.countDocuments({});

        if (existentes === 0) {
            for (const { cargo } of cargos) {
                await TabuladorModel.create(cargo);
                creados += 1;
            }
        } else {
            const nombres = new Set((await TabuladorModel.find({}).select('name').lean()).map((c) => c.name));
            const ausentes = cargos.map(({ cargo }) => cargo.name).filter((n) => !nombres.has(n));
            if (ausentes.length) {
                console.log('');
                console.log(`La tabla ya tiene ${existentes} cargos, asi que NO se crea ninguno.`);
                console.log('Estos nombres de la hoja no estan en la base; lo mas probable es que');
                console.log('los hayan renombrado desde la pantalla, no que falten:');
                for (const n of ausentes) console.log(`  - ${n}`);
            }
        }

        // 4. Rellenar el salario base donde FALTE. Va despues de crear porque
        //    los recien creados ya lo traen del esquema y no entran aqui. El
        //    filtro es `$exists: false` y no `null` a proposito: lo que se
        //    arregla es la ausencia del campo en los documentos viejos, no un
        //    valor que alguien haya puesto a mano desde la pantalla.
        const relleno = await TabuladorModel.updateMany(
            { baseSalaryBs: { $exists: false } },
            { $set: { baseSalaryBs: DEFAULT_BASE_SALARY_BS } },
        );
        rellenados = relleno.modifiedCount;
    } finally {
        await mongoose.disconnect();
    }

    console.log('');
    console.log(
        creados
            ? `Listo: ${creados} creado(s) en una tabla vacia, ${rellenados} rellenado(s) con el salario base de ${DEFAULT_BASE_SALARY_BS} Bs.`
            : `Listo: la tabla ya tenia ${existentes} cargos y no se creo ninguno; ${rellenados} rellenado(s) con el salario base de ${DEFAULT_BASE_SALARY_BS} Bs.`,
    );
}


main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
