import URL from '/utils/url_api.js' ;

const getPublicationesAll = callback => {
    let paginate = 0;
    async function nextPaginate(callback){
        const response = await axios.get(`https://${URL}/user/publisher/paginate=${paginate}/items=${10}`)
        if(response.status === 200){
            callback(response.data);
            return ++paginate;
        }
        else{
            
            callback(null, response);
        }
    }
    const reset = () => {
        paginate = 0;
    }
    return{
        nextPaginate,
        paginate,
        reset
    };
};


const getPublicationsSearch = () => {

    let paginate = 0;

    const nextPaginate = async (inputHtml, callback) => {
        try {
            const text = inputHtml.value.trim()
            const response = await axios.get(`https://${URL}/user/publisher/search=${text}/page=${paginate}/numberItems=10`)
            if(response.status === 200){
                if(response.data.length < 1) paginate = 0;
                callback(response.data);
                return ++paginate;
            }
        } 
        catch(err) {
            callback(err, null);
        }
    }

    const reset = () => {
        paginate = 0;
    };

    return{
        nextPaginate,
        paginate,
        reset
    };
};


const getNoveltiesById = (elementHtml, callback) => {

    const parent = elementHtml.parentNode.parentNode.parentNode;
    const id = parent.getAttribute('idNovelties');

    axios.get(`https://${URL}/user/novelties/id=${id}`)
    .then(response => {
        if(response.status === 200){
            callback(response.data, null);
        }
    })
    .catch(err =>  {
        callback(null , err);
    });
};


const getDataLocal = async callback => {
    try{
        const local = await axios.get(`https://${URL}/local`);
        if(local.status === 200) callback(local.data);
    }
    catch(err){
        callback(null, err);
        console.log(err);
    }
};


const putNovelties = ( data, callback ) => {

    axios.put(`https://${URL}/novelties/id=${data._id}`, data)
        .then(response => {
            callback(response.data, null);
        })
        .catch(err => {
            callback(null, err)
        });
};


const deletePublisherAndNoveltie = async (id, callback) => {
    try{
        const response = await axios.get(`https://${window.location.host}/user/publisher/delete=${id}`);
        callback(null, response);
    }
    catch(err){
        callback(err, null);
    } 
}


export { getPublicationesAll, getPublicationsSearch, getNoveltiesById, getDataLocal, putNovelties, deletePublisherAndNoveltie };