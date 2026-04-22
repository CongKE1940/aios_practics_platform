import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { ManagedUser, ManagedUserInput, PageResult, RoleItem } from "@aios/api-sdk";

export interface UserPanelApi {
  listUsers(): Promise<PageResult<ManagedUser>>;
  createUser(body: ManagedUserInput): Promise<ManagedUser>;
  assignUserRoles(id: number, body: { role_ids: number[] }): Promise<ManagedUser>;
  disableUser(id: number): Promise<ManagedUser>;
  listRoles(): Promise<PageResult<RoleItem>>;
}

const defaultForm = {
  username: "",
  display_name: "",
  user_type: "teacher",
  password: "",
  role_id: ""
};

export function UserPanel({ api }: { api: UserPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [roleSelections, setRoleSelections] = useState<Record<number, string>>({});

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [userResult, roleResult] = await Promise.all([api.listUsers(), api.listRoles()]);
      setUsers(userResult.items);
      setRoles(roleResult.items);
      setRoleSelections(() =>
        Object.fromEntries(
          userResult.items.map((user) => [
            user.id,
            user.role_ids && user.role_ids.length > 0 ? String(user.role_ids[0]) : ""
          ])
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载用户数据失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createUser({
      username: form.username,
      display_name: form.display_name,
      user_type: form.user_type,
      password: form.password,
      role_ids: form.role_id ? [Number(form.role_id)] : []
    });
    setForm(defaultForm);
    await loadAll();
  }

  async function handleAssignRoles(userID: number) {
    const selectedRoleID = roleSelections[userID];
    await api.assignUserRoles(userID, {
      role_ids: selectedRoleID ? [Number(selectedRoleID)] : []
    });
    await loadAll();
  }

  async function handleDisableUser(userID: number) {
    await api.disableUser(userID);
    await loadAll();
  }

  return (
    <section aria-label="用户管理面板">
      <h2>用户管理</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <section aria-label="新增用户">
        <h3>新增用户</h3>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="managed_username">用户名</label>
          <input
            id="managed_username"
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
          />
          <label htmlFor="managed_display_name">姓名</label>
          <input
            id="managed_display_name"
            value={form.display_name}
            onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
          />
          <label htmlFor="managed_user_type">用户类型</label>
          <select
            id="managed_user_type"
            value={form.user_type}
            onChange={(event) => setForm((current) => ({ ...current, user_type: event.target.value }))}
          >
            <option value="teacher">教师</option>
            <option value="student">学生</option>
            <option value="staff">职员</option>
          </select>
          <label htmlFor="managed_password">初始密码</label>
          <input
            id="managed_password"
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <label htmlFor="managed_default_role">默认角色</label>
          <select
            id="managed_default_role"
            value={form.role_id}
            onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
          >
            <option value="">请选择角色</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button type="submit">新增用户</button>
        </form>
      </section>

      <section aria-label="用户列表">
        <h3>用户列表</h3>
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <div>
                <span>{user.display_name}</span>
                <span>{user.username}</span>
                <span>{user.user_type}</span>
                <span>{user.status}</span>
              </div>
              <div>
                {(user.role_ids ?? []).map((roleID) => (
                  <span key={roleID}>{roleMap.get(roleID) ?? `角色-${roleID}`}</span>
                ))}
              </div>
              <div>
                <label htmlFor={`user_role_${user.id}`}>{`用户角色-${user.id}`}</label>
                <select
                  id={`user_role_${user.id}`}
                  aria-label={`用户角色-${user.id}`}
                  value={roleSelections[user.id] ?? ""}
                  onChange={(event) =>
                    setRoleSelections((current) => ({ ...current, [user.id]: event.target.value }))
                  }
                >
                  <option value="">请选择角色</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void handleAssignRoles(user.id)}>
                  {`分配角色-${user.id}`}
                </button>
                <button type="button" onClick={() => void handleDisableUser(user.id)}>
                  {`禁用用户-${user.id}`}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
