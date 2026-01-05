import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, ChevronUp, Plus, Trash2, Edit2 } from 'lucide-react';
import { BUILTIN_PRESETS, SystemPromptStorage } from '@client/services/systemPromptStorage';
import type { SystemPreset } from '@shared/types';

interface SystemPromptPanelProps {
  onUpdate: (prompt: string | null) => void;
  disabled?: boolean;
}

/**
 * System prompt configuration panel
 */
export const SystemPromptPanel: React.FC<SystemPromptPanelProps> = ({ onUpdate, disabled }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState(SystemPromptStorage.get());
  const [customPrompt, setCustomPrompt] = useState(settings.customPrompt);
  const [editingPreset, setEditingPreset] = useState<string | null>(null as any);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetContent, setNewPresetContent] = useState('');
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loaded = SystemPromptStorage.get();
    setSettings(loaded);
    setCustomPrompt(loaded.customPrompt);
  }, []);

  // Notify parent of effective prompt
  useEffect(() => {
    const effective = SystemPromptStorage.getEffectivePrompt();
    onUpdate(effective);
  }, [settings, onUpdate]);

  const allPresets = [...BUILTIN_PRESETS, ...settings.customPresets];

  const handleToggleEnabled = () => {
    const updated = { ...settings, enabled: !settings.enabled };
    setSettings(updated);
    SystemPromptStorage.save(updated);
  };

  const handleSelectPreset = (presetId: string | null) => {
    const updated = { ...settings, selectedPresetId: presetId, customPrompt: '' };
    setSettings(updated);
    setCustomPrompt('');
    SystemPromptStorage.save(updated);
  };

  const handleCustomPromptChange = (value: string) => {
    setCustomPrompt(value);
    const updated = { ...settings, customPrompt: value, selectedPresetId: null };
    setSettings(updated);
    SystemPromptStorage.save(updated);
  };

  const handleStartEditPreset = (preset: SystemPreset) => {
    if (preset.category === 'custom') {
      setEditingPreset(preset.id);
      setNewPresetName(preset.name);
      setNewPresetContent(preset.content);
    }
  };

  const handleSavePreset = () => {
    if (editingPreset) {
      SystemPromptStorage.updateCustomPreset(editingPreset, {
        name: newPresetName,
        content: newPresetContent,
      });
      const updated = SystemPromptStorage.get();
      setSettings(updated);
      setEditingPreset(null);
    } else if (showNewPresetForm) {
      SystemPromptStorage.addCustomPreset({
        name: newPresetName,
        content: newPresetContent,
        category: 'custom',
        description: '自定义预设',
      });
      const updated = SystemPromptStorage.get();
      setSettings(updated);
      setShowNewPresetForm(false);
    }
    setNewPresetName('');
    setNewPresetContent('');
  };

  const handleDeletePreset = (presetId: string) => {
    if (confirm('删除此预设？')) {
      SystemPromptStorage.deleteCustomPreset(presetId);
      const updated = SystemPromptStorage.get();
      setSettings(updated);
    }
  };

  const effectivePrompt = SystemPromptStorage.getEffectivePrompt();

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg font-bold transition-all ${
          disabled
            ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
            : 'bg-[#1a1a1a] hover:bg-[#222] text-gray-400 border border-[#262626]'
        }`}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-orange-500" />
          <span className="text-sm">System Prompt</span>
          {settings.enabled && effectivePrompt && (
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded">
              Active
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronUp className="w-4 h-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 p-4 bg-[#111] border border-[#262626] rounded-lg">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#262626]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={handleToggleEnabled}
                disabled={disabled}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm font-medium text-white">启用系统提示词</span>
            </label>
            {effectivePrompt && (
              <div className="text-[10px] text-gray-500">
                {effectivePrompt.slice(0, 50)}...
              </div>
            )}
          </div>

          {settings.enabled && (
            <>
              {/* Mode Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleSelectPreset(null)}
                  disabled={disabled}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${
                    !settings.selectedPresetId
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-400'
                  }`}
                >
                  自定义
                </button>
                <button
                  onClick={() => handleSelectPreset('general')}
                  disabled={disabled}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-all ${
                    settings.selectedPresetId === 'general'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-400'
                  }`}
                >
                  预设
                </button>
              </div>

              {/* Custom Prompt Input */}
              {!settings.selectedPresetId && (
                <div className="mb-4">
                  <label className="text-xs text-gray-500 font-semibold uppercase mb-2 block">
                    自定义系统提示词
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={e => handleCustomPromptChange(e.target.value)}
                    disabled={disabled}
                    placeholder="输入自定义系统提示词..."
                    className="w-full h-24 bg-[#0a0a0a] border border-[#333] text-white text-sm p-3 rounded-lg focus:border-indigo-600 focus:outline-none resize-none disabled:opacity-50"
                  />
                </div>
              )}

              {/* Presets */}
              {settings.selectedPresetId !== null && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500 font-semibold uppercase">
                      预设提示词
                    </label>
                    {!showNewPresetForm && (
                      <button
                        onClick={() => setShowNewPresetForm(true)}
                        disabled={disabled}
                        className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                      >
                        <Plus className="w-3 h-3" />
                        新建
                      </button>
                    )}
                  </div>

                  {/* New Preset Form */}
                  {showNewPresetForm && (
                    <div className="p-3 bg-[#0a0a0a] border border-indigo-600/30 rounded-lg mb-2 space-y-2">
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={e => setNewPresetName(e.target.value)}
                        placeholder="预设名称"
                        className="w-full bg-[#111] border border-[#333] text-white text-sm px-3 py-2 rounded focus:border-indigo-600 focus:outline-none"
                      />
                      <textarea
                        value={newPresetContent}
                        onChange={e => setNewPresetContent(e.target.value)}
                        placeholder="预设内容..."
                        className="w-full h-20 bg-[#111] border border-[#333] text-white text-sm p-3 rounded focus:border-indigo-600 focus:outline-none resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSavePreset}
                          disabled={!newPresetName || !newPresetContent}
                          className="flex-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded disabled:opacity-50"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => {
                            setShowNewPresetForm(false);
                            setNewPresetName('');
                            setNewPresetContent('');
                          }}
                          className="px-3 py-1 bg-[#262626] hover:bg-[#333] text-gray-400 text-xs rounded"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Preset List */}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {allPresets.map(preset => {
                      const isEditing = editingPreset === preset.id;
                      const isSelected = settings.selectedPresetId === preset.id;
                      const isCustom = preset.category === 'custom';

                      return (
                        <div
                          key={preset.id}
                          className={`p-2 rounded-lg transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 border border-indigo-600/30'
                              : 'bg-[#0a0a0a] border border-[#262626] hover:bg-[#151515]'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={newPresetName}
                                onChange={e => setNewPresetName(e.target.value)}
                                className="w-full bg-[#111] border border-[#333] text-white text-sm px-2 py-1 rounded"
                              />
                              <textarea
                                value={newPresetContent}
                                onChange={e => setNewPresetContent(e.target.value)}
                                className="w-full h-16 bg-[#111] border border-[#333] text-white text-xs p-2 rounded resize-none"
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={handleSavePreset}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] rounded"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingPreset(null);
                                    setNewPresetName('');
                                    setNewPresetContent('');
                                  }}
                                  className="px-2 py-1 bg-[#262626] hover:bg-[#333] text-gray-400 text-[10px] rounded"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <button
                                onClick={() => !disabled && handleSelectPreset(preset.id)}
                                disabled={disabled}
                                className="flex-1 text-left"
                              >
                                <div className={`text-xs font-medium ${
                                  isSelected ? 'text-indigo-400' : 'text-gray-300'
                                }`}>
                                  {preset.name}
                                </div>
                                <div className="text-[10px] text-gray-600 mt-0.5">
                                  {preset.description || preset.content.slice(0, 50) + '...'}
                                </div>
                              </button>

                              {isCustom && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleStartEditPreset(preset)}
                                    disabled={disabled}
                                    className="p-1 hover:bg-[#262626] rounded"
                                  >
                                    <Edit2 className="w-3 h-3 text-gray-500" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePreset(preset.id)}
                                    disabled={disabled}
                                    className="p-1 hover:bg-red-600/20 rounded"
                                  >
                                    <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
