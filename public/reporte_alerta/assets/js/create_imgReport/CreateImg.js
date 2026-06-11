import { DomManipulation } from '/utils/createHtml.js';



class CreateImg{

    constructor(elementHtml, config){
        if(!(elementHtml instanceof HTMLElement)) throw 'This parameter requires an HTML element.';
        this.title = config.title;
        this.arrayText = [];
        this.textFooter = config.textFooter || '';
        this.fragment = DomManipulation.createHtml('div', { class: 'img-text-404', id: 'img-text-404' });
        this.body = elementHtml;
        this.box;
        this.style = `
            .img-text-404{
                position: absolute;
                top: 0;
                height: 0;
                width: 100%;
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .img-box-404 {
                background-color: #fff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-width: 500px;
            }
            .img-textHeaderContain-404{
                width: 100%;
                background-color: #0657ae;
                color: #fff;
                font-size: 1.2rem;
                padding: 0.3rem 0.4rem;
            }
            .img-textContain-404{
                width: 100%
            }
            .component-text{
                width: 100%;
                padding: 0.2rem 0.4rem;
                border-bottom: 1px solid #b7b7b7;
            }
            .img-textFooterContain-404{
                width: 100%;
            }
            .img-textFooterContain-404{
                width: 100%;
                padding: 0.4rem;
                background-color: #8b8b8b;
                color: #fff;
            }
        `;
        const sectionStyle = DomManipulation.createHtml('style', {}, this.style);
        this.fragment.appendChild(sectionStyle);
    }


    pushText(text){
        
        if(typeof text !== 'string') throw 'The parameter must be of type string';
        const p = DomManipulation.createHtml('p', { class: 'component-text' }, text);
        this.arrayText.push(p);
    }

    createImg(){
        if(this.arrayText.length > 0){
            const textHeader = DomManipulation.createHtml('p', { class: 'img-textHeader-404' }, this.title );
            const textHeaderContain = DomManipulation.createHtml('div', { class: 'img-textHeaderContain-404' }, null, [ textHeader ]);

            const textContain = DomManipulation.createHtml('div', { class: 'img-textContain-404' }, null);
            this.arrayText.forEach(text => {
                textContain.appendChild(text);
            });
            
            const textFooter = DomManipulation.createHtml('p', { class: 'img-textFooter-404' }, this.textFooter);
            const textFooterContain = DomManipulation.createHtml('div', { class: 'img-textFooterContain-404' }, null, [ textFooter ]);

            this.box = DomManipulation.createHtml('div', { class: 'img-box-404' }, null , [ textHeaderContain, textContain, textFooterContain ]);
            this.fragment.appendChild(this.box);
            this.body.appendChild(this.fragment);

            
        }
    }


    generateAndSend(callback){
        if(this.arrayText.length > 0){
            html2canvas(this.box)
                .then(canvas => {
                    this.fragment.remove();
                    this.arrayText = [];
                    const img = canvas.toDataURL('image/png');
                    console.log(img);
                    const Month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun','Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    const date = new Date();
                    let day = date.getDate();
                    let month = date.getMonth();
                    let year = date.getFullYear();
                    let hour = date.getHours();
                    let minute = date.getMinutes();
                    let second = date.getSeconds();
                    if(day < 10) day = '0' + day;
                    if(hour < 10) hour = '0' + hour;
                    if(minute < 10) minute = '0' + minute;
                    if(second < 10) second = '0' + second;
                    let text = `Clientes sin reportar 📈\nFecha: ${day}-${Month[month]}-${year} \nHora: ${hour}:${minute}:${second}`;

                    callback(null, { img : img, text:  text});

                })
                .catch(err => {
                    callback(err, null);
                    console.log(err);
                })
                .finally(() => {
                    if(document.getElementById('img-text-404'))  document.getElementById('img-text-404').remove();
                })
        }
    }
}


export default CreateImg;