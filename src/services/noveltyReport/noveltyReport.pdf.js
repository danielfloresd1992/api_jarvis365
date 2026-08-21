import PDFDocument from 'pdfkit';

// ══════════════════════════════════════════════════════════════════════
// GENERADOR PDF: Conteo de novedades del día operativo
// ══════════════════════════════════════════════════════════════════════
// Recibe el objeto de buildNoveltyCountReport() y devuelve un Buffer con un
// PDF A4: cabecera (fecha, día, encargados de turno), tarjetas de resumen y
// una tabla por franquicia (local | total | positivas | negativas | ignoradas
// | enviadas). Misma paleta cálida que el reporte de asistencia.
//
// CÁMARAS CAÍDAS. Un local con el DVR caído lleva su hora en la fila y no se
// cuenta como omisión: no es que no reportara, es que no podía. Cuando hay
// alguno, arriba de las franquicias va la lista de cuáles y desde cuándo —es lo
// primero que se pregunta quien recibe el reporte por WhatsApp—.

const COLORS = {
    header: '#CC785C',
    accent: '#D97757',
    ok: '#7A8471',          // positivas
    bad: '#B4472F',         // negativas
    ignored: '#8A8780',     // ignoradas
    sent: '#9A7B4F',        // enviadas al grupo
    dvr: '#8C5A9E',         // sin conexión — morado, no compite con negativas
    text: '#141413',
    muted: '#73726C',
    cream: '#F0EEE6',
    page: '#FAF9F5',
    zebra: '#F0EEE6',
    line: '#E3E0D6',
    white: '#ffffff',
};

/** "3 h 25 min" a partir de minutos. Para el tiempo ciego. */
const formatDowntime = (minutes) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const horas = Math.floor(minutes / 60);
    const resto = minutes % 60;
    return resto ? `${horas} h ${resto} min` : `${horas} h`;
};

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_W = PAGE.width - PAGE.margin * 2;

