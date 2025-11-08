import { Types } from 'mongoose';


function validateObjectIdStrict(req, res, next){
    const ID_QUERY = req.params.id || req.query.id;
    
    if(ID_QUERY === undefined || ID_QUERY === 'undefined' || ID_QUERY === null){
        return res.status(400).json({ error: 'the query id should not be undefined' });
    }

    if(Types.ObjectId.isValid(ID_QUERY)){
        next();
    }
    else{
        return res.status(400).json({ error: 'The objectId is invalid' });
    }
}



function validateObjectId(req, res, next){
    const ID_QUERY = req.params.id || req.query.id;


    if(!ID_QUERY) next();



    if(Types.ObjectId.isValid(ID_QUERY)){
        next();
    }
    else{
        return res.status(400).json({ error: 'The objectId is invalid' });
    }
}




export { validateObjectIdStrict, validateObjectId };