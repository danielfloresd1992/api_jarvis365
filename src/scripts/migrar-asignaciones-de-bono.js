import mongoose from 'mongoose';
import { config } from 'dotenv';

// ══════════════════════════════════════════════════════════════════════
// MIGRACIÓN: Menu.bonusRule  →  Menu.bonusRules[]
// ══════════════════════════════════════════════════════════════════════
// La asignación de regla pasó de una referencia suelta a una lista de
// asignaciones con alcance, para que la misma alerta pueda ir con reglas
// distintas según el establecimiento. Este script lleva lo ya cargado al
// formato nuevo.
//
// Es MECÁNICO y sin pérdida: cada `bonusRule: X` se vuelve
// `bonusRules: [{ rule: X, scope: { mode: 'all' } }]`. Con alcance "en todos"
// la alerta se comporta exactamente igual que antes.
//
// SE CORRE UNA VEZ, a mano, contra la base:
//
//     MONGO_URI="mongodb://…" node dist/scripts/migrar-asignaciones-de-bono.js
//
// Y es IDEMPOTENTE: solo toca alertas que todavía tienen el campo viejo. Si se
// corre dos veces, la segunda no encuentra nada que hacer.
//
// Va directo a la colección con el driver, sin pasar por el modelo: el esquema
// ya no declara `bonusRule`, así que Mongoose lo descartaría antes de que este
// script pudiera leerlo.
//
// El campo viejo se BORRA al migrar. Dejarlo dejaría dos verdades en el
// documento, y el día que no coincidan no habría forma de saber cuál manda.

config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Cortes365';

async function main() {
    console.log(`Conectando a ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}`);
    await mongoose.connect(MONGO_URI);

    const menus = mongoose.connection.collection('menus');

    // Solo las que tienen algo que migrar: un ObjectId en el campo viejo.
    const pendientes = await menus.find({ bonusRule: { $type: 'objectId' } }).toArray();
    console.log(`Alertas con asignación en formato viejo: ${pendientes.length}`);

    let migradas = 0;
    for (const menu of pendientes) {
        await menus.updateOne(
            { _id: menu._id },
            {
                $set: { bonusRules: [{ rule: menu.bonusRule, scope: { mode: 'all', franchises: [], locals: [] } }] },
                $unset: { bonusRule: '' },
            },
        );
        migradas++;
    }

    // Las que tenían `bonusRule: null` —"no bonifica", decidido— solo pierden
    // el campo: `bonusRules` queda en su default (lista vacía), que dice lo mismo.
    const { modifiedCount: limpiadas } = await menus.updateMany(
        { bonusRule: null },
        { $unset: { bonusRule: '' } },
    );

    // El interruptor `bonifies` se deja explícito donde ya hay una decisión
    // tomada. No es obligatorio —`null` no bloquea nada— pero deja el dato
    // dicho en vez de deducido, que es lo que permite distinguir después una
    // alerta a medio configurar de una descartada.
    const { modifiedCount: encendidas } = await menus.updateMany(
        { bonusRules: { $exists: true, $ne: [] }, bonifies: { $in: [null, undefined] } },
        { $set: { bonifies: true } },
    );
    const { modifiedCount: apagadas } = await menus.updateMany(
        { bonusReviewed: true, $or: [{ bonusRules: { $size: 0 } }, { bonusRules: { $exists: false } }], bonifies: { $in: [null, undefined] } },
        { $set: { bonifies: false } },
    );

    console.log(`Migradas: ${migradas} · Limpiadas (eran null): ${limpiadas}`);
    console.log(`Interruptor: ${encendidas} en true (tenían reglas) · ${apagadas} en false (revisadas y sin reglas)`);
    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
