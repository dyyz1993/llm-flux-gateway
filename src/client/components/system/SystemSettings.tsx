import React, { useState, useEffect } from 'react';
import { Settings, Database, Shield, Activity, RefreshCw } from 'lucide-react';

interface SystemConfig {
  key: string;
  value: string;
  category: string;
  dataType: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  isReadOnly: boolean;
  updatedAt: string;
}

interface ConfigGroup {
  category: string;
  icon: any;
  title: string;
  configs: SystemConfig[];
}

// Category icons and titles
const CATEGORY_INFO: Record<string, { icon: any; title: string }> = {
  log: { icon: Activity, title: '日志管理' },
  api: { icon: Shield, title: 'API 配置' },
  monitoring: { icon: Settings, title: '监控设置' },
  database: { icon: Database, title: '数据库设置' },
};

export const SystemSettings: React.FC = () => {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [groupedConfigs, setGroupedConfigs] = useState<ConfigGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [_saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch all configs
  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/system/config');
      const data = await response.json();
      if (data.success) {
        setConfigs(data.data!);
      }
    } catch (error) {
      console.error('Failed to fetch configs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  // Group configs by category
  useEffect(() => {
    const groups: Record<string, SystemConfig[]> = {};
    configs.forEach((config) => {
      if (!groups[config.category]) {
        groups[config.category] = [];
      }
      groups[config.category]!.push(config);
    });

    const grouped = Object.entries(groups).map(([category, configs]) => ({
      category,
      ...CATEGORY_INFO[category],
      configs,
    } as any));

    setGroupedConfigs(grouped);
  }, [configs]);

  // Update a config value
  const updateConfig = async (key: string, value: any, dataType: string) => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/system/config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, dataType }),
      });

      const data = await response.json();
      if (data.success) {
        // Update local state
        setConfigs((prev) =>
          prev.map((c) => (c.key === key ? { ...c, value: String(value) } : c))
        );
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Failed to update config:', error);
    } finally {
      setSaving(false);
    }
  };

  // Render input based on data type
  const renderInput = (config: SystemConfig) => {
    if (config.isReadOnly) {
      return (
        <input
          type="text"
          value={config.value}
          disabled
          className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-gray-500 cursor-not-allowed"
        />
      );
    }

    switch (config.dataType) {
      case 'boolean':
        return (
          <select
            value={config.value}
            onChange={(e) => updateConfig(config.key, e.target.value === 'true', config.dataType)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-gray-300 focus:border-indigo-600 focus:outline-none"
          >
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={config.value}
            onChange={(e) => updateConfig(config.key, parseFloat(e.target.value), config.dataType)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-gray-300 focus:border-indigo-600 focus:outline-none"
          />
        );

      default:
        return (
          <input
            type="text"
            value={config.value}
            onChange={(e) => updateConfig(config.key, e.target.value, config.dataType)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-gray-300 focus:border-indigo-600 focus:outline-none"
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">系统配置</h2>
          <p className="text-gray-500 mt-1">管理系统运行时配置</p>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-sm text-emerald-500 flex items-center gap-1">
              ✓ 保存成功
            </span>
          )}
          <button
            onClick={fetchConfigs}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg text-gray-300 hover:bg-[#222] hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      {/* Config Groups */}
      {groupedConfigs.map((group) => {
        const Icon = group.icon;
        return (
          <div key={group.category} className="bg-[#0a0a0a] border border-[#262626] rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#262626] bg-[#111]">
              <Icon className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-semibold">{group.title}</h3>
            </div>
            <div className="divide-y divide-[#262626]">
              {group.configs.map((config) => (
                <div key={config.key} className="px-6 py-4 hover:bg-[#0f0f0f] transition-colors">
                  <div className="flex items-start justify-between gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-300">
                          {config.description || config.key}
                        </h4>
                        {config.isReadOnly && (
                          <span className="text-xs px-2 py-0.5 bg-[#333] text-gray-500 rounded">
                            只读
                          </span>
                        )}
                      </div>
                      {config.description && (
                        <p className="text-sm text-gray-500">{config.key}</p>
                      )}
                    </div>
                    <div className="w-64">
                      {renderInput(config)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {groupedConfigs.length === 0 && (
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-12 text-center">
          <Settings className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">暂无配置项</h3>
          <p className="text-sm text-gray-600">系统配置将在首次启动时自动初始化</p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">配置优先级</h4>
        <div className="text-xs text-gray-500 space-y-1">
          <p>1. <strong className="text-indigo-400">运行时配置</strong> - 通过此界面修改，即时生效</p>
          <p>2. 环境变量 - 需要重启服务</p>
          <p>3. 代码默认值 - 最低优先级</p>
        </div>
      </div>
    </div>
  );
};
