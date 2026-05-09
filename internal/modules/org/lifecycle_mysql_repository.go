package org

import (
	"context"
	"database/sql"
	"time"
)

func (repo *MySQLRepository) GetGradeLifecycle(ctx context.Context, tenantID int64, gradeID int64) (orgLifecycle, error) {
	const query = `
SELECT id, tenant_id, school_id, id, status, ended_at
FROM grades
WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
LIMIT 1
`
	var item orgLifecycle
	var endedAt sql.NullTime
	if err := repo.queryRowContext(ctx, query, tenantID, gradeID).Scan(&item.ID, &item.TenantID, &item.SchoolID, &item.GradeID, &item.Status, &endedAt); err != nil {
		return orgLifecycle{}, wrapNotFound(err)
	}
	if endedAt.Valid {
		value := endedAt.Time
		item.EndedAt = &value
	}
	return item, nil
}

func (repo *MySQLRepository) GetClassLifecycle(ctx context.Context, tenantID int64, classID int64) (orgLifecycle, error) {
	const query = `
SELECT c.id, c.tenant_id, c.school_id, c.grade_id, c.id, c.status, c.ended_at
FROM classes c
WHERE c.tenant_id = ? AND c.id = ? AND c.deleted_at IS NULL
LIMIT 1
`
	var item orgLifecycle
	var endedAt sql.NullTime
	if err := repo.queryRowContext(ctx, query, tenantID, classID).Scan(&item.ID, &item.TenantID, &item.SchoolID, &item.GradeID, &item.ClassID, &item.Status, &endedAt); err != nil {
		return orgLifecycle{}, wrapNotFound(err)
	}
	if endedAt.Valid {
		value := endedAt.Time
		item.EndedAt = &value
	}
	return item, nil
}

func (repo *MySQLRepository) EndGrade(ctx context.Context, tenantID int64, gradeID int64, endedAt time.Time) error {
	tx, err := repo.beginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := ensureGradeExistsTx(ctx, tx, tenantID, gradeID); err != nil {
		return err
	}
	if _, err := execTxContext(ctx, tx, `
UPDATE grades
SET status = ?, ended_at = ?
WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
`, StatusEnded, endedAt, tenantID, gradeID); err != nil {
		return err
	}
	if _, err := execTxContext(ctx, tx, `
UPDATE classes
SET status = ?, ended_at = CASE WHEN ended_at IS NULL OR ended_at > ? THEN ? ELSE ended_at END
WHERE tenant_id = ? AND grade_id = ? AND deleted_at IS NULL
`, StatusEnded, endedAt, endedAt, tenantID, gradeID); err != nil {
		return err
	}
	if err := closeOrgPeriodsTx(ctx, tx, tenantID, gradeID, 0, endedAt); err != nil {
		return err
	}
	if _, err := execTxContext(ctx, tx, `
UPDATE student_class_memberships
SET is_current = 0, left_at = ?
WHERE tenant_id = ? AND grade_id = ? AND status = 'active'
  AND joined_at < ?
  AND (left_at IS NULL OR left_at > ?)
`, endedAt, tenantID, gradeID, endedAt, endedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func (repo *MySQLRepository) EndClass(ctx context.Context, tenantID int64, classID int64, endedAt time.Time) error {
	tx, err := repo.beginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := ensureClassExistsTx(ctx, tx, tenantID, classID); err != nil {
		return err
	}
	if _, err := execTxContext(ctx, tx, `
UPDATE classes
SET status = ?, ended_at = ?
WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
`, StatusEnded, endedAt, tenantID, classID); err != nil {
		return err
	}
	if err := closeOrgPeriodsTx(ctx, tx, tenantID, 0, classID, endedAt); err != nil {
		return err
	}
	if _, err := execTxContext(ctx, tx, `
UPDATE student_class_memberships
SET is_current = 0, left_at = ?
WHERE tenant_id = ? AND class_id = ? AND status = 'active'
  AND joined_at < ?
  AND (left_at IS NULL OR left_at > ?)
`, endedAt, tenantID, classID, endedAt, endedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func ensureGradeExistsTx(ctx context.Context, tx *sql.Tx, tenantID int64, gradeID int64) error {
	var id int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM grades WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`, tenantID, gradeID).Scan(&id); err != nil {
		return wrapNotFound(err)
	}
	return nil
}

func ensureClassExistsTx(ctx context.Context, tx *sql.Tx, tenantID int64, classID int64) error {
	var id int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM classes WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`, tenantID, classID).Scan(&id); err != nil {
		return wrapNotFound(err)
	}
	return nil
}

func closeOrgPeriodsTx(ctx context.Context, tx *sql.Tx, tenantID int64, gradeID int64, classID int64, endedAt time.Time) error {
	base := `tenant_id = ? AND deleted_at IS NULL`
	args := []any{tenantID}
	if classID > 0 {
		base += ` AND class_id = ?`
		args = append(args, classID)
	} else {
		base += ` AND grade_id = ?`
		args = append(args, gradeID)
	}

	disableArgs := append([]any{StatusDisabled}, args...)
	disableArgs = append(disableArgs, endedAt)
	if _, err := execTxContext(ctx, tx, `UPDATE org_periods SET status = ? WHERE `+base+` AND start_at >= ?`, disableArgs...); err != nil {
		return err
	}

	truncateArgs := append([]any{endedAt}, args...)
	truncateArgs = append(truncateArgs, endedAt, endedAt)
	if _, err := execTxContext(ctx, tx, `UPDATE org_periods SET end_at = ? WHERE `+base+` AND start_at < ? AND end_at > ?`, truncateArgs...); err != nil {
		return err
	}
	return nil
}
