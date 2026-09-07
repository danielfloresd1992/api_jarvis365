import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

// ══════════════════════════════════════════════════════════════════════
// LA TASA DE CAMBIO: UN NÚMERO DEL QUE CUELGA TODA LA COLUMNA DE BOLÍVARES
// ══════════════════════════════════════════════════════════════════════
// Desde que la tasa dejó de sellarse dentro de cada corte, los bolívares de la
// nómina y de los bonos —los de los cortes abiertos Y los de los cerrados— se
// derivan de este único número cada vez que alguien lee. Eso reparte las
// consecuencias de un error en dos direcciones, y hay una prueba para cada una:
//
//   1. Que el ESQUEMA no deje entrar un cero. Es el caso que da miedo: un campo
//      vacío llega como 0, `min(0)` lo aceptaría, y a partir de ahí todo el
//      sistema muestra bolívares en cero sin dar un solo error. Por eso
//      `moreThan(0)`, y por eso se prueba el cero explícitamente y no como un
//      negativo más.
//
//   2. Que LEER no lance NUNCA. Es la otra mitad de la decisión: la tasa es una
//      conversión de presentación, así que si falta —o si la consulta se cae—
//      lo que corresponde es una columna en cero, visible, y no una pantalla de
//      nómina que no carga. Los dólares, que son el dato pagado, tienen que
//      poder leerse igual.
//
//   3. Que GUARDAR archive la anterior. Cuando el corte guardaba su tasa, la
//      auditoría estaba adentro del corte; ahora está acá y en ningún otro
//      lado. Si `saveExchangeRate` pisara el valor sin empujarlo al historial,
//      "¿a qué tasa se pagó enero?" se quedaría sin respuesta posible.


// ══════════════════════════════════════════════════════════════════════
// PODER CARGAR EL MÓDULO, Y HACERLO SIN BASE DE DATOS
// ══════════════════════════════════════════════════════════════════════
// El gancho es el mismo de nomina.test.ts: en src/ los imports internos llevan
// extensión .js aunque la fuente sea .ts —lo que pide nodenext—, y estas
// pruebas cargan las fuentes en crudo, donde ese .js no existe. Se traduce a
// .ts solo si el .ts está ahí al lado, de modo que un .js de verdad siga
// resolviendo como siempre.
registerHooks({
    resolve(especificador, contexto, siguiente) {
        if (especificador.startsWith('.') && especificador.endsWith('.js') && contexto.parentURL) {
            const enTypeScript = `${especificador.slice(0, -3)}.ts`;
            if (existsSync(new URL(enTypeScript, contexto.parentURL))) return siguiente(enTypeScript, contexto);
        }
        return siguiente(especificador, contexto);
    },
});

const { default: exchangeRateSchema } = await import('../src/apiServises/exchangeRate/exchangeRate.schema.ts');
const { default: ExchangeRateModel } = await import('../src/apiServises/exchangeRate/exchangeRate.model.ts');
const {
    getExchangeRate,
    getExchangeRateDetail,
    saveExchangeRate,
    DEFAULT_EXCHANGE_RATE,
} = await import('../src/apiServises/exchangeRate/exchangeRate.lib.ts');


// ══════════════════════════════════════════════════════════════════════
// LA BASE, DE MENTIRA
// ══════════════════════════════════════════════════════════════════════
// Acá no hay Mongo levantado, y lo que hay que probar de la lib no es Mongoose
// sino SU decisión: qué se archiva, qué se pisa y qué se responde cuando no hay
// nada. Así que se le cambian las estáticas al modelo por un documento en
// memoria.
//
// Se sustituyen sobre el modelo YA IMPORTADO y no con un módulo falso porque la
// lib toma `ExchangeRateModel.findOne` en el momento de llamarla: es el mismo
// objeto que ve la prueba, y así el esquema real sigue disponible más abajo
// para comprobar su forma. Un doble en un archivo aparte probaría el doble.

interface CambioFalso {
    value: number;
    source: string | null;
    changedAt: Date;
    changedBy: unknown;
}

interface DocumentoFalso {
    value: number;
    source: string | null;
    history: CambioFalso[];
    updatedBy: unknown;
    updatedAt: Date;
    save(): Promise<DocumentoFalso>;
}

/** El único documento que hay, o `null` si nadie cargó la tasa todavía. */
let guardado: DocumentoFalso | null = null;

/** Para probar que una consulta caída se responde igual que un documento que falta. */
let laBaseFalla = false;

const enBlanco = () => { guardado = null; laBaseFalla = false; camposPedidos = null; };

