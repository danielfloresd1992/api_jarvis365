
const btnTeam = document.getElementById("btnTeam");
const btn = document.getElementById("btn-container");
const btn2 = document.getElementById("btn-container2");
const header = document.getElementById("header");
const cell = document.getElementById("buttons");
const buttons = document.getElementById("operator-1"); // div con botones
const textStarts = document.getElementById("starts"); //  cell statrs
const textEnd = document.getElementById("end"); // cell end
const mensText = document.getElementById("mens-Text"); // cell durations
const countText = document.getElementById("text"); // alert header
let keyCount;
const buttons2 = document.getElementById("operator-2"); // div con botones
const textStarts2 = document.getElementById("starts-2");
const textEnd2 = document.getElementById("end-2");
const countText2 = document.getElementById("text-2"); // alert header
let keyCount2;
const buttons3 = document.getElementById("operator-3"); // div con botones
const textStarts3 = document.getElementById("starts-3");
const textEnd3 = document.getElementById("end-3");
const countText3 = document.getElementById("text-3"); // alert header
let keyCount3;
const buttons4 = document.getElementById("operator-4"); // div con botones
const textStarts4 = document.getElementById("starts-4");
const textEnd4 = document.getElementById("end-4");
const countText4 = document.getElementById("text-4"); // alert header
let keyCount4;
const buttons5 = document.getElementById("operator-5"); // div con botones
const textStarts5 = document.getElementById("starts-5");
const textEnd5 = document.getElementById("end-5");
const countText5 = document.getElementById("text-5"); // alert header
let keyCount5;
const buttons6 = document.getElementById("operator-6"); // div con botones
const textStarts6 = document.getElementById("starts-6");
const textEnd6 = document.getElementById("end-6");
const countText6 = document.getElementById("text-6"); // alert header
let keyCount6;
const buttons7 = document.getElementById("operator-7"); // div con botones
const textStarts7 = document.getElementById("starts-7");
const textEnd7 = document.getElementById("end-7");
const countText7 = document.getElementById("text-7"); // alert header
let keyCount7;
const buttons8 = document.getElementById("operator-8"); // div con botones
const textStarts8 = document.getElementById("starts-8");
const textEnd8 = document.getElementById("end-8");
const countText8 = document.getElementById("text-8"); // alert header
let keyCount8;
const buttons9 = document.getElementById("operator-9"); // div con botones
const textStarts9 = document.getElementById("starts-9");
const textEnd9 = document.getElementById("end-9");
const countText9 = document.getElementById("text-9"); // alert header
let keyCount9;
const buttons10 = document.getElementById("operator-10"); // div con botones
const textStarts10 = document.getElementById("starts-10");
const textEnd10 = document.getElementById("end-10");
const countText10 = document.getElementById("text-10"); // alert header
let keyCount10;
const buttons11 = document.getElementById("operator-11"); // div con botones
const textStarts11 = document.getElementById("starts-11");
const textEnd11 = document.getElementById("end-11");
const countText11 = document.getElementById("text-11"); // alert header
let keyCount11;
const btnStot1 = document.getElementById("btn1-1");
const btnStot2 = document.getElementById("btn1-2");
const btnStot3 = document.getElementById("btn1-3");
const btnStot4 = document.getElementById("btn1-4");
const btnStot5 = document.getElementById("btn1-5");
const btnStot6 = document.getElementById("btn1-6");
const btnStot7 = document.getElementById("btn1-7");
const btnStot8 = document.getElementById("btn1-8");
const btnStot9 = document.getElementById("btn1-9");
const btnStot10 = document.getElementById("btn1-10");
const btnStot11 = document.getElementById("btn1-11");

