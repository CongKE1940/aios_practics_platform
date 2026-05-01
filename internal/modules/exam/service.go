package exam

import (
	"context"
	"reflect"
	"sort"
	"strings"
)

type Service struct {
	repo Repository
}

type teacherExamScopeRepository interface {
	TeacherCanManageClass(ctx context.Context, tenantID int64, teacherID int64, classID int64) (bool, error)
	TeacherCanTeachClassCourse(ctx context.Context, tenantID int64, teacherID int64, classID int64, courseID int64) (bool, error)
	TeacherCanTeachCourse(ctx context.Context, tenantID int64, teacherID int64, courseID int64) (bool, error)
	TeacherCanManageStudent(ctx context.Context, tenantID int64, teacherID int64, studentID int64) (bool, error)
	TeacherCanTeachStudentCourse(ctx context.Context, tenantID int64, teacherID int64, studentID int64, courseID int64) (bool, error)
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListExams(ctx context.Context, scope Scope, filter ExamListFilter) (PageResult[Exam], error) {
	if service == nil || service.repo == nil {
		return PageResult[Exam]{}, ErrRepositoryUnavailable
	}
	if scope.UserType != "student" && !canManageExam(scope) {
		return PageResult[Exam]{}, ErrForbidden
	}
	normalized, err := normalizeExamListFilter(filter)
	if err != nil {
		return PageResult[Exam]{}, err
	}
	return service.repo.ListExams(ctx, scopeForRead(scope), normalized)
}

func (service *Service) CreateExam(ctx context.Context, scope Scope, input ExamInput) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if scope.UserType != "student" && !canManageExam(scope) {
		return ExamDetail{}, ErrForbidden
	}
	if scope.UserType == "student" {
		if scope.UserID <= 0 || scope.TenantID <= 0 {
			return ExamDetail{}, ErrInvalidInput
		}
		input = normalizeStudentSelfTestInput(scope, input)
	}
	normalized, err := normalizeExamInput(input)
	if err != nil {
		return ExamDetail{}, err
	}
	if err := service.ensureTeacherCanUseExamScope(ctx, scope, normalized); err != nil {
		return ExamDetail{}, err
	}
	return service.repo.CreateExam(ctx, scope, normalized)
}

func (service *Service) ListExamPapers(ctx context.Context, scope Scope, filter ExamPaperListFilter) (PageResult[ExamPaper], error) {
	if service == nil || service.repo == nil {
		return PageResult[ExamPaper]{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return PageResult[ExamPaper]{}, ErrForbidden
	}
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListExamPapers(ctx, scopeForRead(scope), filter)
}

func (service *Service) CreateExamPaper(ctx context.Context, scope Scope, input ExamPaperInput) (ExamPaperDetail, error) {
	if service == nil || service.repo == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return ExamPaperDetail{}, ErrForbidden
	}
	normalized, err := normalizeExamPaperInput(input)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	return service.repo.CreateExamPaper(ctx, scope, normalized)
}

func (service *Service) GetExamPaper(ctx context.Context, scope Scope, id int64) (ExamPaperDetail, error) {
	if service == nil || service.repo == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return ExamPaperDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamPaperDetail{}, ErrInvalidInput
	}
	return service.repo.GetExamPaper(ctx, scopeForRead(scope), id)
}

func (service *Service) UpdateExamPaper(ctx context.Context, scope Scope, id int64, input ExamPaperInput) (ExamPaperDetail, error) {
	if service == nil || service.repo == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return ExamPaperDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamPaperDetail{}, ErrInvalidInput
	}
	normalized, err := normalizeExamPaperInput(input)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	targetScope, err := service.scopeForPaperMutation(ctx, scope, id)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	return service.repo.UpdateExamPaper(ctx, targetScope, id, normalized)
}

func (service *Service) PublishExamPaper(ctx context.Context, scope Scope, id int64) (ExamPaperDetail, error) {
	if service == nil || service.repo == nil {
		return ExamPaperDetail{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return ExamPaperDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamPaperDetail{}, ErrInvalidInput
	}
	targetScope, err := service.scopeForPaperMutation(ctx, scope, id)
	if err != nil {
		return ExamPaperDetail{}, err
	}
	return service.repo.PublishExamPaper(ctx, targetScope, id)
}

func (service *Service) GetExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return ExamDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	return service.repo.GetExam(ctx, scopeForRead(scope), id)
}

