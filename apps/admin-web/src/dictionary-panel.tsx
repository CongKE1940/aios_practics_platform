import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

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

type ModalState =
  | { type: "create-dictionary" }
  | { type: "edit-dictionary"; dictionary: Dictionary }
  | { type: "create-item"; dictionary: Dictionary }
  | { type: "edit-item"; dictionary: Dictionary; item: DictionaryItem }
  | null;

const defaultPageSize = 10;

const defaultDictionaryForm: DictionaryInput = {
  code: "",
  name: "",
  status: "active",
  remark: ""
};

const defaultItemForm: DictionaryItemInput = {
  value: 0,
  label: "",
  sort_no: 10,
  status: "active",
  remark: ""
};

export function DictionaryPanel({ api }: { api: DictionaryPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [itemLoading, setItemLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [items, setItems] = useState<DictionaryItem[]>([]);
  const [selectedDictionary, setSelectedDictionary] = useState<Dictionary | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [itemStatus, setItemStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [dictionaryForm, setDictionaryForm] = useState<DictionaryInput>(defaultDictionaryForm);
  const [itemForm, setItemForm] = useState<DictionaryItemInput>(defaultItemForm);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const dictionaryColumns = useMemo<Array<FixedActionListColumn<Dictionary>>>(
    () => [
      { key: "name", title: "字典名称", render: (dictionary) => dictionary.name },
      { key: "code", title: "字典编码", render: (dictionary) => dictionary.code },
      {
        key: "status",
        title: "状态",
        width: 110,
        render: (dictionary) => <span className={statusClassName(dictionary.status)}>{formatStatusLabel(dictionary.status)}</span>
      },
      { key: "remark", title: "备注", render: (dictionary) => dictionary.remark || "-" }
    ],
    []
  );
  const itemColumns = useMemo<Array<FixedActionListColumn<DictionaryItem>>>(
    () => [
      { key: "value", title: "字段值", width: 120, render: (item) => item.value },
      { key: "label", title: "显示文本", render: (item) => item.label },
      { key: "sort_no", title: "排序", width: 100, render: (item) => item.sort_no },
      {
        key: "status",
        title: "状态",
        width: 110,
        render: (item) => <span className={statusClassName(item.status)}>{formatStatusLabel(item.status)}</span>
      },
      { key: "remark", title: "备注", render: (item) => item.remark || "-" }
    ],
    []
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadDictionaries(buildDictionaryQuery("", "", 1, defaultPageSize));
  }, [api]);

  async function loadDictionaries(query: DictionaryListQuery = buildDictionaryQuery(keyword, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listDictionaries(query);
      setDictionaries(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
      const nextSelected = selectedDictionary
        ? result.items.find((dictionary) => dictionary.id === selectedDictionary.id) ?? result.items[0] ?? null
        : result.items[0] ?? null;
      setSelectedDictionary(nextSelected);
      if (nextSelected) {
        await loadItems(nextSelected, buildItemQuery(itemStatus));
      } else {
        setItems([]);
      }
    } catch (error) {
      setDictionaries([]);
      setItems([]);
      setTotal(0);
      setSelectedDictionary(null);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "字典数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(dictionary: Dictionary, query: DictionaryItemManageListQuery = buildItemQuery(itemStatus)) {
    setItemLoading(true);
    try {
      const result = await api.listDictionaryManageItems(dictionary.id, query);
      setItems(result.items);
    } catch (error) {
      setItems([]);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "字典项加载失败");
    } finally {
      setItemLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadDictionaries(buildDictionaryQuery(keyword, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setItemStatus("");
    setSelectedIDs([]);
    await loadDictionaries(buildDictionaryQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadDictionaries(buildDictionaryQuery(keyword, status, nextPage, pageSize));
  }

  async function handleItemStatusChange(nextStatus: string) {
    setItemStatus(nextStatus);
    if (selectedDictionary) {
      await loadItems(selectedDictionary, buildItemQuery(nextStatus));
    }
  }

  async function handleDictionarySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.type === "edit-dictionary") {
      await api.updateDictionary(modal.dictionary.id, dictionaryForm);
    } else {
      await api.createDictionary(dictionaryForm);
    }
    closeModal();
    await loadDictionaries();
  }

  async function handleItemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDictionary) {
      return;
    }
    if (modal?.type === "edit-item") {
      await api.updateDictionaryItem(modal.item.id, itemForm);
    } else {
      await api.createDictionaryItem(selectedDictionary.id, itemForm);
    }
    closeModal();
    await loadItems(selectedDictionary);
  }

  function openCreateDictionaryModal() {
    setDictionaryForm(defaultDictionaryForm);
    setModal({ type: "create-dictionary" });
  }

  function openEditDictionaryModal(dictionary: Dictionary) {
    setDictionaryForm({
      code: dictionary.code,
      name: dictionary.name,
      status: dictionary.status,
      remark: dictionary.remark ?? ""
    });
    setModal({ type: "edit-dictionary", dictionary });
  }

  function openCreateItemModal() {
    if (!selectedDictionary) {
      return;
    }
    setItemForm(defaultItemForm);
    setModal({ type: "create-item", dictionary: selectedDictionary });
  }

  function openEditItemModal(item: DictionaryItem) {
    if (!selectedDictionary) {
      return;
    }
    setItemForm({
      value: item.value,
      label: item.label,
      sort_no: item.sort_no,
      status: item.status,
      remark: item.remark ?? ""
    });
    setModal({ type: "edit-item", dictionary: selectedDictionary, item });
  }

  function closeModal() {
    setModal(null);
    setDictionaryForm(defaultDictionaryForm);
    setItemForm(defaultItemForm);
  }

  function handleSelectDictionary(dictionary: Dictionary) {
    setSelectedDictionary(dictionary);
    void loadItems(dictionary, buildItemQuery(itemStatus));
  }

  function handleExport() {
    downloadCsv(
      "dictionaries.csv",
      [
        { key: "dictionary_name", title: "字典名称" },
        { key: "dictionary_code", title: "字典编码" },
        { key: "value", title: "字段值" },
        { key: "label", title: "显示文本" },
        { key: "status_label", title: "状态" },
        { key: "remark", title: "备注" }
      ],
      items.map((item) => ({
        ...item,
        dictionary_name: selectedDictionary?.name ?? "",
        dictionary_code: selectedDictionary?.code ?? item.dictionary_code ?? "",
        status_label: formatStatusLabel(item.status),
        remark: item.remark ?? ""
      }))
    );
  }

  return (
    <section aria-label="字典管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="字典数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="字典数据展示区" style={dataRegionStyle} aria-busy={loading || itemLoading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="dictionary_keyword">关键字 keyword</label>
            <input id="dictionary_keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </div>
          <div className="ui-admin-form__field">
            <label htmlFor="dictionary_status">字典状态 status</label>
            <select id="dictionary_status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
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

        <div style={splitLayoutStyle}>
          <section style={dictionaryListStyle} aria-label="字典列表">
            <FixedActionList
              rows={dictionaries}
              columns={dictionaryColumns}
              getRowId={(dictionary) => dictionary.id}
              selectedRowIds={selectedIDs}
              onSelectionChange={setSelectedIDs}
              onCreate={openCreateDictionaryModal}
              onExport={handleExport}
              onDetail={handleSelectDictionary}
              onEdit={openEditDictionaryModal}
              currentPage={page}
              pageCount={pageCount}
              total={total}
              onPageChange={(nextPage) => void handlePageChange(nextPage)}
              minHeight="100%"
              emptyText={loading ? "数据加载中..." : "暂无字典数据"}
              ariaLabel="字典列表"
              createLabel="新增字典"
              deleteLabel="删除"
              exportLabel="导出字典项"
              rowCheckboxLabel={(dictionary) => `选择字典-${dictionary.name}`}
            />
          </section>

          <section style={itemPaneStyle} aria-label="字典项列表">
            <div style={itemHeaderStyle}>
              <div>
                <span style={itemEyebrowStyle}>DICT ITEMS</span>
                <h3 style={itemTitleStyle}>{selectedDictionary?.name ?? "未选择字典"}</h3>
                <p style={itemMetaStyle}>{selectedDictionary?.code ?? "请选择左侧字典查看字段映射"}</p>
              </div>
              <button type="button" className="ui-button ui-button--primary" onClick={openCreateItemModal} disabled={!selectedDictionary}>
                新增字典项
              </button>
            </div>
            <div className="ui-admin-form__field" style={itemFilterStyle}>
              <label htmlFor="dictionary_item_status">字典项状态 status</label>
              <select id="dictionary_item_status" value={itemStatus} onChange={(event) => void handleItemStatusChange(event.target.value)}>
                <option value="">全部状态</option>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </div>
            <FixedActionList
              rows={items}
              columns={itemColumns}
              getRowId={(item) => item.id}
              selectedRowIds={[]}
              onCreate={openCreateItemModal}
              onEdit={openEditItemModal}
              currentPage={1}
              pageCount={1}
              total={items.length}
              minHeight="100%"
              emptyText={itemLoading ? "字典项加载中..." : "暂无字典项"}
              ariaLabel="字典项列表"
              createLabel="新增"
              exportLabel="导出"
              rowCheckboxLabel={(item) => `选择字典项-${item.label}`}
            />
          </section>
        </div>
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="字典管理弹层">
            {modal.type === "create-dictionary" || modal.type === "edit-dictionary" ? (
              <form onSubmit={(event) => void handleDictionarySubmit(event)}>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create-dictionary" ? "新增字典" : "编辑字典"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>关闭</button>
                </div>
                <div className="ui-admin-modal__body">
                  <DictionaryForm form={dictionaryForm} onChange={setDictionaryForm} />
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>取消</button>
                  <button type="submit" className="ui-button ui-button--primary">保存</button>
                </div>
              </form>
            ) : (
              <form onSubmit={(event) => void handleItemSubmit(event)}>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create-item" ? "新增字典项" : "编辑字典项"}</h3>
                    <p>{modal.dictionary.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>关闭</button>
                </div>
                <div className="ui-admin-modal__body">
                  <DictionaryItemForm form={itemForm} onChange={setItemForm} />
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>取消</button>
                  <button type="submit" className="ui-button ui-button--primary">保存</button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function DictionaryForm({ form, onChange }: { form: DictionaryInput; onChange(next: DictionaryInput): void }) {
  return (
    <div className="ui-admin-form__grid">
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_code">字典编码</label>
        <input id="dictionary_code" value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} />
      </div>
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_name">字典名称</label>
        <input id="dictionary_name" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
      </div>
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_form_status">状态</label>
        <select id="dictionary_form_status" value={form.status ?? "active"} onChange={(event) => onChange({ ...form, status: event.target.value })}>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
      </div>
      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="dictionary_remark">备注</label>
        <textarea id="dictionary_remark" value={form.remark ?? ""} onChange={(event) => onChange({ ...form, remark: event.target.value })} />
      </div>
    </div>
  );
}

function DictionaryItemForm({ form, onChange }: { form: DictionaryItemInput; onChange(next: DictionaryItemInput): void }) {
  return (
    <div className="ui-admin-form__grid">
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_item_value">字段值</label>
        <input id="dictionary_item_value" type="number" value={form.value} onChange={(event) => onChange({ ...form, value: Number(event.target.value) })} />
      </div>
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_item_label">显示文本</label>
        <input id="dictionary_item_label" value={form.label} onChange={(event) => onChange({ ...form, label: event.target.value })} />
      </div>
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_item_sort">排序</label>
        <input id="dictionary_item_sort" type="number" value={form.sort_no ?? 0} onChange={(event) => onChange({ ...form, sort_no: Number(event.target.value) })} />
      </div>
      <div className="ui-admin-form__field">
        <label htmlFor="dictionary_item_form_status">状态</label>
        <select id="dictionary_item_form_status" value={form.status ?? "active"} onChange={(event) => onChange({ ...form, status: event.target.value })}>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
      </div>
      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor="dictionary_item_remark">备注</label>
        <textarea id="dictionary_item_remark" value={form.remark ?? ""} onChange={(event) => onChange({ ...form, remark: event.target.value })} />
      </div>
    </div>
  );
}

function buildDictionaryQuery(keyword: string, status: string, page: number, pageSize: number): DictionaryListQuery {
  return { keyword: keyword.trim() || undefined, status: status || undefined, page, page_size: pageSize };
}

function buildItemQuery(status: string): DictionaryItemManageListQuery {
  return { status: status || undefined, page: 1, page_size: 200 };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "字典接口暂不可用，请检查后端 /api/v1/dictionaries 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "字典请求参数错误，请检查编码、名称或字段值。";
  }
  return message || "字典数据加载失败";
}

function statusClassName(status: string): string {
  return status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--disabled";
}

function formatStatusLabel(status: string): string {
  return status === "active" ? "启用" : "停用";
}

const pageStyle: CSSProperties = { minHeight: "100%", gap: 0 };
const dataRegionStyle: CSSProperties = { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 14, minHeight: "100%", padding: 22 };
const filterFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 360px) minmax(160px, 220px) auto", alignItems: "end", gap: 14, margin: 0 };
const queryActionsStyle: CSSProperties = { justifyContent: "flex-start" };
const splitLayoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(420px, 1fr) minmax(420px, 0.9fr)", gap: 16, minHeight: 0 };
const dictionaryListStyle: CSSProperties = { minWidth: 0, minHeight: 0 };
const itemPaneStyle: CSSProperties = { display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, minWidth: 0, minHeight: 0, borderLeft: "1px solid #e2e8f0", paddingLeft: 16 };
const itemHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const itemEyebrowStyle: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 700 };
const itemTitleStyle: CSSProperties = { margin: "4px 0", fontSize: 18 };
const itemMetaStyle: CSSProperties = { margin: 0, color: "#64748b", fontSize: 13 };
const itemFilterStyle: CSSProperties = { maxWidth: 220 };
