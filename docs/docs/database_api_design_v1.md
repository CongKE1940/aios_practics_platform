# 刷题软件数据库与 API 设计说明 v1

## 1. 文档目的

本文档用于在现有项目需求基础上，补齐数据库设计与 API 设计层面的关键缺口，作为后续 AI 生成完整 MySQL DDL、OpenAPI 文档、Go 后端实现和 React 前端对接的统一依据。

本文档重点解决以下问题：
- RBAC 权限模型缺失
- 题库下发模型不明确
- 题目版本化缺失
- 评论与质疑流程缺失
- 导入任务模型缺失
- 通知公告模型缺失
- 练题态与考试态混淆
- 审计与历史快照缺失
- 学生流转、教师任课历史缺失

---

## 2. 总体设计原则

### 2.1 一期目标
一期只做网页端，但数据模型和 API 设计必须兼容后续 iOS、Android、iPad、安卓平板。

### 2.2 核心建模原则
1. 多租户隔离 + 层级可见
2. 题目与题库分离
3. 题目必须版本化
4. 练题与考试分离
5. 下发采用授权，不采用复制
6. 当前关系与历史关系分离
7. 所有关键业务动作可审计
8. JSON 用于可扩展内容，关系表用于强约束

---

## 3. 领域划分

建议按以下 12 个领域设计数据库：

1. 租户与组织域
2. 用户与身份域
3. RBAC 权限域
4. 课程与班级教学关系域
5. 题库域
6. 题目域
7. 练题域
8. 考试域
9. 题目互动域
10. 公告通知域
11. 导入任务域
12. 审计与历史快照域

---

## 4. ER 关系说明

### 4.1 租户与组织域
表：
- tenants
- org_nodes
- schools
- grades
- classes
- courses

关系：
- `platform` 是系统内置平台级虚拟租户，用于承载系统管理员、全局角色、全局菜单、全局权限和系统级审计。
- 普通 tenant 对应一个学校或组织级租户；当前阶段不支持集团总部 + 子校区层级租户。
- org_nodes 用于表达学校、年级、班级等层级树
- grades 隶属 schools
- classes 隶属 grades
- courses 可以被多个班级开设，课程本身支持开始时间和结束时间，用于课程启停和筛选。

### 4.2 用户与身份域
表：
- users
- student_profiles
- teacher_profiles
- student_class_memberships
- teacher_class_course_assignments

关系：
- users 是统一账号主体
- 学生和老师通过各自 profile 扩展
- 学生当前归属和历史归属通过 student_class_memberships 体现
- 教师任课关系通过 teacher_class_course_assignments 体现
- 同一班级下同一课程同一时刻只能有一名有效任课教师

### 4.3 权限域
表：
- roles
- menus
- permissions
- user_roles
- role_permissions
- role_menu_permissions
- data_scopes

关系：
- 一个用户可以拥有多个角色
- 一个角色可以关联多个权限
- 菜单与权限分开维护
- 数据可见范围通过 data_scopes 控制，而不是只靠角色名

### 4.4 题库域
表：
- question_banks
- question_bank_visibility
- question_bank_questions

关系：
- 一个题库可包含多道题
- 一道题可属于多个题库
- 下发不复制题库，只增加 visibility 授权关系

### 4.5 题目域
表：
- questions
- question_versions
- tags
- question_tags
- user_question_tags

关系：
- questions 为逻辑题目主体
- question_versions 为题目各版本内容快照
- question_tags 存系统标签
- user_question_tags 存个人标签

### 4.6 题目互动域
表：
- question_comments
- question_challenges

关系：
- 评论是轻交互
- 质疑是带审核流的业务单据

### 4.7 练题域
表：
- practice_sessions
- practice_session_questions
- practice_answers
- user_question_states
- user_question_state_logs

### 4.8 考试域
表：
- exams
- exam_targets
- exam_papers
- exam_paper_question_rules
- exam_paper_questions
- exam_attempts
- exam_attempt_answers

### 4.9 通知域
表：
- notices
- notifications

### 4.10 导入域
表：
- import_jobs
- import_job_rows

### 4.11 审计与历史域
表：
- audit_logs
- student_transitions
- teacher_assignment_histories
- entity_snapshots

### 4.12 文件资产域
表：
- file_assets

