import express from 'express';
import { extendSession, validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';
import controller from './schedule.controller.js';
import nameApi from '../../libs/name_api.js';

const routerSchedule = express.Router();

routerSchedule.get(`${nameApi}/schedule/all`, validateSession, controller.getDateAll);

routerSchedule.get(`${nameApi}/schedule/idLocal=:idLocal`,extendSession, validateSession, controller.getDateByIdLocal);

routerSchedule.get(`${nameApi}/schedule/active/idLocal=:idLocal`, extendSession, validateSession, controller.getActiveByIdLocal);

routerSchedule.get(`${nameApi}/schedule/today/idLocal=:idLocal`, extendSession, validateSession, controller.getTodayByIdLocal);

routerSchedule.post(`${nameApi}/schedule`, extendSession, validateSessionAndUserSuper, controller.setDateLocal);

routerSchedule.put(`${nameApi}/schedule/idLocal=:idLocal`, extendSession, validateSessionAndUserSuper, controller.putDate);


export { routerSchedule };