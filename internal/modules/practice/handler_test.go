package practice

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

func TestHandler_CreateFixedCountSessionDefaultsToTen(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(12)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeSequential,
		"source_mode":      SourceModeSingleBank,
		"flow_mode":        FlowModeFixedCount,
		"bank_ids":         []int64{1},
		"exclude_mastered": false,
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, rec, &created)
	if created.Data.FlowMode != FlowModeFixedCount {
		t.Fatalf("flow_mode = %q", created.Data.FlowMode)
	}
	if len(created.Data.Questions) != 10 {
		t.Fatalf("question count = %d", len(created.Data.Questions))
	}
	if created.Data.Questions[0].DisplayOrder != 1 || created.Data.Questions[9].DisplayOrder != 10 {
		t.Fatalf("orders = %+v", created.Data.Questions)
	}
}

func TestHandler_CreateFixedCountSessionUsesCustomQuestionCount(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(8)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeSequential,
		"source_mode":      SourceModeSingleBank,
		"flow_mode":        FlowModeFixedCount,
		"bank_ids":         []int64{1},
		"question_count":   3,
		"exclude_mastered": false,
	}, "token")

	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, rec, &created)
	if len(created.Data.Questions) != 3 {
		t.Fatalf("question count = %d", len(created.Data.Questions))
	}
}

func TestHandler_ContinuousSessionAndNextQuestionRollsOver(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(2)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeSequential,
		"source_mode":      SourceModeSingleBank,
		"flow_mode":        FlowModeContinuous,
		"bank_ids":         []int64{1},
		"exclude_mastered": false,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)
	if len(created.Data.Questions) != 1 {
		t.Fatalf("initial question count = %d", len(created.Data.Questions))
	}

	nextRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/next-question", nil, "token")
	var next practiceEnvelope[NextQuestionResult]
	decodePracticeBody(t, nextRec, &next)
	if next.Data.Question.QuestionID == created.Data.Questions[0].QuestionID {
		t.Fatalf("next question repeated in same round: %+v", next.Data.Question)
	}
	if next.Data.RoundNo != 1 {
		t.Fatalf("round_no = %d", next.Data.RoundNo)
	}

	rolloverRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/next-question", nil, "token")
	var rollover practiceEnvelope[NextQuestionResult]
	decodePracticeBody(t, rolloverRec, &rollover)
	if rollover.Data.RoundNo != 2 {
		t.Fatalf("round_no after rollover = %d", rollover.Data.RoundNo)
	}
	if rollover.Data.Question.DisplayOrder != 3 {
		t.Fatalf("display_order after rollover = %d", rollover.Data.Question.DisplayOrder)
	}
}

func TestHandler_SubmitAnswerUpdatesStateAndMarksQuestion(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(1)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeSingleBank,
		"flow_mode":      FlowModeFixedCount,
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)
	sessionQuestionID := created.Data.Questions[0].ID
	questionID := created.Data.Questions[0].QuestionID

	answerRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": sessionQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{"A"},
		},
	}, "token")
	var answered practiceEnvelope[PracticeAnswerResult]
	decodePracticeBody(t, answerRec, &answered)
	if answered.Data.IsCorrect {
		t.Fatalf("answer should be wrong")
	}
	if answered.Data.State.PracticeWrongCount != 1 {
		t.Fatalf("wrong_count = %d", answered.Data.State.PracticeWrongCount)
	}

	masteredRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/questions/"+strconv.FormatInt(questionID, 10)+"/mark-mastered", map[string]any{"value": true}, "token")
	var mastered practiceEnvelope[UserQuestionState]
	decodePracticeBody(t, masteredRec, &mastered)
	if !mastered.Data.IsMastered {
		t.Fatalf("is_mastered = false")
	}

	confusedRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/questions/"+strconv.FormatInt(questionID, 10)+"/mark-confused", map[string]any{"value": true}, "token")
	var confused practiceEnvelope[UserQuestionState]
	decodePracticeBody(t, confusedRec, &confused)
	if !confused.Data.IsConfused {
		t.Fatalf("is_confused = false")
	}

	statesRec := performPracticeRequest(router, http.MethodGet, "/api/v1/user-question-states?state_type=wrong", nil, "token")
	var states practiceEnvelope[PageResult[UserQuestionState]]
	decodePracticeBody(t, statesRec, &states)
	if len(states.Data.Items) != 1 {
		t.Fatalf("state count = %d", len(states.Data.Items))
	}
}

