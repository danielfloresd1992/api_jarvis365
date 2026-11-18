// oneAtATime = «hacer `work` cuando termine lo anterior con la misma `key`».
// Lo de una misma clave se atiende en fila; lo de claves distintas, no se espera.
// Lo usan el marcaje (dos marcajes de la misma persona a la vez: el segundo ve el
// primero) y los terminales biométricos (una lectura o copia de huellas por
// equipo a la vez). `queues` es un Map key → promesa de lo último en curso.
export function oneAtATime(queues, key, work) {
    const run = (queues.get(key) ?? Promise.resolve()).then(work);
    const settled = run.then(() => undefined, () => undefined);
    queues.set(key, settled);
    settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
    return run;
}
