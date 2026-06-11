async function alertText(text){
    const body = document.getElementsByTagName('body')[0];
    const fragment = document.createDocumentFragment();
    const divFather = document.createElement('div');
    divFather.setAttribute('class', 'boxFatherAlert');
    fragment.appendChild(divFather);
    const boxTextAlert = document.createElement('div');
    boxTextAlert.setAttribute('class', 'boxTextAlert');
    boxTextAlert.setAttribute('id', 'boxTextAlert');
    divFather.appendChild(boxTextAlert);
    const delet = document.createElement('div');
    delet.setAttribute('class', 'delet');
    delet.setAttribute('id', 'delet ');
    boxTextAlert.appendChild(delet);
    const buttomDelet = document.createElement('div');
    buttomDelet.setAttribute('id', 'buttomDelet');
    delet.appendChild(buttomDelet);
    const h3 = document.createElement('h3');
    h3.setAttribute('class', 'removeElement') 
    h3.appendChild(document.createTextNode('X'));
    buttomDelet.appendChild(h3);
    const divText = document.createElement('div');
    divText.setAttribute('class', 'text');
    boxTextAlert.appendChild(divText);
    const h3_1 = document.createElement('h3');
    h3_1.appendChild(document.createTextNode(text))
    divText.appendChild(h3_1);
    body.appendChild(fragment);
}
document.getElementsByTagName('body')[0].addEventListener('click', e => {
    if(e.target.className === 'removeElement'){
        const element = e.path[4];
        element.parentNode.removeChild(element);
    }
});
        