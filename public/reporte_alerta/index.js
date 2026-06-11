'use strict';

import { rePlay } from './assets/js/sound_alert/sound_alert.js';
import { localDesert } from './assets/js/countLocal.js';
import { AlerteBox } from './assets/libreries/alertText/script.js';
import { clearStonrage } from './assets/js/dataBase_input.js';

import CreateDivImg from './assets/js/create_img/create_img.index.js';
import CreateImg from './assets/js/create_imgReport/CreateImg.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';
import { DomManipulation } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from './assets/utils/arrayTo64.js';


const socket = io('https://72.68.60.254:3000');
const socketAppManager = io(`https://${window.location.hostname === '72.68.60.201' ? '72.68.60.201:3007' : '72.68.60.254:455'}`);
const modal = new AlerteBox();

const localContainHtml = document.getElementById('local-contain');
const arrConfigLocal = [];
let localArray = null;
const headerText = document.getElementById('text-header');
const checkYarvis = document.getElementById('connect-yarvis');
const icoWhatsapp = document.getElementById('ico-whatsapp');

const URL_API = window.location.hostname === '72.68.60.201' ?  window.location.host : '72.68.60.254';
const numberGroutW = window.location.hostname === '72.68.60.201' ? '120363167230826480@g.us' : '584267371177-1593197121@g.us';

let keySpeack = false;

let keyJarvis = true;


const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);


setTimeout(() => {
    keySpeack = true;
}, 180000)

const getLocal = callback => {
    axios.get(`https://${URL_API}/local`)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            callback(err, null);
        });
};




 //escucha cuando la document carga
