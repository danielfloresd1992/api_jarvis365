import { getMenuAll, deleteMenu } from '/menu/assets/model/menu.model.js';
const { useState, useEffect, useRef } = React;


function ListMenu({ 
        setMenu,
        resetNoveltie, 
        arrayCategory, 
        modal, 
        newMENU, 
        resetAddManuState 
    }){

    const [ arrayMenuAll, setArrayMenuAll ] = useState([]);
    const [ category, setCategory] = useState('all');
    const categoryRef = useRef(null);


    useEffect(() => {
        getMenuAll(category, (err, { menuList, categoryList } ) => {
            categoryRef.current = categoryList;
            setArrayMenuAll([...menuList]);
            
        });
    }, [ category, newMENU ]);

    useEffect(() => {
        console.log(newMENU);
        if(Boolean(newMENU)) {
            setArrayMenuAll([...arrayMenuAll, newMENU]);
            resetAddManuState();
        }

    }, [newMENU])
    
    
    const deleteMenuAllArray = id => {
        const newArray = arrayMenuAll.filter( menu => id !== menu._id );
        console.log(newArray);
        setArrayMenuAll(newArray);
        resetNoveltie();
    };


    const listMenuHtml = arrayMenuAll.map(item => (
        <div 
            className='itemMenu' 
            idmenu={ item._id } 
            key={ item._id }
            style={
                item.rulesForBonus.worth > 0 && item.rulesForBonus.amulative ?
                {
                    outline: '2px solid #2bcb00'
                }
                : 
                {
                    border: 'none'
                }
            }
        >
            <span 
                className='titleList' 
                id='selectMenu-02'
                onClick={() => setMenu(item._id) }
            >
                { item.es }
            </span>
            <span className='titleEn'>{ item.en }</span>
      
            <button 
                className='btnDelete' 
                id='deleted-menu10'
                onClick={
                    () => {
                        modal('Aviso', 'Desea eliminar este registro', { isBtnAccept: true, method: () => {
                            deleteMenu(item._id, (err, response) => {
                                if(err){ 
                                    modal('Error', 'Error al eliminar el registro.');
                                    throw console.error(err);
                                }
                                console.log(response)
                                modal('Exito', 'Menú eliminado');
                                deleteMenuAllArray(item._id);
                            });
                        }});
                    }
                }
            >
                <img 
                    src={ `https://${window.location.host}/ico/delete/delete.svg` } 
                    className='imgDelete'
                />
            </button>       
        </div>
    ));


    const categoryHtml = arrayCategory.map(item => (
        item.title === '' ?
        React.createElement('option', { value: 'sin categoria' }, 'sin categoria')
        :
        React.createElement('option', { value: item.value }, item.title)
    ));


    return(
        <>    
            <div className='listContain'>
                <div className='seachContain'>
                    <label className='labelSelect'> Selecione por categoria
                        <br />
                        <span>cantidad registrada:</span>
                        <span className='menu-length'>{ arrayMenuAll.length }</span>
                        
                    </label>
                    <select 
                        className='list-inputSeach'
                        onChange={ e => setCategory( e.target.value ) }
                    >
                        <option value='null'>-Selecione-</option>
                        <option value="all">Todos</option>
                        {
                            categoryHtml
                        }
                    </select>
                </div>
                <div className='listContent' id='listMenu'>
                    {
                        listMenuHtml
                    }
                </div>
            </div>
        </>
    )
}


export { ListMenu }