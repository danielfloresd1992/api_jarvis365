import { createHtml, DomManipulation } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
import DataFormart from '/Lobby/assets/utils/dateFormat.js';

import tranUrlToLocal from '/dependency/trasnforUrl.js'



function printNoveltie(element, locals, html, boolean, permissionUser) {  // * Publicación en el muro
    /*
        * enlace para la consulta de la novedad `/user/novelties/id=${element._id}`
    */
    const data = element.noveltie ? element.noveltie : element;

    const fragment = document.createDocumentFragment();
    const divContent = createHtml('div', { class: 'divContentNovelties', idPublisher: data._id, id: data?._id });


    const divHeader = createHtml('div', { class: 'divContentNovelties-headerOption' });
    const optionBtnHeader = createHtml('button', { class: 'header-btn divContentNovelties-headerOption_btn', id: 'option-noveltie201' });
    const BtnHeaderImg = createHtml('img', { class: 'icoBtnHeader headerNoveltieIco', src: 'ico/more_horiz/more_horiz.svg' });

    optionBtnHeader.appendChild(BtnHeaderImg);

    const divContentList = createHtml('div', { class: 'divContentNovelties-headerListOption' });
    const btnDeleteNoveltie = createHtml('button', { class: 'divContentNovelties-headerListOptionBtn', id: 'delete-noveltie202' }, 'Eliminar elemento');
    const imgDeleteNoveltie = createHtml('img', { class: 'divContentNovelties-headerListOptionImg', src: 'ico/delete/delete.svg' });
    btnDeleteNoveltie.appendChild(imgDeleteNoveltie);
    divContentList.appendChild(btnDeleteNoveltie)


    divHeader.appendChild(optionBtnHeader);
    divHeader.appendChild(divContentList);

    divContent.appendChild(divHeader);

    const divTitle = createHtml('div', { class: 'divContentNovelties-divTitle' });

    let fillLocal = [];
    fillLocal = locals.filter(local => data.local.idLocal === local._id);
    
    if (fillLocal.length) {
        const img = createHtml('img', { class: 'divContentNovelties-img', src: arrayBufferToBase64(fillLocal[0].img?.data?.data, fillLocal[0].img?.contentType), draggable: false, id: 'view-img-noveltie03' });
        divTitle.appendChild(img);
    }

    let textContent = createHtml('div', { class: 'divContentNovelties-textContain' });
    const pTitle = createHtml('p', { class: 'divContentNovelties-pTitle', id: 'find-noveltie&show', idNoveltie: data._id }, `${data.title} ${data.table ? ` - Mesa ${data.table}` : ''}`);
    const pDate = createHtml('p', { class: 'divContentNovelties-pDate' }, DataFormart.formatDateApp(data.date));
    const imgClock = createHtml('img', { class: 'divContentNovelties-pDateImg', src: 'ico/clock/clock.svg' });
    pDate.appendChild(imgClock);
    const hr = createHtml('hr');
    hr.style.width = '100%';
    textContent.appendChild(pTitle);
    textContent.appendChild(pDate);
    textContent.appendChild(hr);
    divTitle.appendChild(textContent);

    const divTextContent = createHtml('div', { class: 'divContentNovelties-contentText' });
    const textDescription = createHtml('p', { class: 'divContentNovelties-text' });
    const pNameLocal = createHtml('p', {}, (data.local.name));
    const br = createHtml('br');
    const pDescription = createHtml('p', {}, data.description);

    textDescription.appendChild(pNameLocal);
    textDescription.appendChild(br);
    textDescription.appendChild(pDescription);
    const viewMenu = createHtml('p', { class: 'divContentNovelties-text divContentNovelties-viewMenu', id: 'span-diaplay-menu04' }, 'ocultar menú');
    const boxTextAndButtonMenu = createHtml('div', { class: 'divContentNovelties-text divContentNovelties-menuContain' });

    const menu = createHtml('textarea', { class: 'divContentNovelties-text textMenu scrolltheme1', contenteditable: true, id: 'menu-noveltie07', tabindex: '0', noveltieId: data._id });
    menu.spellcheck = true;
    menu.designMode = 'on';

    menu.lang = fillLocal[0].lang;

    menu.onblur = e => {
        editMenuRequest(e.target);
    }

    /*
    const btnEditMenu = createHtml('button', { class: 'divContentNovelties-text  textMenuButtonEdit', id: 'write-menu-06' });
    const img = createHtml('img', { class: 'divContentNovelties-text  textMenuButtonEditImg', src: '/ico/edit/edit.svg' });
    btnEditMenu.appendChild(img);
    */
    if (data.menu) {
        let textMenu = '';
        const menuNoveltie = data.menu.replaceAll('*', '').replaceAll('_', '').split('\n');
        for (let j = 0; j < menuNoveltie.length; j++) {
            if (j === 0) {
                let b = createHtml('strong', { class: 'lineText' });
                b.textContent = menuNoveltie[j];
                menu.appendChild(b);
                textMenu += b.textContent;
            }
            else if (j === 1) {
                let i = createHtml('i', { class: 'lineText' });
                i.textContent = menuNoveltie[j];
                menu.appendChild(i);
                textMenu += i.textContent;
            }
            else {
                const span = createHtml('span', { class: 'lineText' });
                span.textContent = menuNoveltie[j].trim();
                if (span.textContent === '' || span.textContent === 'Nota:' || span.textContent === 'Note:') break;
                menu.appendChild(span);
                textMenu += span.textContent
            }
            let br = createHtml('br');
            menu.appendChild(br);
            textMenu += '\n';
        }


        if (menu.children[menu.children.length - 1].tagName === 'BR') menu.children[menu.children.length - 1].remove();

        if (menu.lang === 'es') {
            if (menu.children[menu.children.length - 1].textContent.indexOf('Nota:') < 0) {
                const span = createHtml('span', { class: 'lineText' });
                span.textContent = 'Nota:';
                menu.appendChild(br);
                menu.appendChild(span);
                textMenu += `${span.textContent}`;
            }

        }
        else if (menu.lang === 'en') {
            if (menu.children[menu.children.length - 1].textContent.indexOf('Note:') < 0) {
                const span = createHtml('span', { class: 'lineText' });
                span.textContent = 'Note:';
                menu.appendChild(br);
                menu.appendChild(span);
                textMenu += `${span.textContent}`;
            }
        }
        else {
            console.error('Sa a encontrado un elemento que no contiene la propiedad "lang", y dicho objeto es');
        }
        menu.value = textMenu;
    }


    boxTextAndButtonMenu.appendChild(menu);
    //boxTextAndButtonMenu.appendChild(btnEditMenu);


    divTextContent.appendChild(textDescription);
    divTextContent.appendChild(viewMenu);
    divTextContent.appendChild(boxTextAndButtonMenu);
    divTextContent.appendChild(hr);
    const carouselImg = createHtml('div', { class: 'divContentNovelties-carouselDiv' });
    const divImgContain = createHtml('div', { class: 'divContentNovelties-imgDiv' });



    if (data?.contentType === 'video/mp4') {
        const video = createHtml('video', { class: 'divContentNovelties-carouselImg', controls: true })
        const source = createHtml('source', { autoplay: true, src: arrayBufferToBase64(img.data.data, img.contentType) });
        video.appendChild(source);
        divImgContain.appendChild(video);
    }
    else {
        const imgForCarousel = createHtml('img', { class: 'divContentNovelties-carouselImg', id: 'view-img-noveltie03', src: tranUrlToLocal(data.imageToShare), draggable: !Boolean(data?.isValidate?.validation) });
        divImgContain.appendChild(imgForCarousel);
    }
    carouselImg.appendChild(divImgContain);

    /*
    if(element.noveltie.fileNoveltie.files.length > 1){
        const btnImg = createHtml('div', { class: 'divContentNovelties-carouselBtnContain' });
        const btnLetf = createHtml('button', { class: 'divContentNovelties-carouselBtn', id: 'scroll-left-img:01', disabled: true }, '<');
        const btnRigth = createHtml('button', { class: 'divContentNovelties-carouselBtn', id: 'scroll-right-img:02' }, '>');
        btnImg.appendChild(btnLetf);
        btnImg.appendChild(btnRigth);
        carouselImg.appendChild(btnImg);
    }*/

    let textValidate = '';
    if (data.isValidate === null) {
        textValidate += 'novedad por validar';
    }
    else if (data.isValidate === true) {
        textValidate += 'Validado';
    }
    else {
        textValidate += '!No valido!';
    }
    const pValidate = createHtml('p', { class: 'divContentNovelties-pName' }, `${data.isValidate === undefined ? 'no definido por prototipado' : textValidate}`);

    const hr2 = document.createElement('hr');
    hr2.style.width = '100%';
    hr2.style.width = '100%';

    const like = 'data:image/png;base64,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'
    const dislike = 'data:image/png;base64,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'
    const SHARE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJz0lEQVR4nO3YeVCU9xkHcNommXYab8UDL0RBVKbt2HSaSSZG80cmUfFAQUUF8cALFDSmjRNjjJ1mWuN4VhFFEFQQVC5lAXGX5doL9t5l74NlD2QRGI1VkW/nfYHl3RPw6LQzPjPPfzDzeX48PL/39/j5vY238TZeOSQ22/saS8ditaX9n2rLw1JVc5tOZW5rU5sfQmlqe6w02W1Kk52tNNkzFE32eJXRNtPvfyF01o4PtZb2TI2145HG0g4iCXRfqprbyFSa7I5UNLWS2Wh8wGs0PthpNBp/89+Htzz6g9baUaG1doDIl8A7UmZoscn1tgQ68M4bh0skeE9r6zymsbR3vQ683NBCpkxvg0xv5Uv05jlvDG9sfRygs3Vy+uCueKW5DSV6KY4pS7BHmolo4Rms4P+EKP5JxAlScFByAxmKKvD0Rg94G6Q6KyQay2OJpjn6teM1LR3BOlun3hNebLLib4pCLOQfQRh3P8I4+zGPvQ/z2MmYy0rG3LokzCGydi9Ca/YgrDoZMfVnkKvkOuO1FjJF6uZuscq0/7Xhla2PJ+tsnQZXvNJsxwlVGT5q+K4Xvs8dXtsPD63eg9nViZhdlYjZzASEVO5GJOc4ylVSB16sMRMFkClUNiW9Mt5isfxWa+uQuuL5zWasEZ7yAd/rDCfQVYkI6YWHMHYjmLELwfRdmMfYg9MimjNeZQJfYXwhVBnCX6kAnbUzwxXPMKrxGf9oP5w1eHgwBT7r/k7MqtiBmUTe246DvGsOvEDZRGaDwmDnSTRTXwqvtbV/7ornmprwaf1hz/AaV3iCG3yWB3hQ+XYElcVjRtk2fMvNduD5CiMaGg1okOlpQ8bzgHe1lg4VFS83t2Il/3gvPImEh1YmIoS2HcF34xFM247ZlQk9/e0G30nCZ3qBzyjdhkDaVswo2YYL/Hv9eLke9XI9uFLdl0M7fXNHjOu0+Up6lUT3nXgoIxGLGYeh6mwGEdxWBULuxvf29+6eNqHC7+1AEAmPd4MHlmzF9JItmH53M8JoCWBI5Q48T6YDT6plD6kAjaVDQMWX6eUIq0vubxVmIubTEtH8sx3UiK87hVnlO7zCZxDwUs/waXc2Y1pxHKYWx2Eb8wwVD65UC55E8/Gg8Drbw9+7XlJbhBcwp7e/Q6sTEVKxC/8Q58I1mFYxgoq2eIUHOuAE2h0+tWgTphTGIrBwM0pFQgeeI9GALVadH+zpH6bieU1NmFuTRML7ZvisknjUtMjcCuhGNxbRviZbxBN8uid40SYHfEpBLCYXxGByfgwOMNMdeI5YTRRgA/CLAQtQW9qZ1G+bk/JSp8uHyJnFW6Hs6Ol91zgtzUfgna39bUKBT/MFzyfgGxFweyMCbm3Ah3f2U/BqsEUqsPmquT7xRIVqc/sj6odZbMM5t8snqHgLGFaRxwJ2VZ/G9OLNznACfae/TXzBJ90kcj0m5W1AuUDowLOEStQKFTE+C1CZ7FNcvyo/qTnkdvkE0eJxXHzTDZ+tZmDarRiv8CmFA8Mn5kVjYm40JtxYhxQWzYGvIwoQNB713f/m9g+oeEWzHbMZCe6XT1k8/ly4F89fdDkV8Kf8BEwrivMK7+vvybd9wyfcWIfxOWtxpPKaA18nUKC2ofHSAP3/cBH1e15oNHu9fAIL4nBWUuBUQI6ajqm5G7zCA5zgRJus9wgfn70G/tfX4KuKS/14fiOq62U3fBagNLctoD5GREar98vn7hbMyo2DttPiVMTOypOYnLveaaL0wSd5g+esdYL7X4/CuGtROEAU0IuvaZAPXICiqe13ri+p2eW73Gd47+UztWATltw9iKcvnjkKeNL1FKtpRxCQE42AW72n3QufmBON8RmrMSEzChOy17rDr/XAx12NxNis1ThMv+rAkwXwZBd9F2BsDXB9Bn5E/6v3GV4chyl5G7Cn6qzTX+HfXc+wp/IMJmZFYVJuNCYSJ56zDsFZMWBb5LitqsKneUnwT1sF/6yoXnikAz42czXGZK7Cueo7/fh6GZg8yQ8+CyDbqKn1AfUNG1d3xvcMz49FwPV1OCm45TaVirS1mJ+9HeMzIzExPRL0Jr7TpVem5+KLWwcw9tJKEt0HH3MlAmOvrEIJl+fAV/GkqOZJBn5uKk32CuoD/LjgDgn3OcNvbcSkrDU45aGIZy+6cFPFRLG2Dt4iuvgHjEmPIOGjMyIwOn0lPsjZ7YQnC+AIQwYsQNHU+g11e8DTGcmLa8pAl0/eeky4Eol9lefIFhpKrC36HqPTVpLwUUReXoEkWooTvpIrMfkNJmSmlmDX1UcM82T/DB/g8hmfFYWPbySCa20cFP7xsyeYcWENRqX1wEemLYd/2moUsTkOPJMrQSVHfMpvsNFobOFSVx/lCimm5m8a1OVDTpSsKIy7tBJRRd+DbuSjq/uFR/yTrqfYWHwUoy6Ek/CRl5ZjxMVliC085ooHnS364+ALMLREuu5tdjDPe5nh6zzOcHKiZERgzMUVCLm8EQcY51CoroHqoQmNdiMyxCWYn7EFI84vccBHXAzH9PRolLLrnfAMtpjhN5QA8Cti5Ufd2xxl5fq+fFxmOJE9E2UVRqdHYDRxwinhGHl2CUacWdIDT13mgA9PDcfo1GX4F6PICU8WwBIvHFIBIkP7KKnO2kVdOi0rO+oD7j7DSTgxUTL6/zFHpvX0+Ii+E0/tgQ+/sBTDUpbiIO2yG57OEmb7DTWkhpZIKl6gMWF6buzQ4Ome4D0nPtwFPjIlHPvvprifPFtopbMlE4ZcgExnu0hd92UKmPAfEB7hGX7JHT6MhC/BsPNL4J8agZ/u5XnAi57fZws/GzKe/AvorAbqum8vI9XR3yE3NiOq5Ef8WJ2Hr+mXEXhtgwf4cnf4hX74++eJXIzPs/+Cm7U1ntqm+z5LsPml8GKdOdR1V5nMuIjD1deRL+Q6L53kelRJFEi+l4qw7Hgv8KVO8LEpy7E091ukMUvdRmXvyXfR2YLtfi8bIq0l0W3RSln3uS6dqKuPHE4VDlVkYk3B3/FF3jf4JDsJC7KTsSzvEHYUncIJ+m1UcIVONyzTadqI2u+zhMv8XiUkWnPxy+BdH+BOLynqJ7E3PFtUVc4RzXg1vETynljd/GhAvEz3M1eqE3Ilmu5XxrNFejpbGDuolclAIVZZFnrGG543NBrqGmT6ozy5biFdp/s18fM8uSaMI1GnckQq+1DwlRxxN3G7MljijTwe712/1xVCdfPa/v18k5ivMJ4QKA1LWUrlcF+/R6fT32EJ1ItYAuV3tUJFXq2gUVrLbzTX1Msf1dTL26p4Mj2TJ6VXcaUpTI54Q3W9fJLfmwgAvxQpjQskOt3QL4+38Tb8/i/jP646YsUBUChkAAAAAElFTkSuQmCC'

    const btnContain = createHtml('div', { class: 'divContentNovelties-divBtn' });
    const btnValidate = createHtml('button', { class: 'divContentNovelties-btnValidate', name: 'true', idNoveltie: data._id, id: 'btn-put-01' }, 'validado')
    const btnImgValidate = createHtml('img', { class: 'divContentNovelties-btnImg', src: 'ico/like/like.svg' })
    btnValidate.appendChild(btnImgValidate);
    btnContain.appendChild(btnValidate);
    const btnDisValidate = createHtml('button', { class: 'divContentNovelties-btnValidate', name: 'false', idNoveltie: data._id, id: 'btn-put-01' }, 'invalidado')
    const btnImgDisValidate = createHtml('img', { class: 'divContentNovelties-btnImg', src: 'ico/like/dislike.svg' })
    const share = createHtml('button', { class: 'divContentNovelties-btnValidate', title: 'Compartir con Jarvis', id: 'share-noveltie-Jarvis', idNoveltie: data._id }, 'enviar');
    const imgShare = createHtml('img', { class: 'divContentNovelties-shareImg', src: SHARE64, id: 'btn-share-01' });
    share.appendChild(imgShare);



    if (typeof data.isValidate === 'string') {

        if (data.isValidate === 'null') {
            divContent.title = 'sin validar';
            pValidate.textContent = 'aun no esta validado';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
        else if (data.isValidate === 'true') {
            divContent.title = 'novedad valida';
            btnValidate.classList.add('btnValidate');
            btnImgValidate.classList.add('imgValidate');
            pValidate.textContent = 'Novedad validada';
            share.removeAttribute('disabled');
            share.title = 'Compartir ahora!';
        }
        else if (data.isValidate === 'false') {
            divContent.title = 'novedad no valida';
            btnDisValidate.classList.add('btnInvalidate');
            btnImgDisValidate.classList.add('imginValidat');
            pValidate.textContent = 'Novedad no valida';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
    }
    else if (typeof data.isValidate === 'object') {
        if (data.isValidate.validation === 'null') {
            divContent.title = 'sin validar';
            pValidate.textContent = 'aun no esta validado';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
        else if (data.isValidate.validation === 'true') {
            divContent.title = 'novedad valida';
            btnValidate.classList.add('btnValidate');
            btnImgValidate.classList.add('imgValidate');
            pValidate.textContent = 'Novedad validada';
            share.removeAttribute('disabled');
            share.title = 'Compartir ahora!';
            btnImgValidate.src = like;
        }
        else if (data.isValidate.validation === 'false') {
            divContent.title = 'novedad no valida';
            btnDisValidate.classList.add('btnInvalidate');
            btnImgDisValidate.src = dislike;
            btnImgDisValidate.classList.add('imginValidat');
            pValidate.textContent = 'Novedad no valida';
            share.setAttribute('disabled', 'true');
            share.title = 'No puedes compartir por quer no esta validado';
        }
    }

    if (!permissionUser.super) share.setAttribute('disabled', 'true');

    btnDisValidate.appendChild(btnImgDisValidate);
    btnContain.appendChild(btnValidate);
    btnContain.appendChild(btnDisValidate);
    btnContain.appendChild(share);

    divContent.appendChild(divTitle);
    divContent.appendChild(divTextContent);
    divContent.appendChild(carouselImg);

    if (data.userPublicate) {
        const iNameUser = createHtml('i', { class: 'divContentNovelties-iNameUserPublisher' }, `Compartido por: ${data?.userPublicate?.name}`);
        divContent.appendChild(iNameUser);

        if (typeof data.isValidate === 'object' && typeof data.isValidate.for === 'string') {
            const validateForText = createHtml('i', { class: 'divContentNovelties-iNameUserPublisher' }, `Verificado por: ${data.isValidate.for}`);
            divContent.appendChild(validateForText);
        }

    };
    divContent.appendChild(btnContain);
    fragment.appendChild(divContent);
    if (boolean) {
        divContent.classList.add('start');
    }
    return fragment;
}



async function editMenuRequest(elementHtml) {
    try {
        const id = elementHtml.getAttribute('noveltieid');
        const textArray = elementHtml.value.split('\n');
        textArray[0] = `*${textArray[0].trim()}*`;
        const arrayFilter = textArray.filter(item => item.trim() !== '' && item.trim() !== 'Nota:' && item.trim() !== 'Note:').join('\n');
        /*
        const arrayHtml = elementHtml.parent
        Node.children[0].children;
        const id = elementHtml.getAttribute('noveltieid');
        let textUpdate = '';
        Array.from(arrayHtml).forEach(line => {
    
            
            if((line.textContent === '' || line.textContent.trim() === 'Nota:' || line.textContent.trim() === 'Note:') && line.tagName  !== 'BR'){
                return;
            }
            else{
                if(line.tagName === 'B'){
                    textUpdate += `*${line.textContent.trim()}*`;
                   
                }
               if(line.tagName === 'I'){
                textUpdate += `_*${line.textContent.trim()}*_`;
               
                }
               if(line.tagName === 'BR'){
                    textUpdate += '\r\n';
               }
               if(line.tagName === 'SPAN'){
                    if(line.textContent.trim() !== 'Nota:' || line.textContent.trim() !== 'Note:' || line.textContent.trim() !== '') textUpdate += `${line.textContent.trim()}`;
               }
            }
            
           
        });
        const arrayTextResult = textUpdate.split('\r\n');
        if((arrayTextResult[arrayTextResult.length - 1]) === '') arrayTextResult.pop();
        */

        const data = await axios.put(`https://${window.location.host}/novelties/id=${id}`, { menu: arrayFilter /* arrayTextResult.join('\r\n') */ });
    }
    catch (err) {
        console.log(err);
    }
}



export { printNoveltie };