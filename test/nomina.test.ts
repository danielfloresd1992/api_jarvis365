import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';

// ══════════════════════════════════════════════════════════════════════
// LA NOMINA: UN MES, CUATRO CORTES, Y LO PAGADO NO SE MUEVE
// ══════════════════════════════════════════════════════════════════════
// Un mes de nomina no es una consulta al tabulador: el dia que se crea SELLA
// las cifras del cargo de cada persona, y el dia que se cierra un corte sella
// tambien sus dolares. Todo lo que se prueba aqui sale de esa idea, y todo es
// dinero:
//
//   1. QUE LOS CUATRO CORTES REPARTAN EL TOTAL SALARIO. En el tabulador,
//      TOTAL SALARIO = paquete base + margen "0" + bono complementario. Las
//      dos quincenas pagan el primero por mitades y los otros dos cortes
//      pagan los otros dos sumandos. Si esa igualdad se rompe, el mes paga
//      distinto de lo que dice el tabulador y nadie lo veria hasta el
//      reclamo. Es LA prueba de este archivo.
//
//   2. Que el esquema del mes RECHACE lo que no es un mes: un mes 13, un año
//      de dos cifras, una lista de gente vacia. Un mes mal creado sella mal a
//      la plantilla entera de una vez.
//
//   3. Que cada corte solo admita LO SUYO. En una quincena se cuentan dias y
//      horas; en margen "0" y en bono solo se teclea el descuento, porque no
//      cubren dias trabajados. Mandarle horas extras a un bono no puede
//      terminar pagando horas.
//
//   4. Que rowAmounts reproduzca las filas reales de la hoja de AGOSTO, cifra
//      por cifra. Son cinco personas verificadas contra el Excel: si alguien
//      toca una tarifa de tabulador.lib, esto es lo que lo delata. Se
//      comprueban las dos mitades por separado —el paquete de la quincena y
//      los movimientos, que son la columna Q— porque un error en una se
//      compensa con el otro y el total seguiria cuadrando.
//
//   5. Que lo ya liquidado no se recalcule EN DOLARES. Una fila con `settled`
//      responde con los dolares que se pagaron, aunque hoy la formula diera
//      otra cosa. Es lo mismo que hace el modulo de bonos con el valor
//      sellado de cada novedad.
//
//   6. Que los BOLIVARES si se muevan, que es el reverso de lo anterior. La
//      tasa dejo de ser un campo del corte y es una variable global del
//      sistema: `withAmounts` la recibe y convierte al leer. Lo fija la
//      prueba que lee la MISMA fila cerrada con dos tasas distintas y espera
//      los mismos dolares y otros bolivares. El dia que alguien devuelva la
//      tasa al mes "para que enero no se mueva", esa prueba lo dice.
//
//   7. Que cada corte se cierre POR SU CUENTA. Se pagan en fechas distintas,
//      asi que cerrar la primera quincena no puede tocar a las otras tres, y
//      el mes solo esta cerrado cuando lo estan los cuatro.


// ══════════════════════════════════════════════════════════════════════
// PRIMERO, PODER CARGAR EL MODULO
// ══════════════════════════════════════════════════════════════════════
// En src/ los imports internos llevan extension .js aunque la fuente sea .ts:
// es lo que pide nodenext y lo que queda bien despues del build. Estas pruebas
// cargan las fuentes en crudo, sin build, y ahi ese .js no existe: nomina.lib
// pide '../tabulador/tabulador.lib.js' y Node no encuentra el archivo.
//
// El gancho traduce el .js a la fuente .ts SOLO si el .ts esta ahi al lado, de
// modo que un .js de verdad, como user.model.js, siga resolviendo como
// siempre. Y el modulo entra por import() y no por un import de arriba porque
// los de arriba se resuelven antes de que el cuerpo del archivo corra: el
// gancho llegaria tarde.
registerHooks({
    resolve(especificador, contexto, siguiente) {
        if (especificador.startsWith('.') && especificador.endsWith('.js') && contexto.parentURL) {
            const enTypeScript = `${especificador.slice(0, -3)}.ts`;
            if (existsSync(new URL(enTypeScript, contexto.parentURL))) return siguiente(enTypeScript, contexto);
        }
        return siguiente(especificador, contexto);
    },
});

const { nominaMonthSchema, quincenaRowSchema, extraRowSchema, rowSchemaFor, isCutKind } =
    await import('../src/apiServises/nomina/nomina.schema.ts');
const { default: NominaModel, CUT_KINDS } = await import('../src/apiServises/nomina/nomina.model.ts');
const { rowAmounts, withAmounts, datesOfCut, titleOf, positionAmount, CUT_LABELS } =
    await import('../src/apiServises/nomina/nomina.lib.ts');
