const fs=require('fs'),path=require('path');
const {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType,ShadingType,AlignmentType,Header,Footer,PageNumber,ImageRun}=require('./tooling/node_modules/docx');
const {modules,cross}=require('./report-data.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/audits/2026-10-12');fs.mkdirSync(out,{recursive:true});
const all=[...modules.flatMap(m=>m.issues.map(i=>({module:m.name,i}))),...cross.map(i=>({module:'共用体验与数据层',i}))];
const source=i=>{const text=fs.readFileSync(path.join(root,i[7]),'utf8'),pos=text.indexOf(i[8]);if(pos<0)throw Error('Missing source '+i[0]);return i[7]+':'+(text.slice(0,pos).split('\n').length);};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const priority={P1:all.filter(x=>x.i[1]==='P1').length,P2:all.filter(x=>x.i[1]==='P2').length};
const blocks=[];
const h=(text,level=1)=>blocks.push({type:'h',text,level});
const p=text=>blocks.push({type:'p',text});
const table=(heads,rows)=>blocks.push({type:'table',heads,rows});
const picture=(file,caption)=>blocks.push({type:'image',file,caption});
const issue=i=>{h(`${i[0]}｜${i[3]}`,3);p(`优先级：${i[1]}　证据：${i[2]}　定位：${source(i)}`);p('现状与影响：'+i[4]);p('修改方案：'+i[5]);p('验收标准：'+i[6]);};
h('审查结论与范围');
p('当前系统已具备种群、繁育、公开展示和交易的主要数据链路。问题集中在同一数据的统计口径不一致、跨模块跳转丢失对象上下文、多个表单实现造成操作差异，以及部分多步写入和独立缓存尚未统一。建议先修正确性与录入保护，再调整导航和视觉层级，不宜通过增加更多侧边栏模块解决这些问题。');
p(`本次按照实际渲染顺序审查 13 个侧边栏模块，并补充个体详情、提醒、AI、图库、通用弹窗与数据访问层，共整理 ${all.length} 条问题与建议：P1 ${priority.P1} 条，P2 ${priority.P2} 条。P1 中含需故障注入确认的风险，不等同于 ${priority.P1} 个已经在线发生的故障。未发现并验证可定为 P0 的生产事故，也不据此宣称生产安全已被完整验证。`);
p('优先级定义：P1 为应优先处理的结果正确性、状态一致性、写入可靠性和录入阻断问题，建议在相关功能继续扩大使用前解决或验证；P2 为流程效率、可理解性、布局一致性与规模化改进。证据类别与优先级独立，风险项必须验证，不能仅凭优先级认定已发生。');
table(['审查项','本次范围与边界'],[
 ['基线','2026-10-12 当前 D:/hosnose 工作区，包含本轮多系列、日期输入及防误关修复；不以此前旧版本截图作为缺陷证据。'],
 ['代码范围','admin.html、全部后台页面脚本与相关样式、数据访问层、涉及交易/繁育/库存/系列的迁移与测试。功能盘点覆盖所有已识别的侧边栏模块与主要入口。'],
 ['浏览器','本机 Chrome；1440×1000 桌面、390×844 手机。13 模块各一组独立页面截图，另拍年度审核及新增个体/计划弹窗。巡检使用禁外网、禁止写入的测试夹具。'],
 ['自动化','npm test：72/72 通过；现有 Playwright：68/70 通过，2 个相同场景在桌面/手机失败。详见测试章节，不能称全量通过。'],
 ['数据边界','未访问生产管理会话、未提交真实订单/收款/拍卖/繁育记录。mock 页面验证展示和计算；数据库测试运行于本地 PGlite。'],
 ['未验证项','生产部署迁移版本、真实 RLS 配置、多人并发、长时间断网、真实 AI 输出质量、真实结拍定时任务、真实 SMTP/支付到账、辅助技术与多浏览器兼容。'],
 ['证据解释','浏览器复现＝指定测试样本可重现；代码确认＝源代码直接支持；视觉确认＝本地截图观察；风险待验证＝需故障注入/生产等价环境确认；体验建议＝产品改进，不能算既有 bug。']
]);
h('优先处理的事项',2);
table(['建议顺序','编号','原因'],[
 ['1 数据结果正确性','PR01、PR02、AD01、NU01','取消计划计数、窝数/计划数混用、退回显示通过、多系列幼体录入不兼容，均会直接影响理解或档案质量。'],
 ['2 写入与资金记录保护','PO02、AD02、IN01、SA02','先验证事务与幂等，防止部分保存、重复支出、收款状态不一致。'],
 ['3 录入和关闭策略','G01、AU01、PA01、G07','将刚修复的个体体验推广到拍卖、收款配置等，并更新旧测试。'],
 ['4 可用个体和任务定位','LA01、RE02、OV01、G02','统一可用性、历史补录与筛选口径；从提醒直接处理对应对象。'],
 ['5 信息架构与规模化','其余 P2','处理重复入口、长表单、密集按钮、列表查找和多套缓存。']
]);
h('已经具备、应保留的能力',2);
p('不要把以下功能误判为未接数据：个体与销售徽标已联动；自繁留存共用同一 snakes 身份；实验室已能把亲本带入年度计划；计划可关联真实配种、窝次和幼体；照片共用图库并逐张选择公开；拍卖成交进入购买意向；付款审核进入销售状态；路线移动已有冲突保护与撤销；批量幼体登记已有整批事务和重试请求号。');
p('本轮已经完成的新增蛇多系列、快速日期、输入回车防提交、遮罩/Esc 防误关和取消确认，应作为回归基线保留。报告进一步指出幼体登记等未同步入口与其它弹窗差异，不将已修复的同一问题重复列为未完成。');
h('功能与数据链路总图');
table(['链路','当前连接情况','应补的连接'],[
 ['系列 → 个体 → 筛选/统计/公开档案','主表单与 035 迁移支持数组成员关系；旧单系列数据保留','单条/批量幼体登记使用同一数组；系列管理补使用数量与归档。'],
 ['个体 → 配对实验室 → 年度计划','原子基因概率、会话比较和带亲本建计划已具备','可用性过滤、决策快照、计划与路线互链。'],
 ['年度计划 → 配种事件 → 窝次 → 幼体','plan_id、breeding_event_id、clutch_id、亲本关系已建立','计划/实际/差异同页汇总；完成前核对未结束记录。'],
 ['路线虚拟后代 → 实际产出','路线节点只表达规划，不自动生成真实后代','明确关联窝次或留存个体，不能仅按年份认定 ACTIVE。'],
 ['自繁库 → 留存 → 种群库','共用个体，切库不复制；留存评估有记录','统计区分在养自繁与在养幼体；历史补录修复谱系。'],
 ['个体/照片 → 公开展示 → 拍卖/一口价','公开字段与内部资料隔离；交易设置共享 listing','公开照片质量检查统一；减少一行重复入口。'],
 ['拍卖成交 → 订单 → 收款 → 交付','后端主状态流已经接入','成交直达订单、审核直达交付、售后和异常闭环。'],
 ['采购计划 → 入库 → 实际费用','费用可关联 acquisition 防重复；采购计划完成尚不要求个体链接','采购结果引导关联 snake/acquisition，避免三处各自录入。'],
 ['提醒 → 对象 → 下一步操作','已汇总繁育/销售/付款/缺图等任务','任务持有实体 ID 和动作；统一隐藏、稍后、完成语义。'],
 ['全局数据 → 各模块缓存','多套 raw/model/rows/receipts/sales/plans 并存','共享查询/失效机制，显示更新时间，错误不伪装成空数据。']
]);
h('逐模块审查');
p('以下顺序与管理员侧边栏实际渲染顺序一致。每个模块列出功能范围、已经存在的数据交互、布局方向和可验收的修改条目。列表中没有缺陷不代表该功能经过全部生产异常场景验证。');
for(const m of modules){h(m.name,2);p('功能范围：'+m.scope);p('数据现状：'+m.data);p('布局建议：'+m.layout);for(const i of m.issues)issue(i);}
h('全局交互、提醒与数据层');for(const i of cross)issue(i);
h('非侧栏共享功能的补充审查',2);
table(['功能族','已存在的功能与数据交互','修改/验证建议及归属'],[
 ['AI 分析与候选采购','配对/年度/种群投资/候选投资分别构造事实输入；模型选择、Prompt、分析记录、快照、候选后台轮询、错误重试、引用来源、建议审核已经存在。','保留分域输入和人工应用；T21 验证生成中离开页面、任务恢复、输入已改变时的旧建议标记。未调用真实 AI，不对建议准确率作结论。'],
 ['AI 对话和历史','js/ai.js 的 conversationMessages 从 REMOTE_RAW 过滤当前会话，openAiConversation 使用已读消息；js/data.js 对全部会话消息一次取最近 600 条。','当多会话累计超过 600 条，老会话可能显示不完整历史；归入 G04，改为按 conversation_id 游标取消息，明确还有更早记录。用跨 2 会话超过 600 条样本验证。'],
 ['Prompt 版本维护','管理员可编辑、临时覆盖和保存新版本；savePromptTemplate 先插新版本，再停用其他版本。','归入 AD02 的事务风险核查：并发保存、第二次更新失败时验证只有一个有效版本；提示“当前临时内容”与“已发布版本”的差别。'],
 ['个体详情与返回路径','详情已展示亲本/后代/窝次、销售徽标、成长趋势、留存历史、内部备注；从列表/卡片/抽屉进入共享身份。','归入 G02/G05/RE01：返回保留来源库，窝次号变可直达入口，统一成长编辑，不重复建设一套孤立档案。'],
 ['照片库','内部图库与公开档案共用；上传、替换、缩略图、封面、删除、照片日期、公开勾选、签名访问已有实现与回归。','归入 PU02/G01：独立保存边界明确；只有内部图不能消除缺公开图提醒；测试过期签名、上传中取消和替换失败回滚。'],
 ['认证与只读权限','登录、显示密码、重置密码、退出、profiles 角色和 active 检查、前端 canWrite 以及数据库权限层均存在。','T18 加真实等价 RLS、session 过期、跨标签退出验证；只读账号的无权限页和隐藏入口应一致，错误需给出恢复动作。'],
 ['数据导入与批量操作','已有批量幼体登记；目前没有证据表明全系统都需要通用批量修改。','优先实现台账/记录检索与必要导出；批量删除、批量发布等高影响新操作须单独定义预览、权限、幂等和审计，避免盲目增加按钮。']
]);
h('按钮、弹窗与页面设计执行规范');
p('以下为本项目建议采用的设计目标，不是已经完成的改动，也不是未经实测的可访问性合规结论。应由前端与产品共同确认后实现。');
table(['区域','具体调整','验收方式'],[
 ['页面主操作','每个页面头部突出一个主要任务；刷新、查看历史为次级；删除、取消交易独立收纳且使用明确危险说明。','390px 手机主按钮不被隐藏；同一对象行内不超过两个常用直接操作，更多菜单键盘可达。'],
 ['筛选栏','搜索放首位，常用筛选紧随，更多条件折叠；显示匹配数量、清空和已选条件；将筛选写入路由。','刷新、前进后退可恢复；由提醒带入的条件可见，不因隐藏条件产生误解。'],
 ['桌面编辑弹窗','建议最大宽 840px、90dvh；固定标题与操作栏，仅中间表单滚动；短表单单列，相关字段两列。','长内容时保存/取消始终可达；不出现页面和弹窗多层抢滚动。'],
 ['手机编辑弹窗','建议近全屏，单列，底部固定操作条适配安全区和软键盘；正文与按钮不互相覆盖。','390×844、360×800、横屏和键盘弹起时，最后一个字段与错误可见，保存取消不被导航挡住。'],
 ['表单分区','基本身份与核心业务在前；交易规则、成本、备注、字典和照片分区。日期控件复用，实际/预计明确区分。','字段顺序符合任务步骤；按 Tab 顺序与视觉顺序一致；补充区非必填时不阻塞提交。'],
 ['保存与取消','只有明确提交动作才保存；输入 Enter 不应意外结束复杂录入；有修改退出确认，忙状态禁重复提交。','输入、中文输入法、日期面板、折叠区、嵌套确认、Esc、遮罩均有自动化回归。'],
 ['反馈和错误','字段错误靠近字段；表单顶部/底部保留汇总，失败不清空；保存成功但刷新失败要分开描述。','用户可以定位错误并修正，无需重新填写；ARIA 状态区可读，技术异常折叠可展开。'],
 ['金额和指标','金额附币种/口径；项目、配对组、计划窝、实际窝分别命名；百分比分母说明。','1 项 3 窝样本正确；未知数据显示未知，不自动当 0；取消状态不混入有效容量。'],
 ['状态与颜色','统一中文状态词和样式；文本表达状态，不能仅靠颜色；退回与通过互斥。','状态矩阵枚举所有后端值；未知值显示可诊断回退而非错误已通过。'],
 ['触控与排版','主要触控目标建议至少 44×44px；正文建议 14–16px，辅助文字避免过小；此为内部设计目标。','触控实测含密集表格、更多菜单、关闭图标；不只测页面是否横向溢出。'],
 ['返回和定位','个体详情保留来源库/列表筛选；对象跨模块携带 ID，返回恢复原处。','从自繁→详情→返回回到原自繁分组；从提醒→付款→交付一直保持订单上下文。'],
 ['加载与无数据','初载、局部失败、真正无数据、筛选无结果分成四种状态；缓存值注明时间。','逐表拒绝请求验证，不出现失败却显示“没有记录”的错误判断。']
]);
h('弹窗矩阵：需要统一到什么程度',2);
table(['弹窗族','当前观察','建议'],[
 ['个体 editModal','已修防回车和误关，支持改动确认；照片/系列另存','作为表单保护基线，强化独立保存提示、关闭后的草稿策略。'],
 ['计划/投资/字典 editModal','与个体共用容器，Esc 被统一屏蔽，但 dirty 保护未全面复用','明确是否允许 Esc 请求取消，关键是必须经过未保存确认；不要仅禁快捷键。'],
 ['workflowModal','短操作/确认共用，按钮支持忙态；与原生 dialog 不是一个实现','标准确认动作和焦点返回，嵌套时只操作最上层；保留取消的可见性。'],
 ['workspaceDialog','原生 dialog；dirty、busy 与 confirm 原生确认混用','统一确认外观、日期与字段校验，不破坏已具备的保护。'],
 ['upgradeDialog','成长/批量/留存；有 dirty/saving；记录类型更丰富','合并旧测量入口；大批量预览可编辑但不得意外重置已填行。'],
 ['auction-dialog','创建/取消与出价只读对话共用，未完整保护写表单','区分只读与编辑，写表单才需要脏数据/忙态保护。'],
 ['payment-dialog','审核提交保护较全，收款方式配置较弱','将审核保护复用到设置，凭证大图与实际核对字段布局统一。'],
 ['AI 对话与提醒面板','对话有最新消息按钮，提醒是浮层；不是普通业务表单','不要强制所有浮层使用同一退出确认；按是否有未提交内容配置行为。']
]);
h('实施路线与依赖');
table(['阶段','交付物与任务','依赖/负责人','完成门槛'],[
 ['A 先统一业务定义','有效计划、计划窝、在养种群、历史补录、审核状态、收款状态的数据字典；明确日期归年。','产品/业务负责人 + 后端；覆盖 PR01/02、OV01、LA01、SA02。','所有统计组件共享口径，测试夹具的期望先写清。'],
 ['B 正确性与写入保护','修取消计数/错标审核、多系列幼体；审核与个体事务、支出幂等；统一可用性校验。','后端 + 前端 + QA；迁移先兼容旧接口，再切新 UI。','P1 已确认问题关闭；风险类完成故障注入并给出结论。'],
 ['C 跨模块流程闭环','对象深链接、采购结果、计划后代绑定、审核到交付；统一关闭和草稿保护。','前端为主，后端提供对象定位和关联字段；依赖 A 的状态定义。','从提醒到完成任务无需重复查找；返回不丢筛选/草稿。'],
 ['D 视觉与效率','常用主次按钮、折叠补充区、表单底栏、手机导航、列表检索分页、中文文案。','前端/设计 + QA；不新增侧边栏系列模块。','目标分辨率、键盘、长文案、空数据/失败样本全部通过。'],
 ['E 数据规模和运维','共享查询失效、按需加载、慢网与并发、版本/错误诊断、生产等价只读验收。','前后端 + QA/运维；使用脱敏大样本。','明确请求预算和加载目标；完整测试通过，灰度回滚策略可执行。']
]);
p('不建议一次性重写所有页面。先建立共享数据口径、任务链接和表单控制，再逐模块替换；现有交易/孵化事务测试是保护网。具体工期应在事务接口、退款范围和采购闭环需求确认后估算，本报告不把未经拆分的工期当作承诺。');
h('验收测试清单');
table(['编号/场景','操作与样本','期望与建议层级'],[
 ['T01 有效计划统计','3 窝有效 + 2 窝取消 + 待审 + 退回','有效计划 1 项/3 窝；数据库与视图一致；单元+UI。'],
 ['T02 配对可用性','在养、已售、退役、死亡、自繁未留存、性别未知','默认候选正确，历史模式明确，后端创建计划/事件复核；集成+UI。'],
 ['T03 审核状态','pending/approved/returned/rejected 全枚举','按钮、标签、来源、可见范围一致；单元+UI。'],
 ['T04 多系列幼体','母本两个系列，单条/批量/补录三入口','数组成员不变成组合字符串；保存与筛选一致；PGlite+UI。'],
 ['T05 未保存退出','每种编辑弹窗填一项，点关闭/取消/Esc/遮罩','符合声明策略，无静默丢稿；键盘+手机。'],
 ['T06 隐式提交','回车、输入法确认、日期选择、折叠按钮、内部新增按钮','不得触发外层意外保存；明确保存才提交。'],
 ['T07 双击/重试','延迟响应、保存连点、返回超时、重新提交','同一业务只生效一次，失败保留输入；API 并发+UI。'],
 ['T08 事务故障','第 2/3 次写入故意失败或无权限','全部回滚或可恢复有记录，不出现半更新。'],
 ['T09 日期边界','上海 00:30、月底、闰日、跨年、预计未来','日期不偏移；实际不未来；顺序错误有就近提示。'],
 ['T10 写后读取失败','写入成功，随后的刷新请求失败','明确已保存/刷新失败；不诱导重复新建。'],
 ['T11 单表读取失败','单独拒绝 inquiries/expenses/media/calendar','对应区显示错误，其他区可用，失败不伪装为零。'],
 ['T12 分页与规模','25/101/501/1500 条记录，服务器较小分页上限','全量可查，排序稳定，无重复漏项，统计口径一致。'],
 ['T13 导航上下文','提醒→付款/订单；拍卖→成交；自繁→个体→返回','实体与筛选不丢；浏览器前进后退正确。'],
 ['T14 照片公开边界','无图、仅内部图、一张公开图、替换/删除、过期签名','列表提示和真实公开图一致；内部资料不公开。'],
 ['T15 拍卖闭环','延期/强制截止、无人首拍、并发竞价、到期结算','服务器规则正确；成交唯一；前端显示可解释。'],
 ['T16 收款审核','无截图、识别失败、金额不符、待审、重复审核','OCR 不替代到账；确认需要核实；订单/凭证同步。'],
 ['T17 采购费用','先录费用/先录个体/关联后修改/删除个体','acquisition 总投入只计一次；历史费用可追溯。'],
 ['T18 权限','admin/editor/viewer、失效账号、退出/切换账号','UI 与 RLS 一致；缓存清除；不能把隐藏按钮当安全边界。'],
 ['T19 长会话与竞争','多标签同时修改、刷新旧响应晚到、轮询时输入','不覆盖新数据，不丢草稿；冲突显式处理。'],
 ['T20 可访问与布局','360/390/768/1440、200% 缩放、长中文、键盘、软键盘','内容/错误/取消/保存可达；summary、Tab、焦点回归正确。'],
 ['T21 AI 决策闭环','未配置、分析失败、过期输入、建议退回/重提/通过','结果标时间与输入；应用幂等，人工审核留痕；真实 AI 另验。']
]);
h('本次测试结果与可复核证据');
p('测试是在当前工作区完整运行，结果不是从既往对话复制：72 项 Node 测试通过；Playwright 共 70 项，68 项通过，2 项失败。通过项包括交易状态与公开边界、批量登记、拍卖、付款凭证、OCR、图库、提醒、多系列录入和防误关等既有测试。');
p('失败定位：tests/browser/site.spec.js 的 authenticated workspace 场景，桌面和手机各一项。第 71 行对加入年度计划后的 editModal 按 Escape，第 72 行点击投资导航，被仍打开的弹窗拦截。该测试应按最终确认的关闭规范改用明确取消，并补“继续填写/放弃”的断言。当前报告未为了得到全绿而修改这些测试或业务实现。');
p('额外只读巡检：13 模块×2 视口，记录文本、按钮数量、页面宽度、控制台错误与截图。该测试样本中两端均未见整页横向溢出，未捕获页面脚本异常；这不证明软键盘、海量数据或所有模态框都无布局问题。样本年度日历 RPC 返回空集合、AI 模板未配置，其空态只作为空态截图，不据此判定生产数据未接入。');
p('源证据目录：artifacts/audit-2026-10-12。unit-tests.log 和 browser-tests.log 是本次运行日志；module-observations.json 是逐模块观察；capture.cjs 是禁止外部请求和写入的截图脚本；report-data.cjs 与 build-report.cjs 生成本报告。每个问题旁的代码定位对应当前工作区，后续改动可能移动行号。');
table(['文件','用途'],[
 ['unit-tests.log','72 项测试及结果'],['browser-tests.log','70 项浏览器测试、失败堆栈和 trace 路径'],['module-observations.json','页面顺序、按钮、正文、逻辑样本和 pageerror'],['desktop-*.png / mobile-*.png','各模块测试页面及弹窗截图'],['../../../artifacts/audit-2026-10-12/capture.cjs','可重复运行的本地只读页面审查脚本']
]);
h('关键截图证据',2);
picture('desktop-annual-review.png','图 1：同一 returned 记录左侧显示“已退回”，操作区却显示“审核已通过”（AD01）。全部为测试数据。');
picture('mobile-plan-form.png','图 2：手机新增年度计划较长，首屏仅到提醒字段；应固定底部操作并重新分组。截图不证明保存按钮永久不可达。');
picture('mobile-publishing.png','图 3：手机公开展示单对象操作密集；“编辑、预览、交易、照片、删除、查看”等需主次收纳（PU01）。');
picture('desktop-lab.png','图 4：配对推荐列表仍包含 SOLD 与 RETIRED。当前按钮和概率已有数据接入，需要纠正候选范围（LA01）。');
h('问题总索引');
table(['编号','模块','优先级/证据','问题'],all.map(({module,i})=>[i[0],module,i[1]+' / '+i[2],i[3]]));
h('交付及复核说明');
p('本报告提供可编辑 Word 和带目录/问题检索的 HTML 两个版本。Word 使用标题层级、页码和固定表宽；HTML 包含同一正文及截图，可直接离线打开。文档生成后进行结构检查和 HTML 浏览器检查；环境没有检测到 LibreOffice/Office 渲染工具，因此未完成 Word 在实际 Office 引擎中的逐页视觉校对，正式外发前可在本机 Word 更新目录并检查分页。');
p('建议将问题按编号进入任务队列，每条关联实施 PR、回归用例和验收证据。修复确认以指定场景重新测试为准，不能仅以代码已提交或页面看起来正常关闭问题。');

