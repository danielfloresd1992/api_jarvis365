

const getAllManager = (name, callback) => {
    axios.get(`https://${ window.location.host }/managerlocal/local=${ name }`)
        .then(response => {
            callback(null, response.data);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
};


const getManagerAndImgById = ((id, callback) =>{
    axios.get(`https://${ window.location.host }/managerLocalAndImgById/id=${ id }`)
        .then(response => {
            callback(null, response.data);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
});


export {  getAllManager, getManagerAndImgById };