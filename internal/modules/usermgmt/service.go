package usermgmt

import (
	"context"
	"crypto/rand"
	"math/big"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	repo   Repository
	hasher PasswordHasher
}

func NewService(repo Repository) *Service {
	return &Service{
		repo:   repo,
		hasher: BcryptPasswordHasher{},
	}
}

func (service *Service) ListUsers(ctx context.Context, tenantID int64, filter UserListFilter) (PageResult[User], error) {
	return service.repo.ListUsers(ctx, tenantID, normalizeUserFilter(filter))
}

func (service *Service) GetUser(ctx context.Context, tenantID int64, id int64) (User, error) {
	return service.repo.GetUser(ctx, tenantID, id)
}

func (service *Service) CreateUser(ctx context.Context, scope Scope, input UserInput) (User, error) {
	tenantID := scope.TenantID
	if tenantID <= 0 {
		return User{}, ErrInvalidInput
	}
	if err := service.ensureManageableUserInput(ctx, scope, tenantID, input); err != nil {
		return User{}, err
	}
	initialPassword, err := generateInitialPassword()
	if err != nil {
		return User{}, err
	}
	passwordHash, err := service.hasher.Hash(initialPassword)
	if err != nil {
		return User{}, err
	}
	user, err := service.repo.CreateUser(ctx, User{
		TenantID:           tenantID,
		Username:           input.Username,
		Phone:              input.Phone,
		Email:              input.Email,
		DisplayName:        input.DisplayName,
		UserType:           input.UserType,
		Status:             UserStatusActive,
		MustChangePassword: true,
		RoleIDs:            append([]int64{}, input.RoleIDs...),
	}, passwordHash)
	if err != nil {
		return User{}, err
	}
	user.InitialPassword = initialPassword
	return user, nil
}

func (service *Service) UpdateUser(ctx context.Context, tenantID int64, id int64, input UserInput) (User, error) {
	return service.updateUser(ctx, scopeFromTenantID(tenantID), id, input)
}

func (service *Service) UpdateUserWithScope(ctx context.Context, scope Scope, id int64, input UserInput) (User, error) {
	return service.updateUser(ctx, scope, id, input)
}

func (service *Service) updateUser(ctx context.Context, scope Scope, id int64, input UserInput) (User, error) {
	current, err := service.repo.GetUser(ctx, userLookupTenantID(scope), id)
	if err != nil {
		return User{}, err
	}
	if !canManageTargetUser(scope, current.UserType) {
		return User{}, ErrForbidden
	}
	if err := service.ensureManageableUserInput(ctx, scope, current.TenantID, input); err != nil {
		return User{}, err
	}
	current.Username = input.Username
	current.Phone = input.Phone
	current.Email = input.Email
	current.DisplayName = input.DisplayName
	current.UserType = input.UserType
	current.RoleIDs = append([]int64{}, input.RoleIDs...)
	return service.repo.UpdateUser(ctx, current)
}

func (service *Service) GetCurrentUser(ctx context.Context, tenantID int64, userID int64) (User, error) {
	return service.repo.GetUser(ctx, tenantID, userID)
}

func (service *Service) UpdateCurrentUserProfile(ctx context.Context, tenantID int64, userID int64, input ProfileInput) (User, error) {
	current, err := service.repo.GetUser(ctx, tenantID, userID)
	if err != nil {
		return User{}, err
	}
	if strings.TrimSpace(input.DisplayName) == "" {
		return User{}, ErrInvalidInput
	}
	current.DisplayName = strings.TrimSpace(input.DisplayName)
	current.Phone = strings.TrimSpace(input.Phone)
	current.Email = strings.TrimSpace(input.Email)
	return service.repo.UpdateProfile(ctx, current)
}

func (service *Service) ChangeCurrentPassword(ctx context.Context, tenantID int64, userID int64, input ChangePasswordInput) (User, error) {
	if !isUsableNewPassword(input.OldPassword, input.NewPassword) {
		return User{}, ErrInvalidInput
	}
	current, err := service.repo.GetUser(ctx, tenantID, userID)
	if err != nil {
		return User{}, err
	}
	if !service.hasher.Verify(current.PasswordHash, input.OldPassword) {
		return User{}, ErrInvalidInput
	}
	passwordHash, err := service.hasher.Hash(input.NewPassword)
	if err != nil {
		return User{}, err
	}
	return service.repo.ResetPassword(ctx, current.TenantID, current.ID, passwordHash, false)
}

func (service *Service) AssignRoles(ctx context.Context, tenantID int64, userID int64, input UserRolesInput) (User, error) {
	return service.AssignRolesWithScope(ctx, scopeFromTenantID(tenantID), userID, input)
}

func (service *Service) AssignRolesWithScope(ctx context.Context, scope Scope, userID int64, input UserRolesInput) (User, error) {
	user, err := service.repo.GetUser(ctx, userLookupTenantID(scope), userID)
	if err != nil {
		return User{}, err
	}
	if !canManageTargetUser(scope, user.UserType) {
		return User{}, ErrForbidden
	}
	if err := service.ensureAssignableRoles(ctx, scope, user.TenantID, input.RoleIDs); err != nil {
		return User{}, err
	}
	return service.repo.AssignRoles(ctx, user.TenantID, userID, input.RoleIDs)
}

