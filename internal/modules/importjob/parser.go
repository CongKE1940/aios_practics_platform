package importjob

import (
	"encoding/csv"
	"fmt"
	"io"
	"strings"
)

var bankHeaders = []string{"bank_name", "owner_scope_type", "owner_scope_name", "course_name", "description", "status"}

var questionHeaders = []string{
	"bank_name",
	"course_name",
	"question_type",
	"stem_type",
	"stem_content",
	"option_a",
	"option_b",
	"option_c",
	"option_d",
	"option_e",
	"option_f",
	"correct_options",
	"analysis",
	"difficulty",
	"system_tags",
}

type csvDataRow struct {
	RowNo int
	Raw   map[string]string
}

type rowFailure struct {
	Code    string
	Message string
}

type normalizedBankRow struct {
	Name           string
	CourseName     string
	Description    string
	Status         string
	NormalizedData map[string]any
}

type normalizedQuestionRow struct {
	BankName       string
	QuestionType   string
	Difficulty     string
	Content        map[string]any
	Answer         map[string]any
	Analysis       map[string]any
	SystemTags     []string
	NormalizedData map[string]any
}

func parseCSVRows(importType string, content string) ([]csvDataRow, error) {
	reader := csv.NewReader(strings.NewReader(content))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("%w: CSV 内容为空", ErrInvalidInput)
	}
	header = normalizeHeader(header)
	expected := expectedHeaders(importType)
	if len(expected) == 0 || !sameHeaders(header, expected) {
		return nil, fmt.Errorf("%w: CSV 表头不匹配", ErrInvalidInput)
	}

	rows := make([]csvDataRow, 0)
	physicalRow := 1
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		physicalRow++
		if err != nil {
			return nil, fmt.Errorf("%w: 第 %d 行 CSV 格式错误", ErrInvalidInput, physicalRow)
		}
		raw := make(map[string]string, len(expected))
		for index, key := range expected {
			value := ""
			if index < len(record) {
				value = strings.TrimSpace(record[index])
			}
			raw[key] = value
		}
		if isEmptyCSVRow(raw) {
			continue
		}
		rows = append(rows, csvDataRow{RowNo: physicalRow, Raw: raw})
	}
	return rows, nil
}

func normalizeBankRow(raw map[string]string) (normalizedBankRow, *rowFailure) {
	name := strings.TrimSpace(raw["bank_name"])
	if name == "" {
		return normalizedBankRow{}, &rowFailure{Code: ErrorRequiredField, Message: "题库名称不能为空"}
	}
	status := strings.TrimSpace(raw["status"])
	if status == "" {
		status = "draft"
	}
	if status != "draft" && status != "active" {
		return normalizedBankRow{}, &rowFailure{Code: ErrorInvalidStatus, Message: "题库状态仅支持 draft 或 active"}
	}

	normalized := map[string]any{
		"bank_name":        name,
		"owner_scope_type": strings.TrimSpace(raw["owner_scope_type"]),
		"owner_scope_name": strings.TrimSpace(raw["owner_scope_name"]),
		"course_name":      strings.TrimSpace(raw["course_name"]),
		"description":      strings.TrimSpace(raw["description"]),
		"status":           status,
	}
	return normalizedBankRow{
		Name:           name,
		CourseName:     strings.TrimSpace(raw["course_name"]),
		Description:    strings.TrimSpace(raw["description"]),
		Status:         status,
		NormalizedData: normalized,
	}, nil
}

func normalizeQuestionRow(raw map[string]string) (normalizedQuestionRow, *rowFailure) {
	bankName := strings.TrimSpace(raw["bank_name"])
	if bankName == "" {
		return normalizedQuestionRow{}, &rowFailure{Code: ErrorRequiredField, Message: "题库名称不能为空"}
	}
	questionType := strings.TrimSpace(raw["question_type"])
	if !isAllowedQuestionType(questionType) {
		return normalizedQuestionRow{}, &rowFailure{Code: ErrorInvalidQuestion, Message: "题型仅支持 single_choice、multiple_choice 或 true_false"}
	}
	stemContent := strings.TrimSpace(raw["stem_content"])
	if stemContent == "" {
		return normalizedQuestionRow{}, &rowFailure{Code: ErrorRequiredField, Message: "题干不能为空"}
	}
	difficulty := strings.TrimSpace(raw["difficulty"])
	if difficulty == "" {
		difficulty = "medium"
	}
	if !isAllowedDifficulty(difficulty) {
		return normalizedQuestionRow{}, &rowFailure{Code: ErrorInvalidDifficulty, Message: "难度仅支持 easy、medium 或 hard"}
	}

	stemType := strings.TrimSpace(raw["stem_type"])
	if stemType == "" {
		stemType = "text"
	}
	options := buildOptions(raw)
	answer, failure := buildAnswer(questionType, raw["correct_options"], options)
	if failure != nil {
		return normalizedQuestionRow{}, failure
	}

	systemTags := splitTags(raw["system_tags"])
	content := map[string]any{
		"stem": map[string]any{
			"content_type": stemType,
			"text":         stemContent,
			"assets":       []any{},
		},
		"option_order_randomizable": true,
		"ext": map[string]any{
			"system_tags": systemTags,
		},
	}
	if len(options) > 0 {
		content["options"] = options
	}

	analysis := map[string]any{}
	if text := strings.TrimSpace(raw["analysis"]); text != "" {
		analysis["text"] = text
	}

	normalized := map[string]any{
		"bank_name":     bankName,
		"course_name":   strings.TrimSpace(raw["course_name"]),
		"question_type": questionType,
		"stem_type":     stemType,
		"stem_content":  stemContent,
		"answer":        answer,
		"difficulty":    difficulty,
		"system_tags":   systemTags,
	}

	return normalizedQuestionRow{
		BankName:       bankName,
		QuestionType:   questionType,
		Difficulty:     difficulty,
		Content:        content,
		Answer:         answer,
		Analysis:       analysis,
		SystemTags:     systemTags,
		NormalizedData: normalized,
	}, nil
}

