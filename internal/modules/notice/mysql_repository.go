package notice

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListNotices(ctx context.Context, tenantID int64, filter NoticeListFilter) (PageResult[Notice], error) {
	query := `
SELECT id, tenant_id, title, content, notice_type, publisher_id, publish_scope_type, publish_scope_json, publish_at, expire_at, status, created_at, updated_at
FROM notices
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.NoticeType != "" {
		query += " AND notice_type = ?"
		args = append(args, filter.NoticeType)
	}
	query += " ORDER BY publish_at DESC, id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Notice]{}, err
	}
	defer rows.Close()

	items := make([]Notice, 0)
	for rows.Next() {
		notice, err := scanNotice(rows)
		if err != nil {
			return PageResult[Notice]{}, err
		}
		items = append(items, notice)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Notice]{}, err
	}

	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetNotice(ctx context.Context, tenantID int64, id int64) (Notice, error) {
	query := `
SELECT id, tenant_id, title, content, notice_type, publisher_id, publish_scope_type, publish_scope_json, publish_at, expire_at, status, created_at, updated_at
FROM notices
WHERE id = ?
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	notice, err := scanNoticeScanner(row)
	if err != nil {
		return Notice{}, wrapNotFound(err)
	}
	return notice, nil
}

func (repo *MySQLRepository) CreateNotice(ctx context.Context, notice Notice) (Notice, error) {
	scopeJSON, err := marshalPublishScope(notice.PublishScope)
	if err != nil {
		return Notice{}, err
	}

	const query = `
INSERT INTO notices (tenant_id, title, content, notice_type, publisher_id, publish_scope_type, publish_scope_json, publish_at, expire_at, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.db.ExecContext(
		ctx,
		query,
		notice.TenantID,
		notice.Title,
		notice.Content,
		notice.NoticeType,
		notice.PublisherID,
		notice.PublishScopeType,
		scopeJSON,
		notice.PublishAt,
		nullTime(notice.ExpireAt),
		notice.Status,
	)
	if err != nil {
		return Notice{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Notice{}, err
	}
	return repo.GetNotice(ctx, notice.TenantID, id)
}

func (repo *MySQLRepository) UpdateNotice(ctx context.Context, notice Notice) (Notice, error) {
	scopeJSON, err := marshalPublishScope(notice.PublishScope)
	if err != nil {
		return Notice{}, err
	}

	const query = `
UPDATE notices
SET title = ?, content = ?, notice_type = ?, publish_scope_type = ?, publish_scope_json = ?, publish_at = ?, expire_at = ?, status = ?
WHERE id = ? AND tenant_id = ?
`
	if err := repo.execAffectingOne(
		ctx,
		query,
		notice.Title,
		notice.Content,
		notice.NoticeType,
		notice.PublishScopeType,
		scopeJSON,
		notice.PublishAt,
		nullTime(notice.ExpireAt),
		notice.Status,
		notice.ID,
		notice.TenantID,
	); err != nil {
		return Notice{}, err
	}
	return repo.GetNotice(ctx, notice.TenantID, notice.ID)
}

func (repo *MySQLRepository) PublishNotice(ctx context.Context, tenantID int64, id int64) (Notice, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return Notice{}, err
	}
	defer tx.Rollback()

	notice, err := repo.getNoticeForUpdate(ctx, tx, tenantID, id)
	if err != nil {
		return Notice{}, err
	}

	if notice.Status != NoticeStatusPublished {
		if _, err := tx.ExecContext(ctx, "UPDATE notices SET status = ? WHERE id = ? AND tenant_id = ?", NoticeStatusPublished, id, tenantID); err != nil {
			return Notice{}, err
		}
		recipientIDs, err := repo.resolveRecipientUserIDs(ctx, tx, notice)
		if err != nil {
			return Notice{}, err
		}
		for _, recipientID := range recipientIDs {
			if err := repo.insertNotification(ctx, tx, notice, recipientID); err != nil {
				return Notice{}, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return Notice{}, err
	}
	return repo.GetNotice(ctx, tenantID, id)
}

func (repo *MySQLRepository) RecallNotice(ctx context.Context, tenantID int64, id int64) (Notice, error) {
	const query = `
UPDATE notices
SET status = ?
WHERE id = ? AND tenant_id = ?
`
	if err := repo.execAffectingOne(ctx, query, NoticeStatusRecalled, id, tenantID); err != nil {
		return Notice{}, err
	}
	return repo.GetNotice(ctx, tenantID, id)
}

func (repo *MySQLRepository) ListAnnouncements(ctx context.Context, tenantID int64, recipientUserID int64, filter AnnouncementListFilter) (PageResult[Notice], error) {
	query := announcementSelectSQL() + `
WHERE nf.tenant_id = ? AND nf.recipient_user_id = ? AND nf.category = ? AND nf.source_type = ?
  AND n.status = ? AND n.publish_at <= CURRENT_TIMESTAMP(3)
  AND (n.expire_at IS NULL OR n.expire_at >= CURRENT_TIMESTAMP(3))
`
	args := []any{tenantID, recipientUserID, NotificationCategoryNotice, NotificationSourceTypeNotice, NoticeStatusPublished}
	if filter.NoticeType != "" {
		query += " AND n.notice_type = ?"
		args = append(args, filter.NoticeType)
	}
	if filter.ReadStatus != "" {
		query += " AND nf.status = ?"
		args = append(args, filter.ReadStatus)
	}
	query += " ORDER BY n.publish_at DESC, n.id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Notice]{}, err
	}
	defer rows.Close()

	items := make([]Notice, 0)
	for rows.Next() {
		notice, err := scanAnnouncement(rows)
		if err != nil {
			return PageResult[Notice]{}, err
		}
		items = append(items, notice)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Notice]{}, err
	}

	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) MarkAnnouncementRead(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notice, error) {
	const query = `
UPDATE notifications
SET status = ?, read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))
WHERE tenant_id = ? AND recipient_user_id = ? AND category = ? AND source_type = ? AND source_id = ?
`
	if err := repo.execAffectingOne(ctx, query, NotificationStatusRead, tenantID, recipientUserID, NotificationCategoryNotice, NotificationSourceTypeNotice, id); err != nil {
		return Notice{}, err
	}
	return repo.getAnnouncement(ctx, tenantID, recipientUserID, id)
}

func (repo *MySQLRepository) ListNotifications(ctx context.Context, tenantID int64, recipientUserID int64, filter NotificationListFilter) (PageResult[Notification], error) {
	query := `