关系：
- 题干图片、选项图片、质疑附件和导入文件统一先登记为文件资产。
- 一期只定义上传和第三方 URL 转储接口，具体 MinIO/OSS 连接参数后续在部署配置中补齐。
- 第三方 URL 不直接长期写入业务 JSON，必须转储后使用系统内的 asset URL 或 object_key。

---

## 5. 数据库设计说明

## 5.0 租户、平台租户与课程有效期补充

### tenants
- code varchar(64) not null unique
- name varchar(128) not null
- tenant_type varchar(32) not null
- status varchar(32) not null

约束：
- 系统初始化必须创建平台级虚拟租户：`code=platform`、`tenant_type=platform`。
- 系统管理员用户归属平台级虚拟租户，不再使用空租户 ID。

### courses
- id bigint pk
- tenant_id bigint not null
- code varchar(64) not null
- name varchar(128) not null
- start_at datetime null
- end_at datetime null
- status varchar(32) not null
- description varchar(255) null
- created_at datetime not null
- updated_at datetime not null
- deleted_at datetime null

说明：
- `start_at` / `end_at` 表示课程在当前租户内的可用时间窗口。
- 若某班级的实际开课时间与课程字典不同，后续可在班级课程关系扩展有效期；一期先以课程字段满足当前需求。

## 5.1 用户与身份

### users
- id bigint pk
- tenant_id bigint not null
- username varchar(64) unique
- phone varchar(32) null
- email varchar(128) null
- password_hash varchar(255) not null
- display_name varchar(128) not null
- user_type varchar(32) not null
- status varchar(32) not null
- last_login_at datetime null
- created_at datetime not null
- updated_at datetime not null
- deleted_at datetime null

说明：
- 系统管理员归属平台级虚拟租户，仍保留 `tenant_id bigint not null`，避免全局用户在鉴权、审计、角色绑定中出现空租户分支。

索引：
- uk_username
- idx_tenant_status
- idx_phone
- idx_email

### student_profiles
- id bigint pk
- user_id bigint not null unique
- student_no varchar(64) null
- tenant_id bigint not null
- school_id bigint not null
- enrollment_status varchar(32) not null
- entered_at datetime null
- graduated_at datetime null
- created_at datetime not null
- updated_at datetime not null

### teacher_profiles
- id bigint pk
- user_id bigint not null unique
- teacher_no varchar(64) null
- tenant_id bigint not null
- school_id bigint not null
- employment_status varchar(32) not null
- hired_at datetime null
- left_at datetime null
- created_at datetime not null
- updated_at datetime not null

### student_class_memberships
- id bigint pk
- tenant_id bigint not null
- student_id bigint not null
- school_id bigint not null
- grade_id bigint not null
- class_id bigint not null
- is_current tinyint not null default 1
- status varchar(32) not null
- joined_at datetime not null
- left_at datetime null
- created_by bigint null
- created_at datetime not null

约束建议：
- 一个学生同一时刻只能有一个 current 归属

索引：
- idx_student_current
- idx_class_current
- idx_grade_current

### teacher_class_course_assignments
- id bigint pk
- tenant_id bigint not null
- teacher_id bigint not null
- school_id bigint not null
- grade_id bigint not null
- class_id bigint not null
- course_id bigint not null
- is_current tinyint not null default 1
- status varchar(32) not null
- effective_from datetime not null
- effective_to datetime null
- created_at datetime not null
- updated_at datetime not null

关键唯一约束：
- 同一个 class_id + course_id 同一时刻只允许一条有效记录

---

## 5.2 RBAC 权限模型

### roles
- id bigint pk
- tenant_id bigint not null
- code varchar(64) not null
- name varchar(128) not null
- role_type varchar(32) not null
- data_scope_type varchar(32) not null
- status varchar(32) not null
- remark varchar(255) null
- created_at datetime not null
- updated_at datetime not null

唯一约束：
- tenant_id + code

### permissions
- id bigint pk
- code varchar(128) not null unique
- module varchar(64) not null
- action varchar(64) not null
- resource_type varchar(64) null
- name varchar(128) not null
- description varchar(255) null
- created_at datetime not null

### menus
- id bigint pk
- parent_id bigint null
- name varchar(128) not null
- menu_type varchar(32) not null
- path varchar(255) null
- component varchar(255) null
- icon varchar(64) null
- permission_code varchar(128) null
- visible tinyint not null default 1
- sort_no int not null default 0
- created_at datetime not null
- updated_at datetime not null

