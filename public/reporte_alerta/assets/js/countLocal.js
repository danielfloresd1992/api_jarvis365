function localDesert(){
    let ul = document.getElementById('countAlert--LocalList');
    let count = 0;
    let frangment = document.createDocumentFragment();
    if(ul.children.length === 0){
        let li = document.createElement('li');
        li.appendChild(document.createTextNode('ninguno'));
        frangment.appendChild(li);
        ul.appendChild(frangment);
    }
    for(let i = ul.children.length -1; i < ul.children.length; i--){
        if(ul.children.length === 0) break;
        ul.children[i].remove();
    }
    for(let i = 0; i <= document.querySelectorAll('.local-container').length - 1 ; i++){
        let continer = document.querySelectorAll('.local-container')[i];
        let checkBox = document.querySelectorAll('.local-container')[i].children[3].children[0];
        let name = document.querySelectorAll('.local-container')[i].children[0].children[0].textContent;
        if(checkBox.checked){
            continer.classList.add('inactive');
            let li = document.createElement('li');
            li.appendChild(document.createTextNode(name));
            frangment.appendChild(li);
            count++;
        }
        else{
            continer.classList.remove('inactive');
        }
    }
    ul.appendChild(frangment);
    return count;
}

function localActivityTotal(){
    let countActive = 0;
    let countInactive = 0;
    for(let i = 0; i <= document.querySelectorAll('.local-container').length - 1 ; i++){
        let continer = document.querySelectorAll('.local-container')[i];
        if(continer.classList.length === 1) countActive++; 
        if(continer.classList.length > 1) countInactive++; 
    }
    document.getElementById('countTextActivity').textContent = countActive;
    document.getElementById('countTextInactivity').textContent = countInactive;
}
export {
    localDesert,
    localActivityTotal
}