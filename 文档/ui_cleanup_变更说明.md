UI 清理已完成（ui_cleanup 子任务，2026-09-12）：
- dist/index.html：个人页改名“我的问题卡片”，移除“个人页面”及说明灰字，移除右上角本地双端模拟 connection；“我的书架”导航改为“我的问题卡片”。新增“管理分类”按钮和分类管理对话框。
- dist/assets/交流逻辑.js：增加分类 localStorage（tongpin-card-categories-v1），用户新增/删除分类；筛选与结束交流卡片分类动态取用户分类，无预设；删除分类会将已有卡片置为未分类。
- dist/assets/界面样式.css：分类管理对话框及工具栏样式。
- node --check dist/assets/交流逻辑.js 已通过。
