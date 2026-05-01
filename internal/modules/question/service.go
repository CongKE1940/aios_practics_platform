package question

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListQuestions(ctx context.Context, scope Scope, filter QuestionListFilter) (PageResult[Question], error) {
	return service.repo.ListQuestions(ctx, scope, normalizeListFilter(filter))
}

func (service *Service) CreateQuestion(ctx context.Context, scope Scope, input QuestionInput) (Question, error) {
	if !isAllowedQuestionType(input.QuestionType) || len(input.Content) == 0 || len(input.Answer) == 0 {
		return Question{}, ErrInvalidInput
	}
	if hasNonPositiveID(input.BankIDs) || hasNonPositiveID(input.CourseIDs) {
		return Question{}, ErrInvalidInput
	}

	version := QuestionVersion{
		VersionNo:     1,
		Content:       input.Content,
		Answer:        input.Answer,
		Analysis:      input.Analysis,
		StructureHash: buildStructureHash(input.QuestionType, input.Content, input.Answer),
		ChangeSummary: "初始版本",
		IsPublished:   true,
		CreatedBy:     scope.UserID,
	}

	return service.repo.CreateQuestion(ctx, Question{
		TenantID:     scope.TenantID,
		OwnerOrgType: OwnerOrgTypeSchool,
		OwnerOrgID:   scope.TenantID,
		QuestionType: input.QuestionType,
		Difficulty:   strings.TrimSpace(input.Difficulty),
		Status:       StatusActive,
		SourceType:   SourceTypeManual,
		CreatorID:    scope.UserID,
	}, version, normalizeIDs(input.BankIDs), normalizeIDs(input.CourseIDs))
}

func (service *Service) UpdateQuestion(ctx context.Context, scope Scope, id int64, input QuestionUpdateInput) (Question, error) {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return Question{}, err
	}
	if !canManageQuestion(scope, current) {
		return Question{}, ErrForbidden
	}

	current.Difficulty = strings.TrimSpace(input.Difficulty)
	if status := strings.TrimSpace(input.Status); status != "" {
		current.Status = status
	}
	if hasNonPositiveID(input.BankIDs) || hasNonPositiveID(input.CourseIDs) {
		return Question{}, ErrInvalidInput
	}
	var bankIDs []int64
	if input.BankIDs != nil {
		bankIDs = normalizeIDs(input.BankIDs)
	}
	var courseIDs []int64
	if input.CourseIDs != nil {
		courseIDs = normalizeIDs(input.CourseIDs)
	}
	return service.repo.UpdateQuestion(ctx, current, bankIDs, courseIDs)
}

func (service *Service) ListVersions(ctx context.Context, scope Scope, id int64) ([]QuestionVersion, error) {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return nil, err
	}
	return service.repo.ListVersions(ctx, current.TenantID, id)
}

func (service *Service) CreateVersion(ctx context.Context, scope Scope, id int64, input QuestionVersionInput) (QuestionVersion, error) {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return QuestionVersion{}, err
	}
	if !canManageQuestion(scope, current) {
		return QuestionVersion{}, ErrForbidden
	}
	if len(input.Content) == 0 || len(input.Answer) == 0 {
		return QuestionVersion{}, ErrInvalidInput
	}

	version, _, err := service.repo.CreateVersion(ctx, current.TenantID, id, QuestionVersion{
		Content:       input.Content,
		Answer:        input.Answer,
		Analysis:      input.Analysis,
		StructureHash: buildStructureHash(current.QuestionType, input.Content, input.Answer),
		ChangeSummary: strings.TrimSpace(input.ChangeSummary),
		IsPublished:   true,
		CreatedBy:     scope.UserID,
	})
	if err != nil {
		return QuestionVersion{}, err
	}
	return version, nil
}

func (service *Service) SetQuestionTags(ctx context.Context, scope Scope, id int64, input QuestionTagInput) error {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return err
	}
	if !canManageQuestion(scope, current) {
		return ErrForbidden
	}
	if hasNonPositiveID(input.TagIDs) {
		return ErrInvalidInput
	}
	tagIDs := normalizeIDs(input.TagIDs)
	tagNames := normalizeTagNames(input.TagNames)
	return service.repo.SetQuestionTags(ctx, current.TenantID, id, tagIDs, tagNames)
}

