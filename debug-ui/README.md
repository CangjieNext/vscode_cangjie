# debug ui components

ui 仓用于为调试插件提供 webview 显示。当前支撑 ide 包括：DevEco、vsCode、vnext。

## 项目结构
```
├─ui-common                     // 共用项目，可以定义通用的依赖包、组件、方法等
│   ├─src
│   │  ├─message
│   │  │  ├─event
│   │  │  ├─request
│   │  │  ├─protocol
│   │  │  └─MessageManager
│   │  ├─utils
│   │  └─index.ts               // 导出
│   └─package.json              // 共用依赖
├─ui-timeline                   // 时间线，子项目，依赖ui-common
│   ├─build
│   ├─src
│   │  ├─message
│   │  │  └─protocol            // 时间线独有的协议
│   │  ├─timeline
│   │  │  ├─Constants
│   │  │  ├─Contexts
│   │  │  ├─TimelineRoot
│   │  │  │  └─TimelineStage
│   │  │  │    ├─MainTimeline
│   │  │  │    └─RecordsLine
│   │  │  ├─Theme
│   │  │  └─Type
│   │  └─index.tsx              // 入口
│   └─package.json              // 时间线独有的依赖和配置
└─package.json                  // workspaces定义了多个工作空间
```

---
## npm 版本升级
因为 package.json 中的 workspaces 属性需 npm 7.0.0 及以上的版本才支持；

查看 npm 版本号：`npm -v`

升级 npm 的方法：
1. 直接升级npm版本： `npm install -g npm`；  
2. 安装 node 15.14.0 以上版本，使用 node 自带的 npm ；

### 安装依赖

- 安装所有子项目的依赖，在项目根目录下执行命令：
```
npm install -ws
```
- 安装指定子项目的依赖，在项目跟木下下执行命令：
```
npm install -w=ui-common -w=ui-timeline
```
- 安装某一子项目的依赖，在子项目的目录中执行命令：
```
npm install
```
注：所有ui子项目的依赖都会被安装在根目录node_modules下，子项目出包只会带自己的依赖。

### 编译
- 编译所有子项目，在项目根目录下执行命令：
```
npm run build -ws
```
- 编译指定子项目的依赖，在项目跟木下下执行命令：
```
npm run build -w=ui-common -w=ui-timeline
```
- 安装某一子项目的依赖，在子项目的目录中执行命令：
```
npm run build
```
注：需要注意的是，如果单独编译子项目，ui-common是被依赖的项目，正常开发过程中，必须先编译ui-common。

### 本地运行
在终端窗口进入子项目目录输入 `npm run start`，即可运行程序到 http://localhost:3000

### 应用方式
编译会在子项目中生成 build 文件夹，将 build 文件夹中所有文件放到 ide 中的指定位置即可。

### 开发
在终端窗口进入 ui-common 目录输入以下命令执行，命令窗口不要关闭，后面 ui-common 仓的修改可以立即生效：
```
npm run watch
```

在其他子项目导入ui-common的方法，使用导入格式 
```
import {IdeType} from 'ui-common'
```