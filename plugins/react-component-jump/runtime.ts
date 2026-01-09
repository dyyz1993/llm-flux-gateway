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
  /** 是否启用标签显示 */
  tagsEnabled: boolean;
  /** 当前打开的组件详情模态框数据 */
  currentModalData: any;
}

const state: State = {
  showInspector: false,
  portalContainer: null,
  componentColors: new Map(),
  routeCleanup: [],
  searchBox: null,
  searchQuery: '',
  dependencyGraphModal: null,
  tagsEnabled: false,
  currentModalData: null,
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
    state.tagsEnabled = true;
    showInspectorNotification(true);

    // 创建搜索框
    createSearchBox();

    // 创建 Portal 容器
    createPortalContainer();

    // 显示所有组件标签
    addAllComponentBadges();

    // 启动位置更新
    startBadgeUpdater();

    // 设置 DOM 观察者，用于动态添加新出现的组件标签
    setupDOMObserver();

    // 监听路由变化
    setupRouteListeners();
  } else {
    console.log('[react-component-jumper] 👁️‍🗨️  Inspector OFF');
    document.body.classList.remove('react-component-inspector-active');
    state.tagsEnabled = false;
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

    // 停止 DOM 观察者
    stopDOMObserver();

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

  // 从 localStorage 读取保存的位置
  const savedPosition = localStorage.getItem('react-component-jumper-search-position');
  const savedQuery = localStorage.getItem('react-component-jumper-search-query') || '';

  let initialStyle = `
    position: fixed;
    bottom: 20px;
    right: 20px;
  `;

  if (savedPosition) {
    try {
      const pos = JSON.parse(savedPosition);
      initialStyle = `
        position: fixed;
        left: ${pos.left}px;
        top: ${pos.top}px;
        bottom: auto;
        right: auto;
      `;
    } catch (e) {
      console.warn('[react-component-jumper] 无法解析保存的位置', e);
    }
  }

  const searchBox = document.createElement('div');
  searchBox.id = 'react-component-jumper-search-box';
  searchBox.style.cssText = `
    ${initialStyle}
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
    cursor: move;
    user-select: none;
  `;

  // 添加拖拽功能
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  searchBox.addEventListener('mousedown', (e) => {
    // 只在搜索框本身（不是输入框）上才允许拖拽
    if (e.target !== searchBox && !searchBox.contains(e.target as Node)) return;
    if (e.target.tagName === 'INPUT') return;

    isDragging = true;
    const rect = searchBox.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = e.clientX - dragOffsetX;
      const newY = e.clientY - dragOffsetY;

      // 限制在视口内
      const maxX = window.innerWidth - searchBox.offsetWidth;
      const maxY = window.innerHeight - searchBox.offsetHeight;

      searchBox.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
      searchBox.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
      searchBox.style.bottom = 'auto';
      searchBox.style.right = 'auto';

      // 实时更新联想列表位置
      const autocompleteList = document.getElementById('react-component-jumper-autocomplete');
      if (autocompleteList && autocompleteList.style.display !== 'none') {
        const rect = searchBox.getBoundingClientRect();
        autocompleteList.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        autocompleteList.style.right = (window.innerWidth - rect.right) + 'px';
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      // 保存位置到 localStorage
      const rect = searchBox.getBoundingClientRect();
      localStorage.setItem('react-component-jumper-search-position', JSON.stringify({
        left: rect.left,
        top: rect.top,
      }));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

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
  searchInput.value = savedQuery;
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

  // 创建搜索联想下拉列表
  const autocompleteList = document.createElement('div');
  autocompleteList.id = 'react-component-jumper-autocomplete';
  autocompleteList.style.cssText = `
    position: fixed;
    width: 300px;
    max-height: 300px;
    overflow-y: auto;
    background: rgba(15, 23, 42, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 999999;
    display: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  document.body.appendChild(autocompleteList);

  let autocompleteItems: string[] = [];
  let selectedIndex = -1;

  // 更新联想列表位置（跟随搜索框）
  const updateAutocompletePosition = () => {
    const rect = searchBox.getBoundingClientRect();
    autocompleteList.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    autocompleteList.style.right = (window.innerWidth - rect.right) + 'px';
  };

  // 更新联想列表
  const updateAutocomplete = (query: string) => {
    if (!query) {
      autocompleteList.style.display = 'none';
      return;
    }

    // 更新位置
    updateAutocompletePosition();

    // 获取所有匹配的组件名
    const allComponents = document.querySelectorAll('[data-component-name]');
    const matches = new Set<string>();
    allComponents.forEach((component) => {
      const name = component.getAttribute('data-component-name');
      if (name && name.toLowerCase().includes(query.toLowerCase())) {
        matches.add(name);
      }
    });

    autocompleteItems = Array.from(matches).sort();
    selectedIndex = -1;

    if (autocompleteItems.length === 0) {
      autocompleteList.style.display = 'none';
      return;
    }

    // 渲染列表
    autocompleteList.innerHTML = autocompleteItems.map((name, index) => `
      <div class="autocomplete-item" data-index="${index}" data-name="${name}" style="
        padding: 10px 12px;
        cursor: pointer;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        transition: background 0.15s;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
        ${index === selectedIndex ? 'background: rgba(16, 185, 129, 0.2);' : ''}
      ">
        ${name.replace(new RegExp(`(${query})`, 'gi'), '<strong style="color: #10b981;">$1</strong>')}
      </div>
    `).join('');

    autocompleteList.style.display = 'block';

    // 添加点击事件
    autocompleteList.querySelectorAll('.autocomplete-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const name = (e.currentTarget as HTMLElement).getAttribute('data-name');
        if (name) {
          searchInput.value = name;
          state.searchQuery = name.toLowerCase();
          autocompleteList.style.display = 'none';
          updateBadgePositions();
          searchInput.focus();
        }
      });

      item.addEventListener('mouseenter', () => {
        selectedIndex = parseInt((item as HTMLElement).getAttribute('data-index') || '-1');
        updateSelection();
      });
    });
  };

  // 更新选中状态
  const updateSelection = () => {
    autocompleteList.querySelectorAll('.autocomplete-item').forEach((item, index) => {
      if (index === selectedIndex) {
        (item as HTMLElement).style.background = 'rgba(16, 185, 129, 0.2)';
      } else {
        (item as HTMLElement).style.background = 'transparent';
      }
    });
  };

  // 搜索事件监听
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value;
    state.searchQuery = query.toLowerCase();

    // 保存查询到 localStorage
    localStorage.setItem('react-component-jumper-search-query', query);

    // 更新匹配数量
    const allComponents = document.querySelectorAll('[data-component-name]');
    const uniqueNames = new Set<string>();
    allComponents.forEach((component) => {
      const name = component.getAttribute('data-component-name');
      if (name && name.toLowerCase().includes(state.searchQuery)) {
        uniqueNames.add(name);
      }
    });
    matchCount.textContent = state.searchQuery ? `(${uniqueNames.size})` : '';

    // 更新联想列表
    updateAutocomplete(query);

    // 触发badge位置更新（会应用过滤）
    updateBadgePositions();
  });

  // 键盘导航
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      state.searchQuery = '';
      matchCount.textContent = '';
      autocompleteList.style.display = 'none';
      localStorage.removeItem('react-component-jumper-search-query');
      updateBadgePositions();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (autocompleteItems.length > 0 && selectedIndex < autocompleteItems.length - 1) {
        selectedIndex++;
        updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIndex > 0) {
        selectedIndex--;
        updateSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < autocompleteItems.length) {
        searchInput.value = autocompleteItems[selectedIndex];
        state.searchQuery = autocompleteItems[selectedIndex].toLowerCase();
        autocompleteList.style.display = 'none';
        updateBadgePositions();
      }
    }
  });

  // 点击外部关闭联想列表
  document.addEventListener('click', (e) => {
    if (!searchBox.contains(e.target as Node) && !autocompleteList.contains(e.target as Node)) {
      autocompleteList.style.display = 'none';
    }
  });

  // 如果有保存的查询，触发自动联想和更新
  if (savedQuery) {
    state.searchQuery = savedQuery.toLowerCase();
    // 延迟触发，确保 DOM 已准备就绪
    setTimeout(() => {
      updateAutocomplete(savedQuery);
      updateBadgePositions();
      // 更新匹配数量
      const allComponents = document.querySelectorAll('[data-component-name]');
      const uniqueNames = new Set<string>();
      allComponents.forEach((component) => {
        const name = component.getAttribute('data-component-name');
        if (name && name.toLowerCase().includes(state.searchQuery)) {
          uniqueNames.add(name);
        }
      });
      matchCount.textContent = `(${uniqueNames.size})`;
    }, 100);
  }
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
 * 包括 React 组件和 HTML 元素
 */
function addAllComponentBadges() {
  if (!state.portalContainer) return;

  // 清除现有标签
  removeAllComponentBadges();

  const components = document.querySelectorAll('[data-component-name]');
  const htmlElements = document.querySelectorAll('[data-element-name]');

  console.log(`[react-component-jumper] 找到 ${components.length} 个组件, ${htmlElements.length} 个 HTML 元素`);

  let count = 0;

  // 处理 React 组件
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
    badge.dataset.isReactComponent = 'true';
    badge.innerHTML = `
      <span class="badge-name">${componentName}</span>
      <span class="badge-actions">
        <span class="badge-siblings" title="查看平级元素">🔗</span>
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

      // 查询组件信息以获取文件路径和行号
      fetch(`/__react_component_jump/api/component-registry`)
        .then(res => res.json())
        .then((registry: any) => {
          const component = registry.components[componentName];
          if (component) {
            return jumpToComponent(component.file, component.line);
          } else {
            // 如果注册表中没有，回退到只使用组件名
            return jumpToComponent(componentName);
          }
        })
        .catch(() => {
          // 失败时回退到只使用组件名
          return jumpToComponent(componentName);
        })
        .finally(() => {
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

  // 处理 HTML 元素（用灰色区分）
  htmlElements.forEach((element) => {
    const elementName = element.getAttribute('data-element-name');
    if (!elementName) return;

    // 解析元素名称（格式：ComponentName__tagName__position）
    const parts = elementName.split('__');
    if (parts.length < 2) return;

    const tagName = parts[1];
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // HTML 元素使用灰色
    const elementColor = '#64748b'; // slate-500

    // 创建标签（HTML 元素的标签更简洁）
    const badge = document.createElement('div');
    badge.className = 'react-component-jumper-badge-all';
    badge.dataset.componentName = elementName;
    badge.dataset.attachTo = `[data-element-name="${elementName}"]`;
    badge.dataset.isHtmlElement = 'true';
    badge.innerHTML = `
      <span class="badge-name">&lt;${tagName}&gt;</span>
      <span class="badge-actions">
        <span class="badge-copy" title="复制元素名">📋</span>
      </span>
    `;
    badge.style.cssText = `
      position: absolute;
      top: ${rect.top - 20 - 1}px;
      left: ${rect.left}px;
      background: linear-gradient(135deg, ${elementColor} 0%, ${adjustColor(elementColor, -20)} 100%);
      color: white;
      padding: 2px 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 9px;
      border-radius: 3px;
      pointer-events: auto;
      box-shadow: 0 2px 8px ${elementColor}66;
      white-space: nowrap;
      transition: transform 0.15s, box-shadow 0.15s;
      user-select: none;
      will-change: transform;
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0.8;
    `;

    // 复制按钮
    const copyBtn = badge.querySelector('.badge-copy')!;
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(`<${tagName}>`);
      showCopySuccess(`<${tagName}>`);
    });

    // 悬停效果
    badge.addEventListener('mouseenter', () => {
      (badge as HTMLElement).style.transform = 'scale(1.05)';
      (badge as HTMLElement).style.boxShadow = `0 4px 12px ${elementColor}99`;
      (badge as HTMLElement).style.opacity = '1';
    });

    badge.addEventListener('mouseleave', () => {
      (badge as HTMLElement).style.transform = 'scale(1)';
      (badge as HTMLElement).style.boxShadow = `0 2px 8px ${elementColor}66`;
      (badge as HTMLElement).style.opacity = '0.8';
    });

    // 添加到 Portal 容器
    state.portalContainer!.appendChild(badge);
    count++;
  });

  console.log(`[react-component-jumper] ✅ 已显示 ${count} 个标签 (${components.length} 组件 + ${htmlElements.length} HTML 元素)`);
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
 * 设置 DOM 变化观察者（用于动态添加标签）
 */
let domObserver: MutationObserver | null = null;
let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function setupDOMObserver() {
  // 清除旧的观察者
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  // 检查是否需要观察（用户启用了标签显示）
  if (!state.tagsEnabled) return;

  // 跟踪已添加标签的元素
  const taggedElements = new WeakSet<Element>();

  domObserver = new MutationObserver((mutations) => {
    // 防抖：限制处理频率
    if (observerDebounceTimer) {
      clearTimeout(observerDebounceTimer);
    }

    observerDebounceTimer = setTimeout(() => {
      const needsUpdate = mutations.some(mutation => {
        // 只关注新增的节点或属性变化
        return mutation.type === 'childList' && mutation.addedNodes.length > 0;
      });

      if (!needsUpdate) return;

      console.log('[react-component-jumper] 🔍 检测到 DOM 变化，更新组件标签');

      // 收集新添加的带组件名的元素
      const newElements: Element[] = [];
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;

              // 检查是否是组件或元素
              const hasComponentName = element.hasAttribute('data-component-name');
              const hasElementName = element.hasAttribute('data-element-name');

              // 检查子元素
              const childComponents = element.querySelectorAll('[data-component-name], [data-element-name]');

              if (hasComponentName || hasElementName || childComponents.length > 0) {
                newElements.push(element);
              }

              // 也检查子元素
              childComponents.forEach(child => {
                if (!taggedElements.has(child)) {
                  newElements.push(child);
                }
              });
            }
          });
        }
      });

      if (newElements.length > 0) {
        // 批量更新标签位置
        updateBadgePositions();
      }
    }, 300); // 300ms 防抖
  });

  // 开始观察，但限制观察范围以提高性能
  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
    // 不观察属性变化，因为我们的组件是通过 data-* 属性标记的
    // 属性变化不会触发我们的关注点
  });

  console.log('[react-component-jumper] ✅ DOM 观察者已启动');
}

