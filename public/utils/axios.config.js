import https from 'https';
import axios from 'axios';


const agent = new https.Agent({
    rejectUnauthorized: false
});

const config = { httpsAgent: agent };



const axiosInstance = axios.create(config);

// Configurar el interceptor de respuestas


export default axiosInstance;