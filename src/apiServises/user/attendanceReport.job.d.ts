export function startAttendanceReportScheduler(): void;

export function runDailyAttendanceReport(options?: {
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

export function sendReportToWhatsapp(options: {
    pdfBuffer: Buffer;
    caption: string;
    filename: string;
    number?: string;
    listNumber?: string[];
}): Promise<{ chatId: string | null; recipients: string[]; count: number }>;
