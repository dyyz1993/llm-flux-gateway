#!/usr/bin/env node

/**
 * Test script to verify API responses contain model data
 */

const DB_PATH = '/Users/xuyingzhou/Downloads/llm-flux-gateway/data/gateway.db';

// Simulate what the backend code does
function testDatabaseQueries() {
  const { execSync } = require('child_process');

  console.log('=== Testing Database Queries ===\n');

  // 1. Check API key
  console.log('1. API Key:');
  const keyQuery = `sqlite3 ${DB_PATH} "SELECT id, key_token, name FROM api_keys WHERE key_token = 'sk-flux-67cbd171abb64dcbb06826b3852f3fec';"`;
  console.log(execSync(keyQuery, { encoding: 'utf8' }));

  // 2. Check key routes
  console.log('\n2. Key Routes (getKeyRoutes):');
  const routesQuery = `sqlite3 ${DB_PATH} "
    SELECT
      kr.route_id as routeId,
      rt.name as routeName,
      kr.priority as priority
    FROM api_key_routes kr
    INNER JOIN routes rt ON kr.route_id = rt.id
    WHERE kr.api_key_id = (SELECT id FROM api_keys WHERE key_token = 'sk-flux-67cbd171abb64dcbb06826b3852f3fec')
    ORDER BY kr.priority ASC;
  "`;
  console.log(execSync(routesQuery, { encoding: 'utf8' }));

  // 3. Check route assetModels (with DISTINCT)
  console.log('\n3. Route assetModels (with DISTINCT):');
  const assetModelsQuery = `sqlite3 ${DB_PATH} "
    SELECT DISTINCT model_id
    FROM asset_models
    WHERE asset_id = (SELECT asset_id FROM routes WHERE id = 'b5966947-3677-42a9-bf5f-b2e11d146d37');
  "`;
  console.log(execSync(assetModelsQuery, { encoding: 'utf8' }));

  // 4. Check asset models (with JOIN)
  console.log('\n4. Asset models (getAssetModels):');
  const modelsQuery = `sqlite3 ${DB_PATH} "
    SELECT
      vm.id,
      vm.model_id as modelId,
      vm.display_name as displayName,
      vm.description
    FROM asset_models am
    INNER JOIN assets a ON am.asset_id = a.id
    INNER JOIN vendor_models vm ON am.model_id = vm.model_id AND a.vendor_id = vm.vendor_id
    WHERE am.asset_id = (SELECT asset_id FROM routes WHERE id = 'b5966947-3677-42a9-bf5f-b2e11d146d37');
  "`;
  console.log(execSync(modelsQuery, { encoding: 'utf8' }));

  console.log('\n=== All queries completed ===');
}

testDatabaseQueries();
