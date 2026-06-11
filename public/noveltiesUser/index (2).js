/*

    * Last Update: 01-15-2022
    * Autor: DANIEL FLORES
    * Name-App: APP-MANAGER 5.0.1
     
*/ 

import { createHtml } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';


const locals = [];

let keyPaginate = true;


const getNovelties = (callback) => {

    let paginate = 0;
    
    async function nextPaginate(callback){
        const response = await axios.get(`https://${window.location.hostname}/user/novelties/paginate=${paginate}/items=${10}`)
        if(response.status === 200){
            callback(response.data);
            return ++paginate;
        }
    }
    return{

        nextPaginate,
        paginate

    }
};

const getDataLocal = async callback => {

    try{
        const local = await axios.get(`https://${window.location.hostname}:443/local`);
      
        if(local.status === 200) callback(local.data);
    }
    catch(err){
        console.log(err);
    }
};

const putNovelties = ( data, callback ) => {
    
    const { _id, isValidate , element } = data;

    axios.put(`https://${window.location.hostname}:443/user/novelties`, {_id: _id, isValidate: isValidate})
    .then(response => {
        if(response.status === 200){
            callback(response.data);
        }
    })
    .catch(err => {
        console.log(err);
    })
};


document.addEventListener('DOMContentLoaded', () => {

    if(!Notification){
        alert('Su navegador no soporta el objeto de notificaciones');
    }
    if(Notification.permission !== 'granted'){
        Notification.requestPermission();
    }

    const socket = io(`wss://${window.location.host}:455`, { secure: true, rejectUnauthorized: false });
    const awaitData = loading_data(document.getElementsByTagName('body')[0]);
    awaitData.createWindow();
   
    socket.on('sendNovelties', data => {

        console.log(data);
        
        const updateHtml = printLocal(data, document.getElementById('main-content-novelties'), true);
        const notification = new Notification(`${data.titleNovelties}`);
        
        document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
    });

    document.querySelector('.main-contain').addEventListener('click', e => {

        /* 
            * Evento de click en el element 'main'
        */

        if(e.target.classList[0] === 'divContentNovelties-btnValidate'){
            const data = { isValidate: e.target.getAttribute('name'), _id : e.target.id , element: e.target};
            const parent = e.target.parentNode.parentNode;
            
            putNovelties(data, responseData => {
                parent.replaceWith(printLocal(responseData));
            });
        }

        if(e.target.id === 'share-noveltie-Jarvis'){
        
            shareWithJarvis(e.target, async data => { 

                const config = { headers: { "Content-Type": "multipart/form-data; charset=utf-8 "}}

                awaitData.createWindow();
                const promises = [];
                data.noveltie[0].img.forEach(async object => {
                    let formData = new FormData();
                    const img = arrayBufferToBase64(object.data.data, object.contentType).split(';base64,')[1];
                    formData.append('my-file', img);
                    formData.append('my-text', object.caption);
                    promises.push(axios.post('https://72.68.60.254:4000/bot/img', formData, config));
                })

                Promise.all(promises)
                .then(async result => {
                    console.log(result);
                    await axios.post('https://72.68.60.254:4000/bot/img', { 'my-text':data.noveltie[0].menu, config });
                    awaitData.closeWindowAwait();
                })
                .catch(err => {
                    console.log(err);
                    awaitData.closeWindowAwait();
                })
            });
        }
        
        if(e.target.id === 'find-noveltie&show'){ 

            awaitData.createWindow();
            getNoveltiesById(e.target, (data, err) => {

                if(err) {
                    awaitData.closeWindowAwait();
                    return console.log(err);
                };

                showUniqueNoveltie( document.querySelector('.main-contain'), data , () => {
                    awaitData.closeWindowAwait();

                });
            })
        };

        if(e.target.id === 'close-window-noveltie') e.target.parentNode.remove();

    })
    
    getDataLocal(data => {
        const paginate = getNovelties();
        if(data) {
            locals.push(...data);
            paginate.nextPaginate(novelties => {

                prePrintNovelties(novelties , document.getElementById('main-content-novelties'), () => {
                    keyPaginate = true;
                    awaitData.closeWindowAwait();
                });
            });

            awaitData.closeWindowAwait();
        };

        window.addEventListener('scroll', e => {

            if (window.innerHeight + window.pageYOffset >= document.body.offsetHeight) {
                if(keyPaginate){
                    keyPaginate = false;
                    awaitData.createWindow();
                    paginate.nextPaginate(novelties => {

                        prePrintNovelties(novelties , document.getElementById('main-content-novelties'), () => {
                            keyPaginate = true;
                            awaitData.closeWindowAwait();

                        });
                    });
                }
            }
        });
    });
});



