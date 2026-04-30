package dictionary

import (
	"context"
	"database/sql"
)

type MySQLRepository struct {
	db *sql.DB
}

func NewMySQLRepository(db *sql.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (repo *MySQLRepository) ListDictionaries(ctx context.Context, filter DictionaryListFilter) (PageResult[Dictionary], error) {
	query := `
SELECT id, code, name, status, COALESCE(remark, ''), created_at, updated_at
FROM dictionaries
WHERE 1 = 1
`
	args := make([]any, 0, 4)
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.Keyword != "" {
		query += " AND (code LIKE ? OR name LIKE ?)"
		keyword := "%" + filter.Keyword + "%"
		args = append(args, keyword, keyword)
	}
	query += " ORDER BY id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[Dictionary]{}, err
	}
	defer rows.Close()

	items := make([]Dictionary, 0)
	for rows.Next() {
		item, err := scanDictionary(rows)
		if err != nil {
			return PageResult[Dictionary]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[Dictionary]{}, err
	}
	return paginate(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) CreateDictionary(ctx context.Context, dictionary Dictionary) (Dictionary, error) {
	result, err := repo.db.ExecContext(
		ctx,
		`INSERT INTO dictionaries (code, name, status, remark) VALUES (?, ?, ?, ?)`,
		dictionary.Code,
		dictionary.Name,
		dictionary.Status,
		nullString(dictionary.Remark),
	)
	if err != nil {
		return Dictionary{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Dictionary{}, err
	}
	return repo.GetDictionary(ctx, id)
}

func (repo *MySQLRepository) UpdateDictionary(ctx context.Context, dictionary Dictionary) (Dictionary, error) {
	if err := repo.execAffectingOne(ctx, `UPDATE dictionaries SET code = ?, name = ?, status = ?, remark = ? WHERE id = ?`, dictionary.Code, dictionary.Name, dictionary.Status, nullString(dictionary.Remark), dictionary.ID); err != nil {
		return Dictionary{}, err
	}
	return repo.GetDictionary(ctx, dictionary.ID)
}

func (repo *MySQLRepository) GetDictionary(ctx context.Context, id int64) (Dictionary, error) {
	const query = `
SELECT id, code, name, status, COALESCE(remark, ''), created_at, updated_at
FROM dictionaries
WHERE id = ?
LIMIT 1
`
	item, err := scanDictionaryScanner(repo.db.QueryRowContext(ctx, query, id))
	if err != nil {
		return Dictionary{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) ListItems(ctx context.Context, filter DictionaryItemListFilter) (PageResult[DictionaryItem], error) {
	query := `
SELECT di.id, di.dictionary_id, d.code, di.item_value, di.item_label, di.sort_no, di.status, COALESCE(di.remark, ''), di.created_at, di.updated_at
FROM dictionary_items di
JOIN dictionaries d ON d.id = di.dictionary_id
WHERE 1 = 1
`
	args := make([]any, 0, 5)
	if filter.DictionaryID > 0 {
		query += " AND di.dictionary_id = ?"
		args = append(args, filter.DictionaryID)
	}
	if filter.DictionaryCode != "" {
		query += " AND d.code = ?"
		args = append(args, filter.DictionaryCode)
	}
	if filter.ActiveOnly {
		query += " AND d.status = 'active' AND di.status = 'active'"
	} else if filter.Status != "" {
		query += " AND di.status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY di.sort_no, di.item_value, di.id"
	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return PageResult[DictionaryItem]{}, err
	}
	defer rows.Close()

	items := make([]DictionaryItem, 0)
	for rows.Next() {
		item, err := scanDictionaryItem(rows)
		if err != nil {
			return PageResult[DictionaryItem]{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return PageResult[DictionaryItem]{}, err
	}
	return paginate(items, filter.Page, filter.PageSize), nil
}

func (repo *MySQLRepository) CreateItem(ctx context.Context, item DictionaryItem) (DictionaryItem, error) {
	result, err := repo.db.ExecContext(
		ctx,
		`INSERT INTO dictionary_items (dictionary_id, item_value, item_label, sort_no, status, remark) VALUES (?, ?, ?, ?, ?, ?)`,
		item.DictionaryID,
		item.Value,
		item.Label,
		item.SortNo,
		item.Status,
		nullString(item.Remark),
	)
	if err != nil {
		return DictionaryItem{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return DictionaryItem{}, err
	}
	return repo.GetItem(ctx, id)
}

func (repo *MySQLRepository) UpdateItem(ctx context.Context, item DictionaryItem) (DictionaryItem, error) {
	if err := repo.execAffectingOne(ctx, `UPDATE dictionary_items SET item_value = ?, item_label = ?, sort_no = ?, status = ?, remark = ? WHERE id = ?`, item.Value, item.Label, item.SortNo, item.Status, nullString(item.Remark), item.ID); err != nil {
		return DictionaryItem{}, err
	}
	return repo.GetItem(ctx, item.ID)
}

func (repo *MySQLRepository) GetItem(ctx context.Context, id int64) (DictionaryItem, error) {
	const query = `
SELECT di.id, di.dictionary_id, d.code, di.item_value, di.item_label, di.sort_no, di.status, COALESCE(di.remark, ''), di.created_at, di.updated_at
FROM dictionary_items di
JOIN dictionaries d ON d.id = di.dictionary_id
WHERE di.id = ?
LIMIT 1
`
	item, err := scanDictionaryItemScanner(repo.db.QueryRowContext(ctx, query, id))
	if err != nil {
		return DictionaryItem{}, wrapNotFound(err)
	}
	return item, nil
}

func (repo *MySQLRepository) execAffectingOne(ctx context.Context, query string, args ...any) error {
	result, err := repo.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func scanDictionary(rows *sql.Rows) (Dictionary, error) {
	return scanDictionaryScanner(rows)
}

func scanDictionaryScanner(scanner interface{ Scan(dest ...any) error }) (Dictionary, error) {
	var item Dictionary
	err := scanner.Scan(&item.ID, &item.Code, &item.Name, &item.Status, &item.Remark, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func scanDictionaryItem(rows *sql.Rows) (DictionaryItem, error) {
	return scanDictionaryItemScanner(rows)
}

func scanDictionaryItemScanner(scanner interface{ Scan(dest ...any) error }) (DictionaryItem, error) {
	var item DictionaryItem
	err := scanner.Scan(&item.ID, &item.DictionaryID, &item.DictionaryCode, &item.Value, &item.Label, &item.SortNo, &item.Status, &item.Remark, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func paginate[T any](items []T, page int, pageSize int) PageResult[T] {
	page = normalizePage(page)
	pageSize = normalizePageSize(pageSize)
	start := (page - 1) * pageSize
	if start > len(items) {
		start = len(items)
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return PageResult[T]{Items: items[start:end], Page: page, PageSize: pageSize, Total: len(items)}
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func wrapNotFound(err error) error {
	if err == nil {
		return nil
	}
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	return err
}
