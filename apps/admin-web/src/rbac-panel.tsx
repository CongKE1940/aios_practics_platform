import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { PageResult, PermissionItem, RoleInput, RoleItem } from "@aios/api-sdk";

import { downloadCsv, paginateItems, toggleSelectAll, toggleSelection } from "./list-page-utils";

export interface RbacPanelApi {
  listRoles(): Promise<PageResult<RoleItem>>;
  createRole(body: RoleInput): Promise<RoleItem>;
  assignRolePermissions(id: number, body: { permission_ids: number[] }): Promise<RoleItem>;
  listPermissions(): Promise<PageResult<PermissionItem>>;
}

const pageSize = 8;

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
  | null;

export function RbacPanel({ api }: { api: RbacPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [form, setForm] = useState<RoleInput>(defaultForm);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [selectedRoleID, setSelectedRoleID] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedPermissionIDs, setSelectedPermissionIDs] = useState<number[]>([]);
  const [modal, setModal] = useState<ModalState>(null);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [roleResult, permissionResult] = await Promise.all([api.listRoles(), api.listPermissions()]);
      setRoles(roleResult.items);
      setPermissions(permissionResult.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载角色权限失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    setPage(1);
    setSelectedIDs([]);
  }, [keyword]);

  useEffect(() => {
    if (!selectedRoleID && roles.length > 0) {
      setSelectedRoleID(roles[0].id);
    }
  }, [roles, selectedRoleID]);

  useEffect(() => {
    if (!selectedModule && permissions.length > 0) {
      setSelectedModule(permissions[0].module);
    }
  }, [permissions, selectedModule]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleID) ?? roles[0] ?? null,
    [roles, selectedRoleID]
  );

  useEffect(() => {
    setSelectedPermissionIDs(selectedRole?.permission_ids ?? []);
  }, [selectedRole]);

  const groupedModules = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const permission of permissions) {
      const current = map.get(permission.module) ?? [];
      current.push(permission);
      map.set(permission.module, current);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const filteredRoles = useMemo(
    () =>
      roles.filter((role) =>
        [role.name, role.code, formatPermissionNames(role.permission_ids ?? [], permissions)]
          .join(" ")
          .toLowerCase()
          .includes(keyword.trim().toLowerCase())
      ),
    [keyword, permissions, roles]
  );

  const pagination = useMemo(() => paginateItems(filteredRoles, page, pageSize), [filteredRoles, page]);
  const currentPageIDs = useMemo(() => pagination.items.map((item) => item.id), [pagination.items]);

  useEffect(() => {
    if (page !== pagination.page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

  const modulePermissions = useMemo(
    () => permissions.filter((permission) => permission.module === selectedModule),
    [permissions, selectedModule]
  );

  async function handleCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createRole(form);
    setForm(defaultForm);
    setModal(null);
    await loadAll();
  }

  async function handleAssignRolePermissions(roleID: number, permissionIDs: number[]) {
    await api.assignRolePermissions(roleID, { permission_ids: permissionIDs });
    await loadAll();
  }

  function togglePermission(permissionID: number) {
    setSelectedPermissionIDs((current) =>
      current.includes(permissionID) ? current.filter((item) => item !== permissionID) : [...current, permissionID]
    );
  }

  function handleExport() {
    downloadCsv(
      "roles.csv",
      [
        { key: "name", title: "角色名称" },
        { key: "code", title: "角色编码" },
        { key: "role_type", title: "角色类型" },
        { key: "data_scope_type", title: "数据范围" },
        { key: "permission_summary", title: "权限摘要" }
      ],
      filteredRoles.map((role) => ({
        ...role,
        permission_summary: formatPermissionNames(role.permission_ids ?? [], permissions)
      }))
    );
  }

  return (
    <section aria-label="角色权限面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">角色权限</span>
            <h2>角色权限</h2>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <>
          <section className="ui-admin-filters ui-admin-card">
            <div className="ui-admin-filters__grid">
              <div className="ui-admin-form__field">
                <label htmlFor="role_keyword">搜索角色</label>
                <input
                  id="role_keyword"
                  placeholder="输入角色名称或编码"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="ui-admin-actions-bar ui-admin-card">
            <div className="ui-admin-actions-bar__group">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setModal({ type: "create" })}>
                新增角色
              </button>
              <button type="button" className="ui-button ui-button--ghost" disabled>
                批量删除
              </button>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleExport}>
                导出列表
              </button>
            </div>
            <div className="ui-admin-pagination__info">{`已选 ${selectedIDs.length} 项`}</div>
          </section>

          <section className="ui-admin-table-card">
            <div className="ui-admin-table-card__header">
              <div>
                <h3>角色列表</h3>
              </div>
            </div>
            <table className="ui-admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="ui-admin-table__checkbox"
                      aria-label="全选角色"
                      checked={currentPageIDs.length > 0 && currentPageIDs.every((id) => selectedIDs.includes(id))}
                      onChange={() => setSelectedIDs((current) => toggleSelectAll(current, currentPageIDs))}
                    />
                  </th>
                  <th>角色名称</th>
                  <th>角色编码</th>
                  <th>角色类型</th>
                  <th>权限数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="ui-admin-table__checkbox"
                        aria-label={`选择角色-${role.id}`}
                        checked={selectedIDs.includes(role.id)}
                        onChange={() => setSelectedIDs((current) => toggleSelection(current, role.id))}
                      />
                    </td>
                    <td>{role.name}</td>
                    <td>{role.code}</td>
                    <td>{role.role_type}</td>
                    <td>{role.permission_ids?.length ?? 0}</td>
                    <td>
                      <div className="ui-admin-table__actions">
                        <button
                          type="button"
                          className="ui-admin-link"
                          onClick={() => {
                            setSelectedRoleID(role.id);
                            setModal({ type: "detail", role });
                          }}
                        >
                          详情
                        </button>
                        <button
                          type="button"
                          className="ui-admin-link"
                          onClick={() => {
                            setSelectedRoleID(role.id);
                            setModal({ type: "detail", role });
                          }}
                        >
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ui-admin-table__footer">
              <div className="ui-admin-pagination__info">{`共 ${pagination.total} 条，当前第 ${pagination.page} / ${pagination.pageCount} 页`}</div>
              <div className="ui-admin-pagination">
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}
                  disabled={pagination.page >= pagination.pageCount}
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="角色权限弹层">
            {modal.type === "create" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>新增角色</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleCreateRole(event)}>
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
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      新增角色
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>角色详情</h3>
                    <p>{modal.role.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => setModal(null)}>
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
                      <dd>{modal.role.role_type}</dd>
                    </div>
                    <div>
                      <dt>数据范围</dt>
                      <dd>{modal.role.data_scope_type}</dd>
                    </div>
                    <div>
                      <dt>权限摘要</dt>
                      <dd>{formatPermissionNames(modal.role.permission_ids ?? [], permissions) || "-"}</dd>
                    </div>
                  </dl>

                  <div className="ui-admin-form__field">
                    <label htmlFor="permission_module">权限模块</label>
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
                          <td>{permission.resource_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ui-admin-modal__footer">
                  <button
                    type="button"
                    className="ui-button ui-button--ghost"
                    onClick={() => void handleAssignRolePermissions(modal.role.id, permissions.map((item) => item.id))}
                  >
                    {`授予全部权限-${modal.role.id}`}
                  </button>
                  <button
                    type="button"
                    className="ui-button ui-button--primary"
                    onClick={() => void handleAssignRolePermissions(modal.role.id, selectedPermissionIDs)}
                  >
                    保存授权
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatPermissionNames(permissionIDs: number[], permissions: PermissionItem[]): string {
  return permissionIDs
    .map((permissionID) => permissions.find((item) => item.id === permissionID)?.name ?? `权限-${permissionID}`)
    .join("、");
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
