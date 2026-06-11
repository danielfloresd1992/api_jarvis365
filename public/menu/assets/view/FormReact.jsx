/**
    * cd E:\App_Manager\src\public\menu\assets\view\
    * npx babel FormReact.jsx --out-file FormReact.js --compact true
    * npx babel FormReact.jsx --out-file FormReact.js --presets @babel/preset-react,@babel/preset-env
*/



const { useState, useEffect } = React;
//import btnDelete from 'ico/delete/delete.svg';

function Form ({ 
        menuIndividual, 
        arrayCategory, 
        local, 
        resetNoveltie, 
        putMenuProps, 
        createMenu, 
        modal, 
        addMenu
    }){
    

    const factorReset = {
            es: '',
            en: '',
            textHeader: null,
            especial: null,
            table: false,
            time: false,
            timeUnique: false,
            category: '- Selecione una categoria -',
            isArea: false,
            isDescriptionPerson: false,
            photos: {
                length: '',
                caption: []
            },
            _id: null,
            car: false,
            rulesForBonus: { 
                forLocal :'Todos',
                worth: '', 
                amulative: '' }
    };


    const [ menu, setMenu ] = useState(factorReset);
    const [ titleHeader, setTitleHeader ] = useState(null);

    useEffect(() => {
        axios.get(`https://${window.location.host}/menu/assets/model/optionsHeader.json`)
            .then(response => {
                setTitleHeader(response.data);
            })
            .catch(err => {
                console.log(err);
            }) 
    }, []);


    useEffect(() => {
        if(menuIndividual){
            setMenu({ ...menuIndividual });
        }
        else{
            setMenu({ ...factorReset });
        }
    }, [ menuIndividual ]);

    

    
    function boxRender(){
        if(menu?.photos?.length > 0) {
            return(
                menu?.photos?.caption?.map(item => (
                    <div className='count-img-form-child' key={item.index} >
                        <span className='titleDiv'>caption de la imagen: {item.index}</span>
                        <label className='count-img-form-child-label'>
                            'Títutlo en español'
                            <input 
                                className='configurationMenu-input count-img-form-child-input' 
                                type='text' 
                                required 
                                value={ item.es || null } 
                                onChange={
                                    e => {
                                        let newArray = [...menu.photos.caption];
                                        newArray[item.index - 1].es = e.target.value;
                                        setMenu({...menu, photos: {...menu.photos, caption: newArray }});
                                    }
                                }
                            />
                        </label>
                        <label className='count-img-form-child-label'>
                            'Títutlo en ingles'
                            <input 
                                className='configurationMenu-input count-img-form-child-input' 
                                type='text' 
                                required 
                                value={ item.en || null } 
                                onChange={
                                    e => {
                                        let newArray = [...menu.photos.caption];
                                        newArray[item.index - 1].en = e.target.value;
                                        setMenu({...menu, photos: {...menu.photos, caption: newArray }});
                                    }
                                }
                            />
                        </label>
                    </div>
                ))
            )
        }
    };


    const setCaptionArrays = length => {
        const arrayCapcion = [];
        for (let index = 0; index < length; index++) {
            arrayCapcion.push({
                index: index + 1,
                es: 'null',
                en: 'null'
            });
        }
        return(arrayCapcion);
    };


    const putMenu = e =>{
        e.preventDefault();
        if(menu.category === '- Selecione una categoria -') return  console.error('Selecione una categoria');
        if(menu.photos.length === 0) return console.error('debería haber algun valor en cantidad de fotos');
        if(menu.rulesForBonus.amulative === '' || menu.rulesForBonus.worth === '') return console.error('valores nulos en cantidad y acumulativo');

        if(menu._id === null){
            createMenu(menu, (err, data) => {
                if(err) return console.error(err);
                
                addMenu(data.data);
                modal('Exito', 'Menú creado');
                
                sendAlert(`Menu creado por: ${JSON.parse(localStorage.appManagerUser).username}\nTítulo: ${menu.es}\nEn: ${menu.en}`)
                resetNoveltie();
                setMenu(factorReset);
            });
        }
        else if(menu._id !== null){
            putMenuProps(menu, (err, data) =>{
                if(err) return console.error(err);
                resetNoveltie();
                sendAlert(`Menu editado por: ${JSON.parse(localStorage.appManagerUser).username}\nTítulo: ${menu.es}\nEn: ${menu.en}`);
                modal('Exito', 'Menú editado');
            });
        }
    };


    const putArrayForBonus = params => {
        modal('Aviso', 'Desea eliminar este local de la bonificación', { isBtnAccept: true, method: () => {
            let newObject;
            if( menu.rulesForBonus.forLocal.length === 1 )  {
                newObject = { ...menu, rulesForBonus: { ...menu.rulesForBonus, forLocal: 'Todos' } };
            } 
            else{
                const newList = menu.rulesForBonus.forLocal.filter(item => item.idLocal !== params);
                newObject = { ...menu, rulesForBonus: { ...menu.rulesForBonus, forLocal: newList } };
            }
            setMenu(newObject);
        }});
        
    };


    const optionHeader = () => {

        return(
            <>
                {
                    titleHeader.map(item => (
                        <option key={ item.es } es={ item.es } en={ item.en }>{ item.es }</option>
                    ))
                }
            </>
        )
       
    };

    
    const optionCategory = arrayCategory.map(item => {
        let element;
        item.title === '' ?
        element = React.createElement('option', { value: 'sin categoria' }, 'sin categoria')
        :
        element = React.createElement('option', { value: item.value }, item.title);
        return element;
    });


    const localName = local?.map(item => {
        return(
            <option key={ item._id } value={ item._id }>{ item.name }</option>
        )
    });


    const sendAlert = text => {
        const formData = new FormData();
        formData.append('my-text', text); 
        axios.post(`https://72.68.60.254:4000/bot/imgV2/number=120363047824436141@g.us`, formData)
            .then(response => response)
            .catch(err => console.error(err));
    };


    return(
        <>
            <div className='manuContentContain' id='menu-render' >
                <div className='menuConfigurtationHeader'>
                    <p className='menuConfigurtationHeader-text'>Configuración del menú</p>
                    <button 
                        className='btn-reset' 
                        disabled={ !Boolean(menu) }
                        onClick={ () => { 
                            resetNoveltie();
                            setMenu({...factorReset });
                        } }
                    >reset</button>
                </div>
                <div className='configurationMenu'>
                    <form className='configurationMenu-form' id='form-menu' onSubmit={ e => putMenu(e) }>
                        <div className='configurationMenu-div'>
                            <label className='configurationMenu-label' >Categoria
                                <select 
                                    className='configurationMenu-input'
                                    required
                                    value={ menu.category }
                                    onChange={
                                        e => {
                                            setMenu({...menu, category: e.target.value });
                                        }
                                    }
                                >
                                    <option value=''>- Selecione una categoria -</option>
                                    { optionCategory }
                                </select>
                            </label>

                            <label className='configurationMenu-label' >id
                                <input 
                                type='text' 
                                    className='configurationMenu-input'
                                    disabled
                                    value={ menu._id || '' }
                                />
                            </label>
                        </div>

                        <hr />

                        <div className='configurationMenu-div' style={{ flexDirection: 'column', alignItems: 'center' }} >
                            <label className='configurationMenu-label textCenter' > Título con encabezado
                                <input 
                                    className='configurationMenu-check'
                                    type='checkbox'
                                    name='table'
                                    checked={ Boolean(menu.textHeader) }
                                    onChange={
                                        () => {
                                            if(!Boolean(menu.textHeader)){
                                                setMenu({...menu, textHeader : { es: '', en: '' } });
                                            }
                                            else{
                                                setMenu({...menu, textHeader : null });
                                            }
                                        }
                                    }
                                />
                            </label>
                            {
                                titleHeader && Boolean(menu.textHeader) ? 
                                (
                                    <>
                                        <label className='configurationMenu-label  textCenter' >Texto del encabezado
                                            <select 
                                                className='configurationMenu-input'
                                                required
                                                value={ menu.textHeader.es || '- Selecione un encabezado -' }
                                                onChange={
                                                    e => {
                                                        const newObject = titleHeader.filter(item => item.es === e.target.value );
                                                        setMenu({...menu, textHeader: { es: newObject[0].es, en: newObject[0].en } });
                                                    }
                                                }
                                            >
                                                <option value={ null }>- Selecione un encabezado -</option>
                                                { optionHeader() }
                                            </select>
                                        </label>
                                    </>
                                )
                                : 
                                (null)
                            }
                        </div>

                        <hr />

                        <div className='configurationMenu-div'>
                            <label 
                            style={{width:'100%'}}
                            className='configurationMenu-label' >TÍtulo en castellano
                                <textarea 
                                 style={{width:'100%'}}
                                    className='configurationMenu-input'
                                    type='text'
                                    required
                                    value={ menu.es }
                                    onChange={
                                        e => {
                                            setMenu({...menu, es: e.target.value });
                                        }
                                    }
                                ></textarea>
                            </label>
                       
                            <label 
                             style={{width:'100%'}}
                             className='configurationMenu-label'>TÍtulo en ingles
                                <textarea 
                                    style={{width:'100%'}}
                                    className='configurationMenu-input'
                                    type='text'
                                    required
                                    value={ menu.en }
                                    onChange={
                                        e => {
                                            setMenu({...menu, en: e.target.value });
                                        }
                                    }
                                ></textarea>
                            </label>
                        </div>


                        <div className='configurationMenu-div'>
                            <label className='configurationMenu-label textCenter' > Requiere numero de mesa
                                <input 
                                    className='configurationMenu-check'
                                    type='checkbox'
                                    name='table'
                                    checked={ menu.table }
                                    onChange={
                                        e => {
                                            setMenu({...menu, table : e.target.checked });
                                        }
                                    }
                                />
                            </label>
                        </div>
                        <hr />
                                
                        <span className='textCenter'>Tipo de tiempo</span>

                        <div className='configurationMenu-label-radioContaint'>
                            <label className='configurationMenu-label textCenter label-radio'>Sin tiempo
                                <input 
                                    className='configurationMenu-radio'
                                    required
                                    type='radio'
                                    name='time'
                                    checked={ !Boolean(menu.time) && !Boolean(menu.timeUnique) }
                                    onChange={
                                        () => { 
                                            const newMenu = { ...menu, time: false, timeUnique: false, especial: null };
                                            setMenu(newMenu);
                                        } 
                                    }
                                />
                                <div className='configurationMenu-radio-dog'></div>
                            </label>
                                    
                            <label className='configurationMenu-label textCenter label-radio'>Tiempo de llegada
                                <input 
                                    className='configurationMenu-radio'
                                    required
                                    type='radio'
                                    name='time'
                                    checked={ menu.timeUnique }
                                    onChange={
                                        () => { 
                                            const newMenu = { ...menu, time: false, timeUnique: true, especial: null };
                                            setMenu(newMenu);
                                        } 
                                    }
                                />
                                <div className='configurationMenu-radio-dog'></div>
                            </label>
                      
                            <label className='configurationMenu-label textCenter label-radio'>Tiempo de inicio y fin
                                <input 
                                    className='configurationMenu-radio'
                                    required
                                    type='radio'
                                    name='time'
                                    checked={ menu.time }
                                    onChange={
                                        () => { 
                                            const newMenu = { ...menu, time: true, timeUnique: false };
                                            setMenu(newMenu);
                                        } 
                                    }
                                />
                                <div className='configurationMenu-radio-dog'></div>
                            </label>
                        </div>

                        <hr />
                        
                        <div className='configurationMenu-divMenuS'>
                            <label className='configurationMenu-label label-countImg'>Número de imagenes
                                <input 
                                    className='configurationMenu-input'
                                    required
                                    name='photosLength'
                                    type='number'
                                    min='1'
                                    max='4'
                                    value={ menu.photos?.length || 0 }
                                    onChange={
                                        e => {
                                            if(e.target.value === '0' || Number(e.target.value) > 4) return console.error('el numero de fotos no puede superar a 4');
                                            setMenu(
                                                { 
                                                    ...menu, 
                                                    photos: {
                                                        length: Number(e.target.value),
                                                        caption: setCaptionArrays(Number(e.target.value))
                                                    }
                                                }
                                            );
                                        }
                                    }
                                />
                            </label>
                        </div>
                        <div className='configurationMenu-div' id='count-img-form'>
                            {
                                boxRender()
                            }
                        </div>
                        <hr />
                        <div className='configurationMenu-divMenuS'>
                            <label className='configurationMenu-label textCenter'>Menú especial en tiempo
                                <input 
                                    className='configurationMenu-check'
                                    type='checkbox'
                                    name='special'
                                    checked={ menu.time && Boolean(menu.especial) }
                                    onChange={
                                        e => {
                                            if(!menu.time) {
                                                return modal('Aviso', 'Esta opción solo se puede habilitar si la opción de inicio y fin esta marcada en la casilla.');
                                            }
                                            if(!e.target.checked){
                                                setMenu({...menu, especial: null });
                                            }
                                            else{
                                                setMenu({...menu, especial: {
                                                    time: {
                                                        timeInitTitle:{
                                                            es: '',
                                                            en: ''
                                                        },
                                                        timeEndTitle: {
                                                            es: '',
                                                            en: ''
                                                        }
                                                    }
                                                } });
                                            }
                                        }
                                    }
                                />
                            </label>
                            <div className='configurationMenu-inputContain'>
                                <label className='configurationMenu-label'>Tiempo de inicio en castellano
                                    <input 
                                        className='configurationMenu-input'
                                        required
                                        type='text'
                                        disabled={ menu.time === false || menu.especial === null } 
                                        value={ menu.especial?.time?.timeInitTitle?.es || '' }
                                        onChange={
                                            e => {
                                                const newObject = { 
                                                    ...menu, 
                                                    especial: { 
                                                        time: {
                                                            ...menu.especial.time, 
                                                            timeInitTitle: { 
                                                                ...menu.especial.time.timeInitTitle, 
                                                                es: e.target.value 
                                                            } 
                                                        }
                                                    } 
                                                };
                                                setMenu(newObject);
                                            }
                                        }
                                    />
                                </label>
                                <label className='configurationMenu-label'>Tiempo de inicio en ingles
                                    <input
                                        className='configurationMenu-input'
                                        required
                                        type='text'
                                        disabled={ menu.time === false || menu.especial === null } 
                                        value={ menu.especial?.time?.timeInitTitle?.en || '' }
                                        onChange={
                                            e => {
                                                const newObject = { 
                                                    ...menu, 
                                                    especial: { 
                                                        time: {
                                                            ...menu.especial.time, 
                                                            timeInitTitle: { 
                                                                ...menu.especial.time.timeInitTitle, 
                                                                en: e.target.value 
                                                            } 
                                                        }
                                                    } 
                                                };
                                                setMenu(newObject);
                                            }
                                        }
                                    />
                                </label>
                                <label className='configurationMenu-label'>Tiempo de finalización en castellano
                                    <input 
                                        className='configurationMenu-input'
                                        required
                                        type='text'
                                        disabled={ menu.time === false || menu.especial === null } 
                                        value={ menu.especial?.time?.timeEndTitle?.es || '' }
                                        onChange={
                                            e => {
                                                const newObject = { 
                                                    ...menu, 
                                                    especial: { 
                                                        time: {
                                                            ...menu.especial.time, 
                                                            timeEndTitle: { 
                                                                ...menu.especial.time.timeEndTitle, 
                                                                es: e.target.value 
                                                            } 
                                                        }
                                                    } 
                                                };
                                                setMenu(newObject);
                                            }
                                        }
                                    />
                                </label>
                                <label className='configurationMenu-label'>Tiempo de finalización en ingles
                                    <input
                                        className='configurationMenu-input'
                                        required
                                        type='text'
                                        disabled={ menu.time === false || menu.especial === null } 
                                        value={ menu.especial?.time?.timeEndTitle?.en || '' }
                                        onChange={
                                            e => {
                                                const newObject = { 
                                                    ...menu, 
                                                    especial: { 
                                                        time: {
                                                            ...menu.especial.time, 
                                                            timeEndTitle: { 
                                                                ...menu.especial.time.timeEndTitle, 
                                                                en: e.target.value 
                                                            } 
                                                        }
                                                    } 
                                                };
                                                setMenu(newObject);
                                            }
                                        }
                                    />
                                </label>
                            </div>
                        </div>
                        <hr />

                        <div className='configurationMenu-divMenuS'>
                            <label className='configurationMenu-label textCenter' >¿ Requiere Modelo y colores de automovil ?
                                <input 
                                    className='configurationMenu-check'
                                    type='checkbox'
                                    name='table'
                                    checked={ Boolean(menu.car) }
                                    onChange={
                                        e => {
                                            setMenu({...menu, car : e.target.checked });
                                        }
                                    }
                                />
                            </label>
                        </div>
                        <hr />

                        <div className='configurationMenu-divMenuS'>
                            <label className='configurationMenu-label textCenter' >¿ Descipción de persona ?
                                <input 
                                    className='configurationMenu-check'
                                    type='checkbox'
                                    name='table'
                                    checked={ Boolean(menu.isDescriptionPerson) }
                                    onChange={
                                        e => {
                                            setMenu({...menu, isDescriptionPerson : e.target.checked });
                                        }
                                    }
                                />
                            </label>
                        </div>
                        <hr />     

                        <div className='configurationMenu-divMenuS'>
                            <label className='configurationMenu-label textCenter' >¿ Descipción de área ?
                                <input 
                                    className='configurationMenu-check'
                                    type='checkbox'
                                    name='table'
                                    checked={ Boolean(menu.isArea) }
                                    onChange={
                                        e => {
                                            setMenu({...menu, isArea : e.target.checked });
                                        }
                                    }
                                />
                            </label>
                        </div>
                        <hr />

                        <div className='configurationMenu-divMenuS'>
                            <div className='contentIten-1ren'>
                                <p className='menuConfigurtationHeader-text center'>bonificación para:</p>
                                <label className='configurationMenu-label'> Locales o todos
                                        <select 
                                            className='configurationMenu-input'
                                            onChange={
                                                e => {
                                                    if(e.target.value === 'Todos') {
                                                        const newObject = { ...menu, rulesForBonus: { ...menu.rulesForBonus, forLocal: 'Todos' } }
                                                        setMenu(newObject);
                                                    }
                                                    else{
                                                        const localFill = local.filter(item => item._id === e.target.value);
                                                        if( menu.rulesForBonus?.forLocal === undefined || typeof menu.rulesForBonus?.forLocal === 'string' ){
                                                            
                                                            const newArrayLocal = [ { idLocal: localFill[0]._id , name: localFill[0].name } ];
                                                            const newObject = { ...menu , rulesForBonus: { ...menu.rulesForBonus, forLocal: newArrayLocal } };
                                                            setMenu(newObject);
                                                        }
                                                        else{
                                                            const newArrayLocal = [ ...menu.rulesForBonus.forLocal, { idLocal: localFill[0]._id , name: localFill[0].name } ];
                                                            const newObject = { ...menu , rulesForBonus: { ...menu.rulesForBonus, forLocal: newArrayLocal } };
                                                            setMenu(newObject);
                                                        }
                                                    }
                                                }
                                            }
                                        >
                                            <option value='Todos'>Todos</option>
                                            { localName }
                                        </select>
                                </label>
                            </div>


                            <div className='contentIten-1ren list-contentLocal'>
                                {
                                    menu.rulesForBonus.forLocal === 'Todos' || menu.rulesForBonus.forLocal === undefined  ?
                                    (
                                        <>
                                            <h2
                                                style={{
                                                    textAlign: 'center',
                                                    color: '#001453'
                                                }}
                                            >Para todos los locales</h2>
                                        </>
                                    )
                                    : 
                                    (
                                        <>
                                            {
                                                Array.isArray(menu.rulesForBonus.forLocal) ? 
                                                (
                                                    menu.rulesForBonus.forLocal.map(local => (
                                                        <div className='list-itemlocal'>
                                                            <p className='itemlocal-nameText'>{ local.name }</p>
                                                            <button 
                                                                className='list-itemlocal-btn'
                                                                type='button'
                                                                onClick={
                                                                    () => {
                                                                        putArrayForBonus(local.idLocal);
                                                                    }
                                                                }
                                                            >
                                                                <img className='list-itemlocal-btnImg' 
                                                                src='ico/delete/delete.svg' alt="" />
                                                            </button>
                                                        </div>
                                                    ))
                                                    
                                                )
                                                :
                                                (null)
                                            }
                                        </>
                                    )
                                }
                            </div>

                            <div className='contentIten-1ren'>
                                <p className='menuConfigurtationHeader-text center'>Regla de bonificación</p>
                              
                                <div className='configurationMenu-inputContain'>
                                    <label className='configurationMenu-label'>Valor de bono
                                        <input 
                                            type='number' 
                                            className='configurationMenu-input'
                                            value={menu.rulesForBonus?.worth}
                                            onChange={
                                                e => {
                                                    const newObject = { 
                                                       ...menu, 
                                                         rulesForBonus: { 
                                                           ...menu.rulesForBonus, 
                                                            worth: Number(e.target.value) 
                                                         }
                                                    };
                                                    setMenu(newObject);
                                                }
                                            }
                                        />
                                    </label>
                                    <label className='configurationMenu-label'>Aumulativo
                                        <input
                                            className='configurationMenu-input'
                                            type='number'
                                            value={ menu.rulesForBonus?.amulative }
                                            onChange={
                                                e => {
                                                    const newObject = { 
                                                       ...menu, 
                                                         rulesForBonus: { 
                                                           ...menu.rulesForBonus, 
                                                           amulative: Number(e.target.value) 
                                                         }
                                                    };
                                                    setMenu(newObject);
                                                }
                                            }
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                        <button className='configurationMenu-divBtnForm'>
                            {
                                menu._id === null? 
                                    'Crear' : 
                                    'Editar'
                            }
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}


export { Form };