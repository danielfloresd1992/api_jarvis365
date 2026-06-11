import { DomManipulation } from '/utils/createHtml.js';


function docDeleted(data){
    const text = DomManipulation.createHtml('p', { class: 'text-ElementDeleted' }, 'Publicación eliminada' );
    const subText = DomManipulation.createHtml('p', { class: 'text-ElementDeleted' }, `por ${data.updateFor.username}` );
    const textContent = DomManipulation.createHtml('div', { class: 'textContain-ElementDeleted' }, '', [ text, subText ]);
    const frangment = DomManipulation.createHtml('div', { class: 'divContentNovelties' }, '' , [ textContent ]);
    
    return frangment;
}


export { docDeleted };