import { model, Schema } from 'mongoose';


const Schedules = new Schema({
    idLocal : {
        type: String,   
        require: true,
        unique: true
    },
    dayMonitoring: [
        {
            dayMonitoring: {
                type: Number, 
                require: true
            },

            hours: {
                start: {
                    type: String, 
                    require: true
                },
                end: {
                    type: String,
                    require: true
                        
                }
            },
            idLocal: {
                type: String, 
            },
            key:{
                type: String,
            }
        }
    ]
});



export default model('Schedules', Schedules);
