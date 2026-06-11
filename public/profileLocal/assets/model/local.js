


const getLocal = (name, callback) => {
    axios.get(`https://${ window.location.host }/local/findByName/name=${ name }`)
        .then(response => {
            callback(null, response.data);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
};


function getLocalPromise(name){
    return new Promise(async (resolve, reject) => {
        const response = await axios.get(`https://${ window.location.host }/local/findByName/name=${ name }`)
        resolve(response.data);
    
    })
}


export { getLocal, getLocalPromise }