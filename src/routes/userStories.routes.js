const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/userStories.controller');
const {
    listUserStoriesSchema,
    createScenarioSchema,
    updateScenarioSchema,
    createInconsistencySchema,
    updateInconsistencySchema,
    createUserStorySchema,
    updateUserStorySchema,
    updateRecommendationsSchema,
    idParamSchema
} = require('../validators/userStories.schema');

router.get('/', requireAuth, validate(listUserStoriesSchema, 'query'), asyncHandler(ctrl.list));

router.post('/scenarios', requireAuth, validate(createScenarioSchema), asyncHandler(ctrl.createScenario));
router.put('/scenarios/:id', requireAuth, validate(idParamSchema, 'params'), validate(updateScenarioSchema), asyncHandler(ctrl.updateScenario));
router.delete('/scenarios/:id', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.deleteScenario));

router.post('/inconsistencies', requireAuth, validate(createInconsistencySchema), asyncHandler(ctrl.createInconsistency));
router.put('/inconsistencies/:id', requireAuth, validate(idParamSchema, 'params'), validate(updateInconsistencySchema), asyncHandler(ctrl.updateInconsistency));
router.delete('/inconsistencies/:id', requireAuth, validate(idParamSchema, 'params'), asyncHandler(ctrl.deleteInconsistency));

router.post('/', requireAuth, validate(createUserStorySchema), asyncHandler(ctrl.createUserStory));
router.put('/:id/recommendations', requireAuth, validate(idParamSchema, 'params'), validate(updateRecommendationsSchema), asyncHandler(ctrl.updateRecommendations));
router.put('/:id', requireAuth, validate(idParamSchema, 'params'), validate(updateUserStorySchema), asyncHandler(ctrl.updateUserStory));
router.delete('/:id', requireAuth, requireAdmin, validate(idParamSchema, 'params'), asyncHandler(ctrl.deleteUserStory));

module.exports = router;
