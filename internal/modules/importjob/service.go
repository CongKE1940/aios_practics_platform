package importjob

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"aios_practice_platform/internal/modules/fileasset"
)

type Service struct {
	repo      Repository
	fileRepo  fileasset.Repository
	fileStore fileasset.ContentStore
}

type ServiceOption func(*Service)

func WithFileAssets(repo fileasset.Repository, store fileasset.ContentStore) ServiceOption {
	return func(service *Service) {
		service.fileRepo = repo
		service.fileStore = store
	}
}

func NewService(repo Repository, options ...ServiceOption) *Service {
	service := &Service{repo: repo}
	for _, option := range options {
		option(service)
	}
	return service
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
	input.Content = strings.TrimSpace(input.Content)
	if !isSupportedImportType(input.ImportType) {
		return ImportJob{}, ErrInvalidInput
	}
	if input.Content == "" && input.FileAssetID != nil {
		content, err := service.readUploadedImportContent(ctx, scope.TenantID, *input.FileAssetID)
		if err != nil {
			return ImportJob{}, err
		}
		input.Content = strings.TrimSpace(content)
		if input.FileURL == "" {
			input.FileURL = fmt.Sprintf("/api/v1/files/%d/content", *input.FileAssetID)
		}
	}
	if input.FileURL == "" && input.FileAssetID == nil {
		return ImportJob{}, ErrInvalidInput
	}
	if input.Content == "" {
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
	return service.repo.ListJobs(ctx, readTenantID(scope), filter)
}

func (service *Service) GetJob(ctx context.Context, scope Scope, id int64) (ImportJob, error) {
	return service.repo.GetJob(ctx, readTenantID(scope), id)
}

func (service *Service) ListRows(ctx context.Context, scope Scope, jobID int64, filter ImportJobRowFilter) (PageResult[ImportJobRow], error) {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return service.repo.ListRows(ctx, readTenantID(scope), jobID, filter)
}

func (service *Service) FailureReport(ctx context.Context, scope Scope, jobID int64) (FailureReport, error) {
	if _, err := service.repo.GetJob(ctx, readTenantID(scope), jobID); err != nil {
		return FailureReport{}, err
	}
	rows, err := service.listAllRows(ctx, readTenantID(scope), jobID, RowStatusFailed)
	if err != nil {
		return FailureReport{}, err
	}
	buffer := &bytes.Buffer{}
	buffer.WriteString("\xEF\xBB\xBF")
	writer := csv.NewWriter(buffer)
	_ = writer.Write([]string{"row_no", "error_code", "error_message", "raw_data"})
	for _, row := range rows {
		rawJSON, _ := json.Marshal(row.RawData)
		_ = writer.Write([]string{strconv.Itoa(row.RowNo), row.ErrorCode, row.ErrorMessage, string(rawJSON)})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return FailureReport{}, err
	}
	return FailureReport{
		Filename: fmt.Sprintf("import_job_%d_failure_report.csv", jobID),
		Content:  buffer.Bytes(),
	}, nil
}

func (service *Service) RollbackJob(ctx context.Context, scope Scope, jobID int64) (ImportJob, error) {
	job, err := service.repo.GetJob(ctx, readTenantID(scope), jobID)
	if err != nil {
		return ImportJob{}, err
	}
	if job.Status != StatusSuccess && job.Status != StatusPartialSuccess {
		return ImportJob{}, ErrInvalidInput
	}
	rows, err := service.listAllRows(ctx, readTenantID(scope), jobID, RowStatusSuccess)
	if err != nil {
		return ImportJob{}, err
	}
	return service.repo.RollbackJob(ctx, readTenantID(scope), jobID, rows)
}

func (service *Service) readUploadedImportContent(ctx context.Context, tenantID int64, fileAssetID int64) (string, error) {
	if fileAssetID <= 0 || service.fileRepo == nil || service.fileStore == nil {
		return "", ErrInvalidInput
	}
	asset, err := service.fileRepo.GetByID(ctx, tenantID, fileAssetID)
	if err != nil {
		if errors.Is(err, fileasset.ErrNotFound) {
			return "", ErrNotFound
		}
		return "", err
	}
	if asset.SourceType != fileasset.SourceTypeUpload || asset.ObjectKey == "" {
		return "", ErrInvalidInput
	}
	reader, err := service.fileStore.Open(ctx, asset.ObjectKey)
	if err != nil {
		if errors.Is(err, fileasset.ErrNotFound) {
			return "", ErrNotFound
		}
		return "", err
	}
	defer reader.Close()
	content, err := io.ReadAll(io.LimitReader(reader, 20*1024*1024+1))
	if err != nil {
		return "", err
	}
	if len(content) > 20*1024*1024 {
		return "", ErrInvalidInput
	}
	return string(content), nil
}

func (service *Service) listAllRows(ctx context.Context, tenantID int64, jobID int64, status string) ([]ImportJobRow, error) {
	result := make([]ImportJobRow, 0)
	for page := 1; ; page++ {
		rows, err := service.repo.ListRows(ctx, tenantID, jobID, ImportJobRowFilter{Status: status, Page: page, PageSize: 100})
		if err != nil {
			return nil, err
		}
		result = append(result, rows.Items...)
		if len(result) >= rows.Total || len(rows.Items) == 0 {
			return result, nil
		}
	}
}

func readTenantID(scope Scope) int64 {
	if scope.UserType == "sys_admin" {
		return 0
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" || permission == "tenant:manage" {
			return 0
		}
	}
	return scope.TenantID
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
		SystemTags:     append([]string{}, normalized.SystemTags...),
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
