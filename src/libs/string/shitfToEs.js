export default function shiftToEs(shift){
    if(shift ==='day')  return 'diurno';
    else if(shift === 'night') return 'nocturno';
    else return shift;
}