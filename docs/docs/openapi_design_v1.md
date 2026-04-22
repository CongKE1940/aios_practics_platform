# 刷题软件 OpenAPI 3.0 接口文档 v1

> 文档类型：Markdown 版 OpenAPI 3.0 设计说明  
> 适用范围：项目一期（网页端），并为后续 iOS / Android / Pad 预留一致接口  
> 技术背景：前端 React，后端 Go，数据库 MySQL，缓存 Redis  
> 设计依据：基于原始需求及已扩展的数据模型，覆盖 RBAC、多租户、题库下发、题目版本、练题、考试、通知、导入、审计与历史快照等核心能力。

---

## 1. 文档说明

本文档用于指导 AI 或研发团队生成正式的 OpenAPI 3.0 YAML / JSON 文件以及 Go 接口实现。

目标：
1. 给出统一 RESTful API 设计基线。
2. 兼容管理端与用户端。
3. 将一期核心能力优先定义完整。
4. 为后续移动端复用同一套接口语义。

---

## 2. OpenAPI 基础信息

以下为推荐的 OpenAPI 3.0 顶层信息：

```yaml
openapi: 3.0.3
info:
  title: Question System API
  version: 1.0.0
  description: |
    刷题软件一期接口文档，覆盖认证、组织、RBAC、题库、题目、练题、考试、通知、导入、统计等。
servers:
  - url: https://api.example.com
    description: production
  - url: https://staging-api.example.com
    description: staging
  - url: http://localhost:8080
    description: local
tags:
  - name: Auth
  - name: RBAC
  - name: Org
  - name: User
  - name: QuestionBank
  - name: Question
  - name: Practice
  - name: Exam
  - name: Notice
  - name: Notification
  - name: Import
  - name: Analytics
  - name: Audit
```

---

## 3. 通用约定

## 3.1 鉴权方式

推荐采用：

- `Authorization: Bearer <token>`
- JWT Access Token
- 可选 Refresh Token

OpenAPI security scheme 建议：

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

除登录接口外，默认都要求鉴权：

```yaml
security:
  - bearerAuth: []
```

---

## 3.2 多租户上下文

推荐从 token 中解析：
- `tenant_id`
- `user_id`
- `roles`
- `data_scope`

对于系统管理员可允许查看所有租户；租户管理员只允许查看本租户及其下级数据。系统管理员归属内置平台级虚拟租户 `platform`，系统级数据不使用空 `tenant_id`，避免鉴权、审计和角色绑定出现空租户分支。

---

## 3.3 通用响应格式

建议统一响应包装：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "request_id": "req_xxx"
}
```

### 成功响应
- `code = 0`

### 失败响应
```json
{
  "code": 4001001,
  "message": "invalid parameter",
  "data": null,
  "request_id": "req_xxx"
}
```

---

## 3.4 分页格式

请求参数：
- `page`
- `page_size`
- `sort_by`
- `sort_order`

响应建议：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [],
    "page": 1,
    "page_size": 20,
    "total": 100
  },
  "request_id": "req_xxx"
}
```

---

## 3.5 通用错误码建议

| code | 含义 |
|---|---|
| 4001001 | 参数错误 |
| 4011001 | 未登录 |
| 4011002 | token 无效 |
| 4031001 | 无权限 |
| 4031002 | 数据范围不足 |
| 4041001 | 资源不存在 |
| 4091001 | 状态冲突 |
| 4091002 | 唯一约束冲突 |
| 4221001 | 业务校验失败 |
| 5001001 | 系统错误 |

---

## 4. 通用 Schema 设计

## 4.1 PageResponse

```yaml
PageResponse:
  type: object
  properties:
    items:
      type: array
      items: {}
    page:
      type: integer
    page_size:
      type: integer
    total:
      type: integer
```

## 4.2 BaseResponse

```yaml
BaseResponse:
  type: object
  properties:
    code:
      type: integer
      example: 0
    message:
      type: string
      example: ok
    data:
      nullable: true
    request_id:
      type: string
```

## 4.3 QuestionContent

```yaml
QuestionContent:
  type: object
  properties:
    stem:
      type: object
      properties:
        content_type:
          type: string
          example: text
        text:
          type: string
        assets:
          type: array
          items:
            $ref: '#/components/schemas/AssetRef'
    options:
      type: array
      items:
        $ref: '#/components/schemas/QuestionOption'
    option_order_randomizable:
      type: boolean
    ext:
      type: object
      additionalProperties: true
```

## 4.4 QuestionOption

```yaml
QuestionOption:
  type: object
  properties:
    key:
      type: string
      example: A
    content_type:
      type: string
      example: text
    text:
      type: string
    assets:
      type: array
      items:
        $ref: '#/components/schemas/AssetRef'
```

## 4.5 AssetRef

```yaml
AssetRef:
  type: object
  properties:
    url:
      type: string
    type:
      type: string
      example: image
```

## 4.6 QuestionAnswer

```yaml
QuestionAnswer:
  type: object
  properties:
    judge_mode:
      type: string
      example: by_option_key
    correct_keys:
      type: array
      items:
        type: string
    correct_value:
      type: boolean
      nullable: true
```

---

## 5. 接口总览

