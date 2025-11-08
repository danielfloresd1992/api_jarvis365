import { parentPort, workerData } from 'worker_threads';

let result = Array.from(workerData).map(item => item[1]);

parentPort.postMessage(result);