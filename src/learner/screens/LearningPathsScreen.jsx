import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Compass, Lock, Map, Play } from "lucide-react";
import { ProgressBar, Tag, TopBar } from "../components/LearnerUI.jsx";
import { resolvePathProgress, enrollInLearningPath, syncLearningPathProgress } from "../../lib/api/learner.js";

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
  const paths = learningPathsQuery?.data || [];
  const pathEnrollments = pathEnrollmentsQuery?.data || [];
  const enrollmentByPath = useMemo(
    () => new Map(pathEnrollments.map((entry) => [entry.path_id || entry.learning_path_id, entry])),
    [pathEnrollments]
  );

  useEffect(() => {
    if (!userId || learningPathsQuery?.loading || pathEnrollmentsQuery?.loading) return;
    let cancelled = false;
    (async () => {
      for (const path of paths) {
        const enrollment = enrollmentByPath.get(path.id);
        if (!enrollment || enrollment.status === "completed") continue;
        const progress = resolvePathProgress(path, courseEnrollments);
        const requiredSteps = progress.steps.filter((step) => step.isRequired !== false);
        const isComplete = requiredSteps.length > 0 && requiredSteps.every((step) => step.isCompleted);
        const nextIndex = progress.nextStep ? progress.steps.indexOf(progress.nextStep) : progress.steps.length;
        const currentIndex = Number(enrollment.current_course_index) || 0;
        if (!isComplete && nextIndex === currentIndex) continue;
        await syncLearningPathProgress(userId, path.id, { currentIndex: nextIndex, isComplete });
        if (cancelled) return;
        pathEnrollmentsQuery?.refetch?.();
      }
    })().catch((error) => showToast?.(error?.message || "Could not update pathway progress."));
    return () => { cancelled = true; };
  }, [userId, paths, courseEnrollments, enrollmentByPath, learningPathsQuery?.loading, pathEnrollmentsQuery?.loading, pathEnrollmentsQuery?.refetch, showToast]);

  async function startPath(path) {
    if (!userId || !path?.id) return;
    setBusyPathId(path.id);
    try {
      await enrollInLearningPath(userId, path.id);
      await pathEnrollmentsQuery?.refetch?.();
      showToast?.(`You started ${path.title}.`);
    } catch (error) {
      showToast?.(error?.message || "Could not start this learning path.");
    } finally {
      setBusyPathId(null);
    }
  }

  async function openStep(path, step, index, progress) {
    if (!step.isUnlocked) return;
    const requiredSteps = progress.steps.filter((item) => item.isRequired !== false);
    const allRequiredComplete = requiredSteps.length > 0 && requiredSteps.every((item) => item.isCompleted);
    try {
      await syncLearningPathProgress(userId, path.id, {
        currentIndex: index,
        isComplete: allRequiredComplete,
      });
      push?.("courseDetail", { id: step.id });
    } catch (error) {
      showToast?.(error?.message || "Could not open this pathway step.");
    }
  }

  const loading = learningPathsQuery?.loading || pathEnrollmentsQuery?.loading;
  const error = learningPathsQuery?.error || pathEnrollmentsQuery?.error;

  return (
    <div className="tai-fade-in">
      <TopBar
        title="Learning Paths"
        sub="Follow a guided sequence, unlock each next course, and track your progress."
        onBack={back}
        right={<Tag><Compass size={13} /> {paths.length} available</Tag>}
      />

      <div className="tai-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading && <div className="tai-card" style={{ padding: 20 }}>Loading your learning paths…</div>}
        {error && (
          <div className="tai-card" role="alert" style={{ padding: 18 }}>
            <div style={{ color: "var(--danger)", marginBottom: 10 }}>Learning paths could not be loaded: {error}</div>
            <button className="tai-btn tai-btn-outline" onClick={() => { learningPathsQuery?.refetch?.(); pathEnrollmentsQuery?.refetch?.(); }}>Retry</button>
          </div>
        )}
        {!loading && !error && paths.length === 0 && (
          <div className="tai-card" style={{ padding: 24, textAlign: "center" }}>
            <Map size={28} color="var(--primary)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>No published learning paths yet</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 5 }}>Your organization’s published paths will appear here.</div>
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
          const resumeIndex = Number(pathEnrollment?.current_course_index) || 0;

          return (
            <article key={path.id} className="tai-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="tai-row tai-between" style={{ gap: 12, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="tai-row tai-gap8" style={{ flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: 17, overflowWrap: "anywhere" }}>{path.title}</h2>
                    {isEnrolled && <Tag tone={pathEnrollment.status === "completed" ? "success" : undefined}>{pathEnrollment.status === "completed" ? "Completed" : "In progress"}</Tag>}
                  </div>
                  {path.description && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.45 }}>{path.description}</p>}
                  <div style={{ marginTop: 7, color: "var(--text-3)", fontSize: 11.5, textTransform: "capitalize" }}>
                    {path.level || "All levels"}{path.category ? ` · ${path.category}` : ""} · {progress.total} courses · {progress.totalHours} hours
                  </div>
                </div>
                {!isEnrolled ? (
                  <button className="tai-btn tai-btn-primary" disabled={busyPathId === path.id} onClick={() => startPath(path)}>
                    <Play size={14} /> {busyPathId === path.id ? "Starting…" : "Start path"}
                  </button>
                ) : (
                  <button className="tai-btn tai-btn-outline" disabled={!nextStep} onClick={() => nextStep && openStep(path, nextStep, progress.steps.indexOf(nextStep), progress)}>
                    {nextStep ? "Continue" : "Path complete"} {nextStep && <ArrowRight size={14} />}
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

              <div className="tai-col tai-gap8">
                {progress.steps.map((step, index) => (
                  <div key={step.pathCourseId || step.id} className="tai-row tai-between" style={{ gap: 12, padding: "10px 12px", borderRadius: 9, background: "var(--surface-2)" }}>
                    <div className="tai-row tai-gap10" style={{ minWidth: 0 }}>
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
                      <span style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}>Start path to open</span>
                    ) : step.isUnlocked ? (
                      <button className="tai-btn tai-btn-outline tai-btn-sm" onClick={() => openStep(path, step, index, progress)}>
                        <BookOpen size={13} /> {step.isCompleted ? "Review" : step.isEnrolled ? "Continue" : "Open course"}
                      </button>
                    ) : (
                      <span className="tai-row tai-gap6" style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}><Lock size={13} /> Locked</span>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
