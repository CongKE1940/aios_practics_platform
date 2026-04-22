import { useMemo, useState } from "react";

import { createApiClient, type PracticeSessionDetail } from "@aios/api-sdk";

import { PracticePanel, type PracticePanelApi } from "./practice-panel";
import {
  PracticeHistoryPage,
  PracticeResultPage,
  PracticeSessionDetailPage,
  PracticeStateListPage,
  type PracticeReviewApi
} from "./practice-review-pages";

interface UserAppProps {
  practiceApi?: PracticePanelApi & PracticeReviewApi;
}

export function UserApp({ practiceApi }: UserAppProps) {
  const [selectedPath, setSelectedPath] = useState("/app/courses");
  const [pendingPracticeSession, setPendingPracticeSession] = useState<PracticeSessionDetail | null>(null);
  const currentPracticeApi = useMemo<(PracticePanelApi & PracticeReviewApi) | undefined>(() => {
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
        <button type="button" onClick={() => setSelectedPath("/app/practice/history")}>
          练题记录
        </button>
        <button type="button" onClick={() => setSelectedPath("/app/practice/wrong")}>
          错题本
        </button>
        <button type="button" onClick={() => setSelectedPath("/app/practice/mastered")}>
          熟题本
        </button>
        <button type="button" onClick={() => setSelectedPath("/app/practice/confused")}>
          疑惑题
        </button>
      </nav>
      <section aria-label="学习入口">
        {selectedPath === "/app/courses" ? <h2>我的课程</h2> : null}
        {selectedPath === "/app/practice" && currentPracticeApi ? (
          <PracticePanel
            api={currentPracticeApi}
            initialSession={pendingPracticeSession}
            onInitialSessionConsumed={() => setPendingPracticeSession(null)}
            onFinished={(summary) => setSelectedPath(`/app/practice/results/${summary.id}`)}
          />
        ) : null}
        {selectedPath.startsWith("/app/practice/results/") && currentPracticeApi ? (
          <PracticeResultPage
            api={currentPracticeApi}
            sessionId={getSessionId(selectedPath)}
            onNavigate={setSelectedPath}
            onPracticeCreated={setPendingPracticeSession}
          />
        ) : null}
        {selectedPath === "/app/practice/history" && currentPracticeApi ? (
          <PracticeHistoryPage api={currentPracticeApi} onNavigate={setSelectedPath} />
        ) : null}
        {selectedPath.startsWith("/app/practice/history/") && currentPracticeApi ? (
          <PracticeSessionDetailPage
            api={currentPracticeApi}
            sessionId={getSessionId(selectedPath)}
            onNavigate={setSelectedPath}
          />
        ) : null}
        {selectedPath === "/app/practice/wrong" && currentPracticeApi ? (
          <PracticeStateListPage
            api={currentPracticeApi}
            stateType="wrong"
            onNavigate={setSelectedPath}
            onPracticeCreated={setPendingPracticeSession}
          />
        ) : null}
        {selectedPath === "/app/practice/mastered" && currentPracticeApi ? (
          <PracticeStateListPage
            api={currentPracticeApi}
            stateType="mastered"
            onNavigate={setSelectedPath}
            onPracticeCreated={setPendingPracticeSession}
          />
        ) : null}
        {selectedPath === "/app/practice/confused" && currentPracticeApi ? (
          <PracticeStateListPage
            api={currentPracticeApi}
            stateType="confused"
            onNavigate={setSelectedPath}
            onPracticeCreated={setPendingPracticeSession}
          />
        ) : null}
      </section>
    </main>
  );
}

function getSessionId(path: string): number {
  const value = Number(path.split("/").pop());
  return Number.isFinite(value) ? value : 0;
}
