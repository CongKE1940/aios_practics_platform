package practice

import (
	"context"
	"errors"
	"math/rand"
	"reflect"
	"sort"
	"strings"
	"time"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) CreateSession(ctx context.Context, scope Scope, input PracticeSessionInput) (PracticeSessionDetail, error) {
	input = normalizeSessionInput(input)
	if input.SourceMode == SourceModeCourse {
		if input.CourseID == nil || *input.CourseID <= 0 {
			return PracticeSessionDetail{}, ErrInvalidInput
		}
		exists, err := service.repo.CourseExists(ctx, scope.TenantID, *input.CourseID)
		if err != nil {
			return PracticeSessionDetail{}, err
		}
		if !exists {
			return PracticeSessionDetail{}, ErrNotFound
		}
		input.BankIDs = nil
	} else if len(input.BankIDs) == 0 {
		return PracticeSessionDetail{}, ErrInvalidInput
	}
	candidates, err := service.candidates(ctx, scope, input)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	if len(candidates) == 0 {
		return PracticeSessionDetail{}, ErrNoCandidates
	}

	count := input.QuestionCount
	if input.FlowMode == FlowModeContinuous {
		count = 1
	}
	selected := limitCandidates(candidates, count)
	questions := buildSessionQuestions(selected, 1, 1)
	session := PracticeSession{
		TenantID:        scope.TenantID,
		UserID:          scope.UserID,
		PracticeMode:    input.PracticeMode,
		SourceMode:      input.SourceMode,
		FlowMode:        input.FlowMode,
		CourseID:        input.CourseID,
		BankIDs:         append([]int64{}, input.BankIDs...),
		ExcludeMastered: input.ExcludeMastered,
		QuestionCount:   input.QuestionCount,
		RandomSeed:      input.RandomSeed,
		RoundNo:         1,
		Status:          StatusActive,
		BankScope: func() map[string]any {
			scope := map[string]any{
				"flow_mode":        input.FlowMode,
				"source_mode":      input.SourceMode,
				"bank_ids":         input.BankIDs,
				"exclude_mastered": input.ExcludeMastered,
				"question_count":   input.QuestionCount,
				"random_seed":      input.RandomSeed,
				"round_no":         1,
			}
			if input.CourseID != nil {
				scope["course_id"] = *input.CourseID
			}
			return scope
		}(),
	}
	return service.repo.CreateSession(ctx, session, questions)
}

func (service *Service) CreateSessionFromQuestions(ctx context.Context, scope Scope, input PracticeSessionFromQuestionsInput) (PracticeSessionDetail, error) {
	input = normalizeFromQuestionsInput(input)
	if len(input.QuestionIDs) == 0 {
		return PracticeSessionDetail{}, ErrInvalidInput
	}
	candidates, err := service.repo.ListCandidatesByQuestionIDs(ctx, scope, input.QuestionIDs, input.ExcludeMastered)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	if len(candidates) == 0 {
		return PracticeSessionDetail{}, ErrNoCandidates
	}
	if input.PracticeMode == PracticeModeRandom {
		rng := rand.New(rand.NewSource(input.RandomSeed))
		rng.Shuffle(len(candidates), func(i int, j int) {
			candidates[i], candidates[j] = candidates[j], candidates[i]
		})
	}
	selected := limitCandidates(candidates, input.QuestionCount)
	questions := buildSessionQuestions(selected, 1, 1)
	session := PracticeSession{
		TenantID:        scope.TenantID,
		UserID:          scope.UserID,
		PracticeMode:    input.PracticeMode,
		SourceMode:      "question_list",
		FlowMode:        input.FlowMode,
		BankIDs:         []int64{},
		ExcludeMastered: input.ExcludeMastered,
		QuestionCount:   input.QuestionCount,
		RandomSeed:      input.RandomSeed,
		RoundNo:         1,
		Status:          StatusActive,
		BankScope: map[string]any{
			"flow_mode":        input.FlowMode,
			"source_mode":      "question_list",
			"question_ids":     append([]int64{}, input.QuestionIDs...),
			"exclude_mastered": input.ExcludeMastered,
			"question_count":   input.QuestionCount,
			"random_seed":      input.RandomSeed,
			"round_no":         1,
		},
	}
	return service.repo.CreateSession(ctx, session, questions)
}