SELECT id, tenant_id, recipient_user_id, category, title, content, source_type, source_id, read_at, status, created_at
FROM notifications
WHERE tenant_id = ? AND recipient_user_id = ?
`
	args := []any{tenantID, recipientUserID}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.Category != "" {
		query += " AND category = ?"
		args = append(args, filter.Category)
	}
	query += " ORDER BY created_at DESC, id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Notification]{}, err
	}
	defer rows.Close()

	items := make([]Notification, 0)
	for rows.Next() {
		notification, err := scanNotification(rows)
		if err != nil {
			return PageResult[Notification]{}, err
		}
		items = append(items, notification)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Notification]{}, err
	}

	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) MarkNotificationRead(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notification, error) {
	const query = `
UPDATE notifications
SET status = ?, read_at = CURRENT_TIMESTAMP(3)
WHERE id = ? AND tenant_id = ? AND recipient_user_id = ?
`
	if err := repo.execAffectingOne(ctx, query, NotificationStatusRead, id, tenantID, recipientUserID); err != nil {
		return Notification{}, err
	}
	return repo.getNotification(ctx, tenantID, recipientUserID, id)
}

func (repo *MySQLRepository) CreateNotification(ctx context.Context, scope Scope, input NotificationInput) (NotificationSendResult, error) {
	targetTenantID := input.TargetTenantID
	if targetTenantID <= 0 {
		targetTenantID = scopeTenantIDFromMap(input.TargetScope)
	}
	if targetTenantID <= 0 {
		targetTenantID = scope.TenantID
	}
	if targetTenantID <= 0 {
		return NotificationSendResult{}, ErrInvalidInput
	}
	if !canManageAnyTenant(scope) && targetTenantID != scope.TenantID {
		return NotificationSendResult{}, ErrForbidden
	}

	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return NotificationSendResult{}, err
	}
	defer tx.Rollback()

	recipientIDs, err := repo.resolveNotificationRecipientUserIDs(ctx, tx, scope, targetTenantID, input)
	if err != nil {
		return NotificationSendResult{}, err
	}
	recipientIDs = uniquePositiveInt64s(recipientIDs)
	if len(recipientIDs) == 0 {
		if err := tx.Commit(); err != nil {
			return NotificationSendResult{}, err
		}
		return NotificationSendResult{Items: []Notification{}, Total: 0}, nil
	}

	createdIDs := make([]int64, 0, len(recipientIDs))
	for _, recipientID := range recipientIDs {
		result, err := tx.ExecContext(
			ctx,
			`
