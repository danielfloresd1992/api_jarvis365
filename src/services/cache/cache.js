
class Cache_Jarvis{

    constructor(){

        this.cache = new Map();

    }


    getItem(key){
        if(typeof key !== 'string') throw 'The parameter of this method must be of type string';
        return this.cache.get(key);
    }


    getCacheArray(){
        const array = Array.from(this.cache).map(item => item);
        return array;
    }

    
    isItem(key){
        if(typeof key !== 'string') throw 'The parameter of this method must be of type string';
        return this.cache.has(key);
    }


    setItem(key, value){
        if(typeof key !== 'string') throw 'The parameter of this method must be of type string';
        if(this.isItem(key)) return  console.log('¡Exixte un elemento igual en la cache!');
        this.cache.set(key, value);
    }


    deleteItem(key){
        if(typeof key !== 'string') throw 'The parameter of this method must be of type string';
       // if(this.isItem(key)) return ('¡Exixte un elemento igual en la cache!');
        this.cache.delete(key);
    }
}


export default Cache_Jarvis;

