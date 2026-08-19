import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `你是“知课”企业内训课程设计助手。你帮助企业内训师从一句模糊任务出发，逐步形成可评价的课程目标、课程结构、教学活动、整课编排和制作级PPT逐页方案。

工作原则：
1. 默认轻量进入，不强迫用户先填写业务问题。根据课程落点判断是否需要展开：知识讲解看关键认知，判断课程看典型场景，技能课程看关键任务，问题改善课程才分析业务问题和培训边界。
2. 设计所需信息不等于用户必填表单。优先从用户描述和资料中提取，给出有依据的建议，再请用户确认。
3. ABCD目标中：A是学员，B是可观察行为，C是完成行为时的情境、工具或限制，D是达标程度。培训时长不写进C。
4. 区分企业结果、岗位表现和学习目标，不承诺培训单独改变经营结果。
5. 不使用学习金字塔固定百分比；活动遵循全员参与、相互学习、关联内容、身心合力、激发信心。
6. 核心知识或技能使用“激活—讲解—吸收”闭环，吸收必须有学员产出和反馈标准。
7. 知识包装分两层：先识别并列、顺序、对比、层级、因果、二维交叉、空间组成等关系，再选择清单、表格、流程、模型、矩阵、示意图、口诀、决策树或检查表等形式。
8. 不编造企业制度、法规条文、事故数据和操作标准。资料不足时明确标为待核实。
9. PPT逐页方案必须包括页面类型、标题、全部屏上文字、视觉构图、讲师提示、学员行为和时间；页面类型覆盖封面、目录、章封面（完整目录中突出当前章）、小节封面、激活、讲解、吸收·思考、吸收·练习、吸收·实践、总结和收尾。

根据action只输出JSON，不要输出Markdown或解释。字段必须与请求所需的结构一致。`;

