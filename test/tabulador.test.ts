import test from 'node:test';
import assert from 'node:assert/strict';
import tabuladorSchema from '../src/apiServises/tabulador/tabulador.schema.ts';
import TabuladorModel from '../src/apiServises/tabulador/tabulador.model.ts';
import { ratesOf, withRates, DAYS_PER_MONTH, PAY_PERIODS_PER_MONTH, DEFAULT_BASE_SALARY_BS } from '../src/apiServises/tabulador/tabulador.lib.ts';

// ══════════════════════════════════════════════════════════════════════
// EL TABULADOR
// ══════════════════════════════════════════════════════════════════════
// Dos cosas se prueban, y las dos deciden lo que cobra una persona:
//
//   1. Que el esquema RECHACE lo que viene mal, en vez de corregirlo en
//      silencio: un paquete negativo, un texto donde iba un numero, un
//      completo por debajo de la base.
//
//   2. Que las tarifas salgan IGUALES que en la hoja TABULADOR del modelo en
//      Excel, celda por celda, con las filas reales de la hoja como
//      referencia. Si alguien toca una constante, esto es lo que lo delata.
//
//   3. Que el SALARIO BASE siga siendo lo que es: un campo DEL CARGO, el unico
//      en bolivares, del que solo se deriva la quincena. No sale de la hoja
//      —la hoja esta toda en dolares— y por eso se prueba aparte. Hoy vale 130
//      en los 25 cargos, y esa coincidencia es justo la que hace facil volver
//      a convertirlo en una constante global: estas pruebas usan dos cargos
//      con salarios distintos para que eso no pase inadvertido.

const OPC = { abortEarly: false, stripUnknown: true };

/** Un cargo valido minimo: SUB GERENTE, la primera fila de la hoja. */
const SUB_GERENTE = { name: 'SUB GERENTE', monthlyBasePackage: 400, fullPackage: 500, complementaryBonus: 100, overtimeHourRate: 2.6 };

/** Afirma que el esquema rechaza, y devuelve el primer mensaje. */
const rechaza = async (cuerpo: unknown): Promise<string> => {
    try {
        await tabuladorSchema.validate(cuerpo, OPC);
        assert.fail(`debió rechazar: ${JSON.stringify(cuerpo)}`);
    }
    catch (e) {
        const error = e as { errors?: string[] };
        assert.ok(error.errors?.length, 'no parece un error de validación');
        return error.errors![0];
    }
};

/** Dos numeros de la hoja, con la tolerancia de un flotante. */
const igual = (real: number, esperado: number, que: string) =>
    assert.ok(Math.abs(real - esperado) < 1e-9, `${que}: ${real} en vez de ${esperado}`);


test('el esquema rechaza lo que pagaria mal', async (t) => {

    await t.test('sin nombre', async () => {
        await rechaza({ monthlyBasePackage: 400, fullPackage: 500, overtimeHourRate: 2.6 });
    });

    await t.test('nombre en blanco', async () => {
        await rechaza({ ...SUB_GERENTE, name: '   ' });
    });

    await t.test('paquete base negativo', async () => {
        await rechaza({ ...SUB_GERENTE, monthlyBasePackage: -1 });
    });

    await t.test('paquete completo no numerico', async () => {
        await rechaza({ ...SUB_GERENTE, fullPackage: 'quinientos' });
    });

    await t.test('hora extra ausente — no se deriva, hay que darla', async () => {
        const { overtimeHourRate: _fuera, ...sinHora } = SUB_GERENTE;
        await rechaza(sinHora);
    });

    await t.test('paquete completo por debajo de la base — el margen "0" saldria negativo', async () => {
        const mensaje = await rechaza({ ...SUB_GERENTE, monthlyBasePackage: 500, fullPackage: 400 });
        assert.match(mensaje, /completo no puede ser menor/);
    });

    await t.test('margen manual negativo', async () => {
        await rechaza({ ...SUB_GERENTE, zeroMarginOverride: -10 });
    });

    await t.test('salario base negativo — es el unico numero en bolivares, pero tampoco se paga en negativo', async () => {
        const mensaje = await rechaza({ ...SUB_GERENTE, baseSalaryBs: -1 });
        assert.match(mensaje, /salario base/i);
    });

    await t.test('orden decimal', async () => {
        await rechaza({ ...SUB_GERENTE, order: 1.5 });
    });
});


