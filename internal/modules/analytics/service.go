package analytics

import (
	"bytes"
	"context"
	"encoding/csv"
	"strconv"
	"strings"
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

func (service *Service) GetAdminOverview(ctx context.Context, scope Scope) (AdminOverviewResult, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return AdminOverviewResult{}, ErrForbidden
	}
	switch scope.UserType {
	case "sys_admin", "school_admin":
	default:
		return AdminOverviewResult{}, ErrForbidden
	}
	return service.repo.GetAdminOverview(ctx, readTenantID(scope))
}

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" || containsPermission(scope.Permissions, "system:manage") || containsPermission(scope.Permissions, "tenant:manage") {
		return 0
	}
	return scope.TenantID
}

func (service *Service) GetExamOverview(ctx context.Context, scope Scope, query ExamOverviewQuery) (ExamOverviewResult, error) {
	if !containsAnyPermission(scope.Permissions, "analytics:view", "exam:publish") {
		return ExamOverviewResult{}, ErrForbidden
	}
	if query.ExamID <= 0 {
		return ExamOverviewResult{}, ErrInvalidInput
	}
	switch scope.UserType {
	case "teacher", "sys_admin", "school_admin":
	default:
		return ExamOverviewResult{}, ErrForbidden
	}

	query.TenantID = scope.TenantID
	var err error
	query, err = normalizeExamOverviewQuery(query)
	if err != nil {
		return ExamOverviewResult{}, err
	}
	query.Page = normalizePage(query.Page)
	query.PageSize = normalizePageSize(query.PageSize)

	exists, err := service.repo.ExamExists(ctx, query.TenantID, query.ExamID)
	if err != nil {
		return ExamOverviewResult{}, err
	}
	if !exists {
		return ExamOverviewResult{}, ErrNotFound
	}

	summary, err := service.repo.GetExamOverviewSummary(ctx, query)
	if err != nil {
		return ExamOverviewResult{}, err
	}
	students, err := service.repo.ListExamOverviewStudents(ctx, query)
	if err != nil {
		return ExamOverviewResult{}, err
	}
	return ExamOverviewResult{
		Summary:  summary,
		Students: students,
	}, nil
}

func (service *Service) ExportExamOverviewCSV(ctx context.Context, scope Scope, query ExamOverviewQuery) ([]byte, error) {
	if !containsAnyPermission(scope.Permissions, "analytics:view", "exam:publish") {
		return nil, ErrForbidden
	}
	if query.ExamID <= 0 {
		return nil, ErrInvalidInput
	}
	switch scope.UserType {
	case "teacher", "sys_admin", "school_admin":
	default:
		return nil, ErrForbidden
	}

	query.TenantID = scope.TenantID
	var err error
	query, err = normalizeExamOverviewQuery(query)
	if err != nil {
		return nil, err
	}

	exists, err := service.repo.ExamExists(ctx, query.TenantID, query.ExamID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrNotFound
	}

	rows, err := service.repo.ListExamOverviewExportStudents(ctx, query)
	if err != nil {
		return nil, err
	}
	return encodeExamOverviewCSV(rows)
}

func (service *Service) GetExamAttemptReview(ctx context.Context, scope Scope, query ExamAttemptReviewQuery) (ExamAttemptReviewResult, error) {
	if !containsAnyPermission(scope.Permissions, "analytics:view", "exam:publish") {
		return ExamAttemptReviewResult{}, ErrForbidden
	}
	if query.AttemptID <= 0 {
		return ExamAttemptReviewResult{}, ErrInvalidInput
	}
	switch scope.UserType {
	case "teacher", "sys_admin", "school_admin":
	default:
		return ExamAttemptReviewResult{}, ErrForbidden
	}

	query.TenantID = scope.TenantID
	return service.repo.GetExamAttemptReview(ctx, query)
}

