package dictionary

import (
	"context"
	"strings"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (service *Service) ListDictionaries(ctx context.Context, scope Scope, filter DictionaryListFilter) (PageResult[Dictionary], error) {
	if !canManageDictionary(scope) {
		return PageResult[Dictionary]{}, ErrForbidden
	}
	return service.repo.ListDictionaries(ctx, normalizeDictionaryFilter(filter))
}

func (service *Service) CreateDictionary(ctx context.Context, scope Scope, input DictionaryInput) (Dictionary, error) {
	if !canManageDictionary(scope) {
		return Dictionary{}, ErrForbidden
	}
	dictionary := Dictionary{
		Code:   strings.TrimSpace(input.Code),
		Name:   strings.TrimSpace(input.Name),
		Status: normalizeStatus(input.Status),
		Remark: strings.TrimSpace(input.Remark),
	}
	if dictionary.Code == "" || dictionary.Name == "" {
		return Dictionary{}, ErrInvalidInput
	}
	return service.repo.CreateDictionary(ctx, dictionary)
}

func (service *Service) UpdateDictionary(ctx context.Context, scope Scope, id int64, input DictionaryInput) (Dictionary, error) {
	if !canManageDictionary(scope) {
		return Dictionary{}, ErrForbidden
	}
	if id <= 0 {
		return Dictionary{}, ErrInvalidInput
	}
	current, err := service.repo.GetDictionary(ctx, id)
	if err != nil {
		return Dictionary{}, err
	}
	current.Code = strings.TrimSpace(input.Code)
	current.Name = strings.TrimSpace(input.Name)
	current.Status = normalizeStatus(input.Status)
	current.Remark = strings.TrimSpace(input.Remark)
	if current.Code == "" || current.Name == "" {
		return Dictionary{}, ErrInvalidInput
	}
	return service.repo.UpdateDictionary(ctx, current)
}

func (service *Service) ListItems(ctx context.Context, filter DictionaryItemListFilter) (PageResult[DictionaryItem], error) {
	filter.DictionaryCode = strings.TrimSpace(filter.DictionaryCode)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	if filter.DictionaryID <= 0 && filter.DictionaryCode == "" {
		return PageResult[DictionaryItem]{}, ErrInvalidInput
	}
	return service.repo.ListItems(ctx, filter)
}

func (service *Service) CreateItem(ctx context.Context, scope Scope, dictionaryID int64, input DictionaryItemInput) (DictionaryItem, error) {
	if !canManageDictionary(scope) {
		return DictionaryItem{}, ErrForbidden
	}
	item := DictionaryItem{
		DictionaryID: dictionaryID,
		Value:        input.Value,
		Label:        strings.TrimSpace(input.Label),
		SortNo:       input.SortNo,
		Status:       normalizeStatus(input.Status),
		Remark:       strings.TrimSpace(input.Remark),
	}
	if item.DictionaryID <= 0 || item.Label == "" {
		return DictionaryItem{}, ErrInvalidInput
	}
	return service.repo.CreateItem(ctx, item)
}

func (service *Service) UpdateItem(ctx context.Context, scope Scope, id int64, input DictionaryItemInput) (DictionaryItem, error) {
	if !canManageDictionary(scope) {
		return DictionaryItem{}, ErrForbidden
	}
	if id <= 0 {
		return DictionaryItem{}, ErrInvalidInput
	}
	current, err := service.repo.GetItem(ctx, id)
	if err != nil {
		return DictionaryItem{}, err
	}
	current.Value = input.Value
	current.Label = strings.TrimSpace(input.Label)
	current.SortNo = input.SortNo
	current.Status = normalizeStatus(input.Status)
	current.Remark = strings.TrimSpace(input.Remark)
	if current.Label == "" {
		return DictionaryItem{}, ErrInvalidInput
	}
	return service.repo.UpdateItem(ctx, current)
}

func canManageDictionary(scope Scope) bool {
	if scope.UserType == "sys_admin" {
		return true
	}
	for _, permission := range scope.Permissions {
		if permission == "role:manage" || permission == "tenant:manage" || permission == "system:manage" {
			return true
		}
	}
	return false
}

func normalizeDictionaryFilter(filter DictionaryListFilter) DictionaryListFilter {
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Page = normalizePage(filter.Page)
	filter.PageSize = normalizePageSize(filter.PageSize)
	return filter
}

func normalizeStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return StatusActive
	}
	if status != StatusActive && status != StatusDisabled {
		return StatusActive
	}
	return status
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
