

const { useState, useEffect, useRef } = React;

//view
import AsideManager from '/profileLocal/assets/view/AsideManager.js';
import HeaderLocal from '/profileLocal/assets/view/HeaderLocal.js';
import Publisher from   '/profileLocal/assets/view/Publisher.js';
import Table from '/profileLocal/assets/view/Table.js';

// MODEL
import { getLocal, getLocalPromise } from '/profileLocal/assets/model/local.js';



function App(){

    const path = window.location.pathname;
    const match = path.match(/\/profileAndRestaunrant=([^/]+)/);
    const namelocal = match ? match[1] : null;

    const [ local, setLocals ] = useState(null);
    

    useEffect(() => {  
        getLocalPromise(namelocal)
            .then(data => {
                setLocals(data);
            })
    }, []);


    return(
        <>
            {
                Array.isArray(local) && local.length > 0 ? 
                (
                    <>
                        <HeaderLocal local={ local[0] } />
                        <main className='main-3files-25-50-25'>
                            <AsideManager arrayManager={ local[0].managers } />
                            <Publisher local={ local[0] } />
                        </main>
                        
                    </>
                )
                :
                (null)
        }
        </>
    );
}



const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
