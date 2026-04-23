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
	if !containsPermission(scope.Permissions, "analytics:view") {
		return ClassPracticeSummaryResult{}, ErrForbidden
	}
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

	switch scope.UserType {
	case "sys_admin", "school_admin":
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return ClassPracticeSummaryResult{}, err
		}
		if !exists {
			return ClassPracticeSummaryResult{}, ErrNotFound
		}
	case "teacher":
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, query.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return ClassPracticeSummaryResult{}, err
		}
		if !allowed {
			return ClassPracticeSummaryResult{}, ErrForbidden
		}
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return ClassPracticeSummaryResult{}, err
		}
		if !exists {
			return ClassPracticeSummaryResult{}, ErrNotFound
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

func (service *Service) ListClassCourseOptions(ctx context.Context, scope Scope) ([]ClassCourseOption, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return nil, ErrForbidden
	}

	switch scope.UserType {
	case "teacher", "sys_admin", "school_admin":
		return service.repo.ListClassCourseOptions(ctx, scope)
	default:
		return nil, ErrForbidden
	}
}

func (service *Service) GetStudentPracticeDetail(ctx context.Context, scope Scope, query StudentPracticeDetailQuery) (StudentPracticeDetailResult, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return StudentPracticeDetailResult{}, ErrForbidden
	}
	if query.ClassID <= 0 || query.CourseID <= 0 || query.StudentUserID <= 0 {
		return StudentPracticeDetailResult{}, ErrInvalidInput
	}

	query.TenantID = scope.TenantID
	if query.Tab == "" {
		query.Tab = StudentDetailTabSessions
	}
	switch query.Tab {
	case StudentDetailTabSessions, StudentDetailTabWrong, StudentDetailTabConfused:
	default:
		return StudentPracticeDetailResult{}, ErrInvalidInput
	}
	query.Page = normalizePage(query.Page)
	query.PageSize = normalizePageSize(query.PageSize)

	now := service.now
	if now == nil {
		now = time.Now
	}
	startAt, endAt, err := normalizeTimeRange(now(), query.StartAt, query.EndAt)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}
	query.StartAt = &startAt
	query.EndAt = &endAt

	switch scope.UserType {
	case "sys_admin", "school_admin":
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeDetailResult{}, err
		}
		if !exists {
			return StudentPracticeDetailResult{}, ErrNotFound
		}
	case "teacher":
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, query.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeDetailResult{}, err
		}
		if !allowed {
			return StudentPracticeDetailResult{}, ErrForbidden
		}
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeDetailResult{}, err
		}
		if !exists {
			return StudentPracticeDetailResult{}, ErrNotFound
		}
	default:
		return StudentPracticeDetailResult{}, ErrForbidden
	}

	belongs, err := service.repo.StudentBelongsToClass(ctx, query.TenantID, query.ClassID, query.StudentUserID)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}
	if !belongs {
		return StudentPracticeDetailResult{}, ErrNotFound
	}

	summary, err := service.repo.GetStudentPracticeSummary(ctx, query)
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}

	result := StudentPracticeDetailResult{
		StudentSummary:    summary,
		ActiveTab:         query.Tab,
		Sessions:          emptyPageResult[StudentPracticeSessionItem](query.Page, query.PageSize),
		WrongQuestions:    emptyPageResult[StudentPracticeQuestionItem](query.Page, query.PageSize),
		ConfusedQuestions: emptyPageResult[StudentPracticeQuestionItem](query.Page, query.PageSize),
	}

	switch query.Tab {
	case StudentDetailTabSessions:
		result.Sessions, err = service.repo.ListStudentPracticeSessions(ctx, query)
	case StudentDetailTabWrong:
		result.WrongQuestions, err = service.repo.ListStudentWrongQuestions(ctx, query)
	case StudentDetailTabConfused:
		result.ConfusedQuestions, err = service.repo.ListStudentConfusedQuestions(ctx, query)
	}
	if err != nil {
		return StudentPracticeDetailResult{}, err
	}

	return result, nil
}

func (service *Service) GetStudentPracticeSessionDetail(ctx context.Context, scope Scope, query StudentPracticeSessionDetailQuery) (StudentPracticeSessionDetailResult, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return StudentPracticeSessionDetailResult{}, ErrForbidden
	}
	if query.ClassID <= 0 || query.CourseID <= 0 || query.StudentUserID <= 0 || query.SessionID <= 0 {
		return StudentPracticeSessionDetailResult{}, ErrInvalidInput
	}

	query.TenantID = scope.TenantID

	switch scope.UserType {
	case "sys_admin", "school_admin":
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeSessionDetailResult{}, err
		}
		if !exists {
			return StudentPracticeSessionDetailResult{}, ErrNotFound
		}
	case "teacher":
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, query.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeSessionDetailResult{}, err
		}
		if !allowed {
			return StudentPracticeSessionDetailResult{}, ErrForbidden
		}
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeSessionDetailResult{}, err
		}
		if !exists {
			return StudentPracticeSessionDetailResult{}, ErrNotFound
		}
	default:
		return StudentPracticeSessionDetailResult{}, ErrForbidden
	}

	belongs, err := service.repo.StudentBelongsToClass(ctx, query.TenantID, query.ClassID, query.StudentUserID)
	if err != nil {
		return StudentPracticeSessionDetailResult{}, err
	}
	if !belongs {
		return StudentPracticeSessionDetailResult{}, ErrNotFound
	}

	result, err := service.repo.GetStudentPracticeSessionDetail(ctx, query)
	if err != nil {
		return StudentPracticeSessionDetailResult{}, err
	}
	return result, nil
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
