import PDFDocument from 'pdfkit';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// ══════════════════════════════════════════════════════════════════════
// INFORME DE AVANCES — para leer, no para programar
// ══════════════════════════════════════════════════════════════════════
// Deja el PDF en el ESCRITORIO (o en la ruta que se le pase como argumento).
//
//     npm run build && node dist/scripts/generar-informe-avances.js
//
// Es el documento que se le enseña a alguien que NO toca el código: qué se
// añadió a la plataforma, para qué sirve y qué cambia en el día a día.
//
// A diferencia de la guía técnica de notificaciones, este texto NO se genera
// leyendo el sistema: está redactado. Cuando se sumen funciones nuevas hay que
// escribirlas acá.
//
// Regla al escribirlo: si una frase necesita saber qué es un endpoint, un
// socket o una colección, está mal escrita para este documento.

const COLORS = {
    band: '#1f9a08',
    accent: '#29c50c',
    text: '#1a1a1a',
    muted: '#6b7280',
    cream: '#f4f7f0',
    line: '#dfe5da',
    white: '#ffffff',
    warn: '#b45309',
    warnSoft: '#fdf6ec',
};

const PAGE = { width: 595.28, height: 841.89, margin: 46 };
const W = PAGE.width - PAGE.margin * 2;

const bottom = () => PAGE.height - PAGE.margin - 26;

const nuevaPagina = (doc) => {
    doc.addPage();
    doc.y = PAGE.margin + 8;
};

const ensure = (doc, alto) => {
    if (doc.y + alto > bottom()) nuevaPagina(doc);
};

const titulo = (doc, texto, numero) => {
    ensure(doc, 60);
    const y = doc.y + 10;
    doc.rect(PAGE.margin, y, 4, 21).fill(COLORS.accent);
    doc.fill(COLORS.text).font('Helvetica-Bold').fontSize(15)
        .text(`${numero}. ${texto}`, PAGE.margin + 14, y + 3, { width: W - 14 });
    doc.y = y + 32;
};

const parrafo = (doc, texto) => {
    doc.font('Helvetica').fontSize(10).fill(COLORS.text);
    const alto = doc.heightOfString(texto, { width: W, lineGap: 2.6 });
    ensure(doc, alto + 12);
    doc.text(texto, PAGE.margin, doc.y + 5, { width: W, lineGap: 2.6 });
    doc.y += 5;
};

/** Frase corta que resume para qué sirve la sección. */
const entradilla = (doc, texto) => {
    doc.font('Helvetica-Oblique').fontSize(10.5).fill(COLORS.muted);
    const alto = doc.heightOfString(texto, { width: W, lineGap: 2.4 });
    ensure(doc, alto + 12);
    doc.text(texto, PAGE.margin, doc.y + 2, { width: W, lineGap: 2.4 });
    doc.y += 8;
};

const vinetas = (doc, items) => {
    items.forEach(it => {
        doc.font('Helvetica').fontSize(10);
        const alto = doc.heightOfString(it, { width: W - 18, lineGap: 2.3 });
        ensure(doc, alto + 9);
        const y = doc.y + 5;
        doc.circle(PAGE.margin + 4, y + 5.2, 2).fill(COLORS.accent);
        doc.fill(COLORS.text).font('Helvetica').fontSize(10)
            .text(it, PAGE.margin + 16, y, { width: W - 18, lineGap: 2.3 });
        doc.y += 4;
    });
    doc.y += 5;
};

/** Recuadro para lo que conviene no pasar por alto. */
const nota = (doc, texto, tono = 'verde') => {
    const color = tono === 'aviso' ? COLORS.warn : COLORS.accent;
    const fondo = tono === 'aviso' ? COLORS.warnSoft : COLORS.cream;

    doc.font('Helvetica').fontSize(9.6);
    const alto = doc.heightOfString(texto, { width: W - 32, lineGap: 2.4 }) + 20;
    ensure(doc, alto + 14);
    const y = doc.y + 7;
    doc.rect(PAGE.margin, y, W, alto).fill(fondo);
    doc.rect(PAGE.margin, y, 3.5, alto).fill(color);
    doc.fill(COLORS.text).font('Helvetica').fontSize(9.6)
        .text(texto, PAGE.margin + 17, y + 10, { width: W - 32, lineGap: 2.4 });
    doc.y = y + alto + 10;
};

