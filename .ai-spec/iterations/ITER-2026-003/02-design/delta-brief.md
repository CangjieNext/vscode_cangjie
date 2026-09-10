| 文档 | D1 迭代差异简报 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-09 |
| 状态 | 冻结 |
| 关联 | ITER-2026-003 |

## 需求

- US-001：为 local 模态类型增加上下文高亮。
- US-002：为 exclave、demode 及声明中的模式标注增加高亮。
- US-003：保持 local 的软关键字兼容。

## 既有模块

- `syntaxes/Cangjie.tmLanguage.json`：TextMate grammar，是唯一代码改动目标。
- `test/grammar-modal-highlighting.test.js`：新增黑盒验证脚本。

## 契约变化

- TextMate scope 契约新增模态标记作用域；不改变 LSP 或运行时契约。

## 数据变化

- 无。
