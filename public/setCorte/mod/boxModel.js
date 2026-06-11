function alerta(h,p){
    const blokPantalla = document.getElementById("bloqueo-pantalla");
    const mensaje_Alerta = document.getElementById("tipo-mensaje");
    const descripcion_Alerta = document.getElementById("descripcion-mensaje");
    const AlertaVentana = document.getElementById("ventana-emergente");
    const cerrarVentana = document.getElementById("exit");
    AlertaVentana.style.display = "block";
    blokPantalla.style.display = "block";
    mensaje_Alerta.textContent = h;
    descripcion_Alerta.textContent = p;
    cerrarVentana.addEventListener("click", () =>{
        AlertaVentana.style.display = "none";
        blokPantalla.style.display = "none";
    });
}

function prontAlerta(h,p){
    const blokPantalla = document.getElementById("bloqueo-pantalla2");
    const mensaje_Alerta = document.getElementById("tipo-mensaje2");
    const descripcion_Alerta = document.getElementById("descripcion-mensaje2");
    const AlertaVentana = document.getElementById("ventana-emergente2");
    const cerrarVentana = document.getElementById("exit2");
    const confirtReset = document.getElementById("confirt");
    const cancelConfig = document.getElementById("cancel-config");
    AlertaVentana.style.display = "block";
    blokPantalla.style.display = "block";
    mensaje_Alerta.textContent = h;
    descripcion_Alerta.textContent = p;
    confirtReset.addEventListener("click", () =>{
        AlertaVentana.style.display = "none";
        blokPantalla.style.display = "none";
        sendMjs(ojcMsm);
    });
    cancelConfig.addEventListener("click", () =>{
        AlertaVentana.style.display = "none";
        blokPantalla.style.display = "none";
        ojcMsm = null;
    });
    cerrarVentana.addEventListener("click", () =>{
        AlertaVentana.style.display = "none";
        blokPantalla.style.display = "none";
        ojcMsm = null;
    });
}

function sendMjs(ojc){
    const Month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun','Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const date = new Date();
    let day = date.getDate();
    let month = date.getMonth();
    let year = date.getFullYear();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    let time = 'Diurno';
    if(hour >= 17) time = 'Nocturno'
    if(day < 10) day = '0' + day;
    if(hour < 10) hour = '0' + hour;
    if(minute < 10) minute = '0' + minute;
    if(second < 10) second = '0' + second;
    let dln;
    let version = '3.0.0';
    if(navigator.userAgent.match(/Android/i)){
        dln = '\n'
    }
    else{
        dln = '%0A';
    }
    let corte2 = `*_Compartido por AppManager_*⚙️ Versión ${version} ${dln} ${dln}Corte de rotaciones y procesos por hora⏰ ${dln}Turno: ${time} ${dln}Fecha: ${day}-${Month[month]}-${year} ${dln}Hora: ${hour}:${minute}:${second} ${dln} ${dln}`;
    const emo = [ '🔴', '🟠', '🟡' , '🟢', '🔵','🟣' ,'⚫', '🟤', '♠️', '♦️', '♥️'];
    let a;
    ojc.forEach(element => {
        if(element.Rotaciones !== 'Inactivo'){
            corte2 += `${emo[Math.round(Math.random()*10)]} ${element.Local} ${dln}`;
            if(element.Local === 'LF'){
                a = 'Sommelier'
            }
            
            else if(element.Local === 'FDV'){
                a = 'G5';
            }
            else{
                a = 'A1'
            }
            corte2 += `Rotaciones: ${element.Rotaciones} ${dln}`;
            corte2 += `Procesos: ${element.Procesos} ${dln}`;
            if(element.G1 !== "N/A"){
                corte2 += `G1: ${element.G1} ${dln}`;
            }
            if(element.G2 !== "N/A"){
                corte2 += `G2: ${element.G2} ${dln}`;
            }
            if(element.G3 !== "N/A"){
                corte2 += `G3: ${element.G3} ${dln}`;
            }
            if(element.G4 !== "N/A"){
                corte2 += `G4: ${element.G4} ${dln}`;
            }
            if(element.A1 !== "N/A"){
                corte2 += `${a}: ${element.A1} ${dln}`;
            }
            if(element.A2 !== "N/A"){
                corte2 += `A2: ${element.A2} ${dln}`;
            }
            if(element.A3 !== "N/A"){
                corte2 += `A3: ${element.A3} ${dln}`;
            }
            if(element.A4 !== "N/A"){
                corte2 += `A4: ${element.A4} ${dln}`;
            }
            corte2 += `${dln}`;
        }
    });
    if(navigator.userAgent.match(/Windows NT 10.0/i) || navigator.userAgent.match(/Windows NT 6.1/i)){
        //const url2  = 'https://chat.whatsapp.com/JEgRvdX2uv65bN4ubW3DqR';
        const url = `https://api.whatsapp.com/send?phone=&text=${corte2}`;
        window.open(url);
    }
    else if(navigator.userAgent.match(/Android/i)){
        let url = "whatsapp://send?text="+encodeURIComponent(corte2)+"&phone=";
        window.open(url);
    }
    else if(navigator.userAgent.match(/(iPhone|iPad|iPod)/i)){
        let url = `https://wa.me/?text=${corte2}`;
        window.open(url);
    }
    else{
        alerta('¡Error!','Su versión del sistema operativo no es compatible con esta función');
    }
}