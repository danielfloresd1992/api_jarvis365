import PDFDocument from 'pdfkit';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { STRATEGIES } from '../apiServises/notification/strategies/index.js';

// ══════════════════════════════════════════════════════════════════════
// GENERADOR DE LA GUÍA TÉCNICA DEL SISTEMA DE NOTIFICACIONES
// ══════════════════════════════════════════════════════════════════════
// Produce docs/guia-sistema-notificaciones.pdf.
//
//     npm run build && node dist/scripts/generar-guia-notificaciones.js
//
// LA TABLA DE TIPOS SALE DEL CÓDIGO, NO DE UNA LISTA A MANO
//
// El documento lee el registro real de estrategias. Un tipo nuevo aparece solo
// en la guía la próxima vez que se genere, y ninguno puede quedar descrito de
// una forma en el papel y de otra en el sistema. Es la única manera de que una
// documentación así no envejezca mal.
//
// No toca la base de datos: las estrategias son objetos puros.

const COLORS = {
    band: '#1f9a08',       // verde de marca, oscuro (bandas)
    accent: '#29c50c',     // verde de marca (acentos)
    text: '#1a1a1a',
    muted: '#6b7280',
    cream: '#f4f7f0',      // fondo de tarjetas y cajas
    line: '#dfe5da',
    code: '#eef2ec',
    white: '#ffffff',
    warn: '#b45309',
};

const PAGE = { width: 595.28, height: 841.89, margin: 44 };
const W = PAGE.width - PAGE.margin * 2;

/** Alto disponible antes del pie. */
const bottom = () => PAGE.height - PAGE.margin - 26;


// ── Piezas de dibujo ──────────────────────────────────────────────────

const nuevaPagina = (doc) => {
    doc.addPage();
    doc.y = PAGE.margin + 8;
};

/** Salta de página si no caben `alto` puntos. */
const ensure = (doc, alto) => {
    if (doc.y + alto > bottom()) nuevaPagina(doc);
};

const titulo = (doc, texto, numero) => {
    ensure(doc, 54);
    const y = doc.y + 8;
    doc.rect(PAGE.margin, y, 4, 20).fill(COLORS.accent);
    doc.fill(COLORS.text).font('Helvetica-Bold').fontSize(14.5)
        .text(`${numero}. ${texto}`, PAGE.margin + 13, y + 3, { width: W - 13 });
    doc.y = y + 30;
};

const subtitulo = (doc, texto) => {
    ensure(doc, 34);
    doc.fill(COLORS.band).font('Helvetica-Bold').fontSize(10.5)
        .text(texto, PAGE.margin, doc.y + 6, { width: W });
    doc.y += 4;
};

const parrafo = (doc, texto, opts = {}) => {
    const size = opts.size || 9.7;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
        .fill(opts.color || COLORS.text);
    const alto = doc.heightOfString(texto, { width: W, lineGap: 2.2 });
    ensure(doc, alto + 10);
    doc.text(texto, PAGE.margin, doc.y + 4, { width: W, lineGap: 2.2 });
    doc.y += 4;
};

/** Bloque destacado sobre fondo crema, para reglas que no se deben olvidar. */
const nota = (doc, texto, color = COLORS.accent) => {
    doc.font('Helvetica').fontSize(9.3);
    const alto = doc.heightOfString(texto, { width: W - 30, lineGap: 2.2 }) + 18;
    ensure(doc, alto + 12);
    const y = doc.y + 6;
    doc.rect(PAGE.margin, y, W, alto).fill(COLORS.cream);
    doc.rect(PAGE.margin, y, 3.5, alto).fill(color);
    doc.fill(COLORS.text).font('Helvetica').fontSize(9.3)
        .text(texto, PAGE.margin + 16, y + 9, { width: W - 30, lineGap: 2.2 });
    doc.y = y + alto + 8;
};

