const { useState, useEffect, useRef } = React;
import { createHtml } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
import DataFormart from '/Lobby/assets/utils/dateFormat.js';


function RenderBtnPaginate({ selectPage, numberPage }){

    
    const addValueBtn = useRef(0);
    const subtractValueBtn = useRef(0);
    const buttons = [];
        
    let limit = 4;


    


    const paginate = target => {

        const id = target.getAttribute('id');
        if(id === 'prev-paginate'){
            if(numberPage >= 0){
                selectPage(numberPage - 1);
            }
        }
        else if(id === 'next-paginate'){
            selectPage(numberPage + 1);
        }
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    const paginateAndCalculateBtn = (target, number) => {

        

        const btnValue = Number(target.textContent);
        console.log(btnValue)       
        console.log(numberPage);
        console.log(btnValue < numberPage);

        if( btnValue > numberPage && btnValue > 3 ){ ;
            if( btnValue - 1 ===  number ){
                addValueBtn.current = addValueBtn.current + 1;
                subtractValueBtn.current = subtractValueBtn.current + 1;
            }
            
        }
        else if( btnValue < numberPage ){
            if( numberPage - 2 ===  btnValue ){;
                addValueBtn.current = addValueBtn.current - 1;
                subtractValueBtn.current = subtractValueBtn.current - 1;

                console.log(`numero del boton ${ btnValue }`)
                console.log( numberPage + ' ' + btnValue );;
            }
        }

        
        window.scrollTo({
            //top: 0,
            behavior: 'smooth'
        });
        selectPage(number);
        
    }

   
   const printBtn = () => {
       
       for(let i = subtractValueBtn.current; i <=  limit + addValueBtn.current; i++) {

           buttons.push(
               <button
                   key={ i }
                   onClick={ e => { paginateAndCalculateBtn(e.target , i) }}
                   className={ numberPage === i ? 'contentButton-btn btn_ispage' : 'contentButton-btn' }
               >
                   { i + 1 }

               </button>
           )
       
       }
        return buttons;
    }


    return(
        <>
            <div className='componentPaginate'>
                    <div className="contentButton">
                        <button className='contentButton-btn' id='prev-paginate' onClick={ e => paginate(e.target) }>{'<'}</button>
                            
                            {
                                printBtn()
                            }
                        
                        <button className='contentButton-btn' id='next-paginate' onClick={ e => paginate(e.target) }>{'>'}</button>
                    </div>
            </div>
        </>
    )
};


function Noveltie ({ dataNoveltie, localData }){

    const [ noveltieFull, setNoveltieFull ] = useState(null);
    const menuRef = useRef(null);

    useEffect(() => {
        axios.get(`https://${window.location.host}/novelties/img/id=${ dataNoveltie._id }`)
            .then(response => {
                if(response.status === 200){
                    setNoveltieFull(response.data[0]);
                }
            })
            .catch(err => {
                console.log(err);
            });
    }, [ dataNoveltie ])


    const parseMenu = menu => {
        const menuNoveltie = menu.replaceAll('*', '').replaceAll('_', '').split('\n');
        return menuNoveltie.join('\n');
    };

    return(
        <>
            <div className='divContentNovelties' idpublisher='' id='' title='' >

                <div className='divContentNovelties-divTitle'>
                    <img className='divContentNovelties-img' src={ arrayBufferToBase64(localData.img.data.data , 'image/png') } alt="" />
                    <div className='divContentNovelties-textContain'>
                        <p className='divContentNovelties-pTitle'>{ dataNoveltie.title }</p>
                        <p className='divContentNovelties-pDate'>
                            { DataFormart.formatDateApp(dataNoveltie.date) }
                            <img className='divContentNovelties-pDateImg' src='ico/clock/clock.svg' />
                        </p>
                    </div>
                </div>
                {
                        noveltieFull ? 
                        (
                            <>
                                <div className='divContentNovelties-contentText' style={{ alignItems: 'flex-start' }}>
                        
                                    <p className='divContentNovelties-text'>
                                        <p>{ noveltieFull.local.name }</p>
                                    </p>
                                    <p className='divContentNovelties-text divContentNovelties-viewMenu' onClick={ e => {
                                        if(menuRef.current.className === 'none'){
                                            menuRef.current.className = 'divContentNovelties-text divContentNovelties-menuContain'
                                            e.target.textContent = 'Ocultar menú';
                                        }
                                        else{
                                            menuRef.current.className = 'none';
                                            e.target.textContent = 'Mostrar menú'
                                        }
                                    }} >mostrar menu menú</p>
                                </div>
                                <div className='none' ref={ menuRef }>
                                    <textarea className='divContentNovelties-text textMenu scrolltheme1' disabled={ true }>{ parseMenu(noveltieFull.menu) }</textarea>
                                </div>
                                <div classNane='divContentNovelties-carouselDiv'>
                                    <div className='divContentNovelties-imgDiv center divContentNovelties-carouselDiv--bgBlack'>
                                        {
                                            noveltieFull.fileNoveltie.files[0].contentType === 'video/mp4' ?
                                            (
                                                <>
                                                    <video className='divContentNovelties-carouselImg' controls={ true }>
                                                        <source src={ arrayBufferToBase64(noveltieFull.fileNoveltie.files[0].data.data, noveltieFull.fileNoveltie.files[0].contentType) } autoplay={ true } />
                                                    </video>
                                                </>
                                            )
                                            :
                                            (
                                                <>
                                                    <img className='divContentNovelties-carouselImg divContentNovelties-carouselImg--midWid' src={ arrayBufferToBase64(noveltieFull.fileNoveltie.files[0].data.data, noveltieFull.fileNoveltie.files[0].contentType) } alt="" />
                                                </>
                                            )
                                            
                                        }
                                    </div>
                                </div>
                            </>
                        )
                        :
                        (
                            <>
                                <div className='divContentNovelties-boxAwait'>
                                    <div class='divContentNovelties-boxAwaitspinner'></div>
                                </div>
                            </>
                        )
                    }
                
            </div>
        </>
    );
};


function Publisher({ local }){

    const [ page, setPage ] = useState(0);
    const [ noveltie, setNoveltie ] = useState(null);
    

    const selectPage = numberPage => {
        setPage(numberPage);
    };

    useEffect(()=> {
        axios.get(`https://${window.location.host}/noveltie/local=${local.name}/since=${0}/until=${0}/page=${10}`)
            .then(response => {
                
                if(response.status === 200){
                    const newNoveltie = response.data.novelties.sort(( a, b )=> {
                        const dateA = new Date(a.date).getTime();
                        const dateB = new Date(b.date).getTime();
                        return  dateB - dateA;
                    });
                    
                    setNoveltie({ data: newNoveltie, count: response.data.total });
                }
                
            })
            .catch(err => {
                console.log(err);
            })
    }, [ /*// page */ ]);

    console.log(`la pagina es la siguiente: ${page}`);

   


    return(
        <>
            <section className='aside-contents forTable'>
                {
                    noveltie ?
                    (
                        <div className='main-contain' style={{ width: '100%', marginTop: 'unset', padding: '.5rem' }}>
                            {
                                noveltie.data.map(result => (
                                    <>
                                        <Noveltie dataNoveltie={ result } localData={ local } />
                                    </>
                                ))
                            }
                            <RenderBtnPaginate selectPage={ selectPage } numberPage={ page } />
                        </div>
                    )
                    :
                    (
                        <>
                            <div className='divContentNovelties-boxAwait'>
                                <div class='divContentNovelties-boxAwaitspinner'></div>
                            </div>
                        </>
                    )
                }
                
            </section>
        </>
    )
}


export default Publisher;