### user_roles
- id bigint pk
- tenant_id bigint not null
- user_id bigint not null
- role_id bigint not null
- effective_from datetime null
- effective_to datetime null
- created_at datetime not null

### role_permissions
- id bigint pk
- role_id bigint not null
- permission_id bigint not null
- created_at datetime not null

唯一约束：
- role_id + permission_id

### role_menu_permissions
- id bigint pk
- role_id bigint not null
- menu_id bigint not null
- created_at datetime not null

### data_scopes
- id bigint pk
- role_id bigint not null
- scope_type varchar(32) not null
- target_id bigint null
- include_children tinyint not null default 0
- created_at datetime not null

说明：
- 系统管理员：all
- 学校管理员：tenant / subtree
- 老师：自己任教班级 + 自己创建内容 + 被授权题库
- 学生：自己 + 所属班级可见内容

---

## 5.3 题库与题目

### question_banks
- id bigint pk
- tenant_id bigint not null
- owner_org_type varchar(32) not null
- owner_org_id bigint not null
- creator_id bigint not null
- course_id bigint null
- name varchar(255) not null
- description varchar(500) null
- status varchar(32) not null
- source_type varchar(32) not null
- created_at datetime not null
- updated_at datetime not null

### question_bank_visibility
- id bigint pk
- question_bank_id bigint not null
- tenant_id bigint not null
- grant_type varchar(32) not null
- target_type varchar(32) not null
- target_id bigint not null
- permission_type varchar(32) not null
- inherit_to_children tinyint not null default 0
- granted_by bigint not null
- granted_at datetime not null
- expired_at datetime null
- status varchar(32) not null

唯一约束建议：
- question_bank_id + grant_type + target_type + target_id + permission_type

说明：
- 题库下发必须采用 visibility 授权模式，不采用复制模式
- 下级可见的是同一份题库，不会产生多个副本

### questions
- id bigint pk
- tenant_id bigint not null
- owner_org_type varchar(32) not null
- owner_org_id bigint not null
- question_type varchar(32) not null
- difficulty varchar(32) null
- current_version_id bigint null
- status varchar(32) not null
- source_type varchar(32) not null
- creator_id bigint not null
- created_at datetime not null
- updated_at datetime not null

### question_versions
- id bigint pk
- question_id bigint not null
- version_no int not null
- content_json json not null
- answer_json json not null
- analysis_json json null
- structure_hash varchar(64) not null
- change_summary varchar(500) null
- is_published tinyint not null default 1
- created_by bigint not null
- created_at datetime not null

唯一约束：
- question_id + version_no

### question_bank_questions
- id bigint pk
- question_bank_id bigint not null
- question_id bigint not null
- sort_no int not null default 0
- created_at datetime not null

唯一约束：
- question_bank_id + question_id

### 题目 JSON 结构建议

#### content_json
```json
{
  "stem": {
    "content_type": "text|image|mixed",
    "text": "题干文本",
    "assets": [
      {"url": "https://...", "type": "image"}
    ]
  },
  "options": [
    {
      "key": "A",
      "content_type": "text|image|mixed",
      "text": "选项A",
      "assets": []
    }
  ],
  "option_order_randomizable": true,
  "ext": {}
}
```

#### answer_json
单选：
```json
{
  "judge_mode": "by_option_key",
  "correct_keys": ["B"]
}
```

多选：
```json
{
  "judge_mode": "set_exact_match",
  "correct_keys": ["A", "C"]
}
```

判断：
```json
{
  "judge_mode": "boolean",
  "correct_value": true
}
```

说明：
- 选择题答案必须按 option_key 判定，不能按位置判定
- 因为选项顺序支持随机
- 题干、选项都可能是图片，因此内容必须支持 mixed / image 结构
- 二期主观题扩展也依赖当前 JSON 结构

---

## 5.4 标签、评论、质疑

### tags
- id bigint pk
- tenant_id bigint not null
- tag_type varchar(32) not null
- owner_user_id bigint null
- name varchar(128) not null
- category varchar(64) null
- color varchar(32) null
- status varchar(32) not null
- created_at datetime not null

### question_tags
- id bigint pk
- question_id bigint not null
- tag_id bigint not null
- created_at datetime not null

