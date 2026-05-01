import { useState, type FormEvent } from "react";

import type { ChangeInitialPasswordRequest, LoginOrganization, LoginRequest } from "@aios/api-sdk";
import { StatusNotice } from "@aios/ui-web";
import brandIcon from "../../../docs/images/图标.png";

interface LoginPageProps {
  organizations: LoginOrganization[];
  organizationsLoading: boolean;
  organizationsError: string;
  submitting: boolean;
  errorMessage: string;
  passwordChangeState?: ChangeInitialPasswordRequest | null;
  passwordChangeConfirm?: string;
  passwordChanging?: boolean;
  onSubmit(values: LoginRequest): Promise<void>;
  onPasswordChangeStateChange?(state: ChangeInitialPasswordRequest): void;
  onPasswordChangeConfirmChange?(value: string): void;
  onPasswordChangeSubmit?(): Promise<void>;
  onPasswordChangeBack?(): void;
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
  passwordChangeState,
  passwordChangeConfirm = "",
  passwordChanging = false,
  onSubmit,
  onPasswordChangeStateChange,
  onPasswordChangeConfirmChange,
  onPasswordChangeSubmit,
  onPasswordChangeBack
}: LoginPageProps) {
  const [form, setForm] = useState<LoginRequest>(defaultForm);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordChangeState) {
      await onPasswordChangeSubmit?.();
      return;
    }
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
      {organizationsError ? <StatusNotice tone="warning" title="组织列表加载失败" description={organizationsError} /> : null}
      <div className="ui-field">
        <label htmlFor="username">用户名</label>
        <input
          id="username"
          value={form.username}
          onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
        />
      </div>
      <div className="ui-field">
        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
        />
      </div>
      {errorMessage ? <StatusNotice tone="danger" title="登录失败" description={errorMessage} /> : null}
      {passwordChangeState ? (
        <>
          <StatusNotice tone="warning" title="需要修改初始密码" description="当前账号使用一次性密码，修改后才能进入系统。" />
          <div className="ui-field">
            <label htmlFor="initial_new_password">新密码</label>
            <input
              id="initial_new_password"
              type="password"
              value={passwordChangeState.new_password}
              onChange={(event) => onPasswordChangeStateChange?.({ ...passwordChangeState, new_password: event.target.value })}
            />
          </div>
          <div className="ui-field">
            <label htmlFor="initial_confirm_password">确认新密码</label>
            <input
              id="initial_confirm_password"
              type="password"
              value={passwordChangeConfirm}
              onChange={(event) => onPasswordChangeConfirmChange?.(event.target.value)}
            />
          </div>
          <button type="submit" className="ui-button ui-button--primary" disabled={passwordChanging}>
            {passwordChanging ? "修改中..." : "修改密码并登录"}
          </button>
          <button type="button" className="ui-button ui-button--ghost" disabled={passwordChanging} onClick={onPasswordChangeBack}>
            返回登录
          </button>
        </>
      ) : (
        <>
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={submitting || organizationsLoading || !form.tenant_code}
          >
            {submitting ? "登录中..." : "登录"}
          </button>
          <footer className="ui-auth-form__footer">
            <button type="button" className="ui-auth-link">
              管理端入口
            </button>
            <button type="button" className="ui-auth-link">
              忘记密码？
            </button>
          </footer>
        </>
      )}
    </form>
  );
}

function formatOrganizationLabel(organization: LoginOrganization): string {
  return `${organization.tenant_name}（${organization.tenant_code}）`;
}