test('el esquema acepta y normaliza', async (t) => {

    await t.test('aplica los valores por defecto', async () => {
        const v = await tabuladorSchema.validate(SUB_GERENTE, OPC);
        assert.equal(v.order, 100);
        assert.equal(v.zeroMarginOverride, null);
        assert.equal(v.active, true);
    });

    await t.test('bono complementario ausente = 0', async () => {
        const { complementaryBonus: _fuera, ...sinBono } = SUB_GERENTE;
        const v = await tabuladorSchema.validate(sinBono, OPC);
        assert.equal(v.complementaryBonus, 0);
    });

    await t.test('salario base ausente = 130 — un cuerpo de los de antes, sin el campo, no puede romperse', async () => {
        const v = await tabuladorSchema.validate(SUB_GERENTE, OPC);
        assert.equal(v.baseSalaryBs, 130);
    });

    await t.test('el salario base es del cargo: si viene otro, se guarda ese y no el minimo', async () => {
        const v = await tabuladorSchema.validate({ ...SUB_GERENTE, baseSalaryBs: 260 }, OPC);
        assert.equal(v.baseSalaryBs, 260);
    });

    await t.test('el nombre sale en mayusculas y sin espacios sobrantes — la hoja trae cuatro asi', async () => {
        const v = await tabuladorSchema.validate({ ...SUB_GERENTE, name: '  operador senior diurno ' }, OPC);
        assert.equal(v.name, 'OPERADOR SENIOR DIURNO');
    });

    await t.test('completo igual a la base es valido: margen "0" en cero (AUDITOR, MARKETING…)', async () => {
        const v = await tabuladorSchema.validate({ ...SUB_GERENTE, monthlyBasePackage: 200, fullPackage: 200 }, OPC);
        assert.equal(v.fullPackage, 200);
    });

    await t.test('acepta el margen manual de RRHH', async () => {
        const v = await tabuladorSchema.validate({ ...SUB_GERENTE, zeroMarginOverride: 130 }, OPC);
        assert.equal(v.zeroMarginOverride, 130);
    });

    await t.test('descarta lo que el cliente no puede escribir', async () => {
        const v = await tabuladorSchema.validate(
            { ...SUB_GERENTE, _id: 'x', createdBy: 'y', createdAt: 'z', totalSalary: 999 },
            OPC,
        ) as Record<string, unknown>;
        for (const clave of ['_id', 'createdBy', 'createdAt', 'totalSalary']) {
            assert.equal(clave in v, false, `${clave} debió quedar afuera`);
        }
    });
});


