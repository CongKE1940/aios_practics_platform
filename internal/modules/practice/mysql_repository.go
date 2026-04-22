package practice

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListCandidates(ctx context.Context, scope Scope, input CandidateFilter) ([]QuestionCandidate, error) {
	if input.CourseID != nil {
		query := `
SELECT
  qbq.question_bank_id,
  q.id,
  q.current_version_id,
  q.question_type,
  qv.content_json,
  qv.answer_json,
  qv.analysis_json
FROM question_bank_questions qbq
JOIN question_banks qb ON qb.id = qbq.question_bank_id
JOIN questions q ON q.id = qbq.question_id
JOIN question_versions qv ON qv.id = q.current_version_id
LEFT JOIN user_question_states uqs ON uqs.tenant_id = q.tenant_id AND uqs.user_id = ? AND uqs.question_id = q.id
WHERE qb.tenant_id = ?
  AND qb.deleted_at IS NULL
  AND q.tenant_id = ?
  AND q.status = 'active'
  AND q.deleted_at IS NULL
  AND q.current_version_id IS NOT NULL
  AND qb.course_id = ?
`
		args := []any{scope.UserID, scope.TenantID, scope.TenantID, *input.CourseID}
		if input.ExcludeMastered {
			query += " AND COALESCE(uqs.is_mastered, 0) = 0"
		}
		query += " ORDER BY qbq.question_bank_id ASC, qbq.sort_no ASC, q.id ASC"

		rows, err := repo.db.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		return scanCandidates(rows)
	}
	if len(input.BankIDs) == 0 {
		return []QuestionCandidate{}, nil
	}
	query := `
SELECT
  qbq.question_bank_id,
  q.id,
  q.current_version_id,
  q.question_type,
  qv.content_json,
  qv.answer_json,
  qv.analysis_json
FROM question_bank_questions qbq
JOIN question_banks qb ON qb.id = qbq.question_bank_id
JOIN questions q ON q.id = qbq.question_id
JOIN question_versions qv ON qv.id = q.current_version_id
LEFT JOIN user_question_states uqs ON uqs.tenant_id = q.tenant_id AND uqs.user_id = ? AND uqs.question_id = q.id
WHERE qb.tenant_id = ?
  AND qb.deleted_at IS NULL
  AND q.tenant_id = ?
  AND q.status = 'active'
  AND q.deleted_at IS NULL
  AND q.current_version_id IS NOT NULL
  AND qbq.question_bank_id IN (` + placeholders(len(input.BankIDs)) + `)
`
	args := []any{scope.UserID, scope.TenantID, scope.TenantID}
	for _, bankID := range input.BankIDs {
		args = append(args, bankID)
	}
	if input.ExcludeMastered {
		query += " AND COALESCE(uqs.is_mastered, 0) = 0"
	}
	query += " ORDER BY qbq.question_bank_id ASC, qbq.sort_no ASC, q.id ASC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanCandidates(rows)
}

