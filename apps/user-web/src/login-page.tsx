import { useState, type FormEvent } from "react";

import type { LoginOrganization, LoginRequest } from "@aios/api-sdk";
import { FormInput, FormSelect, StatusNotice, UiButton } from "@aios/ui-web";
import brandIcon from "../../../docs/images/图标.png";

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
    <form aria-label="登录表单" className="ui-auth-form" onSubmit={handleSubmit}>
      <header className="ui-auth-form__header">
        <img src={brandIcon} alt="" className="ui-brand-mark" />
        <h2>欢迎回来</h2>
        <p>科技连接未来，创新改变世界</p>
      </header>
      <div className="ui-field">
        <label htmlFor="tenant_code">组织</label>
        <FormSelect
          id="tenant_code"
          value={form.tenant_code}
          onValueChange={(value) => setForm((current) => ({ ...current, tenant_code: value }))}
          disabled={organizationsLoading}
          emptyOption={{ value: "", label: "" }}
          options={organizations.map((organization) => ({
            value: organization.tenant_code,
            label: formatOrganizationLabel(organization)
          }))}
        />
      </div>
      {organizationsError ? <StatusNotice tone="warning" title="组织列表加载失败" description={organizationsError} /> : null}
      <div className="ui-field">
        <label htmlFor="username">用户名</label>
        <FormInput
          id="username"
          value={form.username}
          onValueChange={(value) => setForm((current) => ({ ...current, username: value }))}
        />
      </div>
      <div className="ui-field">
        <label htmlFor="password">密码</label>
        <FormInput
          id="password"
          type="password"
          value={form.password}
          onValueChange={(value) => setForm((current) => ({ ...current, password: value }))}
        />
      </div>
      {errorMessage ? <StatusNotice tone="danger" title="登录失败" description={errorMessage} /> : null}
      <UiButton type="submit" variant="primary" disabled={submitting || organizationsLoading || !form.tenant_code}>
        {submitting ? "登录中..." : "登录"}
      </UiButton>
      <footer className="ui-auth-form__footer">
        <button type="button" className="ui-auth-link">
          管理端入口
        </button>
        <button type="button" className="ui-auth-link">
          忘记密码？
        </button>
      </footer>
    </form>
  );
}

function formatOrganizationLabel(organization: LoginOrganization): string {
  return `${organization.tenant_name}（${organization.tenant_code}）`;
}
