"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type LandingKey = "know" | "judge" | "do" | "improve";

type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  text?: string;
};

type Goal = { id: string; text: string; evidence: string };
type Module = {
  id: string;
  title: string;
  question: string;
  contents: string[];
  time: number;
  activity: string;
  output: string;
};
type Activity = {
  id: string;
  module: string;
  activate: string;
  explain: string;
  absorb: string;
  feedback: string;
  material: string;
};
type Slide = {
  id: string;
  type: string;
  stage: string;
  title: string;
  onScreen: string[];
  visual: string;
  speaker: string;
  learner: string;
  time: number;
};
type Message = { id: string; role: "user" | "assistant"; text: string };

type CourseState = {
  phase: StageId;
  completed: StageId[];
  rawTask: string;
  messages: Message[];
  brief: {
    topic: string;
    audience: string;
    duration: string;
    format: string;
    learningFocus: string;
    scope: string;
    source: string;
    deliverable: string;
  };
  courseType: string;
  mainline: string;
  landing: LandingKey[];
  outcomeNote: string;
  attachments: Attachment[];
  goals: Goal[];
  modules: Module[];
  activities: Activity[];
  slides: Slide[];
};

const stages: { id: StageId; number: string; label: string; short: string }[] = [
  { id: 1, number: "01", label: "课程任务", short: "一句话也能开始" },
  { id: 2, number: "02", label: "学习落点", short: "知道·判断·会做" },
  { id: 3, number: "03", label: "课程目标", short: "ABCD可评价" },
  { id: 4, number: "04", label: "内容与结构", short: "萃取并搭骨架" },
  { id: 5, number: "05", label: "教学活动", short: "激活·讲解·吸收" },
  { id: 6, number: "06", label: "整课编排", short: "时间与材料" },
  { id: 7, number: "07", label: "PPT逐页方案", short: "每一页都想清楚" },
];

const landingOptions: { key: LandingKey; title: string; verb: string; note: string }[] = [
  { key: "know", title: "听懂并记住", verb: "知道", note: "说出、解释、归纳关键内容" },
  { key: "judge", title: "能够判断选择", verb: "判断", note: "面对情境，按规则作出选择" },
  { key: "do", title: "完成具体任务", verb: "会做", note: "使用工具或流程完成一项工作" },
  { key: "improve", title: "改善工作问题", verb: "改善", note: "改变影响结果的关键岗位行为" },
];

