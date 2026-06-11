import nameUrl from '/utils/url_api.js' ;
(function(){

    const path = window.location.pathname;
    const btnOption = document.getElementById('btn-option-admin');
    const btnHome = document.getElementById('home');
    const listAncord = document.getElementById('btn-option-listContain');
    const btnExit = document.getElementById('e-u');
    let key = true;

    
    if(path !== '/lobby') document.querySelector('.searchContain').style.display = 'none';

    if(document.getElementById('btn-option-admin').tagName !== 'UNDEFINED'){
        document.getElementById('btn-option-admin').addEventListener('click', () => {
            listAncord.classList.toggle('visible');
        });
    }
    
    document.addEventListener('click', e => {
        if (!e.target.closest('#btn-option-listContain') && !e.target.matches('#btn-option-admin')) {
            listAncord.classList.remove('visible');
        }
    });
    
    
    btnExit.addEventListener('click', closeSession);
    btnHome.addEventListener('click', redirectHome);
    hiddenBtn();



    function closeSession(){
        if(key){
            key = false;
            const url = `https://${nameUrl}/user/logout`;
            const headers = {
                headers: {
                    'Content-type': 'application/json;charset=UTF-8',
                    'mode': 'cors'
                },
                method: 'GET',
            }
            fetch(url, headers)
            .then(response => {
                if(response.ok){
                    localStorage.removeItem('appManagerUser');
                    key = true;
                    location.assign('/');
                }
            })
            .catch(err => {
                key = true;
                console.log(err);
            });
        }
    }


    function redirectHome(){
        location.assign('/lobby');
    }


    function hiddenBtn(){
        Array.from(document.querySelector('.header-buttonContain').children).forEach(item => {
            if(item.tagName === 'UNDEFINED') item.style.display = 'none';
        });
    }


})();

