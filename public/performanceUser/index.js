'use strict';
const users = [];
import BoxModal from '/utils/window_boxModal/boxModal.js';
import { createHtml, DomManipulation }  from '../utils/createHtml.js';


import dateToFormat from '../utils/dateToFormat.js';


const input = document.querySelector('.aside-seachInput');
const inputDateSince = document.getElementById('dateinput-since');
const inputDateUntil = document.getElementById('dateinput-until');
const typeGraphics = document.getElementById('type-grafic');
const mainContent = document.getElementById('main-content');


const getUserServer = () => {

    axios.get(`https://72.68.60.254/user/getUser`)
        .then(response => {  
            users.push(...response.data);
        })
        .catch(err => {
            console.log(err);
        });
};


const getMenu = callback => {
    axios.get('https://72.68.60.254/menu')
        .then(response => {
            callback(null, response.data);
        })
        .catch(err => {
            console.log(err);
        })
}



window.addEventListener('DOMContentLoaded', () => {

    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
    document.querySelector('.searchContain').style.display = 'none';

    getUserServer();

    inputDateSince.value = calculateDay(toDate())[0];
    inputDateUntil.value = toDate();

   



    document.getElementById('seach-user').addEventListener('keyup', e => {
        getUser(e.target.value, results => {
            appendUser(document.getElementById('list-user-seach'), results);
        });
    });

    
  
    document.getElementById('list-user-seach').addEventListener('click', e => {
        if(e.target.textContent !== 'Usuario no encontrado'){
            document.querySelector('.aside-seachInput').value = e.target.textContent;


            
            findUser(e.target.getAttribute('name'), user => {
                closeOpenBanner();
                getMenu((err, menus) => {

                    if(err) return boxModal.show('Error', 'error al cargar los menus de las novedades');

                    axios(`https://${window.location.hostname}/noveltiesFill-user=${user._id}/&since=${new Date(`${inputDateSince.value} 00:00:00`)}/&until=${new Date(`${inputDateUntil.value} 23:59:59`)}`)

                        .then(response => {

                            const bonus = calculateBonus(response.data);
                            const bar = orderNovelties(response.data);
                            resetElementHtml(mainContent);
                          

                            document.querySelector('.sectionComponent').appendChild(printPieData({ bar, user, since: inputDateSince.value , until: inputDateUntil.value, bonus }));
                            document.querySelector('.sectionComponent').appendChild(printListForDay(fillListNovewltie(response.data)));
                            
                            printData(mainContent, user, ( canvasElement, elementHtml ) => {


                                if(bar.count.total < 1) return boxModal.show('Aviso', 'El operador no tiene registro en el tiempo establecido');
                                
                            
                                const data = {
                                    labels: bar.days,
                                    datasets: [{
                                        label: 'validadas',
                                        data: bar.validate,
                                        borderWidth: 2,
                                        backgroundColor: ['rgba(1, 86, 144 )'],
                                        borderColor: 'rgb(0, 85, 255)',
                                    },
                                    {
                                        label: 'invalidadas',
                                        data: bar.inValidate,
                                        borderWidth: 2,
                                        backgroundColor: ['rgba(181, 75, 15)'],
                                        borderColor: 'rgb(255, 0, 0)',
                                    },
                                    {
                                        label: 'Ignoradas por el coordinador',
                                        data: bar.ignore,
                                        borderWidth: 2,
                                        backgroundColor: ['rgba(133, 133, 133 )'],
                                        borderColor: 'rgb(165, 165, 165)',
                                    }]
                                }

                                const options = {
                                    plugins: {
                                        datalabels: {
                                            color: '#000',
                                            anchor: 'end',
                                            align: 'top',
                                            formatter: (value) => {
                                                return value;
                                            }
                                        }
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: true
                                        }
                                    },
                                    
                                };
                                
                                new Chart(canvasElement, {
                                    options: options,
                                    data: data,
                                    type: document.getElementById('type-grafic').value,
                                    plugins: [ChartDataLabels]
                                });

                                
                                document.querySelector('.sectionComponent').appendChild(printAverage(bar.count.average));
                                document.querySelector('.sectionComponent').appendChild(printDataBonus(bonus.bonus));
                            });
                        });
                });

            });
            document.getElementById('list-user-seach').classList.add('hidden-user');
        }
    }, false);


    input.onfocus = () => {
        document.getElementById('list-user-seach').classList.remove('hidden-user');
    }


    document.getElementsByTagName('body')[0].addEventListener('click', e => {
        if(e.target.id !== 'list-user-seach' && e.target.id !== 'seach-user'){
            document.getElementById('list-user-seach').classList.add('hidden-user');
        }

        if(e.target.id === 'close-banner01') closeOpenBanner();
    });

});


