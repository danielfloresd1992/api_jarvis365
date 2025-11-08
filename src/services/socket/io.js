import express from 'express';
const app = express();
import Cache_Jarvis from '../cache/cache.js';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { Server } from "socket.io";
import { join } from 'path';
import { config } from 'dotenv';


import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const cacheFailedConcnection = new Cache_Jarvis();

config({ path: join(__dirname, '../../../.env') });



const SOCKET_PORT = process.env.NODE_ENV === 'development' ? process.env.DEV_SOCKET_PORT : process.env.PROD_SOCKET_PORT;


const httpsServer = createServer({
    key: readFileSync(join(__dirname, '../../../cert/socket/private455.key')),
    cert: readFileSync(join(__dirname, '../../../cert/socket/amazona365_ddns_net.crt')),
    requestCert: false,
    rejectUnauthorized: false,
}, app);



const io = new Server(httpsServer, {
    cors: {
        origin: '*'
    }
});


io.on('connection', (socket) => {

    socket.on('init', (message) => {
        console.log(message);
    });

    socket.join('lobby');
    

    socket.on('updatePublisher', data => {
        console.log(data);
        io.emit('reciveUpdatePublisher', data);
    });

    socket.on('deletedPublisher', data => {
        io.emit('reciveDeletePublisher', data);
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

    socket.on('close-user-connection', data => {
        io.emit('close-user-repost-express', data);
    });
 
    socket.on('update-user-repost-express', userId => {
        io.emit('update-user-client-express', userId);
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


    socket.on('receive-failure', data => {

        if(!cacheFailedConcnection.setItem(`${data.idLocal}-${data.localName}`)){
            const dataLocal = {
                nameItem: `${data.idLocal}-${data.localName}`,
                ...data
            };
            
            cacheFailedConcnection.setItem(dataLocal.nameItem, data);
            io.emit('failed-connection', dataLocal);
        }
    });


    socket.on('receive-reconnection', data => {
        cacheFailedConcnection.deleteItem(`${data.idLocal}-${data.localName}`);
    });


    socket.on('from-failed-connection', msm => {
       
        io.emit('check-failed-connection' , cacheFailedConcnection.getCacheArray());
    });


    //jarvis365reporte
    socket.on('jarvis365reporte-alert-emit', msm => {
        io.emit('jarvis365reporte-alert-receive' , msm);
    });


    

});


httpsServer.listen(SOCKET_PORT, () => {
    console.log('\n');
    console.log(`sockeds listening on mode: ${process.env.NODE_ENV}`.bgGreen);
});



export { io };