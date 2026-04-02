const origins = process.env.NODE_ENV === 'development' ?
    ['http://localhost:5174', 'http://72.68.60.201:5174', 'http://72.68.60.201:5174', 'http://72.68.60.201:5173', 'http://localhost:5174', 'http://localhost:5173', 'https://72.68.60.201:5173', 'https://72.68.60.201:3000', 'https://72.68.60.201:3005', 'https://amazona365.ddns.net:3000', 'https://localhost:3000', 'http://72.68.60.201:3000']
    :
    [
        'https://72.68.60.201:3000',
        'https://localhost:3000',
       
        'https://localhost:5173',
        'http://localhost:3000',
        'http://72.68.60.201:5174',
        'http://72.68.60.201:3000',
   
        'http://72.68.60.201:5174',
        'http://localhost:5173',

        'https://localhost:3001',
        'https://72.68.60.201:3001',
        'https://biojarvis.netlify.app',
        'https://jarvis365.net',
        'https://jarvis365report.netlify.app',
        'https://jarvis365reporte.netlify.app',
        'https://jarvis365.netlify.app',
        'https://jarvis-express.netlify.app'
    ];




export default origins;