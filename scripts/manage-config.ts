/**
 * 配置管理 CLI
 *
 * 聊天也能配，CLI 也能配，坏了还能恢复。
 *
 * 用法:
 *   npx tsx scripts/manage-config.ts --help
 *   npx tsx scripts/manage-config.ts list
 *   npx tsx scripts/manage-config.ts quick-setup --provider=opencode-go --key=sk-xxx
 *   npx tsx scripts/manage-config.ts add-vendor --name=xxx --baseUrl=xxx
 *   npx tsx scripts/manage-config.ts add-key --name=xxx --key=sk-xxx
 *   npx tsx scripts/manage-config.ts add-route --name=xxx --model=gpt-4 --upstream=deepseek --vendor=opencode-go
 *   npx tsx scripts/manage-config.ts backup
 *   npx tsx scripts/manage-config.ts restore --snap=snap_xxx
 *   npx tsx scripts/manage-config.ts rollback --snap=snap_xxx
 */
import * as tools from '../src/server/config-manager/tools';

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help') {
    console.log(`
用法:
  manage-config.ts list                       查看当前配置
  manage-config.ts quick-setup                快速配置（用 pi-ai 内置厂商）
    --provider=opencode-go                      厂商 ID
    --key=sk-xxx                                 API Key
    --name="My Key"                              名称（可选）
    --models=gpt-4,gpt-4o                       模型列表（可选）
  manage-config.ts add-vendor                  添加厂商
    --name="OpenCode Go"
    --baseUrl=https://opencode.ai/zen/go/v1
    --endpoint=/chat/completions                （可选）
    --models=m1,m2,m3                           （可选）
  manage-config.ts add-key                     添加 API Key
    --name="My Key"
    --key=sk-xxx
  manage-config.ts add-route                   添加路由
    --name="my-route"
    --model=gpt-4o,deepseek                     匹配模型名（逗号分隔）
    --upstream=deepseek-v4-flash                上游模型名
    --vendor=opencode-go                        厂商 ID
    --api-key=sk-xxx                            或 --key-id=xxx
  manage-config.ts bind                        绑定路由到 Key
    --route=route-id
    --key=key-id
  manage-config.ts delete-vendor --id=xxx      删除厂商
  manage-config.ts delete-route --id=xxx       删除路由
  manage-config.ts backup                       创建备份
  manage-config.ts list-backups                 查看备份
  manage-config.ts restore --snap=snap_xxx      恢复备份
  manage-config.ts rollback --snap=snap_xxx     回滚到备份
    `);
    return;
  }

  // 解析参数
  function getArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const arg = args.find(a => a.startsWith(prefix));
    return arg?.slice(prefix.length);
  }

  switch (cmd) {
    case 'list': {
      console.log('\n📋 当前配置:\n');
      console.log('--- 厂商 ---');
      console.table(await tools.listVendors());
      console.log('--- API Keys ---');
      console.table(await tools.listApiKeys());
      console.log('--- 路由 ---');
      console.table(await tools.listRoutes());
      console.log('--- Key 绑定 ---');
      console.table(await tools.listRouteKeyBindings());
      break;
    }

    case 'quick-setup': {
      const provider = getArg('provider');
      const key = getArg('key');
      const name = getArg('name');
      const modelsStr = getArg('models');

      if (!provider || !key) {
        console.error('❌ 需要 --provider 和 --key');
        process.exit(1);
      }

      console.log(`\n🚀 快速配置: ${provider}...\n`);
      const result = await tools.quickSetup({
        providerId: provider,
        apiKey: key,
        keyName: name,
        models: modelsStr?.split(','),
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'add-vendor': {
      const name = getArg('name');
      const baseUrl = getArg('baseUrl');
      const endpoint = getArg('endpoint');
      const modelsStr = getArg('models');

      if (!name || !baseUrl) {
        console.error('❌ 需要 --name 和 --baseUrl');
        process.exit(1);
      }

      const result = await tools.addVendor({
        name,
        baseUrl,
        endpoint,
        models: modelsStr?.split(','),
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'add-key': {
      const name = getArg('name');
      const key = getArg('key');

      if (!name || !key) {
        console.error('❌ 需要 --name 和 --key');
        process.exit(1);
      }

      const result = await tools.addApiKey({ name, key });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'add-route': {
      const name = getArg('name');
      const model = getArg('model');
      const upstream = getArg('upstream');
      const vendor = getArg('vendor');
      const apiKey = getArg('api-key');
      const keyId = getArg('key-id');

      if (!name || !model || !upstream || !vendor) {
        console.error('❌ 需要 --name --model --upstream --vendor');
        process.exit(1);
      }

      const result = await tools.addRoute({
        name,
        modelPattern: model.split(','),
        upstreamModel: upstream,
        vendorId: vendor,
        apiKey: apiKey,
        apiKeyId: keyId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'bind': {
      const route = getArg('route');
      const key = getArg('key');
      if (!route || !key) {
        console.error('❌ 需要 --route 和 --key');
        process.exit(1);
      }
      const result = await tools.bindRouteToKey(route, key);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'delete-vendor': {
      const id = getArg('id');
      if (!id) { console.error('❌ 需要 --id'); process.exit(1); }
      const result = await tools.deleteVendor(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'delete-route': {
      const id = getArg('id');
      if (!id) { console.error('❌ 需要 --id'); process.exit(1); }
      const result = await tools.deleteRoute(id);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'backup': {
      const desc = getArg('desc') || '手动备份';
      const result = tools.backup(desc);
      console.log(`✅ 备份创建成功: ${result.id}`);
      break;
    }

    case 'list-backups': {
      const backups = tools.showBackups();
      console.table(backups);
      break;
    }

    case 'restore':
    case 'rollback': {
      const snap = getArg('snap');
      if (!snap) { console.error('❌ 需要 --snap=snap_xxx'); process.exit(1); }
      const result = tools.rollback(snap);
      console.log(JSON.stringify(result));
      break;
    }

    default:
      console.error(`❌ 未知命令: ${cmd}`);
      console.log('使用 --help 查看帮助');
      process.exit(1);
  }
}

main().catch(console.error);
