import { useMemo, useState } from "react";

import { createApiClient } from "@aios/api-sdk";

import { PracticePanel, type PracticePanelApi } from "./practice-panel";

interface UserAppProps {
  practiceApi?: PracticePanelApi;
}

export function UserApp({ practiceApi }: UserAppProps) {
  const [selectedPath, setSelectedPath] = useState("/app/courses");
  const currentPracticeApi = useMemo<PracticePanelApi | undefined>(() => {
    if (practiceApi) {
      return practiceApi;
    }
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:18081/api/v1";
    return createApiClient({ baseUrl });
  }, [practiceApi]);

  return (
    <main>
      <h1>AIOS 学生端</h1>
      <nav aria-label="学习菜单">
        <button type="button" onClick={() => setSelectedPath("/app/courses")}>
          我的课程
        </button>
        <button type="button" onClick={() => setSelectedPath("/app/practice")}>
          练题中心
        </button>
      </nav>
      <section aria-label="学习入口">
        {selectedPath === "/app/courses" ? <h2>我的课程</h2> : null}
        {selectedPath === "/app/practice" && currentPracticeApi ? <PracticePanel api={currentPracticeApi} /> : null}
      </section>
    </main>
  );
}
