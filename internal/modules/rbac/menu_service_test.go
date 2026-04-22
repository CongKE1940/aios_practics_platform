package rbac

import "testing"

func TestBuildMenusFiltersByPermissions(t *testing.T) {
	menus := BuildMenus("admin", []string{"org:manage", "notice:manage"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 2 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[0].Path != "/admin/org" {
		t.Fatalf("child[0].Path = %q", menus[0].Children[0].Path)
	}
	if menus[0].Children[1].Path != "/admin/notices" {
		t.Fatalf("child[1].Path = %q", menus[0].Children[1].Path)
	}
}

func TestBuildMenusIncludesQuestionBankEntries(t *testing.T) {
	menus := BuildMenus("admin", []string{"question_bank:manage", "question:manage"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 2 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[0].Path != "/admin/question-banks" {
		t.Fatalf("child[0].Path = %q", menus[0].Children[0].Path)
	}
	if menus[0].Children[1].Path != "/admin/questions" {
		t.Fatalf("child[1].Path = %q", menus[0].Children[1].Path)
	}
}

func TestBuildMenusIncludesImportCenterEntry(t *testing.T) {
	menus := BuildMenus("admin", []string{"import:manage"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 1 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[0].Path != "/admin/imports" {
		t.Fatalf("child[0].Path = %q", menus[0].Children[0].Path)
	}
	if menus[0].Children[0].Name != "导入中心" {
		t.Fatalf("child[0].Name = %q", menus[0].Children[0].Name)
	}
}

func TestBuildUserMenusIncludesPracticeCenter(t *testing.T) {
	menus := BuildMenus("user", []string{"practice:use"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 6 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	if menus[0].Children[1].Path != "/app/practice" {
		t.Fatalf("practice path = %q", menus[0].Children[1].Path)
	}
}

func TestBuildUserMenusIncludesPracticeReviewEntries(t *testing.T) {
	menus := BuildMenus("user", []string{"practice:use"})

	if len(menus) != 1 {
		t.Fatalf("len(menus) = %d", len(menus))
	}
	if len(menus[0].Children) != 6 {
		t.Fatalf("len(children) = %d", len(menus[0].Children))
	}
	wantPaths := []string{"/app/courses", "/app/practice", "/app/practice/history", "/app/practice/wrong", "/app/practice/mastered", "/app/practice/confused"}
	wantNames := []string{"我的课程", "练题中心", "练题记录", "错题本", "熟题本", "疑惑题"}
	for i := range wantPaths {
		if menus[0].Children[i].Path != wantPaths[i] {
			t.Fatalf("child[%d].Path = %q", i, menus[0].Children[i].Path)
		}
		if menus[0].Children[i].Name != wantNames[i] {
			t.Fatalf("child[%d].Name = %q", i, menus[0].Children[i].Name)
		}
	}
}