const { ratesOf } = await import('../src/apiServises/tabulador/tabulador.lib.ts');


const OPC = { abortEarly: false, stripUnknown: true };

/**
 * Bs por dolar. Es la del sistema al momento de LEER, no una del mes: el mes
 * no guarda ninguna. Se le sigue diciendo la de agosto porque con ella se
 * verificaron los bolivares contra el Excel.
 */
const TASA = 794.99;

/** La tasa de otro dia. Existe para probar que el dolar cerrado no se mueve con ella. */
const TASA_DE_HOY = 1200;

/** Cuantas veces se paga el mes. Es lo unico que rowAmounts pide del mes. */
const PAGOS = 2;

/**
 * Los ids que una persona marco en pantalla. Son ObjectId en texto porque asi
 * llegan en un JSON, y el esquema tiene que mirarlos antes de que el servidor
 * los busque: un id de veintitres digitos no es "una persona que no existe",
 * es un cuerpo mal armado, y eso se responde con 400 y no con un mes a medias.
 */
const ELEGIDOS = ['68b1f4c2a1d3e40012ab3401', '68b1f4c2a1d3e40012ab3402'];

/** Un cuerpo de POST valido: agosto de 2025. */
const MES = { year: 2025, month: 8, users: ELEGIDOS };


/**
 * Afirma que un esquema rechaza, y devuelve el primer mensaje. Se fabrica por
 * esquema porque aqui hay tres y validan cosas distintas.
 */
const rechazaCon = (esquema: { validate(cuerpo: unknown, opciones: typeof OPC): Promise<unknown> }) =>
    async (cuerpo: unknown): Promise<string> => {
        try {
            await esquema.validate(cuerpo, OPC);
            assert.fail(`debió rechazar: ${JSON.stringify(cuerpo)}`);
        }
        catch (e) {
            const error = e as { errors?: string[] };
            assert.ok(error.errors?.length, 'no parece un error de validación');
            return error.errors![0];
        }
    };

const rechazaMes = rechazaCon(nominaMonthSchema);
const rechazaQuincena = rechazaCon(quincenaRowSchema);


/** Comparacion con tolerancia: son cuentas en coma flotante. */
const igual = (real: number, esperado: number, que: string, tolerancia = 1e-9) =>
    assert.ok(Math.abs(real - esperado) < tolerancia, `${que}: ${real} en vez de ${esperado}`);


/**
 * El sello del cargo dentro de una persona, tal como lo copia el POST: las
 * cifras que se teclean en el tabulador, no las tarifas, que salen de ratesOf().
 */
const sello = (base: number, completo: number, hora: number, bono = 0) => ({
    tabuladorPosition: null,
    name: 'CARGO SELLADO',
    monthlyBasePackage: base,
    fullPackage: completo,
    complementaryBonus: bono,
    overtimeHourRate: hora,
    zeroMarginOverride: null,
    baseSalaryBs: 130,
});


/** Una fila sin movimientos, lista para que cada prueba ponga los suyos. */
const fila = () => ({
    user: '000000000000000000000001',
    sundays: 0,
    additionalDays: 0,
    overtimeHours: 0,
    zeroMarginDeduction: 0,
    otherDeductions: 0,
    settled: null as unknown,
});


// ══════════════════════════════════════════════════════════════════════
// 1. LOS CUATRO CORTES REPARTEN EL TOTAL SALARIO
// ══════════════════════════════════════════════════════════════════════

