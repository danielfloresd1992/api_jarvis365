/*
    * Last update: 04-02-2022
    * Autor: Daniel Flores
    * App name: App-Manager
    * 
    * 
    * 
    * 
    CUALQUIER MANIPULACIÓN DEL CODIGO FUENTES SIN SUTORIZACIÓN SERA SANCIONADO
    PROPIEDAD DE AMAZONAS365.C.A
    
    possible substitute for html2canvas => https://www.npmjs.com/package/html-to-image
    //https://github.com/Unitech/pm2/issues/4540
*/


'use strict';

//VIEW
import { printLocalI } from '/setCorte/assets/view/form.js'

//MODEL
import { getLocalligth, getLocalAmanager } from '/setCorte/assets/model/corte.model.js';

//utils
import { WindowLoanding } from '/utils/window_await/window_await.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';
import URL from '/utils/url_api.js';

const textHeader = document.getElementById('textHeader');
textHeader.textContent = 'Importante actualización del appManager⚙️';
let keySubmit = true;
let local = [];
let franchise = [];


//const URL_IMGTEXT = 'https://72.68.60.254:4000/bot/imgV2/number=120363047824436141@g.us';
const URL_IMGTEXT = `https://${'72.68.60.254'}:4000/bot/img`;


const getFranchise = async () => {
    axios.get(`https://${URL}/franchise`)
    .then((result) => {
        franchise = [...result.data];
    })
    .catch((err) => console.log(err));
};


//  * main void 
window.addEventListener('DOMContentLoaded', async () => {

    const wondowLoad = new WindowLoanding(document.getElementsByTagName('body')[0], {
        ballColor: '#005aff'
    });
    wondowLoad.createWindow('Conectando con el servidor');
    wondowLoad.insertStyle();

    const form = document.getElementById('form-local-30');
    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
    
   
    const locals = await getLocalligth();
 
    locals.forEach(async item => {
        
        if(item.typeMonitoring !== 'perimetral'){
            const getLocal = await getLocalAmanager(item._id);
            local.push(getLocal);
            form.appendChild(printLocalI(getLocal));
        }
    });

    getFranchise();
    wondowLoad.closeWindowAwait();

    LiveYarvis(err => {
        const ico = document.getElementById('icoWhatsapp');
        const textIco = document.getElementById('textLive');
        if(err){
            console.error(err);
            textIco.classList.add('desactive');
            textIco.textContent = 'Connection error with Jarvis.';
            boxModal.show('Error', 'Error al contactar la A.P.I. de Jarvis. Por favor comunicarse con el departamento de sistemas');
        }
        else{
         
            ico.classList.add('active');
            textIco.classList.add('active');
            textIco.textContent = 'Connected with Jarvis.';
        }
    });
   
    
    document.querySelector('.mainContain').addEventListener('change', e => changueInput(e));
    document.querySelector('.mainContain').addEventListener('submit', e => {
        e.preventDefault();
        document.querySelector('.mainContain-form-btn').disabled = true;
        if(keySubmit){
            keySubmit = false;
            wondowLoad.createWindow('Guardando por favor espere...');
            let objectHtml = parseHtml(e.target);
            console.log(parseHtml(e.target));

            let text = arrayToString(objectHtml);
            let resultLocalDish = fillDish(local, objectHtml);
            let resultLocalTouch = resultFillTouch(fillLocalTouch(franchise, local, objectHtml));

            
            textPost(URL_IMGTEXT, text, response => {
                wondowLoad.changeText('corte enviado');
            });

            jsonPost(`https://${URL}:443/SendCorteDoc365`, objectHtml, response => {
                console.log(response);
            });

            axios.get(`https://${URL}:4000/bot/voice/text=${`corte realizado por ${JSON.parse(localStorage.getItem('appManagerUser')).username}`}/type=simple`);

            textPost(URL_IMGTEXT, returnData('Indicadores por hora 📊'), response => {
                console.log(response);
            });
            
            createDivToDish(document.getElementsByTagName('body')[0], parentHtml => {
                printDivData(resultLocalDish, parentHtml, (elementHTML) => {});
                createImgTouch(resultLocalTouch, parentHtml);
                wondowLoad.changeText('creando imagenes');
                Array.from(parentHtml.children).forEach(item => {
                    const promises = [];

                    html2canvas(item)
                    .then(canvas => {
                        let image = canvas.toDataURL('image/jpeg', 0.5).split(';base64,')[1];
                        let formData = new FormData();
                        formData.append('my-file', image);
                        formData.append('my-text', item.getAttribute('name'));

                        axios.post(URL_IMGTEXT, formData)
                        .then(result => {
                            console.error(`POST ${`${URL}:4000/bot/img`} ${result.status}`);
                            item.remove();
                            clearInput(document.querySelector('.mainContain-form'));
                            boxModal.show('aviso', 'corte enviado con exito');
                        })
                        .catch(err => {
                            boxModal.show('Error', err.message);
                            console.log(err);
                        })
                        .finally(() => {
                            item.remove();
                            document.querySelector('.mainContain-form-btn').disabled = false;
                            keySubmit = true;
                            wondowLoad.closeWindowAwait();
                            
                            let close = setTimeout(() => {
                                parentHtml.remove();
                                clearTimeout(close);
                            }, 15000);
                        });

                    })
                    .finally(()=> {
                    
                    });
                });
            });

        }
    });
});  