func (service *Service) UpdateExam(ctx context.Context, scope Scope, id int64, input ExamInput) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if !canManageExam(scope) {
		return ExamDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	normalized, err := normalizeExamInput(input)
	if err != nil {
		return ExamDetail{}, err
	}
	if err := service.ensureTeacherCanUseExamScope(ctx, scope, normalized); err != nil {
		return ExamDetail{}, err
	}
	targetScope, err := service.scopeForExamMutation(ctx, scope, id)
	if err != nil {
		return ExamDetail{}, err
	}
	return service.repo.UpdateExam(ctx, targetScope, id, normalized)
}

func (service *Service) PublishExam(ctx context.Context, scope Scope, id int64) (ExamDetail, error) {
	if service == nil || service.repo == nil {
		return ExamDetail{}, ErrRepositoryUnavailable
	}
	if scope.UserType != "student" && !canManageExam(scope) {
		return ExamDetail{}, ErrForbidden
	}
	if id <= 0 {
		return ExamDetail{}, ErrInvalidInput
	}
	if scope.UserType == "student" {
		current, err := service.repo.GetExam(ctx, scopeForRead(scope), id)
		if err != nil {
			return ExamDetail{}, err
		}
		if !isStudentSelfTestExam(scope, current) {
			return ExamDetail{}, ErrForbidden
		}
		return service.repo.PublishExam(ctx, scope, id)
	}
	targetScope, err := service.scopeForExamMutation(ctx, scope, id)
	if err != nil {
		return ExamDetail{}, err
	}
	return service.repo.PublishExam(ctx, targetScope, id)
}

func (service *Service) StartAttempt(ctx context.Context, scope Scope, examID int64) (ExamAttemptDetail, error) {
	if service == nil || service.repo == nil {
		return ExamAttemptDetail{}, ErrRepositoryUnavailable
	}
	if examID <= 0 || scope.UserID <= 0 || scope.TenantID <= 0 {
		return ExamAttemptDetail{}, ErrInvalidInput
	}
	return service.repo.StartAttempt(ctx, scope, examID)
}

func (service *Service) GetAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptDetail, error) {
	if service == nil || service.repo == nil {
		return ExamAttemptDetail{}, ErrRepositoryUnavailable
	}
	if attemptID <= 0 || scope.UserID <= 0 || scope.TenantID <= 0 {
		return ExamAttemptDetail{}, ErrInvalidInput
	}
	return service.repo.GetAttempt(ctx, scope, attemptID)
}

func (service *Service) SaveAttemptAnswer(ctx context.Context, scope Scope, attemptID int64, input SaveAttemptAnswerInput) (ExamAttemptAnswer, error) {
	if service == nil || service.repo == nil {
		return ExamAttemptAnswer{}, ErrRepositoryUnavailable
	}
	if attemptID <= 0 || scope.UserID <= 0 || scope.TenantID <= 0 || input.DisplayOrder <= 0 || len(input.Answer) == 0 {
		return ExamAttemptAnswer{}, ErrInvalidInput
	}
	return service.repo.SaveAttemptAnswer(ctx, scope, attemptID, input)
}

func (service *Service) SubmitAttempt(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	if service == nil || service.repo == nil {
		return ExamAttemptResult{}, ErrRepositoryUnavailable
	}
	if attemptID <= 0 || scope.UserID <= 0 || scope.TenantID <= 0 {
		return ExamAttemptResult{}, ErrInvalidInput
	}
	return service.repo.SubmitAttempt(ctx, scope, attemptID)
}

func (service *Service) GetAttemptResult(ctx context.Context, scope Scope, attemptID int64) (ExamAttemptResult, error) {
	if service == nil || service.repo == nil {
		return ExamAttemptResult{}, ErrRepositoryUnavailable
	}
	if attemptID <= 0 || scope.UserID <= 0 || scope.TenantID <= 0 {
		return ExamAttemptResult{}, ErrInvalidInput
	}
	return service.repo.GetAttemptResult(ctx, scope, attemptID)
}

