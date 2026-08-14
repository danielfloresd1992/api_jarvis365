import mongoose from 'mongoose';
import { config } from 'dotenv';
import colors from 'colors';
import { migrateBonusSystem, isAlreadyMigrated } from '../libs/bonus/bonusMigration.lib.js';

config();

// ══════════════════════════════════════════════════════════════════════
// MIGRAR LAS ALERTAS AL NUEVO SISTEMA DE BONIFICACIÓN
// ══════════════════════════════════════════════════════════════════════
// Se ejecuta UNA vez, a mano, en el servidor donde vive la API:
//
//     node dist/scripts/migrar-bonificacion.js            (simulacro)
//     node dist/scripts/migrar-bonificacion.js --aplicar  (escribe)
//
// Sin `--aplicar` no toca nada: informa qué haría. Una migración que reescribe
// las 348 alertas del sistema merece verse antes de correrse.
//
//
// POR QUÉ LEE LA COLECCIÓN CRUDA Y NO EL MODELO
//
// Los campos que hay que migrar —`rulesForBonus` y `bonusCalculationRules`— ya
// se retiraron del esquema. Mongoose solo devuelve lo que el esquema declara,
// así que a través del modelo llegarían vacíos. Con el driver directo se lee el
// documento tal como está en la base.
//
//
// La traducción de cada alerta vive en libs/bonus/bonusMigration.lib.js, para
// poder probarla contra el volcado real antes de escribir nada. Acá solo está
// el recorrido de la colección y el informe.
//
//
// LOS VALORES IMPOSIBLES SE CORRIGEN Y SE INFORMAN
//
// Hay catorce acumulaciones negativas y dos valores de bono negativos. La
// acumulación es DIVISOR en el corte: un negativo daría bonos negativos. Se
// llevan al mínimo válido y se listan al final, uno por uno, para que se
// revisen a mano.

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Cortes365';
const APLICAR = process.argv.includes('--aplicar');


async function main() {
    console.log(colors.cyan(`Conectando a ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}`));
    await mongoose.connect(MONGO_URI);

    const coleccion = mongoose.connection.collection('menus');
    const alertas = await coleccion.find({}).toArray();

    console.log(colors.cyan(`\n${alertas.length} alertas en la colección.\n`));

    let conLista = 0, apagadas = 0, conAvisos = 0, yaMigradas = 0;
    const revisar = [];
    const operaciones = [];

    for (const doc of alertas) {
        if (isAlreadyMigrated(doc)) {
            yaMigradas++;
            continue;
        }

        const { bonusSystem, avisos } = migrateBonusSystem(
            doc,
            (id) => new mongoose.Types.ObjectId(id),
        );

        if (bonusSystem.localExceptions.length) conLista++;
        if (!bonusSystem.isEnabled) apagadas++;
        if (avisos.length) {
            conAvisos++;
            revisar.push({ titulo: doc.es || '(sin título)', avisos });
        }

        operaciones.push({
            updateOne: {
                filter: { _id: doc._id },
                update: {
                    $set: { bonusSystem },
                    // Los dos sistemas viejos salen del documento. Ya no están
                    // en el esquema, así que dejarlos sería peso muerto que
                    // nadie puede leer ni entender.
                    $unset: { rulesForBonus: '', bonusCalculationRules: '' },
                },
            },
        });
    }

    console.log(colors.green(`  ${operaciones.length} alertas a migrar`));
    console.log(colors.green(`  ${yaMigradas} ya estaban migradas (se saltan)`));
    console.log(colors.green(`  ${conLista} con excepciones por establecimiento`));
    console.log(colors.yellow(`  ${apagadas} quedan con la bonificación APAGADA (nunca bonificaron)`));

    if (revisar.length) {
        console.log(colors.yellow(`\n── ${conAvisos} alerta(s) con valores corregidos, revisar a mano ──`));
        revisar.forEach(r => {
            console.log(colors.yellow(`  · ${r.titulo}`));
            r.avisos.forEach(a => console.log(`      ${a}`));
        });
    }

    if (!APLICAR) {
        console.log(colors.cyan('\nSIMULACRO. No se escribió nada.'));
        console.log(colors.cyan('Para aplicar:  node dist/scripts/migrar-bonificacion.js --aplicar'));
        await mongoose.disconnect();
        return;
    }

    if (!operaciones.length) {
        console.log(colors.green('\nNo hay nada que migrar.'));
        await mongoose.disconnect();
        return;
    }

    const resultado = await coleccion.bulkWrite(operaciones, { ordered: false });
    console.log(colors.green(`\nMigradas ${resultado.modifiedCount} alertas.`));

    await mongoose.disconnect();
}


main().catch(async (error) => {
    console.error(colors.red('Falló la migración:'), error);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
