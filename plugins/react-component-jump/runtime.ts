/**
 * React 组件跳转运行时
 *
 * 在浏览器中运行，提供：
 * 1. 快捷键监听 (Cmd+Shift+K)
 * 2. 悬停时显示组件名标签
 * 3. 点击跳转到组件文件
 */

// ============================================================
// 全局状态
// ============================================================

interface State {
  /** 是否显示检查器 */
  showInspector: boolean;
  /** Portal 容器 */
  portalContainer: HTMLElement | null;
  /** 组件名到颜色的映射 */
  componentColors: Map<string, string>;
  /** 路由变化监听器清理函数 */
  routeCleanup: Array<() => void>;
  /** 搜索框元素 */
  searchBox: HTMLElement | null;
  /** 当前搜索关键词 */
  searchQuery: string;
  /** 依赖图模态框元素 */
  dependencyGraphModal: HTMLElement | null;
}

const state: State = {
  showInspector: false,
  portalContainer: null,
  componentColors: new Map(),
  routeCleanup: [],
  searchBox: null,
  searchQuery: '',
  dependencyGraphModal: null,
};

// 颜色调色板（15 种不同的颜色，避免重复）
const COLOR_PALETTE = [
  '#ef4444', // 红
  '#f97316', // 橙
  '#f59e0b', // 琥珀
  '#eab308', // 黄
  '#84cc16', // 青柠
  '#22c55e', // 绿
  '#10b981', // 翡翠
  '#14b8a6', // 青色
  '#06b6d4', // 天蓝
  '#0ea5e9', // 天空蓝
  '#3b82f6', // 蓝
  '#6366f1', // 靛蓝
  '#8b5cf6', // 紫
  '#a855f7', // 紫罗兰
  '#ec4899', // 粉
];

/**
 * 获取组件颜色（根据组件名哈希分配，保证同一组件始终是同一种颜色）
 */
function getComponentColor(componentName: string): string {
  if (state.componentColors.has(componentName)) {
    return state.componentColors.get(componentName)!;
  }

  // 根据组件名计算哈希值
  let hash = 0;
  for (let i = 0; i < componentName.length; i++) {
    hash = componentName.charCodeAt(i) + ((hash << 5) - hash);
  }

  // 使用哈希值从调色板中选择颜色
  const colorIndex = Math.abs(hash) % COLOR_PALETTE.length;
  const color = COLOR_PALETTE[colorIndex]!;

  state.componentColors.set(componentName, color);
  return color;
}

// Type guard to check if element has style property
function hasStyleProperty(element: Element): element is HTMLElement {
  return 'style' in element;
}

// ============================================================
// 核心功能
// ============================================================

/**
 * 初始化 React 组件跳转功能
 */
export async function setupReactComponentJumper() {
  console.log('[react-component-jumper] 🚀 Initializing...');

  // 1. 监听快捷键
  setupHotkeyListener();

  // 2. 设置鼠标悬停监听
  setupHoverListener();

  console.log('[react-component-jumper] ✅ Ready! Press Cmd+Shift+K (Mac) or Ctrl+Shift+K (Windows) to toggle inspector');
}

/**
 * 设置快捷键监听 (Cmd+Shift+K / Ctrl+Shift+K)
 *
 * 为什么用这个组合：
 * - Cmd+Shift+K 在浏览器中通常没有被占用
 * - K 代表 "Komponent" (德语) 或 Component
 * - 与样式检查器 (Cmd+Option+S) 区分开
 */
function setupHotkeyListener() {
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Cmd+Shift+K (Mac) 或 Ctrl+Shift+K (Windows/Linux)
    if (modKey && e.shiftKey && (e.code === 'KeyK' || e.key === 'K')) {
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
    console.log('[react-component-jumper] 👁️  Inspector ON');
    document.body.classList.add('react-component-inspector-active');
    showInspectorNotification(true);

    // 创建搜索框
    createSearchBox();

    // 创建 Portal 容器
    createPortalContainer();

    // 显示所有组件标签
    addAllComponentBadges();

    // 启动位置更新
    startBadgeUpdater();

    // 监听路由变化
    setupRouteListeners();
  } else {
    console.log('[react-component-jumper] 👁️‍🗨️  Inspector OFF');
    document.body.classList.remove('react-component-inspector-active');
    removeAllComponentBadges();
    removePortalContainer();
    removeSearchBox();
    clearComponentBorders();
    showInspectorNotification(false);

    // 停止位置更新
    stopBadgeUpdater();

    // 清空颜色映射
    state.componentColors.clear();

    // 清空搜索状态
    state.searchQuery = '';

    // 关闭依赖图模态框
    removeDependencyGraphModal();

    // 移除路由监听
    removeRouteListeners();
  }
}

/**
 * 创建 Portal 容器
 */
