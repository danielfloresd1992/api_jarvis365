/** 
*
*
* 
* 
* @param { Array.<Buffer> } buffer - Este parámetro recibe un arreglo de buffers.
* @param { string } type - Este parámetro recibe el tipo como una cadena de caracteres en el siguiente formato 'file/typefile'.
* @returns {string } - This function returns an element encoded in Base64
*
* DomManipulation CLASS FOR AMAZONAS365.C.A 2022.
* AUTOR: DANIEL FLORES     
*
*
*/



function arrayBufferToBase64( buffer , type) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    const file = window.btoa(binary);
    return `data:${type};base64,` + file;
};


function bufferToDataURL(buffer , type){
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
    const base64 = btoa(binary);
    return `data:${type};base64,${base64}`;
}


export { arrayBufferToBase64, bufferToDataURL };