package practice

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
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
	var states practiceEnvelope[PageResult[UserQuestionStateDetail]]
	decodePracticeBody(t, statesRec, &states)
	if len(states.Data.Items) != 1 {
		t.Fatalf("state count = %d", len(states.Data.Items))
	}
	if states.Data.Items[0].QuestionType != "single_choice" || states.Data.Items[0].Content["stem"] == nil {
		t.Fatalf("state detail = %+v", states.Data.Items[0])
	}
}

func TestHandler_SubmitAnswerRejectsEmptyDuplicateAndFinishedSession(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(2)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeSingleBank,
		"flow_mode":      FlowModeFixedCount,
		"bank_ids":       []int64{1},
		"question_count": 2,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)
	firstQuestionID := created.Data.Questions[0].ID
	secondQuestionID := created.Data.Questions[1].ID

	emptyRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": firstQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{},
		},
	}, "token")
	if emptyRec.Code != http.StatusBadRequest {
		t.Fatalf("empty answer status = %d, body = %s", emptyRec.Code, emptyRec.Body.String())
	}
	if len(repo.answers) != 0 {
		t.Fatalf("empty answer should not be saved: %+v", repo.answers)
	}

	answerRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": firstQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{"B"},
		},
	}, "token")
	if answerRec.Code != http.StatusOK {
		t.Fatalf("answer status = %d, body = %s", answerRec.Code, answerRec.Body.String())
	}

	duplicateRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": firstQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{"A"},
		},
	}, "token")
	if duplicateRec.Code != http.StatusBadRequest {
		t.Fatalf("duplicate answer status = %d, body = %s", duplicateRec.Code, duplicateRec.Body.String())
	}
	if len(repo.answers) != 1 {
		t.Fatalf("duplicate answer should not be saved: %+v", repo.answers)
	}

	finishRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/finish", nil, "token")
	if finishRec.Code != http.StatusOK {
		t.Fatalf("finish status = %d, body = %s", finishRec.Code, finishRec.Body.String())
	}
	finishedAnswerRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": secondQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{"B"},
		},
	}, "token")
	if finishedAnswerRec.Code != http.StatusBadRequest {
		t.Fatalf("finished answer status = %d, body = %s", finishedAnswerRec.Code, finishedAnswerRec.Body.String())
	}
	if len(repo.answers) != 1 {
		t.Fatalf("finished answer should not be saved: %+v", repo.answers)
	}
}

