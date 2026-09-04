import test from 'node:test';
import assert from 'node:assert/strict';
import tabuladorSchema from '../src/apiServises/tabulador/tabulador.schema.ts';
import { ratesOf, withRates, DAYS_PER_MONTH } from '../src/apiServises/tabulador/tabulador.lib.ts';

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

    await t.test('withRates conserva el cargo y le pega las nueve tarifas', () => {
        const cargo = { _id: 'abc', name: 'AUDITOR', monthlyBasePackage: 200, fullPackage: 200, complementaryBonus: 20, overtimeHourRate: 1.3, zeroMarginOverride: null, active: true };
        const r = withRates(cargo);
        assert.equal(r._id, 'abc');
        assert.equal(r.overtimeHourRate, 1.3);
        igual(r.totalSalary, 220, 'total de AUDITOR');
        assert.equal(Object.keys(r).length, Object.keys(cargo).length + 9);
    });

    await t.test('el mes de tarifa es de 30 dias, como en la hoja', () => {
        assert.equal(DAYS_PER_MONTH, 30);
    });
});
