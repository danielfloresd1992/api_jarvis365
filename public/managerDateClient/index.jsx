'use strict';


import BoxModal from '/utils/window_boxModal/boxModal.js';
import { Seach } from '/managerDateClient/assets/view/Seach.js';
import { ContentSection } from '/managerDateClient/assets/view/Content.js';
const { useState, useRef, useEffect } = React;



function App(){

    const [ local, setLocal ] = useState(null);
    const [ configLocalDate, setConfigLocalDate ] = useState(null);
    const [ openFormBoolean, setOpenForm ] = useState(false);

    const dayRef = useRef(null);
    const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);



    useEffect(()=> {
        if(typeof local === 'string'){
            axios.get(`https://${window.location.host}/routerSchedule/idLocal=${local}`)
                .then(response => {
                    if(response.status === 200) {
                        setConfigLocalDate(response.data[0]);
                    }
                })
                .catch(err => {
                    if(err.response.status === 404){
                        boxModal.show('Aviso', 'No existe un horario para este local ¿Desea crear una configuración para el?', { isBtnAccept: true, method: () => {
                            const newConfig = {
                                idLocal: local,
                                dayMonitoring: []
                            }
                            axios.post(`https://${window.location.host}/routerSchedule`, newConfig)
                                .then(response => {
                                    if(response.status === 200){
                                        setConfigLocalDate({
                                            idLocal: local,
                                            dayMonitoring: []
                                        });
                                    }
                                })
                                .catch(err => {
                                    console.log(err);
                                    boxModal.show('Error', 'Ah ocurrido un error :(');
                                });
                        }});
                    }
                });
        }
    }, [ local ]);


    console.log(configLocalDate);
    

    const selectLocal = id => {
        setLocal(id);
    };  



    const openFormWindow =  paramsDay => {
        setOpenForm(true);
        dayRef.current = paramsDay;
    };



    const closeFormWindow = () => {
        setOpenForm(false);
        dayRef.current = null;
    };

    

    const deleteHourForDay = keyDay => {
        boxModal.show('Aviso', '¿Seguro de eliminar este rango?', { isBtnAccept: true, method: () => {
            console.log(keyDay);
            const newArray = configLocalDate.dayMonitoring.filter(time => time.key !== keyDay);
            const putObject = { ...configLocalDate, dayMonitoring: [ ...newArray ] };

            axios.put(`https://${ window.location.host }/routerSchedule/idLocal=${ local }`, putObject )
                .then(response => {
                    console.log(response);
                    if(response.status === 200){
                        setConfigLocalDate(putObject);
                        console.log(configLocalDate);
                        closeFormWindow();
                    }
                })
                .catch(err => {
                    if(err?.response?.status === 404) console.log(err);
                    console.log(err);
                });
        }});
    };



    const pushDateDay = configDay => {;
        const putObject = { ...configLocalDate, dayMonitoring: [ ...configLocalDate.dayMonitoring, configDay ] };;
        console.log(putObject);
        axios.put(`https://${ window.location.host }/routerSchedule/idLocal=${ local }`, putObject )
            .then(response => {
                console.log(response);
                if(response.status === 200){
                    setConfigLocalDate({ ...configLocalDate, dayMonitoring: [ ...configLocalDate.dayMonitoring, configDay ] });;
                    console.log(configLocalDate);
                    closeFormWindow();
                }
            })
            .catch(err => {
                if(err?.response?.status === 404) console.log(err);
                console.log(err);
            });
    };
    

    
    return (
        <>
            <main className=''>
                <Seach select={ selectLocal } />
                {
                    configLocalDate ? 
                    (
                        <ContentSection 
                            idLocal={ local } 
                            configLocalDate={ configLocalDate } 
                            openSetForm={ openFormWindow } 
                            deleteHour={ deleteHourForDay } 
                        />
                    )
                    :
                    (null)
                }
                
                {
                    openFormBoolean ? 
                    (
                        <Form open={ openFormBoolean } 
                            close={ closeFormWindow } 
                            idLocal={ local } 
                            dayNumber={ dayRef.current } 
                            pushDateDay={ pushDateDay } 
                        />
                    )
                    :
                    (
                        null
                    )
                }
            </main>
        </>
    );
}