test('los cuatro cortes reparten el TOTAL SALARIO del tabulador', async (t) => {

    // Un cargo con las tres piezas distintas de cero, para que un reparto mal
    // hecho no pueda cuadrar por casualidad: base 400, margen "0" 100 (500-400)
    // y bono 25. Total salario = 525.
    const cargo = sello(400, 500, 2.6, 25);
    const tarifas = ratesOf(cargo);

    await t.test('el tabulador dice 525 y los cuatro cortes suman 525', () => {
        igual(tarifas.totalSalary, 525, 'TOTAL SALARIO del tabulador');

        const suma = CUT_KINDS.reduce(
            (total, kind) => total + rowAmounts(kind, fila(), cargo, PAGOS).amountUsd,
            0,
        );

        igual(suma, tarifas.totalSalary, 'los cuatro cortes contra el total salario');
    });

    await t.test('cada corte paga su parte, y ninguna es la del otro', () => {
        igual(positionAmount('quincena1', cargo, tarifas, PAGOS), 200, 'la 1ª quincena');
        igual(positionAmount('quincena2', cargo, tarifas, PAGOS), 200, 'la 2ª quincena');
        igual(positionAmount('margen0', cargo, tarifas, PAGOS), 100, 'el margen "0"');
        igual(positionAmount('bono', cargo, tarifas, PAGOS), 25, 'el bono complementario');
    });

    // El margen "0" a mano existe por una sola fila de la hoja (RRHH, 130 en
    // vez de 100). Si el corte lo calculara restando por su cuenta en vez de
    // pedirselo a ratesOf, esa persona cobraria 100 y nadie lo notaria.
    await t.test('el margen "0" tecleado a mano manda sobre la resta', () => {
        const rrhh = { ...sello(400, 500, 2.6, 25), zeroMarginOverride: 130 };

        igual(rowAmounts('margen0', fila(), rrhh, PAGOS).amountUsd, 130, 'el margen "0" a mano');
        igual(
            CUT_KINDS.reduce((t2, k) => t2 + rowAmounts(k, fila(), rrhh, PAGOS).amountUsd, 0),
            ratesOf(rrhh).totalSalary,
            'el reparto sigue cuadrando con el override',
        );
    });

    await t.test('un mes que se paga de una sola vez sigue cuadrando', () => {
        const suma = CUT_KINDS.reduce(
            (total, kind) => total + rowAmounts(kind, fila(), cargo, 1).amountUsd,
            0,
        );

        // Con un solo pago al mes cada "quincena" paga el paquete entero, asi
        // que el reparto suma un paquete de mas. Es lo esperado: el numero de
        // pagos dice en cuantas veces se reparte, y con uno solo el segundo
        // corte sobra. Se fija para que quede dicho que 2 no es decoracion.
        igual(suma, tarifas.totalSalary + 400, 'con un pago al mes sobra un corte');
    });
});


// ══════════════════════════════════════════════════════════════════════
// 2. EL ESQUEMA DEL MES
// ══════════════════════════════════════════════════════════════════════

test('el esquema del mes rechaza lo que no es un mes', async (t) => {

    await t.test('acepta un mes bien armado', async () => {
        const v = await nominaMonthSchema.validate(MES, OPC);
        assert.equal(v.year, 2025);
        assert.equal(v.month, 8);
        assert.deepEqual(v.users, ELEGIDOS);
    });

    await t.test('los pagos del mes son 2 si no vienen', async () => {
        const v = await nominaMonthSchema.validate(MES, OPC);
        assert.equal(v.payPeriodsPerMonth, 2);
    });

    await t.test('un mes 13 no existe', async () => {
        assert.match(await rechazaMes({ ...MES, month: 13 }), /del 1 al 12/);
    });

    await t.test('un mes 0 tampoco: los meses se cuentan desde uno', async () => {
        assert.match(await rechazaMes({ ...MES, month: 0 }), /del 1 al 12/);
    });

    await t.test('un año de dos cifras es un error de tecleo, no un año', async () => {
        assert.match(await rechazaMes({ ...MES, year: 25 }), /no parece un año/);
    });

    // Un mes sin nadie no es un mes a medias: es un documento que parece hecho
    // y no le paga a ninguna persona.
    await t.test('sin gente no hay mes', async () => {
        assert.match(await rechazaMes({ ...MES, users: [] }), /al menos una persona/);
        assert.match(await rechazaMes({ year: 2025, month: 8 }), /al menos una persona/);
    });

    await t.test('un id que no tiene forma de id se rechaza antes de buscarlo', async () => {
        assert.match(await rechazaMes({ ...MES, users: ['no-soy-un-id'] }), /forma de id/);
    });

    // Mongo devuelve los ids en minusculas. Sin normalizar, un id copiado de un
    // log en mayusculas pasa la validacion, la persona SE ENCUENTRA, y la ruta
    // la acusa igual de inexistente porque compara los textos.
    await t.test('un id en mayúsculas se normaliza en vez de acusarlo de no existir', async () => {
        const v = await nominaMonthSchema.validate({ ...MES, users: ['68B1F4C2A1D3E40012AB3401'] }, OPC);
        assert.deepEqual(v.users, ['68b1f4c2a1d3e40012ab3401']);
    });

    // El titulo y las fechas los pone el servidor. Aceptarlos abriria la puerta
    // a un mes que se llama "Agosto" y dice ser el 9.
    await t.test('el título, la gente y los cortes no se mandan: los pone el servidor', async () => {
        const v = await nominaMonthSchema.validate(
            { ...MES, title: 'LO QUE YO DIGA', people: [{}], cuts: [{}], status: 'cerrado' },
            OPC,
        ) as Record<string, unknown>;

        assert.equal('title' in v, false, 'el título entró desde el cliente');
        assert.equal('people' in v, false, 'el sello entró desde el cliente');
        assert.equal('cuts' in v, false, 'los cortes entraron desde el cliente');
        assert.equal('status' in v, false, 'el estado entró desde el cliente');
    });

    // La tasa es una variable global del sistema. Aceptarla aqui la volveria a
    // meter dentro del mes, que es justo lo que se saco.
    await t.test('la tasa no vuelve a entrar por el cuerpo', async () => {
        const v = await nominaMonthSchema.validate({ ...MES, exchangeRate: 794.99 }, OPC) as Record<string, unknown>;
        assert.equal('exchangeRate' in v, false, 'la tasa volvió a entrar al mes');
    });
});


