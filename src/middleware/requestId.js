const { v4: uuidv4 } = require('uuid');

module.exports = (req, res, next) => {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-Id', req.id);
    next();
};
