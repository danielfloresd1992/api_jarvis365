'use strict';
import nameUrl from '/utils/url_api.js' ;
import BoxModal from "/utils/window_boxModal/boxModal.js";
import { WindowLoanding } from "/utils/window_await/window_await.js";
const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
const windowLoanding = new WindowLoanding(document.getElementsByTagName('body')[0], {
    ballColor: '#005aff'
});

windowLoanding.insertStyle();

let franchise = [];
let local = [];
let keySubmit = true;

let file = null;
let img = document.createElement('img');
img.src = '../img/default.jpg'
fetch(img.src)
.then(res => res.blob())
.then(blob => {
    img = new File([blob], 'dot.png', blob);
})

const getFranchise = async => {
    axios.get(`https://${nameUrl}/franchise`)
    .then(result => {
        franchise = [...result.data];
        printFranchiseAside(result.data,document.querySelector(".asideFranchise-ul"),"asideFranchise-li");
    })
    .catch(err=> console.log(err));
};


function createFranchise(elementHtml, callback){
    axios.post(`https://${nameUrl}/franchise`, {
        name: elementHtml.children[1].value,
        location:  elementHtml.children[3].value
    })
    .then(response => {
        console.log(response);
        if(response.status === 200) {
            mensForm("Franquicia creada con exito!",document.querySelector(".window-create"), true);
            getFranchise();
        }
    })
    .catch(err => {
        if(err.response.status === 400) return document.getElementById("form-mesj").textContent = err.response.data;
        callback(err)
    })
    .finally(() => {
        keySubmit = true;
    });
};


function deleteFranchise(franc){
    if(keySubmit){
        keySubmit = false;
        let fillFranchise = franchise.filter((result) => result.name === franc);
        axios.delete(`https://${nameUrl}/${fillFranchise[0]._id}`)
        .then(response => {
            if(response.status === 200){
                getFranchise();
                mensForm("La franquicia fue eliminada de la coleción!",document.querySelector(".window-create"), true);
            }
            else if(response.status === 400){
                mensForm("La franquicia fue eliminada de la coleción!",document.querySelector(".window-create"), false);
            }
        })
        .catch((err) => {
            console.log(err)
            mensForm(err.response.data ,document.querySelector(".window-create"), false);
        })
        .finally(() => {
            keySubmit = true;
        });
    }
}


const getLocal = async () => {
    axios.get(`https://${nameUrl}/local`)
    .then((result) => {
        local = [...result.data];
        printLocal(result.data, document.querySelector('.main-localContain'));
        windowLoanding.closeWindowAwait();
    })
    .catch((err) => console.log(err));
};


const createLocal = (form, callback) => {
    let formData = new FormData(form);
    if(file === null){
        formData.append('img', img);
    }
    else{
        formData.append('img', file);
    }
    axios.post(`https://${nameUrl}/local`, formData)
        .then(async response => {
            if(response.status === 200){
                resetAplicationAlert();
                mensForm("Local creado con exito!",document.querySelector(".window-create"), true);
                renderContainerLocal(document.querySelector('.main-localContain'), 'main-localContain-header');
                getLocal();
                file = null;
                
            }
            
        })
        .catch(err => { 
            if(err.response.status === 400) return document.getElementById('alert-locales').textContent = `❌ ${err.response['data']}`;

            callback(err)
        })
        .finally(() => {
            keySubmit = true;
        });
};


const putLocal = (form, callback) => {
    let formData = new FormData(form);
    formData.append('_id', form.getAttribute('name'))
    formData.append('img', file); 
    axios.put(`https://${nameUrl}/local/${form.getAttribute('name')}`, formData)
    .then(async response => {
        console.log(response);
        form.remove();
        resetAplicationAlert();
        mensForm("¡Local actualizado!",document.querySelector(".window-create"), true);
        renderContainerLocal(document.querySelector('.main-localContain'), 'main-localContain-header');
        getLocal();
        file = null;
        await axios.get('https://72.68.60.254/local-cache/activate=true');
    })
    .catch(err => {
        callback(err);
    })
    .finally(() => {
        windowLoanding.closeWindowAwait();
        keySubmit = true;
    });
};


const deleteLocal = ( localName, callback ) => {
    if(keySubmit){
        keySubmit = false;
        let fillLocal = local.filter(result => result.name === localName);
        axios.delete(`https://${nameUrl}/local/${fillLocal[0]._id}`)
        .then(response => {
            callback(response, null)
        })
        .catch(err => {
            console.log(err);
            callback(null, err)
        })
        .finally(()=> {
            keySubmit = true;
        });
    }
};


