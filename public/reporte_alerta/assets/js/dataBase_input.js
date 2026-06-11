export function clearStonrage(callback){
    for(let i = 0; i <= document.querySelectorAll('.local-container').length - 1; i++){
        document.querySelectorAll('.local-container')[i].children[1].children[1].value = '0';
        document.querySelectorAll('.local-container')[i].children[2].children[1].value = '0';
    }
    localStorage.clear();
    callback()
}

