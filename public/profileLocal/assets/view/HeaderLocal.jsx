import { arrayBufferToBase64 } from '/utils/arrayTo64.js';


function HeaderLocal({ local }){

    console.log(local)

    return(
        <>
            <nav className='profile'>
                <img class='img profile-frontImg' src='img/analitic.png' />
                <div className='profile-nameiMG'>
                    <img className='profile-img' id='img-profile' src={ arrayBufferToBase64( local.img.data.data, 'image/png') } />
                    <h1 className='profile-name' id='nameLocalTitle'>{ local.name }</h1>
                </div>
            </nav>
        </>
    )
}


export default HeaderLocal;