//funcion que activas los input desabilitado mediante in escucha de evento 'change'
function changueInput(event){
    if(event.target.className === 'labelContain-checkbox'){
        let checkbok = event.target;
        if(checkbok.parentNode.children.length === 2){
            if(checkbok.checked){
                let input = event.target.parentNode.children[0];
                input.disabled = false;
                input.removeAttribute('placeholder');
            }
            else{
                let input = event.target.parentNode.children[0];
                input.disabled = true;
                input.setAttribute('placeholder', 'ausente');
            }
        }
        if(checkbok.parentNode.children.length === 3){
            if(checkbok.checked){
                let input1 = event.target.parentNode.children[0];
                input1.disabled = false;
                input1.setAttribute('placeholder', 'primeros toques');
                let input2 = event.target.parentNode.children[1];
                input2.disabled = false;
                input2.setAttribute('placeholder', 'otros toques');
            }
            else{
                let input1 = event.target.parentNode.children[0];
                input1.disabled = true;
                input1.setAttribute('placeholder', 'ausente');
                let input2 = event.target.parentNode.children[1];
                input2.disabled = true;
                input2.setAttribute('placeholder', 'ausente');
            }
        }
    }
}




//////////////////////////////// la funciones de abajo 👇 son complementos de la funcion printLocal 👆
//crea los input de precesos corto


function createHtml(elementHtml, object = {}, text){
    let element = document.createElement(elementHtml);
    let keys = Object.keys(object);
    keys.forEach(key => {
        element.setAttribute(key, object[key]);
    });
    if(text) element.textContent = text;
    return element;
}



//extrate los datos de una estructura HTML y retorna un array de objetos
function parseHtml(formHtml){
    let array = [];

    for(let i = 0; i < formHtml.children.length - 1; i++){
        if(formHtml.children[i].tagName === 'BUTTON') continue;
        let object = {};
        object.procesos = {};
        object.toques = {};
        object.order = formHtml.children[i].getAttribute('number');
        for(let j = 0; j < formHtml.children[i].children.length; j++){
            let item = formHtml.children[i].children[j];
            switch (item.getAttribute('name')){
                case 'title':
                    object.name = item.children[0].textContent || 0;
                    break;
                case 'rotaciones':
                    object.rotaciones = item.children[0].value || 0;
                    break
                case 'entrada':
                    object.procesos.entrada = item.children[0].value || 0;
                    break
                case 'plato fuerte':
                    object.procesos.platoFuerte = item.children[0].value || 0;
                    break
                case 'postre':
                    object.procesos.postre = item.children[0].value || 0;
                    break
                default:
                    break;
            }
            if(item.getAttribute('name') === 'toque'){
                if(item.children.length === 2){
                    let splitKey = item.children[0].name.split(' ');
                    let key = splitKey.join('_');
                    if(!item.children[0].disabled){
                        object.toques[key] = { total: item.children[0].value };
                    }
                    else{
                        object.toques[key] = 'ausente';
                    }
                }
                else if(item.children.length === 3){
                    let splitKey = item.children[0].name.split(' ');
                    let key = splitKey.join('_');
                    if(!item.children[0].disabled){
                        object.toques[key] = { primeros: item.children[0].value, otros: item.children[1].value };
                        if(item.children[1].value === '') object.toques[key] = { primeros: item.children[1].value, otros: item.children[0].value };
                    }
                    else{
                        object.toques[key] = 'ausente';
                    }
                }
            }     
        }
        array.push(object);
    }

    const orderArray =  array.sort(( x, y ) =>  {
        return x.order - y.order;
    });
    return(orderArray);
}


