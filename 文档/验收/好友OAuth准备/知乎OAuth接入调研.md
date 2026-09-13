# 好友 OAuth 接入准备（知乎）

更新时间：2026-09-13  
范围：只读核对官方知乎 OAuth 资料与当前本地好友服务；没有执行登录联调，也没有写入任何凭据。

## 当前结论

- 项目尚未配置知乎 OAuth `app_id`、`app_key`（App Key 等同应用密钥，不是 Access Secret）。
- 尚未确定或登记 OAuth 回调地址（`redirect_uri`），因此不能开始真实知乎登录联调。
- 当前好友服务仍使用本地访客 `profileId`/`clientId`；服务代码已经预留 `provider` 与 `providerUserId` 字段，默认值为 `local`，但尚未接入知乎身份映射。
- 当前删除好友接口为本地关系删除：`DELETE /api/friends/{friendId}?profileId=...&clientId=...`。它不能撤销知乎授权，也不代表知乎关注关系。

## 官方流程与字段

知乎开放平台文档（项目内官方 Skill 参考，来源链接见下）给出的授权码流程：

1. 浏览器跳转 `GET https://openapi.zhihu.com/authorize?redirect_uri={redirect_uri}&app_id={app_id}&response_type=code`。
2. 回调目前实测参数名为 `authorization_code`；后端应兼容接收 `authorization_code` 与 `code`，再把值作为换 token 请求的 `code`。
3. 后端 `POST https://openapi.zhihu.com/access_token`，表单字段：`app_id`、`app_key`、`grant_type=authorization_code`、`redirect_uri`、`code`。
4. 后端持有 OAuth `access_token` 后，调用 `GET https://openapi.zhihu.com/user` 获取登录用户基础信息（`Authorization: Bearer <access_token>`）。

赛事作品建议配置名：

```text
ZHIHU_OAUTH_APP_ID
ZHIHU_OAUTH_APP_KEY
ZHIHU_OAUTH_REDIRECT_URI
ZHIHU_ACCESS_SECRET
```

App Key、OAuth Token、Access Secret 只放后端凭据库或部署平台 Secret；不进入 `dist/`、浏览器 URL、日志、文档示例或聊天内容。浏览器只保留应用自己的 HttpOnly 会话标识。

## 对好友模型的落地建议

把知乎账号作为身份提供方，而不是把知乎昵称当作唯一键：

```json
{
  "provider": "zhihu",
  "providerUserId": "知乎 user.id",
  "profileId": "应用内部稳定 ID",
  "name": "展示昵称",
  "sourceType": "提问者 | 解决者 | 社群好友"
}
```

- 好友申请保存双方的 `provider`、`providerUserId` 快照；通过后在双方账户各生成一条关系，按原问题角色归类。
- 删除好友只删除本应用双方关系（保留审计时间与 requestId）；不要调用或声称改变知乎关注/好友关系。若将来平台提供撤销授权，应单独做“解除知乎授权”。
- 同一账号判定优先使用 `provider + providerUserId`，`profileId` 仅作应用内部关联；迁移本地访客时需要一次明确的账号绑定，不能按昵称自动合并。
- 申请、接受、拒绝接口沿用现有 `/api/friends/request` 与 `/api/friends/respond`，将身份参数改由服务端会话解析，避免前端伪造 `profileId`。

## 尚缺内容与不能声称的事项

- 缺少赛事分配的 App ID/App Key、已登记 HTTPS 回调地址、知乎用户授权操作，无法声称“知乎登录已接入”或完成真实 token 交换。
- 当前官方资料没有明确 `state`、PKCE、scope、用户拒绝回调、刷新/撤销 token 接口；在这些协议向知乎确认前不能按生产级 CSRF 防护或长期登录定稿。
- 本地 `127.0.0.1` 回调只适合 Mock/开发验证；正式联调需要与知乎登记值完全一致的公网 HTTPS 地址。

## HTTP 只读证据（2026-09-13，未携带凭据）

| 请求 | 结果 | 说明 |
|---|---:|---|
| `GET https://developer.zhihu.com/` | 200 | 官方开发者站可访问，`text/html; charset=utf-8` |
| `GET https://openapi.zhihu.com/authorize` | 200 | 授权页面可访问；未传参数，不代表授权成功 |
| `GET https://openapi.zhihu.com/user` | 200 | 返回 JSON（46 字节）；未带 Bearer，不代表取得用户信息 |
| `GET https://openapi.zhihu.com/access_token` | 405 | 端点要求 POST；未发送 token 交换请求 |

## 官方资料

- [知乎 OAuth 应用集成（项目内 Skill 参考）](C:/Users/w1894/.codex/skills/zhihu/references/oauth.md)
- [知乎黑客松 OAuth 接入（项目内 Skill 参考）](C:/Users/w1894/.codex/skills/zhihu/references/hackathon-oauth.md)
- [知乎开放平台](https://developer.zhihu.com/)

