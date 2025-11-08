let IP;

if (process.env.NODE_ENV === 'development') {
    IP = '72.68.60.201:3006';
}
else {
    IP = '72.68.60.254';
}

export default IP;