import express, { Router } from 'express';
import controller from './time.controller.js';
import nameApi from '../../libs/name_api.js';

const routesTimer = express.Router();


routesTimer.get(`${nameApi}/time`, controller.IsDaylightSavingTime);
routesTimer.put(`${nameApi}/time`, controller.putDaylightSavingTime);



export { routesTimer };