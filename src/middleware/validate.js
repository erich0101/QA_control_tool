const { ValidationError } = require('./errors');

module.exports = (schema, source = 'body') => (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
        const details = result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
        return next(new ValidationError('Datos inválidos', details));
    }
    req[source] = result.data;
    next();
};