/** Línea de código o ruta de archivo. */
const codigo = (doc, texto) => {
    doc.font('Courier').fontSize(8.8);
    const alto = doc.heightOfString(texto, { width: W - 20, lineGap: 1.8 }) + 14;
    ensure(doc, alto + 8);
    const y = doc.y + 4;
    doc.rect(PAGE.margin, y, W, alto).fill(COLORS.code);
    doc.fill(COLORS.text).font('Courier').fontSize(8.8)
        .text(texto, PAGE.margin + 10, y + 7, { width: W - 20, lineGap: 1.8 });
    doc.y = y + alto + 6;
};

const vinetas = (doc, items) => {
    items.forEach(it => {
        doc.font('Helvetica').fontSize(9.7);
        const alto = doc.heightOfString(it, { width: W - 16, lineGap: 2 });
        ensure(doc, alto + 8);
        const y = doc.y + 4;
        doc.circle(PAGE.margin + 3.5, y + 5, 1.9).fill(COLORS.accent);
        doc.fill(COLORS.text).font('Helvetica').fontSize(9.7)
            .text(it, PAGE.margin + 14, y, { width: W - 16, lineGap: 2 });
        doc.y += 3;
    });
    doc.y += 4;
};

/**
 * Tabla con encabezado de color y filas alternas.
 * @param {Array<{label:string,width:number}>} cols  anchos en proporción
 */
const tabla = (doc, cols, filas) => {
    const total = cols.reduce((a, c) => a + c.width, 0);
    const anchos = cols.map(c => (c.width / total) * W);
    const headH = 19;

    const pintarCabecera = () => {
        const y = doc.y;
        doc.rect(PAGE.margin, y, W, headH).fill(COLORS.band);
        let x = PAGE.margin;
        cols.forEach((c, i) => {
            doc.fill(COLORS.white).font('Helvetica-Bold').fontSize(8.4)
                .text(c.label.toUpperCase(), x + 6, y + 6, { width: anchos[i] - 10 });
            x += anchos[i];
        });
        doc.y = y + headH;
    };

    ensure(doc, headH + 40);
    doc.y += 6;
    pintarCabecera();

    filas.forEach((fila, idx) => {
        doc.font('Helvetica').fontSize(8.4);
        const alturas = fila.map((celda, i) =>
            doc.heightOfString(String(celda), { width: anchos[i] - 12, lineGap: 1.4 }));
        const filaH = Math.max(...alturas) + 11;

        if (doc.y + filaH > bottom()) {
            nuevaPagina(doc);
            pintarCabecera();
        }

        const y = doc.y;
        if (idx % 2 === 1) doc.rect(PAGE.margin, y, W, filaH).fill(COLORS.cream);

        let x = PAGE.margin;
        fila.forEach((celda, i) => {
            const esPrimera = i === 0;
            doc.fill(esPrimera ? COLORS.text : COLORS.muted)
                .font(esPrimera ? 'Courier-Bold' : 'Helvetica').fontSize(8.4)
                .text(String(celda), x + 6, y + 5.5, { width: anchos[i] - 12, lineGap: 1.4 });
            x += anchos[i];
        });

        doc.moveTo(PAGE.margin, y + filaH).lineTo(PAGE.margin + W, y + filaH)
            .lineWidth(0.4).stroke(COLORS.line);
        doc.y = y + filaH;
    });

    doc.y += 10;
};


