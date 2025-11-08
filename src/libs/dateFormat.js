class DataFormart {
    
    
    static formatDateApp(hour){
        const date = new Date(hour);
        const day = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const month = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${day[date.getDay()]} ${date.getDate()} ${month[date.getMonth()]} ${date.getFullYear()} a las ${(0 + '' + date.getHours()).substr(-2)}:${(0 + '' + date.getMinutes()).substr(-2)}:${(0 + '' + date.getSeconds()).substr(-2)}`;
    }
}


export default DataFormart;