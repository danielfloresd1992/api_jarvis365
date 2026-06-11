/*

    * Last Update: 28-03-2022
    * Autor: DANIEL FLORES
    * Name-App: APP-MANAGER 5.1.0
     
    CUALQUIER MANIPULACIÓN DEL CODIGO FUENTES SIN SUTORIZACIÓN SERA SANCIONADO
    PROPIEDAD DE AMAZONAS365.C.A


*/ 

import { createHtml, DomManipulation } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
import { WindowLoanding } from '/utils/window_await/window_await.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';
import nameUrl from '/utils/url_api.js' ;

const permissionUser = JSON.parse(localStorage.getItem('appManagerUser'));
const locals = [];
let keyPaginate = true;
let keyShare = true;




const getPublicationesAll = (callback) => {
    let paginate = 0;
    async function nextPaginate(callback){
        const response = await axios.get(`https://${nameUrl}/user/publisher/paginate=${paginate}/items=${10}`)
        if(response.status === 200){
            callback(response.data);
            return ++paginate;
        }
        else{
            callback(null, response);
        }
    }
    const reset = () => {
        paginate = 0;
    }
    return{
        nextPaginate,
        paginate,
        reset
    }
};


const getPublicationsSearch = () => {

    let paginate = 0;

    const nextPaginate = async (inputHtml, callback) => {
        try {
           
            const text = inputHtml.value.trim()

            console.log(text);
         
            const response = await axios.get(`https://${nameUrl}/user/publisher/search=${text}/page=${paginate}/numberItems=10`)
            if(response.status === 200){
                
                if(response.data.length < 1) paginate = 0;

                callback(response.data);

                return ++paginate;
            }

        } 
        catch(err) {
            callback(err, null);
        }
    }

    const reset = () => {
        paginate = 0;
    }

    return{
        nextPaginate,
        paginate,
        reset
    }
};


const getNoveltiesById = (elementHtml, callback) => {

    const parent = elementHtml.parentNode.parentNode.parentNode;
    const id = parent.getAttribute('idNovelties');

    axios.get(`https://${nameUrl}:443/user/novelties/id=${id}`)
    .then(response => {
        if(response.status === 200){
            callback(response.data, null);
        }
    })
    .catch(err =>  {
        callback(null , err);
    })
};


const getDataLocal = async callback => {
    try{
        const local = await axios.get(`https://${nameUrl}:443/local`);
      
        if(local.status === 200) callback(local.data);
    }
    catch(err){
        callback(null, err);
        console.log(err);
    }
};


const putNovelties = ( data, callback ) => {
    
    const { _id, isValidate , element, idPublisher } = data;

    axios.put(`https://${nameUrl}/novelties/id=${_id}`, { isValidate: isValidate})
        .then(response => {
            if(response.status === 200){

                axios.get(`https://${nameUrl}/user/publisherAndArticleById/id=${ idPublisher }`)
                .then(response =>{
                    callback(response.data, null);
                })
                .catch(err => {
                    callback(null, err)
                });
            }
        })
        .catch(err => {
            callback(null, err)
        });
};


/*
    * main function 👇
*/

