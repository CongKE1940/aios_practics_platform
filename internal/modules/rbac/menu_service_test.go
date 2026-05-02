package rbac

import (
	"testing"

	"aios_practice_platform/internal/modules/auth"
)

func TestBuildMenusFiltersByPermissions(t *testing.T) {
	menus := BuildMenus("admin", []string{"org:manage", "notice:manage"})

	if len(menus) != 4 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if menus[0].Path != "/admin/workbench" {
		t.Fatalf("menu[0].Path = %q", menus[0].Path)
	}
	if menus[1].Path != "/admin/org" {
		t.Fatalf("menu[1].Path = %q", menus[1].Path)
	}
	if menus[2].Path != "/admin/courses" {
		t.Fatalf("menu[2].Path = %q", menus[2].Path)
	}
	if len(menus[3].Children) != 1 {
		t.Fatalf("len(system children) = %d", len(menus[3].Children))
	}
	if menus[3].Children[0].Path != "/admin/notices" {
		t.Fatalf("system child[0].Path = %q", menus[3].Children[0].Path)
	}
}

func TestBuildMenusIncludesQuestionBankEntries(t *testing.T) {
	menus := BuildMenus("admin", []string{"question_bank:manage", "question:manage"})

	if len(menus) != 2 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[1].Children) != 3 {
		t.Fatalf("len(children) = %d", len(menus[1].Children))
	}
	if menus[1].Children[0].Path != "/admin/question-banks" {
		t.Fatalf("child[0].Path = %q", menus[1].Children[0].Path)
	}
	if menus[1].Children[1].Path != "/admin/questions" {
		t.Fatalf("child[1].Path = %q", menus[1].Children[1].Path)
	}
	if menus[1].Children[2].Path != "/admin/challenges" {
		t.Fatalf("child[2].Path = %q", menus[1].Children[2].Path)
	}
}

func TestBuildMenusIncludesImportCenterEntry(t *testing.T) {
	menus := BuildMenus("admin", []string{"import:manage"})

	if len(menus) != 2 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[1].Children) != 1 {
		t.Fatalf("len(children) = %d", len(menus[1].Children))
	}
	if menus[1].Children[0].Path != "/admin/imports" {
		t.Fatalf("child[0].Path = %q", menus[1].Children[0].Path)
	}
	if menus[1].Children[0].Name != "导入中心" {
		t.Fatalf("child[0].Name = %q", menus[1].Children[0].Name)
	}
}

func TestBuildMenusIncludesAnalyticsAndHistoryEntries(t *testing.T) {
	menus := BuildMenus("admin", []string{"analytics:view", "audit:view"})

	if len(menus) != 2 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[1].Children) != 2 {
		t.Fatalf("len(children) = %d", len(menus[1].Children))
	}
	if menus[1].Children[0].Path != "/admin/analytics" {
		t.Fatalf("child[0].Path = %q", menus[1].Children[0].Path)
	}
	if menus[1].Children[0].Name != "数据看板" {
		t.Fatalf("child[0].Name = %q", menus[1].Children[0].Name)
	}
	if menus[1].Children[1].Path != "/admin/history" {
		t.Fatalf("child[1].Path = %q", menus[1].Children[1].Path)
	}
	if menus[1].Children[1].Name != "快照历史" {
		t.Fatalf("child[1].Name = %q", menus[1].Children[1].Name)
	}
}

func TestBuildMenusIncludesExamAndChallengeEntries(t *testing.T) {
	menus := BuildMenus("admin", []string{"exam:manage", "question:manage"})

	if len(menus) != 2 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[1].Children) != 5 {
		t.Fatalf("len(children) = %d", len(menus[1].Children))
	}
	if menus[1].Children[0].Path != "/admin/questions" {
		t.Fatalf("child[0].Path = %q", menus[1].Children[0].Path)
	}
	if menus[1].Children[1].Path != "/admin/exams" {
		t.Fatalf("child[1].Path = %q", menus[1].Children[1].Path)
	}
	if menus[1].Children[2].Path != "/admin/exam-papers" {
		t.Fatalf("child[2].Path = %q", menus[1].Children[2].Path)
	}
	if menus[1].Children[3].Path != "/admin/exams/assembly" {
		t.Fatalf("child[3].Path = %q", menus[1].Children[3].Path)
	}
	if menus[1].Children[4].Path != "/admin/challenges" {
		t.Fatalf("child[4].Path = %q", menus[1].Children[4].Path)
	}
}

func TestBuildMenusIncludesConfigurationByScope(t *testing.T) {
	tenantMenus := BuildMenus("admin", []string{"tenant:manage"})
	if !containsMenuPath(tenantMenus, "/admin/tenant/roles") {
		t.Fatalf("tenant role config should be visible: %+v", tenantMenus)
	}
	if containsMenuPath(tenantMenus, "/admin/system/config") {
		t.Fatalf("system config should be hidden from tenant admin")
	}

	systemMenus := BuildMenus("admin", []string{"system:manage"})
	if !containsMenuPath(systemMenus, "/admin/system/config") {
		t.Fatalf("system config should be visible: %+v", systemMenus)
	}
}