//limpia los input de datos tipo numer una vez que a enviado el corte a amazonas activo
function clearInput(formHtml){
    Array.from(formHtml.children).forEach(item => {
        Array.from(item.children).forEach(label => {
            if(label.tagName === 'LABEL'){
                if(label.children.length > 2){
                    label.children[0].value = '';
                    label.children[0].disabled = true;
                    label.children[1].value = ''
                    label.children[1].disabled = true;
                    label.children[2].checked = false;
                }
                else if(label.children.length > 1){
                    label.children[0].value = '';
                    label.children[0].disabled = true;
                    label.children[1].checked = false;
                }
                else{
                    label.children[0].value = '';
                }
            }
        });
    });
}


//combrierte un array de objetos a un string 
function arrayToString(array){
    const Month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun','Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const emo = [ '🔴', '🟠', '🟡', '🟢', '🔵','🟣' ,'⚫', '🟤', '⚪'];
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
    let dln = '\n';
    let text = `*_AppManager⚙️ 5.0.1 ©_*  ${dln}Corte de rotaciones y procesos por hora⏰ ${dln}Responsable: ${JSON.parse(localStorage.getItem('appManagerUser')).username}${dln}Turno: ${time} ${dln}Fecha: ${day}-${Month[month]}-${year} ${dln}Hora: ${hour}:${minute}:${second} ${dln} ${dln}`;
    array.forEach(data => {
        text += `${ emo[ Math.floor(Math.random() * 8) ] } *${data.name}* ${dln}`;
        text += `Rotaciones: ${data['rotaciones']}${dln}`;
        text += `Procesos: 👇🏻${dln}`;
        if(data.procesos['entrada']) text += `Entrada: ${data.procesos['entrada']} ${dln}`;
        if(data.procesos['platoFuerte']) text += `Plato fuerte: ${data.procesos['platoFuerte']}${dln}`;
        if(data.procesos['postre']) text += `Postre: ${data.procesos['postre']} ${dln}`;
        for(const key in data.toques){
            let textTouch = ''
            textTouch += `_${key.split('_').join(' ')} »_ `;
            if(data.toques[key] === 'ausente'){  
                textTouch += ` ausente${dln}`;
                text += textTouch;
                continue;
            }
            for (const keyChild in data.toques[key]) {
                textTouch += `${keyChild}: ${data.toques[key][keyChild]}${dln}`;
            }
            text += textTouch;
        }
        text += `${dln}`
    });
    return text;
}


function returnData(title){
    const Month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const date = new Date();
    let day = date.getDate();
    let month = date.getMonth();
    let year = date.getFullYear();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    if (day < 10) day = '0' + day;
    if (hour < 10) hour = '0' + hour;
    if (minute < 10) minute = '0' + minute;
    if (second < 10) second = '0' + second;
    return `*${title}*\nFecha: ${day}-${Month[month]}-${year} \nHora: ${hour}:${minute}:${second}👇`;
}

//arreglo de buffer a base64 para imagenes de bases de datos
function arrayBufferToBase64 ( buffer, contentType ){
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return `data:${contentType};base64,` + window.btoa(binary);
}