document.addEventListener('DOMContentLoaded', () => {

    document.getElementsByTagName('body')[0].setAttribute('tabindex', 0);
    const userContentLive = document.getElementById('user-online30');
    
    if(navigator.userAgentData.platform === 'Windows'){
        if(!Notification){
            alert('Su navegador no soporta el objeto de notificaciones');
        }
        if(Notification.permission !== 'granted'){
            Notification.requestPermission();
        }
        new Notification('Bienvenido a su perfil!');  if(!Notification){
            alert('Su navegador no soporta el objeto de notificaciones');
        }
        if(Notification.permission !== 'granted'){
            Notification.requestPermission();
        }
        new Notification('Bienvenido a su perfil!');
    }

  
    const windowLoad = new WindowLoanding(document.getElementsByTagName('body')[0], {
        ballColor: '#005aff'
    });
    windowLoad.createWindow('Cargando publicaciónes');
    windowLoad.insertStyle();
    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);


    const socket = io(`wss://${window.location.host}:455`, { secure: true, rejectUnauthorized: false });


    const paginateAll = getPublicationesAll();
    const paginateSearch = getPublicationsSearch();


    socket.on('sendPublisher', data => {
        axios.get(`https://${nameUrl}/user/publisherAndArticleById/id=${data._id}`)
        .then(response => {

            console.log(response);

            if(response.data.noveltie) {
                const updateHtml = printNoveltie(response.data, document.getElementById('main-content-novelties'), true);
                new Notification(`${data.title}`);
                document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
        
            }
            else if(response.data.corte) {
                const updateHtml = showCorte(response.data, document.getElementById('main-content-novelties'), true);
                new Notification(`${data.title}`);
                document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
            }
            else if(response.data.alert) {
                const updateHtml = showAlert(response.data, true);
                new Notification(`${data.title}`)
                document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
            }
                
        })
        .catch(err => {
            console.log(err)
        });
    });

    socket.on('receiveUpdatePublisher', data => {

        if(data.updateFor.userId === JSON.parse(localStorage.getItem('appManagerUser')).userId){
            console.log('soy igual');
        }
        else{
            console.log('no soy igual');
            axios.get(`https://${nameUrl}/user/publisherAndArticleById/id=${data.publisherId}`)
                .then(response => {
                    if(document.getElementById(response.data._id)){
                        const updateHtml = printNoveltie(response.data, document.getElementById('main-content-novelties'), false);
                        document.getElementById(response.data._id).replaceWith(updateHtml);
                        new Notification(`actualización de ${data.title}`);
                    }
                })
                .catch(err => {
                    console.log(err);
                })
        }
    });

    socket.on('open-user-express', data => {
        console.log(data.myId);
        if(data.myId === JSON.parse(localStorage.getItem('appManagerUser')).userId && document.getElementById(data.sessionId) === null) userContentLive.appendChild(liveUser(data));
    });

    socket.emit('update-user-repost-express', JSON.parse(localStorage.getItem('appManagerUser')).userId);
 
    DomManipulation.removeAll(userContentLive,() => {
        socket.emit('update-user-repost-express', 'update');
    });
    

    socket.on('close-user-repost-express', data => {
        if(data.sessionId && document.getElementById(data.sessionId)) document.getElementById(data.sessionId).remove()
    });


    setInterval(()=> {
        DomManipulation.removeAll(userContentLive,() => {
            socket.emit('update-user-repost-express', JSON.parse(localStorage.getItem('appManagerUser')).userId);
            console.log('me estoy ejecutando cada 30 segundos')
        })
    }, 30000);

    
    socket.on("connect_error", (err) => {
        boxModal.show('Error', 'Validación en los SSL. Por favor comunicarse con el departamento de sistemas');
        console.log(`connect_error due to ${err.message}`);
    });

    
    document.querySelector('.main-contain').addEventListener('click', e => {

        if(e.target.id === 'btn-put-01'){
            const idPublisher = e.target.parentNode.parentNode.getAttribute('idpublisher');

            const data = { 
                isValidate: {
                    validation: e.target.getAttribute('name'),
                    for: JSON.parse(localStorage.getItem('appManagerUser')).username
                }, 
                _id : e.target.getAttribute('idnoveltie') , 
                idPublisher: idPublisher
            };

            const parent = e.target.parentNode.parentNode;

            putNovelties(data, (responseData, err) => {
                if(err) {
                    console.log(err);
                    if(err.response) return boxModal.show('error', err.response.data);
                };
                parent.replaceWith(printNoveltie(responseData));

                socket.emit('updatePublisher', { publisherId: parent.id, updateFor: { username: JSON.parse(localStorage.getItem('appManagerUser')).username , userId: JSON.parse(localStorage.getItem('appManagerUser')).userId } });
            });
        }

        if(e.target.id === 'share-noveltie-Jarvis'){

            if(keyShare){
                keyShare = false
                e.target.disabled = true;
                windowLoad.createWindow('Compartiendo por via Whatsapp');
            
                shareWithJarvis(e.target, ( res, err ) => {
                    const data = res[0];
                    if(err) {
                        console.log(err);
                        return  boxModal.show('error', 'Error al traer los datos')
                    };
                    const URL = `https://72.68.60.254:4000/bot/imgV2`;
                    const config = { headers: { "Content-Type": "multipart/form-data; charset=utf-8 "}}
                    const promises = [];

                    data.fileNoveltie.files.forEach( object => {
                        let formData = new FormData();
                        const file = arrayBufferToBase64(object.data.data, object.contentType).split(';base64,')[1];
                        formData.append('my-file', file);
                        formData.append('type' , object.contentType);
                        if(object.caption) formData.append('my-text', object.caption);  //pendiente para refactorizar
                        promises.push(axios.post(URL, formData, config));
                    });
                    Promise.all(promises)
                    .then(async result => {
                        const msm = await axios.post(URL, { 'my-text': data.menu, config });
                        if(msm.status === 200) boxModal.show('Aviso', 'Enviado');
    
                    })
                    .catch(err => {
                        console.log(err);
                        
                        boxModal.show('error', 'no se a enviado al grupo de Amazonas activo');
                    })
                    .finally(() => {
                        keyShare = true;
                        e.target.disabled = false;
                        windowLoad.closeWindowAwait();
                    })
                });
            }
        }

        if(e.target.id === 'scroll-left-img:01' || e.target.id === 'scroll-right-img:02') scrollMove(e.target);

        if(e.target.id === 'view-img-noveltie03') viewImgNoveltie(e.target.src, document.querySelector('.main-contain'));

        if(e.target.id === 'span-diaplay-menu04') {
            if(e.target.textContent === 'ocultar menú'){
                e.target.textContent = 'ver menú ...';
            }
            else{
                e.target.textContent = 'ocultar menú';
            }
            e.target.parentNode.children[2].classList.toggle('hidden-menu');
        };

        if(e.target.id === 'menu-noveltie07') console.log(e.target);
        
        if(e.target.id === 'find-noveltie&show'){ 

            return boxModal.show('Aviso', 'Esta opción aun no esta habilitada');  //////////por terminar

            windowLoad.createWindow('Cargando publicación');
            getNoveltiesById(e.target, (data, err) => {
                if(err) {
                    windowLoad.closeWindowAwait();
                    return console.log(err);
                };
                showUniqueNoveltie( document.querySelector('.main-contain'), data , () => {
                    console.log(data);
                    windowLoad.closeWindowAwait();
                });
            });
        };
        if(e.target.id === 'close-window-noveltie'){
            e.target.parentNode.remove();
            console.log(e.target)
        }
    }, true);


    getDataLocal((data, err) => {

        const componentSearch = document.getElementById('search-2020');


        if(err){
            console.log(err)
            return boxModal.show('error', err.response.data);
        }

        if(data) {
            locals.push(...data);
            paginateAll.nextPaginate(publication => {
            
                prePrintNovelties(publication , document.getElementById('main-content-novelties'), () => {
                    keyPaginate = true;
                    windowLoad.closeWindowAwait();
                });

            });
        };

        window.addEventListener('scroll', e => { 

            if(Math.round(window.innerHeight + window.pageYOffset + 28) >= document.body.offsetHeight) {
                if(keyPaginate){
                    keyPaginate = false;
                    windowLoad.createWindow('Cargando publicaciónes');
                    paginateAll.nextPaginate((novelties, err) => {

                        if(err) return boxModal.show('error', 'error en la paginación.')

                        if(componentSearch.value === ''){
                            prePrintNovelties(novelties , document.getElementById('main-content-novelties'), err => {
    
                                if(err) boxModal.show('error', 'No se pudo establecer conexión con el servidor, ponerse en contacto con el personal de sistema');
                                keyPaginate = true;
                                windowLoad.closeWindowAwait();
    
                            });
                        }
                        else{
                            if(document.querySelector('.boxNotFound')){
                                removeChildHtml(document.getElementById('main-content-novelties'), () => {

                                    paginateSearch.nextPaginate(e.target.value, data => {
                                        prePrintNovelties(data , document.getElementById('main-content-novelties'), () => {
                                            windowLoad.closeWindowAwait();
                                        });
                                    });
                                });
                            }
                            else{
                                paginateSearch.nextPaginate(document.getElementById('search-2020'), data => {
                            
                                    prePrintNovelties(data , document.getElementById('main-content-novelties'), () => {
                                       
                                        windowLoad.closeWindowAwait();
                                    });
                            
                                });
                            }
                        }
                    });
                }
            }
        });
    });

    document.getElementById('search-2020').addEventListener('keyup', e => {

        paginateAll.reset();

        if(e.target.value === ''){
            removeChildHtml(document.getElementById('main-content-novelties'), () => {
                windowLoad.createWindow('Cargando publicaciónes');
                paginateAll.nextPaginate((novelties, err) => {
                    prePrintNovelties(novelties , document.getElementById('main-content-novelties'), err => {
            
                        if(err) boxModal.show('error', 'No se pudo establecer conexión con el servidor, ponerse en contacto con el personal de sistema');
                        keyPaginate = true;
                        windowLoad.closeWindowAwait();
    
                    });
                });
            });
        }
        else{
            removeChildHtml(document.getElementById('main-content-novelties'), () => {
                document.getElementById('main-content-novelties').appendChild(searchResult('Buscando', true));
                paginateSearch.nextPaginate(e.target, data => {
                    
                    prePrintNovelties(data , document.getElementById('main-content-novelties'), () => {
                       
                        windowLoad.closeWindowAwait();
                    });
                });
            });
        }
    });
    
});


