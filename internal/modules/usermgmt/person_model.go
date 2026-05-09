package usermgmt

import "time"

const (
	UserTypeStudent = "student"
	UserTypeTeacher = "teacher"
)

type Student struct {
	ID                 int64      `json:"id"`
	TenantID           int64      `json:"tenant_id"`
	Code               string     `json:"code"`
	UserID             int64      `json:"user_id"`
	Username           string     `json:"username"`
	DisplayName        string     `json:"display_name"`
	Phone              string     `json:"phone,omitempty"`
	Email              string     `json:"email,omitempty"`
	AvatarURL          string     `json:"avatar_url,omitempty"`
	SchoolID           int64      `json:"school_id"`
	StudentNo          string     `json:"student_no,omitempty"`
	EnrollmentStatus   string     `json:"enrollment_status"`
	EnteredAt          *time.Time `json:"entered_at,omitempty"`
	GraduatedAt        *time.Time `json:"graduated_at,omitempty"`
	Status             string     `json:"status"`
	InitialPassword    string     `json:"initial_password,omitempty"`
	MustChangePassword bool       `json:"must_change_password"`
	CreatedAt          time.Time  `json:"created_at,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at,omitempty"`
}

type Teacher struct {
	ID                 int64      `json:"id"`
	TenantID           int64      `json:"tenant_id"`
	Code               string     `json:"code"`
	UserID             int64      `json:"user_id"`
	Username           string     `json:"username"`
	DisplayName        string     `json:"display_name"`
	Phone              string     `json:"phone,omitempty"`
	Email              string     `json:"email,omitempty"`
	AvatarURL          string     `json:"avatar_url,omitempty"`
	SchoolID           int64      `json:"school_id"`
	TeacherNo          string     `json:"teacher_no,omitempty"`
	EmploymentStatus   string     `json:"employment_status"`
	HiredAt            *time.Time `json:"hired_at,omitempty"`
	LeftAt             *time.Time `json:"left_at,omitempty"`
	Status             string     `json:"status"`
	InitialPassword    string     `json:"initial_password,omitempty"`
	MustChangePassword bool       `json:"must_change_password"`
	CreatedAt          time.Time  `json:"created_at,omitempty"`
	UpdatedAt          time.Time  `json:"updated_at,omitempty"`
}

type StudentInput struct {
	Code        string     `json:"code"`
	Username    string     `json:"username"`
	DisplayName string     `json:"display_name" binding:"required"`
	Phone       string     `json:"phone"`
	Email       string     `json:"email"`
	AvatarURL   string     `json:"avatar_url"`
	SchoolID    int64      `json:"school_id" binding:"required"`
	ClassID     int64      `json:"class_id"`
	StudentNo   string     `json:"student_no"`
	EnteredAt   *time.Time `json:"entered_at"`
}

type TeacherInput struct {
	Code        string     `json:"code"`
	Username    string     `json:"username"`
	DisplayName string     `json:"display_name" binding:"required"`
	Phone       string     `json:"phone"`
	Email       string     `json:"email"`
	AvatarURL   string     `json:"avatar_url"`
	SchoolID    int64      `json:"school_id" binding:"required"`
	TeacherNo   string     `json:"teacher_no"`
	HiredAt     *time.Time `json:"hired_at"`
}

type StudentListFilter struct {
	SchoolID int64
	Keyword  string
	Status   string
	Page     int
	PageSize int
}

type TeacherListFilter struct {
	SchoolID int64
	Keyword  string
	Status   string
	Page     int
	PageSize int
}
