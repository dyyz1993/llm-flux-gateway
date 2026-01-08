/**
 * 样式跳转运行时
 *
 * 在浏览器中运行，提供：
 * 1. 加载样式映射表
 * 2. 快捷键监听 (Cmd+Shift+J)
 * 3. 渲染样式 ID 标签
 * 4. 点击跳转到编辑器
 */

import { type StyleLocation } from './index';

// ============================================================
// 全局状态
// ============================================================

interface State {
  /** 样式映射表 */
  styleMap: Record<string, StyleLocation>;
  /** 是否显示检查器 */
  showInspector: boolean;
  /** 已渲染的标签元素 */
  badges: HTMLElement[];
}

const state: State = {
  styleMap: {},
  showInspector: false,
  badges: [],
};

// ============================================================
// 核心功能
// ============================================================

/**
 * 初始化样式跳转功能
 *
 * @param mapUrl - 映射表 URL (默认: /style-map.json)
 */
export async function setupStyleJumper(mapUrl: string = '/style-map.json') {
  console.log('[style-jumper] 🚀 Initializing...');

  // 1. 加载映射表
  await loadStyleMap(mapUrl);

  // 2. 监听快捷键
  setupHotkeyListener();

  // 3. 设置点击委托
  setupClickDelegation();

  console.log('[style-jumper] ✅ Ready! Press Cmd+Option+S (Mac) or Ctrl+Alt+S (Windows) to toggle inspector');
}

/**
 * 加载样式映射表
 */
async function loadStyleMap(_url: string): Promise<void> {
  try {
    // 优先从独立服务加载（通过 Vite 代理）
    const response = await fetch('/__style_jump/api/style-map');
    if (!response.ok) {
      console.warn('[style-jumper] ⚠️  Style map not found, using fallback mode...');
      // 降级模式：使用内联映射
      state.styleMap = generateFallbackMap();
      return;
    }

    const text = await response.text();
    if (!text || text.startsWith('<!DOCTYPE')) {
      console.warn('[style-jumper] ⚠️  Style map is HTML, using fallback mode...');
      state.styleMap = generateFallbackMap();
      return;
    }

    state.styleMap = JSON.parse(text);
    console.log(`[style-jumper] 📋 Loaded ${Object.keys(state.styleMap).length} style mappings`);

    // 为 DOM 元素注入 data-style-id
    injectStyleIds();
  } catch (error) {
    console.error('[style-jumper] ❌ Failed to load style map:', error);
    console.log('[style-jumper] 📋 Using fallback mode with basic mappings');
    state.styleMap = generateFallbackMap();
  }
}

/**
 * 为 DOM 元素注入 data-style-id 属性
 */
function injectStyleIds() {
  let injectedCount = 0;

  // 遍历样式映射表
  for (const [styleId, location] of Object.entries(state.styleMap)) {
    if (!location.selector) continue;

    try {
      // 查找匹配该选择器的所有元素
      const elements = document.querySelectorAll(location.selector);

      // 为每个元素添加 data-style-id
      elements.forEach((element) => {
        // 如果已经有 data-style-id，跳过（避免覆盖）
        if (element.hasAttribute('data-style-id')) {
          return;
        }

        element.setAttribute('data-style-id', styleId);
        injectedCount++;
      });
    } catch (error) {
      // 选择器可能无效，跳过
      console.log(`[style-jumper] ⚠️  无效选择器: ${location.selector}`);
    }
  }

  console.log(`[style-jumper] ✅ 为 ${injectedCount} 个元素注入了 data-style-id`);

  // 如果没有找到任何元素，可能是因为 DOM 还没准备好
  // 使用重试机制定期尝试注入
  if (injectedCount === 0 && Object.keys(state.styleMap).length > 0) {
    console.log('[style-jumper] ⏳ 没有找到元素，DOM 可能还没准备好，将定期重试...');

    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = 500; // 500ms

    const retryTimer = setInterval(() => {
      retryCount++;
      const count = injectStyleIdsInternal();

      if (count > 0 || retryCount >= maxRetries) {
        clearInterval(retryTimer);
        if (count > 0) {
          console.log(`[style-jumper] ✅ 重试成功：第 ${retryCount} 次尝试注入了 ${count} 个元素`);
        } else {
          console.log('[style-jumper] ⚠️  达到最大重试次数，停止注入');
        }
      }
    }, retryInterval);

    // 同时设置 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      const count = injectStyleIdsInternal();
      if (count > 0) {
        clearInterval(retryTimer);
        observer.disconnect();
        console.log(`[style-jumper] ✅ DOM 变化触发：注入了 ${count} 个元素`);
      }
    });

    // 等待 body 元素存在
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      // 如果 body 还不存在，等待 DOMContentLoaded
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      });
    }

    // 5秒后自动清理
    setTimeout(() => {
      clearInterval(retryTimer);
      observer.disconnect();
    }, 5000);
  }
}

/**
 * 内部注入函数（不触发观察器）
 * @returns 注入的元素数量
 */