btn.addEventListener("click", e => {
    switch (e.target.className) {
        case "btn-1":
            countKey(e,textStarts, textEnd, countText, buttons ,btnStot1);
            
        break;
        case "btn-2":
            countKey(e,textStarts2, textEnd2, countText2, buttons2 ,btnStot2);
        break;
        case "btn-3":
            countKey(e,textStarts3, textEnd3, countText3, buttons3 ,btnStot3);
            break;
        case "btn-4":
            countKey(e,textStarts4, textEnd4, countText4, buttons4 ,btnStot4);
            break;
        case "btn-5":
            countKey(e,textStarts5, textEnd5, countText5, buttons5 ,btnStot5);
        break;
        case "btn-6":
            countKey(e,textStarts6, textEnd6, countText6, buttons6 ,btnStot6);
        break;
        case "btn-7":
            countKey(e,textStarts7, textEnd7, countText7, buttons7 ,btnStot7);
        break;
        case "btn-8":
            countKey(e,textStarts8, textEnd8, countText8, buttons8 ,btnStot8);
        break;
        case "btn-9":
            countKey(e,textStarts9, textEnd9, countText9, buttons9 ,btnStot9);
        break;
        case "btn-10":
            countKey(e,textStarts10, textEnd10, countText10, buttons10 ,btnStot10);
        break;
        case "btn-11":
            countKey(e,textStarts11, textEnd11, countText11, buttons11 ,btnStot11);
        break;
    }
});
//focus
cell.addEventListener("focus", e => {
    e.preventDefault();
    e.stopPropagation();
    const element = e.target;
    if(element.className === "operator"){
        focusElement(element,textEnd, countText);
    }
    if(element.className === "operator2"){
        focusElement(element, textEnd2,countText2);
    }
    if(element.className === "operator3"){
        focusElement(element,textEnd3,countText3);
    }
    if(element.className === "operator4"){
        focusElement(element,textEnd4,countText4);
    }
    if(element.className === "operator5"){
        focusElement(element,textEnd5,countText5);
    }
    if(element.className === "operator6"){
        focusElement(element,textEnd6,countText6);
    }
    if(element.className === "operator7"){
        focusElement(element,textEnd7,countText7);
    }
    if(element.className === "operator8"){
        focusElement(element,textEnd8,countText8);
    }
    if(element.className === "operator9"){
        focusElement(element,textEnd9,countText9);
    }
    if(element.className === "operator10"){
        focusElement(element,textEnd10,countText10);
    }
    if(element.className === "operator11"){
        focusElement(element,textEnd11,countText11);
    }
}, true);
//funcion postFocus
function focusElement(element,textEnd,element2){
    if(element.textContent === 'Operador') element.textContent = "";
    element.addEventListener("keyup", innerKey, true);
    element.classList.add("active");
    element2.classList.remove("active");

    if(textEnd.textContent !== "00:00:00") textEnd.textContent = "00:00:00"
}
//blur
cell.addEventListener("blur", e => {
    e.preventDefault();
    e.stopPropagation();
    const element = e.target;
    if(element.className === "operator active"){
        blurElement(element);
        countText.classList.remove("active");
    }
    if(element.className === "operator2 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator3 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator4 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator5 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator6 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator7 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator8 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator9 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator10 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
    if(element.className === "operator11 active"){
        countText2.classList.remove("active");
        blurElement(element)
    }
},true);
//funcion postBlur
function blurElement(element){
    element.classList.remove("active");
}
//funcion de caracteres
function innerKey(e){
    e.preventDefault();
    const element = e.target;
    console.log(e.target.className)
    switch (e.key) {
        case "Escape": ;break;
        case "Delete": ;break;
        case "Enter": ;break;
        case "Dead": ;break;
        case "Tab": ;break;
        case "ArrowUp": ;break;
        case "ArrowDown": ;break;
        case "ArrowLeft": ;break;
        case "End": ;break;
        case "Insert": ;break;
        case "PageDown": ;break;
        case "PageUp": ;break;
        case "Home": ;break;
        case "ArrowRight":break
        case "Backspace": deletChart(element);break;
        case "Shift": ;break;
        case "Alt":break;
        case "Control":break;
        case "-": ;break;
        case "+": ;break;
        case "/": ;break;
        case "*": ;break;
        case "NumLock": ;break;
        case "CapsLock": ;break;
        case "Meta": ;break;
        case "F1": ;break;
        case "F2": ;break;
        case "F3": ;break;
        case "F4": ;break;
        case "F5": ;break;
        case "F6": ;break;
        case "F7": ;break;
        case "F8": ;break;
        case "F9": ;break;
        case "F10": ;break;
        case "F11": ;break;
        case "F12": ;break;
        case "PrintScreen": ;break;
        case "ScrollLock": ;break;
        case "Pause": ;break;
        case "ContextMenu": ;break;
        case "AltGraph": ;break;
        case " ": insertSpace(element, e.key);break;
        default: writeCell(element, e.key);break;
    }
}
//funciones de escritura
function deletChart(element){
    element.textContent = element.textContent.substr(0, element.textContent.length-1);
}
function writeCell(element, code){
    if(element.textContent.length < 14 || element.textContent === ""){
        element.textContent += code;
    }
}
function insertSpace(element, code){
    element.textContent += " ";
}
function countKey(e, textStarts, textEnd,countText,button, btn){
   
    if(button.textContent === "" || button.textContent === "Operador"){
        alerta("Campo requerido","Debe introducir el nombre del operador." )
    }
    else{
        if(true){
           
            let second2;
            let minute2;
            if(textStarts.value === "00:30:00"){
                second2 = 0;
                minute2 = 30;
            }
           
            else if(textStarts.value === "01:00:00"){
                second2 = 59;
                minute2 = 59;
            }
            else{
                second2 = 6;
                minute2 = 00;
            }
            countText.classList.remove("active");

            const mounts = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let date = new Date();
            let mount = date.getMonth();
            let day = date.getDate();
            let year = date.getFullYear();
            let hour = date.getHours();
            let minute = date.getMinutes();
            let second =  date.getSeconds();
            let hour3 = date.getHours();
            let minute3 = date.getMinutes();
            let second3 =  date.getSeconds();
            if(second3 < 10) second3 = "0" + second3;
            if(minute3 < 10) minute3 = "0" + minute3;
            if(hour3 < 10) hour3 = "0" + hour3;
            //textStarts.textContent =`${hour3}:${minute3}:${second3}`
           
            second = second + second2
            minute = minute + minute2;
            if(second >= 60){
                second = second - 60;
                minute++;
            }
            if(minute >= 60){
                minute = minute - 60;
                hour++;
            }
            if(second < 10) second = "0" + second;
            if(minute < 10) minute = "0" + minute;
            if(hour < 10) hour = "0" + hour;
            const timeTotalDead = `${mounts[mount]} ${day} ${year} ${hour}:${minute}:${second} GMT-0400`
            textEnd.textContent =`${hour}:${minute}:${second}`
            let startTime = new timeOut(e,countText, textEnd , timeTotalDead, button, btn) //funcion
            startTime;
            startTime = undefined  
        }  
    }
}
time = deadLine => {
    let now = new Date();
    let remainTime = (new Date(deadLine) - now + 1000) / 1000;
    let remainSecount = ("0" + Math.floor(remainTime % 60)).slice(-2);
    let remainMinute = ("0" + Math.floor(remainTime / 60 % 60)).slice(-2);
    let remainHour = ("0" + Math.floor(remainTime / 360 % 24)).slice(-2);
    let remainDay = Math.floor (remainTime / (360 * 24))
    return {
        now,
        remainTime,
        remainSecount,//
        remainMinute,
        remainHour,
        remainDay,
    }
}
function timeOut(e,element,textEnd,times,button, btn){
    const textOperator = document.getElementById("name-operator");
    const timeRender = setInterval( () => {
        const timeLine = time(times)
        element.textContent = `00:${timeLine.remainMinute}:${timeLine.remainSecount}`;
        e.target.textContent = "•"
        e.target.classList.add("active");
        e.target.disabled = true;
        if(element.textContent === "00:00:00"){  
            clearInterval(timeRender);
            textOperator.innerHTML += `
                <div>
                    <h1>El tiempo de <span>${button.textContent}</span> a finalizado. </h1>
                </div>`;
            rePlay();
            element.classList.add("active");
            //timeLine = undefined;
            e.target.disabled = false;
            e.target.classList.remove("active");
            e.target.textContent = "►";
            closeChilds();
            openChilds(textOperator);
            removeClass(textOperator);
            }
            
    }, 1000);
    btn.disabled = false;
    btn.addEventListener("click" , () => {
        prontAlerta("Aviso","¿Desea reiniciar la operación?");
        const confirtReset = document.getElementById("confirt");

        confirtReset.addEventListener("click", resetPreset);
        
        function resetPreset(){
            clearInterval(timeRender);
            button.textContent = 'Operador'
            element.textContent = "00:00:00";
            textEnd.textContent = "00:00:00";
            e.target.disabled = false;
            e.target.classList.remove("active");
            e.target.textContent = "►";
            btn.disabled = true;
        }
    });
}
/*Ventana Emergente*/

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
header.addEventListener("click", e => {
    const textOperator = document.getElementById("name-operator");
    if(textOperator.className === "text-operator"){
        openChilds();
    }
    else if(textOperator.className !== "text-operator"){
        closeChilds();
    }
});
function rePlay() {
    const music = new Audio('timbreEscuela.mp3');
    music.play();
    //music.loop =true;
    music.playbackRate = 2;
    //music.pause();
}
function openChilds(){
    const textOperator = document.getElementById("name-operator");
    if(textOperator.className === "text-operator"){
        if(textOperator.childElementCount == 1){
            textOperator.classList.add("active");
            textOperator.innerHTML += `<div>
            <h1>Campo vacio.</h1>
        </div>`;
        }
        if(textOperator.childElementCount == 2){
            textOperator.classList.add("active");
            removeClass(textOperator);
        }
        else if(textOperator.childElementCount == 3){
            textOperator.classList.add("active2");
            removeClass(textOperator);
        }
        else if(textOperator.childElementCount == 4){
            textOperator.classList.add("active3");
            removeClass(textOperator);
        }
        else if(textOperator.childElementCount == 5){
            textOperator.classList.add("active4");
            removeClass(textOperator);
        }
        else if(textOperator.childElementCount == 6){
            textOperator.classList.add("active5");
            removeClass(textOperator);
        }
        else if(textOperator.childElementCount == 7){
            textOperator.classList.add("active6");
            removeClass(textOperator);
        }
        else if(textOperator.childElementCount >= 8){
            textOperator.classList.add("active7");
            removeClass(textOperator);
        }
        else{
            textOperator.classList.add("active6");
            removeClass(textOperator);
        }
    }
}
function closeChilds(){
    const textOperator = document.getElementById("name-operator");
    if(textOperator.className !== "text-operator"){
        //textOperator.classList.remove("active");
        //textOperator.classList.remove("active2");
        textOperator.className = 'text-operator';
    }
}
function removeClass(element){

    setTimeout(() => {
        element.className = 'text-operator';
    }, 40000);
}
addEventListener('VisibilityChange', e =>{
    //e.preventDefault();
    const doc = document.visibilityState;
    console.log(e);
});
btnTeam.addEventListener('click', (e) =>{
    const element = document.getElementById("btn-toogle");
    const body = document.getElementById("body");
    if(header.className === ""){
        header.classList.add("active");
        body.classList.add("active");
        element.classList.add("active");
    }
    else{
        header.classList.remove("active");
        body.classList.remove("active");
        element.classList.remove("active");
    }
});