function initialState(): CourseState {
  return {
    phase: 1,
    completed: [],
    rawTask: "",
    messages: [],
    brief: {
      topic: "",
      audience: "",
      duration: "",
      format: "",
      learningFocus: "",
      scope: "",
      source: "",
      deliverable: "课程方案＋PPT逐页设计方案",
    },
    courseType: "",
    mainline: "",
    landing: [],
    outcomeNote: "",
    attachments: [],
    goals: [],
    modules: [],
    activities: [],
    slides: [],
  };
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [course, setCourse] = useState<CourseState>(initialState);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [slideFilter, setSlideFilter] = useState("全部");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("zhike-course-draft-v1");
    if (saved) {
      try { setCourse(JSON.parse(saved) as CourseState); } catch { /* 保留新草稿 */ }
    }
    setHydrated(true);
    fetch("/api/course-assistant")
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => setApiReady(Boolean(data.configured)))
      .catch(() => setApiReady(false));
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("zhike-course-draft-v1", JSON.stringify(course));
  }, [course, hydrated]);

  const completedCount = course.completed.length;
  const totalTime = course.modules.reduce((sum, item) => sum + Number(item.time || 0), 0);
  const slideTypes = useMemo(() => ["全部", ...Array.from(new Set(course.slides.map((slide) => slide.type)))], [course.slides]);
  const visibleSlides = course.slides.filter((slide) => slideFilter === "全部" || slide.type === slideFilter);

  function patchBrief(key: keyof CourseState["brief"], value: string) {
    setCourse((current) => ({ ...current, brief: { ...current.brief, [key]: value } }));
  }

  function markCompleted(current: StageId[], stage: StageId) {
    return current.includes(stage) ? current : [...current, stage].sort();
  }

  async function askAI(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setNotice("");
    try {
      const response = await fetch("/api/course-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, course, ...extra }),
      });
      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(data.error || "生成失败");
      return data;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "暂时无法生成，请稍后重试。");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function submitTask() {
    const message = draft.trim();
    if (!message) { setNotice("先用一句话描述课程任务。 "); return; }
    setCourse((current) => ({
      ...current,
      rawTask: current.rawTask || message,
      messages: [...current.messages, { id: uid("m"), role: "user", text: message }],
    }));
    setDraft("");
    const data = await askAI("intake", { message });
    if (!data) return;
    const briefPatch = (data.briefPatch || {}) as Partial<CourseState["brief"]>;
    const suggestedLanding = (data.suggestedLanding || []) as LandingKey[];
    setCourse((current) => ({
      ...current,
      brief: { ...current.brief, ...briefPatch },
      courseType: String(data.courseType || current.courseType),
      mainline: String(data.mainline || current.mainline),
      landing: current.landing.length ? current.landing : suggestedLanding,
      messages: [...current.messages, { id: uid("m"), role: "assistant", text: String(data.message || "我已经整理了课程任务，请确认右侧任务卡。") }],
    }));
  }

  function confirmTask() {
    if (!course.brief.topic.trim()) { setNotice("请先确认课程主题。 "); return; }
    setCourse((current) => ({ ...current, completed: markCompleted(current.completed, 1), phase: 2 }));
    setNotice("");
  }

  function toggleLanding(key: LandingKey) {
    setCourse((current) => ({
      ...current,
      landing: current.landing.includes(key) ? current.landing.filter((item) => item !== key) : [...current.landing, key],
    }));
  }

  function confirmLanding() {
    if (!course.landing.length && !course.outcomeNote.trim()) { setNotice("至少选择一种学习变化，或者写一句自己的期望。 "); return; }
    const labels = course.landing.map((key) => landingOptions.find((item) => item.key === key)?.title).filter(Boolean).join("、");
    setCourse((current) => ({
      ...current,
      brief: { ...current.brief, learningFocus: [labels, current.outcomeNote].filter(Boolean).join("；") },
      completed: markCompleted(current.completed, 2),
      phase: 3,
    }));
    setNotice("");
  }

  async function generateGoals() {
    const data = await askAI("goals");
    if (!data) return;
    setCourse((current) => ({ ...current, goals: (data.goals || []) as Goal[], completed: markCompleted(current.completed, 3) }));
  }

  async function generateOutline() {
    const data = await askAI("outline");
    if (!data) return;
    setCourse((current) => ({ ...current, modules: (data.modules || []) as Module[], completed: markCompleted(current.completed, 4) }));
  }

  async function generateActivities() {
    const data = await askAI("activities");
    if (!data) return;
    setCourse((current) => ({ ...current, activities: (data.activities || []) as Activity[], completed: markCompleted(current.completed, 5) }));
  }

  async function generateSlides() {
    const data = await askAI("storyboard");
    if (!data) return;
    setCourse((current) => ({ ...current, slides: (data.slides || []) as Slide[], completed: markCompleted(current.completed, 7) }));
    setSlideFilter("全部");
  }

  function confirmSchedule() {
    setCourse((current) => ({ ...current, completed: markCompleted(current.completed, 6), phase: 7 }));
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = await Promise.all(Array.from(files).map(async (file): Promise<Attachment> => {
      const textLike = /\.(txt|md|csv|json)$/i.test(file.name) || file.type.startsWith("text/");
      const text = textLike ? (await file.text()).slice(0, 60000) : undefined;
      return { id: uid("file"), name: file.name, size: file.size, type: file.type || "文件", text };
    }));
    setCourse((current) => ({
      ...current,
      attachments: [...current.attachments, ...next],
      brief: { ...current.brief, source: `${current.attachments.length + next.length}份资料` },
    }));
    setNotice(`${next.length}份资料已加入课程项目。`);
  }

  function removeFile(id: string) {
    setCourse((current) => {
      const attachments = current.attachments.filter((item) => item.id !== id);
      return { ...current, attachments, brief: { ...current.brief, source: attachments.length ? `${attachments.length}份资料` : "" } };
    });
  }

  function exportPlan() {
    const lines = [
      `# ${course.brief.topic || "未命名课程"}｜课程设计方案`, "",
      "## 课程任务卡", "",
      `- 目标学员：${course.brief.audience || "待确认"}`,
      `- 时长与形式：${course.brief.duration || "待确认"}｜${course.brief.format || "待确认"}`,
      `- 学习落点：${course.brief.learningFocus || "待确认"}`,
      `- 课程主线：${course.mainline || "待生成"}`, "",
      "## 课程目标", "",
      ...course.goals.flatMap((goal, index) => [`${index + 1}. ${goal.text}`, `   - 达标证据：${goal.evidence}`]), "",
      "## 课程结构", "",
      ...course.modules.flatMap((module, index) => [
        `### ${index + 1}. ${module.title}（${module.time}分钟）`, "",
        `核心问题：${module.question}`, `主要内容：${module.contents.join("；")}`, `活动：${module.activity}`, `产出：${module.output}`, "",
      ]),
      "## PPT逐页方案", "",
      ...course.slides.flatMap((slide, index) => [
        `### P${String(index + 1).padStart(2, "0")}｜${slide.type}｜${slide.title}`, "",
        `- 教学阶段：${slide.stage}`, `- 屏上文字：${slide.onScreen.join("｜")}`, `- 视觉构图：${slide.visual}`,
        `- 讲师提示：${slide.speaker}`, `- 学员行为：${slide.learner}`, `- 时间：${slide.time}分钟`, "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${course.brief.topic || "课程设计方案"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("课程设计方案已导出。 ");
  }

  function newCourse() {
    if (!window.confirm("确定新建课程吗？当前草稿会从本机清除。")) return;
    window.localStorage.removeItem("zhike-course-draft-v1");
    setCourse(initialState());
    setDraft("");
    setNotice("");
  }

  function renderStage() {
    if (course.phase === 1) return (
      <section className="stage-page">
        <div className="eyebrow"><span>01</span> 接住课程任务</div>
        <h1>先把任务交给我</h1>
        <p className="lead">一句话也能开始。你不用先懂课程设计，我会边聊边帮你把课程想清楚。</p>

        {!course.messages.length && (
          <div className="welcome-grid">
            <article><b>01</b><strong>说一句任务</strong><p>领导怎么交代的，就怎么告诉我。</p></article>
            <article><b>02</b><strong>可以带资料</strong><p>制度、旧课件、案例和录音文稿都可以。</p></article>
            <article><b>03</b><strong>边聊边成形</strong><p>系统只追问会改变设计结果的内容。</p></article>
          </div>
        )}

        {!!course.messages.length && <div className="chat-stream">
          {course.messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.role === "assistant" && <span className="assistant-mark">知课</span>}
              <div><p>{message.text}</p></div>
            </div>
          ))}
          {(course.courseType || course.mainline) && <div className="recommendation">
            <span>系统初步建议</span>
            <strong>{course.courseType || "等待判断课程类型"}</strong>
            <p>{course.mainline || "确认学习落点后生成课程主线。"}</p>
          </div>}
        </div>}

        <div className="task-composer">
          <label htmlFor="course-task">{course.messages.length ? "继续补充，或者直接确认右侧任务卡" : "领导怎么交代的，或者你想做一门什么课？"}</label>
          <textarea id="course-task" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：领导让我做一个信息保密的课程。" rows={course.messages.length ? 3 : 5} />
          <div className="composer-actions">
            <button className="attach" type="button" onClick={() => fileRef.current?.click()}><span>＋</span> 添加资料</button>
            <button className="primary" type="button" onClick={submitTask} disabled={!draft.trim() || busy === "intake"}>{busy === "intake" ? "正在梳理…" : course.messages.length ? "发送补充" : "开始梳理"}<span>→</span></button>
          </div>
        </div>
        {!course.messages.length && <div className="example-row"><span>也可以试试</span>{["信息保密", "班组安全", "隐患排查"].map((item) => <button key={item} type="button" onClick={() => setDraft(`领导让我做一个${item}的课程。`)}>{item}</button>)}</div>}
        {!!course.attachments.length && <div className="file-strip">{course.attachments.map((file) => <span key={file.id}><b>{file.name}</b><small>{formatSize(file.size)}</small><button type="button" aria-label={`移除${file.name}`} onClick={() => removeFile(file.id)}>×</button></span>)}</div>}
        {!!course.messages.length && <div className="stage-actions"><button className="primary large" type="button" onClick={confirmTask}>确认任务卡，继续确定学习落点 <span>→</span></button></div>}
      </section>
    );

    if (course.phase === 2) return (
      <section className="stage-page">
        <div className="eyebrow"><span>02</span> 确定学习落点</div>
        <h1>学完以后，要发生什么变化？</h1>
        <p className="lead">不用先写专业目标。先选择学员最主要的变化，可以多选；系统会据此决定是否需要分析工作任务或业务问题。</p>
        <div className="landing-grid">
          {landingOptions.map((option) => <button className={course.landing.includes(option.key) ? "selected" : ""} type="button" key={option.key} onClick={() => toggleLanding(option.key)}>
            <span>{option.verb}</span><strong>{option.title}</strong><p>{option.note}</p><i>{course.landing.includes(option.key) ? "已选择" : "选择"}</i>
          </button>)}
        </div>
        <div className="outcome-box">
          <label htmlFor="outcome">如果你已经有想法，也可以用自己的话补充</label>
          <textarea id="outcome" rows={4} value={course.outcomeNote} onChange={(event) => setCourse((current) => ({ ...current, outcomeNote: event.target.value }))} placeholder="例如：希望员工在发送文件、参加会议和使用个人设备时，能够判断是否存在泄密风险，并采取正确做法。" />
        </div>
        <div className="decision-note"><span>路径判断</span><div><strong>{course.courseType || "等待你选择学习变化"}</strong><p>选择“会做”时，系统会展开关键任务与场景；选择“改善”时，才会进一步分析业务问题和培训边界。</p></div></div>
        <div className="stage-actions split"><button className="ghost" type="button" onClick={() => setCourse((current) => ({ ...current, phase: 1 }))}>← 返回任务卡</button><button className="primary large" type="button" onClick={confirmLanding}>确认学习落点 <span>→</span></button></div>
      </section>
    );

    if (course.phase === 3) return (
      <section className="stage-page">
        <div className="eyebrow"><span>03</span> 设定课程目标</div>
        <h1>把“掌握”变成能够做到</h1>
        <p className="lead">系统使用ABCD公式，但不会让用户背术语。每个目标都要对应一个看得见的学员表现和达标证据。</p>
        {!course.goals.length ? <div className="empty-state"><span>ABCD</span><h2>目标所需信息已经就绪</h2><p>系统将结合学员、学习落点、使用情境和课程时长生成3—5项可评价目标。</p><button className="primary large" type="button" disabled={busy === "goals"} onClick={generateGoals}>{busy === "goals" ? "正在生成…" : "生成课程目标"}<span>→</span></button></div> : <div className="goal-list">
          {course.goals.map((goal, index) => <article key={goal.id}><span>{String(index + 1).padStart(2, "0")}</span><div><label>课程目标</label><textarea rows={3} value={goal.text} onChange={(event) => setCourse((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, text: event.target.value } : item) }))} /><label>达标证据</label><input value={goal.evidence} onChange={(event) => setCourse((current) => ({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, evidence: event.target.value } : item) }))} /></div></article>)}
        </div>}
        {!!course.goals.length && <div className="stage-actions split"><button className="ghost" type="button" onClick={generateGoals}>重新生成</button><button className="primary large" type="button" onClick={() => setCourse((current) => ({ ...current, phase: 4 }))}>确认目标，搭课程骨架 <span>→</span></button></div>}
      </section>
    );

    if (course.phase === 4) return (
      <section className="stage-page">
        <div className="eyebrow"><span>04</span> 内容萃取与结构</div>
        <h1>先有骨架，再让内容长出来</h1>
        <p className="lead">先形成便于审阅的粗框架，再从制度、案例和专家经验中萃取知识点，最后根据内容证据校准结构。</p>
        <div className="source-summary"><div><span>内容依据</span><strong>{course.attachments.length ? `${course.attachments.length}份用户资料` : "暂未添加企业资料"}</strong><p>{course.attachments.length ? "文字类资料会参与生成；其他格式已保留文件信息。" : "可以先生成草案，但企业制度和操作标准必须在定稿前核实。"}</p></div><button type="button" onClick={() => fileRef.current?.click()}>＋ 添加资料</button></div>
        {!course.modules.length ? <div className="empty-state"><span>WWH</span><h2>根据目标生成课程粗框架</h2><p>框架只放核心问题和知识点，不提前用案例或活动把结构塞满。</p><button className="primary large" type="button" disabled={busy === "outline"} onClick={generateOutline}>{busy === "outline" ? "正在搭建…" : "生成课程结构"}<span>→</span></button></div> : <div className="module-list">
          {course.modules.map((module, index) => <article key={module.id}><div className="module-index">{String(index + 1).padStart(2, "0")}</div><div className="module-body"><div className="module-title"><div><span>核心问题</span><h2>{module.title}</h2></div><b>{module.time} min</b></div><p className="question">{module.question}</p><ul>{module.contents.map((item) => <li key={item}>{item}</li>)}</ul><div className="module-foot"><span>建议活动：{module.activity}</span><span>学员产出：{module.output}</span></div></div></article>)}
        </div>}
        {!!course.modules.length && <div className="stage-actions split"><button className="ghost" type="button" onClick={generateOutline}>重新生成</button><button className="primary large" type="button" onClick={() => setCourse((current) => ({ ...current, phase: 5 }))}>确认结构，设计活动 <span>→</span></button></div>}
      </section>
    );

    if (course.phase === 5) return (
      <section className="stage-page">
        <div className="eyebrow"><span>05</span> 设计学习活动</div>
        <h1>每个核心知识点，都要完成一次学习闭环</h1>
        <p className="lead">激活经验和问题，讲清必要模型，再让学员思考、练习或实践，并获得答案或反馈。</p>
        {!course.activities.length ? <div className="empty-state"><span>三板斧</span><h2>激活 · 讲解 · 吸收</h2><p>系统会根据目标层级选择活动，不用与主题无关的热场，也不用“还有问题吗”代替吸收。</p><button className="primary large" type="button" disabled={busy === "activities"} onClick={generateActivities}>{busy === "activities" ? "正在设计…" : "生成教学活动"}<span>→</span></button></div> : <div className="activity-list">
          {course.activities.map((activity, index) => <article key={activity.id}><header><span>{String(index + 1).padStart(2, "0")}</span><div><small>对应模块</small><h2>{activity.module}</h2></div></header><div className="three-steps"><div><b>激活</b><p>{activity.activate}</p></div><div><b>讲解</b><p>{activity.explain}</p></div><div><b>吸收</b><p>{activity.absorb}</p></div></div><footer><span>反馈：{activity.feedback}</span><span>材料：{activity.material}</span></footer></article>)}
        </div>}
        {!!course.activities.length && <div className="stage-actions split"><button className="ghost" type="button" onClick={generateActivities}>重新生成</button><button className="primary large" type="button" onClick={() => setCourse((current) => ({ ...current, phase: 6 }))}>确认活动，编排整课 <span>→</span></button></div>}
      </section>
    );

    if (course.phase === 6) return (
      <section className="stage-page">
        <div className="eyebrow"><span>06</span> 整门课程编排</div>
        <h1>从鸟瞰图检查整门课</h1>
        <p className="lead">把目标、模块、活动、时间和学员产出放在一张图里，先解决内容过多和时间失衡，再进入PPT页面。</p>
        <div className="overview-metrics"><article><span>课程模块</span><strong>{course.modules.length}</strong></article><article><span>核心目标</span><strong>{course.goals.length}</strong></article><article><span>建议时长</span><strong>{totalTime}<small>分钟</small></strong></article><article><span>学习闭环</span><strong>{course.activities.length}</strong></article></div>
        <div className="bird-table"><div className="bird-head"><span>模块</span><span>核心问题</span><span>活动与产出</span><span>时间</span></div>{course.modules.map((module, index) => <div className="bird-row" key={module.id}><span><b>{String(index + 1).padStart(2, "0")}</b>{module.title}</span><span>{module.question}</span><span>{module.activity}<small>{module.output}</small></span><span>{module.time} min</span></div>)}</div>
        <div className="material-grid"><article><span>讲师材料</span><strong>主讲PPT＋讲师提示</strong><p>讲解逻辑、提问方式、反馈标准和来源说明。</p></article><article><span>学员材料</span><strong>练习表＋活动任务卡</strong><p>用于思考、练习、实践和课堂产出。</p></article><article><span>岗位应用</span><strong>清单或行动卡</strong><p>把课程方法带回岗位，减少对记忆的依赖。</p></article></div>
        <div className="stage-actions split"><button className="ghost" type="button" onClick={() => setCourse((current) => ({ ...current, phase: 5 }))}>← 返回活动设计</button><button className="primary large" type="button" onClick={confirmSchedule}>确认编排，生成PPT方案 <span>→</span></button></div>
      </section>
    );

    return (
      <section className="stage-page storyboard-page">
        <div className="eyebrow"><span>07</span> PPT逐页设计方案</div>
        <h1>把每一页都想清楚，再开始制作</h1>
        <p className="lead">每页写清标题、屏上文字、画面关系、讲师怎么讲、学员做什么和预计时间，交给制作人员即可执行。</p>
        {!course.slides.length ? <div className="empty-state"><span>PPT</span><h2>课程结构和活动已经就绪</h2><p>将生成封面、目录、章封面、小节封面、激活、讲解、思考、练习、实践、总结和收尾等页面。</p><button className="primary large" type="button" disabled={busy === "storyboard"} onClick={generateSlides}>{busy === "storyboard" ? "正在生成逐页方案…" : "生成PPT逐页方案"}<span>→</span></button></div> : <>
          <div className="storyboard-toolbar"><div className="filters">{slideTypes.map((type) => <button className={slideFilter === type ? "active" : ""} type="button" key={type} onClick={() => setSlideFilter(type)}>{type}</button>)}</div><div><span>共 {course.slides.length} 页</span><button type="button" onClick={exportPlan}>导出完整方案</button></div></div>
          <div className="slide-list">{visibleSlides.map((slide) => { const pageNo = course.slides.findIndex((item) => item.id === slide.id) + 1; return <article key={slide.id}><div className="slide-no">P{String(pageNo).padStart(2, "0")}<span>{slide.type}</span></div><div className="slide-main"><div className="slide-title"><span>{slide.stage}</span><h2>{slide.title}</h2></div><div className="slide-copy"><small>屏上文字</small>{slide.onScreen.map((line) => <p key={line}>{line}</p>)}</div><div className="slide-detail"><div><small>视觉构图</small><p>{slide.visual}</p></div><div><small>讲师提示</small><p>{slide.speaker}</p></div><div><small>学员行为</small><p>{slide.learner}</p></div></div></div><div className="slide-time">{slide.time}<small>min</small></div></article>; })}</div>
          <div className="stage-actions split"><button className="ghost" type="button" onClick={generateSlides}>重新生成</button><button className="primary large" type="button" onClick={exportPlan}>导出课程设计方案 <span>↓</span></button></div>
        </>}
      </section>
    );
  }

  return (
    <main className="app-shell">
      <input ref={fileRef} className="visually-hidden" type="file" multiple accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => void addFiles(event.target.files)} />
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">知课</span><span><strong>课程设计助手</strong><small>AI COURSE STUDIO</small></span></div>
        <button className="new-course" type="button" onClick={newCourse}><span>＋</span> 新建课程</button>
        <nav className="stage-nav" aria-label="课程开发步骤"><p>课程开发路径</p>{stages.map((stage) => <button className={`${course.phase === stage.id ? "active" : ""} ${course.completed.includes(stage.id) ? "done" : ""}`} type="button" key={stage.id} onClick={() => setCourse((current) => ({ ...current, phase: stage.id }))}><span className="stage-number">{course.completed.includes(stage.id) ? "✓" : stage.number}</span><span><strong>{stage.label}</strong><small>{stage.short}</small></span></button>)}</nav>
        <div className="method-note"><span>课程方法</span><strong>从任务到逐页PPT方案</strong><small>不强迫填长表，系统只在需要时追问</small></div>
      </aside>

      <section className="main-content">
        <header className="topbar"><div><span className="crumb">我的课程 /</span><strong>{course.brief.topic || "新课程"}</strong></div><div className="top-actions"><span className={`api-state ${apiReady ? "ready" : ""}`}><i />{apiReady ? "AI 已连接" : "演示模式"}</span><span className="save-state">本机已保存</span><button type="button" onClick={exportPlan} disabled={!course.goals.length}>导出方案</button></div></header>
        <div className="workspace"><div className="content-column">{notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}{renderStage()}</div>
          <aside className="task-card"><div className="card-head"><div><span>COURSE BRIEF</span><h2>课程任务卡</h2></div><b>{completedCount}/7</b></div><p className="card-note">用户提供、系统建议和待确认内容统一放在这里，随时可以修改。</p>
            <div className="brief-fields"><label><span>课程主题</span><input value={course.brief.topic} onChange={(event) => patchBrief("topic", event.target.value)} placeholder="等待提取" /></label><label><span>目标学员</span><input value={course.brief.audience} onChange={(event) => patchBrief("audience", event.target.value)} placeholder="待确认" /></label><div className="brief-pair"><label><span>课程时长</span><input value={course.brief.duration} onChange={(event) => patchBrief("duration", event.target.value)} placeholder="待确认" /></label><label><span>授课形式</span><input value={course.brief.format} onChange={(event) => patchBrief("format", event.target.value)} placeholder="待确认" /></label></div><label><span>学习落点</span><textarea rows={3} value={course.brief.learningFocus} onChange={(event) => patchBrief("learningFocus", event.target.value)} placeholder="第2步确定" /></label><label><span>内容范围</span><input value={course.brief.scope} onChange={(event) => patchBrief("scope", event.target.value)} placeholder="根据资料确认" /></label><label><span>交付成果</span><textarea rows={2} value={course.brief.deliverable} onChange={(event) => patchBrief("deliverable", event.target.value)} /></label></div>
            <div className="progress-block"><div><span>课程完成度</span><b>{Math.round(completedCount / 7 * 100)}%</b></div><i><em style={{ width: `${completedCount / 7 * 100}%` }} /></i></div>
            <div className="card-tip"><span>设计原则</span><p>必要信息不等于必填表单。系统优先从任务和资料中提取，只让用户确认会改变课程结果的事项。</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
