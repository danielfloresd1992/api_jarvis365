const controller = {};
import FranchiseModel from './franchise.model.js';
import LocalModel from '../local/local.model.js';
import colors from 'colors';
import { notify, actorFromSession, diffChanges } from '../notification/notification.service.js';
import { parseImage, parseFranchiseUpdate } from './franchise.lib.js';


// FRANCHISE_FIELDS = «los campos que se pueden cambiar, con su nombre para la notificación»
const FRANCHISE_FIELDS = { image: 'foto', location: 'ubicación' };


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
    // Fuera del try: el catch también lo usa en su mensaje
    const body = req.body ?? {};
    try {

        if (body['name'] === '' || body['name'] === undefined) return res.status(400).send('El nombre esta vacio');
        const findFranchise = await FranchiseModel.findOne({ name: body['name'] });

        if (findFranchise) return res.status(409).json({ status: 409, error: 'conflict', message: `There is a resource called ${body['name']}` })

        // La foto es opcional al crear; si viene, tiene que ser una URL válida
        const imagen = body['image'] === undefined ? { ok: true, value: null } : parseImage(body['image']);
        if (!imagen.ok) return res.status(400).json({ status: 400, error: 'Bad request', message: imagen.error });

        const newFranchise = new FranchiseModel({
            name: body['name'],
            location: body['location'],
            image: imagen.value
        });

        const resultSave = await newFranchise.save();

        notify({
            type: 'franchise.created',
            actor: actorFromSession(req),
            resource: {
                kind: 'franchise',
                id: resultSave._id,
                name: resultSave.name || '',
                path: '/clients&manasgement',
            },
        });

        console.log(colors.bgCyan(`Franquicia ${body['name']} guardado a la colección de Franchise`.black));

        return res.json({ message: 'created resource', status: 200, data: resultSave }).status(200);

    }
    catch (error) {
        console.log(colors.bgRed(`Error al guardar ${body.name} a la colección Franchise`.black));
        console.log(error);
        return res.status(500).json({ error: 'Bad request', status: 500, message: error });
    }
};




/*  PUT /franchise/:id — cambia la foto y la ubicación de una franquicia.
 *  El nombre no se cambia (los locales la guardan por nombre); las reglas están
 *  en franchise.lib.ts. Contesta { status, data: franquicia actualizada }. */
controller.putFranchise = async (req, res) => {
    try {
        const cambio = parseFranchiseUpdate(req.body);
        if (!cambio.ok) return res.status(400).json({ status: 400, error: 'Bad request', message: cambio.error });

        const antes = await FranchiseModel.findById(req.params.id).lean();
        if (!antes) return res.status(404).json({ status: 404, error: 'Not found', message: `No existe la franquicia ${req.params.id}` });

        const resultado = await FranchiseModel.findByIdAndUpdate(req.params.id, { $set: cambio.value }, { new: true });

        const cambios = diffChanges(antes, cambio.value, FRANCHISE_FIELDS);
        if (cambios.length > 0) {
            notify({
                type: 'franchise.updated',
                actor: actorFromSession(req),
                resource: {
                    kind: 'franchise',
                    id: resultado._id,
                    name: resultado.name || '',
                    path: '/clients&manasgement',
                    img: resultado.image || null,
                },
                changes: cambios,
            });
        }

        return res.status(200).json({ status: 200, data: resultado });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Internal Server Error', status: 500, message: 'No se pudo actualizar la franquicia' });
    }
};




controller.deleteFranchise = async (req, res) => {
    try {

        const id = req.params.id;

        const franchise = await FranchiseModel.findOne({ _id: id });

        if (!franchise) return res.status(404).json({ status: 404, error: 'Not found', message: `No existe la franquicia ${id}` });

        let localsCount = await LocalModel.countDocuments({ idLocal: franchise.id });
       
        if (localsCount > 0) return res.status(409).json({ status: 409, error: 'conflict', message: 'This resource is associated with other documents' });

        const deleteFranchise = await FranchiseModel.deleteOne({ _id: id })
        
        if (deleteFranchise) {
            notify({
                type: 'franchise.deleted',
                actor: actorFromSession(req),
                resource: {
                    kind: 'franchise',
                    id: franchise._id,
                    name: franchise.name || '',
                    path: '/clients&manasgement',
                },
            });

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