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
10. 严格按步骤工作。本次只完成action指定的一步，以上一步经用户确认或修改后的内容为依据，不提前重写后续步骤，也不擅自推翻用户已经修改的文字。

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
  messages?: Array<Record<string, unknown>>;
};

type RuntimeConfig = {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
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

function stringList(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : fallback;
}

function buildStoryboard(course: LooseCourse) {
  const topic = clean(course.brief?.topic) || extractTopic(course.rawTask || "") || "课程主题";
  const audience = clean(course.brief?.audience) || "参训学员";
  const modules = course.modules?.length ? course.modules : (mockOutline(course).modules as Array<Record<string, unknown>>);
  const activityList = Array.isArray(course.activities) ? course.activities as Array<Record<string, unknown>> : [];
  const directory = modules.map((module, index) => `${index + 1}. ${String(module.title || `模块${index + 1}`)}`);
  const slides: Array<Record<string, unknown>> = [
    {
      type: "封面",
      stage: "开场",
      title: topic,
      onScreen: [topic, "从课程任务，到可落地的工作行动", audience],
      visual: "深绿色全幅底色，中心大标题建立焦点，橙色短线作为品牌识别；背景使用简洁的信息流线条。",
      speaker: "用一句话说明课程与学员工作的关系，不急着讲知识点。",
      learner: "进入课程情境，知道今天要解决什么问题。",
      time: 1,
    },
    {
      type: "目录",
      stage: "导航",
      title: "课程地图",
      onScreen: directory,
      visual: "完整目录纵向排列，每章包含编号、问题式标题和预计时长；底部用细线串联学习路径。",
      speaker: "用全课鸟瞰图说明学习顺序，让学员知道每一章解决的问题。",
      learner: "建立全课结构感。",
      time: 2,
    },
  ];

  modules.forEach((module, index) => {
    const moduleId = clean(module.id) || `module-${index + 1}`;
    const title = String(module.title || `模块${index + 1}`);
    const question = String(module.question || "这一章要解决什么关键问题？");
    const contents = stringList(module.contents, ["关键概念", "判断标准", "行动方法"]).slice(0, 4);
    const activity = activityList.find((item) => String(item.module || "") === title) || {};
    const activityName = String(module.activity || activity.material || "情境练习");
    const output = String(module.output || "学习产出");
    const absorbType = index === modules.length - 1 ? "吸收·实践" : index % 2 ? "吸收·练习" : "吸收·思考";
    const currentDirectory = directory.map((item, directoryIndex) => directoryIndex === index ? `▶ ${item}` : item);

    slides.push(
      {
        moduleId,
        type: "章封面",
        stage: "过渡",
        title,
        onScreen: currentDirectory,
        visual: "保留完整目录，当前章使用橙色实心块突出，其余章节用低对比度灰绿色显示，右下角显示当前进度。",
        speaker: `从上一部分过渡到“${title}”，只点出本章要解决的问题。`,
        learner: "确认当前学习位置。",
        time: 1,
      },
      {
        moduleId,
        type: "小节封面",
        stage: "过渡",
        title: question,
        onScreen: [title, question],
        visual: "左侧大号问题标题，右侧用三张递进卡片预告本节内容，不展示答案。",
        speaker: "把本章内容转化为一个待解决的问题，激发学员带着问题听。",
        learner: "形成学习期待。",
        time: 1,
      },
      {
        moduleId,
        type: "激活",
        stage: "激活",
        title: "先判断：你会怎么做？",
        onScreen: [question, "请先独立判断", "再与同伴核对理由"],
        visual: "页面中间放一个真实工作情境卡，右侧留出选择区或理由区，答案暂不出现。",
        speaker: String(activity.activate || "给出一个与本章相关的典型场景，请学员先判断再表达理由。"),
        learner: "独立思考并说出初步判断。",
        time: 5,
      },
      {
        moduleId,
        type: "讲解",
        stage: "讲解",
        title: `${title}：抓住这些要点`,
        onScreen: contents,
        visual: "把知识点整理成清单或流程图；每个要点只保留关键词，旁边配一个简洁例子。",
        speaker: String(activity.explain || "围绕关键问题讲清最少必要的概念、规则、步骤和判断依据。"),
        learner: "记录关键要点，并对照自己的工作场景。",
        time: Number(module.time || 20) > 35 ? 10 : 7,
      },
      {
        moduleId,
        type: absorbType,
        stage: "吸收",
        title: `完成产出：${output}`,
        onScreen: ["任务", activityName, "产出", output, "按标准自查"],
        visual: "左侧显示任务步骤，右侧显示学员产出模板；底部放评价标准，不把答案一次性铺满。",
        speaker: String(activity.absorb || "布置一个必须有产出的练习，并用清晰标准组织自查、互查和讲师点评。"),
        learner: `完成“${output}”，并根据标准修正。`,
        time: Number(module.time || 20) > 35 ? 12 : 7,
      },
    );
  });

  slides.push(
    {
      type: "总结",
      stage: "总结",
      title: "一张图带走全课",
      onScreen: ["关键问题", "核心方法", "典型场景", "岗位行动"],
      visual: "用知识地图把各章串联起来，中心放课程主题，四周连接关键问题、方法、场景和行动。",
      speaker: "用提问方式让学员补全知识地图，不重新讲一遍。",
      learner: "回忆并说出全课最重要的三个收获。",
      time: 5,
    },
    {
      type: "收尾",
      stage: "结束",
      title: "从明天开始，改变一个动作",
      onScreen: ["我最需要警惕的场景是……", "我要停止的一个动作是……", "我要开始坚持的一个动作是……"],
      visual: "留白为主的行动卡页面，底部用细线连接“今天学习”和“明天行动”。",
      speaker: "请学员完成个人行动卡，可邀请自愿分享，并说明后续资料或提醒安排。",
      learner: "写下一个可执行的岗位行动。",
      time: 4,
    },
  );

  return { slides: slides.map((slide, index) => ({ ...slide, id: `slide-${index + 1}` })) };
}

function storyboardSection(course: LooseCourse, moduleId: string) {
  const allSlides = buildStoryboard(course).slides;
  const selected = allSlides.filter((slide) => clean(slide.moduleId) === moduleId);
  return { slides: selected.length ? selected : allSlides.filter((slide) => Boolean(slide.moduleId)).slice(0, 5) };
}

function mockResponse(action: string, course: LooseCourse, message: string, moduleId = "") {
  if (action === "intake") return mockIntake(course, message);
  if (action === "goals") return mockGoals(course);
  if (action === "outline") return mockOutline(course);
  if (action === "activities") return mockActivities(course);
  if (action === "storyboard") return buildStoryboard(course);
  if (action === "storyboard-section") return storyboardSection(course, moduleId);
  return { error: "未知生成任务" };
}

function attachmentContext(course: LooseCourse) {
  let remaining = 24000;
  return (course.attachments || []).slice(0, 6).map((file) => {
    const source = typeof file.text === "string" ? file.text.trim() : "";
    const text = source.slice(0, Math.min(8000, remaining));
    remaining -= text.length;
    return { name: clean(file.name), type: clean(file.type), text: text || undefined };
  });
}

function stageContext(action: string, course: LooseCourse, message: string, moduleId: string) {
  const common = {
    rawTask: clean(course.rawTask),
    brief: course.brief || {},
    courseType: clean(course.courseType),
    mainline: clean(course.mainline),
  };
  if (action === "intake") return {
    ...common,
    message,
    recentConversation: (course.messages || []).slice(-6).map((item) => ({ role: clean(item.role), text: clean(item.text).slice(0, 1000) })),
    attachmentNames: (course.attachments || []).slice(0, 10).map((file) => clean(file.name)).filter(Boolean),
  };
  if (action === "goals") return {
    ...common,
    landing: course.landing || [],
    outcomeNote: clean(course.outcomeNote),
  };
  if (action === "outline") return {
    ...common,
    goals: course.goals || [],
    attachments: attachmentContext(course),
  };
  if (action === "activities") return {
    ...common,
    goals: course.goals || [],
    modules: course.modules || [],
  };
  if (action === "storyboard-section") return {
    ...common,
    goals: course.goals || [],
    modules: course.modules || [],
    activities: course.activities || [],
    targetModuleId: moduleId,
    targetModule: (course.modules || []).find((item) => clean(item.id) === moduleId) || null,
  };
  return common;
}

function parseJson(text: string) {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const cleaned = withoutThinking.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) as Record<string, unknown>; } catch { /* 尝试常见尾逗号修复 */ }
    try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>; } catch { /* 交由自动重试 */ }
  }
  throw new Error("模型返回的 JSON 不完整");
}

