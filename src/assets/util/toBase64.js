const arrayBufferToBase64 = ( buffer , contentType) => {
    let binary = '';
    let bytes = new Uint8Array( buffer );
    let len = bytes.byteLength;
    for(let i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    const file = window.btoa(binary);
    return `data:${contentType};base64,` + file;
};


export { arrayBufferToBase64 };