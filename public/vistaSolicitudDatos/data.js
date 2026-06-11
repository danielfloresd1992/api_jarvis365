'use stric';
function screenRender(x){
    if(x === 2){
        render()
        createWindowsResult()
    }
    if(x === 1){
        if(selec.value === 'Seleccione un establecimiento' || selecDia.value === 'Seleccione el dia'){ 
            alerta('Aviso', 'Por favor selecione la franquicia y el dia a culsurtar');
            btnSubmit2.disabled = false;
            body.style.cursor = 'default';
        }
        else{
            render();
            renderTable();
            selecDia = document.getElementById('dia');
            selec = document.getElementById('local')
        }
    }
}
function render(){
    const body = document.getElementById('body');
    const article = document.createElement('article');
    const button = document.createElement('button');
    body.style.cursor = 'wait'
    article.setAttribute('id', 'result');
    article.setAttribute('class', 'result');
    button.setAttribute('id', 'btn-deleted');
    button.setAttribute('class', 'btn-deleted');
    button.textContent = 'X'
    article.appendChild(button);
    body.appendChild(article);
}
function renderTable(){
    const table = document.createElement('table');
    const result = document.getElementById('result');
    table.setAttribute('id','myTable');
    table.setAttribute('class','myTable');
    result.appendChild(table);
    createWindowsResult2();
}


async function showLocal(){
    body.style.cursor = 'wait'
    const url = ['https://72.68.60.254/locales', `https://${window.location.hostname}/locales`];
    const options = {
    method: 'GET',
    mode: 'cors',
    headers: new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
     }),
    }
    await fetch(url[0], options)
        .then(response => response.json())
        .catch(error => {
            headerText.removeChild(document.getElementById('child-firt'));
            const fragment = document.createDocumentFragment();
            const h2 = document.createElement('h2');
            h2.setAttribute('id', 'child-firt');
            h2.appendChild(document.createTextNode('Sin acceso a la base de datos'));
            fragment.appendChild(h2);
            headerText.appendChild(fragment);
            alerta('Error 505', 'No se pudo conectar al servidor. ' + error);
            body.style.cursor = 'default';
        })
        .then(local => {
            const fragmentTable = document.createDocumentFragment();
            const list = document.createElement('table');
            const tr = document.createElement('tr');
            const th1 = document.createElement('th');
            th1.appendChild(document.createTextNode('Id'));
            const th2 = document.createElement('th');
            th2.appendChild(document.createTextNode('Franquicia'));
            const th3 = document.createElement('th');
            th3.appendChild(document.createTextNode('Nº de franquicia'));
            const th4 = document.createElement('th');
            th4.appendChild(document.createTextNode('Estado'));
            tr.appendChild(th1);
            tr.appendChild(th2);
            tr.appendChild(th3);
            tr.appendChild(th4);
            list.appendChild(tr);
            let textNode;
            const selecLocal = document.getElementById('local');
            local.forEach(element => {
                let node1 = document.createElement('tr');
                let node2 = document.createElement('td');
                node2.appendChild(document.createTextNode(`${element.Id}`));
                if(element.Id === 'BH'){
                    element.Id.substring(8, 0)
                }
                let options = document.createElement('option');
                options.appendChild(document.createTextNode(element.Id));
                selecLocal.appendChild(options);
                
                node1.appendChild(node2);
                let node3 = document.createElement('td');
                node3.appendChild(
                    document.createTextNode(`${element.Franquicia}`)
                );
                node1.appendChild(node3);
                let node4 = document.createElement('td');
                node4.appendChild(
                    document.createTextNode(`${element.Localidad}`)
                );
                node1.appendChild(node4);
                let node5 = document.createElement('td');
                node5.appendChild(
                    document.createTextNode(`${element.Estado}`)
                );
                node1.appendChild(node5);
                list.appendChild(node1);
            });
            headerText.removeChild(document.getElementById('child-firt'));
            const fragment = document.createDocumentFragment();
            const h2 = document.createElement('h2');
            const span = document.createElement('span');
            h2.setAttribute('id', 'child-firt');
            h2.appendChild(document.createTextNode('Conectado a la base de datos '));
            span.appendChild(document.createTextNode('■'))
            h2.appendChild(span);
            fragment.appendChild(h2);
            headerText.appendChild(fragment);
            fragmentTable.appendChild(list);
            bodyElementHtml.appendChild(fragmentTable);
            body.style.cursor = 'default';
        });
};

