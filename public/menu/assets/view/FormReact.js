/**
    * cd E:\App_Manager\src\public\menu\assets\view\
    * npx babel FormReact.jsx --out-file FormReact.js --compact true
    * npx babel FormReact.jsx --out-file FormReact.js --presets @babel/preset-react,@babel/preset-env
*/

const {
  useState,
  useEffect
} = React;
//import btnDelete from 'ico/delete/delete.svg';

function Form({
  menuIndividual,
  arrayCategory,
  local,
  resetNoveltie,
  putMenuProps,
  createMenu,
  modal,
  addMenu
}) {
  const factorReset = {
    es: '',
    en: '',
    textHeader: null,
    especial: null,
    table: false,
    time: false,
    timeUnique: false,
    category: '- Selecione una categoria -',
    isArea: false,
    isDescriptionPerson: false,
    photos: {
      length: '',
      caption: []
    },
    _id: null,
    car: false,
    rulesForBonus: {
      forLocal: 'Todos',
      worth: '',
      amulative: ''
    }
  };
  const [menu, setMenu] = useState(factorReset);
  const [titleHeader, setTitleHeader] = useState(null);
  useEffect(() => {
    axios.get(`https://${window.location.host}/menu/assets/model/optionsHeader.json`).then(response => {
      setTitleHeader(response.data);
    }).catch(err => {
      console.log(err);
    });
  }, []);
  useEffect(() => {
    if (menuIndividual) {
      setMenu({
        ...menuIndividual
      });
    } else {
      setMenu({
        ...factorReset
      });
    }
  }, [menuIndividual]);
  function boxRender() {
    if (menu?.photos?.length > 0) {
      return menu?.photos?.caption?.map(item => /*#__PURE__*/React.createElement("div", {
        className: "count-img-form-child",
        key: item.index
      }, /*#__PURE__*/React.createElement("span", {
        className: "titleDiv"
      }, "caption de la imagen: ", item.index), /*#__PURE__*/React.createElement("label", {
        className: "count-img-form-child-label"
      }, "'T\xEDtutlo en espa\xF1ol'", /*#__PURE__*/React.createElement("input", {
        className: "configurationMenu-input count-img-form-child-input",
        type: "text",
        required: true,
        value: item.es || null,
        onChange: e => {
          let newArray = [...menu.photos.caption];
          newArray[item.index - 1].es = e.target.value;
          setMenu({
            ...menu,
            photos: {
              ...menu.photos,
              caption: newArray
            }
          });
        }
      })), /*#__PURE__*/React.createElement("label", {
        className: "count-img-form-child-label"
      }, "'T\xEDtutlo en ingles'", /*#__PURE__*/React.createElement("input", {
        className: "configurationMenu-input count-img-form-child-input",
        type: "text",
        required: true,
        value: item.en || null,
        onChange: e => {
          let newArray = [...menu.photos.caption];
          newArray[item.index - 1].en = e.target.value;
          setMenu({
            ...menu,
            photos: {
              ...menu.photos,
              caption: newArray
            }
          });
        }
      }))));
    }
  }
  ;
  const setCaptionArrays = length => {
    const arrayCapcion = [];
    for (let index = 0; index < length; index++) {
      arrayCapcion.push({
        index: index + 1,
        es: 'null',
        en: 'null'
      });
    }
    return arrayCapcion;
  };
  const putMenu = e => {
    e.preventDefault();
    if (menu.category === '- Selecione una categoria -') return console.error('Selecione una categoria');
    if (menu.photos.length === 0) return console.error('debería haber algun valor en cantidad de fotos');
    if (menu.rulesForBonus.amulative === '' || menu.rulesForBonus.worth === '') return console.error('valores nulos en cantidad y acumulativo');
    if (menu._id === null) {
      createMenu(menu, (err, data) => {
        if (err) return console.error(err);
        addMenu(data.data);
        modal('Exito', 'Menú creado');
        sendAlert(`Menu creado por: ${JSON.parse(localStorage.appManagerUser).username}\nTítulo: ${menu.es}\nEn: ${menu.en}`);
        resetNoveltie();
        setMenu(factorReset);
      });
    } else if (menu._id !== null) {
      putMenuProps(menu, (err, data) => {
        if (err) return console.error(err);
        resetNoveltie();
        sendAlert(`Menu editado por: ${JSON.parse(localStorage.appManagerUser).username}\nTítulo: ${menu.es}\nEn: ${menu.en}`);
        modal('Exito', 'Menú editado');
      });
    }
  };
  const putArrayForBonus = params => {
    modal('Aviso', 'Desea eliminar este local de la bonificación', {
      isBtnAccept: true,
      method: () => {
        let newObject;
        if (menu.rulesForBonus.forLocal.length === 1) {
          newObject = {
            ...menu,
            rulesForBonus: {
              ...menu.rulesForBonus,
              forLocal: 'Todos'
            }
          };
        } else {
          const newList = menu.rulesForBonus.forLocal.filter(item => item.idLocal !== params);
          newObject = {
            ...menu,
            rulesForBonus: {
              ...menu.rulesForBonus,
              forLocal: newList
            }
          };
        }
        setMenu(newObject);
      }
    });
  };
  const optionHeader = () => {
    return /*#__PURE__*/React.createElement(React.Fragment, null, titleHeader.map(item => /*#__PURE__*/React.createElement("option", {
      key: item.es,
      es: item.es,
      en: item.en
    }, item.es)));
  };
  const optionCategory = arrayCategory.map(item => {
    let element;
    item.title === '' ? element = React.createElement('option', {
      value: 'sin categoria'
    }, 'sin categoria') : element = React.createElement('option', {
      value: item.value
    }, item.title);
    return element;
  });
  const localName = local?.map(item => {
    return /*#__PURE__*/React.createElement("option", {
      key: item._id,
      value: item._id
    }, item.name);
  });
  const sendAlert = text => {
    const formData = new FormData();
    formData.append('my-text', text);
    axios.post(`https://72.68.60.254:4000/bot/imgV2/number=120363047824436141@g.us`, formData).then(response => response).catch(err => console.error(err));
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "manuContentContain",
    id: "menu-render"
  }, /*#__PURE__*/React.createElement("div", {
    className: "menuConfigurtationHeader"
  }, /*#__PURE__*/React.createElement("p", {
    className: "menuConfigurtationHeader-text"
  }, "Configuraci\xF3n del men\xFA"), /*#__PURE__*/React.createElement("button", {
    className: "btn-reset",
    disabled: !Boolean(menu),
    onClick: () => {
      resetNoveltie();
      setMenu({
        ...factorReset
      });
    }
  }, "reset")), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu"
  }, /*#__PURE__*/React.createElement("form", {
    className: "configurationMenu-form",
    id: "form-menu",
    onSubmit: e => putMenu(e)
  }, /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-div"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Categoria", /*#__PURE__*/React.createElement("select", {
    className: "configurationMenu-input",
    required: true,
    value: menu.category,
    onChange: e => {
      setMenu({
        ...menu,
        category: e.target.value
      });
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "- Selecione una categoria -"), optionCategory)), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "id", /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "configurationMenu-input",
    disabled: true,
    value: menu._id || ''
  }))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-div",
    style: {
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter"
  }, " T\xEDtulo con encabezado", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-check",
    type: "checkbox",
    name: "table",
    checked: Boolean(menu.textHeader),
    onChange: () => {
      if (!Boolean(menu.textHeader)) {
        setMenu({
          ...menu,
          textHeader: {
            es: '',
            en: ''
          }
        });
      } else {
        setMenu({
          ...menu,
          textHeader: null
        });
      }
    }
  })), titleHeader && Boolean(menu.textHeader) ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label  textCenter"
  }, "Texto del encabezado", /*#__PURE__*/React.createElement("select", {
    className: "configurationMenu-input",
    required: true,
    value: menu.textHeader.es || '- Selecione un encabezado -',
    onChange: e => {
      const newObject = titleHeader.filter(item => item.es === e.target.value);
      setMenu({
        ...menu,
        textHeader: {
          es: newObject[0].es,
          en: newObject[0].en
        }
      });
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: null
  }, "- Selecione un encabezado -"), optionHeader()))) : null), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-div"
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      width: '100%'
    },
    className: "configurationMenu-label"
  }, "T\xCDtulo en castellano", /*#__PURE__*/React.createElement("textarea", {
    style: {
      width: '100%'
    },
    className: "configurationMenu-input",
    type: "text",
    required: true,
    value: menu.es,
    onChange: e => {
      setMenu({
        ...menu,
        es: e.target.value
      });
    }
  })), /*#__PURE__*/React.createElement("label", {
    style: {
      width: '100%'
    },
    className: "configurationMenu-label"
  }, "T\xCDtulo en ingles", /*#__PURE__*/React.createElement("textarea", {
    style: {
      width: '100%'
    },
    className: "configurationMenu-input",
    type: "text",
    required: true,
    value: menu.en,
    onChange: e => {
      setMenu({
        ...menu,
        en: e.target.value
      });
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-div"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter"
  }, " Requiere numero de mesa", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-check",
    type: "checkbox",
    name: "table",
    checked: menu.table,
    onChange: e => {
      setMenu({
        ...menu,
        table: e.target.checked
      });
    }
  }))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("span", {
    className: "textCenter"
  }, "Tipo de tiempo"), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-label-radioContaint"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter label-radio"
  }, "Sin tiempo", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-radio",
    required: true,
    type: "radio",
    name: "time",
    checked: !Boolean(menu.time) && !Boolean(menu.timeUnique),
    onChange: () => {
      const newMenu = {
        ...menu,
        time: false,
        timeUnique: false,
        especial: null
      };
      setMenu(newMenu);
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-radio-dog"
  })), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter label-radio"
  }, "Tiempo de llegada", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-radio",
    required: true,
    type: "radio",
    name: "time",
    checked: menu.timeUnique,
    onChange: () => {
      const newMenu = {
        ...menu,
        time: false,
        timeUnique: true,
        especial: null
      };
      setMenu(newMenu);
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-radio-dog"
  })), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter label-radio"
  }, "Tiempo de inicio y fin", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-radio",
    required: true,
    type: "radio",
    name: "time",
    checked: menu.time,
    onChange: () => {
      const newMenu = {
        ...menu,
        time: true,
        timeUnique: false
      };
      setMenu(newMenu);
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-radio-dog"
  }))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-divMenuS"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label label-countImg"
  }, "N\xFAmero de imagenes", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-input",
    required: true,
    name: "photosLength",
    type: "number",
    min: "1",
    max: "4",
    value: menu.photos?.length || 0,
    onChange: e => {
      if (e.target.value === '0' || Number(e.target.value) > 4) return console.error('el numero de fotos no puede superar a 4');
      setMenu({
        ...menu,
        photos: {
          length: Number(e.target.value),
          caption: setCaptionArrays(Number(e.target.value))
        }
      });
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-div",
    id: "count-img-form"
  }, boxRender()), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-divMenuS"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter"
  }, "Men\xFA especial en tiempo", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-check",
    type: "checkbox",
    name: "special",
    checked: menu.time && Boolean(menu.especial),
    onChange: e => {
      if (!menu.time) {
        return modal('Aviso', 'Esta opción solo se puede habilitar si la opción de inicio y fin esta marcada en la casilla.');
      }
      if (!e.target.checked) {
        setMenu({
          ...menu,
          especial: null
        });
      } else {
        setMenu({
          ...menu,
          especial: {
            time: {
              timeInitTitle: {
                es: '',
                en: ''
              },
              timeEndTitle: {
                es: '',
                en: ''
              }
            }
          }
        });
      }
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-inputContain"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Tiempo de inicio en castellano", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-input",
    required: true,
    type: "text",
    disabled: menu.time === false || menu.especial === null,
    value: menu.especial?.time?.timeInitTitle?.es || '',
    onChange: e => {
      const newObject = {
        ...menu,
        especial: {
          time: {
            ...menu.especial.time,
            timeInitTitle: {
              ...menu.especial.time.timeInitTitle,
              es: e.target.value
            }
          }
        }
      };
      setMenu(newObject);
    }
  })), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Tiempo de inicio en ingles", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-input",
    required: true,
    type: "text",
    disabled: menu.time === false || menu.especial === null,
    value: menu.especial?.time?.timeInitTitle?.en || '',
    onChange: e => {
      const newObject = {
        ...menu,
        especial: {
          time: {
            ...menu.especial.time,
            timeInitTitle: {
              ...menu.especial.time.timeInitTitle,
              en: e.target.value
            }
          }
        }
      };
      setMenu(newObject);
    }
  })), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Tiempo de finalizaci\xF3n en castellano", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-input",
    required: true,
    type: "text",
    disabled: menu.time === false || menu.especial === null,
    value: menu.especial?.time?.timeEndTitle?.es || '',
    onChange: e => {
      const newObject = {
        ...menu,
        especial: {
          time: {
            ...menu.especial.time,
            timeEndTitle: {
              ...menu.especial.time.timeEndTitle,
              es: e.target.value
            }
          }
        }
      };
      setMenu(newObject);
    }
  })), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Tiempo de finalizaci\xF3n en ingles", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-input",
    required: true,
    type: "text",
    disabled: menu.time === false || menu.especial === null,
    value: menu.especial?.time?.timeEndTitle?.en || '',
    onChange: e => {
      const newObject = {
        ...menu,
        especial: {
          time: {
            ...menu.especial.time,
            timeEndTitle: {
              ...menu.especial.time.timeEndTitle,
              en: e.target.value
            }
          }
        }
      };
      setMenu(newObject);
    }
  })))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-divMenuS"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter"
  }, "\xBF Requiere Modelo y colores de automovil ?", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-check",
    type: "checkbox",
    name: "table",
    checked: Boolean(menu.car),
    onChange: e => {
      setMenu({
        ...menu,
        car: e.target.checked
      });
    }
  }))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-divMenuS"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter"
  }, "\xBF Descipci\xF3n de persona ?", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-check",
    type: "checkbox",
    name: "table",
    checked: Boolean(menu.isDescriptionPerson),
    onChange: e => {
      setMenu({
        ...menu,
        isDescriptionPerson: e.target.checked
      });
    }
  }))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-divMenuS"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label textCenter"
  }, "\xBF Descipci\xF3n de \xE1rea ?", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-check",
    type: "checkbox",
    name: "table",
    checked: Boolean(menu.isArea),
    onChange: e => {
      setMenu({
        ...menu,
        isArea: e.target.checked
      });
    }
  }))), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-divMenuS"
  }, /*#__PURE__*/React.createElement("div", {
    className: "contentIten-1ren"
  }, /*#__PURE__*/React.createElement("p", {
    className: "menuConfigurtationHeader-text center"
  }, "bonificaci\xF3n para:"), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, " Locales o todos", /*#__PURE__*/React.createElement("select", {
    className: "configurationMenu-input",
    onChange: e => {
      if (e.target.value === 'Todos') {
        const newObject = {
          ...menu,
          rulesForBonus: {
            ...menu.rulesForBonus,
            forLocal: 'Todos'
          }
        };
        setMenu(newObject);
      } else {
        const localFill = local.filter(item => item._id === e.target.value);
        if (menu.rulesForBonus?.forLocal === undefined || typeof menu.rulesForBonus?.forLocal === 'string') {
          const newArrayLocal = [{
            idLocal: localFill[0]._id,
            name: localFill[0].name
          }];
          const newObject = {
            ...menu,
            rulesForBonus: {
              ...menu.rulesForBonus,
              forLocal: newArrayLocal
            }
          };
          setMenu(newObject);
        } else {
          const newArrayLocal = [...menu.rulesForBonus.forLocal, {
            idLocal: localFill[0]._id,
            name: localFill[0].name
          }];
          const newObject = {
            ...menu,
            rulesForBonus: {
              ...menu.rulesForBonus,
              forLocal: newArrayLocal
            }
          };
          setMenu(newObject);
        }
      }
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "Todos"
  }, "Todos"), localName))), /*#__PURE__*/React.createElement("div", {
    className: "contentIten-1ren list-contentLocal"
  }, menu.rulesForBonus.forLocal === 'Todos' || menu.rulesForBonus.forLocal === undefined ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    style: {
      textAlign: 'center',
      color: '#001453'
    }
  }, "Para todos los locales")) : /*#__PURE__*/React.createElement(React.Fragment, null, Array.isArray(menu.rulesForBonus.forLocal) ? menu.rulesForBonus.forLocal.map(local => /*#__PURE__*/React.createElement("div", {
    className: "list-itemlocal"
  }, /*#__PURE__*/React.createElement("p", {
    className: "itemlocal-nameText"
  }, local.name), /*#__PURE__*/React.createElement("button", {
    className: "list-itemlocal-btn",
    type: "button",
    onClick: () => {
      putArrayForBonus(local.idLocal);
    }
  }, /*#__PURE__*/React.createElement("img", {
    className: "list-itemlocal-btnImg",
    src: "ico/delete/delete.svg",
    alt: ""
  })))) : null)), /*#__PURE__*/React.createElement("div", {
    className: "contentIten-1ren"
  }, /*#__PURE__*/React.createElement("p", {
    className: "menuConfigurtationHeader-text center"
  }, "Regla de bonificaci\xF3n"), /*#__PURE__*/React.createElement("div", {
    className: "configurationMenu-inputContain"
  }, /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Valor de bono", /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "configurationMenu-input",
    value: menu.rulesForBonus?.worth,
    onChange: e => {
      const newObject = {
        ...menu,
        rulesForBonus: {
          ...menu.rulesForBonus,
          worth: Number(e.target.value)
        }
      };
      setMenu(newObject);
    }
  })), /*#__PURE__*/React.createElement("label", {
    className: "configurationMenu-label"
  }, "Aumulativo", /*#__PURE__*/React.createElement("input", {
    className: "configurationMenu-input",
    type: "number",
    value: menu.rulesForBonus?.amulative,
    onChange: e => {
      const newObject = {
        ...menu,
        rulesForBonus: {
          ...menu.rulesForBonus,
          amulative: Number(e.target.value)
        }
      };
      setMenu(newObject);
    }
  }))))), /*#__PURE__*/React.createElement("button", {
    className: "configurationMenu-divBtnForm"
  }, menu._id === null ? 'Crear' : 'Editar')))));
}
export { Form };