type LooseCourse = {
  rawTask?: string;
  brief?: Record<string, string>;
  landing?: string[];
  outcomeNote?: string;
  courseType?: string;
  mainline?: string;
  goals?: unknown[];
  modules?: Array<Record<string, unknown>>;
  activities?: unknown[];
  attachments?: Array<Record<string, unknown>>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractTopic(raw: string) {
  if (raw.includes("信息保密")) return "信息保密";
  const match = raw.match(/(?:做|开发|设计|讲)(?:一个|一门|一次)?(.{2,28}?)(?:的)?(?:培训)?课程/);
  if (match?.[1]) return match[1].replace(/^关于/, "").trim();
  return raw.replace(/[。！!]/g, "").replace(/^(领导让我|我想|我要|需要)/, "").slice(0, 24) || "未命名课程";
}

function parseDuration(raw: string) {
  return raw.match(/\d+(?:\.\d+)?\s*(?:分钟|小时|天)/)?.[0]?.replace(/\s/g, "") || "";
}

function parseAudience(raw: string) {
  const known = ["全体员工", "新员工", "管理人员", "班组长", "安全管理人员", "涉密岗位", "一线员工"];
  return known.find((item) => raw.includes(item)) || "";
}

function mockIntake(course: LooseCourse, message: string) {
  const combined = [course.rawTask, message].filter(Boolean).join("\n");
  const topic = clean(course.brief?.topic) || extractTopic(combined);
  const audience = parseAudience(combined) || clean(course.brief?.audience);
  const duration = parseDuration(combined) || clean(course.brief?.duration);
  const format = ["线下", "线上", "直播", "录播", "混合"].find((item) => combined.includes(item)) || clean(course.brief?.format);
  const confidentiality = topic.includes("保密");
  const improvement = /改善|降低|减少|问题|事故|投诉|错误/.test(combined);
  const skill = /操作|使用|开展|制作|编写|处置|流程/.test(combined);
  const courseType = improvement ? "问题改善型课程" : skill ? "任务技能型课程" : confidentiality ? "规则认知＋情境判断＋基本行动型课程" : "知识理解＋情境应用型课程";
  const mainline = confidentiality ? "识别保密信息 → 判断泄密风险 → 采取正确行动" : `理解${topic} → 判断典型情境 → 应用到工作`;
  const missing = [!audience && "目标学员", !duration && "培训时长", !format && "授课形式"].filter(Boolean);
  const messageText = missing.length
    ? `我先把这项任务定位为“${courseType}”。建议主线是“${mainline}”。目前不用解释业务问题，只要继续确认${missing.join("、")}；暂时不确定也可以留空，由系统先给建议。`
    : `课程基本条件已经比较清楚。我建议把它定位为“${courseType}”，主线采用“${mainline}”。下一步可以直接确定学员学完后的变化。`;
  return {
    message: messageText,
    courseType,
    mainline,
    suggestedLanding: confidentiality ? ["know", "judge", "do"] : skill ? ["judge", "do"] : improvement ? ["judge", "do", "improve"] : ["know", "judge"],
    briefPatch: { topic, audience, duration, format, scope: confidentiality ? "企业信息保密范围与现行制度（待资料核实）" : clean(course.brief?.scope) },
  };
}

function mockGoals(course: LooseCourse) {
  const topic = clean(course.brief?.topic) || "本课程主题";
  const audience = clean(course.brief?.audience) || "参训学员";
  if (topic.includes("保密")) return {
    goals: [
      { id: "goal-1", text: `给出日常工作中的信息样例和企业保密规则，${audience}能够识别需要保护的信息，并说明相应的使用边界。`, evidence: "完成信息分类与规则匹配练习，关键项判断正确。" },
      { id: "goal-2", text: `面对文件发送、会议交流、移动设备使用等典型情境，${audience}能够发现可能导致泄密的行为，并选择符合企业规定的做法。`, evidence: "完成情境辨析题，并能说明判断依据。" },
      { id: "goal-3", text: `给定一项信息接收、存储、传递、销毁或异常报告任务，${audience}能够使用企业流程或检查表完成处理，不遗漏关键步骤。`, evidence: "完成一次情境化操作练习，通过流程检查表评价。" },
    ],
  };
  return {
    goals: [
      { id: "goal-1", text: `给出${topic}的核心材料和典型案例，${audience}能够解释关键概念、规则及其适用边界。`, evidence: "完成概念与规则匹配练习。" },
      { id: "goal-2", text: `面对与${topic}有关的典型工作情境，${audience}能够识别问题并选择正确处理方法。`, evidence: "完成情境判断任务并说明依据。" },
      { id: "goal-3", text: `给定必要的工具、步骤或检查表，${audience}能够完成一项与${topic}有关的应用任务。`, evidence: "提交任务成果并按评价标准检查。" },
    ],
  };
}

function mockOutline(course: LooseCourse) {
  const topic = clean(course.brief?.topic) || "课程主题";
  if (topic.includes("保密")) return {
    modules: [
      { id: "module-1", title: "边界：什么信息需要保密", question: "日常工作中，哪些信息不能凭感觉处理？", contents: ["保密信息范围", "分类分级依据", "员工责任与使用边界"], time: 25, activity: "信息卡片分类", output: "个人保密信息识别清单" },
      { id: "module-2", title: "场景：泄密风险藏在哪里", question: "看似正常的工作动作，为什么可能带来泄密？", contents: ["办公与会议", "邮件与即时通信", "移动设备与外部协作"], time: 35, activity: "找错式情境辨析", output: "典型风险判断记录" },
      { id: "module-3", title: "行动：信息全生命周期怎么做", question: "从接收到销毁，每一步应该守住什么？", contents: ["接收与存储", "传递与共享", "销毁与异常报告"], time: 45, activity: "流程排序＋桌面推演", output: "信息处理行动卡" },
      { id: "module-4", title: "迁移：把保密要求带回岗位", question: "回到自己的岗位，最需要改变哪个动作？", contents: ["全课知识地图", "岗位风险自查", "行动承诺"], time: 15, activity: "一分钟行动计划", output: "个人岗位保密行动项" },
    ],
  };
  return {
    modules: [
      { id: "module-1", title: `为什么要理解${topic}`, question: "这项内容与日常工作有什么关系？", contents: ["课程边界", "关键概念", "常见误区"], time: 20, activity: "经验唤醒", output: "个人问题清单" },
      { id: "module-2", title: `${topic}的核心方法`, question: "完成正确判断或行动，需要哪些规则和步骤？", contents: ["总体模型", "关键步骤", "判断标准"], time: 40, activity: "案例拆解", output: "方法模型记录" },
      { id: "module-3", title: `${topic}的场景应用`, question: "换到真实工作场景，还能不能做对？", contents: ["典型场景", "常见错误", "例外与边界"], time: 45, activity: "情境练习", output: "练习成果" },
      { id: "module-4", title: "总结与岗位行动", question: "明天回到岗位先改变什么？", contents: ["知识地图", "自查清单", "行动计划"], time: 15, activity: "提取回顾", output: "岗位行动项" },
    ],
  };
}

function mockActivities(course: LooseCourse) {
  const modules = course.modules?.length ? course.modules : (mockOutline(course).modules as Array<Record<string, unknown>>);
  return {
    activities: modules.map((module, index) => ({
      id: `activity-${index + 1}`,
      module: String(module.title || `模块${index + 1}`),
      activate: index === 0 ? "展示一个容易产生分歧的真实工作情境，让全员先独立判断，再快速统计选择。" : "调用上一模块产出或给出一个新情境，要求学员先说出自己的处理方式。",
      explain: `围绕“${String(module.question || "核心问题")}”讲清最少必要的规则、步骤和判断依据，并用正反例对照。`,
      absorb: index === modules.length - 1 ? "完成岗位行动计划：写下一个风险点、一个具体改变和一个开始时间。" : index % 2 ? "小组完成场景任务，使用给定标准作出判断并说明理由。" : "个人完成要点提取或卡片分类，再与同伴核对差异。",
      feedback: "公布参考标准，先由学员自查，再由同伴补充，讲师只点评关键分歧和高风险错误。",
      material: index === 0 ? "情境投票卡＋答案页" : index % 2 ? "场景任务卡＋评价表" : "分类卡＋知识清单",
    })),
  };
}

function mockStoryboard(course: LooseCourse) {
  const topic = clean(course.brief?.topic) || "课程主题";
  const modules = course.modules?.length ? course.modules : (mockOutline(course).modules as Array<Record<string, unknown>>);
  const m1 = String(modules[0]?.title || "认识主题");
  const m2 = String(modules[1]?.title || "理解方法");
  const m3 = String(modules[2]?.title || "场景应用");
  const directory = [m1, m2, m3, String(modules[3]?.title || "总结行动")];
  const chapterVisual = (current: string) => `页面保留完整四章目录，${current}使用橙色实心块突出，其余章节以低对比度灰绿色显示；右下角显示当前进度。`;
  return {
    slides: [
      { id: "s1", type: "封面", stage: "开场", title: topic, onScreen: [topic, "从知道要求，到工作中做出正确选择", "企业内训课程"], visual: "深绿色全幅底色，中央以大标题建立焦点；橙色方块作为品牌识别，背景用抽象信息流线条，不使用无关人物照片。", speaker: "简短自我介绍，只说明本课程与日常工作的关系。", learner: "进入课程情境。", time: 1 },
      { id: "s2", type: "开场", stage: "激活", title: "这几个日常动作，哪个最危险？", onScreen: ["把文件发到个人邮箱", "会议后把材料留在桌面", "在群聊中转发内部截图", "使用公共工具处理工作文件"], visual: "四张等宽情境卡，先只显示行为，不显示答案；点击后逐项出现风险标记。", speaker: "请学员独立选择，不急着公布答案，观察分歧。", learner: "举手或扫码选择风险最高的行为。", time: 5 },
      { id: "s3", type: "开场", stage: "讲解", title: "今天，我们练会三件事", onScreen: ["识别：哪些信息需要保护", "判断：哪些行为可能带来风险", "行动：遇到情境时应该怎么做"], visual: "三段式箭头从左向右递进，识别、判断、行动分别用眼睛、分岔、检查标记的简洁图标表达。", speaker: "说明课程边界：面向全员的基本判断与行动，不替代涉密岗位专项操作培训。", learner: "了解课程目标和边界。", time: 3 },
      { id: "s4", type: "目录", stage: "导航", title: "课程地图", onScreen: directory, visual: "四章目录纵向排列，每章用编号、问题式标题和预计时间组成；底部用一条细线串联。", speaker: "用一句话介绍每章要解决的问题。", learner: "建立全课鸟瞰图。", time: 2 },
      { id: "s5", type: "章封面", stage: "过渡", title: m1, onScreen: directory, visual: chapterVisual(m1), speaker: "从开场分歧过渡到第一章。", learner: "定位当前章节。", time: 1 },
      { id: "s6", type: "小节封面", stage: "过渡", title: "先划清边界，再谈正确行动", onScreen: ["不是所有信息都同等敏感", "不能只凭个人感觉判断"], visual: "大标题居左，右侧用由浅到深的三层信息卡表现保护程度差异。", speaker: "提出本节核心问题，不展开细节。", learner: "带着问题进入学习。", time: 1 },
      { id: "s7", type: "激活", stage: "激活", title: "请给这些信息分分类", onScreen: ["客户名单", "公开宣传册", "内部会议纪要", "尚未发布的经营数据", "个人联系方式"], visual: "五张可移动卡片，下方设置“可公开／内部使用／需重点保护”三个暂定区域，并标注最终分类以企业制度为准。", speaker: "组织个人判断后小组核对，收集分歧最大的卡片。", learner: "完成信息卡片分类并说明依据。", time: 7 },
      { id: "s8", type: "讲解", stage: "讲解", title: "识别信息，先看三个判断点", onScreen: ["来源：信息从哪里产生", "影响：外泄会造成什么后果", "规则：企业如何分类和授权"], visual: "三个同心圆形成识别模型，中心为规则，外圈依次是来源与影响；侧边保留“待企业制度核实”提示。", speaker: "结合用户提供的制度替换通用示例，不自行编造密级。", learner: "记录本企业的判断依据。", time: 9 },
      { id: "s9", type: "吸收·思考", stage: "吸收", title: "为什么它需要保护？", onScreen: ["任选一张信息卡", "写出你的判断", "说明依据和可能后果"], visual: "左侧任务指令，右侧三格思考模板：我的判断／我的依据／可能后果。", speaker: "邀请两名学员表达，按判断依据而不是标准答案点评。", learner: "独立写下判断并口头解释。", time: 5 },
      { id: "s10", type: "章封面", stage: "过渡", title: m2, onScreen: directory, visual: chapterVisual(m2), speaker: "由信息边界过渡到高频工作场景。", learner: "定位当前章节。", time: 1 },
      { id: "s11", type: "讲解", stage: "讲解", title: "风险通常发生在信息流动的过程中", onScreen: ["接收", "存储", "使用", "传递", "销毁", "异常报告"], visual: "一条从接收到报告的信息生命周期流程，风险点用橙色提示点标在流程节点下方。", speaker: "逐步揭示流程，只讲与全体员工共同工作场景有关的行为。", learner: "对照自己的工作寻找高频节点。", time: 10 },
      { id: "s12", type: "吸收·练习", stage: "吸收", title: "找出场景里的风险动作", onScreen: ["阅读场景", "圈出风险动作", "写出正确做法", "小组形成一致答案"], visual: "左侧呈现办公室综合情境图，右侧为风险动作与正确做法两列表格；答案在下一次点击后出现。", speaker: "按任务、时间、步骤、产出四项说明活动；巡视时不提前给答案。", learner: "小组完成找错和纠正建议。", time: 12 },
      { id: "s13", type: "章封面", stage: "过渡", title: m3, onScreen: directory, visual: chapterVisual(m3), speaker: "从发现风险进入完整处理练习。", learner: "定位当前章节。", time: 1 },
      { id: "s14", type: "吸收·实践", stage: "吸收", title: "完成一次信息处理桌面推演", onScreen: ["任务：处理一份需要跨部门协作的内部文件", "产出：处理流程＋关键控制点＋异常报告方式", "标准：不遗漏检查表中的关键步骤"], visual: "中央为任务流程画布，四周放置角色卡、文件卡、工具卡和异常事件卡；右下角显示15分钟倒计时。", speaker: "分发任务卡，结束后依据企业流程检查表反馈；没有企业流程时明确标注为待核实草案。", learner: "小组完成流程推演并展示成果。", time: 18 },
      { id: "s15", type: "总结", stage: "总结", title: "一张图带走：识别、判断、行动", onScreen: ["识别：这是什么信息", "判断：现在能不能这样处理", "行动：按规则处理，异常立即报告"], visual: "三层环形知识地图，中间放“保护信息”，外围依次连接识别、判断、行动；右侧列出三条自检问题。", speaker: "不重新讲课，用提问让学员共同补全知识地图。", learner: "闭卷说出三个关键词及其含义。", time: 5 },
      { id: "s16", type: "收尾", stage: "收尾", title: "从明天开始，改变一个动作", onScreen: ["我最需要警惕的场景是……", "我要停止的一个动作是……", "我要开始坚持的一个动作是……"], visual: "留白为主的行动卡页面，底部用细线连接“今天学习”与“明天行动”。", speaker: "给学员一分钟完成行动卡，可邀请自愿分享；说明后续自查或提醒安排。", learner: "完成个人岗位行动承诺。", time: 4 },
      { id: "s17", type: "收尾", stage: "结束", title: "保护信息，也是保护我们的工作", onScreen: ["谢谢参与", "请带走你的信息处理行动卡"], visual: "深绿色结束页，橙色细线形成闭合保护框，保持与封面一致。", speaker: "致谢并说明课程材料和咨询渠道。", learner: "带走岗位辅助材料。", time: 1 },
    ],
  };
}

function mockResponse(action: string, course: LooseCourse, message: string) {
  if (action === "intake") return mockIntake(course, message);
  if (action === "goals") return mockGoals(course);
  if (action === "outline") return mockOutline(course);
  if (action === "activities") return mockActivities(course);
  if (action === "storyboard") return mockStoryboard(course);
  return { error: "未知生成任务" };
}

function compactCourse(course: LooseCourse) {
  return {
    ...course,
    attachments: (course.attachments || []).map((file) => ({
      name: file.name,
      type: file.type,
      text: typeof file.text === "string" ? file.text.slice(0, 12000) : undefined,
    })),
  };
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as Record<string, unknown>;
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.LLM_API_KEY), model: process.env.LLM_MODEL || "" });
}

export async function POST(request: Request) {
  const body = await request.json() as { action?: string; course?: LooseCourse; message?: string };
  const action = clean(body.action);
  const course = body.course || {};
  const message = clean(body.message);
  const apiKey = clean(process.env.LLM_API_KEY);

  if (!apiKey) return NextResponse.json({ ...mockResponse(action, course, message), mode: "demo" });

  const baseUrl = clean(process.env.LLM_BASE_URL) || "https://api.openai.com/v1";
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const model = clean(process.env.LLM_MODEL) || "gpt-4.1-mini";
  const userPayload = JSON.stringify({ action, message, course: compactCourse(course) });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
      }),
    });
    if (!response.ok) throw new Error(`模型接口返回 ${response.status}`);
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型没有返回内容");
    return NextResponse.json({ ...parseJson(content), mode: "ai" });
  } catch {
    return NextResponse.json({ ...mockResponse(action, course, message), mode: "fallback" });
  }
}
