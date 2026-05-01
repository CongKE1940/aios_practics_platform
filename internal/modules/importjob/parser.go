package importjob

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

var orgStructureHeaders = []string{
	"object_type",
	"school_code",
	"school_name",
	"grade_code",
	"grade_name",
	"grade_level",
	"school_year",
	"class_code",
	"class_name",
	"class_no",
	"status",
}

var adminHeaders = []string{"username", "display_name", "phone", "email", "role_codes", "initial_password", "status"}

var teacherHeaders = []string{
	"username",
	"display_name",
	"teacher_no",
	"phone",
	"email",
	"school_code",
	"grade_code",
	"class_code",
	"course_code",
	"is_head_teacher",
	"role_codes",
	"initial_password",
	"hired_at",
	"status",
}

var courseHeaders = []string{"course_code", "course_name", "start_at", "end_at", "description", "status"}

var studentHeaders = []string{
	"username",
	"display_name",
	"student_no",
	"phone",
	"email",
	"school_code",
	"grade_code",
	"class_code",
	"role_codes",
	"initial_password",
	"entered_at",
	"status",
}

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

var examPaperHeaders = []string{
	"paper_name",
	"paper_type",
	"question_id",
	"question_version_id",
	"score",
	"display_order",
	"status",
}

type csvDataRow struct {
	RowNo int
	Raw   map[string]string
}

type rowFailure struct {
	Code    string
	Message string
}

type normalizedOrgStructureRow struct {
	ObjectType     int
	SchoolCode     string
	SchoolName     string
	GradeCode      string
	GradeName      string
	GradeLevel     int
	SchoolYear     string
	ClassCode      string
	ClassName      string
	ClassNo        *int
	Status         string
	NormalizedData map[string]any
}

type normalizedCourseRow struct {
	Code           string
	Name           string
	StartAt        *time.Time
	EndAt          *time.Time
	Description    string
	Status         string
	NormalizedData map[string]any
}

type normalizedUserRow struct {
	Username        string
	DisplayName     string
	Phone           string
	Email           string
	RoleCodes       []string
	InitialPassword string
	Status          string
	SchoolCode      string
	GradeCode       string
	ClassCode       string
	CourseCode      string
	TeacherNo       string
	StudentNo       string
	IsHeadTeacher   bool
	EffectiveAt     *time.Time
	NormalizedData  map[string]any
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

type normalizedExamPaperRow struct {
	PaperName         string
	PaperType         string
	QuestionID        int64
	QuestionVersionID *int64
	Score             float64
	DisplayOrder      int
	Status            string
	NormalizedData    map[string]any
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

func normalizeOrgStructureRow(raw map[string]string) (normalizedOrgStructureRow, *rowFailure) {
	schoolCode := strings.TrimSpace(raw["school_code"])
	schoolName := strings.TrimSpace(raw["school_name"])
	if schoolCode == "" || schoolName == "" {
		return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorRequiredField, Message: "学校/组织编码和名称不能为空"}
	}
	objectType, failure := parseObjectType(raw["object_type"])
	if failure != nil {
		return normalizedOrgStructureRow{}, failure
	}
	status := normalizeActiveStatus(raw["status"])
	if status == "" {
		return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorInvalidStatus, Message: "状态仅支持 active 或 disabled"}
	}
	gradeCode := strings.TrimSpace(raw["grade_code"])
	gradeName := strings.TrimSpace(raw["grade_name"])
	gradeLevel := 0
	if gradeCode != "" || gradeName != "" || strings.TrimSpace(raw["grade_level"]) != "" {
		if gradeCode == "" || gradeName == "" {
			return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorRequiredField, Message: "年级编码和名称不能为空"}
		}
		parsed, ok := parsePositiveInt(raw["grade_level"])
		if !ok {
			return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorInvalidNumber, Message: "年级层级必须为正整数"}
		}
		gradeLevel = parsed
	}
	classCode := strings.TrimSpace(raw["class_code"])
	className := strings.TrimSpace(raw["class_name"])
	var classNo *int
	if strings.TrimSpace(raw["class_no"]) != "" {
		parsed, ok := parsePositiveInt(raw["class_no"])
		if !ok {
			return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorInvalidNumber, Message: "班级序号必须为正整数"}
		}
		classNo = &parsed
	}
	if classCode != "" || className != "" || classNo != nil {
		if gradeCode == "" || gradeName == "" {
			return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorRequiredField, Message: "导入班级时必须提供年级信息"}
		}
		if classCode == "" || className == "" {
			return normalizedOrgStructureRow{}, &rowFailure{Code: ErrorRequiredField, Message: "班级编码和名称不能为空"}
		}
	}
	normalized := map[string]any{
		"object_type": objectType,
		"school_code": schoolCode,
		"school_name": schoolName,
		"grade_code":  gradeCode,
		"grade_name":  gradeName,
		"grade_level": gradeLevel,
		"school_year": strings.TrimSpace(raw["school_year"]),
		"class_code":  classCode,
		"class_name":  className,
		"status":      status,
	}
	if classNo != nil {
		normalized["class_no"] = *classNo
	}
	return normalizedOrgStructureRow{
		ObjectType:     objectType,
		SchoolCode:     schoolCode,
		SchoolName:     schoolName,
		GradeCode:      gradeCode,
		GradeName:      gradeName,
		GradeLevel:     gradeLevel,
		SchoolYear:     strings.TrimSpace(raw["school_year"]),
		ClassCode:      classCode,
		ClassName:      className,
		ClassNo:        classNo,
		Status:         status,
		NormalizedData: normalized,
	}, nil
}

