INSERT INTO dictionaries (code, name, status, remark)
SELECT v.code, v.name, 'active', v.remark
FROM (
  SELECT 'tenant_status' AS code, '租户状态' AS name, 'tenants.status' AS remark
  UNION ALL SELECT 'school_status', '学校状态', 'schools.status'
  UNION ALL SELECT 'grade_status', '年级状态', 'grades.status'
  UNION ALL SELECT 'class_status', '班级状态', 'classes.status'
  UNION ALL SELECT 'course_status', '课程状态', 'courses.status'
  UNION ALL SELECT 'org_node_status', '组织节点状态', 'org_nodes.status'
  UNION ALL SELECT 'user_status', '用户状态', 'users.status'
  UNION ALL SELECT 'student_enrollment_status', '学生学籍状态', 'student_profiles.enrollment_status'
  UNION ALL SELECT 'teacher_employment_status', '教师任职状态', 'teacher_profiles.employment_status'
  UNION ALL SELECT 'role_status', '角色状态', 'roles.status'
  UNION ALL SELECT 'student_class_membership_status', '学生班级关系状态', 'student_class_memberships.status'
  UNION ALL SELECT 'teacher_class_course_assignment_status', '教师任课关系状态', 'teacher_class_course_assignments.status'
  UNION ALL SELECT 'question_bank_status', '题库状态', 'question_banks.status'
  UNION ALL SELECT 'question_bank_visibility_status', '题库可见性状态', 'question_bank_visibility.status'
  UNION ALL SELECT 'question_status', '题目状态', 'questions.status'
  UNION ALL SELECT 'tag_status', '标签状态', 'tags.status'
  UNION ALL SELECT 'question_comment_status', '题目评论状态', 'question_comments.status'
  UNION ALL SELECT 'question_challenge_status', '题目质疑状态', 'question_challenges.status'
  UNION ALL SELECT 'practice_session_status', '练习会话状态', 'practice_sessions.status'
  UNION ALL SELECT 'practice_review_status', '练习批注状态', 'practice_session_question_reviews.status'
  UNION ALL SELECT 'exam_status', '考试状态', 'exams.status'
  UNION ALL SELECT 'exam_attempt_status', '考试作答状态', 'exam_attempts.status'
  UNION ALL SELECT 'exam_review_status', '考试批阅状态', 'analytics.exam_review_status'
  UNION ALL SELECT 'notice_status', '公告状态', 'notices.status'
  UNION ALL SELECT 'notification_status', '通知状态', 'notifications.status'
  UNION ALL SELECT 'file_asset_status', '文件状态', 'file_assets.status'
  UNION ALL SELECT 'import_job_status', '导入任务状态', 'import_jobs.status'
  UNION ALL SELECT 'import_job_row_status', '导入明细状态', 'import_job_rows.status'
  UNION ALL SELECT 'audit_result_status', '审计结果状态', 'audit_logs.result'
  UNION ALL SELECT 'dictionary_status', '字典状态', 'dictionaries.status'
  UNION ALL SELECT 'dictionary_item_status', '字典项状态', 'dictionary_items.status'
) v
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  remark = VALUES(remark);

INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark)
SELECT d.id, v.item_value, v.item_label, v.sort_no, 'active', v.remark
FROM dictionaries d
JOIN (
  SELECT 'tenant_status' AS code, 1 AS item_value, '启用' AS item_label, 10 AS sort_no, 'code=active' AS remark
  UNION ALL SELECT 'tenant_status', 2, '停用', 20, 'code=disabled'

  UNION ALL SELECT 'school_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'school_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'grade_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'grade_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'class_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'class_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'course_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'course_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'org_node_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'org_node_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'user_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'user_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'role_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'role_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'student_class_membership_status', 1, '有效', 10, 'code=active'
  UNION ALL SELECT 'student_class_membership_status', 2, '无效', 20, 'code=inactive'
  UNION ALL SELECT 'teacher_class_course_assignment_status', 1, '有效', 10, 'code=active'
  UNION ALL SELECT 'teacher_class_course_assignment_status', 2, '无效', 20, 'code=inactive'

  UNION ALL SELECT 'student_enrollment_status', 1, '在读', 10, 'code=active'
  UNION ALL SELECT 'student_enrollment_status', 2, '毕业', 20, 'code=graduated'
  UNION ALL SELECT 'student_enrollment_status', 3, '离校', 30, 'code=left_school'
  UNION ALL SELECT 'student_enrollment_status', 4, '转出', 40, 'code=transferred_out'
  UNION ALL SELECT 'student_enrollment_status', 5, '转学', 50, 'code=transferred'
  UNION ALL SELECT 'teacher_employment_status', 1, '在职', 10, 'code=active'
  UNION ALL SELECT 'teacher_employment_status', 2, '离职', 20, 'code=left'

  UNION ALL SELECT 'question_bank_status', 1, '草稿', 10, 'code=draft'
  UNION ALL SELECT 'question_bank_status', 2, '启用', 20, 'code=active'
  UNION ALL SELECT 'question_bank_visibility_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'question_bank_visibility_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'question_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_status', 3, '草稿', 30, 'code=draft'
  UNION ALL SELECT 'tag_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'tag_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_comment_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'question_comment_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'question_challenge_status', 1, '待处理', 10, 'code=pending'
  UNION ALL SELECT 'question_challenge_status', 2, '处理中', 20, 'code=reviewing'
  UNION ALL SELECT 'question_challenge_status', 3, '已解决', 30, 'code=resolved'
  UNION ALL SELECT 'question_challenge_status', 4, '已拒绝', 40, 'code=rejected'
  UNION ALL SELECT 'question_challenge_status', 5, '已采纳', 50, 'code=accepted'
  UNION ALL SELECT 'question_challenge_status', 6, '已合并', 60, 'code=merged'

  UNION ALL SELECT 'practice_session_status', 1, '进行中', 10, 'code=active'
  UNION ALL SELECT 'practice_session_status', 2, '已完成', 20, 'code=finished'
  UNION ALL SELECT 'practice_review_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'practice_review_status', 2, '停用', 20, 'code=disabled'

  UNION ALL SELECT 'exam_status', 1, '草稿', 10, 'code=draft'
  UNION ALL SELECT 'exam_status', 2, '已发布', 20, 'code=published'
  UNION ALL SELECT 'exam_attempt_status', 1, '未开始', 10, 'code=not_started'
  UNION ALL SELECT 'exam_attempt_status', 2, '进行中', 20, 'code=in_progress'
  UNION ALL SELECT 'exam_attempt_status', 3, '已提交', 30, 'code=submitted'
  UNION ALL SELECT 'exam_attempt_status', 4, '超时提交', 40, 'code=timeout_submitted'
  UNION ALL SELECT 'exam_review_status', 1, '未开始', 10, 'code=not_started'
  UNION ALL SELECT 'exam_review_status', 2, '待批阅', 20, 'code=pending'
  UNION ALL SELECT 'exam_review_status', 3, '已批阅', 30, 'code=reviewed'

  UNION ALL SELECT 'notice_status', 1, '草稿', 10, 'code=draft'
  UNION ALL SELECT 'notice_status', 2, '已发布', 20, 'code=published'
  UNION ALL SELECT 'notice_status', 3, '已撤回', 30, 'code=recalled'
  UNION ALL SELECT 'notification_status', 1, '未读', 10, 'code=unread'
  UNION ALL SELECT 'notification_status', 2, '已读', 20, 'code=read'

  UNION ALL SELECT 'file_asset_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'file_asset_status', 2, '待处理', 20, 'code=pending'
  UNION ALL SELECT 'file_asset_status', 3, '失败', 30, 'code=failed'
  UNION ALL SELECT 'file_asset_status', 4, '已删除', 40, 'code=deleted'
  UNION ALL SELECT 'import_job_status', 1, '已上传', 10, 'code=uploaded'
  UNION ALL SELECT 'import_job_status', 2, '解析中', 20, 'code=parsing'
  UNION ALL SELECT 'import_job_status', 3, '校验中', 30, 'code=validating'
  UNION ALL SELECT 'import_job_status', 4, '导入中', 40, 'code=importing'
  UNION ALL SELECT 'import_job_status', 5, '成功', 50, 'code=success'
  UNION ALL SELECT 'import_job_status', 6, '部分成功', 60, 'code=partial_success'
  UNION ALL SELECT 'import_job_status', 7, '失败', 70, 'code=failed'
  UNION ALL SELECT 'import_job_row_status', 1, '待处理', 10, 'code=pending'
  UNION ALL SELECT 'import_job_row_status', 2, '成功', 20, 'code=success'
  UNION ALL SELECT 'import_job_row_status', 3, '失败', 30, 'code=failed'
  UNION ALL SELECT 'import_job_row_status', 4, '跳过', 40, 'code=skipped'

  UNION ALL SELECT 'audit_result_status', 1, '成功', 10, 'code=success'
  UNION ALL SELECT 'audit_result_status', 2, '失败', 20, 'code=failed'
  UNION ALL SELECT 'dictionary_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'dictionary_status', 2, '停用', 20, 'code=disabled'
  UNION ALL SELECT 'dictionary_item_status', 1, '启用', 10, 'code=active'
  UNION ALL SELECT 'dictionary_item_status', 2, '停用', 20, 'code=disabled'
) v ON v.code = d.code
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  sort_no = VALUES(sort_no),
  status = VALUES(status),
  remark = VALUES(remark);
