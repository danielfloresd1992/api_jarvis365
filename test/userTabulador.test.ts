import test from 'node:test';
import assert from 'node:assert/strict';
import { userUpdateSchema, userSchemaComplete } from '../src/apiServises/user/user.schema.js';
import UserModel from '../src/apiServises/user/user.model.js';
import TabuladorModel from '../src/apiServises/tabulador/tabulador.model.ts';
import { describeError } from '../src/middleware/asyncHandler.ts';

// ══════════════════════════════════════════════════════════════════════
// EL CARGO DEL USUARIO APUNTA AL TABULADOR
// ══════════════════════════════════════════════════════════════════════
// `jobInformation.position` era un texto de una lista fija de trece puestos.
// Ahora es `jobInformation.tabuladorPosition`, el id de un cargo del
// tabulador, que es quien sabe cuanto paga cada uno.
//
// Tres cosas se prueban:
//
//   1. Que yup acepte null ("sin cargo") y un ObjectId, y RECHACE lo demas
//      con un mensaje claro, en vez de dejar pasar un texto que Mongoose
//      convertiria en un CastError a mitad de camino.
//
//   2. Que un cliente viejo que todavia manda `position` no rompa nada: la
//      clave anidada pasa sin error y ningun esquema la declara, asi que
//      no hay rama de codigo que la lea.
//
//   3. Que el modelo apunte exactamente al modelo registrado del tabulador.
//      Un `ref` mal escrito no falla al cargar: falla en el primer populate,
//      y para entonces ya hay datos guardados.

const ID_VALIDO = '507f1f77bcf86cd799439011';

/** Afirma que el esquema rechaza el cuerpo, y devuelve el primer mensaje. */
const rechaza = async (esquema: { validate: (v: unknown) => Promise<unknown> }, cuerpo: unknown): Promise<string> => {
    try {
        await esquema.validate(cuerpo);
        assert.fail(`debio rechazar: ${JSON.stringify(cuerpo)}`);
    }
    catch (e) {
        const error = e as { errors?: string[] };
        assert.ok(error.errors?.length, 'no parece un error de validacion');
        return error.errors![0];
    }
};

/** Lo que devuelve yup para jobInformation, sin pelear con el tipo inferido. */
const cargoDe = (validado: unknown): unknown =>
    (validado as { jobInformation?: { tabuladorPosition?: unknown } }).jobInformation?.tabuladorPosition;


test('el esquema de actualizacion valida el cargo', async (t) => {

    await t.test('acepta null: es "sin cargo"', async () => {
        const v = await userUpdateSchema.validate({ jobInformation: { tabuladorPosition: null } });
        assert.equal(cargoDe(v), null);
    });

    await t.test('acepta un ObjectId valido y lo deja tal cual', async () => {
        const v = await userUpdateSchema.validate({ jobInformation: { tabuladorPosition: ID_VALIDO } });
        assert.equal(cargoDe(v), ID_VALIDO);
    });

    await t.test('si no viene, queda en null', async () => {
        const v = await userUpdateSchema.validate({ jobInformation: { department: 'Operaciones' } });
        assert.equal(cargoDe(v), null);
    });

    await t.test('rechaza un texto que no es un id', async () => {
        const mensaje = await rechaza(userUpdateSchema, { jobInformation: { tabuladorPosition: 'abc' } });
        assert.equal(mensaje, 'El cargo no es un id valido');
    });

    await t.test('rechaza un numero', async () => {
        const mensaje = await rechaza(userUpdateSchema, { jobInformation: { tabuladorPosition: 5 } });
        assert.equal(mensaje, 'El cargo no es un id valido');
    });

    await t.test('rechaza un id de 23 caracteres', async () => {
        await rechaza(userUpdateSchema, { jobInformation: { tabuladorPosition: ID_VALIDO.slice(0, 23) } });
    });

    await t.test('un id mal formado es un 400, no un 404 ni un 500', async () => {
        try {
            await userUpdateSchema.validate({ jobInformation: { tabuladorPosition: 'abc' } });
            assert.fail('debio rechazar');
        }
        catch (e) {
            const cuerpo = describeError(e);
            assert.equal(cuerpo.status, 400);
            assert.match(cuerpo.message, /El cargo no es un id valido/);
        }
    });
});


test('el esquema de creacion valida el cargo igual', async (t) => {
    const base = { user: 'jperez', name: 'Juan', surName: 'Perez', phone: '0412' };

    await t.test('acepta null y un ObjectId', async () => {
        const conNull = await userSchemaComplete.validate({ ...base, jobInformation: { tabuladorPosition: null } });
        assert.equal(cargoDe(conNull), null);

        const conId = await userSchemaComplete.validate({ ...base, jobInformation: { tabuladorPosition: ID_VALIDO } });
        assert.equal(cargoDe(conId), ID_VALIDO);
    });

    await t.test('rechaza lo que no es un id', async () => {
        const mensaje = await rechaza(userSchemaComplete, { ...base, jobInformation: { tabuladorPosition: 'abc' } });
        assert.equal(mensaje, 'El cargo no es un id valido');
    });
});


test('el puesto viejo ya no existe en ningun sitio', async (t) => {

    await t.test('un cliente viejo que manda position no rompe la validacion', async () => {
        const v = await userUpdateSchema.validate({
            jobInformation: { position: 'Gerente', tabuladorPosition: ID_VALIDO },
        });
        assert.equal(cargoDe(v), ID_VALIDO);
    });

    await t.test('ningun esquema de yup declara position', () => {
        const enActualizacion = (userUpdateSchema.fields.jobInformation as { fields: Record<string, unknown> }).fields;
        const enCreacion = (userSchemaComplete.fields.jobInformation as { fields: Record<string, unknown> }).fields;
        assert.equal(enActualizacion.position, undefined, 'userUpdateSchema todavia declara position');
        assert.equal(enCreacion.position, undefined, 'userSchemaComplete todavia declara position');
        assert.ok(enActualizacion.tabuladorPosition, 'userUpdateSchema no declara tabuladorPosition');
        assert.ok(enCreacion.tabuladorPosition, 'userSchemaComplete no declara tabuladorPosition');
    });

    await t.test('el modelo tampoco', () => {
        assert.equal(UserModel.schema.path('jobInformation.position'), undefined, 'el modelo todavia declara position');
    });
});


test('el modelo apunta al tabulador', async (t) => {

    await t.test('es un ObjectId con ref al modelo registrado del tabulador', () => {
        const ruta = UserModel.schema.path('jobInformation.tabuladorPosition');
        assert.ok(ruta, 'el modelo no declara jobInformation.tabuladorPosition');
        assert.equal(ruta.instance, 'ObjectID');
        assert.equal(ruta.options.ref, TabuladorModel.modelName);
        assert.equal(TabuladorModel.modelName, 'TabuladorPosition');
    });

    await t.test('nace en null, no en undefined', () => {
        assert.equal(UserModel.schema.path('jobInformation.tabuladorPosition').options.default, null);
    });

    await t.test('el departamento sigue donde estaba', () => {
        assert.ok(UserModel.schema.path('jobInformation.department'), 'el modelo perdio jobInformation.department');
    });
});
