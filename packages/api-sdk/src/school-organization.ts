import type { ApiClient, FileAsset, PageResult, School } from "./client";

export const SchoolObjectTypeSchool = 1;
export const SchoolObjectTypeOrganization = 2;
export type SchoolObjectType = typeof SchoolObjectTypeSchool | typeof SchoolObjectTypeOrganization;

export interface SchoolOrganization extends School {
  object_type?: SchoolObjectType | number;
  object_type_label?: string;
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
  object_type?: SchoolObjectType | number | string;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface SchoolOrganizationBatchDeleteInput {
  ids: number[];
  cascade_delete?: boolean;
}

export interface SchoolOrganizationApi {
  listSchools(query?: SchoolOrganizationListQuery): Promise<PageResult<SchoolOrganization>>;
  createSchool(body: SchoolOrganizationInput): Promise<SchoolOrganization>;
  getSchool?(id: number): Promise<SchoolOrganization>;
  updateSchool?(id: number, body: SchoolOrganizationInput): Promise<SchoolOrganization>;
  disableSchool(id: number): Promise<boolean>;
  enableSchool?(id: number): Promise<boolean>;
  deleteSchool?(id: number): Promise<boolean>;
  batchDeleteSchools?(body: SchoolOrganizationBatchDeleteInput): Promise<boolean>;
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

export async function deleteSchoolOrganization(
  api: SchoolOrganizationActionApi,
  id: number,
  options: { cascade_delete?: boolean } = {}
): Promise<boolean> {
  if ("deleteSchool" in api && api.deleteSchool && !options.cascade_delete) {
    return api.deleteSchool(id);
  }
  const post = getPostMethod(api);
  return post ? post<boolean>(`/schools/${id}/delete`, { ids: [id], cascade_delete: Boolean(options.cascade_delete) }) : false;
}

export async function batchDeleteSchoolOrganizations(
  api: SchoolOrganizationActionApi,
  body: SchoolOrganizationBatchDeleteInput
): Promise<boolean> {
  if (body.ids.length === 0) {
    return true;
  }
  if ("batchDeleteSchools" in api && api.batchDeleteSchools) {
    return api.batchDeleteSchools(body);
  }
  const post = getPostMethod(api);
  if (post) {
    return post<boolean>("/schools/batch-delete", body);
  }
  for (const id of body.ids) {
    await deleteSchoolOrganization(api, id, { cascade_delete: body.cascade_delete });
  }
  return true;
}

function getPostMethod(api: SchoolOrganizationActionApi): ApiClient["post"] | undefined {
  return typeof api.post === "function" ? api.post.bind(api) : undefined;
}