window.addEventListener('DOMContentLoaded', () => {

    getLocal((err, response) => {
        if(err) throw err;
        const localOrder = response.data.sort(( x, y ) => {
            return x.order - y.order;
        });
        localArray = response.data;
        localOrder.forEach(local => {
            const localHtml = createLocal(local);
            if(local.status === 'activo'){ 
                axios.get(`https://${URL_API}/routerSchedule/idLocal=${ local._id }`)
                    .then(response => {
                        localHtml.setAttribute('date-time', 'on');
                        localHtml.setAttribute('id', local._id);
                        arrConfigLocal.push(response.data);
                        
                    })
                    .catch(err => {
                        console.log(err);
                        localHtml.setAttribute('date-time', 'off');
                        localHtml.setAttribute('title', 'sin configuración de horario');
                        localHtml.style.backgroundColor = 'rgb(211, 211, 211)';
                    })
                    .finally(() => {
                        localContainHtml.appendChild(localHtml);
                        
                    });
            }
        });
    });


    socket.on('warning', msm => {
        if(msm.type === 'complete'){
            rePlay(1).then(()=>{});
            speckAlert(msm.text);
        }
        else if(msm.type === 'simple'){
            rePlay(2).then(()=>{});
            speckAlert(msm.text);
        }
        else{
            speckAlert(msm.text);
        }
    });


    socket.on('reset', msm => {
        alert('Se a realizado un cambio desdel servidor, se necesita reiniciar la aplicación "Rerpote de alertas"');
        reloadPage();
    });

    

    socketAppManager.on('failed-connection', msm => {
        
        boxModal.show('¡Alerta! ', `Se a generado una alerta de falla en ${msm.localName} ⚠️`);
        rePlay(1).then(()=>{});        
        
        // -->
        sendTextJarvis(`*${msm.localName}*\nFalla de conexión con dvr\n@584262673975`, numberGroutW , true, '+584262673975'.substring(1) + '@c.us', msm.buffer_img )
                .then(response => {
                    console.log(response);
                })
                .catch(err => {
                    console.log(err);
                })
                .finally(() => {
                    speckAlert(`Atención, protocolo de seguimiento en ${msm.localName}, falla de conexión con deve erre`);
                });
                
    });
    

    // <--
    socketAppManager.on('check-failed-connection', msm => {
        
        if(msm.length > 0 ){
            speckAlert('Atención, protocolo de seguimiento de fallas');
        
            msm.forEach(item => {
                modal.createModal(`❗️ ${item[1].localName} caido`);
                speckAlert(`Confirmar si ${item[1].localName}, siguen las camaras caidas señor coordinador `);
            
                sendTextJarvis(`*${item[1].localName}*\nContinua la falla de conexión con dvr\n@584262673975`, numberGroutW  , true, '+584262673975'.substring(1) + '@c.us', item[1].buffer_img )
                    .then(response => {
                        console.log(response);
                        sendTextJarvis(`@584127041220`, numberGroutW  , true, '+584127041220'.substring(1) + '@c.us' )
                    })
                    .catch(err => {
                        console.log(err);
                    });
                    
            });
        }
    });

    

    modal.create({ bottom: '0', right: '0' });
    modal.deletModal();
    modal.createStyle();

    //checkYarvis.disabled = true;


    let tomeOur = setTimeout(() => {
        rePlay(2).then(()=>{});
        confirJarvisConection('Conexión establecida con Yarvis');
        checkYarvis.disabled = false;
        loadDataBase();
        clearTimeout(tomeOur);

    }, 5000);
    


    checkYarvis.addEventListener('change', e => {
        if(e.target.checked){
            keyJarvis = true;
        }
        else{
            keyJarvis = false;
        }
    });


    document.getElementsByTagName('body')[0].addEventListener('click', e => {
        if(e.target.textContent === '«' || e.target.textContent === '»' || e.target.className === 'btn-flex'){
            if(document.getElementsByTagName('aside')[0].className === ''){
                document.getElementsByTagName('aside')[0].classList.add('active');
                document.getElementById('text-tab').textContent = '»'; 
            }
            else{
                document.getElementsByTagName('aside')[0].classList.remove('active');
                document.getElementById('text-tab').textContent = '«';
            }
        }


        if(e.target.localName === 'button' && e.target.textContent === 'Limpiar'){ 
            clearStonrage(()=> { 
                localStorage.removeItem('config-arr-alert');
                document.getElementById('countTextChart').textContent = '0';
                modal.createModal('💢 Datos borrados');
                    rePlay(2).then(()=>{
                    speckAlert('La base de datos de alertas, a sido eliminada');
                });
            });
        }

        if(e.target.localName === 'button' && e.target.id === 'generate-img-303'){ 
            createReport();
        }


        if(e.target.localName === 'button' && e.target.id === 'delete-img-303'){ 
            if(document.getElementById('contentImg-303-id')) document.getElementById('contentImg-303-id').remove();
            if(document.getElementById('img-text-404'))  document.getElementById('img-text-404').remove();
        }
        

        
        if(e.target.id === 'save-date'){ 
            rePlay(2).then(()=>{});
            modal.createModal('✅ Datos guardados');
            saveToDataBase();
        }


        if(e.target.className === 'input-number'){ 
            e.target.parentNode.parentNode.classList.remove('bg-red');
            saveToDataBase();
        };


        if(e.target.id === 'connect-yarvis'){
            if(e.target.checked === true){
                headerText.textContent = 'Restableciendo conexión...';
                confirJarvisConection('Conexión establecida con Yarvis');
            }
            else {
                desaptive();
            }
        }


        if(e.target.className === 'label-check-input') localDesert();


    });


    document.getElementsByTagName('form')[0].addEventListener('change', e => {
        saveToDataBase();
        const coundDom = document.getElementById('countTextChart');
        const coundDomImportamt = document.getElementById('countTextResalt');
        const boxFather = document.getElementsByTagName('form')[0]
        let value1 = 0;
        let value2 = 0;
        if(e.target.className === 'input-number' || e.target.className === 'input-number active'){
            for(let i = 0; i < document.getElementsByTagName('form')[0].children.length; i++){
                    value1 += Number(boxFather.children[i].children[1].children[1].value);
                    value2 += Number(boxFather.children[i].children[2].children[1].value);
            }
            coundDom.textContent = String(value1);
            coundDomImportamt.textContent = String(value2);
        }
    });



    let date = new Date();

    if(date.getHours()  > 5 && date.getHours() < 12){
        speckAlert('buenos dias, reporte de alertas  activo');
    }
    else if(date.getHours()  >= 12 && date.getHours() < 17){
        speckAlert('buenos tardes, reporte de alertas  activo');
    }
    else{
        speckAlert('buenos noches, reporte de alertas  activo');
    }

   

    setInterval(() => {
        const speak = new SpeakPull();
        let date2 = new Date();
        const createImg = new CreateImg(document.getElementById('body'), {
            title: 'Clientes sin reportar durate 30 min 🕒'
        });

        
        if((date2.getMinutes() === 15 || date2.getMinutes() === 30 || date2.getMinutes() === 45) && date2.getSeconds() === 0){
            rePlay(2).then(()=>{});
            speckAlert('Recordatorio, llevar el seguimiento de terraza en Francisca Doral');
        }

        
        if(date2.getHours() === 23 && date2.getMinutes() === 0 && date2.getSeconds() === 0){
            rePlay(1).then(()=>{});
            speckAlert('Atención, realizar perimetral de mochima, macarao, ráko, y canaima.');
        }
        
        
               
       
        arrConfigLocal.forEach(async time => {
            const config = time[0];
            const dayConfig = config.dayMonitoring.filter(dayItem => dayItem.dayMonitoring === date2.getDay());
            const localHtml = document.getElementById(config.idLocal);
            const isActivateConfig = localHtml.getAttribute('date-time');
            const local = localArray.filter(item => item._id === config.idLocal)[0];
            
            if(isActivateConfig === 'on'){
                let isActivate = false;

                dayConfig.filter(date => {
                    const HOUR_START = Number(date.hours.start.split(':')[0]) + Number(date.hours.start.split(':')[1] / 60);
                    const HOUR_END = Number(date.hours.end.split(':')[0]) + Number(date.hours.end.split(':')[1]) / 60;
                    const dateLive = date2.getHours() + date2.getMinutes() / 60;
                    if( dateLive >= HOUR_START && dateLive < HOUR_END ) isActivate = true;
                });


                if(isActivate){
                    
                    if(!localHtml.classList.contains('active')){
                        localHtml.classList.add('active');
                        if(keySpeack) speak.pushLine(`Activar monitoreo en, ${localHtml.children[0].children[0].textContent}.`);
                    }
                    else{
                        if((date2.getMinutes() === 0 && date2.getSeconds() === 0) || (date2.getMinutes() === 30 && date2.getSeconds() === 0)){
                            const isEqual = comparateDate( localHtml );
                            if(isEqual){
                                
                                const MSM = `⏰ ${localHtml.children[0].children[0].textContent}, sin reportar la ultima media hora`; 
                                modal.createModal(MSM);
                                //createImg.pushText(`📛 ${localHtml.children[0].children[0].textContent}`);
                            }
                        }
                    }
                }
                else{
                    if(localHtml.classList.contains('active')){
                        localHtml.classList.remove('active');
                        if(localHtml.classList.contains('bg-red')) localHtml.classList.remove('bg-red');
                        speak.pushLine(`Monitoreo en, ${localHtml.children[0].children[0].textContent} finalizado.`);
                        socketAppManager.emit('receive-reconnection', { idLocal: local._id, localName: local.name});
                    }
                }
            }   
           
           
        });

        
        
        if(keyJarvis){
            speak.dream();
            
            if((date2.getMinutes() === 2 && date2.getSeconds() === 0) || (date2.getMinutes()=== 32 && date2.getSeconds() === 0)){
                socketAppManager.emit('from-failed-connection', undefined);
            }

           
            if(date2.getHours() >= 11 && date2.getHours() <= 23){


                if((date2.getMinutes() === 55 && date2.getSeconds() === 0) || (date2.getMinutes()=== 25 && date2.getSeconds() === 0)){
                    speckAlert('5 minutos. para enviar el reporte de alertas');
                } 

                if(date2.getMinutes() === 0 || date2.getMinutes() === 30){
                    
                    if(date2.getSeconds() === 0){  
                        
                        createReport();
                        
                        createImg.createImg();
                        createImg.generateAndSend(((err, result) => {
                            console.log(err);
                            console.log(result);
                            if(err){ 
                                throw err
                            }
                            else{
                                sendTextJarvis(result.text, numberGroutW , false, null, result.img )
                                    .then(response => {
                                        console.log(response);
                                    })
                                    .catch(err => {
                                        console.log(err);
                                    });
                            } 
                        }));
                    }
                }
            }
        }
    }, 1000); 
    
});

   


