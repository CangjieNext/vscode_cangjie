# Cangjie VSCode Plugin

## 概述

仓颉语言提供了 Visual Studio Code（简称 VSCode） 插件，通过在 VSCode 中安装仓颉插件和仓颉 SDK，为开发者提供语言服务、工程管理、编译构建、调试服务、格式化、静态检查和代码覆盖率统计的功能。

详情请参阅[用户手册](https://gitcode.com/Cangjie/vscode_cangjie/blob/main/docs/summary_cjnative.md)。

## 要求

- Visual Studio Code 1.65 或更高版本

> Windows 平台不支持源码文件名及路径包含中文字符的场景。
> 
> 源码文件名及路径建议遵循仓颉编程规范命名，不建议包含除 [0-9a-zA-Z_] 之外的字符，特殊字符会被替换成 `=`。

## 安装

下载并安装 [Cangjie SDK](https://cangjie-lang.cn/download)，建议 SDK 与插件使用相同版本号，以确保最佳兼容性。

当前插件适配仓颉 LTS 版本。 如您使用的是 STS 版本，请前往 STS 版本的下载页面，下载配套插件并手动安装。

### SDK路径配置

1. 单击左下角齿轮图标，选择设置选项。在搜索栏输入 `Cangjie` ，选择侧边栏的 `Cangjie Language Support` 选项。
2. 找到 `Cangjie Sdk: Option` 选项，选择后端类型为 `CJNative`（默认是此选项）。
3. 找到 `Cangjie Sdk Path: CJNative Backend` 选项，输入 CJNative 后端 SDK 文件夹所在绝对路径。
4. 重启 VSCode 生效。

如果当前后端的 SDK 路径配置为空，插件会使用环境变量 `CANGJIE_HOME` 作为 SDK 目录。显式配置的 SDK 路径优先于 `CANGJIE_HOME`。

## 使用

### 创建仓颉工程

在 VSCode 中使用快捷键 F1，或同时按下 Ctrl + Shift + P（macOS 系统为 Command + Shift + P）打开命令面板，输入 `Cangjie: Create Cangjie Project` 或 `Cangjie: Create Cangjie Project View` 命令创建仓颉工程。

仓颉工程目录结构如下所示。

```text
Project_name：开发者输入的名称

├── src：代码目录

│    └── main.cj：源码文件

└── cjpm.toml：默认的 cjpm.toml 配置文件
```

### 语言服务

语言服务工具为开发者提供如下功能：

- **语法高亮** - 支持对代码运算符、类、注释、函数、关键字、数字、包名、字符串、变量等进行高亮显示
- **自动补全** - 输入关键字、变量或 . 符号，在光标右侧提示候选内容。可以用上下方向键快速选择想要的内容（需要切换为系统默认输入法），使用 `Enter` 键或 `Tab` 键补全
- **定义跳转** - 鼠标悬停在目标上方，按下 Ctrl 键并单击鼠标左键触发定义跳转；或使用鼠标右键单击目标符号，选择 `Go to Definition` 执行定义跳转；或按下快捷键 `F12` 执行定义跳转
- **查找引用** - 使用鼠标右键单击目标符号，选择 `Find All References` 执行符号引用预览，单击预览条目，可以跳转到对应引用处
- **诊断报错** - 当源码文件出现不符合仓颉语法或语义规则的代码时，会在相关代码段出现红色波浪下划线，当鼠标悬停在上面，可以提示相应的报错信息。修改正确后，诊断报错自行消失
- **选中高亮** - 光标定位在一个变量或函数名处，当前文件中该变量的声明处以及其使用处都会高亮显示
- **悬浮提示** - 光标悬浮在变量处，可以提示类型信息
- **定义搜索** - 同时按下 `Ctrl` 键和 `T` 键，弹出搜索框，输入想要搜索的符号定义名，会显示出符合条件的搜索结果。单击搜索结果条目，可以跳转到对应的定义位置处
- **重命名** - 光标定位在想要修改的自定义名称上，右键选择 `Rename Symbol` 或按下快捷键 `F2` 打开重命名编辑框
- **大纲视图显示** - 在左侧 OUTLINE 视图中显示当前文件的大纲。目前支持两层结构的显示，第一层主要为 toplevel 中定义的声明，第二层主要为构造器及成员
- **面包屑导航** - 光标定位在符号处，点击面包屑导航，显示符号当前所处的位置，以及该符号在整个工程中的位置路径
- **签名帮助** - 在函数调用处输入左括号和逗号时会触发签名帮助。触发后，只要还在函数参数范围内，提示框会一直随光标移动（可与补全共存）。开发者可以看到当前函数的参数信息，以及当前函数位置参数的高亮效果
- **显示类型层次结构** - 光标定位在想要查看的自定义名称上，右键选择 `Show Type Hierarchy`，在编辑器左侧就会显示该类型层次结构。Object 类型默认为所有类的父类，该功能下不会显示
- **调用类型层次结构** - 光标定位在函数名上，右键选择 `Show Call Hierarchy`，在编辑器左侧就会显示该函数的调用类型层次结构

### 编译构建

#### 编译构建方式

VSCode 中可视化方式提供的仓颉功能编译构建能力依赖 cjpm 工具，该工具要求打开的仓颉工程的模块内必须包含规范的 cjpm.toml 文件。若没有该文件，仍想执行工程的编译构建，可在终端使用 cjc 命令。

- 在 VSCode 命令面板，输入分类词 Cangjie 执行编译相关命令
- 在 VSCode 终端面板使用编译构建命令（cjpm）对仓颉工程进行编译构建
- 单击 .cj 文件编辑区的运行按钮来运行整个仓颉工程
- 单击 .cj 文件编辑区的锤子按钮来编译整个仓颉工程

#### 配置编译构建参数

- 直接修改 cjpm.toml 和 cjpm_build_args.json 文件
- 在 VSCode 命令面板执行 `Cangjie: Edit Configuration (UI)` 命令打开可视化编辑的 UI 界面
- 单击编辑页面右上角的画笔按钮，跳转到可视化编辑的 UI 界面

#### 三方库导入

- 直接修改 cjpm.toml 和 cjpm_build_args.json 文件 target 配置项导包相关属性
- 在资源管理器的视图栏中的 CANGJIE LIBRARY 栏，查看、导入或删除三方库

### 调试服务

仓颉编程语言提供了可视化调试服务，方便开发者调试仓颉程序。提供如下功能：

- Launch：启动调试进程
- Attach：附加到已启动的进程
- 源码断点、函数断点、数据断点、汇编断点
- 源码内单步调试、运行到光标处、步入、步出、继续、暂停、重启、停止调试
- 仓颉-C 互操作调试，仓颉代码 continue、步入到 C 代码
- 汇编内单步、步入、步出
- 表达式求值
- 变量查看和修改
- 在调试控制台中查看变量
- 查看被调试程序的输出信息
- 反向调试
- Unittest 的运行和调试

#### 启动调试

##### Launch

**仓颉工程调试**

- 未创建 `launch.json` 文件时，使用快捷键 F5 或者单击 Run and Debug > Cangjie(cjdb) Debug 启动调试
- 已创建 `launch.json` 文件时，在 `launch.json` 文件中单击 Add Configuration > Cangjie Debug (CJNative) : launch > Build And Debug Cangjie Project 添加调试配置，选择添加的配置启动调试

**单文件调试**

针对单文件调试，可以选中需要调试的仓颉源文件，右键选择 `Cangjie: Build and Debug File`，该操作会生成编译配置文件 `task.json` 和编译脚本，并且会根据 `task.json` 配置执行脚本，编译出可调试的二进制文件，然后启动调试。

##### Attach

1. 在 `launch.json` 文件中单击 Add Configuration > Cangjie Debug (CJNative) : attach 添加调试配置，选择添加的配置启动调试
2. 在弹出界面选择要调试的进程即可启动调试

#### unittest 运行和调试

单击 `@Test/@TestCase` 声明行上的 `run | debug` 按钮，运行或调试该单元测试类/单元测试 case。

### 命令行工具集成

#### 格式化

- 针对仓颉文件，在 VSCode 的代码编辑区右键选择 `[Cangjie] Format` 或用快捷键 `Ctrl + Alt + F` 执行格式化命令，可以对当前仓颉文件进行格式化
- 针对仓颉项目，在 VSCode 的资源管理器中选择文件或右键单击文件夹执行 `[Cangjie] Format` 命令，对选择的文件或者文件夹进行格式化

#### 静态检查

- 在 VSCode 的代码编辑区右键选择 `[Cangjie] CodeCheck` 或用快捷键 `Ctrl + Alt + C` 执行静态检查命令
- 在 VSCode 的资源管理器处右键选择 `[Cangjie] CodeCheck` 执行静态检查命令

#### 覆盖率统计

- 在 VSCode 的代码编辑区右键选择 `[Cangjie] Coverage` 或用快捷键 `Ctrl + Alt + G` 执行生成当前仓颉文件覆盖率报告的命令
- 在 VSCode 的资源管理器中选择文件或右键单击文件夹执行 `[Cangjie] Coverage` 命令，对选择的文件或者文件夹生成覆盖率报告

## 相关链接

- [仓颉官网](https://cangjie-lang.cn)
- [下载 SDK](https://cangjie-lang.cn/download)
- [插件资料](https://gitcode.com/Cangjie/vscode_cangjie/blob/main/docs/summary_cjnative.md)

## 许可证

本插件采用 Apache-2.0 许可证。详情请参阅 [LICENSE](https://atomgit.com/Cangjie/vscode_cangjie/blob/main/LICENSE)。