export function buildNoveltyReportPdf(report, cutLabel) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: false });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const paintBackground = () => doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.page);
        doc.on('pageAdded', paintBackground);
        paintBackground();

        // Salta de página si no queda espacio suficiente
        const ensureSpace = height => {
            if (doc.y + height > PAGE.height - PAGE.margin) doc.addPage();
        };

        // ── Cabecera ─────────────────────────────────────────────────────
        doc.rect(0, 0, PAGE.width, 6).fill(COLORS.header);
        doc.y = PAGE.margin;

        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(17)
            .text(report.isFinal ? 'REPORTE FINAL DE NOVEDADES' : 'REPORTE DE NOVEDADES', { align: 'left' });
        doc.moveDown(0.2);
        doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(11)
            .text(cutLabel);
        doc.moveDown(0.25);
        // Nota: Helvetica (WinAnsi) no tiene '→'; se sustituye por '»' solo en el PDF
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9.5)
            .text(`${report.weekdayLabel} ${report.dateLabel} · Día operativo ${report.windowLabel.replace(/→/g, '»')} (hora Caracas)`);
        doc.text(`Encargado turno diurno: ${report.onDuty.diurno ?? '—'}    ·    Encargado turno nocturno: ${report.onDuty.nocturno ?? '—'}`);
        doc.text(`Establecimientos en horario hoy: ${report.localsInSchedule} · Generado: ${report.generatedAtLabel}`);

        // El reparto en tres estados. Se dice acá arriba porque cambia cómo se
        // lee la tabla: sin esto, los locales en 0 por falta de cámaras se
        // confunden con los que no reportaron.
        if (report.status) {
            doc.text(`Reportaron: ${report.status.reportaron} · Sin reportar: ${report.status.sinReportar} · Sin conexion: ${report.status.sinConexion}`);
        }
        doc.moveDown(0.8);

        // ── Tarjetas de resumen ──────────────────────────────────────────
        const cards = [
            { label: 'Total',     value: report.totals.total,     color: COLORS.text },
            { label: 'Positivas', value: report.totals.positivas, color: COLORS.ok },
            { label: 'Negativas', value: report.totals.negativas, color: COLORS.bad },
            { label: 'Ignoradas', value: report.totals.ignoradas, color: COLORS.ignored },
            { label: 'Enviadas',  value: report.totals.enviadas,  color: COLORS.sent },
            { label: 'Diurno',    value: report.totals.diurno,    color: COLORS.accent },
            { label: 'Nocturno',  value: report.totals.nocturno,  color: COLORS.header },
        ];
        const cardW = (CONTENT_W - 6 * 6) / 7;
        const cardY = doc.y;
        cards.forEach((card, i) => {
            const x = PAGE.margin + i * (cardW + 6);
            doc.roundedRect(x, cardY, cardW, 46, 6).fill(COLORS.cream);
            doc.fillColor(card.color).font('Helvetica-Bold').fontSize(15)
                .text(String(card.value), x, cardY + 8, { width: cardW, align: 'center' });
            doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
                .text(card.label, x, cardY + 29, { width: cardW, align: 'center' });
        });
        doc.y = cardY + 58;

        // ── Tabla por franquicia ─────────────────────────────────────────
        const col = {
            name:      { x: PAGE.margin,       w: CONTENT_W - 55 * 5 },
            total:     { x: PAGE.margin + CONTENT_W - 55 * 5, w: 55 },
            positivas: { x: PAGE.margin + CONTENT_W - 55 * 4, w: 55 },
            negativas: { x: PAGE.margin + CONTENT_W - 55 * 3, w: 55 },
            ignoradas: { x: PAGE.margin + CONTENT_W - 55 * 2, w: 55 },
            enviadas:  { x: PAGE.margin + CONTENT_W - 55 * 1, w: 55 },
        };

        const tableHeader = () => {
            const y = doc.y;
            doc.rect(PAGE.margin, y, CONTENT_W, 16).fill(COLORS.accent);
            doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8);
            doc.text('Establecimiento', col.name.x + 6, y + 4, { width: col.name.w - 8 });
            doc.text('Total',     col.total.x,     y + 4, { width: col.total.w,     align: 'center' });
            doc.text('Positivas', col.positivas.x, y + 4, { width: col.positivas.w, align: 'center' });
            doc.text('Negativas', col.negativas.x, y + 4, { width: col.negativas.w, align: 'center' });
            doc.text('Ignoradas', col.ignoradas.x, y + 4, { width: col.ignoradas.w, align: 'center' });
            doc.text('Enviadas',  col.enviadas.x,  y + 4, { width: col.enviadas.w,  align: 'center' });
            doc.y = y + 18;
        };

        const row = (label, counts, { bold = false, zebra = false } = {}) => {
            ensureSpace(16);
            const y = doc.y;
            if (zebra) doc.rect(PAGE.margin, y - 1, CONTENT_W, 14).fill(COLORS.zebra);
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);

            // ── El nombre, y a su lado la falla de conexión ───────────
            // Va pegado al nombre y no en una columna aparte porque solo lo
            // lleva un puñado de filas: una columna vacía en todas las demás
            // gastaría ancho en decir "no pasó nada".
            const dvr = counts.dvr;
            doc.fillColor(COLORS.text).text(label, col.name.x + 6, y + 2, {
                width: col.name.w - 8,
                ellipsis: true,
                height: 12,
                continued: Boolean(dvr?.down || dvr?.episodes),
            });

            if (dvr?.down) {
                // Sigue caído: lo que importa es desde cuándo.
                doc.fillColor(COLORS.dvr).font('Helvetica-Bold')
                    .text(`  SIN CONEXION desde ${dvr.failedAtLabel}`, { continued: false });
            }
            else if (dvr?.episodes) {
                // Volvió: se dice cuánto estuvo ciego, que es lo que explica un
                // conteo bajo sin que el local quede señalado.
                doc.fillColor(COLORS.muted).font('Helvetica')
                    .text(`  (sin conexion ${formatDowntime(dvr.downtimeMinutes)})`, { continued: false });
            }

            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
            doc.fillColor(COLORS.text).text(String(counts.total),        col.total.x,     y + 2, { width: col.total.w,     align: 'center' });
            doc.fillColor(COLORS.ok).text(String(counts.positivas),      col.positivas.x, y + 2, { width: col.positivas.w, align: 'center' });
            doc.fillColor(COLORS.bad).text(String(counts.negativas),     col.negativas.x, y + 2, { width: col.negativas.w, align: 'center' });
            doc.fillColor(COLORS.ignored).text(String(counts.ignoradas), col.ignoradas.x, y + 2, { width: col.ignoradas.w, align: 'center' });
            doc.fillColor(COLORS.sent).text(String(counts.enviadas),     col.enviadas.x,  y + 2, { width: col.enviadas.w,  align: 'center' });
            doc.y = y + 15;
        };

        // ── Los que están sin cámaras ────────────────────────────────────
        // Antes de las franquicias: es lo primero que pregunta quien recibe el
        // reporte, y buscarlo fila por fila entre cien establecimientos no es
        // razonable. Solo aparece cuando hay alguno.
        const caidos = report.dvr?.locals ?? [];
        if (caidos.length > 0) {
            ensureSpace(30 + caidos.length * 12);

            doc.fillColor(COLORS.dvr).font('Helvetica-Bold').fontSize(10.5)
                .text(`SIN CONEXION CON EL DVR  (${caidos.length})`, PAGE.margin, doc.y);
            doc.moveDown(0.15);

            doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
                .text('No cuentan como "sin reportar": no pueden monitorearse.', PAGE.margin, doc.y, { width: CONTENT_W });
            doc.moveDown(0.3);

            for (const local of caidos) {
                ensureSpace(12);
                const y = doc.y;
                doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8.5)
                    .text(`${local.name}`, PAGE.margin + 6, y, { width: CONTENT_W * 0.45, ellipsis: true, height: 11 });
                doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5)
                    .text(
                        `desde ${local.failedAtLabel}${local.downtimeMinutes ? ` · ${formatDowntime(local.downtimeMinutes)} sin camaras` : ''}${local.reportedByName ? ` · lo paso ${local.reportedByName}` : ''}`,
                        PAGE.margin + 6 + CONTENT_W * 0.45,
                        y,
                        { width: CONTENT_W * 0.55 - 6, ellipsis: true, height: 11 },
                    );
                doc.y = y + 12;
            }

            doc.moveDown(0.6);
        }

        if (report.franchises.length === 0) {
            doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10)
                .text('No hay establecimientos en horario de monitoreo para este día.', PAGE.margin, doc.y);
        }

        for (const franchise of report.franchises) {
            ensureSpace(52);
            // Título de la franquicia
            doc.fillColor(COLORS.header).font('Helvetica-Bold').fontSize(10.5)
                .text(franchise.name.toUpperCase(), PAGE.margin, doc.y + 4);
            doc.moveTo(PAGE.margin, doc.y + 2).lineTo(PAGE.margin + CONTENT_W, doc.y + 2)
                .strokeColor(COLORS.line).lineWidth(1).stroke();
            doc.y += 6;

            tableHeader();
            franchise.locals.forEach((local, i) => row(local.name, local, { zebra: i % 2 === 1 }));
            row(`Subtotal ${franchise.name}`, franchise.totals, { bold: true });
            doc.y += 8;
        }

        // ── Pie ──────────────────────────────────────────────────────────
        ensureSpace(24);
        doc.moveDown(0.5);
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
            .text('Positivas / negativas según validación; ignoradas = sin validar; enviadas = compartidas al grupo (Amazonas Activo). Los establecimientos sin conexión con el DVR no cuentan como "sin reportar". Generado automáticamente por Jarvis365.',
                PAGE.margin, doc.y, { width: CONTENT_W });

        doc.end();
    });
}