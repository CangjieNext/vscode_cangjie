| 文档 | C6 / T1 黑盒测试计划 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-09-10 |
| 状态 | 冻结 |
| 关联 | ITER-2026-003 |

测试命令：`node --test test/grammar-modal-highlighting.test.js test/grammar-modal-tokenizer.test.js`

| 用例 ID | 类型 | 输入/检查 | 预期 |
|---|---|---|---|
| BB-001 | 正向 | `String @ local!` | 模态 degree 形式命中；`@`/`!` 使用 `keyword.control.Cangjie`，`local` 使用 `support.function.Cangjie.macro` |
| BB-002 | 正向 | `String @ local?` | 模态 degree 形式命中；`@`/`?` 使用 `keyword.control.Cangjie`，`local` 使用 `support.function.Cangjie.macro` |
| BB-003 | 正向 | `String @ ~local` | 模态 degree 形式命中；`@`/`~` 使用 `keyword.control.Cangjie`，`local` 使用 `support.function.Cangjie.macro` |
| BB-004 | 正向 | `String @local!`、`@local?`、`@~local` | 无空格形式命中，且符号使用关键字 scope、`local` 使用宏名 scope |
| BB-005 | 正向 | `@`、`~`、`local`、degree 可分行 | TextMate `ruleStack` 跨行状态下命中，符号使用关键字 scope、`local` 使用宏名 scope |
| BB-006 | 正向 | `func @local? f`、`this @ local!` | 声明上下文命中，并沿用模态符号/标识符 scope 契约 |
| BB-007 | 正向 | `exclave {}`、`demode var x: T` | 新增关键字/修饰符已声明 |
| BB-008 | 反向 | `let local = 1`、`func local()`、`class local {}`、`obj.local` | `local` 不进入 `support.function.Cangjie.macro` 模态标识符 scope |
| BB-009 | 回归 | `@C func f()` | 普通 `@` 仍为 `keyword.control.Cangjie`，`C` 保持既有宏名 scope，不被误判为 `local` 模态轴 |
| BB-010 | 隔离 | 注释和字符串内的 `@ local!` | 不产生模态标识符或模态符号的专用匹配 |
| BB-011 | 边界 | `@local!!`、`@local?Name`、`@~local!`、`@~localName` | 单行非法形式不产生模态符号的 `keyword.control.Cangjie` scope；其中的 `local` 可由既有普通宏规则独立处理 |
| BB-012 | 边界 | `String`、`@`、`local!Name` 分行 | 跨行非法形式不产生模态符号的 `keyword.control.Cangjie` scope |
| BB-013 | 上下文 | `class C { demode var field: String }` 对比顶层/函数体 `demode var ...` | 仅类型主体字段声明中的 `demode` 进入修饰符 scope |