const documentoFalso = (datos: Record<string, unknown>): DocumentoFalso => {
    const doc: DocumentoFalso = {
        value: Number(datos.value),
        source: (datos.source ?? null) as string | null,
        history: (datos.history ?? []) as CambioFalso[],
        updatedBy: datos.updatedBy ?? null,
        updatedAt: new Date(),
        save: async () => doc,
    };
    return doc;
};

const modelo = ExchangeRateModel as unknown as Record<string, unknown>;

/** Lo que pidió la última consulta. `null` es "el documento entero". */
let camposPedidos: string | null = null;

modelo.findOne = () => {
    if (laBaseFalla) throw new Error('la base no responde');

    camposPedidos = null;

    // `findOne()` se espera de tres maneras: la lib de lectura le encadena
    // `.select().lean()` y la de escritura lo espera directo para poder
    // guardarlo. El doble tiene que servir a las dos, igual que Mongoose.
    interface Consulta extends Promise<DocumentoFalso | null> {
        select(campos: string): Consulta;
        lean(): Promise<Record<string, unknown> | null>;
    }

    const consulta = Promise.resolve(guardado) as Consulta;

    // Devuelve la misma consulta, como Mongoose, y de paso anota lo pedido: es
    // lo único que permite comprobar desde afuera que la lectura no se trae el
    // historial completo.
    consulta.select = (campos: string) => {
        camposPedidos = campos;
        return consulta;
    };

    // Un `lean` no trae métodos: se devuelve el documento SIN `save`, que es lo
    // que obliga a que la lectura no dependa de un documento hidratado. Y se
    // respeta el `select`, porque un doble que devuelve de más deja pasar
    // justamente el descuido que se quiere impedir.
    consulta.lean = async () => {
        if (!guardado) return null;

        const { save: _fuera, ...plano } = guardado;
        if (!camposPedidos) return plano;

        const pedidos = camposPedidos.split(/\s+/);
        return Object.fromEntries(Object.entries(plano).filter(([campo]) => pedidos.includes(campo)));
    };

    return consulta;
};

modelo.create = async (datos: Record<string, unknown>) => {
    guardado = documentoFalso(datos);
    return guardado;
};


/** Quien carga la tasa. Llega así desde la sesión: el id como texto. */
const CAJERA = { nameUser: 'ANA', _id: '68b1f4c2a1d3e40012ab3401' };
const GERENTE = { nameUser: 'LUIS', _id: '68b1f4c2a1d3e40012ab3402' };

const OPC = { abortEarly: false, stripUnknown: true };

/** Afirma que el esquema rechaza, y devuelve el primer mensaje. */
const rechaza = async (cuerpo: unknown): Promise<string> => {
    try {
        await exchangeRateSchema.validate(cuerpo, OPC);
        assert.fail(`debió rechazar: ${JSON.stringify(cuerpo)}`);
    }
    catch (e) {
        const error = e as { errors?: string[] };
        assert.ok(error.errors?.length, 'no parece un error de validación');
        return error.errors![0];
    }
};


test('el esquema no deja entrar una tasa que no sirve', async (t) => {

    // EL CASO QUE JUSTIFICA `moreThan` EN VEZ DE `min`. Un cero pasa por todos
    // los controles de "número no negativo" y deja la columna de bolívares de
    // la nómina y de los bonos en cero, sin un error que lo delate.
    await t.test('cero — dejaría todo el sistema mostrando bolívares en cero', async () => {
        const mensaje = await rechaza({ value: 0 });
        assert.equal(mensaje, 'La tasa tiene que ser mayor que cero');
    });

    await t.test('cero en texto, que es como llega de un campo vacío del formulario', async () => {
        const mensaje = await rechaza({ value: '0' });
        assert.equal(mensaje, 'La tasa tiene que ser mayor que cero');
    });

    await t.test('negativa — no existe un dólar que valga menos que nada', async () => {
        await rechaza({ value: -1 });
    });

    await t.test('no es un número', async () => {
        const mensaje = await rechaza({ value: 'el del banco' });
        assert.equal(mensaje, 'La tasa debe ser un número');
    });

    await t.test('sin la tasa — el PUT no es parcial: acá no hay nada que dejar como estaba', async () => {
        const mensaje = await rechaza({ source: 'manual' });
        assert.equal(mensaje, 'Hace falta la tasa');
    });

    await t.test('la tasa en null', async () => {
        await rechaza({ value: null });
    });

    await t.test('una procedencia larguísima — es una etiqueta, no un campo de notas', async () => {
        await rechaza({ value: 794.99, source: 'x'.repeat(61) });
    });
});


