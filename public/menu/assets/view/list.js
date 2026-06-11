import {  DomManipulation } from '/utils/createHtml.js';

/*
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
*/


const listComponent = (menuList, category) => {
    const br = DomManipulation.createHtml('br');
    const spanTitle = DomManipulation.createHtml('span', {}, 'cantidad registrada: ' );
    const spanLength = DomManipulation.createHtml('span', { id: 'menu-length' }, menuList.length)
    const labelCategory = DomManipulation.createHtml('label', { class: 'labelSelect', for: 'selectTitle' }, 'Selecione por categoria', [ br, spanTitle, spanLength ]);
    const optionDefect = DomManipulation.createHtml('option', { value: '' }, '-Selecione-');
    const optionAll = DomManipulation.createHtml('option', { value: 'all' }, 'todas las categorias');
    const selectCategory = DomManipulation.createHtml('select', { class: 'list-inputSeach', id: "selectTitle-01" }, '', [ optionDefect, optionAll ]);
    const divFillContain = DomManipulation.createHtml('div', { class: 'seachContain' }, null, [ labelCategory, selectCategory ]);

   
    category.forEach(title => {
        const option = DomManipulation.createHtml('option', { value: title }, title);
        if(title === '') option.textContent = '"menú sin categoria"'
        selectCategory.appendChild(option);
    });


    const titles = menuList.sort((a,b) => {
        let titleA = a.es.toUpperCase();
        let titleB = b.es.toUpperCase();
        if (titleA < titleB) return -1;
        if (titleA > titleB) return 1;
        return 0;
    });


    const listContent = DomManipulation.createHtml('div', { class: 'listContent', id: 'listMenu' })

    titles.forEach(menu => {
        
        const span = DomManipulation.createHtml('span', { class: 'titleList', id: 'selectMenu-02' }, menu.es);
        const enTitle = DomManipulation.createHtml('span', { class: 'titleEn' }, menu.en || 'Titulo en ingles por definir');
        if(!menu.en) enTitle.style.color = '#A50000'
        
        const imgDelete = DomManipulation.createHtml('img', { class: 'imgDelete', src: 'ico/delete/delete.svg' });
        const btnDelete = DomManipulation.createHtml('button', { class: 'btnDelete', id: 'deleted-menu10' }, null, [ imgDelete ]);
        const divList =  DomManipulation.createHtml('div', { class: 'itemMenu', idMenu: menu._id }, null, [ span, enTitle, btnDelete ]);
    
        if(menu.category === null || menu.category === undefined || menu.category === ''){
            divList.style.backgroundColor = '#ff8e8e';
            divList.setAttribute('title', 'Este menú no tiene tiene la propiedad categoria definida');
        }

        if(menu.rulesForBonus === undefined || menu.rulesForBonus === null){ 
            divList.style.border = 'solid 1px rgb(248, 1, 1 )';
            divList.title = 'Este menu no tiene la reglas de los bonos establecido';
        }
        listContent.appendChild(divList);
    });


    const contain = DomManipulation.createHtml('div', { class: 'listContain' }, null, [ divFillContain, listContent ]);
    return contain;
}


export { listComponent };