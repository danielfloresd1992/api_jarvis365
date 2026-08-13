import mongoose from 'mongoose';
import { config } from 'dotenv';
import colors from 'colors';

import MenuCategoryModel from '../apiServises/menu/menuCategory.model.js';
import MenuModel from '../apiServises/menu/menu.model.js';

config();

// ══════════════════════════════════════════════════════════════════════
// SEMBRAR EL CATÁLOGO DE CATEGORÍAS DE ALERTA
// ══════════════════════════════════════════════════════════════════════
// Se ejecuta UNA vez, a mano, en el servidor donde vive la API:
//
//     node dist/scripts/sembrar-categorias.js
//
// Hasta ahora las categorías estaban escritas dentro del cliente. Este script
// las pasa a la base para que se puedan crear, editar y desactivar desde
// /alertmanasgement sin volver a publicar el front.
//
// ES SEGURO CORRERLO DE NUEVO
//
// No pisa nada: si una categoría ya está, la deja como esté. Alguien pudo
// haberle cambiado la etiqueta o el color después de la primera siembra, y
// volver a correr esto no debe deshacer ese trabajo.
//
// ADEMÁS RESCATA LAS CATEGORÍAS FANTASMA
//
// `Menu.category` es texto libre, así que en la base puede haber alertas con
// categorías que nunca estuvieron en la lista del cliente: un valor viejo, uno
// escrito a mano, uno con un error de tipeo. Esas alertas hoy se ven sin
// etiqueta y sin ícono.
//
// El script las busca y crea su categoría DESACTIVADA: las alertas recuperan su
// nombre, pero la categoría no se ofrece al crear alertas nuevas. Queda a la
// vista en la pantalla de gestión para decidir si se activa o se descarta.

/**
 * Las 12 categorías que vivían en el cliente, con su apariencia.
 *
 * El `value` va tal cual está escrito allá —camelCase incluido— porque es lo
 * que tienen guardado las alertas. Cambiarle una sola letra a 'localIncident'
 * dejaría a esas alertas sin categoría.
 *
 * El ícono viaja como nombre corto y el cliente lo traduce al suyo; guardar
 * 'FaBuilding' ataría la base a la librería de íconos que use el front hoy.
 */
const CATEGORIAS = [
    { value: 'client',        es: 'Cliente',                 en: 'Customer',        icon: 'users',     bg: '#dbeafe', color: '#1d4ed8', order: 10 },
    { value: 'delay',         es: 'Demoras',                 en: 'Delays',          icon: 'clock',     bg: '#fef9c3', color: '#854d0e', order: 20 },
    { value: 'door',          es: 'Puerta',                  en: 'Door',            icon: 'door',      bg: '#f3e8ff', color: '#7e22ce', order: 30 },
    { value: 'employee',      es: 'Empleados',               en: 'Employees',       icon: 'user-tie',  bg: '#d1fae5', color: '#065f46', order: 40 },
    { value: 'failed',        es: 'Fallas',                  en: 'Failures',        icon: 'tools',     bg: '#fee2e2', color: '#991b1b', order: 50 },
    { value: 'food',          es: 'Comidas',                 en: 'Food',            icon: 'utensils',  bg: '#fff7ed', color: '#9a3412', order: 60 },
    { value: 'incident',      es: 'Incidencias',             en: 'Incidents',       icon: 'warning',   bg: '#ffedd5', color: '#c2410c', order: 70 },
    { value: 'localIncident', es: 'Incidencias en el local', en: 'Local incidents', icon: 'building',  bg: '#e0f2fe', color: '#0369a1', order: 80 },
    { value: 'merchandise',   es: 'Mercancía',               en: 'Merchandise',     icon: 'box',       bg: '#fdf4ff', color: '#7c3aed', order: 90 },
    { value: 'protocol',      es: 'Protocolos',              en: 'Protocols',       icon: 'clipboard', bg: '#ecfdf5', color: '#047857', order: 100 },
    { value: 'trash',         es: 'Basura',                  en: 'Trash',           icon: 'trash',     bg: '#f1f5f9', color: '#475569', order: 110 },
    { value: 'perimeter',     es: 'Perimetral',              en: 'Perimeter',       icon: 'shield',    bg: '#fef2f2', color: '#b91c1c', order: 120 },
];

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Cortes365';


async function main() {
    console.log(colors.cyan(`Conectando a ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}`));
    await mongoose.connect(MONGO_URI);

    const existentes = await MenuCategoryModel.find({}).select('value').lean();
    const yaEstan = new Set(existentes.map(c => c.value));

    // ── 1. Las 12 conocidas ───────────────────────────────────────────
    const nuevas = CATEGORIAS.filter(c => !yaEstan.has(c.value));

    if (nuevas.length) {
        await MenuCategoryModel.insertMany(nuevas);
        nuevas.forEach(c => console.log(colors.green(`  + ${c.es}  (${c.value})`)));
    }
    console.log(nuevas.length
        ? colors.green(`\n${nuevas.length} categoría(s) creadas.`)
        : colors.yellow('\nLas 12 categorías conocidas ya estaban. No se toca ninguna.'));

    // ── 2. Las fantasma ───────────────────────────────────────────────
    // Se pregunta por las categorías que las alertas usan de verdad y se
    // compara con el catálogo. Lo que sobra es lo que nadie declaró nunca.
    const enUso = await MenuModel.distinct('category');
    const conocidas = new Set([...yaEstan, ...CATEGORIAS.map(c => c.value)]);

    const fantasma = enUso.filter(v => typeof v === 'string' && v.trim() && !conocidas.has(v));

    if (fantasma.length) {
        console.log(colors.yellow(`\n${fantasma.length} categoría(s) en uso que no estaban declaradas:`));

        for (const value of fantasma) {
            const cuantas = await MenuModel.countDocuments({ category: value });

            await MenuCategoryModel.create({
                value,
                es: value,   // sin etiqueta real; se corrige desde la pantalla
                en: value,
                active: false,
                order: 900,
            });

            console.log(colors.yellow(
                `  ! ${value}  — ${cuantas} alerta(s). Creada DESACTIVADA; ponele nombre desde /alertmanasgement.`,
            ));
        }
    }
    else {
        console.log(colors.green('\nNinguna alerta usa una categoría sin declarar.'));
    }

    const total = await MenuCategoryModel.countDocuments();
    console.log(colors.cyan(`\nCatálogo: ${total} categoría(s).`));

    await mongoose.disconnect();
}


main().catch(async (error) => {
    console.error(colors.red('Falló la siembra:'), error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