test('el esquema acepta una tasa del día', async (t) => {

    await t.test('con procedencia', async () => {
        const v = await exchangeRateSchema.validate({ value: 794.99, source: 've.dolarapi.com' }, OPC);
        assert.equal(v.value, 794.99);
        assert.equal(v.source, 've.dolarapi.com');
    });

    await t.test('sin procedencia: cargarla a mano sin explicar de dónde salió es válido', async () => {
        const v = await exchangeRateSchema.validate({ value: 794.99 }, OPC);
        assert.equal(v.value, 794.99);
        assert.equal(v.source, null, 'la procedencia ausente tiene que quedar en null, no en undefined');
    });

    await t.test('la tasa como texto: un input la manda así y son bolívares con decimales', async () => {
        const v = await exchangeRateSchema.validate({ value: '794.99' }, OPC);
        assert.equal(v.value, 794.99);
    });

    await t.test('la procedencia se recorta', async () => {
        const v = await exchangeRateSchema.validate({ value: 1, source: '  manual  ' }, OPC);
        assert.equal(v.source, 'manual');
    });

    await t.test('descarta lo que el cliente no puede escribir: el historial sobre todo', async () => {
        const v = await exchangeRateSchema.validate(
            { value: 794.99, history: [{ value: 1 }], updatedBy: { nameUser: 'OTRO' }, updatedAt: 'ayer' },
            OPC,
        ) as Record<string, unknown>;

        for (const clave of ['history', 'updatedBy', 'updatedAt']) {
            assert.equal(clave in v, false, `${clave} debió quedar afuera`);
        }
    });
});


test('guardar la tasa archiva la anterior', async (t) => {

    await t.test('la primera vez crea el documento, con el historial vacío', async () => {
        enBlanco();

        const tasa = await saveExchangeRate(794.99, 'manual', CAJERA);

        assert.equal(tasa.value, 794.99);
        assert.equal(tasa.source, 'manual');
        assert.deepEqual(tasa.history, [], 'un documento recién creado no tiene nada que archivar');
        assert.equal((tasa.updatedBy as typeof CAJERA).nameUser, 'ANA');
    });

    await t.test('la segunda empuja la anterior al historial y deja la nueva vigente', async () => {
        enBlanco();
        await saveExchangeRate(794.99, 'manual', CAJERA);

        const tasa = await saveExchangeRate(801.25, 've.dolarapi.com', GERENTE);

        assert.equal(tasa.value, 801.25, 'la vigente tiene que ser la nueva');
        assert.equal(tasa.source, 've.dolarapi.com');
        assert.equal(tasa.history.length, 1, 'la tasa anterior se perdió: sin ella no hay auditoría posible');

        const anterior = tasa.history[0] as CambioFalso;
        assert.equal(anterior.value, 794.99);
        assert.equal(anterior.source, 'manual');
        assert.equal((anterior.changedBy as typeof CAJERA).nameUser, 'ANA', 'el historial guarda a quien puso la vieja, no a quien la reemplazó');
        assert.ok(anterior.changedAt instanceof Date, 'sin fecha, la entrada no se puede cruzar con el cierre de un corte');
    });

    await t.test('el historial va de la más vieja a la más reciente', async () => {
        enBlanco();
        await saveExchangeRate(700, 'manual', CAJERA);
        await saveExchangeRate(750, 'manual', CAJERA);
        await saveExchangeRate(800, 'manual', GERENTE);

        const tasa = await saveExchangeRate(850, 'manual', GERENTE);

        assert.deepEqual(tasa.history.map((c: CambioFalso) => c.value), [700, 750, 800]);
        assert.equal(tasa.value, 850);
    });

    // A propósito, y distinto del bono: allá saltear el caso evita anotar un
    // cambio del reglamento que nunca ocurrió. Acá cada PUT es alguien
    // declarando la tasa de hoy, y que dos días seguidos diera lo mismo es
    // parte de la respuesta a "¿a qué tasa se pagó este corte?".
    await t.test('cargar la misma tasa otra vez también se archiva: es la del día, no un cambio', async () => {
        enBlanco();
        await saveExchangeRate(794.99, 'manual', CAJERA);

        const tasa = await saveExchangeRate(794.99, 'manual', CAJERA);

        assert.equal(tasa.history.length, 1);
        assert.equal((tasa.history[0] as CambioFalso).value, 794.99);
    });

    await t.test('sin procedencia se guarda null, y así queda en el historial', async () => {
        enBlanco();
        await saveExchangeRate(794.99, null, CAJERA);

        const tasa = await saveExchangeRate(801.25, null, CAJERA);

        assert.equal(tasa.source, null);
        assert.equal((tasa.history[0] as CambioFalso).source, null);
    });
});