function createPortalContainer() {
  if (state.portalContainer) return;

  const container = document.createElement('div');
  container.id = 'react-component-jumper-portal';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 999998;
    overflow: hidden;
  `;
  document.body.appendChild(container);
  state.portalContainer = container;
}

/**
 * 移除 Portal 容器
 */
function removePortalContainer() {
  if (state.portalContainer) {
    state.portalContainer.remove();
    state.portalContainer = null;
  }
}

/**
 * 创建搜索框
 */
function createSearchBox() {
  if (state.searchBox) return;

  const searchBox = document.createElement('div');
  searchBox.id = 'react-component-jumper-search-box';
  searchBox.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const searchIcon = document.createElement('span');
  searchIcon.innerHTML = '🔍';
  searchIcon.style.cssText = `
    font-size: 14px;
    opacity: 0.8;
  `;

  const searchLabel = document.createElement('span');
  searchLabel.textContent = '搜索组件:';
  searchLabel.style.cssText = `
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
  `;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '输入组件名...';
  searchInput.style.cssText = `
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 13px;
    width: 200px;
    padding: 4px 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const matchCount = document.createElement('span');
  matchCount.id = 'react-component-jumper-match-count';
  matchCount.style.cssText = `
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    min-width: 40px;
  `;

  // 添加分隔线
  const separator = document.createElement('div');
  separator.style.cssText = `
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
  `;

  // 添加依赖关系按钮
  const depGraphButton = document.createElement('button');
  depGraphButton.innerHTML = '🌳 依赖关系';
  depGraphButton.style.cssText = `
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #10b981;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    align-items: center;
    gap: 4px;
  `;

  depGraphButton.addEventListener('mouseenter', () => {
    depGraphButton.style.background = 'rgba(16, 185, 129, 0.3)';
    depGraphButton.style.borderColor = 'rgba(16, 185, 129, 0.6)';
  });

  depGraphButton.addEventListener('mouseleave', () => {
    depGraphButton.style.background = 'rgba(16, 185, 129, 0.2)';
    depGraphButton.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  });

  depGraphButton.addEventListener('click', () => {
    showDependencyGraph();
  });

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchLabel);
  searchBox.appendChild(searchInput);
  searchBox.appendChild(matchCount);
  searchBox.appendChild(separator);
  searchBox.appendChild(depGraphButton);

  document.body.appendChild(searchBox);
  state.searchBox = searchBox;

  // 聚焦搜索框
  setTimeout(() => searchInput.focus(), 100);

  // 搜索事件监听
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    state.searchQuery = query;

    // 更新匹配数量
    const allComponents = document.querySelectorAll('[data-component-name]');
    const uniqueNames = new Set<string>();
    allComponents.forEach((component) => {
      const name = component.getAttribute('data-component-name');
      if (name && name.toLowerCase().includes(query)) {
        uniqueNames.add(name);
      }
    });
    matchCount.textContent = query ? `(${uniqueNames.size})` : '';

    // 触发badge位置更新（会应用过滤）
    updateBadgePositions();
  });

  // 快捷键支持：ESC 清空搜索
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      state.searchQuery = '';
      matchCount.textContent = '';
      updateBadgePositions();
    }
  });
}

/**
 * 移除搜索框
 */
function removeSearchBox() {
  if (state.searchBox) {
    state.searchBox.remove();
    state.searchBox = null;
  }
}

/**
 * 清除所有组件边框
 */
function clearComponentBorders() {
  const components = document.querySelectorAll('[data-component-name]');
  components.forEach((element) => {
    if (hasStyleProperty(element)) {
      element.style.outline = '';
      element.style.outlineOffset = '';
    }
  });
}

/**
 * 监听路由变化
 */
function setupRouteListeners() {
  // 清除旧的监听器
  removeRouteListeners();

  // 监听 popstate 事件（浏览器前进/后退）
  const handlePopState = () => {
    console.log('[react-component-jumper] 🔄 路由变化 (popstate)');
    // 延迟一下，等待 DOM 更新
    setTimeout(() => {
      clearComponentBorders();
      addAllComponentBadges();
    }, 100);
  };

  window.addEventListener('popstate', handlePopState);
  state.routeCleanup.push(() => {
    window.removeEventListener('popstate', handlePopState);
  });

  // 拦截 pushState 和 replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const handlePushState = (...args: Parameters<typeof history.pushState>) => {
    originalPushState.apply(history, args);
    console.log('[react-component-jumper] 🔄 路由变化 (pushState)');
    setTimeout(() => {
      clearComponentBorders();
      addAllComponentBadges();
    }, 100);
  };

  const handleReplaceState = (...args: Parameters<typeof history.replaceState>) => {
    originalReplaceState.apply(history, args);
    console.log('[react-component-jumper] 🔄 路由变化 (replaceState)');
    setTimeout(() => {
      clearComponentBorders();
      addAllComponentBadges();
    }, 100);
  };

  (history as any).pushState = new Proxy(originalPushState, {
    apply: (target, thisArg, args) => {
      handlePushState(...(args as Parameters<typeof history.pushState>));
      return Reflect.apply(target, thisArg, args);
    },
  });

  (history as any).replaceState = new Proxy(originalReplaceState, {
    apply: (target, thisArg, args) => {
      handleReplaceState(...(args as Parameters<typeof history.replaceState>));
      return Reflect.apply(target, thisArg, args);
    },
  });

  state.routeCleanup.push(() => {
    (history as any).pushState = originalPushState;
    (history as any).replaceState = originalReplaceState;
  });
}

