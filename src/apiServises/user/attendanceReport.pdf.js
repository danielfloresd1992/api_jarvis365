import PDFDocument from 'pdfkit';

// ══════════════════════════════════════════════════════════════════════
// GENERADOR PDF: Corte diario de asistencia
// ══════════════════════════════════════════════════════════════════════
// Recibe los datos que produce buildDailyAttendanceReport() y devuelve un
// Buffer con un PDF A4 presentable: encabezado, tarjetas de resumen y
// tablas de retardos / ausencias / pendientes con salto de página.

// Paleta inspirada en Claude / Anthropic: fondo crema (ivory), tipografía
// en negro cálido y acentos en naranja "book cloth". Tonos terracota para
// las señales para mantener la estética cálida.
const COLORS = {
    header: '#CC785C',      // naranja Claude "book cloth" (banda superior)
    accent: '#D97757',      // naranja Claude (acento / línea)
    late: '#C15F3C',        // terracota (retardos)
    absent: '#B4472F',      // rojo terracota (ausencias)
    ok: '#7A8471',          // verde salvia apagado (a tiempo)
    pending: '#8A8780',     // gris cálido (pendientes)
    discount: '#B84A2E',    // naranja intenso (a descontar)
    extra: '#9A7B4F',       // ocre cálido (días extra / franco trabajado)
    extraRow: '#F3E7D3',    // ocre muy claro: resalta la fila de un día extra
    text: '#141413',        // negro cálido
    muted: '#73726C',       // gris cálido
    cream: '#F0EEE6',       // crema Claude (tarjetas)
    page: '#FAF9F5',        // fondo de página (ivory)
    zebra: '#F0EEE6',       // filas alternas (crema)
    line: '#E3E0D6',        // líneas cálidas
    white: '#ffffff'
};

const PAGE = { width: 595.28, height: 841.89, margin: 40 }; // A4 en puntos
const CONTENT_WIDTH = PAGE.width - (PAGE.margin * 2);


const ensureSpace = (doc, needed) => {
    if (doc.y + needed > PAGE.height - PAGE.margin - 20) doc.addPage();
};


const drawHeader = (doc, { cutLabel, dateLabel, generatedAtLabel }) => {
    doc.rect(0, 0, PAGE.width, 92).fill(COLORS.header);
    doc.rect(0, 92, PAGE.width, 4).fill(COLORS.accent);

    doc.fill(COLORS.white)
        .font('Helvetica-Bold').fontSize(19)
        .text('REPORTE DE ASISTENCIA', PAGE.margin, 22, { width: CONTENT_WIDTH });

    doc.font('Helvetica').fontSize(11)
        .text(`${cutLabel}  ·  ${dateLabel}`, PAGE.margin, 50, { width: CONTENT_WIDTH });

    doc.fontSize(8.5).fillOpacity(0.8)
        .text(`Generado: ${generatedAtLabel}  ·  Jarvis365`, PAGE.margin, 68, { width: CONTENT_WIDTH });

    doc.fillOpacity(1);
    doc.y = 112;
};


const drawSummaryCards = (doc, totals) => {
    const cards = [
        { label: 'Esperados hoy', value: totals.expected, color: COLORS.header },
        { label: 'A tiempo', value: totals.presentOnTime, color: COLORS.ok },
        { label: 'Retardos', value: totals.late, color: COLORS.late },
        { label: 'Ausencias', value: totals.absent, color: COLORS.absent },
        { label: 'Turno no inicia', value: totals.pending, color: COLORS.pending },
        { label: 'A descontar', value: totals.discountUnits ?? 0, color: COLORS.discount }
    ];

    const gap = 8;
    const cardW = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
    const cardH = 54;
    const y = doc.y;

    cards.forEach((card, i) => {
        const x = PAGE.margin + i * (cardW + gap);
        doc.roundedRect(x, y, cardW, cardH, 8).fillAndStroke(COLORS.cream, COLORS.line);
        doc.rect(x, y, cardW, 4).fill(card.color);

        doc.fill(card.color).font('Helvetica-Bold').fontSize(20)
            .text(String(card.value), x, y + 12, { width: cardW, align: 'center' });

        doc.fill(COLORS.muted).font('Helvetica').fontSize(7)
            .text(card.label.toUpperCase(), x + 2, y + 38, { width: cardW - 4, align: 'center' });
    });

    doc.y = y + cardH + 18;
};


const drawSectionTitle = (doc, title, count, color) => {
    ensureSpace(doc, 60);
    const y = doc.y;
    doc.rect(PAGE.margin, y, 4, 16).fill(color);
    doc.fill(color).font('Helvetica-Bold').fontSize(12)
        .text(`${title} (${count})`, PAGE.margin + 12, y + 2);
    doc.y = y + 24;
};


