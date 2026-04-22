import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  ClassInput,
  ClassItem,
  Course,
  CourseInput,
  Grade,
  GradeInput,
  PageResult,
  School,
  SchoolInput
} from "@aios/api-sdk";

export interface OrganizationApi {
  listSchools(): Promise<PageResult<School>>;
  createSchool(body: SchoolInput): Promise<School>;
  disableSchool(id: number): Promise<boolean>;
  listGrades(): Promise<PageResult<Grade>>;
  createGrade(body: GradeInput): Promise<Grade>;
  disableGrade(id: number): Promise<boolean>;
  listClasses(): Promise<PageResult<ClassItem>>;
  createClass(body: ClassInput): Promise<ClassItem>;
  disableClass(id: number): Promise<boolean>;
  listCourses(): Promise<PageResult<Course>>;
  createCourse(body: CourseInput): Promise<Course>;
  disableCourse(id: number): Promise<boolean>;
}

const defaultSchoolForm: SchoolInput = {
  code: "",
  name: ""
};

const defaultGradeForm = {
  school_id: "",
  code: "",
  name: "",
  grade_level: "",
  school_year: ""
};

const defaultClassForm = {
  school_id: "",
  grade_id: "",
  code: "",
  name: "",
  class_no: ""
};

const defaultCourseForm = {
  code: "",
  name: "",
  start_at: "",
  end_at: "",
  description: ""
};

