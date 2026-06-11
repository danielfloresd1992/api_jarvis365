import { getMenuAll, deleteMenu } from '/menu/assets/model/menu.model.js';
const {
  useState,
  useEffect,
  useRef
} = React;
function ListMenu({
  setMenu,
  resetNoveltie,
  arrayCategory,
  modal,
  newMENU,
  resetAddManuState
}) {
  const [arrayMenuAll, setArrayMenuAll] = useState([]);
  const [category, setCategory] = useState('all');
  const categoryRef = useRef(null);
  useEffect(() => {
    getMenuAll(category, (err, {
      menuList,
      categoryList
    }) => {
      categoryRef.current = categoryList;
      setArrayMenuAll([...menuList]);
    });
  }, [category, newMENU]);
  useEffect(() => {
    console.log(newMENU);
    if (Boolean(newMENU)) {
      setArrayMenuAll([...arrayMenuAll, newMENU]);
      resetAddManuState();
    }
  }, [newMENU]);
  const deleteMenuAllArray = id => {
    const newArray = arrayMenuAll.filter(menu => id !== menu._id);
    console.log(newArray);
    setArrayMenuAll(newArray);
    resetNoveltie();
  };
  const listMenuHtml = arrayMenuAll.map(item => /*#__PURE__*/React.createElement("div", {
    className: "itemMenu",
    idmenu: item._id,
    key: item._id,
    style: item.rulesForBonus.worth > 0 && item.rulesForBonus.amulative ? {
      outline: '2px solid #2bcb00'
    } : {
      border: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "titleList",
    id: "selectMenu-02",
    onClick: () => setMenu(item._id)
  }, item.es), /*#__PURE__*/React.createElement("span", {
    className: "titleEn"
  }, item.en), /*#__PURE__*/React.createElement("button", {
    className: "btnDelete",
    id: "deleted-menu10",
    onClick: () => {
      modal('Aviso', 'Desea eliminar este registro', {
        isBtnAccept: true,
        method: () => {
          deleteMenu(item._id, (err, response) => {
            if (err) {
              modal('Error', 'Error al eliminar el registro.');
              throw console.error(err);
            }
            console.log(response);
            modal('Exito', 'Menú eliminado');
            deleteMenuAllArray(item._id);
          });
        }
      });
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `https://${window.location.host}/ico/delete/delete.svg`,
    className: "imgDelete"
  }))));
  const categoryHtml = arrayCategory.map(item => item.title === '' ? React.createElement('option', {
    value: 'sin categoria'
  }, 'sin categoria') : React.createElement('option', {
    value: item.value
  }, item.title));
  const deleteMenuById = id => {};
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "listContain"
  }, /*#__PURE__*/React.createElement("div", {
    className: "seachContain"
  }, /*#__PURE__*/React.createElement("label", {
    className: "labelSelect"
  }, " Selecione por categoria", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", null, "cantidad registrada:"), /*#__PURE__*/React.createElement("span", {
    className: "menu-length"
  }, arrayMenuAll.length)), /*#__PURE__*/React.createElement("select", {
    className: "list-inputSeach",
    onChange: e => setCategory(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "null"
  }, "-Selecione-"), /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "Todos"), categoryHtml)), /*#__PURE__*/React.createElement("div", {
    className: "listContent",
    id: "listMenu"
  }, listMenuHtml)));
}
export { ListMenu };
