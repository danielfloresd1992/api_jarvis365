import { Server } from 'socket.io';
import { ISocketAdapter } from '../interface/soketIo';

//type Event = 'document'

type DataByEnv = {
    doc: unknown,
    user: {
        idUser: string,
        nameUser: string
    }
}



class SocketAdapter implements ISocketAdapter {
    private io: Server;

    constructor(io: Server) {
        this.io = io;
    }

    emitToRoom(room: string, event: string, data: DataByEnv): void {
        try {
            console.log(data)
            this.io.to(room).emit(event, data);

          //  this.io.emit('lobby', data);
        } catch (error) {
            console.error('Error emitting event:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
}



export default SocketAdapter;