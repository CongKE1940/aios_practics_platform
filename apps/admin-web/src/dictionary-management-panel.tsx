import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Dictionary,
  DictionaryInput,
  DictionaryItem,
  DictionaryItemInput,
  DictionaryItemManageListQuery,
  DictionaryListQuery,
  PageResult
} from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface DictionaryPanelApi {
  listDictionaries(query?: DictionaryListQuery): Promise<PageResult<Dictionary>>;
  createDictionary(body: DictionaryInput): Promise<Dictionary>;
  updateDictionary(id: number, body: DictionaryInput): Promise<Dictionary>;
  listDictionaryManageItems(dictionaryId: number, query?: DictionaryItemManageListQuery): Promise<PageResult<DictionaryItem>>;
  createDictionaryItem(dictionaryId: number, body: DictionaryItemInput): Promise<DictionaryItem>;
  updateDictionaryItem(id: number, body: DictionaryItemInput): Promise<DictionaryItem>;
}

const defaultPageSize = 10;
const detailPageSize = 100;

const defaultDictionaryForm = {
  code: "",
  name: "",
  status: "active",
  remark: ""
};

const defaultItemForm = {
  value: "",
  label: "",
  sort_no: "0",
  status: "active",
  remark: ""
};

type DictionaryFormState = typeof defaultDictionaryForm;
type DictionaryItemFormState = typeof defaultItemForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; item: Dictionary }
  | { type: "edit"; item: Dictionary }
  | null;

const columns: Array<FixedActionListColumn<Dictionary>> = [
  {
    key: "code",
    title: "字典编码",
    render: (item) => item.code
  },
  {
    key: "name",
    title: "字典名称",
    render: (item) => item.name
  },
  {
    key: "status",
    title: "状态",
    width: 120,
    render: (item) => <span className={statusClassName(item.status)}>{formatStatusLabel(item.status)}</span>
  },
  {
    key: "remark",
    title: "备注",
    render: (item) => item.remark || "-"
  }
];

