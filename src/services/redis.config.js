import { createClient } from 'redis';

const cache = createClient();


cache.on('error', err => console.log('Redis Client Error', err));

await cache.connect();

await cache.set('key', 'value');

const value = await cache.get('key');

console.log(value);
await client.disconnect();

export default cache;