### user_question_tags
- id bigint pk
- user_id bigint not null
- question_id bigint not null
- tag_id bigint not null
- created_at datetime not null

### question_comments
- id bigint pk
- tenant_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- user_id bigint not null
- parent_comment_id bigint null
- comment_type varchar(32) not null
- is_private tinyint not null default 0
- content text not null
- status varchar(32) not null
- created_at datetime not null
- updated_at datetime not null

### question_challenges
- id bigint pk
- tenant_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- challenger_user_id bigint not null
- challenger_org_type varchar(32) not null
- challenger_org_id bigint not null
- challenge_type varchar(32) not null
- description text not null
- attachments_json json null
- status varchar(32) not null
- assigned_to bigint null
- reviewed_by bigint null
- reviewed_at datetime null
- review_comment text null
- resolved_version_id bigint null
- created_at datetime not null
- updated_at datetime not null

说明：
- comment 是交流内容
- challenge 是流程单据，必须支持审核状态流转
- challenge 被接受后，应新增 question_versions 版本，并把 resolved_version_id 指向新版本

---

## 5.5 练题设计

### practice_sessions
- id bigint pk
- tenant_id bigint not null
- user_id bigint not null
- practice_mode varchar(32) not null
- source_mode varchar(32) not null
- course_id bigint null
- bank_scope_json json not null
- started_at datetime not null
- ended_at datetime null
- status varchar(32) not null

### practice_session_questions
- id bigint pk
- session_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- display_order int not null
- presented_options_json json null
- created_at datetime not null

### practice_answers
- id bigint pk
- session_question_id bigint not null
- user_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- answer_json json not null
- is_correct tinyint not null
- answered_at datetime not null

### user_question_states
- id bigint pk
- tenant_id bigint not null
- user_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- practice_correct_count int not null default 0
- practice_wrong_count int not null default 0
- exam_wrong_count int not null default 0
- is_mastered tinyint not null default 0
- mastered_at datetime null
- is_confused tinyint not null default 0
- confused_at datetime null
- last_wrong_at datetime null
- last_answer_json json null
- last_result varchar(32) null
- updated_at datetime not null

唯一约束：
- user_id + question_id

### user_question_state_logs
- id bigint pk
- user_id bigint not null
- question_id bigint not null
- source_type varchar(32) not null
- action_type varchar(32) not null
- payload_json json null
- created_at datetime not null

说明：
- 熟题只在练题场景生效
- 考试不允许因为熟题而排除题目
- 错题、疑惑题都必须独立记录

---

## 5.6 考试设计

### exams
- id bigint pk
- tenant_id bigint not null
- owner_org_type varchar(32) not null
- owner_org_id bigint not null
- creator_id bigint not null
- name varchar(255) not null
- exam_mode varchar(32) not null
- status varchar(32) not null
- start_time datetime not null
- end_time datetime not null
- duration_minutes int not null
- total_score decimal(10,2) not null default 0
- assembly_rule_json json null
- created_at datetime not null
- updated_at datetime not null

### exam_targets
- id bigint pk
- exam_id bigint not null
- target_type varchar(32) not null
- target_id bigint not null
- created_at datetime not null

### exam_papers
- id bigint pk
- exam_id bigint not null
- paper_type varchar(32) not null
- paper_name varchar(255) not null
- total_score decimal(10,2) not null
- created_at datetime not null

### exam_paper_question_rules
- id bigint pk
- paper_id bigint not null
- question_type varchar(32) not null
- score_per_question decimal(10,2) not null
- question_count int not null
- knowledge_tag_ids_json json null
- bank_scope_json json null
- course_id bigint null
- difficulty_range_json json null
- per_knowledge_count_json json null
- created_at datetime not null

### exam_paper_questions
- id bigint pk
- paper_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- score decimal(10,2) not null
- order_no int not null
- created_at datetime not null

### exam_attempts
- id bigint pk
- exam_id bigint not null
- paper_id bigint not null
- tenant_id bigint not null
- user_id bigint not null
- start_at datetime null
- submit_at datetime null
- status varchar(32) not null
- objective_score decimal(10,2) not null default 0
- subjective_score decimal(10,2) not null default 0
- final_score decimal(10,2) not null default 0
- snapshot_json json null
- created_at datetime not null
- updated_at datetime not null

