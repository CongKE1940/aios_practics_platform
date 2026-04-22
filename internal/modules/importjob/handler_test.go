package importjob

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_TemplateDownloadAndQuestionBankImport(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryImportRepository()
	repo.courses[1] = map[string]CourseRef{"数学": {ID: 100, Name: "数学"}}
	router := newImportTestRouter(repo, fakeImportParser{
		claims: auth.AccessClaims{
			UserID:      9,
			TenantID:    1,
			Permissions: []string{"import:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	templateRec := performImportRequest(router, http.MethodGet, "/api/v1/import/templates/question", nil, "token")
	if templateRec.Code != http.StatusOK {
		t.Fatalf("template status = %d, body = %s", templateRec.Code, templateRec.Body.String())
	}
	if !strings.Contains(templateRec.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("content-type = %q", templateRec.Header().Get("Content-Type"))
	}
	if !strings.Contains(templateRec.Body.String(), "bank_name") {
		t.Fatalf("template body = %q", templateRec.Body.String())
	}

	body := map[string]any{
		"import_type":      ImportTypeQuestionBank,
		"template_version": "v1",
		"file_asset_id":    5,
		"file_url":         "/api/v1/files/5/content",
		"content":          "bank_name,owner_scope_type,owner_scope_name,course_name,description,status\n阶段2题库,,,数学,说明,active\n错误题库,,,不存在课程,说明,draft\n",
	}
	createRec := performImportRequest(router, http.MethodPost, "/api/v1/import/jobs", body, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", createRec.Code, createRec.Body.String())
	}

	var created importEnvelope[ImportJob]
	decodeImportBody(t, createRec, &created)
	if created.Data.Status != StatusPartialSuccess {
		t.Fatalf("job status = %q", created.Data.Status)
	}
	if created.Data.TotalRows != 2 || created.Data.SuccessRows != 1 || created.Data.FailedRows != 1 {
		t.Fatalf("job counters = %+v", created.Data)
	}
	if len(repo.createdBanks) != 1 {
		t.Fatalf("created bank count = %d", len(repo.createdBanks))
	}
	if repo.createdBanks[0].CourseID == nil || *repo.createdBanks[0].CourseID != 100 {
		t.Fatalf("created bank course_id = %+v", repo.createdBanks[0].CourseID)
	}

	rowsRec := performImportRequest(router, http.MethodGet, "/api/v1/import/jobs/"+strconv.FormatInt(created.Data.ID, 10)+"/rows", nil, "token")
	if rowsRec.Code != http.StatusOK {
		t.Fatalf("rows status = %d, body = %s", rowsRec.Code, rowsRec.Body.String())
	}
	var rows importEnvelope[PageResult[ImportJobRow]]
	decodeImportBody(t, rowsRec, &rows)
	if len(rows.Data.Items) != 2 {
		t.Fatalf("row count = %d", len(rows.Data.Items))
	}
	if rows.Data.Items[0].Status != RowStatusSuccess || rows.Data.Items[0].TargetEntityType != TargetQuestionBank {
		t.Fatalf("first row = %+v", rows.Data.Items[0])
	}
	if rows.Data.Items[1].Status != RowStatusFailed || rows.Data.Items[1].ErrorCode != ErrorCourseNotFound {
		t.Fatalf("second row = %+v", rows.Data.Items[1])
	}
}

func TestHandler_QuestionImportCreatesQuestionAndRecordsUnknownBank(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryImportRepository()
	repo.banks[1] = map[string]QuestionBankRef{"阶段2题库": {ID: 200, Name: "阶段2题库"}}
	router := newImportTestRouter(repo, fakeImportParser{
		claims: auth.AccessClaims{
			UserID:      9,
			TenantID:    1,
			Permissions: []string{"import:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	body := map[string]any{
		"import_type":      ImportTypeQuestion,
		"template_version": "v1",
		"file_url":         "/api/v1/files/6/content",
		"content":          "bank_name,course_name,question_type,stem_type,stem_content,option_a,option_b,option_c,option_d,option_e,option_f,correct_options,analysis,difficulty,system_tags\n阶段2题库,,single_choice,text,1+1等于几？,1,2,,,,,B,基础解析,medium,计算\n未知题库,,single_choice,text,2+2等于几？,3,4,,,,,B,基础解析,easy,计算\n",
	}
	createRec := performImportRequest(router, http.MethodPost, "/api/v1/import/jobs", body, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", createRec.Code, createRec.Body.String())
	}

	var created importEnvelope[ImportJob]
	decodeImportBody(t, createRec, &created)
	if created.Data.Status != StatusPartialSuccess {
		t.Fatalf("job status = %q", created.Data.Status)
	}
	if len(repo.createdQuestions) != 1 {
		t.Fatalf("created question count = %d", len(repo.createdQuestions))
	}
	question := repo.createdQuestions[0]
	if question.QuestionType != "single_choice" || len(question.BankIDs) != 1 || question.BankIDs[0] != 200 {
		t.Fatalf("created question = %+v", question)
	}
	if question.Content["stem"].(map[string]any)["text"] != "1+1等于几？" {
		t.Fatalf("question content = %+v", question.Content)
	}

	rowsRec := performImportRequest(router, http.MethodGet, "/api/v1/import/jobs/"+strconv.FormatInt(created.Data.ID, 10)+"/rows?status=failed", nil, "token")
	var rows importEnvelope[PageResult[ImportJobRow]]
	decodeImportBody(t, rowsRec, &rows)
	if len(rows.Data.Items) != 1 {
		t.Fatalf("failed row count = %d", len(rows.Data.Items))
	}
	if rows.Data.Items[0].ErrorCode != ErrorBankNotFound {
		t.Fatalf("failed row error = %+v", rows.Data.Items[0])
	}
}

func TestHandler_ImportRequiresPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newImportTestRouter(newMemoryImportRepository(), fakeImportParser{
		claims: auth.AccessClaims{
			UserID:      9,
			TenantID:    1,
			Permissions: []string{"question:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performImportRequest(router, http.MethodGet, "/api/v1/import/jobs", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandler_ImportRejectsCrossTenantAccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryImportRepository()
	repo.courses[1] = map[string]CourseRef{"数学": {ID: 100, Name: "数学"}}
	tenantOneRouter := newImportTestRouter(repo, fakeImportParser{
		claims: auth.AccessClaims{UserID: 9, TenantID: 1, Permissions: []string{"import:manage"}, TokenType: auth.TokenTypeAccess},
	})
	createRec := performImportRequest(tenantOneRouter, http.MethodPost, "/api/v1/import/jobs", map[string]any{
		"import_type":      ImportTypeQuestionBank,
		"template_version": "v1",
		"file_url":         "/api/v1/files/5/content",
		"content":          "bank_name,owner_scope_type,owner_scope_name,course_name,description,status\n阶段2题库,,,数学,说明,active\n",
	}, "token")
	if createRec.Code != http.StatusOK {
		t.Fatalf("create status = %d", createRec.Code)
	}
	var created importEnvelope[ImportJob]
	decodeImportBody(t, createRec, &created)

	tenantTwoRouter := newImportTestRouter(repo, fakeImportParser{
		claims: auth.AccessClaims{UserID: 10, TenantID: 2, Permissions: []string{"import:manage"}, TokenType: auth.TokenTypeAccess},
	})
	detailRec := performImportRequest(tenantTwoRouter, http.MethodGet, "/api/v1/import/jobs/"+strconv.FormatInt(created.Data.ID, 10), nil, "token")
	if detailRec.Code != http.StatusNotFound {
		t.Fatalf("detail status = %d, body = %s", detailRec.Code, detailRec.Body.String())
	}
}

type importEnvelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeImportParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeImportParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

func newImportTestRouter(repo *memoryImportRepository, parser fakeImportParser) http.Handler {
	handler := NewHandler(NewService(repo), parser)
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)
	return router
}

type memoryImportRepository struct {
	nextJobID        int64
	nextRowID        int64
	nextBankID       int64
	nextQuestionID   int64
	jobs             map[int64]ImportJob
	rows             map[int64][]ImportJobRow
	courses          map[int64]map[string]CourseRef
	banks            map[int64]map[string]QuestionBankRef
	createdBanks     []ImportedQuestionBank
	createdQuestions []ImportedQuestion
}

func newMemoryImportRepository() *memoryImportRepository {
	return &memoryImportRepository{
		nextJobID:      1,
		nextRowID:      1,
		nextBankID:     1000,
		nextQuestionID: 2000,
		jobs:           map[int64]ImportJob{},
		rows:           map[int64][]ImportJobRow{},
		courses:        map[int64]map[string]CourseRef{},
		banks:          map[int64]map[string]QuestionBankRef{},
	}
}

func (repo *memoryImportRepository) CreateJob(_ context.Context, job ImportJob) (ImportJob, error) {
	job.ID = repo.nextJobID
	repo.nextJobID++
	repo.jobs[job.ID] = job
	return job, nil
}

func (repo *memoryImportRepository) UpdateJobWithRows(_ context.Context, job ImportJob, rows []ImportJobRow) (ImportJob, error) {
	if _, ok := repo.jobs[job.ID]; !ok {
		return ImportJob{}, ErrNotFound
	}
	repo.jobs[job.ID] = job
	for index := range rows {
		rows[index].ID = repo.nextRowID
		repo.nextRowID++
		rows[index].JobID = job.ID
	}
	repo.rows[job.ID] = append([]ImportJobRow{}, rows...)
	return job, nil
}

func (repo *memoryImportRepository) ListJobs(_ context.Context, tenantID int64, filter ImportJobListFilter) (PageResult[ImportJob], error) {
	items := make([]ImportJob, 0)
	for _, job := range repo.jobs {
		if job.TenantID != tenantID {
			continue
		}
		if filter.ImportType != "" && job.ImportType != filter.ImportType {
			continue
		}
		if filter.Status != "" && job.Status != filter.Status {
			continue
		}
		items = append(items, job)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryImportRepository) GetJob(_ context.Context, tenantID int64, id int64) (ImportJob, error) {
	job, ok := repo.jobs[id]
	if !ok || job.TenantID != tenantID {
		return ImportJob{}, ErrNotFound
	}
	return job, nil
}

func (repo *memoryImportRepository) ListRows(_ context.Context, tenantID int64, jobID int64, filter ImportJobRowFilter) (PageResult[ImportJobRow], error) {
	if _, err := repo.GetJob(context.Background(), tenantID, jobID); err != nil {
		return PageResult[ImportJobRow]{}, err
	}
	items := make([]ImportJobRow, 0)
	for _, row := range repo.rows[jobID] {
		if filter.Status != "" && row.Status != filter.Status {
			continue
		}
		items = append(items, row)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryImportRepository) FindCourseByName(_ context.Context, tenantID int64, name string) (CourseRef, error) {
	if item, ok := repo.courses[tenantID][name]; ok {
		return item, nil
	}
	return CourseRef{}, ErrNotFound
}

func (repo *memoryImportRepository) FindQuestionBankByName(_ context.Context, tenantID int64, name string) (QuestionBankRef, error) {
	if item, ok := repo.banks[tenantID][name]; ok {
		return item, nil
	}
	return QuestionBankRef{}, ErrNotFound
}

func (repo *memoryImportRepository) CreateQuestionBank(_ context.Context, bank ImportedQuestionBank) (int64, error) {
	id := repo.nextBankID
	repo.nextBankID++
	bank.ID = id
	repo.createdBanks = append(repo.createdBanks, bank)
	if repo.banks[bank.TenantID] == nil {
		repo.banks[bank.TenantID] = map[string]QuestionBankRef{}
	}
	repo.banks[bank.TenantID][bank.Name] = QuestionBankRef{ID: id, Name: bank.Name}
	return id, nil
}

func (repo *memoryImportRepository) CreateQuestion(_ context.Context, question ImportedQuestion) (int64, error) {
	id := repo.nextQuestionID
	repo.nextQuestionID++
	question.ID = id
	repo.createdQuestions = append(repo.createdQuestions, question)
	return id, nil
}

func performImportRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodeImportBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}
