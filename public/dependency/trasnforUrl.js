
export default function tranUrlToLocal(url){
    try {
        if(!url) return null;
        if(url.indexOf('https://amazona365.ddns.net') < 0) return url;

        let dns = '';
        const hostname = window.location.hostname;
        if(hostname === '72.68.60.254'){
            dns = `https://72.68.60.254${url.split('https://amazona365.ddns.net')[1]}`;
        }
        else if(hostname === '72.68.60.201' || hostname === 'localhost'){
            const indexNameApi = url.indexOf('/api_jarvis_dev/v1')
            if(indexNameApi < 0) dns = `https://72.68.60.201:3006/api_jarvis_dev/v1${url.split('https://amazona365.ddns.net:3006')[1]}`;
            else dns = `https://72.68.60.201:3006${url.split('https://amazona365.ddns.net:3006')[1]}`;
        }    
        else{
            dns = url;
        }
        return dns;
    } 
    catch (error) {
        console.log(error);    
    }
}