window.addEventListener("DOMContentLoaded", () => {
    getFranchise();
    getLocal();

    windowLoanding.createWindow('Cargando datos de locales');

    document.querySelector(".main-aside").addEventListener("click", e => {
        if(e.target.textContent === "Crear franquicia") createInputFranchise(createWindowForm(true, 'franchise'));
        if(e.target.textContent === "Crear local") printInputLocal(createWindowForm(true, 'local'));
        
        if(e.target.id === 'fill-franchise') fillPrintFranchise(e.target, local);

        if(e.target.id === 'delete-franchise'){
            let franc = e.target.parentNode.getAttribute('name');
            printDeleteDocument(createWindowForm(),e.target.parentNode.children[0].textContent, element => {
                    element.addEventListener("click", e => {
                        if(e.target.textContent === "Cancelar") closeWindow();
                        if(e.target.textContent === "Confirmar") deleteFranchise(franc);
                    });
                }
            )
        }
    });

    document.querySelector('.main-localContain').addEventListener('click', e => {
        if(e.target.className  === 'localContain-img') showImg(document.getElementsByTagName('body')[0] , e.target)

        if(e.target.className === 'localContain-btnDeletLocal') {
            let name = e.target.parentNode.parentNode.children[1].textContent;
            printDeleteDocument(createWindowForm(), name, ( element ) => { element.addEventListener("click", e => {

                        if(e.target.textContent === "Cancelar") closeWindow();
                        if(e.target.textContent === "Confirmar") deleteLocal( name, (data, err) => {

                            if( err ) return boxModal.show('error', err.response.data);

                            mensForm("Local eliminado de la coleción!",document.querySelector(".window-create"), true);
                            renderContainerLocal(document.querySelector('.main-localContain'), 'main-localContain-header');
                            getLocal();
                        });
                    });
                }
    )}

        if(e.target.className === 'localContain-btnDeletLocal put') { 
            createWindowSubmit(async parentHtml => {
                const local = await axios.get(`https://${nameUrl}/local/id=${e.target.parentNode.parentNode.getAttribute('name')}`)
                if(local.status === 200) showLocal(local.data, parentHtml);
            });
        }
    });



    document.getElementsByTagName('body')[0].addEventListener('dragenter', e => {
        e.preventDefault();
        if(e.target.id === 'window-create_imgPreview') e.target.parentNode.classList.add('drag-enter');
    });


    document.getElementsByTagName('body')[0].addEventListener('dragover', e => {
        e.preventDefault();
    });



    document.getElementsByTagName('body')[0].addEventListener('dragleave', e => {
        e.preventDefault();
        if(e.target.id === 'window-create_imgPreview') e.target.parentNode.classList.remove('drag-enter');
    });

    
    document.getElementsByTagName('body')[0].addEventListener('drop', e => {
        e.preventDefault();

        file = e.dataTransfer.files[0];
        let canvas = e.target;
        if(e.target.id === 'window-create_imgPreview'){
            e.target.parentNode.classList.remove('drag-enter');
            let fileReader = new FileReader();
            fileReader.readAsDataURL(e.dataTransfer.files[0]);
            fileReader.addEventListener("load", e => {
                canvas.src = e.target.result;
            });
        }
    });

    document.getElementsByTagName("body")[0].addEventListener('submit', e => {
       e.preventDefault();
       console.log(e.target.id);
       if(keySubmit){
            keySubmit = false;

            switch (e.target.id) {
                case 'put-local': windowLoanding.createWindow('Conectando con el servidor'); putLocal(e.target, (err) => { 
                    if(err){
                        return boxModal.show('error', err.response.data) 
                    }
                }); break;
                case 'create-local': createLocal(e.target,  (err) => { if(err) return boxModal.show('error', err.response.data) }); break;
                case 'franchise': createFranchise(e.target,  (err) => { if(err) return boxModal.show('error', err.response.data) }); break;
                default:
                    break;
            }
        }
    });
});


function showImg(elementHtml, elementImg){
    let divContentImg = document.createElement('div');
    divContentImg.classList.add('window-showImg');
    let btnClose = document.createElement('button');
    btnClose.classList.add('window-create_btnDelete');
    btnClose.setAttribute('id', 'btnClosWin');
    btnClose.classList.add('window-showImg-btnClose');
    btnClose.setAttribute('title', 'Close window');
    btnClose.textContent = 'X';
    let img = document.createElement('img');
    img.classList.add('window-showImg-img');
    img.src = elementImg.src;
    divContentImg.appendChild(btnClose);
    divContentImg.appendChild(img);
    elementHtml.appendChild(divContentImg);
    document.getElementById("btnClosWin").addEventListener("click", closeWindow);
}
//FUNCIONES DESACOPLADAS
function closeWindow(){
    document.getElementById("btnClosWin").parentNode.remove();
    if(file) file = null;
}
function createWindowForm(boolean, nameForm) {
    const body = document.getElementsByTagName("body")[0];
    let window = document.createElement("div");
    window.classList.add("window-create");
    let btnDelWin = document.createElement("button");
    btnDelWin.classList.add("window-create_btnDelete");
    btnDelWin.textContent = "X";
    btnDelWin.setAttribute("title", "Close window");
    btnDelWin.setAttribute("id", "btnClosWin");
    let form;
    boolean
        ? form = document.createElement("form")
        :form = document.createElement("div");
    form.classList.add("window-create_form");
    form.setAttribute("method", "post");
    form.setAttribute("id", nameForm);
    form.setAttribute("enctype", "multipart/form-data");
    window.appendChild(form);
    window.appendChild(btnDelWin);
    body.appendChild(window);
    document.getElementById("btnClosWin").addEventListener("click", closeWindow);
    return document.querySelector(".window-create_form");
}