/** Diagrama del recorrido: cinco cajas encadenadas en vertical. */
const diagramaFlujo = (doc, pasos) => {
    const cajaH = 46;
    const flechaH = 15;
    ensure(doc, (cajaH + flechaH) * pasos.length + 10);
    doc.y += 6;

    pasos.forEach((paso, i) => {
        if (doc.y + cajaH + flechaH > bottom()) nuevaPagina(doc);
        const y = doc.y;

        doc.rect(PAGE.margin, y, W, cajaH).fill(COLORS.cream);
        doc.rect(PAGE.margin, y, 3.5, cajaH).fill(COLORS.accent);

        // Número del paso, en círculo
        doc.circle(PAGE.margin + 24, y + cajaH / 2, 11).fill(COLORS.band);
        doc.fill(COLORS.white).font('Helvetica-Bold').fontSize(10.5)
            .text(String(i + 1), PAGE.margin + 19, y + cajaH / 2 - 5.5, { width: 12, align: 'center' });

        doc.fill(COLORS.text).font('Helvetica-Bold').fontSize(10)
            .text(paso.titulo, PAGE.margin + 44, y + 9, { width: W - 190 });
        doc.fill(COLORS.muted).font('Helvetica').fontSize(8.5)
            .text(paso.detalle, PAGE.margin + 44, y + 24, { width: W - 190 });

        doc.fill(COLORS.band).font('Courier-Bold').fontSize(8)
            .text(paso.archivo, PAGE.margin + W - 142, y + cajaH / 2 - 5, { width: 136, align: 'right' });

        doc.y = y + cajaH;

        if (i < pasos.length - 1) {
            const cx = PAGE.margin + 24;
            doc.moveTo(cx, doc.y + 2).lineTo(cx, doc.y + flechaH - 5)
                .lineWidth(1.6).stroke(COLORS.accent);
            doc.moveTo(cx - 3.5, doc.y + flechaH - 8).lineTo(cx, doc.y + flechaH - 3)
                .lineTo(cx + 3.5, doc.y + flechaH - 8).lineWidth(1.6).stroke(COLORS.accent);
            doc.y += flechaH;
        }
    });

    doc.y += 10;
};


// ── El documento ──────────────────────────────────────────────────────

const ALCANCES = {
    global: 'Todos los usuarios',
    personal: 'Solo los destinatarios',
    admin: 'Solo administradores',
};

/** Filas de la tabla de tipos, leídas del registro real. */
const filasDeTipos = () => [...STRATEGIES.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tipo, s]) => [
        tipo,
        s.family || 'general',
        ALCANCES[s.scope || 'global'] || s.scope,
        s.audience ? 'Sí' : '—',
        s.level || 'info',
    ]);


