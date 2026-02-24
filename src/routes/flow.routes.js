const express = require('express');
const router = express.Router();
const flowController = require('../controllers/flow.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All flow routes are protected
router.use(authenticate);

router.get('/', flowController.getAllFlows);
router.get('/:id', flowController.getFlowById);
router.post('/', flowController.createFlow);
router.put('/:id', flowController.updateFlow);
router.put('/:id/diagram', flowController.updateDiagramState);
router.delete('/:id', flowController.deleteFlow);
router.post('/:id/duplicate', flowController.duplicateFlow);

module.exports = router;

