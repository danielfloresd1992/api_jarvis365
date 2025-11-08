const controller = {};
import alert from './alert.layer.js';


controller.setAlert = async (req, res) => {
    try {
        console.log(req.file);
        const newAlert = await alert.setAlert(req.body, req.file);
        return res.json(req.body);
    } 
    catch(err) {
        console.log(err);
    }
};


controller.getAlertById = async (req, res) => {
    try {
        const id = req.params.id;
        const alertFind = await alert.getAlertById(id);
        return res.json(alertFind);
    } 
    catch(err) {
        console.log(err);
    }
};


export default controller;