function prePrintNovelties(data, html, callback){
    const sortArray = [];
    if(data.length > 0){
        data.forEach(async element => {
            sortArray.push(axios.get(`https://${nameUrl}/user/publisherAndArticleById/id=${element._id}`));
        });
        
        Promise.all(sortArray)
            .then(result => {
            
                const sortedPublisher = result.sort(( a, b )=> {
                    const dateA = new Date(a.data.date).getTime();
                    const dateB = new Date(b.data.date).getTime();
                    return  dateB - dateA;
                });

                if(document.querySelector('.boxNotFound')){
                    removeChildHtml(document.getElementById('main-content-novelties'), () => {

                    });
                }
               
                sortedPublisher.forEach(object => {

                    if(object.data.noveltie) document.getElementById('main-content-novelties').appendChild(printNoveltie(object.data, html));
                    else if(object.data.corte) document.getElementById('main-content-novelties').appendChild(showCorte(object.data, html));
                    else if(object.data.alert) document.getElementById('main-content-novelties').appendChild(showAlert(object.data)); 
                    
                });

                callback();
            
            })
            .catch(err => {
                console.log(err);
                callback('error en la petición ajax de las publicación');
            });  
    }
    
    else{
        removeChildHtml(document.getElementById('main-content-novelties'), () => {
            
            document.getElementById('main-content-novelties').appendChild(searchResult('Sin resultados'));
        });
        
    }
    
}


