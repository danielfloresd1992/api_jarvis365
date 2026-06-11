import {  DomManipulation } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
const required = false;

function printLocalI(local){
            
    if(local !== null) {

        let localContain = DomManipulation.createHtml('div', { class: 'localContain', number: local.order });
        localContain.style.order = local.order;
        let divName =  DomManipulation.createHtml('div', { class: 'localContain-TitleContain', name: 'title' });
        let nameTitle = DomManipulation.createHtml('p', { class: 'TitleContain-p' }, local.name);

        let imgTitle = DomManipulation.createHtml('img', { class: 'TitleContain-img', src : arrayBufferToBase64(local.img.data.data, local.img.contentType) });
        divName.appendChild(nameTitle);
        divName.appendChild(imgTitle);
        let labelRotaciones = DomManipulation.createHtml('label', { class: 'localContain-labelContain', name: 'rotaciones' }, 'Nº de rotaciones');
        let inputRotaciones = DomManipulation.createHtml('input', { class: 'labelContain-input', type: 'number', required: required });

        labelRotaciones.appendChild(inputRotaciones);
        localContain.appendChild(divName);
        localContain.appendChild(labelRotaciones);
        local.dishMenu.dishEvaluation === 'simple' ? inputDish(localContain, local.dishMenu) : prinInputComplete(localContain, local.dishMenu);
    
        if(local.managers.length){
            local.touchs.typeEvaluationTouch === 'simple' ? inputTouch(localContain, local.managers, false) : inputTouch(localContain, local.managers, true);
        }
        else{
            if(local.touchs.typeEvaluationTouch === 'simple'){
                for(let i = 0; i < local.touchs.totalManager; i++){
                    let label = DomManipulation.createHtml('label', {class: 'localContain-labelContain', name: 'toque'} ,`Nº de toques de Gerente ${i + 1}`)
                    let input = DomManipulation.createHtml('input', {class: 'labelContain-input input-reduxe',disabled: 'true',required:required, name: `Gerente ${i + 1}`, type:'number', placeholder: 'ausente', id: 'touchs'});
                    let inputCheck = DomManipulation.createHtml('input', {class: 'labelContain-checkbox', type:'checkbox'});
                    label.appendChild(input)
                    label.appendChild(inputCheck);
                    localContain.appendChild(label);
                }
                for(let i = 0; i < local.touchs.totalAttendee; i++){
                    let label = DomManipulation.createHtml('label', {class: 'localContain-labelContain',name: 'toque'} ,`Nº de toques de Asistente ${i + 1}`);
                    let input = DomManipulation.createHtml('input', {class: 'labelContain-input input-reduxe',disabled: 'true',required:required, name: `Asistente ${i + 1}`, type:'number', placeholder: 'ausente', id: 'touchs'});
                    let inputCheck = DomManipulation.createHtml('input', {class: 'labelContain-checkbox', type:'checkbox'});
                    label.appendChild(input)
                    label.appendChild(inputCheck);
                    localContain.appendChild(label);
                }
            }
            else{
                for(let i = 0; i < local.touchs.totalManager; i++){
                    let label = DomManipulation.createHtml('label', {class:'localContain-labelContain',name: 'toque'} ,`Nº de toques de Gerente ${i + 1}`);
                    let input1 = DomManipulation.createHtml('input', {class:'labelContain-input input-reduxe40',name: `Gerente ${i + 1} `, required: required, disabled: true, type: 'number', placeholder: 'ausente', id: 'touchsFirst'});
                    let input2 = DomManipulation.createHtml('input', {class:'labelContain-input input-reduxe40 toLeft',name: `Gerente ${i + 1} `, required: required, disabled: true, type: 'number', placeholder: 'ausente', id: 'touchsSecond'});
                    let inputCheck = DomManipulation.createHtml('input', {class: 'labelContain-checkbox', type:'checkbox'});
                    label.appendChild(input1);
                    label.appendChild(input2);
                    label.appendChild(inputCheck);
                    localContain.appendChild(label);
                }
                for(let i = 0; i < local.touchs.totalAttendee; i++){
                    let label = DomManipulation.createHtml('label', {class:'localContain-labelContain',name: 'toque'} ,`Nº de toques de Asistente ${i + 1}`);
                    let input1 = DomManipulation.createHtml('input', {class:'labelContain-input input-reduxe40',name: `Asistente ${i + 1} `, required: required, disabled: true, type: 'number', placeholder: 'ausente', id: 'touchsFirst'});
                    let input2 = DomManipulation.createHtml('input', {class:'labelContain-input input-reduxe40 toLeft',name: `Asistente ${i + 1} `, required: required, disabled: true, type: 'number', placeholder: 'ausente', id: 'touchsSecond'});
                    let inputCheck = DomManipulation.createHtml('input', {class: 'labelContain-checkbox', type:'checkbox'});
                    label.appendChild(input1);
                    label.appendChild(input2);
                    label.appendChild(inputCheck);
                    localContain.appendChild(label);
                }
            }
        }
        return localContain;
    }
}


