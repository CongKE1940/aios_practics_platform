# 前端技术方案（React）

## 1. 目标
构建一个可同时承载“管理端 + 用户端”的前端工程，并为未来手机端/平板端保留共享能力。

## 2. 技术选型
- React 18
- TypeScript 5（strict 模式）
- Vite
- React Router
- TanStack Query（服务端数据获取）
- Zustand（轻量本地状态）
- Ant Design 5（桌面端组件）
- CSS Modules + Design Token
- pnpm workspace monorepo
- Vitest + Testing Library + Playwright

## 3. Monorepo 目录建议
```text
apps/
  admin-web/
  user-web/
packages/
  api-sdk/
  shared-types/
  shared-utils/
  shared-constants/
  ui-web/
  eslint-config/
  tsconfig/
```

## 4. 为什么这样拆
- 管理端与用户端可独立发布；
- 共享 API 类型和工具函数，减少重复；
- 二期若做 React Native，可复用 `shared-types`、`api-sdk`、`shared-utils`；
- UI 展示层与领域逻辑分离，便于多终端适配。

## 5. 页面与模块分层
### 5.1 推荐分层
- `pages/`：路由页面，只负责组装页面。
- `modules/`：按业务模块组织组件、hooks、service。
- `components/`：通用组件。
- `layouts/`：管理端/用户端布局骨架。
- `stores/`：全局轻量状态。
- `services/`：接口请求封装。

### 5.2 单页面文件建议
```text
pages/question-bank/index/
  page.tsx
  filters.tsx
  table-columns.tsx
  hooks.ts
  service.ts
  types.ts
```

## 6. 路由设计
### 6.1 管理端
- `/admin/dashboard`
- `/admin/tenants`
- `/admin/org/grades`
- `/admin/org/classes`
- `/admin/courses`
- `/admin/users`
- `/admin/roles`
- `/admin/menus`
- `/admin/notices`
- `/admin/question-banks`
- `/admin/questions`
- `/admin/imports`
- `/admin/exams`
- `/admin/challenges`
- `/admin/analytics`
- `/admin/snapshots`

### 6.2 用户端
- `/app/home`
- `/app/courses`
- `/app/practice/select-bank`
- `/app/practice/config`
- `/app/practice/session/:id`
- `/app/practice/result/:id`
- `/app/wrong-questions`
- `/app/mastered-questions`
- `/app/confused-questions`
- `/app/question-feedback`
- `/app/exams`
- `/app/exams/:id`
- `/app/exam-attempt/:id`
- `/app/exam-result/:id`
- `/app/teacher/banks`
- `/app/teacher/exams/create`
- `/app/teacher/classes/:id/analytics`

## 7. 数据获取策略
- 列表页：Query + URL 搜索参数同步。
- 表单页：Mutation + 乐观更新仅用于轻量状态；关键数据以服务端回写为准。
- 权限数据：登录后拉取当前用户菜单、角色、scope、tenant。
- 字典数据：缓存到 Query / Store，中长期缓存。

## 8. 状态管理原则
- 服务端状态：TanStack Query。
- 临时 UI 状态：组件内部 state。
- 跨页面但非持久状态：Zustand。
- 不允许把服务端列表数据长时间镜像进 Zustand，避免双份数据源。

## 9. 组件设计原则
### 9.1 管理端组件
- QueryTable：统一列表页骨架
- FilterPanel：统一筛选区
- DetailDrawer / DetailModal：统一详情容器
- PermissionButton：权限按钮
- EmptyState：统一空态

### 9.2 用户端组件
- PracticeQuestionCard
- QuestionOptions
- QuestionMetaTags
- ExamCountdown
- ProgressHeader
- CourseCard

## 10. 样式与布局策略
- 大部分内容容器 `max-width: 1280px~1440px; margin: 0 auto;`
- 表单主内容建议 `max-width: 720px~960px`
- 卡片内边距优先 20px / 24px
- 页面模块间距 24px，组件间距 16px
- 用户端练题/考试操作区保持固定底部或明显收束

## 11. 权限与路由守卫
- 登录守卫：未登录跳转登录
- 端类型守卫：管理端角色不可进入用户端老师页面时需有清晰提示
- 权限守卫：菜单、按钮、数据范围三层校验
- 多租户守卫：系统管理员可切换租户；租户管理员不可越权

## 12. 错误处理
- 统一错误码到 `packages/shared-constants/error-codes.ts`
- 401：登录失效
- 403：权限不足
- 409：业务冲突（例如题量不足、版本冲突）
- 422：模板校验失败
- 500：服务异常

## 13. 二期移动端预留措施
- 领域层函数不依赖 DOM
- API SDK 与 DTO 独立包化
- 尽量避免把页面层逻辑写死在组件库中
- 练题与考试流程中的状态机抽出为共享逻辑
