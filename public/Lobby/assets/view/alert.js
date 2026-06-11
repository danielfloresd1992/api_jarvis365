import { createHtml } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
import DataFormart from '/Lobby/assets/utils/dateFormat.js';



function showAlert(data, booblean){
    let fragment = document.createDocumentFragment();

    const divContent = createHtml('div', { class: 'divContentNovelties', idPublisher: 'Alert'});
    if(booblean) divContent.classList.add('start');
    const divTitle = createHtml('div', { class: 'divContentNovelties-divTitle' });
    const pTitle =  createHtml('p', { class : 'divContentNovelties-pTitle' }, `${data.title} - ${data.alert.shift}`);
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
    const imgContainAlert = createHtml('div', { class: 'divContentNovelties-imgContainAlert' });
    const img = createHtml('img', { class: 'divContentNovelties-imgAlert' , src: arrayBufferToBase64(data.alert.img.data.data, data.alert.img.contentType), id: 'view-img-noveltie03' });
    imgContainAlert.appendChild(img);
    divContent.appendChild(imgContainAlert);

    fragment.appendChild(divContent);
    return fragment;
}


export { showAlert };