# 项目文档索引

需求、设计、架构与素材记录按用途归档。运行和部署入口仍是项目根目录的 [README](../README.md)。

| 分类 | 文档 | 用途 |
| --- | --- | --- |
| 需求 | [需求.md](requirements/需求.md) | 原始升级路线、业务边界与验收方向 |
| 需求 | [需求.docx](requirements/需求.docx) | 用户提供的原始问题和修改清单 |
| 设计 | [视觉升级与功能优化实施方案](design/视觉升级与功能优化实施方案.md) | 当前实施清单；第 11 节记录本轮交付与待办 |
| 设计 | [DESIGN.md](design/DESIGN.md) | 早期设计参考，主要用于理解工作台原有视觉体系 |
| 架构 | [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | 前后台模块、数据读取和运行边界 |
| 架构 | [Context.md](architecture/Context.md) | 历史项目上下文、遗传模型与业务约束 |
| 数据库 | [Database_Schema_Guide.md](database/Database_Schema_Guide.md) | 核心数据模型与表关系；新增表以迁移为准 |
| 素材 | [首页内容与素材替换指南](media/首页内容与素材替换指南.md) | 首页图片、文案、创始伙伴头像和替换方式 |
| 素材 | [像素素材制作记录](media/像素素材制作记录.md) | 素材来源、生成提示词、帧图规格与动画规则 |
| 变更 | [优化建议与实施记录](changelog/优化建议与实施记录.md) | 前期功能与视觉迭代记录 |

## 阅读顺序与版本

先看根目录 README，再看实施方案第 11 节；原始需求与历史上下文用于理解业务，不应把旧章节里的“无需 SQL”当作当前发布结论。当前数据库增量为 [026](../supabase/migrations/026_public_media_selection.sql)、[027](../supabase/migrations/027_growth_and_batch_registration.sql)，需在已有迁移之后依次执行，代码不会自动应用到生产。

文档中的 `assets/`、`js/`、`supabase/`、`artifacts/` 等代码路径，均以仓库根目录为基准；可点击的文档链接使用相对路径。

## 素材与临时文件

- `assets/`：页面实际使用的图片、帧图、样式和图标，会进入网站构建。
- [media/exports/keeper-feeding-loop-v2.webp](media/exports/keeper-feeding-loop-v2.webp)：当前 12 帧喂食动图的独立导出版本，纳入 Git，不随网站构建发布。
- `docs/media/originals/`：本地原始参考照片，保留但忽略 Git，不进入网站构建。
- `artifacts/`：本地验证截图，不纳入 Git；代码中的截图输出路径保持稳定。
- `dist/`、`test-results/`、`playwright-report/`：可重新生成的构建和测试产物，忽略 Git。

本次将未被页面引用的旧六帧喂食图/动图、淘汰头像草稿、临时制作脚本和空的旧图片目录移出工作目录，归档到本地忽略的 `artifacts/archive-2026-09-30/`。历史文档仍保留制作过程，旧素材文件名仅供追溯。采用可恢复归档，不永久删除原始照片或历史素材。
