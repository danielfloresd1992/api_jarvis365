const {
  useState,
  useEffect,
  useRef
} = React;
import { createHtml } from '/utils/createHtml.js';
import { arrayBufferToBase64 } from '/utils/arrayTo64.js';
import DataFormart from '/Lobby/assets/utils/dateFormat.js';
function RenderBtnPaginate({
  selectPage,
  numberPage
}) {
  const addValueBtn = useRef(0);
  const subtractValueBtn = useRef(0);
  const buttons = [];
  let limit = 4;
  const paginate = target => {
    const id = target.getAttribute('id');
    if (id === 'prev-paginate') {
      if (numberPage >= 0) {
        selectPage(numberPage - 1);
      }
    } else if (id === 'next-paginate') {
      selectPage(numberPage + 1);
    }
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };
  const paginateAndCalculateBtn = (target, number) => {
    selectPage(number);
    const btnValue = Number(target.textContent);
    console.log(btnValue);
    console.log(numberPage);
    console.log(btnValue < numberPage);
    if (btnValue > numberPage && btnValue > 3) {
      ;
      if (btnValue - 1 === number) {
        addValueBtn.current = addValueBtn.current + 1;
        subtractValueBtn.current = subtractValueBtn.current + 1;
      }
    } else if (btnValue < numberPage) {
      if (numberPage - 2 === btnValue) {
        ;
        addValueBtn.current = addValueBtn.current - 1;
        subtractValueBtn.current = subtractValueBtn.current - 1;
        console.log(`numero del boton ${btnValue}`);
        console.log(numberPage + ' ' + btnValue);
        ;
      }
    }
    window.scrollTo({
      //top: 0,
      behavior: 'smooth'
    });
  };
  const printBtn = () => {
    for (let i = subtractValueBtn.current; i <= limit + addValueBtn.current; i++) {
      buttons.push( /*#__PURE__*/React.createElement("button", {
        key: i,
        onClick: e => {
          paginateAndCalculateBtn(e.target, i);
        },
        className: numberPage === i ? 'contentButton-btn btn_ispage' : 'contentButton-btn'
      }, i + 1));
    }
    return buttons;
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "componentPaginate"
  }, /*#__PURE__*/React.createElement("div", {
    className: "contentButton"
  }, /*#__PURE__*/React.createElement("button", {
    className: "contentButton-btn",
    id: "prev-paginate",
    onClick: e => paginate(e.target)
  }, '<'), printBtn(), /*#__PURE__*/React.createElement("button", {
    className: "contentButton-btn",
    id: "next-paginate",
    onClick: e => paginate(e.target)
  }, '>'))));
}
;
function Noveltie({
  dataNoveltie,
  localData
}) {
  const [noveltieFull, setNoveltieFull] = useState(null);
  const menuRef = useRef(null);
  useEffect(() => {
    axios.get(`https://${window.location.host}/novelties/img/id=${dataNoveltie._id}`).then(response => {
      if (response.status === 200) {
        setNoveltieFull(response.data[0]);
      }
    }).catch(err => {
      console.log(err);
    });
  }, [dataNoveltie]);
  const parseMenu = menu => {
    const menuNoveltie = menu.replaceAll('*', '').replaceAll('_', '').split('\n');
    return menuNoveltie.join('\n');
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties",
    idpublisher: "",
    id: "",
    title: ""
  }, /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties-divTitle"
  }, /*#__PURE__*/React.createElement("img", {
    className: "divContentNovelties-img",
    src: arrayBufferToBase64(localData.img.data.data, 'image/png'),
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties-textContain"
  }, /*#__PURE__*/React.createElement("p", {
    className: "divContentNovelties-pTitle"
  }, dataNoveltie.title), /*#__PURE__*/React.createElement("p", {
    className: "divContentNovelties-pDate"
  }, DataFormart.formatDateApp(dataNoveltie.date), /*#__PURE__*/React.createElement("img", {
    className: "divContentNovelties-pDateImg",
    src: "ico/clock/clock.svg"
  })))), noveltieFull ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties-contentText",
    style: {
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "divContentNovelties-text"
  }, /*#__PURE__*/React.createElement("p", null, noveltieFull.local.name)), /*#__PURE__*/React.createElement("p", {
    className: "divContentNovelties-text divContentNovelties-viewMenu",
    onClick: e => {
      if (menuRef.current.className === 'none') {
        menuRef.current.className = 'divContentNovelties-text divContentNovelties-menuContain';
        e.target.textContent = 'Ocultar menú';
      } else {
        menuRef.current.className = 'none';
        e.target.textContent = 'Mostrar menú';
      }
    }
  }, "mostrar menu men\xFA")), /*#__PURE__*/React.createElement("div", {
    className: "none",
    ref: menuRef
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "divContentNovelties-text textMenu scrolltheme1",
    disabled: true
  }, parseMenu(noveltieFull.menu))), /*#__PURE__*/React.createElement("div", {
    classNane: "divContentNovelties-carouselDiv"
  }, /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties-imgDiv center divContentNovelties-carouselDiv--bgBlack"
  }, noveltieFull.fileNoveltie.files[0].contentType === 'video/mp4' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("video", {
    className: "divContentNovelties-carouselImg",
    controls: true
  }, /*#__PURE__*/React.createElement("source", {
    src: arrayBufferToBase64(noveltieFull.fileNoveltie.files[0].data.data, noveltieFull.fileNoveltie.files[0].contentType),
    autoplay: true
  }))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("img", {
    className: "divContentNovelties-carouselImg divContentNovelties-carouselImg--midWid",
    src: arrayBufferToBase64(noveltieFull.fileNoveltie.files[0].data.data, noveltieFull.fileNoveltie.files[0].contentType),
    alt: ""
  }))))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties-boxAwait"
  }, /*#__PURE__*/React.createElement("div", {
    class: "divContentNovelties-boxAwaitspinner"
  })))));
}
;
function Publisher({
  local
}) {
  const [page, setPage] = useState(0);
  const [noveltie, setNoveltie] = useState(null);
  const selectPage = numberPage => {
    setPage(numberPage);
  };
  useEffect(() => {
    axios.get(`https://${window.location.host}/noveltie/local=${local.name}/since=${0}/until=${0}/page=${34}`).then(response => {
      if (response.status === 200) {
        const newNoveltie = response.data.novelties.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateB - dateA;
        });
        setNoveltie({
          data: newNoveltie,
          count: response.data.total
        });
      }
    }).catch(err => {
      console.log(err);
    });
  }, [/*// page */]);
  console.log(`la pagina es la siguiente: ${page}`);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
    className: "aside-contents forTable"
  }, noveltie ? /*#__PURE__*/React.createElement("div", {
    className: "main-contain",
    style: {
      width: '100%',
      marginTop: 'unset',
      padding: '.5rem'
    }
  }, noveltie.data.map(result => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Noveltie, {
    dataNoveltie: result,
    localData: local
  }))), /*#__PURE__*/React.createElement(RenderBtnPaginate, {
    selectPage: selectPage,
    numberPage: page
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "divContentNovelties-boxAwait"
  }, /*#__PURE__*/React.createElement("div", {
    class: "divContentNovelties-boxAwaitspinner"
  })))));
}
export default Publisher;
