import { createHtml, DomManipulation } from '/utils/createHtml.js';

//const URL = '72.68.60.254';

class CreateDivImg {


    constructor(htmlParam, insertHtmlParam, url){
        if( !(htmlParam instanceof HTMLElement) || !(insertHtmlParam instanceof HTMLElement) ) throw 'This parameter requires an HTML element.';

        this.url = url;
        this.array = [];
        this.containHtml = insertHtmlParam;
        this.formParam = htmlParam;
        this.fragment;
        this.tableHtml;

        for(let i = 0; i < this.formParam.children.length; i++){
            const localContainHtml = this.formParam.children[i];
            const object = {}
            object.name = this.formParam.children[i].children[0].children[0].textContent;
            
            object.alertas = Number(this.formParam.children[i].children[1].children[1].value);
            object.resaltante = Number(this.formParam.children[i].children[2].children[1].value);
            object.motoringValue = this.formParam.children[3].children[0].checked;
        
            if(localContainHtml.getAttribute('date-time') === 'on'){
                this.formParam.children[i].classList.contains('active') ? object.out = false : object.out = true;
            }
            else{
                object.out = null;
            }

            this.array.push(object);
        } 
    }

    
    createSectionHtml(){
        let totalAlert = 0;
        let totalImportant = 0;

        this.fragment = DomManipulation.createHtml('div' , { class: 'contentImg-303', id: 'contentImg-303-id' });
        this.tableHtml = DomManipulation.createHtml('div', { class: 'imgSend', id: 'myCanvas' });
        let title = DomManipulation.createHtml('div', { class: 'title' });
        let h2 = DomManipulation.createHtml('h2', {} , 'Reportes de alertas en vivo 🚨');
        title.appendChild(h2);
        this.tableHtml.appendChild(title);

        let tdH1 = DomManipulation.createHtml('td', {}, 'Local');
        let tdH2 = DomManipulation.createHtml('td' , {}, 'Alertas');
        let tdH3 = DomManipulation.createHtml('td', {}, 'Resaltantes');
        tdH3.style.color = 'rgb(255, 1, 1)';
        let tdH4 = DomManipulation.createHtml('td', {}, '¿Monitoreo?');
        
        tdH3.style.color = 'rgb(255, 1, 1)';
        let tHeat = DomManipulation.createHtml('tr', {} ,'' , [ tdH1, tdH2, tdH3, tdH4 ]);
        let table = DomManipulation.createHtml('table', { class: 'table-alert' }, '', [ tHeat ]);

        this.tableHtml.appendChild(table);

        this.array.forEach(result => {
            //aqui para terminar
            let td1 = DomManipulation.createHtml('td', {}, result.name);
            let td2 = DomManipulation.createHtml('td', { style: '' }, String(result.alertas));
            let td3 = DomManipulation.createHtml('td', {}, String(result.resaltante));
            let td4 = DomManipulation.createHtml('td', {}, '');
            
            td2.style.fontSize = '1.1rem';
            td3.style.fontSize = '1.1rem';

           
            if(typeof result.out === 'boolean'){
                result.out ? td4.textContent = 'Inactivo ❌' : td4.textContent = 'Activo ✅';
            }
            else{
                td4.textContent = 'Sin especificar';
            }
            if(result.motoringValue) td4.appendChild(document.createTextNode('Caido'));

            let tr = DomManipulation.createHtml('tr', {} ,'', [ td1, td2, td3, td4 ]);
            
            
            if(result.resaltante) td3.style.color = 'rgb(255, 1, 1)';
          
            table.appendChild(tr);
            if(typeof result.alertas === 'number') totalAlert += result.alertas;
            totalImportant += result.resaltante; 
        });

        let divResult = document.createElement('div');
        divResult.setAttribute('class', 'div-result');
        let h3Alert = document.createElement('h3');
        h3Alert.appendChild(document.createTextNode(`📣 Alertas totales: ${totalAlert}`));
        let h3Important = document.createElement('h3');
        h3Important.appendChild(document.createTextNode(`📣 Resaltante totales: ${totalImportant}`));
        divResult.appendChild(h3Alert);
        divResult.appendChild(h3Important);
        this.tableHtml.appendChild(divResult);
        this.fragment.appendChild(this.tableHtml);
        this.containHtml.appendChild(this.fragment);
    }
 
    generateAndSend(callback){
        
        html2canvas(this.tableHtml)
            .then(canvas => {
                this.fragment.remove();
                const img = canvas.toDataURL('image/png');
            
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
                let text = `Reporte de alertas en vivo 📈\nFecha: ${day}-${Month[month]}-${year} \nHora: ${hour}:${minute}:${second}`;


                callback(null, { img : img, text:  text});


            })
            .catch(err => {
                console.log(err);
                this.fragment.remove();
            });
    }
}





export default CreateDivImg;