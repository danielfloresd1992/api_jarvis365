/** 
*
*
* @param { srray.<HTMLElement> } htmlCollection -This parameter must be an array of HTML elements created in memory.
* @param { object } attributes - object, This parameter receives an object with the attributes that you wish to add to the HTML tag
* @param { string } elementHtml - This parameter must be the name of an HTML tag.
* @param { string } text - This parameter receives the text that an HTML element should have.
* @param {function} callback - Translate this into perfect English, please.
*
* DomManipulation CLASS FOR AMAZONAS365.C.A 2022.
* AUTOR: DANIEL FLORES     
*
*

*/




class DomManipulation {

    static createHtml(elementHtml, attributes = {}, text, arrayHtml){
        let element = document.createElement(elementHtml);

        let keys = Object.keys(attributes);
        if(text) element.textContent = text;
        keys.forEach(key => {
            if(attributes[key] !== null){ 
                element.setAttribute(key, attributes[key]);
            }
            else{
                element.setAttribute(key, '');
            }
        });
        
        if(typeof arrayHtml === 'object' && arrayHtml.length > 0){
            for(let i = 0; i < arrayHtml.length; i++){
                element.appendChild(arrayHtml[i]); 
            }
        }
        return element;
    }


    static appendArray(elementHtml, arrayHtml, callback){
        if(elementHtml === undefined || elementHtml === null) throw 'Firt argument is undefined';


        Array.from(arrayHtml.children).forEach(element => {
            elementHtml.appendChild(element)
        });

        if(typeof callback === 'function') callback();
    }


    static removeAll(elementHtml, callback){
        if(elementHtml === undefined || elementHtml === null) throw 'Firt argument is undefined';

        Array.from(elementHtml.children).forEach(element => {
            element.remove();
        });
        if(typeof callback === 'function') callback();
    }


} 



function createHtml(elementHtml, attributes = {}, text){
    let element = document.createElement(elementHtml);
    let keys = Object.keys(attributes);

    if(text) element.textContent = text;

    keys.forEach(key => {
        if(attributes[key] !== null){ 
            element.setAttribute(key, attributes[key]);
        }
        else{
            element.setAttribute(key, '');
        }
        
    });
    return element;
}

export { createHtml, DomManipulation };