function injectStyleIdsInternal(): number {
  let injectedCount = 0;

  for (const [styleId, location] of Object.entries(state.styleMap)) {
    if (!location.selector) continue;

    try {
      const elements = document.querySelectorAll(location.selector);

      elements.forEach((element) => {
        if (element.hasAttribute('data-style-id')) {
          return;
        }

        element.setAttribute('data-style-id', styleId);
        injectedCount++;
      });
    } catch (error) {
      console.log(`[style-jumper] ⚠️  无效选择器: ${location.selector}`);
    }
  }

  return injectedCount;
}

/**
 * 生成降级映射表（当 style-map.json 不可用时）
 */
function generateFallbackMap(): Record<string, StyleLocation> {
  // 扫描页面中的 <style> 标签和 link 标签
  const styleSheets = Array.from(document.styleSheets);
  const fallbackMap: Record<string, StyleLocation> = {};

  styleSheets.forEach((sheet, idx) => {
    if (sheet.href) {
      // 为每个样式表创建一个基本映射
      fallbackMap[`style-sheet-${idx}`] = {
        file: sheet.href.toString(),
        line: 1,
        column: 1,
        selector: '*',
        type: 'css'
      };
    }
  });

  console.log(`[style-jumper] 📋 Generated ${Object.keys(fallbackMap).length} fallback mappings`);
  return fallbackMap;
}

/**
 * 设置快捷键监听 (Cmd+Option+S / Ctrl+Alt+S)
 *
 * 为什么用这个组合：
 * - Cmd+Shift+J 在 Chrome 是打开下载页面
 * - Cmd+Option+S 在浏览器中通常没有被占用
 * - S 代表 "Style" 或 "Source"
 */
function setupHotkeyListener() {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    const optKey = e.altKey; // Mac 的 Option, Windows 的 Alt

    // Cmd+Option+S (Mac) 或 Ctrl+Alt+S (Windows/Linux)
    // 使用 e.code 而不是 e.key，避免键盘布局问题（如德语键盘 Option+S = ß）
    if (modKey && optKey && e.code === 'KeyS') {
      e.preventDefault();
      toggleInspector();
    }
  });
}

/**
 * 切换检查器显示状态
 */
function toggleInspector() {
  state.showInspector = !state.showInspector;

  if (state.showInspector) {
    console.log('[style-jumper] 👁️  Inspector ON');
    renderBadges();
    document.body.classList.add('style-inspector-active');
  } else {
    console.log('[style-jumper] 👁️‍🗨️  Inspector OFF');
    clearBadges();
    document.body.classList.remove('style-inspector-active');
  }
}

/**
 * 渲染所有样式标签
 */
function renderBadges() {
  // 清除旧标签
  clearBadges();

  // 查找所有带 data-style-id 的元素
  const elements = document.querySelectorAll('[data-style-id]');
  console.log(`[style-jumper] 🏷️  Found ${elements.length} styled elements`);

  elements.forEach((element) => {
    const styleId = element.getAttribute('data-style-id');
    if (!styleId) return;

    const badge = createBadge(styleId, element as HTMLElement);
    document.body.appendChild(badge);
    state.badges.push(badge);
  });
}

/**
 * 清除所有标签
 */
function clearBadges() {
  state.badges.forEach((badge) => badge.remove());
  state.badges = [];
}

/**
 * 检查是否为虚拟文件（Vite 生成的临时文件）
 */
function isVirtualFile(filePath: string): boolean {
  return (
    filePath.includes('?html-proxy') ||
    filePath.includes('?direct') ||
    filePath.includes('?v=')
  );
}

/**
 * 创建样式标签元素
 */
