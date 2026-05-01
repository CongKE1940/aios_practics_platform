package snapshot

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListAuditLogs(ctx context.Context, tenantID int64, filter AuditLogListFilter) (PageResult[AuditLog], error) {
	base := `
FROM audit_logs
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if tenantID > 0 {
		base += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.ModuleName != "" {
		base += " AND module_name = ?"
		args = append(args, filter.ModuleName)
	}
	if filter.ResourceType != "" {
		base += " AND resource_type = ?"
		args = append(args, filter.ResourceType)
	}
	total, err := repo.countRows(ctx, "SELECT COUNT(*) "+base, args...)
	if err != nil {
		return PageResult[AuditLog]{}, err
	}

	page := normalizePage(filter.Page)
	pageSize := normalizePageSize(filter.PageSize)
	offset := (page - 1) * pageSize
	query := `
SELECT id, tenant_id, operator_user_id, module_name, action_name, resource_type, resource_id,
       before_json, after_json, request_id, ip, user_agent, result, created_at
` + base + `
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(ctx, query, append(args, pageSize, offset)...)
	if err != nil {
		return PageResult[AuditLog]{}, err
	}
	defer rows.Close()

	items := make([]AuditLog, 0)
	for rows.Next() {
		item, err := scanAuditLog(rows)
		if err != nil {
			return PageResult[AuditLog]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[AuditLog]{}, err
	}
	return PageResult[AuditLog]{Items: items, Page: page, PageSize: pageSize, Total: total}, nil
}

func (repo *MySQLRepository) ListEntitySnapshots(
	ctx context.Context,
	tenantID int64,
	filter EntitySnapshotListFilter,
) (PageResult[EntitySnapshot], error) {
	base := `
FROM entity_snapshots
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if tenantID > 0 {
		base += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.EntityType != "" {
		base += " AND entity_type = ?"
		args = append(args, filter.EntityType)
	}
	if filter.EntityID > 0 {
		base += " AND entity_id = ?"
		args = append(args, filter.EntityID)
	}
	total, err := repo.countRows(ctx, "SELECT COUNT(*) "+base, args...)
	if err != nil {
		return PageResult[EntitySnapshot]{}, err
	}

	page := normalizePage(filter.Page)
	pageSize := normalizePageSize(filter.PageSize)
	offset := (page - 1) * pageSize
	query := `
SELECT id, tenant_id, entity_type, entity_id, snapshot_type, snapshot_json, version_no, trigger_event_type, created_at
` + base + `
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(ctx, query, append(args, pageSize, offset)...)
	if err != nil {
		return PageResult[EntitySnapshot]{}, err
	}
	defer rows.Close()

	items := make([]EntitySnapshot, 0)
	for rows.Next() {
		item, err := scanEntitySnapshot(rows)
		if err != nil {
			return PageResult[EntitySnapshot]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[EntitySnapshot]{}, err
	}
	return PageResult[EntitySnapshot]{Items: items, Page: page, PageSize: pageSize, Total: total}, nil
}

func (repo *MySQLRepository) ListStudentTransitions(
	ctx context.Context,
	tenantID int64,
	filter StudentTransitionListFilter,
) (PageResult[StudentTransition], error) {
	base := `
FROM student_transitions
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if tenantID > 0 {
		base += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.StudentID > 0 {
		base += " AND student_id = ?"
		args = append(args, filter.StudentID)
	}
	if filter.TransitionType != "" {
		base += " AND transition_type = ?"
		args = append(args, filter.TransitionType)
	}
	total, err := repo.countRows(ctx, "SELECT COUNT(*) "+base, args...)
	if err != nil {
		return PageResult[StudentTransition]{}, err
	}

	page := normalizePage(filter.Page)
	pageSize := normalizePageSize(filter.PageSize)
	offset := (page - 1) * pageSize
	query := `
SELECT id, tenant_id, student_id, transition_type, from_school_id, from_grade_id, from_class_id,
       to_school_id, to_grade_id, to_class_id, occurred_at, operator_id, remark, created_at
` + base + `
ORDER BY occurred_at DESC, id DESC
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(ctx, query, append(args, pageSize, offset)...)
	if err != nil {
		return PageResult[StudentTransition]{}, err
	}
	defer rows.Close()

	items := make([]StudentTransition, 0)
	for rows.Next() {
		item, err := scanStudentTransition(rows)
		if err != nil {
			return PageResult[StudentTransition]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[StudentTransition]{}, err
	}
	return PageResult[StudentTransition]{Items: items, Page: page, PageSize: pageSize, Total: total}, nil
}

func (repo *MySQLRepository) ListTeacherAssignmentHistories(
	ctx context.Context,
	tenantID int64,
	filter TeacherAssignmentHistoryListFilter,
) (PageResult[TeacherAssignmentHistory], error) {
	base := `
FROM teacher_assignment_histories
WHERE 1 = 1
`
	args := make([]any, 0, 5)
	if tenantID > 0 {
		base += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.TeacherID > 0 {
		base += " AND teacher_id = ?"
		args = append(args, filter.TeacherID)
	}
	if filter.ClassID > 0 {
		base += " AND class_id = ?"
		args = append(args, filter.ClassID)
	}
	if filter.CourseID > 0 {
		base += " AND course_id = ?"
		args = append(args, filter.CourseID)
	}
	if filter.AssignmentType != "" {
		base += " AND assignment_type = ?"
		args = append(args, filter.AssignmentType)
	}
	total, err := repo.countRows(ctx, "SELECT COUNT(*) "+base, args...)
	if err != nil {
		return PageResult[TeacherAssignmentHistory]{}, err
	}

	page := normalizePage(filter.Page)
	pageSize := normalizePageSize(filter.PageSize)
	offset := (page - 1) * pageSize
	query := `
SELECT id, tenant_id, teacher_id, class_id, course_id, assignment_type, change_type, effective_from, effective_to, operator_id, created_at
` + base + `
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?
`
	rows, err := repo.db.QueryContext(ctx, query, append(args, pageSize, offset)...)
	if err != nil {
		return PageResult[TeacherAssignmentHistory]{}, err
	}
	defer rows.Close()

	items := make([]TeacherAssignmentHistory, 0)
	for rows.Next() {
		item, err := scanTeacherAssignmentHistory(rows)
		if err != nil {
			return PageResult[TeacherAssignmentHistory]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[TeacherAssignmentHistory]{}, err
	}
	return PageResult[TeacherAssignmentHistory]{Items: items, Page: page, PageSize: pageSize, Total: total}, nil
}

func (repo *MySQLRepository) ApplyStudentTransition(
	ctx context.Context,
	tenantID int64,
	operatorUserID int64,
	input StudentTransitionInput,
) (StudentTransition, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return StudentTransition{}, err
	}
	defer tx.Rollback()

	profile, err := repo.getStudentProfile(ctx, tx, tenantID, input.StudentID)
	if err != nil {
		return StudentTransition{}, err
	}
	currentMembership, err := repo.getCurrentStudentMembership(ctx, tx, tenantID, input.StudentID)
	if err != nil && err != ErrNotFound {
		return StudentTransition{}, err
	}
	if requiresCurrentMembership(input.TransitionType) && err == ErrNotFound {
		return StudentTransition{}, ErrInvalidInput
	}

	var targetClass *classMeta
	if input.ToClassID > 0 {
		targetClass, err = repo.getClassMeta(ctx, tx, tenantID, input.ToClassID)
		if err != nil {
			return StudentTransition{}, err
		}
	}

	now := time.Now()
	transition := StudentTransition{
		TenantID:       tenantID,
		StudentID:      input.StudentID,
		TransitionType: input.TransitionType,
		OccurredAt:     input.OccurredAt,
		OperatorID:     operatorUserID,
		Remark:         input.Remark,
		CreatedAt:      now,
	}
	if currentMembership != nil {
		transition.FromSchoolID = int64Ptr(currentMembership.SchoolID)
		transition.FromGradeID = int64Ptr(currentMembership.GradeID)
		transition.FromClassID = int64Ptr(currentMembership.ClassID)
	}
	if targetClass != nil {
		transition.ToSchoolID = int64Ptr(targetClass.SchoolID)
		transition.ToGradeID = int64Ptr(targetClass.GradeID)
		transition.ToClassID = int64Ptr(targetClass.ClassID)
	}

	if currentMembership != nil && closesCurrentMembership(input.TransitionType) {
		if _, err := tx.ExecContext(ctx, `
UPDATE student_class_memberships
SET is_current = 0, left_at = ?
WHERE id = ? AND tenant_id = ?
`, input.OccurredAt, currentMembership.ID, tenantID); err != nil {
			return StudentTransition{}, err
		}
	}

	if createsCurrentMembership(input.TransitionType) {
		if targetClass == nil {
			return StudentTransition{}, ErrInvalidInput
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO student_class_memberships (
  tenant_id, student_id, school_id, grade_id, class_id, is_current, status, joined_at, created_by
) VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?)
`, tenantID, input.StudentID, targetClass.SchoolID, targetClass.GradeID, targetClass.ClassID, input.OccurredAt, operatorUserID); err != nil {
			return StudentTransition{}, err
		}
	}

	enrollmentStatus := profile.EnrollmentStatus
	graduatedAt := profile.GraduatedAt
	schoolID := profile.SchoolID
	switch input.TransitionType {
	case TransitionTypeGraduate:
		enrollmentStatus = StudentEnrollmentGraduated
		graduatedAt = &input.OccurredAt
	case TransitionTypeLeaveSchool:
		enrollmentStatus = StudentEnrollmentLeftSchool
		graduatedAt = nil
	case TransitionTypeTransferOut:
		enrollmentStatus = StudentEnrollmentTransferredOut
		graduatedAt = nil
	case TransitionTypeClassChange, TransitionTypePromote, TransitionTypeTransferIn, TransitionTypeReEnroll:
		enrollmentStatus = StudentEnrollmentActive
		graduatedAt = nil
		if targetClass != nil {
			schoolID = targetClass.SchoolID
		}
	}
	if _, err := tx.ExecContext(ctx, `
UPDATE student_profiles
SET school_id = ?, enrollment_status = ?, graduated_at = ?
WHERE tenant_id = ? AND user_id = ?
`, schoolID, enrollmentStatus, graduatedAt, tenantID, input.StudentID); err != nil {
		return StudentTransition{}, err
	}

	result, err := tx.ExecContext(ctx, `
INSERT INTO student_transitions (
  tenant_id, student_id, transition_type, from_school_id, from_grade_id, from_class_id,
  to_school_id, to_grade_id, to_class_id, occurred_at, operator_id, remark, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		tenantID,
		input.StudentID,
		input.TransitionType,
		nullInt64Value(transition.FromSchoolID),
		nullInt64Value(transition.FromGradeID),
		nullInt64Value(transition.FromClassID),
		nullInt64Value(transition.ToSchoolID),
		nullInt64Value(transition.ToGradeID),
		nullInt64Value(transition.ToClassID),
		input.OccurredAt,
		operatorUserID,
		nullString(input.Remark),
		now,
	)
	if err != nil {
		return StudentTransition{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return StudentTransition{}, err
	}
	transition.ID = id

	snapshotPayload := map[string]any{
		"student_id":        input.StudentID,
		"transition_type":   input.TransitionType,
		"occurred_at":       input.OccurredAt.Format(time.RFC3339),
		"from_class_id":     valueOrNil(transition.FromClassID),
		"to_class_id":       valueOrNil(transition.ToClassID),
		"enrollment_status": enrollmentStatus,
	}
	if err := repo.insertEntitySnapshot(ctx, tx, tenantID, "student", input.StudentID, "transition", snapshotPayload, input.TransitionType, now); err != nil {
		return StudentTransition{}, err
	}
	if err := repo.insertAuditLog(ctx, tx, tenantID, operatorUserID, "snapshot", "student_transition", "student", input.StudentID, nil, snapshotPayload, now); err != nil {
		return StudentTransition{}, err
	}

	if err := tx.Commit(); err != nil {
		return StudentTransition{}, err
	}
	return transition, nil
}

func (repo *MySQLRepository) ApplyTeacherAssignmentChange(
	ctx context.Context,
	tenantID int64,
	operatorUserID int64,
	input TeacherAssignmentChangeInput,
) (TeacherAssignmentHistory, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return TeacherAssignmentHistory{}, err
	}
	defer tx.Rollback()

	classMeta, err := repo.getClassMeta(ctx, tx, tenantID, input.ClassID)
	if err != nil {
		return TeacherAssignmentHistory{}, err
	}
	currentAssignment, err := repo.getCurrentTeacherAssignment(ctx, tx, tenantID, input)
	if err != nil && err != ErrNotFound {
		return TeacherAssignmentHistory{}, err
	}

	now := time.Now()
	history := TeacherAssignmentHistory{
		TenantID:       tenantID,
		TeacherID:      input.TeacherID,
		ClassID:        input.ClassID,
		AssignmentType: input.AssignmentType,
		ChangeType:     input.ChangeType,
		EffectiveFrom:  input.EffectiveAt,
		OperatorID:     operatorUserID,
		CreatedAt:      now,
	}
	if input.AssignmentType == TeacherAssignmentTypeCourseTeacher {
		history.CourseID = int64Ptr(input.CourseID)
	}

	switch input.ChangeType {
	case TeacherAssignmentChangeAssign:
		if currentAssignment != nil {
			return TeacherAssignmentHistory{}, ErrInvalidInput
		}
		if input.AssignmentType == TeacherAssignmentTypeHeadTeacher {
			if _, err := tx.ExecContext(ctx, `
INSERT INTO class_head_teacher_assignments (
  tenant_id, teacher_id, school_id, grade_id, class_id, is_current, status, effective_from
) VALUES (?, ?, ?, ?, ?, 1, 'active', ?)
`, tenantID, input.TeacherID, classMeta.SchoolID, classMeta.GradeID, input.ClassID, input.EffectiveAt); err != nil {
				return TeacherAssignmentHistory{}, err
			}
			break
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO teacher_class_course_assignments (
  tenant_id, teacher_id, school_id, grade_id, class_id, course_id, is_current, status, effective_from
) VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?)
`, tenantID, input.TeacherID, classMeta.SchoolID, classMeta.GradeID, input.ClassID, input.CourseID, input.EffectiveAt); err != nil {
			return TeacherAssignmentHistory{}, err
		}
	case TeacherAssignmentChangeUnassign:
		if currentAssignment == nil {
			return TeacherAssignmentHistory{}, ErrInvalidInput
		}
		history.EffectiveFrom = currentAssignment.EffectiveFrom
		history.EffectiveTo = &input.EffectiveAt
		targetTable := "teacher_class_course_assignments"
		if input.AssignmentType == TeacherAssignmentTypeHeadTeacher {
			targetTable = "class_head_teacher_assignments"
		}
		if _, err := tx.ExecContext(ctx, `
UPDATE `+targetTable+`
SET is_current = 0, effective_to = ?
WHERE id = ? AND tenant_id = ?
`, input.EffectiveAt, currentAssignment.ID, tenantID); err != nil {
			return TeacherAssignmentHistory{}, err
		}
	default:
		return TeacherAssignmentHistory{}, ErrInvalidInput
	}

	result, err := tx.ExecContext(ctx, `
INSERT INTO teacher_assignment_histories (
  tenant_id, teacher_id, class_id, course_id, assignment_type, change_type, effective_from, effective_to, operator_id, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, tenantID, input.TeacherID, input.ClassID, nullInt64Value(history.CourseID), input.AssignmentType, input.ChangeType, history.EffectiveFrom, history.EffectiveTo, operatorUserID, now)
	if err != nil {
		return TeacherAssignmentHistory{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return TeacherAssignmentHistory{}, err
	}
	history.ID = id

	snapshotPayload := map[string]any{
		"teacher_id":      input.TeacherID,
		"class_id":        input.ClassID,
		"course_id":       valueOrNil(history.CourseID),
		"assignment_type": input.AssignmentType,
		"change_type":     input.ChangeType,
		"effective_from":  history.EffectiveFrom.Format(time.RFC3339),
		"effective_to":    timeOrNil(history.EffectiveTo),
	}
	if err := repo.insertEntitySnapshot(ctx, tx, tenantID, "teacher_assignment", input.TeacherID, "event", snapshotPayload, input.ChangeType, now); err != nil {
		return TeacherAssignmentHistory{}, err
	}
	if err := repo.insertAuditLog(ctx, tx, tenantID, operatorUserID, "snapshot", "teacher_assignment_change", "teacher_assignment", input.TeacherID, nil, snapshotPayload, now); err != nil {
		return TeacherAssignmentHistory{}, err
	}

	if err := tx.Commit(); err != nil {
		return TeacherAssignmentHistory{}, err
	}
	return history, nil
}

type countScanner interface {
	Scan(dest ...any) error
}

func (repo *MySQLRepository) countRows(ctx context.Context, query string, args ...any) (int, error) {
	var total int
	if err := repo.db.QueryRowContext(ctx, query, args...).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

type classMeta struct {
	ClassID  int64
	SchoolID int64
	GradeID  int64
}

type studentProfile struct {
	SchoolID         int64
	EnrollmentStatus string
	GraduatedAt      *time.Time
}

type studentMembership struct {
	ID       int64
	SchoolID int64
	GradeID  int64
	ClassID  int64
	JoinedAt time.Time
}

type teacherAssignment struct {
	ID            int64
	EffectiveFrom time.Time
}

func (repo *MySQLRepository) getStudentProfile(
	ctx context.Context,
	tx *sql.Tx,
	tenantID int64,
	studentID int64,
) (studentProfile, error) {
	var profile studentProfile
	var graduatedAt sql.NullTime
	err := tx.QueryRowContext(ctx, `
SELECT school_id, enrollment_status, graduated_at
FROM student_profiles
WHERE tenant_id = ? AND user_id = ?
LIMIT 1
`, tenantID, studentID).Scan(&profile.SchoolID, &profile.EnrollmentStatus, &graduatedAt)
	if err != nil {
		return studentProfile{}, wrapNotFound(err)
	}
	if graduatedAt.Valid {
		profile.GraduatedAt = &graduatedAt.Time
	}
	return profile, nil
}

func (repo *MySQLRepository) getCurrentStudentMembership(
	ctx context.Context,
	tx *sql.Tx,
	tenantID int64,
	studentID int64,
) (*studentMembership, error) {
	var item studentMembership
	err := tx.QueryRowContext(ctx, `
SELECT id, school_id, grade_id, class_id, joined_at
FROM student_class_memberships
WHERE tenant_id = ? AND student_id = ? AND is_current = 1 AND status = 'active'
ORDER BY id DESC
LIMIT 1
`, tenantID, studentID).Scan(&item.ID, &item.SchoolID, &item.GradeID, &item.ClassID, &item.JoinedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (repo *MySQLRepository) getClassMeta(ctx context.Context, tx *sql.Tx, tenantID int64, classID int64) (*classMeta, error) {
	var item classMeta
	err := tx.QueryRowContext(ctx, `
SELECT id, school_id, grade_id
FROM classes
WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
LIMIT 1
`, tenantID, classID).Scan(&item.ClassID, &item.SchoolID, &item.GradeID)
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &item, nil
}

func (repo *MySQLRepository) getCurrentTeacherAssignment(
	ctx context.Context,
	tx *sql.Tx,
	tenantID int64,
	input TeacherAssignmentChangeInput,
) (*teacherAssignment, error) {
	var item teacherAssignment
	if input.AssignmentType == TeacherAssignmentTypeHeadTeacher {
		err := tx.QueryRowContext(ctx, `
SELECT id, effective_from
FROM class_head_teacher_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND is_current = 1 AND status = 'active'
ORDER BY id DESC
LIMIT 1
`, tenantID, input.TeacherID, input.ClassID).Scan(&item.ID, &item.EffectiveFrom)
		if err != nil {
			if err == sql.ErrNoRows {
				return nil, ErrNotFound
			}
			return nil, err
		}
		return &item, nil
	}
	err := tx.QueryRowContext(ctx, `
SELECT id, effective_from
FROM teacher_class_course_assignments
WHERE tenant_id = ? AND teacher_id = ? AND class_id = ? AND course_id = ? AND is_current = 1 AND status = 'active'
ORDER BY id DESC
LIMIT 1
`, tenantID, input.TeacherID, input.ClassID, input.CourseID).Scan(&item.ID, &item.EffectiveFrom)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (repo *MySQLRepository) insertEntitySnapshot(
	ctx context.Context,
	tx *sql.Tx,
	tenantID int64,
	entityType string,
	entityID int64,
	snapshotType string,
	snapshotJSON map[string]any,
	triggerEventType string,
	createdAt time.Time,
) error {
	versionNo, err := repo.nextSnapshotVersion(ctx, tx, tenantID, entityType, entityID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(snapshotJSON)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO entity_snapshots (
  tenant_id, entity_type, entity_id, snapshot_type, snapshot_json, version_no, trigger_event_type, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, tenantID, entityType, entityID, snapshotType, string(payload), versionNo, nullString(triggerEventType), createdAt)
	return err
}

func (repo *MySQLRepository) nextSnapshotVersion(
	ctx context.Context,
	tx *sql.Tx,
	tenantID int64,
	entityType string,
	entityID int64,
) (int, error) {
	var version sql.NullInt64
	err := tx.QueryRowContext(ctx, `
SELECT MAX(version_no)
FROM entity_snapshots
WHERE tenant_id = ? AND entity_type = ? AND entity_id = ?
`, tenantID, entityType, entityID).Scan(&version)
	if err != nil {
		return 0, err
	}
	if !version.Valid {
		return 1, nil
	}
	return int(version.Int64) + 1, nil
}

func (repo *MySQLRepository) insertAuditLog(
	ctx context.Context,
	tx *sql.Tx,
	tenantID int64,
	operatorUserID int64,
	moduleName string,
	actionName string,
	resourceType string,
	resourceID int64,
	beforeJSON map[string]any,
	afterJSON map[string]any,
	createdAt time.Time,
) error {
	var beforePayload any
	var afterPayload any
	if beforeJSON != nil {
		bytes, err := json.Marshal(beforeJSON)
		if err != nil {
			return err
		}
		beforePayload = string(bytes)
	}
	if afterJSON != nil {
		bytes, err := json.Marshal(afterJSON)
		if err != nil {
			return err
		}
		afterPayload = string(bytes)
	}
	_, err := tx.ExecContext(ctx, `
INSERT INTO audit_logs (
  tenant_id, operator_user_id, module_name, action_name, resource_type, resource_id,
  before_json, after_json, result, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, tenantID, operatorUserID, moduleName, actionName, resourceType, resourceID, beforePayload, afterPayload, AuditResultSuccess, createdAt)
	return err
}

func scanAuditLog(scanner interface{ Scan(dest ...any) error }) (AuditLog, error) {
	var item AuditLog
	var operatorID sql.NullInt64
	var resourceID sql.NullInt64
	var beforeJSON sql.NullString
	var afterJSON sql.NullString
	var requestID sql.NullString
	var ip sql.NullString
	var userAgent sql.NullString
	if err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&operatorID,
		&item.ModuleName,
		&item.ActionName,
		&item.ResourceType,
		&resourceID,
		&beforeJSON,
		&afterJSON,
		&requestID,
		&ip,
		&userAgent,
		&item.Result,
		&item.CreatedAt,
	); err != nil {
		return AuditLog{}, err
	}
	item.OperatorUserID = nullableInt64(operatorID)
	item.ResourceID = nullableInt64(resourceID)
	item.BeforeJSON = parseJSONMap(beforeJSON.String)
	item.AfterJSON = parseJSONMap(afterJSON.String)
	item.RequestID = nullableString(requestID)
	item.IP = nullableString(ip)
	item.UserAgent = nullableString(userAgent)
	return item, nil
}

func scanEntitySnapshot(scanner interface{ Scan(dest ...any) error }) (EntitySnapshot, error) {
	var item EntitySnapshot
	var payload string
	var trigger sql.NullString
	if err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.EntityType,
		&item.EntityID,
		&item.SnapshotType,
		&payload,
		&item.VersionNo,
		&trigger,
		&item.CreatedAt,
	); err != nil {
		return EntitySnapshot{}, err
	}
	item.SnapshotJSON = parseJSONMap(payload)
	item.TriggerEventType = nullableString(trigger)
	return item, nil
}

func scanStudentTransition(scanner interface{ Scan(dest ...any) error }) (StudentTransition, error) {
	var item StudentTransition
	var fromSchoolID, fromGradeID, fromClassID sql.NullInt64
	var toSchoolID, toGradeID, toClassID sql.NullInt64
	var remark sql.NullString
	if err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.StudentID,
		&item.TransitionType,
		&fromSchoolID,
		&fromGradeID,
		&fromClassID,
		&toSchoolID,
		&toGradeID,
		&toClassID,
		&item.OccurredAt,
		&item.OperatorID,
		&remark,
		&item.CreatedAt,
	); err != nil {
		return StudentTransition{}, err
	}
	item.FromSchoolID = nullableInt64(fromSchoolID)
	item.FromGradeID = nullableInt64(fromGradeID)
	item.FromClassID = nullableInt64(fromClassID)
	item.ToSchoolID = nullableInt64(toSchoolID)
	item.ToGradeID = nullableInt64(toGradeID)
	item.ToClassID = nullableInt64(toClassID)
	item.Remark = nullableString(remark)
	return item, nil
}

func scanTeacherAssignmentHistory(scanner interface{ Scan(dest ...any) error }) (TeacherAssignmentHistory, error) {
	var item TeacherAssignmentHistory
	var courseID sql.NullInt64
	var effectiveTo sql.NullTime
	if err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.TeacherID,
		&item.ClassID,
		&courseID,
		&item.AssignmentType,
		&item.ChangeType,
		&item.EffectiveFrom,
		&effectiveTo,
		&item.OperatorID,
		&item.CreatedAt,
	); err != nil {
		return TeacherAssignmentHistory{}, err
	}
	if effectiveTo.Valid {
		item.EffectiveTo = &effectiveTo.Time
	}
	item.CourseID = nullableInt64(courseID)
	return item, nil
}

func parseJSONMap(value string) map[string]any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	result := make(map[string]any)
	if err := json.Unmarshal([]byte(value), &result); err != nil {
		return map[string]any{"raw": value}
	}
	return result
}

func nullableInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	return &value.Int64
}

func nullableString(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func nullInt64Value(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func int64Ptr(value int64) *int64 {
	return &value
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func timeOrNil(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Format(time.RFC3339)
}

func valueOrNil(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func closesCurrentMembership(transitionType string) bool {
	switch transitionType {
	case TransitionTypeClassChange, TransitionTypePromote, TransitionTypeTransferOut, TransitionTypeGraduate, TransitionTypeLeaveSchool:
		return true
	default:
		return false
	}
}

func createsCurrentMembership(transitionType string) bool {
	switch transitionType {
	case TransitionTypeClassChange, TransitionTypePromote, TransitionTypeTransferIn, TransitionTypeReEnroll:
		return true
	default:
		return false
	}
}

func requiresCurrentMembership(transitionType string) bool {
	switch transitionType {
	case TransitionTypeClassChange, TransitionTypePromote, TransitionTypeTransferOut, TransitionTypeGraduate, TransitionTypeLeaveSchool:
		return true
	default:
		return false
	}
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

func (repo *MySQLRepository) String() string {
	return fmt.Sprintf("snapshot.mysql_repository")
}
