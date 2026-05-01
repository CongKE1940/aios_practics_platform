package importjob

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

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
	if created.Data.Status != StatusUploaded {
		t.Fatalf("created job status = %q", created.Data.Status)
	}
	processed := waitForImportJobStatus(t, repo, 1, created.Data.ID, StatusPartialSuccess)
	if processed.Status != StatusPartialSuccess {
		t.Fatalf("job status = %q", processed.Status)
	}
	if processed.TotalRows != 2 || processed.SuccessRows != 1 || processed.FailedRows != 1 {
		t.Fatalf("job counters = %+v", processed)
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
	created.Data = waitForImportJobStatus(t, repo, 1, created.Data.ID, StatusPartialSuccess)
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
	if len(question.SystemTags) != 1 || question.SystemTags[0] != "计算" {
		t.Fatalf("system tags = %+v", question.SystemTags)
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

	reportRec := performImportRequest(router, http.MethodGet, "/api/v1/import/jobs/"+strconv.FormatInt(created.Data.ID, 10)+"/failure-report", nil, "token")
	if reportRec.Code != http.StatusOK || !strings.Contains(reportRec.Body.String(), ErrorBankNotFound) {
		t.Fatalf("failure report status = %d, body = %s", reportRec.Code, reportRec.Body.String())
	}

	rollbackRec := performImportRequest(router, http.MethodPost, "/api/v1/import/jobs/"+strconv.FormatInt(created.Data.ID, 10)+"/rollback", nil, "token")
	if rollbackRec.Code != http.StatusOK {
		t.Fatalf("rollback status = %d, body = %s", rollbackRec.Code, rollbackRec.Body.String())
	}
	var rolledBack importEnvelope[ImportJob]
	decodeImportBody(t, rollbackRec, &rolledBack)
	if rolledBack.Data.Status != StatusRolledBack {
		t.Fatalf("rollback job = %+v", rolledBack.Data)
	}
}

func TestHandler_AsyncImportsExpandedDimensions(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryImportRepository()
	repo.roles[1] = map[string]int64{"school_admin": 7}
	router := newImportTestRouter(repo, fakeImportParser{
		claims: auth.AccessClaims{
			UserID:      9,
			TenantID:    1,
			Permissions: []string{"import:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	templateRec := performImportRequest(router, http.MethodGet, "/api/v1/import/templates/org_structure", nil, "token")
	if templateRec.Code != http.StatusOK || !strings.Contains(templateRec.Body.String(), "school_code") {
		t.Fatalf("template status = %d, body = %s", templateRec.Code, templateRec.Body.String())
	}

	orgJob := createImportJobAndWait(t, router, repo, map[string]any{
		"import_type": ImportTypeOrgStructure,
		"file_url":    "/api/v1/files/org.csv",
		"content":     "object_type,school_code,school_name,grade_code,grade_name,grade_level,school_year,class_code,class_name,class_no,status\nschool,school_demo,示例学校,g2026,一年级,1,2026,c101,一年级一班,1,active\n",
	})
	if orgJob.SuccessRows != 1 {
		t.Fatalf("org job = %+v", orgJob)
	}

	adminJob := createImportJobAndWait(t, router, repo, map[string]any{
		"import_type": ImportTypeAdmin,
		"file_url":    "/api/v1/files/admin.csv",
		"content":     "username,display_name,phone,email,role_codes,initial_password,status\nadmin_demo,示例管理员,13800000001,admin@example.com,school_admin,Aios@123456,active\n",
	})
	if adminJob.SuccessRows != 1 || len(repo.createdUsers) != 1 || repo.createdUsers[0].UserType != "school_admin" {
		t.Fatalf("admin import users = %+v job=%+v", repo.createdUsers, adminJob)
	}

	paperJob := createImportJobAndWait(t, router, repo, map[string]any{
		"import_type": ImportTypeExamPaper,
		"file_url":    "/api/v1/files/paper.csv",
		"content":     "paper_name,paper_type,question_id,question_version_id,score,display_order,status\n示例试卷,fixed,1,,5,1,draft\n",
	})
	if paperJob.SuccessRows != 1 || len(repo.createdPapers) != 1 {
		t.Fatalf("paper import = %+v job=%+v", repo.createdPapers, paperJob)
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
	mu               sync.Mutex
	nextJobID        int64
	nextRowID        int64
	nextSchoolID     int64
	nextGradeID      int64
	nextClassID      int64
	nextCourseID     int64
	nextUserID       int64
	nextPaperID      int64
	nextBankID       int64
	nextQuestionID   int64
	jobs             map[int64]ImportJob
	rows             map[int64][]ImportJobRow
	schools          map[int64]map[string]int64
	grades           map[int64]map[string]int64
	classes          map[int64]map[string]int64
	courses          map[int64]map[string]CourseRef
	banks            map[int64]map[string]QuestionBankRef
	roles            map[int64]map[string]int64
	createdBanks     []ImportedQuestionBank
	createdQuestions []ImportedQuestion
	createdUsers     []ImportedUser
	createdPapers    []ImportedExamPaperQuestion
}

func newMemoryImportRepository() *memoryImportRepository {
	return &memoryImportRepository{
		nextJobID:      1,
		nextRowID:      1,
		nextSchoolID:   10,
		nextGradeID:    20,
		nextClassID:    30,
		nextCourseID:   40,
		nextUserID:     50,
		nextPaperID:    60,
		nextBankID:     1000,
		nextQuestionID: 2000,
		jobs:           map[int64]ImportJob{},
		rows:           map[int64][]ImportJobRow{},
		schools:        map[int64]map[string]int64{},
		grades:         map[int64]map[string]int64{},
		classes:        map[int64]map[string]int64{},
		courses:        map[int64]map[string]CourseRef{},
		banks:          map[int64]map[string]QuestionBankRef{},
		roles:          map[int64]map[string]int64{},
	}
}

func (repo *memoryImportRepository) CreateJob(_ context.Context, job ImportJob) (ImportJob, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	job.ID = repo.nextJobID
	repo.nextJobID++
	repo.jobs[job.ID] = job
	return job, nil
}

func (repo *memoryImportRepository) UpdateJobStatus(_ context.Context, tenantID int64, id int64, status string, errorSummary string, startedAt *time.Time, finishedAt *time.Time) (ImportJob, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	job, ok := repo.jobs[id]
	if !ok || job.TenantID != tenantID {
		return ImportJob{}, ErrNotFound
	}
	job.Status = status
	job.ErrorSummary = errorSummary
	if startedAt != nil {
		job.StartedAt = startedAt
	}
	if finishedAt != nil {
		job.FinishedAt = finishedAt
	}
	repo.jobs[id] = job
	return job, nil
}

func (repo *memoryImportRepository) UpdateJobWithRows(_ context.Context, job ImportJob, rows []ImportJobRow) (ImportJob, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
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
	repo.mu.Lock()
	defer repo.mu.Unlock()
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
	repo.mu.Lock()
	defer repo.mu.Unlock()
	job, ok := repo.jobs[id]
	if !ok || job.TenantID != tenantID {
		return ImportJob{}, ErrNotFound
	}
	return job, nil
}

func (repo *memoryImportRepository) ListRows(_ context.Context, tenantID int64, jobID int64, filter ImportJobRowFilter) (PageResult[ImportJobRow], error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	job, ok := repo.jobs[jobID]
	if !ok || job.TenantID != tenantID {
		return PageResult[ImportJobRow]{}, ErrNotFound
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
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if item, ok := repo.courses[tenantID][name]; ok {
		return item, nil
	}
	return CourseRef{}, ErrNotFound
}

func (repo *memoryImportRepository) FindQuestionBankByName(_ context.Context, tenantID int64, name string) (QuestionBankRef, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if item, ok := repo.banks[tenantID][name]; ok {
		return item, nil
	}
	return QuestionBankRef{}, ErrNotFound
}

func (repo *memoryImportRepository) UpsertOrgStructure(_ context.Context, item ImportedOrgStructure) (ImportTarget, map[string]any, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	normalized := cloneTestMap(item.NormalizedData)
	if repo.schools[item.TenantID] == nil {
		repo.schools[item.TenantID] = map[string]int64{}
	}
	schoolID := repo.schools[item.TenantID][item.SchoolCode]
	if schoolID == 0 {
		schoolID = repo.nextSchoolID
		repo.nextSchoolID++
		repo.schools[item.TenantID][item.SchoolCode] = schoolID
	}
	normalized["school_id"] = schoolID
	target := ImportTarget{EntityType: TargetSchool, EntityID: schoolID}
	if item.GradeCode != "" {
		gradeKey := item.SchoolCode + "/" + item.GradeCode
		if repo.grades[item.TenantID] == nil {
			repo.grades[item.TenantID] = map[string]int64{}
		}
		gradeID := repo.grades[item.TenantID][gradeKey]
		if gradeID == 0 {
			gradeID = repo.nextGradeID
			repo.nextGradeID++
			repo.grades[item.TenantID][gradeKey] = gradeID
		}
		normalized["grade_id"] = gradeID
		target = ImportTarget{EntityType: TargetGrade, EntityID: gradeID}
		if item.ClassCode != "" {
			classKey := gradeKey + "/" + item.ClassCode
			if repo.classes[item.TenantID] == nil {
				repo.classes[item.TenantID] = map[string]int64{}
			}
			classID := repo.classes[item.TenantID][classKey]
			if classID == 0 {
				classID = repo.nextClassID
				repo.nextClassID++
				repo.classes[item.TenantID][classKey] = classID
			}
			normalized["class_id"] = classID
			target = ImportTarget{EntityType: TargetClass, EntityID: classID}
		}
	}
	return target, normalized, nil
}

func (repo *memoryImportRepository) UpsertCourse(_ context.Context, item ImportedCourse) (ImportTarget, map[string]any, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if repo.courses[item.TenantID] == nil {
		repo.courses[item.TenantID] = map[string]CourseRef{}
	}
	course := repo.courses[item.TenantID][item.Name]
	if course.ID == 0 {
		course = CourseRef{ID: repo.nextCourseID, Name: item.Name}
		repo.nextCourseID++
	}
	repo.courses[item.TenantID][item.Name] = course
	repo.courses[item.TenantID][item.Code] = course
	normalized := cloneTestMap(item.NormalizedData)
	normalized["course_id"] = course.ID
	return ImportTarget{EntityType: TargetCourse, EntityID: course.ID}, normalized, nil
}

func (repo *memoryImportRepository) FindRoleIDsByCodes(_ context.Context, tenantID int64, codes []string) ([]int64, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	ids := make([]int64, 0, len(codes))
	for _, code := range codes {
		if code == "" {
			continue
		}
		id := repo.roles[tenantID][code]
		if id == 0 {
			return nil, ErrNotFound
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (repo *memoryImportRepository) UpsertUser(_ context.Context, user ImportedUser) (ImportTarget, map[string]any, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	id := repo.nextUserID
	repo.nextUserID++
	repo.createdUsers = append(repo.createdUsers, user)
	normalized := cloneTestMap(user.NormalizedData)
	normalized["user_id"] = id
	normalized["user_type"] = user.UserType
	return ImportTarget{EntityType: TargetUser, EntityID: id}, normalized, nil
}

func (repo *memoryImportRepository) UpsertExamPaperQuestion(_ context.Context, item ImportedExamPaperQuestion) (ImportTarget, map[string]any, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	id := repo.nextPaperID
	repo.nextPaperID++
	repo.createdPapers = append(repo.createdPapers, item)
	normalized := cloneTestMap(item.NormalizedData)
	normalized["paper_id"] = id
	if item.QuestionVersionID != nil {
		normalized["question_version_id"] = *item.QuestionVersionID
	} else {
		normalized["question_version_id"] = int64(1)
	}
	return ImportTarget{EntityType: TargetExamPaper, EntityID: id}, normalized, nil
}

func (repo *memoryImportRepository) CreateQuestionBank(_ context.Context, bank ImportedQuestionBank) (int64, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
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
	repo.mu.Lock()
	defer repo.mu.Unlock()
	id := repo.nextQuestionID
	repo.nextQuestionID++
	question.ID = id
	repo.createdQuestions = append(repo.createdQuestions, question)
	return id, nil
}

func (repo *memoryImportRepository) RollbackJob(_ context.Context, tenantID int64, id int64, rows []ImportJobRow) (ImportJob, error) {
	repo.mu.Lock()
	defer repo.mu.Unlock()
	job, ok := repo.jobs[id]
	if !ok || job.TenantID != tenantID {
		return ImportJob{}, ErrNotFound
	}
	_ = rows
	job.Status = StatusRolledBack
	repo.jobs[id] = job
	return job, nil
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

func waitForImportJobStatus(t *testing.T, repo *memoryImportRepository, tenantID int64, id int64, status string) ImportJob {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		job, err := repo.GetJob(context.Background(), tenantID, id)
		if err == nil && job.Status == status {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	job, err := repo.GetJob(context.Background(), tenantID, id)
	if err != nil {
		t.Fatalf("job not found: %v", err)
	}
	t.Fatalf("job status = %q, want %q", job.Status, status)
	return ImportJob{}
}

func createImportJobAndWait(t *testing.T, router http.Handler, repo *memoryImportRepository, body map[string]any) ImportJob {
	t.Helper()
	rec := performImportRequest(router, http.MethodPost, "/api/v1/import/jobs", body, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var created importEnvelope[ImportJob]
	decodeImportBody(t, rec, &created)
	return waitForImportJobStatus(t, repo, 1, created.Data.ID, StatusSuccess)
}

func cloneTestMap(value map[string]any) map[string]any {
	result := make(map[string]any, len(value))
	for key, item := range value {
		result[key] = item
	}
	return result
}
