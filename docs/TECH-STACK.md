# 技术选型说明

## 最终选型：Electron + 原生 HTML/CSS/JS + better-sqlite3

## 对比分析

| 对比维度 | Electron（✅选择） | Tauri | Python+PyQt |
|----------|-------------------|-------|-------------|
| 剪贴板监听 | `node-clipboard-event` 提供原生 Windows hook | `tauri-plugin-clipboard-manager` 插件生态不成熟 | `QClipboard.dataChanged()` 成熟 |
| 系统托盘 | 内置 `Tray` API，一行代码 | 内置但资料少 | `QSystemTrayIcon` 样式难调 |
| 全局快捷键 | 内置 `globalShortcut` API | 需 `tauri-plugin-global-shortcut` | 需第三方库 |
| 开机自启 | 内置 `app.setLoginItemSettings()` | 需 `tauri-plugin-autostart` | 需手动改注册表 |
| 内存（空闲） | 90-120MB | 40-155MB（不稳定） | 30-60MB |
| 安装包大小 | 120-180MB | 3-7MB | 40-200MB |
| UI 灵活性 | ⭐⭐⭐⭐⭐ HTML/CSS/JS | ⭐⭐⭐⭐⭐ 同样用 Web 技术 | ⭐⭐⭐ QSS 限制多 |
| 打包难度 | ⭐⭐⭐⭐⭐ 一条命令 | ⭐⭐⭐ WebView2 依赖问题 | ⭐⭐ PyInstaller 易出错 |
| 生态系统 | 成熟，资源丰富 | 成长中 | Qt 成熟但 PyQt 小众 |

## 选择 Electron 的理由

1. **系统集成 API 成熟**：托盘、热键、自启都是 Electron 内置模块，一行代码搞定
2. **剪贴板监听可靠**：`node-clipboard-event` 使用 Windows 原生 `AddClipboardFormatListener`，不轮询、不耗 CPU
3. **UI 灵活**：HTML/CSS 可以完美还原 Windows 11 Fluent Design 风格
4. **打包简单**：`electron-builder` 一条命令生成 NSIS 安装程序
5. **学习成本低**：JavaScript + HTML + CSS 是最广泛使用的技术栈
6. **自包含**：Electron 自带 Chromium，不依赖系统 WebView2，行为一致

## 依赖包清单

### 生产依赖
| 包名 | 版本 | 用途 |
|------|------|------|
| `electron` | ^33.0.0 | 应用框架 |
| `node-clipboard-event` | ^1.2.0 | Windows 原生剪贴板监听 |
| `better-sqlite3` | ~~^11.0.0~~ | ❌ 需要原生编译，系统 Python 不可用 |
| `sql.js` | ^1.12.0 | ✅ 纯 WASM SQLite，无需编译，LIKE 搜索 |

### 开发依赖
| 包名 | 版本 | 用途 |
|------|------|------|
| `electron-builder` | ^25.0.0 | 打包为 Windows 安装程序 |
| `electron-rebuild` | ^3.0.0 | 重编译原生模块适配 Electron ABI |

**依赖数量**：仅 5 个包，有意保持最小化——更少依赖意味着更少的兼容性问题和更小的攻击面。

## 环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 11（开发 + 运行） |
| Node.js | v20 LTS 或更高 |
| npm | v10 或更高 |
| 磁盘空间 | 约 500MB（含 node_modules 和 Electron 二进制文件） |

## 不使用框架的原因

渲染进程选择**原生 JavaScript**而非 React/Vue/Svelte：
- UI 是单页面，无路由、无复杂状态管理
- 减少构建步骤（不需要 webpack/vite），编辑即刷新
- 减少依赖数量（框架本身 + 构建工具链 = 数十个包）
- 应用体积更小，加载更快