function closeOpenBanner(){
    document.querySelector('.asideComponent').classList.toggle('close-banner');
}


function getUser(name = '', callback){
    const options = {
        minMatchCharLength: 4,
        includeScore: true,
        keys: ['name', 'surName']
    };
    let fuse = new Fuse(users, options);
    const result = fuse.search(name);
    callback(result);
};


function appendUser(elementHtml, data){
   
    Array.from(elementHtml.children).forEach((element) => {
        element.remove();
    });

    if(data.length > 0){
        data.map(result => {
            result.item;
            elementHtml.appendChild(createHtml('span',{ class:'aside-userSeach-item', name: result.item._id }, `${result.item.name} ${result.item.surName}`));
        });
    }
    else{
        elementHtml.appendChild(createHtml('span',{ class:'aside-userSeach-item' }, 'Usuario no encontrado'));
    }
}


function findUser(query, callback){
    const userSelect = users.filter(user => user._id === query);
    callback(userSelect[0]);
}


function resetElementHtml( elementHtml ){
    Array.from(elementHtml.children).forEach(element => {
        element.remove();
    });
}


function printData( elementHtml, userData, callback){
    const divContent = createHtml('div', {class: 'canvas-contain'});
    const newCanvas = createHtml('canvas', { id: 'myChart', class: 'myCanvas' });

    divContent.appendChild(newCanvas);
    elementHtml.appendChild(divContent);
    callback(newCanvas, { fatherHtml: divContent });
}


function printPieData({ bar, user, since, until, bonus }){
    const h2Title = createHtml('h2', {class: 'canvas-title-h2'}, `Operador: ${user.name} ${user.surName}`);
    const h2TitleCount = createHtml('h2', {class: 'canvas-title-h2'}, `Novedades reportadas: ${bar.count.total}`);
    const h2bonus = createHtml('h2', { class: 'canvas-title-h2' }, `Bonos: ${bonus.bonusTotal}`)
    const h2Since = createHtml('h2', {class: 'canvas-title-h2'}, `Desde: ${since}`);
    const h2Until = createHtml('h2', {class: 'canvas-title-h2'}, `Hasta: ${until}`);
    const spanUntil = createHtml('span', {class: 'canvas-title-h2', id: 'until-novelties-id'}, '');
    const canvasPie = createHtml('canvas', {  }, '');

    new Chart(canvasPie, {
        type: 'pie',
        data: {
            labels: ['validadas', 'invalidadas', 'ignoradas'],
            datasets: [
                {
                    data: [bar.count.totalValidate, bar.count.totalInvalidate, bar.count.totalIgnore],
                    backgroundColor:['rgba(1, 86, 144 )', 'rgba(181, 75, 15)', 'rgba(133, 133, 133 )'],
                    hoverOffset: 4
                }
            ]
        },
        option: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Colores favoritos'
                }
            }
        }
    });

    const divCanvasPieContain = DomManipulation.createHtml('div', { class: 'canvas-one' }, '', [ canvasPie ]);
    const titleContaint = DomManipulation.createHtml('div', {class: 'canvas-titleContains'}, null, [ h2Title, h2TitleCount, h2bonus,h2Since, h2Until, spanUntil, divCanvasPieContain ]);
    return titleContaint;
}


function printAverage(average){
    const divAverageContain = createHtml('div', { class: 'canvas-titleContains hidden' });
    const divAverage = createHtml('div', { class: 'canvas-titleContains hald' });
    const averageTitle = createHtml('p', {class: 'canvas-title-h2 averageTitle'}, 'Promedio');
    const averageCount = createHtml('span', {class: 'canvas-title-h2 average'}, average);
    divAverage.appendChild(averageTitle);
    divAverage.appendChild(averageCount);
    divAverageContain.appendChild(divAverage);
    return divAverageContain;
}