function fillDish(arrayLocal, arrayData){
    if(!arrayData.length || !arrayLocal.length) return [];
    let fillLocal = [];
    let returnArray  = [];
    for(let i = 0; i < arrayLocal.length; i++) {
        if(arrayLocal[i].dishMenu?.isRequiredeEvaluation){
            for(let j = 0; j < arrayData.length; j++){
                if(arrayData[j].name ===  arrayLocal[i].name) fillLocal.push(arrayData[j]);
            }
        }
    }
    fillLocal.forEach(result => {
        let totalProcessI = parseInt(result.procesos.entrada) + parseInt(result.procesos.platoFuerte) + parseInt(result.procesos.postre);
        let percentageAppetizerI = ((parseInt(result.procesos.entrada) / totalProcessI) * 100).toFixed(0);
        let percentageMainDishI = ((parseInt(result.procesos.platoFuerte) / totalProcessI) * 100).toFixed(0);
        let percentageDessertI = ((parseInt(result.procesos.postre) / totalProcessI) * 100).toFixed(0);
        let processAverageI = (totalProcessI / parseInt(result.rotaciones)).toFixed(1);
        if(isNaN(percentageAppetizerI)) percentageAppetizerI = 0;
        if(isNaN(percentageMainDishI)) percentageMainDishI = 0;
        if(isNaN(percentageDessertI)) percentageDessertI = 0;
        if(isNaN(processAverageI)) processAverageI = 0;
        let object = {
            name : result.name,
            tables : parseInt(result.rotaciones),
            precess: {
                appetizer: parseInt(result.procesos.entrada),
                mainDish: parseInt(result.procesos.platoFuerte),
                dessert: parseInt(result.procesos.postre),
                processTotal: totalProcessI,
            },
            resultEvaluation: {
                percentageAppetizer: percentageAppetizerI,
                percentageMainDish: percentageMainDishI,
                percentageDessert: percentageDessertI,
                processAverage:processAverageI
            }
        };
        returnArray.push(object);
    })
    return returnArray;
}
function fillLocalTouch(arrayFranch ,arrayLocal, arrayData){
    if(!arrayFranch.length || !arrayLocal.length) return [];
    let arrayEvaluationReturn = [];
    for(let i = 0; i < arrayLocal.length; i++) {
        if(!arrayLocal[i].touchs?.isRequiredeEvaluation) continue;
        for(let j = 0; j < arrayData.length; j++ ){
            if(arrayData[j].name === arrayLocal[i].name){
                arrayData[j].idLocal = arrayLocal[i].idLocal;
                if(arrayLocal[i].touchs.isEvaluationGroup){
                    arrayData[j].isEvaluationGroup = true;
                }
                else{
                    arrayData[j].isEvaluationGroup = false;
                };
                arrayData[j].franchise = arrayLocal[i].franchise;
                arrayData[j].lang = arrayLocal[i].lang;
            };
        }
    }
    for(let i = 0; i < arrayFranch.length; i++){
        let arrayFill = [];
        for(let j = 0; j < arrayData.length; j++ ){
            if(arrayData[j].idLocal === arrayFranch[i]._id){
                if(!arrayData[j].isEvaluationGroup){
                    arrayEvaluationReturn.push([arrayData[j]]);
                    continue;
                }
                arrayFill.push(arrayData[j]);
            }
        }
        if(!arrayFill.length) continue;
        arrayEvaluationReturn.push(arrayFill);
    }
    return arrayEvaluationReturn;
}