// ══════════════════════════════════════════════════════════════════════
// 3. CADA CORTE ADMITE LO SUYO
// ══════════════════════════════════════════════════════════════════════

test('cada corte solo admite lo que de verdad se le teclea', async (t) => {

    await t.test('los cuatro tipos son los cuatro, y nada más', () => {
        assert.deepEqual([...CUT_KINDS], ['quincena1', 'quincena2', 'bono', 'margen0']);
        assert.ok(isCutKind('quincena1'));
        assert.equal(isCutKind('quincena3'), false);
        assert.equal(isCutKind(''), false);
        assert.equal(isCutKind(undefined), false);
    });

    await t.test('a cada tipo le toca su esquema', () => {
        assert.equal(rowSchemaFor('quincena1'), quincenaRowSchema);
        assert.equal(rowSchemaFor('quincena2'), quincenaRowSchema);
        assert.equal(rowSchemaFor('margen0'), extraRowSchema);
        assert.equal(rowSchemaFor('bono'), extraRowSchema);
    });

    // Los dias y las horas se cuentan enteros porque asi se cuentan en la hoja:
    // no hay medio domingo trabajado.
    await t.test('en una quincena los conteos son enteros y los descuentos no', async () => {
        assert.match(await rechazaQuincena({ sundays: 1.5 }), /número entero/);
        assert.match(await rechazaQuincena({ overtimeHours: 2.5 }), /número entero/);
        assert.match(await rechazaQuincena({ sundays: -1 }), /no puede ser negativo/);

        const v = await quincenaRowSchema.validate({ otherDeductions: 12.75 }, OPC);
        assert.equal(v.otherDeductions, 12.75, 'un descuento con céntimos es válido');
    });

    // Un campo ausente es "no le descuentes nada", no "dejalo como estaba": el
    // PUT de una fila es un reemplazo completo.
    await t.test('una fila vacía es una fila en cero, no un error', async () => {
        assert.deepEqual(await quincenaRowSchema.validate({}, OPC), {
            sundays: 0, additionalDays: 0, overtimeHours: 0,
            zeroMarginDeduction: 0, otherDeductions: 0,
        });
    });

    // Margen "0" y bono no cubren dias trabajados: son cifras del cargo que se
    // pagan una vez al mes. Si `sundays` entrara, pagaria dias en un corte que
    // no los tiene.
    await t.test('en margen "0" y en bono solo se teclea el descuento', async () => {
        const v = await extraRowSchema.validate(
            { otherDeductions: 5, sundays: 9, additionalDays: 9, overtimeHours: 9, zeroMarginDeduction: 9 },
            OPC,
        ) as Record<string, unknown>;

        assert.deepEqual(v, { otherDeductions: 5 });
        assert.equal('sundays' in v, false, 'un bono aceptó domingos trabajados');
    });

    await t.test('el monto de margen "0" y de bono no se teclea: lo pone el cargo', async () => {
        const v = await extraRowSchema.validate({ fromPosition: 999, amountUsd: 999 }, OPC) as Record<string, unknown>;
        assert.deepEqual(v, { otherDeductions: 0 });
    });
});


// ══════════════════════════════════════════════════════════════════════
// 4. LA HOJA DE AGOSTO, FILA POR FILA
// ══════════════════════════════════════════════════════════════════════
// Cinco personas reales del corte, ya verificadas contra el Excel. Las tres
// correspondencias que hacen falta para leerlas:
//
//   domingos y feriados = TABULADOR columna C (FERIADO DOMINGO) x Nº
//   dia adicional       = TABULADOR columna E (DIA LABORADO PAQ. COMPLETO) x Nº
//   horas extras        = TABULADOR columna H (HORA EXTRA) x Nº
//
// `movimientos` es la columna Q de la hoja: el total menos el paquete de la
// quincena. Se afirma aparte del total a proposito: si el paquete se calculara
// con los pagos al mes cambiados y los movimientos compensaran la diferencia,
// un solo assert sobre el total no lo veria.