function fillListNovewltie( dataArray ){
    let forDay = {};
    dataArray.forEach(title => {

        if(forDay[formatDate(title.date)]){
            forDay[formatDate(title.date)].push(title);
        }
        else{
            forDay[formatDate(title.date)] = [];
            forDay[formatDate(title.date)].push(title);
        }
    });
    return forDay;
}


function printListForDay(listNoveltie){
    const div = createHtml('div', { class: 'canvas-titleContains listNoveltieContain' });
  

    for (const key in listNoveltie) {
        const dayContain = createHtml('div', { class: 'ListContain' });
        const h3 = createHtml('h3', { class: 'title-day' }, `Dia: ${key}`)
        const ul = createHtml('ul', { class: 'list-ul' });
        
        listNoveltie[key].forEach(title => {
            const li = createHtml('li', { class: 'list-li', id: 'noveltie05' , name: title._id  }, title.title);
           
            // codigo de compatibilidad ⬇

            if(typeof title.isValidate === 'string'){
                if(title.isValidate === 'true'){
                    li.style.color = '#1F3AB3';
                }
                else if(title.isValidate === 'false'){
                    li.style.color = '#B31F1F';
                }
                else if(title.isValidate === 'null'){
                    li.style.color = '#6F6F6F';
                }
            }
            else if(typeof title.isValidate === 'object'){
                if(title.isValidate.validation === 'true'){
                    li.style.color = '#1F3AB3';
                }
                else if(title.isValidate.validation === 'false'){
                    li.style.color = '#B31F1F';
                }
                else if(title.isValidate.validation === 'null'){
                    li.style.color = '#6F6F6F';
                }
            }

            const br = createHtml('br', {});
            const localName = createHtml('p', { class: 'listNameLocal' }, title.local.name);
            const validatorNoveltie = createHtml('p', { class: 'listNameLocal' }, `Validado por: ${title.isValidate.for}`);
            li.appendChild(br);
            li.appendChild(localName);
            li.appendChild(validatorNoveltie);
            ul.appendChild(li);

        });
        dayContain.appendChild(h3);
        dayContain.appendChild(ul);
        div.appendChild(dayContain);
    }

    return div;
}



function toDate(){
    const date = new Date();
    const day = (`0${date.getDate()}`).slice(- 2);
    const month = (`0${date.getMonth() + 1}`).slice(- 2);
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
}


function orderNovelties(arrayNovelties){
    
    const dayArray = [];
    
    arrayNovelties.forEach(data => {
       
        dayArray.indexOf(formatDate(data.date)) > -1 ? null : dayArray.push(formatDate(data.date));
        
    });

    if(arrayNovelties.length === 0){ 
        return {
            count: {
                totalValidate: 0,
                totalInvalidate: 0,
                totalIgnore: 0,
                total: 0,
                average: 0
            },
            days: 0,
            validate: 0,
            inValidate: 0,
            ignore: 0
        };
    };

    let total = 0;
    let totalValidate = 0;
    let totalInvalidate = 0;
    let totalIgnore = 0;

    const noveltieFullDayValidate = [];
    const validate = [];
    const inValidate = [];
    const ignore = [];
    
    dayArray.forEach(date =>{
        noveltieFullDayValidate[date] = {
            count: 0,
            validate: 0,
            inValidate: 0,
            ignore: 0
        }
       
        for(let i = 0; i < arrayNovelties.length; i++){
            if(date === formatDate(arrayNovelties[i].date)){
                noveltieFullDayValidate[date].count = noveltieFullDayValidate[date].count + 1;
                if(typeof arrayNovelties[i].isValidate === 'string'){
                    if(arrayNovelties[i].isValidate === 'true'){
                        noveltieFullDayValidate[date].validate++;
                        totalValidate++;
                    }
                    else if(arrayNovelties[i].isValidate === 'false'){ 
                        noveltieFullDayValidate[date].inValidate++;
                        totalInvalidate++;
                    }
                    else if(arrayNovelties[i].isValidate === 'null'){ 
                        noveltieFullDayValidate[date].ignore++;
                        totalIgnore++;
                    }
                }
                else if(typeof arrayNovelties[i].isValidate === 'object'){
                    if(arrayNovelties[i].isValidate.validation === 'true'){
                        noveltieFullDayValidate[date].validate++;
                        totalValidate++;
                    }
                    else if(arrayNovelties[i].isValidate.validation === 'false'){ 
                        noveltieFullDayValidate[date].inValidate++;
                        totalInvalidate++;
                    }
                    else if(arrayNovelties[i].isValidate.validation === 'null'){ 
                        noveltieFullDayValidate[date].ignore++;
                        totalIgnore++;
                    }
                    total++;
                }
            }
        }
    });
   
    for(const prop in noveltieFullDayValidate){
        validate.push(noveltieFullDayValidate[prop].validate);
        inValidate.push(noveltieFullDayValidate[prop].inValidate);
        ignore.push(noveltieFullDayValidate[prop].ignore);

       noveltieFullDayValidate[prop].count;
    }

    return {
        count: {
            totalValidate,
            totalInvalidate,
            totalIgnore,
            total,
            average: total / dayArray.length
        },
        days: dayArray,
        validate,
        inValidate,
        ignore
    };
}


