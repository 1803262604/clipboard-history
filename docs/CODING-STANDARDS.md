# 代码规范

## 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| JavaScript 文件 | 小写连字符（kebab-case） | `clipboard-monitor.js` |
| HTML 文件 | 小写 | `index.html` |
| CSS 文件 | 小写 | `styles.css` |
| Markdown 文件 | 大写蛇形（SCREAMING_SNAKE_CASE） | `UI-DESIGN.md` |
| 图片文件 | 小写连字符 | `tray-icon.png` |

## 变量命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量/函数 | 小驼峰（camelCase） | `getItems`, `charCount` |
| 常量 | 大蛇形（UPPER_SNAKE_CASE） | `MAX_TEXT_LENGTH`, `DEBOUNCE_MS` |
| 类/构造函数 | 大驼峰（PascalCase） | `ClipboardMonitor` |
| 数据库表/列 | 小蛇形（snake_case） | `clipboard_items`, `char_count` |
| CSS 类名 | 小写连字符（kebab-case） | `.item-card`, `.search-bar` |
| DOM ID | 小写连字符 | `#search-input`, `#pinned-section` |

## 注释规范

```javascript
/**
 * 函数的简要说明。
 * 详细说明（如有必要）。
 * @param {string} paramName - 参数说明
 * @returns {Object} 返回值说明
 */
function doSomething(paramName) {
    // 单行注释：解释"为什么"而非"是什么"
}
```

- 每个模块文件顶部添加文件用途说明（1-2行注释）
- 公共函数必须有 JSDoc 注释
- 复杂逻辑必须注释"为什么这样做"
- 不注释显而易见的事情（如 `// 计数器加1` 对 `i++`）

## 错误处理

```javascript
// 主进程 IPC handler
ipcMain.handle('channel:name', async (event, ...args) => {
    try {
        // 参数验证
        if (!args[0] || typeof args[0] !== 'number') {
            throw new Error('Invalid argument: expected number');
        }
        // 业务逻辑
        return await someOperation(...args);
    } catch (error) {
        console.error('[channel:name] Error:', error.message);
        throw error; // Electron 会将错误传回渲染进程
    }
});

// 渲染进程调用
try {
    const result = await window.clipboardAPI.someMethod(arg);
} catch (error) {
    showErrorBanner(error.message);
}
```

- 所有 IPC handler 必须 try/catch
- 所有数据库操作必须 try/catch
- 错误信息要描述清楚：发生了什么、为什么、怎么解决
- 使用 `console.error` 记录错误到主进程日志

## 模块组织

每个模块遵循以下结构：
```javascript
// 1. 导入依赖
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 2. 常量定义
const DEBOUNCE_MS = 200;

// 3. 模块状态
let isMonitoring = false;

// 4. 私有函数
function internalHelper() { ... }

// 5. 公共函数
function startMonitoring() { ... }

// 6. 导出
module.exports = { startMonitoring };
```

## 代码风格

- 缩进：2 空格（不用 Tab）
- 字符串：优先使用单引号 `'string'`
- 分号：必须写分号
- 花括号：左括号不换行
- 空行：逻辑块之间用空行分隔
- 尾逗号：多行对象/数组最后一项加逗号
- 比较：使用 `===` 而非 `==`
- 箭头函数：简单回调使用箭头函数，复杂函数使用 function 声明

## Git 提交信息

```
<type>: <简短描述>

<详细说明（可选）>

类型：
  feat      - 新功能
  fix       - Bug 修复
  docs      - 文档
  style     - 代码格式（不影响功能）
  refactor  - 重构
  perf      - 性能优化
  test      - 测试
  chore     - 构建/工具

示例：
  feat: 添加剪贴板图片捕获功能
  fix: 修复搜索中文时无结果的问题
```

## 禁止事项

- ❌ 在渲染进程直接使用 `require()`
- ❌ 使用 `var` 声明变量
- ❌ 使用 `eval()`
- ❌ 同步阻塞主进程超过 100ms
- ❌ 在 IPC handler 中抛出未捕获的异常
- ❌ 硬编码路径（使用 `app.getPath()` 或 `path.join()`）
- ❌ 使用 `console.log` 在生产代码中（用 `console.error` 记录错误）
