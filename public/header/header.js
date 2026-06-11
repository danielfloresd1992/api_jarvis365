(function(){
    const nav = document.getElementById('navigator');
    console.log(document);
    document.addEventListener('scroll', e =>{
        if(window.scrollY > 76){
            nav.classList.add('active');
        }
        else{
            nav.classList.remove('active');
        }
    });
})();

