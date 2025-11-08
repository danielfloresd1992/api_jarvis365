import express from 'express';
const app = express();
import cache from './redis.config.js';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { Server } from "socket.io";
import path from 'path';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));


console.log(cache);

const httpsServer = createServer({
    key: readFileSync(path.join(__dirname, './cert/clave.key')),
    cert: readFileSync(path.join(__dirname, './cert/certificado.crt')),
    requestCert: false,
    rejectUnauthorized: false,
}, app);


const io = new Server(httpsServer, {
    cors: {
        origin: 'https://72.68.60.254:446',
        methods: ['GET', 'POST']
    }
});


io.use();


io.on('connection', (socket) => {

    socket.on('init', (message) => {
        console.log(message);
    });
/*
    socket.on('disconnect', (reason) => {
        console.log(reason);
        if (reason === 'transport close') {
            console.log('El usuario se ha desconectado de forma involuntaria');
          // Aquí puedes realizar las acciones necesarias para manejar la desconexión involuntaria
        } 
        else {
            console.log('El usuario se ha desconectado de forma voluntaria');
          // Aquí puedes realizar las acciones necesarias para manejar la desconexión voluntaria
        }
      });
*/
    socket.on('updatePublisher', data => {
        io.emit('receiveUpdatePublisher', data);
        
    });



    socket.on('user-connection', data => {
        console.log(data);
        io.emit('open-user-express', data);
    });

    socket.on('close-user-connection', data => {
        io.emit('close-user-repost-express', data);
    });
 
    socket.on('update-user-repost-express', userId => {
        console.log(userId);
        io.emit('update-user-client-express', userId);
    });

});


io.on('connect_error', err => {
    console.log(err);
});


httpsServer.listen(455, () => {
    console.log('socked listening on: 455');
});

export { 
    io
};