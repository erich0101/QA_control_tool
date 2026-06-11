const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const { loginSchema } = require('../validators/auth.schema');

const authRouter = require('./auth.routes');
const usersRouter = require('./users.routes');
const projectsRouter = require('./projects.routes');
const useCasesRouter = require('./useCases.routes');
const userStoriesRouter = require('./userStories.routes');
const preconditionsRouter = require('./preconditions.routes');
const testSuitesRouter = require('./testSuites.routes');
const runsRouter = require('./runs.routes');
const testCasesRouter = require('./testCases.routes');
const defectsRouter = require('./defects.routes');
const hallazgosRouter = require('./hallazgos.routes');
const historyRouter = require('./history.routes');
const statsRouter = require('./stats.routes');
const importRouter = require('./import.routes');
const evidenceRouter = require('./evidence.routes');
const issueRouter = require('./issue.routes');
const jiraRouter = require('./jira.routes');
const reportsRouter = require('./reports.routes');

router.use('/auth', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/login') {
    return authLimiter(req, res, () => validate(loginSchema)(req, res, next));
  }
  next();
}, authRouter);

router.use(requireAuth);

router.use('/users', usersRouter);
router.use('/use-cases', useCasesRouter);
router.use('/user-stories', userStoriesRouter);
router.use('/preconditions', preconditionsRouter);
router.use('/test-suites', testSuitesRouter);
router.use('/runs', runsRouter);
router.use('/test-cases', testCasesRouter);
router.use('/defects', defectsRouter);
router.use('/hallazgos', hallazgosRouter);
router.use('/import', importRouter);
router.use('/evidence', evidenceRouter);
router.use('/issue', issueRouter);

router.use(jiraRouter);
router.use(statsRouter);
router.use(reportsRouter);
router.use(historyRouter);

router.use('/projects', projectsRouter);

module.exports = router;