/**
 * 移除路由监听
 */
function removeRouteListeners() {
  state.routeCleanup.forEach(cleanup => cleanup());
  state.routeCleanup = [];
}

/**
 * 显示检查器通知
 */
function showInspectorNotification(enabled: boolean) {
  const existingNotification = document.querySelector('.react-component-jumper-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = 'react-component-jumper-notification';
  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">
      ${enabled ? '👁️ React 组件检查器已开启' : '👁️‍🗨️ React 组件检查器已关闭'}
    </div>
    <div style="font-size: 11px; opacity: 0.9;">
      ${enabled ? '所有组件已显示标签，点击可跳转' : '按 Cmd+Shift+K 重新开启'}
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-10px)';
    notification.style.transition = 'all 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

/**
 * 设置鼠标悬停监听（简化版 - 只用于高亮效果）
 */
function setupHoverListener() {
  document.addEventListener('mouseover', (e) => {
    if (!state.showInspector) return;

    const target = e.target as HTMLElement;
    if (!target) return;

    // 如果鼠标在标签上，高亮对应的组件
    if (target.classList.contains('react-component-jumper-badge-all')) {
      const componentName = (target as HTMLElement).dataset.componentName;
      if (componentName) {
        const componentElement = document.querySelector(`[data-component-name="${componentName}"]`) as HTMLElement;
        if (componentElement) {
          componentElement.style.outline = '3px solid #667eea';
          componentElement.style.outlineOffset = '2px';
        }
      }
      return;
    }

    // 递归向上查找带有 data-component-name 属性的元素
    const componentElement = findComponentElement(target);
    if (!componentElement) {
      return;
    }

    // 高亮当前悬停的组件
    (componentElement as HTMLElement).style.outline = '3px solid #667eea';
    (componentElement as HTMLElement).style.outlineOffset = '2px';
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (!state.showInspector) return;

    const target = e.target as HTMLElement;
    if (!target) return;

    // 移除高亮
    if (target.classList.contains('react-component-jumper-badge-all')) {
      const componentName = (target as HTMLElement).dataset.componentName;
      if (componentName) {
        const componentElement = document.querySelector(`[data-component-name="${componentName}"]`) as HTMLElement;
        if (componentElement) {
          componentElement.style.outline = '';
          componentElement.style.outlineOffset = '';
        }
      }
      return;
    }

    const componentElement = findComponentElement(target);
    if (componentElement) {
      (componentElement as HTMLElement).style.outline = '';
      (componentElement as HTMLElement).style.outlineOffset = '';
    }
  }, true);
}

/**
 * 递归向上查找组件元素
 */
function findComponentElement(element: HTMLElement): HTMLElement | null {
  // 先检查当前元素
  if (element.getAttribute && element.getAttribute('data-component-name')) {
    return element;
  }

  // 递归向上查找父元素（最多 10 层）
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < 10) {
    if (current.getAttribute('data-component-name')) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }

  return null;
}

/**
 * 为所有组件添加标签（Portal 方式，不干扰组件布局）
 */