INSERT INTO notifications (tenant_id, recipient_user_id, category, title, content, source_type, source_id, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`,
			targetTenantID,
			recipientID,
			NotificationCategoryDirect,
			input.Title,
			input.Content,
			NotificationSourceTypeUser,
			scope.UserID,
			NotificationStatusUnread,
		)
		if err != nil {
			return NotificationSendResult{}, err
		}
		createdID, err := result.LastInsertId()
		if err != nil {
			return NotificationSendResult{}, err
		}
		createdIDs = append(createdIDs, createdID)
	}

	if err := tx.Commit(); err != nil {
		return NotificationSendResult{}, err
	}

	items := make([]Notification, 0, len(createdIDs))
	for _, id := range createdIDs {
		notification, err := repo.getNotification(ctx, targetTenantID, 0, id)
		if err != nil {
			return NotificationSendResult{}, err
		}
		items = append(items, notification)
	}
	return NotificationSendResult{Items: items, Total: len(items)}, nil
}

func (repo *MySQLRepository) getNoticeForUpdate(ctx context.Context, tx *sql.Tx, tenantID int64, id int64) (Notice, error) {
	const query = `
SELECT id, tenant_id, title, content, notice_type, publisher_id, publish_scope_type, publish_scope_json, publish_at, expire_at, status, created_at, updated_at
FROM notices
WHERE id = ? AND tenant_id = ?
FOR UPDATE
`
	row := tx.QueryRowContext(ctx, query, id, tenantID)
	notice, err := scanNoticeScanner(row)
	if err != nil {
		return Notice{}, wrapNotFound(err)
	}
	return notice, nil
}

func (repo *MySQLRepository) getNotification(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notification, error) {
	query := `
SELECT id, tenant_id, recipient_user_id, category, title, content, source_type, source_id, read_at, status, created_at
FROM notifications
`
	args := []any{id, tenantID}
	query += "WHERE id = ? AND tenant_id = ?"
	if recipientUserID > 0 {
		query += " AND recipient_user_id = ?"
		args = append(args, recipientUserID)
	}
	query += " LIMIT 1"
	row := repo.db.QueryRowContext(ctx, query, args...)
	notification, err := scanNotificationScanner(row)
	if err != nil {
		return Notification{}, wrapNotFound(err)
	}
	return notification, nil
}

func (repo *MySQLRepository) getAnnouncement(ctx context.Context, tenantID int64, recipientUserID int64, id int64) (Notice, error) {
	query := announcementSelectSQL() + `
WHERE nf.tenant_id = ? AND nf.recipient_user_id = ? AND nf.category = ? AND nf.source_type = ? AND n.id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, tenantID, recipientUserID, NotificationCategoryNotice, NotificationSourceTypeNotice, id)
	notice, err := scanAnnouncementScanner(row)
	if err != nil {
		return Notice{}, wrapNotFound(err)
	}
	return notice, nil
}

func (repo *MySQLRepository) resolveRecipientUserIDs(ctx context.Context, tx *sql.Tx, notice Notice) ([]int64, error) {
	return repo.resolveScopeRecipientUserIDs(ctx, tx, notice.TenantID, notice.PublishScopeType, notice.PublishScope)
}

