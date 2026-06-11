import nameUrl from '/utils/url_api.js' ;
(function(){
    window.addEventListener('DOMContentLoaded', () => {
        if(JSON.parse(localStorage.getItem('appManagerUser'))){
            localStorage.removeItem('appManagerUser');
        }
        document.getElementById('btn-input').addEventListener('click', e => {
            if(e.target.parentNode.parentNode.children[0].type === 'password'){
                e.target.parentNode.parentNode.children[0].type = 'text';
                e.target.src = '/ico/visibility/visibility.svg';
                return;
            }
            e.target.parentNode.parentNode.children[0].type = 'password';
            e.target.src = '/ico/visibility/visibility_off.svg';
        },false);


        document.getElementById('user').addEventListener('focus', e => {
            e.target.parentNode.children[0].classList.remove('intro');
        });

        document.getElementById('user').addEventListener('blur', e => {
            if(e.target.value === '') e.target.parentNode.children[0].classList.add('intro');
        });

        document.getElementById('password').addEventListener('focus', e => {
            e.target.parentNode.parentNode.children[0].classList.remove('intro');
        });
        document.getElementById('password').addEventListener('blur', e => {
            if(e.target.value === '') e.target.parentNode.parentNode.children[0].classList.add('intro');
        });
        
    });


    document.getElementById('form-session').addEventListener('submit', e => {
        e.preventDefault();
        axios.post(`https://${nameUrl}/user/login`, {
            user: document.getElementById('user').value.trim(),
            password: document.getElementById('password').value.trim()
        })
            .then(response => {
                console.log(response);
                if(response.status === 200){
                    console.log(response.status);
                    localStorage.setItem('appManagerUser', JSON.stringify({
                        username: `${response.data.name} ${response.data.surName}`,
                        super: response.data.super,
                        admins: response.data.admin,
                        userId: response.data._id
                    }));
                    return location.assign('/lobby');
                }
            })
            .catch(response => {
                console.log(response);
                if(response.response.status === 400) document.getElementById('text-mens').textContent = response.response.data;
                
            });
    });

})();