function resultFillTouch(array){
    if(array.length === undefined || typeof array !== 'object') throw 'Type error, parameter must receive an object array';
    if(!array.length) return [];
    let arrayReturn = [];
    array.forEach(arrayOfObject => {
        let arrayFill = [];
        arrayOfObject.forEach(data => {
            let object = {
                name: data.name,
                franchise: data.franchise,
                lang: data.lang,
                rotaciones: parseInt(data.rotaciones),
                resultEvaluation: []
            }
            for(const key in data.toques){
                if(typeof data.toques[key] !== 'string'){
                    let percentageFirst;
                    isNaN(Math.round((data.toques[key].primeros / data.rotaciones) * 100)) ? percentageFirst = 0 
                     : percentageFirst = Math.round((data.toques[key].primeros / data.rotaciones) * 100)
                     let percentageSecond;
                     isNaN(Math.round((data.toques[key].otros / data.rotaciones) * 100)) ? percentageSecond = 0 
                      : percentageSecond = Math.round((data.toques[key].otros / data.rotaciones) * 100)
                    let objectTouchs = {
                        name : key,
                        first: {
                            amount: parseInt(data.toques[key].primeros),
                            percentage: percentageFirst
                        },
                        second: {
                            amount: parseInt(data.toques[key].otros),
                            percentage: percentageSecond
                        }
                    }
                    object.resultEvaluation.push(objectTouchs);
                }
            }
            arrayFill.push(object);
        });
        arrayReturn.push(arrayFill);
    });
    return arrayReturn;
}


function createDivToDish(elementHtml, callback){
    let divConntains  = document.createElement('div');
    divConntains.classList.add('containImg');
    elementHtml.appendChild(divConntains);
    callback(document.querySelector('.containImg'));
}


function printDivData(arrayData, elementHtml, callback){
    if(!arrayData.length) return 0;
    let divData = document.createElement('div');
    divData.classList.add('containData');
    divData.setAttribute('name', 'Indicadores de procesos');
    let header = document.createElement('div');
    header.classList.add('containData-header')
    let headerTitle = document.createElement('p');
    headerTitle.classList.add('containData-headerTitle')
    headerTitle.textContent = 'Indicadores de proceso 📊';
    header.appendChild(headerTitle);
    header.appendChild(headerTitle);
    divData.appendChild(header);
    arrayData.forEach(data => {
        let divbox = document.createElement('div');
        divbox.classList.add('box');
        let divContain = document.createElement('div');
        divContain.classList.add('containData-local');
        if(data.name === 'Bocas Brickell') divContain.style.order = 6;
        let nameContain = document.createElement('div');
        nameContain.classList.add('containData-nameContain');
        let name = document.createElement('p');
        name.classList.add('containData-name');
        name.textContent = data.name;
        nameContain.appendChild(name);
        divContain.appendChild(nameContain);

        let firts = document.createElement('div');
        firts.classList.add('containData-columns');
        printDataDish('rotaciones', data.tables ,firts);
        printDataDish('total de procesos', data.precess.processTotal ,firts);
        printDataDish('promedio de procesos', data.resultEvaluation.processAverage, firts);
        let second = document.createElement('div');
        second.classList.add('containData-columns');
        printDataDish('Nº de entrada', data.precess.appetizer ,second);
        printDataDish('Nº de plato fuerte', data.precess.mainDish ,second);
        printDataDish('Nº de postre', data.precess.dessert, second);
        let third = document.createElement('div');
        third.classList.add('containData-columns');
        printDataDish('% de entrada', data.resultEvaluation.percentageAppetizer, third);
        printDataDish('% de plato fuere', data.resultEvaluation.percentageMainDish ,third);
        printDataDish('% postre', data.resultEvaluation.percentageDessert, third);
        divbox.appendChild(firts);
        divbox.appendChild(second);
        divbox.appendChild(third);
        divContain.appendChild(divbox);
        divData.appendChild(divContain);
    });
    elementHtml.appendChild(divData);
    callback(document.querySelector('.containData'));
}
function printDataDish(keyData, data, elementHtml){
    let divContain = createHtml('div', { class: 'containData-dataContain', name: 'Indicadores de procesos' })
    let divKey = createHtml('div', { class: 'containData-divKey'});
    let divData = createHtml('div', { class: 'containData-divKey data'});
    let key = createHtml('p', { class: 'containData-data'}, keyData);
    let dataText = createHtml('p', { class: 'containData-data containData-dataText'}, keyData);
    if(keyData === 'promedio de procesos') {
        if(data < 2.4){
            dataText.style.color = 'rgb(195, 0, 0)';
            dataText.textContent = `${data} ⬇`;
        }
        else{
            dataText.style.color = 'rgb(3, 173, 8)';
            dataText.textContent = `${data} ⬆`;
        }
    }
    else{
        dataText.textContent = data;
    }
    divKey.appendChild(key);
    divData.appendChild(dataText);
    divContain.appendChild(divKey);
    divContain.appendChild(divData);
    elementHtml.appendChild(divContain);
}