### 认证与用户
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`

### RBAC
- `GET /api/v1/menus`
- `POST /api/v1/menus`
- `PUT /api/v1/menus/{id}`
- `DELETE /api/v1/menus/{id}`
- `GET /api/v1/roles`
- `POST /api/v1/roles`
- `PUT /api/v1/roles/{id}`
- `DELETE /api/v1/roles/{id}`
- `GET /api/v1/permissions`
- `POST /api/v1/permissions`
- `PUT /api/v1/permissions/{id}`
- `PUT /api/v1/roles/{id}/permissions`
- `PUT /api/v1/roles/{id}/menus`
- `PUT /api/v1/roles/{id}/data-scopes`
- `PUT /api/v1/users/{id}/roles`

### 组织与用户
- `GET /api/v1/tenants`
- `POST /api/v1/tenants`
- `GET /api/v1/tenants/{id}`
- `PUT /api/v1/tenants/{id}`
- `POST /api/v1/tenants/{id}/disable`
- `GET /api/v1/schools`
- `POST /api/v1/schools`
- `GET /api/v1/schools/{id}`
- `PUT /api/v1/schools/{id}`
- `POST /api/v1/schools/{id}/disable`
- `GET /api/v1/grades`
- `POST /api/v1/grades`
- `GET /api/v1/grades/{id}`
- `PUT /api/v1/grades/{id}`
- `POST /api/v1/grades/{id}/disable`
- `GET /api/v1/classes`
- `POST /api/v1/classes`
- `GET /api/v1/classes/{id}`
- `PUT /api/v1/classes/{id}`
- `POST /api/v1/classes/{id}/disable`
- `GET /api/v1/courses`
- `POST /api/v1/courses`
- `GET /api/v1/courses/{id}`
- `PUT /api/v1/courses/{id}`
- `POST /api/v1/courses/{id}/disable`
- `GET /api/v1/users`
- `POST /api/v1/users`
- `GET /api/v1/users/{id}`
- `PUT /api/v1/users/{id}`
- `POST /api/v1/users/{id}/reset-password`
- `POST /api/v1/users/{id}/disable`
- `POST /api/v1/students/transitions`
- `POST /api/v1/teachers/assignments`
- `PUT /api/v1/teachers/assignments/{id}/end`

### 题库与题目
- `GET /api/v1/question-banks`
- `POST /api/v1/question-banks`
- `PUT /api/v1/question-banks/{id}`
- `POST /api/v1/question-banks/{id}/visibility`
- `GET /api/v1/questions`
- `POST /api/v1/questions`
- `PUT /api/v1/questions/{id}`
- `GET /api/v1/questions/{id}/versions`
- `POST /api/v1/questions/{id}/versions`
- `POST /api/v1/questions/{id}/comments`
- `POST /api/v1/questions/{id}/challenges`

### 练题
- `POST /api/v1/practice/sessions`
- `GET /api/v1/practice/sessions/{id}`
- `POST /api/v1/practice/sessions/{id}/answer`
- `POST /api/v1/practice/questions/{id}/mark-mastered`
- `POST /api/v1/practice/questions/{id}/mark-confused`
- `GET /api/v1/user-question-states`

### 考试
- `GET /api/v1/exams`
- `POST /api/v1/exams`
- `PUT /api/v1/exams/{id}`
- `POST /api/v1/exams/{id}/publish`
- `POST /api/v1/exams/{id}/generate-paper`
- `POST /api/v1/exams/{id}/attempts`
- `POST /api/v1/exam-attempts/{id}/answers`
- `POST /api/v1/exam-attempts/{id}/submit`
- `GET /api/v1/exam-attempts/{id}/result`

### 公告通知
- `GET /api/v1/notices`
- `POST /api/v1/notices`
- `POST /api/v1/notices/{id}/publish`
- `POST /api/v1/notices/{id}/recall`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/{id}/read`

### 导入
- `POST /api/v1/import/jobs`
- `GET /api/v1/import/jobs`
- `GET /api/v1/import/jobs/{id}`
- `GET /api/v1/import/jobs/{id}/rows`
- `GET /api/v1/import/templates/{type}`

### 文件资产
- `POST /api/v1/files/upload`
- `POST /api/v1/files/import-url`
- `GET /api/v1/files/{id}`

### 统计分析
- `GET /api/v1/analytics/practice-overview`
- `GET /api/v1/analytics/exam-overview`
- `GET /api/v1/analytics/wrong-questions`
- `GET /api/v1/analytics/class-performance`

---

## 6. 认证接口

## 6.1 登录

### POST `/api/v1/auth/login`

**Tag**: Auth

### Request Body
```json
{
  "tenant_code": "school_alpha",
  "username": "teacher001",
  "password": "******"
}
```

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "access_token": "jwt",
    "refresh_token": "jwt_refresh",
    "expires_in": 7200,
    "user": {
      "id": 1,
      "tenant_id": 1001,
      "display_name": "张老师",
      "user_type": "teacher",
      "roles": ["teacher"]
    }
  },
  "request_id": "req_1"
}
```

### 说明
- 登录成功后返回租户与角色上下文。
- 前端管理端与用户端共用此接口，具体菜单按角色返回。
- 登录请求必须携带 `tenant_code`，避免不同租户下同名用户无法定位；平台系统管理员使用 `tenant_code=platform`。

---

## 6.2 登出

### POST `/api/v1/auth/logout`

需要携带 `Authorization: Bearer <access_token>`。

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": true,
  "request_id": "req_2"
}
```

---

## 6.3 刷新 Token

### POST `/api/v1/auth/refresh`

### Request Body
```json
{
  "refresh_token": "jwt_refresh"
}
```

### 说明
- 使用 refresh token 换取新的 access/refresh token 对。

---

## 6.4 获取当前用户

### GET `/api/v1/auth/me`