const AGOSTO = [
    { quien: 'KERVIS VALLADARES', base: 400, completo: 500, hora: 2.6, domingos: 3, dias: 0, horas: 3, movimientos: 32.80, total: 232.80 },
    { quien: 'SORIELIS PERALES', base: 200, completo: 300, hora: 1.9, domingos: 3, dias: 0, horas: 11, movimientos: 35.90, total: 135.90 },
    { quien: 'DANIEL FLORES', base: 300, completo: 370, hora: 2.3, domingos: 3, dias: 0, horas: 2, movimientos: 23.10, total: 173.10 },
    { quien: 'BRESIA RODRIGUEZ', base: 120, completo: 120, hora: 0.8, domingos: 3, dias: 3, horas: 0, movimientos: 18.00, total: 78.00 },
    { quien: 'CRISTIAN VALERA', base: 120, completo: 120, hora: 0.8, domingos: 0, dias: 7, horas: 0, movimientos: 28.00, total: 88.00 },
];


test('los montos de una quincena son los de la hoja de agosto', async (t) => {

    for (const persona of AGOSTO) {
        await t.test(`${persona.quien} — paquete ${persona.base} / 2, movimientos ${persona.movimientos}`, () => {
            const f = fila();
            f.sundays = persona.domingos;
            f.additionalDays = persona.dias;
            f.overtimeHours = persona.horas;

            const a = rowAmounts('quincena2', f, sello(persona.base, persona.completo, persona.hora), PAGOS);

            igual(a.fromPosition, persona.base / 2, 'el paquete de la quincena');
            igual(a.amountUsd - a.fromPosition, persona.movimientos, 'los movimientos, columna Q');
            igual(a.amountUsd, persona.total, 'el total en dolares');
        });
    }

    // rowAmounts es la formula, y la formula esta en dolares. Los bolivares se
    // pegan al responder, en withAmounts, con la tasa vigente: si volvieran a
    // salir de aqui, harian falta otra vez una tasa dentro del mes.
    await t.test('rowAmounts no devuelve bolívares: la conversión no es parte del cálculo', () => {
        assert.equal('amountBs' in rowAmounts('quincena1', fila(), sello(400, 500, 2.6), PAGOS), false);
    });

    await t.test('KERVIS — los movimientos abiertos: 3 domingos a 500/60 y 3 horas a 2,6', () => {
        const f = fila();
        f.sundays = 3;
        f.overtimeHours = 3;

        const a = rowAmounts('quincena2', f, sello(400, 500, 2.6), PAGOS);

        igual(a.sundays, 500 / 30 / 2 * 3, 'FERIADO DOMINGO x 3');
        igual(a.additionalDays, 0, 'no trabajó días adicionales');
        igual(a.overtimeHours, 2.6 * 3, 'HORA EXTRA x 3');
    });

    await t.test('BRESIA — es la que prueba el día adicional: 3 días a 120/30', () => {
        const f = fila();
        f.sundays = 3;
        f.additionalDays = 3;

        const a = rowAmounts('quincena1', f, sello(120, 120, 0.8), PAGOS);

        igual(a.sundays, 6, 'FERIADO DOMINGO x 3');
        igual(a.additionalDays, 12, 'DIA LABORADO PAQUETE COMPLETO x 3');
        igual(a.overtimeHours, 0, 'no hizo horas extras');
    });

    // Las deducciones pueden superar lo devengado: en la hoja real hay once
    // casos. Llevarlos a cero seria perdonar una deuda que la hoja no perdona.
    await t.test('el total puede quedar negativo y no se recorta', () => {
        const f = fila();
        f.otherDeductions = 500;

        igual(rowAmounts('quincena1', f, sello(120, 120, 0.8), PAGOS).amountUsd, -440, 'el negativo');
    });

    // Sin cargo no hay tarifa de donde sacar nada, y cobrarle un descuento
    // sobre un sueldo que el sistema no sabe calcular seria inventar una deuda.
    await t.test('una fila sin cargo queda toda en cero, y no en NaN', () => {
        const f = fila();
        f.sundays = 3;
        f.otherDeductions = 50;

        for (const kind of CUT_KINDS) {
            const a = rowAmounts(kind, f, null, PAGOS);
            assert.equal(a.amountUsd, 0, `${kind}: no quedó en cero`);
            assert.ok(Number.isFinite(a.amountUsd), `${kind}: salió NaN`);
        }
    });

    // Sin el respaldo, un mes armado a mano dividiria entre undefined y dejaria
    // la fila entera en NaN.
    await t.test('sin los pagos del mes se repone el 2 del tabulador, no un NaN', () => {
        const a = rowAmounts('quincena1', fila(), sello(400, 500, 2.6), undefined);
        igual(a.fromPosition, 200, 'el paquete con el respaldo');
    });
});