func (repo *MySQLRepository) resolveNotificationRecipientUserIDs(ctx context.Context, tx *sql.Tx, scope Scope, tenantID int64, input NotificationInput) ([]int64, error) {
	switch input.TargetType {
	case NotificationTargetSingleUser:
		if input.TargetUserID <= 0 {
			return nil, ErrInvalidInput
		}
		return repo.queryActiveUserIDs(ctx, tx, tenantID, []int64{input.TargetUserID})
	case NotificationTargetClassIDs:
		classIDs, err := scopeInt64Slice(input.TargetScope, "class_ids")
		if err != nil {
			return nil, err
		}
		if len(classIDs) == 0 {
			classID := scopeInt64Value(input.TargetScope, "class_id")
			if classID > 0 {
				classIDs = []int64{classID}
			}
		}
		if len(classIDs) == 0 {
			return nil, ErrInvalidInput
		}
		if scope.UserType == "teacher" {
			allowed, err := repo.teacherCanReachClasses(ctx, tx, tenantID, scope.UserID, classIDs)
			if err != nil {
				return nil, err
			}
			if !allowed {
				return nil, ErrForbidden
			}
		}
		return repo.queryClassStudentIDs(ctx, tx, tenantID, classIDs)
	default:
		return repo.resolveScopeRecipientUserIDs(ctx, tx, tenantID, input.TargetType, input.TargetScope)
	}
}

func (repo *MySQLRepository) resolveScopeRecipientUserIDs(ctx context.Context, tx *sql.Tx, tenantID int64, scopeType string, publishScope map[string]any) ([]int64, error) {
	switch scopeType {
	case NoticeScopeAll:
		return repo.queryUserIDs(ctx, tx, `
SELECT id
FROM users
WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL
ORDER BY id
`, tenantID)
	case NoticeScopeUserIDs:
		userIDs, err := scopeUserIDs(publishScope)
		if err != nil {
			return nil, err
		}
		return repo.queryActiveUserIDs(ctx, tx, tenantID, userIDs)
	case NoticeScopeUserTypes:
		userTypes, err := scopeStringSlice(publishScope, "user_types")
		if err != nil {
			return nil, err
		}
		return repo.queryUsersByTypes(ctx, tx, tenantID, userTypes, false)
	case NoticeScopeExcludeUserTypes:
		userTypes, err := scopeStringSlice(publishScope, "user_types")
		if err != nil {
			return nil, err
		}
		return repo.queryUsersByTypes(ctx, tx, tenantID, userTypes, true)
	case NoticeScopeTenantAdmins:
		return repo.queryUsersByTypes(ctx, tx, tenantID, []string{"tenant_admin", "school_admin"}, false)
	case NoticeScopeAllAdmins:
		return repo.queryUsersByTypes(ctx, tx, tenantID, []string{"sys_admin", "tenant_admin", "school_admin", "staff"}, false)
	case NoticeScopeNonStudents:
		return repo.queryUsersByTypes(ctx, tx, tenantID, []string{"student"}, true)
	case NoticeScopeClassIDs:
		classIDs, err := scopeInt64Slice(publishScope, "class_ids")
		if err != nil {
			return nil, err
		}
		if len(classIDs) == 0 {
			classID := scopeInt64Value(publishScope, "class_id")
			if classID > 0 {
				classIDs = []int64{classID}
			}
		}
		if len(classIDs) == 0 {
			return nil, ErrInvalidInput
		}
		return repo.queryClassStudentIDs(ctx, tx, tenantID, classIDs)
	default:
		return nil, ErrInvalidInput
	}
}

func (repo *MySQLRepository) queryUserIDs(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]int64, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	userIDs := make([]int64, 0)
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		userIDs = append(userIDs, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return userIDs, nil
}