test('leer la tasa nunca lanza', async (t) => {

    // LA RAZÓN DE SER DE ESTAS DOS FUNCIONES. Un corte de nómina se lee para
    // ver lo que se paga, y eso está en dólares. Que la conversión a bolívares
    // no esté cargada no puede tumbar esa lectura.
    await t.test('sin documento devuelve cero, no una excepción', async () => {
        enBlanco();

        assert.equal(await getExchangeRate(), 0);
        assert.equal(DEFAULT_EXCHANGE_RATE, 0, 'el defecto tiene que ser cero: un cero se ve, una tasa inventada se paga');
    });

    await t.test('sin documento, el detalle dice que no está configurada', async () => {
        enBlanco();

        const d = await getExchangeRateDetail();
        assert.equal(d.value, 0);
        assert.equal(d.configured, false);
        assert.equal(d.source, null);
        assert.equal(d.updatedAt, null);
        assert.equal(d.updatedBy, null);
    });

    await t.test('leer no crea el documento: una lectura no puede dejar un cero guardado', async () => {
        enBlanco();
        await getExchangeRateDetail();

        assert.equal(guardado, null);
    });

    await t.test('con la base caída responde igual que si faltara la tasa', async () => {
        enBlanco();
        laBaseFalla = true;

        assert.equal(await getExchangeRate(), 0);
        assert.equal((await getExchangeRateDetail()).configured, false);
    });

    await t.test('con la tasa cargada devuelve la vigente y de dónde salió', async () => {
        enBlanco();
        await saveExchangeRate(794.99, 've.dolarapi.com', CAJERA);

        const d = await getExchangeRateDetail();
        assert.equal(d.value, 794.99);
        assert.equal(d.source, 've.dolarapi.com');
        assert.equal(d.configured, true);
        assert.ok(d.updatedAt instanceof Date, 'sin la fecha no se puede saber si la tasa es de hoy');
        assert.equal(await getExchangeRate(), 794.99);
    });

    // Quien llama acá es la nómina y el bono, varias veces por pantalla, y el
    // historial suma un renglón por cada tasa que se carga: sin acotar la
    // lectura, en un año se estarían trayendo cientos de entradas de auditoría
    // para usar un solo número.
    await t.test('leer no arrastra el historial', async () => {
        enBlanco();
        await saveExchangeRate(794.99, 'manual', CAJERA);
        await saveExchangeRate(801.25, 'manual', GERENTE);

        const d = await getExchangeRateDetail();

        assert.equal(d.value, 801.25, 'acotar la lectura no puede cambiar lo que devuelve');
        assert.ok(camposPedidos, 'la lectura se trajo el documento entero');
        assert.equal(camposPedidos!.includes('history'), false, 'la lectura pidió el historial, que es lo que crece sin tope');
    });
});


// ══════════════════════════════════════════════════════════════════════
// LA FORMA DEL DOCUMENTO
// ══════════════════════════════════════════════════════════════════════
// Lo que hace que la auditoría siga siendo posible después de sacarle la tasa
// al corte no es una ruta, es este documento: un solo valor vigente y todos los
// anteriores con su fecha.

test('el modelo guarda la vigente y todas las anteriores', async (t) => {

    const valor = ExchangeRateModel.schema.path('value');
    const historial = ExchangeRateModel.schema.path('history') as unknown as { schema: { path(c: string): unknown; options: Record<string, unknown> } };

    await t.test('la tasa es obligatoria', () => {
        assert.equal((valor as unknown as { options: Record<string, unknown> }).options.required, true);
    });

    // Es el mismo cero de arriba entrando por la otra puerta: un `default` haría
    // que un `create` sin valor guardara una tasa de cero en vez de fallar.
    await t.test('y NO tiene defecto: un cero guardado no se distingue de una tasa real', () => {
        assert.equal((valor as unknown as { options: Record<string, unknown> }).options.default, undefined);
    });

    await t.test('cada entrada del historial guarda el valor y cuándo dejó de regir', () => {
        for (const campo of ['value', 'source', 'changedAt']) {
            assert.ok(historial.schema.path(campo), `el historial no guarda ${campo}`);
        }
    });

    await t.test('y a quién la había puesto, con el nombre adentro', () => {
        assert.ok(historial.schema.path('changedBy.nameUser'), 'una auditoría de hace seis meses no puede depender de un populate');
        assert.ok(historial.schema.path('changedBy._id'), 'sin el id no se puede llegar al usuario cuando sigue existiendo');
    });

    await t.test('las entradas del historial no llevan _id propio: la fecha ya las ordena', () => {
        assert.equal(historial.schema.options._id, false);
    });

    await t.test('lleva timestamps: `updatedAt` es lo que dice si la tasa es de hoy', () => {
        assert.ok(ExchangeRateModel.schema.path('updatedAt'), 'sin updatedAt no se puede avisar que la tasa está vieja');
    });
});