const construir = () => new Promise((resolveDoc, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
    const trozos = [];
    doc.on('data', t => trozos.push(t));
    doc.on('end', () => resolveDoc(Buffer.concat(trozos)));
    doc.on('error', reject);

    const generado = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });

    // ── Portada ──
    doc.rect(0, 0, PAGE.width, 168).fill(COLORS.band);
    doc.rect(0, 168, PAGE.width, 5).fill(COLORS.accent);

    doc.fill(COLORS.white).font('Helvetica-Bold').fontSize(27)
        .text('Sistema de notificaciones', PAGE.margin, 46, { width: W });
    doc.font('Helvetica').fontSize(13.5)
        .text('Guía técnica: cómo funciona, de principio a fin', PAGE.margin, 82, { width: W });
    doc.fontSize(9.5).fillOpacity(0.85)
        .text(`jarvis_api  ·  Amazonas365  ·  Generado: ${generado}`, PAGE.margin, 122, { width: W });
    doc.fillOpacity(1);
    doc.y = 196;

    parrafo(doc,
        'Este documento explica el sistema de notificaciones de Jarvis365: dónde nace un aviso, '
        + 'cómo se decide qué dice y quién puede verlo, cómo viaja en tiempo real y cómo se consulta '
        + 'después. Está escrito para poder abrir el código y saber a qué archivo ir.');

    nota(doc,
        'La tabla de tipos de la sección 5 no está escrita a mano: se genera leyendo el registro real '
        + 'de estrategias del código. Si aparece un tipo nuevo, sale en esta guía la próxima vez que se '
        + 'genere. Ningún aviso puede estar descrito de una forma en el papel y de otra en el sistema.');

    // ── 1 ──
    titulo(doc, 'Qué es una notificación', 1);
    parrafo(doc,
        'Un HECHO que ya ocurrió y que alguien debe conocer: se creó un establecimiento, cambió tu '
        + 'horario, marcaste tu entrada, alguien comentó tu día.');
    vinetas(doc, [
        'Nace SIEMPRE después de que la operación se guardó. Primero se escribe el establecimiento; luego se avisa.',
        'Nunca puede tumbar lo que la originó. Si falla el aviso, el establecimiento ya está creado y la petición responde igual.',
        'Se guarda con su texto ya escrito, en español e inglés. No se guarda una plantilla: si mañana se cambia una frase, el pasado tiene que seguir diciendo lo que dijo.',
    ]);

    nota(doc,
        'El actor y el recurso se REFERENCIAN y además se COPIAN. La referencia sirve para navegar; la '
        + 'copia, para que dentro de seis meses el aviso siga leyéndose "Daniel Flores desactivó a '
        + 'Francisca Doral" aunque ese establecimiento ya no exista. Sin la copia, el histórico se vacía solo.');

    // ── 2 ──
    titulo(doc, 'El recorrido completo', 2);
    parrafo(doc, 'Estos cinco pasos ocurren en orden cada vez que el sistema avisa de algo:');

    diagramaFlujo(doc, [
        {
            titulo: 'Algo pasa y se llama a notify()',
            detalle: 'El controlador termina de guardar y solo entonces avisa. Dice QUÉ pasó, no qué se lee ni quién lo ve.',
            archivo: 'cualquier controlador',
        },
        {
            titulo: 'La estrategia del tipo decide',
            detalle: 'Devuelve el texto en dos idiomas, la familia visual, el alcance y —si es personal— los destinatarios.',
            archivo: 'strategies/',
        },
        {
            titulo: 'Se guarda en la base de datos',
            detalle: 'Con el texto ya renderizado y con copia del actor y del recurso, para que el histórico se sostenga solo.',
            archivo: 'notification.model.js',
        },
        {
            titulo: 'Sale por socket a quien le toca',
            detalle: 'Global a todos; admin a la sala de administradores; personal a la sala de cada destinatario.',
            archivo: 'notification.audience.js',
        },
        {
            titulo: 'El cliente la lee en su bandeja',
            detalle: 'El servidor filtra por el mismo criterio con el que emitió. Lo leído se guarda aparte.',
            archivo: 'routes/inbox.routes.js',
        },
    ]);

    // ── 3 ──
    titulo(doc, 'Quién puede verla', 3);
    parrafo(doc,
        'Es la decisión más delicada del sistema, y se responde DOS veces por dos caminos distintos que '
        + 'tienen que decir lo mismo: al emitir por socket y al consultar la bandeja.');

    tabla(doc,
        [{ label: 'Alcance', width: 18 }, { label: 'Quién lo recibe', width: 30 }, { label: 'Sala de socket', width: 22 }, { label: 'Se usa para', width: 30 }],
        [
            ['global', 'Todos los usuarios', 'todas', 'Anuncios de la plataforma y comentarios del horario'],
            ['personal', 'Solo los de recipients', 'user:<id>', 'Tu marcaje, cambios de tu jornada, respuesta a lo que pediste'],
            ['admin', 'Solo administradores', 'admins', 'Solicitudes de cambio pendientes de aprobar'],
        ]);

    nota(doc,
        'Una notificación personal NO se emite a todos para esconderla en el cliente. Filtrar en el front '
        + 'no la hace privada: solo la hace invisible, porque el contenido ya viajó. Por eso lo personal '
        + 'va a la sala del destinatario y la consulta filtra en el SERVIDOR, a partir de la sesión. '
        + 'El cliente nunca dice de quién es la consulta.');

    // ── 4 ──
    titulo(doc, 'El patrón Estrategia', 4);
    parrafo(doc,
        'Cada tipo de notificación se registra a sí mismo y declara cómo se comporta. El servicio no sabe '
        + 'qué dice ninguna, y el cliente no sabe cómo se pinta ninguna: los dos preguntan.');

    codigo(doc,
        "registerStrategy('establishment.created', {\n"
        + "    family: 'resource',      // cómo lo pinta el cliente\n"
        + "    scope:  'global',        // quién lo ve\n"
        + "    level:  'success',       // color del punto en la campana\n"
        + "    action: 'created',\n"
        + "    text: (ctx, lang) => ({ title: '...', body: '...' }),\n"
        + "    audience: (ctx) => [...],   // solo si scope es 'personal'\n"
        + "});");

    parrafo(doc,
        'Sin esto, el servicio sería un switch gigante que crece con cada evento del sistema. Con el '
        + 'registro, agregar un aviso nuevo es añadir un objeto: el servicio no se toca.');

    subtitulo(doc, 'La familia la manda el backend, no el nombre del tipo');
    parrafo(doc,
        'El cliente NO deduce la apariencia partiendo el tipo por el punto. Si lo hiciera, un tipo nuevo '
        + 'obligaría a tocar también el front, y un tipo mal escrito caería en un estilo cualquiera sin '
        + 'avisar. La familia viaja declarada dentro del aviso y el cliente solo obedece.');

    // ── 5 ──
    titulo(doc, 'Los tipos que existen hoy', 5);
    parrafo(doc,
        `Leídos del registro en el momento de generar este documento: ${STRATEGIES.size} tipos. `
        + 'La columna "Audiencia propia" indica si el tipo calcula sus destinatarios uno por uno.');

    tabla(doc,
        [{ label: 'Tipo', width: 32 }, { label: 'Familia', width: 15 }, { label: 'Quién lo ve', width: 26 }, { label: 'Audiencia propia', width: 15 }, { label: 'Nivel', width: 12 }],
        filasDeTipos());

    // ── 6 ──
    titulo(doc, 'Los endpoints', 6);
    parrafo(doc, 'Todos cuelgan de /api_jarvis/v1 y exigen sesión. Se montan en este orden exacto:');

    tabla(doc,
        [{ label: 'Método y ruta', width: 40 }, { label: 'Para qué sirve', width: 42 }, { label: 'Permiso', width: 18 }],
        [
            ['GET  /notifications', 'La bandeja paginada, con el estado de lectura de quien pregunta', 'Sesión'],
            ['GET  /notifications/unread-count', 'Solo el número para la campana; no trae documentos', 'Sesión'],
            ['POST /notifications/:id/read', 'Marcar una como leída. Idempotente', 'Sesión'],
            ['POST /notifications/read-all', 'Marcar como leídas todas las que le tocan', 'Sesión'],
            ['POST /notifications/:id/decide', 'Aprobar o rechazar una solicitud de horario', 'Admin'],
            ['GET  /notifications/schedule/pending', 'Solicitudes pendientes indexadas por celda, para la grilla', 'Sesión'],
            ['POST /notifications/:id/withdraw', 'Retirar una solicitud propia', 'Su autor'],
            ['POST /notifications/announcement', 'Publicar un anuncio firmado por el usuario del sistema', 'Admin'],
        ]);

    nota(doc,
        'El orden de montaje importa: Express resuelve por orden de registro y hay rutas con parámetro '
        + '(/notifications/:id/read) que podrían capturar a otras. Si se reordenan, una ruta puede '
        + 'responder por otra sin error y sin aviso.', COLORS.warn);

    subtitulo(doc, 'Lo leído vive en otra colección');
    parrafo(doc,
        'Una notificación global la reciben todos. Guardar los lectores dentro del documento obligaría a '
        + 'reescribirlo cada vez que alguien abre la campana, y el arreglo crecería sin techo. En su lugar, '
        + 'cada lectura es un documento pequeño e independiente en notificationRead, con índice único por '
        + '(notificación, usuario): marcar dos veces no duplica ni falla.');

    // ── 7 ──
    titulo(doc, 'Mapa de archivos', 7);
    tabla(doc,
        [{ label: 'Archivo', width: 40 }, { label: 'De qué se ocupa', width: 60 }],
        [
            ['index.js', 'La puerta del módulo y el mapa del flujo. Empezar a leer por acá'],
            ['notification.model.js', 'La forma del aviso guardado'],
            ['notificationRead.model.js', 'Quién leyó qué, en colección aparte'],
            ['notification.service.js', 'notify(): la mecánica de crear, firmar y emitir'],
            ['notification.audience.js', 'Quién lo ve: salas de socket y filtro de consulta'],
            ['notification.routes.js', 'Monta los endpoints, en orden'],
            ['routes/inbox.routes.js', 'Leer la bandeja y marcar leído'],
            ['routes/requests.routes.js', 'Solicitudes de horario: decidir, retirar, consultar'],
            ['routes/announcement.routes.js', 'Publicar anuncios de la plataforma'],
            ['strategies/index.js', 'Carga todas las familias y expone el registro'],
            ['strategies/registry.js', 'El mecanismo: registrar y resolver un tipo'],
            ['strategies/helpers.js', 'Trozos de frase compartidos por varias familias'],
            ['strategies/*.strategies.js', 'Un archivo por familia, con sus tipos y sus textos'],
        ]);

    // ── 8 ──
    titulo(doc, 'Cómo agregar un aviso nuevo', 8);
    vinetas(doc, [
        'Registra la estrategia en el archivo de su familia, dentro de strategies/. Si la familia no existe todavía, crea el archivo e impórtalo en strategies/index.js — sin ese import, el tipo no se registra y cae en silencio al texto de respaldo.',
        'Llama a notify() donde ocurre el hecho, SIEMPRE después de haberlo guardado.',
        'Nada más. El guardado, la emisión por socket y la bandeja ya funcionan para el tipo nuevo.',
    ]);
    parrafo(doc,
        'Si la familia visual es nueva, hay que darla de alta también en el enum de notification.model.js '
        + 'y en el registro de vistas del cliente, que es su espejo.');

    // ── 9 ──
    titulo(doc, 'Decisiones y por qué', 9);
    tabla(doc,
        [{ label: 'Decisión', width: 34 }, { label: 'Motivo', width: 66 }],
        [
            ['notify() nunca lanza', 'El aviso es un efecto secundario de algo que ya se guardó. Si falla, no puede tumbar la operación que lo originó'],
            ['Texto guardado, no plantilla', 'Cambiar una frase no debe reescribir lo que el sistema dijo hace seis meses'],
            ['Actor y recurso copiados', 'El histórico tiene que sostenerse aunque el establecimiento se borre o la persona cambie de nombre'],
            ['Lectura en otra colección', 'Evita reescribir el mismo documento por cada persona que abre la campana'],
            ['Salas de socket por usuario', 'Lo privado no viaja. Esconderlo en el cliente no es lo mismo que no enviarlo'],
            ['Familia declarada por el backend', 'El cliente no deduce la apariencia del nombre del tipo: un tipo mal escrito caería en cualquier estilo sin avisar'],
            ['Una familia por archivo', 'Para responder "qué avisos existen sobre el horario" abriendo un solo archivo'],
        ]);

    // ── Pie de página en todas ──
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(rango.start + i);
        doc.rect(0, PAGE.height - 22, PAGE.width, 22).fill(COLORS.cream);
        doc.fill(COLORS.muted).font('Helvetica').fontSize(7.6)
            .text('Jarvis365 · Sistema de notificaciones · Guía técnica',
                PAGE.margin, PAGE.height - 15, { width: W / 2 });
        doc.text(`Página ${i + 1} de ${rango.count}`,
            PAGE.margin + W / 2, PAGE.height - 15, { width: W / 2, align: 'right' });
    }

    doc.end();
});


const main = async () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    // El script vive en dist/scripts al ejecutarse; la carpeta docs va en la
    // raíz del proyecto, dos niveles arriba.
    const destino = resolve(aqui, '..', '..', 'docs', 'guia-sistema-notificaciones.pdf');

    const pdf = await construir();
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, pdf);

    console.log(`Guía generada: ${destino}`);
    console.log(`Tipos documentados: ${STRATEGIES.size}`);
};

main().catch(err => {
    console.error('No se pudo generar la guía:', err);
    process.exit(1);
});
