(function(){
    const user = {
        userName: document.getElementById('nameUser'),
        password: document.getElementById('password'),
        confirPassword: document.getElementById('confir'),
        name: document.getElementById('name'),
        surName: document.getElementById('surName'),
        telCel: document.getElementById('cel'),
    }
    
    const btn = document.querySelector('.btn');
    const form = document.getElementsByTagName('form')[0];
    
    user.confirPassword.addEventListener('change', e => {
        const btn = document.querySelector('.btn');
        if(e.target.value !== user.password.value){
            e.target.classList.add('active');
            user.password.classList.add('active');
            btn.disabled = true;
            alertText('La contraseña no coinciden');
        }
        else{
            e.target.classList.remove('active');
            user.password.classList.remove('active');
            btn.disabled = false;
        }
    });
    user.password.addEventListener('keypress', e => {
        const btn = document.querySelector('.btn');
        if(e.target.value !== user.confirPassword.value){
            e.target.classList.add('active');
            user.password.classList.add('active');
            btn.disabled = true;
        }
        else{
            e.target.classList.remove('active');
            user.password.classList.remove('active');
            btn.disabled = false;
        }
    });
    
    user.telCel.addEventListener('keypress', e => {
        if(isNaN(e.target.value)){
            e.target.classList.add('active');
            btn.disabled = true;
        }
        else{
            e.target.classList.remove('active');
            btn.disabled = false;
        }
    })
    
    form.addEventListener('submit', e => {
        e.preventDefault();
        validate(user);
    });
    
    
    function validate(user){
        let count = 0;
        for (const iterator in user) {
            if(user[iterator].value === ''){
                user[iterator].classList.add('active');
                count++;
            }
        }
        if(count  > 0){
            alertText('Debe llenar todos los campos');
        }
        else{
            sendJson();
        }
    }
    function sendJson(){
        const userJson = {
            user: user.userName.value.trim(),
            password: user.password.value.trim(),
            name: user.name.value.trim(),
            surName: user.surName.value.trim(),
            telCel: user.telCel.value.trim(),
            admin: document.getElementById('admin').checked,
            super: document.getElementById('super').checked,
        }
        postDate(userJson, `https://${window.location.hostname}/user/signup`);
    }
    
    
    
    async function postDate(data, url){
        const headers = {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json'
              },
            body: JSON.stringify(data)
        }
        await fetch(url, headers)
        .then(result => {
            console.log(result.status)
            if(result.ok){ 
                alertText('Usuario registrado con exito');
                resetInput(user);
                //alert('Usuario creado');
            };
            if(result.status === 400){
                alertText('El nombre de la cuenta ya existe')
                user.userName.classList.add('active')
            };
        })
        .catch(err => {
            console.log(err.status)
            console.log(err);
            alertText('Intente mas tarde');
        })
    }
    function resetInput(key){
        for(i in key){
            key[i].value = '';
            key[i].classList.remove('active');
        }
        document.getElementById('admin').checked = false;
        document.getElementById('super').checked = false;
    }
    
})();
