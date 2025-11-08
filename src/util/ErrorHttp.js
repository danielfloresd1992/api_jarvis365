export default class ErrorHttp{

    constructor(msm){
        if(msm.status === undefined || msm.body === undefined || msm.send === undefined ) throw 'property is undefined';
        this.status = msm.status;
        this.body = msm.body;
        this.send = msm.send;

        return {
            status: this.status,
            body: this.body,
            send: this.send
        }
    }

    generateResponse(){
        return {
            status: this.status,
            body: this.body,
            send: this.send
        }
    }
}