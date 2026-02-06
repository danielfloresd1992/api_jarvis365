import * as yup from 'yup'; 



export const commentYupSchema = yup.object({ 
        user: yup .string().required('El campo user es obligatorio'), 
        comment: yup .string() .required('El comentario es obligatorio').trim() .min(1, 'El comentario no puede estar vacío')  
});