const htmlBlocks=blocks.map((b,n)=>{if(b.type==='h')return `<h${b.level+1} id="s${n}">${esc(b.text)}</h${b.level+1}>`;if(b.type==='p')return `<p>${esc(b.text)}</p>`;if(b.type==='table')return `<div class="table-scroll"><table><thead><tr>${b.heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;const data=fs.readFileSync(path.join(__dirname,b.file)).toString('base64');return `<figure><img loading="lazy" src="data:image/png;base64,${data}" alt="${esc(b.caption)}"><figcaption>${esc(b.caption)}</figcaption></figure>`;}).join('\n');
const toc=blocks.map((b,n)=>b.type==='h'&&b.level<=2?`<a class="l${b.level}" href="#s${n}">${esc(b.text)}</a>`:'').join('');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Suoha 全模块审查与修改建议 · 2026-10-12</title><style> :root{--ink:#233b2c;--line:#d9e2d5;--paper:#f3f5ef}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:#28322c;font:15px/1.85 system-ui,'Microsoft YaHei',sans-serif}aside{position:fixed;width:245px;inset:0 auto 0 0;overflow:auto;padding:26px 20px;background:#203529;color:#fff}aside strong{font-size:17px}aside a{display:block;color:#dce8d5;text-decoration:none;line-height:1.5;padding:6px 0;font-size:12px}aside a.l2{padding-left:12px;color:#b6c9aa}main{max-width:1120px;margin-left:245px;padding:45px 46px;background:#fff}header{border-bottom:4px solid #59724b;padding:20px 0 30px;margin-bottom:35px}.eyebrow{letter-spacing:3px;color:#69825b;font-size:12px}h1{font-size:36px;line-height:1.4;margin:16px 0}h2{font-size:25px;margin-top:52px;border-top:1px solid var(--line);padding-top:22px;color:var(--ink)}h3{font-size:21px;margin-top:36px;color:var(--ink)}h4{font-size:17px;margin-top:28px;border-left:4px solid #aec39c;padding-left:12px}p{margin:12px 0}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.65;margin:18px 0}th{background:#e9efdf;color:#314c35;text-align:left}th,td{padding:12px;border:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even){background:#fafbf8}.table-scroll{overflow:auto}figure{margin:26px 0;padding:16px;border:1px solid var(--line);background:#f8faf5}figure img{display:block;max-width:100%;max-height:950px;object-fit:contain;margin:auto}figcaption{font-size:13px;color:#54634e;margin-top:14px}.chips{display:flex;gap:14px;flex-wrap:wrap}.chip{padding:12px 18px;background:#edf3e5;border-radius:8px}input{width:100%;margin:18px 0;padding:10px;border:1px solid #aabf9d;border-radius:5px}#searchStatus{font-size:12px;color:#dbe8d1}.hit{background:#fff0a8}button{padding:9px 14px;border:1px solid #aac19b;background:#f4f8ef;color:#243e2a;border-radius:6px;cursor:pointer}h2,h3,h4{scroll-margin-top:20px}@media(max-width:850px){aside{position:static;width:auto;max-height:280px}main{margin:0;padding:25px 18px}h1{font-size:28px}table{min-width:620px}}@media print{aside,.print-control{display:none}main{margin:0;max-width:none;padding:0}body{background:white;font-size:10pt}h2{break-before:page}h2,h3,h4{break-after:avoid}tr,figure{break-inside:avoid}thead{display:table-header-group}table{font-size:9pt}a{color:inherit}figure img{max-height:220mm}}</style></head><body><aside><strong>审查目录</strong><input id="search" placeholder="查找编号或关键词" aria-label="报告查找"><div id="searchStatus"></div>${toc}</aside><main><header><div class="eyebrow">SUOHA / ENGINEERING REVIEW</div><h1>全模块审查与<br>修改建议文档</h1><p>2026-10-12 · 当前工作区审查 · 测试数据验证</p><div class="chips"><span class="chip">13 个模块</span><span class="chip">52 条问题与建议</span><span class="chip">17 项 P1</span><span class="chip">35 项 P2</span></div><p>覆盖交互、UI、功能逻辑、数据联动、按钮与弹窗设计；附定位、验收与实施顺序。</p><button class="print-control" onclick="window.print()">打印 / 保存</button></header>${htmlBlocks}</main><script>const q=document.querySelector('#search');q.addEventListener('input',()=>{document.querySelectorAll('.hit').forEach(e=>e.classList.remove('hit'));const term=q.value.trim().toLowerCase();const matches=term?[...document.querySelectorAll('main h4')].filter(e=>e.textContent.toLowerCase().includes(term)):[];matches.forEach(e=>e.classList.add('hit'));document.querySelector('#searchStatus').textContent=term?matches.length+' 条问题标题匹配':'';if(matches[0])matches[0].scrollIntoView({block:'center'});});</script></body></html>`;
fs.writeFileSync(path.join(out,'全模块审查与修改建议.html'),html);
fs.writeFileSync(path.join(out,'问题清单.json'),JSON.stringify({date:'2026-10-12',modules:13,count:all.length,findings:all.map(({module,i})=>({id:i[0],module,priority:i[1],evidence:i[2],title:i[3],current:i[4],proposal:i[5],acceptance:i[6],source:source(i)}))},null,2));

const run=(text,opts={})=>new TextRun({text:String(text),font:'Microsoft YaHei',size:21,...opts});
const para=(text,opts={})=>new Paragraph({children:[run(text)],spacing:{after:120,line:320},...opts});
const children=[new Paragraph({children:[run('SUOHA / ENGINEERING REVIEW',{size:22,color:'647E53'})],spacing:{before:700,after:280}}),new Paragraph({children:[run('全模块审查与修改建议',{size:48,bold:true,color:'29442E'})],spacing:{after:350}}),para('2026-10-12 · 当前工作区 · 桌面 / 手机端'),para('13 个模块 · 52 条问题与建议 · P1 17 条 / P2 35 条'),para('交互 / UI / 功能逻辑 / 数据联动 / 按钮与弹窗设计'),para('审查方式：代码分析 + 本地只读浏览器巡检 + 现有自动化回归。'),para('本报告是修改建议与验收依据，不是生产环境全功能验收通过证明。')];
children.push(new Paragraph({heading:HeadingLevel.HEADING_1,text:'阅读导航',pageBreakBefore:true}));
for(const b of blocks.filter(b=>b.type==='h'&&b.level<=2))children.push(para((b.level===2?'    ':'')+b.text,{spacing:{after:50,line:260}}));
for(const b of blocks){if(b.type==='h'){children.push(new Paragraph({text:b.text,heading:[null,HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3][b.level],pageBreakBefore:b.level===1||b.type==='h'&&/^\d{2} /.test(b.text),keepNext:true,spacing:{before:220,after:130}}));}else if(b.type==='p'){children.push(para(b.text));}else if(b.type==='table'){const widths=b.heads.length===2?[2300,7200]:b.heads.length===3?[1800,2200,5500]:[1350,2450,2300,3400];children.push(new Table({width:{size:9500,type:WidthType.DXA},columnWidths:widths,rows:[b.heads,...b.rows].map((r,j)=>new TableRow({tableHeader:j===0,children:r.map((c,i)=>new TableCell({width:{size:widths[i],type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:j===0?'E7EEDC':j%2===0?'F7F9F3':'FFFFFF'},margins:{top:90,bottom:90,left:100,right:100},children:[new Paragraph({children:[run(c,{size:18,bold:j===0})],spacing:{after:50,line:265}})]}))}))}));children.push(para(''));}else{const data=fs.readFileSync(path.join(__dirname,b.file)),w=data.readUInt32BE(16),ht=data.readUInt32BE(20),scale=Math.min(590/w,680/ht);children.push(new Paragraph({children:[new ImageRun({type:'png',data,transformation:{width:Math.round(w*scale),height:Math.round(ht*scale)}})],alignment:AlignmentType.CENTER}));children.push(para(b.caption,{alignment:AlignmentType.CENTER}));}}
const doc=new Document({
 creator:'Codex',title:'Suoha 全模块审查与修改建议',description:'2026-10-12 当前工作区审查，13 模块 52 项问题与建议',
 styles:{default:{document:{run:{font:'Microsoft YaHei',size:21},paragraph:{spacing:{line:320}}}}},
 sections:[{
  properties:{page:{size:{width:11906,height:16838},margin:{top:1050,bottom:1050,left:1200,right:1200}}},
  headers:{default:new Header({children:[para('SUOHA · 全模块审查与修改建议',{spacing:{after:60}})]})},
  footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[run('2026-10-12  |  '),new TextRun({children:[PageNumber.CURRENT]})]})]})},
  children
 }]
});
Packer.toBuffer(doc).then(buffer=>{fs.writeFileSync(path.join(out,'全模块审查与修改建议.docx'),buffer);fs.writeFileSync(path.join(out,'阅读说明.txt'),'优先打开 HTML 版，可离线查目录与问题编号；Word 版可编辑。\r\n共 13 模块、52 条建议。\r\n证据：../../../artifacts/audit-2026-10-12\r\n完整浏览器测试 68/70 通过，2 项旧 Esc 关闭断言需要更新。\r\nWord 未经 Office 引擎逐页渲染，详见报告末页。\r\n');console.log(JSON.stringify({output:out,findings:all.length,blocks:blocks.length,docxBytes:buffer.length}));}).catch(e=>{console.error(e);process.exitCode=1;});
