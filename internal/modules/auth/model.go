package auth

const (
	UserStatusActive           = "active"
	CodeInvalidCredentials     = 40101
	CodeInvalidRequest         = 40000
	CodeInvalidToken           = 40102
	CodePasswordChangeRequired = 40103
	TokenTypeAccess            = "access"
	TokenTypeRefresh           = "refresh"
)

type User struct {
	ID                 int64
	TenantID           int64
	Username           string
	PasswordHash       string
	DisplayName        string
	AvatarURL          string
	UserType           string
	Status             string
	MustChangePassword bool
	Roles              []string
	Permissions        []string
}

type LoginCommand struct {
	TenantCode string `json:"tenant_code" binding:"required"`
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
}

type ChangeInitialPasswordCommand struct {
	TenantCode  string `json:"tenant_code" binding:"required"`
	Username    string `json:"username" binding:"required"`
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

type LoginOrganization struct {
	TenantID   int64  `json:"tenant_id"`
	TenantCode string `json:"tenant_code"`
	TenantName string `json:"tenant_name"`
	TenantType string `json:"tenant_type"`
	IsDefault  bool   `json:"is_default,omitempty"`
}

type RefreshCommand struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type LoginResult struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	ExpiresIn    int64       `json:"expires_in"`
	User         CurrentUser `json:"user"`
}

type CurrentUser struct {
	ID                 int64    `json:"id"`
	TenantID           int64    `json:"tenant_id"`
	DisplayName        string   `json:"display_name"`
	AvatarURL          string   `json:"avatar_url,omitempty"`
	UserType           string   `json:"user_type"`
	MustChangePassword bool     `json:"must_change_password"`
	Roles              []string `json:"roles"`
	Permissions        []string `json:"permissions,omitempty"`
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
}
