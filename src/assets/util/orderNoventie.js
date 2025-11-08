import formatDate from './formatTime.js';

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



export default orderNovelties;