func (repo *MySQLRepository) CourseExists(ctx context.Context, tenantID int64, courseID int64) (bool, error) {
	const query = `
SELECT id
FROM courses
WHERE tenant_id = ? AND id = ? AND status = 'active' AND deleted_at IS NULL
LIMIT 1
`
	var id int64
	if err := repo.db.QueryRowContext(ctx, query, tenantID, courseID).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (repo *MySQLRepository) CreateSession(ctx context.Context, session PracticeSession, questions []PracticeSessionQuestion) (PracticeSessionDetail, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	defer tx.Rollback()

	bankScopeJSON, err := json.Marshal(session.BankScope)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	const insertSession = `
INSERT INTO practice_sessions (tenant_id, user_id, practice_mode, source_mode, course_id, bank_scope_json, status)
VALUES (?, ?, ?, ?, ?, ?, ?)
`
	result, err := tx.ExecContext(ctx, insertSession, session.TenantID, session.UserID, session.PracticeMode, session.SourceMode, nullInt64(session.CourseID), bankScopeJSON, session.Status)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	sessionID, err := result.LastInsertId()
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	if err := repo.insertSessionQuestions(ctx, tx, sessionID, questions); err != nil {
		return PracticeSessionDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return PracticeSessionDetail{}, err
	}
	return repo.GetSession(ctx, Scope{TenantID: session.TenantID, UserID: session.UserID}, sessionID)
}

func (repo *MySQLRepository) GetSession(ctx context.Context, scope Scope, id int64) (PracticeSessionDetail, error) {
	const query = `
SELECT id, tenant_id, user_id, practice_mode, source_mode, course_id, bank_scope_json, started_at, ended_at, status
FROM practice_sessions
WHERE id = ? AND tenant_id = ? AND user_id = ?
LIMIT 1
`
	var session PracticeSession
	var courseID sql.NullInt64
	var bankScopeJSON []byte
	var endedAt sql.NullTime
	if err := repo.db.QueryRowContext(ctx, query, id, scope.TenantID, scope.UserID).Scan(
		&session.ID,
		&session.TenantID,
		&session.UserID,
		&session.PracticeMode,
		&session.SourceMode,
		&courseID,
		&bankScopeJSON,
		&session.StartedAt,
		&endedAt,
		&session.Status,
	); err != nil {
		return PracticeSessionDetail{}, wrapNotFound(err)
	}
	if courseID.Valid {
		value := courseID.Int64
		session.CourseID = &value
	}
	if endedAt.Valid {
		value := endedAt.Time
		session.EndedAt = &value
	}
	if err := unmarshalMap(bankScopeJSON, &session.BankScope); err != nil {
		return PracticeSessionDetail{}, err
	}
	session.FlowMode, _ = session.BankScope["flow_mode"].(string)
	session.BankIDs = anyInt64Slice(session.BankScope["bank_ids"])
	session.ExcludeMastered, _ = session.BankScope["exclude_mastered"].(bool)
	session.QuestionCount = intFromAny(session.BankScope["question_count"])
	session.RandomSeed = int64FromAny(session.BankScope["random_seed"])
	session.RoundNo = intFromAny(session.BankScope["round_no"])
	if session.RoundNo <= 0 {
		session.RoundNo = 1
	}
	questions, err := repo.listSessionQuestions(ctx, id)
	if err != nil {
		return PracticeSessionDetail{}, err
	}
	return PracticeSessionDetail{PracticeSession: session, Questions: questions}, nil
}

func (repo *MySQLRepository) ListSessions(ctx context.Context, scope Scope, filter PracticeSessionListFilter) (PageResult[PracticeSessionListItem], error) {
	query := `
SELECT
  ps.id,
  ps.practice_mode,
  ps.source_mode,
  ps.course_id,
  ps.bank_scope_json,
  ps.started_at,
  ps.ended_at,
  ps.status,
  COUNT(psq.id) AS total_count,
  COUNT(pa.session_question_id) AS answered_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
  COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0) AS wrong_count
FROM practice_sessions ps
LEFT JOIN practice_session_questions psq ON psq.session_id = ps.id
LEFT JOIN (
  SELECT pa1.session_question_id, pa1.user_id, pa1.is_correct
  FROM practice_answers pa1
  JOIN (
    SELECT session_question_id, user_id, MAX(id) AS max_id
    FROM practice_answers
    GROUP BY session_question_id, user_id
  ) latest ON latest.max_id = pa1.id
) pa ON pa.session_question_id = psq.id AND pa.user_id = ps.user_id
WHERE ps.tenant_id = ? AND ps.user_id = ?
`
	args := []any{scope.TenantID, scope.UserID}
	if filter.Status != "" {
		query += " AND ps.status = ?"
		args = append(args, filter.Status)
	}
	if filter.PracticeMode != "" {
		query += " AND ps.practice_mode = ?"
		args = append(args, filter.PracticeMode)
	}
	if filter.CourseID != nil {
		query += " AND ps.course_id = ?"
		args = append(args, *filter.CourseID)
	}
	query += " GROUP BY ps.id, ps.practice_mode, ps.source_mode, ps.course_id, ps.bank_scope_json, ps.started_at, ps.ended_at, ps.status ORDER BY ps.started_at DESC, ps.id DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[PracticeSessionListItem]{}, err
	}
	defer rows.Close()

	items := make([]PracticeSessionListItem, 0)
	for rows.Next() {
		item, err := scanSessionListItem(rows)
		if err != nil {
			return PageResult[PracticeSessionListItem]{}, err
		}
		if filter.FlowMode != "" && item.FlowMode != filter.FlowMode {
			continue
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[PracticeSessionListItem]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) GetSessionResults(ctx context.Context, scope Scope, id int64) (PracticeSessionResults, error) {
	session, err := repo.GetSession(ctx, scope, id)
	if err != nil {
		return PracticeSessionResults{}, err
	}
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
			TotalCount:   len(session.Questions),
		},
		Questions: []PracticeSessionResultQuestion{},
	}
	for _, question := range session.Questions {
		answer, answered, err := repo.latestAnswer(ctx, scope.UserID, question.ID)
		if err != nil {
			return PracticeSessionResults{}, err
		}
		state, err := repo.getState(ctx, scope, question.QuestionID)
		if err != nil && !errors.Is(err, ErrNotFound) {
			return PracticeSessionResults{}, err
		}
		item := PracticeSessionResultQuestion{
			SessionQuestionID: question.ID,
			QuestionID:        question.QuestionID,
			QuestionVersionID: question.QuestionVersionID,
			DisplayOrder:      question.DisplayOrder,
			QuestionType:      question.QuestionType,
			Content:           question.Content,
			CorrectAnswer:     question.Answer,
			Analysis:          question.Analysis,
			State:             state,
		}
		if answered {
			item.Answer = answer.Answer
			item.IsCorrect = answer.IsCorrect
			result.Session.AnsweredCount++
			if answer.IsCorrect {
				result.Session.CorrectCount++
			} else {
				result.Session.WrongCount++
			}
		}
		result.Questions = append(result.Questions, item)
	}
	if result.Session.AnsweredCount > 0 {
		result.Session.Accuracy = float64(result.Session.CorrectCount) / float64(result.Session.AnsweredCount)
	}
	return result, nil
}