function Form({ open, close, idLocal, dayNumber, pushDateDay }){

    const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado' ];
    const defaultConfig = {
        dayMonitoring: dayNumber,
        
        hours: { 
            start: '',
            end: '', 
        },
        idLocal: idLocal,
        key: `${idLocal}-00:00:00-00:00:00`
    };
    const [ day, setDay ] = useState();


    useEffect(() => {
        setDay(defaultConfig);
    }, [ ]);
     

    return(
        <>
            <article 
                    className='componentContain component__absolute'
                    style={{ display: 'flex' }}
            >
                <form className='form-content' onSubmit={ e => { e.preventDefault(); pushDateDay(day) } } >
                    <div className='contain-center contain--right'>
                        <img 
                            className='title-ico' 
                            title='regresar' 
                            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAABvElEQVR4nO2YsUoDQRBAnwhRUCzUAxvRLskvRAQJNnYRjBZ2FvoXkk/QQhs7bTU/IAhqEEGDGq01JFiJvRL1ZGGFsOzJGtDsnPdgmoM97jEze7sDbhSApo45hLIEtIBQh5IRLxECDWIg0dJlJoaiReINWEYQxUTCE4pJJjyhYMnEX8czcAHsAmvAeCcizS5L2OIDONHl3itZJGyLGpCXUlouGdoC+jr9i6vnv80AkAFmgHWg+o3QGRD4LGOSBvZ1JkyZW2kyihzwEJGZfoTJBMCxRWbbZbFvMimLjCq7WYnH+AC4N77nzvU/Y5Pp5g0xZ9kAFl0XmzLdviEeGCKVnyz+Gj40PBg+ZC29MolQrgwZddAUSckQ2UMoeUPkEqGkDZEnhDJoiLwglCFD5BWhpONSWvm4NHspLtvvtSGyikCyliPKBAIpGyJqbCSOKctNcQFhBEDdMvNyHuD5QEqXkNkbaoQkhhHgyFJSmwjribpFouIyDvJliy1HTBtvgFE8Pclm9LGjZLn9tccpMBz1olBAvAMbuukjCT2PKjDtklpfM3AIzAM9rjUaehCPwDmwA6wAY64fn5CQ8M/4BPWUIX8QW8oJAAAAAElFTkSuQmCC"
                            onClick={ close }
                        />
                    </div>
                    
                    <div className='contain-center'>
                        <h2 className='titleForm'>Dia: { days[ dayNumber ] }</h2>
                    </div>
                    <label className='label-item label-item--mid'> Id local
                        <input 
                            className='input-item' 
                            type="text" 
                            disabled
                            value={ idLocal }
                        />
                    </label>

                    <label className='label-item label-item--mid'> Modelidad
                        <select 
                            className='input-item' 
                            required
                            disabled
                            onChange={e => {
                                
                            }}
                        >
                            <option className='option' value='extended'>Horario extendido</option>
                            <option className='option' value='fragmented'>Horario fragmentado</option>
                        </select>
                    </label>


                    <label className='label-item label-item--mid'> Inicio de monitoreo
                        <input 
                            className='input-item' 
                            type='text'
                            placeholder='00:00:00'
                            required
                            pattern='^(([0-1]\d)|(2[0-3]))(:[0-5]\d){2}$'
                            maxLength='8'
                            onChange={ e => {
                                console.log(e.target.value);
                                setDay({ ...day,
                                        key: `${idLocal}-${e.target.value}-${day.hours.end}-${days[dayNumber]}` ,
                                        hours: { 
                                        ...day.hours,
                                        start: e.target.value
                                    } 
                                });
                            }}
                        />
                    </label>

                    <label className='label-item label-item--mid'> Fin del monitoreo
                        <input 
                            className='input-item' 
                            type='text'
                            placeholder='23:59:59'
                            required
                            pattern='^(([0-1]\d)|(2[0-3]))(:[0-5]\d){2}$'
                            maxLength='8'
                            onChange={ e => {
                                console.log(e.target.value);
                                setDay({ ...day, 
                                    key: `${idLocal}-${day.hours.start}-${e.target.value}-${days[dayNumber]}` ,
                                    hours: { 
                                    ...day.hours,
                                    end: e.target.value
                                } 
                            });
                            }}
                        />
                    </label>

                    <div className='contain-center'>
                        <button className='btn-item'>Guardar</button>
                    </div>
                </form>

            </article>
        </>
    )
}



const root = ReactDOM.createRoot(document.querySelector('.Root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
;