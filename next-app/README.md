# 同频提问局 Next.js OAuth 运行层

本目录保留原 `dist/` 静态页面，同时提供知乎 OAuth、用户资料、关注列表和创作信息所需的 Next.js 服务端路由。OAuth 密钥只从项目外环境文件读取，不复制到仓库。

## 本地运行

```powershell
npm install
npm run dev
```

启动器会先检查同频本地状态服务；服务未运行时自动调用上级 `工具/本地预览.mjs`，再启动 Next.js。也可以通过 `ZHIHU_ENV_FILE` 指定外部环境文件；未指定时读取 `%USERPROFILE%\\.config\\zhihu-hot-oauth\\.env.local`。生产模式使用 `npm run build` 后执行 `npm run start`。

知乎开放平台回调地址必须与外部配置中的 `ZHIHU_OAUTH_REDIRECT_URI` 完全一致。未配置 OAuth 时，原静态页面仍可浏览，但知乎登录及用户接口不可用。
