package question

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_QuestionLifecycleAndVersions(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.questionBanks[11] = questionBankRef{ID: 11, TenantID: 1, CourseID: int64Ptr(10)}
	repo.questionBanks[12] = questionBankRef{ID: 12, TenantID: 1, CourseID: int64Ptr(10)}

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"question:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	createRec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions", map[string]any{
		"question_type": "single_choice",
		"difficulty":    "medium",
		"content": map[string]any{
			"stem": map[string]any{
				"content_type": "text",
				"text":         "1+1等于几？",
				"assets":       []any{},
			},
			"options": []map[string]any{
				{"key": "A", "content_type": "text", "text": "1", "assets": []any{}},
				{"key": "B", "content_type": "text", "text": "2", "assets": []any{}},
			},
			"option_order_randomizable": true,
			"ext":                       map[string]any{},
		},
		"answer": map[string]any{
			"judge_mode":   "by_option_key",
			"correct_keys": []string{"B"},
		},
		"analysis": map[string]any{
			"text": "基础算术",
		},
		"bank_ids":   []int64{11, 12},
		"course_ids": []int64{10},
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create question status = %d, body = %s", createRec.Code, createRec.Body.String())
	}

	var created envelope[Question]
	decodeQuestionBody(t, createRec, &created)
	if created.Code != 0 {
		t.Fatalf("create code = %d", created.Code)
	}
	if created.Data.Status != StatusActive {
		t.Fatalf("status = %q", created.Data.Status)
	}
	if created.Data.CurrentVersionID == nil || *created.Data.CurrentVersionID <= 0 {
		t.Fatalf("current_version_id = %+v", created.Data.CurrentVersionID)
	}
	if created.Data.CurrentVersionNo == nil || *created.Data.CurrentVersionNo != 1 {
		t.Fatalf("current_version_no = %+v", created.Data.CurrentVersionNo)
	}
	if len(created.Data.BankIDs) != 2 {
		t.Fatalf("bank_ids = %+v", created.Data.BankIDs)
	}
	if len(created.Data.CourseIDs) != 1 || created.Data.CourseIDs[0] != 10 {
		t.Fatalf("course_ids = %+v", created.Data.CourseIDs)
	}

	listRec := performQuestionRequest(
		router,
		http.MethodGet,
		"/api/v1/questions?question_type=single_choice&bank_id=11&course_id=10&status=active",
		nil,
		"token",
	)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list questions status = %d", listRec.Code)
	}
	var listed envelope[PageResult[Question]]
	decodeQuestionBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("question count = %d", len(listed.Data.Items))
	}

	updateRec := performQuestionRequest(
		router,
		http.MethodPut,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10),
		map[string]any{
			"difficulty": "hard",
			"status":     StatusDisabled,
			"bank_ids":   []int64{12},
			"course_ids": []int64{},
		},
		"token",
	)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update question status = %d", updateRec.Code)
	}
	var updated envelope[Question]
	decodeQuestionBody(t, updateRec, &updated)
	if updated.Data.Difficulty != "hard" {
		t.Fatalf("difficulty = %q", updated.Data.Difficulty)
	}
	if updated.Data.Status != StatusDisabled {
		t.Fatalf("status = %q", updated.Data.Status)
	}
	if len(updated.Data.BankIDs) != 1 || updated.Data.BankIDs[0] != 12 {
		t.Fatalf("updated bank_ids = %+v", updated.Data.BankIDs)
	}
	if len(updated.Data.CourseIDs) != 0 {
		t.Fatalf("updated course_ids = %+v", updated.Data.CourseIDs)
	}
	if updated.Data.CurrentVersionID == nil || created.Data.CurrentVersionID == nil || *updated.Data.CurrentVersionID != *created.Data.CurrentVersionID {
		t.Fatalf("current_version_id changed from %+v to %+v", created.Data.CurrentVersionID, updated.Data.CurrentVersionID)
	}

	versionsRec := performQuestionRequest(
		router,
		http.MethodGet,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10)+"/versions",
		nil,
		"token",
	)
	if versionsRec.Code != http.StatusOK {
		t.Fatalf("list versions status = %d", versionsRec.Code)
	}
	var versions envelope[[]QuestionVersion]
	decodeQuestionBody(t, versionsRec, &versions)
	if len(versions.Data) != 1 {
		t.Fatalf("version count = %d", len(versions.Data))
	}
	if versions.Data[0].VersionNo != 1 {
		t.Fatalf("version_no = %d", versions.Data[0].VersionNo)
	}

	createVersionRec := performQuestionRequest(
		router,
		http.MethodPost,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10)+"/versions",
		map[string]any{
			"content": map[string]any{
				"stem": map[string]any{
					"content_type": "text",
					"text":         "1+1=？",
					"assets":       []any{},
				},
				"options": []map[string]any{
					{"key": "A", "content_type": "text", "text": "1", "assets": []any{}},
					{"key": "B", "content_type": "text", "text": "2", "assets": []any{}},
				},
				"option_order_randomizable": true,
				"ext":                       map[string]any{},
			},
			"answer": map[string]any{
				"judge_mode":   "by_option_key",
				"correct_keys": []string{"B"},
			},
			"analysis": map[string]any{
				"text": "修正后的解析",
			},
			"change_summary": "修复题干文案",
		},
		"token",
	)
	if createVersionRec.Code != http.StatusOK {
		t.Fatalf("create version status = %d", createVersionRec.Code)
	}
	var versionCreated envelope[QuestionVersion]
	decodeQuestionBody(t, createVersionRec, &versionCreated)
	if versionCreated.Data.VersionNo != 2 {
		t.Fatalf("version_no = %d", versionCreated.Data.VersionNo)
	}
	if versionCreated.Data.ChangeSummary != "修复题干文案" {
		t.Fatalf("change_summary = %q", versionCreated.Data.ChangeSummary)
	}

	versionsRec = performQuestionRequest(
		router,
		http.MethodGet,
		"/api/v1/questions/"+strconv.FormatInt(created.Data.ID, 10)+"/versions",
		nil,
		"token",
	)
	decodeQuestionBody(t, versionsRec, &versions)
	if len(versions.Data) != 2 {
		t.Fatalf("version count after create = %d", len(versions.Data))
	}
	if versions.Data[0].VersionNo != 2 {
		t.Fatalf("latest version_no = %d", versions.Data[0].VersionNo)
	}
}

