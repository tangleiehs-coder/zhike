# 知课｜AI企业课程设计助手

面向企业内训师的单页课程开发工作台。用户可以从一句模糊任务开始，逐步完成：

1. 课程任务卡
2. 学习落点判断
3. ABCD课程目标
4. 内容萃取与课程结构
5. 激活—讲解—吸收活动
6. 整课鸟瞰图
7. PPT逐页设计方案

## 大模型接口

站点右上角提供“模型设置”。用户可以填写自己的 API 密钥、接口地址和模型名称，测试成功后使用。MiniMax、DeepSeek、通义千问等国内接口提供快捷预设；OpenAI 标明为境外接口。其他 OpenAI Chat Completions 兼容接口需要把域名加入服务端安全名单。

用户可以选择“在此浏览器记住设置”。勾选后，密钥和接口信息保存在当前浏览器的 `localStorage`；不勾选则只在当前页面会话中使用。共享电脑不建议保存。密钥会通过 HTTPS 发送到站点服务端代为请求模型，但不会写入站点数据库或日志。

站点管理员也可以复制 `.env.example` 为本地环境文件，配置默认模型：

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `LLM_ALLOWED_HOSTS`

没有个人设置且服务端未配置密钥时，站点自动运行演示逻辑，可完整体验信息保密课程的开发流程。

## 资料支持

文本、Markdown、CSV 和 JSON 文件会直接读取文本并参与生成；PDF、Word、PPT 等文件当前保留文件信息，正式接入文档解析服务后即可扩展为全文解析。

## 本地运行

```bash
npm install
npm run dev
```

正式验证：

```bash
npm test
```

## 腾讯云 CloudBase 部署

生产环境使用 CloudBase 云托管运行完整的 Next.js 应用，网页与 `/api/course-assistant` 位于同一国内服务中。仓库根目录的 `Dockerfile` 可直接用于 CloudBase 的 Git 仓库自动构建。

- 服务端口：`3000`
- 健康检查路径：`/`
- 生产分支：`main`
- 自定义域名：`zhike.i530.vip`

首次也可以在本机登录腾讯云后执行：

```bash
npm run deploy:cloudbase
```

部署成功后，在 CloudBase 的 HTTP 访问服务中将 `/` 路径关联到该云托管服务，再把 DNSPod 中 `zhike` 的 CNAME 改为控制台提供的目标地址。生产环境使用中国大陆节点时，域名需要完成 ICP 备案。
