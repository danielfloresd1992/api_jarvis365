import nameUrl from '/utils/url_api.js' ;



const getFranchise = () => {
    return new Promise((resolve, reject) => {
        axios.get(`https://${nameUrl}/franchise`)
        .then((result) => {
            resolve(result.data);
        })
        .catch((err) => {
            console.log(err);
            reject(err);
        });
    })
    
};


const getLocal = () => {
    return new Promise((resolve, reject) => {
        axios.get(`https://${nameUrl}/local`)
            .then((result) => {
                resolve(result.data);
            })
            .catch((err) => {
                reject(err);
            });
    });
   
};


export { getFranchise, getLocal };