需要携带 `Authorization: Bearer <access_token>`。

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1,
    "tenant_id": 1001,
    "display_name": "张老师",
    "user_type": "teacher",
    "roles": ["teacher"],
    "data_scope": {
      "type": "self"
    }
  },
  "request_id": "req_3"
}
```

---

## 7. RBAC 接口

## 7.1 获取菜单

### GET `/api/v1/menus`

### Query
- `app_type`: `admin` / `user`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": 1,
      "name": "题库管理",
      "path": "/question-banks",
      "children": []
    }
  ],
  "request_id": "req_4"
}
```

---

## 7.1.1 创建菜单

### POST `/api/v1/menus`

### Request Body
```json
{
  "parent_id": null,
  "name": "题库管理",
  "menu_type": "menu",
  "path": "/admin/question-banks",
  "component": "question-bank/page",
  "icon": "database",
  "permission_code": "question_bank:view",
  "visible": true,
  "sort_no": 10
}
```

## 7.1.2 更新菜单

### PUT `/api/v1/menus/{id}`

### 说明
- 可更新名称、路径、组件、权限码、可见性和排序。
- 调整父级时必须防止形成循环树。

## 7.1.3 删除菜单

### DELETE `/api/v1/menus/{id}`

### 说明
- 若存在子菜单，应返回 `4091001` 状态冲突。

---

## 7.2 角色列表

### GET `/api/v1/roles`

### Query
- `page`
- `page_size`
- `status`

---

## 7.3 创建角色

### POST `/api/v1/roles`

### Request Body
```json
{
  "code": "school_reviewer",
  "name": "学校审核员",
  "role_type": "custom",
  "data_scope_type": "subtree",
  "remark": "可审核题目质疑"
}
```

---

## 7.4 更新角色

### PUT `/api/v1/roles/{id}`

---

## 7.4.1 删除角色

### DELETE `/api/v1/roles/{id}`

### 说明
- 内置角色不允许删除。
- 已绑定用户的角色应返回 `4091001`，由调用方先解绑再删除。

---

## 7.5 权限列表

### GET `/api/v1/permissions`

---

## 7.5.1 创建权限

### POST `/api/v1/permissions`

### Request Body
```json
{
  "code": "question_bank:create",
  "module": "question_bank",
  "action_name": "create",
  "resource_type": "question_bank",
  "name": "创建题库",
  "description": "允许创建题库"
}
```

## 7.5.2 更新权限

### PUT `/api/v1/permissions/{id}`

### 说明
- 权限 `code` 发布后原则上不建议修改；确需修改时必须同步角色授权和菜单权限码。

---

## 7.6 分配角色权限

### PUT `/api/v1/roles/{id}/permissions`

### Request Body
```json
{
  "permission_ids": [1, 2, 3, 10]
}
```

---

## 7.6.1 分配角色菜单

### PUT `/api/v1/roles/{id}/menus`

### Request Body
```json
{
  "menu_ids": [1, 2, 3, 20]
}
```

## 7.6.2 配置角色数据范围

### PUT `/api/v1/roles/{id}/data-scopes`

### Request Body
```json
{
  "data_scopes": [
    {
      "scope_type": "tenant",
      "target_id": 1001,
      "include_children": true
    }
  ]
}
```

---

## 7.7 给用户分配角色

### PUT `/api/v1/users/{id}/roles`

### Request Body
```json
{
  "role_ids": [2, 3]
}
```

---

## 8. 组织与用户接口

## 8.0 租户接口

### GET `/api/v1/tenants`

### Query
- `status`
- `keyword`

### POST `/api/v1/tenants`

### Request Body
```json
{
  "code": "school_001",
  "name": "第一中学",
  "tenant_type": "school",
  "remark": "一期租户"
}
```

### GET `/api/v1/tenants/{id}`

### PUT `/api/v1/tenants/{id}`

### POST `/api/v1/tenants/{id}/disable`

### 说明
- `platform` 平台级虚拟租户为系统内置数据，不允许通过普通接口禁用或删除。
- 当前阶段不支持集团总部 + 子校区层级租户。

---

## 8.1 学校列表

### GET `/api/v1/schools`

