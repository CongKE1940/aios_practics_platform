package org

import (
	"context"
	"database/sql"
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
SELECT id, tenant_id, COALESCE(object_type, 'school'), code, name, COALESCE(english_name, ''), COALESCE(address, ''), COALESCE(logo_url, ''), status, created_at, updated_at
FROM schools
WHERE tenant_id = ? AND deleted_at IS NULL
`
	args := []any{tenantID}
	if filter.ObjectType != "" {
		query += " AND COALESCE(object_type, 'school') = ?"
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

	rows, err := repo.db.QueryContext(ctx, query, args...)
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
	const query = `
SELECT id, tenant_id, COALESCE(object_type, 'school'), code, name, COALESCE(english_name, ''), COALESCE(address, ''), COALESCE(logo_url, ''), status, created_at, updated_at
FROM schools
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
LIMIT 1
`
	school, err := scanSchoolScanner(repo.db.QueryRowContext(ctx, query, id, tenantID))
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
	result, err := repo.db.ExecContext(ctx, query, school.TenantID, school.ObjectType, school.Code, school.Name, nullString(school.EnglishName), nullString(school.Address), nullString(school.LogoURL), school.Status)
	if err != nil {
		return School{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return School{}, err
	}
	return repo.GetSchool(ctx, school.TenantID, id)
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
	const query = `
UPDATE schools
SET deleted_at = NOW()
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	return repo.execAffectingOne(ctx, query, id, tenantID)
}

func (repo *MySQLRepository) updateSchoolStatus(ctx context.Context, tenantID int64, id int64, status string) error {
	const query = `
UPDATE schools
SET status = ?
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
`
	return repo.execAffectingOne(ctx, query, status, id, tenantID)
}

func (repo *MySQLRepository) ListGrades(ctx context.Context, tenantID int64, filter GradeListFilter) (PageResult[Grade], error) {
	query := `
SELECT id, tenant_id, school_id, code, name, grade_level, school_year, status, created_at, updated_at
FROM grades
WHERE tenant_id = ? AND deleted_at IS NULL
`
	args := []any{tenantID}
	if filter.SchoolID > 0 {
		query += " AND school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
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
	const query = `
SELECT id, tenant_id, school_id, code, name, grade_level, school_year, status, created_at, updated_at
FROM grades
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
LIMIT 1
`
	grade, err := scanGradeScanner(repo.db.QueryRowContext(ctx, query, id, tenantID))
	if err != nil {
		return Grade{}, wrapNotFound(err)
	}
	return grade, nil
}

func (repo *MySQLRepository) CreateGrade(ctx context.Context, grade Grade) (Grade, error) {
	const query = `INSERT INTO grades (tenant_id, school_id, code, name, grade_level, school_year, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
	result, err := repo.db.ExecContext(ctx, query, grade.TenantID, grade.SchoolID, grade.Code, grade.Name, grade.GradeLevel, nullString(grade.SchoolYear), grade.Status)
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
	query := `
SELECT id, tenant_id, school_id, grade_id, code, name, class_no, status, created_at, updated_at
FROM classes
WHERE tenant_id = ? AND deleted_at IS NULL
`
	args := []any{tenantID}
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
	rows, err := repo.db.QueryContext(ctx, query, args...)
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
	const query = `SELECT id, tenant_id, school_id, grade_id, code, name, class_no, status, created_at, updated_at FROM classes WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`
	classItem, err := scanClassScanner(repo.db.QueryRowContext(ctx, query, id, tenantID))
	if err != nil {
		return Class{}, wrapNotFound(err)
	}
	return classItem, nil
}

func (repo *MySQLRepository) CreateClass(ctx context.Context, classItem Class) (Class, error) {
	const query = `INSERT INTO classes (tenant_id, school_id, grade_id, code, name, class_no, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
	result, err := repo.db.ExecContext(ctx, query, classItem.TenantID, classItem.SchoolID, classItem.GradeID, classItem.Code, classItem.Name, nullInt(classItem.ClassNo), classItem.Status)
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
	query := `
SELECT id, tenant_id, code, name, start_at, end_at, status, description, created_at, updated_at
FROM courses
WHERE tenant_id = ? AND deleted_at IS NULL
`
	args := []any{tenantID}
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
		args = append(args, filter.ActiveAt, filter.ActiveAt)
	}
	query += " ORDER BY id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
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
	const query = `SELECT id, tenant_id, code, name, start_at, end_at, status, description, created_at, updated_at FROM courses WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`
	course, err := scanCourseScanner(repo.db.QueryRowContext(ctx, query, id, tenantID))
	if err != nil {
		return Course{}, wrapNotFound(err)
	}
	return course, nil
}

func (repo *MySQLRepository) CreateCourse(ctx context.Context, course Course) (Course, error) {
	const query = `INSERT INTO courses (tenant_id, code, name, start_at, end_at, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)`
	result, err := repo.db.ExecContext(ctx, query, course.TenantID, course.Code, course.Name, nullTime(course.StartAt), nullTime(course.EndAt), course.Status, nullString(course.Description))
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
	err := scanner.Scan(&school.ID, &school.TenantID, &school.ObjectType, &school.Code, &school.Name, &school.EnglishName, &school.Address, &school.LogoURL, &school.Status, &school.CreatedAt, &school.UpdatedAt)
	if err != nil {
		return School{}, err
	}
	return school, nil
}

func scanGrade(rows *sql.Rows) (Grade, error) { return scanGradeScanner(rows) }

func scanGradeScanner(scanner interface{ Scan(dest ...any) error }) (Grade, error) {
	var grade Grade
	var schoolYear sql.NullString
	err := scanner.Scan(&grade.ID, &grade.TenantID, &grade.SchoolID, &grade.Code, &grade.Name, &grade.GradeLevel, &schoolYear, &grade.Status, &grade.CreatedAt, &grade.UpdatedAt)
	if err != nil {
		return Grade{}, err
	}
	if schoolYear.Valid {
		grade.SchoolYear = schoolYear.String
	}
	return grade, nil
}

func scanClass(rows *sql.Rows) (Class, error) { return scanClassScanner(rows) }

func scanClassScanner(scanner interface{ Scan(dest ...any) error }) (Class, error) {
	var classItem Class
	var classNo sql.NullInt64
	err := scanner.Scan(&classItem.ID, &classItem.TenantID, &classItem.SchoolID, &classItem.GradeID, &classItem.Code, &classItem.Name, &classNo, &classItem.Status, &classItem.CreatedAt, &classItem.UpdatedAt)
	if err != nil {
		return Class{}, err
	}
	if classNo.Valid {
		value := int(classNo.Int64)
		classItem.ClassNo = &value
	}
	return classItem, nil
}

func scanCourse(rows *sql.Rows) (Course, error) { return scanCourseScanner(rows) }

func scanCourseScanner(scanner interface{ Scan(dest ...any) error }) (Course, error) {
	var course Course
	var startAt sql.NullTime
	var endAt sql.NullTime
	var description sql.NullString
	err := scanner.Scan(&course.ID, &course.TenantID, &course.Code, &course.Name, &startAt, &endAt, &course.Status, &description, &course.CreatedAt, &course.UpdatedAt)
	if err != nil {
		return Course{}, err
	}
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
	return course, nil
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

func wrapNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}
