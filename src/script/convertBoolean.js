export default function convertBoolean(valueString) {
    if(typeof valueString === 'string' && valueString.toLowerCase().trim() === 'true'){
        return true;
    }
    else if(typeof valueString === 'string' && valueString.toLowerCase().trim() === 'false'){
        return false;
    }
    else{
        return false;
    }
}
  