function createBadge(styleId: string, target: HTMLElement): HTMLElement {
  const location = state.styleMap[styleId];
  const rect = target.getBoundingClientRect();

  // 获取用于跳转的实际文件路径
  const jumpFile = location?.sourceFile || location?.file;

  // 跳过虚拟文件（如果没有源文件映射）
  if (!location || !jumpFile || isVirtualFile(jumpFile)) {
    const skipBadge = document.createElement('div');
    skipBadge.style.display = 'none';
    return skipBadge;
  }

  // 解析 style-id：ComponentName--selector--hash
  let displayText = styleId;
  if (location?.componentName) {
    const parts = styleId.split('--');
    if (parts.length >= 2) {
      const selector = parts[1];
      displayText = `${location.componentName} · ${selector}`;
    }
  }

  const badge = document.createElement('div');
  badge.className = 'style-jumper-badge';
  badge.textContent = displayText;
  badge.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 3px 8px;
    font-size: 11px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border-radius: 4px;
    pointer-events: auto;
    cursor: pointer;
    z-index: 999999;
    white-space: nowrap;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  `;

  // Hover 效果
  badge.addEventListener('mouseenter', () => {
    badge.style.transform = 'scale(1.05)';
    badge.style.background = '#007acc';
    badge.style.zIndex = '1000000';
  });

  badge.addEventListener('mouseleave', () => {
    badge.style.transform = 'scale(1)';
    badge.style.background = 'rgba(0, 0, 0, 0.85)';
    badge.style.zIndex = '999999';
  });

  // 点击跳转
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    jumpToSource(styleId);
  });

  // 显示文件位置提示
  if (location) {
    const selectorInfo = location.selector ? `\n样式: ${location.selector}` : '';
    const fileLabel = location.sourceFile ? `${location.sourceFile} (虚拟: ${location.file})` : location.file;
    badge.title = `${location.componentName || 'Unknown'}${selectorInfo}\n文件: ${fileLabel}:${location.line}`;
  }

  return badge;
}

/**
 * 设置点击委托
 */
function setupClickDelegation() {
  document.addEventListener('click', (e) => {
    if (!state.showInspector) return;

    const target = (e.target as HTMLElement).closest('[data-style-id]');
    if (!target) return;

    const styleId = (target as HTMLElement).getAttribute('data-style-id');
    if (styleId) {
      e.preventDefault();
      e.stopPropagation();
      jumpToSource(styleId);
    }
  }, true);
}

/**
 * 跳转到源码位置
 * 优先使用 WebSocket/API 通信，最后才使用 URI scheme
 */
async function jumpToSource(styleId: string) {
  const location = state.styleMap[styleId];
  if (!location) {
    console.warn(`[style-jumper] ⚠️  No location found for ${styleId}`);
    return;
  }

  // 获取用于跳转的实际文件路径
  const jumpFile = location.sourceFile || location.file;

  // 检查是否为虚拟文件（且没有源文件映射）
  if (!jumpFile || isVirtualFile(jumpFile)) {
    console.log(`[style-jumper] ⚠️  Virtual file detected: ${location.file}`);
    showVirtualFileWarning(location);
    return;
  }

  // 构建跳转位置（使用源文件路径）
  const jumpLocation = {
    ...location,
    file: jumpFile
  };

  console.log(`[style-jumper] 🎯 Jumping to ${styleId}:`, jumpLocation);

  // 方式 1: 使用独立服务 API（通过 Vite 代理，最可靠）
  try {
    const response = await fetch('/__style_jump/api/jump-to-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jumpLocation)
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showLocationInfo(jumpLocation, '✅ 已跳转到编辑器');
        return;
      }
    }
  } catch (error) {
    console.log(`[style-jumper] ⚠️  API 跳转失败:`, error);
  }

  // 方式 2: URI scheme（可能被浏览器拦截）
  const uri = `trae://file${jumpLocation.file}:${jumpLocation.line}:${jumpLocation.column}`;
  console.log(`[style-jumper] 📂 尝试 URI scheme: ${uri}`);

  const opened = window.open(uri, '_blank');
  if (opened && !opened.closed) {
    showLocationInfo(jumpLocation, '✅ 已打开编辑器');
    return;
  }

  // 方式 3: 降级 - 显示位置并复制到剪贴板
  showLocationInfo(jumpLocation, '⚠️  请手动跳转');
  copyToClipboard(jumpLocation);
}

/**
 * 显示位置信息提示
 */
function showLocationInfo(location: StyleLocation, message: string = `📍 ${location.file}:${location.line}`) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">${message}</div>
    <div style="font-size: 11px; opacity: 0.9;">${location.file}:${location.line}</div>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #007acc;
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * 显示虚拟文件警告提示
 */
function showVirtualFileWarning(location: StyleLocation) {
  const toast = document.createElement('div');

  // 如果有源文件映射，显示提示信息
  const hasSource = !!location.sourceFile;
  const message = hasSource
    ? `✅ 虚拟文件已映射到源文件`
    : `⚠️ 此样式来自虚拟文件，无法跳转`;

  const detail = hasSource
    ? `${location.sourceFile}`
    : `${location.file}`;

  const subDetail = hasSource
    ? `虚拟文件: ${location.file}`
    : `虚拟文件是 Vite 生成的临时文件`;

  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">${message}</div>
    <div style="font-size: 11px; opacity: 0.9;">${detail}</div>
    <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${subDetail}</div>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${hasSource ? '#007acc' : '#ff9800'};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
    max-width: 400px;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 复制文件路径到剪贴板
 */
async function copyToClipboard(location: StyleLocation) {
  const text = `${location.file}:${location.line}`;
  try {
    await navigator.clipboard.writeText(text);
    console.log(`[style-jumper] 📋 Copied to clipboard: ${text}`);
  } catch {
    console.log(`[style-jumper] ⚠️  Could not copy to clipboard`);
  }
}

// ============================================================
// 注入样式
// ============================================================

// 注入动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .style-inspector-active * {
    outline: 1px solid rgba(0, 122, 204, 0.3) !important;
  }

  .style-inspector-active *:hover {
    outline: 2px solid rgba(0, 122, 204, 0.8) !important;
  }
`;
document.head.appendChild(style);