function createImgTouch(array, elementHtml){
    if(array.length === 0 || array.length === undefined || typeof array !== 'object'){
        console.error('Type error, parameter must receive an object array')
        return;
    }
    let headersTitles = [];
    array.forEach(arrayChild => {
        let name = '';
        console.trace(arrayChild[0].lang);
        if(arrayChild.length > 1){
            
            arrayChild[0].lang === 'es' ? 
            name = `Indicadores de ${arrayChild[0].franchise}`
            : name = `Manager visit tables ${arrayChild[0].franchise}`
        }
        else{
            name = `Indicadores de ${arrayChild[0].name}`
        }
        let divConntains = createHtml('div', { class:'imgContain', name: name})
        let divHeader = createHtml('div', { class:'divHeader-titleContain'});
        let pHeader = createHtml('p', { class:'imgContain-title'}, `${arrayChild[0].lang === 'es' ? 'Indicadores de toques de gerente 📈' : 'Manager visit tables 📈'}`);
        divHeader.appendChild(pHeader);
        divConntains.appendChild(divHeader);
        for (let i = 0; i < arrayChild.length; i++) {
            let localContain = createHtml('div', { class:'imgContain-local'});
            let header = createHtml('div', { class:'imgContain-headerLocal'});
            header.style.backgroundColor = '#fff';
            let titleHeader = createHtml('p', { class:'imgContain-headerText'},`${arrayChild[i].lang === 'es' ? 'Restaurante': 'Restaurant'}: ${arrayChild[i].name}`)
            let countTables = createHtml('p', { class:'imgContain-headerText'},`${arrayChild[i].lang === 'es' ? 'Nº rotaciones': 'Nº rotations'}: ${arrayChild[i].rotaciones}`);
            header.appendChild(titleHeader);
            header.appendChild(countTables);
            localContain.appendChild(header);
            let divManagerTitle = createHtml('div', { class:'imgContain-touchContain title'});
            
            arrayChild[i].lang === 'es' ? headersTitles = ['Manager', 'Primer toques', '%', 'Otros toques', '%'] :
            headersTitles = ['Manager', 'First touch', '%', 'Others touch', '%'];

            headersTitles.forEach(title => {
                let divTitle = document.createElement('div');
                divTitle.classList.add('imgContain-touchTitleContain');
                let pTitle = document.createElement('p');
                pTitle.classList.add('imgContain-touchTitleP');
                pTitle.textContent = title;
                divTitle.appendChild(pTitle);
                divManagerTitle.appendChild(divTitle);
            });
            localContain.appendChild(divManagerTitle);
            let divResult = document.createElement('div');
            divResult.classList.add('imgContain-touchContain');
            if(!arrayChild[i].resultEvaluation.length){
                let pNegation = document.createElement('p');
                pNegation.classList.add('text-negation-reastulText');
                localContain.appendChild(pNegation);
                pNegation.textContent = `${arrayChild[i].lang === 'es' ? 'Gerentes ausentes': 'Absence of manager'} ${arrayChild[i].name}`
                divConntains.appendChild(localContain);
                continue;
            }
            arrayChild[i].resultEvaluation.forEach(managerResult => {
                let divResult = document.createElement('div');
                divResult.classList.add('imgContain-touchContain');
                let divName = document.createElement('div');
                divName.classList.add('imgContain-touchTitleContain');
                let pName = document.createElement('p');
                pName.classList.add('imgContain-touchTitleP');
                pName.textContent = managerResult.name.split('_').join(' ');
                pName.style.fontWeight = 'bold';
                divName.appendChild(pName);
                let divFirst = document.createElement('div');
                divFirst.classList.add('imgContain-touchTitleContain');
                let pFirst = document.createElement('p');
                pFirst.textContent = managerResult.first.amount;
                pFirst.classList.add('imgContain-touchTitleP');
                divFirst.appendChild(pFirst);
                let divFirstPercentage = document.createElement('div');
                divFirstPercentage.classList.add('imgContain-touchTitleContain');
                let pFirstPercentage = document.createElement('p');
                pFirstPercentage.textContent = managerResult.first.percentage;
                if(managerResult.first.percentage > 70){
                    pFirstPercentage.style.color = '#0DC607';
                }
                else{
                    pFirstPercentage.style.color = '#C6070A';
                }
                pFirstPercentage.classList.add('imgContain-touchTitleP');
                divFirstPercentage.appendChild(pFirstPercentage);
                let divSecond = document.createElement('div');
                divSecond.classList.add('imgContain-touchTitleContain');
                let pSecond = document.createElement('p');
                pSecond.textContent = managerResult.second.amount;
                pSecond.classList.add('imgContain-touchTitleP');
                divSecond.appendChild(pSecond);
                let divSecondPercentage = document.createElement('div');
                divSecondPercentage.classList.add('imgContain-touchTitleContain');
                let pSecondPercentage = document.createElement('p');
                pSecondPercentage.textContent = managerResult.second.percentage;
                pSecondPercentage.classList.add('imgContain-touchTitleP');
                divSecondPercentage.appendChild(pSecondPercentage);
                divResult.appendChild(divName);
                divResult.appendChild(divFirst);
                divResult.appendChild(divFirstPercentage);
                divResult.appendChild(divSecond);
                divResult.appendChild(divSecondPercentage);
               localContain.appendChild(divResult);
            });
            divConntains.appendChild(localContain);
        }
        elementHtml.appendChild(divConntains);
    });
}
///////////////////////////////////////////////////////////////////////////////////////////////////
function LiveYarvis(callback) {
    axios.get(`https://${URL}:4000/`)
        .then(result => {
            callback();
        })
        .catch(err => {
            callback(err);
        });
}


