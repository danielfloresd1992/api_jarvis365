
export default class BoxModal {

    constructor(elementHtml){
        this.parendHtml = elementHtml;
        this.divContain = this.#createHtml('div', { class: 'boxModal-Component', id: '#boxModal-01' });
        const boxModal = this.#createHtml('div', { class: 'boxModal' });
        const titleContain = this.#createHtml('div', { class: 'boxModal-titleContain' });
        this.title = this.#createHtml('h1', { class: 'boxModal-title-h1', id: 'boxModal-01-titleText' }, 'Error');
        const btnTitle = this.#createHtml('button', { class: 'boxModal-btnTitle btn-architel', id: 'boxModal-01-btn1', src: 'ico/close/close.svg' });
        const btnImg = this.#createHtml('img', { class: 'boxModal-btnImg',  src: 'ico/close/close.svg' });
        btnTitle.appendChild(btnImg);
        titleContain.appendChild(this.title);
        titleContain.appendChild(btnTitle);
        boxModal.appendChild(titleContain);
     
        const descriptionContain = this.#createHtml('div', { class: 'boxModal-boxModalContain' });
        const img = this.#createHtml('img', { class: 'boxModal-descriptioImg',  src: 'img/LOGO-SLIDER.png', draggable: false });
        this.description = this.#createHtml('p', { class: 'boxModal-descriptioP',  id: 'boxModal-01-descriptionText' }, 'Hola mundo');
        descriptionContain.appendChild(img);
        descriptionContain.appendChild(this.description);
        this.btnContain = this.#createHtml('div', { class: 'boxModal-btnContain' });
        const btnClose = this.#createHtml('button', { class: 'btnContain-send boxModal-btnClose',  id: 'boxModal-01-btn2' }, 'cerrar');
        btnContain.appendChild(btnClose);
        boxModal.appendChild(titleContain);
        boxModal.appendChild(descriptionContain);
        boxModal.appendChild(this.btnContain);
        this.divContain.appendChild(boxModal);

        btnClose.onclick = () => {
            this.divContain.remove();
        };
        btnTitle.onclick = () => {
            this.divContain.remove();
        };
    };

    show(title, text){
        if(typeof title !== 'string' || typeof text !== 'string') throw 'This argument is not type string';

        this.parendHtml.appendChild(this.divContain);
        this.title.textContent = title;
        this.description.textContent = text;
    }

    hidden(){
        this.divContain.remove();
    }


}


class BoxModalDual extends BoxModal{

}