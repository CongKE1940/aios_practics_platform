package org

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListSchools(ctx context.Context, tenantID int64, filter SchoolListFilter) (PageResult[School], error) {
	query := `
SELECT id, tenant_id,
       CASE WHEN object_type IN (2, '2', 'organization') THEN 2 ELSE 1 END AS object_type,
       CASE WHEN object_type IN (2, '2', 'organization') THEN '组织' ELSE '学校' END AS object_type_label,
       code, name, COALESCE(english_name, ''), COALESCE(address, ''), COALESCE(logo_url, ''), status, created_at, updated_at
FROM schools
WHERE deleted_at IS NULL
`
	args := make([]any, 0, 6)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.ObjectType > 0 {
		query += " AND CASE WHEN object_type IN (2, '2', 'organization') THEN 2 ELSE 1 END = ?"
		args = append(args, filter.ObjectType)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (code LIKE ? OR name LIKE ? OR english_name LIKE ? OR address LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword, keyword, keyword)
	}
	query += " ORDER BY id"

	rows, err := repo.queryContext(ctx, query, args...)
	if err != nil {
		return PageResult[School]{}, err
	}
	defer rows.Close()

	items := make([]School, 0)
	for rows.Next() {
		school, err := scanSchool(rows)
		if err != nil {
			return PageResult[School]{}, err
		}
		items = append(items, school)
	}
	if err := rows.Err(); err != nil {
		return PageResult[School]{}, err
	}
	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetSchool(ctx context.Context, tenantID int64, id int64) (School, error) {
	query := `
SELECT id, tenant_id,
       CASE WHEN object_type IN (2, '2', 'organization') THEN 2 ELSE 1 END AS object_type,
       CASE WHEN object_type IN (2, '2', 'organization') THEN '组织' ELSE '学校' END AS object_type_label,
       code, name, COALESCE(english_name, ''), COALESCE(address, ''), COALESCE(logo_url, ''), status, created_at, updated_at
FROM schools
WHERE id = ? AND deleted_at IS NULL
LIMIT 1
`
	args := []any{id}
	if tenantID > 0 {
		query = strings.Replace(query, "WHERE id = ? AND deleted_at IS NULL", "WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", 1)
		args = append(args, tenantID)
	}
	school, err := scanSchoolScanner(repo.queryRowContext(ctx, query, args...))
	if err != nil {
		return School{}, wrapNotFound(err)
	}
	return school, nil
}

func (repo *MySQLRepository) CreateSchool(ctx context.Context, school School) (School, error) {
	const query = `
INSERT INTO schools (tenant_id, object_type, code, name, english_name, address, logo_url, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`
	result, err := repo.execContext(ctx, query, school.TenantID, school.ObjectType, school.Code, school.Name, nullString(school.EnglishName), nullString(school.Address), nullString(school.LogoURL), school.Status)
	if err != nil {
		return School{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return School{}, err
	}
	return repo.GetSchool(ctx, school.TenantID, id)
}

func (repo *MySQLRepository) CreateSchoolWithDefaultAdmin(ctx context.Context, school School, admin DefaultAdminSeed) (School, error) {
	tx, err := repo.beginTx(ctx)
	if err != nil {
		return School{}, err
	}
	defer tx.Rollback()

	tenantCode := defaultTenantCode(school.Code)
	tenantType := tenantTypeForObjectType(school.ObjectType)
	tenantResult, err := execTxContext(
		ctx,
		tx,
		`INSERT INTO tenants (code, name, tenant_type, status, remark) VALUES (?, ?, ?, ?, ?)`,
		tenantCode,
		school.Name,
		tenantType,
		StatusActive,
		"系统管理员创建学校或组织时自动生成",
	)
	if err != nil {
		return School{}, err
	}
	tenantID, err := tenantResult.LastInsertId()
	if err != nil {
		return School{}, err
	}

	school.TenantID = tenantID
	schoolResult, err := execTxContext(
		ctx,
		tx,
		`INSERT INTO schools (tenant_id, object_type, code, name, english_name, address, logo_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		school.TenantID,
		school.ObjectType,
		school.Code,
		school.Name,
		nullString(school.EnglishName),
		nullString(school.Address),
		nullString(school.LogoURL),
		school.Status,
	)
	if err != nil {
		return School{}, err
	}
	schoolID, err := schoolResult.LastInsertId()
	if err != nil {
		return School{}, err
	}

	roleID, err := createDefaultAdminRole(ctx, tx, tenantID)
	if err != nil {
		return School{}, err
	}
	if err := assignDefaultAdminPermissions(ctx, tx, roleID); err != nil {
		return School{}, err
	}
	if operatorRoleID, err := createDefaultOperatorRole(ctx, tx, tenantID); err != nil {
		return School{}, err
	} else if err := assignDefaultOperatorPermissions(ctx, tx, operatorRoleID); err != nil {
		return School{}, err
	}

	userResult, err := execTxContext(
		ctx,
		tx,
		`INSERT INTO users (tenant_id, username, phone, email, password_hash, display_name, user_type, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		tenantID,
		admin.Username,
		nil,
		nil,
		admin.PasswordHash,
		admin.DisplayName,
		admin.UserType,
		StatusActive,
		true,
	)
	if err != nil {
		return School{}, err
	}
	userID, err := userResult.LastInsertId()
	if err != nil {
		return School{}, err
	}
	if _, err := execTxContext(ctx, tx, `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES (?, ?, ?)`, tenantID, userID, roleID); err != nil {
		return School{}, err
	}

	if err := tx.Commit(); err != nil {
		return School{}, err
	}

	created, err := repo.GetSchool(ctx, tenantID, schoolID)
	if err != nil {
		return School{}, err
	}
	created.DefaultAdmin = &DefaultOrganizationAdmin{
		TenantID:        tenantID,
		TenantCode:      tenantCode,
		UserID:          userID,
		Username:        admin.Username,
		DisplayName:     admin.DisplayName,
		UserType:        admin.UserType,
		RoleID:          roleID,
		InitialPassword: admin.InitialPassword,
	}
	return created, nil
}

func (repo *MySQLRepository) UpdateSchool(ctx context.Context, school School) (School, error) {
	const query = `
UPDATE schools
SET object_type = ?, name = ?, english_name = ?, address = ?, logo_url = ?, status = ?
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	if err := repo.execAffectingOne(ctx, query, school.ObjectType, school.Name, nullString(school.EnglishName), nullString(school.Address), nullString(school.LogoURL), school.Status, school.ID, school.TenantID); err != nil {
		return School{}, err
	}
	return repo.GetSchool(ctx, school.TenantID, school.ID)
}

func (repo *MySQLRepository) DisableSchool(ctx context.Context, tenantID int64, id int64) error {
	return repo.updateSchoolStatus(ctx, tenantID, id, StatusDisabled)
}

func (repo *MySQLRepository) EnableSchool(ctx context.Context, tenantID int64, id int64) error {
	return repo.updateSchoolStatus(ctx, tenantID, id, StatusActive)
}

func (repo *MySQLRepository) DeleteSchool(ctx context.Context, tenantID int64, id int64) error {
	const query = `UPDATE schools SET deleted_at = NOW(3) WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	return repo.execAffectingOne(ctx, query, id, tenantID)
}

func (repo *MySQLRepository) CountSchoolDeleteDependencies(ctx context.Context, tenantID int64, id int64) (SchoolDeleteDependencies, error) {
	var dependencies SchoolDeleteDependencies
	if err := repo.queryRowContext(ctx, `SELECT COUNT(*) FROM grades WHERE tenant_id = ? AND school_id = ? AND deleted_at IS NULL`, tenantID, id).Scan(&dependencies.GradeCount); err != nil {
		return SchoolDeleteDependencies{}, err
	}
	if err := repo.queryRowContext(ctx, `SELECT COUNT(*) FROM classes WHERE tenant_id = ? AND school_id = ? AND deleted_at IS NULL`, tenantID, id).Scan(&dependencies.ClassCount); err != nil {
		return SchoolDeleteDependencies{}, err
	}
	if err := repo.queryRowContext(ctx, `SELECT COUNT(*) FROM student_profiles WHERE tenant_id = ? AND school_id = ? AND enrollment_status <> 'left'`, tenantID, id).Scan(&dependencies.StudentCount); err != nil {
		return SchoolDeleteDependencies{}, err
	}
	return dependencies, nil
}

func (repo *MySQLRepository) DeleteSchoolWithCascade(ctx context.Context, tenantID int64, id int64) error {
	tx, err := repo.beginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	statements := []struct {
		query string
		args  []any
	}{
		{`UPDATE student_profiles SET enrollment_status = 'left', graduated_at = COALESCE(graduated_at, NOW(3)) WHERE tenant_id = ? AND school_id = ? AND enrollment_status <> 'left'`, []any{tenantID, id}},
		{`UPDATE users SET status = 'disabled', deleted_at = COALESCE(deleted_at, NOW(3)) WHERE tenant_id = ? AND id IN (SELECT user_id FROM student_profiles WHERE tenant_id = ? AND school_id = ?) AND deleted_at IS NULL`, []any{tenantID, tenantID, id}},
		{`UPDATE classes SET deleted_at = NOW(3) WHERE tenant_id = ? AND school_id = ? AND deleted_at IS NULL`, []any{tenantID, id}},
		{`UPDATE grades SET deleted_at = NOW(3) WHERE tenant_id = ? AND school_id = ? AND deleted_at IS NULL`, []any{tenantID, id}},
		{`UPDATE schools SET deleted_at = NOW(3) WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, []any{id, tenantID}},
	}
	for _, statement := range statements {
		if _, err := execTxContext(ctx, tx, statement.query, statement.args...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (repo *MySQLRepository) updateSchoolStatus(ctx context.Context, tenantID int64, id int64, status string) error {
	const query = `UPDATE schools SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	return repo.execAffectingOne(ctx, query, status, id, tenantID)
}

func (repo *MySQLRepository) ListGrades(ctx context.Context, tenantID int64, filter GradeListFilter) (PageResult[Grade], error) {
	query := `SELECT id, tenant_id, school_id, code, name, grade_level, school_year, status, created_at, updated_at FROM grades WHERE deleted_at IS NULL`
	args := make([]any, 0, 4)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.SchoolID > 0 {
		query += " AND school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY id"
	rows, err := repo.queryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Grade]{}, err
	}
	defer rows.Close()
	items := make([]Grade, 0)
	for rows.Next() {
		grade, err := scanGrade(rows)
		if err != nil {
			return PageResult[Grade]{}, err
		}
		items = append(items, grade)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Grade]{}, err
	}
	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetGrade(ctx context.Context, tenantID int64, id int64) (Grade, error) {
	query := `SELECT id, tenant_id, school_id, code, name, grade_level, school_year, status, created_at, updated_at FROM grades WHERE id = ? AND deleted_at IS NULL`
	args := []any{id}
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	grade, err := scanGradeScanner(repo.queryRowContext(ctx, query, args...))
	if err != nil {
		return Grade{}, wrapNotFound(err)
	}
	return grade, nil
}

func (repo *MySQLRepository) CreateGrade(ctx context.Context, grade Grade) (Grade, error) {
	const query = `INSERT INTO grades (tenant_id, school_id, code, name, grade_level, school_year, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
	result, err := repo.execContext(ctx, query, grade.TenantID, grade.SchoolID, grade.Code, grade.Name, grade.GradeLevel, nullString(grade.SchoolYear), grade.Status)
	if err != nil {
		return Grade{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Grade{}, err
	}
	return repo.GetGrade(ctx, grade.TenantID, id)
}

func (repo *MySQLRepository) UpdateGrade(ctx context.Context, grade Grade) (Grade, error) {
	const query = `UPDATE grades SET school_id = ?, code = ?, name = ?, grade_level = ?, school_year = ?, status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	if err := repo.execAffectingOne(ctx, query, grade.SchoolID, grade.Code, grade.Name, grade.GradeLevel, nullString(grade.SchoolYear), grade.Status, grade.ID, grade.TenantID); err != nil {
		return Grade{}, err
	}
	return repo.GetGrade(ctx, grade.TenantID, grade.ID)
}

func (repo *MySQLRepository) DisableGrade(ctx context.Context, tenantID int64, id int64) error {
	const query = `UPDATE grades SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	return repo.execAffectingOne(ctx, query, StatusDisabled, id, tenantID)
}

func (repo *MySQLRepository) ListClasses(ctx context.Context, tenantID int64, filter ClassListFilter) (PageResult[Class], error) {
	query := `SELECT id, tenant_id, school_id, grade_id, code, name, class_no, status, created_at, updated_at FROM classes WHERE deleted_at IS NULL`
	args := make([]any, 0, 5)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.SchoolID > 0 {
		query += " AND school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.GradeID > 0 {
		query += " AND grade_id = ?"
		args = append(args, filter.GradeID)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY id"
	rows, err := repo.queryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Class]{}, err
	}
	defer rows.Close()
	items := make([]Class, 0)
	for rows.Next() {
		classItem, err := scanClass(rows)
		if err != nil {
			return PageResult[Class]{}, err
		}
		items = append(items, classItem)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Class]{}, err
	}
	return paginateItems(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetClass(ctx context.Context, tenantID int64, id int64) (Class, error) {
	query := `SELECT id, tenant_id, school_id, grade_id, code, name, class_no, status, created_at, updated_at FROM classes WHERE id = ? AND deleted_at IS NULL`
	args := []any{id}
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	classItem, err := scanClassScanner(repo.queryRowContext(ctx, query, args...))
	if err != nil {
		return Class{}, wrapNotFound(err)
	}
	return classItem, nil
}

func (repo *MySQLRepository) CreateClass(ctx context.Context, classItem Class) (Class, error) {
	const query = `INSERT INTO classes (tenant_id, school_id, grade_id, code, name, class_no, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
	result, err := repo.execContext(ctx, query, classItem.TenantID, classItem.SchoolID, classItem.GradeID, classItem.Code, classItem.Name, nullInt(classItem.ClassNo), classItem.Status)
	if err != nil {
		return Class{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Class{}, err
	}
	return repo.GetClass(ctx, classItem.TenantID, id)
}

func (repo *MySQLRepository) UpdateClass(ctx context.Context, classItem Class) (Class, error) {
	const query = `UPDATE classes SET school_id = ?, grade_id = ?, code = ?, name = ?, class_no = ?, status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	if err := repo.execAffectingOne(ctx, query, classItem.SchoolID, classItem.GradeID, classItem.Code, classItem.Name, nullInt(classItem.ClassNo), classItem.Status, classItem.ID, classItem.TenantID); err != nil {
		return Class{}, err
	}
	return repo.GetClass(ctx, classItem.TenantID, classItem.ID)
}

func (repo *MySQLRepository) DisableClass(ctx context.Context, tenantID int64, id int64) error {
	const query = `UPDATE classes SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	return repo.execAffectingOne(ctx, query, StatusDisabled, id, tenantID)
}

func (repo *MySQLRepository) ListCourses(ctx context.Context, tenantID int64, filter CourseListFilter) (PageResult[Course], error) {
	query := `SELECT id, tenant_id, code, name, start_at, end_at, status, description, created_at, updated_at FROM courses WHERE deleted_at IS NULL`
	args := make([]any, 0, 6)
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (code LIKE ? OR name LIKE ? OR description LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword, keyword)
	}
	if filter.ActiveAt != nil {
		query += " AND (start_at IS NULL OR start_at <= ?) AND (end_at IS NULL OR end_at >= ?)"
		args = append(args, *filter.ActiveAt, *filter.ActiveAt)
	}
	query += " ORDER BY id DESC"
	rows, err := repo.queryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Course]{}, err
	}
	defer rows.Close()
	items := make([]Course, 0)
	for rows.Next() {
		course, err := scanCourse(rows)
		if err != nil {
			return PageResult[Course]{}, err
		}
		items = append(items, course)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Course]{}, err
	}
	return paginateItems(items, filter.Page, filter.PageSize), nil
}
func (repo *MySQLRepository) GetCourse(ctx context.Context, tenantID int64, id int64) (Course, error) {
	query := `SELECT id, tenant_id, code, name, start_at, end_at, status, description, created_at, updated_at FROM courses WHERE id = ? AND deleted_at IS NULL`
	args := []any{id}
	if tenantID > 0 {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	course, err := scanCourseScanner(repo.queryRowContext(ctx, query, args...))
	if err != nil {
		return Course{}, wrapNotFound(err)
	}
	return course, nil
}
func (repo *MySQLRepository) CreateCourse(ctx context.Context, course Course) (Course, error) {
	const query = `INSERT INTO courses (tenant_id, code, name, start_at, end_at, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)`
	result, err := repo.execContext(ctx, query, course.TenantID, course.Code, course.Name, nullTime(course.StartAt), nullTime(course.EndAt), course.Status, nullString(course.Description))
	if err != nil {
		return Course{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Course{}, err
	}
	return repo.GetCourse(ctx, course.TenantID, id)
}
func (repo *MySQLRepository) UpdateCourse(ctx context.Context, course Course) (Course, error) {
	const query = `UPDATE courses SET code = ?, name = ?, start_at = ?, end_at = ?, status = ?, description = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	if err := repo.execAffectingOne(ctx, query, course.Code, course.Name, nullTime(course.StartAt), nullTime(course.EndAt), course.Status, nullString(course.Description), course.ID, course.TenantID); err != nil {
		return Course{}, err
	}
	return repo.GetCourse(ctx, course.TenantID, course.ID)
}
func (repo *MySQLRepository) DisableCourse(ctx context.Context, tenantID int64, id int64) error {
	const query = `UPDATE courses SET status = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
	return repo.execAffectingOne(ctx, query, StatusDisabled, id, tenantID)
}

func (repo *MySQLRepository) execAffectingOne(ctx context.Context, query string, args ...any) error {
	result, err := repo.execContext(ctx, query, args...)
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

func (repo *MySQLRepository) queryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	startedAt := time.Now()
	rows, err := repo.db.QueryContext(ctx, query, args...)
	logSQL("query", query, args, time.Since(startedAt), err)
	return rows, err
}

func (repo *MySQLRepository) queryRowContext(ctx context.Context, query string, args ...any) sqlRowScanner {
	return loggedRow{
		row:       repo.db.QueryRowContext(ctx, query, args...),
		startedAt: time.Now(),
		query:     query,
		args:      args,
	}
}

func (repo *MySQLRepository) execContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	startedAt := time.Now()
	result, err := repo.db.ExecContext(ctx, query, args...)
	logSQL("exec", query, args, time.Since(startedAt), err)
	return result, err
}

func (repo *MySQLRepository) beginTx(ctx context.Context) (*sql.Tx, error) {
	startedAt := time.Now()
	tx, err := repo.db.BeginTx(ctx, nil)
	logSQL("begin_tx", "BEGIN", nil, time.Since(startedAt), err)
	return tx, err
}

func execTxContext(ctx context.Context, tx *sql.Tx, query string, args ...any) (sql.Result, error) {
	startedAt := time.Now()
	result, err := tx.ExecContext(ctx, query, args...)
	logSQL("tx_exec", query, args, time.Since(startedAt), err)
	return result, err
}

type sqlRowScanner interface {
	Scan(dest ...any) error
}

type loggedRow struct {
	row       *sql.Row
	startedAt time.Time
	query     string
	args      []any
}

func (row loggedRow) Scan(dest ...any) error {
	err := row.row.Scan(dest...)
	logSQL("query_row", row.query, row.args, time.Since(row.startedAt), err)
	return err
}

func logSQL(operation string, query string, args []any, elapsed time.Duration, err error) {
	if err != nil {
		log.Printf("mysql %s elapsed=%s error=%v sql=%q args=%v", operation, elapsed, err, normalizeSQL(query), args)
		return
	}
	log.Printf("mysql %s elapsed=%s sql=%q args=%v", operation, elapsed, normalizeSQL(query), args)
}

func normalizeSQL(query string) string {
	return strings.Join(strings.Fields(query), " ")
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
	return PageResult[T]{Items: items[start:end], Page: page, PageSize: pageSize, Total: len(items)}
}

func scanSchool(rows *sql.Rows) (School, error) { return scanSchoolScanner(rows) }
func scanSchoolScanner(scanner interface{ Scan(dest ...any) error }) (School, error) {
	var school School
	err := scanner.Scan(&school.ID, &school.TenantID, &school.ObjectType, &school.ObjectTypeLabel, &school.Code, &school.Name, &school.EnglishName, &school.Address, &school.LogoURL, &school.Status, &school.CreatedAt, &school.UpdatedAt)
	return school, err
}
func scanGrade(rows *sql.Rows) (Grade, error) { return scanGradeScanner(rows) }
func scanGradeScanner(scanner interface{ Scan(dest ...any) error }) (Grade, error) {
	var grade Grade
	var schoolYear sql.NullString
	err := scanner.Scan(&grade.ID, &grade.TenantID, &grade.SchoolID, &grade.Code, &grade.Name, &grade.GradeLevel, &schoolYear, &grade.Status, &grade.CreatedAt, &grade.UpdatedAt)
	if schoolYear.Valid {
		grade.SchoolYear = schoolYear.String
	}
	return grade, err
}
func scanClass(rows *sql.Rows) (Class, error) { return scanClassScanner(rows) }
func scanClassScanner(scanner interface{ Scan(dest ...any) error }) (Class, error) {
	var classItem Class
	var classNo sql.NullInt64
	err := scanner.Scan(&classItem.ID, &classItem.TenantID, &classItem.SchoolID, &classItem.GradeID, &classItem.Code, &classItem.Name, &classNo, &classItem.Status, &classItem.CreatedAt, &classItem.UpdatedAt)
	if classNo.Valid {
		value := int(classNo.Int64)
		classItem.ClassNo = &value
	}
	return classItem, err
}
func scanCourse(rows *sql.Rows) (Course, error) { return scanCourseScanner(rows) }
func scanCourseScanner(scanner interface{ Scan(dest ...any) error }) (Course, error) {
	var course Course
	var startAt sql.NullTime
	var endAt sql.NullTime
	var description sql.NullString
	err := scanner.Scan(&course.ID, &course.TenantID, &course.Code, &course.Name, &startAt, &endAt, &course.Status, &description, &course.CreatedAt, &course.UpdatedAt)
	if startAt.Valid {
		value := startAt.Time
		course.StartAt = &value
	}
	if endAt.Valid {
		value := endAt.Time
		course.EndAt = &value
	}
	if description.Valid {
		course.Description = description.String
	}
	return course, err
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
func nullTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}
func nullInt(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func defaultTenantCode(schoolCode string) string {
	return strings.ToLower(strings.TrimSpace(schoolCode))
}

func tenantTypeForObjectType(objectType int) string {
	if objectType == ObjectTypeOrganization {
		return "organization"
	}
	return "school"
}

func createDefaultAdminRole(ctx context.Context, tx *sql.Tx, tenantID int64) (int64, error) {
	result, err := execTxContext(
		ctx,
		tx,
		`INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		tenantID,
		"school_admin",
		"学校/组织管理员",
		"builtin",
		"tenant",
		StatusActive,
		"系统自动创建的默认组织管理员角色",
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func assignDefaultAdminPermissions(ctx context.Context, tx *sql.Tx, roleID int64) error {
	return assignRolePermissionsByCodes(ctx, tx, roleID, defaultAdminPermissionCodes)
}

func createDefaultOperatorRole(ctx context.Context, tx *sql.Tx, tenantID int64) (int64, error) {
	result, err := execTxContext(
		ctx,
		tx,
		`INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		tenantID,
		"org_operator",
		"学校/组织协管员",
		"builtin",
		"tenant",
		StatusActive,
		"系统自动创建的低权限组织管理员角色",
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func assignDefaultOperatorPermissions(ctx context.Context, tx *sql.Tx, roleID int64) error {
	return assignRolePermissionsByCodes(ctx, tx, roleID, defaultOperatorPermissionCodes)
}

func assignRolePermissionsByCodes(ctx context.Context, tx *sql.Tx, roleID int64, permissionCodes []string) error {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(permissionCodes)), ",")
	query := fmt.Sprintf(
		`INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code IN (%s)`,
		placeholders,
	)
	args := make([]any, 0, len(permissionCodes)+1)
	args = append(args, roleID)
	for _, code := range permissionCodes {
		args = append(args, code)
	}
	_, err := execTxContext(ctx, tx, query, args...)
	return err
}

var defaultAdminPermissionCodes = []string{
	"auth:login",
	"user:manage",
	"role:manage",
	"org:manage",
	"question_bank:manage",
	"question:manage",
	"practice:use",
	"exam:manage",
	"notice:manage",
	"import:manage",
	"file:upload",
	"analytics:view",
	"audit:view",
}

var defaultOperatorPermissionCodes = []string{
	"auth:login",
	"user:manage",
	"practice:use",
	"notice:manage",
	"file:upload",
	"analytics:view",
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
