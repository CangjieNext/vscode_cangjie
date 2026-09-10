| 文档 | T1 测试执行报告 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-09-10 |
| 状态 | 已完成 |
| 关联 | ITER-2026-003 |

## 结果

| 检查 | 命令 | 结果 | 证据 |
|---|---|---|---|
| grammar 静态黑盒 | `node --test test/grammar-modal-highlighting.test.js` | 通过 | `evidence/G4-grammar.log` |
| grammar 真实 tokenizer | `node --test test/grammar-modal-tokenizer.test.js` | 通过；覆盖单行、跨行、普通标识符、`@C`、注释、字符串、`demode` 上下文和非法后缀（含跨行），并验证模态符号使用 `keyword.control.Cangjie`、模态 `local` 使用 `support.function.Cangjie.macro` | `evidence/G4-grammar.log` |
| grammar 组合执行 | `node --test test/grammar-modal-highlighting.test.js test/grammar-modal-tokenizer.test.js` | 通过，2 个测试文件 | `evidence/G4-grammar.log` |
| grammar 结构 | Node.js `JSON.parse` 校验 `package.json` 与 grammar | 通过 | `evidence/G4-json.log` |
| lint | `npm run lint` | 退出码 0，4 个既有 warning | `evidence/G4-lint.log` |
| compile | `npm run compile` | 退出码 1，被既有 `@types/webpack`/`tapable` 类型不兼容阻断 | `evidence/G4-compile.log` |

## 缺陷判断

compile 失败发生在 `node_modules/@types/webpack/index.d.ts`，与本次 grammar 和测试变更无直接关联；未发现本次变更引入的 TypeScript 错误。G4 因 compile 证据失败保持 pending，不能进入最终发布门禁。
