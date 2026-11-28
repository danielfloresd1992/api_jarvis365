import mongoose from 'mongoose';
import colors from 'colors';

import appConfig from '../config/index.js';
import LocalModel from '../apiServises/local/local.model.js';
import FloorPlanModel, { FLOOR_PLAN_VERSION } from '../apiServises/local/floorPlan.model.js';
import { floorPlanValidate } from '../apiServises/local/floorPlan.schema.js';
import FRANCISCA_DORAL from './croquis/francisca-doral.js';
import FRANCISCA_MIAMI from './croquis/francisca-miami.js';
import FRANCISCA_MIAMI_LAKES from './croquis/francisca-miami-lakes.js';
import FRANCISCA_DAVIE from './croquis/francisca-davie.js';
import FRANCISCA_ORLANDO from './croquis/francisca-orlando.js';
import REPORTES_GRILL_MIAMI from './croquis/reportes-grill-miami.js';

// ══════════════════════════════════════════════════════════════════════
// CARGAR LOS CROQUIS DE MESAS QUE SE PASARON A MANO
// ══════════════════════════════════════════════════════════════════════
// Se ejecuta a mano, en el servidor donde vive la API, después de desplegar:
//
//     node dist/scripts/cargar-croquis.js            solo a los locales que no tienen croquis
//     node dist/scripts/cargar-croquis.js --forzar   también pisa el que ya tengan
//     node dist/scripts/cargar-croquis.js "Reportes Grill Miami"   solo ese (o esos) local(es), por su nombre
//
// Un croquis con `establishment: null` se busca por el nombre del local, que es
// único (Local.name): para los locales cuyo _id no está a mano.
//
// En desarrollo: `npx tsx src/scripts/cargar-croquis.js`. Usa la misma base que
// la API (config/index: la local en desarrollo, MONGO_URI en producción).
//
// Hace lo mismo que PUT /local/id=:id/floor-plan, con la misma validación, pero
// sin sesión: entra directo a la base. Sin --forzar no toca un croquis que ya
// exista, porque lo que se haya corregido en Client365 vale más que esta copia.

// CROQUIS = «los croquis a cargar», cada uno con el _id de su local
const CROQUIS = [FRANCISCA_DORAL, FRANCISCA_MIAMI, FRANCISCA_MIAMI_LAKES, FRANCISCA_DAVIE, FRANCISCA_ORLANDO, REPORTES_GRILL_MIAMI];

const FORCE = process.argv.includes('--forzar');
// ONLY = «los nombres de local pedidos»: sin ninguno, todos
const ONLY = process.argv.slice(2).filter(arg => !arg.startsWith('--'));


async function main() {
    const uri = appConfig.MONGO_URI;
    if (!uri) throw new Error('No hay MONGO_URI: no se sabe a qué base entrar');
    console.log(colors.cyan(`Conectando a ${uri.replace(/\/\/[^@/]*@/, '//***@')}`));
    await mongoose.connect(uri);

    const pending = ONLY.length ? CROQUIS.filter(croquis => ONLY.includes(croquis.name)) : CROQUIS;
    const unknown = ONLY.filter(name => !CROQUIS.some(croquis => croquis.name === name));
    if (unknown.length) console.log(colors.red(`✗ sin croquis a mano para: ${unknown.join(', ')}`));

    for (const { establishment: id, name, ...body } of pending) {
        const plan = await floorPlanValidate.validate(body, { abortEarly: false, stripUnknown: true });

        // Por su _id o, si el croquis no lo trae, por su nombre (único)
        const local = id
            ? await LocalModel.findById(id).select('name').lean()
            : await LocalModel.findOne({ name }).select('name').lean();
        if (!local) {
            console.log(colors.red(`✗ ${name}: no existe el local ${id ?? `«${name}»`} en esta base`));
            continue;
        }
        const establishment = local._id;

        const existing = await FloorPlanModel.exists({ establishment });
        if (existing && !FORCE) {
            console.log(colors.yellow(`· ${local.name}: ya tiene croquis, no se toca (--forzar para pisarlo)`));
            continue;
        }

        await FloorPlanModel.findOneAndUpdate(
            { establishment },
            {
                $set: { board: plan.board, zonas: plan.zonas, piezas: plan.piezas, version: FLOOR_PLAN_VERSION },
                $setOnInsert: { establishment },
            },
            { upsert: true, runValidators: true },
        );
        console.log(colors.green(`✓ ${local.name}: croquis ${existing ? 'pisado' : 'guardado'} (${plan.zonas.length} zonas, ${plan.piezas.length} piezas)`));
    }
}


main()
    .catch(error => {
        console.error(colors.red(error?.errors?.join('\n') || error?.message || error));
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