function resolveEndpoint(baseUrl: string) {
  const allowedHosts = new Set([
    "api.minimaxi.com",
    "api.minimax.io",
    "api.openai.com",
    ...clean(process.env.LLM_ALLOWED_HOSTS).split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
  ]);
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("接口地址格式不正确"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("接口地址必须使用安全的 HTTPS 地址");
  if (!allowedHosts.has(url.hostname.toLowerCase())) throw new Error("该接口域名尚未加入站点安全名单");
  const normalized = url.toString().replace(/\/$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function providerErrorMessage(status: number, detail: string) {
  const safeDetail = detail.replace(/[\r\n]+/g, " ").slice(0, 220);
  return `模型接口返回 ${status}${safeDetail ? `：${safeDetail}` : ""}`;
}

type ChatMessage = {
  content?: string | Array<{ text?: string; type?: string }>;
};

function readMessageContent(message?: ChatMessage) {
  if (!message?.content) return "";
  if (typeof message.content === "string") return message.content.trim();
  return message.content.map((part) => part.text || "").join("").trim();
}

function boundedText(value: unknown, fallback = "", max = 800) {
  const text = clean(value) || fallback;
  return text.slice(0, max);
}

function boundedNumber(value: unknown, fallback: number, min = 0, max = 240) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeResult(action: string, result: Record<string, unknown>, course: LooseCourse, moduleId: string) {
  if (action === "intake") {
    const briefPatch = typeof result.briefPatch === "object" && result.briefPatch ? result.briefPatch as Record<string, unknown> : {};
    return {
      message: boundedText(result.message, "我已经整理了课程任务，请确认课程任务卡。", 900),
      courseType: boundedText(result.courseType, clean(course.courseType), 80),
      mainline: boundedText(result.mainline, clean(course.mainline), 180),
      suggestedLanding: stringList(result.suggestedLanding).filter((item) => ["know", "judge", "do", "improve"].includes(item)).slice(0, 4),
      briefPatch: Object.fromEntries(["topic", "audience", "duration", "format", "scope"].map((key) => [key, boundedText(briefPatch[key], "", key === "scope" ? 500 : 120)])),
    };
  }
  if (action === "goals") {
    const generated = Array.isArray(result.goals) ? result.goals.slice(0, 5) : [];
    const fallbackGoals = mockGoals(course).goals;
    const goals = generated.length >= 3 ? generated : [...generated, ...fallbackGoals.slice(generated.length, 3)];
    return { goals: goals.map((item, index) => {
      const goal = typeof item === "object" && item ? item as Record<string, unknown> : {};
      return { id: `goal-${index + 1}`, text: boundedText(goal.text, "待完善的课程目标", 700), evidence: boundedText(goal.evidence, "待补充达标证据", 400) };
    }) };
  }
  if (action === "outline") {
    const modules = Array.isArray(result.modules) ? result.modules.slice(0, 7) : [];
    return { modules: modules.map((item, index) => {
      const courseModule = typeof item === "object" && item ? item as Record<string, unknown> : {};
      return {
        id: `module-${index + 1}`,
        title: boundedText(courseModule.title, `模块${index + 1}`, 120),
        question: boundedText(courseModule.question, "这一部分要解决什么关键问题？", 260),
        contents: stringList(courseModule.contents, ["待完善知识点"]).slice(0, 8).map((text) => text.slice(0, 120)),
        time: boundedNumber(courseModule.time, 25, 5, 180),
        activity: boundedText(courseModule.activity, "待设计活动", 180),
        output: boundedText(courseModule.output, "待明确学员产出", 180),
      };
    }) };
  }
  if (action === "activities") {
    const generated = Array.isArray(result.activities) ? result.activities.slice(0, 7) : [];
    const fallbackActivities = mockActivities(course).activities;
    const targetCount = Math.max(1, Math.min(7, course.modules?.length || generated.length || fallbackActivities.length));
    const activities = Array.from({ length: targetCount }, (_, index) => generated[index] || fallbackActivities[index] || {});
    return { activities: activities.map((item, index) => {
      const activity = typeof item === "object" && item ? item as Record<string, unknown> : {};
      const linkedModule = course.modules?.[index];
      return {
        id: `activity-${index + 1}`,
        module: boundedText(activity.module, clean(linkedModule?.title) || `模块${index + 1}`, 120),
        activate: boundedText(activity.activate, "先让学员作出判断并说明理由。", 700),
        explain: boundedText(activity.explain, "讲清必要的规则、步骤和判断依据。", 700),
        absorb: boundedText(activity.absorb, "完成一项有明确产出的练习。", 700),
        feedback: boundedText(activity.feedback, "依据标准自查、互查并获得讲师反馈。", 500),
        material: boundedText(activity.material, "任务卡与评价表", 300),
      };
    }) };
  }
  if (action === "storyboard-section") {
    const generated = Array.isArray(result.slides) ? result.slides.slice(0, 6) : [];
    const fallbackSlides = storyboardSection(course, moduleId).slides;
    return { slides: fallbackSlides.map((fallbackSlide, index) => {
      const baseline = fallbackSlide as Record<string, unknown>;
      const item = generated[index] || baseline;
      const slide = typeof item === "object" && item ? item as Record<string, unknown> : {};
      return {
        id: `${moduleId || "module"}-slide-${index + 1}`,
        moduleId,
        type: boundedText(baseline.type, index === 0 ? "章封面" : "讲解", 40),
        stage: boundedText(baseline.stage, "讲解", 40),
        title: boundedText(slide.title, boundedText(baseline.title, "待完善页面标题", 180), 180),
        onScreen: stringList(slide.onScreen, stringList(baseline.onScreen, ["待完善屏上文字"])).slice(0, 8).map((text) => text.slice(0, 180)),
        visual: boundedText(slide.visual, boundedText(baseline.visual, "使用清晰的信息层级呈现。", 600), 600),
        speaker: boundedText(slide.speaker, boundedText(baseline.speaker, "围绕本页要点进行引导。", 700), 700),
        learner: boundedText(slide.learner, boundedText(baseline.learner, "理解并作出回应。", 400), 400),
        time: boundedNumber(slide.time, boundedNumber(baseline.time, 3, 0, 60), 0, 60),
      };
    }) };
  }
  return result;
}

function outputSchema(action: string) {
  if (action === "intake") return {
    message: "给用户的简短回复",
    courseType: "课程类型",
    mainline: "课程主线",
    suggestedLanding: ["know", "judge", "do"],
    briefPatch: { topic: "课程主题", audience: "目标学员", duration: "时长", format: "授课形式", scope: "内容范围" },
  };
  if (action === "goals") return { goals: [{ id: "goal-1", text: "完整ABCD课程目标", evidence: "可观察的达标证据" }] };
  if (action === "outline") return { modules: [{ id: "module-1", title: "模块标题", question: "核心问题", contents: ["知识点1"], time: 25, activity: "活动", output: "学员产出" }] };
  if (action === "activities") return { activities: [{ id: "activity-1", module: "模块标题", activate: "激活活动", explain: "讲解方法", absorb: "吸收活动", feedback: "反馈标准", material: "所需材料" }] };
  if (action === "storyboard-section") return { slides: [{ id: "slide-1", moduleId: "目标模块ID", type: "章封面", stage: "过渡", title: "页面标题", onScreen: ["屏上全部文字"], visual: "视觉构图", speaker: "讲师提示", learner: "学员行为", time: 1 }] };
  if (action === "storyboard") return { slides: [{ id: "slide-1", type: "封面", stage: "开场", title: "页面标题", onScreen: ["屏上全部文字"], visual: "视觉构图", speaker: "讲师提示", learner: "学员行为", time: 1 }] };
  return {};
}

function assertExpectedResult(action: string, result: Record<string, unknown>) {
  const requiredKey: Record<string, string> = { intake: "briefPatch", goals: "goals", outline: "modules", activities: "activities", storyboard: "slides", "storyboard-section": "slides" };
  const key = requiredKey[action];
  if (key && !(key in result)) throw new Error(`模型没有按课程设计所需格式返回“${key}”，请重试`);
  if (key && key !== "briefPatch" && (!Array.isArray(result[key]) || result[key].length === 0)) throw new Error(`模型返回的“${key}”为空，请重试`);
}

async function requestModel(params: { apiKey: string; baseUrl: string; model: string; action: string; message: string; moduleId: string; course: LooseCourse }) {
  const endpoint = resolveEndpoint(params.baseUrl);
  const isMiniMax = new URL(endpoint).hostname.includes("minimax");
  const isMiniMaxM3 = isMiniMax && params.model.toLowerCase().includes("m3");
  const testing = params.action === "test";

  if (params.action === "storyboard") return buildStoryboard(params.course);

  const deadline = Date.now() + 24000;

  async function complete(userPayload: string, maxTokens: number) {
    const requestBody: Record<string, unknown> = {
      model: params.model,
      messages: [
        { role: "system", content: testing ? "你是接口连通性测试助手，只输出有效JSON。" : SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
    };
    if (isMiniMax) {
      requestBody.temperature = 0.3;
      if (isMiniMaxM3) requestBody.thinking = { type: "disabled" };
      requestBody.max_completion_tokens = Math.min(maxTokens, 2048);
    } else {
      requestBody.temperature = 0.35;
      requestBody.max_tokens = maxTokens;
    }
    const remaining = deadline - Date.now();
    if (remaining < 1500) throw new Error("模型响应超时");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(18000, remaining));
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.apiKey}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("模型响应超时");
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(providerErrorMessage(response.status, detail));
    }
    const result = await response.json() as { choices?: Array<{ finish_reason?: string; message?: ChatMessage }> };
    const choice = result.choices?.[0];
    const content = readMessageContent(choice?.message);
    if (!content) throw new Error("模型没有返回内容");
    return { content, finishReason: choice?.finish_reason || "" };
  }

  async function generateJson(userPayload: string, action: string, maxTokens: number) {
    let lastError = "模型返回内容不完整";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0 && deadline - Date.now() < 4500) break;
      const retryNote = attempt
        ? "\n上一次输出被截断或JSON格式不正确。本次务必缩短文字、正确转义引号，并完整闭合所有数组和对象。只输出JSON。"
        : "";
      try {
        const completion = await complete(`${userPayload}${retryNote}`, maxTokens);
        if (completion.finishReason === "length") throw new Error("模型输出达到长度上限");
        const parsed = parseJson(completion.content);
        assertExpectedResult(action, parsed);
        return normalizeResult(action, parsed, params.course, params.moduleId);
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (/模型接口返回|模型响应超时/.test(lastError)) throw error;
      }
    }
    throw new Error(`${lastError}。系统已自动重试，请再试一次或换用输出上限更高的模型。`);
  }

  if (testing) return generateJson("请只返回这个JSON对象，不要添加解释：{\"ok\":true}", "test", 80);

  const tokenBudget: Record<string, number> = { intake: 650, goals: 1100, outline: 1500, activities: 1700, "storyboard-section": 1700 };
  const userPayload = JSON.stringify({
    action: params.action,
    message: params.message,
    confirmedContext: stageContext(params.action, params.course, params.message, params.moduleId),
    outputSchema: outputSchema(params.action),
    outputRules: "只完成当前action；confirmedContext是用户已经确认或手动修改后的唯一依据；必须严格使用outputSchema中的英文键名；不要增加顶层字段；每个文字字段保持简洁；只输出一个完整有效的JSON对象。",
  });
  return generateJson(userPayload, params.action, tokenBudget[params.action] || 1200);
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.LLM_API_KEY), model: process.env.LLM_MODEL || "" });
}

