const controller = {};
import publisherLayer from './publisher.layer.js';
import colors from 'colors';
import Publisher from './publisher.model.js';

// Escapa una cadena para usarla de forma segura dentro de un $regex
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


controller.setPublisher = async (req, res) => {
    try {
        const publication = await publisherLayer.createPublication(req.body);
        res.status(200).send('ok');
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getAllPublisher = async (req, res) => {
    try {

        const publications = await publisherLayer.getAllPublisher();
        return res.json(publications);

    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getPublisherAndArticle = async (req, res) => {
    try {
        const id = req.params.id;
        const publisher = await publisherLayer.getPublisherAndArticle(id);
        return res.json(publisher);
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getPublisherPaginate = async (req, res) => {
    try {
        const page = Number.parseInt(req.params.page, 10);
        const numberItems = Number.parseInt(req.params.items, 10);
        const { before, after, day, establishment } = req.query;
        console.log(req.query);
        if (Number.isNaN(page) || Number.isNaN(numberItems) || page < 0 || numberItems <= 0) {
            return res.status(400).json({ status: 400, message: 'Parámetros de paginación inválidos' });
        }

        const filter = {};
        const dateFilter = {};

        // Support `day=YYYY-MM-DD` to query that whole day (server local timezone)
        if (day) {
            const parts = day.split('-').map(p => Number.parseInt(p, 10));
            if (parts.length !== 3 || parts.some(p => Number.isNaN(p))) {
                return res.status(400).json({ status: 400, message: 'Parámetro day inválido. Use YYYY-MM-DD' });
            }
            const [y, m, d] = parts;
            const start = new Date(y, m - 1, d, 0, 0, 0, 0);
            const end = new Date(y, m - 1, d, 23, 59, 59, 999);
            dateFilter.$gte = start;
            dateFilter.$lte = end;
        }
        else {
            if (after) {
                const afterDate = new Date(after);
                if (Number.isNaN(afterDate.getTime())) {
                    return res.status(400).json({ status: 400, message: 'Parámetro after inválido' });
                }
                dateFilter.$gte = afterDate;
            }

            if (before) {
                const beforeDate = new Date(before);
                if (Number.isNaN(beforeDate.getTime())) {
                    return res.status(400).json({ status: 400, message: 'Parámetro before inválido' });
                }
                dateFilter.$lte = beforeDate;
            }
        }

        if (Object.keys(dateFilter).length > 0) {
            filter.date = dateFilter;
        }

        // Optional establishment filter (matches `local.localName` case-insensitive, partial)
        if (establishment && String(establishment).trim().length > 0) {
            const esc = escapeRegex(String(establishment).trim());
            filter['local.localName'] = { $regex: esc, $options: 'i' };
        }

        // If both bounds exist but are in the wrong order, swap them so the query returns results
        if (filter.date && filter.date.$gte && filter.date.$lte) {
            const gte = filter.date.$gte instanceof Date ? filter.date.$gte.getTime() : new Date(filter.date.$gte).getTime();
            const lte = filter.date.$lte instanceof Date ? filter.date.$lte.getTime() : new Date(filter.date.$lte).getTime();
            if (!Number.isNaN(gte) && !Number.isNaN(lte) && gte > lte) {
                const tmp = filter.date.$gte;
                filter.date.$gte = filter.date.$lte;
                filter.date.$lte = tmp;
            }
        }
        console.log(filter)
        const doc = await Publisher.find(filter).sort({ date: -1, _id: -1 })
            .skip(page * numberItems)
            .limit(numberItems);
        console.log(doc);
        return res.json(doc);
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};


controller.getPublisherSearch = async (req, res) => {
    try {
        const text = req.params.search;
        const page = req.params.page;
        const numberItems = req.params.numberItems;

        console.log(text);

        const result = await publisherLayer.searchPublishers(text, page, numberItems);
        return res.json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
};



controller.deletedPublisher = async (req, res) => {
    try {


        if (!req.session.name) return res.status(401).send('Debe loguearse para realizar esta operación');
        if (!req.session.super || !req.session.admin) {
            console.log(colors.bgRed(`Alguien o algo a intentado acceder a un recurso sin tener los permisos suficientes`.black));
            return res.status(403).send('No cuentas con los permisos suficientes para esta transacción');
        }

        return res.status(410).send('This API endpoint is deprecated.');


        const id = req.params.id;
        const result = await publisherLayer.deletePublisher(id);
        return res.json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
}


controller.deleted = async (req, res) => {
    try {

        const id = req.params.id;
        const result = await publisherLayer.deletePublisher(id);
        return res.status(201).json(result);
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ status: 500, error: err, message: 'Error server internal' });
    }
}


export default controller;