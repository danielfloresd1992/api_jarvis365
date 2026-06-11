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

export { createHtml };