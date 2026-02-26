import { describe, it, expect } from 'vitest';
import { findVendorByModel } from '../utils/logHelpers';
import { Vendor } from '@shared/types';

describe('findVendorByModel - 模型匹配问题测试', () => {
  
  const createVendor = (name: string, models: string[]): Vendor => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    displayName: name,
    baseUrl: `https://api.${name.toLowerCase().replace(/\s+/g, '-')}.com/v1`,
    endpoint: '/chat/completions',
    status: 'active',
    createdAt: new Date(),
    models: models.map(m => ({
      id: `${name.toLowerCase().replace(/\s+/g, '-')}:${m}`,
      modelId: m,
      displayName: m,
      status: 'active',
    })),
  });

  describe('问题重现：当多个 Vendor 配置了相同的模型时', () => {
    
    const vendors: Vendor[] = [
      createVendor('Zhipu AI', ['glm-4-air', 'glm-4-flash', 'glm-4.6', 'glm-4.7']),
      createVendor('Zhipu coding', ['glm-4-air', 'glm-4-flash', 'glm-4.6', 'glm-4.7']),
      createVendor('Zhipu coding anthropic', ['glm-4-air', 'glm-4-flash', 'glm-4.6', 'glm-4.7']),
    ];

    it('当模型在多个 Vendor 中存在时，应该返回第一个匹配的 Vendor（当前行为）', () => {
      // 当前实现：返回遍历中第一个找到的 vendor
      const result = findVendorByModel('glm-4-air', vendors);
      
      // 当前行为：返回第一个匹配的（Zhipu AI）
      expect(result?.name).toBe('Zhipu AI');
    });

    it('问题：无法知道实际请求是通过哪个 route/vendor 发出的', () => {
      // 假设用户实际上是通过 "Zhipu coding" 这个 route 发起请求
      // 但由于 glm-4-air 在多个 vendor 中存在，VendorBadge 会显示第一个匹配到的 "Zhipu AI"
      
      const result = findVendorByModel('glm-4-air', vendors);
      
      // 当前实现会返回 "Zhipu AI"，但实际上可能是 "Zhipu coding"
      console.log('匹配到的 vendor:', result?.name);
      console.log('期望的 vendor（实际请求使用的 route）: Zhipu coding');
      
      // 这就是问题所在：无法从 originalModel 确定实际使用的 vendor
      expect(result?.name).toBe('Zhipu AI'); // 当前行为：总是返回第一个
    });
  });

  describe('正常场景：模型只在一个 Vendor 中存在', () => {
    
    const vendors: Vendor[] = [
      createVendor('OpenAI', ['gpt-4o', 'gpt-3.5-turbo']),
      createVendor('Anthropic', ['claude-3-opus', 'claude-3-sonnet']),
      createVendor('Google', ['gemini-pro']),
    ];

    it('应该正确匹配唯一的 Vendor', () => {
      expect(findVendorByModel('gpt-4o', vendors)?.name).toBe('OpenAI');
      expect(findVendorByModel('claude-3-opus', vendors)?.name).toBe('Anthropic');
      expect(findVendorByModel('gemini-pro', vendors)?.name).toBe('Google');
    });

    it('不存在的模型应该返回 undefined', () => {
      expect(findVendorByModel('unknown-model', vendors)).toBeUndefined();
    });
  });

  describe('边界情况', () => {
    
    it('空模型名应该返回 undefined', () => {
      const vendors = [createVendor('OpenAI', ['gpt-4o'])];
      expect(findVendorByModel('', vendors)).toBeUndefined();
      expect(findVendorByModel(undefined as any, vendors)).toBeUndefined();
    });

    it('空 vendors 列表应该返回 undefined', () => {
      expect(findVendorByModel('gpt-4o', [])).toBeUndefined();
    });
  });
});