function addAllComponentBadges() {
  if (!state.portalContainer) return;

  // 清除现有标签
  removeAllComponentBadges();

  const components = document.querySelectorAll('[data-component-name]');
  console.log(`[react-component-jumper] 找到 ${components.length} 个组件`);

  let count = 0;

  components.forEach((element) => {
    const componentName = element.getAttribute('data-component-name');
    if (!componentName) return;

    const rect = element.getBoundingClientRect();
    // 只处理可见的组件
    if (rect.width === 0 || rect.height === 0) return;

    // 获取组件颜色
    const color = getComponentColor(componentName);

    // 创建标签
    const badge = document.createElement('div');
    badge.className = 'react-component-jumper-badge-all';
    badge.dataset.componentName = componentName;
    badge.dataset.attachTo = `[data-component-name="${componentName}"]`;
    badge.innerHTML = `
      <span class="badge-name">${componentName}</span>
      <span class="badge-actions">
        <span class="badge-siblings" title="查看平级组件">🔗</span>
        <span class="badge-copy" title="复制组件名">📋</span>
        <span class="badge-jump" title="跳转到源文件">↗️</span>
      </span>
    `;
    badge.style.cssText = `
      position: absolute;
      top: ${rect.top - 20 - 1}px;
      left: ${rect.left}px;
      background: linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%);
      color: white;
      padding: 2px 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      border-radius: 3px;
      pointer-events: auto;
      box-shadow: 0 2px 8px ${color}66;
      white-space: nowrap;
      transition: transform 0.15s, box-shadow 0.15s;
      user-select: none;
      will-change: transform;
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    // 复制按钮
    const copyBtn = badge.querySelector('.badge-copy')!;
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(componentName);
      showCopySuccess(componentName);
    });

    // 兄弟组件按钮
    const siblingsBtn = badge.querySelector('.badge-siblings')!;
    siblingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!hasStyleProperty(siblingsBtn)) {
        return;
      }

      // 设置 loading 状态
      siblingsBtn.textContent = '⏳';
      siblingsBtn.style.pointerEvents = 'none';
      siblingsBtn.classList.add('loading');

      showSiblingComponents(componentName).finally(() => {
        // 恢复状态
        setTimeout(() => {
          if (siblingsBtn && hasStyleProperty(siblingsBtn)) {
            siblingsBtn.textContent = '🔗';
            siblingsBtn.style.pointerEvents = '';
            siblingsBtn.classList.remove('loading');
          }
        }, 500);
      });
    });

    // 跳转按钮
    const jumpBtn = badge.querySelector('.badge-jump')!;
    jumpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!hasStyleProperty(jumpBtn)) {
        return;
      }

      // 设置 loading 状态
      jumpBtn.textContent = '⏳';
      jumpBtn.style.pointerEvents = 'none';
      jumpBtn.classList.add('loading');

      jumpToComponent(componentName).finally(() => {
        // 恢复状态
        setTimeout(() => {
          if (jumpBtn && hasStyleProperty(jumpBtn)) {
            jumpBtn.textContent = '↗️';
            jumpBtn.style.pointerEvents = '';
            jumpBtn.classList.remove('loading');
          }
        }, 500);
      });
    });

    // 悬停效果
    badge.addEventListener('mouseenter', () => {
      (badge as HTMLElement).style.transform = 'scale(1.05)';
      (badge as HTMLElement).style.boxShadow = `0 4px 12px ${color}99`;
    });

    badge.addEventListener('mouseleave', () => {
      (badge as HTMLElement).style.transform = 'scale(1)';
      (badge as HTMLElement).style.boxShadow = `0 2px 8px ${color}66`;
    });

    // 添加到 Portal 容器
    state.portalContainer!.appendChild(badge);
    count++;
  });

  console.log(`[react-component-jumper] ✅ 已显示 ${count} 个组件标签`);
}

/**
 * 显示复制成功提示
 */
function showCopySuccess(componentName: string) {
  const toast = document.createElement('div');
  toast.innerHTML = `✅ 已复制: ${componentName}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}

/**
 * 移除所有组件标签
 */
function removeAllComponentBadges() {
  const badges = document.querySelectorAll('.react-component-jumper-badge-all');
  badges.forEach(badge => badge.remove());
}

/**
 * 启动标签位置更新
 */
function startBadgeUpdater() {
  if ((window as any).__componentBadgeUpdater) {
    cancelAnimationFrame((window as any).__componentBadgeUpdater);
  }

  const update = () => {
    if (!state.showInspector || !state.portalContainer) {
      return;
    }
    updateBadgePositions();
    (window as any).__componentBadgeUpdater = requestAnimationFrame(update);
  };

  (window as any).__componentBadgeUpdater = requestAnimationFrame(update);
}

/**
 * 停止标签位置更新
 */
function stopBadgeUpdater() {
  if ((window as any).__componentBadgeUpdater) {
    cancelAnimationFrame((window as any).__componentBadgeUpdater);
    (window as any).__componentBadgeUpdater = null;
  }
}

/**
 * 更新所有标签位置（使用 requestAnimationFrame 优化 + 防重叠 + 每个组件名只显示一个 + 颜色匹配 + 数量统计）
 */
function updateBadgePositions() {
  const badges = document.querySelectorAll('.react-component-jumper-badge-all');

  // 跟踪已经显示过的组件名
  const displayedNames = new Set<string>();

  // 统计每个组件的数量
  const componentCounts = new Map<string, number>();
  const allComponents = document.querySelectorAll('[data-component-name]');
  allComponents.forEach((component) => {
    const name = component.getAttribute('data-component-name');
    if (name) {
      componentCounts.set(name, (componentCounts.get(name) || 0) + 1);
    }
  });

  // 收集所有可见组件的位置信息
  const visibleBadges: Array<{
    badge: HTMLElement;
    componentName: string;
    componentRect: DOMRect;
    badgeRect: DOMRect;
  }> = [];

  badges.forEach((badge) => {
    const componentName = (badge as HTMLElement).dataset.componentName;
    if (!componentName) return;

    // 如果这个组件名已经显示过，跳过
    if (displayedNames.has(componentName)) {
      (badge as HTMLElement).style.display = 'none';
      return;
    }

    // 应用搜索过滤
    if (state.searchQuery && !componentName.toLowerCase().includes(state.searchQuery)) {
      (badge as HTMLElement).style.display = 'none';
      return;
    }

    const componentElement = document.querySelector(`[data-component-name="${componentName}"]`) as HTMLElement;
    if (!componentElement) {
      (badge as HTMLElement).style.display = 'none';
      return;
    }

    const rect = componentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      (badge as HTMLElement).style.display = 'none';
      return;
    }

    // 只显示视口内的组件
    const isInViewport = rect.top < window.innerHeight + 50 && rect.bottom > -50;
    if (!isInViewport) {
      (badge as HTMLElement).style.display = 'none';
      return;
    }

    // 标记这个组件名已显示
    displayedNames.add(componentName);

    visibleBadges.push({
      badge: badge as HTMLElement,
      componentName,
      componentRect: rect,
      badgeRect: badge.getBoundingClientRect(),
    });
  });

  // 防重叠计算
  const BADGE_HEIGHT = 20;
  const BADGE_WIDTH = 140; // 预估宽度（包含图标）
  const PADDING = 4;

  const placedPositions: Array<{ top: number; left: number; width: number; height: number }> = [];

  // 如果有搜索查询，先清除所有组件的边框
  if (state.searchQuery) {
    const allComponents = document.querySelectorAll('[data-component-name]');
    allComponents.forEach((component) => {
      (component as HTMLElement).style.outline = '';
      (component as HTMLElement).style.outlineOffset = '';
    });
  }

  visibleBadges.forEach(({ badge, componentRect, componentName }) => {
    // 获取组件颜色
    const color = getComponentColor(componentName);

    // 给所有同名组件加色框（确保所有相同名称的组件都显示相同的颜色）
    const componentElements = document.querySelectorAll(`[data-component-name="${componentName}"]`) as NodeListOf<HTMLElement>;
    componentElements.forEach((componentElement) => {
      componentElement.style.outline = `2px solid ${color}`;
      componentElement.style.outlineOffset = '2px';
    });

    // 默认位置：组件左上角
    let top = componentRect.top - BADGE_HEIGHT - 1;
    let left = componentRect.left;

    // 防重叠：尝试向下或向右移动
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      let overlap = false;

      // 检查与已放置的标签是否重叠
      for (const placed of placedPositions) {
        const horizontalOverlap = left < placed.left + placed.width && left + BADGE_WIDTH > placed.left;
        const verticalOverlap = top < placed.top + placed.height && top + BADGE_HEIGHT > placed.top;

        if (horizontalOverlap && verticalOverlap) {
          overlap = true;
          break;
        }
      }

      if (!overlap) {
        break;
      }

      // 尝试向下或向右移动（交替进行）
      if (attempts % 2 === 0) {
        top += BADGE_HEIGHT + PADDING;
      } else {
        left += BADGE_WIDTH / 2 + PADDING;
      }

      attempts++;
    }

    // 保存位置
    placedPositions.push({ top, left, width: BADGE_WIDTH, height: BADGE_HEIGHT });

    // 应用位置和颜色
    badge.style.display = 'block';
    badge.style.top = `${Math.max(0, top)}px`;
    badge.style.left = `${Math.max(0, left)}px`;

    // 更新标签颜色（使用渐变效果，从组件色到稍深的颜色）
    badge.style.background = `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%)`;
    badge.style.boxShadow = `0 2px 8px ${color}66`;

    // 更新badge内容，添加数量统计
    const count = componentCounts.get(componentName) || 1;
    const badgeName = badge.querySelector('.badge-name');
    if (badgeName) {
      badgeName.textContent = count > 1 ? `${componentName} (${count})` : componentName;
    }
  });
}

