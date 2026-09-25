// Regla del retardo: la usan el marcaje (al guardar la entrada) y el corte diario.

// Minutos de tolerancia antes de contar la llegada como retardo.
export const LATE_GRACE_MINUTES = 8;

// Cada bloque de 20 min de retardo suma una unidad de descuento.
export const DISCOUNT_BLOCK_MINUTES = 20;


// Unidades a descontar por un retardo. Pasada la tolerancia, el primer tramo
// (de 8 a 20 min) ya cuenta 1 unidad y cada 20 min más suma otra. Ej. entrada 09:00:
//   hasta 09:08 → 0 · 09:09–09:20 → 1 · 09:21–09:40 → 2 · 09:41–10:00 → 3 …
// null (hora pautada desconocida) da 0.
export const computeDiscountUnits = (minutesLate) => {
    if (minutesLate === null || minutesLate <= LATE_GRACE_MINUTES) return 0;
    return Math.ceil(minutesLate / DISCOUNT_BLOCK_MINUTES);
};
