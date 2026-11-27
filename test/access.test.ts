import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_MODES, canSeeLocal, grantOf, insightsScope, localFilterOf, normalizeAccess, withItem, withoutItem } from '../src/apiServises/access/access.lib.js';
import UserModel from '../src/apiServises/user/user.model.js';

// ══════════════════════════════════════════════════════════════════════
// QUÉ LOCALES VE CADA USUARIO (user.access): las reglas, sin Mongo
// ══════════════════════════════════════════════════════════════════════

const FRANCISCA = '64a000000000000000000001';
const BOCAS = '64a000000000000000000002';
const DORAL = '637a7ae31a8ed7ed7d7e71e0';
const MIAMI = '637a7b961a8ed7ed7d7e71eb';
const DAVIE = '637a7cec1a8ed7ed7d7e71f5';
const BOCAS_DORAL = '64b000000000000000000009';

const local = (id: string, franchise: string | null, poblada = false) => ({
    _id: id,
    franchiseReference: { name_franchise: 'x', franchise: franchise && poblada ? { _id: franchise, name: 'x' } : franchise },
});


test('sin nada asignado, o con un campo raro, se ve todo: el equipo de Jarvis365 no pierde nada', () => {
    assert.deepEqual(ACCESS_MODES, ['all', 'only']);
    for (const raro of [undefined, null, {}, { mode: 'all' }, { mode: 'todo' }, { mode: 'ALL', locals: [DORAL] }]) {
        assert.deepEqual(normalizeAccess(raro), { mode: 'all', franchises: [], locals: [] }, JSON.stringify(raro));
        assert.equal(localFilterOf(raro), null);
        assert.equal(canSeeLocal(raro, local(DORAL, FRANCISCA)), true);
    }
});

test('toda una franquicia: ve todos sus locales, también los que se abran después', () => {
    const access = { mode: 'only', franchises: [FRANCISCA], locals: [] };
    assert.equal(canSeeLocal(access, local(DORAL, FRANCISCA)), true);
    assert.equal(canSeeLocal(access, local(DAVIE, FRANCISCA, true)), true, 'con la franquicia poblada también');
    assert.equal(canSeeLocal(access, local(BOCAS_DORAL, BOCAS)), false);
    assert.equal(canSeeLocal(access, local(MIAMI, null)), false, 'un local sin franquicia no entra por franquicia');
    assert.deepEqual(localFilterOf(access), { $or: [{ _id: { $in: [] } }, { 'franchiseReference.franchise': { $in: [FRANCISCA] } }] });
});

test('solo dos locales de una franquicia: ve esos dos y ninguno más', () => {
    const access = { mode: 'only', franchises: [], locals: [DORAL, MIAMI] };
    assert.equal(canSeeLocal(access, local(DORAL, FRANCISCA)), true);
    assert.equal(canSeeLocal(access, local(MIAMI, FRANCISCA)), true);
    assert.equal(canSeeLocal(access, local(DAVIE, FRANCISCA)), false);
    assert.equal(canSeeLocal(access, null), false);
});

test('con «only» y nada asignado no ve ningún local', () => {
    const access = { mode: 'only', franchises: [], locals: [] };
    assert.equal(canSeeLocal(access, local(DORAL, FRANCISCA)), false);
    assert.deepEqual(localFilterOf(access), { $or: [{ _id: { $in: [] } }, { 'franchiseReference.franchise': { $in: [] } }] });
});

test('grantOf dice cómo ve un local: suelto, por su franquicia, o no lo ve', () => {
    const access = { mode: 'only', franchises: [FRANCISCA], locals: [BOCAS_DORAL] };
    assert.equal(grantOf(access, local(BOCAS_DORAL, BOCAS)), 'local');
    assert.equal(grantOf(access, local(DORAL, FRANCISCA)), 'franchise');
    assert.equal(grantOf({ ...access, locals: [DORAL] }, local(DORAL, FRANCISCA)), 'local', 'suelto manda sobre la franquicia');
    assert.equal(grantOf(access, local('64b000000000000000000010', BOCAS)), null);
    assert.equal(grantOf({ mode: 'all' }, local(DORAL, FRANCISCA)), null, 'quien ve todo no tiene asignación');
});

test('dar un local a quien veía todo lo pasa a ver solo lo asignado; repetirlo no duplica', () => {
    const una = withItem(undefined, 'local', DORAL);
    assert.deepEqual(una, { mode: 'only', franchises: [], locals: [DORAL] });
    assert.deepEqual(withItem(una, 'local', DORAL), una);
    assert.deepEqual(withItem(una, 'franchise', FRANCISCA), { mode: 'only', franchises: [FRANCISCA], locals: [DORAL] });
});

test('quitar lo último no le devuelve todos los locales: queda en «only» sin nada', () => {
    const una = { mode: 'only', franchises: [FRANCISCA], locals: [DORAL] };
    const sinLocal = withoutItem(una, 'local', DORAL);
    assert.deepEqual(sinLocal, { mode: 'only', franchises: [FRANCISCA], locals: [] });
    assert.deepEqual(withoutItem(sinLocal, 'franchise', FRANCISCA), { mode: 'only', franchises: [], locals: [] });
    assert.deepEqual(withoutItem({ mode: 'all' }, 'local', DORAL), { mode: 'all', franchises: [], locals: [] }, 'a quien ve todo no se le quita nada');
});

test('el modelo: access nace en «all», con listas vacías, y solo acepta «all» u «only»', async () => {
    const nuevo = new UserModel({ dni: '1', user: 'u1', password: 'x', email: 'a@b.c', name: 'A', surName: 'B', phone: '1' });
    assert.equal(nuevo.access.mode, 'all');
    assert.deepEqual([...nuevo.access.franchises], []);
    assert.deepEqual([...nuevo.access.locals], []);
    assert.equal(UserModel.schema.path('access.franchises').caster.options.ref, 'Franchise');
    assert.equal(UserModel.schema.path('access.locals').caster.options.ref, 'Local');

    const raro = new UserModel({ dni: '2', user: 'u2', password: 'x', email: 'b@b.c', name: 'A', surName: 'B', phone: '2', access: { mode: 'todo' } });
    const error = raro.validateSync();
    assert.ok(error?.errors['access.mode'], 'un modo que no existe no pasa');
});

test('insights365: sin nada asignado no ve nada, salvo el equipo (admin o super); con accesos, solo lo suyo', () => {
    const cliente = { admin: false, super: false };
    assert.equal(insightsScope(undefined, cliente), 'none', 'un cliente sin asignar no ve ningún local');
    assert.equal(insightsScope({ mode: 'all' }, { admin: false }), 'none');
    assert.equal(insightsScope({ mode: 'all' }, { admin: true }), 'staff', 'un administrador sin restricción ve todos');
    assert.equal(insightsScope(undefined, { super: true }), 'staff');
    assert.equal(insightsScope({ mode: 'all' }, null), 'staff', 'sin usuario (el propio servidor) ve todos, como en el resto de la API');
    assert.equal(insightsScope({ mode: 'only', franchises: [FRANCISCA], locals: [] }, cliente), 'assigned');
    assert.equal(insightsScope({ mode: 'only', franchises: [], locals: [DORAL] }, { admin: true }), 'assigned', 'un administrador restringido ve solo lo suyo');
    assert.equal(insightsScope({ mode: 'only', franchises: [], locals: [] }, { admin: true }), 'assigned', 'quitarle todo no le devuelve todos');
});
