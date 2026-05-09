package org

import (
	"context"
	"database/sql"
	"time"
)

func (repo *MySQLRepository) ListOrgPeriods(ctx context.Context, tenantID int64, filter OrgPeriodListFilter) (PageResult[OrgPeriod], error) {
	query := orgPeriodSelectSQL() + `
WHERE op.deleted_at IS NULL
`
	args := make([]any, 0, 8)
	if tenantID > 0 {
		query += " AND op.tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.SchoolID > 0 {
		query += " AND op.school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.TargetType != "" {
		query += " AND op.target_type = ?"
		args = append(args, filter.TargetType)
	}
	if filter.TargetID > 0 {
		query += " AND op.target_id = ?"
		args = append(args, filter.TargetID)
	}
	if filter.GradeID > 0 {
		query += " AND op.grade_id = ?"
		args = append(args, filter.GradeID)
	}
	if filter.ClassID > 0 {
		query += " AND op.class_id = ?"
		args = append(args, filter.ClassID)
	}
	if filter.ParentPeriodID > 0 {
		query += " AND op.parent_period_id = ?"
		args = append(args, filter.ParentPeriodID)
	}
	if filter.Status != "" {
		query += " AND op.status = ?"
		args = append(args, filter.Status)
	}
	if filter.ActiveAt != nil {
		query += " AND op.start_at <= ? AND op.end_at > ?"
		args = append(args, *filter.ActiveAt, *filter.ActiveAt)
	}
	query += " ORDER BY op.start_at ASC, op.id ASC"

	rows, err := repo.queryContext(ctx, query, args...)
	if err != nil {
		return PageResult[OrgPeriod]{}, err
	}
	defer rows.Close()

	items := make([]OrgPeriod, 0)
	for rows.Next() {
		period, err := scanOrgPeriod(rows)
		if err != nil {
			return PageResult[OrgPeriod]{}, err
		}
		items = append(items, period)
	}
	if err := rows.Err(); err != nil {
		return PageResult[OrgPeriod]{}, err
	}
	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetOrgPeriod(ctx context.Context, tenantID int64, id int64) (OrgPeriod, error) {
	query := orgPeriodSelectSQL() + `
WHERE op.id = ? AND op.deleted_at IS NULL
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND op.tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	period, err := scanOrgPeriodScanner(repo.queryRowContext(ctx, query, args...))
	if err != nil {
		return OrgPeriod{}, wrapNotFound(err)
	}
	return period, nil
}

func (repo *MySQLRepository) CreateOrgPeriod(ctx context.Context, period OrgPeriod) (OrgPeriod, error) {
	const query = `
INSERT INTO org_periods (
  tenant_id, school_id, target_type, target_id, grade_id, class_id, parent_period_id,
  code, name, start_at, end_at, status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.execContext(
		ctx,
		query,
		period.TenantID,
		period.SchoolID,
		period.TargetType,
		period.TargetID,
		period.GradeID,
		periodNullableInt64(period.ClassID),
		periodNullableInt64(period.ParentPeriodID),
		period.Code,
		period.Name,
		period.StartAt,
		period.EndAt,
		period.Status,
	)
	if err != nil {
		return OrgPeriod{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return OrgPeriod{}, err
	}
	return repo.GetOrgPeriod(ctx, period.TenantID, id)
}

func (repo *MySQLRepository) UpdateOrgPeriod(ctx context.Context, period OrgPeriod) (OrgPeriod, error) {
	const query = `
UPDATE org_periods
SET parent_period_id = ?, code = ?, name = ?, start_at = ?, end_at = ?, status = ?
WHERE id = ? AND tenant_id = ? AND target_type = ? AND target_id = ? AND deleted_at IS NULL
`
	if err := repo.execAffectingOne(
		ctx,
		query,
		periodNullableInt64(period.ParentPeriodID),
		period.Code,
		period.Name,
		period.StartAt,
		period.EndAt,
		period.Status,
		period.ID,
		period.TenantID,
		period.TargetType,
		period.TargetID,
	); err != nil {
		return OrgPeriod{}, err
	}
	return repo.GetOrgPeriod(ctx, period.TenantID, period.ID)
}

func (repo *MySQLRepository) DisableOrgPeriod(ctx context.Context, tenantID int64, id int64) error {
	const query = `UPDATE org_periods SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	return repo.execAffectingOne(ctx, query, StatusDisabled, id, tenantID)
}

func (repo *MySQLRepository) HasOverlappingOrgPeriod(ctx context.Context, tenantID int64, targetType string, targetID int64, startAt time.Time, endAt time.Time, excludeID int64) (bool, error) {
	query := `
SELECT COUNT(*)
FROM org_periods
WHERE tenant_id = ?
  AND target_type = ?
  AND target_id = ?
  AND status = ?
  AND deleted_at IS NULL
  AND start_at < ?
  AND end_at > ?
`
	args := []any{tenantID, targetType, targetID, StatusActive, endAt, startAt}
	if excludeID > 0 {
		query += " AND id <> ?"
		args = append(args, excludeID)
	}
	var count int
	if err := repo.queryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (repo *MySQLRepository) FindCoveringGradePeriod(ctx context.Context, tenantID int64, gradeID int64, startAt time.Time, endAt time.Time) (OrgPeriod, error) {
	query := orgPeriodSelectSQL() + `
WHERE op.tenant_id = ?
  AND op.target_type = ?
  AND op.grade_id = ?
  AND op.status = ?
  AND op.deleted_at IS NULL
  AND op.start_at <= ?
  AND op.end_at >= ?
ORDER BY op.start_at DESC, op.end_at ASC, op.id DESC
LIMIT 1
`
	period, err := scanOrgPeriodScanner(repo.queryRowContext(ctx, query, tenantID, OrgPeriodTargetGrade, gradeID, StatusActive, startAt, endAt))
	if err != nil {
		return OrgPeriod{}, wrapNotFound(err)
	}
	return period, nil
}

func (repo *MySQLRepository) ListGradePeriodClasses(ctx context.Context, tenantID int64, gradePeriodID int64) ([]GradePeriodClass, error) {
	const query = `
SELECT c.id, c.code, c.name, c.class_no,
       op.id, op.code, op.name, op.start_at, op.end_at, op.status
FROM org_periods gp
JOIN org_periods op ON op.parent_period_id = gp.id
JOIN classes c ON c.id = op.class_id AND c.deleted_at IS NULL
WHERE gp.tenant_id = ?
  AND gp.id = ?
  AND gp.target_type = ?
  AND gp.deleted_at IS NULL
  AND op.target_type = ?
  AND op.deleted_at IS NULL
ORDER BY op.start_at ASC, c.class_no ASC, c.id ASC
`
	rows, err := repo.queryContext(ctx, query, tenantID, gradePeriodID, OrgPeriodTargetGrade, OrgPeriodTargetClass)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]GradePeriodClass, 0)
	for rows.Next() {
		var item GradePeriodClass
		var classNo sql.NullInt64
		if err := rows.Scan(
			&item.ClassID,
			&item.ClassCode,
			&item.ClassName,
			&classNo,
			&item.PeriodID,
			&item.Code,
			&item.Name,
			&item.StartAt,
			&item.EndAt,
			&item.Status,
		); err != nil {
			return nil, err
		}
		if classNo.Valid {
			value := int(classNo.Int64)
			item.ClassNo = &value
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (repo *MySQLRepository) ListStudentMembershipHistories(ctx context.Context, tenantID int64, filter StudentMembershipHistoryFilter) (PageResult[StudentMembershipHistory], error) {
	query := `
SELECT scm.id, scm.student_id, u.username, u.display_name, COALESCE(sp.student_no, ''),
       scm.school_id, s.name, scm.grade_id, g.code, g.name, scm.class_id, c.code, c.name,
       scm.joined_at, scm.left_at, scm.is_current, scm.status
FROM student_class_memberships scm
JOIN users u ON u.id = scm.student_id AND u.deleted_at IS NULL
LEFT JOIN student_profiles sp ON sp.user_id = scm.student_id
JOIN schools s ON s.id = scm.school_id AND s.deleted_at IS NULL
JOIN grades g ON g.id = scm.grade_id AND g.deleted_at IS NULL
JOIN classes c ON c.id = scm.class_id AND c.deleted_at IS NULL
WHERE scm.tenant_id = ?
`
	args := []any{tenantID}
	if filter.StudentID > 0 {
		query += " AND scm.student_id = ?"
		args = append(args, filter.StudentID)
	}
	if filter.SchoolID > 0 {
		query += " AND scm.school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.GradeID > 0 {
		query += " AND scm.grade_id = ?"
		args = append(args, filter.GradeID)
	}
	if filter.ClassID > 0 {
		query += " AND scm.class_id = ?"
		args = append(args, filter.ClassID)
	}
	if filter.StartAt != nil && filter.EndAt != nil {
		query += " AND scm.joined_at < ? AND (scm.left_at IS NULL OR scm.left_at > ?)"
		args = append(args, *filter.EndAt, *filter.StartAt)
	} else if filter.StartAt != nil {
		query += " AND (scm.left_at IS NULL OR scm.left_at > ?)"
		args = append(args, *filter.StartAt)
	} else if filter.EndAt != nil {
		query += " AND scm.joined_at < ?"
		args = append(args, *filter.EndAt)
	}
	query += " ORDER BY scm.student_id ASC, scm.joined_at ASC, scm.id ASC"

	rows, err := repo.queryContext(ctx, query, args...)
	if err != nil {
		return PageResult[StudentMembershipHistory]{}, err
	}
	defer rows.Close()

	items := make([]StudentMembershipHistory, 0)
	for rows.Next() {
		item, err := scanStudentMembershipHistory(rows, filter.StartAt, filter.EndAt)
		if err != nil {
			return PageResult[StudentMembershipHistory]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[StudentMembershipHistory]{}, err
	}
	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func orgPeriodSelectSQL() string {
	return `
SELECT op.id, op.tenant_id, op.school_id, s.name,
       op.target_type, op.target_id, op.grade_id, g.code, g.name,
       op.class_id, c.code, c.name, op.parent_period_id,
       op.code, op.name, op.start_at, op.end_at, op.status, op.created_at, op.updated_at
FROM org_periods op
JOIN schools s ON s.id = op.school_id AND s.deleted_at IS NULL
JOIN grades g ON g.id = op.grade_id AND g.deleted_at IS NULL
LEFT JOIN classes c ON c.id = op.class_id AND c.deleted_at IS NULL
`
}

func scanOrgPeriod(scanner interface{ Scan(dest ...any) error }) (OrgPeriod, error) {
	return scanOrgPeriodScanner(scanner)
}

func scanOrgPeriodScanner(scanner interface{ Scan(dest ...any) error }) (OrgPeriod, error) {
	var period OrgPeriod
	var classID sql.NullInt64
	var classCode sql.NullString
	var className sql.NullString
	var parentPeriodID sql.NullInt64
	if err := scanner.Scan(
		&period.ID,
		&period.TenantID,
		&period.SchoolID,
		&period.SchoolName,
		&period.TargetType,
		&period.TargetID,
		&period.GradeID,
		&period.GradeCode,
		&period.GradeName,
		&classID,
		&classCode,
		&className,
		&parentPeriodID,
		&period.Code,
		&period.Name,
		&period.StartAt,
		&period.EndAt,
		&period.Status,
		&period.CreatedAt,
		&period.UpdatedAt,
	); err != nil {
		return OrgPeriod{}, err
	}
	if classID.Valid {
		value := classID.Int64
		period.ClassID = &value
	}
	if classCode.Valid {
		period.ClassCode = classCode.String
	}
	if className.Valid {
		period.ClassName = className.String
	}
	if parentPeriodID.Valid {
		value := parentPeriodID.Int64
		period.ParentPeriodID = &value
	}
	return period, nil
}

func scanStudentMembershipHistory(scanner interface{ Scan(dest ...any) error }, rangeStart *time.Time, rangeEnd *time.Time) (StudentMembershipHistory, error) {
	var item StudentMembershipHistory
	var leftAt sql.NullTime
	var isCurrent bool
	if err := scanner.Scan(
		&item.MembershipID,
		&item.StudentID,
		&item.Username,
		&item.DisplayName,
		&item.StudentNo,
		&item.SchoolID,
		&item.SchoolName,
		&item.GradeID,
		&item.GradeCode,
		&item.GradeName,
		&item.ClassID,
		&item.ClassCode,
		&item.ClassName,
		&item.JoinedAt,
		&leftAt,
		&isCurrent,
		&item.Status,
	); err != nil {
		return StudentMembershipHistory{}, err
	}
	item.IsCurrent = isCurrent
	item.EffectiveFrom = item.JoinedAt
	if rangeStart != nil && item.EffectiveFrom.Before(*rangeStart) {
		item.EffectiveFrom = *rangeStart
	}
	if leftAt.Valid {
		value := leftAt.Time
		item.LeftAt = &value
		item.EffectiveTo = value
	} else if rangeEnd != nil {
		item.EffectiveTo = *rangeEnd
	} else {
		item.EffectiveTo = time.Now()
	}
	if rangeEnd != nil && item.EffectiveTo.After(*rangeEnd) {
		item.EffectiveTo = *rangeEnd
	}
	return item, nil
}

func periodNullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}