async function createWindowsResult(){
    const url = ['https://72.68.60.254/getcorteDoc365', `https://${window.location.hostname}/getcorteDoc365`];
    const options = {
        method: 'GET',
        mode: 'cors',
        headers: new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    })};
    await fetch(url[0], options)
        .then(response => response.json())
        .then(response => {
            const body = document.getElementById('body');
            const result = document.getElementById('result');
            response.forEach(response => {
                let sheet = document.createDocumentFragment();
                let div = document.createElement('article');
                let h3 = document.createElement('h3');
                let hr = document.createElement('hr');
                let br = document.createElement('br');
                let img = document.createElement('img');
                let S;
                img.setAttribute('class', 'pngDownload');
                img.src = '../ico/pngDownload/1x/outline_save_alt_black_24dp.png';
                h3.appendChild(document.createTextNode(`Fecha del corte: ${response.Date}`));
                h3.appendChild(img);
                div.appendChild(h3);
                div.appendChild(hr);
                div.appendChild(br);
                response.Corte.forEach(element => {
                   let p1 = document.createElement('span');
                   let b = document.createElement('br');
                   p1.appendChild(document.createTextNode(`Local: ${element.Local}`))
                   div.appendChild(p1)
                   div.appendChild(b)
                   div.appendChild(b)
                   let p2 = document.createElement('p');
                   p2.appendChild(
                    document.createTextNode(`Rotaciones: ${element.Rotaciones}`)
                   )
                   if(element.Local === 'LF'){
                       a = 'Sommelier'
                   }
                   else{
                       a = 'Asistent 2'
                   }
                   div.appendChild(p2)
                   let p3 = document.createElement('p');
                   p3.appendChild(
                    document.createTextNode(`Procesos: ${element.Procesos}`)
                   )
                   div.appendChild(p3)
                   if(element.G1 !== 'N/A'){
                        let p4 = document.createElement('p');
                        p4.appendChild(
                            document.createTextNode(`Gerente 1: ${element.G1}`)
                        )
                        div.appendChild(p4)
                   }
                   if(element.G2 !== 'N/A'){
                        let p5 = document.createElement('p');
                        p5.appendChild(
                            document.createTextNode(`Gerente 2: ${element.G2}`)
                        )
                        div.appendChild(p5)
                    }
                    if(element.G3 !== 'N/A'){
                        let p6 = document.createElement('p');
                        p6.appendChild(
                            document.createTextNode(`Gerente 3: ${element.G3}`)
                        )
                        div.appendChild(p6)
                    }
                    if(element.G4 !== 'N/A'){
                        let p7 = document.createElement('p');
                        p7.appendChild(
                            document.createTextNode(`Gerente 4: ${element.G4}`)
                        )
                        div.appendChild(p7)
                    }
                    if(element.A1 !== 'N/A'){
                        let p8 = document.createElement('p');
                        p8.appendChild(
                            document.createTextNode(`${a}: ${element.A1}`)
                        )
                        div.appendChild(p8)
                    }
                    if(element.A2 !== 'N/A'){
                        let p9 = document.createElement('p');
                        p9.appendChild(
                            document.createTextNode(`Asistente 2: ${element.A2}`)
                        )
                        div.appendChild(p9)
                    }
                    if(element.A3 !== 'N/A'){
                        let p10 = document.createElement('p');
                        p10.appendChild(
                            document.createTextNode(`Asistente 3: ${element.A3}`)
                        )
                        div.appendChild(p10)
                    }
                    if(element.A4 !== 'N/A'){
                        let p11 = document.createElement('p');
                        p11.appendChild(
                            document.createTextNode(`Asistente 4: ${element.A4}`)
                        )
                        div.appendChild(p11)
                    }
                    
                    let b12 = document.createElement('br');
                    div.appendChild(b12)
            })
            sheet.appendChild(div);
            result.appendChild(sheet); 
        });
        selecDia = document.getElementById('dia');
        selec = document.getElementById('local');
        body.style.cursor = 'default';
        console.error('Loading data %c Sucess! ', 'background: #222; color: #bada55 '  );
    });
}