func TestBuildUserMenusIncludesPracticeCenter(t *testing.T) {
	menus := BuildMenus("user", []string{"practice:use"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 10 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[0].Path != "/app/workbench" {
		t.Fatalf("workbench path = %q", menus[0].Children[0].Path)
	}
	if menus[0].Children[2].Path != "/app/practice" {
		t.Fatalf("practice path = %q", menus[0].Children[2].Path)
	}
}

func TestBuildUserMenusIncludesPracticeReviewEntries(t *testing.T) {
	menus := BuildMenus("user", []string{"practice:use"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 10 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	wantPaths := []string{"/app/workbench", "/app/courses", "/app/practice", "/app/practice/history", "/app/practice/wrong", "/app/practice/mastered", "/app/practice/confused", "/app/notifications", "/app/announcements", "/app/exams"}
	wantNames := []string{"工作台", "我的课程", "练题中心", "练题记录", "错题本", "熟题本", "疑惑题", "通知中心", "系统公告", "考试入口"}
	for i := range wantPaths {
		if menus[0].Children[i].Path != wantPaths[i] {
			t.Fatalf("child[%d].Path = %q", i, menus[0].Children[i].Path)
		}
		if menus[0].Children[i].Name != wantNames[i] {
			t.Fatalf("child[%d].Name = %q", i, menus[0].Children[i].Name)
		}
	}
}

func TestBuildUserMenusIncludesClassLearningWithAnalyticsPermission(t *testing.T) {
	menus := BuildMenus("user", []string{"practice:use", "analytics:view"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 11 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[7].Path != "/app/class-learning" {
		t.Fatalf("class learning path = %q", menus[0].Children[7].Path)
	}
	if menus[0].Children[7].Name != "班级学习" {
		t.Fatalf("class learning name = %q", menus[0].Children[7].Name)
	}
	if menus[0].Children[10].Path != "/app/exams" {
		t.Fatalf("exam path = %q", menus[0].Children[10].Path)
	}
	if menus[0].Children[10].Name != "考试入口" {
		t.Fatalf("exam name = %q", menus[0].Children[10].Name)
	}
}

func TestBuildUserMenusHidesClassLearningWithoutAnalyticsPermission(t *testing.T) {
	menus := BuildMenus("user", []string{"practice:use"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	foundExam := false
	for _, child := range menus[0].Children {
		if child.Path == "/app/class-learning" {
			t.Fatalf("class learning should be hidden without analytics:view")
		}
		if child.Path == "/app/exams" {
			foundExam = true
		}
	}
	if !foundExam {
		t.Fatalf("exam entry should be visible with practice:use")
	}
}

func TestBuildUserMenusIncludesTeacherExamManagementWithPublishPermission(t *testing.T) {
	menus := BuildMenus("user", []string{"exam:publish"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 4 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[0].Path != "/app/workbench" {
		t.Fatalf("workbench path = %q", menus[0].Children[0].Path)
	}
	if menus[0].Children[1].Path != "/app/notifications" {
		t.Fatalf("notification path = %q", menus[0].Children[1].Path)
	}
	if menus[0].Children[2].Path != "/app/announcements" {
		t.Fatalf("announcement path = %q", menus[0].Children[2].Path)
	}
	if menus[0].Children[3].Path != "/app/exams" {
		t.Fatalf("exam path = %q", menus[0].Children[3].Path)
	}
	if menus[0].Children[3].Name != "考试管理" {
		t.Fatalf("exam name = %q", menus[0].Children[3].Name)
	}
}

func TestBuildUserMenusIncludesQuestionBankForTeacherAndStudent(t *testing.T) {
	teacherMenus := BuildMenusForClaims("user", auth.AccessClaims{
		UserType: "teacher",
	})
	if !containsMenuPath(teacherMenus, "/app/teacher-banks") {
		t.Fatalf("teacher question bank menu should be visible: %+v", teacherMenus)
	}
	if !containsMenuPath(teacherMenus, "/app/exams") {
		t.Fatalf("teacher exam menu should be visible: %+v", teacherMenus)
	}

	studentMenus := BuildMenusForClaims("user", auth.AccessClaims{
		UserType: "student",
	})
	if !containsMenuPath(studentMenus, "/app/teacher-banks") {
		t.Fatalf("student question bank menu should be visible: %+v", studentMenus)
	}
	if containsMenuPath(studentMenus, "/app/exams") {
		t.Fatalf("student exam menu still requires practice permission: %+v", studentMenus)
	}
}

func containsMenuPath(menus []MenuItem, path string) bool {
	for _, menu := range menus {
		if menu.Path == path || containsMenuPath(menu.Children, path) {
			return true
		}
	}
	return false
}