func TestHandler_QuestionRequiresPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	handler := NewHandler(NewService(newMemoryRepository()), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      1,
			TenantID:    1,
			Permissions: []string{"question_bank:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performQuestionRequest(router, http.MethodGet, "/api/v1/questions", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandler_StudentCanCreateQuestion(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.questionBanks[11] = questionBankRef{ID: 11, TenantID: 1, CourseID: int64Ptr(10)}
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:    21,
			TenantID:  1,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions", map[string]any{
		"question_type": "single_choice",
		"content": map[string]any{
			"stem": map[string]any{"content_type": "text", "text": "2+2=？"},
			"options": []map[string]any{
				{"key": "A", "content_type": "text", "text": "3"},
				{"key": "B", "content_type": "text", "text": "4"},
			},
		},
		"answer": map[string]any{
			"judge_mode":   "by_option_key",
			"correct_keys": []string{"B"},
		},
		"bank_ids":   []int64{11},
		"course_ids": []int64{10},
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var created envelope[Question]
	decodeQuestionBody(t, rec, &created)
	if created.Data.CreatorID != 21 || len(created.Data.BankIDs) != 1 {
		t.Fatalf("created question = %+v", created.Data)
	}
}

func TestHandler_CreateCommentAndChallenge(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	versionID := int64(3001)
	repo.questions[1001] = Question{
		ID:               1001,
		TenantID:         1,
		OwnerOrgType:     OwnerOrgTypeSchool,
		OwnerOrgID:       1,
		QuestionType:     "single_choice",
		CurrentVersionID: &versionID,
		CurrentVersionNo: intPtr(1),
		Status:           StatusActive,
		SourceType:       SourceTypeManual,
		CreatorID:        7,
	}
	repo.versions[1001] = []QuestionVersion{
		{
			ID:         versionID,
			QuestionID: 1001,
			VersionNo:  1,
			Content:    map[string]any{"stem": map[string]any{"text": "1+1=？"}},
			Answer:     map[string]any{"correct_keys": []string{"B"}},
		},
	}
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:    21,
			TenantID:  1,
			UserType:  "student",
			TokenType: auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	commentRec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions/1001/comments", map[string]any{
		"question_version_id": versionID,
		"content":             "  这题可以补一个口算方法。  ",
		"comment_type":        "discussion",
		"is_private":          false,
		"parent_comment_id":   nil,
	}, "token")
	if commentRec.Code != http.StatusOK {
		t.Fatalf("comment status = %d, body = %s", commentRec.Code, commentRec.Body.String())
	}
	var commentResult envelope[bool]
	decodeQuestionBody(t, commentRec, &commentResult)
	if !commentResult.Data || len(repo.comments) != 1 {
		t.Fatalf("comment result = %+v, comments = %+v", commentResult, repo.comments)
	}
	if repo.comments[0].Content != "这题可以补一个口算方法。" || repo.comments[0].UserID != 21 {
		t.Fatalf("stored comment = %+v", repo.comments[0])
	}

	challengeRec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions/1001/challenges", map[string]any{
		"question_version_id": versionID,
		"challenge_type":      "wrong_answer",
		"description":         " 答案应为 B。 ",
		"attachments": []map[string]any{
			{"url": "https://cdn.example.com/proof.png", "type": "image"},
		},
	}, "token")
	if challengeRec.Code != http.StatusOK {
		t.Fatalf("challenge status = %d, body = %s", challengeRec.Code, challengeRec.Body.String())
	}
	var challengeResult envelope[bool]
	decodeQuestionBody(t, challengeRec, &challengeResult)
	if !challengeResult.Data || len(repo.challenges) != 1 {
		t.Fatalf("challenge result = %+v, challenges = %+v", challengeResult, repo.challenges)
	}
	if repo.challenges[0].Status != StatusPending || repo.challenges[0].Description != "答案应为 B。" {
		t.Fatalf("stored challenge = %+v", repo.challenges[0])
	}

	invalidRec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions/1001/comments", map[string]any{
		"question_version_id": versionID,
		"content":             "   ",
		"comment_type":        "discussion",
	}, "token")
	if invalidRec.Code != http.StatusBadRequest {
		t.Fatalf("invalid comment status = %d", invalidRec.Code)
	}

	mismatchRec := performQuestionRequest(router, http.MethodPost, "/api/v1/questions/1001/challenges", map[string]any{
		"question_version_id": int64(9999),
		"challenge_type":      "wrong_answer",
		"description":         "版本不属于当前题目。",
	}, "token")
	if mismatchRec.Code != http.StatusNotFound {
		t.Fatalf("mismatch challenge status = %d", mismatchRec.Code)
	}
}

