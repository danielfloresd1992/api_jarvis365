'use client';
import { io } from 'socket.io-client';

const IP = process.env.NODE_ENV === 'development' ? 'https://72.68.60.201:3007' : `wss://72.68.60.254:455` ;
const socket = io(IP, { 
    secure: true,
    rejectUnauthorized: false, 
});     


socket.on('connect', () => {
    console.log('Io is connect');
});


socket.on('connect_error', error => {
    console.log(error);
});


socket.on('error', error => {
    console.log(error);
});


export default socket;