function calculateDay(dateString){

    let today = new Date(dateString);
    let result = [];
    for (let i = 6; i >= 0; i--) {
      let prevDate = new Date(today);
      prevDate.setUTCDate(today.getUTCDate() - i);
      let year = prevDate.getUTCFullYear();
      let month = (prevDate.getUTCMonth() + 1).toString().padStart(2, '0');
      let day = prevDate.getUTCDate().toString().padStart(2, '0');
      result.push([year, month, day].join('-'));
    }
    return result;
}


function formatDate(date){
    const newDate = new Date(date);
    const year = newDate.getFullYear();
    const month = newDate.getMonth() + 1;
    const day = newDate.getDate();
    return `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}


function printDataBonus(array){
    const fragmant = document.createDocumentFragment();
    let thTitle = createHtml('th', { class: 'td th' }, 'Novedad');
    let thCount = createHtml('th', { class: 'td th' }, 'cantidad total');
    let thBonus = createHtml('th', { class: 'td th' }, 'Bonos');
    let trHead = DomManipulation.createHtml('tr', { class: 'tr' }, null , [ thTitle, thCount, thBonus ]);
    let table = DomManipulation.createHtml('table', { class: 'table' }, null, [ trHead ]);

    let bonusTota = 0;
    let totalAlert = 0;

    array.forEach( element => {
        const tdTitle = createHtml('td', { class: 'td' }, element.title);
        const tdCount = createHtml('td', { class: 'td' }, element.count);
        const tdBonus = createHtml('td', { class: 'td' }, String(element.bonusTotal));
        const tr = DomManipulation.createHtml('tr', { class: 'tr' }, null, [ tdTitle, tdCount, tdBonus]);
        table.appendChild(tr);
        totalAlert += element.count;
        bonusTota += element.bonusTotal;
    });

    const tdTotal =  createHtml('td', { class: 'td th' },'total');
    const tdTotalAlerts = createHtml('td', { class: 'td' }, totalAlert);
    const tdTotalBonus = createHtml('td', { class: 'td' }, bonusTota);
    const trTotal = DomManipulation.createHtml('tr', { class: 'tr' }, null, [ tdTotal, tdTotalAlerts, tdTotalBonus]);
    table.appendChild(trTotal);
    fragmant.appendChild(table);
    return fragmant;
}   


function calculateBonus(array){
    let newArray = [];
    let totalAlert = 0;
    let bonusTotal = 0;
    for(let i = 0; i < array.length; i++ ){
        if(array[i].isValidate.validation === 'true') newArray.push(array[i]);
    }

    const groupedByTitle = newArray.reduce((acc, curr) => {
      
        if (!acc[curr.title]) {
          acc[curr.title] = [];
        }
        acc[curr.title].push(curr);
            return acc;
        
    }, {});

    const bonus = [];
 
    for (let [key, value] of Object.entries(groupedByTitle)) {
        const object = {};
        
        const bonusTotal = (( groupedByTitle[key].length * groupedByTitle[key][0].rulesForBonus.worth ) / groupedByTitle[key][0].rulesForBonus.amulative);
        object.title = key;
        object.count = groupedByTitle[key].length;
        object.bonusTotal = isNaN(bonusTotal) ? 0 : Math.floor(bonusTotal);
        object.rules = groupedByTitle[key][0].rulesForBonus;
        bonus.push(object);
    }

    bonus.forEach( element => {
        totalAlert += element.count;
        bonusTotal += element.bonusTotal;
    });

    return { bonus, totalAlert, bonusTotal };
}