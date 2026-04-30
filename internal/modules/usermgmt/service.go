package usermgmt

import (
	"context"

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

func (service *Service) CreateUser(ctx context.Context, tenantID int64, input UserInput) (User, error) {
	if input.Password == "" {
		return User{}, ErrInvalidInput
	}
	passwordHash, err := service.hasher.Hash(input.Password)
	if err != nil {
		return User{}, err
	}
	return service.repo.CreateUser(ctx, User{
		TenantID:    tenantID,
		Username:    input.Username,
		Phone:       input.Phone,
		Email:       input.Email,
		DisplayName: input.DisplayName,
		UserType:    input.UserType,
		Status:      UserStatusActive,
		RoleIDs:     append([]int64{}, input.RoleIDs...),
	}, passwordHash)
}

func (service *Service) UpdateUser(ctx context.Context, tenantID int64, id int64, input UserInput) (User, error) {
	current, err := service.repo.GetUser(ctx, tenantID, id)
	if err != nil {
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

func (service *Service) AssignRoles(ctx context.Context, tenantID int64, userID int64, input UserRolesInput) (User, error) {
	if tenantID == 0 {
		user, err := service.repo.GetUser(ctx, tenantID, userID)
		if err != nil {
			return User{}, err
		}
		tenantID = user.TenantID
	}
	return service.repo.AssignRoles(ctx, tenantID, userID, input.RoleIDs)
}

func (service *Service) DisableUser(ctx context.Context, tenantID int64, userID int64) (User, error) {
	if tenantID == 0 {
		user, err := service.repo.GetUser(ctx, tenantID, userID)
		if err != nil {
			return User{}, err
		}
		tenantID = user.TenantID
	}
	return service.repo.DisableUser(ctx, tenantID, userID)
}

func (service *Service) ResetPassword(ctx context.Context, tenantID int64, userID int64, input ResetPasswordInput) (User, error) {
	if tenantID == 0 {
		user, err := service.repo.GetUser(ctx, tenantID, userID)
		if err != nil {
			return User{}, err
		}
		tenantID = user.TenantID
	}
	passwordHash, err := service.hasher.Hash(input.NewPassword)
	if err != nil {
		return User{}, err
	}
	return service.repo.ResetPassword(ctx, tenantID, userID, passwordHash)
}

func normalizeUserFilter(filter UserListFilter) UserListFilter {
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
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