func TestHandler_Stage2D_ListSessionsAndResults(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(2)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeSequential,
		"source_mode":      SourceModeSingleBank,
		"flow_mode":        FlowModeFixedCount,
		"bank_ids":         []int64{1},
		"question_count":   2,
		"exclude_mastered": false,
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", createRec.Code, createRec.Body.String())
	}
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)

	for _, question := range created.Data.Questions {
		answerRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
			"session_question_id": question.ID,
			"answer": map[string]any{
				"selected_keys": []string{"B"},
			},
		}, "token")
		if answerRec.Code != http.StatusOK {
			t.Fatalf("answer status = %d, body = %s", answerRec.Code, answerRec.Body.String())
		}
	}

	finishRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/finish", nil, "token")
	if finishRec.Code != http.StatusOK {
		t.Fatalf("finish status = %d, body = %s", finishRec.Code, finishRec.Body.String())
	}

	listRec := performPracticeRequest(router, http.MethodGet, "/api/v1/practice/sessions?status=finished&page=1&page_size=20", nil, "token")
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", listRec.Code, listRec.Body.String())
	}
	var list practiceEnvelope[PageResult[PracticeSessionListItem]]
	decodePracticeBody(t, listRec, &list)
	if len(list.Data.Items) != 1 {
		t.Fatalf("session count = %d", len(list.Data.Items))
	}
	item := list.Data.Items[0]
	if item.AnsweredCount != 2 || item.CorrectCount != 2 || item.Accuracy != 1 {
		t.Fatalf("session summary = %+v", item)
	}

	resultsRec := performPracticeRequest(router, http.MethodGet, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/results", nil, "token")
	if resultsRec.Code != http.StatusOK {
		t.Fatalf("results status = %d, body = %s", resultsRec.Code, resultsRec.Body.String())
	}
	var results practiceEnvelope[PracticeSessionResults]
	decodePracticeBody(t, resultsRec, &results)
	if results.Data.Session.AnsweredCount != 2 || results.Data.Session.CorrectCount != 2 || results.Data.Session.Accuracy != 1 {
		t.Fatalf("result summary = %+v", results.Data.Session)
	}
	if len(results.Data.Questions) != 2 {
		t.Fatalf("result question count = %d", len(results.Data.Questions))
	}
	for index, question := range results.Data.Questions {
		if question.DisplayOrder != index+1 {
			t.Fatalf("display_order[%d] = %d", index, question.DisplayOrder)
		}
		if question.QuestionType != "single_choice" {
			t.Fatalf("question_type[%d] = %q", index, question.QuestionType)
		}
		if question.Content["stem"] == nil {
			t.Fatalf("content stem missing at %d", index)
		}
		if got := question.Answer["selected_keys"]; got == nil {
			t.Fatalf("answer missing at %d", index)
		}
		if got := question.CorrectAnswer["correct_keys"]; got == nil {
			t.Fatalf("correct answer missing at %d", index)
		}
		if question.Analysis["text"] != "解析" {
			t.Fatalf("analysis[%d] = %#v", index, question.Analysis)
		}
		if question.State.QuestionID != question.QuestionID {
			t.Fatalf("state question_id[%d] = %d", index, question.State.QuestionID)
		}
		if question.State.PracticeCorrectCount != 1 || question.State.PracticeWrongCount != 0 {
			t.Fatalf("state counters[%d] = %+v", index, question.State)
		}
	}
}

func TestHandler_Stage2D_ListSessionsCountsFirstSubmittedAnswerPerQuestion(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(1)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"flow_mode":      FlowModeFixedCount,
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)
	sessionQuestionID := created.Data.Questions[0].ID

	firstAnswerRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": sessionQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{"A"},
		},
	}, "token")
	if firstAnswerRec.Code != http.StatusOK {
		t.Fatalf("first answer status = %d, body = %s", firstAnswerRec.Code, firstAnswerRec.Body.String())
	}
	secondAnswerRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": sessionQuestionID,
		"answer": map[string]any{
			"selected_keys": []string{"B"},
		},
	}, "token")
	if secondAnswerRec.Code != http.StatusBadRequest {
		t.Fatalf("second answer status = %d, body = %s", secondAnswerRec.Code, secondAnswerRec.Body.String())
	}
	performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/finish", nil, "token")

	listRec := performPracticeRequest(router, http.MethodGet, "/api/v1/practice/sessions?status=finished", nil, "token")
	var list practiceEnvelope[PageResult[PracticeSessionListItem]]
	decodePracticeBody(t, listRec, &list)
	if len(list.Data.Items) != 1 {
		t.Fatalf("session count = %d", len(list.Data.Items))
	}
	item := list.Data.Items[0]
	if item.AnsweredCount != 1 || item.CorrectCount != 0 || item.WrongCount != 1 || item.Accuracy != 0 {
		t.Fatalf("first answer summary = %+v", item)
	}
}

