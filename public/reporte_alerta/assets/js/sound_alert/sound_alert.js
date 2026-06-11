function rePlay(number){
    return new Promise(function(resolve, reject) {
    let ruta = ['/reporte_alerta/assets/sound/inicio.wav', '/reporte_alerta/assets/sound/notificaciones1.mp3', '/reporte_alerta/assets/sound/notificaciones2.mp3', '/reporte_alerta/assets/sound/inicio.mp3'];
    const music = new Audio(ruta[number]);
    music.media = true;
    music.preload = "auto";                      // intend to play through
    music.autoplay = true;                       // autoplay when loaded
    music.onerror = reject;                      // on error, reject
    music.onended = resolve;  
    music.playbackRate = 1;
    music.play();
    });
} 

const newKeyPLay = keyPlay();
function keyPlay(){
    let keyPlay = true;
    function playOne(){
        if(keyPlay){
            rePlay(1).then(()=>{});
            return keyPlay = false;
        }
    }
    setInterval(()=>{
        keyPlay = true;
    }, 20000);
    return playOne
}

export {
    rePlay,
    newKeyPLay
}