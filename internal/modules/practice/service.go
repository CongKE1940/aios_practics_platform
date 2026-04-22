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
	if len(input.BankIDs) == 0 {
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
		BankScope: map[string]any{
			"flow_mode":        input.FlowMode,
			"bank_ids":         input.BankIDs,
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

func (service *Service) NextQuestion(ctx context.Context, scope Scope, id int64) (NextQuestionResult, error) {
	detail, err := service.repo.GetSession(ctx, scope, id)
	if err != nil {
		return NextQuestionResult{}, err
	}
	if detail.Status != StatusActive {
		return NextQuestionResult{}, ErrInvalidInput
	}
	candidates, err := service.candidates(ctx, scope, PracticeSessionInput{
		PracticeMode:    detail.PracticeMode,
		FlowMode:        detail.FlowMode,
		BankIDs:         detail.BankIDs,
		ExcludeMastered: detail.ExcludeMastered,
		RandomSeed:      detail.RandomSeed + int64(detail.RoundNo-1),
	})
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

func (service *Service) candidates(ctx context.Context, scope Scope, input PracticeSessionInput) ([]QuestionCandidate, error) {
	candidates, err := service.repo.ListCandidates(ctx, scope, CandidateFilter{
		BankIDs:         input.BankIDs,
		ExcludeMastered: input.ExcludeMastered,
	})
	if err != nil {
		return nil, err
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

func isNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}
