import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function callApi(body) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/api/course-assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
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
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the course method and server-side model configuration explicit", async () => {
  const [page, route, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/course-assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(page, /激活·讲解·吸收/);
  assert.match(page, /章封面/);
  assert.match(page, /模型设置/);
  assert.match(page, /在此浏览器记住设置/);
  assert.match(page, /zhike-model-config-v1/);
  assert.match(route, /ABCD目标/);
  assert.match(route, /业务问题和培训边界/);
  assert.match(route, /runtimeConfig/);
  assert.match(route, /api\.minimaxi\.com/);
  assert.match(route, /max_completion_tokens/);
  assert.match(route, /thinking/);
  assert.match(route, /buildStoryboard/);
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
