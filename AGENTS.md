# AGENTS.md - 剪贴板历史管理工具

> 此文件仅包含本项目的专属指引。通用规范见 `~/.Codex/AGENTS.md`。

## 项目定位

Windows 11 剪贴板历史管理工具。基于 Electron 构建，后台静默运行，自动记录用户复制的内容（文字、图片、截图），支持搜索、置顶、删除和可配置的存储期限。

## 项目关键文件

### 规范文档（开发前必读）
| 文件 | 用途 |
|------|------|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 需求规格说明书——做什么、不做什么 |
| [docs/TECH-STACK.md](docs/TECH-STACK.md) | 技术选型说明——用什么、为什么 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构——模块职责、IPC通道、数据流 |
| [docs/DATABASE-SCHEMA.md](docs/DATABASE-SCHEMA.md) | 数据库表结构——建表SQL、字段说明 |
| [docs/UI-DESIGN.md](docs/UI-DESIGN.md) | UI设计规范——配色、字体、间距、组件、状态 |
| [docs/CODING-STANDARDS.md](docs/CODING-STANDARDS.md) | 代码规范——命名、注释、错误处理 |
| [docs/IMPLEMENTATION-STEPS.md](docs/IMPLEMENTATION-STEPS.md) | 分步执行计划——当前进度、下一步 |

### 开发日志
| 目录 | 用途 |
|------|------|
| [devlog/](devlog/) | 每日开发日志——读取最新日志了解上下文 |

### 源代码
| 目录 | 用途 |
|------|------|
| `src/main/` | 主进程（Node.js，系统API） |
| `src/preload/` | 安全桥梁（contextBridge） |
| `src/renderer/` | 渲染进程（UI，沙箱环境） |
| `assets/` | 图标资源 |

---

## 项目专属工作规范

### 每次开发前
1. 📖 读取 [docs/IMPLEMENTATION-STEPS.md](docs/IMPLEMENTATION-STEPS.md) 确认当前 Phase 和进度
2. 📝 读取 `devlog/` 中最新的日志文件，了解昨天做了什么、有什么待办
3. 🎯 明确本次会话的目标（完成哪个 Phase 的哪几步）

### 开发中
1. 📐 遵循 [docs/CODING-STANDARDS.md](docs/CODING-STANDARDS.md) 的代码规范
2. 🎨 UI 相关修改必须对照 [docs/UI-DESIGN.md](docs/UI-DESIGN.md)
3. 🗄️ 数据库相关修改必须对照 [docs/DATABASE-SCHEMA.md](docs/DATABASE-SCHEMA.md)
4. 🏗️ 涉及架构调整必须对照 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### 每次开发后
1. 📝 更新 `devlog/` 日志：完成事项 + 待办事项 + 遇到的问题
2. ✅ 如果完成了一个 Phase：更新 [docs/IMPLEMENTATION-STEPS.md](docs/IMPLEMENTATION-STEPS.md) 勾选对应步骤
3. 🧪 确保当前 Phase 的验证标准通过

---

## 项目命令

| 命令 | 用途 |
|------|------|
| `npm start` | 启动应用 |
| `npm run build` | 打包发布 |

---

## 当前状态

**Phase 0-6** — ✅ 已完成 (2026-05-30)
**Phase 7：收尾 + 打包** — 下一步（最后一阶段）

### 技术栈变更
- 数据库：`sql.js`（WASM SQLite）替代原计划的 `better-sqlite3`（后者需要原生编译但系统 Python 不可用）
- 搜索：SQL `LIKE` 替代原计划的 FTS5（几千条记录性能足够）