### exam_attempt_answers
- id bigint pk
- attempt_id bigint not null
- question_id bigint not null
- question_version_id bigint not null
- display_order int not null
- presented_options_json json null
- answer_json json not null
- is_correct tinyint null
- score decimal(10,2) not null default 0
- judged_at datetime null
- judge_source varchar(32) not null
- created_at datetime not null

说明：
- presented_options_json 必须保存，因为考试支持选项随机
- 历史答题记录必须绑定 question_version_id
- 随机组卷规则需单独存放在 exam_paper_question_rules

---

## 5.7 公告与通知

### notices
- id bigint pk
- tenant_id bigint not null
- title varchar(255) not null
- content text not null
- notice_type varchar(32) not null
- publisher_id bigint not null
- publish_scope_type varchar(32) not null
- publish_scope_json json not null
- publish_at datetime not null
- expire_at datetime null
- status varchar(32) not null
- created_at datetime not null
- updated_at datetime not null

### notifications
- id bigint pk
- tenant_id bigint not null
- recipient_user_id bigint not null
- category varchar(32) not null
- title varchar(255) not null
- content text not null
- source_type varchar(32) null
- source_id bigint null
- read_at datetime null
- status varchar(32) not null
- created_at datetime not null

说明：
- notices 是公告主内容
- notifications 是用户收到的站内消息实例

---

## 5.8 导入任务

### import_jobs
- id bigint pk
- tenant_id bigint not null
- import_type varchar(32) not null
- template_version varchar(32) not null
- file_url varchar(500) not null
- status varchar(32) not null
- total_rows int not null default 0
- success_rows int not null default 0
- failed_rows int not null default 0
- error_summary text null
- operator_id bigint not null
- started_at datetime null
- finished_at datetime null
- created_at datetime not null

### import_job_rows
- id bigint pk
- job_id bigint not null
- row_no int not null
- raw_data_json json not null
- normalized_data_json json null
- status varchar(32) not null
- error_code varchar(64) null
- error_message varchar(500) null
- target_entity_type varchar(32) null
- target_entity_id bigint null
- created_at datetime not null

说明：
- 必须支持行级报错
- 否则无法定位模板导入失败原因

---

## 5.8.1 文件资产

### file_assets
- id bigint pk
- tenant_id bigint not null
- uploader_id bigint not null
- source_type varchar(32) not null
- original_url varchar(1000) null
- original_filename varchar(255) null
- object_key varchar(500) not null
- public_url varchar(1000) null
- mime_type varchar(128) null
- file_size bigint null
- checksum varchar(128) null
- status varchar(32) not null
- created_at datetime not null

说明：
- `source_type`：upload / remote_url / import_file。
- 一期接口只保证文件元数据、上传入口、第三方 URL 转储入口；具体对象存储客户端配置后续补齐。
- 题目 JSON、质疑附件和导入任务应引用 `file_assets` 的 URL 或 object_key。

---

## 5.9 审计与历史快照

### audit_logs
- id bigint pk
- tenant_id bigint not null
- operator_user_id bigint null
- module varchar(64) not null
- action varchar(64) not null
- resource_type varchar(64) not null
- resource_id bigint null
- before_json json null
- after_json json null
- request_id varchar(64) null
- ip varchar(64) null
- user_agent varchar(255) null
- result varchar(32) not null
- created_at datetime not null

### student_transitions
- id bigint pk
- tenant_id bigint not null
- student_id bigint not null
- transition_type varchar(32) not null
- from_school_id bigint null
- from_grade_id bigint null
- from_class_id bigint null
- to_school_id bigint null
- to_grade_id bigint null
- to_class_id bigint null
- occurred_at datetime not null
- operator_id bigint not null
- remark varchar(500) null
- created_at datetime not null

### teacher_assignment_histories
- id bigint pk
- tenant_id bigint not null
- teacher_id bigint not null
- class_id bigint not null
- course_id bigint not null
- change_type varchar(32) not null
- effective_from datetime not null
- effective_to datetime null
- operator_id bigint not null
- created_at datetime not null

### entity_snapshots
- id bigint pk
- tenant_id bigint not null
- entity_type varchar(32) not null
- entity_id bigint not null
- snapshot_type varchar(32) not null
- snapshot_json json not null
- version_no int not null default 1
- trigger_event_type varchar(64) null
- created_at datetime not null

