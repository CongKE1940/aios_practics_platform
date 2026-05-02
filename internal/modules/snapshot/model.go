package snapshot

import (
	"context"
	"errors"
	"time"
)

const (
	CodeInvalidInput = 40000
	CodeForbidden    = 40300
	CodeNotFound     = 40400

	AuditResultSuccess = "success"

	TransitionTypeClassChange = "class_change"
	TransitionTypePromote     = "promote"
	TransitionTypeTransferIn  = "transfer_in"
	TransitionTypeTransferOut = "transfer_out"
	TransitionTypeGraduate    = "graduate"
	TransitionTypeLeaveSchool = "leave_school"
	TransitionTypeReEnroll    = "re_enroll"

	TeacherAssignmentChangeAssign   = "assign"
	TeacherAssignmentChangeUnassign = "unassign"

	TeacherAssignmentTypeCourseTeacher = "course_teacher"
	TeacherAssignmentTypeHeadTeacher   = "head_teacher"

	StudentEnrollmentActive         = "active"
	StudentEnrollmentGraduated      = "graduated"
	StudentEnrollmentLeftSchool     = "left_school"
	StudentEnrollmentTransferredOut = "transferred_out"
)

var (
	ErrInvalidInput          = errors.New("invalid input")
	ErrForbidden             = errors.New("forbidden")
	ErrNotFound              = errors.New("resource not found")
	ErrRepositoryUnavailable = errors.New("repository unavailable")
)

type Scope struct {
	TenantID    int64
	UserID      int64
	UserType    string
	Permissions []string
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type AuditLog struct {
	ID             int64          `json:"id"`
	TenantID       int64          `json:"tenant_id"`
	OperatorUserID *int64         `json:"operator_user_id,omitempty"`
	ModuleName     string         `json:"module_name"`
	ActionName     string         `json:"action_name"`
	ResourceType   string         `json:"resource_type"`
	ResourceID     *int64         `json:"resource_id,omitempty"`
	BeforeJSON     map[string]any `json:"before_json,omitempty"`
	AfterJSON      map[string]any `json:"after_json,omitempty"`
	RequestID      string         `json:"request_id,omitempty"`
	IP             string         `json:"ip,omitempty"`
	UserAgent      string         `json:"user_agent,omitempty"`
	Result         string         `json:"result"`
	CreatedAt      time.Time      `json:"created_at"`
}

type EntitySnapshot struct {
	ID               int64          `json:"id"`
	TenantID         int64          `json:"tenant_id"`
	EntityType       string         `json:"entity_type"`
	EntityID         int64          `json:"entity_id"`
	SnapshotType     string         `json:"snapshot_type"`
	SnapshotJSON     map[string]any `json:"snapshot_json"`
	VersionNo        int            `json:"version_no"`
	TriggerEventType string         `json:"trigger_event_type,omitempty"`
	OperatorUserID   *int64         `json:"operator_user_id,omitempty"`
	OperatorName     string         `json:"operator_name,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
}

type EntitySnapshotCompareResult struct {
	EntityType string         `json:"entity_type"`
	EntityID   int64          `json:"entity_id"`
	Left       EntitySnapshot `json:"left"`
	Right      EntitySnapshot `json:"right"`
}

type StudentTransition struct {
	ID             int64     `json:"id"`
	TenantID       int64     `json:"tenant_id"`
	StudentID      int64     `json:"student_id"`
	TransitionType string    `json:"transition_type"`
	FromSchoolID   *int64    `json:"from_school_id,omitempty"`
	FromGradeID    *int64    `json:"from_grade_id,omitempty"`
	FromClassID    *int64    `json:"from_class_id,omitempty"`
	ToSchoolID     *int64    `json:"to_school_id,omitempty"`
	ToGradeID      *int64    `json:"to_grade_id,omitempty"`
	ToClassID      *int64    `json:"to_class_id,omitempty"`
	OccurredAt     time.Time `json:"occurred_at"`
	OperatorID     int64     `json:"operator_id"`
	Remark         string    `json:"remark,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type TeacherAssignmentHistory struct {
	ID             int64      `json:"id"`
	TenantID       int64      `json:"tenant_id"`
	TeacherID      int64      `json:"teacher_id"`
	ClassID        int64      `json:"class_id"`
	CourseID       *int64     `json:"course_id,omitempty"`
	AssignmentType string     `json:"assignment_type"`
	ChangeType     string     `json:"change_type"`
	EffectiveFrom  time.Time  `json:"effective_from"`
	EffectiveTo    *time.Time `json:"effective_to,omitempty"`
	OperatorID     int64      `json:"operator_id"`
	CreatedAt      time.Time  `json:"created_at"`
}

type AuditLogListFilter struct {
	ModuleName   string
	ResourceType string
	Page         int
	PageSize     int
}

type EntitySnapshotListFilter struct {
	EntityType string
	EntityID   int64
	Page       int
	PageSize   int
}

type EntityTimelineFilter struct {
	EntityType string
	EntityID   int64
	Page       int
	PageSize   int
}

type EntitySnapshotCompareFilter struct {
	EntityType     string
	EntityID       int64
	LeftVersionNo  int
	RightVersionNo int
}

type StudentTransitionListFilter struct {
	StudentID      int64
	TransitionType string
	Page           int
	PageSize       int
}

type TeacherAssignmentHistoryListFilter struct {
	TeacherID      int64
	ClassID        int64
	CourseID       int64
	AssignmentType string
	Page           int
	PageSize       int
}

type StudentTransitionInput struct {
	StudentID      int64     `json:"student_id"`
	TransitionType string    `json:"transition_type"`
	ToClassID      int64     `json:"to_class_id"`
	OccurredAt     time.Time `json:"occurred_at"`
	Remark         string    `json:"remark"`
}

type TeacherAssignmentChangeInput struct {
	TeacherID      int64     `json:"teacher_id"`
	ClassID        int64     `json:"class_id"`
	CourseID       int64     `json:"course_id,omitempty"`
	AssignmentType string    `json:"assignment_type"`
	ChangeType     string    `json:"change_type"`
	EffectiveAt    time.Time `json:"effective_at"`
}

type Repository interface {
	ListAuditLogs(ctx context.Context, tenantID int64, filter AuditLogListFilter) (PageResult[AuditLog], error)
	ListEntitySnapshots(ctx context.Context, tenantID int64, filter EntitySnapshotListFilter) (PageResult[EntitySnapshot], error)
	ListEntityTimeline(ctx context.Context, tenantID int64, filter EntityTimelineFilter) (PageResult[EntitySnapshot], error)
	CompareEntitySnapshots(ctx context.Context, tenantID int64, filter EntitySnapshotCompareFilter) (EntitySnapshotCompareResult, error)
	ListStudentTransitions(ctx context.Context, tenantID int64, filter StudentTransitionListFilter) (PageResult[StudentTransition], error)
	ApplyStudentTransition(ctx context.Context, tenantID int64, operatorUserID int64, input StudentTransitionInput) (StudentTransition, error)
	ListTeacherAssignmentHistories(ctx context.Context, tenantID int64, filter TeacherAssignmentHistoryListFilter) (PageResult[TeacherAssignmentHistory], error)
	ApplyTeacherAssignmentChange(
		ctx context.Context,
		tenantID int64,
		operatorUserID int64,
		input TeacherAssignmentChangeInput,
	) (TeacherAssignmentHistory, error)
}

func normalizePage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizePageSize(pageSize int) int {
	if pageSize <= 0 {
		return 20
	}
	if pageSize > 100 {
		return 100
	}
	return pageSize
}

func containsPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}
