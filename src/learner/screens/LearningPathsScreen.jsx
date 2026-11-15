import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Compass, Lock, Map, Play, Repeat } from "lucide-react";
import { ProgressBar, Tag, TopBar } from "../components/LearnerUI.jsx";
import {
  resolvePathProgress, enrollInLearningPath, leaveLearningPath, syncLearningPathProgress,
} from "../../lib/api/learner.js";
import { isRealDatabaseId } from "../../lib/mockDataManager.js";

export function LearningPathsScreen({
  userId,
  learningPathsQuery,
  pathEnrollmentsQuery,
  courseEnrollments = [],
  push,
  back,
  showToast,
}) {
  const [busyPathId, setBusyPathId] = useState(null);
  const [startedPaths, setStartedPaths] = useState({});
  const [leftPaths, setLeftPaths] = useState(() => new Set());
  const paths = learningPathsQuery?.data || [];
  const pathEnrollments = pathEnrollmentsQuery?.data || [];
  const enrollmentByPath = useMemo(() => {
    const entries = new Map(
      pathEnrollments
        .map((entry) => [entry.path_id || entry.learning_path_id, entry])
        .filter(([pathId]) => !leftPaths.has(pathId))
    );
    for (const [pathId, enrollment] of Object.entries(startedPaths)) {
      if (!entries.has(pathId)) entries.set(pathId, enrollment);
    }
    return entries;
  }, [pathEnrollments, startedPaths, leftPaths]);
  const currentPathIds = useMemo(
    () => new Set([...enrollmentByPath.entries()]
      .filter(([, enrollment]) => enrollment.status === "in_progress")
      .map(([pathId]) => pathId)),
    [enrollmentByPath]
  );
  const currentPath = paths.find((path) => currentPathIds.has(path.id));

  useEffect(() => {
    if (!userId || learningPathsQuery?.loading || pathEnrollmentsQuery?.loading) return undefined;
    let cancelled = false;

    async function syncProgress() {
      for (const path of paths) {
        const enrollment = enrollmentByPath.get(path.id);
        if (!enrollment || enrollment.status === "completed") continue;
        const progress = resolvePathProgress(path, courseEnrollments);
        const requiredSteps = progress.steps.filter((step) => step.isRequired !== false);
        const isComplete = requiredSteps.length > 0 && requiredSteps.every((step) => step.isCompleted);
        const nextStepIndex = progress.nextStep ? progress.steps.indexOf(progress.nextStep) : progress.steps.length;
        const currentIndex = Number(enrollment.current_course_index) || 0;
        if (!isComplete && nextStepIndex === currentIndex) continue;

        await syncLearningPathProgress(userId, path.id, {
          currentIndex: nextStepIndex,
          isComplete,
        });
        if (cancelled) return;
        pathEnrollmentsQuery?.refetch?.();
      }
    }

    syncProgress().catch((error) => {
      if (!cancelled) showToast?.(error?.message || "Could not update learning-path progress.");
    });
    return () => { cancelled = true; };
  }, [
    userId, paths, courseEnrollments, enrollmentByPath,
    learningPathsQuery?.loading, pathEnrollmentsQuery?.loading,
    pathEnrollmentsQuery?.refetch, showToast,
  ]);

  async function removePathEnrollment(pathId) {
    if (!isRealDatabaseId(pathId)) {
      const key = `trainai_path_enrollments_${userId}`;
      try {
        const entries = JSON.parse(localStorage.getItem(key) || "[]");
        localStorage.setItem(key, JSON.stringify(
          entries.filter((entry) => (entry.path_id || entry.id) !== pathId)
        ));
      } catch (error) {
        throw new Error("Could not change your demo learning path.", { cause: error });
      }
      return;
    }
    const result = await leaveLearningPath(userId, pathId);
    if (!result?.success) throw new Error(result?.error || "Could not leave your current learning path.");
  }

  async function startPath(path) {
    if (!userId) {
      showToast?.("Sign in to choose a learning path.");
      return;
    }
    if (!path?.id || !path.courses?.length || busyPathId) return;

    const otherActivePaths = [...currentPathIds].filter((pathId) => pathId !== path.id);
    setBusyPathId(path.id);
    try {
      // Start the replacement first. If it fails, leave the current path alone.
      const enrollment = await enrollInLearningPath(userId, path.id);
      setStartedPaths((previous) => ({
        ...previous,
        [path.id]: enrollment || {
          user_id: userId, path_id: path.id, status: "in_progress", current_course_index: 0,
        },
      }));

      const removedPathIds = [];
      const failedToLeave = [];
      for (const oldPathId of otherActivePaths) {
        try {
          await removePathEnrollment(oldPathId);
          removedPathIds.push(oldPathId);
        } catch (error) {
          failedToLeave.push(error?.message || "Could not leave your previous path.");
        }
      }
      if (removedPathIds.length) {
        setLeftPaths((previous) => new Set([...previous, ...removedPathIds]));
        setStartedPaths((previous) => {
          const next = { ...previous };
          removedPathIds.forEach((pathId) => { delete next[pathId]; });
          return next;
        });
      }

      pathEnrollmentsQuery?.refetch?.();
      if (failedToLeave.length) {
        showToast?.(`Started ${path.title}, but your previous path could not be closed. ${failedToLeave[0]}`);
      } else {
        showToast?.(otherActivePaths.length ? `Your path is now ${path.title}. Your course progress is saved.` : `Your path is now ${path.title}.`);
      }
    } catch (error) {
      showToast?.(error?.message || "Could not choose this learning path.");
    } finally {
      setBusyPathId(null);
    }
  }

  async function openStep(path, step, index, progress) {
    if (!userId || !step?.isUnlocked) return;
    try {
      const requiredSteps = progress.steps.filter((item) => item.isRequired !== false);
      const allRequiredComplete = requiredSteps.length > 0 && requiredSteps.every((item) => item.isCompleted);
      await syncLearningPathProgress(userId, path.id, {
        currentIndex: index,
        isComplete: allRequiredComplete,
      });
      pathEnrollmentsQuery?.refetch?.();
      push?.("courseDetail", { id: step.id, learningPathId: path.id });
    } catch (error) {
      showToast?.(error?.message || "Could not open this learning-path course.");
    }
  }

  const loading = !!(learningPathsQuery?.loading || pathEnrollmentsQuery?.loading);
  const error = learningPathsQuery?.error || pathEnrollmentsQuery?.error;

  return (
    <div className="tai-fade-in">
      <TopBar
        title="Learning Paths"
        sub="Choose the journey that fits your goals. You can change paths anytime."
        onBack={back}
        right={<Tag><Compass size={13} /> {paths.length} available</Tag>}
      />

      <div className="tai-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!loading && !error && paths.length > 0 && (
          <section className="tai-card" aria-label="How to choose a learning path" style={{ padding: 16, borderColor: "var(--primary)" }}>
            <div className="tai-row tai-gap10" style={{ alignItems: "flex-start" }}>
              <Compass size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {currentPath ? `Your current path: ${currentPath.title}` : "Choose your learning path"}
                </div>
                <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>
                  {currentPath
                    ? "Continue your journey, or choose another path below. Switching keeps your course progress."
                    : "Choose one path to get started. You can switch to another path whenever your goals change."}
                </div>
              </div>
            </div>
          </section>
        )}

        {loading && <div className="tai-card" role="status" style={{ padding: 20 }}>Loading learning paths…</div>}
        {error && (
          <div className="tai-card" role="alert" style={{ padding: 18 }}>
            <div style={{ color: "var(--danger)", marginBottom: 10 }}>Learning paths could not be loaded: {error}</div>
            <button className="tai-btn tai-btn-outline" onClick={() => {
              learningPathsQuery?.refetch?.();
              pathEnrollmentsQuery?.refetch?.();
            }}>Retry</button>
          </div>
        )}
        {!loading && !error && paths.length === 0 && (
          <div className="tai-card" style={{ padding: 24, textAlign: "center" }}>
            <Map size={28} color="var(--primary)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>No published learning paths yet</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 5 }}>
              Published paths from your organization will appear here. You can browse available courses in the meantime.
            </div>
            <button className="tai-btn tai-btn-primary" style={{ margin: "16px auto 0" }} onClick={() => push?.("courses")}>
              Browse courses <ArrowRight size={14} />
            </button>
          </div>
        )}

        {!loading && !error && paths.map((path) => {
          const pathEnrollment = enrollmentByPath.get(path.id);
          const progress = resolvePathProgress(path, courseEnrollments);
          const isEnrolled = !!pathEnrollment;
          const isCurrent = currentPathIds.has(path.id);
          const requiredSteps = progress.steps.filter((step) => step.isRequired !== false);
          const completedRequired = requiredSteps.filter((step) => step.isCompleted).length;
          const percent = requiredSteps.length ? Math.round((completedRequired / requiredSteps.length) * 100) : 0;
          const nextStep = progress.nextStep;
          const isComplete = pathEnrollment?.status === "completed" || (
            requiredSteps.length > 0 && completedRequired === requiredSteps.length
          );
          const canSwitchToPath = !isCurrent && !isComplete;

          return (
            <article key={path.id} className="tai-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, borderColor: isCurrent ? "var(--primary)" : undefined }}>
              <div className="tai-row tai-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <div className="tai-row tai-gap8" style={{ flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: 17, overflowWrap: "anywhere" }}>{path.title || "Learning Path"}</h2>
                    {isCurrent && <Tag tone="success">Your path</Tag>}
                    {isEnrolled && !isCurrent && <Tag tone={isComplete ? "success" : undefined}>{isComplete ? "Completed" : "Paused"}</Tag>}
                  </div>
                  {path.description && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.45 }}>{path.description}</p>}
                  <div style={{ marginTop: 7, color: "var(--text-3)", fontSize: 11.5, textTransform: "capitalize" }}>
                    {path.level || "All levels"}{path.category ? ` · ${path.category}` : ""} · {progress.total} courses · {progress.totalHours} hours
                  </div>
                </div>
                {isCurrent ? (
                  <button className="tai-btn tai-btn-primary" disabled={!nextStep || busyPathId !== null} onClick={() => nextStep && openStep(path, nextStep, progress.steps.indexOf(nextStep), progress)}>
                    {isComplete ? "Path complete" : "Continue my path"}
                    {!isComplete && nextStep && <ArrowRight size={14} />}
                  </button>
                ) : canSwitchToPath ? (
                  <button
                    className="tai-btn tai-btn-primary"
                    disabled={!userId || !progress.total || busyPathId !== null}
                    onClick={() => startPath(path)}
                    aria-label={`${currentPath ? "Switch to" : "Choose"} ${path.title || "learning path"}`}
                  >
                    {busyPathId === path.id ? "Switching…" : currentPath ? "Switch to this path" : "Choose this path"}
                    {!busyPathId && <ArrowRight size={14} />}
                  </button>
                ) : isComplete ? (
                  <Tag tone="success">Completed</Tag>
                ) : (
                  <Tag>Available</Tag>
                )}
              </div>

              {isEnrolled && (
                <div>
                  <div className="tai-row tai-between" style={{ fontSize: 11.5, color: "var(--text-2)", marginBottom: 6 }}>
                    <span>{completedRequired} of {requiredSteps.length} required courses complete</span>
                    <span>{percent}%</span>
                  </div>
                  <ProgressBar value={percent} />
                </div>
              )}

              {progress.steps.length === 0 ? (
                <div className="tai-empty" style={{ padding: 16 }}>This path has no published courses yet. Please check back later.</div>
              ) : (
                <div className="tai-col tai-gap8">
                  {progress.steps.map((step, index) => (
                    <div key={step.pathCourseId || step.id} className="tai-row tai-between" style={{ gap: 12, padding: "10px 12px", borderRadius: 9, background: "var(--surface-2)", flexWrap: "wrap" }}>
                      <div className="tai-row tai-gap10" style={{ minWidth: 0, flex: "1 1 220px" }}>
                        <div style={{ width: 25, height: 25, borderRadius: "50%", background: step.isCompleted ? "var(--success-bg)" : "var(--surface)", color: step.isCompleted ? "var(--success)" : "var(--text-2)", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 11, fontWeight: 700 }}>
                          {step.isCompleted ? <CheckCircle2 size={15} /> : index + 1}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 650, overflowWrap: "anywhere" }}>{step.title}</div>
                          <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 2 }}>
                            {step.hours}h{step.isRequired === false ? " · Optional" : " · Required"}{step.progress > 0 && !step.isCompleted ? ` · ${step.progress}% complete` : ""}
                          </div>
                        </div>
                      </div>
                      {!isEnrolled ? (
                        <span style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}>Choose path to begin</span>
                      ) : isCurrent && step.isUnlocked ? (
                        <button className="tai-btn tai-btn-outline tai-btn-sm" disabled={busyPathId !== null} onClick={() => openStep(path, step, index, progress)}>
                          <BookOpen size={13} /> {step.isCompleted ? "Review" : step.isEnrolled ? "Continue" : "Open course"}
                        </button>
                      ) : !step.isUnlocked ? (
                        <span className="tai-row tai-gap6" style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}><Lock size={13} /> Locked</span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}>Switch to this path to continue</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
