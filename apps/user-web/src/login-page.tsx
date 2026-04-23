import { useState, type FormEvent } from "react";

import type { LoginOrganization, LoginRequest } from "@aios/api-sdk";

interface LoginPageProps {
  organizations: LoginOrganization[];
  organizationsLoading: boolean;
  organizationsError: string;
  submitting: boolean;
  errorMessage: string;
  onSubmit(values: LoginRequest): Promise<void>;
}

const defaultForm: LoginRequest = {
  tenant_code: "",
  username: "",
  password: ""
};

export function LoginPage({
  organizations,
  organizationsLoading,
  organizationsError,
  submitting,
  errorMessage,
  onSubmit
}: LoginPageProps) {
  const [form, setForm] = useState<LoginRequest>(defaultForm);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.tenant_code) {
      return;
    }
    await onSubmit(form);
    setForm((current) => ({ ...current, password: "" }));
  }

  return (
    <form aria-label="登录表单" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="tenant_code">组织</label>
        <select
          id="tenant_code"
          value={form.tenant_code}
          onChange={(event) => setForm((current) => ({ ...current, tenant_code: event.target.value }))}
          disabled={organizationsLoading}
        >
          <option value="">{organizationsLoading ? "组织加载中..." : "请选择组织"}</option>
          {organizations.map((organization) => (
            <option key={organization.tenant_code} value={organization.tenant_code}>
              {formatOrganizationLabel(organization)}
            </option>
          ))}
        </select>
      </div>
      {organizationsError ? <p>{organizationsError}</p> : null}
      <div>
        <label htmlFor="username">用户名</label>
        <input
          id="username"
          value={form.username}
          onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
        />
      </div>
      {errorMessage ? <p>{errorMessage}</p> : null}
      <button type="submit" disabled={submitting || organizationsLoading || !form.tenant_code}>
        {submitting ? "登录中..." : "登录"}
      </button>
    </form>
  );
}

function formatOrganizationLabel(organization: LoginOrganization): string {
  return `${organization.tenant_name}（${organization.tenant_code}）`;
}