// ══════════════════════════════════════════════════════════════════════
// LOS DOS CORTES QUE NO SON QUINCENA
// ══════════════════════════════════════════════════════════════════════

test('margen "0" y bono pagan la cifra del cargo menos el descuento', async (t) => {

    const cargo = sello(400, 500, 2.6, 25);

    await t.test('margen "0" paga la resta del tabulador', () => {
        igual(rowAmounts('margen0', fila(), cargo, PAGOS).amountUsd, 100, 'el margen "0"');
    });

    await t.test('bono paga el bono complementario del cargo', () => {
        igual(rowAmounts('bono', fila(), cargo, PAGOS).amountUsd, 25, 'el bono');
    });

    await t.test('el descuento resta, que es la columna DESCUENTO de la hoja', () => {
        const f = fila();
        f.otherDeductions = 30;

        igual(rowAmounts('margen0', f, cargo, PAGOS).amountUsd, 70, 'margen "0" con descuento');
        igual(rowAmounts('bono', f, cargo, PAGOS).amountUsd, -5, 'un bono que queda en negativo');
    });

    // Si un cliente mal armado colara conteos, ignorarlos aqui es lo correcto:
    // pagarian dias trabajados en un corte que no cubre dias.
    await t.test('los conteos no pagan nada en estos dos cortes', () => {
        const f = fila();
        f.sundays = 10;
        f.additionalDays = 10;
        f.overtimeHours = 10;

        for (const kind of ['margen0', 'bono'] as const) {
            const a = rowAmounts(kind, f, cargo, PAGOS);
            assert.equal(a.sundays, 0, `${kind}: pagó domingos`);
            assert.equal(a.additionalDays, 0, `${kind}: pagó días adicionales`);
            assert.equal(a.overtimeHours, 0, `${kind}: pagó horas extras`);
        }
    });

    // El descuento de la quincena por un margen "0" adelantado NO es este
    // corte: alli se descuenta, aqui se paga. Confundirlos descontaria dos veces.
    await t.test('el descuento del margen "0" de la quincena no toca al corte de margen "0"', () => {
        const f = fila();
        f.zeroMarginDeduction = 40;

        igual(rowAmounts('quincena1', f, cargo, PAGOS).amountUsd, 160, 'la quincena sí lo descuenta');
        igual(rowAmounts('margen0', f, cargo, PAGOS).amountUsd, 100, 'el corte de margen "0" no');
    });
});


// ══════════════════════════════════════════════════════════════════════
// 5, 6 y 7. LEER EL MES: SELLO, TASA Y CIERRE POR CORTE
// ══════════════════════════════════════════════════════════════════════

/** Un mes de dos personas, con los cuatro cortes y una fila por persona. */
const mesDePrueba = (cambios: Record<string, unknown> = {}) => ({
    year: 2025,
    month: 8,
    title: 'Agosto 2025',
    payPeriodsPerMonth: 2,
    people: [
        { user: 'u1', name: 'KERVIS', surName: 'VALLADARES', dni: null, department: 'ADMIN', position: sello(400, 500, 2.6, 25) },
        { user: 'u2', name: 'SIN', surName: 'CARGO', dni: null, department: null, position: null },
    ],
    cuts: CUT_KINDS.map(kind => ({
        kind,
        status: 'abierto',
        closedAt: null,
        closedBy: null,
        rows: [{ ...fila(), user: 'u1' }, { ...fila(), user: 'u2' }],
    })),
    ...cambios,
});