### Query
- `status`
- `keyword`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {"id": 1, "name": "第一中学", "status": "active"}
    ],
    "page": 1,
    "page_size": 20,
    "total": 1
  },
  "request_id": "req_5"
}
```

### POST `/api/v1/schools`

### Request Body
```json
{
  "code": "school_001",
  "name": "第一中学"
}
```

### 说明
- 当前阶段学校归属默认从登录 token 中的 `tenant_id` 推导，不再由请求体直接传入。

### GET `/api/v1/schools/{id}`

### PUT `/api/v1/schools/{id}`

### POST `/api/v1/schools/{id}/disable`

---

## 8.2 年级列表

### GET `/api/v1/grades`

### Query
- `school_id`
- `status`

### POST `/api/v1/grades`

### Request Body
```json
{
  "school_id": 1,
  "code": "grade_2026",
  "name": "七年级",
  "grade_level": 7,
  "school_year": "2026"
}
```

### GET `/api/v1/grades/{id}`

### PUT `/api/v1/grades/{id}`

### POST `/api/v1/grades/{id}/disable`

## 8.3 班级列表

### GET `/api/v1/classes`

### Query
- `school_id`
- `grade_id`
- `status`

### POST `/api/v1/classes`

### Request Body
```json
{
  "school_id": 1,
  "grade_id": 2,
  "code": "class_01",
  "name": "一班",
  "class_no": 1
}
```

### GET `/api/v1/classes/{id}`

### PUT `/api/v1/classes/{id}`

### POST `/api/v1/classes/{id}/disable`

## 8.4 课程列表

### GET `/api/v1/courses`

### Query
- `status`
- `keyword`
- `active_at`

### POST `/api/v1/courses`

### Request Body
```json
{
  "code": "math",
  "name": "数学",
  "start_at": "2026-09-01T00:00:00+08:00",
  "end_at": "2027-01-31T23:59:59+08:00",
  "description": "七年级数学"
}
```

### GET `/api/v1/courses/{id}`

### PUT `/api/v1/courses/{id}`

### POST `/api/v1/courses/{id}/disable`

### 说明
- `start_at` / `end_at` 用于课程可用时间窗口，不代表学期模型。
- 若未来需要班级维度的开课时间，可在班级课程关系中扩展。

## 8.5 用户列表

### GET `/api/v1/users`

### Query
- `user_type`
- `school_id`
- `grade_id`
- `class_id`
- `keyword`

### POST `/api/v1/users`

### Request Body
```json
{
  "username": "teacher001",
  "display_name": "张老师",
  "user_type": "teacher",
  "phone": "13800000000",
  "email": "teacher001@example.com",
  "password": "Init@123456",
  "role_ids": [3]
}
```

### GET `/api/v1/users/{id}`

### PUT `/api/v1/users/{id}`

### POST `/api/v1/users/{id}/reset-password`

### Request Body
```json
{
  "new_password": "New@123456"
}
```

### POST `/api/v1/users/{id}/disable`

---

## 8.6 学生流转

### POST `/api/v1/students/transitions`

### Request Body
```json
{
  "student_id": 10001,
  "transition_type": "class_change",
  "from_school_id": 1,
  "from_grade_id": 2,
  "from_class_id": 3,
  "to_school_id": 1,
  "to_grade_id": 2,
  "to_class_id": 4,
  "occurred_at": "2026-04-21T10:00:00+08:00",
  "remark": "调班"
}
```

### 业务说明
- 成功后应更新 `student_class_memberships`
- 同时写入 `student_transitions`
- 建议写审计日志与快照

---

## 8.7 教师任课分配

### POST `/api/v1/teachers/assignments`

### Request Body
```json
{
  "teacher_id": 20001,
  "school_id": 1,
  "grade_id": 2,
  "class_id": 3,
  "course_id": 10,
  "effective_from": "2026-04-21T00:00:00+08:00"
}
```

### 业务说明
- 需校验同一班级同一课程仅一位当前教师
- 同时写入历史表

---

## 9. 题库接口

## 9.1 题库列表

### GET `/api/v1/question-banks`

### Query
- `course_id`
- `status`
- `keyword`
- `page`
- `page_size`

### Response Item
```json
{
  "id": 1,
  "tenant_id": 2,
  "name": "高一数学基础题库",
  "course_id": 10,
  "status": "active",
  "owner_org_type": "school",
  "owner_org_id": 1,
  "creator_id": 20001,
  "source_type": "manual",
  "description": "代数基础"
}
```

### 说明
- 阶段 2A 题库归属先固定为学校级。
- 列表返回统一分页结构：`items / page / page_size / total`。

---

## 9.2 创建题库

### POST `/api/v1/question-banks`

### Request Body
```json
{
  "name": "高一数学基础题库",
  "course_id": 10,
  "description": "代数基础"
}
```

### 业务说明
- 新建默认 `status=draft`
- 新建默认 `source_type=manual`
- 新建默认 `owner_org_type=school`

---

## 9.3 更新题库

### PUT `/api/v1/question-banks/{id}`

### Request Body
```json
{
  "name": "高一数学基础题库（修订）",
  "course_id": 10,
  "description": "代数基础与函数入门"
}
```

### 业务说明
- 仅允许更新当前租户下的题库
- 更新不改变题库归属与来源类型

---

## 9.4 发布题库

### POST `/api/v1/question-banks/{id}/publish`

### 业务说明
- 发布后 `status` 变更为 `active`
- 阶段 2A 不实现归档流转

---

## 9.5 下发题库可见范围

### POST `/api/v1/question-banks/{id}/visibility`

### Request Body
```json
{
  "grants": [
    {
      "grant_type": "class",
      "target_type": "class",
      "target_id": 301,
      "permission_type": "practice",
      "inherit_to_children": false
    },
    {
      "grant_type": "grade",
      "target_type": "grade",
      "target_id": 21,
      "permission_type": "exam",
      "inherit_to_children": true
    }
  ]
}
```

### 说明
- 题库下发采用授权模型，不复制题库或题目。
- `permission_type` 阶段 2A 开放 `view / practice / exam`
- `target_type` 阶段 2A 开放 `school / grade / class / user`

---

## 10. 题目接口

## 10.1 题目列表

### GET `/api/v1/questions`

### Query
- `question_type`
- `course_id`
- `bank_id`
- `status`
- `keyword`
- `page`
- `page_size`

### Response Item
```json
{
  "id": 1001,
  "tenant_id": 2,
  "owner_org_type": "school",
  "owner_org_id": 1,
  "question_type": "single_choice",
  "difficulty": "medium",
  "status": "active",
  "current_version_id": 3001,
  "current_version_no": 1,
  "source_type": "manual",
  "creator_id": 20001,
  "bank_ids": [1, 2]
}
```

### 说明
- 列表返回统一分页结构：`items / page / page_size / total`
- `course_id` 查询通过题库与课程关系过滤题目

---

## 10.2 创建题目

### POST `/api/v1/questions`

### Request Body
```json
{
  "question_type": "single_choice",
  "difficulty": "medium",
  "content": {
    "stem": {
      "content_type": "text",
      "text": "1+1等于几？",
      "assets": []
    },
    "options": [
      {"key": "A", "content_type": "text", "text": "1", "assets": []},
      {"key": "B", "content_type": "text", "text": "2", "assets": []},
      {"key": "C", "content_type": "text", "text": "3", "assets": []}
    ],
    "option_order_randomizable": true,
    "ext": {}
  },
  "answer": {
    "judge_mode": "by_option_key",
    "correct_keys": ["B"]
  },
  "analysis": {
    "text": "基础算术"
  },
  "bank_ids": [1, 2]
}
```

### 业务说明
- 创建时生成 `questions`
- 同时生成 `question_versions(version_no=1)`
- 题库关系写入 `question_bank_questions`
- 阶段 2A 仅开放 `single_choice / multiple_choice / true_false`

---

## 10.3 更新题目主信息

### PUT `/api/v1/questions/{id}`

### 说明
- 不直接覆盖内容版本
- 仅更新非版本化主字段，如 `status`、`difficulty`

### Request Body
```json
{
  "difficulty": "hard",
  "status": "disabled"
}
```

---

## 10.4 获取题目版本列表

### GET `/api/v1/questions/{id}/versions`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": 3001,
      "question_id": 1001,
      "version_no": 1,
      "content": {
        "stem": {
          "content_type": "text",
          "text": "1+1等于几？",
          "assets": []
        },
        "options": [
          {"key": "A", "content_type": "text", "text": "1", "assets": []},
          {"key": "B", "content_type": "text", "text": "2", "assets": []}
        ],
        "option_order_randomizable": true,
        "ext": {}
      },
      "answer": {
        "judge_mode": "by_option_key",
        "correct_keys": ["B"]
      },
      "analysis": {
        "text": "基础算术"
      },
      "structure_hash": "sha256:demo",
      "change_summary": "初始版本",
      "created_by": 20001,
      "created_at": "2026-04-21T10:00:00+08:00"
    }
  ],
  "request_id": "req_6"
}
```

