import { Hono } from 'hono';
import systemConfigRoutes from './routes/system-config-routes';
import { systemConfigService } from './services/system-config.service';

// Initialize default configs on module load
systemConfigService.initializeDefaults().catch(console.error);

const app = new Hono();

app.route('/config', systemConfigRoutes);

export default app;
