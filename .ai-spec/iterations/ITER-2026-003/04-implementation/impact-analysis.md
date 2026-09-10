| 文档 | C3 影响分析 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-09 |
| 状态 | 已完成 |
| 关联 | ITER-2026-003 |

## 影响范围

- 直接影响：Cangjie TextMate grammar 的 token scope。
- 间接影响：编辑器中模态语法的主题着色。
- 不影响：LSP 请求、semantic token、格式化、诊断、构建和调试流程。

## 兼容性

- `local` 仍可作为普通标识符，因为它没有加入 `#keywords`。
- 现有 `@` 规则保留，非 local 模态结构仍按既有注解/控制符处理。
- grammar JSON schema 和扩展 manifest 未变更。

## 未解决风险

TextMate 只能提供词法级上下文判断，不能验证完整 Cangjie 类型语法；本迭代用 `@` 后的局部结构匹配满足高亮需求，完整语义合法性继续由编译器/LSP负责。
