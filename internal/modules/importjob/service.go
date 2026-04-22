package importjob

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) TemplateContent(importType string) ([]byte, string, error) {
	name, ok := templateFileName(importType)
	if !ok {
		return nil, "", ErrNotFound
	}
	path, err := findTemplatePath(name)
	if err != nil {
		return nil, "", err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	return content, name, nil
}

func (service *Service) CreateImportJob(ctx context.Context, scope Scope, input ImportJobInput) (ImportJob, error) {
	input.ImportType = strings.TrimSpace(input.ImportType)
	input.TemplateVersion = strings.TrimSpace(input.TemplateVersion)
	if input.TemplateVersion == "" {
		input.TemplateVersion = "v1"
	}
	input.FileURL = strings.TrimSpace(input.FileURL)
	if !isSupportedImportType(input.ImportType) || input.FileURL == "" || strings.TrimSpace(input.Content) == "" {
		return ImportJob{}, ErrInvalidInput
	}

	now := time.Now()
	job, err := service.repo.CreateJob(ctx, ImportJob{
		TenantID:        scope.TenantID,
		ImportType:      input.ImportType,
		TemplateVersion: input.TemplateVersion,
		FileAssetID:     input.FileAssetID,
		FileURL:         input.FileURL,
		Status:          StatusUploaded,
		OperatorID:      scope.UserID,
		StartedAt:       &now,
	})
	if err != nil {
		return ImportJob{}, err
	}

	rows := make([]ImportJobRow, 0)
	parsedRows, err := parseCSVRows(input.ImportType, input.Content)
	if err != nil {
		finished := time.Now()
		job.Status = StatusFailed
		job.ErrorSummary = "CSV 模板解析失败"
		job.FinishedAt = &finished
		return service.repo.UpdateJobWithRows(ctx, job, rows)
	}

	for _, dataRow := range parsedRows {
		row := service.importRow(ctx, scope, job.ID, input.ImportType, dataRow)
		rows = append(rows, row)
	}

	job.TotalRows = len(rows)
	for _, row := range rows {
		switch row.Status {
		case RowStatusSuccess:
			job.SuccessRows++
		case RowStatusFailed:
			job.FailedRows++
		}
	}
	job.Status = finalStatus(job.TotalRows, job.SuccessRows, job.FailedRows)
	if job.FailedRows > 0 {
		job.ErrorSummary = strconv.Itoa(job.FailedRows) + " 行导入失败"
	}
	finished := time.Now()
	job.FinishedAt = &finished
	return service.repo.UpdateJobWithRows(ctx, job, rows)
}

func (service *Service) ListJobs(ctx context.Context, scope Scope, filter ImportJobListFilter) (PageResult[ImportJob], error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListJobs(ctx, scope.TenantID, filter)
}

func (service *Service) GetJob(ctx context.Context, scope Scope, id int64) (ImportJob, error) {
	return service.repo.GetJob(ctx, scope.TenantID, id)
}

func (service *Service) ListRows(ctx context.Context, scope Scope, jobID int64, filter ImportJobRowFilter) (PageResult[ImportJobRow], error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListRows(ctx, scope.TenantID, jobID, filter)
}

func (service *Service) importRow(ctx context.Context, scope Scope, jobID int64, importType string, dataRow csvDataRow) ImportJobRow {
	row := ImportJobRow{
		JobID:   jobID,
		RowNo:   dataRow.RowNo,
		RawData: rawAny(dataRow.Raw),
		Status:  RowStatusFailed,
	}
	switch importType {
	case ImportTypeQuestionBank:
		return service.importQuestionBankRow(ctx, scope, row, dataRow.Raw)
	case ImportTypeQuestion:
		return service.importQuestionRow(ctx, scope, row, dataRow.Raw)
	default:
		return failRow(row, ErrorUnsupportedImport, "导入类型不支持")
	}
}

func (service *Service) importQuestionBankRow(ctx context.Context, scope Scope, row ImportJobRow, raw map[string]string) ImportJobRow {
	normalized, failure := normalizeBankRow(raw)
	if failure != nil {
		return failRow(row, failure.Code, failure.Message)
	}
	var courseID *int64
	if normalized.CourseName != "" {
		course, err := service.repo.FindCourseByName(ctx, scope.TenantID, normalized.CourseName)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return failRow(row, ErrorCourseNotFound, "课程不存在")
			}
			return failRow(row, ErrorBusinessWriteError, "课程查询失败")
		}
		courseID = &course.ID
		normalized.NormalizedData["course_id"] = course.ID
	}
	id, err := service.repo.CreateQuestionBank(ctx, ImportedQuestionBank{
		TenantID:       scope.TenantID,
		OwnerOrgType:   OwnerOrgTypeSchool,
		OwnerOrgID:     scope.TenantID,
		CreatorID:      scope.UserID,
		CourseID:       courseID,
		Name:           normalized.Name,
		Description:    normalized.Description,
		Status:         normalized.Status,
		SourceType:     SourceTypeImport,
		NormalizedData: normalized.NormalizedData,
	})
	if err != nil {
		return failRow(row, ErrorBusinessWriteError, "题库写入失败")
	}
	row.Status = RowStatusSuccess
	row.NormalizedData = normalized.NormalizedData
	row.TargetEntityType = TargetQuestionBank
	row.TargetEntityID = &id
	return row
}

