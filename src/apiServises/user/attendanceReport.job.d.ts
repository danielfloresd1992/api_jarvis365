export function startAttendanceReportScheduler(): void;

export function runDailyAttendanceReport(options?: {
    cutLabel?: string;
    number?: string;
}): Promise<{
    cutLabel: string;
    date: string;
    totals: Record<string, number>;
    sentTo: string;
    filename: string;
    pdfSizeKB: number;
}>;

export function sendReportToWhatsapp(options: {
    pdfBuffer: Buffer;
    caption: string;
    filename: string;
    number?: string;
}): Promise<{ chatId: string; status: number }>;
