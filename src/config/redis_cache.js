import config from './index'


import { RedisStore } from 'connect-redis'; 
import { createClient } from 'redis'; // Crear cliente Redis 
 


async function connetRedis(){
    try{
        const redisClient = createClient({ url: config.REDIS_URL || 'redis://localhost:6379' }); 
        
        await redisClient.connect()
        
       
       
        const redisStore = new RedisStore({ 
           client: redisClient, 
           prefix: 'sess:', 
       });
       return redisStore
    }
    catch(error){
        return undefined
    }
}


export default connetRedis();