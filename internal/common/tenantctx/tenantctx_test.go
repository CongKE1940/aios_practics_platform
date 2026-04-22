package tenantctx

import (
	"context"
	"testing"
)

func TestWithTenantStoresTenantContext(t *testing.T) {
	ctx := WithTenant(context.Background(), Tenant{
		ID:         23,
		Code:       "school_alpha",
		IsPlatform: false,
	})

	tenant, ok := FromContext(ctx)
	if !ok {
		t.Fatal("FromContext() ok = false")
	}
	if tenant.ID != 23 {
		t.Fatalf("tenant.ID = %d", tenant.ID)
	}
	if tenant.Code != "school_alpha" {
		t.Fatalf("tenant.Code = %q", tenant.Code)
	}
	if tenant.IsPlatform {
		t.Fatal("tenant.IsPlatform = true")
	}
}

func TestPlatformTenantIsStableVirtualTenant(t *testing.T) {
	tenant := PlatformTenant()

	if tenant.ID != 1 {
		t.Fatalf("tenant.ID = %d", tenant.ID)
	}
	if tenant.Code != "platform" {
		t.Fatalf("tenant.Code = %q", tenant.Code)
	}
	if !tenant.IsPlatform {
		t.Fatal("tenant.IsPlatform = false")
	}
}
