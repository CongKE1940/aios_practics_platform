import { useEffect, useState, type CSSProperties, type FormEvent } from "react";

import type { ChangeMyPasswordInput, FileAsset, ManagedUser, UserProfileInput } from "@aios/api-sdk";
import { StatusNotice, ToastNotice } from "@aios/ui-web";

export interface ProfilePanelApi {
  getMyProfile(): Promise<ManagedUser>;
  updateMyProfile(body: UserProfileInput): Promise<ManagedUser>;
  changeMyPassword(body: ChangeMyPasswordInput): Promise<ManagedUser>;
  uploadFile?(body: FormData): Promise<FileAsset>;
}

interface ProfilePanelProps {
  api: ProfilePanelApi;
  onUserUpdated?(user: ManagedUser): void;
}

const emptyProfileForm: UserProfileInput = {
  display_name: "",
  phone: "",
  email: "",
  avatar_url: ""
};

const emptyPasswordForm = {
  old_password: "",
  new_password: "",
  confirm_password: ""
};

export function ProfilePanel({ api, onUserUpdated }: ProfilePanelProps) {
  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [profileForm, setProfileForm] = useState<UserProfileInput>(emptyProfileForm);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
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
      .then((item) => {
        if (!active) {
          return;
        }
        setProfile(item);
        setProfileForm(toProfileForm(item));
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
      setProfileForm(toProfileForm(updated));
      onUserUpdated?.(updated);
      setNotice({ tone: "success", title: "个人信息已保存", description: "页面中的用户名称已同步更新。" });
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
      setPasswordForm(emptyPasswordForm);
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
    <section aria-label="个人信息页面" className="ui-admin-page" style={pageStyle}>
      {notice ? (
        <ToastNotice tone={notice.tone} title={notice.title} description={notice.description} onClose={() => setNotice(null)} />
      ) : null}

      {errorMessage ? <StatusNotice tone="danger" title="个人信息加载失败" description={errorMessage} /> : null}

      <section className="ui-admin-card" aria-label="账号概览" style={sectionStyle} aria-busy={loading}>
        <div className="ui-admin-modal__header" style={sectionHeaderStyle}>
          <div>
            <h3>账号信息</h3>
            <p>{profile ? `${profile.username} / ${formatUserType(profile.user_type)}` : "正在加载账号信息"}</p>
          </div>
          {profile?.must_change_password ? <span className="ui-admin-status ui-admin-status--draft">需要改密</span> : null}
        </div>
        {profile ? (
          <dl className="ui-admin-meta-list" style={metaListStyle}>
            <div>
              <dt>用户名</dt>
              <dd>{profile.username}</dd>
            </div>
            <div>
              <dt>用户类型</dt>
              <dd>{formatUserType(profile.user_type)}</dd>
            </div>
            <div>
              <dt>账号状态</dt>
              <dd>{formatStatusLabel(profile.status)}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="ui-admin-card" aria-label="编辑个人信息" style={sectionStyle}>
        <form onSubmit={(event) => void handleProfileSubmit(event)}>
          <div className="ui-admin-modal__header" style={sectionHeaderStyle}>
            <div>
              <h3>个人信息</h3>
            </div>
          </div>
          <div className="ui-admin-form__grid">
            <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="profile_avatar_file">头像</label>
              {profileForm.avatar_url ? <img src={profileForm.avatar_url} alt="" style={avatarPreviewStyle} /> : null}
              <input
                id="profile_avatar_file"
                type="file"
                accept="image/*"
                onChange={(event) => void handleAvatarFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="profile_display_name">姓名</label>
              <input
                id="profile_display_name"
                value={profileForm.display_name}
                onChange={(event) => setProfileForm((current) => ({ ...current, display_name: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="profile_phone">手机号</label>
              <input
                id="profile_phone"
                value={profileForm.phone ?? ""}
                onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="profile_email">邮箱</label>
              <input
                id="profile_email"
                type="email"
                value={profileForm.email ?? ""}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
          </div>
          <div className="ui-admin-modal__footer" style={footerStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={savingProfile || loading}>
              {savingProfile ? "保存中" : "保存个人信息"}
            </button>
          </div>
        </form>
      </section>

      <section className="ui-admin-card" aria-label="修改密码" style={sectionStyle}>
        <form onSubmit={(event) => void handlePasswordSubmit(event)}>
          <div className="ui-admin-modal__header" style={sectionHeaderStyle}>
            <div>
              <h3>修改密码</h3>
            </div>
          </div>
          <div className="ui-admin-form__grid">
            <div className="ui-admin-form__field">
              <label htmlFor="profile_old_password">当前密码</label>
              <input
                id="profile_old_password"
                type="password"
                value={passwordForm.old_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, old_password: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="profile_new_password">新密码</label>
              <input
                id="profile_new_password"
                type="password"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="profile_confirm_password">确认新密码</label>
              <input
                id="profile_confirm_password"
                type="password"
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
              />
            </div>
          </div>
          <div className="ui-admin-modal__footer" style={footerStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={savingPassword || loading}>
              {savingPassword ? "修改中" : "修改密码"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

function toProfileForm(user: ManagedUser): UserProfileInput {
  return {
    display_name: user.display_name,
    phone: user.phone ?? "",
    email: user.email ?? "",
    avatar_url: user.avatar_url ?? ""
  };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function formatUserType(userType: string): string {
  switch (userType) {
    case "sys_admin":
      return "平台管理员";
    case "tenant_admin":
      return "租户管理员";
    case "school_admin":
      return "学校/组织管理员";
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    case "staff":
      return "职员";
    default:
      return userType || "-";
  }
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "禁用";
    default:
      return status || "-";
  }
}

const pageStyle: CSSProperties = {
  gap: 14,
  minHeight: "100%"
};

const sectionStyle: CSSProperties = {
  padding: 22
};

const sectionHeaderStyle: CSSProperties = {
  padding: 0,
  marginBottom: 18
};

const metaListStyle: CSSProperties = {
  margin: 0
};

const footerStyle: CSSProperties = {
  padding: "18px 0 0"
};

const avatarPreviewStyle: CSSProperties = {
  width: 88,
  height: 88,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid var(--ui-color-border)",
  background: "var(--ui-color-bg-elevated)"
};