func TestHandler_Stage2D_StateDetailsAndFromQuestions(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(3)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeSequential,
		"source_mode":      SourceModeSingleBank,
		"flow_mode":        FlowModeFixedCount,
		"bank_ids":         []int64{1},
		"question_count":   1,
		"exclude_mastered": false,
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", createRec.Code, createRec.Body.String())
	}
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)

	wrongRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": created.Data.Questions[0].ID,
		"answer": map[string]any{
			"selected_keys": []string{"A"},
		},
	}, "token")
	if wrongRec.Code != http.StatusOK {
		t.Fatalf("wrong answer status = %d, body = %s", wrongRec.Code, wrongRec.Body.String())
	}

	markRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/questions/"+strconv.FormatInt(created.Data.Questions[0].QuestionID, 10)+"/mark-confused", map[string]any{
		"value": true,
	}, "token")
	if markRec.Code != http.StatusOK {
		t.Fatalf("mark confused status = %d, body = %s", markRec.Code, markRec.Body.String())
	}

	statesRec := performPracticeRequest(router, http.MethodGet, "/api/v1/user-question-states?state_type=wrong&bank_id=1", nil, "token")
	if statesRec.Code != http.StatusOK {
		t.Fatalf("states status = %d, body = %s", statesRec.Code, statesRec.Body.String())
	}
	var states practiceEnvelope[PageResult[UserQuestionStateDetail]]
	decodePracticeBody(t, statesRec, &states)
	if len(states.Data.Items) != 1 {
		t.Fatalf("state count = %d", len(states.Data.Items))
	}
	state := states.Data.Items[0]
	if state.QuestionType != "single_choice" {
		t.Fatalf("question_type = %q", state.QuestionType)
	}
	if state.Content["stem"] == nil {
		t.Fatalf("content stem missing: %+v", state.Content)
	}
	if !state.IsConfused {
		t.Fatalf("is_confused = false")
	}

	fromQuestionsRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/from-questions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"flow_mode":      FlowModeFixedCount,
		"question_ids":   []int64{created.Data.Questions[0].QuestionID},
		"question_count": 1,
	}, "token")
	if fromQuestionsRec.Code != http.StatusOK {
		t.Fatalf("from-questions status = %d, body = %s", fromQuestionsRec.Code, fromQuestionsRec.Body.String())
	}
	var fromQuestions practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, fromQuestionsRec, &fromQuestions)
	if len(fromQuestions.Data.Questions) != 1 {
		t.Fatalf("from-questions count = %d", len(fromQuestions.Data.Questions))
	}
	if fromQuestions.Data.Questions[0].QuestionID != created.Data.Questions[0].QuestionID {
		t.Fatalf("from-questions question_id = %d", fromQuestions.Data.Questions[0].QuestionID)
	}

	emptyRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/from-questions", map[string]any{
		"question_ids": []int64{},
	}, "token")
	if emptyRec.Code != http.StatusBadRequest {
		t.Fatalf("empty question_ids status = %d, body = %s", emptyRec.Code, emptyRec.Body.String())
	}

	missingRec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/from-questions", map[string]any{
		"question_ids": []int64{99999},
	}, "token")
	if missingRec.Code != http.StatusBadRequest {
		t.Fatalf("missing candidates status = %d, body = %s", missingRec.Code, missingRec.Body.String())
	}
	var missing practiceEnvelope[any]
	decodePracticeBody(t, missingRec, &missing)
	if missing.Code != CodeNoCandidates {
		t.Fatalf("missing candidates code = %d", missing.Code)
	}
}

func TestHandler_Stage2D_RejectsCrossUserResultAccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.candidates[1] = buildCandidates(1)
	user7Router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})
	createRec := performPracticeRequest(user7Router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":    PracticeModeSequential,
		"source_mode":      SourceModeSingleBank,
		"flow_mode":        FlowModeFixedCount,
		"bank_ids":         []int64{1},
		"question_count":   1,
		"exclude_mastered": false,
	}, "token")
	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createRec, &created)

	user8Router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 8, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})
	resultsRec := performPracticeRequest(user8Router, http.MethodGet, "/api/v1/practice/sessions/"+strconv.FormatInt(created.Data.ID, 10)+"/results", nil, "token")
	if resultsRec.Code != http.StatusNotFound {
		t.Fatalf("cross-user results status = %d, body = %s", resultsRec.Code, resultsRec.Body.String())
	}
}

func TestHandler_Stage2E_CreateCourseSessionReturnsCourseInfo(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.declareBankCourse(2, 20)
	repo.candidates[1] = buildCandidatesInBank(1, 1, 2)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(10),
		"bank_ids":       []int64{99},
		"question_count": 2,
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, rec, &created)
	if created.Data.SourceMode != SourceModeCourse {
		t.Fatalf("source_mode = %q", created.Data.SourceMode)
	}
	if created.Data.CourseID == nil || *created.Data.CourseID != 10 {
		t.Fatalf("course_id = %+v", created.Data.CourseID)
	}
	if len(created.Data.BankIDs) != 0 {
		t.Fatalf("bank_ids = %+v", created.Data.BankIDs)
	}
	if len(created.Data.Questions) != 2 {
		t.Fatalf("question count = %d", len(created.Data.Questions))
	}
}

