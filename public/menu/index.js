//model 
import { sendMenu, putMenu } from '/menu/assets/model/menu.model.js';

//view
import { Form } from '/menu/assets/view/FormReact.js';
import { ListMenu } from '/menu/assets/view/ListMenu.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';
const {
  useState,
  useEffect
} = React;
function App() {
  const [menuIndividual, setMenuIndividual] = useState(null);
  const [addManuState, setAddManuState] = useState(null);
  const [category, setCategory] = useState(null);
  const [locals, setLocals] = useState(null);
  const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
  useEffect(() => {
    axios.get(`https://${window.location.host}/menu/assets/category.json`).then(response => {
      setCategory(response.data);
    });
    axios.get(`https://${window.location.host}/localLigth`).then(response => {
      setLocals(response.data);
    }).catch(err => {
      console.log(err);
    });
    return () => {};
  }, [menuIndividual]);
  const selectNoveltie = id => {
    axios.get(`https://${window.location.host}/menu/id=${id}`).then(response => {
      setMenuIndividual({
        ...response.data[0]
      });
    }).catch(err => {
      console.log(err);
    });
  };
  const resetNoveltie = () => {
    setMenuIndividual(null);
  };
  const openModal = (title, description, objectConfig = null) => {
    boxModal.show(title, description, objectConfig);
  };
  const addMenu = menu => {
    setAddManuState(menu);
  };
  const resetAddManuState = () => {
    setAddManuState(null);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, category && locals ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ListMenu, {
    setMenu: selectNoveltie,
    resetNoveltie: resetNoveltie,
    arrayCategory: category,
    modal: openModal,
    newMENU: addManuState,
    resetAddManuState: resetAddManuState
  }), /*#__PURE__*/React.createElement(Form, {
    menuIndividual: menuIndividual,
    arrayCategory: category,
    local: locals,
    resetNoveltie: resetNoveltie,
    putMenuProps: putMenu,
    createMenu: sendMenu,
    modal: openModal,
    addMenu: addMenu
  })) : null);
}
const root = ReactDOM.createRoot(document.querySelector('.mainContain'));
root.render( /*#__PURE__*/React.createElement(React.StrictMode, null, /*#__PURE__*/React.createElement(App, null)));
