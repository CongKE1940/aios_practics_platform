package usermgmt

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

func (repo *MySQLRepository) ListStudents(ctx context.Context, tenantID int64, filter StudentListFilter) (PageResult[Student], error) {
	query := studentSelectSQL() + `
WHERE s.deleted_at IS NULL
`
	args := make([]any, 0, 6)
	if tenantID > 0 {
		query += " AND s.tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.SchoolID > 0 {
		query += " AND s.school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.Status != "" {
		query += " AND s.status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (s.code LIKE ? OR s.student_no LIKE ? OR u.username LIKE ? OR u.display_name LIKE ? OR u.phone LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword, keyword, keyword, keyword)
	}
	query += " ORDER BY s.id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Student]{}, err
	}
	defer rows.Close()
	items := make([]Student, 0)
	for rows.Next() {
		item, err := scanStudent(rows)
		if err != nil {
			return PageResult[Student]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Student]{}, err
	}
	return paginateUsers(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) CreateStudentWithUser(ctx context.Context, user User, passwordHash string, input StudentInput) (Student, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return Student{}, err
	}
	defer tx.Rollback()

	userID, err := repo.createPersonUserTx(ctx, tx, user, passwordHash)
	if err != nil {
		return Student{}, err
	}
	if err := repo.assignBuiltinRoleTx(ctx, tx, user.TenantID, userID, UserTypeStudent); err != nil {
		return Student{}, err
	}

	code := strings.TrimSpace(input.Code)
	if code == "" {
		code = defaultEntityCode("STU", userID)
	}
	enteredAt := nullableTime(input.EnteredAt)
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO students (id, tenant_id, code, user_id, school_id, student_no, enrollment_status, entered_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		userID,
		user.TenantID,
		code,
		userID,
		input.SchoolID,
		nullString(input.StudentNo),
		UserStatusActive,
		enteredAt,
		UserStatusActive,
	); err != nil {
		return Student{}, err
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO student_profiles (user_id, tenant_id, school_id, student_no, enrollment_status, entered_at) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), student_no = VALUES(student_no), enrollment_status = VALUES(enrollment_status), entered_at = VALUES(entered_at)`,
		userID,
		user.TenantID,
		input.SchoolID,
		nullString(input.StudentNo),
		UserStatusActive,
		enteredAt,
	); err != nil {
		return Student{}, err
	}
	if input.ClassID > 0 {
		schoolID, gradeID, err := repo.getClassSchoolGradeTx(ctx, tx, user.TenantID, input.ClassID)
		if err != nil {
			return Student{}, err
		}
		if schoolID != input.SchoolID {
			return Student{}, ErrInvalidInput
		}
		joinedAt := defaultPersonTime(input.EnteredAt)
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO student_class_memberships (tenant_id, student_id, school_id, grade_id, class_id, is_current, status, joined_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
			user.TenantID,
			userID,
			schoolID,
			gradeID,
			input.ClassID,
			UserStatusActive,
			joinedAt,
		); err != nil {
			return Student{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Student{}, err
	}
	return repo.getStudentByID(ctx, user.TenantID, userID)
}

func (repo *MySQLRepository) ListTeachers(ctx context.Context, tenantID int64, filter TeacherListFilter) (PageResult[Teacher], error) {
	query := teacherSelectSQL() + `
