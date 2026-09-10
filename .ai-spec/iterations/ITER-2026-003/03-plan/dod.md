| 文档 | P4 完成定义 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-09-09 |
| 状态 | 冻结 |
| 关联 | ITER-2026-003 |

- grammar JSON 可解析。
- OpenSpec 证据与最新实现保持一致。
- 黑盒测试规格在实现前冻结并全部通过。
- 普通 `local` 未加入全局关键字。
- `exclave`、`demode` 和 local 模态正向样例覆盖。
- `npm run lint` 通过；`npm run compile` 已执行，但受既有 `@types/webpack`/`tapable` 类型不兼容问题（ENV-001）阻断，故 G4 保持 pending。
- 变更和验证均有 OpenSpec 证据。
