'use stric';
//objetos con variables del dom
const elementDocument = {
    body: document.getElementsByTagName('body')[0],
    text: document.getElementById('header-text'),
    container: document.getElementById('container-demora'),
    selectFranquicia: document.getElementById('select-franquicia'),
    selectLocal: document.getElementById('select-local'),
    selectPlato: document.getElementById('select-plato'),
    numberTable: document.getElementById('number-table'),
    btnSubmit: document.getElementById('btn-submit'),
    submit: document.getElementById('form'),
    keyImg: true,
    key: false,
    dateFood : {
        hourStart: document.getElementById('hour-start'),
        minuteStart: document.getElementById('minute-start'),
        secondStart: document.getElementById('second-start'),
        hourEnd: document.getElementById('hour-end'),
        minuteEnd: document.getElementById('minute-end'),
        secondEnd: document.getElementById('secound-end'),
    },
    local:{
        bocas: ['Seleccione un local', 'Bocas House', 'Bocas Weston', 'Bocas Orlando', 'Bocas Brickell', 'Bocas Grill'],
        francisca: ['Seleccione un local', 'Francisca Doral', 'Francisca Miami', 'Francisca Miami Lakes', 'Francisca Davie', 'Francisca Miramar'],
        mister: ['Seleccione un local', 'Mister PemBroke',  'Boca Raton']
    }
}
const menuPlato = {
    francisca: ['entrada', 'plato fuerte', 'postre'],
    bocas: ['plato fuerte', 'launch'],
    brickell:['appetizer', 'entree', 'dessert', 'drinks', 'drinks bar', 'uber', 'take out', 'postmates', 'doordash', 'grubhub'],
    mister: ['appetizer','pizza', 'calzone', 'salad']
}
const JsonSend = {
    img: null,
    franquicia: null,
    Mesa: null,
    start: null,
    end: null,
    total: null,
}
//clases reciclable
class PushElenment 
{
    static startInput(time) //dicho metodo recive un objeto con 6 atributos de input con value numerico del dom.
    {
        let object = Object.values(time);
        const fragment1 = document.createDocumentFragment();
        const fragment2 = document.createDocumentFragment();
        const fragment3 = document.createDocumentFragment();
        const fragment4 = document.createDocumentFragment();
        const fragment5 = document.createDocumentFragment();
        const fragment6 = document.createDocumentFragment();
        let count = 0;
        for (let index = 0; index <= 59; index++) 
        {
            if(index <= 10) count = '0' + index;
            if(index >= 10) count = '' + index;
            if(index < 24)
            {
                let option = document.createElement('option');
                let option2 = document.createElement('option')
                option.appendChild(document.createTextNode(count));
                option2.appendChild(document.createTextNode(count));
                fragment1.appendChild(option);
                fragment2.appendChild(option2);
            }
            let option3  = document.createElement('option');
            let option4  = document.createElement('option');
            let option5  = document.createElement('option');
            let option6  = document.createElement('option');
            option3.appendChild(document.createTextNode(count));
            option4.appendChild(document.createTextNode(count));
            option5.appendChild(document.createTextNode(count));
            option6.appendChild(document.createTextNode(count));
            fragment3.appendChild(option3);
            fragment4.appendChild(option4);
            fragment5.appendChild(option5);
            fragment6.appendChild(option6);
        }
        object[0].appendChild(fragment1);
        object[1].appendChild(fragment3);
        object[2].appendChild(fragment5);

        object[3].appendChild(fragment2);
        object[4].appendChild(fragment4);
        object[5].appendChild(fragment6);
    } 
}
class VoidFileWindows
    {
        static fileHover(element)
        {
            element.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.add('active');
            element.classList.remove('desaptive');
        });
    }
    static fileLeave(element)
    {
        element.addEventListener('dragleave', e => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('active');
            element.classList.remove('desaptive');
        });
    }
    static fileDrop(element, elementFather)
    {   
        if(element === null && elementFather === null)
        {
            console.error('Method: fileDrop requires 2 arguments');
        }
        else
        {    
        elementFather.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
        });
        element.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('active');
            element.classList.add('desaptive');
            let file = e.dataTransfer.files[0];
            VoidFileWindows.fileData(VoidFileWindows.fileValidate(file));
            });
        }
    }
    static fileValidate(file)
    {
        if(file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/bmp')
        {
            return file
        }
        else
        {
            return console.error('File not soported');
        }
    }
    static fileData(file)
    {
        if(elementDocument.keyImg === true && file !== undefined)
        {
            const fragmen = document.createDocumentFragment();
            const img = document.createElement('img', 'imd-demora');
            img.setAttribute('class', 'imd-demora');
            img.setAttribute('id', 'imd-demora');
            let fileReader = new FileReader;
            fileReader.readAsDataURL(file);
            JsonSend.img = file;
            fileReader.addEventListener("load", (e) => {
                img.setAttribute('src',e.target.result);
                fragmen.appendChild(img);
                elementDocument.container.appendChild(fragmen);
                elementDocument.keyImg = false;
                elementDocument.key = true;
                JsonSend.img = file;
                });
        }
        else if(elementDocument.keyImg === false && file !== undefined)
        {
            const img = document.getElementById('imd-demora')
            let fileReader = new FileReader;
            fileReader.readAsDataURL(file);
            fileReader.addEventListener("load", (e) => {
                img.setAttribute('src',e.target.result);
                JsonSend.img = file;
                elementDocument.key = true;
            });
        }
    }
}
class VoidFileAndroid
{
    static fileCamera(container)
    {
        const fragment = document.createDocumentFragment();
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute ('capture', 'image');
        input.setAttribute ('class', 'camera');
        input.setAttribute ('id', 'camera');
        input.setAttribute('accept',"image/png, .jpeg, .jpg, image/gif")
        input.setAttribute ('name', 'myLabel');
        input.style.zIndex = '10';
        label.appendChild(input);
        fragment.appendChild(label);
        container.appendChild(fragment);
        VoidFileAndroid.input = document.getElementById('camera');
    }
    static fileLoad()
    {
        VoidFileAndroid.input.addEventListener('change', e => {
            console.log(e)
            VoidFileWindows.fileData(VoidFileWindows.fileValidate(e.target.files[0]));
        })
    }
    input = null;
}
class TimeValidate
{
    static validateTime()
    {
        let hora1 = (`${elementDocument.dateFood.hourStart.value}:${elementDocument.dateFood.minuteStart.value}:${elementDocument.dateFood.secondStart.value}`).split(":");
        let hora2 = (`${elementDocument.dateFood.hourEnd.value}:${elementDocument.dateFood.minuteEnd.value}:${elementDocument.dateFood.secondEnd.value}`).split(":");
        let t1 = new Date();
        let t2 = new Date();
        t1.setHours(hora1[0], hora1[1], hora1[2]);
        t2.setHours(hora2[0], hora2[1], hora2[2]);
        //Aquí hago la resta
        const rest = t1.setHours(t1.getHours() - t2.getHours(), t1.getMinutes() - t2.getMinutes(), t1.getSeconds() - t2.getSeconds());
        let hours = parseInt((rest % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        let minutes = parseInt((rest % (1000 * 60 * 60)) / (1000 * 60));
        let seconds = parseInt((rest % (1000 * 60)) / 1000);
        
        if(!isNaN(hours) || !isNaN(minutes) || !isNaN(seconds))
        {
            TimeValidate.restarHora();
        }
    }
    static restarHora()
    {
        let hora1 = Number(elementDocument.dateFood.hourStart.value);
        let hora2 = Number(elementDocument.dateFood.hourEnd.value);
        let minuto1 = Number(elementDocument.dateFood.minuteStart.value);
        let minuto2 = Number(elementDocument.dateFood.minuteEnd.value);
        let segundo1 = Number(elementDocument.dateFood.secondStart.value);
        let segundo2 = Number(elementDocument.dateFood.secondEnd.value);
        let horaTotal = hora2 - hora1;
        let minutoTotal = minuto2 - minuto1;
        let segundoTotal = segundo2 - segundo1;
        if(segundoTotal < 0)
        {
            let segundoRest = segundoTotal;
            segundoTotal = 60 - Math.abs(segundoRest);
            minutoTotal--
        }
        if(minutoTotal < 0)
        {
            let minutoRest = minutoTotal;
            minutoTotal = 60 - Math.abs(minutoRest);
            horaTotal--;
        }
        if(horaTotal < 0)
        {
            elementDocument.text.textContent ='La hora de listo en tablet no puede ser menor a la de toma de orden';
        }
        else
        {
            if(horaTotal < 10) horaTotal = `0${horaTotal}`;
            if(minutoTotal < 10) minutoTotal = `0${minutoTotal}`;
            if(segundoTotal < 10) segundoTotal = `0${segundoTotal}`;
            elementDocument.text.textContent = `Tiempo total: ${horaTotal}:${minutoTotal}:${segundoTotal}`;
            let hora1 = `${elementDocument.dateFood.hourStart.value}:${elementDocument.dateFood.minuteStart.value}:${elementDocument.dateFood.secondStart.value}`;
            let hora2 = `${elementDocument.dateFood.hourEnd.value}:${elementDocument.dateFood.minuteEnd.value}:${elementDocument.dateFood.secondEnd.value}`;
            JsonSend.start = String(hora1);
            JsonSend.end = String(hora2);
            JsonSend.total = String(`${horaTotal}:${minutoTotal}:${segundoTotal}`);
        }
    }
}
class inserText 
{
    static selectFranquicia(elementOption, array)
    {  
        const fragmentOption = document.createDocumentFragment();
        if(elementOption.children.length < 1)
        {
            for (let index = 0; index < array.length; index++) {
                const options = document.createElement('option');
                options.appendChild(document.createTextNode(array[index]));
                fragmentOption.appendChild(options);
            }
            elementOption.appendChild(fragmentOption);
        }
        else
        { 
            inserText.deleteOption(elementOption);
            for (let index = 0; index < array.length; index++) {
                const options = document.createElement('option');
                options.appendChild(document.createTextNode(array[index]));
                fragmentOption.appendChild(options);
            }
            elementOption.appendChild(fragmentOption);
            
        }
    }
    static deleteOption(elementOption)
    {
        for (let index = elementOption.children.length - 1; index <= elementOption.children.length - 1; index--) {
            if(index < 0) break
            elementOption.removeChild(elementOption.children[index]);1
        }
    }
}

(function()
{
    elementDocument.body.addEventListener('load', PushElenment.startInput(elementDocument.dateFood));
    elementDocument.body.addEventListener('change', e => changeSelect(e));
    elementDocument.submit.addEventListener("submit", e => validationDate(e));

        if(navigator.userAgent.match(/Windows NT 10.0/i) || navigator.userAgent.match(/Windows NT 6.1/i))
        {
            elementDocument.container.style.backgroundImage = ' url(../Lobby/img/dragAndDropt.jpeg)';
            elementDocument.text.textContent = 'Arrastre una imagen en el cuadro correspondiente';
            VoidFileWindows.fileHover(elementDocument.container);
            VoidFileWindows.fileLeave(elementDocument.container);
            VoidFileWindows.fileDrop(elementDocument.container, elementDocument.body); 
        }
        else if(navigator.userAgent.match(/Android/i))
        {
            elementDocument.container.style.backgroundImage = ' url(../Lobby/img/imgCamera.jpg)';
            elementDocument.text.textContent = 'Pesione el ícono de la cámara';
            VoidFileAndroid.fileCamera(elementDocument.container);
            VoidFileAndroid.fileLoad();
        }
        else if(navigator.userAgent.match(/(iPhone|iPad|iPod)/i))
        {
            console.log('¡Funciono en Ios!');
        }
        else{
            alerta('¡Error!','Su versión del sistema operativo no es compatible con esta función');
        elementDocument.text.textContent = 'Consulte con soporte técnico';
        }
}());

function changeSelect(e) 
{
    if(e.target.localName === 'input' || e.target.localName === 'select') e.target.classList.remove('active');
    if(e.target.className === 'selected')
    {
        TimeValidate.validateTime();
        //PushElenment.createOption();
    }
    if(e.target.className === 'franquicia')
    {
        if(e.target.value === 'Bocas' )
        {
            inserText.selectFranquicia(elementDocument.selectLocal, elementDocument.local.bocas);
            
        }
        if(e.target.value === 'Francisca')
        {
            inserText.selectFranquicia(elementDocument.selectLocal, elementDocument.local.francisca);
            inserText.selectFranquicia(elementDocument.selectPlato, menuPlato.francisca);
        }
        if(e.target.value === 'Mister')
        {
            inserText.selectFranquicia(elementDocument.selectLocal, elementDocument.local.mister);
            inserText.selectFranquicia(elementDocument.selectPlato, menuPlato.mister);
        }
    }       
    if(e.target.className === 'local')
    {   
        if(e.target.value === 'Bocas Brickell')  inserText.selectFranquicia(elementDocument.selectPlato, menuPlato.brickell);
        if(e.target.value === 'Bocas House' || e.target.value === 'Bocas Weston' || e.target.value === 'Bocas Orlando' || e.target.value === 'Bocas Grill'){
            inserText.selectFranquicia(elementDocument.selectPlato, menuPlato.bocas);
        }  
    } 
}

function validationDate(e){
    e.preventDefault();
    elementDocument.btnSubmit.disabled = true;
    let time = Object.values(elementDocument.dateFood);
    const input = [elementDocument.selectFranquicia, elementDocument.selectLocal, elementDocument.selectPlato, elementDocument.numberTable];
    let key1 = true;
    let key2 = true;

    time.forEach(element => {
        if(isNaN(element.value)){ 
            element.classList.add('active');
            key1 = false;
            console.log('Pimera llave falsa');
        }
        else{
            key1 = true;
        }
    });
    input.forEach(element => {
        if(element.value === 'Seleccione una franquicia' || element.value === 'Seleccione un local' || element.value === ''){
            element.classList.add('active');
            console.log('Segunda llave falsa');
            key2 = false;
        }
        else{
            key2 = true
        }
    })

    if(elementDocument.key && key1 && key2){
        funciono()
    }
    else{
        elementDocument.text.textContent = 'Introduca los campos correctamente';
        elementDocument.btnSubmit.disabled = false;
        console.error('Los campos son incorrectos\n');
    }

}

function funciono(){
    JsonSend.Mesa = elementDocument.numberTable.value;
    JsonSend.franquicia = elementDocument.selectLocal.value;
    let i = 0;
    console.log(JsonSend);

    let jsonValue = Object.values(JsonSend);
    jsonValue.forEach(element => {
        if(element === null){
            i++;
            console.log(element);
        } 
    });
    if(i > 0){
        console.log('Algun valor null'); 
        elementDocument.btnSubmit.disabled = false;
    }
    else{
        //let mens = `https://api.whatsapp.com/send?phone">${JsonSend.img}`;
        window.open(JsonSend.img);
    }
}
