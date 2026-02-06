import mongoo from 'mongoose';
const { Schema , model } = mongoo;



const UpdateByUserSchema = new Schema({ 
    idRef:{ 
        type: Schema.Types.ObjectId, 
        required: true, 
        ref: 'user',
        immutable: true,
    }, 
    change: []
}, 
    { timestamps: true // ← Esto genera createdAt y updatedAt automáticamente 
    
});




export default model('user', new Schema({
    user:{
        type: String,
        unique: true,
        required: true,
        immutable: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    email: {
        immutable: true,
        type: String,
        unique: true,
        required: true
    },
    name: {
        type: String,
        required: true,
        immutable: true,
    },
    surName: {
        type: String,
        required: true,
        immutable: true,
    },
    phone: {
        type: String,
        unique: true,
        required: true,
        immutable: true,
    },

    admin: {
        type: Boolean,
        default: false
    },

    super: {
        type: Boolean,
        default: false
    },

    inabilited: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        default: new Date(),
        immutable: true,
    },
    createdOn: {
        type: Date,
        default: new Date(),
        immutable: true,
    },
    
    shiftSchedule: {
        type: String,
        require: true,
        enum: ['day',  'nigth']
    },

    updateByUser: { 
        type: [UpdateByUserSchema], // ← Array de subdocumentos con timestamps
        default: [] ,
        select: false
    }
    })
);


export { UpdateByUserSchema }