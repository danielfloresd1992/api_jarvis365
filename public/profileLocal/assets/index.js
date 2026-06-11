const {
  useState,
  useEffect,
  useRef
} = React;

//view
import AsideManager from '/profileLocal/assets/view/AsideManager.js';
import HeaderLocal from '/profileLocal/assets/view/HeaderLocal.js';
import Publisher from '/profileLocal/assets/view/Publisher.js';
import Table from '/profileLocal/assets/view/Table.js';

// MODEL
import { getLocal, getLocalPromise } from '/profileLocal/assets/model/local.js';
function App() {
  const path = window.location.pathname;
  const match = path.match(/\/profileAndRestaunrant=([^/]+)/);
  const namelocal = match ? match[1] : null;
  const [local, setLocals] = useState(null);
  useEffect(() => {
    getLocalPromise(namelocal).then(data => {
      setLocals(data);
    });
  }, []);
  return /*#__PURE__*/React.createElement(React.Fragment, null, Array.isArray(local) && local.length > 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(HeaderLocal, {
    local: local[0]
  }), /*#__PURE__*/React.createElement("main", {
    className: "main-3files-25-50-25"
  }, /*#__PURE__*/React.createElement(AsideManager, {
    arrayManager: local[0].managers
  }), /*#__PURE__*/React.createElement(Publisher, {
    local: local[0]
  }))) : null);
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render( /*#__PURE__*/React.createElement(React.StrictMode, null, /*#__PURE__*/React.createElement(App, null)));
