import { queryRun, initDatabase } from '../src/server/shared/database';
import { randomUUID } from 'node:crypto';

/**
 * Seed database with test data
 */
async function seedData() {
  // Initialize database schema first
  initDatabase();
  console.log('[Seed] Starting data seeding...');

  // ============================================
  // Step 1: Create Vendor Templates
  // ============================================
  console.log('[Seed] Creating vendor templates...');

  const vendors = [
    { id: 'openai', name: 'openai', displayName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', iconUrl: '/icons/openai.svg' },
    { id: 'anthropic', name: 'anthropic', displayName: 'Anthropic', baseUrl: 'https://api.anthropic.com', iconUrl: '/icons/anthropic.svg' },
    { id: 'google', name: 'google', displayName: 'Google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', iconUrl: '/icons/google.svg' },
  ];

  for (const v of vendors) {
    queryRun(`
      INSERT INTO vendor_templates (id, name, display_name, base_url, icon_url, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `, [v.id, v.name, v.displayName, v.baseUrl, v.iconUrl, Date.now()]);
    console.log(`[Seed]   - Created vendor: ${v.displayName}`);
  }

  // ============================================
  // Step 2: Create Vendor Models
  // ============================================
  console.log('[Seed] Creating vendor models...');

  const models = [
    // OpenAI Models
    { id: 'openai-gpt4', vendorId: 'openai', modelId: 'gpt-4', displayName: 'GPT-4', description: 'Most capable GPT-4 model' },
    { id: 'openai-gpt4-turbo', vendorId: 'openai', modelId: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', description: 'Latest GPT-4 Turbo' },
    { id: 'openai-gpt4o', vendorId: 'openai', modelId: 'gpt-4o', displayName: 'GPT-4o', description: 'Multimodal omni model' },
    { id: 'openai-gpt35-turbo', vendorId: 'openai', modelId: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', description: 'Fast and cost effective' },

    // Anthropic Models
    { id: 'anthropic-claude-35-sonnet', vendorId: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', description: 'Latest Sonnet' },
    { id: 'anthropic-claude-35-haiku', vendorId: 'anthropic', modelId: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', description: 'Latest Haiku' },
    { id: 'anthropic-claude-3-opus', vendorId: 'anthropic', modelId: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', description: 'Most powerful Claude' },
    { id: 'anthropic-claude-3-sonnet', vendorId: 'anthropic', modelId: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet', description: 'Balanced performance' },

    // Google Models
    { id: 'google-gemini-pro', vendorId: 'google', modelId: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', description: 'Google Pro model' },
    { id: 'google-gemini-flash', vendorId: 'google', modelId: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', description: 'Fast and efficient' },
  ];

  for (const m of models) {
    queryRun(`
      INSERT INTO vendor_models (id, vendor_id, model_id, display_name, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `, [m.id, m.vendorId, m.modelId, m.displayName, m.description, Date.now()]);
  }
  console.log(`[Seed]   - Created ${models.length} vendor models`);

  // ============================================
  // Step 3: Create Test Asset
  // ============================================
  console.log('[Seed] Creating test assets...');

  const assetId = randomUUID();
  const geminiKey = process.env.GEMINI_API_KEY || 'your-gemini-key-here';
  const now = Date.now();

  queryRun(`
    INSERT INTO assets (id, name, vendor_id, api_key, budget, balance, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, [assetId, 'Google Gemini Test Account', 'google', geminiKey, 10000, 10000, now, now]);

  console.log(`[Seed]   - Created asset: ${assetId}`);

  // Link models to asset
  const assetModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  for (const modelId of assetModels) {
    queryRun(`
      INSERT INTO asset_models (id, asset_id, model_id, created_at)
      VALUES (?, ?, ?, ?)
    `, [randomUUID(), assetId, modelId, now]);
  }
  console.log(`[Seed]   - Linked ${assetModels.length} models to asset`);

  // ============================================
  // Step 4: Create Test Route (linked to asset)
  // ============================================
  console.log('[Seed] Creating test routes...');

  const routeId = randomUUID();
  const overrides = JSON.stringify([
    {
      field: 'model',
      matchValues: ['gpt-3.5-turbo', 'gpt-4', 'gemini-test', '*'],
      rewriteValue: 'gemini-1.5-flash',
    },
  ]);

  queryRun(`
    INSERT INTO routes (id, name, asset_id, is_active, overrides, config_type, priority, request_format, response_format, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, 'json', 100, 'openai', 'openai', ?, ?)
  `, [routeId, 'Gemini Test Route', assetId, overrides, now, now]);

  console.log(`[Seed]   - Created route: ${routeId}`);

  // ============================================
  // Step 5: Create Test API Key
  // ============================================
  console.log('[Seed] Creating test API keys...');

  const testKeyId = randomUUID();
  queryRun(`
    INSERT INTO api_keys (id, key_token, name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `, [testKeyId, 'sk-flux-test-key-123', 'Test Client', now, now]);

  console.log(`[Seed]   - Created API key: ${testKeyId}`);
  console.log('[Seed]   - Key Token: sk-flux-test-key-123');

  // Link route to key
  queryRun(`
    INSERT INTO api_key_routes (id, api_key_id, route_id, priority, created_at)
    VALUES (?, ?, ?, 100, ?)
  `, [randomUUID(), testKeyId, routeId, now]);

  console.log(`[Seed]   - Linked route to key`);

  console.log('[Seed] Seeding complete!');
  console.log('');
  console.log('You can now test with:');
  console.log('  curl -H "Authorization: Bearer sk-flux-test-key-123" \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello!"}]}\' \\');
  console.log('    http://localhost:3000/v1/chat/completions');
}

seedData().catch(console.error);
