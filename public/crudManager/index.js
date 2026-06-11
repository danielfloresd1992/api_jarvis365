'use strict';

import BoxModal from '/utils/window_boxModal/boxModal.js';
import { WindowLoanding } from '/utils/window_await/window_await.js';

//MODEL
import { getManager, setManager, getManagerByLocalName, getManagerAndImgById, getFillManamger, deleteManager } from '/crudManager/assets/model/nameger.js';
import { getFranchise, getLocal } from '/crudManager/assets/model/franchise_local.js';

//VIEW
import { printManager, printList, remplazeManagetBoxContain, RenderPutManager } from '/crudManager/assets/view/boxManager.js';
import { createWindow, createImg, createFormInput, insertImg, printPutDataManager } from '/crudManager/assets/view/form.js';


let files = [];
let localAlternative = [];



window.addEventListener('DOMContentLoaded', async () => {

    const boxContaint = document.querySelector('.main-localContain');
    const asideListFranchise = document.querySelectorAll('.asideFranchise-ul')[1];
    const asideListLocal = document.querySelectorAll('.asideFranchise-ul')[0];

    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
    const windowLoad = new WindowLoanding(document.getElementsByTagName('body')[0], {
        ballColor: '#005aff'
    });

    windowLoad.createWindow('Esperando repuesta del servidor...');
    windowLoad.insertStyle();

    //peticiones ajax
    const managerArray = await getManager();
    const locals = await getLocal();
    const franchises = await getFranchise();

    windowLoad.closeWindowAwait();


    franchises.forEach(franchise => {
        //asideListFranchise.appendChild(printList(franchise, 'asideFranchise-li'));
    });


    locals.forEach(local => {
        asideListLocal.appendChild(printList(local, 'asideFranchise-li'));
    });


    printManagerBox(managerArray, locals, boxContaint);


    document.getElementById('CrearFranquicia').addEventListener('click', e => {
        createWindow(document.getElementsByTagName('body')[0], (elementHtmlfather) => {
            createFormInput(elementHtmlfather, locals);
        })
    });


    document.getElementsByTagName('body')[0].addEventListener('click', e => {
        //deleted file png
        if (e.target.className === 'img-preview-deletebtn') {
            e.target.parentNode.remove();
            files = files.filter(file => file.name !== e.target.parentNode.getAttribute('name'));

            if (files.length > 0) {
                document.querySelector('.form-divZoneDrop-img').src = document.querySelectorAll('.img-preview')[0].src;
            }
            else {
                document.querySelector('.form-divZoneDrop-img').src = 'img/drop-file.png';
            }
        }


        //deleted items of array
        if (e.target.className === 'window-create_btnDelete') {
            files = [];
            localAlternative = [];
        }


        if (e.target.id === 'delete-tag-franchise') {
            const name = e.target.getAttribute('name');
            localAlternative = localAlternative.filter(id => id !== name);
            e.target.parentNode.remove();
        }


        if (e.target.id === 'img-preview-click') document.querySelector('.form-divZoneDrop-img').src = e.target.src;


        if (e.target.id === 'scroll-left-img' || e.target.id === 'scroll-right-img') scrollMove(e.target);


        if (e.target.id === 'fill-franchise-30') {
            getManagerByLocalName(e.target.textContent, (err, response) => {
                if (err) {
                    boxModal.show('Error', 'ha ocurrido un error :(');
                    return console.log(err);
                }
                if (response.length > 0 || e.target.textContent === 'Todos') {
                    document.querySelector('.main-localContain').replaceWith(remplazeManagetBoxContain());
                    e.target.textContent === 'Todos' ? printManagerBox(managerArray, locals, document.querySelector('.main-localContain')) : printManagerBox(response, locals, document.querySelector('.main-localContain'));
                    return;
                }
                boxModal.show('Aviso', 'No se há encontrado ningun registro de gerente asociado con este local.');
            });
        }


        if (e.target.id === 'img-manager') createWindow(document.getElementsByTagName('body')[0], (window) => createImg(window, e.target));


        if (e.target.className === 'imgContain-img') e.target.parentNode.parentNode.children[0].src = e.target.src;


        if (e.target.id === 'delete-manager') {
            //return boxModal.show('Error', 'Esta función ha sido desabilitado por el administrador :(');
            boxModal.show('Aviso', 'Click en aceptar para eliminar el siguiente elemento', {
                isBtnAccept: true, method: () => {
                    const id = e.target.children[0].getAttribute('name');
                    deleteManager(id, (err, response) => {
                        if (err) return boxModal.show('Error', 'ha ocurrido un error :(');
                        console.log(response);
                        e.target.parentNode.parentNode.remove();
                        boxModal.show('Aviso', 'Manager eliminado');
                    });
                }
            });
        }


        if (e.target.id === 'update-manager-31') {
            createWindow(document.getElementsByTagName('body')[0], elementHtmlfather => {
                getManagerAndImgById(e.target.getAttribute('name'), (err, response) => {
                    const deleteWindows = () => {
                        elementHtmlfather.remove();
                        boxModal.show('Aviso', 'Datos actualizado');
                    };
                    if (err) {
                        console.log(err);
                        return boxModal.show('Error', 'ha ocurrido un error :(');
                    }
                    elementHtmlfather.appendChild(remplazeManagetBoxContain());
                    ReactDOM.render(
                        React.createElement(RenderPutManager, { managerdata: response[0], locals: locals, deleteWindow: deleteWindows }),
                        elementHtmlfather.children[1]
                    );
                });
            });
        }


    });


    document.getElementsByTagName('body')[0].addEventListener('change', e => {
        if (e.target.id === 'select-local-alternative') {
            addLocal(e, locals);
        };
    });


    document.getElementsByTagName('body')[0].addEventListener('submit', e => {
        e.preventDefault();
        windowLoad.createWindow('Esperando repuesta del servidor...');
        const formData = new FormData(e.target);
        formData.append('otherLocals', JSON.stringify(localAlternative));

        /*
        for(const iterator of files) {
            formData.append('img', iterator);
        }
        */
        setManager(formData, (err, response) => {
            windowLoad.closeWindowAwait();
            if (err) {
                console.log(err);
                return boxModal.show('Error', 'A ocrrido un error al guadar los datos del nuevo gerente, por favor consulte con el departamento de sistemas.');
            }
            document.querySelector('.window-create').remove();
            console.log(response);
            files = [];
            localAlternative = [];

            getManagerAndImgById(response.data._id, (err, responseManager) => {
                if (err) {
                    console.log(err);
                    return boxModal.show('Error', 'Los datos se guardaron con exito pero ocurrio al solicitar los datos del nuevo gerente');
                }
                console.log(responseManager);
                const getLocal = locals.filter(local => responseManager[0].localName === local.name);
                boxContaint.appendChild(printManager(responseManager[0], getLocal[0]));
                boxModal.show('Aviso', 'Datos guardado con exito.')
            });
        });
    });


    document.getElementsByTagName('body')[0].addEventListener('dragenter', e => {
        dragEnterImg(e);
    });


    document.getElementsByTagName('body')[0].addEventListener('dragover', e => {
        dragoverImg(e);
    });


    document.getElementsByTagName('body')[0].addEventListener('dragleave', e => {
        dragLeaveImg(e);
    });


    document.getElementsByTagName('body')[0].addEventListener('drop', e => {
        e.preventDefault();
        if (files.length === 3) return boxModal.show('Aviso', 'Maximo 3 imagenes');

        const result = files.filter(file => file.name === e.dataTransfer.files[0].name);
        result.length > 0 ? boxModal.show('Error', 'Ya existe un archivo con el mismo nombre') : dropImg(e);
    });


});



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


