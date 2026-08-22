# Cangjie VSCode 插件编译与打包指导

本文介绍如何从源码编译 Cangjie VSCode 插件并生成 VSIX 安装包。

## 1. 环境准备

请先安装以下工具：

- Node.js
- npm 7.0.0 或更高版本，`debug-ui` 使用了 npm workspaces
- Visual Studio Code 1.65.0 或更高版本，用于安装和验证插件

在插件仓库根目录检查环境：

```powershell
node --version
npm --version
```

安装插件工程依赖：

```powershell
npm install
```

## 2. 编译调试时间线 UI

调试时间线位于 `debug-ui/ui-timeline`。在插件仓库根目录执行：

```powershell
Push-Location .\debug-ui
npm install
npm run build --workspaces
Pop-Location
```

构建完成后，时间线产物位于：

```text
debug-ui/ui-timeline/build/
```

> 请使用 `--workspaces`，不要使用 `-ws`。后者会产生 npm 弃用警告。

## 3. 准备打包目录

`bin` 和 `webview` 是本地打包目录，默认不会存在，而且已被 `.gitignore` 忽略。首次打包前需要在插件仓库根目录创建：

```powershell
New-Item -ItemType Directory -Force -Path ".\bin", ".\webview\timeline" | Out-Null
```

完整插件的目录结构如下：

```text
vscode_cangjie/
├─ bin/
│  ├─ dap_server.exe
│  ├─ dap_server-linux_x64
│  ├─ dap_server-linux_aarch64
│  ├─ dap_server-macos_x64
│  ├─ dap_server-macos_aarch64
│  └─ dap_server-linux_x64-cjvm        # 可选，Linux x86_64 CJVM 调试服务端
└─ webview/
   └─ timeline/
      ├─ asset-manifest.json
      ├─ index.html
      ├─ robots.txt
      └─ static/
```

## 4. 放置调试服务端

调试服务端源码仓库：

<https://gitcode.com/Cangjie/cangjie_debug_adapter>

请按照调试服务端仓库中的编译指导准备各平台产物。本文不介绍调试服务端本身的编译过程。

将产物复制到插件仓库根目录的 `bin` 目录，并确保最终文件名与下表完全一致：

| 运行平台 | Node.js 平台/架构 | `bin` 目录中的文件名 |
| --- | --- | --- |
| Windows | `win32` | `dap_server.exe` |
| Linux x86_64 | `linux` / `x64` | `dap_server-linux_x64` |
| Linux ARM64 | `linux` / `arm64` | `dap_server-linux_aarch64` |
| macOS x86_64 | `darwin` / `x64` | `dap_server-macos_x64` |
| macOS ARM64 | `darwin` / `arm64` | `dap_server-macos_aarch64` |
| Linux x86_64 CJVM，可选 | `linux` / `x64` | `dap_server-linux_x64-cjvm` |

插件运行时会根据当前系统和 CPU 架构自动选择对应文件，不能随意修改上述文件名。

如果构建的插件不需要调试功能，可以省略 `bin` 目录中的调试服务端产物。此时语言服务、工程管理等非调试功能仍可使用，但启动调试时会因找不到调试服务端而失败。

## 5. 放置时间线 Webview 产物

需要将 `debug-ui/ui-timeline/build` 目录中的所有内容复制到 `webview/timeline`，而不是把 `build` 目录本身复制进去。

为避免旧版本带哈希的 JS、CSS 文件残留，建议先清理目标目录：

```powershell
if (Test-Path -LiteralPath ".\webview\timeline") {
    Remove-Item -LiteralPath ".\webview\timeline" -Recurse -Force
}
New-Item -ItemType Directory -Force -Path ".\webview\timeline" | Out-Null
Copy-Item -Path ".\debug-ui\ui-timeline\build\*" -Destination ".\webview\timeline" -Recurse -Force
```

复制后应直接存在以下文件：

```text
webview/timeline/index.html
webview/timeline/static/js/...
webview/timeline/static/css/...
```

如果出现 `webview/timeline/build/index.html`，说明多复制了一层目录，需要调整为上述结构。

Linux 或 macOS 可使用：

```bash
rm -rf webview/timeline
mkdir -p bin webview/timeline
cp -R debug-ui/ui-timeline/build/. webview/timeline/
```

## 6. 编译插件

在插件仓库根目录执行：

```powershell
npm run webpack
```

主要输出包括：

```text
out/extension.js
out/worker.js
media/configSetByUI.js
media/requireTreeByUI.js
```

可以执行以下检查：

```powershell
npm run lint
npx tsc -p . --noEmit --skipLibCheck
```

## 7. 生成 VSIX 安装包

确认 `bin` 和 `webview/timeline` 已准备好后，在插件仓库根目录执行：

```powershell
npx vsce package
```

`vsce package` 会自动执行 `package.json` 中的 `vscode:prepublish` 脚本，因此会再次运行 webpack。若只需要生成 VSIX，可以省略上一节单独执行的 `npm run webpack`。

默认生成的安装包名称格式为：

```text
cangjie-<package.json中的version>.vsix
```

例如当前版本为 `0.36.5` 时，输出为：

```text
cangjie-0.36.5.vsix
```

## 8. 检查安装包内容

打包前可以执行：

```powershell
npx vsce ls
```

完整调试版本应至少包含：

```text
bin/dap_server.exe
bin/dap_server-linux_x64
bin/dap_server-linux_aarch64
bin/dap_server-macos_x64
bin/dap_server-macos_aarch64
webview/timeline/index.html
webview/timeline/static/...
out/extension.js
out/worker.js
```

如果 `npx vsce ls` 中没有 `bin` 或 `webview/timeline`，请不要继续发布 VSIX，应先检查目录位置和文件名。

同时检查清单中是否包含本地临时文件、测试产物或其他不应发布的文件。`.gitignore` 中的规则不等同于 VSIX 打包规则；需要排除的内容应配置到 `.vscodeignore`，或在打包前清理。不要把密钥、日志、临时补丁和本地测试程序打入安装包。

## 9. 安装验证

在 VSCode 中打开扩展视图，选择 **Install from VSIX...**，安装生成的 VSIX。建议至少验证：

1. 插件可以正常激活。
2. 仓颉语言服务可以启动。
3. 工程创建和编译命令可以使用。
4. 各目标平台上的调试服务端可以启动。
5. 调试时间线 Webview 可以正常显示。

## 一次性打包流程

已准备好调试服务端产物时，Windows PowerShell 下的完整流程如下：

```powershell
# 插件依赖
npm install

# 时间线 UI
Push-Location .\debug-ui
npm install
npm run build --workspaces
Pop-Location

# 本地打包目录
New-Item -ItemType Directory -Force -Path ".\bin" | Out-Null
if (Test-Path -LiteralPath ".\webview\timeline") {
    Remove-Item -LiteralPath ".\webview\timeline" -Recurse -Force
}
New-Item -ItemType Directory -Force -Path ".\webview\timeline" | Out-Null
Copy-Item -Path ".\debug-ui\ui-timeline\build\*" -Destination ".\webview\timeline" -Recurse -Force

# 按第 4 节的文件名要求，将各平台调试服务端放入 .\bin

# 编译并打包
npx vsce package
```
