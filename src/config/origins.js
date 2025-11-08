const origins = process.env.NODE_ENV === 'development' ? 
[ 
    'https://72.68.60.201:5174',
    'http://72.68.60.201:5174',
    'https://192.168.1.104:5173', 
    'http://72.68.60.201:5173',
    'http://localhost:5174',
    'http://localhost:5173',
    'https://72.68.60.201:5173', 'https://72.68.60.201:3000', 'https://72.68.60.201:3005', 'https://amazona365.ddns.net:3000', 'https://localhost:3000' ] : [ 
    'https://72.68.60.201:5173',
    'https://192.168.1.102:3000',
    'https://72.68.60.201:3000',
    'https://72.68.60.201:3004',
    'https://localhost:3000',
    'http://72.68.60.201:3007',
    'https://72.68.60.254:455',
    'https://72.68.60.254:446',
    'https://72.68.60.254:4000',
    'https://localhost:4200',
    'http://localhost:4200',
    'https://amazona365.ddns.net:3000',
    'https://72.68.60.201:3005',
    'https://jarvis365.net:3005',
    'https://72.68.60.254:3005',
    'http://72.68.60.201:5173',
    'https://72.68.60.201:3000'
];



export default origins;