function printManagerBox(array, locals, elementHtml) {
    array.forEach(manager => {
        getManagerAndImgById(manager._id, async (err, data) => {
            if (err) return console.log(err);
            const local = locals.filter(local => manager.local === local._id);
            elementHtml.appendChild(printManager(data[0], local[0]));
        });
    });
}


function addLocal(e, local) {
    if (localAlternative.length > 3) return;
    let textContain = document.createElement('div');
    textContain.classList.add('local-alternative-div');
    let childText = document.createElement('p');
    childText.classList.add('local-alternative-p');
    childText.textContent = e.target.value;
    let btnDelete = document.createElement('button');
    btnDelete.classList.add('local-alternative-button');
    btnDelete.textContent = 'X';
    btnDelete.setAttribute('title', 'Eliminar etiqueta');
    btnDelete.setAttribute('type', 'button');
    btnDelete.id = 'delete-tag-franchise';
    const getLocal = local.filter(item => e.target.value === item._id);
    localAlternative.push(getLocal[0]._id);
    btnDelete.setAttribute('name', getLocal[0]._id);
    childText.textContent = getLocal[0].name;
    textContain.appendChild(childText);
    textContain.appendChild(btnDelete);
    document.querySelector('.form-inputContain-divLocalAlternative').appendChild(textContain);

}


const dragEnterImg = (e) => {
    e.preventDefault();
    if (e.target.className === 'form-divZoneDrop-img') {
        document.querySelector('.form-divZoneDrop').classList.add('drag-enter');
    }
};


const dragLeaveImg = (e) => {
    e.preventDefault();
    if (e.target.className === 'form-divZoneDrop-img') {
        document.querySelector('.form-divZoneDrop').classList.remove('drag-enter');
    }
};


const dragoverImg = e => {
    e.preventDefault();
};


const dropImg = e => {
    if (e.target.className === 'form-divZoneDrop-img') {
        document.querySelector('.form-divZoneDrop').classList.remove('drag-enter');
        let file = e.dataTransfer.files[0];
        files.push(file);
        const fileReader = new FileReader();
        fileReader.readAsDataURL(e.dataTransfer.files[0]);
        fileReader.onload = (e) => {
            e.preventDefault();
            document.querySelector('.form-divZoneDrop-img').src = e.target.result;
            insertImg(e.target.result, file.name, document.querySelector('.form-divImgspreview'));
            fileReader.onload = null;
        };
    }
};