function confirJarvisConection(text){
    const url = [`https://72.68.60.254:4000/`];
    const header = {
        method: 'GET',
    }
    fetch(url, header)
        .then(result => {
            if(result.ok) {
                headerText.textContent = text;
                headerText.classList.remove('desaptive');
                headerText.classList.add('active');
                icoWhatsapp.classList.add('active');
                modal.createModal('🍌Whatsapp activo');
            }
        })
        .catch(err => {
            console.log(err);
            headerText.textContent = 'No se a establecido conexión con yarvis';
            headerText.classList.add('desaptive');
            modal.createModal('❗ Consulte a soporte ténico'); //arreglar
            rePlay(2).then(()=>{});
        });
}


class SpeakPull{

    constructor(){
        this.line = [];
    };

    pushLine(text){
        if(typeof text !== 'string') throw 'The parameter must be of text type.';
        this.line.push(text);
    };

    dream(){
        if(this.line.length > 0){
            rePlay(1).then(()=>{});
            speckAlert('Atención,');
            for(let i = this.line.length - 1; i >= 0; i--){
                speckAlert(this.line[i]);
                this.line.pop();
            }
        }
    };
}   



function comparateDate(box){
    if(!box instanceof HTMLElement) throw 'The parameter must be of HTML type.';
    let boolean = false;
    if(box.classList.contains('inactive')) return boolean;
    const idLocal = box.getAttribute('id');
    const KEY_NAME_LOCAL = `data-${ box.children[0].children[0].textContent }-${ idLocal }`;
    const NAME_LOCAL = box.children[0].children[0].textContent;
    let dataLiveArr = JSON.parse(localStorage.getItem('config-arr-alert')) || [];
    const DATA_LIVE_LOCAL = {
        id: KEY_NAME_LOCAL,
        nameLocal: box.children[0].children[0].textContent,
        alert: box.children[1].children[1].value,     
        highlighting: box.children[2].children[1].value   
    }
   
    const result = dataLiveArr.filter(item => item.id === KEY_NAME_LOCAL);

    if(result.length > 0){
        if(Number(DATA_LIVE_LOCAL.alert) <= Number(result[0].alert)){  
            box.classList.add('bg-red');
            if(keyJarvis){
                boolean = true;
            }
        }
        const newArray = dataLiveArr.filter(item => result[0].id !== item.id);
        newArray.push(DATA_LIVE_LOCAL);
        dataLiveArr = newArray;
    }
    else{
        dataLiveArr.push(DATA_LIVE_LOCAL);
    }
    localStorage.setItem('config-arr-alert', JSON.stringify(dataLiveArr));
    return boolean;
}