async function createWindowsResult2(){
    const options = {
        method: 'GET',
        mode: 'cors',
        headers: new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    })};
    selecDia = document.getElementById('dia');
    selec = document.getElementById('local');
    let value1 = selec.value;
    let value2 = selecDia.value;
    const url = ['https://72.68.60.254/getcorteDate365',`https://${window.location.hostname}/getcorteDate365`];
    await fetch(url[0], options)
        .then(response => response.json())
        .catch(error =>{
            alerta('Error 505', 'No se pudo conectar al servidor. ' + error);
            btnSubmit2.disabled = false;
            body.style.cursor = 'default';
        })
        .then(local => {
            btnSubmit2.disabled = false;
            body.style.cursor = 'default';
            const myTable = document.getElementById('myTable');
            const fragment = document.createDocumentFragment();
            const tr = document.createElement('tr');
            const th0 = document.createElement('th');
            th0.appendChild(document.createTextNode('Fecha'));
            const th1 = document.createElement('th');
            th1.appendChild(document.createTextNode('Id'));
            const th2 = document.createElement('th');
            th2.appendChild(document.createTextNode('Rotaciones'));
            const th3 = document.createElement('th');
            th3.appendChild(document.createTextNode('Procesos'));
            const th4 = document.createElement('th');
            th4.appendChild(document.createTextNode('G1'));
            const th5 = document.createElement('th');
            th5.appendChild(document.createTextNode('G2'));
            const th6 = document.createElement('th');
            th6.appendChild(document.createTextNode('G3'));
            const th7 = document.createElement('th');
            th7.appendChild(document.createTextNode('G4'));
            const th8 = document.createElement('th');
            th8.appendChild(document.createTextNode('A1'));
            const th9 = document.createElement('th');
            th9.appendChild(document.createTextNode('A2'));
            const th10 = document.createElement('th');
            th10.appendChild(document.createTextNode('A3'));
            const th11 = document.createElement('th');
            th11.appendChild(document.createTextNode('A4'));
            const th12 = document.createElement('th');
            th12.appendChild(document.createTextNode('GR'));
            tr.appendChild(th0);
            tr.appendChild(th1);
            tr.appendChild(th2);
            tr.appendChild(th3);
            tr.appendChild(th4);
            tr.appendChild(th5);
            tr.appendChild(th6);
            tr.appendChild(th7);
            tr.appendChild(th8);
            tr.appendChild(th9);
            tr.appendChild(th10);
            tr.appendChild(th11);
            tr.appendChild(th12);
            fragment.appendChild(tr);
            local.forEach(element => {
                if(element.Local ===  value1 &&  element.Date.Dia === value2){
                    let node1 = document.createElement('tr');
                    let node1_1 = document.createElement('td');
                    node1_1.appendChild(
                        document.createTextNode(`${element.Date.Dia} / ${element.Date.Fecha} / ${element.Date.Hora}`)
                    );
                    if((Number(element.Date.Hora.substring(2, 0))) === 16 || (Number(element.Date.Hora.substring(2, 0))) === 17){
                        node1_1.style.color = 'rgb(228, 0, 0)';
                        node1_1.setAttribute('title', 'Ultimos corte diurno.')
                    }
                    node1.appendChild(node1_1);
                    let node2 = document.createElement('td');
                    node2.appendChild(
                        document.createTextNode(`${element.Local}`)
                    );
                    node1.appendChild(node2);      
                    let node3 = document.createElement('td');
                    node3.appendChild(
                        document.createTextNode(`${element.Rotaciones}`)
                    );
                    node1.appendChild(node3);
                    let node4 = document.createElement('td');
                    node4.appendChild(
                        document.createTextNode(`${element.Procesos}`)
                    );
                    node1.appendChild(node4);
                    let node5 = document.createElement('td');
                    node5.appendChild(
                        document.createTextNode(`${element.G1}`)
                    );
                    node1.appendChild(node5);
                    let node6 = document.createElement('td');
                    node6.appendChild(
                    document.createTextNode(`${element.G2}`)
                    );
                    node1.appendChild(node6);
                    let node7 = document.createElement('td');
                    node7.appendChild(
                        document.createTextNode(`${element.G3}`)
                    );
                    node1.appendChild(node7);
                    let node8 = document.createElement('td');
                    node8.appendChild(
                        document.createTextNode(`${element.G4}`)
                    );
                    node1.appendChild(node8);
                    let node9 = document.createElement('td');
                    node9.appendChild(
                        document.createTextNode(`${element.A1}`)
                    );
                    node1.appendChild(node9);
                    let node10 = document.createElement('td');
                    node10.appendChild(
                            document.createTextNode(`${element.A2}`)
                    );
                    node1.appendChild(node10);
                    let node11 = document.createElement('td');
                    node11.appendChild(
                        document.createTextNode(`${element.A3}`)
                    );
                    node1.appendChild(node11);
                    let node12 = document.createElement('td');
                    node12.appendChild(
                        document.createTextNode(`${element.A4}`)
                    );
                    node1.appendChild(node12);
                    let node13 = document.createElement('td');
                    node13.appendChild(
                        document.createTextNode(`${element.GR}`)
                    );
                    node1.appendChild(node13);
                    fragment.appendChild(node1);
                    myTable.appendChild(fragment);
                }
            })
    })
    
}