export function OrganizationPanel({ api }: { api: OrganizationApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [schoolForm, setSchoolForm] = useState(defaultSchoolForm);
  const [gradeForm, setGradeForm] = useState(defaultGradeForm);
  const [classForm, setClassForm] = useState(defaultClassForm);
  const [courseForm, setCourseForm] = useState(defaultCourseForm);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [schoolResult, gradeResult, classResult, courseResult] = await Promise.all([
        api.listSchools(),
        api.listGrades(),
        api.listClasses(),
        api.listCourses()
      ]);
      setSchools(schoolResult.items);
      setGrades(gradeResult.items);
      setClasses(classResult.items);
      setCourses(courseResult.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载组织数据失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  const schoolOptions = useMemo(
    () =>
      schools.map((school) => ({
        value: school.id,
        label: school.name
      })),
    [schools]
  );

  const gradeOptions = useMemo(
    () =>
      grades.map((grade) => ({
        value: grade.id,
        label: grade.name
      })),
    [grades]
  );

  async function handleSchoolSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createSchool(schoolForm);
    setSchoolForm(defaultSchoolForm);
    await loadAll();
  }

  async function handleGradeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createGrade({
      school_id: Number(gradeForm.school_id),
      code: gradeForm.code,
      name: gradeForm.name,
      grade_level: Number(gradeForm.grade_level),
      school_year: gradeForm.school_year || undefined
    });
    setGradeForm(defaultGradeForm);
    await loadAll();
  }

  async function handleClassSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createClass({
      school_id: Number(classForm.school_id),
      grade_id: Number(classForm.grade_id),
      code: classForm.code,
      name: classForm.name,
      class_no: classForm.class_no ? Number(classForm.class_no) : undefined
    });
    setClassForm(defaultClassForm);
    await loadAll();
  }

  async function handleCourseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createCourse({
      code: courseForm.code,
      name: courseForm.name,
      start_at: normalizeDateTimeValue(courseForm.start_at),
      end_at: normalizeDateTimeValue(courseForm.end_at),
      description: courseForm.description || undefined
    });
    setCourseForm(defaultCourseForm);
    await loadAll();
  }

  async function handleDisableSchool(id: number) {
    await api.disableSchool(id);
    await loadAll();
  }

  async function handleDisableGrade(id: number) {
    await api.disableGrade(id);
    await loadAll();
  }

  async function handleDisableClass(id: number) {
    await api.disableClass(id);
    await loadAll();
  }

  async function handleDisableCourse(id: number) {
    await api.disableCourse(id);
    await loadAll();
  }

  return (
    <section aria-label="组织管理面板">
      <h2>组织管理</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <section aria-label="学校管理">
        <h3>学校</h3>
        <form onSubmit={(event) => void handleSchoolSubmit(event)}>
          <label htmlFor="school_code">学校编码</label>
          <input
            id="school_code"
            value={schoolForm.code}
            onChange={(event) => setSchoolForm((current) => ({ ...current, code: event.target.value }))}
          />
          <label htmlFor="school_name">学校名称</label>
          <input
            id="school_name"
            value={schoolForm.name}
            onChange={(event) => setSchoolForm((current) => ({ ...current, name: event.target.value }))}
          />
          <button type="submit">新增学校</button>
        </form>
        <ul>
          {schools.map((school) => (
            <li key={school.id}>
              <span>{school.name}</span>
              <span>{school.status}</span>
              <button type="button" onClick={() => void handleDisableSchool(school.id)}>
                禁用学校
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="年级管理">
        <h3>年级</h3>
        <form onSubmit={(event) => void handleGradeSubmit(event)}>
          <label htmlFor="grade_school_id">所属学校</label>
          <select
            id="grade_school_id"
            value={gradeForm.school_id}
            onChange={(event) => setGradeForm((current) => ({ ...current, school_id: event.target.value }))}
          >
            <option value="">请选择学校</option>
            {schoolOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="grade_code">年级编码</label>
          <input
            id="grade_code"
            value={gradeForm.code}
            onChange={(event) => setGradeForm((current) => ({ ...current, code: event.target.value }))}
          />
          <label htmlFor="grade_name">年级名称</label>
          <input
            id="grade_name"
            value={gradeForm.name}
            onChange={(event) => setGradeForm((current) => ({ ...current, name: event.target.value }))}
          />
          <label htmlFor="grade_level">年级序号</label>
          <input
            id="grade_level"
            type="number"
            value={gradeForm.grade_level}
            onChange={(event) => setGradeForm((current) => ({ ...current, grade_level: event.target.value }))}
          />
          <label htmlFor="school_year">学年</label>
          <input
            id="school_year"
            value={gradeForm.school_year}
            onChange={(event) => setGradeForm((current) => ({ ...current, school_year: event.target.value }))}
          />
          <button type="submit">新增年级</button>
        </form>
        <ul>
          {grades.map((grade) => (
            <li key={grade.id}>
              <span>{grade.name}</span>
              <span>{grade.status}</span>
              <button type="button" onClick={() => void handleDisableGrade(grade.id)}>
                禁用年级
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="班级管理">
        <h3>班级</h3>
        <form onSubmit={(event) => void handleClassSubmit(event)}>
          <label htmlFor="class_school_id">所属学校</label>
          <select
            id="class_school_id"
            value={classForm.school_id}
            onChange={(event) => setClassForm((current) => ({ ...current, school_id: event.target.value }))}
          >
            <option value="">请选择学校</option>
            {schoolOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="class_grade_id">所属年级</label>
          <select
            id="class_grade_id"
            value={classForm.grade_id}
            onChange={(event) => setClassForm((current) => ({ ...current, grade_id: event.target.value }))}
          >
            <option value="">请选择年级</option>
            {gradeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="class_code">班级编码</label>
          <input
            id="class_code"
            value={classForm.code}
            onChange={(event) => setClassForm((current) => ({ ...current, code: event.target.value }))}
          />
          <label htmlFor="class_name">班级名称</label>
          <input
            id="class_name"
            value={classForm.name}
            onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))}
          />
          <label htmlFor="class_no">班号</label>
          <input
            id="class_no"
            type="number"
            value={classForm.class_no}
            onChange={(event) => setClassForm((current) => ({ ...current, class_no: event.target.value }))}
          />
          <button type="submit">新增班级</button>
        </form>
        <ul>
          {classes.map((classItem) => (
            <li key={classItem.id}>
              <span>{classItem.name}</span>
              <span>{classItem.status}</span>
              <button type="button" onClick={() => void handleDisableClass(classItem.id)}>
                禁用班级
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="课程管理">
        <h3>课程</h3>
        <form onSubmit={(event) => void handleCourseSubmit(event)}>
          <label htmlFor="course_code">课程编码</label>
          <input
            id="course_code"
            value={courseForm.code}
            onChange={(event) => setCourseForm((current) => ({ ...current, code: event.target.value }))}
          />
          <label htmlFor="course_name">课程名称</label>
          <input
            id="course_name"
            value={courseForm.name}
            onChange={(event) => setCourseForm((current) => ({ ...current, name: event.target.value }))}
          />
          <label htmlFor="course_start_at">开始时间</label>
          <input
            id="course_start_at"
            type="datetime-local"
            value={courseForm.start_at}
            onChange={(event) => setCourseForm((current) => ({ ...current, start_at: event.target.value }))}
          />
          <label htmlFor="course_end_at">结束时间</label>
          <input
            id="course_end_at"
            type="datetime-local"
            value={courseForm.end_at}
            onChange={(event) => setCourseForm((current) => ({ ...current, end_at: event.target.value }))}
          />
          <label htmlFor="course_description">课程说明</label>
          <input
            id="course_description"
            value={courseForm.description}
            onChange={(event) => setCourseForm((current) => ({ ...current, description: event.target.value }))}
          />
          <button type="submit">新增课程</button>
        </form>
        <ul>
          {courses.map((course) => (
            <li key={course.id}>
              <span>{course.name}</span>
              <span>{course.start_at ?? ""}</span>
              <span>{course.end_at ?? ""}</span>
              <span>{course.status}</span>
              <button type="button" onClick={() => void handleDisableCourse(course.id)}>
                禁用课程
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function normalizeDateTimeValue(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}
