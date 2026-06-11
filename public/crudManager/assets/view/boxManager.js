import { DomManipulation } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js'
import URL from '/utils/url_api.js'




function printManager(data, datalocalIMg){
    
    let imgContain = DomManipulation.createHtml('div', { class: 'ManagerContain-imgContain' });
    let imgLogoLocal = DomManipulation.createHtml('img', { class: 'ManagerContain-imgManager-characterImg', src: arrayBufferToBase64(datalocalIMg.img.data.data, datalocalIMg.contentType) });
    
    let imgCharacterContain = DomManipulation.createHtml('div', { class: 'ManagerContain-imgManager-characterContain' }, null, [ imgLogoLocal ] );
    
    if(data.managerimg){
        data.managerimg.img.forEach(img => {
            let imgManager = DomManipulation.createHtml('img', { class: 'ManagerContain-imgManager', id: 'img-manager', draggable: 'false', src: arrayBufferToBase64(img.data?.data, img.contentType) });
            imgContain.appendChild(imgManager);
        });
    }

    let btnLeft = DomManipulation.createHtml('button', { class: 'ManagerContain-btnScroll', id: 'scroll-left-img' } , '<');   
    let btnRight = DomManipulation.createHtml('button', { class: 'ManagerContain-btnScroll', id: 'scroll-right-img' }, '>');
    let btnsCrollContain = DomManipulation.createHtml('div', { class: 'ManagerContain-btnScrollContain' }, null, [ btnLeft, btnRight ]);

    let pNameManager = DomManipulation.createHtml('p', { class: 'ManagerContain-dataName' }, `${data.burden} ${data.name}` );
    let pLocation = DomManipulation.createHtml('p', { class: 'ManagerContain-datalocation' }, `${data.localName}`);
    let dataContain = DomManipulation.createHtml('div', { class: 'ManagerContain-dataContain' }, null, [ pNameManager, pLocation ]);
    
    let imgDelete = DomManipulation.createHtml('img', { class: 'ManagerContain-btnImg', name: data._id, src: 'ico/delete/delete.svg' });
    let btnDelete = DomManipulation.createHtml('button', { class:'ManagerContain-btn', id: 'delete-manager' }, null, [ imgDelete ]);
    
    let imgUpdate = DomManipulation.createHtml('img', { class: 'ManagerContain-btnImg', src: 'ico/update/update.svg' });
    let btnPut = DomManipulation.createHtml('button', { class: 'ManagerContain-btn', id: 'update-manager-31', name: data._id }, null, [ imgUpdate ]);
    let btnRedirect = DomManipulation.createHtml('button', { class: 'ManagerContain-btn' });
    let buttonContain = DomManipulation.createHtml('div', { class: 'ManagerContain-btnContain' }, null, [ btnDelete, btnPut, btnRedirect ] );

    let divContain = DomManipulation.createHtml('div', { class: 'ManagerContain', name:  data._id }, null, [ imgContain, imgCharacterContain, btnsCrollContain, dataContain, buttonContain ]);
    return(divContain);
}


function printList(data, classCss){
    let li = DomManipulation.createHtml('li', { class: classCss, name: data.idLocal || data.name, id: 'fill-franchise-30' }, data.name);
   
    if(data.img){
        let img = DomManipulation.createHtml('img', { class: 'delete-franchise', id: 'delete-franchise', src: arrayBufferToBase64(data.img.data.data, data.img.contentType) });
        li.appendChild(img);
    }
    
    
    return li;
}


function remplazeManagetBoxContain(){
    return DomManipulation.createHtml('div', { class: 'main-localContain' });
}


class RenderPutManager extends React.Component {

    constructor(props){
        super(props);
        this.state = { managerdata: this.props.managerdata, otherLocal: [] };
        this.addLocals = this.addLocals.bind(this);
        this.deleteLocals = this.deleteLocals.bind(this);
        this.putDataServer = this.putDataServer.bind(this);
        this.deleteLocal = React.createRef();
        this.deleteLocal.current = [];
        const newArrayOtherLocal = this.props.managerdata.otherLocals.filter((element) => element !== '');
        this.state.otherLocal = newArrayOtherLocal;
    }


    putDataServer = () => {
        const data = this.state.managerdata;
        data.otherLocals = this.state.otherLocal;
        data.localToDelete = this.deleteLocal.current;
        delete data.managerimg;
        axios.put(`https://${URL}/managerlocal/id=${ this.state.managerdata._id }`, data )
            .then(response => {
                console.log(response);
                this.props.deleteWindow();
            })
            .catch(err => {
                console.log(err);
            });
    }


