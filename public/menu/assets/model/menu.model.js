const getMenuAll = (category, callback) => {
  
    axios.get(`https://${window.location.host}/menu`)
        .then(response => {
            let menuList = [];
            const categoryList = [];
        
            response.data.forEach(menu => {

                if(categoryList.indexOf(menu.category) < 0){ 
                    categoryList.push(menu.category);
                }

                if(category === 'all'){
                    menuList.push(menu);
                }
                else if(menu.category === category){
                    menuList.push(menu);
                }
            });
            
            callback( null, { menuList, categoryList } );
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        })
};


const getMenuById = (id, callback) => {
    axios.get(`https://${window.location.host}/menu/id=${id}`)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
};


const sendMenu = (body, callback) => {
    axios.post(`https://${window.location.host}/menu`, body)
        .then(response => {
            console.log()
            callback(null, response);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
};


const putMenu = (body, callback) => {
    axios.post(`https://${window.location.host}/menu/put`, body)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        });
};


const deleteMenu = (id, callback) => {
    axios.delete(`https://${window.location.host}/menu/id=${id}`)
        .then(response => {
            callback(null, response);
        })
        .catch(err => {
            console.log(err);
            callback(err, null);
        })
};



const getLocalLigth = async callback => {
    try {
        const listLocal = await axios.get(`https://${window.location.host}/localLigth`);
        callback(null, listLocal.data);
    } 
    catch(err){
        callback(err);
    }
}


export { getMenuAll, getMenuById, sendMenu, putMenu, deleteMenu, getLocalLigth };