function stopDOMObserver() {
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
    console.log('[react-component-jumper] 🛑 DOM 观察者已停止');
  }

  if (observerDebounceTimer) {
    clearTimeout(observerDebounceTimer);
    observerDebounceTimer = null;
  }
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
 * 跳转到组件源文件（支持文件路径或组件名）
 */
async function jumpToComponent(filePath: string, line?: number): Promise<void> {
  console.log(`[react-component-jumper] 🎯 跳转到: ${filePath}${line ? `:${line}` : ''}`);

  try {
    const response = await fetch('/__react_component_jump/api/jump-to-component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, line }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        const displayName = filePath.split('/').pop() || filePath;
        showJumpSuccess(`${displayName}${line ? `:${line}` : ''}`);
      } else {
        showJumpError(filePath, result.error);
      }
    } else {
      showJumpError(filePath, `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('[react-component-jumper] ❌ 跳转错误:', error);
    showJumpError(filePath, String(error));
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
 * 生成 ASCII 格式的依赖树
 */
function generateASCIIDepTree(node: DepTreeNode, prefix: string = '', isLast: boolean = true): string {
  let result = '';

  // 添加当前节点
  const connector = prefix + (isLast ? '└── ' : '├── ');
  result += connector + node.name + (node.depCount > 0 ? ` [${node.depCount} deps]` : '') + '\n';

  // 处理子节点
  if (node.children && node.children.length > 0) {
    const childCount = node.children.length;
    node.children.forEach((child, index) => {
      const isLastChild = index === childCount - 1;
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      result += generateASCIIDepTree(child, childPrefix, isLastChild);
    });
  }

  return result;
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
    max-width: 900px;
    max-height: 85vh;
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

  // 标签页导航
  const tabsHeader = document.createElement('div');
  tabsHeader.style.cssText = `
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
  `;

  const tabs = [
    { id: 'tree', label: '🌳 可视化树', color: '#10b981' },
    { id: 'ascii', label: '📝 ASCII 图', color: '#8b5cf6' },
  ];

  const tabContents: Record<string, HTMLElement> = {};
  let activeTab = 'tree';

  for (const tab of tabs) {
    const tabButton = document.createElement('button');
    tabButton.style.cssText = `
      flex: 1;
      padding: 14px 20px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    `;
    tabButton.innerHTML = tab.label;
    tabButton.setAttribute('data-tab', tab.id);

    tabButton.addEventListener('mouseenter', () => {
      if (activeTab !== tab.id) {
        tabButton.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });

    tabButton.addEventListener('mouseleave', () => {
      if (activeTab !== tab.id) {
        tabButton.style.background = 'transparent';
      }
    });

    tabButton.addEventListener('click', () => {
      // 切换标签页
      activeTab = tab.id;
      tabs.forEach(t => {
        const btn = tabsHeader.querySelector(`[data-tab="${t.id}"]`) as HTMLElement;
        const content = tabContents[`tab-${t.id}`] as HTMLElement;
        if (btn) {
          if (t.id === tab.id) {
            btn.style.color = t.color;
            btn.style.borderBottomColor = t.color;
          } else {
            btn.style.color = 'rgba(255, 255, 255, 0.6)';
            btn.style.borderBottomColor = 'transparent';
          }
        }
        if (content) {
          (content as HTMLElement).style.display = t.id === tab.id ? 'block' : 'none';
        }
      });
    });

    tabsHeader.appendChild(tabButton);
  }

  // 内容区域
  const body = document.createElement('div');
  body.style.cssText = `
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
  `;

  // 树形图标签页内容
  const treeTabContent = document.createElement('div');
  treeTabContent.id = 'tab-tree';
  treeTabContent.style.cssText = `
    padding: 24px;
    flex: 1;
    overflow-y: auto;
  `;

  if (trees.length === 0) {
    treeTabContent.innerHTML = `
      <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 40px;">
        当前页面没有组件依赖关系
      </div>
    `;
  } else {
    for (const tree of trees) {
      treeTabContent.appendChild(renderDependencyTree(tree, 0));
    }
  }

  // ASCII 图标签页内容
  const asciiTabContent = document.createElement('div');
  asciiTabContent.id = 'tab-ascii';
  asciiTabContent.style.cssText = `
    padding: 24px;
    flex: 1;
    overflow-y: auto;
    display: none;
  `;

  if (trees.length === 0) {
    asciiTabContent.innerHTML = `
      <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 40px;">
        当前页面没有组件依赖关系
      </div>
    `;
  } else {
    // 生成 ASCII 图
    const asciiContainer = document.createElement('div');
    asciiContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
    `;

    const asciiPre = document.createElement('pre');
    asciiPre.style.cssText = `
      margin: 0;
      font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #10b981;
      white-space: pre;
    `;

    let asciiArt = '';
    for (const tree of trees) {
      asciiArt += generateASCIIDepTree(tree) + '\n\n';
    }
    asciiPre.textContent = asciiArt;

    asciiContainer.appendChild(asciiPre);
    asciiTabContent.appendChild(asciiContainer);
  }

  tabContents['tab-tree'] = treeTabContent;
  tabContents['tab-ascii'] = asciiTabContent;

  body.appendChild(tabsHeader);
  body.appendChild(treeTabContent);
  body.appendChild(asciiTabContent);

  // 默认激活第一个标签
  (tabsHeader.children[0] as HTMLElement).style.color = tabs[0]!.color;
  (tabsHeader.children[0] as HTMLElement).style.borderBottomColor = tabs[0]!.color;
  tabContents['tab-ascii']!.style.display = 'none';

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

  // 锁定 body 滚动
  document.body.style.overflow = 'hidden';
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

    // 查询组件信息以获取文件路径和行号
    fetch(`/__react_component_jump/api/component-registry`)
      .then(res => res.json())
      .then((registry: any) => {
        const component = registry.components[node.name];
        if (component) {
          return jumpToComponent(component.file, component.line);
        } else {
          // 如果注册表中没有，回退到只使用组件名
          return jumpToComponent(node.name);
        }
      })
      .catch(() => {
        // 失败时回退到只使用组件名
        return jumpToComponent(node.name);
      });
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
    // 恢复 body 滚动
    document.body.style.overflow = '';
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
// 并列元素发现
// ============================================================

/**
 * 显示子元素和兄弟组件
 */
async function showSiblingComponents(elementName: string): Promise<void> {
  console.log(`[react-component-jumper] 🔗 查找子元素和兄弟组件: ${elementName}`);

  try {
    // 获取组件名（去掉可能的 HTML 元素后缀）
    const componentName = elementName.includes('__') ? elementName.split('__')[0] : elementName;

    // 并行请求子元素和兄弟组件
    const [childrenResponse, siblingsResponse] = await Promise.all([
      fetch(`/__react_component_jump/api/sibling-elements/${encodeURIComponent(elementName)}`),
      fetch(`/__react_component_jump/api/sibling-components/${encodeURIComponent(componentName)}`)
    ]);

    if (!childrenResponse.ok || !siblingsResponse.ok) {
      throw new Error(`HTTP ${childrenResponse.status} / ${siblingsResponse.status}`);
    }

    const childrenData = await childrenResponse.json();
    const siblingsData = await siblingsResponse.json();

    if (!childrenData.success || !siblingsData.success) {
      showSiblingComponentsError(elementName, childrenData.error || siblingsData.error);
      return;
    }

    // 合并数据并显示
    showComponentDetailModal({
      current: childrenData.current,
      children: childrenData.siblings,
      parentComponent: childrenData.parentComponent,
      siblings: siblingsData.siblings,
      directory: siblingsData.directory,
    });
  } catch (error) {
    console.error('[react-component-jumper] ❌ 获取数据失败:', error);
    showSiblingComponentsError(elementName, String(error));
  }
}

/**
 * 显示并列元素模态框
 */
function showSiblingElementsModal(data: {
  current: any;
  siblings: any[];
  parentComponent: string | null;
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
      🔗 并列元素
    </div>
    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">
      ${data.siblings.length} 个并列元素 • 同一组件内
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

  // 当前元素信息
  const currentSection = document.createElement('div');
  currentSection.style.cssText = `
    margin-bottom: 24px;
    padding: 16px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 8px;
  `;

  const currentTitle = document.createElement('div');
  currentTitle.textContent = '📍 当前元素';
  currentTitle.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: #10b981;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;

  // 检查是否有当前元素数据
  if (!data.current) {
    const noDataInfo = document.createElement('div');
    noDataInfo.innerHTML = `
      <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">
        未找到当前元素信息
      </div>
    `;
    currentSection.appendChild(currentTitle);
    currentSection.appendChild(noDataInfo);
    body.appendChild(currentSection);

    // 显示并列元素列表（即使没有当前元素）
    const siblingsSection = document.createElement('div');
    const siblingsTitle = document.createElement('div');
    siblingsTitle.textContent = `🔗 并列元素 (${data.siblings.length})`;
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
          没有找到并列元素
        </div>
      `;
    } else {
      for (const sibling of data.siblings) {
        const isHtml = sibling.type === 'html';
        const siblingName = isHtml ? `<${sibling.tagName}>` : sibling.name;
        const siblingType = isHtml ? 'HTML 元素' : 'React 组件';

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

        siblingItem.addEventListener('click', () => {
          const textToCopy = isHtml ? `<${sibling.tagName}>` : sibling.name;
          navigator.clipboard.writeText(textToCopy);
          showCopySuccess(textToCopy);
        });

        const siblingInfo = document.createElement('div');
        siblingInfo.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 14px; font-weight: 500; color: white;">
              ${siblingName}
            </span>
            <span style="font-size: 9px; padding: 2px 6px; background: ${isHtml ? 'rgba(100, 116, 139, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; border-radius: 4px; color: ${isHtml ? '#94a3b8' : '#10b981'};">
              ${siblingType}
            </span>
          </div>
          <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
            ${sibling.file} • 第 ${sibling.line} - ${sibling.endLine} 行
          </div>
        `;

        siblingItem.appendChild(siblingInfo);
        siblingsList.appendChild(siblingItem);
      }
    }

    siblingsSection.appendChild(siblingsTitle);
    siblingsSection.appendChild(siblingsList);
    body.appendChild(siblingsSection);

    // Footer
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
      <div>${data.parentComponent ? '父组件: ' + data.parentComponent : ''}</div>
    `;

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);
    modal.appendChild(content);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        removeSiblingComponentsModal();
      }
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        removeSiblingComponentsModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // 锁定 body 滚动
    document.body.style.overflow = 'hidden';
    document.body.appendChild(modal);
    (state as any).siblingComponentsModal = modal;
    return;
  }

  // 判断元素类型并显示不同的信息
  const isHtmlElement = data.current.type === 'html';
  const currentName = isHtmlElement ? `<${data.current.tagName}>` : data.current.name;
  const elementType = isHtmlElement ? 'HTML 元素' : 'React 组件';

  const currentInfo = document.createElement('div');
  currentInfo.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
      <span style="font-size: 16px; font-weight: 600; color: white;">
        ${currentName}
      </span>
      <span style="font-size: 10px; padding: 2px 6px; background: ${isHtmlElement ? 'rgba(100, 116, 139, 0.3)' : 'rgba(16, 185, 129, 0.3)'}; border-radius: 4px; color: ${isHtmlElement ? '#94a3b8' : '#10b981'};">
        ${elementType}
      </span>
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

  // 复制格式区域
  const copyFormatsDiv = document.createElement('div');
  copyFormatsDiv.style.cssText = `
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(16, 185, 129, 0.2);
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  const copyTitle = document.createElement('div');
  copyTitle.textContent = '📋 复制格式';
  copyTitle.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;

  // 生成复制格式
  const fileName = data.current.file.split('/').pop();
  const formats = [
    {
      text: `${fileName}:${data.current.line}-${data.current.endLine}`,
      label: '文件名 + 行号范围',
      desc: '用于大模型精确引用'
    },
    {
      text: `查看 ${fileName} 文件第 ${data.current.line} 行开始的 ${currentName}`,
      label: '大模型搜索格式',
      desc: '直接复制给大模型'
    }
  ];

  for (const format of formats) {
    const formatItem = document.createElement('div');
    formatItem.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      padding: 8px 12px;
      cursor: pointer;
      transition: all 0.2s;
    `;

    formatItem.addEventListener('mouseenter', () => {
      formatItem.style.background = 'rgba(255, 255, 255, 0.1)';
      formatItem.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    });

    formatItem.addEventListener('mouseleave', () => {
      formatItem.style.background = 'rgba(255, 255, 255, 0.05)';
      formatItem.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    });

    formatItem.addEventListener('click', () => {
      navigator.clipboard.writeText(format.text);
      showCopySuccess(format.text);
    });

    const formatText = document.createElement('div');
    formatText.innerHTML = `
      <div style="font-size: 12px; color: white; font-family: monospace;">
        ${format.text}
      </div>
      <div style="font-size: 10px; color: rgba(255, 255, 255, 0.5); margin-top: 2px;">
        ${format.label} • ${format.desc}
      </div>
    `;

    const copyIcon = document.createElement('span');
    copyIcon.innerHTML = '📋';
    copyIcon.style.cssText = `
      font-size: 14px;
      opacity: 0.7;
    `;

    formatItem.appendChild(formatText);
    formatItem.appendChild(copyIcon);
    copyFormatsDiv.appendChild(formatItem);
  }

  currentSection.appendChild(copyFormatsDiv);

  // 父组件信息
  if (data.parentComponent) {
    const parentInfo = document.createElement('div');
    parentInfo.style.cssText = `
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(16, 185, 129, 0.2);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
    `;
    parentInfo.innerHTML = `
      <span style="color: rgba(255, 255, 255, 0.4);">父组件:</span>
      <span style="color: #10b981; font-weight: 500;">${data.parentComponent}</span>
    `;
    currentSection.appendChild(parentInfo);
  }

  body.appendChild(currentSection);

  // 并列元素列表
  const siblingsSection = document.createElement('div');

  const siblingsTitle = document.createElement('div');
  siblingsTitle.textContent = `🔗 并列元素 (${data.siblings.length})`;
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
        没有找到并列元素
      </div>
    `;
  } else {
    // 按类型分组：React 组件在前，HTML 元素在后
    const reactSiblings = data.siblings.filter((s: any) => s.type === 'react');
    const htmlSiblings = data.siblings.filter((s: any) => s.type === 'html');
    const sortedSiblings = [...reactSiblings, ...htmlSiblings];

    for (const sibling of sortedSiblings) {
      const isHtml = sibling.type === 'html';
      const siblingName = isHtml ? `<${sibling.tagName}>` : sibling.name;
      const siblingType = isHtml ? 'HTML 元素' : 'React 组件';
      const siblingColor = isHtml ? '#64748b' : '#10b981';

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
        siblingItem.style.borderColor = `rgba(${isHtml ? '100, 116, 139' : '16, 185, 129'}, 0.3)`;
      });

      siblingItem.addEventListener('mouseleave', () => {
        siblingItem.style.background = 'rgba(255, 255, 255, 0.05)';
        siblingItem.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      });

      // 点击跳转到文件
      siblingItem.addEventListener('click', () => {
        removeSiblingComponentsModal();
        jumpToComponent(sibling.file, sibling.line);
      });

      const siblingInfo = document.createElement('div');
      siblingInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 14px; font-weight: 500; color: white;">
            ${siblingName}
          </span>
          <span style="font-size: 9px; padding: 2px 6px; background: ${isHtml ? 'rgba(100, 116, 139, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; border-radius: 4px; color: ${isHtml ? '#94a3b8' : '#10b981'};">
            ${siblingType}
          </span>
        </div>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          ${sibling.file} • 第 ${sibling.line} 行
        </div>
      `;

      // 复制按钮
      const copyButton = document.createElement('button');
      copyButton.innerHTML = '📋';
      copyButton.title = '复制文件路径和行号';
      copyButton.style.cssText = `
        font-size: 14px;
        background: transparent;
        border: none;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;
        padding: 4px;
      `;
      copyButton.addEventListener('mouseenter', () => {
        copyButton.style.opacity = '1';
      });
      copyButton.addEventListener('mouseleave', () => {
        copyButton.style.opacity = '0';
      });
      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // 复制格式：文件名:行号（供大模型使用）
        const fileName = sibling.file.split('/').pop();
        const copyText = `${fileName}:${sibling.line}`;
        navigator.clipboard.writeText(copyText);
        showCopySuccess(copyText);
      });

      siblingItem.addEventListener('mouseenter', () => {
        copyButton.style.opacity = '1';
      });
      siblingItem.addEventListener('mouseleave', () => {
        copyButton.style.opacity = '0';
      });

      siblingItem.appendChild(siblingInfo);
      siblingItem.appendChild(copyButton);
      siblingsList.appendChild(siblingItem);
    }
  }

  siblingsSection.appendChild(siblingsTitle);
  siblingsSection.appendChild(siblingsList);

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
    <div>${data.parentComponent ? '父组件: ' + data.parentComponent : ''}</div>
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

  // 锁定 body 滚动
  document.body.style.overflow = 'hidden';
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
 * 获取代码片段
 */
async function fetchCodeSnippet(file: string, line: number, endLine: number): Promise<{ success: boolean; snippet?: string; context?: any; error?: string }> {
  try {
    const params = new URLSearchParams({
      file: file,
      line: String(line),
      endLine: String(endLine),
    });
    const response = await fetch(`/__react_component_jump/api/code-snippet?${params}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[react-component-jumper] ❌ 获取代码片段失败:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * 显示组件详情模态框（包含子元素、兄弟组件和代码预览）
 */
function showComponentDetailModal(data: {
  current: any;
  children: any[];
  parentComponent: string | null;
  siblings: any[];
  directory: string;
}) {
  // 如果已经存在，先移除
  removeSiblingComponentsModal();

  // 保存当前模态框数据，用于快捷键强制重新生成
  state.currentModalData = data;

  const modal = document.createElement('div');
  modal.className = 'react-component-jumper-detail-modal';
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

  // 添加键盘快捷键：Ctrl/Cmd + Shift + R 强制重新生成 AI 分析
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      console.log('[react-component-jumper] ⚡ 快捷键触发：强制重新生成 AI 分析');

      // 查找 AI 分析 tab 内容容器
      const aiTabContent = tabContents['tab-ai-analysis'];
      if (aiTabContent && data.current) {
        // 显示加载状态
        showAIAnalysisLoading(aiTabContent);
        // 强制重新分析
        loadAIAnalysis(data.current, aiTabContent, true);
      } else {
        console.warn('[react-component-jumper] ⚠️ 无法强制重新分析：未找到 AI 分析容器或组件数据');
      }
    }
  };

  modal.addEventListener('keydown', handleKeyDown);

  const content = document.createElement('div');
  content.style.cssText = `
    background: #1e293b;
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 85vh;
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

  const isHtmlElement = data.current?.type === 'html';
  const currentName = isHtmlElement ? `<${data.current.tagName}>` : (data.current?.name || 'Unknown');
  const elementType = isHtmlElement ? 'HTML 元素' : 'React 组件';

  const title = document.createElement('div');
  title.innerHTML = `
    <div style="font-size: 18px; font-weight: 600; color: white; margin-bottom: 4px;">
      📦 ${currentName}
    </div>
    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">
      ${elementType} • ${data.children.length} 个子元素 • ${data.siblings.length} 个兄弟组件
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

  closeButton.addEventListener('click', removeSiblingComponentsModal);
  header.appendChild(title);
  header.appendChild(closeButton);

  // 内容区域 - 使用标签页切换
  const body = document.createElement('div');
  body.style.cssText = `
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
  `;

  // 标签页头部
  const tabsHeader = document.createElement('div');
  tabsHeader.style.cssText = `
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
  `;

  const tabs = [
    { id: 'children', label: `📂 子元素 (${data.children.length})`, color: '#10b981' },
    { id: 'siblings', label: `🔗 兄弟组件 (${data.siblings.length})`, color: '#3b82f6' },
    { id: 'ai-analysis', label: `🤖 AI 分析 [Ctrl+Shift+R]`, color: '#f59e0b' },
  ];

  let activeTab = 'children';

  const tabContents: Record<string, HTMLElement> = {};

  for (const tab of tabs) {
    const tabButton = document.createElement('button');
    tabButton.style.cssText = `
      flex: 1;
      padding: 14px 20px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    `;
    tabButton.innerHTML = tab.label;

    tabButton.addEventListener('mouseenter', () => {
      if (activeTab !== tab.id) {
        tabButton.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });

    tabButton.addEventListener('mouseleave', () => {
      if (activeTab !== tab.id) {
        tabButton.style.background = 'transparent';
      }
    });

    tabButton.addEventListener('click', () => {
      // 切换标签页
      activeTab = tab.id;
      tabs.forEach(t => {
        const isActive = t.id === tab.id;
        const btn = tabContents[`tab-${t.id}`] as any;
        if (isActive) {
          (tabContents[`tab-${t.id}`] as HTMLElement).style.display = 'block';
        } else {
          (tabContents[`tab-${t.id}`] as HTMLElement).style.display = 'none';
        }
      });
      // 更新标签样式
      Array.from(tabsHeader.children).forEach((child, i) => {
        const isThisActive = tabs[i]!.id === tab.id;
        (child as HTMLElement).style.color = isThisActive ? tabs[i]!.color : 'rgba(255, 255, 255, 0.6)';
        (child as HTMLElement).style.borderBottomColor = isThisActive ? tabs[i]!.color : 'transparent';
      });
    });

    tabsHeader.appendChild(tabButton);

    // 创建标签内容
    const tabContent = document.createElement('div');
    tabContent.style.cssText = `
      padding: 20px;
      flex: 1;
      overflow-y: auto;
    `;
    tabContents[`tab-${tab.id}`] = tabContent;

    // 根据标签类型填充内容
    if (tab.id === 'children') {
      renderChildrenList(tabContent, data.children);
    } else if (tab.id === 'siblings') {
      renderSiblingsList(tabContent, data.siblings);
    } else if (tab.id === 'ai-analysis') {
      renderAIAnalysis(tabContent, data.current);
    }
  }

  // 默认激活第一个标签
  (tabsHeader.children[0] as HTMLElement).style.color = tabs[0]!.color;
  (tabsHeader.children[0] as HTMLElement).style.borderBottomColor = tabs[0]!.color;
  tabContents['tab-siblings']!.style.display = 'none';
  tabContents['tab-ai-analysis']!.style.display = 'none';

  // 渲染子元素列表
  function renderChildrenList(container: HTMLElement, items: any[]) {
    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 40px;">
          <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
          <div style="font-size: 14px;">没有找到子元素</div>
        </div>
      `;
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const reactChildren = items.filter((i: any) => i.type === 'react');
    const htmlChildren = items.filter((i: any) => i.type === 'html');
    const sortedChildren = [...reactChildren, ...htmlChildren];

    for (const item of sortedChildren) {
      const isHtml = item.type === 'html';
      const itemName = isHtml ? `<${item.tagName}>` : item.name;
      const itemType = isHtml ? 'HTML 元素' : 'React 组件';
      const itemColor = isHtml ? '#64748b' : '#10b981';

      const itemRow = document.createElement('div');
      itemRow.style.cssText = `
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        transition: all 0.2s;
      `;

      // 主行
      const mainRow = document.createElement('div');
      mainRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;

      const itemInfo = document.createElement('div');
      itemInfo.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
      `;

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `
        font-size: 14px;
        font-weight: 500;
        color: white;
      `;
      nameSpan.textContent = itemName;

      const typeBadge = document.createElement('span');
      typeBadge.style.cssText = `
        font-size: 9px;
        padding: 2px 6px;
        background: ${isHtml ? 'rgba(100, 116, 139, 0.2)' : 'rgba(16, 185, 129, 0.2)'};
        border-radius: 4px;
        color: ${isHtml ? '#94a3b8' : '#10b981'};
      `;
      typeBadge.textContent = itemType;

      const locationSpan = document.createElement('span');
      locationSpan.style.cssText = `
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
      `;
      locationSpan.textContent = `${item.file.split('/').pop()}:${item.line}`;

      itemInfo.appendChild(nameSpan);
      itemInfo.appendChild(typeBadge);
      itemInfo.appendChild(locationSpan);

      // 操作按钮
      const actions = document.createElement('div');
      actions.style.cssText = `
        display: flex;
        gap: 8px;
      `;

      // 跳转按钮
      const jumpBtn = document.createElement('button');
      jumpBtn.innerHTML = '🎯';
      jumpBtn.title = '跳转到代码';
      jumpBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      `;
      jumpBtn.addEventListener('click', () => {
        jumpToComponent(item.file, item.line);
      });
      jumpBtn.addEventListener('mouseenter', () => jumpBtn.style.opacity = '1');
      jumpBtn.addEventListener('mouseleave', () => jumpBtn.style.opacity = '0.7');

      // 代码预览按钮
      const codePreviewBtn = document.createElement('button');
      codePreviewBtn.innerHTML = '📄';
      codePreviewBtn.title = '预览代码';
      codePreviewBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      `;
      codePreviewBtn.addEventListener('click', async () => {
        const result = await fetchCodeSnippet(item.file, item.line, item.endLine || item.line);
        if (result.success && result.snippet) {
          showCodePreviewModal(itemName, result.snippet, result.context, item.file, item.line);
        } else {
          showCopySuccess('无法加载代码: ' + (result.error || '未知错误'));
        }
      });
      codePreviewBtn.addEventListener('mouseenter', () => codePreviewBtn.style.opacity = '1');
      codePreviewBtn.addEventListener('mouseleave', () => codePreviewBtn.style.opacity = '0.7');

      // 复制按钮
      const copyBtn = document.createElement('button');
      copyBtn.innerHTML = '📋';
      copyBtn.title = '复制路径';
      copyBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      `;
      copyBtn.addEventListener('click', () => {
        const fileName = item.file.split('/').pop();
        const copyText = `${fileName}:${item.line}`;
        navigator.clipboard.writeText(copyText);
        showCopySuccess(copyText);
      });
      copyBtn.addEventListener('mouseenter', () => copyBtn.style.opacity = '1');
      copyBtn.addEventListener('mouseleave', () => copyBtn.style.opacity = '0.7');

      actions.appendChild(jumpBtn);
      actions.appendChild(codePreviewBtn);
      actions.appendChild(copyBtn);

      mainRow.appendChild(itemInfo);
      mainRow.appendChild(actions);

      itemRow.appendChild(mainRow);
      list.appendChild(itemRow);
    }

    container.appendChild(list);
  }

  // 渲染兄弟组件列表
  function renderSiblingsList(container: HTMLElement, items: any[]) {
    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 40px;">
          <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
          <div style="font-size: 14px;">没有找到兄弟组件</div>
        </div>
      `;
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    for (const item of items) {
      const itemRow = document.createElement('div');
      itemRow.style.cssText = `
        padding: 12px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 8px;
        transition: all 0.2s;
        cursor: pointer;
      `;

      itemRow.addEventListener('mouseenter', () => {
        itemRow.style.background = 'rgba(59, 130, 246, 0.15)';
        itemRow.style.borderColor = 'rgba(59, 130, 246, 0.4)';
      });

      itemRow.addEventListener('mouseleave', () => {
        itemRow.style.background = 'rgba(59, 130, 246, 0.1)';
        itemRow.style.borderColor = 'rgba(59, 130, 246, 0.2)';
      });

      itemRow.addEventListener('click', () => {
        jumpToComponent(item.file, item.line);
      });

      const mainRow = document.createElement('div');
      mainRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;

      const itemInfo = document.createElement('div');
      itemInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <span style="font-size: 14px; font-weight: 500; color: white;">
            ${item.name}
          </span>
          <span style="font-size: 9px; padding: 2px 6px; background: rgba(59, 130, 246, 0.2); border-radius: 4px; color: #60a5fa;">
            React 组件
          </span>
        </div>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          ${item.file.split('/').pop()} • 第 ${item.line} - ${item.endLine} 行
        </div>
      `;

      // 操作按钮
      const actions = document.createElement('div');
      actions.style.cssText = `
        display: flex;
        gap: 8px;
      `;

      // 代码预览按钮
      const codePreviewBtn = document.createElement('button');
      codePreviewBtn.innerHTML = '📄';
      codePreviewBtn.title = '预览代码';
      codePreviewBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      `;
      codePreviewBtn.addEventListener('click', async (e: Event) => {
        e.stopPropagation();
        const result = await fetchCodeSnippet(item.file, item.line, item.endLine || item.line);
        if (result.success && result.snippet) {
          showCodePreviewModal(item.name, result.snippet, result.context, item.file, item.line);
        } else {
          showCopySuccess('无法加载代码: ' + (result.error || '未知错误'));
        }
      });
      codePreviewBtn.addEventListener('mouseenter', () => codePreviewBtn.style.opacity = '1');
      codePreviewBtn.addEventListener('mouseleave', () => codePreviewBtn.style.opacity = '0.7');

      // 复制按钮
      const copyBtn = document.createElement('button');
      copyBtn.innerHTML = '📋';
      copyBtn.title = '复制路径';
      copyBtn.style.cssText = `
        background: transparent;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      `;
      copyBtn.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        const fileName = item.file.split('/').pop();
        const copyText = `${fileName}:${item.line}`;
        navigator.clipboard.writeText(copyText);
        showCopySuccess(copyText);
      });
      copyBtn.addEventListener('mouseenter', () => copyBtn.style.opacity = '1');
      copyBtn.addEventListener('mouseleave', () => copyBtn.style.opacity = '0.7');

      actions.appendChild(codePreviewBtn);
      actions.appendChild(copyBtn);

      mainRow.appendChild(itemInfo);
      mainRow.appendChild(actions);

      itemRow.appendChild(mainRow);
      list.appendChild(itemRow);
    }

    container.appendChild(list);
  }

  // 渲染 AI 分析
  function renderAIAnalysis(container: HTMLElement, currentComponent: any) {
    // 显示加载状态
    showAIAnalysisLoading(container);

    // 加载分析结果
    loadAIAnalysis(currentComponent, container);
  }

  // 显示 AI 分析加载状态
  function showAIAnalysisLoading(container: HTMLElement) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px;">
        <div style="font-size: 40px; margin-bottom: 16px;">🤖</div>
        <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">AI 正在分析组件...</div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-top: 8px;">这可能需要几秒钟</div>
      </div>
    `;
  }

  // 加载 AI 分析结果
  async function loadAIAnalysis(component: any, container: HTMLElement, force: boolean = false) {
    if (!component) {
      container.innerHTML = `
        <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 60px 20px;">
          <div style="font-size: 40px; margin-bottom: 12px;">⚠️</div>
          <div style="font-size: 14px;">无法获取组件信息</div>
        </div>
      `;
      return;
    }

    const componentName = component.name || currentName;
    const file = component.file;
    const line = component.line;
    const endLine = component.endLine || line;

    // 验证必需参数
    if (!file || !line) {
      showAIAnalysisError(container, `缺少组件位置信息 (file: ${file}, line: ${line})`);
      console.error('[react-component-jumper] ❌ 组件缺少位置信息:', { component, componentName, file, line, endLine });
      return;
    }

    console.log('[react-component-jumper] 📋 开始 AI 分析:', { componentName, file, line, endLine, force });

    try {
      let analysisData = null;
      let fromCache = false;

      // 如果是强制重新分析，直接跳过缓存
      if (!force) {
        // 先尝试获取缓存的分析
        const cachedResponse = await fetch(`/__react_component_jump/api/ai-analysis/${encodeURIComponent(componentName)}`);

        if (cachedResponse.ok) {
          const cached = await cachedResponse.json();
          console.log('[react-component-jumper] 📦 缓存响应:', cached);

          if (cached.success && cached.analysis) {
            // 缓存返回的是 AnalysisCache 对象，需要提取 analysis 字段
            // AnalysisCache 结构: { component, code, analysis: ComponentAnalysis, meta }
            analysisData = cached.analysis.analysis || cached.analysis;

            // 将 meta 信息附加到 analysisData 上，用于显示缓存时间
            if (cached.analysis.meta && !analysisData.meta) {
              (analysisData as any).meta = cached.analysis.meta;
            }

            console.log('[react-component-jumper] ✅ 提取的分析数据:', analysisData);
            fromCache = true;
          } else {
            console.log('[react-component-jumper] ⚠️ 缓存响应无效:', cached);
          }
        } else {
          console.log('[react-component-jumper] ⚠️ 缓存未命中或错误:', cachedResponse.status);
        }
      }

      // 如果没有缓存或强制重新分析，启动新的分析
      if (!analysisData) {
        console.log('[react-component-jumper] 🤖 启动 AI 分析...');
        const analyzeResponse = await fetch('/__react_component_jump/api/ai-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            componentName,
            file,
            line,
            endLine,
            force, // 传递 force 参数给后端
            context: {
              childComponents: data.children.map((c: any) => c.name),
              siblingComponents: data.siblings.map((c: any) => c.name),
              parentComponent: data.parentComponent,
            },
          }),
        });

        if (analyzeResponse.ok) {
          const result = await analyzeResponse.json();
          console.log('[react-component-jumper] 📊 分析响应:', result);

          if (result.success && result.analysis) {
            // analyze API 直接返回 ComponentAnalysis
            analysisData = result.analysis;
            fromCache = result.cached;
            console.log('[react-component-jumper] ✅ 分析数据提取成功:', analysisData);
          } else {
            console.error('[react-component-jumper] ❌ 分析响应无效:', result);
          }
        } else {
          console.error('[react-component-jumper] ❌ 分析请求失败:', analyzeResponse.status, await analyzeResponse.text());
        }
      }

      if (analysisData) {
        renderAIAnalysisResult(container, analysisData, fromCache, componentName, file, line, endLine);
      } else {
        showAIAnalysisError(container, '无法获取分析结果');
      }
    } catch (error) {
      console.error('[react-component-jumper] ❌ AI 分析失败:', error);
      showAIAnalysisError(container, String(error));
    }
  }

  // 显示 AI 分析结果
  function renderAIAnalysisResult(
    container: HTMLElement,
    analysis: any,
    fromCache: boolean,
    componentName: string,
    file: string,
    line: number,
    endLine: number
  ) {
    console.log('[react-component-jumper] 🎨 开始渲染 AI 分析结果:', {
      componentName,
      fromCache,
      analysisKeys: Object.keys(analysis || {}),
      analysis,
    });

    if (!analysis) {
      console.error('[react-component-jumper] ❌ 分析数据为空');
      showAIAnalysisError(container, '分析数据为空');
      return;
    }

    const { description, purpose, props, state, dependencies, businessLogic, usage, concerns, suggestions, issues } = analysis;

    console.log('[react-component-jumper] 📋 解构后的字段:', {
      hasDescription: !!description,
      hasPurpose: !!purpose,
      propsLength: props?.length || 0,
      stateLength: state?.length || 0,
      hasDependencies: !!(dependencies?.external?.length || dependencies?.internal?.length),
      businessLogicLength: businessLogic?.length || 0,
      hasUsage: !!usage,
      concernsLength: concerns?.length || 0,
      suggestionsLength: suggestions?.length || 0,
    });

    container.innerHTML = '';

    // 缓存提示
    if (fromCache) {
      const cacheNotice = document.createElement('div');
      cacheNotice.style.cssText = `
        padding: 8px 12px;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;

      // 安全地获取分析时间
      let cacheTime = '未知时间';
      if ((analysis as any).meta?.analyzedAt) {
        try {
          cacheTime = new Date((analysis as any).meta.analyzedAt).toLocaleString();
        } catch {
          cacheTime = '无效时间';
        }
      }

      cacheNotice.innerHTML = `
        <span>💾 来自缓存的分析结果 (${cacheTime})</span>
        <button class="reanalyze-btn" style="background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">🔄 重新分析</button>
      `;
      cacheNotice.querySelector('.reanalyze-btn')?.addEventListener('click', () => {
        showAIAnalysisLoading(container);
        loadAIAnalysis({ name: componentName, file, line, endLine }, container);
      });
      container.appendChild(cacheNotice);
    }

    // 描述和目的
    if (description || purpose) {
      const descSection = document.createElement('div');
      descSection.style.cssText = `
        margin-bottom: 20px;
        padding: 16px;
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: 8px;
      `;

      if (description) {
        const descTitle = document.createElement('div');
        descTitle.style.cssText = `
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        `;
        descTitle.textContent = '📝 组件描述';
        descSection.appendChild(descTitle);

        const descText = document.createElement('div');
        descText.style.cssText = `
          font-size: 14px;
          color: white;
          line-height: 1.6;
        `;
        descText.textContent = description;
        descSection.appendChild(descText);
      }

      if (purpose) {
        const purposeTitle = document.createElement('div');
        purposeTitle.style.cssText = `
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          margin-top: 12px;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        `;
        purposeTitle.textContent = '🎯 核心目的';
        descSection.appendChild(purposeTitle);

        const purposeText = document.createElement('div');
        purposeText.style.cssText = `
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.6;
        `;
        purposeText.textContent = purpose;
        descSection.appendChild(purposeText);
      }

      container.appendChild(descSection);
    }

    // Props
    if (props && props.length > 0) {
      const propsSection = createSection('📥 Props', props, (prop: any) => `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span style="font-family: monospace; font-size: 13px; color: #60a5fa; font-weight: 500;">${prop.name}</span>
          <span style="font-size: 11px; padding: 2px 6px; background: ${prop.required ? 'rgba(239, 68, 68, 0.2)' : 'rgba(100, 116, 139, 0.2)'}; border-radius: 4px; color: ${prop.required ? '#f87171' : '#94a3b8'};">
            ${prop.required ? '必需' : '可选'}
          </span>
          <span style="font-family: monospace; font-size: 11px; color: rgba(255, 255, 255, 0.5);">${prop.type}</span>
        </div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 4px;">${prop.description}</div>
        ${prop.defaultValue ? `<div style="font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-top: 4px;">默认值: <code style="background: rgba(0, 0, 0, 0.3); padding: 2px 6px; border-radius: 3px;">${prop.defaultValue}</code></div>` : ''}
      `);
      container.appendChild(propsSection);
    }

    // State
    if (state && state.length > 0) {
      const stateSection = createSection('🔄 State', state, (s: any) => `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span style="font-family: monospace; font-size: 13px; color: #a78bfa; font-weight: 500;">${s.name}</span>
          <span style="font-family: monospace; font-size: 11px; color: rgba(255, 255, 255, 0.5);">${s.type}</span>
        </div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 4px;">${s.purpose}</div>
      `);
      container.appendChild(stateSection);
    }

    // 依赖
    if (dependencies && (dependencies.external?.length > 0 || dependencies.internal?.length > 0)) {
      const depsSection = document.createElement('div');
      depsSection.style.cssText = `
        margin-bottom: 20px;
      `;

      const depsTitle = document.createElement('div');
      depsTitle.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: white;
        margin-bottom: 12px;
      `;
      depsTitle.textContent = '📦 依赖';
      depsSection.appendChild(depsTitle);

      if (dependencies.external && dependencies.external.length > 0) {
        const extDeps = document.createElement('div');
        extDeps.style.cssText = `
          margin-bottom: 12px;
        `;
        extDeps.innerHTML = `
          <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-bottom: 6px;">外部库</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${dependencies.external.map((dep: string) => `
              <span style="font-size: 11px; padding: 4px 8px; background: rgba(100, 116, 139, 0.2); border-radius: 4px; color: #94a3b8; font-family: monospace;">${dep}</span>
            `).join('')}
          </div>
        `;
        depsSection.appendChild(extDeps);
      }

      if (dependencies.internal && dependencies.internal.length > 0) {
        const intDeps = document.createElement('div');
        intDeps.innerHTML = `
          <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-bottom: 6px;">内部组件</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${dependencies.internal.map((dep: string) => `
              <span style="font-size: 11px; padding: 4px 8px; background: rgba(16, 185, 129, 0.2); border-radius: 4px; color: #10b981; font-family: monospace;">${dep}</span>
            `).join('')}
          </div>
        `;
        depsSection.appendChild(intDeps);
      }

      container.appendChild(depsSection);
    }

    // 业务逻辑
    if (businessLogic && businessLogic.length > 0) {
      const logicSection = createSection('⚙️ 业务逻辑', businessLogic, (item: string) => `
        <div style="font-size: 13px; color: rgba(255, 255, 255, 0.8); line-height: 1.6;">• ${item}</div>
      `);
      container.appendChild(logicSection);
    }

    // 使用场景
    if (usage) {
      const usageSection = document.createElement('div');
      usageSection.style.cssText = `
        margin-bottom: 20px;
        padding: 16px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 8px;
      `;

      const usageTitle = document.createElement('div');
      usageTitle.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
      usageTitle.textContent = '💡 使用场景';
      usageSection.appendChild(usageTitle);

      const usageText = document.createElement('div');
      usageText.style.cssText = `
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.6;
      `;
      usageText.textContent = usage;
      usageSection.appendChild(usageText);

      container.appendChild(usageSection);
    }

    // 潜在问题 - 向后兼容旧格式
    if (concerns && concerns.length > 0) {
      const concernsSection = createSection('⚠️ 潜在问题', concerns, (item: string) => `
        <div style="font-size: 13px; color: rgba(251, 146, 60, 0.9); line-height: 1.6;">• ${item}</div>
      `, 'rgba(251, 146, 60, 0.1)', 'rgba(251, 146, 60, 0.3)');
      container.appendChild(concernsSection);
    }

    // 改进建议 - 向后兼容旧格式
    if (suggestions && suggestions.length > 0) {
      const suggestionsSection = createSection('✨ 改进建议', suggestions, (item: string) => `
        <div style="font-size: 13px; color: rgba(255, 255, 255, 0.8); line-height: 1.6;">• ${item}</div>
      `, 'rgba(139, 92, 246, 0.1)', 'rgba(139, 92, 246, 0.3)');
      container.appendChild(suggestionsSection);
    }

    // 新格式：结构化问题分析
    if (issues) {
      // 严重缺陷 🔴
      if (issues.critical && issues.critical.length > 0) {
        const criticalSection = document.createElement('div');
        criticalSection.style.cssText = `
          margin-bottom: 20px;
          padding: 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
        `;

        const criticalTitle = document.createElement('div');
        criticalTitle.style.cssText = `
          font-size: 14px;
          font-weight: 600;
          color: #f87171;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        criticalTitle.innerHTML = `<span>🔴</span><span>严重缺陷 (${issues.critical.length})</span>`;
        criticalSection.appendChild(criticalTitle);

        issues.critical.forEach((issue: any, index: number) => {
          const issueCard = createIssueCard(issue, index, 'critical');
          criticalSection.appendChild(issueCard);
        });

        container.appendChild(criticalSection);
      }

      // 潜在问题 ⚠️
      if (issues.potential && issues.potential.length > 0) {
        const potentialSection = document.createElement('div');
        potentialSection.style.cssText = `
          margin-bottom: 20px;
          padding: 16px;
          background: rgba(251, 146, 60, 0.1);
          border: 1px solid rgba(251, 146, 60, 0.3);
          border-radius: 8px;
        `;

        const potentialTitle = document.createElement('div');
        potentialTitle.style.cssText = `
          font-size: 14px;
          font-weight: 600;
          color: #fb923c;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        potentialTitle.innerHTML = `<span>⚠️</span><span>潜在问题 (${issues.potential.length})</span>`;
        potentialSection.appendChild(potentialTitle);

        issues.potential.forEach((issue: any, index: number) => {
          const issueCard = createIssueCard(issue, index, 'potential');
          potentialSection.appendChild(issueCard);
        });

        container.appendChild(potentialSection);
      }

      // 改进建议 ✨
      if (issues.improvements && issues.improvements.length > 0) {
        const improvementsSection = document.createElement('div');
        improvementsSection.style.cssText = `
          margin-bottom: 20px;
          padding: 16px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 8px;
        `;

        const improvementsTitle = document.createElement('div');
        improvementsTitle.style.cssText = `
          font-size: 14px;
          font-weight: 600;
          color: #a78bfa;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        improvementsTitle.innerHTML = `<span>✨</span><span>改进建议 (${issues.improvements.length})</span>`;
        improvementsSection.appendChild(improvementsTitle);

        issues.improvements.forEach((issue: any, index: number) => {
          const issueCard = createIssueCard(issue, index, 'improvements');
          improvementsSection.appendChild(issueCard);
        });

        container.appendChild(improvementsSection);
      }
    }

    // 检查是否渲染了任何内容
    const childCount = container.children.length;
    console.log('[react-component-jumper] ✅ 渲染完成，容器子元素数量:', childCount);

    if (childCount === 0) {
      console.warn('[react-component-jumper] ⚠️ 警告：没有渲染任何内容！所有字段都为空。');
      // 显示一个提示信息
      const emptyNotice = document.createElement('div');
      emptyNotice.style.cssText = `
        padding: 20px;
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 14px;
      `;
      emptyNotice.textContent = '⚠️ AI 分析结果为空，所有字段都是空值。这可能是因为：\n1. AI 返回的数据格式不正确\n2. 组件代码太少，无法分析\n3. AI 服务返回了空结果';
      container.appendChild(emptyNotice);
    }
  }

  // 创建通用 section
  function createSection(
    title: string,
    items: any[],
    renderItem: (item: any) => string,
    bgColor: string = 'rgba(255, 255, 255, 0.05)',
    borderColor: string = 'rgba(255, 255, 255, 0.1)'
  ): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 20px;
      padding: 16px;
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 8px;
    `;

    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: white;
      margin-bottom: 12px;
    `;
    sectionTitle.textContent = `${title} (${items.length})`;
    section.appendChild(sectionTitle);

    const itemsContainer = document.createElement('div');
    itemsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    itemsContainer.innerHTML = items.map(renderItem).join('');
    section.appendChild(itemsContainer);

    return section;
  }

  // 创建问题卡片（带复制 AI 提示功能）
  function createIssueCard(issue: any, index: number, type: string): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 6px;
      margin-bottom: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    `;

    // 头部：文件位置 + 复制按钮
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const location = document.createElement('div');
    location.style.cssText = `
      font-size: 11px;
      font-family: monospace;
      color: rgba(255, 255, 255, 0.6);
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // 相对路径（去掉项目根目录前缀）
    const relativePath = issue.file.replace(/^.*?\/src\//, 'src/').replace(/^.*?\/(src)/, '$1');
    location.innerHTML = `
      <span>📄 ${relativePath}</span>
      <span style="color: rgba(255, 255, 255, 0.4);">|</span>
      <span>第 ${issue.startLine} 行</span>
      <span style="color: rgba(255, 255, 255, 0.4);">|</span>
      <span>${issue.lineCount} 行</span>
    `;

    const copyBtn = document.createElement('button');
    copyBtn.className = `copy-ai-prompt-${type}-${index}`;
    copyBtn.innerHTML = '📋 复制 AI 提示';
    copyBtn.style.cssText = `
      padding: 4px 10px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #60a5fa;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    `;

    let originalText = '📋 复制 AI 提示';
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.background = 'rgba(59, 130, 246, 0.3)';
    });
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.background = 'rgba(59, 130, 246, 0.2)';
    });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(issue.aiPrompt);
        copyBtn.innerHTML = '✅ 已复制';
        copyBtn.style.background = 'rgba(34, 197, 94, 0.2)';
        copyBtn.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        copyBtn.style.color = '#22c55e';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.style.background = 'rgba(59, 130, 246, 0.2)';
          copyBtn.style.borderColor = 'rgba(59, 130, 246, 0.4)';
          copyBtn.style.color = '#60a5fa';
        }, 2000);
      } catch (err) {
        console.error('复制失败:', err);
        copyBtn.innerHTML = '❌ 复制失败';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 2000);
      }
    });

    header.appendChild(location);
    header.appendChild(copyBtn);
    card.appendChild(header);

    // 问题描述
    const description = document.createElement('div');
    description.style.cssText = `
      font-size: 13px;
      color: rgba(255, 255, 255, 0.85);
      line-height: 1.5;
      margin-bottom: 8px;
    `;
    description.textContent = issue.description;
    card.appendChild(description);

    // AI 提示预览（可折叠）
    const previewLabel = document.createElement('div');
    previewLabel.style.cssText = `
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 8px;
      cursor: pointer;
      user-select: none;
    `;
    previewLabel.textContent = '💬 查看 AI 提示';
    previewLabel.addEventListener('click', () => {
      const preview = card.querySelector('.ai-prompt-preview') as HTMLElement;
      if (preview) {
        const isHidden = preview.style.display === 'none';
        preview.style.display = isHidden ? 'block' : 'none';
        previewLabel.textContent = isHidden ? '🔽 收起 AI 提示' : '💬 查看 AI 提示';
      }
    });
    card.appendChild(previewLabel);

    const preview = document.createElement('div');
    preview.className = 'ai-prompt-preview';
    preview.style.cssText = `
      margin-top: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      font-family: monospace;
      white-space: pre-wrap;
      word-break: break-word;
      display: none;
      max-height: 150px;
      overflow-y: auto;
    `;
    preview.textContent = issue.aiPrompt;
    card.appendChild(preview);

    return card;
  }

  // 显示 AI 分析错误
  function showAIAnalysisError(container: HTMLElement, error: string) {
    container.innerHTML = `
      <div style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 60px 20px;">
        <div style="font-size: 40px; margin-bottom: 12px;">❌</div>
        <div style="font-size: 14px; margin-bottom: 16px;">AI 分析失败</div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.4); max-width: 400px; margin: 0 auto;">${error}</div>
        <button id="retry-ai-analysis" style="margin-top: 20px; padding: 8px 16px; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b; border-radius: 6px; cursor: pointer; font-size: 13px;">🔄 重试</button>
      </div>
    `;
    (container.querySelector('#retry-ai-analysis') as HTMLElement)?.addEventListener('click', () => {
      const component = data.current;
      if (component) {
        showAIAnalysisLoading(container);
        loadAIAnalysis(component, container, true); // 使用 force=true 强制重新分析
      }
    });
  }

  // 代码预览模态框
  function showCodePreviewModal(title: string, snippet: string, context: any, file: string, line: number) {
    const codeModal = document.createElement('div');
    codeModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease-out;
    `;

    const codeContent = document.createElement('div');
    codeContent.style.cssText = `
      background: #1e293b;
      border-radius: 12px;
      width: 90%;
      max-width: 900px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      animation: slideUp 0.3s ease-out;
    `;

    const codeHeader = document.createElement('div');
    codeHeader.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const codeTitle = document.createElement('div');
    codeTitle.innerHTML = `
      <div style="font-size: 16px; font-weight: 600; color: white;">📄 ${title}</div>
      <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); margin-top: 4px;">${file}:${line}</div>
    `;

    const closeCodeBtn = document.createElement('button');
    closeCodeBtn.innerHTML = '✕';
    closeCodeBtn.style.cssText = `
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
    closeCodeBtn.addEventListener('click', () => codeModal.remove());
    closeCodeBtn.addEventListener('mouseenter', () => {
      closeCodeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      closeCodeBtn.style.color = 'white';
    });

    codeHeader.appendChild(codeTitle);
    codeHeader.appendChild(closeCodeBtn);

    const codeBody = document.createElement('div');
    codeBody.style.cssText = `
      padding: 0;
      overflow: auto;
      flex: 1;
      background: #0f172a;
    `;

    const pre = document.createElement('pre');
    pre.style.cssText = `
      margin: 0;
      padding: 20px;
      font-size: 13px;
      line-height: 1.6;
      color: #e2e8f0;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    `;

    // 简单的语法高亮
    const highlightedCode = snippet
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/('.*?')/g, '<span style="color: #a5d6ff;">$1</span>')
      .replace(/(".*?")/g, '<span style="color: #a5d6ff;">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|default|from|async|await)\b/g, '<span style="color: #ff7b72;">$1</span>')
      .replace(/\b(true|false|null|undefined)\b/g, '<span style="color: #79c0ff;">$1</span>')
      .replace(/\/\/.*$/gm, '<span style="color: #8b949e;">$&</span>');

    pre.innerHTML = highlightedCode;
    codeBody.appendChild(pre);

    const codeFooter = document.createElement('div');
    codeFooter.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
    `;

    const copyAllBtn = document.createElement('button');
    copyAllBtn.innerHTML = '📋 复制全部代码';
    copyAllBtn.style.cssText = `
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #10b981;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    copyAllBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(snippet);
      copyAllBtn.innerHTML = '✅ 已复制';
      setTimeout(() => copyAllBtn.innerHTML = '📋 复制全部代码', 1500);
    });
    copyAllBtn.addEventListener('mouseenter', () => {
      copyAllBtn.style.background = 'rgba(16, 185, 129, 0.3)';
    });
    copyAllBtn.addEventListener('mouseleave', () => {
      copyAllBtn.style.background = 'rgba(16, 185, 129, 0.2)';
    });

    const jumpToFileBtn = document.createElement('button');
    jumpToFileBtn.innerHTML = '🎯 跳转到文件';
    jumpToFileBtn.style.cssText = `
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #60a5fa;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    jumpToFileBtn.addEventListener('click', () => {
      codeModal.remove();
      jumpToComponent(file, line);
    });
    jumpToFileBtn.addEventListener('mouseenter', () => {
      jumpToFileBtn.style.background = 'rgba(59, 130, 246, 0.3)';
    });
    jumpToFileBtn.addEventListener('mouseleave', () => {
      jumpToFileBtn.style.background = 'rgba(59, 130, 246, 0.2)';
    });

    codeFooter.appendChild(copyAllBtn);
    codeFooter.appendChild(jumpToFileBtn);

    codeContent.appendChild(codeHeader);
    codeContent.appendChild(codeBody);
    codeContent.appendChild(codeFooter);
    codeModal.appendChild(codeContent);

    codeModal.addEventListener('click', (e) => {
      if (e.target === codeModal) {
        codeModal.remove();
      }
    });

    document.body.appendChild(codeModal);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        codeModal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  body.appendChild(tabsHeader);
  body.appendChild(tabContents['tab-children']!);
  body.appendChild(tabContents['tab-siblings']!);
  body.appendChild(tabContents['tab-ai-analysis']!);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 12px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  `;
  footer.innerHTML = `
    <div>按 ESC 或点击背景关闭</div>
    <div>目录: ${data.directory}</div>
  `;

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  modal.appendChild(content);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      removeSiblingComponentsModal();
    }
  });

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeSiblingComponentsModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // 锁定 body 滚动
  document.body.style.overflow = 'hidden';
  document.body.appendChild(modal);
  (state as any).siblingComponentsModal = modal;
}

/**
 * 移除兄弟组件模态框
 */
function removeSiblingComponentsModal() {
  const modal = (state as any).siblingComponentsModal;
  if (modal) {
    modal.remove();
    (state as any).siblingComponentsModal = null;
    // 恢复 body 滚动
    document.body.style.overflow = '';
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
