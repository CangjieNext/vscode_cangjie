| 文档 | C2 实现说明 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-09-10 |
| 状态 | 已完成 |
| 关联 | ITER-2026-003 |

| 任务 ID | 设计项 | 代码路径 | 验证方式 |
|---|---|---|---|
| T-001 | D1~D8 | `.ai-spec/iterations/ITER-2026-003/` | OpenSpec 产物检查 |
| T-002 | D2、D3、ADR-0001 | `syntaxes/Cangjie.tmLanguage.json` | 静态规则与真实 TextMate tokenizer 测试 |
| T-003 | NFR-001~003 | `test/grammar-modal-*.test.js`、仓库命令 | 证据日志 |

## 实现摘要

- 新增 `#modal`：单行 `match` 严格识别 `local!`、`local?`、`~local`；行尾 `@` 使用 `begin/end` 状态承载规格中的 `NL*`，并拒绝非法 degree 后缀。
- `local` 只获得 `support.function.Cangjie.macro` 作用域，不加入全局关键字表；`@`、`~`、`!`、`?` 使用 `keyword.control.Cangjie`；模态标识符 `local` 使用 `support.function.Cangjie.macro`。
- `exclave` 加入全局控制关键字；`demode` 限制为类型主体内后接 `let`/`var` 的字段声明修饰符，避免顶层、函数体和普通标识符误高亮。
- 在顶层、类型、限定类型、代码块和插值等 grammar 上下文中接入 `#modal`。
- 新增 `vscode-textmate` 和 `vscode-oniguruma` 仅用于开发期 tokenizer 回归测试；未修改运行时逻辑、LSP 或编译器工具链。

## 词法限制

跨行状态规则仅根据已经读取的 token 着色，不能像解析器一样回溯验证完整类型语法；编译器/LSP 继续负责语义合法性。单行非法后缀由严格边界规则拒绝。