function prePrintNovelties(data, html, callback){

    data.forEach(element => {
        document.getElementById('main-content-novelties').appendChild(printLocal(element, html));
        
    });
    callback();
}


function printLocal(element, html, boolean){

    /*
        * enlace para la consulta de la novedad `/user/novelties/id=${element._id}`
    */

    let fragment = document.createDocumentFragment();
    const divContent = createHtml('div', { class: 'divContentNovelties', idNovelties: element._id });

    const divTitle = createHtml('div', {class: 'divContentNovelties-divTitle'})
    
    const fillLocal = locals.filter(local => element.localId === local._id );
    
    if(fillLocal.length){
        const img = createHtml('img', {class: 'divContentNovelties-img', src: arrayBufferToBase64(fillLocal[0].img.data.data , fillLocal[0].img.contentType) });

        divTitle.appendChild(img);
    }
   
    let textContent = createHtml('div', {class: 'divContentNovelties-textContain'})
    const pTitle = createHtml('p', { class: 'divContentNovelties-pTitle', id: 'find-noveltie&show', name: element.noveltie[0]}, `${element.titleNovelties} ${element.table ? ` - Mesa${element.table}` : ''}`);
    const pDate = createHtml('p', { class:  'divContentNovelties-pDate'}, formatDateApp(element.date));
    const hr = createHtml('hr');
    hr.style.width = '100%';
    textContent.appendChild(pTitle);
    textContent.appendChild(pDate);
    textContent.appendChild(hr);
    divTitle.appendChild(textContent);

    const pLocalName = createHtml('p', { class: 'divContentNovelties-pName' }, `${element?.localName?.toUpperCase() || 'no definido por prototipado'}`);
    const divdataContent = createHtml('div', { class: 'divContentNovelties-divData'});
    
    const pName = createHtml('p', {class: 'divContentNovelties-pName'}, `nombre del operador: ${element.userName}`);
    let textValidate = '';
    if(element.isValidate === null){
        textValidate += 'novedad por validar';
    }
    else if(element.isValidate === true){
        textValidate += 'Validado';
    }
    else{
        textValidate += '!No valido!';
    }
    const pValidate = createHtml('p', {class :'divContentNovelties-pName'}, `${element.isValidate === undefined ? 'no definido por prototipado' : textValidate}`);

    const hr2 = document.createElement('hr');
    hr2.style.width = '100%';
    const hr3 = document.createElement('hr');
    hr2.style.width = '100%';

    const btnContain = createHtml('div', { class: 'divContentNovelties-divBtn' });
    const btnValidate = createHtml('button', { class: 'divContentNovelties-btnValidate', name:'true', id:element._id },'validado')
    const btnImgValidate = createHtml('img', { class: 'divContentNovelties-btnImg', src: 'ico/like/like.svg'})
    btnValidate.appendChild(btnImgValidate);
    btnContain.appendChild(btnValidate);

    const btnDisValidate = createHtml('button', { class: 'divContentNovelties-btnValidate', name:'false', id:element._id },'validado')
    const btnImgDisValidate = createHtml('img', { class: 'divContentNovelties-btnImg', src: 'ico/like/dislike.svg'})

    const share = createHtml('button', { class: 'divContentNovelties-btnValidate', id: 'share-noveltie-Jarvis' }, 'compartir con Jarvis');
    const imgShare = createHtml('img', { class: 'divContentNovelties-shareImg', src: 'ico/social/WhatsApp.svg.webp'});
    share.appendChild(imgShare);


    if(element.isValidate === 'null'){
        divContent.style.border = '2px solid rgb(168, 168, 168)'
        divContent.title = 'sin validar';
        pValidate.textContent = 'aun no esta validado';
        share.setAttribute('disabled', 'true');
        share.title = 'No puedes compartir por quer no esta validado';
    }
    else if(element.isValidate === 'true'){
        divContent.style.border = '2px solid rgb(6, 58, 205)'
        divContent.title = 'novedad valida';
        btnValidate.classList.add('btnValidate');
        btnImgValidate.classList.add('imgValidate');
        pValidate.textContent = 'Novedad validada';
        share.removeAttribute('disabled');
        share.title = 'Compartir ahora!';
    }
    else if(element.isValidate === 'false'){
        divContent.style.border = '2px solid #b00000'
        divContent.title = 'novedad no valida';
        btnDisValidate.classList.add('btnInvalidate');
        btnImgDisValidate.classList.add('imginValidat');
        pValidate.textContent = 'Novedad no valida';
        share.setAttribute('disabled', 'true');
        share.title = 'No puedes compartir por quer no esta validado';
    }

    btnDisValidate.appendChild(btnImgDisValidate);
    btnContain.appendChild(btnValidate);
    btnContain.appendChild(btnDisValidate);
    btnContain.appendChild(share);

    divdataContent.appendChild(pLocalName);
    divdataContent.appendChild(pName);
    divdataContent.appendChild(pValidate);

    divContent.appendChild(divTitle);
    divContent.appendChild(divdataContent);

    divContent.appendChild(hr2);
    divContent.appendChild(btnContain);
    divContent.appendChild(hr3);

    fragment.appendChild(divContent);

    if(boolean){
        divContent.classList.add('start');
        
    }
    return fragment;
    
}


