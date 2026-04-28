package org

import (
	"context"
	"errors"
	"time"
)

const (
	StatusActive             = "active"
	StatusDisabled           = "disabled"
	ObjectTypeSchool         = "school"
	ObjectTypeOrganization   = "organization"
	CodeInvalidInput         = 40000
	CodeForbidden            = 40300
	CodeNotFound             = 40400
)

var (
	ErrInvalidInput = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
	ErrNotFound     = errors.New("resource not found")
)

type Scope struct {
	TenantID    int64
	UserType    string
	Permissions []string
}

type PageResult[T any] struct {
	Items    []T `json:"items"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type School struct {
	ID          int64     `json:"id"`
	TenantID    int64     `json:"tenant_id"`
	ObjectType  string    `json:"object_type"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	EnglishName string    `json:"english_name,omitempty"`
	Address     string    `json:"address,omitempty"`
	LogoURL     string    `json:"logo_url,omitempty"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}

type Grade struct {
	ID         int64     `json:"id"`
	TenantID   int64     `json:"tenant_id"`
	SchoolID   int64     `json:"school_id"`
	Code       string    `json:"code"`
	Name       string    `json:"name"`
	GradeLevel int       `json:"grade_level"`
	SchoolYear string    `json:"school_year,omitempty"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at,omitempty"`
	UpdatedAt  time.Time `json:"updated_at,omitempty"`
}

type Class struct {
	ID        int64     `json:"id"`
	TenantID  int64     `json:"tenant_id"`
	SchoolID  int64     `json:"school_id"`
	GradeID   int64     `json:"grade_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	ClassNo   *int      `json:"class_no"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

type Course struct {
	ID          int64      `json:"id"`
	TenantID    int64      `json:"tenant_id"`
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	StartAt     *time.Time `json:"start_at"`
	EndAt       *time.Time `json:"end_at"`
	Status      string     `json:"status"`
	Description string     `json:"description,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
	UpdatedAt   time.Time  `json:"updated_at,omitempty"`
}

type SchoolInput struct {
	ObjectType  string `json:"object_type"`
	Code        string `json:"code"`
	Name        string `json:"name" binding:"required"`
	EnglishName string `json:"english_name"`
	Address     string `json:"address"`
	LogoURL     string `json:"logo_url"`
}

type GradeInput struct {
	SchoolID   int64  `json:"school_id" binding:"required"`
	Code       string `json:"code" binding:"required"`
	Name       string `json:"name" binding:"required"`
	GradeLevel int    `json:"grade_level" binding:"required"`
	SchoolYear string `json:"school_year"`
}

type ClassInput struct {
	SchoolID int64  `json:"school_id" binding:"required"`
	GradeID  int64  `json:"grade_id" binding:"required"`
	Code     string `json:"code" binding:"required"`
	Name     string `json:"name" binding:"required"`
	ClassNo  *int   `json:"class_no"`
}

type CourseInput struct {
	Code        string     `json:"code" binding:"required"`
	Name        string     `json:"name" binding:"required"`
	StartAt     *time.Time `json:"start_at"`
	EndAt       *time.Time `json:"end_at"`
	Description string     `json:"description"`
}

type SchoolListFilter struct {
	ObjectType string
	Status     string
	Keyword    string
	Page       int
	PageSize   int
}

type GradeListFilter struct {
	SchoolID int64
	Status   string
	Page     int
	PageSize int
}

type ClassListFilter struct {
	SchoolID int64
	GradeID  int64
	Status   string
	Page     int
	PageSize int
}

type CourseListFilter struct {
	Status   string
	Keyword  string
	ActiveAt *time.Time
	Page     int
	PageSize int
}

type Repository interface {
	ListSchools(ctx context.Context, tenantID int64, filter SchoolListFilter) (PageResult[School], error)
	GetSchool(ctx context.Context, tenantID int64, id int64) (School, error)
	CreateSchool(ctx context.Context, school School) (School, error)
	UpdateSchool(ctx context.Context, school School) (School, error)
	DisableSchool(ctx context.Context, tenantID int64, id int64) error
	EnableSchool(ctx context.Context, tenantID int64, id int64) error
	DeleteSchool(ctx context.Context, tenantID int64, id int64) error
	ListGrades(ctx context.Context, tenantID int64, filter GradeListFilter) (PageResult[Grade], error)
	GetGrade(ctx context.Context, tenantID int64, id int64) (Grade, error)
	CreateGrade(ctx context.Context, grade Grade) (Grade, error)
	UpdateGrade(ctx context.Context, grade Grade) (Grade, error)
	DisableGrade(ctx context.Context, tenantID int64, id int64) error
	ListClasses(ctx context.Context, tenantID int64, filter ClassListFilter) (PageResult[Class], error)
	GetClass(ctx context.Context, tenantID int64, id int64) (Class, error)
	CreateClass(ctx context.Context, classItem Class) (Class, error)
	UpdateClass(ctx context.Context, classItem Class) (Class, error)
	DisableClass(ctx context.Context, tenantID int64, id int64) error
	ListCourses(ctx context.Context, tenantID int64, filter CourseListFilter) (PageResult[Course], error)
	GetCourse(ctx context.Context, tenantID int64, id int64) (Course, error)
	CreateCourse(ctx context.Context, course Course) (Course, error)
	UpdateCourse(ctx context.Context, course Course) (Course, error)
	DisableCourse(ctx context.Context, tenantID int64, id int64) error
}
