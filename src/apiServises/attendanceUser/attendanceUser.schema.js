import * as yup from 'yup';


// Validación del marcaje desde la máquina: solo exige la foto.
// OJO: .trim() solo afecta a la validación (min(3) sobre el texto recortado);
// el controlador guarda body.imageReference tal cual llega.
const attendanceMachineValidationSchema = yup.object().shape({
    imageReference: yup
        .string()
        .trim()
        .required('La referencia de imagen es obligatoria')
        .min(3, 'La referencia de imagen es inválida')
});


export { attendanceMachineValidationSchema };
