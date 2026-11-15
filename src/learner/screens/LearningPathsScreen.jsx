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
  // Starting a path should update the screen immediately; a Supabase refetch is
  // asynchronous and Realtime is not enabled in every deployment.
  const [startedPaths, setStartedPaths] = useState({});
  const paths = learningPathsQuery?.data || [];
  const pathEnrollments = pathEnrollmentsQuery?.data || [];
  const enrollmentByPath = useMemo(() => {
    const entries = new Map(
      pathEnrollments.map((entry) => [entry.path_id || entry.learning_path_id, entry])
    );
    for (const [pathId, enrollment] of Object.entries(startedPaths)) {
      if (!entries.has(pathId)) entries.set(pathId, enrollment);
    }
    return entries;
  }, [pathEnrollments, startedPaths]);
  const currentPathIds = useMemo(
    () => new Set([...enrollmentByPath.entries()]
      .filter(([, enrollment]) => enrollment.status === "in_progress")
      .map(([pathId]) => pathId)),
    [enrollmentByPath]
  );

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
      // Demo paths have no database rows; keep their selection in the same
      // per-learner local store used by enrollInLearningPath.
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
      showToast?.("Sign in to start a learning path.");
      return;
    }
    if (!path?.id || !path.courses?.length || busyPathId) return;

    const otherActivePaths = [...currentPathIds].filter((pathId) => pathId !== path.id);
    if (otherActivePaths.length) {
      const names = otherActivePaths
        .map((pathId) => paths.find((item) => item.id === pathId)?.title)
        .filter(Boolean);
      const prompt = names.length
        ? `Switch to “${path.title}”? This will leave your current path${names.length > 1 ? "s" : ""}: ${names.join(", ")}. Your course progress will be kept.`
        : `Switch to “${path.title}”? Your current path enrollment will end, but your course progress will be kept.`;
      if (typeof window !== "undefined" && !window.confirm(prompt)) return;
    }

    setBusyPathId(path.id);
    try {
      // Enroll in the new path first so a failure to start it never removes
      // access to the learner's existing path.
      const enrollment = await enrollInLearningPath(userId, path.id);
      const leaving = [];
      for (const oldPathId of otherActivePaths) {
        try {
          await removePathEnrollment(oldPathId);
          leaving.push(oldPathId);
        } catch (error) {
          showToast?.(error?.message || "The new path started, but the previous path could not be closed.");
        }
      }
      setStartedPaths((previous) => {
        const next = { ...previous, [path.id]: enrollment || {
          user_id: userId, path_id: path.id, status: "in_progress", current_course_index: 0,
        } };
        leaving.forEach((pathId) => { delete next[pathId]; });
        return next;
      });
      pathEnrollmentsQuery?.refetch?.();
      showToast?.(otherActivePaths.length ? `Switched to ${path.title}.` : `You started ${path.title}.`);
    } catch (error) {
      showToast?.(error?.message || "Could not start this learning path.");
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
        sub="Choose a published journey, start it, and track your course-by-course progress."
        onBack={back}
        right={<Tag><Compass size={13} /> {paths.length} available</Tag>}
      />

      <div className="tai-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
          const requiredSteps = progress.steps.filter((step) => step.isRequired !== false);
          const completedRequired = requiredSteps.filter((step) => step.isCompleted).length;
          const percent = requiredSteps.length ? Math.round((completedRequired / requiredSteps.length) * 100) : 0;
          const nextStep = progress.nextStep;
          const isComplete = pathEnrollment?.status === "completed" || (
            requiredSteps.length > 0 && completedRequired === requiredSteps.length
          );
          const canSwitchToPath = !isEnrolled && currentPathIds.size > 0;

          return (
            <article key={path.id} className="tai-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="tai-row tai-between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <div className="tai-row tai-gap8" style={{ flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: 17, overflowWrap: "anywhere" }}>{path.title || "Learning Path"}</h2>
                    {isEnrolled && <Tag tone={isComplete ? "success" : undefined}>{isComplete ? "Completed" : "In progress"}</Tag>}
                  </div>
                  {path.description && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.45 }}>{path.description}</p>}
                  <div style={{ marginTop: 7, color: "var(--text-3)", fontSize: 11.5, textTransform: "capitalize" }}>
                    {path.level || "All levels"}{path.category ? ` · ${path.category}` : ""} · {progress.total} courses · {progress.totalHours} hours
                  </div>
                </div>
                {!isEnrolled ? (
                  <button
                    className="tai-btn tai-btn-primary"
                    disabled={!userId || !progress.total || busyPathId !== null}
                    onClick={() => startPath(path)}
                    aria-label={`${canSwitchToPath ? "Switch to" : "Start"} ${path.title || "learning path"}`}
                  >
                    {canSwitchToPath ? <Repeat size={14} /> : <Play size={14} />}
                    {busyPathId === path.id ? "Starting…" : canSwitchToPath ? "Switch path" : "Start path"}
                  </button>
                ) : (
                  <button
                    className="tai-btn tai-btn-primary"
                    disabled={!nextStep || busyPathId !== null}
                    onClick={() => nextStep && openStep(path, nextStep, progress.steps.indexOf(nextStep), progress)}
                  >
                    {isComplete ? "Path complete" : "Continue path"}
                    {!isComplete && nextStep && <ArrowRight size={14} />}
                  </button>
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
                        <span style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}>Start path to unlock</span>
                      ) : step.isUnlocked ? (
                        <button className="tai-btn tai-btn-outline tai-btn-sm" disabled={busyPathId !== null} onClick={() => openStep(path, step, index, progress)}>
                          <BookOpen size={13} /> {step.isCompleted ? "Review" : step.isEnrolled ? "Continue" : "Open course"}
                        </button>
                      ) : (
                        <span className="tai-row tai-gap6" style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}><Lock size={13} /> Locked</span>
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