func (service *Service) UpsertExamAttemptQuestionReview(ctx context.Context, scope Scope, command UpsertExamAttemptQuestionReviewCommand) (ExamAttemptQuestionReviewResult, error) {
	if !containsAnyPermission(scope.Permissions, "analytics:view", "exam:publish") {
		return ExamAttemptQuestionReviewResult{}, ErrForbidden
	}
	if command.AttemptID <= 0 || command.DisplayOrder <= 0 || command.Score < 0 {
		return ExamAttemptQuestionReviewResult{}, ErrInvalidInput
	}
	switch scope.UserType {
	case "teacher", "sys_admin", "school_admin":
	default:
		return ExamAttemptQuestionReviewResult{}, ErrForbidden
	}

	command.TenantID = scope.TenantID
	command.ReviewerUserID = scope.UserID
	command.ReviewComment = strings.TrimSpace(command.ReviewComment)

	review, err := service.repo.GetExamAttemptReview(ctx, ExamAttemptReviewQuery{
		TenantID:  command.TenantID,
		AttemptID: command.AttemptID,
	})
	if err != nil {
		return ExamAttemptQuestionReviewResult{}, err
	}
	if review.Summary.AttemptStatus != "submitted" && review.Summary.AttemptStatus != "timeout_submitted" {
		return ExamAttemptQuestionReviewResult{}, ErrForbidden
	}

	var matched *ExamAttemptReviewQuestionItem
	for index := range review.Questions {
		if review.Questions[index].DisplayOrder == command.DisplayOrder {
			matched = &review.Questions[index]
			break
		}
	}
	if matched == nil {
		return ExamAttemptQuestionReviewResult{}, ErrNotFound
	}
	if !isExamSubjectiveQuestionType(matched.QuestionType) || command.Score > matched.Score {
		return ExamAttemptQuestionReviewResult{}, ErrInvalidInput
	}

	return service.repo.UpsertExamAttemptQuestionReview(ctx, command)
}

func normalizeExamOverviewQuery(query ExamOverviewQuery) (ExamOverviewQuery, error) {
	query.AttemptStatus = strings.ToLower(strings.TrimSpace(query.AttemptStatus))
	switch query.AttemptStatus {
	case "", ExamAttemptStatusNotStarted, "in_progress", "submitted":
	default:
		return ExamOverviewQuery{}, ErrInvalidInput
	}
	query.ReviewStatus = strings.ToLower(strings.TrimSpace(query.ReviewStatus))
	switch query.ReviewStatus {
	case "", "pending", "reviewed":
	default:
		return ExamOverviewQuery{}, ErrInvalidInput
	}
	query.Keyword = strings.TrimSpace(query.Keyword)
	return query, nil
}

