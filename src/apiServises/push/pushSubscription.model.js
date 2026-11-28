import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════════
// SUSCRIPCIONES A WEB PUSH — un navegador que aceptó recibir avisos
// ══════════════════════════════════════════════════════════════════════
// Cada vez que alguien activa los avisos en una app (hoy, insights365), su
// navegador le da al servicio de push del fabricante (Google, Mozilla, Apple)
// una dirección propia (`endpoint`) y dos claves para cifrar lo que se le
// mande. Se guardan acá, a nombre de quien tenía la sesión.
//
// Un mismo navegador es UNA suscripción aunque entren varias personas: el
// `endpoint` es único y, si otra persona activa los avisos en ese navegador,
// la suscripción pasa a su nombre (la anterior deja de recibir ahí).
//
// Cuando el servicio de push contesta que la dirección ya no existe (404 o
// 410: se desinstaló la app, se borraron los datos del sitio), se borra.

const PushSubscriptionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    // De qué app es: los avisos de insights365 solo van a sus suscripciones
    app: { type: String, enum: ['insights365'], required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
    },
    // En qué idioma se le escribe ('es' | 'en'): el que tenía la app al activar
    lang: { type: String, enum: ['es', 'en'], default: 'es' },
    userAgent: { type: String, default: '' },
    lastSentAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('PushSubscription', PushSubscriptionSchema);