func (repo *MySQLRepository) queryActiveUserIDs(ctx context.Context, tx *sql.Tx, tenantID int64, userIDs []int64) ([]int64, error) {
	userIDs = uniquePositiveInt64s(userIDs)
	if len(userIDs) == 0 {
		return []int64{}, nil
	}
	query := `
SELECT id
FROM users
WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL AND id IN (` + placeholders(len(userIDs)) + `)
ORDER BY id
`
	args := make([]any, 0, len(userIDs)+1)
	args = append(args, tenantID)
	for _, userID := range userIDs {
		args = append(args, userID)
	}
	return repo.queryUserIDs(ctx, tx, query, args...)
}

func (repo *MySQLRepository) queryUsersByTypes(ctx context.Context, tx *sql.Tx, tenantID int64, userTypes []string, exclude bool) ([]int64, error) {
	userTypes = uniqueStrings(userTypes)
	if len(userTypes) == 0 {
		if exclude {
			return repo.queryUserIDs(ctx, tx, `
SELECT id
FROM users
WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL
ORDER BY id
`, tenantID)
		}
		return []int64{}, nil
	}
	operator := "IN"
	if exclude {
		operator = "NOT IN"
	}
	query := `
SELECT id
FROM users
WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL AND user_type ` + operator + ` (` + placeholders(len(userTypes)) + `)
ORDER BY id
`
	args := make([]any, 0, len(userTypes)+1)
	args = append(args, tenantID)
	for _, userType := range userTypes {
		args = append(args, userType)
	}
	return repo.queryUserIDs(ctx, tx, query, args...)
}

func (repo *MySQLRepository) queryClassStudentIDs(ctx context.Context, tx *sql.Tx, tenantID int64, classIDs []int64) ([]int64, error) {
	classIDs = uniquePositiveInt64s(classIDs)
	if len(classIDs) == 0 {
		return []int64{}, nil
	}
	query := `
SELECT DISTINCT scm.student_id
FROM student_class_memberships scm
JOIN users u ON u.id = scm.student_id AND u.tenant_id = scm.tenant_id
WHERE scm.tenant_id = ? AND scm.is_current = 1 AND scm.status = 'active'
  AND u.status = 'active' AND u.deleted_at IS NULL
  AND scm.class_id IN (` + placeholders(len(classIDs)) + `)
ORDER BY scm.student_id
`
	args := make([]any, 0, len(classIDs)+1)
	args = append(args, tenantID)
	for _, classID := range classIDs {
		args = append(args, classID)
	}
	return repo.queryUserIDs(ctx, tx, query, args...)
}