func (repo *MySQLRepository) ListCandidatesByQuestionIDs(ctx context.Context, scope Scope, questionIDs []int64, excludeMastered bool) ([]QuestionCandidate, error) {
	if len(questionIDs) == 0 {
		return []QuestionCandidate{}, nil
	}
	query := `
SELECT
  COALESCE(MIN(qb.id), 0) AS bank_id,
  q.id,
  q.current_version_id,
  q.question_type,
  qv.content_json,
  qv.answer_json,
  qv.analysis_json
FROM questions q
JOIN question_versions qv ON qv.id = q.current_version_id
LEFT JOIN question_bank_questions qbq ON qbq.question_id = q.id
LEFT JOIN question_banks qb ON qb.id = qbq.question_bank_id AND qb.tenant_id = q.tenant_id
LEFT JOIN user_question_states uqs ON uqs.tenant_id = q.tenant_id AND uqs.user_id = ? AND uqs.question_id = q.id
WHERE q.tenant_id = ?
  AND q.status = 'active'
  AND q.deleted_at IS NULL
  AND q.current_version_id IS NOT NULL
  AND q.id IN (` + placeholders(len(questionIDs)) + `)
`
	args := []any{scope.UserID, scope.TenantID}
	for _, questionID := range questionIDs {
		args = append(args, questionID)
	}
	if excludeMastered {
		query += " AND COALESCE(uqs.is_mastered, 0) = 0"
	}
	query += " GROUP BY q.id, q.current_version_id, q.question_type, qv.content_json, qv.answer_json, qv.analysis_json ORDER BY FIELD(q.id, " + placeholders(len(questionIDs)) + ")"
	for _, questionID := range questionIDs {
		args = append(args, questionID)
	}

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCandidates(rows)
}

func (repo *MySQLRepository) AddSessionQuestion(ctx context.Context, scope Scope, sessionID int64, question PracticeSessionQuestion) (PracticeSessionQuestion, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return PracticeSessionQuestion{}, err
	}
	defer tx.Rollback()
	if _, err := repo.getSessionForUpdate(ctx, tx, scope, sessionID); err != nil {
		return PracticeSessionQuestion{}, err
	}
	if err := repo.insertSessionQuestions(ctx, tx, sessionID, []PracticeSessionQuestion{question}); err != nil {
		return PracticeSessionQuestion{}, err
	}
	if err := tx.Commit(); err != nil {
		return PracticeSessionQuestion{}, err
	}
	questions, err := repo.listSessionQuestions(ctx, sessionID)
	if err != nil {
		return PracticeSessionQuestion{}, err
	}
	for _, item := range questions {
		if item.DisplayOrder == question.DisplayOrder {
			return item, nil
		}
	}
	return PracticeSessionQuestion{}, ErrNotFound
}

