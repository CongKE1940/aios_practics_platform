package org

import "time"

const (
	OrgPeriodTargetGrade = "grade"
	OrgPeriodTargetClass = "class"
)

type OrgPeriod struct {
	ID             int64      `json:"id"`
	TenantID       int64      `json:"tenant_id"`
	SchoolID       int64      `json:"school_id"`
	SchoolName     string     `json:"school_name,omitempty"`
	TargetType     string     `json:"target_type"`
	TargetID       int64      `json:"target_id"`
	GradeID        int64      `json:"grade_id"`
	GradeCode      string     `json:"grade_code,omitempty"`
	GradeName      string     `json:"grade_name,omitempty"`
	ClassID        *int64     `json:"class_id,omitempty"`
	ClassCode      string     `json:"class_code,omitempty"`
	ClassName      string     `json:"class_name,omitempty"`
	ParentPeriodID *int64     `json:"parent_period_id,omitempty"`
	Code           string     `json:"code"`
	Name           string     `json:"name"`
	StartAt        time.Time  `json:"start_at"`
	EndAt          time.Time  `json:"end_at"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at,omitempty"`
	UpdatedAt      time.Time  `json:"updated_at,omitempty"`
}

type OrgPeriodInput struct {
	TargetType     string    `json:"target_type" binding:"required"`
	TargetID       int64     `json:"target_id" binding:"required"`
	ParentPeriodID int64     `json:"parent_period_id,omitempty"`
	Code           string    `json:"code" binding:"required"`
	Name           string    `json:"name" binding:"required"`
	StartAt        time.Time `json:"start_at" binding:"required"`
	EndAt          time.Time `json:"end_at" binding:"required"`
}

type OrgPeriodListFilter struct {
	SchoolID       int64
	TargetType     string
	TargetID       int64
	GradeID        int64
	ClassID        int64
	ParentPeriodID int64
	Status         string
	ActiveAt       *time.Time
	Page           int
	PageSize       int
}

type GradePeriodClass struct {
	ClassID   int64     `json:"class_id"`
	ClassCode string    `json:"class_code"`
	ClassName string    `json:"class_name"`
	ClassNo   *int      `json:"class_no,omitempty"`
	PeriodID  int64     `json:"period_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	StartAt   time.Time `json:"start_at"`
	EndAt     time.Time `json:"end_at"`
	Status    string    `json:"status"`
}

type StudentMembershipHistory struct {
	MembershipID  int64      `json:"membership_id"`
	StudentID     int64      `json:"student_id"`
	Username      string     `json:"username,omitempty"`
	DisplayName   string     `json:"display_name,omitempty"`
	StudentNo     string     `json:"student_no,omitempty"`
	SchoolID      int64      `json:"school_id"`
	SchoolName    string     `json:"school_name,omitempty"`
	GradeID       int64      `json:"grade_id"`
	GradeCode     string     `json:"grade_code,omitempty"`
	GradeName     string     `json:"grade_name,omitempty"`
	ClassID       int64      `json:"class_id"`
	ClassCode     string     `json:"class_code,omitempty"`
	ClassName     string     `json:"class_name,omitempty"`
	JoinedAt      time.Time  `json:"joined_at"`
	LeftAt        *time.Time `json:"left_at,omitempty"`
	EffectiveFrom time.Time  `json:"effective_from"`
	EffectiveTo   time.Time  `json:"effective_to"`
	IsCurrent     bool       `json:"is_current"`
	Status        string     `json:"status"`
}