func (service *Service) importQuestionRow(ctx context.Context, scope Scope, row ImportJobRow, raw map[string]string) ImportJobRow {
	normalized, failure := normalizeQuestionRow(raw)
	if failure != nil {
		return failRow(row, failure.Code, failure.Message)
	}
	bank, err := service.repo.FindQuestionBankByName(ctx, scope.TenantID, normalized.BankName)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return failRow(row, ErrorBankNotFound, "题库不存在")
		}
		return failRow(row, ErrorBusinessWriteError, "题库查询失败")
	}
	normalized.NormalizedData["bank_id"] = bank.ID

	id, err := service.repo.CreateQuestion(ctx, ImportedQuestion{
		TenantID:       scope.TenantID,
		OwnerOrgType:   OwnerOrgTypeSchool,
		OwnerOrgID:     scope.TenantID,
		CreatorID:      scope.UserID,
		QuestionType:   normalized.QuestionType,
		Difficulty:     normalized.Difficulty,
		Content:        normalized.Content,
		Answer:         normalized.Answer,
		Analysis:       normalized.Analysis,
		BankIDs:        []int64{bank.ID},
		SourceType:     SourceTypeImport,
		StructureHash:  buildStructureHash(normalized.QuestionType, normalized.Content, normalized.Answer),
		NormalizedData: normalized.NormalizedData,
	})
	if err != nil {
		return failRow(row, ErrorBusinessWriteError, "题目写入失败")
	}
	row.Status = RowStatusSuccess
	row.NormalizedData = normalized.NormalizedData
	row.TargetEntityType = TargetQuestion
	row.TargetEntityID = &id
	return row
}

func failRow(row ImportJobRow, code string, message string) ImportJobRow {
	row.Status = RowStatusFailed
	row.ErrorCode = code
	row.ErrorMessage = message
	return row
}

func finalStatus(totalRows int, successRows int, failedRows int) string {
	if totalRows == 0 || successRows == 0 {
		return StatusFailed
	}
	if failedRows > 0 {
		return StatusPartialSuccess
	}
	return StatusSuccess
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

func templateFileName(importType string) (string, bool) {
	switch importType {
	case ImportTypeQuestion:
		return "15_question_import_template.csv", true
	case ImportTypeQuestionBank:
		return "16_bank_import_template.csv", true
	case ImportTypeExam:
		return "17_exam_import_template.csv", true
	default:
		return "", false
	}
}

func findTemplatePath(name string) (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(wd, "docs", "templates", name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			break
		}
		wd = parent
	}
	return "", ErrNotFound
}
