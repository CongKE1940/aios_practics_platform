import { useEffect, useState, type FormEvent } from "react";

import type { ChangeMyPasswordInput, ManagedUser, UserProfileInput } from "@aios/api-sdk";
import { PageSection, StatusNotice, ToastNotice } from "@aios/ui-web";

export interface UserProfileApi {
  getMyProfile(): Promise<ManagedUser>;
  updateMyProfile(body: UserProfileInput): Promise<ManagedUser>;
  changeMyPassword(body: ChangeMyPasswordInput): Promise<ManagedUser>;
}

interface ProfilePageProps {
  api: UserProfileApi;
  onUserUpdated?(user: ManagedUser): void;
}

export function ProfilePage({ api, onUserUpdated }: ProfilePageProps) {
  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [profileForm, setProfileForm] = useState<UserProfileInput>({ display_name: "", phone: "", email: "" });
  const [passwordForm, setPasswordForm] = useState({ old_password: "", new_password: "", confirm_password: "" });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; title: string; description: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage("");
    api
      .getMyProfile()
      .then((user) => {
        if (!active) {
          return;
        }
        setProfile(user);
        setProfileForm({
          display_name: user.display_name,
          phone: user.phone ?? "",
          email: user.email ?? ""
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "个人信息加载失败");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setNotice(null);
    try {
      const updated = await api.updateMyProfile({
        display_name: profileForm.display_name,
        phone: profileForm.phone || undefined,
        email: profileForm.email || undefined
      });
      setProfile(updated);
      onUserUpdated?.(updated);
      setNotice({ tone: "success", title: "个人信息已保存", description: "账号资料已更新。" });
    } catch (error) {
      setNotice({ tone: "danger", title: "保存失败", description: error instanceof Error ? error.message : "个人信息保存失败" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setNotice({ tone: "danger", title: "密码未保存", description: "两次输入的新密码不一致。" });
      return;
    }
    if (passwordForm.new_password.length < 8 || passwordForm.new_password === passwordForm.old_password) {
      setNotice({ tone: "danger", title: "密码未保存", description: "新密码至少 8 位，且不能与当前密码相同。" });
      return;
    }

    setSavingPassword(true);
    try {
      const updated = await api.changeMyPassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password
      });
      setProfile(updated);
      onUserUpdated?.(updated);
      setPasswordForm({ old_password: "", new_password: "", confirm_password: "" });
      setNotice({ tone: "success", title: "密码已更新", description: "下次登录请使用新密码。" });
    } catch (error) {
      setNotice({ tone: "danger", title: "密码修改失败", description: error instanceof Error ? error.message : "密码修改失败" });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section aria-label="个人信息页面" className="ui-admin-page ui-user-page">
      {notice ? <ToastNotice tone={notice.tone} title={notice.title} description={notice.description} onClose={() => setNotice(null)} /> : null}
      {errorMessage ? <StatusNotice tone="danger" title="个人信息加载失败" description={errorMessage} /> : null}

      <PageSection title="个人信息" description="">
        <section className="ui-admin-card" aria-label="账号概览" aria-busy={loading}>
          <dl className="ui-admin-meta-list">
            <div>
              <dt>用户名</dt>
              <dd>{profile?.username ?? "-"}</dd>
            </div>
            <div>
              <dt>账号类型</dt>
              <dd>{profile ? formatUserType(profile.user_type) : "-"}</dd>
            </div>
            <div>
              <dt>账号状态</dt>
              <dd>{profile?.status === "active" ? "启用" : profile?.status ?? "-"}</dd>
            </div>
          </dl>
        </section>
      </PageSection>

      <section className="ui-admin-card" aria-label="编辑个人信息">
        <form onSubmit={(event) => void handleProfileSubmit(event)}>
          <div className="ui-admin-form__grid">
            <div className="ui-admin-form__field">
              <label htmlFor="user_profile_display_name">姓名</label>
              <input
                id="user_profile_display_name"
                value={profileForm.display_name}
                onChange={(event) => setProfileForm((current) => ({ ...current, display_name: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="user_profile_phone">手机号</label>
              <input
                id="user_profile_phone"
                value={profileForm.phone ?? ""}
                onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="user_profile_email">邮箱</label>
              <input
                id="user_profile_email"
                type="email"
                value={profileForm.email ?? ""}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
          </div>
          <div className="ui-admin-modal__footer">
            <button type="submit" className="ui-button ui-button--primary" disabled={savingProfile || loading}>
              {savingProfile ? "保存中" : "保存个人信息"}
            </button>
          </div>
        </form>
      </section>

      <section className="ui-admin-card" aria-label="修改密码">
        <form onSubmit={(event) => void handlePasswordSubmit(event)}>
          <div className="ui-admin-form__grid">
            <div className="ui-admin-form__field">
              <label htmlFor="user_profile_old_password">当前密码</label>
              <input
                id="user_profile_old_password"
                type="password"
                value={passwordForm.old_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, old_password: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="user_profile_new_password">新密码</label>
              <input
                id="user_profile_new_password"
                type="password"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="user_profile_confirm_password">确认新密码</label>
              <input
                id="user_profile_confirm_password"
                type="password"
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
              />
            </div>
          </div>
          <div className="ui-admin-modal__footer">
            <button type="submit" className="ui-button ui-button--primary" disabled={savingPassword || loading}>
              {savingPassword ? "修改中" : "修改密码"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

function formatUserType(userType: string): string {
  switch (userType) {
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    case "school_admin":
      return "学校/组织管理员";
    case "tenant_admin":
      return "租户管理员";
    case "sys_admin":
      return "系统管理员";
    default:
      return userType || "-";
  }
}
