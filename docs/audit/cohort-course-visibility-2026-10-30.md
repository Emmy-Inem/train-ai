# Cohort course visibility — 2026-10-30

Individual assignments now appear in the learner's Assigned to Me list and their cohort Courses tab. Administrators see the union of shared and individual curriculum with explicit scope labels. Individual assignments never remove existing shared curriculum.

Production was still running an older assignment RPC that inserted a shared curriculum row even for individual assignments. The owner confirmed that CAP learners must retain their individual course assignments. The repair retains all historical rows, marks the eight legacy CAP rows as individual scope, and leaves FLIP's shared curriculum unchanged. No learner was given all eight CAP courses.

The new database triggers ensure individual assignments and shared curriculum create enrollments, including shared courses for future cohort members. Existing enrollment progress is preserved through ON CONFLICT DO NOTHING. Six missing shared enrollments were added; all 51 individual assignment rows remain. The hash of the 847 existing enrollment progress values is unchanged.

Learner queries fetch only their own individual assignments plus explicitly shared curriculum, then load full course metadata. Course-detail IDs no longer become cohort IDs. Assigned metadata enters the central course map so course cards and syllabus links resolve consistently. Assignment refresh covers Realtime, browser focus, and a one-minute fallback. Loading and error states are visible.

Validation:
- All 47 automated tests passed, including real PostgreSQL-compatible scope/enrollment/progress regression tests and the actual API loader against scoped fixtures.
- Production permissions were checked for all 42 learner/cohort membership pairs. All 61 expected assignments had accessible published course metadata; every comparison passed. Checks ran in a rolled-back transaction with the corresponding authenticated learner identity.
- Zero missing individual or shared enrollments remain.
- Production build passed.
- Browser checked the actual CohortScreen and CoursesScreen components with labeled local sample data, matching course titles/progress and verifying syllabus navigation. No live learner password or session was used.

Evidence: cohort-assignments/production-access-checks.png, cohort-assignments/cohort-courses-preview.png, cohort-assignments/learner-courses-preview.png. Local preview images are sample UI verification, not screenshots of a learner's production account. Private pre/post repair data is ignored under .generated/.
