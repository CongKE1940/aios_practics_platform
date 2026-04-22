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
WHERE tenant_id = ?
`
	args := []any{tenantID}
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
	const query = `
SELECT id, tenant_id, title, content, notice_type, publisher_id, publish_scope_type, publish_scope_json, publish_at, expire_at, status, created_at, updated_at
FROM notices
WHERE id = ? AND tenant_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, tenantID)
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
	const query = `
SELECT id, tenant_id, recipient_user_id, category, title, content, source_type, source_id, read_at, status, created_at
FROM notifications
WHERE id = ? AND tenant_id = ? AND recipient_user_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, id, tenantID, recipientUserID)
	notification, err := scanNotificationScanner(row)
	if err != nil {
		return Notification{}, wrapNotFound(err)
	}
	return notification, nil
}

func (repo *MySQLRepository) resolveRecipientUserIDs(ctx context.Context, tx *sql.Tx, notice Notice) ([]int64, error) {
	switch notice.PublishScopeType {
	case "all":
		return repo.queryUserIDs(ctx, tx, `
SELECT id
FROM users
WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL
ORDER BY id
`, notice.TenantID)
	case "user_ids":
		userIDs, err := scopeUserIDs(notice.PublishScope)
		if err != nil {
			return nil, err
		}
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
		args = append(args, notice.TenantID)
		for _, userID := range userIDs {
			args = append(args, userID)
		}
		return repo.queryUserIDs(ctx, tx, query, args...)
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

func placeholders(count int) string {
	parts := make([]string, count)
	for index := range parts {
		parts[index] = "?"
	}
	return strings.Join(parts, ", ")
}