func (service *Service) GetSession(ctx context.Context, scope Scope, id int64) (PracticeSessionDetail, error) {
	return service.repo.GetSession(ctx, scope, id)
}

func (service *Service) ListSessions(ctx context.Context, scope Scope, filter PracticeSessionListFilter) (PageResult[PracticeSessionListItem], error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListSessions(ctx, scope, filter)
}

func (service *Service) GetSessionResults(ctx context.Context, scope Scope, id int64) (PracticeSessionResults, error) {
	return service.repo.GetSessionResults(ctx, scope, id)
}

func (service *Service) NextQuestion(ctx context.Context, scope Scope, id int64) (NextQuestionResult, error) {
	detail, err := service.repo.GetSession(ctx, scope, id)
	if err != nil {
		return NextQuestionResult{}, err
	}
	if detail.Status != StatusActive {
		return NextQuestionResult{}, ErrInvalidInput
	}
	candidates, err := service.sessionCandidates(ctx, scope, detail)
	if err != nil {
		return NextQuestionResult{}, err
	}
	if len(candidates) == 0 {
		return NextQuestionResult{}, ErrNoCandidates
	}

	usedThisRound := map[int64]struct{}{}
	maxOrder := 0
	roundNo := detail.RoundNo
	for _, question := range detail.Questions {
		if question.DisplayOrder > maxOrder {
			maxOrder = question.DisplayOrder
		}
		if question.RoundNo > roundNo {
			roundNo = question.RoundNo
		}
	}
	for _, question := range detail.Questions {
		if question.RoundNo == roundNo {
			usedThisRound[question.QuestionID] = struct{}{}
		}
	}
	var selected *QuestionCandidate
	for index := range candidates {
		if _, ok := usedThisRound[candidates[index].QuestionID]; ok {
			continue
		}
		selected = &candidates[index]
		break
	}
	if selected == nil {
		roundNo++
		selected = &candidates[0]
	}
	question := buildSessionQuestion(*selected, maxOrder+1, roundNo)
	created, err := service.repo.AddSessionQuestion(ctx, scope, id, question)
	if err != nil {
		return NextQuestionResult{}, err
	}
	return NextQuestionResult{Question: created, RoundNo: roundNo}, nil
}

func (service *Service) SubmitAnswer(ctx context.Context, scope Scope, id int64, input PracticeAnswerInput) (PracticeAnswerResult, error) {
	detail, err := service.repo.GetSession(ctx, scope, id)
	if err != nil {
		return PracticeAnswerResult{}, err
	}
	if detail.Status != StatusActive {
		return PracticeAnswerResult{}, ErrInvalidInput
	}
	var sessionQuestion *PracticeSessionQuestion
	for index := range detail.Questions {
		if detail.Questions[index].ID == input.SessionQuestionID {
			sessionQuestion = &detail.Questions[index]
			break
		}
	}
	if sessionQuestion == nil {
		return PracticeAnswerResult{}, ErrNotFound
	}
	if sessionQuestion.Answered {
		return PracticeAnswerResult{}, ErrInvalidInput
	}
	if !hasSubmittedAnswer(sessionQuestion.Answer, input.Answer) {
		return PracticeAnswerResult{}, ErrInvalidInput
	}
	isCorrect, err := judgeAnswer(sessionQuestion.Answer, input.Answer)
	if err != nil {
		return PracticeAnswerResult{}, err
	}
	state, err := service.repo.SaveAnswerAndState(ctx, scope, PracticeAnswer{
		SessionID:         id,
		SessionQuestionID: sessionQuestion.ID,
		QuestionID:        sessionQuestion.QuestionID,
		QuestionVersionID: sessionQuestion.QuestionVersionID,
		Answer:            input.Answer,
	}, isCorrect)
	if err != nil {
		return PracticeAnswerResult{}, err
	}
	return PracticeAnswerResult{
		IsCorrect:     isCorrect,
		CorrectAnswer: sessionQuestion.Answer,
		Analysis:      sessionQuestion.Analysis,
		State:         state,
	}, nil
}

