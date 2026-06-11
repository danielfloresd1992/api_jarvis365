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
    });
    cancelConfig.addEventListener("click", () =>{
        AlertaVentana.style.display = "none";
        blokPantalla.style.display = "none";
    });
    cerrarVentana.addEventListener("click", () =>{
        AlertaVentana.style.display = "none";
        blokPantalla.style.display = "none";
    });
}
