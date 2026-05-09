import type { ChangeInitialPasswordRequest, LoginOrganization, LoginRequest, LoginResponse, MenuItem } from "@aios/api-sdk";

export interface UserSessionState {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  savedAt?: number;
  menus: MenuItem[];
  user: LoginResponse["user"];
}

export interface UserSessionStore {
  load(): UserSessionState | null;
  save(session: UserSessionState): void;
  clear(): void;
}

export interface UserAuthApi {
  listLoginOrganizations(): Promise<LoginOrganization[]>;
  login(body: LoginRequest): Promise<LoginResponse>;
  changeInitialPassword?(body: ChangeInitialPasswordRequest): Promise<boolean>;
  logout(accessToken: string): Promise<boolean>;
  menus(accessToken: string): Promise<MenuItem[]>;
}