func TestHandler_Stage2E_CreateCourseSessionDeduplicatesQuestionIDs(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.declareBankCourse(2, 10)
	repo.candidates[1] = append(
		buildCandidatesInBank(1, 1, 1),
		buildCandidatesInBank(2, 1, 1)...,
	)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(10),
		"question_count": 2,
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, rec, &created)
	if len(created.Data.Questions) != 1 {
		t.Fatalf("question count = %d", len(created.Data.Questions))
	}
	if created.Data.Questions[0].QuestionID != 1 {
		t.Fatalf("question_id = %d", created.Data.Questions[0].QuestionID)
	}
}

func TestHandler_Stage2E_CreateCourseSessionRejectsMissingCourse(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.candidates[1] = buildCandidatesInBank(1, 1, 1)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(999),
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing course status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_Stage2E_CreateSessionDoesNotInferCourseModeFromCourseID(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.candidates[1] = buildCandidatesInBank(1, 1, 1)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	rec := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(10),
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var created practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, rec, &created)
	if created.Data.SourceMode == SourceModeCourse {
		t.Fatalf("source_mode unexpectedly inferred as course")
	}
}

func TestHandler_Stage2E_ListSessionsFiltersByCourseID(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.declareBankCourse(2, 20)
	repo.candidates[1] = buildCandidatesInBank(1, 1, 2)
	repo.candidates[1] = append(repo.candidates[1], buildCandidatesInBank(2, 101, 2)...)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createCourse10 := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(10),
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	if createCourse10.Code != http.StatusOK {
		t.Fatalf("course 10 create status = %d, body = %s", createCourse10.Code, createCourse10.Body.String())
	}
	var course10Session practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createCourse10, &course10Session)

	createCourse20 := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(20),
		"bank_ids":       []int64{2},
		"question_count": 1,
	}, "token")
	if createCourse20.Code != http.StatusOK {
		t.Fatalf("course 20 create status = %d, body = %s", createCourse20.Code, createCourse20.Body.String())
	}

	listRec := performPracticeRequest(router, http.MethodGet, "/api/v1/practice/sessions?course_id=10&page=1&page_size=20", nil, "token")
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", listRec.Code, listRec.Body.String())
	}
	type sessionListItemWithCourse struct {
		ID            int64      `json:"id"`
		Status        string     `json:"status"`
		PracticeMode  string     `json:"practice_mode"`
		SourceMode    string     `json:"source_mode"`
		FlowMode      string     `json:"flow_mode"`
		CourseID      *int64     `json:"course_id,omitempty"`
		BankIDs       []int64    `json:"bank_ids"`
		StartedAt     time.Time  `json:"started_at,omitempty"`
		EndedAt       *time.Time `json:"ended_at,omitempty"`
		TotalCount    int        `json:"total_count"`
		AnsweredCount int        `json:"answered_count"`
		CorrectCount  int        `json:"correct_count"`
		WrongCount    int        `json:"wrong_count"`
		Accuracy      float64    `json:"accuracy"`
	}
	var list practiceEnvelope[PageResult[sessionListItemWithCourse]]
	decodePracticeBody(t, listRec, &list)
	if len(list.Data.Items) != 1 {
		t.Fatalf("session count = %d", len(list.Data.Items))
	}
	if list.Data.Items[0].ID != course10Session.Data.ID {
		t.Fatalf("session id = %d", list.Data.Items[0].ID)
	}
	if list.Data.Items[0].CourseID == nil || *list.Data.Items[0].CourseID != 10 {
		t.Fatalf("session course_id = %+v", list.Data.Items[0].CourseID)
	}
}

