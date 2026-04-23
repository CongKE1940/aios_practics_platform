export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: FetchLike;
  headers?: HeadersInit;
  onUnauthorized?: () => void;
}

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data?: T;
  request_id?: string;
}

export class ApiError extends Error {
  readonly code: number;
  readonly status: number;
  readonly requestId?: string;

  constructor(params: { code: number; message: string; status: number; requestId?: string }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
  }
}

export interface ApiClient {
  get<TData>(path: string, init?: RequestInit): Promise<TData>;
  post<TData, TBody = unknown>(path: string, body?: TBody, init?: RequestInit): Promise<TData>;
  put<TData, TBody = unknown>(path: string, body?: TBody, init?: RequestInit): Promise<TData>;
  login(body: LoginRequest): Promise<LoginResponse>;
  refresh(body: RefreshRequest): Promise<LoginResponse>;
  me(): Promise<CurrentUser>;
  logout(): Promise<boolean>;
  menus(appType: "admin" | "user"): Promise<MenuItem[]>;
  listSchools(query?: SchoolListQuery): Promise<PageResult<School>>;
  createSchool(body: SchoolInput): Promise<School>;
  getSchool(id: number): Promise<School>;
  updateSchool(id: number, body: SchoolInput): Promise<School>;
  disableSchool(id: number): Promise<boolean>;
  listGrades(query?: GradeListQuery): Promise<PageResult<Grade>>;
  createGrade(body: GradeInput): Promise<Grade>;
  getGrade(id: number): Promise<Grade>;
  updateGrade(id: number, body: GradeInput): Promise<Grade>;
  disableGrade(id: number): Promise<boolean>;
  listClasses(query?: ClassListQuery): Promise<PageResult<ClassItem>>;
  createClass(body: ClassInput): Promise<ClassItem>;
  getClass(id: number): Promise<ClassItem>;
  updateClass(id: number, body: ClassInput): Promise<ClassItem>;
  disableClass(id: number): Promise<boolean>;
  listCourses(query?: CourseListQuery): Promise<PageResult<Course>>;
  createCourse(body: CourseInput): Promise<Course>;
  getCourse(id: number): Promise<Course>;
  updateCourse(id: number, body: CourseInput): Promise<Course>;
  disableCourse(id: number): Promise<boolean>;
  listQuestionBanks(query?: QuestionBankListQuery): Promise<PageResult<QuestionBank>>;
  createQuestionBank(body: QuestionBankInput): Promise<QuestionBank>;
  updateQuestionBank(id: number, body: QuestionBankInput): Promise<QuestionBank>;
  publishQuestionBank(id: number): Promise<QuestionBank>;
  assignQuestionBankVisibility(id: number, body: QuestionBankVisibilityInput): Promise<boolean>;
  listQuestions(query?: QuestionListQuery): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
  updateQuestion(id: number, body: QuestionUpdateInput): Promise<Question>;
  listQuestionVersions(id: number): Promise<QuestionVersion[]>;
  createQuestionVersion(id: number, body: QuestionVersionInput): Promise<QuestionVersion>;
  listNotices(query?: NoticeListQuery): Promise<PageResult<Notice>>;
  createNotice(body: NoticeInput): Promise<Notice>;
  getNotice(id: number): Promise<Notice>;
  updateNotice(id: number, body: NoticeInput): Promise<Notice>;
  publishNotice(id: number): Promise<Notice>;
  recallNotice(id: number): Promise<Notice>;
  listNotifications(query?: NotificationListQuery): Promise<PageResult<NotificationItem>>;
  markNotificationRead(id: number): Promise<NotificationItem>;
  uploadFile(body: FormData): Promise<FileAsset>;
  importFileFromUrl(body: FileImportUrlInput): Promise<FileAsset>;
  getFileAsset(id: number): Promise<FileAsset>;
  downloadImportTemplate(type: ImportTemplateType): Promise<string>;
  createImportJob(body: ImportJobInput): Promise<ImportJob>;
  listImportJobs(query?: ImportJobListQuery): Promise<PageResult<ImportJob>>;
  getImportJob(id: number): Promise<ImportJob>;
  listImportJobRows(id: number, query?: ImportJobRowListQuery): Promise<PageResult<ImportJobRow>>;
  createPracticeSession(body: PracticeSessionInput): Promise<PracticeSessionDetail>;
  listPracticeSessions(query?: PracticeSessionListQuery): Promise<PageResult<PracticeSessionListItem>>;
  getPracticeSession(id: number): Promise<PracticeSessionDetail>;
  getPracticeSessionResults(id: number): Promise<PracticeSessionResults>;
  createPracticeSessionFromQuestions(body: PracticeSessionFromQuestionsInput): Promise<PracticeSessionDetail>;
  nextPracticeQuestion(id: number): Promise<NextPracticeQuestionResult>;
  submitPracticeAnswer(id: number, body: PracticeAnswerInput): Promise<PracticeAnswerResult>;
  finishPracticeSession(id: number): Promise<PracticeSessionSummary>;
  markPracticeQuestionMastered(id: number, body: QuestionStateInput): Promise<UserQuestionState>;
  markPracticeQuestionConfused(id: number, body: QuestionStateInput): Promise<UserQuestionState>;
  listUserQuestionStates(query?: UserQuestionStateListQuery): Promise<PageResult<UserQuestionState>>;
  getClassPracticeSummary(query: ClassPracticeSummaryQuery): Promise<ClassPracticeSummaryResult>;
  getStudentPracticeDetail(query: StudentPracticeDetailQuery): Promise<StudentPracticeDetailResult>;
  getStudentPracticeSessionDetail(query: StudentPracticeSessionDetailQuery): Promise<StudentPracticeSessionDetailResult>;
  getStudentPracticeSessionQuestionDetail(
    query: StudentPracticeSessionQuestionDetailQuery
  ): Promise<StudentPracticeSessionQuestionDetailResult>;
  listClassCourseOptions(): Promise<ClassCourseOptionsResult>;
  listRoles(query?: RoleListQuery): Promise<PageResult<RoleItem>>;
  createRole(body: RoleInput): Promise<RoleItem>;
  updateRole(id: number, body: RoleInput): Promise<RoleItem>;
  listPermissions(query?: PermissionListQuery): Promise<PageResult<PermissionItem>>;
  assignRolePermissions(id: number, body: RolePermissionsInput): Promise<RoleItem>;
  listUsers(query?: ManagedUserListQuery): Promise<PageResult<ManagedUser>>;
  createUser(body: ManagedUserInput): Promise<ManagedUser>;
  getUser(id: number): Promise<ManagedUser>;
  updateUser(id: number, body: ManagedUserInput): Promise<ManagedUser>;
  assignUserRoles(id: number, body: UserRolesInput): Promise<ManagedUser>;
  disableUser(id: number): Promise<ManagedUser>;
}

