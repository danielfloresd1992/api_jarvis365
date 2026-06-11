import { createHtml } from '/utils/createHtml.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';

const list = document.getElementById('listMenu');
const selectCategory = document.getElementById('selectTitle-01');
const listMenu = [];

let formKey = true;
let putKey = false;
const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
const btnSubmit = document.getElementById('btn-submit22');


const getMenuAll = callback => {
    axios.get(`https://72.68.60.254/menu`)
        .then(response => {
            callback( null, response.data );
        })
        .catch(err => {
            callback(err, null);
        })
};


const getMenuById = (id, callback) => {
    axios.get(`https://72.68.60.254/menu/id=${id}`)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
};


const sendMenu = (body, callback) => {
    axios.post(`https://72.68.60.254/menu`, body)
        .then(response => {
            console.log()
            callback(null, response);
        })
        .catch(err => {
            callback(err, null);
        });
};


const putMenu = (body, callback) => {
    axios.post(`https://72.68.60.254/menu/put`, body)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            callback(err, null);
        });
};


const deleteMenu = (id, callback) => {
    axios.delete(`https://72.68.60.254/menu/id=${id}`)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            callback(err, null);
        })
};


window.addEventListener('DOMContentLoaded', () => {

    printMenu();

    selectCategory.addEventListener('change', e => {
        if(e.target.value === 'todas las categorias'){
            deleteChildHtml(list, () => {
                listMenu.forEach(menu => {
                    list.appendChild(printListHtml(menu));
                });
            });
        }
        else{
            const category = e.target.value;
            const newList = listMenu.filter(menu => menu.category === category);

            deleteChildHtml(list, () => {
                newList.forEach(menu => {
                    list.appendChild(printListHtml(menu));
                });
            });
        }
    });


    document.addEventListener('click', e => {

        if(e.target.id === 'selectMenu-02') {
            const id = e.target.parentNode.getAttribute('idmenu');
            getMenuById(id, ((err, response) => {
                if(err) return boxModal.show('Error', 'Error al cunsultar la novedad');
                console.log(response.data);
                reprintInput(response.data);
                putKey = true;
                btnSubmit.textContent = 'Actualizar';
            }));
        }


        if(e.target.id === 'deleted-menu10'){
            const id = e.target.parentNode.getAttribute('idmenu');
            deleteMenu(id, (err, response) => {
                if(err){ 
                    console.log(err);
                    return boxModal.show('Error', 'No se pudo guardar el menu');
                }

                if(response.status === 200){
                    document.getElementById('menu-length').textContent = Number(document.getElementById('menu-length').textContent) - 1;
                    e.target.parentNode.remove();
                }
            });
        }


        if(e.target.id === 'checkbox-activateInputSpecial'){
            if(e.target.checked){
                document.getElementById('inputSpecial1').disabled = false;
                document.getElementById('inputSpecial2').disabled = false;
                document.getElementById('inputSpecial3').disabled = false;
                document.getElementById('inputSpecial4').disabled = false;
            }
            else{
                document.getElementById('inputSpecial1').disabled = true;
                document.getElementById('inputSpecial2').disabled = true;
                document.getElementById('inputSpecial3').disabled = true;
                document.getElementById('inputSpecial4').disabled = true;
            }
        }


        if(e.target.id === 'btn-reset20'){ 
            resetInput();
            btnSubmit.textContent = 'Guardar';
            putKey = false;
        }
    });


    document.getElementById('editImgCout-form').addEventListener('change', e => {
        deleteChildHtml(document.getElementById('count-img-form'), () => {
            if(Number(e.target.value) > 4 || Number(e.target.value) < 0 ) return boxModal.show('Aviso', 'Solo puedes tener un mínimo de 1 contenedor y un máximo de 4 contenedores');
            for(let i = 0; i < Number(e.target.value); i++){
                document.getElementById('count-img-form').appendChild(printBoxImgAndTitle(null, i));
            }
        });
    });


    document.getElementById('form-menu').addEventListener('submit', e => {
        e.preventDefault();
        if(formKey){
            formKey = false;
            if(putKey){
                putMenu(getDataInHtml(), (err, response) => {
                    putKey = false;
                    formKey = true;
                    if(err) {
                        console.log(err);
                       
                        return boxModal.show('Error', 'No se pudo actualizar el menu');
                    };
                    console.log(response);
                    if(response.status === 200){
                        boxModal.show('Exito', 'El menú se actualizó de forma exitosa');
                        btnSubmit.textContent = 'Guardar';
                        resetInput();
                        printMenu();
                       
                    }
                });
            }
            else{
                sendMenu(getDataInHtml(), (err, response) => {
                    formKey = true;
                    if(err) {
                        console.log(err);
                        return boxModal.show('Error', 'No se pudo guardar el menu');
                    };
                    if(response.status === 200){
                        resetInput();
                        boxModal.show('Exito', 'El menú se guardo de forma exitosa');
                       
                        listMenu.push(response.data);
                        document.getElementById('menu-length').textContent = Number(document.getElementById('menu-length').textContent) + 1;
                    }
                });
            }
        }
    });
});


