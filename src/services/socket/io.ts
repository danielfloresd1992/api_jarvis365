import express from 'express';
const app = express();
import { Server as HttpServer } from 'http'

import { Server, Socket } from "socket.io";



class SocketManager {

    private static instance: SocketManager
    private io: Server | null = null


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