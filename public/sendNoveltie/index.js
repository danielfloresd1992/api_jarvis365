'use strict';
import { DomManipulation } from '../utils/createHtml.js';
import { WindowLoanding } from '../utils/window_await/window_await.js';
import BoxModal from '../utils/window_boxModal/boxModal.js';
import URL from '/utils/url_api.js'

const getMenu =  ( callback ) => {
    return new Promise(async (resolve, reject) => {
        const response = await axios.get(`https://${URL}:443/menu`);
        response.status === 200 ? resolve(response.data) : reject(response);
    });
};


const getUser = async callback => {
    return new Promise(async (resolve, reject) => {
        const response = await axios.get(`https://${URL}:443/user/getUser`);
        response.status === 200 ? resolve(response.data) : reject(response);
    });
};


window.addEventListener('DOMContentLoaded', async () => {


    const contain = document.querySelector('.mainContainer');
    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);

    const menus = await getMenu();
    const users = await getUser();
    
    console.log(users);
    console.log(menus);


    contain.appendChild(createInput('Seleccione el operador', users, ['name', 'surName']));
    


});



function createInput(text, array, parans){

    const fuse = new Fuse(array, { minMatchCharLength: 4, includeScore: true, keys: parans });
    const optionArray = [];

    if(array.length > 0){
        for(let i = 0; i < array.length; i++){
            optionArray.push( DomManipulation.createHtml('option', { value: array[i]._id }, `${array[i].name} ${array[i].surName}`));
        }
    }

    const label = DomManipulation.createHtml('label', { class: 'label-select' }, text);
    const input = DomManipulation.createHtml('input', { class: 'select', type: 'text' }, '' );
    const divResult = DomManipulation.createHtml('div', { class: 'textResult-content',  }, '' );

    input.onkeydown = e => {
        const resultSearch = (fuse.search(e.target.value));
        DomManipulation.removeAll(divResult, () => {
            resultSearch.forEach(element => {
                const resultUser = DomManipulation.createHtml('span', { class: 'text-result', id: element.item._id }, `${element.item.name} ${element.item.surName}` );
               
                divResult.appendChild(resultUser);
            });

            divResult.onclick = e => {
                if(e.target.className === 'text-result'){
                    
                }
                console.log(e.target);
            }
        });
    };

    const inputContain = DomManipulation.createHtml('div', { class: 'selectContain' }, '', [label, input,  divResult]);
    return inputContain;
}