WHERE t.deleted_at IS NULL
`
	args := make([]any, 0, 6)
	if tenantID > 0 {
		query += " AND t.tenant_id = ?"
		args = append(args, tenantID)
	}
	if filter.SchoolID > 0 {
		query += " AND t.school_id = ?"
		args = append(args, filter.SchoolID)
	}
	if filter.Status != "" {
		query += " AND t.status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (t.code LIKE ? OR t.teacher_no LIKE ? OR u.username LIKE ? OR u.display_name LIKE ? OR u.phone LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword, keyword, keyword, keyword)
	}
	query += " ORDER BY t.id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Teacher]{}, err
	}
	defer rows.Close()
	items := make([]Teacher, 0)
	for rows.Next() {
		item, err := scanTeacher(rows)
		if err != nil {
			return PageResult[Teacher]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Teacher]{}, err
	}
	return paginateUsers(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) CreateTeacherWithUser(ctx context.Context, user User, passwordHash string, input TeacherInput) (Teacher, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return Teacher{}, err
	}
	defer tx.Rollback()

	userID, err := repo.createPersonUserTx(ctx, tx, user, passwordHash)
	if err != nil {
		return Teacher{}, err
	}
	if err := repo.assignBuiltinRoleTx(ctx, tx, user.TenantID, userID, UserTypeTeacher); err != nil {
		return Teacher{}, err
	}

	code := strings.TrimSpace(input.Code)
	if code == "" {
		code = defaultEntityCode("TCH", userID)
	}
	hiredAt := nullableTime(input.HiredAt)
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO teachers (id, tenant_id, code, user_id, school_id, teacher_no, employment_status, hired_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		userID,
		user.TenantID,
		code,
		userID,
		input.SchoolID,
		nullString(input.TeacherNo),
		UserStatusActive,
		hiredAt,
		UserStatusActive,
	); err != nil {
		return Teacher{}, err
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO teacher_profiles (user_id, tenant_id, school_id, teacher_no, employment_status, hired_at) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), teacher_no = VALUES(teacher_no), employment_status = VALUES(employment_status), hired_at = VALUES(hired_at)`,
		userID,
		user.TenantID,
		input.SchoolID,
		nullString(input.TeacherNo),
		UserStatusActive,
		hiredAt,
	); err != nil {
		return Teacher{}, err
	}
	if err := tx.Commit(); err != nil {
		return Teacher{}, err
	}
	return repo.getTeacherByID(ctx, user.TenantID, userID)
}

func (repo *MySQLRepository) createPersonUserTx(ctx context.Context, tx *sql.Tx, user User, passwordHash string) (int64, error) {
	result, err := tx.ExecContext(
		ctx,
		`INSERT INTO users (tenant_id, username, phone, email, avatar_url, password_hash, display_name, user_type, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		user.TenantID,
		user.Username,
		nullString(user.Phone),
		nullString(user.Email),
		nullString(user.AvatarURL),
		passwordHash,
		user.DisplayName,
		user.UserType,
		user.Status,
		user.MustChangePassword,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (repo *MySQLRepository) assignBuiltinRoleTx(ctx context.Context, tx *sql.Tx, tenantID int64, userID int64, roleCode string) error {
	roleID, err := repo.ensureBuiltinRoleTx(ctx, tx, tenantID, roleCode)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT IGNORE INTO user_roles (tenant_id, user_id, role_id) VALUES (?, ?, ?)`, tenantID, userID, roleID)
	return err
}

func (repo *MySQLRepository) ensureBuiltinRoleTx(ctx context.Context, tx *sql.Tx, tenantID int64, roleCode string) (int64, error) {
	var roleID int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM roles WHERE tenant_id = ? AND code = ? LIMIT 1`, tenantID, roleCode).Scan(&roleID)
	if err == nil {
		return roleID, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	roleName := "学生"
	if roleCode == UserTypeTeacher {
		roleName = "教师"
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO roles (tenant_id, code, name, role_type, data_scope_type, status, remark) VALUES (?, ?, ?, 'builtin', 'self', 'active', ?)`, tenantID, roleCode, roleName, "系统内置"+roleName+"角色")
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (repo *MySQLRepository) getClassSchoolGradeTx(ctx context.Context, tx *sql.Tx, tenantID int64, classID int64) (int64, int64, error) {
	var schoolID int64
	var gradeID int64
	err := tx.QueryRowContext(ctx, `SELECT school_id, grade_id FROM classes WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL AND status = 'active' LIMIT 1`, tenantID, classID).Scan(&schoolID, &gradeID)
	if err != nil {
		return 0, 0, wrapUserNotFound(err)
	}
	return schoolID, gradeID, nil
}

