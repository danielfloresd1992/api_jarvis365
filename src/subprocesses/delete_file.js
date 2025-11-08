import { unlink } from "fs";


const filePath = process.argv[2];

unlink(filePath, (error) => {
    if(error) {
        console.log(error);
        process.exit(1);
    }
    else{
        process.exit(0);
    }
});