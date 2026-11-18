import express from 'express';
const app = express();
import { Server as HttpServer } from 'http'

import { Server, Socket } from "socket.io";
import { JOIN_KIOSK_EVENT, kioskRoomOf, joinedTerminalOf } from '../../apiServises/biometric/biometricStream.lib.js';



class SocketManager {

    private static instance: SocketManager
    private io: Server | null = null

    // Cómo está la escucha de un terminal biométrico: el kiosco lo pregunta al
    // entrar a su sala. La escucha lo registra al arrancar
    // (biometricListener.js); así este módulo no tiene que importarla a ella.
    private kioskStatusProvider: (terminal: string) => unknown = () => null


    private constructor() {

    }


    static getInstance(): SocketManager {
        if (!SocketManager.instance) {
            SocketManager.instance = new SocketManager()
        }
        return SocketManager.instance
    }


    init(server: HttpServer) {
        try {


            this.io = new Server(server, {
                cors: {
                    origin: "*",
                }
            });

            const io = this.io;

            io.on('connection', (socket) => {

                socket.on('init', (message) => {
                    console.log(message);
                });

                socket.join('lobby');


                // ── Salas de notificación ─────────────────────────────
                // El cliente se identifica al conectarse y entra a su propia
                // sala (y a la de administradores si lo es).
                //
                // Sin esto, una notificación PERSONAL habría que emitirla a
                // todos y esconderla en el front: eso no la hace privada, solo
                // invisible. Con la sala, el contenido solo viaja a quien le
                // corresponde.
                socket.on('join-user', (payload) => {
                    const userId = typeof payload === 'string' ? payload : payload?.userId;
                    if (userId) socket.join(`user:${userId}`);
                    if (payload?.admin === true) socket.join('admins');
                });

                // Al cerrar sesión sin recargar, el socket sigue vivo: hay que
                // sacarlo de sus salas o seguiría recibiendo lo del usuario
                // anterior.
                socket.on('leave-user', (payload) => {
                    const userId = typeof payload === 'string' ? payload : payload?.userId;
                    if (userId) socket.leave(`user:${userId}`);
                    socket.leave('admins');
                });

                // ── Kiosco de marcaje (bioJarvis) ─────────────────────
                // El kiosco entra a la sala de SU terminal para recibir sus
                // huellas con la cédula de quien marcó (ver
                // apiServises/biometric/biometricListener.js). Así la cédula
                // no viaja a todos los clientes, ni la huella de una oficina
                // al kiosco de otra. Como el resto de las salas, la entrada no
                // se autentica.
                //
                // Llega ({ terminal }, ack). Los kioscos de antes mandan solo
                // (ack), o nada: entran a la sala del terminal principal.
                socket.on(JOIN_KIOSK_EVENT, (payload?: unknown, ack?: unknown) => {
                    const callback = typeof payload === 'function' ? payload : ack;
                    const terminal = joinedTerminalOf(typeof payload === 'function' ? null : payload);
                    socket.join(kioskRoomOf(terminal));
                    if (typeof callback === 'function') callback(this.kioskStatusProvider(terminal));
                });



                socket.on('user-connection', data => {
                    io.emit('open-user-express', data);
                });

                socket.on('close-userClientAppManager', data => {
                    io.emit('receivesclose-userClientAppManager', data);
                });

                socket.on('recive-reload-client-appmanager', data => {
                    io.emit('reload-client-appmanager', data);
                });




                socket.on('update-user-app-manager', user => {
                    io.emit('update-user-client-manager', user);
                });


                ////////////////////////////////////  nuevo canal de obtener clientes en app-manager

                socket.on('get-ask-user', data => {
                    io.emit('set-ask-user', data);
                });


                socket.on('send-ask-user', data => {
                    io.emit('return-ask-user', data);
                });
                //////////////////////////////////////////;



                //jarvis365reporte
                socket.on('jarvis365reporte-alert-emit', msm => {
                    io.emit('jarvis365reporte-alert-receive', msm);
                });


            });
            console.log('Socket.IO inicializado correctamente.'.green);
        }
        catch (error) {
            console.log('Error al inicializar Socket.IO:', error);
        }
    }


    emit(event: string, data: any): void {
        if (this.io) {
            this.io.emit(event, data);
        }
        else {
            console.error('Socket.IO no está inicializado. No se pueden emitir eventos.');
        }
    }

    setKioskStatusProvider(provider: (terminal: string) => unknown): void {
        this.kioskStatusProvider = provider;
    }

    emitToRoom(room: string, event: string, data: any): void {
        if (this.io) {
            this.io.to(room).emit(event, data);
        }
        else {
            console.error('Socket.IO no está inicializado. No se pueden emitir eventos.');
        }
    }

}


const io = SocketManager.getInstance();

export { io }