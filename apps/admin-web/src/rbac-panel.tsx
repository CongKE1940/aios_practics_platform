import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { PageResult, PermissionItem, RoleInput, RoleItem } from "@aios/api-sdk";

export interface RbacPanelApi {
  listRoles(): Promise<PageResult<RoleItem>>;
  createRole(body: RoleInput): Promise<RoleItem>;
  assignRolePermissions(id: number, body: { permission_ids: number[] }): Promise<RoleItem>;
  listPermissions(): Promise<PageResult<PermissionItem>>;
}

const defaultForm: RoleInput = {
  code: "",
  name: "",
  role_type: "custom",
  data_scope_type: "subtree",
  remark: ""
};

export function RbacPanel({ api }: { api: RbacPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [form, setForm] = useState<RoleInput>(defaultForm);
  const [selectedRoleID, setSelectedRoleID] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedPermissionIDs, setSelectedPermissionIDs] = useState<number[]>([]);

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

  const modulePermissions = useMemo(
    () => permissions.filter((permission) => permission.module === selectedModule),
    [permissions, selectedModule]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createRole(form);
    setForm(defaultForm);
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

  return (
    <section aria-label="角色权限面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">角色权限</span>
            <h2>角色权限</h2>
            <p>原型中的“菜单与权限管理”在本轮映射为角色、模块、权限三栏协作，不引入新的错误路由。</p>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout--triple ui-admin-layout">
          <aside className="ui-admin-tree-card">
            <div className="ui-admin-tree-card__header">
              <div>
                <h3>模块列表</h3>
                <p>按权限模块聚合当前可授权能力。</p>
              </div>
            </div>
            <div className="ui-admin-tree">
              {groupedModules.map(([module, items]) => (
                <div
                  key={module}
                  className={["ui-admin-tree__leaf", selectedModule === module ? "is-active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <strong>{formatModuleName(module)}</strong>
                  <span className="ui-admin-subtle">{items.length} 个权限点</span>
                  <button type="button" className="ui-admin-link" onClick={() => setSelectedModule(module)}>
                    查看
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div className="ui-admin-main">
            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>权限列表</h3>
                  <p>当前模块：{formatModuleName(selectedModule)}</p>
                </div>
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
            </section>
          </div>

          <aside className="ui-admin-side-card">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增角色</h3>
                  <p>保留现有接口，只录入核心字段。</p>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmit(event)}>
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
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增角色
                  </button>
                </div>
              </form>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>角色授权</h3>
                  <p>先选择角色，再保存当前勾选权限。</p>
                </div>
              </div>
              <div className="ui-admin-list-card">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className={["ui-admin-role-card", selectedRole?.id === role.id ? "is-active" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <strong>{role.name}</strong>
                    <span className="ui-admin-subtle">{role.code}</span>
                    <div className="ui-admin-chip-list">
                      {(role.permission_ids ?? []).slice(0, 3).map((permissionID) => (
                        <span key={permissionID} className="ui-admin-chip">
                          {permissions.find((item) => item.id === permissionID)?.name ?? `权限-${permissionID}`}
                        </span>
                      ))}
                    </div>
                    <button type="button" className="ui-admin-link" onClick={() => setSelectedRoleID(role.id)}>
                      选择角色
                    </button>
                  </div>
                ))}
              </div>
              {selectedRole ? (
                <div className="ui-admin-side-card__actions">
                  <button
                    type="button"
                    className="ui-button ui-button--ghost"
                    onClick={() => void handleAssignRolePermissions(selectedRole.id, permissions.map((item) => item.id))}
                  >
                    {`授予全部权限-${selectedRole.id}`}
                  </button>
                  <button
                    type="button"
                    className="ui-button ui-button--primary"
                    onClick={() => void handleAssignRolePermissions(selectedRole.id, selectedPermissionIDs)}
                  >
                    保存授权
                  </button>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
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
