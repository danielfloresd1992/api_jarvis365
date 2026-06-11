/*

   * Last Update: 28-03-2022
   * Autor: DANIEL FLORES
   * Name-App: APP-MANAGER 5.1.0
    
   CUALQUIER MANIPULACIÓN DEL CODIGO FUENTES SIN SUTORIZACIÓN SERA SANCIONADO
   PROPIEDAD DE AMAZONAS365.C.A


*/


//  models
import { getPublicationesAll, getPublicationsSearch, getNoveltiesById, getDataLocal, putNovelties, deletePublisherAndNoveltie } from '/Lobby/assets/model/publisher_noveltie.js';
import { getLocalligth } from '/setCorte/assets/model/corte.model.js';


import { createHtml, DomManipulation } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
import { WindowLoanding } from '/utils/window_await/window_await.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';


// view fucntions
import { printNoveltie } from '/Lobby/assets/view/publisher.js';
import { showCorte } from '/Lobby/assets/view/corte.js';
import { showAlert } from '/Lobby/assets/view/alert.js';
import { docDeleted } from '/Lobby/assets/view/elemet_remplace.js'


//var DOM


const togleFill = document.getElementById('toglee-localFill');
const tagLocalContain = document.getElementById('local-contin-3030');
const selectLocalFill = document.getElementById('selectFilter-local');



// variables
const permissionUser = JSON.parse(localStorage.getItem('appManagerUser'));
const locals = [];
let keyPaginate = true;
let keyShare = true;

const franciscaId = [];  // , '637a8c561a8ed7ed7d7e7233', '637a8d761a8ed7ed7d7e7238', '637a8e661a8ed7ed7d7e723d'
const arrArticleFill = JSON.parse(localStorage.getItem('Filter-alert-manager'));

import nameUrl from '/utils/url_api.js';