---

## 10.5 新增题目版本

### POST `/api/v1/questions/{id}/versions`

### Request Body
```json
{
  "content": {
    "stem": {
      "content_type": "text",
      "text": "1+1=？",
      "assets": []
    },
    "options": [
      {"key": "A", "content_type": "text", "text": "1", "assets": []},
      {"key": "B", "content_type": "text", "text": "2", "assets": []}
    ],
    "option_order_randomizable": true,
    "ext": {}
  },
  "answer": {
    "judge_mode": "by_option_key",
    "correct_keys": ["B"]
  },
  "analysis": {
    "text": "修正后的解析"
  },
  "change_summary": "修复题干文案"
}
```

### 说明
- 题目修订应新增版本，不直接覆盖历史版本
- 考试与练题记录需要绑定 `question_version_id`
- 新版本创建成功后，`questions.current_version_id` 应回指最新版本

---

## 10.6 题目评论

### POST `/api/v1/questions/{id}/comments`

### Request Body
```json
{
  "question_version_id": 3001,
  "content": "这题可以再加一个解法",
  "comment_type": "discussion",
  "is_private": false,
  "parent_comment_id": null
}
```

---

## 10.7 发起题目质疑

### POST `/api/v1/questions/{id}/challenges`

### Request Body
```json
{
  "question_version_id": 3001,
  "challenge_type": "wrong_answer",
  "description": "答案应为B，目前系统判定为A",
  "attachments": [
    {"url": "https://example.com/1.png", "type": "image"}
  ]
}
```

### 说明
- 普通评论与质疑流程分离
- 质疑应进入审核流，并在采纳后生成新版本。

---

## 11. 练题接口

## 11.1 创建练题会话

### POST `/api/v1/practice/sessions`

### Request Body
```json
{
  "practice_mode": "random",
  "source_mode": "multi_bank",
  "flow_mode": "fixed_count",
  "bank_ids": [1, 2],
  "exclude_mastered": true,
  "question_count": 10
}
```

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 501,
    "practice_mode": "random",
    "source_mode": "multi_bank",
    "flow_mode": "fixed_count",
    "status": "active",
    "questions": [
      {
        "session_question_id": 9001,
        "session_id": 501,
        "question_id": 1001,
        "question_version_id": 3001,
        "display_order": 1,
        "question_type": "single_choice",
        "content": {
          "stem": {"content_type": "text", "text": "1+1等于几？", "assets": []},
          "options": [
            {"key": "A", "content_type": "text", "text": "1", "assets": []}
            {"key": "B", "content_type": "text", "text": "2", "assets": []}
          ],
          "option_order_randomizable": true,
          "ext": {}
        },
        "round_no": 1
      }
    ]
  },
  "request_id": "req_7"
}
```

### 说明
- 支持顺序练题 / 随机练题
- 支持单题库 / 多题库
- 支持 `fixed_count` 与 `continuous`
- 定量练习未传题量时默认 10 题
- 熟题可从练题中排除，这来自原始需求。

---

## 11.2 获取练题会话详情

### GET `/api/v1/practice/sessions/{id}`

返回会话基础信息与已抽取题目。

---

## 11.3 获取下一题

### POST `/api/v1/practice/sessions/{id}/next-question`

主要用于连续刷题。

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "question": {
      "session_question_id": 9002,
      "session_id": 501,
      "question_id": 1002,
      "question_version_id": 3002,
      "display_order": 2,
      "question_type": "single_choice",
      "content": {
        "stem": {"content_type": "text", "text": "第二题", "assets": []},
        "options": [
          {"key": "A", "content_type": "text", "text": "1", "assets": []},
          {"key": "B", "content_type": "text", "text": "2", "assets": []}
        ],
        "option_order_randomizable": true,
        "ext": {}
      },
      "round_no": 1
    },
    "round_no": 1
  }
}
```

