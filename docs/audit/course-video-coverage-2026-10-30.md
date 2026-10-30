# Course video coverage — 30 October 2026

The production database now contains 56 courses and 144 lessons. Every course has at least one lesson video, and every lesson has a playable YouTube video URL. Seven repaired draft courses were published; the two unrelated drafts that already had videos retain their prior status.

## Changes

- Replaced or filled 35 lesson video sources, covering blank URLs, MEGA folder pages, a playlist-only URL, an Alison webpage, and a React video with embedding disabled.
- Added one video lesson to each of three empty courses: Advanced Project Management, Data Science Fundamentals and Venture capital.
- Preserved existing lesson IDs, written instructions, assessments, assignments, enrollments and progress. No lesson rows were deleted.
- Updated lesson and course duration metadata from the actual provider durations.
- Onboarding retains the written Train AI steps and uses general learner guidance. Train AI branding remains around the player, and YouTube retains its original publisher attribution. These are not represented as recordings of the Train AI interface.

## Verification

- Used the existing server-side YouTube connection without exposing its API key. Queried all 92 unique existing YouTube IDs and verified replacement metadata against public/processed/embeddable status, duration, age restrictions and Nigeria availability.
- Retained the existing accessible, embeddable unlisted entrepreneurship video; it was not treated as missing merely because it is unlisted.
- All newly selected videos passed the public-video checks. Topic relevance was assessed from publisher titles and descriptions; the entire videos were not watched.
- Applied changes in a transaction with checks against the reviewed source URLs. A first attempt rolled back because displayed SQL results collapsed repeated spaces in one original URL; the retry compared URLs after trimming only surrounding whitespace.
- Final database result: 56 total courses, 54 published courses, 144 lessons, zero courses without videos, zero lessons without videos, zero MEGA-folder/playlist/Alison-page sources.
- Confirmed real MongoDB and AI Fundamentals playback in the production player component using a local review page. MongoDB advanced beyond 22 seconds with the actual 5-minute duration; AI Fundamentals advanced beyond 19 seconds with the actual 10-minute duration.
- 17 targeted provider, authorization, source parsing and lesson preservation checks passed.
- The privileged maintenance endpoint is read-only, accepts only the current project’s server credentials and never returns them. Public and forged credentials are denied.

## Republished courses

- Advanced React Development
- AI Fundamentals
- Data Literacy for Teams
- Data Science Fundamentals
- Leadership Essentials
- Venture capital
- Workplace Compliance 101

## Evidence

- `course-videos/coverage-confirmed.png`
- `course-videos/mongodb-playback-confirmed.png`
- `course-videos/ai-fundamentals-playback-confirmed.png`
- `course-video-coverage-2026-10-30.json` records selected YouTube URLs, publisher attribution and actual durations.

This is a point-in-time check. YouTube owners can remove videos or change embedding restrictions later.
