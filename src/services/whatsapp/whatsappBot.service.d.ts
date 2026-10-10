// Tipos de whatsappBot.service.js para los consumidores en TypeScript.
// Solo `declare`: Babel compila este archivo y así no emite código.

export declare const BOT_URL: string;
export declare const REPORT_NUMBER: string;

export declare function toChatId(number: string): string;

export type WhatsappSendResult = {
    chatId: string | null;
    recipients: string[];
    count: number;
    failed: { chatId: string; error: string }[];
};

export declare function sendMediaToWhatsapp(options: {
    buffer: Buffer;
    mimeType: string;
    caption?: string;
    filename?: string;
    number?: string;
    listNumber?: string[];
}): Promise<WhatsappSendResult>;

export declare function sendReportToWhatsapp(options: {
    pdfBuffer: Buffer;
    caption: string;
    filename: string;
    number?: string;
    listNumber?: string[];
}): Promise<WhatsappSendResult>;

export declare function sendTextToWhatsapp(options: {
    text: string;
    number?: string;
    listNumber?: string[];
}): Promise<WhatsappSendResult>;
