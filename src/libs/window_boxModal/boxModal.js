'use strict';

export default class BoxModal {

    constructor(elementHtml){
        this.parendHtml = elementHtml;
        this.divContain = this.createHtml('div', { class: 'boxModal-Component', id: '#boxModal-01' });
        const boxModal = this.createHtml('div', { class: 'boxModal' });
        const titleContain = this.createHtml('div', { class: 'boxModal-titleContain' });
        this.title = this.createHtml('h1', { class: 'boxModal-title-h1', id: 'boxModal-01-titleText' }, 'Error');
        this.btnTitle = this.createHtml('button', { class: 'boxModal-btnTitle btn-architel', id: 'boxModal-01-btn1', src: 'ico/close/close.svg' });
        const btnImg = this.createHtml('img', { class: 'boxModal-btnImg',  src: 'ico/close/close.svg' });
        this.btnTitle.appendChild(btnImg);
        titleContain.appendChild(this.title);
        titleContain.appendChild(this.btnTitle);
        boxModal.appendChild(titleContain);
     
        const descriptionContain = this.createHtml('div', { class: 'boxModal-boxModalContain' });
        const img = this.createHtml('img', { class: 'boxModal-descriptioImg',  src: 'img/LOGO-SLIDER.png', draggable: false });
        this.description = this.createHtml('p', { class: 'boxModal-descriptioP',  id: 'boxModal-01-descriptionText' }, 'Hola mundo');
        descriptionContain.appendChild(img);
        descriptionContain.appendChild(this.description);
        this.btnContain = this.createHtml('div', { class: 'boxModal-btnContain' });
        this.btnClose = this.createHtml('button', { class: 'btnContain-send boxModal-btnClose',  id: 'boxModal-01-btn2' }, 'Cerrar');

        
        this.btnContain.appendChild(this.btnClose);
        boxModal.appendChild(titleContain);
        boxModal.appendChild(descriptionContain);
        boxModal.appendChild(this.btnContain);
        this.divContain.appendChild(boxModal);

       
    };

    show(title, text, config){
        if(typeof title !== 'string' || typeof text !== 'string') throw 'This argument is not type string';

        if(config?.isBtnAccept){
            if(!this.btnAccept) this.btnAccept = this.createHtml('button', { class: 'btnContain-send boxModal-btnClose',  id: 'boxModal-01-btn2' }, 'Aceptar');
            
            this.btnClose.textContent = 'Cancelar';
            this.btnContain.appendChild(this.btnAccept);

            this.btnAccept.onclick = () => {
                config.method();
                this.btnClose.onclick = null;
                this.btnTitle.onclick = null;
                this.btnAccept.onclick = null;
                this.divContain.remove();
                this.btnAccept.remove();
            }
        }
        else{
            this.btnClose.textContent = 'Cerrar';
        }

        this.parendHtml.appendChild(this.divContain);
        this.title.textContent = title;
        this.description.textContent = text;

        this.btnClose.onclick = () => {
            this.btnClose.onclick = null;
            this.btnTitle.onclick = null;
            this.divContain.remove();
        };


        this.btnTitle.onclick = () => {
            this.btnClose.onclick = null;
            this.btnTitle.onclick = null;
            this.divContain.remove();
        };


    }

    hidden(){
        this.divContain.remove();
    }


    createHtml(elementHtml, attributes = {}, text){
        let element = document.createElement(elementHtml);
        let keys = Object.keys(attributes);
        if(text) element.textContent = text;
        keys.forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
        return element;
    }
}


