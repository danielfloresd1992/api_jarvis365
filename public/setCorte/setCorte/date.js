(function () {
    function date() {
        const textDate = document.getElementById("date1");
        const textDate2 = document.getElementById("date2");
        const m = [
            "Enero",
            "Febrero",
            "Marzo",
            "Abril",
            "Mayo",
            "Junio",
            "Julio",
            "Agosto",
            "Septiembre",
            "Octubre",
            "Noviembre",
            "Diciembre",
        ];
        let date = new Date();
        let second = date.getSeconds();
        let minute = date.getMinutes();
        let hour = date.getHours();
        let day = date.getDate();
        let month = date.getMonth();
        let year = date.getFullYear();
        let amPm;
        if (hour >= 12) {
            amPm = "PM";
        } else {
            amPm = "AM";
        }
        if (second < 10) second = `0${second}`;
        if (minute < 10) minute = `0${minute}`;
        if (hour > 12) hour = hour - 12;
        if (hour < 10) hour = `0${hour}`;
        textDate.textContent = `${day} de ${m[month]} del ${year}`;
        textDate2.textContent = `hora: ${hour}:${minute}:${second} ${amPm}`;
    }
    setInterval(() => date(), 1000);
})();