func encodeExamOverviewCSV(rows []ExamOverviewStudentItem) ([]byte, error) {
	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	header := []string{"学生姓名", "学号", "班级", "作答状态", "批阅状态", "客观题得分", "主观题得分", "总分", "开始时间", "交卷时间"}
	if err := writer.Write(header); err != nil {
		return nil, err
	}
	for _, item := range rows {
		record := []string{
			item.StudentName,
			stringValue(item.StudentNo),
			stringValue(item.ClassName),
			formatExamOverviewAttemptStatus(item.AttemptStatus),
			formatExamOverviewReviewStatus(item.ReviewStatus),
			floatValue(item.ObjectiveScore),
			floatValue(item.SubjectiveScore),
			floatValue(item.FinalScore),
			timeValue(item.StartedAt),
			timeValue(item.SubmitAt),
		}
		if err := writer.Write(record); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func floatValue(value *float64) string {
	if value == nil {
		return ""
	}
	return strconv.FormatFloat(*value, 'f', -1, 64)
}

func timeValue(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format(time.RFC3339)
}

func formatExamOverviewAttemptStatus(status string) string {
	switch status {
	case "submitted", "timeout_submitted":
		return "已交卷"
	case "in_progress":
		return "作答中"
	case ExamAttemptStatusNotStarted:
		return "未开始"
	default:
		return status
	}
}

func formatExamOverviewReviewStatus(status string) string {
	switch status {
	case "pending":
		return "待批阅"
	case "reviewed":
		return "已批阅"
	case "not_started":
		return "未开始"
	case "not_ready":
		return "待交卷"
	default:
		return status
	}
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

func (service *Service) GetStudentPracticeSessionQuestionDetail(ctx context.Context, scope Scope, query StudentPracticeSessionQuestionDetailQuery) (StudentPracticeSessionQuestionDetailResult, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return StudentPracticeSessionQuestionDetailResult{}, ErrForbidden
	}
	if query.ClassID <= 0 || query.CourseID <= 0 || query.StudentUserID <= 0 || query.SessionID <= 0 || query.SessionQuestionID <= 0 {
		return StudentPracticeSessionQuestionDetailResult{}, ErrInvalidInput
	}

	query.TenantID = scope.TenantID

	switch scope.UserType {
	case "sys_admin", "school_admin":
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeSessionQuestionDetailResult{}, err
		}
		if !exists {
			return StudentPracticeSessionQuestionDetailResult{}, ErrNotFound
		}
	case "teacher":
		allowed, err := service.repo.TeacherCanViewClassCourse(ctx, query.TenantID, scope.UserID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeSessionQuestionDetailResult{}, err
		}
		if !allowed {
			return StudentPracticeSessionQuestionDetailResult{}, ErrForbidden
		}
		exists, err := service.repo.ClassCourseExists(ctx, query.TenantID, query.ClassID, query.CourseID)
		if err != nil {
			return StudentPracticeSessionQuestionDetailResult{}, err
		}
		if !exists {
			return StudentPracticeSessionQuestionDetailResult{}, ErrNotFound
		}
	default:
		return StudentPracticeSessionQuestionDetailResult{}, ErrForbidden
	}

	belongs, err := service.repo.StudentBelongsToClass(ctx, query.TenantID, query.ClassID, query.StudentUserID)
	if err != nil {
		return StudentPracticeSessionQuestionDetailResult{}, err
	}
	if !belongs {
		return StudentPracticeSessionQuestionDetailResult{}, ErrNotFound
	}

	query.ReviewerUserID = scope.UserID
	result, err := service.repo.GetStudentPracticeSessionQuestionDetail(ctx, query)
	if err != nil {
		return StudentPracticeSessionQuestionDetailResult{}, err
	}
	review, err := service.repo.GetStudentPracticeSessionQuestionReview(ctx, query)
	if err != nil {
		return StudentPracticeSessionQuestionDetailResult{}, err
	}
	result.TeacherReview = review
	return result, nil
}

func (service *Service) UpsertStudentPracticeSessionQuestionReview(ctx context.Context, scope Scope, command UpsertStudentPracticeSessionQuestionReviewCommand) (StudentPracticeSessionQuestionReview, error) {
	if !containsPermission(scope.Permissions, "analytics:view") {
		return StudentPracticeSessionQuestionReview{}, ErrForbidden
	}
	if command.ClassID <= 0 || command.CourseID <= 0 || command.StudentUserID <= 0 || command.SessionID <= 0 || command.SessionQuestionID <= 0 {
		return StudentPracticeSessionQuestionReview{}, ErrInvalidInput
	}

	trimmedComment := strings.TrimSpace(command.ReviewComment)
	if trimmedComment == "" {
		return StudentPracticeSessionQuestionReview{}, ErrInvalidInput
	}

	command.TenantID = scope.TenantID
	command.ReviewerUserID = scope.UserID
	command.ReviewComment = trimmedComment

	query := StudentPracticeSessionQuestionDetailQuery{
		TenantID:          command.TenantID,
		ClassID:           command.ClassID,
		CourseID:          command.CourseID,
		StudentUserID:     command.StudentUserID,
		SessionID:         command.SessionID,
		SessionQuestionID: command.SessionQuestionID,
		ReviewerUserID:    command.ReviewerUserID,
	}
	if _, err := service.GetStudentPracticeSessionQuestionDetail(ctx, scope, query); err != nil {
		return StudentPracticeSessionQuestionReview{}, err
	}

	review, err := service.repo.UpsertStudentPracticeSessionQuestionReview(ctx, command)
	if err != nil {
		return StudentPracticeSessionQuestionReview{}, err
	}
	return review, nil
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

func isExamSubjectiveQuestionType(questionType string) bool {
	switch strings.ToLower(strings.TrimSpace(questionType)) {
	case "short_answer", "essay":
		return true
	default:
		return false
	}
}
