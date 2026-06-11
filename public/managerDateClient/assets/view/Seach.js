const {
  useState,
  useEffect
} = React;
function Seach({
  select
}) {
  const [locals, setLocal] = useState([]);
  useEffect(() => {
    axios.get(`https://${window.location.host}/localLigth`).then(response => {
      setLocal([...locals, ...response.data]);
    }).catch(err => {
      console.log(err);
    });
  }, []);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("nav", {
    className: "nav"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "nav-title"
  }, "Gestion de horarios ", /*#__PURE__*/React.createElement("img", {
    className: "title-ico",
    src: "data:image/png;base64,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"
  })), /*#__PURE__*/React.createElement("div", {
    className: "content-seach"
  }, /*#__PURE__*/React.createElement("label", {
    className: "seach-label"
  }, "Selecione un local", /*#__PURE__*/React.createElement("select", {
    className: "seach-input",
    onChange: e => {
      if (e.target.value !== 'Selecione') {
        console.log(e.target.value);
        select(e.target.value);
      }
    }
  }, /*#__PURE__*/React.createElement("option", {
    className: "select-option",
    value: null
  }, "Selecione"), locals.length > 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, locals.map(local => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", {
    className: "select-option",
    value: local._id
  }, local.name)))) : null)))));
}
export { Seach };
