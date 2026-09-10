| 文档 | T2 缺陷登记册 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-09-09 |
| 状态 | 已完成 |
| 关联 | ITER-2026-003 |

| ID | 严重度 | 描述 | 状态 | 处理 |
|---|---|---|---|---|
| ENV-001 | 中 | 根工程 compile 受现有 `@types/webpack` 与 `tapable` 类型版本不兼容影响 | 已知环境问题 | 不修改无关依赖；记录为 G4 阻断项 |
| TEST-001 | 低 | 旧测试只检查正则，无法证明 TextMate 跨行状态行为 | 已关闭 | 新增真实 `vscode-textmate`/`vscode-oniguruma` tokenizer 测试，覆盖 `ruleStack` 跨行验证 |
| GRAMMAR-001 | 低 | 模态 degree 尾部边界不足时可能误高亮 `@local!Name`、`@local!!` 等非法形式 | 已关闭 | 收紧单行规则边界，并增加单行及跨行非法后缀 tokenizer 回归用例 |
| GRAMMAR-002 | 低 | 全局匹配 `demode` 会误高亮顶层声明、函数体和普通成员名 | 已关闭 | 移除全局匹配，限制到类型主体内后接 `let`/`var` 的字段声明，并增加正反例 |
