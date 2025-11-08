import express from 'express';
const routerPublisher = express.Router();
import controller from './publisher.controller.js';
import nameApi from '../../libs/name_api.js';           //'../../middleware/validateSessionAndUser.js';
import { validateSession, validateSessionAndUserSuper } from '../../middleware/validateSessionAndUser.js';



routerPublisher.get(`${nameApi}/user/publisherAll`, validateSession, controller.getAllPublisher);

routerPublisher.get(`${nameApi}/user/publisherAndArticleById/id=:id`, validateSession, controller.getPublisherAndArticle);

routerPublisher.get(`${nameApi}/user/publisher/paginate=:page/items=:items` , validateSession, controller.getPublisherPaginate);

routerPublisher.get(`${nameApi}/user/publisher/search=:search/page=:page/numberItems=:numberItems` , validateSession, controller.getPublisherSearch);

routerPublisher.get(`${nameApi}/user/publisher/delete=:id`, validateSessionAndUserSuper,controller.deletedPublisher);

routerPublisher.delete(`${nameApi}/user/publisher/delete=:id` , validateSessionAndUserSuper, controller.deleted);

export { routerPublisher };