说明：
- 当前状态不能代替历史状态
- 升学、转班、毕业、离校、任课变更都必须保留可追溯记录
- 快照用于支撑历史统计与追溯

---

## 6. API 清单

### 6.1 认证与权限
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- POST /api/v1/auth/refresh
- GET /api/v1/auth/me
- GET /api/v1/menus
- GET /api/v1/roles
- POST /api/v1/roles
- PUT /api/v1/roles/{id}
- DELETE /api/v1/roles/{id}
- POST /api/v1/menus
- PUT /api/v1/menus/{id}
- DELETE /api/v1/menus/{id}
- GET /api/v1/permissions
- POST /api/v1/permissions
- PUT /api/v1/permissions/{id}
- PUT /api/v1/roles/{id}/permissions
- PUT /api/v1/roles/{id}/menus
- PUT /api/v1/roles/{id}/data-scopes
- PUT /api/v1/users/{id}/roles

### 6.2 组织与用户
- GET /api/v1/tenants
- POST /api/v1/tenants
- GET /api/v1/tenants/{id}
- PUT /api/v1/tenants/{id}
- POST /api/v1/tenants/{id}/disable
- GET /api/v1/schools
- POST /api/v1/schools
- GET /api/v1/schools/{id}
- PUT /api/v1/schools/{id}
- POST /api/v1/schools/{id}/disable
- GET /api/v1/grades
- POST /api/v1/grades
- GET /api/v1/grades/{id}
- PUT /api/v1/grades/{id}
- POST /api/v1/grades/{id}/disable
- GET /api/v1/classes
- POST /api/v1/classes
- GET /api/v1/classes/{id}
- PUT /api/v1/classes/{id}
- POST /api/v1/classes/{id}/disable
- GET /api/v1/courses
- POST /api/v1/courses
- GET /api/v1/courses/{id}
- PUT /api/v1/courses/{id}
- POST /api/v1/courses/{id}/disable
- GET /api/v1/users
- POST /api/v1/users
- GET /api/v1/users/{id}
- PUT /api/v1/users/{id}
- POST /api/v1/users/{id}/reset-password
- POST /api/v1/users/{id}/disable
- POST /api/v1/students/transitions
- POST /api/v1/teachers/assignments
- PUT /api/v1/teachers/assignments/{id}/end

### 6.3 题库与题目
- GET /api/v1/question-banks
- POST /api/v1/question-banks
- PUT /api/v1/question-banks/{id}
- POST /api/v1/question-banks/{id}/publish
- POST /api/v1/question-banks/{id}/visibility
- GET /api/v1/questions
- POST /api/v1/questions
- PUT /api/v1/questions/{id}
- POST /api/v1/questions/{id}/versions
- GET /api/v1/questions/{id}/versions
- POST /api/v1/questions/{id}/tags
- POST /api/v1/questions/{id}/comments
- POST /api/v1/questions/{id}/challenges

### 6.4 练题
- POST /api/v1/practice/sessions
- GET /api/v1/practice/sessions/{id}
- POST /api/v1/practice/sessions/{id}/answer
- POST /api/v1/practice/questions/{id}/mark-mastered
- POST /api/v1/practice/questions/{id}/mark-confused
- GET /api/v1/user-question-states

### 6.5 考试
- GET /api/v1/exams
- POST /api/v1/exams
- PUT /api/v1/exams/{id}
- POST /api/v1/exams/{id}/publish
- POST /api/v1/exams/{id}/generate-paper
- GET /api/v1/exams/{id}/targets
- POST /api/v1/exams/{id}/attempts
- POST /api/v1/exam-attempts/{id}/answers
- POST /api/v1/exam-attempts/{id}/submit
- GET /api/v1/exam-attempts/{id}/result

### 6.6 公告通知
- GET /api/v1/notices
- POST /api/v1/notices
- POST /api/v1/notices/{id}/publish
- GET /api/v1/notifications
- POST /api/v1/notifications/{id}/read

### 6.7 导入
- POST /api/v1/import/jobs
- GET /api/v1/import/jobs
- GET /api/v1/import/jobs/{id}
- GET /api/v1/import/jobs/{id}/rows
- GET /api/v1/import/templates/{type}

### 6.7.1 文件资产
- POST /api/v1/files/upload
- POST /api/v1/files/import-url
- GET /api/v1/files/{id}