func (service *Service) CreateComment(ctx context.Context, scope Scope, id int64, input QuestionCommentInput) error {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return err
	}
	if scope.UserID <= 0 || input.QuestionVersionID <= 0 {
		return ErrInvalidInput
	}

	input.Content = strings.TrimSpace(input.Content)
	input.CommentType = normalizeCommentType(input.CommentType)
	if input.Content == "" || !isAllowedCommentType(input.CommentType) {
		return ErrInvalidInput
	}
	if input.ParentCommentID != nil && *input.ParentCommentID <= 0 {
		return ErrInvalidInput
	}
	return service.repo.CreateComment(ctx, current.TenantID, id, scope.UserID, input)
}

func (service *Service) CreateChallenge(ctx context.Context, scope Scope, id int64, input QuestionChallengeInput) error {
	current, err := service.repo.GetQuestion(ctx, scope, id)
	if err != nil {
		return err
	}
	if scope.UserID <= 0 || input.QuestionVersionID <= 0 {
		return ErrInvalidInput
	}

	input.ChallengeType = strings.TrimSpace(input.ChallengeType)
	input.Description = strings.TrimSpace(input.Description)
	if input.Description == "" || !isAllowedChallengeType(input.ChallengeType) {
		return ErrInvalidInput
	}
	attachments, err := normalizeChallengeAttachments(input.Attachments)
	if err != nil {
		return ErrInvalidInput
	}

	return service.repo.CreateChallenge(ctx, QuestionChallenge{
		TenantID:          current.TenantID,
		QuestionID:        id,
		QuestionVersionID: input.QuestionVersionID,
		ChallengerUserID:  scope.UserID,
		ChallengerOrgType: ChallengerOrgType,
		ChallengerOrgID:   current.TenantID,
		ChallengeType:     input.ChallengeType,
		Description:       input.Description,
		Attachments:       attachments,
		Status:            StatusPending,
	})
}

func (service *Service) ListChallenges(ctx context.Context, scope Scope, filter QuestionChallengeListFilter) (PageResult[QuestionChallengeListItem], error) {
	if !canManageQuestionChallenges(scope) {
		return PageResult[QuestionChallengeListItem]{}, ErrForbidden
	}
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	filter.Status = strings.TrimSpace(filter.Status)
	if filter.Status != "" && !isAllowedChallengeReviewStatus(filter.Status) {
		return PageResult[QuestionChallengeListItem]{}, ErrInvalidInput
	}
	return service.repo.ListChallenges(ctx, scopeForChallengeReview(scope), filter)
}

func (service *Service) UpdateChallengeReview(ctx context.Context, scope Scope, id int64, input QuestionChallengeReviewInput) (QuestionChallengeListItem, error) {
	if !canManageQuestionChallenges(scope) {
		return QuestionChallengeListItem{}, ErrForbidden
	}
	if id <= 0 {
		return QuestionChallengeListItem{}, ErrInvalidInput
	}
	input.Status = strings.TrimSpace(input.Status)
	input.ReviewComment = strings.TrimSpace(input.ReviewComment)
	if !isAllowedChallengeReviewStatus(input.Status) {
		return QuestionChallengeListItem{}, ErrInvalidInput
	}
	if input.ResolvedVersionID != nil && *input.ResolvedVersionID <= 0 {
		return QuestionChallengeListItem{}, ErrInvalidInput
	}
	if input.NewVersion != nil {
		if input.ResolvedVersionID != nil || !isVersionResolvingChallengeStatus(input.Status) {
			return QuestionChallengeListItem{}, ErrInvalidInput
		}
		if len(input.NewVersion.Content) == 0 || len(input.NewVersion.Answer) == 0 {
			return QuestionChallengeListItem{}, ErrInvalidInput
		}
		input.NewVersion.ChangeSummary = strings.TrimSpace(input.NewVersion.ChangeSummary)
		if input.NewVersion.ChangeSummary == "" {
			input.NewVersion.ChangeSummary = "采纳质疑修订"
		}
	}
	if isVersionRequiredChallengeStatus(input.Status) && input.ResolvedVersionID == nil && input.NewVersion == nil {
		return QuestionChallengeListItem{}, ErrInvalidInput
	}
	return service.repo.UpdateChallengeReview(ctx, scopeForChallengeReview(scope), id, input)
}

