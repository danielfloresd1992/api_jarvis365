import * as yup from 'yup';
const timeFormatRegex = /^\d{2}:\d{2}:\d{2}$/;


export const dishesSchema = yup.object({
    nameDishe: yup.string().required("Dish name is required"),
    category: yup.string().required("Category is required").oneOf(["desserts_and_sweets", "food", "drinks"], "Invalid category"),
    allDay: yup.boolean().default(true),
    timeLimit: yup.object({
        day: yup.string().required().matches(timeFormatRegex, "Invalid time format (HH:MM:SS)"),
        night: yup.string().required().matches(timeFormatRegex, "Invalid time format (HH:MM:SS)")
    }),
    timeLimitSeconds: yup.object({
        day: yup.number().required().integer().positive(),
        night: yup.number().required().integer().positive()
    }),
    showDelaySubtraction: yup.boolean().default(false),
    idLocalRef: yup.string().required("Local reference ID is required"),
    requiresTableNumber: yup.boolean().default(true)
});