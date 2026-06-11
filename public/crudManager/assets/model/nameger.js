import nameUrl from '/utils/url_api.js';


const getManager = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const result = await axios.get(`https://${nameUrl}/managerlocal`);
            resolve(result.data);
        }
        catch (err) {
            reject(err);
        }
    });
};
//delte alllnovelties nweeww dasjrhguhahsudg const{sessehhsnd }

const getManagerAndImgById = (id, callback) => {
    axios.get(`https://${nameUrl}/managerLocalAndImgById/id=${id}`)
        .then(response => {
            callback(null, response.data);
        })
        .catch(err => {
            console.log(err)
            callback(err, null);
        });
};


const getManagerByLocalName = async (name, callback) => {
    try {
        const managers = await axios.get(`https://${nameUrl}/managerlocal/local=${name}`);
        callback(null, managers.data);
    }
    catch (err) {
        console.log(err);
        callback(err, null);
    }
}


const getFillManamger = (param, callback) => {
    axios.get(`https://${nameUrl}/managerlocal/alldataFill=${param}`)
        .then((response) => {
            callback(response.data);
        })
        .catch((err) => console.log(err));
};


const setManager = (form, callback) => {
    axios.post(`https://${nameUrl}/managerlocal?resource=manager`, form)
        .then(response => {
            if (response.status === 200) {
                callback(null, response);
            }
        })
        .catch(err => {
            console.log(err);
            callback(err);
        });
};


const deleteManager = (id, callback) => {
    axios.delete(`https://${nameUrl}/managerlocal/${id}`)
        .then((response) => {
            console.log(response);
            callback(null, response);

        })
        .catch((err) => {
            console.log(err);
            callback(err, null);
        });
};


export { getManager, setManager, getManagerByLocalName, getManagerAndImgById, getFillManamger, deleteManager };