export async function POST(request: Request) {
  const body = await request.json() as { action?: string; course?: LooseCourse; message?: string; moduleId?: string; runtimeConfig?: RuntimeConfig };
  const action = clean(body.action);
  const course = body.course || {};
  const message = clean(body.message);
  const moduleId = clean(body.moduleId);
  const runtimeConfig = body.runtimeConfig;
  const personalApiKey = clean(runtimeConfig?.apiKey);
  const personalBaseUrl = clean(runtimeConfig?.baseUrl);
  const personalModel = clean(runtimeConfig?.model);
  const apiKey = personalApiKey || clean(process.env.LLM_API_KEY);
  const allowedActions = new Set(["test", "intake", "goals", "outline", "activities", "storyboard", "storyboard-section"]);

  if (!allowedActions.has(action)) return NextResponse.json({ error: "未知生成任务" }, { status: 400 });
  if (action === "storyboard-section" && !moduleId) return NextResponse.json({ error: "缺少要生成的课程模块" }, { status: 400 });

  if (runtimeConfig && (!personalApiKey || !personalBaseUrl || !personalModel)) {
    return NextResponse.json({ error: "请把 API 密钥、接口地址和模型名称填写完整" }, { status: 400 });
  }

  if (runtimeConfig) {
    try { resolveEndpoint(personalBaseUrl); } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "接口地址不可用" }, { status: 400 });
    }
  }

  if (!apiKey) {
    if (action === "test") return NextResponse.json({ error: "请先填写 API 密钥" }, { status: 400 });
    return NextResponse.json({ ...mockResponse(action, course, message, moduleId), mode: "demo" });
  }

  const baseUrl = personalBaseUrl || clean(process.env.LLM_BASE_URL) || "https://api.openai.com/v1";
  const model = personalModel || clean(process.env.LLM_MODEL) || "gpt-4.1-mini";

  try {
    const result = await requestModel({ apiKey, baseUrl, model, action, message, moduleId, course });
    if (action === "test") return NextResponse.json({ ok: true, mode: "ai", model });
    return NextResponse.json({ ...result, mode: action === "storyboard" ? "structured" : "ai" });
  } catch (error) {
    if (action === "test") {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型连接失败" }, { status: 502 });
    }
    const fallback = mockResponse(action, course, message, moduleId);
    const warning = runtimeConfig ? "模型暂时没有返回有效内容，已先按内置课程方法生成可编辑初稿。" : undefined;
    return NextResponse.json({ ...fallback, mode: "fallback", warning });
  }
}
