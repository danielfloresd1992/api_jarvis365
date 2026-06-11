function arrayBufferToBase64( buffer ,) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    const file = window.btoa(binary);
    return `data:${local.img.contentType};base64,` + file;
};

export default arrayBufferToBase64;