    addLocals = target => {
        if(target !== '- selecione un local -'){
            const local = this.props.locals.filter(item => item.name === target.value  );
            const statInicial = [...this.state.otherLocal, local[0]._id];
            this.setState({ otherLocal: statInicial });
        }
    };


    deleteLocals = target => {
        const statInicial = this.state.otherLocal.filter(item => item !== target.id);
        const localDelete = this.state.otherLocal.filter(item => item === target.id);
        this.deleteLocal.current.push(localDelete[0]);
        this.setState({ otherLocal: statInicial });
    };
    

    

    render(){
        const localList = this.props.locals.map(local => {
            const getLocal = this.props.locals.filter(item => item._id === local._id);
            return React.createElement('option', { id: getLocal[0]._id }, local.name);
        });
        console.log(this.state.managerdata.managerimg)
        const listImg = this.state.managerdata.managerimg ? this.state.managerdata.managerimg.img.map(img => {
            return React.createElement('img', { class: 'boxManagerSubmit-img' , src: arrayBufferToBase64(img.data.data, img.data.contentType) });
        }) : null;


        console.log(this.state)
        
        const listOtherLocal = this.state.otherLocal.map(item => {
            const getLocal = this.props.locals.filter(local => local._id === item);
            if(getLocal.length < 1) return;
            return React.createElement('div', { class: 'boxManagerSubmit-local' }, [
                React.createElement('p', { id: getLocal[0]._id }, getLocal[0].name),
                React.createElement('button', { class: 'boxManagerSubmit-btnDelete', id: getLocal[0]._id , onClick: e => this.deleteLocals(e.target) }, 'x')
            ]);
        });


        return React.createElement('div', { class: 'boxManagerSubmit' }, [
            React.createElement('div', { class: 'boxManagerSubmit-imgContain' }, [
                listImg
            ]),
            React.createElement('div', { class: 'boxManagerSubmit-labelContain' }, [
                React.createElement('label', { class: 'form-label' }, 'Nombre del gerente', React.createElement('input', { class: 'form-input', type: 'text', value: this.state.managerdata.name, 
                onChange: e => { this.setState({ managerdata: { ...this.state.managerdata, name: e.target.value} }); } })),

                React.createElement('label', { class: 'form-label' }, 'Cargo de gerente', React.createElement('select', { class: 'form-input',  value: this.state.managerdata.burden, 
                onChange: e => { this.setState({ managerdata: { ...this.state.managerdata, burden: e.target.value }})} }, React.createElement('option', { value: 'Gerente' }, 'Gerente'), React.createElement('option', { value: 'Asistente' }, 'Asistente'), React.createElement('option', { value: 'Sommelier' }, 'Sommelier') )),

                React.createElement('label', { class: 'form-label' }, 'Descripción del gerente', React.createElement('Input', { class: 'form-input', type: 'text', value: this.state.managerdata.characteristic,
                onChange: e => { this.setState({ managerdata: { ...this.state.managerdata, characteristic: e.target.value} }); }  })),

                React.createElement('label', { class: 'form-label' }, 'Local perteneciente', React.createElement('select', { class: 'form-input', value: this.state.managerdata.localName,
                onChange: e => { this.setState({ managerdata: { ...this.state.managerdata, localName: e.target.value} }); } }, localList)),

                React.createElement('label', { class: 'form-label' }, 'Número del gerente o asistente', React.createElement('input', { class: 'form-input', type: 'number' , value: this.state.managerdata.numberManager, 
                onChange: e => { this.setState({ managerdata: { ...this.state.managerdata, numberManager: e.target.value} }); } })),


                React.createElement('label', { class: 'form-label' }, 'Estado del gerente', React.createElement('select', { class: 'form-input', value: this.state.managerdata.status.trim(),
                onChange: e => { this.setState({ managerdata: { ...this.state.managerdata, status: e.target.value} }); } }, React.createElement('option', { value: 'activo' }, 'activo'), React.createElement('option', { value: 'inactivo' }, 'inactivo') )),
            ]),

            React.createElement('div', { class: 'boxManagerSubmit-localDependenciesContaint' }, [
                React.createElement('label', { class: 'form-label' }, 'Selecione locales donde quiere que aparezca', React.createElement('select', { class: 'select-local-alternative', onChange: e => this.addLocals(e.target) }, [
                    React.createElement('option', null, '- selecione un local -'),
                    localList
                ])),
                React.createElement('div', { class: 'boxManagerSubmit-localContain' }, [
                    /////////////////////////////////
                    listOtherLocal
                ])
            ]),
            React.createElement('button', { class: 'form-btnSubmit boxManagerSubmit-btnSubmit', onClick: this.putDataServer }, 'Actualizar')
        ]);
    }
}



export { printManager, printList, remplazeManagetBoxContain, RenderPutManager };