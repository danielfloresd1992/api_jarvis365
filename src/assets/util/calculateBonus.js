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

export default calculateBonus;