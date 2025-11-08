function rejectInsecureConnections(req, res, next){
    if(req.secure){
        next();
    } 
    else{
        return res.status(426).send('HTTPS is required to access this resource');
    }
};


export { rejectInsecureConnections };