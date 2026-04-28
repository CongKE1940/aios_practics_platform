import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type { Dictionary, DictionaryInput, DictionaryListQuery, PageResult } from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface DictionaryPanelApi {
  listDictionaries(query?: DictionaryListQuery): Promise<PageResult<Dictionary>>;
  createDictionary(body: DictionaryInput): Promise<Dictionary>;
  updateDictionary(id: number, body: DictionaryInput): Promise<Dictionary>;
}

type ModalState =
  | { type: "create" }
  | { type: "detail"; dictionary: Dictionary }
  | { type: "edit"; dictionary: Dictionary }
  | null;

const defaultPageSize = 10;

const defaultDictionaryForm: DictionaryInput = {
  code: "",
  name: "",
  status: "active",
  remark: ""
};

export function DictionaryPanel({ api }: { api: DictionaryPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [dictionaryForm, setDictionaryForm] = useState<DictionaryInput>(defaultDictionaryForm);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo<Array<FixedActionListColumn<Dictionary>>>(
    () => [
      {
        key: "name",
        title: "字典名称",
        render: (dictionary) => dictionary.name
      },
      {
        key: "code",
        title: "字典编码",
        render: (dictionary) => dictionary.code
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (dictionary) => <span className={statusClassName(dictionary.status)}>{formatStatusLabel(dictionary.status)}</span>
      },
      {
        key: "remark",
        title: "备注",
        render: (dictionary) => dictionary.remark || "-"
      }
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
    } catch (error) {
      setDictionaries([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "字典数据加载失败");
    } finally {
      setLoading(false);
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
    setSelectedIDs([]);
    await loadDictionaries(buildDictionaryQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadDictionaries(buildDictionaryQuery(keyword, status, nextPage, pageSize));
  }

  async function handleDictionarySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildDictionaryPayload(dictionaryForm);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }

    try {
      if (modal?.type === "edit") {
        await api.updateDictionary(modal.dictionary.id, payload);
      } else {
        await api.createDictionary(payload);
      }
      closeModal();
      await loadDictionaries();
    } catch (error) {
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "字典保存失败");
    }
  }

  function openCreateModal() {
    setDictionaryForm(defaultDictionaryForm);
    setModal({ type: "create" });
  }

  function openEditModal(dictionary: Dictionary) {
    setDictionaryForm({
      code: dictionary.code,
      name: dictionary.name,
      status: dictionary.status,
      remark: dictionary.remark ?? ""
    });
    setModal({ type: "edit", dictionary });
  }

  function closeModal() {
    setModal(null);
    setDictionaryForm(defaultDictionaryForm);
  }

  function handleExport() {
    downloadCsv(
      "dictionaries.csv",
      [
        { key: "name", title: "字典名称" },
        { key: "code", title: "字典编码" },
        { key: "status_label", title: "状态" },
        { key: "remark", title: "备注" }
      ],
      dictionaries.map((dictionary) => ({
        ...dictionary,
        status_label: formatStatusLabel(dictionary.status),
        remark: dictionary.remark ?? ""
      }))
    );
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

        <FixedActionList
          rows={dictionaries}
          columns={columns}
          getRowId={(dictionary) => dictionary.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onExport={handleExport}
          onDetail={(dictionary) => setModal({ type: "detail", dictionary })}
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
          rowCheckboxLabel={(dictionary) => `选择字典-${dictionary.name}`}
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
                    <p>{modal.dictionary.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>字典名称</dt>
                      <dd>{modal.dictionary.name}</dd>
                    </div>
                    <div>
                      <dt>字典编码</dt>
                      <dd>{modal.dictionary.code}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>
                        <span className={statusClassName(modal.dictionary.status)}>{formatStatusLabel(modal.dictionary.status)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>备注</dt>
                      <dd>{modal.dictionary.remark || "-"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.dictionary)}>
                    编辑
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void handleDictionarySubmit(event)}>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增字典" : "编辑字典"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <DictionaryForm form={dictionaryForm} onChange={setDictionaryForm} />
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

function buildDictionaryQuery(keyword: string, status: string, page: number, pageSize: number): DictionaryListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  } as DictionaryListQuery;
}

function buildDictionaryPayload(form: DictionaryInput): DictionaryInput | string {
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
    remark: form.remark?.trim() || undefined
  } as DictionaryInput;
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "字典接口暂不可用，请检查后端 /api/v1/dictionaries 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "字典请求参数错误，请检查编码、名称或状态。";
  }
  return message || "字典数据加载失败";
}

function statusClassName(status: string): string {
  return status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--disabled";
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "停用";
    default:
      return status || "-";
  }
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
};

const dataRegionStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 360px) minmax(160px, 220px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