function printNoveltie(element, html, boolean){  // * Publicación en el muro
    /*
        * enlace para la consulta de la novedad `/user/novelties/id=${element._id}`
    */
    const fragment = document.createDocumentFragment();
    const divContent = createHtml('div', { class: 'divContentNovelties', idPublisher: element._id, id: element._id });
    const divTitle = createHtml('div', {class: 'divContentNovelties-divTitle'})

    let fillLocal = null;
    if(element.localId){
        fillLocal = locals.filter(local => element.localId === local._id );
    }
    else{
        fillLocal = locals.filter(local => element.local.id === local._id );
    }
    
    if(fillLocal.length){
        const img = createHtml('img', { class: 'divContentNovelties-img', src: arrayBufferToBase64(fillLocal[0].img.data.data , fillLocal[0].img.contentType), draggable: false, id: 'view-img-noveltie03' });
        divTitle.appendChild(img);
    }

    let textContent = createHtml('div', {class: 'divContentNovelties-textContain'});
    const pTitle = createHtml('p', { class: 'divContentNovelties-pTitle', id: 'find-noveltie&show', idNoveltie: element.noveltie._id}, `${element.title} ${element.noveltie.table ? ` - Mesa ${element.noveltie.table}` : ''}`);
    const pDate = createHtml('p', { class:  'divContentNovelties-pDate'}, formatDateApp(element.date));
    const imgClock = createHtml('img', {class: 'divContentNovelties-pDateImg', src: 'ico/clock/clock.svg' });
    pDate.appendChild(imgClock);
    const hr = createHtml('hr');
    hr.style.width = '100%';
    textContent.appendChild(pTitle);
    textContent.appendChild(pDate);
    textContent.appendChild(hr);
    divTitle.appendChild(textContent);

    const divTextContent = createHtml('div', { class: 'divContentNovelties-contentText'});
    const textDescription = createHtml('p', { class: 'divContentNovelties-text'});

    const pNameLocal = createHtml('p', { }, (element.noveltie.local.name));
    const br = createHtml('br');
    const pDescription = createHtml('p', { }, element.noveltie.description);
    
    textDescription.appendChild(pNameLocal);
    textDescription.appendChild(br);
    textDescription.appendChild(pDescription);


    const viewMenu = createHtml('p', { class: 'divContentNovelties-text divContentNovelties-viewMenu', id: 'span-diaplay-menu04'}, 'ver menú ...');
    const boxTextAndButtonMenu = createHtml('div', { class: 'divContentNovelties-text divContentNovelties-menuContain hidden-menu'});
   
    const menu = createHtml('div', { class: 'divContentNovelties-text textMenu ', contenteditable: true, id: 'menu-noveltie07', tabindex: '0', noveltieId: element.noveltie._id} );
    menu.spellcheck = true;
    menu.designMode = 'on';
    menu.lang = fillLocal[0].lang;

    menu.onblur = e => {
        editMenuRequest(e.target);
    }

    const btnEditMenu = createHtml('button', { class: 'divContentNovelties-text  textMenuButtonEdit', id: 'write-menu-06' });
    const img = createHtml('img', { class: 'divContentNovelties-text  textMenuButtonEditImg', src: '/ico/edit/edit.svg' });
    btnEditMenu.appendChild(img);
    
    if(element.noveltie.menu) {

        const menuNoveltie = element.noveltie.menu.replaceAll('*', '').replaceAll('_', '').split('\r\n');
        
        for(let j = 0; j < menuNoveltie.length; j++){

            if(j === 0){
                let b = createHtml('b', { class: 'lineText' });
                
                b.textContent = menuNoveltie[j];
                menu.appendChild(b);
            }
            else if(j === 1){
                let i = createHtml('i', { class: 'lineText' });
                i.textContent = menuNoveltie[j];
                menu.appendChild(i);
            }
            else{
                const span = createHtml('span',  { class: 'lineText' });
                span.textContent = menuNoveltie[j].trim();
                if(span.textContent === '' || span.textContent === 'Nota:' || span.textContent === 'Note:') break;
                menu.appendChild(span);
            }
            let br = createHtml('br');
            menu.appendChild(br);
        }

        if(menu.children[menu.children.length - 1].tagName === 'BR') menu.children[menu.children.length - 1].remove();

        if(menu.lang === 'es'){ 
            if(menu.children[menu.children.length - 1].textContent.indexOf('Nota:') < 0){
                const span = createHtml('span',  { class: 'lineText' });
                span.textContent = 'Nota:';
                menu.appendChild(br);
                menu.appendChild(span);
            }
           
        }
        else if(menu.lang === 'en'){ 
            if(menu.children[menu.children.length - 1].textContent.indexOf('Note:') < 0){
                const span = createHtml('span',  { class: 'lineText' });
                span.textContent = 'Note:';
                menu.appendChild(br);
                menu.appendChild(span);
            }
        }
        else{
            console.error('Sa a encontrado un elemento que no contiene la propiedad "lang", y dicho objeto es');
        }
    }
        

    boxTextAndButtonMenu.appendChild(menu);
    boxTextAndButtonMenu.appendChild(btnEditMenu);
    
    
    divTextContent.appendChild(textDescription);
    divTextContent.appendChild(viewMenu);
    divTextContent.appendChild(boxTextAndButtonMenu);
   
    const carouselImg = createHtml('div', { class: 'divContentNovelties-carouselDiv'});
    const divImgContain = createHtml('div', { class: 'divContentNovelties-imgDiv'});

    element.noveltie.fileNoveltie.files.forEach(img => {
        
        if(img.contentType === 'video/mp4'){
            const video = createHtml('video', { class: 'divContentNovelties-carouselImg', controls: true })
            const source = createHtml('source', { autoplay: true,  src: arrayBufferToBase64(img.data.data, img.contentType) });
            video.appendChild(source);
            divImgContain.appendChild(video);
        }
        else{
            const imgForCarousel = createHtml('img', { class: 'divContentNovelties-carouselImg', id: 'view-img-noveltie03', src: arrayBufferToBase64(img.data.data, img.contentType)});
            divImgContain.appendChild(imgForCarousel);
        }
    });
    carouselImg.appendChild(divImgContain);

    if(element.noveltie.fileNoveltie.files.length > 1){
        const btnImg = createHtml('div', { class: 'divContentNovelties-carouselBtnContain' });
        const btnLetf = createHtml('button', { class: 'divContentNovelties-carouselBtn', id: 'scroll-left-img:01' }, '<');
        const btnRigth = createHtml('button', { class: 'divContentNovelties-carouselBtn', id: 'scroll-right-img:02' }, '>');
        btnImg.appendChild(btnLetf);
        btnImg.appendChild(btnRigth);
        carouselImg.appendChild(btnImg);
    }

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
    hr2.style.width = '100%';

    const btnContain = createHtml('div', { class: 'divContentNovelties-divBtn' });
    const btnValidate = createHtml('button', { class: 'divContentNovelties-btnValidate', name:'true', idNoveltie : element.noveltie._id, id: 'btn-put-01' },'validado')
    const btnImgValidate = createHtml('img', { class: 'divContentNovelties-btnImg', src: 'ico/like/like.svg'})
    btnValidate.appendChild(btnImgValidate);
    btnContain.appendChild(btnValidate);
    const btnDisValidate = createHtml('button', { class: 'divContentNovelties-btnValidate', name:'false', idNoveltie : element.noveltie._id, id: 'btn-put-01' },'invalido')
    const btnImgDisValidate = createHtml('img', { class: 'divContentNovelties-btnImg', src: 'ico/like/dislike.svg'})
    const share = createHtml('button', { class: 'divContentNovelties-btnValidate',title:'Compartir con Jarvis', id: 'share-noveltie-Jarvis', idNoveltie : element.noveltie._id }, 'enviar');
    const imgShare = createHtml('img', { class: 'divContentNovelties-shareImg', src: 'ico/social/WhatsApp.svg.webp', id: 'btn-share-01'});
    share.appendChild(imgShare);

    if(typeof element.noveltie.isValidate === 'string'){
        
        if(element.noveltie.isValidate === 'null'){
            divContent.title = 'sin validar';
            pValidate.textContent = 'aun no esta validado';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
        else if(element.noveltie.isValidate === 'true'){
            divContent.title = 'novedad valida';
            btnValidate.classList.add('btnValidate');
            btnImgValidate.classList.add('imgValidate');
            pValidate.textContent = 'Novedad validada';
            share.removeAttribute('disabled');
            share.title = 'Compartir ahora!';
        }
        else if(element.noveltie.isValidate === 'false'){
            divContent.title = 'novedad no valida';
            btnDisValidate.classList.add('btnInvalidate');
            btnImgDisValidate.classList.add('imginValidat');
            pValidate.textContent = 'Novedad no valida';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
    }
    else if(typeof element.noveltie.isValidate === 'object'){
        console.log()
        if(element.noveltie.isValidate.validation === 'null'){
            divContent.title = 'sin validar';
            pValidate.textContent = 'aun no esta validado';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
        else if(element.noveltie.isValidate.validation === 'true'){
            divContent.title = 'novedad valida';
            btnValidate.classList.add('btnValidate');
            btnImgValidate.classList.add('imgValidate');
            pValidate.textContent = 'Novedad validada';
            share.removeAttribute('disabled');
            share.title = 'Compartir ahora!';
        }
        else if(element.noveltie.isValidate.validation === 'false'){
            divContent.title = 'novedad no valida';
            btnDisValidate.classList.add('btnInvalidate');
            btnImgDisValidate.classList.add('imginValidat');
            pValidate.textContent = 'Novedad no valida';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
    }
    

    if(!permissionUser.super) share.setAttribute('disabled', 'true');

    btnDisValidate.appendChild(btnImgDisValidate);
    btnContain.appendChild(btnValidate);
    btnContain.appendChild(btnDisValidate);
    btnContain.appendChild(share);

    divContent.appendChild(divTitle);
    divContent.appendChild(divTextContent);
    divContent.appendChild(carouselImg);
    
    if(element.userPublicate) {
        const iNameUser = createHtml('i', { class: 'divContentNovelties-iNameUserPublisher' }, `Compartido por: ${element.userPublicate.name}`);
        divContent.appendChild(iNameUser);

        if(typeof element.noveltie.isValidate === 'object' && typeof element.noveltie.isValidate.for === 'string'){
            const validateForText = createHtml('i', { class: 'divContentNovelties-iNameUserPublisher' }, `Verificado por: ${element.noveltie.isValidate.for}`);
            divContent.appendChild(validateForText);
        }
        
    };

    divContent.appendChild(btnContain);


    fragment.appendChild(divContent);

    if(boolean){
        divContent.classList.add('start');
    }
    return fragment;
    
}


function showUniqueNoveltie(elementHtml, data, callback){ // * Publicación en el muro
    if(!elementHtml || !data) throw 'a parameter the null';

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
  
    if(data.noveltie[0]){
        const pDescription = createHtml('p', { class: 'shoNoveltie-pDescription' }, data.noveltie[0].description);
        descriptionContain.appendChild(pDescription);
    }

    if(data.noveltie[0].img.length === 1){
        if(data.noveltie[0].img[0].contentType === 'video/mp4'){
            const video = createHtml('video', { class: 'shoNoveltie-imgNoveltie one-img', controls: true })
            const source = createHtml('source', { autoplay: true,  src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
            video.appendChild(source);
            imgNoveltieContain.appendChild(video);
        }
        else{
            const img = createHtml('img', { class: 'shoNoveltie-imgNoveltie one-img', src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
            imgNoveltieContain.appendChild(img);
        }
    }

    
    else if(data.noveltie[0].img.length === 2){
        imgNoveltieContain.classList.add('two-img');
        const img1 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
        const img2 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[1].data.data, data.noveltie[0].img[1].contentType)});
        imgNoveltieContain.appendChild(img1);
        imgNoveltieContain.appendChild(img2);
        
    }
    else if(data.noveltie[0].img.length === 3){
        imgNoveltieContain.classList.add('two-img');
        const img1 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[0].data.data, data.noveltie[0].img[0].contentType)});
        const img2 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[1].data.data, data.noveltie[0].img[1].contentType)});
        const img3 = createHtml('img', { class: 'shoNoveltie-imgNoveltie', src: arrayBufferToBase64(data.noveltie[0].img[2].data.data, data.noveltie[0].img[2].contentType)});
        imgNoveltieContain.appendChild(img1);
        imgNoveltieContain.appendChild(img2);
        imgNoveltieContain.appendChild(img3);
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

    const parent = elementHtml;
    const id = parent.getAttribute('idnoveltie');

    axios.get(`https://${window.location.hostname}:443/novelties/img/id=${id}`)
        .then(response => {
            if(response.status === 200){
                callback(response.data, null);
            }
        })
        .catch(err =>  {
            callback(null , err);
        });
}


