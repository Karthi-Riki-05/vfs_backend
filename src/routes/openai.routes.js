const express = require('express');
const router = express.Router();
const openaiController = require('../controllers/openai.controller');

router.post('/', openaiController.proxy);

module.exports = router;