async function jsonPost(url, object , callback){
    try {
        if(typeof object !== 'object' || typeof url !== 'string') throw 'Type error, in the params';
        if(url === null || object === null || callback === null) throw 'the function must receive at least 3 parameters';
        if(url === '') throw 'error, url is invalid';
        let objectNew = {
            corte: object,
            date: new Date(),
            userId: JSON.parse(localStorage.getItem('appManagerUser'))['userId']
        }
        const post = await axios.post(url ,  objectNew);
        console.log(post);
        callback(post);
    } 
    catch (error) {
        console.log(err);
    }
    
}


async function textPost(url, text, callback){
    if(typeof text !== 'string' || typeof url !== 'string') throw 'Type error, in the params';
    if(url === null || text === null || callback === null) throw 'the function must receive at least 3 parameters';
    if(url === '') throw 'error, url is invalid';
    let formData = new FormData();
    formData.append('my-text', text);
    const post = await axios.post(url, formData);
    callback(post);
}

function writeInput(formHtml){ // this function is deprecated
    Array.from(formHtml.children).forEach(item => {
        const rotacion = Math.floor(Math.random() * 50);
        Array.from(item.children).forEach(label => {
            if(label.tagName === 'LABEL'){
                if(label.children.length > 2){
                    label.children[0].value = rotacion - 2;
                    label.children[0].disabled = false;
                    label.children[1].value = ''
                    label.children[1].disabled = false;
                    label.children[2].checked = true;
                }
                else if(label.children.length > 1){
                    label.children[0].value = rotacion -5;
                    label.children[0].disabled = false;
                    label.children[1].checked = false;
                }
                else{
                    label.children[0].value = rotacion;
                }
            }
        });
    });
}