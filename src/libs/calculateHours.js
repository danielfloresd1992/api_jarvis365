function calcularTotalHoras(start, end) {
    let timeTotal = 0;
    const dateStart = start.split(':')[0];
    const dateEnd = end.split(':')[0];
    for(let i = dateStart; i < dateEnd; i++){
        timeTotal++;
    }

    return timeTotal;    
}

  
export default calcularTotalHoras;