---

## 11.4 提交练题答案

### POST `/api/v1/practice/sessions/{id}/answer`

### Request Body
```json
{
  "session_question_id": 9001,
  "answer": {
    "selected_keys": ["B"]
  }
}
```

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "is_correct": true,
    "correct_answer": {
      "judge_mode": "by_option_key",
      "correct_keys": ["B"]
    },
    "analysis": {
      "text": "基础算术"
    },
    "state": {
      "practice_correct_count": 1,
      "practice_wrong_count": 0,
      "is_mastered": false,
      "is_confused": false
    }
  },
  "request_id": "req_8"
}
```

### 业务说明
- 写入 `practice_answers`
- 更新 `user_question_states`
- 若用户手动标熟/标疑惑，再分别调用独立接口

---

## 11.5 结束练题会话

### POST `/api/v1/practice/sessions/{id}/finish`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 501,
    "status": "finished",
    "answered_count": 8,
    "correct_count": 6,
    "wrong_count": 2
  }
}
```

---

## 11.6 标记熟题

### POST `/api/v1/practice/questions/{id}/mark-mastered`

### Request Body
```json
{
  "value": true
}
```

---

## 11.7 标记疑惑题

### POST `/api/v1/practice/questions/{id}/mark-confused`

### Request Body
```json
{
  "value": true
}
```

---

## 11.8 用户题目状态列表

### GET `/api/v1/user-question-states`

### Query
- `state_type`: `wrong` / `mastered` / `confused`
- `bank_id`
- `page`
- `page_size`

### 阶段 2D 增强响应字段
- `question_type`
- `content`

用于错题本、熟题本、疑惑题列表直接展示题干摘要，并支持从当前筛选结果继续练。

---

## 11.9 练题记录列表

### GET `/api/v1/practice/sessions`

### Query
- `status`: `active` / `finished`
- `flow_mode`: `fixed_count` / `continuous`
- `practice_mode`: `random` / `sequential`
- `page`
- `page_size`

### Response Data
```json
{
  "items": [
    {
      "id": 501,
      "status": "finished",
      "practice_mode": "random",
      "source_mode": "multi_bank",
      "flow_mode": "fixed_count",
      "bank_ids": [1, 2],
      "total_count": 10,
      "answered_count": 10,
      "correct_count": 8,
      "wrong_count": 2,
      "accuracy": 0.8
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

### 业务说明
- 默认按会话维度展示练题记录。
- 统计口径按每道会话题目的最新一次作答计算。
- 仅返回当前登录用户自己的练题会话。

---

## 11.10 练题会话结果详情

### GET `/api/v1/practice/sessions/{id}/results`

### Response Data
```json
{
  "session": {
    "id": 501,
    "status": "finished",
    "answered_count": 10,
    "correct_count": 8,
    "wrong_count": 2,
    "accuracy": 0.8
  },
  "questions": [
    {
      "session_question_id": 9001,
      "question_id": 1001,
      "question_version_id": 3001,
      "display_order": 1,
      "question_type": "single_choice",
      "content": {},
      "answer": {"selected_keys": ["B"]},
      "correct_answer": {"judge_mode": "by_option_key", "correct_keys": ["B"]},
      "is_correct": true,
      "analysis": {"text": "基础算术"},
      "state": {
        "practice_correct_count": 1,
        "practice_wrong_count": 0,
        "is_mastered": false,
        "is_confused": false
      }
    }
  ]
}
```

### 业务说明
- 用于练题结果页和练题会话详情页。
- 仅允许查看当前登录用户自己的会话，跨用户或跨租户返回 404。

---

## 11.11 从题目列表继续练

### POST `/api/v1/practice/sessions/from-questions`

### Request Body
```json
{
  "question_ids": [1001, 1002],
  "practice_mode": "random",
  "flow_mode": "fixed_count",
  "question_count": 10,
  "exclude_mastered": false
}
```

### 业务说明
- 用于错题本、熟题本、疑惑题从当前筛选结果发起新练习。
- `question_count` 未传或小于等于 0 时默认 10。
- 候选题为空时返回明确的暂无可练题目错误。
- 后端仍按当前租户和当前用户状态校验候选题。

---

## 12. 考试接口

## 12.1 考试列表

### GET `/api/v1/exams`

### Query
- `status`
- `keyword`
- `target_type`
- `target_id`

---

## 12.2 创建考试

### POST `/api/v1/exams`

### Request Body
```json
{
  "name": "高一数学周测1",
  "exam_mode": "random_assembly",
  "start_time": "2026-04-25T09:00:00+08:00",
  "end_time": "2026-04-25T10:00:00+08:00",
  "duration_minutes": 60,
  "targets": [
    {"target_type": "class", "target_id": 301}
  ],
  "paper_rules": [
    {
      "question_type": "single_choice",
      "score_per_question": 2,
      "question_count": 10,
      "knowledge_tag_ids": [11, 12],
      "bank_ids": [1, 2],
      "course_id": 10,
      "per_knowledge_count": {
        "11": 5,
        "12": 5
      }
    }
  ]
}
```

### 说明
- 满足按题型、分值、数量、知识点随机组卷的要求。

---

## 12.3 更新考试

### PUT `/api/v1/exams/{id}`

---

## 12.4 发布考试

### POST `/api/v1/exams/{id}/publish`

### Request Body
```json
{
  "generate_paper_now": true
}
```

### 业务说明
- 更新 `exams.status`
- 根据规则生成试卷
- 写 `notifications`

---

## 12.5 生成试卷

### POST `/api/v1/exams/{id}/generate-paper`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "paper_id": 801,
    "question_count": 20,
    "total_score": 100
  },
  "request_id": "req_9"
}
```