/**
 * 调整颜色亮度
 * @param color - 十六进制颜色 (#RRGGBB)
 * @param amount - 调整量 (-100 到 100)
 */
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * 跳转到组件源文件
 */
async function jumpToComponent(componentName: string): Promise<void> {
  console.log(`[react-component-jumper] 🎯 跳转到组件: ${componentName}`);

  try {
    const response = await fetch('/__react_component_jump/api/jump-to-component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentName }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showJumpSuccess(componentName);
      } else {
        showJumpError(componentName, result.error);
      }
    } else {
      showJumpError(componentName, `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('[react-component-jumper] ❌ 跳转错误:', error);
    showJumpError(componentName, String(error));
  }
}

/**
 * 显示跳转成功提示
 */
function showJumpSuccess(componentName: string) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">✅ 已跳转</div>
    <div style="font-size: 11px; opacity: 0.9;">&lt;${componentName} /&gt;</div>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * 显示跳转错误提示
 */
function showJumpError(componentName: string, error: string) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">❌ 跳转失败</div>
    <div style="font-size: 11px; opacity: 0.9;">&lt;${componentName} /&gt;</div>
    <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${error}</div>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #ef4444;
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
  }, 3000);
}

// ============================================================
// 依赖关系图
// ============================================================

/**
 * 依赖树节点（UI 使用）
 */
interface DepTreeNode {
  name: string;
  file: string;
  line: number;
  depCount: number;
  children: DepTreeNode[];
  expanded: boolean;
}

/**
 * 显示依赖关系图
 */
async function showDependencyGraph() {
  console.log('[react-component-jumper] 🌳 显示依赖关系图');

  // 1. 获取当前页面的所有组件
  const currentComponents = getCurrentPageComponents();

  if (currentComponents.length === 0) {
    showDependencyGraphError('当前页面没有找到组件');
    return;
  }

  // 2. 获取完整的依赖图数据
  try {
    const response = await fetch('/__react_component_jump/api/dependency-graph');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // 3. 构建依赖树（只包含当前页面的组件）
    const depTree = buildFilteredDependencyTree(data, currentComponents);

    // 4. 显示模态框
    showDependencyGraphModal(depTree, data);
  } catch (error) {
    console.error('[react-component-jumper] ❌ 获取依赖图失败:', error);
    showDependencyGraphError(String(error));
  }
}

/**
 * 获取当前页面的组件列表
 */
function getCurrentPageComponents(): string[] {
  const components = document.querySelectorAll('[data-component-name]');
  const uniqueNames = new Set<string>();

  components.forEach((component) => {
    const name = component.getAttribute('data-component-name');
    if (name) {
      uniqueNames.add(name);
    }
  });

  return Array.from(uniqueNames);
}

/**
 * 构建过滤后的依赖树（只包含当前页面的组件）
 */
function buildFilteredDependencyTree(
  registry: any,
  currentComponents: string[]
): DepTreeNode[] {
  const trees: DepTreeNode[] = [];

  // 找出当前页面组件中的根节点（没有被其他当前页面组件依赖的）
  const currentSet = new Set(currentComponents);
  const roots: string[] = [];

  for (const name of currentComponents) {
    const component = registry.components[name];
    if (!component) continue;

    // 检查是否有其他当前页面组件依赖它
    const hasCurrentDependent = component.dependents.some((dep: string) => currentSet.has(dep));
    if (!hasCurrentDependent) {
      roots.push(name);
    }
  }

  // 为每个根节点构建依赖树
  for (const rootName of roots) {
    const tree = buildDependencyTree(rootName, registry.components, currentSet, new Set());
    if (tree) {
      trees.push(tree);
    }
  }

  return trees;
}

/**
 * 递归构建依赖树
 */
function buildDependencyTree(
  componentName: string,
  components: Record<string, any>,
  currentSet: Set<string>,
  visited: Set<string>
): DepTreeNode | null {
  const component = components[componentName];

  if (!component || visited.has(componentName)) {
    return null;
  }

  visited.add(componentName);

  // 只包含当前页面的组件
  const children: DepTreeNode[] = [];
  for (const depName of component.dependencies) {
    if (!currentSet.has(depName)) continue;

    const childTree = buildDependencyTree(depName, components, currentSet, new Set(visited));
    if (childTree) {
      children.push(childTree);
    }
  }

  return {
    name: componentName,
    file: component.file,
    line: component.line,
    depCount: component.dependencies.length,
    children,
    expanded: true, // 默认展开
  };
}

/**
 * 显示依赖图模态框
 */
function showDependencyGraphModal(trees: DepTreeNode[], registry: any) {
  // 如果已经存在，先移除
  removeDependencyGraphModal();

  const modal = document.createElement('div');
  modal.className = 'react-component-jumper-dep-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #1e293b;
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  `;

  // 头部
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const title = document.createElement('div');
  title.innerHTML = `
    <div style="font-size: 18px; font-weight: 600; color: white; margin-bottom: 4px;">
      🌳 组件依赖关系
    </div>
    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">
      ${trees.length} 个根组件 • 点击组件名可跳转
    </div>
  `;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '✕';
  closeButton.style.cssText = `
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  `;

  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
    closeButton.style.color = 'white';
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.background = 'transparent';
    closeButton.style.color = 'rgba(255, 255, 255, 0.6)';
  });

  closeButton.addEventListener('click', removeDependencyGraphModal);

  header.appendChild(title);
  header.appendChild(closeButton);

  // 内容区域
  const body = document.createElement('div');
  body.style.cssText = `
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  `;

  // 渲染依赖树
  if (trees.length === 0) {
    body.innerHTML = `
      <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 40px;">
        当前页面没有组件依赖关系
      </div>
    `;
  } else {
    for (const tree of trees) {
      body.appendChild(renderDependencyTree(tree, 0));
    }
  }

  // 底部
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  `;

  footer.innerHTML = `
    <div>按 ESC 或点击背景关闭</div>
    <div>总组件数: ${Object.keys(registry.components).length}</div>
  `;

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  modal.appendChild(content);

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      removeDependencyGraphModal();
    }
  });

  // ESC 关闭
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeDependencyGraphModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(modal);
  state.dependencyGraphModal = modal;
}

/**
 * 渲染依赖树节点
 */
function renderDependencyTree(node: DepTreeNode, depth: number): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `
    margin-bottom: 8px;
  `;

  const nodeElement = document.createElement('div');
  nodeElement.style.cssText = `
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    background: ${depth === 0 ? 'rgba(255, 255, 255, 0.05)' : 'transparent'};
    border-left: 3px solid ${depth === 0 ? '#10b981' : 'rgba(255, 255, 255, 0.1)'};
    margin-left: ${depth * 16}px;
  `;

  nodeElement.addEventListener('mouseenter', () => {
    nodeElement.style.background = 'rgba(16, 185, 129, 0.1)';
  });

  nodeElement.addEventListener('mouseleave', () => {
    nodeElement.style.background = depth === 0 ? 'rgba(255, 255, 255, 0.05)' : 'transparent';
  });

  nodeElement.addEventListener('click', (e) => {
    e.stopPropagation();
    // 切换展开/折叠
    node.expanded = !node.expanded;
    updateChildrenVisibility();
  });

  // 展开/折叠图标
  const icon = document.createElement('span');
  icon.style.cssText = `
    margin-right: 8px;
    font-size: 10px;
    transition: transform 0.2s;
    ${node.children.length === 0 ? 'visibility: hidden;' : ''}
  `;
  icon.textContent = node.expanded ? '▼' : '▶';

  // 组件名
  const nameSpan = document.createElement('span');
  nameSpan.textContent = node.name;
  nameSpan.style.cssText = `
    font-weight: 500;
    color: white;
    font-size: 14px;
    flex: 1;
  `;

  // 依赖数量
  const depCount = document.createElement('span');
  depCount.textContent = node.depCount > 0 ? `(${node.depCount})` : '';
  depCount.style.cssText = `
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin-left: 8px;
  `;

  // 跳转按钮
  const jumpBtn = document.createElement('span');
  jumpBtn.innerHTML = '↗️';
  jumpBtn.style.cssText = `
    margin-left: 8px;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.2s;
  `;

  nodeElement.addEventListener('mouseenter', () => {
    jumpBtn.style.opacity = '1';
  });

  nodeElement.addEventListener('mouseleave', () => {
    jumpBtn.style.opacity = '0';
  });

  jumpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeDependencyGraphModal();
    jumpToComponent(node.name);
  });

  nodeElement.appendChild(icon);
  nodeElement.appendChild(nameSpan);
  nodeElement.appendChild(depCount);
  nodeElement.appendChild(jumpBtn);
  container.appendChild(nodeElement);

  // 子节点容器
  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'dep-children';

  const updateChildrenVisibility = () => {
    if (!node.expanded) {
      childrenContainer.style.display = 'none';
      icon.textContent = '▶';
    } else {
      childrenContainer.style.display = 'block';
      icon.textContent = '▼';
    }
  };

  // 渲染子节点
  for (const child of node.children) {
    childrenContainer.appendChild(renderDependencyTree(child, depth + 1));
  }

  updateChildrenVisibility();
  container.appendChild(childrenContainer);

  return container;
}

/**
 * 移除依赖图模态框
 */
function removeDependencyGraphModal() {
  if (state.dependencyGraphModal) {
    state.dependencyGraphModal.remove();
    state.dependencyGraphModal = null;
  }
}

/**
 * 显示依赖图错误提示
 */
function showDependencyGraphError(error: string) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">❌ 获取依赖图失败</div>
    <div style="font-size: 11px; opacity: 0.9;">${error}</div>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #ef4444;
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
  }, 3000);
}

// ============================================================
// 兄弟组件发现
// ============================================================

/**
 * 显示兄弟组件
 */
async function showSiblingComponents(componentName: string): Promise<void> {
  console.log(`[react-component-jumper] 🔗 查找兄弟组件: ${componentName}`);

  try {
    const response = await fetch(`/__react_component_jump/api/sibling-components/${encodeURIComponent(componentName)}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      showSiblingComponentsError(componentName, data.error);
      return;
    }

    showSiblingComponentsModal(data);
  } catch (error) {
    console.error('[react-component-jumper] ❌ 获取兄弟组件失败:', error);
    showSiblingComponentsError(componentName, String(error));
  }
}

