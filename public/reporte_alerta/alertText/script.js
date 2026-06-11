'use stric';
class AlerteBox{
    constructor(){
        this.create = ({bottom, right}) => {
            const fragment = document.createDocumentFragment();
            this.divFather = document.createElement('div');
            this.divFather.setAttribute('class', 'boxFatherAlert');
            fragment.appendChild(this.divFather);
            document.getElementsByTagName('body')[0].appendChild(fragment);
            this.divFather.style.bottom = bottom;
            this.divFather.style.right = right;
        }
    }
    createModal(text){
        const boxTextAlert = document.createElement('div');
        boxTextAlert.setAttribute('class', 'boxTextAlert');
        boxTextAlert.setAttribute('id', 'boxTextAlert');
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
        document.querySelector('.boxFatherAlert').appendChild(boxTextAlert);
    }
    deletModal(){
        document.querySelector('.boxFatherAlert').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if(e.target.className === 'removeElement'){
               e.path[3].parentNode.removeChild(e.path[3])
            }
        });   
    }
    createStyle(){
        let tagStyle = document.createElement('style');
        tagStyle.setAttribute('nonce', '2726c7f26c');
        tagStyle.appendChild(document.createTextNode(
    ` 
    .boxFatherAlert{
        position: fixed;
        height: 200px;
        display: flex;
        flex-direction; row;
        transition: all 1s ease;
        z-index: 500;
    }
    .boxTextAlert{
        position: relative;
        width: 290px;
        height: 130px; 
        right: 10px;
        margin: 50px 5px 0px 5px;
        box-shadow: 5px 5px 20px rgba(0, 0, 0, 0.973);
        background-color: rgb(255, 255, 255);
        display:flex; 
        justify-content: flex-start;
        align-content: flex-start;
        flex-direction:3;
        flex-wrap: wrap;
        overflow: hidden;
        animation: 1s cubic-bezier(0.16, 1, 0.3, 1) target;
        flex-wrap: wrap
    }
    @keyframes target{
        0%{
            right: -30px
        }
    
        100%{
            right: 10px
        }
    }
    .delet{
        width: 100%;
        height: 40px;
        background-color: rgb(6, 43, 85);
        display: flex;
        justify-content: flex-end;
        align-items: center
    }
    .delet div{
        margin: 0px 25px 0px 0px;
        color: #ffff;
    }
    .delet div:hover{
        cursor: pointer;
        color:rgb(44, 44, 44)
    }
    .text{
        width: 100%;
        height: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        text-align: center;
    }`));
    document.getElementsByTagName('body')[0].appendChild(tagStyle);
    }
}


export { AlerteBox };