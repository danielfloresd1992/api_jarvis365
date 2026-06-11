import { createHtml } from '/utils/createHtml.js';
import DataFormart from '/Lobby/assets/utils/dateFormat.js';

//    0416 727 32 81

function showCorte(data, html, booblean){


    let fragment = document.createDocumentFragment();

    const divContent = createHtml('div', { class: 'divContentNovelties', idPublisher: 'Corte'});
    if(booblean) divContent.classList.add('start');
    const divTitle = createHtml('div', { class: 'divContentNovelties-divTitle' });
    const pTitle =  createHtml('p', { class : 'divContentNovelties-pTitle' }, data.title);
    let textContent = createHtml('div', {class: 'divContentNovelties-textContain'});
    const pDate = createHtml('p', { class:  'divContentNovelties-pDate'}, DataFormart.formatDateApp(data.date));
    const imgClock = createHtml('img', {class: 'divContentNovelties-pDateImg', src: 'ico/clock/clock.svg' });
    pDate.appendChild(imgClock);
    const hr = createHtml('hr');
    hr.style.width = '100%';
    textContent.appendChild(pTitle);
    textContent.appendChild(pDate);
    textContent.appendChild(hr);
    divTitle.appendChild(textContent);
    divContent.appendChild(divTitle);

    const corteContaint = createHtml('div', { class : 'divContentNovelties-corteContaint' });
    
    data.corte.corte.forEach(result => {

        const localContent = createHtml('div', { class : 'divContentNovelties-localContent' });
        let name =  createHtml('p', { class : 'divContentNovelties-pNameLocal' }, `💠${result.name}`);
        localContent.appendChild(name);
        const tables = createHtml('p', { class : 'divContentNovelties-pNameLocal' }, `Rotaciones ${result.rotaciones}`);
        localContent.appendChild(tables);
        const keyProces = Object.keys(result.procesos);

        keyProces.forEach(key =>{
            
            const textContentProcess =  createHtml('div', { class:  'divContentNovelties-textContent'});
            const keyB = createHtml('b', { class:  'divContentNovelties-pDate'}, `${key}`);
            const value = createHtml('p', { class:  'divContentNovelties-pDate'}, `: ${result.procesos[key]}`);
            textContentProcess.appendChild(keyB);
            textContentProcess.appendChild(value);
            localContent.appendChild(textContentProcess);
            corteContaint.appendChild(localContent);
        });

        const keyTouch = Object.keys(result.toques);
        keyTouch.forEach(key => {
            const textContentProcessTouch =  createHtml('div', { class:  'divContentNovelties-textContent'});
            const touchResult = result.toques[key];
           
            if(typeof touchResult === 'string'){
                const keyB = createHtml('b', { class:  'divContentNovelties-pDate'}, `${key.split('_').join(' ')}`);
                const value = createHtml('p', { class:  'divContentNovelties-pDate'}, `: ${result.toques[key]}`);
                textContentProcessTouch.appendChild(keyB);
                textContentProcessTouch.appendChild(value);
                localContent.appendChild(textContentProcessTouch);
                corteContaint.appendChild(localContent);
                
            }
            else if(typeof touchResult === 'object'){

                const keyTouchType = Object.keys(touchResult);
                const keyB = createHtml('b', { class:  'divContentNovelties-pDate'}, `${key.split('_').join(' ')} `);
                textContentProcessTouch.appendChild(keyB);


                keyTouchType.forEach(typeTouch => {
                    const keytype = createHtml('b', { class:  'divContentNovelties-pDate'}, ` » ${typeTouch}`);
                    const value = createHtml('p', { class:  'divContentNovelties-pDate'}, `: ${touchResult[typeTouch]}`);
                    textContentProcessTouch.appendChild(keytype);
                    textContentProcessTouch.appendChild(value);
                    localContent.appendChild(textContentProcessTouch);
                    corteContaint.appendChild(localContent);
                });
            }
        });
    });


    divContent.appendChild(corteContaint);
    fragment.appendChild(divContent);
    return fragment;
}


export { showCorte };