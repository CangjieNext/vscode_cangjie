| 文档 | D3 详细设计 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-10 |
| 状态 | 冻结 |
| 关联 | ITER-2026-003 |

## 语法规则

模态规则覆盖：

```text
@ whitespace (~ whitespace local | local whitespace (! | ?))
```

其中 `whitespace` 允许空格、制表和换行。单行规则必须使用词边界和尾部边界限制 `local` 及 degree，避免匹配 `localName`、`@local!!`、`@local!Name` 等非法后缀；行尾 `@` 通过 `begin/end` 规则承载跨行状态。

## 作用域

| 捕获内容 | scope |
|---|---|
| `@` | `keyword.control.Cangjie` |
| `~`、`!`、`?` | `keyword.control.Cangjie` |
| `local` | `support.function.Cangjie.macro` |
| `exclave` | `keyword.control.Cangjie` |
| `demode` | `storage.modifier.Cangjie`，仅限类型主体内后接 `let`/`var` 的字段声明 |

## 兼容性

TextMate 规则顺序保证模态规则优先于普通 `@` 规则；模态规则失败时，普通 `@` 规则仍匹配。由于普通 `local` 不在 `#keywords`，其现有标识符规则不改变。`demode` 不做全局匹配，避免在顶层、函数体或普通成员访问中误高亮。
