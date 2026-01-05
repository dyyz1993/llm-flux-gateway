/**
 * Simple test runner to verify the streaming-tools scenarios
 * This can be run without the full gateway to check syntax and logic
 */

import { scenarios } from './scenarios/streaming-tools.scenario';

async function main() {
  console.log('Streaming Tools Test Scenarios - Syntax Check\n');
  console.log('=' .repeat(80));

  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`\n📋 Scenario: ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log(`   Config: ${scenario.config.provider} / ${scenario.config.model}`);
    console.log(`   Assertions: ${scenario.assertions.length}`);

    // Check if scenario has required fields
    const hasRequiredFields = !!(
      scenario.name &&
      scenario.description &&
      scenario.config &&
      scenario.execute &&
      scenario.assertions &&
      Array.isArray(scenario.assertions)
    );

    if (hasRequiredFields) {
      console.log(`   ✅ Structure OK`);
      passed++;
    } else {
      console.log(`   ❌ Missing required fields`);
      failed++;
    }

    // Check assertions
    for (const assertion of scenario.assertions) {
      if (!assertion.type || !assertion.validator) {
        console.log(`   ⚠️  Invalid assertion: ${assertion.type || 'unnamed'}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${scenarios.length} scenarios\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error running test:', error);
  process.exit(1);
});