function scrollMove(element){
    const elementHtml = element.parentNode.parentNode.children[0];
    let leftPosition = element.parentNode.parentNode.children[0].scrollLeft;
    const widthDiv = element.parentNode.parentNode.children[0].offsetWidth;

    if(element.textContent === '>'){
        leftPosition = leftPosition + widthDiv;
        elementHtml.scrollLeft = leftPosition;
    }
    if(leftPosition > -1 && element.textContent === '<'){
        leftPosition = leftPosition - widthDiv;
        elementHtml.scrollLeft = leftPosition;
    }
}


function viewImgNoveltie(src, elementHtmlFather){

    let div = document.createElement('div');
    div.classList.add('div-img-preview')
    const btnClose = createHtml('button', { class: 'shoNoveltie-btnClose', id: 'close-window-noveltie' }, 'X');
    div.appendChild(btnClose);
    let imgPreview = document.createElement('img');
    imgPreview.classList.add('img-preview-window');
    imgPreview.src = src;
    let imgContain = document.createElement('div');
    imgContain.classList.add('imgContain');

    div.appendChild(imgPreview);
    div.appendChild(imgContain);
    elementHtmlFather.appendChild(div);
}

async function editMenuRequest(elementHtml){
    try{
        const arrayHtml = elementHtml.parentNode.children[0].children;
        const id = elementHtml.getAttribute('noveltieid');
        let textUpdate = '';
        Array.from(arrayHtml).forEach(line => {
    
            if((line.textContent === '' || line.textContent.trim() === 'Nota:' || line.textContent.trim() === 'Note:') && line.tagName  !== 'BR'){
                return;
            }
            else{
                if(line.tagName === 'B'){
                    textUpdate += `*${line.textContent.trim()}*`;
                   
                }
               if(line.tagName === 'I'){
                textUpdate += `_${line.textContent.trim()}_`;
               
                }
               if(line.tagName === 'BR'){
                    textUpdate += '\r\n';
               }
               if(line.tagName === 'SPAN'){
                    if(line.textContent !== 'Nota:' || line.textContent !== 'Note:') textUpdate += `${line.textContent.trim()}`;
               }
            }
           
        });
        const data = await axios.put(`https://${window.location.hostname}/novelties/id=${ id }`, { menu: textUpdate });
        console.log(`https://${window.location.hostname}/novelties/id=${ id }, 200 ok`);
    }
    catch(err){
        console.log(err);
        box.show('Error', 'No se pudo actualizar el menú, por favor contactar al personal de sistemas')
    }
}