func TestHandler_ListAndReviewChallenges(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	repo.challengeItems[1] = QuestionChallengeListItem{
		ID:                1,
		TenantID:          1,
		QuestionID:        1001,
		QuestionVersionID: 3001,
		ChallengeType:     "wrong_answer",
		Description:       "答案应为 B。",
		Status:            StatusPending,
		ChallengerUserID:  21,
		Challenger:        "张同学",
		QuestionBank:      "高一数学基础题库",
		Title:             "1+1=？",
		CurrentVersion:    "版本 1：1+1=？",
		CurrentContent:    map[string]any{"stem": map[string]any{"text": "1+1=？"}},
		CurrentAnswer:     map[string]any{"judge_mode": "by_option_key", "correct_keys": []string{"A"}},
		CurrentAnalysis:   map[string]any{"text": "原解析"},
		SuggestedFix:      "答案应为 B。",
		HistoryVersions:   []string{"版本 1：1+1=？"},
		CreatedAt:         time.Date(2026, 4, 22, 10, 0, 0, 0, time.FixedZone("CST", 8*3600)),
		UpdatedAt:         time.Date(2026, 4, 22, 10, 0, 0, 0, time.FixedZone("CST", 8*3600)),
	}
	repo.questions[1001] = Question{
		ID:           1001,
		TenantID:     1,
		QuestionType: "single_choice",
		Status:       StatusActive,
		CreatorID:    7,
	}
	repo.versions[1001] = []QuestionVersion{
		{
			ID:        3001,
			VersionNo: 1,
			Content:   map[string]any{"stem": map[string]any{"text": "1+1=？"}},
			Answer:    map[string]any{"judge_mode": "by_option_key", "correct_keys": []string{"A"}},
			Analysis:  map[string]any{"text": "原解析"},
		},
	}

	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			UserID:      7,
			TenantID:    1,
			UserType:    "teacher",
			Permissions: []string{"question:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	listRec := performQuestionRequest(router, http.MethodGet, "/api/v1/question-challenges?status=pending", nil, "token")
	if listRec.Code != http.StatusOK {
		t.Fatalf("list challenge status = %d, body = %s", listRec.Code, listRec.Body.String())
	}
	var listed envelope[PageResult[QuestionChallengeListItem]]
	decodeQuestionBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 || listed.Data.Items[0].Title != "1+1=？" {
		t.Fatalf("listed challenges = %+v", listed.Data)
	}

	reviewRec := performQuestionRequest(router, http.MethodPut, "/api/v1/question-challenges/1", map[string]any{
		"status":         StatusRejected,
		"review_comment": "题目答案无误，已驳回。",
	}, "token")
	if reviewRec.Code != http.StatusOK {
		t.Fatalf("review challenge status = %d, body = %s", reviewRec.Code, reviewRec.Body.String())
	}
	var reviewed envelope[QuestionChallengeListItem]
	decodeQuestionBody(t, reviewRec, &reviewed)
	if reviewed.Data.Status != StatusRejected || reviewed.Data.ReviewComment != "题目答案无误，已驳回。" {
		t.Fatalf("reviewed challenge = %+v", reviewed.Data)
	}

	acceptedRec := performQuestionRequest(router, http.MethodPut, "/api/v1/question-challenges/1", map[string]any{
		"status":         StatusAccepted,
		"review_comment": "采纳质疑，修正答案。",
		"new_version": map[string]any{
			"content": map[string]any{"stem": map[string]any{"text": "1+1=？"}},
			"answer":  map[string]any{"judge_mode": "by_option_key", "correct_keys": []string{"B"}},
			"analysis": map[string]any{
				"text": "1+1=2，因此选择 B。",
			},
			"change_summary": "采纳质疑修正答案",
		},
	}, "token")
	if acceptedRec.Code != http.StatusOK {
		t.Fatalf("accepted challenge status = %d, body = %s", acceptedRec.Code, acceptedRec.Body.String())
	}
	var accepted envelope[QuestionChallengeListItem]
	decodeQuestionBody(t, acceptedRec, &accepted)
	if accepted.Data.Status != StatusAccepted || accepted.Data.ResolvedVersionID == nil || *accepted.Data.ResolvedVersionID <= 0 {
		t.Fatalf("accepted challenge = %+v", accepted.Data)
	}
	if len(repo.versions[1001]) != 2 {
		t.Fatalf("versions = %+v", repo.versions[1001])
	}
}

type envelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type questionBankRef struct {
	ID       int64
	TenantID int64
	CourseID *int64
}

type storedComment struct {
	ID                int64
	TenantID          int64
	QuestionID        int64
	QuestionVersionID int64
	UserID            int64
	ParentCommentID   *int64
	CommentType       string
	IsPrivate         bool
	Content           string
	Status            string
}

type memoryRepository struct {
	nextQuestionID  int64
	nextVersionID   int64
	nextCommentID   int64
	nextChallengeID int64
	questions       map[int64]Question
	versions        map[int64][]QuestionVersion
	questionBanks   map[int64]questionBankRef
	questionBankIDs map[int64][]int64
	comments        []storedComment
	challenges      []QuestionChallenge
	challengeItems  map[int64]QuestionChallengeListItem
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextQuestionID:  1,
		nextVersionID:   1,
		nextCommentID:   1,
		nextChallengeID: 1,
		questions:       map[int64]Question{},
		versions:        map[int64][]QuestionVersion{},
		questionBanks:   map[int64]questionBankRef{},
		questionBankIDs: map[int64][]int64{},
		challengeItems:  map[int64]QuestionChallengeListItem{},
	}
}

