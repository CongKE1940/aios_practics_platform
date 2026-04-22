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