async function sendTextJarvis(text, number, boolean, mentionsId, img){
    try{
        const formData = new FormData();
        if(!text) return;
        if(img){
            formData.append('my-file', img.split(';base64,')[1]);
        }
        formData.append('my-text', text);
        formData.append('type', 'image/png');
        if(boolean) formData.append('mentions', mentionsId);

        const res = await axios.post(`https://72.68.60.254:4000/bot/imgV2/number=${ number }`, formData);
        console.log(res);
    }
    catch(err){
        console.log(err);
    }
}



function loadDataBase(){
    for(let i = 0; i <= document.querySelectorAll('.local-container').length - 1 ; i++){
        let name = document.querySelectorAll('.local-container')[i].children[0].children[0].textContent.trim();
        if(localStorage.getItem(`${name}Alertas2`) === null || localStorage.getItem(`${name}Resaltantes2` === null)){
            document.querySelectorAll('.local-container')[i].children[1].children[1].value = 0;
            document.querySelectorAll('.local-container')[i].children[2].children[1].value = 0;
        }
        else{
            document.querySelectorAll('.local-container')[i].children[1].children[1].value = localStorage.getItem(`${name}Alertas2`);
            document.querySelectorAll('.local-container')[i].children[2].children[1].value = localStorage.getItem(`${name}Resaltantes2`);
        }
        document.getElementById('countTextChart').textContent = localStorage.getItem('valorTotal') || '0';
        
    }
}