func normalizeExamInput(input ExamInput) (ExamInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.ExamMode = strings.TrimSpace(strings.ToLower(input.ExamMode))
	if input.Name == "" || input.ExamMode == "" || input.StartTime.IsZero() || input.EndTime.IsZero() {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode != ExamModeFixed && input.ExamMode != ExamModePaper && input.ExamMode != ExamModeRandom {
		return ExamInput{}, ErrInvalidInput
	}
	if input.PaperID != nil && *input.PaperID <= 0 {
		return ExamInput{}, ErrInvalidInput
	}
	if !input.EndTime.After(input.StartTime) || input.DurationMinutes <= 0 {
		return ExamInput{}, ErrInvalidInput
	}

	input.Targets = append([]ExamTargetInput{}, input.Targets...)
	for index := range input.Targets {
		input.Targets[index].TargetType = strings.TrimSpace(strings.ToLower(input.Targets[index].TargetType))
		if input.Targets[index].TargetID <= 0 {
			return ExamInput{}, ErrInvalidInput
		}
		switch input.Targets[index].TargetType {
		case TargetTypeClass, TargetTypeCourse, TargetTypeUser:
		default:
			return ExamInput{}, ErrInvalidInput
		}
	}

	if input.ExamMode == ExamModePaper && input.PaperID == nil {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode != ExamModePaper && input.PaperID != nil {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode != ExamModeFixed && len(input.FixedQuestions) > 0 {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode != ExamModeRandom && len(input.PaperRules) > 0 {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode == ExamModePaper && (len(input.FixedQuestions) > 0 || len(input.PaperRules) > 0) {
		return ExamInput{}, ErrInvalidInput
	}
	if input.ExamMode == ExamModeRandom && len(input.PaperRules) == 0 {
		return ExamInput{}, ErrInvalidInput
	}
	input.FixedQuestions = append([]ExamFixedQuestionInput{}, input.FixedQuestions...)
	for index := range input.FixedQuestions {
		item := &input.FixedQuestions[index]
		if item.QuestionID <= 0 || item.QuestionVersionID <= 0 || item.DisplayOrder <= 0 || item.Score < 0 {
			return ExamInput{}, ErrInvalidInput
		}
	}
	input.PaperRules = append([]ExamPaperRule{}, input.PaperRules...)
	for index := range input.PaperRules {
		item := &input.PaperRules[index]
		item.QuestionType = strings.TrimSpace(strings.ToLower(item.QuestionType))
		if item.QuestionType == "" || item.ScorePerQuestion <= 0 || item.QuestionCount <= 0 {
			return ExamInput{}, ErrInvalidInput
		}
		if item.CourseID != nil && *item.CourseID <= 0 {
			return ExamInput{}, ErrInvalidInput
		}
		if hasNonPositiveID(item.KnowledgeTagIDs) || hasNonPositiveID(item.BankIDs) {
			return ExamInput{}, ErrInvalidInput
		}
		for _, count := range item.PerKnowledgeCount {
			if count <= 0 {
				return ExamInput{}, ErrInvalidInput
			}
		}
	}

	return input, nil
}

func normalizeExamListFilter(filter ExamListFilter) (ExamListFilter, error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	filter.Status = strings.TrimSpace(strings.ToLower(filter.Status))
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.TargetType = strings.TrimSpace(strings.ToLower(filter.TargetType))
	if filter.Status != "" && filter.Status != ExamStatusDraft && filter.Status != ExamStatusPublished {
		return ExamListFilter{}, ErrInvalidInput
	}
	if filter.TargetType != "" {
		switch filter.TargetType {
		case TargetTypeClass, TargetTypeCourse, TargetTypeUser:
		default:
			return ExamListFilter{}, ErrInvalidInput
		}
	}
	if filter.TargetID != nil && *filter.TargetID <= 0 {
		return ExamListFilter{}, ErrInvalidInput
	}
	return filter, nil
}

func normalizeStudentSelfTestInput(scope Scope, input ExamInput) ExamInput {
	input.PaperID = nil
	input.Targets = []ExamTargetInput{
		{
			TargetType: TargetTypeUser,
			TargetID:   scope.UserID,
		},
	}
	if input.ExamMode == ExamModePaper {
		input.ExamMode = ""
	}
	return input
}

func isStudentSelfTestExam(scope Scope, detail ExamDetail) bool {
	if detail.OwnerOrgType != OwnerOrgTypeUser || detail.OwnerOrgID != scope.UserID || detail.CreatorID != scope.UserID {
		return false
	}
	if detail.TenantID != scope.TenantID {
		return false
	}
	if len(detail.Targets) != 1 {
		return false
	}
	return detail.Targets[0].TargetType == TargetTypeUser && detail.Targets[0].TargetID == scope.UserID
}

func normalizeExamPaperInput(input ExamPaperInput) (ExamPaperInput, error) {
	input.PaperName = strings.TrimSpace(input.PaperName)
	input.PaperType = strings.TrimSpace(strings.ToLower(input.PaperType))
	if input.PaperName == "" {
		return ExamPaperInput{}, ErrInvalidInput
	}
	if input.PaperType != ExamPaperTypeFixed && input.PaperType != ExamPaperTypeRandomRule {
		return ExamPaperInput{}, ErrInvalidInput
	}
	if input.PaperType != ExamPaperTypeFixed && len(input.FixedQuestions) > 0 {
		return ExamPaperInput{}, ErrInvalidInput
	}
	if input.PaperType != ExamPaperTypeRandomRule && len(input.PaperRules) > 0 {
		return ExamPaperInput{}, ErrInvalidInput
	}
	if input.PaperType == ExamPaperTypeFixed && len(input.FixedQuestions) == 0 {
		return ExamPaperInput{}, ErrInvalidInput
	}
	if input.PaperType == ExamPaperTypeRandomRule && len(input.PaperRules) == 0 {
		return ExamPaperInput{}, ErrInvalidInput
	}
	input.FixedQuestions = append([]ExamFixedQuestionInput{}, input.FixedQuestions...)
	for index := range input.FixedQuestions {
		item := &input.FixedQuestions[index]
		if item.QuestionID <= 0 || item.QuestionVersionID <= 0 || item.DisplayOrder <= 0 || item.Score < 0 {
			return ExamPaperInput{}, ErrInvalidInput
		}
	}
	input.PaperRules = append([]ExamPaperRule{}, input.PaperRules...)
	for index := range input.PaperRules {
		item := &input.PaperRules[index]
		item.QuestionType = strings.TrimSpace(strings.ToLower(item.QuestionType))
		if item.QuestionType == "" || item.ScorePerQuestion <= 0 || item.QuestionCount <= 0 {
			return ExamPaperInput{}, ErrInvalidInput
		}
		if item.CourseID != nil && *item.CourseID <= 0 {
			return ExamPaperInput{}, ErrInvalidInput
		}
		if hasNonPositiveID(item.KnowledgeTagIDs) || hasNonPositiveID(item.BankIDs) {
			return ExamPaperInput{}, ErrInvalidInput
		}
		for _, count := range item.PerKnowledgeCount {
			if count <= 0 {
				return ExamPaperInput{}, ErrInvalidInput
			}
		}
	}
	return input, nil
}

func (service *Service) scopeForExamMutation(ctx context.Context, scope Scope, id int64) (Scope, error) {
	detail, err := service.repo.GetExam(ctx, scopeForRead(scope), id)
	if err != nil {
		return Scope{}, err
	}
	scope.TenantID = detail.TenantID
	return scope, nil
}

func (service *Service) scopeForPaperMutation(ctx context.Context, scope Scope, id int64) (Scope, error) {
	detail, err := service.repo.GetExamPaper(ctx, scopeForRead(scope), id)
	if err != nil {
		return Scope{}, err
	}
	scope.TenantID = detail.TenantID
	return scope, nil
}

func scopeForRead(scope Scope) Scope {
	scope.TenantID = readTenantID(scope)
	return scope
}

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" {
		return 0
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" {
			return 0
		}
	}
	return scope.TenantID
}

func canManageExam(scope Scope) bool {
	return scope.UserType == "sys_admin" || scope.UserType == "teacher" || containsPermission(scope.Permissions, "exam:publish")
}

func (service *Service) ensureTeacherCanUseExamScope(ctx context.Context, scope Scope, input ExamInput) error {
	if scope.UserType != "teacher" {
		return nil
	}
	if scope.TenantID <= 0 || scope.UserID <= 0 {
		return ErrInvalidInput
	}
	scopeRepo, ok := service.repo.(teacherExamScopeRepository)
	if !ok {
		return nil
	}
	courseID, specialScope := singleCourseScope(input)
	for _, target := range input.Targets {
		switch target.TargetType {
		case TargetTypeClass:
			headTeacher, err := scopeRepo.TeacherCanManageClass(ctx, scope.TenantID, scope.UserID, target.TargetID)
			if err != nil {
				return err
			}
			if headTeacher {
				continue
			}
			if specialScope || courseID == nil {
				return ErrForbidden
			}
			allowed, err := scopeRepo.TeacherCanTeachClassCourse(ctx, scope.TenantID, scope.UserID, target.TargetID, *courseID)
			if err != nil {
				return err
			}
			if !allowed {
				return ErrForbidden
			}
		case TargetTypeCourse:
			if specialScope || courseID == nil || *courseID != target.TargetID {
				return ErrForbidden
			}
			allowed, err := scopeRepo.TeacherCanTeachCourse(ctx, scope.TenantID, scope.UserID, target.TargetID)
			if err != nil {
				return err
			}
			if !allowed {
				return ErrForbidden
			}
		case TargetTypeUser:
			headTeacher, err := scopeRepo.TeacherCanManageStudent(ctx, scope.TenantID, scope.UserID, target.TargetID)
			if err != nil {
				return err
			}
			if headTeacher {
				continue
			}
			if specialScope || courseID == nil {
				return ErrForbidden
			}
			allowed, err := scopeRepo.TeacherCanTeachStudentCourse(ctx, scope.TenantID, scope.UserID, target.TargetID, *courseID)
			if err != nil {
				return err
			}
			if !allowed {
				return ErrForbidden
			}
		}
	}
	return nil
}

func singleCourseScope(input ExamInput) (*int64, bool) {
	courseIDs := make(map[int64]struct{})
	hasNoCourseRule := false
	if input.ExamMode == ExamModeRandom {
		for _, rule := range input.PaperRules {
			if rule.CourseID == nil {
				hasNoCourseRule = true
				continue
			}
			courseIDs[*rule.CourseID] = struct{}{}
		}
	}
	if len(courseIDs) == 0 && !hasNoCourseRule {
		for _, target := range input.Targets {
			if target.TargetType == TargetTypeCourse {
				courseIDs[target.TargetID] = struct{}{}
			}
		}
	}
	if len(courseIDs) == 1 && !hasNoCourseRule {
		for courseID := range courseIDs {
			value := courseID
			return &value, false
		}
	}
	return nil, true
}

func judgeExamAnswer(correctAnswer map[string]any, submitted map[string]any) (bool, error) {
	mode, _ := correctAnswer["judge_mode"].(string)
	switch mode {
	case "by_option_key":
		return sameExamStringSet(asExamStringSlice(correctAnswer["correct_keys"]), asExamStringSlice(submitted["selected_keys"])), nil
	case "boolean":
		correctValue, ok := asExamBool(correctAnswer["correct_value"])
		if !ok {
			return false, ErrInvalidInput
		}
		submittedValue, ok := asExamBool(submitted["value"])
		if !ok {
			return false, ErrInvalidInput
		}
		return correctValue == submittedValue, nil
	default:
		return false, ErrInvalidInput
	}
}

func isManualReviewQuestionType(questionType string) bool {
	switch strings.ToLower(strings.TrimSpace(questionType)) {
	case "short_answer", "essay":
		return true
	default:
		return false
	}
}

func asExamStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string{}, typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok {
				result = append(result, text)
			}
		}
		return result
	default:
		return []string{}
	}
}

func asExamBool(value any) (bool, bool) {
	typed, ok := value.(bool)
	return typed, ok
}

func sameExamStringSet(left []string, right []string) bool {
	normalize := func(values []string) []string {
		result := make([]string, 0, len(values))
		for _, value := range values {
			trimmed := strings.ToUpper(strings.TrimSpace(value))
			if trimmed != "" {
				result = append(result, trimmed)
			}
		}
		sort.Strings(result)
		return result
	}
	return reflect.DeepEqual(normalize(left), normalize(right))
}

func hasNonPositiveID(values []int64) bool {
	for _, value := range values {
		if value <= 0 {
			return true
		}
	}
	return false
}
