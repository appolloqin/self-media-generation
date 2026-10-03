# 智媒工坊 — 桌面端（本地一体化 + 远程双模式）

把本项目编译后的产物打包成一个可直接安装运行的桌面应用：本地模式下内嵌 Node.js 运行时，
启动打包后的 Express 服务并由其托管前端，数据落在用户目录；也可切换为连接远程控制台。

## 两种模式

| 模式 | 说明 |
|------|------|
| **本地（默认）** | 启动内嵌 Node，运行打包后的服务（`runtime/server/dist/index.js`），SQLite 数据存于用户目录，前端由同一服务托管。开箱即用。 |
| **远程** | 仅作为壳，加载远程控制台 URL（菜单「模式 → 设置远程控制台地址…」）。 |

桌面端固定使用 **SQLite**，数据库文件（`data/smg.db`）在首次启动时**自动创建**，
目录不存在会递归创建，表结构与种子数据自动完成，无需任何手工初始化。

数据目录（菜单「帮助 → 打开数据目录」）：

- Windows: `%APPDATA%/SMGWorkshop/data`
- macOS: `~/Library/Application Support/SMGWorkshop/data`
- Linux: `~/.config/SMGWorkshop/data`

## 开发运行

```bash
# 1) 安装桌面端依赖
npm run desktop:install

# 2) 生成运行时（构建 server/web 并暂存到 desktop/runtime）
#    首次会编译原生模块（需 VS 2022 C++ 工具 + Python 3），耗时较长
npm run desktop:prepare

# 3) 启动桌面端
npm run desktop:dev
```

## 打包安装包

```bash
# 生成当前平台安装包（Windows NSIS / macOS dmg / Linux AppImage+deb）
npm run desktop:dist

# 或指定平台
npm run desktop:dist:win
npm run desktop:dist:mac
npm run desktop:dist:linux
```

> 以上命令均在**仓库根目录**执行。`desktop/` 不在根 `workspaces` 中（那里只有
> shared / server / web），是独立 npm 项目，所以脚本内部用 `cd desktop && npm run …`
> 进入它——`electron-builder` 的 `runtime/`、`release/` 等相对路径依赖 cwd 在 `desktop/` 下。
> 也可以手动进入：`cd desktop && npm run dist:win`。

产物输出到 `desktop/release/`。

## 已知问题：rcedit 与新版 Electron 不兼容

配置里 `win.signAndEditExecutable: false` 是**必需的**，不是偷懒。原因：

`electron-builder` 打包时会调用 `winCodeSign` 里的 `rcedit` 写入 exe 版本信息
（ProductName / FileDescription 等）。而 `rcedit` 会把整个 exe 映射进内存，
electron 35 的 `electron.exe` 已达 **191MB**，超出其可处理范围，提交时必然失败：

```
Fatal error: Unable to commit changes
  command='...\rcedit-x64.exe' '...\SMGWorkshop.exe' --set-version-string ...
```

这不是配置错误——实测 rcedit 对 notepad / calc 正常，对未加工的 `electron.exe`
（即使用纯 ASCII 描述、去掉空值参数）同样失败。参考项目用的是 electron 19，
体积未到该阈值，所以没暴露这个问题。

关闭后 exe 的版本信息会保持 Electron 默认值（`ProductName: Electron`）。
图标不受影响，由 `win.icon` 单独处理。若后续需要恢复版本信息，可选：

- 降级到 electron 19 之类的旧版本（不推荐，会丢新特性与安全修复）
- 升级到已修复此问题的 `winCodeSign` / electron-builder 版本
- 打包后用 PowerShell 脚本或 `rcedit` 的替代工具单独写入

## 运行时结构

```
desktop/runtime/
  server/          服务端构建产物（dist/index.js）+ 生产依赖
  web/dist/        前端构建产物（由 server 托管，含 SPA 回退）
  manifest.json    构建元信息
```

本项目的服务端由 esbuild 打包为单文件 ESM（`@smg/shared` 已内联），仅
`better-sqlite3` / `sharp` 等原生模块保留外部引用，因此运行时只需携带 `dist` 与生产依赖。

## 关于 Node 运行时（不额外下载 Node）

**运行时直接复用 Electron 内置的 Node**，不再单独内嵌一份 Node 发行包：

- `electron.exe` 在 `ELECTRON_RUN_AS_NODE=1` 下即为标准 node，可直接执行 `dist/index.js`
- 省掉约 30MB 的 Node 下载，同时避免 Node 与 Electron 两份运行时版本漂移

代价是原生模块必须按 **Electron 的 ABI** 编译（Electron 35 内置 Node 22.15.1，ABI 133，
而普通 Node 22.12 是 ABI 127）。因此 `prepare` 阶段会：

1. 用 Electron 的 node 驱动 `npm-cli.js`（npm 本身是纯 JS）执行安装
2. 传入 `--build-from-source` 与 `npm_config_runtime=electron`，让 node-gyp 走
   Electron headers 编译，产出 ABI 匹配的二进制

> 首次安装需要本机具备 C++ 编译环境（Windows 需 Visual Studio 2022 C++ 工具 + Python 3），
> 之后依赖不变时会跳过安装。

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `SMG_DESKTOP_PORT_START` | 本地模式端口搜索起始值 | `5210` |
| `SMG_DESKTOP_CONSOLE_URL` | 远程模式默认控制台地址 | `http://localhost:5178` |

## 说明

- 前端静态资源由后端挂载（含 SPA 回退），因此本地模式只需一个端口。
- 桌面端默认端口从 `5210` 起自动寻找空闲端口，避免与开发态（5178）冲突。
- 桌面端通过 `SMG_DATA_DIR` 把数据重定向到用户目录，源码目录下的 `data/` 不受影响。
- WebSocket 走同源 `/ws`，鉴权 token 随握手 query 传递，与浏览器端行为一致。
