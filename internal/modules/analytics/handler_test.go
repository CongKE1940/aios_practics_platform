package analytics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"aios_practice_platform/internal/modules/auth"
)

func TestHandler_TeacherClassPracticeSummaryReturnsOverviewAndStudents(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.summary = ClassPracticeSummary{
		ClassID:                  101,
		ClassName:                "一班",
		CourseID:                 12,
		CourseName:               "数学",
		StudentCount:             2,
		ParticipatedStudentCount: 1,
		SessionCount:             2,
		AnsweredCount:            5,
		CorrectCount:             4,
		WrongCount:               1,
		Accuracy:                 0.8,
		WrongQuestionCount:       1,
		ConfusedQuestionCount:    1,
	}
	repo.students = []ClassPracticeStudentItem{
		{
			StudentID:             7001,
			StudentName:           "张三",
			StudentNo:             strPtr("S001"),
			SessionCount:          2,
			AnsweredCount:         5,
			CorrectCount:          4,
			WrongCount:            1,
			Accuracy:              0.8,
			WrongQuestionCount:    1,
			ConfusedQuestionCount: 1,
		},
		{
			StudentID:             7002,
			StudentName:           "李四",
			StudentNo:             strPtr("S002"),
			SessionCount:          0,
			AnsweredCount:         0,
			CorrectCount:          0,
			WrongCount:            0,
			Accuracy:              0,
			WrongQuestionCount:    0,
			ConfusedQuestionCount: 0,
		},
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12&page=1&page_size=20", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[ClassPracticeSummaryResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.Summary.ClassName != "一班" || body.Data.Summary.Accuracy != 0.8 {
		t.Fatalf("summary = %+v", body.Data.Summary)
	}
	if len(body.Data.Students.Items) != 2 {
		t.Fatalf("student count = %d", len(body.Data.Students.Items))
	}
	if body.Data.Students.Items[0].StudentName != "张三" {
		t.Fatalf("first student = %+v", body.Data.Students.Items[0])
	}
}