function showAlert(data, booblean){
    let fragment = document.createDocumentFragment();

    const divContent = createHtml('div', { class: 'divContentNovelties', idPublisher: 'Alert'});
    if(booblean) divContent.classList.add('start');
    const divTitle = createHtml('div', { class: 'divContentNovelties-divTitle' });
    const pTitle =  createHtml('p', { class : 'divContentNovelties-pTitle' }, `${data.title} - ${data.alert.shift}`);
    let textContent = createHtml('div', {class: 'divContentNovelties-textContain'});
    const pDate = createHtml('p', { class:  'divContentNovelties-pDate'}, formatDateApp(data.date));
    const imgClock = createHtml('img', {class: 'divContentNovelties-pDateImg', src: 'ico/clock/clock.svg' });
    pDate.appendChild(imgClock);
    const hr = createHtml('hr');
    hr.style.width = '100%';
    textContent.appendChild(pTitle);
    textContent.appendChild(pDate);
    textContent.appendChild(hr);
    divTitle.appendChild(textContent);
    divContent.appendChild(divTitle);
    const imgContainAlert = createHtml('div', { class: 'divContentNovelties-imgContainAlert' });
    const img = createHtml('img', { class: 'divContentNovelties-imgAlert' , src: arrayBufferToBase64(data.alert.img.data.data, data.alert.img.contentType), id: 'view-img-noveltie03' });
    imgContainAlert.appendChild(img);
    divContent.appendChild(imgContainAlert);

    fragment.appendChild(divContent);
    return fragment;
}