/**
 * 显示兄弟组件模态框
 */
function showSiblingComponentsModal(data: {
  current: any;
  siblings: any[];
  directory: string;
  copyFormats: any;
}) {
  // 如果已经存在，先移除
  removeSiblingComponentsModal();

  const modal = document.createElement('div');
  modal.className = 'react-component-jumper-siblings-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #1e293b;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  `;

  // 头部
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  const title = document.createElement('div');
  title.innerHTML = `
    <div style="font-size: 18px; font-weight: 600; color: white; margin-bottom: 4px;">
      🔗 平级组件
    </div>
    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">
      ${data.siblings.length} 个兄弟组件 • 同一目录
    </div>
  `;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '✕';
  closeButton.style.cssText = `
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  `;

  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
    closeButton.style.color = 'white';
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.background = 'transparent';
    closeButton.style.color = 'rgba(255, 255, 255, 0.6)';
  });

  closeButton.addEventListener('click', removeSiblingComponentsModal);

  header.appendChild(title);
  header.appendChild(closeButton);

  // 内容区域
  const body = document.createElement('div');
  body.style.cssText = `
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  `;

  // 当前组件信息
  const currentSection = document.createElement('div');
  currentSection.style.cssText = `
    margin-bottom: 24px;
    padding: 16px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 8px;
  `;

  const currentTitle = document.createElement('div');
  currentTitle.textContent = '📍 当前组件';
  currentTitle.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: #10b981;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;

  const currentInfo = document.createElement('div');
  currentInfo.innerHTML = `
    <div style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 4px;">
      ${data.current.name}
    </div>
    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
      ${data.current.file}
    </div>
    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">
      第 ${data.current.line} - ${data.current.endLine} 行 (${data.current.lineCount} 行)
    </div>
  `;

  currentSection.appendChild(currentTitle);
  currentSection.appendChild(currentInfo);

  // 复制格式
  const copySection = document.createElement('div');
  copySection.style.cssText = `
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(16, 185, 129, 0.2);
  `;

  const copyTitle = document.createElement('div');
  copyTitle.textContent = '📋 复制格式';
  copyTitle.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;

  const copyFormats = document.createElement('div');
  copyFormats.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  // 文件名+行数
  const format1 = createCopyFormat(
    `${data.copyFormats.fileNameAndLines}`,
    '文件名 + 行数',
    '用于大模型精确引用'
  );

  // 大模型搜索格式
  const format2 = createCopyFormat(
    data.copyFormats.llmSearch,
    '大模型搜索',
    '直接复制给大模型'
  );

  copyFormats.appendChild(format1.element);
  copyFormats.appendChild(format2.element);

  copySection.appendChild(copyTitle);
  copySection.appendChild(copyFormats);

  currentSection.appendChild(copySection);

  // 兄弟组件列表
  const siblingsSection = document.createElement('div');

  const siblingsTitle = document.createElement('div');
  siblingsTitle.textContent = `🔍 平级组件 (${data.siblings.length})`;
  siblingsTitle.style.cssText = `
    font-size: 14px;
    font-weight: 600;
    color: white;
    margin-bottom: 12px;
  `;

  const siblingsList = document.createElement('div');
  siblingsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  if (data.siblings.length === 0) {
    siblingsList.innerHTML = `
      <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 20px;">
        同一目录下没有其他组件
      </div>
    `;
  } else {
    for (const sibling of data.siblings) {
      const siblingItem = document.createElement('div');
      siblingItem.style.cssText = `
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;

      siblingItem.addEventListener('mouseenter', () => {
        siblingItem.style.background = 'rgba(255, 255, 255, 0.1)';
        siblingItem.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      });

      siblingItem.addEventListener('mouseleave', () => {
        siblingItem.style.background = 'rgba(255, 255, 255, 0.05)';
        siblingItem.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      });

      siblingItem.addEventListener('click', () => {
        removeSiblingComponentsModal();
        jumpToComponent(sibling.name);
      });

      const siblingInfo = document.createElement('div');
      siblingInfo.innerHTML = `
        <div style="font-size: 14px; font-weight: 500; color: white; margin-bottom: 4px;">
          ${sibling.name}
        </div>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          ${sibling.file} • 第 ${sibling.line} - ${sibling.endLine} 行
        </div>
      `;

      const jumpIcon = document.createElement('span');
      jumpIcon.innerHTML = '↗️';
      jumpIcon.style.cssText = `
        font-size: 16px;
        opacity: 0;
        transition: opacity 0.2s;
      `;

      siblingItem.addEventListener('mouseenter', () => {
        jumpIcon.style.opacity = '1';
      });

      siblingItem.addEventListener('mouseleave', () => {
        jumpIcon.style.opacity = '0';
      });

      siblingItem.appendChild(siblingInfo);
      siblingItem.appendChild(jumpIcon);
      siblingsList.appendChild(siblingItem);
    }
  }

  siblingsSection.appendChild(siblingsTitle);
  siblingsSection.appendChild(siblingsList);

  body.appendChild(currentSection);
  body.appendChild(siblingsSection);

  // 底部
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  `;

  footer.innerHTML = `
    <div>按 ESC 或点击背景关闭</div>
    <div>${data.directory}</div>
  `;

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  modal.appendChild(content);

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      removeSiblingComponentsModal();
    }
  });

  // ESC 关闭
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeSiblingComponentsModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(modal);
  (state as any).siblingComponentsModal = modal;
}

