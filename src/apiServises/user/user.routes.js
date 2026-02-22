import express from 'express';
const routerUser = express.Router();
import { join } from 'path';
import UserModel, { UpdateByUserSchema } from './user.model.js';
import { userUpdateSchema } from './user.schema.js'
import addCredentials from '../../middleware/addCredential.js';
import controller from './user.controller.js';

import nameApi from '../../libs/name_api.js';
import { ObjectId } from 'mongodb';  //   validateSessionAndUser.js
import { validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import { userMultimedia } from '../../util/multer.js'

import AttendanceModel from './attendance.model.js';
import attendanceValidationSchema from './attendance.squema.js';
import { parseISO, format, isAfter, getDay, startOfDay, isValid } from 'date-fns';




routerUser.get(`${nameApi}/user/AllById?`, async (req, res) => {
    try {

        const { inabilited } = req.query
        const query = {};

        if (inabilited !== undefined) {
            if (inabilited === 'true') query.inabilited = true;
            if (inabilited === 'false') query.inabilited = false;
        }

        const fullUser = await UserModel.find(query).select('_id');
        return res.status(200).json({ result: fullUser })
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ error: error, message: 'Error server internal', status: '500' });
    }
});




//  FOR USER MANAGEMENT/*validateSessionAndUserSuper, */
routerUser.get(`${nameApi}/user`, async (req, res) => {
    try {

        // --- Validación: debe venir id O pag ---
        if (!req.query?.id && !req.query?.pag) {
            return res.status(400).json({
                error: 'Bad request',
                status: 400,
                message: 'You must provide either "id" to search a user by ID or "pag" to get paginated results.'
            });
        }


        // VALIDACIÓN DE PARAMETRO DE CONSULTA POR ID
        if (req?.query?.id) {
            const { id } = req.query;
            if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', status: 400, messaje: 'ID is not valid' })
            const user = await UserModel.findById(id).select('+updateByUser').populate('updateByUser.idRef');

            if (!user) return res.status(404).json({ error: 'Not found', status: 404, mmesage: 'The user does not exist.' })

            return res.json({ status: 200, result: user })
        }

        const pag = req.query?.pag;

        // VALICACIÓN DE PARAMERO DE CONSULTA POR PAGINACIÓN
        if (!pag) return res.status(400).json({ error: 'Bad request', status: 400, message: 'The "pag" query param is required when no ID is provided.' });

        const page = Number(pag);

        // VALIDACIÓN QUE EL PARAMETRO DE PAGINACIÓN SEA ENTERO POSITIVO
        if (isNaN(page) || page < 1) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be a valid positive number.' });
        if (!Number.isInteger(page)) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be an integer number (no decimals).' });
        if (page < 1) return res.status(400).json({ error: 'Bad request', status: 400, message: '"pag" must be greater than or equal to 1.' });

        const limit = 10;
        const skip = (page - 1) * limit;

        const users = await UserModel.find({}).select('+updateByUser').populate('updateByUser.idRef').sort({ createdOn: -1 }).skip(skip).limit(limit);

        const totalUser = await UserModel.countDocuments();
        const totalPages = Math.ceil(totalUser / limit);

        return res.json({
            status: 200, page, result: {
                status: 200,
                reuslt: users,
                totalUser: totalUser,
                totalPages: totalPages,
                currentPage: page
            }
        });

    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});




routerUser.put(`${nameApi}/user/:id`, validateSessionAndUserSuper, async (req, res) => {
    try {
        const { id } = req.params;
        const idUserQuiery = req.session.userId;

        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Bad request', status: 400, message: 'ID is not valid' });

        const body = req.body;
        const dataValidate = await userUpdateSchema.validate(body);
        const dataUserChange = { idRef: idUserQuiery, change: Object.keys(dataValidate) }

        const userUpdate = await UserModel.findByIdAndUpdate(id, { $set: dataValidate, $push: { updateByUser: dataUserChange } }, { new: true, runValidators: true });

        if (!userUpdate) return res.status(404).json({ error: 'Not found', status: 404, mmesage: 'The user does not exist.' })

        return res.json({ userUpdate });
    }
    catch (error) {
        console.log(error);
        if (error.name === 'ValidationError') return res.status(400).json({ error: 'Bad request', status: 400, message: error.errors })
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});

//https://amazona365.ddns.net/api_jarvis/v1/user/multimedia/WhatsAppImage2026-02-08at1.07.11PM.jpeg



routerUser.get(`${nameApi}/user/:dni`, async (req, res) => {
    try {
        const dni = req.params?.dni;
        if (!dni) return res.status(400).json({ error: 'Bad request', status: 400, message: "The user's ID number is required in the dni parameter" });

        const user = await UserModel.findOne({ dni: dni });
        if (!user) return res.status(404).json({ error: 'Not found', status: 404, message: 'User not found, or dni invalidate', });
        return res.status(200).json({ stauts: 200, result: user })
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Error server internal', status: 500, error: error });
    }
});




routerUser.get(`${nameApi}/user/attendance/:dns`, async (req, res) => {
    try {
        const { dni } = req.params;
        const { date } = req.query; // Recibimos la fecha por Query Params

        // 1. Validaciones iniciales
        if (!dni) {
            return res.status(400).json({ status: 400, message: 'El DNI es obligatorio', error: 'Bad request' });
        }
        if (!date) {
            return res.status(400).json({ status: 400, message: 'La fecha es obligatoria para la consulta', error: 'Bad request' });
        }


        // 2. Normalizar la fecha de búsqueda (Igual que en el guardado)
        const searchDate = startOfDay(new Date(date));
        if (!isValid(searchDate)) {
            return res.status(400).json({ status: 400, message: 'Formato de fecha inválido', error: 'Bad request' });
        }

        // 3. Buscar al usuario por DNI para obtener su _id
        const user = await UserModel.findOne({ dni: dni });
        if (!user) {
            return res.status(404).json({
                status: 404,
                message: "Usuario no encontrado",
                error: "User Not Found"
            });
        }

        // 4. Buscar el registro de asistencia
        const attendance = await AttendanceModel.findOne({
            userId: user._id,
            date: searchDate
        });

        // 5. Respuesta si NO hay registro (Muy importante para el frontend)
        if (!attendance) {
            return res.status(404).json({
                error: 'Document not found',
                status: 404,
                message: "No se encontró registro de asistencia para este día",
                data: null // Enviamos data null para que el frontend sepa que es un día "vío"
            });
        }

        // 6. Respuesta exitosa
        return res.status(200).json({
            status: 200,
            message: "Registro encontrado",
            data: attendance
        });

    }
    catch (error) {
        console.error("Error en getAttendanceByDni:", error);
        return res.status(500).json({
            status: 500,
            message: "Error interno del servidor",
            error: error.message
        });
    }
});




// attendance record
const ensureDate = (dateSource) => {
    if (!dateSource) return null;
    if (dateSource instanceof Date) return dateSource;
    // Solo si es string intentamos parsear
    return new Date(dateSource);
};


routerUser.post(`${nameApi}/user/attendance/:dns`, async (req, res) => {
    try {
        const dni = req.params?.dns;
        const body = req.body;

        if (!dni) return res.status(400).json({ status: 400, message: 'Dni is undefined', error: 'Bad request' });

        const user = await UserModel.findOne({ dni: dni });
        if (!user) return res.status(404).json({ status: 404, message: 'User not found or dni invalid', error: 'Documento not found' });


        const bodyValidate = await attendanceValidationSchema.validate(body);



        // Datos de regla
        const timeArrivaRules = new Date(new Date().setHours(Number(user.workSchedule.startTime.split(':')[0]), Number(user.workSchedule.startTime.split(':')[1]), 0, 0)); // "09:00", "18:00" /TIME LIMIT
        const timeOutRule = new Date(new Date().setHours(Number(user.workSchedule.endTime.split(':')[0]), Number(user.workSchedule.endTime.split(':')[1]), 0, 0));
        const shiftRule = user.workSchedule.shiftType;

        // Datos de llegada
        const recordDate = startOfDay(ensureDate(bodyValidate.date)); // DÍA DEL DOCUMENTO;
        const timeArrival = new Date(bodyValidate.checkIn); // HORA LLEGADA
        const timeOut = new Date(bodyValidate.checkOut); // HORA SALIDA 
        const dayArrival = timeArrival.getDay(); // DÍA DE LLEGADA
        const dayFree = user.workSchedule.restDays[String(new Date().getDay())]; // DIA LIBRE EN BOOLEANO


        // ==========================================================
        // AQUÍ SE ESTABLECE SI LLEGÓ TARDE (Lógica de Negocio)
        // ==========================================================
        const realIsLate = isAfter(timeArrivaRules, timeArrival); // TARDE EN BOOLEANO




        // ==========================================================
        // GUARDADO EN BASE DE DATOS (Upsert)
        // ==========================================================

        const finalRecord = await AttendanceModel.findOneAndUpdate(
            { userId: user._id, date: recordDate },
            {
                $set: {
                    date: recordDate,
                    checkIn: timeArrival, // Hora de llegada
                    checkOut: bodyValidate.checkOut ? timeOut : null, // hora de salida en caso e haber
                    isLate: realIsLate, // legda tarde en booleano
                    isExtraDay: dayFree, // si es dia libre trabajado
                    status: dayFree ? 'franco-trabajado' : 'presente',
                    adminNotes: bodyValidate?.adminNotes || "" // Nota de recursos humanos
                }
            },
            { upsert: true, new: true }
        );

        return res.json({
            message: realIsLate ? "Registro exitoso con retardo" : "Registro exitoso a tiempo",
            data: finalRecord
        });


        /*

        const ensureDate = (dateSource) => {
            if (dateSource instanceof Date) return dateSource;
            if (typeof dateSource === 'string') return parseISO(dateSource);
            return new Date(dateSource);
        };

        const checkInDate = ensureDate(bodyValidate.checkIn);
        

        if (!isValid(checkInDate) || !isValid(recordDate)) {
            return res.status(400).json({ message: "Formato de fecha inválido" });
        }

        // ==========================================================
        // AQUÍ SE ESTABLECE SI LLEGÓ TARDE (Lógica de Negocio)
        // ==========================================================
        
        // 1. Obtener horas y minutos del horario oficial de Daniel (ej: "09:00")
        
        
        // 2. Crear un objeto Date para la "Hora Límite" basado en el día del CheckIn
        const limitTime = new Date(checkInDate);
        limitTime.setHours(hour, minute, 0, 0);

        // 3. Determinar si es su día de descanso (0-6)
        const dayOfWeek = getDay(recordDate);
        const isRestDay = user.workSchedule.restDays[dayOfWeek.toString()];

        // 4. Calcular el estado real del retardo
        let realIsLate = false;
        if (user.workSchedule.lateArrivalControl && !isRestDay) {
            // Es tarde si la hora de entrada es mayor a la hora límite
            realIsLate = isAfter(checkInDate, limitTime);
        }

        // ==========================================================
        // GUARDADO EN BASE DE DATOS (Upsert)
        // ==========================================================
        
        const finalRecord = await AttendanceModel.findOneAndUpdate(
            { userId: user._id, date: recordDate },
            {
                $set: {
                    checkIn: checkInDate,
                    checkOut: bodyValidate.checkOut ? ensureDate(bodyValidate.checkOut) : null,
                    isLate: realIsLate,
                    isExtraDay: isRestDay,
                    status: isRestDay ? 'franco-trabajado' : 'presente',
                    adminNotes: bodyValidate.adminNotes || ""
                }
            },
            { upsert: true, new: true }
        );

        
        */

    }
    catch (error) {
        console.log(error.name);
        if (error.name === 'CastError') return res.status(400).json({ error: error, status: 400, message: 'Bad request' });
        if (error.name === 'ValidationError') return res.status(400).json({ error: error.errors, status: 400, message: 'Bad request' });
        return res.status(500).json({ status: 500, message: 'Error server internal', error: error.message });
    }
});








routerUser.get(`${nameApi}/user/multimedia/:namefile`, async (req, res) => {
    try {
        const namefile = req.params?.namefile;
        return res.sendFile(join(userMultimedia, namefile))
    }
    catch (error) {
        console.log(error);
    }
});





// THIS ENDPOIND IS DEPRECATED 👇

routerUser.post(`/user/login`, controller.login, addCredentials);   //legace
routerUser.get(`/user/protected`, controller.get);
routerUser.post(`/user/signup`, controller.signup);
routerUser.get(`/user/logout`, controller.logout);
routerUser.get(`/user/getUser`, controller.getUser);

routerUser.post(`${nameApi}/user/login`, controller.login, addCredentials);

routerUser.get(`${nameApi}/user/protected`, controller.get);

routerUser.post(`${nameApi}/user/signup`, controller.signup);

routerUser.get(`${nameApi}/user/logout`, controller.logout);

routerUser.get(`${nameApi}/user/getUser`, controller.getUser);



routerUser.get(`${nameApi}/userStore`, (req, res) => {
    return res.status(403)
    /*
    store.all((err, sessions) => {
        if (err) {
            console.error('Error al obtener las sesiones:', err);
            res.status(500).send('Error del servidor');
        } 
        else{
            
            const authenticatedUsers = [];
            for(let i = 0; i < sessions.length;  i++){
            
                if(sessions[i].session.name !== undefined){
                    
                    authenticatedUsers.push(sessions[i]);
                }
            }
      
            return res.json(authenticatedUsers);
        }
    })
        */
});



export { routerUser }; 