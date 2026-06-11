import { DomManipulation } from '/utils/createHtml.js';


function createWindow( elementHtmlFather, callback ){
    
    let btnClose = DomManipulation.createHtml('button', { class: 'window-create_btnDelete' }, 'X');
    btnClose.addEventListener('click', closeWindow);
    let window = DomManipulation.createHtml('div', { class: 'window-create' }, null, [ btnClose ]);
    elementHtmlFather.appendChild(window);
    callback(window);

    function closeWindow(){
        window.remove();
        btnClose.removeEvenListener('click', closeWindow);
    }
}


function createImg(elementHtmlFather, img){
    let div =  DomManipulation.createHtml('div', { class: 'div-img-preview' });
    let imgPreview = DomManipulation.createHtml('img', { class: 'img-preview-window', src: img.src });
    let imgContain = DomManipulation.createHtml('div', { class: 'imgContain' });
   
    Array.from(img.parentNode.children).forEach(src => {
        let img = DomManipulation.createHtml('img', { class: 'imgContain-img', 'tabindex': 0, src: src.src });
        imgContain.appendChild(img);
    });
    div.appendChild(imgPreview);
    div.appendChild(imgContain);
    elementHtmlFather.appendChild(div);
}


function createFormInput(elementHtmlFather, locals){


    const createInpust = (object, elementForm) => {
        let label = DomManipulation.createHtml('label', { class: 'form-label' } , object.textLabel);
        let input = DomManipulation.createHtml(object.input || '', { class: object.className || 'form-input', name: object.nameInput } );
        input.classList.add(object.className || 'form-input');
        if(object.id) input.id = object.id;
        if(object.typeInput) input.setAttribute('type', object.typeInput);
        if(object.input === 'select'){
            input.appendChild(object.option);
        }
        label.appendChild(input);
        elementForm.appendChild(label);
    }


    const createOption = (array) => {
        console.log(array);
        let selectFragment = document.createDocumentFragment();
        array.forEach(option => {
            console.log(option);
            let line;
            if(typeof option === 'object'){
                line = DomManipulation.createHtml('option', {}, option.name);
                if(option._id) line.value = option._id;
            }
            else{
                line = DomManipulation.createHtml('option', {}, option);
            }
            selectFragment.appendChild(line);
        })
        return selectFragment;
    };


    let form = DomManipulation.createHtml('form', { class:'form' });
    let inputContain = DomManipulation.createHtml('div', { class: 'form-inputContain', id: 'father-localAlternative' });

    let title = DomManipulation.createHtml('h1', { class: 'form-inputContainTitle' }, 'Datos del nuevo gerente');
    title.textContent = 'Datos del nuevo gerente';
    title.classList.add('form-inputContainTitle');
    inputContain.appendChild(title);

    createInpust({ textLabel: 'Nombre del manager', input: 'input', typeInput: 'text', nameInput: 'name' }, inputContain);
    createInpust({ textLabel: 'Numero de jerarquia', input: 'input', typeInput: 'number', nameInput: 'numberManager' }, inputContain);
    createInpust({ textLabel: 'Tipo de cargo', input: 'select', typeInput: '', nameInput: 'burden', option: createOption(['Gerente', 'Asistente', 'Sommelier'])}, inputContain);
    createInpust({ textLabel: 'Caracteristeca del manager', input: 'input', typeInput: 'text', nameInput: 'characteristic', }, inputContain);
    createInpust({ textLabel: 'Actividad del manager', input: 'select', typeInput: '', nameInput: 'status', option: createOption(['Activo', 'Inactivo'])}, inputContain);
    createInpust({ textLabel: 'Plaza perteneciente', input: 'select', typeInput: '', nameInput: 'localName', option: createOption(locals.map(element => element)) }, inputContain);
    createInpust({ textLabel: 'Agregar otras plazas', input: 'select', typeInput: '', nameInput: '', id: 'select-local-alternative', className: 'select-local-alternative', option: createOption(locals.map(element => element)) }, inputContain);
    let divLocalAlternative = DomManipulation.createHtml('div', { class: 'form-inputContain-divLocalAlternative' });
    
    inputContain.appendChild(divLocalAlternative);
    
    let divContainImg =  DomManipulation.createHtml('div', { class: 'form-divContainImg',  });
    let dropZone = DomManipulation.createHtml('div', { class: 'form-divZoneDrop', id: 'zone-drop' });
    let img = DomManipulation.createHtml('img', { class: 'form-divZoneDrop-img', draggable: false, src: 'img/drop-file.png' });
    const divImgspreview = DomManipulation.createHtml('div', { class: 'form-divImgspreview' } );
    let btnSubmit = DomManipulation.createHtml('button', { class: 'form-btnSubmit' }, 'Guardar');
    dropZone.appendChild(img);
    divContainImg.appendChild(dropZone);
    divContainImg.appendChild(divImgspreview);
    divContainImg.appendChild(btnSubmit);
    form.appendChild(inputContain);
    form.appendChild(divContainImg);
    elementHtmlFather.appendChild(form);
}



const insertImg = (src, name ,elementHtml) => {
    let img = DomManipulation.createHtml('img', { class: 'img-preview', tabindex: "0", draggable: false, id: 'img-preview-click', src: src });
    let btnDelete = DomManipulation.createHtml('button', { class: 'img-preview-deletebtn', type: 'button', title: 'Eliminar foto' }, 'x');
    let imgContain = DomManipulation.createHtml('div', { class: 'img-previewDiv', name, name }, null, [ img, btnDelete ]);
    elementHtml.appendChild(imgContain);
};


function printPutDataManager(dataManager){
    console.log(dataManager);
}


export { createWindow, createImg, createFormInput, insertImg, printPutDataManager };


