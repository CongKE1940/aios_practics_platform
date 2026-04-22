package tenantctx

import "context"

const (
	PlatformTenantID   int64  = 1
	PlatformTenantCode string = "platform"
)

type Tenant struct {
	ID         int64
	Code       string
	IsPlatform bool
}

type contextKey struct{}

func WithTenant(ctx context.Context, tenant Tenant) context.Context {
	return context.WithValue(ctx, contextKey{}, tenant)
}

func FromContext(ctx context.Context) (Tenant, bool) {
	tenant, ok := ctx.Value(contextKey{}).(Tenant)
	return tenant, ok
}

func PlatformTenant() Tenant {
	return Tenant{
		ID:         PlatformTenantID,
		Code:       PlatformTenantCode,
		IsPlatform: true,
	}
}