func TestHandler_TeacherCannotViewUnassignedClassCourse(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = false
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_AdminCanViewTenantClassCourse(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.summary = ClassPracticeSummary{ClassID: 101, ClassName: "一班", CourseID: 12, CourseName: "数学"}
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      1,
			UserType:    "sys_admin",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_RejectsMissingAnalyticsPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"practice:use"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?class_id=101&course_id=12", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_RejectsMissingClassOrCourseID(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-practice-summary?course_id=12", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ListClassCourseOptionsForTeacher(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.options = []ClassCourseOption{
		{
			ClassID:   101,
			ClassName: "一班",
			Courses: []CourseOptionItem{
				{CourseID: 12, CourseName: "数学"},
				{CourseID: 13, CourseName: "语文"},
			},
		},
	}
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-course-options", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[ClassCourseOptionsResult]
	decodeAnalyticsBody(t, rec, &body)
	if len(body.Data.Items) != 1 {
		t.Fatalf("items count = %d", len(body.Data.Items))
	}
	if body.Data.Items[0].ClassID != 101 || body.Data.Items[0].ClassName != "一班" {
		t.Fatalf("first item = %+v", body.Data.Items[0])
	}
	if len(body.Data.Items[0].Courses) != 2 {
		t.Fatalf("courses count = %d", len(body.Data.Items[0].Courses))
	}
	if body.Data.Items[0].Courses[0].CourseName != "数学" {
		t.Fatalf("first course = %+v", body.Data.Items[0].Courses[0])
	}
}

func TestHandler_ListClassCourseOptionsForAdmin(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.options = []ClassCourseOption{
		{
			ClassID:   101,
			ClassName: "一班",
			Courses: []CourseOptionItem{
				{CourseID: 12, CourseName: "数学"},
			},
		},
	}
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      1,
			UserType:    "sys_admin",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-course-options", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[ClassCourseOptionsResult]
	decodeAnalyticsBody(t, rec, &body)
	if len(body.Data.Items) != 1 || len(body.Data.Items[0].Courses) != 1 {
		t.Fatalf("items = %+v", body.Data.Items)
	}
	if body.Data.Items[0].Courses[0].CourseName != "数学" {
		t.Fatalf("first course = %+v", body.Data.Items[0].Courses[0])
	}
	if repo.lastScope.UserType != "sys_admin" {
		t.Fatalf("last scope = %+v", repo.lastScope)
	}
}

func TestHandler_ListClassCourseOptionsRejectsMissingPermission(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"practice:use"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/class-course-options", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestService_RejectsTimeRangeLongerThan366Days(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	service := NewService(repo)

	startAt := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	endAt := startAt.AddDate(1, 1, 2)
	_, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID:    1,
		UserID:      7,
		UserType:    "teacher",
		Permissions: []string{"analytics:view"},
	}, ClassPracticeSummaryQuery{
		TenantID: 1,
		ClassID:  101,
		CourseID: 12,
		StartAt:  &startAt,
		EndAt:    &endAt,
		Page:     1,
		PageSize: 20,
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_ListClassCourseOptionsRejectsUnsupportedUserType(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	service := NewService(repo)

	_, err := service.ListClassCourseOptions(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "student",
		Permissions: []string{
			"analytics:view",
		},
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_ReturnsZeroAccuracyWhenNoAnswers(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.summary = ClassPracticeSummary{
		ClassID:       101,
		ClassName:     "一班",
		CourseID:      12,
		CourseName:    "数学",
		AnsweredCount: 0,
		CorrectCount:  0,
		WrongCount:    0,
		Accuracy:      0,
		StudentCount:  2,
		SessionCount:  0,
	}
	repo.students = []ClassPracticeStudentItem{
		{StudentID: 7001, StudentName: "张三", Accuracy: 0},
	}

	service := NewService(repo)
	result, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, ClassPracticeSummaryQuery{
		TenantID: 1,
		ClassID:  101,
		CourseID: 12,
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if result.Summary.Accuracy != 0 {
		t.Fatalf("accuracy = %v", result.Summary.Accuracy)
	}
}

func TestService_UsesDefaultRecent30DayRangeAndNormalizesPagination(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.summary = ClassPracticeSummary{ClassID: 101, ClassName: "一班", CourseID: 12, CourseName: "数学"}
	service := NewService(repo)
	fixedNow := time.Date(2024, 4, 22, 15, 4, 5, 0, time.UTC)
	service.now = func() time.Time {
		return fixedNow
	}

	_, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, ClassPracticeSummaryQuery{
		TenantID: 1,
		ClassID:  101,
		CourseID: 12,
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if repo.lastQuery.Page != 1 || repo.lastQuery.PageSize != 20 {
		t.Fatalf("pagination = page %d size %d", repo.lastQuery.Page, repo.lastQuery.PageSize)
	}
	if repo.lastQuery.StartAt == nil || repo.lastQuery.EndAt == nil {
		t.Fatalf("time range = %+v", repo.lastQuery)
	}
	if !repo.lastQuery.EndAt.Equal(fixedNow) {
		t.Fatalf("end at = %v", repo.lastQuery.EndAt)
	}
	if !repo.lastQuery.StartAt.Equal(fixedNow.AddDate(0, 0, -30)) {
		t.Fatalf("start at = %v", repo.lastQuery.StartAt)
	}
}

func TestService_GetClassPracticeSummaryRejectsMissingPermission(t *testing.T) {
	service := NewService(newMemoryAnalyticsRepository())

	_, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
	}, ClassPracticeSummaryQuery{
		ClassID:  101,
		CourseID: 12,
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_GetClassPracticeSummaryTeacherRejectsBeforeCheckingExistence(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = false
	repo.teacherAllowed = false
	service := NewService(repo)

	_, err := service.GetClassPracticeSummary(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, ClassPracticeSummaryQuery{
		ClassID:  101,
		CourseID: 12,
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
	if repo.teacherCanViewCalls != 1 {
		t.Fatalf("teacherCanViewCalls = %d", repo.teacherCanViewCalls)
	}
	if repo.classCourseExistsCalls != 0 {
		t.Fatalf("classCourseExistsCalls = %d", repo.classCourseExistsCalls)
	}
}

func TestHandler_GetStudentPracticeDetailSessions(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.studentPracticeSummary = StudentPracticeSummary{
		StudentUserID:         7001,
		StudentName:           "张三",
		StudentNo:             strPtr("S001"),
		ClassID:               101,
		ClassName:             "一班",
		CourseID:              12,
		CourseName:            "数学",
		SessionCount:          2,
		AnsweredCount:         5,
		CorrectCount:          4,
		WrongCount:            1,
		Accuracy:              0.8,
		WrongQuestionCount:    1,
		ConfusedQuestionCount: 1,
	}
	repo.studentPracticeSessions = []StudentPracticeSessionItem{
		{SessionID: 9001, StartedAt: timePtr(time.Date(2024, 4, 20, 8, 0, 0, 0, time.UTC)), AnsweredCount: 3, CorrectCount: 2, WrongCount: 1, Accuracy: 2.0 / 3.0},
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[StudentPracticeDetailResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.StudentSummary.StudentName != "张三" {
		t.Fatalf("summary = %+v", body.Data.StudentSummary)
	}
	if body.Data.ActiveTab != "sessions" {
		t.Fatalf("tab = %s", body.Data.ActiveTab)
	}
	if repo.lastStudentPracticeQuery.Tab != StudentDetailTabSessions {
		t.Fatalf("last query tab = %s", repo.lastStudentPracticeQuery.Tab)
	}
	if repo.listStudentSessionsCalls != 1 || repo.listStudentWrongCalls != 0 || repo.listStudentConfusedCalls != 0 {
		t.Fatalf("calls = sessions:%d wrong:%d confused:%d", repo.listStudentSessionsCalls, repo.listStudentWrongCalls, repo.listStudentConfusedCalls)
	}
	if len(body.Data.Sessions.Items) != 1 {
		t.Fatalf("sessions = %+v", body.Data.Sessions)
	}
	if body.Data.WrongQuestions.Total != 0 || len(body.Data.WrongQuestions.Items) != 0 {
		t.Fatalf("wrong questions = %+v", body.Data.WrongQuestions)
	}
	if body.Data.ConfusedQuestions.Total != 0 || len(body.Data.ConfusedQuestions.Items) != 0 {
		t.Fatalf("confused questions = %+v", body.Data.ConfusedQuestions)
	}
}

func TestHandler_GetStudentPracticeDetailWrongTab(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.studentPracticeSummary = StudentPracticeSummary{StudentUserID: 7001, StudentName: "张三", ClassID: 101, CourseID: 12}
	repo.studentPracticeWrongQuestions = []StudentPracticeQuestionItem{
		{QuestionID: 501, Stem: "1+1=?", PracticeWrongCount: 2},
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001&tab=wrong", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[StudentPracticeDetailResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.ActiveTab != "wrong" {
		t.Fatalf("tab = %s", body.Data.ActiveTab)
	}
	if repo.lastStudentPracticeQuery.Tab != StudentDetailTabWrong {
		t.Fatalf("last query tab = %s", repo.lastStudentPracticeQuery.Tab)
	}
	if repo.listStudentSessionsCalls != 0 || repo.listStudentWrongCalls != 1 || repo.listStudentConfusedCalls != 0 {
		t.Fatalf("calls = sessions:%d wrong:%d confused:%d", repo.listStudentSessionsCalls, repo.listStudentWrongCalls, repo.listStudentConfusedCalls)
	}
	if len(body.Data.WrongQuestions.Items) != 1 {
		t.Fatalf("wrong questions = %+v", body.Data.WrongQuestions)
	}
	if body.Data.Sessions.Total != 0 || len(body.Data.Sessions.Items) != 0 {
		t.Fatalf("sessions = %+v", body.Data.Sessions)
	}
}

func TestHandler_GetStudentPracticeDetailConfusedTab(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.studentPracticeSummary = StudentPracticeSummary{StudentUserID: 7001, StudentName: "张三", ClassID: 101, CourseID: 12}
	repo.studentPracticeConfusedQuestions = []StudentPracticeQuestionItem{
		{QuestionID: 601, Stem: "解释公式", IsConfused: true},
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001&tab=confused", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[StudentPracticeDetailResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.ActiveTab != "confused" {
		t.Fatalf("tab = %s", body.Data.ActiveTab)
	}
	if repo.lastStudentPracticeQuery.Tab != StudentDetailTabConfused {
		t.Fatalf("last query tab = %s", repo.lastStudentPracticeQuery.Tab)
	}
	if repo.listStudentSessionsCalls != 0 || repo.listStudentWrongCalls != 0 || repo.listStudentConfusedCalls != 1 {
		t.Fatalf("calls = sessions:%d wrong:%d confused:%d", repo.listStudentSessionsCalls, repo.listStudentWrongCalls, repo.listStudentConfusedCalls)
	}
	if len(body.Data.ConfusedQuestions.Items) != 1 {
		t.Fatalf("confused questions = %+v", body.Data.ConfusedQuestions)
	}
	if body.Data.Sessions.Total != 0 || len(body.Data.Sessions.Items) != 0 {
		t.Fatalf("sessions = %+v", body.Data.Sessions)
	}
}

func TestHandler_GetStudentPracticeDetailRejectsTeacherWithoutAssignment(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = false
	repo.studentBelongsToClass = true

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if repo.classCourseExistsCalls != 0 {
		t.Fatalf("classCourseExistsCalls = %d", repo.classCourseExistsCalls)
	}
}

func TestHandler_GetStudentPracticeDetailRejectsStudentOutsideClass(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = false

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001", nil, "token")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeDetailRejectsInvalidTab(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001&tab=all", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeDetailRejectsInvalidIDs(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=0&course_id=12&student_user_id=7001", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeDetailRejectsInvalidTimeRange(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-detail?class_id=101&course_id=12&student_user_id=7001&start_at=2024-05-01T00:00:00Z&end_at=2024-04-01T00:00:00Z", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeSessionDetailSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.studentPracticeSessionDetailResult = StudentPracticeSessionDetailResult{
		StudentSummary: StudentPracticeSessionStudentSummary{
			StudentUserID: 7001,
			StudentName:   "张三",
			StudentNo:     strPtr("S001"),
			ClassID:       101,
			ClassName:     "一班",
			CourseID:      12,
			CourseName:    "数学",
		},
		Session: StudentPracticeSessionSummary{
			SessionID:     9001,
			Status:        "finished",
			PracticeMode:  "random",
			SourceMode:    "course",
			FlowMode:      "fixed_count",
			TotalCount:    2,
			AnsweredCount: 2,
			CorrectCount:  1,
			WrongCount:    1,
			Accuracy:      0.5,
		},
		Questions: []StudentPracticeSessionQuestionItem{
			{
				SessionQuestionID: 701,
				QuestionID:        1,
				QuestionVersionID: 11,
				DisplayOrder:      1,
				QuestionType:      "single_choice",
				Content:           map[string]any{"stem": map[string]any{"text": "1+1=?"}},
				StudentAnswer:     map[string]any{"selected_options": []any{"A"}},
				CorrectAnswer:     map[string]any{"selected_options": []any{"A"}},
				IsAnswered:        true,
				IsCorrect:         boolPtr(true),
			},
			{
				SessionQuestionID: 702,
				QuestionID:        2,
				QuestionVersionID: 22,
				DisplayOrder:      2,
				QuestionType:      "single_choice",
				Content:           map[string]any{"stem": map[string]any{"text": "1+2=?"}},
				StudentAnswer:     map[string]any{"selected_options": []any{"B"}},
				CorrectAnswer:     map[string]any{"selected_options": []any{"A"}},
				IsAnswered:        true,
				IsCorrect:         boolPtr(false),
			},
		},
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-session-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001", nil, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[StudentPracticeSessionDetailResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.Session.SessionID != 9001 {
		t.Fatalf("session = %+v", body.Data.Session)
	}
	if len(body.Data.Questions) != 2 {
		t.Fatalf("question count = %d", len(body.Data.Questions))
	}
	if body.Data.Questions[0].SessionQuestionID != 701 {
		t.Fatalf("first question = %+v", body.Data.Questions[0])
	}
	if body.Data.StudentSummary.StudentName != "张三" {
		t.Fatalf("student summary = %+v", body.Data.StudentSummary)
	}
}

func TestHandler_GetStudentPracticeSessionDetailRejectsTeacherWithoutAssignment(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = false
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-session-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001", nil, "token")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeSessionDetailRejectsStudentOutsideClass(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = false
	repo.sessionBelongsToStudent = true
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-session-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001", nil, "token")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeSessionDetailRejectsSessionNotBelongToStudent(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = false
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-session-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001", nil, "token")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeSessionDetailRejectsInvalidQuery(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodGet, "/api/v1/analytics/student-practice-session-detail?class_id=101&course_id=12&student_user_id=7001&session_id=0", nil, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeSessionQuestionDetailSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.sessionQuestionBelongsToSession = true
	repo.studentPracticeSessionQuestionResult = StudentPracticeSessionQuestionDetailResult{
		StudentSummary: StudentPracticeSessionStudentSummary{
			StudentUserID: 7001,
			StudentName:   "张三",
			StudentNo:     strPtr("S001"),
			ClassID:       101,
			ClassName:     "一班",
			CourseID:      12,
			CourseName:    "数学",
		},
		Session: StudentPracticeSessionSummary{
			SessionID:     9001,
			Status:        "finished",
			PracticeMode:  "random",
			SourceMode:    "course",
			FlowMode:      "fixed_count",
			TotalCount:    2,
			AnsweredCount: 2,
			CorrectCount:  1,
			WrongCount:    1,
			Accuracy:      0.5,
		},
		QuestionDetail: StudentPracticeSessionQuestionItem{
			SessionQuestionID: 701,
			QuestionID:        1,
			QuestionVersionID: 11,
			DisplayOrder:      1,
			QuestionType:      "single_choice",
			Content:           map[string]any{"stem": map[string]any{"text": "1+1=?"}},
			StudentAnswer:     map[string]any{"selected_options": []any{"A"}},
			CorrectAnswer:     map[string]any{"selected_options": []any{"A"}},
			IsAnswered:        true,
			IsCorrect:         boolPtr(true),
		},
	}
	repo.studentPracticeSessionQuestionReviewPtr = &StudentPracticeSessionQuestionReview{
		ReviewID:       5001,
		ReviewerUserID: 7,
		ReviewComment:  "注意基础计算。",
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(
		router,
		http.MethodGet,
		"/api/v1/analytics/student-practice-session-question-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001&session_question_id=701",
		nil,
		"token",
	)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[StudentPracticeSessionQuestionDetailResult]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.Session.SessionID != 9001 {
		t.Fatalf("session = %+v", body.Data.Session)
	}
	if body.Data.QuestionDetail.SessionQuestionID != 701 {
		t.Fatalf("question detail = %+v", body.Data.QuestionDetail)
	}
	if body.Data.StudentSummary.StudentName != "张三" {
		t.Fatalf("student summary = %+v", body.Data.StudentSummary)
	}
	if body.Data.TeacherReview == nil || body.Data.TeacherReview.ReviewID != 5001 {
		t.Fatalf("teacher review = %+v", body.Data.TeacherReview)
	}
}

func TestHandler_GetStudentPracticeSessionQuestionDetailRejectsQuestionOutsideSession(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.sessionQuestionBelongsToSession = false
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(
		router,
		http.MethodGet,
		"/api/v1/analytics/student-practice-session-question-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001&session_question_id=701",
		nil,
		"token",
	)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_GetStudentPracticeSessionQuestionDetailRejectsInvalidQuery(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.sessionQuestionBelongsToSession = true
	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(
		router,
		http.MethodGet,
		"/api/v1/analytics/student-practice-session-question-detail?class_id=101&course_id=12&student_user_id=7001&session_id=9001&session_question_id=0",
		nil,
		"token",
	)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_PutStudentPracticeSessionQuestionReviewSuccess(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.sessionQuestionBelongsToSession = true
	repo.studentPracticeSessionQuestionResult = StudentPracticeSessionQuestionDetailResult{
		StudentSummary: StudentPracticeSessionStudentSummary{
			StudentUserID: 7001,
			StudentName:   "张三",
			ClassID:       101,
			CourseID:      12,
		},
		Session: StudentPracticeSessionSummary{
			SessionID: 9001,
			Status:    "finished",
		},
		QuestionDetail: StudentPracticeSessionQuestionItem{
			SessionQuestionID: 701,
			QuestionID:        1,
			QuestionVersionID: 11,
			DisplayOrder:      1,
			QuestionType:      "single_choice",
			Content:           map[string]any{"stem": map[string]any{"text": "1+1=?"}},
		},
	}
	repo.studentPracticeSessionQuestionReview = StudentPracticeSessionQuestionReview{
		ReviewID:       6001,
		ReviewerUserID: 7,
		ReviewComment:  "先列式再作答。",
	}

	router := newAnalyticsTestRouter(repo, fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodPut, "/api/v1/analytics/student-practice-session-question-review", map[string]any{
		"class_id":            101,
		"course_id":           12,
		"student_user_id":     7001,
		"session_id":          9001,
		"session_question_id": 701,
		"review_comment":      " 先列式再作答。 ",
	}, "token")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body analyticsEnvelope[StudentPracticeSessionQuestionReview]
	decodeAnalyticsBody(t, rec, &body)
	if body.Data.ReviewID != 6001 || body.Data.ReviewComment != "先列式再作答。" {
		t.Fatalf("review = %+v", body.Data)
	}
	if repo.lastUpsertStudentPracticeSessionQuestionReview.ReviewerUserID != 7 {
		t.Fatalf("upsert command = %+v", repo.lastUpsertStudentPracticeSessionQuestionReview)
	}
}

func TestHandler_PutStudentPracticeSessionQuestionReviewRejectsInvalidBody(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)

	router := newAnalyticsTestRouter(newMemoryAnalyticsRepository(), fakeAnalyticsParser{
		claims: auth.AccessClaims{
			TenantID:    1,
			UserID:      7,
			UserType:    "teacher",
			Permissions: []string{"analytics:view"},
			TokenType:   auth.TokenTypeAccess,
		},
	})

	rec := performAnalyticsRequest(router, http.MethodPut, "/api/v1/analytics/student-practice-session-question-review", map[string]any{
		"class_id":            101,
		"course_id":           12,
		"student_user_id":     7001,
		"session_id":          9001,
		"session_question_id": 701,
		"review_comment":      "   ",
	}, "token")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestService_GetStudentPracticeDetailNormalizesTimeAndPagination(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.studentPracticeSummary = StudentPracticeSummary{StudentUserID: 7001, StudentName: "张三", ClassID: 101, CourseID: 12}
	service := NewService(repo)
	fixedNow := time.Date(2024, 4, 22, 15, 4, 5, 0, time.UTC)
	service.now = func() time.Time { return fixedNow }

	result, err := service.GetStudentPracticeDetail(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, StudentPracticeDetailQuery{
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if result.ActiveTab != "sessions" {
		t.Fatalf("tab = %s", result.ActiveTab)
	}
	if repo.lastStudentPracticeQuery.Page != 1 || repo.lastStudentPracticeQuery.PageSize != 20 {
		t.Fatalf("pagination = %+v", repo.lastStudentPracticeQuery)
	}
	if repo.lastStudentPracticeQuery.StartAt == nil || repo.lastStudentPracticeQuery.EndAt == nil {
		t.Fatalf("time range = %+v", repo.lastStudentPracticeQuery)
	}
	if !repo.lastStudentPracticeQuery.StartAt.Equal(fixedNow.AddDate(0, 0, -30)) || !repo.lastStudentPracticeQuery.EndAt.Equal(fixedNow) {
		t.Fatalf("time range = %+v", repo.lastStudentPracticeQuery)
	}
	if repo.lastStudentPracticeQuery.Tab != StudentDetailTabSessions {
		t.Fatalf("tab = %s", repo.lastStudentPracticeQuery.Tab)
	}
	if repo.listStudentSessionsCalls != 1 || repo.listStudentWrongCalls != 0 || repo.listStudentConfusedCalls != 0 {
		t.Fatalf("calls = sessions:%d wrong:%d confused:%d", repo.listStudentSessionsCalls, repo.listStudentWrongCalls, repo.listStudentConfusedCalls)
	}
}

func TestService_GetStudentPracticeDetailRejectsInvalidTab(t *testing.T) {
	service := NewService(newMemoryAnalyticsRepository())

	_, err := service.GetStudentPracticeDetail(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, StudentPracticeDetailQuery{
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		Tab:           "all",
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_GetStudentPracticeDetailRejectsMissingPermission(t *testing.T) {
	service := NewService(newMemoryAnalyticsRepository())

	_, err := service.GetStudentPracticeDetail(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
	}, StudentPracticeDetailQuery{
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_GetStudentPracticeSessionDetailAdminScopes(t *testing.T) {
	for _, userType := range []string{"sys_admin", "school_admin"} {
		repo := newMemoryAnalyticsRepository()
		repo.classCourseExists = true
		repo.studentBelongsToClass = true
		repo.sessionBelongsToStudent = true
		repo.studentPracticeSessionDetailResult = StudentPracticeSessionDetailResult{
			StudentSummary: StudentPracticeSessionStudentSummary{
				StudentUserID: 7001,
				StudentName:   "张三",
				ClassID:       101,
				CourseID:      12,
			},
			Session: StudentPracticeSessionSummary{
				SessionID: 9001,
				Status:    "finished",
			},
		}
		service := NewService(repo)

		result, err := service.GetStudentPracticeSessionDetail(context.Background(), Scope{
			TenantID: 1,
			UserID:   7,
			UserType: userType,
			Permissions: []string{
				"analytics:view",
			},
		}, StudentPracticeSessionDetailQuery{
			ClassID:       101,
			CourseID:      12,
			StudentUserID: 7001,
			SessionID:     9001,
		})
		if err != nil {
			t.Fatalf("userType=%s err=%v", userType, err)
		}
		if result.Session.SessionID != 9001 {
			t.Fatalf("userType=%s session=%+v", userType, result.Session)
		}
		if repo.teacherCanViewCalls != 0 {
			t.Fatalf("userType=%s teacherCanViewCalls=%d", userType, repo.teacherCanViewCalls)
		}
		if repo.classCourseExistsCalls != 1 {
			t.Fatalf("userType=%s classCourseExistsCalls=%d", userType, repo.classCourseExistsCalls)
		}
		if repo.getStudentPracticeSessionDetailCalls != 1 {
			t.Fatalf("userType=%s getStudentPracticeSessionDetailCalls=%d", userType, repo.getStudentPracticeSessionDetailCalls)
		}
		if repo.lastStudentPracticeSessionDetailQuery.TenantID != 1 {
			t.Fatalf("userType=%s query=%+v", userType, repo.lastStudentPracticeSessionDetailQuery)
		}
	}
}

func TestService_GetStudentPracticeSessionDetailReturnsNotFoundWhenRepoRejectsSession(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = false

	service := NewService(repo)
	_, err := service.GetStudentPracticeSessionDetail(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, StudentPracticeSessionDetailQuery{
		ClassID:       101,
		CourseID:      12,
		StudentUserID: 7001,
		SessionID:     9001,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v", err)
	}
	if repo.getStudentPracticeSessionDetailCalls != 1 {
		t.Fatalf("getStudentPracticeSessionDetailCalls=%d", repo.getStudentPracticeSessionDetailCalls)
	}
	if repo.lastStudentPracticeSessionDetailQuery.StudentUserID != 7001 || repo.lastStudentPracticeSessionDetailQuery.SessionID != 9001 {
		t.Fatalf("query=%+v", repo.lastStudentPracticeSessionDetailQuery)
	}
}

func TestService_GetStudentPracticeSessionQuestionDetailAdminScopes(t *testing.T) {
	for _, userType := range []string{"sys_admin", "school_admin"} {
		repo := newMemoryAnalyticsRepository()
		repo.classCourseExists = true
		repo.studentBelongsToClass = true
		repo.sessionBelongsToStudent = true
		repo.sessionQuestionBelongsToSession = true
		repo.studentPracticeSessionQuestionResult = StudentPracticeSessionQuestionDetailResult{
			StudentSummary: StudentPracticeSessionStudentSummary{
				StudentUserID: 7001,
				StudentName:   "张三",
				ClassID:       101,
				CourseID:      12,
			},
			Session: StudentPracticeSessionSummary{
				SessionID: 9001,
				Status:    "finished",
			},
			QuestionDetail: StudentPracticeSessionQuestionItem{
				SessionQuestionID: 701,
				QuestionID:        1,
				QuestionVersionID: 11,
				DisplayOrder:      1,
				QuestionType:      "single_choice",
				Content:           map[string]any{"stem": map[string]any{"text": "1+1=?"}},
				IsAnswered:        true,
			},
		}
		repo.studentPracticeSessionQuestionReviewPtr = &StudentPracticeSessionQuestionReview{
			ReviewID:       9001,
			ReviewerUserID: 7,
			ReviewComment:  "注意审题。",
		}
		service := NewService(repo)

		result, err := service.GetStudentPracticeSessionQuestionDetail(context.Background(), Scope{
			TenantID: 1,
			UserID:   7,
			UserType: userType,
			Permissions: []string{
				"analytics:view",
			},
		}, StudentPracticeSessionQuestionDetailQuery{
			ClassID:           101,
			CourseID:          12,
			StudentUserID:     7001,
			SessionID:         9001,
			SessionQuestionID: 701,
		})
		if err != nil {
			t.Fatalf("userType=%s err=%v", userType, err)
		}
		if result.QuestionDetail.SessionQuestionID != 701 {
			t.Fatalf("userType=%s result=%+v", userType, result)
		}
		if result.TeacherReview == nil || result.TeacherReview.ReviewID != 9001 {
			t.Fatalf("userType=%s teacherReview=%+v", userType, result.TeacherReview)
		}
		if repo.teacherCanViewCalls != 0 {
			t.Fatalf("userType=%s teacherCanViewCalls=%d", userType, repo.teacherCanViewCalls)
		}
		if repo.classCourseExistsCalls != 1 {
			t.Fatalf("userType=%s classCourseExistsCalls=%d", userType, repo.classCourseExistsCalls)
		}
		if repo.getStudentPracticeSessionQuestionCall != 1 {
			t.Fatalf("userType=%s getStudentPracticeSessionQuestionCall=%d", userType, repo.getStudentPracticeSessionQuestionCall)
		}
		if repo.lastStudentPracticeSessionQuestion.TenantID != 1 {
			t.Fatalf("userType=%s query=%+v", userType, repo.lastStudentPracticeSessionQuestion)
		}
	}
}

func TestService_UpsertStudentPracticeSessionQuestionReviewTrimsComment(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.sessionQuestionBelongsToSession = true
	repo.studentPracticeSessionQuestionResult = StudentPracticeSessionQuestionDetailResult{
		StudentSummary: StudentPracticeSessionStudentSummary{
			StudentUserID: 7001,
			StudentName:   "张三",
			ClassID:       101,
			CourseID:      12,
		},
		Session: StudentPracticeSessionSummary{
			SessionID: 9001,
			Status:    "finished",
		},
		QuestionDetail: StudentPracticeSessionQuestionItem{
			SessionQuestionID: 701,
			QuestionID:        1,
			QuestionVersionID: 11,
			DisplayOrder:      1,
			QuestionType:      "single_choice",
			Content:           map[string]any{"stem": map[string]any{"text": "1+1=?"}},
		},
	}
	repo.studentPracticeSessionQuestionReview = StudentPracticeSessionQuestionReview{
		ReviewID:       8080,
		ReviewerUserID: 7,
		ReviewComment:  "注意单位。",
	}

	service := NewService(repo)
	result, err := service.UpsertStudentPracticeSessionQuestionReview(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, UpsertStudentPracticeSessionQuestionReviewCommand{
		ClassID:           101,
		CourseID:          12,
		StudentUserID:     7001,
		SessionID:         9001,
		SessionQuestionID: 701,
		ReviewComment:     " 注意单位。 ",
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if result.ReviewID != 8080 || result.ReviewComment != "注意单位。" {
		t.Fatalf("result = %+v", result)
	}
	if repo.lastUpsertStudentPracticeSessionQuestionReview.ReviewComment != "注意单位。" {
		t.Fatalf("command = %+v", repo.lastUpsertStudentPracticeSessionQuestionReview)
	}
}

func TestService_UpsertStudentPracticeSessionQuestionReviewRejectsBlankComment(t *testing.T) {
	service := NewService(newMemoryAnalyticsRepository())

	_, err := service.UpsertStudentPracticeSessionQuestionReview(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, UpsertStudentPracticeSessionQuestionReviewCommand{
		ClassID:           101,
		CourseID:          12,
		StudentUserID:     7001,
		SessionID:         9001,
		SessionQuestionID: 701,
		ReviewComment:     "   ",
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("error = %v", err)
	}
}

func TestService_GetStudentPracticeSessionQuestionDetailReturnsNotFoundWhenRepoRejectsQuestion(t *testing.T) {
	repo := newMemoryAnalyticsRepository()
	repo.classCourseExists = true
	repo.teacherAllowed = true
	repo.studentBelongsToClass = true
	repo.sessionBelongsToStudent = true
	repo.sessionQuestionBelongsToSession = false

	service := NewService(repo)
	_, err := service.GetStudentPracticeSessionQuestionDetail(context.Background(), Scope{
		TenantID: 1,
		UserID:   7,
		UserType: "teacher",
		Permissions: []string{
			"analytics:view",
		},
	}, StudentPracticeSessionQuestionDetailQuery{
		ClassID:           101,
		CourseID:          12,
		StudentUserID:     7001,
		SessionID:         9001,
		SessionQuestionID: 701,
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v", err)
	}
	if repo.getStudentPracticeSessionQuestionCall != 1 {
		t.Fatalf("getStudentPracticeSessionQuestionCall=%d", repo.getStudentPracticeSessionQuestionCall)
	}
	if repo.lastStudentPracticeSessionQuestion.SessionQuestionID != 701 {
		t.Fatalf("query=%+v", repo.lastStudentPracticeSessionQuestion)
	}
}

type analyticsEnvelope[T any] struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      T      `json:"data"`
	RequestID string `json:"request_id,omitempty"`
}

type fakeAnalyticsParser struct {
	claims auth.AccessClaims
	err    error
}

func (parser fakeAnalyticsParser) ParseToken(_ context.Context, token string, tokenType string) (auth.AccessClaims, error) {
	if token == "" || tokenType != auth.TokenTypeAccess {
		return auth.AccessClaims{}, auth.ErrInvalidToken
	}
	if parser.err != nil {
		return auth.AccessClaims{}, parser.err
	}
	return parser.claims, nil
}

func newAnalyticsTestRouter(repo *memoryAnalyticsRepository, parser fakeAnalyticsParser) http.Handler {
	handler := NewHandler(NewService(repo), parser)
	router := gin.New()
	api := router.Group("/api/v1")
	handler.RegisterRoutes(api)
	return router
}

type memoryAnalyticsRepository struct {
	classCourseExists                     bool
	teacherAllowed                        bool
	summary                               ClassPracticeSummary
	students                              []ClassPracticeStudentItem
	lastQuery                             ClassPracticeSummaryQuery
	options                               []ClassCourseOption
	lastScope                             Scope
	classCourseExistsCalls                int
	teacherCanViewCalls                   int
	studentBelongsToClass                 bool
	studentPracticeSummary                StudentPracticeSummary
	studentPracticeSessions               []StudentPracticeSessionItem
	studentPracticeWrongQuestions         []StudentPracticeQuestionItem
	studentPracticeConfusedQuestions      []StudentPracticeQuestionItem
	lastStudentPracticeQuery              StudentPracticeDetailQuery
	listStudentSessionsCalls              int
	listStudentWrongCalls                 int
	listStudentConfusedCalls              int
	sessionBelongsToStudent               bool
	studentPracticeSessionDetailResult    StudentPracticeSessionDetailResult
	lastStudentPracticeSessionDetailQuery StudentPracticeSessionDetailQuery
	getStudentPracticeSessionDetailCalls  int
	sessionQuestionBelongsToSession       bool
	studentPracticeSessionQuestionResult  StudentPracticeSessionQuestionDetailResult
	lastStudentPracticeSessionQuestion    StudentPracticeSessionQuestionDetailQuery
	getStudentPracticeSessionQuestionCall int
	studentPracticeSessionQuestionReviewPtr *StudentPracticeSessionQuestionReview
	studentPracticeSessionQuestionReview    StudentPracticeSessionQuestionReview
	lastUpsertStudentPracticeSessionQuestionReview UpsertStudentPracticeSessionQuestionReviewCommand
	upsertStudentPracticeSessionQuestionReviewCalls int
}

func newMemoryAnalyticsRepository() *memoryAnalyticsRepository {
	return &memoryAnalyticsRepository{}
}

func (repo *memoryAnalyticsRepository) ClassCourseExists(_ context.Context, _ int64, _ int64, _ int64) (bool, error) {
	repo.classCourseExistsCalls++
	return repo.classCourseExists, nil
}

func (repo *memoryAnalyticsRepository) TeacherCanViewClassCourse(_ context.Context, _ int64, _ int64, _ int64, _ int64) (bool, error) {
	repo.teacherCanViewCalls++
	return repo.teacherAllowed, nil
}

func (repo *memoryAnalyticsRepository) GetClassPracticeSummary(_ context.Context, query ClassPracticeSummaryQuery) (ClassPracticeSummary, error) {
	repo.lastQuery = query
	return repo.summary, nil
}

func (repo *memoryAnalyticsRepository) ListClassPracticeStudents(_ context.Context, query ClassPracticeSummaryQuery) (PageResult[ClassPracticeStudentItem], error) {
	repo.lastQuery = query
	return pageOf(repo.students, query.Page, query.PageSize), nil
}

func (repo *memoryAnalyticsRepository) ListClassCourseOptions(_ context.Context, scope Scope) ([]ClassCourseOption, error) {
	repo.lastScope = scope
	return append([]ClassCourseOption{}, repo.options...), nil
}

func (repo *memoryAnalyticsRepository) StudentBelongsToClass(_ context.Context, _ int64, _ int64, _ int64) (bool, error) {
	return repo.studentBelongsToClass, nil
}

func (repo *memoryAnalyticsRepository) GetStudentPracticeSummary(_ context.Context, query StudentPracticeDetailQuery) (StudentPracticeSummary, error) {
	repo.lastStudentPracticeQuery = query
	return repo.studentPracticeSummary, nil
}

func (repo *memoryAnalyticsRepository) ListStudentPracticeSessions(_ context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeSessionItem], error) {
	repo.lastStudentPracticeQuery = query
	repo.listStudentSessionsCalls++
	return pageOf(repo.studentPracticeSessions, query.Page, query.PageSize), nil
}

func (repo *memoryAnalyticsRepository) ListStudentWrongQuestions(_ context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error) {
	repo.lastStudentPracticeQuery = query
	repo.listStudentWrongCalls++
	return pageOf(repo.studentPracticeWrongQuestions, query.Page, query.PageSize), nil
}

func (repo *memoryAnalyticsRepository) ListStudentConfusedQuestions(_ context.Context, query StudentPracticeDetailQuery) (PageResult[StudentPracticeQuestionItem], error) {
	repo.lastStudentPracticeQuery = query
	repo.listStudentConfusedCalls++
	return pageOf(repo.studentPracticeConfusedQuestions, query.Page, query.PageSize), nil
}

func (repo *memoryAnalyticsRepository) GetStudentPracticeSessionDetail(_ context.Context, query StudentPracticeSessionDetailQuery) (StudentPracticeSessionDetailResult, error) {
	repo.lastStudentPracticeSessionDetailQuery = query
	repo.getStudentPracticeSessionDetailCalls++
	if !repo.sessionBelongsToStudent {
		return StudentPracticeSessionDetailResult{}, ErrNotFound
	}
	return repo.studentPracticeSessionDetailResult, nil
}

func (repo *memoryAnalyticsRepository) GetStudentPracticeSessionQuestionDetail(_ context.Context, query StudentPracticeSessionQuestionDetailQuery) (StudentPracticeSessionQuestionDetailResult, error) {
	repo.lastStudentPracticeSessionQuestion = query
	repo.getStudentPracticeSessionQuestionCall++
	if !repo.sessionBelongsToStudent || !repo.sessionQuestionBelongsToSession {
		return StudentPracticeSessionQuestionDetailResult{}, ErrNotFound
	}
	return repo.studentPracticeSessionQuestionResult, nil
}

func (repo *memoryAnalyticsRepository) GetStudentPracticeSessionQuestionReview(_ context.Context, _ StudentPracticeSessionQuestionDetailQuery) (*StudentPracticeSessionQuestionReview, error) {
	return repo.studentPracticeSessionQuestionReviewPtr, nil
}

func (repo *memoryAnalyticsRepository) UpsertStudentPracticeSessionQuestionReview(_ context.Context, command UpsertStudentPracticeSessionQuestionReviewCommand) (StudentPracticeSessionQuestionReview, error) {
	repo.lastUpsertStudentPracticeSessionQuestionReview = command
	repo.upsertStudentPracticeSessionQuestionReviewCalls++
	return repo.studentPracticeSessionQuestionReview, nil
}

func performAnalyticsRequest(router http.Handler, method string, path string, body any, token string) *httptest.ResponseRecorder {
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

func decodeAnalyticsBody[T any](t *testing.T, rec *httptest.ResponseRecorder, target *T) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func strPtr(value string) *string {
	return &value
}

func timePtr(value time.Time) *time.Time {
	return &value
}

func boolPtr(value bool) *bool {
	return &value
}