/** Antes / ahora, en dos columnas. Es la forma más clara de contar un cambio. */
const antesAhora = (doc, filas) => {
    const colW = (W - 14) / 2;
    doc.y += 6;

    filas.forEach(([antes, ahora]) => {
        doc.font('Helvetica').fontSize(9.4);
        const h = Math.max(
            doc.heightOfString(antes, { width: colW - 22, lineGap: 2 }),
            doc.heightOfString(ahora, { width: colW - 22, lineGap: 2 }),
        ) + 26;

        ensure(doc, h + 10);
        const y = doc.y;

        doc.rect(PAGE.margin, y, colW, h).fill('#f7f7f6');
        doc.rect(PAGE.margin + colW + 14, y, colW, h).fill(COLORS.cream);

        doc.fill(COLORS.muted).font('Helvetica-Bold').fontSize(7.6)
            .text('ANTES', PAGE.margin + 11, y + 8, { width: colW - 22, characterSpacing: 0.6 });
        doc.fill(COLORS.band).font('Helvetica-Bold').fontSize(7.6)
            .text('AHORA', PAGE.margin + colW + 25, y + 8, { width: colW - 22, characterSpacing: 0.6 });

        doc.fill(COLORS.text).font('Helvetica').fontSize(9.4)
            .text(antes, PAGE.margin + 11, y + 20, { width: colW - 22, lineGap: 2 });
        doc.fill(COLORS.text).font('Helvetica').fontSize(9.4)
            .text(ahora, PAGE.margin + colW + 25, y + 20, { width: colW - 22, lineGap: 2 });

        doc.y = y + h + 8;
    });

    doc.y += 2;
};


/** Una jornada de la línea de tiempo: fecha a la izquierda, hitos a la derecha. */
const dia = (doc, fecha, hitos) => {
    doc.font('Helvetica').fontSize(9.5);
    const textoW = W - 92;
    const alto = hitos.reduce((acc, h) =>
        acc + doc.heightOfString(h, { width: textoW, lineGap: 1.8 }) + 5, 0) + 12;

    ensure(doc, alto + 8);
    const y = doc.y + 4;

    doc.rect(PAGE.margin, y, 78, alto).fill(COLORS.cream);
    doc.fill(COLORS.band).font('Helvetica-Bold').fontSize(9)
        .text(fecha, PAGE.margin + 8, y + 8, { width: 64 });

    let cursor = y + 7;
    hitos.forEach(h => {
        const hAlto = doc.heightOfString(h, { width: textoW, lineGap: 1.8 });
        doc.circle(PAGE.margin + 90, cursor + 5, 1.8).fill(COLORS.accent);
        doc.fill(COLORS.text).font('Helvetica').fontSize(9.5)
            .text(h, PAGE.margin + 98, cursor, { width: textoW, lineGap: 1.8 });
        cursor += hAlto + 5;
    });

    doc.y = y + alto + 6;
};


// ══════════════════════════════════════════════════════════════════════

