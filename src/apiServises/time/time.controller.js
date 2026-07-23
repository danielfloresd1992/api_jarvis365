import { IsDaylightSavingTimeBoolean } from './time.model.js'
const controller = {};



IsDaylightSavingTimeBoolean.countDocuments({}, (err, count) => {
    if (err) throw console.error(err);

    if(count < 1){
        const newDocument = new IsDaylightSavingTimeBoolean({
            isDaylightSavingTime: false
        });

        newDocument.save()
            .then()
            .catch(err => {
                console.log(err);
            })
    }
});


controller.IsDaylightSavingTime = async (req, res) => {
    try {
        const document = await IsDaylightSavingTimeBoolean.findOne();
        return res.status(200).json({
            IsDaylightSavingTime: document.isDaylightSavingTime,
            usWinterActive: Boolean(document.usWinterActive)
        })
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Error server internal' });
    }
};


controller.putDaylightSavingTime = async (req, res) => {
    try {
        // if(!req.session.name) return res.status(401).json({ error: 'Unauthorized' });
        if(!req.session.admin){
            return res.status(403).json({ error: 'Forbidden' });
        }
        if(!req.query.newBooleranValue) return res.status(400).json({ error: 'Bad request, newBooleranValue is undefined' });

        const newValue = req.query.newBooleranValue;

        console.log(newValue);
        const document = await IsDaylightSavingTimeBoolean.findOne();
        const update = await IsDaylightSavingTimeBoolean.updateOne({ _id: document._id }, {
            isDaylightSavingTime: newValue,
            editBy: {
                name: req.session.name,
                sessionId: req.session.sessionId
            }

        })

        return res.json(update);
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Error server internal' });
    }
};


// Interruptor global del cambio de invierno USA. Solo admin (front y back).
// Activa/desactiva el uso del horario alternativo en los locales usesUsTimezone.
controller.putUsWinterActive = async (req, res) => {
    try {
        if(!req.session.name)  return res.status(401).json({ status: 401, error: 'Unauthorized', message: 'Debe iniciar sesión' });
        if(!req.session.admin) return res.status(403).json({ status: 403, error: 'Forbidden', message: 'Se requiere permiso de administrador' });
        if(req.query.value === undefined) return res.status(400).json({ status: 400, error: 'Bad request', message: 'value es requerido (true|false)' });

        const value = req.query.value === 'true' || req.query.value === true;

        const document = await IsDaylightSavingTimeBoolean.findOne();
        await IsDaylightSavingTimeBoolean.updateOne({ _id: document._id }, {
            usWinterActive: value,
            editBy: { name: req.session.name }
        });

        return res.json({ usWinterActive: value });
    }
    catch(error){
        console.log(error);
        return res.status(500).json({ error: 'Error server internal' });
    }
};


export default controller;