func TestHandler_PracticeRequiresPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newPracticeTestRouter(newMemoryPracticeRepository(), fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"question:manage"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"bank_ids": []int64{1},
	}, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandler_PracticeRejectsCrossTenantSessionAccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(1)
	tenantOneRouter := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})
	createRec := performPracticeRequest(tenantOneRouter, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"flow_mode":      FlowModeFixedCount,
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)

	tenantTwoRouter := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 2, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})
	detailRec := performPracticeRequest(tenantTwoRouter, http.MethodGet, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10), nil, "token")
	if detailRec.Code != http.StatusNotFound {
		t.Fatalf("detail status = %d, body = %s", detailRec.Code, detailRec.Body.String())
	}
}

type practiceEnvelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakePracticeParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakePracticeParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

func newPracticeTestRouter(repo *memoryPracticeRepository, parser fakePracticeParser) http.Handler {
	handler := NewHandler(NewService(repo), parser)
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)
	return router
}

type memoryPracticeRepository struct {
	nextSessionID         int64
	nextSessionQuestionID int64
	nextAnswerID          int64
	nextStateID           int64
	candidates            map[int64][]QuestionCandidate
	sessions              map[int64]PracticeSession
	sessionQuestions      map[int64][]PracticeSessionQuestion
	answers               []PracticeAnswer
	states                map[string]UserQuestionState
}

func newMemoryPracticeRepository() *memoryPracticeRepository {
	return &memoryPracticeRepository{
		nextSessionID:         1,
		nextSessionQuestionID: 1,
		nextAnswerID:          1,
		nextStateID:           1,
		candidates:            map[int64][]QuestionCandidate{},
		sessions:              map[int64]PracticeSession{},
		sessionQuestions:      map[int64][]PracticeSessionQuestion{},
		states:                map[string]UserQuestionState{},
	}
}

func (repo *memoryPracticeRepository) ListCandidates(_ context.Context, scope Scope, input CandidateFilter) ([]QuestionCandidate, error) {
	items := make([]QuestionCandidate, 0)
	for _, candidate := range repo.candidates[scope.TenantID] {
		if !containsInt64(input.BankIDs, candidate.BankID) {
			continue
		}
		if input.ExcludeMastered {
			state, ok := repo.states[stateKey(scope.UserID, candidate.QuestionID)]
			if ok && state.IsMastered {
				continue
			}
		}
		items = append(items, candidate)
	}
	return items, nil
}

func (repo *memoryPracticeRepository) CreateSession(_ context.Context, session PracticeSession, questions []PracticeSessionQuestion) (PracticeSessionDetail, error) {
	session.ID = repo.nextSessionID
	repo.nextSessionID++
	session.StartedAt = fixedPracticeTime()
	repo.sessions[session.ID] = session
	for index := range questions {
		questions[index].ID = repo.nextSessionQuestionID
		repo.nextSessionQuestionID++
		questions[index].SessionID = session.ID
		questions[index].CreatedAt = fixedPracticeTime()
	}
	repo.sessionQuestions[session.ID] = append([]PracticeSessionQuestion{}, questions...)
	return repo.GetSession(context.Background(), Scope{TenantID: session.TenantID, UserID: session.UserID}, session.ID)
}

func (repo *memoryPracticeRepository) GetSession(_ context.Context, scope Scope, id int64) (PracticeSessionDetail, error) {
	session, ok := repo.sessions[id]
	if !ok || session.TenantID != scope.TenantID || session.UserID != scope.UserID {
		return PracticeSessionDetail{}, ErrNotFound
	}
	questions := append([]PracticeSessionQuestion{}, repo.sessionQuestions[id]...)
	return PracticeSessionDetail{PracticeSession: session, Questions: questions}, nil
}

func (repo *memoryPracticeRepository) AddSessionQuestion(_ context.Context, scope Scope, sessionID int64, question PracticeSessionQuestion) (PracticeSessionQuestion, error) {
	session, ok := repo.sessions[sessionID]
	if !ok || session.TenantID != scope.TenantID || session.UserID != scope.UserID {
		return PracticeSessionQuestion{}, ErrNotFound
	}
	question.ID = repo.nextSessionQuestionID
	repo.nextSessionQuestionID++
	question.SessionID = sessionID
	question.CreatedAt = fixedPracticeTime()
	repo.sessionQuestions[sessionID] = append(repo.sessionQuestions[sessionID], question)
	return question, nil
}

func (repo *memoryPracticeRepository) FinishSession(_ context.Context, scope Scope, id int64) (PracticeSessionSummary, error) {
	session, ok := repo.sessions[id]
	if !ok || session.TenantID != scope.TenantID || session.UserID != scope.UserID {
		return PracticeSessionSummary{}, ErrNotFound
	}
	session.Status = StatusFinished
	endedAt := fixedPracticeTime().Add(time.Hour)
	session.EndedAt = &endedAt
	repo.sessions[id] = session
	summary := PracticeSessionSummary{ID: id, Status: StatusFinished}
	for _, answer := range repo.answers {
		if answer.SessionID != id {
			continue
		}
		summary.AnsweredCount++
		if answer.IsCorrect {
			summary.CorrectCount++
		} else {
			summary.WrongCount++
		}
	}
	return summary, nil
}

