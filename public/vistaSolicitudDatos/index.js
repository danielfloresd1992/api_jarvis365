
const btnSubmit = document.getElementById('btn-submit');
const btnSubmit2 = document.getElementById('btn-submit-find');
let bodyElementHtml = document.querySelector('.main');
let bodyElementHtml2 = document.getElementById('main-1');
const headerText = document.getElementById('text');
let selecDia = document.getElementById('dia');
let selec = document.getElementById('local');
const dateInput = document.getElementById('date');
//const sokect = new WebSocket("ws://servidor.com/socketserver");
//console.log(sokect);
body.addEventListener('click', e => {
    switch (e.target.value) {
        case 'Buscar por local':
            screenRender(1);
            console.log('funciono');
            //btnSubmit2.disabled = true;
            break;
        case 'Ultimos 50 cortes':
            screenRender(2);
            break;
    }
    switch (e.target.className) {
        case 'btn-deleted':
            body.removeChild(e.path[1]);    
            break;
        case 'btn-deleted2':
            body.removeChild(e.path[2]);    
            break;
        case 'pngDownload':
            pngDownload(e.path[2])
            break;
    }
});

function pngDownload(element){
    let option = {};
    event.preventDefault();
    var width = 500;
    let height=element.clientHeight;
    let a = document.createElement('a');
    let canvas = document.createElement("canvas");
    canvas.width=width*2;
    canvas.height=height*2;
    canvas.style.width=width+"px";
    canvas.style.height=height+"px";
    var context=canvas.getContext("2d");
    context.scale(2,2);
    console.log(width ,height)
    a.download = true;
    a.target = '_blank';
    
    html2canvas(element, { width:option.width||width,height:option.height||height,canvas:canvas,})
    .then(canvas => {
        a.href = canvas.toDataURL('image/png',0.0), 
        a.download = element.firstElementChild.textContent;
        a.click();
    });
}





function remplaceImg(img){
    const t1 = document.getElementById('text-1');
    const t2 = document.getElementById('text-2');
    const boxImg = document.getElementById('img-local');
    switch (img) {
        case 'Seleccione un establecimiento': 
            t1.textContent = 'Todas las franquicias';
            t2.textContent = '';
            boxImg.src = 'vistaSolicitudDatos/img/camara.png';

                break
        case 'FD': 
            boxImg.src = 'vistaSolicitudDatos/logos/rf.PNG';
            t1.textContent = 'Restaurante: La Francisca';
            t2.textContent = 'Locación: El Doral';
                break
        case 'FM': 
            boxImg.src = 'logos/rf.PNG';
            t1.textContent = 'Restaurante: La Francisca';
            t2.textContent = 'Locación: Miami';
                break
        case 'FML': 
            boxImg.src = 'vistaSolicitudDatos/logos/rf.PNG';
            t1.textContent = 'Restaurante: La Francisca';
            t2.textContent = 'Locación: Miami Lakes';
                break
        case 'FDV': 
            boxImg.src = 'vistaSolicitudDatos/logos/rf.PNG';
            t1.textContent = 'Restaurante: La Francisca';
            t2.textContent = 'Locación: Davie';
                break
        case 'FMM': 
            boxImg.src = 'vistaSolicitudDatos/logos/rf.PNG';
            t1.textContent = 'Restaurante: La Francisca';
            t2.textContent = 'Locación: Miramar';
                break
        case 'BH': 
            boxImg.src = 'vistaSolicitudDatos/logos/bh.PNG';
            t1.textContent = 'Restaurante: Bocas House';
            t2.textContent = 'Locación: El doral';
                break
        case 'BW': 
        boxImg.src = 'vistaSolicitudDatos/logos/bw.PNG';
            t1.textContent = 'Restaurante: Bocas House';
            t2.textContent = 'Locación: Weston';
                break;
        case 'BO': 
            boxImg.src = 'vistaSolicitudDatos/logos/bgO.PNG';
            t1.textContent = 'Restaurante: Bocas Grill and bar';
            t2.textContent = 'Locación: Orlando';
                break
        case 'BB': 
            boxImg.src = 'vistaSolicitudDatos/logos/bgB.PNG';
            t1.textContent = 'Bocas Grill and bar';
            t2.textContent = 'Locación: Brickell';
                break
        case 'BG58': 
            boxImg.src = 'vistaSolicitudDatos/logos/bg58.PNG';
            t1.textContent = 'Bocas Grill 58';
            t2.textContent = 'Locación: El Doral';
                break
        default:
            boxImg.src = 'vistaSolicitudDatos/img/LOGO-SLIDER.png';
            break
    }
}

selec.addEventListener('change', e => {
    const nameLocal = e.target.value;
    remplaceImg(nameLocal);
});

window.addEventListener('load', ()=> {
    const fragment = document.createDocumentFragment();
    const h2 = document.createElement('h2');
    h2.setAttribute('id', 'child-firt');
    h2.appendChild(document.createTextNode('Esperando conexión a la base de datos...'));
    fragment.appendChild(h2);
    headerText.appendChild(fragment);

    setTimeout(() => {
        const element3 = document.querySelector('.intro-page');
        element3.parentNode.removeChild(element3);
        showLocal();
    }, 2000);
    //headerText.innerHTML += `<h2 id="child-firt">Esperando conexión a la base de datos...</h2>`;
});