func (service *Service) FinishSession(ctx context.Context, scope Scope, id int64) (PracticeSessionSummary, error) {
	return service.repo.FinishSession(ctx, scope, id)
}

func (service *Service) MarkMastered(ctx context.Context, scope Scope, questionID int64, value bool) (UserQuestionState, error) {
	return service.repo.SetQuestionState(ctx, scope, questionID, QuestionStateUpdate{Mastered: &value})
}

func (service *Service) MarkConfused(ctx context.Context, scope Scope, questionID int64, value bool) (UserQuestionState, error) {
	return service.repo.SetQuestionState(ctx, scope, questionID, QuestionStateUpdate{Confused: &value})
}

func (service *Service) ListStates(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionState], error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListStates(ctx, scope, filter)
}

func (service *Service) ListStateDetails(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionStateDetail], error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListStateDetails(ctx, scope, filter)
}

func (service *Service) candidates(ctx context.Context, scope Scope, input PracticeSessionInput) ([]QuestionCandidate, error) {
	candidates, err := service.repo.ListCandidates(ctx, scope, CandidateFilter{
		BankIDs:         input.BankIDs,
		CourseID:        input.CourseID,
		ExcludeMastered: input.ExcludeMastered,
	})
	if err != nil {
		return nil, err
	}
	if input.SourceMode == SourceModeCourse {
		candidates = dedupeQuestionCandidates(candidates)
	}
	if input.PracticeMode == PracticeModeRandom {
		seed := input.RandomSeed
		if seed == 0 {
			seed = time.Now().UnixNano()
		}
		rng := rand.New(rand.NewSource(seed))
		rng.Shuffle(len(candidates), func(i int, j int) {
			candidates[i], candidates[j] = candidates[j], candidates[i]
		})
	}
	return candidates, nil
}

func (service *Service) sessionCandidates(ctx context.Context, scope Scope, detail PracticeSessionDetail) ([]QuestionCandidate, error) {
	seed := detail.RandomSeed + int64(detail.RoundNo-1)
	if detail.SourceMode == "question_list" {
		questionIDs := anyInt64Slice(detail.BankScope["question_ids"])
		if len(questionIDs) == 0 {
			return []QuestionCandidate{}, nil
		}
		candidates, err := service.repo.ListCandidatesByQuestionIDs(ctx, scope, questionIDs, detail.ExcludeMastered)
		if err != nil {
			return nil, err
		}
		if detail.PracticeMode == PracticeModeRandom {
			rng := rand.New(rand.NewSource(seed))
			rng.Shuffle(len(candidates), func(i int, j int) {
				candidates[i], candidates[j] = candidates[j], candidates[i]
			})
		}
		return candidates, nil
	}
	if detail.SourceMode == SourceModeCourse {
		if detail.CourseID == nil || *detail.CourseID <= 0 {
			return nil, ErrInvalidInput
		}
		return service.candidates(ctx, scope, PracticeSessionInput{
			PracticeMode:    detail.PracticeMode,
			SourceMode:      detail.SourceMode,
			FlowMode:        detail.FlowMode,
			CourseID:        detail.CourseID,
			BankIDs:         detail.BankIDs,
			ExcludeMastered: detail.ExcludeMastered,
			RandomSeed:      seed,
		})
	}
	return service.candidates(ctx, scope, PracticeSessionInput{
		PracticeMode:    detail.PracticeMode,
		FlowMode:        detail.FlowMode,
		BankIDs:         detail.BankIDs,
		ExcludeMastered: detail.ExcludeMastered,
		RandomSeed:      seed,
	})
}