### 6.8 分析统计
- GET /api/v1/analytics/practice-overview
- GET /api/v1/analytics/exam-overview
- GET /api/v1/analytics/wrong-questions
- GET /api/v1/analytics/class-performance

### 6.9 二期公开题库市场
公开题库市场/共享题库已确认为存在需求，但不进入一期落地范围。一期仅保留 `question_bank_visibility` 的授权下发能力；二期再补市场发布、审核、订阅、引用和统计模型。

---

## 7. 关键状态机

### 7.1 question_challenges
- pending
- reviewing
- accepted
- rejected
- merged

### 7.2 import_jobs
- uploaded
- parsing
- validating
- importing
- partial_success
- success
- failed

### 7.3 exams
- draft
- published
- ongoing
- ended
- archived

### 7.4 exam_attempts
- not_started
- in_progress
- submitted
- timeout
- absent

### 7.5 notices
- draft
- published
- expired
- recalled

---

## 8. 索引设计重点

### 高频查询索引
- questions (tenant_id, status, question_type)
- question_versions (question_id, version_no desc)
- question_bank_visibility (target_type, target_id, permission_type, status)
- user_question_states (user_id, is_mastered, is_confused, updated_at)
- practice_answers (user_id, answered_at)
- exam_attempts (exam_id, user_id, status)
- exam_attempt_answers (attempt_id, question_id)
- notifications (recipient_user_id, status, created_at)
- import_job_rows (job_id, status, row_no)
- audit_logs (module, resource_type, resource_id, created_at)

### 唯一约束重点
- roles (tenant_id, code)
- permissions (code)
- question_versions (question_id, version_no)
- question_bank_questions (question_bank_id, question_id)
- question_tags (question_id, tag_id)
- user_question_tags (user_id, question_id, tag_id)

### 教学关系唯一约束
- 有效期内 class_id + course_id 只能有一个 current 教师

---

## 9. 迁移顺序

### 第 1 批：基础域
1. tenants
2. schools / grades / classes / courses
3. users / student_profiles / teacher_profiles

### 第 2 批：权限域
4. roles / permissions / menus
5. user_roles / role_permissions / role_menu_permissions / data_scopes

### 第 3 批：教学关系和流转
6. student_class_memberships
7. teacher_class_course_assignments
8. student_transitions
9. teacher_assignment_histories

### 第 4 批：题库题目
10. question_banks
11. questions
12. question_versions
13. question_bank_questions
14. question_bank_visibility
15. tags / question_tags / user_question_tags

### 第 5 批：互动与导入
16. question_comments
17. question_challenges
18. import_jobs
19. import_job_rows

### 第 6 批：练题考试
20. practice_sessions
21. practice_session_questions
22. practice_answers
23. user_question_states
24. user_question_state_logs
25. exams / exam_targets / exam_papers / exam_paper_question_rules / exam_paper_questions
26. exam_attempts / exam_attempt_answers

### 第 7 批：通知与审计
27. notices
28. notifications
29. audit_logs
30. entity_snapshots

---

## 10. 给 AI 的执行要求

请基于本文档继续输出：

1. 完整 MySQL 8 DDL 与拆分 migration
2. 外键与索引说明
3. 初始化平台虚拟租户、系统角色、权限、菜单数据
4. 正式 OpenAPI 3.0 YAML
5. 示例请求响应
6. Go 后端模块划分
7. React 前端页面与接口映射

并遵守以下约束：
- 下发采用 question_bank_visibility，不允许复制题库或题目
- 题目必须采用 questions + question_versions
- 所有作答记录必须保存 question_version_id
- 客观题按 option_key 判题，不按选项位置判题
- 练题与考试严格分离
- 熟题只影响练题，不影响考试
- 评论与质疑分离
- 导入必须支持行级错误
- 必须保留学生流转、教师任课历史、实体快照

---

## 11. 结论

当前项目已经不适合直接按原草案建库。应先按本文档补齐数据库和 API 设计，再进入最终 DDL 与代码实现阶段。

建议下一步顺序：
1. 使用 `docs/docs/mysql_ddl_v1.md` 作为 DDL 基线
2. 使用 `docs/api/openapi.yaml` 作为接口基线
3. 使用 `docs/database/migrations/` 下的 migration 文件初始化开发库
4. 生成 Go 后端代码骨架
5. 生成 React 前端页面与接口对接代码
