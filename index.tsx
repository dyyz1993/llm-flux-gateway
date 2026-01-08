import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@client/App';

// 开发模式：初始化样式跳转功能
if (import.meta.env.DEV) {
  import('./plugins/style-jump/runtime').then(({ setupStyleJumper }) => {
    setupStyleJumper().catch((err) => {
      console.warn('[style-jumper] 初始化失败:', err);
    });
  });

  // 开发模式：初始化 React 组件跳转功能
  import('./plugins/react-component-jump/runtime').then(({ setupReactComponentJumper }) => {
    setupReactComponentJumper().catch((err) => {
      console.warn('[react-component-jumper] 初始化失败:', err);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);