function createWindowSubmit(callback){
    const body = document.getElementsByTagName("body")[0];
    let window = document.createElement("div");
    window.classList.add("window-create");
    let btnDelWin = document.createElement("button");
    btnDelWin.classList.add("window-create_btnDelete");
    btnDelWin.textContent = "X";
    btnDelWin.setAttribute("title", "Close window");
    btnDelWin.setAttribute("id", "btnClosWin");
    window.appendChild(btnDelWin);
    body.appendChild(window);
    document.getElementById("btnClosWin").addEventListener("click", closeWindow);
    callback(window);
}

function mensForm(text, window, boolean){
    window.children[0].remove();
    let div = document.createElement("div");
    div.classList.add("window-boxModal");
    let textMsm = document.createElement("p");
    textMsm.classList.add("boxModal-text");
    textMsm.textContent = text;
    let img = document.createElement("img");
    img.classList.add("boxModal-img");
    img.src = "crudLocal/ok.svg";
    div.appendChild(textMsm);
    if(boolean) div.appendChild(img);
    let divBtn = createHtml('div', {class:'divBtn'});
    let btnOk = createHtml('button', {class: 'divBtn-btn'}, 'X');
    btnOk.onclick = (e) => {
        e.target.parentNode.parentNode.parentNode.remove();
    }
    divBtn.appendChild(btnOk);
    div.appendChild(divBtn);
    window.appendChild(div);
}

function printFranchiseAside(array, element, classCss){
    if (element.children.length){
        for(let i = element.children.length - 1;element.children.length - 1 >= 0;i--){
            element.children[i].remove();
        }
    }
    array.forEach(result => {
        let li = document.createElement("li");
        li.classList.add(classCss);
        li.setAttribute('name', result.name);
        let pValue = document.createElement("p");
        pValue.setAttribute('id', 'fill-franchise')
        pValue.textContent = result.name;
        let img = document.createElement("img");
        img.setAttribute('id', 'delete-franchise');
        img.src = 'ico/delete/delete.svg'
        img.setAttribute("title", "Eliminar franquicia");
        img.classList.add("delete-franchise");
        li.appendChild(pValue);
        li.appendChild(img);
        element.appendChild(li);
    });
    let liAll = document.createElement('li');
    liAll.setAttribute('id', 'fill-franchise');
    liAll.classList.add(classCss);
    liAll.textContent = 'todos';
    element.appendChild(liAll);
};

function printDeleteDocument(elementHtml, nameDeleted, callback) {
    let divContent = document.createElement("div");
    divContent.classList.add("window-create-delete");
    let title = document.createElement("p");
    title.textContent = `Deleted ${nameDeleted} ?`;
    title.classList.add("deleteFranchise-title");
    let btnContent = document.createElement("div");
    btnContent.classList.add("deleteFranchise-btnContent");
    let btnCancel = document.createElement("button");
    btnCancel.textContent = "Cancelar";
    let btnOK = document.createElement("button");
    btnOK.textContent = "Confirmar";
    btnOK.classList.add("btnContent-btn");
    btnCancel.classList.add("btnContent-btn");
    btnContent.appendChild(btnCancel);
    btnContent.appendChild(btnOK);
    divContent.appendChild(title);
    divContent.appendChild(btnContent);
    elementHtml.appendChild(divContent);
    callback(document.querySelector(".deleteFranchise-btnContent"));
}
function fillPrintFranchise(elementHtml, array) {
    if(elementHtml.textContent === 'todos'){
        renderContainerLocal(document.querySelector('.main-localContain'), 'main-localContain-header');
        return printLocal(array, document.querySelector('.main-localContain'));
    }
    let fillFranchise = array.filter(result => result.franchise === elementHtml.textContent);
    console.log(fillFranchise);
    renderContainerLocal(document.querySelector('.main-localContain'), 'main-localContain-header');
    printLocal(fillFranchise, document.querySelector('.main-localContain'));
}
//FUNCIONES DE FRANCHISE
function createInputFranchise(element) {
    let labelFranc = document.createElement("label");
    labelFranc.setAttribute("for", "franchise");
    labelFranc.classList.add("window-create_label");
    labelFranc.textContent = "Franquicia";
    let inputFranc = document.createElement("input");
    inputFranc.setAttribute("name", "franchise");
    inputFranc.setAttribute("type", "text");
    inputFranc.setAttribute("id", "franchise");
    inputFranc.classList.add("window-create_input");
    let labelLocation = document.createElement("label");
    labelLocation.setAttribute("for", "Location");
    labelLocation.classList.add("window-create_label");
    labelLocation.textContent = "Dirección";
    let inputLocation = document.createElement("select");
    inputLocation.setAttribute("name", "location");
    inputLocation.setAttribute("type", "text");
    inputLocation.setAttribute("id", "Location");
    let options = ["EEUU", "Venezula", "Colombia", "Confidencial"];
    options.forEach(result => {
        let option = document.createElement("option");
        option.value = result;
        option.appendChild(document.createTextNode(result));
        inputLocation.appendChild(option);
    });
    inputLocation.classList.add("window-create_input");
    let btnForm = document.createElement("button");
    btnForm.setAttribute("id", "form-franch");
    btnForm.textContent = "Crear franquicia";
    btnForm.classList.add("window-create_btnForm");
    element.appendChild(labelFranc);
    element.appendChild(inputFranc);
    element.appendChild(labelLocation);
    element.appendChild(inputLocation);
    element.appendChild(btnForm);
    let p = document.createElement("p");
    p.classList.add("window-create_text");
    p.setAttribute("id", "form-mesj");
    element.appendChild(p);
}

