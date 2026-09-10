| 文档 | R4 范围说明书 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-09 |
| 状态 | 冻结 |
| 关联 | ITER-2026-003 |

## 纳入范围（in-scope）

- 修改 `syntaxes/Cangjie.tmLanguage.json`。
- 新增受上下文约束的 `local` 模态匹配。
- 高亮模态 degree 符号及模态引入符。
- 高亮 `exclave` 与 `demode`。
- 保持普通 `local`、现有关键字和 `@` 注解兼容。
- 增加不依赖新运行时依赖的黑盒 grammar 回归测试与执行证据。

## 排除范围（out-of-scope）

- LSP semantic token 协议或服务器实现。
- 编译器、格式化器、lint、调试器和 CJPM 适配。
- `unique`、`immutable` 模态轴高亮。
- 语言配置中的补全、括号或 wordPattern 行为调整。
- 主题专用颜色配置。