func (repo *MySQLRepository) FinishSession(ctx context.Context, scope Scope, id int64) (PracticeSessionSummary, error) {
	now := time.Now()
	const updateQuery = `
UPDATE practice_sessions
SET status = ?, ended_at = ?
WHERE id = ? AND tenant_id = ? AND user_id = ?
`
	result, err := repo.db.ExecContext(ctx, updateQuery, StatusFinished, now, id, scope.TenantID, scope.UserID)
	if err != nil {
		return PracticeSessionSummary{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return PracticeSessionSummary{}, err
	}
	if affected == 0 {
		return PracticeSessionSummary{}, ErrNotFound
	}

	const countQuery = `
SELECT
  COUNT(pa.session_question_id),
  COALESCE(SUM(CASE WHEN pa.is_correct = 1 THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN pa.is_correct = 0 THEN 1 ELSE 0 END), 0)
FROM (
  SELECT pa1.session_question_id, pa1.user_id, pa1.is_correct
  FROM practice_answers pa1
  JOIN (
    SELECT session_question_id, user_id, MAX(id) AS max_id
    FROM practice_answers
    GROUP BY session_question_id, user_id
  ) latest ON latest.max_id = pa1.id
) pa
WHERE pa.user_id = ? AND pa.session_question_id IN (SELECT id FROM practice_session_questions WHERE session_id = ?)
`
	summary := PracticeSessionSummary{ID: id, Status: StatusFinished}
	if err := repo.db.QueryRowContext(ctx, countQuery, scope.UserID, id).Scan(&summary.AnsweredCount, &summary.CorrectCount, &summary.WrongCount); err != nil {
		return PracticeSessionSummary{}, err
	}
	return summary, nil
}

func (repo *MySQLRepository) SaveAnswerAndState(ctx context.Context, scope Scope, answer PracticeAnswer, isCorrect bool) (UserQuestionState, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return UserQuestionState{}, err
	}
	defer tx.Rollback()
	answerJSON, err := json.Marshal(answer.Answer)
	if err != nil {
		return UserQuestionState{}, err
	}
	const insertAnswer = `
INSERT INTO practice_answers (session_question_id, user_id, question_id, question_version_id, answer_json, is_correct)
VALUES (?, ?, ?, ?, ?, ?)
`
	if _, err := tx.ExecContext(ctx, insertAnswer, answer.SessionQuestionID, scope.UserID, answer.QuestionID, answer.QuestionVersionID, answerJSON, isCorrect); err != nil {
		return UserQuestionState{}, err
	}
	resultText := "wrong"
	correctDelta := 0
	wrongDelta := 1
	var lastWrong any = time.Now()
	if isCorrect {
		resultText = "correct"
		correctDelta = 1
		wrongDelta = 0
		lastWrong = nil
	}
	const upsertState = `
INSERT INTO user_question_states (
  tenant_id, user_id, question_id, question_version_id, practice_correct_count, practice_wrong_count, last_wrong_at, last_answer_json, last_result
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  question_version_id = VALUES(question_version_id),
  practice_correct_count = practice_correct_count + VALUES(practice_correct_count),
  practice_wrong_count = practice_wrong_count + VALUES(practice_wrong_count),
  last_wrong_at = COALESCE(VALUES(last_wrong_at), last_wrong_at),
  last_answer_json = VALUES(last_answer_json),
  last_result = VALUES(last_result)
`
	if _, err := tx.ExecContext(ctx, upsertState, scope.TenantID, scope.UserID, answer.QuestionID, answer.QuestionVersionID, correctDelta, wrongDelta, lastWrong, answerJSON, resultText); err != nil {
		return UserQuestionState{}, err
	}
	if err := repo.insertStateLog(ctx, tx, scope.UserID, answer.QuestionID, "answer", answer.Answer); err != nil {
		return UserQuestionState{}, err
	}
	if err := tx.Commit(); err != nil {
		return UserQuestionState{}, err
	}
	return repo.getState(ctx, scope, answer.QuestionID)
}