function saveToDataBase(){
    for(let i = 0; i <= document.querySelectorAll('.local-container').length - 1 ; i++){
        let name = document.querySelectorAll('.local-container')[i].children[0].children[0].textContent.trim();
        let alert = Number(document.querySelectorAll('.local-container')[i].children[1].children[1].value.trim());
        let importan = Number(document.querySelectorAll('.local-container')[i].children[2].children[1].value.trim()); 
        localStorage.removeItem(`${name}Alertas2`, alert);
        localStorage.removeItem(`${name}R;esaltantes2`, importan);
        localStorage.setItem(`${name}Alertas2`, alert);
        localStorage.setItem(`${name}Resaltantes2`, importan);
    }

    localStorage.setItem('valorTotal', Number(document.getElementById('countTextChart').textContent));
    console.warn('Datos guardados');
}


function desaptive(){
    headerText.textContent = 'Conexión desactivada con Yarvis';
    headerText.classList.remove('active');
    headerText.classList.remove('desaptive');
    icoWhatsapp.classList.remove('active');
}


const speckAlert = (text) => {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const utterThis = new SpeechSynthesisUtterance(text);
    utterThis.voice = voices[233]
   // return synth.speak(utterThis);
}



function createLocal( data ){
    const containt = DomManipulation.createHtml('div', { class: 'local-container' });
    const divDataLocal = DomManipulation.createHtml('div', { class: 'nombre-local' });
    const name = DomManipulation.createHtml('h2', {  }, data.name)
    const imgLocal = DomManipulation.createHtml('img', { class: 'img-local', draggable: false,  src: arrayBufferToBase64(data.img.data.data, data.img.contentType) }) 
    divDataLocal.appendChild(name);
    divDataLocal.appendChild(imgLocal);
    
    const divInputAlert = DomManipulation.createHtml('div', { class: 'inputContain' });
    const titleAlert = DomManipulation.createHtml('p', { class: 'inputContain' }, 'Alertas');
    const inputAlert = DomManipulation.createHtml('input', { class: 'input-number', type: 'number', value: 0, min: 0, max: 100, maxlength: 3  });
    divInputAlert.appendChild(titleAlert);
    divInputAlert.appendChild(inputAlert);

    const divInputSpecial = DomManipulation.createHtml('div', { class: 'inputContain' });
    const titleSpecial = DomManipulation.createHtml('p', {  }, 'Resaltante');
    const inputSpecial = DomManipulation.createHtml('input', { class: 'input-number', type: 'number', value: 0, min: 0, max: 100, maxlength: 3  });
    divInputSpecial.appendChild(titleSpecial);
    divInputSpecial.appendChild(inputSpecial);

    const divCheckbox = DomManipulation.createHtml('div', { class: 'inputContain elevation' });
    const checkbox = DomManipulation.createHtml('input', { class: 'label-check-input', type: 'checkbox' });
    divCheckbox.appendChild(checkbox);

    containt.appendChild(divDataLocal);
    containt.appendChild(divInputAlert);
    containt.appendChild(divInputSpecial);
    containt.appendChild(divCheckbox);
    return containt;
}


function reloadPage(){
    saveToDataBase();
    alert('El administrador del sistema ha realizado un cambio en el servidor');
    location.reload();
}



const base64ToFile = (base64, filename) => {
    let arr = base64.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};



function createReport(url){
    const createImg = new CreateDivImg(document.getElementById('local-contain'), document.getElementById('body'), `https://${window.location.hostname}:4000/bot/img`);
    createImg.createSectionHtml();
    createImg.generateAndSend(((err, result) => {

        if(err) throw err; 

        sendTextJarvis(result.text, numberGroutW , false, null, result.img )
            .then(response => {
                /*
                console.log(response);
                
                const formDataThow = new FormData();
                const file = base64ToFile(result.img, 'Reporte de alertas');
                formDataThow.append('img', file, 'reporte de alertas');
        

                axios.post(`https://${window.location.host}/alertNoveltie`, formDataThow)
                    .then(responseTwo => {
                        console.log(responseTwo);
                    })  
                    .catch(err => {
                        console.log(err);
                    });
                */
            })
            .catch(err => {
                console.log(err);
                boxModal.show('Error', 'No se envio el reporte de alerta ¿Desea descargarlo?', { isBtnAccept: true, method: () => {
                    const a = document.createElement('a');
                    a.download = 'Rerte de alertas.png';
                    a.href = result.img;
                    a.click();
                }});
            });
    }));
}



