const controller = {};
import FranchiseModel from './franchise.model.js';
import LocalModel from '../local/local.model.js';
import colors from 'colors';


controller.getAllFranchise = (req, res) => {
    FranchiseModel.find()
        .then(franchise => {
            console.log(colors.bgCyan('Cierta aplicación a realizado una petición a la colección Franchise'.black));
            return res.json(franchise).status(200);
        })
        .catch(error => {
            console.log(error.red)
            return res.status(500).json({ error: 'Bad request', status: 500, message: error });
        });
};





controller.getEstablishments = async (req, res) => {
    try {
        const nameFranchiseParams = req.params.name;
        const resFranchise = await FranchiseModel.findOne({ name: nameFranchiseParams })
        console.log(resFranchise);
        if (!resFranchise) return res.status(404).json({ error: 'There are no documents related to the name received' });

        const resultEstablishments = await LocalModel.find({ 'franchiseReference.name_franchise': nameFranchiseParams }).select('name _id order status');
        const result = { franchise: resFranchise, establishments: resultEstablishments };


        return res.status(200).json(result);
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Bad request', status: 500, message: error });
    }
};



controller.setFranchise = async (req, res) => {
    try {

        const body = req.body;
        if (body['name'] === '' || body['name'] === undefined) return res.status(400).send('El nombre esta vacio');
        const findFranchise = await FranchiseModel.findOne({ name: body['name'] });

        if (findFranchise) return res.status(409).json({ status: 409, error: 'conflict', message: `There is a resource called ${body['name']}` })

        const newFranchise = new FranchiseModel({
            name: body['name'],
            location: body['location']
        });

        const resultSave = await newFranchise.save();

        console.log(colors.bgCyan(`Franquicia ${body['name']} guardado a la colección de Franchise`.black));

        return res.json({ message: 'created resource', status: 200, data: resultSave }).status(200);

    }
    catch (error) {
        console.log(colors.bgRed(`Error al guardar ${body.name} a la colección Franchise`.black));
        console.log(err);
        return res.status(500).json({ error: 'Bad request', status: 500, message: error });
    }
};




controller.deleteFranchise = async (req, res) => {
    try {

        const id = req.params.id;

        const franchise = await FranchiseModel.findOne({ _id: id });

        if (!franchise) return res.status(404).json

        let localsCount = await LocalModel.countDocuments({ idLocal: franchise.id });
       
        if (localsCount > 0) return res.status(409).json({ status: 409, error: 'conflict', message: 'This resource is associated with other documents' });

        const deleteFranchise = await FranchiseModel.deleteOne({ _id: id })
        
        if (deleteFranchise) {
            console.log(colors.bgCyan('Se elimino un elemento de la colección Franchise'.black));
            return res.json(franchise).status(200) ;
        };
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Bad request', status: 500, message: error });
    }
};




export default controller;