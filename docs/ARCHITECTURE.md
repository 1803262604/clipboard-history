# 系统架构设计

## 进程模型

Electron 应用由两个主要进程组成：

```
┌─────────────────────────────────────────────────────────┐
│                      Main Process                        │
│  (Node.js 环境，可访问系统 API)                           │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ clipboard-   │  │  database.js │  │  image-store  │  │
│  │ monitor.js   │  │  (SQLite)    │  │  (文件系统)    │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │         │
│  ┌──────┴─────────────────┴───────────────────┴───────┐  │
│  │                  ipc-handlers.js                    │  │
│  │          (ipcMain.handle 注册所有 API)              │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌──────────┐  ┌──────────┴────┐  ┌─────────────────┐  │
│  │ tray.js  │  │  hotkey.js    │  │ auto-start.js   │  │
│  └──────────┘  └───────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────┴──────────────────────────────┐
│                    Renderer Process                       │
│  (Chromium 沙箱环境，只能通过 preload API 访问主进程)      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ app.js   │  │ search.js│  │ components.js         │  │
│  │ (控制器)  │  │ (搜索)    │  │ (UI 组件构建函数)     │  │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────┘  │
│       └──────────────┴───────────────────┘              │
│                         │                                │
│                    index.html                             │
│                    styles.css                             │
└─────────────────────────────────────────────────────────┘
```

## 主进程模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| `main.js` | 应用入口：创建窗口、初始化各模块、注册 IPC | 所有主进程模块 |
| `clipboard-monitor.js` | 监听剪贴板变化、读取内容、去重、触发存储 | database.js, image-store.js |
| `database.js` | SQLite 初始化、所有 CRUD 操作、FTS 搜索、过期清理 | better-sqlite3 |
| `image-store.js` | 图片文件存取删、目录管理 | fs, path, crypto |
| `tray.js` | 系统托盘图标、右键菜单、点击事件 | Electron.Tray |
| `hotkey.js` | 全局快捷键注册/注销 | Electron.globalShortcut |
| `auto-start.js` | 开机自启开关 | Electron.app |
| `ipc-handlers.js` | 注册所有 ipcMain.handle 处理函数 | database.js, image-store.js |
| `preload.js` | contextBridge 暴露安全 API 给渲染进程 | Electron.contextBridge |

## IPC 通道表

| 通道名称 | 方向 | 用途 |
|----------|------|------|
| `clipboard:getItems` | Renderer → Main | 分页获取历史记录 |
| `clipboard:search` | Renderer → Main | 全文搜索 |
| `clipboard:pin` | Renderer → Main | 切换置顶状态 |
| `clipboard:delete` | Renderer → Main | 删除条目 |
| `clipboard:copy` | Renderer → Main | 将条目录入系统剪贴板 |
| `clipboard:getImage` | Renderer → Main | 获取图片 Base64 数据 |
| `settings:get` | Renderer → Main | 读取单个设置 |
| `settings:set` | Renderer → Main | 写入单个设置 |
| `settings:getAll` | Renderer → Main | 读取全部设置 |
| `window:hide` | Renderer → Main | 隐藏窗口到托盘 |

| 事件名称 | 方向 | 用途 |
|----------|------|------|
| `clipboard:newItem` | Main → Renderer | 新条目通知（实时推送） |
| `clipboard:itemUpdated` | Main → Renderer | 条目更新通知 |
| `clipboard:itemDeleted` | Main → Renderer | 条目删除通知 |

## 数据流

### 剪贴板捕获流程
```
用户 Ctrl+C / 截图
       │
       ▼
Windows 剪贴板 API
       │
       ▼
node-clipboard-event 'change' 事件
       │
       ▼
clipboard-monitor.js ──防抖 200ms──► 读取内容类型
       │                                    │
       │                    ┌───────────────┴──────────────┐
       │                    ▼                             ▼
       │              文字内容                         图片内容
       │              clipboard.readText()          clipboard.readImage()
       │                    │                             │
       │                    ▼                             ▼
       │              SHA-256 哈希                  SHA-256 哈希
       │                    │                        nativeImage.toPNG()
       │                    ▼                             │
       │          database.findDuplicate()                ▼
       │                    │                  image-store.saveImage()
       │         ┌──────────┴──────────┐                │
       │         ▼                     ▼                ▼
       │    重复：更新         新内容：INSERT    database.addImageItem()
       │    last_copied_at      database.addTextItem()
       │         │                     │
       └─────────┴─────────────────────┘
                                 │
                                 ▼
                   mainWindow.webContents.send
                   ('clipboard:newItem', item)
                                 │
                                 ▼
                        Renderer 实时更新列表
```

### 用户操作流程
```
用户操作（点击/搜索/设置）
       │
       ▼
Renderer 调用 window.clipboardAPI.xxx()
       │
       ▼
preload.js (ipcRenderer.invoke)
       │
       ▼
Main Process ipcMain.handle
       │
       ▼
database.js / image-store.js
       │
       ▼
返回结果 → Renderer 更新 UI
```

## 安全模型

- `contextIsolation: true` — 渲染进程无法直接访问 Node.js API
- `sandbox: true` — 渲染进程在 Chromium 沙箱中运行
- `nodeIntegration: false` — 渲染进程不加载 Node.js 模块
- `preload.js` 通过 `contextBridge` 暴露白名单 API
- 主进程 IPC handler 验证所有输入参数
