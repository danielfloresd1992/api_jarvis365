const { useState, useEffect, useCallback, memo, useRef } = React;
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';


function AsideManager({ arrayManager }){

    const [ managers, setManagers ] = useState([]);
    const managerRef = useRef([]);
    

    useEffect(() => {
            arrayManager.forEach(id => {
                axios.get(`https://${ window.location.host }/managerLocalAndImgById/id=${ id }`)
                .then(manager => {
                    managerRef.current = [ ...managerRef.current, manager.data[0] ]
                    if(manager.data[0]) setManagers(managerRef.current);
                });
            });
        
    }, [ ]);

    
    return(
        <>
            <section className='listRoute border10' style={{ width: 'unset' }}>
                <article className='aside-contents'>
                    <div className='listRoute-a-menuTitle'>
                        <p className='usersContain-title'>Lista de gerentes</p>
                        <hr />
                        <article className='managetBoxContent scrolltheme1' id='box-manager'>
                            { 
                                Array.isArray( managers ) && managers.length > 0 ?
                                (
                                    managers.map(manager => (
                                        Boolean(manager) ?
                                        (
                                            <>
                                                <div className='managerBox' style={{ order: manager.numberManager }} key={ manager._id }>
                                                    <div className='managerBox-imgContent'>
                                                        <img className='managerBox-img' src={ arrayBufferToBase64( manager.managerimg?.img[0].data?.data, manager.managerimg?.img[0].contentType ) } alt={manager.name}/>
                                                    </div>
                                                    <div className='managerBox-dataContent'>
                                                        <p className='nameManager'>{`${manager.burden} ${manager.name}`}</p>
                                                        <p className='text-gray'>{`${manager.burden} ${manager.numberManager}`}</p>
                                                    </div>
                                                    
                                                </div>
                                            </>
                                        )
                                        :
                                        (
                                            null
                                        )
                                        
                                    ))

                                )
                                :
                                (null) 
                            }
                        </article>
                    </div>
                </article>
            </section>
        </>
    );
}


export default memo(AsideManager);