func (repo *memoryPracticeRepository) SaveAnswerAndState(_ context.Context, scope Scope, answer PracticeAnswer, isCorrect bool) (UserQuestionState, error) {
	answer.ID = repo.nextAnswerID
	repo.nextAnswerID++
	answer.UserID = scope.UserID
	answer.IsCorrect = isCorrect
	answer.AnsweredAt = fixedPracticeTime()
	repo.answers = append(repo.answers, answer)

	key := stateKey(scope.UserID, answer.QuestionID)
	state := repo.states[key]
	if state.ID == 0 {
		state.ID = repo.nextStateID
		repo.nextStateID++
		state.TenantID = scope.TenantID
		state.UserID = scope.UserID
		state.QuestionID = answer.QuestionID
	}
	state.QuestionVersionID = answer.QuestionVersionID
	if isCorrect {
		state.PracticeCorrectCount++
		state.LastResult = "correct"
	} else {
		state.PracticeWrongCount++
		state.LastResult = "wrong"
		wrongAt := fixedPracticeTime()
		state.LastWrongAt = &wrongAt
	}
	state.LastAnswer = answer.Answer
	state.UpdatedAt = fixedPracticeTime()
	repo.states[key] = state
	return state, nil
}

func (repo *memoryPracticeRepository) SetQuestionState(_ context.Context, scope Scope, questionID int64, input QuestionStateUpdate) (UserQuestionState, error) {
	key := stateKey(scope.UserID, questionID)
	state := repo.states[key]
	if state.ID == 0 {
		state.ID = repo.nextStateID
		repo.nextStateID++
		state.TenantID = scope.TenantID
		state.UserID = scope.UserID
		state.QuestionID = questionID
		state.QuestionVersionID = repo.latestVersionID(scope.TenantID, questionID)
	}
	now := fixedPracticeTime()
	if input.Mastered != nil {
		state.IsMastered = *input.Mastered
		if *input.Mastered {
			state.MasteredAt = &now
		} else {
			state.MasteredAt = nil
		}
	}
	if input.Confused != nil {
		state.IsConfused = *input.Confused
		if *input.Confused {
			state.ConfusedAt = &now
		} else {
			state.ConfusedAt = nil
		}
	}
	state.UpdatedAt = now
	repo.states[key] = state
	return state, nil
}

func (repo *memoryPracticeRepository) ListStates(_ context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionState], error) {
	items := make([]UserQuestionState, 0)
	for _, state := range repo.states {
		if state.TenantID != scope.TenantID || state.UserID != scope.UserID {
			continue
		}
		if filter.StateType == StateTypeWrong && state.PracticeWrongCount == 0 {
			continue
		}
		if filter.StateType == StateTypeMastered && !state.IsMastered {
			continue
		}
		if filter.StateType == StateTypeConfused && !state.IsConfused {
			continue
		}
		items = append(items, state)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryPracticeRepository) latestVersionID(tenantID int64, questionID int64) int64 {
	for _, candidate := range repo.candidates[tenantID] {
		if candidate.QuestionID == questionID {
			return candidate.QuestionVersionID
		}
	}
	return 0
}

func performPracticeRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodePracticeBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func buildCandidates(count int) []QuestionCandidate {
	items := make([]QuestionCandidate, 0, count)
	for index := 1; index <= count; index++ {
		id := int64(index)
		items = append(items, QuestionCandidate{
			BankID:            1,
			QuestionID:        id,
			QuestionVersionID: id + 1000,
			QuestionType:      "single_choice",
			Content: map[string]any{
				"stem": map[string]any{"content_type": "text", "text": "第" + strconv.Itoa(index) + "题", "assets": []any{}},
				"options": []any{
					map[string]any{"key": "A", "content_type": "text", "text": "错误", "assets": []any{}},
					map[string]any{"key": "B", "content_type": "text", "text": "正确", "assets": []any{}},
				},
				"option_order_randomizable": true,
				"ext":                       map[string]any{},
			},
			Answer:   map[string]any{"judge_mode": "by_option_key", "correct_keys": []any{"B"}},
			Analysis: map[string]any{"text": "解析"},
		})
	}
	return items
}

func fixedPracticeTime() time.Time {
	return time.Date(2026, 4, 22, 12, 0, 0, 0, time.FixedZone("CST", 8*3600))
}