---

## 12.6 开始考试

### POST `/api/v1/exams/{id}/attempts`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "attempt_id": 90001,
    "paper": {
      "paper_id": 801,
      "questions": [
        {
          "question_id": 1001,
          "question_version_id": 3001,
          "display_order": 1,
          "content": {
            "stem": {"content_type": "text", "text": "1+1等于几？", "assets": []},
            "options": [
              {"key": "B", "content_type": "text", "text": "2", "assets": []},
              {"key": "A", "content_type": "text", "text": "1", "assets": []}
            ]
          },
          "score": 2
        }
      ]
    }
  },
  "request_id": "req_10"
}
```

---

## 12.7 提交考试作答

### POST `/api/v1/exam-attempts/{id}/answers`

### Request Body
```json
{
  "answers": [
    {
      "question_id": 1001,
      "question_version_id": 3001,
      "display_order": 1,
      "answer": {
        "selected_keys": ["B"]
      }
    }
  ]
}
```

### 说明
- 服务端落库时应保存 `presented_options_json`
- 考试答题与练题答题必须分离

---

## 12.8 交卷

### POST `/api/v1/exam-attempts/{id}/submit`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "attempt_id": 90001,
    "status": "submitted",
    "objective_score": 96
  },
  "request_id": "req_11"
}
```

---

## 12.9 获取考试结果

### GET `/api/v1/exam-attempts/{id}/result`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "attempt_id": 90001,
    "final_score": 96,
    "objective_score": 96,
    "subjective_score": 0,
    "answers": [
      {
        "question_id": 1001,
        "is_correct": true,
        "score": 2
      }
    ]
  },
  "request_id": "req_12"
}
```

---

## 13. 公告与通知接口

## 13.1 公告列表

### GET `/api/v1/notices`

### Query
- `status`
- `notice_type`

## 13.2 创建公告

### POST `/api/v1/notices`

### Request Body
```json
{
  "title": "系统维护通知",
  "content": "周五晚维护",
  "notice_type": "system",
  "publish_scope_type": "all",
  "publish_scope": {},
  "publish_at": "2026-04-22T09:00:00+08:00",
  "expire_at": "2026-04-23T09:00:00+08:00"
}
```

## 13.3 发布公告

### POST `/api/v1/notices/{id}/publish`

---

## 13.4 撤回公告

### POST `/api/v1/notices/{id}/recall`

### 说明
- 阶段 1 先支持 `publish_scope_type=all`，并兼容 `user_ids` 的定向发布结构。

---

## 13.5 通知列表

### GET `/api/v1/notifications`

### Query
- `status`
- `category`

## 13.6 已读通知

### POST `/api/v1/notifications/{id}/read`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": true,
  "request_id": "req_13"
}
```

---

## 14. 导入接口

## 14.1 创建导入任务

### POST `/api/v1/import/jobs`

### Content-Type
- `application/json`

### Request
```json
{
  "import_type": "question",
  "template_version": "v1",
  "file_asset_id": 30001,
  "file_url": "/api/v1/files/30001/content",
  "content": "bank_name,course_name,question_type,..."
}
```

### 字段说明
- `import_type`: `question` / `question_bank`，阶段 2B 支持题目和题库导入。
- `template_version`: 模板版本，默认 `v1`。
- `file_asset_id`: 可选，关联文件资产。
- `file_url`: 必填，记录导入来源地址。
- `content`: 必填，阶段 2B 同步导入使用的 CSV 文本内容；后续接入对象存储后可由服务端读取文件资产内容。

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 10001,
    "tenant_id": 1,
    "import_type": "question",
    "template_version": "v1",
    "file_asset_id": 30001,
    "file_url": "/api/v1/files/30001/content",
    "status": "partial_success",
    "total_rows": 2,
    "success_rows": 1,
    "failed_rows": 1,
    "error_summary": "1 行导入失败",
    "operator_id": 1
  },
  "request_id": "req_14"
}
```

---

## 14.2 导入任务列表

### GET `/api/v1/import/jobs`

### Query
- `import_type`
- `status`
- `page`
- `page_size`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 10001,
        "tenant_id": 1,
        "import_type": "question",
        "template_version": "v1",
        "file_url": "/api/v1/files/30001/content",
        "status": "partial_success",
        "total_rows": 2,
        "success_rows": 1,
        "failed_rows": 1,
        "operator_id": 1
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 1
  },
  "request_id": "req_14_list"
}
```

---

## 14.3 导入任务详情

### GET `/api/v1/import/jobs/{id}`

按 `tenant_id` 隔离，跨租户访问返回 404。

---

## 14.4 导入明细行列表

### GET `/api/v1/import/jobs/{id}/rows`