// Tabla genérica con zebra y salto de página (repite el encabezado).
// columns: [{ key, label, width, align? }]
const drawTable = (doc, columns, rows, accentColor) => {
    const rowH = 20;
    const headerH = 22;

    const drawTableHeader = () => {
        const y = doc.y;
        doc.rect(PAGE.margin, y, CONTENT_WIDTH, headerH).fill(accentColor);
        let x = PAGE.margin;
        doc.fill(COLORS.white).font('Helvetica-Bold').fontSize(8);
        for (const col of columns) {
            // height limita a UNA línea: el excedente se corta con elipsis
            doc.text(col.label.toUpperCase(), x + 5, y + 7, {
                width: col.width - 10,
                height: 9,
                align: col.align || 'left',
                ellipsis: true
            });
            x += col.width;
        }
        doc.y = y + headerH;
    };

    drawTableHeader();

    rows.forEach((row, idx) => {
        if (doc.y + rowH > PAGE.height - PAGE.margin - 20) {
            doc.addPage();
            drawTableHeader();
        }
        const y = doc.y;
        // Una fila resaltada (ej. día extra) tiene prioridad sobre el zebra.
        const rowFill = row.__highlight || (idx % 2 === 0 ? COLORS.zebra : null);
        if (rowFill) doc.rect(PAGE.margin, y, CONTENT_WIDTH, rowH).fill(rowFill);

        let x = PAGE.margin;
        doc.fill(COLORS.text).font('Helvetica').fontSize(8.5);
        for (const col of columns) {
            const raw = row[col.key];
            const value = (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
            // height limita a UNA línea: el excedente se corta con elipsis
            doc.text(value, x + 5, y + 6, {
                width: col.width - 10,
                height: 10,
                align: col.align || 'left',
                ellipsis: true
            });
            x += col.width;
        }
        doc.y = y + rowH;
    });

    doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.margin + CONTENT_WIDTH, doc.y)
        .strokeColor(COLORS.line).lineWidth(0.5).stroke();
    doc.y += 16;
};


// Etiqueta corta del origen del horario para las celdas de la tabla
const sourceLabel = (s) => s === 'manual' ? 'Manual' : (s === 'por defecto' ? 'Defecto' : '—');


const drawEmptySection = (doc, message) => {
    ensureSpace(doc, 30);
    doc.fill(COLORS.muted).font('Helvetica-Oblique').fontSize(9)
        .text(message, PAGE.margin + 12, doc.y);
    doc.y += 22;
};


/**
 * Genera el PDF del corte de asistencia.
 * @param {object} report - Salida de buildDailyAttendanceReport().
 * @param {string} cutLabel - Etiqueta del corte (ej. "Primer corte · Mediodía").
 * @returns {Promise<Buffer>}
 */
