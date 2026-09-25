const origins = process.env.NODE_ENV === 'development' ?
    [
        'https://localhost:5173',
        "https://localhost:5174",
        "https://72.68.60.201:5174",
        'http://localhost:3000',
        'http://localhost:5180', 
        'http://72.68.60.201:5173', 
        'http://localhost:5174',
        'https://localhost:4008', 
        'http://72.68.60.201:5174', 
        'http://72.68.60.201:5174', 
        'http://72.68.60.201:5173', 
        'http://localhost:5174', 
        'http://localhost:5173', 
        'https://72.68.60.201:5173', 
        'https://72.68.60.201:3000', 
        'https://72.68.60.201:3005', 
        'https://amazona365.ddns.net:3000', 
        'https://localhost:3000', 
        'http://72.68.60.201:3000'
    ]
    :
    [
       
        'http://72.68.60.201:5173',
        // EL FRONT DE NOMINA (AZ-NMA), en el 3009. No usa el 5173 ni el 5174
        // porque en esa maquina los tienen Jarvis-express365 y reportes365.
        // Los dos en HTTPS porque su cookie de sesion es sameSite:'none', que
        // el navegador solo acepta sobre TLS. El puerto lo fija su vite.config,
        // y si cambia alli hay que cambiarlo aqui: el origen es host + puerto.
        'https://localhost:3009',
        'https://72.68.60.201:3009',
        'https://72.68.60.201:3000',
        'https://localhost:3000',
        'https://localhost:5173',
        'https://localhost:5173',
        'http://localhost:3000',
        'http://72.68.60.201:5174',
        'http://72.68.60.201:3000',
   
        'http://72.68.60.201:5174',
        "https://72.68.60.201:5174",
        'http://localhost:3000',
        'http://localhost:5173',
        'https://localhost:4008',
        'https://localhost:3001',
        'https://72.68.60.201:3001',
        'https://biojarvis.netlify.app',
        'https://jarvis365.net',
        'https://jarvis365report.netlify.app',
        'https://jarvis365reporte.netlify.app',
        'https://jarvis365.netlify.app',
        'https://jarvis-express.netlify.app',
        'https://client365.vercel.app',
          'http://localhost:5174',
    ];




export default origins;