import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  PageResult,
  PermissionItem,
  PermissionListQuery,
  RoleInput,
  RoleItem,
  RoleListQuery
} from "@aios/api-sdk";
import { FixedActionList, ToastNotice, type FixedActionListColumn, type FixedActionListRowId } from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface RbacPanelApi {
  listRoles(query?: RoleListQuery): Promise<PageResult<RoleItem>>;
  createRole(body: RoleInput): Promise<RoleItem>;
  updateRole?(id: number, body: RoleInput): Promise<RoleItem>;
  assignRolePermissions(id: number, body: { permission_ids: number[] }): Promise<RoleItem>;
  listPermissions(query?: PermissionListQuery): Promise<PageResult<PermissionItem>>;
}

const defaultPageSize = 10;

const defaultForm: RoleInput = {
  code: "",
  name: "",
  role_type: "custom",
  data_scope_type: "subtree",
  remark: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; role: RoleItem }
  | { type: "edit"; role: RoleItem }
  | null;

export function RbacPanel({ api }: { api: RbacPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [form, setForm] = useState<RoleInput>(defaultForm);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedPermissionIDs, setSelectedPermissionIDs] = useState<number[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const permissionNameMap = useMemo(() => new Map(permissions.map((permission) => [permission.id, permission.name])), [permissions]);
  const groupedModules = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const permission of permissions) {
      const current = map.get(permission.module) ?? [];
      current.push(permission);
      map.set(permission.module, current);
    }
    return Array.from(map.entries());
  }, [permissions]);
  const modulePermissions = useMemo(
    () => permissions.filter((permission) => !selectedModule || permission.module === selectedModule),
    [permissions, selectedModule]
  );
  const columns = useMemo<Array<FixedActionListColumn<RoleItem>>>(
    () => [
      {
        key: "name",
        title: "角色名称",
        render: (role) => role.name
      },
      {
        key: "code",
        title: "角色编码",
        render: (role) => role.code
      },
      {
        key: "role_type",
        title: "角色类型",
        width: 120,
        render: (role) => formatRoleType(role.role_type)
      },
      {
        key: "data_scope_type",
        title: "数据范围",
        width: 130,
        render: (role) => formatDataScopeType(role.data_scope_type)
      },
      {
        key: "status",
        title: "状态",
        width: 110,
        render: (role) => <span className={statusClassName(role.status)}>{formatStatusLabel(role.status)}</span>
      },
      {
        key: "permission_count",
        title: "权限数",
        width: 100,
        render: (role) => role.permission_ids?.length ?? 0
      },
      {
        key: "remark",
        title: "备注",
        render: (role) => role.remark || "-"
      }
    ],
    []
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadAll(buildRoleQuery("", 1, defaultPageSize));
  }, [api]);

  useEffect(() => {
    if (!selectedModule && groupedModules.length > 0) {
      setSelectedModule(groupedModules[0][0]);
    }
  }, [groupedModules, selectedModule]);

  async function loadAll(query: RoleListQuery = buildRoleQuery(status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [roleResult, permissionResult] = await Promise.all([
        api.listRoles(query),
        api.listPermissions({ page: 1, page_size: 200 })
      ]);
      setRoles(roleResult.items);
      setPermissions(permissionResult.items);
      setTotal(roleResult.total);
      setPage(roleResult.page || query.page || 1);
      setPageSize(roleResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setRoles([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "角色权限数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadAll(buildRoleQuery(status, 1, pageSize));
  }

  async function handleReset() {
    setStatus("");
    setSelectedIDs([]);
    await loadAll(buildRoleQuery("", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadAll(buildRoleQuery(status, nextPage, pageSize));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (modal?.type === "edit") {
      if (!api.updateRole) {
        setErrorMessage("当前接口暂不支持编辑角色。 ");
        return;
      }
      await api.updateRole(modal.role.id, form);
    } else {
      await api.createRole(form);
    }

    closeModal();
    await loadAll();
  }

  async function handleAssignRolePermissions(roleID: number, permissionIDs: number[]) {
    await api.assignRolePermissions(roleID, { permission_ids: permissionIDs });
    const updatedRoles = roles.map((role) => (role.id === roleID ? { ...role, permission_ids: permissionIDs } : role));
    setRoles(updatedRoles);
    if (modal?.type === "detail" && modal.role.id === roleID) {
      setModal({ type: "detail", role: { ...modal.role, permission_ids: permissionIDs } });
    }
    await loadAll();
  }

  function togglePermission(permissionID: number) {
    setSelectedPermissionIDs((current) =>
      current.includes(permissionID) ? current.filter((item) => item !== permissionID) : [...current, permissionID]
    );
  }

  function openCreateModal() {
    setForm(defaultForm);
    setSelectedPermissionIDs([]);
    setModal({ type: "create" });
  }

  function openDetailModal(role: RoleItem) {
    setSelectedPermissionIDs(role.permission_ids ?? []);
    setModal({ type: "detail", role });
  }

  function openEditModal(role: RoleItem) {
    setForm({
      code: role.code,
      name: role.name,
      role_type: role.role_type,
      data_scope_type: role.data_scope_type,
      remark: role.remark ?? ""
    });
    setSelectedPermissionIDs(role.permission_ids ?? []);
    setModal({ type: "edit", role });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultForm);
    setSelectedPermissionIDs([]);
  }

  function handleExport() {
    downloadCsv(
      "roles.csv",
      [
        { key: "name", title: "角色名称" },
        { key: "code", title: "角色编码" },
        { key: "role_type_label", title: "角色类型" },
        { key: "data_scope_type_label", title: "数据范围" },
        { key: "status_label", title: "状态" },
        { key: "permission_summary", title: "权限摘要" },
        { key: "remark", title: "备注" }
      ],
      roles.map((role) => ({
        ...role,
        role_type_label: formatRoleType(role.role_type),
        data_scope_type_label: formatDataScopeType(role.data_scope_type),
        status_label: formatStatusLabel(role.status),
        permission_summary: formatPermissionNames(role.permission_ids ?? [], permissionNameMap),
        remark: role.remark ?? ""
      }))
    );
  }

  return (
    <section aria-label="角色权限面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="角色权限数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="角色权限数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <div className="ui-admin-form__field">
            <label htmlFor="role_status_filter">状态 status</label>
            <select id="role_status_filter" value={status} onChange={(event) => setStatus(event.target.value)}>
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
          rows={roles}
          columns={columns}
          getRowId={(role) => role.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onExport={handleExport}
          onDetail={openDetailModal}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无角色数据"}
          ariaLabel="角色列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(role) => `选择角色-${role.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="角色权限弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>角色详情</h3>
                    <p>{modal.role.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>角色编码</dt>
                      <dd>{modal.role.code}</dd>
                    </div>
                    <div>
                      <dt>角色类型</dt>
                      <dd>{formatRoleType(modal.role.role_type)}</dd>
                    </div>
                    <div>
                      <dt>数据范围</dt>
                      <dd>{formatDataScopeType(modal.role.data_scope_type)}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.role.status)}</dd>
                    </div>
                    <div>
                      <dt>权限摘要</dt>
                      <dd>{formatPermissionNames(modal.role.permission_ids ?? [], permissionNameMap) || "-"}</dd>
                    </div>
                    <div>
                      <dt>备注</dt>
                      <dd>{modal.role.remark || "-"}</dd>
                    </div>
                  </dl>

                  <div className="ui-admin-form__field">
                    <label htmlFor="permission_module">权限模块 module</label>
                    <select id="permission_module" value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)}>
                      {groupedModules.map(([module]) => (
                        <option key={module} value={module}>
                          {formatModuleName(module)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <table className="ui-admin-table">
                    <thead>
                      <tr>
                        <th>勾选</th>
                        <th>权限名称</th>
                        <th>权限标识</th>
                        <th>资源类型</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modulePermissions.map((permission) => (
                        <tr key={permission.id}>
                          <td>
                            <input
                              type="checkbox"
                              className="ui-admin-table__checkbox"
                              aria-label={`权限-${permission.id}`}
                              checked={selectedPermissionIDs.includes(permission.id)}
                              onChange={() => togglePermission(permission.id)}
                            />
                          </td>
                          <td>{permission.name}</td>
                          <td>{permission.code}</td>
                          <td>{permission.resource_type || "-"}</td>
                        </tr>
                      ))}
                      {modulePermissions.length === 0 ? (
                        <tr>
                          <td colSpan={4}>暂无权限数据</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    <button
                      type="button"
                      className="ui-button ui-button--ghost"
                      onClick={() => void handleAssignRolePermissions(modal.role.id, permissions.map((item) => item.id))}
                    >
                      授予全部权限
                    </button>
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => openEditModal(modal.role)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--primary"
                      onClick={() => void handleAssignRolePermissions(modal.role.id, selectedPermissionIDs)}
                    >
                      保存授权
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增角色" : "编辑角色"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="role_code">角色编码</label>
                        <input
                          id="role_code"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="role_name">角色名称</label>
                        <input
                          id="role_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="role_type">角色类型</label>
                        <select
                          id="role_type"
                          value={form.role_type}
                          onChange={(event) => setForm((current) => ({ ...current, role_type: event.target.value }))}
                        >
                          <option value="custom">自定义</option>
                          <option value="system">系统角色</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="data_scope_type">数据范围</label>
                        <select
                          id="data_scope_type"
                          value={form.data_scope_type}
                          onChange={(event) => setForm((current) => ({ ...current, data_scope_type: event.target.value }))}
                        >
                          <option value="all">全部数据</option>
                          <option value="subtree">本级及下级</option>
                          <option value="self">仅本人</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="role_remark">备注</label>
                        <textarea
                          id="role_remark"
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
                      {modal.type === "create" ? "新增角色" : "保存修改"}
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

function buildRoleQuery(status: string, page: number, pageSize: number): RoleListQuery {
  return {
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "角色权限接口暂不可用，请检查后端 /api/v1/roles 或 /api/v1/permissions 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "角色权限请求参数错误，请检查角色编码、名称或权限配置。";
  }
  return message || "角色权限数据加载失败";
}

function formatPermissionNames(permissionIDs: number[], permissionNameMap: Map<number, string>): string {
  return permissionIDs.map((permissionID) => permissionNameMap.get(permissionID) ?? `权限-${permissionID}`).join("、");
}

function formatModuleName(module: string): string {
  switch (module) {
    case "user":
      return "用户管理";
    case "org":
      return "组织管理";
    case "notice":
      return "公告通知";
    case "question":
      return "题目管理";
    case "question_bank":
      return "题库管理";
    case "analytics":
      return "数据统计";
    case "exam":
      return "考试管理";
    default:
      return module;
  }
}

function formatRoleType(roleType: string): string {
  switch (roleType) {
    case "system":
      return "系统角色";
    case "custom":
      return "自定义";
    default:
      return roleType || "-";
  }
}

function formatDataScopeType(scopeType: string): string {
  switch (scopeType) {
    case "all":
      return "全部数据";
    case "subtree":
      return "本级及下级";
    case "self":
      return "仅本人";
    default:
      return scopeType || "-";
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
  gridTemplateColumns: "minmax(220px, 300px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
