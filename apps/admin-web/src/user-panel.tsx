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
  const [keyword, setKeyword] = useState("");
  const [selectedUserID, setSelectedUserID] = useState<number | null>(null);
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

  useEffect(() => {
    if (!selectedUserID && users.length > 0) {
      setSelectedUserID(users[0].id);
    }
  }, [selectedUserID, users]);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        [user.username, user.display_name, user.user_type].some((value) =>
          value.toLowerCase().includes(keyword.trim().toLowerCase())
        )
      ),
    [keyword, users]
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserID) ?? filteredUsers[0] ?? null,
    [filteredUsers, selectedUserID, users]
  );

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
    <section aria-label="用户管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">用户管理</span>
            <h2>用户管理</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void loadAll()}>
              刷新数据
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-filters ui-admin-card">
              <div className="ui-admin-filters__grid">
                <div className="ui-admin-form__field">
                  <label htmlFor="user_filter_keyword">搜索用户</label>
                  <input
                    id="user_filter_keyword"
                    placeholder="输入用户名、姓名或类型"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>用户列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>姓名</th>
                    <th>用户类型</th>
                    <th>状态</th>
                    <th>角色</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.display_name}</td>
                      <td>{formatUserType(user.user_type)}</td>
                      <td>
                        <span className={user.status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--danger"}>
                          {user.status === "active" ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td>
                        <div className="ui-admin-chip-list">
                          {(user.role_ids ?? []).map((roleID) => (
                            <span key={roleID} className="ui-admin-chip">
                              {roleMap.get(roleID) ?? `角色-${roleID}`}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => setSelectedUserID(user.id)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleDisableUser(user.id)}>
                            {`禁用用户-${user.id}`}
                          </button>
                        </div>
                      </td>
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
                  <h3>新增用户</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="managed_username">用户名</label>
                  <input
                    id="managed_username"
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="managed_display_name">姓名</label>
                  <input
                    id="managed_display_name"
                    value={form.display_name}
                    onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
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
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="managed_password">初始密码</label>
                  <input
                    id="managed_password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
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
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增用户
                  </button>
                </div>
              </form>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>角色分配</h3>
                </div>
              </div>
              {selectedUser ? (
                <>
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>姓名</dt>
                      <dd>{selectedUser.display_name}</dd>
                    </div>
                    <div>
                      <dt>账号</dt>
                      <dd>{selectedUser.username}</dd>
                    </div>
                    <div>
                      <dt>类型</dt>
                      <dd>{formatUserType(selectedUser.user_type)}</dd>
                    </div>
                  </dl>
                  <div className="ui-admin-form__field">
                    <label htmlFor={`user_role_${selectedUser.id}`}>{`用户角色-${selectedUser.id}`}</label>
                    <select
                      id={`user_role_${selectedUser.id}`}
                      aria-label={`用户角色-${selectedUser.id}`}
                      value={roleSelections[selectedUser.id] ?? ""}
                      onChange={(event) =>
                        setRoleSelections((current) => ({ ...current, [selectedUser.id]: event.target.value }))
                      }
                    >
                      <option value="">请选择角色</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ui-admin-side-card__actions">
                    <button
                      type="button"
                      className="ui-button ui-button--ghost"
                      onClick={() => void handleDisableUser(selectedUser.id)}
                    >
                      {`禁用用户-${selectedUser.id}`}
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--primary"
                      onClick={() => void handleAssignRoles(selectedUser.id)}
                    >
                      {`分配角色-${selectedUser.id}`}
                    </button>
                  </div>
                </>
              ) : (
                <div className="ui-admin-empty-inline">暂无用户数据</div>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function formatUserType(userType: string): string {
  switch (userType) {
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    case "staff":
      return "职员";
    default:
      return userType;
  }
}