func normalizeCourseRow(raw map[string]string) (normalizedCourseRow, *rowFailure) {
	code := strings.TrimSpace(raw["course_code"])
	name := strings.TrimSpace(raw["course_name"])
	if code == "" || name == "" {
		return normalizedCourseRow{}, &rowFailure{Code: ErrorRequiredField, Message: "课程编码和名称不能为空"}
	}
	status := normalizeActiveStatus(raw["status"])
	if status == "" {
		return normalizedCourseRow{}, &rowFailure{Code: ErrorInvalidStatus, Message: "状态仅支持 active 或 disabled"}
	}
	startAt, failure := parseOptionalDateTime(raw["start_at"], "开始时间格式错误")
	if failure != nil {
		return normalizedCourseRow{}, failure
	}
	endAt, failure := parseOptionalDateTime(raw["end_at"], "结束时间格式错误")
	if failure != nil {
		return normalizedCourseRow{}, failure
	}
	normalized := map[string]any{
		"course_code": code,
		"course_name": name,
		"description": strings.TrimSpace(raw["description"]),
		"status":      status,
	}
	if startAt != nil {
		normalized["start_at"] = startAt.Format("2006-01-02 15:04:05")
	}
	if endAt != nil {
		normalized["end_at"] = endAt.Format("2006-01-02 15:04:05")
	}
	return normalizedCourseRow{
		Code:           code,
		Name:           name,
		StartAt:        startAt,
		EndAt:          endAt,
		Description:    strings.TrimSpace(raw["description"]),
		Status:         status,
		NormalizedData: normalized,
	}, nil
}

func normalizeAdminRow(raw map[string]string) (normalizedUserRow, *rowFailure) {
	return normalizeUserBaseRow(raw, "")
}

func normalizeTeacherRow(raw map[string]string) (normalizedUserRow, *rowFailure) {
	normalized, failure := normalizeUserBaseRow(raw, "hired_at")
	if failure != nil {
		return normalizedUserRow{}, failure
	}
	normalized.TeacherNo = strings.TrimSpace(raw["teacher_no"])
	normalized.SchoolCode = strings.TrimSpace(raw["school_code"])
	normalized.GradeCode = strings.TrimSpace(raw["grade_code"])
	normalized.ClassCode = strings.TrimSpace(raw["class_code"])
	normalized.CourseCode = strings.TrimSpace(raw["course_code"])
	normalized.IsHeadTeacher = parseBool(raw["is_head_teacher"])
	if normalized.TeacherNo == "" || normalized.SchoolCode == "" {
		return normalizedUserRow{}, &rowFailure{Code: ErrorRequiredField, Message: "教师工号和学校编码不能为空"}
	}
	if normalized.CourseCode != "" && (normalized.GradeCode == "" || normalized.ClassCode == "") {
		return normalizedUserRow{}, &rowFailure{Code: ErrorRequiredField, Message: "教师任课导入必须提供年级编码和班级编码"}
	}
	normalized.NormalizedData["teacher_no"] = normalized.TeacherNo
	normalized.NormalizedData["school_code"] = normalized.SchoolCode
	normalized.NormalizedData["grade_code"] = normalized.GradeCode
	normalized.NormalizedData["class_code"] = normalized.ClassCode
	normalized.NormalizedData["course_code"] = normalized.CourseCode
	normalized.NormalizedData["is_head_teacher"] = normalized.IsHeadTeacher
	return normalized, nil
}

