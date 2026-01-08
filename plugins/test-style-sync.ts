#!/usr/bin/env tsx

/**
 * 测试样式同步功能
 * 验证 Vite 插件能否正确同步数据到独立服务
 */

async function testSync() {
  console.log('🧪 测试样式同步功能...\n');

  // 测试数据
  const testData = {
    'style-test123': {
      file: 'src/test.css',
      line: 10,
      column: 2,
      selector: '.test-class',
      type: 'css'
    }
  };

  // 1. 发送 PUT 请求
  console.log('1️⃣  发送 PUT 请求到独立服务...');
  try {
    const putResponse = await fetch('http://localhost:3001/api/style-map', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    if (putResponse.ok) {
      const result = await putResponse.json();
      console.log('   ✅ PUT 请求成功:', result);
    } else {
      console.error('   ❌ PUT 请求失败:', putResponse.status, putResponse.statusText);
      process.exit(1);
    }
  } catch (error) {
    console.error('   ❌ 无法连接到独立服务:', error);
    console.log('   💡 请确保独立服务正在运行 (npx tsx plugins/start-style-jump-server.ts)');
    process.exit(1);
  }

  // 2. 验证数据已同步
  console.log('\n2️⃣  验证数据已同步...');
  try {
    const getResponse = await fetch('http://localhost:3001/api/style-map');

    if (getResponse.ok) {
      const data = await getResponse.json();
      const keys = Object.keys(data);

      console.log(`   ✅ GET 请求成功, 共 ${keys.length} 条数据`);

      if (keys.includes('style-test123')) {
        console.log('   ✅ 测试数据已成功同步');
        console.log('\n📋 同步的数据:');
        console.log(JSON.stringify(data['style-test123'], null, 2));
      } else {
        console.log('   ⚠️  测试数据未找到');
        console.log('   当前数据:', data);
      }
    } else {
      console.error('   ❌ GET 请求失败:', getResponse.status, getResponse.statusText);
    }
  } catch (error) {
    console.error('   ❌ GET 请求出错:', error);
  }

  console.log('\n✅ 测试完成!');
}

testSync().catch(console.error);