export interface LoginRequest {
  tenant_code: string;
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: CurrentUser;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface CurrentUser {
  id: number;
  tenant_id: number;
  display_name: string;
  user_type: string;
  roles: string[];
  permissions?: string[];
}

export interface MenuItem {
  id: number;
  name: string;
  path: string;
  children: MenuItem[];
}

export interface PageResult<TItem> {
  items: TItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface School {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  status: string;
}

export interface Grade {
  id: number;
  tenant_id: number;
  school_id: number;
  code: string;
  name: string;
  grade_level: number;
  school_year?: string;
  status: string;
}

export interface ClassItem {
  id: number;
  tenant_id: number;
  school_id: number;
  grade_id: number;
  code: string;
  name: string;
  class_no?: number | null;
  status: string;
}

export interface Course {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  start_at?: string | null;
  end_at?: string | null;
  status: string;
  description?: string | null;
}

export interface QuestionBank {
  id: number;
  tenant_id: number;
  owner_org_type: string;
  owner_org_id: number;
  creator_id: number;
  course_id?: number | null;
  name: string;
  description?: string | null;
  status: string;
  source_type: string;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionBankVisibilityGrant {
  grant_type: string;
  target_type: string;
  target_id: number;
  permission_type: string;
  inherit_to_children?: boolean;
}

export interface Question {
  id: number;
  tenant_id: number;
  owner_org_type: string;
  owner_org_id: number;
  question_type: string;
  difficulty?: string | null;
  current_version_id?: number | null;
  current_version_no?: number | null;
  status: string;
  source_type: string;
  creator_id: number;
  bank_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface QuestionAsset {
  url: string;
  type: string;
}

export interface QuestionContentBlock {
  content_type: string;
  text?: string | null;
  assets?: QuestionAsset[];
}

export interface QuestionOption extends QuestionContentBlock {
  key: string;
}

export interface QuestionContentInput {
  stem: QuestionContentBlock;
  options?: QuestionOption[];
  option_order_randomizable?: boolean;
  ext?: Record<string, unknown>;
}

export interface QuestionAnswerInput {
  judge_mode: string;
  correct_keys?: string[];
  correct_value?: boolean;
  [key: string]: unknown;
}

export interface QuestionVersion {
  id: number;
  question_id: number;
  version_no: number;
  content: QuestionContentInput | Record<string, unknown>;
  answer: QuestionAnswerInput | Record<string, unknown>;
  analysis?: Record<string, unknown>;
  structure_hash: string;
  change_summary?: string | null;
  is_published?: boolean;
  created_by: number;
  created_at?: string;
}

export interface Notice {
  id: number;
  tenant_id: number;
  title: string;
  content: string;
  notice_type: string;
  publisher_id: number;
  publish_scope_type: string;
  publish_scope: Record<string, unknown>;
  publish_at: string;
  expire_at?: string | null;
  status: string;
}

export interface NotificationItem {
  id: number;
  tenant_id: number;
  recipient_user_id: number;
  category: string;
  title: string;
  content: string;
  source_type?: string | null;
  source_id?: number | null;
  read_at?: string | null;
  status: string;
}

export interface FileAsset {
  id: number;
  tenant_id?: number;
  uploader_id?: number;
  source_type: string;
  original_url?: string | null;
  original_filename?: string | null;
  object_key: string;
  url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  checksum?: string | null;
  status: string;
}

export type ImportTemplateType = "question" | "question_bank" | "exam";
export type ImportJobType = "question" | "question_bank";

export interface ImportJob {
  id: number;
  tenant_id: number;
  import_type: ImportJobType | string;
  template_version: string;
  file_asset_id?: number | null;
  file_url: string;
  status: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  error_summary?: string | null;
  operator_id: number;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string;
}

export interface ImportJobRow {
  id: number;
  job_id: number;
  row_no: number;
  raw_data: Record<string, unknown>;
  normalized_data?: Record<string, unknown>;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
  target_entity_type?: string | null;
  target_entity_id?: number | null;
  created_at?: string;
}

export interface PracticeSessionQuestion {
  session_question_id: number;
  session_id: number;
  question_id: number;
  question_version_id: number;
  display_order: number;
  question_type: string;
  content: QuestionContentInput | Record<string, unknown>;
  analysis?: Record<string, unknown>;
  round_no: number;
  answered?: boolean;
  is_correct?: boolean | null;
}

export interface PracticeSessionListQuery {
  status?: string;
  flow_mode?: string;
  practice_mode?: string;
  course_id?: number;
  page?: number;
  page_size?: number;
}

export interface PracticeSessionListItem {
  id: number;
  practice_mode: string;
  source_mode: string;
  flow_mode: string;
  course_id?: number | null;
  bank_ids: number[];
  status: string;
  started_at?: string;
  ended_at?: string | null;
  total_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
}

export interface PracticeSessionDetail {
  id: number;
  tenant_id: number;
  user_id: number;
  practice_mode: string;
  source_mode: string;
  flow_mode: string;
  course_id?: number | null;
  bank_scope: Record<string, unknown>;
  bank_ids: number[];
  exclude_mastered: boolean;
  question_count?: number;
  random_seed: number;
  round_no: number;
  status: string;
  questions: PracticeSessionQuestion[];
}

export interface PracticeSessionResults {
  session: PracticeSessionListItem;
  questions: PracticeSessionResultQuestion[];
}

export interface PracticeSessionResultQuestion {
  session_question_id: number;
  question_id: number;
  question_version_id: number;
  display_order: number;
  question_type: string;
  content: QuestionContentInput | Record<string, unknown>;
  answer?: Record<string, unknown>;
  correct_answer: Record<string, unknown>;
  is_correct: boolean;
  analysis?: Record<string, unknown>;
  state: UserQuestionState;
}

export interface NextPracticeQuestionResult {
  question: PracticeSessionQuestion;
  round_no: number;
}

export interface PracticeAnswerResult {
  is_correct: boolean;
  correct_answer: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  state: UserQuestionState;
}

export interface PracticeSessionSummary {
  id: number;
  status: string;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
}

export interface UserQuestionState {
  id: number;
  tenant_id: number;
  user_id: number;
  question_id: number;
  question_version_id: number;
  question_type?: string;
  content?: QuestionContentInput | Record<string, unknown>;
  practice_correct_count: number;
  practice_wrong_count: number;
  exam_wrong_count: number;
  is_mastered: boolean;
  is_confused: boolean;
  mastered_at?: string | null;
  confused_at?: string | null;
  last_wrong_at?: string | null;
  last_answer?: Record<string, unknown>;
  last_result?: string | null;
  updated_at?: string;
}

export interface ClassPracticeSummary {
  class_id: number;
  class_name: string;
  course_id: number;
  course_name: string;
  student_count: number;
  participated_student_count: number;
  session_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
  wrong_question_count: number;
  confused_question_count: number;
  last_practiced_at?: string | null;
}

export type StudentPracticeDetailTab = "sessions" | "wrong" | "confused";

export interface StudentPracticeSummary {
  student_user_id: number;
  student_name: string;
  student_no?: string | null;
  class_id: number;
  class_name: string;
  course_id: number;
  course_name: string;
  session_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
  wrong_question_count: number;
  confused_question_count: number;
  last_practiced_at?: string | null;
}

export interface StudentPracticeSessionItem {
  session_id: number;
  started_at?: string | null;
  finished_at?: string | null;
  status: string;
  total_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
}

export interface StudentPracticeQuestionItem {
  question_id: number;
  question_version_id: number;
  question_type: string;
  stem: string;
  practice_wrong_count: number;
  last_wrong_at?: string | null;
  is_confused: boolean;
  confused_at?: string | null;
  last_result: string;
  last_session_id?: number | null;
  last_session_question_id?: number | null;
}

export interface StudentPracticeDetailResult {
  student_summary: StudentPracticeSummary;
  active_tab: StudentPracticeDetailTab;
  sessions: PageResult<StudentPracticeSessionItem>;
  wrong_questions: PageResult<StudentPracticeQuestionItem>;
  confused_questions: PageResult<StudentPracticeQuestionItem>;
}

export interface StudentPracticeSessionDetailQuery {
  class_id: number;
  course_id: number;
  student_user_id: number;
  session_id: number;
}

export interface StudentPracticeSessionStudentSummary {
  student_user_id: number;
  student_name: string;
  student_no?: string | null;
  class_id: number;
  class_name: string;
  course_id: number;
  course_name: string;
}

export interface StudentPracticeSessionSummary {
  session_id: number;
  started_at?: string | null;
  finished_at?: string | null;
  status: string;
  practice_mode: string;
  source_mode: string;
  flow_mode: string;
  total_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
}

export interface StudentPracticeSessionQuestionItem {
  session_question_id: number;
  question_id: number;
  question_version_id: number;
  display_order: number;
  question_type: string;
  content: Record<string, unknown>;
  student_answer?: Record<string, unknown>;
  correct_answer?: Record<string, unknown>;
  is_answered: boolean;
  is_correct?: boolean | null;
  answered_at?: string | null;
  analysis?: Record<string, unknown>;
}

export interface StudentPracticeSessionDetailResult {
  student_summary: StudentPracticeSessionStudentSummary;
  session: StudentPracticeSessionSummary;
  questions: StudentPracticeSessionQuestionItem[];
}

export interface StudentPracticeSessionQuestionDetailQuery {
  class_id: number;
  course_id: number;
  student_user_id: number;
  session_id: number;
  session_question_id: number;
}

export interface StudentPracticeSessionQuestionDetailResult {
  student_summary: StudentPracticeSessionStudentSummary;
  session: StudentPracticeSessionSummary;
  question_detail: StudentPracticeSessionQuestionItem;
}

export interface ClassPracticeStudentItem {
  student_id: number;
  student_name: string;
  student_no?: string | null;
  session_count: number;
  answered_count: number;
  correct_count: number;
  wrong_count: number;
  accuracy: number;
  wrong_question_count: number;
  confused_question_count: number;
  last_practiced_at?: string | null;
}

export interface ClassPracticeSummaryResult {
  summary: ClassPracticeSummary;
  students: PageResult<ClassPracticeStudentItem>;
}

export interface CourseOptionItem {
  course_id: number;
  course_name: string;
}

export interface ClassCourseOption {
  class_id: number;
  class_name: string;
  courses: CourseOptionItem[];
}

export interface ClassCourseOptionsResult {
  items: ClassCourseOption[];
}

export interface RoleItem {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  role_type: string;
  data_scope_type: string;
  status: string;
  remark?: string | null;
  permission_ids?: number[];
}

export interface PermissionItem {
  id: number;
  code: string;
  module: string;
  action_name: string;
  resource_type?: string | null;
  name: string;
  description?: string | null;
}

export interface ManagedUser {
  id: number;
  tenant_id: number;
  username: string;
  phone?: string | null;
  email?: string | null;
  display_name: string;
  user_type: string;
  status: string;
  role_ids?: number[];
}

export interface SchoolInput {
  code: string;
  name: string;
}

export interface GradeInput {
  school_id: number;
  code: string;
  name: string;
  grade_level: number;
  school_year?: string;
}

export interface ClassInput {
  school_id: number;
  grade_id: number;
  code: string;
  name: string;
  class_no?: number | null;
}

export interface CourseInput {
  code: string;
  name: string;
  start_at?: string | null;
  end_at?: string | null;
  description?: string | null;
}

export interface QuestionBankInput {
  name: string;
  course_id?: number | null;
  description?: string | null;
}

export interface QuestionBankVisibilityInput {
  grants: QuestionBankVisibilityGrant[];
}

export interface QuestionInput {
  question_type: string;
  difficulty?: string | null;
  content: QuestionContentInput | Record<string, unknown>;
  answer: QuestionAnswerInput | Record<string, unknown>;
  analysis?: Record<string, unknown>;
  bank_ids?: number[];
}

export interface QuestionUpdateInput {
  difficulty?: string | null;
  status?: string;
}

export interface QuestionVersionInput {
  content: QuestionContentInput | Record<string, unknown>;
  answer: QuestionAnswerInput | Record<string, unknown>;
  analysis?: Record<string, unknown>;
  change_summary?: string | null;
}

export interface NoticeInput {
  title: string;
  content: string;
  notice_type: string;
  publish_scope_type: string;
  publish_scope: Record<string, unknown>;
  publish_at: string;
  expire_at?: string | null;
}

export interface FileImportUrlInput {
  url: string;
  usage: string;
}

export interface ImportJobInput {
  import_type: ImportJobType | string;
  template_version?: string;
  file_asset_id?: number | null;
  file_url: string;
  content: string;
}

export interface PracticeSessionInput {
  practice_mode?: string;
  source_mode?: string;
  flow_mode?: string;
  course_id?: number | null;
  bank_ids: number[];
  exclude_mastered?: boolean;
  question_count?: number;
  random_seed?: number;
}

export interface PracticeSessionFromQuestionsInput {
  question_ids: number[];
  practice_mode?: string;
  flow_mode?: string;
  question_count?: number;
  exclude_mastered?: boolean;
  random_seed?: number;
}

export interface PracticeAnswerInput {
  session_question_id: number;
  answer: Record<string, unknown>;
}

export interface QuestionStateInput {
  value: boolean;
}

export interface RoleInput {
  code: string;
  name: string;
  role_type: string;
  data_scope_type: string;
  remark?: string | null;
}

export interface RolePermissionsInput {
  permission_ids: number[];
}

export interface ManagedUserInput {
  username: string;
  display_name: string;
  user_type: string;
  phone?: string | null;
  email?: string | null;
  password?: string | null;
  role_ids?: number[];
}

export interface UserRolesInput {
  role_ids: number[];
}

export interface SchoolListQuery {
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface GradeListQuery {
  school_id?: number;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface ClassListQuery {
  school_id?: number;
  grade_id?: number;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface CourseListQuery {
  status?: string;
  keyword?: string;
  active_at?: string;
  page?: number;
  page_size?: number;
}

export interface QuestionBankListQuery {
  course_id?: number;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface QuestionListQuery {
  question_type?: string;
  course_id?: number;
  bank_id?: number;
  status?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface NoticeListQuery {
  status?: string;
  notice_type?: string;
  page?: number;
  page_size?: number;
}

export interface NotificationListQuery {
  status?: string;
  category?: string;
  page?: number;
  page_size?: number;
}

export interface RoleListQuery {
  status?: string;
  page?: number;
  page_size?: number;
}

export interface PermissionListQuery {
  module?: string;
  page?: number;
  page_size?: number;
}

export interface ManagedUserListQuery {
  user_type?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

export interface ImportJobListQuery {
  import_type?: ImportJobType | string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface ImportJobRowListQuery {
  status?: string;
  page?: number;
  page_size?: number;
}

export interface UserQuestionStateListQuery {
  state_type?: string;
  bank_id?: number;
  course_id?: number;
  page?: number;
  page_size?: number;
}

export interface ClassPracticeSummaryQuery {
  class_id: number;
  course_id: number;
  start_at?: string;
  end_at?: string;
  page?: number;
  page_size?: number;
}

export interface StudentPracticeDetailQuery {
  class_id: number;
  course_id: number;
  student_user_id: number;
  tab?: StudentPracticeDetailTab;
  start_at?: string;
  end_at?: string;
  page?: number;
  page_size?: number;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) {
    throw new Error("fetch is not available");
  }

  return {
    get: (path, init) => request(fetcher, options, path, { ...init, method: "GET" }),
    post: (path, body, init) =>
      request(fetcher, options, path, {
        ...init,
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
    put: (path, body, init) =>
      request(fetcher, options, path, {
        ...init,
        method: "PUT",
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
    login: (body) =>
      request(fetcher, options, "/auth/login", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    refresh: (body) =>
      request(fetcher, options, "/auth/refresh", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    me: () =>
      request(fetcher, options, "/auth/me", {
        method: "GET"
      }),
    logout: () =>
      request(fetcher, options, "/auth/logout", {
        method: "POST"
      }),
    menus: (appType) =>
      request(fetcher, options, `/menus?app_type=${appType}`, {
        method: "GET"
      }),
    listSchools: (query) => request(fetcher, options, buildPath("/schools", query), { method: "GET" }),
    createSchool: (body) => request(fetcher, options, "/schools", { method: "POST", body: JSON.stringify(body) }),
    getSchool: (id) => request(fetcher, options, `/schools/${id}`, { method: "GET" }),
    updateSchool: (id, body) =>
      request(fetcher, options, `/schools/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    disableSchool: (id) => request(fetcher, options, `/schools/${id}/disable`, { method: "POST" }),
    listGrades: (query) => request(fetcher, options, buildPath("/grades", query), { method: "GET" }),
    createGrade: (body) => request(fetcher, options, "/grades", { method: "POST", body: JSON.stringify(body) }),
    getGrade: (id) => request(fetcher, options, `/grades/${id}`, { method: "GET" }),
    updateGrade: (id, body) =>
      request(fetcher, options, `/grades/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    disableGrade: (id) => request(fetcher, options, `/grades/${id}/disable`, { method: "POST" }),
    listClasses: (query) => request(fetcher, options, buildPath("/classes", query), { method: "GET" }),
    createClass: (body) => request(fetcher, options, "/classes", { method: "POST", body: JSON.stringify(body) }),
    getClass: (id) => request(fetcher, options, `/classes/${id}`, { method: "GET" }),
    updateClass: (id, body) =>
      request(fetcher, options, `/classes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    disableClass: (id) => request(fetcher, options, `/classes/${id}/disable`, { method: "POST" }),
    listCourses: (query) => request(fetcher, options, buildPath("/courses", query), { method: "GET" }),
    createCourse: (body) => request(fetcher, options, "/courses", { method: "POST", body: JSON.stringify(body) }),
    getCourse: (id) => request(fetcher, options, `/courses/${id}`, { method: "GET" }),
    updateCourse: (id, body) =>
      request(fetcher, options, `/courses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    disableCourse: (id) => request(fetcher, options, `/courses/${id}/disable`, { method: "POST" }),
    listQuestionBanks: (query) =>
      request(fetcher, options, buildPath("/question-banks", query), { method: "GET" }),
    createQuestionBank: (body) =>
      request(fetcher, options, "/question-banks", { method: "POST", body: JSON.stringify(body) }),
    updateQuestionBank: (id, body) =>
      request(fetcher, options, `/question-banks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    publishQuestionBank: (id) =>
      request(fetcher, options, `/question-banks/${id}/publish`, { method: "POST" }),
    assignQuestionBankVisibility: (id, body) =>
      request(fetcher, options, `/question-banks/${id}/visibility`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    listQuestions: (query) => request(fetcher, options, buildPath("/questions", query), { method: "GET" }),
    createQuestion: (body) => request(fetcher, options, "/questions", { method: "POST", body: JSON.stringify(body) }),
    updateQuestion: (id, body) =>
      request(fetcher, options, `/questions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    listQuestionVersions: (id) => request(fetcher, options, `/questions/${id}/versions`, { method: "GET" }),
    createQuestionVersion: (id, body) =>
      request(fetcher, options, `/questions/${id}/versions`, { method: "POST", body: JSON.stringify(body) }),
    listNotices: (query) => request(fetcher, options, buildPath("/notices", query), { method: "GET" }),
    createNotice: (body) => request(fetcher, options, "/notices", { method: "POST", body: JSON.stringify(body) }),
    getNotice: (id) => request(fetcher, options, `/notices/${id}`, { method: "GET" }),
    updateNotice: (id, body) =>
      request(fetcher, options, `/notices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    publishNotice: (id) => request(fetcher, options, `/notices/${id}/publish`, { method: "POST" }),
    recallNotice: (id) => request(fetcher, options, `/notices/${id}/recall`, { method: "POST" }),
    listNotifications: (query) =>
      request(fetcher, options, buildPath("/notifications", query), { method: "GET" }),
    markNotificationRead: (id) =>
      request(fetcher, options, `/notifications/${id}/read`, { method: "POST" }),
    uploadFile: (body) => request(fetcher, options, "/files/upload", { method: "POST", body }),
    importFileFromUrl: (body) =>
      request(fetcher, options, "/files/import-url", { method: "POST", body: JSON.stringify(body) }),
    getFileAsset: (id) => request(fetcher, options, `/files/${id}`, { method: "GET" }),
    downloadImportTemplate: (type) =>
      rawTextRequest(fetcher, options, `/import/templates/${type}`, { method: "GET" }),
    createImportJob: (body) => request(fetcher, options, "/import/jobs", { method: "POST", body: JSON.stringify(body) }),
    listImportJobs: (query) => request(fetcher, options, buildPath("/import/jobs", query), { method: "GET" }),
    getImportJob: (id) => request(fetcher, options, `/import/jobs/${id}`, { method: "GET" }),
    listImportJobRows: (id, query) =>
      request(fetcher, options, buildPath(`/import/jobs/${id}/rows`, query), { method: "GET" }),
    createPracticeSession: (body) =>
      request(fetcher, options, "/practice/sessions", { method: "POST", body: JSON.stringify(body) }),
    listPracticeSessions: (query) =>
      request(fetcher, options, buildPath("/practice/sessions", query), { method: "GET" }),
    getPracticeSession: (id) => request(fetcher, options, `/practice/sessions/${id}`, { method: "GET" }),
    getPracticeSessionResults: (id) =>
      request(fetcher, options, `/practice/sessions/${id}/results`, { method: "GET" }),
    createPracticeSessionFromQuestions: (body) =>
      request(fetcher, options, "/practice/sessions/from-questions", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    nextPracticeQuestion: (id) =>
      request(fetcher, options, `/practice/sessions/${id}/next-question`, { method: "POST" }),
    submitPracticeAnswer: (id, body) =>
      request(fetcher, options, `/practice/sessions/${id}/answer`, { method: "POST", body: JSON.stringify(body) }),
    finishPracticeSession: (id) =>
      request(fetcher, options, `/practice/sessions/${id}/finish`, { method: "POST" }),
    markPracticeQuestionMastered: (id, body) =>
      request(fetcher, options, `/practice/questions/${id}/mark-mastered`, { method: "POST", body: JSON.stringify(body) }),
    markPracticeQuestionConfused: (id, body) =>
      request(fetcher, options, `/practice/questions/${id}/mark-confused`, { method: "POST", body: JSON.stringify(body) }),
    listUserQuestionStates: (query) =>
      request(fetcher, options, buildPath("/user-question-states", query), { method: "GET" }),
    getClassPracticeSummary: (query) =>
      request(fetcher, options, buildPath("/analytics/class-practice-summary", query), { method: "GET" }),
    getStudentPracticeDetail: (query) =>
      request(fetcher, options, buildPath("/analytics/student-practice-detail", query), { method: "GET" }),
    getStudentPracticeSessionDetail: (query) =>
      request(fetcher, options, buildPath("/analytics/student-practice-session-detail", query), { method: "GET" }),
    getStudentPracticeSessionQuestionDetail: (query) =>
      request(fetcher, options, buildPath("/analytics/student-practice-session-question-detail", query), {
        method: "GET"
      }),
    listClassCourseOptions: () =>
      request(fetcher, options, "/analytics/class-course-options", { method: "GET" }),
    listRoles: (query) => request(fetcher, options, buildPath("/roles", query), { method: "GET" }),
    createRole: (body) => request(fetcher, options, "/roles", { method: "POST", body: JSON.stringify(body) }),
    updateRole: (id, body) =>
      request(fetcher, options, `/roles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    listPermissions: (query) =>
      request(fetcher, options, buildPath("/permissions", query), { method: "GET" }),
    assignRolePermissions: (id, body) =>
      request(fetcher, options, `/roles/${id}/permissions`, { method: "PUT", body: JSON.stringify(body) }),
    listUsers: (query) => request(fetcher, options, buildPath("/users", query), { method: "GET" }),
    createUser: (body) => request(fetcher, options, "/users", { method: "POST", body: JSON.stringify(body) }),
    getUser: (id) => request(fetcher, options, `/users/${id}`, { method: "GET" }),
    updateUser: (id, body) =>
      request(fetcher, options, `/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    assignUserRoles: (id, body) =>
      request(fetcher, options, `/users/${id}/roles`, { method: "PUT", body: JSON.stringify(body) }),
    disableUser: (id) => request(fetcher, options, `/users/${id}/disable`, { method: "POST" })
  };
}

async function request<TData>(
  fetcher: FetchLike,
  options: ApiClientOptions,
  path: string,
  init: RequestInit
): Promise<TData> {
  const headers = new Headers(options.headers);
  mergeHeaders(headers, init.headers);
  headers.set("Accept", "application/json");

  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }
  if (init.body !== undefined && !headers.has("Content-Type") && !isFormData(init.body)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetcher(joinUrl(options.baseUrl, path), {
    ...init,
    headers
  });

  const text = await response.text();
  const envelope = parseApiEnvelope<TData>(text);
  if (!response.ok || envelope?.code !== 0) {
    if (response.status === 401) {
      options.onUnauthorized?.();
    }
    throw new ApiError({
      code: envelope?.code || response.status,
      message: envelope?.message || text || getDefaultErrorMessage(response.status, response.statusText),
      status: response.status,
      requestId: envelope?.request_id
    });
  }

  return envelope.data as TData;
}

async function rawTextRequest(
  fetcher: FetchLike,
  options: ApiClientOptions,
  path: string,
  init: RequestInit
): Promise<string> {
  const headers = new Headers(options.headers);
  mergeHeaders(headers, init.headers);
  headers.set("Accept", "text/csv, text/plain, */*");

  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  const response = await fetcher(joinUrl(options.baseUrl, path), {
    ...init,
    headers
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401) {
      options.onUnauthorized?.();
    }
    throw new ApiError({
      code: response.status,
      message: text || getDefaultErrorMessage(response.status, response.statusText),
      status: response.status
    });
  }
  return text;
}

function mergeHeaders(target: Headers, source?: HeadersInit): void {
  if (!source) {
    return;
  }

  new Headers(source).forEach((value, key) => {
    target.set(key, value);
  });
}

function parseApiEnvelope<TData>(text: string): ApiEnvelope<TData> | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ApiEnvelope<TData>;
  } catch {
    return null;
  }
}

function getDefaultErrorMessage(status: number, statusText: string): string {
  if (statusText) {
    return statusText;
  }
  if (status === 401) {
    return "Unauthorized";
  }
  return `Request failed with status ${status}`;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildPath(path: string, query?: object): string {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  Object.entries(query as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    params.set(key, String(value));
  });

  const queryString = params.toString();
  if (!queryString) {
    return path;
  }
  return `${path}?${queryString}`;
}

function isFormData(body: RequestInit["body"]): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}