function inputDish(elementHtml,object){
    let labelProcesos = DomManipulation.createHtml('label', { class: 'localContain-labelContain', name: `${object.mainDish.toLowerCase()}` }, `Nº de procesos ${object.mainDish.toLowerCase()}`);

    let inputProcesos = DomManipulation.createHtml('input', { class: 'labelContain-input', required: required, type: 'number', name: `${object.mainDish.toLowerCase()}` });
    inputProcesos.classList.add('labelContain-input');
    inputProcesos.required = required;
    inputProcesos.setAttribute('type', 'number');
    inputProcesos.setAttribute('name', `${object.mainDish.toLowerCase()}`);
    inputProcesos.setAttribute('id', 'plato');

    labelProcesos.appendChild(inputProcesos);
    elementHtml.appendChild(labelProcesos);
}
//crea los input de precesos largo
function prinInputComplete(elementHtml, object){
    let arrayObject = [object.appetizer, object.mainDish, object.dessert];
    let arrayMenu = ['entrada', 'plato fuerte', 'postre'];
    for(let i = 0; i < arrayObject.length; i++){
        let labelProcesos = DomManipulation.createHtml('label', { class: 'localContain-labelContain', name: `${arrayMenu[i].toLowerCase()}` }, `Nº de procesos ${arrayObject[i].toLowerCase()}`);
        let inputProcesos = DomManipulation.createHtml('input', { class: 'labelContain-input', required: required, type: 'number', name: `${arrayObject[i].toLowerCase()}`, id: 'plato'});
        labelProcesos.appendChild(inputProcesos);
        elementHtml.appendChild(labelProcesos);
    }
}

//crea los input de toques
function inputTouch(elementHtml, object, boolean){
    let objectFill = object.sort((a , b) => {
        return a.numberManager - b.numberManager;
    });
    print(objectFill.filter(manager => manager.burden === 'Gerente' && manager.status === 'Activo'));
    print(objectFill.filter(manager => manager.burden === 'Asistente' && manager.status === 'Activo'));
    function print(array){
        array.forEach(manager => {
            let label = DomManipulation.createHtml('label', { class: 'localContain-labelContain', name: 'toque' }, `Nº de toques ${manager.burden} ${manager.name}`);
            if(boolean){
                let input1 = DomManipulation.createHtml('input', { class: 'labelContain-input input-reduxe40', required: required, type: 'text', placeholder: 'autente',
                name: `${manager.burden} ${manager.name}`, id: 'touchsFirst', type:'text', disabled: true });
                label.appendChild(input1);

                let input2 = DomManipulation.createHtml('input', { class: 'labelContain-input input-reduxe40 toLeft', required: required, type: 'text', placeholder: 'autente',
                name: `${manager.burden} ${manager.name}`, id: 'touchsSecond', disabled: true });
                label.appendChild(input2);

                let inputCheck = DomManipulation.createHtml('input', { class: 'labelContain-checkbox', type: 'checkbox' });
                label.appendChild(inputCheck);
                elementHtml.appendChild(label);
            }
            else{
                let input = DomManipulation.createHtml('input', { class: 'labelContain-input input-reduxe', required: required, type: 'text', placeholder: 'autente',
                name: `${manager.burden} ${manager.name}`, id: 'touchs', disabled: true});
                label.appendChild(input);
                let inputCheck = DomManipulation.createHtml('input', { class: 'labelContain-checkbox', type: 'checkbox' });
                label.appendChild(inputCheck);
                elementHtml.appendChild(label);
            }
            elementHtml.appendChild(label);
        });
    }
}

export { printLocalI };