test('las tarifas son las de la hoja, celda por celda', async (t) => {

    await t.test('SUB GERENTE — la primera fila', () => {
        const r = ratesOf({ monthlyBasePackage: 400, fullPackage: 500, complementaryBonus: 100, zeroMarginOverride: null });
        igual(r.fullDayRate, 500 / 30, 'DIA LABORADO PAQUETE COMPLETO');
        igual(r.baseDayRate, 400 / 30, 'DIA LABORADO PAQUETE BASE');
        igual(r.holidayRate, 500 / 30 / 2, 'FERIADO DOMINGO');
        igual(r.extraDayRate, 25, 'DIA EXTRA');
        igual(r.hourRate, 500 / 30 / 8, 'HORA');
        igual(r.weekdayPunctuality, 5, 'PUNTUALIDAD LUNES A VIERNES');
        igual(r.weekendPunctuality, 7.5, 'PUNTUALIDAD FIN DE SEMANA');
        igual(r.zeroMargin, 100, 'MARGEN "0"');
        igual(r.totalSalary, 600, 'TOTAL SALARIO');
    });

    await t.test('OPERADOR DE MONITOREO DIURNO — sin margen', () => {
        const r = ratesOf({ monthlyBasePackage: 120, fullPackage: 120, complementaryBonus: 40 });
        igual(r.fullDayRate, 4, 'dia completo');
        igual(r.holidayRate, 2, 'feriado');
        igual(r.extraDayRate, 6, 'dia extra');
        igual(r.hourRate, 0.5, 'hora');
        igual(r.weekdayPunctuality, 1.2, 'puntualidad L-V');
        igual(r.weekendPunctuality, 1.8, 'puntualidad finde');
        igual(r.zeroMargin, 0, 'margen');
        igual(r.totalSalary, 160, 'total');
    });

    await t.test('RRHH — el unico margen tecleado a mano de la hoja', () => {
        const conFormula = ratesOf({ monthlyBasePackage: 200, fullPackage: 300, complementaryBonus: 50, zeroMarginOverride: null });
        const conManual = ratesOf({ monthlyBasePackage: 200, fullPackage: 300, complementaryBonus: 50, zeroMarginOverride: 130 });
        igual(conFormula.zeroMargin, 100, 'margen por formula');
        igual(conFormula.totalSalary, 350, 'total por formula');
        igual(conManual.zeroMargin, 130, 'margen manual');
        igual(conManual.totalSalary, 380, 'total con margen manual — el O4 de la hoja');
    });

    await t.test('el bono complementario suma al total pero no toca ninguna tarifa diaria', () => {
        const sin = ratesOf({ monthlyBasePackage: 200, fullPackage: 300, complementaryBonus: 0 });
        const con = ratesOf({ monthlyBasePackage: 200, fullPackage: 300, complementaryBonus: 70 });
        igual(con.totalSalary - sin.totalSalary, 70, 'diferencia del total');
        igual(con.fullDayRate, sin.fullDayRate, 'dia completo');
        igual(con.hourRate, sin.hourRate, 'hora');
    });

    // Las dos que siguen son la unica cifra derivada que no sale de la hoja: la
    // quincena del salario base, en bolivares. Se prueba con DOS cargos de
    // salario distinto a proposito. Con uno solo, una constante global de 65
    // pasaria las pruebas igual de bien, y eso es exactamente lo que no puede
    // volver a ser.
    await t.test('la quincena es la mitad del salario base del cargo: 130 da 65 y 260 da 130', () => {
        const cifras = { monthlyBasePackage: 400, fullPackage: 500, complementaryBonus: 100 };
        igual(ratesOf({ ...cifras, baseSalaryBs: 130 }).halfMonthBaseSalaryBs, 65, 'quincena del minimo vigente');
        igual(ratesOf({ ...cifras, baseSalaryBs: 260 }).halfMonthBaseSalaryBs, 130, 'quincena de un cargo con otro salario base');
    });

    await t.test('un cargo sin salario base cae en los 130 por defecto — los 25 que ya estan en Mongo no traen el campo y darian NaN', () => {
        const r = ratesOf({ monthlyBasePackage: 400, fullPackage: 500, complementaryBonus: 100 });
        assert.ok(Number.isFinite(r.halfMonthBaseSalaryBs), `la quincena salio ${r.halfMonthBaseSalaryBs}`);
        igual(r.halfMonthBaseSalaryBs, 65, 'quincena por defecto');
    });

    await t.test('withRates conserva el cargo y le pega las diez tarifas', () => {
        const cargo = { _id: 'abc', name: 'AUDITOR', monthlyBasePackage: 200, fullPackage: 200, complementaryBonus: 20, overtimeHourRate: 1.3, zeroMarginOverride: null, active: true };
        const r = withRates(cargo);
        assert.equal(r._id, 'abc');
        assert.equal(r.overtimeHourRate, 1.3);
        igual(r.totalSalary, 220, 'total de AUDITOR');
        igual(r.halfMonthBaseSalaryBs, 65, 'quincena de AUDITOR — el cargo no trae el campo, va por defecto');
        assert.equal(Object.keys(r).length, Object.keys(cargo).length + 10);
    });

    await t.test('el mes de tarifa es de 30 dias, como en la hoja', () => {
        assert.equal(DAYS_PER_MONTH, 30);
    });

    await t.test('el salario base son 130 Bs y el mes se paga en dos veces', () => {
        assert.equal(DEFAULT_BASE_SALARY_BS, 130);
        assert.equal(PAY_PERIODS_PER_MONTH, 2);
    });
});


// ══════════════════════════════════════════════════════════════════════
// EL 130 ESTA ESCRITO EN TRES SITIOS
// ══════════════════════════════════════════════════════════════════════
// La constante de la lib, el `default` del esquema de mongoose y el `.default`
// de yup. No se importan entre si a proposito: el modelo y el esquema se
// cargan tambien desde estas pruebas, que leen las fuentes .ts, y ahi un
// import con extension .js no resuelve.
//
// Asi que la coherencia la sostiene esta prueba. Si alguien sube el salario
// minimo en un sitio y se olvida de los otros, un cargo nuevo se guardaria con
// un salario y se validaria contra otro, y la diferencia se paga.

test('el salario base por defecto es el mismo numero en los tres sitios', async (t) => {

    await t.test('la constante de la lib y el default del modelo', () => {
        const enElModelo = TabuladorModel.schema.path('baseSalaryBs').options.default;
        assert.equal(enElModelo, DEFAULT_BASE_SALARY_BS, 'el modelo guarda otro minimo que la lib');
    });

    await t.test('la constante de la lib y el default de yup', async () => {
        const { overtimeHourRate, ...resto } = SUB_GERENTE;
        const v = await tabuladorSchema.validate({ ...resto, overtimeHourRate }, OPC);
        assert.equal(v.baseSalaryBs, DEFAULT_BASE_SALARY_BS, 'yup acepta otro minimo que la lib');
    });

    await t.test('el modelo no lo deja negativo', () => {
        assert.equal(TabuladorModel.schema.path('baseSalaryBs').options.min, 0);
    });
});