function removeChildHtml(elementHtml, callback){
    while(elementHtml.firstChild){
        
        elementHtml.firstChild.remove();
    }
   if(elementHtml.children.length < 1) callback();
}

function searchResult(text, BooleanAwait){
    const div = createHtml('div', { class: 'boxNotFound' });
    const p = createHtml('p', { class: 'boxNotFound-text' }, text);
    
    div.appendChild(p);

    if(BooleanAwait){
        const divSpinners = createHtml('div', { class:  'loader'});
        div.appendChild(divSpinners);
    }

    return div;
}


function liveUser(data){
    const divUserLive = createHtml('div', { class: 'divUSerLive', id: data.sessionId });

    const dataUSerContain = createHtml('div', { class: 'divUSerLive-userContain' });
    const divLive = createHtml('div', { class: 'divUSerLive-divLive'});
    const name = createHtml('span', { class: 'divUSerLive-userName' }, data.user.username)
    dataUSerContain.appendChild(divLive);
    dataUSerContain.appendChild(name);

    const localInfoCopntain = createHtml('div', { class: 'divUSerLive-localInfoCopntain' });
    const localName = createHtml('p', { class: 'divUSerLive-localName' }, data.localInfo.localname);
    localInfoCopntain.appendChild(localName);

    divUserLive.appendChild(dataUSerContain);
    divUserLive.appendChild(localInfoCopntain);
    return divUserLive;
}



function formatDateApp(hour){
    const date = new Date(hour);
    const day = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const month = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${day[date.getDay()]} ${date.getDate()} ${month[date.getMonth()]} ${date.getFullYear()} a las ${(0 + '' + date.getHours()).substr(-2)}:${(0 + '' + date.getMinutes()).substr(-2)}:${(0 + '' + date.getSeconds()).substr(-2)}`;
}