func (repo *memoryRepository) ListQuestions(_ context.Context, scope Scope, filter QuestionListFilter) (PageResult[Question], error) {
	items := make([]Question, 0)
	tenantID := readTenantID(scope)
	for _, question := range repo.questions {
		if tenantID > 0 && question.TenantID != tenantID {
			continue
		}
		if filter.QuestionType != "" && question.QuestionType != filter.QuestionType {
			continue
		}
		if filter.Status != "" && question.Status != filter.Status {
			continue
		}
		if filter.BankID != nil && !containsInt64(question.BankIDs, *filter.BankID) {
			continue
		}
		if filter.CourseID != nil && !containsInt64(question.CourseIDs, *filter.CourseID) && !repo.matchesCourse(question.BankIDs, *filter.CourseID) {
			continue
		}
		items = append(items, question)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetQuestion(_ context.Context, scope Scope, id int64) (Question, error) {
	question, ok := repo.questions[id]
	tenantID := readTenantID(scope)
	if !ok || (tenantID > 0 && question.TenantID != tenantID) {
		return Question{}, ErrNotFound
	}
	return question, nil
}

func (repo *memoryRepository) CreateQuestion(_ context.Context, question Question, version QuestionVersion, bankIDs []int64, courseIDs []int64) (Question, error) {
	question.ID = repo.nextQuestionID
	repo.nextQuestionID++
	version.ID = repo.nextVersionID
	repo.nextVersionID++
	version.QuestionID = question.ID
	now := time.Date(2026, 4, 22, 11, 0, 0, 0, time.FixedZone("CST", 8*3600))
	question.CreatedAt = now
	question.UpdatedAt = now
	version.CreatedAt = now
	version.VersionNo = 1
	question.CurrentVersionID = &version.ID
	question.CurrentVersionNo = intPtr(1)
	question.BankIDs = append([]int64{}, bankIDs...)
	question.CourseIDs = append([]int64{}, courseIDs...)
	repo.questions[question.ID] = question
	repo.versions[question.ID] = []QuestionVersion{version}
	repo.questionBankIDs[question.ID] = append([]int64{}, bankIDs...)
	return question, nil
}

func (repo *memoryRepository) UpdateQuestion(_ context.Context, question Question, bankIDs []int64, courseIDs []int64) (Question, error) {
	current, ok := repo.questions[question.ID]
	if !ok || current.TenantID != question.TenantID {
		return Question{}, ErrNotFound
	}
	if bankIDs != nil {
		question.BankIDs = append([]int64{}, bankIDs...)
	} else {
		question.BankIDs = append([]int64{}, current.BankIDs...)
	}
	if courseIDs != nil {
		question.CourseIDs = append([]int64{}, courseIDs...)
	} else {
		question.CourseIDs = append([]int64{}, current.CourseIDs...)
	}
	question.CreatedAt = current.CreatedAt
	question.UpdatedAt = current.CreatedAt.Add(time.Hour)
	repo.questions[question.ID] = question
	return question, nil
}

func (repo *memoryRepository) ListVersions(_ context.Context, tenantID int64, questionID int64) ([]QuestionVersion, error) {
	question, ok := repo.questions[questionID]
	if !ok || question.TenantID != tenantID {
		return nil, ErrNotFound
	}
	versions := append([]QuestionVersion{}, repo.versions[questionID]...)
	return versions, nil
}

func (repo *memoryRepository) CreateVersion(_ context.Context, tenantID int64, questionID int64, version QuestionVersion) (QuestionVersion, Question, error) {
	question, ok := repo.questions[questionID]
	if !ok || question.TenantID != tenantID {
		return QuestionVersion{}, Question{}, ErrNotFound
	}
	version.ID = repo.nextVersionID
	repo.nextVersionID++
	version.QuestionID = questionID
	version.CreatedAt = question.CreatedAt.Add(2 * time.Hour)
	version.VersionNo = len(repo.versions[questionID]) + 1
	repo.versions[questionID] = append([]QuestionVersion{version}, repo.versions[questionID]...)
	question.CurrentVersionID = &version.ID
	question.CurrentVersionNo = intPtr(version.VersionNo)
	question.UpdatedAt = version.CreatedAt
	repo.questions[questionID] = question
	return version, question, nil
}

func (repo *memoryRepository) CreateComment(_ context.Context, tenantID int64, questionID int64, userID int64, input QuestionCommentInput) error {
	question, ok := repo.questions[questionID]
	if !ok || question.TenantID != tenantID || !repo.hasVersion(questionID, input.QuestionVersionID) {
		return ErrNotFound
	}
	if input.ParentCommentID != nil && !repo.hasComment(questionID, *input.ParentCommentID) {
		return ErrNotFound
	}
	repo.comments = append(repo.comments, storedComment{
		ID:                repo.nextCommentID,
		TenantID:          tenantID,
		QuestionID:        questionID,
		QuestionVersionID: input.QuestionVersionID,
		UserID:            userID,
		ParentCommentID:   input.ParentCommentID,
		CommentType:       input.CommentType,
		IsPrivate:         input.IsPrivate,
		Content:           input.Content,
		Status:            StatusActive,
	})
	repo.nextCommentID++
	return nil
}

func (repo *memoryRepository) CreateChallenge(_ context.Context, challenge QuestionChallenge) error {
	question, ok := repo.questions[challenge.QuestionID]
	if !ok || question.TenantID != challenge.TenantID || !repo.hasVersion(challenge.QuestionID, challenge.QuestionVersionID) {
		return ErrNotFound
	}
	repo.challenges = append(repo.challenges, challenge)
	id := repo.nextChallengeID
	repo.nextChallengeID++
	repo.challengeItems[id] = QuestionChallengeListItem{
		ID:                id,
		TenantID:          challenge.TenantID,
		QuestionID:        challenge.QuestionID,
		QuestionVersionID: challenge.QuestionVersionID,
		ChallengeType:     challenge.ChallengeType,
		Description:       challenge.Description,
		Attachments:       append([]QuestionChallengeAttachmentInput{}, challenge.Attachments...),
		Status:            challenge.Status,
		ChallengerUserID:  challenge.ChallengerUserID,
		Challenger:        "提交人",
		Title:             "题目",
		CurrentVersion:    "版本 1：题目",
		SuggestedFix:      challenge.Description,
		HistoryVersions:   []string{"版本 1：题目"},
	}
	return nil
}

func (repo *memoryRepository) ListChallenges(_ context.Context, scope Scope, filter QuestionChallengeListFilter) (PageResult[QuestionChallengeListItem], error) {
	items := make([]QuestionChallengeListItem, 0)
	tenantID := readTenantID(scope)
	for _, item := range repo.challengeItems {
		if tenantID > 0 && item.TenantID != tenantID {
			continue
		}
		if filter.Status != "" && item.Status != filter.Status {
			continue
		}
		items = append(items, item)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) UpdateChallengeReview(_ context.Context, scope Scope, id int64, input QuestionChallengeReviewInput) (QuestionChallengeListItem, error) {
	item, ok := repo.challengeItems[id]
	tenantID := readTenantID(scope)
	if !ok || (tenantID > 0 && item.TenantID != tenantID) {
		return QuestionChallengeListItem{}, ErrNotFound
	}
	if input.NewVersion != nil {
		question, ok := repo.questions[item.QuestionID]
		if !ok {
			return QuestionChallengeListItem{}, ErrNotFound
		}
		version := QuestionVersion{
			ID:            repo.nextVersionID,
			QuestionID:    item.QuestionID,
			VersionNo:     len(repo.versions[item.QuestionID]) + 1,
			Content:       input.NewVersion.Content,
			Answer:        input.NewVersion.Answer,
			Analysis:      input.NewVersion.Analysis,
			StructureHash: buildStructureHash(question.QuestionType, input.NewVersion.Content, input.NewVersion.Answer),
			ChangeSummary: input.NewVersion.ChangeSummary,
			IsPublished:   true,
			CreatedBy:     scope.UserID,
		}
		repo.nextVersionID++
		repo.versions[item.QuestionID] = append([]QuestionVersion{version}, repo.versions[item.QuestionID]...)
		question.CurrentVersionID = &version.ID
		question.CurrentVersionNo = intPtr(version.VersionNo)
		repo.questions[item.QuestionID] = question
		item.ResolvedVersionID = &version.ID
		item.CurrentContent = input.NewVersion.Content
		item.CurrentAnswer = input.NewVersion.Answer
		item.CurrentAnalysis = input.NewVersion.Analysis
		item.CurrentVersion = "版本 2：" + input.NewVersion.ChangeSummary
		item.HistoryVersions = append(item.HistoryVersions, item.CurrentVersion)
	} else {
		item.ResolvedVersionID = input.ResolvedVersionID
	}
	item.Status = input.Status
	item.ReviewComment = input.ReviewComment
	if scope.UserID > 0 {
		reviewerID := scope.UserID
		item.ReviewedBy = &reviewerID
	}
	repo.challengeItems[id] = item
	return item, nil
}

func (repo *memoryRepository) matchesCourse(bankIDs []int64, courseID int64) bool {
	for _, bankID := range bankIDs {
		bank, ok := repo.questionBanks[bankID]
		if !ok || bank.CourseID == nil {
			continue
		}
		if *bank.CourseID == courseID {
			return true
		}
	}
	return false
}

func (repo *memoryRepository) hasVersion(questionID int64, versionID int64) bool {
	for _, version := range repo.versions[questionID] {
		if version.ID == versionID {
			return true
		}
	}
	return false
}

func (repo *memoryRepository) hasComment(questionID int64, commentID int64) bool {
	for _, comment := range repo.comments {
		if comment.QuestionID == questionID && comment.ID == commentID {
			return true
		}
	}
	return false
}

func performQuestionRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var requestBody []byte
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		requestBody = payload
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeQuestionBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func int64Ptr(value int64) *int64 {
	return &value
}
