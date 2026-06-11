import nameUrl from '/utils/url_api.js' ;

(function(){
    const btnExit = document.getElementById('e-u');
    const nav = document.getElementById('navigator');
    let k = true;
    function exit(){
        if(k){
            btnExit.removeEventListener('click', exit);
            k = false;
            const url = `https://${nameUrl}/logout`;
            const headers= {
                headers: {
                    'Content-type': 'application/json;charset=UTF-8',
                    'mode': 'cors'
                },
                method: 'GET',
            }
            fetch(url, headers)
            .then(result => {
                if(result.ok){
                    k = true;
                    location.assign('/');
                    console.error(result)
                }
            })
            .catch(err => {
                k = true;
            })
        }
    }
    btnExit.addEventListener('click', exit);
})();