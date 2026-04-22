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

  const permissionMap = useMemo(() => new Map(permissions.map((item) => [item.id, item.name])), [permissions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createRole(form);
    setForm(defaultForm);
    await loadAll();
  }

  async function handleAssignAllPermissions(roleID: number) {
    await api.assignRolePermissions(roleID, {
      permission_ids: permissions.map((item) => item.id)
    });
    await loadAll();
  }

  return (
    <section aria-label="角色权限面板">
      <h2>角色权限</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <section aria-label="新增角色">
        <h3>新增角色</h3>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="role_code">角色编码</label>
          <input
            id="role_code"
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
          />
          <label htmlFor="role_name">角色名称</label>
          <input
            id="role_name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <button type="submit">新增角色</button>
        </form>
      </section>

      <section aria-label="权限列表">
        <h3>权限清单</h3>
        <ul>
          {permissions.map((permission) => (
            <li key={permission.id}>
              <span>{permission.code}</span>
              <span>{permission.module}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="角色列表">
        <h3>角色列表</h3>
        <ul>
          {roles.map((role) => (
            <li key={role.id}>
              <div>
                <span>{role.name}</span>
                <span>{role.code}</span>
                <span>{role.status}</span>
              </div>
              <div>
                {(role.permission_ids ?? []).map((permissionID) => (
                  <span key={permissionID}>{permissionMap.get(permissionID) ?? `权限-${permissionID}`}</span>
                ))}
              </div>
              <button type="button" onClick={() => void handleAssignAllPermissions(role.id)}>
                {`授予全部权限-${role.id}`}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
