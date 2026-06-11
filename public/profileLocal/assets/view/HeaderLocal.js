import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
function HeaderLocal({
  local
}) {
  console.log(local);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("nav", {
    className: "profile"
  }, /*#__PURE__*/React.createElement("img", {
    class: "img profile-frontImg",
    src: "img/analitic.png"
  }), /*#__PURE__*/React.createElement("div", {
    className: "profile-nameiMG"
  }, /*#__PURE__*/React.createElement("img", {
    className: "profile-img",
    id: "img-profile",
    src: arrayBufferToBase64(local.img.data.data, 'image/png')
  }), /*#__PURE__*/React.createElement("h1", {
    className: "profile-name",
    id: "nameLocalTitle"
  }, local.name))));
}
export default HeaderLocal;