function createHtml(elementHtml, attributes = {}, text){
    let element = document.createElement(elementHtml);
    let keys = Object.keys(attributes);
    if(text) element.textContent = text;
    keys.forEach(key => {
        element.setAttribute(key, attributes[key]);
    });
    return element;
}
//FUNCIONES DE LOCALS
function printInputLocal(elementHtml){
    document.querySelector('.window-create_form').id = 'create-local';
    let divContent = createHtml('div', {class: 'window-create_divContent'});
    let divContentInput = createHtml('div', { class: 'window-create_divContentInput' });
    let labelSelectFranch = createHtml('label', { class: 'window-create_label', for:'franchiseSelect', name:'franchise' },'Franquicia perteneciente');
    let selectFranch = createHtml('select', { class: 'window-create_input', id:'franchiseSelect', name:'franchise' });
    franchise.forEach((list) => {
        let option = document.createElement("option");
        option.appendChild(document.createTextNode(list.name));
        selectFranch.appendChild(option);
    });
    let labelName = createHtml('label', { class: 'window-create_label', for:'name' }, 'Nombre del local');
    let inputName = createHtml('input', {class:'window-create_input', id:'name',name: 'name', type:'text'});
    let labelLocation = createHtml('label', { class: 'window-create_label', for:'location' }, 'Localidad');
    let inputLocation = createHtml('input', {class:'window-create_input', id:'location',name: 'location', type:'text'});
    let labelIdLocal = createHtml('label', { class: 'window-create_label', for:'idLocal' }, 'id de relacion');
    let inputIdLocal = createHtml('input', { class: 'window-create_input', id: 'idLocal', name:'idLocal',type:'text' });
    let labelSelectMonitorint = createHtml('label', { class: 'window-create_label', for:'monitoring' }, 'Tipo de monitoreo');
    let selectMonitorit = createHtml('select', { class: 'window-create_input', id: 'monitoring', name:'typeMonitoring'});
    let option1 = createHtml('option', { }, 'completo');
    let option2 = createHtml('option', { }, 'parcial');
    let option3 = createHtml('option', { }, 'perimetral');
    selectMonitorit.append(option1);
    selectMonitorit.append(option2);
    selectMonitorit.append(option3);
    let labelSelectstatus = createHtml('label', { class: 'window-create_label', for:'status' }, 'Estatus');
    let selectStatus = createHtml('select', { class: 'window-create_input', id: 'status', name:'status'});
    let optionStatus1 = document.createElement("option");
    optionStatus1.appendChild(document.createTextNode("activo"));
    let optionStatus2 = document.createElement("option");
    optionStatus2.appendChild(document.createTextNode("inactivo"));
    selectStatus.appendChild(optionStatus1);
    selectStatus.appendChild(optionStatus2);
    let labelOrder = createHtml('label', { class: 'window-create_label', for:'order' }, 'Orden de aplilamiento');
    let inputOrder = createHtml('input', { class: 'window-create_input', id: 'order', name:'order',type:'number' });
    let labelManager = createHtml('label', { class: 'window-create_label', for:'totalManager' }, 'Cantida de gerentes');
    let inputManager = createHtml('input', { class: 'window-create_input', id: 'totalManager', name:'totalManager',type:'number' });
    let labelAttendee = createHtml('label', { class: 'window-create_label', for:'totalAttendee' }, 'Cantidad de asistentes');
    let inputAttendee = createHtml('input', { class: 'window-create_input', id: 'totalAttendee', name:'totalAttendee',type:'number' });
    let labelTypeTouch = createHtml('label', { class: 'window-create_label', for:'typeEvaluationTouch' }, 'Tipo de avaluación de toques');
    let selectTypeTouch = createHtml('select', { class: 'window-create_input', id: 'typeEvaluationTouch', name:'typeEvaluationTouch'});
    let optionTouch1 = createHtml('option',{}, 'simple');
    let optionTouch2 = createHtml('option',{}, 'completo');
    selectTypeTouch.appendChild(optionTouch1);
    selectTypeTouch.appendChild(optionTouch2);
    let labelEvaluationTouch = createHtml('label', { class: 'window-create_label label-textCenter', for:'evaluation-touch' }, '¿Requere evaluación de toques de mesa?');
    let checkboxEvaluationTouch = createHtml('input', { class: 'checkmark', id: 'evaluation-touch', name:'isRequiredeEvaluationTouchs',type:'checkbox' });
    let labelGroupTouch = createHtml('label', { class: 'window-create_label label-textCenter', for:'evaluation-group-touch' }, '¿Requere evaluación grupal?');
    let checkboxGroupTouch = createHtml('input', { class: 'checkmark', id: 'evaluation-group-touch', name:'isEvaluationGroupTouch',type:'checkbox' });
    let labelAppetizer = createHtml('label', { class: 'window-create_label', for:'appetizer' }, 'Nombre del aperitivo');
    let inputAppetizer = createHtml('input', { class: 'window-create_input', id: 'appetizer', name:'appetizer',type:'text' });
    let labelDishMain = createHtml('label', { class: 'window-create_label', for:'mainDish' }, 'Nombre del plato principal');
    let inputDishMain = createHtml('input', { class: 'window-create_input', id: 'mainDish', name:'mainDish',type:'text' });
    let labelDessert = createHtml('label', { class: 'window-create_label', for:'dessert' }, 'Nombre del postre');
    let inputDessert = createHtml('input', { class: 'window-create_input', id: 'dessert', name:'dessert',type:'text' });
    let labelTypeDish = createHtml('label', { class: 'window-create_label', for:'dish-evalueated' }, 'Evaluación de platos');
    let selectTypeDish = createHtml('select', { class: 'window-create_input', id:'dish-evalueated', name:'dishEvaluation'});
    let optionDish1 = document.createElement('option');
    optionDish1.appendChild(document.createTextNode('simple'));
    let optionDish2 = document.createElement('option');
    optionDish2.appendChild(document.createTextNode('completo'));
    selectTypeDish.appendChild(optionDish1);
    selectTypeDish.appendChild(optionDish2);
    let LabelEvaluationDish = createHtml('label', { class: 'window-create_label label-textCenter', for:'evaluation-dish' }, '¿Requere evaluación de plato?');
    let checkboxEvaluationDish = createHtml('input', { class: 'checkmark', id: 'evaluation-dish', name:'isRequiredeEvaluationDish',type:'checkbox' });
    let labelGroupDish = createHtml('label', { class: 'window-create_label label-textCenter', for:'evaluation-group-dish' }, '¿Requere evaluación grupal?');
    let checkboxGroupDish = createHtml('input', { class: 'checkmark', id: 'evaluation-group-dish', name:'isEvaluationGroupDish',type:'checkbox' });
    let langLabel = createHtml('label', { class: 'window-create_label', for:'lang' }, 'Idioma');
    let langInput = createHtml('select', { class: 'window-create_input', id:'lang', name:'lang',type:'text' });
    let langOne = createHtml('option',{}, 'es');
    let langSecond = createHtml('option',{}, 'en');
    langInput.appendChild(langOne);
    langInput.appendChild(langSecond);
    divContent.appendChild(labelSelectFranch);
    divContent.appendChild(selectFranch);
    divContent.appendChild(labelName);
    divContent.appendChild(inputName);
    divContent.appendChild(labelLocation);
    divContent.appendChild(inputLocation);
    divContent.appendChild(labelIdLocal);
    divContent.appendChild(inputIdLocal);
    divContent.appendChild(labelSelectMonitorint);
    divContent.appendChild(selectMonitorit);
    divContent.appendChild(labelSelectstatus);
    divContent.appendChild(selectStatus);
    divContent.appendChild(labelOrder);
    divContent.appendChild(inputOrder);
    divContent.appendChild(labelManager);
    divContent.appendChild(inputManager);
    divContent.appendChild(labelAttendee);
    divContent.appendChild(inputAttendee);
    divContent.appendChild(labelTypeTouch);
    divContent.appendChild(selectTypeTouch);
    divContent.appendChild(labelTypeTouch);
    divContent.appendChild(selectTypeTouch);
    divContent.appendChild(labelEvaluationTouch);
    divContent.appendChild(checkboxEvaluationTouch);
    divContent.appendChild(labelGroupTouch);
    divContent.appendChild(checkboxGroupTouch);
    divContent.appendChild(labelAppetizer);
    divContent.appendChild(inputAppetizer);
    divContent.appendChild(labelDishMain);
    divContent.appendChild(inputDishMain);
    divContent.appendChild(labelDessert);
    divContent.appendChild(inputDessert);
    divContent.appendChild(labelTypeDish);
    divContent.appendChild(selectTypeDish);
    divContent.appendChild(LabelEvaluationDish);
    divContent.appendChild(checkboxEvaluationDish);
    divContent.appendChild(labelGroupDish);
    divContent.appendChild(checkboxGroupDish);
    divContent.appendChild(langLabel);
    divContent.appendChild(langInput);
    divContentInput.appendChild(divContent);
    let divImgBtmn = createHtml('div', {class: 'window-create_dicImgBtn'});
    let img = createHtml('img', {class: 'window-create_imgPreview', id: 'window-create_imgPreview'});
    let btnImgDelete = createHtml('button', {class: 'window-create_deleteImg', type: 'button'}, 'X');
    let btnSubmit = createHtml('button', {class: 'window-create_btnForm'}, 'Registrar local');
    let labelImg = createHtml('label', {for: 'input-file',class: 'window-create_fileAside', id: 'drop-img-form'});
    let p = createHtml('p', {class: 'labelImg'},'Arrastra y suelta una imagen aquí.');
    labelImg.appendChild(p);
    labelImg.appendChild(img);
    labelImg.appendChild(btnImgDelete);
    divImgBtmn.appendChild(labelImg);
    divImgBtmn.appendChild(btnSubmit);
    let divText = createHtml('div', {class: 'window-create_textDiv'});
    let pDivText = createHtml('p', {class: 'textDiv-p'}, 'Nota: Llenar todos los campos adecuadamente acorder su respectica franquicia.');
    let textAlert = createHtml('p', {class: 'textDiv-pAlert', id: 'alert-locales'});
    divText.appendChild(pDivText);
    divText.appendChild(textAlert);
    divContentInput.appendChild(divImgBtmn);
    divImgBtmn.appendChild(divText);
    elementHtml.appendChild(divContentInput);
    let select = document.getElementById("franchiseSelect");
    let element = document.getElementById("idLocal");
    let getIdFirst = franchise.filter(result => result.name === select.value);
    element.value = getIdFirst[0]._id;
    select.addEventListener("change", writeInputId);
    function writeInputId() {
        let getId = franchise.filter(result=> result.name === select.value);
        element.value = getId[0]._id;
    }
    btnImgDelete.addEventListener('click', e => {
        console.log(e.target.parentNode.children[1]);
        if(file){
            file = null;
            e.target.parentNode.children[1].src = null;
        }
    });
}