func normalizeListFilter(filter QuestionListFilter) QuestionListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeTagNames(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		name := strings.TrimSpace(value)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		result = append(result, name)
	}
	return result
}

func scopeForChallengeReview(scope Scope) Scope {
	if isSystemScope(scope) {
		scope.TenantID = 0
	}
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

func canManageQuestion(scope Scope, item Question) bool {
	if isSystemScope(scope) {
		return true
	}
	if item.CreatorID == scope.UserID && scope.UserID > 0 {
		return true
	}
	return item.TenantID == scope.TenantID && (isTenantManageScope(scope) || containsExactPermission(scope.Permissions, "question:manage"))
}

func canManageQuestionChallenges(scope Scope) bool {
	return isSystemScope(scope) || isTenantManageScope(scope) || containsExactPermission(scope.Permissions, "question:manage")
}

func isSystemScope(scope Scope) bool {
	return scope.UserType == "sys_admin" || containsExactPermission(scope.Permissions, "system:manage")
}

func isTenantManageScope(scope Scope) bool {
	return scope.UserType == "tenant_admin" || containsExactPermission(scope.Permissions, "tenant:manage")
}

func containsExactPermission(permissions []string, target string) bool {
	for _, permission := range permissions {
		if permission == target {
			return true
		}
	}
	return false
}

func isAllowedQuestionType(questionType string) bool {
	switch strings.TrimSpace(questionType) {
	case "single_choice", "multiple_choice", "true_false":
		return true
	default:
		return false
	}
}

func normalizeCommentType(commentType string) string {
	commentType = strings.TrimSpace(commentType)
	if commentType == "" {
		return "discussion"
	}
	return commentType
}

func isAllowedCommentType(commentType string) bool {
	switch commentType {
	case "discussion", "note":
		return true
	default:
		return false
	}
}

func isAllowedChallengeType(challengeType string) bool {
	switch challengeType {
	case "wrong_answer", "wrong_stem", "wrong_option", "typo", "dispute", "other":
		return true
	default:
		return false
	}
}

func isAllowedChallengeReviewStatus(status string) bool {
	switch status {
	case StatusPending, StatusReviewing, StatusResolved, StatusRejected, StatusAccepted, StatusMerged:
		return true
	default:
		return false
	}
}

func isVersionRequiredChallengeStatus(status string) bool {
	return status == StatusAccepted || status == StatusMerged
}

func isVersionResolvingChallengeStatus(status string) bool {
	return status == StatusAccepted || status == StatusMerged || status == StatusResolved
}

func normalizeChallengeAttachments(attachments []QuestionChallengeAttachmentInput) ([]QuestionChallengeAttachmentInput, error) {
	if len(attachments) > 10 {
		return nil, ErrInvalidInput
	}
	result := make([]QuestionChallengeAttachmentInput, 0, len(attachments))
	for _, attachment := range attachments {
		attachment.URL = strings.TrimSpace(attachment.URL)
		attachment.Type = strings.TrimSpace(attachment.Type)
		if attachment.URL == "" || !isAllowedAttachmentType(attachment.Type) {
			return nil, ErrInvalidInput
		}
		result = append(result, attachment)
	}
	return result, nil
}

func isAllowedAttachmentType(attachmentType string) bool {
	switch attachmentType {
	case "image", "file":
		return true
	default:
		return false
	}
}

func buildStructureHash(questionType string, content map[string]any, answer map[string]any) string {
	payload, _ := json.Marshal(map[string]any{
		"question_type": questionType,
		"content":       content,
		"answer":        answer,
	})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
