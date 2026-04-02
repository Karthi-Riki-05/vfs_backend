const express = require('express');
const router = express.Router();
const projectController = require('../controllers/project.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const {
    createProjectSchema,
    updateProjectSchema,
    idParamSchema,
    assignFlowSchema,
    getProjectsQuerySchema,
} = require('../validators/project.validator');

// All project routes are protected
router.use(authenticate);

router.get('/', validate(getProjectsQuerySchema), projectController.getAllProjects);
router.post('/', validate(createProjectSchema), projectController.createProject);
router.get('/:id', validate(idParamSchema), projectController.getProjectById);
router.put('/:id', validate(updateProjectSchema), projectController.updateProject);
router.delete('/:id', validate(idParamSchema), projectController.deleteProject);
router.post('/:id/assign-flow', validate(assignFlowSchema), projectController.assignFlow);
router.post('/:id/unassign-flow', validate(assignFlowSchema), projectController.unassignFlow);

module.exports = router;
