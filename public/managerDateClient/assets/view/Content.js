import calcularTotalHoras from '/utils/calculateHours.js';
import BoxModal from '/utils/window_boxModal/boxModal.js';
function ContentSection({
  idLocal,
  configLocalDate,
  openSetForm,
  deleteHour
}) {
  const boxModal = new BoxModal(document.getElementsByTagName('body')[0]);
  const button = day => {
    return /*#__PURE__*/React.createElement("div", {
      className: "contain-btn",
      onClick: () => openSetForm(day)
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn-quad"
    }, "+"));
  };
  const removeDay = keyDay => {
    console.log(keyDay);
    const newArr = configLocalDate.dayMonitoring.filter(day => day.key !== keyDay);
  };
  const boxHours = arr => {
    return /*#__PURE__*/React.createElement(React.Fragment, null, arr.map(item => /*#__PURE__*/React.createElement("div", {
      className: "box-contain",
      key: `${item.hours.start}${12}`,
      style: {
        minHeight: `${calcularTotalHoras(item.hours.start, item.hours.end) * 25}px`
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "contain-btn contain-btn--withText"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn-invisivily",
      onClick: () => {
        deleteHour(item.key);
      }
    }, /*#__PURE__*/React.createElement("img", {
      className: "filter-invert",
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAB50lEQVR4nO2Z30rDMBSH46XDm4mIiOALzW627saHcJ3YernX2nRT/PM2Ui9szo0IR4qbxpGlSXuSoOQHuU2/b6Xd+aWMhYSEhPyZwGl+Bkm2wOFkh3pv7E06EOezMr4+Z7bgeZy/Q5Ijj/NHSgn8gp8v9/4glxDhV4tKAgV4YW86CRk8lQRK4EklVPBtJVTwQCGhA99UQgce2kggY1uQZFOdC/ysbFGBacEn2cJw72nFZCYxHG9Dkt+aXKjuTpj88rDaM8keGj9nlBLO4SklvMFTSHiHb/PwldFoxqP03jt8kzvBB2Modg/fXveOkPdT//AmEiv4F8awWjoS3AW8jsQ6vI4EdwmvktgEr5LgPuBlEnXwMgnuE/5bojfpVG+bolsPL0qU0cWzd/iVAPTTu2L/WAu+WkX3gMPJaO5d4FeTGlyijkQFX0YjkP1jO420SdVIiPCbxg4nUTapDRIyePAhodWk1iRU8OBSwqhJLSV04MGFRKOpsp8+8Si9sdHsjNJmJLbR7IxCMc97k0DCMuJcAi00KWcS+B+OVSC+SrQPtgynSqNmF7c5ndOQaDoSazW7mOJ8VCHRdp5HVbMjPaGWSFCVEZQ1OyvfCAQJ6iaFYrOzAS9KWPvENKwksqk1+JCQkBBmI5/G9M0wq45fBQAAAABJRU5ErkJggg=="
    }))), /*#__PURE__*/React.createElement("p", {
      className: "box-text"
    }, "desde: ", item.hours.start), /*#__PURE__*/React.createElement("p", {
      className: "box-text"
    }, "hasta: ", item.hours.end), /*#__PURE__*/React.createElement("p", {
      className: "box-text"
    }, "total: ", Math.floor(calcularTotalHoras(item.hours.start, item.hours.end)), " horas"))));
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, idLocal ? /*#__PURE__*/React.createElement("section", {
    className: "content-seach"
  }, /*#__PURE__*/React.createElement("div", {
    className: "filesContains"
  }, /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Lunes"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 1)), button(1)), /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Martes"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 2)), button(2)), /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Miercoles"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 3)), button(3)), /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Jueves"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 4)), button(4)), /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Viernes"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 5)), button(5)), /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Sabado"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 6)), button(6)), /*#__PURE__*/React.createElement("div", {
    className: "file"
  }, /*#__PURE__*/React.createElement("p", {
    className: "file-title"
  }, "Domingo"), boxHours(configLocalDate.dayMonitoring.filter(day => day.dayMonitoring === 0)), button(0)))) : /*#__PURE__*/React.createElement(React.Fragment, null));
}
export { ContentSection };
