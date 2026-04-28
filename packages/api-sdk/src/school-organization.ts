import type { ApiClient, FileAsset, PageResult, School } from "./client";

export type SchoolObjectType = "school" | "organization";

export interface SchoolOrganization extends School {
  object_type: SchoolObjectType | string;
  english_name?: string | null;
  address?: string | null;
  logo_url?: string | null;
}

export interface SchoolOrganizationInput {
  object_type?: SchoolObjectType;
  name: string;
  english_name?: string;
  address?: string;
  logo_url?: string;
}

export interface SchoolOrganizationListQuery {
  object_type?: SchoolObjectType | string;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface SchoolOrganizationApi {
  listSchools(query?: SchoolOrganizationListQuery): Promise<PageResult<SchoolOrganization>>;
  createSchool(body: SchoolOrganizationInput): Promise<SchoolOrganization>;
  getSchool?(id: number): Promise<SchoolOrganization>;
  updateSchool?(id: number, body: SchoolOrganizationInput): Promise<SchoolOrganization>;
  disableSchool(id: number): Promise<boolean>;
  enableSchool?(id: number): Promise<boolean>;
  deleteSchool?(id: number): Promise<boolean>;
  uploadFile?(body: FormData): Promise<FileAsset>;
  post?<TData, TBody = unknown>(path: string, body?: TBody): Promise<TData>;
}

type SchoolOrganizationActionApi = Pick<ApiClient, "post"> | SchoolOrganizationApi;

export async function enableSchoolOrganization(api: SchoolOrganizationActionApi, id: number): Promise<boolean> {
  if ("enableSchool" in api && api.enableSchool) {
    return api.enableSchool(id);
  }
  const post = getPostMethod(api);
  return post ? post<boolean>(`/schools/${id}/enable`) : false;
}

export async function deleteSchoolOrganization(api: SchoolOrganizationActionApi, id: number): Promise<boolean> {
  if ("deleteSchool" in api && api.deleteSchool) {
    return api.deleteSchool(id);
  }
  const post = getPostMethod(api);
  return post ? post<boolean>(`/schools/${id}/delete`) : false;
}

function getPostMethod(api: SchoolOrganizationActionApi): ApiClient["post"] | undefined {
  return typeof api.post === "function" ? api.post.bind(api) : undefined;
}
