import nameUrl from '/utils/url_api.js' ;

const getLocalligth = () => {
    return new Promise((resolve, reject) => {
        axios.get(`https://${nameUrl}/localforCort`)
            .then(response => {
                const array =  response.data.sort(( x, y ) =>  {
                    return x.order - y.order;
                });
                resolve(array);
            })
            .catch((err) => {
                reject(err);
        });
    });
};


const getLocalAmanager = id => {
    return new Promise((resolve, reject) => {
        axios.get(`https://${nameUrl}/local&manager/id=${ id }`)
            .then(response => {
                resolve(response.data);
            })
            .catch(err => {
                reject(err);
            })
    })
    
}

/*
const getFranchise = async () => {
    axios.get(`https://${nameUrl}/franchise`)
    .then((result) => {
        franchise = [...result.data];
    })
    .catch((err) => console.log(err));
};
*/

export { getLocalligth, getLocalAmanager };