func (repo *MySQLRepository) teacherCanReachClasses(ctx context.Context, tx *sql.Tx, tenantID int64, teacherID int64, classIDs []int64) (bool, error) {
	classIDs = uniquePositiveInt64s(classIDs)
	if len(classIDs) == 0 {
		return false, nil
	}
	query := `
SELECT DISTINCT class_id
FROM (
  SELECT class_id
  FROM teacher_class_course_assignments
  WHERE tenant_id = ? AND teacher_id = ? AND is_current = 1 AND status = 'active' AND class_id IN (` + placeholders(len(classIDs)) + `)
  UNION
  SELECT class_id
  FROM class_head_teacher_assignments
  WHERE tenant_id = ? AND teacher_id = ? AND is_current = 1 AND status = 'active' AND class_id IN (` + placeholders(len(classIDs)) + `)
) allowed_classes
`
	args := make([]any, 0, len(classIDs)*2+4)
	args = append(args, tenantID, teacherID)
	for _, classID := range classIDs {
		args = append(args, classID)
	}
	args = append(args, tenantID, teacherID)
	for _, classID := range classIDs {
		args = append(args, classID)
	}

	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	seen := map[int64]struct{}{}
	for rows.Next() {
		var classID int64
		if err := rows.Scan(&classID); err != nil {
			return false, err
		}
		seen[classID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	for _, classID := range classIDs {
		if _, ok := seen[classID]; !ok {
			return false, nil
		}
	}
	return true, nil
}

func (repo *MySQLRepository) insertNotification(ctx context.Context, tx *sql.Tx, notice Notice, recipientUserID int64) error {
	const query = `
INSERT INTO notifications (tenant_id, recipient_user_id, category, title, content, source_type, source_id, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`
	_, err := tx.ExecContext(
		ctx,
		query,
		notice.TenantID,
		recipientUserID,
		NotificationCategoryNotice,
		notice.Title,
		notice.Content,
		"notice",
		notice.ID,
		NotificationStatusUnread,
	)
	return err
}

func (repo *MySQLRepository) execAffectingOne(ctx context.Context, query string, args ...any) error {
	result, err := repo.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func scanNotice(rows *sql.Rows) (Notice, error) {
	return scanNoticeScanner(rows)
}

func scanNoticeScanner(scanner interface{ Scan(dest ...any) error }) (Notice, error) {
	var notice Notice
	var scopeJSON []byte
	var expireAt sql.NullTime
	err := scanner.Scan(
		&notice.ID,
		&notice.TenantID,
		&notice.Title,
		&notice.Content,
		&notice.NoticeType,
		&notice.PublisherID,
		&notice.PublishScopeType,
		&scopeJSON,
		&notice.PublishAt,
		&expireAt,
		&notice.Status,
		&notice.CreatedAt,
		&notice.UpdatedAt,
	)
	if err != nil {
		return Notice{}, err
	}
	if len(scopeJSON) > 0 {
		if err := json.Unmarshal(scopeJSON, &notice.PublishScope); err != nil {
			return Notice{}, err
		}
	}
	if notice.PublishScope == nil {
		notice.PublishScope = map[string]any{}
	}
	if expireAt.Valid {
		value := expireAt.Time
		notice.ExpireAt = &value
	}
	return notice, nil
}

func scanAnnouncement(rows *sql.Rows) (Notice, error) {
	return scanAnnouncementScanner(rows)
}

func scanAnnouncementScanner(scanner interface{ Scan(dest ...any) error }) (Notice, error) {
	var notice Notice
	var scopeJSON []byte
	var expireAt sql.NullTime
	var readAt sql.NullTime
	var publisherName sql.NullString
	err := scanner.Scan(
		&notice.ID,
		&notice.TenantID,
		&notice.Title,
		&notice.Content,
		&notice.NoticeType,
		&notice.PublisherID,
		&notice.PublishScopeType,
		&scopeJSON,
		&notice.PublishAt,
		&expireAt,
		&notice.Status,
		&notice.CreatedAt,
		&notice.UpdatedAt,
		&publisherName,
		&readAt,
		&notice.ReadStatus,
	)
	if err != nil {
		return Notice{}, err
	}
	if len(scopeJSON) > 0 {
		if err := json.Unmarshal(scopeJSON, &notice.PublishScope); err != nil {
			return Notice{}, err
		}
	}
	if notice.PublishScope == nil {
		notice.PublishScope = map[string]any{}
	}
	if expireAt.Valid {
		value := expireAt.Time
		notice.ExpireAt = &value
	}
	if readAt.Valid {
		value := readAt.Time
		notice.ReadAt = &value
	}
	if publisherName.Valid {
		notice.PublisherName = publisherName.String
	}
	return notice, nil
}

func scanNotification(rows *sql.Rows) (Notification, error) {
	return scanNotificationScanner(rows)
}

func scanNotificationScanner(scanner interface{ Scan(dest ...any) error }) (Notification, error) {
	var notification Notification
	var sourceType sql.NullString
	var sourceID sql.NullInt64
	var readAt sql.NullTime
	err := scanner.Scan(
		&notification.ID,
		&notification.TenantID,
		&notification.RecipientUserID,
		&notification.Category,
		&notification.Title,
		&notification.Content,
		&sourceType,
		&sourceID,
		&readAt,
		&notification.Status,
		&notification.CreatedAt,
	)
	if err != nil {
		return Notification{}, err
	}
	if sourceType.Valid {
		notification.SourceType = sourceType.String
	}
	if sourceID.Valid {
		value := sourceID.Int64
		notification.SourceID = &value
	}
	if readAt.Valid {
		value := readAt.Time
		notification.ReadAt = &value
	}
	return notification, nil
}

func paginateItems[T any](items []T, page int, pageSize int) PageResult[T] {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	start := (page - 1) * pageSize
	if start > len(items) {
		start = len(items)
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return PageResult[T]{
		Items:    items[start:end],
		Page:     page,
		PageSize: pageSize,
		Total:    len(items),
	}
}

func marshalPublishScope(scope map[string]any) ([]byte, error) {
	if scope == nil {
		scope = map[string]any{}
	}
	return json.Marshal(scope)
}

func nullTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}

func wrapNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}

func announcementSelectSQL() string {
	return `
SELECT n.id, n.tenant_id, n.title, n.content, n.notice_type, n.publisher_id, n.publish_scope_type,
       n.publish_scope_json, n.publish_at, n.expire_at, n.status, n.created_at, n.updated_at,
       publisher.display_name AS publisher_name, nf.read_at, nf.status AS read_status
FROM notifications nf
JOIN notices n ON n.id = nf.source_id
LEFT JOIN users publisher ON publisher.id = n.publisher_id
`
}

func scopeUserIDs(scope map[string]any) ([]int64, error) {
	raw, ok := scope["user_ids"]
	if !ok {
		return []int64{}, nil
	}
	values, ok := raw.([]any)
	if !ok {
		return nil, ErrInvalidInput
	}
	userIDs := make([]int64, 0, len(values))
	for _, value := range values {
		switch typed := value.(type) {
		case float64:
			userIDs = append(userIDs, int64(typed))
		case int64:
			userIDs = append(userIDs, typed)
		case int:
			userIDs = append(userIDs, int64(typed))
		default:
			return nil, ErrInvalidInput
		}
	}
	return userIDs, nil
}

func scopeInt64Slice(scope map[string]any, key string) ([]int64, error) {
	if scope == nil {
		return []int64{}, nil
	}
	raw, ok := scope[key]
	if !ok {
		return []int64{}, nil
	}
	switch values := raw.(type) {
	case []any:
		result := make([]int64, 0, len(values))
		for _, value := range values {
			parsed, ok := anyToInt64(value)
			if !ok {
				return nil, ErrInvalidInput
			}
			result = append(result, parsed)
		}
		return result, nil
	case []int64:
		return values, nil
	case []int:
		result := make([]int64, 0, len(values))
		for _, value := range values {
			result = append(result, int64(value))
		}
		return result, nil
	default:
		return nil, ErrInvalidInput
	}
}

func scopeInt64Value(scope map[string]any, key string) int64 {
	if scope == nil {
		return 0
	}
	value, ok := anyToInt64(scope[key])
	if !ok {
		return 0
	}
	return value
}

func scopeStringSlice(scope map[string]any, key string) ([]string, error) {
	if scope == nil {
		return []string{}, nil
	}
	raw, ok := scope[key]
	if !ok {
		return []string{}, nil
	}
	switch values := raw.(type) {
	case []any:
		result := make([]string, 0, len(values))
		for _, value := range values {
			parsed, ok := value.(string)
			if !ok {
				return nil, ErrInvalidInput
			}
			parsed = strings.TrimSpace(parsed)
			if parsed != "" {
				result = append(result, parsed)
			}
		}
		return result, nil
	case []string:
		result := make([]string, 0, len(values))
		for _, value := range values {
			value = strings.TrimSpace(value)
			if value != "" {
				result = append(result, value)
			}
		}
		return result, nil
	default:
		return nil, ErrInvalidInput
	}
}

func anyToInt64(value any) (int64, bool) {
	switch typed := value.(type) {
	case float64:
		return int64(typed), true
	case int64:
		return typed, true
	case int:
		return int64(typed), true
	default:
		return 0, false
	}
}

func uniquePositiveInt64s(values []int64) []int64 {
	seen := make(map[int64]struct{}, len(values))
	result := make([]int64, 0, len(values))
	for _, value := range values {
		if value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func placeholders(count int) string {
	parts := make([]string, count)
	for index := range parts {
		parts[index] = "?"
	}
	return strings.Join(parts, ", ")
}