func (service *Service) DisableUser(ctx context.Context, tenantID int64, userID int64) (User, error) {
	return service.DisableUserWithScope(ctx, scopeFromTenantID(tenantID), userID)
}

func (service *Service) DisableUserWithScope(ctx context.Context, scope Scope, userID int64) (User, error) {
	user, err := service.repo.GetUser(ctx, userLookupTenantID(scope), userID)
	if err != nil {
		return User{}, err
	}
	if !canManageTargetUser(scope, user.UserType) {
		return User{}, ErrForbidden
	}
	return service.repo.DisableUser(ctx, user.TenantID, userID)
}

func (service *Service) ResetPassword(ctx context.Context, tenantID int64, userID int64, input ResetPasswordInput) (User, error) {
	return service.ResetPasswordWithScope(ctx, scopeFromTenantID(tenantID), userID, input)
}

func (service *Service) ResetPasswordWithScope(ctx context.Context, scope Scope, userID int64, input ResetPasswordInput) (User, error) {
	user, err := service.repo.GetUser(ctx, userLookupTenantID(scope), userID)
	if err != nil {
		return User{}, err
	}
	if !canManageTargetUser(scope, user.UserType) {
		return User{}, ErrForbidden
	}
	initialPassword, err := generateInitialPassword()
	if err != nil {
		return User{}, err
	}
	passwordHash, err := service.hasher.Hash(initialPassword)
	if err != nil {
		return User{}, err
	}
	user, err = service.repo.ResetPassword(ctx, user.TenantID, userID, passwordHash, true)
	if err != nil {
		return User{}, err
	}
	user.InitialPassword = initialPassword
	return user, nil
}

func normalizeUserFilter(filter UserListFilter) UserListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func (service *Service) ensureManageableUserInput(ctx context.Context, scope Scope, tenantID int64, input UserInput) error {
	if !isKnownUserType(input.UserType) {
		return ErrInvalidInput
	}
	if !canManageTargetUser(scope, input.UserType) {
		return ErrForbidden
	}
	return service.ensureAssignableRoles(ctx, scope, tenantID, input.RoleIDs)
}

func (service *Service) ensureAssignableRoles(ctx context.Context, scope Scope, tenantID int64, roleIDs []int64) error {
	if isPrivilegedUserManager(scope) || len(roleIDs) == 0 {
		return nil
	}
	roles, err := service.repo.ListRoles(ctx, tenantID)
	if err != nil {
		return err
	}
	roleByID := make(map[int64]RoleSummary, len(roles))
	for _, role := range roles {
		roleByID[role.ID] = role
	}
	for _, roleID := range roleIDs {
		role, ok := roleByID[roleID]
		if !ok {
			return ErrInvalidInput
		}
		if isPrivilegedRoleCode(role.Code) || containsPrivilegedPermission(role.PermissionCodes) {
			return ErrForbidden
		}
	}
	return nil
}

func canManageTargetUser(scope Scope, userType string) bool {
	if isPrivilegedUserManager(scope) {
		return true
	}
	switch strings.TrimSpace(userType) {
	case "sys_admin", "school_admin", "tenant_admin":
		return false
	default:
		return true
	}
}

func isKnownUserType(userType string) bool {
	switch strings.TrimSpace(userType) {
	case "sys_admin", "tenant_admin", "school_admin", "teacher", "student", "staff":
		return true
	default:
		return false
	}
}

func userLookupTenantID(scope Scope) int64 {
	if isPrivilegedUserManager(scope) {
		return 0
	}
	return scope.TenantID
}

func isPrivilegedUserManager(scope Scope) bool {
	if scope.UserType == "sys_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "system:manage" || permission == "tenant:manage" {
			return true
		}
	}
	return false
}

func isPrivilegedRoleCode(code string) bool {
	switch strings.TrimSpace(code) {
	case "sys_admin", "school_admin", "tenant_admin":
		return true
	default:
		return false
	}
}

func containsPrivilegedPermission(permissionCodes []string) bool {
	for _, permission := range permissionCodes {
		switch permission {
		case "system:manage", "tenant:manage", "role:manage":
			return true
		}
	}
	return false
}

func scopeFromTenantID(tenantID int64) Scope {
	if tenantID == 0 {
		return Scope{UserType: "sys_admin"}
	}
	return Scope{TenantID: tenantID}
}

func normalizePage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizePageSize(pageSize int) int {
	if pageSize <= 0 {
		return 20
	}
	return pageSize
}

type BcryptPasswordHasher struct{}

func (BcryptPasswordHasher) Hash(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func (BcryptPasswordHasher) Verify(passwordHash string, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)) == nil
}

func isUsableNewPassword(oldPassword string, newPassword string) bool {
	normalized := strings.TrimSpace(newPassword)
	return len([]rune(normalized)) >= 8 && newPassword != oldPassword
}

func generateInitialPassword() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%+-_"
	const length = 18

	result := make([]byte, length)
	max := big.NewInt(int64(len(alphabet)))
	for index := range result {
		value, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		result[index] = alphabet[value.Int64()]
	}
	return string(result), nil
}
