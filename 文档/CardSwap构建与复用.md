# CardSwap 问题卡片

此局部组件基于用户提供的 React / TypeScript / GSAP CardSwap 代码适配，页面其余部分沿用现有静态 HTML 与交流逻辑。

- `源码/卡片/`：组件 TypeScript 与 CSS。
- `源码/卡片入口.tsx`：与已有书架数据、复制分享回调连接；保留同一个 React 根，内容未改变不重绘。
- `工具/构建卡片.mjs`：编译到 `dist/assets/卡片展示.js` 和 `卡片展示.css`；保留第三方许可注释文件。
- `package-lock.json` 锁定实际安装版本；`node_modules/` 是开发依赖，不进入交付包。

开发时执行 `npm ci`、`npm run build`。浏览器只需要编译后的 `dist/`，不需要 API Key、运行时 CDN 或 TypeScript 编译器；沿用已有本地预览服务。

未保存卡片时使用3张自创示例，均明确标注“示例”，不加入保存记录或分类。保存真实卡片后用真实数据替代示例。按钮用于复制/分享当前卡片；多卡支持自动和手动交换，阅读、聚焦、隐藏页面或减少动态偏好下暂停/简化动画。

React / React DOM 使用 MIT 许可；GSAP 3.15.0 包元数据标注官方标准免费许可（https://gsap.com/standard-license/），仅使用公开核心动画 API。依赖审计在本轮安装时为0已知漏洞。官方组件样式与文档研究归档于研究目录，不混入网页包。

本轮不生成压缩包；已更新完整包源码与TypeScript白名单，后续按用户要求再打包。