func normalizeStudentRow(raw map[string]string) (normalizedUserRow, *rowFailure) {
	normalized, failure := normalizeUserBaseRow(raw, "entered_at")
	if failure != nil {
		return normalizedUserRow{}, failure
	}
	normalized.StudentNo = strings.TrimSpace(raw["student_no"])
	normalized.SchoolCode = strings.TrimSpace(raw["school_code"])
	normalized.GradeCode = strings.TrimSpace(raw["grade_code"])
	normalized.ClassCode = strings.TrimSpace(raw["class_code"])
	if normalized.StudentNo == "" || normalized.SchoolCode == "" || normalized.GradeCode == "" || normalized.ClassCode == "" {
		return normalizedUserRow{}, &rowFailure{Code: ErrorRequiredField, Message: "学生学号、学校编码、年级编码和班级编码不能为空"}
	}
	normalized.NormalizedData["student_no"] = normalized.StudentNo
	normalized.NormalizedData["school_code"] = normalized.SchoolCode
	normalized.NormalizedData["grade_code"] = normalized.GradeCode
	normalized.NormalizedData["class_code"] = normalized.ClassCode
	return normalized, nil
}

func normalizeUserBaseRow(raw map[string]string, dateField string) (normalizedUserRow, *rowFailure) {
	username := strings.TrimSpace(raw["username"])
	displayName := strings.TrimSpace(raw["display_name"])
	if username == "" || displayName == "" {
		return normalizedUserRow{}, &rowFailure{Code: ErrorRequiredField, Message: "用户名和姓名不能为空"}
	}
	initialPassword := strings.TrimSpace(raw["initial_password"])
	if len([]rune(initialPassword)) < 8 {
		return normalizedUserRow{}, &rowFailure{Code: ErrorInvalidPassword, Message: "初始密码至少需要 8 位"}
	}
	status := normalizeActiveStatus(raw["status"])
	if status == "" {
		return normalizedUserRow{}, &rowFailure{Code: ErrorInvalidStatus, Message: "状态仅支持 active 或 disabled"}
	}
	var effectiveAt *time.Time
	if dateField != "" {
		parsed, failure := parseOptionalDateTime(raw[dateField], "日期格式错误")
		if failure != nil {
			return normalizedUserRow{}, failure
		}
		effectiveAt = parsed
	}
	normalized := map[string]any{
		"username":     username,
		"display_name": displayName,
		"phone":        strings.TrimSpace(raw["phone"]),
		"email":        strings.TrimSpace(raw["email"]),
		"role_codes":   splitTags(raw["role_codes"]),
		"status":       status,
	}
	if effectiveAt != nil {
		normalized[dateField] = effectiveAt.Format("2006-01-02 15:04:05")
	}
	return normalizedUserRow{
		Username:        username,
		DisplayName:     displayName,
		Phone:           strings.TrimSpace(raw["phone"]),
		Email:           strings.TrimSpace(raw["email"]),
		RoleCodes:       splitTags(raw["role_codes"]),
		InitialPassword: initialPassword,
		Status:          status,
		EffectiveAt:     effectiveAt,
		NormalizedData:  normalized,
	}, nil
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

func normalizeExamPaperRow(raw map[string]string) (normalizedExamPaperRow, *rowFailure) {
	paperName := strings.TrimSpace(raw["paper_name"])
	if paperName == "" {
		return normalizedExamPaperRow{}, &rowFailure{Code: ErrorRequiredField, Message: "试卷名称不能为空"}
	}
	paperType := strings.TrimSpace(raw["paper_type"])
	if paperType == "" {
		paperType = "fixed"
	}
	if paperType != "fixed" {
		return normalizedExamPaperRow{}, &rowFailure{Code: ErrorInvalidStatus, Message: "试卷导入当前仅支持 fixed"}
	}
	questionID, ok := parsePositiveInt64(raw["question_id"])
	if !ok {
		return normalizedExamPaperRow{}, &rowFailure{Code: ErrorInvalidNumber, Message: "题目 ID 必须为正整数"}
	}
	var versionID *int64
	if strings.TrimSpace(raw["question_version_id"]) != "" {
		parsed, ok := parsePositiveInt64(raw["question_version_id"])
		if !ok {
			return normalizedExamPaperRow{}, &rowFailure{Code: ErrorInvalidNumber, Message: "题目版本 ID 必须为正整数"}
		}
		versionID = &parsed
	}
	score, ok := parsePositiveFloat(raw["score"])
	if !ok {
		return normalizedExamPaperRow{}, &rowFailure{Code: ErrorInvalidNumber, Message: "分值必须为正数"}
	}
	displayOrder, ok := parsePositiveInt(raw["display_order"])
	if !ok {
		return normalizedExamPaperRow{}, &rowFailure{Code: ErrorInvalidNumber, Message: "题目序号必须为正整数"}
	}
	status := strings.TrimSpace(raw["status"])
	if status == "" {
		status = "draft"
	}
	if status != "draft" && status != "published" {
		return normalizedExamPaperRow{}, &rowFailure{Code: ErrorInvalidStatus, Message: "试卷状态仅支持 draft 或 published"}
	}
	normalized := map[string]any{
		"paper_name":    paperName,
		"paper_type":    paperType,
		"question_id":   questionID,
		"score":         score,
		"display_order": displayOrder,
		"status":        status,
	}
	if versionID != nil {
		normalized["question_version_id"] = *versionID
	}
	return normalizedExamPaperRow{
		PaperName:         paperName,
		PaperType:         paperType,
		QuestionID:        questionID,
		QuestionVersionID: versionID,
		Score:             score,
		DisplayOrder:      displayOrder,
		Status:            status,
		NormalizedData:    normalized,
	}, nil
}

func expectedHeaders(importType string) []string {
	switch importType {
	case ImportTypeOrgStructure:
		return orgStructureHeaders
	case ImportTypeAdmin:
		return adminHeaders
	case ImportTypeTeacher:
		return teacherHeaders
	case ImportTypeCourse:
		return courseHeaders
	case ImportTypeStudent:
		return studentHeaders
	case ImportTypeQuestionBank:
		return bankHeaders
	case ImportTypeQuestion:
		return questionHeaders
	case ImportTypeExam, ImportTypeExamPaper:
		return examPaperHeaders
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
		if key == "initial_password" && strings.TrimSpace(value) != "" {
			result[key] = "***"
			continue
		}
		result[key] = value
	}
	return result
}

func parseObjectType(value string) (int, *rowFailure) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "school", "1", "学校":
		return 1, nil
	case "organization", "org", "2", "组织":
		return 2, nil
	default:
		return 0, &rowFailure{Code: ErrorInvalidStatus, Message: "组织类型仅支持 school 或 organization"}
	}
}

func normalizeActiveStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "active", "启用":
		return "active"
	case "disabled", "disable", "停用":
		return "disabled"
	default:
		return ""
	}
}

func parsePositiveInt(value string) (int, bool) {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
}

func parsePositiveInt64(value string) (int64, bool) {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
}

func parsePositiveFloat(value string) (float64, bool) {
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil || parsed <= 0 {
		return 0, false
	}
	return parsed, true
}

func parseOptionalDateTime(value string, message string) (*time.Time, *rowFailure) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02",
		time.RFC3339,
	}
	for _, layout := range layouts {
		parsed, err := time.ParseInLocation(layout, trimmed, time.Local)
		if err == nil {
			return &parsed, nil
		}
	}
	return nil, &rowFailure{Code: ErrorInvalidDateTime, Message: message}
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "是":
		return true
	default:
		return false
	}
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
