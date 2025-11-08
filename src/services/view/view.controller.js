const controller = {};
import colors from 'colors';
import * as url from 'url';
import { join } from 'path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

controller.singinView = (req, res) => {
    
    if (req.session.name === undefined) return res.render('singin');
    return res.redirect(301, '/lobby');
};


controller.register = (req, res) => {
    res.render('register');
};


controller.index = (req, res) => {

    let user = req.session.name;
    if (req.session.name === undefined) return res.redirect(301, '/');
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    console.log(`${user} a ingresado al lobby`.gray);
    const option = `button`;
    return res.render('lobby', {tittle: 'App manager', option: option, textOption: 'Opciones', isLoggin });
};


controller.viewCorte = (req, res) => {
    if (req.session.name === undefined) return res.redirect(301, '/');
    
    res.sendFile(join(__dirname, '../public/vistaSolicitudDatos/index.html'));
};


controller.sendCorte = (req, res) => {
    const salir = `button`;
    let isLoggin = false;
    isLoggin = true;
    res.render('setCorte', { tittle: 'Cortes 365', home: salir, text: `regresar`, user: 'Amazonas365', isLoggin });
};


controller.crudLocal = (req, res) => {
    if (!req.session.name) res.redirect(301, '/');
    console.log(colors.bgCyan(`${req.session.name} a realizado una petición a la ruta "/crud/local"`.black));
    const salir = `button`;
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    res.render('crudLocalFranchise', { tittle: 'Locales y franquicias', home: salir, text: `regresar`, isLoggin});
};


controller.crudManager = (req, res) => {
    if (!req.session.name) return res.redirect(301, '/');
    console.log(colors.bgCyan(`${req.session.name} a realizado una petición a la ruta "/crud/local"`.black));
    const salir = `button`;
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    res.render('managerCrud', { tittle: 'Gerentes y managers', home: salir, text: `regresar`, isLoggin });
};


controller.performanceUser = (req, res) => {
    if (!req.session.name) return res.redirect(301, '/');
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    const salir = `button`;
    res.render('performance_user', { tittle: 'Rendimiento del operador', home: salir, text: `regresar`, isLoggin });
};



/*
controller.validateNovelties = (req, res) => {
    if (!req.session.name) return res.redirect(301, '/');
    const salir = `button`;
    res.render('validateNovelties', { tittle: 'Cortes 365', home: salir, text: `regresar` });
};


controller.viewSendNoveltie = (req, res) => {
    if (!req.session.name) return res.redirect(301, '/');
    const salir = `button`;
    res.render('viewSendNoveltie', { tittle: 'Novedades', home: salir, text: `regresar` });
}
*/


controller.editMenu = (req, res) => {
    if (!req.session.name) return res.redirect(301, '/');
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    const salir = `button`;
    res.render('menu', { tittle: 'Novedades', home: salir, text: `regresar`, isLoggin });
};



controller.getProfileLocal = (req, res) => {
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    const param = req.params.profileAndRestaunrant;
    const salir = 'button';
    res.render('profile_local', { tittle: 'Clientes', home: salir, text: `regresar`, isLoggin });
};


controller.managerDateClient = (req, res) => {
    if (!req.session.name) return res.redirect(301, '/');
    let isLoggin = false;
    if (req.session.name !== undefined) isLoggin = true;
    const salir = `button`;
    res.render('managerDate', { tittle: 'Horarios', home: salir, text: `regresar`, isLoggin });
};



export default controller;