func TestHandler_Stage2E_ListWrongStatesFiltersByCourseID(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.declareBankCourse(2, 20)
	repo.candidates[1] = buildCandidatesInBank(1, 1, 1)
	repo.candidates[1] = append(repo.candidates[1], buildCandidatesInBank(2, 101, 1)...)
	router := newPracticeTestRouter(repo, fakePracticeParser{
		claims: auth.AccessClaims{TenantID: 1, UserID: 7, Permissions: []string{"practice:use"}, TokenType: auth.TokenTypeAccess},
	})

	createCourse10 := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(10),
		"bank_ids":       []int64{1},
		"question_count": 1,
	}, "token")
	if createCourse10.Code != http.StatusOK {
		t.Fatalf("course 10 create status = %d, body = %s", createCourse10.Code, createCourse10.Body.String())
	}
	var course10Session practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createCourse10, &course10Session)
	answerCourse10 := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(course10Session.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": course10Session.Data.Questions[0].ID,
		"answer": map[string]any{
			"selected_keys": []string{"A"},
		},
	}, "token")
	if answerCourse10.Code != http.StatusOK {
		t.Fatalf("course 10 answer status = %d, body = %s", answerCourse10.Code, answerCourse10.Body.String())
	}

	createCourse20 := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions", map[string]any{
		"practice_mode":  PracticeModeSequential,
		"source_mode":    SourceModeCourse,
		"flow_mode":      FlowModeFixedCount,
		"course_id":      int64(20),
		"bank_ids":       []int64{2},
		"question_count": 1,
	}, "token")
	if createCourse20.Code != http.StatusOK {
		t.Fatalf("course 20 create status = %d, body = %s", createCourse20.Code, createCourse20.Body.String())
	}
	var course20Session practiceEnvelope[PracticeSessionDetail]
	decodePracticeBody(t, createCourse20, &course20Session)
	answerCourse20 := performPracticeRequest(router, http.MethodPost, "/api/v1/practice/sessions/"+strconv.FormatInt(course20Session.Data.ID, 10)+"/answer", map[string]any{
		"session_question_id": course20Session.Data.Questions[0].ID,
		"answer": map[string]any{
			"selected_keys": []string{"A"},
		},
	}, "token")
	if answerCourse20.Code != http.StatusOK {
		t.Fatalf("course 20 answer status = %d, body = %s", answerCourse20.Code, answerCourse20.Body.String())
	}

	statesRec := performPracticeRequest(router, http.MethodGet, "/api/v1/user-question-states?state_type=wrong&course_id=10", nil, "token")
	if statesRec.Code != http.StatusOK {
		t.Fatalf("states status = %d, body = %s", statesRec.Code, statesRec.Body.String())
	}
	var states practiceEnvelope[PageResult[UserQuestionStateDetail]]
	decodePracticeBody(t, statesRec, &states)
	if len(states.Data.Items) != 1 {
		t.Fatalf("state count = %d", len(states.Data.Items))
	}
	if states.Data.Items[0].QuestionID != course10Session.Data.Questions[0].QuestionID {
		t.Fatalf("state question_id = %d", states.Data.Items[0].QuestionID)
	}
}

func TestHandler_Stage2E_CourseExistsRespectsTenantCandidates(t *testing.T) {
	repo := newMemoryPracticeRepository()
	repo.declareBankCourse(1, 10)
	repo.declareBankCourse(2, 20)
	repo.candidates[1] = buildCandidatesInBank(1, 1, 1)
	repo.candidates[2] = buildCandidatesInBank(2, 101, 1)

	ok, err := repo.CourseExists(context.Background(), 1, 20)
	if err != nil {
		t.Fatalf("course exists error: %v", err)
	}
	if ok {
		t.Fatalf("tenant 1 should not see course 20 through tenant 2 bank mapping")
	}

	ok, err = repo.CourseExists(context.Background(), 2, 20)
	if err != nil {
		t.Fatalf("course exists error: %v", err)
	}
	if !ok {
		t.Fatalf("tenant 2 should see course 20 through its own candidates")
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
	bankCourseIDs         map[int64]int64
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
		bankCourseIDs:         map[int64]int64{},
		sessions:              map[int64]PracticeSession{},
		sessionQuestions:      map[int64][]PracticeSessionQuestion{},
		states:                map[string]UserQuestionState{},
	}
}

