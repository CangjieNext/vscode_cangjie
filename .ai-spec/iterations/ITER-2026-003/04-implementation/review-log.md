| 文档 | C4 实现评审记录 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-09-10 |
| 状态 | 已完成 |
| 关联 | ITER-2026-003 |

| 时间 | 角色 | 检查 | 结论 |
|---|---|---|---|
| 2026-09-10 | Agent 自检评审 | 规则顺序、捕获组、普通 `local` 反例、`@C` 回归、`demode` 上下文 | 通过 |
| 2026-09-10 | 独立验证评审 | 真实 `vscode-textmate` tokenizer、单行/跨行状态、注释/字符串隔离、非法后缀、`demode` 类型主体边界、lint、compile | tokenizer、lint 通过；compile 被既有依赖类型错误阻断 |

## 评审问题及响应

- 原单行 `match` 无法承载规格允许的 `NL*`：已新增行尾 `@` 的 `begin/end` 状态规则，并用真实 tokenizer 传递 `ruleStack` 验证。
- `demode` 若全局匹配会误高亮变量：已限制为后接 `let` 或 `var` 的实例成员声明形式，并增加正反例。
- 模态 degree 尾部边界不足会误匹配 `@local!!`、`@local?Name` 等：单行规则已收紧，tokenizer 测试覆盖非法后缀。
- 测试报告原仅统计静态断言：现已增加 `test/grammar-modal-tokenizer.test.js`，报告更新为两组真实执行测试。
- 用户确认颜色契约：模态符号 `@`、`~`、`!`、`?` 统一使用 `keyword.control.Cangjie`；模态标识符 `local` 使用现有宏名 `support.function.Cangjie.macro`。
