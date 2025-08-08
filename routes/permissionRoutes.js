// routes/permissionRoutes.js
const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const validateMiddleware = require('../utils/validate');
const permissionSchema = require('../validations/permissionValidation');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/',authenticate, validateMiddleware(permissionSchema), permissionController.createPermission);
router.get('/',authenticate, permissionController.getPermissions);
router.get('/:id',authenticate, permissionController.getPermissionById);
router.put('/:id',authenticate, validateMiddleware(permissionSchema), permissionController.updatePermission);
router.delete('/:id',authenticate, permissionController.deletePermission);

module.exports = router;
