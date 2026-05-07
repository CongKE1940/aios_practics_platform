import { useEffect, useState, type CSSProperties, type FormEvent } from "react";

import type { ChangeMyPasswordInput, FileAsset, ManagedUser, UserProfileInput } from "@aios/api-sdk";
import { PageSection, StatusNotice, ToastNotice } from "@aios/ui-web";

export interface UserProfileApi {
  getMyProfile(): Promise<ManagedUser>;
  updateMyProfile(body: UserProfileInput): Promise<ManagedUser>;
  changeMyPassword(body: ChangeMyPasswordInput): Promise<ManagedUser>;
  uploadFile?(body: FormData): Promise<FileAsset>;
}

interface ProfilePageProps {
  api: UserProfileApi;
  onUserUpdated?(user: ManagedUser): void;
}

export function ProfilePage({ api, onUserUpdated }: ProfilePageProps) {
  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [profileForm, setProfileForm] = useState<UserProfileInput>({ display_name: "", phone: "", email: "", avatar_url: "" });
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
          email: user.email ?? "",
          avatar_url: user.avatar_url ?? ""
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
        email: profileForm.email || undefined,
        avatar_url: profileForm.avatar_url || undefined
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

  async function handleAvatarFile(file: File | null) {
    if (!file) {
      return;
    }
    setNotice(null);
    try {
      if (api.uploadFile) {
        const payload = new FormData();
        payload.append("file", file);
        payload.append("usage", "user_avatar");
        const uploaded = await api.uploadFile(payload);
        setProfileForm((current) => ({ ...current, avatar_url: uploaded.url ?? uploaded.original_url ?? current.avatar_url }));
        return;
      }
      const dataUrl = await readFileAsDataURL(file);
      setProfileForm((current) => ({ ...current, avatar_url: dataUrl }));
    } catch (error) {
      setNotice({ tone: "danger", title: "头像上传失败", description: error instanceof Error ? error.message : "头像上传失败" });
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
            <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="user_profile_avatar_file">头像</label>
              {profileForm.avatar_url ? <img src={profileForm.avatar_url} alt="" style={avatarPreviewStyle} /> : null}
              <input
                id="user_profile_avatar_file"
                type="file"
                accept="image/*"
                onChange={(event) => void handleAvatarFile(event.target.files?.[0] ?? null)}
              />
            </div>
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

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

const avatarPreviewStyle: CSSProperties = {
  width: 88,
  height: 88,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid var(--ui-color-border)",
  background: "var(--ui-color-bg-elevated)"
};

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