function printListHtml(list){
    const divList = createHtml('div', { class: 'itemMenu', idMenu: list._id });
    const span = createHtml('span', { class: 'titleList', id: 'selectMenu-02' }, list.es);
    const enTitle = createHtml('span', { class: 'titleEn' }, list.en || 'Titulo en ingles por definir');
    if(!list.en) enTitle.style.color = '#A50000'
    const btnDelete = createHtml('button', { class: 'btnDelete', id: 'deleted-menu10' });
    const imgDelete = createHtml('img', { class: 'imgDelete', src: 'ico/delete/delete.svg' });
    btnDelete.appendChild(imgDelete);
    divList.appendChild(span);
    divList.appendChild(enTitle);
    divList.appendChild(btnDelete);


    if(list.rulesForBonus === undefined || list.rulesForBonus === null){ 
        divList.style.border = 'solid 1px rgb(248, 1, 1 )';
        divList.title = 'Este menu no tiene la reglas de los bonos establecido';
    }

    return divList;
}


function deleteChildHtml(element, callback){
    
    const children = element.childNodes;
    for (let i = children.length - 1; i >= 0; i--) {
        element.removeChild(children[i]);
    }
    return callback();
}


function printBoxImgAndTitle(data, index){
    const indexImg = data?.index ||  index + 1
    const es = data?.es || ''
    const en = data?.en || ''

    const div = createHtml('div', { class: 'count-img-form-child', index: indexImg }, );
    const titleDiv = createHtml('span', { class: 'titleDiv' } , `caption de la imagen: ${indexImg}`)
    div.appendChild(titleDiv);
    const labelIndexEs = createHtml('label', { class: 'count-img-form-child-label' }, 'Títutlo en español');
    const inputEs = createHtml('input', { class: 'configurationMenu-input count-img-form-child-input', type :'text',  index: indexImg, require: true, value: es } );
    labelIndexEs.appendChild(inputEs);
    div.appendChild(labelIndexEs);

    const labelIndexEn = createHtml('label', { class: 'count-img-form-child-label' }, 'Títutlo en ingles');
    const inputEn = createHtml('input', { class: 'configurationMenu-input count-img-form-child-input', type :'text',  index: indexImg, require: true, value: en } );
    labelIndexEn.appendChild(inputEn);
    div.appendChild(labelIndexEn);
    return div;
}


function getDataInHtml(){
    const boxImg = document.getElementById('count-img-form');
    const arrayBox = [];
    let especial;
    if(document.getElementById('esConfiguration').value === '' || document.getElementById('enConfiguration').value === '') return boxModal.show('error', 'Los títulos deben tener un valor');
    if(boxImg.children.length < 1) return boxModal.show('error', 'Debe haber como mínimo un contenedor de imágenes');
    if(document.getElementById('inputBonoValue').value.trim() === '' || document.getElementById('inputBonoAcumulative').value.trim() === '') return boxModal.show('Aviso', 'Los input de las reglas de los bonos pu pueden estar vacía');
    Array.from(boxImg.children).forEach(div => {
        if(div.children[1].children[0].value === '' || div.children[2].children[0].value === '') return boxModal.show('Aviso', 'Los input de los contenedores no deben estan vacío');
        const box = {};
        box.index = div.getAttribute('index');
        box.es = div.children[1].children[0].value;
        box.en = div.children[2].children[0].value;
        arrayBox.push(box);
    });

    if(document.getElementById('checkbox-activateInputSpecial').checked){
        if( document.getElementById('inputSpecial1').value === '' || document.getElementById('inputSpecial2').value === '' ||document.getElementById('inputSpecial3').value === '' ||document.getElementById('inputSpecial4').value === '' ) return boxModal.show('Aviso', 'Los input del menu especial no deben estan vacío');
        especial =  {
            time: {
                timeInitTitle:{
                    es: document.getElementById('inputSpecial1').value ,
                    en: document.getElementById('inputSpecial2').value ,
                },
                timeEndTitle:{
                    es: document.getElementById('inputSpecial3').value ,
                    en: document.getElementById('inputSpecial4').value ,
                }
            } 
        }
    }
    else{
        especial = null;
    }
    
    const body = {
        category: document.getElementById('select-configuration').value,
        _id: document.getElementById('idConfiguration').value || '',
        es: document.getElementById('esConfiguration').value,
        en: document.getElementById('enConfiguration').value,
        timeUnique: document.getElementById('timeSimple').checked,
        time: document.getElementById('timeComplete').checked,
        table: document.getElementById('tableConfiguration').checked,
        photos: {
            length: arrayBox.length,
            caption: arrayBox
        },
        especial: especial,
        rules: {
            worth: document.getElementById('inputBonoValue').value,
            amulative: document.getElementById('inputBonoAcumulative').value
        }
    };
    return body;
}


