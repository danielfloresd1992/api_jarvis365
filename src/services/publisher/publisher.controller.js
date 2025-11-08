const controller = {};
import publisherLayer from './publisher.layer.js';
import colors from 'colors';



controller.setPublisher = async ( req, res ) => {
    try {
        const publication = await publisherLayer.createPublication(req.body);
        res.status(200).send('ok');
    } 
    catch(err){
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getAllPublisher = async ( req, res ) => {
    try {
        
        const publications = await publisherLayer.getAllPublisher();
        return res.json(publications);
        
    } 
    catch(err){
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getPublisherAndArticle = async ( req, res ) => {
    try {
        const id = req.params.id;
        const publisher = await publisherLayer.getPublisherAndArticle(id);
        return res.json(publisher);
    } 
    catch(err){
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getPublisherPaginate = async ( req, res ) => {
    try {
        const page = req.params.page;
        const number = req.params.items;
        const paginate = await publisherLayer.getPublisherPaginate(page, number);
        return res.json(paginate);
    } 
    catch(err){
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getPublisherSearch = async ( req, res ) => {
    try {
        const text = req.params.search;
        const page = req.params.page;
        const numberItems = req.params.numberItems;

        console.log(text);

        const result = await publisherLayer.searchPublishers(text, page, numberItems);
        return res.json(result);
    } 
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};



controller.deletedPublisher = async (req, res) => {
    try{
        

        if(!req.session.name) return res.status(401).send('Debe loguearse para realizar esta operación');
        if(!req.session.super || !req.session.admin){
            console.log(colors.bgRed(`Alguien o algo a intentado acceder a un recurso sin tener los permisos suficientes`.black));
            return res.status(403).send('No cuentas con los permisos suficientes para esta transacción');
        }

        return res.status(410).send('This API endpoint is deprecated.');


        const id = req.params.id;
        const result = await publisherLayer.deletePublisher(id);
        return res.json(result);
    }
    catch(err){
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
}


controller.deleted = async (req, res) => {
    try{
       
        const id = req.params.id;
        const result = await publisherLayer.deletePublisher(id);
        return res.status(201).json(result);
    }
    catch(err){
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
}


export default controller;