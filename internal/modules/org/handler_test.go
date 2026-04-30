package org

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_SchoolLifecycleWithinTenantScope(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	createRec := performJSONRequest(router, http.MethodPost, "/api/v1/schools", map[string]any{
		"code": "school_001",
		"name": "第一中学",
	})
	if createRec.Code != http.StatusOK {
		t.Fatalf("create school status = %d", createRec.Code)
	}

	var created envelope[School]
	decodeBody(t, createRec, &created)
	if created.Code != 0 {
		t.Fatalf("create school code = %d", created.Code)
	}
	if created.Data.TenantID != 1 {
		t.Fatalf("create school tenant_id = %d", created.Data.TenantID)
	}
	if created.Data.Name != "第一中学" {
		t.Fatalf("create school name = %q", created.Data.Name)
	}

	listRec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/schools?keyword=第一", nil, "token")
	if listRec.Code != http.StatusOK {
		t.Fatalf("list school status = %d", listRec.Code)
	}
	var listed envelope[PageResult[School]]
	decodeBody(t, listRec, &listed)
	if len(listed.Data.Items) != 1 {
		t.Fatalf("list school count = %d", len(listed.Data.Items))
	}

	detailRec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/schools/"+strconv.FormatInt(created.Data.ID, 10), nil, "token")
	if detailRec.Code != http.StatusOK {
		t.Fatalf("school detail status = %d", detailRec.Code)
	}

	updateRec := performJSONRequest(router, http.MethodPut, "/api/v1/schools/"+strconv.FormatInt(created.Data.ID, 10), map[string]any{
		"code": "school_001",
		"name": "第一中学东校区",
	})
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update school status = %d", updateRec.Code)
	}
	var updated envelope[School]
	decodeBody(t, updateRec, &updated)
	if updated.Data.Name != "第一中学东校区" {
		t.Fatalf("update school name = %q", updated.Data.Name)
	}

	disableRec := performAuthorizedRequest(router, http.MethodPost, "/api/v1/schools/"+strconv.FormatInt(created.Data.ID, 10)+"/disable", nil, "token")
	if disableRec.Code != http.StatusOK {
		t.Fatalf("disable school status = %d", disableRec.Code)
	}

	disabledDetailRec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/schools/"+strconv.FormatInt(created.Data.ID, 10), nil, "token")
	var disabled envelope[School]
	decodeBody(t, disabledDetailRec, &disabled)
	if disabled.Data.Status != StatusDisabled {
		t.Fatalf("disabled school status = %q", disabled.Data.Status)
	}
}

func TestHandler_GradeClassAndCourseFilters(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	school := createSchoolForTest(t, router, "school_001", "第一中学")
	grade1 := createGradeForTest(t, router, school.ID, "grade_7", "七年级", 7, "2026")
	grade2 := createGradeForTest(t, router, school.ID, "grade_8", "八年级", 8, "2026")
	createClassForTest(t, router, school.ID, grade1.ID, "class_1", "一班", 1)
	createClassForTest(t, router, school.ID, grade2.ID, "class_2", "二班", 2)
	startAt := time.Date(2026, 9, 1, 0, 0, 0, 0, time.FixedZone("CST", 8*3600))
	endAt := time.Date(2027, 1, 31, 23, 59, 59, 0, time.FixedZone("CST", 8*3600))
	createCourseForTest(t, router, map[string]any{
		"code":        "math",
		"name":        "数学",
		"start_at":    startAt.Format(time.RFC3339),
		"end_at":      endAt.Format(time.RFC3339),
		"description": "七年级数学",
	})
	createCourseForTest(t, router, map[string]any{
		"code":        "history",
		"name":        "历史",
		"description": "通识课程",
	})

	gradesRec := performAuthorizedRequest(
		router,
		http.MethodGet,
		"/api/v1/grades?school_id="+strconv.FormatInt(school.ID, 10),
		nil,
		"token",
	)
	var grades envelope[PageResult[Grade]]
	decodeBody(t, gradesRec, &grades)
	if len(grades.Data.Items) != 2 {
		t.Fatalf("grades count = %d", len(grades.Data.Items))
	}

	classesRec := performAuthorizedRequest(
		router,
		http.MethodGet,
		"/api/v1/classes?grade_id="+strconv.FormatInt(grade1.ID, 10),
		nil,
		"token",
	)
	var classes envelope[PageResult[Class]]
	decodeBody(t, classesRec, &classes)
	if len(classes.Data.Items) != 1 {
		t.Fatalf("classes count = %d", len(classes.Data.Items))
	}
	if classes.Data.Items[0].Name != "一班" {
		t.Fatalf("class name = %q", classes.Data.Items[0].Name)
	}

	coursesRec := performAuthorizedRequest(
		router,
		http.MethodGet,
		"/api/v1/courses?keyword=数&active_at=2026-10-01T00:00:00%2B08:00",
		nil,
		"token",
	)
	if coursesRec.Code != http.StatusOK {
		t.Fatalf("courses status = %d, body = %s", coursesRec.Code, coursesRec.Body.String())
	}
	var courses envelope[PageResult[Course]]
	decodeBody(t, coursesRec, &courses)
	if len(courses.Data.Items) != 1 {
		t.Fatalf("courses count = %d", len(courses.Data.Items))
	}
	if courses.Data.Items[0].Code != "math" {
		t.Fatalf("course code = %q", courses.Data.Items[0].Code)
	}
}

func TestHandler_RejectsRequestWithoutOrgPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	handler := NewHandler(NewService(repo), fakeTokenParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			Permissions: []string{"notice:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/schools", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}

	var body envelope[any]
	decodeBody(t, rec, &body)
	if body.Code != CodeForbidden {
		t.Fatalf("code = %d", body.Code)
	}
}

func TestHandler_RejectsCrossTenantAccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryRepository()
	createService := NewService(repo)

	if _, err := createService.CreateSchool(context.Background(), Scope{TenantID: 1, UserType: "sys_admin"}, SchoolInput{
		Code:       "school_001",
		Name:       "第一中学",
		ObjectType: ObjectTypeSchool,
	}); err != nil {
		t.Fatalf("seed school: %v", err)
	}

	handler := NewHandler(createService, fakeTokenParser{
		claims: auth.AccessClaims{
			TenantID:    2,
			Permissions: []string{"org:manage"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)

	rec := performAuthorizedRequest(router, http.MethodGet, "/api/v1/schools/1", nil, "token")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}

type envelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type fakeTokenParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeTokenParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

type memoryRepository struct {
	nextSchoolID int64
	nextGradeID  int64
	nextClassID  int64
	nextCourseID int64
	schools      map[int64]School
	grades       map[int64]Grade
	classes      map[int64]Class
	courses      map[int64]Course
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		nextSchoolID: 1,
		nextGradeID:  1,
		nextClassID:  1,
		nextCourseID: 1,
		schools:      map[int64]School{},
		grades:       map[int64]Grade{},
		classes:      map[int64]Class{},
		courses:      map[int64]Course{},
	}
}

func (repo *memoryRepository) ListSchools(_ context.Context, tenantID int64, filter SchoolListFilter) (PageResult[School], error) {
	items := make([]School, 0)
	for _, school := range repo.schools {
		if tenantID > 0 && school.TenantID != tenantID {
			continue
		}
		if filter.ObjectType > 0 && school.ObjectType != filter.ObjectType {
			continue
		}
		if filter.Status != "" && school.Status != filter.Status {
			continue
		}
		if filter.Keyword != "" && !containsAny(school.Code, school.Name, filter.Keyword) {
			continue
		}
		items = append(items, school)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetSchool(_ context.Context, tenantID int64, id int64) (School, error) {
	school, ok := repo.schools[id]
	if !ok || (tenantID > 0 && school.TenantID != tenantID) {
		return School{}, ErrNotFound
	}
	return school, nil
}

func (repo *memoryRepository) CreateSchool(_ context.Context, school School) (School, error) {
	school.ID = repo.nextSchoolID
	repo.nextSchoolID++
	if school.ObjectType == 0 {
		school.ObjectType = ObjectTypeSchool
	}
	if school.ObjectTypeLabel == "" {
		school.ObjectTypeLabel = formatObjectTypeLabel(school.ObjectType)
	}
	school.Status = defaultStatus(school.Status)
	repo.schools[school.ID] = school
	return school, nil
}

func (repo *memoryRepository) UpdateSchool(_ context.Context, school School) (School, error) {
	current, ok := repo.schools[school.ID]
	if !ok || current.TenantID != school.TenantID {
		return School{}, ErrNotFound
	}
	school.Status = defaultStatus(current.Status)
	repo.schools[school.ID] = school
	return school, nil
}

func (repo *memoryRepository) DisableSchool(_ context.Context, tenantID int64, id int64) error {
	current, ok := repo.schools[id]
	if !ok || current.TenantID != tenantID {
		return ErrNotFound
	}
	current.Status = StatusDisabled
	repo.schools[id] = current
	return nil
}

func (repo *memoryRepository) ListGrades(_ context.Context, tenantID int64, filter GradeListFilter) (PageResult[Grade], error) {
	items := make([]Grade, 0)
	for _, grade := range repo.grades {
		if tenantID > 0 && grade.TenantID != tenantID {
			continue
		}
		if filter.SchoolID > 0 && grade.SchoolID != filter.SchoolID {
			continue
		}
		if filter.Status != "" && grade.Status != filter.Status {
			continue
		}
		items = append(items, grade)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetGrade(_ context.Context, tenantID int64, id int64) (Grade, error) {
	grade, ok := repo.grades[id]
	if !ok || (tenantID > 0 && grade.TenantID != tenantID) {
		return Grade{}, ErrNotFound
	}
	return grade, nil
}

func (repo *memoryRepository) CreateGrade(_ context.Context, grade Grade) (Grade, error) {
	if _, ok := repo.schools[grade.SchoolID]; !ok {
		return Grade{}, ErrNotFound
	}
	grade.ID = repo.nextGradeID
	repo.nextGradeID++
	grade.Status = defaultStatus(grade.Status)
	repo.grades[grade.ID] = grade
	return grade, nil
}

func (repo *memoryRepository) UpdateGrade(_ context.Context, grade Grade) (Grade, error) {
	current, ok := repo.grades[grade.ID]
	if !ok || current.TenantID != grade.TenantID {
		return Grade{}, ErrNotFound
	}
	grade.Status = defaultStatus(current.Status)
	repo.grades[grade.ID] = grade
	return grade, nil
}

func (repo *memoryRepository) DisableGrade(_ context.Context, tenantID int64, id int64) error {
	current, ok := repo.grades[id]
	if !ok || current.TenantID != tenantID {
		return ErrNotFound
	}
	current.Status = StatusDisabled
	repo.grades[id] = current
	return nil
}

func (repo *memoryRepository) ListClasses(_ context.Context, tenantID int64, filter ClassListFilter) (PageResult[Class], error) {
	items := make([]Class, 0)
	for _, classItem := range repo.classes {
		if tenantID > 0 && classItem.TenantID != tenantID {
			continue
		}
		if filter.SchoolID > 0 && classItem.SchoolID != filter.SchoolID {
			continue
		}
		if filter.GradeID > 0 && classItem.GradeID != filter.GradeID {
			continue
		}
		if filter.Status != "" && classItem.Status != filter.Status {
			continue
		}
		items = append(items, classItem)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetClass(_ context.Context, tenantID int64, id int64) (Class, error) {
	classItem, ok := repo.classes[id]
	if !ok || (tenantID > 0 && classItem.TenantID != tenantID) {
		return Class{}, ErrNotFound
	}
	return classItem, nil
}

func (repo *memoryRepository) CreateClass(_ context.Context, classItem Class) (Class, error) {
	if _, ok := repo.schools[classItem.SchoolID]; !ok {
		return Class{}, ErrNotFound
	}
	if _, ok := repo.grades[classItem.GradeID]; !ok {
		return Class{}, ErrNotFound
	}
	classItem.ID = repo.nextClassID
	repo.nextClassID++
	classItem.Status = defaultStatus(classItem.Status)
	repo.classes[classItem.ID] = classItem
	return classItem, nil
}

func (repo *memoryRepository) UpdateClass(_ context.Context, classItem Class) (Class, error) {
	current, ok := repo.classes[classItem.ID]
	if !ok || current.TenantID != classItem.TenantID {
		return Class{}, ErrNotFound
	}
	classItem.Status = defaultStatus(current.Status)
	repo.classes[classItem.ID] = classItem
	return classItem, nil
}

func (repo *memoryRepository) DisableClass(_ context.Context, tenantID int64, id int64) error {
	current, ok := repo.classes[id]
	if !ok || current.TenantID != tenantID {
		return ErrNotFound
	}
	current.Status = StatusDisabled
	repo.classes[id] = current
	return nil
}

func (repo *memoryRepository) ListCourses(_ context.Context, tenantID int64, filter CourseListFilter) (PageResult[Course], error) {
	items := make([]Course, 0)
	for _, course := range repo.courses {
		if tenantID > 0 && course.TenantID != tenantID {
			continue
		}
		if filter.Status != "" && course.Status != filter.Status {
			continue
		}
		if filter.Keyword != "" && !containsAny(course.Code, course.Name, course.Description, filter.Keyword) {
			continue
		}
		if filter.ActiveAt != nil && !courseActiveAt(course, *filter.ActiveAt) {
			continue
		}
		items = append(items, course)
	}
	return pageOf(items, filter.Page, filter.PageSize), nil
}

func (repo *memoryRepository) GetCourse(_ context.Context, tenantID int64, id int64) (Course, error) {
	course, ok := repo.courses[id]
	if !ok || (tenantID > 0 && course.TenantID != tenantID) {
		return Course{}, ErrNotFound
	}
	return course, nil
}

func (repo *memoryRepository) CreateCourse(_ context.Context, course Course) (Course, error) {
	course.ID = repo.nextCourseID
	repo.nextCourseID++
	course.Status = defaultStatus(course.Status)
	repo.courses[course.ID] = course
	return course, nil
}

func (repo *memoryRepository) UpdateCourse(_ context.Context, course Course) (Course, error) {
	current, ok := repo.courses[course.ID]
	if !ok || current.TenantID != course.TenantID {
		return Course{}, ErrNotFound
	}
	course.Status = defaultStatus(current.Status)
	repo.courses[course.ID] = course
	return course, nil
}

func (repo *memoryRepository) DisableCourse(_ context.Context, tenantID int64, id int64) error {
	current, ok := repo.courses[id]
	if !ok || current.TenantID != tenantID {
		return ErrNotFound
	}
	current.Status = StatusDisabled
	repo.courses[id] = current
	return nil
}

func performJSONRequest(router http.Handler, method string, path string, body any) *httptest.ResponseRecorder {
	return performAuthorizedRequest(router, method, path, body, "token")
}

func performAuthorizedRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
	var requestBody []byte
	if body != nil {
		var err error
		requestBody, err = json.Marshal(body)
		if err != nil {
			panic(err)
		}
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(requestBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decodeBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}

func createSchoolForTest(t *testing.T, router http.Handler, code string, name string) School {
	t.Helper()
	rec := performJSONRequest(router, http.MethodPost, "/api/v1/schools", map[string]any{
		"code": code,
		"name": name,
	})
	var body envelope[School]
	decodeBody(t, rec, &body)
	return body.Data
}

func createGradeForTest(t *testing.T, router http.Handler, schoolID int64, code string, name string, level int, schoolYear string) Grade {
	t.Helper()
	rec := performJSONRequest(router, http.MethodPost, "/api/v1/grades", map[string]any{
		"school_id":   schoolID,
		"code":        code,
		"name":        name,
		"grade_level": level,
		"school_year": schoolYear,
	})
	var body envelope[Grade]
	decodeBody(t, rec, &body)
	return body.Data
}

func createClassForTest(t *testing.T, router http.Handler, schoolID int64, gradeID int64, code string, name string, classNo int) Class {
	t.Helper()
	rec := performJSONRequest(router, http.MethodPost, "/api/v1/classes", map[string]any{
		"school_id": schoolID,
		"grade_id":  gradeID,
		"code":      code,
		"name":      name,
		"class_no":  classNo,
	})
	var body envelope[Class]
	decodeBody(t, rec, &body)
	return body.Data
}

func createCourseForTest(t *testing.T, router http.Handler, payload map[string]any) Course {
	t.Helper()
	rec := performJSONRequest(router, http.MethodPost, "/api/v1/courses", payload)
	var body envelope[Course]
	decodeBody(t, rec, &body)
	return body.Data
}

func containsAny(values ...string) bool {
	if len(values) < 2 {
		return false
	}
	keyword := values[len(values)-1]
	for _, value := range values[:len(values)-1] {
		if value != "" && bytes.Contains([]byte(value), []byte(keyword)) {
			return true
		}
	}
	return false
}

func pageOf[T any](items []T, page int, pageSize int) PageResult[T] {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	start := (page - 1) * pageSize
	if start > len(items) {
		start = len(items)
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return PageResult[T]{
		Items:    items[start:end],
		Page:     page,
		PageSize: pageSize,
		Total:    len(items),
	}
}

func defaultStatus(status string) string {
	if status == "" {
		return StatusActive
	}
	return status
}

func formatObjectTypeLabel(objectType int) string {
	if objectType == ObjectTypeOrganization {
		return "组织"
	}
	return "学校"
}

func courseActiveAt(course Course, activeAt time.Time) bool {
	if course.StartAt != nil && activeAt.Before(*course.StartAt) {
		return false
	}
	if course.EndAt != nil && activeAt.After(*course.EndAt) {
		return false
	}
	return true
}

var errFakeParser = errors.New("fake parser")