function updateHtmlNovelties(elementHtml, key){  // * deprecated
    console.log(key)

    console.log(elementHtml);
    const btnValidate = elementHtml.children[3].children[0];
    const imgValidate = elementHtml.children[3].children[0].children[0];

    const btnInvalidate = elementHtml.children[3].children[1];
    const imgInvalidate = elementHtml.children[3].children[1].children[0];
    const share = elementHtml.children[3].children[2];

    const text = elementHtml.children[1].children[2]

    if(key === 'null'){
        elementHtml.style.border = '2px solid rgb(168, 168, 168)'
        elementHtml.title = 'sin validar';
        text.textContent = 'aun no esta validado'
    }
    else if(key === 'true'){
        elementHtml.style.border = '2px solid rgb(6, 58, 205)'
        elementHtml.title = 'novedad valida';
        btnValidate.classList.add('btnValidate');
        imgValidate.classList.add('imgValidate');
        btnInvalidate.classList.remove('btnInvalidate');
        imgInvalidate.classList.remove('imginValidat');
        text.textContent = 'Novedad validada';
        share.removeAttribute('disabled');
        share.removeAttribute('title');
    }
    else if(key === 'false'){
        elementHtml.style.border = '2px solid #b00000'
        elementHtml.title = 'novedad no valida';
        btnValidate.classList.remove('btnValidate');
        imgValidate.classList.remove('imgValidate');
        btnInvalidate.classList.add('btnInvalidate');
        imgInvalidate.classList.add('imginValidat');
        text.textContent = 'Novedad no valida';
        share.setAttribute('disabled', 'true');
    }
   
}

function getNoveltiesById(elementHtml, callback){

    const parent = elementHtml.parentNode.parentNode.parentNode;
    const id = parent.getAttribute('idNovelties');

    axios.get(`https://${window.location.hostname}:443/user/novelties/id=${id}`)
    .then(response => {
        if(response.status === 200){
            callback(response.data, null);
        }
    })
    .catch(err =>  {
        callback(null , err);
    })

}

