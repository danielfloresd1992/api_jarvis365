
class WindowLoanding {

    constructor(elementHtml, style) {
       
        if (typeof elementHtml !== 'object' || elementHtml === null) throw 'parameter of must be an html tag';

        this.elementHtml = elementHtml;
        this.ballColor = style.ballColor || '#646464';
        this.tag;
        this.text;
    }

    insertStyle() {
        const style = document.createElement('style');
        const text = document.createTextNode(`
        .awaitContain {
            z-index: 100;
            position: fixed;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            align-items: center;
            justify-content: center;
            background-color: #00000094;
            backdrop-filter: blur(3px);
        }
        .textAwait {
            font-size: 2rem;
            color: #00E611;
        }
        .lds-roller {
            display: inline-block;
            position: relative;
            width: 80px;
            height: 80px;
        }
        .lds-roller div {
            animation: lds-roller 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
            transform-origin: 40px 40px;
        }
        .lds-roller div:after {
            content: " ";
            display: block;
            position: absolute;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: ${this.ballColor};
            margin: -4px 0 0 -4px;
        }
        .lds-roller div:nth-child(1) {
            animation-delay: -0.036s;
        }
        .lds-roller div:nth-child(1):after {
            top: 63px;
            left: 63px;
        }
        .lds-roller div:nth-child(2) {
             animation-delay: -0.072s;
        }
        .lds-roller div:nth-child(2):after {
            top: 68px;
            left: 56px;
        }
        .lds-roller div:nth-child(3) {
            animation-delay: -0.108s;
        }
        .lds-roller div:nth-child(3):after {
            top: 71px;
            left: 48px;
        }
        .lds-roller div:nth-child(4) {
            animation-delay: -0.144s;
        }
        .lds-roller div:nth-child(4):after {
            top: 72px;
            left: 40px;
        }
        .lds-roller div:nth-child(5) {
            animation-delay: -0.18s;
        }
        .lds-roller div:nth-child(5):after {
            top: 71px;
            left: 32px;
        }
        .lds-roller div:nth-child(6) {
            animation-delay: -0.216s;
        }
        .lds-roller div:nth-child(6):after {
            top: 68px;
            left: 24px;
        }
        .lds-roller div:nth-child(7) {
            animation-delay: -0.252s;
        }
        .lds-roller div:nth-child(7):after {
            top: 63px;
            left: 17px;
        }
        .lds-roller div:nth-child(8) {
            animation-delay: -0.288s;
        }
        .lds-roller div:nth-child(8):after {
            top: 56px;
            left: 12px;
        }
        @keyframes lds-roller {
          0% {
                transform: rotate(0deg);
          }
          100% {
                transform: rotate(360deg);
          }
        }`)
        style.appendChild(text);
        this.elementHtml.appendChild(style);
    };

    changeText(text) {
        if (typeof text !== 'string') throw 'params is not type string';
        this.text.textContent = text;
    }

    createWindow(text) {
        if (this.tag !== undefined) {
            this.text.textContent = text;
            return this.elementHtml.appendChild(this.tag);
        }
        this.tag = document.createElement('div');
        this.tag.classList.add('awaitContain');
        this.text = document.createElement('p');
        this.text.classList.add('textAwait');
        this.text.textContent = text;
        let awaitBall = document.createElement('div');
        awaitBall.classList.add('lds-roller')
        for (let i = 0; i < 7; i++) {
            let div = document.createElement('div');
            awaitBall.appendChild(div);
        }
        this.tag.appendChild(this.text);
        this.tag.appendChild(awaitBall);
        this.elementHtml.appendChild(this.tag);
    };

    closeWindowAwait() {
        if (this.tag === undefined) throw 'inicializa primero con el metodo createWindow';
        this.tag.remove();
    };
}

export { WindowLoanding };