func (repo *MySQLRepository) SetQuestionState(ctx context.Context, scope Scope, questionID int64, input QuestionStateUpdate) (UserQuestionState, error) {
	versionID, err := repo.latestQuestionVersion(ctx, scope.TenantID, questionID)
	if err != nil {
		return UserQuestionState{}, err
	}
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return UserQuestionState{}, err
	}
	defer tx.Rollback()
	const ensureState = `
INSERT INTO user_question_states (tenant_id, user_id, question_id, question_version_id)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE question_version_id = VALUES(question_version_id)
`
	if _, err := tx.ExecContext(ctx, ensureState, scope.TenantID, scope.UserID, questionID, versionID); err != nil {
		return UserQuestionState{}, err
	}
	if input.Mastered != nil {
		if err := repo.updateStateFlag(ctx, tx, scope, questionID, "is_mastered", "mastered_at", *input.Mastered); err != nil {
			return UserQuestionState{}, err
		}
		if err := repo.insertStateLog(ctx, tx, scope.UserID, questionID, "mark_mastered", map[string]any{"value": *input.Mastered}); err != nil {
			return UserQuestionState{}, err
		}
	}
	if input.Confused != nil {
		if err := repo.updateStateFlag(ctx, tx, scope, questionID, "is_confused", "confused_at", *input.Confused); err != nil {
			return UserQuestionState{}, err
		}
		if err := repo.insertStateLog(ctx, tx, scope.UserID, questionID, "mark_confused", map[string]any{"value": *input.Confused}); err != nil {
			return UserQuestionState{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return UserQuestionState{}, err
	}
	return repo.getState(ctx, scope, questionID)
}

func (repo *MySQLRepository) ListStates(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionState], error) {
	query := `
SELECT id, tenant_id, user_id, question_id, question_version_id, practice_correct_count, practice_wrong_count, exam_wrong_count, is_mastered, mastered_at, is_confused, confused_at, last_wrong_at, last_answer_json, last_result, updated_at
FROM user_question_states
WHERE tenant_id = ? AND user_id = ?
`
	args := []any{scope.TenantID, scope.UserID}
	switch filter.StateType {
	case StateTypeWrong:
		query += " AND practice_wrong_count > 0"
	case StateTypeMastered:
		query += " AND is_mastered = 1"
	case StateTypeConfused:
		query += " AND is_confused = 1"
	}
	if filter.BankID != nil {
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq JOIN question_banks qb ON qb.id = qbq.question_bank_id WHERE qbq.question_id = user_question_states.question_id AND qbq.question_bank_id = ? AND qb.tenant_id = ?)"
		args = append(args, *filter.BankID, scope.TenantID)
	}
	if filter.CourseID != nil {
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq JOIN question_banks qb ON qb.id = qbq.question_bank_id WHERE qbq.question_id = user_question_states.question_id AND qb.tenant_id = ? AND qb.deleted_at IS NULL AND qb.course_id = ?)"
		args = append(args, scope.TenantID, *filter.CourseID)
	}
	query += " ORDER BY updated_at DESC"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[UserQuestionState]{}, err
	}
	defer rows.Close()
	items := make([]UserQuestionState, 0)
	for rows.Next() {
		item, err := scanState(rows)
		if err != nil {
			return PageResult[UserQuestionState]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[UserQuestionState]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) ListStateDetails(ctx context.Context, scope Scope, filter UserQuestionStateFilter) (PageResult[UserQuestionStateDetail], error) {
	query := `
SELECT
  uqs.id, uqs.tenant_id, uqs.user_id, uqs.question_id, uqs.question_version_id,
  uqs.practice_correct_count, uqs.practice_wrong_count, uqs.exam_wrong_count,
  uqs.is_mastered, uqs.mastered_at, uqs.is_confused, uqs.confused_at,
  uqs.last_wrong_at, uqs.last_answer_json, uqs.last_result, uqs.updated_at,
  q.question_type, qv.content_json
FROM user_question_states uqs
JOIN questions q ON q.id = uqs.question_id AND q.tenant_id = uqs.tenant_id
JOIN question_versions qv ON qv.id = uqs.question_version_id
WHERE uqs.tenant_id = ? AND uqs.user_id = ?
`
	args := []any{scope.TenantID, scope.UserID}
	switch filter.StateType {
	case StateTypeWrong:
		query += " AND uqs.practice_wrong_count > 0"
	case StateTypeMastered:
		query += " AND uqs.is_mastered = 1"
	case StateTypeConfused:
		query += " AND uqs.is_confused = 1"
	}
	if filter.BankID != nil {
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq JOIN question_banks qb ON qb.id = qbq.question_bank_id WHERE qbq.question_id = uqs.question_id AND qbq.question_bank_id = ? AND qb.tenant_id = ?)"
		args = append(args, *filter.BankID, scope.TenantID)
	}
	if filter.CourseID != nil {
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq JOIN question_banks qb ON qb.id = qbq.question_bank_id WHERE qbq.question_id = uqs.question_id AND qb.tenant_id = ? AND qb.deleted_at IS NULL AND qb.course_id = ?)"
		args = append(args, scope.TenantID, *filter.CourseID)
	}
	query += " ORDER BY uqs.updated_at DESC"

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[UserQuestionStateDetail]{}, err
	}
	defer rows.Close()

	items := make([]UserQuestionStateDetail, 0)
	for rows.Next() {
		item, err := scanStateDetail(rows)
		if err != nil {
			return PageResult[UserQuestionStateDetail]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[UserQuestionStateDetail]{}, err
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) insertSessionQuestions(ctx context.Context, tx *sql.Tx, sessionID int64, questions []PracticeSessionQuestion) error {
	const query = `
INSERT INTO practice_session_questions (session_id, question_id, question_version_id, display_order, presented_options_json)
VALUES (?, ?, ?, ?, ?)
`
	for _, question := range questions {
		payload := map[string]any{
			"question_type": question.QuestionType,
			"content":       question.Content,
			"answer":        question.Answer,
			"analysis":      question.Analysis,
			"round_no":      question.RoundNo,
		}
		presentedJSON, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, query, sessionID, question.QuestionID, question.QuestionVersionID, question.DisplayOrder, presentedJSON); err != nil {
			return err
		}
	}
	return nil
}

