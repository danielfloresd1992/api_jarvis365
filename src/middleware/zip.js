import jszip from 'jszip';

const zipMiddleware = (req, res, next) => {
    res.zip = (data, fileName) => {
        const zip = new jszip();
        zip.file(fileName, data);
        zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
        .pipe(res.status(200).set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename=${fileName}.zip`
        }));
    };
    next();
};

export { zipMiddleware };