const construir = () => new Promise((resolveDoc, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
    const trozos = [];
    doc.on('data', t => trozos.push(t));
    doc.on('end', () => resolveDoc(Buffer.concat(trozos)));
    doc.on('error', reject);

    const generado = new Date().toLocaleDateString('es-VE', {
        timeZone: 'America/Caracas', day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── Portada ──
    doc.rect(0, 0, PAGE.width, 176).fill(COLORS.band);
    doc.rect(0, 176, PAGE.width, 5).fill(COLORS.accent);

    doc.fill(COLORS.white).font('Helvetica-Bold').fontSize(28)
        .text('Novedades de la plataforma', PAGE.margin, 48, { width: W });
    doc.font('Helvetica').fontSize(13.5)
        .text('Qué se agregó y qué cambia en el día a día', PAGE.margin, 86, { width: W });
    doc.font('Helvetica-Bold').fontSize(10.5)
        .text('Del jueves 6 al jueves 13 de agosto de 2026', PAGE.margin, 110, { width: W });
    doc.fontSize(9.5).fillOpacity(0.85)
        .text(`Amazonas365  ·  Generado el ${generado}`, PAGE.margin, 132, { width: W });
    doc.fillOpacity(1);
    doc.y = 206;

    parrafo(doc,
        'Este documento resume las funciones que se sumaron a la plataforma y para qué sirven. '
        + 'Está escrito para leerse sin conocimientos técnicos: no explica cómo está hecho el '
        + 'sistema, sino qué se puede hacer ahora que antes no se podía.');

    parrafo(doc,
        'Recoge el trabajo de una semana, del jueves 6 al jueves 13 de agosto. El hilo que une '
        + 'casi todo es el mismo: que la información llegue sola a quien le corresponde, en el '
        + 'momento, sin que nadie tenga que estar revisando pantallas.');

    // ── 1 ──
    titulo(doc, 'Avisos en tiempo real', 1);
    entradilla(doc,
        'La campana del menú. Es la pieza central de todo lo demás: casi cada función nueva '
        + 'avisa a través de ella.');

    parrafo(doc,
        'Cuando ocurre algo que alguien debe saber —se creó un establecimiento, cambió un '
        + 'horario, alguien marcó su entrada— la plataforma lo avisa en el momento, sin recargar '
        + 'la página. Los avisos quedan guardados: se pueden volver a leer días después.');

    vinetas(doc, [
        'Cada aviso dice quién lo hizo, sobre quién y cuándo, con sus fotos.',
        'Se distinguen de un vistazo por color e ícono según de qué tratan: horario, marcaje, comentarios, establecimientos o anuncios.',
        'La campana suena y se enciende solo cuando hay algo que todavía no viste. Al abrir la bandeja se calma, pero el contador sigue marcando lo que falta por leer.',
        'Llegan de a siete, con un botón para ver las siguientes. La bandeja no crece: se desplaza.',
    ]);

    nota(doc,
        'No todos ven lo mismo, y es a propósito. Hay avisos para toda la empresa (un anuncio, un '
        + 'comentario en el horario), avisos solo para administradores (una solicitud esperando '
        + 'aprobación) y avisos privados de una sola persona (su propio marcaje). Lo privado no se '
        + 'envía a los demás: no es que se les oculte, es que no les llega.');

    // ── 2 ──
    titulo(doc, 'Cambios de horario con aprobación', 2);
    entradilla(doc, 'Quien no es administrador ya puede proponer cambios sin poder aplicarlos.');

    antesAhora(doc, [
        ['Solo un administrador podía tocar el horario. Cualquier otro tenía que pedírselo por fuera del sistema, y no quedaba registro de quién pidió qué.',
         'Un usuario con permiso de supervisión propone el cambio y queda esperando. Los administradores lo reciben en su campana y lo aceptan o lo rechazan.'],
        ['Un cambio aplicado no avisaba a nadie: el empleado se enteraba al mirar la grilla.',
         'El empleado recibe el aviso de que su horario cambió, y el resto de administradores ve quién lo hizo.'],
    ]);

    vinetas(doc, [
        'Se puede aceptar o rechazar desde la propia celda del horario, sin abrir la campana. La celda se pinta sola cuando alguien pide un cambio, y se libera cuando se decide.',
        'Queda registrado quién lo pidió, quién lo aprobó y de quién era el horario: las tres personas, no solo la última.',
        'Quien pidió un cambio puede retirarlo si se arrepiente, sin molestar a nadie.',
        'Si alguien más ya tocó esa fecha mientras la solicitud esperaba, el sistema avisa antes de aplicarla en lugar de pisar el trabajo del otro.',
        'Al pulsar el aviso, el horario se abre en el mes correcto y señala la celda exacta.',
    ]);

    // ── 3 ──
    titulo(doc, 'Asistencia y marcaje', 3);
    entradilla(doc, 'Cada quien recibe el comprobante de lo que marcó.');

    parrafo(doc,
        'Al marcar entrada o salida, la persona recibe un aviso privado —solo suyo— con el '
        + 'resultado: la hora, si llegó puntual o con retardo y de cuántos minutos, cuántas '
        + 'unidades de descuento genera, si el día cuenta como extra y cuánto trabajó. Incluye '
        + 'las dos fotos del fichaje, así que sirve de comprobante.');

    nota(doc,
        'Ese aviso lo ve únicamente quien marcó. Los retardos de una persona no aparecen en la '
        + 'campana de sus compañeros ni en la de un administrador.');

    parrafo(doc, 'Sobre las faltas y el primer día:');
    vinetas(doc, [
        'El sistema registra la inasistencia solo cuando corresponde: a las 3 de la tarde para el turno diurno y a las 9 de la noche para el nocturno.',
        'Si el empleado no tiene horario cargado para ese día, se usa el horario por defecto de su turno en lugar de dejarlo sin evaluar.',
        'A quien se dio de alta HOY no se le registra falta ni llegada tarde. Su horario se arma el mismo día en que entra, muchas veces cuando ya empezó a trabajar: cobrarle un retardo contra una hora que hace un rato no existía sería cobrarle un error de captura.',
    ]);

    // ── 4 ──
    titulo(doc, 'Horas extras', 4);
    entradilla(doc, 'Aprobar la parte que corresponde, no todo o nada.');

    parrafo(doc,
        'Las horas extras se calculan solas a partir de la entrada y la salida, y esperan '
        + 'aprobación. La novedad es que se puede aprobar una parte: si alguien generó tres '
        + 'horas y solo corresponde pagar una, se aprueba una.');

    vinetas(doc, [
        'Lo aprobado, lo pendiente y lo rechazado se ven por separado y siempre suman el total generado.',
        'En la grilla se distinguen por color: verde aprobadas, azul esperando decisión, rojo rechazadas. La leyenda del panel lateral explica cada color.',
        'Los reportes individuales y globales muestran las mismas cifras que la grilla, y el global suma el total aprobado de toda la plantilla.',
    ]);

    nota(doc,
        'Para que las horas extras se calculen hace falta que la persona marque su SALIDA. Sin '
        + 'salida no hay jornada cerrada y no hay nada que calcular.', 'aviso');

    // ── 5 ──
    titulo(doc, 'Comentarios del horario', 5);
    entradilla(doc, 'Las notas del día dejaron de quedarse escondidas en la celda.');

    parrafo(doc,
        'Cuando alguien escribe una nota sobre el día de otra persona —"cubrió el turno de la '
        + 'noche", "llegó tarde por el tráfico"— se avisa al equipo. Es información de operación '
        + 'y sirve justamente para que se vea.');

    vinetas(doc, [
        'El aviso muestra las caras de quien escribió y de la persona comentada, el día del horario y la nota completa.',
        'Al pulsarlo, el horario se abre en esa celda y despliega su ficha para leer el comentario, sin tener que buscarlo.',
    ]);

    // ── 6 ──
    titulo(doc, 'Reportes de asistencia', 6);
    entradilla(doc, 'Las cifras del reporte y las de la grilla dicen lo mismo.');

    vinetas(doc, [
        'El reporte individual y el global cuentan las unidades de descuento por llegadas tarde, separando entre semana y fin de semana.',
        'La tarjeta muestra primero las unidades a descontar y debajo en cuántos días se generaron, que es el dato que se necesita para calcular.',
        'El global suma el total de horas extras aprobadas de toda la plantilla y el de cada persona.',
        'El corte diario se envía solo y ahora también recupera lo que quedó pendiente si el servidor estuvo apagado a la hora del corte.',
    ]);

    // ── 7 ──
    titulo(doc, 'Personal y directorio', 7);
    entradilla(doc, 'Los datos del equipo, en un archivo.');

    parrafo(doc,
        'Desde Gestión de perfiles se puede descargar en Excel el directorio completo del '
        + 'personal activo: foto, nombre, apellido, cédula de identidad, cargo, departamento, '
        + 'turno, correo y teléfono. Descarga a todos los activos, no solo lo que se ve en '
        + 'pantalla.');

    // ── 8 ──
    titulo(doc, 'Novedades y alertas', 8);
    entradilla(doc, 'Un arreglo puntual que evitaba perder material.');

    parrafo(doc,
        'Cuando una alerta tiene video e imagen y al grupo se envió la imagen, el botón para '
        + 'descargar el video queda disponible igual. Antes, haber enviado la foto dejaba el '
        + 'video fuera de alcance aunque estuviera grabado.');

    // ── 9 ──
    titulo(doc, 'Orden interno y documentación', 9);
    entradilla(doc, 'No se ve en pantalla, pero es lo que permite seguir avanzando rápido.');

    vinetas(doc, [
        'Los archivos más grandes del horario y de los avisos se repartieron en piezas con nombre propio, sin cambiar cómo funcionan. Un archivo de dos mil trescientas líneas con ocho pantallas dentro se volvió una carpeta donde cada cosa está donde uno la busca.',
        'Se escribió una guía técnica del sistema de avisos que se genera leyendo el propio código, así que no puede quedar desactualizada.',
        'Cada cambio de esta semana quedó verificado antes de publicarse: se comprobó que lo reorganizado se comporta exactamente igual que antes.',
    ]);

    // ── 10 ──
    titulo(doc, 'Reportes Express: la app de monitoreo', 10);
    entradilla(doc, 'Los mismos avisos, en la aplicación de las estaciones.');

    vinetas(doc, [
        'La aplicación de monitoreo tiene ahora su propia campana, con los mismos avisos y el mismo historial.',
        'La bandeja se ve como el resto de esa aplicación, no como una pieza traída de otro sistema.',
        'Las animaciones están medidas para no consumir procesador: esas máquinas están encendidas toda la jornada.',
    ]);

    // ── 9 ──
    titulo(doc, 'Confiabilidad', 11);
    entradilla(doc, 'Menos formas de equivocarse sin darse cuenta.');

    antesAhora(doc, [
        ['Un doble clic en el horario podía guardar dos veces el mismo cambio, o enviar dos comentarios idénticos.',
         'Cada acción se bloquea mientras se está guardando. El segundo clic no hace nada.'],
        ['Quien no era administrador podía escribir la dirección de una pantalla restringida y entrar.',
         'Se muestra una pantalla de acceso denegado, y esas opciones ni siquiera aparecen en el menú.'],
    ]);

    vinetas(doc, [
        'Al marcar la salida, la sesión se cierra sola en las aplicaciones.',
        'Las notificaciones ya no repiten el apellido de quien las firma ni pierden la foto del establecimiento.',
    ]);

    // ── 12 ──
    titulo(doc, 'La semana, día por día', 12);
    entradilla(doc, 'El mismo trabajo, en el orden en que se hizo.');

    dia(doc, 'Vie 7', [
        'Cálculo de horas extras a partir de la entrada y la salida, con aprobación.',
        'Aprobación parcial: se puede autorizar solo una parte de lo generado.',
        'Horas extras en el reporte global, leyenda de colores y rechazadas en rojo.',
        'Refuerzo del registro automático de faltas en el corte del día.',
        'Descarga del video cuando al grupo se envió la imagen.',
    ]);
    dia(doc, 'Dom 9', [
        'Sistema de avisos: se guardan, llegan en el momento y se distinguen por tipo.',
        'La campana, con su bandeja y su contador.',
        'El logo del establecimiento aparece en su aviso.',
        'Solicitudes de cambio de horario con aprobación de un administrador.',
    ]);
    dia(doc, 'Lun 10', [
        'Aviso privado del marcaje, con las dos fotos y el resultado de la jornada.',
        'Aceptar o rechazar solicitudes desde la propia celda del horario.',
        'Bloqueo del doble envío en todo el horario.',
        'La bandeja carga de siete en siete y deja de estirarse.',
    ]);
    dia(doc, 'Mar 11', [
        'Los comentarios del horario avisan al equipo y abren la celda comentada.',
        'Reorganización de las pantallas del horario para poder mantenerlas.',
    ]);
    dia(doc, 'Mié 12', [
        'Reorganización del sistema de avisos y guía técnica que se genera sola.',
    ]);
    dia(doc, 'Jue 13', [
        'Al personal dado de alta hoy no se le registra falta ni llegada tarde.',
        'La bandeja de la app de monitoreo adopta el aspecto de esa aplicación.',
        'Descarga del directorio de personal activo en Excel.',
    ]);

    // ── 13 ──
    titulo(doc, 'Qué falta para que todo esto se vea', 13);

    nota(doc,
        'Buena parte de lo descrito ya está publicado y funcionando en las pantallas. Pero varias '
        + 'funciones dependen del servidor central, que se actualiza a mano: hasta que se haga esa '
        + 'actualización, seguirán sin verse aunque el resto ya esté listo.', 'aviso');

    parrafo(doc, 'Pendientes de esa actualización, por orden de importancia:');
    vinetas(doc, [
        'La aprobación parcial de horas extras. Hoy, aprobar una parte guarda el total sin avisar — es lo más urgente.',
        'El refuerzo del registro automático de faltas.',
        'Los avisos privados del marcaje, los comentarios del horario y las solicitudes en la celda.',
        'La corrección del apellido repetido y del logo del establecimiento en los avisos.',
        'La regla del primer día para el personal nuevo.',
    ]);

    parrafo(doc,
        'Ninguna de estas pendientes rompe nada: las pantallas funcionan igual, simplemente esas '
        + 'funciones todavía no responden.');

    // ── Pie ──
    //
    // OJO CON ESTO: el pie se dibuja por DEBAJO del margen inferior, y pdfkit
    // agrega una pagina nueva en cuanto se escribe texto fuera del area util.
    // Con cuatro paginas de contenido eso generaba ocho paginas en blanco al
    // final del documento, una por cada llamada a `text`.
    //
    // Se anula el margen inferior mientras se pinta el pie y se restaura
    // despues. Sin esta linea el documento vuelve a llenarse de hojas vacias.
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(rango.start + i);

        const margenInferior = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        doc.rect(0, PAGE.height - 24, PAGE.width, 24).fill(COLORS.cream);
        doc.fill(COLORS.muted).font('Helvetica').fontSize(7.8)
            .text('Amazonas365 · Novedades de la plataforma', PAGE.margin, PAGE.height - 16,
                { width: W / 2, lineBreak: false });
        doc.text(`Página ${i + 1} de ${rango.count}`,
            PAGE.margin + W / 2, PAGE.height - 16,
            { width: W / 2, align: 'right', lineBreak: false });

        doc.page.margins.bottom = margenInferior;
    }

    doc.end();
});


const main = async () => {
    // Por defecto va al ESCRITORIO, que es donde se necesita para compartirlo.
    // Se puede pasar otra ruta como argumento.
    const destino = process.argv[2]
        ? resolve(process.argv[2])
        : join(homedir(), 'Desktop', 'novedades-plataforma.pdf');

    const pdf = await construir();
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, pdf);

    console.log(`Informe generado: ${destino}`);
};

main().catch(err => {
    console.error('No se pudo generar el informe:', err);
    process.exit(1);
});