func (repo *MySQLRepository) listSessionQuestions(ctx context.Context, sessionID int64) ([]PracticeSessionQuestion, error) {
	const query = `
SELECT psq.id, psq.session_id, psq.question_id, psq.question_version_id, psq.display_order, psq.presented_options_json, psq.created_at,
       EXISTS(SELECT 1 FROM practice_answers pa WHERE pa.session_question_id = psq.id) AS answered,
       (SELECT pa.is_correct FROM practice_answers pa WHERE pa.session_question_id = psq.id ORDER BY pa.id DESC LIMIT 1) AS is_correct
FROM practice_session_questions psq
WHERE psq.session_id = ?
ORDER BY psq.display_order ASC
`
	rows, err := repo.db.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]PracticeSessionQuestion, 0)
	for rows.Next() {
		var item PracticeSessionQuestion
		var presentedJSON []byte
		var answered bool
		var isCorrect sql.NullBool
		if err := rows.Scan(&item.ID, &item.SessionID, &item.QuestionID, &item.QuestionVersionID, &item.DisplayOrder, &presentedJSON, &item.CreatedAt, &answered, &isCorrect); err != nil {
			return nil, err
		}
		var payload map[string]any
		if err := unmarshalMap(presentedJSON, &payload); err != nil {
			return nil, err
		}
		item.QuestionType, _ = payload["question_type"].(string)
		item.Content = mapFromAny(payload["content"])
		item.Answer = mapFromAny(payload["answer"])
		item.Analysis = mapFromAny(payload["analysis"])
		item.RoundNo = intFromAny(payload["round_no"])
		if item.RoundNo <= 0 {
			item.RoundNo = 1
		}
		item.Answered = answered
		if isCorrect.Valid {
			value := isCorrect.Bool
			item.IsCorrect = &value
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (repo *MySQLRepository) getSessionForUpdate(ctx context.Context, tx *sql.Tx, scope Scope, id int64) (PracticeSession, error) {
	const query = `
SELECT id, tenant_id, user_id, practice_mode, source_mode, status
FROM practice_sessions
WHERE id = ? AND tenant_id = ? AND user_id = ?
FOR UPDATE
`
	var item PracticeSession
	if err := tx.QueryRowContext(ctx, query, id, scope.TenantID, scope.UserID).Scan(&item.ID, &item.TenantID, &item.UserID, &item.PracticeMode, &item.SourceMode, &item.Status); err != nil {
		return PracticeSession{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) insertStateLog(ctx context.Context, tx *sql.Tx, userID int64, questionID int64, actionType string, payload map[string]any) error {
	payloadJSON, err := nullableJSON(payload)
	if err != nil {
		return err
	}
	const query = `
INSERT INTO user_question_state_logs (user_id, question_id, source_type, action_type, payload_json)
VALUES (?, ?, 'practice', ?, ?)
`
	_, err = tx.ExecContext(ctx, query, userID, questionID, actionType, payloadJSON)
	return err
}

func (repo *MySQLRepository) latestQuestionVersion(ctx context.Context, tenantID int64, questionID int64) (int64, error) {
	const query = `
SELECT current_version_id
FROM questions
WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
LIMIT 1
`
	var versionID sql.NullInt64
	if err := repo.db.QueryRowContext(ctx, query, questionID, tenantID).Scan(&versionID); err != nil {
		return 0, wrapNotFound(err)
	}
	if !versionID.Valid {
		return 0, ErrNotFound
	}
	return versionID.Int64, nil
}

func (repo *MySQLRepository) updateStateFlag(ctx context.Context, tx *sql.Tx, scope Scope, questionID int64, flagColumn string, timeColumn string, value bool) error {
	timeValue := any(nil)
	if value {
		timeValue = time.Now()
	}
	query := "UPDATE user_question_states SET " + flagColumn + " = ?, " + timeColumn + " = ? WHERE tenant_id = ? AND user_id = ? AND question_id = ?"
	_, err := tx.ExecContext(ctx, query, value, timeValue, scope.TenantID, scope.UserID, questionID)
	return err
}

func (repo *MySQLRepository) getState(ctx context.Context, scope Scope, questionID int64) (UserQuestionState, error) {
	const query = `
SELECT id, tenant_id, user_id, question_id, question_version_id, practice_correct_count, practice_wrong_count, exam_wrong_count, is_mastered, mastered_at, is_confused, confused_at, last_wrong_at, last_answer_json, last_result, updated_at
FROM user_question_states
WHERE tenant_id = ? AND user_id = ? AND question_id = ?
LIMIT 1
`
	row := repo.db.QueryRowContext(ctx, query, scope.TenantID, scope.UserID, questionID)
	item, err := scanStateScanner(row)
	if err != nil {
		return UserQuestionState{}, wrapNotFound(err)
	}
	return item, nil
}

func scanState(rows *sql.Rows) (UserQuestionState, error) {
	return scanStateScanner(rows)
}

func scanCandidates(rows *sql.Rows) ([]QuestionCandidate, error) {
	items := make([]QuestionCandidate, 0)
	for rows.Next() {
		var item QuestionCandidate
		var contentJSON []byte
		var answerJSON []byte
		var analysisJSON []byte
		if err := rows.Scan(&item.BankID, &item.QuestionID, &item.QuestionVersionID, &item.QuestionType, &contentJSON, &answerJSON, &analysisJSON); err != nil {
			return nil, err
		}
		if err := unmarshalMap(contentJSON, &item.Content); err != nil {
			return nil, err
		}
		if err := unmarshalMap(answerJSON, &item.Answer); err != nil {
			return nil, err
		}
		if err := unmarshalMap(analysisJSON, &item.Analysis); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanSessionListItem(scanner interface{ Scan(dest ...any) error }) (PracticeSessionListItem, error) {
	var item PracticeSessionListItem
	var courseID sql.NullInt64
	var bankScopeJSON []byte
	var endedAt sql.NullTime
	if err := scanner.Scan(
		&item.ID,
		&item.PracticeMode,
		&item.SourceMode,
		&courseID,
		&bankScopeJSON,
		&item.StartedAt,
		&endedAt,
		&item.Status,
		&item.TotalCount,
		&item.AnsweredCount,
		&item.CorrectCount,
		&item.WrongCount,
	); err != nil {
		return PracticeSessionListItem{}, err
	}
	if endedAt.Valid {
		value := endedAt.Time
		item.EndedAt = &value
	}
	if courseID.Valid {
		value := courseID.Int64
		item.CourseID = &value
	}
	var scope map[string]any
	if err := unmarshalMap(bankScopeJSON, &scope); err != nil {
		return PracticeSessionListItem{}, err
	}
	item.FlowMode, _ = scope["flow_mode"].(string)
	item.BankIDs = anyInt64Slice(scope["bank_ids"])
	if item.AnsweredCount > 0 {
		item.Accuracy = float64(item.CorrectCount) / float64(item.AnsweredCount)
	}
	return item, nil
}

func (repo *MySQLRepository) latestAnswer(ctx context.Context, userID int64, sessionQuestionID int64) (PracticeAnswer, bool, error) {
	const query = `
SELECT id, session_question_id, user_id, question_id, question_version_id, answer_json, is_correct, answered_at
FROM practice_answers
WHERE user_id = ? AND session_question_id = ?
ORDER BY id DESC
LIMIT 1
`
	var item PracticeAnswer
	var answerJSON []byte
	if err := repo.db.QueryRowContext(ctx, query, userID, sessionQuestionID).Scan(
		&item.ID,
		&item.SessionQuestionID,
		&item.UserID,
		&item.QuestionID,
		&item.QuestionVersionID,
		&answerJSON,
		&item.IsCorrect,
		&item.AnsweredAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return PracticeAnswer{}, false, nil
		}
		return PracticeAnswer{}, false, err
	}
	if err := unmarshalMap(answerJSON, &item.Answer); err != nil {
		return PracticeAnswer{}, false, err
	}
	return item, true, nil
}

func scanStateScanner(scanner interface{ Scan(dest ...any) error }) (UserQuestionState, error) {
	var item UserQuestionState
	var masteredAt sql.NullTime
	var confusedAt sql.NullTime
	var lastWrongAt sql.NullTime
	var lastAnswerJSON []byte
	var lastResult sql.NullString
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.UserID,
		&item.QuestionID,
		&item.QuestionVersionID,
		&item.PracticeCorrectCount,
		&item.PracticeWrongCount,
		&item.ExamWrongCount,
		&item.IsMastered,
		&masteredAt,
		&item.IsConfused,
		&confusedAt,
		&lastWrongAt,
		&lastAnswerJSON,
		&lastResult,
		&item.UpdatedAt,
	)
	if err != nil {
		return UserQuestionState{}, err
	}
	if masteredAt.Valid {
		value := masteredAt.Time
		item.MasteredAt = &value
	}
	if confusedAt.Valid {
		value := confusedAt.Time
		item.ConfusedAt = &value
	}
	if lastWrongAt.Valid {
		value := lastWrongAt.Time
		item.LastWrongAt = &value
	}
	if len(lastAnswerJSON) > 0 {
		if err := unmarshalMap(lastAnswerJSON, &item.LastAnswer); err != nil {
			return UserQuestionState{}, err
		}
	}
	if lastResult.Valid {
		item.LastResult = lastResult.String
	}
	return item, nil
}

func scanStateDetail(scanner interface{ Scan(dest ...any) error }) (UserQuestionStateDetail, error) {
	var item UserQuestionStateDetail
	var masteredAt sql.NullTime
	var confusedAt sql.NullTime
	var lastWrongAt sql.NullTime
	var lastAnswerJSON []byte
	var lastResult sql.NullString
	var contentJSON []byte
	err := scanner.Scan(
		&item.ID,
		&item.TenantID,
		&item.UserID,
		&item.QuestionID,
		&item.QuestionVersionID,
		&item.PracticeCorrectCount,
		&item.PracticeWrongCount,
		&item.ExamWrongCount,
		&item.IsMastered,
		&masteredAt,
		&item.IsConfused,
		&confusedAt,
		&lastWrongAt,
		&lastAnswerJSON,
		&lastResult,
		&item.UpdatedAt,
		&item.QuestionType,
		&contentJSON,
	)
	if err != nil {
		return UserQuestionStateDetail{}, err
	}
	if masteredAt.Valid {
		value := masteredAt.Time
		item.MasteredAt = &value
	}
	if confusedAt.Valid {
		value := confusedAt.Time
		item.ConfusedAt = &value
	}
	if lastWrongAt.Valid {
		value := lastWrongAt.Time
		item.LastWrongAt = &value
	}
	if len(lastAnswerJSON) > 0 {
		if err := unmarshalMap(lastAnswerJSON, &item.LastAnswer); err != nil {
			return UserQuestionStateDetail{}, err
		}
	}
	if lastResult.Valid {
		item.LastResult = lastResult.String
	}
	if err := unmarshalMap(contentJSON, &item.Content); err != nil {
		return UserQuestionStateDetail{}, err
	}
	return item, nil
}

func nullableJSON(value map[string]any) (any, error) {
	if len(value) == 0 {
		return nil, nil
	}
	return json.Marshal(value)
}

func unmarshalMap(payload []byte, target *map[string]any) error {
	if len(payload) == 0 {
		*target = map[string]any{}
		return nil
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return err
	}
	if *target == nil {
		*target = map[string]any{}
	}
	return nil
}

func mapFromAny(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return map[string]any{}
}

func anyInt64Slice(value any) []int64 {
	switch typed := value.(type) {
	case []any:
		result := make([]int64, 0, len(typed))
		for _, item := range typed {
			if parsed := int64FromAny(item); parsed > 0 {
				result = append(result, parsed)
			}
		}
		return result
	case []int64:
		return append([]int64{}, typed...)
	default:
		return []int64{}
	}
}

func intFromAny(value any) int {
	return int(int64FromAny(value))
}

func int64FromAny(value any) int64 {
	switch typed := value.(type) {
	case int64:
		return typed
	case int:
		return int64(typed)
	case float64:
		return int64(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return parsed
	default:
		return 0
	}
}

func nullInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func wrapNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}

func placeholders(count int) string {
	parts := make([]string, count)
	for index := range parts {
		parts[index] = "?"
	}
	return strings.Join(parts, ", ")
}
