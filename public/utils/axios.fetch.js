import axios from 'axios';
import https from 'https';


const agent = new https.Agent({
    rejectUnauthorized: false
});


const config = { withCredentials: true, httpsAgent: agent };


const axiosStand = axios.create(config);

export default axiosStand;