### Query
- `status`: `success` / `failed`
- `page`
- `page_size`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 90001,
        "job_id": 10001,
        "row_no": 2,
        "raw_data": {
          "bank_name": "未知题库"
        },
        "status": "failed",
        "error_code": "bank_not_found",
        "error_message": "题库不存在"
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 1
  },
  "request_id": "req_15"
}
```

---

## 14.5 下载导入模板

### GET `/api/v1/import/templates/{type}`

### Path Param
- `type`: `question` / `question_bank` / `exam`

### Response
- `text/csv; charset=utf-8`

### 说明
- 阶段 2B 模板从仓库 `docs/templates` 读取。
- `question`、`question_bank`、`exam` 三类模板均可下载。
- `exam` 当前仅支持模板下载，考试导入落库进入后续阶段。

---

## 15. 文件资产接口

## 15.1 上传文件

### POST `/api/v1/files/upload`

### Content-Type
- `multipart/form-data`

### Form Data
- `file`
- `usage`: `question_asset` / `challenge_attachment` / `import_file`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 30001,
    "object_key": "tenant/1001/question/20260421/a.png",
    "url": "/api/v1/files/30001/content",
    "mime_type": "image/png",
    "file_size": 102400
  },
  "request_id": "req_file_1"
}
```

## 15.2 第三方 URL 转储

### POST `/api/v1/files/import-url`

### Request Body
```json
{
  "url": "https://example.com/source.png",
  "usage": "question_asset"
}
```

### 说明
- 服务端应下载远端资源、校验大小和 MIME，并登记 `file_assets`。
- 一期只定义接口契约，具体 MinIO/OSS 客户端配置后续补齐。

## 15.3 文件资产详情

### GET `/api/v1/files/{id}`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 30001,
    "source_type": "remote_url",
    "object_key": "tenant/1001/question/20260421/a.png",
    "url": "/api/v1/files/30001/content",
    "mime_type": "image/png",
    "status": "active"
  },
  "request_id": "req_file_2"
}
```

---

## 16. 统计分析接口

## 16.1 练题概览

### GET `/api/v1/analytics/practice-overview`

### Query
- `school_id`
- `grade_id`
- `class_id`
- `course_id`
- `date_from`
- `date_to`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "total_practice_count": 1000,
    "correct_rate": 0.76,
    "wrong_question_user_count": 120
  },
  "request_id": "req_16"
}
```

---

## 16.2 考试概览

### GET `/api/v1/analytics/exam-overview`

---

## 16.3 错题分析

### GET `/api/v1/analytics/wrong-questions`

### Query
- `school_id`
- `grade_id`
- `class_id`
- `course_id`
- `tag_id`

---

## 16.4 班级表现分析

### GET `/api/v1/analytics/class-performance`

### 说明
- 管理员需查看错题情况、考试情况、刷题情况，因此统计分析接口应作为一期核心能力之一。

---

## 17. 审计接口（可选开放）

## 17.1 审计日志列表

### GET `/api/v1/audit-logs`

### Query
- `module_name`
- `action_name`
- `resource_type`
- `operator_user_id`
- `date_from`
- `date_to`

### 说明
- 建议仅系统管理员或租户管理员可访问

---

## 18. OpenAPI 组件建议

## 18.1 可抽出的通用 Schema

建议在 `components.schemas` 中统一维护：

- `BaseResponse`
- `PageResponse`
- `LoginRequest`
- `LoginResponse`
- `UserSummary`
- `RoleSummary`
- `MenuTreeNode`
- `QuestionContent`
- `QuestionOption`
- `QuestionAnswer`
- `QuestionSummary`
- `QuestionVersionSummary`
- `PracticeSession`
- `PracticeQuestion`
- `ExamSummary`
- `ExamAttemptSummary`
- `NotificationSummary`
- `ImportJobSummary`
- `ErrorResponse`

---

## 18.2 可抽出的通用参数

建议在 `components.parameters` 中维护：

- `PageParam`
- `PageSizeParam`
- `SortByParam`
- `SortOrderParam`
- `TenantIdHeader`（如果后续需要显式 header）
- `KeywordParam`
- `StatusParam`

---

## 19. 安全与权限说明

1. 所有接口必须基于角色权限 + 数据范围双重判断
2. 系统管理员可查看所有租户
3. 学校/组织层仅能查看自己及以下层级
4. 老师与学生仅可访问符合授权范围的数据
5. 题库下发通过 visibility 控制，不允许通过接口复制题库

---

## 20. 状态机建议

### 19.1 Question Challenge
- `pending`
- `reviewing`
- `accepted`
- `rejected`
- `merged`

### 19.2 Import Job
- `uploaded`
- `parsing`
- `validating`
- `importing`
- `partial_success`
- `success`
- `failed`

### 19.3 Exam
- `draft`
- `published`
- `ongoing`
- `ended`
- `archived`

### 19.4 Exam Attempt
- `not_started`
- `in_progress`
- `submitted`
- `timeout`
- `absent`

### 19.5 Notice
- `draft`
- `published`
- `expired`
- `recalled`

---

## 21. 已生成与后续产物

已基于本文档生成：

1. `api/openapi.yaml`
2. `database/migrations/` 拆分 migration 文件

后续进入阶段 1 后建议继续产出：
1. Go `handler / request / response DTO`
2. 接口权限矩阵
3. Postman / Apifox 导入文件
4. 前端 TypeScript API Client
5. 练题与考试的接口时序图

---

## 22. 交付建议

可以把这份 Markdown、`api/openapi.yaml` 和 `database/migrations/` 直接提供给 AI，并附上如下指令：

```text
请基于现有 OpenAPI 与 migration 基线生成：
1. Go DTO 与 handler 接口定义
2. 前端 TypeScript API Client
3. 接口权限矩阵
4. Postman / Apifox 导入文件
```

---

## 23. 收尾

这份文档目前是 **OpenAPI 设计说明版**，正式接口基线见 `api/openapi.yaml`。下一步最合适的是基于该 YAML 生成 Go DTO、handler 接口桩和前端 API Client。
