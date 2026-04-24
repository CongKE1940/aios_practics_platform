import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { ManagedUser, ManagedUserInput, PageResult, RoleItem } from "@aios/api-sdk";

import { downloadCsv, paginateItems, toggleSelectAll, toggleSelection } from "./list-page-utils";

export interface UserPanelApi {
  listUsers(): Promise<PageResult<ManagedUser>>;
  createUser(body: ManagedUserInput): Promise<ManagedUser>;
  assignUserRoles(id: number, body: { role_ids: number[] }): Promise<ManagedUser>;
  disableUser(id: number): Promise<ManagedUser>;
  listRoles(): Promise<PageResult<RoleItem>>;
  updateUser?(id: number, body: ManagedUserInput): Promise<ManagedUser>;
}

const pageSize = 8;

const defaultForm = {
  username: "",
  display_name: "",
  user_type: "teacher",
  password: "",
  role_id: ""
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; user: ManagedUser }
  | { type: "edit"; user: ManagedUser }
  | null;

export function UserPanel({ api }: { api: UserPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("");
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [modal, setModal] = useState<ModalState>(null);
  const [page, setPage] = useState(1);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [userResult, roleResult] = await Promise.all([api.listUsers(), api.listRoles()]);
      setUsers(userResult.items);
      setRoles(roleResult.items);
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
    setPage(1);
  }, [keyword, userTypeFilter]);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const matchesKeyword = [user.username, user.display_name, user.user_type]
          .join(" ")
          .toLowerCase()
          .includes(keyword.trim().toLowerCase());
        const matchesType = !userTypeFilter || user.user_type === userTypeFilter;
        return matchesKeyword && matchesType;
      }),
    [keyword, userTypeFilter, users]
  );

  const pagination = useMemo(() => paginateItems(filteredUsers, page, pageSize), [filteredUsers, page]);
  const currentPageIDs = useMemo(() => pagination.items.map((item) => item.id), [pagination.items]);

  useEffect(() => {
    if (page !== pagination.page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (modal?.type === "edit" && api.updateUser) {
      await api.updateUser(modal.user.id, {
        username: form.username,
        display_name: form.display_name,
        user_type: form.user_type,
        password: form.password || undefined,
        role_ids: form.role_id ? [Number(form.role_id)] : []
      });
    } else {
      await api.createUser({
        username: form.username,
        display_name: form.display_name,
        user_type: form.user_type,
        password: form.password,
        role_ids: form.role_id ? [Number(form.role_id)] : []
      });
    }

    closeModal();
    await loadAll();
  }

  async function handleAssignRoles(userID: number, roleID: string) {
    await api.assignUserRoles(userID, {
      role_ids: roleID ? [Number(roleID)] : []
    });
    await loadAll();
  }

  async function handleBatchDelete() {
    const ids = [...selectedIDs];
    if (ids.length === 0) {
      return;
    }
    await Promise.all(ids.map((id) => api.disableUser(id)));
    setSelectedIDs([]);
    await loadAll();
  }

  function handleExport() {
    downloadCsv(
      "users.csv",
      [
        { key: "username", title: "用户名" },
        { key: "display_name", title: "姓名" },
        { key: "user_type", title: "用户类型" },
        { key: "status", title: "状态" }
      ],
      filteredUsers
    );
  }

  function openCreateModal() {
    setForm(defaultForm);
    setModal({ type: "create" });
  }

  function openEditModal(user: ManagedUser) {
    setForm({
      username: user.username,
      display_name: user.display_name,
      user_type: user.user_type,
      password: "",
      role_id: user.role_ids?.[0] ? String(user.role_ids[0]) : ""
    });
    setModal({ type: "edit", user });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultForm);
  }

  return (
    <section aria-label="用户管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">用户管理</span>
            <h2>用户管理</h2>
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
                <label htmlFor="user_filter_keyword">搜索用户</label>
                <input
                  id="user_filter_keyword"
                  placeholder="输入用户名、姓名或类型"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="ui-admin-form__field">
                <label htmlFor="user_type_filter">用户类型</label>
                <select
                  id="user_type_filter"
                  value={userTypeFilter}
                  onChange={(event) => setUserTypeFilter(event.target.value)}
                >
                  <option value="">全部类型</option>
                  <option value="teacher">教师</option>
                  <option value="student">学生</option>
                  <option value="staff">职员</option>
                </select>
              </div>
            </div>
          </section>

          <section className="ui-admin-actions-bar ui-admin-card">
            <div className="ui-admin-actions-bar__group">
              <button type="button" className="ui-button ui-button--primary" onClick={openCreateModal}>
                新增用户
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void handleBatchDelete()}
                disabled={selectedIDs.length === 0}
              >
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
                <h3>用户列表</h3>
              </div>
            </div>
            <table className="ui-admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="ui-admin-table__checkbox"
                      aria-label="全选用户"
                      checked={currentPageIDs.length > 0 && currentPageIDs.every((id) => selectedIDs.includes(id))}
                      onChange={() => setSelectedIDs((current) => toggleSelectAll(current, currentPageIDs))}
                    />
                  </th>
                  <th>用户名</th>
                  <th>姓名</th>
                  <th>用户类型</th>
                  <th>状态</th>
                  <th>角色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="ui-admin-table__checkbox"
                        aria-label={`选择用户-${user.id}`}
                        checked={selectedIDs.includes(user.id)}
                        onChange={() => setSelectedIDs((current) => toggleSelection(current, user.id))}
                      />
                    </td>
                    <td>{user.username}</td>
                    <td>{user.display_name}</td>
                    <td>{formatUserType(user.user_type)}</td>
                    <td>
                      <span className={user.status === "active" ? "ui-admin-status ui-admin-status--active" : "ui-admin-status ui-admin-status--disabled"}>
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
                        <button type="button" className="ui-admin-link" onClick={() => setModal({ type: "detail", user })}>
                          详情
                        </button>
                        <button type="button" className="ui-admin-link" onClick={() => openEditModal(user)}>
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
          <section className="ui-admin-modal" aria-label="用户管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>用户详情</h3>
                    <p>{modal.user.display_name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>用户名</dt>
                      <dd>{modal.user.username}</dd>
                    </div>
                    <div>
                      <dt>姓名</dt>
                      <dd>{modal.user.display_name}</dd>
                    </div>
                    <div>
                      <dt>类型</dt>
                      <dd>{formatUserType(modal.user.user_type)}</dd>
                    </div>
                    <div>
                      <dt>角色</dt>
                      <dd>{(modal.user.role_ids ?? []).map((id) => roleMap.get(id) ?? `角色-${id}`).join("、") || "-"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleAssignRoles(modal.user.id, String(modal.user.role_ids?.[0] ?? ""))}>
                      同步角色
                    </button>
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void api.disableUser(modal.user.id).then(loadAll).then(closeModal)}>
                      删除用户
                    </button>
                  </div>
                  <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.user)}>
                    编辑
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增用户" : "编辑用户"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
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
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增用户" : "保存修改"}
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
