package practice

import (
	"context"
	"database/sql"
	"encoding/json"
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
LEFT JOIN user_question_states uqs ON uqs.user_id = ? AND uqs.question_id = q.id
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
SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0), COALESCE(SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END), 0)
FROM practice_answers
WHERE user_id = ? AND session_question_id IN (SELECT id FROM practice_session_questions WHERE session_id = ?)
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
		query += " AND EXISTS (SELECT 1 FROM question_bank_questions qbq WHERE qbq.question_id = user_question_states.question_id AND qbq.question_bank_id = ?)"
		args = append(args, *filter.BankID)
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
