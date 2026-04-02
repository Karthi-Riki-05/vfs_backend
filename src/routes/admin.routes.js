const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../lib/permissions');
const validate = require('../middleware/validate');
const {
    adminUsersQuerySchema, adminUpdateUserSchema, adminCreatePlanSchema, adminUpdatePlanSchema,
    adminCreateOfferSchema, adminUpdateOfferSchema, adminSubscriptionsQuerySchema,
    adminTransactionsQuerySchema, idParamSchema,
} = require('../validators/admin.validator');

// All admin routes require authentication + admin role
router.use(authenticate, adminOnly);

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: Admin - List all users with filters
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, success, deleted]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated user list
 *       403:
 *         description: Admin access required
 */
router.get('/users', validate(adminUsersQuerySchema), adminController.getUsers);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   put:
 *     summary: Admin - Update user role/status
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *               userStatus:
 *                 type: string
 *                 enum: [draft, success, deleted]
 *               userType:
 *                 type: string
 *                 enum: [free_user, pro_user, admin]
 *     responses:
 *       200:
 *         description: User updated
 */
router.put('/users/:id', validate(adminUpdateUserSchema), adminController.updateUser);

/**
 * @swagger
 * /api/v1/admin/plans:
 *   get:
 *     summary: Admin - List all plans
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of plans
 */
router.get('/plans', adminController.getPlans);

/**
 * @swagger
 * /api/v1/admin/plans:
 *   post:
 *     summary: Admin - Create a plan
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price]
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: string
 *                 enum: [monthly, yearly]
 *               appType:
 *                 type: string
 *                 enum: [enterprise, individual]
 *     responses:
 *       201:
 *         description: Plan created
 */
router.post('/plans', validate(adminCreatePlanSchema), adminController.createPlan);

/**
 * @swagger
 * /api/v1/admin/plans/{id}:
 *   put:
 *     summary: Admin - Update a plan
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plan updated
 */
router.put('/plans/:id', validate(adminUpdatePlanSchema), adminController.updatePlan);

/**
 * @swagger
 * /api/v1/admin/subscriptions:
 *   get:
 *     summary: Admin - Subscription overview
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: appType
 *         schema:
 *           type: string
 *           enum: [enterprise, individual]
 *     responses:
 *       200:
 *         description: Subscription list
 */
router.get('/subscriptions', validate(adminSubscriptionsQuerySchema), adminController.getSubscriptions);

/**
 * @swagger
 * /api/v1/admin/transactions:
 *   get:
 *     summary: Admin - Transaction logs
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction list
 */
router.get('/transactions', validate(adminTransactionsQuerySchema), adminController.getTransactions);

/**
 * @swagger
 * /api/v1/admin/feedback:
 *   get:
 *     summary: Admin - List feedback/queries
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback list
 */
router.get('/feedback', adminController.getFeedback);

/**
 * @swagger
 * /api/v1/admin/offers:
 *   get:
 *     summary: Admin - List offers
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Offer list
 */
router.get('/offers', adminController.getOffers);

/**
 * @swagger
 * /api/v1/admin/offers:
 *   post:
 *     summary: Admin - Create offer/promo
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Offer created
 */
router.post('/offers', validate(adminCreateOfferSchema), adminController.createOffer);

/**
 * @swagger
 * /api/v1/admin/offers/{id}:
 *   put:
 *     summary: Admin - Update offer
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer updated
 */
router.put('/offers/:id', validate(adminUpdateOfferSchema), adminController.updateOffer);

/**
 * @swagger
 * /api/v1/admin/offers/{id}:
 *   delete:
 *     summary: Admin - Delete offer
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer deleted
 */
router.delete('/offers/:id', validate(idParamSchema), adminController.deleteOffer);

/**
 * @swagger
 * /api/v1/admin/stats:
 *   get:
 *     summary: Admin - Dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 */
/**
 * @swagger
 * /api/v1/admin/promocodes:
 *   post:
 *     summary: Admin - Create promo code
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [promoCode]
 *             properties:
 *               promoCode:
 *                 type: string
 *               discountPercentage:
 *                 type: number
 *               validUpto:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Promo code created
 */
router.post('/promocodes', adminController.createPromoCode);

router.get('/stats', adminController.getStats);

module.exports = router;
