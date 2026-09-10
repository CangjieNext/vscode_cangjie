| 文档 | D2 概要设计 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-09 |
| 状态 | 冻结 |
| 关联 | ITER-2026-003 |

## 方案

在现有 grammar 顶层 pattern 的 `#at` 前增加 `#modal`。`#modal` 使用单行复合匹配和行尾 `@` 的 `begin/end` 状态规则消费 `@`、空白/换行、`~`、`local` 和 degree 后缀；普通 `#at` 继续负责其他 `@` 用法。关键字表只增加全局合法的 `exclave`，`demode` 仅在类型主体中、且后接 `let`/`var` 的字段声明位置使用声明修饰符作用域；`local` 不进入全局关键字表。

## 模块职责

- `#modal`：识别模态结构并给捕获组赋予模态作用域。
- `#at`：保留已有注解/宏引入符高亮。
- `#keywords`：保留全局关键字集合，仅加入 `exclave`。
- `#class-body` / `#demode`：将 `demode` 的高亮限制在 `class`、`interface`、`struct`、`enum`、`extend` 主体的成员声明上下文。