function showUniqueNoveltie(elementHtml, data, callback){

    if(!elementHtml || !data) throw 'a parameter the null';

    console.log(data);

    const divParent = createHtml('div', { class: 'shoNoveltie-contain' });
    const btnClose = createHtml('button', { class: 'shoNoveltie-btnClose', id: 'close-window-noveltie' }, 'X');

    const divNoveltie = createHtml('article', { class: 'shoNoveltie-article' });

    const title = createHtml('div', { class: 'shoNoveltie-title' });
    const img = locals.filter(local => data.localId === local._id );
    const imgLocal = createHtml('img', { class: 'shoNoveltie-titleImg', src: arrayBufferToBase64(img[0].img.data.data , img[0].img.contentType)});
    const titleContain = createHtml('div', { class: 'shoNoveltie-titleContain' });
    const h1 = createHtml('h1', { class: 'shoNoveltie-titleNoveltie' }, `${data.titleNovelties} ${data.table ? ` - Mesa${data.table}` : ''}`);
    const dateP = createHtml('p', { class: 'shoNoveltie-dateNovletie' }, formatDateApp(data.date));
    titleContain.appendChild(h1);
    titleContain.appendChild(dateP);
    title.appendChild(imgLocal);
    title.appendChild(titleContain);

    const imgNoveltieContain = createHtml('div', { class: 'shoNoveltie-imgNoveltieContain' });

    const descriptionContain = createHtml('div', { class: 'shoNoveltie-descriptionContain' });
    const pDescription = createHtml('p', { class: 'shoNoveltie-pDescription' }, data.noveltie[0].description);
    descriptionContain.appendChild(pDescription);

    if(data.noveltie[0].img.length === 1){
        const img = createHtml('img', { class: 'shoNoveltie-imgNoveltie one-img', src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
        imgNoveltieContain.appendChild(img);
    }
    else if(data.noveltie[0].img.length === 2){
        imgNoveltieContain.classList.add('two-img');
        const img1 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
        const img2 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[1].data.data, data.noveltie[0].img[1].contentType)});
        imgNoveltieContain.appendChild(img1);
        imgNoveltieContain.appendChild(img2);
    }
    else if(data.noveltie[0].img.length === 4){
        imgNoveltieContain.classList.add('four-img');
        const img1 = createHtml('img', { class: 'shoNoveltie-imgNoveltie four', src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
        const img2 = createHtml('img', { class: 'shoNoveltie-imgNoveltie four', src: arrayBufferToBase64(data.noveltie[0].img[1].data.data, data.noveltie[0].img[1].contentType)});
        const img3 = createHtml('img', { class: 'shoNoveltie-imgNoveltie four ', src: arrayBufferToBase64(data.noveltie[0].img[2].data.data, data.noveltie[0].img[2].contentType)});
        const img4 = createHtml('img', { class: 'shoNoveltie-imgNoveltie four', src: arrayBufferToBase64(data.noveltie[0].img[3].data.data, data.noveltie[0].img[3].contentType)});
        imgNoveltieContain.appendChild(img1);
        imgNoveltieContain.appendChild(img2);
        imgNoveltieContain.appendChild(img3);
        imgNoveltieContain.appendChild(img4);
    }

    divNoveltie.appendChild(title);
    divNoveltie.appendChild(descriptionContain);
    divNoveltie.appendChild(imgNoveltieContain);
    divParent.appendChild(btnClose);
    divParent.appendChild(divNoveltie);

    elementHtml.appendChild(divParent);
    callback();
}

function shareWithJarvis(elementHtml, callback){

    if(elementHtml === undefined || elementHtml === null) throw 'elementHtml is undefined';

    const parent = elementHtml.parentNode.parentNode;
    const id = parent.getAttribute('idnovelties');

    axios.get(`https://${window.location.hostname}:443/user/novelties/id=${id}`)
    .then(response => {
        if(response.status === 200){
            callback(response.data, null);
        }
    })
    .catch(err =>  {
        callback(null , err);
    })

}

const loading_data = ( elementHtml ) => {
    if(typeof elementHtml !=='object' || elementHtml === null) throw 'parameter of must be an html tag';
    
    let tag;
    
    const createWindow = () =>{
        if( tag !== undefined ) return elementHtml.appendChild(tag);

        tag = document.createElement('div');
        tag.classList.add('awaitContain');
        let awaitBall = document.createElement('div');
        awaitBall.classList.add('lds-roller')
        for(let i = 0; i < 7; i++){
            let div = document.createElement('div');
            awaitBall.appendChild(div);
        }
        tag.appendChild(awaitBall);
        elementHtml.appendChild(tag);
    };

    const closeWindowAwait = () => {
        if(tag === undefined) throw 'inicializa primero con el metodo createWindow';
        tag.remove();
    };

    return {
        tag,
        createWindow,
        closeWindowAwait
    }

}

function formatDateApp(hour){
    const date = new Date(hour);
    const day = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const month = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${day[date.getDay()]} ${date.getDate()} ${month[date.getMonth()]} ${date.getFullYear()} a las ${(0 + '' + date.getHours()).substr(-2)}:${(0 + '' + date.getMinutes()).substr(-2)}:${(0 + '' + date.getSeconds()).substr(-2)}`;
}
