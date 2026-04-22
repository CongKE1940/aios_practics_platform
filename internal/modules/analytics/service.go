package analytics

import (
	"context"
	"time"
)

const maxRangeDays = 366

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (service *Service) GetClassPracticeSummary(ctx context.Context, scope Scope, query ClassPracticeSummaryQuery) (ClassPracticeSummaryResult, error) {
	if query.ClassID <= 0 || query.CourseID <= 0 {
		return ClassPracticeSummaryResult{}, ErrInvalidInput
	}

	query.TenantID = scope.TenantID
	query.Page = normalizePage(query.Page)
	query.PageSize = normalizePageSize(query.PageSize)

	now := service.now
	if now == nil {
		now = time.Now
	}
	startAt, endAt, err := normalizeTimeRange(now(), query.StartAt, query.EndAt)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	query.StartAt = &startAt
	query.EndAt = &endAt

	exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	if !exists {
		return ClassPracticeSummaryResult{}, ErrNotFound
	}

	switch scope.UserType {
	case "sys_admin", "school_admin":
		// 学校/系统管理员可直接查看当前租户范围的数据。
	case "teacher":
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, query.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return ClassPracticeSummaryResult{}, err
		}
		if !allowed {
			return ClassPracticeSummaryResult{}, ErrForbidden
		}
	default:
		return ClassPracticeSummaryResult{}, ErrForbidden
	}

	summary, err := service.repo.GetClassPracticeSummary(ctx, query)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}
	students, err := service.repo.ListClassPracticeStudents(ctx, query)
	if err != nil {
		return ClassPracticeSummaryResult{}, err
	}

	return ClassPracticeSummaryResult{
		Summary:  summary,
		Students: students,
	}, nil
}

func normalizeTimeRange(now time.Time, startAt *time.Time, endAt *time.Time) (time.Time, time.Time, error) {
	end := now
	if endAt != nil {
		end = *endAt
	}
	start := end.AddDate(0, 0, -30)
	if startAt != nil {
		start = *startAt
	}
	if start.After(end) {
		return time.Time{}, time.Time{}, ErrInvalidInput
	}
	if end.Sub(start) > maxRangeDays*24*time.Hour {
		return time.Time{}, time.Time{}, ErrInvalidInput
	}
	return start, end, nil
}