func dedupeQuestionCandidates(candidates []QuestionCandidate) []QuestionCandidate {
	if len(candidates) < 2 {
		return append([]QuestionCandidate{}, candidates...)
	}
	seen := make(map[int64]struct{}, len(candidates))
	unique := make([]QuestionCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if _, ok := seen[candidate.QuestionID]; ok {
			continue
		}
		seen[candidate.QuestionID] = struct{}{}
		unique = append(unique, candidate)
	}
	return unique
}

func normalizeSessionInput(input PracticeSessionInput) PracticeSessionInput {
	if input.PracticeMode == "" {
		input.PracticeMode = PracticeModeRandom
	}
	if input.SourceMode == "" {
		if len(input.BankIDs) > 1 {
			input.SourceMode = SourceModeMultiBank
		} else {
			input.SourceMode = SourceModeSingleBank
		}
	}
	if input.FlowMode == "" {
		input.FlowMode = FlowModeFixedCount
	}
	if input.FlowMode == FlowModeFixedCount && input.QuestionCount <= 0 {
		input.QuestionCount = 10
	}
	if input.RandomSeed == 0 {
		input.RandomSeed = time.Now().Unix()
	}
	return input
}

func normalizeFromQuestionsInput(input PracticeSessionFromQuestionsInput) PracticeSessionFromQuestionsInput {
	if input.PracticeMode == "" {
		input.PracticeMode = PracticeModeRandom
	}
	if input.FlowMode == "" {
		input.FlowMode = FlowModeFixedCount
	}
	if input.QuestionCount <= 0 {
		input.QuestionCount = 10
	}
	if input.RandomSeed == 0 {
		input.RandomSeed = time.Now().Unix()
	}
	return input
}

func limitCandidates(candidates []QuestionCandidate, count int) []QuestionCandidate {
	if count <= 0 || count > len(candidates) {
		count = len(candidates)
	}
	return append([]QuestionCandidate{}, candidates[:count]...)
}

func buildSessionQuestions(candidates []QuestionCandidate, startOrder int, roundNo int) []PracticeSessionQuestion {
	questions := make([]PracticeSessionQuestion, 0, len(candidates))
	for index, candidate := range candidates {
		questions = append(questions, buildSessionQuestion(candidate, startOrder+index, roundNo))
	}
	return questions
}

func buildSessionQuestion(candidate QuestionCandidate, displayOrder int, roundNo int) PracticeSessionQuestion {
	return PracticeSessionQuestion{
		QuestionID:        candidate.QuestionID,
		QuestionVersionID: candidate.QuestionVersionID,
		DisplayOrder:      displayOrder,
		QuestionType:      candidate.QuestionType,
		Content:           candidate.Content,
		Answer:            candidate.Answer,
		Analysis:          candidate.Analysis,
		RoundNo:           roundNo,
	}
}

func judgeAnswer(correctAnswer map[string]any, submitted map[string]any) (bool, error) {
	mode, _ := correctAnswer["judge_mode"].(string)
	switch mode {
	case "by_option_key":
		return sameStringSet(asStringSlice(correctAnswer["correct_keys"]), asStringSlice(submitted["selected_keys"])), nil
	case "boolean":
		correctValue, ok := asBool(correctAnswer["correct_value"])
		if !ok {
			return false, ErrInvalidInput
		}
		submittedValue, ok := asBool(submitted["value"])
		if !ok {
			return false, ErrInvalidInput
		}
		return correctValue == submittedValue, nil
	default:
		return false, ErrInvalidInput
	}
}

func asStringSlice(value any) []string {
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

func asBool(value any) (bool, bool) {
	switch typed := value.(type) {
	case bool:
		return typed, true
	default:
		return false, false
	}
}

func sameStringSet(left []string, right []string) bool {
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

func hasSubmittedAnswer(correctAnswer map[string]any, submitted map[string]any) bool {
	if len(submitted) == 0 {
		return false
	}
	mode, _ := correctAnswer["judge_mode"].(string)
	switch mode {
	case "by_option_key":
		return len(asStringSlice(submitted["selected_keys"])) > 0
	case "boolean":
		_, ok := asBool(submitted["value"])
		return ok
	default:
		return true
	}
}

func isNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}
