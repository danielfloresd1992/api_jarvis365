// Tipos de attendanceReport.job.js para los consumidores en TypeScript.
// Solo `declare` y `export type`: Babel compila este archivo y así no emite código.

export declare function startAttendanceReportScheduler(): void;

export declare function runDailyAttendanceReport(options?: {
    cutLabel?: string;
    number?: string;
    shiftFocus?: 'Diurno' | 'Nocturno';
}): Promise<{
    cutLabel: string;
    shiftFocus: 'Diurno' | 'Nocturno' | null;
    date: string;
    totals: Record<string, number>;
    faultsRegistered: number;
    faultsSkipped: number;
    faultsFailed: number;
    sentTo: string | null;
    recipients: number;
    filename: string;
    pdfSizeKB: number;
}>;

export declare function catchUpMissedFaults(): Promise<{ cut: string; shift: string; registered: number }[]>;

// Reexportados desde services/whatsapp/whatsappBot.service.js.
export declare const sendMediaToWhatsapp: typeof import('../../../services/whatsapp/whatsappBot.service.js').sendMediaToWhatsapp;
export declare const sendReportToWhatsapp: typeof import('../../../services/whatsapp/whatsappBot.service.js').sendReportToWhatsapp;
export declare const sendTextToWhatsapp: typeof import('../../../services/whatsapp/whatsappBot.service.js').sendTextToWhatsapp;