func (repo *MySQLRepository) getStudentByID(ctx context.Context, tenantID int64, id int64) (Student, error) {
	query := studentSelectSQL() + `
WHERE s.id = ? AND s.deleted_at IS NULL
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND s.tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	student, err := scanStudentScanner(repo.db.QueryRowContext(ctx, query, args...))
	if err != nil {
		return Student{}, wrapUserNotFound(err)
	}
	return student, nil
}

func (repo *MySQLRepository) getTeacherByID(ctx context.Context, tenantID int64, id int64) (Teacher, error) {
	query := teacherSelectSQL() + `
WHERE t.id = ? AND t.deleted_at IS NULL
`
	args := []any{id}
	if tenantID > 0 {
		query += " AND t.tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 1"
	teacher, err := scanTeacherScanner(repo.db.QueryRowContext(ctx, query, args...))
	if err != nil {
		return Teacher{}, wrapUserNotFound(err)
	}
	return teacher, nil
}

func studentSelectSQL() string {
	return `
SELECT s.id, s.tenant_id, s.code, s.user_id,
       u.username, u.display_name, u.phone, u.email, u.avatar_url,
       s.school_id, s.student_no, s.enrollment_status, s.entered_at, s.graduated_at,
       s.status, u.must_change_password, s.created_at, s.updated_at
FROM students s
JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
`
}

func teacherSelectSQL() string {
	return `
SELECT t.id, t.tenant_id, t.code, t.user_id,
       u.username, u.display_name, u.phone, u.email, u.avatar_url,
       t.school_id, t.teacher_no, t.employment_status, t.hired_at, t.left_at,
       t.status, u.must_change_password, t.created_at, t.updated_at
FROM teachers t
JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
`
}

func scanStudent(rows *sql.Rows) (Student, error) {
	return scanStudentScanner(rows)
}

func scanStudentScanner(scanner interface{ Scan(dest ...any) error }) (Student, error) {
	var item Student
	var phone sql.NullString
	var email sql.NullString
	var avatarURL sql.NullString
	var studentNo sql.NullString
	var enteredAt sql.NullTime
	var graduatedAt sql.NullTime
	if err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.Code,
		&item.UserID,
		&item.Username,
		&item.DisplayName,
		&phone,
		&email,
		&avatarURL,
		&item.SchoolID,
		&studentNo,
		&item.EnrollmentStatus,
		&enteredAt,
		&graduatedAt,
		&item.Status,
		&item.MustChangePassword,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return Student{}, err
	}
	item.Phone = nullStringValue(phone)
	item.Email = nullStringValue(email)
	item.AvatarURL = nullStringValue(avatarURL)
	item.StudentNo = nullStringValue(studentNo)
	if enteredAt.Valid {
		value := enteredAt.Time
		item.EnteredAt = &value
	}
	if graduatedAt.Valid {
		value := graduatedAt.Time
		item.GraduatedAt = &value
	}
	return item, nil
}

func scanTeacher(rows *sql.Rows) (Teacher, error) {
	return scanTeacherScanner(rows)
}

func scanTeacherScanner(scanner interface{ Scan(dest ...any) error }) (Teacher, error) {
	var item Teacher
	var phone sql.NullString
	var email sql.NullString
	var avatarURL sql.NullString
	var teacherNo sql.NullString
	var hiredAt sql.NullTime
	var leftAt sql.NullTime
	if err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.Code,
		&item.UserID,
		&item.Username,
		&item.DisplayName,
		&phone,
		&email,
		&avatarURL,
		&item.SchoolID,
		&teacherNo,
		&item.EmploymentStatus,
		&hiredAt,
		&leftAt,
		&item.Status,
		&item.MustChangePassword,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return Teacher{}, err
	}
	item.Phone = nullStringValue(phone)
	item.Email = nullStringValue(email)
	item.AvatarURL = nullStringValue(avatarURL)
	item.TeacherNo = nullStringValue(teacherNo)
	if hiredAt.Valid {
		value := hiredAt.Time
		item.HiredAt = &value
	}
	if leftAt.Valid {
		value := leftAt.Time
		item.LeftAt = &value
	}
	return item, nil
}

func nullStringValue(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}
