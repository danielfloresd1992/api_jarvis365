
function returnTimeExceding(time, timelimit) {
    let hour = time.split(':')[0] - timelimit.split(':')[0];
    let minute = time.split(':')[1] - timelimit.split(':')[1];
    let second = time.split(':')[2] - timelimit.split(':')[2];

    if(second < 0) {
        second = 60 - Math.abs(second);
        --minute;
    }
    if(minute < 0) {
        minute = 60 - Math.abs(minute);
        --hour;
    }
    if(hour < 0) {
        hour = 60 - Math.abs(hour);
        --hour;
    }

    if(minute < 10) minute = `0${minute}`;
    if(second < 10) second = `0${second}`;
    if(hour < 10) hour = `0${hour}`;
    
    return `${isNaN(hour) ? '❌' : hour}:${isNaN(minute) ? '❌' : minute}:${isNaN(second) ? '❌' : second}`;
}


export { returnTimeExceding };