function printLocal(array, elementHtml){
    let fragment =  document.createDocumentFragment();
    array.forEach(async local =>  {
        let divContentLocal = document.createElement('div');
        divContentLocal.classList.add('localContain-local');
        divContentLocal.setAttribute('name', local._id);
        divContentLocal.style.order = local.order;
        let img = document.createElement('img');
        img.classList.add('localContain-img');
        let URL = arrayBufferToBase64(local?.img?.data?.data, local?.img?.contentType);
        img.src = URL;
        let pName = document.createElement('p');
        pName.textContent = local.name;
        pName.classList.add('localContain-p');
        pName.classList.add('link');
        let status = document.createElement('p');
        status.textContent =  local.status;
        status.classList.add('localContain-p');
        if(local.status === 'activo'){ 
            status.style.color = 'rgb(0, 207, 17)';
        }
        else{
            status.style.color = 'rgb(255, 0, 4)';
        }
        let btns = document.createElement('div');
        btns.classList.add('localContain-btnContent');
        let btnDelete = document.createElement('button');
        btnDelete.textContent = 'Eliminar';
        btnDelete.classList.add('localContain-btnDeletLocal');
        let btnPut =  document.createElement('button');
        btnPut.textContent = 'Editar';
        btnPut.classList.add('localContain-btnDeletLocal');
        btnPut.classList.add('put');
        btns.appendChild(btnDelete);
        btns.appendChild(btnPut);
        divContentLocal.appendChild(img);
        divContentLocal.appendChild(pName);
        divContentLocal.appendChild(status);
        divContentLocal.appendChild(btns);
        fragment.appendChild(divContentLocal);
    })
    elementHtml.appendChild(fragment);
}

