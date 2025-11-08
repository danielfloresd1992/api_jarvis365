
import { Server } from 'socket.io';



export interface ISocketAdapter {
    emitToRoom(room: string, event: string, data: unknown): void;
}


export interface ISocketAdapterConstructor {
    new (io: Server): ISocketAdapter;
}