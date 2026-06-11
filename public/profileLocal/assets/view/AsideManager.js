const {
  useState,
  useEffect,
  useCallback,
  memo,
  useRef
} = React;
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
function AsideManager({
  arrayManager
}) {
  const [managers, setManagers] = useState([]);
  const managerRef = useRef([]);
  useEffect(() => {
    arrayManager.forEach(id => {
      axios.get(`https://${window.location.host}/managerLocalAndImgById/id=${id}`).then(manager => {
        managerRef.current = [...managerRef.current, manager.data[0]];
        if (manager.data[0]) setManagers(managerRef.current);
      });
    });
  }, []);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
    className: "listRoute border10",
    style: {
      width: 'unset'
    }
  }, /*#__PURE__*/React.createElement("article", {
    className: "aside-contents"
  }, /*#__PURE__*/React.createElement("div", {
    className: "listRoute-a-menuTitle"
  }, /*#__PURE__*/React.createElement("p", {
    className: "usersContain-title"
  }, "Lista de gerentes"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("article", {
    className: "managetBoxContent scrolltheme1",
    id: "box-manager"
  }, Array.isArray(managers) && managers.length > 0 ? managers.map(manager => Boolean(manager) ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "managerBox",
    style: {
      order: manager.numberManager
    },
    key: manager._id
  }, /*#__PURE__*/React.createElement("div", {
    className: "managerBox-imgContent"
  }, /*#__PURE__*/React.createElement("img", {
    className: "managerBox-img",
    src: arrayBufferToBase64(manager.managerimg?.img[0].data?.data, manager.managerimg?.img[0].contentType),
    alt: manager.name
  })), /*#__PURE__*/React.createElement("div", {
    className: "managerBox-dataContent"
  }, /*#__PURE__*/React.createElement("p", {
    className: "nameManager"
  }, `${manager.burden} ${manager.name}`), /*#__PURE__*/React.createElement("p", {
    className: "text-gray"
  }, `${manager.burden} ${manager.numberManager}`)))) : null) : null)))));
}
export default memo(AsideManager);
