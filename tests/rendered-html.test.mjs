import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";
import test, { after, before } from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let baseUrl;

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  const logs = [];
  server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production", LLM_API_KEY: "", LLM_BASE_URL: "", LLM_MODEL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  server.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next.js 测试服务启动失败：${logs.join("")}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch { /* 等待服务就绪 */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js 测试服务启动超时：${logs.join("")}`);
}, { timeout: 30000 });

after(() => {
  server?.kill("SIGTERM");
});

async function render() {
  return fetch(`${baseUrl}/`, { headers: { accept: "text/html" } });
}

async function callApi(body) {
  return fetch(`${baseUrl}/api/course-assistant`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("server-renders the Zhike course design workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>知课｜AI企业课程设计助手<\/title>/i);
  assert.match(html, /先把任务交给我/);
  assert.match(html, /课程任务卡/);
  assert.match(html, /PPT逐页方案/);
  assert.match(html, /请使用电脑打开/);
  assert.match(html, /zhike\.i530\.vip/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("shows a stable desktop-use guide on mobile screens", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /mobile-gate/);
  assert.match(page, /为了保证使用体验，知课暂时只在电脑端提供完整功能/);
  assert.match(css, /@media \(max-width:899px\)/);
  assert.match(css, /\.app-shell,\.model-overlay \{ display:none!important; \}/);
  assert.match(css, /\.mobile-gate \{ min-height:100svh; display:grid/);
});

test("keeps the course method and server-side model configuration explicit", async () => {
  const [page, route, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/course-assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(page, /激活·讲解·吸收/);
  assert.match(page, /按章节生成PPT逐页方案/);
  assert.match(page, /dirtyStages/);
  assert.match(page, /updateModule/);
  assert.match(page, /updateActivity/);
  assert.match(page, /updateSlide/);
  assert.match(page, /模型设置/);
  assert.match(page, /在此浏览器记住设置/);
  assert.match(page, /zhike-model-config-v1/);
  assert.match(page, /compactCourseForRequest/);
  assert.match(page, /remaining = 18000/);
  assert.match(page, /服务器连接刚才中断了/);
  assert.match(route, /ABCD目标/);
  assert.match(route, /业务问题和培训边界/);
  assert.match(route, /runtimeConfig/);
  assert.match(route, /api\.minimaxi\.com/);
  assert.match(route, /api\.deepseek\.com/);
  assert.match(route, /dashscope\.aliyuncs\.com/);
  assert.match(route, /max_completion_tokens/);
  assert.match(route, /response_format/);
  assert.match(route, /supportsJsonObject/);
  assert.match(route, /fallbackWarning/);
  assert.match(route, /buildStoryboard/);
  assert.match(route, /storyboard-section/);
  assert.match(route, /stageContext/);
  assert.match(route, /confirmedContext/);
  assert.match(route, /AbortController/);
  assert.match(route, /章封面/);
  assert.match(route, /系统已自动重试/);
  assert.match(envExample, /^LLM_API_KEY=$/m);
  assert.doesNotMatch(envExample, /sk-|YOUR_API_KEY/);
});

test("rejects unsafe personal model endpoints before making a network request", async () => {
  const response = await callApi({
    action: "test",
    runtimeConfig: { apiKey: "local-test-key", baseUrl: "http://127.0.0.1:8080/v1", model: "test-model" },
  });
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.match(result.error, /HTTPS|安全名单/);
});

test("generates goals and a page-by-page PPT plan in demo mode", async () => {
  const course = {
    brief: { topic: "信息保密", audience: "全体员工", duration: "2小时", format: "线下" },
    modules: [],
  };
  const goalsResponse = await callApi({ action: "goals", course });
  assert.equal(goalsResponse.status, 200);
  const goals = await goalsResponse.json();
  assert.equal(goals.goals.length, 3);
  assert.match(goals.goals[0].text, /全体员工/);

  const slidesResponse = await callApi({ action: "storyboard", course });
  assert.equal(slidesResponse.status, 200);
  const slides = await slidesResponse.json();
  assert.ok(slides.slides.length >= 15);
  assert.ok(slides.slides.some((slide) => slide.type === "章封面"));
  assert.ok(slides.slides.some((slide) => slide.type === "吸收·实践"));
  assert.ok(slides.slides.some((slide) => slide.type === "收尾"));
});

test("generates the PPT storyboard without waiting on the model", async () => {
  const course = {
    brief: { topic: "信息保密", audience: "全体员工", duration: "2小时", format: "线下" },
    modules: [
      { id: "module-1", title: "边界：什么信息需要保密", question: "哪些信息不能凭感觉处理？", contents: ["保密信息范围", "分类分级依据"], time: 25, activity: "信息卡片分类", output: "识别清单" },
      { id: "module-2", title: "场景：泄密风险藏在哪里", question: "哪些行为可能带来泄密？", contents: ["办公与会议", "邮件与即时通信"], time: 35, activity: "情境辨析", output: "风险判断记录" },
    ],
  };
  const response = await callApi({
    action: "storyboard",
    course,
    runtimeConfig: { apiKey: "local-test-key", baseUrl: "https://api.minimaxi.com/v1", model: "MiniMax-M3" },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "structured");
  assert.equal(result.slides.length, 14);
  assert.ok(result.slides.some((slide) => slide.title.includes("边界")));
  assert.ok(result.slides.some((slide) => slide.type === "吸收·实践"));
});

test("generates one editable PPT chapter at a time", async () => {
  const course = {
    brief: { topic: "信息保密", audience: "全体员工", duration: "2小时", format: "线下" },
    goals: [{ id: "goal-1", text: "能够判断常见泄密风险", evidence: "完成情境判断" }],
    modules: [
      { id: "module-a", title: "识别保密信息", question: "哪些信息需要保护？", contents: ["信息范围", "使用边界"], time: 25, activity: "卡片分类", output: "识别清单" },
      { id: "module-b", title: "判断泄密风险", question: "哪些动作有风险？", contents: ["传递", "存储"], time: 35, activity: "情境辨析", output: "判断记录" },
    ],
    activities: [],
  };
  const response = await callApi({ action: "storyboard-section", moduleId: "module-b", course });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.slides.length, 5);
  assert.ok(result.slides.every((slide) => slide.moduleId === "module-b"));
  assert.ok(result.slides.some((slide) => slide.type === "章封面"));
  assert.ok(result.slides.some((slide) => slide.title.includes("判断泄密风险")));
});