export function buildAttendanceReportPdf(report, cutLabel) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Fondo crema (ivory) en todas las páginas — estética Claude. Se pinta
        // antes de cualquier contenido: en la página 1 aquí, y en las que se
        // agregan por paginación vía el evento 'pageAdded'.
        const paintBackground = () => doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.page);
        doc.on('pageAdded', paintBackground);
        paintBackground();

        drawHeader(doc, {
            cutLabel,
            dateLabel: report.dateLabel,
            generatedAtLabel: report.generatedAtLabel
        });

        drawSummaryCards(doc, report.totals);

        // ── Retardos ────────────────────────────────────────────────────
        drawSectionTitle(doc, 'Llegadas tarde', report.lateArrivals.length, COLORS.late);
        if (report.lateArrivals.length === 0) {
            drawEmptySection(doc, 'Sin retardos registrados al momento del corte.');
        } else {
            drawTable(doc, [
                { key: 'name', label: 'Empleado', width: 110 },
                { key: 'dni', label: 'DNI', width: 66 },
                { key: 'department', label: 'Departamento', width: 78 },
                { key: 'startTime', label: 'Entrada', width: 51, align: 'center' },
                { key: 'checkIn', label: 'Marcó', width: 50, align: 'center' },
                { key: 'minutesLateLabel', label: 'Retraso', width: 53, align: 'center' },
                { key: 'discountLabel', label: 'A descontar', width: 70, align: 'center' },
                { key: 'justifiedLabel', label: 'Just.', width: 37, align: 'center' }
            ], report.lateArrivals.map(r => ({
                ...r,
                // Día extra: marca junto al nombre (legible también impreso en
                // blanco y negro) + fila resaltada en ocre.
                name: r.isExtraDay ? `${r.name}  *` : r.name,
                minutesLateLabel: r.minutesLate !== null ? `${r.minutesLate} min` : '—',
                discountLabel: String(r.discountUnits ?? 0),
                justifiedLabel: r.isJustified ? 'Sí' : 'No',
                __highlight: r.isExtraDay ? COLORS.extraRow : null
            })), COLORS.late);

            if (report.lateArrivals.some(r => r.isExtraDay)) {
                doc.fill(COLORS.extra).font('Helvetica-Oblique').fontSize(7.5)
                    .text('*  Fila resaltada: trabajó en su día franco (día extra); el retardo se le descuenta igual.', PAGE.margin + 2, doc.y - 11);
                doc.y += 4;
            }
        }

        // ── Ausencias ───────────────────────────────────────────────────
        drawSectionTitle(doc, 'No se presentaron', report.absents.length, COLORS.absent);
        if (report.absents.length === 0) {
            drawEmptySection(doc, 'Sin ausencias al momento del corte.');
        } else {
            drawTable(doc, [
                { key: 'name', label: 'Empleado', width: 115 },
                { key: 'dni', label: 'DNI', width: 70 },
                { key: 'department', label: 'Departamento', width: 85 },
                { key: 'shift', label: 'Turno', width: 45, align: 'center' },
                { key: 'startTime', label: 'Entrada', width: 50, align: 'center' },
                { key: 'reason', label: 'Observación', width: 100 },
                { key: 'sourceShort', label: 'Horario', width: 50, align: 'center' }
            ], report.absents.map(r => ({
                ...r,
                sourceShort: sourceLabel(r.scheduleSource)
            })), COLORS.absent);
        }

        // ── Permisos (ausencia autorizada) ──────────────────────────────
        // Empleados con permiso hoy: la regla del día (override/horario base) o
        // el status del registro lo marcan como 'permiso'.
        if ((report.permissions?.length || 0) > 0) {
            drawSectionTitle(doc, 'Permisos', report.permissions.length, COLORS.ok);
            drawTable(doc, [
                { key: 'name', label: 'Empleado', width: 120 },
                { key: 'dni', label: 'DNI', width: 70 },
                { key: 'department', label: 'Departamento', width: 90 },
                { key: 'shift', label: 'Turno', width: 50, align: 'center' },
                { key: 'sourceShort', label: 'Horario', width: 55, align: 'center' },
                { key: 'note', label: 'Observación', width: 130 }
            ], report.permissions.map(r => ({
                ...r,
                sourceShort: sourceLabel(r.scheduleSource)
            })), COLORS.ok);
        }

        // ── Días extra (franco trabajado) ───────────────────────────────
        // Empleados que marcaron en un día que no les correspondía trabajar.
        if ((report.extraDays?.length || 0) > 0) {
            drawSectionTitle(doc, 'Días extra · franco trabajado', report.extraDays.length, COLORS.extra);
            drawTable(doc, [
                { key: 'name', label: 'Empleado', width: 120 },
                { key: 'dni', label: 'DNI', width: 70 },
                { key: 'department', label: 'Departamento', width: 85 },
                { key: 'shift', label: 'Turno', width: 55, align: 'center' },
                { key: 'startTime', label: 'Entrada', width: 55, align: 'center' },
                { key: 'checkIn', label: 'Marcó', width: 60, align: 'center' },
                { key: 'statusLabel', label: 'Estado', width: 70, align: 'center' }
            ], report.extraDays.map(r => ({
                ...r,
                statusLabel: r.status === 'franco-trabajado' ? 'Franco trab.' : (r.status || '—')
            })), COLORS.extra);
        }

        // ── Pendientes (turno aún no inicia) ────────────────────────────
        if (report.pending.length > 0) {
            drawSectionTitle(doc, 'Turno aún no inicia', report.pending.length, COLORS.pending);
            drawTable(doc, [
                { key: 'name', label: 'Empleado', width: 150 },
                { key: 'dni', label: 'DNI', width: 60 },
                { key: 'department', label: 'Departamento', width: 105 },
                { key: 'shift', label: 'Turno', width: 60, align: 'center' },
                { key: 'startTime', label: 'Entrada', width: 60, align: 'center' },
                { key: 'endTime', label: 'Salida', width: 60, align: 'center' }
            ], report.pending, COLORS.pending);
        }

        // ── Sin horario configurado (alerta administrativa) ─────────────
        if (report.noSchedule.length > 0) {
            drawSectionTitle(doc, 'Sin horario configurado', report.noSchedule.length, COLORS.muted);
            drawTable(doc, [
                { key: 'name', label: 'Empleado', width: 160 },
                { key: 'dni', label: 'DNI', width: 65 },
                { key: 'department', label: 'Departamento', width: 120 },
                { key: 'reason', label: 'Observación', width: 170 }
            ], report.noSchedule, COLORS.muted);
        }

        // ── Pie de página con numeración ────────────────────────────────
        // Debe escribirse DENTRO del área útil (antes de height - margin) y
        // con lineBreak:false; si no, pdfkit agrega una página en blanco.
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            doc.fill(COLORS.muted).font('Helvetica').fontSize(7.5)
                .text(
                    `Jarvis365 · Corte de asistencia · Página ${i + 1} de ${range.count}`,
                    PAGE.margin,
                    PAGE.height - PAGE.margin - 12,
                    { width: CONTENT_WIDTH, align: 'center', lineBreak: false }
                );
        }

        doc.end();
    });
}