func expectedHeaders(importType string) []string {
	switch importType {
	case ImportTypeQuestionBank:
		return bankHeaders
	case ImportTypeQuestion:
		return questionHeaders
	default:
		return nil
	}
}

func normalizeHeader(header []string) []string {
	result := make([]string, len(header))
	for index, value := range header {
		trimmed := strings.TrimSpace(value)
		if index == 0 {
			trimmed = strings.TrimPrefix(trimmed, "\ufeff")
		}
		result[index] = trimmed
	}
	return result
}

func sameHeaders(actual []string, expected []string) bool {
	if len(actual) != len(expected) {
		return false
	}
	for index := range expected {
		if actual[index] != expected[index] {
			return false
		}
	}
	return true
}

func isEmptyCSVRow(raw map[string]string) bool {
	for _, value := range raw {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func rawAny(raw map[string]string) map[string]any {
	result := make(map[string]any, len(raw))
	for key, value := range raw {
		result[key] = value
	}
	return result
}

func buildOptions(raw map[string]string) []map[string]any {
	keys := []string{"A", "B", "C", "D", "E", "F"}
	options := make([]map[string]any, 0, len(keys))
	for _, key := range keys {
		value := strings.TrimSpace(raw["option_"+strings.ToLower(key)])
		if value == "" {
			continue
		}
		options = append(options, map[string]any{
			"key":          key,
			"content_type": "text",
			"text":         value,
			"assets":       []any{},
		})
	}
	return options
}

func buildAnswer(questionType string, correctOptions string, options []map[string]any) (map[string]any, *rowFailure) {
	switch questionType {
	case "single_choice":
		keys := splitOptionKeys(correctOptions)
		if len(options) < 2 {
			return nil, &rowFailure{Code: ErrorInvalidAnswer, Message: "单选题至少需要两个选项"}
		}
		if len(keys) != 1 || !optionExists(options, keys[0]) {
			return nil, &rowFailure{Code: ErrorInvalidAnswer, Message: "单选题答案必须是一个存在的选项"}
		}
		return map[string]any{"judge_mode": "by_option_key", "correct_keys": keys}, nil
	case "multiple_choice":
		keys := splitOptionKeys(correctOptions)
		if len(options) < 2 {
			return nil, &rowFailure{Code: ErrorInvalidAnswer, Message: "多选题至少需要两个选项"}
		}
		if len(keys) < 2 {
			return nil, &rowFailure{Code: ErrorInvalidAnswer, Message: "多选题答案至少需要两个选项"}
		}
		for _, key := range keys {
			if !optionExists(options, key) {
				return nil, &rowFailure{Code: ErrorInvalidAnswer, Message: "多选题答案包含不存在的选项"}
			}
		}
		return map[string]any{"judge_mode": "by_option_key", "correct_keys": keys}, nil
	case "true_false":
		value, ok := parseTrueFalseAnswer(correctOptions)
		if !ok {
			return nil, &rowFailure{Code: ErrorInvalidAnswer, Message: "判断题答案仅支持 true、false、A 或 B"}
		}
		return map[string]any{"judge_mode": "boolean", "correct_value": value}, nil
	default:
		return nil, &rowFailure{Code: ErrorInvalidQuestion, Message: "题型不支持"}
	}
}

func splitOptionKeys(value string) []string {
	normalized := strings.NewReplacer("，", ",", "；", ",", ";", ",", " ", ",", "|", ",").Replace(value)
	parts := strings.Split(normalized, ",")
	keys := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		key := strings.ToUpper(strings.TrimSpace(part))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	return keys
}

func optionExists(options []map[string]any, key string) bool {
	for _, option := range options {
		if option["key"] == key {
			return true
		}
	}
	return false
}

func parseTrueFalseAnswer(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "t", "yes", "y", "1", "a":
		return true, true
	case "false", "f", "no", "n", "0", "b":
		return false, true
	default:
		return false, false
	}
}

func splitTags(value string) []string {
	normalized := strings.NewReplacer("，", ",", "；", ",", ";", ",", "|", ",").Replace(value)
	parts := strings.Split(normalized, ",")
	tags := make([]string, 0, len(parts))
	for _, part := range parts {
		tag := strings.TrimSpace(part)
		if tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func isAllowedQuestionType(questionType string) bool {
	switch strings.TrimSpace(questionType) {
	case "single_choice", "multiple_choice", "true_false":
		return true
	default:
		return false
	}
}

func isAllowedDifficulty(difficulty string) bool {
	switch strings.TrimSpace(difficulty) {
	case "easy", "medium", "hard":
		return true
	default:
		return false
	}
}