test('leer el mes: los cuatro cortes, la tasa de hoy y lo firmado', async (t) => {

    await t.test('siempre devuelve los cuatro, en su orden, aunque el documento no los traiga', () => {
        const m = withAmounts({ ...mesDePrueba(), cuts: [] }, TASA);

        assert.deepEqual(m.cuts.map(c => c.kind), [...CUT_KINDS]);
        assert.deepEqual(m.cuts.map(c => c.label), CUT_KINDS.map(k => CUT_LABELS[k]));
    });

    await t.test('cada corte trae su tramo, y el último día lo pone el calendario', () => {
        const m = withAmounts(mesDePrueba(), TASA);
        const porTipo = Object.fromEntries(m.cuts.map(c => [c.kind, c]));

        assert.equal(porTipo.quincena1.from, '2025-08-01');
        assert.equal(porTipo.quincena1.to, '2025-08-15');
        assert.equal(porTipo.quincena2.from, '2025-08-16');
        assert.equal(porTipo.quincena2.to, '2025-08-31');
        // Margen "0" y bono no son un tramo trabajado: cubren el mes entero.
        assert.equal(porTipo.margen0.from, '2025-08-01');
        assert.equal(porTipo.margen0.to, '2025-08-31');
    });

    await t.test('el total del mes es la suma de los cuatro cortes', () => {
        const m = withAmounts(mesDePrueba(), TASA);
        const suma = m.cuts.reduce((s, c) => s + c.totals.amountUsd, 0);

        igual(m.totals.amountUsd, suma, 'el total del mes');
        // Una sola persona con cargo, y su total salario es 525.
        igual(m.totals.amountUsd, 525, 'el total contra el tabulador');
        assert.equal(m.totals.people, 2, 'la gente del mes, con cargo o sin él');
    });

    await t.test('la tasa viaja como currentExchangeRate y no revive el campo borrado', () => {
        const m = withAmounts(mesDePrueba(), TASA) as Record<string, unknown>;

        assert.equal(m.currentExchangeRate, TASA);
        assert.equal('exchangeRate' in m, false, 'la respuesta revivió el campo que se borró');
    });

    await t.test('los bolívares salen de la tasa que se le pasa', () => {
        const m = withAmounts(mesDePrueba(), TASA);
        igual(m.totals.amountBs, 525 * TASA, 'el total en bolívares');
    });

    // ── El cierre ────────────────────────────────────────────────────
    // Una fila con `settled` responde con los dolares que se pagaron, aunque
    // hoy la formula diera otra cosa.
    const conFirma = () => {
        const m = mesDePrueba();
        m.cuts[0].status = 'cerrado';
        m.cuts[0].rows[0].settled = {
            fromPosition: 200, sundays: 0, additionalDays: 0, overtimeHours: 0, amountUsd: 999,
        };
        return m;
    };

    await t.test('lo firmado no se recalcula: manda settled y no la fórmula', () => {
        const m = withAmounts(conFirma(), TASA);
        igual(m.cuts[0].rows[0].amounts.amountUsd, 999, 'el dólar firmado');
    });

    // El reverso: el dolar no se mueve, el bolivar si. Es LA prueba de que la
    // tasa dejo de estar congelada.
    await t.test('la misma fila cerrada, con dos tasas: mismos dólares, otros bolívares', () => {
        const ayer = withAmounts(conFirma(), TASA);
        const hoy = withAmounts(conFirma(), TASA_DE_HOY);

        igual(hoy.cuts[0].rows[0].amounts.amountUsd, ayer.cuts[0].rows[0].amounts.amountUsd, 'el dólar se movió');
        igual(ayer.cuts[0].rows[0].amounts.amountBs, 999 * TASA, 'los bolívares de ayer');
        igual(hoy.cuts[0].rows[0].amounts.amountBs, 999 * TASA_DE_HOY, 'los bolívares de hoy');
    });

    await t.test('cerrar un corte no toca a los otros tres', () => {
        const m = withAmounts(conFirma(), TASA);

        assert.equal(m.cuts[0].status, 'cerrado');
        assert.deepEqual(m.cuts.slice(1).map(c => c.status), ['abierto', 'abierto', 'abierto']);
    });

    // El estado del mes se DEDUCE de los cuatro: un campo aparte podria decir
    // que si con un corte abierto.
    await t.test('el mes está cerrado solo cuando lo están los cuatro', () => {
        assert.equal(withAmounts(mesDePrueba(), TASA).status, 'abierto');
        assert.equal(withAmounts(conFirma(), TASA).status, 'abierto', 'un corte cerrado no cierra el mes');

        const todos = mesDePrueba();
        todos.cuts.forEach(c => { c.status = 'cerrado'; });
        assert.equal(withAmounts(todos, TASA).status, 'cerrado');
    });

    await t.test('la persona sin cargo cobra cero en los cuatro cortes', () => {
        const m = withAmounts(mesDePrueba(), TASA);

        for (const corte of m.cuts) {
            const suya = corte.rows.find(r => r.user === 'u2')!;
            assert.equal(suya.amounts.amountUsd, 0, `${corte.kind}: le pagó a alguien sin cargo`);
        }
    });
});


// ══════════════════════════════════════════════════════════════════════
// LAS FECHAS Y EL TITULO SE DERIVAN
// ══════════════════════════════════════════════════════════════════════

test('las fechas y el título salen del año y el mes, no de un campo', async (t) => {

    await t.test('el último día lo pone el calendario, mes por mes', () => {
        assert.equal(datesOfCut(2025, 2, 'quincena2').to, '2025-02-28');
        assert.equal(datesOfCut(2024, 2, 'quincena2').to, '2024-02-29', 'año bisiesto');
        assert.equal(datesOfCut(2025, 4, 'quincena2').to, '2025-04-30');
        assert.equal(datesOfCut(2025, 12, 'quincena2').to, '2025-12-31');
    });

    await t.test('la primera quincena siempre es del 1 al 15', () => {
        assert.deepEqual(datesOfCut(2025, 2, 'quincena1'), { from: '2025-02-01', to: '2025-02-15' });
    });

    await t.test('el título se arma con el nombre del mes', () => {
        assert.equal(titleOf(2025, 8), 'Agosto 2025');
        assert.equal(titleOf(2026, 1), 'Enero 2026');
        assert.equal(titleOf(2026, 12), 'Diciembre 2026');
    });
});