func (repo *memoryPracticeRepository) declareBankCourse(bankID int64, courseID int64) {
	repo.bankCourseIDs[bankID] = courseID
}

func (repo *memoryPracticeRepository) CourseExists(_ context.Context, tenantID int64, courseID int64) (bool, error) {
	if tenantID == 0 {
		return false, nil
	}
	for _, candidate := range repo.candidates[tenantID] {
		if repo.bankCourseIDs[candidate.BankID] == courseID {
			return true, nil
		}
	}
	return false, nil
}

func (repo *memoryPracticeRepository) ListCandidates(_ context.Context, scope Scope, input CandidateFilter) ([]QuestionCandidate, error) {
	items := make([]QuestionCandidate, 0)
	for _, candidate := range repo.candidates[scope.TenantID] {
		if input.CourseID != nil {
			if repo.bankCourseIDs[candidate.BankID] != *input.CourseID {
				continue
			}
		} else if !containsInt64(input.BankIDs, candidate.BankID) {
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
	latestAnswers := repo.latestAnswersBySessionQuestion(id)
	for index := range questions {
		answer, ok := latestAnswers[questions[index].ID]
		if !ok {
			continue
		}
		questions[index].Answered = true
		isCorrect := answer.IsCorrect
		questions[index].IsCorrect = &isCorrect
	}
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
	for _, answer := range repo.latestAnswersBySessionQuestion(id) {
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
		if filter.CourseID != nil {
			candidate, ok := repo.candidateByQuestionID(scope.TenantID, state.QuestionID)
			if !ok || repo.bankCourseIDs[candidate.BankID] != *filter.CourseID {
				continue
			}
		}
		items = append(items, state)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryPracticeRepository) ListSessions(_ context.Context, scope Scope, filter PracticeSessionListFilter) (PageResult[PracticeSessionListItem], error) {
	items := make([]PracticeSessionListItem, 0)
	for _, session := range repo.sessions {
		if session.TenantID != scope.TenantID || session.UserID != scope.UserID {
			continue
		}
		if filter.Status != "" && session.Status != filter.Status {
			continue
		}
		if filter.FlowMode != "" && session.FlowMode != filter.FlowMode {
			continue
		}
		if filter.PracticeMode != "" && session.PracticeMode != filter.PracticeMode {
			continue
		}
		if filter.CourseID != nil {
			if session.CourseID == nil || *session.CourseID != *filter.CourseID {
				continue
			}
		}
		item := PracticeSessionListItem{
			ID:           session.ID,
			Status:       session.Status,
			PracticeMode: session.PracticeMode,
			SourceMode:   session.SourceMode,
			FlowMode:     session.FlowMode,
			CourseID:     session.CourseID,
			BankIDs:      append([]int64{}, session.BankIDs...),
			StartedAt:    session.StartedAt,
			EndedAt:      session.EndedAt,
			TotalCount:   len(repo.sessionQuestions[session.ID]),
		}
		for _, answer := range repo.latestAnswersBySessionQuestion(session.ID) {
			item.AnsweredCount++
			if answer.IsCorrect {
				item.CorrectCount++
			} else {
				item.WrongCount++
			}
		}
		if item.TotalCount == 0 {
			item.TotalCount = session.QuestionCount
		}
		if item.AnsweredCount > 0 {
			item.Accuracy = float64(item.CorrectCount) / float64(item.AnsweredCount)
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].StartedAt.Equal(items[j].StartedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].StartedAt.After(items[j].StartedAt)
	})
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryPracticeRepository) latestAnswersBySessionQuestion(sessionID int64) map[int64]PracticeAnswer {
	latest := map[int64]PracticeAnswer{}
	for _, answer := range repo.answers {
		if answer.SessionID != sessionID {
			continue
		}
		latest[answer.SessionQuestionID] = answer
	}
	return latest
}

func (repo *memoryPracticeRepository) GetSessionResults(_ context.Context, scope Scope, id int64) (PracticeSessionResults, error) {
	session, ok := repo.sessions[id]
	if !ok || session.TenantID != scope.TenantID || session.UserID != scope.UserID {
		return PracticeSessionResults{}, ErrNotFound
	}
	questions := append([]PracticeSessionQuestion{}, repo.sessionQuestions[id]...)
	result := PracticeSessionResults{
		Session: PracticeSessionListItem{
			ID:           session.ID,
			Status:       session.Status,
			PracticeMode: session.PracticeMode,
			SourceMode:   session.SourceMode,
			FlowMode:     session.FlowMode,
			CourseID:     session.CourseID,
			BankIDs:      append([]int64{}, session.BankIDs...),
			StartedAt:    session.StartedAt,
			EndedAt:      session.EndedAt,
			TotalCount:   len(questions),
		},
		Questions: make([]PracticeSessionResultQuestion, 0, len(questions)),
	}
	latestAnswers := repo.latestAnswersBySessionQuestion(id)
	for _, question := range questions {
		latestAnswer, hasAnswer := latestAnswers[question.ID]
		state := repo.states[stateKey(scope.UserID, question.QuestionID)]
		if hasAnswer {
			result.Session.AnsweredCount++
			if latestAnswer.IsCorrect {
				result.Session.CorrectCount++
			} else {
				result.Session.WrongCount++
			}
		}
		result.Questions = append(result.Questions, PracticeSessionResultQuestion{
			SessionQuestionID: question.ID,
			QuestionID:        question.QuestionID,
			QuestionVersionID: question.QuestionVersionID,
			DisplayOrder:      question.DisplayOrder,
			QuestionType:      question.QuestionType,
			Content:           cloneMap(question.Content),
			Answer:            cloneMap(latestAnswer.Answer),
			CorrectAnswer:     cloneMap(question.Answer),
			IsCorrect:         hasAnswer && latestAnswer.IsCorrect,
			Analysis:          cloneMap(question.Analysis),
			State:             state,
		})
	}
	if result.Session.AnsweredCount > 0 {
		result.Session.Accuracy = float64(result.Session.CorrectCount) / float64(result.Session.AnsweredCount)
	}
	return result, nil
}

func (repo *memoryPracticeRepository) ListCandidatesByQuestionIDs(_ context.Context, scope Scope, questionIDs []int64, excludeMastered bool) ([]QuestionCandidate, error) {
	items := make([]QuestionCandidate, 0, len(questionIDs))
	for _, questionID := range questionIDs {
		candidate, ok := repo.candidateByQuestionID(scope.TenantID, questionID)
		if !ok {
			continue
		}
		if excludeMastered {
			state, ok := repo.states[stateKey(scope.UserID, questionID)]
			if ok && state.IsMastered {
				continue
			}
		}
		items = append(items, candidate)
	}
	return items, nil
}

func (repo *memoryPracticeRepository) ListStateDetails(_ context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionStateDetail], error) {
	items := make([]UserQuestionStateDetail, 0)
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
		candidate, ok := repo.candidateByQuestionID(scope.TenantID, state.QuestionID)
		if !ok {
			continue
		}
		if filter.BankID != nil && candidate.BankID != *filter.BankID {
			continue
		}
		if filter.CourseID != nil && repo.bankCourseIDs[candidate.BankID] != *filter.CourseID {
			continue
		}
		items = append(items, UserQuestionStateDetail{
			UserQuestionState: state,
			QuestionType:      candidate.QuestionType,
			Content:           cloneMap(candidate.Content),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt.Equal(items[j].UpdatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})
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

func (repo *memoryPracticeRepository) candidateByQuestionID(tenantID int64, questionID int64) (QuestionCandidate, bool) {
	for _, candidate := range repo.candidates[tenantID] {
		if candidate.QuestionID == questionID {
			return candidate, true
		}
	}
	return QuestionCandidate{}, false
}

func cloneMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
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
	return buildCandidatesInBank(1, 1, count)
}

func buildCandidatesInBank(bankID int64, startQuestionID int64, count int) []QuestionCandidate {
	items := make([]QuestionCandidate, 0, count)
	for index := 1; index <= count; index++ {
		id := startQuestionID + int64(index-1)
		items = append(items, QuestionCandidate{
			BankID:            bankID,
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