function resetInput(){
    document.getElementById('select-configuration').value = 'Seleccione una categoria';
    document.getElementById('idConfiguration').value = '';
    document.getElementById('esConfiguration').value = '';
    document.getElementById('enConfiguration').value = '';
    document.getElementById('tableConfiguration').checked = false;
    document.getElementById('with-time').checked = false;
    document.getElementById('timeSimple').checked = false;
    document.getElementById('timeComplete').checked = false;
    document.getElementById('editImgCout-form').value = '';
    deleteChildHtml(document.getElementById('count-img-form'), () => {});
    document.getElementById('checkbox-activateInputSpecial').checked = false;
    document.getElementById('inputSpecial1').disabled = true;
    document.getElementById('inputSpecial2').disabled = true;
    document.getElementById('inputSpecial3').disabled = true;
    document.getElementById('inputSpecial4').disabled = true;
    document.getElementById('inputSpecial1').value = '';
    document.getElementById('inputSpecial2').value = '';
    document.getElementById('inputSpecial3').value = '';
    document.getElementById('inputSpecial4').value = '';
    document.getElementById('inputBonoValue').value = '';
    document.getElementById('inputBonoAcumulative').value = '';
    document.getElementById('btn-reset20').disabled = true;
}


function reprintInput(dataArry){
    let data = dataArry[0];

    document.getElementById('select-configuration').value = data.category;
    document.getElementById('idConfiguration').disabled = false;
    document.getElementById('idConfiguration').value = data._id;
    document.getElementById('idConfiguration').disabled = true;
    document.getElementById('esConfiguration').value = data.es;
    document.getElementById('enConfiguration').value = data.en;
    document.getElementById('tableConfiguration').checked = data.table;
    document.getElementById('timeSimple').checked = data.timeUnique;
    document.getElementById('timeComplete').checked = data.time;
    document.getElementById('editImgCout-form').value = data.photos.length;

    deleteChildHtml(document.getElementById('count-img-form'), () => {
        data.photos.caption.forEach((img, index) => {
            document.getElementById('count-img-form').appendChild(printBoxImgAndTitle(img, index));
        });
    });
    if(data.especial){
        document.getElementById('checkbox-activateInputSpecial').checked = true;
        document.getElementById('inputSpecial1').disabled = false;
        document.getElementById('inputSpecial2').disabled = false;
        document.getElementById('inputSpecial3').disabled = false;
        document.getElementById('inputSpecial4').disabled = false;
        document.getElementById('inputSpecial1').value = data.especial.time.timeInitTitle.es;
        document.getElementById('inputSpecial2').value = data.especial.time.timeInitTitle.es;
        document.getElementById('inputSpecial3').value = data.especial.time.timeEndTitle.en;
        document.getElementById('inputSpecial4').value = data.especial.time.timeEndTitle.en;
    }
    else{
        document.getElementById('checkbox-activateInputSpecial').checked = false;

        document.getElementById('inputSpecial1').disabled = true;
        document.getElementById('inputSpecial2').disabled = true;
        document.getElementById('inputSpecial3').disabled = true;
        document.getElementById('inputSpecial4').disabled = true;
        document.getElementById('inputSpecial1').value = '';
        document.getElementById('inputSpecial2').value = '';
        document.getElementById('inputSpecial3').value = '';
        document.getElementById('inputSpecial4').value = '';
    }
    console.log(data);

    if(data.rulesForBonus === undefined || data.rulesForBonus === null){
        document.getElementById('inputBonoValue').value = '';
        document.getElementById('inputBonoAcumulative').value = '';
    }
    else{
        document.getElementById('inputBonoValue').value = data.rulesForBonus.worth;
        document.getElementById('inputBonoAcumulative').value = data.rulesForBonus.amulative;
    }

    document.getElementById('btn-reset20').disabled = false;
}


function printMenu(){
    getMenuAll((err, data) => {
        if(err) return console.log(err);
    
        deleteChildHtml(list, () => {
        });
        deleteChildHtml(selectCategory, () => {
        });

        const arrayCategory = [];

        document.getElementById('menu-length').textContent = data.length;

        data.forEach(menu => {
            if(arrayCategory.indexOf(menu.category) < 0) arrayCategory.push(menu.category);
        });

        const defect = createHtml('option', { value: "todas las categorias" }, "todas las categorias");
        selectCategory.appendChild(defect);

        arrayCategory.forEach(title => {
            
            const option = createHtml('option', { value: title }, title);
            selectCategory.appendChild(option);

        });

        const titles = data.sort((a,b) => {
            let titleA = a.es.toUpperCase();
            let titleB = b.es.toUpperCase();
            if (titleA < titleB) return -1;
            if (titleA > titleB) return 1;
            return 0;
        });
        listMenu.push(...titles);
        titles.forEach(menu => {
            list.appendChild(printListHtml(menu));
        });
    });

}