/**
 * 创建复制格式元素
 */
function createCopyFormat(text: string, _label: string, _description: string) {
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;

  const textElement = document.createElement('div');
  textElement.style.cssText = `
    flex: 1;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    font-size: 11px;
    color: white;
    word-break: break-all;
  `;
  textElement.textContent = text;

  const copyButton = document.createElement('button');
  copyButton.innerHTML = '📋 复制';
  copyButton.style.cssText = `
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #10b981;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  `;

  copyButton.addEventListener('mouseenter', () => {
    copyButton.style.background = 'rgba(16, 185, 129, 0.3)';
    copyButton.style.borderColor = 'rgba(16, 185, 129, 0.6)';
  });

  copyButton.addEventListener('mouseleave', () => {
    copyButton.style.background = 'rgba(16, 185, 129, 0.2)';
    copyButton.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  });

  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(text);
    copyButton.innerHTML = '✅ 已复制';
    setTimeout(() => {
      copyButton.innerHTML = '📋 复制';
    }, 1500);
  });

  container.appendChild(textElement);
  container.appendChild(copyButton);

  return { element: container };
}

/**
 * 移除兄弟组件模态框
 */
function removeSiblingComponentsModal() {
  const modal = (state as any).siblingComponentsModal;
  if (modal) {
    modal.remove();
    (state as any).siblingComponentsModal = null;
  }
}

/**
 * 显示兄弟组件错误提示
 */
function showSiblingComponentsError(componentName: string, error: string) {
  const toast = document.createElement('div');
  toast.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">❌ 获取兄弟组件失败</div>
    <div style="font-size: 11px; opacity: 0.9;">&lt;${componentName} /&gt;</div>
    <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${error}</div>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #ef4444;
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
  }, 3000);
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

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 激活检查器时的全局样式 */
  .react-component-inspector-active * {
    cursor: crosshair !important;
  }
`;
document.head.appendChild(style);

// 扩展 HTMLElement 类型以包含 _cleanup 属性
declare global {
  interface HTMLElement {
    _cleanup?: () => void;
  }
}