// ══════════════════════════════════════════════════════════════════════
// LA FORMA DEL MODELO
// ══════════════════════════════════════════════════════════════════════

test('el modelo guarda lo que hay que guardar, y nada más', async (t) => {

    const cortes = NominaMonthPath('cuts');
    const personas = NominaMonthPath('people');

    function NominaMonthPath(campo: string) {
        return NominaModel.schema.path(campo) as unknown as {
            schema: { path(c: string): { options: Record<string, unknown> } | undefined; options: Record<string, unknown> };
        };
    }

    await t.test('el sello vive en la persona y no repetido en cada corte', () => {
        assert.ok(personas.schema.path('position'), 'la persona no lleva su sello');
        assert.equal(cortes.schema.path('rows')!.schema.path('position'), undefined,
            'el sello volvió a repetirse en cada fila de cada corte');
    });

    await t.test('la firma del cierre guarda dólares y no bolívares', () => {
        const firma = cortes.schema.path('rows')!.schema.path('settled')!.schema;

        assert.ok(firma.path('amountUsd'), 'sin el dólar el cierre no responde por nada');
        assert.equal(firma.path('amountBs'), undefined, 'se volvió a sellar la conversión');
        assert.ok(firma.path('fromPosition'), 'falta lo que aporta el cargo');
    });

    // La tasa cambia todos los dias: es una variable global del sistema, no un
    // dato del mes. Guardarla aqui la volveria a congelar.
    await t.test('la tasa NO es un campo del mes ni del corte', () => {
        assert.equal(NominaModel.schema.path('exchangeRate'), undefined, 'el mes volvió a congelar la tasa');
        assert.equal(cortes.schema.path('exchangeRate'), undefined, 'el corte congeló la tasa');
    });

    // Las fechas se derivan. Guardarlas seria un segundo sitio donde pueden
    // quedar mal, y un corte que dice ser la primera quincena y guarda del 1 al
    // 20 no tiene arreglo automatico.
    await t.test('las fechas no se guardan: se derivan del año y el mes', () => {
        assert.equal(NominaModel.schema.path('from'), undefined);
        assert.equal(cortes.schema.path('from'), undefined, 'el corte volvió a guardar sus fechas');
    });

    await t.test('un corte nace abierto y solo tiene dos estados', () => {
        assert.equal(cortes.schema.path('status')!.options.default, 'abierto');
        assert.deepEqual(cortes.schema.path('status')!.options.enum, ['abierto', 'cerrado']);
    });

    await t.test('los cuatro tipos son los del enum, sin uno más', () => {
        assert.deepEqual(cortes.schema.path('kind')!.options.enum, [...CUT_KINDS]);
    });

    // El estado del mes se deduce de sus cuatro cortes. Un campo aparte podria
    // decir que si con un corte abierto.
    await t.test('el mes no guarda un estado propio: lo deducen sus cortes', () => {
        assert.equal(NominaModel.schema.path('status'), undefined, 'el mes guardó un estado que puede mentir');
    });

    await t.test('los pagos al mes viven en el mes, sellados, y no bajan de uno', () => {
        assert.equal(NominaModel.schema.path('payPeriodsPerMonth').options.default, 2);
        assert.equal(NominaModel.schema.path('payPeriodsPerMonth').options.min, 1);
    });

    await t.test('ni las personas ni las filas llevan _id propio', () => {
        assert.equal(personas.schema.options._id, false);
        assert.equal(cortes.schema.path('rows')!.schema.options._id, false);
    });

    // Dos personas abriendo agosto a la vez pasan las dos la comprobacion de
    // "no existe" antes de que ninguna escriba. Sin el indice unico quedarian
    // dos agostos y el que se teclee segundo se pierde sin que nadie lo note.
    await t.test('no puede haber dos veces el mismo mes, y lo garantiza la base', () => {
        const unico = NominaModel.schema.indexes()
            .find(([campos]: [Record<string, number>]) => JSON.stringify(campos) === JSON.stringify({ year: 1, month: 1 }));

        assert.ok(unico, 'falta el índice de año y mes');
        assert.equal(unico![1].unique, true, 'el índice de año y mes no es único');
    });
});