function renderContainerLocal(elementHtml, exection){
    for(let i = elementHtml.children.length - 1; i >= 1; i--){
        let boxLocal =  elementHtml.children;
        if(boxLocal[i].className !== exection) boxLocal[i].remove();
    }
}

function arrayBufferToBase64(buffer , contentType){
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for(let i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    const file = window.btoa(binary);
    return `data:${contentType};base64,` + file;
};

async function imgToFile(img){
    let file = await fetch(img.src);
    let newFile = await file.blob();
    return new File([newFile], 'dot.png', newFile);
}

function showLocal(data, parentHtml){
    let form = createHtml('form', {class: 'putLocal', id: 'put-local', name: data._id, method:'POST'});
    let containtInputs = createHtml('div', {class: 'putLocal-divInput'});
    let containtInputsTitle = createHtml('h2', {class: 'putLocal-title'}, 'Datos del local');
    let nameLabel = createHtml('label', {class: 'putLocal-label', for: 'name'}, 'Nombre del local');
    let nameInput = createHtml('input', {class: 'putLocal-input', id: 'name', value: data.name, name: 'name', type: 'text'});
    let franchiseLabel = createHtml('label', {class: 'putLocal-label', for: 'franchise'}, 'Franquicia perteneciente');
    let franchiseInput = createHtml('select', {class: 'putLocal-input', id: 'franchise', name: 'franchise', type: 'text'});
    franchise.map(franch => {
        franchiseInput.appendChild(createHtml('option', {}, franch.name));
    });
    franchiseInput.value = data.franchise;
    let orderLabel = createHtml('label', {class: 'putLocal-label', for: 'order'}, 'Órden de apilamiento');
    let orderInput = createHtml('input', {class: 'putLocal-input', id: 'order', value: data.order, name: 'order', type: 'number'});
    let locationLabel = createHtml('label', {class: 'putLocal-label', for: 'location'}, 'Localidad');
    let locationInput = createHtml('input', {class: 'putLocal-input', id: 'location', value: data.location, name: 'location', type: 'text'});
    let typeMonitoringLabel = createHtml('label', {class: 'putLocal-label', for: 'typeMonitoring'}, 'Tipo de monitoreo');
    let typeMonitoringInput = createHtml('select', {class: 'putLocal-input', id: 'typeMonitoring', name: 'typeMonitoring'});
    let monitoringOption1 = createHtml('option', {}, 'completo');
    let monitoringOption2 = createHtml('option', {}, 'parcial');
    let monitoringOption3 = createHtml('option', {}, 'perimetral');
    typeMonitoringInput.appendChild(monitoringOption1);
    typeMonitoringInput.appendChild(monitoringOption2);
    typeMonitoringInput.appendChild(monitoringOption3);
    typeMonitoringInput.value = data.typeMonitoring;
    let statusLabel = createHtml('label', {class: 'putLocal-label', for: 'status'}, 'Estatus del local');
    let stautsInput = createHtml('select', {class: 'putLocal-input', id: 'status',  name: 'status'});
    let statusOption1 = createHtml('option', {}, 'activo');
    let statusOption2 = createHtml('option', {}, 'inactivo');
    stautsInput.appendChild(statusOption1);
    stautsInput.appendChild(statusOption2);
    stautsInput.value = data.status;

    let divManagers = createHtml('div', { class: 'putLocal-divManager' });
    let divManagersH2 = createHtml('h2', { class: 'putLocal-title' }, 'Opciones de gerente');
    let managersLabel = createHtml('label', { class: 'putLocal-label', for: 'totalManager' }, 'Cantidad de gerentes');
    let managersInput = createHtml('input', { class: 'putLocal-input', id: 'totalManager', value: data.touchs.totalManager, name: 'totalManager', type: 'number'});
    let attendeesLabel = createHtml('label', { class: 'putLocal-label', for: 'totalAttendee'}, 'Cantidad de Asistente');
    let attendeesInput = createHtml('input', { class: 'putLocal-input', id: 'totalAttendee', value: data.touchs.totalAttendee, name: 'totalAttendee', type: 'number'});
    let labelEvaluation = createHtml('label', { class: 'putLocal-label', for: 'typeEvaluationTouch'}, 'Tipo de avaluación de toques');
    let inputEvaluation = createHtml('select', { class: 'putLocal-input', id: 'typeEvaluationTouch',  name: 'typeEvaluationTouch'});
    let evaluationOption1 = createHtml('option', { }, 'simple');
    let evaluationOption2 = createHtml('option', { }, 'completo');
    inputEvaluation.appendChild(evaluationOption1);
    inputEvaluation.appendChild(evaluationOption2);
    inputEvaluation.value = data.touchs.typeEvaluationTouch;
    let isRequeredLabel = createHtml('label', { class: 'putLocal-label', for: 'isRequiredeEvaluation'}, '¿Requere evaluación de toques de mesa?');
    let isRequeredInput = createHtml('input', { class: 'putLocal-input', id: 'isRequiredeEvaluation', name: 'isRequiredeEvaluation', type: 'checkbox'});
    isRequeredInput.checked = data.touchs.isRequiredeEvaluation;
    let isRequeredGLabel = createHtml('label', { class: 'putLocal-label', for: 'isEvaluationGroup'}, '¿Requere evaluación grupal?');
    let isRequeredGInput = createHtml('input', { class: 'putLocal-input', id: 'isEvaluationGroup', name: 'isEvaluationGroup', type: 'checkbox'});
    isRequeredGInput.checked = data.touchs.isEvaluationGroup;
    
    let divDish = createHtml('div', {class: 'putLocal-divManager'});
    let divDishTitle = createHtml('h2', {class: 'putLocal-title'}, 'Opciones de menú');
    let labelAppetizer = createHtml('label', {class: 'putLocal-label', for: 'appetizer'}, 'Nombre del aperitivo');
    let inputAppetizer = createHtml('input', {class: 'putLocal-input', id: 'appetizer', name: 'appetizer', type: 'text', value: data.dishMenu.appetizer });
    let labelDishMain = createHtml('label', {class: 'putLocal-label', for: 'mainDish'}, 'Nombre del plato principal');
    let inputDishMain = createHtml('input', {class: 'putLocal-input', id: 'mainDish', name: 'mainDish', type: 'text', value: data.dishMenu.mainDish})
    let labelDessert = createHtml('label', {class: 'putLocal-label', for: 'dessert'}, 'Nombre del postre o plato de cierre');
    let inputDessert = createHtml('input', {class: 'putLocal-input', id: 'dessert', name: 'dessert', type: 'text', value: data.dishMenu.dessert});
    let labelEvaluationDish = createHtml('label', { class: 'putLocal-label', for: 'dishEvaluation'}, 'Tipo de avaluación de plato');
    let inputEvaluationDish = createHtml('select', { class: 'putLocal-input', id: 'dishEvaluation',  name: 'dishEvaluation'});
    let evaluationDishOption1 = createHtml('option', { }, 'simple');
    let evaluationDishOption2 = createHtml('option', { }, 'completo');
    inputEvaluationDish.appendChild(evaluationDishOption1);
    inputEvaluationDish.appendChild(evaluationDishOption2);
    inputEvaluationDish.value = data.dishMenu.dishEvaluation;

    let labelRequiredEvaluationDish = createHtml('label', { class: 'putLocal-label', for: 'isRequiredeEvaluation'}, '¿Requere evaluación de plato?');
    let inputRequiredEvaluationDish = createHtml('input', { class: 'putLocal-input', id: 'isRequiredeEvaluation',  name: 'isRequiredeEvaluationDish', type: 'checkbox'});
    inputRequiredEvaluationDish.checked = data.dishMenu.isRequiredeEvaluation;
    let labelEvaluationGroupDish = createHtml('label', { class: 'putLocal-label', for: 'isEvaluationGroupDish'}, '¿Requere evaluación grupal?');
    let inputEvaluationGroupDish = createHtml('input', { class: 'putLocal-input', id: 'isEvaluationGroupDish',  name: 'isEvaluationGroupDish', type: 'checkbox'});
    inputEvaluationGroupDish.checked = data.dishMenu.isEvaluationGroup;

    let langLabel = createHtml('label', { class: 'putLocal-label', for: 'lang'}, 'Tipo de avaluación de plato');
    let langInput = createHtml('select', { class: 'putLocal-input', id: 'lang',  name: 'lang'});
    let langOptionOne = createHtml('option', { }, 'es');
    let langptionTwo = createHtml('option', { }, 'en');
    langInput.appendChild(langOptionOne);
    langInput.appendChild(langptionTwo);
    langInput.value = data.lang;
  
    containtInputs.appendChild(containtInputsTitle);
    containtInputs.appendChild(nameLabel);
    containtInputs.appendChild(nameInput);
    containtInputs.appendChild(franchiseLabel);
    containtInputs.appendChild(franchiseInput);
    containtInputs.appendChild(orderLabel);
    containtInputs.appendChild(orderInput);
    containtInputs.appendChild(locationLabel);
    containtInputs.appendChild(locationInput);
    containtInputs.appendChild(typeMonitoringLabel);
    containtInputs.appendChild(typeMonitoringInput);
    containtInputs.appendChild(statusLabel);
    containtInputs.appendChild(stautsInput);
    divManagers.appendChild(divManagersH2);
    divManagers.appendChild(managersLabel);
    divManagers.appendChild(managersInput);
    divManagers.appendChild(attendeesLabel);
    divManagers.appendChild(attendeesInput);
    divManagers.appendChild(labelEvaluation);
    divManagers.appendChild(inputEvaluation);
    divManagers.appendChild(isRequeredLabel);
    divManagers.appendChild(isRequeredInput);
    divManagers.appendChild(isRequeredGLabel);
    divManagers.appendChild(isRequeredGInput);
    divDish.appendChild(divDishTitle);
    divDish.appendChild(labelAppetizer);
    divDish.appendChild(inputAppetizer);
    divDish.appendChild(labelDishMain);
    divDish.appendChild(inputDishMain);
    divDish.appendChild(labelDessert);
    divDish.appendChild(inputDessert);
    divDish.appendChild(labelEvaluationDish);
    divDish.appendChild(inputEvaluationDish);
    divDish.appendChild(labelRequiredEvaluationDish);
    divDish.appendChild(inputRequiredEvaluationDish);
    divDish.appendChild(labelEvaluationGroupDish);
    divDish.appendChild(inputEvaluationGroupDish);
    divDish.appendChild(langLabel);
    divDish.appendChild(langInput);
    let divImgAndBtn = createHtml('div', {class: 'putLocal-divImg'});
    let imgDiv = createHtml('div', {class: 'window-create_fileAside'})
    let img = createHtml('img', { class: 'window-create_imgPreview', id: 'window-create_imgPreview' , src: arrayBufferToBase64(data.img.data.data , data.contentType) }); 
    let btnForm = createHtml('button', {class: 'window-create_btnForm'}, 'Actualizar datos');
    divImgAndBtn.appendChild(imgDiv);
    divImgAndBtn.appendChild(btnForm);
    imgDiv.appendChild(img);
    let imgFile = createHtml('img', {src: arrayBufferToBase64(data.img.data.data , data.contentType)});
    imgToFile(imgFile).then(result => {file = result});

    form.appendChild(divImgAndBtn);
    form.appendChild(containtInputs);
    form.appendChild(divManagers);
    form.appendChild(divDish);
    parentHtml.appendChild(form);
}


async function resetAplicationAlert(){
    const resetAplication = await axios.get('https://72.68.60.254:4000/bot/reporteAlertas/reset');
    console.log(resetAplication);
}