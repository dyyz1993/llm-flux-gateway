import { Hono } from 'hono';
import { authMiddleware } from '@server/shared/middleware/auth';
import gatewayController from '../controllers/gateway-controller';

const router = new Hono();

// Gateway proxy routes require authentication
router.use('/v1/*', authMiddleware);

// Mount gateway controller routes
router.route('/', gatewayController);

export default router;