const URL_IP = nameUrl;
window.addEventListener('DOMContentLoaded', () => {

    document.querySelector('.textJarvisComponent-textArea').addEventListener('keyup', e => {
        console.log(e);
    });





    const URL_SOCKET = window.location.hostname === '72.68.60.201' ? `${window.location.hostname}:3007` : `${window.location.hostname}:455`;

    const userContentLive = document.getElementById('user-online30');
    const socket = io(`wss://${URL_SOCKET}`, { secure: true, rejectUnauthorized: false });
    socket.emit('join_room', 'lobby');
    //  INFO USER
    document.getElementById('name-text').textContent = JSON.parse(localStorage.getItem('appManagerUser'))['username'];
    if (JSON.parse(localStorage.getItem('appManagerUser'))['super']) {
        document.getElementById('user-super').parentNode.setAttribute('title', 'Permiso de supervisor')
        document.getElementById('user-super').src = 'ico/done/done.svg';
        document.getElementById('user-super').classList.add('green');
    }
    if (JSON.parse(localStorage.getItem('appManagerUser'))['admins']) {
        document.getElementById('user-adminstrador').parentNode.setAttribute('title', 'Eres administrador del sistema')
        document.getElementById('user-adminstrador').src = 'ico/done/done.svg';
        document.getElementById('user-adminstrador').classList.add('green');
    }
    if (!JSON.parse(localStorage.getItem('appManagerUser'))['super']) {
        document.getElementById('btn-send-text-jarvis').disabled = true;
        document.querySelector('.textJarvisComponent-textArea').disabled;
    }


    document.getElementById('open-asidebar-option').addEventListener('click', () => {
        document.getElementById('aside-bar-menu').classList.toggle('open-aside-bar')
    });


    document.getElementsByTagName('body')[0].setAttribute('tabindex', 0);


    if ('Notification' in window) {
        // Solicitar permiso (solo si no está ya concedido)
        if (Notification.permission !== 'granted') {
            Notification.requestPermission()
                .then(permission => {
                    if (permission === 'granted') {
                        showWelcomeNotification({ title: 'Bienvenido a su perfil!', body: 'Gracias por visitar nuestra plataforma' });
                    }
                });
        } else {
            showWelcomeNotification({ title: 'Bienvenido a su perfil!', body: 'Gracias por visitar nuestra plataforma' });
        }
    }



    function showWelcomeNotification({ title, body }) {

        const notification = new Notification(title, {
            body: body,
            icon: '/img/newLogo.svg' // Icono opcional
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }




    const windowLoad = new WindowLoanding(document.getElementsByTagName('body')[0], {
        ballColor: '#9A9A9A'
    });
    windowLoad.createWindow('Cargando publicaciónes');
    windowLoad.insertStyle();
    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);


    const paginateAll = getPublicationesAll();
    const paginateSearch = getPublicationsSearch();

    boxModal.show('Atención', 'esta versión esta en desuso.')
    // SOCKEK IO
    socket.on('sendPublisher', data => {
        axios.get(`https://${nameUrl}/user/publisherAndArticleById/id=${data._id}`)
            .then(response => {
                // boxModal.show('Atención', 'esta versión esta en desuso.')

                if (response.data.noveltie) {

                    const noveltie = response.data.noveltie;
                    let updateHtml;
                    if (JSON.parse(localStorage.getItem('Filter-alert-manager'))?.activate) {
                        //const fillNoveltie = JSON.parse(localStorage.getItem('Filter-alert-manager')).arrIds.filter(id => id === noveltie.local.idLocal);
                        //if(fillNoveltie.length > 0) updateHtml = printNoveltie(response.data, locals, document.getElementById('main-content-novelties'), true, permissionUser);
                    }
                    else {
                        updateHtml = printNoveltie(response.data, locals, document.getElementById('main-content-novelties'), true, permissionUser);
                    }
                    //new Notification(`${data.title}`);
                    if (updateHtml) {
                        document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
                    }
                }


                else if (response.data.corte) {
                    const updateHtml = showCorte(response.data, document.getElementById('main-content-novelties'), true);
                    //new Notification(`${data.title}`);
                    // document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
                }
                else if (response.data.alert) {
                    const updateHtml = showAlert(response.data, true);
                    //new Notification(`${data.title}`)
                    //document.querySelector('.divContentNovelties').insertAdjacentElement('beforebegin', updateHtml.children[0]);
                }

            })
            .catch(err => {
                console.log(err)
            });
    });


    socket.on('document_updated', data => {
        if (document.getElementById(data.doc._id)) {
            const updateHtml = printNoveltie(data.doc, locals, document.getElementById('main-content-novelties'), false, permissionUser);
            document.getElementById(data.doc._id).replaceWith(updateHtml);
            console.log(`actualización por ${data.user.nameUser}`)
            showWelcomeNotification({ title: data.doc.title, body: `actualización por ${data.user.nameUser}` });
        }
    });


    socket.on('reciveDeletePublisher', data => {
        if (document.getElementById(data.publisherId)) {
            return document.getElementById(data.publisherId).replaceWith(docDeleted(data));
        }
    });


    socket.on('open-user-express', data => {
        if (data.myId === JSON.parse(localStorage.getItem('appManagerUser')).userId && document.getElementById(data.sessionId) === null) userContentLive.appendChild(liveUser(data));
    });

    socket.emit('update-user-repost-express', JSON.parse(localStorage.getItem('appManagerUser')).userId);

    DomManipulation.removeAll(userContentLive, () => {
        socket.emit('update-user-repost-express', 'update');
    });


    socket.on('close-user-repost-express', data => {
        if (data.sessionId && document.getElementById(data.sessionId)) document.getElementById(data.sessionId).remove()
    });


    setInterval(() => {
        DomManipulation.removeAll(userContentLive, () => {
            socket.emit('update-user-repost-express', JSON.parse(localStorage.getItem('appManagerUser')).userId);
        });
    }, 30000);




    socket.on("connect_error", (err) => {
        boxModal.show('Error', 'Validación en los SSL. Por favor comunicarse con el departamento de sistemas');
        console.log(`connect_error due to ${err.message}`);
    });



    // EVENT CLICK
    document.getElementById('btn-send-text-jarvis').addEventListener('click', () => {
        const textValue = document.querySelector('.textJarvisComponent-textArea').value;
        if (JSON.parse(localStorage.getItem('appManagerUser'))['super'] && document.querySelector('.textJarvisComponent-textArea').value !== '') {
            axios.get(`https://${nameUrl}:4000/bot/voice/text=${textValue}/type=simple`)
                .then(response => {
                    if (response.status === 200) {
                        new Notification('Compartido con el cecom');
                    }
                })
                .catch(() => {
                    new Notification('No se entrego el mensaje');
                });
        }
        else if (document.querySelector('.textJarvisComponent-textArea').value === '') {
            alert('No hay texto.');
        }
        else {
            alert('No tienes los permisos necesario.');
        }
    });






    //tagLocalContain.appendChild()
    activateFillAlert(document.getElementById('toglee-localFill'), JSON.parse(localStorage.getItem('Filter-alert-manager'))?.activate);

    document.getElementsByTagName('body')[0].addEventListener('click', e => {

        if (e.target.id === 'toglee-localFill') {
            activateFillAlert(e.target);
        }
        if (e.target.id === 'delete-tagLocal-600') {
            const idTag = e.target.getAttribute('idLocal');
            const configFill = JSON.parse(localStorage.getItem('Filter-alert-manager'))
            const findId = configFill.arrIds.filter(id => id === idTag);
            if (findId.length > 0) {
                const newArr = configFill.arrIds.filter(id => id !== idTag);
                configFill.arrIds = newArr;
                localStorage.setItem('Filter-alert-manager', JSON.stringify(configFill));
                e.target.parentNode.remove();
                boxModal.show('Aviso', 'Local removido del filtro');
            }
        }
    }, true);

    function activateFillAlert(elementHtml, Boolean) {
        if (Boolean !== undefined && Boolean !== null) {
            if (Boolean) {
                elementHtml.children[0].classList.add('activate-filter');
            }
            else {
                elementHtml.children[0].classList.remove('activate-filter');
            }
        }
        else {
            elementHtml.children[0].classList.toggle('activate-filter');
        }
        const filterActivate = elementHtml.children[0].classList.contains('activate-filter');
        let config;
        localStorage.getItem('Filter-alert-manager') ? config = JSON.parse(localStorage.getItem('Filter-alert-manager')) : config = {};

        if (!filterActivate) {
            boxModal.show('Aviso', 'Filtro de alertas desactivado');
            selectLocalFill.disabled = true;
            config.activate = false;
            selectLocalFill.onchange = null;
        }
        else {
            boxModal.show('Aviso', 'Filtro de alertas activada, tenga en cuenta que esta opción, filtrara las alertas entrantes.');
            selectLocalFill.disabled = false;
            config.activate = true;
            selectLocalFill.onchange = e => {
                const config = JSON.parse(localStorage.getItem('Filter-alert-manager'));
                if (Array.isArray(config.arrIds) && config.arrIds.filter(id => id === e.target.value).length > 0) return boxModal.show('Error', 'El local se encuentra en el filtro.');
                if (!config.arrIds) config.arrIds = [];
                config.arrIds = [...config.arrIds, e.target.value];
                localStorage.setItem('Filter-alert-manager', JSON.stringify(config));
                const idLocal = locals.filter(local => local._id === e.target.value);
                addTagFillLocal(idLocal[0]);
            };
        }
        localStorage.setItem('Filter-alert-manager', JSON.stringify(config));
    }


    function addTagFillLocal(local) {
        const p = DomManipulation.createHtml('p', { class: 'tag-p' }, local.name);
        const btnDeleteTag = DomManipulation.createHtml('button', { class: 'boxManagerSubmit-btnDelete', id: 'delete-tagLocal-600', idLocal: local._id }, 'X')
        const tag = DomManipulation.createHtml('div', { class: 'tabItem' }, null, [p, btnDeleteTag]);
        tagLocalContain.appendChild(tag);
    }


    document.querySelector('.main-contain').addEventListener('click', e => {

        if (e.target.id === 'btn-put-01') {
            const idPublisher = e.target.parentNode.parentNode.getAttribute('idpublisher');
            const data = {
                validationResult: {
                    isApproved: Boolean(e.target.getAttribute('name'))
                },
                isValidate: {
                    validation: e.target.getAttribute('name'),
                    for: JSON.parse(localStorage.getItem('appManagerUser')).username
                },
                _id: e.target.getAttribute('idnoveltie'),
                idPublisher: idPublisher
            };


            const parent = e.target.parentNode.parentNode;

            putNovelties(data, (responseData, err) => {
                if (err) {
                    console.log(err);
                    if (err.response) return boxModal.show('error', err.response.data);
                };
                console.log(responseData);
                //    parent.replaceWith(printNoveltie(responseData, locals, document.getElementById('main-content-novelties'), false, permissionUser));
            });
        }

        if (e.target.id === 'share-noveltie-Jarvis') {
            if (keyShare) {
                keyShare = false
                e.target.disabled = true;
                windowLoad.createWindow('Compartiendo por via Whatsapp');

                shareWithJarvis(e.target, (res, err) => {
                    if (err) {
                        console.log(err);
                        return boxModal.show('error', 'Error al traer los datos')
                    };
                    typeShareJarvis(res, err => {
                        keyShare = true
                        e.target.disabled = false;
                        windowLoad.closeWindowAwait();
                        if (err) boxModal.show('error', 'no se a enviado al grupo de Amazonas activo');
                        else boxModal.show('Aviso', 'Enviado')
                    });
                });
            }
        }

        if (e.target.id === 'scroll-left-img:01' || e.target.id === 'scroll-right-img:02') scrollMove(e.target);

        if (e.target.id === 'view-img-noveltie03') viewImgNoveltie(e.target.src, document.querySelector('.main-contain'));

        if (e.target.id === 'span-diaplay-menu04') {
            if (e.target.textContent === 'ocultar menú') {
                e.target.textContent = 'ver menú ...';
            }
            else {
                e.target.textContent = 'ocultar menú';
            }
            e.target.parentNode.children[2].classList.toggle('hidden-menu');
        };



        if (e.target.id === 'option-noveltie201') {
            e.target.parentNode.children[1].classList.toggle('showListOption');
        }


        //evento para eliminar novedad

        if (e.target.id === 'delete-noveltie202') {
            e.target.parentNode.parentNode.children[1].classList.toggle('showListOption');
            const id = e.target.parentNode.parentNode.parentNode.id;
            boxModal.show('Aviso', 'Desea eliminar este elemento', {
                isBtnAccept: true, method: () => {
                    deletePublisherAndNoveltie(id, (err, response) => {
                        if (err) throw boxModal.show('Error', err.response.data);
                        if (response.status === 200) {
                            socket.emit('deletedPublisher', { publisherId: id, updateFor: { username: JSON.parse(localStorage.getItem('appManagerUser')).username, userId: JSON.parse(localStorage.getItem('appManagerUser')).userId } });
                        }
                    });
                }
            });
        };


        if (e.target.id === 'find-noveltie&show') {

            return boxModal.show('Aviso', 'Esta opción aun no esta habilitada');  //////////por terminar

            windowLoad.createWindow('Cargando publicación');
            getNoveltiesById(e.target, (data, err) => {
                if (err) {
                    windowLoad.closeWindowAwait();
                    return console.log(err);
                };
                showUniqueNoveltie(document.querySelector('.main-contain'), data, () => {
                    console.log(data);
                    windowLoad.closeWindowAwait();
                });
            });
        };
        if (e.target.id === 'close-window-noveltie') {
            e.target.parentNode.remove();
        }

        //if(e.target.id === 'option-noveltie201') console.log()

    }, true);


    // SEARCH, PAGINATE AND SCROLL

    getDataLocal((data, err) => {
        const componentSearch = document.getElementById('search-2020');
        if (err) {
            console.log(err)
            return boxModal.show('error', err.response.data);
        }
        if (data) {

            data.forEach(local => {
                if (localStorage.getItem('Filter-alert-manager')) {
                    const arrArticleFill = JSON.parse(localStorage.getItem('Filter-alert-manager'));
                    if (Array.isArray(arrArticleFill.arrIds)) {
                        arrArticleFill.arrIds.forEach(id => {
                            if (id === local._id) {
                                addTagFillLocal(local);
                            }
                        });
                    }
                }
            });


            locals.push(...data);
            paginateAll.nextPaginate(publication => {

                prePrintNovelties(publication, document.getElementById('main-content-novelties'), () => {
                    keyPaginate = true;
                    windowLoad.closeWindowAwait();
                });

            });
        };


        window.addEventListener('scroll', e => {

            if (Math.round(window.innerHeight + window.pageYOffset + 28) >= document.body.offsetHeight) {
                if (keyPaginate) {
                    keyPaginate = false;
                    windowLoad.createWindow('Cargando publicaciónes');
                    paginateAll.nextPaginate((novelties, err) => {
                        if (err) return boxModal.show('error', 'error en la paginación.')
                        if (componentSearch.value === '') {
                            prePrintNovelties(novelties, document.getElementById('main-content-novelties'), err => {
                                if (err) boxModal.show('error', 'No se pudo establecer conexión con el servidor, ponerse en contacto con el personal de sistema');
                                keyPaginate = true;
                                windowLoad.closeWindowAwait();
                            });
                        }
                        else {
                            if (document.querySelector('.boxNotFound')) {
                                removeChildHtml(document.getElementById('main-content-novelties'), () => {
                                    paginateSearch.nextPaginate(e.target.value, data => {
                                        prePrintNovelties(data, document.getElementById('main-content-novelties'), () => {
                                            windowLoad.closeWindowAwait();
                                        });
                                    });
                                });
                            }
                            else {
                                paginateSearch.nextPaginate(document.getElementById('search-2020'), data => {
                                    prePrintNovelties(data, document.getElementById('main-content-novelties'), () => {
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
        if (e.target.value === '') {
            removeChildHtml(document.getElementById('main-content-novelties'), () => {
                windowLoad.createWindow('Cargando publicaciónes');
                paginateAll.nextPaginate((novelties, err) => {
                    console.log(err);
                    prePrintNovelties(novelties, document.getElementById('main-content-novelties'), err => {

                        if (err) boxModal.show('error', 'No se pudo establecer conexión con el servidor, ponerse en contacto con el personal de sistema');
                        keyPaginate = true;
                        windowLoad.closeWindowAwait();

                    });
                });
            });
        }
        else {
            removeChildHtml(document.getElementById('main-content-novelties'), () => {
                document.getElementById('main-content-novelties').appendChild(searchResult('Buscando', true));
                paginateSearch.nextPaginate(e.target, data => {

                    prePrintNovelties(data, document.getElementById('main-content-novelties'), () => {

                        windowLoad.closeWindowAwait();
                    });
                });
            });
        }
    });


    getLocalligth()
        .then(response => {
            response.forEach(item => {
                axios.get(`https://${nameUrl}/local/id=${item._id}`)
                    .then(local => {
                        const optionForSelect = DomManipulation.createHtml('option', { value: local.data._id }, local.data.name);
                        selectLocalFill.appendChild(optionForSelect);
                        const localIco = DomManipulation.createHtml('img', { class: 'listRoute-img img40px', src: arrayBufferToBase64(local.data.img?.data?.data, 'image/png') });
                        const nameLocal = DomManipulation.createHtml('p', { class: 'listRoute-p' }, local.data.name);
                        const listLocal = DomManipulation.createHtml('a', { class: 'listRoute-a', href: `https://${nameUrl}/profileAndRestaunrant=${local.data.name}` }, null, [localIco, nameLocal]);
                        document.getElementById('list-local-303').appendChild(listLocal);
                    })
                    .catch(err => {
                        console.log(err);
                    });
            })
            console.log();
        })
        .catch(err => {
            console.log(err);
        })
});



function prePrintNovelties(data, html, callback) {
    const sortArray = [];
    if (data.length > 0) {
        data.forEach(async element => {
            sortArray.push(axios.get(`https://${nameUrl}/user/publisherAndArticleById/id=${element._id}`));
        });
        Promise.all(sortArray)
            .then(result => {
                const sortedPublisher = result.sort((a, b) => {
                    const dateA = new Date(a.data.date).getTime();
                    const dateB = new Date(b.data.date).getTime();
                    return dateB - dateA;
                });

                if (document.querySelector('.boxNotFound')) {
                    removeChildHtml(document.getElementById('main-content-novelties'), () => {
                    });
                }

                sortedPublisher.forEach(object => {
                    if (object.data.noveltie) {
                        const noveltie = object.data.noveltie;
                        if (JSON.parse(localStorage.getItem('Filter-alert-manager'))?.activate && Array.isArray(JSON.parse(localStorage.getItem('Filter-alert-manager')).arrIds)) {
                            if (Array.isArray(JSON.parse(localStorage.getItem('Filter-alert-manager')).arrIds)) {
                                const fillNoveltie = JSON.parse(localStorage.getItem('Filter-alert-manager')).arrIds.filter(id => id === noveltie.local.idLocal);
                                if (fillNoveltie.length > 0) document.getElementById('main-content-novelties').appendChild(printNoveltie(object.data, locals, document.getElementById('main-content-novelties'), false, permissionUser));
                            }
                        }
                        else {
                            document.getElementById('main-content-novelties').appendChild(printNoveltie(object.data, locals, document.getElementById('main-content-novelties'), false, permissionUser));
                        }
                    }
                    else if (object.data.corte) document.getElementById('main-content-novelties').appendChild(showCorte(object.data, html));
                    else if (object.data.alert) document.getElementById('main-content-novelties').appendChild(showAlert(object.data));

                });

                callback();
            })
            .catch(err => {
                console.log(err);
                callback('error en la petición ajax de las publicación');
            });
    }
    else {
        removeChildHtml(document.getElementById('main-content-novelties'), () => {

            document.getElementById('main-content-novelties').appendChild(searchResult('Sin resultados'));
        });
    }
}



function shareWithJarvis(elementHtml, callback) {
    if (elementHtml === undefined || elementHtml === null) throw 'elementHtml is undefined';

    const parent = elementHtml;
    const id = parent.getAttribute('idnoveltie');

    axios.get(`https://${nameUrl}/novelties/img/id=${id}`)
        .then(response => {
            if (response.status === 200) {
                callback(response.data, null);
            }
        })
        .catch(err => {
            callback(null, err);
        });
}


function typeShareJarvis(res, callback) {
    const data = res[0];
    let menu = res[0].menu;
    const URL = `https://72.68.60.254:4000/bot/imgV2`;
    const config = { headers: { "Content-Type": "multipart/form-data; charset=utf-8 " } }
    const promises = [];
    const francisca = franciscaId.indexOf(res[0].local.idLocal);

    if (francisca > -1) {

        let formData = new FormData();
        let file;

        switch (res[0].title.trim()) {
            case 'Demora de primera atención':
                file = arrayBufferToBase64(res[0].fileNoveltie.files[1].data.data, res[0].fileNoveltie.files[1].contentType).split(';base64,')[1];
                formData.append('my-file', file);
                formData.append('type', res[0].fileNoveltie.files[1].contentType);
                break;

            case 'Demora de limpieza':
                file = arrayBufferToBase64(res[0].fileNoveltie.files[1].data.data, res[0].fileNoveltie.files[1].contentType).split(';base64,')[1];
                formData.append('my-file', file);
                formData.append('type', res[0].fileNoveltie.files[1].contentType);
                break;

            case 'Demora en entrega de Entrada':
                file = arrayBufferToBase64(res[0].fileNoveltie.files[1].data.data, res[0].fileNoveltie.files[1].contentType).split(';base64,')[1];
                formData.append('my-file', file);
                formData.append('type', res[0].fileNoveltie.files[1].contentType);
                break;

            case 'Demora en entrega de Plato Fuerte':
                file = arrayBufferToBase64(res[0].fileNoveltie.files[1].data.data, res[0].fileNoveltie.files[1].contentType).split(';base64,')[1];
                formData.append('my-file', file);
                formData.append('type', res[0].fileNoveltie.files[1].contentType);
                break;

            case 'Demora en entrega de Postre':
                file = arrayBufferToBase64(res[0].fileNoveltie.files[1].data.data, res[0].fileNoveltie.files[1].contentType).split(';base64,')[1];
                formData.append('my-file', file);
                formData.append('type', res[0].fileNoveltie.files[1].contentType);
                break;

            default:
                if (res[0].fileNoveltie > 1) {
                    file = arrayBufferToBase64(res[0].fileNoveltie.files[1].data.data, res[0].fileNoveltie.files[1].contentType).split(';base64,')[1];
                    formData.append('my-file', file);
                    formData.append('type', res[0].fileNoveltie.files[1].contentType);
                }
                else {
                    file = arrayBufferToBase64(res[0].fileNoveltie.files[0].data.data, res[0].fileNoveltie.files[0].contentType).split(';base64,')[1];
                    formData.append('my-file', file);
                    formData.append('type', res[0].fileNoveltie.files[0].contentType);
                }
                break;
        }


        if (res[0].fileNoveltie.files[0].contentType === 'video/mp4') {
            if (res[0].local.lang === 'es') {
                menu += '\nEnvíamos video para su evaluación.';
            }
            else if (res[0].local.lang === 'en') {
                menu += '\nWe sent a video for your evaluation.'
            }
        }
        formData.append('my-text', menu);


        promises.push(axios.post(URL, formData));
        Promise.all(promises)
            .then(async result => {
                /*
                //const msm = await axios.post(URL, { 'my-text': data.menu });
                //if(msm.status === 200) boxModal.show('Aviso', 'Enviado');
                */
                callback();
            })
            .catch(err => {
                console.log(err);
                callback(err);
            });
    }
    else {
        if (res[0].fileNoveltie.files.length < 2) {
            let formData = new FormData();
            const file = arrayBufferToBase64(data.fileNoveltie.files[0].data.data, data.fileNoveltie.files[0].contentType).split(';base64,')[1];
            formData.append('my-file', file);
            formData.append('type', data.fileNoveltie.files[0].contentType);
            if (res[0].fileNoveltie.files[0].contentType === 'video/mp4') {
                if (res[0].local.lang === 'es') {
                    menu += '\nEnvíamos video para su evaluación.';
                }
                else if (res[0].local.lang === 'en') {
                    menu += '\nWe sent a video for your evaluation.'
                }
            }
            formData.append('my-text', menu);
            promises.push(axios.post(URL, formData, config));
            res[0].menu = '';
        }
        else {
            res[0].fileNoveltie.files.forEach(object => {
                let formData = new FormData();
                const file = arrayBufferToBase64(object.data.data, object.contentType).split(';base64,')[1];
                formData.append('my-file', file);
                formData.append('type', object.contentType);
                if (object.caption) formData.append('my-text', object.caption);
                promises.push(axios.post(URL, formData, config));
            });
        }


        Promise.all(promises)
            .then(async result => {
                if (data.menu !== '') {
                    const msm = await axios.post(URL, { 'my-text': data.menu, config });
                    if (msm.status === 200) callback();
                }
                callback();
            })
            .catch(err => {
                console.log(err);
                callback(err);
            });
    }
}


function scrollMove(element) {

    const btnLeft = element.parentNode.children[0];
    const btnRigth = element.parentNode.children[1];
    const elementHtml = element.parentNode.parentNode.children[0];
    let leftPosition = element.parentNode.parentNode.children[0].scrollLeft;
    const widthDiv = element.parentNode.parentNode.children[0].offsetWidth;
    const totalWidthScroll = (elementHtml.children[0].offsetWidth * elementHtml.children.length) - elementHtml.children[0].offsetWidth;

    if (element.textContent === '>') {
        leftPosition = leftPosition + widthDiv;
        elementHtml.scrollLeft = leftPosition;
    }

    if (leftPosition > -1 && element.textContent === '<') {
        leftPosition = leftPosition - widthDiv;
        elementHtml.scrollLeft = leftPosition;
    }

    Number(elementHtml.scrollLeft) === Number(totalWidthScroll) ? btnRigth.disabled = true : btnRigth.disabled = false;
    Number(elementHtml.scrollLeft) === 0 ? btnLeft.disabled = true : btnLeft.disabled = false;

}


function viewImgNoveltie(src, elementHtmlFather) {

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




function removeChildHtml(elementHtml, callback) {
    while (elementHtml.firstChild) {

        elementHtml.firstChild.remove();
    }
    if (elementHtml.children.length < 1) callback();
}


function searchResult(text, BooleanAwait) {
    const div = createHtml('div', { class: 'boxNotFound' });
    const p = createHtml('p', { class: 'boxNotFound-text' }, text);

    div.appendChild(p);

    if (BooleanAwait) {
        const divSpinners = createHtml('div', { class: 'loader' });
        div.appendChild(divSpinners);
    }
    return div;
}


function liveUser(data) {
    const divUserLive = createHtml('div', { class: 'divUSerLive', id: data.sessionId });

    const dataUSerContain = createHtml('div', { class: 'divUSerLive-userContain' });
    const divLive = createHtml('div', { class: 'divUSerLive-divLive' });
    const name = createHtml('span', { class: 'divUSerLive-userName' }, data.user.username)
    dataUSerContain.appendChild(divLive);
    dataUSerContain.appendChild(name);

    const localInfoCopntain = createHtml('div', { class: 'divUSerLive-localInfoCopntain' });
    const localName = createHtml('a', { class: 'divUSerLive-localName', href: `/profileAndRestaunrant=${data.localInfo.localname}` }, data.localInfo.localname);
    localInfoCopntain.appendChild(localName);

    divUserLive.appendChild(dataUSerContain);
    divUserLive.appendChild(localInfoCopntain);
    return divUserLive;
}
