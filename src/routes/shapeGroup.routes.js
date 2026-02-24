const express = require('express');
const router = express.Router();
const shapeGroupController = require('../controllers/shapeGroup.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', shapeGroupController.getAllGroups);
router.post('/', shapeGroupController.createGroup);

module.exports = router;