export function DictionaryManagementPanel({ api }: { api: DictionaryPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<Dictionary[]>([]);
  const [dictionaryItems, setDictionaryItems] = useState<DictionaryItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [form, setForm] = useState<DictionaryFormState>(defaultDictionaryForm);
  const [itemForm, setItemForm] = useState<DictionaryItemFormState>(defaultItemForm);
  const [editingItemID, setEditingItemID] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildDictionaryQuery("", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query: DictionaryListQuery = buildDictionaryQuery(keyword, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listDictionaries(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "字典数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadDictionaryItems(dictionary: Dictionary) {
    setDetailLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listDictionaryManageItems(dictionary.id, { page: 1, page_size: detailPageSize });
      setDictionaryItems(result.items);
    } catch (error) {
      setDictionaryItems([]);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "字典项加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildDictionaryQuery(keyword, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildDictionaryQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadPage(buildDictionaryQuery(keyword, status, nextPage, pageSize));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildDictionaryPayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }

    if (modal?.type === "edit") {
      await api.updateDictionary(modal.item.id, payload);
    } else {
      await api.createDictionary(payload);
    }

    closeModal();
    await loadPage();
  }

  async function handleSubmitDictionaryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.type !== "detail") {
      return;
    }

    const payload = buildDictionaryItemPayload(itemForm);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }

    if (editingItemID) {
      await api.updateDictionaryItem(editingItemID, payload);
    } else {
      await api.createDictionaryItem(modal.item.id, payload);
    }

    setItemForm(defaultItemForm);
    setEditingItemID(null);
    await loadDictionaryItems(modal.item);
  }

  function handleExport() {
    downloadCsv(
      "dictionaries.csv",
      [
        { key: "code", title: "字典编码" },
        { key: "name", title: "字典名称" },
        { key: "status_label", title: "状态" },
        { key: "remark", title: "备注" }
      ],
      items.map((item) => ({
        ...item,
        status_label: formatStatusLabel(item.status),
        remark: item.remark ?? ""
      }))
    );
  }

  function openCreateModal() {
    setForm(defaultDictionaryForm);
    setDictionaryItems([]);
    setModal({ type: "create" });
  }

  async function openDetailModal(item: Dictionary) {
    setItemForm(defaultItemForm);
    setEditingItemID(null);
    setModal({ type: "detail", item });
    await loadDictionaryItems(item);
  }

  function openEditModal(item: Dictionary) {
    setForm({
      code: item.code,
      name: item.name,
      status: item.status || "active",
      remark: item.remark ?? ""
    });
    setDictionaryItems([]);
    setModal({ type: "edit", item });
  }

  function startEditDictionaryItem(item: DictionaryItem) {
    setEditingItemID(item.id);
    setItemForm({
      value: String(item.value),
      label: item.label,
      sort_no: String(item.sort_no),
      status: item.status || "active",
      remark: item.remark ?? ""
    });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultDictionaryForm);
    setItemForm(defaultItemForm);
    setEditingItemID(null);
    setDictionaryItems([]);
  }

  return (
    <section aria-label="字典管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="字典数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="字典数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="dictionary_keyword">关键字 keyword</label>
            <input
              id="dictionary_keyword"
              placeholder="输入字典编码、名称或备注"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="dictionary_status">状态 status</label>
            <select id="dictionary_status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </div>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleReset()} disabled={loading}>
              重置
            </button>
          </div>
        </form>

        <FixedActionList
          rows={items}
          columns={columns}
          getRowId={(item) => item.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onExport={handleExport}
          onDetail={(item) => void openDetailModal(item)}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无字典数据"}
          ariaLabel="字典列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(item) => `选择字典-${item.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="字典管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>字典详情</h3>
                    <p>{modal.item.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>字典编码</dt>
                      <dd>{modal.item.code}</dd>
                    </div>
                    <div>
                      <dt>字典名称</dt>
                      <dd>{modal.item.name}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.item.status)}</dd>
                    </div>
                    <div>
                      <dt>备注</dt>
                      <dd>{modal.item.remark || "-"}</dd>
                    </div>
                  </dl>

                  <table className="ui-admin-table">
                    <thead>
                      <tr>
                        <th>字典值</th>
                        <th>标签</th>
                        <th>排序</th>
                        <th>状态</th>
                        <th>备注</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dictionaryItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.value}</td>
                          <td>{item.label}</td>
                          <td>{item.sort_no}</td>
                          <td>{formatStatusLabel(item.status)}</td>
                          <td>{item.remark || "-"}</td>
                          <td>
                            <button type="button" className="ui-admin-link-button" onClick={() => startEditDictionaryItem(item)}>
                              编辑
                            </button>
                          </td>
                        </tr>
                      ))}
                      {dictionaryItems.length === 0 ? (
                        <tr>
                          <td colSpan={6}>{detailLoading ? "字典项加载中..." : "暂无字典项"}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>

                  <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmitDictionaryItem(event)}>
                    <div className="ui-admin-form__field">
                      <label htmlFor="dictionary_item_value">字典值</label>
                      <input
                        id="dictionary_item_value"
                        inputMode="numeric"
                        value={itemForm.value}
                        onChange={(event) => setItemForm((current) => ({ ...current, value: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="dictionary_item_label">标签</label>
                      <input
                        id="dictionary_item_label"
                        value={itemForm.label}
                        onChange={(event) => setItemForm((current) => ({ ...current, label: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="dictionary_item_sort_no">排序</label>
                      <input
                        id="dictionary_item_sort_no"
                        inputMode="numeric"
                        value={itemForm.sort_no}
                        onChange={(event) => setItemForm((current) => ({ ...current, sort_no: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="dictionary_item_status">状态</label>
                      <select
                        id="dictionary_item_status"
                        value={itemForm.status}
                        onChange={(event) => setItemForm((current) => ({ ...current, status: event.target.value }))}
                      >
                        <option value="active">启用</option>
                        <option value="disabled">禁用</option>
                      </select>
                    </div>
                    <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                      <label htmlFor="dictionary_item_remark">备注</label>
                      <input
                        id="dictionary_item_remark"
                        value={itemForm.remark}
                        onChange={(event) => setItemForm((current) => ({ ...current, remark: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                      <button type="submit" className="ui-button ui-button--primary" disabled={detailLoading}>
                        {editingItemID ? "保存字典项" : "新增字典项"}
                      </button>
                      {editingItemID ? (
                        <button
                          type="button"
                          className="ui-button ui-button--ghost"
                          onClick={() => {
                            setEditingItemID(null);
                            setItemForm(defaultItemForm);
                          }}
                        >
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.item)}>
                    编辑字典
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增字典" : "编辑字典"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="dictionary_form_code">字典编码</label>
                        <input
                          id="dictionary_form_code"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="dictionary_form_name">字典名称</label>
                        <input
                          id="dictionary_form_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="dictionary_form_status">状态</label>
                        <select
                          id="dictionary_form_status"
                          value={form.status}
                          onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                        >
                          <option value="active">启用</option>
                          <option value="disabled">禁用</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="dictionary_form_remark">备注</label>
                        <textarea
                          id="dictionary_form_remark"
                          value={form.remark}
                          onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增字典" : "保存修改"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildDictionaryQuery(keyword: string, status: string, page: number, pageSize: number): DictionaryListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  } as DictionaryListQuery;
}

function buildDictionaryPayload(form: DictionaryFormState): DictionaryInput | string {
  if (!form.code.trim()) {
    return "请填写字典编码。";
  }
  if (!form.name.trim()) {
    return "请填写字典名称。";
  }

  return {
    code: form.code.trim(),
    name: form.name.trim(),
    status: form.status || "active",
    remark: form.remark.trim() || undefined
  } as DictionaryInput;
}

function buildDictionaryItemPayload(form: DictionaryItemFormState): DictionaryItemInput | string {
  const value = Number(form.value);
  const sortNo = Number(form.sort_no || 0);

  if (!Number.isFinite(value)) {
    return "字典值必须是数字。";
  }
  if (!form.label.trim()) {
    return "请填写字典项标签。";
  }
  if (!Number.isFinite(sortNo)) {
    return "排序必须是数字。";
  }

  return {
    value,
    label: form.label.trim(),
    sort_no: Math.trunc(sortNo),
    status: form.status || "active",
    remark: form.remark.trim() || undefined
  } as DictionaryItemInput;
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "字典接口暂不可用，请检查后端 /api/v1/dictionaries 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "字典请求参数错误，请检查字典编码、字典值或排序。";
  }
  return message || "字典数据加载失败";
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "禁用";
    default:
      return status || "-";
  }
}

function statusClassName(status: string): string {
  if (status === "active") {
    return "ui-admin-status ui-admin-status--active";
  }
  if (status === "disabled") {
    return "ui-admin-status ui-admin-status--disabled";
  }
  return "ui-admin-status ui-admin-status--draft";
}
